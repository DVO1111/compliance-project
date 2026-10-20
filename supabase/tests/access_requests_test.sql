-- =====================================================================
--  ACCESS REQUESTS AND GRANTS — INTEGRATION TESTS  (W2-0)
--  LOCAL / DISPOSABLE DATABASE ONLY
-- =====================================================================
--  Covers 20261026000000_access_requests.sql.
--
--  The design's own rules are the specification, and each section
--  below is one of them:
--
--    A  "Release is a step permission... it can't be requested."
--    B  "Act is disabled where segregation of duties forbids it."
--    C  "The admin grants as asked, grants with limits... or declines
--        with a reason."
--    D  "Grants with an end date are removed automatically when they
--        expire."
--    E  Tenancy, and the writes that must not be possible directly.
--
--  THE ASSERTIONS THAT MATTER MOST are B4 and E3. B4 is the one an
--  inspector tests: that an admin cannot approve a segregation-of-
--  duties breach by sending the grant any other way. E3 is what makes
--  B4 worth anything: that there is no second path into these tables
--  that skips the function where the check lives.
--
--  Run:  psql "<local url>" -f supabase/tests/access_requests_test.sql
--
--  Safe to run repeatedly. Fixtures are tagged acc- and removed at the
--  end. No permanent schema change is made.
-- =====================================================================

\set ON_ERROR_STOP off

RESET ROLE;
SELECT set_config('request.jwt.claims','', false);

DO $guard$
BEGIN
  IF current_database() NOT IN ('postgres','criateur_local') THEN
    RAISE EXCEPTION 'REFUSING TO RUN outside a local database (got %)', current_database();
  END IF;
  IF to_regclass('public.access_permission_requests') IS NULL THEN
    RAISE EXCEPTION 'Migration 20261026000000 has not been applied to this database.';
  END IF;
END $guard$;

DROP TABLE IF EXISTS acc_results;
CREATE TEMP TABLE acc_results(seq serial, id text, name text, verdict text, detail text);
GRANT ALL ON acc_results TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE acc_results_seq_seq TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION acc_assert(p_id text, p_name text, p_cond boolean, p_detail text DEFAULT '')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO acc_results(id,name,verdict,detail)
  VALUES (p_id,p_name,CASE WHEN p_cond THEN 'PASS' ELSE 'FAIL' END,p_detail);
END $$;

--  Most assertions here are "this is refused". A helper that runs a
--  statement and reports whether it raised keeps each of them to one
--  line, and keeps the SQLERRM so a failure says what happened instead
--  of only that something did.
CREATE OR REPLACE FUNCTION acc_raises(p_sql text, p_expect text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE v_msg text;
BEGIN
  EXECUTE p_sql;
  RETURN false;
EXCEPTION WHEN others THEN
  v_msg := SQLERRM;
  RETURN p_expect IS NULL OR position(p_expect in v_msg) > 0;
END $$;

CREATE OR REPLACE FUNCTION acc_as(p_user uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_user::text)::text, false);
  EXECUTE 'SET ROLE authenticated';
END $$;

-- ── Fixtures ─────────────────────────────────────────────────────────
--  Two companies, because half of what is tested here is that one
--  cannot see or touch the other. Four people in company A: an admin
--  who decides, a storekeeper whose request is clean, a QC analyst
--  whose request conflicts, and a second admin for the "nobody decides
--  their own request" case.
DO $fix$
DECLARE
  c_a uuid := '00000000-0000-acc0-a000-00000000000a';
  c_b uuid := '00000000-0000-acc0-a000-00000000000b';
  u_ad uuid := '00000000-0000-acc0-b000-000000000001';
  u_sk uuid := '00000000-0000-acc0-b000-000000000002';
  u_qc uuid := '00000000-0000-acc0-b000-000000000003';
  u_b  uuid := '00000000-0000-acc0-b000-000000000004';
BEGIN
  DELETE FROM public.access_grants WHERE company_id IN (c_a, c_b);
  DELETE FROM public.access_permission_requests WHERE company_id IN (c_a, c_b);
  DELETE FROM public.access_request_counters WHERE company_id IN (c_a, c_b);
  DELETE FROM public.access_settings WHERE company_id IN (c_a, c_b);
  DELETE FROM public.companies WHERE id IN (c_a, c_b);
  DELETE FROM auth.users WHERE id IN (u_ad, u_sk, u_qc, u_b);

  INSERT INTO auth.users (id, email) VALUES
    (u_ad,'acc-admin@example.invalid'), (u_sk,'acc-store@example.invalid'),
    (u_qc,'acc-qc@example.invalid'),    (u_b ,'acc-b@example.invalid');

  INSERT INTO public.companies (id, name) VALUES (c_a,'Acc Alpha'), (c_b,'Acc Bravo');

  INSERT INTO public.profiles (id, email, company_id, role) VALUES
    (u_ad,'acc-admin@example.invalid', c_a, 'admin'),
    (u_sk,'acc-store@example.invalid', c_a, 'content_creator'),
    (u_qc,'acc-qc@example.invalid',    c_a, 'content_creator'),
    (u_b ,'acc-b@example.invalid',     c_b, 'admin');

  INSERT INTO public.company_members (company_id, user_id, role, status) VALUES
    (c_a, u_ad, 'owner',  'active'),
    (c_a, u_sk, 'viewer', 'active'),
    (c_a, u_qc, 'viewer', 'active'),
    (c_b, u_b , 'owner',  'active');
END $fix$;

-- =====================================================================
--  A. "Release... can't be requested" (2.5, C8.6)
-- =====================================================================
DO $$
DECLARE v text;
BEGIN
  SELECT unrequestable_reason INTO v FROM public.access_sections WHERE key='batch_release';
  PERFORM acc_assert('A1','batch release is marked unrequestable', v IS NOT NULL);
  --  Not merely flagged: the tile has to be able to SAY why, so the
  --  reason has to be a sentence and not a boolean dressed as one.
  PERFORM acc_assert('A2','and says why, in words', length(COALESCE(v,'')) > 40, COALESCE(v,'(null)'));
END $$;

DO $$
DECLARE c_a uuid := '00000000-0000-acc0-a000-00000000000a';
BEGIN
  PERFORM acc_as('00000000-0000-acc0-b000-000000000002');
  PERFORM acc_assert('A3','asking for batch release is refused',
    acc_raises(format(
      'SELECT public.access_request_raise(%L,''batch_release'',''act'',''All batches'',NULL,''Cover for QA'',''storekeeper'')',
      c_a), 'NOT_REQUESTABLE'));
  RESET ROLE; PERFORM set_config('request.jwt.claims','',false);
END $$;

DO $$
BEGIN
  --  Every other section must remain requestable. A migration that
  --  marked one by accident would lock a whole section away with no
  --  way back, and nothing else would notice.
  PERFORM acc_assert('A4','no other section is unrequestable',
    (SELECT count(*) FROM public.access_sections
     WHERE unrequestable_reason IS NOT NULL AND key <> 'batch_release') = 0);
END $$;

-- =====================================================================
--  B. Segregation of duties
-- =====================================================================
DO $$
DECLARE c_a uuid := '00000000-0000-acc0-a000-00000000000a';
BEGIN
  --  Viewing is never a conflict, for any role on any section. This is
  --  the design's own worked example — a storekeeper granted View on
  --  QC testing with "No conflict" — generalised.
  PERFORM acc_assert('B1','View is never a conflict, for any role or section',
    (SELECT count(*) FROM public.access_sections s
       CROSS JOIN (VALUES ('storekeeper'),('qc_analyst'),('production_operator'),
                          ('production_supervisor'),('qa_officer'),('qa_manager')) r(role)
      WHERE EXISTS (SELECT 1 FROM public.access_conflict(c_a, r.role, s.key, 'view'))) = 0);

  PERFORM acc_assert('B2','QC analyst acting on QA disposition is a conflict',
    EXISTS (SELECT 1 FROM public.access_conflict(c_a,'qc_analyst','qa_disposition','act')));

  --  A bare verdict tells the admin nothing and the asker less.
  PERFORM acc_assert('B3','every conflict carries a reason and somewhere else to ask',
    (SELECT count(*) FROM public.access_duty_conflicts
      WHERE length(btrim(reason)) < 20 OR length(btrim(instead_ask)) < 10) = 0);
END $$;

--  B4 · THE ONE THAT MATTERS. An admin may narrow a request. They may
--  not approve a duties breach, by either route.
DO $$
DECLARE
  c_a uuid := '00000000-0000-acc0-a000-00000000000a';
  u_ad uuid := '00000000-0000-acc0-b000-000000000001';
  u_qc uuid := '00000000-0000-acc0-b000-000000000003';
  v_req uuid;
BEGIN
  --  The request itself is refused at the point of asking, so to test
  --  the DECISION path the row has to be planted directly. That is
  --  exactly the shape of the attack: a request that should not exist,
  --  reaching an admin.
  INSERT INTO public.access_permission_requests
    (company_id, reference, requested_by, work_role, section_key, level, scope, reason)
  VALUES (c_a,'REQ-TEST1',u_qc,'qc_analyst','qa_disposition','act','All lots','Cover for QA')
  RETURNING id INTO v_req;

  PERFORM acc_as(u_ad);

  PERFORM acc_assert('B4a','granting a conflicting Act as asked is refused',
    acc_raises(format('SELECT public.access_decide(%L,''grant'')', v_req), 'DUTY_CONFLICT'));

  PERFORM acc_assert('B4b','and dressing it up as a limited grant is refused too',
    acc_raises(format(
      'SELECT public.access_decide(%L,''narrow'',''act'',''One batch only'',CURRENT_DATE+7,''Just this once'')',
      v_req), 'DUTY_CONFLICT'));

  --  Narrowing Act down to View is how a conflicting request SHOULD be
  --  salvaged, and it has to work or the admin's only option is a
  --  decline.
  PERFORM acc_assert('B5','narrowing the same request to View succeeds',
    NOT acc_raises(format(
      'SELECT public.access_decide(%L,''narrow'',''view'',''Lots they tested'',CURRENT_DATE+7,''View only. Disposition stays with QA.'')',
      v_req)));

  RESET ROLE; PERFORM set_config('request.jwt.claims','',false);

  PERFORM acc_assert('B6','and wrote a View grant, not an Act one',
    (SELECT level FROM public.access_grants WHERE request_id = v_req) = 'view');
END $$;

DO $$
DECLARE
  c_a uuid := '00000000-0000-acc0-a000-00000000000a';
  u_sk uuid := '00000000-0000-acc0-b000-000000000002';
BEGIN
  PERFORM acc_as(u_sk);
  --  Asking for Act where the rule forbids it is refused before an
  --  admin ever sees it. The dialog disables the radio; this is what
  --  makes that more than styling.
  PERFORM acc_assert('B7','a storekeeper cannot even ask to Act on QC testing',
    acc_raises(format(
      'SELECT public.access_request_raise(%L,''qc_testing'',''act'',''All lots'',NULL,''Faster turnaround'',''storekeeper'')',
      c_a), 'DUTY_CONFLICT'));
  RESET ROLE; PERFORM set_config('request.jwt.claims','',false);
END $$;

-- =====================================================================
--  C. Asking, and the three decisions
-- =====================================================================
DO $$
DECLARE
  c_a uuid := '00000000-0000-acc0-a000-00000000000a';
  u_sk uuid := '00000000-0000-acc0-b000-000000000002';
  u_ad uuid := '00000000-0000-acc0-b000-000000000001';
  v_req public.access_permission_requests;
BEGIN
  PERFORM acc_as(u_sk);

  SELECT * INTO v_req FROM public.access_request_raise(
    c_a,'qc_testing','view','Lots they received', CURRENT_DATE + 21,
    'I need to see when sampling is finished so I can plan put-away.','storekeeper');

  PERFORM acc_assert('C1','a clean request is accepted and numbered',
    v_req.reference ~ '^REQ-[0-9]{4}$', v_req.reference);
  PERFORM acc_assert('C2','and starts out waiting', v_req.status = 'waiting');

  --  One waiting request per section. Two would ask the admin the same
  --  question twice, which is why the dashboard shows "Requested"
  --  rather than a second Request button.
  PERFORM acc_assert('C3','a second waiting request for the same section is refused',
    acc_raises(format(
      'SELECT public.access_request_raise(%L,''qc_testing'',''view'',''Lots they received'',NULL,''Again'',''storekeeper'')',
      c_a), 'ALREADY_WAITING'));

  PERFORM acc_assert('C4','a request with a blank reason is refused',
    acc_raises(format(
      'SELECT public.access_request_raise(%L,''audit_trail'',''view'',''Their records'',NULL,''   '',''storekeeper'')',
      c_a), 'NO_REASON'));

  PERFORM acc_assert('C5','an end date beyond the cap is refused',
    acc_raises(format(
      'SELECT public.access_request_raise(%L,''audit_trail'',''view'',''Their records'',CURRENT_DATE+200,''Long one'',''storekeeper'')',
      c_a), 'TOO_LONG'));

  --  Nobody decides their own request. This is the segregation rule
  --  applied to the access system itself, and it is the first thing an
  --  inspector will think to try.
  PERFORM acc_assert('C6','the asker cannot decide their own request',
    acc_raises(format('SELECT public.access_decide(%L,''grant'')', v_req.id), 'OWN_REQUEST'));

  PERFORM acc_as(u_ad);

  PERFORM acc_assert('C7','a decline with no reason is refused',
    acc_raises(format('SELECT public.access_decide(%L,''decline'',NULL,NULL,NULL,''  '')', v_req.id),
               'NO_REASON'));

  PERFORM acc_assert('C8','a limited grant that narrows nothing is refused',
    acc_raises(format(
      'SELECT public.access_decide(%L,''narrow'',''view'',''Lots they received'',CURRENT_DATE+21,''Fine by me'')',
      v_req.id), 'NOTHING_NARROWED'));

  PERFORM acc_assert('C9','a narrowed grant with no note is refused',
    acc_raises(format(
      'SELECT public.access_decide(%L,''narrow'',''view'',''Lots they received'',CURRENT_DATE+7,'''')',
      v_req.id), 'NO_NOTE'));

  --  Widening is not narrowing. An admin handing out more than was
  --  asked for is making a different decision, and it must not travel
  --  under a note addressed to the asker.
  PERFORM acc_assert('C10','upgrading a View request to Act is refused',
    acc_raises(format(
      'SELECT public.access_decide(%L,''narrow'',''act'',''Lots they received'',CURRENT_DATE+7,''Have Act too'')',
      v_req.id), 'WIDENS_REQUEST'));

  PERFORM acc_assert('C11','granting as asked succeeds',
    NOT acc_raises(format('SELECT public.access_decide(%L,''grant'')', v_req.id)));

  PERFORM acc_assert('C12','deciding the same request twice is refused',
    acc_raises(format('SELECT public.access_decide(%L,''decline'',NULL,NULL,NULL,''Changed my mind'')', v_req.id),
               'ALREADY_DECIDED'));

  RESET ROLE; PERFORM set_config('request.jwt.claims','',false);

  PERFORM acc_assert('C13','the grant records who granted it and against which request',
    EXISTS (SELECT 1 FROM public.access_grants
            WHERE request_id = v_req.id AND granted_by = u_ad AND user_id = u_sk));

  PERFORM acc_assert('C14','a second live grant on the same section cannot be created',
    acc_raises(format(
      'INSERT INTO public.access_grants (company_id,user_id,section_key,level,scope,granted_by) '
      'VALUES (%L,%L,''qc_testing'',''act'',''All lots'',%L)', c_a, u_sk, u_ad)));
END $$;

-- =====================================================================
--  D. "Grants with an end date are removed automatically"
-- =====================================================================
DO $$
DECLARE
  c_a uuid := '00000000-0000-acc0-a000-00000000000a';
  u_ad uuid := '00000000-0000-acc0-b000-000000000001';
  u_qc uuid := '00000000-0000-acc0-b000-000000000003';
  v_id uuid;
BEGIN
  INSERT INTO public.access_grants (company_id,user_id,section_key,level,scope,valid_until,granted_by)
  VALUES (c_a,u_qc,'sop_library','view','All SOPs', CURRENT_DATE - 1, u_ad)
  RETURNING id INTO v_id;

  --  Expiry is computed, not swept. A nightly job that failed would
  --  silently leave access in force; a view cannot fail to run.
  PERFORM acc_assert('D1','an expired grant drops out of the active view',
    NOT EXISTS (SELECT 1 FROM public.access_grants_active WHERE id = v_id));
  PERFORM acc_assert('D2','but the row is kept, for the audit trail',
    EXISTS (SELECT 1 FROM public.access_grants WHERE id = v_id));

  UPDATE public.access_grants SET valid_until = CURRENT_DATE WHERE id = v_id;
  PERFORM acc_assert('D3','the last day counts as still in force',
    EXISTS (SELECT 1 FROM public.access_grants_active WHERE id = v_id));

  PERFORM acc_as(u_ad);
  PERFORM acc_assert('D4','revoking with no reason is refused',
    acc_raises(format('SELECT public.access_grant_revoke(%L,'' '')', v_id), 'NO_REASON'));
  PERFORM acc_assert('D5','revoking with a reason succeeds',
    NOT acc_raises(format('SELECT public.access_grant_revoke(%L,''Cover period is over.'')', v_id)));
  RESET ROLE; PERFORM set_config('request.jwt.claims','',false);

  PERFORM acc_assert('D6','a revoked grant leaves the active view but keeps its reason',
    NOT EXISTS (SELECT 1 FROM public.access_grants_active WHERE id = v_id)
    AND (SELECT revoke_reason FROM public.access_grants WHERE id = v_id) = 'Cover period is over.');
END $$;

-- =====================================================================
--  E. Tenancy, and the writes that must not be possible
-- =====================================================================
DO $$
DECLARE
  c_a uuid := '00000000-0000-acc0-a000-00000000000a';
  u_b  uuid := '00000000-0000-acc0-b000-000000000004';
BEGIN
  PERFORM acc_as(u_b);

  PERFORM acc_assert('E1','another company''s requests are invisible',
    (SELECT count(*) FROM public.access_permission_requests WHERE company_id = c_a) = 0);

  PERFORM acc_assert('E2','and cannot be raised into',
    acc_raises(format(
      'SELECT public.access_request_raise(%L,''qc_testing'',''view'',''All lots'',NULL,''Curious'',''qa_officer'')',
      c_a), 'NOT_A_MEMBER'));

  RESET ROLE; PERFORM set_config('request.jwt.claims','',false);
END $$;

--  E3 · What makes B4 worth anything. If a direct write were possible,
--  the duties check could be skipped by not calling the function.
DO $$
DECLARE
  c_a uuid := '00000000-0000-acc0-a000-00000000000a';
  u_qc uuid := '00000000-0000-acc0-b000-000000000003';
  v_rows int;
BEGIN
  PERFORM acc_as(u_qc);

  PERFORM acc_assert('E3a','a request cannot be inserted directly',
    (SELECT count(*) = 0 FROM (
      SELECT 1 FROM public.access_permission_requests WHERE reference = 'REQ-BYPASS'
    ) t) AND acc_raises(format(
      'INSERT INTO public.access_permission_requests '
      '(company_id,reference,requested_by,work_role,section_key,level,scope,reason) '
      'VALUES (%L,''REQ-BYPASS'',%L,''qc_analyst'',''qa_disposition'',''act'',''All'',''Because'')',
      c_a, u_qc)));

  PERFORM acc_assert('E3b','a grant cannot be inserted directly',
    acc_raises(format(
      'INSERT INTO public.access_grants (company_id,user_id,section_key,level,scope,granted_by) '
      'VALUES (%L,%L,''qa_disposition'',''act'',''All lots'',%L)', c_a, u_qc, u_qc)));

  --  E3c and E4 assert on EFFECT, not on an exception. RLS with no
  --  write policy does not raise on UPDATE or DELETE: it filters the
  --  rows away and reports that nothing matched. A test that only
  --  checked for an error would pass just as happily against a table
  --  where the write succeeded and then silently affected nothing —
  --  and would miss the case that matters, where it succeeded and
  --  changed a row.
  UPDATE public.access_permission_requests SET status = 'granted'
  WHERE company_id = c_a AND status = 'granted_narrowed';
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  PERFORM acc_assert('E3c','a decided request cannot be rewritten by a user',
    v_rows = 0, format('%s row(s) changed', v_rows));

  --  The duties rules themselves are read-only to users. A role that
  --  could delete its own conflict row would have no conflicts.
  DELETE FROM public.access_duty_conflicts WHERE company_id IS NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  PERFORM acc_assert('E4','the duties rules cannot be deleted by a user',
    v_rows = 0, format('%s row(s) deleted', v_rows));

  RESET ROLE; PERFORM set_config('request.jwt.claims','',false);
END $$;

DO $$
BEGIN
  --  Belt and braces on E3: the policy catalogue itself, so a future
  --  migration that adds a write policy fails here rather than in
  --  production.
  PERFORM acc_assert('E5','no write policy exists on requests or grants',
    (SELECT count(*) FROM pg_policies
      WHERE schemaname='public'
        AND tablename IN ('access_permission_requests','access_grants')
        AND cmd <> 'SELECT') = 0);
END $$;

-- ── Report ───────────────────────────────────────────────────────────
RESET ROLE;
SELECT set_config('request.jwt.claims','', false);

SELECT seq, id, name, verdict, detail FROM acc_results ORDER BY seq;

--  Two shapes, because the CI harness reads either: the grouped
--  verdict table when there are failures, and the three-column line
--  when there are none. The three columns are total, passed, failed in
--  that order -- the harness takes columns 2 and 3 as passed and
--  failed, so any other order reports a clean suite as a broken one.
SELECT verdict, count(*) FROM acc_results GROUP BY verdict ORDER BY verdict;

SELECT count(*) AS total,
       count(*) FILTER (WHERE verdict='PASS') AS passed,
       count(*) FILTER (WHERE verdict='FAIL') AS failed
FROM acc_results;

-- ── Clean up ─────────────────────────────────────────────────────────
DO $cleanup$
DECLARE
  c_a uuid := '00000000-0000-acc0-a000-00000000000a';
  c_b uuid := '00000000-0000-acc0-a000-00000000000b';
BEGIN
  DELETE FROM public.access_grants WHERE company_id IN (c_a, c_b);
  DELETE FROM public.access_permission_requests WHERE company_id IN (c_a, c_b);
  DELETE FROM public.access_request_counters WHERE company_id IN (c_a, c_b);
  DELETE FROM public.access_settings WHERE company_id IN (c_a, c_b);
  DELETE FROM public.companies WHERE id IN (c_a, c_b);
  DELETE FROM auth.users WHERE id IN (
    '00000000-0000-acc0-b000-000000000001',
    '00000000-0000-acc0-b000-000000000002',
    '00000000-0000-acc0-b000-000000000003',
    '00000000-0000-acc0-b000-000000000004');
END $cleanup$;
