-- ============================================================================
--  Sites, department codes, and the company's product categories.
--
--  ONB-03's notes put it plainly: "Site is the primary axis, with
--  jurisdiction secondary (H1.1–H1.2). Each site lists what it makes
--  (H1.6)." Until now there was no site anywhere in this schema —
--  batch records, materials and inspections all belong to a site in the
--  design, and none of them could say which one.
--
--  Departments existed with a name and nothing else. The notes make
--  them load-bearing: "They now visibly drive numbering:
--  CC-{DEPT}-{YYYY}-{NNNN} (B3.9, X6.2–X6.3)." A number built from a
--  name would change when someone renames "Quality Assurance" to
--  "Quality Assurance (QA)", and a document number that changes is not
--  a document number. So the code is its own column, short, upper-case,
--  and unique per company.
-- ============================================================================

-- ── Sites ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  name        text NOT NULL,

  --  Manufacturing or warehouse is what ONB-03 offers and what the
  --  "at least one" rule counts. The others are real places a regulated
  --  business has, and a site that is neither must still be nameable
  --  rather than mislabelled as a factory.
  site_type   text NOT NULL DEFAULT 'manufacturing',

  address     text,
  --  What this site makes (H1.6). Empty for a warehouse that only
  --  stores, which is why it is an array and not a required field.
  product_categories text[] NOT NULL DEFAULT '{}',
  notes       text,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sites_name_not_blank_chk CHECK (btrim(name) <> ''),
  CONSTRAINT sites_type_chk CHECK (
    site_type IN ('manufacturing', 'warehouse', 'laboratory', 'office')
  ),
  --  Two sites in one company cannot share a name: a batch record that
  --  says "Ibadan plant" has to mean one place.
  CONSTRAINT sites_name_unique_per_company UNIQUE (company_id, name)
);

CREATE INDEX IF NOT EXISTS sites_company_idx ON public.sites (company_id);

COMMENT ON TABLE public.sites IS
  'Factories, warehouses and other premises. The primary axis records '
  'are organised by (H1.1-H1.2): batch records, materials and '
  'inspections belong to a site.';

ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;

--  Tenancy, through the same helper every other table here uses, so
--  there is one definition of "my company" rather than a second one
--  that can drift.
DO $$
BEGIN
  --  Two arguments: (p_company_id uuid, p_user_id uuid DEFAULT auth.uid()).
  --  The policies below call it with one and let the default supply the
  --  caller, but the function's identity is the full signature, so a
  --  one-argument lookup here would find nothing and fail a migration
  --  that is in fact fine.
  IF to_regprocedure('public.app_is_company_member(uuid, uuid)') IS NULL THEN
    RAISE EXCEPTION
      'app_is_company_member(uuid) is missing — this migration must run after the tenancy helpers';
  END IF;

  DROP POLICY IF EXISTS sites_company_read ON public.sites;
  CREATE POLICY sites_company_read ON public.sites
    FOR SELECT TO authenticated
    USING (public.app_is_company_member(company_id));

  DROP POLICY IF EXISTS sites_company_write ON public.sites;
  CREATE POLICY sites_company_write ON public.sites
    FOR ALL TO authenticated
    USING (public.app_is_company_member(company_id))
    WITH CHECK (public.app_is_company_member(company_id));
END $$;

-- ── Department codes ────────────────────────────────────────────────────────

ALTER TABLE public.departments
  ADD COLUMN IF NOT EXISTS code text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'departments_code_shape_chk'
      AND conrelid = 'public.departments'::regclass
  ) THEN
    --  Upper-case letters and digits, 2 to 8 characters. It goes into a
    --  document number, so a lower-case or punctuated code would make
    --  CC-qa-2026-0001 and CC-QA-2026-0001 look like different series.
    ALTER TABLE public.departments
      ADD CONSTRAINT departments_code_shape_chk
      CHECK (code IS NULL OR code ~ '^[A-Z0-9]{2,8}$');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'departments_code_unique_per_company'
      AND conrelid = 'public.departments'::regclass
  ) THEN
    --  NULLS NOT DISTINCT is deliberately NOT used: several departments
    --  may have no code yet, and they must not collide with each other
    --  while they are blank.
    ALTER TABLE public.departments
      ADD CONSTRAINT departments_code_unique_per_company UNIQUE (company_id, code);
  END IF;
END $$;

COMMENT ON COLUMN public.departments.code IS
  'Short code used in document numbers: CC-{CODE}-{YYYY}-{NNNN} (B3.9, '
  'X6.2-X6.3). Separate from name so that renaming a department does '
  'not change the numbers already issued under it.';

-- ── What the company makes ──────────────────────────────────────────────────

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS product_categories text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.companies.product_categories IS
  'Everything the company makes or holds registrations for. Decides '
  'which document checklists apply to an application (ONB-03).';

-- ── Deploy-time assertions ──────────────────────────────────────────────────

DO $$
DECLARE
  v_missing text;
BEGIN
  IF to_regclass('public.sites') IS NULL THEN
    RAISE EXCEPTION 'DEPLOY GUARD: sites was not created';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'sites' AND rowsecurity
  ) THEN
    RAISE EXCEPTION 'DEPLOY GUARD: sites has row-level security disabled';
  END IF;

  --  A table with RLS on and no policy is readable by nobody, which
  --  looks like a tenancy bug from the application side.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'sites') THEN
    RAISE EXCEPTION 'DEPLOY GUARD: sites has row-level security on but no policy';
  END IF;

  SELECT string_agg(c.col, ', ') INTO v_missing
  FROM (VALUES
    ('departments', 'code'),
    ('companies',   'product_categories')
  ) AS c(tbl, col)
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = c.tbl AND column_name = c.col
  );

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'DEPLOY GUARD: columns missing after migration: %', v_missing;
  END IF;
END $$;
