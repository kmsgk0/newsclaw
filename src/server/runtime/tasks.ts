import { randomUUID } from 'node:crypto';
import { Queue, Worker, UnrecoverableError, type Job } from 'bullmq';
import { z } from 'zod';
import type { Actor } from '../context.js';
import type { Config } from '../config.js';
import type { Db } from '../db.js';
import { AppError, forbidden, notFound } from '../errors.js';
import { logger } from '../logger.js';
export type TaskType = 'collect' | 'daily' | 'journal' | 'notify';
export interface TaskRecord {
  id: string;
  type: TaskType;
  actor_id: string | null;
  owner_id: string | null;
  input: Record<string, unknown>;
  operation_id: string;
  status: 'pending' | 'running' | 'succeeded' | 'failed';
  generation: number;
  execution_id: string | null;
  attempts: number;
  round_attempts: number;
  result: Record<string, unknown> | null;
  error: {
    code: string;
    message: string;
  } | null;
  created_at: Date;
  updated_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
}
export interface TaskRun {
  executionId: string;
  signal: AbortSignal;
  attempt: number;
}
export type TaskHandler = (task: TaskRecord, run: TaskRun) => Promise<{
  commit: (tx: Db) => Promise<Record<string, unknown>>;
}>;
export type TaskHandlers = Partial<Record<TaskType, TaskHandler>>;
export function redisOptions(url: string) {
  const u = new URL(url);
  return { host: u.hostname, port: Number(u.port || 6379), username: u.username ? decodeURIComponent(u.username) : undefined, password: u.password ? decodeURIComponent(u.password) : undefined, db: Number(u.pathname.slice(1) || 0), ...(u.protocol === 'rediss:' ? { tls: {} } : {}), maxRetriesPerRequest: null };
}
const identitySchema = z.string().trim().min(1).max(160);
const uuid = z.string().uuid();
const messageId = (task: Pick<TaskRecord, 'id' | 'generation'>) => `${task.id}-${task.generation}`;
function publicTask(task: TaskRecord) {
  return { taskId: task.id, type: task.type, status: task.status, statusUrl: `/api/v1/tasks/${task.id}`, attempts: task.attempts, generation: task.generation, result: task.result, error: task.error, createdAt: task.created_at, startedAt: task.started_at, finishedAt: task.finished_at };
}
function errorData(error: unknown) {
  return error instanceof AppError ? { code: error.code, message: error.message } : { code: 'DEPENDENCY_UNAVAILABLE', message: '任务处理暂不可用，请重试' };
}
export class TaskService {
  readonly queue: Queue;
  readonly dead: Queue;
  constructor(readonly db: Db, readonly config: Config) {
    const options = { connection: redisOptions(config.redisUrl), prefix: config.queuePrefix };
    this.queue = new Queue('work', options);
    this.dead = new Queue('dead', options);
    for (const queue of [this.queue, this.dead])
      queue.on('error', () => logger.warn({ module: 'queue', result: 'unavailable' }, 'Queue connection unavailable'));
  }
  async submit(actor: Actor | null, type: TaskType, input: Record<string, unknown>, operationId: string, ownerId: string | null = null, tx: Db = this.db, requestInput: Record<string, unknown> = input) {
    identitySchema.parse(operationId);
    if (actor && ownerId && actor.id !== ownerId)
      throw notFound();
    if (actor && !ownerId && actor.role !== 'admin')
      throw forbidden();
    const scope = actor ? `actor:${actor.id}` : `system:${ownerId ?? 'public'}`;
    const task = await tx.tx(async (db) => {
      const inserted = await db.one<TaskRecord>(`INSERT INTO tasks(type,actor_id,owner_id,operation_scope,operation_id,input,request_input) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(operation_scope,type,operation_id) DO NOTHING RETURNING *`, [type, actor?.id ?? null, ownerId, scope, operationId, JSON.stringify(input), JSON.stringify(requestInput)]);
      if (!inserted) {
        const found = await db.one<TaskRecord & {
          same: boolean;
        }>(`SELECT *,request_input=$4::jsonb AS same FROM tasks WHERE operation_scope=$1 AND type=$2 AND operation_id=$3`, [scope, type, operationId, JSON.stringify(requestInput)]);
        if (!found?.same || found.owner_id !== ownerId)
          throw new AppError(409, 'CONFLICT', '同一操作标识对应的参数不同');
        return found;
      }
      await db.query("INSERT INTO task_outbox(task_id,generation,kind) VALUES($1,$2,'business')", [inserted.id, inserted.generation]);
      return inserted;
    });
    return { ...publicTask(task), id: task.id };
  }
  async get(actor: Actor, id: string) {
    uuid.parse(id);
    const task = await this.db.one<TaskRecord>('SELECT * FROM tasks WHERE id=$1 AND (owner_id=$2 OR (owner_id IS NULL AND $3))', [id, actor.id, actor.role === 'admin']);
    if (!task)
      throw notFound();
    return publicTask(task);
  }
  async listPublic() {
    const rows = await this.db.query<TaskRecord>('SELECT * FROM tasks WHERE owner_id IS NULL ORDER BY created_at DESC,id DESC LIMIT 100');
    const counts = await this.queue.getJobCounts('waiting', 'active', 'delayed', 'failed');
    return { items: rows.map(publicTask), queue: counts, dead: await this.dead.getWaitingCount() };
  }
  async replay(actor: Actor, id: string, operationId: string) {
    if (actor.role !== 'admin')
      throw forbidden();
    uuid.parse(id);
    identitySchema.parse(operationId);
    return this.db.tx(async (tx) => {
      const task = await tx.one<TaskRecord>('SELECT * FROM tasks WHERE id=$1 AND owner_id IS NULL FOR UPDATE', [id]);
      if (!task)
        throw notFound();
      const prior = await tx.one('SELECT generation FROM task_replays WHERE task_id=$1 AND operation_id=$2', [id, operationId]);
      if (prior)
        return publicTask(task);
      if (task.status !== 'failed')
        throw new AppError(409, 'CONFLICT', '仅失败任务可以重新执行');
      const updated = await tx.one<TaskRecord>(`UPDATE tasks SET generation=generation+1,status='pending',round_attempts=0,execution_id=NULL,error=NULL,finished_at=NULL,actor_id=$2,updated_at=now() WHERE id=$1 RETURNING *`, [id, actor.id]);
      await tx.query('INSERT INTO task_replays(task_id,operation_id,generation) VALUES($1,$2,$3)', [id, operationId, updated!.generation]);
      await tx.query("INSERT INTO task_outbox(task_id,generation,kind) VALUES($1,$2,'business')", [id, updated!.generation]);
      await tx.query("INSERT INTO management_actions(actor_id,action,object_id,result) VALUES($1,'task.replay',$2,'accepted')", [actor.id, id]);
      return publicTask(updated!);
    });
  }
  async dispatch() {
    const records = await this.db.query<{
      id: string;
      task_id: string;
      generation: number;
      kind: string;
    }>(`SELECT o.* FROM task_outbox o JOIN tasks t ON t.id=o.task_id WHERE o.delivered_at IS NULL ORDER BY o.id LIMIT 50`);
    for (const row of records) {
      const queue = row.kind === 'dead' ? this.dead : this.queue;
      await queue.add(row.kind, { taskId: row.task_id, generation: row.generation }, { jobId: `${row.task_id}-${row.generation}`, attempts: this.config.taskAttempts, backoff: { type: 'exponential', delay: this.config.taskBackoffMs, jitter: 0.3 } });
      await this.db.query('UPDATE task_outbox SET delivered_at=now() WHERE id=$1', [row.id]);
    }
    return records.length;
  }
  private async authorizeTask(task: TaskRecord, db: Db) {
    if (task.owner_id) {
      if (!await db.one('SELECT id FROM users WHERE id=$1', [task.owner_id]))
        throw notFound();
      if (task.actor_id && task.actor_id !== task.owner_id)
        throw notFound();
    }
    else if (task.actor_id) {
      if (!await db.one("SELECT id FROM users WHERE id=$1 AND role='admin'", [task.actor_id]))
        throw forbidden();
    }
  }
  private async fail(task: TaskRecord, error: unknown, terminal: boolean) {
    const detail = errorData(error);
    await this.db.tx(async (tx) => {
      const changed = await tx.one<TaskRecord>(`UPDATE tasks SET status=$4,error=$5,finished_at=CASE WHEN $4='failed' THEN now() ELSE NULL END,updated_at=now() WHERE id=$1 AND generation=$2 AND execution_id=$3 AND status='running' RETURNING *`, [task.id, task.generation, task.execution_id, terminal ? 'failed' : 'pending', JSON.stringify(detail)]);
      if (!changed)
        return;
      await tx.query('UPDATE task_attempts SET finished_at=now(),outcome=$2,error=$3 WHERE id=$1', [task.execution_id, terminal ? 'failed' : 'retry', JSON.stringify(detail)]);
      if (terminal)
        await tx.query("INSERT INTO task_outbox(task_id,generation,kind) VALUES($1,$2,'dead') ON CONFLICT DO NOTHING", [task.id, task.generation]);
    });
  }
  async execute(data: {
    taskId: string;
    generation: number;
  }, handlers: TaskHandlers, signal?: AbortSignal) {
    const executionId = randomUUID();
    const task = await this.db.tx(async (tx) => {
      const current = await tx.one<TaskRecord>('SELECT * FROM tasks WHERE id=$1 FOR UPDATE', [data.taskId]);
      if (!current || current.generation !== data.generation || ['succeeded', 'failed'].includes(current.status))
        return null;
      const claimed = await tx.one<TaskRecord>(`UPDATE tasks SET status='running',execution_id=$2,attempts=attempts+1,round_attempts=round_attempts+1,started_at=now(),updated_at=now() WHERE id=$1 RETURNING *`, [current.id, executionId]);
      await tx.query('INSERT INTO task_attempts(id,task_id,generation,attempt) VALUES($1,$2,$3,$4)', [executionId, current.id, current.generation, claimed!.attempts]);
      return claimed!;
    });
    if (!task)
      return { skipped: true };
    const started = Date.now();
    try {
      if (task.round_attempts > this.config.taskAttempts)
        throw new AppError(409, 'CONFLICT', '任务已达到重试次数上限');
      await this.authorizeTask(task, this.db);
      const abort = signal ?? AbortSignal.timeout(this.config.modelTimeoutMs * 4);
      const handler = handlers[task.type];
      if (!handler) throw new AppError(400, 'INVALID_INPUT', '当前版本不支持此任务类型');
      const result = await handler(task, { executionId, signal: abort, attempt: task.attempts });
      abort.throwIfAborted();
      const saved = await this.db.tx(async (tx) => {
        const current = await tx.one<TaskRecord>(`SELECT * FROM tasks WHERE id=$1 AND generation=$2 AND execution_id=$3 AND status='running' FOR UPDATE`, [task.id, task.generation, executionId]);
        if (!current) {
          await tx.query("UPDATE task_attempts SET finished_at=now(),outcome='superseded' WHERE id=$1", [executionId]);
          return { superseded: true };
        }
        await this.authorizeTask(current, tx);
        const value = await result.commit(tx);
        await tx.query("UPDATE tasks SET status='succeeded',result=$2,error=NULL,finished_at=now(),updated_at=now() WHERE id=$1", [task.id, JSON.stringify(value)]);
        await tx.query("UPDATE task_attempts SET finished_at=now(),outcome='succeeded' WHERE id=$1", [executionId]);
        return value;
      });
      logger.info({ taskId: task.id, actorId: task.actor_id ?? 'system', ownerId: task.owner_id, attempt: task.attempts, durationMs: Date.now() - started, result: saved.superseded ? 'superseded' : 'succeeded' }, 'Task completed');
      return saved;
    }
    catch (error) {
      const terminal = task.round_attempts >= this.config.taskAttempts || (error as {
        retryable?: boolean;
      })?.retryable === false || (error instanceof AppError && error.status < 500);
      await this.fail(task, error, terminal);
      logger.warn({ taskId: task.id, attempt: task.attempts, durationMs: Date.now() - started, result: terminal ? 'failed' : 'retry', code: errorData(error).code }, 'Task attempt failed');
      if (terminal)
        throw new UnrecoverableError(errorData(error).message);
      throw new Error(errorData(error).message);
    }
  }
  async recover() {
    const tasks = await this.db.query<TaskRecord>("SELECT * FROM tasks WHERE status IN ('pending','running')");
    for (const task of tasks) {
      const job = await this.queue.getJob(messageId(task));
      const state = job ? await job.getState() : 'unknown';
      if (state === 'failed') {
        const execution = task.execution_id ?? randomUUID();
        await this.db.query("UPDATE tasks SET execution_id=$2,status='running' WHERE id=$1 AND generation=$3 AND status IN ('pending','running')", [task.id, execution, task.generation]);
        await this.fail({ ...task, execution_id: execution }, new AppError(503, 'DEPENDENCY_UNAVAILABLE', '队列执行中断，自动恢复次数已耗尽'), true);
      }
      else if (state === 'unknown' || state === 'completed') {
        if (job && state === 'completed')
          await job.remove();
        await this.db.query("INSERT INTO task_outbox(task_id,generation,kind) VALUES($1,$2,'business') ON CONFLICT(task_id,generation,kind) DO UPDATE SET delivered_at=NULL", [task.id, task.generation]);
      }
    }
  }
  start(handlers: TaskHandlers, options: {
    schedule?: () => Promise<void>;
    intervalMs?: number;
    lockDuration?: number;
  } = {}) {
    let stopped = false, pending: Promise<void> | null = null;
    const worker = new Worker('work', async (job: Job) => {
      if (job.name === 'schedule') {
        await options.schedule?.();
        return { scheduled: true };
      }
      return this.execute(job.data, handlers);
    }, { connection: redisOptions(this.config.redisUrl), prefix: this.config.queuePrefix, concurrency: 1, lockDuration: options.lockDuration ?? 30000, stalledInterval: options.lockDuration ?? 30000, maxStalledCount: this.config.taskAttempts });
    worker.on('error', () => logger.warn({ module: 'worker', result: 'unavailable' }, 'Worker connection unavailable'));
    const tick = () => {
      if (pending || stopped)
        return;
      pending = (async () => { try {
        await this.recover();
        await this.dispatch();
      }
      catch (error) {
        logger.warn({ module: 'outbox', code: errorData(error).code }, 'Pending delivery will resume');
      } })().finally(() => { pending = null; });
    };
    const timer = setInterval(tick, options.intervalMs ?? 1000);
    timer.unref();
    tick();
    return { worker, close: async () => { stopped = true; clearInterval(timer); await pending; await worker.close(); } };
  }
  async close() { await Promise.all([this.queue.close(), this.dead.close()]); }
}
