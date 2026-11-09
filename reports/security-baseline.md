# 安全基线

检查时间：2026-11-09 23:49:29 至 23:49:40（Asia/Shanghai）。应用基线为 `19e0b801f54fcd95a9d2846cb927321ac78e99ac`，扫描同时包含本次检查报告的工作区文件。环境为 macOS arm64，Gitleaks 8.30.1，Node.js 26.13.0，npm 11.20.0。

## 密钥扫描

```sh
node scripts/checks/check-security.mjs dist <api-log> <worker-log>
```

`<api-log>`、`<worker-log>` 分别为该应用版本在隔离数据库与队列下启动、访问并正常关闭时保存的日志。扫描范围为全部可达 Git 历史、当前已跟踪及未忽略文件、前端与服务端构建产物、API 日志及 Worker 日志。五类对象均完成扫描，命中数为零，命令退出码为 0。

扫描器实际输出节选：

```text
11:49PM INF 22 commits scanned.
11:49PM INF no leaks found
11:49PM INF no leaks found
11:49PM INF no leaks found
11:49PM INF no leaks found
11:49PM INF no leaks found
Secret scan passed for reachable Git history and tracked/unignored current files.
```

## 依赖审计

```sh
npm audit --json
npm audit --omit=dev --json
```

| 范围 | 信息 | 低危 | 中危 | 高危 | 严重 | 退出码 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 完整锁文件 | 0 | 0 | 9 | 0 | 0 | 1 |
| 运行依赖 | 0 | 0 | 0 | 0 | 0 | 0 |

中危提示来自 ESLint、TypeScript ESLint 使用的 `minimatch` 依赖链，对应 [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249)。当前检查以高危和严重问题作为失败门槛。审计工具建议的修复会改变 ESLint 主版本，依赖更新需同时核对工具兼容性；中危项保留为待处理项。

上述 API 核对的存活、健康、注册、登录及本人编辑接口依次返回 200、200、201、200 和 200。Worker 日志包含启动记录，关闭后进程正常退出。运行未调用真实模型。

业务权限与调用追溯结果见[首次安全检查](security-precheck.md)。完整扫描、审计和运行日志保存在 Git 忽略的本地验证目录，正文保留版本、范围与关键结果。
