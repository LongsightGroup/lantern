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
);

CREATE INDEX IF NOT EXISTS reviewed_placements_deployment_context_idx
  ON reviewed_placements (deployment_record_id, context_id);
