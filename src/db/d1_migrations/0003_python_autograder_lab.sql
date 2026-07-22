CREATE TABLE IF NOT EXISTS python_lab_trials (
  lab_id TEXT PRIMARY KEY,
  visitor_hash TEXT NOT NULL,
  visitor_day TEXT NOT NULL,
  request_ip_hash TEXT,
  access_token_hash TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('generating', 'ready', 'failed', 'expired')),
  author_draft TEXT NOT NULL CHECK (json_valid(author_draft)),
  package_version_id INTEGER REFERENCES package_versions (id) ON DELETE SET NULL,
  private_artifact_key TEXT,
  failure_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  UNIQUE (visitor_hash, visitor_day)
);

CREATE INDEX IF NOT EXISTS python_lab_trials_visitor_created_idx
  ON python_lab_trials (visitor_hash, created_at DESC);

CREATE TABLE IF NOT EXISTS python_lab_rate_limits (
  request_ip_hash TEXT NOT NULL,
  window_started_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (request_ip_hash, window_started_at)
);

CREATE INDEX IF NOT EXISTS python_lab_rate_limits_created_idx
  ON python_lab_rate_limits (created_at);

CREATE INDEX IF NOT EXISTS python_lab_trials_ip_created_idx
  ON python_lab_trials (request_ip_hash, created_at DESC)
  WHERE request_ip_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS python_lab_trials_expires_idx
  ON python_lab_trials (expires_at);

CREATE TABLE IF NOT EXISTS code_assignment_definitions (
  package_version_id INTEGER PRIMARY KEY REFERENCES package_versions (id) ON DELETE CASCADE,
  function_name TEXT NOT NULL,
  private_artifact_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS code_submission_runs (
  run_id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES attempts (attempt_id) ON DELETE CASCADE,
  source_artifact_key TEXT NOT NULL UNIQUE,
  phase TEXT NOT NULL CHECK (phase = 'final'),
  public_outcomes TEXT NOT NULL CHECK (json_valid(public_outcomes)),
  hidden_summary TEXT NOT NULL CHECK (json_valid(hidden_summary)),
  score_given REAL NOT NULL CHECK (score_given >= 0 AND score_given <= 10),
  score_maximum REAL NOT NULL CHECK (score_maximum = 10),
  created_at TEXT NOT NULL,
  source_persisted_at TEXT,
  finalized_at TEXT NOT NULL,
  UNIQUE (attempt_id, phase)
);

CREATE TABLE IF NOT EXISTS python_lab_access_requests (
  request_id TEXT PRIMARY KEY,
  lab_id TEXT NOT NULL,
  name TEXT NOT NULL,
  work_email TEXT NOT NULL,
  institution TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('new', 'contacted', 'closed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS python_lab_access_requests_status_created_idx
  ON python_lab_access_requests (status, created_at DESC);

CREATE INDEX IF NOT EXISTS python_lab_access_requests_expires_idx
  ON python_lab_access_requests (expires_at);
