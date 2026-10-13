-- ===================================================================
--  WEEK 4 / ITEM 11 — IN-PROCESS CONTROL AND OOS HANDLING
--
--  "Sampling frequency configurable per test per product. Due prompts.
--   Each result timestamped and numbered in sequence.
--   Readings compared with specification as they are entered.
--   Weight variation classified into zones 1, 2U, 2L, 3U, 3L against
--   UAL, UWL, LWL and LAL, limits per product, with an action per zone:
--   accept, adjust, resample, reject.
--   An out-of-specification product attribute is flagged immediately,
--   does not block entry, and does not create a deviation. The operator
--   can correct before saving.
--   Saving needs acknowledgement and offers escalation, and the
--   supervisor's decision is recorded.
--   The interlock path for machine settings is not built this week. The
--   decision is pending with Damilola and Aderoh."
--
--  NOT DONE IF
--    An OOS reading blocks entry. Damilola was explicit and repeated on
--      this.
--    An OOS reading creates a deviation automatically.
--    Zone limits are global rather than per product.
--    The interlock path was built anyway.
--
--  ═══════════════════════════════════════════════════════════════════
--  THE INTERLOCK PATH IS DELIBERATELY NOT BUILT
--  ═══════════════════════════════════════════════════════════════════
--  The last NOT DONE IF makes building MORE than was asked a failure,
--  which is unusual enough to state plainly: a machine setting recorded
--  out of specification here is CLASSIFIED and FLAGGED and nothing else.
--  Nothing is stopped, no equipment command is implied, no state is
--  changed. The decision about what an interlock should do is pending
--  with Damilola and Aderoh, and guessing at it in code would be a
--  guess somebody later has to find and remove.
--
--  If you are here to add it: the place it goes is a trigger beside
--  fn_bspr_classify(), and it needs that decision first.
--
--  ═══════════════════════════════════════════════════════════════════
--  WHY AN OOS READING IS NOT ALLOWED TO BLOCK ENTRY
--  ═══════════════════════════════════════════════════════════════════
--  The brief says "Damilola was explicit and repeated on this", and the
--  reason is worth keeping next to the code: a system that refuses to
--  accept a measurement it does not like does not get better
--  measurements, it gets measurements written on paper. The record then
--  lives in a notebook and the database holds a tidy fiction.
--
--  So every reading saves. What an out-of-specification reading requires
--  is ACKNOWLEDGEMENT — the person entering it confirming they have seen
--  the flag — which is a different thing from a refusal, and the brief
--  asks for both in the same breath. Escalation to a supervisor is
--  OFFERED, never required; where it happens the decision is recorded.
--
--  AND NO DEVIATION IS CREATED. There is no deviation table yet (Week 6)
--  and this migration does not invent one. The link point is marked on
--  the escalation row.
-- ===================================================================


-- ── 1. Sampling frequency, per test per product ──────────────────────
--
--  "Per test per product": a test IS a stage parameter, and a parameter
--  belongs to a stage of a formula, and a formula belongs to one product.
--  So the frequency goes on the parameter — which also makes it part of
--  the frozen manufacturing instruction, since master_formula_approve()
--  freezes a formula's children. A batch therefore samples at the
--  frequency its OWN formula version specified, which is the same
--  reasoning item 06 applied to everything else on that row.

--  ONLY A CLOCK INTERVAL IS STORED, and that is a decision rather than
--  an omission. In-process control is often specified as "every 30
--  minutes OR every 10,000 units", and a units interval would be easy to
--  add as a column — but nothing in this system counts units produced
--  yet (that arrives with item 12's yield reconciliation). A stored
--  "every 5000 units" that no prompt ever fires on is worse than no
--  field at all: it reads as configured and silently does nothing, which
--  is the same failure the NOT DONE IF clauses in this item are about.
--  When there is a produced count to compare against, the column and the
--  branch in inprocess_sampling_due() go in together.
ALTER TABLE public.master_formula_stage_parameters
  ADD COLUMN IF NOT EXISTS sampling_interval_minutes integer,
  --  Weight variation is the one test with zones, so it is flagged
  --  rather than guessed from the parameter's name.
  ADD COLUMN IF NOT EXISTS is_weight_variation boolean NOT NULL DEFAULT false;

DO $mfsp_checks$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='mfsp_sampling_chk') THEN
    ALTER TABLE public.master_formula_stage_parameters ADD CONSTRAINT mfsp_sampling_chk
      CHECK (sampling_interval_minutes IS NULL OR sampling_interval_minutes > 0);
  END IF;

  --  A weight-variation test is a measurement of a product attribute. A
  --  machine setting cannot be one, and allowing it would put a zone on
  --  a reading the zones mean nothing for.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='mfsp_weight_is_attribute_chk') THEN
    ALTER TABLE public.master_formula_stage_parameters ADD CONSTRAINT mfsp_weight_is_attribute_chk
      CHECK (NOT is_weight_variation OR parameter_type = 'product_attribute');
  END IF;
END
$mfsp_checks$;

COMMENT ON COLUMN public.master_formula_stage_parameters.sampling_interval_minutes IS
  'How often this test falls due, in minutes. Null means it is not on a clock. Lives on the parameter because the brief says "per test per product" and a parameter belongs to one product''s formula — and because master_formula_approve() freezes it, so a running batch samples at the frequency its own version specified.';
COMMENT ON COLUMN public.master_formula_stage_parameters.is_weight_variation IS
  'Marks the test whose readings are classified into weight zones. Flagged rather than inferred from the parameter name, because "Weight", "Fill weight" and "Tablet mass" are all the same test and none of them is a reliable string to match on.';


-- ── 2. Zone limits, per product ──────────────────────────────────────
--
--  "Zone limits are global rather than per product" is a NOT DONE IF, so
--  there is no global table and no fallback. A product either has its own
--  limits or has none, and a reading taken without them is recorded as
--  UNCLASSIFIED rather than classified against somebody else's numbers.

CREATE TABLE IF NOT EXISTS public.product_weight_limits (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id   uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,

  target_value numeric(18,6) NOT NULL,
  --  Lower action, lower warning, upper warning, upper action.
  lal          numeric(18,6) NOT NULL,
  lwl          numeric(18,6) NOT NULL,
  uwl          numeric(18,6) NOT NULL,
  ual          numeric(18,6) NOT NULL,
  unit         text NOT NULL,

  --  "with an action per zone: accept, adjust, resample, reject" — an
  --  action PER ZONE, which means the mapping is configuration and not a
  --  constant. The defaults are the conventional ones; a product that
  --  resamples at the action limit instead of rejecting says so here.
  zone_1_action  text NOT NULL DEFAULT 'accept',
  zone_2u_action text NOT NULL DEFAULT 'adjust',
  zone_2l_action text NOT NULL DEFAULT 'adjust',
  zone_3u_action text NOT NULL DEFAULT 'reject',
  zone_3l_action text NOT NULL DEFAULT 'reject',

  notes        text,
  created_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.product_weight_limits IS
  'Weight variation limits and the action for each zone, PER PRODUCT. There is deliberately no company-wide or global default: "zone limits are global rather than per product" is one of item 11''s NOT DONE IF clauses, so a product without limits yields an unclassified reading rather than one judged against another product''s numbers.';

DO $pwl_checks$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pwl_product_uniq') THEN
    ALTER TABLE public.product_weight_limits ADD CONSTRAINT pwl_product_uniq UNIQUE (product_id);
  END IF;

  --  THE ORDERING IS THE WHOLE MEANING. Limits out of order make the
  --  zones overlap or invert, and a reading could then be in two zones
  --  or none. Enforced rather than assumed, because a data-entry slip
  --  that swaps UWL and UAL silently turns "adjust" into "reject".
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pwl_order_chk') THEN
    ALTER TABLE public.product_weight_limits ADD CONSTRAINT pwl_order_chk
      CHECK (lal < lwl AND lwl <= target_value AND target_value <= uwl AND uwl < ual);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pwl_actions_chk') THEN
    ALTER TABLE public.product_weight_limits ADD CONSTRAINT pwl_actions_chk
      CHECK (zone_1_action  IN ('accept','adjust','resample','reject')
         AND zone_2u_action IN ('accept','adjust','resample','reject')
         AND zone_2l_action IN ('accept','adjust','resample','reject')
         AND zone_3u_action IN ('accept','adjust','resample','reject')
         AND zone_3l_action IN ('accept','adjust','resample','reject'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pwl_unit_chk') THEN
    ALTER TABLE public.product_weight_limits ADD CONSTRAINT pwl_unit_chk
      CHECK (btrim(unit) <> '');
  END IF;
END
$pwl_checks$;

CREATE INDEX IF NOT EXISTS pwl_company_idx ON public.product_weight_limits(company_id);

ALTER TABLE public.product_weight_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pwl_select ON public.product_weight_limits;
CREATE POLICY pwl_select ON public.product_weight_limits FOR SELECT TO authenticated
  USING (public.app_is_company_member(company_id));
DROP POLICY IF EXISTS pwl_write ON public.product_weight_limits;
CREATE POLICY pwl_write ON public.product_weight_limits FOR ALL TO authenticated
  USING (public.app_is_company_member(company_id))
  WITH CHECK (public.app_is_company_member(company_id));


-- ── 3. The classification itself ─────────────────────────────────────
--
--  Zones 1, 2U, 2L, 3U, 3L exactly as the brief names them. The boundary
--  convention is stated here once and tested at every edge, because a
--  zone scheme whose boundaries are ambiguous is five zones that
--  sometimes mean four.
--
--      zone 1   LWL <= v <= UWL        inside the warning limits
--      zone 2U  UWL <  v <= UAL        above warning, at or under action
--      zone 3U  v > UAL                above the action limit
--      zone 2L  LAL <= v <  LWL        below warning, at or over action
--      zone 3L  v < LAL                below the action limit
--
--  The warning limits are INCLUSIVE to zone 1 and the action limits are
--  inclusive to zone 2: a reading exactly on a limit is in the calmer
--  zone. A limit is the edge of what is acceptable, not the first value
--  that is not.
CREATE OR REPLACE FUNCTION public.weight_variation_zone(
  p_product_id uuid,
  p_value      numeric
) RETURNS TABLE (zone text, action text, limits_configured boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE l record; v_zone text;
BEGIN
  SELECT * INTO l FROM public.product_weight_limits WHERE product_id = p_product_id;

  --  SECURITY DEFINER, so RLS on product_weight_limits does not apply
  --  here and the membership check has to be explicit. Without it any
  --  authenticated caller holding a product id could probe this function
  --  at a few values and read another tenant's action limits straight
  --  off the answers — the table is protected but the classifier over it
  --  would not be. The check is placed AFTER the lookup so that a
  --  product with no limits still answers "unconfigured" rather than
  --  "forbidden": whether a product exists is not what is being guarded.
  IF l.id IS NOT NULL
     AND NOT public.app_is_service_context()
     AND NOT public.app_is_company_member(l.company_id) THEN
    RAISE EXCEPTION
      'WEIGHT_LIMITS_FORBIDDEN: caller is not a member of the company that owns this product'
      USING ERRCODE = 'P0001';
  END IF;

  IF l.id IS NULL OR p_value IS NULL THEN
    --  No limits for this product, or nothing to classify. Reported as
    --  UNCONFIGURED rather than as a zone, so a caller cannot mistake
    --  silence for "zone 1".
    RETURN QUERY SELECT NULL::text, NULL::text, false;
    RETURN;
  END IF;

  v_zone := CASE
    WHEN p_value > l.ual                            THEN '3U'
    WHEN p_value > l.uwl                            THEN '2U'
    WHEN p_value >= l.lwl                           THEN '1'
    WHEN p_value >= l.lal                           THEN '2L'
    ELSE                                                 '3L'
  END;

  RETURN QUERY SELECT v_zone,
    CASE v_zone
      WHEN '1'  THEN l.zone_1_action
      WHEN '2U' THEN l.zone_2u_action
      WHEN '2L' THEN l.zone_2l_action
      WHEN '3U' THEN l.zone_3u_action
      ELSE           l.zone_3l_action
    END,
    true;
END;
$$;

COMMENT ON FUNCTION public.weight_variation_zone(uuid,numeric) IS
  'Classifies a weight into zone 1, 2U, 2L, 3U or 3L against the product''s own UAL, UWL, LWL and LAL, and returns the action that product configured for that zone. limits_configured is false when the product has no limits — reported rather than defaulted, so an unconfigured product cannot read as zone 1.';

REVOKE ALL ON FUNCTION public.weight_variation_zone(uuid,numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.weight_variation_zone(uuid,numeric) TO authenticated, service_role;


-- ── 4. What a reading now carries ────────────────────────────────────

ALTER TABLE public.batch_stage_parameter_readings
  --  "Each result timestamped and numbered in sequence." recorded_at is
  --  the timestamp (item 07); this is the number.
  ADD COLUMN IF NOT EXISTS sequence_no integer,

  --  The classification, snapshotted. A product's limits can be revised,
  --  and what zone this reading fell in is a fact about this reading.
  ADD COLUMN IF NOT EXISTS weight_zone  text,
  ADD COLUMN IF NOT EXISTS zone_action  text,
  ADD COLUMN IF NOT EXISTS zone_lal numeric(18,6),
  ADD COLUMN IF NOT EXISTS zone_lwl numeric(18,6),
  ADD COLUMN IF NOT EXISTS zone_uwl numeric(18,6),
  ADD COLUMN IF NOT EXISTS zone_ual numeric(18,6),

  --  "Saving needs acknowledgement." Not a refusal — see the header.
  ADD COLUMN IF NOT EXISTS oos_acknowledged_by uuid,
  ADD COLUMN IF NOT EXISTS oos_acknowledged_at timestamptz;

COMMENT ON COLUMN public.batch_stage_parameter_readings.sequence_no IS
  'The result''s number in sequence, per test per stage, assigned by the database. "Numbered in sequence" is a traceability requirement: sample 3 of 5 is a different claim from "some reading at 14:02", and a client-supplied number is one two operators can collide on.';
COMMENT ON COLUMN public.batch_stage_parameter_readings.weight_zone IS
  'Zone 1, 2U, 2L, 3U or 3L, snapshotted at the moment of recording along with the four limits it was judged against — because a product''s limits can be revised and what this reading meant is a fact about this reading.';
COMMENT ON COLUMN public.batch_stage_parameter_readings.oos_acknowledged_by IS
  'Who confirmed they had seen the out-of-specification flag. Required to SAVE an OOS reading, which is not the same as blocking entry: the value is accepted, the person simply has to have looked at it. Item 11''s first NOT DONE IF is about refusing the measurement, and nothing here refuses one.';

DO $bspr_i11_checks$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='bspr_sequence_uniq') THEN
    ALTER TABLE public.batch_stage_parameter_readings ADD CONSTRAINT bspr_sequence_uniq
      UNIQUE (batch_stage_id, formula_parameter_id, sequence_no);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='bspr_zone_chk') THEN
    ALTER TABLE public.batch_stage_parameter_readings ADD CONSTRAINT bspr_zone_chk
      CHECK (weight_zone IS NULL OR weight_zone IN ('1','2U','2L','3U','3L'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='bspr_zone_action_chk') THEN
    ALTER TABLE public.batch_stage_parameter_readings ADD CONSTRAINT bspr_zone_action_chk
      CHECK (zone_action IS NULL OR zone_action IN ('accept','adjust','resample','reject'));
  END IF;

  --  A zone without its action, or an action without its zone, is half a
  --  classification.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='bspr_zone_pair_chk') THEN
    ALTER TABLE public.batch_stage_parameter_readings ADD CONSTRAINT bspr_zone_pair_chk
      CHECK ((weight_zone IS NULL) = (zone_action IS NULL));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='bspr_ack_pair_chk') THEN
    ALTER TABLE public.batch_stage_parameter_readings ADD CONSTRAINT bspr_ack_pair_chk
      CHECK ((oos_acknowledged_by IS NULL) = (oos_acknowledged_at IS NULL));
  END IF;

  --  THE ACKNOWLEDGEMENT REQUIREMENT. Stated as a constraint so it holds
  --  on every write path, and phrased as "an out-of-spec reading carries
  --  an acknowledgement" rather than "an out-of-spec reading is refused".
  --
  --  NOT VALID, deliberately. batch_stage_parameter_readings ships with
  --  item 07, so by the time this migration runs a database may already
  --  hold out-of-specification readings taken before anyone was asked to
  --  acknowledge one. NOT VALID enforces the rule on every INSERT and on
  --  every UPDATE from here on, and leaves that history alone.
  --
  --  The alternative was to backfill an acknowledgement onto those rows,
  --  and there is nobody to attribute it to: an acknowledgement is a
  --  person's act at a moment, and a manufactured one is a signature
  --  nobody gave. A record with an honest gap beats a record with an
  --  invented entry. VALIDATE CONSTRAINT can be run later if a company
  --  decides its history is clean.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='bspr_oos_ack_chk') THEN
    ALTER TABLE public.batch_stage_parameter_readings ADD CONSTRAINT bspr_oos_ack_chk
      CHECK (in_specification IS DISTINCT FROM false OR oos_acknowledged_by IS NOT NULL)
      NOT VALID;
  END IF;
END
$bspr_i11_checks$;

CREATE INDEX IF NOT EXISTS bspr_sequence_idx
  ON public.batch_stage_parameter_readings(batch_stage_id, formula_parameter_id, sequence_no);
--  The out-of-specification queue a screen shows.
CREATE INDEX IF NOT EXISTS bspr_oos_idx
  ON public.batch_stage_parameter_readings(company_id, recorded_at DESC)
  WHERE in_specification = false;


-- ── 5. Numbering in sequence, safely ─────────────────────────────────
--
--  max(sequence_no) + 1 is a lost-update waiting to happen: two operators
--  recording sample 3 at the same moment both read 2 and both write 3.
--  The unique constraint above would catch it as an error, which is
--  better than a duplicate and still worse than not happening.
--
--  So the assignment takes a transaction-scoped advisory lock on the
--  (stage, parameter) pair. Concurrent inserts for the SAME test queue up
--  and get consecutive numbers; inserts for different tests never
--  contend. The unique constraint stays as the backstop that proves this
--  works rather than as the mechanism.
CREATE OR REPLACE FUNCTION public.fn_bspr_assign_sequence()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.sequence_no IS NOT NULL THEN
    --  The number is the database's to assign. A caller-supplied one is
    --  a number two operators can pick simultaneously, and it is exactly
    --  the field an audit would least like to be guessable.
    RAISE EXCEPTION
      'BSPR_SEQUENCE_ASSIGNED: the result number is assigned in sequence by the database and cannot be supplied'
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('bspr_seq'),
    hashtext(NEW.batch_stage_id::text || coalesce(NEW.formula_parameter_id::text,'-')));

  SELECT coalesce(max(sequence_no), 0) + 1 INTO NEW.sequence_no
    FROM public.batch_stage_parameter_readings
   WHERE batch_stage_id = NEW.batch_stage_id
     AND formula_parameter_id IS NOT DISTINCT FROM NEW.formula_parameter_id;

  RETURN NEW;
END;
$$;

--  Sorts before fn_bspr_classify so the number exists by the time the
--  classification runs, and before item 07's evaluate for the same
--  reason — nothing downstream has to wonder whether it is set.
DROP TRIGGER IF EXISTS trg_bspr_a_assign_sequence ON public.batch_stage_parameter_readings;
CREATE TRIGGER trg_bspr_a_assign_sequence
  BEFORE INSERT ON public.batch_stage_parameter_readings
  FOR EACH ROW EXECUTE FUNCTION public.fn_bspr_assign_sequence();


-- ── 6. Classification on write ───────────────────────────────────────
--
--  "Readings compared with specification as they are entered" — item 07
--  already computes in_specification from the parameter's limits. This
--  adds the zone, for the one test that has zones, and snapshots the
--  limits it was judged against.
--
--  Named to sort after item 07's trg_bspr_evaluate, which sets
--  in_specification: the acknowledgement constraint reads that value, so
--  it has to be settled first.
CREATE OR REPLACE FUNCTION public.fn_bspr_classify()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_is_weight boolean := false;
  v_product uuid;
  z record;
  l record;
BEGIN
  IF NEW.formula_parameter_id IS NULL OR NEW.reading_value IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT fp.is_weight_variation, mf.product_id
    INTO v_is_weight, v_product
    FROM public.master_formula_stage_parameters fp
    JOIN public.master_formula_stages fs ON fs.id = fp.stage_id
    JOIN public.master_formulas mf       ON mf.id = fs.formula_id
   WHERE fp.id = NEW.formula_parameter_id;

  IF NOT coalesce(v_is_weight, false) THEN
    --  Not a weight-variation test, so it has no zone. Any zone a caller
    --  tried to supply is cleared rather than trusted: the zone is
    --  derived, and a hand-written one is an opinion.
    NEW.weight_zone := NULL;
    NEW.zone_action := NULL;
    RETURN NEW;
  END IF;

  SELECT * INTO z FROM public.weight_variation_zone(v_product, NEW.reading_value);

  IF NOT z.limits_configured THEN
    --  UNCLASSIFIED, and recorded anyway. Refusing here would block
    --  entry for a configuration gap, which is precisely what item 11's
    --  first NOT DONE IF forbids. in_specification is unaffected — item
    --  07 derives that from the parameter's own min and max — so the
    --  reading is still judged, just not zoned.
    NEW.weight_zone := NULL;
    NEW.zone_action := NULL;
    RETURN NEW;
  END IF;

  NEW.weight_zone := z.zone;
  NEW.zone_action := z.action;

  SELECT lal, lwl, uwl, ual INTO l
    FROM public.product_weight_limits WHERE product_id = v_product;
  NEW.zone_lal := l.lal;
  NEW.zone_lwl := l.lwl;
  NEW.zone_uwl := l.uwl;
  NEW.zone_ual := l.ual;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bspr_z_classify ON public.batch_stage_parameter_readings;
CREATE TRIGGER trg_bspr_z_classify
  BEFORE INSERT ON public.batch_stage_parameter_readings
  FOR EACH ROW EXECUTE FUNCTION public.fn_bspr_classify();

COMMENT ON FUNCTION public.fn_bspr_classify() IS
  'Assigns the weight zone and its action from the PRODUCT''s limits, and snapshots the four limits onto the reading. A product with no limits yields an unclassified reading rather than a refusal, because refusing would block entry for a configuration gap — item 11''s first NOT DONE IF.';


--  The zone and the sequence number are derived, so they are not
--  editable afterwards. Item 07 already froze reading_value; this adds
--  the fields item 11 derives.
CREATE OR REPLACE FUNCTION public.fn_bspr_derived_immutable()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.sequence_no IS DISTINCT FROM OLD.sequence_no
     OR NEW.weight_zone IS DISTINCT FROM OLD.weight_zone
     OR NEW.zone_action IS DISTINCT FROM OLD.zone_action THEN
    RAISE EXCEPTION
      'BSPR_DERIVED_READ_ONLY: the result number and the weight zone are derived at the moment of recording and cannot be changed'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bspr_derived_immutable ON public.batch_stage_parameter_readings;
CREATE TRIGGER trg_bspr_derived_immutable
  BEFORE UPDATE ON public.batch_stage_parameter_readings
  FOR EACH ROW EXECUTE FUNCTION public.fn_bspr_derived_immutable();


-- ── 7. Escalation, and the supervisor's decision ─────────────────────
--
--  "Saving ... offers escalation, and the supervisor's decision is
--   recorded."
--
--  OFFERED, not required: a reading saves without one. Where escalation
--  happens, the decision is a row — who, when, what, and why — and it is
--  append-only, because a decision that can be edited is not a decision.

CREATE TABLE IF NOT EXISTS public.inprocess_oos_escalations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  reading_id    uuid NOT NULL REFERENCES public.batch_stage_parameter_readings(id) ON DELETE RESTRICT,

  raised_by     uuid NOT NULL,
  raised_at     timestamptz NOT NULL DEFAULT now(),
  raised_note   text,

  --  Filled when the supervisor answers. Null while it is open, which is
  --  the state a screen shows as "awaiting a decision".
  decision      text,
  decision_reason text,
  decided_by    uuid,
  decided_at    timestamptz,
  signature_id  uuid REFERENCES public.electronic_signatures(id) ON DELETE RESTRICT,

  --  WEEK 6 DEVIATION LINKAGE. Item 11 is explicit that an OOS reading
  --  must NOT create a deviation automatically, so nothing here does.
  --  When a supervisor decides a deviation IS warranted, this is where
  --  that deviation's id will go; there is no foreign key yet because the
  --  table does not exist.
  deviation_id  uuid,

  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.inprocess_oos_escalations IS
  'An escalation of an out-of-specification reading to a supervisor, and the decision. Offered, never required — a reading saves without one. Append-only once decided. deviation_id is the marked Week 6 link point: item 11 forbids creating a deviation automatically, and nothing here does.';
COMMENT ON COLUMN public.inprocess_oos_escalations.deviation_id IS
  'WEEK 6 DEVIATION LINKAGE. Set by a human decision, never by this system. Item 11''s second NOT DONE IF is "an OOS reading creates a deviation automatically", so no trigger writes this.';

DO $ooe_checks$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ooe_decision_chk') THEN
    ALTER TABLE public.inprocess_oos_escalations ADD CONSTRAINT ooe_decision_chk
      CHECK (decision IS NULL OR decision IN ('accept','reject','resample','adjust','investigate'));
  END IF;

  --  A decision arrives complete: the verdict, who gave it, when, and
  --  why. Any subset of those is a decision nobody can stand behind.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ooe_decision_complete_chk') THEN
    ALTER TABLE public.inprocess_oos_escalations ADD CONSTRAINT ooe_decision_complete_chk
      CHECK (decision IS NULL
             OR (decided_by IS NOT NULL AND decided_at IS NOT NULL
                 AND btrim(coalesce(decision_reason,'')) <> ''));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ooe_decided_pair_chk') THEN
    ALTER TABLE public.inprocess_oos_escalations ADD CONSTRAINT ooe_decided_pair_chk
      CHECK ((decided_by IS NULL) = (decision IS NULL));
  END IF;

  --  One open escalation per reading. Two would mean two supervisors
  --  answering the same question, possibly differently.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ooe_reading_uniq') THEN
    ALTER TABLE public.inprocess_oos_escalations ADD CONSTRAINT ooe_reading_uniq
      UNIQUE (reading_id);
  END IF;
END
$ooe_checks$;

CREATE INDEX IF NOT EXISTS ooe_open_idx
  ON public.inprocess_oos_escalations(company_id, raised_at)
  WHERE decision IS NULL;

ALTER TABLE public.inprocess_oos_escalations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ooe_select ON public.inprocess_oos_escalations;
CREATE POLICY ooe_select ON public.inprocess_oos_escalations FOR SELECT TO authenticated
  USING (public.app_is_company_member(company_id));
DROP POLICY IF EXISTS ooe_insert ON public.inprocess_oos_escalations;
CREATE POLICY ooe_insert ON public.inprocess_oos_escalations FOR INSERT TO authenticated
  WITH CHECK (public.app_is_company_member(company_id));
DROP POLICY IF EXISTS ooe_decide ON public.inprocess_oos_escalations;
CREATE POLICY ooe_decide ON public.inprocess_oos_escalations FOR UPDATE TO authenticated
  USING (public.app_is_company_member(company_id))
  WITH CHECK (public.app_is_company_member(company_id));

REVOKE DELETE, TRUNCATE ON public.inprocess_oos_escalations FROM authenticated, anon;

--  Once a decision is recorded it is the record. Before that, the
--  escalation can still be answered — so this freezes the decision
--  rather than the row.
CREATE OR REPLACE FUNCTION public.fn_ooe_decision_final()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'OOS_ESCALATION_IMMUTABLE: an escalation cannot be deleted'
      USING ERRCODE = 'P0001';
  END IF;

  IF OLD.decision IS NOT NULL
     AND (NEW.decision        IS DISTINCT FROM OLD.decision
       OR NEW.decision_reason IS DISTINCT FROM OLD.decision_reason
       OR NEW.decided_by      IS DISTINCT FROM OLD.decided_by
       OR NEW.decided_at      IS DISTINCT FROM OLD.decided_at) THEN
    RAISE EXCEPTION
      'OOS_DECISION_FINAL: the supervisor''s decision on this reading has been recorded and cannot be changed. Raise a new escalation if the position has changed.'
      USING ERRCODE = 'P0001';
  END IF;

  --  The reading and who raised it are not editable at all.
  IF NEW.reading_id IS DISTINCT FROM OLD.reading_id
     OR NEW.raised_by IS DISTINCT FROM OLD.raised_by THEN
    RAISE EXCEPTION 'OOS_ESCALATION_IMMUTABLE: the reading and the raiser of an escalation cannot be changed'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ooe_decision_final ON public.inprocess_oos_escalations;
CREATE TRIGGER trg_ooe_decision_final
  BEFORE UPDATE OR DELETE ON public.inprocess_oos_escalations
  FOR EACH ROW EXECUTE FUNCTION public.fn_ooe_decision_final();


-- ── 8. Due prompts ───────────────────────────────────────────────────
--
--  "Due prompts." What a screen needs is the list of tests that are due
--  on this stage now, with how overdue each one is — not a boolean, so
--  the prompt can be ordered by urgency and say something more useful
--  than "a sample is due".
CREATE OR REPLACE FUNCTION public.inprocess_sampling_due(p_batch_stage_id uuid)
RETURNS TABLE (
  formula_parameter_id uuid,
  parameter            text,
  parameter_type       text,
  interval_minutes     integer,
  last_recorded_at     timestamptz,
  next_due_at          timestamptz,
  minutes_overdue      numeric,
  readings_taken       integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE s record;
BEGIN
  SELECT bs.id, bs.company_id, bs.formula_stage_id, bs.started_at, bs.status
    INTO s
    FROM public.batch_stages bs WHERE bs.id = p_batch_stage_id;

  IF s.id IS NULL THEN
    RAISE EXCEPTION 'BSPR_NO_STAGE: no such batch stage %', p_batch_stage_id USING ERRCODE='P0002';
  END IF;
  IF NOT public.app_is_service_context()
     AND NOT public.app_is_company_member(s.company_id) THEN
    RAISE EXCEPTION 'BSPR_FORBIDDEN: caller is not a member of the owning company'
      USING ERRCODE='P0001';
  END IF;

  --  A stage that has not started has nothing due: sampling is measured
  --  from when execution began, not from when the batch was created.
  IF s.started_at IS NULL OR s.status <> 'in_progress' THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH params AS (
    SELECT fp.id, fp.parameter, fp.parameter_type, fp.sampling_interval_minutes
      FROM public.master_formula_stage_parameters fp
     WHERE fp.stage_id = s.formula_stage_id
       AND fp.sampling_interval_minutes IS NOT NULL
  ), last_reading AS (
    SELECT p.id AS pid,
           max(r.recorded_at) AS last_at,
           count(r.id)::integer AS n
      FROM params p
      LEFT JOIN public.batch_stage_parameter_readings r
             ON r.batch_stage_id = p_batch_stage_id
            AND r.formula_parameter_id = p.id
     GROUP BY p.id
  )
  SELECT p.id, p.parameter, p.parameter_type, p.sampling_interval_minutes,
         lr.last_at,
         --  The first sample is due one interval after the stage started;
         --  every later one an interval after the last reading. Measuring
         --  the first from the stage start rather than from "now" is what
         --  stops a prompt appearing the instant a stage opens.
         coalesce(lr.last_at, s.started_at) + make_interval(mins => p.sampling_interval_minutes),
         round(extract(epoch FROM (
           now() - (coalesce(lr.last_at, s.started_at)
                    + make_interval(mins => p.sampling_interval_minutes))
         )) / 60.0, 2),
         lr.n
    FROM params p
    JOIN last_reading lr ON lr.pid = p.id
   WHERE now() >= coalesce(lr.last_at, s.started_at)
                  + make_interval(mins => p.sampling_interval_minutes)
   ORDER BY 7 DESC;
END;
$$;

COMMENT ON FUNCTION public.inprocess_sampling_due(uuid) IS
  'The in-process tests due on a stage now, most overdue first. The first sample falls due one interval after the stage STARTED, not after the batch was created, so a prompt does not appear the moment a stage opens. Returns nothing for a stage that is not in progress.';

REVOKE ALL ON FUNCTION public.inprocess_sampling_due(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.inprocess_sampling_due(uuid) TO authenticated, service_role;


-- ── 9. The RPCs ──────────────────────────────────────────────────────
--
--  batch_stage_record_reading gains the acknowledgement. Item 07's
--  signature cannot grow in place, so it is dropped and recreated — and
--  because the new parameter has a default, three- and four-argument
--  calls still resolve.
DROP FUNCTION IF EXISTS public.batch_stage_record_reading(uuid,uuid,numeric,text);

CREATE OR REPLACE FUNCTION public.batch_stage_record_reading(
  p_stage_id             uuid,
  p_formula_parameter_id uuid,
  p_reading_value        numeric DEFAULT NULL,
  p_reading_text         text    DEFAULT NULL,
  --  "Saving needs acknowledgement." The caller passes true to say the
  --  person entering the reading has seen the out-of-specification flag.
  --  It is only consulted when the reading IS out of specification, and
  --  passing it on an in-spec reading is harmless and ignored.
  p_oos_acknowledged     boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  c record; v_actor uuid := auth.uid(); p record; v_id uuid;
  v_in_spec boolean; v_would_be_oos boolean := false;
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

  IF p.stage_def IS DISTINCT FROM
       (SELECT formula_stage_id FROM public.batch_stages WHERE id = p_stage_id) THEN
    RAISE EXCEPTION
      'BATCH_PARAMETER_WRONG_STAGE: parameter "%" belongs to a different stage of the formula',
      p.parameter USING ERRCODE = 'P0001';
  END IF;

  --  Whether this reading is out of specification is worked out BEFORE
  --  the insert, purely so the refusal below can be a sentence naming
  --  the limits instead of a constraint name. The authority is still the
  --  trigger and the constraint; this is the courtesy.
  IF p_reading_value IS NOT NULL AND (p.min_value IS NOT NULL OR p.max_value IS NOT NULL) THEN
    v_in_spec := (p.min_value IS NULL OR p_reading_value >= p.min_value)
             AND (p.max_value IS NULL OR p_reading_value <= p.max_value);
    v_would_be_oos := NOT v_in_spec;
  END IF;

  IF v_would_be_oos AND NOT coalesce(p_oos_acknowledged, false) THEN
    --  NOT A REFUSAL OF THE MEASUREMENT. The value is fine to record;
    --  what is missing is the acknowledgement that the person saw the
    --  flag. The message says so, because an operator who reads this as
    --  "the system will not take my number" is the operator who writes
    --  it on paper instead — which is the outcome item 11's first NOT
    --  DONE IF exists to prevent.
    RAISE EXCEPTION
      'BSPR_OOS_NEEDS_ACKNOWLEDGEMENT: % % is outside the specification (% to %) for "%". The reading can be saved — acknowledge the out-of-specification flag to record it, and escalate it if a supervisor should decide.',
      p_reading_value, coalesce(p.unit,''),
      coalesce(p.min_value::text,'no minimum'), coalesce(p.max_value::text,'no maximum'),
      p.parameter
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.batch_stage_parameter_readings
    (company_id, batch_stage_id, formula_parameter_id, parameter_name, parameter_type,
     unit, target_value, min_value, max_value, reading_value, reading_text, recorded_by,
     oos_acknowledged_by, oos_acknowledged_at)
  VALUES
    (c.company_id, p_stage_id, p.id, p.parameter, p.parameter_type,
     p.unit, p.target_value, p.min_value, p.max_value,
     p_reading_value, nullif(btrim(coalesce(p_reading_text,'')),''),
     coalesce(v_actor,'00000000-0000-0000-0000-000000000000'::uuid),
     CASE WHEN v_would_be_oos THEN coalesce(v_actor,'00000000-0000-0000-0000-000000000000'::uuid) END,
     CASE WHEN v_would_be_oos THEN now() END)
  RETURNING id INTO v_id;

  RETURN (SELECT jsonb_build_object(
      'ok', true,
      'reading_id', r.id,
      'sequence_no', r.sequence_no,
      'recorded_at', r.recorded_at,
      'in_specification', r.in_specification,
      'weight_zone', r.weight_zone,
      'zone_action', r.zone_action,
      --  So a screen can say "no limits are configured for this product"
      --  rather than showing a blank zone on a weight reading.
      'zone_unclassified',
        (p.parameter_type = 'product_attribute'
         AND EXISTS (SELECT 1 FROM public.master_formula_stage_parameters
                      WHERE id = p.id AND is_weight_variation)
         AND r.weight_zone IS NULL),
      'escalation_offered', coalesce(r.in_specification, true) = false)
    FROM public.batch_stage_parameter_readings r WHERE r.id = v_id);
END;
$$;

COMMENT ON FUNCTION public.batch_stage_record_reading(uuid,uuid,numeric,text,boolean) IS
  'Records a reading, numbered in sequence and classified as it is entered. An out-of-specification value is NOT refused — it needs the acknowledgement flag, and the refusal message says so explicitly, because an operator who believes the system will not take their number writes it on paper instead. No deviation is created.';

REVOKE ALL ON FUNCTION public.batch_stage_record_reading(uuid,uuid,numeric,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.batch_stage_record_reading(uuid,uuid,numeric,text,boolean)
  TO authenticated, service_role;


--  ── inprocess_escalate_reading ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.inprocess_escalate_reading(
  p_reading_id uuid,
  p_note       text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE r record; v_actor uuid := auth.uid(); v_id uuid;
BEGIN
  SELECT id, company_id, in_specification, parameter_name, weight_zone, zone_action
    INTO r FROM public.batch_stage_parameter_readings WHERE id = p_reading_id;
  IF r.id IS NULL THEN
    RAISE EXCEPTION 'BSPR_NO_READING: no such reading %', p_reading_id USING ERRCODE='P0002';
  END IF;
  IF NOT public.app_is_service_context()
     AND NOT public.app_is_company_member(r.company_id) THEN
    RAISE EXCEPTION 'BSPR_FORBIDDEN: caller is not a member of the owning company'
      USING ERRCODE='P0001';
  END IF;

  --  An escalation of a reading that is fine, and is not in a zone that
  --  calls for action, is an escalation of nothing.
  IF coalesce(r.in_specification, true) <> false
     AND coalesce(r.zone_action,'accept') = 'accept' THEN
    RAISE EXCEPTION
      'BSPR_NOTHING_TO_ESCALATE: "%" is within specification and its zone calls for no action, so there is nothing for a supervisor to decide',
      r.parameter_name USING ERRCODE='P0001';
  END IF;

  INSERT INTO public.inprocess_oos_escalations
    (company_id, reading_id, raised_by, raised_note)
  VALUES (r.company_id, p_reading_id,
          coalesce(v_actor,'00000000-0000-0000-0000-000000000000'::uuid),
          nullif(btrim(coalesce(p_note,'')),''))
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'escalation_id', v_id);
END;
$$;

COMMENT ON FUNCTION public.inprocess_escalate_reading(uuid,text) IS
  'Raises an out-of-specification reading, or one in a zone calling for action, to a supervisor. Optional by design: the reading is already saved, and escalation is offered rather than required.';

REVOKE ALL ON FUNCTION public.inprocess_escalate_reading(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.inprocess_escalate_reading(uuid,text) TO authenticated, service_role;


--  ── inprocess_decide_escalation ─────────────────────────────────────
--  "the supervisor's decision is recorded"
CREATE OR REPLACE FUNCTION public.inprocess_decide_escalation(
  p_escalation_id uuid,
  p_decision      text,
  p_reason        text,
  p_signature_id  uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE e record; v_actor uuid := auth.uid();
BEGIN
  SELECT id, company_id, decision, raised_by INTO e
    FROM public.inprocess_oos_escalations WHERE id = p_escalation_id;
  IF e.id IS NULL THEN
    RAISE EXCEPTION 'OOS_NO_ESCALATION: no such escalation %', p_escalation_id USING ERRCODE='P0002';
  END IF;
  IF NOT public.app_is_service_context()
     AND NOT public.app_is_company_member(e.company_id) THEN
    RAISE EXCEPTION 'BSPR_FORBIDDEN: caller is not a member of the owning company'
      USING ERRCODE='P0001';
  END IF;
  IF e.decision IS NOT NULL THEN
    RAISE EXCEPTION 'OOS_DECISION_FINAL: that escalation has already been decided'
      USING ERRCODE='P0001';
  END IF;
  IF p_decision NOT IN ('accept','reject','resample','adjust','investigate') THEN
    RAISE EXCEPTION
      'OOS_BAD_DECISION: the decision must be accept, reject, resample, adjust or investigate'
      USING ERRCODE='P0001';
  END IF;
  IF coalesce(btrim(p_reason),'') = '' THEN
    RAISE EXCEPTION 'OOS_DECISION_NO_REASON: a supervisor''s decision has to say why'
      USING ERRCODE='P0001';
  END IF;

  --  THE SECOND PERSON. The point of escalating is that somebody other
  --  than the operator decides; letting the raiser answer their own
  --  escalation would make the whole path decorative.
  IF e.raised_by = coalesce(v_actor,'00000000-0000-0000-0000-000000000000'::uuid) THEN
    RAISE EXCEPTION
      'OOS_SELF_DECIDED: the person who raised the escalation cannot also decide it'
      USING ERRCODE='P0001';
  END IF;

  UPDATE public.inprocess_oos_escalations
     SET decision = p_decision,
         decision_reason = btrim(p_reason),
         decided_by = v_actor,
         decided_at = now(),
         signature_id = p_signature_id
   WHERE id = p_escalation_id;

  --  NOTHING HERE CREATES A DEVIATION, including when the decision is
  --  'investigate'. Item 11's second NOT DONE IF is explicit, and the
  --  deviation table does not exist until Week 6; deviation_id on the
  --  escalation is the marked link point for when it does.
  RETURN jsonb_build_object('ok', true, 'escalation_id', p_escalation_id,
                            'decision', p_decision, 'deviation_created', false);
END;
$$;

COMMENT ON FUNCTION public.inprocess_decide_escalation(uuid,text,text,uuid) IS
  'Records the supervisor''s decision on an escalated reading: the verdict, the reason, who and when. Refuses the person who raised it. Creates no deviation, not even for an "investigate" decision — that is item 11''s second NOT DONE IF, and Week 6 owns the link.';

REVOKE ALL ON FUNCTION public.inprocess_decide_escalation(uuid,text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.inprocess_decide_escalation(uuid,text,text,uuid)
  TO authenticated, service_role;


-- ── 10. The deploy-time guard ────────────────────────────────────────
DO $item11_guard$
DECLARE
  v_missing text[] := '{}';
  v_constraints text[] := ARRAY[
    'mfsp_sampling_chk','mfsp_weight_is_attribute_chk',
    'pwl_product_uniq','pwl_order_chk','pwl_actions_chk','pwl_unit_chk',
    'bspr_sequence_uniq','bspr_zone_chk','bspr_zone_action_chk',
    'bspr_zone_pair_chk','bspr_ack_pair_chk','bspr_oos_ack_chk',
    'ooe_decision_chk','ooe_decision_complete_chk','ooe_decided_pair_chk','ooe_reading_uniq'
  ];
  v_triggers text[] := ARRAY[
    'trg_bspr_a_assign_sequence','trg_bspr_z_classify',
    'trg_bspr_derived_immutable','trg_ooe_decision_final'
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

  --  Item 07's evaluate trigger must still be there: the acknowledgement
  --  constraint reads in_specification, and without that trigger it would
  --  be NULL and the constraint would pass on everything.
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_bspr_evaluate' AND NOT tgisinternal) THEN
    v_missing := v_missing || 'trigger trg_bspr_evaluate (item 07, which sets in_specification)';
  END IF;

  --  And the old four-argument reading RPC must be gone, or a caller
  --  could keep using it and never acknowledge anything.
  IF to_regprocedure('public.batch_stage_record_reading(uuid,uuid,numeric,text)') IS NOT NULL THEN
    v_missing := v_missing || 'removal of the old unacknowledged batch_stage_record_reading overload';
  END IF;

  --  THE NOT-BUILT CHECK. If a deviations table ever appears, this guard
  --  is where somebody will notice that item 11 promised not to write to
  --  it automatically. Left as a comment rather than a check, because
  --  there is nothing to check yet and a check that always passes is a
  --  check nobody maintains.

  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION
      'ITEM11_CONTROLS_MISSING: this migration applied but the following controls are not present: %.',
      array_to_string(v_missing, ', ') USING ERRCODE = 'P0001';
  END IF;
END
$item11_guard$;
