import type { Db } from '../../db.js';
import type { Candidate } from '../../adapters/sources.js';
import type { NewsItem, SearchInput, Source } from './types.js';
import { notFound, unavailable } from '../../errors.js';
import { createHash } from 'node:crypto';

type Row = Record<string, unknown>;
const iso = (value: unknown): string | null => value == null ? null : (value instanceof Date?value:new Date(String(value))).toISOString();
export function newsDto(row: Row): NewsItem {
  return { id: String(row.id), title: String(row.title), sourceId: String(row.source_id), sourceName: String(row.source_name), url: String(row.url), publishedAt: iso(row.published_at), content: String(row.content), contentScope: row.content_scope as NewsItem['contentScope'], summary: row.summary == null ? null : String(row.summary), translation: row.translation == null ? null : String(row.translation), language: String(row.language), domain: String(row.domain), eventId: row.event_id == null ? null : String(row.event_id), createdAt: iso(row.created_at)!, processing: row.processing as Record<string, unknown>, ...(row.favorite != null ? { favorite: Boolean(row.favorite) } : {}), ...(row.unread != null ? { unread: Boolean(row.unread) } : {}) };
}
export function sourceDto(row: Row): Source { return { id: String(row.id), name: String(row.name), kind: row.kind as Source['kind'], url: String(row.url), enabled: Boolean(row.enabled), config: row.config as Record<string, unknown>, lastCollectedAt: iso(row.last_collected_at), lastError: row.last_error == null ? null : String(row.last_error) }; }
export const newsSelect = 'SELECT n.*, s.name AS source_name FROM news n JOIN news_sources s ON s.id=n.source_id';
export class NewsRepository {
  constructor(readonly db: Db) {}
  async sources(admin = false) { return (await this.db.query(`SELECT * FROM news_sources ${admin ? '' : 'WHERE enabled'} ORDER BY name,id`)).map(sourceDto); }
  async source(id: string) { const row = await this.db.one('SELECT * FROM news_sources WHERE id=$1', [id]); if (!row) throw notFound(); return sourceDto(row); }
  async saveSource(input: { name: string; kind: Source['kind']; url: string; config: Record<string, unknown>; enabled: boolean }, id?: string) {
    const params = [input.name, input.kind, input.url, JSON.stringify(input.config), input.enabled];
    const row = id ? await this.db.one('UPDATE news_sources SET name=$1,kind=$2,url=$3,config=$4,enabled=$5 WHERE id=$6 RETURNING *', [...params, id]) : await this.db.one('INSERT INTO news_sources(name,kind,url,config,enabled) VALUES($1,$2,$3,$4,$5) RETURNING *', params);
    if (!row) throw notFound(); return sourceDto(row);
  }
  async get(id: string, userId?: string) {
    const row = await this.db.one(`SELECT n.*,s.name AS source_name,EXISTS(SELECT 1 FROM favorites f WHERE f.news_id=n.id AND f.user_id=$2::uuid) AS favorite FROM news n JOIN news_sources s ON s.id=n.source_id WHERE n.id=$1`, [id, userId ?? null]);
    if (!row) throw notFound(); return newsDto(row);
  }
  async raw(id: string) { const row = await this.db.one('SELECT * FROM news WHERE id=$1', [id]); if (!row) throw notFound(); return row; }
  async ensureVectorIndex(dimension: number) {
    if (!Number.isInteger(dimension) || dimension < 1 || dimension > 16000) throw unavailable('嵌入维度配置无效');
    if (dimension <= 2000) await this.db.query(`CREATE INDEX IF NOT EXISTS news_embedding_idx ON news USING hnsw ((embedding::vector(${dimension})) vector_cosine_ops) WHERE vector_dims(embedding)=${dimension}`);
  }
  async search(input: SearchInput, vector?: number[], admin = false) {
    const page = input.page ?? 1, pageSize = input.pageSize ?? 20; const values: unknown[] = []; const clauses = [admin ? 'true' : 'n.selected'];
    const param = (value: unknown) => { values.push(value); return `$${values.length}`; };
    if (input.domain) clauses.push(`n.domain=${param(input.domain)}`);
    if (input.language) clauses.push(`n.language=${param(input.language)}`);
    if (input.sourceId) clauses.push(`n.source_id=${param(input.sourceId)}::uuid`);
    let order = 'n.published_at DESC NULLS LAST,n.id';
    if (vector) { const ref = param(JSON.stringify(vector)); const dim = vector.length; clauses.push(`n.embedding IS NOT NULL AND vector_dims(n.embedding)=${dim} AND ${ref}::vector IS NOT NULL`); order = `(n.embedding::vector(${dim}) <=> ${ref}::vector(${dim})),${order}`; }
    else if (input.q) { const query = param(input.q); clauses.push(`(n.search_document @@ plainto_tsquery('simple',${query}) OR n.title ILIKE '%'||${query}||'%' OR n.content ILIKE '%'||${query}||'%' OR n.summary ILIKE '%'||${query}||'%' OR n.translation ILIKE '%'||${query}||'%')`); order = `ts_rank(n.search_document,plainto_tsquery('simple',${query})) DESC,${order}`; }
    const count = await this.db.one<{ total: string }>(`SELECT count(*) AS total FROM news n WHERE ${clauses.join(' AND ')}`, values);
    const items = await this.db.query(`${newsSelect} WHERE ${clauses.join(' AND ')} ORDER BY ${order} LIMIT ${param(pageSize)} OFFSET ${param((page-1)*pageSize)}`, values);
    return { items: items.map(newsDto), total: Number(count?.total ?? 0), page, pageSize };
  }
  async byIds(ids: string[], db = this.db) { if (!ids.length) return []; return (await db.query(`${newsSelect} WHERE n.id=ANY($1::uuid[]) ORDER BY array_position($1::uuid[],n.id)`, [ids])).map(newsDto); }
  async event(id: string) {
    const event = await this.db.one('SELECT * FROM events WHERE id=$1', [id]); if (!event) throw notFound();
    const news = (await this.db.query(`${newsSelect} WHERE n.event_id=$1 ORDER BY n.published_at ASC NULLS LAST,n.id`, [id])).map(newsDto);
    return { id: String(event.id), title: String(event.title), summary: String(event.summary), news, timeline: news };
  }
  async events(input: { q?: string; page?: number; pageSize?: number }) {
    const page = input.page ?? 1, pageSize = input.pageSize ?? 20;
    const values = [input.q?.trim() ?? '', pageSize, (page - 1) * pageSize];
    const count = await this.db.one<{ total: string }>("SELECT count(*) AS total FROM events WHERE $1='' OR title ILIKE '%'||$1||'%'", [values[0]]);
    const rows = await this.db.query(`SELECT e.*,count(n.id)::int AS report_count,count(DISTINCT n.source_id)::int AS source_count
      FROM events e LEFT JOIN news n ON n.event_id=e.id
      WHERE $1='' OR e.title ILIKE '%'||$1||'%' GROUP BY e.id ORDER BY e.updated_at DESC,e.id LIMIT $2 OFFSET $3`, values);
    return { items: rows.map(row => ({ id: String(row.id), title: String(row.title), summary: String(row.summary), reportCount: Number(row.report_count), sourceCount: Number(row.source_count), updatedAt: iso(row.updated_at) })), total: Number(count?.total ?? 0), page, pageSize };
  }
  async moveEvent(id: string, eventId: string | null, actorId: string) {
    return this.db.tx(async tx => {
      if (eventId && !await tx.one('SELECT id FROM events WHERE id=$1', [eventId])) throw notFound();
      const old = await tx.one<{ event_id: string | null }>('SELECT event_id FROM news WHERE id=$1 FOR UPDATE', [id]); if (!old) throw notFound();
      await tx.query("UPDATE news SET event_id=$2,event_assignment='manual',updated_at=now() WHERE id=$1", [id, eventId]);
      for (const affected of new Set([old.event_id, eventId].filter((value): value is string => Boolean(value)))) await this.refreshEvent(affected, tx);
      await tx.query('INSERT INTO management_actions(actor_id,object_id,action,result) VALUES($1,$2,$3,$4)', [actorId,id,'news.set-event','succeeded']);
    });
  }
  async library(userId: string, kind: 'favorites' | 'history', page: number, pageSize: number) {
    const table = kind === 'favorites' ? 'favorites' : 'reading_history', time = kind === 'favorites' ? 'created_at' : 'read_at';
    const rows = await this.db.query(`SELECT n.*,s.name AS source_name,EXISTS(SELECT 1 FROM favorites saved WHERE saved.user_id=$1 AND saved.news_id=n.id) AS favorite FROM ${table} f JOIN news n ON n.id=f.news_id JOIN news_sources s ON s.id=n.source_id WHERE f.user_id=$1 ORDER BY f.${time} DESC,n.id LIMIT $2 OFFSET $3`, [userId,pageSize,(page-1)*pageSize]);
    const count = await this.db.one<{ total: string }>(`SELECT count(*) AS total FROM ${table} WHERE user_id=$1`, [userId]);
    return { items: rows.map(newsDto), total: Number(count?.total ?? 0), page, pageSize };
  }
  async favorite(userId: string, newsId: string, enabled: boolean) {
    return this.db.tx(async tx => {
      if (!await tx.one('SELECT id FROM news WHERE id=$1', [newsId])) throw notFound();
      if (enabled) { const added = await tx.one('INSERT INTO favorites(user_id,news_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING news_id', [userId,newsId]); if (added) await tx.query("INSERT INTO activities(user_id,kind,news_id) VALUES($1,'favorite',$2)", [userId,newsId]); }
      else await tx.query('DELETE FROM favorites WHERE user_id=$1 AND news_id=$2', [userId,newsId]);
      return { favorite: enabled };
    });
  }
  async read(userId: string, newsId: string) {
    return this.db.tx(async tx => {
      if (!await tx.one('SELECT id FROM news WHERE id=$1', [newsId])) throw notFound();
      await tx.query('INSERT INTO reading_history(user_id,news_id) VALUES($1,$2) ON CONFLICT(user_id,news_id) DO UPDATE SET read_at=now()', [userId,newsId]);
      await tx.query("INSERT INTO activities(user_id,kind,news_id) VALUES($1,'read',$2)", [userId,newsId]); return { read: true };
    });
  }
  async upsert(sourceId: string, item: Candidate, db = this.db) {
    const hash = createHash('sha256').update(JSON.stringify({title:item.title,content:item.content,...(item.content.trim()?{}:{url:item.url})})).digest('hex');
    const row = await db.one(`INSERT INTO news(source_id,url,title,published_at,content,content_scope,content_hash) VALUES($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT(source_id,url) DO UPDATE SET title=EXCLUDED.title,published_at=EXCLUDED.published_at,content=EXCLUDED.content,content_scope=EXCLUDED.content_scope,content_hash=EXCLUDED.content_hash,
      processing=CASE WHEN news.content_hash=EXCLUDED.content_hash THEN news.processing ELSE news.processing||'{"stale":true,"source":"succeeded","summary":"pending","translation":"pending","index":"pending"}'::jsonb END,
      updated_at=CASE WHEN news.content_hash=EXCLUDED.content_hash AND news.title=EXCLUDED.title THEN news.updated_at ELSE now() END
      WHERE (length(trim(EXCLUDED.content))>0 OR length(trim(news.content))=0)
        AND (NOT $8::boolean OR length(trim(news.content))=0)
      RETURNING *, (xmax=0) AS inserted`, [sourceId,item.url,item.title,item.publishedAt,item.content,item.contentScope,hash,Boolean(item.enrichmentFailed)]);
    if(row)return row;
    const retained=await db.one('SELECT *,false AS inserted FROM news WHERE source_id=$1 AND url=$2',[sourceId,item.url]);
    if(!retained)throw notFound();return retained;
  }
  async processedTwin(hash: string, id: string) { return this.db.one("SELECT * FROM news WHERE content_hash=$1 AND id<>$2 AND length(trim(content))>0 AND summary IS NOT NULL AND processing->>'summaryHash'=content_hash ORDER BY updated_at DESC LIMIT 1", [hash,id]); }
  async copyEvent(id:string,eventId:string,db=this.db) {await db.query("UPDATE news SET event_id=$2 WHERE id=$1 AND event_id IS NULL AND event_assignment='auto'",[id,eventId]);}
  async updateProcessing(id: string, hash: string, fields: { summary?: string; translation?: string | null; language?: string; domain?: string; selected?: boolean; embedding?: number[]; extracted?: unknown; processing: Record<string, unknown> }, db = this.db) {
    const values: unknown[] = [id,hash,JSON.stringify(fields.processing)]; const updates = ['processing=processing||$3::jsonb','updated_at=now()'];
    for (const key of ['summary','translation','language','domain','selected','embedding','extracted'] as const) if (fields[key] !== undefined) { values.push(key === 'embedding' || key === 'extracted' ? JSON.stringify(fields[key]) : fields[key]); updates.push(`${key}=$${values.length}${key === 'embedding' ? '::vector' : key === 'extracted' ? '::jsonb' : ''}`); }
    await db.query(`UPDATE news SET ${updates.join(',')} WHERE id=$1 AND content_hash=$2`, values);
  }
  async group(id: string, eventTitle: string, summary: string, entityNames: string[], db = this.db) {
    const row = await db.one('SELECT * FROM news WHERE id=$1', [id]); if (!row || (row.event_assignment==='manual' && !row.event_id)) return;
    if (row.event_id) { await this.refreshEvent(String(row.event_id), db); return; }
    const candidates = await db.query(`SELECT e.id,e.title,e.summary,COALESCE(jsonb_agg(n.extracted->'entities') FILTER(WHERE n.extracted IS NOT NULL),'[]'::jsonb) AS entities,
      max(similarity(n.title,$2)) AS title_similarity,max(similarity(COALESCE(n.summary,''),$3)) AS summary_similarity
      FROM events e JOIN news n ON n.event_id=e.id
      WHERE COALESCE(n.published_at,n.created_at) BETWEEN COALESCE($1::timestamptz,now())-interval '7 days' AND COALESCE($1::timestamptz,now())+interval '7 days'
      GROUP BY e.id ORDER BY e.updated_at DESC LIMIT 100`, [row.published_at, eventTitle, summary]);
    const normalize = (s: string) => s.toLowerCase().replace(/[\p{P}\p{Z}]/gu,'');
    const normalized = normalize(eventTitle);
    const match = candidates.find(c => normalize(String(c.title)) === normalized || (normalized.length > 8 && normalize(String(c.title)).includes(normalized)))
      ?? candidates.find(c => {
        const known = new Set((c.entities as {name:string}[][]).flat().map(entity => normalize(entity.name)));
        const shared = entityNames.filter(name => known.has(normalize(name))).length;
        return shared >= 1 && (Number(c.title_similarity) >= 0.45 || Number(c.summary_similarity) >= 0.55);
      });
    const event = match ?? await db.one('INSERT INTO events(title,summary) VALUES($1,$2) RETURNING id', [eventTitle,summary]);
    await db.query('UPDATE news SET event_id=$2 WHERE id=$1 AND event_id IS NULL', [id,event!.id]);
    await this.refreshEvent(String(event!.id), db);
  }
  async refreshEvent(id: string, db = this.db) {
    const rows = await db.query<{ summary: string; source_name: string }>(`SELECT n.summary,s.name AS source_name FROM news n JOIN news_sources s ON s.id=n.source_id WHERE n.event_id=$1 AND n.summary IS NOT NULL ORDER BY n.published_at DESC NULLS LAST,n.id LIMIT 3`, [id]);
    const summaries = [...new Set(rows.map(row => row.summary.trim()).filter(Boolean))];
    await db.query('UPDATE events SET summary=$2,updated_at=now() WHERE id=$1', [id, summaries.join('\n\n')]);
  }
  async sourceResult(id: string, error: string | null, db = this.db) { await db.query('UPDATE news_sources SET last_collected_at=CASE WHEN $2::text IS NULL THEN now() ELSE last_collected_at END,last_error=$2 WHERE id=$1', [id,error]); }
  async dayNews(date: string) { return (await this.db.query(`${newsSelect} WHERE n.selected AND COALESCE(n.published_at,n.created_at) >= ($1::date::timestamp AT TIME ZONE 'Asia/Shanghai') AND COALESCE(n.published_at,n.created_at) < (($1::date+1)::timestamp AT TIME ZONE 'Asia/Shanghai') ORDER BY n.published_at DESC NULLS LAST,n.id`, [date])).map(newsDto); }
  async digests(date?: string) {
    const dates = await this.db.query<{ date: string }>('SELECT date::text AS date FROM public_digests ORDER BY date DESC LIMIT 100');
    const availableDates = dates.map(row => row.date), latestDate = availableDates[0] ?? null;
    const selectedDate = date ?? latestDate ?? new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'}).format(new Date());
    const rows = await this.db.query(`SELECT *,date::text AS date_text FROM public_digests ${date ? 'WHERE date=$1::date' : ''} ORDER BY date DESC LIMIT 100`, date ? [date] : []);
    const latest = await this.db.one("SELECT id,status,result,error,created_at FROM tasks WHERE type='daily' AND owner_id IS NULL AND input->>'date'=$1 ORDER BY created_at DESC,id DESC LIMIT 1", [selectedDate]);
    const latestTask = latest ? {taskId:String(latest.id),status:String(latest.status),result:latest.result,error:latest.error,createdAt:iso(latest.created_at)} : null;
    const result = latest?.result as {status?:string}|undefined;
    const status = latest && ['pending','running','failed'].includes(String(latest.status)) ? String(latest.status) : rows.some(row => row.date_text === selectedDate) ? 'ready' : result?.status === 'empty' ? 'empty' : 'idle';
    return { items: rows.map(row => ({ date: String(row.date_text), title: row.title, content: row.content, news: row.sources, sources: (row.sources as (NewsItem & {label?:string})[]).map((news,index) => ({id:news.id,title:news.title,sourceName:news.sourceName,url:news.url,label:news.label??`N${index+1}`})), generatedAt: iso(row.generated_at) })), availableDates, latestDate, date:selectedDate, latestTask, status };
  }
  async saveDigest(date: string, title: string, content: string, news: NewsItem[], generationAt: string | Date, db = this.db) {
    await db.query(`INSERT INTO public_digests(date,title,content,sources,generation_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(date) DO UPDATE SET title=EXCLUDED.title,content=EXCLUDED.content,sources=EXCLUDED.sources,generation_at=EXCLUDED.generation_at,generated_at=now() WHERE public_digests.generation_at<=EXCLUDED.generation_at`, [date,title,content,JSON.stringify(news),generationAt]);
  }
}
