ALTER TABLE runtime_sessions ADD COLUMN lti_tool_session_id TEXT REFERENCES lti_sessions (id) ON DELETE SET NULL;
