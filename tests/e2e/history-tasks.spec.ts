import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { fits, register } from './helpers';
import type { Task } from '../../src/web/types';

test('EDITOR-06 journal with no new activity explains the empty result without creating entries', async ({ page }, info) => {
  await register(page);
  await page.getByRole('button', { name: '编辑手记', exact: true }).click();
  const generate = page.getByRole('button', { name: '整理阅读活动', exact: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    const completed = page.waitForResponse(async response => response.url().includes('/api/v1/tasks/') && (await response.json()).data?.status === 'succeeded');
    await generate.click();
    await completed;
    await expect(page.locator('.task-status')).toHaveClass(/succeeded/);
    await expect(page.locator('.task-status')).toContainText('没有待整理的新内容');
    await expect(page.locator('.reading-history')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: '暂无编辑手记', exact: true })).toBeVisible();
    await expect(generate).toBeEnabled();
  }
  await page.reload();
  await expect(page.locator('.task-status')).toContainText('没有待整理的新内容');
  await expect(page.locator('.reading-history')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('journal-no-new-activity.png') });
});

test('EDITOR-04/06 completed and failed reading tasks allow another generation', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await register(page);
  const tasks = new Map<string, Task>();
  const latest = new Map<string, Task>();
  const operations = new Set<string>();
  let outcome: Task['status'] = 'succeeded';
  await page.route(/\/api\/v1\/editor\/(digests|journals)(\?|\/generate)/, async route => {
    const kind = route.request().url().includes('/digests') ? 'digests' : 'journals';
    let data: unknown;
    if (route.request().method() === 'POST') {
      const input = route.request().postDataJSON();
      expect(operations.has(input.operationId)).toBe(false);
      operations.add(input.operationId);
      const taskId = randomUUID();
      data = { taskId, status: 'pending', statusUrl: `/api/v1/tasks/${taskId}` };
      const terminal: Task = { taskId, status: outcome, statusUrl: `/api/v1/tasks/${taskId}`, ...(outcome === 'failed' ? { error: { message: '合成任务失败，可再次生成' } } : {}) };
      tasks.set(taskId, terminal);
      latest.set(kind, terminal);
    } else data = { items: [], availableDates: [], status: 'idle', latestTask: latest.get(kind) ?? null };
    await route.fulfill({ status: route.request().method() === 'POST' ? 202 : 200, json: { code: 'OK', data } });
  });
  await page.route(/\/api\/v1\/tasks\//, route => route.fulfill({ json: { code: 'OK', data: tasks.get(route.request().url().split('/').at(-1)!) } }));
  for (const [tab, button] of [['个人日报', '生成今天的日报'], ['编辑手记', '整理阅读活动']]) {
    await page.getByRole('button', { name: tab, exact: true }).click();
    const generate = page.getByRole('button', { name: button, exact: true });
    await expect(generate).toBeEnabled();
    for (const status of ['succeeded', 'failed'] as const) {
      outcome = status;
      await generate.click();
      await expect(page.locator('.task-status')).toContainText(status === 'succeeded' ? '处理完成' : '本次处理失败');
      await expect(generate).toBeEnabled();
    }
  }
  expect(operations.size).toBe(4);
  await fits(page);
  expect(errors).toEqual([]);
  await page.screenshot({ path: info.outputPath('reading-task-terminal.png') });
});
