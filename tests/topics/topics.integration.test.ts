import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { makeTestContext } from '../support/helpers.js';
import { AuthService } from '../../src/server/modules/account/service.js';
import { NewsRepository } from '../../src/server/modules/news/repository.js';
import { TopicsService,topicSchema,createTopicHandlers } from '../../src/server/modules/topics/service.js';
import { TopicsRepository } from '../../src/server/modules/topics/repository.js';
import { validateGraph,validateMindmap } from '../../src/server/modules/topics/validation.js';

async function fixture(){
  const env=await makeTestContext();const {ctx}=env;const auth=new AuthService(ctx.db);
  const a=await auth.register({username:'reader_a',password:'example-password'}),b=await auth.register({username:'reader_b',password:'example-password'});
  const news=new NewsRepository(ctx.db),topics=new TopicsService(ctx);
  const source=await news.saveSource({name:'Fixture source',kind:'rss',url:'https://news.example/feed',enabled:true,config:{}});
  const event=await ctx.db.one<{id:string}>('INSERT INTO events(title,summary) VALUES($1,$2) RETURNING id',['Spruce event','A real event from supplied reports']);
  const add=async(suffix:string)=>{const row=await news.upsert(source.id,{title:`Spruce ${suffix}`,url:`https://news.example/${suffix}`,publishedAt:new Date().toISOString(),content:'Spruce Engine opened for trial. Price not announced.',contentScope:'summary'});await ctx.db.query('UPDATE news SET event_id=$2 WHERE id=$1',[row.id,event!.id]);return String(row.id);};
  const first=await add('first');return {...env,a,b,news,topics,eventId:event!.id,first,add};
}
test('TOPIC-01 topics collect reports, retain notes, mark new content and isolate owners',async()=>{
  const f=await fixture();try{
    assert.throws(()=>topicSchema.parse({name:'Empty',filter:{}}));
    const topic=await f.topics.repo.create(f.a.id,{name:'Spruce',description:'Track releases',filter:{keywords:'Spruce'}});
    assert.equal((await f.topics.detail(topic.id,f.a)).news.length,1);
    await f.topics.repo.addNote(topic.id,f.a.id,'Private note');await f.topics.repo.markRead(topic.id,f.a.id);
    const next=await f.add('next');const detail=await f.topics.detail(topic.id,f.a);assert.equal(detail.news.length,2);assert.equal(detail.unreadCount,1);assert.equal(detail.news.find(n=>n.id===next)?.unread,true);assert.equal(detail.notes[0].content,'Private note');
    await f.topics.repo.addNews(topic.id,f.a.id,f.first);assert.equal((await f.topics.detail(topic.id,f.a)).news.length,2);
    await f.ctx.db.query('UPDATE news SET summary=$2 WHERE id=$1',[f.first,'发布新的语音模型']);const chinese=await f.topics.repo.create(f.a.id,{name:'模型跟进',description:'',filter:{keywords:'模型'}});assert.equal((await f.topics.detail(chinese.id,f.a)).news[0].id,f.first);assert.equal((await f.news.search({q:'模型'})).items[0].id,f.first);
    for(const id of [topic.id,randomUUID()]){await assert.rejects(f.topics.detail(id,f.b),{code:'NOT_FOUND'});await assert.rejects(f.topics.repo.addNote(id,f.b.id,'intrusion'),{code:'NOT_FOUND'});}
    assert.equal((await f.topics.repo.list(f.b.id)).items.length,0);
    await f.topics.repo.remove(topic.id,f.a.id);await assert.rejects(f.topics.detail(topic.id,f.a),{code:'NOT_FOUND'});
  }finally{await f.cleanup();}
});
test('TOPIC-01/04/06 artifacts keep versions and exact share snapshots with revocation',async()=>{
  const f=await fixture();try{
    const topic=await f.topics.repo.create(f.a.id,{name:'Spruce',description:'',filter:{eventId:f.eventId}});
    await f.topics.repo.addNote(topic.id,f.a.id,'Private sensitive note');
    const tree={label:'Spruce trial',sourceIds:[f.first],children:[{label:'Price undisclosed',sourceIds:[f.first]}]};
    const first=await f.topics.save(topic.id,f.a,{title:'Mindmap',kind:'mindmap',content:'Spruce trial overview',structure:tree,skillId:'mindmap',sourceIds:[f.first]});
    const next=await f.topics.save(topic.id,f.a,{title:'Second brief',kind:'brief',content:'A later independent brief',sourceIds:[f.first]});assert.notEqual(first.id,next.id);
    assert.equal((await f.topics.repo.artifacts(topic.id,f.a.id)).length,2);
    await assert.rejects(f.topics.save(topic.id,f.a,{title:'Invalid',kind:'mindmap',content:'No basis',structure:{label:'Invalid',sourceIds:[randomUUID()]},sourceIds:[f.first]}),{code:'DEPENDENCY_UNAVAILABLE'});
    await assert.rejects(f.topics.save(topic.id,f.b,{title:'No access',kind:'brief',content:'Invalid',sourceIds:[f.first]}),{code:'NOT_FOUND'});
    const preview=await f.topics.repo.preview(first.id,f.a.id);assert.ok(!JSON.stringify(preview).includes('Private sensitive note'));
    const share=await f.topics.repo.share(first.id,f.a.id);assert.deepEqual(await f.topics.repo.publicShare(share.token),preview);
    await assert.rejects(f.topics.repo.revoke(share.token,f.b.id),{code:'NOT_FOUND'});await assert.rejects(f.topics.repo.share(first.id,f.b.id),{code:'NOT_FOUND'});
    await f.topics.repo.revoke(share.token,f.a.id);await f.topics.repo.revoke(share.token,f.a.id);await assert.rejects(f.topics.repo.publicShare(share.token),{code:'NOT_FOUND'});assert.deepEqual(await f.topics.repo.preview(first.id,f.a.id),preview);
  }finally{await f.cleanup();}
});
test('TOPIC-02 notifications deduplicate overlapping follows, honor cancellation and roll back failures',async()=>{
  const f=await fixture();try{
    const topic=await f.topics.repo.create(f.a.id,{name:'Spruce',description:'',filter:{eventId:f.eventId}});
    await f.topics.repo.follow(f.a.id,'event',f.eventId,true);await f.topics.repo.follow(f.a.id,'topic',topic.id,true);
    const notify=async(id:string)=>f.ctx.db.tx(tx=>new TopicsRepository(tx).notify(id));
    await notify(f.first);await notify(f.first);assert.equal((await f.topics.repo.notifications(f.a.id,1,20)).total,1);
    const next=await f.add('next');await notify(next);assert.equal((await f.topics.repo.notifications(f.a.id,1,20)).total,2);
    await f.topics.repo.follow(f.a.id,'event',f.eventId,false);await f.topics.repo.follow(f.a.id,'topic',topic.id,false);await notify(await f.add('third'));assert.equal((await f.topics.repo.notifications(f.a.id,1,20)).total,2);
    const notification=(await f.topics.repo.notifications(f.a.id,1,20)).items[0];await assert.rejects(f.topics.repo.readNotification(String(notification.id),f.b.id),{code:'NOT_FOUND'});await f.topics.repo.readNotification(String(notification.id),f.a.id);assert.equal((await f.topics.repo.notifications(f.a.id,1,20)).unreadCount,1);
    await f.topics.repo.follow(f.a.id,'event',f.eventId,true);await f.topics.repo.follow(f.b.id,'event',f.eventId,true);
    const fourth=await f.add('fourth');await f.ctx.db.query("CREATE FUNCTION reject_notification() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture failure'; END $$");await f.ctx.db.query('CREATE TRIGGER reject_notification BEFORE INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION reject_notification()');
    await assert.rejects(notify(fourth));assert.equal((await f.ctx.db.query('SELECT * FROM notifications WHERE news_id=$1',[fourth])).length,0);
    await f.ctx.db.query('DROP TRIGGER reject_notification ON notifications');await notify(fourth);await notify(fourth);assert.equal((await f.ctx.db.query('SELECT * FROM notifications WHERE news_id=$1',[fourth])).length,2);
    const handler=createTopicHandlers(f.ctx).notify;assert.ok(handler);
  }finally{await f.cleanup();}
});
test('TOPIC-03/05 heat, timeline and graph preserve source evidence and current event assignment',async()=>{
  const f=await fixture();try{
    const second=await f.add('second');await f.topics.repo.updateHeat();const from=new Date(Date.now()-86400000).toISOString(),to=new Date(Date.now()+1000).toISOString();const trends=await f.topics.repo.trends(from,to,1,20);assert.equal(trends.items[0].reportCount,2);assert.equal(trends.items[0].sourceCount,1);assert.equal(trends.items[0].history[0].reportCount,2);
    const timeline=await f.topics.repo.timeline(f.eventId);assert.equal(timeline.items.length,2);
    const graph=validateGraph({entities:[{name:'Spruce lab',type:'company'},{name:'Spruce Engine',type:'product'},{name:'Independent person',type:'person'}],relations:[{source:'Spruce lab',target:'Spruce Engine',label:'released',sourceIds:[f.first]}]},[f.first]);
    await f.ctx.db.tx(tx=>new TopicsRepository(tx).saveGraph(f.first,graph));const result=await f.topics.repo.graph([f.first]);assert.equal(result.nodes.length,3);assert.equal(result.edges.length,1);assert.deepEqual(result.edges[0].sourceIds,[f.first]);
    assert.throws(()=>validateGraph({...graph,relations:[{source:'Spruce lab',target:'Spruce Engine',label:'acquired',sourceIds:[second]}]},[f.first]),{code:'DEPENDENCY_UNAVAILABLE'});
    assert.throws(()=>validateMindmap({label:'bad',sourceIds:[randomUUID()]},[f.first]),{code:'DEPENDENCY_UNAVAILABLE'});
    await f.ctx.db.query('UPDATE news SET event_id=NULL WHERE id=$1',[f.first]);assert.equal((await f.news.event(f.eventId)).news.length,1);assert.equal((await f.topics.repo.graph((await f.news.event(f.eventId)).news.map(n=>n.id))).edges.length,0);
    await f.ctx.db.query('ALTER TABLE relations RENAME TO relations_unavailable');await assert.rejects(f.topics.repo.graph([f.first]));await f.ctx.db.query('ALTER TABLE relations_unavailable RENAME TO relations');
  }finally{await f.cleanup();}
});
