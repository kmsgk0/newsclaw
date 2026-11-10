import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createApp } from '../../src/server/application.js';
import { AuthService } from '../../src/server/modules/account/service.js';
import { EditorService } from '../../src/server/modules/editor/service.js';
import { TopicsService } from '../../src/server/modules/topics/service.js';
import { schedule } from '../../src/server/worker.js';
import { businessDate } from '../../src/server/modules/editor/calendar.js';
import { editorEnvironment } from '../support/editor-fixture.js';

test('EDITOR-03 conversation management and retry retain one question and enforce ownership', async () => {
  const env = await editorEnvironment();
  const app = await createApp(env.ctx);
  try {
    const login = await new AuthService(env.ctx.db).login({ username: env.a.username, password: 'correct-password' });
    const other = await new AuthService(env.ctx.db).login({ username: env.b.username, password: 'correct-password' });
    const headers = { authorization: `Bearer ${login.accessToken}` };
    const otherHeaders = { authorization: `Bearer ${other.accessToken}` };
    const editor = new EditorService(env.ctx);
    const conversation = (await editor.createConversation(env.a, '试用安排', { kind: 'news', id: env.newsId }))!;
    assert.equal((await app.inject({ method: 'PATCH', url: `/api/v1/conversations/${conversation.id}`, headers, payload: { title: '云杉引擎' } })).statusCode, 200);
    assert.equal((await editor.conversation(env.a, conversation.id)).title, '云杉引擎');
    assert.equal((await app.inject({ method: 'DELETE', url: `/api/v1/conversations/${conversation.id}`, headers: otherHeaders })).statusCode, 404);
    env.state.mode = 'failure';
    await editor.execute(await editor.prepare(env.a, conversation.id, { content: '什么时候试用？' }), () => {});
    const failed = (await editor.conversation(env.a, conversation.id)).messages.at(-1)!;
    assert.equal(failed.status, 'failed');
    env.state.mode = 'valid';
    const response = await app.inject({ method: 'POST', url: `/api/v1/conversations/${conversation.id}/messages`, headers, payload: { content: '什么时候试用？', retryMessageId: failed.id } });
    assert.equal(response.statusCode, 200);
    assert.match(response.body, /event: complete/);
    const messages = (await editor.conversation(env.a, conversation.id)).messages;
    assert.equal(messages.length, 2);
    assert.equal(messages[1].id, failed.id);
    assert.equal(messages[1].status, 'completed');
    assert.equal((await app.inject({ method: 'DELETE', url: `/api/v1/conversations/${conversation.id}`, headers })).statusCode, 200);
    await assert.rejects(editor.conversation(env.a, conversation.id), { code: 'NOT_FOUND' });
  } finally { await app.close(); await env.cleanup(); }
});

test('TOPIC-01 excluded reports stay removed, notes are editable, artifact deletion revokes its shares', async () => {
  const env = await editorEnvironment();
  try {
    const service = new TopicsService(env.ctx);
    const topic = await service.repo.create(env.a.id, { name: '云杉', description: '', filter: { keywords: '云杉' } });
    assert.equal((await service.detail(topic.id, env.a)).news.length, 1);
    await assert.rejects(service.repo.removeNews(topic.id, env.b.id, env.newsId), { code: 'NOT_FOUND' });
    await service.repo.removeNews(topic.id, env.a.id, env.newsId);
    assert.equal((await service.detail(topic.id, env.a)).news.length, 0);
    await service.repo.addNews(topic.id, env.a.id, env.newsId);
    assert.equal((await service.detail(topic.id, env.a)).news.length, 1);
    const note = await service.repo.addNote(topic.id, env.a.id, '初始笔记');
    await assert.rejects(service.repo.updateNote(topic.id, String(note.id), env.b.id, '越权'), { code: 'NOT_FOUND' });
    await service.repo.updateNote(topic.id, String(note.id), env.a.id, '## 关注\n\n- 试用时间');
    assert.equal((await service.repo.notes(topic.id, env.a.id))[0].content, '## 关注\n\n- 试用时间');
    await assert.rejects(service.repo.removeNote(topic.id, String(note.id), env.b.id), { code: 'NOT_FOUND' });
    await service.repo.removeNote(topic.id, String(note.id), env.a.id);
    assert.equal((await service.repo.notes(topic.id, env.a.id)).length, 0);
    const artifact = await service.save(topic.id, env.a, { title: '简报', kind: 'brief', content: '试用安排 [N1]', sourceIds: [env.newsId] });
    const share = await service.repo.share(artifact.id, env.a.id);
    await assert.rejects(service.repo.renameArtifact(artifact.id, env.b.id, '越权'), { code: 'NOT_FOUND' });
    await service.repo.renameArtifact(artifact.id, env.a.id, '本周试用安排');
    assert.equal((await service.repo.artifacts(topic.id, env.a.id))[0].title, '本周试用安排');
    assert.equal((await service.repo.publicShare(share.token)).title, '简报');
    await assert.rejects(service.repo.removeArtifact(artifact.id, env.b.id), { code: 'NOT_FOUND' });
    await service.repo.removeArtifact(artifact.id, env.a.id);
    await assert.rejects(service.repo.publicShare(share.token), { code: 'NOT_FOUND' });
    assert.equal((await service.detail(topic.id, env.a)).news.length, 1);
  } finally { await env.cleanup(); }
});

test('TOPIC-02 notifications retain overlapping follow reasons and read-all is account scoped', async () => {
  const env = await editorEnvironment();
  try {
    const service = new TopicsService(env.ctx);
    const event = (await env.ctx.db.one<{ id: string }>('INSERT INTO events(title,summary) VALUES($1,$2) RETURNING id', ['云杉引擎', '试用安排']))!;
    await env.ctx.db.query('UPDATE news SET event_id=$2 WHERE id=$1', [env.newsId, event.id]);
    const topic = await service.repo.create(env.a.id, { name: '我的云杉专题', description: '', filter: { eventId: event.id } });
    await service.repo.follow(env.a.id, 'event', event.id, true);
    await service.repo.follow(env.a.id, 'topic', topic.id, true);
    await service.repo.follow(env.b.id, 'event', event.id, true);
    await service.repo.notify(env.newsId);
    await service.repo.notify(env.newsId);
    const received = await service.repo.notifications(env.a.id, 1, 20);
    assert.equal(received.total, 1);
    assert.equal(received.items[0].reasons.length, 2);
    assert.equal((await service.repo.follows(env.a.id)).items.length, 2);
    await service.repo.readAllNotifications(env.a.id);
    assert.equal((await service.repo.notifications(env.a.id, 1, 20)).unreadCount, 0);
    assert.equal((await service.repo.notifications(env.b.id, 1, 20)).unreadCount, 1);
  } finally { await env.cleanup(); }
});

test('TOPIC-03 history uses Shanghai dates and a seven-day history separate from ranking', async () => {
  const env = await editorEnvironment();
  try {
    const service = new TopicsService(env.ctx);
    const event = (await env.ctx.db.one<{ id: string }>('INSERT INTO events(title,summary) VALUES($1,$2) RETURNING id', ['云杉引擎', '试用安排']))!;
    await env.ctx.db.query('UPDATE news SET event_id=$2,published_at=$3 WHERE id=$1', [env.newsId, event.id, '2026-11-08T18:00:00Z']);
    await env.ctx.db.query(`INSERT INTO news(source_id,url,title,published_at,content,content_scope,content_hash,event_id) SELECT source_id,$2,'早期报道',$3,content,content_scope,$4,$5 FROM news WHERE id=$1`, [env.newsId, `https://example.com/${randomUUID()}`, '2026-11-05T18:00:00Z', randomUUID(), event.id]);
    await service.repo.updateHeat();
    const result = await service.repo.trends('2026-11-08T12:00:00Z', '2026-11-09T12:00:00Z', 1, 20, 7);
    assert.equal(result.items[0].reportCount, 1);
    assert.deepEqual(result.items[0].history.map(item => item.date), ['2026-11-06', '2026-11-09']);
  } finally { await env.cleanup(); }
});

test('EDITOR-06 scheduler processes later same-day activity as a distinct batch', async () => {
  const env = await editorEnvironment();
  try {
    await env.ctx.db.query('UPDATE news_sources SET enabled=false');
    await env.ctx.db.query("INSERT INTO activities(user_id,kind,news_id) VALUES($1,'read',$2)", [env.a.id, env.newsId]);
    const now = new Date('2026-11-09T03:00:00Z');
    await schedule(env.ctx, now);
    const first = (await env.ctx.db.one<{ id: string; input: { activityEnd: string } }>("SELECT id,input FROM tasks WHERE owner_id=$1 AND type='journal'", [env.a.id]))!;
    assert.ok(first);
    await env.ctx.db.query("UPDATE tasks SET status='succeeded' WHERE id=$1", [first.id]);
    await env.ctx.db.query('UPDATE editors SET activity_cursor=$2 WHERE user_id=$1', [env.a.id, first.input.activityEnd]);
    await env.ctx.db.query("INSERT INTO activities(user_id,kind,news_id) VALUES($1,'favorite',$2)", [env.a.id, env.newsId]);
    await schedule(env.ctx, now);
    assert.equal((await env.ctx.db.query("SELECT id FROM tasks WHERE owner_id=$1 AND type='journal'", [env.a.id])).length, 2);
    await schedule(env.ctx, now);
    assert.equal((await env.ctx.db.query("SELECT id FROM tasks WHERE owner_id=$1 AND type='journal'", [env.a.id])).length, 2);
  } finally { await env.cleanup(); }
});

test('EDITOR-03 interrupted generation becomes retryable without losing the question', async () => {
  const env = await editorEnvironment();
  try {
    const service = new EditorService(env.ctx);
    const conversation = (await service.createConversation(env.a, '未完成的解读', { kind: 'news', id: env.newsId }))!;
    const prepared = await service.prepare(env.a, conversation.id, { content: '说明试用日期' });
    await env.ctx.db.query('UPDATE messages SET content=$2 WHERE id=$1', [prepared.messageId, '已经取得的部分内容']);
    await service.repository.failInterruptedAnswers();
    const interrupted = (await service.conversation(env.a, conversation.id)).messages;
    assert.equal(interrupted[1].status, 'failed');
    assert.equal(interrupted[1].content, '已经取得的部分内容');
    await service.execute(await service.prepare(env.a, conversation.id, { content: '说明试用日期', retryMessageId: prepared.messageId }), () => {});
    const saved = (await service.conversation(env.a, conversation.id)).messages;
    assert.equal(saved.length, 2);
    assert.equal(saved[1].status, 'completed');
    assert.equal(saved[1].request?.context?.id, env.newsId);
  } finally { await env.cleanup(); }
});

test('EDITOR-04 scheduler waits for collection and replaces an empty snapshot when material arrives', async () => {
  const env = await editorEnvironment();
  try {
    const now = new Date();
    const date = businessDate(now);
    const scheduledAt = new Date(`${date}T12:00:00+08:00`);
    await env.ctx.db.query('UPDATE news_sources SET enabled=false');
    await env.ctx.db.query('UPDATE news SET selected=false');
    const collection = await env.ctx.tasks.submit(null, 'collect', { sourceId: randomUUID() }, 'collection-in-progress');
    await schedule(env.ctx, scheduledAt);
    assert.equal((await env.ctx.db.query("SELECT id FROM tasks WHERE type='daily'")).length, 0);
    await env.ctx.db.query("UPDATE tasks SET status='succeeded' WHERE id=$1", [collection.taskId]);
    await schedule(env.ctx, scheduledAt);
    const empty = (await env.ctx.db.one<{id:string;input:{news:unknown[]}}>("SELECT id,input FROM tasks WHERE type='daily' AND owner_id IS NULL"))!;
    assert.equal(empty.input.news.length, 0);
    await env.ctx.db.query("UPDATE tasks SET status='succeeded',result=$1 WHERE type='daily'", [JSON.stringify({status:'empty'})]);
    await env.ctx.db.query('UPDATE news SET selected=true WHERE id=$1', [env.newsId]);
    await schedule(env.ctx, scheduledAt);
    assert.equal((await env.ctx.db.query("SELECT id FROM tasks WHERE type='daily' AND owner_id IS NULL")).length, 2);
    await schedule(env.ctx, scheduledAt);
    assert.equal((await env.ctx.db.query("SELECT id FROM tasks WHERE type='daily' AND owner_id IS NULL")).length, 2);
    const history = await new EditorService(env.ctx).repository.readingHistory(env.a.id, 'daily');
    assert.equal(history.status, 'pending');
    assert.equal(history.date, date);
    assert.deepEqual(history.items, []);
  } finally { await env.cleanup(); }
});
