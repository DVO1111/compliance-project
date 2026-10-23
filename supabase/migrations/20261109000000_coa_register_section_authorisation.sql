-- PM-03's `CoA register` column, enforced.
--
-- ── WHAT WAS TRUE ──
--
-- Approving a certificate of analysis was a bare UPDATE from the
-- browser: coaService.approveCoa() sets status, qa_approved_by,
-- qa_approved_by_name and qa_approved_at on certificate_of_analysis
-- and nothing server-side asked who was doing it.
--
-- The screen gated the button on `canManageGrcControls ||
-- canManageAuditWorkspace` — the legacy GRC permission model, which
-- has no relationship to PM-03's grid. So the people who could approve
-- a certificate were whoever those two flags happened to cover, and a
-- caller with the anon key needed neither.
--
-- PM-03's `CoA register` column: Act for the QA Officer and the QA
-- Manager, View for procurement, the QC analyst, the compliance admin
-- and management, and no access for the storekeeper or the production
-- supervisor.
--
-- ── WHAT IS GUARDED ──
--
-- Issuing a certificate and approving one. Both are acting in the
-- section; neither had a check. The guard is on the table, so a direct
-- PostgREST call meets it as well as the service does.
--
-- A certificate is a statement about a batch made to somebody outside
-- the company. That it could be approved by whoever held an unrelated
-- GRC flag is the kind of gap that is only visible once the grid is
-- written down somewhere a trigger can read it.

CREATE OR REPLACE FUNCTION public.fn_coa_section_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.company_id IS NULL THEN RETURN NEW; END IF;

  --  On UPDATE, only a change of status is a decision. Re-exporting a
  --  certificate or correcting its pdf_url is not an approval, and
  --  refusing those would make the register unusable to the roles
  --  PM-03 gives View.
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  PERFORM public.app_assert_section_act(NEW.company_id, 'coa_register');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_coa_section_role ON public.certificate_of_analysis;
CREATE TRIGGER trg_coa_section_role
  BEFORE INSERT OR UPDATE ON public.certificate_of_analysis
  FOR EACH ROW EXECUTE FUNCTION public.fn_coa_section_role();


-- ── What this file assumes ──────────────────────────────────────────

DO $assert$
DECLARE v_actors text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='certificate_of_analysis'
                    AND column_name='status') THEN
    RAISE EXCEPTION
      'COA_SHAPE_CHANGED: certificate_of_analysis has no status column, so the guard cannot tell an approval from an edit';
  END IF;

  --  The column must exist in the grid, or app_assert_section_act
  --  raises SECTION_UNKNOWN on every write to this table instead of
  --  authorising — the dead-guard failure 20261105000000 was written
  --  about, in its other direction.
  SELECT string_agg(role, ', ' ORDER BY role) INTO v_actors
    FROM public.section_permissions WHERE section = 'coa_register' AND access = 'act';
  IF v_actors IS NULL THEN
    RAISE EXCEPTION
      'COA_SECTION_HAS_NO_ACTORS: no role holds act on coa_register, so this guard would refuse everyone';
  END IF;
END;
$assert$;


-- ── The policy that made the guard unreachable ──────────────────────
--
-- FOUND BY THE SUITE, not by reading. The first version of this file
-- added the trigger and the assertions below passed, and the test
-- asserting a storekeeper could not approve a certificate FAILED —
-- because nothing raised. The UPDATE had matched zero rows.
--
-- certificate_of_analysis' update policy is:
--
--   app_has_company_role(company_id, ARRAY['owner','admin'])
--
-- the platform's legacy owner/admin pair, which has no relationship to
-- the eight work roles the quality system is segregated by. So in a
-- workspace using PM-03 roles, NOBODY could approve a certificate —
-- not the QA Officer, not the QA Manager, not the compliance admin.
-- The screen offered the button and the row silently did not change.
--
-- This is the same two-disconnected-role-models problem the repair
-- started from, one table further on.
--
-- WIDENED, NOT REPLACED. The owner/admin clause stays and the PM-03
-- clause is OR-ed beside it. AND-ing two role models can only subtract,
-- which is how Deviation / CAPA went missing for every role earlier in
-- this work. The precise cell — and any individual restriction — is
-- then enforced by the trigger above, which is the narrower check.

DROP POLICY IF EXISTS coa_update_qa ON public.certificate_of_analysis;
CREATE POLICY coa_update_qa ON public.certificate_of_analysis
  FOR UPDATE TO authenticated
  USING (
    public.app_has_company_role(company_id, ARRAY['owner', 'admin'])
    OR public.app_section_access(company_id, 'coa_register') = 'act'
  )
  WITH CHECK (
    public.app_has_company_role(company_id, ARRAY['owner', 'admin'])
    OR public.app_section_access(company_id, 'coa_register') = 'act'
  );

DO $assert2$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
     WHERE c.relname = 'certificate_of_analysis' AND p.polname = 'coa_update_qa'
       AND pg_get_expr(p.polqual, p.polrelid) LIKE '%app_section_access%')
  THEN
    RAISE EXCEPTION
      'COA_POLICY_NOT_WIDENED: the update policy still admits only owner/admin, so the section guard can never be reached';
  END IF;
END;
$assert2$;
