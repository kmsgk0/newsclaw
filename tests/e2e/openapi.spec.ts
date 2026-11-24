import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

test('OPS-06 API documentation loads its definition and business operations', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const definitionResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/docs/api/json');
  const response = await page.goto('/docs/api');
  expect(response?.status()).toBe(200);
  const definition = await definitionResponse;
  expect(definition.status()).toBe(200);
  expect((await definition.json()).openapi).toMatch(/^3\.0\.\d+$/);
  await expect(page.getByRole('heading', { name: /NewsClaw API/ })).toBeVisible();
  for (const path of ['/api/v1/news', '/api/v1/editor', '/api/v1/topics']) {
    await expect(page.locator(`.opblock-summary-path[data-path="${path}"]`).first()).toBeVisible();
  }
  await expect(page.getByText('Failed to load API definition.')).toHaveCount(0);
  expect(errors).toEqual([]);
  await page.screenshot({ path: info.outputPath('openapi-documentation.png') });
});

test('OPS-06 Swagger authorizes protected writes with a fresh session token', async ({ page }, info) => {
  const credentials = { username: `docs_${randomUUID().slice(0, 8)}`, password: 'correct-password' };
  expect((await page.request.post('/api/v1/auth/register', { data: credentials })).status()).toBe(201);
  const login = await page.request.post('/api/v1/auth/login', { data: credentials });
  expect(login.status()).toBe(200);
  const { data } = await login.json();
  await page.goto('/docs/api');
  await page.locator('.auth-wrapper button.authorize').click();
  await page.locator('.auth-container input').fill(data.accessToken);
  await page.locator('.auth-btn-wrapper button.authorize').click();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  const operation = page.locator('.opblock-patch').filter({ has: page.locator('.opblock-summary-path[data-path="/api/v1/editor"]') });
  await operation.locator('.opblock-summary').click();
  await operation.getByRole('button', { name: 'Try it out', exact: true }).click();
  let tokens = 0;
  page.on('response', response => { if (new URL(response.url()).pathname === '/api/v1/auth/csrf' && response.status() === 200) tokens++; });
  for (const name of ['文档试调读者', '再次试调读者']) {
    await operation.locator('textarea').fill(JSON.stringify({ name }));
    const response = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/editor' && response.request().method() === 'PATCH');
    await operation.getByRole('button', { name: 'Execute', exact: true }).click();
    const result = await response;
    expect(result.status()).toBe(200);
    expect((await result.json()).data.name).toBe(name);
  }
  expect(tokens).toBe(2);
  const profile = await page.request.get('/api/v1/editor', { headers: { Authorization: `Bearer ${data.accessToken}` } });
  expect((await profile.json()).data.name).toBe('再次试调读者');
  await page.screenshot({ path: info.outputPath('openapi-protected-write.png'), mask: [operation.locator('.curl-command')] });
});

test('OPS-06 Swagger displays the actual unauthorized write response',async({page})=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/docs/api');
  await page.locator('.auth-wrapper button.authorize').click();
  await page.locator('.auth-container input').fill('invalid-documentation-token');
  await page.locator('.auth-btn-wrapper button.authorize').click();
  await page.getByRole('button',{name:'Close',exact:true}).click();
  const operation=page.locator('.opblock-patch').filter({has:page.locator('.opblock-summary-path[data-path="/api/v1/editor"]')});
  await operation.locator('.opblock-summary').click();
  await operation.getByRole('button',{name:'Try it out',exact:true}).click();
  await operation.locator('textarea').fill(JSON.stringify({name:'不能保存'}));
  const response=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/v1/editor' && response.request().method()==='PATCH');
  await operation.getByRole('button',{name:'Execute',exact:true}).click();
  expect((await response).status()).toBe(401);
  await expect(operation.locator('.responses-wrapper')).toContainText('UNAUTHENTICATED');
  await expect(operation.locator('.responses-wrapper')).toContainText('401');
  expect(errors).toEqual([]);
});
