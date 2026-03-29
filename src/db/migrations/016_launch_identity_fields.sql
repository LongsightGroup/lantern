ALTER TABLE attempts
  ADD COLUMN IF NOT EXISTS user_display_name text,
  ADD COLUMN IF NOT EXISTS user_email text,
  ADD COLUMN IF NOT EXISTS user_login text;
