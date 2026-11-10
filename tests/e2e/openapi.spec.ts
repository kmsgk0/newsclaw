import { test, expect } from '@playwright/test';

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
