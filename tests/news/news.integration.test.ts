import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { makeTestContext } from '../support/helpers.js';
import { AuthService } from '../../src/server/modules/account/service.js';
import { ModelClient } from '../../src/server/adapters/model.js';
import type { Config } from '../../src/server/config.js';
import type { TaskHandlers } from '../../src/server/runtime/tasks.js';
import { NewsService, createNewsHandlers, preparePublicDailyInput } from '../../src/server/modules/news/service.js';

class FixtureModel extends ModelClient {
  failTranslation=false;failDigest=false;failEmbedding=false;summaryCalls=0;translationCalls=0;
  constructor(config:Config){super(config);}
  override async embed(){if(this.failEmbedding)throw new Error('fixture embedding offline');return [1,0,0,0];}
  override async json<T>(purpose:string,input:unknown,schema:z.ZodType<T>){
    const payload=input as {news:{id:string} | Array<{label:string}>;paragraphs?:{id:string;content:string}[]};let value:unknown;
    if(purpose==='news-analysis'){this.summaryCalls++;value={selected:true,summary:'云杉实验室开放云杉引擎试用，商业价格未公布。',language:'en',domain:'人工智能',eventTitle:'云杉引擎开放试用',entities:[{name:'云杉实验室',type:'company'},{name:'云杉引擎',type:'product'}],relations:[{source:'云杉实验室',target:'云杉引擎',label:'发布'}]};}
    else if(purpose==='news-translation'){this.translationCalls++;if(this.failTranslation)throw new Error('fixture translation offline');value={paragraphs:payload.paragraphs!.map(block=>({id:block.id,translation:'云杉引擎开放试用，商业价格未公布。'}))};}
    else if(purpose==='public-digest'){if(this.failDigest)throw new Error('fixture digest offline');value={title:'今日科技日报',content:'云杉引擎开放试用，商业价格未公布。[N1]',sourceLabels:(payload.news as Array<{label:string}>).map(n=>n.label)};}
    else throw new Error(`Unexpected model task ${purpose}`);
    return {value:schema.parse(value),usage:{inputTokens:10,outputTokens:10,totalTokens:20}};
  }
}
async function fixture(){
  const env=await makeTestContext();const ctx=env.ctx;await ctx.model.close();ctx.config.embeddingDim=4;ctx.config.allowedSourceHosts=['127.0.0.1'];const model=new FixtureModel(ctx.config);ctx.model=model;
  const date=new Date().toISOString();let headline='Spruce Engine trial';let suffix='';
  const server=createServer((_req,res)=>{res.setHeader('content-type','application/rss+xml');res.end(`<rss><channel><item><title>${headline}</title><link>https://news.example/release${suffix}?utm_source=rss</link><pubDate>${date}</pubDate><description>Spruce Engine is open for trial. Commercial pricing has not been announced.</description></item></channel></rss>`);});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();if(!address||typeof address==='string')throw new Error('No fixture port');
  const service=new NewsService(ctx);const source=await service.saveSource({name:'Fixture source',kind:'rss',url:`http://127.0.0.1:${address.port}/feed`,enabled:true,config:{}});
  const handlers:TaskHandlers={...createNewsHandlers(ctx),journal:async()=>{throw new Error('Unused journal handler');}};
  const collect=async()=>{const task=await ctx.tasks.submit(null,'collect',{sourceId:source.id},randomUUID());return ctx.tasks.execute({taskId:task.id,generation:task.generation},handlers);};
  return {ctx,model,service,source,handlers,collect,changeArticle(){suffix='/next';headline='Spruce Engine progress';},async cleanup(){await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));await env.cleanup();}};
}
test('NEWS-02 failed translation preserves raw and summary and only retries missing steps',async()=>{
  const f=await fixture();try{f.model.failTranslation=true;await assert.rejects(f.collect());const page=await f.service.search({});assert.equal(page.total,1);assert.ok(page.items[0].summary);assert.equal(page.items[0].translation,null);assert.ok(page.items[0].content);f.model.failTranslation=false;await f.collect();assert.equal(f.model.summaryCalls,1);assert.equal(f.model.translationCalls,2);assert.ok((await f.service.get(page.items[0].id)).translation);}finally{await f.cleanup();}
});
test('NEWS-05 favorites and reading history isolate users and preserve shared reports',async()=>{
  const f=await fixture();try{await f.collect();const auth=new AuthService(f.ctx.db);const a=await auth.register({username:'reader_a',password:'example-password'});const b=await auth.register({username:'reader_b',password:'example-password'});const id=(await f.service.search({})).items[0].id;await f.service.repo.favorite(a.id,id,true);await f.service.repo.favorite(a.id,id,true);await f.service.repo.read(a.id,id);await f.service.repo.read(a.id,id);assert.equal((await f.service.repo.library(a.id,'favorites',1,20)).total,1);assert.equal((await f.service.repo.library(a.id,'history',1,20)).total,1);assert.equal((await f.service.repo.library(b.id,'favorites',1,20)).total,0);await f.service.repo.favorite(a.id,id,false);assert.equal((await f.service.repo.library(a.id,'favorites',1,20)).total,0);assert.equal((await f.service.get(id)).id,id);await assert.rejects(f.service.repo.favorite(a.id,randomUUID(),true),{code:'NOT_FOUND'});}finally{await f.cleanup();}
});
test('NEWS-06 daily digest updates one date and preserves success on model failure',async()=>{
  const f=await fixture();try{await f.collect();const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'}).format(new Date());const run=async(d=date)=>{const task=await f.ctx.tasks.submit(null,'daily',await preparePublicDailyInput(f.ctx,d),randomUUID());return f.ctx.tasks.execute({taskId:task.id,generation:task.generation},f.handlers);};await run();await run();const first=await f.service.repo.digests(date);assert.equal(first.items.length,1);assert.equal((first.items[0].news as unknown[]).length,1);f.model.failDigest=true;await assert.rejects(run());const failed=await f.service.repo.digests(date);assert.deepEqual(failed.items,first.items);assert.equal(failed.status,'pending');assert.ok(failed.latestTask?.error);assert.deepEqual(await run('2000-01-01'),{date:'2000-01-01',status:'empty',message:'当日暂无可用新闻'});}finally{await f.cleanup();}
});
