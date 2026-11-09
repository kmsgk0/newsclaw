# 事务与数据一致性检查

检查日期：2026-11-09。版本与环境见[报告索引](README.md)。依据 ACC-01、OPS-02、OPS-03、EDITOR-06、TOPIC-01 和 TOPIC-02，检查拒绝与故障发生后的实际数据库状态。

| 事务对象 | 故障或操作 | 通过判据与结果 |
| --- | --- | --- |
| 注册及编辑初始化 | 触发器拒绝编辑写入 | 账号与编辑共同回滚；通过 |
| 后台任务接收 | 待投递表拒绝插入，通过真实 API 提交 | 返回 500，任务和待投递记录均未生效，未返回 202；通过 |
| 后台结果提交 | 业务结果写入后抛出数据库异常 | 结果回滚，任务不进入成功状态，已有成功内容保留；通过 |
| 新闻内容更新 | 新正文的模型分析或翻译失败 | 报道标识、收藏和专题关联保持，先前成功派生内容仍可读取；通过 |
| 增量手记与记忆 | 模型失败、事务失败、明确偏好变更及批次重放 | 手记、自动记忆和活动位置共同提交，失败不推进位置，手动偏好不被覆盖；通过 |
| 新报道提醒 | 提醒插入故障后重新执行 | 失败事务不留部分通知，恢复后按账号与报道唯一保存；通过 |
| 专题报道移除与加入 | 移除自动匹配报道，刷新，再主动加入 | 排除关系和专题内容一致，刷新不回填，主动加入可恢复；通过 |
| 成果与分享 | 保存生成结果、改名、撤销及删除成果 | 来源编号和生成快照保持；改名不改变已发布快照；撤销或删除后分享不可读；通过 |

外部模型和网络调用在数据库事务之外执行，结果写入时重新核对对象和执行资格。专题、会话和分享删除保留公共新闻及其他私人对象。日期字段以业务日期语义返回，跨日查询不依赖客户端时区转换。

检查对象包括[数据库封装](../src/server/db.ts)、[新闻存储](../src/server/modules/news/repository.ts)、[编辑存储](../src/server/modules/editor/repository.ts)、[专题存储](../src/server/modules/topics/repository.ts)和[任务服务](../src/server/runtime/tasks.ts)。

```sh
npm test
npm run test:api
```

对应行为用例位于 `tests/account/auth.test.ts`、`tests/runtime/tasks.test.ts`、`tests/news/news-quality.test.ts`、`tests/editor/editor.test.ts`、`tests/runtime/reader-workflows.test.ts`、`tests/topics/topics.integration.test.ts` 及 `apitest/cases/runtime.test.ts`。任务状态、执行次数与队列计数见[异步响应](async-response.md)。
