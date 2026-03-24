CREATE TABLE IF NOT EXISTS broker_verification_runs (
  id bigserial PRIMARY KEY,
  deployment_record_id bigint REFERENCES deployments (id) ON DELETE SET NULL,
  scope text NOT NULL,
  source text NOT NULL,
  status text NOT NULL,
  summary text NOT NULL,
  detail_url text,
  certification_state text,
  checked_at timestamptz NOT NULL
);

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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'broker_verification_runs_source_check'
  ) THEN
    ALTER TABLE broker_verification_runs
      ADD CONSTRAINT broker_verification_runs_source_check
      CHECK (source IN ('manual', 'ci', '1edtech'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'broker_verification_runs_status_check'
  ) THEN
    ALTER TABLE broker_verification_runs
      ADD CONSTRAINT broker_verification_runs_status_check
      CHECK (status IN ('passed', 'failed', 'pending', 'notCertified'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'broker_verification_runs_certification_state_check'
  ) THEN
    ALTER TABLE broker_verification_runs
      ADD CONSTRAINT broker_verification_runs_certification_state_check
      CHECK (
        certification_state IS NULL OR
        certification_state IN (
          'ltiAdvantageCertified',
          'ltiAdvantageComplete'
        )
      );
  END IF;
END $$;

DROP INDEX IF EXISTS broker_verification_runs_path_checked_at_idx;

CREATE INDEX IF NOT EXISTS broker_verification_runs_scope_source_checked_at_idx
  ON broker_verification_runs (scope, source, checked_at DESC, id DESC);
