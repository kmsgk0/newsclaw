# NewsClaw

个性化 AI 新闻阅读平台。将不同来源的资讯整理到一起，由专属 AI 编辑结合阅读兴趣提供新闻解读、个人日报和持续跟进。

当前仓库包含需求规约与工程规范，应用功能尚未实现。

## 功能规划

- **资讯中心**：多来源聚合、筛选、摘要、翻译、事件整理、搜索和收藏，保留报道来源。
- **专属编辑**：带来源的新闻问答、个人日报、长期记忆、编辑手记和站内更新提醒。
- **技能广场**：通俗解读、多源对比、专题简报、思维导图和双语阅读，支持安装、修改、启停与分享。
- **热点与专题**：热点趋势、事件时间线、私人笔记、新闻知识图谱及阅读成果保存与分享。

## 技术选型

- 前端：React Router、TypeScript、Tailwind CSS。
- 后端与数据：Node.js、Fastify、PostgreSQL。
- AI 与运行：远程模型 API、MCP 工具、后台任务、Docker Compose。

## 项目文档

| 内容 | 入口 |
| --- | --- |
| 目标与功能范围 | [需求提案](openspec/changes/2026-10-28-newsclaw-foundation/proposal.md) |
| 架构与数据关系 | [技术设计](openspec/changes/2026-10-28-newsclaw-foundation/design.md) |
| 能力规格与实施顺序 | [任务清单及规格索引](openspec/changes/2026-10-28-newsclaw-foundation/tasks.md) |
| 开发规则与五类工程规范 | [AGENTS.md](AGENTS.md) |

## 查看与校验

安装 Node.js 20.19.0 或以上版本后，可以克隆仓库并校验 OpenSpec 文档：

```sh
git clone https://github.com/kmsgk0/newsclaw.git
cd newsclaw
npx --yes --package @fission-ai/openspec@1.14.3 openspec validate --all --strict --no-interactive
```

## 协作

改动先对照相关需求与工程规范，通过 Pull Request 合入 `main`。提交使用 Conventional Commits；实现及对应验证完成后再勾选任务。环境配置、运行数据和测试产物不进入版本管理，依赖锁文件与无密钥配置示例需要保留。
