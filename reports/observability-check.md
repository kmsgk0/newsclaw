# 监控与告警检查

日期：2026-11-10。检查对象为基线 `171d719` 加本轮未提交改动。Ubuntu x86-64 隔离 Docker 网络中运行 Prometheus 2.55.1、Grafana 11.5.2 和使用项目指标实现的合成指标进程；镜像摘要分别与 Docker Hub 发布摘要核对一致。未使用真实用户或模型服务。

合成进程调用 `RuntimeMetrics` 和 `startMetricsServer`，提供等待任务数 12、活跃任务数 1，记录一次成功的 explain 技能、一次 42 毫秒请求，并在启动 35 秒后记录一次失败的 explain 技能。Prometheus 使用仓库中的 15 秒采集、15 秒规则计算和持续一分钟阈值。等待 155 秒后查询 `/api/v1/query`，实际观察到 `NewsClawQueueBacklog` 和 `NewsClawSkillErrors` 均为 `firing`。Grafana 认证 API 返回 `NewsClaw 运行` 看板，Prometheus 数据源查询返回 200。验证结束后移除本次三个容器和独立网络。

该实验验证指标格式、采集、规则状态和 Grafana 配置加载；其业务事件由合成进程触发，不能证明真实线上工作负载或外部告警通知。队列读取失败时的不可用指标和敏感错误脱敏由 `tests/runtime/metrics.test.ts` 检查；监控指标服务默认关闭，操作步骤见[运行说明](../docs/runtime.md#监控)。

同日增加 Alertmanager 0.28.1 及容器网络内的本地日志接收器后，使用相同合成指标复测。两条告警均进入 firing，接收器分别记录了队列积压通知（13:54:13 UTC）和技能失败通知（13:55:13 UTC）；本轮容器和网络已移除。告警接收器只记录告警名、状态和接收时间，不发送邮件或其他外部消息。复制配置时产生的 macOS 元数据文件曾使 Grafana 启动失败；清除测试副本中的该文件并重启后，看板与数据源检查通过。

2026-11-11 使用真实 `EditorService` 和 MCP 路径，分别执行 explain、comparison、brief 技能的成功和失败场景；模型服务为可控 HTTP 替身，账号与材料为合成数据。Prometheus 采集后，通过 Grafana 的 Prometheus 数据源查询六条成功及失败时间序列，三种技能各有正值；Grafana API 返回三张预配置面板。每个技能的每种结果各实际执行一次；`increase` 查询返回约 1.31，属于 Prometheus 对时间窗口的外推估计，不是额外的实际调用。隔离容器、数据库和网络均已清理。运行入口为 `tests/evaluation/skill-metrics.ts`，这不等同于真实用户或真实模型的线上曲线。
