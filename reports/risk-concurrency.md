# 并发与任务执行

依据 OPS-02 至 OPS-04、EDITOR-03、EDITOR-04、EDITOR-06 和 TOPIC-02，使用真实 API、PostgreSQL、Redis 与 Worker，外部服务采用可控 HTTP 替身。

接收响应、两档 P95、队列计数和重试耗时见[异步响应报告](async-response.md)。本报告检查重复和并发操作是否改变业务结果。

## 20 并发提交与消息重投

2026-11-24，在提交 `718f794fa1a5d9752c59366a244440c0139ba23f` 上使用隔离的 PostgreSQL 17、Redis 7.4、真实 HTTP 和 Worker。执行 `npm run test:api`，11 项通过，退出码为 0。场景见[任务恢复用例](../apitest/cases/runtime.test.ts)，结构化结果写入本轮验收目录中的 `async-results.json`。

| 场景 | 判据 | 实测 |
| --- | --- | --- |
| 同一操作的 20 个并发请求 | 全部返回 202，复用一个任务标识 | 20 个 202，1 个任务标识 |
| Worker 停止时接收 | 恢复消费后完成任务 | 启动后任务成功，数据库中有 1 条新闻 |
| 成功任务再次投递 | 新闻与模型调用次数保持不变 | 1 条新闻，模型调用保持 2 次 |
| 写入 outbox 时强制失败 | 返回 500，任务记录随事务回滚 | 返回 500，孤儿任务 0 个 |
| 结果提交后、队列确认前终止 Worker | 重启后完成队列确认，保留已提交结果 | 任务保持 `succeeded`，队列进入 `completed`，新闻 1 条，模型调用保持 2 次 |

## 其他并发与恢复场景

2026-11-09 的检查版本与环境见[报告索引](README.md)。

| 场景 | 实际检查 | 结果 |
| --- | --- | --- |
| 迟到执行 | 旧执行尝试晚于新尝试返回 | 旧执行资格不能覆盖新结果 |
| 失败及人工重放 | 最终失败写入死信，重复提交同一重放操作 | 只增加一个代次，保留尝试历史 |
| 日报与手记 | 材料变化、空材料后到达、同日新增活动及重复调度 | 日报按实际材料版本接收，手记按新增活动批次接收；相同批次不重复创建 |
| 会话重试 | 未完成回答重试及进程启动恢复 | 同一问题只保留一条用户消息，回答终态与服务端一致 |

## 代码与检查入口

检查对象为[任务服务](../src/server/runtime/tasks.ts)、[Worker](../src/server/worker.ts)、[编辑存储](../src/server/modules/editor/repository.ts)及[后台处理](../src/server/modules/editor/background.ts)。业务唯一约束、执行标识、任务代次和活动处理位置各自约束对应写入。

```sh
node --import tsx --test tests/runtime/tasks.test.ts tests/editor/editor.test.ts tests/runtime/reader-workflows.test.ts
npm run test:api
```

进程中断用例使用独立测试入口在确认前暂停，应用处理器及事务逻辑与正常执行一致。
