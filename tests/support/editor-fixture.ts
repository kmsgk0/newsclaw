import { createServer } from 'node:http';
import { once } from 'node:events';
import { z } from 'zod';
import pino from 'pino';
import { createTestDb } from './helpers.js';
import { AuthService } from '../../src/server/modules/account/service.js';
import { ModelClient } from '../../src/server/adapters/model.js';
import { TaskService } from '../../src/server/runtime/tasks.js';
import type { AppContext } from '../../src/server/context.js';

export async function editorEnvironment() {
  const environment = await createTestDb();
  const auth = new AuthService(environment.db);
  const a = await auth.register({ username: 'editor_a', password: 'correct-password' });
  const b = await auth.register({ username: 'editor_b', password: 'correct-password' });
  const source = await environment.db.one<{ id: string }>(`INSERT INTO news_sources(name,kind,url) VALUES('Fixture research','rss','https://example.com/feed') RETURNING id`);
  const news = await environment.db.one<{ id: string }>(`INSERT INTO news(source_id,url,title,published_at,content,content_scope,content_hash,summary,embedding) VALUES($1,'https://example.com/news','云杉引擎开放试用',now(),'云杉引擎于2026年10月10日开放试用，1000条请求平均120毫秒。商业价格尚未公布。','full','fixture','开放试用，定价未公布','[1,0,0]') RETURNING id`, [source!.id]);
  const state = { mode: 'valid', calls: 0, toolId: news!.id, requests: [] as unknown[], memories: [{ key: 'response-style', content: '偏好长篇解释' }], delay: 0 };
  const server = createServer(async (req, res) => {
    let input = ''; for await (const chunk of req) input += chunk.toString();
    const body = JSON.parse(input); state.requests.push(body); state.calls++;
    if (state.delay) await new Promise(resolve => setTimeout(resolve, state.delay));
    if (state.mode === 'quota') { res.writeHead(429, {'content-type':'application/json'}); res.end(JSON.stringify({error:{code:'insufficient_quota',message:'provider-private-marker'}})); return; }
    if (state.mode === 'failure') { res.writeHead(503); res.end('upstream failure'); return; }
    if (req.url?.endsWith('/embeddings')) { res.setHeader('content-type','application/json'); res.end(JSON.stringify({data:[{embedding:[1,0,0]}]})); return; }
    if (body.stream) {
      res.setHeader('content-type','text/event-stream');
      const toolRound = state.mode === 'tool' && !body.messages.some((message: { role: string }) => message.role === 'tool');
      const expandsScope = state.mode === 'scope-expansion' && body.tools?.some((tool:{function:{name:string}})=>tool.function.name==='news_search');
      if (expandsScope) {
        res.write(`data: ${JSON.stringify({choices:[{delta:{tool_calls:[{index:0,id:'fixture-search',function:{name:'news_search',arguments:JSON.stringify({query:'unrelated news outside selected materials',semantic:false})}}]},finish_reason:'tool_calls'}]})}\n\n`);
      } else if (toolRound) {
        res.write(`data: ${JSON.stringify({choices:[{delta:{tool_calls:[{index:0,id:'fixture-call',function:{name:'news_read',arguments:JSON.stringify({id:state.toolId})}}]},finish_reason:'tool_calls'}]})}\n\n`);
      } else {
        const content = state.mode === 'bad-citation' ? '价格为99元 [N999]。' : '云杉引擎于2026年10月10日开放试用，商业价格尚未公布 [N1]。';
        for (const chunk of [content.slice(0, 12), content.slice(12)]) res.write(`data: ${JSON.stringify({choices:[{delta:{content:chunk}}]})}\n\n`);
        if (state.mode !== 'truncated') res.write(`data: ${JSON.stringify({choices:[{delta:{},finish_reason:'stop'}],usage:{prompt_tokens:10,completion_tokens:20,total_tokens:30}})}\n\n`);
      }
      if (state.mode !== 'truncated') res.write('data: [DONE]\n\n');
      res.end(); return;
    }
    const purpose = String(body.messages[0].content).split('\n')[0];
    const data = JSON.parse(body.messages[1].content);
    const materials = (data.materials ?? data.news ?? []) as { id: string; label: string; content?: string; title?: string }[];
    const sourceIds = materials.map(item => item.id);
    const sourceLabels = state.mode === 'bad-digest-source' ? ['N999'] : materials.map(item => item.label);
    let result: unknown;
    if (purpose.includes('mindmap')) result = {label:'云杉引擎',sourceIds:state.mode==='bad-map'?['00000000-0000-4000-8000-000000000000']:sourceIds,children:[{label:'开放试用',sourceIds}]};
    else if (purpose.includes('bilingual-reading')) result = {paragraphs:(data.paragraphs as {id:string}[]).map(item=>({paragraphId:state.mode==='bad-bilingual'?'P999':item.id,translation:'云杉引擎于2026年10月10日开放试用，商业价格尚未公布。',expressions:[]}))};
    else if (purpose.includes('public-digest')) result = {title:'今日新闻',content:'云杉引擎开放试用，商业价格尚未公布 [N1]。',sourceLabels};
    else if (purpose.includes('reading-journal')) result = {content:'今天关注了云杉引擎的试用与测试条件 [N1]。',sourceLabels,memories:state.memories};
    else if (purpose.includes('personal-digest') && state.mode === 'unsupported-interest') result = {content:'云杉引擎开放试用 [N1]。',sourceLabels,interestMatches:[{sourceLabel:'N1',preference:'人工智能',quote:'架构变更将直接提升推理性能。'}]};
    else result = {content:'今日精选：云杉引擎开放试用，商业价格尚未公布 [N1]。',sourceLabels};
    res.setHeader('content-type','application/json'); res.end(JSON.stringify({choices:[{message:{content:JSON.stringify(result)}}],usage:{prompt_tokens:10,completion_tokens:20,total_tokens:30}}));
  });
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Fixture did not listen');
  const base = `http://127.0.0.1:${address.port}/v1`;
  const config = { ...environment.config, chatBaseUrl: base, embeddingBaseUrl: base, embeddingDim: 3, chatApiKey:'synthetic',embeddingApiKey:'synthetic',modelTimeoutMs:1000 };
  const model = new ModelClient(config), tasks = new TaskService(environment.db,config);
  const ctx: AppContext = {db:environment.db,config,model,tasks,logger:pino({level:'silent'})};
  return {ctx,a,b,newsId:news!.id,state,async cleanup(){
    try { await tasks.queue.obliterate({force:true}); await tasks.dead.obliterate({force:true}); }
    finally {
      const results=await Promise.allSettled([tasks.close(),ctx.model.close(),new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve())),environment.cleanup()]);
      const errors=results.filter(result=>result.status==='rejected').map(result=>result.reason);
      if(errors.length) throw new AggregateError(errors,'Editor fixture cleanup failed');
    }
  }};
}
export const idOf = (value: unknown) => z.object({id:z.string()}).parse(value).id;
