# 运行与任务

API 提供业务接口，Worker 处理已接入的后台任务，二者使用相同镜像及共享业务模块。PostgreSQL 保存业务结果、任务状态和待投递记录；Redis 与 BullMQ 管理等待、锁及重试。

## 启动与配置

使用 Node.js 24 或更新版本、npm 和 Docker Compose。复制 `.env.example` 为 `.env`，填入数据库、Redis、对话模型及嵌入模型配置。对话与嵌入地址使用兼容 Chat Completions 与 Embeddings 的服务根路径，分别配置模型和凭据。密钥只保留在本地配置中。

```sh
npm ci
docker compose up -d db redis
npm run migrate
npm run seed
npm run dev
```

另一个终端运行 `npm run worker`。API 在 `http://localhost:3100` 提供接口，`npm run build` 编译服务端。迁移按文件名顺序执行，数据库内记录已应用版本，并使用事务锁避免并行启动重复执行。

Compose 完整启动：

```sh
docker compose up --build -d
```

API 启动前自动迁移；初始化命令支持提升指定的已注册账号为管理员。Worker 等待依赖并执行相同迁移入口。数据库及 Redis 使用持久卷。Redis 启用 AOF、每秒同步和 `noeviction`。机器故障可能丢失最后一秒 Redis 变更，恢复时由 PostgreSQL 未完成任务补投；已成功任务沿用其结果。

本地默认数据库端口为 55432，Redis 为 56379。在使用容器域名的开发环境，可以通过 `.env` 的连接地址直接访问对应容器；Compose 内部连接地址由服务配置提供。

| 配置 | 用途与默认 |
| --- | --- |
| `DATABASE_URL`、`REDIS_URL` | 必需的业务数据库与队列连接 |
| `CHAT_BASE_URL`、`CHAT_API_KEY`、`CHAT_MODEL` | 必需的对话服务配置 |
| `EMBEDDING_BASE_URL`、`EMBEDDING_API_KEY`、`EMBEDDING_MODEL`、`EMBEDDING_DIM` | 嵌入服务与维度，默认维度 1024 |
| `APP_ORIGIN`、`COOKIE_SECURE` | 网页来源及安全 Cookie，默认 localhost:3100 和 true |
| `MODEL_TIMEOUT_MS` | 单次模型请求超时，默认 120000 毫秒 |
| `TASK_ATTEMPTS`、`TASK_BACKOFF_MS` | 一轮最多三次业务尝试，指数退避从 2000 毫秒起并带抖动 |
| `QUEUE_PREFIX` | 队列命名空间，测试使用独立值 |
| `APP_VERSION` | 响应及运行日志中的版本标识 |
| `SCHEDULE_ENABLED` | 保留业务调度配置，业务处理器随相应模块接入 |

缺少必需配置时应用明确退出，只报告配置项名称。`/live` 检查进程，`/health` 返回版本、时间及数据库、队列就绪状态；健康检查不调用付费生成。

## 接收、执行与恢复

主动触发接口在任务与待投递记录持久提交后返回 202，响应包含 `taskId`、`status` 和 `statusUrl`。查询接口只读，调用方在 succeeded 或 failed 后停止轮询。操作标识在主体与任务类型内唯一；相同请求复用任务，不同请求参数返回 409。派生输入快照单独保存，重放沿用第一次接收的材料。

Worker 的投递循环使用任务标识与代次生成队列标识。实际执行先登记尝试标识，外部模型和网络调用在事务外进行，业务结果与任务成功状态同事务提交。重复消息、失效尝试和旧代次不能再次提交结果。

临时依赖故障有限重试；参数、权限、已删除对象或模型认证错误直接失败。最终失败同时登记死信待投递记录，无自动死信消费者。管理员通过 `POST /api/v1/admin/tasks/:id/retry` 及新的 `operationId` 重放公共任务，增加代次并保留历史尝试。私人任务只由所属账号查询，管理员不能读取私人材料。

Worker 已提供消费、投递和恢复入口，业务处理器随新闻、编辑及专题能力接入。

停止时先停止投递循环和领取，等待在途任务；超过三十秒退出，未确认任务由队列锁恢复。Worker 重启核对未完成任务和队列状态，对缺失消息补投；已提交成功结果直接确认，不重复模型调用。

## 备份与版本恢复

Compose 的备份进程在 API 健康后执行第一次备份，随后每 86400 秒执行，保留最近七份。备份写入独立的 `backups/` 目录，不进入 Git；先写临时文件并校验，成功后才保留为正式备份。可以执行 `make backup` 主动备份，对应 `docker compose exec -T backup sh /scripts/backup.sh`。

恢复先使用数据库工具创建空目标库，再执行：

```sh
docker compose exec -T backup sh /scripts/restore.sh /backups/newsclaw-<timestamp>.dump restored_database
```

脚本先检查备份可读性与格式，再检查目标为空，随后通过单个事务恢复；失败不删除现有业务数据库。核对记录、关联和登录后再切换应用连接。

发布使用 `APP_VERSION` 同时标记镜像与运行版本。保留上一可运行镜像和数据库备份，使用已构建标签配合 `docker compose up --no-build -d api worker` 切换；迁移改变数据结构时先按对应迁移说明恢复匹配的数据。恢复后核对当前版本涉及的业务记录、关联和账号访问。

## 应用检查

`npm test` 运行账号、配置与任务运行能力的行为测试。测试创建独立数据库和队列，外部信源与模型使用 HTTP 替身。测试数据库账号需有创建临时数据库权限，生产账号不用于自动检查。

API 文档路由为 `/docs/api` 和 `/api/v1/openapi.json`。定义生成对未声明 schema 的路由处理有误，需修正；可调用路径同时在各模块说明中维护。
