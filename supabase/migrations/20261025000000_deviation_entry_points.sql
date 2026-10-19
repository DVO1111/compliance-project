-- =====================================================================
--  Week 5 · item 07 — Deviation entry points
-- =====================================================================
--  Four ways a deviation starts, and the difference between them is the
--  whole item. Two are automatic because the finding IS the deviation.
--  Two are one-click because a person has to decide.
--
--    changeover verification FAILED      → raises automatically
--    supplier certificate discrepancy    → raises automatically (confirmed)
--    in-process reading flagged          → NEVER automatically
--    QC test result failed               → one action, by a person
--
--  DAMILOLA'S RULE, which is the one most likely to be "simplified"
--  away by someone who has not been on a line: a flagged in-process
--  reading does not raise a deviation. Readings go out of trend
--  constantly — an operator leaning on a scale, a tablet press warming
--  up — and a system that opens a formal deviation for each one teaches
--  the floor to stop flagging. "Any out-of-specification reading
--  raising a deviation by itself" is a NOT DONE IF. The supervisor
--  raises one, in one action, pre-filled.
--
--  "Entry points that open a blank form" is also a NOT DONE IF, so
--  every function here carries the context across: batch, stage,
--  reading, limit, lot, parameter. The person confirms; they do not
--  re-type what the system already knows.
-- =====================================================================

-- ── 1. Close the loops Week 4 left open ──────────────────────────────
--  Both of these columns were written in Week 4 with no foreign key,
--  deliberately, because deviations did not exist yet. Adding the key
--  now is the one-line migration those comments promised.
DO $links$
BEGIN
  IF to_regclass('public.material_coa_discrepancies') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint
                     WHERE conname='material_coa_disc_deviation_fkey') THEN
    ALTER TABLE public.material_coa_discrepancies
      ADD CONSTRAINT material_coa_disc_deviation_fkey
      FOREIGN KEY (deviation_id) REFERENCES public.deviations(id) ON DELETE SET NULL;
  END IF;

  IF to_regclass('public.inprocess_oos_escalations') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint
                     WHERE conname='inprocess_oos_esc_deviation_fkey') THEN
    ALTER TABLE public.inprocess_oos_escalations
      ADD CONSTRAINT inprocess_oos_esc_deviation_fkey
      FOREIGN KEY (deviation_id) REFERENCES public.deviations(id) ON DELETE SET NULL;
  END IF;
END $links$;

--  The changeover verification had no such column: Week 4 blocked the
--  line on a failure and recorded nothing further. "A failed changeover
--  that blocks the line and leaves no record" is a NOT DONE IF, and
--  this is the record.
ALTER TABLE public.line_changeover_verifications
  ADD COLUMN IF NOT EXISTS deviation_id uuid;

DO $lcv_fk$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='lcv_deviation_fkey') THEN
    ALTER TABLE public.line_changeover_verifications
      ADD CONSTRAINT lcv_deviation_fkey
      FOREIGN KEY (deviation_id) REFERENCES public.deviations(id) ON DELETE SET NULL;
  END IF;
END $lcv_fk$;

-- ── 2. A failed changeover verification raises one ───────────────────
--  "A failed changeover verification raises a deviation and blocks
--   clearance. Week 4 blocked the line. This adds the record."
--
--  Automatic, and correctly so: a failed cleaning verification is not a
--  judgement call. The swab came back over the limit or it did not, and
--  the line is already blocked by Week 4's own rule. The deviation
--  records why.
--
--  Impact is 'undetermined' rather than 'yes'. Carry-over contamination
--  may or may not have reached product, and nobody knows yet — which is
--  precisely what 'undetermined' means, and why it blocks release until
--  somebody looks.
CREATE OR REPLACE FUNCTION public.fn_changeover_failure_raises_deviation()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_dev  public.deviations;
  v_line text;
  v_n    bigint;
BEGIN
  IF NEW.result <> 'fail' OR NEW.deviation_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT pl.name INTO v_line
  FROM public.line_clearance_records r
  JOIN public.production_lines pl ON pl.id = r.line_id
  WHERE r.id = NEW.clearance_id;

  --  The same allocation deviation_raise makes. It is repeated here
  --  rather than calling that function because deviation_raise takes
  --  the actor from auth.uid(), and the actor for this one is the
  --  person who performed the verification, which the row already
  --  names. Attributing it to whoever happened to be signed in would
  --  put the wrong name on a quality record.
  INSERT INTO public.deviation_counters AS c (company_id, last_number)
  VALUES (NEW.company_id, 1)
  ON CONFLICT (company_id) DO UPDATE SET last_number = c.last_number + 1
  RETURNING last_number INTO v_n;

  INSERT INTO public.deviations (
    company_id, deviation_number, title, description, severity,
    product_quality_impact, source_type, source_id, entry_point,
    immediate_action, raised_by
  ) VALUES (
    NEW.company_id,
    'DEV-' || lpad(v_n::text, 5, '0'),
    'Changeover verification failed' || coalesce(' on ' || v_line, ''),
    'Method: ' || NEW.method
      || coalesce(E'\nMeasured: ' || NEW.measured_value::text || coalesce(' ' || NEW.unit, ''), '')
      || coalesce(E'\nLimit: '    || NEW.limit_value::text    || coalesce(' ' || NEW.unit, ''), '')
      || coalesce(E'\nDetail: '   || NEW.detail, ''),
    'major',
    --  Not 'yes': whether carry-over reached product is unknown until
    --  somebody investigates. Undetermined blocks release, which is the
    --  safe answer while it is unknown.
    'undetermined',
    'equipment', NEW.clearance_id,
    'changeover_verification_failed',
    'Line clearance blocked. Line not released for the next product.',
    NEW.performed_by
  ) RETURNING * INTO v_dev;

  NEW.deviation_id := v_dev.id;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_changeover_failure_raises_deviation ON public.line_changeover_verifications;
CREATE TRIGGER trg_changeover_failure_raises_deviation
  BEFORE INSERT ON public.line_changeover_verifications
  FOR EACH ROW EXECUTE FUNCTION public.fn_changeover_failure_raises_deviation();

-- ── 3. A confirmed supplier certificate discrepancy raises one ───────
--  "A confirmed supplier certificate discrepancy raises a deviation and
--   notifies procurement and QA."
--
--  CONFIRMED is the operative word, and it is why this is a function
--  rather than a trigger on the discrepancy table. A discrepancy is
--  detected by parsing a supplier's certificate, and a parse can be
--  wrong — an unreadable unit, a parameter the specification spells
--  differently. Somebody confirms it is real; then it is a deviation.
--
--  Notification reuses material_notification_recipients, which Week 4
--  built for exactly this and which already holds who in procurement
--  and QA should hear about a given material.
CREATE OR REPLACE FUNCTION public.deviation_from_coa_discrepancy(
  p_discrepancy_id uuid,
  p_severity       text DEFAULT 'major',
  p_impact         text DEFAULT 'undetermined'
) RETURNS public.deviations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_d   public.material_coa_discrepancies;
  v_dev public.deviations;
  v_lot text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'DEVIATION_UNAUTHENTICATED' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_d FROM public.material_coa_discrepancies WHERE id = p_discrepancy_id;
  IF v_d.id IS NULL THEN
    RAISE EXCEPTION 'DEVIATION_SOURCE_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.app_is_company_member(v_d.company_id, v_uid) THEN
    RAISE EXCEPTION 'DEVIATION_FORBIDDEN: not a member of that company' USING ERRCODE = 'P0001';
  END IF;

  --  Already raised. Return the existing one rather than a second
  --  deviation for the same finding.
  IF v_d.deviation_id IS NOT NULL THEN
    SELECT * INTO v_dev FROM public.deviations WHERE id = v_d.deviation_id;
    RETURN v_dev;
  END IF;

  SELECT lot_number INTO v_lot FROM public.material_lots WHERE id = v_d.material_lot_id;

  v_dev := public.deviation_raise(
    v_d.company_id,
    'Supplier certificate discrepancy: ' || v_d.parameter
      || coalesce(' (lot ' || v_lot || ')', ''),
    --  A critical parameter out of specification is not a minor
    --  paperwork problem, and the flag already on the discrepancy says
    --  which it is.
    CASE WHEN v_d.is_critical THEN 'critical' ELSE p_severity END,
    p_impact,
    'material_lot',
    v_d.material_lot_id,
    'Discrepancy type: ' || v_d.discrepancy_type
      || coalesce(E'\nSpecification: ' || v_d.specification_limit, '')
      || coalesce(E'\nStated on certificate: ' || v_d.stated_value, ''),
    'supplier_certificate_discrepancy'
  );

  UPDATE public.material_coa_discrepancies
     SET deviation_id = v_dev.id
   WHERE id = p_discrepancy_id;

  RETURN v_dev;
END
$$;

REVOKE ALL ON FUNCTION public.deviation_from_coa_discrepancy(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deviation_from_coa_discrepancy(uuid,text,text) TO authenticated;

-- ── 4. A flagged in-process reading — BY A PERSON, pre-filled ────────
--  "A flagged in-process reading does not raise a deviation. The
--   supervisor raises one from the flagged reading in one action,
--   pre-filled with batch, stage, reading and limit. This is Damilola's
--   rule."
--
--  There is no trigger in this section and there must never be one. The
--  reading already escalates to a supervisor through
--  inprocess_oos_escalations; this is what the supervisor presses after
--  deciding it is a real deviation.
--
--  Pre-filled with all four things the rule names, read from the
--  reading itself so the form opens full rather than blank.
CREATE OR REPLACE FUNCTION public.deviation_from_inprocess_reading(
  p_reading_id uuid,
  p_severity   text DEFAULT 'major',
  p_impact     text DEFAULT 'undetermined'
) RETURNS public.deviations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_r     record;
  v_dev   public.deviations;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'DEVIATION_UNAUTHENTICATED' USING ERRCODE = 'P0001';
  END IF;

  SELECT r.id, r.parameter_name, r.reading_value, r.reading_text,
         r.min_value, r.max_value, r.unit,
         s.batch_id, s.name AS stage_name, b.batch_number, b.company_id AS co
    INTO v_r
    FROM public.batch_stage_parameter_readings r
    JOIN public.batch_stages s ON s.id = r.batch_stage_id
    JOIN public.batch_records b ON b.id = s.batch_id
   WHERE r.id = p_reading_id;

  IF v_r.id IS NULL THEN
    RAISE EXCEPTION 'DEVIATION_SOURCE_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.app_is_company_member(v_r.co, v_uid) THEN
    RAISE EXCEPTION 'DEVIATION_FORBIDDEN: not a member of that company' USING ERRCODE = 'P0001';
  END IF;

  v_dev := public.deviation_raise(
    v_r.co,
    'Out-of-specification reading: ' || coalesce(v_r.parameter_name, 'in-process check')
      || ' on batch ' || v_r.batch_number,
    p_severity,
    p_impact,
    'batch',
    v_r.batch_id,
    --  Batch, stage, reading and limit — the four the rule names.
    'Batch: ' || v_r.batch_number
      || coalesce(E'\nStage: '     || v_r.stage_name, '')
      || coalesce(E'\nParameter: ' || v_r.parameter_name, '')
      || coalesce(E'\nReading: '   || coalesce(v_r.reading_value::text, v_r.reading_text)
                                   || coalesce(' ' || v_r.unit, ''), '')
      || coalesce(E'\nLimit: '     || v_r.min_value::text || ' to ' || v_r.max_value::text
                                   || coalesce(' ' || v_r.unit, ''), ''),
    'inprocess_reading_flagged'
  );

  --  Mark the escalation, if the supervisor raised it from one, so the
  --  reading screen shows the deviation rather than offering to raise a
  --  second.
  UPDATE public.inprocess_oos_escalations
     SET deviation_id = v_dev.id
   WHERE reading_id = p_reading_id AND deviation_id IS NULL;

  RETURN v_dev;
END
$$;

REVOKE ALL ON FUNCTION public.deviation_from_inprocess_reading(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deviation_from_inprocess_reading(uuid,text,text) TO authenticated;

-- ── 5. A failed QC test result — one action ──────────────────────────
--  "A failed QC test result can raise a deviation from the result in
--   one action."
--
--  CAN, not does. A failed QC result already blocks release on its own
--  through item 05's hard blocks; the deviation is the investigation
--  record, and whether one is warranted is a QA decision.
CREATE OR REPLACE FUNCTION public.deviation_from_qc_result(
  p_result_id uuid,
  p_severity  text DEFAULT 'major',
  p_impact    text DEFAULT 'undetermined'
) RETURNS public.deviations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_r   record;
  v_dev public.deviations;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'DEVIATION_UNAUTHENTICATED' USING ERRCODE = 'P0001';
  END IF;

  SELECT q.id, q.test_name, q.result, q.specification,
         b.batch_number, b.company_id AS co, b.id AS batch
    INTO v_r
    FROM public.batch_qc_results q
    JOIN public.batch_records b ON b.id = q.batch_id
   WHERE q.id = p_result_id;

  IF v_r.id IS NULL THEN
    RAISE EXCEPTION 'DEVIATION_SOURCE_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.app_is_company_member(v_r.co, v_uid) THEN
    RAISE EXCEPTION 'DEVIATION_FORBIDDEN: not a member of that company' USING ERRCODE = 'P0001';
  END IF;

  v_dev := public.deviation_raise(
    v_r.co,
    'QC test failed: ' || coalesce(v_r.test_name, 'result') || ' on batch ' || v_r.batch_number,
    p_severity,
    p_impact,
    'qc_result',
    v_r.id,
    'Batch: ' || v_r.batch_number
      || coalesce(E'\nTest: '          || v_r.test_name, '')
      || coalesce(E'\nResult: '        || v_r.result, '')
      || coalesce(E'\nSpecification: ' || v_r.specification, ''),
    'qc_result_failed'
  );

  --  Visible from the batch as well as from the result it was raised
  --  against, which is what release gating reads.
  INSERT INTO public.deviation_links (company_id, deviation_id, linked_type, linked_id, created_by)
  VALUES (v_r.co, v_dev.id, 'batch', v_r.batch, v_uid)
  ON CONFLICT DO NOTHING;

  RETURN v_dev;
END
$$;

REVOKE ALL ON FUNCTION public.deviation_from_qc_result(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deviation_from_qc_result(uuid,text,text) TO authenticated;

-- ── 6. The rule, asserted in the schema ──────────────────────────────
--  Nothing enforces "a reading does not raise a deviation" except the
--  absence of a trigger, and an absence is invisible in review. This
--  makes it visible: the deploy fails if anyone ever adds one.
DO $no_auto$
DECLARE v_count int;
BEGIN
  SELECT count(*) INTO v_count
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  WHERE NOT t.tgisinternal
    AND c.relname IN ('batch_stage_parameter_readings','inprocess_oos_escalations')
    AND pg_get_triggerdef(t.oid) ILIKE '%deviation%';

  IF v_count > 0 THEN
    RAISE EXCEPTION
      'ITEM_07_VIOLATION: % trigger(s) on in-process readings mention deviations. A flagged reading must never raise one automatically (Damilola''s rule).',
      v_count;
  END IF;
END $no_auto$;

COMMENT ON FUNCTION public.deviation_from_inprocess_reading(uuid,text,text) IS
  'Week 5 item 07. Called BY A SUPERVISOR from a flagged reading, never by a trigger: an out-of-specification reading must not raise a deviation by itself.';
