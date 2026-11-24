import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { QueryResultRow } from 'pg';
import { createAPIEnvironment } from '../../apitest/fixtures/environment.js';
import { Db } from '../../src/server/db.js';
import { NewsRepository } from '../../src/server/modules/news/repository.js';

const articleCount = 5000;
const matchCount = 100;
const wordsPerArticle = 250;
const vocabulary = `local regional public private council station center market office school library
  research science climate energy coastal river water weather forest habitat wildlife transport rail
  transit highway airport network signal system service project budget policy report data demand supply
  growth outlook forecast survey season period quarter annual monthly daily current recent future
  economy industry company business revenue funding costs income prices jobs workers staff members
  residents visitors students teachers families leaders partners planners engineers analysts experts
  teams board finance investment trade exports imports retail housing shelter health safety access
  programs projects changes records results findings figures targets measures tests review hearing
  meeting debate approval contract permit plan design model sample pilot launch release update
  testing training equipment digital mobile online software device hardware storage battery power
  solar wind farms fields parks streets bridges tracks vehicles buses trains route traffic travel
  freight museum theater music events festival sports venues tourism culture history archive
  study notes news media articles opinion editor readers details context sources facts evidence
  analysis output impact outcomes progress limits goals methods options needs risks delays gains
  the and for with said after from under when this that they their were will also into over next
  new old main near more less high low wide small large early late some many most first last each
  year week day time work site area land town city port road farm bank shop yard hall room zone
  lead join make move open keep take set get add run use show see find help test note give seek`.split(/\s+/);

function articleBodies() {
  let state = 18423;
  return Array.from({ length: articleCount }, () => {
    const words = Array.from({ length: wordsPerArticle }, () => {
      state = (Math.imul(1664525, state) + 1013904223) >>> 0;
      return vocabulary[(state >>> 16) % vocabulary.length];
    });
    return words.join(' ');
  });
}

interface PlanNode {
  'Node Type': string;
  'Relation Name'?: string;
  'Index Name'?: string;
  Plans?: PlanNode[];
}
interface SearchPlan {
  sql: string;
  parameters: unknown[];
  plan: { 'QUERY PLAN': { Plan: PlanNode }[] }[];
}

export async function createBenchmarkEnvironment() {
  const env = await createAPIEnvironment({ seed: false, captureLogs: false });
  try {
    const seedStarted = performance.now();
    const articles = await env.ctx.db.query<{ bodyLength: number }>(`
      INSERT INTO news(source_id,url,title,published_at,content,content_scope,content_hash,summary,translation)
      SELECT $1,'https://example.org/article/'||i,
        CASE WHEN i <= $3 / 4 THEN 'Regional benchmark '||i ELSE 'Regional report '||i END,
        '2026-01-01T12:00:00Z'::timestamptz - i * interval '1 second',
        CASE WHEN i > $3 / 4 AND i <= $3 / 2 THEN 'benchmark '||body ELSE body END,
        'full','fixture-'||i,
        CASE WHEN i > $3 / 2 AND i <= $3 * 3 / 4 THEN 'Quarterly benchmark review' ELSE 'Quarterly regional review' END,
        CASE WHEN i > $3 * 3 / 4 AND i <= $3 THEN 'Quarterly benchmark report' ELSE 'Quarterly regional report' END
      FROM unnest($2::text[]) WITH ORDINALITY AS articles(body,i)
      RETURNING length(content) AS "bodyLength"`, [env.source.id, articleBodies(), matchCount]);
    const seedMs = performance.now() - seedStarted;
    const vacuumStarted = performance.now();
    await env.ctx.db.query('VACUUM (ANALYZE) news');
    const vacuumMs = performance.now() - vacuumStarted;

    const plans: SearchPlan[] = [];
    const inspected = new Db(env.ctx.db.pool);
    inspected.query = async <T extends QueryResultRow>(sql: string, parameters: unknown[] = []): Promise<T[]> => {
      const plan = await env.ctx.db.query<SearchPlan['plan'][number]>(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`, parameters);
      plans.push({ sql, parameters: [...parameters], plan });
      return env.ctx.db.query<T>(sql, parameters);
    };
    const search = await new NewsRepository(inspected).search({ q: 'benchmark', semantic: false, pageSize: 20 });
    assert.equal(search.total, matchCount);
    assert.equal(search.items.length, 20);

    const session = await env.auth.login({ username: env.admin.username, password: 'correct-password' });
    const task = await env.ctx.tasks.submit(env.admin, 'collect', { sourceId: env.source.id }, randomUUID());
    const stats = {
      articles: articles.length,
      matches: search.total,
      averageBodyLength: articles.reduce((total, article) => total + article.bodyLength, 0) / articles.length,
      seedMs,
      vacuumMs,
      databasePoolMax: env.ctx.config.databasePoolMax,
    };
    return { env, plans, stats, fixture: { base: env.baseUrl, token: session.accessToken, sourceId: env.source.id, taskId: task.taskId } };
  } catch (error) {
    await env.cleanup();
    throw error;
  }
}
