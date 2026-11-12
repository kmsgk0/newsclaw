import { test } from 'node:test';
import assert from 'node:assert/strict';
import pino from 'pino';
import { createBaseApp } from '../../src/server/base-app.js';
import type { AppContext } from '../../src/server/context.js';

test('SEC-09 origin checks reject cross-site writes before their handler', async () => {
  for (const nodeEnv of ['development', 'production'] as const) {
    const ctx = {
      config: { nodeEnv, appOrigin: 'https://news.example', secureCookies: true, version: 'test' },
      logger: pino({ level: 'silent' }),
      db: {},
    } as unknown as AppContext;
    const app = await createBaseApp(ctx);
    let writes = 0;
    app.post('/api/v1/origin-probe', { config: { public: true } }, async () => ({ writes: ++writes }));
    app.get('/api/v1/origin-probe', { config: { public: true } }, async () => ({ writes }));
    try {
      const valid = await app.inject({ method: 'POST', url: '/api/v1/origin-probe', headers: { origin: 'https://news.example' } });
      assert.equal(valid.statusCode, 200);
      assert.equal(valid.json().data.writes, 1);
      const rejected = await app.inject({ method: 'POST', url: '/api/v1/origin-probe', headers: { origin: 'https://attacker.example' } });
      assert.equal(rejected.statusCode, 403);
      assert.equal(rejected.json().code, 'FORBIDDEN');
      assert.equal(writes, 1);
      const development = await app.inject({ method: 'POST', url: '/api/v1/origin-probe', headers: { origin: 'http://localhost:5175' } });
      assert.equal(development.statusCode, nodeEnv === 'development' ? 200 : 403);
      assert.equal(writes, nodeEnv === 'development' ? 2 : 1);
      const noOrigin = await app.inject({ method: 'POST', url: '/api/v1/origin-probe' });
      assert.equal(noOrigin.statusCode, 200);
      assert.equal(writes, nodeEnv === 'development' ? 3 : 2);
      const read = await app.inject({ method: 'GET', url: '/api/v1/origin-probe', headers: { origin: 'https://attacker.example' } });
      assert.equal(read.statusCode, 200);
      assert.equal(read.json().data.writes, writes);
    } finally {
      await app.close();
    }
  }
});
