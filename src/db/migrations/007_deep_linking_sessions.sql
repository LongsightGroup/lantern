CREATE TABLE IF NOT EXISTS deep_linking_sessions (
  session_id text PRIMARY KEY,
  session_token text NOT NULL UNIQUE,
  deployment_record_id bigint NOT NULL REFERENCES deployments (id) ON DELETE CASCADE,
  deployment_slug text NOT NULL,
  app_id text NOT NULL,
  user_id text,
  user_role text NOT NULL CHECK (user_role IN ('learner', 'instructor')),
  context_id text,
  context_title text,
  deep_link_return_url text NOT NULL,
  data text,
  placement text NOT NULL CHECK (placement IN ('assignment_selection')),
  accept_types text[] NOT NULL DEFAULT '{}'::text[],
  accept_multiple boolean NOT NULL DEFAULT false,
  accept_presentation_document_targets text[] NOT NULL DEFAULT '{}'::text[],
  accept_line_item boolean NOT NULL DEFAULT false,
  selected_package_version_id bigint REFERENCES package_versions (id) ON DELETE SET NULL,
  selected_package_version text,
  selected_activity_id text,
  selected_content_path text,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS deep_linking_sessions_expires_at_idx
  ON deep_linking_sessions (expires_at);
