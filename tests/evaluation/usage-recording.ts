import { mkdir, writeFile } from 'node:fs/promises';
import pino from 'pino';
import { editorEnvironment } from '../support/editor-fixture.js';
import { EditorService } from '../../src/server/modules/editor/service.js';
import { SkillsService } from '../../src/server/modules/skills/service.js';
import type { ModelUsage } from '../../src/server/adapters/model.js';

const expectedUsage: ModelUsage = { inputTokens: 10, outputTokens: 20, totalTokens: 30 };
const matchesUsage = (actual: ModelUsage | undefined) => actual !== undefined
  && actual.inputTokens === expectedUsage.inputTokens
  && actual.outputTokens === expectedUsage.outputTokens
  && actual.totalTokens === expectedUsage.totalTokens;

const env = await editorEnvironment();
try {
  const logs: { requestId?: string; module?: string; actorId?: string; skillId?: string; result?: string; durationMs?: number; usage?: ModelUsage }[] = [];
  env.ctx.logger = pino({ base: null }, { write: line => { logs.push(JSON.parse(line)); } });
  const editor = new EditorService(env.ctx), skills = new SkillsService(env.ctx);
  const template = (await skills.list()).find(item => item.kind === 'bilingual');
  if (!template) throw new Error('Bilingual fixture skill is missing');
  const skill = await skills.install(env.a, template.id);
  if (!skill) throw new Error('Bilingual fixture skill could not be installed');
  const results = [];

  for (const mode of ['valid', 'bad-bilingual'] as const) {
    env.state.mode = mode;
    const conversation = await editor.createConversation(env.a, 'Usage recording', { kind: 'news', id: env.newsId });
    if (!conversation) throw new Error('Fixture conversation could not be created');
    const requestId = `usage-recording-${mode}`;
    await editor.execute(await editor.prepare(env.a, conversation.id, {
      content: '对照材料并解释原文', skillId: skill.id,
    }), () => {}, undefined, requestId);
    const answer = (await editor.conversation(env.a, conversation.id)).messages.at(-1);
    if (!answer) throw new Error('Fixture answer was not saved');
    const log = logs.find(item => item.module === 'editor' && item.requestId === requestId);
    const stored = await env.ctx.db.one<{ usage: ModelUsage }>('SELECT usage FROM messages WHERE id=$1', [answer.id]);
    const expectedStatus = mode === 'valid' ? 'completed' : 'failed';
    results.push({
      mode, requestId, actorId: env.a.id, skillId: skill.id,
      expectedStatus, answerStatus: answer.status, expectedUsage,
      loggedActorId: log?.actorId, loggedSkillId: log?.skillId,
      loggedResult: log?.result, durationMs: log?.durationMs,
      loggedUsage: log?.usage, storedUsage: stored?.usage,
      passed: answer.status === expectedStatus && log?.actorId === env.a.id
        && log.skillId === skill.id && typeof log.durationMs === 'number'
        && matchesUsage(log.usage) && matchesUsage(stored?.usage),
    });
  }

  const record = { recordedAt: new Date().toISOString(), results };
  const directory = process.env.EVALUATION_DIR ?? '.local/verification';
  await mkdir(directory, { recursive: true });
  await writeFile(`${directory}/usage-recording.json`, JSON.stringify(record, null, 2) + '\n');
  console.log(JSON.stringify(record, null, 2));
  process.exitCode = results.every(result => result.passed) ? 0 : 1;
} finally {
  await env.cleanup();
}
