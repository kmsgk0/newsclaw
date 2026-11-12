CREATE TABLE request_audit (
  request_id uuid PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid,
  method text NOT NULL,
  route text NOT NULL,
  status integer NOT NULL,
  object_id uuid,
  duration_ms double precision NOT NULL
);
CREATE INDEX request_audit_occurred_at_idx ON request_audit (occurred_at DESC, request_id DESC);
