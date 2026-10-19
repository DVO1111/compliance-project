-- =====================================================================
--  DEVIATIONS — INTEGRATION TESTS  (Week 5, item 02)
--  LOCAL / DISPOSABLE DATABASE ONLY
-- =====================================================================
--  Covers 20261023000000_deviations.sql.
--
--  The brief's NOT DONE IF list is the specification these assertions
--  are written against, one section per line of it:
--
--    B  Status stored as a column instead of lifecycle state
--    C  A deviation can close without the QA role and signature
--    D  Impact left blank and accepted ("undetermined" is allowed)
--    E  Not visible from the batch or lot it was raised against
--
--  Plus the two requirements whose failure is silent rather than loud:
--  per-company numbering that cannot collide, and tenancy.
--
--  Run:  psql "<local url>" -f supabase/tests/deviations_test.sql
--
--  Safe to run repeatedly. Fixtures are tagged dev- and removed at the
--  end. No permanent schema change is made.
-- =====================================================================

\set ON_ERROR_STOP off

--  The harness runs every suite against one database in sequence, and a
--  suite that ends while still SET ROLE authenticated leaves the next
--  one running as that role — where the fixtures below are refused by
--  RLS and every assertion then fails for a reason that has nothing to
--  do with deviations. Start from a known role rather than inheriting
--  whatever the previous file left behind.
RESET ROLE;
SELECT set_config('request.jwt.claims','', false);

DO $guard$
BEGIN
  IF current_database() NOT IN ('postgres','criateur_local') THEN
    RAISE EXCEPTION 'REFUSING TO RUN outside a local database (got %)', current_database();
  END IF;
  IF to_regclass('public.deviations') IS NULL THEN
    RAISE EXCEPTION 'Migration 20261023000000 has not been applied to this database.';
  END IF;
END $guard$;

DROP TABLE IF EXISTS dev_results;
CREATE TEMP TABLE dev_results(seq serial, id text, name text, verdict text, detail text);
GRANT ALL ON dev_results TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE dev_results_seq_seq TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION dev_assert(p_id text, p_name text, p_cond boolean, p_detail text DEFAULT '')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO dev_results(id,name,verdict,detail)
  VALUES (p_id,p_name,CASE WHEN p_cond THEN 'PASS' ELSE 'FAIL' END,p_detail);
END $$;

-- ── Fixtures ─────────────────────────────────────────────────────────
--  Two companies, because half of what is tested here is that one
--  cannot see or touch the other.
DO $fix$
DECLARE
  c_a uuid := '00000000-0000-de11-a000-00000000000a';
  c_b uuid := '00000000-0000-de11-a000-00000000000b';
  u_qa uuid := '00000000-0000-de11-b000-000000000001';
  u_op uuid := '00000000-0000-de11-b000-000000000002';
  u_b  uuid := '00000000-0000-de11-b000-000000000003';
BEGIN
  DELETE FROM public.deviations WHERE company_id IN (c_a, c_b);
  DELETE FROM public.deviation_counters WHERE company_id IN (c_a, c_b);
  DELETE FROM public.companies WHERE id IN (c_a, c_b);
  DELETE FROM auth.users WHERE id IN (u_qa, u_op, u_b);

  INSERT INTO auth.users (id, email) VALUES
    (u_qa,'dev-qa@example.invalid'), (u_op,'dev-op@example.invalid'), (u_b,'dev-b@example.invalid');

  INSERT INTO public.companies (id, name) VALUES (c_a,'Dev Alpha'), (c_b,'Dev Bravo');

  INSERT INTO public.profiles (id, email, company_id, role) VALUES
    (u_qa,'dev-qa@example.invalid', c_a, 'admin'),
    (u_op,'dev-op@example.invalid', c_a, 'content_creator'),
    (u_b ,'dev-b@example.invalid' , c_b, 'admin');

  INSERT INTO public.company_members (company_id, user_id, role, status) VALUES
    (c_a, u_qa, 'owner', 'active'),
    (c_a, u_op, 'viewer', 'active'),
    (c_b, u_b , 'owner', 'active');
END $fix$;

-- =====================================================================
--  A. Shape — the specification is in the DDL, not only in a service
-- =====================================================================
SELECT dev_assert('A1','deviations and deviation_links both exist',
  to_regclass('public.deviations') IS NOT NULL
  AND to_regclass('public.deviation_links') IS NOT NULL);

--  "Status stored as a column instead of lifecycle state" — NOT DONE IF.
SELECT dev_assert('A2','there is no status column',
  NOT EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='deviations'
                AND column_name IN ('status','state')),
  'state belongs to the lifecycle engine');

--  "Impact left blank and accepted" — NOT DONE IF. The column itself
--  has to refuse it; a service-layer check is not the same guarantee.
SELECT dev_assert('A3','product_quality_impact is NOT NULL with no default',
  (SELECT is_nullable='NO' AND column_default IS NULL
     FROM information_schema.columns
    WHERE table_schema='public' AND table_name='deviations'
      AND column_name='product_quality_impact'));

SELECT dev_assert('A4','severity and impact are constrained to their vocabularies',
  (SELECT count(*) FROM pg_constraint
    WHERE conrelid='public.deviations'::regclass AND contype='c'
      AND pg_get_constraintdef(oid) LIKE '%product_quality_impact%') >= 1
  AND (SELECT count(*) FROM pg_constraint
    WHERE conrelid='public.deviations'::regclass AND contype='c'
      AND pg_get_constraintdef(oid) LIKE '%severity%') >= 1);

--  A deviation raised against a batch with no batch is not a deviation
--  against a batch.
SELECT dev_assert('A5','a row source requires a source id',
  EXISTS (SELECT 1 FROM pg_constraint
           WHERE conrelid='public.deviations'::regclass
             AND conname='deviations_source_id_required'));

SELECT dev_assert('A6','a deviation cannot be deleted by a member',
  NOT EXISTS (SELECT 1 FROM pg_policies
               WHERE schemaname='public' AND tablename='deviations' AND cmd='DELETE'),
  'a quality record is closed, never removed');

-- =====================================================================
--  B. The lifecycle holds the state, with the four states named
-- =====================================================================
SELECT dev_assert('B1','four states, exactly as the brief names them',
  (SELECT array_agg(s.state_key ORDER BY s.sort_order)
     FROM public.lifecycle_states s
     JOIN public.lifecycle_definitions d ON d.id = s.definition_id
    WHERE d.entity_type='deviation' AND d.company_id IS NULL)
  = ARRAY['raised','under_investigation','pending_qa_closure','closed']);

--  "A closed deviation is locked."
SELECT dev_assert('B2','closed is both terminal and locked',
  (SELECT s.is_terminal AND s.is_locked
     FROM public.lifecycle_states s
     JOIN public.lifecycle_definitions d ON d.id = s.definition_id
    WHERE d.entity_type='deviation' AND s.state_key='closed'));

--  "Closure requires QA approval and an electronic signature."
SELECT dev_assert('B3','closure demands a signature, a comment and the QA role',
  (SELECT t.requires_signature AND t.requires_comment AND t.required_role IS NOT NULL
     FROM public.lifecycle_transitions t
     JOIN public.lifecycle_definitions d ON d.id = t.definition_id
    WHERE d.entity_type='deviation' AND t.action_key='qa_close'));

SELECT dev_assert('B4','closed can only be reached through QA closure',
  (SELECT count(*) FROM public.lifecycle_transitions t
     JOIN public.lifecycle_definitions d ON d.id = t.definition_id
     JOIN public.lifecycle_states s ON s.id = t.to_state_id
    WHERE d.entity_type='deviation' AND s.state_key='closed') = 1);

-- =====================================================================
--  C. Raising — as a member of the company
-- =====================================================================
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-de11-b000-000000000001","role":"authenticated"}', false);
SET ROLE authenticated;

--  "Impact left blank and accepted" — refused, with a message about
--  the thing that is wrong rather than about a constraint.
DO $$
DECLARE v_msg text := '';
BEGIN
  BEGIN
    PERFORM public.deviation_raise(
      '00000000-0000-de11-a000-00000000000a','Blank impact','major','','process');
  EXCEPTION WHEN others THEN v_msg := SQLERRM;
  END;
  PERFORM dev_assert('C1','a blank impact is refused',
    v_msg LIKE 'DEVIATION_IMPACT_REQUIRED%', v_msg);
END $$;

--  "'Undetermined' is allowed. Blank is not."
DO $$
DECLARE v public.deviations;
BEGIN
  v := public.deviation_raise(
    '00000000-0000-de11-a000-00000000000a','Weight out of trend','major','undetermined',
    'batch','00000000-0000-de11-c000-000000000001', NULL, 'inprocess_reading_flagged');
  PERFORM dev_assert('C2','undetermined is accepted', v.product_quality_impact = 'undetermined');
  PERFORM dev_assert('C3','the first deviation is numbered DEV-00001', v.deviation_number = 'DEV-00001', v.deviation_number);
  PERFORM dev_assert('C4','the entry point is recorded', v.entry_point = 'inprocess_reading_flagged');
  PERFORM dev_assert('C5','the raiser is taken from the session, not the caller', v.raised_by = '00000000-0000-de11-b000-000000000001');
END $$;

DO $$
DECLARE v public.deviations;
BEGIN
  v := public.deviation_raise(
    '00000000-0000-de11-a000-00000000000a','Supplier certificate mismatch','minor','no',
    'material_lot','00000000-0000-de11-c000-000000000002', NULL, 'supplier_certificate_discrepancy');
  PERFORM dev_assert('C6','numbering advances without collision', v.deviation_number = 'DEV-00002', v.deviation_number);
END $$;

--  State is the engine's answer, not a column's.
SELECT dev_assert('C7','a new deviation starts in raised, via the engine',
  (SELECT s.state_key
     FROM public.deviations d
     JOIN public.entity_current_state e ON e.entity_type='deviation' AND e.entity_id = d.id
     JOIN public.lifecycle_states s ON s.id = e.state_id
    WHERE d.deviation_number='DEV-00001'
      AND d.company_id='00000000-0000-de11-a000-00000000000a') = 'raised');

-- =====================================================================
--  D. Tenancy
-- =====================================================================
DO $$
DECLARE v_msg text := '';
BEGIN
  BEGIN
    PERFORM public.deviation_raise(
      '00000000-0000-de11-a000-00000000000b','Cross tenant','minor','no','process');
  EXCEPTION WHEN others THEN v_msg := SQLERRM;
  END;
  PERFORM dev_assert('D1','a member cannot raise into another company',
    v_msg LIKE 'DEVIATION_FORBIDDEN%', v_msg);
END $$;

RESET ROLE;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-de11-b000-000000000003","role":"authenticated"}', false);
SET ROLE authenticated;

SELECT dev_assert('D2','another company sees none of these deviations',
  (SELECT count(*) FROM public.deviations
    WHERE company_id='00000000-0000-de11-a000-00000000000a') = 0);

-- =====================================================================
--  E. Closure cannot be reached without QA and a signature
-- =====================================================================
RESET ROLE;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-de11-b000-000000000002","role":"authenticated"}', false);
SET ROLE authenticated;

--  Anybody may investigate. That is deliberate: "raised ... by any user".
DO $$
DECLARE d uuid; v_ok boolean := true;
BEGIN
  SELECT id INTO d FROM public.deviations WHERE deviation_number='DEV-00001'
     AND company_id='00000000-0000-de11-a000-00000000000a';
  BEGIN
    PERFORM public.lifecycle_transition('deviation', d, 'start_investigation',
      '00000000-0000-de11-a000-00000000000a', NULL, 'looking into it', '{}'::jsonb);
    PERFORM public.lifecycle_transition('deviation', d, 'submit_for_qa_closure',
      '00000000-0000-de11-a000-00000000000a', NULL, 'investigation complete', '{}'::jsonb);
  EXCEPTION WHEN others THEN v_ok := false;
  END;
  PERFORM dev_assert('E1','a non-QA member can investigate and submit', v_ok);
END $$;

--  "A deviation can close without the QA role and signature" — NOT DONE IF.
DO $$
DECLARE d uuid; v_msg text := '';
BEGIN
  SELECT id INTO d FROM public.deviations WHERE deviation_number='DEV-00001'
     AND company_id='00000000-0000-de11-a000-00000000000a';
  BEGIN
    PERFORM public.lifecycle_transition('deviation', d, 'qa_close',
      '00000000-0000-de11-a000-00000000000a', NULL, 'closing', '{}'::jsonb);
  EXCEPTION WHEN others THEN v_msg := SQLERRM;
  END;
  PERFORM dev_assert('E2','a non-QA member cannot close it', v_msg <> '', v_msg);
END $$;

RESET ROLE;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-de11-b000-000000000001","role":"authenticated"}', false);
SET ROLE authenticated;

--  The QA role is necessary and still not sufficient.
DO $$
DECLARE d uuid; v_msg text := '';
BEGIN
  SELECT id INTO d FROM public.deviations WHERE deviation_number='DEV-00001'
     AND company_id='00000000-0000-de11-a000-00000000000a';
  BEGIN
    PERFORM public.lifecycle_transition('deviation', d, 'qa_close',
      '00000000-0000-de11-a000-00000000000a', NULL, 'approved for closure', '{}'::jsonb);
  EXCEPTION WHEN others THEN v_msg := SQLERRM;
  END;
  PERFORM dev_assert('E3','even QA cannot close without a signature',
    v_msg LIKE '%SIGNATURE%', v_msg);
END $$;

SELECT dev_assert('E4','the deviation is still open',
  (SELECT s.state_key <> 'closed'
     FROM public.deviations d
     JOIN public.entity_current_state e ON e.entity_type='deviation' AND e.entity_id = d.id
     JOIN public.lifecycle_states s ON s.id = e.state_id
    WHERE d.deviation_number='DEV-00001'
      AND d.company_id='00000000-0000-de11-a000-00000000000a'));

-- =====================================================================
--  F. Visible from the batch it was raised against
-- =====================================================================
--  "Not visible from the batch or lot it was raised against" is a
--  NOT DONE IF, and this is the read release gating (item 05) makes.
SELECT dev_assert('F1','an open deviation is found from its batch',
  (SELECT count(*) FROM public.deviation_open_for_batch(
     '00000000-0000-de11-a000-00000000000a','00000000-0000-de11-c000-000000000001')) = 1);

SELECT dev_assert('F2','and reports the impact the gate reads',
  (SELECT product_quality_impact FROM public.deviation_open_for_batch(
     '00000000-0000-de11-a000-00000000000a','00000000-0000-de11-c000-000000000001')) = 'undetermined');

SELECT dev_assert('F3','and says it was raised against the batch rather than linked',
  (SELECT attached_as FROM public.deviation_open_for_batch(
     '00000000-0000-de11-a000-00000000000a','00000000-0000-de11-c000-000000000001')) = 'raised_against');

--  A deviation linked to a batch is found the same way.
DO $$
DECLARE d uuid;
BEGIN
  SELECT id INTO d FROM public.deviations WHERE deviation_number='DEV-00002'
     AND company_id='00000000-0000-de11-a000-00000000000a';
  INSERT INTO public.deviation_links (company_id, deviation_id, linked_type, linked_id, created_by)
  VALUES ('00000000-0000-de11-a000-00000000000a', d, 'batch',
          '00000000-0000-de11-c000-000000000001',
          '00000000-0000-de11-b000-000000000001');
END $$;

SELECT dev_assert('F4','a linked deviation is found from the batch too',
  (SELECT count(*) FROM public.deviation_open_for_batch(
     '00000000-0000-de11-a000-00000000000a','00000000-0000-de11-c000-000000000001')) = 2);

SELECT dev_assert('F5','linking the same thing twice is refused',
  EXISTS (SELECT 1 FROM pg_constraint
           WHERE conrelid='public.deviation_links'::regclass
             AND conname='deviation_links_unique'));

-- =====================================================================
--  G. Immutability of what must not drift
-- =====================================================================
DO $$
DECLARE d uuid; v_msg text := '';
BEGIN
  SELECT id INTO d FROM public.deviations WHERE deviation_number='DEV-00002'
     AND company_id='00000000-0000-de11-a000-00000000000a';
  BEGIN
    UPDATE public.deviations SET deviation_number='DEV-99999' WHERE id = d;
  EXCEPTION WHEN others THEN v_msg := SQLERRM;
  END;
  PERFORM dev_assert('G1','the number cannot be changed',
    v_msg LIKE 'DEVIATION_IMMUTABLE%', v_msg);
END $$;

DO $$
DECLARE d uuid; v_msg text := '';
BEGIN
  SELECT id INTO d FROM public.deviations WHERE deviation_number='DEV-00002'
     AND company_id='00000000-0000-de11-a000-00000000000a';
  BEGIN
    UPDATE public.deviations SET product_quality_impact='' WHERE id = d;
  EXCEPTION WHEN others THEN v_msg := SQLERRM;
  END;
  PERFORM dev_assert('G2','impact cannot be cleared after the fact', v_msg <> '', v_msg);
END $$;

--  It CAN be revised, which is the whole point of 'undetermined'.
DO $$
DECLARE d uuid; v_ok boolean := true;
BEGIN
  SELECT id INTO d FROM public.deviations WHERE deviation_number='DEV-00002'
     AND company_id='00000000-0000-de11-a000-00000000000a';
  BEGIN
    UPDATE public.deviations SET product_quality_impact='yes' WHERE id = d;
  EXCEPTION WHEN others THEN v_ok := false;
  END;
  PERFORM dev_assert('G3','impact can be revised during investigation', v_ok);
END $$;

-- ── Report ───────────────────────────────────────────────────────────
RESET ROLE;
SELECT set_config('request.jwt.claims','', false);

SELECT seq, id, name, verdict, detail FROM dev_results ORDER BY seq;

--  Two shapes, because the CI harness reads either: the grouped
--  verdict table when there are failures, and the three-column line
--  when there are none. The three columns are total, passed, failed in
--  that order -- the harness takes columns 2 and 3 as passed and
--  failed, so any other order reports a clean suite as a broken one.
SELECT verdict, count(*) FROM dev_results GROUP BY verdict ORDER BY verdict;

SELECT count(*) AS total,
       count(*) FILTER (WHERE verdict='PASS') AS passed,
       count(*) FILTER (WHERE verdict='FAIL') AS failed
FROM dev_results;

-- ── Clean up ─────────────────────────────────────────────────────────
DO $cleanup$
DECLARE
  c_a uuid := '00000000-0000-de11-a000-00000000000a';
  c_b uuid := '00000000-0000-de11-a000-00000000000b';
BEGIN
  DELETE FROM public.deviations WHERE company_id IN (c_a, c_b);
  DELETE FROM public.deviation_counters WHERE company_id IN (c_a, c_b);
  DELETE FROM public.companies WHERE id IN (c_a, c_b);
  DELETE FROM auth.users WHERE id IN (
    '00000000-0000-de11-b000-000000000001',
    '00000000-0000-de11-b000-000000000002',
    '00000000-0000-de11-b000-000000000003');
END $cleanup$;
