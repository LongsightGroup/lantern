export const PACKAGE_REVIEW_CORE_SCHEMA_STATEMENTS = [
  `
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
  `,
  `
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
  `,
  `
    ALTER TABLE deployments
      ADD COLUMN IF NOT EXISTS lms_type text,
      ADD COLUMN IF NOT EXISTS authorization_endpoint text,
      ADD COLUMN IF NOT EXISTS access_token_url text,
      ADD COLUMN IF NOT EXISTS jwks_url text
  `,
  `
    UPDATE deployments
    SET lms_type = 'canvas'
    WHERE lms_type IS NULL
  `,
  `
    ALTER TABLE deployments
      ALTER COLUMN lms_type SET DEFAULT 'canvas',
      ALTER COLUMN lms_type SET NOT NULL
  `,
  `
    DO $$
    BEGIN
      ALTER TABLE deployments
        DROP CONSTRAINT IF EXISTS deployments_lms_type_check;
      ALTER TABLE deployments
        ADD CONSTRAINT deployments_lms_type_check
        CHECK (lms_type IN ('canvas', 'moodle', 'sakai', 'preview'));
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `,
  `
    CREATE UNIQUE INDEX IF NOT EXISTS deployments_lti_binding_unique
      ON deployments (lms_type, issuer, client_id, deployment_id)
      WHERE issuer IS NOT NULL
        AND client_id IS NOT NULL
        AND deployment_id IS NOT NULL
  `,
  `
    CREATE UNIQUE INDEX IF NOT EXISTS deployments_app_lms_slot_unique
      ON deployments (app_id, lms_type)
  `,
  `
    CREATE TABLE IF NOT EXISTS lti_login_states (
      lms_type text NOT NULL CHECK (lms_type IN ('canvas', 'moodle', 'sakai')),
      state text PRIMARY KEY,
      canvas_environment text,
      issuer text NOT NULL,
      client_id text NOT NULL,
      deployment_id text NOT NULL,
      nonce text NOT NULL,
      login_hint text NOT NULL,
      target_link_uri text NOT NULL,
      lti_message_hint text,
      created_at timestamptz NOT NULL,
      expires_at timestamptz NOT NULL,
      used_at timestamptz,
      CHECK (
        (lms_type = 'canvas' AND canvas_environment IN ('production', 'beta', 'test'))
        OR (lms_type IN ('moodle', 'sakai') AND canvas_environment IS NULL)
      )
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS dynamic_registration_states (
      state text PRIMARY KEY,
      app_id text NOT NULL,
      lms_type text NOT NULL CHECK (lms_type IN ('canvas', 'moodle', 'sakai')),
      created_at timestamptz NOT NULL,
      expires_at timestamptz NOT NULL,
      used_at timestamptz
    )
  `,
  `
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
  `,
  `
    CREATE TABLE IF NOT EXISTS deep_linking_sessions (
      session_id text PRIMARY KEY,
      session_token text NOT NULL UNIQUE,
      deployment_record_id bigint NOT NULL REFERENCES deployments (id) ON DELETE CASCADE,
      deployment_slug text NOT NULL,
      app_id text NOT NULL,
      user_id text,
      user_role text NOT NULL,
      context_id text,
      context_title text,
      deep_link_return_url text NOT NULL,
      data text,
      placement text NOT NULL,
      accept_types text[] NOT NULL DEFAULT '{}'::text[],
      accept_multiple boolean NOT NULL DEFAULT false,
      accept_presentation_document_targets text[] NOT NULL DEFAULT '{}'::text[],
      accept_line_item boolean NOT NULL DEFAULT false,
      selected_package_version_id bigint REFERENCES package_versions (id) ON DELETE SET NULL,
      selected_package_version text,
      selected_activity_id text,
      selected_content_path text,
      created_at timestamptz NOT NULL,
      expires_at timestamptz NOT NULL,
      used_at timestamptz
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS reviewed_placements (
      placement_id text PRIMARY KEY,
      deployment_record_id bigint NOT NULL REFERENCES deployments (id) ON DELETE CASCADE,
      deployment_slug text NOT NULL,
      app_id text NOT NULL,
      context_id text,
      context_title text,
      package_version_id bigint NOT NULL REFERENCES package_versions (id),
      package_version text NOT NULL,
      package_title text NOT NULL,
      activity_id text NOT NULL,
      content_path text NOT NULL,
      content_title text,
      created_by_user_id text,
      resource_link_id text,
      created_at timestamptz NOT NULL,
      bound_at timestamptz,
      UNIQUE (deployment_record_id, resource_link_id)
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS preview_sessions (
      session_id text PRIMARY KEY,
      package_version_id bigint NOT NULL REFERENCES package_versions (id) ON DELETE CASCADE,
      app_id text NOT NULL,
      package_version text NOT NULL,
      package_title text NOT NULL,
      capabilities text[] NOT NULL,
      snapshot_root text NOT NULL,
      entrypoint_path text NOT NULL,
      launch_user_id text NOT NULL,
      launch_user_role text NOT NULL,
      launch_course_id text NOT NULL,
      launch_assignment_id text,
      launch_activity_id text NOT NULL,
      fake_attempt_id text NOT NULL,
      fake_score_maximum numeric NOT NULL,
      fixture_data jsonb NOT NULL,
      created_at timestamptz NOT NULL
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS preview_evidence (
      id bigserial PRIMARY KEY,
      preview_session_id text NOT NULL REFERENCES preview_sessions (session_id) ON DELETE CASCADE,
      sequence integer NOT NULL,
      event_type text NOT NULL,
      capability text,
      summary text NOT NULL,
      detail jsonb NOT NULL,
      occurred_at timestamptz NOT NULL,
      UNIQUE (preview_session_id, sequence)
    )
  `,
];
