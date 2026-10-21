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
-- =====================================================================
--  W5·11 — WHAT THE DEVIATION SCREENS ARE TOLD
--
--  Sections H to M cover 20261101000000_deviation_screens.sql. They
--  live in this suite rather than a new one because every one of them
--  has to agree with something asserted above: the impact vocabulary,
--  the lifecycle states, the tenancy rule.
-- =====================================================================
RESET ROLE;
SELECT set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-de11-b000-000000000001','role','authenticated')::text,
  false);
SET ROLE authenticated;

-- ── H. One framework per analysis ────────────────────────────────────
--
--  "Root cause uses one framework per analysis, configurable per
--   company. Five whys and 5W1H no longer appear together."
--
--  The table holds BOTH shapes — six 5W1H columns, and a chain of whys
--  in another table — so "no longer appear together" has to be
--  enforced in two places. H3 covers the half a CHECK can reach; H4
--  covers the half it cannot, which is the one that would have been
--  left to good intentions.
DO $h$
DECLARE
  c_a uuid := '00000000-0000-de11-a000-00000000000a';
  a_five uuid; a_w5h uuid; v_msg text;
BEGIN
  PERFORM dev_assert('H1','an analysis records which framework it used',
    (SELECT is_nullable='NO' FROM information_schema.columns
      WHERE table_schema='public' AND table_name='root_cause_analyses'
        AND column_name='framework'));

  INSERT INTO public.root_cause_analyses
    (company_id, subject_type, subject_id, framework)
  VALUES (c_a, 'deviation', gen_random_uuid(), 'five_whys')
  RETURNING id INTO a_five;

  INSERT INTO public.root_cause_analyses
    (company_id, subject_type, subject_id, framework)
  VALUES (c_a, 'deviation', gen_random_uuid(), '5w1h')
  RETURNING id INTO a_w5h;

  PERFORM dev_assert('H2','and is constrained to the two the design names',
    EXISTS (SELECT 1 FROM pg_constraint
             WHERE conname='rca_framework_chk'
               AND conrelid='public.root_cause_analyses'::regclass));

  --  A five-whys analysis holding 5W1H answers is the state DV-05 and
  --  DV-05b exist to make impossible.
  v_msg := NULL;
  BEGIN
    UPDATE public.root_cause_analyses SET w5h1_what = 'Tablets ran heavy'
     WHERE id = a_five;
  EXCEPTION WHEN others THEN v_msg := SQLERRM; END;
  PERFORM dev_assert('H3','a five-whys analysis cannot hold 5W1H answers',
    v_msg IS NOT NULL, coalesce(v_msg,'the answer was stored'));

  --  ═══ THE ONE THAT MATTERS ═══
  --  The other direction. A CHECK constraint can only see one row of
  --  one table, so the whys are reachable only through a trigger — and
  --  without it, half of "they no longer appear together" would be a
  --  comment.
  v_msg := NULL;
  BEGIN
    INSERT INTO public.root_cause_whys (analysis_id, seq, question, answer)
    VALUES (a_w5h, 1, 'Why did the tablets run heavy?', 'The hopper was topped up.');
  EXCEPTION WHEN others THEN v_msg := SQLERRM; END;
  PERFORM dev_assert('H4','a 5W1H analysis cannot have whys added to it',
    v_msg LIKE 'RCA_WRONG_FRAMEWORK%', coalesce(v_msg,'the why was stored'));

  --  ...and the five-whys one can, which is what stops H4 passing for
  --  the wrong reason.
  INSERT INTO public.root_cause_whys (analysis_id, seq, question, answer)
  VALUES (a_five, 1, 'Why did the tablets run heavy?', 'The hopper was topped up.');
  PERFORM dev_assert('H5','a five-whys analysis can',
    (SELECT count(*) = 1 FROM public.root_cause_whys WHERE analysis_id = a_five));

  --  Switching framework with a chain already recorded would leave it
  --  behind: still in the record, visible to nobody.
  v_msg := NULL;
  BEGIN
    UPDATE public.root_cause_analyses SET framework = '5w1h' WHERE id = a_five;
  EXCEPTION WHEN others THEN v_msg := SQLERRM; END;
  PERFORM dev_assert('H6','switching framework away from recorded whys is refused',
    v_msg LIKE 'RCA_FRAMEWORK_HAS_CONTENT%', coalesce(v_msg,'it was switched'));

  --  A completed analysis is a conclusion somebody signed up to, and
  --  the framework is part of how it was reached.
  UPDATE public.root_cause_analyses
     SET determined_root_cause = 'Hopper refilled mid-run',
         root_cause_category = 'method',
         completed_at = now()
   WHERE id = a_w5h;

  v_msg := NULL;
  BEGIN
    UPDATE public.root_cause_analyses SET framework = 'five_whys' WHERE id = a_w5h;
  EXCEPTION WHEN others THEN v_msg := SQLERRM; END;
  PERFORM dev_assert('H7','a completed analysis cannot change framework',
    v_msg LIKE 'RCA_COMPLETED%', coalesce(v_msg,'it was changed'));

  PERFORM set_config('dev.a_five', a_five::text, false);
  PERFORM set_config('dev.a_w5h', a_w5h::text, false);
END $h$;

-- ── I. The company's root cause categories ───────────────────────────
DO $i$
DECLARE
  c_a uuid := '00000000-0000-de11-a000-00000000000a';
  a uuid; v_msg text; n integer;
BEGIN
  --  ═══ THE ONE THAT MATTERS ═══
  --  A company that has never customised its list still has one. Without
  --  the fallback the list would depend on whether the company existed
  --  when the migration ran, so every company created afterwards would
  --  have an empty picker and no completable analysis — a failure that
  --  surfaces weeks later, in a tenant nobody is testing. This company
  --  was created by the fixtures ABOVE the migration's seed loop, so it
  --  genuinely has no rows.
  SELECT count(*) INTO n FROM public.root_cause_categories WHERE company_id = c_a;
  PERFORM dev_assert('I1','this company has no categories of its own', n = 0, n||' row(s)');

  SELECT count(*) INTO n FROM public.root_cause_categories_effective(c_a);
  PERFORM dev_assert('I2','and still gets the six defaults', n = 6, n||' offered');

  PERFORM dev_assert('I3','which are the ones the design proposes',
    (SELECT array_agg(category_key ORDER BY sort_order)
       FROM public.root_cause_categories_effective(c_a))
      = ARRAY['people','machine','method','material','measurement','environment'],
    (SELECT array_agg(category_key ORDER BY sort_order)::text
       FROM public.root_cause_categories_effective(c_a)));

  --  A draft may hold anything while somebody is still deciding.
  INSERT INTO public.root_cause_analyses
    (company_id, subject_type, subject_id, framework, root_cause_category)
  VALUES (c_a, 'deviation', gen_random_uuid(), 'five_whys', 'something_unlisted')
  RETURNING id INTO a;
  PERFORM dev_assert('I4','a draft may hold a category nobody offers', a IS NOT NULL);

  --  A conclusion may not.
  v_msg := NULL;
  BEGIN
    UPDATE public.root_cause_analyses
       SET determined_root_cause = 'Something', completed_at = now()
     WHERE id = a;
  EXCEPTION WHEN others THEN v_msg := SQLERRM; END;
  PERFORM dev_assert('I5','a completed analysis must name an offered category',
    v_msg LIKE 'RCA_CATEGORY_NOT_OFFERED%', coalesce(v_msg,'it was completed'));

  UPDATE public.root_cause_analyses
     SET root_cause_category = 'machine', determined_root_cause = 'Fill cam worn',
         completed_at = now()
   WHERE id = a;
  PERFORM dev_assert('I6','and completes once it names one',
    (SELECT completed_at IS NOT NULL FROM public.root_cause_analyses WHERE id = a));

  --  A row holding one of the OLD CHECK list's values — which is what
  --  every analysis completed before this migration holds, and the
  --  case the seed's second half exists to protect. 'management_system'
  --  was admitted by the old constraint and is in none of the six
  --  defaults, so a seed that wrote only the defaults would leave this
  --  analysis naming a category its company does not offer.
  INSERT INTO public.root_cause_analyses
    (company_id, subject_type, subject_id, framework, root_cause_category)
  VALUES (c_a, 'deviation', gen_random_uuid(), 'five_whys', 'management_system');

  --  Seeding writes the defaults down so a company can edit them, and
  --  retires anything already in use rather than orphaning it.
  PERFORM public.root_cause_categories_seed(c_a);
  SELECT count(*) INTO n FROM public.root_cause_categories WHERE company_id = c_a;
  --  Six defaults plus the one legacy key still in use: seven.
  PERFORM dev_assert('I7','seeding writes the list down, keeping used keys',
    n = 7, n||' row(s)');

  --  ═══ THE ONE THAT MATTERS IN THIS SECTION ═══
  --  Retained, so history validates; inactive, so the picker stays
  --  clean. A seed that wrote only the six would have made every
  --  analysis completed under the old list fail the new validation
  --  while being a perfectly good record of what happened.
  PERFORM dev_assert('I8','a key already in use is retained but not offered',
    (SELECT is_active = false FROM public.root_cause_categories
      WHERE company_id = c_a AND category_key = 'management_system'),
    (SELECT coalesce(is_active::text,'absent') FROM public.root_cause_categories
      WHERE company_id = c_a AND category_key = 'management_system'));

  PERFORM dev_assert('I9','and the six defaults are offered beside it',
    (SELECT count(*) FROM public.root_cause_categories_effective(c_a)
      WHERE is_active) = 6);

  --  ...and history stays valid against it. A retired category is a
  --  true record of a conclusion reached while it was offered.
  UPDATE public.root_cause_categories SET is_active = false
   WHERE company_id = c_a AND category_key = 'machine';
  v_msg := NULL;
  BEGIN
    UPDATE public.root_cause_analyses SET determined_root_cause = 'Fill cam worn badly'
     WHERE id = a;
  EXCEPTION WHEN others THEN v_msg := SQLERRM; END;
  PERFORM dev_assert('I10','retiring a category does not invalidate history',
    v_msg IS NULL, coalesce(v_msg,''));
  UPDATE public.root_cause_categories SET is_active = true
   WHERE company_id = c_a AND category_key = 'machine';
END $i$;

-- ── J. What each impact option will do ───────────────────────────────
DO $j2$
DECLARE
  c_a uuid := '00000000-0000-de11-a000-00000000000a';
  n integer; r record;
BEGIN
  SELECT count(*) INTO n
    FROM public.deviation_impact_consequence(c_a, 'process', NULL);
  --  THREE, never four. Blank is not a fourth option; it is the
  --  absence of one, and "impact preselected: no — all three options
  --  start empty, a blank impact is an error" is the design's NOT
  --  DONE IF.
  PERFORM dev_assert('J1','there are exactly three impact options', n = 3, n||' option(s)');

  PERFORM dev_assert('J2','their keys are the ones the column accepts',
    (SELECT array_agg(impact ORDER BY sort_order)
       FROM public.deviation_impact_consequence(c_a,'process',NULL))
      = ARRAY['yes','no','undetermined']);

  --  yes blocks, no warns (B1.3–B1.5).
  PERFORM dev_assert('J3','yes blocks and no warns',
    (SELECT effect FROM public.deviation_impact_consequence(c_a,'process',NULL)
      WHERE impact='yes') = 'blocks'
    AND (SELECT effect FROM public.deviation_impact_consequence(c_a,'process',NULL)
          WHERE impact='no') = 'warns');

  --  ═══ THE ONE THAT MATTERS ═══
  --  Decision 1 for the lead. Whether an undetermined impact blocks is
  --  item 02's SAFE DEFAULT held as a company setting, not decided in
  --  a function — so confirming it is a row, and reversing it is the
  --  same row. If this ever becomes a constant, this assertion is what
  --  notices.
  PERFORM dev_assert('J4','undetermined blocks by default',
    (SELECT effect FROM public.deviation_impact_consequence(c_a,'process',NULL)
      WHERE impact='undetermined') = 'blocks');

  INSERT INTO public.company_rca_settings (company_id, undetermined_blocks_release)
  VALUES (c_a, false)
  ON CONFLICT (company_id) DO UPDATE SET undetermined_blocks_release = false;

  PERFORM dev_assert('J5','and follows the company setting when it is changed',
    (SELECT effect FROM public.deviation_impact_consequence(c_a,'process',NULL)
      WHERE impact='undetermined') = 'warns');

  UPDATE public.company_rca_settings SET undetermined_blocks_release = true
   WHERE company_id = c_a;

  --  Every option says something, and says it about release.
  PERFORM dev_assert('J6','every option states a consequence',
    NOT EXISTS (SELECT 1 FROM public.deviation_impact_consequence(c_a,'process',NULL)
                 WHERE coalesce(btrim(consequence),'') = ''
                    OR consequence NOT ILIKE '%release%'));

  --  "Undetermined is fine; blank isn't" — the sheet says so where the
  --  option is, not only in an error after the fact.
  PERFORM dev_assert('J7','undetermined says it is a real answer',
    (SELECT consequence FROM public.deviation_impact_consequence(c_a,'process',NULL)
      WHERE impact='undetermined') ILIKE '%blank is not%');
END $j2$;

-- ── K. The register ──────────────────────────────────────────────────
DO $k2$
DECLARE
  c_a uuid := '00000000-0000-de11-a000-00000000000a';
  d_late public.deviations; d_soon public.deviations; d_crit public.deviations;
  n integer;
BEGIN
  d_crit := public.deviation_raise(c_a,'Critical, raised today','critical','yes','process');
  d_late := public.deviation_raise(c_a,'Minor, three weeks late','minor','no','process');
  d_soon := public.deviation_raise(c_a,'Major, due next week','major','no','process');

  UPDATE public.deviations SET investigation_due_date = current_date - 21
   WHERE id = d_late.id;
  UPDATE public.deviations SET investigation_due_date = current_date + 7
   WHERE id = d_soon.id;

  --  ═══ THE ONE THAT MATTERS ═══
  --  Overdue first, and severity BELOW it. A minor deviation three
  --  weeks past its date says more about the system than a critical
  --  one raised this morning, and the register is read to find what
  --  has been forgotten — so the late minor sorts above the fresh
  --  critical.
  PERFORM dev_assert('K1','overdue sorts above severity',
    (SELECT id FROM public.deviation_register(c_a) LIMIT 1) = d_late.id,
    (SELECT title FROM public.deviation_register(c_a) LIMIT 1));

  PERFORM dev_assert('K2','and the gravest of the rest comes next',
    (SELECT id FROM public.deviation_register(c_a) OFFSET 1 LIMIT 1) = d_crit.id);

  --  Derived from today, not stored. A stored flag is wrong the
  --  morning after it is written.
  PERFORM dev_assert('K3','overdue is derived, with the days counted',
    (SELECT is_overdue AND days_overdue = 21
       FROM public.deviation_register(c_a) WHERE id = d_late.id));

  PERFORM dev_assert('K4','something due next week is not overdue',
    (SELECT NOT is_overdue FROM public.deviation_register(c_a) WHERE id = d_soon.id));

  PERFORM dev_assert('K5','nor is something with no due date set',
    (SELECT NOT is_overdue AND days_overdue IS NULL
       FROM public.deviation_register(c_a) WHERE id = d_crit.id));

  --  There is no is_overdue COLUMN to go stale.
  PERFORM dev_assert('K6','no overdue flag is stored on the row',
    NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='deviations'
                   AND column_name IN ('is_overdue','overdue')));

  --  The register is read by people who know batch numbers, not uuids.
  PERFORM dev_assert('K7','the source is named, not just typed',
    (SELECT source_label IS NOT NULL
       FROM public.deviation_register(c_a) WHERE id = d_crit.id));

  PERFORM set_config('dev.d_crit', d_crit.id::text, false);
END $k2$;

-- ── L. The closure readiness checklist ───────────────────────────────
DO $l2$
DECLARE
  d_crit uuid := current_setting('dev.d_crit')::uuid;
  n integer;
BEGIN
  SELECT count(*) INTO n FROM public.deviation_closure_readiness(d_crit);
  PERFORM dev_assert('L1','the checklist has a condition per thing closure needs',
    n = 4, n||' condition(s)');

  --  ═══ THE ONE THAT MATTERS ═══
  --  Decision 4 is OPEN: whether a CAPA, or an explicit "not needed"
  --  with a reason, is required before closure. So the condition is
  --  reported and counted, and it refuses nothing. A gate built on an
  --  unconfirmed rule is one somebody has to discover and unpick.
  PERFORM dev_assert('L2','the CAPA condition is advisory while decision 4 is open',
    (SELECT blocking = false FROM public.deviation_closure_readiness(d_crit)
      WHERE condition_key = 'capa_decided'));

  --  ...and the ones that ARE enforced say so, so the two are
  --  distinguishable on the screen.
  PERFORM dev_assert('L3','the conditions that are enforced are marked blocking',
    (SELECT bool_and(blocking) FROM public.deviation_closure_readiness(d_crit)
      WHERE condition_key IN ('impact_assessed','root_cause_determined','awaiting_qa')));

  PERFORM dev_assert('L4','a deviation with no root cause is not ready',
    (SELECT met = false FROM public.deviation_closure_readiness(d_crit)
      WHERE condition_key = 'root_cause_determined'));

  --  This one was raised with impact 'yes', so it IS assessed. An
  --  undetermined impact is the case that is not.
  PERFORM dev_assert('L5','an assessed impact counts as met',
    (SELECT met FROM public.deviation_closure_readiness(d_crit)
      WHERE condition_key = 'impact_assessed'));

  PERFORM dev_assert('L6','every condition says why, not just whether',
    NOT EXISTS (SELECT 1 FROM public.deviation_closure_readiness(d_crit)
                 WHERE coalesce(btrim(detail),'') = ''));
END $l2$;

-- ── M. The entry point spec, and tenancy on the new reports ──────────
DO $m2$
DECLARE n integer; bad text;
BEGIN
  SELECT count(*) INTO n FROM public.deviation_entry_point_spec();
  PERFORM dev_assert('M1','the spec board lists every route',
    n = 6, n||' route(s)');

  PERFORM dev_assert('M2','four of them are manual and two automatic',
    (SELECT count(*) FROM public.deviation_entry_point_spec() WHERE kind='manual') = 4
    AND (SELECT count(*) FROM public.deviation_entry_point_spec() WHERE kind='automatic') = 2);

  --  A board describing a path nobody built is worse than no board:
  --  somebody reads it and goes looking for the screen. The migration
  --  asserts this at deploy; this asserts it where a reader will see
  --  which route broke.
  SELECT string_agg(e.implemented_by, ', ') INTO bad
    FROM public.deviation_entry_point_spec() e
   WHERE NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
                      WHERE ns.nspname='public' AND p.proname = e.implemented_by);
  PERFORM dev_assert('M3','and every one of them names something that exists',
    bad IS NULL, coalesce(bad,''));

  PERFORM dev_assert('M4','each route says what it fills in',
    NOT EXISTS (SELECT 1 FROM public.deviation_entry_point_spec()
                 WHERE coalesce(btrim(prefills),'') = ''));
END $m2$;

RESET ROLE;
SELECT set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-de11-b000-000000000003','role','authenticated')::text,
  false);
SET ROLE authenticated;

DO $m3$
DECLARE
  c_a uuid := '00000000-0000-de11-a000-00000000000a';
  v_msg text; n integer;
BEGIN
  --  Every new report is SECURITY DEFINER, so the policies asserted in
  --  section G prove nothing about them.
  v_msg := NULL;
  BEGIN PERFORM public.deviation_impact_consequence(c_a,'process',NULL);
  EXCEPTION WHEN others THEN v_msg := SQLERRM; END;
  PERFORM dev_assert('M5','a foreign company cannot ask what an impact would do',
    v_msg LIKE 'DEVIATION_FORBIDDEN%', coalesce(v_msg,'they were told'));

  v_msg := NULL;
  BEGIN PERFORM public.deviation_register(c_a);
  EXCEPTION WHEN others THEN v_msg := SQLERRM; END;
  PERFORM dev_assert('M6','nor read the register',
    v_msg LIKE 'DEVIATION_FORBIDDEN%', coalesce(v_msg,'they read it'));

  v_msg := NULL;
  BEGIN PERFORM public.deviation_closure_readiness(current_setting('dev.d_crit')::uuid);
  EXCEPTION WHEN others THEN v_msg := SQLERRM; END;
  PERFORM dev_assert('M7','nor the closure checklist',
    v_msg LIKE 'DEVIATION_FORBIDDEN%', coalesce(v_msg,'they read it'));

  SELECT count(*) INTO n FROM public.root_cause_categories_effective(c_a);
  PERFORM dev_assert('M8','nor another company''s category list',
    n = 0, n||' row(s)');

  --  DV-10. The empty register is read HERE, as a member of the
  --  company that has no deviations — company B. Asking about somebody
  --  else's empty register is refused, which is a different thing and
  --  is M6.
  SELECT count(*) INTO n
    FROM public.deviation_register('00000000-0000-de11-a000-00000000000b');
  PERFORM dev_assert('M9','a company with no deviations gets an empty register, not an error',
    n = 0, n||' row(s)');
END $m3$;

RESET ROLE;
SELECT set_config('request.jwt.claims','', false);

--  verdict table when there are failures, and the three-column line
--  when there are none. The three columns are total, passed, failed in
--  that order -- the harness takes columns 2 and 3 as passed and
--  failed, so any other order reports a clean suite as a broken one.
--  Which ones failed, named, above the counts. Without this a failing
--  run prints two numbers and sends whoever reads it back to the file
--  to work out which assertion they broke.
SELECT id, name, detail FROM dev_results WHERE verdict='FAIL' ORDER BY seq;
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
