import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createAPIEnvironment } from '../../apitest/fixtures/environment.js';
import { NewsService } from '../../src/server/modules/news/index.js';
import { startWorker } from '../../src/server/worker.js';
import type { TaskRecord } from '../../src/server/runtime/tasks.js';

const output = path.resolve(process.env.VERIFICATION_DIR ?? '.local/verification/worker-throughput');
await mkdir(output,{recursive:true});
const env = await createAPIEnvironment({seed:false});
let worker:Awaited<ReturnType<typeof startWorker>>|undefined;
try {
  env.state.delayMs = 200;
  const news = new NewsService(env.ctx);
  const ids:string[] = [];
  for (let i=0;i<20;i++) {
    const source = await news.saveSource({name:`Worker throughput ${i}`,kind:'rss',url:`${env.upstreamUrl}/feed/worker-${i}`,enabled:true,config:{maxItems:1}});
    const task = await env.ctx.tasks.submit(env.admin,'collect',{sourceId:source.id},`worker-throughput-${i}`);
    ids.push(task.taskId);
  }
  const startedAt = new Date().toISOString();
  const started = performance.now();
  worker = await startWorker(env.ctx,{scheduling:false,intervalMs:30});
  let rows:TaskRecord[] = [];
  do {
    rows = await env.ctx.db.query<TaskRecord>('SELECT * FROM tasks WHERE id=ANY($1::uuid[]) ORDER BY created_at,id',[ids]);
    if (rows.length===ids.length && rows.every(row=>['succeeded','failed'].includes(row.status))) break;
    await delay(50);
  } while (performance.now()-started<120000);
  const wallMs = performance.now()-started;
  const completed = rows.filter(row=>row.status==='succeeded').length;
  const failed = rows.filter(row=>row.status==='failed').length;
  const derived = await env.ctx.db.query('SELECT type,status,count(*)::int AS count FROM tasks WHERE NOT(id=ANY($1::uuid[])) GROUP BY type,status ORDER BY type,status',[ids]);
  const report = {
    startedAt,finishedAt:new Date().toISOString(),workerCount:1,collectionTasks:20,upstreamDelayMs:200,
    measurement:'From Worker startup until all collection tasks reach a terminal state; completed counts include collection jobs only, with derived task states recorded separately at interval end.',
    completed,failed,unfinished:20-completed-failed,wallMs,tasksPerSecond:completed/(wallMs/1000),modelCalls:env.state.modelCalls,derived,
    tasks:rows.map(row=>({id:row.id,status:row.status,attempts:row.attempts,createdAt:row.created_at,startedAt:row.started_at,finishedAt:row.finished_at,
      queueWaitMs:row.started_at?new Date(row.started_at).getTime()-new Date(row.created_at).getTime():null,
      executionMs:row.started_at&&row.finished_at?new Date(row.finished_at).getTime()-new Date(row.started_at).getTime():null})),
  };
  await writeFile(path.join(output,'worker-throughput.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({completed,failed,wallMs,tasksPerSecond:report.tasksPerSecond,modelCalls:report.modelCalls}));
  assert.equal(completed,20,'Every independent collection task must succeed');
  assert.equal((await env.ctx.db.query('SELECT id FROM news')).length,20,'Every distinct source report must be stored');
} finally { await worker?.close(); await env.cleanup(); }
