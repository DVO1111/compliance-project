-- =====================================================================
--  THE CHAIN REACHES RELEASE  (20261216000000)
--
--  A. Receipt can number a lot in a workspace with no format
--  B. The seeded format does not collide with existing lot numbers
--  C. Sampling puts a quarantined lot under test
--  D. Sampling a lot that is already under test does not fail
--  E. Release is reachable from under_test, and still gated
--
--  WHY THIS FILE EXISTS
--  --------------------
--  Two defects made the MVP's central chain — material arrival through
--  to certificate issued — impossible to finish on any workspace. Both
--  were one step short of the next link, and both were invisible from
--  the schema: every table existed, every function existed, and the
--  screens rendered.
--
--  The faults this pins are the ones that would come back silently:
--
--    * A workspace with no numbering format cannot receive material at
--      all. numbering_next raises NUMBERING_NO_FORMAT and the receipt
--      is a 500. Nothing in the application ever wrote that format, so
--      this was every workspace except the demo-seeded one.
--
--    * A lot never leaves `quarantine`, because nothing fires the
--      `sample` transition. `release` is valid only from `under_test`,
--      so release was unreachable for every role, with any signature.
--      The readiness panel still reported "ready to release", which is
--      the part that makes this worth a regression test rather than a
--      comment: the product asked somebody to sign a decision it had
--      already decided to refuse.
--
--  E is written to assert that the gate is REACHED, not that it opens.
--  A test that made release succeed would have to manufacture an
--  electronic signature, and the refusal it would then stop catching is
--  the one that matters most.
-- =====================================================================

CREATE TEMP TABLE _s(section text, name text, ok boolean, detail text);
CREATE OR REPLACE FUNCTION _sk(p_section text, p_name text, p_ok boolean, p_detail text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO _s VALUES (p_section,p_name,coalesce(p_ok,false),p_detail); END $$;

GRANT ALL ON _s TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION _sk(text,text,boolean,text) TO anon, authenticated, service_role;


-- ── Fixture ──────────────────────────────────────────────────────────
/*
 *  One company with NO numbering format of any kind — which is the
 *  state every workspace created through onboarding is in — and one
 *  material to receive against. A second company carries pre-existing
 *  lot numbers, so B can pin the collision case that the first
 *  attempt at this fix got wrong.
 */
DO $fixture$
DECLARE
  c_fresh uuid := '00000000-0000-7d03-b000-0000000000c1';
  c_hist  uuid := '00000000-0000-7d03-b000-0000000000c2';
  u       uuid := '00000000-0000-7d03-b000-0000000000a1';
BEGIN
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  VALUES (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'chain.tester@example.invalid', '', now(), now(), now())
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.companies (id, name) VALUES
    (c_fresh, 'Fresh Workspace Ltd'), (c_hist, 'Imported History Ltd')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.company_members (company_id, user_id, role, status) VALUES
    (c_fresh, u, 'owner', 'active'), (c_hist, u, 'owner', 'active')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.materials (id, company_id, code, name, material_type, unit_of_measure, created_by) VALUES
    ('00000000-0000-7d03-b000-0000000000d1', c_fresh, 'RM-900', 'Test excipient BP', 'excipient', 'kg', u),
    ('00000000-0000-7d03-b000-0000000000d2', c_hist,  'RM-901', 'Test excipient BP', 'excipient', 'kg', u)
  ON CONFLICT (id) DO NOTHING;

  --  Imported opening stock, numbered in the same shape the default
  --  uses. This is what made the first version of the fix collide.
  INSERT INTO public.material_lots
    (company_id, material_id, lot_number, quantity_received, received_date, created_by)
  VALUES (c_hist, '00000000-0000-7d03-b000-0000000000d2', 'LOT-26-0412', 10, current_date, u)
  ON CONFLICT DO NOTHING;
END
$fixture$;


-- ── A. Receipt numbers a lot with no format configured ───────────────
DO $a$
DECLARE
  c uuid := '00000000-0000-7d03-b000-0000000000c1';
  u uuid := '00000000-0000-7d03-b000-0000000000a1';
  v_before integer; v_num text; v_id uuid;
BEGIN
  SELECT count(*) INTO v_before FROM public.company_numbering_formats
   WHERE company_id = c AND scope = 'material_lot';
  PERFORM _sk('A', 'the workspace starts with no lot format', v_before = 0,
              'rows=' || v_before);

  INSERT INTO public.material_lots
    (company_id, material_id, quantity_received, received_date, created_by)
  VALUES (c, '00000000-0000-7d03-b000-0000000000d1', 25, current_date, u)
  RETURNING id, lot_number INTO v_id, v_num;

  PERFORM _sk('A', 'the receipt succeeds and is numbered', v_num IS NOT NULL,
              'lot_number=' || coalesce(v_num, 'null'));
  PERFORM _sk('A', 'the format was written for next time',
              EXISTS (SELECT 1 FROM public.company_numbering_formats
                       WHERE company_id = c AND scope = 'material_lot'));

  --  seq_period matters as much as next_seq: numbering_next restarts
  --  the counter whenever the stored period differs from the one it
  --  computes, so a format seeded without it hands out 0001 anyway.
  PERFORM _sk('A', 'the seeded format records its period',
              EXISTS (SELECT 1 FROM public.company_numbering_formats
                       WHERE company_id = c AND scope = 'material_lot'
                         AND seq_period = to_char(current_date,'YYYY')));

  PERFORM _sk('A', 'the lot is quarantined on arrival',
              (SELECT status FROM public.material_lots WHERE id = v_id) = 'quarantine',
              'status=' || (SELECT status FROM public.material_lots WHERE id = v_id));
EXCEPTION WHEN OTHERS THEN
  PERFORM _sk('A', 'the receipt succeeds and is numbered', false, SQLERRM);
END
$a$;


-- ── B. The default does not collide with imported history ────────────
DO $b$
DECLARE
  c uuid := '00000000-0000-7d03-b000-0000000000c2';
  u uuid := '00000000-0000-7d03-b000-0000000000a1';
  v_num text;
BEGIN
  INSERT INTO public.material_lots
    (company_id, material_id, quantity_received, received_date, created_by)
  VALUES (c, '00000000-0000-7d03-b000-0000000000d2', 25, current_date, u)
  RETURNING lot_number INTO v_num;

  PERFORM _sk('B', 'a workspace holding LOT-26-0412 is not handed LOT-26-0001',
              v_num <> 'LOT-26-0001', 'lot_number=' || coalesce(v_num,'null'));
  PERFORM _sk('B', 'the sequence opens past the imported history',
              substring(v_num from '(\d+)$')::bigint > 412,
              'lot_number=' || coalesce(v_num,'null'));
EXCEPTION WHEN OTHERS THEN
  PERFORM _sk('B', 'a second receipt does not collide', false, SQLERRM);
END
$b$;


-- ── C/D/E. Sampling, re-sampling, and the release gate ───────────────
DO $cde$
DECLARE
  c uuid := '00000000-0000-7d03-b000-0000000000c1';
  u uuid := '00000000-0000-7d03-b000-0000000000a1';
  v_lot uuid; v_state text; v_err text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', u::text, 'role', 'authenticated')::text, true);

  SELECT id INTO v_lot FROM public.material_lots
   WHERE company_id = c ORDER BY created_at DESC LIMIT 1;

  -- C
  PERFORM public.material_lot_record_sampling(v_lot, 2, 10, 'sqrt(n)+1');
  SELECT ls.state_key INTO v_state
    FROM public.entity_current_state ecs
    JOIN public.lifecycle_states ls ON ls.id = ecs.state_id
   WHERE ecs.entity_type = 'material_lot' AND ecs.entity_id = v_lot;
  PERFORM _sk('C', 'sampling moves the lot out of quarantine', v_state = 'under_test',
              'state=' || coalesce(v_state,'null'));

  -- D  — a second sample is ordinary and must not raise
  BEGIN
    PERFORM public.material_lot_record_sampling(v_lot, 1, 10, 'repeat sample');
    PERFORM _sk('D', 're-sampling a lot already under test does not fail', true);
  EXCEPTION WHEN OTHERS THEN
    PERFORM _sk('D', 're-sampling a lot already under test does not fail', false, SQLERRM);
  END;

  SELECT ls.state_key INTO v_state
    FROM public.entity_current_state ecs
    JOIN public.lifecycle_states ls ON ls.id = ecs.state_id
   WHERE ecs.entity_type = 'material_lot' AND ecs.entity_id = v_lot;
  PERFORM _sk('D', 'and leaves it under test', v_state = 'under_test',
              'state=' || coalesce(v_state,'null'));

  -- E  — the gate is REACHED. It must refuse for want of a signature,
  --      which is a different refusal from "not available from this
  --      state" and is the whole point of the fix.
  BEGIN
    PERFORM public.lifecycle_transition(
      'material_lot', v_lot, 'release', c, u, 'test probe', NULL, NULL);
    v_err := '(no error — release succeeded unsigned)';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
  END;

  PERFORM _sk('E', 'release is no longer refused as an invalid transition',
              v_err NOT LIKE '%LIFECYCLE_INVALID_TRANSITION%', v_err);
  PERFORM _sk('E', 'release still demands an electronic signature',
              v_err LIKE '%SIGNATURE_REQUIRED%', v_err);
  PERFORM _sk('E', 'and the lot was NOT released by the attempt',
              (SELECT status FROM public.material_lots WHERE id = v_lot) <> 'approved',
              'status=' || (SELECT status FROM public.material_lots WHERE id = v_lot));

  PERFORM set_config('request.jwt.claims', NULL, true);
END
$cde$;


-- ── Teardown ─────────────────────────────────────────────────────────
DELETE FROM public.material_lots
 WHERE company_id IN ('00000000-0000-7d03-b000-0000000000c1',
                      '00000000-0000-7d03-b000-0000000000c2');
DELETE FROM public.company_numbering_formats
 WHERE company_id IN ('00000000-0000-7d03-b000-0000000000c1',
                      '00000000-0000-7d03-b000-0000000000c2');
DELETE FROM public.materials
 WHERE company_id IN ('00000000-0000-7d03-b000-0000000000c1',
                      '00000000-0000-7d03-b000-0000000000c2');
DELETE FROM public.company_members
 WHERE company_id IN ('00000000-0000-7d03-b000-0000000000c1',
                      '00000000-0000-7d03-b000-0000000000c2');
DELETE FROM public.companies
 WHERE id IN ('00000000-0000-7d03-b000-0000000000c1',
              '00000000-0000-7d03-b000-0000000000c2');
DELETE FROM auth.users WHERE id = '00000000-0000-7d03-b000-0000000000a1';


-- ── Summary ──────────────────────────────────────────────────────────
SELECT count(*) AS total,
       count(*) FILTER (WHERE ok) AS passed,
       count(*) FILTER (WHERE NOT ok) AS failed
  FROM _s;

SELECT section, name, detail FROM _s WHERE NOT ok ORDER BY section, name;

DO $done$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM _s WHERE NOT ok;
  IF n > 0 THEN
    RAISE EXCEPTION '% assertion(s) failed in chain_reaches_release_test.sql', n;
  END IF;
END
$done$;
