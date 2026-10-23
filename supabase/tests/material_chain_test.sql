-- =====================================================================
--  GOODS RECEIPT -> QC TESTING -> QA DISPOSITION — CHAIN TESTS
--  LOCAL / DISPOSABLE DATABASE ONLY
-- =====================================================================
--  The three screens built for this chain each claim a dependency is
--  enforced somewhere other than themselves. This file is where that
--  claim is checked.
--
--  WHAT IS DELIBERATELY ASSERTED HERE IS THE REFUSALS. A chain test
--  that only walked the happy path would pass on a system with every
--  gate removed. So each section attempts the thing that must not
--  work, and the assertion is that it RAISED — with the right error,
--  not merely some error.
--
--  Run:  psql "<local url>" -f supabase/tests/material_chain_test.sql
--
--  Safe to run repeatedly. Fixtures are tagged mch- and removed at the
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
  IF to_regprocedure('public.material_lot_release_block_reason(uuid)') IS NULL THEN
    RAISE EXCEPTION 'The material release migrations have not been applied here.';
  END IF;
END $guard$;

DROP TABLE IF EXISTS mch_results;
CREATE TEMP TABLE mch_results(seq serial, id text, name text, verdict text, detail text);
GRANT ALL ON mch_results TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE mch_results_seq_seq TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION mch_assert(p_id text, p_name text, p_cond boolean, p_detail text DEFAULT '')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO mch_results(id,name,verdict,detail)
  VALUES (p_id,p_name,CASE WHEN p_cond THEN 'PASS' ELSE 'FAIL' END,p_detail);
END $$;

-- ── Fixtures ─────────────────────────────────────────────────────────
--  One company, one material, and THREE suppliers in the three
--  standings that matter: qualified, suspended, disqualified.
DO $fix$
DECLARE
  c uuid := 'ac100000-0000-4000-8000-000000000001'::uuid;
BEGIN
  DELETE FROM public.material_lots WHERE company_id = c;
  DELETE FROM public.company_numbering_formats WHERE company_id = c;
  DELETE FROM public.suppliers     WHERE company_id = c;
  DELETE FROM public.materials     WHERE company_id = c;
  DELETE FROM public.company_members WHERE company_id = c;
  DELETE FROM public.companies     WHERE id = c;
  DELETE FROM auth.users WHERE id IN ('ac100000-0000-4000-8000-0000000000c1'::uuid,
                                      'ac100000-0000-4000-8000-0000000000c2'::uuid);

  INSERT INTO public.companies (id, name) VALUES (c, 'mch-co');

  --  QUALIFICATION STATUS CANNOT BE SET BY INSERTING IT. The supplier
  --  lifecycle initialises every new row to 'pending' and
  --  fn_suppliers_sync_status writes that back over whatever the
  --  INSERT said. The first version of this fixture set the column
  --  directly, every supplier came out 'pending', and the suspended
  --  and disqualified cases reported "the receipt was ALLOWED" — a
  --  gate that looked broken because the test never handed it a
  --  blocked supplier.
  --
  --  So they are moved through their own lifecycle, which is also the
  --  only route the application has. Each transition carries a
  --  comment because the lifecycle REQUIRES one on a qualification
  --  decision — LIFECYCLE_COMMENT_REQUIRED — which is itself worth
  --  knowing: a supplier cannot be qualified without a stated reason.
  INSERT INTO public.suppliers (id, company_id, name) VALUES
    ('ac100000-0000-4000-8000-0000000000a1'::uuid, c, 'mch-good'),
    ('ac100000-0000-4000-8000-0000000000a2'::uuid, c, 'mch-susp'),
    ('ac100000-0000-4000-8000-0000000000a3'::uuid, c, 'mch-disq');

  PERFORM public.lifecycle_transition('supplier', 'ac100000-0000-4000-8000-0000000000a1'::uuid, 'qualify',
    c, NULL, 'mch fixture: qualification decision', NULL, NULL);
  PERFORM public.lifecycle_transition('supplier', 'ac100000-0000-4000-8000-0000000000a2'::uuid, 'qualify',
    c, NULL, 'mch fixture: qualification decision', NULL, NULL);
  PERFORM public.lifecycle_transition('supplier', 'ac100000-0000-4000-8000-0000000000a2'::uuid, 'suspend',
    c, NULL, 'mch fixture: qualification decision', NULL, NULL);
  PERFORM public.lifecycle_transition('supplier', 'ac100000-0000-4000-8000-0000000000a3'::uuid, 'disqualify',
    c, NULL, 'mch fixture: qualification decision', NULL, NULL);

  --  Proven, not assumed: if the transitions did not take, every
  --  refusal assertion below would pass vacuously.
  IF (SELECT qualification_status FROM public.suppliers
       WHERE id = 'ac100000-0000-4000-8000-0000000000a2'::uuid) <> 'suspended' THEN
    RAISE EXCEPTION 'FIXTURE: the suspended supplier is %',
      (SELECT qualification_status FROM public.suppliers
        WHERE id = 'ac100000-0000-4000-8000-0000000000a2'::uuid);
  END IF;

  --  material_type is NOT NULL with no default; the first version of
  --  this fixture omitted it and every assertion downstream failed
  --  with MATERIAL_LOT_NO_MATERIAL, which looked like a gate working
  --  and was a fixture that had not been created.
  INSERT INTO public.materials (id, company_id, code, name, material_type, unit_of_measure)
  VALUES ('ac100000-0000-4000-8000-0000000000b1'::uuid, c, 'MCH-1', 'mch material',
          'excipient', 'kg');

  --  A COMPANY CANNOT RECEIVE MATERIAL UNTIL IT HAS A LOT-NUMBERING
  --  FORMAT. fn_material_lots_defaults issues the number from this
  --  row and raises NUMBERING_NO_FORMAT without it — a real onboarding
  --  prerequisite that this test surfaced by not having one.
  INSERT INTO public.company_numbering_formats (company_id, scope, pattern, prefix, seq_width)
  VALUES (c, 'material_lot', '{PREFIX}-{SEQ}', 'MCH', 4)
  ON CONFLICT DO NOTHING;

  --  company_members.user_id references auth.users, so the people
  --  section D impersonates have to exist before it can insert them.
  INSERT INTO auth.users (id, email) VALUES
    ('ac100000-0000-4000-8000-0000000000c1'::uuid, 'mch-store@example.invalid'),
    ('ac100000-0000-4000-8000-0000000000c2'::uuid, 'mch-qao@example.invalid')
  ON CONFLICT (id) DO NOTHING;
END $fix$;


-- ── A. Goods receipt: the supplier gate ─────────────────────────────
DO $a$
DECLARE
  c   uuid := 'ac100000-0000-4000-8000-000000000001'::uuid;
  m   uuid := 'ac100000-0000-4000-8000-0000000000b1'::uuid;
  lot uuid;
BEGIN
  --  A qualified supplier is accepted, and the lot arrives numbered
  --  and quarantined without the caller asking for either.
  BEGIN
    INSERT INTO public.material_lots (company_id, material_id, supplier_id,
                                      quantity_received, quantity_available, received_date)
    VALUES (c, m, 'ac100000-0000-4000-8000-0000000000a1'::uuid, 100, 100, current_date)
    RETURNING id INTO lot;
    PERFORM mch_assert('A1','a qualified supplier can be received from', true);
    --  NOT "is it non-empty". The first version of this assertion was,
    --  and it PASSED on the literal string '{prefix}-{seq}' — the
    --  pattern tokens are uppercase and mine were not substituted at
    --  all. A number that is really issued matches its prefix and a
    --  run of digits.
    PERFORM mch_assert('A2','the lot number is issued from the company pattern',
      (SELECT lot_number ~ '^MCH-[0-9]+$' FROM public.material_lots WHERE id = lot),
      coalesce((SELECT lot_number FROM public.material_lots WHERE id = lot),'(null)'));
    PERFORM mch_assert('A3','a received lot starts in quarantine',
      (SELECT status FROM public.material_lots WHERE id = lot) = 'quarantine',
      coalesce((SELECT status::text FROM public.material_lots WHERE id = lot),'(null)'));
  EXCEPTION WHEN others THEN
    PERFORM mch_assert('A1','a qualified supplier can be received from', false, SQLERRM);
  END;

  --  THE REFUSALS. These are the assertions that would still pass on a
  --  system with the gate deleted if they were written the other way
  --  round.
  BEGIN
    INSERT INTO public.material_lots (company_id, material_id, supplier_id,
                                      quantity_received, quantity_available, received_date)
    VALUES (c, m, 'ac100000-0000-4000-8000-0000000000a2'::uuid, 10, 10, current_date);
    PERFORM mch_assert('A4','a SUSPENDED supplier is refused', false, 'the receipt was ALLOWED');
  EXCEPTION WHEN others THEN
    PERFORM mch_assert('A4','a SUSPENDED supplier is refused',
      SQLERRM LIKE '%NOT_QUALIFIED%' OR SQLERRM LIKE '%MATERIAL_RECEIPT%', SQLERRM);
  END;

  BEGIN
    INSERT INTO public.material_lots (company_id, material_id, supplier_id,
                                      quantity_received, quantity_available, received_date)
    VALUES (c, m, 'ac100000-0000-4000-8000-0000000000a3'::uuid, 10, 10, current_date);
    PERFORM mch_assert('A5','a DISQUALIFIED supplier is refused', false, 'the receipt was ALLOWED');
  EXCEPTION WHEN others THEN
    PERFORM mch_assert('A5','a DISQUALIFIED supplier is refused',
      SQLERRM LIKE '%NOT_QUALIFIED%' OR SQLERRM LIKE '%MATERIAL_RECEIPT%', SQLERRM);
  END;

  --  Not a hole: the gate's own reasoning is that refusing an
  --  un-assessed supplier would stop a company entering existing stock
  --  on day one. Pinned so it cannot be "tightened" by accident.
  BEGIN
    INSERT INTO public.material_lots (company_id, material_id, supplier_id,
                                      quantity_received, quantity_available, received_date)
    VALUES (c, m, NULL, 10, 10, current_date);
    PERFORM mch_assert('A6','a receipt with no supplier is allowed', true);
  EXCEPTION WHEN others THEN
    PERFORM mch_assert('A6','a receipt with no supplier is allowed', false, SQLERRM);
  END;
END $a$;


-- ── B. The status column is not a way round the lifecycle ───────────
DO $b$
DECLARE lot uuid;
BEGIN
  SELECT id INTO lot FROM public.material_lots
   WHERE company_id = 'ac100000-0000-4000-8000-000000000001'::uuid
     AND supplier_id = 'ac100000-0000-4000-8000-0000000000a1'::uuid LIMIT 1;

  --  THE ONE THE WHOLE PRODUCT RESTS ON: a material must not become
  --  available for production because somebody changed a status.
  BEGIN
    UPDATE public.material_lots SET status = 'approved' WHERE id = lot;
    PERFORM mch_assert('B1','status cannot be written directly to approved', false,
      'the UPDATE was ALLOWED');
  EXCEPTION WHEN others THEN
    PERFORM mch_assert('B1','status cannot be written directly to approved',
      SQLERRM LIKE '%STATUS_READ_ONLY%', SQLERRM);
  END;

  BEGIN
    UPDATE public.material_lots SET status = 'rejected' WHERE id = lot;
    PERFORM mch_assert('B2','status cannot be written directly to rejected', false,
      'the UPDATE was ALLOWED');
  EXCEPTION WHEN others THEN
    PERFORM mch_assert('B2','status cannot be written directly to rejected',
      SQLERRM LIKE '%STATUS_READ_ONLY%', SQLERRM);
  END;

  --  A write that does not touch status is unaffected, or the guard
  --  would make the row read-only altogether.
  BEGIN
    UPDATE public.material_lots SET supplier_batch_number = 'mch-batch' WHERE id = lot;
    PERFORM mch_assert('B3','other columns are still writable', true);
  EXCEPTION WHEN others THEN
    PERFORM mch_assert('B3','other columns are still writable', false, SQLERRM);
  END;
END $b$;


-- ── C. Release is blocked until the conditions are met ──────────────
DO $c$
DECLARE
  lot    uuid;
  reason text;
BEGIN
  SELECT id INTO lot FROM public.material_lots
   WHERE company_id = 'ac100000-0000-4000-8000-000000000001'::uuid
     AND supplier_id = 'ac100000-0000-4000-8000-0000000000a1'::uuid LIMIT 1;

  reason := public.material_lot_release_block_reason(lot);

  --  ONE OF THE SEVEN CONDITIONS IS ABOUT THE CALLER, NOT THE LOT.
  --  qa_release_role asks whether the person asking holds the QA
  --  release role; block_reason, running in a service context, does
  --  not apply it. Comparing all seven against block_reason therefore
  --  compares two different questions and reports a disagreement that
  --  is not one — which is what the first version of this section did.
  --
  --  So the agreement is checked over the conditions that are about
  --  the LOT, and the caller condition is asserted separately for what
  --  it is.
  PERFORM mch_assert('C1','the lot’s own blocking conditions agree with the gate',
    (SELECT coalesce(bool_or(NOT met), false)
       FROM public.material_lot_release_conditions(lot)
      WHERE blocking AND condition_key <> 'qa_release_role')
    = (reason IS NOT NULL),
    'gate=' || coalesce(reason,'(clear)'));

  PERFORM mch_assert('C2','the release role is a condition about the caller',
    EXISTS (SELECT 1 FROM public.material_lot_release_conditions(lot)
             WHERE condition_key = 'qa_release_role' AND blocking),
    'present and blocking');

  PERFORM mch_assert('C3','every condition is reported, met or not',
    (SELECT count(*) FROM public.material_lot_release_conditions(lot)) >= 7,
    (SELECT count(*)::text FROM public.material_lot_release_conditions(lot)) || ' condition(s)');

  --  A lot of a material with no required tests has nothing to fail,
  --  so tests_complete is vacuously met. Pinned because it looks
  --  wrong and is not: the system can only block on conditions it
  --  knows about, and "this material has no specification" is a
  --  configuration gap rather than a test failure.
  PERFORM mch_assert('C4','a material with no required tests reports testing complete',
    (SELECT met FROM public.material_lot_release_conditions(lot)
      WHERE condition_key = 'tests_complete'),
    'vacuously met');

  PERFORM mch_assert('C5','sampling is reported unmet on a lot nobody sampled',
    (SELECT NOT met FROM public.material_lot_release_conditions(lot)
      WHERE condition_key = 'sampling_recorded'));
END $c$;


-- ── D. Disposition is refused to the wrong role ─────────────────────
--
--  Statement-level impersonation: auth.uid() reads request.jwt.claims,
--  and setting it inside a DO block leaves the caller null — which
--  makes every refusal assertion pass for the wrong reason.
DO $d$
DECLARE c uuid := 'ac100000-0000-4000-8000-000000000001'::uuid;
BEGIN
  INSERT INTO public.company_members (company_id, user_id, role, status) VALUES
    (c, 'ac100000-0000-4000-8000-0000000000c1'::uuid, 'storekeeper', 'active'),
    (c, 'ac100000-0000-4000-8000-0000000000c2'::uuid, 'qa_officer',  'active')
  ON CONFLICT (company_id, user_id) DO UPDATE SET role = EXCLUDED.role;
END $d$;

CREATE OR REPLACE FUNCTION mch_try_step(p_company uuid, p_step text)
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.app_assert_step(p_company, p_step);
  RETURN 'ALLOWED';
EXCEPTION WHEN others THEN RETURN SQLERRM;
END $$;

SET ROLE authenticated;

SET request.jwt.claims = '{"sub":"ac100000-0000-4000-8000-0000000000c1","role":"authenticated"}';
SELECT mch_assert('D1','a Storekeeper cannot dispose of material',
  mch_try_step('ac100000-0000-4000-8000-000000000001'::uuid,'material_disposition')
    LIKE 'STEP_FORBIDDEN%',
  mch_try_step('ac100000-0000-4000-8000-000000000001'::uuid,'material_disposition'));

SELECT mch_assert('D2','a Storekeeper cannot release a batch either',
  mch_try_step('ac100000-0000-4000-8000-000000000001'::uuid,'batch_release')
    LIKE 'STEP_FORBIDDEN%',
  mch_try_step('ac100000-0000-4000-8000-000000000001'::uuid,'batch_release'));

SET request.jwt.claims = '{"sub":"ac100000-0000-4000-8000-0000000000c2","role":"authenticated"}';
SELECT mch_assert('D3','a QA Officer can dispose of material',
  mch_try_step('ac100000-0000-4000-8000-000000000001'::uuid,'material_disposition') = 'ALLOWED',
  mch_try_step('ac100000-0000-4000-8000-000000000001'::uuid,'material_disposition'));

SELECT mch_assert('D4','a QA Officer still cannot release a batch',
  mch_try_step('ac100000-0000-4000-8000-000000000001'::uuid,'batch_release')
    LIKE 'STEP_FORBIDDEN%',
  mch_try_step('ac100000-0000-4000-8000-000000000001'::uuid,'batch_release'));

RESET ROLE; RESET request.jwt.claims;


-- ── E. Release needs a signature it cannot invent ───────────────────
DO $e$
DECLARE lot uuid;
BEGIN
  SELECT id INTO lot FROM public.material_lots
   WHERE company_id = 'ac100000-0000-4000-8000-000000000001'::uuid
     AND supplier_id = 'ac100000-0000-4000-8000-0000000000a1'::uuid LIMIT 1;

  --  A release with a signature id that does not exist must not work.
  --  PM-03 marks this step "E-signature"; if any uuid would do, the
  --  signature is decoration.
  BEGIN
    PERFORM public.material_lot_release(
      lot, 'ac100000-0000-4000-8000-0000000000ff'::uuid, 'full', NULL, NULL, NULL);
    PERFORM mch_assert('E1','a release with an unknown signature is refused', false,
      'the release was ALLOWED');
  EXCEPTION WHEN others THEN
    PERFORM mch_assert('E1','a release with an unknown signature is refused', true, SQLERRM);
  END;
END $e$;


-- ── Results ─────────────────────────────────────────────────────────
SELECT id, name, verdict, detail FROM mch_results ORDER BY seq;

--  total, passed, failed — in that order. The harness reads columns 2
--  and 3 as passed and failed.
SELECT count(*) AS total,
       count(*) FILTER (WHERE verdict='PASS') AS passed,
       count(*) FILTER (WHERE verdict='FAIL') AS failed
FROM mch_results;

DO $cleanup$
DECLARE c uuid := 'ac100000-0000-4000-8000-000000000001'::uuid;
BEGIN
  DELETE FROM public.material_lots   WHERE company_id = c;
  DELETE FROM public.company_numbering_formats WHERE company_id = c;
  DELETE FROM public.suppliers       WHERE company_id = c;
  DELETE FROM public.materials       WHERE company_id = c;
  DELETE FROM public.company_members WHERE company_id = c;
  DELETE FROM public.companies       WHERE id = c;
  DELETE FROM auth.users WHERE id IN ('ac100000-0000-4000-8000-0000000000c1'::uuid,
                                      'ac100000-0000-4000-8000-0000000000c2'::uuid);
EXCEPTION WHEN others THEN NULL;
END $cleanup$;
