import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../../context.js';
import { invalid } from '../../errors.js';
import { NewsService, searchSchema, sourceSchema,dateSchema,preparePublicDailyInput } from './service.js';
import { NewsRepository } from './repository.js';
import { NEWS_DOMAINS } from './content.js';
export { NewsService, createNewsHandlers,preparePublicDailyInput } from './service.js';
export type { NewsItem, MaterialScope, Source } from './types.js';
const json = (schema: z.ZodType) => z.toJSONSchema(schema,{target:'draft-7'});
const idSchema = z.object({id:z.string().uuid()});
const operationSchema = z.object({operationId:z.string().min(1).max(160)}).strict();
export async function registerNews(app: FastifyInstance,ctx: AppContext) {
  const service = new NewsService(ctx), repo = service.repo;
  await repo.ensureVectorIndex(ctx.config.embeddingDim);
  app.get('/api/v1/sources',{config:{public:true},schema:{tags:['新闻'],summary:'公开信源和领域'}},async()=>({items:(await repo.sources()).map(s=>({id:s.id,name:s.name,kind:s.kind,url:s.url,lastCollectedAt:s.lastCollectedAt,lastError:s.lastError})),domains:NEWS_DOMAINS}));
  app.get('/api/v1/news',{config:{public:true},schema:{tags:['新闻'],summary:'浏览与检索新闻',querystring:json(searchSchema)}},async request=>service.search(searchSchema.parse(request.query)));
  app.get('/api/v1/news/:id',{config:{public:true},schema:{tags:['新闻'],summary:'新闻详情',params:json(idSchema)}},async request=>service.get(idSchema.parse(request.params).id,request.actor));
  const eventSearch=z.object({q:z.string().max(500).optional(),page:z.coerce.number().int().min(1).default(1),pageSize:z.coerce.number().int().min(1).max(100).default(20)}).strict();
  app.get('/api/v1/events',{config:{public:true},schema:{tags:['新闻'],summary:'搜索全部事件',querystring:json(eventSearch)}},async request=>repo.events(eventSearch.parse(request.query)));
  app.get('/api/v1/events/:id',{config:{public:true},schema:{tags:['新闻'],summary:'事件报道与时间线',params:json(idSchema)}},async request=>service.event(idSchema.parse(request.params).id));
  const librarySchema=z.object({kind:z.enum(['favorites','history']).default('favorites'),page:z.coerce.number().int().min(1).default(1),pageSize:z.coerce.number().int().min(1).max(100).default(20)}).strict();
  app.get('/api/v1/library',{schema:{tags:['阅读记录'],summary:'本人的收藏或阅读历史',querystring:json(librarySchema)}},async request=>{const q=librarySchema.parse(request.query);return repo.library(request.actor!.id,q.kind,q.page,q.pageSize);});
  app.post('/api/v1/news/:id/read',{schema:{tags:['阅读记录'],params:json(idSchema)}},async request=>repo.read(request.actor!.id,idSchema.parse(request.params).id));
  app.post('/api/v1/news/:id/favorite',{schema:{tags:['阅读记录'],params:json(idSchema)}},async request=>repo.favorite(request.actor!.id,idSchema.parse(request.params).id,true));
  app.delete('/api/v1/news/:id/favorite',{schema:{tags:['阅读记录'],params:json(idSchema)}},async request=>repo.favorite(request.actor!.id,idSchema.parse(request.params).id,false));
  const dates=z.object({date:dateSchema.optional()}).strict();
  app.get('/api/v1/digests',{config:{public:true},schema:{tags:['日报'],querystring:json(dates)}},async request=>repo.digests(dates.parse(request.query).date));
  app.get('/api/v1/admin/sources',{config:{admin:true},schema:{tags:['管理']}},async()=>({items:await repo.sources(true)}));
  app.get('/api/v1/admin/news',{config:{admin:true},schema:{tags:['管理'],summary:'查找全部收录报道',querystring:json(searchSchema)}},async request=>repo.search(searchSchema.parse(request.query),undefined,true));
  app.post('/api/v1/admin/sources',{config:{admin:true},schema:{tags:['管理'],body:json(sourceSchema)}},async(request,reply)=>{
    const result=await service.saveSource(sourceSchema.parse(request.body));reply.code(201);
    await ctx.db.query('INSERT INTO management_actions(actor_id,action,object_id,result) VALUES($1,$2,$3,$4)',[request.actor!.id,'source.create',result.id,'succeeded']);return result;
  });
  const patchSource=sourceSchema.partial().strict();
  app.patch('/api/v1/admin/sources/:id',{config:{admin:true},schema:{tags:['管理'],params:json(idSchema),body:json(patchSource)}},async request=>{
    const id=idSchema.parse(request.params).id;const old=await repo.source(id);const patch=patchSource.parse(request.body);
    if(!Object.keys(patch).length)throw invalid('请提供需要修改的信源字段');
    const result=await service.saveSource(sourceSchema.parse({name:old.name,kind:old.kind,url:old.url,enabled:old.enabled,config:old.config,...patch}),id);
    await ctx.db.query('INSERT INTO management_actions(actor_id,action,object_id,result) VALUES($1,$2,$3,$4)',[request.actor!.id,'source.update',id,'succeeded']);return result;
  });
  app.post('/api/v1/admin/sources/:id/collect',{config:{admin:true},schema:{tags:['管理'],params:json(idSchema),body:json(operationSchema)}},async(request,reply)=>{
    const id=idSchema.parse(request.params).id;const source=await repo.source(id);if(!source.enabled)throw invalid('请先启用信源');
    const task=await ctx.tasks.submit(request.actor,'collect',{sourceId:id},operationSchema.parse(request.body).operationId,null);reply.code(202);return {taskId:task.id,status:task.status,statusUrl:`/api/v1/tasks/${task.id}`};
  });
  const reprocess=operationSchema.extend({refreshSource:z.boolean().default(true)}).strict();
  app.post('/api/v1/admin/news/:id/reprocess',{config:{admin:true},schema:{tags:['管理'],summary:'重新处理一篇报道',params:json(idSchema),body:json(reprocess)}},async(request,reply)=>{
    const id=idSchema.parse(request.params).id,body=reprocess.parse(request.body),news=await repo.get(id),source=await repo.source(news.sourceId);
    if(!source.enabled)throw invalid('请先启用信源');
    const task=await ctx.tasks.submit(request.actor,'collect',{sourceId:source.id,newsId:id,refreshSource:body.refreshSource,force:true},body.operationId,null);
    reply.code(202);return {taskId:task.id,status:task.status,statusUrl:`/api/v1/tasks/${task.id}`};
  });
  const eventBody=z.object({eventId:z.string().uuid().nullable()}).strict();
  app.patch('/api/v1/admin/news/:id/event',{config:{admin:true},schema:{tags:['管理'],params:json(idSchema),body:json(eventBody)}},async request=>service.moveEvent(idSchema.parse(request.params).id,eventBody.parse(request.body).eventId,request.actor!.id));
  const digestBody=operationSchema.extend({date:dateSchema}).strict();
  app.post('/api/v1/admin/digests',{config:{admin:true},schema:{tags:['管理'],body:json(digestBody)}},async(request,reply)=>{const b=digestBody.parse(request.body);const task=await ctx.tasks.submit(request.actor,'daily',await preparePublicDailyInput(ctx,b.date),b.operationId,null,ctx.db,{date:b.date});reply.code(202);return {taskId:task.id,status:task.status,statusUrl:`/api/v1/tasks/${task.id}`};});
}
export async function seedSources(db: AppContext['db']) {
  const sources=[
    ['OpenAI News','https://openai.com/news/rss.xml'],['Google DeepMind','https://deepmind.google/blog/rss.xml'],
    ['Google Research','https://research.google/blog/rss/'],['Hugging Face Blog','https://huggingface.co/blog/feed.xml'],
    ['NVIDIA Blog','https://blogs.nvidia.com/feed/'],['GitHub AI & ML','https://github.blog/ai-and-ml/feed/'],
    ['TechCrunch AI','https://techcrunch.com/category/artificial-intelligence/feed/'],['The Verge AI','https://www.theverge.com/rss/ai-artificial-intelligence/index.xml'],
    ['Simon Willison','https://simonwillison.net/atom/everything/'],['Import AI','https://importai.substack.com/feed'],
    ['Latent Space','https://www.latent.space/feed'],['Berkeley AI Research','https://bair.berkeley.edu/blog/feed.xml'],
    ['Solidot','https://www.solidot.org/index.rss'],['IT之家','https://www.ithome.com/rss/'],['少数派','https://sspai.com/feed'],
  ];
  const repo=new NewsRepository(db);const existing=await repo.sources(true);
  for(const [name,url] of sources)if(!existing.some(s=>s.url===url))await repo.saveSource({
    name,url,kind:'rss',enabled:['OpenAI News','Hugging Face Blog','Simon Willison','Solidot','IT之家'].includes(name),
    config:{maxItems:5,...(name==='Hugging Face Blog'?{fetchArticle:true,articleSelector:'.blog-content > div.relative'}:{}),...(name==='IT之家'?{fetchArticle:true,articleSelector:'#paragraph'}:{})},
  });
}
