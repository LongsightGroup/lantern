CREATE TABLE IF NOT EXISTS preview_sessions (
  session_id text PRIMARY KEY,
  package_version_id bigint NOT NULL REFERENCES package_versions (id) ON DELETE CASCADE,
  app_id text NOT NULL,
  package_version text NOT NULL,
  package_title text NOT NULL,
  capabilities text[] NOT NULL,
  snapshot_root text NOT NULL,
  entrypoint_path text NOT NULL,
  launch_user_id text NOT NULL,
  launch_user_role text NOT NULL,
  launch_course_id text NOT NULL,
  launch_assignment_id text,
  launch_activity_id text NOT NULL,
  fake_attempt_id text NOT NULL,
  fake_score_maximum numeric NOT NULL,
  fixture_data jsonb NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS preview_sessions_package_version_created_idx
  ON preview_sessions (package_version_id, created_at DESC);

CREATE TABLE IF NOT EXISTS preview_evidence (
  id bigserial PRIMARY KEY,
  preview_session_id text NOT NULL REFERENCES preview_sessions (session_id) ON DELETE CASCADE,
  sequence integer NOT NULL,
  event_type text NOT NULL,
  capability text,
  summary text NOT NULL,
  detail jsonb NOT NULL,
  occurred_at timestamptz NOT NULL,
  UNIQUE (preview_session_id, sequence)
);

CREATE INDEX IF NOT EXISTS preview_evidence_session_occurred_idx
  ON preview_evidence (preview_session_id, occurred_at ASC, id ASC);
