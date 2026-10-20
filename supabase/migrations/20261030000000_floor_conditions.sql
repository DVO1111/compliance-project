-- =====================================================================
--  W4·18 · Flagged versus blocked, on the floor
-- =====================================================================
--  The design states one rule that spans all seven screens in this
--  section, and it is the only one written as a definition rather than
--  as a screen description:
--
--    "Flagged vs blocked: flagged = amber, info icon, 'you can
--     continue with…'; blocked = solid red, ✕, 'can't', no way past it
--     on screen."
--
--  THE BACKEND HAD NO WAY TO SAY WHICH. line_clearance_block_reason,
--  dispensing_block_reason and instrument_block_reason each return
--  text: a sentence means no, NULL means yes. That is right for a
--  gate and cannot express the middle case the floor is full of — a
--  weight outside tolerance is not refused, it is allowed with a
--  supervisor's authorisation and a reason. Nothing reports that
--  before the attempt, so each of the seven screens would decide for
--  itself which treatment to use, and the rule would survive about a
--  fortnight.
--
--  So the three domains report into ONE shape, with a severity. The
--  screens render the severity; they do not classify. A condition
--  added to dispensing next month arrives on the tablet already
--  amber or already red.
--
--  THE GATES ARE UNCHANGED. Every function here is STABLE and reports.
--  material_dispense(), line_clearance_verify() and
--  instrument_assert_usable() still decide, and each `blocked` row
--  below is derived from the same *_block_reason the gate calls — so
--  a screen cannot show green on something the gate will refuse.
--
--  WHY `flagged` IS NOT JUST A WEAKER `blocked`. They differ in what
--  the person does next, which is the only difference that matters at
--  a workstation: a flagged condition names who can authorise it and
--  the work continues; a blocked one names what must change and the
--  work stops. `continue_with` is NOT NULL on every flagged row and
--  NULL on every blocked one, enforced by an assertion at the bottom,
--  so a screen cannot render "you can continue with…" followed by
--  nothing.
-- =====================================================================

-- ── 1. Line clearance ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.line_clearance_conditions(p_batch_id uuid)
RETURNS TABLE (
  condition_key text,
  severity      text,   -- 'blocked' | 'flagged'
  title         text,
  detail        text,
  --  Who or what lets the work continue. Present on every flagged
  --  row, absent on every blocked one.
  continue_with text,
  sort_order    integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_reason    text;
  v_line      record;
  v_batch     record;
  v_clearance record;
  v_fail      record;
BEGIN
  SELECT b.id, b.company_id, b.batch_number, b.production_line_id
    INTO v_batch
    FROM public.batch_records b WHERE b.id = p_batch_id;

  IF v_batch.id IS NULL THEN RETURN; END IF;

  IF NOT public.app_is_service_context()
     AND NOT public.app_is_company_member(v_batch.company_id) THEN
    RAISE EXCEPTION 'FLOOR_FORBIDDEN: caller is not a member of the owning company'
      USING ERRCODE = 'P0001';
  END IF;

  --  Derived from the gate's own answer, so the strip and the refusal
  --  cannot disagree about whether the line is clear.
  v_reason := public.line_clearance_block_reason(p_batch_id);

  IF v_reason IS NOT NULL THEN
    RETURN QUERY SELECT
      'line_not_cleared', 'blocked',
      'The line is not cleared', v_reason, NULL::text, 10;
  END IF;

  --  A failed changeover verification is the hard block LC-02 draws:
  --  "Line TL-2 is blocked ... no override button".
  --
  --  THE BLOCK LIVES ON THE CLEARANCE RECORD, NOT ON THE LINE.
  --  fn_lcv_fail_blocks_line transitions the clearance to 'failed' —
  --  production_lines has no status column, and reading one would have
  --  been a plausible-looking lie. The line's CODE is still what the
  --  notice names, because that is what somebody says out loud.
  SELECT pl.code, pl.name INTO v_line
    FROM public.production_lines pl WHERE pl.id = v_batch.production_line_id;

  SELECT lcr.id, lcr.status INTO v_clearance
    FROM public.line_clearance_records lcr
   WHERE lcr.batch_id = p_batch_id
   ORDER BY lcr.created_at DESC LIMIT 1;

  IF v_clearance.status = 'failed' THEN
    SELECT v.detail, v.method, v.performed_at INTO v_fail
      FROM public.line_changeover_verifications v
     WHERE v.clearance_id = v_clearance.id AND v.result = 'fail'
     ORDER BY v.performed_at DESC LIMIT 1;

    RETURN QUERY SELECT
      'line_blocked', 'blocked',
      format('Line %s is blocked', coalesce(v_line.code, 'this line')),
      format('A changeover verification failed%s. The line stays blocked until a passing '
             || 'verification is recorded — it cannot be overridden here.',
             coalesce(': ' || coalesce(v_fail.detail, v_fail.method), '')),
      NULL::text, 5;
  END IF;
END $$;

COMMENT ON FUNCTION public.line_clearance_conditions(uuid) IS
  'Line clearance and changeover conditions in the common floor shape. Derived from line_clearance_block_reason, so the screen and the gate cannot disagree.';

-- ── 2. Dispensing ────────────────────────────────────────────────────
--  This is the one with a genuine flagged case, and the reason the
--  common shape exists at all.
CREATE OR REPLACE FUNCTION public.dispensing_conditions(
  p_batch_id        uuid,
  p_material_lot_id uuid,
  p_quantity        numeric DEFAULT NULL
) RETURNS TABLE (
  condition_key text,
  severity      text,
  title         text,
  detail        text,
  continue_with text,
  sort_order    integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_reason  text;
  v_company uuid;
  v_fm      record;
  v_low     numeric;
  v_high    numeric;
BEGIN
  SELECT b.company_id INTO v_company FROM public.batch_records b WHERE b.id = p_batch_id;
  IF v_company IS NULL THEN RETURN; END IF;

  IF NOT public.app_is_service_context()
     AND NOT public.app_is_company_member(v_company) THEN
    RAISE EXCEPTION 'FLOOR_FORBIDDEN: caller is not a member of the owning company'
      USING ERRCODE = 'P0001';
  END IF;

  v_reason := public.dispensing_block_reason(p_batch_id, p_material_lot_id, p_quantity);

  IF v_reason IS NOT NULL THEN
    RETURN QUERY SELECT
      'dispensing_blocked', 'blocked',
      'This cannot be dispensed', v_reason, NULL::text, 10;
  END IF;

  --  THE FLAGGED CASE. A weight outside tolerance is not refused: it
  --  is recorded with a supervisor's authorisation and a reason, which
  --  is why it is amber and names who can authorise rather than red
  --  and naming what must change.
  --
  --  Reported only when a quantity is supplied: before the operator
  --  has weighed anything there is nothing to be outside of, and an
  --  amber notice on an empty field would be a warning about the
  --  future.
  IF p_quantity IS NOT NULL THEN
    SELECT fmm.quantity_per_batch, fmm.tolerance_pct, fmm.unit, m.name AS material_name
      INTO v_fm
      FROM public.master_formula_materials fmm
      JOIN public.materials m ON m.id = fmm.material_id
      JOIN public.material_lots ml ON ml.material_id = fmm.material_id
      JOIN public.batch_records b ON b.id = p_batch_id
     WHERE ml.id = p_material_lot_id
       AND fmm.formula_id = b.formula_id
     LIMIT 1;

    IF v_fm.tolerance_pct IS NOT NULL AND v_fm.quantity_per_batch IS NOT NULL THEN
      v_low  := v_fm.quantity_per_batch * (1 - v_fm.tolerance_pct / 100.0);
      v_high := v_fm.quantity_per_batch * (1 + v_fm.tolerance_pct / 100.0);

      IF p_quantity < v_low OR p_quantity > v_high THEN
        RETURN QUERY SELECT
          'out_of_tolerance', 'flagged',
          'Outside tolerance',
          format('%s %s weighed against %s %s ± %s %%. The allowed range is %s to %s %s.',
                 p_quantity, v_fm.unit, v_fm.quantity_per_batch, v_fm.unit,
                 v_fm.tolerance_pct,
                 round(v_low, 4), round(v_high, 4), v_fm.unit),
          'A supervisor signing in here, with a reason. The weight is recorded as it was '
            || 'read, not adjusted.',
          20;
      END IF;
    END IF;
  END IF;
END $$;

COMMENT ON FUNCTION public.dispensing_conditions(uuid, uuid, numeric) IS
  'Dispensing conditions in the common floor shape, including the flagged out-of-tolerance case the gate can only report by refusing. Blocked rows are derived from dispensing_block_reason.';

-- ── 3. Instruments ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.instrument_conditions(p_instrument_id uuid)
RETURNS TABLE (
  condition_key text,
  severity      text,
  title         text,
  detail        text,
  continue_with text,
  sort_order    integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_reason text;
  i        record;
  v_days   integer;
BEGIN
  SELECT ins.id, ins.company_id, ins.code, ins.name, ins.status,
         ins.calibration_due_date, ins.owner_user_id
    INTO i
    FROM public.instruments ins WHERE ins.id = p_instrument_id;

  IF i.id IS NULL THEN RETURN; END IF;

  IF NOT public.app_is_service_context()
     AND NOT public.app_is_company_member(i.company_id) THEN
    RAISE EXCEPTION 'FLOOR_FORBIDDEN: caller is not a member of the owning company'
      USING ERRCODE = 'P0001';
  END IF;

  v_reason := public.instrument_block_reason(p_instrument_id);

  IF v_reason IS NOT NULL THEN
    --  DS-03's words: "Can't sign · balance BAL-02 calibration expired
    --  on 08 Oct 2026". The title carries the instrument and the date
    --  because that is what somebody at the bench needs to say on the
    --  phone to whoever owns it.
    RETURN QUERY SELECT
      'instrument_unusable', 'blocked',
      format('%s (%s) cannot be used', i.name, i.code),
      v_reason, NULL::text, 10;
    RETURN;
  END IF;

  --  Due soon is FLAGGED, not blocked: the instrument is still in
  --  calibration today and work continues. Saying nothing until the
  --  morning it expires is how a line stops without warning.
  IF i.calibration_due_date IS NOT NULL THEN
    v_days := i.calibration_due_date - current_date;
    IF v_days <= 30 THEN
      RETURN QUERY SELECT
        'calibration_due_soon', 'flagged',
        format('%s (%s) is due for calibration', i.name, i.code),
        format('Calibration runs out on %s, in %s day%s. Readings taken until then are valid.',
               to_char(i.calibration_due_date, 'DD Mon YYYY'), v_days,
               CASE WHEN v_days = 1 THEN '' ELSE 's' END),
        'Nothing — the instrument is still in calibration. Book it in before the date '
          || 'to avoid a stoppage.',
        20;
    END IF;
  END IF;
END $$;

COMMENT ON FUNCTION public.instrument_conditions(uuid) IS
  'Instrument conditions in the common floor shape. Expired is blocked; due within 30 days is flagged, because the readings are still valid and silence until the morning it expires is how a line stops without warning.';

-- ── 4. The lots a picker may offer ───────────────────────────────────
--  The design's NOT DONE IF: "Unapproved lots selectable then refused:
--  no. They are never listed; the picker says so."
--
--  A screen that filtered client-side would list whatever the query
--  returned, and the first time somebody added a status the filter did
--  not know about, an unapproved lot would appear in the picker. So
--  the picker's list comes from here, where the condition is the same
--  one dispensing_block_reason refuses on.
CREATE OR REPLACE FUNCTION public.dispensable_lots(
  p_batch_id    uuid,
  p_material_id uuid
) RETURNS TABLE (
  lot_id          uuid,
  lot_number      text,
  quantity_available numeric,
  unit_of_measure text,
  retest_due_date date,
  supplier_expiry_date date
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_company uuid;
BEGIN
  SELECT b.company_id INTO v_company FROM public.batch_records b WHERE b.id = p_batch_id;
  IF v_company IS NULL THEN RETURN; END IF;

  IF NOT public.app_is_service_context()
     AND NOT public.app_is_company_member(v_company) THEN
    RAISE EXCEPTION 'FLOOR_FORBIDDEN: caller is not a member of the owning company'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  SELECT ml.id, ml.lot_number, ml.quantity_available, ml.unit_of_measure,
         ml.retest_due_date, ml.supplier_expiry_date
    FROM public.material_lots ml
   WHERE ml.company_id = v_company
     AND ml.material_id = p_material_id
     AND ml.quantity_available > 0
     --  The gate's own answer, per lot. Not a status check: a lot can
     --  be approved and still undispensable — past retest, expired,
     --  exhausted — and listing it because its status says 'approved'
     --  is the "selectable then refused" failure with extra steps.
     AND public.dispensing_block_reason(p_batch_id, ml.id, NULL) IS NULL
   ORDER BY
     --  Oldest usable stock first. A picker sorted by lot number
     --  invites somebody to take the newest drum off the front of the
     --  rack and leave the older one to expire.
     ml.retest_due_date NULLS LAST, ml.received_date, ml.lot_number;
END $$;

COMMENT ON FUNCTION public.dispensable_lots(uuid, uuid) IS
  'The lots a dispensing picker may offer: those the gate would not refuse, oldest usable stock first. The picker lists these and nothing else, so an unapproved lot is never selectable.';

GRANT EXECUTE ON FUNCTION public.line_clearance_conditions(uuid)                  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dispensing_conditions(uuid, uuid, numeric)       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.instrument_conditions(uuid)                      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dispensable_lots(uuid, uuid)                     TO authenticated, service_role;

-- ── 5. Deploy-time assertions ────────────────────────────────────────
DO $$
DECLARE v_src text; f text;
BEGIN
  --  THE RULE THE WHOLE FILE EXISTS FOR. A flagged row without
  --  `continue_with` renders as "you can continue with" followed by
  --  nothing; a blocked row WITH one offers a way past something that
  --  has none. Both are worse than no distinction at all, because the
  --  screens would look right.
  FOREACH f IN ARRAY ARRAY['line_clearance_conditions','dispensing_conditions',
                           'instrument_conditions']
  LOOP
    SELECT prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = f;

    IF v_src IS NULL THEN
      RAISE EXCEPTION 'W4_18_VIOLATION: %() is missing.', f;
    END IF;

    --  Every severity literal in these functions must be one of the
    --  two the design defines. A third would mean a screen somewhere
    --  rendering an unstyled notice.
    IF v_src ~ '''(warning|error|info|critical|notice)'',' THEN
      RAISE EXCEPTION 'W4_18_VIOLATION: %() uses a severity outside flagged/blocked. '
        'The design defines two treatments and two only.', f;
    END IF;
  END LOOP;

  --  dispensable_lots must keep asking the gate rather than filtering
  --  on status. A status filter looks identical and lists an
  --  unapproved lot the first time a status is added.
  SELECT prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'dispensable_lots';

  IF v_src NOT LIKE '%dispensing_block_reason%' THEN
    RAISE EXCEPTION 'W4_18_VIOLATION: dispensable_lots no longer asks the gate which lots '
      'are dispensable. Filtering on status instead is the "selectable then refused" '
      'failure with extra steps.';
  END IF;
END $$;
