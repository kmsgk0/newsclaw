# 仓库检查

`npm run check` 覆盖 OpenSpec、仓库文档、提交的规约引用、安全及工具测试，不依赖业务服务或模型调用。`make check` 先运行这一仓库检查，再执行应用静态、类型、行为及服务端构建检查；数据库与 Redis 需按运行说明准备。本地与 GitHub Actions 复用同一套单项 npm 命令，需求依据见[开发流程规格](../openspec/specs/contribution-workflow/spec.md)。

## 准备与运行

需要 Node.js 24 或以上版本、npm、Git 和 Gitleaks 8.30.1；CI 使用 Node.js 24。安装锁文件中的依赖后运行：

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check -- --base main
```

Gitleaks 使用 PATH 中的同名程序，也可以通过环境变量指定已安装的二进制：

```sh
export GITLEAKS_BIN="$PWD/.local/tools/gitleaks"
npm run check -- --base main
```

从 [Gitleaks 8.30.1 发布页](https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1)下载对应平台的压缩包与 checksums 文件，核对 SHA-256 后解压到 PATH 或 `.local/tools/`。macOS Apple Silicon 对应 `darwin_arm64`，CI 使用 `linux_x64`。版本不符或工具缺失时检查会明确失败。

| 命令 | 内容 |
| --- | --- |
| `make check` | 顺序执行仓库检查和全部应用检查，各阶段一次，首个失败即停止 |
| `npm run check -- --base main` | 仅执行规格、文件、提交、安全检查及工具测试，首个失败即停止 |
| `npm run check:specs` | OpenSpec 严格校验 |
| `npm run check:repo -- --base main` | 本地文档链接、图片、锚点、冲突标记和 diff 空白错误 |
| `npm run check:commits -- --base main --head HEAD` | 变更提交的格式及规约引用 |
| `npm run test:checks` | 文件与提交检查的行为测试 |
| `npm run check:security` | Git 历史与当前文件的密钥扫描、全部依赖审计 |
| `npm run test:security` | 安全检查的行为测试，需要 Gitleaks |
| `npm run lint`、`npm run typecheck` | 应用静态与类型检查 |
| `npm test` | 业务规则与集成测试 |
| `npm run build` | 服务端编译 |

直接依赖固定版本，间接依赖由 `package-lock.json` 锁定。OpenSpec（MIT）负责规格校验，markdown-it（MIT）解析 Markdown，github-slugger（ISC）生成 GitHub 标题锚点。Gitleaks（MIT）作为独立 CLI 使用。

模型调用记录按[SEC-07](security-checks.md#sec-07-调用记录可追溯)检查，完整输出保存在 `.local/verification/`。

## 文件检查

检查 Git 已跟踪和未被忽略的新文件，包含 `.agents/skills/` 中的文档。支持行内与引用式链接、图片、重复标题生成的锚点和 HTML 中显式的 `id` / `name`。代码块及行内代码中的示例不作为链接处理，外部 URL 不发送网络请求。

本地目标须在仓库内。文件链接不能依赖被忽略的本机材料，目录链接检查目录是否存在；非 Markdown 文件的片段不检查。检查失败时输出源文件、目标或锚点。diff 检查使用指定基线与 HEAD 的共同祖先，覆盖已提交、暂存、未暂存和未忽略的新文件。

## 提交与规约引用

提交范围为 base 与 head 的共同祖先之后、到 head 为止的非合并提交。默认值为 `main` 与 `HEAD`，无法解析的引用直接报错。只有 Spec 的提交同样可以通过，任务无需提前勾选。

标题使用 Conventional Commits，正文写明变更及需求或任务编号：

```text
ci: add repository checks

OpenSpec: 2026-11-05-contribution-workflow
Requirements: FLOW-06, FLOW-07, FLOW-08, FLOW-09, FLOW-10
```

也可以使用 `Tasks: 3.1, 3.2`。多项编号用逗号分隔；涉及多个变更时各写一行 `OpenSpec:`，编号须能在这些变更中找到。

检查读取每笔提交当时的文件树，核对对应变更的提案、设计、规格和任务是否齐全，再检查编号。活动路径为 `openspec/changes/<变更名>/`，归档路径为 `openspec/changes/archive/<变更名>/`。后续补写的文件不会使此前缺少规约的提交通过。需求是否覆盖实际改动，按[开发指南](../CONTRIBUTING.md)对照场景和 diff 检查。

## 安全检查

Gitleaks 扫描本地所有可达 Git 引用的历史，以及当前已跟踪和未忽略文件的快照，输出完全脱敏。被忽略的本机配置、依赖目录和临时材料不进入默认文件快照。

构建产物或运行日志需要检查时，显式传入路径：

```sh
node scripts/checks/check-security.mjs dist .local/runtime.log
```

额外路径不存在时失败。该命令随后执行 `npm audit --audit-level=high`，包含开发依赖；高危及严重漏洞返回非零，其他等级按实际审计结果显示。扫描工具或审计服务不可用时报告失败，不跳过检查。

工具测试使用临时 Git 仓库和合成密钥，检查当前文件、历史记录、忽略文件及输出脱敏。依赖审计的异常用例使用可控进程替身；正常安全检查调用真实 npm 审计服务。

业务身份、权限和风险检查见[安全检查方法](security-checks.md)。正式结果与脱敏证据通过[报告索引](../reports/README.md)查阅，报告注明版本、范围、命令和实际结果。

## GitHub Actions

[PR workflow](../.github/workflows/pr-checks.yml)在面向 `main` 的 PR 创建、提交更新和重新打开时运行，仅申请 `contents: read` 权限。

- `Repository checks`：安装依赖，执行规格、文件、提交引用检查及对应测试。
- `Security checks`：安装依赖与校验过的 Gitleaks，执行密钥扫描、依赖审计及对应测试。
- `Application checks`：启动隔离 PostgreSQL 与 Redis，运行应用类型、静态、行为检查，使用本地 HTTP 模型替身。

Makefile 编排完整检查，`scripts/checks/check.mjs` 保留仓库检查清单。`make check-security`、`make test` 分别调用对应单项 npm 命令；`make backup` 调用 Docker Compose 备份命令。应用检查环境见 [运行说明](runtime.md)，结果见[检查报告](../reports/README.md)。 正式报告保留关键输出；完整运行记录写入 `.local/verification/`，不进入 Git。

文件与规格检查使用 GitHub 默认检出的合并结果。提交检查显式读取事件中的 base、head SHA，排除平台生成的合并提交。各任务的状态和日志保留在 Actions 中；失败步骤显示原因，修正后更新 PR 即可重新检查。
