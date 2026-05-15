CREATE TABLE IF NOT EXISTS app_generation_runs (
  generation_id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN (
      'started',
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
