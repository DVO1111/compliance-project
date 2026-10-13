-- ===================================================================
--  WEEK 4 / ITEM 07 — BATCH RECORD AND STAGES
--
--  "Tables batch_records, batch_stages and batch_stage_parameter_readings.
--   No status column; state is held by the engine."
--
--  BATCH_RECORDS ALREADY EXISTS, AND ALREADY HAS A STATUS COLUMN
--  -------------------------------------------------------------
--  20260603100000_batch_release.sql created it with
--
--      status text NOT NULL DEFAULT 'qc_pending'
--        CHECK (status IN ('qc_pending','qc_in_progress','hold',
--                          'released','rejected','archived'))
--
--  and BatchReleasePage reads it today. Dropping the column would break a
--  live screen; leaving it as the source of truth fails item 07.
--
--  So it is demoted to a SERVER-MAINTAINED MIRROR, the same pattern the
--  Week 3 materials tables use: an init trigger on insert, a sync trigger
--  on entity_current_state, and a guard trigger that rejects any direct
--  write. State genuinely lives in the engine; the column is a
--  denormalised read for the existing query, and nobody can set it by
--  hand. The brief's NOT DONE IF — "a status column ... instead of the
--  lifecycle engine" — is about where state LIVES, and after this it
--  lives in the engine.
--
--  ONE LIFECYCLE, NOT TWO
--  ----------------------
--  The existing six states are all post-manufacturing: QC and release.
--  Item 07 adds the execution half. They are not two entities — in GMP
--  the Batch Manufacturing Record IS the document that is later reviewed
--  and released, so one record carries one lifecycle from first stage to
--  final disposition. The existing states are kept with their existing
--  keys so current rows and the existing page are unaffected.
-- ===================================================================


-- ── 1. Batch record: lifecycle, and the columns item 07 adds ─────────

ALTER TABLE public.batch_records
  --  "A customer field on the batch for contract manufacturing."
  ADD COLUMN IF NOT EXISTS customer_name text,
  --  "A batch in progress keeps the version it started on" (item 06).
  --  The link is here rather than inferred from the product, because the
  --  approved formula for a product changes and a running batch must not
  --  follow it.
  ADD COLUMN IF NOT EXISTS formula_id uuid REFERENCES public.master_formulas(id) ON DELETE RESTRICT,
  --  Closure. "Locked permanently on closure" needs a fact to key on that
  --  is not a state the batch can leave again.
  ADD COLUMN IF NOT EXISTS execution_closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS execution_closed_by uuid;

COMMENT ON COLUMN public.batch_records.customer_name IS
  'The customer this batch is manufactured for, when the batch is contract manufacturing. Null for own-product batches.';
COMMENT ON COLUMN public.batch_records.formula_id IS
  'The master formula version this batch was initiated on. A batch keeps its version even after a newer one is approved — that is the point of recording it here rather than looking it up.';
COMMENT ON COLUMN public.batch_records.execution_closed_at IS
  'When manufacturing execution was closed. Once set, stages and readings are frozen and no stage can be reopened. Distinct from release: a closed batch has finished manufacturing and still has QC ahead of it.';

CREATE INDEX IF NOT EXISTS batch_records_formula_idx
  ON public.batch_records(formula_id) WHERE formula_id IS NOT NULL;

--  The status CHECK has to admit the execution states before the mirror
--  can write them.
DO $widen_status$
BEGIN
  ALTER TABLE public.batch_records DROP CONSTRAINT IF EXISTS batch_records_status_check;
  ALTER TABLE public.batch_records ADD CONSTRAINT batch_records_status_check
    CHECK (status IN ('in_progress','execution_complete',
                      'qc_pending','qc_in_progress','hold',
                      'released','rejected','archived'));
END
$widen_status$;

--  The column default was 'qc_pending', which predates the execution
--  half of the lifecycle. The init trigger below overwrites it from the
--  engine's initial state a moment later, so the default is only ever
--  visible inside the INSERT — but the two gates on this table are
--  BEFORE INSERT triggers that read NEW.status, so leaving a default
--  that disagrees with the engine means they judge a state the row
--  never really holds. Aligned rather than left to the trigger.
ALTER TABLE public.batch_records ALTER COLUMN status SET DEFAULT 'in_progress';

DO $batch_lifecycle$
DECLARE
  v_def uuid;
  s_prog uuid; s_exec uuid; s_qcp uuid; s_qci uuid;
  s_hold uuid; s_rel uuid; s_rej uuid; s_arch uuid;
BEGIN
  SELECT id INTO v_def FROM public.lifecycle_definitions
   WHERE entity_type = 'batch_record' AND company_id IS NULL AND version = 1;

  IF v_def IS NULL THEN
    INSERT INTO public.lifecycle_definitions(company_id, entity_type, name, description, version, is_active)
    VALUES (NULL,'batch_record','Batch record lifecycle',
            'A batch manufacturing record from first stage through execution to QC and disposition.',1,true)
    RETURNING id INTO v_def;

    --  in_progress is initial: a batch exists because manufacturing has
    --  started. The engine's initial state is what makes that true
    --  without anyone remembering to set it.
    INSERT INTO public.lifecycle_states(definition_id,state_key,label,description,sort_order,is_initial,is_terminal) VALUES
      (v_def,'in_progress','In progress','Manufacturing under way. Stages may be executed and reopened.',10,true ,false),
      (v_def,'execution_complete','Execution complete','All stages signed off and the record closed. Stages are frozen.',20,false,false),
      (v_def,'qc_pending','QC pending','Awaiting quality review.',30,false,false),
      (v_def,'qc_in_progress','QC in progress','Under quality review.',40,false,false),
      (v_def,'hold','On hold','Suspended pending investigation.',50,false,false),
      (v_def,'released','Released','Released for distribution. Terminal.',60,false,true ),
      (v_def,'rejected','Rejected','Rejected. Terminal.',70,false,true ),
      (v_def,'archived','Archived','Closed out. Terminal.',80,false,true );

    SELECT id INTO s_prog FROM public.lifecycle_states WHERE definition_id=v_def AND state_key='in_progress';
    SELECT id INTO s_exec FROM public.lifecycle_states WHERE definition_id=v_def AND state_key='execution_complete';
    SELECT id INTO s_qcp  FROM public.lifecycle_states WHERE definition_id=v_def AND state_key='qc_pending';
    SELECT id INTO s_qci  FROM public.lifecycle_states WHERE definition_id=v_def AND state_key='qc_in_progress';
    SELECT id INTO s_hold FROM public.lifecycle_states WHERE definition_id=v_def AND state_key='hold';
    SELECT id INTO s_rel  FROM public.lifecycle_states WHERE definition_id=v_def AND state_key='released';
    SELECT id INTO s_rej  FROM public.lifecycle_states WHERE definition_id=v_def AND state_key='rejected';
    SELECT id INTO s_arch FROM public.lifecycle_states WHERE definition_id=v_def AND state_key='archived';

    --  requires_signature is a HARD GATE in this engine, not a hint: a
    --  transition that carries it cannot be made without a consumed
    --  signature, by any caller. So it is set only where the brief asks
    --  for one — item 07 names the operator signature on STAGE
    --  completion, and that is where it goes (see the batch_stage
    --  definition below).
    --
    --  `release` deliberately does NOT carry it. Batch release already
    --  exists from 20260603100000_batch_release.sql and BatchReleasePage
    --  drives it today with no signature; adding the requirement here
    --  would be a new control on a shipped feature that item 07 does not
    --  ask for. It belongs with batch disposition when that item comes
    --  up, together with the QA-authority designation that material lot
    --  release has — a signature without a designated signer is the
    --  weaker half of the control, and shipping half of it is worse than
    --  shipping it whole later.
    INSERT INTO public.lifecycle_transitions
      (definition_id,from_state_id,to_state_id,action_key,label,sort_order,requires_comment,requires_signature) VALUES
      (v_def,s_prog,s_exec,'close_execution','Close execution',       10,false,false),
      (v_def,s_exec,s_qcp ,'submit_for_qc',  'Submit for QC',         20,false,false),
      (v_def,s_qcp ,s_qci ,'start_qc',       'Start QC review',       30,false,false),
      (v_def,s_qci ,s_rel ,'release',        'Release batch',         40,false,false),
      (v_def,s_qci ,s_rej ,'reject',         'Reject batch',          50,true ,false),
      --  A batch held for an investigation that concludes badly is
      --  rejected from hold. Without this row the only way out of hold
      --  is back into review, while BatchReleasePage already offers
      --  "Reject" on a held batch — the definition has to agree with the
      --  screen, or the button throws.
      (v_def,s_hold,s_rej ,'reject',         'Reject batch',          55,true ,false),
      (v_def,s_prog,s_hold,'hold',           'Place on hold',         60,true ,false),
      (v_def,s_qcp ,s_hold,'hold',           'Place on hold',         70,true ,false),
      (v_def,s_qci ,s_hold,'hold',           'Place on hold',         80,true ,false),
      (v_def,s_hold,s_prog,'resume_execution','Resume manufacturing', 90,true ,false),
      (v_def,s_hold,s_qci ,'resume_qc',      'Resume QC review',     100,true ,false),
      (v_def,s_rel ,s_arch,'archive',        'Archive',              110,false,false),
      (v_def,s_rej ,s_arch,'archive',        'Archive',              120,false,false);
  END IF;
END
$batch_lifecycle$;


-- ── 2. The status mirror on batch_records ────────────────────────────
--
--  Three triggers, the same shape as the Week 3 materials mirrors:
--  initialise on insert, follow the engine on transition, and refuse a
--  direct write. The guard is what makes the column a mirror rather than
--  a second source of truth.

CREATE OR REPLACE FUNCTION public.fn_batch_records_lifecycle_init()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_state text;
BEGIN
  PERFORM public.lifecycle_initialize('batch_record', NEW.id, NEW.company_id);

  SELECT s.state_key INTO v_state
    FROM public.entity_current_state ecs
    JOIN public.lifecycle_states s ON s.id = ecs.state_id
   WHERE ecs.entity_type='batch_record' AND ecs.entity_id = NEW.id;

  IF v_state IS NOT NULL THEN
    PERFORM set_config('app.batch_status_sync','1',true);
    UPDATE public.batch_records SET status = v_state WHERE id = NEW.id;
    PERFORM set_config('app.batch_status_sync','',true);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_batch_records_lifecycle_init ON public.batch_records;
CREATE TRIGGER trg_batch_records_lifecycle_init
  AFTER INSERT ON public.batch_records
  FOR EACH ROW EXECUTE FUNCTION public.fn_batch_records_lifecycle_init();

CREATE OR REPLACE FUNCTION public.fn_batch_records_status_sync()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_state text;
BEGIN
  IF NEW.entity_type <> 'batch_record' THEN RETURN NEW; END IF;

  SELECT state_key INTO v_state FROM public.lifecycle_states WHERE id = NEW.state_id;
  IF v_state IS NULL THEN RETURN NEW; END IF;

  PERFORM set_config('app.batch_status_sync','1',true);
  UPDATE public.batch_records SET status = v_state, updated_at = now()
   WHERE id = NEW.entity_id AND status IS DISTINCT FROM v_state;
  PERFORM set_config('app.batch_status_sync','',true);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_batch_records_status_sync ON public.entity_current_state;
CREATE TRIGGER trg_batch_records_status_sync
  AFTER INSERT OR UPDATE ON public.entity_current_state
  FOR EACH ROW EXECUTE FUNCTION public.fn_batch_records_status_sync();

CREATE OR REPLACE FUNCTION public.fn_batch_records_guard_status()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND coalesce(current_setting('app.batch_status_sync', true),'') <> '1' THEN
    RAISE EXCEPTION
      'BATCH_STATUS_READ_ONLY: status is derived from the lifecycle engine; use lifecycle_transition() instead of writing it'
      USING ERRCODE = 'P0001';
  END IF;

  --  "Locked permanently on closure." Everything downstream — the stage
  --  freeze, the reading freeze, the refusal to reopen — keys on
  --  execution_closed_at, so a writer who can clear it can unlock the
  --  whole record with one UPDATE. Permanent has to mean permanent here
  --  or it means nothing anywhere else.
  IF OLD.execution_closed_at IS NOT NULL
     AND NEW.execution_closed_at IS DISTINCT FROM OLD.execution_closed_at THEN
    RAISE EXCEPTION
      'BATCH_CLOSED: batch record % was closed at % and closure cannot be cleared or moved',
      OLD.id, OLD.execution_closed_at USING ERRCODE = 'P0001';
  END IF;

  --  A closed record must not return to manufacturing. The engine permits
  --  hold -> in_progress, which is right for a batch held mid-execution
  --  and wrong for one whose stages are already frozen: it would leave a
  --  record that says "in manufacturing" and refuses every manufacturing
  --  write. Refused here rather than by removing the transition, because
  --  the transition is correct for the case it was added for.
  IF OLD.execution_closed_at IS NOT NULL
     AND NEW.status = 'in_progress' AND OLD.status IS DISTINCT FROM 'in_progress' THEN
    RAISE EXCEPTION
      'BATCH_CLOSED: batch record % was closed at % and cannot return to manufacturing',
      OLD.id, OLD.execution_closed_at USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_batch_records_guard_status ON public.batch_records;
CREATE TRIGGER trg_batch_records_guard_status
  BEFORE UPDATE ON public.batch_records
  FOR EACH ROW EXECUTE FUNCTION public.fn_batch_records_guard_status();

--  Rows that predate the engine have a status but no lifecycle row, so
--  they would be invisible to every transition. Seeded from the status
--  they already carry rather than reset to the initial state, which
--  would quietly move released batches back into manufacturing.
DO $backfill$
DECLARE r record; v_def uuid; v_state uuid;
BEGIN
  SELECT id INTO v_def FROM public.lifecycle_definitions
   WHERE entity_type='batch_record' AND company_id IS NULL AND version=1;
  IF v_def IS NULL THEN RETURN; END IF;

  FOR r IN
    SELECT b.id, b.company_id, b.status
      FROM public.batch_records b
      LEFT JOIN public.entity_current_state e
        ON e.entity_type='batch_record' AND e.entity_id=b.id
     WHERE e.entity_id IS NULL
  LOOP
    SELECT id INTO v_state FROM public.lifecycle_states
     WHERE definition_id=v_def AND state_key = r.status;
    IF v_state IS NULL THEN CONTINUE; END IF;

    INSERT INTO public.entity_current_state(entity_type, entity_id, company_id, definition_id, state_id, entered_at)
    VALUES ('batch_record', r.id, r.company_id, v_def, v_state, now())
    ON CONFLICT DO NOTHING;
  END LOOP;
END
$backfill$;


-- ── 3. batch_stages ──────────────────────────────────────────────────

DO $stage_lifecycle$
DECLARE v_def uuid; s_pend uuid; s_prog uuid; s_done uuid;
BEGIN
  SELECT id INTO v_def FROM public.lifecycle_definitions
   WHERE entity_type='batch_stage' AND company_id IS NULL AND version=1;

  IF v_def IS NULL THEN
    INSERT INTO public.lifecycle_definitions(company_id, entity_type, name, description, version, is_active)
    VALUES (NULL,'batch_stage','Batch stage lifecycle',
            'One manufacturing stage of a batch, from pending through execution to signed completion.',1,true)
    RETURNING id INTO v_def;

    INSERT INTO public.lifecycle_states(definition_id,state_key,label,description,sort_order,is_initial,is_terminal) VALUES
      (v_def,'pending','Pending','Instantiated from the formula, not yet started.',10,true ,false),
      (v_def,'in_progress','In progress','Being executed.',                        20,false,false),
      (v_def,'complete','Complete','Signed off. Reopenable until the batch closes.',30,false,false);

    SELECT id INTO s_pend FROM public.lifecycle_states WHERE definition_id=v_def AND state_key='pending';
    SELECT id INTO s_prog FROM public.lifecycle_states WHERE definition_id=v_def AND state_key='in_progress';
    SELECT id INTO s_done FROM public.lifecycle_states WHERE definition_id=v_def AND state_key='complete';

    --  `complete` requires a signature, which is where item 07's
    --  "completion needs the operator signature" is enforced. The
    --  verifier is a separate check in batch_stage_complete(), because
    --  the engine knows about one actor per transition and the rule here
    --  is about two.
    INSERT INTO public.lifecycle_transitions
      (definition_id,from_state_id,to_state_id,action_key,label,sort_order,requires_comment,requires_signature) VALUES
      (v_def,s_pend,s_prog,'start',   'Start stage',    10,false,false),
      (v_def,s_prog,s_done,'complete','Complete stage', 20,false,true ),
      (v_def,s_done,s_prog,'reopen',  'Reopen stage',   30,true ,false);
  END IF;
END
$stage_lifecycle$;

CREATE TABLE IF NOT EXISTS public.batch_stages (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id             uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  batch_id               uuid NOT NULL REFERENCES public.batch_records(id) ON DELETE CASCADE,
  --  Which formula stage this was instantiated from. RESTRICT because a
  --  stage definition that produced an executed stage is part of the
  --  record of what was done.
  formula_stage_id       uuid REFERENCES public.master_formula_stages(id) ON DELETE RESTRICT,
  sequence_no            integer NOT NULL,
  name                   text NOT NULL,
  --  Carried from the formula stage at instantiation rather than read
  --  through: the formula can be superseded, and what this stage
  --  required is a fact about this batch.
  requires_verifier      boolean NOT NULL DEFAULT false,
  status                 text NOT NULL DEFAULT 'pending',
  started_at             timestamptz,
  started_by             uuid,
  completed_at           timestamptz,
  operator_id            uuid,
  operator_signature_id  uuid REFERENCES public.electronic_signatures(id) ON DELETE RESTRICT,
  verifier_id            uuid,
  verifier_signature_id  uuid REFERENCES public.electronic_signatures(id) ON DELETE RESTRICT,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT batch_stages_seq_uniq UNIQUE (batch_id, sequence_no)
);

COMMENT ON TABLE public.batch_stages IS
  'The stages of one batch, instantiated from the approved formula at initiation. Sequence is enforced in batch_stage_start(), not in the interface.';

--  "The same user can sign as operator and as verifier" is a NOT DONE
--  IF, so it is a table constraint and not only a check in the RPC. A
--  constraint cannot be bypassed by any path into the table.
--
--  Declared here rather than inside the CREATE TABLE above, because that
--  statement is CREATE TABLE IF NOT EXISTS: on a database that already
--  has the table the whole body is skipped, so a constraint written
--  inside it would never arrive — and if it were ever dropped, re-running
--  this migration would not put it back. Mutation testing found that
--  exact hole.
DO $stage_checks$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='batch_stages_verifier_distinct_chk') THEN
    ALTER TABLE public.batch_stages ADD CONSTRAINT batch_stages_verifier_distinct_chk
      CHECK (verifier_id IS NULL OR operator_id IS NULL OR verifier_id <> operator_id);
  END IF;
END
$stage_checks$;

COMMENT ON CONSTRAINT batch_stages_verifier_distinct_chk ON public.batch_stages IS
  'Item 07: "The same user can sign as operator and as verifier" is a NOT DONE IF. A CHECK rather than only an RPC test, so no write path can produce a self-verified stage.';

CREATE INDEX IF NOT EXISTS batch_stages_batch_idx ON public.batch_stages(batch_id, sequence_no);
CREATE INDEX IF NOT EXISTS batch_stages_company_idx ON public.batch_stages(company_id);

ALTER TABLE public.batch_stages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS batch_stages_select ON public.batch_stages;
CREATE POLICY batch_stages_select ON public.batch_stages FOR SELECT TO authenticated
  USING (public.app_is_company_member(company_id));
DROP POLICY IF EXISTS batch_stages_write ON public.batch_stages;
CREATE POLICY batch_stages_write ON public.batch_stages FOR ALL TO authenticated
  USING (public.app_is_company_member(company_id))
  WITH CHECK (public.app_is_company_member(company_id));


-- ── 4. batch_stage_parameter_readings ────────────────────────────────

CREATE TABLE IF NOT EXISTS public.batch_stage_parameter_readings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  batch_stage_id      uuid NOT NULL REFERENCES public.batch_stages(id) ON DELETE CASCADE,
  formula_parameter_id uuid REFERENCES public.master_formula_stage_parameters(id) ON DELETE RESTRICT,
  parameter_name      text NOT NULL,
  --  Copied from the formula parameter, not joined through. Item 06 is
  --  explicit that parameter_type "decides how out-of-specification is
  --  handled" — item 11 reads it to decide whether a reading is merely
  --  flagged or is a machine setting, and that decision must reflect the
  --  formula as it was when the reading was taken.
  parameter_type      text NOT NULL
    CHECK (parameter_type IN ('machine_setting','product_attribute')),
  unit                text,
  target_value        numeric,
  min_value           numeric,
  max_value           numeric,
  reading_value       numeric,
  reading_text        text,
  --  Computed on write by the trigger below rather than trusted from the
  --  caller: whether a reading is in specification is a property of the
  --  numbers, not an opinion the client gets to supply.
  in_specification    boolean,
  recorded_by         uuid,
  recorded_at         timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now()
);

--  Outside the CREATE TABLE for the reason given above the stage CHECK:
--  IF NOT EXISTS skips the whole body on a database that already has the
--  table, so a constraint declared inside it is a constraint that only
--  ever reaches a fresh database.
DO $reading_checks$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='bspr_has_a_reading_chk') THEN
    ALTER TABLE public.batch_stage_parameter_readings ADD CONSTRAINT bspr_has_a_reading_chk
      CHECK (reading_value IS NOT NULL OR (reading_text IS NOT NULL AND btrim(reading_text) <> ''));
  END IF;
END
$reading_checks$;

COMMENT ON TABLE public.batch_stage_parameter_readings IS
  'Readings taken against a stage''s parameters. Item 07 creates the table; item 11 adds sampling frequency, sequence numbering and weight-zone classification on top of it.';

CREATE INDEX IF NOT EXISTS bspr_stage_idx ON public.batch_stage_parameter_readings(batch_stage_id);
CREATE INDEX IF NOT EXISTS bspr_company_idx ON public.batch_stage_parameter_readings(company_id);

ALTER TABLE public.batch_stage_parameter_readings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bspr_select ON public.batch_stage_parameter_readings;
CREATE POLICY bspr_select ON public.batch_stage_parameter_readings FOR SELECT TO authenticated
  USING (public.app_is_company_member(company_id));
DROP POLICY IF EXISTS bspr_write ON public.batch_stage_parameter_readings;
CREATE POLICY bspr_write ON public.batch_stage_parameter_readings FOR ALL TO authenticated
  USING (public.app_is_company_member(company_id))
  WITH CHECK (public.app_is_company_member(company_id));

CREATE OR REPLACE FUNCTION public.fn_bspr_evaluate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.reading_value IS NULL THEN
    NEW.in_specification := NULL;   -- a textual reading has no numeric limits
  ELSIF NEW.min_value IS NULL AND NEW.max_value IS NULL THEN
    NEW.in_specification := NULL;   -- no limits recorded: unknown, not "in spec"
  ELSE
    NEW.in_specification :=
      (NEW.min_value IS NULL OR NEW.reading_value >= NEW.min_value) AND
      (NEW.max_value IS NULL OR NEW.reading_value <= NEW.max_value);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bspr_evaluate ON public.batch_stage_parameter_readings;
CREATE TRIGGER trg_bspr_evaluate
  BEFORE INSERT OR UPDATE ON public.batch_stage_parameter_readings
  FOR EACH ROW EXECUTE FUNCTION public.fn_bspr_evaluate();


-- ── 5. Corrections: append-only, both values kept ────────────────────
--
--  "A correction overwrites the original value" is a NOT DONE IF, so a
--  correction is a new row carrying both values and never an UPDATE of
--  the thing corrected.

CREATE TABLE IF NOT EXISTS public.batch_stage_corrections (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  batch_stage_id  uuid NOT NULL REFERENCES public.batch_stages(id) ON DELETE RESTRICT,
  field_name      text NOT NULL,
  original_value  text,
  new_value       text,
  reason          text NOT NULL CHECK (btrim(reason) <> ''),
  corrected_by    uuid NOT NULL,
  corrected_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.batch_stage_corrections IS
  'Append-only log of stage reopenings and corrections: who, when, what it was, what it became, and why. Item 07 requires all five. UPDATE and DELETE are revoked, so the original value cannot be lost.';

CREATE INDEX IF NOT EXISTS bsc_stage_idx ON public.batch_stage_corrections(batch_stage_id, corrected_at DESC);

ALTER TABLE public.batch_stage_corrections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bsc_select ON public.batch_stage_corrections;
CREATE POLICY bsc_select ON public.batch_stage_corrections FOR SELECT TO authenticated
  USING (public.app_is_company_member(company_id));
DROP POLICY IF EXISTS bsc_insert ON public.batch_stage_corrections;
CREATE POLICY bsc_insert ON public.batch_stage_corrections FOR INSERT TO authenticated
  WITH CHECK (public.app_is_company_member(company_id));

--  No UPDATE or DELETE policy, and the grants are revoked too: a
--  correction log that can be edited is not a correction log.
REVOKE UPDATE, DELETE, TRUNCATE ON public.batch_stage_corrections FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.fn_bsc_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'BATCH_CORRECTION_IMMUTABLE: a correction cannot be % once written', lower(TG_OP)
    USING ERRCODE = 'P0001';
END;
$$;

DROP TRIGGER IF EXISTS trg_bsc_immutable ON public.batch_stage_corrections;
CREATE TRIGGER trg_bsc_immutable
  BEFORE UPDATE OR DELETE ON public.batch_stage_corrections
  FOR EACH ROW EXECUTE FUNCTION public.fn_bsc_immutable();


-- ── 6. Freeze on closure ─────────────────────────────────────────────
--
--  "Locked permanently on closure." Keyed on execution_closed_at rather
--  than on a state the batch could leave again.

CREATE OR REPLACE FUNCTION public.fn_batch_stage_freeze()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE v_closed timestamptz; v_batch uuid;
BEGIN
  v_batch := CASE TG_OP WHEN 'DELETE' THEN OLD.batch_id ELSE NEW.batch_id END;
  SELECT execution_closed_at INTO v_closed FROM public.batch_records WHERE id = v_batch;

  IF v_closed IS NOT NULL THEN
    RAISE EXCEPTION
      'BATCH_CLOSED: batch record % was closed at % and its stages are permanently locked',
      v_batch, v_closed USING ERRCODE = 'P0001';
  END IF;
  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS trg_batch_stage_freeze ON public.batch_stages;
CREATE TRIGGER trg_batch_stage_freeze
  BEFORE UPDATE OR DELETE ON public.batch_stages
  FOR EACH ROW EXECUTE FUNCTION public.fn_batch_stage_freeze();

CREATE OR REPLACE FUNCTION public.fn_bspr_freeze()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE v_closed timestamptz; v_stage uuid;
BEGIN
  v_stage := CASE TG_OP WHEN 'DELETE' THEN OLD.batch_stage_id ELSE NEW.batch_stage_id END;
  SELECT b.execution_closed_at INTO v_closed
    FROM public.batch_stages s JOIN public.batch_records b ON b.id = s.batch_id
   WHERE s.id = v_stage;

  IF v_closed IS NOT NULL THEN
    RAISE EXCEPTION 'BATCH_CLOSED: the batch was closed at % and its readings are permanently locked',
      v_closed USING ERRCODE = 'P0001';
  END IF;
  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS trg_bspr_freeze ON public.batch_stage_parameter_readings;
CREATE TRIGGER trg_bspr_freeze
  BEFORE INSERT OR UPDATE OR DELETE ON public.batch_stage_parameter_readings
  FOR EACH ROW EXECUTE FUNCTION public.fn_bspr_freeze();


-- ── 7. The stage status mirror ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_batch_stages_lifecycle_init()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_state text;
BEGIN
  PERFORM public.lifecycle_initialize('batch_stage', NEW.id, NEW.company_id);
  SELECT s.state_key INTO v_state
    FROM public.entity_current_state ecs
    JOIN public.lifecycle_states s ON s.id = ecs.state_id
   WHERE ecs.entity_type='batch_stage' AND ecs.entity_id = NEW.id;
  IF v_state IS NOT NULL THEN
    PERFORM set_config('app.batch_status_sync','1',true);
    UPDATE public.batch_stages SET status = v_state WHERE id = NEW.id;
    PERFORM set_config('app.batch_status_sync','',true);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_batch_stages_lifecycle_init ON public.batch_stages;
CREATE TRIGGER trg_batch_stages_lifecycle_init
  AFTER INSERT ON public.batch_stages
  FOR EACH ROW EXECUTE FUNCTION public.fn_batch_stages_lifecycle_init();

CREATE OR REPLACE FUNCTION public.fn_batch_stages_status_sync()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_state text;
BEGIN
  IF NEW.entity_type <> 'batch_stage' THEN RETURN NEW; END IF;
  SELECT state_key INTO v_state FROM public.lifecycle_states WHERE id = NEW.state_id;
  IF v_state IS NULL THEN RETURN NEW; END IF;
  PERFORM set_config('app.batch_status_sync','1',true);
  UPDATE public.batch_stages SET status = v_state, updated_at = now()
   WHERE id = NEW.entity_id AND status IS DISTINCT FROM v_state;
  PERFORM set_config('app.batch_status_sync','',true);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_batch_stages_status_sync ON public.entity_current_state;
CREATE TRIGGER trg_batch_stages_status_sync
  AFTER INSERT OR UPDATE ON public.entity_current_state
  FOR EACH ROW EXECUTE FUNCTION public.fn_batch_stages_status_sync();

CREATE OR REPLACE FUNCTION public.fn_batch_stages_guard_status()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND coalesce(current_setting('app.batch_status_sync', true),'') <> '1' THEN
    RAISE EXCEPTION
      'BATCH_STAGE_STATUS_READ_ONLY: status is derived from the lifecycle engine; use lifecycle_transition() instead of writing it'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_batch_stages_guard_status ON public.batch_stages;
CREATE TRIGGER trg_batch_stages_guard_status
  BEFORE UPDATE ON public.batch_stages
  FOR EACH ROW EXECUTE FUNCTION public.fn_batch_stages_guard_status();


-- ── 8. A reading cannot be overwritten ───────────────────────────────
--
--  "A correction overwrites the original value" is a NOT DONE IF, and
--  the freeze above only bites after closure. Before closure the table
--  would happily take an UPDATE, so the value itself is made immutable:
--  a correction is a NEW row that points back at what it replaces, and
--  both numbers survive.

ALTER TABLE public.batch_stage_parameter_readings
  ADD COLUMN IF NOT EXISTS corrected_from_id uuid
    REFERENCES public.batch_stage_parameter_readings(id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.batch_stage_parameter_readings.corrected_from_id IS
  'The reading this one corrects. Set by batch_stage_correct_reading(); the superseded row stays exactly as recorded, which is the whole point.';

CREATE INDEX IF NOT EXISTS bspr_corrected_from_idx
  ON public.batch_stage_parameter_readings(corrected_from_id)
  WHERE corrected_from_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.fn_bspr_value_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.reading_value   IS DISTINCT FROM OLD.reading_value
     OR NEW.reading_text IS DISTINCT FROM OLD.reading_text THEN
    RAISE EXCEPTION
      'BATCH_READING_IMMUTABLE: a recorded reading cannot be overwritten; record a correction instead, which keeps both values'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bspr_value_immutable ON public.batch_stage_parameter_readings;
CREATE TRIGGER trg_bspr_value_immutable
  BEFORE UPDATE ON public.batch_stage_parameter_readings
  FOR EACH ROW EXECUTE FUNCTION public.fn_bspr_value_immutable();


-- ── 9. The RPCs ──────────────────────────────────────────────────────
--
--  Every one of them is SECURITY DEFINER with a membership check, for
--  the reason the licence gate's comment gives: the browser holds the
--  anon key and talks straight to PostgREST, so a rule that lives only
--  in src/lib is a suggestion. The sequence rule, the verifier rule and
--  the closure rule are all enforced here AND, where a constraint can
--  express them, in the table.


--  ── batch_record_initiate ───────────────────────────────────────────
--  Creates the batch and instantiates its stages from the approved
--  formula, copying what each stage required rather than pointing at a
--  definition that can be superseded mid-batch.
CREATE OR REPLACE FUNCTION public.batch_record_initiate(
  p_company_id         uuid,
  p_batch_number       text,
  p_product_id         uuid,
  p_manufacturing_date date,
  p_expiry_date        date,
  p_batch_size         numeric,
  p_unit               text DEFAULT 'kg',
  p_customer_name      text DEFAULT NULL,
  p_formula_id         uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor   uuid := auth.uid();
  v_batch   uuid;
  v_formula record;
  v_product record;
  v_stages  integer := 0;
BEGIN
  IF NOT public.app_is_service_context()
     AND NOT public.app_is_company_member(p_company_id) THEN
    RAISE EXCEPTION 'BATCH_FORBIDDEN: caller is not a member of the owning company'
      USING ERRCODE = 'P0001';
  END IF;

  IF coalesce(btrim(p_batch_number),'') = '' THEN
    RAISE EXCEPTION 'BATCH_NO_NUMBER: a batch record needs a batch number'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT id, company_id, trade_name, product_code INTO v_product
    FROM public.products WHERE id = p_product_id;
  IF v_product.id IS NULL THEN
    RAISE EXCEPTION 'BATCH_NO_PRODUCT: no such product %', p_product_id USING ERRCODE = 'P0002';
  END IF;
  IF v_product.company_id <> p_company_id THEN
    RAISE EXCEPTION 'BATCH_PRODUCT_FOREIGN: product % belongs to another company', p_product_id
      USING ERRCODE = 'P0001';
  END IF;

  --  "Initiation requires ... a registered product."
  --
  --  A NOTE ON THIS CLAUSE, because it is worth recording rather than
  --  implementing silently: a validation batch is manufactured BEFORE
  --  registration — the dossier NAFDAC registers is built from batches
  --  that were already made — so "no commercial manufacturing without a
  --  registration" is right and "no batch record without a registration"
  --  is not. The precondition is therefore on THIS path, which is routine
  --  commercial initiation, and not a bar on the table: a pre-registration
  --  batch can still be recorded by the direct insert the existing screen
  --  uses, and fn_batch_records_product_gate() refuses to release it.
  --
  --  product_is_release_eligible() is reused rather than reimplemented. It
  --  is named for release but says exactly the right thing — "lifecycle
  --  state registered or active, and registration not expired", per its
  --  own comment, "may progress into regulated operations".
  IF NOT public.product_is_release_eligible(p_product_id) THEN
    RAISE EXCEPTION
      'BATCH_PRODUCT_NOT_REGISTERED: product % is "%" and a batch cannot be initiated against it',
      coalesce(v_product.product_code,'?'),
      coalesce((SELECT status FROM public.products WHERE id = p_product_id),'unknown')
      USING ERRCODE = 'P0001';
  END IF;

  --  "A batch in progress keeps the version it started on." Resolved
  --  once, here, and stored — not looked up later, because by then the
  --  approved formula may be a different one.
  IF p_formula_id IS NULL THEN
    SELECT id, company_id, product_id, status, version INTO v_formula
      FROM public.master_formulas
     WHERE product_id = p_product_id AND status = 'approved';
  ELSE
    SELECT id, company_id, product_id, status, version INTO v_formula
      FROM public.master_formulas WHERE id = p_formula_id;
  END IF;

  --  "Initiation requires an approved formula." Demanded, not preferred:
  --  a batch with no formula behind it has no stages to execute, so the
  --  rest of item 07 has nothing to work on. The legacy path that creates
  --  a batch without one still exists — see the trigger below for what
  --  that path is held to — but this RPC is the initiation the brief is
  --  describing, and it refuses.
  IF v_formula.id IS NULL THEN
    RAISE EXCEPTION
      'BATCH_NO_APPROVED_FORMULA: product "%" has no approved master formula, so a batch cannot be initiated against it',
      coalesce(v_product.product_code, p_product_id::text) USING ERRCODE = 'P0001';
  END IF;

  IF v_formula.company_id <> p_company_id THEN
    RAISE EXCEPTION 'BATCH_FORMULA_FOREIGN: formula % belongs to another company', v_formula.id
      USING ERRCODE = 'P0001';
  END IF;
  IF v_formula.product_id <> p_product_id THEN
    RAISE EXCEPTION 'BATCH_FORMULA_WRONG_PRODUCT: formula % is for a different product', v_formula.id
      USING ERRCODE = 'P0001';
  END IF;
  IF v_formula.status <> 'approved' THEN
    RAISE EXCEPTION
      'BATCH_FORMULA_NOT_APPROVED: formula version % is "%", so a batch cannot be manufactured to it',
      v_formula.version, v_formula.status USING ERRCODE = 'P0001';
  END IF;

  --  "a registered product and an unexpired licence" are both enforced by
  --  BEFORE INSERT triggers on this table rather than checked here, so
  --  the INSERT below is what refuses them — for every writer, not only
  --  for callers of this function.
  --  product_name and product_code are copied from the registry rather
  --  than taken from the caller: batch_records predates the registry and
  --  carries them as free text, and a batch whose printed name disagrees
  --  with the registered product is the exact confusion the registry was
  --  added to end.
  INSERT INTO public.batch_records
    (company_id, batch_number, product_name, product_code, product_id, formula_id,
     manufacturing_date, expiry_date, batch_size, unit, customer_name, created_by)
  VALUES
    (p_company_id, btrim(p_batch_number), v_product.trade_name, v_product.product_code,
     p_product_id, v_formula.id,
     p_manufacturing_date, p_expiry_date, p_batch_size, coalesce(p_unit,'kg'),
     nullif(btrim(coalesce(p_customer_name,'')),''), v_actor)
  RETURNING id INTO v_batch;

  IF v_formula.id IS NOT NULL THEN
    INSERT INTO public.batch_stages
      (company_id, batch_id, formula_stage_id, sequence_no, name, requires_verifier)
    SELECT p_company_id, v_batch, s.id, s.sequence_no, s.name, s.requires_signoff
      FROM public.master_formula_stages s
     WHERE s.formula_id = v_formula.id
     ORDER BY s.sequence_no;
    GET DIAGNOSTICS v_stages = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'batch_id', v_batch,
    'formula_id', v_formula.id, 'formula_version', v_formula.version,
    'stages', v_stages);
END;
$$;

COMMENT ON FUNCTION public.batch_record_initiate(uuid,text,uuid,date,date,numeric,text,text,uuid) IS
  'Initiates a batch record against the approved master formula for the product and instantiates its stages, copying each stage''s name, sequence and sign-off requirement so a later formula revision cannot change what a running batch was told to do.';

REVOKE ALL ON FUNCTION public.batch_record_initiate(uuid,text,uuid,date,date,numeric,text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.batch_record_initiate(uuid,text,uuid,date,date,numeric,text,text,uuid)
  TO authenticated, service_role;


--  ── a shared preamble for the stage RPCs ────────────────────────────
--  Resolves the stage, checks membership, and refuses outright if the
--  batch has been closed. Written once because three RPCs need exactly
--  this and a rule repeated three times is a rule that drifts.
CREATE OR REPLACE FUNCTION public.batch_stage_context(p_stage_id uuid)
RETURNS TABLE (
  stage_id uuid, batch_id uuid, company_id uuid, sequence_no integer,
  status text, requires_verifier boolean, operator_id uuid, closed_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE r record;
BEGIN
  SELECT s.id, s.batch_id, s.company_id, s.sequence_no, s.status,
         s.requires_verifier, s.operator_id, b.execution_closed_at
    INTO r
    FROM public.batch_stages s
    JOIN public.batch_records b ON b.id = s.batch_id
   WHERE s.id = p_stage_id;

  IF r.id IS NULL THEN
    RAISE EXCEPTION 'BATCH_NO_STAGE: no such stage %', p_stage_id USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.app_is_service_context()
     AND NOT public.app_is_company_member(r.company_id) THEN
    RAISE EXCEPTION 'BATCH_FORBIDDEN: caller is not a member of the owning company'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY SELECT r.id, r.batch_id, r.company_id, r.sequence_no, r.status,
                      r.requires_verifier, r.operator_id, r.execution_closed_at;
END;
$$;

REVOKE ALL ON FUNCTION public.batch_stage_context(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.batch_stage_context(uuid) TO authenticated, service_role;


--  ── batch_stage_start ───────────────────────────────────────────────
--  "Sequence enforced in the interface only" is a NOT DONE IF, so the
--  order is enforced here: a stage cannot start while an earlier one of
--  the same batch is unfinished.
CREATE OR REPLACE FUNCTION public.batch_stage_start(p_stage_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE c record; v_actor uuid := auth.uid(); v_blocker record; v_res jsonb;
BEGIN
  SELECT * INTO c FROM public.batch_stage_context(p_stage_id);

  IF c.closed_at IS NOT NULL THEN
    RAISE EXCEPTION 'BATCH_CLOSED: batch % was closed at % and no stage can be started',
      c.batch_id, c.closed_at USING ERRCODE = 'P0001';
  END IF;

  SELECT s.sequence_no, s.name, s.status INTO v_blocker
    FROM public.batch_stages s
   WHERE s.batch_id = c.batch_id
     AND s.sequence_no < c.sequence_no
     AND s.status <> 'complete'
   ORDER BY s.sequence_no
   LIMIT 1;

  IF v_blocker.sequence_no IS NOT NULL THEN
    RAISE EXCEPTION
      'BATCH_STAGE_OUT_OF_SEQUENCE: stage % ("%") is % and must be completed before stage % can start',
      v_blocker.sequence_no, v_blocker.name, v_blocker.status, c.sequence_no
      USING ERRCODE = 'P0001';
  END IF;

  v_res := public.lifecycle_transition('batch_stage', p_stage_id, 'start', c.company_id, v_actor);

  UPDATE public.batch_stages
     SET started_at = coalesce(started_at, now()), started_by = coalesce(started_by, v_actor)
   WHERE id = p_stage_id;

  RETURN v_res;
END;
$$;

COMMENT ON FUNCTION public.batch_stage_start(uuid) IS
  'Starts a stage, refusing it while any earlier stage of the same batch is incomplete. The sequence rule lives here rather than in the interface, because the interface is not the only writer.';

REVOKE ALL ON FUNCTION public.batch_stage_start(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.batch_stage_start(uuid) TO authenticated, service_role;


--  ── batch_stage_complete ────────────────────────────────────────────
--  The operator signature is required by the engine (the `complete`
--  transition carries requires_signature). The verifier is checked here,
--  because the engine knows about one actor per transition and this rule
--  is about two — and the table's CHECK catches it again on any path.
CREATE OR REPLACE FUNCTION public.batch_stage_complete(
  p_stage_id              uuid,
  p_operator_signature_id uuid,
  p_verifier_id           uuid DEFAULT NULL,
  p_verifier_signature_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE c record; v_actor uuid := auth.uid(); v_sig record; v_res jsonb;
BEGIN
  SELECT * INTO c FROM public.batch_stage_context(p_stage_id);

  IF c.closed_at IS NOT NULL THEN
    RAISE EXCEPTION 'BATCH_CLOSED: batch % was closed at % and no stage can be completed',
      c.batch_id, c.closed_at USING ERRCODE = 'P0001';
  END IF;

  IF c.requires_verifier THEN
    IF p_verifier_id IS NULL OR p_verifier_signature_id IS NULL THEN
      RAISE EXCEPTION
        'BATCH_STAGE_VERIFIER_REQUIRED: stage % requires a second person to verify it, with their own signature',
        c.sequence_no USING ERRCODE = 'P0001';
    END IF;

    --  The NOT DONE IF, in words: "The same user can sign as operator
    --  and as verifier."
    IF p_verifier_id = coalesce(v_actor, '00000000-0000-0000-0000-000000000000'::uuid) THEN
      RAISE EXCEPTION
        'BATCH_STAGE_SELF_VERIFIED: the operator cannot also be the verifier'
        USING ERRCODE = 'P0001';
    END IF;

    --  A verifier signature that belongs to somebody else, or to another
    --  record, would make the second check decorative.
    SELECT signer_id, entity_type, entity_id, company_id INTO v_sig
      FROM public.electronic_signatures WHERE id = p_verifier_signature_id;
    IF v_sig.signer_id IS NULL THEN
      RAISE EXCEPTION 'BATCH_STAGE_VERIFIER_SIGNATURE_INVALID: no such signature %',
        p_verifier_signature_id USING ERRCODE = 'P0002';
    END IF;
    IF v_sig.signer_id <> p_verifier_id
       OR v_sig.entity_type <> 'batch_stage'
       OR v_sig.entity_id <> p_stage_id
       OR v_sig.company_id <> c.company_id THEN
      RAISE EXCEPTION
        'BATCH_STAGE_VERIFIER_SIGNATURE_MISMATCH: that signature was not given by the named verifier for this stage'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  --  Written BEFORE the transition: the engine consumes the operator
  --  signature and the record hash covers entity_current_state, not this
  --  table, so these writes cannot make the signature stale.
  UPDATE public.batch_stages
     SET operator_id            = v_actor,
         operator_signature_id  = p_operator_signature_id,
         verifier_id            = p_verifier_id,
         verifier_signature_id  = p_verifier_signature_id,
         completed_at           = now()
   WHERE id = p_stage_id;

  v_res := public.lifecycle_transition('batch_stage', p_stage_id, 'complete',
                                       c.company_id, v_actor, NULL, '{}'::jsonb,
                                       p_operator_signature_id);
  RETURN v_res;
END;
$$;

COMMENT ON FUNCTION public.batch_stage_complete(uuid,uuid,uuid,uuid) IS
  'Completes a stage with the operator''s electronic signature, and where the stage was instantiated as requiring verification, a second signature from a different person. Refuses a self-verified stage.';

REVOKE ALL ON FUNCTION public.batch_stage_complete(uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.batch_stage_complete(uuid,uuid,uuid,uuid) TO authenticated, service_role;


--  ── batch_stage_reopen ──────────────────────────────────────────────
--  Reopening is itself a recorded correction: who, when, from what, to
--  what, and why. Refused once the batch is closed.
CREATE OR REPLACE FUNCTION public.batch_stage_reopen(
  p_stage_id uuid,
  p_reason   text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE c record; v_actor uuid := auth.uid(); v_res jsonb;
BEGIN
  SELECT * INTO c FROM public.batch_stage_context(p_stage_id);

  IF c.closed_at IS NOT NULL THEN
    RAISE EXCEPTION
      'BATCH_CLOSED: batch % was closed at % and its stages are permanently locked',
      c.batch_id, c.closed_at USING ERRCODE = 'P0001';
  END IF;

  IF coalesce(btrim(p_reason),'') = '' THEN
    RAISE EXCEPTION 'BATCH_STAGE_REOPEN_NO_REASON: reopening a completed stage requires a reason'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.batch_stage_corrections
    (company_id, batch_stage_id, field_name, original_value, new_value, reason, corrected_by)
  VALUES (c.company_id, p_stage_id, 'status', c.status, 'in_progress',
          btrim(p_reason), coalesce(v_actor,'00000000-0000-0000-0000-000000000000'::uuid));

  v_res := public.lifecycle_transition('batch_stage', p_stage_id, 'reopen',
                                       c.company_id, v_actor, btrim(p_reason));
  RETURN v_res;
END;
$$;

COMMENT ON FUNCTION public.batch_stage_reopen(uuid,text) IS
  'Reopens a completed stage, logging the reopening in batch_stage_corrections first. Refused once execution is closed.';

REVOKE ALL ON FUNCTION public.batch_stage_reopen(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.batch_stage_reopen(uuid,text) TO authenticated, service_role;


--  ── batch_stage_record_reading ──────────────────────────────────────
--  The limits and the parameter type are COPIED FROM THE FORMULA here
--  and never taken from the caller. A client that supplies its own
--  acceptance criteria can declare anything in specification, which
--  would make in_specification worthless.
CREATE OR REPLACE FUNCTION public.batch_stage_record_reading(
  p_stage_id             uuid,
  p_formula_parameter_id uuid,
  p_reading_value        numeric DEFAULT NULL,
  p_reading_text         text    DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE c record; v_actor uuid := auth.uid(); p record; v_id uuid;
BEGIN
  SELECT * INTO c FROM public.batch_stage_context(p_stage_id);

  IF c.closed_at IS NOT NULL THEN
    RAISE EXCEPTION 'BATCH_CLOSED: batch % was closed at % and its readings are permanently locked',
      c.batch_id, c.closed_at USING ERRCODE = 'P0001';
  END IF;

  IF c.status <> 'in_progress' THEN
    RAISE EXCEPTION
      'BATCH_STAGE_NOT_IN_PROGRESS: stage % is %, so a reading cannot be taken against it',
      c.sequence_no, c.status USING ERRCODE = 'P0001';
  END IF;

  SELECT fp.id, fp.parameter, fp.parameter_type, fp.unit,
         fp.target_value, fp.min_value, fp.max_value, fs.id AS stage_def
    INTO p
    FROM public.master_formula_stage_parameters fp
    JOIN public.master_formula_stages fs ON fs.id = fp.stage_id
   WHERE fp.id = p_formula_parameter_id;

  IF p.id IS NULL THEN
    RAISE EXCEPTION 'BATCH_NO_PARAMETER: no such formula parameter %', p_formula_parameter_id
      USING ERRCODE = 'P0002';
  END IF;

  --  A reading recorded against a parameter of some other stage would
  --  attach a number to the wrong acceptance criterion.
  IF p.stage_def IS DISTINCT FROM
       (SELECT formula_stage_id FROM public.batch_stages WHERE id = p_stage_id) THEN
    RAISE EXCEPTION
      'BATCH_PARAMETER_WRONG_STAGE: parameter "%" belongs to a different stage of the formula',
      p.parameter USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.batch_stage_parameter_readings
    (company_id, batch_stage_id, formula_parameter_id, parameter_name, parameter_type,
     unit, target_value, min_value, max_value, reading_value, reading_text, recorded_by)
  VALUES
    (c.company_id, p_stage_id, p.id, p.parameter, p.parameter_type,
     p.unit, p.target_value, p.min_value, p.max_value,
     p_reading_value, nullif(btrim(coalesce(p_reading_text,'')),''),
     coalesce(v_actor,'00000000-0000-0000-0000-000000000000'::uuid))
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'reading_id', v_id,
    'in_specification', (SELECT in_specification FROM public.batch_stage_parameter_readings WHERE id = v_id));
END;
$$;

COMMENT ON FUNCTION public.batch_stage_record_reading(uuid,uuid,numeric,text) IS
  'Records a reading against a formula parameter, copying the parameter type, unit and limits from the formula so the caller cannot supply its own acceptance criteria. in_specification is computed on write.';

REVOKE ALL ON FUNCTION public.batch_stage_record_reading(uuid,uuid,numeric,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.batch_stage_record_reading(uuid,uuid,numeric,text) TO authenticated, service_role;


--  ── batch_stage_correct_reading ─────────────────────────────────────
--  A correction is a new row plus a log entry carrying both values. The
--  superseded reading is left exactly as it was recorded.
CREATE OR REPLACE FUNCTION public.batch_stage_correct_reading(
  p_reading_id    uuid,
  p_reading_value numeric,
  p_reading_text  text,
  p_reason        text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE c record; v_actor uuid := auth.uid(); o record; v_id uuid;
BEGIN
  SELECT * INTO o FROM public.batch_stage_parameter_readings WHERE id = p_reading_id;
  IF o.id IS NULL THEN
    RAISE EXCEPTION 'BATCH_NO_READING: no such reading %', p_reading_id USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO c FROM public.batch_stage_context(o.batch_stage_id);

  IF c.closed_at IS NOT NULL THEN
    RAISE EXCEPTION 'BATCH_CLOSED: batch % was closed at % and its readings are permanently locked',
      c.batch_id, c.closed_at USING ERRCODE = 'P0001';
  END IF;

  IF coalesce(btrim(p_reason),'') = '' THEN
    RAISE EXCEPTION 'BATCH_CORRECTION_NO_REASON: a correction requires a reason'
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (SELECT 1 FROM public.batch_stage_parameter_readings
              WHERE corrected_from_id = p_reading_id) THEN
    RAISE EXCEPTION
      'BATCH_READING_ALREADY_CORRECTED: reading % has already been corrected; correct the correction instead',
      p_reading_id USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.batch_stage_parameter_readings
    (company_id, batch_stage_id, formula_parameter_id, parameter_name, parameter_type,
     unit, target_value, min_value, max_value, reading_value, reading_text,
     recorded_by, corrected_from_id)
  VALUES
    (o.company_id, o.batch_stage_id, o.formula_parameter_id, o.parameter_name, o.parameter_type,
     o.unit, o.target_value, o.min_value, o.max_value,
     p_reading_value, nullif(btrim(coalesce(p_reading_text,'')),''),
     coalesce(v_actor,'00000000-0000-0000-0000-000000000000'::uuid), p_reading_id)
  RETURNING id INTO v_id;

  INSERT INTO public.batch_stage_corrections
    (company_id, batch_stage_id, field_name, original_value, new_value, reason, corrected_by)
  VALUES (o.company_id, o.batch_stage_id, 'reading:'||o.parameter_name,
          coalesce(o.reading_value::text, o.reading_text),
          coalesce(p_reading_value::text, nullif(btrim(coalesce(p_reading_text,'')),'')),
          btrim(p_reason), coalesce(v_actor,'00000000-0000-0000-0000-000000000000'::uuid));

  RETURN jsonb_build_object('ok', true, 'reading_id', v_id, 'corrected_from', p_reading_id);
END;
$$;

COMMENT ON FUNCTION public.batch_stage_correct_reading(uuid,numeric,text,text) IS
  'Corrects a reading by recording a new one that points back at the original, and logging both values with a reason. The original row is never touched.';

REVOKE ALL ON FUNCTION public.batch_stage_correct_reading(uuid,numeric,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.batch_stage_correct_reading(uuid,numeric,text,text) TO authenticated, service_role;


--  ── batch_record_close ──────────────────────────────────────────────
--  "Closing a batch does not lock it" is a NOT DONE IF. Closure sets
--  execution_closed_at, which the three freeze triggers key on, and the
--  guard above refuses to let it be cleared.
CREATE OR REPLACE FUNCTION public.batch_record_close(
  p_batch_id uuid,
  p_comment  text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE b record; v_actor uuid := auth.uid(); v_open record; v_res jsonb;
BEGIN
  SELECT id, company_id, batch_number, execution_closed_at INTO b
    FROM public.batch_records WHERE id = p_batch_id;
  IF b.id IS NULL THEN
    RAISE EXCEPTION 'BATCH_NO_RECORD: no such batch record %', p_batch_id USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.app_is_service_context()
     AND NOT public.app_is_company_member(b.company_id) THEN
    RAISE EXCEPTION 'BATCH_FORBIDDEN: caller is not a member of the owning company'
      USING ERRCODE = 'P0001';
  END IF;
  IF b.execution_closed_at IS NOT NULL THEN
    RAISE EXCEPTION 'BATCH_CLOSED: batch % was already closed at %',
      b.batch_number, b.execution_closed_at USING ERRCODE = 'P0001';
  END IF;

  --  A record closed with a stage still open is an incomplete record
  --  that can never be completed, because closure is permanent.
  SELECT sequence_no, name, status INTO v_open
    FROM public.batch_stages
   WHERE batch_id = p_batch_id AND status <> 'complete'
   ORDER BY sequence_no LIMIT 1;

  IF v_open.sequence_no IS NOT NULL THEN
    RAISE EXCEPTION
      'BATCH_STAGE_INCOMPLETE: stage % ("%") is % and execution cannot be closed until every stage is complete',
      v_open.sequence_no, v_open.name, v_open.status USING ERRCODE = 'P0001';
  END IF;

  --  The engine moves first: if the batch is not in a state it can be
  --  closed from, nothing is written and the record stays open.
  v_res := public.lifecycle_transition('batch_record', p_batch_id, 'close_execution',
                                       b.company_id, v_actor, p_comment);

  --  No sync flag here on purpose: this UPDATE does not touch status, so
  --  the guard should stay armed over it.
  UPDATE public.batch_records
     SET execution_closed_at = now(), execution_closed_by = v_actor
   WHERE id = p_batch_id;

  --  Execution being over is the thing that makes the record reviewable,
  --  so the hand-off to QC is part of closing rather than a second
  --  button somebody has to remember to press.
  v_res := public.lifecycle_transition('batch_record', p_batch_id, 'submit_for_qc',
                                       b.company_id, v_actor);

  RETURN v_res || jsonb_build_object('execution_closed', true);
END;
$$;

COMMENT ON FUNCTION public.batch_record_close(uuid,text) IS
  'Closes manufacturing execution and hands the record to QC. Refuses while any stage is incomplete; sets execution_closed_at, which permanently freezes stages, readings and reopening.';

REVOKE ALL ON FUNCTION public.batch_record_close(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.batch_record_close(uuid,text) TO authenticated, service_role;


-- ── 10. The initiation preconditions, in the database ────────────────
--
--  Item 07: "Initiation requires an approved formula, a registered
--  product and an unexpired licence."
--
--  The licence half already holds: trg_batch_records_licence_gate has
--  fired on INSERT since 20260921000000, calling
--  licence_block_reason(product_id, 'initiation').
--
--  WHAT IS HERE AND WHAT IS IN THE RPC, AND WHY THEY DIFFER
--  -------------------------------------------------------
--  A named formula has to be an approved one, for this product, in this
--  company. That is checked here, for every writer, because there is no
--  legitimate case for a batch pointing at somebody else's formula or at
--  a draft — a formula reference that cannot be trusted makes the whole
--  genealogy chain decorative.
--
--  The REGISTERED-PRODUCT precondition is deliberately NOT here. It lives
--  in batch_record_initiate() instead, and the difference is not laziness:
--
--    A validation batch is manufactured BEFORE registration. It has to
--    be — the dossier NAFDAC registers is built from batches that were
--    already made. A table-wide bar on creating a batch record for an
--    unregistered product would make the pre-registration batch
--    unrecordable, which is the opposite of what a compliance system is
--    for. (It also broke four suites that create a batch as incidental
--    fixture, including tenant isolation, which has no opinion about
--    product registration at all. That was the symptom; the above is the
--    reason.)
--
--    The control that carries the consequence is already in the database:
--    fn_batch_records_product_gate() refuses to RELEASE a batch of an
--    unregistered product. So the residue of checking initiation in the
--    RPC is a batch record that exists and can never be released — which
--    is exactly the validation batch, and is harmless.
--
--  WHY THIS IS A NEW TRIGGER AND NOT AN EDIT TO THE PRODUCT GATE
--  ------------------------------------------------------------
--  fn_batch_records_product_gate() belongs to the product registry
--  deliverable and is deliberately scoped to release — d04_d06's
--  integration suite asserts in so many words that "the product gate
--  stays quiet on initiation", so one voice speaks per cause. Widening it
--  would rewrite another deliverable's documented decision.
--
--  The name is precautionary, and the reason is worth keeping even though
--  it no longer bites. Postgres fires same-event triggers in NAME order.
--  An earlier version of this gate also checked product registration, and
--  under the name trg_batch_records_initiation_gate it sorted BEFORE
--  ...licence_gate and shadowed the licence gate's message — which is the
--  better message, since it names the licence, its expiry date and its
--  renewal status. Registration has since moved into the RPC and this
--  gate now returns early for any insert that names no formula, so the
--  ordering is no longer load-bearing: mutation testing confirmed that
--  renaming it back changes nothing in the suites. The name stays anyway,
--  because the next check added here may well fire on those inserts, and
--  inheriting the right order is cheaper than rediscovering it.
CREATE OR REPLACE FUNCTION public.fn_batch_records_initiation_gate()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE f record;
BEGIN
  --  A batch that names no product is a pre-registry batch. Those are
  --  left exactly as they were, which is the same choice the product
  --  gate made and the reason legacy rows still work.
  IF NEW.product_id IS NULL THEN RETURN NEW; END IF;

  --  A formula is not demanded on every insert: that would stop the
  --  pre-existing batch screen creating a batch at all, which item 07
  --  does not ask for and which would be a regression dressed as a
  --  control. batch_record_initiate() demands one. Here, a formula that
  --  IS named has to be a usable one.
  IF NEW.formula_id IS NOT NULL THEN
    SELECT company_id, product_id, status, version INTO f
      FROM public.master_formulas WHERE id = NEW.formula_id;

    IF f.company_id IS NULL THEN
      RAISE EXCEPTION 'BATCH_FORMULA_NOT_FOUND: no master formula %', NEW.formula_id
        USING ERRCODE = 'P0002';
    END IF;
    IF f.company_id <> NEW.company_id THEN
      RAISE EXCEPTION 'BATCH_FORMULA_FOREIGN: formula % belongs to another company', NEW.formula_id
        USING ERRCODE = 'P0001';
    END IF;
    IF f.product_id <> NEW.product_id THEN
      RAISE EXCEPTION 'BATCH_FORMULA_WRONG_PRODUCT: formula % is for a different product', NEW.formula_id
        USING ERRCODE = 'P0001';
    END IF;
    IF f.status <> 'approved' THEN
      RAISE EXCEPTION
        'BATCH_FORMULA_NOT_APPROVED: formula version % is "%", so a batch cannot be manufactured to it',
        f.version, f.status USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

--  INSERT only. A batch already under way must not be invalidated
--  retrospectively because its product was later suspended — that is
--  what the release gate is for, and stopping a running batch from being
--  updated at all would make a suspension unrecordable.
DROP TRIGGER IF EXISTS trg_batch_records_product_initiation_gate ON public.batch_records;
CREATE TRIGGER trg_batch_records_product_initiation_gate
  BEFORE INSERT ON public.batch_records
  FOR EACH ROW EXECUTE FUNCTION public.fn_batch_records_initiation_gate();

COMMENT ON FUNCTION public.fn_batch_records_initiation_gate() IS
  'Holds a batch record''s formula reference honest for every writer, not only for callers of batch_record_initiate(): a named formula must be approved, for this product, in this company. The registered-product precondition is in the RPC rather than here, because a validation batch is manufactured before registration and has to be recordable; release of such a batch is refused by fn_batch_records_product_gate(). Named so it sorts after trg_batch_records_licence_gate — Postgres fires same-event triggers in name order — so a lapsed registration is still explained by the licence gate, which knows the expiry date and the renewal status.';
