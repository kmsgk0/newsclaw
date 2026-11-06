import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import MarkdownIt from 'markdown-it';
import GithubSlugger from 'github-slugger';

const markdown = new MarkdownIt('commonmark');
export function git(root, ...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}
export function projectFiles(root) {
  return [...new Set(git(root, 'ls-files', '--cached', '--others', '--exclude-standard', '-z').split('\0'))]
    .filter(name => name && existsSync(path.join(root, name)) && statSync(path.join(root, name)).isFile());
}
function plain(tokens = []) {
  return tokens.map(token => token.children ? plain(token.children) : ['text', 'code_inline'].includes(token.type) ? token.content : '').join('');
}
function anchors(text) {
  const slugger = new GithubSlugger();
  const tokens = markdown.parse(text, {});
  const found = new Set();
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type === 'heading_open') found.add(slugger.slug(plain(tokens[i + 1].children)));
    if (tokens[i].type.startsWith('html_')) {
      for (const match of tokens[i].content.matchAll(/\b(?:id|name)=["']([^"']+)["']/g)) found.add(match[1]);
    }
  }
  return found;
}
export function checkRepository(root, baseRef) {
  const baseCommit = git(root, 'rev-parse', '--verify', '--end-of-options', `${baseRef}^{commit}`).trim();
  const base = git(root, 'merge-base', baseCommit, 'HEAD').trim();
  const files = projectFiles(root);
  const changes = new Set([
    ...git(root, 'diff', '--name-only', '-z', base, '--').split('\0'),
    ...git(root, 'ls-files', '--others', '--exclude-standard', '-z').split('\0'),
  ].filter(Boolean));
  const errors = [];
  try { git(root, 'diff', '--check', base, '--'); }
  catch { errors.push('git diff contains whitespace errors or conflict markers; run git diff --check'); }
  const sourceFiles = new Set(files);
  const anchorCache = new Map();
  for (const name of files) {
    const buffer = readFileSync(path.join(root, name));
    if (buffer.includes(0)) continue;
    const text = buffer.toString('utf8');
    text.split('\n').forEach((line, index) => {
      if (/^(?:<{7}|={7}|>{7})(?: |$)/.test(line)) errors.push(`${name}:${index + 1}: conflict marker`);
      if (changes.has(name) && /[\t ]+$/.test(line) && !/^.*[^\t ] {2}$/.test(line)) {
        errors.push(`${name}:${index + 1}: trailing whitespace`);
      }
    });
    if (!name.toLowerCase().endsWith('.md')) continue;
    const tokens = markdown.parse(text, {});
    function visit(items) {
      for (const token of items) {
        const href = token.type === 'link_open' ? token.attrGet('href') : token.type === 'image' ? token.attrGet('src') : null;
        if (href && !/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href)) {
          const [rawPath, rawHash = ''] = href.split('#', 2);
          let target, hash;
          try {
            const decoded = decodeURIComponent(rawPath.split('?', 1)[0]);
            target = decoded ? path.resolve(decoded.startsWith('/') ? root : path.dirname(path.join(root, name)), decoded.replace(/^\//, '')) : path.join(root, name);
            hash = decodeURIComponent(rawHash);
          } catch { errors.push(`${name}: invalid encoded link ${href}`); continue; }
          const relative = path.relative(root, target).split(path.sep).join('/');
          if (relative.split('/')[0] === '..' || !existsSync(target)) errors.push(`${name}: missing target ${href}`);
          else if (path.relative(realpathSync(root), realpathSync(target)).split(path.sep)[0] === '..') errors.push(`${name}: target is outside the repository: ${href}`);
          else if (statSync(target).isFile() && !sourceFiles.has(relative)) errors.push(`${name}: target is not a repository file: ${href}`);
          else if (hash && target.toLowerCase().endsWith('.md')) {
            if (!anchorCache.has(target)) anchorCache.set(target, anchors(readFileSync(target, 'utf8')));
            if (!anchorCache.get(target).has(hash)) errors.push(`${name}: missing anchor ${href}`);
          }
        }
        if (token.children) visit(token.children);
      }
    }
    visit(tokens);
  }
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(`Repository checks passed: ${files.length} files, ${changes.size} changed paths, base ${base}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--base')) {
    console.error('Usage: node scripts/check-repository.mjs [--base <ref>]');
    process.exitCode = 1;
  } else {
    try {
      const root = git(process.cwd(), 'rev-parse', '--show-toplevel').trim();
      checkRepository(root, args[1] || 'main');
    } catch (error) { console.error(error.message); process.exitCode = 1; }
  }
}
