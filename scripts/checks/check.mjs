import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const options = { '--base': 'main', '--head': 'HEAD' };
for (let i = 0; i < args.length; i += 2) {
  if (!Object.hasOwn(options, args[i]) || !args[i + 1]) {
    console.error('Usage: npm run check -- [--base <ref>] [--head <ref>]');
    process.exit(1);
  }
  options[args[i]] = args[i + 1];
}
const checks = [
  ['check:specs'],
  ['check:repo', '--base', options['--base']],
  ['check:commits', '--base', options['--base'], '--head', options['--head']],
  ['test:checks'],
  ['check:security'],
  ['test:security'],
];
for (const [name, ...flags] of checks) {
  console.log(`\nRunning ${name}`);
  const result = spawnSync('npm', ['run', name, ...(flags.length ? ['--', ...flags] : [])], {
    stdio: 'inherit', env: { ...process.env, OPENSPEC_TELEMETRY: '0' },
  });
  if (result.error) console.error(result.error.message);
  if (result.error || result.status !== 0) process.exit(result.status || 1);
}
console.log('\nAll repository checks passed.');
