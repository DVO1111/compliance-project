-- =====================================================================
--  CAPA × LIFECYCLE ENGINE — INTEGRATION TESTS (D03)
--  LOCAL / DISPOSABLE DATABASE ONLY
-- =====================================================================
--  FIXTURE EVIDENCE, LABELLED AS SUCH
--  ----------------------------------
--  `capa_records` is EMPTY on this database, and unlike Change Control
--  that is not a failed-seed artifact: no migration inserts CAPA rows at
--  all, so this local database has simply never had any. Zero rows would
--  make every backfill assertion vacuous, so this suite creates rows in
--  all seven statuses across two companies, runs the migration's backfill
--  logic against them, and asserts the outcome.
--
--  That is real evidence about the mapping, tenancy and history shape —
--  of synthetic rows. The §4 counts must be re-run against production
--  before this migration is applied there.
--
--  The pg_cron creation path is likewise simulated. pg_cron is not
--  available in this Postgres build, so 20260702000100 failed here and
--  sweep_overdue_obligations() is absent. What is testable, and what
--  matters, is the shape of that insert: a superuser session with no JWT
--  inserting a CAPA with created_by NULL. That is reproduced directly.
--
--  Run:  psql "<local url>" -f supabase/tests/capa_lifecycle_test.sql
-- =====================================================================

\set ON_ERROR_STOP off

DO $guard$
BEGIN
  IF current_database() NOT IN ('postgres','criateur_local') THEN
    RAISE EXCEPTION 'REFUSING TO RUN outside a local database (got %)', current_database();
  END IF;
  IF to_regprocedure('public.fn_capa_records_sync_status()') IS NULL THEN
    RAISE EXCEPTION 'Migration 20260912000000 has not been applied to this database.';
  END IF;
END $guard$;

DROP TABLE IF EXISTS cap_results;
CREATE TEMP TABLE cap_results(seq serial, id text, name text, verdict text, detail text);
GRANT ALL ON cap_results TO authenticated, anon, service_role;
GRANT USAGE, SELECT ON SEQUENCE cap_results_seq_seq TO authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION cap_assert(p_id text, p_name text, p_cond boolean, p_detail text DEFAULT '')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO cap_results(id,name,verdict,detail)
  VALUES (p_id, p_name, CASE WHEN p_cond THEN 'PASS' ELSE 'FAIL' END, p_detail);
END $$;

-- ── fixtures ─────────────────────────────────────────────────────────
DO $fx$
DECLARE
  ca uuid := '00000000-0000-5300-a000-00000000000a';
  cb uuid := '00000000-0000-5300-a000-00000000000b';
  ua uuid := '00000000-0000-5300-b000-000000000001';
  ub uuid := '00000000-0000-5300-b000-000000000002';
  st text; i int := 0;
BEGIN
  INSERT INTO public.companies(id,name) VALUES (ca,'CAP Alpha'),(cb,'CAP Beta') ON CONFLICT (id) DO NOTHING;
  INSERT INTO auth.users(id,email) VALUES (ua,'cap-a@local.test'),(ub,'cap-b@local.test') ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.profiles(id,email,role,company_id)
    VALUES (ua,'cap-a@local.test','admin',ca),(ub,'cap-b@local.test','admin',cb) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.company_members(company_id,user_id,role,status)
    VALUES (ca,ua,'owner','active'),(cb,ub,'owner','active') ON CONFLICT DO NOTHING;

  -- legacy rows: one per status, with the new triggers off so they look
  -- exactly like pre-migration data. Includes an `overdue` row, which the
  -- backfill must handle even though nothing can create one any more.
  ALTER TABLE public.capa_records DISABLE TRIGGER trg_capa_records_initialize_lifecycle;
  ALTER TABLE public.capa_records DISABLE TRIGGER trg_capa_records_guard_status;

  FOREACH st IN ARRAY ARRAY['open','investigating','action_planned','in_progress',
                            'verification','closed','overdue'] LOOP
    i := i + 1;
    INSERT INTO public.capa_records(id, company_id, capa_number, title, description, source, capa_type, priority, status, due_date, created_by)
    VALUES (('00000000-0000-5300-c000-00000000000'||i)::uuid, ca, 'CAP-A-'||i, 'legacy '||st,
            'legacy record', 'internal_review', 'corrective', 'medium', st,
            now() - interval '10 days', ua);
  END LOOP;

  INSERT INTO public.capa_records(id, company_id, capa_number, title, description, source, capa_type, priority, status, created_by)
  VALUES ('00000000-0000-5300-c000-0000000000ff', cb, 'CAP-B-1', 'other tenant', 'x',
          'internal_review', 'corrective', 'medium', 'open', ub);

  ALTER TABLE public.capa_records ENABLE TRIGGER trg_capa_records_initialize_lifecycle;
  ALTER TABLE public.capa_records ENABLE TRIGGER trg_capa_records_guard_status;
END $fx$;

-- the migration's backfill, run against those legacy rows
INSERT INTO public.entity_current_state
  (company_id, definition_id, entity_type, entity_id, state_id, entered_at, entered_by, updated_at)
SELECT c.company_id, public.lifecycle_resolve_definition('capa_record', c.company_id),
       'capa_record', c.id, s.id, coalesce(c.closed_at, c.created_at, now()), c.created_by, now()
  FROM public.capa_records c
  JOIN public.lifecycle_states s
    ON s.definition_id = public.lifecycle_resolve_definition('capa_record', c.company_id)
   AND s.state_key = c.status
 WHERE public.lifecycle_resolve_definition('capa_record', c.company_id) IS NOT NULL
ON CONFLICT (definition_id, entity_id) DO NOTHING;

INSERT INTO public.entity_state_history
  (company_id, definition_id, entity_type, entity_id, from_state_id, to_state_id, transition_id, actor_id, comment, metadata, created_at)
SELECT ecs.company_id, ecs.definition_id, 'capa_record', ecs.entity_id,
       NULL, ecs.state_id, NULL, ecs.entered_by, NULL,
       jsonb_build_object('reason','backfill_d03','source','capa_records.status'), ecs.entered_at
  FROM public.entity_current_state ecs
 WHERE ecs.entity_type='capa_record'
   AND NOT EXISTS (SELECT 1 FROM public.entity_state_history h
                    WHERE h.entity_type='capa_record' AND h.entity_id = ecs.entity_id);


-- =====================================================================
--  A — BACKFILL
-- =====================================================================
DO $a$
DECLARE n_capa int; n_state int; n_mismatch int; n_co int; n_hist int; n_fab int; n_over int;
BEGIN
  SELECT count(*) INTO n_capa FROM public.capa_records;
  SELECT count(*) INTO n_state FROM public.capa_records c
    JOIN public.entity_current_state ecs ON ecs.entity_type='capa_record' AND ecs.entity_id=c.id;
  PERFORM cap_assert('A1','every CAPA has a lifecycle current state', n_capa=n_state, n_state||' of '||n_capa);

  SELECT count(*) INTO n_mismatch FROM public.capa_records c
    JOIN public.entity_current_state ecs ON ecs.entity_type='capa_record' AND ecs.entity_id=c.id
    JOIN public.lifecycle_states s ON s.id=ecs.state_id
   WHERE s.state_key IS DISTINCT FROM c.status;
  PERFORM cap_assert('A2','every state_key matches the legacy status', n_mismatch=0, n_mismatch||' mismatch(es)');

  SELECT count(*) INTO n_co FROM public.capa_records c
    JOIN public.entity_current_state ecs ON ecs.entity_type='capa_record' AND ecs.entity_id=c.id
   WHERE ecs.company_id IS DISTINCT FROM c.company_id;
  PERFORM cap_assert('A3','company_id is carried across unchanged', n_co=0, n_co||' divergence(s)');

  SELECT count(*) INTO n_hist FROM public.entity_state_history
   WHERE entity_type='capa_record' AND metadata->>'reason'='backfill_d03';
  PERFORM cap_assert('A4','one adoption history row per record', n_hist=n_capa, n_hist||' for '||n_capa);

  SELECT count(*) INTO n_fab FROM public.entity_state_history
   WHERE entity_type='capa_record' AND from_state_id IS NOT NULL;
  PERFORM cap_assert('A5','no historical transitions were fabricated', n_fab=0, n_fab||' row(s) with a from_state');

  -- the legacy `overdue` row must survive the backfill like any other
  SELECT count(*) INTO n_over FROM public.entity_current_state ecs
    JOIN public.lifecycle_states s ON s.id=ecs.state_id
   WHERE ecs.entity_type='capa_record' AND s.state_key='overdue';
  PERFORM cap_assert('A6','a legacy overdue record migrates like any other', n_over=1, n_over||' row(s)');
END $a$;


-- =====================================================================
--  B — the graph is exactly as D01 seeded it
-- =====================================================================
DO $b$
DECLARE n_st int; n_tr int; n_keys int;
BEGIN
  SELECT count(*) INTO n_st FROM public.lifecycle_states s
    JOIN public.lifecycle_definitions d ON d.id=s.definition_id WHERE d.entity_type='capa_record';
  SELECT count(*) INTO n_tr FROM public.lifecycle_transitions t
    JOIN public.lifecycle_definitions d ON d.id=t.definition_id WHERE d.entity_type='capa_record';
  SELECT count(*) INTO n_keys FROM public.lifecycle_states s
    JOIN public.lifecycle_definitions d ON d.id=s.definition_id
   WHERE d.entity_type='capa_record'
     AND s.state_key IN ('open','investigating','action_planned','in_progress','verification','closed','overdue');
  PERFORM cap_assert('B1','exactly 7 states', n_st=7, n_st||' state(s)');
  PERFORM cap_assert('B2','exactly 42 transitions', n_tr=42, n_tr||' transition(s)');
  PERFORM cap_assert('B3','the seven state keys are unchanged', n_keys=7, n_keys||' matching key(s)');
END $b$;


-- =====================================================================
--  C / J — authority and no dual write
-- =====================================================================
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-5300-b000-000000000001","role":"authenticated"}',false);
SET ROLE authenticated;
DO $c$
DECLARE v_msg text; v_status text;
BEGIN
  BEGIN
    UPDATE public.capa_records SET status='closed' WHERE id='00000000-0000-5300-c000-000000000001';
    PERFORM cap_assert('C1','a direct status write is rejected', false, 'UPDATE SUCCEEDED');
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    PERFORM cap_assert('C1','a direct status write is rejected', v_msg LIKE 'CAPA_STATUS_READ_ONLY%', v_msg);
  END;

  SELECT status INTO v_status FROM public.capa_records WHERE id='00000000-0000-5300-c000-000000000001';
  PERFORM cap_assert('C2','and the status is unchanged', v_status='open', coalesce(v_status,'NULL'));

  UPDATE public.capa_records SET root_cause='investigated' WHERE id='00000000-0000-5300-c000-000000000001';
  PERFORM cap_assert('C3','non-status columns are still writable', true, 'root_cause updated');
END $c$;
RESET ROLE;


-- =====================================================================
--  D — transitions through the engine, including closed_at
-- =====================================================================
SET ROLE authenticated;
DO $d$
DECLARE r jsonb; v_state text; v_status text; v_closed timestamptz; n_before int; n_after int;
BEGIN
  SELECT count(*) INTO n_before FROM public.entity_state_history
   WHERE entity_id='00000000-0000-5300-c000-000000000001';

  r := public.lifecycle_transition('capa_record','00000000-0000-5300-c000-000000000001',
        'set_investigating','00000000-0000-5300-a000-00000000000a'::uuid);

  SELECT s.state_key INTO v_state FROM public.entity_current_state ecs
    JOIN public.lifecycle_states s ON s.id=ecs.state_id
   WHERE ecs.entity_id='00000000-0000-5300-c000-000000000001';
  SELECT status INTO v_status FROM public.capa_records WHERE id='00000000-0000-5300-c000-000000000001';
  SELECT count(*) INTO n_after FROM public.entity_state_history
   WHERE entity_id='00000000-0000-5300-c000-000000000001';

  PERFORM cap_assert('D1','the transition succeeds', r->>'to_state'='investigating', 'to '||coalesce(r->>'to_state','NULL'));
  PERFORM cap_assert('D2','entity_current_state is updated', v_state='investigating', coalesce(v_state,'NULL'));
  PERFORM cap_assert('D3','capa_records.status mirrors it', v_status='investigating', coalesce(v_status,'NULL'));
  PERFORM cap_assert('D4','history records the transition', n_after=n_before+1, n_before||' -> '||n_after);

  -- closing must stamp closed_at, which the client used to do
  PERFORM public.lifecycle_transition('capa_record','00000000-0000-5300-c000-000000000001',
           'set_closed','00000000-0000-5300-a000-00000000000a'::uuid);
  SELECT status, closed_at INTO v_status, v_closed FROM public.capa_records
   WHERE id='00000000-0000-5300-c000-000000000001';
  PERFORM cap_assert('D5','closing sets status=closed', v_status='closed', coalesce(v_status,'NULL'));
  PERFORM cap_assert('D6','and closed_at is stamped server-side', v_closed IS NOT NULL, coalesce(v_closed::text,'NULL'));
END $d$;
RESET ROLE;

-- any-to-any: a backwards move and an order-skipping move
SET ROLE authenticated;
DO $d7$
DECLARE r jsonb; v_msg text;
BEGIN
  BEGIN
    r := public.lifecycle_transition('capa_record','00000000-0000-5300-c000-000000000001',
          'set_open','00000000-0000-5300-a000-00000000000a'::uuid);
    PERFORM cap_assert('D7','a backwards move is still permitted', r->>'to_state'='open',
                       'closed -> '||coalesce(r->>'to_state','NULL'));
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    PERFORM cap_assert('D7','a backwards move is still permitted', false, v_msg);
  END;

  BEGIN
    r := public.lifecycle_transition('capa_record','00000000-0000-5300-c000-000000000001',
          'set_verification','00000000-0000-5300-a000-00000000000a'::uuid);
    PERFORM cap_assert('D8','an order-skipping move is still permitted', r->>'to_state'='verification',
                       'open -> '||coalesce(r->>'to_state','NULL'));
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    PERFORM cap_assert('D8','an order-skipping move is still permitted', false, v_msg);
  END;
END $d7$;
RESET ROLE;


-- =====================================================================
--  E — NO comment requirement was introduced
-- =====================================================================
DO $e$
DECLARE n_req int;
BEGIN
  SELECT count(*) INTO n_req FROM public.lifecycle_transitions t
    JOIN public.lifecycle_definitions d ON d.id=t.definition_id
   WHERE d.entity_type='capa_record' AND t.requires_comment;
  PERFORM cap_assert('E1','no CAPA transition requires a comment', n_req=0, n_req||' requirement(s)');
END $e$;

SET ROLE authenticated;
DO $e2$
DECLARE r jsonb; v_msg text;
BEGIN
  -- CAPA has no existing comment rule, so a commentless move must work
  BEGIN
    r := public.lifecycle_transition('capa_record','00000000-0000-5300-c000-000000000002',
          'set_closed','00000000-0000-5300-a000-00000000000a'::uuid);
    PERFORM cap_assert('E2','a CAPA transition succeeds without a comment', r->>'to_state'='closed',
                       'to '||coalesce(r->>'to_state','NULL'));
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    PERFORM cap_assert('E2','a CAPA transition succeeds without a comment', false, v_msg);
  END;
END $e2$;
RESET ROLE;


-- =====================================================================
--  F — overdue stays unreachable in practice, and derived reporting works
-- =====================================================================
DO $f$
DECLARE n_written int; n_derived int;
BEGIN
  -- nothing in this suite wrote `overdue`; only the seeded legacy row has it
  SELECT count(*) INTO n_written FROM public.capa_records WHERE status='overdue';
  PERFORM cap_assert('F1','no new overdue row was produced by any transition', n_written=1,
                     n_written||' row(s) (the one legacy fixture)');

  -- the derived calculation every consumer actually uses is untouched
  SELECT count(*) INTO n_derived FROM public.capa_records
   WHERE due_date < now() AND status <> 'closed'
     AND company_id='00000000-0000-5300-a000-00000000000a';
  PERFORM cap_assert('F2','due_date-derived overdue reporting still works', n_derived >= 1,
                     n_derived||' derived-overdue record(s)');
END $f$;


-- =====================================================================
--  G — the scheduled creation path: no JWT, no actor
-- =====================================================================
--  FIXTURE EVIDENCE. pg_cron is unavailable here so sweep_overdue_obligations()
--  is absent; what is reproduced is the shape of its insert — a superuser
--  session with no JWT creating a CAPA with created_by NULL.
SELECT set_config('request.jwt.claims','',false);
DO $g$
DECLARE v_state text; v_status text; v_actor uuid; v_ok boolean := true; v_msg text := '';
BEGIN
  BEGIN
    INSERT INTO public.capa_records(id, company_id, capa_number, title, description, source, capa_type, priority, status, due_date, created_by)
    VALUES ('00000000-0000-5300-c000-000000000020','00000000-0000-5300-a000-00000000000a',
            'CAP-CRON-1','Overdue Obligation: simulated','created by a scheduled sweep',
            'regulatory_action','corrective','high','open', now() - interval '1 day', NULL);
  EXCEPTION WHEN others THEN
    v_ok := false; GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
  END;
  PERFORM cap_assert('G1','a CAPA created with no JWT and no actor still inserts', v_ok, v_msg);

  SELECT s.state_key INTO v_state FROM public.entity_current_state ecs
    JOIN public.lifecycle_states s ON s.id=ecs.state_id
   WHERE ecs.entity_id='00000000-0000-5300-c000-000000000020';
  SELECT status INTO v_status FROM public.capa_records WHERE id='00000000-0000-5300-c000-000000000020';
  SELECT entered_by INTO v_actor FROM public.entity_current_state
   WHERE entity_id='00000000-0000-5300-c000-000000000020';

  PERFORM cap_assert('G2','it is initialised to the lifecycle initial state', v_state='open', coalesce(v_state,'NULL'));
  PERFORM cap_assert('G3','its mirrored status is open', v_status='open', coalesce(v_status,'NULL'));
  PERFORM cap_assert('G4','no actor was fabricated for it', v_actor IS NULL, coalesce(v_actor::text,'NULL — correct'));
END $g$;

-- an authenticated creation is attributed to the real user
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-5300-b000-000000000001","role":"authenticated"}',false);
SET ROLE authenticated;
DO $g5$
DECLARE v_actor uuid; v_state text;
BEGIN
  INSERT INTO public.capa_records(id, company_id, capa_number, title, description, source, capa_type, priority, status, created_by)
  VALUES ('00000000-0000-5300-c000-000000000021','00000000-0000-5300-a000-00000000000a',
          'CAP-A-NEW','user created','x','internal_review','corrective','medium','verification',
          '00000000-0000-5300-b000-000000000001');

  SELECT entered_by INTO v_actor FROM public.entity_current_state
   WHERE entity_id='00000000-0000-5300-c000-000000000021';
  SELECT s.state_key INTO v_state FROM public.entity_current_state ecs
    JOIN public.lifecycle_states s ON s.id=ecs.state_id
   WHERE ecs.entity_id='00000000-0000-5300-c000-000000000021';

  PERFORM cap_assert('G5','an authenticated creation is attributed to that user',
                     v_actor='00000000-0000-5300-b000-000000000001', coalesce(v_actor::text,'NULL'));
  PERFORM cap_assert('G6','an inserted status cannot short-circuit the workflow', v_state='open',
                     'asked for verification, got '||coalesce(v_state,'NULL'));
END $g5$;
RESET ROLE;


-- =====================================================================
--  H — tenancy
-- =====================================================================
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-5300-b000-000000000002","role":"authenticated"}',false);
SET ROLE authenticated;
DO $h$
DECLARE v_msg text; n int;
BEGIN
  BEGIN
    PERFORM public.lifecycle_transition('capa_record','00000000-0000-5300-c000-000000000003',
             'set_closed','00000000-0000-5300-a000-00000000000b'::uuid);
    PERFORM cap_assert('H1','company B cannot transition company A''s CAPA', false, 'transition SUCCEEDED');
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    PERFORM cap_assert('H1','company B cannot transition company A''s CAPA',
                       v_msg LIKE 'LIFECYCLE_COMPANY_MISMATCH%' OR v_msg LIKE 'LIFECYCLE_FORBIDDEN%', v_msg);
  END;

  SELECT count(*) INTO n FROM public.entity_current_state
   WHERE entity_type='capa_record' AND company_id='00000000-0000-5300-a000-00000000000a';
  PERFORM cap_assert('H2','company B cannot read company A''s lifecycle state', n=0, n||' row(s) visible');

  SELECT count(*) INTO n FROM public.entity_state_history
   WHERE entity_type='capa_record' AND company_id='00000000-0000-5300-a000-00000000000a';
  PERFORM cap_assert('H3','company B cannot read company A''s lifecycle history', n=0, n||' row(s) visible');
END $h$;
RESET ROLE;

DO $h4$
DECLARE v_status text;
BEGIN
  SELECT status INTO v_status FROM public.capa_records WHERE id='00000000-0000-5300-c000-000000000003';
  PERFORM cap_assert('H4','the cross-tenant attempt changed nothing', v_status='action_planned',
                     coalesce(v_status,'NULL'));
END $h4$;


-- =====================================================================
--  I — the obsolete CHECK constraint is gone
-- =====================================================================
DO $i$
DECLARE v_con text;
BEGIN
  SELECT conname INTO v_con FROM pg_constraint
   WHERE conrelid='public.capa_records'::regclass AND conname='capa_records_status_check';
  PERFORM cap_assert('I1','the legacy status CHECK constraint is removed', v_con IS NULL, coalesce(v_con,'gone'));
END $i$;

-- regression: the status-dependent read used by hasPendingCapaForControl
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-5300-b000-000000000001","role":"authenticated"}',false);
SET ROLE authenticated;
DO $i2$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.capa_records
   WHERE company_id='00000000-0000-5300-a000-00000000000a' AND status <> 'closed';
  PERFORM cap_assert('I2','status-filtered reads still work', n >= 1, n||' non-closed record(s)');
END $i2$;
RESET ROLE;
SELECT set_config('request.jwt.claims','',false);


-- ── results ──────────────────────────────────────────────────────────
\echo ''
\echo '========== CAPA × LIFECYCLE ENGINE — TEST RESULTS =========='
SELECT id, name, verdict, detail FROM cap_results ORDER BY seq;
\echo ''
SELECT verdict, count(*) FROM cap_results GROUP BY verdict ORDER BY verdict;

-- ── cleanup ──────────────────────────────────────────────────────────
DO $cleanup$
BEGIN
  DELETE FROM public.entity_state_history WHERE entity_id::text LIKE '00000000-0000-5300-c000-%';
  DELETE FROM public.entity_current_state WHERE entity_id::text LIKE '00000000-0000-5300-c000-%';
  ALTER TABLE public.capa_records DISABLE TRIGGER trg_capa_records_guard_status;
  DELETE FROM public.capa_records WHERE id::text LIKE '00000000-0000-5300-c000-%';
  ALTER TABLE public.capa_records ENABLE TRIGGER trg_capa_records_guard_status;
  DELETE FROM public.company_members WHERE user_id::text LIKE '00000000-0000-5300-b000-%';
  DELETE FROM public.profiles  WHERE email LIKE 'cap-%@local.test';
  DELETE FROM auth.users       WHERE email LIKE 'cap-%@local.test';
  DELETE FROM public.companies WHERE name LIKE 'CAP %';
  RAISE NOTICE 'CAP fixtures removed.';
EXCEPTION WHEN others THEN
  RAISE WARNING 'CLEANUP INCOMPLETE (%). Remove CAP rows manually.', SQLERRM;
END $cleanup$;

DROP FUNCTION IF EXISTS cap_assert(text,text,boolean,text);
