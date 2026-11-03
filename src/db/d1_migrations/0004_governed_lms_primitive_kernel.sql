CREATE TABLE IF NOT EXISTS institutions (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS institution_memberships (
  institution_id TEXT NOT NULL REFERENCES institutions (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES auth_users (id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'auditor')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (institution_id, user_id),
  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS institution_memberships_user_idx
  ON institution_memberships (user_id, institution_id);

CREATE TABLE IF NOT EXISTS institution_invites (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'auditor')),
  created_by_user_id TEXT NOT NULL REFERENCES auth_users (id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  accepted_by_user_id TEXT REFERENCES auth_users (id),
  accepted_at TEXT,
  acceptance_trace_id TEXT UNIQUE
);

CREATE INDEX IF NOT EXISTS institution_invites_expiry_idx
  ON institution_invites (expires_at);

CREATE TABLE IF NOT EXISTS lms_connections (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions (id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  platform_type TEXT NOT NULL CHECK (
    platform_type IN ('canvas', 'moodle', 'brightspace', 'sakai', 'synthetic')
  ),
  issuer TEXT NOT NULL,
  lms_origin TEXT NOT NULL,
  client_id TEXT NOT NULL,
  deployment_id TEXT NOT NULL,
  authorization_endpoint TEXT NOT NULL,
  access_token_url TEXT NOT NULL,
  jwks_url TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'disabled')),
  validated_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (institution_id, issuer, client_id, deployment_id),
  UNIQUE (issuer, client_id, deployment_id)
);

CREATE INDEX IF NOT EXISTS lms_connections_institution_idx
  ON lms_connections (institution_id, status, label);

CREATE TABLE IF NOT EXISTS lms_contexts (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions (id) ON DELETE CASCADE,
  lms_connection_id TEXT NOT NULL REFERENCES lms_connections (id) ON DELETE CASCADE,
  provider_context_id TEXT NOT NULL,
  label TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (lms_connection_id, provider_context_id)
);

CREATE INDEX IF NOT EXISTS lms_contexts_institution_idx
  ON lms_contexts (institution_id, lms_connection_id);

CREATE TABLE IF NOT EXISTS app_installations (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions (id) ON DELETE CASCADE,
  app_id TEXT NOT NULL,
  package_version_id INTEGER NOT NULL REFERENCES package_versions (id),
  status TEXT NOT NULL CHECK (status IN ('pending_approval', 'active', 'disabled')),
  installed_by_user_id TEXT NOT NULL REFERENCES auth_users (id),
  installed_at TEXT NOT NULL,
  activated_at TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE (institution_id, app_id)
);

CREATE INDEX IF NOT EXISTS app_installations_institution_idx
  ON app_installations (institution_id, status, app_id);

CREATE TABLE IF NOT EXISTS capability_grants (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions (id) ON DELETE CASCADE,
  app_installation_id TEXT NOT NULL REFERENCES app_installations (id) ON DELETE CASCADE,
  package_version_id INTEGER NOT NULL REFERENCES package_versions (id),
  capability TEXT NOT NULL CHECK (
    capability IN (
      'lms.roster.members.read',
      'lms.roster.contact.read',
      'lms.roster.profile_photo.read'
    )
  ),
  scope_kind TEXT NOT NULL CHECK (scope_kind IN ('institution', 'context')),
  lms_context_id TEXT REFERENCES lms_contexts (id) ON DELETE CASCADE,
  approved_by_user_id TEXT NOT NULL REFERENCES auth_users (id),
  approved_at TEXT NOT NULL,
  revoked_by_user_id TEXT REFERENCES auth_users (id),
  revoked_at TEXT,
  CHECK (
    (scope_kind = 'institution' AND lms_context_id IS NULL) OR
    (scope_kind = 'context' AND lms_context_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS capability_grants_unique_idx
  ON capability_grants (
    app_installation_id,
    package_version_id,
    capability,
    scope_kind,
    IFNULL(lms_context_id, '')
  );

CREATE INDEX IF NOT EXISTS capability_grants_authorization_idx
  ON capability_grants (
    institution_id,
    app_installation_id,
    package_version_id,
    capability,
    revoked_at
  );

-- LMS launch plane. governed_runtime_sessions is the ONLY runtime session store
-- for governed LMS launches (minted by lms_kernel). The preview/authoring plane
-- uses runtime_sessions in 0001_initial_schema.sql; do not mix the two.
CREATE TABLE IF NOT EXISTS governed_runtime_sessions (
  runtime_session_id TEXT PRIMARY KEY,
  runtime_session_token TEXT NOT NULL UNIQUE,
  launch_trace_id TEXT NOT NULL,
  runtime_expires_at TEXT NOT NULL,
  institution_id TEXT NOT NULL REFERENCES institutions (id) ON DELETE CASCADE,
  lms_connection_id TEXT NOT NULL REFERENCES lms_connections (id) ON DELETE CASCADE,
  lms_context_id TEXT NOT NULL REFERENCES lms_contexts (id) ON DELETE CASCADE,
  app_installation_id TEXT NOT NULL REFERENCES app_installations (id) ON DELETE CASCADE,
  app_id TEXT NOT NULL,
  package_version_id INTEGER NOT NULL REFERENCES package_versions (id),
  package_version TEXT NOT NULL,
  package_capabilities TEXT NOT NULL CHECK (json_valid(package_capabilities)),
  actor_subject_id TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('instructor', 'administrator')),
  lti_tool_session_id TEXT,
  nrps_context_memberships_url TEXT,
  nrps_service_versions TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(nrps_service_versions)),
  connector_kind TEXT NOT NULL CHECK (connector_kind IN ('nrps', 'synthetic')),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS governed_runtime_sessions_authorization_idx
  ON governed_runtime_sessions (
    institution_id,
    app_installation_id,
    lms_context_id,
    runtime_session_id
  );

CREATE TABLE IF NOT EXISTS subject_identities (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions (id) ON DELETE CASCADE,
  lms_connection_id TEXT NOT NULL REFERENCES lms_connections (id) ON DELETE CASCADE,
  provider_subject_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  UNIQUE (lms_connection_id, provider_subject_id)
);

CREATE TABLE IF NOT EXISTS roster_continuations (
  id TEXT PRIMARY KEY,
  runtime_session_id TEXT NOT NULL REFERENCES governed_runtime_sessions (runtime_session_id)
    ON DELETE CASCADE,
  app_installation_id TEXT NOT NULL REFERENCES app_installations (id) ON DELETE CASCADE,
  package_version_id INTEGER NOT NULL REFERENCES package_versions (id),
  connector_kind TEXT NOT NULL CHECK (connector_kind IN ('nrps', 'synthetic')),
  continuation_value TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS roster_continuations_expiry_idx
  ON roster_continuations (expires_at);

CREATE TABLE IF NOT EXISTS protected_media_refs (
  id TEXT PRIMARY KEY,
  trace_id TEXT NOT NULL,
  institution_id TEXT NOT NULL REFERENCES institutions (id) ON DELETE CASCADE,
  lms_connection_id TEXT NOT NULL REFERENCES lms_connections (id) ON DELETE CASCADE,
  lms_context_id TEXT NOT NULL REFERENCES lms_contexts (id) ON DELETE CASCADE,
  runtime_session_id TEXT NOT NULL REFERENCES governed_runtime_sessions (runtime_session_id)
    ON DELETE CASCADE,
  app_installation_id TEXT NOT NULL REFERENCES app_installations (id) ON DELETE CASCADE,
  package_version_id INTEGER NOT NULL REFERENCES package_versions (id),
  subject_identity_id TEXT NOT NULL REFERENCES subject_identities (id) ON DELETE CASCADE,
  actor_subject_id TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('instructor', 'administrator')),
  connector_kind TEXT NOT NULL CHECK (connector_kind IN ('nrps', 'synthetic')),
  source_url TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS protected_media_refs_expiry_idx
  ON protected_media_refs (expires_at);

CREATE TABLE IF NOT EXISTS governance_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trace_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  institution_id TEXT REFERENCES institutions (id) ON DELETE SET NULL,
  lms_connection_id TEXT REFERENCES lms_connections (id) ON DELETE SET NULL,
  lms_context_id TEXT REFERENCES lms_contexts (id) ON DELETE SET NULL,
  app_installation_id TEXT REFERENCES app_installations (id) ON DELETE SET NULL,
  app_id TEXT,
  package_version_id INTEGER REFERENCES package_versions (id) ON DELETE SET NULL,
  runtime_session_id TEXT REFERENCES governed_runtime_sessions (runtime_session_id)
    ON DELETE SET NULL,
  actor_type TEXT NOT NULL CHECK (
    actor_type IN ('user', 'instructor', 'administrator', 'system', 'app')
  ),
  actor_id TEXT,
  capability TEXT,
  capability_grant_id TEXT REFERENCES capability_grants (id) ON DELETE SET NULL,
  decision TEXT CHECK (decision IS NULL OR decision IN ('allowed', 'denied')),
  outcome TEXT NOT NULL CHECK (outcome IN ('completed', 'failed', 'limited')),
  connector_kind TEXT CHECK (
    connector_kind IS NULL OR connector_kind IN ('nrps', 'synthetic')
  ),
  object_count INTEGER CHECK (object_count IS NULL OR object_count >= 0),
  latency_ms INTEGER CHECK (latency_ms IS NULL OR latency_ms >= 0),
  error_code TEXT,
  request_metadata TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(request_metadata)),
  occurred_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS governance_events_trace_idx
  ON governance_events (trace_id, occurred_at, id);

CREATE INDEX IF NOT EXISTS governance_events_search_idx
  ON governance_events (
    institution_id,
    app_installation_id,
    capability,
    decision,
    outcome,
    occurred_at DESC
  );

CREATE TRIGGER IF NOT EXISTS lms_contexts_tenant_guard
BEFORE INSERT ON lms_contexts
WHEN NOT EXISTS (
  SELECT 1 FROM lms_connections
  WHERE id = NEW.lms_connection_id
    AND institution_id = NEW.institution_id
)
BEGIN
  SELECT RAISE(ABORT, 'lms_context tenant mismatch');
END;

CREATE TRIGGER IF NOT EXISTS capability_grants_boundary_guard
BEFORE INSERT ON capability_grants
WHEN NOT EXISTS (
  SELECT 1 FROM app_installations
  WHERE id = NEW.app_installation_id
    AND institution_id = NEW.institution_id
    AND package_version_id = NEW.package_version_id
) OR (
  NEW.scope_kind = 'context' AND NOT EXISTS (
    SELECT 1 FROM lms_contexts
    WHERE id = NEW.lms_context_id
      AND institution_id = NEW.institution_id
  )
)
BEGIN
  SELECT RAISE(ABORT, 'capability grant boundary mismatch');
END;

CREATE TRIGGER IF NOT EXISTS governed_runtime_sessions_boundary_guard
BEFORE INSERT ON governed_runtime_sessions
WHEN NOT EXISTS (
  SELECT 1
  FROM lms_connections
  JOIN lms_contexts
    ON lms_contexts.lms_connection_id = lms_connections.id
  JOIN app_installations
    ON app_installations.institution_id = lms_connections.institution_id
  WHERE lms_connections.id = NEW.lms_connection_id
    AND lms_connections.institution_id = NEW.institution_id
    AND lms_contexts.id = NEW.lms_context_id
    AND lms_contexts.institution_id = NEW.institution_id
    AND app_installations.id = NEW.app_installation_id
    AND app_installations.app_id = NEW.app_id
    AND app_installations.package_version_id = NEW.package_version_id
)
BEGIN
  SELECT RAISE(ABORT, 'governed runtime session boundary mismatch');
END;

CREATE TRIGGER IF NOT EXISTS protected_media_refs_boundary_guard
BEFORE INSERT ON protected_media_refs
WHEN NOT EXISTS (
  SELECT 1
  FROM governed_runtime_sessions
  JOIN subject_identities
    ON subject_identities.id = NEW.subject_identity_id
  WHERE governed_runtime_sessions.runtime_session_id = NEW.runtime_session_id
    AND governed_runtime_sessions.institution_id = NEW.institution_id
    AND governed_runtime_sessions.lms_connection_id = NEW.lms_connection_id
    AND governed_runtime_sessions.lms_context_id = NEW.lms_context_id
    AND governed_runtime_sessions.app_installation_id = NEW.app_installation_id
    AND governed_runtime_sessions.package_version_id = NEW.package_version_id
    AND subject_identities.institution_id = NEW.institution_id
    AND subject_identities.lms_connection_id = NEW.lms_connection_id
)
BEGIN
  SELECT RAISE(ABORT, 'protected media boundary mismatch');
END;

CREATE TRIGGER IF NOT EXISTS governance_events_no_update
BEFORE UPDATE ON governance_events
BEGIN
  SELECT RAISE(ABORT, 'governance_events is append-only');
END;

CREATE TRIGGER IF NOT EXISTS governance_events_no_delete
BEFORE DELETE ON governance_events
BEGIN
  SELECT RAISE(ABORT, 'governance_events is append-only');
END;
