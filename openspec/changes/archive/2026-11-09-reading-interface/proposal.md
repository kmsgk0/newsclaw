# Proposal

## Why

为已经提供 API 的新闻、编辑、技能和专题能力建立完整阅读界面，使内容、操作及生成结果在桌面与手机上保持清楚、连贯且可访问。

## What Changes

- 实现资讯、详情、事件、热点、收藏、编辑、技能、专题、消息、设置及管理页面。
- 接入登录恢复、返回原目标、个人状态刷新、搜索筛选及阅读位置恢复。
- 提供安全 Markdown、流式阅读、表单反馈、导图与图谱操作、成果预览和分享页面。
- 组织页面、共享组件及样式，将浏览器检查接入统一入口。
- 完成代表性屏幕、键盘、完整阅读流程及实际来源和模型检查，保留对应结果和页面材料。

## Capabilities

### New Capabilities

- `reading-interface`: 页面、导航、Markdown、工作区、表单与响应式行为。

### Modified Capabilities

- `account-access`: 浏览器令牌保存、登录衔接、表单提示和缺失页面反馈。
- `news-library`: 列表和详情阅读、返回上下文、个人状态及日报页面。
- `personal-editor`: 材料选择、会话切换、流式阅读、设置和生成内容页面。
- `editor-skills`: 示例预览、使用入口、技能状态和发布预览。
- `topics-and-insights`: 专题材料操作、成果保存、导航未读数、可视化及分享页面。
- `runtime-operations`: 实际来源、模型效果和完整阅读过程检查。
- `contribution-workflow`: 统一完整检查入口纳入浏览器行为。
- `engineering-standards`: 页面、共享组件、样式和浏览器用例的组织。

## Impact

增加 React Router 前端、共享组件、样式、静态资源和浏览器测试，接通已有 API 及 SSE。运行、使用及模块文档提供页面入口，截图和行为检查共同核对实际呈现。
