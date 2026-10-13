-- ===================================================================
--  WEEK 4 / ITEM 09 — DISPENSING AND GENEALOGY LINKS
--
--  "Dispensing records material, internal lot, required quantity, actual
--   quantity, balance used, dispenser and verifier.
--   Only approved lots can be dispensed, enforced at the service layer.
--   Dispensing writes the genealogy link between lot and batch and
--   decrements the lot quantity in the same transaction.
--   A quantity outside formula tolerance flags in real time and needs
--   supervisor authorisation with a reason to save.
--   Links are stored in a form next week's trace queries can use."
--
--  NOT DONE IF
--    A quarantined or rejected lot can be dispensed through a direct call.
--    The link is written but the quantity is not decremented, or the
--      reverse.
--    Two operators dispensing one lot at the same moment can take it
--      below zero.
--
--  WHAT THIS ITEM FINALLY CONNECTS
--  -------------------------------
--  Item 04 shipped material_lot_assert_dispensable() and said "dispensing
--  itself arrives in Week 5 and must call this". Item 08 shipped
--  line_clearance_assert_cleared() and said the same. This is the caller.
--  Both are invoked from a BEFORE INSERT trigger rather than only from
--  the RPC, because item 09's own NOT DONE IF is about a DIRECT CALL —
--  so the control has to sit where every writer meets it.
--
--  WHY THERE IS NO LIFECYCLE HERE
--  ------------------------------
--  Items 07 and 08 register with the lifecycle engine because a batch and
--  a clearance are things that MOVE — they have states a person drives
--  them through. A dispensing is not: it is a fact about a moment, which
--  is then verified by a second person. Giving it a two-state lifecycle
--  would add a definition, a mirror and three triggers to express one
--  nullable timestamp, and the engine's weight is worth paying only where
--  a workflow genuinely exists.
--
--  NO LIFECYCLE DOES NOT MEAN NO CONTROL. The quantity decrement, the
--  genealogy link, the lot check, the clearance check, the unit check and
--  the tolerance authorisation are all enforced in the database.
-- ===================================================================


-- ── 1. The formula has to say what "outside tolerance" means ──────────
--
--  master_formula_materials carries quantity_per_batch and overage_pct
--  but no tolerance, and item 09 needs one: "a quantity outside formula
--  tolerance ... needs supervisor authorisation".
--
--  TOLERANCE IS NOT OVERAGE. Overage is deliberate excess for a known
--  process loss and changes the TARGET. Tolerance is how far the scale
--  may land from that target before somebody senior has to agree. The two
--  were conflated in an earlier draft of this migration and the result
--  was a system that treated a 10% overage as a 10% licence to miss.
ALTER TABLE public.master_formula_materials
  ADD COLUMN IF NOT EXISTS tolerance_pct numeric(6,3);

DO $tolerance_chk$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='mfm_tolerance_chk') THEN
    ALTER TABLE public.master_formula_materials ADD CONSTRAINT mfm_tolerance_chk
      CHECK (tolerance_pct IS NULL OR (tolerance_pct >= 0 AND tolerance_pct <= 100));
  END IF;
END
$tolerance_chk$;

COMMENT ON COLUMN public.master_formula_materials.tolerance_pct IS
  'How far a dispensed quantity may land from the required quantity before a supervisor must authorise it, as a percentage. NULL means the formula has not declared one — and the dispensing gate then treats EVERY quantity as needing authorisation rather than inventing a tolerance. That is deliberate: a plausible default here (±2%, say) would be a pharmacopoeial-looking number this system made up, and a weighing tolerance belongs to the product. The refusal names the formula line so the remedy is obvious.';


-- ── 2. The dispensing record ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.dispensing_records (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  --  What it was dispensed FOR.
  batch_id          uuid NOT NULL REFERENCES public.batch_records(id) ON DELETE RESTRICT,
  --  Which stage consumed it, when the formula says. Nullable because a
  --  formula line need not name a stage (master_formula_materials
  --  .consumed_at_stage is itself nullable).
  batch_stage_id    uuid REFERENCES public.batch_stages(id) ON DELETE RESTRICT,
  --  The formula line this satisfies. RESTRICT: a line that was dispensed
  --  against is part of the record of what was made.
  formula_material_id uuid REFERENCES public.master_formula_materials(id) ON DELETE RESTRICT,

  --  WHAT was dispensed. material_id is carried as well as the lot, so a
  --  trace query does not have to join through a lot to ask "which
  --  batches used this material".
  material_id       uuid NOT NULL REFERENCES public.materials(id) ON DELETE RESTRICT,
  material_lot_id   uuid NOT NULL REFERENCES public.material_lots(id) ON DELETE RESTRICT,
  --  The INTERNAL lot number, snapshotted. The brief names it separately
  --  from the lot, and a printed batch record has to still read correctly
  --  if the lot row is ever renumbered.
  internal_lot_number text NOT NULL,

  required_quantity numeric(16,6) NOT NULL,
  actual_quantity   numeric(16,6) NOT NULL,
  unit              text NOT NULL,

  --  "balance used". Text for now: the instrument registry is item 10,
  --  which also brings the calibration lockout. instrument_id is the
  --  marked link point for it — no foreign key yet because the table does
  --  not exist.
  balance_identifier text NOT NULL,
  instrument_id     uuid,

  dispensed_by      uuid NOT NULL,
  dispensed_at      timestamptz NOT NULL DEFAULT now(),
  dispense_signature_id uuid REFERENCES public.electronic_signatures(id) ON DELETE RESTRICT,

  --  The second person. Nullable at insert: the material physically left
  --  the store when it was dispensed, so the record exists from that
  --  moment and the verification follows.
  verified_by       uuid,
  verified_at       timestamptz,
  verify_signature_id uuid REFERENCES public.electronic_signatures(id) ON DELETE RESTRICT,

  --  Out-of-tolerance authorisation. Set together or not at all; see the
  --  constraints below.
  tolerance_exception boolean NOT NULL DEFAULT false,
  authorised_by     uuid,
  authorisation_reason text,
  authorisation_signature_id uuid REFERENCES public.electronic_signatures(id) ON DELETE RESTRICT,

  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.dispensing_records IS
  'One dispensing: this lot of this material, this quantity, onto this batch, weighed on this balance by this person and verified by another. The row is the event; the lot decrement and the genealogy link are written from it by trigger, in the same transaction, so neither can exist without the other.';
COMMENT ON COLUMN public.dispensing_records.instrument_id IS
  'WEEK 4 ITEM 10 LINKAGE. Intended to reference the registered instrument the balance_identifier names, so the calibration lockout can refuse a sign-off on an out-of-calibration balance. No foreign key yet because the instrument registry does not exist; add it when item 10 lands.';

CREATE INDEX IF NOT EXISTS dr_batch_idx    ON public.dispensing_records(batch_id, dispensed_at);
CREATE INDEX IF NOT EXISTS dr_lot_idx      ON public.dispensing_records(material_lot_id, dispensed_at);
CREATE INDEX IF NOT EXISTS dr_material_idx ON public.dispensing_records(material_id);
CREATE INDEX IF NOT EXISTS dr_company_idx  ON public.dispensing_records(company_id, dispensed_at DESC);
CREATE INDEX IF NOT EXISTS dr_unverified_idx
  ON public.dispensing_records(company_id, dispensed_at) WHERE verified_at IS NULL;

--  Constraints in guarded blocks, not inside the CREATE TABLE. A
--  constraint written inside CREATE TABLE IF NOT EXISTS reaches a fresh
--  database and nowhere else, and cannot be repaired by re-running the
--  migration. The guard at the foot of this file checks they are all
--  present.
DO $dr_checks$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='dr_quantities_chk') THEN
    ALTER TABLE public.dispensing_records ADD CONSTRAINT dr_quantities_chk
      CHECK (required_quantity > 0 AND actual_quantity > 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='dr_unit_chk') THEN
    ALTER TABLE public.dispensing_records ADD CONSTRAINT dr_unit_chk
      CHECK (btrim(unit) <> '');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='dr_balance_chk') THEN
    ALTER TABLE public.dispensing_records ADD CONSTRAINT dr_balance_chk
      CHECK (btrim(balance_identifier) <> '');
  END IF;

  --  "needs supervisor authorisation WITH A REASON to save". An exception
  --  flag with no authoriser, or an authoriser with no reason, is the
  --  shape of an authorisation that was never really given.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='dr_authorisation_complete_chk') THEN
    ALTER TABLE public.dispensing_records ADD CONSTRAINT dr_authorisation_complete_chk
      CHECK (
        NOT tolerance_exception
        OR (authorised_by IS NOT NULL AND btrim(coalesce(authorisation_reason,'')) <> '')
      );
  END IF;

  --  And the reverse: an authorisation recorded against a dispensing that
  --  was never out of tolerance is a signature attached to nothing.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='dr_authorisation_needed_chk') THEN
    ALTER TABLE public.dispensing_records ADD CONSTRAINT dr_authorisation_needed_chk
      CHECK (tolerance_exception OR authorised_by IS NULL);
  END IF;

  --  Two people, for the same reason items 07 and 08 need two.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='dr_verifier_distinct_chk') THEN
    ALTER TABLE public.dispensing_records ADD CONSTRAINT dr_verifier_distinct_chk
      CHECK (verified_by IS NULL OR verified_by <> dispensed_by);
  END IF;

  --  A supervisor authorising their own deviation is the same failure one
  --  step along.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='dr_authoriser_distinct_chk') THEN
    ALTER TABLE public.dispensing_records ADD CONSTRAINT dr_authoriser_distinct_chk
      CHECK (authorised_by IS NULL OR authorised_by <> dispensed_by);
  END IF;

  --  verified_at and verified_by arrive together or not at all.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='dr_verified_pair_chk') THEN
    ALTER TABLE public.dispensing_records ADD CONSTRAINT dr_verified_pair_chk
      CHECK ((verified_by IS NULL) = (verified_at IS NULL));
  END IF;
END
$dr_checks$;

ALTER TABLE public.dispensing_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dr_select ON public.dispensing_records;
CREATE POLICY dr_select ON public.dispensing_records FOR SELECT TO authenticated
  USING (public.app_is_company_member(company_id));
DROP POLICY IF EXISTS dr_insert ON public.dispensing_records;
CREATE POLICY dr_insert ON public.dispensing_records FOR INSERT TO authenticated
  WITH CHECK (public.app_is_company_member(company_id));
DROP POLICY IF EXISTS dr_update ON public.dispensing_records;
CREATE POLICY dr_update ON public.dispensing_records FOR ALL TO authenticated
  USING (public.app_is_company_member(company_id))
  WITH CHECK (public.app_is_company_member(company_id));

--  A dispensing is a weighing that happened. It is not deletable: the
--  quantity has left the store and the genealogy link records where it
--  went. A mistake is corrected by a reversal, which is its own event.
REVOKE DELETE, TRUNCATE ON public.dispensing_records FROM authenticated, anon;


-- ── 3. Genealogy: the link next week's trace queries will use ─────────
--
--  "Links are stored in a form next week's trace queries can use. The
--   queries themselves are not built this week."
--
--  So: one row per (batch, lot) pair rather than one per dispensing,
--  indexed in BOTH directions, because the two questions a trace asks are
--  "what went into this batch" and "where did this lot go" and the second
--  one is the recall question. The per-dispensing detail is already in
--  dispensing_records; this is the edge of the graph.
--
--  Maintained entirely by trigger from dispensing_records. The aggregate
--  could drift from its source, so the suite asserts it cannot — see
--  section G of supabase/tests/dispensing_test.sql.

CREATE TABLE IF NOT EXISTS public.batch_material_genealogy (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  batch_id          uuid NOT NULL REFERENCES public.batch_records(id) ON DELETE RESTRICT,
  material_lot_id   uuid NOT NULL REFERENCES public.material_lots(id) ON DELETE RESTRICT,
  material_id       uuid NOT NULL REFERENCES public.materials(id) ON DELETE RESTRICT,
  total_quantity    numeric(16,6) NOT NULL DEFAULT 0,
  unit              text NOT NULL,
  dispensing_count  integer NOT NULL DEFAULT 0,
  first_dispensed_at timestamptz NOT NULL DEFAULT now(),
  last_dispensed_at  timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.batch_material_genealogy IS
  'The genealogy edge: this lot went into this batch, this much of it. One row per (batch, lot) pair, maintained by trigger from dispensing_records and indexed both ways — forward for "what went into this batch", backward for "where did this lot go", which is the recall question. Week 5 builds the trace queries on top; this is the shape they need.';

DO $bmg_checks$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='bmg_pair_uniq') THEN
    ALTER TABLE public.batch_material_genealogy ADD CONSTRAINT bmg_pair_uniq
      UNIQUE (batch_id, material_lot_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='bmg_quantity_chk') THEN
    ALTER TABLE public.batch_material_genealogy ADD CONSTRAINT bmg_quantity_chk
      CHECK (total_quantity >= 0 AND dispensing_count >= 0);
  END IF;
END
$bmg_checks$;

--  The backward index is the recall path and deserves to be explicit.
CREATE INDEX IF NOT EXISTS bmg_lot_idx   ON public.batch_material_genealogy(material_lot_id);
CREATE INDEX IF NOT EXISTS bmg_batch_idx ON public.batch_material_genealogy(batch_id);
CREATE INDEX IF NOT EXISTS bmg_material_idx ON public.batch_material_genealogy(material_id, company_id);

ALTER TABLE public.batch_material_genealogy ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bmg_select ON public.batch_material_genealogy;
CREATE POLICY bmg_select ON public.batch_material_genealogy FOR SELECT TO authenticated
  USING (public.app_is_company_member(company_id));

--  No write policy at all. The only legitimate writer is the trigger
--  below, which is SECURITY DEFINER and therefore unaffected. A genealogy
--  row that a client could write by hand is a genealogy nobody can trust.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.batch_material_genealogy FROM authenticated, anon;


-- ── 4. The gates, where every writer meets them ──────────────────────
--
--  "Only approved lots can be dispensed, enforced at the service layer"
--  and, from the NOT DONE IF, not ONLY there: "a quarantined or rejected
--  lot can be dispensed through a direct call" is the failure. So the
--  checks run BEFORE INSERT.

CREATE OR REPLACE FUNCTION public.fn_dispensing_gate()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  b record; l record; fm record; v_tol numeric; v_dev numeric; v_limit numeric;
BEGIN
  SELECT id, company_id, batch_number, formula_id, execution_closed_at, line_id
    INTO b FROM public.batch_records WHERE id = NEW.batch_id;
  IF b.id IS NULL THEN
    RAISE EXCEPTION 'DISPENSE_NO_BATCH: no such batch record %', NEW.batch_id USING ERRCODE='P0002';
  END IF;
  IF b.company_id <> NEW.company_id THEN
    RAISE EXCEPTION 'DISPENSE_BATCH_FOREIGN: batch % belongs to another company', NEW.batch_id
      USING ERRCODE='P0001';
  END IF;

  --  Nothing is dispensed to a closed record. Execution is over.
  IF b.execution_closed_at IS NOT NULL THEN
    RAISE EXCEPTION
      'BATCH_CLOSED: batch % was closed at % and nothing further can be dispensed to it',
      b.batch_number, b.execution_closed_at USING ERRCODE='P0001';
  END IF;

  -- ── ITEM 08's GATE, FINALLY CALLED ──────────────────────────────────
  --  This is the line item 08 could not close: "clearance is recorded but
  --  dispensing never checks it". It raises LINE_NOT_CLEARED.
  PERFORM public.line_clearance_assert_cleared(NEW.batch_id);

  -- ── ITEM 04's GATE, FINALLY CALLED ──────────────────────────────────
  --  Quarantined, under test, rejected, expired, past retest, or short of
  --  the quantity asked for: all refused, by the function item 04 shipped
  --  for this purpose. It raises MATERIAL_DISPENSE_BLOCKED.
  PERFORM public.material_lot_assert_dispensable(NEW.material_lot_id, NEW.actual_quantity);

  SELECT id, company_id, material_id, lot_number, unit_of_measure
    INTO l FROM public.material_lots WHERE id = NEW.material_lot_id;
  IF l.company_id <> NEW.company_id THEN
    RAISE EXCEPTION 'DISPENSE_LOT_FOREIGN: lot % belongs to another company', NEW.material_lot_id
      USING ERRCODE='P0001';
  END IF;

  --  The lot has to be of the material claimed. Without this, a dispensing
  --  row could name lactose and consume a lot of paracetamol, and the
  --  genealogy would record the lie.
  IF l.material_id <> NEW.material_id THEN
    RAISE EXCEPTION
      'DISPENSE_MATERIAL_MISMATCH: lot % is not a lot of the material named on this dispensing',
      l.lot_number USING ERRCODE='P0001';
  END IF;

  --  UNITS. 24 kg against a lot measured in grams is a hundredfold error
  --  that every other check here would wave through, because the numbers
  --  are all positive and all in range. No conversion is attempted: this
  --  system does not know that this material's kg is 1000 of its g, and
  --  guessing is worse than refusing.
  --
  --  The dispensing's own unit against the lot's. This one catches a
  --  direct INSERT; material_dispense() takes the unit FROM the lot, so
  --  through the RPC the two always agree and this never fires. Which is
  --  exactly why the formula check below exists as well — writing only
  --  this one and believing the units were checked was a real mistake in
  --  an earlier draft of this migration.
  IF l.unit_of_measure IS NOT NULL
     AND lower(btrim(l.unit_of_measure)) <> lower(btrim(NEW.unit)) THEN
    RAISE EXCEPTION
      'DISPENSE_UNIT_MISMATCH: lot % is held in % but this dispensing is in %; no conversion is applied, so record the dispensing in the lot''s unit',
      l.lot_number, l.unit_of_measure, NEW.unit USING ERRCODE='P0001';
  END IF;

  -- ── TOLERANCE ───────────────────────────────────────────────────────
  --  "A quantity outside formula tolerance ... needs supervisor
  --  authorisation with a reason to save." The flag is not the caller's
  --  to assert: it is derived here from the formula and the numbers, and
  --  a caller who claims to be inside tolerance when they are not is
  --  refused.
  IF NEW.formula_material_id IS NOT NULL THEN
    SELECT fmm.id, fmm.formula_id, fmm.tolerance_pct, fmm.quantity_per_batch, fmm.unit, m.name AS material_name
      INTO fm
      FROM public.master_formula_materials fmm
      JOIN public.materials m ON m.id = fmm.material_id
     WHERE fmm.id = NEW.formula_material_id;

    IF fm.id IS NULL THEN
      RAISE EXCEPTION 'DISPENSE_NO_FORMULA_LINE: no such formula material line %',
        NEW.formula_material_id USING ERRCODE='P0002';
    END IF;

    --  The line has to belong to the formula the batch was initiated on.
    --  A batch keeps the version it started on (item 06), so a line from
    --  a newer revision is not what this batch was told to do.
    IF b.formula_id IS NOT NULL AND fm.formula_id <> b.formula_id THEN
      RAISE EXCEPTION
        'DISPENSE_FORMULA_MISMATCH: that formula line belongs to a different formula version than the one batch % was initiated on',
        b.batch_number USING ERRCODE='P0001';
    END IF;

    --  THE UNIT CHECK THAT ACTUALLY BITES. The formula asks for 24 kg;
    --  the lot is held in g. Both numbers are positive, both in range,
    --  and the required and actual quantities are being compared in two
    --  different units — so the tolerance arithmetic below would be
    --  meaningless and nothing else here would notice.
    IF fm.unit IS NOT NULL AND l.unit_of_measure IS NOT NULL
       AND lower(btrim(fm.unit)) <> lower(btrim(l.unit_of_measure)) THEN
      RAISE EXCEPTION
        'DISPENSE_FORMULA_UNIT_MISMATCH: the formula asks for % in % but lot % is held in %; no conversion is applied, so either the formula line or the lot is in the wrong unit',
        fm.material_name, fm.unit, l.lot_number, l.unit_of_measure
        USING ERRCODE='P0001';
    END IF;

    v_tol := fm.tolerance_pct;
    v_dev := abs(NEW.actual_quantity - NEW.required_quantity);

    IF v_tol IS NULL THEN
      --  Fail closed. See the comment on tolerance_pct: the system does
      --  not invent a weighing tolerance, and it does not accept anything
      --  either. Any deviation at all needs authorisation, and an exact
      --  match needs none.
      IF v_dev > 0 AND NOT NEW.tolerance_exception THEN
        RAISE EXCEPTION
          'DISPENSE_NO_TOLERANCE_DECLARED: the formula line for % declares no tolerance, so a dispensed quantity that differs from the required one needs supervisor authorisation. Declare tolerance_pct on the formula line, or record the authorisation.',
          fm.material_name USING ERRCODE='P0001';
      END IF;
    ELSE
      v_limit := NEW.required_quantity * v_tol / 100.0;
      IF v_dev > v_limit AND NOT NEW.tolerance_exception THEN
        RAISE EXCEPTION
          'DISPENSE_OUT_OF_TOLERANCE: % % of % is outside the formula tolerance of +/-%%% (%.6f %) and needs supervisor authorisation with a reason',
          NEW.actual_quantity, NEW.unit, fm.material_name, v_tol, v_limit, NEW.unit
          USING ERRCODE='P0001';
      END IF;

      --  And the opposite error: claiming an exception that is not one.
      --  Left as a refusal rather than silently clearing the flag,
      --  because a supervisor signature on a dispensing that was in
      --  tolerance all along is a signature nobody should have asked for.
      IF v_dev <= v_limit AND NEW.tolerance_exception THEN
        RAISE EXCEPTION
          'DISPENSE_NOT_OUT_OF_TOLERANCE: % % of % is within the formula tolerance, so no authorisation is required and none should be recorded',
          NEW.actual_quantity, NEW.unit, fm.material_name USING ERRCODE='P0001';
      END IF;
    END IF;
  ELSIF NEW.tolerance_exception THEN
    --  No formula line means no tolerance to be outside of, so there is
    --  nothing for an authorisation to authorise.
    RAISE EXCEPTION
      'DISPENSE_NOT_OUT_OF_TOLERANCE: this dispensing names no formula line, so there is no tolerance for it to breach'
      USING ERRCODE='P0001';
  END IF;

  --  The stage, if named, must belong to this batch.
  IF NEW.batch_stage_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.batch_stages
                      WHERE id = NEW.batch_stage_id AND batch_id = NEW.batch_id) THEN
    RAISE EXCEPTION 'DISPENSE_STAGE_MISMATCH: that stage does not belong to batch %',
      b.batch_number USING ERRCODE='P0001';
  END IF;

  --  Snapshotted so a printed batch record still reads correctly.
  NEW.internal_lot_number := l.lot_number;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dispensing_gate ON public.dispensing_records;
CREATE TRIGGER trg_dispensing_gate
  BEFORE INSERT ON public.dispensing_records
  FOR EACH ROW EXECUTE FUNCTION public.fn_dispensing_gate();

COMMENT ON FUNCTION public.fn_dispensing_gate() IS
  'Item 09''s preconditions, on the table so a direct INSERT meets them too: the batch is open, its line is cleared (item 08''s gate), the lot is dispensable (item 04''s gate), the lot really is of the material named, the units agree, and a quantity outside the formula tolerance carries a supervisor authorisation. The tolerance_exception flag is derived here, not trusted from the caller.';


-- ── 5. The decrement and the link, in one statement each ─────────────
--
--  "Dispensing writes the genealogy link between lot and batch and
--   decrements the lot quantity IN THE SAME TRANSACTION", and the NOT
--  DONE IF is "the link is written but the quantity is not decremented,
--  or the reverse". An AFTER INSERT trigger makes that unconstructable:
--  both happen inside the inserting statement's transaction, and if
--  either raises, the dispensing row goes with it.
--
--  THE CONCURRENCY CLAUSE
--  ----------------------
--  "Two operators dispensing one lot at the same moment can take it
--   below zero."
--
--  The hazard is not really a negative number — material_lots already has
--  a CHECK for that. It is the LOST UPDATE: both sessions read 100, both
--  compute 100 - 60, both write 40, and 120 has left a lot that held 100
--  while the column still says 40 and no constraint ever fired.
--
--  So the decrement is never read-modify-write in plpgsql. It is one
--  conditional UPDATE:
--
--      SET quantity_available = quantity_available - X
--      WHERE id = ... AND quantity_available >= X
--
--  Under READ COMMITTED the second session blocks on the first's row
--  lock, and when it unblocks Postgres RE-EVALUATES the WHERE clause
--  against the committed row. So the second session sees 40, fails the
--  predicate, updates no rows, and the ROW_COUNT check below turns that
--  into a refusal. No advisory lock, no SERIALIZABLE, no retry loop.
CREATE OR REPLACE FUNCTION public.fn_dispensing_apply()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE n integer; v_avail numeric;
BEGIN
  --  1. The decrement. Atomic, conditional, and checked.
  UPDATE public.material_lots
     SET quantity_available = quantity_available - NEW.actual_quantity,
         updated_at = now()
   WHERE id = NEW.material_lot_id
     AND quantity_available IS NOT NULL
     AND quantity_available >= NEW.actual_quantity;
  GET DIAGNOSTICS n = ROW_COUNT;

  IF n <> 1 THEN
    SELECT quantity_available INTO v_avail
      FROM public.material_lots WHERE id = NEW.material_lot_id;
    IF v_avail IS NULL THEN
      RAISE EXCEPTION
        'DISPENSE_NO_QUANTITY_RECORDED: lot % has no recorded available quantity, so it cannot be dispensed against',
        NEW.internal_lot_number USING ERRCODE='P0001';
    END IF;
    RAISE EXCEPTION
      'DISPENSE_INSUFFICIENT_QUANTITY: lot % has % % available and % % was asked for. If another operator dispensed from this lot a moment ago, that is why.',
      NEW.internal_lot_number, v_avail, NEW.unit, NEW.actual_quantity, NEW.unit
      USING ERRCODE='P0001';
  END IF;

  --  2. The genealogy link. Upserted, because one lot may be dispensed to
  --  one batch several times and the edge is the pair.
  INSERT INTO public.batch_material_genealogy
    (company_id, batch_id, material_lot_id, material_id, total_quantity, unit,
     dispensing_count, first_dispensed_at, last_dispensed_at)
  VALUES (NEW.company_id, NEW.batch_id, NEW.material_lot_id, NEW.material_id,
          NEW.actual_quantity, NEW.unit, 1, NEW.dispensed_at, NEW.dispensed_at)
  ON CONFLICT (batch_id, material_lot_id) DO UPDATE
     SET total_quantity    = public.batch_material_genealogy.total_quantity + NEW.actual_quantity,
         dispensing_count  = public.batch_material_genealogy.dispensing_count + 1,
         last_dispensed_at = greatest(public.batch_material_genealogy.last_dispensed_at, NEW.dispensed_at);

  --  3. A lot dispensed to nothing is exhausted. Derived here rather than
  --  left to a sweep, so the status does not lag the quantity.
  --
  --  THROUGH THE ENGINE, not by writing the column. material_lots.status
  --  is an engine mirror with a guard trigger (item 04), and an earlier
  --  draft of this function set it directly — which the guard refused,
  --  correctly. The lifecycle declares approved -> exhaust -> exhausted
  --  for exactly this, so that is the route.
  SELECT quantity_available INTO v_avail
    FROM public.material_lots WHERE id = NEW.material_lot_id;

  IF v_avail = 0
     AND (SELECT status FROM public.material_lots WHERE id = NEW.material_lot_id) = 'approved' THEN
    PERFORM public.lifecycle_transition('material_lot', NEW.material_lot_id, 'exhaust',
      NEW.company_id, NEW.dispensed_by, 'Fully dispensed');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dispensing_apply ON public.dispensing_records;
CREATE TRIGGER trg_dispensing_apply
  AFTER INSERT ON public.dispensing_records
  FOR EACH ROW EXECUTE FUNCTION public.fn_dispensing_apply();

COMMENT ON FUNCTION public.fn_dispensing_apply() IS
  'Decrements the lot and writes the genealogy edge from a dispensing row, inside the inserting transaction, so neither can exist without the other. The decrement is a single conditional UPDATE rather than a read-modify-write, which is what stops two concurrent operators overdrawing one lot — see the comment above the function.';


--  The quantity and the link are derived from the row, so the row cannot
--  be edited in the parts they derive from, and cannot be deleted at all.
--  A mistake is corrected by a reversal, which is its own recorded event.
CREATE OR REPLACE FUNCTION public.fn_dispensing_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION
      'DISPENSE_IMMUTABLE: a dispensing cannot be deleted — the material left the store and the genealogy records where it went. Record a reversal instead.'
      USING ERRCODE='P0001';
  END IF;

  IF NEW.actual_quantity IS DISTINCT FROM OLD.actual_quantity
     OR NEW.material_lot_id IS DISTINCT FROM OLD.material_lot_id
     OR NEW.batch_id        IS DISTINCT FROM OLD.batch_id
     OR NEW.material_id     IS DISTINCT FROM OLD.material_id
     OR NEW.unit            IS DISTINCT FROM OLD.unit
     OR NEW.dispensed_by    IS DISTINCT FROM OLD.dispensed_by
     OR NEW.dispensed_at    IS DISTINCT FROM OLD.dispensed_at THEN
    RAISE EXCEPTION
      'DISPENSE_IMMUTABLE: the lot, batch, material, quantity, unit and dispenser of a dispensing cannot be changed — the lot decrement and the genealogy edge were derived from them. Record a reversal instead.'
      USING ERRCODE='P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dispensing_immutable ON public.dispensing_records;
CREATE TRIGGER trg_dispensing_immutable
  BEFORE UPDATE OR DELETE ON public.dispensing_records
  FOR EACH ROW EXECUTE FUNCTION public.fn_dispensing_immutable();


-- ── 6. The RPCs ──────────────────────────────────────────────────────

--  ── material_dispense ───────────────────────────────────────────────
--  "Only approved lots can be dispensed, ENFORCED AT THE SERVICE LAYER."
--  Which it is — and also at the table, because the NOT DONE IF is about
--  a direct call. This function exists to resolve what the caller should
--  not have to supply (the material, the lot number, the required
--  quantity from the formula) and to give better refusals than a trigger
--  can.
CREATE OR REPLACE FUNCTION public.material_dispense(
  p_batch_id            uuid,
  p_material_lot_id     uuid,
  p_actual_quantity     numeric,
  p_balance_identifier  text,
  p_formula_material_id uuid    DEFAULT NULL,
  p_batch_stage_id      uuid    DEFAULT NULL,
  p_required_quantity   numeric DEFAULT NULL,
  p_signature_id        uuid    DEFAULT NULL,
  p_authorised_by       uuid    DEFAULT NULL,
  p_authorisation_reason text   DEFAULT NULL,
  p_authorisation_signature_id uuid DEFAULT NULL,
  p_notes               text    DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  b record; l record; fm record;
  v_required numeric; v_exception boolean := false;
  v_tol numeric; v_dev numeric; v_limit numeric;
  v_id uuid; v_remaining numeric;
BEGIN
  SELECT id, company_id, batch_number, formula_id INTO b
    FROM public.batch_records WHERE id = p_batch_id;
  IF b.id IS NULL THEN
    RAISE EXCEPTION 'DISPENSE_NO_BATCH: no such batch record %', p_batch_id USING ERRCODE='P0002';
  END IF;
  IF NOT public.app_is_service_context()
     AND NOT public.app_is_company_member(b.company_id) THEN
    RAISE EXCEPTION 'DISPENSE_FORBIDDEN: caller is not a member of the owning company'
      USING ERRCODE='P0001';
  END IF;

  IF p_actual_quantity IS NULL OR p_actual_quantity <= 0 THEN
    RAISE EXCEPTION 'DISPENSE_BAD_QUANTITY: the dispensed quantity must be greater than zero'
      USING ERRCODE='P0001';
  END IF;
  IF coalesce(btrim(p_balance_identifier),'') = '' THEN
    RAISE EXCEPTION
      'DISPENSE_NO_BALANCE: the balance used has to be recorded; a weight with no instrument behind it cannot be checked later'
      USING ERRCODE='P0001';
  END IF;

  SELECT id, company_id, material_id, lot_number, unit_of_measure INTO l
    FROM public.material_lots WHERE id = p_material_lot_id;
  IF l.id IS NULL THEN
    RAISE EXCEPTION 'DISPENSE_NO_LOT: no such material lot %', p_material_lot_id USING ERRCODE='P0002';
  END IF;
  IF l.company_id <> b.company_id THEN
    RAISE EXCEPTION 'DISPENSE_LOT_FOREIGN: that lot belongs to another company' USING ERRCODE='P0001';
  END IF;

  --  The required quantity comes from the formula when a line is named.
  --  Letting the caller supply both the required and the actual quantity
  --  would let them declare any deviation to be zero.
  IF p_formula_material_id IS NOT NULL THEN
    SELECT fmm.id, fmm.formula_id, fmm.tolerance_pct, fmm.quantity_per_batch,
           fmm.overage_pct, fmm.unit, m.name AS material_name
      INTO fm
      FROM public.master_formula_materials fmm
      JOIN public.materials m ON m.id = fmm.material_id
     WHERE fmm.id = p_formula_material_id;
    IF fm.id IS NULL THEN
      RAISE EXCEPTION 'DISPENSE_NO_FORMULA_LINE: no such formula material line %',
        p_formula_material_id USING ERRCODE='P0002';
    END IF;

    --  UNITS FIRST, BEFORE ANY ARITHMETIC. The formula asks for 50 kg
    --  and the lot is held in grams: comparing 50000 against 50 is
    --  meaningless, and the tolerance check below would conclude "wildly
    --  out of tolerance" and demand a supervisor signature for what is
    --  actually a unit error. An earlier draft did exactly that, and the
    --  test for the unit mismatch failed with an authorisation demand —
    --  which is how the ordering bug was found. The gate trigger refuses
    --  this too; raising here means the caller gets the right sentence.
    IF fm.unit IS NOT NULL AND l.unit_of_measure IS NOT NULL
       AND lower(btrim(fm.unit)) <> lower(btrim(l.unit_of_measure)) THEN
      RAISE EXCEPTION
        'DISPENSE_FORMULA_UNIT_MISMATCH: the formula asks for % in % but lot % is held in %; no conversion is applied, so either the formula line or the lot is in the wrong unit',
        fm.material_name, fm.unit, l.lot_number, l.unit_of_measure
        USING ERRCODE='P0001';
    END IF;

    --  Overage is part of the TARGET: a line with 10% overage asks for
    --  110% of the nominal quantity, deliberately, for a known loss.
    v_required := fm.quantity_per_batch * (1 + coalesce(fm.overage_pct,0) / 100.0);

    v_tol := fm.tolerance_pct;
    v_dev := abs(p_actual_quantity - v_required);
    IF v_tol IS NULL THEN
      v_exception := v_dev > 0;
    ELSE
      v_limit := v_required * v_tol / 100.0;
      v_exception := v_dev > v_limit;
    END IF;
  ELSE
    --  No formula line: the caller states what was asked for, and there
    --  is no tolerance to be outside of.
    v_required := coalesce(p_required_quantity, p_actual_quantity);
  END IF;

  --  "needs supervisor authorisation with a reason to save"
  IF v_exception THEN
    IF p_authorised_by IS NULL OR coalesce(btrim(p_authorisation_reason),'') = '' THEN
      RAISE EXCEPTION
        'DISPENSE_AUTHORISATION_REQUIRED: % % against a required % % is outside tolerance for %, so it needs a named supervisor and a reason',
        p_actual_quantity, coalesce(l.unit_of_measure,'?'), v_required,
        coalesce(l.unit_of_measure,'?'), coalesce(fm.material_name,'this material')
        USING ERRCODE='P0001';
    END IF;
    IF p_authorised_by = coalesce(v_actor,'00000000-0000-0000-0000-000000000000'::uuid) THEN
      RAISE EXCEPTION
        'DISPENSE_SELF_AUTHORISED: the person dispensing cannot authorise their own out-of-tolerance quantity'
        USING ERRCODE='P0001';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.company_members
                    WHERE company_id = b.company_id AND user_id = p_authorised_by
                      AND status = 'active') THEN
      RAISE EXCEPTION
        'DISPENSE_AUTHORISER_UNKNOWN: the named supervisor is not an active member of this company'
        USING ERRCODE='P0001';
    END IF;
  END IF;

  --  internal_lot_number is set by the gate trigger from the lot itself;
  --  the value here is a placeholder the trigger overwrites.
  INSERT INTO public.dispensing_records
    (company_id, batch_id, batch_stage_id, formula_material_id,
     material_id, material_lot_id, internal_lot_number,
     required_quantity, actual_quantity, unit,
     balance_identifier, dispensed_by, dispense_signature_id,
     tolerance_exception, authorised_by, authorisation_reason, authorisation_signature_id,
     notes)
  VALUES
    (b.company_id, p_batch_id, p_batch_stage_id, p_formula_material_id,
     l.material_id, p_material_lot_id, l.lot_number,
     v_required, p_actual_quantity, coalesce(l.unit_of_measure,'ea'),
     btrim(p_balance_identifier),
     coalesce(v_actor,'00000000-0000-0000-0000-000000000000'::uuid), p_signature_id,
     v_exception,
     CASE WHEN v_exception THEN p_authorised_by END,
     CASE WHEN v_exception THEN btrim(p_authorisation_reason) END,
     CASE WHEN v_exception THEN p_authorisation_signature_id END,
     nullif(btrim(coalesce(p_notes,'')),''))
  RETURNING id INTO v_id;

  SELECT quantity_available INTO v_remaining
    FROM public.material_lots WHERE id = p_material_lot_id;

  RETURN jsonb_build_object(
    'ok', true,
    'dispensing_id', v_id,
    'required_quantity', v_required,
    'actual_quantity', p_actual_quantity,
    'tolerance_exception', v_exception,
    'lot_remaining', v_remaining);
END;
$$;

COMMENT ON FUNCTION public.material_dispense(uuid,uuid,numeric,text,uuid,uuid,numeric,uuid,uuid,text,uuid,text) IS
  'Dispenses a quantity of a lot to a batch: checks the line clearance and the lot, resolves the required quantity and the tolerance from the formula rather than trusting the caller, decrements the lot and writes the genealogy edge in one transaction. An out-of-tolerance quantity needs a named supervisor who is not the dispenser, and a reason.';

REVOKE ALL ON FUNCTION public.material_dispense(uuid,uuid,numeric,text,uuid,uuid,numeric,uuid,uuid,text,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.material_dispense(uuid,uuid,numeric,text,uuid,uuid,numeric,uuid,uuid,text,uuid,text)
  TO authenticated, service_role;


--  ── material_dispense_verify ────────────────────────────────────────
--  The second person. "dispenser and verifier."
CREATE OR REPLACE FUNCTION public.material_dispense_verify(
  p_dispensing_id uuid,
  p_signature_id  uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE d record; v_actor uuid := auth.uid();
BEGIN
  SELECT id, company_id, dispensed_by, verified_by, internal_lot_number INTO d
    FROM public.dispensing_records WHERE id = p_dispensing_id;
  IF d.id IS NULL THEN
    RAISE EXCEPTION 'DISPENSE_NOT_FOUND: no such dispensing %', p_dispensing_id USING ERRCODE='P0002';
  END IF;
  IF NOT public.app_is_service_context()
     AND NOT public.app_is_company_member(d.company_id) THEN
    RAISE EXCEPTION 'DISPENSE_FORBIDDEN: caller is not a member of the owning company'
      USING ERRCODE='P0001';
  END IF;
  IF d.verified_by IS NOT NULL THEN
    RAISE EXCEPTION 'DISPENSE_ALREADY_VERIFIED: that dispensing has already been verified'
      USING ERRCODE='P0001';
  END IF;
  IF d.dispensed_by = coalesce(v_actor,'00000000-0000-0000-0000-000000000000'::uuid) THEN
    RAISE EXCEPTION
      'DISPENSE_SELF_VERIFIED: the person who dispensed cannot also verify it'
      USING ERRCODE='P0001';
  END IF;

  UPDATE public.dispensing_records
     SET verified_by = v_actor, verified_at = now(),
         verify_signature_id = p_signature_id, updated_at = now()
   WHERE id = p_dispensing_id;

  RETURN jsonb_build_object('ok', true, 'dispensing_id', p_dispensing_id, 'verified_by', v_actor);
END;
$$;

COMMENT ON FUNCTION public.material_dispense_verify(uuid,uuid) IS
  'The second person''s check on a dispensed quantity. Refuses the dispenser, and refuses a second verification — a table CHECK holds the first rule on every write path.';

REVOKE ALL ON FUNCTION public.material_dispense_verify(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.material_dispense_verify(uuid,uuid) TO authenticated, service_role;


--  ── dispensing_block_reason ─────────────────────────────────────────
--  The read a screen wants before the operator starts weighing: why this
--  lot cannot go to this batch, in one sentence, or NULL. Same shape as
--  material_lot_block_reason and line_clearance_block_reason.
CREATE OR REPLACE FUNCTION public.dispensing_block_reason(
  p_batch_id        uuid,
  p_material_lot_id uuid,
  p_quantity        numeric DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE b record; v_reason text;
BEGIN
  SELECT id, company_id, batch_number, execution_closed_at INTO b
    FROM public.batch_records WHERE id = p_batch_id;
  IF b.id IS NULL THEN
    RETURN 'This batch record does not exist.';
  END IF;

  --  Refuses by RAISING rather than returning, because a NULL return
  --  reads as "go ahead" to every caller.
  IF NOT public.app_is_service_context()
     AND NOT public.app_is_company_member(b.company_id) THEN
    RAISE EXCEPTION 'DISPENSE_FORBIDDEN: caller is not a member of the owning company'
      USING ERRCODE='P0001';
  END IF;

  IF b.execution_closed_at IS NOT NULL THEN
    RETURN format('Batch %s was closed at %s. Nothing further can be dispensed to it.',
                  b.batch_number, to_char(b.execution_closed_at,'DD Mon YYYY HH24:MI'));
  END IF;

  v_reason := public.line_clearance_block_reason(p_batch_id);
  IF v_reason IS NOT NULL THEN RETURN v_reason; END IF;

  v_reason := public.material_lot_block_reason(p_material_lot_id, p_quantity);
  IF v_reason IS NOT NULL THEN RETURN v_reason; END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.dispensing_block_reason(uuid,uuid,numeric) IS
  'NULL when this lot may be dispensed to this batch, otherwise the first reason it may not, as a sentence. Asks the same two gates the insert trigger does, in the same order, so a screen and the database agree about why.';

REVOKE ALL ON FUNCTION public.dispensing_block_reason(uuid,uuid,numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dispensing_block_reason(uuid,uuid,numeric) TO authenticated, service_role;


-- ── 7. The deploy-time guard ─────────────────────────────────────────
DO $item09_guard$
DECLARE
  v_missing text[] := '{}';
  v_constraints text[] := ARRAY[
    'mfm_tolerance_chk',
    'dr_quantities_chk','dr_unit_chk','dr_balance_chk',
    'dr_authorisation_complete_chk','dr_authorisation_needed_chk',
    'dr_verifier_distinct_chk','dr_authoriser_distinct_chk','dr_verified_pair_chk',
    'bmg_pair_uniq','bmg_quantity_chk'
  ];
  v_triggers text[] := ARRAY[
    'trg_dispensing_gate','trg_dispensing_apply','trg_dispensing_immutable'
  ];
  c text;
BEGIN
  FOREACH c IN ARRAY v_constraints LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = c) THEN
      v_missing := v_missing || ('constraint '||c);
    END IF;
  END LOOP;
  FOREACH c IN ARRAY v_triggers LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = c AND NOT tgisinternal) THEN
      v_missing := v_missing || ('trigger '||c);
    END IF;
  END LOOP;

  --  The genealogy table must not be writable by the application role.
  --  It is derived, and a hand-written edge is a lie a trace query would
  --  repeat.
  IF has_table_privilege('authenticated','public.batch_material_genealogy','INSERT') THEN
    v_missing := v_missing || 'revoke of INSERT on batch_material_genealogy from authenticated';
  END IF;
  IF has_table_privilege('authenticated','public.dispensing_records','DELETE') THEN
    v_missing := v_missing || 'revoke of DELETE on dispensing_records from authenticated';
  END IF;

  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION
      'ITEM09_CONTROLS_MISSING: this migration applied but the following controls are not present: %. A dropped control is not repaired by re-running a CREATE TABLE IF NOT EXISTS; add it in its own guarded DO block.',
      array_to_string(v_missing, ', ')
      USING ERRCODE = 'P0001';
  END IF;
END
$item09_guard$;
