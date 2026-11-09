import { createContext,createApp,closeContext } from './application.js';
import { EditorRepository } from './modules/editor/repository.js';
const ctx=createContext();
await new EditorRepository(ctx.db).failInterruptedAnswers();
const app=await createApp(ctx);
await app.listen({port:ctx.config.port,host:ctx.config.host});
let stopping=false;
const stop=async()=>{
  if(stopping)return;stopping=true;
  const deadline=setTimeout(()=>process.exit(1),30000);deadline.unref();
  await app.close();await closeContext(ctx);clearTimeout(deadline);
};
process.on('SIGINT',()=>void stop());process.on('SIGTERM',()=>void stop());
