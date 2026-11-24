# 门禁红绿对照

在 Ubuntu x86-64 的一次性容器副本中使用 PostgreSQL、Redis、HTTP 模型替身和 Chromium。演练使用 SEC-12 跨会话令牌用例，判据为写入被拒并返回 403。红灯副本的临时修改位于 [CSRF 会话校验](../src/server/modules/account/csrf.ts)，绿灯副本恢复会话令牌校验。

| 日期与命令 | 红灯 | 绿灯 |
| --- | --- | --- |
| 2026-11-10，`make check-security` | 写入返回 200，HTTP 用例失败，退出 2。后续浏览器阶段未执行。 | 恢复令牌校验后，6 项安全工具测试、4 项 HTTP 反例和 1 项浏览器检查通过，退出 0。 |
| 2026-11-11，`make check` | 同一判据得到 200，完整门禁退出 2。 | 恢复校验后 14 个阶段全部通过，退出 0。 |

完整门禁的输出保存于 `.local/verification/ubuntu-20261110/make-check-red-20261111.log` 和同目录的 `make-check-green-20261111.log`。两次演练都在临时副本中进行。主干的必需检查与构建结果见[流水线记录](pipeline.md)。

同日对包含请求审计与回答校验的安全门禁运行 `make check-security`，6 项安全工具测试、9 项 HTTP 与编辑器用例、1 项浏览器检查通过，退出 0。SEC-14 同时核对事件流和会话存储，确认被拒绝的回答没有发布正文。
