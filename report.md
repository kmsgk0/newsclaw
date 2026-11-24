# NewsClaw 项目报告

- 项目：NewsClaw（个性化 AI 新闻阅读平台）
- 成员与分工：
  - 李嘉泽：负责需求规约、核心业务与异步任务引擎、容器验收及覆盖率/性能门禁与检索索引优化（集中在 `openspec/`、`src/server/runtime/`、`scripts/checks/`、`scripts/performance/`，对应记录 `reports/review-01.md`、`reports/review-02.md`、`reports/review-04.md`、`reports/bench.md`）
  - 杨艺欣：负责安全防护与请求审计体系、前端聊天组件重构与多端阅读流程、监控告警栈及专项代码审查修复（集中在 `src/server/modules/audit/`、`src/web/components/chat/`、`monitoring/`、`tests/e2e/`，对应记录 `reports/sec08-experiment.md`、`reports/observe-alert.md`、`reports/review-fixes.md`、`reports/reading-workflows.md`）
- 仓库地址：`https://github.com/kmsgk0/newsclaw`
- 在线地址：`https://newsclaw.xwysyy.com`
- 演示视频下载地址：`待补充（录屏上传网盘后填入）`
- 使用的 Harness：Codex
- 支撑记录目录：`reports/`（评审记录、高风险三查、压测与门禁证据，索引见 [reports/README.md](reports/README.md)）
- 日期：2026-11-25

## 1. 一句话介绍

NewsClaw 面向需要持续跟踪事件的读者，解决信息分散在不同信源、难以核对原文和持续跟进进展的问题：系统从公开信源聚合报道，由专属编辑提供带原文引用的问答与个人日报，并在专题中汇集新增报道与阅读成果。[README.md](README.md)

## 2. AI 写了什么

本项目的业务代码与 OpenSpec 规约均由 AI 在 Codex 下辅助生成。代码与规约之外的 AI 产出如下：

- 工程规则与技能：[AGENTS.md](AGENTS.md)、`docs/standards/`（八类工程规范）与 `.agents/skills/`，写明分层约束、七类核查、补测试与发布恢复流程。
- 测试与评测用例：`tests/`（单元、集成、浏览器 E2E 与模型评测）及 `apitest/cases/`，覆盖异步任务、幂等、账号隔离、SQL 注入、XSS、CSRF 与调用审计。
- 验证编排与 CI：[Makefile](Makefile)、`scripts/checks/`、[scripts/verification/runtime.mjs](scripts/verification/runtime.mjs)、[compose.acceptance.yaml](compose.acceptance.yaml) 与 [.github/workflows/pr-checks.yml](.github/workflows/pr-checks.yml)，编排规约校验、安全扫描、覆盖率与性能门禁及镜像构建。
- 压测与监控材料：`scripts/performance/`（k6 压测脚本、查询计划夹具与门禁配置）、[reports/bench.md](reports/bench.md) 与 `monitoring/`（Prometheus、Grafana 与 Alertmanager 告警配置）。
- 评审与运行记录：`reports/review-01.md` 至 `reports/review-04.md`、`reports/risk-concurrency.md`、`reports/risk-transaction.md`、`reports/risk-authz.md`、`reports/gate-red-green.md`、`reports/feedback.md` 与 `reports/traceability.md`（覆盖现行 13 组规格的全部 253 个场景）。
- 使用与运维文档：[README.md](README.md)、[docs/usage.md](docs/usage.md)、[docs/runtime.md](docs/runtime.md) 与 [docs/verification/checks.md](docs/verification/checks.md)，说明启动、阅读流程、检查入口与备份恢复。

使用的 Harness 为 Codex。七类核查清单位于 [docs/standards/review.md](docs/standards/review.md#七类核查)（由 [AGENTS.md](AGENTS.md) 索引），各类的核查问题与检查手段如下：

| 核查类 | 核查问题 | 检查手段 |
| --- | --- | --- |
| 接口入口 | 参数、身份、资源归属与返回字段是否完整 | 脚本重放 `apitest/cases/` 合法及非法请求，对照 OpenAPI 核对状态码与写入 |
| 业务逻辑 | 状态流转与分支是否符合规约场景 | AI 自审逐段对照规约 Scenario，脚本运行场景用例（映射见 `reports/traceability.md`），语义边界由人工确认 |
| 数据库操作 | 唯一约束、事务边界、索引与查询计划 | 审查迁移与存储层代码，脚本执行并发与故障回滚用例，性能阶段校验执行计划无 `Seq Scan` |
| 公共函数 | 边界值、空值、重复逻辑与异常传播 | AI 检索相似调用点，单元测试验证共享逻辑并执行服务端源码覆盖率门禁 |
| 错误处理 | 非法输入、缺失对象与依赖失败的退出和降级 | 替身与故障注入用例断言错误码、非零退出及既有成功内容保留 |
| 安全与隐私 | 越权、注入、输出转义、密钥与依赖漏洞 | 执行 `make check-security`（Gitleaks 密钥扫描、依赖审计、注入/CSRF/XSS 反例） |
| 性能 | 慢查询、并发饱和与吞吐退化 | 运行 `scripts/performance/` k6 压测与日常性能阈值门禁，结果归档 `reports/bench.md` |

## 3. 审核记录

| 编号 | 检查手段 | 检查对象 | 判据 | 结果与记录 |
| --- | --- | --- | --- | --- |
| 1 | AI 自审、接口脚本（`tests/editor/editor-api.test.ts`） | 匿名访问六个私人入口与公开入口，以及账号 B 读写账号 A 的会话、记忆、个人技能与日报任务 | 对照 ACC-03、ACC-04：匿名私人入口返回 401、公开入口返回 200，跨账号读写均返回 404 | 六项匿名入口均返回 401，公开入口 200，四类跨账号读写均为 404，用例常驻回归。[reports/review-01.md](reports/review-01.md) |
| 2 | 独立 AI 审查、隔离脚本、人工复核原文 | `f5b7e50` 对失败调用用量丢失、OpenAPI 返回 500、个人日报过度推断三项问题的修复 | 对照 OPS-04、OPS-06、EDITOR-04：失败调用保留已返回 token 用量，OpenAPI 与页面返回 200，日报兴趣关联须来自原文摘录 | 用量对照由 1 过 1 败变为 2 过 0 败，接口文档返回 200；经人工复核日报语义后，将“事实正文与兴趣关联拆分并校验原文摘录”固化为结构校验与两组回归用例（`tests/editor/digest-grounding.test.ts`、`tests/news/digest-sources.test.ts`）。[reports/review-02.md](reports/review-02.md) |
| 3 | 接口脚本、手机视口浏览器走查 | `ec24c60` 的账号隔离、CSRF 会话令牌校验、无效引用拒发及 390 × 844 手机端日报任务流 | 九个私人入口 401、跨账号 404、缺令牌写入 403、无效引用不发正文，手机端提交返回 202 并轮询至成功、跨账号查任务 404 且审计可查 | 三组接口脚本均退出 0；手机端任务依次返回 `pending`、`running`、`succeeded`，另一账号查询返回 404 并回查到对应请求审计。[reports/review-03.md](reports/review-03.md) |
| 4 | 全量脚本门禁、运行脚本、人工确认阅读反馈 | `00ad133` 的 15 阶段全量验收、安全与性能门禁、干净启动及 `reports/feedback.md` 三组使用反馈 | 全量 15 阶段退出 0，覆盖率与性能阈值达标，已确认的界面与口径偏差形成回归用例 | 286 条执行记录全绿（服务端行覆盖率 93.96%、分支 86.33%、函数 86.38%），安全与性能门禁通过；经人工确认后将注册按钮文案、重试计数说明与分享页日期快照三项修正补入集成与三端浏览器回归。[reports/review-04.md](reports/review-04.md) |

四份评审均以 AI 自审与自动化脚本为主，人工仅在机器难以直接判定的语义边界与展示口径处复核确认，并将结论固化为常驻回归用例；另附常规代码审查修复与重构记录 [reports/review-fixes.md](reports/review-fixes.md)。

## 4. 高风险三查

- **并发（脚本）**：通过 `npm run test:api` 运行 [apitest/cases/runtime.test.ts](apitest/cases/runtime.test.ts)，对同一采集操作并发提交 20 次并在完成后再次投递消息，同时检查 Worker 停止恢复与确认前中断。判据为 20 次请求均返回 202 且复用同一任务标识，最终仅产生 1 条新闻且模型调用次数不变。实测 20 个 202 共用 1 个任务标识，重投后新闻仍为 1 条、模型调用保持 2 次，退出码 0。记录：[reports/risk-concurrency.md](reports/risk-concurrency.md)
- **事务（脚本）**：通过 `npm test` 与 `npm run test:api`（[tests/runtime/tasks.test.ts](tests/runtime/tasks.test.ts)、[apitest/cases/runtime.test.ts](apitest/cases/runtime.test.ts)）在写入待投递记录（outbox）及结果提交阶段注入数据库异常。判据为接口返回 500，任务与待投递记录共同回滚、孤儿任务为 0，失败不覆盖已有成功内容。实测返回 500 且孤儿任务为 0，注册初始化、手记增量与提醒回滚用例均通过。记录：[reports/risk-transaction.md](reports/risk-transaction.md)
- **权限（脚本）**：通过 `npm run test:api` 与 `node --import tsx --test apitest/cases/security.test.ts` 使用未登录身份、双普通账号 A/B 与管理员核查九个私人入口、私人对象读写、管理接口及 MCP 工具。判据为未登录返回 401，跨账号读写与不存在资源统一返回 404，普通用户调用管理接口返回 403 且数据不变。实测全部权限与会话撤销用例通过。记录：[reports/risk-authz.md](reports/risk-authz.md)

复跑命令（Docker 隔离一键运行全量验收，或在隔离开发环境中单独执行接口用例）：

```sh
sh scripts/acceptance.sh
npm run test:api
node --import tsx --test apitest/cases/security.test.ts
```

## 5. 门禁与演示

- **CI 与主干保护**：`main` 分支启用保护（对管理员同样生效），合入前必须通过 `Repository checks`、`Security checks`、`Application checks` 三项检查，全部通过后才构建生产镜像（[.github/workflows/pr-checks.yml](.github/workflows/pr-checks.yml)）。主干 `c3111c2` 触发的[构建 45424494014](https://github.com/kmsgk0/newsclaw/actions/runs/45424494014) 四个作业全部通过，镜像标签为 `newsclaw:c3111c2fd58d3ba924412f07098a3e0feddd57ee`。记录：[reports/pipeline.md](reports/pipeline.md)
- **先红后绿证据**：在 [PR #12](https://github.com/kmsgk0/newsclaw/pull/12) 中将 [apitest/cases/csrf.test.ts](apitest/cases/csrf.test.ts) 第 32 行跨会话写入断言由 `403` 临时改为 `200`（提交 `11b8d1c`），运行 [45420727899](https://github.com/kmsgk0/newsclaw/actions/runs/45420727899) 中 `Security checks`（退出码 2）与 `Application checks`（退出码 1）红灯阻断，镜像跳过构建，PR 状态变为 `BLOCKED`；提交 `f7ff42e` 恢复 `403` 断言后，运行 [45421376670](https://github.com/kmsgk0/newsclaw/actions/runs/45421376670) 四个作业全绿（退出码 0），解除阻断。记录：[reports/gate-red-green.md](reports/gate-red-green.md)
- **验证命令与结果**：`make check` 运行 15 个阶段（286 条测试记录全绿，服务端覆盖率行 93.96%、分支 86.33%、函数 86.38%，退出码 0）；`make check-security` 覆盖密钥扫描（0 命中）、依赖审计（0 高危与严重漏洞）及注入、CSRF、XSS 反例（退出码 0）；纯 Docker 复跑入口为 `sh scripts/acceptance.sh`。
- **在线地址与演示**：公网环境运行于 `https://newsclaw.xwysyy.com`（版本 `c3111c2`）。干净源码启动与手机视口四步闭环（登录、提交日报返回 202、轮询 `pending` 至 `running` 至 `succeeded`、另一账号查询返回 404 并回查请求审计）可用 `node scripts/verification/runtime.mjs verify` 复现，记录见 [reports/boot-reproduce.md](reports/boot-reproduce.md)。演示录屏控制在 3 分钟内，依次运行上述验证命令展示结果，并演示核心阅读、引用问答、个人日报与跨账号隔离流程（视频链接待上传后补入报告头部）。

## 6. 复盘

代价最大的一次返工是关键词检索从全表顺序扫描改造为 trigram GIN 索引。初期 `GET /api/v1/news?q=...&semantic=false` 在标题、正文、摘要与译文上执行首尾通配符模糊匹配，但正文、摘要与译文缺少文本索引，导致 PostgreSQL 退化为全表 `Seq Scan`。在 5,000 篇新闻、20 VU、60 秒的 k6 压测中（基线 `754c2ca`），新闻检索吞吐仅 2.0 请求/秒，P95 延迟达到 13,003.46 毫秒，130 次请求出现 3 次 500（HTTP 错误率 2.31%），单并发计数查询耗时 81.782 毫秒。

返工方案通过 [migrations/018_news_text_search_indexes.sql](migrations/018_news_text_search_indexes.sql) 为正文、摘要与译文建立 trigram GIN 索引（提交 `718f794`），同时在日常性能门禁中加入 `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` 断言，禁止 `news` 检索出现 `Seq Scan`。以同一 k6 脚本、参数（20 VU、60 秒）与容器限额复测：新闻检索吞吐由 2.0 升至 130.9 请求/秒，P95 由 13,003.46 降至 217.87 毫秒，HTTP 错误率由 2.31% 降至 0%；单并发计数耗时由 81.782 降至 1.355 毫秒，执行计划由 `Seq Scan` 转为五路 `Bitmap Index Scan`。此次返工投入了迁移脚本、5,000 篇长度夹具与 24 组 60 秒对比压测，并带来一定的写入开销（夹具导入中位数耗时由 0.95 秒增至 2.39 秒），但通过将查询计划检查固化进门禁，后续改动若导致检索退回全表扫描会在合并前被自动拦截。完整条件、前后数据与重跑命令见 [reports/bench.md](reports/bench.md) 与 [reports/bench-results.json](reports/bench-results.json)。
