CREATE TABLE IF NOT EXISTS lti_login_states (
  state text PRIMARY KEY,
  canvas_environment text NOT NULL CHECK (
    canvas_environment IN ('production', 'beta', 'test')
  ),
  issuer text NOT NULL,
  client_id text NOT NULL,
  deployment_id text NOT NULL,
  nonce text NOT NULL,
  login_hint text NOT NULL,
  target_link_uri text NOT NULL,
  lti_message_hint text,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);

CREATE INDEX IF NOT EXISTS lti_login_states_expires_at_idx
  ON lti_login_states (expires_at);

CREATE TABLE IF NOT EXISTS runtime_sessions (
  session_id text PRIMARY KEY,
  session_token text NOT NULL UNIQUE,
  deployment_record_id bigint NOT NULL REFERENCES deployments (id) ON DELETE CASCADE,
  deployment_slug text NOT NULL,
  app_id text NOT NULL,
  package_version_id bigint NOT NULL REFERENCES package_versions (id),
  package_version text NOT NULL,
  capabilities text[] NOT NULL,
  snapshot_root text NOT NULL,
  entrypoint_path text NOT NULL,
  content_path text NOT NULL,
  launch_user_role text NOT NULL CHECK (launch_user_role IN ('learner', 'instructor')),
  launch_course_id text NOT NULL,
  launch_assignment_id text,
  launch_activity_id text NOT NULL,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS runtime_sessions_expires_at_idx
  ON runtime_sessions (expires_at);
