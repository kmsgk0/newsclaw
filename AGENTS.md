# NewsClaw

NewsClaw 是个性化 AI 新闻阅读平台。资讯中心提供共同内容，专属编辑结合兴趣、记忆与技能处理新闻，专题保存阅读成果并持续跟进更新。

## 需求与设计

所有仓库修改都纳入 OpenSpec，包括业务代码、页面、工具、依赖、配置、CI、文档和工程规范。[文档导航](docs/README.md)提供使用、架构和能力入口；`openspec/specs/` 保存现行行为，活动变更保存未交付目标和本轮任务，归档保存已完成阶段。

改动前读取相关规格、变更设计和适用规范，确保提案、设计、需求场景及任务覆盖实际工作。沿用已有需求编号，保留已确定功能；重要需求或方案变化先对齐，普通实现细节按现有约定处理。

实施后对照需求和 diff 检查产物，完成相应实现与必要验证后勾选任务。全部任务完成后同步主规格并归档，核对文档、测试和工具入口；未完成内容保持真实状态。具体流程见[开发指南](CONTRIBUTING.md)。

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
| 模型、提示词、技能执行及生成结果 | [AI 应用规范](docs/standards/ai.md)、[评测样例](docs/verification/ai-cases.md) |
| 数据归属、迁移及删除 | [数据规范](docs/standards/data.md) |
| 变更检查、完成判定及例外 | [评审与完成定义](docs/standards/review.md) |
| 安全自查、风险复核与检查记录 | [安全检查方法](docs/verification/security.md)、[报告索引](reports/README.md) |

改变上述合同应同步相关规格、设计、任务及测试。规则冲突先核对需求；有必要的例外直接写入对应规范及适用条件。

## 仓库职责与工具

- `src/server/` 的入口负责装配和启停，业务放在 `modules/`，任务运行能力放在 `runtime/`，模型、信源和 MCP 放在 `adapters/`。
- `src/web/` 按页面、布局与共享组件组织；共同样式和业务样式有明确位置，保持已确认的阅读与操作效果。
- `tests/` 的业务用例按对象分组，辅助环境放在 `support/`，浏览器用例放在 `e2e/`，真实模型评测放在 `evaluation/`。`apitest/` 保留真实 HTTP 与队列进程场景。
- `scripts/checks/` 保存仓库检查及其用例，`scripts/operations/` 保存备份恢复工具。`stages.mjs` 维护唯一检查清单，npm、Make、容器验收和 CI 复用同一运行入口。
- `docs/` 的说明从文档导航进入，八类规范保存实现约定，`reports/` 保存正式结果，完整运行输出放在被忽略的 `.local/verification/`。

项目依赖固定 OpenSpec 1.14.3。使用 `npx openspec list` 查看变更，`npm run check:specs` 校验规格，交付前运行 `npm run check -- --base main`。涉及应用行为时执行对应测试，完整验收入口为 `sh scripts/acceptance.sh`，开发环境可用 `make check`；环境及命令见[检查说明](docs/verification/checks.md)。

OpenSpec 工作流技能位于 `.agents/skills/openspec-*/`。补测试使用 [newsclaw-test](.agents/skills/newsclaw-test/SKILL.md)，发布与恢复使用 [newsclaw-release](.agents/skills/newsclaw-release/SKILL.md)。代码审查按[七类核查](docs/standards/review.md#七类核查)进行；权限、并发、事务和一致性保留实际依据。

## 文档与开发记录

README 介绍产品、实际进度与使用入口；[开发指南](CONTRIBUTING.md)维护开发方法和命令；工程规范定义各领域的实现要求与检查方式。文档面向使用者和开发者，直接说明项目内容、目标行为及使用条件，操作步骤集中维护并通过链接引用。

主分支为 `main`，实现应保持可启动。OpenSpec 变更名称采用日期和小写英文短名。提交使用 Conventional Commits，说明实际改动、对应变更及相关需求或任务。检查结果随交付说明，任务要求保存的记录按指定位置维护。
