ALTER TABLE deep_linking_sessions
  DROP CONSTRAINT IF EXISTS deep_linking_sessions_placement_check;

ALTER TABLE deep_linking_sessions
  ADD CONSTRAINT deep_linking_sessions_placement_check
  CHECK (placement IN ('assignment_selection', 'resource_selection'));
