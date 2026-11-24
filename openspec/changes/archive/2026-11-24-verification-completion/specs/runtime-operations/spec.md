# Spec Delta

## MODIFIED Requirements

### Requirement: OPS-06 接口文档可用

系统 SHALL 提供可读取的 OpenAPI 定义与浏览器文档页面，公开接口和受保护接口的权限说明与实际路由一致。合法缺省的路由 schema 不得使文档生成失败。定义 SHALL 声明实际成功状态、JSON 响应信封、异步任务信息及 SSE 内容类型，文档页面支持已认证的写请求。

#### Scenario: 生成接口定义

- **GIVEN** 完整应用已注册业务路由及文档插件。
- **WHEN** 匿名请求 `/api/v1/openapi.json`。
- **THEN** 返回 HTTP 200 和有效 OpenAPI 文档，包含代表性业务路径及对应的公开或 Bearer 权限说明。

#### Scenario: 浏览接口文档

- **GIVEN** 应用可访问。
- **WHEN** 在浏览器打开 `/docs/api`。
- **THEN** 文档页面和接口定义加载成功，可查看业务接口，不显示定义加载失败。

#### Scenario: 创建与异步响应

- **GIVEN** 注册、创建资源和任务接收接口均已注册。
- **WHEN** 查看对应操作的 OpenAPI 响应并执行代表性请求。
- **THEN** 创建操作声明实际 201，任务接收声明 202 及 taskId、status、statusUrl，JSON 信封与实际响应一致。

#### Scenario: 流式响应声明

- **GIVEN** 会话消息接口产生 SSE。
- **WHEN** 查看接口响应定义。
- **THEN** 成功响应声明 text/event-stream 和实际事件格式，开始流式输出前的错误仍声明为 JSON。

#### Scenario: 文档写请求

- **GIVEN** 使用者在文档页面提供自己的有效访问令牌。
- **WHEN** 试调受保护的写请求。
- **THEN** 请求取得并使用一次性会话令牌，实际写入成功且返回定义中的结构；失效认证与权限拒绝保留实际错误。
