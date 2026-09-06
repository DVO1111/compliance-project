-- =====================================================================
--  SOP × LIFECYCLE ENGINE + ATOMIC PUBLISH — INTEGRATION TESTS (D03)
--  LOCAL / DISPOSABLE DATABASE ONLY
-- =====================================================================
--  FIXTURE EVIDENCE, LABELLED AS SUCH
--  ----------------------------------
--  sop_documents and sop_versions are EMPTY on this database because
--  20260603600000_seed_nasco_demo_data.sql (which does insert SOPs) is in
--  this cluster's failed-migration list. Zero rows would make every
--  assertion vacuous, so this suite builds document families covering all
--  six parent statuses, multiple versions, an effective/superseded pair
--  and an obsolete document, then exercises the real code paths.
--
--  Production access is unavailable, so the preflight counts (multiple
--  effective versions, current_version divergence) could NOT be run
--  against real data. They must be run there before this migration is
--  applied.
--
--  Run:  psql "<local url>" -f supabase/tests/sop_lifecycle_test.sql
-- =====================================================================

\set ON_ERROR_STOP off

DO $guard$
BEGIN
  IF current_database() NOT IN ('postgres','criateur_local') THEN
    RAISE EXCEPTION 'REFUSING TO RUN outside a local database (got %)', current_database();
  END IF;
  IF to_regprocedure('public.publish_sop_version(uuid,uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'Migration 20260913000000 has not been applied to this database.';
  END IF;
END $guard$;

DROP TABLE IF EXISTS sop_results;
CREATE TEMP TABLE sop_results(seq serial, id text, name text, verdict text, detail text);
GRANT ALL ON sop_results TO authenticated, anon, service_role;
GRANT USAGE, SELECT ON SEQUENCE sop_results_seq_seq TO authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION sop_assert(p_id text, p_name text, p_cond boolean, p_detail text DEFAULT '')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO sop_results(id,name,verdict,detail)
  VALUES (p_id, p_name, CASE WHEN p_cond THEN 'PASS' ELSE 'FAIL' END, p_detail);
END $$;

-- ── fixtures ─────────────────────────────────────────────────────────
--  A: six documents, one per parent status. SOP-1 additionally carries
--     two versions (v1 effective, v2 approved) for the publish tests.
--  B: one document in another tenant.
DO $fx$
DECLARE
  ca uuid := '00000000-0000-5400-a000-00000000000a';
  cb uuid := '00000000-0000-5400-a000-00000000000b';
  ua uuid := '00000000-0000-5400-b000-000000000001';
  ub uuid := '00000000-0000-5400-b000-000000000002';
  st text; i int := 0;
BEGIN
  INSERT INTO public.companies(id,name) VALUES (ca,'SOP Alpha'),(cb,'SOP Beta') ON CONFLICT (id) DO NOTHING;
  INSERT INTO auth.users(id,email) VALUES (ua,'sop-a@local.test'),(ub,'sop-b@local.test') ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.profiles(id,email,role,company_id)
    VALUES (ua,'sop-a@local.test','admin',ca),(ub,'sop-b@local.test','admin',cb) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.company_members(company_id,user_id,role,status)
    VALUES (ca,ua,'owner','active'),(cb,ub,'owner','active') ON CONFLICT DO NOTHING;

  ALTER TABLE public.sop_documents DISABLE TRIGGER trg_sop_documents_initialize_lifecycle;
  ALTER TABLE public.sop_documents DISABLE TRIGGER trg_sop_documents_guard_status;

  FOREACH st IN ARRAY ARRAY['draft','in_review','approved','effective','superseded','obsolete'] LOOP
    i := i + 1;
    INSERT INTO public.sop_documents(id, company_id, sop_number, title, department, category, current_version, status, owner_id, review_due_date)
    VALUES (('00000000-0000-5400-c000-00000000000'||i)::uuid, ca, 'SOP-QUA-00'||i, 'legacy '||st,
            'Quality', 'quality', '1.0', st, ua, current_date - 5);
  END LOOP;

  INSERT INTO public.sop_documents(id, company_id, sop_number, title, department, category, current_version, status, owner_id)
  VALUES ('00000000-0000-5400-c000-0000000000ff', cb, 'SOP-QUA-999', 'other tenant', 'Quality', 'quality', '1.0', 'draft', ub);

  ALTER TABLE public.sop_documents ENABLE TRIGGER trg_sop_documents_initialize_lifecycle;
  ALTER TABLE public.sop_documents ENABLE TRIGGER trg_sop_documents_guard_status;

  -- versions for SOP-1 (parent currently 'draft'): v1 effective, v2 approved
  ALTER TABLE public.sop_versions DISABLE TRIGGER trg_sop_versions_guard_publish_states;
  INSERT INTO public.sop_versions(id, sop_id, version_number, status, created_by, effective_date)
  VALUES ('00000000-0000-5400-d000-000000000001','00000000-0000-5400-c000-000000000001','1.0','effective',ua,current_date - 30),
         ('00000000-0000-5400-d000-000000000002','00000000-0000-5400-c000-000000000001','2.0','approved',ua,NULL);
  ALTER TABLE public.sop_versions ENABLE TRIGGER trg_sop_versions_guard_publish_states;
END $fx$;

-- the migration's backfill, against those legacy rows
INSERT INTO public.entity_current_state
  (company_id, definition_id, entity_type, entity_id, state_id, entered_at, entered_by, updated_at)
SELECT d.company_id, public.lifecycle_resolve_definition('sop_document', d.company_id),
       'sop_document', d.id, s.id, coalesce(d.updated_at, d.created_at, now()), d.owner_id, now()
  FROM public.sop_documents d
  JOIN public.lifecycle_states s
    ON s.definition_id = public.lifecycle_resolve_definition('sop_document', d.company_id)
   AND s.state_key = d.status
 WHERE public.lifecycle_resolve_definition('sop_document', d.company_id) IS NOT NULL
ON CONFLICT (definition_id, entity_id) DO NOTHING;

INSERT INTO public.entity_state_history
  (company_id, definition_id, entity_type, entity_id, from_state_id, to_state_id, transition_id, actor_id, comment, metadata, created_at)
SELECT ecs.company_id, ecs.definition_id, 'sop_document', ecs.entity_id,
       NULL, ecs.state_id, NULL, ecs.entered_by, NULL,
       jsonb_build_object('reason','backfill_d03','source','sop_documents.status'), ecs.entered_at
  FROM public.entity_current_state ecs
 WHERE ecs.entity_type='sop_document'
   AND NOT EXISTS (SELECT 1 FROM public.entity_state_history h
                    WHERE h.entity_type='sop_document' AND h.entity_id = ecs.entity_id);


-- =====================================================================
--  A — LIFECYCLE GRAPH
-- =====================================================================
DO $a$
DECLARE n_st int; n_tr int;
BEGIN
  SELECT count(*) INTO n_st FROM public.lifecycle_states s
    JOIN public.lifecycle_definitions d ON d.id=s.definition_id WHERE d.entity_type='sop_document';
  SELECT count(*) INTO n_tr FROM public.lifecycle_transitions t
    JOIN public.lifecycle_definitions d ON d.id=t.definition_id WHERE d.entity_type='sop_document';
  PERFORM sop_assert('A1','exactly 6 states', n_st=6, n_st||' state(s)');
  PERFORM sop_assert('A2','exactly 30 transitions', n_tr=30, n_tr||' transition(s)');
END $a$;


-- =====================================================================
--  B — BACKFILL
-- =====================================================================
DO $b$
DECLARE n_doc int; n_state int; n_mismatch int; n_co int; n_hist int; n_fab int;
BEGIN
  SELECT count(*) INTO n_doc FROM public.sop_documents;
  SELECT count(*) INTO n_state FROM public.sop_documents d
    JOIN public.entity_current_state ecs ON ecs.entity_type='sop_document' AND ecs.entity_id=d.id;
  PERFORM sop_assert('B1','every SOP has a lifecycle current state', n_doc=n_state, n_state||' of '||n_doc);

  SELECT count(*) INTO n_mismatch FROM public.sop_documents d
    JOIN public.entity_current_state ecs ON ecs.entity_type='sop_document' AND ecs.entity_id=d.id
    JOIN public.lifecycle_states s ON s.id=ecs.state_id
   WHERE s.state_key IS DISTINCT FROM d.status;
  PERFORM sop_assert('B2','all six statuses map correctly', n_mismatch=0, n_mismatch||' mismatch(es)');

  SELECT count(*) INTO n_co FROM public.sop_documents d
    JOIN public.entity_current_state ecs ON ecs.entity_type='sop_document' AND ecs.entity_id=d.id
   WHERE ecs.company_id IS DISTINCT FROM d.company_id;
  PERFORM sop_assert('B3','company_id carried across unchanged', n_co=0, n_co||' divergence(s)');

  SELECT count(*) INTO n_hist FROM public.entity_state_history
   WHERE entity_type='sop_document' AND metadata->>'reason'='backfill_d03';
  PERFORM sop_assert('B4','one adoption history row per document', n_hist=n_doc, n_hist||' for '||n_doc);

  SELECT count(*) INTO n_fab FROM public.entity_state_history
   WHERE entity_type='sop_document' AND from_state_id IS NOT NULL;
  PERFORM sop_assert('B5','no fabricated historical transitions', n_fab=0, n_fab||' row(s) with a from_state');
END $b$;


-- =====================================================================
--  C — STATUS AUTHORITY / no dual write
-- =====================================================================
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-5400-b000-000000000001","role":"authenticated"}',false);
SET ROLE authenticated;
DO $c$
DECLARE v_msg text; v_status text;
BEGIN
  BEGIN
    UPDATE public.sop_documents SET status='effective' WHERE id='00000000-0000-5400-c000-000000000002';
    PERFORM sop_assert('C1','a direct parent status write is rejected', false, 'UPDATE SUCCEEDED');
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    PERFORM sop_assert('C1','a direct parent status write is rejected', v_msg LIKE 'SOP_STATUS_READ_ONLY%', v_msg);
  END;

  SELECT status INTO v_status FROM public.sop_documents WHERE id='00000000-0000-5400-c000-000000000002';
  PERFORM sop_assert('C2','and the status is unchanged', v_status='in_review', coalesce(v_status,'NULL'));

  UPDATE public.sop_documents SET title='edited' WHERE id='00000000-0000-5400-c000-000000000002';
  PERFORM sop_assert('C3','non-status columns are still writable', true, 'title updated');
END $c$;
RESET ROLE;

-- K: the old three-call publish cannot be reconstructed by hand
SET ROLE authenticated;
DO $ck$
DECLARE v_msg text;
BEGIN
  BEGIN
    UPDATE public.sop_versions SET status='superseded' WHERE id='00000000-0000-5400-d000-000000000001';
    PERFORM sop_assert('C4','a direct version supersede is rejected', false, 'UPDATE SUCCEEDED');
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    PERFORM sop_assert('C4','a direct version supersede is rejected', v_msg LIKE 'SOP_VERSION_PUBLISH_ONLY%', v_msg);
  END;

  BEGIN
    UPDATE public.sop_versions SET status='effective' WHERE id='00000000-0000-5400-d000-000000000002';
    PERFORM sop_assert('C5','a direct version activation is rejected', false, 'UPDATE SUCCEEDED');
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    PERFORM sop_assert('C5','a direct version activation is rejected', v_msg LIKE 'SOP_VERSION_PUBLISH_ONLY%', v_msg);
  END;

  -- editorial states stay freely writable
  UPDATE public.sop_versions SET status='in_review' WHERE id='00000000-0000-5400-d000-000000000002';
  PERFORM sop_assert('C6','editorial version states are still writable', true, 'set to in_review');
  UPDATE public.sop_versions SET status='approved' WHERE id='00000000-0000-5400-d000-000000000002';
END $ck$;
RESET ROLE;


-- =====================================================================
--  D — PUBLISH SUCCESS (the coupled operation)
-- =====================================================================
SET ROLE authenticated;
DO $d$
DECLARE r jsonb; v_old text; v_new text; v_parent text; v_cur text; v_eff date; n_hist int;
BEGIN
  r := public.publish_sop_version('00000000-0000-5400-d000-000000000002',
                                  '00000000-0000-5400-c000-000000000001',
                                  '00000000-0000-5400-a000-00000000000a');

  SELECT status INTO v_old FROM public.sop_versions WHERE id='00000000-0000-5400-d000-000000000001';
  SELECT status INTO v_new FROM public.sop_versions WHERE id='00000000-0000-5400-d000-000000000002';
  SELECT status, current_version, effective_date INTO v_parent, v_cur, v_eff
    FROM public.sop_documents WHERE id='00000000-0000-5400-c000-000000000001';
  SELECT count(*) INTO n_hist FROM public.entity_state_history
   WHERE entity_id='00000000-0000-5400-c000-000000000001';

  PERFORM sop_assert('D1','the previously effective version is superseded', v_old='superseded', coalesce(v_old,'NULL'));
  PERFORM sop_assert('D2','the published version is effective', v_new='effective', coalesce(v_new,'NULL'));
  PERFORM sop_assert('D3','the parent document is effective', v_parent='effective', coalesce(v_parent,'NULL'));
  PERFORM sop_assert('D4','current_version points at the published version', v_cur='2.0', coalesce(v_cur,'NULL'));
  PERFORM sop_assert('D5','parent effective_date is stamped', v_eff=current_date, coalesce(v_eff::text,'NULL'));
  PERFORM sop_assert('D6','the parent move is recorded in lifecycle history', n_hist=2, n_hist||' history row(s)');
  PERFORM sop_assert('D7','the RPC reports what it did',
    (r->>'superseded_count')='1' AND (r->>'parent_transitioned')='true',
    'superseded='||coalesce(r->>'superseded_count','?')||' moved='||coalesce(r->>'parent_transitioned','?'));

  -- the caller must be able to attribute the audit entry to the actor the
  -- DATABASE resolved, rather than to a user id it supplied itself
  PERFORM sop_assert('D8','the RPC returns the session-resolved actor',
    (r->>'actor_id')='00000000-0000-5400-b000-000000000001',
    coalesce(r->>'actor_id','NULL'));

  -- and the version's approved_by is that same session actor
  PERFORM sop_assert('D9','approved_by is the session actor, not an argument',
    (SELECT approved_by FROM public.sop_versions WHERE id='00000000-0000-5400-d000-000000000002')
      = '00000000-0000-5400-b000-000000000001',
    coalesce((SELECT approved_by::text FROM public.sop_versions WHERE id='00000000-0000-5400-d000-000000000002'),'NULL'));
END $d$;
RESET ROLE;

-- F: exactly one effective version survives
DO $f$
DECLARE n_eff int;
BEGIN
  SELECT count(*) INTO n_eff FROM public.sop_versions
   WHERE sop_id='00000000-0000-5400-c000-000000000001' AND status='effective';
  PERFORM sop_assert('F1','exactly one effective version remains', n_eff=1, n_eff||' effective version(s)');
END $f$;


-- =====================================================================
--  E — PUBLISH ATOMICITY
-- =====================================================================
--  A trigger is installed that raises when the parent metadata update
--  runs — the LAST write in the operation. If the publish were not one
--  transaction, the version supersede/activate would already be durable.
CREATE OR REPLACE FUNCTION sop_break_parent_update() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN
  IF NEW.current_version IS DISTINCT FROM OLD.current_version THEN
    RAISE EXCEPTION 'SOPTEST_FORCED_PARENT_FAILURE';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER sop_break_parent_update_trg
  BEFORE UPDATE ON public.sop_documents
  FOR EACH ROW EXECUTE FUNCTION sop_break_parent_update();

-- add a third version to publish
ALTER TABLE public.sop_versions DISABLE TRIGGER trg_sop_versions_guard_publish_states;
INSERT INTO public.sop_versions(id, sop_id, version_number, status, created_by)
VALUES ('00000000-0000-5400-d000-000000000003','00000000-0000-5400-c000-000000000001','3.0','approved',
        '00000000-0000-5400-b000-000000000001');
ALTER TABLE public.sop_versions ENABLE TRIGGER trg_sop_versions_guard_publish_states;

SET ROLE authenticated;
DO $e$
DECLARE v_msg text; v_v2 text; v_v3 text; v_parent text; v_cur text;
BEGIN
  BEGIN
    PERFORM public.publish_sop_version('00000000-0000-5400-d000-000000000003',
                                       '00000000-0000-5400-c000-000000000001',
                                       '00000000-0000-5400-a000-00000000000a');
    PERFORM sop_assert('E1','the forced failure surfaced', false, 'publish SUCCEEDED');
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    PERFORM sop_assert('E1','the forced failure surfaced', v_msg LIKE '%SOPTEST_FORCED_PARENT_FAILURE%', v_msg);
  END;

  SELECT status INTO v_v2 FROM public.sop_versions WHERE id='00000000-0000-5400-d000-000000000002';
  SELECT status INTO v_v3 FROM public.sop_versions WHERE id='00000000-0000-5400-d000-000000000003';
  SELECT status, current_version INTO v_parent, v_cur
    FROM public.sop_documents WHERE id='00000000-0000-5400-c000-000000000001';

  PERFORM sop_assert('E2','ATOMIC: the earlier version was NOT superseded', v_v2='effective',
                     'v2 is '||coalesce(v_v2,'NULL')||' (must still be effective)');
  PERFORM sop_assert('E3','ATOMIC: the new version did NOT become effective', v_v3='approved',
                     'v3 is '||coalesce(v_v3,'NULL')||' (must still be approved)');
  PERFORM sop_assert('E4','ATOMIC: current_version did not move', v_cur='2.0', coalesce(v_cur,'NULL'));
  PERFORM sop_assert('E5','ATOMIC: no partial publish remains', v_parent='effective', coalesce(v_parent,'NULL'));
END $e$;
RESET ROLE;

DROP TRIGGER sop_break_parent_update_trg ON public.sop_documents;
DROP FUNCTION sop_break_parent_update();

DO $e6$
DECLARE n_eff int;
BEGIN
  SELECT count(*) INTO n_eff FROM public.sop_versions
   WHERE sop_id='00000000-0000-5400-c000-000000000001' AND status='effective';
  PERFORM sop_assert('E6','still exactly one effective version after the rollback', n_eff=1, n_eff||' effective version(s)');
END $e6$;


-- =====================================================================
--  G — TENANCY
-- =====================================================================
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-5400-b000-000000000002","role":"authenticated"}',false);
SET ROLE authenticated;
DO $g$
DECLARE v_msg text; n int;
BEGIN
  BEGIN
    PERFORM public.publish_sop_version('00000000-0000-5400-d000-000000000003',
                                       '00000000-0000-5400-c000-000000000001',
                                       '00000000-0000-5400-a000-00000000000a');
    PERFORM sop_assert('G1','company B cannot publish company A''s SOP', false, 'publish SUCCEEDED');
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    PERFORM sop_assert('G1','company B cannot publish company A''s SOP', v_msg LIKE 'SOP_FORBIDDEN%', v_msg);
  END;

  BEGIN
    PERFORM public.lifecycle_transition('sop_document','00000000-0000-5400-c000-000000000003',
             'set_effective','00000000-0000-5400-a000-00000000000b'::uuid);
    PERFORM sop_assert('G2','company B cannot transition company A''s SOP', false, 'transition SUCCEEDED');
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    PERFORM sop_assert('G2','company B cannot transition company A''s SOP',
                       v_msg LIKE 'LIFECYCLE_COMPANY_MISMATCH%' OR v_msg LIKE 'LIFECYCLE_FORBIDDEN%', v_msg);
  END;

  SELECT count(*) INTO n FROM public.entity_current_state
   WHERE entity_type='sop_document' AND company_id='00000000-0000-5400-a000-00000000000a';
  PERFORM sop_assert('G3','company B cannot read company A''s lifecycle state', n=0, n||' row(s) visible');
END $g$;
RESET ROLE;


-- =====================================================================
--  H — VERSION RELATIONSHIPS
-- =====================================================================
DO $h$
DECLARE n_orphan int; v_cur text; v_eff_ver text; n_ack int;
BEGIN
  SELECT count(*) INTO n_orphan FROM public.sop_versions v
    LEFT JOIN public.sop_documents d ON d.id=v.sop_id WHERE d.id IS NULL;
  PERFORM sop_assert('H1','no orphaned versions', n_orphan=0, n_orphan||' orphan(s)');

  SELECT d.current_version, v.version_number INTO v_cur, v_eff_ver
    FROM public.sop_documents d
    LEFT JOIN public.sop_versions v ON v.sop_id=d.id AND v.status='effective'
   WHERE d.id='00000000-0000-5400-c000-000000000001';
  PERFORM sop_assert('H2','current_version matches the effective version', v_cur=v_eff_ver,
                     coalesce(v_cur,'NULL')||' vs '||coalesce(v_eff_ver,'NULL'));

  -- an acknowledgement stays bound to the version it was made against
  INSERT INTO public.sop_acknowledgements(sop_version_id, user_id)
  VALUES ('00000000-0000-5400-d000-000000000001','00000000-0000-5400-b000-000000000001')
  ON CONFLICT DO NOTHING;
  SELECT count(*) INTO n_ack FROM public.sop_acknowledgements
   WHERE sop_version_id='00000000-0000-5400-d000-000000000001';
  PERFORM sop_assert('H3','acknowledgements stay attached to their version', n_ack=1, n_ack||' ack(s)');
END $h$;

-- publishing a second version while the parent is already effective must
-- not attempt a self-transition (the graph has none)
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-5400-b000-000000000001","role":"authenticated"}',false);
SET ROLE authenticated;
DO $h4$
DECLARE r jsonb; v_msg text; v_parent text;
BEGIN
  BEGIN
    r := public.publish_sop_version('00000000-0000-5400-d000-000000000003',
                                    '00000000-0000-5400-c000-000000000001',
                                    '00000000-0000-5400-a000-00000000000a');
    SELECT status INTO v_parent FROM public.sop_documents WHERE id='00000000-0000-5400-c000-000000000001';
    PERFORM sop_assert('H4','republishing while already effective succeeds',
      (r->>'parent_transitioned')='false' AND v_parent='effective',
      'moved='||coalesce(r->>'parent_transitioned','?')||' parent='||coalesce(v_parent,'NULL'));
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    PERFORM sop_assert('H4','republishing while already effective succeeds', false, v_msg);
  END;
END $h4$;
RESET ROLE;


-- =====================================================================
--  I / J — effective_date and overdue review unchanged
-- =====================================================================
DO $i$
DECLARE n_trig int; n_overdue int; n_lifecycle_from_review int;
BEGIN
  -- no scheduler was added: only the updated_at trigger, the lifecycle
  -- init trigger and the two guards should exist on sop_documents
  SELECT count(*) INTO n_trig FROM pg_trigger
   WHERE tgrelid='public.sop_documents'::regclass AND NOT tgisinternal;
  PERFORM sop_assert('I1','no scheduled promoter was added to sop_documents', n_trig=3,
                     n_trig||' trigger(s): updated_at + lifecycle init + status guard');

  SELECT count(*) INTO n_overdue FROM public.sop_documents
   WHERE review_due_date < current_date AND company_id='00000000-0000-5400-a000-00000000000a';
  PERFORM sop_assert('J1','derived overdue-review reporting still works', n_overdue >= 1,
                     n_overdue||' overdue-review document(s)');

  -- no lifecycle state may be named for review dates
  SELECT count(*) INTO n_lifecycle_from_review FROM public.lifecycle_states s
    JOIN public.lifecycle_definitions d ON d.id=s.definition_id
   WHERE d.entity_type='sop_document' AND s.state_key IN ('overdue','review_overdue');
  PERFORM sop_assert('J2','no overdue lifecycle state was introduced', n_lifecycle_from_review=0,
                     n_lifecycle_from_review||' such state(s)');
END $i$;

-- any-to-any preserved: a backwards move and an order-skipping move
SET ROLE authenticated;
DO $anyto$
DECLARE r jsonb; v_msg text;
BEGIN
  BEGIN
    r := public.lifecycle_transition('sop_document','00000000-0000-5400-c000-000000000002',
          'set_obsolete','00000000-0000-5400-a000-00000000000a'::uuid);
    PERFORM sop_assert('A3','an order-skipping move is still permitted', r->>'to_state'='obsolete',
                       'in_review -> '||coalesce(r->>'to_state','NULL'));
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    PERFORM sop_assert('A3','an order-skipping move is still permitted', false, v_msg);
  END;

  BEGIN
    r := public.lifecycle_transition('sop_document','00000000-0000-5400-c000-000000000002',
          'set_draft','00000000-0000-5400-a000-00000000000a'::uuid);
    PERFORM sop_assert('A4','a backwards move is still permitted', r->>'to_state'='draft',
                       'obsolete -> '||coalesce(r->>'to_state','NULL'));
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    PERFORM sop_assert('A4','a backwards move is still permitted', false, v_msg);
  END;
END $anyto$;
RESET ROLE;

-- a new document is initialised by the trigger and cannot claim a status
SET ROLE authenticated;
DO $newdoc$
DECLARE v_state text; v_status text;
BEGIN
  INSERT INTO public.sop_documents(id, company_id, sop_number, title, department, category, current_version, status, owner_id)
  VALUES ('00000000-0000-5400-c000-000000000010','00000000-0000-5400-a000-00000000000a',
          'SOP-QUA-010','new doc','Quality','quality','1.0','effective','00000000-0000-5400-b000-000000000001');
  SELECT s.state_key INTO v_state FROM public.entity_current_state ecs
    JOIN public.lifecycle_states s ON s.id=ecs.state_id
   WHERE ecs.entity_id='00000000-0000-5400-c000-000000000010';
  SELECT status INTO v_status FROM public.sop_documents WHERE id='00000000-0000-5400-c000-000000000010';
  PERFORM sop_assert('B6','a new SOP is initialised to the initial state', v_state='draft', coalesce(v_state,'NULL'));
  PERFORM sop_assert('B7','an inserted status cannot short-circuit the workflow', v_status='draft',
                     'asked for effective, got '||coalesce(v_status,'NULL'));
END $newdoc$;
RESET ROLE;

DO $const$
DECLARE v_con text;
BEGIN
  SELECT conname INTO v_con FROM pg_constraint
   WHERE conrelid='public.sop_documents'::regclass AND conname='sop_documents_status_check';
  PERFORM sop_assert('K1','the legacy status CHECK constraint is removed', v_con IS NULL, coalesce(v_con,'gone'));
END $const$;

SELECT set_config('request.jwt.claims','',false);


-- ── results ──────────────────────────────────────────────────────────
\echo ''
\echo '===== SOP × LIFECYCLE ENGINE + ATOMIC PUBLISH — TEST RESULTS ====='
SELECT id, name, verdict, detail FROM sop_results ORDER BY seq;
\echo ''
SELECT verdict, count(*) FROM sop_results GROUP BY verdict ORDER BY verdict;

-- ── cleanup ──────────────────────────────────────────────────────────
DO $cleanup$
BEGIN
  DELETE FROM public.sop_acknowledgements WHERE sop_version_id::text LIKE '00000000-0000-5400-d000-%';
  DELETE FROM public.entity_state_history WHERE entity_id::text LIKE '00000000-0000-5400-c000-%';
  DELETE FROM public.entity_current_state WHERE entity_id::text LIKE '00000000-0000-5400-c000-%';
  DELETE FROM public.sop_versions WHERE id::text LIKE '00000000-0000-5400-d000-%';
  ALTER TABLE public.sop_documents DISABLE TRIGGER trg_sop_documents_guard_status;
  DELETE FROM public.sop_documents WHERE id::text LIKE '00000000-0000-5400-c000-%';
  ALTER TABLE public.sop_documents ENABLE TRIGGER trg_sop_documents_guard_status;
  DELETE FROM public.company_members WHERE user_id::text LIKE '00000000-0000-5400-b000-%';
  DELETE FROM public.profiles  WHERE email LIKE 'sop-%@local.test';
  DELETE FROM auth.users       WHERE email LIKE 'sop-%@local.test';
  DELETE FROM public.companies WHERE name LIKE 'SOP %';
  RAISE NOTICE 'SOP fixtures removed.';
EXCEPTION WHEN others THEN
  RAISE WARNING 'CLEANUP INCOMPLETE (%). Remove SOP rows manually.', SQLERRM;
END $cleanup$;

DROP FUNCTION IF EXISTS sop_assert(text,text,boolean,text);
