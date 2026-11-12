import { randomUUID } from 'node:crypto';
import { Db } from '../../src/server/db.js';
import { loadConfig } from '../../src/server/config.js';
import { migrate } from '../../src/server/migrate.js';
import { ModelClient } from '../../src/server/adapters/model.js';
import { TaskService } from '../../src/server/runtime/tasks.js';
import { logger } from '../../src/server/logger.js';
import type { AppContext } from '../../src/server/context.js';

export async function createTestDb() {
  const config = loadConfig();
  const admin = new Db(config.databaseUrl, undefined, config.databasePoolMax);
  const name = `newsclaw_test_${randomUUID().replaceAll('-', '')}`;
  await admin.query(`CREATE DATABASE "${name}"`);
  const url = new URL(config.databaseUrl); url.pathname = `/${name}`;
  const db = new Db(url.href, undefined, config.databasePoolMax);
  try { await migrate(db); } catch (error) { await db.close(); await admin.query(`DROP DATABASE "${name}"`); await admin.close(); throw error; }
  return { db, config: { ...config, databaseUrl: url.href, nodeEnv: 'test' as const, queuePrefix: name }, async cleanup() {
    await db.close(); await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`); await admin.close();
  } };
}

export async function makeTestContext() {
  const env=await createTestDb();
  const model=new ModelClient(env.config),tasks=new TaskService(env.db,env.config);
  const ctx:AppContext={db:env.db,config:env.config,model,tasks,logger:logger.child({test:true},{level:'silent'})};
  return {ctx,async cleanup(){await tasks.queue.obliterate({force:true});await tasks.dead.obliterate({force:true});await tasks.close();await ctx.model.close();await env.cleanup();}};
}
