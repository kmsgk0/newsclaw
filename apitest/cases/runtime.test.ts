import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import { fork, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdir,writeFile } from 'node:fs/promises';
import { createAPIEnvironment } from '../fixtures/environment.js';
import { createHandlers,startWorker } from '../../src/server/worker.js';
import type { TaskRecord } from '../../src/server/runtime/tasks.js';
import type { Config } from '../../src/server/config.js';

async function until(check:()=>Promise<boolean>,timeout=15000) {const end=Date.now()+timeout;while(Date.now()<end){if(await check())return;await delay(30);}assert.fail('Expected runtime state not reached');}
const evidence:Record<string,unknown>={};
async function save(){await mkdir(process.env.VERIFICATION_DIR ?? '.local/verification',{recursive:true});await writeFile(`${process.env.VERIFICATION_DIR ?? '.local/verification'}/async-results.json`,JSON.stringify(evidence,null,2)+'\n');}
async function submit(base:string,source:string,token:string,operationId:string){const start=performance.now();const response=await fetch(`${base}/api/v1/admin/sources/${source}/collect`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({operationId})});const value=await response.json() as {code:string;data:{taskId:string;status:string;statusUrl:string;result?:unknown}};return {status:response.status,value,ms:performance.now()-start};}

test('OPS-04 API submission does not wait for processing at two latency levels, 20 distinct operations each',async()=>{
  const env=await createAPIEnvironment({seed:false});
  try{
    const session=await env.auth.login({username:env.admin.username,password:'correct-password'});const measurements=[];
    for(const delayMs of [200,600]){
      env.state.delayMs=delayMs;
      const samples=[];
      for(let i=0;i<20;i++){
        const result=await submit(env.baseUrl,env.source.id,session.accessToken,`latency-${delayMs}-${i}`);
        assert.equal(result.status,202);assert.equal(result.value.data.status,'pending');assert.equal(result.value.data.result,undefined);samples.push(result.ms);
      }
      const task=await env.ctx.tasks.submit(null,'collect',{sourceId:env.source.id},`processing-${delayMs}`);
      await env.ctx.db.query('UPDATE news_sources SET url=$2 WHERE id=$1',[env.source.id,`${env.upstreamUrl}/feed/${randomUUID()}`]);
      const started=performance.now();await env.ctx.tasks.execute({taskId:task.taskId,generation:1},createHandlers(env.ctx));const fullMs=performance.now()-started;
      const sorted=[...samples].sort((a,b)=>a-b),p95=sorted[Math.ceil(sorted.length*.95)-1];
      assert.ok(p95<fullMs*.5,`P95 ${p95} must stay below half of processing ${fullMs}`);
      measurements.push({upstreamDelayMs:delayMs,samplesMs:samples,p95Ms:p95,processingMs:fullMs});
    }
    assert.ok(measurements[1].p95Ms<Math.max(100,measurements[0].p95Ms*2));
    evidence.latency={measurements,threshold:'submission P95 < 50% of full handler time; higher-delay P95 < max(100ms, 2x lower-delay P95)',requests:40};await save();
  }finally{await env.cleanup();}
});

test('OPS-02/03 stopped worker recovery, concurrent duplicate requests and receive transaction rollback',async()=>{
  const env=await createAPIEnvironment({seed:false});let runtime:Awaited<ReturnType<typeof startWorker>>|undefined;
  try{
    const session=await env.auth.login({username:env.admin.username,password:'correct-password'});
    const duplicates=await Promise.all(Array.from({length:6},()=>submit(env.baseUrl,env.source.id,session.accessToken,'same-operation')));
    assert.ok(duplicates.every(x=>x.status===202));assert.equal(new Set(duplicates.map(x=>x.value.data.taskId)).size,1);
    const taskId=duplicates[0].value.data.taskId;
    assert.equal((await env.ctx.db.one<TaskRecord>('SELECT * FROM tasks WHERE id=$1',[taskId]))!.attempts,0);
    runtime=await startWorker(env.ctx,{scheduling:false,intervalMs:30});
    await until(async()=> (await env.ctx.db.one<TaskRecord>('SELECT * FROM tasks WHERE id=$1',[taskId]))!.status==='succeeded');
    assert.equal((await env.ctx.db.query('SELECT id FROM news')).length,1);
    const calls=env.state.modelCalls;
    await env.ctx.tasks.queue.add('business',{taskId,generation:1},{jobId:randomUUID()});await delay(120);
    assert.equal((await env.ctx.db.query('SELECT id FROM news')).length,1);assert.equal(env.state.modelCalls,calls);
    await runtime.close();runtime=undefined;
    await env.ctx.db.query("CREATE FUNCTION reject_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected outbox failure'; END $$");
    await env.ctx.db.query('CREATE TRIGGER reject_outbox BEFORE INSERT ON task_outbox FOR EACH ROW EXECUTE FUNCTION reject_outbox()');
    const failed=await submit(env.baseUrl,env.source.id,session.accessToken,'rollback-operation');assert.equal(failed.status,500);
    assert.equal((await env.ctx.db.query("SELECT id FROM tasks WHERE operation_id='rollback-operation'")).length,0);
    evidence.recovery={duplicateRequests:6,distinctTasks:1,newsRecords:1,modelCallsAfterDuplicateDelivery:env.state.modelCalls,receiveRollbackHttp:500,orphanTasks:0};await save();
  }finally{await runtime?.close();await env.cleanup();}
});

function childConfig(config:Config){return {...process.env,NODE_ENV:'test',DATABASE_URL:config.databaseUrl,REDIS_URL:config.redisUrl,QUEUE_PREFIX:config.queuePrefix,CHAT_BASE_URL:config.chatBaseUrl,CHAT_API_KEY:'fixture',CHAT_MODEL:'fixture',EMBEDDING_BASE_URL:config.embeddingBaseUrl,EMBEDDING_API_KEY:'fixture',EMBEDDING_MODEL:'fixture',EMBEDDING_DIM:'3',SOURCE_ALLOWED_HOSTS:'127.0.0.1'};}
function spawnWorker(config:Config,pause=false){return fork('apitest/fixtures/worker.ts',[],{execArgv:['--import','tsx'],env:{...childConfig(config),FIXTURE_PAUSE_AFTER_COMMIT:String(pause)},stdio:['ignore','ignore','ignore','ipc']});}
async function message(child:ChildProcess,event:string){await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>{cleanup();reject(new Error(`Worker did not emit ${event}`));},15000);const listener=(value:unknown)=>{if((value as {event?:string})?.event===event){cleanup();resolve();}};const cleanup=()=>{clearTimeout(timer);child.off('message',listener);};child.on('message',listener);});}
async function stop(child:ChildProcess|undefined,signal:NodeJS.Signals='SIGTERM'){if(!child||child.exitCode!==null||child.signalCode!==null)return;const exited=once(child,'exit');child.kill(signal);await exited;}

test('OPS-02 committed output survives worker death before queue acknowledgment and is not generated again',async()=>{
  const env=await createAPIEnvironment({seed:false});let child:ChildProcess|undefined;
  try{
    child=spawnWorker(env.ctx.config,true);await message(child,'ready');
    const committed=message(child,'committed');
    const task=await env.ctx.tasks.submit(null,'collect',{sourceId:env.source.id},'crash-before-ack');
    await committed;const calls=env.state.modelCalls;
    assert.equal((await env.ctx.db.one<TaskRecord>('SELECT * FROM tasks WHERE id=$1',[task.taskId]))!.status,'succeeded');
    await stop(child,'SIGKILL');child=spawnWorker(env.ctx.config);await message(child,'ready');
    await until(async()=> (await env.ctx.tasks.queue.getJob(`${task.taskId}-1`))?.getState().then(x=>x==='completed')??false,15000);
    assert.equal(env.state.modelCalls,calls);assert.equal((await env.ctx.db.query('SELECT id FROM news')).length,1);
    evidence.ackRecovery={signal:'SIGKILL',taskStatus:'succeeded',queueStatus:'completed',newsRecords:1,modelCallsBefore:calls,modelCallsAfter:env.state.modelCalls};await save();
  }finally{await stop(child);await env.cleanup();}
});
