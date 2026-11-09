CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE editors (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '小闻',
  avatar text NOT NULL DEFAULT '',
  style text NOT NULL DEFAULT '清楚、简洁，保留背景与来源',
  interests text NOT NULL DEFAULT '',
  activity_cursor bigint NOT NULL DEFAULT 0
);
CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  access_hash text NOT NULL UNIQUE,
  refresh_hash text NOT NULL UNIQUE,
  access_expires timestamptz NOT NULL,
  refresh_expires timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user ON sessions(user_id);
ALTER TABLE tasks ADD FOREIGN KEY(owner_id) REFERENCES users(id);
ALTER TABLE tasks ADD FOREIGN KEY(actor_id) REFERENCES users(id);
