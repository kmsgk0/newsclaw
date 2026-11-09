import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { load } from 'cheerio';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { fetch, EnvHttpProxyAgent } from 'undici';
import { invalid, unavailable } from '../errors.js';

export interface Candidate { title: string; url: string; publishedAt: string | null; content: string; contentScope: 'full' | 'summary'; enrichmentError?:string; enrichmentFailed?:boolean; sourceError?:string }
const proxy = new EnvHttpProxyAgent();
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {};
const text = (value: unknown): string => typeof value === 'string' || typeof value === 'number' ? String(value) : typeof object(value)['#text'] === 'string' ? String(object(value)['#text']) : '';
const array = (value: unknown): unknown[] => value == null ? [] : Array.isArray(value) ? value : [value];
export const cleanText = (value: string) => { const $ = load(value); $('script,style,noscript').remove(); return $.text().replace(/\s+/g, ' ').trim(); };
const markdown = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-', codeBlockStyle: 'fenced', emDelimiter: '*' });
markdown.use(gfm);
const chrome = 'script,style,noscript,nav,footer,aside,form,button,svg,iframe,[role="navigation"],[role="button"],[aria-hidden="true"],.not-prose,.social-share,.share-buttons,.related-posts,.comments,.newsletter,.table-of-contents';

function fragment(value: string) {
  const unwrapped = value.replace(/^\s*<!\[CDATA\[([\s\S]*)\]\]>\s*$/, '$1');
  return /&lt;\/?[a-z][^&]*&gt;/i.test(unwrapped) ? load(unwrapped).root().text() : unwrapped;
}

function destinationRange(raw: string, definition: boolean): [number,number] | null {
  let cursor=raw.indexOf('['),depth=0;
  if(cursor<0)return null;
  for(;cursor<raw.length;cursor++) {
    if(raw[cursor]==='\\'){cursor++;continue;}
    if(raw[cursor]==='[')depth++;
    if(raw[cursor]===']' && --depth===0){cursor++;break;}
  }
  if(raw[cursor] !== (definition?':':'('))return null;
  cursor++;
  while(cursor<raw.length && /\s/.test(raw[cursor]))cursor++;
  const angle=raw[cursor]==='<';if(angle)cursor++;
  const start=cursor;let nesting=0;
  for(;cursor<raw.length;cursor++) {
    const character=raw[cursor];
    if(character==='\\'){cursor++;continue;}
    if(angle){if(character==='>')break;continue;}
    if(/\s/.test(character))break;
    if(!definition && character===')'){if(nesting===0)break;nesting--;}
    if(character==='(')nesting++;
  }
  return cursor>start?[start,cursor]:null;
}

/** Edit only parsed URL spans so fenced examples and surrounding Markdown stay unchanged. */
function markdownLinks(source: string, base: string): string {
  type Node = {type:string;url?:string;position?:{start:{offset?:number};end:{offset?:number}};children?:Node[]};
  const edits: {start:number;end:number;value:string}[]=[];
  const visit=(node:Node)=>{
    if(['link','image','definition'].includes(node.type) && node.url && !/^[a-z][a-z\d+.-]*:/i.test(node.url)) {
      const start=node.position?.start.offset,end=node.position?.end.offset;
      if(start!==undefined && end!==undefined) {
        const range=destinationRange(source.slice(start,end),node.type==='definition');
        if(range) {
          try {
            const url=new URL(node.url,base);
            if(['http:','https:'].includes(url.protocol))edits.push({start:start+range[0],end:start+range[1],value:url.href.replaceAll('(','%28').replaceAll(')','%29')});
          } catch { /* Preserve unresolvable source text for the safe renderer. */ }
        }
      }
    }
    node.children?.forEach(visit);
  };
  visit(fromMarkdown(source));
  for(const edit of edits.sort((a,b)=>b.start-a.start))source=source.slice(0,edit.start)+edit.value+source.slice(edit.end);
  return source;
}

/** Convert source HTML once; already-authored Markdown keeps its own block structure. */
export function sourceMarkdown(value: string, base: string, format: unknown = 'auto'): string {
  const input = fragment(value).replaceAll('\r\n', '\n').trim();
  if (!input) return '';
  if (format === 'text') return input;
  if (format === 'markdown' || (format === 'auto' && /^(?:#{1,6}\s|```|~~~)/m.test(input))) return markdownLinks(input,base);
  if (!/<\/?[a-z][\s\S]*>/i.test(input)) return markdownLinks(input,base);
  const $ = load(input);
  $(chrome).remove();
  $('a[href],img').each((_, element) => {
    const node = $(element), attribute = element.tagName === 'img' ? 'src' : 'href';
    const supplied = node.attr(attribute);
    const raw = supplied?.startsWith('data:') ? node.attr('data-src') ?? supplied : supplied ?? node.attr('data-src');
    if (!raw) return;
    try {
      const url = new URL(raw, base);
      if (['http:', 'https:'].includes(url.protocol)) node.attr(attribute, url.href);
      else node.removeAttr(attribute);
    } catch { node.removeAttr(attribute); }
  });
  $('table').each((_, table) => {
    const firstRow = $(table).find('tr').first();
    if (!firstRow.find('th').length) firstRow.children('td').each((_, cell) => { $(cell).replaceWith(`<th>${$(cell).html() ?? ''}</th>`); });
  });
  return markdown.turndown($.html()).replace(/\n{3,}/g, '\n\n').trim();
}
export function validateSelectors(config:Record<string,unknown>){
  const $=load('<article><h1>Title</h1></article>');
  for(const key of ['itemSelector','titleSelector','linkSelector','dateSelector','contentSelector','articleSelector'])if(typeof config[key]==='string'){
    try{$(config[key]);}catch{throw invalid(`${key} 不是有效的 CSS 选择器`);}
  }
}
export function normalizeUrl(value: string, base?: string): string {
  let url: URL;
  try { url = new URL(value, base); } catch { throw invalid('信源条目包含无效链接'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw invalid('仅支持不含凭据的 HTTP(S) 链接');
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) if (/^utm_/i.test(key) || ['fbclid', 'gclid'].includes(key)) url.searchParams.delete(key);
  url.searchParams.sort(); return url.toString();
}
function privateAddress(address: string): boolean {
  const ip = address.toLowerCase().replace(/^\[|\]$/g, '');
  if (ip.includes(':')) return ip === '::' || ip === '::1' || /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(ip) || ip.startsWith('::ffff:');
  const [a, b] = ip.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}
export async function assertPublicTarget(value: string, allowedHosts: string[]): Promise<void> {
  const url = new URL(normalizeUrl(value)); const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (allowedHosts.includes(hostname)) return;
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) throw invalid('信源必须使用公开网络地址');
  const addresses = isIP(hostname) ? [{ address: hostname }] : await lookup(hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => privateAddress(address))) throw invalid('信源必须使用公开网络地址');
}
export async function fetchSource(url: string, allowedHosts: string[], signal?: AbortSignal): Promise<{ body: string; url: string }> {
  let target = url;
  try {
    for (let i = 0; i < 5; i++) {
      await assertPublicTarget(target, allowedHosts);
      const response = await fetch(target, { dispatcher: proxy, redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/rss+xml, application/atom+xml, application/json, text/html, */*' }, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000) });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location'); await response.body?.cancel();
        if (!location) throw unavailable('信源重定向缺少目标地址');
        target = normalizeUrl(location, target); continue;
      }
      if (!response.ok) { await response.body?.cancel(); throw unavailable(`信源返回 HTTP ${response.status}`); }
      const chunks: Uint8Array[] = []; let size = 0;
      if (!response.body) throw unavailable('信源响应为空');
      for await (const chunk of response.body) { size += chunk.length; if (size > 5_000_000) throw unavailable('信源响应超过 5 MB'); chunks.push(chunk); }
      return { body: Buffer.concat(chunks).toString('utf8'), url: target };
    }
    throw unavailable('信源重定向次数过多');
  } catch (error) { if (error instanceof Error && 'status' in error) throw error; throw unavailable('信源连接或解析失败'); }
}
function date(value: unknown): string | null { const valueText = text(value); if (!valueText) return null; const parsed = new Date(valueText); return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null; }
function path(value: unknown, key: string): unknown { return key.split('.').filter(Boolean).reduce<unknown>((v, k) => object(v)[k], value); }
function candidate(title: unknown, link: unknown, published: unknown, content: unknown, scope: 'full' | 'summary', base: string, format: unknown = 'auto'): Candidate | null {
  const name = cleanText(text(title)); const href = text(link);
  if (!name || !href) return null;
  let url: string;
  try {url=normalizeUrl(href,base);}catch(error){return {title:name,url:href,publishedAt:date(published),content:'',contentScope:scope,sourceError:error instanceof Error?error.message:'信源条目包含无效链接'};}
  return { title: name, url, publishedAt: date(published), content: sourceMarkdown(text(content), url, format), contentScope: scope };
}
export function parseSource(kind: 'rss' | 'json' | 'web', body: string, base: string, config: Record<string, unknown>): Candidate[] {
  let items: Array<Candidate | null>;
  if (kind === 'rss') {
    if (XMLValidator.validate(body) !== true) throw unavailable('RSS 或 Atom 文档无效');
    const parsed = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', trimValues: true, stopNodes: ['*.content','*.description','*.summary','*.content:encoded'] }).parse(body);
    const root = object(parsed); const channel = object(object(root.rss).channel); const feed = object(root.feed);
    if (!root.rss && !root.feed) throw unavailable('信源未返回 RSS 或 Atom');
    items = array(root.rss ? channel.item : feed.entry).map(value => {
      const item = object(value); const link = typeof item.link === 'string' ? item.link : text(object(array(item.link).find(v => object(v)['@_rel'] === 'alternate') ?? array(item.link)[0])['@_href']);
      const full = item['content:encoded'] ?? item.content; const content = full ?? item.description ?? item.summary;
      return candidate(item.title, link, item.pubDate ?? item.published ?? item.updated, content, config.contentScope === 'summary' ? 'summary' : full ? 'full' : 'summary', base, config.contentFormat ?? 'html');
    });
  } else if (kind === 'json') {
    let value: unknown; try { value = JSON.parse(body); } catch { throw unavailable('信源未返回有效 JSON'); }
    const list = Array.isArray(value) ? value : path(value, String(config.itemsPath ?? 'items'));
    if (!Array.isArray(list)) throw unavailable('JSON 信源条目路径不是数组');
    const fields = { title: 'title', url: 'url', publishedAt: 'publishedAt', content: 'content', summary: 'summary', ...object(config.fields) };
    items = list.map(item => {
      const full = path(item, String(fields.content));
      return candidate(path(item, String(fields.title)), path(item, String(fields.url)), path(item, String(fields.publishedAt)), full ?? path(item, String(fields.summary)), config.contentScope === 'summary' ? 'summary' : full ? 'full' : 'summary', base, config.contentFormat);
    });
  } else {
    const $ = load(body);
    items = $(String(config.itemSelector ?? 'article')).toArray().map(element => {
      const item = $(element); const title = item.find(String(config.titleSelector ?? 'h2')).text(); const link = item.find(String(config.linkSelector ?? 'a')).first().attr('href'); const time = item.find(String(config.dateSelector ?? 'time')).first();
      const content = item.find(String(config.contentSelector ?? 'p')).toArray().map(node => $.html(node)).join('\n');
      return candidate(title, link, time.attr('datetime') ?? time.text(), content, config.contentScope === 'full' ? 'full' : 'summary', base, 'html');
    });
    if (!items.length) throw unavailable('网页中没有匹配的新闻条目，请检查选择器');
  }
  if (items.length && !items.some(Boolean)) throw unavailable('信源条目缺少标题或原文链接');
  return items.filter((item): item is Candidate => Boolean(item));
}
export function extractArticle(body: string, base = 'https://example.org', selector?: string, title?: string): string {
  const $ = load(body);
  $(chrome).remove();
  const selectors = selector ? [selector] : ['[itemprop="articleBody"]', '.article-content,.article-body,.entry-content,.post-content,.blog-content', 'article', 'main,[role="main"]'];
  let target = $();
  for (const choice of selectors) {
    const candidates = $(choice).toArray().filter(node => $(node).find('p,pre,li,h1,h2').length);
    candidates.sort((a, b) => $(b).find('p,pre').text().length - $(a).find('p,pre').text().length);
    if (candidates.length) { target = $(candidates[0]).clone(); break; }
  }
  if (!target.length) return '';
  if (!target.children('p,pre,table').length) {
    const body = target.children('div,section').toArray().filter(node => $(node).find('p').length >= 3)
      .sort((a,b) => $(b).find('p,pre').text().length - $(a).find('p,pre').text().length)[0];
    if (body && $(body).find('p,pre').text().length >= target.find('p,pre').text().length * 0.8) target = $(body).clone();
  }
  // Some publishers place bylines and interactive controls beside their article body.
  target.find('[data-target="BlogTOC"],.SVELTE_HYDRATER').filter((_, node) => !$(node).find('p,pre,table').length).remove();
  if (title && target.find('h1').first().text().trim() === title.trim()) target.find('h1').first().remove();
  return sourceMarkdown($.html(target), base, 'html');
}
export async function enrichCandidate(candidate: Candidate, allowedHosts: string[], signal?: AbortSignal, config: Record<string, unknown> = {}): Promise<Candidate> {
  if (candidate.content && !config.refreshSource && !(config.fetchArticle && candidate.contentScope === 'summary')) return candidate;
  try{
    const response=await fetchSource(candidate.url,allowedHosts,signal);const content=extractArticle(response.body,response.url,typeof config.articleSelector==='string'?config.articleSelector:undefined,candidate.title);
    if(content)return {...candidate,content,contentScope:'full'};
    return {...candidate,enrichmentError:candidate.content?'来源全文暂不可用，保留已取得内容':'来源未提供可读取正文，目前仅有标题',enrichmentFailed:true};
  }catch(error){if(signal?.aborted)throw error;return {...candidate,enrichmentError:'原文正文暂不可用，请稍后重试',enrichmentFailed:true};}
}
