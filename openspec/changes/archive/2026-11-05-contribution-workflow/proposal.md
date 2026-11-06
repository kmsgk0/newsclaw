# 仓库开发规范与自动检查

## Why

NewsClaw 的需求、设计、工程规范和开发方法需要通过清楚的文档入口衔接，使开发者能够从仓库文件确定改动依据、实施范围和完成标准。统一这些约定，并提供本地与持续集成共用的检查入口，使业务功能、工具、配置及文档修改具有明确的规约依据和可重复的检查结果。

## What Changes

- 明确 README、项目规则、开发指南、工程规范和 OpenSpec 的职责，完善文档之间的入口。
- 将所有仓库修改纳入 OpenSpec，在实施前准备对应的目标、设计、需求场景及任务。
- 依据需求和实际改动选择检查方法，同步文档、任务进度与验证结果。
- 提交说明关联规约；实现及规定验证完成后同步主规格并归档。
- 在 OpenSpec 配置和项目测试、发布技能中衔接上述要求。
- 提供 OpenSpec、文档、提交引用、密钥和依赖的自动检查，以及面向 `main` 分支 PR 的 GitHub Actions workflow。

## Capabilities

### New Capabilities

- `contribution-workflow`：仓库文档组织、规约驱动开发约定，以及本地和 PR 共用的自动检查。

### Modified Capabilities

无。

## Impact

涉及 `AGENTS.md`、`README.md`、`CONTRIBUTING.md`、`docs/standards/`、`openspec/config.yaml` 及项目测试、发布技能；新增 `scripts/`、`.github/workflows/pr-checks.yml`、`docs/checks.md` 和检查工具的 npm 配置与锁文件。产品功能、技术选型及基础能力变更的实施状态保持不变。
