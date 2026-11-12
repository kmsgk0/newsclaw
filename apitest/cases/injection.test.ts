import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAPIEnvironment } from '../fixtures/environment.js';

test('SEC-11 SQL metacharacters remain search data for news and events', async () => {
  const env = await createAPIEnvironment();
  try {
    const before = await env.ctx.db.one<{ count: string }>('SELECT count(*) AS count FROM news');
    for (const path of ['/news', '/events']) {
      const query = new URLSearchParams({ q: "missing_unique_29871' OR '1'='1" });
      const response = await fetch(`${env.baseUrl}/api/v1${path}?${query}`);
      assert.equal(response.status, 200);
      const result = await response.json() as { data: { items: unknown[]; total: number } };
      assert.deepEqual(result.data.items, []);
      assert.equal(result.data.total, 0);
      const normal = await fetch(`${env.baseUrl}/api/v1${path}?${new URLSearchParams({ q: '云杉' })}`);
      assert.equal(normal.status, 200);
      assert.ok(((await normal.json()) as { data: { total: number } }).data.total > 0);
    }
    assert.deepEqual(await env.ctx.db.one('SELECT count(*) AS count FROM news'), before);
  } finally { await env.cleanup(); }
});

test('SEC-11 cross-site profile write is rejected without mutation and refresh cookie is protected', async () => {
  const env = await createAPIEnvironment();
  try {
    const login = await fetch(`${env.baseUrl}/api/v1/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: env.a.username, password: 'correct-password' }),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie') ?? '';
    assert.match(cookie, /(?:^|;)\s*HttpOnly(?:;|$)/i);
    assert.match(cookie, /(?:^|;)\s*SameSite=Strict(?:;|$)/i);
    assert.match(cookie, /(?:^|;)\s*Secure(?:;|$)/i);
    const { data } = await login.json() as { data: { accessToken: string } };
    const before = await env.ctx.db.one<{ name: string }>('SELECT name FROM editors WHERE user_id=$1', [env.a.id]);
    const update = (origin: string) => fetch(`${env.baseUrl}/api/v1/editor`, {
      method: 'PATCH', headers: { authorization: `Bearer ${data.accessToken}`, 'content-type': 'application/json', origin },
      body: JSON.stringify({ name: '安全测试编辑' }),
    });
    const rejected = await update('https://attacker.example');
    assert.equal(rejected.status, 403);
    assert.equal(((await rejected.json()) as { code: string }).code, 'FORBIDDEN');
    assert.deepEqual(await env.ctx.db.one('SELECT name FROM editors WHERE user_id=$1', [env.a.id]), before);
    const issued = await fetch(`${env.baseUrl}/api/v1/auth/csrf`, { headers: { authorization: `Bearer ${data.accessToken}` } });
    const { token } = ((await issued.json()) as { data: { token: string } }).data;
    const allowed = await fetch(`${env.baseUrl}/api/v1/editor`, {
      method: 'PATCH', headers: { authorization: `Bearer ${data.accessToken}`, 'content-type': 'application/json', origin: env.ctx.config.appOrigin, 'x-csrf-token': token },
      body: JSON.stringify({ name: '安全测试编辑' }),
    });
    assert.equal(allowed.status, 200);
    assert.equal((await env.ctx.db.one<{ name: string }>('SELECT name FROM editors WHERE user_id=$1', [env.a.id]))?.name, '安全测试编辑');
  } finally { await env.cleanup(); }
});
