import { z } from 'zod';
import type { Actor, AppContext } from '../../context.js';
import type { Db } from '../../db.js';
import type { TaskHandler, TaskRecord } from '../../runtime/tasks.js';
import { AppError, invalid, notFound, unavailable } from '../../errors.js';
import { fetchSource, parseSource, assertPublicTarget, normalizeUrl,enrichCandidate,validateSelectors, type Candidate } from '../../adapters/sources.js';
import { NewsRepository, newsSelect, newsDto } from './repository.js';
import type { MaterialScope, SearchInput, NewsItem } from './types.js';
import { graphExtractionSchema, validateGraph } from '../topics/validation.js';
import { TopicsRepository } from '../topics/repository.js';
import { NEWS_DOMAINS, detectLanguage, normalizeDomain, translateArticle } from './content.js';
import { readingMaterials, selectLabeledSources, sourceLabelsSchema } from './materials.js';

export const searchSchema = z.object({ q: z.string().max(500).optional(), domain: z.string().max(100).optional(), sourceId: z.string().uuid().optional(), language: z.enum(['zh','en','other']).optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20), semantic: z.preprocess(value=>value==='true'?true:value==='false'?false:value,z.boolean().optional()) }).strict();
export const sourceSchema = z.object({ name: z.string().trim().min(1).max(200), kind: z.enum(['rss','json','web']), url: z.string().url(), enabled: z.boolean().default(true), config: z.record(z.string(), z.unknown()).default({}) }).strict();
export const dateSchema=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>{const date=new Date(value);return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;},'日期无效');
const sourceCommon={maxItems:z.number().int().min(1).max(100).optional(),contentScope:z.enum(['full','summary']).optional(),contentFormat:z.enum(['auto','html','markdown','text']).optional(),fetchArticle:z.boolean().optional(),articleSelector:z.string().min(1).optional(),domain:z.enum(NEWS_DOMAINS).optional()};
const sourceConfigs={
  rss:z.object(sourceCommon).strict(),
  json:z.object({...sourceCommon,itemsPath:z.string().min(1).optional(),fields:z.object({title:z.string().min(1).optional(),url:z.string().min(1).optional(),publishedAt:z.string().min(1).optional(),content:z.string().min(1).optional(),summary:z.string().min(1).optional()}).strict().optional()}).strict(),
  web:z.object({...sourceCommon,itemSelector:z.string().min(1).optional(),titleSelector:z.string().min(1).optional(),linkSelector:z.string().min(1).optional(),dateSelector:z.string().min(1).optional(),contentSelector:z.string().min(1).optional()}).strict(),
};
const articleRelationSchema = graphExtractionSchema.shape.relations.element.omit({sourceIds:true}).strict();
const analysisSchema = z.object({ selected: z.boolean(), summary: z.string().min(1), language: z.string().min(2).optional(), domain: z.string().min(1), eventTitle: z.string().min(1), entities: graphExtractionSchema.shape.entities, relations: z.array(articleRelationSchema) }).strict();
const digestSchema = z.object({ title: z.string().min(1), content: z.string().min(1), sourceLabels: sourceLabelsSchema.min(1) }).strict();
export class NewsService {
  readonly repo: NewsRepository;
  constructor(private readonly ctx: AppContext) { this.repo = new NewsRepository(ctx.db); }
  async search(input: SearchInput) { const query = searchSchema.parse(input); const vector = query.semantic && query.q ? await this.ctx.model.embed(query.q) : undefined; return this.repo.search(query, vector); }
  async get(id: string, actor?: Actor | null) { return this.repo.get(id, actor?.id); }
  async event(id: string, actor?: Actor | null) {
    const result = await this.repo.event(id); const topics = new TopicsRepository(this.ctx.db);
    return { ...result, graph: await topics.graph(result.news.map(n => n.id)), following: actor ? await topics.following(actor.id,'event',id) : false };
  }
  async materials(actor: Actor, scope: MaterialScope) {
    if (scope.kind === 'news') { if (!scope.id) throw invalid('请选择新闻'); return [await this.get(scope.id,actor)]; }
    if (scope.kind === 'event') { if (!scope.id) throw invalid('请选择事件'); return (await this.repo.event(scope.id)).news; }
    if (scope.kind === 'favorites') return (await this.ctx.db.query(`${newsSelect} JOIN favorites f ON f.news_id=n.id WHERE f.user_id=$1 ORDER BY f.created_at DESC,n.id`, [actor.id])).map(newsDto);
    if (!scope.id) throw invalid('请选择专题');
    const repo = new TopicsRepository(this.ctx.db); await repo.get(scope.id,actor.id); await repo.refresh(scope.id,actor.id);
    return repo.news(scope.id,actor.id);
  }
  async saveSource(input: z.infer<typeof sourceSchema>, id?: string) {
    sourceConfigs[input.kind].parse(input.config);
    validateSelectors(input.config);
    await assertPublicTarget(input.url,this.ctx.config.allowedSourceHosts);
    return this.repo.saveSource({ ...input, url: normalizeUrl(input.url) },id);
  }
  async moveEvent(id:string,eventId:string|null,actorId:string){
    await this.ctx.db.tx(async tx=>{await new NewsRepository(tx).moveEvent(id,eventId,actorId);await new TopicsRepository(tx).updateHeat();});
    return this.get(id);
  }
  async guard(task: TaskRecord, executionId: string, sourceId: string, tx: Db) {
    const active = await tx.one('SELECT id FROM tasks WHERE id=$1 AND execution_id=$2 AND generation=$3 AND status=$4 FOR UPDATE', [task.id,executionId,task.generation,'running']);
    if (!active) throw new AppError(409,'CONFLICT','任务执行资格已失效');
    const source = await tx.one('SELECT id FROM news_sources WHERE id=$1 AND enabled FOR SHARE', [sourceId]);
    if (!source) throw notFound();
    if (task.actor_id && !await tx.one("SELECT id FROM users WHERE id=$1 AND role='admin'", [task.actor_id])) throw new AppError(403,'FORBIDDEN','执行主体已失去管理权限');
  }
}
export async function preparePublicDailyInput(ctx:AppContext,date:string){dateSchema.parse(date);return {date,news:await new NewsRepository(ctx.db).dayNews(date)};}
class SupersededArticle extends Error {}
export function createNewsHandlers(ctx: AppContext): { collect: TaskHandler; daily: TaskHandler } {
  const service = new NewsService(ctx), repo = service.repo;
  const collect: TaskHandler = async (task, run) => {
    const input = z.object({ sourceId: z.string().uuid(), newsId: z.string().uuid().optional(), refreshSource: z.boolean().optional(), force: z.boolean().optional() }).strict().parse(task.input);
    const source = await repo.source(input.sourceId);
    if (!source.enabled) throw notFound();
    const write = <T>(operation: (tx: Db) => Promise<T>) => ctx.db.tx(async tx => {
      await service.guard(task, run.executionId, source.id, tx);
      return operation(tx);
    });
    let candidates: Candidate[];
    try {
      if (input.newsId) {
        const news = await repo.get(input.newsId);
        if (news.sourceId !== source.id) throw invalid('报道不属于所选信源');
        candidates = [{ title:news.title, url:news.url, publishedAt:news.publishedAt, content:news.content, contentScope:news.contentScope }];
      } else {
        const response = await fetchSource(source.url, ctx.config.allowedSourceHosts, run.signal);
        const limit = typeof source.config.maxItems === 'number' ? source.config.maxItems : 10;
        candidates = parseSource(source.kind, response.body, response.url, source.config)
          .sort((a,b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '')).slice(0,limit);
      }
    } catch (error) {
      const message = error instanceof AppError ? error.message : '信源读取失败';
      await write(tx => repo.sourceResult(source.id,message,tx));
      throw error;
    }
    const processed: string[] = [], supersededNewsIds: string[] = [], failures: { id?: string; message: string }[] = [];
    for (const initial of candidates) {
      let active: {id:string;hash:string;step:string}|undefined;
      try {
        if(initial.sourceError) throw invalid(initial.sourceError);
        const candidate = await enrichCandidate(initial, ctx.config.allowedSourceHosts, run.signal, { ...source.config, ...(input.refreshSource ? {refreshSource:true} : {}) });
        const raw = await write(async tx => {
          const row = await repo.upsert(source.id,candidate,tx);
          if (row.inserted) await ctx.tasks.submit(null,'notify',{newsId:String(row.id)},`news-${row.id}`,null,tx);
          return row;
        });
        const id = String(raw.id), hash = String(raw.content_hash);
        active = {id,hash,step:'source'};
        const writeArticle = <T>(operation:(tx:Db)=>Promise<T>) => write(async tx=>{
          const current=await tx.one<{content_hash:string}>('SELECT content_hash FROM news WHERE id=$1 FOR UPDATE',[id]);
          if(!current || current.content_hash!==hash) throw new SupersededArticle('报道已有更新的内容版本');
          return operation(tx);
        });
        const set = (fields: Parameters<NewsRepository['updateProcessing']>[2]) => writeArticle(tx => repo.updateProcessing(id,hash,fields,tx));
        const language = detectLanguage(String(raw.content),String(raw.title));
        await set({language,domain:normalizeDomain(String(source.config.domain??raw.domain)),processing:{}});
        if (candidate.enrichmentFailed) {
          await set({processing:{source:'failed',sourceBodyError:candidate.enrichmentError,material:String(raw.content).trim()?raw.content_scope:'title-only'}});
          throw unavailable(candidate.enrichmentError ?? '来源正文读取失败');
        }
        let state = raw.processing as Record<string,unknown>;
        if (input.force && state.forcedTask !== task.id) {
          state = {...state,forcedTask:task.id,summaryHash:null,translationHash:null,indexHash:null};
          await set({processing:{forcedTask:task.id,summaryHash:null,translationHash:null,indexHash:null,summary:'pending',translation:'pending',index:'pending'}});
        }
        await set({processing:{source:'succeeded',sourceBodyError:candidate.enrichmentError??null,error:null,material:candidate.content?candidate.contentScope:'title-only',contentVersion:2}});
        let summary = raw.summary as string|null;
        let extracted = raw.extracted;
        active.step = 'summary';
        if (!summary || state.summaryHash !== hash) {
          const twin = candidate.content && !input.force ? await repo.processedTwin(hash,id) : undefined;
          if (twin?.summary) {
            summary = String(twin.summary);
            const graph = twin.extracted ? graphExtractionSchema.parse(twin.extracted) : {entities:[],relations:[]};
            extracted = {...graph,relations:graph.relations.map(relation=>({...relation,sourceIds:[id]}))};
            const twinState = twin.processing as Record<string,unknown>;
            await set({summary,language,domain:normalizeDomain(String(twin.domain)),selected:Boolean(twin.selected),extracted,
              ...(twin.translation && twinState.translationHash === hash ? {translation:String(twin.translation)} : {}),
              processing:{summary:'succeeded',summaryHash:hash,...(twin.translation && twinState.translationHash===hash?{translation:'succeeded',translationHash:hash}:{})}});
            if (twin.event_id) await writeArticle(tx => repo.copyEvent(id,String(twin.event_id),tx));
          } else if (!candidate.content) {
            summary = candidate.title;
            extracted = {entities:[],relations:[]};
            await set({summary,language,domain:normalizeDomain(String(source.config.domain??'科技综合')),extracted,processing:{summary:'succeeded',summaryHash:hash,material:'title-only'}});
          } else {
            await set({processing:{summary:'running'}});
            const result = await ctx.model.json('news-analysis',{
              instructions:`根据来源写一段简洁、忠实的中文摘要，直接说明谁做了什么以及明确结果。保留日期、数字、产品名称与未披露条件，不推断价格或性能。Issue、PR、问题编号不是版本号。领域从 ${NEWS_DOMAINS.join('、')} 中选择一个。具体事件标题描述本次发生的事情。只提取当前这篇报道明确叙述的实体与关系，关系的 source 和 target 必须逐字对应 entities 中的 name；关系只含 source、target、label，来源由系统绑定，不输出来源标识或 UUID。没有明确关系时返回空数组。仅摘要不得扩写成原文。`,
              news:{id,...candidate},
            },analysisSchema,run.signal);
            const graph = validateGraph({entities:result.value.entities,relations:result.value.relations.map(relation=>({...relation,sourceIds:[id]}))},[id]);
            summary = result.value.summary; extracted = graph;
            await writeArticle(async tx => {
              await repo.updateProcessing(id,hash,{summary:summary!,language,domain:normalizeDomain(String(source.config.domain??result.value.domain)),selected:result.value.selected,extracted:graph,processing:{summary:'succeeded',summaryHash:hash,error:null}},tx);
              await repo.group(id,result.value.eventTitle,summary!,graph.entities.map(entity=>entity.name),tx);
            });
            ctx.logger.info({module:'news',taskId:task.id,newsId:id,action:'summary',usage:result.usage,result:'succeeded'});
          }
        } else await set({language,processing:{}});
        let current = await repo.raw(id);
        if (!current.event_id) await writeArticle(tx=>repo.group(id,candidate.title,summary!,[],tx));
        else await writeArticle(tx=>repo.refreshEvent(String(current.event_id),tx));
        const currentState = current.processing as Record<string,unknown>;
        if (language === 'zh') {
          await set({translation:null,processing:{translation:'not_needed',translationHash:hash}});
        } else if (!current.translation || currentState.translationHash !== hash) {
          active.step = 'translation';
          await set({processing:{translation:'running'}});
          const result = await translateArticle(ctx.model,{id,title:candidate.title,content:String(current.content),contentScope:String(current.content_scope)},run.signal);
          await set({translation:result.translation,processing:{translation:'succeeded',translationHash:hash,translatedParagraphs:result.paragraphCount,error:null}});
          ctx.logger.info({module:'news',taskId:task.id,newsId:id,action:'translation',usage:result.usage,result:'succeeded'});
        }
        current = await repo.raw(id);
        if (!current.embedding || (current.processing as Record<string,unknown>).indexHash !== hash) {
          active.step = 'index';
          await set({processing:{index:'running'}});
          const embedding = await ctx.model.embed(`${candidate.title}\n${summary}`,run.signal);
          await set({embedding,processing:{index:'succeeded',indexHash:hash,error:null}});
        }
        await writeArticle(async tx => {
          if (extracted) await new TopicsRepository(tx).saveGraph(id,validateGraph(extracted,[id]));
          const ready = await tx.one('SELECT event_id FROM news WHERE id=$1',[id]);
          await repo.updateProcessing(id,hash,{processing:{stale:false,error:null,completedAt:new Date().toISOString()}},tx);
          await ctx.tasks.submit(null,'notify',{newsId:id},`news-ready-${id}-${hash}-${ready?.event_id??'independent'}`,null,tx);
        });
        processed.push(id);
      } catch (error) {
        if (run.signal.aborted) throw error;
        if(error instanceof SupersededArticle){if(active)supersededNewsIds.push(active.id);continue;}
        const message = error instanceof AppError ? error.message : '新闻处理失败，请重试';
        failures.push({id:active?.id,message});
        ctx.logger.warn({module:'news',taskId:task.id,newsId:active?.id,step:active?.step,result:'failed'},'News processing failed');
        if (active) await write(tx=>repo.updateProcessing(active!.id,active!.hash,{processing:{[active!.step]:'failed',error:message}},tx));
        if ((error as {retryable?:boolean})?.retryable === false) {
          await write(tx=>repo.sourceResult(source.id,message,tx));
          throw error;
        }
      }
    }
    if (failures.length) {
      await write(async tx => {await repo.sourceResult(source.id,`${failures.length} 篇处理失败：${failures[0].message}`,tx);await new TopicsRepository(tx).updateHeat();});
      throw unavailable(`${failures.length} 篇报道处理失败，${processed.length} 篇已完成。${failures[0].message}`);
    }
    return {commit:async tx=>{
      await service.guard(task,run.executionId,source.id,tx);
      if(processed.length || !supersededNewsIds.length) await repo.sourceResult(source.id,null,tx);
      await new TopicsRepository(tx).updateHeat();
      return {sourceId:source.id,processed:processed.length,newsIds:processed,...(supersededNewsIds.length?{supersededNewsIds,...(!processed.length?{status:'superseded',message:'报道已有更新版本，本次未覆盖新内容'}:{})}:{})};
    }};
  };
  const daily: TaskHandler = async (task,run) => {
    if (task.owner_id) throw invalid('此处理器仅处理公共日报');
    const input = z.object({date:dateSchema,news:z.array(z.object({id:z.string().uuid(),title:z.string(),sourceName:z.string(),url:z.string().url(),content:z.string()}).passthrough())}).passthrough().parse(task.input);
    const news = (input.news as unknown as NewsItem[]).map((item,index)=>({...item,label:`N${index+1}`}));
    if (!news.length) return {commit:async()=>({date:input.date,status:'empty',message:'当日暂无可用新闻'})};
    const result = await ctx.model.json('public-digest',{
      instructions:'根据这些报道写中文新闻日报。用具体事实写标题和每条导读，必要时交代背景；保留条件与不确定性，不用宣传口号和重复总结。每条新闻用提供的 [N1]、[N2] 标号引用；sourceLabels 只填写实际使用的材料编号，例如 N1。保持自然的 Markdown 标题和段落。',
      date:input.date,news:readingMaterials(news),
    },digestSchema,run.signal);
    const selected = selectLabeledSources(news,result.value.sourceLabels);
    const references = [...result.value.content.matchAll(/\[(N\d+)\]/g)].map(match=>match[1]);
    const links = [...result.value.content.matchAll(/https?:\/\/[^\s)\]>]+/g)].map(match=>match[0]);
    if (references.some(label=>!selected.some(item=>item.label===label)) || links.some(url=>!selected.some(item=>item.url===url)) || !references.length) throw unavailable('日报缺少有效来源引用');
    return {commit:async tx=>{
      await repo.saveDigest(input.date,result.value.title,result.value.content,selected,task.created_at,tx);
      return {date:input.date,status:'succeeded'};
    }};
  };
  return {collect,daily};
}
