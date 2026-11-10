CREATE TABLE topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL, description text NOT NULL DEFAULT '', filter jsonb NOT NULL,
  last_viewed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX topics_owner_idx ON topics(user_id,updated_at DESC,id);
CREATE TABLE topic_news (
  topic_id uuid NOT NULL REFERENCES topics(id) ON DELETE CASCADE, news_id uuid NOT NULL REFERENCES news(id) ON DELETE CASCADE,
  manual boolean NOT NULL DEFAULT false, added_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(topic_id,news_id)
);
CREATE TABLE topic_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), topic_id uuid NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  content text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), topic_id uuid NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, title text NOT NULL,
  kind text NOT NULL CHECK(kind IN ('brief','comparison','mindmap')), content text NOT NULL, structure jsonb,
  skill_id text, sources jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE shares (
  token text PRIMARY KEY, artifact_id uuid NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, snapshot jsonb NOT NULL,
  revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE follows (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, kind text NOT NULL CHECK(kind IN ('event','topic')),
  target_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,kind,target_id)
);
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  news_id uuid NOT NULL REFERENCES news(id) ON DELETE CASCADE, read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,news_id)
);
CREATE TABLE entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), label text NOT NULL, type text NOT NULL,
  UNIQUE(label,type)
);
CREATE TABLE relations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_id uuid NOT NULL REFERENCES entities(id),
  target_id uuid NOT NULL REFERENCES entities(id), label text NOT NULL,
  news_id uuid NOT NULL REFERENCES news(id) ON DELETE CASCADE,
  UNIQUE(source_id,target_id,label,news_id)
);
CREATE INDEX relations_news_idx ON relations(news_id);
