import path from 'node:path';
import { existsSync } from 'node:fs';
import staticFiles from '@fastify/static';
import { createBaseApp } from './base-app.js';
import { loadConfig, type Config } from './config.js';
import type { AppContext } from './context.js';
import { Db } from './db.js';
import { ModelClient } from './adapters/model.js';
import { TaskService } from './runtime/tasks.js';
import { logger } from './logger.js';


export function createContext(config:Config=loadConfig()):AppContext {
  const db=new Db(config.databaseUrl);
  return {config,db,tasks:new TaskService(db,config),model:new ModelClient(config),logger};
}
export async function closeContext(ctx:AppContext) {await ctx.tasks.close();await ctx.model.close();await ctx.db.close();}
export async function createApp(ctx:AppContext) {
  const app=await createBaseApp(ctx);
  const web=path.resolve('dist/web');
  if(existsSync(path.join(web,'index.html'))) {
    await app.register(staticFiles,{root:web,prefix:'/'});
    app.setNotFoundHandler(async(req,reply)=>{
      if(req.url.startsWith('/api/')) return reply.code(404).send({code:'NOT_FOUND',message:'接口不存在',data:null,requestId:req.id});
      return reply.sendFile('index.html');
    });
  }
  return app;
}
