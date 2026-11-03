-- The protocol cache belongs to this Lantern installation. Institution identity remains in lms_connections.
ALTER TABLE lti_clients ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'lantern';
CREATE UNIQUE INDEX lti_clients_tenant_key ON lti_clients (tenant_id, id);
ALTER TABLE lti_deployments ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'lantern';
CREATE UNIQUE INDEX lti_deployments_tenant_key ON lti_deployments (tenant_id, id);
ALTER TABLE lti_registration_sessions ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'lantern';
CREATE UNIQUE INDEX lti_registration_sessions_tenant_key ON lti_registration_sessions (tenant_id, id);
ALTER TABLE lti_sessions ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'lantern';
CREATE UNIQUE INDEX lti_sessions_tenant_key ON lti_sessions (tenant_id, id);
ALTER TABLE lti_nonces ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'lantern';
CREATE UNIQUE INDEX lti_nonces_tenant_key ON lti_nonces (tenant_id, nonce);
