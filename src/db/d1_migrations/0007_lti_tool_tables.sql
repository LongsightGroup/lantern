CREATE TABLE IF NOT EXISTS lti_clients (
  id TEXT PRIMARY KEY NOT NULL,
  platform_name TEXT NOT NULL,
  iss TEXT NOT NULL,
  client_id TEXT NOT NULL,
  auth_url TEXT NOT NULL,
  token_url TEXT NOT NULL,
  jwks_url TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS lti_clients_issuer_client_idx
  ON lti_clients (client_id, iss);

CREATE UNIQUE INDEX IF NOT EXISTS lti_clients_iss_client_id_uniq
  ON lti_clients (iss, client_id);

CREATE TABLE IF NOT EXISTS lti_deployments (
  id TEXT PRIMARY KEY NOT NULL,
  client_id TEXT NOT NULL REFERENCES lti_clients (id) ON DELETE CASCADE,
  deployment_id TEXT NOT NULL,
  deployment_name TEXT,
  deployment_description TEXT
);

CREATE INDEX IF NOT EXISTS lti_deployments_deployment_id_idx
  ON lti_deployments (deployment_id);

CREATE UNIQUE INDEX IF NOT EXISTS lti_deployments_client_deployment_uniq
  ON lti_deployments (client_id, deployment_id);

CREATE TABLE IF NOT EXISTS lti_nonces (
  nonce TEXT PRIMARY KEY NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS lti_nonces_expires_at_idx
  ON lti_nonces (expires_at);

CREATE TABLE IF NOT EXISTS lti_registration_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  payload TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS lti_registration_sessions_expires_at_idx
  ON lti_registration_sessions (expires_at);

CREATE TABLE IF NOT EXISTS lti_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  payload TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS lti_sessions_expires_at_idx
  ON lti_sessions (expires_at);
