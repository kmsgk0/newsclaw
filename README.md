# NewsClaw

个性化 AI 新闻阅读平台。将不同来源的资讯整理到一起，由专属 AI 编辑结合阅读兴趣提供新闻解读、个人日报和持续跟进。

当前仓库包含完整产品规划、工程规范与自动检查工具，应用功能尚未实现。

## 功能规划

- **资讯中心**：多来源聚合、筛选、摘要、翻译、事件整理、搜索和收藏，保留报道来源。
- **专属编辑**：带来源的新闻问答、个人日报、长期记忆、编辑手记和站内更新提醒。
- **技能广场**：通俗解读、多源对比、专题简报、思维导图和双语阅读，支持安装、修改、启停与分享。
- **热点与专题**：热点趋势、事件时间线、私人笔记、新闻知识图谱及阅读成果保存与分享。

## 技术选型

- 前端：React Router、TypeScript、Tailwind CSS。
- 后端与数据：Node.js、Fastify、PostgreSQL。
- AI 与运行：远程模型 API、MCP 工具、Redis + BullMQ 后台任务、Docker Compose。

## 项目文档

| 内容 | 入口 |
| --- | --- |
| 目标与完整需求 | [产品规划与能力索引](docs/product/README.md) |
| 架构与数据关系 | [总体设计](docs/product/design.md) |
| 实施安排与后续任务 | [实施路线图](docs/product/roadmap.md) |
| 已交付合同与当前变更 | [现行规格](openspec/specs/)、[变更目录](openspec/changes/) |
| 开发规则与工程规范 | [AGENTS.md](AGENTS.md#工程规范入口) |
| 规约、实施、验证与开发记录 | [开发指南](CONTRIBUTING.md) |
| 模型行为与评测样例 | [AI 应用规范](docs/standards/ai.md)、[AI 评测样例](docs/evaluation/ai-cases.md) |
| 数据管理与变更检查 | [数据规范](docs/standards/data.md)、[评审与完成定义](docs/standards/review.md) |
| 本地与 PR 自动检查 | [仓库检查](docs/checks.md) |

## 查看与校验

安装 Node.js 20.19.0 或以上版本后，可以克隆仓库并安装检查工具：

```sh
git clone https://github.com/kmsgk0/newsclaw.git
cd newsclaw
npm ci --ignore-scripts --no-audit --no-fund
npm run check:specs
```

完整检查使用 `npm run check -- --base main`，需先准备 Gitleaks；安装方式、各检查项及失败处理见[仓库检查](docs/checks.md)。面向 `main` 的 PR 自动执行仓库检查和安全检查。

## 协作

按[开发指南](CONTRIBUTING.md)准备规约、完成实现和验证，并同步任务状态；全部任务完成后整理现行规格与归档材料。提交使用 Conventional Commits，说明改动及对应规约。环境配置、运行数据和生成型测试产物不进入版本管理，依赖锁文件与无密钥配置示例需要保留；任务要求的脱敏评审与运行记录按指定位置保存。
