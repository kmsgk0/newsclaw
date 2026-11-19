import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {editorEnvironment} from '../support/editor-fixture.js';
import {TopicsService} from '../../src/server/modules/topics/service.js';
import {createApp} from '../../src/server/application.js';

test('TOPIC-08 Markdown downloads retain content, source labels and tree depth without private notes',async()=>{
  const env=await editorEnvironment();const app=await createApp(env.ctx);
  try {
    const topics=new TopicsService(env.ctx);
    const topic=await topics.repo.create(env.a.id,{name:'导出测试',description:'',filter:{keywords:'云杉'}});
    await topics.repo.addNote(topic.id,env.a.id,'PRIVATE-NOTE-DO-NOT-EXPORT');
    const brief=await topics.save(topic.id,env.a,{title:'../中文\r\n成果',kind:'brief',content:'## 已知事实\n\n商业价格尚未公布 [N1]。',sourceIds:[env.newsId]});
    const tree={label:'根节点',sourceIds:[env.newsId],children:[{label:'子节点',sourceIds:[env.newsId],children:[{label:'深层节点',sourceIds:[env.newsId]}]}]};
    const map=await topics.save(topic.id,env.a,{title:'导图',kind:'mindmap',content:'fallback',structure:tree,sourceIds:[env.newsId]});
    const login=await app.inject({method:'POST',url:'/api/v1/auth/login',payload:{username:env.a.username,password:'correct-password'}});
    const other=await app.inject({method:'POST',url:'/api/v1/auth/login',payload:{username:env.b.username,password:'correct-password'}});
    const headers={authorization:`Bearer ${login.json().data.accessToken}`},bh={authorization:`Bearer ${other.json().data.accessToken}`};
    const response=await app.inject({url:`/api/v1/artifacts/${brief.id}/export`,headers});
    assert.equal(response.statusCode,200);assert.match(String(response.headers['content-type']),/text\/markdown/);
    assert.ok(response.body.startsWith('# '));assert.match(response.body,/保存时间：/);
    assert.match(response.body,/商业价格尚未公布 \[N1\]/);assert.match(response.body,/\[N1\]: <https:\/\/example.com\/news>/);
    assert.ok(!response.body.includes('PRIVATE-NOTE-DO-NOT-EXPORT'));
    assert.ok(!String(response.headers['content-disposition']).includes('\r'));
    assert.ok(!String(response.headers['content-disposition']).includes('\n'));
    const mapped=await app.inject({url:`/api/v1/artifacts/${map.id}/export`,headers});
    assert.match(mapped.body,/- 根节点 \[N1\]\n  - 子节点 \[N1\]\n    - 深层节点 \[N1\]/);
    assert.equal((await app.inject({url:`/api/v1/artifacts/${brief.id}/export`,headers:bh})).statusCode,404);
    assert.equal((await app.inject({url:`/api/v1/artifacts/${randomUUID()}/export`,headers})).statusCode,404);
    assert.equal((await app.inject({url:`/api/v1/artifacts/${brief.id}/export`})).statusCode,401);
    await env.ctx.db.query("UPDATE artifacts SET content=repeat('x',1048577) WHERE id=$1",[brief.id]);
    const tooLarge=await app.inject({url:`/api/v1/artifacts/${brief.id}/export`,headers});
    assert.equal(tooLarge.statusCode,400);assert.equal(tooLarge.json().code,'INVALID_INPUT');
  }finally{await app.close();await env.cleanup();}
});
