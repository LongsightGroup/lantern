CREATE TABLE IF NOT EXISTS app_generation_workspaces (
  generation_id TEXT PRIMARY KEY REFERENCES app_generation_runs (generation_id) ON DELETE CASCADE,
  selected_starter_id TEXT NOT NULL CHECK (
    selected_starter_id IN ('simple-activity', 'browser-autograder')
  ),
  files_json TEXT NOT NULL CHECK (json_valid(files_json)),
  validation_findings_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(validation_findings_json)),
  repair_attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (repair_attempt_count >= 0),
  updated_at TEXT NOT NULL
);
