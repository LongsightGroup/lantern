export const PACKAGE_REVIEW_OPS_SCHEMA_STATEMENTS = [
  `
    CREATE TABLE IF NOT EXISTS attempts (
      id bigserial PRIMARY KEY,
      attempt_id text NOT NULL UNIQUE,
      deployment_record_id bigint NOT NULL REFERENCES deployments (id) ON DELETE CASCADE,
      deployment_slug text NOT NULL,
      app_id text NOT NULL,
      package_version_id bigint NOT NULL REFERENCES package_versions (id),
      package_version text NOT NULL,
      user_id text NOT NULL,
      user_display_name text,
      user_email text,
      user_login text,
      user_role text NOT NULL,
      context_id text NOT NULL,
      resource_link_id text NOT NULL,
      activity_id text NOT NULL,
      status text NOT NULL,
      completion_state text,
      local_state jsonb,
      started_at timestamptz NOT NULL,
      finalized_at timestamptz
    )
  `,
  `
    ALTER TABLE attempts
      ADD COLUMN IF NOT EXISTS user_display_name text,
      ADD COLUMN IF NOT EXISTS user_email text,
      ADD COLUMN IF NOT EXISTS user_login text,
      ADD COLUMN IF NOT EXISTS local_state jsonb
  `,
  `
    CREATE TABLE IF NOT EXISTS attempt_events (
      id bigserial PRIMARY KEY,
      attempt_id text NOT NULL REFERENCES attempts (attempt_id) ON DELETE CASCADE,
      sequence integer NOT NULL,
      event_type text NOT NULL,
      event jsonb NOT NULL,
      received_at timestamptz NOT NULL,
      UNIQUE (attempt_id, sequence)
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS line_item_bindings (
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
  `,
  `
    CREATE TABLE IF NOT EXISTS grade_publications (
      id bigserial PRIMARY KEY,
      attempt_id text NOT NULL REFERENCES attempts (attempt_id) ON DELETE CASCADE,
      line_item_binding_id bigint NOT NULL REFERENCES line_item_bindings (id) ON DELETE CASCADE,
      line_item_url text NOT NULL,
      platform_user_id text NOT NULL,
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
  `,
  `
    CREATE TABLE IF NOT EXISTS audit_events (
      id bigserial PRIMARY KEY,
      event_type text NOT NULL,
      actor_type text NOT NULL,
      actor_id text,
      deployment_record_id bigint REFERENCES deployments (id) ON DELETE SET NULL,
      package_version_id bigint REFERENCES package_versions (id) ON DELETE SET NULL,
      attempt_id text REFERENCES attempts (attempt_id) ON DELETE SET NULL,
      line_item_binding_id bigint REFERENCES line_item_bindings (id) ON DELETE SET NULL,
      status text NOT NULL,
      summary text NOT NULL,
      detail jsonb NOT NULL,
      occurred_at timestamptz NOT NULL
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS broker_verification_runs (
      id bigserial PRIMARY KEY,
      deployment_record_id bigint REFERENCES deployments (id) ON DELETE SET NULL,
      scope text NOT NULL,
      workflow_key text,
      source text NOT NULL,
      status text NOT NULL,
      summary text NOT NULL,
      detail_url text,
      certification_state text,
      checked_at timestamptz NOT NULL
    )
  `,
  `
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
  `,
  `
    ALTER TABLE broker_verification_runs
      ADD COLUMN IF NOT EXISTS workflow_key text
  `,
  `
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'broker_verification_runs_workflow_key_check'
      ) THEN
        ALTER TABLE broker_verification_runs
          ADD CONSTRAINT broker_verification_runs_workflow_key_check
          CHECK (
            workflow_key IS NULL OR
            workflow_key IN ('core', 'deepLinking', 'nrps', 'ags')
          );
      END IF;
    END $$;
  `,
  `
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
  `,
  `
    CREATE INDEX IF NOT EXISTS runtime_sessions_attempt_lookup_idx
      ON runtime_sessions (attempt_id, created_at DESC)
  `,
  `
    CREATE INDEX IF NOT EXISTS audit_events_deployment_occurred_at_idx
      ON audit_events (deployment_record_id, occurred_at DESC)
  `,
  `
    CREATE INDEX IF NOT EXISTS grade_publications_status_updated_at_idx
      ON grade_publications (status, updated_at DESC)
  `,
  `
    CREATE INDEX IF NOT EXISTS broker_verification_runs_scope_source_checked_at_idx
      ON broker_verification_runs (scope, source, checked_at DESC)
  `,
  `
    CREATE INDEX IF NOT EXISTS broker_verification_runs_workflow_key_source_checked_at_idx
      ON broker_verification_runs (workflow_key, source, checked_at DESC, id DESC)
  `,
];

export const PACKAGE_REVIEW_RESET_SQL =
  'TRUNCATE TABLE broker_verification_runs, audit_events, grade_publications, line_item_bindings, attempt_events, attempts, preview_evidence, preview_sessions, reviewed_placements, deep_linking_sessions, runtime_sessions, lti_login_states, deployments, package_versions RESTART IDENTITY CASCADE';
