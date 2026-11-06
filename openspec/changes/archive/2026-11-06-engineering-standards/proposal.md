# NewsClaw 工程规范与验证约定

## Why

NewsClaw 的模型调用、私人数据和变更检查需要共同的开发约定，使开发者能找到适用规则，并判断相关功能是否符合需求。

## What Changes

- 增加 AI 应用规范，说明服务与权限边界、提示词追溯、来源校验和失败处理。
- 提供 12 条简明 AI 评测样例，写清场景、输入及预期结果。
- 增加数据规范，说明公共与私人数据、迁移及删除关联数据的基本要求。
- 增加评审与完成定义，提供简短检查表，复用已有检查入口。
- 衔接文档索引、现有规范、OpenSpec 配置和项目测试技能。

## Capabilities

### New Capabilities

- `engineering-standards`：AI、数据及评审的项目约定，以及相应文档和评测入口。

### Modified Capabilities

无。产品功能与现有开发流程保持不变。

## Impact

新增 `docs/standards/ai.md`、`docs/standards/data.md`、`docs/standards/review.md` 和 `docs/evaluation/ai-cases.md`，同步相关文档、工作流入口及基础能力任务中的评测引用。交付范围为规约和文档，应用实现及运行验证仍由基础能力任务推进。
