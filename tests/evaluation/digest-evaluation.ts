import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { loadConfig } from '../../src/server/config.js';
import { ModelClient } from '../../src/server/adapters/model.js';
import { personalDigestInstructions, personalDigestSchema, renderPersonalDigest } from '../../src/server/modules/editor/background.js';
import { selectLabeledSources } from '../../src/server/modules/news/materials.js';
import { validateCitations } from '../../src/server/modules/editor/service.js';

if (process.env.RUN_LIVE_AI !== '1') throw new Error('Set RUN_LIVE_AI=1 to run the configured paid model evaluation');

interface DigestInput {
  date: string;
  profile: { editorName: string; style: string; interests: string };
  memories: { content: string }[];
  materials: { label: string; title: string; sourceName: string; url: string; content: string; [key: string]: unknown }[];
}
const profile = { editorName: '小闻', style: '清楚、简洁，保留背景与来源', interests: '关注人工智能与开发工具，说明具体进展和来源。' };
function sample(title: string, content: string, interests = profile.interests): DigestInput {
  return { date: '2026-11-10', profile: { ...profile, interests }, memories: [], materials: [{
    label: 'N1', title, sourceName: '合成测试材料', url: 'https://example.com/digest-evaluation',
    publishedAt: '2026-11-10T01:00:00.000Z', content, contentScope: 'full', summary: content,
    translation: null, language: 'zh', domain: '人工智能',
  }] };
}
const personnel = '云杉实验室的一名负责人正在考虑明年离开现有岗位，尚未作出决定。若其离任，工作可能交由负责将 AI 功能整合到终端系统的另一团队接手。报道没有披露产品架构、SDK、接口或发布时间的调整。';
const announcement = '云杉实验室宣布将于 2026 年 11 月 20 日发布 SDK 2.0，提供批量推理接口。公告没有披露商业价格。';
const cases = process.env.DIGEST_INPUT_FILE
  ? [{ id: 'provided-material', expected: '按输入材料核对事实、条件、兴趣分析及未披露信息。', input: (JSON.parse(await readFile(process.env.DIGEST_INPUT_FILE, 'utf8')) as { input: DigestInput }).input }]
  : [
    { id: 'personnel', expected: '保留考虑离任及条件性安排，不断言架构、SDK、接口或时间变化；兴趣关联须与材料区分。', input: sample('云杉实验室负责人考虑岗位调整', personnel) },
    { id: 'announced-plan', expected: '保留公告明确的日期、SDK 版本和批量推理接口，说明价格未披露。', input: sample('云杉实验室公布 SDK 2.0 计划', announcement) },
    { id: 'no-interests', expected: '采用当日精选，不虚构个人兴趣，保留公告事实与来源。', input: sample('云杉实验室公布 SDK 2.0 计划', announcement, '') },
  ];
const directory = process.env.EVALUATION_DIR ?? '.local/verification';
await mkdir(directory, { recursive: true });
const config = loadConfig(), model = new ModelClient(config);
const results = [];
try {
  for (const item of cases) {
    const input = { ...item.input, instructions: personalDigestInstructions };
    const started = Date.now();
    const generated = await model.json('personal-digest', input, personalDigestSchema);
    let validationError: Error | undefined, rendered: string | undefined;
    try {
      const sources = selectLabeledSources(input.materials.map(material => ({ ...material, id: material.label })), generated.value.sourceLabels);
      if (!sources.length) throw new Error('Digest evaluation requires a cited source');
      validateCitations(generated.value.content, sources);
      rendered = renderPersonalDigest(generated.value, [input.profile.interests, ...input.memories.map(memory => memory.content)], input.materials);
    } catch (error) { validationError = error instanceof Error ? error : new Error(String(error)); }
    results.push({ id: item.id, expected: item.expected, input, output: generated.value, rendered, usage: generated.usage, elapsedMs: Date.now() - started, structureAndSources: validationError ? 'failed' : 'passed', validationError: validationError?.message, contentReview: 'pending' });
    await writeFile(`${directory}/digest-results.json`, JSON.stringify({ recordedAt: new Date().toISOString(), results }, null, 2) + '\n');
    if (validationError) throw validationError;
    console.log(`${item.id}: structure and sources passed; content requires review`);
  }
} finally { await model.close(); }
