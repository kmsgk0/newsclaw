CREATE TABLE csrf_tokens (
  token_hash text PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE INDEX csrf_tokens_expiry ON csrf_tokens(expires_at);
