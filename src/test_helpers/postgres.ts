import { Pool } from "@db/postgres";

const TEST_POOL_SIZE = 1;

const CREATE_PACKAGE_VERSIONS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS package_versions (
    id bigserial PRIMARY KEY,
    app_id text NOT NULL,
    version text NOT NULL,
    title text NOT NULL,
    description text,
    owner_type text NOT NULL,
    owner_id text NOT NULL,
    entrypoint text NOT NULL,
    roles text[] NOT NULL,
    install_scope text NOT NULL,
    capabilities text[] NOT NULL,
    grading_mode text NOT NULL,
    grading_rubric_file text,
    grading_max_score integer,
    approval_status text NOT NULL,
    review_notes text,
    reviewed_at timestamptz,
    validation_issues jsonb NOT NULL DEFAULT '[]'::jsonb,
    manifest_json jsonb NOT NULL,
    artifact_root text NOT NULL,
    artifact_digest text NOT NULL,
    imported_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (app_id, version)
  )
`;

const CREATE_DEPLOYMENTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS deployments (
    id bigserial PRIMARY KEY,
    slug text NOT NULL UNIQUE,
    label text NOT NULL,
    app_id text NOT NULL,
    enabled_package_version_id bigint REFERENCES package_versions (id),
    canvas_environment text,
    issuer text,
    client_id text,
    deployment_id text,
    updated_at timestamptz NOT NULL DEFAULT now()
  )
`;

const CREATE_LTI_LOGIN_STATES_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS lti_login_states (
    state text PRIMARY KEY,
    canvas_environment text NOT NULL,
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
  )
`;

const CREATE_RUNTIME_SESSIONS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS runtime_sessions (
    session_id text PRIMARY KEY,
    session_token text NOT NULL UNIQUE,
    attempt_id text,
    deployment_record_id bigint NOT NULL REFERENCES deployments (id) ON DELETE CASCADE,
    deployment_slug text NOT NULL,
    app_id text NOT NULL,
    package_version_id bigint NOT NULL REFERENCES package_versions (id),
    package_version text NOT NULL,
    capabilities text[] NOT NULL,
    snapshot_root text NOT NULL,
    entrypoint_path text NOT NULL,
    content_path text NOT NULL,
    ags_scope text[] NOT NULL DEFAULT '{}'::text[],
    ags_lineitems_url text,
    ags_lineitem_url text,
    nrps_context_memberships_url text,
    nrps_service_versions text[] NOT NULL DEFAULT '{}'::text[],
    launch_user_role text NOT NULL,
    launch_course_id text NOT NULL,
    launch_assignment_id text,
    launch_activity_id text NOT NULL,
    created_at timestamptz NOT NULL,
    expires_at timestamptz NOT NULL
  )
`;

const CREATE_ATTEMPTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS attempts (
    id bigserial PRIMARY KEY,
    attempt_id text NOT NULL UNIQUE,
    deployment_record_id bigint NOT NULL REFERENCES deployments (id) ON DELETE CASCADE,
    deployment_slug text NOT NULL,
    app_id text NOT NULL,
    package_version_id bigint NOT NULL REFERENCES package_versions (id),
    package_version text NOT NULL,
    user_id text NOT NULL,
    user_role text NOT NULL,
    context_id text NOT NULL,
    resource_link_id text NOT NULL,
    activity_id text NOT NULL,
    status text NOT NULL,
    completion_state text,
    started_at timestamptz NOT NULL,
    finalized_at timestamptz
  )
`;

const CREATE_ATTEMPT_EVENTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS attempt_events (
    id bigserial PRIMARY KEY,
    attempt_id text NOT NULL REFERENCES attempts (attempt_id) ON DELETE CASCADE,
    sequence integer NOT NULL,
    event_type text NOT NULL,
    event jsonb NOT NULL,
    received_at timestamptz NOT NULL,
    UNIQUE (attempt_id, sequence)
  )
`;

const CREATE_CANVAS_LINE_ITEM_BINDINGS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS canvas_line_item_bindings (
    id bigserial PRIMARY KEY,
    deployment_record_id bigint NOT NULL REFERENCES deployments (id) ON DELETE CASCADE,
    package_version_id bigint NOT NULL REFERENCES package_versions (id),
    context_id text NOT NULL,
    resource_link_id text NOT NULL,
    activity_id text NOT NULL,
    line_items_url text NOT NULL,
    line_item_url text NOT NULL UNIQUE,
    resource_id text NOT NULL,
    tag text NOT NULL,
    label text NOT NULL,
    score_maximum integer NOT NULL,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    UNIQUE (
      deployment_record_id,
      package_version_id,
      context_id,
      resource_link_id,
      activity_id
    )
  )
`;

const CREATE_GRADE_PUBLICATIONS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS grade_publications (
    id bigserial PRIMARY KEY,
    attempt_id text NOT NULL REFERENCES attempts (attempt_id) ON DELETE CASCADE,
    line_item_binding_id bigint NOT NULL REFERENCES canvas_line_item_bindings (id) ON DELETE CASCADE,
    line_item_url text NOT NULL,
    canvas_user_id text NOT NULL,
    score_given numeric NOT NULL,
    score_maximum numeric NOT NULL,
    activity_progress text NOT NULL,
    grading_progress text NOT NULL,
    status text NOT NULL,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    published_at timestamptz,
    error_code text,
    error_detail jsonb
  )
`;

const CREATE_AUDIT_EVENTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS audit_events (
    id bigserial PRIMARY KEY,
    event_type text NOT NULL,
    actor_type text NOT NULL,
    actor_id text,
    deployment_record_id bigint REFERENCES deployments (id) ON DELETE SET NULL,
    package_version_id bigint REFERENCES package_versions (id) ON DELETE SET NULL,
    attempt_id text REFERENCES attempts (attempt_id) ON DELETE SET NULL,
    line_item_binding_id bigint REFERENCES canvas_line_item_bindings (id) ON DELETE SET NULL,
    status text NOT NULL,
    summary text NOT NULL,
    detail jsonb NOT NULL,
    occurred_at timestamptz NOT NULL
  )
`;

const CREATE_BROKER_VERIFICATION_RUNS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS broker_verification_runs (
    id bigserial PRIMARY KEY,
    deployment_record_id bigint REFERENCES deployments (id) ON DELETE SET NULL,
    scope text NOT NULL,
    source text NOT NULL,
    status text NOT NULL,
    summary text NOT NULL,
    detail_url text,
    certification_state text,
    checked_at timestamptz NOT NULL
  )
`;

const NORMALIZE_BROKER_VERIFICATION_RUNS_TABLE_SQL = `
  DO $$
  BEGIN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'broker_verification_runs'
        AND column_name = 'supported_path'
    ) THEN
      ALTER TABLE broker_verification_runs
        RENAME COLUMN supported_path TO scope;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'broker_verification_runs'
        AND column_name = 'evidence_url'
    ) THEN
      ALTER TABLE broker_verification_runs
        RENAME COLUMN evidence_url TO detail_url;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'broker_verification_runs'
        AND column_name = 'official_certification_state'
    ) THEN
      ALTER TABLE broker_verification_runs
        RENAME COLUMN official_certification_state TO certification_state;
    END IF;
  END $$;

  ALTER TABLE broker_verification_runs
    ALTER COLUMN certification_state DROP NOT NULL;
`;

const CREATE_RUNTIME_SESSIONS_ATTEMPT_LOOKUP_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS runtime_sessions_attempt_lookup_idx
    ON runtime_sessions (attempt_id, created_at DESC)
`;

const CREATE_AUDIT_EVENTS_DEPLOYMENT_OCCURRED_AT_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS audit_events_deployment_occurred_at_idx
    ON audit_events (deployment_record_id, occurred_at DESC)
`;

const CREATE_GRADE_PUBLICATIONS_STATUS_UPDATED_AT_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS grade_publications_status_updated_at_idx
    ON grade_publications (status, updated_at DESC)
`;

const CREATE_BROKER_VERIFICATION_RUNS_PATH_CHECKED_AT_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS broker_verification_runs_scope_source_checked_at_idx
    ON broker_verification_runs (scope, source, checked_at DESC)
`;

const ADD_RUNTIME_SESSION_ATTEMPT_FK_SQL = `
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'runtime_sessions_attempt_id_fkey'
    ) THEN
      ALTER TABLE runtime_sessions
        ADD CONSTRAINT runtime_sessions_attempt_id_fkey
        FOREIGN KEY (attempt_id)
        REFERENCES attempts (attempt_id)
        ON DELETE SET NULL;
    END IF;
  END $$;
`;

export function requireTestDatabaseUrl(): string {
  const databaseUrl = Deno.env.get("DATABASE_URL");

  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is required for Postgres-backed package review tests.",
    );
  }

  return databaseUrl;
}

export function createTestDatabasePool(): Pool {
  return new Pool(requireTestDatabaseUrl(), TEST_POOL_SIZE, true);
}

export async function bootstrapPackageReviewSchema(
  pool: Pool,
): Promise<void> {
  const client = await pool.connect();

  try {
    await client.queryArray(CREATE_PACKAGE_VERSIONS_TABLE_SQL);
    await client.queryArray(CREATE_DEPLOYMENTS_TABLE_SQL);
    await client.queryArray(CREATE_LTI_LOGIN_STATES_TABLE_SQL);
    await client.queryArray(CREATE_RUNTIME_SESSIONS_TABLE_SQL);
    await client.queryArray(CREATE_ATTEMPTS_TABLE_SQL);
    await client.queryArray(CREATE_ATTEMPT_EVENTS_TABLE_SQL);
    await client.queryArray(CREATE_CANVAS_LINE_ITEM_BINDINGS_TABLE_SQL);
    await client.queryArray(CREATE_GRADE_PUBLICATIONS_TABLE_SQL);
    await client.queryArray(CREATE_AUDIT_EVENTS_TABLE_SQL);
    await client.queryArray(CREATE_BROKER_VERIFICATION_RUNS_TABLE_SQL);
    await client.queryArray(NORMALIZE_BROKER_VERIFICATION_RUNS_TABLE_SQL);
    await client.queryArray(ADD_RUNTIME_SESSION_ATTEMPT_FK_SQL);
    await client.queryArray(CREATE_RUNTIME_SESSIONS_ATTEMPT_LOOKUP_INDEX_SQL);
    await client.queryArray(
      CREATE_AUDIT_EVENTS_DEPLOYMENT_OCCURRED_AT_INDEX_SQL,
    );
    await client.queryArray(
      CREATE_GRADE_PUBLICATIONS_STATUS_UPDATED_AT_INDEX_SQL,
    );
    await client.queryArray(
      CREATE_BROKER_VERIFICATION_RUNS_PATH_CHECKED_AT_INDEX_SQL,
    );
  } finally {
    client.release();
  }
}

export async function resetPackageReviewTables(pool: Pool): Promise<void> {
  const client = await pool.connect();

  try {
    await client.queryArray("BEGIN");
    await client.queryArray(
      "TRUNCATE TABLE broker_verification_runs, audit_events, grade_publications, canvas_line_item_bindings, attempt_events, attempts, runtime_sessions, lti_login_states, deployments, package_versions RESTART IDENTITY CASCADE",
    );
    await client.queryArray("COMMIT");
  } catch (error) {
    await client.queryArray("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function withPackageReviewTestDatabase<T>(
  run: (pool: Pool) => Promise<T>,
): Promise<T> {
  const pool = createTestDatabasePool();

  try {
    await bootstrapPackageReviewSchema(pool);
    await resetPackageReviewTables(pool);
    return await run(pool);
  } finally {
    await pool.end();
  }
}
