CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE TABLE tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK(type IN ('collect','daily','journal','notify')),
  actor_id uuid,
  owner_id uuid,
  operation_scope text NOT NULL,
  operation_id text NOT NULL,
  input jsonb NOT NULL,
  request_input jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','succeeded','failed')),
  generation integer NOT NULL DEFAULT 1,
  execution_id uuid,
  attempts integer NOT NULL DEFAULT 0,
  round_attempts integer NOT NULL DEFAULT 0,
  result jsonb,
  error jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(operation_scope,type,operation_id)
);
CREATE INDEX tasks_unfinished ON tasks(status) WHERE status IN ('pending','running');
CREATE INDEX tasks_owner ON tasks(owner_id,created_at DESC,id);
CREATE TABLE task_attempts (
  id uuid PRIMARY KEY,
  task_id uuid NOT NULL REFERENCES tasks(id),
  generation integer NOT NULL,
  attempt integer NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  outcome text,
  error jsonb,
  UNIQUE(task_id,attempt)
);
CREATE TABLE task_outbox (
  id bigserial PRIMARY KEY,
  task_id uuid NOT NULL REFERENCES tasks(id),
  generation integer NOT NULL,
  kind text NOT NULL CHECK(kind IN ('business','dead')),
  delivered_at timestamptz,
  UNIQUE(task_id,generation,kind)
);
CREATE TABLE task_replays (
  task_id uuid NOT NULL REFERENCES tasks(id),
  operation_id text NOT NULL,
  generation integer NOT NULL,
  PRIMARY KEY(task_id,operation_id)
);
CREATE TABLE management_actions (
  id bigserial PRIMARY KEY,
  actor_id uuid NOT NULL,
  action text NOT NULL,
  object_id text NOT NULL,
  result text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
