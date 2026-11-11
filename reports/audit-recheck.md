# 技能调用审计回查

日期：2026-11-11。对象为基线 `171d719` 加本轮未提交改动；在隔离 PostgreSQL、Redis、真实 HTTP 和合成模型服务上执行 `node --import tsx --test --test-concurrency=1 apitest/cases/skill-audit.test.ts`。账号、技能、内容和下列标识均为测试数据。

测试经实际技能接口分别触发成功和失败调用，取得 `X-Request-Id`，管理员按操作者、技能和时间窗口查询。实际输出如下：

```json
{"actor":"c34e74e7-1934-42a4-b310-184da1b9455c","time":"2026-11-11T03:25:02.811Z","operation":"skill.invoke","object":"86716940-d58e-40f8-afcc-4a781e43e958","result":"succeeded","skill":"3d0dd2d6-b0d1-408b-90d0-accb1e72aa2f","inputTokens":40,"outputTokens":50,"totalTokens":90,"durationMs":48,"requestId":"9414cf9e-0eaa-4697-8125-31e28ff4d57c","errorCode":null}
{"actor":"c34e74e7-1934-42a4-b310-184da1b9455c","time":"2026-11-11T03:25:02.833Z","operation":"skill.invoke","object":"86716940-d58e-40f8-afcc-4a781e43e958","result":"failed","skill":"3d0dd2d6-b0d1-408b-90d0-accb1e72aa2f","inputTokens":null,"outputTokens":null,"totalTokens":null,"durationMs":9,"requestId":"250731ba-d695-46fe-adcb-ea6b31c80af0","errorCode":"DEPENDENCY_UNAVAILABLE"}
```

测试同时确认普通用户查询返回 403、匿名查询返回 401；按其他操作者、其他技能或不匹配时间过滤返回空，按请求 ID 精确筛选返回一条。审计结果不含测试问题或访问令牌。模拟审计写入失败时，回答最终状态与审计插入均回滚，未发送未经保存的正文。两项测试通过。

HTTP 请求审计的独立回查测试还使用操作者、状态 403 和时间窗口组合查询，找到了对应的拒绝记录；换成其他操作者后不再返回该记录。HTTP 与技能审计合并回归共三项通过。

失败调用的模型没有提供用量，因此三个 token 字段为 null；不能把它当作零用量。技能审计与最终回答在同一事务中写入，进程在事务完成前崩溃的情况不保证产生记录；HTTP 请求审计仍在响应后单独写入。完整输出位于 Git 忽略的 `.local/verification/ubuntu-20261110/skill-audit-20261111.log`。
