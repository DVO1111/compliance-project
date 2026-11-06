-- =====================================================================
--  THE CHAIN REACHES RELEASE
--
--  Two defects, found by driving goods receipt → QC → QA disposition in
--  a browser and confirmed against the live project. Between them they
--  make the MVP's central claim — material arrival through to
--  certificate issued — impossible to complete, on any workspace,
--  including the seeded one.
--
--  Neither is a missing feature. Both are a step that stops one link
--  short of the next.
--
--
--  ── 1. A LOT IS NEVER PUT UNDER TEST ──
--
--  material_lot's lifecycle is:
--
--      quarantine --sample--> under_test --release--> approved
--
--  and `release` is valid ONLY from under_test. That transition exists
--  in the live project; so does the release RPC, which calls
--  lifecycle_transition correctly.
--
--  What does not exist is anything that fires `sample`.
--  material_lot_record_sampling writes the sampling row and returns.
--  It never transitions, so a lot stays in `quarantine` for ever and
--  `release` is unreachable from any screen, for any role, with any
--  signature.
--
--  The symptom is worse than a refusal. material_lot_release_conditions
--  reports "all conditions met · ready to release", the QA Manager
--  enters their password to sign, and only then does the lifecycle
--  engine refuse with LIFECYCLE_INVALID_TRANSITION. The product asks
--  somebody to sign a decision it has already decided it will not take.
--
--  Recording sampling IS the event the `sample` action names, so this
--  fires it. Conditionally, because sampling is also recorded against a
--  lot already under test — a second container set, a repeat sample
--  after an inconclusive result — and that must not fail.
--
--
--  ── 2. GOODS RECEIPT CANNOT NUMBER A LOT ──
--
--  fn_material_lots_defaults calls numbering_next(company, 'material_lot')
--  for any lot without a number. numbering_next raises
--  NUMBERING_NO_FORMAT when the company has no format for that scope,
--  and NOTHING in the application ever writes one: no screen, no
--  service, no RPC. Only 20261006000000_demo_seed writes it, and only
--  for the company it seeds.
--
--  So the first delivery booked into any workspace that was created
--  through onboarding — which is every pilot company — fails with a
--  500 and the raw Postgres message. company_numbering_formats holds
--  zero rows in the live project today.
--
--  The precedent for the fix is eight lines further down this same
--  file's predecessor: material_lot_record_sampling already self-seeds
--  its own 'material_sampling' format on first use, with a comment
--  explaining that a company which has never configured one "must not
--  be unable to record sampling at all". That reasoning applies with
--  more force to receipt, which is the first step of the chain. The
--  omission is an inconsistency, not a decision.
--
--  ON CONFLICT DO NOTHING, so a company that HAS configured a format
--  keeps it. The default stays editable.
--
--
--  ── WHAT THIS DOES NOT DO ──
--
--  It does not grant anybody anything. `release` still requires the
--  lifecycle's admin/compliance_officer role and a signature; the
--  material-disposition guards still apply where they are deployed.
--  This migration moves a lot into the state from which those checks
--  are asked. It makes the gates reachable, not weaker.
-- =====================================================================


-- ── 1. Receipt can number a lot ──────────────────────────────────────
--
--  Kept in the defaults trigger rather than in a service, because the
--  trigger is where numbering_next is called and therefore where the
--  absence bites. SECURITY DEFINER already, so the insert is permitted.
CREATE OR REPLACE FUNCTION public.fn_material_lots_defaults()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_code text; v_retest integer; v_unit text;
BEGIN
  SELECT m.code, m.retest_period_days, m.unit_of_measure
    INTO v_code, v_retest, v_unit
    FROM public.materials m WHERE m.id = NEW.material_id;

  IF v_code IS NULL THEN
    RAISE EXCEPTION 'MATERIAL_LOT_NO_MATERIAL: material % does not exist', NEW.material_id
      USING ERRCODE = 'P0002';
  END IF;

  --  The material must belong to the same company as the lot. Without
  --  this, a lot could reference another tenant's material and the lot
  --  number would carry their material code.
  IF NOT EXISTS (SELECT 1 FROM public.materials m
                  WHERE m.id = NEW.material_id AND m.company_id = NEW.company_id) THEN
    RAISE EXCEPTION 'MATERIAL_LOT_CROSS_COMPANY: material % belongs to another company', NEW.material_id
      USING ERRCODE = 'P0001';
  END IF;

  IF NEW.lot_number IS NULL OR btrim(NEW.lot_number) = '' THEN
    --  THE ADDITION. Same shape, and the same reasoning, as the
    --  'material_sampling' default in material_lot_record_sampling: a
    --  company that has never configured a lot format must not be
    --  unable to receive material at all. First use writes the
    --  default and leaves it editable.
    --
    --  STARTING ABOVE THE HISTORY, NOT AT ONE. A workspace that has
    --  lots already — imported opening stock, a migrated register, a
    --  seeded demo — would otherwise be handed LOT-26-0001 on its
    --  first receipt and collide with material_lots_number_uniq. Found
    --  exactly that way: the seeded company held LOT-26-0412..0432 and
    --  the first receipt after a bare self-seed was refused 23505.
    --
    --  So the sequence opens one past the highest number this company
    --  already uses that matches the default's shape. A company with
    --  no history starts at 1, which is the same answer as before.
    --  seq_period MUST be set to the current period. numbering_next
    --  restarts the counter whenever seq_period differs from the
    --  period it computes, so a row seeded with next_seq = 433 and a
    --  NULL period still hands out 0001 on the very next call. That is
    --  the second way this collided in testing, and it is invisible
    --  from the stored next_seq alone.
    INSERT INTO public.company_numbering_formats
      (company_id, scope, pattern, prefix, seq_width, seq_reset, next_seq, seq_period)
    SELECT NEW.company_id, 'material_lot', '{PREFIX}-{YY}-{SEQ}', 'LOT', 4, 'yearly',
           1 + coalesce(max(substring(ml.lot_number from '(\d+)$')::bigint), 0),
           to_char(current_date, 'YYYY')
      FROM public.material_lots ml
     WHERE ml.company_id = NEW.company_id
       AND ml.lot_number ~ '^LOT-\d{2}-\d+$'
    ON CONFLICT (company_id, scope) DO NOTHING;

    NEW.lot_number := public.numbering_next(
      NEW.company_id, 'material_lot', jsonb_build_object('material_code', v_code));
  END IF;

  IF NEW.unit_of_measure IS NULL THEN NEW.unit_of_measure := v_unit; END IF;
  IF NEW.quantity_available IS NULL THEN NEW.quantity_available := NEW.quantity_received; END IF;

  IF NEW.retest_due_date IS NULL AND v_retest IS NOT NULL THEN
    NEW.retest_due_date := NEW.received_date + v_retest;
  END IF;

  RETURN NEW;
END $$;


-- ── 2. Sampling puts the lot under test ──────────────────────────────
CREATE OR REPLACE FUNCTION public.material_lot_record_sampling(
  p_lot_id             uuid,
  p_containers_sampled integer,
  p_containers_total   integer,
  p_sampling_plan      text DEFAULT NULL,
  p_sampled_on         date DEFAULT current_date,
  p_note               text DEFAULT NULL
) RETURNS public.material_lot_sampling
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_lot record; v_ref text; v_row public.material_lot_sampling;
  v_state text;
BEGIN
  SELECT ml.id, ml.company_id INTO v_lot
    FROM public.material_lots ml WHERE ml.id = p_lot_id;
  IF v_lot.id IS NULL THEN
    RAISE EXCEPTION 'MATERIAL_NO_LOT: no such lot %', p_lot_id USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.app_is_company_member(v_lot.company_id) THEN
    RAISE EXCEPTION 'MATERIAL_FORBIDDEN: caller is not a member of the owning company'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.company_numbering_formats
    (company_id, scope, pattern, prefix, seq_width, seq_reset)
  VALUES (v_lot.company_id, 'material_sampling', '{PREFIX}-{YY}-{SEQ}', 'SMP', 4, 'yearly')
  ON CONFLICT (company_id, scope) DO NOTHING;

  v_ref := public.numbering_next(v_lot.company_id, 'material_sampling');

  INSERT INTO public.material_lot_sampling (
    company_id, material_lot_id, reference, sampled_on, sampled_by,
    containers_sampled, containers_total, sampling_plan, note
  ) VALUES (
    v_lot.company_id, p_lot_id, v_ref, p_sampled_on, auth.uid(),
    p_containers_sampled, p_containers_total, p_sampling_plan, p_note
  ) RETURNING * INTO v_row;

  --  ── THE TRANSITION THAT WAS MISSING ──
  --
  --  Only from quarantine. A lot already under_test is being sampled
  --  again, which is ordinary and must not raise; a lot that is
  --  on_hold, rejected, approved or expired is not a lot anybody is
  --  taking a first sample from, and the lifecycle would refuse the
  --  action anyway. Reading the state first keeps that refusal out of
  --  the sampling path, so recording what was physically sampled never
  --  fails because of where the lot sits.
  SELECT ls.state_key INTO v_state
    FROM public.entity_current_state ecs
    JOIN public.lifecycle_states ls ON ls.id = ecs.state_id
   WHERE ecs.entity_type = 'material_lot' AND ecs.entity_id = p_lot_id;

  IF v_state = 'quarantine' THEN
    PERFORM public.lifecycle_transition(
      'material_lot', p_lot_id, 'sample', v_lot.company_id, auth.uid(),
      'Sampled: ' || v_ref, NULL, NULL);
  END IF;

  RETURN v_row;
END $$;

COMMENT ON FUNCTION public.material_lot_record_sampling(uuid, integer, integer, text, date, text) IS
  'Records what was physically sampled from a lot and, when the lot is in '
  'quarantine, fires the `sample` transition that puts it under test. '
  'Without that transition `release` — valid only from under_test — is '
  'unreachable, which is the state the live project was in.';

GRANT EXECUTE ON FUNCTION public.material_lot_record_sampling(uuid, integer, integer, text, date, text)
  TO authenticated;
