# 账号与授权检查

检查日期：2026-11-09。版本与环境见[报告索引](README.md)。依据 ACC-01 至 ACC-05、EDITOR-02、EDITOR-03、TOPIC-01、TOPIC-02 和 TOPIC-06，使用未登录身份、普通账号 A 和 B、管理员，检查 HTTP、MCP 与数据库结果。

## 权限判据与结果

| 对象与方法 | 通过判据 | 当前结果 |
| --- | --- | --- |
| 公共新闻与九个私人入口，真实 HTTP 请求 | 公共内容返回 200；未登录访问私人入口返回 401 | 通过 |
| 会话、记忆、专题、笔记、成果和私人任务，替换资源标识 | 本人可维护；他人和不存在对象均返回 404；拒绝操作不改变记录 | 通过 |
| 收藏、阅读记录、个人技能、日报与消息，两个账号交叉查询 | 列表和状态只反映当前账号；全部已读仅修改本人的消息 | 通过 |
| 信源及公共任务管理，普通用户直接调用 API | 返回 403，信源状态和任务记录不发生越权变化 | 通过 |
| MCP 参数及私人材料 | 参数不能指定执行账号，工具使用宿主身份；他人材料返回 404 | 通过 |
| 登录、刷新、退出与修改密码 | 刷新轮换；退出和改密后旧会话失效；旧密码并发登录不留下有效会话 | 通过 |
| 分享预览、发布、撤销和成果删除 | 只公开选中成果与公共来源；撤销或删除成果使分享不可访问 | 通过 |

注册以同一事务创建账号和编辑。登录与改密的并发测试在真实数据库会话写入处协调执行，检查完成后旧凭据和令牌都不能继续认证。后台执行前还核对信源启用状态及管理角色，接收时有效的权限不能替代执行时检查。

## 检查入口

实现对象包括[认证服务](../src/server/modules/account/service.ts)、[请求边界](../src/server/base-app.ts)、[MCP](../src/server/adapters/mcp.ts)、[编辑存储](../src/server/modules/editor/repository.ts)和[专题存储](../src/server/modules/topics/repository.ts)。

```sh
node --import tsx --test tests/account/auth.test.ts tests/account/auth-revocation-race.test.ts tests/editor/editor-api.test.ts tests/runtime/reader-workflows.test.ts tests/topics/topics.integration.test.ts
npm run test:api
```

具体请求与返回值见[应用安全检查](security-precheck.md)和[安全检查评审](review-01.md)，模型内容结果见[AI 评测](../docs/verification/ai-results.md)。
