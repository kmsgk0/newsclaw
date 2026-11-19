# 代码审查修复与重构

日期：2026-11-19。实施及检查方式：AI 代码阅读、实际 PostgreSQL 并发测试、HTTP 模型替身和 Playwright 浏览器验证。应用检查版本为 `1f91d65fcba2e24c9c4642f9a846d95f5328514c`；后续提交仅整理检查记录与规格归档。

## 缺陷回归

| 对象与依据 | 修复前的实际结果 | 修复后的检查 |
| --- | --- | --- |
| [编辑服务](../src/server/modules/editor/service.ts)，EDITOR-02 | 工具调用前的文字混入正文，无效引用使最终正确回答被拒绝 | 只发布最终轮次；检查已保存正文、文本事件、来源及完成状态，排除临时价格和无效引用 |
| [阅读历史](../src/web/pages/editor/history.tsx)、[任务组件](../src/web/components/task-status.tsx)，EDITOR-04/06 | 浏览器显示任务完成，但生成按钮仍禁用 | 桌面、平板、手机均检查日报及手记成功、失败后再次生成和分区切换 |
| [模型适配器](../src/server/adapters/model.ts)，OPS-04 | 已返回的流式用量在截断或校验失败后丢失 | 覆盖完整、部分、缺失用量及非法帧、异常结束；数据库检查跨工具轮次累计和未知字段 |
| [专题存储](../src/server/modules/topics/repository.ts)，TOPIC-01 | PostgreSQL 行锁保证两个请求读取同一旧版本后，名称或描述被另一请求覆盖 | 同样的并发操作保留两项修改，未提交字段不变，跨账号更新被拒绝 |

四项缺陷均先运行新增回归观察失败，再修复并沿相同判据复测；使用合成账号、新闻和模型，无真实模型费用。

## 重构与文件核查

| 文件与依据 | 检查手段、判据与结论 |
| --- | --- |
| [chat.tsx](../src/web/components/chat.tsx)、[会话 Hook](../src/web/components/chat/use-chat-session.ts)、[消息展示](../src/web/components/chat/messages.tsx)、[流消费](../src/web/components/chat/stream.ts)、[组件类型](../src/web/components/chat/types.ts)，EDITOR-03、UI-02/03 | 会话管理、传输与展示分开，重置使用同一入口；流分片单元测试及三种尺寸的聊天、技能和专题浏览器回归通过。可用 |
| [材料准备](../src/server/modules/editor/background.ts)、[新闻批量读取](../src/server/modules/news/repository.ts)，EDITOR-04/06 | 复用批量读取；核对材料顺序、缺失报道、账号范围、日报版本和手记来源。可用；未进行新的性能压测 |
| [专题服务](../src/server/modules/topics/service.ts)、[专题存储](../src/server/modules/topics/repository.ts)，TOPIC-01 | 详情只读取一次专题，子查询保留账号条件；核对刷新后计数、新闻、笔记、成果及跨账号拒绝。可用 |
| [基础应用](../src/server/base-app.ts)、[审计路由](../src/server/modules/audit/index.ts)、[审计 schema](../src/server/modules/audit/schemas.ts)、[审计存储](../src/server/modules/audit/repository.ts)，AUD-01/02/03/04 | 路由、输入与数据访问分开；真实 HTTP 检查管理员限制、筛选、敏感字段排除，以及技能审计与回答同事务回滚。可用 |

接口身份、业务终态、数据库并发、共享函数、错误传播、隐私与查询次数均按相关场景检查。查询优化来自减少数据库往返，不能据此宣称已测得延迟收益。

## 完整验收

Ubuntu x86-64 专用 Docker 网络使用 PostgreSQL 17（pgvector）、Redis 7.4、Node.js 24.22.2 和已有验收镜像。Browser 插件不可用，使用项目已有 Playwright，覆盖 1440、768、390 像素宽度。外部来源和模型全部使用替身；Secure Cookie 使用验收默认配置，依赖审计通过临时代理执行。

执行 `node scripts/checks/check.mjs --group all --base origin/main`，14 阶段全部通过：

- 规格、文件与链接、10 个非合并提交引用检查通过。
- 43 项检查工具测试、6 项安全工具测试、密钥扫描及依赖审计通过。
- ESLint、TypeScript、113 项业务与集成测试、11 项 HTTP 与任务恢复测试通过。
- 服务端和网页构建、60 项浏览器测试、2 项模型用量检查通过。
- 聊天首屏截图已人工辅助检查，正文、来源和输入区正常显示；新增浏览器用例检查页面异常及横向溢出。

完整运行材料保存在本地忽略目录 `.local/verification/review-20261119/`。应用版本对应的 [GitHub Actions](https://github.com/kmsgk0/newsclaw/actions/runs/44549993301) 四个作业全部成功，包含生产镜像构建；[PR #10](https://github.com/kmsgk0/newsclaw/pull/10) 保留独立提交。

初次完整检查发现新增文件末尾空行，已单独修正。一次隔离运行沿用了开发用的 `COOKIE_SECURE=false`，安全用例正确拒绝该配置；改用默认 Secure 配置后完整通过，未削弱安全断言。Mac 归档复核的规格、文件、提交及工具测试通过，但本机缺少指定版本 Gitleaks；安全复核继续在已有 Linux 验收镜像执行。运行日志中仍有既存 Fastify 配置弃用提示，不影响本轮结果。

## 范围

本轮保持接口兼容，无数据库迁移和新增依赖；每项修复与重构分别提交。新增功能、付费模型语义评测、真实用户反馈与线上部署不在本轮范围内。
