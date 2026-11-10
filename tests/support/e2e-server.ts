import { createAPIEnvironment } from '../../apitest/fixtures/environment.js';
import { startWorker } from '../../src/server/worker.js';
import { TopicsRepository } from '../../src/server/modules/topics/repository.js';

const env = await createAPIEnvironment({ port: 3101 });
const markdown = `## 开放试用与测试范围

云杉引擎于 2026 年 10 月 10 日开放试用。官方使用 1000 条请求测试，平均响应时间为 120 毫秒。**商业价格尚未公布。**

### 已知条件

- 官方测试包含 1000 条请求。
  - 平均响应时间为 120 毫秒。
  - 原始测试材料没有给出硬件型号。
- 独立报道使用另一组 500 条请求。

#### 阅读时需要保留的条件

两份测试的样本与硬件披露范围不同。

> 来源说明：测试结果只对应报道提供的条件。

| 材料 | 请求数量 | 平均响应时间 | 硬件信息 |
| --- | --- | --- | --- |
| 官方报道 | 1000 | 120 毫秒 | 未披露 |
| 独立报道 | 500 | 150 毫秒 | 未披露 |

\`\`\`typescript
const response = await fetch("https://example.org/news/reading-material-with-a-long-path-and-several-parameters?scope=source&language=zh");
console.log(await response.text());
\`\`\`

- [x] 查看来源
- [ ] 跟进商业价格

[来源说明](https://example.org/news/n1)

![NewsClaw 示例标志](/favicon.svg)
`;
await env.ctx.db.query(
  "UPDATE news SET content=$2,published_at=now()+interval '1 second' WHERE id=$1",
  [env.state.toolNewsId, markdown],
);
const graphEvent = await env.ctx.db.one<{ id: string }>(
  'INSERT INTO events(title,summary) VALUES($1,$2) RETURNING id',
  ['多组关系图布局样本', '仅用于图谱阅读与布局的独立测试材料。'],
);
const graphNews = await env.ctx.db.one<{ id: string }>(
  `INSERT INTO news(source_id,url,title,published_at,content,content_scope,content_hash,summary,language,domain,event_id,event_assignment)
   VALUES($1,$2,$3,now()-interval '30 days',$4,'full','fixture-graph','包含多个相互独立的对象组及孤立对象。','zh','科技综合',$5,'manual') RETURNING id`,
  [
    env.source.id,
    'https://example.org/news/graph-layout',
    '多组关系图：对象分组与来源阅读',
    '图谱包含多个互不相连的对象组，以及没有关系边的独立对象，用于检查布局和来源列表。',
    graphEvent!.id,
  ],
);
const groups = [
  [
    '云杉实验室',
    '云杉引擎',
    '测试平台',
    '请求样本',
    '开发工具',
    '研究团队',
    '评估系统',
    '公开数据',
  ],
  ['测评团队', '训练工具', '发布记录', '评估报告', '模型接口', '运行环境'],
  ['语音团队', '语音模型', '设备平台', '演示系统'],
];
const isolated = [
  '公开许可',
  '开发文档',
  '性能条件',
  '社区反馈',
  '安全说明',
  '使用指南',
  '资源目录',
  '原始材料',
];
const names = [...groups.flat(), ...isolated];
await new TopicsRepository(env.ctx.db).saveGraph(graphNews!.id, {
  entities: names.map((name) => ({ name, type: 'product' as const })),
  relations: groups.flatMap((group) =>
    group
      .slice(1)
      .map((name) => ({
        source: group[0],
        target: name,
        label: '相关材料涉及',
        sourceIds: [graphNews!.id],
      })),
  ),
});
await new TopicsRepository(env.ctx.db).updateHeat();
const runtime = await startWorker(env.ctx, {
  scheduling: false,
  intervalMs: 50,
});
console.log('Isolated browser test application ready on localhost:3101');
let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  await runtime.close();
  await env.cleanup();
};
process.on('SIGTERM', () => void stop());
process.on('SIGINT', () => void stop());
