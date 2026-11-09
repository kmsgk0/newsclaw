import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const scripts = path.dirname(fileURLToPath(import.meta.url));
export const project = path.resolve(scripts, "../..");
export const changeName = '2026-01-01-example';
export const changePath = `openspec/changes/${changeName}`;
export function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'newsclaw-check-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '--quiet');
  git('config', 'user.name', 'Check fixture');
  git('config', 'user.email', 'fixture@example.invalid');
  const put = (name, text) => {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  };
  const commit = (message) => git('-c', 'core.hooksPath=/dev/null', 'commit', '--quiet', '-m', message);
  put('README.md', '# Fixture\n');
  git('add', '--', 'README.md');
  commit('docs: initialize fixture');
  return { root, git, put, commit, base: git('rev-parse', 'HEAD') };
}
export function addSpec(f) {
  f.put(`${changePath}/proposal.md`, '# Proposal\n');
  f.put(`${changePath}/design.md`, '# Design\n');
  f.put(`${changePath}/specs/example/spec.md`, '# Example\n\n## Purpose\n\nThis example defines a verifiable behavior for repository checking fixtures.\n\n## ADDED Requirements\n\n### Requirement: EX-01 Example\n\nThe system SHALL accept valid input.\n\n#### Scenario: Accept input\n- **WHEN** valid input is supplied\n- **THEN** it is accepted\n');
  f.put(`${changePath}/tasks.md`, '# Tasks\n\n- [ ] 1.1 Implement and verify the example.\n');
}
export function message(title = 'docs: define example', reference = 'Requirements: EX-01') {
  return `${title}\n\nOpenSpec: ${changeName}\n${reference}`;
}
export function runScript(name, f, args = [], env = {}) {
  return spawnSync(process.execPath, [path.join(scripts, name), ...args], {
    cwd: f.root, encoding: 'utf8', env: { ...process.env, OPENSPEC_TELEMETRY: '0', ...env },
  });
}
