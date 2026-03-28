CREATE TABLE IF NOT EXISTS attempts (
  id bigserial PRIMARY KEY,
  attempt_id text NOT NULL UNIQUE,
  deployment_record_id bigint NOT NULL REFERENCES deployments (id) ON DELETE CASCADE,
  deployment_slug text NOT NULL,
  app_id text NOT NULL,
  package_version_id bigint NOT NULL REFERENCES package_versions (id),
  package_version text NOT NULL,
  user_id text NOT NULL,
  user_role text NOT NULL CHECK (user_role IN ('learner', 'instructor')),
  context_id text NOT NULL,
  resource_link_id text NOT NULL,
  activity_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('in_progress', 'completed', 'abandoned')),
  completion_state text CHECK (completion_state IN ('completed', 'abandoned')),
  started_at timestamptz NOT NULL,
  finalized_at timestamptz
);

CREATE INDEX IF NOT EXISTS attempts_deployment_record_id_idx
  ON attempts (deployment_record_id);

ALTER TABLE runtime_sessions
  ADD COLUMN IF NOT EXISTS attempt_id text;

ALTER TABLE runtime_sessions
  ADD COLUMN IF NOT EXISTS ags_scope text[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE runtime_sessions
  ADD COLUMN IF NOT EXISTS ags_lineitems_url text;

ALTER TABLE runtime_sessions
  ADD COLUMN IF NOT EXISTS ags_lineitem_url text;

ALTER TABLE runtime_sessions
  ADD COLUMN IF NOT EXISTS nrps_context_memberships_url text;

ALTER TABLE runtime_sessions
  ADD COLUMN IF NOT EXISTS nrps_service_versions text[] NOT NULL DEFAULT '{}'::text[];

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

CREATE TABLE IF NOT EXISTS attempt_events (
  id bigserial PRIMARY KEY,
  attempt_id text NOT NULL REFERENCES attempts (attempt_id) ON DELETE CASCADE,
  sequence integer NOT NULL,
  event_type text NOT NULL,
  event jsonb NOT NULL,
  received_at timestamptz NOT NULL,
  UNIQUE (attempt_id, sequence)
);

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
);

CREATE TABLE IF NOT EXISTS grade_publications (
  id bigserial PRIMARY KEY,
  attempt_id text NOT NULL REFERENCES attempts (attempt_id) ON DELETE CASCADE,
  line_item_binding_id bigint NOT NULL REFERENCES line_item_bindings (id) ON DELETE CASCADE,
  line_item_url text NOT NULL,
  platform_user_id text NOT NULL,
  score_given numeric NOT NULL,
  score_maximum numeric NOT NULL,
  activity_progress text NOT NULL CHECK (
    activity_progress IN ('Completed', 'InProgress', 'Initialized')
  ),
  grading_progress text NOT NULL CHECK (
    grading_progress IN ('Pending', 'PendingManual', 'FullyGraded', 'Failed')
  ),
  status text NOT NULL CHECK (status IN ('pending', 'published', 'failed')),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  published_at timestamptz,
  error_code text,
  error_detail jsonb,
  UNIQUE (attempt_id)
);

CREATE TABLE IF NOT EXISTS audit_events (
  id bigserial PRIMARY KEY,
  event_type text NOT NULL,
  actor_type text NOT NULL CHECK (actor_type IN ('user', 'system', 'platform')),
  actor_id text,
  deployment_record_id bigint REFERENCES deployments (id) ON DELETE SET NULL,
  package_version_id bigint REFERENCES package_versions (id) ON DELETE SET NULL,
  attempt_id text REFERENCES attempts (attempt_id) ON DELETE SET NULL,
  line_item_binding_id bigint REFERENCES line_item_bindings (id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('accepted', 'succeeded', 'failed')),
  summary text NOT NULL,
  detail jsonb NOT NULL,
  occurred_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS audit_events_attempt_id_occurred_at_idx
  ON audit_events (attempt_id, occurred_at, id);
