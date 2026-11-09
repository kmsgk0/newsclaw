# 检查与自动验收

完整验收使用 Docker Compose 和系统 shell。验收镜像提供 Node、Git、Gitleaks 和 Chromium，自动准备专用 PostgreSQL、Redis 及测试配置，执行现有检查并生成报告。应用的日常启动见[运行说明](../runtime.md)。

## 一键验收

在仓库根目录执行：

```sh
sh scripts/acceptance.sh
```

首次运行构建工具镜像并下载依赖，后续复用镜像缓存。普通 checkout 和 Git worktree 使用相同入口，未提交的公开文件也参与检查；本地 `.env`、缓存与历史验收材料不进入运行副本。测试使用 HTTP 信源和模型替身，无需配置真实模型凭据。

入口为本轮创建独立 Compose 项目，不映射服务端口到宿主。结束或中断后清理本轮容器和数据卷，保留报告；已有应用服务和数据库保持运行。失败返回非零，后续阶段标记未执行。终端显示当前阶段和报告位置。

每轮产物保存于 `.local/verification/acceptance/<运行标识>/`：

| 文件 | 用途 |
| --- | --- |
| `index.html` | 可直接打开的 NewsClaw 验收汇总，含阶段、业务用例、需求编号和异步数据 |
| `report.json` | 本轮版本、状态、命令、耗时与实际用例结果 |
| `logs/`、`infrastructure.log` | 检查阶段及构建、启动、清理的完整日志 |
| `browser/`、`browser-results/` | Playwright 详细报告、截图与失败轨迹 |
| `review.md` | 执行时的正式代码审查记录，保留已登记问题 |
| `usage-recording.json` | SEC-07 正常与结构失败调用的预期用量、日志用量和消息用量 |

报告按账号、新闻、个人编辑、技能、专题、运行及工程检查整理用例。搜索支持需求编号、名称和文件；浏览器的不同视口保留各自执行结果。自动结果针对本轮检查，已登记问题仍见[代码审查](code-review.md)。生成材料全部由 Git 忽略，命令不改写 `reports/` 的正式报告。

提交检查默认以 `main` 和 `HEAD` 为范围，其他基线可以显式传入：

```sh
sh scripts/acceptance.sh --base main --head HEAD
```

已有 Make 的开发环境也可以使用 `make acceptance`，与 shell 入口相同。

## 开发检查

开发环境可直接运行单项命令。需要 Node.js 24 或更新版本、npm、Git 和 Gitleaks 8.30.1；应用检查另需 PostgreSQL、Redis、测试配置和 Chromium。安装及本地服务说明见[运行说明](../runtime.md)。

```sh
npm ci --ignore-scripts --no-audit --no-fund
npx playwright install chromium --only-shell
npm run check -- --base main
```

Gitleaks 使用 PATH 中的同名程序，也支持 `GITLEAKS_BIN`。从 [Gitleaks 8.30.1 发布页](https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1)下载对应平台压缩包与 checksums 文件，核对 SHA-256 后解压。macOS Apple Silicon 使用 `darwin_arm64`，Linux 使用对应架构；版本不符或工具缺失明确失败。

| 命令 | 内容 |
| --- | --- |
| `make check` | 执行完整阶段清单，每阶段一次，首个失败即停止 |
| `npm run check -- --base main` | 仅执行仓库、安全与工具检查 |
| `npm run check:specs` | OpenSpec 严格校验 |
| `npm run check:repo -- --base main` | 文档链接、图片、锚点、冲突标记和 diff 空白错误 |
| `npm run check:commits -- --base main --head HEAD` | 提交格式与规约引用 |
| `npm run test:checks` | 仓库检查、编排、容器入口和报告工具用例 |
| `npm run check:security`、`make check-security` | 密钥扫描与全部依赖审计 |
| `npm run test:security` | 安全工具用例 |
| `npm run lint`、`npm run typecheck` | 应用静态与类型检查 |
| `npm test`、`npm run test:api` | 业务规则与集成测试、实际 HTTP 和队列进程检查 |
| `npm run build` | 服务端与前端构建 |
| `npm run test:e2e` | 桌面、平板和手机浏览器流程 |
| `node scripts/checks/check.mjs --stage usage` | SEC-07 正常与结构失败调用的用量保存检查 |

`scripts/checks/stages.mjs` 是唯一检查清单，npm、Make、容器及 CI 调用 `scripts/checks/check.mjs`。单项命令选择同一阶段，不重复维护断言和执行顺序。Node 使用测试事件采集结果，Playwright 输出 JSON 与原生 HTML；阶段日志保留原始诊断。

SEC-07 用量检查默认包含在 Docker 验收、`make check` 和 CI 的 application 组中，也可通过上表的 usage 阶段单独执行。复用 `tests/evaluation/usage-recording.ts` 和本地 HTTP 模型替身，分别检查正常与结构失败时的用量，不调用真实模型。当前结构失败场景未保存已返回的用量，因此阶段及整轮验收失败，退出码为 1；报告中显示两个场景的实际结果，附件保留本轮 `usage-recording.json`。判据见[首次 SEC-07 记录](../../reports/security-precheck.md#sec-07-失败调用用量)。

单项执行需要保存报告时设置 `VERIFICATION_DIR`；直接运行 `node --import tsx tests/evaluation/usage-recording.ts` 也保留原入口，未设置 `VERIFICATION_DIR` 时使用 `EVALUATION_DIR` 或 `.local/verification/`。真实模型评测单独启用，方法见[AI 样例](ai-cases.md)。

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

检查读取每笔提交当时的文件树，核对对应变更的提案、设计、规格和任务是否齐全，再检查编号。活动路径为 `openspec/changes/<变更名>/`，归档路径为 `openspec/changes/archive/<变更名>/`。后续补写的文件不会使此前缺少规约的提交通过。需求是否覆盖实际改动，按[开发指南](../../CONTRIBUTING.md)对照场景和 diff 检查。

## 安全检查

Gitleaks 扫描本地所有可达 Git 引用的历史，以及当前已跟踪和未忽略文件的快照，输出完全脱敏。被忽略的本机配置、依赖目录和临时材料不进入默认文件快照。

构建产物或运行日志需要检查时，显式传入路径：

```sh
node scripts/checks/check-security.mjs dist .local/runtime.log
```

额外路径不存在时失败。该命令随后执行 `npm audit --audit-level=high`，包含开发依赖；高危及严重漏洞返回非零，其他等级按实际审计结果显示。扫描工具或审计服务不可用时报告失败，不跳过检查。

工具测试使用临时 Git 仓库和合成密钥，检查当前文件、历史记录、忽略文件及输出脱敏。依赖审计的异常用例使用可控进程替身；正常安全检查调用真实 npm 审计服务。

业务身份、权限和风险检查见[安全检查方法](security.md)。正式结果与脱敏证据通过[报告索引](../../reports/README.md)查阅，报告注明版本、范围、命令和实际结果。

## GitHub Actions

[PR workflow](../../.github/workflows/pr-checks.yml)在面向 main 的 PR 创建、更新和重新打开时运行，只申请 `contents: read`。三个任务分别调用同一清单中的 repository、security 和 application 组。应用任务使用隔离 PostgreSQL、Redis 和 HTTP 模型替身。

文件与规格检查使用合并结果。提交检查显式使用事件中的 base、head SHA，仅核对开发者提交。各组结果分别显示，失败返回非零；完整本地验收使用相同阶段实现。正式记录见[报告索引](../../reports/README.md)。
