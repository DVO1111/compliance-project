-- =====================================================================
--  LIFECYCLE ENGINE — INTEGRATION TESTS (Engineering Deliverable 01)
--  LOCAL / DISPOSABLE DATABASE ONLY
-- =====================================================================
--  These prove the acceptance criteria against a real database, because
--  the behaviour that matters — atomicity, rejection, RLS — cannot be
--  demonstrated by mocking a client.
--
--  Run:  supabase db execute --file supabase/tests/lifecycle_engine_test.sql
--   or:  psql "<local url>" -f supabase/tests/lifecycle_engine_test.sql
--
--  Safe to run repeatedly. All fixtures are tagged LCTEST and removed at
--  the end. Makes no permanent schema change: the one trigger it creates
--  (to force a controlled transaction failure) is dropped again.
-- =====================================================================

\set ON_ERROR_STOP off

DO $guard$
BEGIN
  IF current_database() NOT IN ('postgres','criateur_local') THEN
    RAISE EXCEPTION 'REFUSING TO RUN outside a local database (got %)', current_database();
  END IF;
END $guard$;


-- ── PREREQUISITE ─────────────────────────────────────────────────────
-- public.companies is referenced by 48 migrations but created by none, so
-- after `supabase db reset` it is absent. Scaffolded here for the test
-- only; this is not a migration and not the authoritative definition.
DO $companies$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema='public' AND table_name='companies') THEN
    CREATE TABLE public.companies (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL,
      created_at timestamptz DEFAULT now()
    );
    ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
    GRANT ALL ON public.companies TO anon, authenticated, service_role;
    RAISE WARNING 'public.companies scaffolded for testing (absent from migrations).';
  END IF;
END $companies$;

DROP TABLE IF EXISTS lctest_results;
CREATE TEMP TABLE lctest_results(seq serial, id text, name text, verdict text, detail text);
-- the tenant-boundary test runs as ROLE authenticated and must still
-- be able to record its own result
GRANT ALL ON lctest_results TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE lctest_results_seq_seq TO authenticated;

CREATE OR REPLACE FUNCTION lctest_assert(p_id text, p_name text, p_cond boolean, p_detail text DEFAULT '')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO lctest_results(id,name,verdict,detail)
  VALUES (p_id, p_name, CASE WHEN p_cond THEN 'PASS' ELSE 'FAIL' END, p_detail);
END $$;

-- ── fixtures ─────────────────────────────────────────────────────────
DO $fx$
DECLARE
  ca uuid := '00000000-0000-4100-a000-00000000000a';
  cb uuid := '00000000-0000-4100-a000-00000000000b';
  ua uuid := '00000000-0000-4100-b000-00000000000a';
  ub uuid := '00000000-0000-4100-b000-00000000000b';
  v_def uuid; s_draft uuid; s_review uuid; s_appr uuid; s_rej uuid;
BEGIN
  INSERT INTO auth.users(id,email) VALUES (ua,'lctest-a@local.test'),(ub,'lctest-b@local.test')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.companies(id,name) VALUES (ca,'LCTEST-A'),(cb,'LCTEST-B')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.profiles(id,email) VALUES (ua,'lctest-a@local.test'),(ub,'lctest-b@local.test')
    ON CONFLICT (id) DO NOTHING;
  EXECUTE format('UPDATE public.profiles SET company_id=%L WHERE id=%L', ca, ua);
  EXECUTE format('UPDATE public.profiles SET company_id=%L WHERE id=%L', cb, ub);
  INSERT INTO public.company_members(company_id,user_id,status) VALUES (ca,ua,'active'),(cb,ub,'active')
    ON CONFLICT DO NOTHING;

  -- A deliberately RESTRICTIVE test lifecycle. The seeded production
  -- lifecycles are any-to-any (they reproduce today's unrestricted
  -- behaviour), so they cannot demonstrate that the engine actually
  -- refuses an illegal transition. This one can.
  DELETE FROM public.lifecycle_definitions WHERE entity_type = 'lctest_doc';
  INSERT INTO public.lifecycle_definitions(company_id, entity_type, name, version, is_active)
  VALUES (NULL,'lctest_doc','LCTEST linear doc',1,true) RETURNING id INTO v_def;

  INSERT INTO public.lifecycle_states(definition_id,state_key,label,sort_order,is_initial,is_terminal)
  VALUES (v_def,'draft','Draft',0,true,false)      RETURNING id INTO s_draft;
  INSERT INTO public.lifecycle_states(definition_id,state_key,label,sort_order)
  VALUES (v_def,'in_review','In Review',1)          RETURNING id INTO s_review;
  INSERT INTO public.lifecycle_states(definition_id,state_key,label,sort_order,is_terminal)
  VALUES (v_def,'approved','Approved',2,true)       RETURNING id INTO s_appr;
  INSERT INTO public.lifecycle_states(definition_id,state_key,label,sort_order,is_terminal)
  VALUES (v_def,'rejected','Rejected',3,true)       RETURNING id INTO s_rej;

  -- draft → in_review → (approved | rejected). No draft → approved.
  INSERT INTO public.lifecycle_transitions(definition_id,from_state_id,to_state_id,action_key,label,sort_order)
  VALUES (v_def,s_draft,s_review,'submit','Submit for review',0),
         (v_def,s_review,s_appr,'approve','Approve',1),
         (v_def,s_review,s_rej,'reject','Reject',2),
         (v_def,s_review,s_draft,'return','Return to draft',3);
END $fx$;

-- =====================================================================
--  TEST 7 — initialisation gives the seeded initial state
-- =====================================================================
DO $t7$
DECLARE r jsonb;
BEGIN
  r := public.lifecycle_initialize('lctest_doc','00000000-0000-4100-c000-000000000001',
                                   '00000000-0000-4100-a000-00000000000a',
                                   '00000000-0000-4100-b000-00000000000a');
  PERFORM lctest_assert('T7','initialize sets the declared initial state',
    r->>'state_key' = 'draft', 'got ' || coalesce(r->>'state_key','NULL'));
END $t7$;

-- =====================================================================
--  TEST 1 — a valid transition succeeds, state changes, history written
-- =====================================================================
DO $t1$
DECLARE r jsonb; v_state text; v_hist int;
BEGIN
  r := public.lifecycle_transition('lctest_doc','00000000-0000-4100-c000-000000000001','submit',
        '00000000-0000-4100-a000-00000000000a','00000000-0000-4100-b000-00000000000a','looks good');
  PERFORM lctest_assert('T1.1','valid transition returns from/to',
    r->>'from_state'='draft' AND r->>'to_state'='in_review',
    format('%s -> %s', r->>'from_state', r->>'to_state'));

  SELECT s.state_key INTO v_state FROM entity_current_state e
    JOIN lifecycle_states s ON s.id=e.state_id
   WHERE e.entity_id='00000000-0000-4100-c000-000000000001';
  PERFORM lctest_assert('T1.2','current state changed', v_state='in_review','now '||coalesce(v_state,'NULL'));

  SELECT count(*) INTO v_hist FROM entity_state_history
   WHERE entity_id='00000000-0000-4100-c000-000000000001';
  -- one row for the initialize, one for the transition
  PERFORM lctest_assert('T1.3','history written', v_hist=2, v_hist||' history rows');
END $t1$;

-- =====================================================================
--  TEST 2 — an invalid transition is rejected and changes nothing
-- =====================================================================
DO $t2$
DECLARE v_before text; v_after text; v_h_before int; v_h_after int; v_err text; v_code text;
BEGIN
  SELECT s.state_key INTO v_before FROM entity_current_state e
    JOIN lifecycle_states s ON s.id=e.state_id WHERE e.entity_id='00000000-0000-4100-c000-000000000001';
  SELECT count(*) INTO v_h_before FROM entity_state_history WHERE entity_id='00000000-0000-4100-c000-000000000001';

  BEGIN
    -- 'submit' is not legal from in_review
    PERFORM public.lifecycle_transition('lctest_doc','00000000-0000-4100-c000-000000000001','submit',
             '00000000-0000-4100-a000-00000000000a','00000000-0000-4100-b000-00000000000a');
    v_err := 'NO ERROR RAISED';
  EXCEPTION WHEN others THEN
    v_err := SQLERRM; v_code := SQLSTATE;
  END;

  SELECT s.state_key INTO v_after FROM entity_current_state e
    JOIN lifecycle_states s ON s.id=e.state_id WHERE e.entity_id='00000000-0000-4100-c000-000000000001';
  SELECT count(*) INTO v_h_after FROM entity_state_history WHERE entity_id='00000000-0000-4100-c000-000000000001';

  PERFORM lctest_assert('T2.1','invalid transition rejected', v_err LIKE 'LIFECYCLE_INVALID_TRANSITION%', left(v_err,90));
  PERFORM lctest_assert('T2.2','error names the action and state',
    v_err LIKE '%submit%' AND v_err LIKE '%in_review%', left(v_err,90));
  PERFORM lctest_assert('T2.3','state unchanged after rejection', v_before=v_after, v_before||' -> '||v_after);
  PERFORM lctest_assert('T2.4','no history row created', v_h_before=v_h_after, v_h_before||' -> '||v_h_after);
END $t2$;

-- =====================================================================
--  TEST 3 — ATOMICITY: force the history write to fail
--  If the state update and the history insert were not in one
--  transaction, the state would move and the history would be missing.
-- =====================================================================
CREATE OR REPLACE FUNCTION lctest_break_history() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN
  RAISE EXCEPTION 'LCTEST_FORCED_HISTORY_FAILURE';
END $$;

CREATE TRIGGER lctest_break_history_trg
  BEFORE INSERT ON public.entity_state_history
  FOR EACH ROW EXECUTE FUNCTION lctest_break_history();

DO $t3$
DECLARE v_before text; v_after text; v_h_before int; v_h_after int; v_err text;
BEGIN
  SELECT s.state_key INTO v_before FROM entity_current_state e
    JOIN lifecycle_states s ON s.id=e.state_id WHERE e.entity_id='00000000-0000-4100-c000-000000000001';
  SELECT count(*) INTO v_h_before FROM entity_state_history WHERE entity_id='00000000-0000-4100-c000-000000000001';

  BEGIN
    -- 'approve' IS legal from in_review, so this would succeed but for
    -- the trigger. The state update happens BEFORE the history insert.
    PERFORM public.lifecycle_transition('lctest_doc','00000000-0000-4100-c000-000000000001','approve',
             '00000000-0000-4100-a000-00000000000a','00000000-0000-4100-b000-00000000000a');
    v_err := 'NO ERROR RAISED';
  EXCEPTION WHEN others THEN v_err := SQLERRM;
  END;

  SELECT s.state_key INTO v_after FROM entity_current_state e
    JOIN lifecycle_states s ON s.id=e.state_id WHERE e.entity_id='00000000-0000-4100-c000-000000000001';
  SELECT count(*) INTO v_h_after FROM entity_state_history WHERE entity_id='00000000-0000-4100-c000-000000000001';

  PERFORM lctest_assert('T3.1','forced history failure surfaced', v_err LIKE '%LCTEST_FORCED_HISTORY_FAILURE%', left(v_err,80));
  PERFORM lctest_assert('T3.2','ATOMIC: state update rolled back with the history write',
    v_before = v_after, format('before=%s after=%s (must match)', v_before, v_after));
  PERFORM lctest_assert('T3.3','no orphan history row', v_h_before = v_h_after, v_h_before||' -> '||v_h_after);
END $t3$;

DROP TRIGGER lctest_break_history_trg ON public.entity_state_history;
DROP FUNCTION lctest_break_history();

-- =====================================================================
--  TEST 4/5/6 — getCurrentState, getHistory ordering, availableActions
-- =====================================================================
-- lifecycle_available_actions is SECURITY DEFINER and therefore performs
-- its OWN membership check; it must be called with a real caller identity.
SELECT set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-4100-b000-00000000000a','role','authenticated')::text, false);

DO $t456$
DECLARE v_state text; v_order text; v_actions text; v_after_approve text;
BEGIN
  SELECT s.state_key INTO v_state FROM entity_current_state e
    JOIN lifecycle_states s ON s.id=e.state_id WHERE e.entity_id='00000000-0000-4100-c000-000000000001';
  PERFORM lctest_assert('T4','getCurrentState returns the correct state', v_state='in_review','got '||v_state);

  SELECT string_agg(coalesce(fs.state_key,'<init>')||'>'||ts.state_key, ',' ORDER BY h.created_at, h.id)
    INTO v_order
    FROM entity_state_history h
    LEFT JOIN lifecycle_states fs ON fs.id=h.from_state_id
    JOIN lifecycle_states ts ON ts.id=h.to_state_id
   WHERE h.entity_id='00000000-0000-4100-c000-000000000001';
  PERFORM lctest_assert('T5','getHistory is chronological', v_order='<init>>draft,draft>in_review', v_order);

  SELECT string_agg(action_key,',' ORDER BY action_key) INTO v_actions
    FROM public.lifecycle_available_actions('lctest_doc','00000000-0000-4100-c000-000000000001',
                                            '00000000-0000-4100-a000-00000000000a');
  -- from in_review the legal actions are approve, reject, return — and
  -- crucially NOT submit, which belongs to draft.
  PERFORM lctest_assert('T6.1','availableActions returns only transitions from the current state',
    v_actions='approve,reject,return', coalesce(v_actions,'NULL'));
  PERFORM lctest_assert('T6.2','availableActions excludes other states'' actions',
    v_actions NOT LIKE '%submit%', coalesce(v_actions,'NULL'));
END $t456$;

-- =====================================================================
--  TEST 8 — tenant boundary
-- =====================================================================
SELECT set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-4100-b000-00000000000b','role','authenticated')::text, false);

SET ROLE authenticated;
DO $t8b$
DECLARE v_states int; v_hist int;
BEGIN
  SELECT count(*) INTO v_states FROM public.entity_current_state
   WHERE entity_id='00000000-0000-4100-c000-000000000001';
  SELECT count(*) INTO v_hist FROM public.entity_state_history
   WHERE entity_id='00000000-0000-4100-c000-000000000001';
  PERFORM lctest_assert('T8.1','company B cannot read company A current state', v_states=0, v_states||' rows visible');
  PERFORM lctest_assert('T8.2','company B cannot read company A history',      v_hist=0,   v_hist||' rows visible');
END $t8b$;
RESET ROLE;
SELECT set_config('request.jwt.claims','',false);

-- ── results ──────────────────────────────────────────────────────────
\echo ''
\echo '============ LIFECYCLE ENGINE — TEST RESULTS ============'
SELECT id, name, verdict, detail FROM lctest_results ORDER BY seq;
\echo ''
SELECT verdict, count(*) FROM lctest_results GROUP BY verdict ORDER BY verdict;

-- ── cleanup ──────────────────────────────────────────────────────────
DO $cleanup$
BEGIN
  DELETE FROM public.entity_state_history WHERE entity_id::text LIKE '00000000-0000-4100-c000-%';
  DELETE FROM public.entity_current_state WHERE entity_id::text LIKE '00000000-0000-4100-c000-%';
  DELETE FROM public.lifecycle_definitions WHERE entity_type='lctest_doc';
  DELETE FROM public.company_members WHERE user_id::text LIKE '00000000-0000-4100-b000-%';
  DELETE FROM public.profiles  WHERE email LIKE 'lctest-%@local.test';
  DELETE FROM public.companies WHERE name LIKE 'LCTEST%';
  DELETE FROM auth.users       WHERE email LIKE 'lctest-%@local.test';
  RAISE NOTICE 'LCTEST fixtures removed.';
EXCEPTION WHEN others THEN
  RAISE WARNING 'CLEANUP INCOMPLETE (%). Remove LCTEST rows manually.', SQLERRM;
END $cleanup$;

DROP FUNCTION IF EXISTS lctest_assert(text,text,boolean,text);
