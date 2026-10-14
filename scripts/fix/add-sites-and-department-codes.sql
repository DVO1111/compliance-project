-- Adds what ONB-03 needs: sites, department codes, and the company's
-- product categories. Safe to run more than once. Changes no existing data.
--
-- Paste this whole file into the Supabase SQL editor and run it. The last
-- query reports what is installed; every row should say true.

-- ── Sites ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  name        text NOT NULL,
  site_type   text NOT NULL DEFAULT 'manufacturing',
  address     text,
  product_categories text[] NOT NULL DEFAULT '{}',
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sites_name_not_blank_chk CHECK (btrim(name) <> ''),
  CONSTRAINT sites_type_chk CHECK (
    site_type IN ('manufacturing', 'warehouse', 'laboratory', 'office')
  ),
  CONSTRAINT sites_name_unique_per_company UNIQUE (company_id, name)
);

CREATE INDEX IF NOT EXISTS sites_company_idx ON public.sites (company_id);

ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;

-- Tenancy, through the helper every other table here uses.
DROP POLICY IF EXISTS sites_company_read ON public.sites;
CREATE POLICY sites_company_read ON public.sites
  FOR SELECT TO authenticated
  USING (public.app_is_company_member(company_id));

DROP POLICY IF EXISTS sites_company_write ON public.sites;
CREATE POLICY sites_company_write ON public.sites
  FOR ALL TO authenticated
  USING (public.app_is_company_member(company_id))
  WITH CHECK (public.app_is_company_member(company_id));

-- ── Department codes ────────────────────────────────────────────────
-- The code goes into a document number, CC-{CODE}-{YYYY}-{NNNN}. It is a
-- column of its own so that renaming a department does not change the
-- numbers already issued under it.

ALTER TABLE public.departments ADD COLUMN IF NOT EXISTS code text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'departments_code_shape_chk'
                   AND conrelid = 'public.departments'::regclass) THEN
    ALTER TABLE public.departments
      ADD CONSTRAINT departments_code_shape_chk
      CHECK (code IS NULL OR code ~ '^[A-Z0-9]{2,8}$');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'departments_code_unique_per_company'
                   AND conrelid = 'public.departments'::regclass) THEN
    ALTER TABLE public.departments
      ADD CONSTRAINT departments_code_unique_per_company UNIQUE (company_id, code);
  END IF;
END $$;

-- ── What the company makes ──────────────────────────────────────────

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS product_categories text[] NOT NULL DEFAULT '{}';

-- Did it work? Every row should say true.

SELECT 'sites table' AS item, to_regclass('public.sites') IS NOT NULL AS installed
UNION ALL
SELECT 'sites row-level security',
       coalesce((SELECT rowsecurity FROM pg_tables
                 WHERE schemaname = 'public' AND tablename = 'sites'), false)
UNION ALL
SELECT 'sites policies',
       EXISTS (SELECT 1 FROM pg_policies
               WHERE schemaname = 'public' AND tablename = 'sites')
UNION ALL
SELECT 'departments.code',
       EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'departments'
                 AND column_name = 'code')
UNION ALL
SELECT 'companies.product_categories',
       EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'companies'
                 AND column_name = 'product_categories');
