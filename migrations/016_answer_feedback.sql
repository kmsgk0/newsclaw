CREATE TABLE answer_feedback (
  message_id uuid PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('helpful','inaccurate','unsupported_citation')),
  source_label text,
  news_id uuid REFERENCES news(id) ON DELETE SET NULL,
  note text NOT NULL DEFAULT '' CHECK (length(note)<=1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((category='unsupported_citation' AND source_label IS NOT NULL) OR (category<>'unsupported_citation' AND source_label IS NULL))
);
