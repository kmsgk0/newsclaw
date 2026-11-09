# 项目文档

NewsClaw 将公共新闻、个人编辑和持续跟进组织为一个阅读空间。功能概览与快速启动见[仓库首页](../README.md)。

## 使用与开发

| 需要了解的内容 | 入口 |
| --- | --- |
| 启动、配置、任务运行、备份与恢复 | [运行说明](runtime.md) |
| 模块关系、数据和执行机制 | [架构与数据关系](architecture.md) |
| 已提供的接口与实现 | [账号](modules/account.md)、[新闻](modules/news.md)、[编辑与技能](modules/editor.md)、[专题](modules/topics.md) |
| 完整目标与后续需求 | [产品规划](product/README.md)、[路线图](product/roadmap.md) |
| 依赖的用途与许可 | [依赖说明](dependencies.md) |
| 开发、Spec、提交与归档 | [开发指南](../CONTRIBUTING.md)、[项目规则](../AGENTS.md) |
| 自动检查、安全检查及 AI 样例 | [检查入口](verification/checks.md)、[安全检查方法](verification/security.md)、[AI 评测样例](verification/ai-cases.md) |

## 能力与场景索引

现行规格维护已提供的行为、权限及失败场景；未实现的功能仍按产品目标管理。当前通过 API 使用已实现能力，网页交互仍在规划中。

| 能力 | 需求范围 | 规格 |
| --- | --- | --- |
| 账号与访问 | ACC-01 至 ACC-05 | [规格](../openspec/specs/account-access/spec.md) |
| 共享新闻库 | NEWS-01 至 NEWS-06 | [规格](../openspec/specs/news-library/spec.md) |
| 个人编辑 | EDITOR-01 至 EDITOR-06 | [规格](../openspec/specs/personal-editor/spec.md) |
| 阅读技能 | SKILL-01 至 SKILL-04 | [规格](../openspec/specs/editor-skills/spec.md) |
| 专题与洞察 | TOPIC-01 至 TOPIC-06 | [规格](../openspec/specs/topics-and-insights/spec.md) |
| 运行与恢复 | OPS-01 至 OPS-05 | [规格](../openspec/specs/runtime-operations/spec.md) |

## 工程规范

按改动内容读取[产品设计](standards/product.md)、[后端开发](standards/backend.md)、[安全](standards/security.md)、[测试](standards/testing.md)、[部署运维](standards/operations.md)、[AI 应用](standards/ai.md)、[数据](standards/data.md)和[评审](standards/review.md)规范。

## 阶段与变更

提案说明范围，设计说明实现方法，任务记录检查和完成状态。当前已提供以下能力；详细入口见[变更目录](../openspec/changes/)。

| 能力 | 实现范围 | 提案与任务 |
| --- | --- | --- |
| 应用基础与账号 | 账号注册登录、刷新、退出和改密，编辑初始化、角色校验，以及 API、Worker、数据库迁移、任务运行和备份工具。 | [提案](../openspec/changes/archive/2026-11-09-application-foundation/proposal.md)、[任务](../openspec/changes/archive/2026-11-09-application-foundation/tasks.md) |
| 共享新闻与阅读 | 多来源采集、正文整理、摘要翻译、事件关联、检索筛选、收藏、阅读记录与全站日报 API。 | [提案](../openspec/changes/archive/2026-11-09-news-reading/proposal.md)、[任务](../openspec/changes/archive/2026-11-09-news-reading/tasks.md) |
| 个人编辑 | 编辑设置、带来源的流式问答、MCP 查询、连续会话、个人日报、长期记忆及编辑手记 API。 | [提案](../openspec/changes/archive/2026-11-09-personal-editor/proposal.md)、[任务](../openspec/changes/archive/2026-11-09-personal-editor/tasks.md) |
| 阅读技能 | 五项阅读技能、个人副本安装修改与启停、显式及自动执行、发布与管理 API。 | [提案](../openspec/changes/archive/2026-11-09-reading-skills/proposal.md)、[任务](../openspec/changes/archive/2026-11-09-reading-skills/tasks.md) |
| 专题与持续跟进 | 私人专题、笔记、成果及来源快照、站内热点、事件时间线、关系图、更新提醒与可撤销分享 API。 | [提案](../openspec/changes/archive/2026-11-09-topics-and-insights/proposal.md)、[任务](../openspec/changes/archive/2026-11-09-topics-and-insights/tasks.md) |
