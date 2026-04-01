ALTER TABLE preview_sessions
  ADD COLUMN origin text;

UPDATE preview_sessions
SET origin = 'adminTestLaunch'
WHERE origin IS NULL;

ALTER TABLE preview_sessions
  ALTER COLUMN origin SET NOT NULL;

ALTER TABLE preview_sessions
  ADD CONSTRAINT preview_sessions_origin_check
  CHECK (origin IN ('adminTestLaunch', 'deepLinkingAuthoring'));

ALTER TABLE preview_sessions
  ADD COLUMN content_path text;

UPDATE preview_sessions
SET content_path = COALESCE(
  NULLIF(package_versions.manifest_json -> 'content_files' ->> 0, ''),
  '/content/activity.json'
)
FROM package_versions
WHERE package_versions.id = preview_sessions.package_version_id
  AND preview_sessions.content_path IS NULL;

ALTER TABLE preview_sessions
  ALTER COLUMN content_path SET NOT NULL;

ALTER TABLE preview_sessions
  ADD COLUMN deep_linking_session_id text REFERENCES deep_linking_sessions (session_id)
    ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS preview_sessions_package_version_origin_created_idx
  ON preview_sessions (package_version_id, origin, created_at DESC);
