import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, renameSync, rmSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fixture, addSpec, message, runScript, changeName, changePath, project } from './test-helpers.mjs';

function passed(result) {
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
}
function failed(result, expected) {
  assert.ifError(result.error);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, expected);
}
const docs = f => runScript('check-repository.mjs', f, ['--base', f.base]);
const commits = (f, head = 'HEAD') => runScript('check-commits.mjs', f, ['--base', f.base, '--head', head]);

test('FLOW-07 valid links, images, duplicate heading anchors and hidden documents pass', t => {
  const f = fixture(t);
  f.put('README.md', '# Fixture\n\n[guide][g]\n\n[g]: docs/guide.md#状态\n\n[duplicate](docs/guide.md#状态-1)\n\n![image](docs/image.svg)\n\n`[example](absent.md)`\n\n```md\n[example](absent.md)\n```\n');
  f.put('docs/guide.md', '# Guide\n\n## 状态\n\n## 状态\n');
  f.put('docs/image.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>');
  f.put('.agents/skills/example/SKILL.md', '[guide](../../../docs/guide.md#状态)\n');
  passed(docs(f));
});
for (const [name, file, content, error] of [
  ['hidden broken link', '.agents/skills/example/SKILL.md', '[missing](missing.md)\n', /missing target/],
  ['missing anchor', 'README.md', '# Fixture\n\n[missing](#missing)\n', /missing anchor/],
  ['conflict marker', 'README.md', '# Fixture\n' + '<'.repeat(7) + ' HEAD\n', /conflict marker/],
  ['untracked whitespace error', 'new.md', '# New \t\n', /whitespace/],
  ['parent directory link', 'README.md', '[parent](..)\n', /missing target|outside/],
  ['outside link', 'README.md', '[outside](../outside.md)\n', /missing target|outside/],
]) {
  test(`FLOW-07 rejects ${name}`, t => {
    const f = fixture(t); f.put(file, content); failed(docs(f), error);
  });
}
test('FLOW-07 rejects a link whose target exists only in ignored files', t => {
  const f = fixture(t);
  f.put('.gitignore', 'local.md\n');
  f.put('local.md', '# Local\n');
  f.put('README.md', '[local](local.md)\n');
  failed(docs(f), /not a repository file/);
});
test('FLOW-07 rejects a local link that resolves outside the repository through a symlink', t => {
  const f = fixture(t);
  const outside = fixture(t);
  symlinkSync(path.join(outside.root, 'README.md'), path.join(f.root, 'external.md'));
  f.put('README.md', '[external](external.md)\n');
  failed(docs(f), /outside/);
});
test('FLOW-07 the real OpenSpec validator rejects a requirement without a scenario', t => {
  const f = fixture(t);
  f.put('openspec/specs/example/spec.md', '# Example\n\n## Purpose\n\nThis example documents the observable behavior of a small test fixture.\n\n## Requirements\n\n### Requirement: Example\n\nThe system SHALL accept valid input.\n');
  const result = spawnSync(path.join(project, 'node_modules/.bin/openspec'), ['validate', '--all', '--strict', '--no-interactive'], { cwd: f.root, encoding: 'utf8', env: { ...process.env, OPENSPEC_TELEMETRY: '0' } });
  failed(result, /scenario/i);
});
test('FLOW-08 specification and implementation commits resolve requirements and task references', t => {
  const f = fixture(t); addSpec(f);
  f.git('add', '--', 'openspec'); f.commit(message());
  f.put('README.md', '# Updated\n'); f.git('add', '--', 'README.md');
  f.commit(message('docs: use example', 'Tasks: 1.1'));
  passed(commits(f));
});
test('FLOW-08 archived change references remain valid', t => {
  const f = fixture(t); addSpec(f);
  f.git('add', '--', 'openspec'); f.commit(message());
  const dest = path.join(f.root, 'openspec/changes/archive', changeName);
  mkdirSync(path.dirname(dest), { recursive: true });
  renameSync(path.join(f.root, changePath), dest);
  f.git('add', '--', 'openspec'); f.commit(message('docs: archive example'));
  passed(commits(f));
});
for (const [name, commitMessage, error] of [
  ['missing reference', 'docs: change example', /OpenSpec/],
  ['unknown requirement', message('docs: change example', 'Requirements: EX-99'), /EX-99/],
  ['unknown task', message('docs: change example', 'Tasks: 9.9'), /9\.9/],
  ['invalid title', message('update'), /Conventional/],
]) {
  test(`FLOW-08 rejects ${name}`, t => {
    const f = fixture(t); addSpec(f);
    f.git('add', '--', 'openspec'); f.commit(commitMessage);
    failed(commits(f), error);
  });
}
test('FLOW-08 adding specs later cannot validate an earlier implementation commit', t => {
  const f = fixture(t);
  f.put('README.md', '# Implementation\n'); f.git('add', '--', 'README.md'); f.commit(message('feat: implement example'));
  addSpec(f); f.git('add', '--', 'openspec'); f.commit(message());
  failed(commits(f), /missing change|incomplete change/);
});
test('FLOW-08 rejects incomplete planning artifacts and invalid bases', t => {
  const f = fixture(t); addSpec(f);
  rmSync(path.join(f.root, changePath, 'design.md'));
  f.git('add', '--', 'openspec'); f.commit(message());
  failed(commits(f), /design\.md|incomplete change/);
  failed(runScript('check-commits.mjs', f, ['--base', 'does-not-exist']), /base|revision|commit/i);
});
test('FLOW-06 platform merge commits are excluded while developer commits are checked', t => {
  const f = fixture(t); addSpec(f);
  f.git('add', '--', 'openspec'); f.commit(message());
  const parent = f.git('rev-parse', 'HEAD');
  const tree = f.git('rev-parse', 'HEAD^{tree}');
  const merge = f.git('commit-tree', tree, '-p', parent, '-p', f.base, '-m', 'Merge pull request');
  passed(commits(f, merge));
});
