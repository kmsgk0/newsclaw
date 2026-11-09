# NewsClaw

个性化 AI 新闻阅读平台。将不同来源的资讯整理到一起，由专属 AI 编辑结合阅读兴趣提供新闻解读、个人日报和持续跟进。

当前提供可运行的 API 与后台 Worker。已实现能力通过接口调用，Web 阅读界面继续按产品规划开发。

## 已实现能力

- **应用基础与账号**：账号注册登录、刷新、退出和改密，编辑初始化、角色校验，以及 API、Worker、数据库迁移、任务运行和备份工具。
- **共享新闻与阅读**：多来源采集、正文整理、摘要翻译、事件关联、检索筛选、收藏、阅读记录与全站日报 API。

## 技术选型

- 前端规划：React Router、TypeScript、Tailwind CSS。
- 后端与数据：Node.js、Fastify、PostgreSQL。
- AI 与运行：远程模型 API、MCP 工具、Redis + BullMQ 后台任务、Docker Compose。

## 项目文档

| 内容 | 入口 |
| --- | --- |
| 当前接口、运行与开发说明 | [文档导航](docs/README.md) |
| 完整产品目标与未实现能力 | [产品规划](docs/product/README.md)、[路线图](docs/product/roadmap.md) |
| 架构与数据关系 | [系统架构](docs/architecture.md) |
| 已实现行为与变更任务 | [现行规格](openspec/specs/)、[变更目录](openspec/changes/) |
| 开发规则与流程 | [AGENTS.md](AGENTS.md)、[开发指南](CONTRIBUTING.md) |
| 自动检查 | [检查入口](docs/verification/checks.md) |

## 运行

准备 Docker Compose；本地开发另需 Node.js 24 或更新版本。克隆后复制配置示例，填写数据库口令及服务配置：

```sh
git clone https://github.com/kmsgk0/newsclaw.git
cd newsclaw
cp .env.example .env
# 填写 .env 中的服务地址、模型名称与凭据
docker compose up --build -d
```

API 监听 `http://localhost:3100`，`/health` 返回依赖就绪状态，`/live` 返回进程状态。注册与管理角色初始化见[账号说明](docs/modules/account.md)。

本地开发：

```sh
npm ci
docker compose up -d db redis
npm run migrate
npm run seed
npm run dev
```

另开终端运行 `npm run worker`。配置、任务与恢复见[运行说明](docs/runtime.md)。

## 检查

```sh
npm run lint
npm run typecheck
npm test
npm run test:api
npm run build
```

构建命令编译服务端。自动测试使用隔离 PostgreSQL、Redis 及可控外部服务，不调用真实模型；测试数据库账号需能创建临时数据库。完整入口为 `make check`，单独的 `npm run check -- --base main` 保持仓库检查范围；Gitleaks 与环境准备见[检查说明](docs/verification/checks.md)。

## 协作

按[开发指南](CONTRIBUTING.md)准备规约、完成实现和验证，并同步任务状态；全部任务完成后整理现行规格与归档材料。提交使用 Conventional Commits，说明改动及对应规约。环境配置、运行数据和生成型测试产物不进入版本管理，依赖锁文件与无密钥配置示例需要保留；任务要求的脱敏评审与运行记录按指定位置保存。
