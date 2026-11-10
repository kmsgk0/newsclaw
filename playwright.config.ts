import { defineConfig } from '@playwright/test';
import path from 'node:path';

const reports = process.env.VERIFICATION_DIR;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  outputDir: reports ? path.join(reports, 'browser-results') : 'test-results',
  reporter: reports
    ? [['list'], ['json', { outputFile: path.join(reports, 'browser.json') }], ['html', { open: 'never', outputFolder: path.join(reports, 'browser') }]]
    : [['list'], ['html', { open: 'never' }]],
  use: { baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3101', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'tablet', use: { viewport: { width: 768, height: 1024 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : { command: 'node --import tsx tests/support/e2e-server.ts', url: 'http://localhost:3101/live', timeout: 60_000, reuseExistingServer: false },
});
