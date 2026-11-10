import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../src/server/application.js';
import { AuthService } from '../../src/server/modules/account/service.js';
import { EditorService } from '../../src/server/modules/editor/service.js';
import { editorEnvironment } from '../support/editor-fixture.js';

interface Failure { status: number; code: string; message: string; requestId?: string }
function eventData(body: string, name: string) {
  const frame = body.split('\n\n').find(part => part.startsWith(`event: ${name}\n`));
  assert.ok(frame, `Missing ${name} event`);
  return JSON.parse(frame.split('\ndata: ')[1]);
}

test('ACC-01/02 OPS-03 HTTP errors distinguish invalid fields, bad credentials and conflicts without writing', async () => {
  const env = await editorEnvironment(), app = await createApp(env.ctx);
  try {
    const before = await env.ctx.db.one('SELECT (SELECT count(*) FROM users) users,(SELECT count(*) FROM editors) editors,(SELECT count(*) FROM sessions) sessions');
    const requests = [
      {route:'register',payload:{username:'new_reader',password:'short'},status:400,message:'密码至少需要 8 个字符',field:'password'},
      {route:'login',payload:{username:env.a.username,password:'short'},status:400,message:'密码至少需要 8 个字符',field:'password'},
      {route:'register',payload:{username:'a',password:'correct-password'},status:400,message:'用户名至少需要 3 个字符',field:'username'},
      {route:'login',payload:{username:env.a.username,password:'incorrect-password'},status:401,message:'用户名或密码错误'},
      {route:'login',payload:{username:'unknown_reader',password:'incorrect-password'},status:401,message:'用户名或密码错误'},
      {route:'register',payload:{username:env.a.username,password:'correct-password'},status:409,message:'用户名已被使用'},
    ];
    const ids = new Set<string>();
    for (const item of requests) {
      const response = await app.inject({method:'POST',url:`/api/v1/auth/${item.route}`,payload:item.payload});
      const body = response.json();
      assert.equal(response.statusCode,item.status);
      assert.equal(body.message,item.message);
      if (item.field) assert.equal(body.data.fieldErrors[item.field],item.message);
      assert.match(body.requestId,/^[0-9a-f-]{36}$/);
      ids.add(body.requestId);
      assert.ok(!response.body.includes(item.payload.password));
    }
    assert.equal(ids.size,requests.length);
    assert.deepEqual(await env.ctx.db.one('SELECT (SELECT count(*) FROM users) users,(SELECT count(*) FROM editors) editors,(SELECT count(*) FROM sessions) sessions'),before);
  } finally { await app.close(); await env.cleanup(); }
});

test('EDITOR-03 MCP quota errors persist the same safe cause through SSE, reload and retry', async () => {
  const env = await editorEnvironment(), app = await createApp(env.ctx);
  try {
    const login = await new AuthService(env.ctx.db).login({username:env.a.username,password:'correct-password'});
    const headers = {authorization:`Bearer ${login.accessToken}`};
    const conversation = (await app.inject({method:'POST',url:'/api/v1/conversations',headers,payload:{title:'来源查询'}})).json().data;
    const input = {content:'云杉引擎新闻'};
    env.state.mode = 'quota';
    const response = await app.inject({method:'POST',url:`/api/v1/conversations/${conversation.id}/messages`,headers,payload:input});
    assert.equal(response.statusCode,200);
    const failure: Failure = eventData(response.body,'error');
    assert.equal(failure.status,503);
    assert.equal(failure.code,'DEPENDENCY_UNAVAILABLE');
    assert.match(failure.message,/新闻检索服务.*额度/);
    assert.ok(failure.requestId);
    assert.ok(!response.body.includes('provider-private-marker'));
    assert.ok(!response.body.includes('event: complete'));
    const messages = (await app.inject({url:`/api/v1/conversations/${conversation.id}`,headers})).json().data.messages;
    assert.equal(messages.length,2);
    assert.equal(messages[1].status,'failed');
    assert.deepEqual(messages[1].error,failure);
    const service = new EditorService(env.ctx);
    const prepared = await service.prepare(env.a,conversation.id,{...input,retryMessageId:messages[1].id});
    const pending = (await service.conversation(env.a,conversation.id)).messages[1] as unknown as {error:Failure|null;status:string};
    assert.equal(pending.status,'pending');
    assert.equal(pending.error,null);
    env.state.mode = 'valid';
    await service.execute(prepared,()=>{},undefined,'retry-request');
    const completed = (await app.inject({url:`/api/v1/conversations/${conversation.id}`,headers})).json().data.messages;
    assert.equal(completed.length,2);
    assert.equal(completed[1].id,messages[1].id);
    assert.equal(completed[1].status,'completed');
    assert.equal(completed[1].error,null);
    assert.match(completed[1].content,/云杉引擎/);
  } finally { await app.close(); await env.cleanup(); }
});

test('EDITOR-03 interrupted and unexpected failures save useful safe reasons', async () => {
  const env = await editorEnvironment();
  try {
    const service = new EditorService(env.ctx);
    const interrupted = (await service.createConversation(env.a,'中断回答',{kind:'news',id:env.newsId}))!;
    await service.prepare(env.a,interrupted.id,{content:'概括报道'});
    await service.repository.failInterruptedAnswers();
    const recovered = (await service.conversation(env.a,interrupted.id)).messages[1] as unknown as {error:Failure};
    assert.equal(recovered.error.status,503);
    assert.match(recovered.error.message,/服务重启.*中断/);
    const unknown = (await service.createConversation(env.a,'异常回答'))!;
    env.ctx.model.embed = async () => { throw new Error('provider-private-marker'); };
    await service.execute(await service.prepare(env.a,unknown.id,{content:'云杉引擎'}),()=>{},undefined,'safe-failure');
    const saved = (await service.conversation(env.a,unknown.id)).messages[1] as unknown as {error:Failure};
    assert.equal(saved.error.requestId,'safe-failure');
    assert.equal(saved.error.message,'新闻工具暂不可用');
    assert.ok(!JSON.stringify(saved).includes('provider-private-marker'));
  } finally { await env.cleanup(); }
});
