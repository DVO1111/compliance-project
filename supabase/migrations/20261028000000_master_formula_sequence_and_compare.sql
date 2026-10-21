-- =====================================================================
--  W4·16 · Master formula screens — reordering stages, comparing versions
-- =====================================================================
--  The master formula backend is already built: formulas, stages,
--  parameters typed as machine_setting or product_attribute, the bill
--  of materials with tolerance_pct, sampling_interval_minutes, the
--  approval freeze and master_formula_new_version(). This file adds the
--  two things the W4·16 screens need that nothing could answer.
--
--  1. REORDERING A STAGE. The design's "done means" is explicit —
--     "Sequence reorderable per product without looking technical →
--     drag handle, Move up / Move down" — and there was no way to do
--     it. master_formula_stages carries UNIQUE (formula_id,
--     sequence_no), so swapping two stages with two UPDATEs violates
--     the constraint halfway through whichever order they run in. A
--     screen would have had to invent a workaround, and the obvious
--     one — delete and reinsert — loses the stage's id and with it
--     every parameter hanging off it.
--
--     So the swap happens in one statement, via a CASE, and the
--     constraint is never transiently violated because no row ever
--     holds another row's number at the same time as that row.
--
--  2. COMPARING ANY TWO VERSIONS. "Versions can't be compared: no.
--     MF-05 compares any two." There was no diff. Writing one in the
--     browser would mean fetching both versions whole and matching
--     rows by name — which gets "renamed" wrong, gets "moved between
--     stages" wrong, and would have to be rewritten the first time a
--     column was added.
--
--  WHAT THIS FILE DELIBERATELY DOES NOT DO. The design says "'critical'
--  is offered for machine settings only". That is implemented in the
--  UI, not as a CHECK, because master_formula_stage_parameters already
--  carries is_critical on product attributes in four existing suites
--  and nothing in the database reads it for them. A constraint here
--  would fail those suites to enforce a rule the backend does not act
--  on. It is a one-line addition once the lead confirms the rule — see
--  the comment on master_formula_parameter_critical_allowed below.
-- =====================================================================

-- ── 1. Moving a stage ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.master_formula_stage_move(
  p_stage_id  uuid,
  p_direction text          -- 'up' | 'down'
) RETURNS SETOF public.master_formula_stages
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_formula  uuid;
  v_company  uuid;
  v_status   text;
  v_from     integer;
  v_to       integer;
  v_park     integer;
BEGIN
  IF p_direction NOT IN ('up','down') THEN
    RAISE EXCEPTION 'MASTER_FORMULA_BAD_DIRECTION: % is not up or down', p_direction
      USING ERRCODE = 'P0001';
  END IF;

  SELECT s.formula_id, s.sequence_no, f.company_id, f.status
    INTO v_formula, v_from, v_company, v_status
    FROM public.master_formula_stages s
    JOIN public.master_formulas f ON f.id = s.formula_id
   WHERE s.id = p_stage_id;

  IF v_formula IS NULL THEN
    RAISE EXCEPTION 'MASTER_FORMULA_NO_STAGE: no such stage %', p_stage_id
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.app_is_company_member(v_company) THEN
    RAISE EXCEPTION 'MASTER_FORMULA_FORBIDDEN: caller is not a member of the owning company'
      USING ERRCODE = 'P0001';
  END IF;

  --  The same rule the child-freeze trigger enforces, stated here so
  --  the refusal names reordering rather than a trigger.
  IF v_status = 'approved' THEN
    RAISE EXCEPTION 'MASTER_FORMULA_APPROVED_FROZEN: the stage sequence cannot be changed on an approved formula. Create a new version with master_formula_new_version().'
      USING ERRCODE = 'P0001';
  END IF;

  v_to := CASE WHEN p_direction = 'up' THEN v_from - 1 ELSE v_from + 1 END;

  --  Nothing to swap with. Not an error: Move up on the first stage is
  --  a button somebody pressed, and refusing loudly would be noise.
  --  The caller sees the unchanged sequence and the screen disables
  --  the arrow.
  IF NOT EXISTS (SELECT 1 FROM public.master_formula_stages
                  WHERE formula_id = v_formula AND sequence_no = v_to) THEN
    RETURN QUERY SELECT * FROM public.master_formula_stages
      WHERE formula_id = v_formula ORDER BY sequence_no;
    RETURN;
  END IF;

  --  THREE STATEMENTS, THROUGH A PARKING NUMBER. A single UPDATE with
  --  a CASE looks like it should work and does not: Postgres checks a
  --  UNIQUE constraint as each row is written, not at statement end,
  --  unless the constraint is DEFERRABLE — and this one is not. So the
  --  moving stage is parked above the sequence first, its neighbour
  --  takes the vacated number, and the parked stage comes back down.
  --
  --  ABOVE, not below. master_formula_stages_seq_chk requires
  --  sequence_no > 0, and a CHECK is always immediate, so parking at
  --  -1 fails for a different reason than the unique one.
  SELECT coalesce(max(sequence_no), 0) + 1 INTO v_park
    FROM public.master_formula_stages WHERE formula_id = v_formula;

  UPDATE public.master_formula_stages
     SET sequence_no = v_park
   WHERE formula_id = v_formula AND sequence_no = v_from;

  UPDATE public.master_formula_stages
     SET sequence_no = v_from
   WHERE formula_id = v_formula AND sequence_no = v_to;

  UPDATE public.master_formula_stages
     SET sequence_no = v_to
   WHERE formula_id = v_formula AND sequence_no = v_park;

  RETURN QUERY SELECT * FROM public.master_formula_stages
    WHERE formula_id = v_formula ORDER BY sequence_no;
END $$;

COMMENT ON FUNCTION public.master_formula_stage_move(uuid, text) IS
  'Moves a stage one place up or down, swapping sequence numbers in a single statement so the UNIQUE (formula_id, sequence_no) constraint is never transiently violated. Refuses on an approved formula. Returns the whole sequence, in order.';

-- ── 2. Repairing the sequence after a delete ─────────────────────────
--  master_formula_approve() refuses a formula whose stages are not
--  numbered 1..n with no gaps, and deleting a stage leaves exactly
--  that gap. Before this, the only way out was for a screen to renumber
--  the remaining stages by hand — and a screen that got it wrong would
--  produce a formula that could never be approved, with no clue why.
CREATE OR REPLACE FUNCTION public.master_formula_stages_resequence(
  p_formula_id uuid
) RETURNS SETOF public.master_formula_stages
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_company uuid; v_status text; v_offset integer;
BEGIN
  SELECT company_id, status INTO v_company, v_status
    FROM public.master_formulas WHERE id = p_formula_id;

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'MASTER_FORMULA_NOT_FOUND: no such formula %', p_formula_id
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.app_is_company_member(v_company) THEN
    RAISE EXCEPTION 'MASTER_FORMULA_FORBIDDEN: caller is not a member of the owning company'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_status = 'approved' THEN
    RAISE EXCEPTION 'MASTER_FORMULA_APPROVED_FROZEN: the stage sequence cannot be changed on an approved formula.'
      USING ERRCODE = 'P0001';
  END IF;

  --  Two passes, through a range nothing else occupies. Renumbering
  --  1..n in place collides whenever a target number is still held by
  --  a stage that has not moved yet — the common case, not the rare
  --  one.
  --
  --  The parking range is ABOVE the sequence, not below it:
  --  master_formula_stages_seq_chk requires sequence_no > 0 and a
  --  CHECK is always immediate, so negative parking fails for a
  --  different reason than the unique constraint it was avoiding.
  SELECT coalesce(max(sequence_no), 0) INTO v_offset
    FROM public.master_formula_stages WHERE formula_id = p_formula_id;

  UPDATE public.master_formula_stages
     SET sequence_no = v_offset + sequence_no
   WHERE formula_id = p_formula_id;

  UPDATE public.master_formula_stages s
     SET sequence_no = r.rn
    FROM (SELECT id, row_number() OVER (ORDER BY sequence_no) AS rn
            FROM public.master_formula_stages
           WHERE formula_id = p_formula_id) r
   WHERE s.id = r.id;

  RETURN QUERY SELECT * FROM public.master_formula_stages
    WHERE formula_id = p_formula_id ORDER BY sequence_no;
END $$;

COMMENT ON FUNCTION public.master_formula_stages_resequence(uuid) IS
  'Renumbers a draft formula''s stages to 1..n with no gaps, which is what master_formula_approve() requires. Parks the rows below zero first, because renumbering in place collides with stages that have not moved yet.';

-- ── 3. Whether a parameter may be marked critical ────────────────────
--  "Only machine settings can be critical" (MF-04). A function rather
--  than a CHECK, for now: four existing suites set is_critical on
--  product attributes, and nothing in the database acts on it for
--  them, so a constraint would fail those suites to enforce a rule
--  the backend does not yet apply. The screens call this, so the rule
--  is in one place and turning it into a constraint later is a
--  migration that adds the CHECK and deletes this comment.
CREATE OR REPLACE FUNCTION public.master_formula_parameter_critical_allowed(
  p_parameter_type text
) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = pg_temp
AS $$
  SELECT p_parameter_type = 'machine_setting';
$$;

COMMENT ON FUNCTION public.master_formula_parameter_critical_allowed(text) IS
  'Whether a parameter of this type may be marked critical. Critical means the stage stops until a supervisor decides, and a product attribute never blocks entry — so only machine settings qualify (MF-04).';

-- ── 4. One parameter, as a sentence ──────────────────────────────────
--  Used by the comparison above so both sides of a difference are
--  described the same way. A diff that formatted old and new
--  differently would show spurious changes.
CREATE OR REPLACE FUNCTION public.master_formula_parameter_text(
  p_type text, p_unit text,
  p_target numeric, p_target_text text,
  p_min numeric, p_max numeric,
  p_critical boolean, p_interval integer
) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_temp
AS $$
  SELECT trim(both ' · ' from concat_ws(' · ',
    nullif(concat_ws(' ',
      coalesce(p_target::text, p_target_text),
      nullif(p_unit, '')), ''),
    CASE WHEN p_min IS NOT NULL OR p_max IS NOT NULL
         THEN concat_ws(' – ', coalesce(p_min::text, '…'), coalesce(p_max::text, '…'))
         END,
    CASE WHEN p_critical THEN 'critical' END,
    CASE WHEN p_interval IS NOT NULL THEN format('every %s min', p_interval) END
  ));
$$;

-- ── 5. Comparing any two versions ────────────────────────────────────
--  MF-05 groups the differences by stage and shows old beside new. The
--  shape below is what that screen renders straight down: one row per
--  difference, already labelled.
--
--  MATCHING IS BY IDENTITY, NOT BY NAME. Stages match on stage_code and
--  parameters on (stage_code, parameter), because master_formula_new_version()
--  copies those forward unchanged. Matching on the display name instead
--  would report a renamed stage as one removed and one added, which is
--  the one thing a reviewer approving a version must not be told.
CREATE OR REPLACE FUNCTION public.master_formula_compare(
  p_from_id uuid,
  p_to_id   uuid
) RETURNS TABLE (
  stage_code   text,
  stage_name   text,
  sequence_no  integer,
  --  'stage' | 'parameter' | 'material' | 'formula'
  scope        text,
  --  'added' | 'removed' | 'changed' | 'moved'
  change       text,
  item         text,
  field        text,
  old_value    text,
  new_value    text,
  sort_order   integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE a record; b record;
BEGIN
  SELECT id, company_id, product_id, version, batch_size, batch_size_unit,
         expected_yield_pct, yield_min_pct, yield_max_pct
    INTO a FROM public.master_formulas WHERE id = p_from_id;
  SELECT id, company_id, product_id, version, batch_size, batch_size_unit,
         expected_yield_pct, yield_min_pct, yield_max_pct
    INTO b FROM public.master_formulas WHERE id = p_to_id;

  IF a.id IS NULL OR b.id IS NULL THEN
    RAISE EXCEPTION 'MASTER_FORMULA_NOT_FOUND: one of the versions does not exist'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.app_is_company_member(a.company_id) THEN
    RAISE EXCEPTION 'MASTER_FORMULA_FORBIDDEN: caller is not a member of the owning company'
      USING ERRCODE = 'P0001';
  END IF;

  --  Comparing two products' formulas would produce a diff where every
  --  row is "added" or "removed" and none of it means anything.
  IF a.product_id <> b.product_id THEN
    RAISE EXCEPTION 'MASTER_FORMULA_DIFFERENT_PRODUCTS: those versions belong to different products'
      USING ERRCODE = 'P0001';
  END IF;

  -- ── the formula's own fields ──
  RETURN QUERY
  SELECT NULL::text, NULL::text, NULL::integer, 'formula', 'changed',
         'Batch size', 'batch_size',
         format('%s %s', a.batch_size, a.batch_size_unit),
         format('%s %s', b.batch_size, b.batch_size_unit), 0
  WHERE a.batch_size IS DISTINCT FROM b.batch_size
     OR a.batch_size_unit IS DISTINCT FROM b.batch_size_unit;

  RETURN QUERY
  SELECT NULL::text, NULL::text, NULL::integer, 'formula', 'changed',
         'Expected yield', 'expected_yield_pct',
         a.expected_yield_pct::text, b.expected_yield_pct::text, 1
  WHERE a.expected_yield_pct IS DISTINCT FROM b.expected_yield_pct;

  RETURN QUERY
  SELECT NULL::text, NULL::text, NULL::integer, 'formula', 'changed',
         'Yield range', 'yield_range',
         format('%s – %s', a.yield_min_pct, a.yield_max_pct),
         format('%s – %s', b.yield_min_pct, b.yield_max_pct), 2
  WHERE a.yield_min_pct IS DISTINCT FROM b.yield_min_pct
     OR a.yield_max_pct IS DISTINCT FROM b.yield_max_pct;

  -- ── stages: added, removed, moved, renamed ──
  RETURN QUERY
  WITH fa AS (SELECT * FROM public.master_formula_stages WHERE formula_id = p_from_id),
       fb AS (SELECT * FROM public.master_formula_stages WHERE formula_id = p_to_id)
  SELECT coalesce(fb.stage_code, fa.stage_code),
         coalesce(fb.name, fa.name),
         coalesce(fb.sequence_no, fa.sequence_no),
         'stage',
         CASE WHEN fa.id IS NULL THEN 'added'
              WHEN fb.id IS NULL THEN 'removed'
              WHEN fa.sequence_no IS DISTINCT FROM fb.sequence_no THEN 'moved'
              ELSE 'changed' END,
         coalesce(fb.name, fa.name),
         CASE WHEN fa.id IS NULL OR fb.id IS NULL THEN NULL
              WHEN fa.sequence_no IS DISTINCT FROM fb.sequence_no THEN 'sequence_no'
              WHEN fa.name IS DISTINCT FROM fb.name THEN 'name'
              WHEN fa.equipment IS DISTINCT FROM fb.equipment THEN 'equipment'
              ELSE 'duration_minutes' END,
         CASE WHEN fa.id IS NULL THEN NULL
              WHEN fb.id IS NULL THEN format('stage %s', fa.sequence_no)
              WHEN fa.sequence_no IS DISTINCT FROM fb.sequence_no THEN fa.sequence_no::text
              WHEN fa.name IS DISTINCT FROM fb.name THEN fa.name
              WHEN fa.equipment IS DISTINCT FROM fb.equipment THEN fa.equipment
              ELSE fa.duration_minutes::text END,
         CASE WHEN fb.id IS NULL THEN NULL
              WHEN fa.id IS NULL THEN format('stage %s', fb.sequence_no)
              WHEN fa.sequence_no IS DISTINCT FROM fb.sequence_no THEN fb.sequence_no::text
              WHEN fa.name IS DISTINCT FROM fb.name THEN fb.name
              WHEN fa.equipment IS DISTINCT FROM fb.equipment THEN fb.equipment
              ELSE fb.duration_minutes::text END,
         10
    FROM fa FULL OUTER JOIN fb ON fb.stage_code = fa.stage_code
   WHERE fa.id IS NULL OR fb.id IS NULL
      OR fa.sequence_no IS DISTINCT FROM fb.sequence_no
      OR fa.name         IS DISTINCT FROM fb.name
      OR fa.equipment    IS DISTINCT FROM fb.equipment
      OR fa.duration_minutes IS DISTINCT FROM fb.duration_minutes;

  -- ── parameters, grouped under their stage ──
  RETURN QUERY
  WITH pa AS (
    SELECT s.stage_code, s.name AS stage_name, s.sequence_no, p.*
      FROM public.master_formula_stage_parameters p
      JOIN public.master_formula_stages s ON s.id = p.stage_id
     WHERE s.formula_id = p_from_id),
  pb AS (
    SELECT s.stage_code, s.name AS stage_name, s.sequence_no, p.*
      FROM public.master_formula_stage_parameters p
      JOIN public.master_formula_stages s ON s.id = p.stage_id
     WHERE s.formula_id = p_to_id)
  SELECT coalesce(pb.stage_code, pa.stage_code),
         coalesce(pb.stage_name, pa.stage_name),
         coalesce(pb.sequence_no, pa.sequence_no),
         'parameter',
         CASE WHEN pa.id IS NULL THEN 'added'
              WHEN pb.id IS NULL THEN 'removed'
              ELSE 'changed' END,
         coalesce(pb.parameter, pa.parameter),
         CASE WHEN pa.id IS NULL OR pb.id IS NULL THEN NULL
              WHEN pa.target_value IS DISTINCT FROM pb.target_value
                OR pa.target_text IS DISTINCT FROM pb.target_text THEN 'target'
              WHEN pa.min_value IS DISTINCT FROM pb.min_value
                OR pa.max_value IS DISTINCT FROM pb.max_value THEN 'limits'
              WHEN pa.is_critical IS DISTINCT FROM pb.is_critical THEN 'is_critical'
              WHEN pa.sampling_interval_minutes IS DISTINCT FROM pb.sampling_interval_minutes
                THEN 'sampling_interval_minutes'
              ELSE 'parameter_type' END,
         CASE WHEN pa.id IS NULL THEN NULL
              ELSE public.master_formula_parameter_text(
                     pa.parameter_type, pa.unit, pa.target_value, pa.target_text,
                     pa.min_value, pa.max_value, pa.is_critical,
                     pa.sampling_interval_minutes) END,
         CASE WHEN pb.id IS NULL THEN NULL
              ELSE public.master_formula_parameter_text(
                     pb.parameter_type, pb.unit, pb.target_value, pb.target_text,
                     pb.min_value, pb.max_value, pb.is_critical,
                     pb.sampling_interval_minutes) END,
         20
    FROM pa FULL OUTER JOIN pb
      ON pb.stage_code = pa.stage_code AND pb.parameter = pa.parameter
   WHERE pa.id IS NULL OR pb.id IS NULL
      OR pa.target_value IS DISTINCT FROM pb.target_value
      OR pa.target_text  IS DISTINCT FROM pb.target_text
      OR pa.min_value    IS DISTINCT FROM pb.min_value
      OR pa.max_value    IS DISTINCT FROM pb.max_value
      OR pa.is_critical  IS DISTINCT FROM pb.is_critical
      OR pa.parameter_type IS DISTINCT FROM pb.parameter_type
      OR pa.sampling_interval_minutes IS DISTINCT FROM pb.sampling_interval_minutes;

  -- ── the bill of materials ──
  RETURN QUERY
  WITH ma AS (SELECT m.*, mt.name AS material_name
                FROM public.master_formula_materials m
                JOIN public.materials mt ON mt.id = m.material_id
               WHERE m.formula_id = p_from_id),
       mb AS (SELECT m.*, mt.name AS material_name
                FROM public.master_formula_materials m
                JOIN public.materials mt ON mt.id = m.material_id
               WHERE m.formula_id = p_to_id)
  SELECT NULL::text, NULL::text, NULL::integer,
         'material',
         CASE WHEN ma.id IS NULL THEN 'added'
              WHEN mb.id IS NULL THEN 'removed'
              ELSE 'changed' END,
         coalesce(mb.material_name, ma.material_name),
         CASE WHEN ma.id IS NULL OR mb.id IS NULL THEN NULL
              WHEN ma.quantity_per_batch IS DISTINCT FROM mb.quantity_per_batch
                THEN 'quantity_per_batch'
              WHEN ma.tolerance_pct IS DISTINCT FROM mb.tolerance_pct THEN 'tolerance_pct'
              ELSE 'overage_pct' END,
         CASE WHEN ma.id IS NULL THEN NULL
              ELSE format('%s %s', ma.quantity_per_batch, ma.unit)
                   || coalesce(' · ± ' || ma.tolerance_pct::text || ' %', '') END,
         CASE WHEN mb.id IS NULL THEN NULL
              ELSE format('%s %s', mb.quantity_per_batch, mb.unit)
                   || coalesce(' · ± ' || mb.tolerance_pct::text || ' %', '') END,
         30
    FROM ma FULL OUTER JOIN mb
      ON mb.material_id = ma.material_id AND mb.role = ma.role
   WHERE ma.id IS NULL OR mb.id IS NULL
      OR ma.quantity_per_batch IS DISTINCT FROM mb.quantity_per_batch
      OR ma.tolerance_pct      IS DISTINCT FROM mb.tolerance_pct
      OR ma.overage_pct        IS DISTINCT FROM mb.overage_pct
      OR ma.unit               IS DISTINCT FROM mb.unit;
END $$;

COMMENT ON FUNCTION public.master_formula_compare(uuid, uuid) IS
  'Every difference between two versions of one product''s master formula, grouped by stage and already worded for MF-05. Matches on stage_code and parameter name rather than display name, so a rename reads as a change and not as a removal plus an addition.';

GRANT EXECUTE ON FUNCTION public.master_formula_stage_move(uuid, text)        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.master_formula_stages_resequence(uuid)       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.master_formula_compare(uuid, uuid)           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.master_formula_parameter_critical_allowed(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.master_formula_parameter_text(text,text,numeric,text,numeric,numeric,boolean,integer)
  TO authenticated, service_role;

-- ── 6. Deploy-time assertions ────────────────────────────────────────
DO $$
DECLARE v_n integer;
BEGIN
  --  The reorder must keep its parking step. Swapping two stages
  --  directly passes nothing — Postgres checks UNIQUE per row, not at
  --  statement end — and a reviewer simplifying this away would get a
  --  unique violation on every move.
  IF (SELECT prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'master_formula_stage_move')
     NOT LIKE '%v_park%' THEN
    RAISE EXCEPTION 'W4_16_VIOLATION: master_formula_stage_move no longer parks the moving '
      'stage. UNIQUE (formula_id, sequence_no) is checked per row and is not deferrable, '
      'so a direct swap violates it whichever order the rows are written in.';
  END IF;

  --  "Only machine settings can be critical" has to stay answerable in
  --  one place, or each screen will decide for itself.
  IF NOT public.master_formula_parameter_critical_allowed('machine_setting')
     OR public.master_formula_parameter_critical_allowed('product_attribute') THEN
    RAISE EXCEPTION 'W4_16_VIOLATION: master_formula_parameter_critical_allowed does not '
      'implement "only machine settings can be critical" (MF-04).';
  END IF;

  SELECT count(*) INTO v_n FROM information_schema.routines
   WHERE routine_schema = 'public' AND routine_name = 'master_formula_compare';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'W4_16_VIOLATION: master_formula_compare is missing, so MF-05 cannot '
      'compare any two versions.';
  END IF;
END $$;
