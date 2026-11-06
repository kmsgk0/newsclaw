# 仓库安全基线

检查时间：2026-11-06 14:14 至 14:15（UTC+08:00）。检查基线为 `8b66aba1b81c50888da6b0b460fe01759cd7fb64` 及 `2026-11-06-security-review` 工作区内容，检查脚本与该提交一致。环境为 macOS arm64，Node.js `v26.13.0`、npm `11.20.0`、Gitleaks `8.30.1`、OpenSpec `1.14.3`。

执行方式为自动脚本，结果依据实际退出码、扫描输出及 npm 审计 JSON。Gitleaks 按[检查说明](../docs/checks.md#准备与运行)通过 `GITLEAKS_BIN` 指定已安装程序，未输出凭据或机器配置。

## 范围与结果

| 检查 | 实际范围 | 实际结果 |
| --- | --- | --- |
| SEC-05 历史扫描 | 全部本地可达 Git 引用，扫描器报告 9 个提交 | 0 命中 |
| SEC-05 当前文件 | 已跟踪及未被忽略的工作区文件 | 0 命中 |
| SEC-06 依赖审计 | 当前锁文件中的工具依赖，包含开发依赖；审计总数 65 | 信息、低危、中危、高危、严重均为 0 |

`npm run check:security` 与 `npm audit --json` 均以退出码 `0` 完成。应用依赖、前端构建产物、容器镜像和业务运行日志尚未形成，后续形成后按相同方法补查。业务权限、异步运行和技能调用追溯按[安全检查方案](../docs/security-checks.md)执行。

## 命令与证据

```sh
npm run check:security
npm audit --json
```

- [密钥扫描与依赖检查输出](2026-11-06-security-review/secret-scan.txt)：保留命令、退出码、历史扫描数量和当前文件扫描结果。
- [依赖审计 JSON](2026-11-06-security-review/dependency-audit.json)：保留 npm 返回的漏洞分类和依赖计数。
- [完整仓库检查输出](2026-11-06-security-review/repository-checks.txt)：包含同一安全检查及 25 项工具测试。

公开输出去除了终端颜色，本机路径和 SSH 连接别名替换为占位标记；命令、退出码、数量和错误原因保留。原始输出仅本地保存。
