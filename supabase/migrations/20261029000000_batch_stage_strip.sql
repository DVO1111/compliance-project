-- =====================================================================
--  W4·17 · Batch record and stage execution — the strip, and why
-- =====================================================================
--  The batch-record backend is already built: batch_records,
--  batch_stages with operator and verifier signatures, readings
--  evaluated against the formula, corrections, the out-of-sequence
--  gate, the close. This file adds the two answers the screens need
--  and nothing could give them.
--
--  1. WHAT EVERY STAGE IS WAITING FOR, BEFORE ANYBODY TAPS.
--     The design's NOT DONE IF: "Locked stage greyed with no
--     explanation: no. Every locked stage says what it waits for."
--
--     batch_stage_start() answers that correctly and only for the
--     stage being started, and only at the moment of the attempt: it
--     raises BATCH_STAGE_OUT_OF_SEQUENCE naming the first incomplete
--     earlier stage. A strip across the top of a tablet needs the
--     answer for EVERY stage, in advance, or it can only grey them out
--     and leave the operator to find out by pressing.
--
--  2. WHY "COMPLETE AND SIGN" IS DISABLED.
--     "Complete and sign stays disabled with the reason given." The
--     completion gate checks the verifier and the batch being open —
--     it does not check that the stage's readings are present and in
--     specification, because the readings gate lives in the reading
--     trigger. So nothing could tell a screen "two readings missing,
--     one out of range" before the button was pressed.
--
--  NEITHER FUNCTION DECIDES ANYTHING. batch_stage_start() and
--  batch_stage_complete() remain the gates; these report. A screen
--  that disagreed with them would be a screen bug, which is why the
--  sequence rule below is written against the same condition the gate
--  uses — an earlier stage whose status is not 'complete'.
-- =====================================================================

-- ── 1. The stage strip ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.batch_stage_strip(p_batch_id uuid)
RETURNS TABLE (
  stage_id       uuid,
  sequence_no    integer,
  name           text,
  status         text,
  --  'done' | 'current' | 'locked' | 'closed'
  state          text,
  --  Null when the stage is open. A sentence when it is not: the
  --  design requires every locked stage to say what it waits for.
  waiting_for    text,
  requires_verifier boolean,
  operator_id    uuid,
  verifier_id    uuid,
  signed_by_operator boolean,
  signed_by_verifier boolean,
  readings_total   integer,
  readings_recorded integer,
  readings_out_of_spec integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_company uuid;
  v_closed  timestamptz;
BEGIN
  SELECT b.company_id, b.execution_closed_at INTO v_company, v_closed
    FROM public.batch_records b WHERE b.id = p_batch_id;

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'BATCH_NOT_FOUND: no such batch %', p_batch_id USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.app_is_service_context()
     AND NOT public.app_is_company_member(v_company) THEN
    RAISE EXCEPTION 'BATCH_FORBIDDEN: caller is not a member of the owning company'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  WITH stages AS (
    SELECT s.*,
           --  The same condition batch_stage_start() refuses on: the
           --  first earlier stage that is not complete. Written once
           --  here as a lateral so the strip and the gate cannot
           --  disagree about what blocks what.
           (SELECT e.name FROM public.batch_stages e
             WHERE e.batch_id = s.batch_id
               AND e.sequence_no < s.sequence_no
               AND e.status <> 'complete'
             ORDER BY e.sequence_no LIMIT 1) AS blocker_name,
           (SELECT e.sequence_no FROM public.batch_stages e
             WHERE e.batch_id = s.batch_id
               AND e.sequence_no < s.sequence_no
               AND e.status <> 'complete'
             ORDER BY e.sequence_no LIMIT 1) AS blocker_seq,
           (SELECT e.status FROM public.batch_stages e
             WHERE e.batch_id = s.batch_id
               AND e.sequence_no < s.sequence_no
               AND e.status <> 'complete'
             ORDER BY e.sequence_no LIMIT 1) AS blocker_status
      FROM public.batch_stages s
     WHERE s.batch_id = p_batch_id),
  counts AS (
    SELECT r.batch_stage_id,
           count(*)::integer AS total,
           count(*) FILTER (
             WHERE r.reading_value IS NOT NULL OR r.reading_text IS NOT NULL
           )::integer AS recorded,
           count(*) FILTER (WHERE r.in_specification IS FALSE)::integer AS out_of_spec
      FROM public.batch_stage_parameter_readings r
     GROUP BY r.batch_stage_id)
  SELECT
    s.id, s.sequence_no, s.name, s.status,
    CASE
      WHEN v_closed IS NOT NULL             THEN 'closed'
      WHEN s.status = 'complete'            THEN 'done'
      WHEN s.blocker_seq IS NOT NULL        THEN 'locked'
      ELSE 'current'
    END,
    CASE
      --  A closed batch is locked for a different reason than an
      --  unfinished one, and saying "waiting for stage 3" on a batch
      --  nobody can touch would send somebody to stage 3.
      WHEN v_closed IS NOT NULL
        THEN format('The batch was closed on %s. Nothing can be recorded or changed.',
                    to_char(v_closed, 'DD Mon YYYY'))
      WHEN s.status = 'complete' THEN NULL
      WHEN s.blocker_seq IS NOT NULL
        THEN format('Waiting for stage %s, %s, which is %s.',
                    s.blocker_seq, s.blocker_name,
                    replace(s.blocker_status, '_', ' '))
      --  In progress and waiting on its own second signature. The
      --  design draws this as its own state (BR-04): the stage cannot
      --  be edited and is not done.
      WHEN s.status = 'awaiting_verification'
        THEN 'Signed by the operator. Waiting for a second person to verify and sign.'
      ELSE NULL
    END,
    s.requires_verifier, s.operator_id, s.verifier_id,
    s.operator_signature_id IS NOT NULL,
    s.verifier_signature_id IS NOT NULL,
    coalesce(c.total, 0), coalesce(c.recorded, 0), coalesce(c.out_of_spec, 0)
  FROM stages s
  LEFT JOIN counts c ON c.batch_stage_id = s.id
  ORDER BY s.sequence_no;
END $$;

COMMENT ON FUNCTION public.batch_stage_strip(uuid) IS
  'Every stage of a batch with its state and, when it is not open, what it is waiting for. Reports; batch_stage_start() still decides. The blocking condition is the same one that function refuses on, so the strip and the gate cannot disagree.';

-- ── 2. Why "Complete and sign" is disabled ───────────────────────────
--  One row per reason, so the button can name them all rather than
--  the first. No rows means the stage may be completed.
CREATE OR REPLACE FUNCTION public.batch_stage_completion_blockers(p_stage_id uuid)
RETURNS TABLE (
  blocker_key text,
  title       text,
  detail      text,
  sort_order  integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  c          record;
  v_missing  integer;
  v_oos      integer;
  v_names    text[];
  v_oos_names text[];
BEGIN
  SELECT * INTO c FROM public.batch_stage_context(p_stage_id);

  IF c.closed_at IS NOT NULL THEN
    RETURN QUERY SELECT 'batch_closed', 'The batch is closed',
      format('Closed on %s. Nothing on it can be recorded or signed.',
             to_char(c.closed_at, 'DD Mon YYYY')), 0;
    RETURN;
  END IF;

  IF c.status = 'pending' THEN
    RETURN QUERY SELECT 'not_started', 'The stage has not been started',
      'Start the stage before completing it, so the record carries when the work began.', 5;
  END IF;

  --  Readings the formula asks for that have no value yet.
  --
  --  DERIVED FROM THE FORMULA, NOT FROM EMPTY READING ROWS. A reading
  --  row is created when a value is recorded, not seeded blank when
  --  the stage starts — so "rows with a null value" is always zero and
  --  a stage with nothing recorded at all would report no blockers.
  --  The parameters the stage is supposed to carry live on the master
  --  formula stage it was instantiated from.
  SELECT count(*)::integer,
         array_agg(p.parameter ORDER BY p.sort_order, p.parameter)
    INTO v_missing, v_names
    FROM public.batch_stages bs
    JOIN public.master_formula_stage_parameters p
      ON p.stage_id = bs.formula_stage_id
   WHERE bs.id = p_stage_id
     AND NOT EXISTS (
       SELECT 1 FROM public.batch_stage_parameter_readings r
        WHERE r.batch_stage_id = p_stage_id
          AND r.formula_parameter_id = p.id
          AND (r.reading_value IS NOT NULL OR r.reading_text IS NOT NULL));

  IF coalesce(v_missing, 0) > 0 THEN
    RETURN QUERY SELECT 'readings_missing',
      format('%s reading%s not recorded', v_missing,
             CASE WHEN v_missing = 1 THEN '' ELSE 's' END),
      array_to_string(v_names, ', '), 10;
  END IF;

  --  Out of specification. NOT a hard refusal in the database — the
  --  reading trigger records in_specification and lets the value
  --  stand, because an operator must be able to write down what the
  --  instrument actually said. It is reported here so the screen can
  --  say why the button is off and route the person to an escalation
  --  rather than to a blank field.
  SELECT count(*)::integer,
         array_agg(r.parameter_name ORDER BY r.parameter_name)
    INTO v_oos, v_oos_names
    FROM public.batch_stage_parameter_readings r
   WHERE r.batch_stage_id = p_stage_id AND r.in_specification IS FALSE;

  IF coalesce(v_oos, 0) > 0 THEN
    RETURN QUERY SELECT 'readings_out_of_spec',
      format('%s reading%s out of specification', v_oos,
             CASE WHEN v_oos = 1 THEN ' is' ELSE 's are' END),
      array_to_string(v_oos_names, ', '), 20;
  END IF;

  --  The two-person rule, stated before the attempt rather than as a
  --  refusal after it.
  IF c.requires_verifier THEN
    RETURN QUERY SELECT 'verifier_required', 'A second person must verify this stage',
      'The verifier signs in with their own account. The operator cannot be the verifier.', 30;
  END IF;
END $$;

COMMENT ON FUNCTION public.batch_stage_completion_blockers(uuid) IS
  'Why a stage cannot be completed yet, one row per reason, so "Complete and sign" can name them all instead of the first. No rows means it may be completed.';

GRANT EXECUTE ON FUNCTION public.batch_stage_strip(uuid)                TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.batch_stage_completion_blockers(uuid)  TO authenticated, service_role;

-- ── 3. Deploy-time assertions ────────────────────────────────────────
DO $$
DECLARE v_src text;
BEGIN
  --  The strip must keep deriving "locked" from the same condition
  --  batch_stage_start() refuses on. If somebody simplifies it to
  --  "status = 'pending'", a stage after a reopened one would show as
  --  startable and the gate would refuse it — the greyed-with-no-
  --  explanation failure, inverted and worse.
  SELECT prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'batch_stage_strip';

  IF v_src NOT LIKE '%e.status <> ''complete''%' THEN
    RAISE EXCEPTION 'W4_17_VIOLATION: batch_stage_strip no longer derives "locked" from an '
      'earlier stage that is not complete, which is the condition batch_stage_start() '
      'refuses on. The strip and the gate would disagree.';
  END IF;

  --  Every non-open state must carry a sentence. A strip that greys a
  --  stage without one is the exact thing the design rules out.
  IF v_src NOT LIKE '%Waiting for stage%' THEN
    RAISE EXCEPTION 'W4_17_VIOLATION: batch_stage_strip no longer says what a locked stage '
      'is waiting for.';
  END IF;
END $$;
