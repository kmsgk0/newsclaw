# 接口压测与关键词检索索引

2026-11-24，在 macOS 的 OrbStack Linux arm64 环境中执行两轮串行压测。基线提交为 `754c2ca099f81d78465bd56a19e3aa4c8b10721a`，索引版为 `718f794fa1a5d9752c59366a244440c0139ba23f`。两轮采用 Node.js 24.22.3、PostgreSQL 17.12、Redis 7.4.12 和 k6 0.54.0，每个应用进程沿用默认 `DB_POOL_MAX=12`。

| 容器 | CPU 上限 | 内存上限 |
| --- | ---: | ---: |
| API | 0.75 | 768 MiB |
| PostgreSQL | 0.75 | 512 MiB |
| Redis | 0.25 | 128 MiB |
| k6 | 0.50 | 256 MiB |

## 数据与场景

每档新建数据库和队列，确定性生成 5,000 篇新闻。正文约 250 词，平均 1,685 字符。标题、正文、摘要和译文各有 25 篇包含 `benchmark`，合计 100 篇命中（2%）。插入后执行 `VACUUM (ANALYZE) news`，更新统计并将 GIN 待处理项并入主体索引，再记录计数和分页的执行计划。夹具生成和插入耗时中位数分别为基线 0.95 秒、索引版 2.39 秒。

[k6 脚本](../scripts/performance/benchmark.js)测量提交采集任务（`POST /api/v1/admin/sources/:id/collect`）、查询固定任务（`GET /api/v1/tasks/:id`）和关键词检索（`GET /api/v1/news?q=benchmark&semantic=false&pageSize=20`）。各接口依次使用 1、4、8、20 VU，每档 60 秒，持续发出请求。提交使用不同操作标识，预期返回 202。查询和检索预期返回 200。性能夹具的应用日志级别为 `warn`，请求审计照常写入隔离数据库。三种场景测量接口响应，采集任务执行吞吐由单独的 Worker 实验测量。

## 接口结果

表中 RPS 是每秒完成的 HTTP 请求，P95 单位为毫秒。每档的 k6 汇总、夹具统计和两条完整查询计划均收录于[结构化结果](bench-results.json)。

| 接口 | VU | 基线 RPS / P95 ms / 错误率 | 索引版 RPS / P95 ms / 错误率 |
| --- | ---: | ---: | ---: |
| 提交 | 1 | 907.6 / 1.60 / 0.00% | 1004.5 / 1.37 / 0.00% |
| 提交 | 4 | 2008.1 / 3.22 / 0.00% | 1672.1 / 4.05 / 0.00% |
| 提交 | 8 | 2175.4 / 4.39 / 0.00% | 1786.2 / 7.28 / 0.00% |
| 提交 | 20 | 1956.4 / 55.66 / 0.00% | 1948.0 / 55.43 / 0.00% |
| 任务查询 | 1 | 2464.4 / 0.73 / 0.00% | 2247.3 / 0.79 / 0.00% |
| 任务查询 | 4 | 3282.5 / 1.75 / 0.00% | 3260.2 / 1.30 / 0.00% |
| 任务查询 | 8 | 3192.7 / 3.20 / 0.00% | 3244.2 / 2.94 / 0.00% |
| 任务查询 | 20 | 2784.7 / 51.41 / 0.00% | 3562.1 / 43.68 / 0.00% |
| 新闻检索 | 1 | 6.5 / 188.42 / 0.00% | 330.4 / 5.52 / 0.00% |
| 新闻检索 | 4 | 2.5 / 1902.23 / 0.00% | 312.9 / 69.77 / 0.00% |
| 新闻检索 | 8 | 2.0 / 4699.41 / 0.00% | 152.9 / 100.78 / 0.00% |
| 新闻检索 | 20 | 2.0 / 13003.46 / 2.31% | 130.9 / 217.87 / 0.00% |

- 提交在基线 8 VU 达到最高吞吐，升到 20 VU 后降至约 1,956 RPS。索引版的吞吐从 8 到 20 VU 增加约 9%，P95 从 7.28 增至 55.43 毫秒。两个版本在 20 VU 都约为 1,950 RPS。
- 任务查询在 4 VU 已超过 3,200 RPS，8 VU 与 4 VU 接近。索引版在 20 VU 达到 3,562 RPS，同时 P95 从 8 VU 的 2.94 增至 43.68 毫秒。基线在 20 VU 的吞吐低于 4 VU，P95 升至 51.41 毫秒。
- 新闻检索在两版的 1 VU 档均达到本轮最高吞吐。基线升到 4 VU 后降至 2.5 RPS，20 VU 的 130 个请求中有 3 个返回 500。索引版在 4 VU 仍有 312.9 RPS，8 VU 降至 152.9 RPS。在 20 VU，索引版为 130.9 RPS、P95 217.87 毫秒、零 HTTP 错误。

以上饱和迹象对应本轮容器资源和数据分布。提交与任务查询各自沿用相同的任务处理路径。k6 统计包含压测结束时已发出的请求。

## 查询计划

`NewsRepository.search({ q: 'benchmark', semantic: false, pageSize: 20 })` 发出计数与分页两条查询。[查询夹具](../scripts/performance/fixture.ts)记录两条实际 SQL 和各自的参数，并取得 `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`。下表取正式压测 1 VU 检索档的计划，计划在 k6 发出请求前采集。

| 查询 | 基线耗时（ms） | 索引版耗时（ms） | 基线共享缓冲命中块 | 索引版共享缓冲命中块 |
| --- | ---: | ---: | ---: | ---: |
| 计数 | 81.782 | 1.355 | 16,250 | 378 |
| 分页 | 75.705 | 1.597 | 16,555 | 683 |

基线两条查询都顺序扫描 `news`，逐行计算全文检索或子串匹配条件。[索引迁移](../migrations/018_news_text_search_indexes.sql)为正文、摘要和译文创建 trigram GIN 索引。索引版的两条查询都用 `BitmapOr` 合并五个 `Bitmap Index Scan` 的结果，再访问命中的新闻记录。五路分别对应 `search_document`、标题、正文、摘要和译文。检索 SQL、`ts_rank` 排序与计数逻辑沿用同一实现。越界页实测返回空列表，仍携带命中总数 100。

检索使用首尾通配符。含至少三个连续可索引字符、选择性足够的词可以利用 trigram 索引，中文子串也适用。补充探针在摘要含有“区域能源调研”的 100 条记录上验证了中文子串。“能源调”触发位图索引扫描。“能源”只有两个字符，`%能源%` 无法提取 trigram，本次仍顺序扫描 `news`。

## 单 Worker 吞吐

单个 Worker 依次处理 20 个独立信源的采集任务。提交完成后启动消费者，自启动计时至最后一个采集任务进入终态。模型替身每次请求固定延迟 200 毫秒，共处理 40 次调用。

20 个采集任务全部成功，生成 20 条新闻。墙钟时间 9.35 秒，吞吐 2.14 任务/秒。采集任务排队时间 P95 为 8,399 毫秒，执行时间 P95 为 485 毫秒。计时结束时，派生通知有 7 个已完成、33 个待处理，采集吞吐按 20 个采集任务计算。完整任务明细见[结构化结果](bench-results.json)。

## 日常门禁与重跑

日常门禁对三个接口各运行 4 VU、20 秒。响应状态须全部符合合同，HTTP 错误率为 0，P95 小于 1,000 毫秒，吞吐至少为 4 请求/秒。`q=benchmark` 的计数和分页计划均须用到新增文本索引，且不得对 `news` 执行 `Seq Scan`。环境、命令和结果附件见[检查说明](../docs/verification/checks.md#性能门禁)。

在仓库根目录运行以下命令，以同样的档位和容器限额重跑两轮。

```sh
bench_dir=$(mktemp -d)
git worktree add --detach "$bench_dir/baseline" 754c2ca099f81d78465bd56a19e3aa4c8b10721a
git worktree add --detach "$bench_dir/optimized" 718f794fa1a5d9752c59366a244440c0139ba23f
(
  cd "$bench_dir/baseline"
  docker build -f Dockerfile.acceptance -t newsclaw-acceptance:local .
  PERF_OUTPUT="$bench_dir/results" bash scripts/performance/run.sh baseline
)
(
  cd "$bench_dir/optimized"
  PERF_OUTPUT="$bench_dir/results" bash scripts/performance/run.sh optimized
)
git worktree remove "$bench_dir/baseline"
git worktree remove "$bench_dir/optimized"
```

`PERF_SCENARIOS`、`PERF_VUS_LIST`、`PERF_DURATION` 分别指定接口、并发档位和时长。配备[隔离测试环境](../docs/runtime.md)后，从索引版运行日常门禁和单 Worker 测量。

```sh
VERIFICATION_DIR=.local/verification/gates node scripts/checks/check.mjs --stage performance
VERIFICATION_DIR=.local/verification/worker-throughput node --import tsx scripts/performance/worker.ts
```
