import { z } from 'zod';
import { unavailable } from '../../errors.js';
import type { NewsItem } from './types.js';

export const sourceLabelsSchema = z.array(z.string().regex(/^N[1-9]\d*$/));

export function readingMaterials(news: NewsItem[]) {
  return news.map((item,index)=>({
    label:`N${index+1}`, title:item.title, sourceName:item.sourceName, url:item.url,
    publishedAt:item.publishedAt, content:item.content, contentScope:item.contentScope,
    summary:item.summary, translation:item.translation, language:item.language, domain:item.domain,
  }));
}

export function selectLabeledSources<T extends {label:string}>(sources:T[],labels:string[]) {
  if (labels.some(label=>!sources.some(source=>source.label===label))) throw unavailable('生成结果引用了材料范围之外的报道');
  return sources.filter(source=>labels.includes(source.label));
}
