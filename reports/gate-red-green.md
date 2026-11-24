# 门禁红绿对照

## PR 门禁演练（2026-11-24）

在 [PR #12](https://github.com/kmsgk0/newsclaw/pull/12) 上完成一次受控红绿演练，验证必需检查与 `main` 分支保护能够阻止不合格合入并在修复后恢复通过。

- **改坏位置**：[apitest/cases/csrf.test.ts](../apitest/cases/csrf.test.ts) 第 32 行，将 `SEC-12` 跨会话令牌写入断言的期望状态码由 `403` 临时改为 `200`（应用仍按规范返回 `403`）。
- **改坏提交**：`11b8d1c39a60677654fcba51742bc76e9dd5763c`
- **修复提交**：`f7ff42e80af9c5c63ab5e8d82012398274fdd885`（恢复断言期望为 `403`）

| 阶段 | 提交与运行 | 关键输出、退出码与合入状态 |
| --- | --- | --- |
| 红灯 | `11b8d1c`，运行 [45420727899](https://github.com/kmsgk0/newsclaw/actions/runs/45420727899) | [Repository checks](https://github.com/kmsgk0/newsclaw/actions/runs/45420727899/job/138539179452) 通过；[Security checks](https://github.com/kmsgk0/newsclaw/actions/runs/45420727899/job/138539179594)（退出码 `2`）与 [Application checks](https://github.com/kmsgk0/newsclaw/actions/runs/45420727899/job/138539178739)（退出码 `1`）均在 `SEC-12` 报 `AssertionError [ERR_ASSERTION]: actual: 403, expected: 200`；`Production image` 跳过未构建；PR 合入状态为 `BLOCKED`。 |
| 绿灯 | `f7ff42e`，运行 [45421376670](https://github.com/kmsgk0/newsclaw/actions/runs/45421376670) | [Repository checks](https://github.com/kmsgk0/newsclaw/actions/runs/45421376670/job/138541514383)、[Security checks](https://github.com/kmsgk0/newsclaw/actions/runs/45421376670/job/138541513793)、[Application checks](https://github.com/kmsgk0/newsclaw/actions/runs/45421376670/job/138541515019) 与 [Production image](https://github.com/kmsgk0/newsclaw/actions/runs/45421376670/job/138546150490) 全部通过（退出码 `0`）；合入阻断解除（`CLEAN`）。 |

本地复跑入口：`make check-security` 与 `make check`（均执行 `apitest/cases/csrf.test.ts`）。主干构建与分支保护配置见[流水线记录](pipeline.md)。

## 本地容器演练（2026-11-10 至 2026-11-11）

在 Ubuntu x86-64 的一次性容器副本中使用 PostgreSQL、Redis、HTTP 模型替身和 Chromium。演练使用 SEC-12 跨会话令牌用例，判据为写入被拒并返回 403。红灯副本的临时修改位于 [CSRF 会话校验](../src/server/modules/account/csrf.ts)，绿灯副本恢复会话令牌校验。

| 日期与命令 | 红灯 | 绿灯 |
| --- | --- | --- |
| 2026-11-10，`make check-security` | 写入返回 200，HTTP 用例失败，退出 2。后续浏览器阶段未执行。 | 恢复令牌校验后，6 项安全工具测试、4 项 HTTP 反例和 1 项浏览器检查通过，退出 0。 |
| 2026-11-11，`make check` | 同一判据得到 200，完整门禁退出 2。 | 恢复校验后 14 个阶段全部通过，退出 0。 |

完整门禁的输出保存于 `.local/verification/ubuntu-20261110/make-check-red-20261111.log` 和同目录的 `make-check-green-20261111.log`。同日对包含请求审计与回答校验的安全门禁运行 `make check-security`，6 项安全工具测试、9 项 HTTP 与编辑器用例、1 项浏览器检查通过，退出 0。SEC-14 同时核对事件流和会话存储，确认被拒绝的回答没有发布正文。
