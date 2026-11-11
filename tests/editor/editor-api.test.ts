import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../src/server/application.js';
import { AuthService } from '../../src/server/modules/account/service.js';
import { editorEnvironment } from '../support/editor-fixture.js';

test('EDITOR/SKILL HTTP routes validate inputs, isolate resources and return actual SSE events', async () => {
  const env=await editorEnvironment();const app=await createApp(env.ctx);
  try {
    const auth=new AuthService(env.ctx.db),login=await auth.login({username:env.a.username,password:'correct-password'}),other=await auth.login({username:env.b.username,password:'correct-password'});
    const headers={authorization:`Bearer ${login.accessToken}`},otherHeaders={authorization:`Bearer ${other.accessToken}`};
    for (const url of ['/api/v1/editor','/api/v1/conversations','/api/v1/memories','/api/v1/editor/digests','/api/v1/editor/journals','/api/v1/skills/mine']) assert.equal((await app.inject({url})).statusCode,401,url);
    assert.equal((await app.inject({url:'/api/v1/skills'})).statusCode,200);
    assert.equal((await app.inject({method:'PATCH',url:'/api/v1/editor',headers,payload:{name:'  '}})).statusCode,400);
    assert.equal((await app.inject({method:'PATCH',url:'/api/v1/editor',headers,payload:{avatar:'javascript:alert(1)'}})).statusCode,400);
    const config=await app.inject({method:'PATCH',url:'/api/v1/editor',headers,payload:{name:'新闻编辑',interests:'开源模型'}});assert.equal(config.json().data.interests,'开源模型');
    const conversation=(await app.inject({method:'POST',url:'/api/v1/conversations',headers,payload:{title:'新闻问题',context:{kind:'news',id:env.newsId}}})).json().data;
    assert.ok(conversation.id);
    assert.equal((await app.inject({url:`/api/v1/conversations/${conversation.id}`,headers:otherHeaders})).statusCode,404);
    const stream=await app.inject({method:'POST',url:`/api/v1/conversations/${conversation.id}/messages`,headers,payload:{content:'何时开放试用？'}});
    assert.equal(stream.statusCode,200);assert.match(stream.headers['content-type'] as string,/text\/event-stream/);
    for (const event of ['meta','tool','sources','text','complete']) assert.ok(stream.body.includes(`event: ${event}`),event);
    assert.ok(!stream.body.includes('event: error'));
    const memory=(await app.inject({method:'POST',url:'/api/v1/memories',headers,payload:{key:'response-style',content:'简短回答'}})).json().data;
    assert.equal((await app.inject({method:'PATCH',url:`/api/v1/memories/${memory.id}`,headers:otherHeaders,payload:{content:'越权'}})).statusCode,404);
    assert.equal((await app.inject({url:`/api/v1/memories/${memory.id}`,headers:otherHeaders})).statusCode,404);
    const catalog=(await app.inject({url:'/api/v1/skills'})).json().data.items;
    const skill=(await app.inject({method:'POST',url:`/api/v1/skills/${catalog[0].id}/install`,headers})).json().data;
    assert.equal((await app.inject({method:'PATCH',url:`/api/v1/skills/mine/${skill.id}`,headers,payload:{instructions:' '}})).statusCode,400);
    assert.equal((await app.inject({method:'PATCH',url:`/api/v1/skills/mine/${skill.id}`,headers:otherHeaders,payload:{enabled:false}})).statusCode,404);
    assert.equal((await app.inject({url:'/api/v1/admin/skills',headers})).statusCode,403);
    const daily=await app.inject({method:'POST',url:'/api/v1/editor/digests/generate',headers,payload:{operationId:'daily-api'}});assert.equal(daily.statusCode,202);assert.ok(daily.json().data.taskId);
    assert.equal((await app.inject({url:daily.json().data.statusUrl,headers:otherHeaders})).statusCode,404);
    assert.equal((await app.inject({method:'POST',url:'/api/v1/editor/digests/generate',headers,payload:{date:'2026-02-30',operationId:'bad-date'}})).statusCode,400);
  } finally {await app.close();await env.cleanup();}
});

test('EDITOR-03 disconnected browser stream persists an incomplete answer', async () => {
  const env=await editorEnvironment();const app=await createApp(env.ctx);
  try {
    const login=await new AuthService(env.ctx.db).login({username:env.a.username,password:'correct-password'});
    const headers={authorization:`Bearer ${login.accessToken}`};
    const conversation=(await app.inject({method:'POST',url:'/api/v1/conversations',headers,payload:{title:'中断连接',context:{kind:'news',id:env.newsId}}})).json().data;
    const base=await app.listen({host:'127.0.0.1',port:0});env.state.delay=250;
    const controller=new AbortController();
    const response=await fetch(`${base}/api/v1/conversations/${conversation.id}/messages`,{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({content:'请解释新闻'}),signal:controller.signal});
    assert.equal(response.status,200);const reader=response.body!.getReader();
    const first=await reader.read();assert.ok(new TextDecoder().decode(first.value).includes('event: meta'));
    controller.abort();
    let status='pending';
    for(let attempt=0;attempt<30&&status==='pending';attempt++){
      await new Promise(resolve=>setTimeout(resolve,20));
      status=(await env.ctx.db.one<{status:string}>("SELECT status FROM messages WHERE conversation_id=$1 AND role='assistant'",[conversation.id]))!.status;
    }
    assert.equal(status,'failed');
  } finally {await app.close();await env.cleanup();}
});

test('SEC-14 invalid model output is not delivered over HTTP or stored in the conversation', async () => {
  const env=await editorEnvironment();const app=await createApp(env.ctx);
  try {
    const login=await new AuthService(env.ctx.db).login({username:env.a.username,password:'correct-password'});
    const headers={authorization:`Bearer ${login.accessToken}`};
    const conversation=(await app.inject({method:'POST',url:'/api/v1/conversations',headers,payload:{title:'不可信回答',context:{kind:'news',id:env.newsId}}})).json().data;
    env.state.mode='bad-citation';
    const response=await app.inject({method:'POST',url:`/api/v1/conversations/${conversation.id}/messages`,headers,payload:{content:'报道内容是什么？'}});
    assert.match(response.body,/event: error/);
    assert.doesNotMatch(response.body,/价格为99元|N999|event: text/);
    const saved=(await app.inject({url:`/api/v1/conversations/${conversation.id}`,headers})).json().data;
    assert.equal(saved.messages.at(-1).status,'failed');
    assert.equal(saved.messages.at(-1).content,'');
  } finally {await app.close();await env.cleanup();}
});
