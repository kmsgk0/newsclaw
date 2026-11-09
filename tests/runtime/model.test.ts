import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { z } from 'zod';
import { loadConfig } from '../../src/server/config.js';
import { ModelClient, ModelError, type ModelUsage } from '../../src/server/adapters/model.js';

test('EDITOR-02 model adapter validates structured results, dimensions and upstream errors', async () => {
  let mode = 'valid';
  const server = createServer(async (req, res) => {
    for await (const _chunk of req) { /* consume request */ }
    if (mode === 'error') { res.writeHead(401); res.end('secret-provider-detail'); return; }
    if (mode === 'quota' || mode === 'rate') { res.writeHead(429, {'content-type':'application/json'}); res.end(JSON.stringify({error:{message:mode==='quota'?'今日 token 额度已用完':'Too many requests'}})); return; }
    res.setHeader('content-type', 'application/json');
    if (req.url?.endsWith('/embeddings')) res.end(JSON.stringify({ data: [{ embedding: [1, 0, 0] }] }));
    else res.end(JSON.stringify({ choices: [{ message: { content: mode === 'invalid' ? '{"wrong":true}' : '{"answer":"material"}' } }], usage: { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15 } }));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}/v1`;
  const client = new ModelClient(loadConfig({ DATABASE_URL: 'postgresql://fixture:fixture@localhost/test', REDIS_URL: 'redis://localhost:6379', CHAT_BASE_URL: base, CHAT_API_KEY: 'synthetic', CHAT_MODEL: 'fixture', EMBEDDING_BASE_URL: base, EMBEDDING_API_KEY: 'synthetic', EMBEDDING_MODEL: 'fixture', EMBEDDING_DIM: '3' }));
  try {
    const result = await client.json('answer', {}, z.object({ answer: z.string() }));
    assert.equal(result.value.answer, 'material'); assert.equal(result.usage.totalTokens, 15);
    assert.deepEqual(await client.embed('hello'), [1, 0, 0]);
    mode = 'invalid'; await assert.rejects(client.json('answer', {}, z.object({ answer: z.string() })), /结构/);
    mode = 'error'; await assert.rejects(client.embed('hello'), error => !String(error).includes('secret-provider-detail') && String(error).includes('认证'));
    mode = 'quota'; await assert.rejects(client.embed('hello'), error => error instanceof ModelError && !error.retryable && error.message.includes('新闻检索服务额度'));
    await assert.rejects(client.json('answer', {}, z.object({ answer: z.string() })), error => error instanceof ModelError && !error.retryable && error.message.includes('内容生成服务额度'));
    mode = 'rate'; await assert.rejects(client.embed('hello'), error => error instanceof ModelError && error.retryable && error.message.includes('频繁'));
  } finally { await client.close(); server.close(); await once(server, 'close'); }
});

test('OPS-04 structured model failures preserve supplied usage without exposing response content', async t => {
  let payload: unknown;
  const server = createServer(async (req, res) => {
    for await (const _chunk of req) { /* consume request */ }
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(payload));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}/v1`;
  const client = new ModelClient(loadConfig({ DATABASE_URL: 'postgresql://fixture:fixture@localhost/test', REDIS_URL: 'redis://localhost:6379', CHAT_BASE_URL: base, CHAT_API_KEY: 'synthetic', CHAT_MODEL: 'fixture', EMBEDDING_BASE_URL: base, EMBEDDING_API_KEY: 'synthetic', EMBEDDING_MODEL: 'fixture' }));
  const usage = { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15 };
  const expectedUsage: ModelUsage = { inputTokens: 12, outputTokens: 3, totalTokens: 15 };
  const cases = [
    { name: 'invalid content JSON', payload: { choices: [{ message: { content: 'provider-private-marker' } }], usage }, expectedUsage },
    { name: 'invalid output schema', payload: { choices: [{ message: { content: '{"wrong":"provider-private-marker"}' } }], usage }, expectedUsage },
    { name: 'invalid response envelope', payload: { choices: [], usage }, expectedUsage },
    { name: 'missing usage', payload: { choices: [{ message: { content: 'provider-private-marker' } }] }, expectedUsage: { inputTokens: null, outputTokens: null, totalTokens: null } },
    { name: 'partial usage', payload: { choices: [{ message: { content: 'provider-private-marker' } }], usage: { prompt_tokens: 12 } }, expectedUsage: { inputTokens: 12, outputTokens: null, totalTokens: null } },
  ];
  try {
    for (const item of cases) await t.test(item.name, async () => {
      payload = item.payload;
      await assert.rejects(client.json('answer', {}, z.object({ answer: z.string() })), error => {
        assert.ok(error instanceof ModelError);
        assert.deepEqual(error.usage, item.expectedUsage);
        assert.equal(error.code, 'DEPENDENCY_UNAVAILABLE');
        assert.ok(error.retryable);
        assert.match(error.message, /结构/);
        assert.ok(!JSON.stringify(error).includes('provider-private-marker'));
        return true;
      });
    });
  } finally { await client.close(); server.close(); await once(server, 'close'); }
});

test('EDITOR-03 model stream preserves chunks and rejects truncated completion', async () => {
  let truncated = false;
  const server = createServer(async (req, res) => {
    for await (const _chunk of req) { /* consume request */ }
    res.setHeader('content-type', 'text/event-stream');
    res.write('data: {"choices":[{"delta":{"content":"第一段"}}]}\n\n');
    res.write('data: {"choices":[{"delta":{"content":"第二段"}}]}\n\n');
    if (!truncated) res.write('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
    res.end();
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}/v1`;
  const client = new ModelClient(loadConfig({ DATABASE_URL: 'postgresql://fixture:fixture@localhost/test', REDIS_URL: 'redis://localhost:6379', CHAT_BASE_URL: base, CHAT_API_KEY: 'synthetic', CHAT_MODEL: 'fixture', EMBEDDING_BASE_URL: base, EMBEDDING_API_KEY: 'synthetic', EMBEDDING_MODEL: 'fixture' }));
  try {
    const chunks: string[] = [];
    const result = await client.chat([{ role: 'user', content: 'question' }], { onText: text => chunks.push(text) });
    assert.deepEqual(chunks, ['第一段', '第二段']); assert.equal(result.content, '第一段第二段');
    truncated = true; await assert.rejects(client.chat([{ role: 'user', content: 'question' }]), /中断/);
  } finally { await client.close(); server.close(); await once(server, 'close'); }
});
