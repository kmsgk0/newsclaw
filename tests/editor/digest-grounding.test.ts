import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { personalDigestSchema, renderPersonalDigest, createEditorHandlers, preparePersonalDailyInput } from '../../src/server/modules/editor/background.js';
import { EditorRepository } from '../../src/server/modules/editor/repository.js';
import { businessDate } from '../../src/server/modules/editor/calendar.js';
import type { TaskRecord } from '../../src/server/runtime/tasks.js';
import { editorEnvironment } from '../support/editor-fixture.js';

test('EDITOR-04 interest explanations quote selected material and actual preferences', () => {
  const materials = [{ label: 'N1', content: '云杉实验室宣布 11 月 20 日发布 SDK 2.0。商业价格未披露。' }];
  const value = personalDigestSchema.parse({ content: 'SDK 2.0 将于 11 月 20 日发布 [N1]。', sourceLabels: ['N1'], interestMatches: [{ sourceLabel: 'N1', preference: '开发工具', quote: '11 月 20 日发布 SDK 2.0' }] });
  const rendered = renderPersonalDigest(value, ['关注人工智能与开发工具'], materials);
  assert.match(rendered, /SDK 2.0 将于 11 月 20 日发布/);
  assert.match(rendered, /关注“开发工具”：报道提到“11 月 20 日发布 SDK 2.0” \[N1\]/);
  const invalid = [
    { ...value.interestMatches[0], quote: '架构变更将直接提升推理性能。' },
    { ...value.interestMatches[0], preference: '股票交易' },
    { ...value.interestMatches[0], sourceLabel: 'N2' },
  ];
  for (const match of invalid) assert.throws(() => renderPersonalDigest({ ...value, interestMatches: [match] }, ['开发工具'], materials), /缺少可核对依据/);
  assert.equal(renderPersonalDigest({ ...value, interestMatches: [] }, [], materials), value.content);
});

test('EDITOR-04 unsupported interest evidence rejects the new digest and preserves the saved edition', async () => {
  const env = await editorEnvironment();
  try {
    await env.ctx.db.query("UPDATE editors SET interests='关注人工智能' WHERE user_id=$1", [env.a.id]);
    const date = businessDate(), repository = new EditorRepository(env.ctx.db);
    const input = await preparePersonalDailyInput(env.ctx, env.a.id, date);
    const submitted = await env.ctx.tasks.submit(null, 'daily', input, randomUUID(), env.a.id);
    const task = (await env.ctx.db.one<TaskRecord>('SELECT * FROM tasks WHERE id=$1', [submitted.taskId]))!;
    const handler = createEditorHandlers(env.ctx).daily;
    const run = { executionId: randomUUID(), signal: new AbortController().signal, attempt: 1 };
    const initial = await handler(task, run);
    await env.ctx.db.tx(tx => initial.commit(tx));
    const before = await repository.digests(env.a.id);
    assert.equal(before.length, 1);
    env.state.mode = 'unsupported-interest';
    await assert.rejects(handler(task, run), /缺少可核对依据/);
    assert.deepEqual(await repository.digests(env.a.id), before);
  } finally { await env.cleanup(); }
});
