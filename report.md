# NewsClaw 课程实践报告

核对日期：2026-11-11。本轮改动以 `171d719` 为基线，验证时尚未提交；课程要求、实际证据与未完成事项见[第 8 至 10 课对照](docs/verification/course-08-10.md)。

## 门禁与安全

隔离环境完整验收通过，安全门禁的故意破坏与恢复结果见[红绿对照](reports/gate-red-green.md)，技能调用的成功和失败回查见[审计记录](reports/audit-recheck.md)。第 9 课注入实验发现并修复了被拒绝的模型回答提前发送的问题；真实模型的行为与剩余局限见[SEC-08 四步实验](reports/sec08-experiment.md)。

## 运行与观测

异步任务、重复提交和消费者恢复的实测见[异步报告](reports/async-response.md)；生产镜像和干净目录启动见[启动检查](reports/boot-reproduce.md)。三种技能的 Prometheus 采集、Grafana 查询及本地告警通知见[监控报告](reports/observability-check.md)；外部通知和真实用户负载尚未验证。三类接口的多档压测及连接池调整见[压测报告](reports/bench.md)，其测量限制和不确定性也在报告中。

## 风险与复核

权限、并发、事务检查见[权限报告](reports/risk-authz.md)、[并发报告](reports/risk-concurrency.md)和[事务报告](reports/risk-transaction.md)。独立成员复现情况见[评审记录](reports/review-01.md)。

## 尚未完成

至少三名真实用户反馈、独立交叉评审和实际演示仍需真实参与。压测每档仅一次，须重复测量以判断收益是否稳定；远端 CI 的运行记录、必需检查配置及各项证据与修复提交的关联也尚未核实。完整待办及各项限制以[课程对照](docs/verification/course-08-10.md)为准。
