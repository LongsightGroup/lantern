UPDATE broker_verification_runs
SET scope = CASE
  WHEN scope = 'canvasLti13LaunchAgsNrps' THEN 'lti13LaunchAgsNrps'
  WHEN scope IN ('moodleLti13LaunchAgsScore', 'sakaiLti13LaunchAgsScore')
    THEN 'lti13LaunchAgsScore'
  ELSE scope
END
WHERE scope IN (
  'canvasLti13LaunchAgsNrps',
  'moodleLti13LaunchAgsScore',
  'sakaiLti13LaunchAgsScore'
);
