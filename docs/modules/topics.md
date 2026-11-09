# 专题、洞察与分享

专题按账号保存关注条件、报道、笔记和编辑成果。公开新闻始终保留来源；私人笔记、会话和记忆不会成为公开关系图的数据来源。

## 专题与成果

创建专题填写名称，并在 `filter` 中至少指定一项 `keywords`、`domain` 或 `eventId`。关键词是一段文本，同时匹配标题、原文、摘要和译文；多个字段共同限制范围。手动加入的报道在自动匹配条件改变后仍保留。用户移除报道时保存该专题的排除关系，自动匹配不会重新加入；主动加入可解除排除。

专题读取返回新增报道标识，通过独立的已读操作更新查看位置。笔记保存 Markdown 正文，支持新增、修改和删除，读取和写入均检查所属账号。成果可以改名或删除，删除成果时其分享链接同时失效。成果保存标题、类型、正文、技能及生成时来源快照，再次保存创建新的成果。

成果类型为 `brief`、`comparison` 和 `mindmap`。导图使用 `{ label, sourceIds, children? }` 树形结构，各节点都需引用提供的报道。无效结构和不属于本次材料的来源被拒绝，不保存成功成果。

编辑生成的成果带 `messageId`，保存时服务端读取本人已完成消息中的正文和来源快照，核对提交内容一致。`N1`、`N2` 等标号和材料顺序随生成记录保留，不按报道时间重新排列；之后原报道更新也不改变已生成成果的依据。客户端不能替换服务端保存的来源快照。

## 跟进与洞察

用户可以关注事件或本人专题。同一新增报道命中多个关注项时只产生一条站内提醒；后来新增的其他报道可以继续提醒。处理器在事务提交时重新检查有效关注，取消关注立即影响后续处理。通知的 `reasons` 保存触发关注的类型、名称和入口，接口返回本人消息及未读数。

站内热点依据选定时间范围内的独立信源数、有效报道数、最近发布时间和事件标识排序，默认范围为最近 24 小时。每日统计用于历史趋势，`historyDays` 控制独立的多日历史范围，默认七天；日期按 Asia/Shanghai 业务日直接传输。空数据不生成趋势点。时间线按发布时间及标识稳定排序。

关系图保存新闻中明确出现的公司、人物、产品、事件及有报道依据的关系。独立节点和关系都保留来源，事件归属修正后，图查询按当前报道集合展示结果。数据库故障作为失败返回。

## 分享

分享前查看成果预览，确认后生成只读快照及随机访问令牌。快照包含选中成果的正文、结构和公共新闻来源，不包含账号标识、专题笔记或编辑私有上下文。分享状态列在本人的成果中，再次读取时仍可撤销；撤销后原链接返回不可访问，原成果保留。

## 接口

| 方法与路径 | 用途 |
| --- | --- |
| `GET/POST /api/v1/topics` | 本人专题列表或创建 |
| `GET/PATCH/DELETE /api/v1/topics/:id` | 本人专题详情、修改或删除 |
| `POST /api/v1/topics/:id/read` | 更新本人查看位置 |
| `POST /api/v1/topics/:id/news` | 以 `newsId` 手动加入报道 |
| `POST /api/v1/topics/:id/notes` | 保存 `content` 笔记 |
| `POST /api/v1/topics/:id/artifacts` | 保存成果正文、结构、技能及 `sourceIds` |
| `GET /api/v1/topics/:id/graph` | 当前私人专题范围内的公共报道关系图 |
| `DELETE /api/v1/topics/:id/news/:newsId` | 从本人专题移除报道并记录排除 |
| `PATCH /api/v1/topics/:id/notes/:noteId` | 修改笔记正文 |
| `DELETE /api/v1/topics/:id/notes/:noteId` | 删除笔记 |
| `PATCH /api/v1/artifacts/:id` | 修改成果标题 |
| `DELETE /api/v1/artifacts/:id` | 删除成果及其分享 |
| `GET /api/v1/follows` | 查看本人关注的事件及专题 |
| `PATCH /api/v1/notifications/read-all` | 将本人消息标为已读 |
| `POST /api/v1/follows` | 以 `kind` 和 `id` 关注事件或专题 |
| `DELETE /api/v1/follows/:kind/:id` | 取消对应关注 |
| `GET /api/v1/notifications` | 本人提醒及未读数，支持分页 |
| `PATCH /api/v1/notifications/:id` | 以 `read: true` 标记本人消息 |
| `GET /api/v1/trends` | 公开热点，支持时间范围与分页 |
| `GET /api/v1/events/:id/timeline` | 公开事件时间线，可指定起止时间 |
| `GET /api/v1/artifacts/:id/share-preview` | 本人成果的公开预览 |
| `POST /api/v1/artifacts/:id/shares` | 以 `confirmed: true` 发布快照 |
| `GET /api/v1/shares/:token` | 匿名只读分享 |
| `DELETE /api/v1/shares/:token` | 所有者撤销分享 |

跨账号与不存在的私人对象均返回 `404`。实际输入和响应通过 `/docs/api` 查阅。数据与模型结构回归见[专题集成测试](../../tests/topics/topics.integration.test.ts)，接口权限检查见 [API 测试](../../tests/topics/news-topics-api.test.ts)。
