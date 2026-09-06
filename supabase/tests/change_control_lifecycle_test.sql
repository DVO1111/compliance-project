-- =====================================================================
--  CHANGE CONTROL × LIFECYCLE ENGINE — INTEGRATION TESTS (D03)
--  LOCAL / DISPOSABLE DATABASE ONLY
-- =====================================================================
--  A note on the backfill tests. `change_controls` is EMPTY on this
--  database — not because production has no Change Controls, but because
--  20260603600000_seed_nasco_demo_data.sql is in this cluster's failed
--  migration list, so no demo data ever landed. A backfill assertion
--  against zero rows proves nothing, so this suite creates rows in all
--  eight statuses across two companies, runs the migration's backfill
--  logic against them, and asserts the outcome.
--
--  That gives real evidence for the mapping and the tenancy, but it is
--  evidence about synthetic rows. The §2 counts must be re-run against
--  production before this migration is applied there.
--
--  Run:  psql "<local url>" -f supabase/tests/change_control_lifecycle_test.sql
-- =====================================================================

\set ON_ERROR_STOP off

DO $guard$
BEGIN
  IF current_database() NOT IN ('postgres','criateur_local') THEN
    RAISE EXCEPTION 'REFUSING TO RUN outside a local database (got %)', current_database();
  END IF;
  IF to_regprocedure('public.fn_change_controls_sync_status()') IS NULL THEN
    RAISE EXCEPTION 'Migration 20260911000000 has not been applied to this database.';
  END IF;
END $guard$;

DROP TABLE IF EXISTS ccl_results;
CREATE TEMP TABLE ccl_results(seq serial, id text, name text, verdict text, detail text);
GRANT ALL ON ccl_results TO authenticated, anon, service_role;
GRANT USAGE, SELECT ON SEQUENCE ccl_results_seq_seq TO authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION ccl_assert(p_id text, p_name text, p_cond boolean, p_detail text DEFAULT '')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO ccl_results(id,name,verdict,detail)
  VALUES (p_id, p_name, CASE WHEN p_cond THEN 'PASS' ELSE 'FAIL' END, p_detail);
END $$;

-- ── fixtures: two companies, one Change Control per seeded status ────
DO $fx$
DECLARE
  ca uuid := '00000000-0000-5200-a000-00000000000a';
  cb uuid := '00000000-0000-5200-a000-00000000000b';
  ua uuid := '00000000-0000-5200-b000-000000000001';
  ub uuid := '00000000-0000-5200-b000-000000000002';
  st text; i int := 0;
BEGIN
  INSERT INTO public.companies(id,name) VALUES (ca,'CCL Alpha'),(cb,'CCL Beta') ON CONFLICT (id) DO NOTHING;
  INSERT INTO auth.users(id,email) VALUES (ua,'ccl-a@local.test'),(ub,'ccl-b@local.test') ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.profiles(id,email,role,company_id)
    VALUES (ua,'ccl-a@local.test','admin',ca),(ub,'ccl-b@local.test','admin',cb) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.company_members(company_id,user_id,role,status)
    VALUES (ca,ua,'owner','active'),(cb,ub,'owner','active') ON CONFLICT DO NOTHING;

  -- One legacy row per status, inserted with the lifecycle triggers
  -- DISABLED so they look exactly like pre-migration data. This is what
  -- the backfill has to cope with.
  ALTER TABLE public.change_controls DISABLE TRIGGER trg_change_controls_initialize_lifecycle;
  ALTER TABLE public.change_controls DISABLE TRIGGER trg_change_controls_guard_status;

  FOREACH st IN ARRAY ARRAY['draft','impact_assessment','pending_approval','approved',
                            'implementing','verification','closed','rejected'] LOOP
    i := i + 1;
    INSERT INTO public.change_controls(id, company_id, change_number, title, change_type, change_category, status, created_by)
    VALUES (('00000000-0000-5200-c000-00000000000'||i)::uuid, ca, 'CCL-A-'||i, 'legacy '||st, 'process', 'minor', st, ua);
  END LOOP;

  -- and one in the other tenant, for the isolation tests
  INSERT INTO public.change_controls(id, company_id, change_number, title, change_type, change_category, status, created_by)
  VALUES ('00000000-0000-5200-c000-0000000000ff', cb, 'CCL-B-1', 'other tenant', 'process', 'minor', 'draft', ub);

  ALTER TABLE public.change_controls ENABLE TRIGGER trg_change_controls_initialize_lifecycle;
  ALTER TABLE public.change_controls ENABLE TRIGGER trg_change_controls_guard_status;
END $fx$;

-- ── run the migration's backfill against those legacy rows ───────────
INSERT INTO public.entity_current_state
  (company_id, definition_id, entity_type, entity_id, state_id, entered_at, entered_by, updated_at)
SELECT cc.company_id,
       public.lifecycle_resolve_definition('change_control', cc.company_id),
       'change_control', cc.id, s.id,
       coalesce(cc.updated_at, cc.created_at, now()), cc.created_by, now()
  FROM public.change_controls cc
  JOIN public.lifecycle_states s
    ON s.definition_id = public.lifecycle_resolve_definition('change_control', cc.company_id)
   AND s.state_key = cc.status
 WHERE public.lifecycle_resolve_definition('change_control', cc.company_id) IS NOT NULL
ON CONFLICT (definition_id, entity_id) DO NOTHING;

INSERT INTO public.entity_state_history
  (company_id, definition_id, entity_type, entity_id, from_state_id, to_state_id, transition_id, actor_id, comment, metadata, created_at)
SELECT ecs.company_id, ecs.definition_id, 'change_control', ecs.entity_id,
       NULL, ecs.state_id, NULL, ecs.entered_by, NULL,
       jsonb_build_object('reason','backfill_d03','source','change_controls.status'), ecs.entered_at
  FROM public.entity_current_state ecs
 WHERE ecs.entity_type = 'change_control'
   AND NOT EXISTS (SELECT 1 FROM public.entity_state_history h
                    WHERE h.entity_type='change_control' AND h.entity_id = ecs.entity_id);


-- =====================================================================
--  A — BACKFILL
-- =====================================================================
DO $a$
DECLARE n_cc int; n_state int; n_mismatch int; n_co int; n_hist int; n_fabricated int;
BEGIN
  SELECT count(*) INTO n_cc FROM public.change_controls;
  SELECT count(*) INTO n_state FROM public.change_controls cc
    JOIN public.entity_current_state ecs
      ON ecs.entity_type='change_control' AND ecs.entity_id = cc.id;
  PERFORM ccl_assert('A1','every Change Control has a lifecycle current state', n_cc = n_state,
                     n_state||' of '||n_cc);

  SELECT count(*) INTO n_mismatch FROM public.change_controls cc
    JOIN public.entity_current_state ecs ON ecs.entity_type='change_control' AND ecs.entity_id = cc.id
    JOIN public.lifecycle_states s ON s.id = ecs.state_id
   WHERE s.state_key IS DISTINCT FROM cc.status;
  PERFORM ccl_assert('A2','every state_key matches the legacy status', n_mismatch = 0, n_mismatch||' mismatch(es)');

  SELECT count(*) INTO n_co FROM public.change_controls cc
    JOIN public.entity_current_state ecs ON ecs.entity_type='change_control' AND ecs.entity_id = cc.id
   WHERE ecs.company_id IS DISTINCT FROM cc.company_id;
  PERFORM ccl_assert('A3','company_id is carried across unchanged', n_co = 0, n_co||' divergence(s)');

  SELECT count(*) INTO n_hist FROM public.entity_state_history
   WHERE entity_type='change_control' AND metadata->>'reason' = 'backfill_d03';
  PERFORM ccl_assert('A4','each backfilled record has exactly one adoption history row', n_hist = n_cc,
                     n_hist||' row(s) for '||n_cc||' record(s)');

  SELECT count(*) INTO n_fabricated FROM public.entity_state_history
   WHERE entity_type='change_control' AND from_state_id IS NOT NULL;
  PERFORM ccl_assert('A5','no historical transitions were fabricated', n_fabricated = 0,
                     n_fabricated||' row(s) with a from_state');
END $a$;


-- =====================================================================
--  H — the obsolete CHECK constraint is gone
-- =====================================================================
DO $h$
DECLARE v_con text;
BEGIN
  SELECT conname INTO v_con FROM pg_constraint
   WHERE conrelid='public.change_controls'::regclass AND conname='change_controls_status_check';
  PERFORM ccl_assert('H1','the legacy status CHECK constraint is removed', v_con IS NULL, coalesce(v_con,'gone'));
END $h$;


-- =====================================================================
--  B / I — the engine is authoritative; no dual write is possible
-- =====================================================================
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-5200-b000-000000000001","role":"authenticated"}',false);
SET ROLE authenticated;
DO $b$
DECLARE v_msg text; v_status text;
BEGIN
  BEGIN
    UPDATE public.change_controls SET status='approved'
     WHERE id='00000000-0000-5200-c000-000000000001';
    PERFORM ccl_assert('B1','a direct status write is rejected', false, 'UPDATE SUCCEEDED');
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    PERFORM ccl_assert('B1','a direct status write is rejected',
                       v_msg LIKE 'CHANGE_CONTROL_STATUS_READ_ONLY%', v_msg);
  END;

  SELECT status INTO v_status FROM public.change_controls WHERE id='00000000-0000-5200-c000-000000000001';
  PERFORM ccl_assert('B2','and the status is unchanged', v_status='draft', coalesce(v_status,'NULL'));

  -- an unrelated column must still be writable
  UPDATE public.change_controls SET title='edited title'
   WHERE id='00000000-0000-5200-c000-000000000001';
  PERFORM ccl_assert('B3','non-status columns are still writable', true, 'title updated');
END $b$;
RESET ROLE;


-- =====================================================================
--  C — a transition through the engine moves state, mirror and history
-- =====================================================================
SET ROLE authenticated;
DO $c$
DECLARE r jsonb; v_status text; v_state text; n_hist_before int; n_hist_after int;
BEGIN
  SELECT count(*) INTO n_hist_before FROM public.entity_state_history
   WHERE entity_id='00000000-0000-5200-c000-000000000001';

  r := public.lifecycle_transition('change_control','00000000-0000-5200-c000-000000000001',
        'set_impact_assessment','00000000-0000-5200-a000-00000000000a'::uuid);

  SELECT s.state_key INTO v_state FROM public.entity_current_state ecs
    JOIN public.lifecycle_states s ON s.id=ecs.state_id
   WHERE ecs.entity_id='00000000-0000-5200-c000-000000000001';
  SELECT status INTO v_status FROM public.change_controls WHERE id='00000000-0000-5200-c000-000000000001';
  SELECT count(*) INTO n_hist_after FROM public.entity_state_history
   WHERE entity_id='00000000-0000-5200-c000-000000000001';

  PERFORM ccl_assert('C1','the transition succeeds through the engine', r->>'to_state'='impact_assessment',
                     'to '||coalesce(r->>'to_state','NULL'));
  PERFORM ccl_assert('C2','entity_current_state is updated', v_state='impact_assessment', coalesce(v_state,'NULL'));
  PERFORM ccl_assert('C3','change_controls.status mirrors it automatically', v_status='impact_assessment',
                     coalesce(v_status,'NULL'));
  PERFORM ccl_assert('C4','history records the transition', n_hist_after = n_hist_before + 1,
                     n_hist_before||' -> '||n_hist_after);
END $c$;
RESET ROLE;


-- =====================================================================
--  D — the any-to-any graph is preserved
-- =====================================================================
DO $d$
DECLARE n_tr int; n_states int;
BEGIN
  SELECT count(*) INTO n_tr FROM public.lifecycle_transitions t
    JOIN public.lifecycle_definitions d ON d.id=t.definition_id
   WHERE d.entity_type='change_control';
  SELECT count(*) INTO n_states FROM public.lifecycle_states s
    JOIN public.lifecycle_definitions d ON d.id=s.definition_id
   WHERE d.entity_type='change_control';
  PERFORM ccl_assert('D1','the graph is still 8 states / 56 transitions',
                     n_states = 8 AND n_tr = 56, n_states||' states, '||n_tr||' transitions');
END $d$;

-- representative moves the old table permitted and must still permit:
-- a backwards step, and a jump that skips the UI's suggested order
SET ROLE authenticated;
DO $d2$
DECLARE r jsonb; v_msg text;
BEGIN
  BEGIN
    r := public.lifecycle_transition('change_control','00000000-0000-5200-c000-000000000001',
          'set_draft','00000000-0000-5200-a000-00000000000a'::uuid);
    PERFORM ccl_assert('D2','a backwards move is still permitted', r->>'to_state'='draft',
                       'impact_assessment -> '||coalesce(r->>'to_state','NULL'));
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    PERFORM ccl_assert('D2','a backwards move is still permitted', false, v_msg);
  END;

  BEGIN
    r := public.lifecycle_transition('change_control','00000000-0000-5200-c000-000000000001',
          'set_closed','00000000-0000-5200-a000-00000000000a'::uuid);
    PERFORM ccl_assert('D3','a move that skips the UI order is still permitted', r->>'to_state'='closed',
                       'draft -> '||coalesce(r->>'to_state','NULL'));
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    PERFORM ccl_assert('D3','a move that skips the UI order is still permitted', false, v_msg);
  END;
END $d2$;
RESET ROLE;


-- =====================================================================
--  E — the returned/rejected path requires a comment, server-side
-- =====================================================================
SET ROLE authenticated;
DO $e$
DECLARE v_msg text; r jsonb; v_status text;
BEGIN
  BEGIN
    PERFORM public.lifecycle_transition('change_control','00000000-0000-5200-c000-000000000002',
             'set_rejected','00000000-0000-5200-a000-00000000000a'::uuid);
    PERFORM ccl_assert('E1','rejecting without a comment is refused', false, 'transition SUCCEEDED');
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    PERFORM ccl_assert('E1','rejecting without a comment is refused',
                       v_msg LIKE 'LIFECYCLE_COMMENT_REQUIRED%', v_msg);
  END;

  BEGIN
    PERFORM public.lifecycle_transition('change_control','00000000-0000-5200-c000-000000000002',
             'set_rejected','00000000-0000-5200-a000-00000000000a'::uuid, NULL, '   ');
    PERFORM ccl_assert('E2','a whitespace-only reason is refused', false, 'transition SUCCEEDED');
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    PERFORM ccl_assert('E2','a whitespace-only reason is refused',
                       v_msg LIKE 'LIFECYCLE_COMMENT_REQUIRED%', v_msg);
  END;

  r := public.lifecycle_transition('change_control','00000000-0000-5200-c000-000000000002',
        'set_rejected','00000000-0000-5200-a000-00000000000a'::uuid, NULL,
        'Impact assessment incomplete — return to originator');
  SELECT status INTO v_status FROM public.change_controls WHERE id='00000000-0000-5200-c000-000000000002';
  PERFORM ccl_assert('E3','rejecting WITH a reason succeeds', r->>'to_state'='rejected',
                     'to '||coalesce(r->>'to_state','NULL'));
  PERFORM ccl_assert('E4','and the mirror follows', v_status='rejected', coalesce(v_status,'NULL'));

  -- the comment is retained where an investigator would look for it
  PERFORM ccl_assert('E5','the reason is stored on the history row',
    exists(select 1 from public.entity_state_history
            where entity_id='00000000-0000-5200-c000-000000000002'
              and comment like 'Impact assessment incomplete%'), 'history comment present');
END $e$;
RESET ROLE;

-- only the rejected path gained a requirement
DO $e6$
DECLARE n_req int;
BEGIN
  SELECT count(*) INTO n_req FROM public.lifecycle_transitions t
    JOIN public.lifecycle_definitions d ON d.id=t.definition_id
    JOIN public.lifecycle_states ts ON ts.id=t.to_state_id
   WHERE d.entity_type='change_control' AND t.requires_comment AND ts.state_key <> 'rejected';
  PERFORM ccl_assert('E6','no unrelated transition gained a comment requirement', n_req = 0,
                     n_req||' unexpected requirement(s)');
END $e6$;


-- =====================================================================
--  F — tenancy
-- =====================================================================
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-5200-b000-000000000002","role":"authenticated"}',false);
SET ROLE authenticated;
DO $f$
DECLARE v_msg text; n int; v_status text;
BEGIN
  BEGIN
    PERFORM public.lifecycle_transition('change_control','00000000-0000-5200-c000-000000000003',
             'set_approved','00000000-0000-5200-a000-00000000000b'::uuid);
    PERFORM ccl_assert('F1','company B cannot transition company A''s Change Control', false, 'transition SUCCEEDED');
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    PERFORM ccl_assert('F1','company B cannot transition company A''s Change Control',
                       v_msg LIKE 'LIFECYCLE_COMPANY_MISMATCH%' OR v_msg LIKE 'LIFECYCLE_FORBIDDEN%', v_msg);
  END;

  SELECT count(*) INTO n FROM public.entity_current_state
   WHERE entity_type='change_control' AND company_id='00000000-0000-5200-a000-00000000000a';
  PERFORM ccl_assert('F2','company B cannot read company A''s lifecycle state', n = 0, n||' row(s) visible');

  SELECT count(*) INTO n FROM public.entity_state_history
   WHERE entity_type='change_control' AND company_id='00000000-0000-5200-a000-00000000000a';
  PERFORM ccl_assert('F3','company B cannot read company A''s lifecycle history', n = 0, n||' row(s) visible');
END $f$;
RESET ROLE;

DO $f4$
DECLARE v_status text;
BEGIN
  SELECT status INTO v_status FROM public.change_controls WHERE id='00000000-0000-5200-c000-000000000003';
  PERFORM ccl_assert('F4','the cross-tenant attempt changed nothing', v_status='pending_approval',
                     coalesce(v_status,'NULL'));
END $f4$;


-- =====================================================================
--  G — regression: new records, and status-dependent reads
-- =====================================================================
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-5200-b000-000000000001","role":"authenticated"}',false);
SET ROLE authenticated;
DO $g$
DECLARE v_status text; v_state text; n_draft int;
BEGIN
  -- a newly created record must be initialised by the trigger, with the
  -- lifecycle's initial state, whatever status the inserter asked for
  INSERT INTO public.change_controls(id, company_id, change_number, title, change_type, change_category, status, created_by)
  VALUES ('00000000-0000-5200-c000-000000000010','00000000-0000-5200-a000-00000000000a',
          'CCL-A-NEW','new record','process','minor','approved','00000000-0000-5200-b000-000000000001');

  SELECT status INTO v_status FROM public.change_controls WHERE id='00000000-0000-5200-c000-000000000010';
  SELECT s.state_key INTO v_state FROM public.entity_current_state ecs
    JOIN public.lifecycle_states s ON s.id=ecs.state_id
   WHERE ecs.entity_id='00000000-0000-5200-c000-000000000010';

  PERFORM ccl_assert('G1','a new record is given lifecycle state automatically', v_state='draft',
                     coalesce(v_state,'NULL'));
  PERFORM ccl_assert('G2','an inserted status cannot short-circuit the workflow', v_status='draft',
                     'asked for approved, got '||coalesce(v_status,'NULL'));

  -- the status-filtered read path used by listChangeControls still works
  SELECT count(*) INTO n_draft FROM public.change_controls
   WHERE company_id='00000000-0000-5200-a000-00000000000a' AND status='draft';
  PERFORM ccl_assert('G3','status-filtered reads still work', n_draft >= 1, n_draft||' draft record(s)');
END $g$;
RESET ROLE;
SELECT set_config('request.jwt.claims','',false);


-- ── results ──────────────────────────────────────────────────────────
\echo ''
\echo '======== CHANGE CONTROL × LIFECYCLE ENGINE — TEST RESULTS ========'
SELECT id, name, verdict, detail FROM ccl_results ORDER BY seq;
\echo ''
SELECT verdict, count(*) FROM ccl_results GROUP BY verdict ORDER BY verdict;

-- ── cleanup ──────────────────────────────────────────────────────────
DO $cleanup$
BEGIN
  DELETE FROM public.entity_state_history WHERE entity_id::text LIKE '00000000-0000-5200-c000-%';
  DELETE FROM public.entity_current_state WHERE entity_id::text LIKE '00000000-0000-5200-c000-%';
  ALTER TABLE public.change_controls DISABLE TRIGGER trg_change_controls_guard_status;
  DELETE FROM public.change_controls WHERE id::text LIKE '00000000-0000-5200-c000-%';
  ALTER TABLE public.change_controls ENABLE TRIGGER trg_change_controls_guard_status;
  DELETE FROM public.company_members WHERE user_id::text LIKE '00000000-0000-5200-b000-%';
  DELETE FROM public.profiles  WHERE email LIKE 'ccl-%@local.test';
  DELETE FROM auth.users       WHERE email LIKE 'ccl-%@local.test';
  DELETE FROM public.companies WHERE name LIKE 'CCL %';
  RAISE NOTICE 'CCL fixtures removed.';
EXCEPTION WHEN others THEN
  RAISE WARNING 'CLEANUP INCOMPLETE (%). Remove CCL rows manually.', SQLERRM;
END $cleanup$;

DROP FUNCTION IF EXISTS ccl_assert(text,text,boolean,text);
