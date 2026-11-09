import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {makeTestContext} from '../support/helpers.js';
import {createApp} from '../../src/server/application.js';
import {AuthService} from '../../src/server/modules/account/service.js';
import {NewsRepository} from '../../src/server/modules/news/repository.js';

test('NEWS/TOPIC API validates inputs and enforces public, owner and administrator access',async()=>{
  const env=await makeTestContext();env.ctx.config.allowedSourceHosts=['127.0.0.1'];const app=await createApp(env.ctx);
  try{
    const auth=new AuthService(env.ctx.db);const a=await auth.register({username:'reader_a',password:'example-password'});await auth.register({username:'reader_b',password:'example-password'});const m=await auth.register({username:'manager',password:'example-password'});await env.ctx.db.query("UPDATE users SET role='admin' WHERE id=$1",[m.id]);
    const headers=async(username:string)=>({authorization:`Bearer ${(await auth.login({username,password:'example-password'})).accessToken}`});const ah=await headers('reader_a'),bh=await headers('reader_b'),mh=await headers('manager');
    assert.equal((await app.inject({url:'/api/v1/news'})).statusCode,200);
    assert.equal((await app.inject({url:'/api/v1/topics'})).statusCode,401);
    assert.equal((await app.inject({url:'/api/v1/admin/sources',headers:ah})).statusCode,403);
    for(const url of ['/api/v1/news?pageSize=101','/api/v1/news?unknown=1','/api/v1/trends?sort=invalid','/api/v1/trends?from=2026-11-06T12:00:00Z&to=2026-11-05T12:00:00Z','/api/v1/digests?date=2026-99-40'])assert.equal((await app.inject({url})).statusCode,400,url);
    const invalidSource=await app.inject({method:'POST',url:'/api/v1/admin/sources',headers:mh,payload:{name:'bad',kind:'json',url:'http://127.0.0.1/feed',config:{fields:{title:12}}}});assert.equal(invalidSource.statusCode,400);
    assert.equal((await app.inject({method:'POST',url:'/api/v1/admin/sources',headers:mh,payload:{name:'bad web',kind:'web',url:'http://127.0.0.1/feed',config:{itemSelector:'['}}})).statusCode,400);
    const sourceResponse=await app.inject({method:'POST',url:'/api/v1/admin/sources',headers:mh,payload:{name:'Fixture',kind:'rss',url:'http://127.0.0.1/feed'}});assert.equal(sourceResponse.statusCode,201);const sourceId=sourceResponse.json().data.id as string;
    assert.equal((await app.inject({method:'PATCH',url:`/api/v1/admin/sources/${sourceId}`,headers:mh,payload:{enabled:false}})).statusCode,200);
    assert.equal((await app.inject({method:'POST',url:`/api/v1/admin/sources/${sourceId}/collect`,headers:mh,payload:{operationId:'collect-a'}})).statusCode,400);
    await app.inject({method:'PATCH',url:`/api/v1/admin/sources/${sourceId}`,headers:mh,payload:{enabled:true}});
    const submitted=await app.inject({method:'POST',url:`/api/v1/admin/sources/${sourceId}/collect`,headers:mh,payload:{operationId:'collect-a'}});assert.equal(submitted.statusCode,202);assert.equal(submitted.json().data.status,'pending');
    const n=await new NewsRepository(env.ctx.db).upsert(sourceId,{title:'Spruce report',url:'https://news.example/report',content:'Actual report content',contentScope:'full',publishedAt:new Date().toISOString()});const newsId=String(n.id);
    assert.equal((await app.inject({method:'POST',url:`/api/v1/news/${newsId}/favorite`,headers:ah,payload:{}})).statusCode,200);
    assert.equal((await app.inject({url:'/api/v1/library?kind=favorites',headers:bh})).json().data.total,0);
    const created=await app.inject({method:'POST',url:'/api/v1/topics',headers:ah,payload:{name:'Spruce',filter:{keywords:'Spruce'}}});assert.equal(created.statusCode,201);const topicId=created.json().data.id as string;
    assert.equal((await app.inject({method:'POST',url:'/api/v1/topics',headers:ah,payload:{name:'No scope',filter:{}}})).statusCode,400);
    for(const id of [topicId,randomUUID()])assert.equal((await app.inject({url:`/api/v1/topics/${id}`,headers:bh})).statusCode,404);
    assert.equal((await app.inject({url:`/api/v1/topics/${topicId}`,headers:ah})).json().data.news.length,1);
    await app.inject({method:'POST',url:`/api/v1/topics/${topicId}/notes`,headers:ah,payload:{content:'Only my private note'}});
    const saved=await app.inject({method:'POST',url:`/api/v1/topics/${topicId}/artifacts`,headers:ah,payload:{title:'Brief',kind:'brief',content:'A source-backed brief',sourceIds:[newsId]}});assert.equal(saved.statusCode,201);const artifactId=saved.json().data.id as string;
    const preview=await app.inject({url:`/api/v1/artifacts/${artifactId}/share-preview`,headers:ah});assert.equal(preview.statusCode,200);assert.ok(!preview.body.includes('Only my private note'));
    assert.equal((await app.inject({method:'POST',url:`/api/v1/artifacts/${artifactId}/shares`,headers:ah,payload:{confirmed:false}})).statusCode,400);
    const share=await app.inject({method:'POST',url:`/api/v1/artifacts/${artifactId}/shares`,headers:ah,payload:{confirmed:true}});assert.equal(share.statusCode,201);const token=share.json().data.token as string;
    assert.deepEqual((await app.inject({url:`/api/v1/shares/${token}`})).json().data,preview.json().data);
    assert.equal((await app.inject({method:'DELETE',url:`/api/v1/shares/${token}`,headers:bh})).statusCode,404);
    assert.equal((await app.inject({method:'DELETE',url:`/api/v1/shares/${token}`,headers:ah})).statusCode,200);
    assert.equal((await app.inject({url:`/api/v1/shares/${token}`})).statusCode,404);
    assert.equal((await env.ctx.db.one<{count:string}>('SELECT count(*) FROM topic_notes WHERE topic_id=$1',[topicId]))!.count,'1');assert.ok(a.id);
  }finally{await app.close();await env.cleanup();}
});
