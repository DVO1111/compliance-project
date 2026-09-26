-- =====================================================================
--  TENANT ISOLATION HARDENING
-- =====================================================================
--  Found by the systematic audit of tenant-scoped read paths recorded in
--  docs/TENANT_ISOLATION_AUDIT.md.
--
--  Row-level security is, and remains, the primary control. But RLS does
--  NOT apply inside a SECURITY DEFINER function: the function runs as its
--  owner, so every policy on every table it reads is bypassed. A DEFINER
--  function that takes an id and returns data about it is therefore a
--  read path of its own, and has to carry its own tenancy check.
--
--  Three such functions did not. Each was demonstrated to leak across
--  tenants with a live probe — a real, signed-in admin of company B
--  reading company A's data while RLS correctly hid the underlying row:
--
--    submission_missing_documents()      returned A's checklist item names
--    submission_time_breakdown()         returned A's status and timings
--    electronic_signature_record_hash()  returned A's record hash when the
--                                        caller passed A's company id
--
--  The last is the subtlest: it was scoped by its p_company_id ARGUMENT
--  rather than by the caller's membership, so passing the victim's company
--  id was enough. An argument is not an authorisation.
--
--  FAIL-CLOSED, NOT FAIL-QUIET
--  --------------------------
--  submission_missing_documents() feeds the submit gate: if it returned
--  no rows to a caller it could not authorise, the gate would read that
--  as "nothing missing" and let an incomplete dossier through. So it
--  raises rather than returning empty. The same reasoning applies to
--  submission_time_breakdown().
--
--  electronic_signature_record_hash() is the exception and stays
--  NULL-returning: it is consumed by lifecycle_consume_signature(), which
--  compares the hash and reports a mismatch. Raising there would convert
--  a signature check into an exception in a path that deliberately
--  returns its refusals.
-- =====================================================================


-- ── 1. Submission checklist completeness ─────────────────────────────
CREATE OR REPLACE FUNCTION public.submission_missing_documents(p_submission_id uuid)
RETURNS TABLE (name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_company uuid;
BEGIN
  SELECT company_id INTO v_company
    FROM public.regulatory_submissions WHERE id = p_submission_id;
  IF v_company IS NULL THEN
    RETURN;   -- no such submission; nothing to report either way
  END IF;

  --  Raises rather than returning empty: the submit gate treats an empty
  --  result as "complete", so a quiet refusal here would be a fail-open.
  IF NOT public.app_is_service_context()
     AND NOT public.app_is_company_member(v_company) THEN
    RAISE EXCEPTION 'SUBMISSION_FORBIDDEN: caller is not a member of the owning company'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  SELECT k AS name
    FROM public.regulatory_submissions s,
         LATERAL jsonb_each(s.document_checklist) AS e(k, v)
   WHERE s.id = p_submission_id
     AND coalesce(s.checklist_phases ->> k, 'pre') = 'pre'
     AND coalesce((v ->> 'is_present')::boolean, false) = false
   ORDER BY k;
END $$;

COMMENT ON FUNCTION public.submission_missing_documents(uuid) IS
  'Pre-submission checklist items still outstanding. SECURITY DEFINER, so it enforces company membership itself — RLS does not apply inside it. Raises for a caller outside the owning company rather than returning empty, because the submit gate reads empty as "complete".';

REVOKE ALL ON FUNCTION public.submission_missing_documents(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submission_missing_documents(uuid) TO authenticated, service_role;


-- ── 2. Submission turnaround reporting ───────────────────────────────
CREATE OR REPLACE FUNCTION public.submission_time_breakdown(p_submission_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_company uuid; v_result jsonb;
BEGIN
  SELECT company_id INTO v_company
    FROM public.regulatory_submissions WHERE id = p_submission_id;
  IF v_company IS NULL THEN
    RETURN NULL;
  END IF;

  IF NOT public.app_is_service_context()
     AND NOT public.app_is_company_member(v_company) THEN
    RAISE EXCEPTION 'SUBMISSION_FORBIDDEN: caller is not a member of the owning company'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT jsonb_build_object(
    'total_days',        CASE WHEN s.submitted_date IS NULL THEN 0
                              ELSE current_date - s.submitted_date END,
    'directive_days',    d.directive_days,
    'active_review_days',GREATEST(0, CASE WHEN s.submitted_date IS NULL THEN 0
                              ELSE current_date - s.submitted_date END - d.directive_days),
    'open_directives',   d.open_directives,
    'total_directives',  d.total_directives,
    'current_status',    s.current_status)
    INTO v_result
  FROM (SELECT submitted_date, current_status
          FROM public.regulatory_submissions WHERE id = p_submission_id) s,
       (SELECT coalesce(sum(
                 GREATEST(0, (coalesce(responded_at::date, current_date) - date_received))
               ), 0) AS directive_days,
               count(*) FILTER (WHERE responded_at IS NULL) AS open_directives,
               count(*) AS total_directives
          FROM public.submission_directives
         WHERE submission_id = p_submission_id) d;

  RETURN v_result;
END $$;

COMMENT ON FUNCTION public.submission_time_breakdown(uuid) IS
  'Directive time separated from active review time. SECURITY DEFINER, so it enforces company membership itself; refuses callers outside the owning company.';

REVOKE ALL ON FUNCTION public.submission_time_breakdown(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submission_time_breakdown(uuid) TO authenticated, service_role;


-- ── 3. Electronic signature record hash ──────────────────────────────
--  Scoped by the caller's membership, not merely by the p_company_id
--  argument it is handed. Stays NULL-returning: its consumer,
--  lifecycle_consume_signature(), compares the value and reports a
--  mismatch, and that path returns refusals rather than raising.
CREATE OR REPLACE FUNCTION public.electronic_signature_record_hash(
  p_entity_type text, p_entity_id uuid, p_company_id uuid
) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $$
  SELECT encode(digest(
    concat_ws('|',
      'sha256-esig-record-v1',
      ecs.entity_type,
      ecs.entity_id::text,
      ecs.company_id::text,
      ecs.definition_id::text,
      s.state_key,
      ecs.updated_at::text),
    'sha256'), 'hex')
  FROM public.entity_current_state ecs
  JOIN public.lifecycle_states s ON s.id = ecs.state_id
  WHERE ecs.entity_type = p_entity_type
    AND ecs.entity_id   = p_entity_id
    AND ecs.company_id  = p_company_id
    AND (public.app_is_service_context()
         OR public.app_is_company_member(p_company_id));
$$;

COMMENT ON FUNCTION public.electronic_signature_record_hash(text,uuid,uuid) IS
  'Server-computed hash of a lifecycle record''s signable state. Scoped by the CALLER''s membership as well as the company argument — an argument is not an authorisation. Returns NULL outside the owning company.';

REVOKE ALL ON FUNCTION public.electronic_signature_record_hash(text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.electronic_signature_record_hash(text,uuid,uuid) TO authenticated, service_role;


-- ── 4. audit_logs: a company admin could read every tenant's trail ───
--  The most serious finding of the audit, and the oldest: the SELECT
--  policy from the original schema (20260206145116) reads
--
--      EXISTS (SELECT 1 FROM profiles
--               WHERE profiles.id = auth.uid()
--                 AND profiles.role IN ('admin','compliance_officer'))
--
--  with NO reference to company_id at all. Policies are OR'd, so this
--  one overrode the correctly-scoped policy added later: any user whose
--  profile role was 'admin' or 'compliance_officer' — an ordinary
--  company admin, which every tenant has — could read the audit trail
--  of EVERY tenant on the platform. audit_logs carries
--  evidence_snapshot, so that is other companies' sealed regulatory
--  evidence, not just metadata.
--
--  Demonstrated with a live probe: company B's admin read company A's
--  entry, its integrity hash, and the snapshot payload.
--
--  The role check is kept — it is a legitimate additional restriction —
--  but it is now ANDed with company membership instead of standing on
--  its own.
--
--  Membership is resolved through company_members OR profiles.company_id.
--  Both express "this user belongs to this company"; accepting either
--  means no legitimate reader loses access to their own tenant's trail
--  while the cross-tenant hole closes.
DROP POLICY IF EXISTS "Admins and compliance officers can view audit logs" ON public.audit_logs;
CREATE POLICY "Admins and compliance officers can view company audit logs"
  ON public.audit_logs FOR SELECT TO authenticated
  USING (
    (public.app_is_company_member(company_id)
     OR company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()))
    AND EXISTS (SELECT 1 FROM public.profiles p
                 WHERE p.id = auth.uid()
                   AND p.role = ANY (ARRAY['admin','compliance_officer']))
  );

--  The members' policy carried `company_id IS NULL OR ...`, which made
--  every un-attributed legacy row readable by every authenticated user
--  of every tenant. Those rows predate the company_id column; they are
--  not "public", they are unclassified. They stay unreadable until
--  someone backfills them, which is what exportSealedEvidence() now
--  tells the user when it meets one.
DROP POLICY IF EXISTS "Company members can view company audit logs" ON public.audit_logs;
CREATE POLICY "Company members can view company audit logs"
  ON public.audit_logs FOR SELECT TO authenticated
  USING (
    public.app_is_company_member(company_id)
    OR company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  );
