import type { Db } from '../../db.js';
import { notFound } from '../../errors.js';
import type { ModelUsage } from '../../adapters/model.js';
import { businessDate, dayBounds } from '../editor/calendar.js';

export interface GenerationSettings { mode: 'manual' | 'daily' | 'updates'; startHour: number; dailyLimit: number; pausedUntil: Date | null }
const columns = 'mode,start_hour AS "startHour",daily_limit AS "dailyLimit",paused_until AS "pausedUntil"';
export class GenerationRepository {
  constructor(private db: Db) {}
  async settings(userId: string, db = this.db, lock = false) {
    const row = await db.one<GenerationSettings>(`SELECT ${columns} FROM generation_settings WHERE user_id=$1${lock ? ' FOR UPDATE' : ''}`, [userId]);
    if (!row) throw notFound();
    return row;
  }
  async update(userId: string, input: Partial<GenerationSettings> & { resume?: boolean }) {
    const row = await this.db.one<GenerationSettings>(`UPDATE generation_settings SET mode=COALESCE($2,mode),start_hour=COALESCE($3,start_hour),daily_limit=COALESCE($4,daily_limit),paused_until=CASE WHEN $5 THEN NULL ELSE paused_until END,updated_at=now() WHERE user_id=$1 RETURNING ${columns}`, [userId,input.mode,input.startHour,input.dailyLimit,input.resume??false]);
    if (!row) throw notFound();
    return row;
  }
  async usage(userId: string, date = businessDate(), db = this.db) {
    const { from,to } = dayBounds(date);
    const row = await db.one<{ automaticCalls: number; manualCalls: number; knownInputTokens: string; knownOutputTokens: string; knownTotalTokens: string; unknownCalls: number }>(`SELECT count(*) FILTER(WHERE automatic)::int AS "automaticCalls",count(*) FILTER(WHERE NOT automatic)::int AS "manualCalls",COALESCE(sum((usage->>'inputTokens')::numeric),0)::text AS "knownInputTokens",COALESCE(sum((usage->>'outputTokens')::numeric),0)::text AS "knownOutputTokens",COALESCE(sum((usage->>'totalTokens')::numeric),0)::text AS "knownTotalTokens",count(*) FILTER(WHERE usage->>'totalTokens' IS NULL)::int AS "unknownCalls" FROM generation_usage WHERE user_id=$1 AND started_at >= $2 AND started_at < $3`, [userId,from,to]);
    return { ...row!, date, knownInputTokens:Number(row!.knownInputTokens),knownOutputTokens:Number(row!.knownOutputTokens),knownTotalTokens:Number(row!.knownTotalTokens) };
  }
  async reserve(userId: string, taskId: string, executionId: string, automatic: boolean, now = new Date()) {
    return this.db.tx(async tx => {
      const settings = await this.settings(userId,tx,true);
      if (await tx.one('SELECT id FROM generation_usage WHERE id=$1',[executionId])) return '本次执行已记录，不重复生成';
      if (automatic) {
        if (settings.mode === 'manual') return '自动生成已关闭';
        if (settings.pausedUntil && settings.pausedUntil > now) return '上游额度暂不可用，自动生成已暂停';
        if ((await this.usage(userId,businessDate(now),tx)).automaticCalls >= settings.dailyLimit) return '已达到今天的自动生成次数上限';
      }
      await tx.query('INSERT INTO generation_usage(id,task_id,user_id,automatic,started_at) VALUES($1,$2,$3,$4,$5)',[executionId,taskId,userId,automatic,now]);
      return null;
    });
  }
  async finish(executionId: string, usage: ModelUsage) {
    const count = (value: number | null) => Number.isSafeInteger(value) && value! >= 0 ? value : null;
    await this.db.query('UPDATE generation_usage SET usage=$2 WHERE id=$1',[executionId,JSON.stringify({inputTokens:count(usage.inputTokens),outputTokens:count(usage.outputTokens),totalTokens:count(usage.totalTokens)})]);
  }
  async pause(userId: string, now = new Date()) {
    await this.db.query('UPDATE generation_settings SET paused_until=$2,updated_at=now() WHERE user_id=$1',[userId,dayBounds(businessDate(now)).to]);
  }
  async eligible(hour: number, now: Date) {
    return this.db.query<GenerationSettings & { id: string }>(`SELECT user_id AS id,${columns} FROM generation_settings WHERE mode<>'manual' AND start_hour<=$1 AND (paused_until IS NULL OR paused_until<=$2) ORDER BY user_id`,[hour,now]);
  }
  async generated(userId: string, kind: 'daily' | 'journal', date: string) {
    const { from,to } = dayBounds(date);
    return Boolean(await this.db.one(`SELECT g.id FROM generation_usage g JOIN tasks t ON t.id=g.task_id WHERE g.user_id=$1 AND g.automatic AND g.started_at >= $2 AND g.started_at < $3 AND t.type=$4 AND t.status='succeeded' AND NOT COALESCE((t.result->>'skipped')::boolean,false) LIMIT 1`,[userId,from,to,kind]));
  }
}
