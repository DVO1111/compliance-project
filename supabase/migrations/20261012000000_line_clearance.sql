-- ===================================================================
--  WEEK 4 / ITEM 08 — LINE CLEARANCE AND CHANGEOVER VERIFICATION
--
--  "line_clearance_records with a checklist configurable per line.
--   Default items: previous product, materials, labels and printed
--   material removed; equipment and area cleaned with records present;
--   calibration current; previous documents removed.
--   Two signatures from two different users. Dispensing is blocked until
--   clearance is verified.
--   Changeover verification: a result is required before clearance
--   completes, and a failed result blocks the line."
--
--  NOT DONE IF
--    One user can both perform and verify.
--    Clearance is recorded but dispensing never checks it.
--    A failed verification can be overridden without a recorded decision.
--
--  THERE IS NO LINE IN THIS SCHEMA YET
--  -----------------------------------
--  Nothing in the database knows what a production line is, so item 08
--  has to introduce one. It stays deliberately thin — a line is a code, a
--  name and the area it stands in. Equipment belongs to item 10, which
--  builds the instrument registry; the "calibration current" checklist
--  item below is therefore a question a person answers, not yet a derived
--  check. Item 10 can turn it into one, and the comment on that row says
--  so rather than leaving a future reader to guess.
--
--  WHAT "DISPENSING IS BLOCKED" CAN AND CANNOT MEAN THIS WEEK
--  ---------------------------------------------------------
--  Dispensing is item 09 and does not exist yet, so this migration
--  cannot make dispensing call anything. What it can do — and what item
--  04 did for the quarantine gate — is ship the block as a function with
--  the two established shapes:
--
--      line_clearance_block_reason(batch)   NULL, or a sentence
--      line_clearance_assert_cleared(batch) raises
--
--  Item 09's dispensing RPC calls the second one. Until it does, the NOT
--  DONE IF "clearance is recorded but dispensing never checks it" is not
--  yet closed, and saying otherwise would be false. The suite asserts the
--  gate's own answers; the suite that asserts dispensing honours it
--  belongs to item 09.
-- ===================================================================


-- ── 1. The line ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.production_lines (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code        text NOT NULL,
  name        text NOT NULL,
  description text,
  --  Where the line physically stands. Area cleaning is one of the
  --  default checklist items, and "which area" is the first thing asked
  --  when a clearance is questioned.
  area        text,
  is_active   boolean NOT NULL DEFAULT true,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT production_lines_code_uniq UNIQUE (company_id, code),
  CONSTRAINT production_lines_code_chk  CHECK (btrim(code) <> ''),
  CONSTRAINT production_lines_name_chk  CHECK (btrim(name) <> '')
);

COMMENT ON TABLE public.production_lines IS
  'A production line. Deliberately thin: equipment and instruments belong to item 10, and a line here is a code, a name and an area — enough to hang a clearance on.';

CREATE INDEX IF NOT EXISTS production_lines_company_idx
  ON public.production_lines(company_id) WHERE is_active;

ALTER TABLE public.production_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS production_lines_select ON public.production_lines;
CREATE POLICY production_lines_select ON public.production_lines FOR SELECT TO authenticated
  USING (public.app_is_company_member(company_id));
DROP POLICY IF EXISTS production_lines_write ON public.production_lines;
CREATE POLICY production_lines_write ON public.production_lines FOR ALL TO authenticated
  USING (public.app_is_company_member(company_id))
  WITH CHECK (public.app_is_company_member(company_id));


--  A batch runs on a line. Without this the gate has nothing to look up:
--  "has this line been cleared for this batch" needs the batch to know
--  which line it is on.
ALTER TABLE public.batch_records
  ADD COLUMN IF NOT EXISTS line_id uuid REFERENCES public.production_lines(id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.batch_records.line_id IS
  'The line this batch runs on. Null on batches that predate item 08 — and a batch with no line cannot be proved cleared, so line_clearance_block_reason() blocks it rather than waving it through.';

CREATE INDEX IF NOT EXISTS batch_records_line_idx
  ON public.batch_records(line_id) WHERE line_id IS NOT NULL;


-- ── 2. The checklist: defaults in code, configuration per line ────────
--
--  The brief lists the default items, so they live in a function the way
--  the Codex allergen list does: one place, callable, and not scattered
--  through seed data that drifts per environment. The TABLE below is what
--  makes them "configurable per line" — a line's checklist is seeded from
--  this list and can then be added to, reordered, or have items retired.

CREATE OR REPLACE FUNCTION public.line_clearance_default_items()
RETURNS TABLE (
  item_code text, label text, requires_record_reference boolean, sort_order integer, note text
)
LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT * FROM (VALUES
    ('previous_product_removed', 'Previous product removed from the line',
     false, 10,
     'All product from the preceding run physically off the line, including any held in hoppers, chutes and feed lines.'),

    ('materials_removed', 'Previous materials and components removed',
     false, 20,
     'Raw materials, part-used containers and components of the preceding run returned to store or dispositioned.'),

    ('labels_and_printed_material_removed', 'Labels and printed material removed',
     true, 30,
     'The item most often skipped and the one that causes a recall. Reconciliation of the previous run''s printed material is the record referenced here.'),

    ('equipment_cleaned', 'Equipment cleaned, with the cleaning record present',
     true, 40,
     'The brief asks for the record to be PRESENT, not merely for the box to be ticked, which is why this item carries a record reference.'),

    ('area_cleaned', 'Area cleaned, with the cleaning record present',
     true, 50,
     'The room or bay the line stands in, as distinct from the equipment on it.'),

    ('calibration_current', 'Calibration current on instruments in use',
     false, 60,
     'Answered by a person for now. Item 10 builds the instrument registry and the calibration lockout; when it lands this item can be derived instead of asked, and should be.'),

    ('previous_documents_removed', 'Previous batch documents removed from the line',
     false, 70,
     'The preceding batch record, work instructions and any loose printed documentation off the line, so the wrong document cannot be signed.')
  ) AS t(item_code, label, requires_record_reference, sort_order, note);
$$;

COMMENT ON FUNCTION public.line_clearance_default_items() IS
  'The default line clearance checklist named by Week 4 item 08. Used to seed a line''s configurable checklist; not read at clearance time, because a clearance snapshots the items it actually asked.';


CREATE TABLE IF NOT EXISTS public.line_clearance_checklist_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  line_id     uuid NOT NULL REFERENCES public.production_lines(id) ON DELETE CASCADE,
  item_code   text NOT NULL,
  label       text NOT NULL,
  --  "with records present": an item that needs evidence makes the
  --  clearance ask for a reference to it instead of accepting a tick.
  requires_record_reference boolean NOT NULL DEFAULT false,
  --  A required item must be answered PASS (or explicitly not applicable)
  --  before the clearance can be performed. An optional one is a prompt.
  is_required boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT lcci_code_uniq UNIQUE (line_id, item_code),
  CONSTRAINT lcci_code_chk  CHECK (btrim(item_code) <> ''),
  CONSTRAINT lcci_label_chk CHECK (btrim(label) <> '')
);

COMMENT ON TABLE public.line_clearance_checklist_items IS
  'The clearance checklist for one line — "configurable per line". Seeded from line_clearance_default_items() when a line is created, then free to diverge. Retiring an item sets is_active false rather than deleting it, so a past clearance still explains itself.';

CREATE INDEX IF NOT EXISTS lcci_line_idx
  ON public.line_clearance_checklist_items(line_id, sort_order) WHERE is_active;

ALTER TABLE public.line_clearance_checklist_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lcci_select ON public.line_clearance_checklist_items;
CREATE POLICY lcci_select ON public.line_clearance_checklist_items FOR SELECT TO authenticated
  USING (public.app_is_company_member(company_id));
DROP POLICY IF EXISTS lcci_write ON public.line_clearance_checklist_items;
CREATE POLICY lcci_write ON public.line_clearance_checklist_items FOR ALL TO authenticated
  USING (public.app_is_company_member(company_id))
  WITH CHECK (public.app_is_company_member(company_id));


--  Seeding on insert rather than in the RPC, so a line created by any
--  path arrives with a usable checklist. A line with no checklist would
--  clear on an empty list, which is the most dangerous possible default.
CREATE OR REPLACE FUNCTION public.fn_production_lines_seed_checklist()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.line_clearance_checklist_items
    (company_id, line_id, item_code, label, requires_record_reference, is_required, sort_order, note)
  SELECT NEW.company_id, NEW.id, d.item_code, d.label, d.requires_record_reference, true, d.sort_order, d.note
    FROM public.line_clearance_default_items() d
  ON CONFLICT (line_id, item_code) DO NOTHING;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_production_lines_seed_checklist ON public.production_lines;
CREATE TRIGGER trg_production_lines_seed_checklist
  AFTER INSERT ON public.production_lines
  FOR EACH ROW EXECUTE FUNCTION public.fn_production_lines_seed_checklist();

COMMENT ON FUNCTION public.fn_production_lines_seed_checklist() IS
  'Gives every new line the default checklist. A trigger rather than a step in a setup function, because a line with an empty checklist would clear vacuously — the worst available default.';


-- ── 3. The clearance lifecycle ───────────────────────────────────────

DO $clearance_lifecycle$
DECLARE
  v_def uuid;
  s_prog uuid; s_perf uuid; s_ver uuid; s_fail uuid; s_canc uuid;
BEGIN
  SELECT id INTO v_def FROM public.lifecycle_definitions
   WHERE entity_type = 'line_clearance' AND company_id IS NULL AND version = 1;

  IF v_def IS NULL THEN
    INSERT INTO public.lifecycle_definitions(company_id, entity_type, name, description, version, is_active)
    VALUES (NULL,'line_clearance','Line clearance lifecycle',
            'A line clearance from checklist through the performer''s signature to a second person''s verification.',1,true)
    RETURNING id INTO v_def;

    INSERT INTO public.lifecycle_states(definition_id,state_key,label,description,sort_order,is_initial,is_terminal) VALUES
      (v_def,'in_progress','In progress','Checklist being worked through.',10,true ,false),
      (v_def,'performed','Performed','Checklist complete and signed by the person who did it. Awaiting a second person.',20,false,false),
      (v_def,'verified','Verified','Verified by a second person. The line is clear.',30,false,false),
      (v_def,'failed','Failed','A required item or the changeover verification failed. The line is blocked.',40,false,false),
      (v_def,'cancelled','Cancelled','Abandoned without completing. Terminal.',50,false,true);

    SELECT id INTO s_prog FROM public.lifecycle_states WHERE definition_id=v_def AND state_key='in_progress';
    SELECT id INTO s_perf FROM public.lifecycle_states WHERE definition_id=v_def AND state_key='performed';
    SELECT id INTO s_ver  FROM public.lifecycle_states WHERE definition_id=v_def AND state_key='verified';
    SELECT id INTO s_fail FROM public.lifecycle_states WHERE definition_id=v_def AND state_key='failed';
    SELECT id INTO s_canc FROM public.lifecycle_states WHERE definition_id=v_def AND state_key='cancelled';

    --  BOTH signatures are the engine's, which is what makes "two
    --  signatures from two different users" real rather than two columns
    --  somebody fills in. The engine binds each signature to the actor
    --  who made the transition and refuses one that belongs to anybody
    --  else, so the performer cannot supply the verifier's signature.
    --  The second half of the rule — that the two actors differ — is a
    --  table CHECK and a check in the RPC, below.
    INSERT INTO public.lifecycle_transitions
      (definition_id,from_state_id,to_state_id,action_key,label,sort_order,requires_comment,requires_signature) VALUES
      (v_def,s_prog,s_perf,'perform', 'Sign the clearance',      10,false,true ),
      (v_def,s_perf,s_ver ,'verify',  'Verify the clearance',    20,false,true ),
      (v_def,s_prog,s_fail,'fail',    'Record a failure',        30,true ,false),
      (v_def,s_perf,s_fail,'fail',    'Record a failure',        40,true ,false),
      --  Out of failed by one of two honest routes: clean again and
      --  start over, or authorise proceeding with a recorded decision.
      (v_def,s_fail,s_prog,'restart', 'Clean again and restart', 50,true ,false),
      (v_def,s_fail,s_perf,'override','Authorise an override',   60,true ,true ),
      (v_def,s_prog,s_canc,'cancel',  'Cancel',                  70,true ,false),
      (v_def,s_perf,s_canc,'cancel',  'Cancel',                  80,true ,false);
  END IF;
END
$clearance_lifecycle$;


-- ── 4. line_clearance_records, with the engine as the source of state ─

CREATE TABLE IF NOT EXISTS public.line_clearance_records (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  line_id        uuid NOT NULL REFERENCES public.production_lines(id) ON DELETE RESTRICT,
  --  The batch this clearance is FOR. A clearance is not a property of a
  --  line in the abstract; it is the statement that this line is fit to
  --  run this batch.
  batch_id       uuid NOT NULL REFERENCES public.batch_records(id) ON DELETE CASCADE,
  --  What was on the line before, when it is known. The whole point of a
  --  changeover is that something else was here.
  previous_batch_id uuid REFERENCES public.batch_records(id) ON DELETE SET NULL,
  previous_product_name text,

  --  Mirror of the engine, maintained by trigger and refused to every
  --  other writer. Same pattern and same reasoning as item 07's
  --  batch_records.status: the column is a denormalised read, and the
  --  gate's index lives on it.
  status         text NOT NULL DEFAULT 'in_progress',

  performed_by   uuid,
  performed_at   timestamptz,
  performed_signature_id uuid REFERENCES public.electronic_signatures(id) ON DELETE RESTRICT,
  verified_by    uuid,
  verified_at    timestamptz,
  verified_signature_id  uuid REFERENCES public.electronic_signatures(id) ON DELETE RESTRICT,

  notes          text,
  created_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT lcr_status_chk
    CHECK (status IN ('in_progress','performed','verified','failed','cancelled'))
);

COMMENT ON TABLE public.line_clearance_records IS
  'One line clearance: this line, cleared for this batch, by one person and verified by another. State lives in the lifecycle engine; the status column is a mirror the database refuses to let anyone write.';

--  "Two signatures from two different users" is a NOT DONE IF, so it is a
--  table constraint and not only a check in the RPC. Outside the CREATE
--  TABLE because that statement is IF NOT EXISTS, which skips its whole
--  body on a database that already has the table — the same hole mutation
--  testing found in item 07.
DO $lcr_checks$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lcr_two_person_chk') THEN
    ALTER TABLE public.line_clearance_records ADD CONSTRAINT lcr_two_person_chk
      CHECK (verified_by IS NULL OR performed_by IS NULL OR verified_by <> performed_by);
  END IF;
END
$lcr_checks$;

COMMENT ON CONSTRAINT lcr_two_person_chk ON public.line_clearance_records IS
  'Item 08: "One user can both perform and verify" is a NOT DONE IF. A CHECK rather than only an RPC test, so no write path can produce a self-verified clearance.';

CREATE INDEX IF NOT EXISTS lcr_batch_idx ON public.line_clearance_records(batch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS lcr_line_idx  ON public.line_clearance_records(line_id, created_at DESC);
--  The gate's query: the live clearance for a batch.
CREATE INDEX IF NOT EXISTS lcr_gate_idx
  ON public.line_clearance_records(batch_id, status);

ALTER TABLE public.line_clearance_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lcr_select ON public.line_clearance_records;
CREATE POLICY lcr_select ON public.line_clearance_records FOR SELECT TO authenticated
  USING (public.app_is_company_member(company_id));
DROP POLICY IF EXISTS lcr_write ON public.line_clearance_records;
CREATE POLICY lcr_write ON public.line_clearance_records FOR ALL TO authenticated
  USING (public.app_is_company_member(company_id))
  WITH CHECK (public.app_is_company_member(company_id));


--  The mirror: initialise on insert, follow the engine, refuse a direct
--  write.
CREATE OR REPLACE FUNCTION public.fn_lcr_lifecycle_init()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_state text;
BEGIN
  PERFORM public.lifecycle_initialize('line_clearance', NEW.id, NEW.company_id);
  SELECT s.state_key INTO v_state
    FROM public.entity_current_state ecs
    JOIN public.lifecycle_states s ON s.id = ecs.state_id
   WHERE ecs.entity_type='line_clearance' AND ecs.entity_id = NEW.id;
  IF v_state IS NOT NULL THEN
    PERFORM set_config('app.lcr_status_sync','1',true);
    UPDATE public.line_clearance_records SET status = v_state WHERE id = NEW.id;
    PERFORM set_config('app.lcr_status_sync','',true);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_lcr_lifecycle_init ON public.line_clearance_records;
CREATE TRIGGER trg_lcr_lifecycle_init
  AFTER INSERT ON public.line_clearance_records
  FOR EACH ROW EXECUTE FUNCTION public.fn_lcr_lifecycle_init();

CREATE OR REPLACE FUNCTION public.fn_lcr_status_sync()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_state text;
BEGIN
  IF NEW.entity_type <> 'line_clearance' THEN RETURN NEW; END IF;
  SELECT state_key INTO v_state FROM public.lifecycle_states WHERE id = NEW.state_id;
  IF v_state IS NULL THEN RETURN NEW; END IF;
  PERFORM set_config('app.lcr_status_sync','1',true);
  UPDATE public.line_clearance_records SET status = v_state, updated_at = now()
   WHERE id = NEW.entity_id AND status IS DISTINCT FROM v_state;
  PERFORM set_config('app.lcr_status_sync','',true);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lcr_status_sync ON public.entity_current_state;
CREATE TRIGGER trg_lcr_status_sync
  AFTER INSERT OR UPDATE ON public.entity_current_state
  FOR EACH ROW EXECUTE FUNCTION public.fn_lcr_status_sync();

CREATE OR REPLACE FUNCTION public.fn_lcr_guard_status()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND coalesce(current_setting('app.lcr_status_sync', true),'') <> '1' THEN
    RAISE EXCEPTION
      'LINE_CLEARANCE_STATUS_READ_ONLY: status is derived from the lifecycle engine; use the line clearance functions instead of writing it'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lcr_guard_status ON public.line_clearance_records;
CREATE TRIGGER trg_lcr_guard_status
  BEFORE UPDATE ON public.line_clearance_records
  FOR EACH ROW EXECUTE FUNCTION public.fn_lcr_guard_status();


-- ── 5. What the clearance actually asked, and what was answered ───────
--
--  Snapshotted from the template at open time, not joined through it. The
--  template is configurable, so it changes; what this clearance asked is
--  a fact about this clearance. Same reasoning as item 07's batch stages.

CREATE TABLE IF NOT EXISTS public.line_clearance_check_results (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  clearance_id  uuid NOT NULL REFERENCES public.line_clearance_records(id) ON DELETE CASCADE,
  item_code     text NOT NULL,
  label         text NOT NULL,
  requires_record_reference boolean NOT NULL DEFAULT false,
  is_required   boolean NOT NULL DEFAULT true,
  sort_order    integer NOT NULL DEFAULT 0,

  --  Unanswered is NULL, deliberately, rather than a 'pending' value: an
  --  unanswered item is the absence of an answer, and making it a value
  --  invites it to be treated as one.
  result        text CHECK (result IS NULL OR result IN ('pass','fail','not_applicable')),
  --  "with records present" — where the item demands evidence, this is
  --  the reference to it.
  record_reference text,
  note          text,
  answered_by   uuid,
  answered_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT lccr_item_uniq UNIQUE (clearance_id, item_code)
);

--  The two behavioural CHECKs are declared OUTSIDE the CREATE TABLE, for
--  the reason set out in THE RULE ABOUT CONSTRAINTS at the foot of this
--  file: a constraint written inside CREATE TABLE IF NOT EXISTS reaches a
--  fresh database and nowhere else, and can never be repaired by
--  re-running the migration.
DO $lccr_checks$
BEGIN
  --  not_applicable without a reason is a tick in disguise.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='lccr_na_needs_note_chk') THEN
    ALTER TABLE public.line_clearance_check_results ADD CONSTRAINT lccr_na_needs_note_chk
      CHECK (result IS DISTINCT FROM 'not_applicable' OR btrim(coalesce(note,'')) <> '');
  END IF;
  --  An item that demands a record cannot pass without one. This is the
  --  "with records present" half of the brief's default checklist.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='lccr_record_needed_chk') THEN
    ALTER TABLE public.line_clearance_check_results ADD CONSTRAINT lccr_record_needed_chk
      CHECK (result IS DISTINCT FROM 'pass'
             OR NOT requires_record_reference
             OR btrim(coalesce(record_reference,'')) <> '');
  END IF;
END
$lccr_checks$;

COMMENT ON TABLE public.line_clearance_check_results IS
  'The checklist as this clearance asked it, and the answers. Snapshotted from line_clearance_checklist_items at open time so a later change to the template cannot rewrite what was checked.';

CREATE INDEX IF NOT EXISTS lccr_clearance_idx
  ON public.line_clearance_check_results(clearance_id, sort_order);

ALTER TABLE public.line_clearance_check_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lccr_select ON public.line_clearance_check_results;
CREATE POLICY lccr_select ON public.line_clearance_check_results FOR SELECT TO authenticated
  USING (public.app_is_company_member(company_id));
DROP POLICY IF EXISTS lccr_write ON public.line_clearance_check_results;
CREATE POLICY lccr_write ON public.line_clearance_check_results FOR ALL TO authenticated
  USING (public.app_is_company_member(company_id))
  WITH CHECK (public.app_is_company_member(company_id));

--  Once signed, the answers are the record. Editing them afterwards would
--  make the signature cover something that is no longer there.
CREATE OR REPLACE FUNCTION public.fn_lccr_freeze()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE v_status text; v_id uuid;
BEGIN
  v_id := CASE TG_OP WHEN 'DELETE' THEN OLD.clearance_id ELSE NEW.clearance_id END;
  SELECT status INTO v_status FROM public.line_clearance_records WHERE id = v_id;

  --  'failed' stays open on purpose: a failure is recorded against the
  --  clearance and the way forward is restart or override, both of which
  --  are their own recorded acts.
  IF v_status IN ('performed','verified','cancelled') THEN
    RAISE EXCEPTION
      'LINE_CLEARANCE_SIGNED: clearance % is "%" and its checklist answers can no longer be changed',
      v_id, v_status USING ERRCODE = 'P0001';
  END IF;
  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS trg_lccr_freeze ON public.line_clearance_check_results;
CREATE TRIGGER trg_lccr_freeze
  BEFORE UPDATE OR DELETE ON public.line_clearance_check_results
  FOR EACH ROW EXECUTE FUNCTION public.fn_lccr_freeze();


-- ── 6. Changeover verification ───────────────────────────────────────
--
--  "A result is required before clearance completes, and a failed result
--   blocks the line."
--
--  A separate table rather than a column, because a changeover is
--  verified by a METHOD — a swab, a rinse sample, a visual inspection —
--  and a line that failed once and was re-verified after cleaning has two
--  results, both of which are part of the record.

CREATE TABLE IF NOT EXISTS public.line_changeover_verifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  clearance_id  uuid NOT NULL REFERENCES public.line_clearance_records(id) ON DELETE CASCADE,
  method        text NOT NULL,
  result        text NOT NULL CHECK (result IN ('pass','fail')),
  detail        text,
  --  What was looked for and what was found, when the method produces a
  --  number — swab recovery in µg, rinse conductivity, and so on.
  measured_value numeric,
  limit_value    numeric,
  unit           text,
  performed_by  uuid NOT NULL,
  performed_at  timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT lcv_method_chk CHECK (btrim(method) <> '')
);

DO $lcv_checks$
BEGIN
  --  A failure with no explanation cannot be acted on. Outside the
  --  CREATE TABLE for the reason at the foot of this file.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='lcv_fail_needs_detail_chk') THEN
    ALTER TABLE public.line_changeover_verifications ADD CONSTRAINT lcv_fail_needs_detail_chk
      CHECK (result <> 'fail' OR btrim(coalesce(detail,'')) <> '');
  END IF;
END
$lcv_checks$;

COMMENT ON TABLE public.line_changeover_verifications IS
  'Changeover verification results for a clearance. Append-only: a result is evidence, and a failure that can be edited into a pass is not a control. A failed result moves the clearance to failed by trigger, which is what "blocks the line" means here.';

CREATE INDEX IF NOT EXISTS lcv_clearance_idx
  ON public.line_changeover_verifications(clearance_id, performed_at DESC);

ALTER TABLE public.line_changeover_verifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lcv_select ON public.line_changeover_verifications;
CREATE POLICY lcv_select ON public.line_changeover_verifications FOR SELECT TO authenticated
  USING (public.app_is_company_member(company_id));
DROP POLICY IF EXISTS lcv_insert ON public.line_changeover_verifications;
CREATE POLICY lcv_insert ON public.line_changeover_verifications FOR INSERT TO authenticated
  WITH CHECK (public.app_is_company_member(company_id));

REVOKE UPDATE, DELETE, TRUNCATE ON public.line_changeover_verifications FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.fn_lcv_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'LINE_VERIFICATION_IMMUTABLE: a changeover verification cannot be % once recorded', lower(TG_OP)
    USING ERRCODE = 'P0001';
END;
$$;

DROP TRIGGER IF EXISTS trg_lcv_immutable ON public.line_changeover_verifications;
CREATE TRIGGER trg_lcv_immutable
  BEFORE UPDATE OR DELETE ON public.line_changeover_verifications
  FOR EACH ROW EXECUTE FUNCTION public.fn_lcv_immutable();


--  "A failed result blocks the line." Not "should be followed by someone
--  marking it blocked" — the failure itself does it, so there is no
--  window in which the record says failed and the state says fine.
CREATE OR REPLACE FUNCTION public.fn_lcv_fail_blocks_line()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE c record;
BEGIN
  IF NEW.result <> 'fail' THEN RETURN NEW; END IF;

  SELECT id, company_id, status INTO c
    FROM public.line_clearance_records WHERE id = NEW.clearance_id;

  --  Only from a state the engine declares a 'fail' transition for.
  --  A clearance already failed stays failed; a cancelled one is done.
  IF c.status IN ('in_progress','performed') THEN
    PERFORM public.lifecycle_transition('line_clearance', c.id, 'fail',
      c.company_id, NEW.performed_by,
      format('Changeover verification failed: %s', coalesce(NEW.detail, NEW.method)));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lcv_fail_blocks_line ON public.line_changeover_verifications;
CREATE TRIGGER trg_lcv_fail_blocks_line
  AFTER INSERT ON public.line_changeover_verifications
  FOR EACH ROW EXECUTE FUNCTION public.fn_lcv_fail_blocks_line();

COMMENT ON FUNCTION public.fn_lcv_fail_blocks_line() IS
  'Moves a clearance to failed the moment a failing changeover verification is recorded, so "a failed result blocks the line" needs nobody to remember it.';


-- ── 7. Overrides, which must be recorded decisions ───────────────────
--
--  "A failed verification can be overridden without a recorded decision"
--  is a NOT DONE IF. So an override is a row — who authorised it, which
--  verification it answers, why, and the signature — and the engine's
--  failed -> performed move is refused unless that row exists.

CREATE TABLE IF NOT EXISTS public.line_clearance_overrides (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  clearance_id    uuid NOT NULL REFERENCES public.line_clearance_records(id) ON DELETE RESTRICT,
  --  The specific failure being answered. An override floating free of a
  --  result is an authorisation for nothing in particular.
  verification_id uuid NOT NULL REFERENCES public.line_changeover_verifications(id) ON DELETE RESTRICT,
  authorised_by   uuid NOT NULL,
  reason          text NOT NULL CHECK (btrim(reason) <> ''),
  signature_id    uuid NOT NULL REFERENCES public.electronic_signatures(id) ON DELETE RESTRICT,
  decided_at      timestamptz NOT NULL DEFAULT now()
);

DO $lco_checks$
BEGIN
  --  One override per verification, so a single authorisation cannot be
  --  reused to wave through a second, different failure. Outside the
  --  CREATE TABLE for the reason at the foot of this file.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='lco_one_per_verification') THEN
    ALTER TABLE public.line_clearance_overrides ADD CONSTRAINT lco_one_per_verification
      UNIQUE (verification_id);
  END IF;
END
$lco_checks$;

COMMENT ON TABLE public.line_clearance_overrides IS
  'A recorded decision to proceed past a failed changeover verification: who authorised it, which failure, why, and their signature. Append-only. One per verification, so an override cannot be reused to wave through a second failure.';

CREATE INDEX IF NOT EXISTS lco_clearance_idx
  ON public.line_clearance_overrides(clearance_id, decided_at DESC);

ALTER TABLE public.line_clearance_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lco_select ON public.line_clearance_overrides;
CREATE POLICY lco_select ON public.line_clearance_overrides FOR SELECT TO authenticated
  USING (public.app_is_company_member(company_id));
DROP POLICY IF EXISTS lco_insert ON public.line_clearance_overrides;
CREATE POLICY lco_insert ON public.line_clearance_overrides FOR INSERT TO authenticated
  WITH CHECK (public.app_is_company_member(company_id));

REVOKE UPDATE, DELETE, TRUNCATE ON public.line_clearance_overrides FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.fn_lco_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'LINE_OVERRIDE_IMMUTABLE: an override decision cannot be % once recorded', lower(TG_OP)
    USING ERRCODE = 'P0001';
END;
$$;

DROP TRIGGER IF EXISTS trg_lco_immutable ON public.line_clearance_overrides;
CREATE TRIGGER trg_lco_immutable
  BEFORE UPDATE OR DELETE ON public.line_clearance_overrides
  FOR EACH ROW EXECUTE FUNCTION public.fn_lco_immutable();


--  THE GUARD THAT MAKES THE NOT DONE IF FALSE.
--
--  On entity_current_state rather than on the RPC, because the RPC is one
--  way in: a caller with the engine's own lifecycle_transition() in hand
--  could otherwise move failed -> performed and the line would read clear
--  with no decision on file. An AFTER trigger that RAISES still aborts
--  the transaction, so the move is refused rather than reported.
CREATE OR REPLACE FUNCTION public.fn_lcr_override_needs_decision()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_to text; v_from text; v_fail record; n integer;
BEGIN
  IF NEW.entity_type <> 'line_clearance' THEN RETURN NEW; END IF;

  SELECT state_key INTO v_to FROM public.lifecycle_states WHERE id = NEW.state_id;
  IF v_to <> 'performed' THEN RETURN NEW; END IF;

  IF TG_OP = 'UPDATE' THEN
    SELECT state_key INTO v_from FROM public.lifecycle_states WHERE id = OLD.state_id;
  END IF;
  IF coalesce(v_from,'') <> 'failed' THEN RETURN NEW; END IF;

  --  The failure being answered is the most recent failing verification.
  SELECT id INTO v_fail
    FROM public.line_changeover_verifications
   WHERE clearance_id = NEW.entity_id AND result = 'fail'
   ORDER BY performed_at DESC, created_at DESC
   LIMIT 1;

  IF v_fail.id IS NULL THEN
    --  Failed without a failing verification behind it: the failure came
    --  from a checklist item. There is nothing for an override to answer,
    --  so this route out is not available — restart is.
    RAISE EXCEPTION
      'LINE_CLEARANCE_OVERRIDE_NOT_APPLICABLE: clearance % failed on its checklist, not on a changeover verification; clean again and restart rather than overriding'
      , NEW.entity_id USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*) INTO n FROM public.line_clearance_overrides
   WHERE clearance_id = NEW.entity_id AND verification_id = v_fail.id;

  IF n = 0 THEN
    RAISE EXCEPTION
      'LINE_CLEARANCE_OVERRIDE_NOT_RECORDED: a failed changeover verification cannot be overridden without a recorded decision naming who authorised it and why'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lcr_override_needs_decision ON public.entity_current_state;
CREATE TRIGGER trg_lcr_override_needs_decision
  AFTER INSERT OR UPDATE ON public.entity_current_state
  FOR EACH ROW EXECUTE FUNCTION public.fn_lcr_override_needs_decision();

COMMENT ON FUNCTION public.fn_lcr_override_needs_decision() IS
  'Item 08: "A failed verification can be overridden without a recorded decision" is a NOT DONE IF. Refuses the engine''s failed -> performed move unless an override row exists for the latest failing verification. On entity_current_state so a direct lifecycle_transition() cannot walk around it.';


-- ── 8. The gate ──────────────────────────────────────────────────────
--
--  Two shapes, matching material_lot_block_reason / _assert_dispensable,
--  because item 09's dispensing will call the asserting one and screens
--  want the sentence.
--
--  EVERY PATH THAT CANNOT PROVE THE LINE IS CLEAR REPORTS IT AS BLOCKED.
--  That is the rule item 04's gate wrote down and it matters more here:
--  the failure mode of a permissive default is dispensing into an uncleaned
--  line, which is cross-contamination.
CREATE OR REPLACE FUNCTION public.line_clearance_block_reason(p_batch_id uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE b record; c record; l record;
BEGIN
  SELECT br.id, br.company_id, br.batch_number, br.line_id
    INTO b
    FROM public.batch_records br WHERE br.id = p_batch_id;

  IF b.id IS NULL THEN
    RETURN 'This batch record does not exist.';
  END IF;

  --  SECURITY DEFINER, so RLS does not hide another tenant's batch and
  --  turn "not yours" into "nothing to report". It refuses by RAISING,
  --  because a NULL return reads as "cleared" to every caller.
  IF NOT public.app_is_service_context()
     AND NOT public.app_is_company_member(b.company_id) THEN
    RAISE EXCEPTION 'LINE_CLEARANCE_FORBIDDEN: caller is not a member of the owning company'
      USING ERRCODE = 'P0001';
  END IF;

  IF b.line_id IS NULL THEN
    RETURN format('Batch %s is not assigned to a production line, so no line clearance can be shown for it. Assign the line and clear it before dispensing.',
                  b.batch_number);
  END IF;

  SELECT code, name INTO l FROM public.production_lines WHERE id = b.line_id;

  --  The clearance that counts is the most recent one for this batch.
  --  An older verified clearance superseded by a failed re-clearance must
  --  not keep the line open.
  SELECT id, status, verified_at INTO c
    FROM public.line_clearance_records
   WHERE batch_id = p_batch_id
   ORDER BY created_at DESC
   LIMIT 1;

  IF c.id IS NULL THEN
    RETURN format('Line %s has no clearance record for batch %s. The line must be cleared and verified before anything is dispensed to it.',
                  coalesce(l.code,'?'), b.batch_number);
  END IF;

  IF c.status = 'verified' THEN
    RETURN NULL;
  END IF;

  RETURN CASE c.status
    WHEN 'in_progress' THEN
      format('The clearance for line %s is still in progress. It must be signed and then verified by a second person before anything is dispensed.',
             coalesce(l.code,'?'))
    WHEN 'performed' THEN
      format('The clearance for line %s has been signed but not yet verified by a second person.',
             coalesce(l.code,'?'))
    WHEN 'failed' THEN
      format('The clearance for line %s FAILED. The line is blocked until it is cleaned again and re-cleared, or the failure is overridden by a recorded decision.',
             coalesce(l.code,'?'))
    WHEN 'cancelled' THEN
      format('The clearance for line %s was cancelled. The line must be cleared again before anything is dispensed.',
             coalesce(l.code,'?'))
    ELSE
      format('The clearance for line %s is "%s", which is not a cleared state.',
             coalesce(l.code,'?'), c.status)
  END;
END;
$$;

COMMENT ON FUNCTION public.line_clearance_block_reason(uuid) IS
  'NULL when the batch''s line has a verified clearance, otherwise a sentence naming the line and the reason. Blocks a batch with no line and a batch with no clearance: every path that cannot prove the line is clear must report it as blocked, because the failure mode of the opposite default is cross-contamination.';

REVOKE ALL ON FUNCTION public.line_clearance_block_reason(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.line_clearance_block_reason(uuid) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.line_clearance_assert_cleared(p_batch_id uuid)
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_reason text;
BEGIN
  v_reason := public.line_clearance_block_reason(p_batch_id);
  IF v_reason IS NOT NULL THEN
    RAISE EXCEPTION 'LINE_NOT_CLEARED: %', v_reason USING ERRCODE = 'P0001';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.line_clearance_assert_cleared(uuid) IS
  'Raises LINE_NOT_CLEARED unless the batch''s line carries a verified clearance. The hard block item 08 owes item 09: dispensing must call this before it moves any quantity. Until item 09 lands, nothing calls it, and item 08''s "dispensing never checks it" clause is therefore not yet closed.';

REVOKE ALL ON FUNCTION public.line_clearance_assert_cleared(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.line_clearance_assert_cleared(uuid) TO authenticated, service_role;


-- ── 9. The RPCs ──────────────────────────────────────────────────────

--  ── line_clearance_open ─────────────────────────────────────────────
--  Opens a clearance for a batch and snapshots the line's checklist.
CREATE OR REPLACE FUNCTION public.line_clearance_open(
  p_batch_id          uuid,
  p_previous_batch_id uuid DEFAULT NULL,
  p_notes             text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  b record; v_actor uuid := auth.uid(); v_id uuid; n integer; v_prev text;
BEGIN
  SELECT id, company_id, batch_number, line_id, execution_closed_at
    INTO b FROM public.batch_records WHERE id = p_batch_id;
  IF b.id IS NULL THEN
    RAISE EXCEPTION 'LINE_CLEARANCE_NO_BATCH: no such batch record %', p_batch_id
      USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.app_is_service_context()
     AND NOT public.app_is_company_member(b.company_id) THEN
    RAISE EXCEPTION 'LINE_CLEARANCE_FORBIDDEN: caller is not a member of the owning company'
      USING ERRCODE = 'P0001';
  END IF;
  IF b.line_id IS NULL THEN
    RAISE EXCEPTION
      'LINE_CLEARANCE_NO_LINE: batch % is not assigned to a production line, so there is no line to clear',
      b.batch_number USING ERRCODE = 'P0001';
  END IF;
  IF b.execution_closed_at IS NOT NULL THEN
    RAISE EXCEPTION
      'BATCH_CLOSED: batch % was closed at % and cannot be cleared for manufacturing',
      b.batch_number, b.execution_closed_at USING ERRCODE = 'P0001';
  END IF;

  --  One live clearance per batch. Two would mean the gate had to choose,
  --  and whichever rule it chose would be the wrong one half the time.
  IF EXISTS (SELECT 1 FROM public.line_clearance_records
              WHERE batch_id = p_batch_id
                AND status IN ('in_progress','performed','failed')) THEN
    RAISE EXCEPTION
      'LINE_CLEARANCE_ALREADY_OPEN: batch % already has a clearance that is not finished; finish, cancel or restart it',
      b.batch_number USING ERRCODE = 'P0001';
  END IF;

  IF p_previous_batch_id IS NOT NULL THEN
    SELECT product_name INTO v_prev FROM public.batch_records
     WHERE id = p_previous_batch_id AND company_id = b.company_id;
    IF v_prev IS NULL THEN
      RAISE EXCEPTION
        'LINE_CLEARANCE_PREVIOUS_BATCH_UNKNOWN: previous batch % is not a batch of this company',
        p_previous_batch_id USING ERRCODE = 'P0001';
    END IF;
  END IF;

  INSERT INTO public.line_clearance_records
    (company_id, line_id, batch_id, previous_batch_id, previous_product_name, notes, created_by)
  VALUES (b.company_id, b.line_id, p_batch_id, p_previous_batch_id, v_prev,
          nullif(btrim(coalesce(p_notes,'')),''), v_actor)
  RETURNING id INTO v_id;

  --  The snapshot. Only active items, and only this line's.
  INSERT INTO public.line_clearance_check_results
    (company_id, clearance_id, item_code, label, requires_record_reference, is_required, sort_order)
  SELECT b.company_id, v_id, i.item_code, i.label, i.requires_record_reference, i.is_required, i.sort_order
    FROM public.line_clearance_checklist_items i
   WHERE i.line_id = b.line_id AND i.is_active
   ORDER BY i.sort_order;
  GET DIAGNOSTICS n = ROW_COUNT;

  --  A clearance with nothing to check would be signed in one click and
  --  mean nothing. The line's checklist is seeded on creation, so this is
  --  only reachable if every item was retired.
  IF n = 0 THEN
    RAISE EXCEPTION
      'LINE_CLEARANCE_EMPTY_CHECKLIST: line % has no active checklist items, so a clearance would assert nothing',
      b.line_id USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object('ok', true, 'clearance_id', v_id, 'items', n);
END;
$$;

COMMENT ON FUNCTION public.line_clearance_open(uuid,uuid,text) IS
  'Opens a line clearance for a batch and snapshots the line''s active checklist onto it. Refuses a batch with no line, a second live clearance, and a line whose checklist is empty.';

REVOKE ALL ON FUNCTION public.line_clearance_open(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.line_clearance_open(uuid,uuid,text) TO authenticated, service_role;


--  ── line_clearance_answer ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.line_clearance_answer(
  p_clearance_id uuid,
  p_item_code    text,
  p_result       text,
  p_record_reference text DEFAULT NULL,
  p_note         text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE c record; v_actor uuid := auth.uid(); it record;
BEGIN
  SELECT id, company_id, status INTO c
    FROM public.line_clearance_records WHERE id = p_clearance_id;
  IF c.id IS NULL THEN
    RAISE EXCEPTION 'LINE_CLEARANCE_NOT_FOUND: no such clearance %', p_clearance_id
      USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.app_is_service_context()
     AND NOT public.app_is_company_member(c.company_id) THEN
    RAISE EXCEPTION 'LINE_CLEARANCE_FORBIDDEN: caller is not a member of the owning company'
      USING ERRCODE = 'P0001';
  END IF;
  IF c.status <> 'in_progress' THEN
    RAISE EXCEPTION
      'LINE_CLEARANCE_NOT_OPEN: clearance is "%", so its checklist can no longer be answered',
      c.status USING ERRCODE = 'P0001';
  END IF;
  IF p_result NOT IN ('pass','fail','not_applicable') THEN
    RAISE EXCEPTION 'LINE_CLEARANCE_BAD_RESULT: result must be pass, fail or not_applicable'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT id, label, requires_record_reference INTO it
    FROM public.line_clearance_check_results
   WHERE clearance_id = p_clearance_id AND item_code = p_item_code;
  IF it.id IS NULL THEN
    RAISE EXCEPTION 'LINE_CLEARANCE_NO_ITEM: this clearance has no item "%"', p_item_code
      USING ERRCODE = 'P0002';
  END IF;

  --  The two table CHECKs say the same things; these say them in
  --  sentences, because a constraint name is not an instruction.
  IF p_result = 'pass' AND it.requires_record_reference
     AND coalesce(btrim(p_record_reference),'') = '' THEN
    RAISE EXCEPTION
      'LINE_CLEARANCE_RECORD_REQUIRED: "%" cannot pass without a reference to the record that evidences it',
      it.label USING ERRCODE = 'P0001';
  END IF;
  IF p_result = 'not_applicable' AND coalesce(btrim(p_note),'') = '' THEN
    RAISE EXCEPTION
      'LINE_CLEARANCE_NA_NEEDS_NOTE: marking "%" not applicable requires a reason',
      it.label USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.line_clearance_check_results
     SET result = p_result,
         record_reference = nullif(btrim(coalesce(p_record_reference,'')),''),
         note = nullif(btrim(coalesce(p_note,'')),''),
         answered_by = v_actor,
         answered_at = now()
   WHERE id = it.id;

  --  A failed checklist item blocks the line as surely as a failed
  --  changeover result does.
  IF p_result = 'fail' THEN
    PERFORM public.lifecycle_transition('line_clearance', p_clearance_id, 'fail',
      c.company_id, v_actor,
      format('Checklist item failed: %s%s', it.label,
             CASE WHEN coalesce(btrim(p_note),'') <> '' THEN ' — '||btrim(p_note) ELSE '' END));
  END IF;

  RETURN jsonb_build_object('ok', true, 'item_code', p_item_code, 'result', p_result);
END;
$$;

COMMENT ON FUNCTION public.line_clearance_answer(uuid,text,text,text,text) IS
  'Records one checklist answer. A pass on an item that demands evidence needs the record reference; not_applicable needs a reason; a fail moves the clearance to failed immediately.';

REVOKE ALL ON FUNCTION public.line_clearance_answer(uuid,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.line_clearance_answer(uuid,text,text,text,text) TO authenticated, service_role;


--  ── line_changeover_record ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.line_changeover_record(
  p_clearance_id uuid,
  p_method       text,
  p_result       text,
  p_detail       text DEFAULT NULL,
  p_measured_value numeric DEFAULT NULL,
  p_limit_value    numeric DEFAULT NULL,
  p_unit           text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE c record; v_actor uuid := auth.uid(); v_id uuid;
BEGIN
  SELECT id, company_id, status INTO c
    FROM public.line_clearance_records WHERE id = p_clearance_id;
  IF c.id IS NULL THEN
    RAISE EXCEPTION 'LINE_CLEARANCE_NOT_FOUND: no such clearance %', p_clearance_id
      USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.app_is_service_context()
     AND NOT public.app_is_company_member(c.company_id) THEN
    RAISE EXCEPTION 'LINE_CLEARANCE_FORBIDDEN: caller is not a member of the owning company'
      USING ERRCODE = 'P0001';
  END IF;
  IF c.status NOT IN ('in_progress','performed') THEN
    RAISE EXCEPTION
      'LINE_CLEARANCE_NOT_OPEN: clearance is "%", so a changeover result cannot be added to it',
      c.status USING ERRCODE = 'P0001';
  END IF;
  IF p_result NOT IN ('pass','fail') THEN
    RAISE EXCEPTION 'LINE_CHANGEOVER_BAD_RESULT: result must be pass or fail'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.line_changeover_verifications
    (company_id, clearance_id, method, result, detail, measured_value, limit_value, unit, performed_by)
  VALUES (c.company_id, p_clearance_id, btrim(p_method), p_result,
          nullif(btrim(coalesce(p_detail,'')),''), p_measured_value, p_limit_value,
          nullif(btrim(coalesce(p_unit,'')),''),
          coalesce(v_actor,'00000000-0000-0000-0000-000000000000'::uuid))
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'verification_id', v_id, 'result', p_result);
END;
$$;

COMMENT ON FUNCTION public.line_changeover_record(uuid,text,text,text,numeric,numeric,text) IS
  'Records a changeover verification result against a clearance. A failing result blocks the line by trigger rather than by the caller remembering to.';

REVOKE ALL ON FUNCTION public.line_changeover_record(uuid,text,text,text,numeric,numeric,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.line_changeover_record(uuid,text,text,text,numeric,numeric,text)
  TO authenticated, service_role;


--  ── line_clearance_perform ──────────────────────────────────────────
--  The first of the two signatures.
CREATE OR REPLACE FUNCTION public.line_clearance_perform(
  p_clearance_id uuid,
  p_signature_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE c record; v_actor uuid := auth.uid(); v_open record; v_res jsonb; n_pass integer;
BEGIN
  SELECT id, company_id, status INTO c
    FROM public.line_clearance_records WHERE id = p_clearance_id;
  IF c.id IS NULL THEN
    RAISE EXCEPTION 'LINE_CLEARANCE_NOT_FOUND: no such clearance %', p_clearance_id
      USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.app_is_service_context()
     AND NOT public.app_is_company_member(c.company_id) THEN
    RAISE EXCEPTION 'LINE_CLEARANCE_FORBIDDEN: caller is not a member of the owning company'
      USING ERRCODE = 'P0001';
  END IF;

  --  Every required item answered, and answered pass or not-applicable.
  --  An unanswered item is not a pass.
  SELECT item_code, label, result INTO v_open
    FROM public.line_clearance_check_results
   WHERE clearance_id = p_clearance_id
     AND is_required
     AND (result IS NULL OR result = 'fail')
   ORDER BY sort_order
   LIMIT 1;

  IF v_open.item_code IS NOT NULL THEN
    RAISE EXCEPTION
      'LINE_CLEARANCE_INCOMPLETE: "%" is %, so the clearance cannot be signed',
      v_open.label,
      CASE WHEN v_open.result IS NULL THEN 'unanswered' ELSE 'failed' END
      USING ERRCODE = 'P0001';
  END IF;

  --  "A result is required before clearance completes." Checked at the
  --  performer's signature rather than at the verifier's, so the person
  --  who did the work is the one told that the verification is missing.
  SELECT count(*) INTO n_pass
    FROM public.line_changeover_verifications
   WHERE clearance_id = p_clearance_id AND result = 'pass';

  IF n_pass = 0 THEN
    RAISE EXCEPTION
      'LINE_CHANGEOVER_REQUIRED: a changeover verification with a passing result is required before the clearance can be signed'
      USING ERRCODE = 'P0001';
  END IF;

  --  Written before the transition: the engine consumes the signature and
  --  the record hash covers entity_current_state, not this table, so
  --  these writes cannot make the signature stale.
  UPDATE public.line_clearance_records
     SET performed_by = v_actor, performed_at = now(), performed_signature_id = p_signature_id
   WHERE id = p_clearance_id;

  v_res := public.lifecycle_transition('line_clearance', p_clearance_id, 'perform',
                                       c.company_id, v_actor, NULL, '{}'::jsonb, p_signature_id);
  RETURN v_res;
END;
$$;

COMMENT ON FUNCTION public.line_clearance_perform(uuid,uuid) IS
  'The performer''s signature. Refused unless every required checklist item passed (or was reasoned not applicable) and a passing changeover verification is on file.';

REVOKE ALL ON FUNCTION public.line_clearance_perform(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.line_clearance_perform(uuid,uuid) TO authenticated, service_role;


--  ── line_clearance_verify ───────────────────────────────────────────
--  The second signature, by a second person.
CREATE OR REPLACE FUNCTION public.line_clearance_verify(
  p_clearance_id uuid,
  p_signature_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE c record; v_actor uuid := auth.uid(); v_res jsonb;
BEGIN
  SELECT id, company_id, status, performed_by INTO c
    FROM public.line_clearance_records WHERE id = p_clearance_id;
  IF c.id IS NULL THEN
    RAISE EXCEPTION 'LINE_CLEARANCE_NOT_FOUND: no such clearance %', p_clearance_id
      USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.app_is_service_context()
     AND NOT public.app_is_company_member(c.company_id) THEN
    RAISE EXCEPTION 'LINE_CLEARANCE_FORBIDDEN: caller is not a member of the owning company'
      USING ERRCODE = 'P0001';
  END IF;

  --  THE NOT DONE IF, in words: "One user can both perform and verify."
  --  Said here so the refusal is a sentence, and again as a table CHECK
  --  so no write path can produce it.
  IF c.performed_by IS NOT NULL
     AND c.performed_by = coalesce(v_actor,'00000000-0000-0000-0000-000000000000'::uuid) THEN
    RAISE EXCEPTION
      'LINE_CLEARANCE_SELF_VERIFIED: the person who performed the clearance cannot also verify it'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.line_clearance_records
     SET verified_by = v_actor, verified_at = now(), verified_signature_id = p_signature_id
   WHERE id = p_clearance_id;

  v_res := public.lifecycle_transition('line_clearance', p_clearance_id, 'verify',
                                       c.company_id, v_actor, NULL, '{}'::jsonb, p_signature_id);
  RETURN v_res;
END;
$$;

COMMENT ON FUNCTION public.line_clearance_verify(uuid,uuid) IS
  'The verifier''s signature, which is what opens the line. Refuses the performer, and the engine refuses a signature belonging to anyone but the caller — so the two signatures are genuinely two people.';

REVOKE ALL ON FUNCTION public.line_clearance_verify(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.line_clearance_verify(uuid,uuid) TO authenticated, service_role;


--  ── line_clearance_override ─────────────────────────────────────────
--  Proceeding past a failed changeover verification, with the decision on
--  file. The override row is written FIRST, in the same transaction, so
--  the guard on entity_current_state finds it.
CREATE OR REPLACE FUNCTION public.line_clearance_override(
  p_clearance_id uuid,
  p_reason       text,
  p_signature_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE c record; v_actor uuid := auth.uid(); v_fail record; v_res jsonb;
BEGIN
  SELECT id, company_id, status INTO c
    FROM public.line_clearance_records WHERE id = p_clearance_id;
  IF c.id IS NULL THEN
    RAISE EXCEPTION 'LINE_CLEARANCE_NOT_FOUND: no such clearance %', p_clearance_id
      USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.app_is_service_context()
     AND NOT public.app_is_company_member(c.company_id) THEN
    RAISE EXCEPTION 'LINE_CLEARANCE_FORBIDDEN: caller is not a member of the owning company'
      USING ERRCODE = 'P0001';
  END IF;
  IF c.status <> 'failed' THEN
    RAISE EXCEPTION
      'LINE_CLEARANCE_NOT_FAILED: clearance is "%", so there is nothing to override',
      c.status USING ERRCODE = 'P0001';
  END IF;
  IF coalesce(btrim(p_reason),'') = '' THEN
    RAISE EXCEPTION
      'LINE_CLEARANCE_OVERRIDE_NO_REASON: overriding a failed verification requires a reason'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT id, method, detail INTO v_fail
    FROM public.line_changeover_verifications
   WHERE clearance_id = p_clearance_id AND result = 'fail'
   ORDER BY performed_at DESC, created_at DESC
   LIMIT 1;

  IF v_fail.id IS NULL THEN
    RAISE EXCEPTION
      'LINE_CLEARANCE_OVERRIDE_NOT_APPLICABLE: this clearance failed on its checklist, not on a changeover verification; clean again and restart rather than overriding'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.line_clearance_overrides
    (company_id, clearance_id, verification_id, authorised_by, reason, signature_id)
  VALUES (c.company_id, p_clearance_id, v_fail.id,
          coalesce(v_actor,'00000000-0000-0000-0000-000000000000'::uuid),
          btrim(p_reason), p_signature_id);

  v_res := public.lifecycle_transition('line_clearance', p_clearance_id, 'override',
                                       c.company_id, v_actor, btrim(p_reason),
                                       '{}'::jsonb, p_signature_id);
  RETURN v_res || jsonb_build_object('overrode_verification', v_fail.id);
END;
$$;

COMMENT ON FUNCTION public.line_clearance_override(uuid,text,uuid) IS
  'Records a decision to proceed past a failed changeover verification and moves the clearance back to performed, where it still needs a second person to verify it. The decision row is written first so the guard on entity_current_state can find it; without that row the move is refused.';

REVOKE ALL ON FUNCTION public.line_clearance_override(uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.line_clearance_override(uuid,text,uuid) TO authenticated, service_role;


--  ── line_clearance_restart ──────────────────────────────────────────
--  The other way out of failed: clean again and answer the checklist
--  afresh. The previous answers are cleared, because they described a
--  line that has since been cleaned.
CREATE OR REPLACE FUNCTION public.line_clearance_restart(
  p_clearance_id uuid,
  p_reason       text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE c record; v_actor uuid := auth.uid(); v_res jsonb;
BEGIN
  SELECT id, company_id, status INTO c
    FROM public.line_clearance_records WHERE id = p_clearance_id;
  IF c.id IS NULL THEN
    RAISE EXCEPTION 'LINE_CLEARANCE_NOT_FOUND: no such clearance %', p_clearance_id
      USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.app_is_service_context()
     AND NOT public.app_is_company_member(c.company_id) THEN
    RAISE EXCEPTION 'LINE_CLEARANCE_FORBIDDEN: caller is not a member of the owning company'
      USING ERRCODE = 'P0001';
  END IF;
  IF coalesce(btrim(p_reason),'') = '' THEN
    RAISE EXCEPTION 'LINE_CLEARANCE_RESTART_NO_REASON: restarting a clearance requires a reason'
      USING ERRCODE = 'P0001';
  END IF;

  --  The transition first: if the engine refuses the move, the answers
  --  are left alone rather than wiped by a restart that did not happen.
  v_res := public.lifecycle_transition('line_clearance', p_clearance_id, 'restart',
                                       c.company_id, v_actor, btrim(p_reason));

  UPDATE public.line_clearance_check_results
     SET result = NULL, record_reference = NULL, note = NULL,
         answered_by = NULL, answered_at = NULL
   WHERE clearance_id = p_clearance_id;

  --  The performer's signature described the old state of the line.
  UPDATE public.line_clearance_records
     SET performed_by = NULL, performed_at = NULL, performed_signature_id = NULL
   WHERE id = p_clearance_id;

  RETURN v_res;
END;
$$;

COMMENT ON FUNCTION public.line_clearance_restart(uuid,text) IS
  'Returns a failed clearance to in_progress and clears its answers, because they described a line that has since been cleaned again. The changeover verifications are NOT cleared — they are evidence, and the failure stays on the record.';

REVOKE ALL ON FUNCTION public.line_clearance_restart(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.line_clearance_restart(uuid,text) TO authenticated, service_role;


--  ── batch_record_assign_line ────────────────────────────────────────
--  Item 07 had no concept of a line, so batch_record_initiate() does not
--  take one. Rather than grow a second overload of it, assigning the line
--  is its own act here — which is the right shape anyway, because moving
--  a batch to a different line has to be refused once that line has been
--  cleared for it.
CREATE OR REPLACE FUNCTION public.batch_record_assign_line(
  p_batch_id uuid,
  p_line_id  uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE b record; l record; v_clear record;
BEGIN
  SELECT id, company_id, batch_number, line_id, execution_closed_at INTO b
    FROM public.batch_records WHERE id = p_batch_id;
  IF b.id IS NULL THEN
    RAISE EXCEPTION 'LINE_CLEARANCE_NO_BATCH: no such batch record %', p_batch_id
      USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.app_is_service_context()
     AND NOT public.app_is_company_member(b.company_id) THEN
    RAISE EXCEPTION 'LINE_CLEARANCE_FORBIDDEN: caller is not a member of the owning company'
      USING ERRCODE = 'P0001';
  END IF;
  IF b.execution_closed_at IS NOT NULL THEN
    RAISE EXCEPTION 'BATCH_CLOSED: batch % was closed at % and cannot be moved to another line',
      b.batch_number, b.execution_closed_at USING ERRCODE = 'P0001';
  END IF;

  SELECT id, company_id, code, is_active INTO l
    FROM public.production_lines WHERE id = p_line_id;
  IF l.id IS NULL THEN
    RAISE EXCEPTION 'LINE_NOT_FOUND: no such production line %', p_line_id USING ERRCODE = 'P0002';
  END IF;
  IF l.company_id <> b.company_id THEN
    RAISE EXCEPTION 'LINE_FOREIGN: line % belongs to another company', p_line_id
      USING ERRCODE = 'P0001';
  END IF;
  IF NOT l.is_active THEN
    RAISE EXCEPTION 'LINE_INACTIVE: line % is not in service', l.code USING ERRCODE = 'P0001';
  END IF;

  --  A clearance is the statement that THIS line is fit to run this
  --  batch. Moving the batch afterwards would leave that statement
  --  attached to a line the batch no longer runs on, and the gate would
  --  read it as clearance for the new one.
  IF b.line_id IS DISTINCT FROM p_line_id THEN
    SELECT id, status INTO v_clear FROM public.line_clearance_records
     WHERE batch_id = p_batch_id AND status <> 'cancelled'
     ORDER BY created_at DESC LIMIT 1;
    IF v_clear.id IS NOT NULL THEN
      RAISE EXCEPTION
        'LINE_CLEARANCE_EXISTS: batch % already has a clearance (%) against its current line; cancel it before moving the batch',
        b.batch_number, v_clear.status USING ERRCODE = 'P0001';
    END IF;
  END IF;

  PERFORM set_config('app.batch_status_sync','',true);
  UPDATE public.batch_records SET line_id = p_line_id WHERE id = p_batch_id;

  RETURN jsonb_build_object('ok', true, 'batch_id', p_batch_id, 'line_id', p_line_id, 'line_code', l.code);
END;
$$;

COMMENT ON FUNCTION public.batch_record_assign_line(uuid,uuid) IS
  'Puts a batch on a production line. Refuses a foreign or retired line, a closed batch, and a move away from a line that has already been cleared for this batch.';

REVOKE ALL ON FUNCTION public.batch_record_assign_line(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.batch_record_assign_line(uuid,uuid) TO authenticated, service_role;


-- ── 10. THE RULE ABOUT CONSTRAINTS, and a guard that enforces it ──────
--
--  A constraint declared inside `CREATE TABLE IF NOT EXISTS` only ever
--  reaches a database that does not yet have the table. On any database
--  that already has it, the whole statement is skipped — so the
--  constraint never arrives, and if it is ever dropped, re-running this
--  migration will NOT put it back. Every constraint above that enforces
--  something the brief asks for is therefore declared in its own guarded
--  DO block instead.
--
--  That is a rule nobody will remember, so it is checked rather than
--  written down and hoped for. This block raises at deploy time if any
--  control this migration is supposed to install is missing — which is
--  how it was found in the first place: mutation testing dropped two
--  CHECKs, the migration was re-applied, and the suite went green on a
--  database that no longer had them.
DO $item08_guard$
DECLARE
  v_missing text[] := '{}';
  v_expected_constraints text[] := ARRAY[
    'lcr_two_person_chk',
    'lccr_na_needs_note_chk',
    'lccr_record_needed_chk',
    'lcv_fail_needs_detail_chk',
    'lco_one_per_verification'
  ];
  v_expected_triggers text[] := ARRAY[
    'trg_production_lines_seed_checklist',
    'trg_lcr_lifecycle_init',
    'trg_lcr_status_sync',
    'trg_lcr_guard_status',
    'trg_lccr_freeze',
    'trg_lcv_immutable',
    'trg_lcv_fail_blocks_line',
    'trg_lco_immutable',
    'trg_lcr_override_needs_decision'
  ];
  c text;
BEGIN
  FOREACH c IN ARRAY v_expected_constraints LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = c) THEN
      v_missing := v_missing || ('constraint '||c);
    END IF;
  END LOOP;

  FOREACH c IN ARRAY v_expected_triggers LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = c AND NOT tgisinternal) THEN
      v_missing := v_missing || ('trigger '||c);
    END IF;
  END LOOP;

  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION
      'ITEM08_CONTROLS_MISSING: this migration applied but the following controls are not present: %. A dropped control is not repaired by re-running a CREATE TABLE IF NOT EXISTS; add it in its own guarded DO block.',
      array_to_string(v_missing, ', ')
      USING ERRCODE = 'P0001';
  END IF;
END
$item08_guard$;
