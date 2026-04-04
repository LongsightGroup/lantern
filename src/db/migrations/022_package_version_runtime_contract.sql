ALTER TABLE package_versions
  ADD COLUMN IF NOT EXISTS runtime_contract jsonb,
  ADD COLUMN IF NOT EXISTS runtime_contract_signature text;

UPDATE package_versions
SET runtime_contract = jsonb_build_object(
  'appId',
  app_id,
  'packageVersion',
  version,
  'artifactDigest',
  artifact_digest,
  'entrypoint',
  entrypoint,
  'capabilities',
  to_jsonb(capabilities)
)
WHERE runtime_contract IS NULL;
