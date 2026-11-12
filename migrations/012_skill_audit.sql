CREATE TABLE skill_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  request_id text,
  actor_id uuid NOT NULL,
  operation text NOT NULL DEFAULT 'skill.invoke',
  object_id uuid NOT NULL,
  message_id uuid NOT NULL,
  skill_id uuid NOT NULL,
  result text NOT NULL CHECK(result IN ('succeeded','failed')),
  error_code text,
  input_tokens integer,
  output_tokens integer,
  total_tokens integer,
  duration_ms integer NOT NULL
);
CREATE INDEX skill_audit_actor_time_idx ON skill_audit(actor_id,occurred_at DESC,id DESC);
CREATE INDEX skill_audit_skill_time_idx ON skill_audit(skill_id,occurred_at DESC,id DESC);
CREATE INDEX skill_audit_time_idx ON skill_audit(occurred_at DESC,id DESC);
