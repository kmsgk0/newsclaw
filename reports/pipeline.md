# 主干构建与合并检查

`main` 的[构建 #14](https://github.com/kmsgk0/newsclaw/actions/runs/44561465359)由推送 `ec24c604f780f1713151b6e3e5bfd059af2bd25d` 触发。四个作业均成功。

| 作业 | 结果 |
| --- | --- |
| [Application checks](https://github.com/kmsgk0/newsclaw/actions/runs/44561465359/job/135691597285) | 122 项业务与集成测试、11 项 API 测试、69 项浏览器测试、2 项模型用量检查通过。 |
| [Repository checks](https://github.com/kmsgk0/newsclaw/actions/runs/44561465359/job/135691597295) | 规约、仓库文件、提交及检查工具通过。 |
| [Security checks](https://github.com/kmsgk0/newsclaw/actions/runs/44561465359/job/135691596569) | `make check-security` 通过。 |
| [Production image](https://github.com/kmsgk0/newsclaw/actions/runs/44561465359/job/135694336033) | 前三项通过后构建镜像，标签为 `newsclaw:ec24c604f780f1713151b6e3e5bfd059af2bd25d`。 |

2026-11-22 核对 GitHub 分支保护配置：合入 `main` 须通过表中前三项检查，PR 分支须与主干同步，规则对管理员同样生效。[工作流定义](../.github/workflows/pr-checks.yml) · [本地门禁演练](gate-red-green.md)
