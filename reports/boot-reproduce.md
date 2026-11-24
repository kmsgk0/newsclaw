# 干净目录启动检查

在干净提交 `00ad13316b2918b2f94d6c94253e748c66bebb3d` 上使用仓库 Dockerfile 构建生产镜像。Compose 启动 API、Worker、PostgreSQL、Redis 与可控信源和模型服务。

```sh
npm ci --ignore-scripts --no-audit --no-fund
npx playwright install chromium --only-shell
node scripts/verification/runtime.mjs verify
```

2026-11-24 20:24:30 至 20:24:42（北京时间）记录手机检查结果。宿主端口为 43100，`/health` 返回 `ready` 和相同的提交 SHA，数据库与队列均可用。验证命令退出 0，自动移除这次的容器、网络及两个测试数据卷。启动及分步观察见[运行说明](../docs/runtime.md#干净源码与手机任务流程)。

## 手机日报与账号隔离

在 Chromium 390 × 844 视口中使用两个普通账号和一个管理账号。先采集一篇新闻，再暂停 Worker 并从手机页面提交日报，随后恢复 Worker 并通过页面轮询观察状态。

| 检查 | 实际结果 |
| --- | --- |
| 提交日报 | HTTP 202，任务 `5f3e3547-05bf-4c05-8fa1-e1940cd9f3e2` |
| 状态与页面 | 依次观察到 `pending`、`running`、`succeeded`，页面显示“处理完成”、正文及材料引用 |
| 另一账号查询同一任务 | HTTP 404，`NOT_FOUND`，数据为空 |
| 管理账号回查审计 | 请求 `660c6b50-983a-400c-b4fa-2cbd56a4fde5`，操作者 `fffbd9c4-dc89-41ce-825f-9d29e6ed8f68`，对象 `5f3e3547-05bf-4c05-8fa1-e1940cd9f3e2`，状态 404 |

结构化结果与手机截图保存在 `.local/verification/runtime/2026-11-24T12-24-30.773Z/`，文件名为 `result.json` 和 `mobile-digest.png`。另一份手机操作记录见[账号权限与手机端日报](review-03.md#手机端日报)。

## 监控服务

2026-11-10，在 Ubuntu x86-64 的独立 Compose 项目中用 `docker compose --profile observability up -d --wait` 启动监控栈。Prometheus 对 API 的 `up` 为 1，Grafana 返回预配置看板，Alertmanager 与本地通知接收器运行。面板、规则与实际通知时间见[监控与告警](observe-alert.md)。
