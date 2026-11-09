import assert from 'node:assert/strict';
import { execFileSync, spawnSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, chmodSync, readdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { prepareWorkspace } from './prepare-workspace.mjs';

function repository(t) {
  const directory = mkdtempSync(path.join(tmpdir(), 'newsclaw-acceptance-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const source = path.join(directory, 'source'); mkdirSync(source);
  const git = (...args) => execFileSync('git', ['-C', source, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-b', 'main'); git('config', 'user.email', 'fixture@example.invalid'); git('config', 'user.name', 'Fixture');
  writeFileSync(path.join(source, '.gitignore'), '.env\n.local/\nnode_modules/\n');
  writeFileSync(path.join(source, 'README.md'), 'original\n');
  writeFileSync(path.join(source, 'deleted.txt'), 'remove from current worktree\n');
  git('add', '--', '.'); git('commit', '-m', 'test: initialize fixture');
  const dependencies = path.join(directory, 'dependencies'); mkdirSync(dependencies);
  return { directory, source, git, dependencies };
}

test('FLOW-11 checkout snapshot includes current public changes and history, without local configuration', t => {
  const f = repository(t); const head = f.git('rev-parse', 'HEAD');
  writeFileSync(path.join(f.source, 'README.md'), 'changed\n');
  writeFileSync(path.join(f.source, 'new file.txt'), 'public addition\n');
  writeFileSync(path.join(f.source, '.env'), 'private configuration\n');
  mkdirSync(path.join(f.source, '.local')); writeFileSync(path.join(f.source, '.local', 'old.json'), 'old result');
  rmSync(path.join(f.source, 'deleted.txt'));
  const target = path.join(f.directory, 'snapshot'), reports = path.join(f.directory, 'reports');
  prepareWorkspace({ source: f.source, gitDirectory: path.join(f.source, '.git'), commonDirectory: path.join(f.source, '.git'), target, dependencies: f.dependencies, reports });
  assert.equal(readFileSync(path.join(target, 'README.md'), 'utf8'), 'changed\n');
  assert.equal(readFileSync(path.join(target, 'new file.txt'), 'utf8'), 'public addition\n');
  assert.equal(existsSync(path.join(target, 'deleted.txt')), false);
  assert.equal(existsSync(path.join(target, '.env')), false);
  assert.equal(existsSync(path.join(target, '.local', 'old.json')), false);
  assert.equal(execFileSync('git', ['-C', target, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), head);
  assert.equal(f.git('rev-parse', 'HEAD'), head);
  assert.deepEqual(JSON.parse(readFileSync(path.join(reports, 'source.json'))), { commit: head, branch: 'main', dirty: true });
});

test('FLOW-11 worktree snapshot uses its branch and uncommitted files, with the common history', t => {
  const f = repository(t); const worktree = path.join(f.directory, 'branch');
  f.git('worktree', 'add', '-b', 'feature', worktree);
  writeFileSync(path.join(worktree, 'README.md'), 'worktree change\n');
  const gitDirectory = readFileSync(path.join(worktree, '.git'), 'utf8').trim().slice(8);
  const target = path.join(f.directory, 'snapshot'), reports = path.join(f.directory, 'reports');
  prepareWorkspace({ source: worktree, gitDirectory, commonDirectory: path.join(f.source, '.git'), target, dependencies: f.dependencies, reports });
  assert.equal(readFileSync(path.join(target, 'README.md'), 'utf8'), 'worktree change\n');
  assert.equal(readFileSync(path.join(f.source, 'README.md'), 'utf8'), 'original\n');
  assert.equal(JSON.parse(readFileSync(path.join(reports, 'source.json'))).branch, 'feature');
  assert.equal(execFileSync('git', ['-C', target, 'rev-parse', 'main'], { encoding: 'utf8' }).trim(), f.git('rev-parse', 'main'));
});

function lifecycle(t, failure = '') {
  const f = repository(t);
  mkdirSync(path.join(f.source, 'scripts'));
  copyFileSync(fileURLToPath(new URL('../acceptance.sh', import.meta.url)), path.join(f.source, 'scripts/acceptance.sh'));
  const fakeDocker = path.join(f.directory, 'docker');
  writeFileSync(fakeDocker, `#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const args=process.argv.slice(2), output=process.env.ACCEPTANCE_REPORT_DIR;
fs.appendFileSync(process.env.CALL_LOG, JSON.stringify(args)+'\\n');
const phase=args[0]==='build'?'build':args[0]==='run'?'finalize':args.includes('up')?'startup':args.includes('down')?'cleanup':args.includes('run')?'checks':'version';
if(process.env.FAIL_PHASE==='daemon'&&['cleanup','finalize'].includes(phase)){console.error('Cannot connect to the Docker daemon');process.exit(125);}
const failed=process.env.FAIL_PHASE===phase;
if(phase==='checks'||phase==='finalize') {
  fs.mkdirSync(output,{recursive:true});
  const file=path.join(output,'report.json');
  const previous=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):null;
  const status=failed||args.includes('--failure')||previous?.status==='failed'?'failed':'passed';
  fs.writeFileSync(file,JSON.stringify({status,stages:[]}));
  fs.writeFileSync(path.join(output,'index.html'),'<html><h1>'+status+'</h1></html>');
}


if(failed)process.exitCode=1;
if(phase==='checks'&&process.env.WAIT_CHECKS) {
  fs.writeFileSync(process.env.WAIT_CHECKS,'ready');
  setTimeout(()=>{},500);
}
`);
  chmodSync(fakeDocker, 0o755);
  const callLog = path.join(f.directory, 'calls.jsonl');
  const env = { ...process.env, DOCKER_BIN: fakeDocker, CALL_LOG: callLog, FAIL_PHASE: failure };
  const calls = () => readFileSync(callLog, 'utf8').trim().split('\n').map(line => JSON.parse(line));
  const report = () => {
    const folder = path.join(f.source, '.local/verification/acceptance');
    const runs = readdirSync(folder);
    assert.equal(runs.length, 1);
    return JSON.parse(readFileSync(path.join(folder, runs[0], 'report.json')));
  };
  return { ...f, env, calls, report };
}

for (const failure of ['', 'build', 'startup', 'checks', 'cleanup']) {
  test(`FLOW-11 container lifecycle records ${failure || 'success'} and cleans only its own project`, t => {
    const f = lifecycle(t, failure);
    const result = spawnSync('sh', ['scripts/acceptance.sh'], { cwd: f.source, env: f.env, encoding: 'utf8' });
    assert.equal(result.status, failure ? 1 : 0, result.stdout + result.stderr);
    assert.equal(f.report().status, failure ? 'failed' : 'passed');
    const calls = f.calls(), cleanups = calls.filter(args => args.includes('down'));
    assert.equal(cleanups.length, failure === 'build' ? 0 : 1);
    for (const args of calls.filter(args => args[0] === 'compose' && !args.includes('version'))) {
      assert.match(args[args.indexOf('-p') + 1], /^newsclaw-acceptance-/);
      assert.ok(args.includes('/dev/null'));
    }
    assert.equal(readFileSync(path.join(f.source, 'README.md'), 'utf8'), 'original\n');
  });
}

test('FLOW-11 interrupted acceptance saves failure and cleans its test project', async t => {
  const f = lifecycle(t);
  const ready = path.join(f.directory, 'ready');
  const child = spawn('sh', ['scripts/acceptance.sh'], { cwd: f.source, env: { ...f.env, WAIT_CHECKS: ready }, stdio: 'ignore' });
  const finished = once(child, 'exit');
  const until = Date.now() + 5000;
  while (!existsSync(ready) && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 10));
  assert.ok(existsSync(ready), 'test boundary did not start');
  child.kill('SIGTERM');
  const [code] = await finished;
  assert.notEqual(code, 0);
  assert.equal(f.report().status, 'failed');
  assert.equal(f.calls().filter(args => args.includes('down')).length, 1);
});

test('FLOW-11 unavailable cleanup and finalizer replace a passed summary while preserving check data', t => {
  const f = lifecycle(t, 'daemon');
  const result = spawnSync('sh', ['scripts/acceptance.sh'], { cwd: f.source, env: f.env, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.equal(f.report().status, 'failed');
  const directory = path.join(f.source, '.local/verification/acceptance');
  const run = path.join(directory, readdirSync(directory)[0]);
  assert.equal(JSON.parse(readFileSync(path.join(run, 'checks-before-finalize.json'))).status, 'passed');
  assert.match(readFileSync(path.join(run, 'index.html'), 'utf8'), /清理|cleanup/);
});
