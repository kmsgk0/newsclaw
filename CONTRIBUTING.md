# 开发指南

开发前阅读 [AGENTS.md](AGENTS.md)、相关 OpenSpec 变更和适用的工程规范。需求与任务定义本次工作，工程规范说明实现方式及检查要求。

## 准备规约

所有仓库修改均纳入 OpenSpec，包括代码、工具、配置和文档。先查看[文档导航](docs/README.md)、[现行规格](openspec/specs/)和活动变更，确认本次改动的依据；已有活动变更覆盖时沿用，需要新增或改变内容时先补齐规约，再开始实施。

文档导航提供当前使用、架构和模块说明；能力规格维护业务约定，活动变更保存未交付目标及实施安排。每轮选取明确的交付范围，沿用相关需求编号，任务覆盖实现、测试和必要文档。文档或设计工作只跟踪相应材料及核对任务，业务实现与运行验证进入对应的实施变更。

| 文件 | 内容 |
| --- | --- |
| `proposal.md` | 改动目的、范围及影响 |
| `design.md` | 实现方案、关键取舍及与已有设计的关系 |
| `specs/<能力>/spec.md` | 需求与场景，包括前置条件、操作和可观测结果 |
| `tasks.md` | 按依赖顺序排列的实现任务及各自的验证方法 |

规约面向项目内容，写到开发者能够据此实施和验证的程度。文档修正写清内容和核对方法；工具或功能变更还需说明输入、结果及适用的失败条件。任务包含实施与验证工作，完成对应检查后再勾选。

模型相关工作读取 [AI 应用规范](docs/standards/ai.md)，数据相关工作读取[数据规范](docs/standards/data.md)；其他领域入口见 [AGENTS.md](AGENTS.md#工程规范入口)。

使用 OpenSpec 1.14.3；未全局安装时，下列 `openspec` 命令可用 `npx --yes --package @fission-ai/openspec@1.14.3 openspec` 执行。

```sh
openspec list --specs
openspec list
openspec new change YYYY-MM-DD-change-name
openspec status --change YYYY-MM-DD-change-name
openspec instructions proposal --change YYYY-MM-DD-change-name
```

将示例名称替换为实际日期和英文短名，沿用已有变更时跳过创建。按 `status` 的依赖顺序查看 `instructions`，将 `proposal` 换为对应的 `specs`、`design`、`tasks`，完成四类文件并核对一致性。

## 实施与验证

阅读相关 Requirement、Scenario、设计和任务，按依赖顺序推进实现，同时完成该任务所需的测试与文档。需求不清，或产品行为、共享接口、关键方案发生重要变化时，先明确变更并更新规约。

```sh
openspec instructions apply --change YYYY-MM-DD-change-name
```

检查时先从需求核对产物，再从实际 diff 核对改动依据。文档检查事实、链接和条款一致性；工具验证自身的输入、结果与失败行为；应用代码按适用规范检查接口、业务逻辑、数据访问、公共逻辑、错误处理、安全隐私和性能。权限、并发、事务及数据一致性通过对应场景验证。

按[测试规范](docs/standards/testing.md)运行相关检查，说明检查对象、方法、预期和实际结果；任务要求保存的报告按指定位置维护。失败时定位并修正，必要检查无法执行时说明原因并保留相关任务未完成。应用、数据库、队列及测试命令见 [README](README.md)和[运行说明](docs/runtime.md)。

交付前可按[评审检查表](docs/standards/review.md#检查表)核对适用内容，模型相关行为参考 [AI 评测样例](docs/verification/ai-cases.md)。

```sh
openspec validate --all --strict --no-interactive
```

完成修改后运行 `npm run check -- --base main`。该入口包含规格、文档、提交引用及安全检查；所需工具、各单项命令和结果说明见[仓库检查](docs/verification/checks.md)。

## 提交与归档

提交使用 Conventional Commits，说明改动及对应 OpenSpec 变更，并注明相关需求或任务。例如：

```text
docs: document specification-driven development

OpenSpec: YYYY-MM-DD-change-name
Requirements: FLOW-01, FLOW-03
```

提交内容按实际工作组织，说明与 diff 保持一致。当前变更的实现及规定验证全部完成后，同步本次交付范围的主规格并归档；代码、相关文档和规约整理结果共同构成完整交付。继续实施的变更仍有剩余任务时，保留活动状态及真实进度。

```sh
openspec archive YYYY-MM-DD-change-name
openspec validate --all --strict --no-interactive
```

规划内容已由后续变更完整承接时，可使用 `openspec archive YYYY-MM-DD-change-name --skip-specs` 归档原规划变更，保留原始材料与任务状态，修正相对链接。未实现目标在对应变更中保持计划状态。

归档后核对 `openspec/specs/` 中的现行规格、归档材料及相关文档链接，确认主规格与已实现并验证的内容一致。已交付需求由现行规格维护，文档导航提供能力与阶段入口，完成状态在对应变更中维护；其他已确认目标保持计划状态。
