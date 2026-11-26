# NewsClaw 项目报告

- **项目**：NewsClaw（个性化 AI 新闻阅读平台） · **Harness**：Codex · **日期**：2026-11-25
- **地址**：仓库 `https://github.com/kmsgk0/newsclaw` · 在线 `https://newsclaw.xwysyy.com` · 支撑记录 [reports/README.md](reports/README.md)
- **演示视频下载地址**：`待补充（录屏上传网盘后填入）`
- **成员与分工**：
  - **李嘉泽**：需求规约、核心业务与异步任务引擎、容器验收、覆盖率与性能门禁及检索索引优化（`openspec/`、`src/server/runtime/`、`scripts/checks/`、`scripts/performance/`；`reports/review-01.md`、`review-02.md`、`review-04.md`、`bench.md`）
  - **杨艺欣**：浏览器请求安全与请求审计、监控告警与压测初版、聊天组件重构、自动生成/专题进展/导出/反馈功能与审查修复（`src/server/modules/audit/`、`src/web/components/chat/`、`monitoring/`、`tests/e2e/`；`reports/audit-recheck.md`、`sec08-experiment.md`、`review-fixes.md`、`reading-workflows.md`）

## 1. 一句话介绍

NewsClaw 面向持续跟踪事件的读者，解决信息分散、难以核对原文和跟进进展的问题：系统从公开信源聚合报道，由专属编辑提供带原文引用的问答与个人日报，并在专题中汇集新增报道与阅读成果。[README.md](README.md)

## 2. AI 写了什么

业务代码与 OpenSpec 规约均由 AI 在 Codex 下辅助生成。代码与规约之外的 AI 产出包括：

- **规则与技能**：[AGENTS.md](AGENTS.md)、`docs/standards/`（八类规范）与 `.agents/skills/`（补测试、发布恢复）。
- **测试与评测**：`tests/`（单元、集成、E2E、模型评测）与 `apitest/cases/`（异步、权限、注入与 CSRF 反例）。
- **验证与 CI**：[Makefile](Makefile)、[scripts/acceptance.sh](scripts/acceptance.sh)、`scripts/checks/`、[scripts/verification/runtime.mjs](scripts/verification/runtime.mjs)、[compose.acceptance.yaml](compose.acceptance.yaml) 与 [.github/workflows/pr-checks.yml](.github/workflows/pr-checks.yml)。
- **压测与监控**：`scripts/performance/`（k6 脚本、查询夹具与门禁）、[reports/bench.md](reports/bench.md) 与 `monitoring/`（Prometheus/Grafana/Alertmanager）。
- **评审与记录**：`reports/review-01.md` 至 `review-04.md`、`reports/risk-*.md`、`reports/gate-red-green.md`、`reports/feedback.md` 与 `reports/traceability.md`（13 组规格 253 场景对应）。
- **使用与运维文档**：[README.md](README.md)、[docs/usage.md](docs/usage.md)、[docs/runtime.md](docs/runtime.md) 与 [docs/verification/checks.md](docs/verification/checks.md)。

七类核查清单位于 [docs/standards/review.md](docs/standards/review.md#七类核查)（由 [AGENTS.md](AGENTS.md) 索引）：

| 核查类 | 核查问题 | 检查手段 |
| --- | --- | --- |
| 接口入口 | 参数、身份、归属与返回 | 脚本重放 `apitest/cases/`，对照 OpenAPI 核对响应与写入 |
| 业务逻辑 | 需求覆盖与状态流转 | AI 自审对照规约 Scenario，脚本运行场景用例（`reports/traceability.md`） |
| 数据库操作 | 唯一约束、事务与写入 | 审查迁移与存储层代码，并发与故障回滚用例核对库表变化 |
| 公共函数 | 边界值、重复与异常传播 | AI 检索调用点，单元测试加服务端源码覆盖率门禁 |
| 错误处理 | 非法输入与依赖失败降级 | 替身与故障注入用例断言错误码、非零退出及旧内容保留 |
| 安全与隐私 | 越权、注入、密钥与依赖 | 执行 `make check-security`（Gitleaks、依赖审计、注入/CSRF/XSS 反例） |
| 性能 | 慢查询、索引与并发表现 | 运行 `scripts/performance/` k6 压测与门禁（固定查询无 `Seq Scan`），见 `reports/bench.md` |

## 3. 审核记录

1. **AI 代码阅读与接口脚本**（`tests/editor/editor-api.test.ts`）：查六个匿名私人入口、公开对照及双账号交叉读写四类私人对象；判据为匿名 401、公开 200、跨账号 404；实测全通过，用例常驻。[reports/review-01.md](reports/review-01.md)
2. **独立 AI 审查、隔离脚本与原文对照**：查首次检查暴露的 SEC-07 失败用量丢失、OpenAPI 500、日报过度推断三项修复（`f5b7e50`）；判据为失败调用保留用量、接口页 200、兴趣关联来自原文摘录；实测 17 项回归、2 项用量对照与 3 项日报用例全绿（用量由 1 过 1 败转为 2 过 0 败，见 [reports/security-fix-log.md](reports/security-fix-log.md)）。[reports/review-02.md](reports/review-02.md)
3. **接口脚本与手机视口浏览器走查**：查 `ec24c60` 账号隔离、CSRF 校验、无效引用拒发及 390 × 844 手机日报流程；判据为匿名 401、跨账号 404、缺令牌 403、手机提交 202 并轮询成功且可查审计；三组接口脚本退出 0，手机链路通过。[reports/review-03.md](reports/review-03.md)
4. **全量脚本门禁、运行脚本与 diff 核对**：查 `00ad133` 的 15 阶段全量验收（286 条全绿）、干净启动及承接 [reports/feedback.md](reports/feedback.md) 的六项交互与文案修正；判据为全量退出 0 且修正进入回归；全部通过。[reports/review-04.md](reports/review-04.md)

四份评审由 AI 审查与自动化脚本完成，第 2、4 份（另附专项修复与重构记录 [reports/review-fixes.md](reports/review-fixes.md)）保留了发现缺陷、修复并固化回归的完整闭环。

## 4. 高风险三查

- **并发（脚本）**：`npm run test:api`（[apitest/cases/runtime.test.ts](apitest/cases/runtime.test.ts)）并发提交 20 次同一采集并在完成后重投；判据为 20 次均返 202 且复用 1 个任务、新闻 1 条、模型调用不增；实测 20 个 202 共用 1 个任务，重投后新闻仍 1 条、模型调用保持 2 次。[reports/risk-concurrency.md](reports/risk-concurrency.md)
- **事务（脚本）**：`apitest/cases/runtime.test.ts` 注入 outbox 写入失败，判据为返 500 且任务与待投递记录均未生效；[tests/runtime/tasks.test.ts](tests/runtime/tasks.test.ts) 注入结果提交异常，判据为回滚并保留旧内容；两类故障及注册、手记、提醒回滚均通过。[reports/risk-transaction.md](reports/risk-transaction.md)
- **权限（脚本）**：`npm run test:api` 与账号集成用例以匿名、双账号 A/B 与管理员查私人入口、私人对象、管理接口、MCP 与会话撤销；判据为匿名 401、跨账号与不存在均 404、越权管理 403 且数据不变；实测全通过。[reports/risk-authz.md](reports/risk-authz.md)

复跑入口（纯 Docker 零本地环境或隔离开发环境，环境要求见 [docs/verification/checks.md](docs/verification/checks.md)）：

```sh
sh scripts/acceptance.sh
npm run test:api
```

## 5. 门禁与演示

- **CI 与主干保护**：`main` 强制通过 `Repository checks`、`Security checks`、`Application checks` 后方可合入并构建镜像（[.github/workflows/pr-checks.yml](.github/workflows/pr-checks.yml)）；主干 `c3111c2` 的[构建 #19](https://github.com/kmsgk0/newsclaw/actions/runs/45424494014) 四个作业全绿。[reports/pipeline.md](reports/pipeline.md)
- **先红后绿证据**：[PR #12](https://github.com/kmsgk0/newsclaw/pull/12) 将 [apitest/cases/csrf.test.ts](apitest/cases/csrf.test.ts) 第 32 行 `403` 改为 `200`（`11b8d1c`），运行 [45420727899](https://github.com/kmsgk0/newsclaw/actions/runs/45420727899) 红灯阻断（`Security` 与 `Application` 失败、镜像跳过、`BLOCKED`）；`f7ff42e` 恢复后运行 [45421376670](https://github.com/kmsgk0/newsclaw/actions/runs/45421376670) 全绿解阻。[reports/gate-red-green.md](reports/gate-red-green.md)
- **验证命令与结果**：`make check` 15 阶段 286 条全绿（服务端覆盖率行 93.96%、分支 86.33%、函数 86.38%，退出 0）；`make check-security` 密钥 0 命中、高危依赖 0 条、注入/CSRF/XSS 反例全绿（退出 0）；Docker 复跑用 `sh scripts/acceptance.sh`。
- **在线与启动闭环**：公网运行于 `https://newsclaw.xwysyy.com`（`c3111c2`）；干净启动与手机四步闭环（登录、提交 202、轮询成功、跨账号 404 及审计回查）用 `node scripts/verification/runtime.mjs verify` 复现，见 [reports/boot-reproduce.md](reports/boot-reproduce.md)。

## 6. 复盘

代价最大的一次返工是关键词检索由全表扫描改为 trigram GIN 索引。初期 `GET /api/v1/news?q=...&semantic=false` 模糊匹配正文、摘要与译文却缺少文本索引，导致 PostgreSQL 执行 `Seq Scan`；在 5,000 篇新闻、20 VU、60 秒 k6 压测中（基线 `754c2ca`），吞吐仅 2.0 请求/秒、P95 达 13,003.46 毫秒、错误率 2.31%。返工通过 [migrations/018_news_text_search_indexes.sql](migrations/018_news_text_search_indexes.sql) 为三列建 trigram GIN 索引（`718f794`），并在日常性能门禁中加入执行计划断言，禁止固定检索用例（`q=benchmark`）退回 `Seq Scan`。同脚本同参数复测后，吞吐升至 130.9 请求/秒、P95 降至 217.87 毫秒、错误率降至 0%。此次返工投入了迁移、5,000 篇夹具与 24 组对比压测，且夹具生成与插入中位数耗时由 0.95 秒增至 2.39 秒，但门禁已能在合入前自动拦截同类退化。详情见 [reports/bench.md](reports/bench.md)。
