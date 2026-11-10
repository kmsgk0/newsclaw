import type { Db } from '../../db.js';
import { AppError, notFound } from '../../errors.js';
import type { ModelUsage } from '../../adapters/model.js';
import type { MaterialScope, NewsItem } from '../news/types.js';
import type { MindmapNode } from '../topics/validation.js';
import { businessDate, dayBounds } from './calendar.js';

export interface EditorProfile { userId: string; name: string; avatar: string; style: string; interests: string; activityCursor: string; memoryRevision: string }
export interface Citation { id: string; label: string; title: string; url: string; sourceName: string }
export interface Artifact { title: string; kind: 'brief' | 'comparison' | 'mindmap'; content: string; structure?: MindmapNode; skillId?: string; sourceIds: string[]; messageId?: string; sourceSnapshots?: (NewsItem & { label: string })[] }
export interface Conversation { id: string; title: string; context: MaterialScope | null; createdAt: Date; updatedAt: Date }
export interface MessageRequest { content: string; skillId?: string; context?: MaterialScope }
export interface MessageFailure { status: number; code: string; message: string; requestId?: string }
export interface Message { id: string; role: 'user' | 'assistant'; content: string; status: 'pending' | 'completed' | 'failed'; sources: Citation[]; skillId: string | null; skillName: string | null; request: MessageRequest | null; questionId: string | null; artifact: Artifact | null; error: MessageFailure | null; createdAt: Date }
export interface Memory { id: string; key: string; content: string; origin: 'manual' | 'automatic'; updatedAt: Date }
export interface Activity { id: string; kind: string; newsId: string | null; conversationId: string | null; data: Record<string, unknown> }
export function mergeJournalSources(previous: { content: string; sources: Citation[] } | undefined, content: string, sources: Citation[]) {
  const merged = new Map<string, Citation>((previous?.sources ?? []).map(source => [source.id, source]));
  let nextLabel = Math.max(0, ...[...merged.values()].map(source => Number(source.label.slice(1))));
  const labels = new Map<string, string>();
  for (const source of sources) {
    let saved = merged.get(source.id);
    if (!saved) { saved = { ...source, label: `N${++nextLabel}` }; merged.set(source.id, saved); }
    labels.set(source.label, saved.label);
  }
  const adjusted = content.replace(/\bN(\d+)\b|\[(\d+)\]/g, (token, named: string | undefined, numeric: string | undefined) => {
    const label = labels.get(`N${named ?? numeric}`);
    return label ? numeric ? `[${label}]` : label : token;
  });
  return { content: previous ? `${previous.content}\n\n${adjusted}` : adjusted, sources: [...merged.values()] };
}
const profileColumns = `user_id AS "userId",name,avatar,style,interests,activity_cursor::text AS "activityCursor",memory_revision::text AS "memoryRevision"`;
const conversationColumns = `id,title,context,created_at AS "createdAt",updated_at AS "updatedAt"`;
const messageColumns = `id,role,content,status,sources,skill_id AS "skillId",skill_name AS "skillName",request,question_id AS "questionId",artifact,error,created_at AS "createdAt"`;
const memoryColumns = `id,key,content,origin,updated_at AS "updatedAt"`;
export class EditorRepository {
  constructor(private db: Db) {}
  profile(userId: string, lock = false) { return this.db.one<EditorProfile>(`SELECT ${profileColumns} FROM editors WHERE user_id=$1${lock ? ' FOR UPDATE' : ''}`, [userId]); }
  async updateProfile(userId: string, update: Partial<Pick<EditorProfile, 'name' | 'avatar' | 'style' | 'interests'>>) {
    return this.db.one<EditorProfile>(`UPDATE editors SET name=COALESCE($2,name),avatar=COALESCE($3,avatar),style=COALESCE($4,style),interests=COALESCE($5,interests),memory_revision=memory_revision+1 WHERE user_id=$1 RETURNING ${profileColumns}`, [userId, update.name, update.avatar, update.style, update.interests]);
  }
  conversations(userId: string) { return this.db.query<Conversation>(`SELECT ${conversationColumns} FROM conversations WHERE user_id=$1 ORDER BY updated_at DESC,id`, [userId]); }
  conversation(userId: string, id: string) { return this.db.one<Conversation>(`SELECT ${conversationColumns} FROM conversations WHERE id=$1 AND user_id=$2`, [id, userId]); }
  createConversation(userId: string, title: string, context?: MaterialScope) { return this.db.one<Conversation>(`INSERT INTO conversations(user_id,title,context) VALUES($1,$2,$3) RETURNING ${conversationColumns}`, [userId, title, context ? JSON.stringify(context) : null]); }
  async renameConversation(userId: string, id: string, title: string) {
    const saved = await this.db.one<Conversation>(`UPDATE conversations SET title=$3,updated_at=now() WHERE id=$1 AND user_id=$2 RETURNING ${conversationColumns}`, [id,userId,title]);
    if (!saved) throw notFound();
    return saved;
  }
  async removeConversation(userId: string, id: string) {
    return this.db.tx(async tx => {
      if (!await tx.one('SELECT id FROM conversations WHERE id=$1 AND user_id=$2 FOR UPDATE', [id,userId])) throw notFound();
      if (await tx.one("SELECT id FROM messages WHERE conversation_id=$1 AND status='pending'", [id])) throw new AppError(409,'CONFLICT','请先停止正在生成的回答，再删除会话');
      await tx.query('DELETE FROM conversations WHERE id=$1 AND user_id=$2', [id,userId]);
      return { deleted: true };
    });
  }
  async failInterruptedAnswers() {
    return this.db.query("UPDATE messages SET status='failed',error=$1,finished_at=now() WHERE role='assistant' AND status='pending' RETURNING id", [JSON.stringify({ status:503, code:'DEPENDENCY_UNAVAILABLE', message:'服务重启，本次回答已中断，请重试' })]);
  }
  messages(conversationId: string) { return this.db.query<Message>(`SELECT ${messageColumns} FROM messages WHERE conversation_id=$1 ORDER BY created_at,id`, [conversationId]); }
  async begin(userId: string, id: string, question: string, skillId?: string, context?: MaterialScope, retryMessageId?: string, skillName?: string) {
    return this.db.tx(async tx => {
      const conversation = await tx.one(`SELECT id FROM conversations WHERE id=$1 AND user_id=$2 FOR UPDATE`, [id, userId]);
      if (!conversation) throw notFound();
      if (await tx.one(`SELECT id FROM messages WHERE conversation_id=$1 AND status='pending'`, [id])) throw new AppError(409, 'CONFLICT', '当前会话还有回答正在生成');
      const request = JSON.stringify({ content: question, ...(skillId ? { skillId } : {}), ...(context ? { context } : {}) });
      let answer: { id: string } | undefined;
      if (retryMessageId) {
        answer = await tx.one<{ id: string }>(`UPDATE messages SET status='pending',content='',sources='[]',artifact=NULL,usage=NULL,error=NULL,finished_at=NULL,skill_id=$3,skill_name=$4,request=$5 WHERE id=$1 AND conversation_id=$2 AND role='assistant' AND status='failed' RETURNING id`, [retryMessageId,id,skillId,skillName,request]);
        if (!answer) throw new AppError(409,'CONFLICT','这条回答已不是未完成状态，请重新打开会话');
      } else {
        const user = await tx.one<{id:string}>(`INSERT INTO messages(conversation_id,role,content,status) VALUES($1,'user',$2,'completed') RETURNING id`, [id, question]);
        answer = await tx.one<{ id: string }>(`INSERT INTO messages(conversation_id,role,status,skill_id,skill_name,request,question_id,created_at) VALUES($1,'assistant','pending',$2,$3,$4,$5,clock_timestamp()) RETURNING id`, [id,skillId,skillName,request,user!.id]);
      }
      await tx.query(`UPDATE conversations SET updated_at=now(),context=COALESCE($3,context) WHERE id=$1 AND user_id=$2`, [id, userId, context ? JSON.stringify(context) : null]);
      return answer!.id;
    });
  }
  async finish(userId: string, conversationId: string, messageId: string, result: { content: string; status: 'completed' | 'failed'; sources: Citation[]; artifact?: Artifact | null; usage?: ModelUsage; error?: MessageFailure }) {
    return this.db.tx(async tx => {
      if (!await tx.one(`SELECT id FROM conversations WHERE id=$1 AND user_id=$2`, [conversationId, userId])) throw notFound();
      const saved = await tx.one(`UPDATE messages SET content=$3,status=$4,sources=$5,artifact=$6,usage=$7,error=$8,finished_at=now() WHERE id=$1 AND conversation_id=$2 AND status='pending' RETURNING id`, [messageId, conversationId, result.content, result.status, JSON.stringify(result.sources), result.artifact ? JSON.stringify(result.artifact) : null, result.usage ? JSON.stringify(result.usage) : null, result.status === 'failed' && result.error ? JSON.stringify(result.error) : null]);
      if (!saved) throw new AppError(409,'CONFLICT','回答状态已改变，请重新打开会话');
      if (result.status === 'completed') await tx.query(`INSERT INTO activities(user_id,kind,conversation_id,data) VALUES($1,'question',$2,$3)`, [userId, conversationId, JSON.stringify({ messageId, sourceIds: result.sources.map(source => source.id) })]);
    });
  }
  memories(userId: string) { return this.db.query<Memory>(`SELECT ${memoryColumns} FROM memories WHERE user_id=$1 AND deleted_at IS NULL ORDER BY origin DESC,updated_at DESC,id`, [userId]); }
  memory(userId: string, id: string) { return this.db.one<Memory>(`SELECT ${memoryColumns} FROM memories WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL`, [id,userId]); }
  async writeMemory(userId: string, key: string, content: string) {
    return this.db.tx(async tx => {
      await tx.query(`UPDATE editors SET memory_revision=memory_revision+1 WHERE user_id=$1`, [userId]);
      return tx.one<Memory>(`INSERT INTO memories(user_id,key,content,origin) VALUES($1,$2,$3,'manual') ON CONFLICT(user_id,key) DO UPDATE SET content=EXCLUDED.content,origin='manual',deleted_at=NULL,updated_at=now() RETURNING ${memoryColumns}`, [userId, key, content]);
    });
  }
  async editMemory(userId: string, id: string, content?: string) {
    return this.db.tx(async tx => {
      await tx.query(`UPDATE editors SET memory_revision=memory_revision+1 WHERE user_id=$1`, [userId]);
      const result = content === undefined
        ? await tx.one(`UPDATE memories SET deleted_at=now(),origin='manual',updated_at=now() WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL RETURNING id`, [id, userId])
        : await tx.one<Memory>(`UPDATE memories SET content=$3,origin='manual',updated_at=now() WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL RETURNING ${memoryColumns}`, [id, userId, content]);
      if (!result) throw notFound();
      return result;
    });
  }
  digests(userId: string) { return this.db.query(`SELECT id,to_char(date,'YYYY-MM-DD') AS date,content,sources,generated_at AS "generatedAt" FROM personal_digests WHERE user_id=$1 ORDER BY date DESC`, [userId]); }
  journals(userId: string) { return this.db.query(`SELECT id,to_char(date,'YYYY-MM-DD') AS date,content,sources,generated_at AS "generatedAt" FROM journals WHERE user_id=$1 ORDER BY date DESC`, [userId]); }
  async readingHistory(userId: string, kind: 'daily' | 'journal', selectedDate?: string) {
    const items = kind === 'daily' ? await this.digests(userId) : await this.journals(userId);
    const date = selectedDate ?? businessDate();
    const latestTask = await this.db.one<{ taskId: string; status: string; result: Record<string,unknown> | null; error: unknown; createdAt: Date }>(`SELECT id AS "taskId",status,result,error,created_at AS "createdAt" FROM tasks WHERE owner_id=$1 AND type=$2 AND input->>'date'=$3 ORDER BY created_at DESC,id DESC LIMIT 1`, [userId,kind,date]);
    const hasContent = items.some(item => item.date === date);
    const status = latestTask && ['pending','running','failed'].includes(latestTask.status) ? latestTask.status
      : hasContent ? 'ready' : latestTask?.result?.status === 'empty' || latestTask?.result?.skipped ? 'empty' : 'idle';
    return { items: selectedDate ? items.filter(item => item.date === date) : items, availableDates: items.map(item => item.date), latestDate: items[0]?.date ?? null, date, status, latestTask: latestTask ? { ...latestTask, statusUrl: `/api/v1/tasks/${latestTask.taskId}` } : null };
  }
  activities(userId: string, cursor: string, end?: string) { return this.db.query<Activity>(`SELECT id::text,kind,news_id AS "newsId",conversation_id AS "conversationId",data FROM activities WHERE user_id=$1 AND id>$2 AND ($3::bigint IS NULL OR id<=$3) ORDER BY id`, [userId, cursor, end]); }
  activityEnd(userId: string) { return this.db.one<{ end: string }>(`SELECT COALESCE(max(id),0)::text AS end FROM activities WHERE user_id=$1`, [userId]); }
  dailyNews(date: string) {
    const { from, to } = dayBounds(date);
    return this.db.query<{ id: string }>(`SELECT id FROM news WHERE selected=true AND COALESCE(published_at,created_at)>=$1::timestamptz AND COALESCE(published_at,created_at)<$2::timestamptz ORDER BY published_at DESC NULLS LAST,id LIMIT 40`, [from,to]);
  }
  async questionActivities(userId: string, messageIds: string[]) {
    if (!messageIds.length) return [];
    return this.db.query(`SELECT m.content,m.sources,(SELECT q.content FROM messages q WHERE q.conversation_id=m.conversation_id AND q.role='user' AND q.created_at<=m.created_at ORDER BY q.created_at DESC,q.id LIMIT 1) AS question FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.user_id=$1 AND m.id=ANY($2::uuid[]) AND m.status='completed' ORDER BY m.created_at,m.id`, [userId, messageIds]);
  }
  async saveDigest(userId: string, date: string, content: string, sources: Citation[], generationTime: string | Date, taskId: string) {
    if (!await this.profile(userId)) throw notFound();
    const saved = await this.db.one<{ id: string }>(`INSERT INTO personal_digests(user_id,date,content,sources,generation_time,task_id) VALUES($1,$2,$3,$4,COALESCE((SELECT created_at FROM tasks WHERE id=$6),$5::timestamptz),$6)
      ON CONFLICT(user_id,date) DO UPDATE SET content=EXCLUDED.content,sources=EXCLUDED.sources,generation_time=EXCLUDED.generation_time,task_id=EXCLUDED.task_id,generated_at=now()
      WHERE personal_digests.generation_time<=EXCLUDED.generation_time RETURNING id`, [userId, date, content, JSON.stringify(sources), generationTime, taskId]);
    return saved ?? this.db.one<{ id: string }>(`SELECT id FROM personal_digests WHERE user_id=$1 AND date=$2`, [userId, date]);
  }
  async saveJournal(userId: string, date: string, start: string, end: string, memoryRevision: string, content: string, sources: Citation[], memories: { key: string; content: string }[]) {
    const profile = await this.profile(userId, true);
    if (!profile) throw notFound();
    if (BigInt(profile.activityCursor) >= BigInt(end)) return { skipped: true };
    if (profile.activityCursor !== start || profile.memoryRevision !== memoryRevision) throw new AppError(409, 'CONFLICT', '阅读活动或明确偏好已更新，请重新整理');
    const previous = await this.db.one<{ content: string; sources: Citation[] }>(`SELECT content,sources FROM journals WHERE user_id=$1 AND date=$2`, [userId,date]);
    const merged = mergeJournalSources(previous,content,sources);
    const journal = await this.db.one<{ id: string }>(`INSERT INTO journals(user_id,date,content,sources,activity_end) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(user_id,date) DO UPDATE SET content=EXCLUDED.content,sources=EXCLUDED.sources,activity_end=EXCLUDED.activity_end,generated_at=now() RETURNING id`, [userId, date, merged.content, JSON.stringify(merged.sources), end]);
    for (const memory of memories) await this.db.query(`INSERT INTO memories(user_id,key,content,origin) VALUES($1,$2,$3,'automatic') ON CONFLICT(user_id,key) DO UPDATE SET content=EXCLUDED.content,updated_at=now() WHERE memories.origin='automatic' AND memories.deleted_at IS NULL`, [userId, memory.key, memory.content]);
    await this.db.query(`UPDATE editors SET activity_cursor=$2 WHERE user_id=$1`, [userId, end]);
    return { id: journal!.id };
  }
}
