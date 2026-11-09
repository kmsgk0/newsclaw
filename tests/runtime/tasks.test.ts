import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import { makeTestContext } from '../support/helpers.js';
import { AuthService } from '../../src/server/modules/account/service.js';
import { createBaseApp } from '../../src/server/base-app.js';
import { AppError } from '../../src/server/errors.js';
import type { TaskHandler, TaskHandlers, TaskRecord } from '../../src/server/runtime/tasks.js';

async function waitFor(check:()=>Promise<boolean>,timeout=8000) {
  const end=Date.now()+timeout;
  while(Date.now()<end){if(await check())return;await delay(20);}
  assert.fail('Expected task state was not reached');
}
const handlersFor=(handler:TaskHandler):TaskHandlers=>({collect:handler,daily:handler,journal:handler,notify:handler});

test('OPS-02/03 receive atomic tasks, reuse operations, isolate owners and query without executing',async()=>{
  const env=await makeTestContext();const {ctx}=env;const app=await createBaseApp(ctx);
  try {
    const auth=new AuthService(ctx.db), a=await auth.register({username:'reader_a',password:'correct-password'}),b=await auth.register({username:'reader_b',password:'correct-password'});
    const first=await ctx.tasks.submit(a,'daily',{date:'2026-11-06'},'operation-a',a.id);
    assert.equal(first.status,'pending');
    assert.equal((await ctx.tasks.submit(a,'daily',{date:'2026-11-06'},'operation-a',a.id)).taskId,first.taskId);
    await assert.rejects(ctx.tasks.submit(a,'daily',{date:'2026-11-07'},'operation-a',a.id),{code:'CONFLICT'});
    await assert.rejects(ctx.tasks.get(b,first.taskId),{code:'NOT_FOUND'});
    await assert.rejects(ctx.tasks.get({...b,role:'admin'},first.taskId),{code:'NOT_FOUND'});
    const session=await auth.login({username:'reader_a',password:'correct-password'});
    for(let i=0;i<3;i++) {
      const response=await app.inject({url:first.statusUrl,headers:{authorization:`Bearer ${session.accessToken}`}});
      assert.equal(response.statusCode,200);assert.equal(response.json().data.attempts,0);
    }
    assert.equal((await app.inject(first.statusUrl)).statusCode,401);
    await assert.rejects(ctx.db.tx(async tx=>{await ctx.tasks.submit(a,'daily',{date:'2026-11-08'},'rollback-op',a.id,tx);throw new Error('abort');}));
    assert.equal((await ctx.db.query('SELECT * FROM tasks')).length,1);
    assert.equal((await ctx.db.query('SELECT * FROM task_outbox')).length,1);
    const snap=await ctx.tasks.submit(a,'daily',{date:'2026-11-09',newsIds:['first']},'snapshot',a.id,ctx.db,{date:'2026-11-09'});
    assert.equal((await ctx.tasks.submit(a,'daily',{date:'2026-11-09',newsIds:['newer']},'snapshot',a.id,ctx.db,{date:'2026-11-09'})).taskId,snap.taskId);
    assert.deepEqual((await ctx.db.one<TaskRecord>('SELECT * FROM tasks WHERE id=$1',[snap.taskId]))!.input.newsIds,['first']);
  } finally {await app.close();await env.cleanup();}
});

test('OPS-02 stopped worker accepts pending tasks, recovers outbox and suppresses duplicate delivery',async()=>{
  const env=await makeTestContext(),{ctx}=env;let runtime:ReturnType<typeof ctx.tasks.start>|undefined;let calls=0;
  try {
    await ctx.db.query('CREATE TABLE fixture_results(task_id uuid PRIMARY KEY,value integer NOT NULL)');
    const handlers=handlersFor(async task=>{calls++;await delay(30);return {commit:async tx=>{await tx.query('INSERT INTO fixture_results(task_id,value) VALUES($1,1) ON CONFLICT DO NOTHING',[task.id]);return {done:true};}};});
    const job=await ctx.tasks.submit(null,'collect',{value:1},'worker-stopped');
    assert.equal(job.status,'pending');await delay(50);
    assert.equal((await ctx.db.one<TaskRecord>('SELECT * FROM tasks WHERE id=$1',[job.taskId]))!.attempts,0);
    runtime=ctx.tasks.start(handlers,{intervalMs:30});
    await waitFor(async()=> (await ctx.db.one<TaskRecord>('SELECT * FROM tasks WHERE id=$1',[job.taskId]))!.status==='succeeded');
    await ctx.tasks.queue.add('business',{taskId:job.taskId,generation:1},{jobId:randomUUID()});
    await delay(100);assert.equal(calls,1);
    assert.equal((await ctx.db.query('SELECT * FROM fixture_results')).length,1);
    await runtime.close();runtime=undefined;
    const missing=await ctx.tasks.submit(null,'collect',{value:2},'missing-message');
    await ctx.db.query('UPDATE task_outbox SET delivered_at=now() WHERE task_id=$1',[missing.taskId]);
    runtime=ctx.tasks.start(handlers,{intervalMs:30});
    await waitFor(async()=> (await ctx.db.one<TaskRecord>('SELECT * FROM tasks WHERE id=$1',[missing.taskId]))!.status==='succeeded');
    assert.equal((await ctx.db.query('SELECT * FROM fixture_results')).length,2);
  }finally{await runtime?.close();await env.cleanup();}
});

test('OPS-02 permanent failures persist dead letters and public replays are idempotent',async()=>{
  const env=await makeTestContext(),{ctx}=env;let runtime:ReturnType<typeof ctx.tasks.start>|undefined;
  try {
    const auth=new AuthService(ctx.db),user=await auth.register({username:'manager',password:'correct-password'});
    await ctx.db.query("UPDATE users SET role='admin' WHERE id=$1",[user.id]);const admin={...user,role:'admin' as const};
    let reject=true,calls=0;
    runtime=ctx.tasks.start(handlersFor(async()=>{calls++;if(reject)throw new AppError(400,'INVALID_INPUT','无效材料');return {commit:async()=>({done:true})};}),{intervalMs:30});
    const job=await ctx.tasks.submit(admin,'collect',{value:1},'bad-source');
    await waitFor(async()=> (await ctx.db.one<TaskRecord>('SELECT * FROM tasks WHERE id=$1',[job.taskId]))!.status==='failed');
    await waitFor(async()=>await ctx.tasks.dead.getWaitingCount()===1);assert.equal(calls,1);
    await assert.rejects(ctx.tasks.replay(user,job.taskId,'retry'),{code:'FORBIDDEN'});
    reject=false;
    const replay=await ctx.tasks.replay(admin,job.taskId,'retry');
    assert.equal(replay.generation,2);assert.equal((await ctx.tasks.replay(admin,job.taskId,'retry')).generation,2);
    await waitFor(async()=> (await ctx.db.one<TaskRecord>('SELECT * FROM tasks WHERE id=$1',[job.taskId]))!.status==='succeeded');
    assert.equal(calls,2);assert.equal((await ctx.db.query('SELECT * FROM task_attempts WHERE task_id=$1',[job.taskId])).length,2);
  } finally {await runtime?.close();await env.cleanup();}
});

test('OPS-02/03 stale executions cannot commit and result transaction failure rolls back output',async()=>{
  const env=await makeTestContext(),{ctx}=env;
  try {
    await ctx.db.query('CREATE TABLE fixture_results(task_id uuid PRIMARY KEY,value integer)');
    const job=await ctx.tasks.submit(null,'collect',{},'stale');let release!:()=>void;let entered!:()=>void;
    const started=new Promise<void>(resolve=>{entered=resolve;});const gate=new Promise<void>(resolve=>{release=resolve;});
    const old=ctx.tasks.execute({taskId:job.taskId,generation:1},handlersFor(async task=>{entered();await gate;return {commit:async tx=>{await tx.query('INSERT INTO fixture_results VALUES($1,1)',[task.id]);return {version:1};}};}));
    await started;
    await ctx.tasks.execute({taskId:job.taskId,generation:1},handlersFor(async task=>({commit:async tx=>{await tx.query('INSERT INTO fixture_results VALUES($1,2)',[task.id]);return {version:2};}})));
    release();await old;
    assert.equal((await ctx.db.one<{value:number}>('SELECT value FROM fixture_results WHERE task_id=$1',[job.taskId]))!.value,2);
    const failed=await ctx.tasks.submit(null,'collect',{},'rollback-result');
    await assert.rejects(ctx.tasks.execute({taskId:failed.taskId,generation:1},handlersFor(async task=>({commit:async tx=>{await tx.query('INSERT INTO fixture_results VALUES($1,3)',[task.id]);throw new Error('Injected commit failure');}}))));
    assert.equal((await ctx.db.query('SELECT * FROM fixture_results WHERE task_id=$1',[failed.taskId])).length,0);
    assert.equal((await ctx.db.one<TaskRecord>('SELECT * FROM tasks WHERE id=$1',[failed.taskId]))!.status,'pending');
  }finally{await env.cleanup();}
});
