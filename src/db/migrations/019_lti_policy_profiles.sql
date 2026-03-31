CREATE TABLE IF NOT EXISTS lantern_settings (
  singleton boolean PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  default_lti_profile text NOT NULL CHECK (
    default_lti_profile IN ('certification', 'governedCompatibility')
  ),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO lantern_settings (
  singleton,
  default_lti_profile
) VALUES (
  TRUE,
  'governedCompatibility'
)
ON CONFLICT (singleton) DO NOTHING;

ALTER TABLE deployments
  ADD COLUMN IF NOT EXISTS lti_profile_override text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'deployments_lti_profile_override_check'
  ) THEN
    ALTER TABLE deployments
      ADD CONSTRAINT deployments_lti_profile_override_check CHECK (
        lti_profile_override IS NULL OR
        lti_profile_override IN ('certification', 'governedCompatibility')
      );
  END IF;
END $$;
