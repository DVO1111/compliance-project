-- RLS Draft — Manufacturing & Quality tables (company scoping + QA role gating)
--
-- Author: engineering (initial draft). STATUS: PENDING TOPE'S REVIEW before the
-- production branch. This maps the Supabase schema to the application's access
-- model so that, e.g., a NASCO QA manager sees only NASCO data AND only QA-
-- authority roles can perform the quality-critical writes GMP requires an
-- "authorised person" to make (batch release, CoA approval, RM disposition —
-- NAFDAC GMP §2.13–2.16, §1.20).
--
-- ── Decisions for Tope to ratify ─────────────────────────────────────────────
--  1. MEMBERSHIP SOURCE: this draft treats an ACTIVE row in `company_members`
--     as authoritative membership (stricter than the older `profiles.company_id`
--     checks scattered across the schema). Confirm we standardise on this.
--  2. QA AUTHORITY: modelled here as company_members.role IN ('owner','admin').
--     There is no dedicated 'qa'/'quality' role today. If QA should be its own
--     role (or gated on company_members.module_access containing 'batch-release'),
--     change the ARRAY below / the helper and we re-review.
--  3. BEHAVIOUR CHANGE: plain 'member' users can still LOG (insert QC results,
--     receipts, in-process checks) but can no longer release batches / approve
--     CoAs / set RM disposition. Confirm this matches the intended segregation
--     of duties.

-- ── Helpers (SECURITY DEFINER + STABLE; avoid RLS recursion) ─────────────────
CREATE OR REPLACE FUNCTION public.app_is_company_member(p_company_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM company_members
    WHERE company_id = p_company_id
      AND user_id = p_user_id
      AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.app_has_company_role(p_company_id uuid, p_roles text[], p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM company_members
    WHERE company_id = p_company_id
      AND user_id = p_user_id
      AND status = 'active'
      AND role = ANY (p_roles)
  );
$$;

-- QA-authority role set — the single place to change the segregation-of-duties rule.
-- (Kept inline in policies via app_has_company_role(..., ARRAY['owner','admin']).)

-- ── Drop the permissive "manage" policies these tables shipped with ──────────
DROP POLICY IF EXISTS "Company members can view batch_records"        ON public.batch_records;
DROP POLICY IF EXISTS "Company members can manage batch_records"      ON public.batch_records;
DROP POLICY IF EXISTS "Company members can view batch_qc_results"     ON public.batch_qc_results;
DROP POLICY IF EXISTS "Company members can manage batch_qc_results"   ON public.batch_qc_results;
DROP POLICY IF EXISTS "Company members can view batch_inprocess_qc"   ON public.batch_inprocess_qc;
DROP POLICY IF EXISTS "Company members can manage batch_inprocess_qc" ON public.batch_inprocess_qc;
DROP POLICY IF EXISTS "Company members can view raw_material_receipts"   ON public.raw_material_receipts;
DROP POLICY IF EXISTS "Company members can manage raw_material_receipts" ON public.raw_material_receipts;
DROP POLICY IF EXISTS "Company members can view certificate_of_analysis"   ON public.certificate_of_analysis;
DROP POLICY IF EXISTS "Company members can manage certificate_of_analysis" ON public.certificate_of_analysis;

-- ── batch_records: members read/create; QA authority releases/holds/rejects ──
CREATE POLICY "br_select" ON public.batch_records FOR SELECT TO authenticated
  USING (app_is_company_member(company_id));
CREATE POLICY "br_insert" ON public.batch_records FOR INSERT TO authenticated
  WITH CHECK (app_is_company_member(company_id));
CREATE POLICY "br_update_qa" ON public.batch_records FOR UPDATE TO authenticated
  USING (app_has_company_role(company_id, ARRAY['owner','admin']))
  WITH CHECK (app_has_company_role(company_id, ARRAY['owner','admin']));
CREATE POLICY "br_delete_qa" ON public.batch_records FOR DELETE TO authenticated
  USING (app_has_company_role(company_id, ARRAY['owner','admin']));

-- ── batch_qc_results (child of batch_records; scoped via the parent) ─────────
CREATE POLICY "bqc_select" ON public.batch_qc_results FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM batch_records b WHERE b.id = batch_id AND app_is_company_member(b.company_id)));
CREATE POLICY "bqc_insert" ON public.batch_qc_results FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM batch_records b WHERE b.id = batch_id AND app_is_company_member(b.company_id)));
CREATE POLICY "bqc_modify_qa" ON public.batch_qc_results FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM batch_records b WHERE b.id = batch_id AND app_has_company_role(b.company_id, ARRAY['owner','admin'])));
CREATE POLICY "bqc_delete_qa" ON public.batch_qc_results FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM batch_records b WHERE b.id = batch_id AND app_has_company_role(b.company_id, ARRAY['owner','admin'])));

-- ── batch_inprocess_qc: members log; QA authority corrects/removes ───────────
CREATE POLICY "ipqc_select" ON public.batch_inprocess_qc FOR SELECT TO authenticated
  USING (app_is_company_member(company_id));
CREATE POLICY "ipqc_insert" ON public.batch_inprocess_qc FOR INSERT TO authenticated
  WITH CHECK (app_is_company_member(company_id));
CREATE POLICY "ipqc_update_qa" ON public.batch_inprocess_qc FOR UPDATE TO authenticated
  USING (app_has_company_role(company_id, ARRAY['owner','admin']))
  WITH CHECK (app_has_company_role(company_id, ARRAY['owner','admin']));
CREATE POLICY "ipqc_delete_qa" ON public.batch_inprocess_qc FOR DELETE TO authenticated
  USING (app_has_company_role(company_id, ARRAY['owner','admin']));

-- ── raw_material_receipts: members log receipt; QA authority sets disposition ─
CREATE POLICY "rmr_select" ON public.raw_material_receipts FOR SELECT TO authenticated
  USING (app_is_company_member(company_id));
CREATE POLICY "rmr_insert" ON public.raw_material_receipts FOR INSERT TO authenticated
  WITH CHECK (app_is_company_member(company_id));
CREATE POLICY "rmr_update_qa" ON public.raw_material_receipts FOR UPDATE TO authenticated
  USING (app_has_company_role(company_id, ARRAY['owner','admin']))
  WITH CHECK (app_has_company_role(company_id, ARRAY['owner','admin']));
CREATE POLICY "rmr_delete_qa" ON public.raw_material_receipts FOR DELETE TO authenticated
  USING (app_has_company_role(company_id, ARRAY['owner','admin']));

-- ── certificate_of_analysis: members generate draft; QA authority approves ───
CREATE POLICY "coa_select" ON public.certificate_of_analysis FOR SELECT TO authenticated
  USING (app_is_company_member(company_id));
CREATE POLICY "coa_insert" ON public.certificate_of_analysis FOR INSERT TO authenticated
  WITH CHECK (app_is_company_member(company_id));
CREATE POLICY "coa_update_qa" ON public.certificate_of_analysis FOR UPDATE TO authenticated
  USING (app_has_company_role(company_id, ARRAY['owner','admin']))
  WITH CHECK (app_has_company_role(company_id, ARRAY['owner','admin']));
CREATE POLICY "coa_delete_qa" ON public.certificate_of_analysis FOR DELETE TO authenticated
  USING (app_has_company_role(company_id, ARRAY['owner','admin']));
