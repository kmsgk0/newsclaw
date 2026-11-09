import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../src/server/application.js';
import { AuthService } from '../../src/server/modules/account/service.js';
import { editorEnvironment } from '../support/editor-fixture.js';

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
