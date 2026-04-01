ALTER TABLE broker_verification_runs
  ADD COLUMN IF NOT EXISTS workflow_key text;

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

CREATE INDEX IF NOT EXISTS broker_verification_runs_workflow_key_source_checked_at_idx
  ON broker_verification_runs (workflow_key, source, checked_at DESC, id DESC);
