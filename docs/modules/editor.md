# 编辑与阅读技能

每个账号有一位专属编辑。编辑设置、会话、长期记忆、个人日报和手记按账号保存；管理员同样不能读取其他账号的私人内容。公开新闻通过共享新闻服务检索，回答中的来源关联实际报道。

## 编辑与会话

| 接口 | 用途 |
| --- | --- |
| `GET /api/v1/editor` | 读取名字、头像、解读风格和兴趣 |
| `PATCH /api/v1/editor` | 修改本人编辑设置 |
| `GET /api/v1/conversations` | 列出本人会话 |
| `POST /api/v1/conversations` | 创建会话，可传入当前材料范围 |
| `GET /api/v1/conversations/:id` | 恢复消息、来源、技能和结果状态 |
| `PATCH /api/v1/conversations/:id` | 重命名本人会话 |
| `DELETE /api/v1/conversations/:id` | 删除本人会话与其消息 |
| `POST /api/v1/conversations/:id/messages` | 发送问题，流式接收回答 |
| `GET /api/v1/memories` | 列出有效的长期记忆 |
| `POST /api/v1/memories` | 按主题键保存明确偏好 |
| `GET /api/v1/memories/:id` | 读取一条本人记忆 |
| `PATCH /api/v1/memories/:id` | 修改内容并标为用户明确偏好 |
| `DELETE /api/v1/memories/:id` | 删除有效记忆，保留自动整理约束 |
| `GET /api/v1/editor/digests` | 按日期回看个人日报 |
| `POST /api/v1/editor/digests/generate` | 接收个人日报任务，返回 `202` |
| `GET /api/v1/editor/journals` | 按日期回看编辑手记 |
| `POST /api/v1/editor/journals/generate` | 整理本人新增活动，返回 `202` |

会话创建参数为 `title` 和可选 `context`。材料范围包含 `kind` 与对象 `id`，类型为 `news`、`event`、`favorites`、`topic`；收藏集合不需要对象标识。专题先校验本人归属。指定对象不存在时直接返回 `404`，不替换为全站材料。

消息参数为 `content`、可选个人 `skillId` 和可选 `context`；重试时另传失败回答的 `retryMessageId`，复用原问题和材料。消息未传范围时沿用会话当前范围；全新且没有范围的会话通过新闻检索取得材料。同一会话已有回答生成时返回 `409`，不重复写入第二组消息。空问题和停用技能在调用模型之前拒绝。

头像接受空字符串或 HTTP、HTTPS 图片地址。输入错误返回 `400`；跨账号和不存在的私人对象统一返回 `404`。JSON 响应使用项目统一的 `code`、`message`、`data`、`requestId`，具体输入结构可从 `/docs/api` 查看。

## 流式事件与恢复

消息接口返回 `text/event-stream`。客户端读取 `event` 和 JSON `data`，不能把部分文本视为已完成回答。

| 事件 | 数据与处理 |
| --- | --- |
| `meta` | 会话标识、回答消息标识和所用技能 |
| `tool` | 工具名及当前执行状态 |
| `sources` | 服务端建立的来源数组，包含新闻标识、显示编号、标题和原文链接 |
| `text` | 本次追加的文本片段 |
| `artifact` | 已通过结构与来源检查的简报、对比或导图 |
| `complete` | 成功保存的消息标识、来源、成果及技能 |
| `error` | `status`、`code`、`message` 和 `requestId`；本次回答未完成 |

重新打开会话时以保存状态为准。助手消息状态为 `pending`、`completed`、`failed`；失败保留输入、已产生片段和之前的完整消息，并在 `error` 中保存安全原因与请求标识，刷新后仍可查看。重试时清除旧错误，成功后保存完整结果。完成后才将本次问答登记为阅读活动。流连接关闭会中断该次模型调用，已有消息继续可查。API 启动时将中断中的回答标为未完成，用户可用原问题重试；会话切换不会把旧回答写入新会话。

来源由本次实际读取的材料形成，模型引用的编号、报道标识和链接必须能映射到这份来源。模型输出只按文本和受限 Markdown 展示。来源只提供摘要时，编辑明确提示材料范围。

## MCP 与模型

编辑使用官方 MCP SDK 的客户端和服务端，通过进程内传输交换协议消息。实现位于 [MCP 适配器](../../src/server/adapters/mcp.ts)，由[编辑服务](../../src/server/modules/editor/service.ts)在回答期间创建和关闭。每次回答绑定已认证账号，工具复用新闻与专题业务服务。

| 工具 | 参数 | 读取范围 |
| --- | --- | --- |
| `news_search` | `query`、可选 `semantic` | 公共新闻检索，最多返回 20 条 |
| `news_read` | 新闻 `id` | 指定报道 |
| `events_read` | 事件 `id` | 指定事件与关联报道 |
| `materials_read` | `kind`、可选 `id` | 新闻、事件、本人收藏或本人专题 |

工具参数使用严格 schema，账号由宿主传入。显式技能的结果按选中新闻标识过滤；私人材料使用当前账号校验归属。调用日志记录请求、账号、工具、结果及耗时，错误传回编辑服务，由会话保存失败状态。

模型可追加最多四轮工具调用。当前材料、明确兴趣、相关记忆、近期会话和技能共同组成上下文；私人数据不会因公共报道或技能文本里的指令改变归属。显式技能执行限制在用户选定的材料内。

对话与嵌入地址、模型名和密钥由服务端环境提供。结构化输出按 JSON schema 校验，向量维度与配置相符；模型失败、截断流、非法来源和无效导图都保留未完成状态。模型调用日志只记录身份标识、请求或任务、技能、结果、耗时与实际用量；没有用量时记录空值，不保存私人正文。

## 技能副本与发布

五项内置技能为通俗解读、多源对比、专题简报、思维导图、双语阅读。技能使用说明文本和输出偏好，不运行用户代码。

| 接口 | 用途 |
| --- | --- |
| `GET /api/v1/skills` | 游客可查看已发布技能与示例 |
| `GET /api/v1/skills/mine` | 读取个人副本及其公开版本状态 |
| `POST /api/v1/skills/:id/install` | 安装公开模板，重复安装返回已有副本 |
| `PATCH /api/v1/skills/mine/:id` | 修改名称、处理说明、输出偏好或启停 |
| `POST /api/v1/skills/mine/:id/publish` | 显式填写公开介绍与示例，保存草稿或发布 |
| `PATCH /api/v1/skills/:id` | 作者或管理员维护公开内容与发布状态 |
| `GET /api/v1/admin/skills` | 管理员查看全部公共技能状态 |

显式选择的个人技能优先，停用时返回明确错误。自动选择最多一项已启用且适合问题的技能，也可不使用；没有选定材料的普通问题继续使用新闻问答。公共模板更新不覆盖已安装副本，个人修改也不改变公共内容。

公开版本只包含名称、介绍、处理说明、输出偏好和主动填写的示例。发布状态为 `draft`、`published`、`unlisted`；下架后从可安装列表移除，已有个人副本保留。

简报、对比与导图可保存为专题成果。成果结构包含 `title`、`kind`、`content`、`skillId`、`sourceIds` 和对应助手 `messageId`，服务端保存生成时的报道快照与来源编号。专题保存使用本人已完成消息中的成果，新闻后续更新不替换这份材料。导图额外包含 `structure`，其节点含 `label`、非空 `sourceIds` 和可选 `children`。每个节点的来源必须属于本次实际材料。

## 日报、记忆与手记

业务日期使用 Asia/Shanghai。日报与手记列表返回内容、可用日期、最新日期和实际生成状态，可区分等待、无材料和失败。日报任务按账号与日期更新一份记录。接收时保存本次材料和偏好快照，重复操作复用原任务。较旧任务的迟到结果不能替换较新成功日报；失败保留原日报。当前按当日最新四十条精选提供候选，编辑根据明确兴趣与记忆选择导读内容；没有兴趣时使用当日精选并提示补充。

手记按递增活动标识处理新增阅读、收藏和成功问答。接收时固定活动范围；无新增活动直接结束，不创建空手记。调度按实际活动批次创建任务；同日新活动追加到当日手记，同一报道复用已有来源编号，新报道取得新编号，追加正文中的引用同步转换。外部模型调用在事务外完成，手记、允许更新的自动记忆和处理位置共同提交。

用户修改或删除的记忆保留明确状态。自动整理不能覆盖同主题的手动记忆，也不能复活已删除记忆；整理期间偏好发生改变时拒绝过期提交。失败和回滚不推进活动位置。

## 检查

`tests/runtime/model.test.ts` 使用真实 HTTP 替身检查结构化响应、向量、错误与截断流。`tests/editor/editor.test.ts`、`tests/editor/editor-api.test.ts` 和 `tests/skills/skills.test.ts` 使用隔离 PostgreSQL 检查会话、MCP、权限、个人副本、流式事件、日报及手记事务。

运行方式：

```sh
node --import tsx --test tests/runtime/model.test.ts tests/editor/editor.test.ts tests/editor/editor-api.test.ts tests/skills/skills.test.ts
```

真实模型效果核验使用 `RUN_LIVE_AI=1 node --import tsx tests/evaluation/editor-evaluation.ts`，会调用配置的模型，默认把完整结果写入 `.local/verification/ai-live-results.json`；`EVALUATION_DIR` 可指定其他输出目录。测试材料为 AI 样例中的虚构新闻，数据保存在临时数据库并在结束后移除；普通自动化测试不调用付费模型。执行后记录实际输入、输出及判断。
