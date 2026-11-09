import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { editorEnvironment } from '../support/editor-fixture.js';
import { createNewsHandlers, preparePublicDailyInput } from '../../src/server/modules/news/service.js';
import { NewsRepository } from '../../src/server/modules/news/repository.js';
import { createEditorHandlers, prepareJournalInput, preparePersonalDailyInput } from '../../src/server/modules/editor/background.js';
import { EditorRepository } from '../../src/server/modules/editor/repository.js';
import { businessDate } from '../../src/server/modules/editor/calendar.js';
import type { TaskRecord } from '../../src/server/runtime/tasks.js';

test('NEWS-06/EDITOR-04/06 digest labels preserve news identity and reject unknown sources before saving', async () => {
  const env = await editorEnvironment();
  try {
    const date = businessDate(), repository = new EditorRepository(env.ctx.db);
    const publicHandlers = createNewsHandlers(env.ctx), editorHandlers = createEditorHandlers(env.ctx);
    await env.ctx.db.query("INSERT INTO activities(user_id,kind,news_id) VALUES($1,'read',$2)", [env.a.id,env.newsId]);
    const cases = [
      { owner: null, type: 'daily' as const, input: await preparePublicDailyInput(env.ctx,date), handler: publicHandlers.daily },
      { owner: env.a.id, type: 'daily' as const, input: await preparePersonalDailyInput(env.ctx,env.a.id,date), handler: editorHandlers.daily },
      { owner: env.a.id, type: 'journal' as const, input: await prepareJournalInput(env.ctx,env.a.id,date), handler: editorHandlers.journal },
    ];
    for (const item of cases) {
      const submitted = await env.ctx.tasks.submit(null,item.type,item.input,randomUUID(),item.owner);
      const task = (await env.ctx.db.one<TaskRecord>('SELECT * FROM tasks WHERE id=$1',[submitted.taskId]))!;
      const run = { executionId:randomUUID(),signal:new AbortController().signal,attempt:1 };
      const previousDaily = await repository.digests(env.a.id), previousJournal = await repository.journals(env.a.id);
      const previousPublic = (await new NewsRepository(env.ctx.db).digests(date)).items;
      env.state.mode = 'bad-digest-source';
      await assert.rejects(item.handler(task,run),/材料范围/);
      assert.deepEqual(await repository.digests(env.a.id),previousDaily);
      assert.deepEqual(await repository.journals(env.a.id),previousJournal);
      assert.deepEqual((await new NewsRepository(env.ctx.db).digests(date)).items,previousPublic);
      assert.equal((await repository.profile(env.a.id))!.activityCursor,'0');
      env.state.mode = 'valid';
      const generated = await item.handler(task,run);
      const request = env.state.requests.at(-1) as {messages:{content:string}[]};
      const input = JSON.parse(request.messages[1].content);
      const materials = input.materials ?? input.news;
      assert.equal(materials[0].label,'N1');
      assert.equal(materials[0].title,'云杉引擎开放试用');
      assert.ok(!('id' in materials[0]));
      assert.ok(!('sourceId' in materials[0]));
      assert.ok(!('processing' in materials[0]));
      await env.ctx.db.tx(tx=>generated.commit(tx));
    }
    const daily = await repository.digests(env.a.id), journal = await repository.journals(env.a.id);
    const publicDaily = await new NewsRepository(env.ctx.db).digests(date);
    assert.equal(daily.length,1);
    assert.equal(journal.length,1);
    assert.deepEqual(daily[0].sources.map((source:{id:string})=>source.id),[env.newsId]);
    assert.deepEqual(journal[0].sources.map((source:{id:string})=>source.id),[env.newsId]);
    assert.deepEqual((publicDaily.items[0].news as {id:string}[]).map(source=>source.id),[env.newsId]);
    assert.equal((await repository.digests(env.b.id)).length,0);
  } finally { await env.cleanup(); }
});
