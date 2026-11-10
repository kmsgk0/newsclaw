import { z } from 'zod';
import { unavailable } from '../../errors.js';
import type { NewsItem } from '../news/types.js';
import type { Citation } from './repository.js';
import { markdownBlocks } from '../news/content.js';

export interface BilingualParagraph { id: string; sourceId: string; original: string }
export interface BilingualResult {
  paragraphs: { paragraphId: string; translation: string; expressions: { term: string; explanation: string }[] }[];
}

export function bilingualParagraphs(materials: NewsItem[]): BilingualParagraph[] {
  return materials.flatMap(source => markdownBlocks(source.content || source.title).map(original => ({ sourceId: source.id, original })))
    .map((paragraph, index) => ({ id: `P${index + 1}`, ...paragraph }));
}

export function bilingualSchema(paragraphs: BilingualParagraph[]) {
  return z.object({
    paragraphs: z.array(z.object({
      paragraphId: z.enum(paragraphs.map(paragraph => paragraph.id)),
      translation: z.string().trim().min(1),
      expressions: z.array(z.object({ term: z.string().trim().min(1), explanation: z.string().trim().min(1) }).strict()),
    }).strict()).min(1),
  }).strict();
}

const plain = (text: string) => text.replace(/[*_`>#]/g, '').replace(/\s+/g, ' ').trim();

export function renderBilingual(value: BilingualResult, paragraphs: BilingualParagraph[], citations: Citation[]) {
  const seen = new Set<string>();
  return value.paragraphs.map((pair, index) => {
    const paragraph = paragraphs.find(item => item.id === pair.paragraphId);
    const citation = citations.find(item => item.id === paragraph?.sourceId);
    if (!paragraph || !citation || seen.has(paragraph.id)) {
      throw unavailable('双语结果包含无效或重复的原文段落，请重新生成');
    }
    seen.add(paragraph.id);
    if (pair.expressions.some(item => !plain(paragraph.original).toLowerCase().includes(plain(item.term).toLowerCase()))) {
      throw unavailable('重点词语没有出现在对应原文中，请重新生成');
    }
    const original = paragraph.original.split('\n').map(line => `> ${line}`).join('\n');
    const terms = pair.expressions.length
      ? `\n\n${pair.expressions.map(item => `- **${item.term}**：${item.explanation}`).join('\n')}` : '';
    return `### 第 ${index + 1} 段 · [${citation.label}]\n\n${original}\n\n${pair.translation}${terms}`;
  }).join('\n\n');
}
