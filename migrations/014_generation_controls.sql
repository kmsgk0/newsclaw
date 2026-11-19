CREATE TABLE generation_settings (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  mode text NOT NULL DEFAULT 'manual' CHECK(mode IN ('manual','daily','updates')),
  start_hour integer NOT NULL DEFAULT 8 CHECK(start_hour BETWEEN 0 AND 23),
  daily_limit integer NOT NULL DEFAULT 3 CHECK(daily_limit BETWEEN 1 AND 20),
  paused_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO generation_settings(user_id) SELECT id FROM users;
CREATE TABLE generation_usage (
  id uuid PRIMARY KEY,
  task_id uuid NOT NULL REFERENCES tasks(id),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  automatic boolean NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  usage jsonb
);
CREATE INDEX generation_usage_user_day ON generation_usage(user_id,started_at);
