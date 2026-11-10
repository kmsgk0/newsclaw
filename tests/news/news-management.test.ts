import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {makeTestContext} from '../support/helpers.js';
import {createApp} from '../../src/server/application.js';
import {AuthService} from '../../src/server/modules/account/service.js';
import {NewsRepository} from '../../src/server/modules/news/repository.js';

test('NEWS-01/03 admin reprocessing and all-event lookup enforce authorization and preserve identity',async()=>{
  const env=await makeTestContext(); const app=await createApp(env.ctx);
  try {
    const auth=new AuthService(env.ctx.db);
    const reader=await auth.register({username:'news_reader',password:'example-password'});
    const manager=await auth.register({username:'news_manager',password:'example-password'});
    await env.ctx.db.query("UPDATE users SET role='admin' WHERE id=$1",[manager.id]);
    const readerHeaders={authorization:`Bearer ${(await auth.login({username:reader.username,password:'example-password'})).accessToken}`};
    const adminHeaders={authorization:`Bearer ${(await auth.login({username:manager.username,password:'example-password'})).accessToken}`};
    const repo=new NewsRepository(env.ctx.db);
    const source=await repo.saveSource({name:'Source',url:'https://example.org/feed',kind:'rss',config:{},enabled:true});
    const news=await repo.upsert(source.id,{title:'Original report',url:'https://example.org/report',publishedAt:'2020-01-01T12:00:00Z',content:'The original reported material.',contentScope:'full'});
    const event=await env.ctx.db.one<{id:string}>("INSERT INTO events(title,summary,created_at,updated_at) VALUES('An archived research event','Original overview','2020-01-01','2020-01-01') RETURNING id");
    await env.ctx.db.query('UPDATE news SET event_id=$2 WHERE id=$1',[news.id,event!.id]);
    const result=await app.inject({url:'/api/v1/events?q=archived'});
    assert.equal(result.statusCode,200);assert.equal(result.json().data.items[0].id,event!.id);assert.equal(result.json().data.items[0].reportCount,1);
    const url=`/api/v1/admin/news/${news.id}/reprocess`,payload={operationId:randomUUID(),refreshSource:false};
    assert.equal((await app.inject({method:'POST',url,payload})).statusCode,401);
    assert.equal((await app.inject({method:'POST',url,headers:readerHeaders,payload})).statusCode,403);
    const submitted=await app.inject({method:'POST',url,headers:adminHeaders,payload});
    assert.equal(submitted.statusCode,202);
    assert.equal((await app.inject({method:'POST',url,headers:adminHeaders,payload})).json().data.taskId,submitted.json().data.taskId);
    const task=await env.ctx.db.one('SELECT input FROM tasks WHERE id=$1',[submitted.json().data.taskId]);
    assert.deepEqual(task?.input,{sourceId:source.id,newsId:news.id,refreshSource:false,force:true});
    assert.equal((await repo.get(String(news.id))).eventId,event!.id);
    await repo.moveEvent(String(news.id),null,manager.id);
    await repo.group(String(news.id),'An archived research event','Original overview',[]);
    await repo.copyEvent(String(news.id),event!.id);
    assert.equal((await repo.get(String(news.id))).eventId,null,'Manual event removal survives automated grouping and copied processing');
    assert.equal((await app.inject({method:'POST',url:`/api/v1/admin/news/${randomUUID()}/reprocess`,headers:adminHeaders,payload})).statusCode,404);
    await env.ctx.db.query('UPDATE news_sources SET enabled=false WHERE id=$1',[source.id]);
    assert.equal((await app.inject({method:'POST',url,headers:adminHeaders,payload:{operationId:randomUUID()}})).statusCode,400);
  } finally {await app.close();await env.cleanup();}
});

test('NEWS-03 related reports join an event while another action by the same company stays separate',async()=>{
  const env=await makeTestContext();
  try {
    const repo=new NewsRepository(env.ctx.db),source=await repo.saveSource({name:'Events',url:'https://example.org/feed',kind:'rss',config:{},enabled:true});
    const add=async(title:string,summary:string,path:string,entities:string[])=>{
      const row=await repo.upsert(source.id,{title,url:`https://example.org/${path}`,content:summary,contentScope:'full',publishedAt:'2026-11-09T00:00:00Z'});
      await repo.updateProcessing(String(row.id),String(row.content_hash),{summary,extracted:{entities:entities.map(name=>({name,type:'company'})),relations:[]},processing:{}});
      await repo.group(String(row.id),title,summary,entities);
      return repo.get(String(row.id));
    };
    const a=await add('Spruce launches Engine research model','Spruce releases Engine, a research model available for testing. Commercial pricing remains unannounced.','a',['Spruce','Engine']);
    const b=await add('Engine research model released by Spruce','Spruce releases Engine, a research model available for testing. Documentation now includes evaluation details.','b',['Spruce','Engine']);
    const unrelated=await add('Spruce acquires a logistics company','Spruce has acquired Parcel Logistics to expand its delivery network in three cities.','c',['Spruce','Parcel Logistics']);
    assert.equal(b.eventId,a.eventId);assert.notEqual(unrelated.eventId,a.eventId);
    const event=await repo.event(a.eventId!);
    assert.equal(event.news.length,2);assert.match(event.summary,/evaluation details/);assert.match(event.summary,/pricing remains unannounced/);
  } finally {await env.cleanup();}
});

test('NEWS-06 business dates and available history keep Asia/Shanghai calendar values',async()=>{
  const env=await makeTestContext();
  try {
    const repo=new NewsRepository(env.ctx.db),source=await repo.saveSource({name:'Dates',url:'https://example.org/feed',kind:'rss',config:{},enabled:true});
    const row=await repo.upsert(source.id,{title:'After midnight',url:'https://example.org/midnight',content:'Original evidence',contentScope:'full',publishedAt:'2026-11-08T16:30:00Z'});
    assert.equal((await repo.dayNews('2026-11-08')).length,0);assert.equal((await repo.dayNews('2026-11-09')).length,1);
    await repo.saveDigest('2026-11-09','Daily','Report [N1]',[await repo.get(String(row.id))],new Date());
    const result=await repo.digests('2026-11-09');
    assert.equal(result.items[0].date,'2026-11-09');assert.deepEqual(result.availableDates,['2026-11-09']);assert.equal(result.status,'ready');
    assert.equal(result.items[0].sources[0].id,row.id);
  } finally {await env.cleanup();}
});
