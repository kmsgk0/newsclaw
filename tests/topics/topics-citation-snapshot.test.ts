import {test} from 'node:test';
import assert from 'node:assert/strict';
import {editorEnvironment} from '../support/editor-fixture.js';
import {EditorService} from '../../src/server/modules/editor/service.js';
import {SkillsService} from '../../src/server/modules/skills/service.js';
import {TopicsService} from '../../src/server/modules/topics/service.js';
test('TOPIC-01/06 saved comparison retains generated citation mapping', async () => {
  const env = await editorEnvironment();
  try {
    const event = await env.ctx.db.one<{id:string}>("INSERT INTO events(title,summary) VALUES('Trial event','Summary') RETURNING id");
    await env.ctx.db.query("UPDATE news SET event_id=$2,published_at='2026-10-10' WHERE id=$1", [env.newsId,event!.id]);
    const newer = await env.ctx.db.one<{id:string}>(`INSERT INTO news(source_id,url,title,published_at,content,content_scope,content_hash,event_id)
      SELECT source_id,'https://example.com/newer','Independent newer report','2026-10-11','Independent testing report','full','second',$2 FROM news WHERE id=$1 RETURNING id`,[env.newsId,event!.id]);
    const skills = new SkillsService(env.ctx);
    const skill = await skills.install(env.a,(await skills.list()).find(item=>item.kind==='comparison')!.id);
    const editor = new EditorService(env.ctx);
    const conversation = await editor.createConversation(env.a,'Compare reports',{kind:'event',id:event!.id});
    await editor.execute(await editor.prepare(env.a,conversation!.id,{content:'Compare the event reports',skillId:skill!.id}),()=>{});
    const answer = (await editor.conversation(env.a,conversation!.id)).messages.at(-1)!;
    assert.equal(answer.status,'completed');
    assert.equal(answer.sources[0].id,env.newsId);
    const topics = new TopicsService(env.ctx);
    const topic = await topics.repo.create(env.a.id,{name:'Trial',description:'',filter:{eventId:event!.id}});
    const originalTitle=answer.sources[0].title;
    const originalContent=(await env.ctx.db.one<{content:string}>('SELECT content FROM news WHERE id=$1',[env.newsId]))!.content;
    await env.ctx.db.query('UPDATE news SET title=$2,content=$3 WHERE id=$1',[env.newsId,'Changed after generation','New material after generation']);
    const artifact=answer.artifact!;
    const payload={title:artifact.title,kind:artifact.kind,content:artifact.content,structure:artifact.structure,skillId:artifact.skillId,sourceIds:artifact.sourceIds,messageId:artifact.messageId};
    const saved = await topics.save(topic.id,env.a,payload);
    const shared = await topics.repo.share(saved.id,env.a.id);
    const snapshot = await topics.repo.publicShare(shared.token) as {content:string;sources:{id:string;label?:string;title:string;content:string}[]};
    assert.deepEqual(snapshot.sources.map(x=>({id:x.id,label:x.label})),answer.sources.map(x=>({id:x.id,label:x.label})),'Saved sources must preserve the citation mapping of the generated result');
    assert.equal(snapshot.sources[0].title,originalTitle);
    assert.equal(snapshot.sources[0].content,originalContent);
    assert.deepEqual(await topics.repo.preview(saved.id,env.a.id),snapshot);
    await assert.rejects(topics.save(topic.id,env.b,payload),{code:'NOT_FOUND'});
    await assert.rejects(topics.save(topic.id,env.a,{...payload,content:'Forged text [N1]'}),{code:'INVALID_INPUT'});
    assert.ok(newer!.id);
  } finally { await env.cleanup(); }
});
