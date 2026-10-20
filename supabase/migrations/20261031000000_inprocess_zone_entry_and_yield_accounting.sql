-- =====================================================================
--  W4·19 · In-process control and yield — what the screens need
-- =====================================================================
--  Items 11 and 12 built the gates and the arithmetic. This migration
--  adds the four things W4·19's screens ask for that nothing reports
--  yet, and adds nothing else.
--
--  1. THE ZONE KEY (IP-01, IP-02). The design asks for "a zone key for
--     the product" and "a zone gauge with LAL / LWL / UWL / UAL".
--     weight_variation_zone() answers ONE value at a time; it cannot
--     draw a scale. A screen that laid the gauge out from the four
--     limit columns itself would be a second implementation of the
--     boundary convention — and the boundaries are inclusive on the
--     warning side and exclusive on the action side, which is exactly
--     the kind of detail a second implementation gets subtly wrong.
--     So the bands come from here, derived from the same columns, with
--     their bounds and their configured action.
--
--  2. THE SHIFT HISTORY (IP-01). "Shift history as zone chips." The
--     readings exist; nothing returns them with their zone for a given
--     test over a window.
--
--  3. THE LIVE VERDICT (IP-02, IP-03, IP-05). "The value being typed
--     shows its zone and action live." Before this, the only way to
--     learn what a value would be judged as was to save it. The
--     classifier is STABLE and takes a value, so asking it about a
--     value nobody has committed to is free — and the answer comes
--     back in W4·18's flagged/blocked shape so the floor screens all
--     speak one language.
--
--  4. THE YIELD ACCOUNT (YR-01). "Theoretical, packed, samples,
--     rejects, unaccounted, yield and variance against the threshold."
--     batch_yield_reconciliations holds ONE output figure,
--     actual_quantity. The design wants the lines that make it up.
--
--  ═══════════════════════════════════════════════════════════════════
--  THE MACHINE-SETTING INTERLOCK IS STILL NOT BUILT
--  ═══════════════════════════════════════════════════════════════════
--  IP-05 shows "a product attribute (flag) and a critical machine
--  setting (stop)", and the design says in the same breath that the
--  interlock "is shown as a proposal; Damilola and Aderoh still have
--  to decide whether it's built". Item 11's third NOT DONE IF is "the
--  interlock path was built anyway".
--
--  So inprocess_reading_conditions() NEVER returns a blocked row. Not
--  "does not yet" — cannot: there is no branch that produces one, and
--  an assertion at the bottom of this file fails the deploy if one
--  ever appears. The red notice in IP-05 is drawn by the screen from a
--  proposal it labels as a proposal, which is what a demo of an
--  undecided control should look like.
--
--  If you are here to build the interlock: this function is where its
--  report belongs, the assertion below is what you must delete, and
--  deleting it is the moment somebody should be able to point at a
--  decision from Damilola and Aderoh.
--
--  ═══════════════════════════════════════════════════════════════════
--  THERE IS NO packed_quantity COLUMN, AND THAT IS THE WHOLE DESIGN
--  ═══════════════════════════════════════════════════════════════════
--  YR-01's own figures settle what "actual yield" means, and it is not
--  what the first draft of this migration assumed:
--
--      Theoretical yield            300,000 tablets
--      Packed, released to store    289,440 tablets
--      In-process and QC samples      1,260 tablets
--      Counted rejects                2,100 tablets
--      Unaccounted                    7,200 tablets · 2.4 %
--      Actual yield                      96.5 %
--      Variance from theoretical        − 3.5 %
--
--  289,440 + 1,260 + 2,100 = 292,800, and 300,000 − 292,800 = 7,200,
--  which is the 2.4% unaccounted. But 96.5% is 289,440 / 300,000, not
--  292,800 / 300,000 — so the figure the THRESHOLD is applied to is
--  PACKED ALONE, and the design blocks on it at a 98% threshold.
--
--  That is the ordinary distinction between a yield and a
--  reconciliation: yield is what came out saleable, reconciliation is
--  where all the material went. The two percentages on YR-01 are
--  different numbers on purpose, and showing only one would hide
--  either the shortfall or the material nobody can find.
--
--  item 12's actual_quantity IS the packed figure — it is what
--  yield_pct, variance_pct and within_threshold are derived from, and
--  what batch_stage_complete blocks on. So this migration adds TWO
--  columns, not three. A packed_quantity column would be a second
--  place to hold the same number, and the day the two disagreed, YR-01
--  would show one figure while the gate blocked on the other. An
--  assertion at the bottom of this file fails the deploy if such a
--  column ever appears.
--
--  Samples and rejects are ACCOUNTED FOR but not saleable, which is
--  why they are lines of their own rather than part of the remainder:
--  folding them in would report 10,560 tablets unaccounted at Packing
--  and send somebody looking for material that is sitting in the QC
--  lab.
--
--  Decision 4 for the lead — whether unaccounted is a line the
--  operator must EXPLAIN or only part of the variance — is left open
--  on purpose. It is reported as a line with a `must_explain` flag
--  that is false everywhere today, so answering yes is a one-line
--  change and answering no costs nothing.
-- =====================================================================


-- ── 1. The zone key and gauge ────────────────────────────────────────
--
--  Five rows, always in the same order, low to high: 3L, 2L, 1, 2U, 3U.
--  Low to high because the gauge is drawn as a scale and a scale that
--  runs in the order the zones were named in the brief (1, 2U, 2L, 3U,
--  3L) would be drawn wrong by anybody who trusted the order.
--
--  An unbounded end is NULL rather than a large number: zone 3U has no
--  upper limit, and a gauge that drew one would be inventing a ceiling
--  nobody configured.
CREATE OR REPLACE FUNCTION public.inprocess_zone_key(p_product_id uuid)
RETURNS TABLE (
  zone          text,
  --  The configured response. Not a constant: a product that resamples
  --  at the action limit instead of rejecting says so in its own row.
  action        text,
  lower_bound   numeric,
  upper_bound   numeric,
  --  Whether each end of the band includes its own bound. The warning
  --  limits belong to zone 1 and the action limits to zone 2, so the
  --  bands are half-open in opposite directions and a renderer should
  --  not have to work that out.
  lower_inclusive boolean,
  upper_inclusive boolean,
  bound_text    text,
  sort_order    integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE l record; v_company uuid;
BEGIN
  SELECT company_id INTO v_company FROM public.products WHERE id = p_product_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'IP_NO_PRODUCT: no such product %', p_product_id USING ERRCODE='P0002';
  END IF;
  IF NOT public.app_is_service_context()
     AND NOT public.app_is_company_member(v_company) THEN
    RAISE EXCEPTION 'IP_FORBIDDEN: caller is not a member of the owning company'
      USING ERRCODE='P0001';
  END IF;

  SELECT * INTO l FROM public.product_weight_limits WHERE product_id = p_product_id;

  --  No limits, no key. Returning five bands with null bounds would
  --  draw an empty gauge that looks configured; returning nothing lets
  --  the screen say "this product has no weight limits", which is the
  --  true and actionable thing. Same discipline as item 11's refusal to
  --  default a zone.
  IF l.id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT * FROM (VALUES
    ('3L', l.zone_3l_action, NULL::numeric, l.lal,
     false, false,
     format('below %s %s', l.lal, l.unit), 1),
    ('2L', l.zone_2l_action, l.lal, l.lwl,
     true, false,
     format('%s to under %s %s', l.lal, l.lwl, l.unit), 2),
    ('1',  l.zone_1_action,  l.lwl, l.uwl,
     true, true,
     format('%s to %s %s', l.lwl, l.uwl, l.unit), 3),
    ('2U', l.zone_2u_action, l.uwl, l.ual,
     false, true,
     format('over %s to %s %s', l.uwl, l.ual, l.unit), 4),
    ('3U', l.zone_3u_action, l.ual, NULL::numeric,
     false, false,
     format('above %s %s', l.ual, l.unit), 5)
  ) AS v(zone, action, lower_bound, upper_bound,
         lower_inclusive, upper_inclusive, bound_text, sort_order)
  ORDER BY v.sort_order;
END;
$$;

COMMENT ON FUNCTION public.inprocess_zone_key(uuid) IS
  'The five weight zones for a product, low to high, with their bounds, which end includes its bound, and the configured action. Returns NO ROWS for a product without limits rather than five empty bands, so a screen says "not configured" instead of drawing a gauge nobody set. Derived from the same columns weight_variation_zone() compares against, so a gauge cannot disagree with a classification.';

REVOKE ALL ON FUNCTION public.inprocess_zone_key(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.inprocess_zone_key(uuid) TO authenticated, service_role;


-- ── 2. The shift history ─────────────────────────────────────────────
--
--  "Shift history as zone chips." A chip per reading, in the order
--  they were taken, with the zone AS FILED — read from the snapshotted
--  column, not reclassified. A product's limits can be revised, and a
--  history that re-zoned old readings against today's limits would
--  quietly rewrite what the shift saw.
CREATE OR REPLACE FUNCTION public.inprocess_shift_history(
  p_batch_stage_id       uuid,
  p_formula_parameter_id uuid,
  p_since                timestamptz DEFAULT NULL
)
RETURNS TABLE (
  reading_id      uuid,
  sequence_no     integer,
  reading_value   numeric,
  unit            text,
  zone            text,
  zone_action     text,
  in_specification boolean,
  recorded_at     timestamptz,
  escalated       boolean,
  --  NULL while an escalation is open, so a chip can show the
  --  difference between "a supervisor was asked" and "a supervisor
  --  answered".
  decision        text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE s record;
BEGIN
  SELECT bs.id, bs.company_id, bs.started_at INTO s
    FROM public.batch_stages bs WHERE bs.id = p_batch_stage_id;
  IF s.id IS NULL THEN
    RAISE EXCEPTION 'BSPR_NO_STAGE: no such batch stage %', p_batch_stage_id USING ERRCODE='P0002';
  END IF;
  IF NOT public.app_is_service_context()
     AND NOT public.app_is_company_member(s.company_id) THEN
    RAISE EXCEPTION 'BSPR_FORBIDDEN: caller is not a member of the owning company'
      USING ERRCODE='P0001';
  END IF;

  RETURN QUERY
  SELECT r.id, r.sequence_no, r.reading_value, r.unit,
         r.weight_zone, r.zone_action, r.in_specification, r.recorded_at,
         (e.id IS NOT NULL), e.decision
    FROM public.batch_stage_parameter_readings r
    LEFT JOIN public.inprocess_oos_escalations e ON e.reading_id = r.id
   WHERE r.batch_stage_id = p_batch_stage_id
     AND r.formula_parameter_id = p_formula_parameter_id
     --  Default window is the stage's own run. A "shift" is not a thing
     --  this schema knows about, and inventing one from a clock would
     --  be a guess; the caller may pass a real shift start when the
     --  company tells us what one is.
     AND r.recorded_at >= coalesce(p_since, s.started_at, r.recorded_at)
   ORDER BY r.sequence_no;
END;
$$;

COMMENT ON FUNCTION public.inprocess_shift_history(uuid,uuid,timestamptz) IS
  'The readings taken for one test on one stage, in sequence, with the zone AS FILED rather than reclassified — a product''s limits can be revised and a re-zoned history would rewrite what the shift saw. Defaults to the stage''s own run, because this schema does not know what a shift is.';

REVOKE ALL ON FUNCTION public.inprocess_shift_history(uuid,uuid,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.inprocess_shift_history(uuid,uuid,timestamptz)
  TO authenticated, service_role;


-- ── 3. The live verdict on a value nobody has saved ──────────────────
--
--  Reports in W4·18's shape — severity, title, detail, continue_with —
--  so the clearance, dispensing, calibration and reading screens all
--  render one component and none of them classifies.
--
--  EVERY ROW IS FLAGGED. See the header: the interlock is undecided,
--  item 11's first NOT DONE IF is "an OOS reading blocks entry", and
--  this function is STABLE and writes nothing, so there is nothing
--  here it could block anyway.
CREATE OR REPLACE FUNCTION public.inprocess_reading_conditions(
  p_batch_stage_id       uuid,
  p_formula_parameter_id uuid,
  p_value                numeric
)
RETURNS TABLE (
  condition_key text,
  severity      text,   -- always 'flagged'; see the header
  title         text,
  detail        text,
  continue_with text,
  sort_order    integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  s record; p record; z record;
  v_in_spec boolean;
  v_unit text;
BEGIN
  SELECT bs.id, bs.company_id, bs.formula_stage_id, br.product_id INTO s
    FROM public.batch_stages bs
    JOIN public.batch_records br ON br.id = bs.batch_id
   WHERE bs.id = p_batch_stage_id;
  IF s.id IS NULL THEN
    RAISE EXCEPTION 'BSPR_NO_STAGE: no such batch stage %', p_batch_stage_id USING ERRCODE='P0002';
  END IF;
  IF NOT public.app_is_service_context()
     AND NOT public.app_is_company_member(s.company_id) THEN
    RAISE EXCEPTION 'BSPR_FORBIDDEN: caller is not a member of the owning company'
      USING ERRCODE='P0001';
  END IF;

  SELECT fp.id, fp.parameter, fp.parameter_type, fp.unit,
         fp.min_value, fp.max_value, fp.is_critical, fp.is_weight_variation
    INTO p
    FROM public.master_formula_stage_parameters fp
   WHERE fp.id = p_formula_parameter_id AND fp.stage_id = s.formula_stage_id;
  IF p.id IS NULL THEN
    RAISE EXCEPTION
      'BSPR_NO_PARAMETER: parameter % is not a test on this stage', p_formula_parameter_id
      USING ERRCODE='P0002';
  END IF;

  --  Nothing typed yet. Not an error and not a condition: an empty
  --  field is the normal state of a form.
  IF p_value IS NULL THEN
    RETURN;
  END IF;

  v_unit := coalesce(' ' || p.unit, '');

  v_in_spec := CASE
    WHEN p.min_value IS NULL AND p.max_value IS NULL THEN NULL
    WHEN p.min_value IS NOT NULL AND p_value < p.min_value THEN false
    WHEN p.max_value IS NOT NULL AND p_value > p.max_value THEN false
    ELSE true
  END;

  IF v_in_spec IS FALSE THEN
    RETURN QUERY SELECT
      'reading_out_of_specification'::text,
      'flagged'::text,
      format('%s is outside specification', p.parameter),
      format('%s%s recorded against %s.', p_value, v_unit,
             CASE
               WHEN p.min_value IS NOT NULL AND p.max_value IS NOT NULL
                 THEN format('%s to %s%s', p.min_value, p.max_value, v_unit)
               WHEN p.min_value IS NOT NULL THEN format('a minimum of %s%s', p.min_value, v_unit)
               ELSE format('a maximum of %s%s', p.max_value, v_unit)
             END),
      --  The design's three buttons, in the design's words. Correcting
      --  comes first because it is the commonest and the cheapest: most
      --  out-of-specification readings on a tablet are a mistyped digit.
      'Correcting the value, or saving it and escalating to a supervisor. '
        || 'Recording it is never refused — acknowledge the flag and the reading saves.'::text,
      10;
  END IF;

  IF p.is_weight_variation THEN
    SELECT * INTO z FROM public.weight_variation_zone(s.product_id, p_value);

    IF NOT z.limits_configured THEN
      RETURN QUERY SELECT
        'no_weight_limits'::text,
        'flagged'::text,
        'This product has no weight variation limits'::text,
        format('%s%s cannot be put in a zone, because no limits are configured for this '
               || 'product. It is still recorded and still judged against specification.',
               p_value, v_unit),
        'Saving it as an unzoned reading. Someone with product setup access can '
          || 'configure the limits so later readings are zoned.'::text,
        20;

    ELSIF z.zone <> '1' THEN
      RETURN QUERY SELECT
        ('weight_zone_' || lower(z.zone))::text,
        'flagged'::text,
        format('Zone %s — %s the %s limit', z.zone,
               CASE WHEN right(z.zone, 1) = 'U' THEN 'above' ELSE 'below' END,
               CASE WHEN left(z.zone, 1) = '3' THEN 'action' ELSE 'warning' END),
        format('%s%s. This product''s configured response is to %s.',
               p_value, v_unit, z.action),
        --  The action is the product's own configuration, so the way on
        --  is named from it rather than from a rule in this function.
        CASE z.action
          WHEN 'accept'   THEN 'Saving the reading. This product accepts this zone.'
          WHEN 'adjust'   THEN 'Saving the reading and adjusting the machine before the next sample.'
          WHEN 'resample' THEN 'Saving the reading and taking another sample.'
          WHEN 'reject'   THEN 'Saving the reading and escalating to a supervisor, who decides '
                               || 'what happens to the material produced since the last good check.'
          ELSE 'Saving the reading and escalating to a supervisor.'
        END::text,
        CASE WHEN left(z.zone, 1) = '3' THEN 21 ELSE 22 END;
    END IF;
  END IF;

  --  A CRITICAL MACHINE SETTING OUT OF SPECIFICATION IS FLAGGED, NOT
  --  STOPPED. This is the branch IP-05 proposes turning red, and it is
  --  deliberately the same severity as every other row here. See the
  --  header, and the assertion at the bottom of this file.
  IF p.parameter_type = 'machine_setting' AND p.is_critical AND v_in_spec IS FALSE THEN
    RETURN QUERY SELECT
      'critical_machine_setting'::text,
      'flagged'::text,
      format('%s is a critical machine setting', p.parameter),
      'Whether a critical machine setting outside specification should stop the stage '
        || 'is still being decided. Today it is flagged like any other reading and '
        || 'nothing is stopped.'::text,
      'Saving the reading and escalating to a supervisor. No equipment is interlocked.'::text,
      30;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.inprocess_reading_conditions(uuid,uuid,numeric) IS
  'What a screen should show about a value as it is being typed, in W4·18''s flagged/blocked shape. EVERY row is flagged and no branch can produce a blocked one: item 11''s first NOT DONE IF is "an OOS reading blocks entry", and the machine-setting interlock is an undecided proposal. An assertion in this migration fails the deploy if a blocked row ever appears here.';

REVOKE ALL ON FUNCTION public.inprocess_reading_conditions(uuid,uuid,numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.inprocess_reading_conditions(uuid,uuid,numeric)
  TO authenticated, service_role;


-- ── 4. The yield account ─────────────────────────────────────────────
--
--  TWO columns. Packed is actual_quantity and is not stored again —
--  see the header. Write-once: settable while NULL, frozen afterwards,
--  because a breakdown that can be revised after a supervisor has
--  authorised the variance is not a record of what was counted.
ALTER TABLE public.batch_yield_reconciliations
  ADD COLUMN IF NOT EXISTS samples_quantity numeric(18,6),
  ADD COLUMN IF NOT EXISTS rejects_quantity numeric(18,6);

COMMENT ON COLUMN public.batch_yield_reconciliations.samples_quantity IS
  'Output withdrawn for in-process and QC testing, in the reconciliation''s own unit. ACCOUNTED FOR but not saleable, which is why it is a line of its own rather than part of the unaccounted remainder — folding it in would send somebody looking for material that is sitting in the QC lab. It is NOT part of actual_quantity: the yield and the threshold verdict are on the packed figure alone (YR-01).';
COMMENT ON COLUMN public.batch_yield_reconciliations.rejects_quantity IS
  'Output rejected at inspection. Accounted for, not saleable, and not part of actual_quantity.';

DO $yr_account_checks$
BEGIN
  --  Both or neither. A half-written account is worse than none: it
  --  looks like a breakdown and the remainder it implies is wrong.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='byr_account_together_chk') THEN
    ALTER TABLE public.batch_yield_reconciliations ADD CONSTRAINT byr_account_together_chk
      CHECK (
        (samples_quantity IS NULL AND rejects_quantity IS NULL)
        OR
        (samples_quantity IS NOT NULL AND rejects_quantity IS NOT NULL)
      );
  END IF;

  --  Neither is a measurement if it is negative. There is deliberately
  --  NO upper bound tying them to the theoretical figure: an overage
  --  is a real outcome, and a constraint that refused one would refuse
  --  to record the very case somebody needs to investigate.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='byr_account_signs_chk') THEN
    ALTER TABLE public.batch_yield_reconciliations ADD CONSTRAINT byr_account_signs_chk
      CHECK (
        coalesce(samples_quantity, 0) >= 0 AND
        coalesce(rejects_quantity, 0) >= 0
      );
  END IF;
END $yr_account_checks$;


--  Write-once. The existing fn_byr_immutable() freezes the quantities
--  outright; these two cannot be frozen the same way, because they are
--  written by an UPDATE the moment after the INSERT. So the rule is
--  "NULL may become a value, a value may not change".
CREATE OR REPLACE FUNCTION public.fn_byr_account_write_once()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (OLD.samples_quantity IS NOT NULL OR OLD.rejects_quantity IS NOT NULL) AND (
       NEW.samples_quantity IS DISTINCT FROM OLD.samples_quantity
    OR NEW.rejects_quantity IS DISTINCT FROM OLD.rejects_quantity
  ) THEN
    RAISE EXCEPTION
      'YIELD_ACCOUNT_FROZEN: the samples and rejects lines were recorded at % and cannot be changed. A breakdown that can be revised after the variance was authorised is not a record of what was counted.',
      OLD.recorded_at USING ERRCODE='P0001';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_byr_account_write_once() IS
  'Write-once for the yield account lines: NULL may become a value once, a value may never change. They are written by an UPDATE immediately after the INSERT, so fn_byr_immutable()''s outright freeze cannot cover them.';

DROP TRIGGER IF EXISTS trg_byr_account_write_once ON public.batch_yield_reconciliations;
CREATE TRIGGER trg_byr_account_write_once
  BEFORE UPDATE ON public.batch_yield_reconciliations
  FOR EACH ROW EXECUTE FUNCTION public.fn_byr_account_write_once();


--  The recording RPC. A WRAPPER, not a second implementation: the
--  packed figure goes to item 12's own function AS the actual yield,
--  and the two other lines are written onto the row it created. The
--  arithmetic, the unit checks, the threshold comparison and the block
--  all stay exactly where item 12 put them.
CREATE OR REPLACE FUNCTION public.yield_reconcile_stage_accounted(
  p_batch_stage_id  uuid,
  --  The saleable output. This is the actual yield, so it is passed
  --  straight through rather than stored a second time.
  p_packed_quantity numeric,
  p_samples_quantity numeric,
  p_rejects_quantity numeric,
  p_unit            text DEFAULT NULL,
  p_notes           text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_result jsonb; v_id uuid;
BEGIN
  IF p_samples_quantity IS NULL OR p_rejects_quantity IS NULL THEN
    RAISE EXCEPTION
      'YIELD_ACCOUNT_INCOMPLETE: both the samples and the rejects line are required — a half-written account looks like a breakdown and implies the wrong remainder. Pass zero for a line with nothing in it.'
      USING ERRCODE='P0001';
  END IF;

  v_result := public.yield_reconcile_stage(
                p_batch_stage_id, p_packed_quantity, p_unit, p_notes);
  v_id := (v_result->>'reconciliation_id')::uuid;

  UPDATE public.batch_yield_reconciliations
     SET samples_quantity = p_samples_quantity,
         rejects_quantity = p_rejects_quantity
   WHERE id = v_id;

  RETURN v_result || jsonb_build_object(
    'packed_quantity',  p_packed_quantity,
    'samples_quantity', p_samples_quantity,
    'rejects_quantity', p_rejects_quantity);
END;
$$;

COMMENT ON FUNCTION public.yield_reconcile_stage_accounted(uuid,numeric,numeric,numeric,text,text) IS
  'Records a stage reconciliation together with its samples and rejects lines. A wrapper over yield_reconcile_stage: the PACKED figure is the actual yield and is passed straight through, so item 12 still does the arithmetic, the unit checks and the verdict. Nothing here recomputes a yield, and packed is not stored a second time.';

REVOKE ALL ON FUNCTION
  public.yield_reconcile_stage_accounted(uuid,numeric,numeric,numeric,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  public.yield_reconcile_stage_accounted(uuid,numeric,numeric,numeric,text,text)
  TO authenticated, service_role;


--  The account as lines, for YR-01. One row per line, in the order the
--  design lists them, with the figure, its share of theoretical, and
--  whether it is an input the operator supplied or a remainder derived
--  from the others.
CREATE OR REPLACE FUNCTION public.yield_account_lines(p_reconciliation_id uuid)
RETURNS TABLE (
  line_key    text,
  label       text,
  quantity    numeric,
  unit        text,
  --  Share of theoretical, so the lines read as an account rather than
  --  four unrelated numbers. Theoretical's own share is 100.
  pct_of_theoretical numeric,
  --  'theoretical' is the basis, 'counted' is a figure a person
  --  supplied, 'derived' is the remainder.
  kind        text,
  --  Decision 4 for the lead: whether unaccounted is a line the
  --  operator must explain. False on every row today; see the header.
  must_explain boolean,
  sort_order  integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE r record; v_accounted numeric; v_unaccounted numeric;
BEGIN
  SELECT * INTO r FROM public.batch_yield_reconciliations WHERE id = p_reconciliation_id;
  IF r.id IS NULL THEN
    RAISE EXCEPTION 'YIELD_NO_RECONCILIATION: no such reconciliation %', p_reconciliation_id
      USING ERRCODE='P0002';
  END IF;
  IF NOT public.app_is_service_context()
     AND NOT public.app_is_company_member(r.company_id) THEN
    RAISE EXCEPTION 'YIELD_FORBIDDEN: caller is not a member of the owning company'
      USING ERRCODE='P0001';
  END IF;

  --  Packed plus the two accounted lines. NULL when no breakdown was
  --  recorded, rather than falling back to the packed figure alone:
  --  "accounted for" would then be a claim that nothing was sampled or
  --  rejected, which is not what an absent breakdown means.
  v_accounted := CASE WHEN r.samples_quantity IS NULL THEN NULL
                      ELSE r.actual_quantity + r.samples_quantity + r.rejects_quantity END;

  --  Signed, positive meaning material is missing. An absolute value
  --  would hide the difference between a shortfall and an overage,
  --  which have different causes.
  v_unaccounted := CASE WHEN v_accounted IS NULL THEN NULL
                        ELSE r.theoretical_quantity - v_accounted END;

  RETURN QUERY
  SELECT * FROM (VALUES
    ('theoretical', 'Theoretical yield', r.theoretical_quantity, r.unit,
     100.0::numeric, 'theoretical', false, 1),
    --  THE SAME NUMBER AS actual_quantity, read from it. Packed is the
    --  actual yield; its share of theoretical is yield_pct, not a
    --  second division.
    ('packed', 'Packed, released to store', r.actual_quantity, r.unit,
     r.yield_pct, 'counted', false, 2),
    ('samples', 'In-process and QC samples', r.samples_quantity, r.unit,
     CASE WHEN r.samples_quantity IS NULL THEN NULL
          ELSE round(r.samples_quantity * 100.0 / r.theoretical_quantity, 4) END,
     'counted', false, 3),
    ('rejects', 'Counted rejects', r.rejects_quantity, r.unit,
     CASE WHEN r.rejects_quantity IS NULL THEN NULL
          ELSE round(r.rejects_quantity * 100.0 / r.theoretical_quantity, 4) END,
     'counted', false, 4),
    ('accounted', 'Accounted for', v_accounted, r.unit,
     CASE WHEN v_accounted IS NULL THEN NULL
          ELSE round(v_accounted * 100.0 / r.theoretical_quantity, 4) END,
     'derived', false, 5),
    ('unaccounted', 'Unaccounted', v_unaccounted, r.unit,
     CASE WHEN v_unaccounted IS NULL THEN NULL
          ELSE round(v_unaccounted * 100.0 / r.theoretical_quantity, 4) END,
     'derived', false, 6)
  ) AS v(line_key, label, quantity, unit, pct_of_theoretical,
         kind, must_explain, sort_order)
  ORDER BY v.sort_order;
END;
$$;

COMMENT ON FUNCTION public.yield_account_lines(uuid) IS
  'A reconciliation as the lines YR-01 shows, in its labels: theoretical yield, packed, samples, rejects, accounted for, unaccounted. The packed line reads actual_quantity and its percentage is yield_pct — packed IS the actual yield, so neither is recomputed. Samples, rejects and therefore both derived lines are NULL when no breakdown was recorded; the reconciliation is still valid and its yield and variance are unaffected. Unaccounted is signed, positive meaning material is missing.';

REVOKE ALL ON FUNCTION public.yield_account_lines(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.yield_account_lines(uuid) TO authenticated, service_role;


-- ── 5. Deploy-time assertions ────────────────────────────────────────
DO $w419_assert$
DECLARE f text; v_src text; v_missing text[] := '{}';
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'inprocess_zone_key(uuid)',
    'inprocess_shift_history(uuid,uuid,timestamptz)',
    'inprocess_reading_conditions(uuid,uuid,numeric)',
    'yield_reconcile_stage_accounted(uuid,numeric,numeric,numeric,text,text)',
    'yield_account_lines(uuid)'
  ] LOOP
    IF to_regprocedure('public.' || f) IS NULL THEN
      v_missing := v_missing || f;
    END IF;
  END LOOP;
  IF array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION 'W4_19_VIOLATION: missing function(s): %', array_to_string(v_missing, ', ');
  END IF;

  --  THE INTERLOCK ASSERTION. Item 11's third NOT DONE IF is "the
  --  interlock path was built anyway", and W4·19's second decision for
  --  the lead says the machine-setting stop is a proposal Damilola and
  --  Aderoh have not decided on. A blocked row from this function would
  --  put a red "can't" on a tablet on the strength of a proposal.
  --
  --  Deleting this assertion is the moment somebody should be able to
  --  point at their decision.
  SELECT prosrc INTO v_src FROM pg_proc
   WHERE oid = to_regprocedure('public.inprocess_reading_conditions(uuid,uuid,numeric)');
  IF v_src ~* '''blocked''' THEN
    RAISE EXCEPTION
      'W4_19_VIOLATION: inprocess_reading_conditions() mentions a blocked severity. An '
      'out-of-specification reading must not block entry (item 11, first NOT DONE IF) and '
      'the machine-setting interlock is an undecided proposal (item 11, third NOT DONE IF). '
      'If that decision has now been taken, remove this assertion in the same commit as '
      'the branch that needs it.';
  END IF;

  --  PACKED IS NOT STORED TWICE. actual_quantity is the packed figure
  --  and what the threshold is applied to; a packed_quantity column
  --  would be a second home for the same number, and the day the two
  --  disagreed YR-01 would show one figure while the gate blocked on
  --  the other.
  IF EXISTS (SELECT 1 FROM pg_attribute
              WHERE attrelid = 'public.batch_yield_reconciliations'::regclass
                AND attname = 'packed_quantity' AND NOT attisdropped) THEN
    RAISE EXCEPTION
      'W4_19_VIOLATION: batch_yield_reconciliations has a packed_quantity column. The '
      'packed figure IS actual_quantity — it is what yield_pct, variance_pct and '
      'within_threshold are derived from and what batch_stage_complete blocks on. Storing '
      'it again gives one batch two packed figures and two verdicts.';
  END IF;

  --  Both account lines or neither. A lone samples figure implies a
  --  remainder that is wrong by exactly the rejects nobody entered.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='byr_account_together_chk') THEN
    RAISE EXCEPTION
      'W4_19_VIOLATION: byr_account_together_chk is gone. Samples and rejects must arrive '
      'together, or the unaccounted line is wrong without looking wrong.';
  END IF;

  --  And the wrapper must stay a wrapper. A second INSERT into
  --  batch_yield_reconciliations here would be a second arithmetic.
  SELECT prosrc INTO v_src FROM pg_proc
   WHERE oid = to_regprocedure(
     'public.yield_reconcile_stage_accounted(uuid,numeric,numeric,numeric,text,text)');
  IF v_src !~* 'yield_reconcile_stage\s*\(' THEN
    RAISE EXCEPTION
      'W4_19_VIOLATION: yield_reconcile_stage_accounted() no longer calls '
      'yield_reconcile_stage(). The account is a decomposition of a figure item 12 records; '
      'computing a yield here would give a batch two of them.';
  END IF;
END $w419_assert$;
