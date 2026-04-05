ALTER TABLE attempts
  ADD COLUMN IF NOT EXISTS local_state jsonb;
