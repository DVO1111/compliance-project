-- =====================================================================
--  WEEK 4 / ITEM 12 — YIELD RECONCILIATION
--
--  DONE MEANS
--    Reconciliation at stages flagged for it and at batch completion.
--    Theoretical yield, actual yield, percentage and variance calculated.
--    Threshold configurable per product and stage. Variance beyond
--    threshold blocks stage completion.
--    Proceeding needs an investigation flag and supervisor
--    authorisation. Deviation arrives next week, so mark the link point.
--
--  NOT DONE IF
--    The calculation is right but the threshold blocks nothing.
--    Threshold hardcoded.
--    Proceeding without a recorded authorisation.
--
--
--  THIS ITEM BLOCKS. ITEM 11 DELIBERATELY DID NOT.
--  -----------------------------------------------
--  Item 11's first NOT DONE IF is "an OOS reading blocks entry", and
--  everything there saves first and asks afterwards. Item 12's first
--  NOT DONE IF is the opposite: "the calculation is right but the
--  threshold blocks nothing". The two are not in tension, because they
--  block different acts:
--
--    item 11 must not block RECORDING AN OBSERVATION. Refusing to store
--            a number an operator measured destroys the number; the
--            operator writes it on paper and the record is worse.
--    item 12 must block MOVING ON. A stage whose material balance does
--            not add up is a stage where something is unaccounted for,
--            and continuing is a decision somebody has to own.
--
--  So reconciliation is RECORDED freely — the numbers are facts and a
--  bad number is still a fact — and it is COMPLETION that is refused.
--  Recording and proceeding are separate acts here on purpose, which is
--  why this item does not follow item 09's pattern of authorising
--  inline at save time.
--
--
--  THE THRESHOLD IS NOT HARDCODED, AND THAT IS STRUCTURAL
--  ------------------------------------------------------
--  variance_threshold_pct is NOT NULL WITH NO DEFAULT. There is no
--  fallback anywhere in this file: no constant, no company-wide value,
--  no "2% if unset". A stage is flagged for reconciliation by the
--  existence of a config row, and a config row cannot exist without
--  somebody choosing a threshold. A default — even a conventional one —
--  would be a hardcoded threshold wearing a column's clothes, which is
--  the second NOT DONE IF.
--
--
--  NO UNIT CONVERSION IS INVENTED
--  ------------------------------
--  Granule goes in by mass and tablets come out by count, so a yield
--  across that boundary needs a conversion. This file does NOT derive
--  one — not from the product's target tablet mass, not from anything
--  else. The config carries output_per_input as an explicit number the
--  product sets, snapshotted onto every reconciliation so the
--  arithmetic stays re-checkable, and a basis whose unit disagrees with
--  the config is refused by name. A conversion the system guesses is a
--  yield nobody can defend, and deriving one quietly from the weight
--  limits would make item 11's configuration load-bearing for an
--  arithmetic it was never reviewed for.
--
--
--  DEVIATION LINKAGE IS MARKED, NOT BUILT
--  --------------------------------------
--  deviation_id on the reconciliation is the Week 6 link point. Nothing
--  in this file writes it, and an authorised variance creates no
--  deviation — same discipline as item 11.
-- =====================================================================


-- ── 1. The configuration: which stages reconcile, and to what ────────
--
--  "Threshold configurable per product and stage" — so the key is
--  (product, formula stage), and the batch-completion reconciliation is
--  the same table with formula_stage_id NULL. One table rather than
--  two, because the arithmetic and the threshold are identical and the
--  only difference is what the theoretical figure comes from.

CREATE TABLE IF NOT EXISTS public.yield_reconciliation_configs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id  uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,

  --  NULL means "at batch completion". A stage is FLAGGED FOR
  --  RECONCILIATION by having a row here; absence is the flag's absence,
  --  so there is no boolean that can disagree with whether a threshold
  --  was ever chosen.
  formula_stage_id uuid REFERENCES public.master_formula_stages(id) ON DELETE CASCADE,

  --  Where the theoretical figure comes from. Named rather than
  --  computed-from-whatever-is-handy, because a yield whose denominator
  --  is unclear is a number two people will read differently.
  --
  --    dispensed_to_stage     sum of what was dispensed TO THIS STAGE
  --    dispensed_to_batch     sum of everything dispensed to the batch
  --    previous_stage_output  the preceding reconciliation's actual yield
  --    planned_batch_size     batch_records.batch_size
  theoretical_basis text NOT NULL,

  --  The unit the basis is expected in, and the unit the output is
  --  measured in. Both stated so a mismatch is caught rather than
  --  silently summed.
  input_unit  text NOT NULL,
  output_unit text NOT NULL,

  --  theoretical_output = basis_quantity * output_per_input.
  --  1 when the units are the same thing (kg of granule in, kg of
  --  granule out). For tablets from granule it is the tablet count a
  --  kilogram is expected to yield, and the PRODUCT states it: nothing
  --  here derives it.
  output_per_input numeric(18,8) NOT NULL DEFAULT 1,

  --  NO DEFAULT. See the header.
  variance_threshold_pct numeric(8,4) NOT NULL,

  notes       text,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.yield_reconciliation_configs IS
  'Which stages of which products reconcile, what the theoretical figure is computed from, and the variance threshold. A row IS the "flagged for reconciliation" flag; formula_stage_id NULL is the batch-completion config. variance_threshold_pct has no default on purpose: "threshold hardcoded" is one of item 12''s NOT DONE IF clauses, and a conventional default would be exactly that.';
COMMENT ON COLUMN public.yield_reconciliation_configs.output_per_input IS
  'Explicit conversion, set by the product. Snapshotted onto every reconciliation. Nothing derives this from the product''s weight limits or anywhere else — a conversion the system guesses is a yield nobody can defend.';

DO $yrc_checks$
BEGIN
  --  One config per product and stage. NULLS NOT DISTINCT so the
  --  batch-completion row (formula_stage_id NULL) is unique too — with
  --  the default NULLS DISTINCT a product could carry several
  --  batch-level thresholds and the gate would pick one arbitrarily.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='yrc_product_stage_uniq') THEN
    ALTER TABLE public.yield_reconciliation_configs
      ADD CONSTRAINT yrc_product_stage_uniq UNIQUE NULLS NOT DISTINCT (product_id, formula_stage_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='yrc_basis_chk') THEN
    ALTER TABLE public.yield_reconciliation_configs ADD CONSTRAINT yrc_basis_chk
      CHECK (theoretical_basis IN
        ('dispensed_to_stage','dispensed_to_batch','previous_stage_output','planned_batch_size'));
  END IF;

  --  A threshold of zero means "any variance at all blocks", which is a
  --  legitimate choice for a high-value product. A negative one is not a
  --  tolerance, and a threshold of 100% or more would mean a batch that
  --  yielded nothing is within tolerance.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='yrc_threshold_chk') THEN
    ALTER TABLE public.yield_reconciliation_configs ADD CONSTRAINT yrc_threshold_chk
      CHECK (variance_threshold_pct >= 0 AND variance_threshold_pct < 100);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='yrc_factor_chk') THEN
    ALTER TABLE public.yield_reconciliation_configs ADD CONSTRAINT yrc_factor_chk
      CHECK (output_per_input > 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='yrc_units_chk') THEN
    ALTER TABLE public.yield_reconciliation_configs ADD CONSTRAINT yrc_units_chk
      CHECK (btrim(input_unit) <> '' AND btrim(output_unit) <> '');
  END IF;

  --  planned_batch_size is the batch-completion basis and nothing else:
  --  a stage whose theoretical figure is the whole batch's planned size
  --  would reconcile every stage against the final target and report the
  --  same variance at each one.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='yrc_basis_scope_chk') THEN
    ALTER TABLE public.yield_reconciliation_configs ADD CONSTRAINT yrc_basis_scope_chk
      CHECK ((theoretical_basis = 'planned_batch_size') = (formula_stage_id IS NULL));
  END IF;
END
$yrc_checks$;

CREATE INDEX IF NOT EXISTS yrc_company_idx
  ON public.yield_reconciliation_configs(company_id);
CREATE INDEX IF NOT EXISTS yrc_stage_idx
  ON public.yield_reconciliation_configs(formula_stage_id)
  WHERE formula_stage_id IS NOT NULL;

ALTER TABLE public.yield_reconciliation_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS yrc_select ON public.yield_reconciliation_configs;
CREATE POLICY yrc_select ON public.yield_reconciliation_configs FOR SELECT TO authenticated
  USING (public.app_is_company_member(company_id));
DROP POLICY IF EXISTS yrc_write ON public.yield_reconciliation_configs;
CREATE POLICY yrc_write ON public.yield_reconciliation_configs FOR ALL TO authenticated
  USING (public.app_is_company_member(company_id))
  WITH CHECK (public.app_is_company_member(company_id));


-- ── 2. The reconciliation itself ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.batch_yield_reconciliations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  batch_id   uuid NOT NULL REFERENCES public.batch_records(id) ON DELETE CASCADE,
  --  NULL for the batch-completion reconciliation, mirroring the config.
  batch_stage_id uuid REFERENCES public.batch_stages(id) ON DELETE CASCADE,

  config_id  uuid REFERENCES public.yield_reconciliation_configs(id) ON DELETE SET NULL,

  --  THE SNAPSHOT. A config can be revised; what this reconciliation was
  --  computed from and judged against is a fact about this batch. All
  --  four are written by the RPC and then frozen.
  theoretical_basis text    NOT NULL,
  basis_quantity    numeric(18,6) NOT NULL,
  output_per_input  numeric(18,8) NOT NULL,
  threshold_pct     numeric(8,4)  NOT NULL,

  --  "Theoretical yield, actual yield, percentage and variance
  --  calculated." Theoretical is DERIVED from the basis; actual is the
  --  one number a person supplies.
  theoretical_quantity numeric(18,6) NOT NULL,
  actual_quantity      numeric(18,6) NOT NULL,
  unit                 text NOT NULL,

  --  Derived by trigger from the two quantities, and immutable
  --  afterwards. Stored rather than computed on read so that a later
  --  change to the arithmetic cannot silently restate a closed batch's
  --  yield.
  yield_pct    numeric(10,4),
  variance_pct numeric(10,4),
  within_threshold boolean,

  --  "Proceeding needs an investigation flag and supervisor
  --  authorisation."
  investigation_required boolean NOT NULL DEFAULT false,
  investigation_note     text,

  authorised_by  uuid,
  authorised_at  timestamptz,
  authorisation_reason text,
  authorisation_signature_id uuid REFERENCES public.electronic_signatures(id) ON DELETE RESTRICT,

  --  WEEK 6 DEVIATION LINKAGE. Nothing in this file writes it. An
  --  authorised variance creates no deviation; when a supervisor decides
  --  one is warranted, this is where its id will go. There is no foreign
  --  key yet because the table does not exist.
  deviation_id uuid,

  notes       text,
  recorded_by uuid NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.batch_yield_reconciliations IS
  'One reconciliation per batch stage, plus one for the batch at completion. Theoretical is derived from the config''s basis; actual is supplied. The percentage, variance and threshold verdict are derived by trigger and frozen. A reconciliation is always RECORDED — it is stage completion that a variance beyond threshold refuses.';
COMMENT ON COLUMN public.batch_yield_reconciliations.deviation_id IS
  'WEEK 6 DEVIATION LINKAGE. Set by a human decision, never by this system. Item 12 says deviation arrives next week and this marks the link point.';

DO $byr_checks$
BEGIN
  --  One reconciliation per stage, and one per batch. NULLS NOT DISTINCT
  --  for the same reason as the config: without it a batch could carry
  --  two batch-level reconciliations with different verdicts.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='byr_scope_uniq') THEN
    ALTER TABLE public.batch_yield_reconciliations
      ADD CONSTRAINT byr_scope_uniq UNIQUE NULLS NOT DISTINCT (batch_id, batch_stage_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='byr_basis_chk') THEN
    ALTER TABLE public.batch_yield_reconciliations ADD CONSTRAINT byr_basis_chk
      CHECK (theoretical_basis IN
        ('dispensed_to_stage','dispensed_to_batch','previous_stage_output','planned_batch_size'));
  END IF;

  --  A theoretical yield of zero has no percentage, so it is refused at
  --  the point of recording rather than stored as a NULL nobody can act
  --  on. A negative actual yield is not a measurement.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='byr_quantities_chk') THEN
    ALTER TABLE public.batch_yield_reconciliations ADD CONSTRAINT byr_quantities_chk
      CHECK (theoretical_quantity > 0 AND actual_quantity >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='byr_threshold_chk') THEN
    ALTER TABLE public.batch_yield_reconciliations ADD CONSTRAINT byr_threshold_chk
      CHECK (threshold_pct >= 0 AND threshold_pct < 100);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='byr_unit_chk') THEN
    ALTER TABLE public.batch_yield_reconciliations ADD CONSTRAINT byr_unit_chk
      CHECK (btrim(unit) <> '');
  END IF;

  --  THE AUTHORISATION ARRIVES COMPLETE, or it is not an authorisation.
  --  "Proceeding without a recorded authorisation" is a NOT DONE IF, and
  --  a half-written authorisation row is how that happens without
  --  anybody intending it.
  --
  --  WHY A SIGNATURE IS NOT REQUIRED HERE. It was, in the first draft,
  --  and the draft was wrong: sign_electronic_record only signs
  --  LIFECYCLE-GOVERNED records — it looks the entity up in
  --  entity_current_state and requires the action to be an available
  --  transition. A yield reconciliation has no lifecycle, so no such
  --  signature can ever be issued, and requiring one would have made
  --  this gate permanently unclearable. A control nobody can satisfy by
  --  the proper route is worse than no control, because the route people
  --  then take is around it.
  --
  --  The brief asks for "supervisor authorisation", and its NOT DONE IF
  --  is "proceeding without a RECORDED authorisation" — recorded, which
  --  is a named supervisor, a time and a reason. That is also exactly
  --  what item 09 requires for an out-of-tolerance dispensing, so the
  --  two read the same.
  --
  --  A signature is accepted and stored when one is given. Making it
  --  mandatory means giving the reconciliation a lifecycle with an
  --  "authorise" transition carrying requires_signature, which is the
  --  pattern item 08 used for line clearance. That is a real piece of
  --  work and item 12 does not ask for it; this comment is where to
  --  start if it is ever wanted.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='byr_auth_complete_chk') THEN
    ALTER TABLE public.batch_yield_reconciliations ADD CONSTRAINT byr_auth_complete_chk
      CHECK (authorised_by IS NULL
             OR (authorised_at IS NOT NULL
                 AND btrim(coalesce(authorisation_reason,'')) <> ''));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='byr_auth_pair_chk') THEN
    ALTER TABLE public.batch_yield_reconciliations ADD CONSTRAINT byr_auth_pair_chk
      CHECK ((authorised_by IS NULL) = (authorised_at IS NULL));
  END IF;

  --  An authorisation only means anything on a variance that was
  --  investigated. Authorising without the investigation flag would let
  --  somebody wave a stage through and call it a recorded authorisation.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='byr_auth_needs_investigation_chk') THEN
    ALTER TABLE public.batch_yield_reconciliations
      ADD CONSTRAINT byr_auth_needs_investigation_chk
      CHECK (authorised_by IS NULL OR investigation_required);
  END IF;

  --  The investigation flag carries a note saying what was looked into.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='byr_investigation_note_chk') THEN
    ALTER TABLE public.batch_yield_reconciliations
      ADD CONSTRAINT byr_investigation_note_chk
      CHECK (NOT investigation_required OR btrim(coalesce(investigation_note,'')) <> '');
  END IF;

  --  The person who recorded the numbers cannot authorise them.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='byr_auth_distinct_chk') THEN
    ALTER TABLE public.batch_yield_reconciliations ADD CONSTRAINT byr_auth_distinct_chk
      CHECK (authorised_by IS NULL OR authorised_by <> recorded_by);
  END IF;
END
$byr_checks$;

CREATE INDEX IF NOT EXISTS byr_batch_idx
  ON public.batch_yield_reconciliations(batch_id);
CREATE INDEX IF NOT EXISTS byr_stage_idx
  ON public.batch_yield_reconciliations(batch_stage_id)
  WHERE batch_stage_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS byr_blocking_idx
  ON public.batch_yield_reconciliations(company_id, recorded_at)
  WHERE within_threshold IS FALSE AND authorised_by IS NULL;

ALTER TABLE public.batch_yield_reconciliations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS byr_select ON public.batch_yield_reconciliations;
CREATE POLICY byr_select ON public.batch_yield_reconciliations FOR SELECT TO authenticated
  USING (public.app_is_company_member(company_id));
DROP POLICY IF EXISTS byr_insert ON public.batch_yield_reconciliations;
CREATE POLICY byr_insert ON public.batch_yield_reconciliations FOR INSERT TO authenticated
  WITH CHECK (public.app_is_company_member(company_id));
DROP POLICY IF EXISTS byr_update ON public.batch_yield_reconciliations;
CREATE POLICY byr_update ON public.batch_yield_reconciliations FOR UPDATE TO authenticated
  USING (public.app_is_company_member(company_id))
  WITH CHECK (public.app_is_company_member(company_id));


-- ── 3. The arithmetic, derived and then frozen ───────────────────────
--
--  "Theoretical yield, actual yield, percentage and variance
--  calculated." The percentage and the variance are computed here and
--  nowhere else, so a screen and the database cannot disagree about
--  whether a batch was inside its threshold.
--
--  VARIANCE IS SIGNED. A batch that yielded 103% and one that yielded
--  97% are both 3% out, but they are different problems — overage
--  usually means a weighing or counting error and shortfall usually
--  means material is missing — and collapsing them into an absolute
--  number throws that away. The THRESHOLD is applied to the magnitude,
--  because a threshold is a tolerance in both directions.

CREATE OR REPLACE FUNCTION public.fn_byr_calculate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.theoretical_quantity IS NULL OR NEW.theoretical_quantity = 0 THEN
    RAISE EXCEPTION
      'YIELD_NO_THEORETICAL: a yield percentage needs a theoretical quantity greater than zero'
      USING ERRCODE = 'P0001';
  END IF;

  NEW.yield_pct    := round(NEW.actual_quantity * 100.0 / NEW.theoretical_quantity, 4);
  NEW.variance_pct := round(NEW.yield_pct - 100.0, 4);

  --  Compared on magnitude: a threshold of 2% admits 98% and 102%. The
  --  boundary is INCLUSIVE — a variance exactly on the threshold is
  --  within it, because a threshold is the edge of what is acceptable
  --  and not the first value that is not. The same convention as item
  --  11's zone limits, deliberately, so the two items do not teach an
  --  operator two different meanings of "limit".
  NEW.within_threshold := abs(NEW.variance_pct) <= NEW.threshold_pct;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_byr_calculate() IS
  'Derives yield_pct, variance_pct and within_threshold from the two quantities and the snapshotted threshold. Variance is signed so overage and shortfall stay distinguishable; the threshold is applied to its magnitude, inclusively.';

DROP TRIGGER IF EXISTS trg_byr_calculate ON public.batch_yield_reconciliations;
CREATE TRIGGER trg_byr_calculate
  BEFORE INSERT OR UPDATE ON public.batch_yield_reconciliations
  FOR EACH ROW EXECUTE FUNCTION public.fn_byr_calculate();


--  The numbers are a record of what was measured. Once recorded, the
--  quantities and everything derived from them cannot be edited — a
--  yield that can be adjusted after the fact is not a reconciliation.
--  What CAN still change is the investigation and the authorisation,
--  because those are decisions that come afterwards by design.
CREATE OR REPLACE FUNCTION public.fn_byr_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.theoretical_quantity IS DISTINCT FROM OLD.theoretical_quantity
     OR NEW.actual_quantity   IS DISTINCT FROM OLD.actual_quantity
     OR NEW.unit              IS DISTINCT FROM OLD.unit
     OR NEW.basis_quantity    IS DISTINCT FROM OLD.basis_quantity
     OR NEW.theoretical_basis IS DISTINCT FROM OLD.theoretical_basis
     OR NEW.output_per_input  IS DISTINCT FROM OLD.output_per_input
     OR NEW.threshold_pct     IS DISTINCT FROM OLD.threshold_pct
     OR NEW.batch_id          IS DISTINCT FROM OLD.batch_id
     OR NEW.batch_stage_id    IS DISTINCT FROM OLD.batch_stage_id
     OR NEW.recorded_by       IS DISTINCT FROM OLD.recorded_by THEN
    RAISE EXCEPTION
      'YIELD_RECONCILIATION_IMMUTABLE: the quantities, the basis and the threshold a reconciliation was judged against cannot be changed once recorded'
      USING ERRCODE = 'P0001';
  END IF;

  --  An authorisation, once given, is given. Withdrawing it after a
  --  stage has been completed on the strength of it would leave a
  --  completed stage with no authorisation behind it.
  IF OLD.authorised_by IS NOT NULL
     AND (NEW.authorised_by IS DISTINCT FROM OLD.authorised_by
          OR NEW.authorised_at IS DISTINCT FROM OLD.authorised_at
          OR NEW.authorisation_reason IS DISTINCT FROM OLD.authorisation_reason
          OR NEW.authorisation_signature_id IS DISTINCT FROM OLD.authorisation_signature_id) THEN
    RAISE EXCEPTION
      'YIELD_AUTHORISATION_FINAL: an authorisation cannot be altered or withdrawn once recorded'
      USING ERRCODE = 'P0001';
  END IF;

  --  Clearing the investigation flag would make an existing
  --  authorisation unexplainable, and byr_auth_needs_investigation_chk
  --  would refuse it anyway; this says why.
  IF OLD.investigation_required AND NOT NEW.investigation_required THEN
    RAISE EXCEPTION
      'YIELD_INVESTIGATION_FINAL: an investigation that was required cannot be un-required'
      USING ERRCODE = 'P0001';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_byr_immutable ON public.batch_yield_reconciliations;
CREATE TRIGGER trg_byr_immutable
  BEFORE UPDATE ON public.batch_yield_reconciliations
  FOR EACH ROW EXECUTE FUNCTION public.fn_byr_immutable();


--  Deleting a reconciliation would be the simplest way round the block.
CREATE OR REPLACE FUNCTION public.fn_byr_no_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'YIELD_RECONCILIATION_APPEND_ONLY: a recorded reconciliation cannot be deleted'
    USING ERRCODE = 'P0001';
END;
$$;

DROP TRIGGER IF EXISTS trg_byr_no_delete ON public.batch_yield_reconciliations;
CREATE TRIGGER trg_byr_no_delete
  BEFORE DELETE ON public.batch_yield_reconciliations
  FOR EACH ROW EXECUTE FUNCTION public.fn_byr_no_delete();


-- ── 4. The theoretical figure ────────────────────────────────────────
--
--  Computed from the config's named basis. Returns the quantity and the
--  unit it is in, so the caller can refuse a mismatch rather than
--  multiplying kilograms by a tablet count.

CREATE OR REPLACE FUNCTION public.yield_theoretical_basis(
  p_batch_id       uuid,
  p_batch_stage_id uuid,
  p_basis          text
) RETURNS TABLE (basis_quantity numeric, basis_unit text, detail text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_company uuid;
  v_qty numeric;
  v_unit text;
  v_units integer;
  v_prev record;
BEGIN
  SELECT company_id INTO v_company FROM public.batch_records WHERE id = p_batch_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'BATCH_NO_RECORD: no such batch record %', p_batch_id USING ERRCODE='P0002';
  END IF;
  IF NOT public.app_is_service_context()
     AND NOT public.app_is_company_member(v_company) THEN
    RAISE EXCEPTION 'BATCH_FORBIDDEN: caller is not a member of the owning company'
      USING ERRCODE='P0001';
  END IF;

  IF p_basis = 'planned_batch_size' THEN
    SELECT b.batch_size, b.unit INTO v_qty, v_unit
      FROM public.batch_records b WHERE b.id = p_batch_id;
    RETURN QUERY SELECT v_qty, v_unit, 'planned batch size'::text;
    RETURN;
  END IF;

  IF p_basis IN ('dispensed_to_stage','dispensed_to_batch') THEN
    --  MIXED UNITS ARE NOT SUMMABLE. Adding 24 kg to 500 g gives 524 of
    --  nothing, and the resulting yield would look plausible. Counted
    --  first and refused by name, because the alternative is a number
    --  that is wrong in a way no reviewer can see.
    SELECT count(DISTINCT lower(btrim(d.unit))) INTO v_units
      FROM public.dispensing_records d
     WHERE d.batch_id = p_batch_id
       AND (p_basis = 'dispensed_to_batch' OR d.batch_stage_id = p_batch_stage_id);

    IF v_units = 0 THEN
      RAISE EXCEPTION
        'YIELD_NO_DISPENSING: nothing has been dispensed %, so there is no theoretical yield to reconcile against',
        CASE WHEN p_basis = 'dispensed_to_batch' THEN 'to this batch' ELSE 'to this stage' END
        USING ERRCODE='P0001';
    END IF;

    IF v_units > 1 THEN
      RAISE EXCEPTION
        'YIELD_MIXED_DISPENSING_UNITS: the dispensings for this % are held in % different units (%), and no conversion is applied, so they cannot be summed into one theoretical input',
        CASE WHEN p_basis = 'dispensed_to_batch' THEN 'batch' ELSE 'stage' END,
        v_units,
        (SELECT string_agg(DISTINCT lower(btrim(d.unit)), ', ' ORDER BY lower(btrim(d.unit)))
           FROM public.dispensing_records d
          WHERE d.batch_id = p_batch_id
            AND (p_basis = 'dispensed_to_batch' OR d.batch_stage_id = p_batch_stage_id))
        USING ERRCODE='P0001';
    END IF;

    SELECT sum(d.actual_quantity), min(lower(btrim(d.unit))) INTO v_qty, v_unit
      FROM public.dispensing_records d
     WHERE d.batch_id = p_batch_id
       AND (p_basis = 'dispensed_to_batch' OR d.batch_stage_id = p_batch_stage_id);

    RETURN QUERY SELECT v_qty, v_unit,
      format('%s dispensing(s)',
        (SELECT count(*) FROM public.dispensing_records d
          WHERE d.batch_id = p_batch_id
            AND (p_basis = 'dispensed_to_batch' OR d.batch_stage_id = p_batch_stage_id)))::text;
    RETURN;
  END IF;

  IF p_basis = 'previous_stage_output' THEN
    --  The nearest EARLIER stage of this batch that has a reconciliation.
    --  Not simply sequence_no - 1: a batch may reconcile at stages 1 and
    --  3, and stage 3's input is stage 1's output.
    SELECT r.actual_quantity, r.unit, s.sequence_no, s.name
      INTO v_prev
      FROM public.batch_yield_reconciliations r
      JOIN public.batch_stages s ON s.id = r.batch_stage_id
     WHERE r.batch_id = p_batch_id
       AND s.sequence_no < (SELECT sequence_no FROM public.batch_stages WHERE id = p_batch_stage_id)
     ORDER BY s.sequence_no DESC
     LIMIT 1;

    IF v_prev.actual_quantity IS NULL THEN
      RAISE EXCEPTION
        'YIELD_NO_PREVIOUS_RECONCILIATION: this stage reconciles against the previous stage''s output, and no earlier stage of this batch has been reconciled yet'
        USING ERRCODE='P0001';
    END IF;

    RETURN QUERY SELECT v_prev.actual_quantity, v_prev.unit,
      format('output of stage %s (%s)', v_prev.sequence_no, v_prev.name)::text;
    RETURN;
  END IF;

  RAISE EXCEPTION 'YIELD_BAD_BASIS: "%" is not a theoretical basis', p_basis
    USING ERRCODE='P0001';
END;
$$;

COMMENT ON FUNCTION public.yield_theoretical_basis(uuid,uuid,text) IS
  'The quantity and unit the theoretical yield is computed from, for one named basis. Refuses a dispensing set held in more than one unit rather than summing it: no conversion is applied anywhere in item 12.';

REVOKE ALL ON FUNCTION public.yield_theoretical_basis(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.yield_theoretical_basis(uuid,uuid,text)
  TO authenticated, service_role;


-- ── 5. THE BLOCK ─────────────────────────────────────────────────────
--
--  "Variance beyond threshold blocks stage completion."
--
--  This is the control the whole item turns on, and item 12's first NOT
--  DONE IF — "the calculation is right but the threshold blocks
--  nothing" — describes what it looks like when it is missing. So it is
--  a function the completion RPC calls, not a check in a screen, and
--  there are exactly three reasons it can say no:
--
--    1. the stage is flagged for reconciliation and has none;
--    2. the reconciliation is outside its threshold and nobody has
--       authorised proceeding;
--    3. an authorisation exists but is not a whole one.
--
--  Returns NULL when there is nothing to block. The same shape as the
--  quarantine, clearance and calibration gates, and for the same reason:
--  one function both the screen and the database read, so they cannot
--  give an operator two different answers.

CREATE OR REPLACE FUNCTION public.yield_block_reason(p_batch_stage_id uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE s record; cfg record; r record;
BEGIN
  SELECT bs.id, bs.company_id, bs.batch_id, bs.formula_stage_id,
         bs.sequence_no, bs.name, b.product_id
    INTO s
    FROM public.batch_stages bs
    JOIN public.batch_records b ON b.id = bs.batch_id
   WHERE bs.id = p_batch_stage_id;

  IF s.id IS NULL THEN
    RAISE EXCEPTION 'BATCH_NO_STAGE: no such stage %', p_batch_stage_id USING ERRCODE='P0002';
  END IF;
  IF NOT public.app_is_service_context()
     AND NOT public.app_is_company_member(s.company_id) THEN
    RAISE EXCEPTION 'BATCH_FORBIDDEN: caller is not a member of the owning company'
      USING ERRCODE='P0001';
  END IF;

  --  Is this stage flagged for reconciliation at all? The config row IS
  --  the flag.
  SELECT * INTO cfg FROM public.yield_reconciliation_configs
   WHERE product_id = s.product_id AND formula_stage_id = s.formula_stage_id;

  IF cfg.id IS NULL THEN
    --  Not flagged. Nothing to reconcile, nothing to block.
    RETURN NULL;
  END IF;

  SELECT * INTO r FROM public.batch_yield_reconciliations
   WHERE batch_id = s.batch_id AND batch_stage_id = p_batch_stage_id;

  IF r.id IS NULL THEN
    RETURN format(
      'Stage %s ("%s") reconciles yield, and no reconciliation has been recorded. Record the actual yield before completing the stage.',
      s.sequence_no, s.name);
  END IF;

  IF r.within_threshold IS NOT FALSE AND r.authorised_by IS NULL THEN
    --  Inside the threshold, or not yet judged. Nothing blocks.
    RETURN NULL;
  END IF;

  IF r.within_threshold IS FALSE AND r.authorised_by IS NULL THEN
    RETURN format(
      'Stage %s ("%s") yielded %s%% of theory, a variance of %s%% against a threshold of %s%%. Proceeding needs an investigation and a supervisor''s authorisation.',
      s.sequence_no, s.name,
      trim(to_char(r.yield_pct,   'FM9999990.0999')),
      trim(to_char(r.variance_pct,'FMS9999990.0999')),
      trim(to_char(r.threshold_pct,'FM9999990.0999')));
  END IF;

  --  An authorisation exists. It has to be a whole one. The table
  --  constraints already refuse a partial authorisation, so reaching
  --  this is a sign something wrote the row another way; it is checked
  --  here anyway, because this is the function that decides.
  IF btrim(coalesce(r.authorisation_reason,'')) = ''
     OR r.authorised_at IS NULL
     OR NOT r.investigation_required THEN
    RETURN format(
      'Stage %s ("%s") has an incomplete authorisation for its yield variance: an authorisation needs an investigation, a named supervisor, a time and a reason.',
      s.sequence_no, s.name);
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.yield_block_reason(uuid) IS
  'Why this stage cannot be completed on yield grounds, or NULL. Read by batch_stage_complete and by the screen, so the two cannot disagree. Returns NULL for a stage with no reconciliation config: absence of a config is absence of the flag.';

REVOKE ALL ON FUNCTION public.yield_block_reason(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.yield_block_reason(uuid) TO authenticated, service_role;


--  The batch-completion counterpart.
CREATE OR REPLACE FUNCTION public.yield_batch_block_reason(p_batch_id uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE b record; cfg record; r record;
BEGIN
  SELECT id, company_id, batch_number, product_id INTO b
    FROM public.batch_records WHERE id = p_batch_id;
  IF b.id IS NULL THEN
    RAISE EXCEPTION 'BATCH_NO_RECORD: no such batch record %', p_batch_id USING ERRCODE='P0002';
  END IF;
  IF NOT public.app_is_service_context()
     AND NOT public.app_is_company_member(b.company_id) THEN
    RAISE EXCEPTION 'BATCH_FORBIDDEN: caller is not a member of the owning company'
      USING ERRCODE='P0001';
  END IF;

  SELECT * INTO cfg FROM public.yield_reconciliation_configs
   WHERE product_id = b.product_id AND formula_stage_id IS NULL;

  IF cfg.id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO r FROM public.batch_yield_reconciliations
   WHERE batch_id = p_batch_id AND batch_stage_id IS NULL;

  IF r.id IS NULL THEN
    RETURN format(
      'Batch %s reconciles yield at completion, and no reconciliation has been recorded.',
      b.batch_number);
  END IF;

  IF r.within_threshold IS FALSE AND r.authorised_by IS NULL THEN
    RETURN format(
      'Batch %s yielded %s%% of theory, a variance of %s%% against a threshold of %s%%. Closing needs an investigation and a supervisor''s authorisation.',
      b.batch_number,
      trim(to_char(r.yield_pct,   'FM9999990.0999')),
      trim(to_char(r.variance_pct,'FMS9999990.0999')),
      trim(to_char(r.threshold_pct,'FM9999990.0999')));
  END IF;

  IF r.authorised_by IS NOT NULL
     AND (btrim(coalesce(r.authorisation_reason,'')) = ''
          OR r.authorised_at IS NULL
          OR NOT r.investigation_required) THEN
    RETURN format(
      'Batch %s has an incomplete authorisation for its yield variance.', b.batch_number);
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.yield_batch_block_reason(uuid) IS
  'Why this batch''s execution cannot be closed on yield grounds, or NULL. Read by batch_record_close.';

REVOKE ALL ON FUNCTION public.yield_batch_block_reason(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.yield_batch_block_reason(uuid) TO authenticated, service_role;


-- ── 6. The RPCs ──────────────────────────────────────────────────────
--
--  yield_reconcile records the numbers. It does NOT refuse a bad yield:
--  a variance beyond threshold is a fact, and the fact is what the
--  investigation starts from. The refusal belongs to completion.

CREATE OR REPLACE FUNCTION public.yield_reconcile_stage(
  p_batch_stage_id uuid,
  p_actual_quantity numeric,
  p_unit           text DEFAULT NULL,
  p_notes          text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  s record; cfg record; v_basis record; v_actor uuid := auth.uid();
  v_theoretical numeric; v_unit text; v_id uuid; r record;
BEGIN
  SELECT bs.id, bs.company_id, bs.batch_id, bs.formula_stage_id,
         bs.sequence_no, bs.name, bs.status, b.product_id, b.execution_closed_at
    INTO s
    FROM public.batch_stages bs
    JOIN public.batch_records b ON b.id = bs.batch_id
   WHERE bs.id = p_batch_stage_id;

  IF s.id IS NULL THEN
    RAISE EXCEPTION 'BATCH_NO_STAGE: no such stage %', p_batch_stage_id USING ERRCODE='P0002';
  END IF;
  IF NOT public.app_is_service_context()
     AND NOT public.app_is_company_member(s.company_id) THEN
    RAISE EXCEPTION 'BATCH_FORBIDDEN: caller is not a member of the owning company'
      USING ERRCODE='P0001';
  END IF;
  IF s.execution_closed_at IS NOT NULL THEN
    RAISE EXCEPTION
      'BATCH_CLOSED: batch % was closed at % and its reconciliations are permanently locked',
      s.batch_id, s.execution_closed_at USING ERRCODE='P0001';
  END IF;

  --  A yield is measured on a stage that ran. Reconciling a pending
  --  stage would be reconciling nothing.
  IF s.status NOT IN ('in_progress','complete') THEN
    RAISE EXCEPTION
      'BATCH_STAGE_NOT_STARTED: stage % is %, so there is no yield to reconcile yet',
      s.sequence_no, s.status USING ERRCODE='P0001';
  END IF;

  SELECT * INTO cfg FROM public.yield_reconciliation_configs
   WHERE product_id = s.product_id AND formula_stage_id = s.formula_stage_id;

  IF cfg.id IS NULL THEN
    RAISE EXCEPTION
      'YIELD_NOT_CONFIGURED: stage % ("%") of this product is not flagged for yield reconciliation, so there is no threshold to judge a yield against. Configure it first — item 12 has no default threshold on purpose.',
      s.sequence_no, s.name USING ERRCODE='P0001';
  END IF;

  SELECT * INTO v_basis
    FROM public.yield_theoretical_basis(s.batch_id, p_batch_stage_id, cfg.theoretical_basis);

  --  THE UNIT CHECK COMES BEFORE THE ARITHMETIC. Item 09 had this the
  --  wrong way round once: it did tolerance arithmetic first and then
  --  the unit check, so a quantity in the wrong unit demanded a
  --  supervisor's signature for what was a data-entry error. The same
  --  mistake here would report a 99,900% variance and call for an
  --  investigation into a units slip.
  IF lower(btrim(v_basis.basis_unit)) <> lower(btrim(cfg.input_unit)) THEN
    RAISE EXCEPTION
      'YIELD_INPUT_UNIT_MISMATCH: the basis for stage % is % in % but the configuration expects %; no conversion is applied, so either the configuration or the input is in the wrong unit',
      s.sequence_no, v_basis.basis_quantity, v_basis.basis_unit, cfg.input_unit
      USING ERRCODE='P0001';
  END IF;

  v_unit := coalesce(nullif(btrim(coalesce(p_unit,'')),''), cfg.output_unit);
  IF lower(btrim(v_unit)) <> lower(btrim(cfg.output_unit)) THEN
    RAISE EXCEPTION
      'YIELD_OUTPUT_UNIT_MISMATCH: the actual yield was given in % but this stage is reconciled in %; no conversion is applied',
      v_unit, cfg.output_unit USING ERRCODE='P0001';
  END IF;

  v_theoretical := v_basis.basis_quantity * cfg.output_per_input;

  IF v_theoretical <= 0 THEN
    RAISE EXCEPTION
      'YIELD_NO_THEORETICAL: the theoretical yield for stage % works out at %, and a percentage needs a figure greater than zero',
      s.sequence_no, v_theoretical USING ERRCODE='P0001';
  END IF;

  INSERT INTO public.batch_yield_reconciliations
    (company_id, batch_id, batch_stage_id, config_id,
     theoretical_basis, basis_quantity, output_per_input, threshold_pct,
     theoretical_quantity, actual_quantity, unit, notes, recorded_by)
  VALUES
    (s.company_id, s.batch_id, p_batch_stage_id, cfg.id,
     cfg.theoretical_basis, v_basis.basis_quantity, cfg.output_per_input,
     cfg.variance_threshold_pct,
     v_theoretical, p_actual_quantity, cfg.output_unit,
     nullif(btrim(coalesce(p_notes,'')),''),
     coalesce(v_actor,'00000000-0000-0000-0000-000000000000'::uuid))
  RETURNING id INTO v_id;

  SELECT * INTO r FROM public.batch_yield_reconciliations WHERE id = v_id;

  --  The result says plainly whether this blocks, so a screen does not
  --  have to re-derive the verdict it was just told.
  RETURN jsonb_build_object(
    'ok', true,
    'reconciliation_id', v_id,
    'theoretical_quantity', r.theoretical_quantity,
    'actual_quantity', r.actual_quantity,
    'unit', r.unit,
    'yield_pct', r.yield_pct,
    'variance_pct', r.variance_pct,
    'threshold_pct', r.threshold_pct,
    'within_threshold', r.within_threshold,
    'basis', r.theoretical_basis,
    'basis_quantity', r.basis_quantity,
    'basis_detail', v_basis.detail,
    'blocks_completion', r.within_threshold IS FALSE,
    --  Item 12 says deviation arrives next week. Reported as false so
    --  that if it ever becomes true somebody sees it here.
    'deviation_created', false);
END;
$$;

COMMENT ON FUNCTION public.yield_reconcile_stage(uuid,numeric,text,text) IS
  'Records a stage''s yield reconciliation. Never refuses a bad yield — a variance beyond threshold is a fact, and blocking belongs to batch_stage_complete. Refuses a unit mismatch before doing any arithmetic, so a units slip is not reported as a 99,900% variance.';

REVOKE ALL ON FUNCTION public.yield_reconcile_stage(uuid,numeric,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.yield_reconcile_stage(uuid,numeric,text,text)
  TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.yield_reconcile_batch(
  p_batch_id        uuid,
  p_actual_quantity numeric,
  p_unit            text DEFAULT NULL,
  p_notes           text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  b record; cfg record; v_basis record; v_actor uuid := auth.uid();
  v_theoretical numeric; v_unit text; v_id uuid; r record;
BEGIN
  SELECT id, company_id, batch_number, product_id, execution_closed_at INTO b
    FROM public.batch_records WHERE id = p_batch_id;
  IF b.id IS NULL THEN
    RAISE EXCEPTION 'BATCH_NO_RECORD: no such batch record %', p_batch_id USING ERRCODE='P0002';
  END IF;
  IF NOT public.app_is_service_context()
     AND NOT public.app_is_company_member(b.company_id) THEN
    RAISE EXCEPTION 'BATCH_FORBIDDEN: caller is not a member of the owning company'
      USING ERRCODE='P0001';
  END IF;
  IF b.execution_closed_at IS NOT NULL THEN
    RAISE EXCEPTION 'BATCH_CLOSED: batch % was closed at % and its reconciliations are locked',
      b.batch_number, b.execution_closed_at USING ERRCODE='P0001';
  END IF;

  SELECT * INTO cfg FROM public.yield_reconciliation_configs
   WHERE product_id = b.product_id AND formula_stage_id IS NULL;

  IF cfg.id IS NULL THEN
    RAISE EXCEPTION
      'YIELD_NOT_CONFIGURED: this product is not flagged for yield reconciliation at batch completion, so there is no threshold to judge a yield against'
      USING ERRCODE='P0001';
  END IF;

  SELECT * INTO v_basis
    FROM public.yield_theoretical_basis(p_batch_id, NULL, cfg.theoretical_basis);

  IF lower(btrim(v_basis.basis_unit)) <> lower(btrim(cfg.input_unit)) THEN
    RAISE EXCEPTION
      'YIELD_INPUT_UNIT_MISMATCH: the basis for batch % is % in % but the configuration expects %; no conversion is applied',
      b.batch_number, v_basis.basis_quantity, v_basis.basis_unit, cfg.input_unit
      USING ERRCODE='P0001';
  END IF;

  v_unit := coalesce(nullif(btrim(coalesce(p_unit,'')),''), cfg.output_unit);
  IF lower(btrim(v_unit)) <> lower(btrim(cfg.output_unit)) THEN
    RAISE EXCEPTION
      'YIELD_OUTPUT_UNIT_MISMATCH: the actual yield was given in % but this batch is reconciled in %; no conversion is applied',
      v_unit, cfg.output_unit USING ERRCODE='P0001';
  END IF;

  v_theoretical := v_basis.basis_quantity * cfg.output_per_input;
  IF v_theoretical <= 0 THEN
    RAISE EXCEPTION 'YIELD_NO_THEORETICAL: the theoretical yield works out at %', v_theoretical
      USING ERRCODE='P0001';
  END IF;

  INSERT INTO public.batch_yield_reconciliations
    (company_id, batch_id, batch_stage_id, config_id,
     theoretical_basis, basis_quantity, output_per_input, threshold_pct,
     theoretical_quantity, actual_quantity, unit, notes, recorded_by)
  VALUES
    (b.company_id, p_batch_id, NULL, cfg.id,
     cfg.theoretical_basis, v_basis.basis_quantity, cfg.output_per_input,
     cfg.variance_threshold_pct,
     v_theoretical, p_actual_quantity, cfg.output_unit,
     nullif(btrim(coalesce(p_notes,'')),''),
     coalesce(v_actor,'00000000-0000-0000-0000-000000000000'::uuid))
  RETURNING id INTO v_id;

  SELECT * INTO r FROM public.batch_yield_reconciliations WHERE id = v_id;

  RETURN jsonb_build_object(
    'ok', true,
    'reconciliation_id', v_id,
    'theoretical_quantity', r.theoretical_quantity,
    'actual_quantity', r.actual_quantity,
    'unit', r.unit,
    'yield_pct', r.yield_pct,
    'variance_pct', r.variance_pct,
    'threshold_pct', r.threshold_pct,
    'within_threshold', r.within_threshold,
    'basis', r.theoretical_basis,
    'basis_quantity', r.basis_quantity,
    'basis_detail', v_basis.detail,
    'blocks_closure', r.within_threshold IS FALSE,
    'deviation_created', false);
END;
$$;

COMMENT ON FUNCTION public.yield_reconcile_batch(uuid,numeric,text,text) IS
  'Records the batch''s yield reconciliation at completion. Same discipline as the stage version: records freely, and blocking belongs to batch_record_close.';

REVOKE ALL ON FUNCTION public.yield_reconcile_batch(uuid,numeric,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.yield_reconcile_batch(uuid,numeric,text,text)
  TO authenticated, service_role;


--  ── The investigation flag ──────────────────────────────────────────
--  Raised by whoever looks into the variance, and it says what was
--  looked into. Separate from the authorisation because they are
--  different acts by different people: the flag is "this was
--  investigated", the authorisation is "and I accept it".
CREATE OR REPLACE FUNCTION public.yield_flag_investigation(
  p_reconciliation_id uuid,
  p_note              text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE r record; v_actor uuid := auth.uid();
BEGIN
  SELECT * INTO r FROM public.batch_yield_reconciliations WHERE id = p_reconciliation_id;
  IF r.id IS NULL THEN
    RAISE EXCEPTION 'YIELD_NO_RECONCILIATION: no such reconciliation %', p_reconciliation_id
      USING ERRCODE='P0002';
  END IF;
  IF NOT public.app_is_service_context()
     AND NOT public.app_is_company_member(r.company_id) THEN
    RAISE EXCEPTION 'BATCH_FORBIDDEN: caller is not a member of the owning company'
      USING ERRCODE='P0001';
  END IF;
  IF coalesce(btrim(p_note),'') = '' THEN
    RAISE EXCEPTION
      'YIELD_INVESTIGATION_NO_NOTE: an investigation flag has to say what was investigated'
      USING ERRCODE='P0001';
  END IF;

  UPDATE public.batch_yield_reconciliations
     SET investigation_required = true,
         investigation_note = btrim(p_note)
   WHERE id = p_reconciliation_id;

  --  NO DEVIATION IS CREATED. Item 12 says deviation arrives next week
  --  and marks the link point; flagging an investigation here does not
  --  open one.
  RETURN jsonb_build_object('ok', true, 'reconciliation_id', p_reconciliation_id,
                            'deviation_created', false);
END;
$$;

COMMENT ON FUNCTION public.yield_flag_investigation(uuid,text) IS
  'Raises the investigation flag on a reconciliation, with a note saying what was investigated. Creates no deviation — that is Week 6.';

REVOKE ALL ON FUNCTION public.yield_flag_investigation(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.yield_flag_investigation(uuid,text)
  TO authenticated, service_role;


--  ── The authorisation ───────────────────────────────────────────────
--  "Proceeding needs an investigation flag and supervisor
--   authorisation", and "proceeding without a recorded authorisation" is
--  a NOT DONE IF. So the authorisation is a row with a named supervisor,
--  a reason, a time and a signature — all four, or the gate still says
--  no.
CREATE OR REPLACE FUNCTION public.yield_authorise_variance(
  p_reconciliation_id uuid,
  p_reason            text,
  --  OPTIONAL. See byr_auth_complete_chk for why it cannot be required
  --  while a reconciliation has no lifecycle. Stored when given, and
  --  checked to be the authoriser's own.
  p_signature_id      uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE r record; v_actor uuid := auth.uid(); v_sig record;
BEGIN
  SELECT * INTO r FROM public.batch_yield_reconciliations WHERE id = p_reconciliation_id;
  IF r.id IS NULL THEN
    RAISE EXCEPTION 'YIELD_NO_RECONCILIATION: no such reconciliation %', p_reconciliation_id
      USING ERRCODE='P0002';
  END IF;
  IF NOT public.app_is_service_context()
     AND NOT public.app_is_company_member(r.company_id) THEN
    RAISE EXCEPTION 'BATCH_FORBIDDEN: caller is not a member of the owning company'
      USING ERRCODE='P0001';
  END IF;

  IF r.authorised_by IS NOT NULL THEN
    RAISE EXCEPTION 'YIELD_ALREADY_AUTHORISED: that variance was already authorised by % at %',
      r.authorised_by, r.authorised_at USING ERRCODE='P0001';
  END IF;

  --  Authorising a yield that was inside its threshold is authorising
  --  nothing, and it would leave a record implying there had been a
  --  problem.
  IF r.within_threshold IS NOT FALSE THEN
    RAISE EXCEPTION
      'YIELD_NOTHING_TO_AUTHORISE: that reconciliation is within its threshold, so there is nothing to authorise proceeding past'
      USING ERRCODE='P0001';
  END IF;

  --  THE INVESTIGATION COMES FIRST. The brief pairs them, and in that
  --  order: investigate, then authorise. An authorisation with no
  --  investigation behind it is a signature on an empty page.
  IF NOT r.investigation_required THEN
    RAISE EXCEPTION
      'YIELD_INVESTIGATION_REQUIRED: the variance has to be flagged for investigation, with a note, before proceeding can be authorised'
      USING ERRCODE='P0001';
  END IF;

  IF coalesce(btrim(p_reason),'') = '' THEN
    RAISE EXCEPTION
      'YIELD_AUTHORISATION_NO_REASON: an authorisation to proceed has to say why'
      USING ERRCODE='P0001';
  END IF;

  --  THE SECOND PERSON. The operator who measured the yield cannot
  --  authorise proceeding past it.
  IF r.recorded_by = coalesce(v_actor,'00000000-0000-0000-0000-000000000000'::uuid) THEN
    RAISE EXCEPTION
      'YIELD_SELF_AUTHORISED: the person who recorded the reconciliation cannot authorise proceeding past its variance'
      USING ERRCODE='P0001';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.company_members
                  WHERE company_id = r.company_id AND user_id = v_actor AND status = 'active') THEN
    RAISE EXCEPTION
      'YIELD_AUTHORISER_UNKNOWN: the authoriser is not an active member of this company'
      USING ERRCODE='P0001';
  END IF;

  --  A SIGNATURE IS OPTIONAL, and checked when supplied: it has to
  --  exist, it has to be THIS authoriser's, and it has to be in this
  --  company. Handing in somebody else's signature is the thing worth
  --  refusing, and that much can be checked without the reconciliation
  --  being a lifecycle entity.
  --
  --  It is deliberately NOT bound to the reconciliation itself. Binding
  --  it would mean the signature had to be taken ON this reconciliation,
  --  which sign_electronic_record cannot do for a record with no
  --  lifecycle — see byr_auth_complete_chk. Pretending to a binding that
  --  cannot exist would read as a stronger control than it is.
  IF p_signature_id IS NOT NULL THEN
    SELECT signer_id, entity_type, entity_id, company_id INTO v_sig
      FROM public.electronic_signatures WHERE id = p_signature_id;
    IF v_sig.signer_id IS NULL THEN
      RAISE EXCEPTION 'YIELD_AUTHORISATION_SIGNATURE_INVALID: no such signature %', p_signature_id
        USING ERRCODE='P0002';
    END IF;
    IF v_sig.signer_id IS DISTINCT FROM v_actor
       OR v_sig.company_id IS DISTINCT FROM r.company_id THEN
      RAISE EXCEPTION
        'YIELD_AUTHORISATION_SIGNATURE_MISMATCH: that signature was not given by this authoriser'
        USING ERRCODE='P0001';
    END IF;
  END IF;

  UPDATE public.batch_yield_reconciliations
     SET authorised_by = v_actor,
         authorised_at = now(),
         authorisation_reason = btrim(p_reason),
         authorisation_signature_id = p_signature_id
   WHERE id = p_reconciliation_id;

  RETURN jsonb_build_object('ok', true, 'reconciliation_id', p_reconciliation_id,
                            'authorised_by', v_actor,
                            'deviation_created', false);
END;
$$;

COMMENT ON FUNCTION public.yield_authorise_variance(uuid,text,uuid) IS
  'Records a supervisor''s authorisation to proceed past a yield variance: who, when and why, with an optional signature. Requires the investigation flag first, refuses the person who recorded the numbers, refuses a non-member, and refuses a variance that was within threshold. A signature is not mandatory because sign_electronic_record only signs lifecycle-governed records and a reconciliation is not one — requiring it would make the gate unclearable. Creates no deviation.';

REVOKE ALL ON FUNCTION public.yield_authorise_variance(uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.yield_authorise_variance(uuid,text,uuid)
  TO authenticated, service_role;


-- ── 7. THE BLOCK, WIRED IN ───────────────────────────────────────────
--
--  This is where item 12 either exists or does not. The calculation
--  above is worth nothing on its own; "the calculation is right but the
--  threshold blocks nothing" is the first NOT DONE IF, and the only
--  thing that makes it false is these two functions refusing.
--
--  batch_stage_complete is re-declared rather than wrapped, for the
--  third time: item 07 wrote it, item 10 added the calibration lockout,
--  item 12 adds the yield block. A wrapper would leave the unwrapped
--  function reachable, and REVOKE on it would not help — the gate has
--  to be inside the function everybody already calls.
--
--  The yield check is placed AFTER the calibration lockout and BEFORE
--  the verifier requirements, deliberately: an uncalibrated balance
--  makes the yield figure itself untrustworthy, so there is no point
--  asking a supervisor to authorise a variance measured on it.

CREATE OR REPLACE FUNCTION public.batch_stage_complete(
  p_stage_id              uuid,
  p_operator_signature_id uuid,
  p_verifier_id           uuid DEFAULT NULL,
  p_verifier_signature_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  c record; v_actor uuid := auth.uid(); v_sig record; v_res jsonb;
  v_bad record; v_block text;
BEGIN
  SELECT * INTO c FROM public.batch_stage_context(p_stage_id);

  IF c.closed_at IS NOT NULL THEN
    RAISE EXCEPTION 'BATCH_CLOSED: batch % was closed at % and no stage can be completed',
      c.batch_id, c.closed_at USING ERRCODE = 'P0001';
  END IF;

  -- ── ITEM 10'S LOCKOUT ON A STAGE SIGN-OFF ───────────────────────────
  --  Every instrument recorded against this stage is re-checked NOW, not
  --  as it stood when the use was recorded.
  SELECT i.code, i.name, i.calibration_due_date INTO v_bad
    FROM public.instrument_usages u
    JOIN public.instruments i ON i.id = u.instrument_id
   WHERE u.entity_type = 'batch_stage' AND u.entity_id = p_stage_id
     AND public.instrument_block_reason(u.instrument_id) IS NOT NULL
   ORDER BY i.code
   LIMIT 1;

  IF v_bad.code IS NOT NULL THEN
    RAISE EXCEPTION 'INSTRUMENT_NOT_CALIBRATED: %',
      public.instrument_block_reason(
        (SELECT u.instrument_id FROM public.instrument_usages u
          JOIN public.instruments i2 ON i2.id = u.instrument_id
         WHERE u.entity_type='batch_stage' AND u.entity_id=p_stage_id AND i2.code = v_bad.code
         LIMIT 1))
      USING ERRCODE = 'P0001';
  END IF;

  -- ── ITEM 12'S YIELD BLOCK ───────────────────────────────────────────
  --  "Variance beyond threshold blocks stage completion."
  v_block := public.yield_block_reason(p_stage_id);
  IF v_block IS NOT NULL THEN
    RAISE EXCEPTION 'YIELD_VARIANCE_BLOCKED: %', v_block USING ERRCODE = 'P0001';
  END IF;

  IF c.requires_verifier THEN
    IF p_verifier_id IS NULL OR p_verifier_signature_id IS NULL THEN
      RAISE EXCEPTION
        'BATCH_STAGE_VERIFIER_REQUIRED: stage % requires a second person to verify it, with their own signature',
        c.sequence_no USING ERRCODE = 'P0001';
    END IF;

    IF p_verifier_id = coalesce(v_actor, '00000000-0000-0000-0000-000000000000'::uuid) THEN
      RAISE EXCEPTION
        'BATCH_STAGE_SELF_VERIFIED: the operator cannot also be the verifier'
        USING ERRCODE = 'P0001';
    END IF;

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
  'Completes a stage: re-checks every instrument used against it (item 10), refuses on an unreconciled or unauthorised yield variance (item 12), then enforces the verifier requirements (item 07) and moves the stage through the engine.';

REVOKE ALL ON FUNCTION public.batch_stage_complete(uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.batch_stage_complete(uuid,uuid,uuid,uuid) TO authenticated, service_role;


--  batch_record_close gains the batch-completion reconciliation. Same
--  re-declaration, same reason.
CREATE OR REPLACE FUNCTION public.batch_record_close(
  p_batch_id uuid,
  p_comment  text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE b record; v_actor uuid := auth.uid(); v_open record; v_res jsonb; v_block text;
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

  -- ── ITEM 12'S YIELD BLOCK AT BATCH COMPLETION ───────────────────────
  --  "Reconciliation at stages flagged for it AND AT BATCH COMPLETION."
  --  Checked before anything is written, because closure is permanent:
  --  a batch closed with an unreconciled yield could never be
  --  reconciled afterwards.
  v_block := public.yield_batch_block_reason(p_batch_id);
  IF v_block IS NOT NULL THEN
    RAISE EXCEPTION 'YIELD_VARIANCE_BLOCKED: %', v_block USING ERRCODE = 'P0001';
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
  'Closes manufacturing execution and hands the record to QC. Refuses while any stage is incomplete, and refuses on an unreconciled or unauthorised batch yield variance (item 12). Sets execution_closed_at, which permanently freezes stages, readings and reconciliations.';

REVOKE ALL ON FUNCTION public.batch_record_close(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.batch_record_close(uuid,text) TO authenticated, service_role;


-- ── 8. A read for the screens (item 19) ──────────────────────────────
--
--  "A yield reconciliation view showing variance, threshold and the
--   block at stage completion." All three in one answer, so a screen
--  does not re-derive the verdict it can be told.

CREATE OR REPLACE FUNCTION public.yield_reconciliation_status(p_batch_id uuid)
RETURNS TABLE (
  scope            text,
  batch_stage_id   uuid,
  sequence_no      integer,
  stage_name       text,
  configured       boolean,
  reconciliation_id uuid,
  theoretical_quantity numeric,
  actual_quantity  numeric,
  unit             text,
  yield_pct        numeric,
  variance_pct     numeric,
  threshold_pct    numeric,
  within_threshold boolean,
  investigation_required boolean,
  authorised_by    uuid,
  block_reason     text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_company uuid; v_product uuid;
BEGIN
  SELECT company_id, product_id INTO v_company, v_product
    FROM public.batch_records WHERE id = p_batch_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'BATCH_NO_RECORD: no such batch record %', p_batch_id USING ERRCODE='P0002';
  END IF;
  IF NOT public.app_is_service_context()
     AND NOT public.app_is_company_member(v_company) THEN
    RAISE EXCEPTION 'BATCH_FORBIDDEN: caller is not a member of the owning company'
      USING ERRCODE='P0001';
  END IF;

  RETURN QUERY
  SELECT 'stage'::text, bs.id, bs.sequence_no, bs.name,
         (cfg.id IS NOT NULL),
         r.id, r.theoretical_quantity, r.actual_quantity, r.unit,
         r.yield_pct, r.variance_pct, r.threshold_pct, r.within_threshold,
         coalesce(r.investigation_required, false), r.authorised_by,
         public.yield_block_reason(bs.id)
    FROM public.batch_stages bs
    LEFT JOIN public.yield_reconciliation_configs cfg
           ON cfg.product_id = v_product AND cfg.formula_stage_id = bs.formula_stage_id
    LEFT JOIN public.batch_yield_reconciliations r
           ON r.batch_id = p_batch_id AND r.batch_stage_id = bs.id
   WHERE bs.batch_id = p_batch_id
  UNION ALL
  SELECT 'batch'::text, NULL::uuid, NULL::integer, NULL::text,
         (cfg.id IS NOT NULL),
         r.id, r.theoretical_quantity, r.actual_quantity, r.unit,
         r.yield_pct, r.variance_pct, r.threshold_pct, r.within_threshold,
         coalesce(r.investigation_required, false), r.authorised_by,
         public.yield_batch_block_reason(p_batch_id)
    FROM (SELECT 1) one
    LEFT JOIN public.yield_reconciliation_configs cfg
           ON cfg.product_id = v_product AND cfg.formula_stage_id IS NULL
    LEFT JOIN public.batch_yield_reconciliations r
           ON r.batch_id = p_batch_id AND r.batch_stage_id IS NULL
  ORDER BY 1 DESC, 3 NULLS LAST;
END;
$$;

COMMENT ON FUNCTION public.yield_reconciliation_status(uuid) IS
  'Every stage of a batch plus the batch itself: whether reconciliation is configured, the figures if recorded, and the block reason if it blocks. One answer so a screen shows variance, threshold and the block together.';

REVOKE ALL ON FUNCTION public.yield_reconciliation_status(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.yield_reconciliation_status(uuid)
  TO authenticated, service_role;


-- ── 9. The deploy-time guard ─────────────────────────────────────────
--
--  Every constraint and trigger above is declared inside a guarded DO
--  block, which means a re-run cannot repair a missing one and nothing
--  would say so. This raises if any of them is absent after the
--  migration has otherwise applied.
DO $item12_guard$
DECLARE
  v_missing text[] := '{}';
  v_constraints text[] := ARRAY[
    'yrc_product_stage_uniq','yrc_basis_chk','yrc_threshold_chk','yrc_factor_chk',
    'yrc_units_chk','yrc_basis_scope_chk',
    'byr_scope_uniq','byr_basis_chk','byr_quantities_chk','byr_threshold_chk',
    'byr_unit_chk','byr_auth_complete_chk','byr_auth_pair_chk',
    'byr_auth_needs_investigation_chk','byr_investigation_note_chk','byr_auth_distinct_chk'
  ];
  v_triggers text[] := ARRAY[
    'trg_byr_calculate','trg_byr_immutable','trg_byr_no_delete'
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

  --  THE BLOCK ITSELF. A deploy that landed the tables, the arithmetic
  --  and the threshold but left batch_stage_complete without the yield
  --  check is precisely item 12's first NOT DONE IF, and it would look
  --  entirely healthy from the outside: configs present, reconciliations
  --  recording, percentages correct, nothing blocked. So the wiring is
  --  checked by reading the function body, which is the only evidence
  --  there is that the call survived a later re-declaration.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'batch_stage_complete'
       AND pg_get_functiondef(p.oid) LIKE '%yield_block_reason%') THEN
    v_missing := v_missing ||
      'the yield_block_reason call inside batch_stage_complete (item 12 calculates but blocks nothing without it)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'batch_record_close'
       AND pg_get_functiondef(p.oid) LIKE '%yield_batch_block_reason%') THEN
    v_missing := v_missing ||
      'the yield_batch_block_reason call inside batch_record_close';
  END IF;

  --  Item 10's lockout must have survived this file's re-declaration of
  --  batch_stage_complete. Re-declaring a function another item already
  --  extended is how a control gets quietly dropped, and this is the
  --  third item to re-declare this one.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'batch_stage_complete'
       AND pg_get_functiondef(p.oid) LIKE '%instrument_block_reason%') THEN
    v_missing := v_missing ||
      'item 10''s instrument_block_reason call inside batch_stage_complete (dropped by this migration''s re-declaration)';
  END IF;

  --  And item 07's verifier rules likewise.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'batch_stage_complete'
       AND pg_get_functiondef(p.oid) LIKE '%BATCH_STAGE_SELF_VERIFIED%') THEN
    v_missing := v_missing ||
      'item 07''s self-verification check inside batch_stage_complete';
  END IF;

  --  THE THRESHOLD MUST HAVE NO DEFAULT. "Threshold hardcoded" is a NOT
  --  DONE IF, and a default added later — by a well-meaning migration
  --  wanting the column to be easier to populate — is how it would come
  --  back without anybody deciding to hardcode anything.
  IF EXISTS (
    SELECT 1 FROM pg_attrdef d
      JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
     WHERE d.adrelid = 'public.yield_reconciliation_configs'::regclass
       AND a.attname = 'variance_threshold_pct') THEN
    v_missing := v_missing ||
      'the ABSENCE of a default on variance_threshold_pct (a default threshold is a hardcoded threshold)';
  END IF;

  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION
      'ITEM12_CONTROLS_MISSING: this migration applied but the following are not present: %.',
      array_to_string(v_missing, ', ') USING ERRCODE = 'P0001';
  END IF;
END
$item12_guard$;
