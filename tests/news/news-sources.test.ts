import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUrl, parseSource, assertPublicTarget,extractArticle,sourceMarkdown } from '../../src/server/adapters/sources.js';

test('NEWS-01 RSS and Atom preserve original source content and canonical links', () => {
  const rss = parseSource('rss', '<rss><channel><item><title>Model release</title><link>https://news.example/release?utm_source=feed#top</link><pubDate>Fri, 06 Nov 2026 08:00:00 GMT</pubDate><description>&lt;p&gt;Actual summary&lt;/p&gt;</description></item></channel></rss>', 'https://news.example/feed', {});
  assert.equal(rss[0].url, 'https://news.example/release');
  assert.equal(rss[0].content, 'Actual summary');
  assert.equal(rss[0].contentScope, 'summary');
  assert.equal(rss[0].publishedAt, '2026-11-06T08:00:00.000Z');
  const atom = parseSource('rss', '<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Research</title><link href="/research"/><content type="html">Actual article</content></entry></feed>', 'https://news.example/feed', {});
  assert.equal(atom[0].url, 'https://news.example/research');
  assert.equal(atom[0].contentScope, 'full');
  assert.equal(atom[0].publishedAt, null);
});
test('NEWS-01 JSON mapping and webpage selectors produce the same material format', () => {
  const json = parseSource('json', JSON.stringify({ results: [{ name: 'Paper', href: '/paper', body: 'Full body' }] }), 'https://news.example/api', { itemsPath: 'results', fields: { title: 'name', url: 'href', content: 'body' } });
  assert.equal(json[0].contentScope, 'full');
  const web = parseSource('web', '<article><h2>Report</h2><a href="/r">Open</a><p>Real excerpt</p></article>', 'https://news.example/', { itemSelector: 'article', titleSelector: 'h2', linkSelector: 'a', contentSelector: 'p' });
  assert.equal(web[0].title, 'Report');
  assert.equal(web[0].contentScope, 'summary');
});
test('NEWS-01 invalid feeds and targets are explicit failures', async () => {
  assert.throws(() => parseSource('rss', '<html>Error</html>', 'https://example.com', {}));
  assert.throws(() => parseSource('json', '{}', 'https://example.com', {}));
  assert.throws(() => normalizeUrl('file:///private/data'));
  await assert.rejects(assertPublicTarget('http://127.0.0.1/private', []));
  await assert.rejects(assertPublicTarget('http://[::1]/private', []));
  await assertPublicTarget('http://127.0.0.1/fixture', ['127.0.0.1']);
});
test('NEWS-01 linked article extraction keeps actual content and removes page navigation',()=>{
  assert.equal(extractArticle('<html><nav>Private nav</nav><main><h1>Title</h1><p>Real article.</p><script>bad()</script><footer>Newsletter</footer></main></html>'),'# Title\n\nReal article.');
  assert.equal(extractArticle('<html><body>Generic landing page without article</body></html>'),'');
  assert.match(extractArticle('<article><header><h1>Title</h1><p>Important lead.</p></header><p>Actual body.</p></article>'),/Important lead\.\n\nActual body\./);
});

test('NEWS-01 RSS and Atom retain paragraphs, headings, lists, tables, code and source links', () => {
  const html = '<h2>Release notes</h2><p>First paragraph.</p><p>Second paragraph with <a href="/details">details</a>.</p><ul><li>One</li><li>Two</li></ul><table><tr><th>Version</th><th>Status</th></tr><tr><td>1.0</td><td>Preview</td></tr></table><pre><code class="language-js">const answer = 42;\nconsole.log(answer);</code></pre>';
  const rss = parseSource('rss', `<rss><channel><item><title>Release</title><link>https://news.example/release</link><content:encoded><![CDATA[${html}]]></content:encoded></item></channel></rss>`, 'https://news.example/feed', {});
  assert.match(rss[0].content, /## Release notes\n\nFirst paragraph\.\n\nSecond paragraph/);
  assert.match(rss[0].content, /\[details\]\(https:\/\/news\.example\/details\)/);
  assert.match(rss[0].content, /- +One\n- +Two/);
  assert.match(rss[0].content, /\| Version \| Status \|/);
  assert.match(rss[0].content, /```js\nconst answer = 42;\nconsole\.log\(answer\);\n```/);
  const atom = parseSource('rss', `<feed><entry><title>Release</title><link href="/release"/><content type="xhtml"><div>${html}</div></content></entry></feed>`, 'https://news.example/feed', {});
  assert.equal(atom[0].content, rss[0].content);
});

test('NEWS-01 JSON Markdown is retained without flattening or escaping its syntax', () => {
  const content = '## A release\n\n- Detail one\n- Detail two\n\n```html\n<div>example</div>\n```';
  const [item] = parseSource('json', JSON.stringify([{ title: 'Release', url: '/release', content }]), 'https://news.example/feed', { contentFormat: 'markdown' });
  assert.equal(item.content, content);
});

test('NEWS-01 native Markdown links resolve against the publisher without rewriting code',()=>{
  const content='## Reading\n\n[Paper](./paper) and ![Chart](../chart.png)\n\n[Reference][ref]\n\n[ref]: ./reference "Reference"\n\n```md\n[Literal](./unchanged)\n```';
  assert.equal(sourceMarkdown(content,'https://publisher.example/posts/story','markdown'),'## Reading\n\n[Paper](https://publisher.example/posts/paper) and ![Chart](https://publisher.example/chart.png)\n\n[Reference][ref]\n\n[ref]: https://publisher.example/posts/reference "Reference"\n\n```md\n[Literal](./unchanged)\n```');
});
