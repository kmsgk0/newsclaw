# 应用问题修复评审

检查日期：2026-11-10。检查方式为两项独立 AI 代码审查、隔离环境脚本执行和真实模型材料对照。范围与[修复记录](security-fix-log.md)一致，依据 OPS-04、OPS-06、EDITOR-04 及[修复规约](../openspec/changes/archive/2026-11-10-application-corrections/proposal.md)。

| 对象 | 检查手段与内容 | 判据 | 结果 |
| --- | --- | --- | --- |
| 模型适配器、编辑服务 | 阅读完整响应及失败出口，重放本地 HTTP 替身到日志与数据库的路径 | 正常和失败调用都保存实际用量，缺失字段保持 null，失败状态和安全错误不变 | 可用。JSON、结构、封装及材料校验失败均保存已返回用量，未保存无效成果或暴露上游正文 |
| OpenAPI 转换、接口及页面用例 | 通过完整应用发 HTTP 请求；核对已有实际浏览器运行日志和截图 | JSON、HTML 与资源可访问，公开及 Bearer 声明、参数与响应定义保留 | 可用。接口与资源返回 200，页面显示实际业务接口；匿名拒绝和登录访问结果不变 |
| 个人日报生成与保存 | 阅读结构化关联校验，执行原文匹配与失败后数据库对照 | 关联来自实际偏好及已引用原文，无效结果不覆盖已有日报 | 可用。虚构引文、无效偏好或来源被拒绝，原日报保持不变 |
| 个人日报实际内容 | 完整阅读原始材料、修复前输出及四份最终输出 | 保留事实和条件，不补造技术计划、确定影响或性能收益，保留明确公告与无兴趣行为 | 可用。本次原始问题样例及三个代表性样例符合判据；内容判断与自动结构检查分别记录 |

独立执行的后端和接口回归共 17 项通过，既有 SEC-07 对照 2 项通过，日报关联与来源保存 3 项通过。评审读取了修复前失败记录，确认新增断言能够识别原始故障；检查前后核对文件哈希，受审实现保持一致。

```sh
node --import tsx --test --test-concurrency=1 tests/runtime/model.test.ts tests/editor/usage-recording.test.ts apitest/cases/openapi.test.ts
node --import tsx --test tests/evaluation/usage-recording.ts
node --import tsx --test tests/editor/digest-grounding.test.ts tests/news/digest-sources.test.ts
```

所有脚本使用独立数据库、队列及现有测试替身。真实模型内容审查读取已保存的原始输入与实际输出，未把程序中的结构通过标记当作内容结论。结果和方法见[修复记录](security-fix-log.md)与[AI 评测](../docs/verification/ai-results.md)。
