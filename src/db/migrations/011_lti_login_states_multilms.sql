ALTER TABLE lti_login_states
  ADD COLUMN IF NOT EXISTS lms_type text;

UPDATE lti_login_states
SET lms_type = 'canvas'
WHERE lms_type IS NULL;

ALTER TABLE lti_login_states
  ALTER COLUMN lms_type SET DEFAULT 'canvas',
  ALTER COLUMN lms_type SET NOT NULL,
  ALTER COLUMN canvas_environment DROP NOT NULL;

DO $$
BEGIN
  ALTER TABLE lti_login_states
    ADD CONSTRAINT lti_login_states_lms_type_check
    CHECK (lms_type IN ('canvas', 'moodle', 'sakai'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE lti_login_states
    ADD CONSTRAINT lti_login_states_binding_shape_check
    CHECK (
      (lms_type = 'canvas' AND canvas_environment IN ('production', 'beta', 'test'))
      OR (lms_type IN ('moodle', 'sakai') AND canvas_environment IS NULL)
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
