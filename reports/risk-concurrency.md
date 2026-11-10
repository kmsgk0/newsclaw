# 并发与任务执行

检查日期：2026-11-09。版本与环境见[报告索引](README.md)。依据 OPS-02 至 OPS-04、EDITOR-03、EDITOR-04、EDITOR-06 和 TOPIC-02，使用真实 API、PostgreSQL、Redis 与 Worker，外部服务采用可控 HTTP 替身。

接收响应、两档 P95、队列计数和重试耗时见[异步响应报告](async-response.md)。本报告检查重复和并发操作是否改变业务结果。

## 重复、并发与恢复

| 场景 | 实际检查 | 结果 |
| --- | --- | --- |
| 并发接收 | 六个同操作请求同时到达 | 复用一个任务，业务新闻一条 |
| Worker 停止 | 消费者停止时接收任务，随后启动 | 任务先持久等待，恢复后自动执行 |
| 成功任务重投 | 再次投递已成功任务 | 新闻数量和模型调用次数不增加 |
| 提交后确认前终止 | 在真实 Worker 提交业务结果后、确认队列前发送 SIGKILL，再启动进程 | 队列完成，任务保持成功，模型调用数保持 2 次，新闻保持一条 |
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
