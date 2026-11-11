import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RuntimeMetrics, startMetricsServer } from '../../src/server/runtime/metrics.js';
import type { TaskService } from '../../src/server/runtime/tasks.js';

test('OBS-01 metrics count fixed skill outcomes and cumulative HTTP latency buckets', () => {
  const metrics = new RuntimeMetrics();
  metrics.skill('explain', 'succeeded');
  metrics.skill('explain', 'failed');
  metrics.skill('private-user-input', 'succeeded');
  metrics.request('GET', '/api/v1/news/:id', 200, 35);
  metrics.request('GET', '/api/v1/news/:id', 200, 110);
  const text = metrics.render({ waiting: 4, active: 1, delayed: 2 });
  assert.match(text, /newsclaw_skill_calls_total\{skill="explain",result="succeeded"\} 1/);
  assert.match(text, /newsclaw_skill_calls_total\{skill="explain",result="failed"\} 1/);
  assert.doesNotMatch(text, /private-user-input/);
  assert.match(text, /route="\/api\/v1\/news\/:id",status="200",le="0.05"\} 1/);
  assert.match(text, /route="\/api\/v1\/news\/:id",status="200",le="\+Inf"\} 2/);
  assert.match(text, /newsclaw_queue_jobs\{state="waiting"\} 4/);
  assert.match(text, /newsclaw_queue_available 1/);
});

test('OBS-01 metrics endpoint distinguishes unavailable queue and rejects other paths', async () => {
  let fail = false;
  const tasks = { queue: { getJobCounts: async () => {
    if (fail) throw new Error('private-redis-address');
    return { waiting: 3, active: 0, delayed: 1 };
  } } } as unknown as TaskService;
  const server = await startMetricsServer(tasks, '127.0.0.1', 0);
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('missing address');
    const base = `http://127.0.0.1:${address.port}`;
    const ok = await fetch(`${base}/metrics`);
    assert.equal(ok.status, 200);
    assert.match(await ok.text(), /newsclaw_queue_jobs\{state="waiting"\} 3/);
    fail = true;
    const unavailable = await (await fetch(`${base}/metrics`)).text();
    assert.match(unavailable, /newsclaw_queue_available 0/);
    assert.doesNotMatch(unavailable, /newsclaw_queue_jobs\{/);
    assert.doesNotMatch(unavailable, /private-redis-address/);
    assert.equal((await fetch(`${base}/other`)).status, 404);
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});
