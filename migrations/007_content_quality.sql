CREATE INDEX IF NOT EXISTS events_title_trgm_idx ON events USING gin(title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS news_domain_time_idx ON news(domain,published_at DESC,id);
ALTER TABLE news ADD COLUMN event_assignment text NOT NULL DEFAULT 'auto' CHECK(event_assignment IN ('auto','manual'));

UPDATE news SET domain = CASE
  WHEN domain ~* 'robot|机器人' THEN '机器人'
  WHEN domain ~* 'security|cyber|安全' THEN '网络安全'
  WHEN domain ~* 'hardware|chip|semiconductor|芯片|硬件|半导体' THEN '硬件与芯片'
  WHEN domain ~* 'artificial.intelligence|machine.learning|speech|text.to.speech|人工智能|机器学习|语音|大模型' THEN '人工智能'
  WHEN domain ~* 'software|development|programming|开发|编程|软件' THEN '软件开发'
  WHEN domain ~* 'science|research|科学|科研|研究' THEN '科学研究'
  WHEN domain ~* 'society|education|policy|社会|教育|政策|法律' THEN '科技与社会'
  WHEN domain ~* 'internet|product|互联网|应用|产品' THEN '互联网产品'
  ELSE '科技综合' END,
  processing = processing || '{"contentVersion":1,"stale":true}'::jsonb;
