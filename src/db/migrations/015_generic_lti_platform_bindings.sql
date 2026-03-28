ALTER TABLE deployments
  ADD COLUMN IF NOT EXISTS authorization_endpoint text,
  ADD COLUMN IF NOT EXISTS access_token_url text,
  ADD COLUMN IF NOT EXISTS jwks_url text;

UPDATE deployments
SET
  authorization_endpoint = COALESCE(
    authorization_endpoint,
    moodle_authentication_request_url,
    sakai_oidc_authentication_url
  ),
  access_token_url = COALESCE(
    access_token_url,
    moodle_access_token_url,
    sakai_access_token_url
  ),
  jwks_url = COALESCE(
    jwks_url,
    moodle_jwks_url,
    sakai_jwks_url
  )
WHERE lms_type IN ('moodle', 'sakai');

ALTER TABLE deployments
  DROP COLUMN IF EXISTS moodle_authentication_request_url,
  DROP COLUMN IF EXISTS moodle_access_token_url,
  DROP COLUMN IF EXISTS moodle_jwks_url,
  DROP COLUMN IF EXISTS sakai_oidc_authentication_url,
  DROP COLUMN IF EXISTS sakai_access_token_url,
  DROP COLUMN IF EXISTS sakai_jwks_url;
