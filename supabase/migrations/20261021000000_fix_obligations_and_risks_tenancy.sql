-- ============================================================================
--  Two tenancy bugs that ONB-06 is the first thing to hit.
--
--  1. regulatory_obligations IS WIRED TO THE WRONG TENANCY TABLE.
--
--     20260306120000 declared it as
--
--         company_id uuid NOT NULL REFERENCES public.organizations(id)
--
--     and scoped its RLS to `profiles.organization_id`. Everything else in
--     this product — companies, company_members, licences, risks, policies —
--     is scoped to `companies`, and the dashboard reads the table with
--     `.eq('company_id', companyId)` where companyId is a COMPANIES id
--     (DashboardPage.tsx). So the table has never worked for anyone:
--
--       * no row can be inserted, because the foreign key points at a table
--         nothing populates;
--       * and if one were, the policy would hide it, because
--         profiles.organization_id is null for every user.
--
--     The column has always MEANT a company id. This makes it one.
--
--  2. ONLY A LEGACY PROFILE ROLE CAN WRITE A RISK.
--
--     risks_manage requires profiles.role IN (admin, compliance_officer,
--     compliance, executive). The person who creates a workspace is written
--     as `content_creator` by provision_profile — deliberately, as the
--     least-privileged value — and is made `owner` in company_members, which
--     is where this product actually keeps authority. So the owner of a
--     workspace cannot add a risk to it.
--
--     The policy is WIDENED, not replaced: the existing profiles.role path
--     stays, so nobody loses access.
--
--  NEITHER CHANGE MOVES ANY DATA. The first is guarded: if any obligation
--  references an organizations id that is not also a companies id, this
--  migration refuses rather than orphaning it.
-- ============================================================================

-- ── 1. regulatory_obligations and obligation_links ──────────────────────────

DO $$
DECLARE
  v_stranded bigint;
BEGIN
  IF to_regclass('public.regulatory_obligations') IS NULL THEN
    RAISE NOTICE 'regulatory_obligations does not exist here; nothing to repoint.';
    RETURN;
  END IF;

  --  REFUSE RATHER THAN ORPHAN. A row pointing at an organization that is
  --  not also a company cannot be repointed without guessing which company
  --  it belongs to, and guessing is how tenancy leaks start.
  SELECT count(*) INTO v_stranded
  FROM public.regulatory_obligations o
  WHERE NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.id = o.company_id);

  IF v_stranded > 0 THEN
    RAISE EXCEPTION
      'REFUSING TO REPOINT: % regulatory_obligations rows reference an id that is '
      'not a company. Resolve them before running this migration.', v_stranded;
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
  IF to_regclass('public.obligation_links') IS NULL THEN
    RETURN;
  END IF;

  SELECT count(*) INTO v_stranded
  FROM public.obligation_links l
  WHERE NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.id = l.company_id);

  IF v_stranded > 0 THEN
    RAISE EXCEPTION
      'REFUSING TO REPOINT: % obligation_links rows reference an id that is not a '
      'company.', v_stranded;
  END IF;

  ALTER TABLE public.obligation_links
    DROP CONSTRAINT IF EXISTS obligation_links_company_id_fkey;
  ALTER TABLE public.obligation_links
    ADD CONSTRAINT obligation_links_company_id_fkey
    FOREIGN KEY (company_id) REFERENCES public.companies (id) ON DELETE CASCADE;
END $$;

--  The policies, onto the same helper every other company-scoped table uses,
--  so there is one definition of "my company" rather than a second one that
--  drifts.
DO $$
BEGIN
  IF to_regprocedure('public.app_is_company_member(uuid, uuid)') IS NULL THEN
    RAISE EXCEPTION 'app_is_company_member is missing — run the tenancy helpers first';
  END IF;

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

-- ── 2. risks: a workspace owner may add one ─────────────────────────────────

DO $$
BEGIN
  IF to_regclass('public.risks') IS NULL THEN
    RETURN;
  END IF;

  IF to_regprocedure('public.app_has_company_role(uuid, text[], uuid)') IS NULL THEN
    RAISE EXCEPTION 'app_has_company_role is missing — run the tenancy helpers first';
  END IF;

  DROP POLICY IF EXISTS risks_manage ON public.risks;

  --  The legacy profiles.role path is KEPT, so an existing
  --  compliance_officer does not lose access the moment this deploys. What
  --  is added is the owner or admin of the company, which is where this
  --  product keeps authority and what every other table here checks.
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

-- ── Deploy-time assertions ──────────────────────────────────────────────────

DO $$
DECLARE
  v_ref text;
BEGIN
  IF to_regclass('public.regulatory_obligations') IS NOT NULL THEN
    SELECT confrelid::regclass::text INTO v_ref
    FROM pg_constraint
    WHERE conname = 'regulatory_obligations_company_id_fkey'
      AND conrelid = 'public.regulatory_obligations'::regclass;

    IF v_ref IS DISTINCT FROM 'companies' THEN
      RAISE EXCEPTION
        'DEPLOY GUARD: regulatory_obligations.company_id still references %', coalesce(v_ref,'nothing');
    END IF;

    --  A policy still naming organization_id means the old one survived and
    --  the table is unreadable again.
    IF EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'regulatory_obligations'
        AND qual LIKE '%organization_id%'
    ) THEN
      RAISE EXCEPTION
        'DEPLOY GUARD: an obligations policy is still scoped to organization_id';
    END IF;
  END IF;

  IF to_regclass('public.risks') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'risks'
        AND policyname = 'risks_manage'
        AND qual LIKE '%app_has_company_role%'
    ) THEN
      RAISE EXCEPTION
        'DEPLOY GUARD: a company owner still cannot add a risk';
    END IF;
  END IF;
END $$;
