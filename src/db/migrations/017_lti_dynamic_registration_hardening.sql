CREATE TABLE IF NOT EXISTS dynamic_registration_states (
  state text PRIMARY KEY,
  app_id text NOT NULL,
  lms_type text NOT NULL CHECK (lms_type IN ('canvas', 'moodle', 'sakai')),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);

CREATE INDEX IF NOT EXISTS dynamic_registration_states_expires_at_idx
  ON dynamic_registration_states (expires_at);

ALTER TABLE deep_linking_sessions
  ADD COLUMN IF NOT EXISTS used_at timestamptz;
