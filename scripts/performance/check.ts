import { spawn } from 'node:child_process';
import { mkdir,readFile,rm,writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createBenchmarkEnvironment } from './fixture.js';

const config = JSON.parse(await readFile(new URL('./gate.json',import.meta.url),'utf8')) as {vus:number;duration:string;thresholds:Record<string,string[]>};
const output = path.resolve(process.env.VERIFICATION_DIR ?? '.local/verification', 'performance');
await mkdir(output,{recursive:true});
const results:Record<string,unknown>[] = [];
const keywordIndexes = new Set(['news_content_trgm_idx', 'news_summary_trgm_idx', 'news_translation_trgm_idx']);
for (const scenario of ['submit','task','search']) {
  const {env,plans,fixture} = await createBenchmarkEnvironment();
  try {
    const summary = path.join(output,`${scenario}.json`);
    await rm(summary, { force: true });
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
    const invalidPlans = scenario === 'search' ? plans.filter(({ plan }) => {
      const nodes = [plan[0]['QUERY PLAN'][0].Plan];
      let keywordIndexUsed = false;
      for (const node of nodes) {
        if (node['Node Type'] === 'Seq Scan' && node['Relation Name'] === 'news') return true;
        const index = node['Index Name'];
        if (index && keywordIndexes.has(index) &&
            ['Index Scan', 'Index Only Scan', 'Bitmap Index Scan'].includes(node['Node Type'])) {
          keywordIndexUsed = true;
        }
        nodes.push(...(node.Plans ?? []));
      }
      return !keywordIndexUsed;
    }).map(({ sql }) => sql) : [];
    results.push({scenario,startedAt,finishedAt:new Date().toISOString(),exitCode,metrics,plans,invalidPlans});
    await writeFile(path.join(output,'results.json'),JSON.stringify({config,results},null,2)+'\n');
    if (exitCode!==0) throw new Error(`Performance thresholds failed for ${scenario} (k6 exit ${exitCode})`);
    if (scenario === 'search' && (plans.length !== 2 || invalidPlans.length)) {
      throw new Error('Search count and page plans must use a news text index and avoid a sequential scan on news');
    }
  } finally { await env.cleanup(); }
}
