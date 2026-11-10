# 首次安全检查

检查日期：2026-11-09。依据 [SEC-01 至 SEC-07](../docs/verification/security.md)，检查真实 HTTP、MCP、后台执行、数据库写入及调用日志。执行方式为自动化脚本与 AI 代码阅读，版本和环境见[报告索引](README.md)。

本报告记录修复前的安全检查基线。SEC-01 至 SEC-06 符合预期；SEC-07 的失败调用用量丢失，当前判红。

## 身份与数据

隔离环境包含普通账号 A、普通账号 B、管理员 M 和未登录调用方。B 创建一条私人记忆和一个专题；A 使用自己的编辑、会话与技能。两个账号先完成合法操作，再交换资源标识检查读取和写入；随机不存在的标识用于比较返回结果。另准备公共新闻、启用信源及管理任务。

## 七项结果

| 编号 | 前置条件 | 操作 | 预期 | 当前实际 | 判定 |
| --- | --- | --- | --- | --- | --- |
| SEC-01 身份 | 私人入口、公开新闻与有效会话已准备 | 匿名读取九个私人入口和公共新闻；退出后重用令牌 | 私人入口 401，公共新闻 200，旧令牌失效 | 九项均为 401，新闻为 200；退出后读取编辑为 401 | 绿 |
| SEC-02 归属 | B 有私人记忆和专题，A 已登录 | A GET、PATCH B 的对象；查询不存在的记忆和本人的记忆列表 | 跨账号及不存在对象均为 404，列表按账号隔离 | 交叉 GET、PATCH 与不存在对象均为 404；A 的记忆列表为 0 条 | 绿 |
| SEC-03 管理角色 | A 为普通账号，公共信源存在 | A 创建、停用信源，再修改本人编辑配置 | 管理请求 403，无越权写入；本人配置可修改 | 两个管理请求均为 403，来源数量不变；本人配置 PATCH 为 200 | 绿 |
| SEC-04 执行入口 | API、MCP 和采集任务可调用 | 伪造 `userId`，读取 B 的私人材料；接收任务后停用信源或撤销角色 | 拒绝非法参数、跨账号读取及失效权限下的执行 | 伪造字段为 400，私人材料为 404；两次接收为 202，执行失败且未增加模型调用 | 绿 |
| SEC-05 机密 | 历史、当前文件、构建及日志可扫描 | 扫描 Git 历史、当前文件、前端产物与 API、Worker 日志 | 零命中 | 五类对象均完成扫描，零命中 | 绿 |
| SEC-06 依赖 | 已安装锁定依赖 | 分别审计完整锁文件和运行依赖 | 高危、严重为零或登记处置 | 完整依赖 9 项中危、0 高危、0 严重；运行依赖为零 | 绿，中危项见[安全基线](security-baseline.md) |
| SEC-07 调用记录 | A 已安装技能，模型响应提供用量 | 对照成功调用、结构校验失败及拒绝请求的记录 | 可关联主体、对象、技能、状态和耗时，保留模型已提供的用量 | 成功调用记录完整；双语结果校验失败时，模型返回 10／20／30，日志及消息中的三项用量均为 null | 红：失败调用用量丢失 |

## MCP 与调用日志

使用 A 的身份调用 `materials_read` 读取 B 的专题，工具返回 `NOT_FOUND`（404）；向 `news_read` 额外传入 `userId`，返回 `INVALID_INPUT`（400）。固定材料技能只使用选定报道，新闻检索依赖失败时结束回答并保存错误状态。

技能日志包含 `timestamp`、`requestId`、`actorId`、`objectId`、`skillId`、`result`、`durationMs` 和 `usage`。本次成功调用的数值节选如下，模型用量由可控 HTTP 替身返回：

```json
{
  "module": "editor",
  "operation": "answer",
  "result": "succeeded",
  "durationMs": 12,
  "usage": { "inputTokens": 40, "outputTokens": 50, "totalTokens": 90 }
}
```

成功调用的必需字段齐全，日志不包含凭据或私人正文。结构校验失败时存在已返回用量丢失的问题，见下节。对应检查见[模型用例](../tests/runtime/model.test.ts)、[编辑用例](../tests/editor/editor.test.ts)、[编辑接口用例](../tests/editor/editor-api.test.ts)和[安全 API 用例](../apitest/cases/security.test.ts)。

## SEC-07 失败调用用量

前置条件：隔离环境中普通账号 A 安装双语阅读技能，并选中一篇测试新闻。既有 HTTP 模型替身在正常结果和非法段落编号结果中，均返回输入 10、输出 20、合计 30 tokens。

操作：分别生成正常双语内容和包含 `P999` 段落编号的结果，检查回答状态、`editor.answer` 日志和 `messages.usage`。

判据：正常结果保存为 completed，非法结果保存为 failed；两种情况的日志和消息均应保留已返回的 10／20／30 用量。只有模型未提供用量时才标记不可得。

```sh
node --import tsx tests/evaluation/usage-recording.ts
```

| 模型结果 | 回答状态 | 模型返回的用量 | 日志用量 | 消息用量 | 判定 |
| --- | --- | --- | --- | --- | --- |
| 正常段落编号 | completed | 10／20／30 | 10／20／30 | 10／20／30 | 绿 |
| 非法段落编号 P999 | failed | 10／20／30 | null／null／null | null／null／null | 红 |

两种记录中的 `actorId`、`skillId` 均与发起账号及所选技能一致，日志结果分别为 succeeded 和 failed，耗时字段存在。观察输出节选如下：

```text
usage-recording-valid
  answerStatus: completed
  loggedUsage: 10 / 20 / 30
  storedUsage: 10 / 20 / 30
  passed: true
usage-recording-bad-bilingual
  answerStatus: failed
  loggedUsage: null / null / null
  storedUsage: null / null / null
  passed: false
exit code: 1
```

判红的是已返回用量丢失；无效结果被拒绝并保存为 failed 符合预期。观察入口使用本地 HTTP 替身，默认结果为 `.local/verification/usage-recording.json`；使用 `EVALUATION_DIR` 指定新目录可保留多次运行。

常规安全 API 用例只验证正常技能调用的日志，其结果使用 `SEC-07-successful-call` 标识。完整 SEC-07 判定以本节的正常与失败对照为准。

缺口位于[模型适配器](../src/server/adapters/model.ts)与[编辑失败处理](../src/server/modules/editor/service.ts)：结构校验抛错时未传递已取得的用量，失败记录继续使用空值。当前状态为待修改；修复应保留失败状态，并将已有用量传递到日志与消息记录。

## 实际接口清单

下列路径均省略 `/api/v1`。匿名检查覆盖九个受保护读取入口：`GET /conversations`、`GET /memories`、`GET /library`、`GET /editor`、`GET /editor/digests`、`GET /editor/journals`、`GET /topics`、`GET /notifications`、`GET /skills/mine`。公开对照为 `GET /news`，本人资料和任务查询分别为 `GET /auth/me`、`GET /tasks/:id`。

全部业务写入入口按实际注册路由登记如下。表中写入均需校验参数；私人对象同时校验所属账号。

| 对象 | 方法与路径 | 身份与写入范围 | 需求 |
| --- | --- | --- | --- |
| 注册与登录 | `POST /auth/register`、`POST /auth/login`、`POST /auth/refresh` | 注册和登录校验凭据；刷新校验并轮换会话 | ACC-01、ACC-02 |
| 会话撤销与密码 | `POST /auth/logout`、`POST /auth/password` | 当前账号；退出撤销会话，改密撤销旧会话 | ACC-02 |
| 编辑配置 | `PATCH /editor` | 本人编辑配置 | EDITOR-01 |
| 会话与消息 | `POST /conversations`；`PATCH`、`DELETE /conversations/:id`；`POST /conversations/:id/messages` | 本人会话与消息 | EDITOR-03 |
| 长期记忆 | `POST /memories`；`PATCH`、`DELETE /memories/:id` | 本人记忆 | EDITOR-05 |
| 日报与手记 | `POST /editor/digests/generate`、`POST /editor/journals/generate` | 本人任务和生成结果 | EDITOR-04、EDITOR-06 |
| 阅读与收藏 | `POST /news/:id/read`；`POST`、`DELETE /news/:id/favorite` | 当前账号与公共新闻的关联 | NEWS-05 |
| 技能安装与编辑 | `POST /skills/:id/install`；`PATCH /skills/mine/:id`；`POST /skills/mine/:id/publish` | 当前账号安装、维护或发布个人副本 | SKILL-02、SKILL-04 |
| 公共技能 | `PATCH /skills/:id` | 作者修改本人公开版本，管理员维护公共状态 | SKILL-04 |
| 专题 | `POST /topics`；`PATCH`、`DELETE /topics/:id`；`POST /topics/:id/read` | 本人专题及已读状态 | TOPIC-01 |
| 专题报道 | `POST /topics/:id/news`；`DELETE /topics/:id/news/:newsId` | 本人专题中的公共新闻关联 | TOPIC-01 |
| 专题笔记 | `POST /topics/:id/notes`；`PATCH`、`DELETE /topics/:id/notes/:noteId` | 本人专题及笔记 | TOPIC-01 |
| 成果与分享 | `POST /topics/:id/artifacts`；`PATCH`、`DELETE /artifacts/:id`；`POST /artifacts/:id/shares`；`DELETE /shares/:token` | 本人成果；发布保存选中成果快照，撤销由所有者执行 | TOPIC-01、TOPIC-06 |
| 关注与消息 | `POST /follows`；`DELETE /follows/:kind/:id`；`PATCH /notifications/:id`、`PATCH /notifications/read-all` | 本人关注和通知 | TOPIC-02 |
| 信源与采集 | `POST /admin/sources`；`PATCH /admin/sources/:id`；`POST /admin/sources/:id/collect` | 管理员；执行时重新核对信源和角色 | ACC-05、NEWS-01 |
| 新闻与公共日报 | `POST /admin/news/:id/reprocess`；`PATCH /admin/news/:id/event`；`POST /admin/digests` | 管理员；公共新闻、事件及日报任务 | ACC-05、NEWS-02、NEWS-03、NEWS-06 |
| 公共任务重放 | `POST /admin/tasks/:id/retry` | 管理员；仅公共任务 | ACC-05、OPS-02 |

## 命令与证据

```sh
npm run test:api
node scripts/checks/check-security.mjs dist <api-log> <worker-log>
```

扫描命令与输出见[安全基线](security-baseline.md)。对象隔离和写入检查详见[账号与授权](risk-authz.md)、[并发与任务执行](risk-concurrency.md)及[事务与数据一致性](risk-transaction.md)，两项安全检查的核对记录见[检查评审](review-01.md)。
