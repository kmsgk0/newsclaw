import { z } from 'zod';
import { isDeepStrictEqual } from 'node:util';
import type { Actor, AppContext } from '../../context.js';
import type { TaskHandler } from '../../runtime/tasks.js';
import { AppError,invalid, notFound,unavailable } from '../../errors.js';
import { NewsRepository } from '../news/repository.js';
import { NEWS_DOMAINS } from '../news/content.js';
import { TopicsRepository, type ArtifactInput } from './repository.js';
import { validateMindmap } from './validation.js';
export const filterSchema=z.object({keywords:z.string().trim().min(1).max(500).optional(),domain:z.enum(NEWS_DOMAINS).optional(),eventId:z.string().uuid().optional()}).strict().refine(value=>Boolean(value.keywords||value.domain||value.eventId),'请填写关键词、领域或事件');
export const topicSchema=z.object({name:z.string().trim().min(1).max(200),description:z.string().max(4000).default(''),filter:filterSchema}).strict();
export const artifactSchema=z.object({title:z.string().trim().min(1).max(200),kind:z.enum(['brief','comparison','mindmap']),content:z.string().min(1).max(100000).refine(value=>Boolean(value.trim()),'成果正文不能为空'),structure:z.unknown().optional(),skillId:z.string().optional(),sourceIds:z.array(z.string().uuid()).min(1).max(100),messageId:z.string().uuid().optional(),sourceSnapshots:z.array(z.unknown()).optional()}).strict();
export class TopicsService {
  readonly repo:TopicsRepository;
  constructor(private readonly ctx:AppContext){this.repo=new TopicsRepository(ctx.db);}
  async detail(id:string,actor:Actor){await this.repo.get(id,actor.id);await this.repo.refresh(id,actor.id);const [topic,news,notes,artifacts,following]=await Promise.all([this.repo.get(id,actor.id),this.repo.news(id,actor.id),this.repo.notes(id,actor.id),this.repo.artifacts(id,actor.id),this.repo.following(actor.id,'topic',id)]);return {...topic,news,notes,artifacts,following};}
  async save(id:string,actor:Actor,value:unknown){
    await this.repo.get(id,actor.id);let input=artifactSchema.parse(value);const sourceIds=[...new Set(input.sourceIds)];
    let sources;
    if(input.messageId){
      const generated=await this.repo.generatedArtifact(input.messageId,actor.id);
      if(generated.status!=='completed'||!generated.artifact)throw new AppError(409,'CONFLICT','成果尚未完成，请完成生成后再保存');
      const stored=generated.artifact;
      for(const key of ['kind','content','structure','skillId','sourceIds'] as const)if(!isDeepStrictEqual(input[key],stored[key]))throw invalid('成果内容或来源与生成记录不一致');
      if(!stored.sourceSnapshots||stored.sourceSnapshots.length!==sourceIds.length||stored.sourceSnapshots.some((source,index)=>source.id!==sourceIds[index]||!source.label))throw unavailable('生成记录缺少完整的来源快照');
      sources=stored.sourceSnapshots;
      input={...input,...stored,title:input.title};
    }else{
      if(input.sourceSnapshots)throw invalid('来源快照需要关联已完成的生成记录');
      sources=(await new NewsRepository(this.ctx.db).byIds(sourceIds)).map((source,index)=>({...source,label:`N${index+1}`}));
    }
    if(sources.length!==sourceIds.length)throw notFound();
    if(input.kind!=='mindmap'&&input.structure!==undefined)throw invalid('仅思维导图成果包含树形结构');
    const artifact:ArtifactInput={title:input.title,kind:input.kind,content:input.content,skillId:input.skillId,sourceIds,structure:input.kind==='mindmap'?validateMindmap(input.structure,sourceIds):undefined};
    return this.repo.saveArtifact(id,actor.id,artifact,sources);
  }
  async graph(id:string,actor:Actor){await this.repo.get(id,actor.id);await this.repo.refresh(id,actor.id);return this.repo.graph((await this.repo.news(id,actor.id)).map(n=>n.id));}
}
export function createTopicHandlers(_ctx:AppContext):{notify:TaskHandler}{
  return {notify:async task=>{
    const {newsId}=z.object({newsId:z.string().uuid()}).strict().parse(task.input);
    return {commit:async tx=>({newsId,...await new TopicsRepository(tx).notify(newsId)})};
  }};
}
