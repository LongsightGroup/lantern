ALTER TABLE runtime_sessions ADD COLUMN preview_session_id TEXT REFERENCES preview_sessions (session_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS runtime_sessions_preview_session_idx
  ON runtime_sessions (preview_session_id);
