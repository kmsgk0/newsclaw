# 检查与修复记录

2026-11-19 新增的自动生成、专题进展、Markdown 导出和回答反馈见[阅读流程功能验收](reading-workflows.md)。

2026-11-19 的四项缺陷修复、聊天及查询重构见[代码审查修复与重构](review-fixes.md)。

2026-11-10 的处理结果见[问题修复记录](security-fix-log.md)与[修复评审](review-02.md)。以下保存首次检查版本的结果，包含修复前的红项。

[应用验证](review-04.md)、[场景对应](traceability.md)、[阅读反馈](feedback.md)、[启动检查](boot-reproduce.md)、[监控与告警](observe-alert.md)、[性能报告](bench.md)、[数据库变更](database-change.md)、[主干流水线](pipeline.md)、[安全门禁演练](gate-red-green.md)、[技能审计回查](audit-recheck.md)及[SEC-08 四步实验](sec08-experiment.md)记录相应检查与结果。

## 评审记录与合入对应

| 记录 | 方法 | 对应版本 | 结论 |
| --- | --- | --- | --- |
| [review-01](review-01.md) | AI 自审、接口脚本 | 应用初版 `19e0b80` | 匿名入口响应及跨账号隔离符合判据。 |
| [review-02](review-02.md) | AI 自审、隔离脚本、原文核对 | 用量与接口修复 `f5b7e50` | 失败用量留存、接口文档和本组日报对照通过。 |
| [review-03](review-03.md) | 接口脚本与手机浏览器操作 | PR #11 的主干提交 `ec24c60` | 手机日报和跨账号 404 通过，能回查请求审计。 |
| [review-04](review-04.md) | 自动检查、运行脚本和 diff 核对 | `00ad13316b2918b2f94d6c94253e748c66bebb3d` | 完整验收、安全门禁与隔离启动均通过。 |

## 首次检查

检查版本：`19e0b801f54fcd95a9d2846cb927321ac78e99ac`（2026-11-09 应用初版）。范围包括账号、新闻、个人编辑、MCP 工具、阅读技能、专题和后台任务。执行环境为 macOS、Node.js 26.13.0、npm 11.20.0，使用隔离 PostgreSQL、Redis 和浏览器，外部信源与模型采用可控 HTTP 替身；真实模型结果见 [AI 评测](../docs/verification/ai-results.md)。

本组报告保留首次检查时的实际结果。七项安全检查中，SEC-01 至 SEC-06 符合预期，SEC-07 发现失败调用用量丢失。

| 报告 | 内容 |
| --- | --- |
| [首次安全检查](security-precheck.md) | 身份与数据、接口清单、七项结果及 SEC-07 红项 |
| [账号与授权](risk-authz.md) | 账号隔离、会话撤销、管理权限及分享 |
| [并发与任务执行](risk-concurrency.md) | 重复请求、重复投递、迟到结果及进程中断 |
| [事务与数据一致性](risk-transaction.md) | 接收和结果回滚、活动位置、通知与成果关联 |
| [异步响应](async-response.md) | 接收耗时、队列状态、执行次数和死信 |
| [安全基线](security-baseline.md) | 密钥扫描、依赖审计及处置依据 |
| [安全检查评审](review-01.md) | 未登录访问与跨账号隔离的核对依据、实际值和判定 |

## 执行结果

| 检查范围 | 入口 | 实际结果 |
| --- | --- | --- |
| 应用行为与集成 | `npm test` | 77 个用例通过 |
| HTTP、权限与任务恢复 | `npm run test:api` | 4 个用例通过；调用日志检查覆盖正常技能调用 |
| 浏览器阅读与操作 | `npm run test:e2e` | 48 个用例通过 |
| 失败调用的用量 | `node --import tsx tests/evaluation/usage-recording.ts` | 正常场景通过；结构失败场景丢失用量，退出码 1 |
| 密钥与依赖 | 安全基线中的扫描与审计命令 | 扫描零命中；完整依赖 9 项中危、0 高危、0 严重，运行依赖为零 |

失败调用的用量观察为单独入口，未计入常规用例数量。[SEC-07](security-precheck.md#sec-07-失败调用用量) 的红项为：模型结果结构校验失败时，已返回的用量未保存在日志和消息中；该检查版本尚未修复。

[代码审查](../docs/verification/code-review.md)另外登记了 OpenAPI 文档入口返回 500、个人日报的一处兴趣分析超出来源材料两项问题，后续处理见本页上方的修复记录。备份与版本恢复结果见[运行说明](../docs/runtime.md#恢复检查结果)。手机任务权限复核见[手机端日报](review-03.md#手机端日报)。

各报告正文保留命令、关键输出和结论。完整 JSON、日志及生成报告保存在 Git 忽略的 `.local/verification/`。
