import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runChecks, finalizeReport } from './pipeline.mjs';
import { createStages, selectStages } from './stages.mjs';

function fixture(t) {
  const cwd = mkdtempSync(path.join(tmpdir(), 'newsclaw-pipeline-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  return { cwd, outputDir: path.join(cwd, 'results'), source: { commit: 'fixture', branch: 'fixture', dirty: true } };
}
const stage = (id, script) => ({ id, name: id, group: 'repository', command: process.execPath, args: ['-e', script] });

test('FLOW-06 one stage catalog serves all groups and individual commands without duplication', () => {
  const all = createStages({ base: 'main', head: 'HEAD' });
  assert.equal(new Set(all.map(s => s.id)).size, all.length);
  assert.deepEqual(selectStages(all, { group: 'all' }), all);
  const grouped = ['repository', 'security', 'application'].flatMap(group => selectStages(all, { group }));
  assert.deepEqual(new Set(grouped.map(s => s.id)), new Set(all.map(s => s.id)));
  assert.equal(selectStages(all, { stage: 'unit' }).length, 1);
  const usage = selectStages(all, { group: 'application' }).find(s => s.id === 'usage');
  assert.ok(usage, 'SEC-07 must run in the application group and complete acceptance');
  assert.equal(usage.result, 'node');
  assert.deepEqual(usage.args, ['--import', 'tsx', '--test', 'tests/evaluation/usage-recording.ts']);
  assert.throws(() => selectStages(all, { group: 'unknown' }), /Unknown/);
});

test('STD-09 a successful command produces current-run JSON and an offline HTML summary', async t => {
  const f = fixture(t);
  const report = await runChecks({ ...f, stages: [stage('ok', "console.log('verified')")] });
  assert.equal(report.status, 'passed');
  assert.equal(report.stages[0].exitCode, 0);
  assert.equal(report.source.dirty, true);
  assert.match(readFileSync(path.join(f.outputDir, 'logs/ok.log'), 'utf8'), /verified/);
  assert.equal(JSON.parse(readFileSync(path.join(f.outputDir, 'report.json'))).status, 'passed');
  assert.match(readFileSync(path.join(f.outputDir, 'index.html'), 'utf8'), /NewsClaw/);
});

test('FLOW-06 standalone build commands do not require Git metadata or a report directory', async t => {
  const f = fixture(t);
  const report = await runChecks({ cwd: f.cwd, stages: [stage('build', '')] });
  assert.equal(report.status, 'passed');
});

test('FLOW-06 a failed command stops later stages and records failure rather than success', async t => {
  const f = fixture(t);
  const report = await runChecks({ ...f, stages: [stage('broken', "console.error('expected tool failure');process.exit(3)"), stage('later', "throw new Error('must not execute')")] });
  assert.equal(report.status, 'failed');
  assert.equal(report.stages[0].exitCode, 3);
  assert.equal(report.stages[1].status, 'not-run');
});

test('STD-09 native Node events preserve test identities, skips and assertion failures', async t => {
  const f = fixture(t);
  writeFileSync(path.join(f.cwd, 'sample.test.mjs'), "import test from 'node:test';import assert from 'node:assert/strict';test('NEWS-01 source evidence',()=>assert.equal(1,1));test.skip('TOPIC-01 deferred',()=>{});test('ACC-01 denial',()=>assert.equal(1,2));");
  const report = await runChecks({ ...f, stages: [{ id: 'native', name: 'Native', group: 'application', command: process.execPath, args: ['--test', 'sample.test.mjs'], result: 'node' }] });
  assert.equal(report.status, 'failed');
  assert.equal(report.stages[0].tests.length, 3);
  assert.deepEqual(report.stages[0].tests.map(x => x.status), ['passed', 'skipped', 'failed']);
  assert.match(report.stages[0].tests[2].error, /1 !== 2|Expected/);
});

test('STD-09 failed usage checks keep their current-run evidence linked in JSON and HTML', async t => {
  const f = fixture(t);
  const record = { results: [{ mode: 'bad-bilingual', expectedUsage: { totalTokens: 30 }, storedUsage: null, passed: false }] };
  const script = `require('node:fs').writeFileSync(require('node:path').join(process.env.VERIFICATION_DIR, 'usage-recording.json'), ${JSON.stringify(JSON.stringify(record))}); console.error('SEC-07 expected 30 tokens, received null'); process.exitCode=1;`;
  const report = await runChecks({ ...f, stages: [stage('usage', script)] });
  assert.equal(report.status, 'failed');
  assert.equal(report.stages[0].exitCode, 1);
  assert.deepEqual(JSON.parse(readFileSync(path.join(f.outputDir, 'usage-recording.json'))), record);
  assert.ok(report.artifacts.some(item => item.path === 'usage-recording.json'));
  assert.match(readFileSync(path.join(f.outputDir, 'index.html'), 'utf8'), /href="usage-recording\.json"/);
});

test('FLOW-11 cleanup failure turns a completed run into a failed report', async t => {
  const f = fixture(t);
  await runChecks({ ...f, stages: [stage('ok', '')] });
  const report = await finalizeReport(f.outputDir, { failure: 'Test environment cleanup failed' });
  assert.equal(report.status, 'failed');
  assert.match(report.failure, /cleanup/);
  assert.equal(report.stages[0].status, 'passed');
});

test('FLOW-11 infrastructure failure before checks preserves a readable report with unexecuted stages', async t => {
  const f = fixture(t);
  const report = await finalizeReport(f.outputDir, { failure: 'Database startup failed', source: f.source });
  assert.equal(report.status, 'failed');
  assert.ok(report.stages.length > 0);
  assert.ok(report.stages.every(s => s.status === 'not-run'));
});

test('FLOW-11 interruption terminates the running stage and records subsequent stages as unexecuted', async t => {
  const f = fixture(t), controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 200);
  t.after(() => clearTimeout(timer));
  const report = await runChecks({ ...f, signal: controller.signal, stages: [stage('wait', 'setInterval(()=>{},1000)'), stage('later', '')] });
  assert.equal(report.status, 'interrupted');
  assert.equal(report.stages[0].status, 'interrupted');
  assert.equal(report.stages[1].status, 'not-run');
});
