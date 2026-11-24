import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const version = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const project = `newsclaw-verification-${version.slice(0, 12)}`;
const baseURL = `http://localhost:${process.env.VERIFICATION_PORT ?? '43100'}`;
const env = {
  ...process.env, APP_VERSION: version, POSTGRES_PASSWORD: 'isolated-runtime-verification',
  HOST_PORT: new URL(baseURL).port, APP_ORIGIN: baseURL, DB_PORT: '25434', REDIS_PORT: '26381',
};
const args = ['compose', '--env-file', '/dev/null', '-p', project, '-f', 'compose.yaml', '-f', 'compose.verification.yaml'];
const compose = (...command) => execFileSync('docker', [...args, ...command], { cwd: root, env, stdio: 'inherit' });
const action = process.argv[2] ?? 'verify';
assert.ok(['start', 'check', 'stop', 'verify'].includes(action), 'Use start, check, stop or verify');

function assertCleanCheckout() {
  assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim(), '', 'Run from a clean checkout of the desired commit');
}

function start() {
  compose('up', '--build', '-d', '--wait', '--wait-timeout', '180');
  console.log(`NewsClaw ${version} ready at ${baseURL}`);
}

async function check() {
  const { chromium, expect } = await import('@playwright/test');
  const directory = path.resolve(root, '.local/verification/runtime', new Date().toISOString().replaceAll(':', '-'));
  mkdirSync(directory, { recursive: true });
  const report = { version, baseURL, startedAt: new Date().toISOString(), observations: [] };
  const observe = entry => report.observations.push(entry);
  const request = async (url, method = 'GET', body, token) => {
    const response = await fetch(baseURL + url, {
      method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const payload = await response.json();
    assert.ok(response.ok, `${method} ${url}: ${response.status} ${payload.code}`);
    return payload;
  };
  const health = await request('/health');
  assert.equal(health.version, version);
  assert.equal(health.status, 'ready');
  observe({ phase: 'health', version: health.version, dependencies: health.dependencies });
  const accounts = [];
  for (const role of ['a', 'b', 'admin']) {
    const credentials = { username: `flow_${role}_${randomUUID().slice(0, 8)}`, password: 'Synthetic-runtime-only' };
    const registered = await request('/api/v1/auth/register', 'POST', credentials);
    accounts.push({ ...credentials, id: registered.data.user.id });
  }
  const [a, b, admin] = accounts;
  assert.match(admin.id, /^[0-9a-f-]{36}$/);
  compose('exec', '-T', 'db', 'psql', '-U', 'newsclaw', '-d', 'newsclaw', '-v', 'ON_ERROR_STOP=1', '-c', `UPDATE users SET role='admin' WHERE id='${admin.id}'`);
  const adminSession = (await request('/api/v1/auth/login', 'POST', { username: admin.username, password: admin.password })).data;
  const sources = (await request('/api/v1/admin/sources', 'GET', undefined, adminSession.accessToken)).data.items;
  const source = sources.find(source => source.url === 'http://fixture:4999/feed') ??
    (await request('/api/v1/admin/sources', 'POST', { name: '验证信源', kind: 'rss', url: 'http://fixture:4999/feed', enabled: true, config: { maxItems: 1 } }, adminSession.accessToken)).data;
  const collection = (await request(`/api/v1/admin/sources/${source.id}/collect`, 'POST', { operationId: randomUUID() }, adminSession.accessToken)).data;
  await expect.poll(async () => (await request(collection.statusUrl, 'GET', undefined, adminSession.accessToken)).data.status, { timeout: 30000 }).toBe('succeeded');
  compose('stop', 'worker');
  const browser = await chromium.launch({ headless: true });
  try {
    const login = async account => {
      const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: 'Asia/Shanghai' });
      const page = await context.newPage();
      await page.goto('/editor');
      await page.getByLabel('用户名', { exact: true }).fill(account.username);
      await page.getByLabel('密码', { exact: true }).fill(account.password);
      const pending = page.waitForResponse(r => new URL(r.url()).pathname === '/api/v1/auth/login' && r.request().method() === 'POST');
      await page.getByRole('button', { name: '登录', exact: true }).tap();
      const response = await pending;
      assert.equal(response.status(), 200);
      await expect(page.getByRole('heading', { name: '我的编辑', exact: true })).toBeVisible();
      return { page, token: (await response.json()).data.accessToken };
    };
    const readerA = await login(a);
    await readerA.page.getByRole('button', { name: '个人日报', exact: true }).tap();
    const submission = readerA.page.waitForResponse(r => new URL(r.url()).pathname === '/api/v1/editor/digests/generate' && r.request().method() === 'POST');
    await readerA.page.getByRole('button', { name: '生成今天的日报', exact: true }).tap();
    const response = await submission;
    assert.equal(response.status(), 202);
    const receipt = (await response.json()).data;
    assert.equal(receipt.status, 'pending');
    const states = new Set(['pending']);
    observe({ phase: 'submit', status: response.status(), taskId: receipt.taskId, statusUrl: receipt.statusUrl });
    await expect(readerA.page.locator('.task-status.pending')).toHaveText('已接收，等待处理');
    let pollingError;
    readerA.page.on('response', async response => {
      if (new URL(response.url()).pathname !== receipt.statusUrl) return;
      try {
        const task = (await response.json()).data;
        states.add(task.status);
      } catch (error) { pollingError = error; }
    });
    compose('start', 'worker');
    await expect(readerA.page.locator('.task-status.succeeded')).toHaveText('处理完成', { timeout: 30000 });
    if (pollingError) throw pollingError;
    assert.deepEqual([...states], ['pending', 'running', 'succeeded']);
    await expect(readerA.page.locator('article.reading-history')).toContainText('云杉引擎开放试用');
    await readerA.page.screenshot({ path: path.join(directory, 'mobile-digest.png') });
    observe({ phase: 'complete', taskId: receipt.taskId, states: [...states] });
    const readerB = await login(b);
    const denied = await readerB.page.evaluate(async ({ url, token }) => {
      const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
      return { status: response.status, body: await response.json(), requestId: response.headers.get('x-request-id') };
    }, { url: receipt.statusUrl, token: readerB.token });
    assert.equal(denied.status, 404);
    assert.equal(denied.body.code, 'NOT_FOUND');
    assert.equal(denied.body.data, null);
    observe({ phase: 'cross-account', status: denied.status, code: denied.body.code, taskId: receipt.taskId });
    let audit;
    await expect.poll(async () => {
      audit = (await request(`/api/v1/admin/audit?actorId=${b.id}&status=404&requestId=${denied.body.requestId}`, 'GET', undefined, adminSession.accessToken)).data.items;
      return audit.length;
    }, { timeout: 10000 }).toBe(1);
    assert.equal(audit[0].object_id, receipt.taskId);
    observe({ phase: 'audit', actorId: b.id, status: audit[0].status, requestId: audit[0].request_id, objectId: audit[0].object_id });
    report.status = 'passed';
  } catch (error) {
    report.status = 'failed';
    report.error = error.message;
    throw error;
  } finally {
    await browser.close();
    report.finishedAt = new Date().toISOString();
    writeFileSync(path.join(directory, 'result.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(`Runtime verification: ${directory}/result.json`);
  }
}

try {
  if (action === 'start') {
    assertCleanCheckout();
    start();
  } else if (action === 'stop') compose('down', '--volumes', '--remove-orphans');
  else if (action === 'check') await check();
  else {
    assertCleanCheckout();
    try { start(); await check(); }
    finally { compose('down', '--volumes', '--remove-orphans'); }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
