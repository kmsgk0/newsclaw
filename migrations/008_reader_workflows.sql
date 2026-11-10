ALTER TABLE messages ADD COLUMN question_id uuid REFERENCES messages(id) ON DELETE SET NULL;
ALTER TABLE messages ADD COLUMN request jsonb;
ALTER TABLE messages ADD COLUMN skill_name text;
UPDATE messages m SET question_id=(SELECT q.id FROM messages q WHERE q.conversation_id=m.conversation_id AND q.role='user' AND q.created_at<=m.created_at ORDER BY q.created_at DESC,q.id LIMIT 1) WHERE m.role='assistant';
UPDATE messages m SET request=jsonb_strip_nulls(jsonb_build_object('content',q.content,'skillId',m.skill_id,'context',c.context)) FROM messages q,conversations c WHERE q.id=m.question_id AND c.id=m.conversation_id;
UPDATE messages m SET skill_name=s.name FROM user_skills s WHERE m.skill_id=s.id;

ALTER TABLE topic_notes ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
CREATE TABLE topic_news_exclusions (
  topic_id uuid NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  news_id uuid NOT NULL REFERENCES news(id) ON DELETE CASCADE,
  excluded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(topic_id,news_id)
);
ALTER TABLE notifications ADD COLUMN reasons jsonb NOT NULL DEFAULT '[]';

UPDATE topics SET filter=jsonb_set(filter,'{domain}',to_jsonb(CASE
  WHEN filter->>'domain' ~* 'robot|机器人' THEN '机器人'
  WHEN filter->>'domain' ~* 'security|cyber|安全' THEN '网络安全'
  WHEN filter->>'domain' ~* 'hardware|chip|semiconductor|芯片|硬件|半导体' THEN '硬件与芯片'
  WHEN filter->>'domain' ~* 'artificial.intelligence|machine.learning|speech|text.to.speech|人工智能|机器学习|语音|大模型' THEN '人工智能'
  WHEN filter->>'domain' ~* 'software|development|programming|开发|编程|软件' THEN '软件开发'
  WHEN filter->>'domain' ~* 'science|research|科学|科研|研究' THEN '科学研究'
  WHEN filter->>'domain' ~* 'society|education|policy|社会|教育|政策|法律' THEN '科技与社会'
  WHEN filter->>'domain' ~* 'internet|product|互联网|应用|产品' THEN '互联网产品'
  ELSE '科技综合' END::text)) WHERE filter ? 'domain';

DELETE FROM event_heat;
INSERT INTO event_heat(event_id,date,report_count,source_count,last_published_at)
SELECT event_id,(published_at AT TIME ZONE 'Asia/Shanghai')::date,count(*),count(DISTINCT source_id),max(published_at)
FROM news WHERE event_id IS NOT NULL AND selected AND published_at IS NOT NULL
GROUP BY event_id,(published_at AT TIME ZONE 'Asia/Shanghai')::date;

UPDATE skills SET
  instructions='直接回答读者的问题，解释理解报道所需的术语和背景。用具体事实说明影响，保留时间、数量与适用条件。只引用提供的材料；材料未说明的事项明确指出，不补造原因或结论。根据问题使用简短段落或清单，不固定重复开场、总结和展望。',
  output_format='直接解读，附术语解释和对应来源',
  example=$example$## 云杉引擎什么时候能用？

云杉实验室宣布，云杉引擎将于 10 月 10 日开放试用，正式商业价格尚未公布。[N1]

### 测试数据怎样理解

发布说明中的平均响应时间为 **120 毫秒**，来自 1,000 条请求的测试。这个数字描述的是该组测试，换用其他硬件或请求时，结果可能不同。[N1]

“开放试用”表示读者可以按公告安排体验产品，公告没有说明试用是否免费。[N1]

示例材料：N1 为虚构的云杉实验室发布说明。$example$
WHERE slug='plain-reading' AND owner_id IS NULL;

UPDATE skills SET
  instructions='围绕读者的问题对照每份材料。先给出已能确认的事实，再列有意义的差异和各自测试条件。对照数据保留来源、样本量、时间和硬件等已知条件；未披露的条件写为未披露。不要把不同测量直接排成优劣，也不要为了凑表格创造差异。',
  output_format='有来源的对比表及简短解释',
  example=$example$## 两份报道确认了什么？

两份报道都将试用日期写为 10 月 10 日，均未公布商业价格。[N1][N2]

| 对照项 | 发布说明 [N1] | 独立测试 [N2] |
| --- | --- | --- |
| 请求数量 | 1,000 条 | 500 条 |
| 平均响应时间 | 120 毫秒 | 150 毫秒 |
| 硬件条件 | 未披露 | 未披露 |

两组请求样本不同，硬件条件也没有说明，现有数据无法直接判断性能差距的原因。

示例材料：N1 为虚构发布说明，N2 为虚构独立测试。$example$
WHERE slug='source-comparison' AND owner_id IS NULL;

UPDATE skills SET
  instructions='围绕用户指定范围编写简报。先写具体进展，再补充理解该进展需要的背景与条件。每项事实关联材料编号；只在有实际未决问题时提出跟进项。不用泛泛的行业趋势、意义或展望填充篇幅，不重复已说过的摘要。',
  output_format='简报标题、具体进展与来源',
  example=$example$## 云杉引擎试用进展

云杉实验室计划于 10 月 10 日开放引擎试用，商业定价仍未公布。[N1]

### 已有测试

- 发布方报告：1,000 条请求，平均响应时间 120 毫秒。[N1]
- 独立测试：500 条不同请求，平均响应时间 150 毫秒。[N2]

两份材料的样本与测试条件尚不足以直接比较性能。后续可关注正式定价和更完整的测试说明。

示例材料：N1、N2 为虚构的发布说明与独立测试。$example$
WHERE slug='topic-brief' AND owner_id IS NULL;

UPDATE skills SET
  instructions='依据提供材料组织主题、具体事实与背景层级。同层节点尽量保持同一概括程度，标题简短清楚。每个节点包含实际支持它的新闻标识；保留日期、数量、条件与未知状态，不增加没有材料依据的分支。',
  output_format='可展开的层级导图，每个节点附来源',
  example=$example$## 云杉引擎

- **试用安排** [N1]
  - 10 月 10 日开放试用
  - 商业价格尚未公布
- **已有测试** [N1][N2]
  - 发布方：1,000 条请求，平均 120 毫秒 [N1]
  - 独立测试：500 条请求，平均 150 毫秒 [N2]
  - 硬件条件未披露，测试结果不能直接比较

生成后可以展开和收起分支，点击节点的来源回看报道。

示例材料：N1、N2 为虚构的发布说明与独立测试。$example$
WHERE slug='mind-map' AND owner_id IS NULL;

UPDATE skills SET
  instructions='按读者的问题选取实际原文段落，与忠实译文逐段对照，保留日期、数量、否定和条件。原文必须逐字来自输入材料，不能把译写当原文。解释出现的重点词语，不把未公布价格解释为免费。只有摘要时说明范围，不扩写假想全文。',
  output_format='原文段落、译文及重点表达',
  example=$example$### 原文 [N1]

> Spruce Engine will open for trial on October 10, 2026. Commercial pricing has not been announced.

### 中文对照

云杉引擎将于 2026 年 10 月 10 日开放试用。商业价格尚未公布。[N1]

### 重点表达

- **open for trial**：开放试用，句子没有说明试用是否收费。
- **commercial pricing**：商业定价，即正式商业使用的价格安排。
- **has not been announced**：截至这份说明发布时，尚未公布。

示例材料：N1 为虚构英文摘要，以上对照仅覆盖取得的摘要。$example$
WHERE slug='bilingual-reading' AND owner_id IS NULL;
