import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {editorEnvironment} from '../support/editor-fixture.js';
import {createApp} from '../../src/server/application.js';
import {EditorService} from '../../src/server/modules/editor/service.js';

test('EDITOR-08 feedback follows answer ownership, completion and citations; admin aggregates exclude private notes',async()=>{
  const env=await editorEnvironment();const app=await createApp(env.ctx);
  try {
    const editor=new EditorService(env.ctx);
    const conversation=(await editor.createConversation(env.a,'PRIVATE-CONVERSATION',{kind:'news',id:env.newsId}))!;
    const prepared=await editor.prepare(env.a,conversation.id,{content:'PRIVATE-QUESTION'});
    const login=async(username:string)=>({authorization:`Bearer ${(await app.inject({method:'POST',url:'/api/v1/auth/login',payload:{username,password:'correct-password'}})).json().data.accessToken}`});
    const headers=await login(env.a.username),other=await login(env.b.username);
    const url=`/api/v1/messages/${prepared.messageId}/feedback`;
    assert.equal((await app.inject({method:'POST',url,headers,payload:{category:'helpful'}})).statusCode,409);
    await editor.execute(prepared,()=>{});
    const messages=await editor.repository.messages(conversation.id);
    const user=messages.find(message=>message.role==='user')!;
    assert.equal((await app.inject({method:'POST',url:`/api/v1/messages/${user.id}/feedback`,headers,payload:{category:'helpful'}})).statusCode,409);
    for(const method of ['GET','POST','DELETE'] as const) {
      const payload=method==='POST'?{category:'helpful'}:undefined;
      assert.equal((await app.inject({method,url,headers:other,payload})).statusCode,404);
      assert.equal((await app.inject({method,url:`/api/v1/messages/${randomUUID()}/feedback`,headers,payload})).statusCode,404);
      assert.equal((await app.inject({method,url,payload})).statusCode,401);
    }
    assert.equal((await app.inject({url,headers})).json().data,null);
    for(const payload of [{category:'unknown'},{category:'inaccurate',note:'x'.repeat(1001)},{category:'unsupported_citation',sourceLabel:'N999'},{category:'unsupported_citation'},{category:'helpful',sourceLabel:'N1'},{category:'helpful',userId:env.b.id}]) {
      assert.equal((await app.inject({method:'POST',url,headers,payload})).statusCode,400);
    }
    assert.equal((await env.ctx.db.one<{count:number}>('SELECT count(*)::int AS count FROM answer_feedback'))!.count,0);
    assert.equal((await app.inject({method:'POST',url,headers,payload:{category:'helpful'}})).json().data.category,'helpful');
    const saved=await app.inject({method:'POST',url,headers,payload:{category:'unsupported_citation',sourceLabel:'N1',note:'PRIVATE-FEEDBACK-NOTE'}});
    assert.equal(saved.statusCode,200);assert.equal(saved.json().data.sourceLabel,'N1');
    assert.equal((await app.inject({url,headers})).json().data.note,'PRIVATE-FEEDBACK-NOTE');
    const restored=await app.inject({url:`/api/v1/conversations/${conversation.id}`,headers});
    assert.equal(restored.json().data.messages.find((item:{id:string})=>item.id===prepared.messageId).feedback.note,'PRIVATE-FEEDBACK-NOTE');
    assert.equal((await env.ctx.db.one<{count:number}>('SELECT count(*)::int AS count FROM answer_feedback'))!.count,1);
    assert.equal((await app.inject({url:'/api/v1/admin/feedback',headers})).statusCode,403);
    assert.equal((await app.inject({url:'/api/v1/admin/feedback'})).statusCode,401);
    await env.ctx.db.query("UPDATE users SET role='admin' WHERE id=$1",[env.b.id]);
    const admin=await login(env.b.username);
    const aggregate=await app.inject({url:'/api/v1/admin/feedback',headers:admin});
    assert.equal(aggregate.statusCode,200);
    assert.deepEqual(aggregate.json().data.categories,[{category:'unsupported_citation',count:1}]);
    assert.deepEqual(aggregate.json().data.sources,[{newsId:env.newsId,title:'云杉引擎开放试用',url:'https://example.com/news',count:1}]);
    for(const value of ['PRIVATE-',prepared.messageId,env.a.id]) assert.ok(!aggregate.body.includes(value));
    assert.equal((await app.inject({url,headers:admin})).statusCode,404);
    await app.inject({method:'POST',url,headers,payload:{category:'inaccurate'}});
    assert.deepEqual((await app.inject({url:'/api/v1/admin/feedback',headers:admin})).json().data,{categories:[{category:'inaccurate',count:1}],sources:[]});
    assert.equal((await app.inject({method:'DELETE',url,headers})).statusCode,200);
    assert.equal((await app.inject({method:'DELETE',url,headers})).statusCode,200);
    assert.equal((await app.inject({url,headers})).json().data,null);
    const failed=(await editor.createConversation(env.a,'失败回答'))!;
    const pending=await editor.prepare(env.a,failed.id,{content:'回答'});
    await env.ctx.db.query("UPDATE messages SET status='failed' WHERE id=$1",[pending.messageId]);
    assert.equal((await app.inject({method:'POST',url:`/api/v1/messages/${pending.messageId}/feedback`,headers,payload:{category:'helpful'}})).statusCode,409);
    assert.equal((await env.ctx.db.one<{count:number}>('SELECT count(*)::int AS count FROM answer_feedback'))!.count,0);
    await app.inject({method:'POST',url,headers,payload:{category:'helpful'}});
    await editor.repository.removeConversation(env.a.id,conversation.id);
    assert.equal((await env.ctx.db.one<{count:number}>('SELECT count(*)::int AS count FROM answer_feedback'))!.count,0);
  }finally{await app.close();await env.cleanup();}
});
