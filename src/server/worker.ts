import { pathToFileURL } from 'node:url';
import path from 'node:path';
import type { AppContext } from './context.js';
import { createContext,closeContext } from './application.js';
import type { TaskHandlers } from './runtime/tasks.js';

export function createHandlers():TaskHandlers { return {}; }
export async function startWorker(ctx:AppContext,{intervalMs=1000,lockDuration=30000}={}) {
  return ctx.tasks.start(createHandlers(),{intervalMs,lockDuration});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  const ctx=createContext();const runtime=await startWorker(ctx);let stopping=false;
  ctx.logger.info({module:'worker',version:ctx.config.version},'Worker started');
  const stop=async()=>{if(stopping)return;stopping=true;const deadline=setTimeout(()=>process.exit(1),30000);deadline.unref();await runtime.close();await closeContext(ctx);clearTimeout(deadline);};
  process.on('SIGINT',()=>void stop());process.on('SIGTERM',()=>void stop());
}
