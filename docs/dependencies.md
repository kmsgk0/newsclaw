# 依赖与用途

运行依赖由锁文件固定。安装、版本与审计以[依赖锁文件](../package-lock.json)为准，服务端凭据不进入前端构建。

| 依赖 | 用途 | 许可 |
| --- | --- | --- |
| `@fastify/cookie` | 刷新 Cookie | MIT |
| `@fastify/static` | 发布前端文件 | MIT |
| `@fastify/swagger` | OpenAPI 生成 | MIT |
| `@fastify/swagger-ui` | 接口文档页面 | MIT |
| `@modelcontextprotocol/sdk` | MCP 客户端与服务端 | MIT |
| `@xyflow/react` | 关系图交互 | MIT |
| `bullmq` | 后台任务与调度 | MIT |
| `cheerio` | 公开网页正文解析 | MIT |
| `dotenv` | 本地环境配置 | BSD-2-Clause |
| `fast-xml-parser` | RSS 与 Atom 解析 | MIT |
| `fastify` | HTTP API 与路由 | MIT |
| `ioredis` | BullMQ Redis 后端所需运行依赖 | MIT |
| `lucide-react` | 界面图标 | ISC |
| `mdast-util-from-markdown` | 解析 Markdown 结构与来源相对链接 | MIT |
| `pg` | PostgreSQL 访问 | MIT |
| `pino` | 结构化运行日志 | MIT |
| `react` | 页面组件 | MIT |
| `react-dom` | 浏览器渲染 | MIT |
| `react-markdown` | 受限 Markdown 渲染 | MIT |
| `react-router` | 页面路由 | MIT |
| `remark-gfm` | Markdown 表格与列表 | MIT |
| `turndown` | 保留段落与标题的 HTML 转 Markdown | MIT |
| `turndown-plugin-gfm` | 转换表格、删除线和任务列表 | MIT |
| `undici` | 模型与信源 HTTP、现有代理支持 | MIT |
| `zod` | 业务与模型结构校验 | MIT |

开发依赖提供 TypeScript、Vite、Tailwind 构建、ESLint、Playwright、Node 类型和仓库检查。PostgreSQL/pgvector 与 Redis 通过 Compose 运行；备份使用 PostgreSQL 自带工具。

`npm run check:security` 检查包括开发工具的全部锁定依赖。具体审计范围和发现见[安全基线](../reports/security-baseline.md)。
