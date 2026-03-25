CREATE TABLE IF NOT EXISTS broker_verification_runs (
  id bigserial PRIMARY KEY,
  deployment_record_id bigint REFERENCES deployments (id) ON DELETE SET NULL,
  supported_path text NOT NULL,
  source text NOT NULL,
  status text NOT NULL,
  summary text NOT NULL,
  evidence_url text,
  official_certification_state text NOT NULL,
  directory_url text,
  checked_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS attempts_deployment_started_at_idx
  ON attempts (deployment_record_id, started_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS runtime_sessions_attempt_lookup_idx
  ON runtime_sessions (attempt_id, created_at DESC, session_id DESC);

CREATE INDEX IF NOT EXISTS audit_events_deployment_event_occurred_at_idx
  ON audit_events (deployment_record_id, event_type, occurred_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS grade_publications_status_updated_at_idx
  ON grade_publications (status, updated_at DESC, id DESC);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'broker_verification_runs'
      AND column_name = 'supported_path'
  ) THEN
    EXECUTE '
      CREATE INDEX IF NOT EXISTS broker_verification_runs_path_checked_at_idx
        ON broker_verification_runs (supported_path, checked_at DESC, id DESC)
    ';
  ELSIF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'broker_verification_runs'
      AND column_name = 'scope'
  ) THEN
    EXECUTE '
      CREATE INDEX IF NOT EXISTS broker_verification_runs_path_checked_at_idx
        ON broker_verification_runs (scope, checked_at DESC, id DESC)
    ';
  END IF;
END $$;
