import { writeFile } from 'node:fs/promises';
import { createBenchmarkEnvironment } from './fixture.js';

const {env,plans,stats,fixture} = await createBenchmarkEnvironment();
await writeFile('/reports/performance-plan.json',JSON.stringify(plans,null,2)+'\n');
await writeFile('/reports/performance-fixture-stats.json',JSON.stringify(stats,null,2)+'\n');
await writeFile('/reports/performance-fixture.json',JSON.stringify(fixture),{mode:0o600});
console.log('Synthetic benchmark API ready');
let closing = false;
for (const signal of ['SIGINT','SIGTERM'] as const) process.on(signal,()=>{
  if (closing) return;
  closing = true;
  void env.cleanup().then(()=>process.exit(0),error=>{console.error(error);process.exit(1);});
});
