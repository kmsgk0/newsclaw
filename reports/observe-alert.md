# 监控与告警

2026-11-10，在 Ubuntu x86-64 的隔离 Docker 网络中使用 Prometheus 2.55.1、Grafana 11.5.2 和 Alertmanager 0.28.1，核对指标采集、看板查询、告警状态及通知送达。

## 看板

Grafana 认证 API 返回预配置看板“NewsClaw 运行”，数据源查询返回 200。2026-11-11 用真实编辑服务和可控模型替身分别走通 explain、comparison、brief 三种技能的成功及失败路径，Prometheus 可查询六条序列。每种技能的每种结果实际执行一次，时间窗口外推的 `increase` 约为 1.31。

| 面板 | 指标 |
| --- | --- |
| 技能调用量 | 按技能汇总近 5 分钟的调用量 |
| 技能错误率 | 按技能计算失败调用占比 |
| 接口 P95 与队列深度 | HTTP 响应 P95 与等待任务深度 |

[看板定义](../monitoring/grafana/dashboards/newsclaw.json) · [技能指标检查](../tests/evaluation/skill-metrics.ts)

## 告警与通知

Prometheus 每 15 秒采集并评估规则。指标进程使用项目的 `RuntimeMetrics`，写入等待任务 12、活跃任务 1、一次 42 毫秒的请求，并在启动 35 秒后记录一次 explain 失败。等待 155 秒后查询，队列积压与技能失败两项均为 `firing`。Alertmanager 路由至隔离网络内的日志接收器。

| 规则 | 触发条件 | 2026-11-10 通知结果 |
| --- | --- | --- |
| `NewsClawQueueBacklog` | 等待任务大于 10，持续 1 分钟 | 13:54:13 UTC 到达接收器 |
| `NewsClawSkillErrors` | 任一技能的 5 分钟失败调用速率大于 0，持续 1 分钟 | 13:55:13 UTC 到达接收器 |
| `NewsClawQueueUnavailable` | 队列指标不可用，持续 1 分钟 | 见规则及队列不可用指标用例 |

接收器记录告警名、状态和接收时间。验证环境在检查后清理。[告警规则](../monitoring/alerts.yml) · [指标用例](../tests/runtime/metrics.test.ts) · [启动监控](../docs/runtime.md#监控)
