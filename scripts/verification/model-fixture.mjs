import { createServer } from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';

const title = '云杉引擎开放试用';
const story = '云杉引擎开放试用，官方以1000条请求测试，平均120毫秒，商业价格尚未公布。';

createServer(async (request, response) => {
  const json = (value, status = 200) => {
    response.writeHead(status, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(value));
  };
  if (request.url === '/ready') return json({ ready: true });
  if (request.url === '/feed') {
    response.writeHead(200, { 'Content-Type': 'application/rss+xml' });
    response.end(`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>NewsClaw verification fixture</title><link>http://fixture:4999/feed</link><description>Synthetic feed</description><item><title>${title}</title><link>http://fixture:4999/story</link><pubDate>${new Date().toUTCString()}</pubDate><description>${story}</description></item></channel></rss>`);
    console.log(JSON.stringify({ fixture: 'rss', articles: 1 }));
    return;
  }
  if (request.method !== 'POST') return json({ error: 'Unknown fixture endpoint' }, 404);
  if (request.url === '/v1/embeddings') {
    console.log(JSON.stringify({ fixture: 'embeddings', dimension: 3 }));
    return json({ data: [{ embedding: [1, 0, 0] }] });
  }
  if (request.url !== '/v1/chat/completions') return json({ error: 'Unknown fixture endpoint' }, 404);
  try {
    let raw = '';
    for await (const chunk of request) raw += chunk.toString();
    const { messages } = JSON.parse(raw);
    const purpose = messages[0].content.split('\n')[0];
    let result;
    if (purpose.includes('news-analysis')) {
      result = { selected: true, summary: story, language: 'zh', domain: '人工智能', eventTitle: title, entities: [{ name: '云杉引擎', type: 'product' }], relations: [] };
      console.log(JSON.stringify({ fixture: 'news-analysis' }));
    } else if (purpose.includes('personal-digest')) {
      const { materials } = JSON.parse(messages[1].content);
      const source = materials.find((item) => item.title === title);
      if (!source) return json({ error: 'Synthetic article missing' }, 422);
      console.log(JSON.stringify({ fixture: 'personal-digest', phase: 'received', delayMs: 6500 }));
      await sleep(6500);
      result = { content: `云杉引擎开放试用，商业价格尚未公布 [${source.label}]。`, sourceLabels: [source.label], interestMatches: [] };
      console.log(JSON.stringify({ fixture: 'personal-digest', phase: 'returned' }));
    } else {
      return json({ error: 'Unexpected model purpose' }, 422);
    }
    return json({ choices: [{ message: { content: JSON.stringify(result) } }], usage: { prompt_tokens: 30, completion_tokens: 40, total_tokens: 70 } });
  } catch {
    return json({ error: 'Invalid fixture input' }, 400);
  }
}).listen(4999, '0.0.0.0');
