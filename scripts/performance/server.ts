import { writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createAPIEnvironment } from '../../apitest/fixtures/environment.js';

const env = await createAPIEnvironment({port: 3107});
await env.ctx.db.query(`INSERT INTO news(source_id,url,title,published_at,content,content_scope,content_hash,summary)
  SELECT $1,'https://example.org/benchmark/'||i,'benchmark article '||i,now()-(i||' seconds')::interval,
  'synthetic benchmark content '||i,'full','benchmark-'||i,'synthetic benchmark' FROM generate_series(1,5000) AS i`, [env.source.id]);
await env.ctx.db.query('ANALYZE news');
const plan = await env.ctx.db.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT n.id FROM news n
  WHERE n.selected AND (n.search_document @@ plainto_tsquery('simple',$1) OR n.title ILIKE '%'||$1||'%' OR n.content ILIKE '%'||$1||'%' OR n.summary ILIKE '%'||$1||'%' OR n.translation ILIKE '%'||$1||'%')
  ORDER BY ts_rank(n.search_document,plainto_tsquery('simple',$1)) DESC,n.published_at DESC NULLS LAST,n.id LIMIT 20`, ['benchmark']);
await writeFile('/reports/performance-plan.json', JSON.stringify(plan, null, 2));
const login = await env.auth.login({ username: env.admin.username, password: 'correct-password' });
const task = await env.ctx.tasks.submit(env.admin, 'collect', { sourceId: env.source.id }, randomUUID());
await writeFile('/reports/performance-fixture.json', JSON.stringify({ token: login.accessToken, sourceId: env.source.id, taskId: task.taskId }), {mode: 0o600});
console.log('synthetic benchmark API ready');
for (const signal of ['SIGINT','SIGTERM'] as const) process.on(signal, () => { void env.cleanup().finally(() => process.exit()); });
