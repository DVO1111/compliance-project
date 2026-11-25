-- ============================================================================
--  Ownership and approval authority
--  (20261125105842_change_control_owner_and_approvers.sql).
--
--  The model under test: the raiser owns the record and asks; somebody
--  named as an approver approves. So the suite is built around the two
--  ways that could be false afterwards —
--
--    B/C.  THE GATE IS OPEN WHEN IT SHOULD BE AND SHUT WHEN IT SHOULD
--          BE. "Empty means open" is a deliberate decision, not an
--          oversight, so B1 asserts it: if someone later makes the table
--          closed-by-default, every workspace freezes at
--          pending_approval and this is the test that says so.
--    D.    THE RESTATEMENT KEPT THE OLD RULES. 20261125105842 rewrites
--          change_control_state_guard in full rather than patching it,
--          which is the easiest way in this whole repository to silently
--          drop an evidence rule.
--
--  C needs the guard to see an AUTHENTICATED caller. app_is_service_context
--  reads current_setting('role'), and the suite runs as a superuser with
--  role unset, which the guard exempts. So the move goes through a
--  SECURITY DEFINER helper: the UPDATE runs with the owner's rights (past
--  RLS) while `role` stays 'authenticated' and auth.uid() returns the
--  fixture's id — which is the combination the guard actually judges.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

DO $guard$
BEGIN
  IF current_database() NOT IN ('postgres','criateur_local') THEN
    RAISE EXCEPTION 'REFUSING TO RUN: this suite writes fixtures. Database is %', current_database();
  END IF;
END $guard$;

CREATE TEMP TABLE IF NOT EXISTS ccoa_results(
  id text, name text, status text, detail text
) ON COMMIT PRESERVE ROWS;
TRUNCATE ccoa_results;

CREATE OR REPLACE FUNCTION pg_temp.ccoa_ok(p_id text, p_name text, p_cond boolean, p_detail text DEFAULT '')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO ccoa_results VALUES (p_id, p_name, CASE WHEN p_cond THEN 'PASS' ELSE 'FAIL' END, p_detail);
END $$;

--  SECURITY DEFINER on purpose: see the header.
CREATE OR REPLACE FUNCTION pg_temp.ccoa_move(p_cc uuid, p_state text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_company uuid; v_def uuid; v_state uuid;
BEGIN
  SELECT company_id INTO v_company FROM public.change_controls WHERE id = p_cc;
  v_def := public.lifecycle_resolve_definition('change_control', v_company);
  SELECT id INTO v_state FROM public.lifecycle_states
   WHERE definition_id = v_def AND state_key = p_state;
  IF v_state IS NULL THEN RETURN 'NO_SUCH_STATE'; END IF;

  UPDATE public.entity_current_state
     SET state_id = v_state
   WHERE entity_type = 'change_control' AND entity_id = p_cc;
  RETURN 'OK';
EXCEPTION WHEN others THEN
  RETURN SQLERRM;
END $$;

-- ── fixtures ────────────────────────────────────────────────────────────────

DO $fix$
DECLARE
  v_company uuid;
  u_owner   uuid := '00000000-0000-6a11-f000-000000000001';
  u_qa      uuid := '00000000-0000-6a11-f000-000000000002';
  u_other   uuid := '00000000-0000-6a11-f000-000000000003';
BEGIN
  INSERT INTO auth.users(id, email) VALUES
    (u_owner, 'ccoa-owner@local.test'),
    (u_qa,    'ccoa-qa@local.test'),
    (u_other, 'ccoa-other@local.test')
    ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.companies(name) VALUES ('CCOA Co') RETURNING id INTO v_company;

  INSERT INTO public.company_members(company_id, user_id, role, status) VALUES
    (v_company, u_owner, 'owner',  'active'),
    (v_company, u_qa,    'admin',  'active'),
    (v_company, u_other, 'viewer', 'active');

  INSERT INTO public.change_controls
    (company_id, change_number, title, change_type, change_category, created_by, impact_assessment)
  VALUES
    (v_company, 'CC-OA-0001', 'Ownership fixture', 'process', 'minor', u_owner,
     'Assessed: no impact beyond the cleaning SOP.');
END $fix$;

-- ── A. ownership ────────────────────────────────────────────────────────────

DO $a$
DECLARE
  v_company uuid;
  u_owner uuid := '00000000-0000-6a11-f000-000000000001';
  u_other uuid := '00000000-0000-6a11-f000-000000000003';
  v_owner uuid;
  v_id    uuid;
BEGIN
  SELECT company_id INTO v_company FROM public.change_controls WHERE change_number = 'CC-OA-0001';

  SELECT owner_id INTO v_owner FROM public.change_controls WHERE change_number = 'CC-OA-0001';
  PERFORM pg_temp.ccoa_ok('A1','the raiser owns the change by default',
    v_owner = u_owner, coalesce(v_owner::text, '<null>'));

  --  "By default" has to mean default, not force: reassignment is the
  --  normal case the moment somebody hands work over.
  INSERT INTO public.change_controls
    (company_id, change_number, title, change_type, change_category, created_by, owner_id)
  VALUES (v_company, 'CC-OA-0002', 'Explicit owner', 'process', 'minor', u_owner, u_other)
  RETURNING id INTO v_id;

  SELECT owner_id INTO v_owner FROM public.change_controls WHERE id = v_id;
  PERFORM pg_temp.ccoa_ok('A2','an explicitly named owner is kept',
    v_owner = u_other, coalesce(v_owner::text, '<null>'));

  PERFORM pg_temp.ccoa_ok('A3','no change control is left without an owner',
    NOT EXISTS (SELECT 1 FROM public.change_controls
                 WHERE owner_id IS NULL AND created_by IS NOT NULL));
END $a$;

-- ── B. who may approve, as a question ───────────────────────────────────────

DO $b$
DECLARE
  v_company uuid;
  u_owner uuid := '00000000-0000-6a11-f000-000000000001';
  u_qa    uuid := '00000000-0000-6a11-f000-000000000002';
  u_other uuid := '00000000-0000-6a11-f000-000000000003';
BEGIN
  SELECT company_id INTO v_company FROM public.change_controls WHERE change_number = 'CC-OA-0001';

  --  B1 — OPEN WHILE NOBODY IS NAMED, deliberately. If this fails,
  --  every workspace that has not chosen an approver has just been
  --  frozen at pending_approval.
  PERFORM pg_temp.ccoa_ok('B1','with nobody named, any member may approve',
    public.app_may_approve_change_control(v_company, u_owner)
    AND public.app_may_approve_change_control(v_company, u_other));

  INSERT INTO public.change_control_approvers(company_id, user_id, note, added_by)
  VALUES (v_company, u_qa, 'QA for the suite', u_owner);

  PERFORM pg_temp.ccoa_ok('B2','once somebody is named, others may not approve',
    NOT public.app_may_approve_change_control(v_company, u_other));

  PERFORM pg_temp.ccoa_ok('B3','the named approver may approve',
    public.app_may_approve_change_control(v_company, u_qa));

  --  A rule that narrowed every company at once would pass B2.
  PERFORM pg_temp.ccoa_ok('B4','naming an approver in one company does not narrow another',
    public.app_may_approve_change_control(gen_random_uuid(), u_other));
END $b$;

-- ── C. the guard enforces it ────────────────────────────────────────────────

DO $c$
DECLARE
  v_cc    uuid;
  u_owner uuid := '00000000-0000-6a11-f000-000000000001';
  u_qa    uuid := '00000000-0000-6a11-f000-000000000002';
  v_res   text;
BEGIN
  SELECT id INTO v_cc FROM public.change_controls WHERE change_number = 'CC-OA-0001';

  PERFORM pg_temp.ccoa_move(v_cc, 'impact_assessment');
  PERFORM pg_temp.ccoa_move(v_cc, 'pending_approval');

  --  Out of service context, which is the whole point: the guard
  --  exempts service callers, so asserting from here as postgres would
  --  prove only that the exemption works.
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', u_owner::text, 'role', 'authenticated')::text, true);

  v_res := pg_temp.ccoa_move(v_cc, 'approved');
  PERFORM pg_temp.ccoa_ok('C1','a caller who is not a named approver is refused',
    v_res LIKE '%CC_APPROVER_NOT_AUTHORISED%', v_res);

  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', u_qa::text, 'role', 'authenticated')::text, true);
  v_res := pg_temp.ccoa_move(v_cc, 'approved');
  PERFORM pg_temp.ccoa_ok('C2','the named approver is allowed through', v_res = 'OK', v_res);

  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
END $c$;

-- ── D. the restatement kept the evidence rules ──────────────────────────────

DO $d$
DECLARE
  v_company uuid;
  u_owner uuid := '00000000-0000-6a11-f000-000000000001';
  v_cc    uuid;
  v_res   text;
BEGIN
  SELECT company_id INTO v_company FROM public.change_controls WHERE change_number = 'CC-OA-0001';

  INSERT INTO public.change_controls
    (company_id, change_number, title, change_type, change_category, created_by)
  VALUES (v_company, 'CC-OA-0003', 'No assessment yet', 'process', 'minor', u_owner)
  RETURNING id INTO v_cc;

  PERFORM pg_temp.ccoa_move(v_cc, 'impact_assessment');
  v_res := pg_temp.ccoa_move(v_cc, 'pending_approval');
  PERFORM pg_temp.ccoa_ok('D1','the impact assessment rule survived the rewrite',
    v_res LIKE '%CC_IMPACT_ASSESSMENT_REQUIRED%', v_res);
END $d$;

-- ── E. asking tells somebody ────────────────────────────────────────────────

DO $e$
DECLARE
  v_company uuid;
  u_owner uuid := '00000000-0000-6a11-f000-000000000001';
  u_qa    uuid := '00000000-0000-6a11-f000-000000000002';
  v_cc    uuid;
BEGIN
  SELECT company_id INTO v_company FROM public.change_controls WHERE change_number = 'CC-OA-0001';

  INSERT INTO public.change_controls
    (company_id, change_number, title, change_type, change_category, created_by, impact_assessment)
  VALUES (v_company, 'CC-OA-0004', 'Notify fixture', 'process', 'minor', u_owner, 'Assessed.')
  RETURNING id INTO v_cc;

  PERFORM pg_temp.ccoa_move(v_cc, 'impact_assessment');

  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', u_owner::text, 'role', 'authenticated')::text, true);
  PERFORM pg_temp.ccoa_move(v_cc, 'pending_approval');
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);

  PERFORM pg_temp.ccoa_ok('E1','submitting for approval notifies the named approver',
    EXISTS (SELECT 1 FROM public.notifications
             WHERE recipient_id = u_qa
               AND type = 'change_control_approval_request'
               AND content_id = v_cc));

  --  Telling somebody what they just did themselves is noise, and noise
  --  is how a notification list stops being read.
  PERFORM pg_temp.ccoa_ok('E2','the person who asked is not notified of their own request',
    NOT EXISTS (SELECT 1 FROM public.notifications
                 WHERE recipient_id = u_owner AND content_id = v_cc));
END $e$;

-- ── summary ─────────────────────────────────────────────────────────────────

SELECT id, name, status, detail FROM ccoa_results ORDER BY id;

--  Column order is total, passed, failed — the shape the harness reads.
SELECT
  count(*)                                AS total,
  count(*) FILTER (WHERE status = 'PASS') AS passed,
  count(*) FILTER (WHERE status = 'FAIL') AS failed
FROM ccoa_results;

-- ── cleanup ─────────────────────────────────────────────────────────────────

DO $cleanup$
DECLARE v_company uuid;
BEGIN
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
  SELECT company_id INTO v_company FROM public.change_controls WHERE change_number = 'CC-OA-0001';

  DELETE FROM public.notifications WHERE content_id IN
    (SELECT id FROM public.change_controls WHERE change_number LIKE 'CC-OA-%');
  DELETE FROM public.entity_state_history WHERE entity_type = 'change_control'
     AND entity_id IN (SELECT id FROM public.change_controls WHERE change_number LIKE 'CC-OA-%');
  DELETE FROM public.entity_current_state WHERE entity_type = 'change_control'
     AND entity_id IN (SELECT id FROM public.change_controls WHERE change_number LIKE 'CC-OA-%');
  DELETE FROM public.change_controls WHERE change_number LIKE 'CC-OA-%';
  DELETE FROM public.change_control_approvers WHERE company_id = v_company;
  DELETE FROM public.company_members WHERE company_id = v_company;
  DELETE FROM public.companies WHERE id = v_company;
  DELETE FROM auth.users WHERE email LIKE 'ccoa-%@local.test';
  RAISE NOTICE 'ccoa fixtures removed.';
EXCEPTION WHEN others THEN
  RAISE WARNING 'CLEANUP INCOMPLETE (%). Remove ccoa rows manually.', SQLERRM;
END $cleanup$;
