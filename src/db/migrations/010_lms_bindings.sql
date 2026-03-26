ALTER TABLE deployments
  ADD COLUMN IF NOT EXISTS lms_type text,
  ADD COLUMN IF NOT EXISTS moodle_authentication_request_url text,
  ADD COLUMN IF NOT EXISTS moodle_access_token_url text,
  ADD COLUMN IF NOT EXISTS moodle_jwks_url text,
  ADD COLUMN IF NOT EXISTS sakai_oidc_authentication_url text,
  ADD COLUMN IF NOT EXISTS sakai_access_token_url text,
  ADD COLUMN IF NOT EXISTS sakai_jwks_url text;

UPDATE deployments
SET lms_type = 'canvas'
WHERE lms_type IS NULL;

ALTER TABLE deployments
  ALTER COLUMN lms_type SET DEFAULT 'canvas',
  ALTER COLUMN lms_type SET NOT NULL;

DO $$
BEGIN
  ALTER TABLE deployments
    ADD CONSTRAINT deployments_lms_type_check
    CHECK (lms_type IN ('canvas', 'moodle', 'sakai'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DROP INDEX IF EXISTS deployments_lti_binding_unique;

CREATE UNIQUE INDEX IF NOT EXISTS deployments_lti_binding_unique
  ON deployments (lms_type, issuer, client_id, deployment_id)
  WHERE issuer IS NOT NULL
    AND client_id IS NOT NULL
    AND deployment_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS deployments_app_lms_slot_unique
  ON deployments (app_id, lms_type);
