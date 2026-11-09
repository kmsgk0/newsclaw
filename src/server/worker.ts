import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { AppContext } from './context.js';
import { createContext,closeContext } from './application.js';
import type { TaskHandlers } from './runtime/tasks.js';
import { createNewsHandlers,preparePublicDailyInput } from './modules/news/index.js';
import { createTopicHandlers } from './modules/topics/index.js';
import { createEditorHandlers,prepareJournalInput,preparePersonalDailyInput } from './modules/editor/index.js';
import { businessDate } from './modules/editor/calendar.js';
import type { NewsItem } from './modules/news/types.js';

export function createHandlers(ctx:AppContext):TaskHandlers {
  const news=createNewsHandlers(ctx),editor=createEditorHandlers(ctx),topics=createTopicHandlers(ctx);
  return {collect:news.collect,notify:topics.notify,journal:editor.journal,daily:(task,run)=>task.owner_id?editor.daily(task,run):news.daily(task,run)};
}
export async function schedule(ctx:AppContext,now=new Date()) {
  const hour=now.toISOString().slice(0,13),date=businessDate(now);
  for(const source of await ctx.db.query<{id:string}>('SELECT id FROM news_sources WHERE enabled')) {
    await ctx.tasks.submit(null,'collect',{sourceId:source.id},`collect:${source.id}:${hour}`);
  }
  const localHour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',hour:'2-digit',hourCycle:'h23'}).format(now));
  if(localHour<8)return;
  const collecting=Boolean(await ctx.db.one("SELECT id FROM tasks WHERE type='collect' AND status IN ('pending','running') LIMIT 1"));
  const fingerprint=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0,24);
  const materialVersion=(news:NewsItem[])=>news.map(item=>({id:item.id,title:item.title,content:item.content,summary:item.summary,translation:item.translation})).sort((a,b)=>a.id.localeCompare(b.id));
  if(!collecting) {
    const input=await preparePublicDailyInput(ctx,date);
    const version=fingerprint(materialVersion(input.news));
    await ctx.tasks.submit(null,'daily',input,`public-daily:${date}:${version}`,null,ctx.db,{date,version});
  }
  for(const user of await ctx.db.query<{id:string}>('SELECT id FROM users')) {
    try {
      if(!collecting&&!await ctx.db.one("SELECT id FROM tasks WHERE owner_id=$1 AND type='daily' AND status IN ('pending','running') LIMIT 1",[user.id])) {
        const input=await preparePersonalDailyInput(ctx,user.id,date);
        const {name,style,interests}=input.snapshot.profile;
        const version=fingerprint({news:materialVersion(input.snapshot.news),name,style,interests,memories:input.snapshot.memories.map(({key,content,origin})=>({key,content,origin})).sort((a,b)=>a.key.localeCompare(b.key))});
        await ctx.tasks.submit(null,'daily',input,`personal-daily:${date}:${version}`,user.id,ctx.db,{date,version});
      }
      if(await ctx.db.one("SELECT id FROM tasks WHERE owner_id=$1 AND type='journal' AND status IN ('pending','running') LIMIT 1",[user.id]))continue;
      const input=await prepareJournalInput(ctx,user.id,date);
      if(BigInt(input.activityEnd)<=BigInt(input.snapshot.profile.activityCursor))continue;
      const batch={date,start:input.snapshot.profile.activityCursor,end:input.activityEnd,memoryRevision:input.snapshot.profile.memoryRevision};
      await ctx.tasks.submit(null,'journal',input,`journal:${date}:${fingerprint(batch)}`,user.id,ctx.db,batch);
    } catch(error) {
      ctx.logger.warn({module:'scheduler',actorId:user.id,result:'failed',code:error instanceof Error&&'code'in error?error.code:'INTERNAL_ERROR'},'Personal reading tasks could not be scheduled');
    }
  }
}
export async function startWorker(ctx:AppContext,{scheduling=true,intervalMs=1000,lockDuration=30000}={}) {
  if(scheduling)await ctx.tasks.queue.upsertJobScheduler('schedule',{every:60000},{name:'schedule',data:{},opts:{attempts:3,backoff:{type:'exponential',delay:2000}}});
  return ctx.tasks.start(createHandlers(ctx),{schedule:()=>schedule(ctx),intervalMs,lockDuration});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  const ctx=createContext();const runtime=await startWorker(ctx,{scheduling:process.env.SCHEDULE_ENABLED!=='false'});let stopping=false;
  ctx.logger.info({module:'worker',version:ctx.config.version},'Worker started');
  const stop=async()=>{if(stopping)return;stopping=true;const deadline=setTimeout(()=>process.exit(1),30000);deadline.unref();await runtime.close();await closeContext(ctx);clearTimeout(deadline);};
  process.on('SIGINT',()=>void stop());process.on('SIGTERM',()=>void stop());
}
