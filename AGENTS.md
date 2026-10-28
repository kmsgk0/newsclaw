# NewsClaw

NewsClaw 是个性化 AI 新闻阅读平台。资讯中心提供共同内容，专属编辑结合兴趣、记忆与技能处理新闻，专题保存阅读成果并持续跟进更新。

## 需求与设计

使用 OpenSpec 管理功能需求。当前功能定义见 [项目基础能力变更](openspec/changes/2026-10-28-newsclaw-foundation/proposal.md)，技术设计见同目录 [design.md](openspec/changes/2026-10-28-newsclaw-foundation/design.md)。变更中的规格描述目标行为，实施状态以 `tasks.md` 为准；`openspec/specs/` 保存实施验收后归档的现行规格。

改动前读取相关需求和 Scenario，按 `tasks.md` 的依赖顺序执行。完成对应实现与验证后才勾选任务；结构校验不能替代行为验收。功能未实施完毕时保留活动变更，完成后再同步和归档。

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

改变上述合同应同步相关规格、设计、任务及测试。规则冲突先核对需求；有必要的例外直接写入对应规范及适用条件。

## 工具与工作流

使用 OpenSpec 1.14.3。未安装全局 CLI 时，可用 `npx --yes --package @fission-ai/openspec@1.14.3 openspec` 执行下列命令。

```sh
openspec status --change 2026-10-28-newsclaw-foundation
openspec validate --all --strict --no-interactive
```

OpenSpec 工作流技能位于 `.agents/skills/openspec-*/`。补测试使用 [newsclaw-test](.agents/skills/newsclaw-test/SKILL.md)，发布与恢复使用 [newsclaw-release](.agents/skills/newsclaw-release/SKILL.md)。调用工作流时仍以当前请求授权的范围为准。

业务实现建立后，统一提供 `npm run lint`、`npm run typecheck`、`npm test`、`npm run test:api`、`npm run test:e2e` 和 `npm run build`，并在 README 说明配置及运行方法；命令可用性须由实际执行确认。

## 协作

主分支为 `main`，实现应保持可启动。功能改动关联 OpenSpec 变更，名称采用日期和小写英文短名。提交使用 Conventional Commits，并说明对应能力；通过相关检查后合入主分支。
