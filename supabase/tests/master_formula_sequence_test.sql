-- =====================================================================
--  MASTER FORMULA: REORDERING AND COMPARISON — TESTS  (W4·16)
--  LOCAL / DISPOSABLE DATABASE ONLY
-- =====================================================================
--  Covers 20261028000000_master_formula_sequence_and_compare.sql.
--
--  Two of the design's "not done if" clauses are what these assert:
--
--    "Sequence reorderable per product without looking technical" —
--     and the constraint that makes a naive implementation fail is
--     UNIQUE (formula_id, sequence_no), which a two-UPDATE swap
--     violates halfway through in either order. A1-A3 are the tests
--     that would catch somebody rewriting the move that way.
--
--    "Versions can't be compared: no. MF-05 compares any two." —
--     C1-C7. The one that matters most is C4: a renamed stage must
--     read as a change, not as a removal plus an addition, because a
--     reviewer approving a version acts on that distinction.
--
--  Run:  psql "<local url>" -f supabase/tests/master_formula_sequence_test.sql
--
--  Safe to run repeatedly. Fixtures are tagged mfs- and removed at the
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
  IF to_regprocedure('public.master_formula_stage_move(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'Migration 20261028000000 has not been applied to this database.';
  END IF;
END $guard$;

DROP TABLE IF EXISTS mfs_results;
CREATE TEMP TABLE mfs_results(seq serial, id text, name text, verdict text, detail text);
GRANT ALL ON mfs_results TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE mfs_results_seq_seq TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION mfs_assert(p_id text, p_name text, p_cond boolean, p_detail text DEFAULT '')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO mfs_results(id,name,verdict,detail)
  VALUES (p_id,p_name,CASE WHEN p_cond THEN 'PASS' ELSE 'FAIL' END,p_detail);
END $$;

CREATE OR REPLACE FUNCTION mfs_seq(p_formula uuid) RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT string_agg(stage_code, ',' ORDER BY sequence_no)
    FROM public.master_formula_stages WHERE formula_id = p_formula;
$$;

-- ── Fixtures ─────────────────────────────────────────────────────────
DO $fix$
DECLARE
  c    uuid := '00000000-0000-4f16-a000-00000000000a';
  u    uuid := '00000000-0000-4f16-b000-000000000001';
  prod uuid := '00000000-0000-4f16-c000-000000000001';
  mat  uuid := '00000000-0000-4f16-d000-000000000001';
  mat2 uuid := '00000000-0000-4f16-d000-000000000002';
  f3   uuid := '00000000-0000-4f16-e000-000000000003';
  f4   uuid := '00000000-0000-4f16-e000-000000000004';
  --  Section B deletes a stage, so it gets a formula of its own. The
  --  first version of this suite reused f3 and section C then read a
  --  deleted stage as "added" — the fixture, not the function, was
  --  wrong, which is the failure mode a shared mutable fixture has.
  f2   uuid := '00000000-0000-4f16-e000-000000000002';
  s    uuid;
BEGIN
  DELETE FROM public.master_formulas WHERE company_id = c;
  DELETE FROM public.products        WHERE company_id = c;
  DELETE FROM public.materials       WHERE company_id = c;
  DELETE FROM public.companies       WHERE id = c;
  DELETE FROM auth.users             WHERE id = u;

  INSERT INTO auth.users (id, email) VALUES (u,'mfs-qa@example.invalid');
  INSERT INTO public.companies (id, name) VALUES (c,'MFS Pharma');
  INSERT INTO public.profiles (id, email, company_id, role)
    VALUES (u,'mfs-qa@example.invalid', c, 'admin');
  INSERT INTO public.company_members (company_id, user_id, role, status)
    VALUES (c, u, 'owner', 'active');

  INSERT INTO public.materials (id, company_id, code, name, material_type, criticality)
  VALUES (mat,  c, 'RM-014', 'Paracetamol BP',  'active_ingredient', 'critical'),
         (mat2, c, 'RM-021', 'Maize starch BP', 'excipient',         'standard');

  INSERT INTO public.products (id, company_id, product_code, trade_name, category, status)
  VALUES (prod, c, 'PCM500', 'Paracetamol 500 mg tablets', 'drug_pharmaceutical', 'registered');

  --  v3 and v4 of one product's formula. Four stages each, so a move
  --  has somewhere to go in both directions.
  INSERT INTO public.master_formulas
    (id, company_id, product_id, version, status, batch_size, batch_size_unit,
     expected_yield_pct, yield_min_pct, yield_max_pct)
  VALUES (f2, c, prod, '2', 'draft', 300000, 'tablets', 98, 95, 101),
         (f3, c, prod, '3', 'draft', 300000, 'tablets', 98, 95, 101),
         (f4, c, prod, '4', 'draft', 300000, 'tablets', 98, 96, 101);

  INSERT INTO public.master_formula_stages
    (formula_id, sequence_no, stage_code, name, equipment, duration_minutes)
  VALUES (f2, 1, 'DISP', 'Dispensing',       'Weigh booth 1', 60),
         (f2, 2, 'DRY',  'Dry mixing',       'Blender A',     30),
         (f2, 3, 'GRAN', 'Wet granulation',  'Granulator 1',  45),
         (f2, 4, 'COMP', 'Compression',      'Press 2',       120),
         (f3, 1, 'DISP', 'Dispensing',       'Weigh booth 1', 60),
         (f3, 2, 'DRY',  'Dry mixing',       'Blender A',     30),
         (f3, 3, 'GRAN', 'Wet granulation',  'Granulator 1',  45),
         (f3, 4, 'COMP', 'Compression',      'Press 2',       120),
         (f4, 1, 'DISP', 'Dispensing',       'Weigh booth 1', 60),
         (f4, 2, 'DRY',  'Dry blending',     'Blender A',     30),
         (f4, 3, 'GRAN', 'Wet granulation',  'Granulator 2',  45),
         (f4, 4, 'COMP', 'Compression',      'Press 2',       120);

  SELECT id INTO s FROM public.master_formula_stages
   WHERE formula_id = f3 AND stage_code = 'COMP';
  INSERT INTO public.master_formula_stage_parameters
    (stage_id, parameter, parameter_type, unit, target_value, min_value, max_value,
     is_critical, sampling_interval_minutes, sort_order)
  VALUES (s, 'Pre-compression force', 'machine_setting', 'kN', 3.0, 2.0, 4.0, true, NULL, 10),
         (s, 'Tablet mass',           'product_attribute','mg', 550, 530, 570, false, 30, 20);

  SELECT id INTO s FROM public.master_formula_stages
   WHERE formula_id = f4 AND stage_code = 'COMP';
  INSERT INTO public.master_formula_stage_parameters
    (stage_id, parameter, parameter_type, unit, target_value, min_value, max_value,
     is_critical, sampling_interval_minutes, sort_order)
  --  Changed limits, a tightened sampling interval, and one added.
  VALUES (s, 'Pre-compression force', 'machine_setting', 'kN', 3.0, 2.5, 3.5, true, NULL, 10),
         (s, 'Tablet mass',           'product_attribute','mg', 550, 530, 570, false, 15, 20),
         (s, 'Hardness',              'product_attribute','N',  80,  60,  100, false, 60, 30);

  INSERT INTO public.master_formula_materials
    (formula_id, material_id, role, quantity_per_batch, unit, tolerance_pct, sort_order)
  VALUES (f3, mat,  'active',    150, 'kg', 0.5, 10),
         (f3, mat2, 'diluent',  18, 'kg', 1.0, 20),
         (f4, mat,  'active',    150, 'kg', 0.5, 10),
         --  Quantity changed, tolerance unchanged.
         (f4, mat2, 'diluent',  20, 'kg', 1.0, 20);
END $fix$;

-- =====================================================================
--  A. Moving a stage
-- =====================================================================
DO $$
DECLARE
  f3 uuid := '00000000-0000-4f16-e000-000000000003';
  u  uuid := '00000000-0000-4f16-b000-000000000001';
  s  uuid;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u::text)::text, false);
  SET ROLE authenticated;

  PERFORM mfs_assert('A0','the fixture starts in order',
    mfs_seq(f3) = 'DISP,DRY,GRAN,COMP', mfs_seq(f3));

  SELECT id INTO s FROM public.master_formula_stages
   WHERE formula_id = f3 AND stage_code = 'GRAN';

  --  THE ONE THAT MATTERS. UNIQUE (formula_id, sequence_no) is not
  --  deferrable, so a two-UPDATE swap raises here. If this ever fails
  --  with a unique violation, somebody has rewritten the move.
  PERFORM public.master_formula_stage_move(s, 'up');
  PERFORM mfs_assert('A1','moving a stage up swaps it with its neighbour',
    mfs_seq(f3) = 'DISP,GRAN,DRY,COMP', mfs_seq(f3));

  PERFORM public.master_formula_stage_move(s, 'down');
  PERFORM mfs_assert('A2','and moving it back restores the order',
    mfs_seq(f3) = 'DISP,DRY,GRAN,COMP', mfs_seq(f3));

  --  The numbering stays 1..n, which is what master_formula_approve
  --  requires. A swap that left a gap would produce a formula that
  --  could never be approved, with no clue why.
  PERFORM mfs_assert('A3','the sequence stays 1..n with no gaps',
    NOT EXISTS (
      SELECT 1 FROM (
        SELECT sequence_no, row_number() OVER (ORDER BY sequence_no) rn
          FROM public.master_formula_stages WHERE formula_id = f3) q
       WHERE q.sequence_no <> q.rn));

  --  Move up on the first stage is a button somebody pressed. It is
  --  not an error, and refusing loudly would be noise.
  SELECT id INTO s FROM public.master_formula_stages
   WHERE formula_id = f3 AND stage_code = 'DISP';
  PERFORM public.master_formula_stage_move(s, 'up');
  PERFORM mfs_assert('A4','moving the first stage up changes nothing, quietly',
    mfs_seq(f3) = 'DISP,DRY,GRAN,COMP', mfs_seq(f3));

  SELECT id INTO s FROM public.master_formula_stages
   WHERE formula_id = f3 AND stage_code = 'COMP';
  PERFORM public.master_formula_stage_move(s, 'down');
  PERFORM mfs_assert('A5','and the last stage down likewise',
    mfs_seq(f3) = 'DISP,DRY,GRAN,COMP', mfs_seq(f3));

  RESET ROLE; PERFORM set_config('request.jwt.claims','',false);
END $$;

RESET ROLE;
SELECT set_config('request.jwt.claims','', false);

DO $$
DECLARE
  f3 uuid := '00000000-0000-4f16-e000-000000000003';
  u  uuid := '00000000-0000-4f16-b000-000000000001';
  s  uuid;
  v_ok boolean := true;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u::text)::text, false);
  SET ROLE authenticated;

  SELECT id INTO s FROM public.master_formula_stages
   WHERE formula_id = f3 AND stage_code = 'GRAN';

  BEGIN
    PERFORM public.master_formula_stage_move(s, 'sideways');
    v_ok := false;
  EXCEPTION WHEN others THEN NULL;
  END;
  PERFORM mfs_assert('A6','a direction that is not up or down is refused', v_ok);

  RESET ROLE; PERFORM set_config('request.jwt.claims','',false);
END $$;

-- =====================================================================
--  B. Repairing the sequence after a delete
-- =====================================================================
RESET ROLE;
SELECT set_config('request.jwt.claims','', false);

DO $$
DECLARE
  f2 uuid := '00000000-0000-4f16-e000-000000000002';
  u  uuid := '00000000-0000-4f16-b000-000000000001';
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u::text)::text, false);
  SET ROLE authenticated;

  DELETE FROM public.master_formula_stages
   WHERE formula_id = f2 AND stage_code = 'DRY';

  PERFORM mfs_assert('B1','deleting a stage leaves a gap',
    EXISTS (
      SELECT 1 FROM (
        SELECT sequence_no, row_number() OVER (ORDER BY sequence_no) rn
          FROM public.master_formula_stages WHERE formula_id = f2) q
       WHERE q.sequence_no <> q.rn));

  PERFORM public.master_formula_stages_resequence(f2);

  --  Renumbering in place collides with stages that have not moved
  --  yet, which is the common case rather than the rare one. If this
  --  ever fails with a unique violation, the parking pass has gone.
  PERFORM mfs_assert('B2','resequencing closes it, keeping the order',
    mfs_seq(f2) = 'DISP,GRAN,COMP', mfs_seq(f2));

  PERFORM mfs_assert('B3','and the numbering is 1..n again',
    NOT EXISTS (
      SELECT 1 FROM (
        SELECT sequence_no, row_number() OVER (ORDER BY sequence_no) rn
          FROM public.master_formula_stages WHERE formula_id = f2) q
       WHERE q.sequence_no <> q.rn));

  RESET ROLE; PERFORM set_config('request.jwt.claims','',false);
END $$;

-- =====================================================================
--  C. Comparing two versions
-- =====================================================================
RESET ROLE;
SELECT set_config('request.jwt.claims','', false);

DO $$
DECLARE
  f3 uuid := '00000000-0000-4f16-e000-000000000003';
  f4 uuid := '00000000-0000-4f16-e000-000000000004';
  u  uuid := '00000000-0000-4f16-b000-000000000001';
  r  record;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u::text)::text, false);
  SET ROLE authenticated;

  PERFORM mfs_assert('C1','a version compared with itself has no differences',
    (SELECT count(*) FROM public.master_formula_compare(f4, f4)) = 0,
    (SELECT string_agg(item || '/' || change, ', ')
       FROM public.master_formula_compare(f4, f4)));

  PERFORM mfs_assert('C2','the yield range change is reported',
    EXISTS (SELECT 1 FROM public.master_formula_compare(f3, f4)
             WHERE scope = 'formula' AND field = 'yield_range'));

  --  C3 · THE ONE THAT MATTERS. "Dry mixing" became "Dry blending"
  --  under the same stage_code. A diff matching on display name would
  --  report one stage removed and one added, which is what a reviewer
  --  approving a version must not be told.
  SELECT * INTO r FROM public.master_formula_compare(f3, f4)
   WHERE scope = 'stage' AND stage_code = 'DRY';
  PERFORM mfs_assert('C3','a renamed stage reads as a change, not a removal and an addition',
    r.change = 'changed' AND r.old_value = 'Dry mixing' AND r.new_value = 'Dry blending',
    coalesce(r.change,'(none)'));

  PERFORM mfs_assert('C4','and only one row is produced for it',
    (SELECT count(*) FROM public.master_formula_compare(f3, f4)
      WHERE scope = 'stage' AND stage_code = 'DRY') = 1);

  PERFORM mfs_assert('C5','a changed parameter limit is reported under its stage',
    EXISTS (SELECT 1 FROM public.master_formula_compare(f3, f4)
             WHERE scope = 'parameter' AND item = 'Pre-compression force'
               AND change = 'changed' AND stage_code = 'COMP'));

  PERFORM mfs_assert('C6','an added parameter is reported as added',
    EXISTS (SELECT 1 FROM public.master_formula_compare(f3, f4)
             WHERE scope = 'parameter' AND item = 'Hardness' AND change = 'added'));

  PERFORM mfs_assert('C7','a changed material quantity is reported',
    EXISTS (SELECT 1 FROM public.master_formula_compare(f3, f4)
             WHERE scope = 'material' AND item = 'Maize starch BP'
               AND field = 'quantity_per_batch'));

  --  The unchanged material must NOT appear. A diff that lists
  --  everything is a listing, not a diff, and the reviewer stops
  --  reading it.
  PERFORM mfs_assert('C8','an unchanged material is not reported',
    NOT EXISTS (SELECT 1 FROM public.master_formula_compare(f3, f4)
                 WHERE scope = 'material' AND item = 'Paracetamol BP'));

  PERFORM mfs_assert('C9','a changed sampling interval is reported',
    EXISTS (SELECT 1 FROM public.master_formula_compare(f3, f4)
             WHERE scope = 'parameter' AND item = 'Tablet mass'
               AND field = 'sampling_interval_minutes'));

  --  Both sides of a difference are described by the same function,
  --  so a formatting difference cannot masquerade as a change.
  PERFORM mfs_assert('C10','both sides of a parameter change are worded the same way',
    (SELECT old_value LIKE '%kN%' AND new_value LIKE '%kN%'
       FROM public.master_formula_compare(f3, f4)
      WHERE scope = 'parameter' AND item = 'Pre-compression force'));

  RESET ROLE; PERFORM set_config('request.jwt.claims','',false);
END $$;

-- =====================================================================
--  D. The critical rule, and tenancy
-- =====================================================================
RESET ROLE;
SELECT set_config('request.jwt.claims','', false);

DO $$
BEGIN
  --  "Only machine settings can be critical" (MF-04), in one place so
  --  no screen decides for itself.
  PERFORM mfs_assert('D1','only machine settings may be critical',
    public.master_formula_parameter_critical_allowed('machine_setting')
    AND NOT public.master_formula_parameter_critical_allowed('product_attribute'));
END $$;

DO $$
DECLARE
  f3 uuid := '00000000-0000-4f16-e000-000000000003';
  f4 uuid := '00000000-0000-4f16-e000-000000000004';
  v_ok boolean := true;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','00000000-0000-0000-0000-0000000000fe')::text, false);
  SET ROLE authenticated;

  BEGIN
    PERFORM count(*) FROM public.master_formula_compare(f3, f4);
    v_ok := false;
  EXCEPTION WHEN others THEN NULL;
  END;
  PERFORM mfs_assert('D2','a non-member cannot compare another company''s formulas', v_ok);

  RESET ROLE; PERFORM set_config('request.jwt.claims','',false);
END $$;

-- ── Report ───────────────────────────────────────────────────────────
RESET ROLE;
SELECT set_config('request.jwt.claims','', false);

SELECT seq, id, name, verdict, detail FROM mfs_results ORDER BY seq;

--  Two shapes, because the CI harness reads either: the grouped
--  verdict table when there are failures, and the three-column line
--  when there are none. The three columns are total, passed, failed in
--  that order -- the harness takes columns 2 and 3 as passed and
--  failed, so any other order reports a clean suite as a broken one.
SELECT verdict, count(*) FROM mfs_results GROUP BY verdict ORDER BY verdict;

SELECT count(*) AS total,
       count(*) FILTER (WHERE verdict='PASS') AS passed,
       count(*) FILTER (WHERE verdict='FAIL') AS failed
FROM mfs_results;

-- ── Clean up ─────────────────────────────────────────────────────────
DO $cleanup$
DECLARE c uuid := '00000000-0000-4f16-a000-00000000000a';
BEGIN
  DELETE FROM public.master_formulas WHERE company_id = c;
  DELETE FROM public.products        WHERE company_id = c;
  DELETE FROM public.materials       WHERE company_id = c;
  DELETE FROM public.companies       WHERE id = c;
  DELETE FROM auth.users WHERE id = '00000000-0000-4f16-b000-000000000001';
END $cleanup$;
