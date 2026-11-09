import type { Config } from './config.js';
import type { Db } from './db.js';
import type { ModelClient } from './adapters/model.js';
import type { TaskService } from './runtime/tasks.js';
import type { Logger } from 'pino';
export interface Actor { id: string; username: string; role: 'user' | 'admin' }
export interface AppContext { config: Config; db: Db; model: ModelClient; tasks: TaskService; logger: Logger }
declare module 'fastify' {
  interface FastifyRequest { actor: Actor | null; sessionId: string | null }
  interface FastifyContextConfig { public?: boolean; admin?: boolean; rawResponse?: boolean }
}
