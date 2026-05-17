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

CREATE TABLE IF NOT EXISTS deployments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  app_id TEXT NOT NULL,
  enabled_package_version_id INTEGER REFERENCES package_versions (id),
  lms_type TEXT NOT NULL DEFAULT 'canvas' CHECK (
    lms_type IN ('canvas', 'moodle', 'sakai', 'preview')
  ),
  canvas_environment TEXT CHECK (
    canvas_environment IS NULL OR canvas_environment IN ('production', 'beta', 'test')
  ),
  issuer TEXT,
  client_id TEXT,
  deployment_id TEXT,
  authorization_endpoint TEXT,
  access_token_url TEXT,
  jwks_url TEXT,
  lti_profile_override TEXT CHECK (
    lti_profile_override IS NULL OR
    lti_profile_override IN ('certification', 'governedCompatibility')
  ),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS deployments_lti_binding_unique
  ON deployments (lms_type, issuer, client_id, deployment_id)
  WHERE issuer IS NOT NULL
    AND client_id IS NOT NULL
    AND deployment_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS deployments_app_lms_slot_unique
  ON deployments (app_id, lms_type);

CREATE TABLE IF NOT EXISTS lti_login_states (
  state TEXT PRIMARY KEY,
  lms_type TEXT NOT NULL DEFAULT 'canvas' CHECK (lms_type IN ('canvas', 'moodle', 'sakai')),
  canvas_environment TEXT CHECK (
    (lms_type = 'canvas' AND canvas_environment IN ('production', 'beta', 'test'))
    OR (lms_type IN ('moodle', 'sakai') AND canvas_environment IS NULL)
  ),
  issuer TEXT NOT NULL,
  client_id TEXT NOT NULL,
  deployment_id TEXT NOT NULL,
  nonce TEXT NOT NULL,
  login_hint TEXT NOT NULL,
  target_link_uri TEXT NOT NULL,
  lti_message_hint TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);

CREATE INDEX IF NOT EXISTS lti_login_states_expires_at_idx
  ON lti_login_states (expires_at);

CREATE TABLE IF NOT EXISTS dynamic_registration_states (
  state TEXT PRIMARY KEY,
  app_id TEXT NOT NULL,
  lms_type TEXT NOT NULL CHECK (lms_type IN ('canvas', 'moodle', 'sakai')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);

CREATE INDEX IF NOT EXISTS dynamic_registration_states_expires_at_idx
  ON dynamic_registration_states (expires_at);

CREATE TABLE IF NOT EXISTS runtime_sessions (
  session_id TEXT PRIMARY KEY,
  session_token TEXT NOT NULL UNIQUE,
  attempt_id TEXT REFERENCES attempts (attempt_id) ON DELETE SET NULL,
  deployment_record_id INTEGER NOT NULL REFERENCES deployments (id) ON DELETE CASCADE,
  deployment_slug TEXT NOT NULL,
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
  preview_session_id TEXT REFERENCES preview_sessions (session_id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS runtime_sessions_expires_at_idx
  ON runtime_sessions (expires_at);

CREATE INDEX IF NOT EXISTS runtime_sessions_attempt_lookup_idx
  ON runtime_sessions (attempt_id, created_at DESC, session_id DESC);

CREATE INDEX IF NOT EXISTS runtime_sessions_preview_session_idx
  ON runtime_sessions (preview_session_id);

CREATE TABLE IF NOT EXISTS attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  attempt_id TEXT NOT NULL UNIQUE,
  deployment_record_id INTEGER NOT NULL REFERENCES deployments (id) ON DELETE CASCADE,
  deployment_slug TEXT NOT NULL,
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
  started_at TEXT NOT NULL,
  finalized_at TEXT
);

CREATE INDEX IF NOT EXISTS attempts_deployment_record_id_idx
  ON attempts (deployment_record_id);

CREATE INDEX IF NOT EXISTS attempts_deployment_started_at_idx
  ON attempts (deployment_record_id, started_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS attempt_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  attempt_id TEXT NOT NULL REFERENCES attempts (attempt_id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  event_type TEXT NOT NULL,
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

CREATE TABLE IF NOT EXISTS line_item_bindings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deployment_record_id INTEGER NOT NULL REFERENCES deployments (id) ON DELETE CASCADE,
  package_version_id INTEGER NOT NULL REFERENCES package_versions (id),
  context_id TEXT NOT NULL,
  resource_link_id TEXT NOT NULL,
  activity_id TEXT NOT NULL,
  line_items_url TEXT NOT NULL,
  line_item_url TEXT NOT NULL UNIQUE,
  resource_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  label TEXT NOT NULL,
  score_maximum REAL NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (
    deployment_record_id,
    package_version_id,
    context_id,
    resource_link_id,
    activity_id
  )
);

CREATE TABLE IF NOT EXISTS grade_publications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  attempt_id TEXT NOT NULL REFERENCES attempts (attempt_id) ON DELETE CASCADE,
  line_item_binding_id INTEGER NOT NULL REFERENCES line_item_bindings (id) ON DELETE CASCADE,
  line_item_url TEXT NOT NULL,
  platform_user_id TEXT NOT NULL,
  score_given REAL NOT NULL,
  score_maximum REAL NOT NULL,
  activity_progress TEXT NOT NULL CHECK (
    activity_progress IN ('Completed', 'InProgress', 'Initialized')
  ),
  grading_progress TEXT NOT NULL CHECK (
    grading_progress IN ('Pending', 'PendingManual', 'FullyGraded', 'Failed')
  ),
  status TEXT NOT NULL CHECK (status IN ('pending', 'published', 'failed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT,
  error_code TEXT,
  error_detail TEXT CHECK (error_detail IS NULL OR json_valid(error_detail)),
  UNIQUE (attempt_id)
);

CREATE INDEX IF NOT EXISTS grade_publications_status_updated_at_idx
  ON grade_publications (status, updated_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('user', 'system', 'platform')),
  actor_id TEXT,
  deployment_record_id INTEGER REFERENCES deployments (id) ON DELETE SET NULL,
  package_version_id INTEGER REFERENCES package_versions (id) ON DELETE SET NULL,
  attempt_id TEXT REFERENCES attempts (attempt_id) ON DELETE SET NULL,
  line_item_binding_id INTEGER REFERENCES line_item_bindings (id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('accepted', 'succeeded', 'failed')),
  summary TEXT NOT NULL,
  detail TEXT NOT NULL CHECK (json_valid(detail)),
  occurred_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS audit_events_attempt_id_occurred_at_idx
  ON audit_events (attempt_id, occurred_at, id);

CREATE INDEX IF NOT EXISTS audit_events_deployment_event_occurred_at_idx
  ON audit_events (deployment_record_id, event_type, occurred_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS broker_verification_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deployment_record_id INTEGER REFERENCES deployments (id) ON DELETE SET NULL,
  scope TEXT NOT NULL,
  workflow_key TEXT CHECK (
    workflow_key IS NULL OR workflow_key IN ('core', 'deepLinking', 'nrps', 'ags')
  ),
  source TEXT NOT NULL CHECK (source IN ('manual', 'ci', '1edtech')),
  status TEXT NOT NULL CHECK (status IN ('passed', 'failed', 'pending', 'notCertified')),
  summary TEXT NOT NULL,
  detail_url TEXT,
  certification_state TEXT CHECK (
    certification_state IS NULL OR
    certification_state IN ('ltiAdvantageCertified', 'ltiAdvantageComplete')
  ),
  checked_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS broker_verification_runs_scope_source_checked_at_idx
  ON broker_verification_runs (scope, source, checked_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS broker_verification_runs_workflow_key_source_checked_at_idx
  ON broker_verification_runs (workflow_key, source, checked_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS deep_linking_sessions (
  session_id TEXT PRIMARY KEY,
  session_token TEXT NOT NULL UNIQUE,
  deployment_record_id INTEGER NOT NULL REFERENCES deployments (id) ON DELETE CASCADE,
  deployment_slug TEXT NOT NULL,
  app_id TEXT NOT NULL,
  user_id TEXT,
  user_role TEXT NOT NULL CHECK (user_role IN ('learner', 'instructor')),
  context_id TEXT,
  context_title TEXT,
  deep_link_return_url TEXT NOT NULL,
  data TEXT,
  placement TEXT NOT NULL CHECK (placement IN ('assignment_selection', 'resource_selection')),
  accept_types TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(accept_types)),
  accept_multiple INTEGER NOT NULL DEFAULT 0 CHECK (accept_multiple IN (0, 1)),
  accept_presentation_document_targets TEXT NOT NULL DEFAULT '[]' CHECK (
    json_valid(accept_presentation_document_targets)
  ),
  accept_line_item INTEGER NOT NULL DEFAULT 0 CHECK (accept_line_item IN (0, 1)),
  selected_package_version_id INTEGER REFERENCES package_versions (id) ON DELETE SET NULL,
  selected_package_version TEXT,
  selected_activity_id TEXT,
  selected_content_path TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);

CREATE INDEX IF NOT EXISTS deep_linking_sessions_expires_at_idx
  ON deep_linking_sessions (expires_at);

CREATE TABLE IF NOT EXISTS reviewed_placements (
  placement_id TEXT PRIMARY KEY,
  deployment_record_id INTEGER NOT NULL REFERENCES deployments (id) ON DELETE CASCADE,
  deployment_slug TEXT NOT NULL,
  app_id TEXT NOT NULL,
  context_id TEXT,
  context_title TEXT,
  package_version_id INTEGER NOT NULL REFERENCES package_versions (id),
  package_version TEXT NOT NULL,
  package_title TEXT NOT NULL,
  activity_id TEXT NOT NULL,
  content_path TEXT NOT NULL,
  content_title TEXT,
  created_by_user_id TEXT,
  resource_link_id TEXT,
  created_at TEXT NOT NULL,
  bound_at TEXT,
  UNIQUE (deployment_record_id, resource_link_id)
);

CREATE INDEX IF NOT EXISTS reviewed_placements_deployment_context_idx
  ON reviewed_placements (deployment_record_id, context_id);

CREATE TABLE IF NOT EXISTS preview_sessions (
  session_id TEXT PRIMARY KEY,
  package_version_id INTEGER NOT NULL REFERENCES package_versions (id) ON DELETE CASCADE,
  app_id TEXT NOT NULL,
  package_version TEXT NOT NULL,
  package_title TEXT NOT NULL,
  origin TEXT NOT NULL CHECK (
    origin IN ('adminTestLaunch', 'deepLinkingAuthoring', 'adminAuthoringDraft')
  ),
  content_path TEXT NOT NULL,
  deep_linking_session_id TEXT REFERENCES deep_linking_sessions (session_id) ON DELETE SET NULL,
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

CREATE TABLE IF NOT EXISTS lantern_settings (
  singleton INTEGER PRIMARY KEY DEFAULT 1 CHECK (singleton = 1),
  default_lti_profile TEXT NOT NULL CHECK (
    default_lti_profile IN ('certification', 'governedCompatibility')
  ),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO lantern_settings (
  singleton,
  default_lti_profile
) VALUES (
  1,
  'governedCompatibility'
)
ON CONFLICT (singleton) DO NOTHING;

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
