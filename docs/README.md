# 项目文档

NewsClaw 将公共新闻、个人编辑和持续跟进放在同一个阅读空间。功能概览与快速启动见[仓库首页](../README.md)，本页提供使用、实现、规范与检查的入口。

## 使用与开发

| 需要了解的内容 | 入口 |
| --- | --- |
| 页面入口与主要操作 | [使用说明](usage.md) |
| 启动、配置、任务运行、备份与恢复 | [运行说明](runtime.md) |
| 模块关系、数据和执行机制 | [架构与数据关系](architecture.md) |
| 账号、新闻、编辑与技能、专题的接口和实现 | [账号](modules/account.md)、[新闻](modules/news.md)、[编辑与技能](modules/editor.md)、[专题](modules/topics.md) |
| 依赖的用途与许可 | [依赖说明](dependencies.md) |
| 开发、Spec、提交与归档 | [开发指南](../CONTRIBUTING.md)、[项目规则](../AGENTS.md) |
| 自动检查、安全检查及 AI 样例 | [检查入口](verification/checks.md)、[安全检查方法](verification/security.md)、[AI 评测样例](verification/ai-cases.md) |
| 实际检查结果与待修改项 | [正式报告](../reports/README.md)、[代码审查](verification/code-review.md)、[AI 评测结果](verification/ai-results.md) |

## 能力与场景索引

现行规格维护已交付行为的正常、失败、权限与数据场景；模块文档说明实现和调用方式。需求编号连接规格、代码检查与测试。

| 能力 | 需求范围 | 规格 |
| --- | --- | --- |
| 账号与访问 | ACC-01 至 ACC-05 | [账号规格](../openspec/specs/account-access/spec.md) |
| 共享新闻库 | NEWS-01 至 NEWS-06 | [新闻规格](../openspec/specs/news-library/spec.md) |
| 个人编辑 | EDITOR-01 至 EDITOR-06 | [编辑规格](../openspec/specs/personal-editor/spec.md) |
| 阅读技能 | SKILL-01 至 SKILL-04 | [技能规格](../openspec/specs/editor-skills/spec.md) |
| 专题与洞察 | TOPIC-01 至 TOPIC-06 | [专题规格](../openspec/specs/topics-and-insights/spec.md) |
| 运行与恢复 | OPS-01 至 OPS-05 | [运行规格](../openspec/specs/runtime-operations/spec.md) |
| 阅读界面 | UI-01 至 UI-04 | [界面规格](../openspec/specs/reading-interface/spec.md) |

## 工程规范

按改动内容读取[产品设计](standards/product.md)、[后端开发](standards/backend.md)、[安全](standards/security.md)、[测试](standards/testing.md)、[部署运维](standards/operations.md)、[AI 应用](standards/ai.md)、[数据](standards/data.md)和[评审](standards/review.md)规范。规范维护跨模块约定，具体业务行为由上表中的能力规格维护。

## 阶段与变更

阶段提案说明范围，设计记录实现方式，任务记录实际进度。各阶段的依赖和入口如下；已完成变更保存在[归档目录](../openspec/changes/archive/)，当前实施范围见[变更目录](../openspec/changes/)。

| 阶段 | 依赖 | 提案与任务 |
| --- | --- | --- |
| 应用基础与账号 | 无 | [应用基础](../openspec/changes/archive/2026-11-09-application-foundation/proposal.md)、[任务](../openspec/changes/archive/2026-11-09-application-foundation/tasks.md) |
| 共享新闻与阅读 | 应用基础 | [新闻阅读](../openspec/changes/archive/2026-11-09-news-reading/proposal.md)、[任务](../openspec/changes/archive/2026-11-09-news-reading/tasks.md) |
| 个人编辑 | 新闻与账号 | [个人编辑](../openspec/changes/archive/2026-11-09-personal-editor/proposal.md)、[任务](../openspec/changes/archive/2026-11-09-personal-editor/tasks.md) |
| 阅读技能 | 编辑与材料 | [阅读技能](../openspec/changes/archive/2026-11-09-reading-skills/proposal.md)、[任务](../openspec/changes/archive/2026-11-09-reading-skills/tasks.md) |
| 专题与持续跟进 | 新闻、编辑与技能 | [专题与洞察](../openspec/changes/archive/2026-11-09-topics-and-insights/proposal.md)、[任务](../openspec/changes/archive/2026-11-09-topics-and-insights/tasks.md) |
| 阅读界面 | 所有业务接口 | [阅读界面](../openspec/changes/archive/2026-11-09-reading-interface/proposal.md)、[任务](../openspec/changes/archive/2026-11-09-reading-interface/tasks.md) |
