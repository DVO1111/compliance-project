-- =====================================================================
--  LIFECYCLE IMMUTABILITY + STATE LOCKS — INTEGRATION TESTS
--  Covers 20260909000000_lifecycle_table_immutability.sql   (Finding B)
--     and 20260909000100_lifecycle_state_locks.sql          (Finding C)
--  LOCAL / DISPOSABLE DATABASE ONLY
-- =====================================================================
--  Finding B is a privilege question, so it is tested by attempting the
--  writes as each role rather than by reading the catalog — a grant
--  listing would not have caught the original bug either, since RLS
--  looked correct and TRUNCATE simply is not subject to it.
--
--  Finding C needs states that are actually marked locked/terminal. No
--  seeded state is, and this suite does not change that: it builds its
--  own throwaway lifecycle and removes it at the end.
--
--  Run:  psql "<local url>" -f supabase/tests/lifecycle_immutability_and_locks_test.sql
-- =====================================================================

\set ON_ERROR_STOP off

DO $guard$
BEGIN
  IF current_database() NOT IN ('postgres','criateur_local') THEN
    RAISE EXCEPTION 'REFUSING TO RUN outside a local database (got %)', current_database();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                  WHERE n.nspname='public' AND p.proname='lifecycle_transition'
                    AND pg_get_functiondef(p.oid) ~ 'LIFECYCLE_STATE_TERMINAL') THEN
    RAISE EXCEPTION 'Migration 20260909000100 has not been applied to this database.';
  END IF;
END $guard$;

DROP TABLE IF EXISTS lclk_results;
CREATE TEMP TABLE lclk_results(seq serial, id text, name text, verdict text, detail text);
GRANT ALL ON lclk_results TO authenticated, anon, service_role;
GRANT USAGE, SELECT ON SEQUENCE lclk_results_seq_seq TO authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION lclk_assert(p_id text, p_name text, p_cond boolean, p_detail text DEFAULT '')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO lclk_results(id,name,verdict,detail)
  VALUES (p_id, p_name, CASE WHEN p_cond THEN 'PASS' ELSE 'FAIL' END, p_detail);
END $$;

-- Attempt one statement as one role and record whether it was refused.
CREATE OR REPLACE FUNCTION lclk_denied(p_id text, p_name text, p_role text, p_sql text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_msg text; v_ok boolean := false;
BEGIN
  BEGIN
    EXECUTE format('SET LOCAL ROLE %I', p_role);
    EXECUTE p_sql;
    v_ok := false; v_msg := 'STATEMENT SUCCEEDED';
  EXCEPTION WHEN others THEN
    v_ok := true; v_msg := SQLERRM;
  END;
  RESET ROLE;
  PERFORM lclk_assert(p_id, p_name, v_ok, v_msg);
END $$;

-- ── fixtures ─────────────────────────────────────────────────────────
DO $fx$
DECLARE
  ca uuid := '00000000-0000-5000-a000-00000000000a';
  u  uuid := '00000000-0000-5000-b000-000000000001';
  v_def uuid; s_draft uuid; s_review uuid; s_locked uuid; s_done uuid;
BEGIN
  INSERT INTO public.companies(id,name) VALUES (ca,'LCLK Co') ON CONFLICT (id) DO NOTHING;
  INSERT INTO auth.users(id,email) VALUES (u,'lclk-user@local.test') ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.profiles(id,email,role,company_id)
    VALUES (u,'lclk-user@local.test','admin',ca) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.company_members(company_id,user_id,role,status)
    VALUES (ca,u,'owner','active') ON CONFLICT DO NOTHING;

  DELETE FROM public.lifecycle_definitions WHERE entity_type='lclk_doc';
  INSERT INTO public.lifecycle_definitions(company_id,entity_type,name,version,is_active)
  VALUES (NULL,'lclk_doc','LCLK test lifecycle',1,true) RETURNING id INTO v_def;

  -- the only rows anywhere marked locked/terminal, and they are removed
  -- again by the cleanup block at the end of this file
  INSERT INTO public.lifecycle_states(definition_id,state_key,label,sort_order,is_initial,is_locked,is_terminal)
  VALUES (v_def,'draft','Draft',0,true,false,false) RETURNING id INTO s_draft;
  INSERT INTO public.lifecycle_states(definition_id,state_key,label,sort_order,is_initial,is_locked,is_terminal)
  VALUES (v_def,'review','In Review',1,false,false,false) RETURNING id INTO s_review;
  INSERT INTO public.lifecycle_states(definition_id,state_key,label,sort_order,is_initial,is_locked,is_terminal)
  VALUES (v_def,'frozen','Frozen',2,false,true,false) RETURNING id INTO s_locked;
  INSERT INTO public.lifecycle_states(definition_id,state_key,label,sort_order,is_initial,is_locked,is_terminal)
  VALUES (v_def,'done','Done',3,false,false,true) RETURNING id INTO s_done;

  -- Outgoing transitions are declared FROM the locked and terminal states
  -- on purpose: without them the test would prove only that the graph has
  -- no exit, not that the engine refuses to take one.
  INSERT INTO public.lifecycle_transitions(definition_id,from_state_id,to_state_id,action_key,label,sort_order)
  VALUES (v_def,s_draft ,s_review,'submit'  ,'Submit'  ,0),
         (v_def,s_review,s_locked,'freeze'  ,'Freeze'  ,1),
         (v_def,s_review,s_done  ,'finish'  ,'Finish'  ,2),
         (v_def,s_locked,s_review,'unfreeze','Unfreeze',3),
         (v_def,s_done  ,s_review,'reopen'  ,'Reopen'  ,4);

  -- e1 will end up frozen, e2 will end up done
  PERFORM public.lifecycle_initialize('lclk_doc','00000000-0000-5000-c000-000000000001',ca,u,NULL);
  PERFORM public.lifecycle_initialize('lclk_doc','00000000-0000-5000-c000-000000000002',ca,u,NULL);
END $fx$;


-- =====================================================================
--  B — the engine's tables cannot be rewritten or destroyed
-- =====================================================================
DO $b$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['authenticated','anon'] LOOP
    PERFORM lclk_denied('B1.'||r, r||' cannot UPDATE entity_state_history', r,
      'UPDATE public.entity_state_history SET comment = ''tampered''');
    PERFORM lclk_denied('B2.'||r, r||' cannot DELETE from entity_state_history', r,
      'DELETE FROM public.entity_state_history');
    PERFORM lclk_denied('B3.'||r, r||' cannot TRUNCATE entity_state_history', r,
      'TRUNCATE public.entity_state_history');
    PERFORM lclk_denied('B4.'||r, r||' cannot TRUNCATE entity_current_state', r,
      'TRUNCATE public.entity_current_state');
    PERFORM lclk_denied('B5.'||r, r||' cannot UPDATE entity_current_state', r,
      'UPDATE public.entity_current_state SET entered_by = NULL');
    PERFORM lclk_denied('B6.'||r, r||' cannot TRUNCATE lifecycle configuration', r,
      'TRUNCATE public.lifecycle_transitions CASCADE');
    PERFORM lclk_denied('B7.'||r, r||' cannot DELETE lifecycle definitions', r,
      'DELETE FROM public.lifecycle_definitions');
  END LOOP;

  -- append-only means append-only for the service role too
  PERFORM lclk_denied('B8.1','service_role cannot UPDATE history','service_role',
    'UPDATE public.entity_state_history SET comment = ''tampered''');
  PERFORM lclk_denied('B8.2','service_role cannot DELETE history','service_role',
    'DELETE FROM public.entity_state_history');
  PERFORM lclk_denied('B8.3','service_role cannot TRUNCATE history','service_role',
    'TRUNCATE public.entity_state_history');
  -- and it must not be able to move an entity without writing history
  PERFORM lclk_denied('B8.4','service_role cannot write entity_current_state directly','service_role',
    'UPDATE public.entity_current_state SET entered_by = NULL');
END $b$;

-- REGRESSION: service_role must still be able to manage configuration,
-- which D01 explicitly says is its job.
DO $b9$
DECLARE v_ok boolean := true; v_msg text := '';
BEGIN
  BEGIN
    SET LOCAL ROLE service_role;
    INSERT INTO public.lifecycle_definitions(company_id,entity_type,name,version,is_active)
    VALUES (NULL,'lclk_cfg_probe','LCLK config probe',1,false);
  EXCEPTION WHEN others THEN
    v_ok := false; v_msg := SQLERRM;
  END;
  RESET ROLE;
  PERFORM lclk_assert('B9.1','service_role CAN still manage lifecycle configuration', v_ok, v_msg);
  DELETE FROM public.lifecycle_definitions WHERE entity_type='lclk_cfg_probe';
END $b9$;

-- REGRESSION: the SECURITY DEFINER engine still writes despite the revokes
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-5000-b000-000000000001","role":"authenticated"}',false);
SET ROLE authenticated;
DO $b10$
DECLARE r jsonb; n int;
BEGIN
  r := public.lifecycle_transition('lclk_doc','00000000-0000-5000-c000-000000000001','submit',
        '00000000-0000-5000-a000-00000000000a'::uuid);
  SELECT count(*) INTO n FROM public.entity_state_history
   WHERE entity_id='00000000-0000-5000-c000-000000000001';
  PERFORM lclk_assert('B10.1','the engine still transitions after the revokes', r->>'to_state'='review',
                      'to '||coalesce(r->>'to_state','NULL'));
  PERFORM lclk_assert('B10.2','and still appends history', n=2, n||' history row(s)');
END $b10$;
RESET ROLE;


-- =====================================================================
--  C — locked and terminal states are enforced
-- =====================================================================
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-5000-b000-000000000001","role":"authenticated"}',false);
SET ROLE authenticated;
DO $c1$
DECLARE r jsonb; v_msg text; v_state text; n_before int; n_after int;
BEGIN
  -- entering a locked state is allowed; it is leaving that is not
  r := public.lifecycle_transition('lclk_doc','00000000-0000-5000-c000-000000000001','freeze',
        '00000000-0000-5000-a000-00000000000a'::uuid);
  PERFORM lclk_assert('C1.1','an entity may transition INTO a locked state', r->>'to_state'='frozen',
                      'to '||coalesce(r->>'to_state','NULL'));

  SELECT count(*) INTO n_before FROM public.entity_state_history
   WHERE entity_id='00000000-0000-5000-c000-000000000001';

  BEGIN
    PERFORM public.lifecycle_transition('lclk_doc','00000000-0000-5000-c000-000000000001','unfreeze',
             '00000000-0000-5000-a000-00000000000a'::uuid);
    PERFORM lclk_assert('C1.2','a locked state blocks transitions out', false, 'transition SUCCEEDED');
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    PERFORM lclk_assert('C1.2','a locked state blocks transitions out',
                        v_msg LIKE 'LIFECYCLE_STATE_LOCKED%', v_msg);
  END;

  SELECT s.state_key INTO v_state FROM public.entity_current_state ecs
    JOIN public.lifecycle_states s ON s.id=ecs.state_id
   WHERE ecs.entity_id='00000000-0000-5000-c000-000000000001';
  SELECT count(*) INTO n_after FROM public.entity_state_history
   WHERE entity_id='00000000-0000-5000-c000-000000000001';
  PERFORM lclk_assert('C1.3','the rejection left the state unchanged', v_state='frozen', coalesce(v_state,'NULL'));
  PERFORM lclk_assert('C1.4','the rejection wrote no history', n_before=n_after, n_before||' -> '||n_after);
END $c1$;
RESET ROLE;

SET ROLE authenticated;
DO $c2$
DECLARE r jsonb; v_msg text; v_state text; n_before int; n_after int;
BEGIN
  PERFORM public.lifecycle_transition('lclk_doc','00000000-0000-5000-c000-000000000002','submit',
           '00000000-0000-5000-a000-00000000000a'::uuid);
  r := public.lifecycle_transition('lclk_doc','00000000-0000-5000-c000-000000000002','finish',
        '00000000-0000-5000-a000-00000000000a'::uuid);
  PERFORM lclk_assert('C2.1','an entity may transition INTO a terminal state', r->>'to_state'='done',
                      'to '||coalesce(r->>'to_state','NULL'));

  SELECT count(*) INTO n_before FROM public.entity_state_history
   WHERE entity_id='00000000-0000-5000-c000-000000000002';

  BEGIN
    PERFORM public.lifecycle_transition('lclk_doc','00000000-0000-5000-c000-000000000002','reopen',
             '00000000-0000-5000-a000-00000000000a'::uuid);
    PERFORM lclk_assert('C2.2','a terminal state blocks further transitions', false, 'transition SUCCEEDED');
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    PERFORM lclk_assert('C2.2','a terminal state blocks further transitions',
                        v_msg LIKE 'LIFECYCLE_STATE_TERMINAL%', v_msg);
  END;

  SELECT s.state_key INTO v_state FROM public.entity_current_state ecs
    JOIN public.lifecycle_states s ON s.id=ecs.state_id
   WHERE ecs.entity_id='00000000-0000-5000-c000-000000000002';
  SELECT count(*) INTO n_after FROM public.entity_state_history
   WHERE entity_id='00000000-0000-5000-c000-000000000002';
  PERFORM lclk_assert('C2.3','the rejection left the state unchanged', v_state='done', coalesce(v_state,'NULL'));
  PERFORM lclk_assert('C2.4','the rejection wrote no history', n_before=n_after, n_before||' -> '||n_after);
END $c2$;
RESET ROLE;

-- service_role is NOT exempt: locked and terminal are structural, not privileges
SET ROLE service_role;
DO $c3$
DECLARE v_msg text;
BEGIN
  BEGIN
    PERFORM public.lifecycle_transition('lclk_doc','00000000-0000-5000-c000-000000000001','unfreeze',
             '00000000-0000-5000-a000-00000000000a'::uuid,'00000000-0000-5000-b000-000000000001'::uuid);
    PERFORM lclk_assert('C3.1','service_role cannot leave a locked state either', false, 'transition SUCCEEDED');
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    PERFORM lclk_assert('C3.1','service_role cannot leave a locked state either',
                        v_msg LIKE 'LIFECYCLE_STATE_LOCKED%', v_msg);
  END;

  BEGIN
    PERFORM public.lifecycle_transition('lclk_doc','00000000-0000-5000-c000-000000000002','reopen',
             '00000000-0000-5000-a000-00000000000a'::uuid,'00000000-0000-5000-b000-000000000001'::uuid);
    PERFORM lclk_assert('C3.2','service_role cannot leave a terminal state either', false, 'transition SUCCEEDED');
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    PERFORM lclk_assert('C3.2','service_role cannot leave a terminal state either',
                        v_msg LIKE 'LIFECYCLE_STATE_TERMINAL%', v_msg);
  END;
END $c3$;
RESET ROLE;

-- available_actions must report the same reason the transition would give
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-5000-b000-000000000001","role":"authenticated"}',false);
SET ROLE authenticated;
DO $c4$
DECLARE n_locked int; n_terminal int; v_reason_l text; v_reason_t text; n_perm int;
BEGIN
  SELECT count(*), max(blocked_reason) INTO n_locked, v_reason_l
    FROM public.lifecycle_available_actions('lclk_doc','00000000-0000-5000-c000-000000000001','00000000-0000-5000-a000-00000000000a')
   WHERE is_permitted = false;
  PERFORM lclk_assert('C4.1','every action from a locked state is reported blocked',
                      n_locked = 1 AND v_reason_l = 'LIFECYCLE_STATE_LOCKED',
                      n_locked||' blocked, reason '||coalesce(v_reason_l,'NULL'));

  SELECT count(*), max(blocked_reason) INTO n_terminal, v_reason_t
    FROM public.lifecycle_available_actions('lclk_doc','00000000-0000-5000-c000-000000000002','00000000-0000-5000-a000-00000000000a')
   WHERE is_permitted = false;
  PERFORM lclk_assert('C4.2','every action from a terminal state is reported blocked',
                      n_terminal = 1 AND v_reason_t = 'LIFECYCLE_STATE_TERMINAL',
                      n_terminal||' blocked, reason '||coalesce(v_reason_t,'NULL'));
END $c4$;
RESET ROLE;

-- an ordinary state is unaffected
DO $c5$
DECLARE n_ok int;
BEGIN
  PERFORM public.lifecycle_initialize('lclk_doc','00000000-0000-5000-c000-000000000003',
           '00000000-0000-5000-a000-00000000000a', '00000000-0000-5000-b000-000000000001');
  PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-5000-b000-000000000001","role":"authenticated"}',false);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n_ok
    FROM public.lifecycle_available_actions('lclk_doc','00000000-0000-5000-c000-000000000003','00000000-0000-5000-a000-00000000000a')
   WHERE is_permitted;
  RESET ROLE;
  PERFORM lclk_assert('C5.1','an ordinary state still offers its actions', n_ok = 1, n_ok||' permitted');
END $c5$;

-- backfill: initialising DIRECTLY into a terminal state is still allowed
DO $c6$
DECLARE r jsonb; v_ok boolean := true; v_msg text := '';
BEGIN
  BEGIN
    r := public.lifecycle_initialize('lclk_doc','00000000-0000-5000-c000-000000000004',
          '00000000-0000-5000-a000-00000000000a','00000000-0000-5000-b000-000000000001','done');
  EXCEPTION WHEN others THEN v_ok := false; v_msg := SQLERRM;
  END;
  PERFORM lclk_assert('C6.1','a historical record can still be backfilled into a terminal state',
                      v_ok AND r->>'state_key'='done', coalesce(v_msg, '')||coalesce(r->>'state_key',''));
END $c6$;

SELECT set_config('request.jwt.claims','',false);


-- ── results ──────────────────────────────────────────────────────────
\echo ''
\echo '===== LIFECYCLE IMMUTABILITY + STATE LOCKS — TEST RESULTS ====='
SELECT id, name, verdict, detail FROM lclk_results ORDER BY seq;
\echo ''
SELECT verdict, count(*) FROM lclk_results GROUP BY verdict ORDER BY verdict;

-- ── cleanup ──────────────────────────────────────────────────────────
DO $cleanup$
BEGIN
  DELETE FROM public.entity_state_history WHERE entity_id::text LIKE '00000000-0000-5000-c000-%';
  DELETE FROM public.entity_current_state WHERE entity_id::text LIKE '00000000-0000-5000-c000-%';
  DELETE FROM public.lifecycle_definitions WHERE entity_type IN ('lclk_doc','lclk_cfg_probe');
  DELETE FROM public.company_members WHERE user_id::text LIKE '00000000-0000-5000-b000-%';
  DELETE FROM public.profiles  WHERE email LIKE 'lclk-%@local.test';
  DELETE FROM auth.users       WHERE email LIKE 'lclk-%@local.test';
  DELETE FROM public.companies WHERE name LIKE 'LCLK%';
  RAISE NOTICE 'LCLK fixtures removed.';
EXCEPTION WHEN others THEN
  RAISE WARNING 'CLEANUP INCOMPLETE (%). Remove LCLK rows manually.', SQLERRM;
END $cleanup$;

DROP FUNCTION IF EXISTS lclk_assert(text,text,boolean,text);
DROP FUNCTION IF EXISTS lclk_denied(text,text,text,text);
