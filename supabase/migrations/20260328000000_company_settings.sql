-- ============================================================
-- Company Settings Table — Sprint 4.1
-- Stores company-wide brand and configuration settings.
-- Keyed by company_id (one row per company).
-- ============================================================

CREATE TABLE IF NOT EXISTS company_settings (
  company_id uuid PRIMARY KEY,
  name       text,
  logo_url   text,
  brand_color text DEFAULT '#1e3a8a',
  tagline    text,
  website_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;

-- Any authenticated user whose profile.company_id matches can read
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'company_settings' AND policyname = 'Company members can read settings'
  ) THEN
    CREATE POLICY "Company members can read settings"
      ON company_settings FOR SELECT
      TO authenticated
      USING (
        company_id IN (
          SELECT company_id FROM profiles WHERE id = auth.uid() AND company_id IS NOT NULL
        )
      );
  END IF;
END $$;

-- Any authenticated user whose profile.company_id matches can write
-- (role enforcement is handled at the application layer)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'company_settings' AND policyname = 'Company members can write settings'
  ) THEN
    CREATE POLICY "Company members can write settings"
      ON company_settings FOR ALL
      TO authenticated
      USING (
        company_id IN (
          SELECT company_id FROM profiles WHERE id = auth.uid() AND company_id IS NOT NULL
        )
      )
      WITH CHECK (
        company_id IN (
          SELECT company_id FROM profiles WHERE id = auth.uid() AND company_id IS NOT NULL
        )
      );
  END IF;
END $$;
