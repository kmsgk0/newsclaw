# 场景与检查对应

2026-11-24，以提交 `00ad13316b2918b2f94d6c94253e748c66bebb3d` 的代码、检查结果和当前主规格核对 13 组能力下的 253 个唯一场景。每条记录给出执行入口与判据，历史证据按所链接记录的范围引用。

## 执行入口与记录

环境及依赖见[检查说明](../docs/verification/checks.md)，完整阶段结果见[应用验证评审](review-04.md)。

| 索引 | 入口 | 最近结果 |
| --- | --- | --- |
| 全量 | `make check` | 2026-11-24，`00ad13316b2918b2f94d6c94253e748c66bebb3d`，15 个阶段退出码均为 0，共 286 条测试通过。 |
| 安全 | `make check-security` | 2026-11-24，`00ad13316b2918b2f94d6c94253e748c66bebb3d`，退出码 0，6 项安全工具、9 项接口与编辑器、1 项浏览器检查通过。 |
| U | `npm test` 或 `node --import tsx --test <路径>` | 全量验收中 123 项业务测试通过，行 93.96%、分支 86.33%、函数 86.38%。 |
| A | `npm run test:api` 或 `node --import tsx --test --test-concurrency=1 <路径>` | 全量验收中 12 项 HTTP 及任务恢复检查通过。 |
| B | `npx playwright test <路径>` | 全量验收中 99 项浏览器检查通过，覆盖 390、768 和 1440 像素视口。 |
| R | `node scripts/verification/runtime.mjs verify` | 2026-11-24，`00ad13316b2918b2f94d6c94253e748c66bebb3d`，退出码 0，手机日报、404、审计与容器清理通过。[启动记录](boot-reproduce.md) |
| L | [实际模型评测入口](../docs/verification/ai-cases.md) | 已执行的内容对照见[评测结果](../docs/verification/ai-results.md)与[阅读反馈](feedback.md)。 |
| V | Chromium 打开验收汇总 | 三个视口无横向溢出。OPS-01 搜索匹配 3／286 条，重置恢复 286／286 条。 |
| 工程检查、核查、历史 | 行内链接的命令、配置或记录 | 自动检查、配置核对与历史实测分别按各行所列判据查看。 |

## account-access

规格：[当前规格](../openspec/specs/account-access/spec.md)。

| Requirement / Scenario | 实际检查与判据 | 方式 / 结果索引 |
| --- | --- | --- |
| ACC-01 · 成功初始化 | [auth.test.ts](../tests/account/auth.test.ts)；注册结果角色为 user、不含哈希，编辑仅一份。 | U |
| ACC-01 · 输入与冲突 | [auth.test.ts](../tests/account/auth.test.ts)、[error-feedback.test.ts](../tests/editor/error-feedback.test.ts)、[account.spec.ts](../tests/e2e/account.spec.ts)；重复、非法字段返回明确错误；账号、编辑、会话计数不变，页面保留用户名。 | U、B |
| ACC-01 · 事务失败 | [auth.test.ts](../tests/account/auth.test.ts)；编辑插入触发器抛错后，失败用户名没有账号行。 | U |
| ACC-02 · 登录与刷新 | [auth.test.ts](../tests/account/auth.test.ts)、[account.spec.ts](../tests/e2e/account.spec.ts)；刷新后身份和配置恢复；localStorage 无 token；刷新令牌轮换。 | U、B |
| ACC-02 · 错误凭据 | [auth.test.ts](../tests/account/auth.test.ts)、[error-feedback.test.ts](../tests/editor/error-feedback.test.ts)；错误密码和不存在用户名得到同一 401 文案，数据库计数不变。 | U |
| ACC-02 · 撤销与并发 | [auth.test.ts](../tests/account/auth.test.ts)、[auth-revocation-race.test.ts](../tests/account/auth-revocation-race.test.ts)；退出、改密及会话插入并发后，旧访问和刷新令牌失效。 | U |
| ACC-03 · 游客阅读 | [security.test.ts](../apitest/cases/security.test.ts)、[news.spec.ts](../tests/e2e/news.spec.ts)；匿名新闻 200，私人入口 401；游客可读资讯和五项公共技能。 | A、B |
| ACC-03 · 登录衔接 | [account.spec.ts](../tests/e2e/account.spec.ts)、[helpers.ts](../tests/e2e/helpers.ts)；从受保护页面注册或登录，返回编辑或账号设置目标；页面恢复身份。 | B |
| ACC-03 · 缺失入口 | [security.test.ts](../apitest/cases/security.test.ts)断言不存在新闻和事件为404/NOT_FOUND/data=null；[topics.spec.ts](../tests/e2e/topics.spec.ts)访问未知路由和缺失专题，检查提示及可操作的返回资讯入口。 | A、B |
| ACC-04 · 本人访问 | [reader-workflows.test.ts](../tests/runtime/reader-workflows.test.ts)、[editor-api.test.ts](../tests/editor/editor-api.test.ts)、[security.test.ts](../apitest/cases/security.test.ts)；本人对象读写及列表隔离；跨账号记忆、专题、会话等返回 404，拒绝后数据不变。 | U、A |
| ACC-04 · 替换标识 | [editor.test.ts](../tests/editor/editor.test.ts)、[news-topics-api.test.ts](../tests/topics/news-topics-api.test.ts)、[security.test.ts](../apitest/cases/security.test.ts)；HTTP 与 MCP 对他人及不存在对象统一拒绝；伪造执行账号参数无效。 | U、A |
| ACC-05 · 公共管理 | [skills.test.ts](../tests/skills/skills.test.ts)、[news-management.test.ts](../tests/news/news-management.test.ts)、[admin.spec.ts](../tests/e2e/admin.spec.ts)；管理员公共采集和日报完成；公开技能维护有 management_actions 记录。 | U、B |
| ACC-05 · 普通用户拒绝 | [security.test.ts](../apitest/cases/security.test.ts)；普通用户管理请求 403，信源集合和启用状态保持。 | A |
| ACC-05 · 管理身份访问私人对象 | [tasks.test.ts](../tests/runtime/tasks.test.ts)、[src/server/modules/editor/repository.ts](../src/server/modules/editor/repository.ts)；管理员读取他人私人任务被拒；[security.test.ts](../apitest/cases/security.test.ts)实际管理员请求他人及不存在会话均404/NOT_FOUND/data=null，本人仍200。 | U、A |

## news-library

规格：[当前规格](../openspec/specs/news-library/spec.md)。

| Requirement / Scenario | 实际检查与判据 | 方式 / 结果索引 |
| --- | --- | --- |
| NEWS-01 · 采集结构化长文 | [news-sources.test.ts](../tests/news/news-sources.test.ts)、[news.integration.test.ts](../tests/news/news.integration.test.ts)、[news.spec.ts](../tests/e2e/news.spec.ts)；标题、段落、列表、表格、代码和链接保留，导航被移除；不同来源保留独立报道。 | U、B |
| NEWS-01 · 重复与更新 | [news.integration.test.ts](../tests/news/news.integration.test.ts)、[news-quality.test.ts](../tests/news/news-quality.test.ts)、[news-recollection.test.ts](../tests/news/news-recollection.test.ts)；重复采集不增记录或模型调用；正文变化保留报道标识、收藏和成功派生内容。 | U |
| NEWS-01 · 摘要与正文 | [news-sources.test.ts](../tests/news/news-sources.test.ts)、[news-empty-body.test.ts](../tests/news/news-empty-body.test.ts)、[news-recollection.test.ts](../tests/news/news-recollection.test.ts)、[docs/verification/ai-results.md](../docs/verification/ai-results.md)；实际摘要范围、全文获取及标题无正文的处理独立检查，来源读取失败保留原正文。 | U、L |
| NEWS-01 · 部分失败 | [news-quality.test.ts](../tests/news/news-quality.test.ts)、[news-management.test.ts](../tests/news/news-management.test.ts)；同批坏报道失败、好报道成功；重新处理按单篇身份接收任务。 | U |
| NEWS-01 · 非法与停用来源 | [news-sources.test.ts](../tests/news/news-sources.test.ts)、[news-topics-api.test.ts](../tests/topics/news-topics-api.test.ts)、[security.test.ts](../apitest/cases/security.test.ts)；拒绝 file、内网、无效选择器及停用来源；接收后停用也不调用模型。 | U、A |
| NEWS-02 · 英文全文中文阅读 | [news-quality.test.ts](../tests/news/news-quality.test.ts)、[docs/verification/ai-results.md](../docs/verification/ai-results.md)；逐块译文覆盖、长文分批及代码保留；缺段拒绝。实际英文材料内容按历史人工记录核对。 | U、L |
| NEWS-02 · 事实保全 | [docs/verification/ai-cases.md](../docs/verification/ai-cases.md)、[docs/verification/ai-results.md](../docs/verification/ai-results.md)；AI-01/03/04 及三类真实来源对照日期、数字、标识和未披露条件；语义检查依赖实际输出阅读。 | L |
| NEWS-02 · 稳定领域 | [news-quality.test.ts](../tests/news/news-quality.test.ts)、[topics.integration.test.ts](../tests/topics/topics.integration.test.ts)；中英文领域标签归一；中文摘要可被新闻和专题共同检索。 | U |
| NEWS-02 · 处理与更新失败 | [news-quality.test.ts](../tests/news/news-quality.test.ts)、[news-recollection.test.ts](../tests/news/news-recollection.test.ts)；新内容翻译或来源读取失败保留原成功结果和收藏，恢复后替换并清除失败状态。 | U |
| NEWS-03 · 归并与进展 | [news-management.test.ts](../tests/news/news-management.test.ts)；相关发布归入同事件、保留两篇事实；同公司另一行为独立成事件。 | U |
| NEWS-03 · 修正归属 | [news.integration.test.ts](../tests/news/news.integration.test.ts)、[news-management.test.ts](../tests/news/news-management.test.ts)；移入新事件后两边报道及图来源变化；手工移除不被自动归并覆盖。 | U |
| NEWS-03 · 权限与缺失 | [news-management.test.ts](../tests/news/news-management.test.ts)、[news-topics-api.test.ts](../tests/topics/news-topics-api.test.ts)、[security.test.ts](../apitest/cases/security.test.ts)；非管理员修正403、目标事件不存在404；原event_id保留且无news.set-event记录，缺失报道404、停用源拒绝。 | U、A |
| NEWS-04 · 组合检索 | [news.integration.test.ts](../tests/news/news.integration.test.ts)、[topics.integration.test.ts](../tests/topics/topics.integration.test.ts)、[news.spec.ts](../tests/e2e/news.spec.ts)；关键词、语义、中文摘要查询及分页 ID 集合；页面组合关键词与领域筛选。 | U、B |
| NEWS-04 · 阅读后返回 | [news.spec.ts](../tests/e2e/news.spec.ts)；返回列表后URL、关键词、领域和page=2恢复；键盘Enter打开实际报道，返回时原链接在视口内，滚动位置差小于24像素。 | B |
| NEWS-04 · 空结果与失败 | [news.integration.test.ts](../tests/news/news.integration.test.ts)、[news.spec.ts](../tests/e2e/news.spec.ts)；无匹配返回空；嵌入失败拒绝；页面 503 显示错误且重试恢复，不能显示空新闻库。 | U、B |
| NEWS-04 · 非法查询 | [news-topics-api.test.ts](../tests/topics/news-topics-api.test.ts)、[news.integration.test.ts](../tests/news/news.integration.test.ts)；超限页大小、未知参数、非法排序或日期范围均拒绝。 | U |
| NEWS-05 · 收藏与回看 | [news.integration.test.ts](../tests/news/news.integration.test.ts)、[topics.spec.ts](../tests/e2e/topics.spec.ts)；重复收藏一份、其他账号列表为空，取消保留公共报道；页面显示已收藏。 | U、B |
| NEWS-05 · 阅读记录 | [news.integration.test.ts](../tests/news/news.integration.test.ts)核对去重、最新read_at、顺序及历史readAt；公共新闻/收藏无该字段。[news.spec.ts](../tests/e2e/news.spec.ts)核对最近阅读时间的datetime与接口一致，点击后回到相同报道。 | U、B |
| NEWS-05 · 直接加入专题 | [reader-workflows.test.ts](../tests/runtime/reader-workflows.test.ts)、[topics.integration.test.ts](../tests/topics/topics.integration.test.ts)、[topics.spec.ts](../tests/e2e/topics.spec.ts)；本人专题加入、去重及他人拒绝；详情和专题均使用实际报道。 | U、B |
| NEWS-06 · 生成并回看 | [news-management.test.ts](../tests/news/news-management.test.ts)、[digest-sources.test.ts](../tests/news/digest-sources.test.ts)、[docs/verification/ai-results.md](../docs/verification/ai-results.md)；业务日期跨 UTC 日边界仍正确；日报历史及来源保存，导读语义见实际模型记录。 | U、L |
| NEWS-06 · 等待与空材料 | [reader-workflows.test.ts](../tests/runtime/reader-workflows.test.ts)；采集未完成不调度日报；空批次成功后新材料到达可建立新任务，历史显示 pending。 | U |
| NEWS-06 · 更新与失败 | [news.integration.test.ts](../tests/news/news.integration.test.ts)；同日重复生成一份日报；失败保留旧内容和任务错误，空日期返回 empty。 | U |
| NEWS-06 · 非法来源 | [digest-sources.test.ts](../tests/news/digest-sources.test.ts)；非法来源拒绝，公共和私人日报及活动位置保持原值。 | U |

## editor-skills

规格：[当前规格](../openspec/specs/editor-skills/spec.md)。

| Requirement / Scenario | 实际检查与判据 | 方式 / 结果索引 |
| --- | --- | --- |
| SKILL-01 · 查看效果并使用 | [skills.test.ts](../tests/skills/skills.test.ts)、[news.spec.ts](../tests/e2e/news.spec.ts)、[skills.spec.ts](../tests/e2e/skills.spec.ts)；目录有五类；安装并使用保留技能选择和所选材料，公开示例可预览。 | U、B |
| SKILL-01 · 五项技能的结果 | [editor.test.ts](../tests/editor/editor.test.ts)、[topics.spec.ts](../tests/e2e/topics.spec.ts)、[docs/verification/ai-results.md](../docs/verification/ai-results.md)；简报、双语、导图有结构和来源断言；五技能的概念、对比与内容效果见历史实际模型评测。 | U、B、L |
| SKILL-01 · 仅有摘要或缺材料 | [editor.test.ts](../tests/editor/editor.test.ts)；摘要双语明确范围；未选材料、缺失材料及非法来源拒绝，虚构双语原文不保存。 | U |
| SKILL-02 · 安装与定制 | [skills.test.ts](../tests/skills/skills.test.ts)；重复安装同一 ID，个人说明持久，公共模板更新不覆盖副本。 | U |
| SKILL-02 · 停用与模板更新 | [skills.test.ts](../tests/skills/skills.test.ts)；停用后显式选择被拒、自动选择返回 null；模板变化保留定制内容。 | U |
| SKILL-02 · 输入权限和失败 | [skills.test.ts](../tests/skills/skills.test.ts)、[editor-api.test.ts](../tests/editor/editor-api.test.ts)；空说明 400、他人副本 404；插入故障后没有半份个人副本。 | U |
| SKILL-03 · 明确选择 | [skills.test.ts](../tests/skills/skills.test.ts)、[skills.spec.ts](../tests/e2e/skills.spec.ts)；明确 comparison 压过自动 explain；页面保留选定技能并产生对应成果。 | U、B |
| SKILL-03 · 自动与普通回答 | [skills.test.ts](../tests/skills/skills.test.ts)、[editor.test.ts](../tests/editor/editor.test.ts)；自动选择启用副本，普通问题返回 null；未固定材料的普通问答仍能完成。 | U |
| SKILL-03 · 停用与失败 | [editor.test.ts](../tests/editor/editor.test.ts)；停用技能不增加模型调用；模型、流或导图失败不产生 complete/artifact，原成功回答保留。 | U |
| SKILL-04 · 发布和安装 | [skills.test.ts](../tests/skills/skills.test.ts)、[skills.spec.ts](../tests/e2e/skills.spec.ts)；本人发布显式示例，另一账号安装；无私人 messages；预览表单恢复已保存公开内容。 | U、B |
| SKILL-04 · 下架与再次发布 | [skills.test.ts](../tests/skills/skills.test.ts)；下架后目录移除、已安装副本保留；再次发布后可见，重复安装仍返回原副本ID。 | U |
| SKILL-04 · 越权发布 | [skills.test.ts](../tests/skills/skills.test.ts)；他人发布副本为 NOT_FOUND，非作者管理公开版为 FORBIDDEN。 | U |

## personal-editor

规格：[当前规格](../openspec/specs/personal-editor/spec.md)。

| Requirement / Scenario | 实际检查与判据 | 方式 / 结果索引 |
| --- | --- | --- |
| EDITOR-01 · 保存与使用 | [editor.test.ts](../tests/editor/editor.test.ts)、[account.spec.ts](../tests/e2e/account.spec.ts)；设置保存并刷新恢复；个人日报输入快照含最新兴趣，回答准备含手动风格。 | U、B |
| EDITOR-01 · 无效设置 | [editor-api.test.ts](../tests/editor/editor-api.test.ts)、[account.spec.ts](../tests/e2e/account.spec.ts)；空名字和非法头像 400；表单错误及保存内容保留通过账号/设置浏览器流程检查。 | U、B |
| EDITOR-02 · 选择材料并追问 | [editor.test.ts](../tests/editor/editor.test.ts)、[editor.spec.ts](../tests/e2e/editor.spec.ts)；选中报道的会话材料、来源和消息持久；浏览器显示材料名及可打开的引用。 | U、B |
| EDITOR-02 · 跨新闻查询 | [editor.test.ts](../tests/editor/editor.test.ts)；未固定材料执行新闻检索；工具故障发送 error、无 complete，不存空成功答案。 | U |
| EDITOR-02 · 材料不足 | [docs/verification/ai-cases.md](../docs/verification/ai-cases.md)、[docs/verification/ai-results.md](../docs/verification/ai-results.md)；AI-03 对确定价格问题明确未披露，不补造报价或来源；需按原材料阅读实际回答。 | L |
| EDITOR-02 · 非法或越权工具 | [editor.test.ts](../tests/editor/editor.test.ts)、[security.test.ts](../apitest/cases/security.test.ts)；非法账号字段、他人/缺失专题被 MCP 拒绝；消息和执行权限不被材料改写。 | U、A |
| EDITOR-02 · 工具轮次与最终正文 | [editor.test.ts](../tests/editor/editor.test.ts)；工具前言中的 99 元、N999 和临时判断不进入正文；text 事件等于已保存最终回答，工具事件仍存在。 | U |
| EDITOR-03 · 新建与恢复 | [reader-workflows.test.ts](../tests/runtime/reader-workflows.test.ts)、[editor.spec.ts](../tests/e2e/editor.spec.ts)；重命名、删除、重新打开及两段历史独立；重试只保留一条用户问题。 | U、B |
| EDITOR-03 · 流式阅读 | [editor-api.test.ts](../tests/editor/editor-api.test.ts)核对断流落库；[editor.spec.ts](../tests/e2e/editor.spec.ts)点击停止并等待真实中断及网络稳定，检查未完成、错误和重试入口，刷新后仍失败，显式重试成功且只有一条问题；另检查上翻阅读位置。 | U、B |
| EDITOR-03 · 失败重试 | [reader-workflows.test.ts](../tests/runtime/reader-workflows.test.ts)、[error-feedback.test.ts](../tests/editor/error-feedback.test.ts)、[editor.spec.ts](../tests/e2e/editor.spec.ts)；同一失败消息重试为 completed，旧成功历史保留，问题条数不增加。 | U、B |
| EDITOR-03 · 进程中断 | [reader-workflows.test.ts](../tests/runtime/reader-workflows.test.ts)、[error-feedback.test.ts](../tests/editor/error-feedback.test.ts)；中断恢复将 pending 标 failed 并保留原因和问题，之后可在原消息重试完成。 | U |
| EDITOR-03 · 空输入与越权 | [editor.test.ts](../tests/editor/editor.test.ts)、[editor-api.test.ts](../tests/editor/editor-api.test.ts)；空问题和他人会话拒绝；空/缺失材料后消息列表仍为空。 | U、A |
| EDITOR-03 · 失败原因回看 | [error-feedback.test.ts](../tests/editor/error-feedback.test.ts)、[editor.spec.ts](../tests/e2e/editor.spec.ts)；SSE、刷新后的同一安全错误/requestId一致，成功重试清旧错误，不返回上游机密标记。 | U、B |
| EDITOR-04 · 个性化与历史 | [editor.test.ts](../tests/editor/editor.test.ts)、[digest-sources.test.ts](../tests/news/digest-sources.test.ts)、[docs/verification/ai-results.md](../docs/verification/ai-results.md)；兴趣快照、本人历史和实际来源保存；内容关联由实际模型样例核对。 | U、L |
| EDITOR-04 · 未填写兴趣 | [editor.test.ts](../tests/editor/editor.test.ts)、[digest-sources.test.ts](../tests/news/digest-sources.test.ts)；无兴趣日报含当日精选和补充兴趣提示，跨账号日报为空。 | U |
| EDITOR-04 · 等待空材料与失败 | [reader-workflows.test.ts](../tests/runtime/reader-workflows.test.ts)、[editor.test.ts](../tests/editor/editor.test.ts)、[history-tasks.spec.ts](../tests/e2e/history-tasks.spec.ts)；等待采集、空批次补生成、失败保留旧日报；页面成功/失败后可再次提交。 | U、B |
| EDITOR-04 · 事实与兴趣分析 | [digest-grounding.test.ts](../tests/editor/digest-grounding.test.ts)、[docs/verification/ai-results.md](../docs/verification/ai-results.md)；无依据关联片段被拒；四份实际输出核对事实、条件与兴趣分析。 | U、L |
| EDITOR-04 · 兴趣关联可核对 | [digest-grounding.test.ts](../tests/editor/digest-grounding.test.ts)；虚构 quote、偏好或来源被拒；空兴趣关联允许；旧日报不被非法结果覆盖。 | U |
| EDITOR-04 · 终态后再次生成 | [history-tasks.spec.ts](../tests/e2e/history-tasks.spec.ts)；日报和手记两分区成功/失败后按钮可用，新 operationId 不重复。 | B |
| EDITOR-05 · 管理偏好 | [editor.test.ts](../tests/editor/editor.test.ts)、[account.spec.ts](../tests/e2e/account.spec.ts)；自动记忆编辑后为 manual，删除后不在有效列表；浏览器添加、删除和刷新。 | U、B |
| EDITOR-05 · 明确设置优先 | [editor.test.ts](../tests/editor/editor.test.ts)；手动 response-style 保留，重复整理不会恢复已删自动记忆；回答准备仍用明确偏好。 | U |
| EDITOR-05 · 拒绝越权 | [editor.test.ts](../tests/editor/editor.test.ts)、[editor-api.test.ts](../tests/editor/editor-api.test.ts)、[security.test.ts](../apitest/cases/security.test.ts)；他人读改记忆为 404/无结果，当前账号列表不混入他人。 | U、A |
| EDITOR-06 · 连续整理 | [editor.test.ts](../tests/editor/editor.test.ts)、[reader-workflows.test.ts](../tests/runtime/reader-workflows.test.ts)；同日新增活动建立新批次，追加手记不重复来源编号，已处理位置只前进。 | U |
| EDITOR-06 · 重复与无活动 | [editor.test.ts](../tests/editor/editor.test.ts)断言重复批次skipped、不调模型及不恢复已删记忆；[history-tasks.spec.ts](../tests/e2e/history-tasks.spec.ts)两次无活动整理均明确提示没有新内容、不创建手记，刷新后保持。 | U、B |
| EDITOR-06 · 失败恢复 | [editor.test.ts](../tests/editor/editor.test.ts)、[digest-sources.test.ts](../tests/news/digest-sources.test.ts)；模型失败或提交回滚不推进游标、不保存半份手记；重试使用固定批次与来源。 | U |
| EDITOR-07 · 设置与调度 | [generation.test.ts](../tests/editor/generation.test.ts)、[generation.spec.ts](../tests/e2e/generation.spec.ts)；默认 manual；开始小时前无任务，每日成功不重复，updates 接受新材料；关闭后不调用模型。 | U、B |
| EDITOR-07 · 并发与重试额度 | [generation.test.ts](../tests/editor/generation.test.ts)；三次并发预留只有一次成功，重复执行 ID 不计次，重试耗尽后跳过；手动仍可预留。 | U |
| EDITOR-07 · 用量及上游额度 | [generation.test.ts](../tests/editor/generation.test.ts)；已知 token 累加、unknownCalls 单独计数；额度耗尽暂停、本人恢复且他人状态不变。 | U |
| EDITOR-07 · 私有设置与非法输入 | [generation.test.ts](../tests/editor/generation.test.ts)；匿名 401、dailyLimit=0 和伪造 userId 为 400；本人保存不影响另一个账号。startHour 越界由路由 schema 核查。 | U |
| EDITOR-08 · 保存与恢复 | [answer-feedback.test.ts](../tests/editor/answer-feedback.test.ts)、[feedback.spec.ts](../tests/e2e/feedback.spec.ts)；一条回答一份反馈，增改删与重开状态一致，删除会话级联删除反馈。 | U、B |
| EDITOR-08 · 状态与引用校验 | [answer-feedback.test.ts](../tests/editor/answer-feedback.test.ts)；未完成/用户消息/失败回答 409；他人或缺失 404；坏引用、类别、超长备注 400且未写入。 | U |
| EDITOR-08 · 聚合与备注隐私 | [answer-feedback.test.ts](../tests/editor/answer-feedback.test.ts)；管理员只得类别与公共来源，PRIVATE 标记、消息和账号 ID 不返回；普通账号 403。 | U |

## topics-and-insights

规格：[当前规格](../openspec/specs/topics-and-insights/spec.md)。

| Requirement / Scenario | 实际检查与判据 | 方式 / 结果索引 |
| --- | --- | --- |
| TOPIC-01 · 建立与匹配 | [topics.integration.test.ts](../tests/topics/topics.integration.test.ts)、[topics.spec.ts](../tests/e2e/topics.spec.ts)；自动关键词/事件匹配、手动加入去重；新增报道未读计数与页面内容一致。 | U、B |
| TOPIC-01 · 管理材料与笔记 | [reader-workflows.test.ts](../tests/runtime/reader-workflows.test.ts)、[topics.spec.ts](../tests/e2e/topics.spec.ts)；移除不回填、手动加入恢复；笔记预览、修改、刷新和删除持久。 | U、B |
| TOPIC-01 · 保存与再生成 | [topics-citation-snapshot.test.ts](../tests/topics/topics-citation-snapshot.test.ts)及[reader-workflows.test.ts](../tests/runtime/reader-workflows.test.ts)保留独立成果和原来源；[topics.spec.ts](../tests/e2e/topics.spec.ts)断言保存对话框默认当前专题ID/名称及查看成果入口。 | U、B |
| TOPIC-01 · 删除与权限 | [reader-workflows.test.ts](../tests/runtime/reader-workflows.test.ts)、[topics.integration.test.ts](../tests/topics/topics.integration.test.ts)；他人删改拒绝；成果删除后分享失效，公共报道保留，专题删除后不可读。 | U |
| TOPIC-01 · 无效条件 | [topics.integration.test.ts](../tests/topics/topics.integration.test.ts)、[news-topics-api.test.ts](../tests/topics/news-topics-api.test.ts)；空过滤条件拒绝且 HTTP 400；字段错误和保留输入需结合 UI-03 检查。 | U |
| TOPIC-01 · 并发部分更新 | [topics.integration.test.ts](../tests/topics/topics.integration.test.ts)；两个真实数据库并发部分更新保留名称、描述和原filter；越权后整行不变。 | U |
| TOPIC-02 · 关注与原因 | [reader-workflows.test.ts](../tests/runtime/reader-workflows.test.ts)、[topics.integration.test.ts](../tests/topics/topics.integration.test.ts)；重叠关注一条通知且两个原因；来源和报道关联不变。 | U |
| TOPIC-02 · 取消与持续进展 | [topics.integration.test.ts](../tests/topics/topics.integration.test.ts)；新报道增加通知，取消事件及专题关注后不增加；本人关注列表可读。 | U |
| TOPIC-02 · 已读与隔离 | [topics.integration.test.ts](../tests/topics/topics.integration.test.ts)、[reader-workflows.test.ts](../tests/runtime/reader-workflows.test.ts)；单条及全部已读更新本人计数，他人消息未读保持。 | U |
| TOPIC-02 · 失败与重复 | [topics.integration.test.ts](../tests/topics/topics.integration.test.ts)；通知插入触发器失败后零残留，恢复重试每账号一条且再次执行不增加。 | U |
| TOPIC-03 · 排名与趋势 | [reader-workflows.test.ts](../tests/runtime/reader-workflows.test.ts)、[topics.integration.test.ts](../tests/topics/topics.integration.test.ts)；近期排名与七日历史分别计数，上海日期及真实每日reportCount正确。 | U |
| TOPIC-03 · 时间线 | [topics.integration.test.ts](../tests/topics/topics.integration.test.ts)；相同发布时间按稳定ID排列，来源名称和原文链接保留。 | U |
| TOPIC-03 · 空数据与无效范围 | [news-topics-api.test.ts](../tests/topics/news-topics-api.test.ts)、[admin.spec.ts](../tests/e2e/admin.spec.ts)；非法时间范围 400；关系空状态可见。热点空结果提示没有独立浏览器断言。 | U、B |
| TOPIC-04 · 生成与操作 | [topics.integration.test.ts](../tests/topics/topics.integration.test.ts)核对树形结构和来源；[topics.spec.ts](../tests/e2e/topics.spec.ts)实际收起/展开生成导图，保存和刷新后层级仍在且可再次操作，节点来源和下载保留。语义见[AI结果](../docs/verification/ai-results.md)。 | U、B、L |
| TOPIC-04 · 结构和权限失败 | [editor.test.ts](../tests/editor/editor.test.ts)、[topics.integration.test.ts](../tests/topics/topics.integration.test.ts)、[usage-recording.test.ts](../tests/editor/usage-recording.test.ts)；非法树或材料外来源拒绝，无 artifact/complete，已有成果保留；Markdown 安全呈现另见 UI-02。 | U |
| TOPIC-05 · 查看与选择 | [topics.integration.test.ts](../tests/topics/topics.integration.test.ts)、[topics.spec.ts](../tests/e2e/topics.spec.ts)；图节点、边及来源正确；26对象分组布局、有效字号及完整关系列表检查。 | U、B |
| TOPIC-05 · 修正与来源 | [news-quality.test.ts](../tests/news/news-quality.test.ts)、[topics.integration.test.ts](../tests/topics/topics.integration.test.ts)；错误端点/来源拒绝；新闻改归属后图边消失；旧版本不能覆盖新图。 | U |
| TOPIC-05 · 查询失败 | [topics.integration.test.ts](../tests/topics/topics.integration.test.ts)核对存储查询失败；[topics.spec.ts](../tests/e2e/topics.spec.ts)模拟图谱503，检查错误/重试、专题标题、原笔记和报道链接保留，恢复后重试显示图谱。 | U、B |
| TOPIC-06 · 预览与发布 | [topics.integration.test.ts](../tests/topics/topics.integration.test.ts)、[news-topics-api.test.ts](../tests/topics/news-topics-api.test.ts)、[topics.spec.ts](../tests/e2e/topics.spec.ts)；公开分享与预览逐值一致，创建日期取已保存成果，三种视口显示一致。公开页保留标题、内容和公共来源。 | U、B |
| TOPIC-06 · 撤销 | [topics.integration.test.ts](../tests/topics/topics.integration.test.ts)、[topics.spec.ts](../tests/e2e/topics.spec.ts)；重复撤销后链接 NOT_FOUND，原预览仍可读；浏览器分享失效提示。 | U、B |
| TOPIC-06 · 越权与失效 | [topics.integration.test.ts](../tests/topics/topics.integration.test.ts)、[news-topics-api.test.ts](../tests/topics/news-topics-api.test.ts)；他人保存、分享、撤销统一拒绝，不变更已有成果。 | U |
| TOPIC-07 · 分组与空状态 | [topics.integration.test.ts](../tests/topics/topics.integration.test.ts)、[progress.spec.ts](../tests/e2e/progress.spec.ts)；首次范围、分组、摘要、202条只展示200条及截断标记；确认后空状态刷新保持。 | U、B |
| TOPIC-07 · 确认期间新增 | [topics.integration.test.ts](../tests/topics/topics.integration.test.ts)；旧批次确认不标记后来报道，重复旧确认不回退已读位置。 | U |
| TOPIC-07 · 私人范围 | [news-topics-api.test.ts](../tests/topics/news-topics-api.test.ts)、[topics.integration.test.ts](../tests/topics/topics.integration.test.ts)；他人404、匿名401、未来截止时间400；拒绝不推进位置。 | U |
| TOPIC-07 · 事务重叠 | [topics.integration.test.ts](../tests/topics/topics.integration.test.ts)；真实重叠事务等待专题锁；使用加入时刻，旧窗口确认后新报道仍未读。 | U |
| TOPIC-08 · 内容与下载 | [export.test.ts](../tests/topics/export.test.ts)、[topics.spec.ts](../tests/e2e/topics.spec.ts)；实际HTTP和浏览器下载保留正文、时间、来源和三层导图；文件名无换行，排除私人笔记。 | U、B |
| TOPIC-08 · 权限与大小 | [export.test.ts](../tests/topics/export.test.ts)；匿名401、他人/缺失404；超过1 MiB返回400，不生成假成功下载。 | U |

## reading-interface

规格：[当前规格](../openspec/specs/reading-interface/spec.md)。

| Requirement / Scenario | 实际检查与判据 | 方式 / 结果索引 |
| --- | --- | --- |
| UI-01 · 页面导航 | [news.spec.ts](../tests/e2e/news.spec.ts)、[account.spec.ts](../tests/e2e/account.spec.ts)、[editor.spec.ts](../tests/e2e/editor.spec.ts)及[topics.spec.ts](../tests/e2e/topics.spec.ts)检查切换、返回、刷新及URL状态；未知路由与缺失专题均有错误和可操作的返回入口。 | B |
| UI-01 · 内容层级 | [news.spec.ts](../tests/e2e/news.spec.ts)、[editor.spec.ts](../tests/e2e/editor.spec.ts)、[docs/standards/product.md](../docs/standards/product.md)；长正文与编辑区三视口截图、无溢出；配色/侧栏样式按产品规范人工核对。 | B、核查 |
| UI-01 · 登录衔接 | [account.spec.ts](../tests/e2e/account.spec.ts)、[topics.spec.ts](../tests/e2e/topics.spec.ts)；登录回目标页面、刷新身份及收藏显示；关注刷新状态需结合专题行为记录。 | B |
| UI-02 · 完整正文 | [news.spec.ts](../tests/e2e/news.spec.ts)、[topics.spec.ts](../tests/e2e/topics.spec.ts)；多级标题、嵌套列表、表格、代码、任务列表、正文宽度及笔记Markdown实际渲染。 | B |
| UI-02 · 引用与流式文本 | [editor.spec.ts](../tests/e2e/editor.spec.ts)、[skills.spec.ts](../tests/e2e/skills.spec.ts)；引用对应站内来源、简报正文只一份；手动上翻保持位置并回到正文。 | B |
| UI-02 · 回答与检索材料 | [editor.spec.ts](../tests/e2e/editor.spec.ts)；20篇材料默认只展示2篇实际引用，Enter展开/折叠其余18篇；非连续编号及刷新保持。 | B |
| UI-02 · 外部内容 | [news-title-security.test.ts](../tests/runtime/news-title-security.test.ts)、[news.spec.ts](../tests/e2e/news.spec.ts)、[src/web/components/content.tsx](../src/web/components/content.tsx)；标题HTML转义及脚本不执行；共享Markdown跳过HTML并采用安全URL转换，正文危险链接见代码核查。 | U、B |
| UI-03 · 输入与切换 | [editor.spec.ts](../tests/e2e/editor.spec.ts)、[feedback.spec.ts](../tests/e2e/feedback.spec.ts)；笔记本740高与三视口输入框可见，选材后完整输入和发送、切换新会话及恢复旧历史，停止回答后刷新仍可重试。 | B |
| UI-03 · 保存与失败 | [account.spec.ts](../tests/e2e/account.spec.ts)、[topics.spec.ts](../tests/e2e/topics.spec.ts)、[skills.spec.ts](../tests/e2e/skills.spec.ts)、[generation.spec.ts](../tests/e2e/generation.spec.ts)；设置、笔记、技能公开表单及自动策略保存/刷新；实际字段错误保留输入。 | B |
| UI-03 · 账号输入与服务错误 | [error-feedback.test.ts](../tests/editor/error-feedback.test.ts)、[account.spec.ts](../tests/e2e/account.spec.ts)；用户名/密码长度、冲突与认证错误文案；跨表单清旧错、保留新密码，不显示无关排查编号。注册按钮显示“创建账号”，提交后按原返回地址导航。 | U、B |
| UI-03 · 异步结果 | [history-tasks.spec.ts](../tests/e2e/history-tasks.spec.ts)、[runtime.mjs](../scripts/verification/runtime.mjs)；成功/失败后可再次生成；真实 Worker 手机流程观察 202、状态与正文，用量页面说明调用次数包含失败重试。 | B、R |
| UI-04 · 窄屏与长内容 | [news.spec.ts](../tests/e2e/news.spec.ts)、[editor.spec.ts](../tests/e2e/editor.spec.ts)、[topics.spec.ts](../tests/e2e/topics.spec.ts)；390/768/1440布局、正文和输入区边界、关系图列表及内容无横向溢出。 | B |
| UI-04 · 键盘与弹窗 | [editor.spec.ts](../tests/e2e/editor.spec.ts)、[src/web/components/ui.tsx](../src/web/components/ui.tsx)；材料对话框Enter打开，焦点进入对话框；Escape关闭后回到触发按钮，表单标签可定位。 | B |
| UI-04 · 完整阅读过程 | [topics.spec.ts](../tests/e2e/topics.spec.ts)、[editor.spec.ts](../tests/e2e/editor.spec.ts)、[docs/verification/ai-results.md](../docs/verification/ai-results.md)、[reports/reading-workflows.md](../reports/reading-workflows.md)；阅读、选材、问答、技能、成果、分享和回看有隔离端到端及截图；实际模型事实按历史评测分开核对。 | B、L |
| UI-05 · 新建会话与旧数据 | [editor.spec.ts](../tests/e2e/editor.spec.ts)；将旧会话GET挂起，新建并输入草稿后才释放；消息仍为空、草稿不变，回原URL可读原内容。 | B |

## runtime-operations

规格：[当前规格](../openspec/specs/runtime-operations/spec.md)。

| Requirement / Scenario | 实际检查与判据 | 方式 / 结果索引 |
| --- | --- | --- |
| OPS-01 · 文档启动 | [runtime.mjs](../scripts/verification/runtime.mjs)、[compose.yaml](../compose.yaml)、[reports/boot-reproduce.md](../reports/boot-reproduce.md)；干净源码构建并启动真实API/Worker/数据库/Redis；健康状态ready且版本匹配；持久卷在Compose声明。 | R |
| OPS-01 · 缺配置 | [config.test.ts](../tests/runtime/config.test.ts)；缺失数据库或模型配置按名称抛错，非法敏感值不进入错误输出；进程入口须由启动检查承接非零退出。 | U |
| OPS-01 · 依赖未就绪 | [runtime.mjs](../scripts/verification/runtime.mjs)、[src/server/base-app.ts](../src/server/base-app.ts)；真实不可用数据库连接使health503/database=false；Redis客户端断开使health503/queue=false，两者live仍200。补充断言见[运行接口测试](../apitest/cases/runtime.test.ts)。 | A |
| OPS-01 · 队列故障接收 | [src/server/runtime/tasks.ts](../src/server/runtime/tasks.ts)、[src/server/base-app.ts](../src/server/base-app.ts)；Redis客户端断开后实际POST返回202，任务pending且outbox存在；重连并启动Worker后成功且仅一篇新闻。见[运行接口测试](../apitest/cases/runtime.test.ts)。 | A |
| OPS-02 · 接收与查询 | [tasks.test.ts](../tests/runtime/tasks.test.ts)、[runtime.test.ts](../apitest/cases/runtime.test.ts)；重复GET执行次数仍0；两档各20次提交202且不含生成结果，提交耗时远小于处理。 | U、A |
| OPS-02 · 同一操作 | [tasks.test.ts](../tests/runtime/tasks.test.ts)；同操作同参数复用ID，异参CONFLICT；输入快照保持首次，其他账号不能读。 | U |
| OPS-02 · 停止与恢复 | [tasks.test.ts](../tests/runtime/tasks.test.ts)、[runtime.test.ts](../apitest/cases/runtime.test.ts)、[runtime.mjs](../scripts/verification/runtime.mjs)；无Worker时pending/attempts0，恢复后真实处理完成，无再次提交。 | U、A、R |
| OPS-02 · 确认前中断 | [runtime.test.ts](../apitest/cases/runtime.test.ts)；业务提交后SIGKILL，重启至队列completed；新闻数量和模型调用不增加。 | A |
| OPS-02 · 执行资格和目标 | [tasks.test.ts](../tests/runtime/tasks.test.ts)、[news-quality.test.ts](../tests/news/news-quality.test.ts)、[security.test.ts](../apitest/cases/security.test.ts)；旧执行不能覆盖新结果；已停用信源和被撤管理员执行拒绝；已取消关注不产生通知见TOPIC-02。 | U、A |
| OPS-02 · 有限重试和死信 | [tasks.test.ts](../tests/runtime/tasks.test.ts)、[generation.test.ts](../tests/editor/generation.test.ts)、[reports/async-response.md](../reports/async-response.md)；永久错误一次进入死信，额度暂停；历史暂态失败三次尝试、退避和死信计数。当前暂态重试链待定向运行。 | U、历史 |
| OPS-02 · 人工重放 | [tasks.test.ts](../tests/runtime/tasks.test.ts)；重复重放仅generation2、两次调用/尝试，普通用户FORBIDDEN，终态历史保留。 | U |
| OPS-02 · 队列消息缺失 | [tasks.test.ts](../tests/runtime/tasks.test.ts)；人为标记outbox已投递却无队列消息，重启后补投并成功；成功任务重投不重复。 | U |
| OPS-02 · 私人任务 | [tasks.test.ts](../tests/runtime/tasks.test.ts)、[runtime.mjs](../scripts/verification/runtime.mjs)；本人可读，B及管理员NOT_FOUND，匿名401；手机B请求404并回查审计。 | U、R |
| OPS-03 · 输入失败 | [error-feedback.test.ts](../tests/editor/error-feedback.test.ts)、[news-topics-api.test.ts](../tests/topics/news-topics-api.test.ts)；字段、筛选、日期错误HTTP400并定位，注册/编辑计数不变。 | U、A |
| OPS-03 · 接收事务失败 | [tasks.test.ts](../tests/runtime/tasks.test.ts)、[runtime.test.ts](../apitest/cases/runtime.test.ts)；事务回滚只保留原任务/outbox；outbox插入触发器失败HTTP500且无孤儿任务。 | U、A |
| OPS-03 · 投递中断 | [tasks.test.ts](../tests/runtime/tasks.test.ts)、[runtime.test.ts](../apitest/cases/runtime.test.ts)；缺失消息补投、重复投递去重、确认前中断恢复；入队与outbox标记间窗口由同一任务ID去重核查。 | U、A |
| OPS-03 · 结果提交失败 | [tasks.test.ts](../tests/runtime/tasks.test.ts)、[editor.test.ts](../tests/editor/editor.test.ts)、[digest-grounding.test.ts](../tests/editor/digest-grounding.test.ts)；结果事务异常回滚输出并保留pending；手记游标、记忆和旧日报不被半份结果改变。 | U |
| OPS-03 · SSE失败 | [editor-api.test.ts](../tests/editor/editor-api.test.ts)、[error-feedback.test.ts](../tests/editor/error-feedback.test.ts)；SSE失败有error及requestId、无complete；客户端和保存结果保持failed。 | U、A |
| OPS-04 · 追踪请求 | [security.test.ts](../apitest/cases/security.test.ts)、[skill-audit.test.ts](../apitest/cases/skill-audit.test.ts)、[usage-recording.test.ts](../tests/editor/usage-recording.test.ts)；按requestId关联操作者、技能、结果、耗时及实际用量，机密标记不进入日志。 | A、U |
| OPS-04 · 自动检查 | [stages.mjs](../scripts/checks/stages.mjs)、[test-pipeline.mjs](../scripts/checks/test-pipeline.mjs)、[test-acceptance.mjs](../scripts/checks/test-acceptance.mjs)；隔离数据/替身和失败即停阶段；执行按入口表，不能用源码映射替代运行结果。 | 工程检查 |
| OPS-04 · 异步耗时证据 | [runtime.test.ts](../apitest/cases/runtime.test.ts)；两档200/600毫秒各20个独立操作保存样本/P95/完整耗时，阈值在断言中明确。 | A |
| OPS-04 · 实际产品检查 | [阅读反馈](feedback.md)记录实际阅读、问答、日报、专题及分享。五项技能的历史输出见[评测记录](../docs/verification/ai-results.md)，三视口操作见[阅读流程验证](reading-workflows.md)。 | L、B、记录 |
| OPS-04 · 校验失败保留用量 | [usage-recording.test.ts](../tests/editor/usage-recording.test.ts)、[usage-recording.ts](../tests/evaluation/usage-recording.ts)；JSON/schema/材料失败后日志和消息保留10/20/30；未知字段为null且无私有正文。 | U |
| OPS-04 · 流式失败保留已取得用量 | [model.test.ts](../tests/runtime/model.test.ts)、[editor.test.ts](../tests/editor/editor.test.ts)；截断流保留已取得用量，多轮失败累加已知字段，未知输出/总量仍null。 | U |
| OPS-05 · 发布和停止 | [docs/runtime.md](../docs/runtime.md)、[reports/boot-reproduce.md](../reports/boot-reproduce.md)、[runtime.test.ts](../apitest/cases/runtime.test.ts)；历史版本切换/停止与实际健康记录；当前干净版本启动及中断恢复独立对应，未声明公网发布。 | 历史、R |
| OPS-05 · 恢复演练 | [docs/runtime.md](../docs/runtime.md)、[restore.sh](../scripts/operations/restore.sh)；已有隔离恢复记录核对账号、新闻、关联数量和耗时；当前版本未重新执行恢复。 | 历史 |
| OPS-05 · 备份无效 | [docs/runtime.md](../docs/runtime.md)、[restore.sh](../scripts/operations/restore.sh)；历史记录拒绝无效备份和非空目标，保留原数据；脚本先校验后事务恢复。 | 历史 |
| OPS-06 · 生成接口定义 | [openapi.test.ts](../apitest/cases/openapi.test.ts)；完整OpenAPI200、版本、路径权限、参数及裸定义结构与实际HTTP一致。 | A |
| OPS-06 · 浏览接口文档 | [openapi.test.ts](../apitest/cases/openapi.test.ts)、[openapi.spec.ts](../tests/e2e/openapi.spec.ts)；文档HTML/JS/CSS与定义200，浏览器显示业务操作且无定义加载错误。 | A、B |
| OPS-06 · 创建与异步响应 | [openapi.test.ts](../apitest/cases/openapi.test.ts)逐路由核对201及202声明，任务三个必需字段；实际注册201及采集202的信封和statusUrl一致。 | A |
| OPS-06 · 流式响应声明 | [openapi.test.ts](../apitest/cases/openapi.test.ts)断言成功200只有text/event-stream、schema为string，401仍为JSON；[editor-api.test.ts](../tests/editor/editor-api.test.ts)核对实际SSE头和事件。 | A、U |
| OPS-06 · 文档写请求 | [openapi.spec.ts](../tests/e2e/openapi.spec.ts)通过Swagger连续两次受保护PATCH，各取得新token并持久修改名字；无效令牌实际返回401，页面显示401/UNAUTHENTICATED且无pageerror。越权及会话边界另由[csrf.test.ts](../apitest/cases/csrf.test.ts)与[security.test.ts](../apitest/cases/security.test.ts)承接。 | B、A |

## contribution-workflow

规格：[当前规格](../openspec/specs/contribution-workflow/spec.md)。

| Requirement / Scenario | 实际检查与判据 | 方式 / 结果索引 |
| --- | --- | --- |
| FLOW-01 · 从仓库进入开发 | [README.md](../README.md)、[docs/README.md](../docs/README.md)、[CONTRIBUTING.md](../CONTRIBUTING.md)、[check-repository.mjs](../scripts/checks/check-repository.mjs)；阅读入口语义与本地链接/锚点分别检查；命令 npm run check:repo -- --base main。 | 核查 |
| FLOW-01 · 新增检查工具 | [openspec/changes](../openspec/changes)、[check-commits.mjs](../scripts/checks/check-commits.mjs)；将工具diff与四类规约及提交顺序对照；提交检查读取每笔提交当时的文件树。 | 核查 |
| FLOW-01 · 修正文档 | [openspec/changes](../openspec/changes)、[CONTRIBUTING.md](../CONTRIBUTING.md)；对照相关proposal/design/spec/tasks中的修正对象、原因、检查方法与文档diff。 | 核查 |
| FLOW-01 · 查阅完整产品规划 | [docs/README.md](../docs/README.md)、[openspec/specs](../openspec/specs)、[openspec/changes](../openspec/changes)；逐项对照现行行为、未实现目标和已承接历史规划，不把链接通过当作完成。 | 核查 |
| FLOW-01 · 组织一次增量变更 | [openspec/changes](../openspec/changes)、[CONTRIBUTING.md](../CONTRIBUTING.md)；以proposal/tasks和实际diff核对本次范围、其他已确认目标及真实状态。 | 核查 |
| FLOW-01 · 调整产品文档位置 | [check-repository.mjs](../scripts/checks/check-repository.mjs)、[docs/README.md](../docs/README.md)；对照迁移前后需求、场景、任务状态与入口；文件检查只承接链接。 | 核查 |
| FLOW-02 · 实施明确的任务 | [docs/standards/review.md](../docs/standards/review.md)、[openspec/changes](../openspec/changes)；逐项对照tasks、Scenario、实现及测试diff，行为由本表相应检查承接。 | 核查 |
| FLOW-02 · 需求发生变化 | [CONTRIBUTING.md](../CONTRIBUTING.md)、[openspec/changes](../openspec/changes)；确认的需求与规格/实现diff对应；重要变更的先后关系由Git记录核对。 | 核查 |
| FLOW-03 · 完成变更检查 | [docs/standards/review.md](../docs/standards/review.md)、[reports/README.md](../reports/README.md)；按范围、行为、权限、数据及证据核对实际diff，结果依真实运行填写。 | 核查 |
| FLOW-03 · 必要检查未通过 | [test-pipeline.mjs](../scripts/checks/test-pipeline.mjs)、[openspec/changes](../openspec/changes)；断言失败阶段非零、后续not-run；另核对任务勾选与失败报告一致。 | 工程检查、核查 |
| FLOW-04 · 查看提交依据 | [check-commits.mjs](../scripts/checks/check-commits.mjs)、[test-checks.mjs](../scripts/checks/test-checks.mjs)；核对Conventional Commits、OpenSpec和需求/任务编号，人工对照提交内容。 | 工程检查、核查 |
| FLOW-05 · 变更完成 | [openspec/changes](../openspec/changes)、[openspec/specs](../openspec/specs)；完成证据与任务一致后核对主规格/归档，运行 npm run check:specs 和文件检查。 | 工程检查、核查 |
| FLOW-05 · 仍有未完成内容 | [openspec/changes](../openspec/changes)、[reports/README.md](../reports/README.md)；活动tasks的未完成项与实际实现、失败/未运行记录一致。 | 核查 |
| FLOW-05 · 产品仍有后续能力 | [openspec/specs](../openspec/specs)、[openspec/changes](../openspec/changes)、[docs/README.md](../docs/README.md)；已交付主规格和未交付活动变更范围分别保留有效入口。 | 核查 |
| FLOW-05 · 归档已由产品文档承接的规划 | [openspec/changes/archive/2026-10-28-newsclaw-foundation](../openspec/changes/archive/2026-10-28-newsclaw-foundation)、[docs/README.md](../docs/README.md)；核对原规划内容、原任务状态及后续承接关系；原规划勾选不代替当前状态。 | 核查 |
| FLOW-06 · 检查仓库变更 | [stages.mjs](../scripts/checks/stages.mjs)、[test-pipeline.mjs](../scripts/checks/test-pipeline.mjs)；目录包含各检查组，失败退出且停止后续；使用 npm run test:checks。 | 工程检查 |
| FLOW-06 · 完整应用检查 | [test-pipeline.mjs](../scripts/checks/test-pipeline.mjs)；阶段ID唯一、分组并集等于完整目录、失败后not-run；实际全阶段运行另列。 | 工程检查 |
| FLOW-06 · 默认检查模型调用用量 | [test-pipeline.mjs](../scripts/checks/test-pipeline.mjs)、[usage-recording.ts](../tests/evaluation/usage-recording.ts)；application组含usage；实际对照成功与结构失败的日志/消息10/20/30。 | 工程检查、U |
| FLOW-06 · 执行单项或 CI 分组 | [test-pipeline.mjs](../scripts/checks/test-pipeline.mjs)、[package.json](../package.json)、[Makefile](../Makefile)、[.github/workflows/pr-checks.yml](../.github/workflows/pr-checks.yml)；完整组、分组及单项共用同目录且无重复。 | 工程检查 |
| FLOW-06 · 检查 PR 的合并结果 | [.github/workflows/pr-checks.yml](../.github/workflows/pr-checks.yml)、[test-checks.mjs](../scripts/checks/test-checks.mjs)；checkout合并结果，提交检查传事件base/head；平台merge提交排除、开发者提交仍检查。 | 工程检查 |
| FLOW-07 · 文档和规格有效 | [test-checks.mjs](../scripts/checks/test-checks.mjs)；有效链接、图片、重复标题、隐藏文档和代码示例退出0；真实OpenSpec严格校验。 | 工程检查 |
| FLOW-07 · 文件或规格无效 | [test-checks.mjs](../scripts/checks/test-checks.mjs)；断链、锚点、冲突、空白、越界、忽略目标和越界symlink失败；无Scenario规格失败。 | 工程检查 |
| FLOW-08 · 规约与实施分别提交 | [test-checks.mjs](../scripts/checks/test-checks.mjs)；临时Git仓中规约提交和实施提交分别引用需求/任务，均退出0。 | 工程检查 |
| FLOW-08 · 引用归档变更 | [test-checks.mjs](../scripts/checks/test-checks.mjs)；变更移入archive后提交，引用仍被识别。 | 工程检查 |
| FLOW-08 · 引用缺失或事后补写 | [test-checks.mjs](../scripts/checks/test-checks.mjs)；缺引用、未知编号、不完整规约、无效基线及事后补写均失败。 | 工程检查 |
| FLOW-09 · 当前或历史文件含密钥 | [test-security.mjs](../scripts/checks/test-security.mjs)；合成密钥导致真实Gitleaks失败且输出无明文，提交后删除仍从历史检出。 | 工程检查 |
| FLOW-09 · 默认范围与额外路径 | [test-security.mjs](../scripts/checks/test-security.mjs)；忽略.env默认不扫描、显式传入则检查；额外路径缺失时报错。 | 工程检查 |
| FLOW-10 · 审计结果按严重程度判定 | [test-security.mjs](../scripts/checks/test-security.mjs)；npm替身核对audit --audit-level=high，clean/high分别判定；真实审计由安全入口执行。 | 工程检查 |
| FLOW-10 · 审计不可用 | [test-security.mjs](../scripts/checks/test-security.mjs)；审计服务不可用时非零并保留错误，不跳过。 | 工程检查 |
| FLOW-11 · 从工作区执行 | [test-acceptance.mjs](../scripts/checks/test-acceptance.mjs)、[reports/boot-reproduce.md](../reports/boot-reproduce.md)；普通checkout/worktree复制公开修改与真实Git历史，生成source元数据；Docker实际启动另有R记录。 | 工程检查 |
| FLOW-11 · 保护运行环境 | [test-acceptance.mjs](../scripts/checks/test-acceptance.mjs)；.env及旧.local不复制，原README不变，独立Compose项目名约束创建/清理。 | 工程检查 |
| FLOW-11 · 失败与中断 | [test-acceptance.mjs](../scripts/checks/test-acceptance.mjs)、[test-pipeline.mjs](../scripts/checks/test-pipeline.mjs)；构建/启动/检查/清理失败及SIGTERM均保留非零和not-run，清理失败改变总体结果。 | 工程检查 |
| FLOW-12 · 安全门禁通过 | [Makefile](../Makefile)、[stages.mjs](../scripts/checks/stages.mjs)；make check-security串联扫描、工具、SQL/CSRF/审计/API和浏览器XSS，任一命令失败停止。 | 工程检查 |
| FLOW-12 · 安全反例失败 | [test-security.mjs](../scripts/checks/test-security.mjs)、[csrf.test.ts](../apitest/cases/csrf.test.ts)、[reports/gate-red-green.md](../reports/gate-red-green.md)；密钥、高危及token重放反例有失败断言，历史门禁故意破坏记录分开保留。 | 工程检查、历史 |
| FLOW-12 · 安全门禁缺少隔离依赖 | [Makefile](../Makefile)、[check.mjs](../scripts/checks/check.mjs)；隔离数据库/队列/浏览器不可用须让make check-security实际失败；现有入口无跳过分支，本次未执行该故障。 | 工程检查待运行 |
| FLOW-12 · main 推送与 PR 使用同一安全门禁 | [.github/workflows/pr-checks.yml](../.github/workflows/pr-checks.yml)；push/main和pull_request/main同用三组检查及make check-security，提交组取事件base/head。 | 核查 |
| FLOW-13 · 推送后构建 | [.github/workflows/pr-checks.yml](../.github/workflows/pr-checks.yml)、[reports/pipeline.md](../reports/pipeline.md)；image-build依赖三组检查，镜像标签取BUILD_SHA；构建 #19 的作业与镜像标识见流水线记录。 | 核查、历史 |

## engineering-standards

规格：[当前规格](../openspec/specs/engineering-standards/spec.md)。

| Requirement / Scenario | 实际检查与判据 | 方式 / 结果索引 |
| --- | --- | --- |
| STD-01 · 查找领域规范 | [README.md](../README.md)、[AGENTS.md](../AGENTS.md)、[CONTRIBUTING.md](../CONTRIBUTING.md)、[docs/standards](../docs/standards)；阅读规范入口及检查办法，运行本地链接检查。 | 核查 |
| STD-01 · 使用工作流 | [openspec/config.yaml](../openspec/config.yaml)、[.agents/skills/newsclaw-test/SKILL.md](../.agents/skills/newsclaw-test/SKILL.md)；工作流要求先读适用规范，模型任务可找到ai-cases。 | 核查 |
| STD-02 · 修改提示词或技能处理 | [docs/standards/ai.md](../docs/standards/ai.md)、[docs/verification/ai-cases.md](../docs/verification/ai-cases.md)、[skills.test.ts](../tests/skills/skills.test.ts)；提示词diff可追溯；个人副本不受模板覆盖、显式优先与停用拒绝有断言。 | U、核查 |
| STD-02 · 无效来源与调用失败 | [editor.test.ts](../tests/editor/editor.test.ts)；MCP越权NOT_FOUND、身份字段INVALID_INPUT；failure/truncated/bad-citation无complete/text且保留旧成功回答。 | U |
| STD-03 · 按样例检查行为 | [docs/verification/ai-cases.md](../docs/verification/ai-cases.md)、[docs/verification/ai-results.md](../docs/verification/ai-results.md)；逐样例读材料、需求、输入和预期；模型语义从实际输出核对，不从替身输出推断。 | 核查、L |
| STD-03 · 功能尚未实现 | [docs/verification/ai-cases.md](../docs/verification/ai-cases.md)、[openspec/changes](../openspec/changes)；对照样例与相关功能状态，未执行不能写成模型通过。 | 核查 |
| STD-04 · 修改数据结构 | [migrations](../migrations)、[docs/standards/data.md](../docs/standards/data.md)、[helpers.ts](../tests/support/helpers.ts)；迁移随代码，隔离库从迁移创建并验证读写；历史数据影响按变更单独核对。 | U、核查 |
| STD-04 · 删除或撤销内容 | [news.integration.test.ts](../tests/news/news.integration.test.ts)、[editor.test.ts](../tests/editor/editor.test.ts)、[topics.integration.test.ts](../tests/topics/topics.integration.test.ts)；取消收藏保留新闻，删除记忆不复活，撤销分享后404而本人预览仍在。 | U |
| STD-05 · 检查一次变更 | [docs/standards/review.md](../docs/standards/review.md)；逐项对照需求、diff和对应执行结果，不能以任务勾选代替行为检查。 | 核查 |
| STD-05 · 必要检查未完成 | [test-pipeline.mjs](../scripts/checks/test-pipeline.mjs)、[openspec/changes](../openspec/changes)；失败/跳过/not-run保留，任务状态与实际必要检查一致。 | 工程检查、核查 |
| STD-05 · 形成具体评审结论 | [docs/verification/code-review.md](../docs/verification/code-review.md)、[reports/review-01.md](../reports/review-01.md)、[reports/review-02.md](../reports/review-02.md)、[reports/review-03.md](../reports/review-03.md)；记录对象、规约、手段、判据、实际发现及结论，未适用部分写明范围。 | 核查 |
| STD-06 · 准备权限与写入检查 | [docs/verification/security.md](../docs/verification/security.md)、[reports/security-precheck.md](../reports/security-precheck.md)、[security.test.ts](../apitest/cases/security.test.ts)、[audit.test.ts](../apitest/cases/audit.test.ts)；身份、对象、操作与401/403/404及数据断言对应，合法访问一并检查。 | A、核查 |
| STD-06 · 应用尚未实现 | [docs/verification/security.md](../docs/verification/security.md)、[openspec/changes](../openspec/changes)；条件性流程：无接口时只保留前提/预期，不能填写运行通过。 | 核查 |
| STD-06 · 准备问答与注入样例 | [docs/verification/ai-cases.md](../docs/verification/ai-cases.md)、[prompt-injection.ts](../tests/evaluation/prompt-injection.ts)；材料充分/不足/越权样例有输入和预期，真实模型需显式RUN_LIVE_AI。 | 核查、L |
| STD-06 · 检查失败调用的用量 | [usage-recording.ts](../tests/evaluation/usage-recording.ts)；成功和bad-bilingual的状态、主体、技能、耗时与日志/消息10/20/30一致，失败退出1。 | U |
| STD-07 · 查阅一次检查 | [reports/README.md](../reports/README.md)、[docs/standards/review.md](../docs/standards/review.md)；逐份核对版本、对象、命令、预期、关键输出及实际结论，公开记录可独立阅读。 | 核查 |
| STD-07 · 更新报告与保护材料 | [.gitignore](../.gitignore)、[editor-evaluation.ts](../tests/evaluation/editor-evaluation.ts)、[test-acceptance.mjs](../scripts/checks/test-acceptance.mjs)；.local被忽略，评测默认verification且支持显式输出；旧材料不复制或覆盖。 | 工程检查、核查 |
| STD-07 · 检查评审与代码审查 | [reports/review-01.md](../reports/review-01.md)、[reports/review-02.md](../reports/review-02.md)、[docs/verification/code-review.md](../docs/verification/code-review.md)；检查项记录与文件职责评审分别有依据，文件总体结论不冲突。 | 核查 |
| STD-07 · 检查主体与覆盖范围 | [reports/README.md](../reports/README.md)、[docs/standards/review.md](../docs/standards/review.md)；对照执行方式、范围、受检版本与脱敏材料，实际未运行的检查保持未运行。 | 核查 |
| STD-07 · 实际使用反馈 | [阅读反馈](feedback.md)保存三位读者的浏览器操作、应用内标识、期望差异、处理去向及修复复验结果。 | 核查、实际使用记录 |
| STD-08 · 查找一个功能的实现 | [docs/README.md](../docs/README.md)、[docs/modules](../docs/modules)、[src/server/modules](../src/server/modules)、[tests](../tests)；从功能入口找到路由、业务、存储、测试与规格，共享能力有明确位置。 | 核查 |
| STD-08 · 组织页面与共享组件 | [src/web](../src/web)、[e2e](../tests/e2e)；页面/组件重组diff与实际浏览器行为对应；目录结构本身不证明视觉一致。 | B、核查 |
| STD-08 · 调整测试和工具位置 | [package.json](../package.json)、[Makefile](../Makefile)、[playwright.config.ts](../playwright.config.ts)、[stages.mjs](../scripts/checks/stages.mjs)、[test-pipeline.mjs](../scripts/checks/test-pipeline.mjs)；各入口引用有效路径，组与单项同源；真实模型评测保留显式启用条件。 | 工程检查、核查 |
| STD-09 · 阅读业务检查 | [test-report.mjs](../scripts/checks/test-report.mjs)、[test-pipeline.mjs](../scripts/checks/test-pipeline.mjs)核对报告结构及附件。Chromium 三种宽度无横向溢出，搜索 OPS-01 显示 3 条，清除筛选恢复 286 条。 | 工程检查、V |
| STD-09 · 检查结果不完整 | [test-pipeline.mjs](../scripts/checks/test-pipeline.mjs)、[test-report.mjs](../scripts/checks/test-report.mjs)；失败停止后续，not-run/中断/缺结果保留，错误转义，危险附件路径不链接。 | 工程检查 |
| STD-09 · 连续运行与附件 | [test-acceptance.mjs](../scripts/checks/test-acceptance.mjs)、[test-report.mjs](../scripts/checks/test-report.mjs)、[pipeline.mjs](../scripts/checks/pipeline.mjs)；每轮独立目录，仅采集本轮存在输出，旧材料不覆盖、缺附件不造链接。 | 工程检查 |
| STD-09 · 调用用量检查失败 | [test-pipeline.mjs](../scripts/checks/test-pipeline.mjs)、[usage-recording.ts](../tests/evaluation/usage-recording.ts)；usage结果退出1时总体failed，保留实际差异和可打开附件，不记预期通过。 | 工程检查 |
| STD-09 · 已登记的审查问题 | [test-report.mjs](../scripts/checks/test-report.mjs)；reviewSummary保留待处理原判定并转义，提供审查文件链接。 | 工程检查 |
| STD-10 · 查看覆盖率 | [stages.mjs](../scripts/checks/stages.mjs)、[pipeline.mjs](../scripts/checks/pipeline.mjs)；unit启用Node覆盖率且只统计src/server，lcov列为附件；干净版本的行/分支/函数为93.96%／86.33%／86.38%，均通过门槛。 | 工程检查、U |
| STD-10 · 低于门槛 | [test-pipeline.mjs](../scripts/checks/test-pipeline.mjs)；加载未调用函数且函数门槛100，断言测试passed但阶段failed/exit1，lcov含源码路径。 | 工程检查 |
| STD-11 · 查找场景检查 | 将现行规格的唯一Scenario集合逐项对照本表；每项都给出断言或工程检查，部分覆盖与未运行项明确保留。 | 核查；本表完整性检查 |
| STD-11 · 按记录复跑 | [runtime.mjs](../scripts/verification/runtime.mjs)准备隔离配置、账号、来源、模型替身和真实Worker；手机完整状态链及404审计实际输出见[运行记录](boot-reproduce.md)。 | R |

## performance-verification

规格：[当前规格](../openspec/specs/performance-verification/spec.md)。

| Requirement / Scenario | 实际检查与判据 | 方式 / 结果索引 |
| --- | --- | --- |
| PERF-01 · 同条件比较 | [run.sh](../scripts/performance/run.sh)、[性能报告](bench.md)记录两版相同脚本、夹具、负载、资源及连接池 12 的 24 档结果，并附实际 SQL、参数及执行计划。 | 工程检查、记录 |
| PERF-01 · 多档位隔离 | [run.sh](../scripts/performance/run.sh)、[fixture.ts](../scripts/performance/fixture.ts)为每个接口档位建立独立数据库与队列，固定 5,000 篇新闻和初始任务规模。隔离数据与 24 档结果见[性能报告](bench.md)。 | 工程检查、记录 |
| PERF-02 · 受限环境调整连接数 | [config.test.ts](../tests/runtime/config.test.ts)核对默认 12、显式值进入连接池和非法值被拒。 | U |
| PERF-02 · 选择性关键词检索 | [fixture.ts](../scripts/performance/fixture.ts)断言命中 100 篇，[check.ts](../scripts/performance/check.ts)核对计数和分页均使用新闻文本索引，[性能报告](bench.md)保留执行计划。 | 工程检查、记录 |
| PERF-03 · 一批独立任务 | [worker.ts](../scripts/performance/worker.ts)、[reports/bench.md](../reports/bench.md)；20独立信源、每模型调用200ms、真实Worker；记录墙钟/排队/执行/失败/调用与派生任务，断言20成功20新闻。 | 工程检查、记录 |
| PERF-04 · 性能符合约定 | [check.ts](../scripts/performance/check.ts)、[gate.json](../scripts/performance/gate.json)按 4 VU、20 秒及仓库阈值检查三个接口。检索两条计划使用文本索引且无新闻表顺序扫描。 | 工程检查 |
| PERF-04 · 性能或状态失败 | [check.ts](../scripts/performance/check.ts)检查 k6 阈值和查询计划，失败保留输出并使阶段返回非零。隔离吞吐阈值反例中 k6 退出 99，统一检查退出 1。运行方式见[性能报告](bench.md)。 | 工程检查、记录 |

## runtime-observability

规格：[当前规格](../openspec/specs/runtime-observability/spec.md)。

| Requirement / Scenario | 实际检查与判据 | 方式 / 结果索引 |
| --- | --- | --- |
| OBS-01 · 技能及接口指标 | [metrics.test.ts](../tests/runtime/metrics.test.ts)；explain成功/失败各1，私人技能名不进指标，直方图累计桶及队列waiting=4/available=1。 | U |
| OBS-01 · 队列不可用 | [metrics.test.ts](../tests/runtime/metrics.test.ts)；真实指标HTTP中队列替身抛错，available=0且没有伪造queue_jobs，错误地址不泄露。 | U |
| OBS-02 · 查看指标和告警 | [skill-metrics.ts](../tests/evaluation/skill-metrics.ts)、[monitoring](../monitoring)、[reports/observe-alert.md](../reports/observe-alert.md)；历史真实Editor三技能成功/失败序列可查询，两告警firing且本地接收器收到；本次未重跑监控。 | 历史 |

## request-audit

规格：[当前规格](../openspec/specs/request-audit/spec.md)。

| Requirement / Scenario | 实际检查与判据 | 方式 / 结果索引 |
| --- | --- | --- |
| AUD-01 · 成功与拒绝请求 | [audit.test.ts](../apitest/cases/audit.test.ts)；真实200/401/403/404/400后按requestId查持久记录，主体/对象/模板/状态准确，JSON无正文及凭据。 | A |
| AUD-02 · 查询权限 | [audit.test.ts](../apitest/cases/audit.test.ts)；管理员200、普通用户403、匿名401；requestId/主体/状态/时间组合命中，换主体返回空。 | A |
| AUD-03 · 回查成功与失败调用 | [skill-audit.test.ts](../apitest/cases/skill-audit.test.ts)；成功40/50/90、失败用量null，主体/技能/请求/耗时一致；审计触发器失败与回答共同回滚且无text/complete。 | A |
| AUD-04 · 筛选与权限 | [skill-audit.test.ts](../apitest/cases/skill-audit.test.ts)；主体/技能/未来时间筛选为空，requestId一条，反向窗口400，普通和匿名拒绝，输出无正文/token。 | A |

## browser-request-security

规格：[当前规格](../openspec/specs/browser-request-security/spec.md)。

| Requirement / Scenario | 实际检查与判据 | 方式 / 结果索引 |
| --- | --- | --- |
| SEC-09 · 允许的页面发送写请求 | [browser-origin.test.ts](../tests/runtime/browser-origin.test.ts)；合法Origin写请求200，处理器执行次数恰加1。 | U |
| SEC-09 · 跨站页面发送写请求 | [browser-origin.test.ts](../tests/runtime/browser-origin.test.ts)；攻击Origin返回403/FORBIDDEN，处理器计数不变。 | U |
| SEC-09 · 开发来源在生产环境不可用 | [browser-origin.test.ts](../tests/runtime/browser-origin.test.ts)；localhost:5175在开发200、生产403，并核对处理器次数。 | U |
| SEC-09 · 非浏览器客户端与安全读取 | [browser-origin.test.ts](../tests/runtime/browser-origin.test.ts)、[csrf.test.ts](../apitest/cases/csrf.test.ts)；无Origin POST、跨站Origin GET不被来源误拒；合法无Origin Bearer写入200。 | U、A |
| SEC-10 · 标题包含恶意标签 | [news-title-security.test.ts](../tests/runtime/news-title-security.test.ts)、[news.spec.ts](../tests/e2e/news.spec.ts)；SSR和真实列表HTML转义script/img，注入元素不存在、脚本标记仍0。 | U、B |
| SEC-10 · 普通标题 | [news-title-security.test.ts](../tests/runtime/news-title-security.test.ts)；普通标题文字及新闻href保持。 | U |
| SEC-11 · SQL 注入式检索 | [injection.test.ts](../apitest/cases/injection.test.ts)；news/events注入式查询items空/total0，普通词命中，数据库新闻数不变。 | A |
| SEC-11 · 跨站编辑写入 | [injection.test.ts](../apitest/cases/injection.test.ts)；攻击Origin有效Bearer仍403且编辑行不变；合法Origin新token后200且姓名已改。 | A |
| SEC-11 · 刷新 Cookie 属性 | [injection.test.ts](../apitest/cases/injection.test.ts)；登录Set-Cookie包含HttpOnly、SameSite=Strict与Secure。 | A |
| SEC-12 · 正常与并发写入 | [csrf.test.ts](../apitest/cases/csrf.test.ts)；不同token并发均200，同token并发恰为200/403。 | A |
| SEC-12 · 缺失、重放和跨会话 token | [csrf.test.ts](../apitest/cases/csrf.test.ts)；缺失、他人、过期及已用token均403，拒绝前后编辑数据不变。 | A |
| SEC-12 · Cookie 刷新及会话失效 | [csrf.test.ts](../apitest/cases/csrf.test.ts)、[account.spec.ts](../tests/e2e/account.spec.ts)；过期access取token401，Cookie取新token可刷新200；旧token和退出会话拒绝，浏览器刷新后写入成功。 | A、B |
| SEC-13 · 成功及拒绝请求 | [audit.test.ts](../apitest/cases/audit.test.ts)；成功及401/403/404日志主体、操作、时间、耗时与null字段准确，同时核对持久记录。 | A |
| SEC-13 · 恶意路径与机密输入 | [audit.test.ts](../apitest/cases/audit.test.ts)；敏感合成路径/查询/正文与token不进日志/数据库，仅路由模板和有效对象ID。 | A |
| SEC-14 · 模型返回非法引用 | [editor-api.test.ts](../tests/editor/editor-api.test.ts)；bad-citation经HTTP只有error，没有99元/N999/text事件；会话末条failed且正文为空。 | U、A |


远端CI、正式同条件性能复测、恢复/发布及真实模型检查按各自记录的版本和日期判断，未执行的运行不因本表有对应命令而变成通过。

2026-11-24定向补充：`node --import tsx --test --test-concurrency=1 apitest/cases/security.test.ts tests/topics/news-topics-api.test.ts tests/news/news.integration.test.ts` 使用隔离配置与合成数据，7项通过、0失败、0跳过。覆盖管理员私人会话拒绝、缺失资源、事件修正失败的数据保全及阅读历史更新。随后执行 `node --import tsx --test --test-name-pattern='NEWS-05 rereading' tests/news/news.integration.test.ts`，1项通过；历史readAt等于存储时间，公共详情及收藏没有该字段。
