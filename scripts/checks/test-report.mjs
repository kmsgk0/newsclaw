import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from 'cheerio';
import { renderReport } from './report.mjs';

function report(overrides = {}) {
  return {
    startedAt: '2026-11-09T14:00:00.000Z', finishedAt: '2026-11-09T14:01:10.000Z',
    source: { commit: '0123456789abcdef', branch: 'feature/checks', dirty: true },
    environment: { node: 'v24.22.2', platform: 'linux', arch: 'arm64' }, status: 'passed',
    stages: [
      { id: 'specs', name: '规格检查', group: 'repository', status: 'passed', command: 'openspec validate', durationMs: 200, exitCode: 0, log: 'logs/specs.log', tests: [] },
      { id: 'browser', name: '浏览器检查', group: 'application', status: 'passed', command: 'playwright test', durationMs: 60000, exitCode: 0, log: 'logs/browser.log', tests: [
        { name: 'NEWS-01/02 reading preserves sources', file: 'tests/e2e/news.spec.ts', line: 4, status: 'passed', durationMs: 400, project: 'desktop', attachments: [{ name: '阅读页面', path: 'test-results/desktop/reading.png' }] },
        { name: 'NEWS-01/02 reading preserves sources', file: 'tests/e2e/news.spec.ts', line: 4, status: 'passed', durationMs: 500, project: 'mobile' },
      ] },
    ],
    artifacts: [{ name: '浏览器详情', path: 'browser/index.html' }],
    issuesUrl: 'https://github.com/kmsgk0/newsclaw/blob/main/docs/verification/code-review.md',
    ...overrides,
  };
}

test('STD-09 report retains viewport executions, requirement references and current-run attachments', () => {
  const html = renderReport(report()); const $ = load(html);
  assert.equal($('[data-case]').length, 2);
  assert.equal($('[data-metric="passed-tests"]').text().trim(), '2');
  assert.equal($('[data-project="desktop"]').length, 1);
  assert.equal($('[data-project="mobile"]').length, 1);
  assert.equal($('[data-business="news"]').length, 1);
  assert.match($('[data-case]').first().text(), /NEWS-01.*NEWS-02/s);
  assert.equal($('a[href="test-results/desktop/reading.png"]').length, 1);
  assert.equal($('img[src="test-results/desktop/reading.png"]').length, 1);
  assert.equal($('a[href="browser/index.html"]').length, 1);
  assert.match($('body').text(), /工作区含未提交修改/);
  assert.match($('body').text(), /既有审查记录/);
  assert.doesNotMatch(html, /https?:[^"']+\.css|https?:[^"']+\.js/);
});

test('STD-09 failure and unexecuted phases stay visible without success claims', () => {
  const data = report({ status: 'failed', failure: '检查未完成', stages: [
    { id: 'api', name: '接口检查', status: 'failed', durationMs: 140, exitCode: 1, error: 'expected 404, got 200', tests: [{ name: 'ACC-01 rejects cross-account data', status: 'failed', durationMs: 15, file: 'apitest/account.test.ts', error: 'expected 404, got 200' }] },
    { id: 'browser', name: '浏览器检查', status: 'not-run', tests: [] },
  ] });
  const $ = load(renderReport(data));
  assert.match($('h1').text(), /未通过/);
  assert.equal($('[data-stage="browser"] [data-status="not-run"]').text().trim(), '未执行');
  assert.equal($('[data-metric="passed-tests"]').text().trim(), '0');
  assert.equal($('[data-metric="failed-tests"]').text().trim(), '1');
  assert.equal($('[data-case][open]').length, 1);
  assert.match($('[data-stage="api"]').text(), /expected 404, got 200/);
});

test('STD-09 errors and names render as text and unsafe attachment paths are not linked', () => {
  const attack = '<script>globalThis.compromised=true</script>';
  const data = report({ failure: attack, stages: [{ id: 'one', name: attack, status: 'failed', command: attack, error: attack, log: '/tmp/private.log', tests: [{ name: attack, status: 'failed', error: attack, file: attack, attachments: [
    { name: 'outside', path: '../private.png' }, { name: 'scheme', path: 'javascript:alert(1)' },
    { name: 'encoded', path: '%2e%2e/private.png' }, { name: attack, path: 'tests/safe.png' },
  ] }] }], artifacts: [{ name: 'external', path: 'https://example.org/leak' }], issuesUrl: 'javascript:alert(1)' });
  const $ = load(renderReport(data));
  assert.equal($('script').length, 1);
  assert.ok(!$('script').text().includes('compromised'));
  assert.match($('body').text(), /<script>globalThis.compromised=true<\/script>/);
  assert.equal($('a[href="../private.png"],a[href^="javascript:"],a[href^="https://example.org"],a[href^="/tmp/"]').length, 0);
  assert.equal($('img').length, 1);
  assert.equal($('img').attr('src'), 'tests/safe.png');
});

test('STD-09 current async measurements keep units and filters expose actual business and state values', () => {
  const $ = load(renderReport(report({ async: { latency: { measurements: [{ upstreamDelayMs: 200, p95Ms: 8.2, processingMs: 489.65, samplesMs: [2, 8.2] }], requests: 20 }, recovery: { duplicateRequests: 6, distinctTasks: 1, newsRecords: 1 }, ackRecovery: { signal: 'SIGKILL', taskStatus: 'succeeded', queueStatus: 'completed', newsRecords: 1 } } })));
  assert.match($('#async-results').text(), /8\.20 ms/);
  assert.match($('#async-results').text(), /489\.65 ms/);
  assert.match($('#async-results').text(), /6.*1/s);
  assert.equal($('label[for="case-search"]').length, 1);
  assert.equal($('#case-status option[value="failed"]').length, 1);
  assert.equal($('#case-business option[value="news"]').length, 1);
  assert.equal($('#no-matches[hidden]').length, 1);
});

test('STD-09 empty or interrupted execution reports missing results without an empty green table', () => {
  const $ = load(renderReport(report({ status: 'interrupted', stages: [], artifacts: [], failure: 'SIGINT' })));
  assert.match($('h1').text(), /已中断/);
  assert.match($('#cases').text(), /本轮尚未取得用例结果/);
  assert.equal($('[data-case]').length, 0);
  assert.equal($('#async-results').length, 0);
});

test('STD-09 current review copies can be read locally and absent async evidence adds no broken navigation', () => {
  const $ = load(renderReport(report({ issuesUrl: 'records/code-review.md', async: {}, reviewSummary: '结构校验失败时 usage 缺失；<b>待处理</b>。' })));
  assert.equal($('a[href="records/code-review.md"]').length, 1);
  assert.equal($('a[href="#async-results"]').length, 0);
  assert.match($('.review-summary').text(), /usage 缺失；<b>待处理<\/b>/);
  assert.equal($('.review-summary b').length, 0);
});
