ALTER TABLE preview_sessions
  DROP CONSTRAINT IF EXISTS preview_sessions_origin_check;

ALTER TABLE preview_sessions
  ADD CONSTRAINT preview_sessions_origin_check
  CHECK (origin IN ('adminTestLaunch', 'deepLinkingAuthoring', 'adminAuthoringDraft'));
