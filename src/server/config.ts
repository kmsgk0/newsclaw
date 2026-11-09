import 'dotenv/config';
import { z } from 'zod';

const url = z.string().url();
const schema = z.object({
  DATABASE_URL: url.regex(/^postgres(?:ql)?:/), REDIS_URL: url.regex(/^rediss?:/),
  CHAT_BASE_URL: url, CHAT_API_KEY: z.string().min(1), CHAT_MODEL: z.string().min(1),
  EMBEDDING_BASE_URL: url, EMBEDDING_API_KEY: z.string().min(1), EMBEDDING_MODEL: z.string().min(1),
  EMBEDDING_DIM: z.coerce.number().int().positive().default(1024),
  PORT: z.coerce.number().int().min(1).max(65535).default(3100), HOST: z.string().default('127.0.0.1'),
  APP_ORIGIN: url.default('http://localhost:3100'), COOKIE_SECURE: z.enum(['true', 'false']).default('true'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_VERSION: z.string().default('local'), QUEUE_PREFIX: z.string().regex(/^[a-zA-Z0-9_-]+$/).default('newsclaw'),
  MODEL_TIMEOUT_MS: z.coerce.number().int().positive().default(120000),
  TASK_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
  TASK_BACKOFF_MS: z.coerce.number().int().min(10).default(2000),
  SOURCE_ALLOWED_HOSTS: z.string().default(''),
});
export function loadConfig(env: Record<string, string | undefined> = process.env) {
  const result = schema.safeParse(env);
  if (!result.success) throw new Error(`Invalid configuration: ${[...new Set(result.error.issues.map(i => i.path.join('.')))].join(', ')}`);
  const e = result.data;
  if (e.NODE_ENV === 'production' && e.COOKIE_SECURE !== 'true') throw new Error('COOKIE_SECURE must be true in production');
  return {
    databaseUrl: e.DATABASE_URL, redisUrl: e.REDIS_URL, chatBaseUrl: e.CHAT_BASE_URL, chatApiKey: e.CHAT_API_KEY, chatModel: e.CHAT_MODEL,
    embeddingBaseUrl: e.EMBEDDING_BASE_URL, embeddingApiKey: e.EMBEDDING_API_KEY, embeddingModel: e.EMBEDDING_MODEL, embeddingDim: e.EMBEDDING_DIM,
    port: e.PORT, host: e.HOST, appOrigin: e.APP_ORIGIN, secureCookies: e.COOKIE_SECURE === 'true', nodeEnv: e.NODE_ENV,
    version: e.APP_VERSION, queuePrefix: e.QUEUE_PREFIX, modelTimeoutMs: e.MODEL_TIMEOUT_MS, taskAttempts: e.TASK_ATTEMPTS,
    taskBackoffMs: e.TASK_BACKOFF_MS, allowedSourceHosts: e.SOURCE_ALLOWED_HOSTS.split(',').map(x => x.trim()).filter(Boolean),
  };
}
export type Config = ReturnType<typeof loadConfig>;
