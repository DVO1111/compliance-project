-- Fixes two tenancy bugs that stop ONB-06 writing its starter records.
-- Safe to run more than once. Moves no data.
--
-- 1. regulatory_obligations.company_id points at `organizations`, a table
--    nothing in this product populates, and its RLS compares against
--    profiles.organization_id, which is null for every user. The dashboard
--    reads the table with a COMPANIES id. So no obligation can be written,
--    and one written anyway would be invisible. This repoints the column at
--    companies and scopes the policy the way every other table here is.
--
--    IT REFUSES RATHER THAN ORPHANS: if any existing row points at an id
--    that is not a company, the script stops and tells you how many.
--
-- 2. risks_manage requires profiles.role IN (admin, compliance_officer,
--    compliance, executive). The person who creates a workspace is written
--    as `content_creator` and made `owner` in company_members — so the owner
--    of a workspace cannot add a risk to it. The policy is WIDENED; the
--    existing path stays, so nobody loses access.
--
-- Paste this whole file into the Supabase SQL editor and run it. The last
-- query reports the result; every row should say true.

-- ── 1. regulatory_obligations and obligation_links ──────────────────

DO $$
DECLARE
  v_stranded bigint;
BEGIN
  IF to_regclass('public.regulatory_obligations') IS NULL THEN
    RAISE NOTICE 'regulatory_obligations does not exist here; nothing to do.';
    RETURN;
  END IF;

  SELECT count(*) INTO v_stranded
  FROM public.regulatory_obligations o
  WHERE NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.id = o.company_id);

  IF v_stranded > 0 THEN
    RAISE EXCEPTION
      'STOPPED: % regulatory_obligations rows reference an id that is not a company. '
      'Resolve them before running this.', v_stranded;
  END IF;

  ALTER TABLE public.regulatory_obligations
    DROP CONSTRAINT IF EXISTS regulatory_obligations_company_id_fkey;
  ALTER TABLE public.regulatory_obligations
    ADD CONSTRAINT regulatory_obligations_company_id_fkey
    FOREIGN KEY (company_id) REFERENCES public.companies (id) ON DELETE CASCADE;
END $$;

DO $$
DECLARE
  v_stranded bigint;
BEGIN
  IF to_regclass('public.obligation_links') IS NULL THEN RETURN; END IF;

  SELECT count(*) INTO v_stranded
  FROM public.obligation_links l
  WHERE NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.id = l.company_id);

  IF v_stranded > 0 THEN
    RAISE EXCEPTION
      'STOPPED: % obligation_links rows reference an id that is not a company.', v_stranded;
  END IF;

  ALTER TABLE public.obligation_links
    DROP CONSTRAINT IF EXISTS obligation_links_company_id_fkey;
  ALTER TABLE public.obligation_links
    ADD CONSTRAINT obligation_links_company_id_fkey
    FOREIGN KEY (company_id) REFERENCES public.companies (id) ON DELETE CASCADE;
END $$;

DO $$
BEGIN
  IF to_regclass('public.regulatory_obligations') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Regulatory obligations are company scoped"
      ON public.regulatory_obligations;
    DROP POLICY IF EXISTS regulatory_obligations_company_scoped
      ON public.regulatory_obligations;
    CREATE POLICY regulatory_obligations_company_scoped
      ON public.regulatory_obligations
      FOR ALL TO authenticated
      USING (public.app_is_company_member(company_id))
      WITH CHECK (public.app_is_company_member(company_id));
  END IF;

  IF to_regclass('public.obligation_links') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Obligation links are company scoped" ON public.obligation_links;
    DROP POLICY IF EXISTS obligation_links_company_scoped ON public.obligation_links;
    CREATE POLICY obligation_links_company_scoped
      ON public.obligation_links
      FOR ALL TO authenticated
      USING (public.app_is_company_member(company_id))
      WITH CHECK (public.app_is_company_member(company_id));
  END IF;
END $$;

-- ── 2. risks: a workspace owner may add one ─────────────────────────

DO $$
BEGIN
  IF to_regclass('public.risks') IS NULL THEN RETURN; END IF;

  DROP POLICY IF EXISTS risks_manage ON public.risks;

  CREATE POLICY risks_manage ON public.risks
    FOR ALL TO authenticated
    USING (
      public.app_has_company_role(company_id, ARRAY['owner','admin'])
      OR company_id IN (
        SELECT profiles.company_id FROM public.profiles
        WHERE profiles.id = auth.uid()
          AND profiles.role = ANY (ARRAY['admin','compliance_officer','compliance','executive'])
      )
    )
    WITH CHECK (
      public.app_has_company_role(company_id, ARRAY['owner','admin'])
      OR company_id IN (
        SELECT profiles.company_id FROM public.profiles
        WHERE profiles.id = auth.uid()
          AND profiles.role = ANY (ARRAY['admin','compliance_officer','compliance','executive'])
      )
    );
END $$;

-- Did it work? Every row should say true.

SELECT 'obligations point at companies' AS item,
       coalesce((SELECT confrelid::regclass::text = 'companies'
                 FROM pg_constraint
                 WHERE conname = 'regulatory_obligations_company_id_fkey'), true) AS fixed
UNION ALL
SELECT 'no obligations policy still uses organization_id',
       NOT EXISTS (SELECT 1 FROM pg_policies
                   WHERE schemaname='public' AND tablename='regulatory_obligations'
                     AND qual LIKE '%organization_id%')
UNION ALL
SELECT 'a workspace owner can add a risk',
       EXISTS (SELECT 1 FROM pg_policies
               WHERE schemaname='public' AND tablename='risks'
                 AND policyname='risks_manage' AND qual LIKE '%app_has_company_role%');
