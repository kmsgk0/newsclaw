import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import pino from 'pino';
import { ModelClient, type ModelUsage } from '../../src/server/adapters/model.js';
import { EditorService } from '../../src/server/modules/editor/service.js';
import { SkillsService } from '../../src/server/modules/skills/service.js';
import { editorEnvironment } from '../support/editor-fixture.js';

test('OPS-04 answer logs and messages retain usage through JSON, schema and material failures', async t => {
  const env = await editorEnvironment();
  let content = '', suppliedUsage: unknown;
  const server = createServer(async (req, res) => {
    for await (const _chunk of req) { /* consume request */ }
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message: { content } }], usage: suppliedUsage }));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address === 'object');
  await env.ctx.model.close();
  env.ctx.model = new ModelClient({ ...env.ctx.config, chatBaseUrl: `http://127.0.0.1:${address.port}/v1` });
  const logs: { module?: string; requestId?: string; actorId?: string; skillId?: string; result?: string; durationMs?: number; usage?: ModelUsage }[] = [];
  env.ctx.logger = pino({ base: null }, { write: line => { logs.push(JSON.parse(line)); } });
  try {
    const editor = new EditorService(env.ctx), skills = new SkillsService(env.ctx);
    const template = (await skills.list()).find(item => item.kind === 'mindmap'); assert.ok(template);
    const skill = await skills.install(env.a, template.id); assert.ok(skill);
    const validContent = JSON.stringify({ label: '云杉引擎', sourceIds: [env.newsId] });
    const providerUsage = { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 };
    const expectedUsage: ModelUsage = { inputTokens: 10, outputTokens: 20, totalTokens: 30 };
    const unavailableUsage: ModelUsage = { inputTokens: null, outputTokens: null, totalTokens: null };
    const cases = [
      { name: 'valid', content: validContent, suppliedUsage: providerUsage, expectedUsage, status: 'completed' },
      { name: 'invalid-json', content: 'provider-private-marker', suppliedUsage: providerUsage, expectedUsage, status: 'failed' },
      { name: 'invalid-schema', content: '{"wrong":"provider-private-marker"}', suppliedUsage: providerUsage, expectedUsage, status: 'failed' },
      { name: 'invalid-material', content: JSON.stringify({ label: 'provider-private-marker', sourceIds: ['00000000-0000-4000-8000-000000000000'] }), suppliedUsage: providerUsage, expectedUsage, status: 'failed' },
      { name: 'missing-usage', content: 'provider-private-marker', suppliedUsage: undefined, expectedUsage: unavailableUsage, status: 'failed' },
      { name: 'partial-usage', content: 'provider-private-marker', suppliedUsage: { prompt_tokens: 10 }, expectedUsage: { inputTokens: 10, outputTokens: null, totalTokens: null }, status: 'failed' },
      { name: 'valid-missing-usage', content: validContent, suppliedUsage: undefined, expectedUsage: unavailableUsage, status: 'completed' },
    ];
    for (const item of cases) await t.test(item.name, async () => {
      content = item.content; suppliedUsage = item.suppliedUsage;
      const conversation = await editor.createConversation(env.a, 'Usage recording', { kind: 'news', id: env.newsId }); assert.ok(conversation);
      const requestId = `usage-${item.name}`, events: { name: string; data: unknown }[] = [];
      await editor.execute(await editor.prepare(env.a, conversation.id, { content: '生成导图', skillId: skill.id }), (name, data) => events.push({ name, data }), undefined, requestId);
      const answer = (await editor.conversation(env.a, conversation.id)).messages.at(-1); assert.ok(answer);
      const log = logs.find(entry => entry.module === 'editor' && entry.requestId === requestId); assert.ok(log);
      const stored = await env.ctx.db.one<{ usage: ModelUsage }>('SELECT usage FROM messages WHERE id=$1', [answer.id]); assert.ok(stored);
      assert.equal(answer.status, item.status);
      assert.equal(log.result, item.status === 'completed' ? 'succeeded' : 'failed');
      assert.equal(log.actorId, env.a.id); assert.equal(log.skillId, skill.id);
      assert.equal(typeof log.durationMs, 'number');
      assert.deepEqual(log.usage, item.expectedUsage); assert.deepEqual(stored.usage, item.expectedUsage);
      if (item.status === 'failed') {
        assert.equal(answer.content, ''); assert.equal(answer.artifact, null);
        assert.ok(events.some(event => event.name === 'error'));
        assert.ok(!events.some(event => event.name === 'complete' || event.name === 'artifact'));
        assert.equal(answer.error?.code, 'DEPENDENCY_UNAVAILABLE');
        assert.equal(answer.error?.requestId, requestId);
        assert.ok(!JSON.stringify({ answer, log, events }).includes('provider-private-marker'));
      } else {
        assert.equal(answer.artifact?.kind, 'mindmap');
        assert.ok(events.some(event => event.name === 'complete'));
      }
    });
  } finally { await env.cleanup(); server.close(); await once(server, 'close'); }
});
