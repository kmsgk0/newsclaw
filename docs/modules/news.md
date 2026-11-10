# 新闻库与信源

新闻库保存报道的原始标题、来源、发布时间、链接和实际取得的材料。资讯、搜索、编辑、专题和日报使用同一报道标识；公共内容可以匿名阅读，收藏和阅读记录按账号保存。

## 来源与正文

管理员通过管理接口维护来源，支持 RSS、Atom、JSON 和网页列表。初始化提供官方机构、科技媒体和个人博客的来源配置，默认启用 OpenAI News、Hugging Face Blog、Simon Willison、Solidot 和 IT之家；其他配置可按需要启用。重复初始化保留管理员已有的来源设置。

| 来源类型 | 配置示例 |
| --- | --- |
| RSS 或 Atom | `{ "maxItems": 5, "fetchArticle": true }` |
| JSON | `{ "itemsPath": "items", "contentFormat": "markdown", "fields": { "title": "title", "url": "url", "publishedAt": "publishedAt", "content": "content", "summary": "summary" } }` |
| 网页列表 | `{ "itemSelector": "article", "titleSelector": "h2", "linkSelector": "a", "dateSelector": "time", "contentSelector": "p", "fetchArticle": true }` |

`maxItems` 控制每批最近报道数量，默认 10，范围为 1 至 100。JSON 字段映射支持点分隔对象路径，网页选择器使用 CSS 语法。以下配置适用于各类来源：

| 字段 | 含义 |
| --- | --- |
| `contentFormat` | `html`、`markdown`、`text` 或自动判断的 `auto`；Markdown 原有结构直接保留 |
| `contentScope` | 来源材料为 `full` 或 `summary`；摘要不作为完整正文 |
| `fetchArticle` | 来源给出摘要时尝试读取链接指向的公开正文 |
| `articleSelector` | 原文页面的正文区域，留空时从语义化文章容器选择主体 |
| `domain` | 使用统一领域中的指定分类，适用于主题明确的来源 |

HTML 转为 Markdown，保留标题、段落、列表、引用、表格、代码、图片和链接。HTML 与原生 Markdown 中的相对链接、图片及引用定义均按原文地址解析，代码示例保持原样。导航、按钮、脚本及无关页面操作不进入正文。标题单独保存，正文不能取得时保留来源摘要或标题，并显示实际材料范围；模型不补写原文。

来源地址及每次重定向均检查 HTTP(S) 协议与公开网络目标。无效 XML、JSON 路径或 CSS 选择器明确报错。本地测试服务需要显式列入 `SOURCE_ALLOWED_HOSTS`。

## 整理与处理状态

系统根据来源文本判断是否需要中文翻译，领域统一为人工智能、软件开发、硬件与芯片、机器人、网络安全、科学研究、互联网产品、科技与社会和科技综合。语言与来源领域提示在模型分析前保存，模型暂不可用时仍可按这些信息筛选。搜索与专题使用相同分类。

摘要直接说明来源报道的事实，保留日期、数字、名称和条件。英文长文按 Markdown 段落分组翻译，每个返回段落必须对应输入标识，组装后覆盖全部材料；代码保持原样。译文缺段或明显遗漏正文时标记失败，不将标题翻译当作全文。

单篇报道的关系提取只返回实体名称和明确关系，端点必须对应本次实体列表。服务端将通过校验的关系绑定到当前报道，来源标识由服务端生成；模型不能指定其他报道作为依据。

来源读取、摘要、翻译和索引分别记录状态。内容版本包含标题与正文，标题改变也会重新生成摘要和索引。新版本处理失败时，对应的上一份成功结果继续可读，响应中的处理状态说明正在更新或处理失败。没有变化的材料复用结果，重试补做未完成步骤。单篇失败及非法条目链接会记录具体原因，同批其他报道继续处理。

派生内容、图关系和完成通知写入时再次核对并锁定报道版本。已有更新版本时，旧任务返回被替代的报道标识，不覆盖新结果或重新发布旧图关系。

报道按信源与规范化 URL 唯一。重复采集保留报道 ID、收藏和专题关系；不同来源即使正文相同也各自保留。相同非空正文可复用成功处理结果。正文为空的不同报道不共享摘要。

管理员可重新处理一篇报道，默认重新读取原文；关闭来源刷新时，使用已保存材料重新分析。重处理复用采集任务和权限检查，返回任务地址供查询。

## 事件、检索与个人记录

事件关联结合报道时间、标题、正文摘要和实体。新报道加入后，概况包含近期进展，同时保留各篇来源。管理员按名称查找全部事件并修正归属；手动解除的归属不会在下一次自动采集中恢复。时间线、关系图和热点读取同一关联。

关键词检索覆盖标题、来源正文、摘要及译文，可组合来源、领域和语言筛选。语义检索调用嵌入服务，并在 PostgreSQL 中按向量距离排序。默认每页 20 条，最多 100 条，结果按唯一标识稳定排序。没有匹配结果与依赖失败分别返回。

收藏和阅读记录只属于当前账号。重复收藏不创建副本，再次阅读更新该报道的最近阅读时间。取消收藏保留共享新闻，后续专题功能复用同一报道标识。

## 全站日报

日报采用 Asia/Shanghai 业务日期，显示覆盖日期、生成时间及报道引用。后台等待采集任务结束，根据当天材料版本安排生成；内容更新后可以补生成，同一日期保留一份成功日报。较旧任务不能覆盖更新的结果，生成失败保留上一份成功内容。

日报接口提供 `items`、`availableDates`、`latestDate`、`date`、`latestTask` 和 `status`。状态为 `ready`、`pending`、`running`、`failed`、`empty` 或 `idle`，分别表示可读、等待、生成中、失败、无材料和尚未生成。已有内容与正在更新的任务可以同时呈现，任务错误保留在 `latestTask.error` 中。

## 接口

接口使用统一响应结构。请求字段、响应和错误定义见运行中的 `/docs/api`。

| 方法与路径 | 用途与权限 |
| --- | --- |
| `GET /api/v1/sources` | 启用来源、最近采集状态和统一领域，公开 |
| `GET /api/v1/news` | 资讯与检索，公开；支持 `q`、`domain`、`sourceId`、`language`、`semantic`、`page`、`pageSize` |
| `GET /api/v1/news/:id` | 原文、摘要、译文、处理状态及本人收藏状态 |
| `GET /api/v1/events` | 按 `q` 搜索全部事件，支持分页，公开 |
| `GET /api/v1/events/:id` | 事件概况、多源报道、时间线和关系图，公开 |
| `POST /api/v1/news/:id/favorite`、`DELETE` 同路径 | 添加或取消本人收藏 |
| `POST /api/v1/news/:id/read` | 更新本人最近阅读时间 |
| `GET /api/v1/library` | 本人收藏或历史，`kind=favorites` 或 `history` |
| `GET /api/v1/digests` | 日报内容、日期索引及生成状态，可传 `date` |
| `GET/POST /api/v1/admin/sources` | 管理员查看或建立来源 |
| `PATCH /api/v1/admin/sources/:id` | 管理员更新配置或启停来源 |
| `POST /api/v1/admin/sources/:id/collect` | 提交 `operationId` 触发采集，返回 `202` 和任务地址 |
| `GET /api/v1/admin/news` | 管理员检索全部收录报道，包含未被选入公共资讯的内容 |
| `POST /api/v1/admin/news/:id/reprocess` | 提交 `operationId` 和可选 `refreshSource`，返回 `202` 和任务地址 |
| `PATCH /api/v1/admin/news/:id/event` | 管理员指定 `eventId`，传 `null` 解除归属 |
| `POST /api/v1/admin/digests` | 管理员提交 `date` 与 `operationId` 生成日报 |

## 检查

[来源解析](../../tests/news/news-sources.test.ts)检查结构化 HTML、Atom 和 Markdown；[内容质量](../../tests/news/news-quality.test.ts)检查语言、分类、完整翻译、更新失败与批次处理；[管理与日期](../../tests/news/news-management.test.ts)检查权限、事件、重处理及业务日期。[新闻集成测试](../../tests/news/news.integration.test.ts)覆盖去重、检索、收藏及日报，[原文失败测试](../../tests/news/news-recollection.test.ts)检查已有内容保留。真实新闻与模型效果按 [AI 样例](../verification/ai-cases.md)另行检查。
