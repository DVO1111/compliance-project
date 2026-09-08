-- =====================================================================
--  SUBMISSION STATUS HANDLING — INTEGRATION TESTS  (Deliverable 04)
--  LOCAL / DISPOSABLE DATABASE ONLY
-- =====================================================================
--  Covers 20260920000000_submission_lifecycle.sql.
--
--  The cases are written around the failure modes the deliverable names
--  as disqualifying: hard-coded states, a directive that returns an
--  application to Submitted, and a submit refusal that does not say what
--  is missing.
--
--  Run:  psql "<local url>" -f supabase/tests/submission_lifecycle_test.sql
-- =====================================================================

\set ON_ERROR_STOP off

DO $guard$
BEGIN
  IF current_database() NOT IN ('postgres','criateur_local') THEN
    RAISE EXCEPTION 'REFUSING TO RUN outside a local database (got %)', current_database();
  END IF;
  IF to_regprocedure('public.submission_raise_directive(uuid,text,date,date)') IS NULL THEN
    RAISE EXCEPTION 'Migration 20260920000000 has not been applied to this database.';
  END IF;
END $guard$;

DROP TABLE IF EXISTS sub_results;
CREATE TEMP TABLE sub_results(seq serial, id text, name text, verdict text, detail text);
GRANT ALL ON sub_results TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE sub_results_seq_seq TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION sub_assert(p_id text, p_name text, p_cond boolean, p_detail text DEFAULT '')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO sub_results(id,name,verdict,detail)
  VALUES (p_id,p_name,CASE WHEN p_cond THEN 'PASS' ELSE 'FAIL' END,p_detail);
END $$;

-- ── fixtures ─────────────────────────────────────────────────────────
DO $fx$
DECLARE ca uuid := '00000000-0000-7400-a000-00000000000a';
        ua uuid := '00000000-0000-7400-b000-000000000001';
BEGIN
  INSERT INTO public.companies(id,name) VALUES (ca,'SUB Alpha') ON CONFLICT (id) DO NOTHING;
  INSERT INTO auth.users(id,email) VALUES (ua,'sub-a@local.test') ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.profiles(id,email,full_name,role,company_id)
    VALUES (ua,'sub-a@local.test','Ada Admin','admin',ca) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.company_members(company_id,user_id,role,status)
    VALUES (ca,ua,'owner','active') ON CONFLICT DO NOTHING;

  --  A submission with a mixed checklist: two pre items (one missing),
  --  one post item that is missing and must NOT block the submit.
  INSERT INTO public.regulatory_submissions
    (id,company_id,product_name,product_category,submission_type,regulatory_body,
     current_status,document_checklist,checklist_phases,created_by)
  VALUES ('00000000-0000-7400-c000-000000000001',ca,'Sub Test Syrup','drug_pharmaceutical',
          'local_manufacture','nafdac','draft',
          jsonb_build_object(
            'CAC Certificate',       jsonb_build_object('is_present',true, 'notes','','file_url',NULL),
            'Evidence of Payment',   jsonb_build_object('is_present',false,'notes','','file_url',NULL),
            'Product Label',         jsonb_build_object('is_present',false,'notes','','file_url',NULL),
            'GMP Inspection Report', jsonb_build_object('is_present',false,'notes','','file_url',NULL)),
          jsonb_build_object('CAC Certificate','pre','Evidence of Payment','pre',
                             'Product Label','pre','GMP Inspection Report','post'),
          ua);
END $fx$;


-- =====================================================================
--  A — the states are lifecycle-defined, not hard-coded
-- =====================================================================
DO $a$
DECLARE n_states int; n_dir int; n_await int; v_status text;
BEGIN
  SELECT count(*) INTO n_states FROM public.lifecycle_states s
    JOIN public.lifecycle_definitions d ON d.id=s.definition_id
   WHERE d.entity_type='regulatory_submission';
  PERFORM sub_assert('A1','regulatory_submission is a lifecycle entity', n_states=12, n_states||' state(s)');

  SELECT count(*) INTO n_dir FROM public.lifecycle_states s
    JOIN public.lifecycle_definitions d ON d.id=s.definition_id
   WHERE d.entity_type='regulatory_submission' AND s.state_key='compliance_directive';
  PERFORM sub_assert('A2','Compliance Directive is a lifecycle state', n_dir=1, n_dir||'');

  SELECT count(*) INTO n_await FROM public.lifecycle_states s
    JOIN public.lifecycle_definitions d ON d.id=s.definition_id
   WHERE d.entity_type='regulatory_submission' AND s.state_key='awaiting_applicant_response';
  PERFORM sub_assert('A3','Awaiting Applicant Response is a lifecycle state', n_await=1, n_await||'');

  SELECT current_status INTO v_status FROM public.regulatory_submissions
   WHERE id='00000000-0000-7400-c000-000000000001';
  PERFORM sub_assert('A4','an existing submission was backfilled into the engine',
    EXISTS (SELECT 1 FROM public.entity_current_state
             WHERE entity_type='regulatory_submission'
               AND entity_id='00000000-0000-7400-c000-000000000001'), coalesce(v_status,'NULL'));
END $a$;

-- status is derived, not writable
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-7400-b000-000000000001","role":"authenticated"}',false);
SET ROLE authenticated;
DO $a2$
DECLARE v_ok boolean := false; v_msg text;
BEGIN
  BEGIN
    UPDATE public.regulatory_submissions SET current_status='approved'
     WHERE id='00000000-0000-7400-c000-000000000001';
    v_msg := 'DIRECT STATUS WRITE ACCEPTED';
  EXCEPTION WHEN others THEN
    v_ok := SQLERRM LIKE 'SUBMISSION_STATUS_READ_ONLY%'; v_msg := SQLERRM;
  END;
  PERFORM sub_assert('A5','current_status cannot be written directly', v_ok, left(v_msg,100));
END $a2$;
RESET ROLE;


-- =====================================================================
--  B — the submit gate NAMES what is missing, and counts only pre items
-- =====================================================================
DO $b$
DECLARE v_missing text[];
BEGIN
  SELECT array_agg(name ORDER BY name) INTO v_missing
    FROM public.submission_missing_documents('00000000-0000-7400-c000-000000000001');

  PERFORM sub_assert('B1','only pre-submission items are counted',
    v_missing = ARRAY['Evidence of Payment','Product Label'],
    array_to_string(coalesce(v_missing, ARRAY[]::text[]), '; '));

  PERFORM sub_assert('B2','the missing post item is NOT counted',
    NOT ('GMP Inspection Report' = ANY (coalesce(v_missing, ARRAY[]::text[]))),
    'post item excluded');
END $b$;

SET ROLE authenticated;
DO $b2$
DECLARE v_ok boolean := false; v_msg text;
BEGIN
  BEGIN
    PERFORM public.lifecycle_transition('regulatory_submission',
      '00000000-0000-7400-c000-000000000001','submit','00000000-0000-7400-a000-00000000000a');
    v_msg := 'INCOMPLETE SUBMISSION ACCEPTED';
  EXCEPTION WHEN others THEN v_ok := true; v_msg := SQLERRM;
  END;
  PERFORM sub_assert('B3','an incomplete submission is blocked', v_ok, left(v_msg,140));

  -- the disqualifying condition: a refusal that does not say what is missing
  PERFORM sub_assert('B4','and the block NAMES every missing document',
    v_msg LIKE '%Evidence of Payment%' AND v_msg LIKE '%Product Label%',
    left(v_msg,140));
END $b2$;
RESET ROLE;

-- complete the pre items; the missing POST item must not block
DO $b3$
BEGIN
  UPDATE public.regulatory_submissions
     SET document_checklist = jsonb_set(
           jsonb_set(document_checklist,'{Evidence of Payment,is_present}','true'),
           '{Product Label,is_present}','true')
   WHERE id='00000000-0000-7400-c000-000000000001';
END $b3$;

SET ROLE authenticated;
DO $b4$
DECLARE r jsonb; v_ok boolean := false; v_msg text;
BEGIN
  BEGIN
    r := public.lifecycle_transition('regulatory_submission',
          '00000000-0000-7400-c000-000000000001','submit','00000000-0000-7400-a000-00000000000a');
    v_ok := r->>'to_state'='submitted'; v_msg := 'to '||coalesce(r->>'to_state','NULL');
  EXCEPTION WHEN others THEN v_msg := SQLERRM;
  END;
  PERFORM sub_assert('B5','a missing POST item does not block the submit', v_ok, left(v_msg,140));
END $b4$;
RESET ROLE;

--  Backdate the submission. The clock test below needs a submission that
--  predates its directive; leaving submitted_date at today would make the
--  directive older than the application it was raised against.
UPDATE public.regulatory_submissions SET submitted_date = current_date - 30
 WHERE id='00000000-0000-7400-c000-000000000001';


-- =====================================================================
--  C — a directive interrupts, and the response restores the SAME stage
-- =====================================================================
SET ROLE authenticated;
DO $c$
DECLARE r jsonb; v_status text;
BEGIN
  -- walk it forward to lab_testing so the originating stage is
  -- unambiguous and is NOT submitted
  PERFORM public.lifecycle_transition('regulatory_submission','00000000-0000-7400-c000-000000000001',
    'begin_division_review','00000000-0000-7400-a000-00000000000a');
  PERFORM public.lifecycle_transition('regulatory_submission','00000000-0000-7400-c000-000000000001',
    'schedule_inspection','00000000-0000-7400-a000-00000000000a');
  PERFORM public.lifecycle_transition('regulatory_submission','00000000-0000-7400-c000-000000000001',
    'complete_inspection','00000000-0000-7400-a000-00000000000a');
  PERFORM public.lifecycle_transition('regulatory_submission','00000000-0000-7400-c000-000000000001',
    'begin_lab_testing','00000000-0000-7400-a000-00000000000a');

  SELECT current_status INTO v_status FROM public.regulatory_submissions
   WHERE id='00000000-0000-7400-c000-000000000001';
  PERFORM sub_assert('C1','the application reaches lab_testing', v_status='lab_testing', coalesce(v_status,'NULL'));

  r := public.submission_raise_directive('00000000-0000-7400-c000-000000000001',
        'Provide the stability data referenced in section 3.2.P.8.',
        current_date - 10, current_date + 20);
  PERFORM sub_assert('C2','raising a directive records the originating stage',
    r->>'originating_state'='lab_testing', coalesce(r->>'originating_state','NULL'));

  SELECT current_status INTO v_status FROM public.regulatory_submissions
   WHERE id='00000000-0000-7400-c000-000000000001';
  PERFORM sub_assert('C3','and moves the application to compliance_directive',
    v_status='compliance_directive', coalesce(v_status,'NULL'));
END $c$;
RESET ROLE;

DO $c2$
DECLARE d record;
BEGIN
  SELECT * INTO d FROM public.submission_directives
   WHERE submission_id='00000000-0000-7400-c000-000000000001' ORDER BY created_at DESC LIMIT 1;

  PERFORM sub_assert('C4','the directive persists its originating stage',
    d.originating_state_key='lab_testing', coalesce(d.originating_state_key,'NULL'));
  PERFORM sub_assert('C5','the directive persists its content',
    d.content LIKE '%stability data%', left(coalesce(d.content,'NULL'),50));
  PERFORM sub_assert('C6','the directive persists the date received',
    d.date_received = current_date - 10, coalesce(d.date_received::text,'NULL'));
  PERFORM sub_assert('C7','the directive persists the response deadline',
    d.response_deadline = current_date + 20, coalesce(d.response_deadline::text,'NULL'));
END $c2$;

SET ROLE authenticated;
DO $c3$
DECLARE r jsonb; v_status text; d_id uuid;
BEGIN
  PERFORM public.lifecycle_transition('regulatory_submission','00000000-0000-7400-c000-000000000001',
    'await_applicant_response','00000000-0000-7400-a000-00000000000a');
  SELECT current_status INTO v_status FROM public.regulatory_submissions
   WHERE id='00000000-0000-7400-c000-000000000001';
  PERFORM sub_assert('C8','it can move to awaiting_applicant_response',
    v_status='awaiting_applicant_response', coalesce(v_status,'NULL'));

  SELECT id INTO d_id FROM public.submission_directives
   WHERE submission_id='00000000-0000-7400-c000-000000000001' AND responded_at IS NULL;
  r := public.submission_respond_to_directive(d_id, 'Stability data attached.');

  SELECT current_status INTO v_status FROM public.regulatory_submissions
   WHERE id='00000000-0000-7400-c000-000000000001';

  --  THE CRITICAL ONE. Not submitted, not draft — the exact stage the
  --  directive interrupted.
  PERFORM sub_assert('C9','responding restores the EXACT originating stage',
    v_status='lab_testing', coalesce(v_status,'NULL'));
  PERFORM sub_assert('C10','and it did not revert to submitted',
    v_status <> 'submitted', coalesce(v_status,'NULL'));
  PERFORM sub_assert('C11','nor to draft', v_status <> 'draft', coalesce(v_status,'NULL'));
  PERFORM sub_assert('C12','the RPC reports what it restored',
    r->>'restored_state'='lab_testing', coalesce(r->>'restored_state','NULL'));
END $c3$;
RESET ROLE;

DO $c4$
DECLARE d record;
BEGIN
  SELECT * INTO d FROM public.submission_directives
   WHERE submission_id='00000000-0000-7400-c000-000000000001' ORDER BY created_at DESC LIMIT 1;
  PERFORM sub_assert('C13','the directive is marked answered', d.responded_at IS NOT NULL,
    coalesce(d.responded_at::text,'NULL'));
  PERFORM sub_assert('C14','and records where it resolved to',
    d.resolved_to_state_key='lab_testing', coalesce(d.resolved_to_state_key,'NULL'));
END $c4$;

--  The graph itself forbids the failure: there is NO path from the
--  directive states back to draft, and none to submitted except the
--  recorded-stage resume.
DO $c5$
DECLARE n_draft int; n_generic int;
BEGIN
  SELECT count(*) INTO n_draft FROM public.lifecycle_transitions t
    JOIN public.lifecycle_definitions d ON d.id=t.definition_id
    JOIN public.lifecycle_states f ON f.id=t.from_state_id
    JOIN public.lifecycle_states s ON s.id=t.to_state_id
   WHERE d.entity_type='regulatory_submission'
     AND f.state_key IN ('compliance_directive','awaiting_applicant_response')
     AND s.state_key='draft';
  PERFORM sub_assert('C15','no transition returns a directive to draft', n_draft=0, n_draft||' path(s)');

  SELECT count(*) INTO n_generic FROM public.lifecycle_transitions t
    JOIN public.lifecycle_definitions d ON d.id=t.definition_id
   WHERE d.entity_type='regulatory_submission' AND t.action_key='resume';
  PERFORM sub_assert('C16','there is no generic "resume" action to default with',
    n_generic=0, n_generic||' generic action(s)');
END $c5$;

-- an answered directive cannot be answered twice
SET ROLE authenticated;
DO $c6$
DECLARE v_ok boolean := false; v_msg text; d_id uuid;
BEGIN
  SELECT id INTO d_id FROM public.submission_directives
   WHERE submission_id='00000000-0000-7400-c000-000000000001' LIMIT 1;
  BEGIN
    PERFORM public.submission_respond_to_directive(d_id, 'again');
    v_msg := 'DOUBLE RESPONSE ACCEPTED';
  EXCEPTION WHEN others THEN v_ok := true; v_msg := SQLERRM;
  END;
  PERFORM sub_assert('C17','a directive cannot be answered twice', v_ok, left(v_msg,100));
END $c6$;
RESET ROLE;


-- =====================================================================
--  D — the two clocks
-- =====================================================================
DO $d$
DECLARE b jsonb;
BEGIN
  b := public.submission_time_breakdown('00000000-0000-7400-c000-000000000001');
  PERFORM sub_assert('D1','directive time is tracked',
    (b->>'directive_days')::int = 10, coalesce(b->>'directive_days','NULL'));
  PERFORM sub_assert('D2','active review time excludes the directive period',
    (b->>'total_days')::int = 30
    AND (b->>'active_review_days')::int = 20,
    coalesce(b::text,'NULL'));
  PERFORM sub_assert('D3','and the two are reported separately',
    (b ? 'directive_days') AND (b ? 'active_review_days'), coalesce(b::text,'NULL'));
END $d$;


-- =====================================================================
--  E — vocabulary corrections
-- =====================================================================
DO $e$
DECLARE v_ok boolean := false; v_msg text; n int;
BEGIN
  BEGIN
    INSERT INTO public.regulatory_submissions
      (id,company_id,product_name,product_category,submission_type,regulatory_body,current_status,created_by)
    VALUES ('00000000-0000-7400-c000-000000000002','00000000-0000-7400-a000-00000000000a',
            'PCN Premises Item','drug_pharmaceutical','local_manufacture','pcn','draft',
            '00000000-0000-7400-b000-000000000001');
    v_ok := true; v_msg := 'accepted';
  EXCEPTION WHEN others THEN v_msg := SQLERRM;
  END;
  PERFORM sub_assert('E1','PCN is an accepted regulator', v_ok, left(v_msg,90));

  v_ok := false;
  BEGIN
    INSERT INTO public.regulatory_submissions
      (company_id,product_name,product_category,submission_type,regulatory_body,current_status)
    VALUES ('00000000-0000-7400-a000-00000000000a','X','food','local_manufacture','mdcn','draft');
    v_msg := 'MDCN ACCEPTED AS A SUBMISSION REGULATOR';
  EXCEPTION WHEN others THEN v_ok := true; v_msg := 'rejected';
  END;
  PERFORM sub_assert('E2','MDCN is not a submission regulator', v_ok, v_msg);

  v_ok := false;
  BEGIN
    INSERT INTO public.regulatory_submissions
      (company_id,product_name,product_category,submission_type,regulatory_body,current_status)
    VALUES ('00000000-0000-7400-a000-00000000000a','X','food','local_manufacture','nmcn','draft');
    v_msg := 'NMCN ACCEPTED AS A SUBMISSION REGULATOR';
  EXCEPTION WHEN others THEN v_ok := true; v_msg := 'rejected';
  END;
  PERFORM sub_assert('E3','NMCN is not a submission regulator', v_ok, v_msg);
END $e$;

-- CTD screening query
DO $e2$
DECLARE v_ok boolean := false; v_msg text;
BEGIN
  BEGIN
    INSERT INTO public.ctd_dossiers(id,company_id,product_name,active_ingredient,
                                    dosage_form,strength,status,created_by)
    VALUES ('00000000-0000-7400-d000-000000000001','00000000-0000-7400-a000-00000000000a',
            'Sub Test Syrup','Paracetamol','Oral Suspension','120mg/5ml',
            'screening_query','00000000-0000-7400-b000-000000000001');
    v_ok := true; v_msg := 'accepted';
  EXCEPTION WHEN others THEN v_msg := SQLERRM;
  END;
  PERFORM sub_assert('E4','screening_query is a valid CTD dossier sub-status', v_ok, left(v_msg,90));
END $e2$;


-- ── results ──────────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims','',false);
\echo ''
\echo '======== SUBMISSION STATUS HANDLING — TEST RESULTS ========'
SELECT id, name, verdict, detail FROM sub_results ORDER BY seq;
\echo ''
SELECT verdict, count(*) FROM sub_results GROUP BY verdict ORDER BY verdict;

-- ── cleanup ──────────────────────────────────────────────────────────
DO $cleanup$
BEGIN
  DELETE FROM public.submission_directives WHERE company_id::text LIKE '00000000-0000-7400-a000-%';
  DELETE FROM public.ctd_dossiers          WHERE id::text LIKE '00000000-0000-7400-d000-%';
  DELETE FROM public.entity_state_history  WHERE entity_type='regulatory_submission'
     AND entity_id::text LIKE '00000000-0000-7400-c000-%';
  DELETE FROM public.entity_current_state  WHERE entity_type='regulatory_submission'
     AND entity_id::text LIKE '00000000-0000-7400-c000-%';
  DELETE FROM public.regulatory_submissions WHERE company_id::text LIKE '00000000-0000-7400-a000-%';
  DELETE FROM public.company_members WHERE user_id::text LIKE '00000000-0000-7400-b000-%';
  DELETE FROM public.profiles  WHERE email LIKE 'sub-%@local.test';
  DELETE FROM auth.users       WHERE email LIKE 'sub-%@local.test';
  DELETE FROM public.companies WHERE name LIKE 'SUB %';
  RAISE NOTICE 'sub fixtures removed.';
EXCEPTION WHEN others THEN
  RAISE WARNING 'CLEANUP INCOMPLETE (%). Remove sub rows manually.', SQLERRM;
END $cleanup$;

DROP FUNCTION IF EXISTS sub_assert(text,text,boolean,text);
DROP TABLE IF EXISTS sub_results;
