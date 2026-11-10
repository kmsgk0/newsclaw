import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {editorEnvironment} from '../support/editor-fixture.js';
import {createTopicHandlers} from '../../src/server/modules/topics/service.js';
import {NewsService,createNewsHandlers} from '../../src/server/modules/news/service.js';
import type {TaskHandlers} from '../../src/server/runtime/tasks.js';
for (const withSummary of [false,true]) test(`NEWS-01/02 original-page failure preserves full material when RSS provides ${withSummary?'a summary':'only a title'}`,async()=>{
  const env = await editorEnvironment();
  let failing = false;
  const server = createServer((req,res)=>{
    if(req.url==='/article') {
      if(failing){res.writeHead(503);res.end('temporarily unavailable');}
      else {res.setHeader('content-type','text/html');res.end('<article><h1>Trial announcement</h1><p>Full original evidence about a new trial. Commercial pricing remains unknown.</p></article>');}
      return;
    }
    const address=server.address();
    const port=typeof address==='object'&&address?address.port:0;
    res.setHeader('content-type','application/rss+xml');
    res.end(`<rss><channel><item><title>Trial announcement</title><link>http://127.0.0.1:${port}/article</link><pubDate>2026-11-06T00:00:00Z</pubDate>${withSummary?'<description>Short RSS excerpt.</description>':''}</item></channel></rss>`);
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    env.ctx.config.allowedSourceHosts=['127.0.0.1'];
    env.ctx.model.json=async function<T>(purpose:string,input:unknown,schema:z.ZodType<T>) {
      const payload=input as {news:{id:string;content:string};paragraphs:{id:string;content:string}[]};
      const value=purpose==='news-analysis'?{selected:true,summary:'Successful summary of full evidence',language:'en',domain:'Tech',eventTitle:'Trial announcement',entities:[],relations:[]}:{paragraphs:payload.paragraphs.map(block=>({id:block.id,translation:'完整来源译文，试用开放，商业定价尚未公布。'}))};
      return {value:schema.parse(value),usage:{inputTokens:1,outputTokens:1,totalTokens:2}};
    };
    env.ctx.model.embed=async()=>[1,0,0];
    const service=new NewsService(env.ctx),address=server.address();
    assert.ok(address&&typeof address!=='string');
    const source=await service.saveSource({name:'Source feed',kind:'rss',url:`http://127.0.0.1:${address.port}/feed`,enabled:true,config:{fetchArticle:true}});
    const handlers:TaskHandlers={...createNewsHandlers(env.ctx),...createTopicHandlers(env.ctx),journal:async()=>{throw new Error('Unused');}};
    const collect=async()=>{
      const task=await env.ctx.tasks.submit(null,'collect',{sourceId:source.id},randomUUID());
      return env.ctx.tasks.execute({taskId:task.id,generation:task.generation},handlers);
    };
    await collect();
    const before=(await service.search({sourceId:source.id})).items[0];
    assert.equal(before.contentScope,'full');assert.match(before.content,/Full original evidence/);
    const beforeRaw=await service.repo.raw(before.id);
    failing=true;
    await assert.rejects(collect(),/正文|source|暂不可用/);
    const after=await service.get(before.id);
    assert.equal(after.content,before.content,'Transient original-page failure must not replace the already saved full body');
    assert.equal(after.contentScope,before.contentScope);
    assert.equal(after.summary,before.summary);
    assert.equal(after.translation,before.translation);
    assert.equal((await service.repo.raw(before.id)).embedding,beforeRaw.embedding);
    assert.equal(after.processing.source,'failed');
    assert.ok((await service.repo.source(source.id)).lastError);
    failing=false;await collect();
    const recovered=await service.get(before.id);assert.equal(recovered.content,before.content);assert.equal(recovered.summary,before.summary);assert.equal(recovered.translation,before.translation);assert.equal(recovered.processing.source,'succeeded');
    assert.equal((await service.repo.source(source.id)).lastError,null);
  } finally {await new Promise<void>(resolve=>server.close(()=>resolve()));await env.cleanup();}
});
