import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { finished } from 'node:stream/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStages } from './stages.mjs';

const reporter = fileURLToPath(new URL('./node-reporter.mjs', import.meta.url));
const displayedCommand = stage => [path.basename(stage.command), ...stage.args].join(' ');
const pending = stage => ({ id: stage.id, name: stage.name, group: stage.group, command: displayedCommand(stage), status: 'not-run', durationMs: 0, tests: [] });

async function readJSON(file) { return JSON.parse(await readFile(file, 'utf8')); }
export async function sourceInfo(cwd, outputDir) {
  if (outputDir && existsSync(path.join(outputDir, 'source.json'))) return readJSON(path.join(outputDir, 'source.json'));
  const git = (...args) => {
    const p = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } });
    if (p.status !== 0) throw new Error(p.stderr || 'Git metadata unavailable');
    return p.stdout.trim();
  };
  return { commit: git('rev-parse', 'HEAD'), branch: git('branch', '--show-current'), dirty: git('status', '--porcelain') !== '' };
}

function newReport(stages, source) {
  return { startedAt: new Date().toISOString(), finishedAt: null, source,
    environment: { node: process.version, platform: process.platform, arch: process.arch },
    status: 'running', stages: stages.map(pending), artifacts: [],
    issuesUrl: null };
}

async function saveReport(outputDir, report) {
  if (!outputDir) return;
  const { renderReport } = await import('./report.mjs');
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  await writeFile(path.join(outputDir, 'index.html'), renderReport(report));
}

async function runCommand(stage, cwd, outputDir, signal) {
  const args = [...stage.args];
  let resultFile;
  if (outputDir && stage.result === 'node') {
    resultFile = path.join(outputDir, `${stage.id}.jsonl`);
    args.unshift('--test-reporter=spec', `--test-reporter=${reporter}`, '--test-reporter-destination=stdout', `--test-reporter-destination=${resultFile}`);
  }
  const env = { ...process.env, OPENSPEC_TELEMETRY: '0', GIT_OPTIONAL_LOCKS: '0' };
  delete env.NODE_TEST_CONTEXT;
  if (outputDir) env.VERIFICATION_DIR = outputDir;
  const log = outputDir ? createWriteStream(path.join(outputDir, 'logs', `${stage.id}.log`)) : null;
  let tail = '';
  const result = await new Promise(resolve => {
    const child = spawn(stage.command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
    let stopTimer;
    const terminate = () => {
      if (!child.pid) return;
      const kill = sig => { try { process.kill(process.platform === 'win32' ? child.pid : -child.pid, sig); } catch (e) { if (e.code !== 'ESRCH') throw e; } };
      kill('SIGTERM'); stopTimer = setTimeout(() => kill('SIGKILL'), 3000); stopTimer.unref();
    };
    const output = (data, stream) => { stream.write(data); log?.write(data); tail = (tail + data.toString()).slice(-12000); };
    child.stdout.on('data', data => output(data, process.stdout));
    child.stderr.on('data', data => output(data, process.stderr));
    signal?.addEventListener('abort', terminate, { once: true });
    if (signal?.aborted) terminate();
    let error;
    child.on('error', e => { error = e.message; });
    child.on('close', (code, sig) => {
      clearTimeout(stopTimer); signal?.removeEventListener('abort', terminate);
      resolve({ exitCode: code, signal: sig, ...(error ? { error } : {}) });
    });
  });
  if (log) { log.end(); await finished(log); }
  return { ...result, tail, resultFile };
}

function relativeFile(file, cwd) { return file ? path.relative(cwd, file) : undefined; }
async function collectNode(file, cwd) {
  const rows = (await readFile(file, 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
  if (!rows.some(r => r.type === 'summary')) throw new Error('Node test run did not produce its final summary');
  const cases = rows.filter(r => r.type === 'case').map(({ type, ...r }) => ({ ...r, file: relativeFile(r.file, cwd) }));
  if (!cases.length) throw new Error('Node test run did not execute any cases');
  return cases;
}

async function collectBrowser(outputDir, cwd) {
  const report = await readJSON(path.join(outputDir, 'browser.json'));
  const tests = [];
  const walk = suites => { for (const suite of suites ?? []) {
    for (const spec of suite.specs ?? []) for (const test of spec.tests ?? []) {
      const result = test.results?.at(-1);
      const status = test.status === 'skipped' ? 'skipped' : test.status === 'expected' ? 'passed' : result?.status === 'interrupted' ? 'cancelled' : 'failed';
      const attachments = (result?.attachments ?? []).filter(a => a.path && existsSync(a.path)).map(a => ({ name: a.name, path: path.relative(outputDir, a.path) })).filter(a => !a.path.startsWith('..'));
      tests.push({ name: spec.title, file: path.isAbsolute(spec.file) ? relativeFile(spec.file, cwd) : spec.file, line: spec.line,
        status, project: test.projectName, durationMs: (test.results ?? []).reduce((n, r) => n + r.duration, 0),
        ...(result?.error ? { error: result.error.message ?? result.error.value } : {}), attachments });
    }
    walk(suite.suites);
  } };
  walk(report.suites);
  if (!tests.length) throw new Error('Browser test run did not execute any cases');
  return tests;
}

async function collectArtifacts(outputDir, report) {
  for (const [name, file] of [['浏览器详细报告', 'browser/index.html'], ['异步检查数据', 'async-results.json'], ['接口检查数据', 'security-api-results.json'], ['SEC-07 用量检查数据', 'usage-recording.json']]) {
    if (existsSync(path.join(outputDir, file))) report.artifacts.push({ name, path: file });
  }
  if (existsSync(path.join(outputDir, 'async-results.json'))) report.async = await readJSON(path.join(outputDir, 'async-results.json'));
  const walk = async dir => {
    if (!existsSync(dir)) return;
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(file);
      else if (entry.name.endsWith('.png')) report.artifacts.push({ name: entry.name, path: path.relative(outputDir, file) });
    }
  };
  await walk(path.join(outputDir, 'browser-results'));
}

export async function runChecks({ stages, cwd = process.cwd(), outputDir, source, signal } = {}) {
  if (outputDir) { outputDir = path.resolve(outputDir); await mkdir(path.join(outputDir, 'logs'), { recursive: true }); }
  const report = newReport(stages, source ?? (outputDir ? await sourceInfo(cwd, outputDir) : null));
  const reviewFile = path.join(cwd, 'docs/verification/code-review.md');
  if (outputDir && existsSync(reviewFile)) {
    const review = await readFile(reviewFile, 'utf8');
    await writeFile(path.join(outputDir, 'review.md'), review);
    report.issuesUrl = 'review.md';
    report.reviewSummary = review.split('\n\n').find(paragraph => paragraph.includes('待修改') && !paragraph.startsWith('|'));
  }
  await saveReport(outputDir, report);
  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i], row = report.stages[i];
    if (signal?.aborted) { report.status = 'interrupted'; report.failure = '验收已中断'; break; }
    row.status = 'running'; const start = performance.now();
    console.log(`\n[${i + 1}/${stages.length}] ${stage.name}`);
    await saveReport(outputDir, report);
    try {
      const result = await runCommand(stage, cwd, outputDir, signal);
      row.durationMs = Math.round(performance.now() - start);
      row.exitCode = result.exitCode;
      if (outputDir) row.log = `logs/${stage.id}.log`;
      row.status = signal?.aborted ? 'interrupted' : result.exitCode === 0 ? 'passed' : 'failed';
      if (row.status !== 'passed') row.error = result.error || result.tail.trim() || `Process ended: ${result.signal ?? result.exitCode}`;
      if (outputDir && stage.result && row.status !== 'interrupted') {
        try { row.tests = stage.result === 'node' ? await collectNode(result.resultFile, cwd) : await collectBrowser(outputDir, cwd); }
        catch (error) { row.status = 'failed'; row.error = [row.error, `结果采集失败：${error.message}`].filter(Boolean).join('\n'); }
        if (row.tests.some(t => ['failed', 'cancelled'].includes(t.status))) row.status = 'failed';
      }
    } catch (error) { row.status = 'failed'; row.error = error.message; row.durationMs = Math.round(performance.now() - start); }
    await saveReport(outputDir, report);
    if (row.status !== 'passed') { report.status = row.status; break; }
  }
  if (report.status === 'running') report.status = 'passed';
  report.finishedAt = new Date().toISOString();
  if (outputDir) {
    try { await collectArtifacts(outputDir, report); }
    catch (error) { report.status = 'failed'; report.failure = `材料汇总失败：${error.message}`; }
    await saveReport(outputDir, report);
  }
  return report;
}

export async function finalizeReport(outputDir, { failure, source } = {}) {
  outputDir = path.resolve(outputDir); await mkdir(outputDir, { recursive: true });
  const file = path.join(outputDir, 'report.json');
  const report = existsSync(file) ? await readJSON(file) : newReport(createStages(), source ?? (existsSync(path.join(outputDir, 'source.json')) ? await readJSON(path.join(outputDir, 'source.json')) : null));
  if (failure) { report.failure = failure; report.status = 'failed'; }
  else if (report.status === 'running') { report.status = 'failed'; report.failure = '验收未完整结束'; }
  for (const row of report.stages) if (row.status === 'running') row.status = 'interrupted';
  report.finishedAt ??= new Date().toISOString();
  await saveReport(outputDir, report);
  return report;
}
