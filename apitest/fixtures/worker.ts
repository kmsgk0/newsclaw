import { createContext,closeContext } from '../../src/server/application.js';
import { startWorker } from '../../src/server/worker.js';
const ctx=createContext();
if(process.env.FIXTURE_PAUSE_AFTER_COMMIT==='true') {
  const execute=ctx.tasks.execute.bind(ctx.tasks);
  ctx.tasks.execute=async(...args)=>{const result=await execute(...args);process.send?.({event:'committed',taskId:args[0].taskId});await new Promise(()=>{});return result;};
}
const runtime=await startWorker(ctx,{scheduling:false,intervalMs:30,lockDuration:1000});
process.send?.({event:'ready'});
let stopping=false;
const stop=async()=>{if(stopping)return;stopping=true;await runtime.close();await closeContext(ctx);process.exit(0);};
process.on('SIGTERM',()=>void stop());process.on('SIGINT',()=>void stop());
