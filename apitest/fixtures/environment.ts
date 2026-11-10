import { createServer } from 'node:http';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import pino from 'pino';
import { createTestDb } from '../../tests/support/helpers.js';
import { createApp } from '../../src/server/application.js';
import { AuthService } from '../../src/server/modules/account/service.js';
import { ModelClient } from '../../src/server/adapters/model.js';
import { TaskService } from '../../src/server/runtime/tasks.js';
import type { AppContext } from '../../src/server/context.js';
import { NewsService } from '../../src/server/modules/news/index.js';

export async function createAPIEnvironment({port=0,seed=true}={}) {
  const database=await createTestDb();
  const state={delayMs:0,fail:false,modelCalls:0,toolNewsId:'',logs:[] as string[]};
  const quotaInputs=new Set<string>();
  const upstream=createServer(async(req,res)=>{
    if(req.url?.startsWith('/feed')) {
      const item=req.url.split('/').pop()??'fixture';
      res.setHeader('content-type','application/rss+xml');
      res.end(`<rss><channel><item><title>云杉引擎试用 ${item}</title><link>https://example.org/news/${item}</link><pubDate>${new Date().toISOString()}</pubDate><description>云杉引擎开放试用。编号 ${item}。1000条请求平均120毫秒，商业价格尚未公布。</description></item></channel></rss>`);return;
    }
    let raw='';for await(const chunk of req)raw+=chunk.toString();
    const body=JSON.parse(raw) as {input?:string;stream?:boolean;messages:{role:string;content:string}[];dimensions?:number};
    state.modelCalls++;if(state.delayMs)await delay(state.delayMs);
    if(state.fail){res.writeHead(503);res.end('fixture upstream unavailable');return;}
    res.setHeader('content-type','application/json');
    if(req.url?.endsWith('/embeddings') && body.input?.startsWith('error-feedback-quota-') && !quotaInputs.has(body.input)) {
      quotaInputs.add(body.input);res.writeHead(429);res.end(JSON.stringify({error:{code:'insufficient_quota',message:'quota exhausted'}}));return;
    }
    if(req.url?.endsWith('/embeddings')) {res.end(JSON.stringify({data:[{embedding:[1,0,0]}]}));return;}
    if(body.stream) {
      res.setHeader('content-type','text/event-stream');
      const content='云杉引擎于2026年10月10日开放试用，官方以1000条请求测试，平均120毫秒；商业价格尚未公布 [N1]。';
      const longReading=body.messages.some(message=>message.role==='user' && message.content.includes('scroll-reading-fixture'));
      const chunks=longReading ? [...Array.from({length:24},(_,index)=>`第${index+1}段：这里只说明已取得材料中的测试条件。官方报告记录了请求数量和平均响应时间，未披露的硬件条件和商业价格继续保留为未知信息，阅读时应结合原始来源理解这些数据。[N1]\n\n`),'正文结束，保留来源。[N1]'] : [content.slice(0,18),content.slice(18)];
      for(const text of chunks){res.write(`data: ${JSON.stringify({choices:[{delta:{content:text}}]})}\n\n`);if(longReading)await delay(100);}
      res.end(`data: ${JSON.stringify({choices:[{delta:{},finish_reason:'stop'}],usage:{prompt_tokens:40,completion_tokens:50,total_tokens:90}})}\n\ndata: [DONE]\n\n`);return;
    }
    const purpose=body.messages[0].content.split('\n')[0];
    const input=JSON.parse(body.messages[1].content) as {news?:{id:string}|{id:string;label:string}[];materials?:{id:string;label:string}[];paragraphs?:{id:string;content:string}[]};
    const materials=input.materials??(Array.isArray(input.news)?input.news:[]);
    const sourceIds=materials.map(n=>n.id),sourceLabels=materials.map(n=>n.label);let value:unknown;
    if(purpose.includes('news-analysis')) {
      value={selected:true,summary:'云杉引擎开放试用，商业价格尚未公布。',language:'zh',domain:'人工智能',eventTitle:'云杉引擎开放试用',entities:[{name:'云杉实验室',type:'company'},{name:'云杉引擎',type:'product'}],relations:[{source:'云杉实验室',target:'云杉引擎',label:'发布'}]};
    } else if(purpose.includes('translation'))value={paragraphs:input.paragraphs!.map(paragraph=>({id:paragraph.id,translation:'云杉引擎开放试用，商业价格尚未公布。'}))};
    else if(purpose.includes('mindmap'))value={label:'云杉引擎',sourceIds,children:[{label:'开放试用',sourceIds},{label:'商业价格尚未公布',sourceIds}]};
    else if(purpose.includes('public-digest'))value={title:'今日科技日报',content:'云杉引擎开放试用，测试条件与结果值得关注 [N1]。',sourceLabels};
    else if(purpose.includes('reading-journal'))value={content:'今天阅读云杉引擎试用与测试条件，后续跟进商业价格 [N1]。',sourceLabels,memories:[{key:'interest-models',content:'关注开放模型与测试条件'}]};
    else value={content:'云杉引擎开放试用，商业价格尚未公布 [N1]。',sourceLabels};
    res.end(JSON.stringify({choices:[{message:{content:JSON.stringify(value)}}],usage:{prompt_tokens:30,completion_tokens:40,total_tokens:70}}));
  });
  upstream.listen(0,'127.0.0.1');await once(upstream,'listening');
  const address=upstream.address();if(!address||typeof address==='string')throw new Error('Fixture listen failed');
  const upstreamUrl=`http://127.0.0.1:${address.port}`;
  const config={...database.config,chatBaseUrl:`${upstreamUrl}/v1`,chatApiKey:'fixture',chatModel:'fixture',embeddingBaseUrl:`${upstreamUrl}/v1`,embeddingApiKey:'fixture',embeddingModel:'fixture',embeddingDim:3,allowedSourceHosts:['127.0.0.1'],modelTimeoutMs:10000,taskBackoffMs:50,appOrigin:`http://localhost:${port||3101}`};
  const tasks=new TaskService(database.db,config),model=new ModelClient(config);
  const logger=pino({timestamp:()=>`,"timestamp":"${new Date().toISOString()}"`,base:null},{write:line=>state.logs.push(line)});
  const ctx:AppContext={config,db:database.db,tasks,model,logger};
  const auth=new AuthService(ctx.db);
  const a=await auth.register({username:'api_reader_a',password:'correct-password'}),b=await auth.register({username:'api_reader_b',password:'correct-password'}),admin=await auth.register({username:'api_manager',password:'correct-password'});
  await ctx.db.query("UPDATE users SET role='admin' WHERE id=$1",[admin.id]);admin.role='admin';
  const news=new NewsService(ctx);
  const source=await news.saveSource({name:'云杉实验室 · 测试材料',kind:'rss',url:`${upstreamUrl}/feed/${randomUUID()}`,enabled:true,config:{maxItems:1}});
  if(seed) {
    const event=await ctx.db.one<{id:string}>('INSERT INTO events(title,summary) VALUES($1,$2) RETURNING id',['云杉引擎开放试用','用于自动化检查的虚构新闻材料。']);
    for(const [index,title,content]of [[1,'云杉引擎开放试用：关注测试条件与未公布信息','云杉引擎于2026年10月10日开放试用。官方以1000条请求测试，平均响应时间为120毫秒。正式商业价格尚未公布。'],[2,'独立测试观察：不同样本下的云杉引擎表现','独立媒体使用不同的500条请求样本，测得平均150毫秒，硬件配置未披露。商业价格尚未公布。']] as const){
      const row=await ctx.db.one<{id:string}>(`INSERT INTO news(source_id,url,title,published_at,content,content_scope,content_hash,summary,language,domain,embedding,event_id) VALUES($1,$2,$3,now(),$4,'full',$5,$4,'zh','人工智能','[1,0,0]',$6) RETURNING id`,[source.id,`https://example.org/news/n${index}`,title,content,`fixture-${index}`,event!.id]);
      if(index===1)state.toolNewsId=row!.id;
    }
  }
  const app=await createApp(ctx);await app.listen({port,host:'127.0.0.1'});
  const bound=app.server.address();if(!bound||typeof bound==='string')throw new Error('API listen failed');
  const baseUrl=`http://127.0.0.1:${bound.port}`;config.appOrigin=`http://localhost:${bound.port}`;
  return {ctx,app,baseUrl,upstreamUrl,state,a,b,admin,source,auth,async cleanup(){await app.close();await tasks.queue.obliterate({force:true});await tasks.dead.obliterate({force:true});await tasks.close();await model.close();upstream.close();await once(upstream,'close');await database.cleanup();}};
}
