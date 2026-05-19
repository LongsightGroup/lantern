ALTER TABLE attempt_events
  ADD COLUMN learning_verb TEXT NOT NULL DEFAULT 'completed';

ALTER TABLE attempt_events
  ADD COLUMN object_id TEXT NOT NULL DEFAULT 'activity';

ALTER TABLE attempt_events
  ADD COLUMN object_type TEXT NOT NULL DEFAULT 'activity';

ALTER TABLE attempt_events
  ADD COLUMN result TEXT NOT NULL DEFAULT '{"completionState":"completed"}'
    CHECK (json_valid(result));

UPDATE attempt_events
SET
  learning_verb = CASE event_type
    WHEN 'answer' THEN 'answered'
    WHEN 'progress' THEN 'progressed'
    ELSE 'completed'
  END,
  object_id = CASE event_type
    WHEN 'answer' THEN COALESCE(json_extract(event, '$.questionId'), 'question')
    WHEN 'progress' THEN COALESCE(json_extract(event, '$.checkpoint'), 'checkpoint')
    ELSE 'activity'
  END,
  object_type = CASE event_type
    WHEN 'answer' THEN 'question'
    WHEN 'progress' THEN 'checkpoint'
    ELSE 'activity'
  END,
  result = CASE event_type
    WHEN 'answer' THEN json_object(
      'response',
      json_extract(event, '$.answer'),
      'success',
      CASE json_type(event, '$.correct')
        WHEN 'true' THEN json('true')
        WHEN 'false' THEN json('false')
        ELSE NULL
      END,
      'scoreGiven',
      json_extract(event, '$.scoreGiven'),
      'scoreMaximum',
      json_extract(event, '$.scoreMaximum')
    )
    WHEN 'progress' THEN json_object(
      'value',
      json_extract(event, '$.value')
    )
    ELSE json_object(
      'completionState',
      'completed'
    )
  END;
