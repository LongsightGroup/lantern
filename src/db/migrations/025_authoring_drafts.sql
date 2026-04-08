CREATE TABLE IF NOT EXISTS authoring_drafts (
  draft_id text PRIMARY KEY,
  package_version_id bigint NOT NULL UNIQUE REFERENCES package_versions (id) ON DELETE CASCADE,
  app_id text NOT NULL,
  package_version text NOT NULL,
  package_title text NOT NULL,
  authoring_kind text NOT NULL CHECK (authoring_kind = 'browser_autograder'),
  authoring_paths jsonb NOT NULL CHECK (jsonb_typeof(authoring_paths) = 'array'),
  base_snapshot_root text NOT NULL,
  latest_prompt_text text,
  latest_generation_notes jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(latest_generation_notes) = 'array'),
  saved_source text NOT NULL DEFAULT 'manual' CHECK (saved_source IN ('manual', 'ai')),
  last_previewed_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS authoring_draft_files (
  draft_id text NOT NULL REFERENCES authoring_drafts (draft_id) ON DELETE CASCADE,
  relative_path text NOT NULL,
  contents text NOT NULL,
  sequence integer NOT NULL CHECK (sequence > 0),
  PRIMARY KEY (draft_id, relative_path)
);

CREATE INDEX IF NOT EXISTS authoring_draft_files_draft_sequence_idx
  ON authoring_draft_files (draft_id, sequence ASC, relative_path ASC);
