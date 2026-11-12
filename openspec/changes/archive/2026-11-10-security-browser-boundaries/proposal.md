# Proposal

## Why

课程第 9 课要求以反例验证浏览器安全边界。现有应用具备写请求来源检查，但缺少独立覆盖来源判断的回归；课程还要求 CSRF token 和 SameSite 的独立证据，不能以现有来源检查代替。

## What Changes

- 对真实 Fastify 入口补充合法来源和跨站写入的回归，核验拒绝响应、处理器未执行和安全请求可用。
- 对新闻列表组件的恶意标题补充 HTML 输出检查，验证文本转义及正常标题可读。
- 在隔离数据库和真实 HTTP 下检查 SQL 注入、跨站写入和会话 Cookie；在浏览器中检查从数据库经 API 到列表的恶意标题。
- 梳理第 8 至 10 课要求与项目当前证据，记录待实施项目和无法验证的事项。
- 为浏览器认证写请求及 Cookie 会话刷新增加绑定会话、单次使用的 CSRF token，保留非浏览器 Bearer API 的访问方式。
- 让安全门禁和 CI 安全任务执行真实 HTTP 注入反例及浏览器标题检查，并保留密钥、依赖及工具检查；对 main 推送运行同一 workflow。
- 在一次性隔离副本进行门禁红绿演练，保存可复核的检查记录。
- 扩充 HTTP 成功和拒绝请求的结构化审计字段，避免记录原始路径参数；补充脱敏及 401/403/404 回归。
- 修复浏览器回归中切换至新会话后旧会话数据可能重新显示的问题。
- 对普通回答在引用校验和保存后才发送正文，防止已拒绝内容先经事件流或会话暴露；会增加正文首字等待时间。

## Capabilities

### New Capabilities

- `browser-request-security`: 浏览器请求来源的安全检查及回归。

### Modified Capabilities

- `contribution-workflow`: 安全门禁覆盖可重现的应用反例。
- `reading-interface`: 异步会话读取不得覆盖当前新会话。

## Impact

影响安全测试、CI、安全门禁、课程对照、会话请求及前端请求封装，并增加 token 存储迁移；无 Origin 的 Bearer API 保持兼容，Cookie 刷新调用方须先取得 CSRF token。安全门禁需要隔离 PostgreSQL、Redis 与 Chromium。
