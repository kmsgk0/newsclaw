import { spawn } from 'node:child_process';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createBenchmarkEnvironment } from './fixture.js';

const config = JSON.parse(await readFile(new URL('./gate.json',import.meta.url),'utf8')) as {vus:number;duration:string;thresholds:Record<string,string[]>};
const output = path.resolve(process.env.VERIFICATION_DIR ?? '.local/verification', 'performance');
await mkdir(output,{recursive:true});
const results:Record<string,unknown>[] = [];
for (const scenario of ['submit','task','search']) {
  const {env,plans,fixture} = await createBenchmarkEnvironment();
  try {
    const summary = path.join(output,`${scenario}.json`);
    const startedAt = new Date().toISOString();
    const exitCode = await new Promise<number>((resolve,reject)=>{
      const child = spawn(process.env.K6_BIN ?? 'k6',['run','--quiet','--summary-export',summary,'scripts/performance/benchmark.js'],{
        stdio:'inherit',env:{...process.env,SCENARIO:scenario,BASE:fixture.base,TOKEN:fixture.token,SOURCE_ID:fixture.sourceId,TASK_ID:fixture.taskId,
          RUN_ID:randomUUID(),VUS:String(config.vus),DURATION:config.duration,CHECK_THRESHOLDS:JSON.stringify(config.thresholds)},
      });
      child.once('error',reject);
      child.once('close',code=>resolve(code ?? 1));
    });
    const metrics = JSON.parse(await readFile(summary,'utf8')).metrics;
    results.push({scenario,startedAt,finishedAt:new Date().toISOString(),exitCode,metrics,plans});
    await writeFile(path.join(output,'results.json'),JSON.stringify({config,results},null,2)+'\n');
    if (exitCode!==0) throw new Error(`Performance thresholds failed for ${scenario} (k6 exit ${exitCode})`);
  } finally { await env.cleanup(); }
}
