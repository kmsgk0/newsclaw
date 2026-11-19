# 阅读流程功能验收

日期：2026-11-19。依据：EDITOR-07、EDITOR-08、TOPIC-07、TOPIC-08。执行方式：AI 代码阅读、隔离 PostgreSQL 与 Redis、实际 HTTP 模型替身、Playwright 浏览器操作。四项功能分别提交，后续边界修复与测试整理保留独立提交。

## 功能及边界

| 功能 | 已实现行为 | 验证依据 |
| --- | --- | --- |
| 自动生成 | 现有及新账号默认手动；每日或更新模式、开始小时、每日 1–20 次自动调用上限、用量、额度暂停与恢复 | 默认值、并发争抢、关闭后的执行、重试计次、已知及未知用量、真实 HTTP 额度错误、调度模式和账号隔离 |
| 专题进展 | 按上次已读时间、事件与来源展示摘要；最多 200 篇，标明总数；只确认本次截止时间 | 首次、无新增、多来源、截断、旧确认、后续新增和重叠事务；微秒边界保留 |
| Markdown 导出 | 单份简报、对比或导图，保留标题、保存时间、正文、层级和公共来源 | 实际下载并读取文件；来源编号、三层导图、1 MiB 限制、文件名、私人笔记排除、匿名及跨账号拒绝 |
| 回答反馈 | 已完成助手回答一份可修改、撤回反馈，备注最多 1000 字，引用须属于当前回答 | 状态、引用、增改删、重新打开、删除会话级联、管理员及其他账号隔离；汇总不含私人问答、备注或身份 |

自动次数只限制后台个人日报和手记，失败尝试占用次数；手动操作独立计数。token 统计只累加模型实际返回的字段，未知总量显示未知调用数，不代表全站模型账单。反馈不会自动改写内容或加入模型上下文。专题截断时确认按钮明确标记本批全部报道，后续新增仍保留未读。

## 文件核查与回归

| 对象 | 检查手段、结果与结论 |
| --- | --- |
| [生成设置存储](../src/server/modules/generation/repository.ts)、[执行包装](../src/server/modules/generation/service.ts)、[路由](../src/server/modules/generation/index.ts)、[编辑任务](../src/server/modules/editor/background.ts)、[调度](../src/server/worker.ts)、[账号初始化](../src/server/modules/account/repository.ts)，EDITOR-07 | 短事务中锁设置并预留执行，外部模型调用在事务外；唯一执行标识避免重复计次。并发及重试测试核对数据库次数，非法设置和跨账号拒绝。可用 |
| [专题存储](../src/server/modules/topics/repository.ts)、[服务](../src/server/modules/topics/service.ts)、[路由](../src/server/modules/topics/index.ts)，TOPIC-07/08 | 窗口读取与关联变更使用同一专题行锁，批量加锁顺序固定；实际加入时间防止长事务误标已读。查询不返回全文，200 篇上限和时间索引限制读取。可用；未进行新的性能压测 |
| [导出格式](../src/server/modules/topics/export.ts)、[下载封装](../src/web/api.ts)、[成果界面](../src/web/pages/topics/artifacts.tsx)，TOPIC-08 | 使用已保存来源快照，递归保留导图，校验大小并清理临时下载 URL。浏览器使用固定 ASCII 文件名，标题保留在正文；接口另提供安全标题文件名。可用 |
| [反馈路由](../src/server/modules/feedback/index.ts)、[反馈存储](../src/server/modules/feedback/repository.ts)、[会话恢复](../src/server/modules/editor/repository.ts)，EDITOR-08 | 先校验本人消息及完成状态，再从服务端来源确定报道；一条回答一条反馈。聚合只选择类别和公共新闻字段，不选择备注或会话字段。可用 |
| [会话 Hook](../src/web/components/chat/use-chat-session.ts)、[聊天入口](../src/web/components/chat.tsx)、[消息展示](../src/web/components/chat/messages.tsx)、[反馈交互](../src/web/components/chat/feedback.tsx)、[前端类型](../src/web/types.ts)，EDITOR-08 | 提交后更新对应消息，重新打开读取服务端状态；三端核对选择引用、备注恢复、修改和撤回。可用 |
| [设置界面](../src/web/pages/editor/generation.tsx)、[编辑入口](../src/web/pages/editor/index.tsx)、[专题进展](../src/web/pages/topics/updates.tsx)、[专题入口](../src/web/pages/topics/index.tsx)、[管理入口](../src/web/pages/admin/index.tsx)、[反馈汇总](../src/web/pages/admin/feedback.tsx)，EDITOR-07/08、TOPIC-07 | 默认和保存状态、错误出口、账号权限及窄屏操作通过回归；静态用量使用普通段落，保存结果使用状态通知。可用 |
| [迁移 014](../migrations/014_generation_controls.sql)、[015](../migrations/015_topic_progress.sql)、[016](../migrations/016_answer_feedback.sql)、[017](../migrations/017_topic_arrival_clock.sql) | 保留既有对象，自动设置回填手动且不调用模型；新增时间索引、反馈唯一约束、删除级联和实际时钟默认值。测试库从迁移创建并验证读写。可用 |

权限反向检查：临时移除反馈的账号条件后，真实 HTTP 回归得到 `200` 而期望 `404`，测试失败；恢复判断后通过。专题并发回归在修复前无法等待未提交关联，测试失败；加入行锁和实际加入时间后，等待、可见计数及旧确认后的未读结果均符合预期。

首次完整运行还发现旧来源测试复用了同一失败执行标识；测试改为使用新执行 ID 模拟第二次尝试。浏览器回归发现静态用量错误使用 `status` 角色，已修正并回归设置保存和会话刷新。上述失败记录保留在本地验收材料，不计为最终通过。

## 完整验收

应用检查版本为 `2d0dffc9bcc7dd30a44bcb14123690951a1d9bd7`。执行 `node scripts/checks/check.mjs --group all --base origin/main`，14 阶段全部通过：

- 规格、文件与链接、10 个非合并提交引用检查通过。
- 43 项检查工具测试、6 项安全工具测试通过；Git 历史与当前文件密钥扫描零命中。
- ESLint、TypeScript、122 项业务与集成测试、11 项 HTTP 与任务恢复测试通过。
- 服务端与网页构建、69 项浏览器测试、2 项 SEC-07 用量测试通过。
- 依赖审计为 9 项中危、0 高危、0 严重，与既有基线一致。

后续提交仅整理截图、文档、任务完成状态和规格归档；生成设置截图另以同一组三端测试聚焦新设置面板复验。

环境为 Ubuntu x86-64、Node.js 24.22.2、PostgreSQL 17（pgvector）、Redis 7.4、Gitleaks 8.30.1。Browser 插件不可用，使用项目已有 Playwright，覆盖 1440、768、390 像素宽度。模型和新闻使用合成替身，没有调用付费模型。真实用户体验、真实模型效果及新的性能压测未在本轮执行。

完整日志、JSON、浏览器报告与失败轨迹保存在被忽略的 `.local/verification/reading-workflows-20261119/`。正式截图从成功的浏览器运行中选取，仅含合成账号与材料。

| 界面 | 桌面 | 平板 | 手机 |
| --- | --- | --- | --- |
| 自动生成设置 | [截图](images/reading-workflows/generation-settings-desktop.png) | [截图](images/reading-workflows/generation-settings-tablet.png) | [截图](images/reading-workflows/generation-settings-mobile.png) |
| 专题新增进展 | [截图](images/reading-workflows/topic-progress-desktop.png) | [截图](images/reading-workflows/topic-progress-tablet.png) | [截图](images/reading-workflows/topic-progress-mobile.png) |
| 成果与导出 | [截图](images/reading-workflows/topic-artifact-desktop.png) | [截图](images/reading-workflows/topic-artifact-tablet.png) | [截图](images/reading-workflows/topic-artifact-mobile.png) |
| 回答反馈 | [截图](images/reading-workflows/answer-feedback-desktop.png) | [截图](images/reading-workflows/answer-feedback-tablet.png) | [截图](images/reading-workflows/answer-feedback-mobile.png) |
