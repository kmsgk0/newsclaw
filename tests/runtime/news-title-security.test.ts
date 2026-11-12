import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { NewsRow } from '../../src/web/components/news.js';
import type { NewsItem } from '../../src/web/types.js';

function renderTitle(title: string) {
  const news: NewsItem = {
    id: 'news-1', title, sourceId: 'source-1', sourceName: '测试来源',
    url: 'https://example.org/news', publishedAt: '2026-11-10T00:00:00Z',
    content: '', contentScope: 'full', summary: null, translation: null,
    language: 'zh', domain: '', eventId: null,
  };
  return renderToStaticMarkup(createElement(MemoryRouter, null, createElement(NewsRow, { news })));
}

test('SEC-10 news titles render as text rather than injected HTML', () => {
  const html = renderTitle('<script>alert(1)</script><img src=x onerror=alert(2)>');
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /&lt;img src=x onerror=alert\(2\)&gt;/);
  assert.doesNotMatch(html, /<script\b|<img\b/i);
  assert.match(html, /href="\/news\/news-1"/);
  assert.match(renderTitle('普通新闻标题'), />普通新闻标题<\/a>/);
});
