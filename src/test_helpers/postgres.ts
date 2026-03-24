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
    deployment_record_id bigint NOT NULL REFERENCES deployments (id) ON DELETE CASCADE,
    deployment_slug text NOT NULL,
    app_id text NOT NULL,
    package_version_id bigint NOT NULL REFERENCES package_versions (id),
    package_version text NOT NULL,
    capabilities text[] NOT NULL,
    snapshot_root text NOT NULL,
    entrypoint_path text NOT NULL,
    content_path text NOT NULL,
    launch_user_role text NOT NULL,
    launch_course_id text NOT NULL,
    launch_assignment_id text,
    launch_activity_id text NOT NULL,
    created_at timestamptz NOT NULL,
    expires_at timestamptz NOT NULL
  )
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
  } finally {
    client.release();
  }
}

export async function resetPackageReviewTables(pool: Pool): Promise<void> {
  const client = await pool.connect();

  try {
    await client.queryArray("BEGIN");
    await client.queryArray(
      "TRUNCATE TABLE runtime_sessions, lti_login_states, deployments, package_versions RESTART IDENTITY CASCADE",
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
