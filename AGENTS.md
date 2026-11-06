# NewsClaw

NewsClaw 是个性化 AI 新闻阅读平台。资讯中心提供共同内容，专属编辑结合兴趣、记忆与技能处理新闻，专题保存阅读成果并持续跟进更新。

## 需求与设计

所有仓库修改都纳入 OpenSpec，包括业务代码、页面、工具、依赖、配置、CI、文档和工程规范。完整目标需求见[产品规划](docs/product/README.md)，架构与数据关系见[总体设计](docs/product/design.md)，后续任务见[实施路线图](docs/product/roadmap.md)。活动变更只描述本轮交付范围，实施状态以该变更的 `tasks.md` 为准；`openspec/specs/` 保存已实现并验证的现行规格。

改动前读取相关产品需求、现行规格、活动变更和工程规范，确认本次内容已由提案、设计、需求场景及任务覆盖；缺少对应内容时先补齐，再开始实施。已有活动变更覆盖的内容直接沿用；新增变更从产品规划中选取可交付范围并保留需求编号，相关页面、测试和文档一起完成。需求不清或方案有重要变化时，先讨论并更新规约，普通实现细节自行处理。

对照需求检查产物，并从实际 diff 核对每项改动的规约依据。完成对应实现与规定验证后才勾选任务；当前变更的全部任务完成后同步主规格并归档。产品入口对已交付需求维护编号、摘要和现行规格链接，路线图关联相应变更，剩余目标继续保留在产品规划中。继续实施的变更有未完成内容时保留活动状态；已由产品文档完整承接的规划变更可保留原状态归档，跳过未实现规格的同步。结构校验与实际行为验证分别记录。

## 开发规则

- 前端使用 React Router、TypeScript、Tailwind CSS，后端使用 Node.js、Fastify、PostgreSQL，运行环境使用 Docker Compose。
- 路由负责身份及输入校验，服务负责业务与事务，数据访问层负责读写。外部信源、模型和 MCP 接口集中封装；接口与工具复用同一套服务及权限判断。
- 新闻与事件全站共享，私人数据按账号隔离；跨账号读取不得泄露资源存在性。不同来源的报道始终保留各自来源与发布时间。
- 复用现成依赖和实际共享逻辑。后台采用固定业务任务，技能采用说明文本与配置，图谱采用实体关系数据。
- 配置与密钥从环境读取，必需配置缺失明确失败。模型输出、新闻与技能内容均按外部输入校验。
- 任务失败保留已有成功内容，错误明确返回；同一业务操作重复执行不得产生重复新闻、日报、手记或提醒。

## 工程规范入口

| 工作内容 | 开始前读取 |
| --- | --- |
| 页面、交互、文案及展示 | [产品设计规范](docs/standards/product.md) |
| 接口、数据、任务及工具调用 | [后端开发规范](docs/standards/backend.md) |
| 账号、权限、外部输入及依赖 | [安全开发规范](docs/standards/security.md) |
| 测试与验收 | [测试规范](docs/standards/testing.md) |
| 构建、配置、发布和恢复 | [部署运维规范](docs/standards/operations.md) |
| 模型、提示词、技能执行及生成结果 | [AI 应用规范](docs/standards/ai.md)、[评测样例](docs/evaluation/ai-cases.md) |
| 数据归属、迁移及删除 | [数据规范](docs/standards/data.md) |
| 变更检查、完成判定及例外 | [评审与完成定义](docs/standards/review.md) |

改变上述合同应同步相关规格、设计、任务及测试。规则冲突先核对需求；有必要的例外直接写入对应规范及适用条件。

## 工具与工作流

项目依赖固定 OpenSpec 1.14.3。先运行 `npm ci --ignore-scripts --no-audit --no-fund` 安装工具，通过下列入口查看与校验：

```sh
npx openspec list
npm run check:specs
```

OpenSpec 工作流技能位于 `.agents/skills/openspec-*/`。补测试使用 [newsclaw-test](.agents/skills/newsclaw-test/SKILL.md)，发布与恢复使用 [newsclaw-release](.agents/skills/newsclaw-release/SKILL.md)。调用工作流时仍以当前请求授权的范围为准。

业务实现建立后，统一提供 `npm run lint`、`npm run typecheck`、`npm test`、`npm run test:api`、`npm run test:e2e` 和 `npm run build`，并在 README 说明配置及运行方法；命令可用性须由实际执行确认。

本地与 PR 自动检查见[仓库检查](docs/checks.md)。交付前运行 `npm run check -- --base main`，提交正文使用 `OpenSpec:` 及 `Requirements:` 或 `Tasks:` 关联依据。

## 文档与开发记录

README 介绍产品、实际进度与使用入口；[开发指南](CONTRIBUTING.md)维护开发方法和命令；工程规范定义各领域的实现要求与检查方式。文档面向使用者和开发者，直接说明项目内容、目标行为及使用条件，操作步骤集中维护并通过链接引用。

主分支为 `main`，实现应保持可启动。OpenSpec 变更名称采用日期和小写英文短名。提交使用 Conventional Commits，说明实际改动、对应变更及相关需求或任务。检查结果随交付说明，任务要求保存的记录按指定位置维护。
