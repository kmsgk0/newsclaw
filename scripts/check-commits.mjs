import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { git } from './check-repository.mjs';

export function checkCommits(root, baseRef = 'main', headRef = 'HEAD') {
  const resolve = ref => git(root, 'rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`).trim();
  const head = resolve(headRef);
  const base = git(root, 'merge-base', resolve(baseRef), head).trim();
  const commits = git(root, 'rev-list', '--reverse', '--no-merges', `${base}..${head}`).trim().split('\n').filter(Boolean);
  const errors = [];
  for (const commit of commits) {
    const body = git(root, 'show', '-s', '--format=%B', commit);
    const label = commit.slice(0, 8);
    if (!/^[a-z]+(?:\([^)\n]+\))?!?: \S[^\n]*/.test(body)) errors.push(`${label}: title must use Conventional Commits`);
    const names = [...body.matchAll(/^OpenSpec:\s*([^\r\n]+)$/gm)].map(m => m[1].trim());
    if (!names.length) { errors.push(`${label}: missing OpenSpec reference`); continue; }
    const files = git(root, 'ls-tree', '-r', '--name-only', commit, '--', 'openspec/changes').trim().split('\n');
    const requirements = new Set();
    const tasks = new Set();
    for (const name of names) {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) { errors.push(`${label}: invalid OpenSpec name ${name}`); continue; }
      const active = `openspec/changes/${name}/`;
      const roots = [active, `openspec/changes/archive/${name}/`].filter(dir => files.includes(dir + 'proposal.md'));
      if (roots.length !== 1) { errors.push(`${label}: missing change or ambiguous archive: ${name}`); continue; }
      const change = roots[0];
      const specFiles = files.filter(f => f.startsWith(change + 'specs/') && f.endsWith('/spec.md'));
      const missing = ['proposal.md', 'design.md', 'tasks.md'].filter(f => !files.includes(change + f));
      if (missing.length || !specFiles.length) {
        errors.push(`${label}: incomplete change ${name}: ${[...missing, ...(!specFiles.length ? ['specs'] : [])].join(', ')}`);
        continue;
      }
      for (const spec of specFiles) {
        for (const m of git(root, 'show', `${commit}:${spec}`).matchAll(/^### Requirement: ([A-Z][A-Z0-9]*-\d+)\b/gm)) requirements.add(m[1]);
      }
      for (const m of git(root, 'show', `${commit}:${change}tasks.md`).matchAll(/^- \[[^\]]*\]\s+(\d+\.\d+)\b/gm)) tasks.add(m[1]);
    }
    const references = [...body.matchAll(/^(Requirements|Tasks):\s*([^\r\n]+)$/gm)];
    if (!references.length) errors.push(`${label}: missing Requirements or Tasks reference`);
    for (const [, kind, values] of references) {
      for (const value of values.split(',').map(s => s.trim())) {
        if (!(kind === 'Requirements' ? requirements : tasks).has(value)) errors.push(`${label}: unknown ${kind} reference ${value}`);
      }
    }
  }
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(`Commit references passed: ${commits.length} non-merge commits, base ${base}, head ${head}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    const options = { '--base': 'main', '--head': 'HEAD' };
    for (let i = 0; i < args.length; i += 2) {
      if (!Object.hasOwn(options, args[i]) || !args[i + 1]) throw new Error('Usage: npm run check:commits -- [--base <ref>] [--head <ref>]');
      options[args[i]] = args[i + 1];
    }
    checkCommits(git(process.cwd(), 'rev-parse', '--show-toplevel').trim(), options['--base'], options['--head']);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
