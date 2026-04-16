ALTER TABLE package_versions
  DROP CONSTRAINT IF EXISTS package_versions_grading_mode_check;

ALTER TABLE package_versions
  ADD CONSTRAINT package_versions_grading_mode_check
  CHECK (
    grading_mode IN ('declarative', 'manual', 'completion', 'browser')
  );
