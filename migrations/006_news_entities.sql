CREATE TABLE news_entities (
  news_id uuid NOT NULL REFERENCES news(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  PRIMARY KEY(news_id,entity_id)
);
INSERT INTO news_entities(news_id,entity_id)
SELECT news_id,source_id FROM relations UNION SELECT news_id,target_id FROM relations
ON CONFLICT DO NOTHING;
