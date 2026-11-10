import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function createStages({ base = 'main', head = 'HEAD' } = {}) {
  const node = (id, name, group, args, result) => ({ id, name, group, command: process.execPath, args, ...(result ? { result } : {}) });
  const toolTests = readdirSync(fileURLToPath(new URL('.', import.meta.url)))
    .filter(name => /^test-.*\.mjs$/.test(name) && !['test-helpers.mjs', 'test-security.mjs'].includes(name))
    .sort().map(name => `scripts/checks/${name}`);
  return [
    node('specs', 'OpenSpec 规格', 'repository', ['node_modules/@fission-ai/openspec/bin/openspec.js', 'validate', '--all', '--strict', '--no-interactive']),
    node('files', '仓库文件与链接', 'repository', ['scripts/checks/check-repository.mjs', '--base', base]),
    node('commits', '提交规约引用', 'repository', ['scripts/checks/check-commits.mjs', '--base', base, '--head', head]),
    node('check-tools', '检查工具行为', 'repository', ['--test', ...toolTests], 'node'),
    node('security', '密钥与依赖', 'security', ['scripts/checks/check-security.mjs']),
    node('security-tools', '安全工具行为', 'security', ['--test', 'scripts/checks/test-security.mjs'], 'node'),
    node('lint', '代码检查', 'application', ['node_modules/eslint/bin/eslint.js', 'src', 'tests', 'apitest', 'vite.config.ts', 'playwright.config.ts']),
    node('types', '类型检查', 'application', ['node_modules/typescript/bin/tsc', '--noEmit']),
    node('unit', '业务与集成测试', 'application', ['--import', 'tsx', '--test', 'tests/**/*.test.ts'], 'node'),
    node('api', 'HTTP 与任务恢复', 'application', ['--import', 'tsx', '--test', '--test-concurrency=1', 'apitest/cases/*.test.ts'], 'node'),
    node('server-build', '服务端构建', 'application', ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.server.json']),
    node('web-build', '网页构建', 'application', ['node_modules/vite/bin/vite.js', 'build']),
    node('browser', '浏览器阅读流程', 'application', ['node_modules/@playwright/test/cli.js', 'test'], 'playwright'),
    node('usage', 'SEC-07 模型调用用量', 'application', ['--import', 'tsx', '--test', 'tests/evaluation/usage-recording.ts'], 'node'),
  ];
}

export function selectStages(stages, { group = 'repository,security', stage } = {}) {
  if (stage) {
    const ids = stage.split(',');
    if (ids.some(id => !stages.some(s => s.id === id))) throw new Error(`Unknown check stage: ${stage}`);
    return stages.filter(s => ids.includes(s.id));
  }
  const groups = group.split(',');
  if (groups.includes('all') && groups.length === 1) return stages;
  if (groups.some(g => !['repository', 'security', 'application'].includes(g))) throw new Error(`Unknown check group: ${group}`);
  return stages.filter(s => groups.includes(s.group));
}
