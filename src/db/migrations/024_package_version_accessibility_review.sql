ALTER TABLE package_versions
  ADD COLUMN IF NOT EXISTS accessibility_review jsonb;
