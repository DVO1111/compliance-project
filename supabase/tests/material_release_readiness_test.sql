-- =====================================================================
--  MATERIAL RELEASE READINESS — INTEGRATION TESTS  (W4·15)
--  LOCAL / DISPOSABLE DATABASE ONLY
-- =====================================================================
--  Covers 20261027000000_material_release_readiness.sql.
--
--  The design's NOT DONE IF is the specification:
--
--    "Blocking conditions only after clicking: no. They lead the
--     release screen and the lot detail."
--
--  So the assertions that matter are the ones about COMPLETENESS and
--  AGREEMENT:
--
--    B — every condition is reported whether met or not, so a screen
--        can list them all before anything is attempted. A function
--        that returned only the failures would reproduce the bug.
--    D — the conditions and the gate agree, in both directions. They
--        are now one source of truth; this is what proves it, and what
--        would catch somebody reinstating a standalone gate.
--
--  Run:  psql "<local url>" -f supabase/tests/material_release_readiness_test.sql
--
--  Safe to run repeatedly. Fixtures are tagged rr- and removed at the
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
  IF to_regprocedure('public.material_lot_release_conditions(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Migration 20261027000000 has not been applied to this database.';
  END IF;
END $guard$;

DROP TABLE IF EXISTS rr_results;
CREATE TEMP TABLE rr_results(seq serial, id text, name text, verdict text, detail text);
GRANT ALL ON rr_results TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE rr_results_seq_seq TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION rr_assert(p_id text, p_name text, p_cond boolean, p_detail text DEFAULT '')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO rr_results(id,name,verdict,detail)
  VALUES (p_id,p_name,CASE WHEN p_cond THEN 'PASS' ELSE 'FAIL' END,p_detail);
END $$;

-- ── Fixtures ─────────────────────────────────────────────────────────
--  One company, one critical material with two required tests, one
--  qualified supplier, and three lots in deliberately different states:
--  nothing done, half done, and ready.
DO $fix$
DECLARE
  c   uuid := '00000000-0000-11ee-a000-00000000000a';
  u   uuid := '00000000-0000-11ee-b000-000000000001';
  mat uuid := '00000000-0000-11ee-c000-000000000001';
  sup uuid := '00000000-0000-11ee-d000-000000000001';
  spc uuid := '00000000-0000-11ee-e000-000000000001';
  p1  uuid := '00000000-0000-11ee-e000-000000000011';
  p2  uuid := '00000000-0000-11ee-e000-000000000012';
  d1  uuid := '00000000-0000-11ee-f000-000000000011';
  d2  uuid := '00000000-0000-11ee-f000-000000000012';
  l1  uuid := '00000000-0000-11ee-a100-000000000001';
  l2  uuid := '00000000-0000-11ee-a100-000000000002';
BEGIN
  DELETE FROM public.material_lots       WHERE company_id = c;
  DELETE FROM public.material_specifications WHERE company_id = c;
  DELETE FROM public.suppliers           WHERE company_id = c;
  DELETE FROM public.materials           WHERE company_id = c;
  DELETE FROM public.companies           WHERE id = c;
  DELETE FROM auth.users                 WHERE id = u;

  INSERT INTO auth.users (id, email) VALUES (u,'rr-qa@example.invalid');
  INSERT INTO public.companies (id, name) VALUES (c,'RR Pharma');
  INSERT INTO public.profiles (id, email, company_id, role)
    VALUES (u,'rr-qa@example.invalid', c, 'admin');
  INSERT INTO public.company_members (company_id, user_id, role, status)
    VALUES (c, u, 'owner', 'active');

  INSERT INTO public.suppliers (id, company_id, name, qualification_status, qualified_until)
    VALUES (sup, c, 'Kemchem Pharma', 'qualified', current_date + 400);

  --  qualification_status is derived from the lifecycle engine, and a
  --  freshly inserted supplier is put into the initial state by
  --  fn_suppliers_initialize_lifecycle regardless of what was written.
  --  The fixture needs a qualified supplier without dragging the whole
  --  supplier lifecycle in, so it sets the same flag the sync trigger
  --  sets. This is a fixture shortcut, not a supported write path --
  --  materials_security_test asserts the guard still bites for
  --  everybody else.
  PERFORM set_config('app.lifecycle_supplier_sync','1',true);
  UPDATE public.suppliers SET qualification_status = 'qualified' WHERE id = sup;
  PERFORM set_config('app.lifecycle_supplier_sync','',true);

  INSERT INTO public.materials (id, company_id, code, name, material_type, criticality)
    VALUES (mat, c, 'RM-PARA', 'Paracetamol BP', 'active_ingredient', 'critical');

  INSERT INTO public.material_specifications (id, company_id, material_id, version, status)
    VALUES (spc, c, mat, 1, 'effective');

  INSERT INTO public.material_specification_parameters
    (id, specification_id, parameter, limit_type, min_value, max_value)
  VALUES
    (p1, spc, 'assay',          'range', 98, 102),
    (p2, spc, '4-aminophenol',  'max',   NULL, 50);

  INSERT INTO public.material_test_definitions
    (id, company_id, specification_parameter_id, name, is_required, is_active, sort_order)
  VALUES (d1, c, p1, 'Assay by HPLC', true, true, 1),
         (d2, c, p2, '4-aminophenol by HPLC', true, true, 2);

  --  l1: nothing done at all. l2: everything done.
  INSERT INTO public.material_lots
    (id, company_id, material_id, lot_number, supplier_id, quantity_received,
     quantity_available, unit_of_measure, received_date, supplier_expiry_date, retest_due_date)
  VALUES
    (l1, c, mat, 'RR-26-0001', sup, 500, 500, 'kg', current_date, current_date + 900, current_date + 700),
    (l2, c, mat, 'RR-26-0002', sup, 500, 500, 'kg', current_date, current_date + 900, current_date + 700);
END $fix$;

-- =====================================================================
--  A. Shape
-- =====================================================================
DO $$
DECLARE l1 uuid := '00000000-0000-11ee-a100-000000000001'; v_n integer;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','00000000-0000-11ee-b000-000000000001')::text, false);
  SET ROLE authenticated;

  SELECT count(*) INTO v_n FROM public.material_lot_release_conditions(l1);
  --  MT-06 draws seven. Fewer means the screen cannot lead with all of
  --  them, which is the one thing the design rules out.
  PERFORM rr_assert('A1','reports all seven conditions', v_n = 7, format('%s reported', v_n));

  PERFORM rr_assert('A2','gives every condition a title and a detail',
    (SELECT count(*) FROM public.material_lot_release_conditions(l1)
      WHERE coalesce(btrim(title),'') = '' OR coalesce(btrim(detail),'') = '') = 0);

  --  "WAITING ON ..." tells somebody whose move it is. A failing
  --  condition without it is a dead end on screen.
  PERFORM rr_assert('A3','every unmet condition says who it is waiting on',
    (SELECT count(*) FROM public.material_lot_release_conditions(l1)
      WHERE NOT met AND coalesce(btrim(waiting_on),'') = '') = 0);

  PERFORM rr_assert('A4','and no met condition is still waiting on anybody',
    (SELECT count(*) FROM public.material_lot_release_conditions(l1)
      WHERE met AND waiting_on IS NOT NULL) = 0);

  PERFORM rr_assert('A5','orders them so the screen can render straight down',
    (SELECT count(DISTINCT sort_order) FROM public.material_lot_release_conditions(l1)) = 7);

  RESET ROLE; PERFORM set_config('request.jwt.claims','',false);
END $$;

-- =====================================================================
--  B. Completeness — met conditions are reported too
-- =====================================================================
DO $$
DECLARE l1 uuid := '00000000-0000-11ee-a100-000000000001';
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','00000000-0000-11ee-b000-000000000001')::text, false);
  SET ROLE authenticated;

  --  THE ONE THAT MATTERS. A function that returned only failures
  --  would satisfy every other assertion here and still reproduce the
  --  bug the design rules out: clear one blocker, discover the next.
  PERFORM rr_assert('B1','a brand-new lot reports met conditions as well as blocking ones',
    EXISTS (SELECT 1 FROM public.material_lot_release_conditions(l1) WHERE met)
    AND EXISTS (SELECT 1 FROM public.material_lot_release_conditions(l1) WHERE NOT met));

  PERFORM rr_assert('B2','the supplier is reported approved, with its qualification date',
    (SELECT met FROM public.material_lot_release_conditions(l1)
      WHERE condition_key = 'supplier_approved')
    AND (SELECT detail FROM public.material_lot_release_conditions(l1)
          WHERE condition_key = 'supplier_approved') LIKE '%Kemchem%');

  PERFORM rr_assert('B3','a lot with no tests recorded blocks on both test conditions',
    (SELECT count(*) FROM public.material_lot_release_conditions(l1)
      WHERE condition_key = 'tests_complete' AND NOT met AND blocking) = 1);

  PERFORM rr_assert('B4','a critical material with no certificate blocks on the certificate',
    (SELECT count(*) FROM public.material_lot_release_conditions(l1)
      WHERE condition_key = 'certificate_verified' AND NOT met AND blocking) = 1);

  --  Sampling, dating and supplier approval are READINESS, not gate.
  --  Marking them blocking would silently widen what release means.
  PERFORM rr_assert('B5','sampling, dating and supplier approval are not gate conditions',
    (SELECT count(*) FROM public.material_lot_release_conditions(l1)
      WHERE condition_key IN ('sampling_recorded','within_dating','supplier_approved')
        AND blocking) = 0);

  RESET ROLE; PERFORM set_config('request.jwt.claims','',false);
END $$;

-- =====================================================================
--  C. The sampling record
-- =====================================================================
DO $$
DECLARE
  l1 uuid := '00000000-0000-11ee-a100-000000000001';
  v_ok boolean;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','00000000-0000-11ee-b000-000000000001')::text, false);
  SET ROLE authenticated;

  PERFORM rr_assert('C1','no sampling record reads as unmet',
    NOT (SELECT met FROM public.material_lot_release_conditions(l1)
          WHERE condition_key = 'sampling_recorded'));

  PERFORM public.material_lot_record_sampling(l1, 6, 20, 'sqrt(n)+1');

  PERFORM rr_assert('C2','recording sampling flips it, and shows the counts',
    (SELECT met FROM public.material_lot_release_conditions(l1)
      WHERE condition_key = 'sampling_recorded')
    AND (SELECT detail FROM public.material_lot_release_conditions(l1)
          WHERE condition_key = 'sampling_recorded') LIKE '%6 of 20 containers%');

  --  Drawing from more containers than the lot has is a typo, and a
  --  sampling record is read closely by an inspector.
  v_ok := true;
  BEGIN
    PERFORM public.material_lot_record_sampling(l1, 30, 20, 'nonsense');
    v_ok := false;
  EXCEPTION WHEN others THEN NULL;
  END;
  PERFORM rr_assert('C3','sampling more containers than the lot holds is refused', v_ok);

  --  Written once. A sampling record revised after the result is in is
  --  not a record of what was sampled.
  BEGIN
    UPDATE public.material_lot_sampling SET containers_sampled = 1
     WHERE material_lot_id = l1;
  EXCEPTION WHEN others THEN NULL;
  END;
  PERFORM rr_assert('C4','a sampling record cannot be edited afterwards',
    (SELECT containers_sampled FROM public.material_lot_sampling
      WHERE material_lot_id = l1 ORDER BY created_at LIMIT 1) = 6);

  RESET ROLE; PERFORM set_config('request.jwt.claims','',false);
END $$;

-- =====================================================================
--  D. The conditions and the gate are one answer
-- =====================================================================
DO $$
DECLARE
  l1 uuid := '00000000-0000-11ee-a100-000000000001';
  l2 uuid := '00000000-0000-11ee-a100-000000000002';
  d1 uuid := '00000000-0000-11ee-f000-000000000011';
  d2 uuid := '00000000-0000-11ee-f000-000000000012';
  c  uuid := '00000000-0000-11ee-a000-00000000000a';
  v_blocked boolean;
  v_reason  text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','00000000-0000-11ee-b000-000000000001')::text, false);
  SET ROLE authenticated;

  --  Blocked: the conditions say so and the gate says so.
  v_blocked := EXISTS (SELECT 1 FROM public.material_lot_release_conditions(l1)
                        WHERE blocking AND NOT met AND condition_key <> 'qa_release_role');
  v_reason  := public.material_lot_release_block_reason(l1);
  PERFORM rr_assert('D1','both agree the lot is blocked',
    v_blocked AND v_reason IS NOT NULL, coalesce(v_reason,'NULL'));

  --  And the gate's sentence is about the FIRST blocking condition,
  --  which is what a refused release should say rather than a list.
  PERFORM rr_assert('D2','the gate names the certificate first',
    v_reason LIKE '%certificate of analysis%', coalesce(v_reason,'NULL'));

  RESET ROLE; PERFORM set_config('request.jwt.claims','',false);
END $$;

--  A plain statement, not inside a block. A DO block that raises never
--  reaches its own RESET ROLE, so the next block would run as
--  `authenticated` and fail for a reason that has nothing to do with
--  what it is testing.
RESET ROLE;
SELECT set_config('request.jwt.claims','', false);

--  Satisfying everything on l2 happens outside the role switching
--  above: RESET ROLE inside a DO block does not take effect until the
--  block ends, so an INSERT written after it still runs as
--  `authenticated` and is refused by RLS.
DO $$
DECLARE
  c  uuid := '00000000-0000-11ee-a000-00000000000a';
  l2 uuid := '00000000-0000-11ee-a100-000000000002';
  d1 uuid := '00000000-0000-11ee-f000-000000000011';
  d2 uuid := '00000000-0000-11ee-f000-000000000012';
BEGIN
  INSERT INTO public.material_certificates_of_analysis
    (company_id, material_lot_id, certificate_number, verification_status, verified_at)
  VALUES (c, l2, 'COA-RR-1', 'verified', now());

  INSERT INTO public.material_test_results
    (company_id, material_lot_id, test_definition_id, parameter, limit_type,
     specification_limit, result, actual_value, analyst_name, test_date)
  VALUES (c, l2, d1, 'assay', 'range', '98 - 102 %', 'pass', 100, 'S. Bakare', current_date),
         (c, l2, d2, '4-aminophenol', 'max', 'max 50 ppm', 'pass', 38, 'S. Bakare', current_date);
END $$;

DO $$
DECLARE
  l2 uuid := '00000000-0000-11ee-a100-000000000002';
  d1 uuid := '00000000-0000-11ee-f000-000000000011';
  v_blocked boolean;
  v_reason  text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','00000000-0000-11ee-b000-000000000001')::text, false);
  SET ROLE authenticated;

  v_blocked := EXISTS (SELECT 1 FROM public.material_lot_release_conditions(l2)
                        WHERE blocking AND NOT met AND condition_key <> 'qa_release_role');
  v_reason  := public.material_lot_release_block_reason(l2);

  --  THE OTHER DIRECTION. A gate that said NULL while the conditions
  --  still showed a blocker — or the reverse — would mean the screen
  --  and the trigger were two answers to one question again.
  PERFORM rr_assert('D3','both agree the lot is releasable',
    NOT v_blocked AND v_reason IS NULL, coalesce(v_reason,'NULL'));

  PERFORM rr_assert('D4','and every gate condition now reads met',
    (SELECT count(*) FROM public.material_lot_release_conditions(l2)
      WHERE blocking AND NOT met AND condition_key <> 'qa_release_role') = 0);

  --  Supersede the passing assay with a failing one, through the
  --  recording function rather than an UPDATE: results are written
  --  that way and only that way, and a test that wrote to the table
  --  directly would be testing a path nobody uses. 90 is outside the
  --  98-102 range the fixture's specification sets.
  PERFORM public.material_test_record_result(l2, d1, 90::numeric);

  PERFORM rr_assert('D5','a failing test blocks in both at once',
    EXISTS (SELECT 1 FROM public.material_lot_release_conditions(l2)
             WHERE condition_key = 'tests_passed' AND NOT met)
    AND public.material_lot_release_block_reason(l2) LIKE '%not passed%');

  RESET ROLE; PERFORM set_config('request.jwt.claims','',false);
END $$;

-- =====================================================================
--  E. Tenancy
-- =====================================================================
DO $$
DECLARE
  l1 uuid := '00000000-0000-11ee-a100-000000000001';
  v_ok boolean := true;
BEGIN
  --  A signed-in user of no company at all must not be able to read a
  --  lot's release conditions: the detail lines name the supplier, the
  --  tests and the dates.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','00000000-0000-0000-0000-0000000000ff')::text, false);
  SET ROLE authenticated;

  BEGIN
    PERFORM count(*) FROM public.material_lot_release_conditions(l1);
    v_ok := false;
  EXCEPTION WHEN others THEN NULL;
  END;
  PERFORM rr_assert('E1','a non-member cannot read release conditions', v_ok);

  RESET ROLE; PERFORM set_config('request.jwt.claims','',false);
END $$;

-- ── Report ───────────────────────────────────────────────────────────
RESET ROLE;
SELECT set_config('request.jwt.claims','', false);

SELECT seq, id, name, verdict, detail FROM rr_results ORDER BY seq;

--  Two shapes, because the CI harness reads either: the grouped
--  verdict table when there are failures, and the three-column line
--  when there are none. The three columns are total, passed, failed in
--  that order -- the harness takes columns 2 and 3 as passed and
--  failed, so any other order reports a clean suite as a broken one.
SELECT verdict, count(*) FROM rr_results GROUP BY verdict ORDER BY verdict;

SELECT count(*) AS total,
       count(*) FILTER (WHERE verdict='PASS') AS passed,
       count(*) FILTER (WHERE verdict='FAIL') AS failed
FROM rr_results;

-- ── Clean up ─────────────────────────────────────────────────────────
DO $cleanup$
DECLARE c uuid := '00000000-0000-11ee-a000-00000000000a';
BEGIN
  DELETE FROM public.material_lot_sampling WHERE company_id = c;
  DELETE FROM public.material_lots         WHERE company_id = c;
  DELETE FROM public.material_specifications WHERE company_id = c;
  DELETE FROM public.suppliers             WHERE company_id = c;
  DELETE FROM public.materials             WHERE company_id = c;
  DELETE FROM public.companies             WHERE id = c;
  DELETE FROM auth.users WHERE id = '00000000-0000-11ee-b000-000000000001';
END $cleanup$;
