CREATE INDEX request_audit_actor_time_idx ON request_audit(actor_id,occurred_at DESC,request_id DESC);
