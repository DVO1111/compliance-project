-- ============================================================
-- License Vault Migration — Safe, Idempotent
-- Run via: Supabase SQL Editor or supabase db push
-- ============================================================

-- ── 1. licenses ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS licenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  uploaded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_name text NOT NULL,
  nafdac_reg_number text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'Drug',
  expiry_date date NOT NULL,
  issue_date date,
  issuing_authority text NOT NULL DEFAULT 'NAFDAC',
  certificate_url text,
  status text NOT NULL DEFAULT 'active',
  renewal_status text NOT NULL DEFAULT 'none',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_licenses_company ON licenses(company_id);
CREATE INDEX IF NOT EXISTS idx_licenses_expiry ON licenses(expiry_date);

ALTER TABLE licenses ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'licenses' AND policyname = 'Company members can view licenses'
  ) THEN
    CREATE POLICY "Company members can view licenses"
      ON licenses FOR SELECT
      USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'licenses' AND policyname = 'Company members can manage licenses'
  ) THEN
    CREATE POLICY "Company members can manage licenses"
      ON licenses FOR ALL
      USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()))
      WITH CHECK (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));
  END IF;
END$$;


-- ── 2. license_renewal_tasks ─────────────────────────────────
CREATE TABLE IF NOT EXISTS license_renewal_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id uuid NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  deadline date NOT NULL,
  is_completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  completed_by uuid,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_renewal_tasks_license ON license_renewal_tasks(license_id);

ALTER TABLE license_renewal_tasks ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'license_renewal_tasks' AND policyname = 'Users can view tasks for company licenses'
  ) THEN
    CREATE POLICY "Users can view tasks for company licenses"
      ON license_renewal_tasks FOR SELECT
      USING (license_id IN (
        SELECT id FROM licenses
        WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
      ));
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'license_renewal_tasks' AND policyname = 'Users can manage tasks for company licenses'
  ) THEN
    CREATE POLICY "Users can manage tasks for company licenses"
      ON license_renewal_tasks FOR ALL
      USING (license_id IN (
        SELECT id FROM licenses
        WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
      ))
      WITH CHECK (license_id IN (
        SELECT id FROM licenses
        WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
      ));
  END IF;
END$$;

-- Done ✅
