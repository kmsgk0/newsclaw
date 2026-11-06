import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { git, projectFiles } from './check-repository.mjs';

const version = '8.30.1';
export function scanSecrets(root, extraPaths = [], { quiet = false } = {}) {
  const binary = process.env.GITLEAKS_BIN || 'gitleaks';
  const installed = spawnSync(binary, ['version'], { encoding: 'utf8' });
  if (installed.error || installed.status !== 0 || installed.stdout.trim().replace(/^v/, '') !== version) {
    throw new Error(`Gitleaks ${version} is required. Set GITLEAKS_BIN to the installed binary; see docs/checks.md.`);
  }
  function scan(args, label) {
    const result = spawnSync(binary, [...args, '--redact=100', '--no-banner', '--verbose', '--exit-code', '9'], {
      cwd: root, encoding: 'utf8', stdio: quiet ? 'pipe' : 'inherit',
    });
    if (result.status === 9) throw new Error(`Gitleaks findings in ${label}; review the redacted scanner output.`);
    if (result.error || result.status !== 0) throw new Error(`Gitleaks could not scan ${label}; check the tool error.`);
  }
  scan(['git', '--log-opts=--all', root], 'Git history');
  const snapshot = mkdtempSync(path.join(tmpdir(), 'newsclaw-secret-scan-'));
  try {
    for (const name of projectFiles(root)) {
      const target = path.join(snapshot, name);
      mkdirSync(path.dirname(target), { recursive: true });
      cpSync(path.join(root, name), target);
    }
    scan(['dir', snapshot], 'current repository files');
  } finally { rmSync(snapshot, { recursive: true, force: true }); }
  for (const source of extraPaths) {
    const resolved = path.resolve(root, source);
    if (!existsSync(resolved)) throw new Error(`Requested security scan path does not exist: ${source}`);
    scan(['dir', resolved], `additional path ${source}`);
  }
  if (!quiet) console.log('Secret scan passed for reachable Git history and tracked/unignored current files.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const root = git(process.cwd(), 'rev-parse', '--show-toplevel').trim();
    scanSecrets(root, process.argv.slice(2));
    const audit = spawnSync('npm', ['audit', '--audit-level=high'], { cwd: root, stdio: 'inherit' });
    if (audit.error || audit.status !== 0) throw new Error('Dependency audit failed or was unavailable; inspect npm audit output.');
    console.log('Dependency audit passed for the current lockfile, including development tools.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
