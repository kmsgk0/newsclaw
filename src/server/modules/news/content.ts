import { z } from 'zod';
import { fromMarkdown } from 'mdast-util-from-markdown';
import type { ModelClient, ModelUsage } from '../../adapters/model.js';
import { unavailable } from '../../errors.js';

export const NEWS_DOMAINS = ['人工智能', '软件开发', '硬件与芯片', '机器人', '网络安全', '科学研究', '互联网产品', '科技与社会', '科技综合'] as const;

export function normalizeDomain(value: string): typeof NEWS_DOMAINS[number] {
  if (NEWS_DOMAINS.includes(value as typeof NEWS_DOMAINS[number])) return value as typeof NEWS_DOMAINS[number];
  const mappings: [RegExp, typeof NEWS_DOMAINS[number]][] = [
    [/robot|机器人/i, '机器人'],
    [/security|cyber|安全/i, '网络安全'],
    [/hardware|chip|semiconductor|芯片|硬件|半导体/i, '硬件与芯片'],
    [/artificial.intelligence|machine.learning|speech|text.to.speech|\bAI\b|人工智能|机器学习|语音|大模型/i, '人工智能'],
    [/software|development|programming|开发|编程|软件/i, '软件开发'],
    [/science|research|科学|科研|研究/i, '科学研究'],
    [/society|education|policy|社会|教育|政策|法律/i, '科技与社会'],
    [/internet|product|互联网|应用|产品/i, '互联网产品'],
  ];
  return mappings.find(([pattern]) => pattern.test(value))?.[1] ?? '科技综合';
}

export function detectLanguage(content: string, title = ''): 'zh' | 'en' | 'other' {
  const text = (content.trim() || title).replace(/https?:\/\/\S+/g, '');
  const han = text.match(/\p{Script=Han}/gu)?.length ?? 0;
  const latin = text.match(/\p{Script=Latin}/gu)?.length ?? 0;
  const other = text.match(/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Cyrillic}\p{Script=Arabic}]/gu)?.length ?? 0;
  if (han > 0 && han / Math.max(han + latin + other, 1) >= 0.25 && other < han / 2) return 'zh';
  if (other > latin / 2) return 'other';
  return latin > 0 ? 'en' : 'other';
}

export interface TranslationBlock { id: string; content: string }

/** Preserve source blocks, including the boundary after a closing code fence. */
export function markdownBlocks(content: string): string[] {
  const source = content.replaceAll('\r\n', '\n');
  return fromMarkdown(source).children.map(node => source.slice(node.position!.start.offset,node.position!.end.offset).trimEnd()).filter(Boolean);
}

function splitLongParagraph(content: string): string[] {
  if (content.length <= 6000 || /^\s*(```|~~~|\|)/.test(content)) return [content];
  const chunks: string[] = [];
  let remaining = content;
  while (remaining.length > 6000) {
    const window = remaining.slice(0, 6000);
    const sentence = Math.max(window.lastIndexOf('. '), window.lastIndexOf('。'), window.lastIndexOf('! '), window.lastIndexOf('? '));
    const boundary = sentence > 2000 ? sentence + 1 : Math.max(window.lastIndexOf(' '), 3000);
    chunks.push(remaining.slice(0, boundary).trim());
    remaining = remaining.slice(boundary).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

const translationSchema = z.object({ paragraphs: z.array(z.object({ id: z.string(), translation: z.string().trim().min(1) }).strict()) }).strict();

export async function translateArticle(model: ModelClient, news: { id: string; title: string; content: string; contentScope: string }, signal?: AbortSignal) {
  const blocks = markdownBlocks(news.content || news.title).flatMap(splitLongParagraph);
  const translated = new Map<string, string>();
  const requests: TranslationBlock[][] = [];
  let group: TranslationBlock[] = [], size = 0;
  for (let i = 0; i < blocks.length; i++) {
    const id = `p${i + 1}`, content = blocks[i];
    const imagesOnly = content.split('\n').every(line => /^!\[[^\]]*\]\([^\n]+\)$/.test(line.trim()));
    if (/^\s*(```|~~~)/.test(content) || imagesOnly || !/[\p{L}]/u.test(content)) { translated.set(id, content); continue; }
    if (group.length && size + content.length > 6000) { requests.push(group); group = []; size = 0; }
    group.push({ id, content }); size += content.length;
  }
  if (group.length) requests.push(group);
  const usage: ModelUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  for (const paragraphs of requests) {
    const result = await model.json('news-translation', {
      instructions: '逐段忠实翻译提供的 Markdown 为中文。paragraphs 必须逐一保留所有输入 id，每个 id 对应完整译文；不得只翻译标题或概括正文。保持标题层级、列表、表格、链接目标、数字、单位、名称和不确定性。来源仅有摘要时只翻译该摘要，不扩写。代码、网址与产品标识保持原样。',
      news: { ...news, content: paragraphs.map(block => block.content).join('\n\n') }, paragraphs,
    }, translationSchema, signal);
    const expected = new Set(paragraphs.map(block => block.id));
    if (result.value.paragraphs.length !== expected.size || new Set(result.value.paragraphs.map(block => block.id)).size !== expected.size || result.value.paragraphs.some(block => !expected.has(block.id))) {
      throw unavailable('译文未覆盖全部段落，请重试');
    }
    for (const block of result.value.paragraphs) {
      const original = paragraphs.find(item => item.id === block.id)!.content;
      // A long body reduced to a heading is an incomplete translation, even with all IDs present.
      if (original.length > 400 && block.translation.length < original.replace(/https?:\/\/\S+/g, '').length * 0.12) throw unavailable('译文遗漏正文内容，请重试');
      translated.set(block.id, block.translation);
    }
    for (const key of ['inputTokens', 'outputTokens', 'totalTokens'] as const) usage[key] = usage[key] === null || result.usage[key] === null ? null : usage[key] + result.usage[key];
  }
  return { translation: blocks.map((_, i) => translated.get(`p${i + 1}`)!).join('\n\n'), usage, paragraphCount: blocks.length };
}
