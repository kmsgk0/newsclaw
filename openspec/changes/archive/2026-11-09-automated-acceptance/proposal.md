# Proposal

## Why

现有检查依赖宿主机工具和手动准备服务，运行结果分散在终端、接口输出和浏览器报告中。开发者需要一条基于 Docker 的验收入口，复用同一套检查并保存可阅读、可定位的执行结果。

## What Changes

- 将 npm、Make 和 CI 的检查编排统一到一个阶段清单，保留单项入口，删除重复的执行清单。
- 使用验收镜像提供 Node、Git、Gitleaks 和 Chromium，自动准备隔离 PostgreSQL、Redis 与测试配置。
- 从现有测试结果生成 NewsClaw HTML 汇总及 JSON，展示阶段、业务用例、需求编号、异步数据及浏览器材料。
- 默认执行 SEC-07 的成功与结构失败用量检查，失败结果进入阶段结论、用例明细及本轮附件。
- 执行失败或中断仍保存结果，未执行阶段明确标记；清理本次环境，保留本地报告。
- 更新检查说明与文档入口，生成材料统一放入 Git 忽略的运行目录。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `contribution-workflow`：统一阶段编排与容器验收生命周期。
- `engineering-standards`：自动报告的数据来源、展示和本地材料归属。

## Impact

影响 `scripts/checks/`、验收 Compose 与镜像、npm/Make/CI、测试输出配置及相关文档。复用现有应用用例和模型替身；应用业务合同、真实模型评测及已登记问题保持各自状态。
