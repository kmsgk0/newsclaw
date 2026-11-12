## ADDED Requirements

### Requirement: FLOW-12 安全门禁覆盖应用反例

`make check-security` MUST 执行既有密钥、依赖、检查工具和可重现的应用安全反例，包括 SQL 注入、来源与单次 CSRF token、请求审计和浏览器标题 XSS。PR 安全任务 MUST 使用隔离 PostgreSQL、Redis、外部服务替身及 Chromium，运行同一门禁；任一检查失败返回非零。独立仓库安全扫描命令仍可无需业务服务执行。

#### Scenario: 安全门禁通过

- **GIVEN** 扫描工具、浏览器及隔离数据库和队列可用，安全反例满足预期。
- **WHEN** 开发者或 PR 安全任务运行 `make check-security`。
- **THEN** 密钥、依赖、工具、HTTP 和浏览器反例均执行，全部通过时返回零。

#### Scenario: 安全反例失败

- **GIVEN** 注入反例被放行、token 重放成功或扫描发现高危漏洞。
- **WHEN** 运行安全门禁。
- **THEN** 对应检查及门禁返回非零，不将失败记录为通过。

#### Scenario: 安全门禁缺少隔离依赖

- **GIVEN** 数据库、队列或浏览器缺失。
- **WHEN** 运行安全门禁。
- **THEN** 实际依赖失败明确报告并返回非零，不跳过应用反例。

#### Scenario: main 推送与 PR 使用同一安全门禁

- **GIVEN** 变更推送到 main 或创建面向 main 的 PR。
- **WHEN** CI 运行对应 workflow。
- **THEN** 仓库、应用和安全检查都运行，安全任务使用 `make check-security`；提交检查使用事件中实际 base 和 head。

### Requirement: FLOW-13 门禁后的镜像构建

CI SHALL 在应用、仓库和安全检查通过后构建生产镜像，并以对应提交标识标记；检查失败时不得运行后续构建。实际远端执行与分支保护须以运行记录为准。

#### Scenario: 推送后构建

- **GIVEN** 目标分支发生推送或收到合并请求。
- **WHEN** 应用、仓库和安全检查均通过。
- **THEN** CI 构建以该次提交标识标记的生产镜像，并保留构建日志。
