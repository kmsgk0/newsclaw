import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createApp } from '../../src/server/application.js';
import { AuthService } from '../../src/server/modules/account/service.js';
import { EditorService } from '../../src/server/modules/editor/service.js';
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
