CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE TABLE news_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, kind text NOT NULL CHECK (kind IN ('rss','json','web')),
  url text NOT NULL, config jsonb NOT NULL DEFAULT '{}', enabled boolean NOT NULL DEFAULT true,
  last_collected_at timestamptz, last_error text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL, summary text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE news (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_id uuid NOT NULL REFERENCES news_sources(id),
  url text NOT NULL, title text NOT NULL, published_at timestamptz, content text NOT NULL,
  content_scope text NOT NULL CHECK (content_scope IN ('full','summary')), content_hash text NOT NULL,
  summary text, translation text, language text NOT NULL DEFAULT 'und', domain text NOT NULL DEFAULT '科技',
  selected boolean NOT NULL DEFAULT true, event_id uuid REFERENCES events(id) ON DELETE SET NULL,
  embedding vector, processing jsonb NOT NULL DEFAULT '{}', extracted jsonb,
  search_document tsvector GENERATED ALWAYS AS (to_tsvector('simple', title || ' ' || content)) STORED,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_id,url)
);
CREATE INDEX news_time_idx ON news(published_at DESC,id);
CREATE INDEX news_event_idx ON news(event_id,published_at,id);
CREATE INDEX news_search_idx ON news USING gin(search_document);
CREATE INDEX news_title_trgm_idx ON news USING gin(title gin_trgm_ops);
CREATE INDEX news_hash_idx ON news(content_hash);
CREATE TABLE favorites (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, news_id uuid NOT NULL REFERENCES news(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,news_id)
);
CREATE TABLE reading_history (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, news_id uuid NOT NULL REFERENCES news(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,news_id)
);
CREATE TABLE activities (
  id bigserial PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, kind text NOT NULL,
  news_id uuid REFERENCES news(id) ON DELETE SET NULL, conversation_id uuid,
  data jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activities_user_idx ON activities(user_id,id);
CREATE TABLE public_digests (
  date date PRIMARY KEY, title text NOT NULL, content text NOT NULL, sources jsonb NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(), generation_at timestamptz NOT NULL
);
CREATE TABLE event_heat (
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE, date date NOT NULL,
  report_count integer NOT NULL, source_count integer NOT NULL, last_published_at timestamptz,
  PRIMARY KEY(event_id,date)
);
