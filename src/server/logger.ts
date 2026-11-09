import pino from 'pino';
export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
  redact: ['password', 'token', 'authorization', 'cookie', '*.apiKey', 'req.headers.authorization', 'req.headers.cookie'],
  base: null,
  formatters: { log: value => ({ module: 'newsclaw', ...value }) },
});
