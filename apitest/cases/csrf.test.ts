import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createAPIEnvironment } from '../fixtures/environment.js';

test('SEC-12 one-use tokens enforce session ownership, expiration, parallel requests and refresh', async () => {
  const env = await createAPIEnvironment();
  try {
    const login = await fetch(`${env.baseUrl}/api/v1/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: env.a.username, password: 'correct-password' }),
    });
    const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0];
    const { accessToken } = ((await login.json()) as { data: { accessToken: string } }).data;
    const other = await env.auth.login({ username: env.b.username, password: 'correct-password' });
    const issue = async (authorization?: string, refreshCookie?: string) => {
      const response = await fetch(`${env.baseUrl}/api/v1/auth/csrf`, { headers: {
        ...(authorization ? { authorization: `Bearer ${authorization}` } : {}), ...(refreshCookie ? { cookie: refreshCookie } : {}),
      } });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      return ((await response.json()) as { data: { token: string } }).data.token;
    };
    const update = (token?: string) => fetch(`${env.baseUrl}/api/v1/editor`, {
      method: 'PATCH', headers: { origin: env.ctx.config.appOrigin, authorization: `Bearer ${accessToken}`, 'content-type': 'application/json', ...(token ? { 'x-csrf-token': token } : {}) },
      body: JSON.stringify({ name: 'CSRF test' }),
    });
    const before = await env.ctx.db.one('SELECT name FROM editors WHERE user_id=$1', [env.a.id]);
    assert.equal((await update()).status, 403);
    assert.deepEqual(await env.ctx.db.one('SELECT name FROM editors WHERE user_id=$1', [env.a.id]), before);
    const otherToken = await issue(other.accessToken);
    assert.equal((await update(otherToken)).status, 403);
    const expired = await issue(accessToken);
    await env.ctx.db.query("UPDATE csrf_tokens SET expires_at=now()-interval '1 second' WHERE token_hash=$1", [createHash('sha256').update(expired).digest('hex')]);
    assert.equal((await update(expired)).status, 403);
    const [first, second] = await Promise.all([issue(accessToken), issue(accessToken)]);
    assert.notEqual(first, second);
    const writes = await Promise.all([update(first), update(second)]);
    assert.deepEqual(writes.map(response => response.status), [200, 200]);
    assert.equal((await update(first)).status, 403);
    const racing = await issue(accessToken);
    const races = await Promise.all([update(racing), update(racing)]);
    assert.deepEqual(races.map(response => response.status).sort(), [200, 403]);
    const cli = await fetch(`${env.baseUrl}/api/v1/editor`, { method: 'PATCH', headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' }, body: JSON.stringify({ name: 'CLI allowed' }) });
    assert.equal(cli.status, 200);
    await env.ctx.db.query("UPDATE sessions SET access_expires=now()-interval '1 second' WHERE access_hash=$1", [createHash('sha256').update(accessToken).digest('hex')]);
    assert.equal((await fetch(`${env.baseUrl}/api/v1/auth/csrf`, { headers: { authorization: `Bearer ${accessToken}` } })).status, 401);
    const refresh = (token?: string) => fetch(`${env.baseUrl}/api/v1/auth/refresh`, { method: 'POST', headers: { cookie, ...(token ? { 'x-csrf-token': token } : {}) } });
    assert.equal((await refresh()).status, 403);
    const refreshToken = await issue(undefined, cookie);
    const refreshed = await refresh(refreshToken);
    assert.equal(refreshed.status, 200);
    const nextCookie = (refreshed.headers.get('set-cookie') ?? '').split(';')[0];
    const nextAccess = ((await refreshed.json()) as { data: { accessToken: string } }).data.accessToken;
    assert.equal((await refresh(refreshToken)).status, 401);
    assert.equal((await fetch(`${env.baseUrl}/api/v1/auth/logout`, { method: 'POST', headers: { authorization: `Bearer ${nextAccess}` } })).status, 200);
    assert.equal((await fetch(`${env.baseUrl}/api/v1/auth/csrf`, { headers: { cookie: nextCookie } })).status, 401);
  } finally { await env.cleanup(); }
});
