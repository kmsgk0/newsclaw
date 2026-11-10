import { execFileSync, spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function prepareWorkspace({ source, gitDirectory, commonDirectory, target, dependencies, reports }) {
  const env = { ...process.env, GIT_OPTIONAL_LOCKS: '0' };
  for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE']) delete env[key];
  const git = (...args) => execFileSync('git', ['-c', 'safe.directory=*', '--git-dir', gitDirectory, '--work-tree', source, ...args], {
    encoding: 'utf8', env: { ...env, GIT_COMMON_DIR: commonDirectory }, stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  let branch = null;
  try { branch = git('symbolic-ref', '--quiet', '--short', 'HEAD'); } catch (error) { if (error.status !== 1) throw error; }
  const metadata = { commit: git('rev-parse', 'HEAD'), branch, dirty: Boolean(git('status', '--porcelain')) };
  const files = git('ls-files', '--cached', '--others', '--exclude-standard', '-z').split('\0').filter(Boolean);
  mkdirSync(target, { recursive: true });
  if (readdirSync(target).length) throw new Error('Acceptance workspace must be empty.');
  execFileSync('git', ['clone', '--mirror', '--no-hardlinks', commonDirectory, path.join(target, '.git')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  const localGit = (...args) => execFileSync('git', ['-C', target, '-c', 'safe.directory=*', ...args], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  localGit('config', 'core.bare', 'false');
  localGit('checkout', '--detach', metadata.commit);
  for (const entry of readdirSync(target)) if (entry !== '.git') rmSync(path.join(target, entry), { recursive: true, force: true });
  for (const name of files) {
    if (name === '.git' || /^(?:node_modules|\.local|dist|test-results|playwright-report|backups|data)\//.test(name) || /^\.env(?:$|\.)/.test(name) && name !== '.env.example') continue;
    const input = path.join(source, name);
    if (!existsSync(input)) continue;
    const destination = path.join(target, name);
    mkdirSync(path.dirname(destination), { recursive: true });
    cpSync(input, destination, { dereference: false });
  }
  symlinkSync(dependencies, path.join(target, 'node_modules'), 'dir');
  mkdirSync(reports, { recursive: true });
  writeFileSync(path.join(reports, 'source.json'), JSON.stringify(metadata, null, 2) + '\n');
  return metadata;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    prepareWorkspace({ source: '/source', gitDirectory: process.env.SOURCE_GIT_DIRECTORY, commonDirectory: '/git-source', target: '/work', dependencies: '/tools/node_modules', reports: '/reports' });
    const child = spawn(process.execPath, ['/work/scripts/checks/check.mjs', '--group', 'all', '--base', process.env.ACCEPTANCE_BASE || 'main', '--head', process.env.ACCEPTANCE_HEAD || 'HEAD'], { cwd: '/work', env: process.env, stdio: 'inherit' });
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
    child.on('error', error => { console.error(error.message); process.exitCode = 1; });
    child.on('exit', (code, signal) => { process.exitCode = code ?? (signal === 'SIGINT' ? 130 : 143); });
  } catch (error) {
    console.error(`Acceptance workspace preparation failed: ${error.message}`);
    process.exitCode = 1;
  }
}
