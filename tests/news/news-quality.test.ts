import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { makeTestContext } from '../support/helpers.js';
import { ModelClient, ModelError } from '../../src/server/adapters/model.js';
import { AuthService } from '../../src/server/modules/account/service.js';
import { NewsService, createNewsHandlers } from '../../src/server/modules/news/service.js';
import { detectLanguage, normalizeDomain, translateArticle } from '../../src/server/modules/news/content.js';
import type { TaskHandlers } from '../../src/server/runtime/tasks.js';
import type { Config } from '../../src/server/config.js';

class QualityModel extends ModelClient {
  omitLast = false;
  analysisCalls = 0;
  embeddingInputs: string[] = [];
  relationMode: 'none' | 'valid' | 'missing-node' | 'foreign-source' = 'none';
  requests: {id:string;content:string}[][] = [];
  constructor(config: Config) { super(config); }
  override async embed(text: string) { this.embeddingInputs.push(text);return [1,0,0,0]; }
  override async json<T>(purpose: string, input: unknown, schema: z.ZodType<T>) {
    const payload = input as { news: {id:string;title:string;content:string}; paragraphs: {id:string;content:string}[] };
    let result: unknown;
    if (purpose === 'news-analysis') {
      this.analysisCalls++;
      if (payload.news.title === 'Broken report') throw new Error('Fixture analysis failure');
      const entities=this.relationMode==='none'?[]:[{name:'Lab',type:'company'},{name:'Model',type:'product'}];
      const relations=this.relationMode==='none'?[]:[{source:'Lab',target:this.relationMode==='missing-node'?'Missing':'Model',label:'发布',...(this.relationMode==='foreign-source'?{sourceIds:[randomUUID()]}:{})}];
      result = {selected:true,summary:`${payload.news.title}：材料包含 ${payload.news.content.length} 个字符。`,language:'zh',domain:'Artificial Intelligence',eventTitle:payload.news.title,entities,relations};
    } else if (purpose === 'news-translation') {
      this.requests.push(payload.paragraphs);
      const paragraphs = this.omitLast ? payload.paragraphs.slice(0,-1) : payload.paragraphs;
      result = {paragraphs:paragraphs.map(block=>({id:block.id,translation:`译文 ${block.id}：${block.content}`}))};
    } else throw new Error(`Unexpected purpose: ${purpose}`);
    return {value:schema.parse(result),usage:{inputTokens:1,outputTokens:1,totalTokens:2}};
  }
}

async function fixture() {
  const env = await makeTestContext();
  await env.ctx.model.close();
  env.ctx.config.embeddingDim = 4; env.ctx.config.allowedSourceHosts = ['127.0.0.1'];
  const model = new QualityModel(env.ctx.config); env.ctx.model = model;
  let items: {title:string;path:string;body:string;url?:string}[] = [{title:'A model release',path:'/release',body:'<h2>Availability</h2><p>The model is now available for research use. Commercial pricing is not announced.</p>'}];
  const server = createServer((_request,response)=>{
    response.setHeader('content-type','application/rss+xml');
    response.end(`<rss><channel>${items.map(item=>`<item><title>${item.title}</title><link>${item.url??`https://example.org${item.path}`}</link><pubDate>2026-11-08T10:00:00Z</pubDate><content:encoded><![CDATA[${item.body}]]></content:encoded></item>`).join('')}</channel></rss>`);
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address(); assert.ok(address && typeof address!=='string');
  const service=new NewsService(env.ctx);
  const source=await service.saveSource({name:'Quality fixture',kind:'rss',url:`http://127.0.0.1:${address.port}/feed`,enabled:true,config:{}});
  const handlers:TaskHandlers={...createNewsHandlers(env.ctx),journal:async()=>{throw new Error('Unused journal');}};
  const collect=async()=>{const task=await env.ctx.tasks.submit(null,'collect',{sourceId:source.id},randomUUID());return env.ctx.tasks.execute({taskId:task.id,generation:task.generation},handlers);};
  return {...env,model,service,source,collect,setItems(value:typeof items){items=value;},async cleanup(){await new Promise<void>(resolve=>server.close(()=>resolve()));await env.cleanup();}};
}

test('NEWS-02 source language and canonical domains do not depend on model label wording',()=>{
  assert.equal(detectLanguage('The model is available for research use. Commercial pricing is not announced.'),'en');
  assert.equal(detectLanguage('这款模型已开放研究使用，商业价格尚未公布。'),'zh');
  for(const label of ['Artificial Intelligence','artificial intelligence','speech recognition, artificial intelligence','人工智能']) assert.equal(normalizeDomain(label),'人工智能');
});

test('NEWS-02 translation covers every source block and long articles, preserving code',async()=>{
  const env=await makeTestContext();const model=new QualityModel(env.ctx.config);
  try {
    const paragraph='This is a concrete source paragraph about the research trial and its stated conditions. '.repeat(35);
    const content=`## First section\n\n${paragraph}\n\n## Second section\n\n${paragraph}\n\n\`\`\`js\nconst value = 1;\n\`\`\``;
    const result=await translateArticle(model,{id:randomUUID(),title:'Research',content,contentScope:'full'});
    assert.ok(model.requests.length>1);
    for(const group of model.requests) for(const block of group) assert.ok(result.translation.includes(block.content));
    assert.match(result.translation,/```js\nconst value = 1;\n```/);
    model.omitLast=true;
    await assert.rejects(translateArticle(model,{id:randomUUID(),title:'Research',content,contentScope:'full'}),/覆盖全部段落/);
  } finally {await model.close();await env.cleanup();}
});

test('NEWS-02 an image-leading paragraph still translates its prose',async()=>{
  const env=await makeTestContext();const model=new QualityModel(env.ctx.config);
  try {
    const image='![Diagram](https://example.org/diagram.png)';
    const content=`${image}\nThe researchers released a new model and evaluation dataset.`;
    const result=await translateArticle(model,{id:randomUUID(),title:'Research',content,contentScope:'full'});
    assert.equal(model.requests.length,1,'Text following an image must reach the translation model');
    assert.match(model.requests[0][0].content,/researchers released/);
    assert.match(result.translation,/译文 p1/);
    model.requests=[];
    const standalone=await translateArticle(model,{id:randomUUID(),title:'Research',content:image,contentScope:'full'});
    assert.equal(standalone.translation,image);assert.equal(model.requests.length,0);
  } finally {await model.close();await env.cleanup();}
});

test('NEWS-02 prose immediately after a closed code fence is translated',async()=>{
  const env=await makeTestContext();const model=new QualityModel(env.ctx.config);
  try {
    const code='```js\nconst version = 2;\n```';
    const result=await translateArticle(model,{id:randomUUID(),title:'Release',content:`${code}\nThe researchers released a new evaluation dataset.`,contentScope:'full'});
    assert.equal(model.requests.length,1);
    assert.equal(model.requests[0][0].content,'The researchers released a new evaluation dataset.');
    assert.ok(result.translation.startsWith(code));assert.match(result.translation,/译文 p2/);
  }finally{await model.close();await env.cleanup();}
});

test('NEWS-01/02 a failed content update keeps successful translation and personal associations',async()=>{
  const f=await fixture();
  try {
    await f.collect();
    const before=(await f.service.search({})).items[0];
    assert.equal(before.language,'en');assert.equal(before.domain,'人工智能');assert.ok(before.translation);
    const user=await new AuthService(f.ctx.db).register({username:'quality_reader',password:'reading-password'});
    await f.service.repo.favorite(user.id,before.id,true);
    f.setItems([{title:'A model release',path:'/release',body:'<h2>Availability</h2><p>The model remains available for research use.</p><p>New documentation now describes the evaluation methodology.</p>'}]);
    f.model.omitLast=true;
    await assert.rejects(f.collect(),/处理失败/);
    const failed=await f.service.get(before.id,{id:user.id,role:'user',username:'quality_reader'});
    assert.equal(failed.translation,before.translation);assert.equal(failed.favorite,true);
    assert.equal(failed.processing.translation,'failed');assert.equal(failed.processing.stale,true);
    f.model.omitLast=false;await f.collect();
    const after=await f.service.get(before.id);
    assert.match(after.translation!,/evaluation methodology/);assert.equal(after.processing.stale,false);
    assert.equal((await f.service.search({})).total,1);
  } finally {await f.cleanup();}
});

test('NEWS-01 one failed report does not prevent other reports in the same batch',async()=>{
  const f=await fixture();
  try {
    f.setItems([{title:'Broken report',path:'/broken',body:'<p>The first report cannot currently be processed.</p>'},{title:'Readable report',path:'/readable',body:'<p>The second report has complete original material.</p>'}]);
    await assert.rejects(f.collect(),/1 篇报道处理失败，1 篇已完成/);
    const items=(await f.service.search({})).items;
    assert.equal(items.length,2);
    assert.equal(items.find(item=>item.title==='Broken report')?.processing.summary,'failed');
    assert.equal(items.find(item=>item.title==='Readable report')?.processing.translation,'succeeded');
    assert.ok(items.find(item=>item.title==='Readable report')?.translation);
  } finally {await f.cleanup();}
});

test('NEWS-02 the host binds single-article graph evidence and rejects undefined endpoints or source fields',async()=>{
  const f=await fixture();
  try {
    f.model.relationMode='valid';
    await f.collect();
    const article=(await f.service.search({})).items[0];
    const stored=await f.service.repo.raw(article.id);
    assert.deepEqual((stored.extracted as {relations:{sourceIds:string[]}[]}).relations[0].sourceIds,[article.id]);
    for(const mode of ['missing-node','foreign-source'] as const) {
      f.model.relationMode=mode;
      f.setItems([{title:`Invalid ${mode}`,path:`/${mode}`,body:'<p>Lab released Model for research.</p>'}]);
      await assert.rejects(f.collect(),/处理失败/);
      const invalid=(await f.service.search({q:`Invalid ${mode}`})).items[0];
      assert.equal((await f.service.repo.raw(invalid.id)).extracted,null);
      assert.equal(invalid.processing.summary,'failed');
    }
  } finally {await f.cleanup();}
});

for(const failure of [
  new ModelError('模型服务额度已用完，额度恢复后可重新处理',false),
  new ModelError('模型服务认证失败，请检查服务配置',false),
  Object.assign(new Error('Model processing is not retryable'),{retryable:false}),
]) test(`NEWS-01 a nonretryable model failure stops its batch: ${failure.message}`,async()=>{
  const f=await fixture();
  try {
    f.setItems([{title:'First report',path:'/first',body:'<p>The first report has material.</p>'},{title:'Second report',path:'/second',body:'<p>The second report must not call an unavailable model.</p>'}]);
    let calls=0;
    f.ctx.model.json=async function(){calls++;throw failure;};
    await assert.rejects(f.collect());
    assert.equal(calls,1,'Global quota or authentication failure must stop remaining model calls');
    const task=await f.ctx.db.one<{status:string;round_attempts:number}>('SELECT status,round_attempts FROM tasks WHERE type=$1 ORDER BY created_at DESC LIMIT 1',['collect']);
    assert.equal(task?.status,'failed');assert.equal(task?.round_attempts,1);
    const items=(await f.service.search({})).items;
    assert.equal(items.length,1);assert.equal(items[0].processing.summary,'failed');
    assert.ok((await f.service.repo.source(f.source.id)).lastError);
  } finally {await f.cleanup();}
});

test('NEWS-01 malformed item links are reported while valid entries in the feed complete',async()=>{
  const f=await fixture();
  try {
    f.setItems([{title:'Invalid JavaScript link',path:'/bad',url:'javascript:alert(1)',body:'<p>Bad link.</p>'},{title:'Invalid local link',path:'/bad-file',url:'file:///tmp/private',body:'<p>Local file.</p>'},{title:'Valid report',path:'/good',body:'<p>A valid public source report.</p>'}]);
    await assert.rejects(f.collect(),/2 篇报道处理失败，1 篇已完成/);
    const items=(await f.service.search({})).items;
    assert.equal(items.length,1);assert.equal(items[0].title,'Valid report');assert.equal(items[0].processing.index,'succeeded');
    assert.match((await f.service.repo.source(f.source.id)).lastError!,/2 篇处理失败/);
  }finally{await f.cleanup();}
});

test('NEWS-02 headline changes invalidate headline-dependent summary and index',async()=>{
  const f=await fixture();
  try {
    const body='<p>The company posted an update about the trial schedule.</p>';
    f.setItems([{title:'Trial opens Monday',path:'/schedule',body}]);await f.collect();
    const first=(await f.service.search({})).items[0];const oldHash=(await f.service.repo.raw(first.id)).content_hash;
    f.setItems([{title:'Trial postponed',path:'/schedule',body}]);await f.collect();
    const second=await f.service.get(first.id);const current=await f.service.repo.raw(first.id);
    assert.notEqual(current.content_hash,oldHash);assert.equal(f.model.analysisCalls,2);
    assert.match(second.summary!,/Trial postponed/);assert.equal(f.model.embeddingInputs.length,2);assert.match(f.model.embeddingInputs[1],/Trial postponed/);
    assert.equal(second.processing.summaryHash,current.content_hash);assert.equal(second.processing.indexHash,current.content_hash);assert.equal(second.processing.stale,false);
  }finally{await f.cleanup();}
});

test('NEWS-02 metadata remains useful when analysis cannot run',async()=>{
  const f=await fixture();
  try {
    f.setItems([{title:'模型研究进展',path:'/metadata',body:'<p>研究团队公布新的模型评估结果，商业价格尚未公布。</p>'}]);
    f.ctx.model.json=async function(){throw new ModelError('模型服务额度已用完',false);};
    await assert.rejects(f.collect());
    const items=(await f.service.search({language:'zh',domain:'科技综合'})).items;
    assert.equal(items.length,1);assert.equal(items[0].language,'zh');assert.equal(items[0].domain,'科技综合');
  }finally{await f.cleanup();}
});
