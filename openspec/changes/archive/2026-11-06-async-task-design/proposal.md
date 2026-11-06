# 异步任务与消息队列设计

## Why

NewsClaw 的采集整理、日报、编辑手记和更新提醒需要在请求结束后继续执行，并在进程中断或重复投递时保持结果一致。明确任务接收、队列执行、事务边界和验证方法，使这些能力能够按统一合同实施。

## What Changes

- 明确 PostgreSQL、Redis、BullMQ 与独立 Worker 的职责，覆盖四类固定任务，保留交互问答与技能的 SSE 行为。
- 补全任务接收、状态查询、有限重试、死信、重复执行与中断恢复的目标需求和场景。
- 在产品设计中说明事务性发件箱、结果提交与业务唯一性，并明确三条异步验证判据及证据要求。
- 更新实施路线图、产品入口及相关接口和运行约定，保留既有功能与未完成状态。

## Capabilities

### New Capabilities

- `runtime-operations`：在现有产品需求 OPS-01 至 OPS-05 的基础上补全异步运行目标。此次交付为设计文档，业务规格在对应实现完成后同步到主规格。

### Modified Capabilities

无。

## Impact

涉及 `docs/product/design.md`、`docs/product/requirements/runtime-operations.md`、`docs/product/roadmap.md`、产品与仓库 README，以及后端、运维规范中的关联约定。

本变更完成设计、需求场景和实施安排，不安装运行依赖或新增业务代码。文档任务核对完成后归档并跳过业务主规格同步，后续实现及运行验证继续由产品路线图管理。
