# Proposal

## Why

第 10 课要求根据实际技能执行、接口响应和队列积压观测运行状态并验证告警。当前只有日志与健康检查，尚不能提供可查询的时间序列和看板。

## What Changes

- 增加可选的内部指标服务，记录技能调用与错误、接口延迟分布并读取队列深度。
- 提供可选的 Prometheus 和 Grafana 容器、三类面板及告警规则，不向公网发布指标端口。
- 增加 Alertmanager 及仅供容器网络访问的本地通知记录器；在隔离环境验证指标、采集、实际告警与通知，并记录条件与结果。

## Capabilities

### New Capabilities

- `runtime-observability`: 应用指标、看板与告警。

### Modified Capabilities

无。

## Impact

影响 API 运行入口、请求和技能执行、可选 Compose 服务、运行配置、测试及运维文档。指标只使用低基数标签，不包含账号、正文、凭据或请求参数；默认不启用额外服务。
