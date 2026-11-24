# 主干构建与合并检查

`main` 的[构建 #19](https://github.com/kmsgk0/newsclaw/actions/runs/45424494014)由推送 `c3111c2fd58d3ba924412f07098a3e0feddd57ee`（[PR #12](https://github.com/kmsgk0/newsclaw/pull/12)）触发。四个作业均成功。

| 作业 | 结果 |
| --- | --- |
| [Application checks](https://github.com/kmsgk0/newsclaw/actions/runs/45424494014/job/138552632181) | 单元覆盖率、API、浏览器、模型用量与日常性能门禁全部通过。 |
| [Repository checks](https://github.com/kmsgk0/newsclaw/actions/runs/45424494014/job/138552632658) | 规约、仓库文件、提交引用及检查工具测试通过。 |
| [Security checks](https://github.com/kmsgk0/newsclaw/actions/runs/45424494014/job/138552632666) | `make check-security` 通过。 |
| [Production image](https://github.com/kmsgk0/newsclaw/actions/runs/45424494014/job/138557170616) | 前三项通过后构建生产镜像，标签为 `newsclaw:c3111c2fd58d3ba924412f07098a3e0feddd57ee`。 |

2026-11-24 核对 GitHub 分支保护配置：合入 `main` 须通过表中前三项检查，PR 分支须与主干同步，规则对管理员同样生效。线上公网环境运行 `c3111c2fd58d3ba924412f07098a3e0feddd57ee`，访问入口为 `https://newsclaw.xwysyy.com`。[工作流定义](../.github/workflows/pr-checks.yml) · [门禁红绿对照](gate-red-green.md)
