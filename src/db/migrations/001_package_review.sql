CREATE TABLE IF NOT EXISTS package_versions (
  id bigserial PRIMARY KEY,
  app_id text NOT NULL,
  version text NOT NULL,
  title text NOT NULL,
  description text,
  owner_type text NOT NULL CHECK (owner_type IN ('user')),
  owner_id text NOT NULL,
  entrypoint text NOT NULL,
  roles text[] NOT NULL,
  install_scope text NOT NULL CHECK (install_scope IN ('course', 'assignment')),
  capabilities text[] NOT NULL,
  grading_mode text NOT NULL CHECK (
    grading_mode IN ('declarative', 'manual', 'completion')
  ),
  grading_rubric_file text,
  grading_max_score integer,
  approval_status text NOT NULL CHECK (
    approval_status IN ('pending', 'approved', 'rejected')
  ),
  review_notes text,
  reviewed_at timestamptz,
  validation_issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  manifest_json jsonb NOT NULL,
  artifact_root text NOT NULL,
  artifact_digest text NOT NULL,
  runtime_contract jsonb NOT NULL,
  runtime_contract_signature text NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (app_id, version)
);

CREATE TABLE IF NOT EXISTS deployments (
  id bigserial PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  label text NOT NULL,
  app_id text NOT NULL,
  enabled_package_version_id bigint REFERENCES package_versions (id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
