CREATE TABLE IF NOT EXISTS package_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  app_id TEXT NOT NULL,
  version TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  owner_type TEXT NOT NULL CHECK (owner_type IN ('user')),
  owner_id TEXT NOT NULL,
  entrypoint TEXT NOT NULL,
  roles TEXT NOT NULL CHECK (json_valid(roles)),
  install_scope TEXT NOT NULL CHECK (install_scope IN ('course', 'assignment')),
  capabilities TEXT NOT NULL CHECK (json_valid(capabilities)),
  grading_mode TEXT NOT NULL CHECK (
    grading_mode IN ('declarative', 'manual', 'completion', 'browser')
  ),
  grading_rubric_file TEXT,
  grading_max_score INTEGER,
  sandbox_grading_enabled INTEGER NOT NULL DEFAULT 0 CHECK (
    sandbox_grading_enabled IN (0, 1)
  ),
  catalog_visibility TEXT NOT NULL DEFAULT 'catalog' CHECK (
    catalog_visibility IN ('catalog', 'python_lab_trial')
  ),
  approval_status TEXT NOT NULL CHECK (
    approval_status IN ('pending', 'approved', 'rejected')
  ),
  review_notes TEXT,
  accessibility_review TEXT CHECK (
    accessibility_review IS NULL OR json_valid(accessibility_review)
  ),
  reviewed_at TEXT,
  validation_issues TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(validation_issues)),
  manifest_json TEXT NOT NULL CHECK (json_valid(manifest_json)),
  artifact_root TEXT NOT NULL,
  artifact_digest TEXT NOT NULL,
  runtime_contract TEXT NOT NULL CHECK (json_valid(runtime_contract)),
  runtime_contract_signature TEXT NOT NULL,
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (app_id, version)
);

CREATE INDEX IF NOT EXISTS package_versions_catalog_visibility_idx
  ON package_versions (catalog_visibility, app_id, imported_at DESC);

CREATE TABLE IF NOT EXISTS lti_clients (
  id TEXT PRIMARY KEY NOT NULL,
  platform_name TEXT NOT NULL,
  iss TEXT NOT NULL,
  client_id TEXT NOT NULL,
  auth_url TEXT NOT NULL,
  token_url TEXT NOT NULL,
  jwks_url TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS lti_clients_issuer_client_idx
  ON lti_clients (client_id, iss);

CREATE UNIQUE INDEX IF NOT EXISTS lti_clients_iss_client_id_uniq
  ON lti_clients (iss, client_id);

CREATE TABLE IF NOT EXISTS lti_deployments (
  id TEXT PRIMARY KEY NOT NULL,
  client_id TEXT NOT NULL REFERENCES lti_clients (id) ON DELETE CASCADE,
  deployment_id TEXT NOT NULL,
  deployment_name TEXT,
  deployment_description TEXT
);

CREATE INDEX IF NOT EXISTS lti_deployments_deployment_id_idx
  ON lti_deployments (deployment_id);

CREATE UNIQUE INDEX IF NOT EXISTS lti_deployments_client_deployment_uniq
  ON lti_deployments (client_id, deployment_id);

CREATE TABLE IF NOT EXISTS lti_nonces (
  nonce TEXT PRIMARY KEY NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS lti_nonces_expires_at_idx
  ON lti_nonces (expires_at);

CREATE TABLE IF NOT EXISTS lti_registration_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  payload TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS lti_registration_sessions_expires_at_idx
  ON lti_registration_sessions (expires_at);

CREATE TABLE IF NOT EXISTS lti_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  payload TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS lti_sessions_expires_at_idx
  ON lti_sessions (expires_at);

-- Preview/authoring runtime sessions only. This table backs preview and admin
-- test launches. LMS launches use governed_runtime_sessions (see migration
-- 0004_governed_lms_primitive_kernel.sql), which is the LMS launch plane.
CREATE TABLE IF NOT EXISTS runtime_sessions (
  session_id TEXT PRIMARY KEY,
  session_token TEXT NOT NULL UNIQUE,
  lti_tool_session_id TEXT REFERENCES lti_sessions (id) ON DELETE SET NULL,
  attempt_id TEXT REFERENCES attempts (attempt_id) ON DELETE SET NULL,
  app_id TEXT NOT NULL,
  package_version_id INTEGER NOT NULL REFERENCES package_versions (id),
  package_version TEXT NOT NULL,
  capabilities TEXT NOT NULL CHECK (json_valid(capabilities)),
  snapshot_root TEXT NOT NULL,
  entrypoint_path TEXT NOT NULL,
  content_path TEXT NOT NULL,
  ags_scope TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(ags_scope)),
  ags_lineitems_url TEXT,
  ags_lineitem_url TEXT,
  nrps_context_memberships_url TEXT,
  nrps_service_versions TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(nrps_service_versions)),
  launch_user_role TEXT NOT NULL CHECK (launch_user_role IN ('learner', 'instructor')),
  launch_course_id TEXT NOT NULL,
  launch_assignment_id TEXT,
  launch_activity_id TEXT NOT NULL,
  preview_session_id TEXT NOT NULL REFERENCES preview_sessions (session_id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS runtime_sessions_expires_at_idx
  ON runtime_sessions (expires_at);

CREATE INDEX IF NOT EXISTS runtime_sessions_attempt_lookup_idx
  ON runtime_sessions (attempt_id, created_at DESC, session_id DESC);

CREATE TABLE IF NOT EXISTS attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  attempt_id TEXT NOT NULL UNIQUE,
  preview_session_id TEXT NOT NULL REFERENCES preview_sessions (session_id) ON DELETE CASCADE,
  app_id TEXT NOT NULL,
  package_version_id INTEGER NOT NULL REFERENCES package_versions (id),
  package_version TEXT NOT NULL,
  user_id TEXT NOT NULL,
  user_display_name TEXT,
  user_email TEXT,
  user_login TEXT,
  user_role TEXT NOT NULL CHECK (user_role IN ('learner', 'instructor')),
  context_id TEXT NOT NULL,
  resource_link_id TEXT NOT NULL,
  activity_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('in_progress', 'completed', 'abandoned')),
  completion_state TEXT CHECK (completion_state IN ('completed', 'abandoned')),
  local_state TEXT CHECK (local_state IS NULL OR json_valid(local_state)),
  next_attempt_event_sequence INTEGER NOT NULL DEFAULT 1 CHECK (next_attempt_event_sequence > 0),
  next_evidence_artifact_sequence INTEGER NOT NULL DEFAULT 1 CHECK (
    next_evidence_artifact_sequence > 0
  ),
  started_at TEXT NOT NULL,
  finalized_at TEXT
);

CREATE INDEX IF NOT EXISTS attempts_preview_started_at_idx
  ON attempts (preview_session_id, started_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS attempt_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  attempt_id TEXT NOT NULL REFERENCES attempts (attempt_id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  learning_verb TEXT NOT NULL,
  object_id TEXT NOT NULL,
  object_type TEXT NOT NULL,
  result TEXT CHECK (result IS NULL OR json_valid(result)),
  event TEXT NOT NULL CHECK (json_valid(event)),
  received_at TEXT NOT NULL,
  UNIQUE (attempt_id, sequence)
);

CREATE TABLE IF NOT EXISTS attempt_evidence_artifacts (
  artifact_id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES attempts (attempt_id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  kind TEXT NOT NULL CHECK (kind IN ('screenshot_png', 'structured_json')),
  content_type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
  sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (attempt_id, sequence)
);

CREATE INDEX IF NOT EXISTS attempt_evidence_artifacts_attempt_sequence_idx
  ON attempt_evidence_artifacts (attempt_id, sequence ASC);

CREATE TABLE IF NOT EXISTS audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('user', 'system', 'platform')),
  actor_id TEXT,
  package_version_id INTEGER REFERENCES package_versions (id) ON DELETE SET NULL,
  attempt_id TEXT REFERENCES attempts (attempt_id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('accepted', 'succeeded', 'failed')),
  summary TEXT NOT NULL,
  detail TEXT NOT NULL CHECK (json_valid(detail)),
  occurred_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS audit_events_attempt_id_occurred_at_idx
  ON audit_events (attempt_id, occurred_at, id);

CREATE TABLE IF NOT EXISTS preview_sessions (
  session_id TEXT PRIMARY KEY,
  package_version_id INTEGER NOT NULL REFERENCES package_versions (id) ON DELETE CASCADE,
  app_id TEXT NOT NULL,
  package_version TEXT NOT NULL,
  package_title TEXT NOT NULL,
  origin TEXT NOT NULL CHECK (
    origin IN ('adminTestLaunch', 'adminAuthoringDraft')
  ),
  content_path TEXT NOT NULL,
  capabilities TEXT NOT NULL CHECK (json_valid(capabilities)),
  snapshot_root TEXT NOT NULL,
  entrypoint_path TEXT NOT NULL,
  launch_user_id TEXT NOT NULL,
  launch_user_role TEXT NOT NULL CHECK (launch_user_role IN ('learner', 'instructor')),
  launch_course_id TEXT NOT NULL,
  launch_assignment_id TEXT,
  launch_activity_id TEXT NOT NULL,
  fake_attempt_id TEXT NOT NULL,
  fake_score_maximum REAL NOT NULL,
  fixture_data TEXT NOT NULL CHECK (json_valid(fixture_data)),
  next_evidence_sequence INTEGER NOT NULL DEFAULT 1 CHECK (next_evidence_sequence > 0),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS preview_sessions_package_version_created_idx
  ON preview_sessions (package_version_id, created_at DESC);

CREATE INDEX IF NOT EXISTS preview_sessions_package_version_origin_created_idx
  ON preview_sessions (package_version_id, origin, created_at DESC);

CREATE TABLE IF NOT EXISTS preview_evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  preview_session_id TEXT NOT NULL REFERENCES preview_sessions (session_id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  capability TEXT,
  summary TEXT NOT NULL,
  detail TEXT NOT NULL CHECK (json_valid(detail)),
  occurred_at TEXT NOT NULL,
  UNIQUE (preview_session_id, sequence)
);

CREATE INDEX IF NOT EXISTS preview_evidence_session_occurred_idx
  ON preview_evidence (preview_session_id, occurred_at ASC, id ASC);

CREATE TABLE IF NOT EXISTS authoring_drafts (
  draft_id TEXT PRIMARY KEY,
  package_version_id INTEGER NOT NULL UNIQUE REFERENCES package_versions (id) ON DELETE CASCADE,
  app_id TEXT NOT NULL,
  package_version TEXT NOT NULL,
  package_title TEXT NOT NULL,
  authoring_kind TEXT NOT NULL CHECK (authoring_kind = 'browser_autograder'),
  authoring_paths TEXT NOT NULL CHECK (json_valid(authoring_paths)),
  base_snapshot_root TEXT NOT NULL,
  latest_prompt_text TEXT,
  latest_generation_notes TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(latest_generation_notes)),
  saved_source TEXT NOT NULL DEFAULT 'manual' CHECK (saved_source IN ('manual', 'ai')),
  last_previewed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS authoring_draft_files (
  draft_id TEXT NOT NULL REFERENCES authoring_drafts (draft_id) ON DELETE CASCADE,
  relative_path TEXT NOT NULL,
  contents TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  PRIMARY KEY (draft_id, relative_path)
);

CREATE INDEX IF NOT EXISTS authoring_draft_files_draft_sequence_idx
  ON authoring_draft_files (draft_id, sequence ASC, relative_path ASC);

CREATE TABLE IF NOT EXISTS app_generation_runs (
  generation_id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN (
      'started',
      'initializing',
      'normalizing',
      'planning',
      'generating_package',
      'validating',
      'repairing',
      'previewing',
      'saved_pending_version',
      'failed'
    )
  ),
  requested_app_id TEXT,
  generated_app_id TEXT,
  generated_version TEXT,
  package_version_id INTEGER REFERENCES package_versions (id) ON DELETE SET NULL,
  prompt_text TEXT NOT NULL,
  normalized_request_json TEXT CHECK (
    normalized_request_json IS NULL OR json_valid(normalized_request_json)
  ),
  app_plan_json TEXT CHECK (app_plan_json IS NULL OR json_valid(app_plan_json)),
  selected_starter_id TEXT CHECK (
    selected_starter_id IS NULL OR selected_starter_id IN ('simple-activity', 'browser-autograder')
  ),
  selected_context_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(selected_context_json)),
  model_request_metadata_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(model_request_metadata_json)),
  generation_notes_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(generation_notes_json)),
  validation_findings_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(validation_findings_json)),
  repair_attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (repair_attempt_count >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS app_generation_runs_owner_updated_idx
  ON app_generation_runs (owner_id, updated_at DESC, generation_id DESC);

CREATE INDEX IF NOT EXISTS app_generation_runs_package_version_idx
  ON app_generation_runs (package_version_id)
  WHERE package_version_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS app_generation_workspaces (
  generation_id TEXT PRIMARY KEY REFERENCES app_generation_runs (generation_id) ON DELETE CASCADE,
  selected_starter_id TEXT NOT NULL CHECK (
    selected_starter_id IN ('simple-activity', 'browser-autograder')
  ),
  files_json TEXT NOT NULL CHECK (json_valid(files_json)),
  validation_findings_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(validation_findings_json)),
  repair_attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (repair_attempt_count >= 0),
  updated_at TEXT NOT NULL
);
