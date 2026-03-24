ALTER TABLE deployments
  ADD COLUMN IF NOT EXISTS canvas_environment text,
  ADD COLUMN IF NOT EXISTS issuer text,
  ADD COLUMN IF NOT EXISTS client_id text,
  ADD COLUMN IF NOT EXISTS deployment_id text;

CREATE UNIQUE INDEX IF NOT EXISTS deployments_lti_binding_unique
  ON deployments (issuer, client_id, deployment_id)
  WHERE issuer IS NOT NULL
    AND client_id IS NOT NULL
    AND deployment_id IS NOT NULL;
