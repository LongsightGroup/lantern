CREATE TABLE IF NOT EXISTS attempt_evidence_artifacts (
  artifact_id text PRIMARY KEY,
  attempt_id text NOT NULL REFERENCES attempts (attempt_id) ON DELETE CASCADE,
  sequence integer NOT NULL CHECK (sequence > 0),
  kind text NOT NULL CHECK (kind IN ('screenshot_png', 'structured_json')),
  content_type text NOT NULL,
  file_name text NOT NULL,
  storage_key text NOT NULL UNIQUE,
  byte_size bigint NOT NULL CHECK (byte_size >= 0),
  sha256 text NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE (attempt_id, sequence)
);

CREATE INDEX IF NOT EXISTS attempt_evidence_artifacts_attempt_sequence_idx
  ON attempt_evidence_artifacts (attempt_id, sequence ASC);
