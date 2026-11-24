CREATE INDEX news_content_trgm_idx ON news USING gin (content gin_trgm_ops);
CREATE INDEX news_summary_trgm_idx ON news USING gin (summary gin_trgm_ops);
CREATE INDEX news_translation_trgm_idx ON news USING gin (translation gin_trgm_ops);
