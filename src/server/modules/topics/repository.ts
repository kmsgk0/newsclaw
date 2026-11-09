import { randomBytes } from 'node:crypto';
import type { Db } from '../../db.js';
import { notFound } from '../../errors.js';
import { newsDto, newsSelect, NewsRepository } from '../news/repository.js';
import type { NewsItem, Graph, GraphEdge, GraphNode } from '../news/types.js';
import type { GraphExtraction, MindmapNode } from './validation.js';
import type { Artifact } from '../editor/repository.js';
import { businessDate } from '../editor/calendar.js';

export interface TopicFilter { keywords?: string; domain?: string; eventId?: string }
export interface Topic { id:string; name:string; description:string; filter:TopicFilter; newsCount:number; unreadCount:number; updatedAt:string }
export interface ArtifactInput { title:string; kind:'brief'|'comparison'|'mindmap'; content:string; structure?:MindmapNode; skillId?:string; sourceIds:string[] }
export interface FollowReason { kind:'event'|'topic'; id:string; title:string; url:string }
const matchSql = `(coalesce(t.filter->>'keywords','')='' OR n.title||' '||n.content||' '||coalesce(n.summary,'')||' '||coalesce(n.translation,'') ILIKE '%'||(t.filter->>'keywords')||'%') AND (coalesce(t.filter->>'domain','')='' OR n.domain=t.filter->>'domain') AND (coalesce(t.filter->>'eventId','')='' OR n.event_id::text=t.filter->>'eventId')`;
const topicSelect = `SELECT t.*,(SELECT count(*) FROM topic_news tn WHERE tn.topic_id=t.id) AS news_count,(SELECT count(*) FROM topic_news tn WHERE tn.topic_id=t.id AND (t.last_viewed_at IS NULL OR tn.added_at>t.last_viewed_at)) AS unread_count FROM topics t`;
const iso = (value:unknown) => value == null ? null : (value instanceof Date?value:new Date(String(value))).toISOString();
const topicDto = (r:Record<string,unknown>):Topic => ({id:String(r.id),name:String(r.name),description:String(r.description),filter:r.filter as TopicFilter,newsCount:Number(r.news_count),unreadCount:Number(r.unread_count),updatedAt:iso(r.updated_at)!});
export class TopicsRepository {
  constructor(readonly db:Db) {}
  async refresh(id:string|undefined,userId:string) {
    await this.db.query(`DELETE FROM topic_news tn USING topics t,news n WHERE tn.topic_id=t.id AND tn.news_id=n.id AND t.user_id=$1 AND ($2::uuid IS NULL OR t.id=$2) AND NOT tn.manual AND NOT (${matchSql})`,[userId,id??null]);
    await this.db.query(`INSERT INTO topic_news(topic_id,news_id) SELECT t.id,n.id FROM topics t CROSS JOIN news n WHERE t.user_id=$1 AND ($2::uuid IS NULL OR t.id=$2) AND n.selected AND ${matchSql} AND NOT EXISTS(SELECT 1 FROM topic_news_exclusions x WHERE x.topic_id=t.id AND x.news_id=n.id) ON CONFLICT DO NOTHING`,[userId,id??null]);
  }
  async list(userId:string) { await this.refresh(undefined,userId);return {items:(await this.db.query(`${topicSelect} WHERE t.user_id=$1 ORDER BY t.updated_at DESC,t.id`,[userId])).map(topicDto)}; }
  async get(id:string,userId:string) {const row=await this.db.one(`${topicSelect} WHERE t.id=$1 AND t.user_id=$2`,[id,userId]);if(!row)throw notFound();return topicDto(row);}
  async create(userId:string,input:{name:string;description:string;filter:TopicFilter}) {
    if(input.filter.eventId&&!await this.db.one('SELECT id FROM events WHERE id=$1',[input.filter.eventId]))throw notFound();
    const r=await this.db.one('INSERT INTO topics(user_id,name,description,filter) VALUES($1,$2,$3,$4) RETURNING id',[userId,input.name,input.description,JSON.stringify(input.filter)]);
    await this.refresh(String(r!.id),userId);return this.get(String(r!.id),userId);
  }
  async update(id:string,userId:string,input:{name?:string;description?:string;filter?:TopicFilter}) {
    const old=await this.get(id,userId);
    if(input.filter?.eventId&&!await this.db.one('SELECT id FROM events WHERE id=$1',[input.filter.eventId]))throw notFound();
    await this.db.query('UPDATE topics SET name=$3,description=$4,filter=$5,updated_at=now() WHERE id=$1 AND user_id=$2',[id,userId,input.name??old.name,input.description??old.description,JSON.stringify(input.filter??old.filter)]);
    await this.refresh(id,userId);return this.get(id,userId);
  }
  async remove(id:string,userId:string) {return this.db.tx(async tx=>{const row=await tx.one('DELETE FROM topics WHERE id=$1 AND user_id=$2 RETURNING id',[id,userId]);if(!row)throw notFound();await tx.query("DELETE FROM follows WHERE user_id=$1 AND kind='topic' AND target_id=$2",[userId,id]);return {deleted:true};});}
  async news(id:string,userId:string) {
    await this.get(id,userId);
    return (await this.db.query(`SELECT n.*,s.name AS source_name,(t.last_viewed_at IS NULL OR tn.added_at>t.last_viewed_at) AS unread FROM topic_news tn JOIN topics t ON t.id=tn.topic_id JOIN news n ON n.id=tn.news_id JOIN news_sources s ON s.id=n.source_id WHERE t.id=$1 AND t.user_id=$2 ORDER BY n.published_at DESC NULLS LAST,n.id`,[id,userId])).map(newsDto);
  }
  async addNews(id:string,userId:string,newsId:string) {return this.db.tx(async tx=>{
    if(!await tx.one('SELECT id FROM topics WHERE id=$1 AND user_id=$2 FOR UPDATE',[id,userId]))throw notFound();
    if(!await tx.one('SELECT id FROM news WHERE id=$1',[newsId]))throw notFound();
    await tx.query('DELETE FROM topic_news_exclusions WHERE topic_id=$1 AND news_id=$2',[id,newsId]);
    await tx.query('INSERT INTO topic_news(topic_id,news_id,manual) VALUES($1,$2,true) ON CONFLICT(topic_id,news_id) DO UPDATE SET manual=true',[id,newsId]);return {added:true};
  });}
  async removeNews(id:string,userId:string,newsId:string) {
    return this.db.tx(async tx => {
      if (!await tx.one('SELECT id FROM topics WHERE id=$1 AND user_id=$2 FOR UPDATE',[id,userId])) throw notFound();
      if (!await tx.one('SELECT id FROM news WHERE id=$1',[newsId])) throw notFound();
      await tx.query('INSERT INTO topic_news_exclusions(topic_id,news_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[id,newsId]);
      await tx.query('DELETE FROM topic_news WHERE topic_id=$1 AND news_id=$2',[id,newsId]);
      return {removed:true};
    });
  }
  async markRead(id:string,userId:string) {const row=await this.db.one('UPDATE topics SET last_viewed_at=now() WHERE id=$1 AND user_id=$2 RETURNING id',[id,userId]);if(!row)throw notFound();return {read:true};}
  async notes(id:string,userId:string) {await this.get(id,userId);return (await this.db.query('SELECT id,content,created_at,updated_at FROM topic_notes WHERE topic_id=$1 ORDER BY created_at,id',[id])).map(r=>({id:r.id,content:r.content,createdAt:iso(r.created_at),updatedAt:iso(r.updated_at)}));}
  async addNote(id:string,userId:string,content:string) {return this.db.tx(async tx=>{if(!await tx.one('SELECT id FROM topics WHERE id=$1 AND user_id=$2 FOR SHARE',[id,userId]))throw notFound();const row=await tx.one('INSERT INTO topic_notes(topic_id,content) VALUES($1,$2) RETURNING id,content,created_at',[id,content]);return {id:row!.id,content:row!.content,createdAt:iso(row!.created_at)};});}
  async updateNote(topicId:string,noteId:string,userId:string,content:string) {
    const row = await this.db.one(`UPDATE topic_notes n SET content=$4,updated_at=now() FROM topics t WHERE n.id=$1 AND n.topic_id=$2 AND t.id=n.topic_id AND t.user_id=$3 RETURNING n.id,n.content,n.created_at,n.updated_at`,[noteId,topicId,userId,content]);
    if (!row) throw notFound();
    return {id:row.id,content:row.content,createdAt:iso(row.created_at),updatedAt:iso(row.updated_at)};
  }
  async removeNote(topicId:string,noteId:string,userId:string) {
    const row = await this.db.one(`DELETE FROM topic_notes n USING topics t WHERE n.id=$1 AND n.topic_id=$2 AND t.id=n.topic_id AND t.user_id=$3 RETURNING n.id`,[noteId,topicId,userId]);
    if (!row) throw notFound();
    return {deleted:true};
  }
  async artifacts(id:string,userId:string) {
    await this.get(id,userId);
    return (await this.db.query(`SELECT a.*,coalesce((SELECT jsonb_agg(jsonb_build_object('token',s.token,'url','/shares/'||s.token,'revokedAt',s.revoked_at) ORDER BY s.created_at DESC) FROM shares s WHERE s.artifact_id=a.id),'[]'::jsonb) AS shares FROM artifacts a WHERE a.topic_id=$1 AND a.user_id=$2 ORDER BY a.created_at DESC,a.id`,[id,userId])).map(r=>({id:r.id,title:r.title,kind:r.kind,content:r.content,structure:r.structure,skillId:r.skill_id,sources:r.sources,shares:r.shares,createdAt:iso(r.created_at)}));
  }
  async saveArtifact(id:string,userId:string,input:ArtifactInput,sources:NewsItem[]) {
    return this.db.tx(async tx=>{
      if(!await tx.one('SELECT id FROM topics WHERE id=$1 AND user_id=$2 FOR SHARE',[id,userId]))throw notFound();
      const row=await tx.one('INSERT INTO artifacts(topic_id,user_id,title,kind,content,structure,skill_id,sources) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',[id,userId,input.title,input.kind,input.content,input.structure?JSON.stringify(input.structure):null,input.skillId??null,JSON.stringify(sources)]);
      return {id:String(row!.id),...input,sources};
    });
  }
  async generatedArtifact(messageId:string,userId:string){
    const row=await this.db.one<{status:string;artifact:Artifact|null}>("SELECT m.status,m.artifact FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE m.id=$1 AND c.user_id=$2 AND m.role='assistant'",[messageId,userId]);
    if(!row)throw notFound();return row;
  }
  async renameArtifact(artifactId:string,userId:string,title:string) {
    const row = await this.db.one('UPDATE artifacts SET title=$3 WHERE id=$1 AND user_id=$2 RETURNING id,title',[artifactId,userId,title]);
    if (!row) throw notFound();
    return row;
  }
  async removeArtifact(artifactId:string,userId:string) {
    const row = await this.db.one('DELETE FROM artifacts WHERE id=$1 AND user_id=$2 RETURNING id',[artifactId,userId]);
    if (!row) throw notFound();
    return {deleted:true};
  }
  async preview(artifactId:string,userId:string) {
    const row=await this.db.one('SELECT title,kind,content,structure,sources FROM artifacts WHERE id=$1 AND user_id=$2',[artifactId,userId]);if(!row)throw notFound();
    return {title:row.title,kind:row.kind,content:row.content,structure:row.structure,sources:row.sources};
  }
  async share(artifactId:string,userId:string) {return this.db.tx(async tx=>{
    const snapshot=await new TopicsRepository(tx).preview(artifactId,userId);const token=randomBytes(24).toString('base64url');
    await tx.query('INSERT INTO shares(token,artifact_id,user_id,snapshot) VALUES($1,$2,$3,$4)',[token,artifactId,userId,JSON.stringify(snapshot)]);return {token,url:`/shares/${token}`};
  });}
  async publicShare(token:string) {const row=await this.db.one('SELECT snapshot FROM shares WHERE token=$1 AND revoked_at IS NULL',[token]);if(!row)throw notFound();return row.snapshot;}
  async revoke(token:string,userId:string) {const row=await this.db.one('UPDATE shares SET revoked_at=coalesce(revoked_at,now()) WHERE token=$1 AND user_id=$2 RETURNING token',[token,userId]);if(!row)throw notFound();return {revoked:true};}
  async following(userId:string,kind:'event'|'topic',id:string) {return Boolean(await this.db.one('SELECT 1 FROM follows WHERE user_id=$1 AND kind=$2 AND target_id=$3',[userId,kind,id]));}
  async follows(userId:string) {
    const rows = await this.db.query(`SELECT f.kind,f.target_id,coalesce(e.title,t.name) AS title,f.created_at FROM follows f LEFT JOIN events e ON f.kind='event' AND e.id=f.target_id LEFT JOIN topics t ON f.kind='topic' AND t.id=f.target_id AND t.user_id=f.user_id WHERE f.user_id=$1 AND (e.id IS NOT NULL OR t.id IS NOT NULL) ORDER BY f.created_at DESC,f.kind,f.target_id`,[userId]);
    return {items:rows.map(row=>({kind:row.kind,id:row.target_id,title:row.title,url:`/${row.kind==='event'?'events':'topics'}/${row.target_id}`,createdAt:iso(row.created_at)}))};
  }
  async follow(userId:string,kind:'event'|'topic',id:string,enabled:boolean) {
    if(kind==='topic')await this.get(id,userId);else if(!await this.db.one('SELECT id FROM events WHERE id=$1',[id]))throw notFound();
    if(enabled)await this.db.query('INSERT INTO follows(user_id,kind,target_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[userId,kind,id]);else await this.db.query('DELETE FROM follows WHERE user_id=$1 AND kind=$2 AND target_id=$3',[userId,kind,id]);
    return {following:enabled};
  }
  async notify(newsId:string) {
    const row=await this.db.one('SELECT id FROM news WHERE id=$1',[newsId]);if(!row)throw notFound();
    const matches=await this.db.query<{user_id:string;kind:'event'|'topic';target_id:string;title:string}>(`SELECT f.user_id,f.kind,f.target_id,coalesce(e.title,t.name) AS title FROM follows f JOIN news n ON n.id=$1 LEFT JOIN events e ON f.kind='event' AND e.id=f.target_id LEFT JOIN topics t ON f.kind='topic' AND t.id=f.target_id AND t.user_id=f.user_id WHERE (f.kind='event' AND f.target_id=n.event_id) OR (f.kind='topic' AND t.id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM topic_news_exclusions x WHERE x.topic_id=t.id AND x.news_id=n.id) AND (${matchSql} OR EXISTS(SELECT 1 FROM topic_news tn WHERE tn.topic_id=t.id AND tn.news_id=n.id AND tn.manual))) ORDER BY f.user_id,f.kind,f.target_id`,[newsId]);
    const recipients=new Map<string,FollowReason[]>();
    for(const match of matches) {
      const reasons=recipients.get(match.user_id)??[];
      reasons.push({kind:match.kind,id:match.target_id,title:match.title,url:`/${match.kind==='event'?'events':'topics'}/${match.target_id}`});
      recipients.set(match.user_id,reasons);
    }
    for(const [userId,reasons] of recipients) await this.db.query(`INSERT INTO notifications(user_id,news_id,reasons) VALUES($1,$2,$3) ON CONFLICT(user_id,news_id) DO UPDATE SET reasons=(SELECT coalesce(jsonb_agg(reason ORDER BY reason->>'kind',reason->>'id'),'[]'::jsonb) FROM (SELECT DISTINCT ON (reason->>'kind',reason->>'id') reason FROM jsonb_array_elements(notifications.reasons||EXCLUDED.reasons) reason ORDER BY reason->>'kind',reason->>'id') reasons)`,[userId,newsId,JSON.stringify(reasons)]);
    return {matched:recipients.size};
  }
  async notifications(userId:string,page:number,pageSize:number) {
    const rows=await this.db.query('SELECT a.*,n.title,s.name AS source_name FROM notifications a JOIN news n ON n.id=a.news_id JOIN news_sources s ON s.id=n.source_id WHERE a.user_id=$1 ORDER BY a.created_at DESC,a.id LIMIT $2 OFFSET $3',[userId,pageSize,(page-1)*pageSize]);
    const counts=await this.db.one<{total:string;unread:string}>('SELECT count(*) AS total,count(*) FILTER(WHERE read_at IS NULL) AS unread FROM notifications WHERE user_id=$1',[userId]);
    return {items:rows.map(r=>({id:r.id,newsId:r.news_id,title:r.title,sourceName:r.source_name,reasons:r.reasons as FollowReason[],createdAt:iso(r.created_at),readAt:iso(r.read_at)})),total:Number(counts?.total??0),unreadCount:Number(counts?.unread??0),page,pageSize};
  }
  async readNotification(id:string,userId:string) {const row=await this.db.one('UPDATE notifications SET read_at=coalesce(read_at,now()) WHERE id=$1 AND user_id=$2 RETURNING id',[id,userId]);if(!row)throw notFound();return {read:true};}
  async readAllNotifications(userId:string) {
    const rows=await this.db.query('UPDATE notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL RETURNING id',[userId]);
    return {read:true,count:rows.length};
  }
  async saveGraph(newsId:string,extracted:GraphExtraction) {
    const ids=new Map<string,string>();
    for(const entity of extracted.entities){const row=await this.db.one('INSERT INTO entities(label,type) VALUES($1,$2) ON CONFLICT(label,type) DO UPDATE SET label=EXCLUDED.label RETURNING id',[entity.name,entity.type]);ids.set(entity.name,String(row!.id));}
    await this.db.query('DELETE FROM news_entities WHERE news_id=$1',[newsId]);
    for(const entityId of ids.values())await this.db.query('INSERT INTO news_entities(news_id,entity_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[newsId,entityId]);
    await this.db.query('DELETE FROM relations WHERE news_id=$1',[newsId]);
    for(const edge of extracted.relations)await this.db.query('INSERT INTO relations(source_id,target_id,label,news_id) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[ids.get(edge.source),ids.get(edge.target),edge.label,newsId]);
  }
  async graph(newsIds:string[]):Promise<Graph> {
    if(!newsIds.length)return {nodes:[],edges:[]};
    const rows=await this.db.query('SELECT r.*,a.label AS source_label,a.type AS source_type,b.label AS target_label,b.type AS target_type FROM relations r JOIN entities a ON a.id=r.source_id JOIN entities b ON b.id=r.target_id WHERE r.news_id=ANY($1::uuid[]) ORDER BY r.id',[newsIds]);
    const nodes=new Map<string,GraphNode>(),edges=new Map<string,GraphEdge>();
    const standalone=await this.db.query('SELECT e.*,array_agg(ne.news_id ORDER BY ne.news_id) AS source_ids FROM entities e JOIN news_entities ne ON ne.entity_id=e.id WHERE ne.news_id=ANY($1::uuid[]) GROUP BY e.id ORDER BY e.label,e.id',[newsIds]);
    for(const node of standalone)nodes.set(String(node.id),{id:String(node.id),label:String(node.label),type:String(node.type),sourceIds:node.source_ids as string[]});
    for(const r of rows){for(const side of ['source','target'] as const){const id=String(r[`${side}_id`]);const node=nodes.get(id)??{id,label:String(r[`${side}_label`]),type:String(r[`${side}_type`]),sourceIds:[]};if(!node.sourceIds.includes(String(r.news_id)))node.sourceIds.push(String(r.news_id));nodes.set(id,node);}const key=`${r.source_id}:${r.target_id}:${r.label}`;const edge=edges.get(key)??{id:String(r.id),source:String(r.source_id),target:String(r.target_id),label:String(r.label),sourceIds:[]};edge.sourceIds.push(String(r.news_id));edges.set(key,edge);}
    return {nodes:[...nodes.values()],edges:[...edges.values()]};
  }
  async updateHeat() {
    await this.db.query(`INSERT INTO event_heat(event_id,date,report_count,source_count,last_published_at) SELECT event_id,(published_at AT TIME ZONE 'Asia/Shanghai')::date,count(*),count(DISTINCT source_id),max(published_at) FROM news WHERE event_id IS NOT NULL AND selected AND published_at IS NOT NULL GROUP BY event_id,(published_at AT TIME ZONE 'Asia/Shanghai')::date ON CONFLICT(event_id,date) DO UPDATE SET report_count=EXCLUDED.report_count,source_count=EXCLUDED.source_count,last_published_at=EXCLUDED.last_published_at`);
    await this.db.query(`DELETE FROM event_heat h WHERE NOT EXISTS(SELECT 1 FROM news n WHERE n.event_id=h.event_id AND n.selected AND (n.published_at AT TIME ZONE 'Asia/Shanghai')::date=h.date)`);
  }
  async trends(from:string,to:string,page:number,pageSize:number,historyDays=7) {
    const rows=await this.db.query(`SELECT e.id,e.title,count(n.id)::int AS report_count,count(DISTINCT n.source_id)::int AS source_count,max(n.published_at) AS last_published_at FROM events e JOIN news n ON n.event_id=e.id WHERE n.selected AND n.published_at>=$1 AND n.published_at<=$2 GROUP BY e.id ORDER BY source_count DESC,report_count DESC,last_published_at DESC,e.id LIMIT $3 OFFSET $4`,[from,to,pageSize,(page-1)*pageSize]);
    const trendTo=businessDate(new Date(to)),trendFrom=businessDate(new Date(new Date(`${trendTo}T00:00:00+08:00`).valueOf()-(historyDays-1)*86400000));
    const history=await this.db.query(`SELECT event_id,to_char(date,'YYYY-MM-DD') AS date,report_count,source_count FROM event_heat WHERE event_id=ANY($1::uuid[]) AND date>=$2::date AND date<=$3::date ORDER BY date`,[rows.map(r=>r.id),trendFrom,trendTo]);
    const count=await this.db.one<{total:string}>('SELECT count(DISTINCT event_id) AS total FROM news WHERE selected AND published_at>=$1 AND published_at<=$2',[from,to]);
    return {items:rows.map(r=>({id:r.id,title:r.title,reportCount:r.report_count,sourceCount:r.source_count,lastPublishedAt:iso(r.last_published_at),history:history.filter(h=>h.event_id===r.id).map(h=>({date:String(h.date),reportCount:h.report_count,sourceCount:h.source_count}))})),range:{from,to},trendRange:{from:trendFrom,to:trendTo},method:'按独立信源数、报道数和最近发布时间排序；统计仅覆盖本站收录内容。',page,pageSize,total:Number(count?.total??0)};
  }
  async timeline(id:string,from?:string,to?:string) {await new NewsRepository(this.db).event(id);return {items:(await this.db.query(`${newsSelect} WHERE n.event_id=$1 AND ($2::timestamptz IS NULL OR n.published_at>=$2) AND ($3::timestamptz IS NULL OR n.published_at<=$3) ORDER BY n.published_at ASC NULLS LAST,n.id`,[id,from??null,to??null])).map(newsDto)};}
}
