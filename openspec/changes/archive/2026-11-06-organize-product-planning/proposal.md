# 产品规划与增量变更

## Why

NewsClaw 的完整产品目标需要持续可查阅，每轮实施则需要明确的范围与完成条件。将产品需求、总体设计和实施安排集中到产品文档，并按可交付范围维护 OpenSpec 变更，使规划与实际进度能够清楚衔接。

## What Changes

- 在 `docs/product/` 维护产品范围、总体设计、六组目标需求和实施路线图，保留需求编号、场景及验证要求。
- 活动变更只覆盖当前工作的交付范围；产品规划中的任务按实际需要纳入对应变更。
- 完成的变更独立同步规格并归档，产品入口关联已交付合同，剩余目标继续保留。
- 更新项目入口、相关规范及评测材料的引用，产品规划从基础能力活动目录迁出。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `contribution-workflow`：明确产品规划、活动变更和现行规格的职责及其衔接方式。

## Impact

新增 `docs/product/README.md`、`design.md`、`roadmap.md` 及 `requirements/` 下六份能力文档，承接 `2026-10-28-newsclaw-foundation` 中的产品内容。完成内容与链接核对后，将该基础规划变更归档，保留原有材料与任务状态，未实现规格不写入主规格。

同步 README、AGENTS、开发指南、OpenSpec 配置、AI 与数据规范和评测材料的入口。产品功能、技术选择、需求场景和未完成状态保持不变，检查工具与业务代码不在修改范围内。
