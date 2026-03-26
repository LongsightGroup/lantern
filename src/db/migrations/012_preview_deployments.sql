ALTER TABLE deployments
  DROP CONSTRAINT IF EXISTS deployments_lms_type_check;

ALTER TABLE deployments
  ADD CONSTRAINT deployments_lms_type_check
  CHECK (lms_type IN ('canvas', 'moodle', 'sakai', 'preview'));
