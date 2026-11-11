# 干净目录启动检查

2026-11-10 在 Ubuntu x86-64 上检查基线 `171d719` 与本轮未提交改动。生产镜像使用仓库 `Dockerfile` 构建，得到本机镜像 ID `883fbd0a5e4a`，标签 `newsclaw:course-check`；这不是已发布镜像，也不能对应尚不存在的修复提交。复制源码到独立目录时排除 Git、`.env`、运行数据和依赖，创建仅供测试的配置，再用 Compose 启动。

以下配置使用无效的合成模型地址，仅用于验证启动、健康和观测，不支持真实生成。正式使用需换成可用模型配置和独立强密码。

```sh
docker build -t newsclaw:course-check .
cp .env.example .env
```

在新目录的 `.env` 中设置以下测试值，数据库密码同时替换 `DATABASE_URL` 中的占位密码：

```dotenv
POSTGRES_PASSWORD=isolated-boot-password
DATABASE_URL=postgresql://newsclaw:isolated-boot-password@127.0.0.1:55432/newsclaw
CHAT_BASE_URL=http://127.0.0.1:4999/v1
CHAT_API_KEY=synthetic
CHAT_MODEL=fixture
EMBEDDING_BASE_URL=http://127.0.0.1:4999/v1
EMBEDDING_API_KEY=synthetic
EMBEDDING_MODEL=fixture
EMBEDDING_DIM=3
APP_VERSION=course-check
METRICS_ENABLED=true
GRAFANA_ADMIN_PASSWORD=isolated-test-only
SCHEDULE_ENABLED=false
```

在该独立目录运行 `docker compose --profile observability up -d --wait`，用 `curl -fsS http://127.0.0.1:3100/health` 检查。为避免与服务器已有服务冲突，本轮另设 `DB_PORT=25442`、`REDIS_PORT=26389`、`HOST_PORT=23100`、`GRAFANA_PORT=23300`，并使用独立 Compose 项目名。实测 API 返回 `ready`，数据库和队列为 `true`；API、Worker、备份、数据库、Redis、Prometheus、Grafana、Alertmanager 和本地通知接收器均运行，Prometheus 对真实 API 的 `up` 为 1，Grafana API 返回一个预配置看板。镜像内检查 `/app/.env` 不存在。

本次结束后执行 `docker compose --profile observability down --volumes --remove-orphans` 清理隔离容器与卷。`--volumes` 会删除该 Compose 项目的数据库和监控数据，只适用于确认可以丢弃的数据；不得对需要保留数据的环境直接执行。
