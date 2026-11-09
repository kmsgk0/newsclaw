# 代码审查

首次审查：2026 年 11 月 9 日。修复核对：2026 年 11 月 10 日。执行方式：AI 辅助代码阅读、独立审查与隔离测试。

已列出的权限、任务执行与事务检查通过。首次审查中的三项待修改问题已完成处理：失败调用用量保留、OpenAPI 文档访问和个人日报事实表达均通过对应检查。修复前后记录见[修复报告](../../reports/security-fix-log.md)，独立检查见[修复评审](../../reports/review-02.md)。

审查对象为下表列出的服务端实现、数据库迁移和前端共享模块。检查版本见[报告索引](../../reports/README.md)。规约依据见各行链接，安全核对见[检查评审](../../reports/review-01.md)，权限、并发和事务数据由对应报告保存。

## 文件检查

| 类别 | 文件与需求依据 | 判据、实际发现 | 结论与处理 |
| --- | --- | --- | --- |
| 接口入口 | [账号路由](../../src/server/modules/account/index.ts)、[账号服务](../../src/server/modules/account/service.ts)、[账号存储](../../src/server/modules/account/repository.ts)、[editor/index.ts](../../src/server/modules/editor/index.ts)、[news/index.ts](../../src/server/modules/news/index.ts)、[topics/index.ts](../../src/server/modules/topics/index.ts)。[账号规约](../../openspec/specs/account-access/spec.md)、[运行规约](../../openspec/specs/runtime-operations/spec.md) | 核对路由身份、参数与结果。私人接口使用认证账号；管理入口另查角色；输入经过 schema 校验；异步写入返回 202。HTTP 检查中匿名请求返回 401，跨账号会话、记忆、技能及任务返回 404，普通账号访问管理入口返回 403。 | 可用。 |
| 接口入口 | [base-app.ts](../../src/server/base-app.ts)。[后端规范](../standards/backend.md) | 完整应用的 OpenAPI JSON 与文档页面返回 200，代表性业务路径、公开与 Bearer 声明、原有参数和默认响应均保留；浏览器正常加载接口定义。缺省 schema 在共享转换中处理。 | 可用。接口与页面检查已加入默认套件。 |
| 业务逻辑 | [editor/bilingual.ts](../../src/server/modules/editor/bilingual.ts)、[skills/service.ts](../../src/server/modules/skills/service.ts)、[skills/repository.ts](../../src/server/modules/skills/repository.ts)、[topics/service.ts](../../src/server/modules/topics/service.ts)、[topics/validation.ts](../../src/server/modules/topics/validation.ts)。[个人编辑](../../openspec/specs/personal-editor/spec.md)、[技能](../../openspec/specs/editor-skills/spec.md)、[专题与分享](../../openspec/specs/topics-and-insights/spec.md) | 核对材料、技能与成果保存。显式技能先检查归属及启用状态；双语原文来自宿主保存的段落；导图检查层级、节点与来源；保存生成成果时核对已完成消息及来源快照；分享仅取选中成果的公开字段。 | 可用。 |
| 业务逻辑 | [editor/background.ts](../../src/server/modules/editor/background.ts)。[个人编辑规约](../../openspec/specs/personal-editor/spec.md) | 个人日报正文整理报道事实，兴趣关联核对偏好与已引用材料的原文片段后生成；无效关联在保存前被拒绝，已有日报保留。原人事材料和三条代表性样例完成实际输出核对，条件、明确计划与无兴趣行为保留。 | 可用。实际内容判断与自动结构检查分别记录，见[AI 评测](ai-results.md)。 |
| 业务逻辑 | [adapters/mcp.ts](../../src/server/adapters/mcp.ts)、[editor/service.ts](../../src/server/modules/editor/service.ts)。[材料与工具规约](../../openspec/specs/personal-editor/spec.md#requirement-editor-02-材料检索与可追溯回答)、[MCP 说明](../modules/editor.md#mcp-与模型) | 核对四个工具的注册、参数、身份、材料范围、错误和日志。MCP 客户端与服务端通过进程内传输连接；工具使用宿主账号和业务服务。额外身份字段返回 INVALID_INPUT，他人专题与不存在对象均为 NOT_FOUND；显式技能的工具结果限定在选中报道内。工具调用记录请求、账号、工具、结果及耗时；失败检索使回答失败，不保存空成功结果。依据 [编辑用例](../../tests/editor/editor.test.ts)和[安全接口用例](../../apitest/cases/security.test.ts)。 | 可用。编辑服务的失败用量检查见下方日志项。 |
| 数据库操作 | [db.ts](../../src/server/db.ts)、[migrate.ts](../../src/server/migrate.ts)、[editor/repository.ts](../../src/server/modules/editor/repository.ts)、[topics/repository.ts](../../src/server/modules/topics/repository.ts)。迁移：[001](../../migrations/001_runtime.sql)、[002](../../migrations/002_accounts.sql)、[003](../../migrations/003_news.sql)、[004](../../migrations/004_editor_skills.sql)、[005](../../migrations/005_topics.sql)、[006](../../migrations/006_news_entities.sql)、[007](../../migrations/007_content_quality.sql)、[008](../../migrations/008_reader_workflows.sql)、[009](../../migrations/009_message_errors.sql)。[运行](../../openspec/specs/runtime-operations/spec.md)、[个人编辑](../../openspec/specs/personal-editor/spec.md)与[专题](../../openspec/specs/topics-and-insights/spec.md)规约 | 核对写入条件、唯一约束与事务。账号与编辑配置一起创建；会话限制一个 pending 回答；记忆写入带账号条件；手记锁定编辑记录并核对活动位置和记忆版本；成果删除级联移除分享。业务结果写入抛错时，测试确认结果行回滚、任务回到 pending。 | 可用。 |
| 并发与数据一致性 | [任务服务](../../src/server/runtime/tasks.ts)、[任务路由](../../src/server/runtime/routes.ts)、[worker.ts](../../src/server/worker.ts)、[news/service.ts](../../src/server/modules/news/service.ts)。[运行规约](../../openspec/specs/runtime-operations/spec.md)、[新闻规约](../../openspec/specs/news-library/spec.md) | 核对任务接收、投递与结果提交。同一操作由唯一约束约束；任务与 outbox 同事务保存；generation、executionId 和正文 hash 限制旧执行写入。重复投递保持一条结果；新执行已提交后，旧执行未覆盖其值；缺失的队列消息可由 outbox 恢复。 | 可用。 |
| 公共函数 | [news/content.ts](../../src/server/modules/news/content.ts)、[news/materials.ts](../../src/server/modules/news/materials.ts)、[web/api.ts](../../src/web/api.ts)、[web/auth.tsx](../../src/web/auth.tsx)、[共享控件](../../src/web/components/ui.tsx)、[正文与引用](../../src/web/components/content.tsx)、[任务状态](../../src/web/components/task-status.tsx)、[导图](../../src/web/components/mindmap.tsx)。[新闻](../../openspec/specs/news-library/spec.md)与[阅读界面](../../openspec/specs/reading-interface/spec.md)规约 | 核对共享职责与调用结果。分类、Markdown 分块和来源映射集中处理；请求入口统一恢复会话和传递字段错误；资源请求可取消；重复操作有执行中状态。共享正文组件处理 GFM、引用、代码和横向表格，未引用的检索材料折叠显示。 | 可用。 |
| 错误处理 | [errors.ts](../../src/server/errors.ts)、[validation-errors.ts](../../src/server/validation-errors.ts)、[共享反馈](../../src/web/components/ui.tsx)。[运行](../../openspec/specs/runtime-operations/spec.md)与[阅读界面](../../openspec/specs/reading-interface/spec.md)规约 | 核对 HTTP、模型调用与 SSE 失败出口。字段错误包含具体中文原因；模型认证、限流、额度、超时和结构错误分别处理；流式失败保存 failed 状态及错误信息。普通输入错误直接展示原因，服务错误可展开请求标识；失败路径不发送 complete 事件。 | 可用。 |
| 错误处理与日志 | [adapters/model.ts](../../src/server/adapters/model.ts)、[editor/service.ts](../../src/server/modules/editor/service.ts)。[运行规约 OPS-04](../../openspec/specs/runtime-operations/spec.md#requirement-ops-04-运行记录与行为验证) | 模型响应的用量先于内容校验取得，并传递到失败出口；导图也在材料校验前接收用量。正常及非法段落编号结果的日志和消息均保留 10／20／30，非法结果仍为 failed；缺失与部分用量按实际值保存。 | 可用。原 SEC-07 用例及新增回归通过，见[修复记录](../../reports/security-fix-log.md)。 |
| 安全与隐私 | [adapters/sources.ts](../../src/server/adapters/sources.ts)、[config.ts](../../src/server/config.ts)、[logger.ts](../../src/server/logger.ts)。同时核对上列认证、私人仓储及正文组件。[安全规范](../standards/security.md) | 核对真实入口与输出。密码使用加盐 scrypt，令牌只存摘要；前端访问令牌保存在内存；生产 Cookie 要求 Secure；信源入口及重定向逐次检查网络目标；Markdown 跳过原始 HTML；日志对认证字段脱敏。已执行用例中的跨账号读取和写入均被拒绝。 | 可用。依赖与业务安全结果见[安全预检](../../reports/security-precheck.md)。 |
| 查询性能 | [news/repository.ts](../../src/server/modules/news/repository.ts)，以及上列迁移中的新闻、任务和归属索引。[新闻规约](../../openspec/specs/news-library/spec.md) | 阅读查询、分页及索引。新闻列表限制页大小并使用稳定排序，检索具备全文、标题 trigram 及适用维度的向量索引；新闻模型处理在 worker 中执行。个人专题匹配采用账号范围内的集合查询，当前记录未包含大数据量下的耗时测量。 | 可用，结论限于查询结构和现有检查规模。 |

## 审查维度

| 维度 | 判断 |
| --- | --- |
| 需求覆盖 | 已列文件覆盖账号、新闻、编辑、MCP 工具、技能、专题、任务及共享界面行为；失败调用用量、OpenAPI 生成及个人日报内容质量已完成对应修复与检查。 |
| 需求一致性 | 私人资源使用账号归属，公共新闻与成果快照分别处理；异步接收和执行状态符合规约。 |
| 失败路径 | 输入、认证、模型和提交错误有明确出口，事务失败不会保留半成品；结构校验失败时保留已返回的模型用量。 |
| 查询性能 | 列表分页、稳定排序和主要索引已核对；规模化耗时范围见上表。 |
| 重复逻辑 | API、字段反馈、Markdown、来源映射及任务执行已有共享实现。 |
| 漏洞风险 | 重点检查对象归属、来源地址、模型工具范围和渲染边界，安全检查结果单独留档。 |
| 高风险场景 | 权限隔离、重复投递、旧执行覆盖与事务回滚的实际结果见[权限](../../reports/risk-authz.md)、[并发](../../reports/risk-concurrency.md)和[事务](../../reports/risk-transaction.md)报告。 |
