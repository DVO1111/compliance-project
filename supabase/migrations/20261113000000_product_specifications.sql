-- Finished-product specifications, and a release gate that reads them.
--
-- ── THE DECISION THIS IMPLEMENTS ──
--
-- docs/figma-conflicts.md entry 12 recorded that nothing in this schema
-- says which tests a product requires, so a batch with no results was
-- indistinguishable from a product that needs none. 20261107000000
-- refused both, because only one of the two readings is survivable, and
-- asked for a decision.
--
-- The decision taken: require an approved, versioned specification with
-- applicable acceptance criteria and required QC tests before a batch
-- may be released; where none exists, FAIL CLOSED with an explanation
-- that says what is missing; invent no criteria and provide no silent
-- bypass.
--
-- ── MODELLED ON material_specifications, NOT INVENTED ──
--
-- The schema already has this shape for incoming material:
-- material_specifications (versioned, status draft/effective/
-- superseded/withdrawn, effective_date) with
-- material_specification_parameters (limit_type range/min/max/
-- exact_text/complies/absent, min_value, max_value, expected_text,
-- is_critical). Finished product gets the same shape, with the same
-- limit vocabulary, plus the one thing the material side does not need:
-- `is_required`, which is what the release gate counts.
--
-- Copying the vocabulary matters beyond tidiness. An analyst reading a
-- finished-product limit should not have to learn a second way of
-- writing "98.0 to 102.0 %" because it is a tablet rather than a
-- powder.
--
-- ── WHO APPROVES ONE IS NOT SETTLED BY PM-03 ──
--
-- PM-03 has eleven columns and none of them is "specifications", and
-- its step table names five steps, none of which is approving one. So
-- this file does NOT invent a role for it. It uses the mechanism this
-- schema already uses to approve a master formula and to release a
-- material lot: material_is_qa_authority(), the designated QA
-- authority register.
--
-- That is following an existing convention rather than writing a new
-- rule, and it is recorded in docs/figma-conflicts.md as needing
-- confirmation. If the answer is a PM-03 role, this is one predicate
-- to change.
--
-- ── WHICH VERSION A BATCH IS JUDGED AGAINST ──
--
-- The specification in force WHEN THE BATCH WAS MADE: the most recent
-- effective version whose effective_date is on or before the batch's
-- manufacturing_date. Not the current one, because a specification
-- tightened after a batch was manufactured would retrospectively fail
-- material that met the standard it was made to — and not the one
-- current at release, for the same reason.
--
-- This is a quality judgement with a regulatory flavour and it is
-- flagged for confirmation rather than presented as settled.


-- ── 1. The specification ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.product_specifications (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id     uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  version        text NOT NULL CHECK (btrim(version) <> ''),
  reference      text,
  status         text NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft', 'effective', 'superseded', 'withdrawn')),
  effective_date date,
  superseded_at  timestamptz,
  approved_by    uuid,
  approved_at    timestamptz,
  created_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, version),
  --  An effective specification has been approved and has a date it
  --  came into force. Without both it cannot be the one a batch is
  --  judged against, and a status that says otherwise is a lie the
  --  gate would believe.
  CONSTRAINT product_spec_effective_is_complete CHECK (
    status <> 'effective'
    OR (approved_at IS NOT NULL AND approved_by IS NOT NULL AND effective_date IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS product_specifications_product_idx
  ON public.product_specifications (product_id, status, effective_date DESC);

COMMENT ON TABLE public.product_specifications IS
  'Finished-product specifications. A batch is judged against the version in force on its manufacturing date; see 20261113000000.';


-- ── 2. The tests it requires ────────────────────────────────────────
--
-- The limit vocabulary is material_specification_parameters', verbatim,
-- for the reason in the header.

CREATE TABLE IF NOT EXISTS public.product_specification_tests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  specification_id uuid NOT NULL REFERENCES public.product_specifications(id) ON DELETE CASCADE,
  test_name        text NOT NULL CHECK (btrim(test_name) <> ''),
  test_method      text,
  unit             text,
  limit_type       text NOT NULL
                     CHECK (limit_type IN ('range','min','max','exact_text','complies','absent')),
  min_value        numeric,
  max_value        numeric,
  expected_text    text,
  --  WHAT THE RELEASE GATE COUNTS. A test that is not required is
  --  still recorded and still judged if a result exists for it; it
  --  just does not hold the batch.
  is_required      boolean NOT NULL DEFAULT true,
  is_critical      boolean NOT NULL DEFAULT false,
  sort_order       integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (specification_id, test_name),
  CONSTRAINT product_spec_test_limits CHECK (
    CASE limit_type
      WHEN 'range'      THEN min_value IS NOT NULL AND max_value IS NOT NULL AND min_value <= max_value
      WHEN 'min'        THEN min_value IS NOT NULL
      WHEN 'max'        THEN max_value IS NOT NULL
      WHEN 'exact_text' THEN expected_text IS NOT NULL AND btrim(expected_text) <> ''
      ELSE true
    END
  )
);

CREATE INDEX IF NOT EXISTS product_specification_tests_spec_idx
  ON public.product_specification_tests (specification_id, sort_order);


-- ── 3. A specification is frozen once it is effective ───────────────
--
-- master_formula_approve() freezes a formula's children on approval,
-- for the obvious reason: a batch judged against version 2.0 has to be
-- judged against what 2.0 said. Specifications get the same treatment.

CREATE OR REPLACE FUNCTION public.fn_product_spec_tests_frozen()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp
AS $$
DECLARE v_status text; v_spec uuid;
BEGIN
  v_spec := coalesce(NEW.specification_id, OLD.specification_id);
  SELECT status INTO v_status FROM public.product_specifications WHERE id = v_spec;
  IF v_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION
      'PRODUCT_SPEC_FROZEN: specification is %, so its tests cannot be %. Supersede it with a new version.',
      coalesce(v_status, 'missing'), lower(TG_OP)
      USING ERRCODE = 'P0001';
  END IF;
  RETURN coalesce(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_product_spec_tests_frozen ON public.product_specification_tests;
CREATE TRIGGER trg_product_spec_tests_frozen
  BEFORE INSERT OR UPDATE OR DELETE ON public.product_specification_tests
  FOR EACH ROW EXECUTE FUNCTION public.fn_product_spec_tests_frozen();

--  And the specification's own identity cannot be rewritten once it is
--  in force. Status may advance; what it says may not change.
CREATE OR REPLACE FUNCTION public.fn_product_spec_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.status = 'draft' THEN RETURN NEW; END IF;
  IF NEW.product_id IS DISTINCT FROM OLD.product_id
     OR NEW.version IS DISTINCT FROM OLD.version
     OR NEW.effective_date IS DISTINCT FROM OLD.effective_date
     OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
     OR NEW.approved_at IS DISTINCT FROM OLD.approved_at THEN
    RAISE EXCEPTION
      'PRODUCT_SPEC_IMMUTABLE: an approved specification cannot be rewritten; supersede it with a new version'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_spec_immutable ON public.product_specifications;
CREATE TRIGGER trg_product_spec_immutable
  BEFORE UPDATE ON public.product_specifications
  FOR EACH ROW EXECUTE FUNCTION public.fn_product_spec_immutable();


-- ── 4. Approving one ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.product_specification_approve(
  p_specification_id uuid,
  p_effective_date   date DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_spec record; v_actor uuid := auth.uid(); v_tests bigint; v_required bigint;
BEGIN
  SELECT * INTO v_spec FROM public.product_specifications WHERE id = p_specification_id;
  IF v_spec.id IS NULL THEN
    RAISE EXCEPTION 'PRODUCT_SPEC_NOT_FOUND: no such specification' USING ERRCODE = 'P0002';
  END IF;
  IF v_spec.status <> 'draft' THEN
    RAISE EXCEPTION 'PRODUCT_SPEC_NOT_DRAFT: specification % is already %',
      v_spec.version, v_spec.status USING ERRCODE = 'P0001';
  END IF;

  --  SEE THE HEADER: this is the designated QA authority register, the
  --  mechanism that already approves a master formula and releases a
  --  material lot, not a role invented for this table.
  IF NOT public.app_is_service_context() THEN
    IF v_actor IS NULL OR NOT public.material_is_qa_authority(v_spec.company_id, v_actor) THEN
      RAISE EXCEPTION
        'PRODUCT_SPEC_FORBIDDEN: approving a finished-product specification requires a designated QA authority'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  SELECT count(*), count(*) FILTER (WHERE is_required)
    INTO v_tests, v_required
    FROM public.product_specification_tests WHERE specification_id = p_specification_id;

  IF v_tests = 0 THEN
    RAISE EXCEPTION
      'PRODUCT_SPEC_NO_TESTS: specification % declares no tests, so it states no acceptance criteria',
      v_spec.version USING ERRCODE = 'P0001';
  END IF;

  --  A specification with tests but none of them required would
  --  approve a batch on nothing. Refused here rather than at release,
  --  so the gap is found when the document is written and not when a
  --  batch is waiting.
  IF v_required = 0 THEN
    RAISE EXCEPTION
      'PRODUCT_SPEC_NOTHING_REQUIRED: specification % marks no test as required, so no batch could be judged against it',
      v_spec.version USING ERRCODE = 'P0001';
  END IF;

  --  Supersede the version this one replaces, so two are never in
  --  force on the same date.
  UPDATE public.product_specifications
     SET status = 'superseded', superseded_at = now()
   WHERE product_id = v_spec.product_id
     AND status = 'effective'
     AND id <> p_specification_id;

  UPDATE public.product_specifications
     SET status = 'effective',
         approved_by = coalesce(v_actor, created_by),
         approved_at = now(),
         effective_date = coalesce(p_effective_date, current_date),
         updated_at = now()
   WHERE id = p_specification_id;

  RETURN jsonb_build_object(
    'ok', true, 'specification_id', p_specification_id,
    'version', v_spec.version, 'required_tests', v_required);
END;
$$;

REVOKE ALL ON FUNCTION public.product_specification_approve(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.product_specification_approve(uuid, date) TO authenticated, service_role;


-- ── 5. Which specification governs a batch ──────────────────────────

CREATE OR REPLACE FUNCTION public.batch_governing_specification(p_batch_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT s.id
    FROM public.batch_records b
    JOIN public.product_specifications s ON s.product_id = b.product_id
   WHERE b.id = p_batch_id
     --  SUPERSEDED COUNTS, AND THAT IS THE WHOLE POINT. A version is
     --  superseded going FORWARD; it still governed every batch made
     --  while it was in force, and judging those against a later,
     --  tighter version would retrospectively fail material that met
     --  the standard it was made to.
     --
     --  The first version of this function filtered on
     --  status = 'effective' and the suite caught it: a batch made
     --  under 1.0 found no specification at all the moment 2.0 was
     --  approved, and fell to "no approved specification was in
     --  force" — a refusal that was both wrong and unactionable.
     --
     --  'withdrawn' is excluded: a withdrawn specification has been
     --  retracted rather than replaced, and nothing should be judged
     --  against it.
     AND s.status IN ('effective', 'superseded')
     AND s.approved_at IS NOT NULL
     AND s.effective_date IS NOT NULL
     AND s.effective_date <= b.manufacturing_date
   ORDER BY s.effective_date DESC, s.approved_at DESC
   LIMIT 1;
$$;

COMMENT ON FUNCTION public.batch_governing_specification(uuid) IS
  'The finished-product specification in force on the batch''s manufacturing date. NULL when the batch has no product, or no approved specification applies.';

REVOKE ALL ON FUNCTION public.batch_governing_specification(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.batch_governing_specification(uuid) TO authenticated, service_role;


-- ── 6. Does a result meet its criterion ─────────────────────────────
--
-- Returns NULL when the criterion cannot be applied to this result —
-- a non-numeric reading against a numeric limit, say — rather than a
-- verdict it cannot support. The caller treats NULL as "not judged
-- here", never as a pass.

CREATE OR REPLACE FUNCTION public.product_test_meets_criterion(
  p_limit_type text, p_min numeric, p_max numeric, p_expected text, p_result text
) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE v_num numeric;
BEGIN
  IF p_result IS NULL THEN RETURN NULL; END IF;

  IF p_limit_type IN ('range', 'min', 'max') THEN
    --  Pull the first number out of "99.4 %", "99.4", " 99.4 mg".
    --
    --  THE GROUP IS NON-CAPTURING ON PURPOSE. regexp_match returns the
    --  capture groups when there are any, so '-?[0-9]+(\.[0-9]+)?'
    --  yields ".4" for "99.4 %" rather than "99.4" — and ".4" is
    --  inside a 98-102 range, so every out-of-specification decimal
    --  would have read as a pass. The self-test at the foot of this
    --  file caught it.
    BEGIN
      v_num := (regexp_match(p_result, '-?[0-9]+(?:\.[0-9]+)?'))[1]::numeric;
    EXCEPTION WHEN OTHERS THEN RETURN NULL;
    END;
    IF v_num IS NULL THEN RETURN NULL; END IF;
    IF p_limit_type = 'range' THEN RETURN v_num >= p_min AND v_num <= p_max; END IF;
    IF p_limit_type = 'min'   THEN RETURN v_num >= p_min; END IF;
    RETURN v_num <= p_max;
  END IF;

  IF p_limit_type = 'exact_text' THEN
    RETURN lower(btrim(p_result)) = lower(btrim(p_expected));
  END IF;

  --  'complies' and 'absent' are judgements a person makes; the
  --  recorded verdict is the only evidence and this function has
  --  nothing to add.
  RETURN NULL;
END;
$$;


-- ── 7. The release gate ─────────────────────────────────────────────
--
-- Replaces the body from 20261112000000. Signature, return and callers
-- unchanged.
--
-- The order of the refusals is the order somebody can act on them:
-- no product, then no specification, then the tests it requires, then
-- the verdicts, then a verdict that disagrees with the criterion it
-- was judged against.

CREATE OR REPLACE FUNCTION public.batch_release_block_reason(p_batch_id uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_batch   record;
  v_spec    uuid;
  v_version text;
  v_missing text;
  v_failed  bigint;
  v_contra  text;
BEGIN
  SELECT id, batch_number, product_id, manufacturing_date INTO v_batch
    FROM public.batch_records WHERE id = p_batch_id;
  IF v_batch.id IS NULL THEN RETURN 'no such batch record'; END IF;

  IF v_batch.product_id IS NULL THEN
    RETURN 'this batch names no product, so no finished-product specification '
        || 'applies to it and there is nothing to release it against';
  END IF;

  v_spec := public.batch_governing_specification(p_batch_id);
  IF v_spec IS NULL THEN
    RETURN format(
      'no approved finished-product specification was in force on %s, the date this '
      || 'batch was manufactured. Approve a specification for this product with an '
      || 'effective date on or before then.',
      to_char(v_batch.manufacturing_date, 'DD Mon YYYY'));
  END IF;

  SELECT version INTO v_version FROM public.product_specifications WHERE id = v_spec;

  --  A standing result is one nothing has superseded (20261112000000).
  --  Required tests with no standing result at all.
  SELECT string_agg(t.test_name, ', ' ORDER BY t.sort_order, t.test_name)
    INTO v_missing
    FROM public.product_specification_tests t
   WHERE t.specification_id = v_spec
     AND t.is_required
     AND NOT EXISTS (
       SELECT 1 FROM public.batch_qc_results r
        WHERE r.batch_id = p_batch_id
          AND lower(btrim(r.test_name)) = lower(btrim(t.test_name))
          AND NOT EXISTS (SELECT 1 FROM public.batch_qc_results c
                           WHERE c.corrected_from_id = r.id));

  IF v_missing IS NOT NULL THEN
    RETURN format('specification %s requires %s, and no result has been recorded.',
                  v_version, v_missing);
  END IF;

  --  Any standing failure, required or not. A test somebody chose to
  --  run and which failed is an investigation whether the
  --  specification demanded it or not.
  SELECT count(*) INTO v_failed
    FROM public.batch_qc_results r
   WHERE r.batch_id = p_batch_id AND r.pass IS FALSE
     AND NOT EXISTS (SELECT 1 FROM public.batch_qc_results c
                      WHERE c.corrected_from_id = r.id);

  IF v_failed > 0 THEN
    RETURN format('%s finished-product test%s failed. A failed test is an '
               || 'investigation, not a release.',
                  v_failed, CASE WHEN v_failed = 1 THEN '' ELSE 's' END);
  END IF;

  --  A PASS THAT THE CRITERION DOES NOT SUPPORT. The verdict is typed
  --  by a person; the limits come from the approved specification.
  --  Where the two can be compared and disagree, the specification
  --  wins and the batch waits.
  SELECT string_agg(format('%s recorded %s against %s',
                           t.test_name, r.result,
                           CASE t.limit_type
                             WHEN 'range' THEN format('%s to %s', t.min_value, t.max_value)
                             WHEN 'min'   THEN format('at least %s', t.min_value)
                             WHEN 'max'   THEN format('at most %s', t.max_value)
                             ELSE coalesce(t.expected_text, t.limit_type)
                           END), '; ')
    INTO v_contra
    FROM public.product_specification_tests t
    JOIN public.batch_qc_results r
      ON lower(btrim(r.test_name)) = lower(btrim(t.test_name))
     AND r.batch_id = p_batch_id
   WHERE t.specification_id = v_spec
     AND r.pass IS TRUE
     AND NOT EXISTS (SELECT 1 FROM public.batch_qc_results c
                      WHERE c.corrected_from_id = r.id)
     AND public.product_test_meets_criterion(
           t.limit_type, t.min_value, t.max_value, t.expected_text, r.result) IS FALSE;

  IF v_contra IS NOT NULL THEN
    RETURN format('a result was recorded as a pass but does not meet specification %s: %s.',
                  v_version, v_contra);
  END IF;

  RETURN NULL;
END;
$$;


CREATE OR REPLACE FUNCTION public.batch_release_conditions(p_batch_id uuid)
RETURNS TABLE(condition_key text, severity text, title text, detail text,
              continue_with text, sort_order integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_reason text; v_spec uuid; v_product uuid;
BEGIN
  v_reason := public.batch_release_block_reason(p_batch_id);
  IF v_reason IS NULL THEN RETURN; END IF;

  SELECT product_id INTO v_product FROM public.batch_records WHERE id = p_batch_id;
  v_spec := public.batch_governing_specification(p_batch_id);

  --  ONE ROW, FROM THE ONE SENTENCE. The two used to be computed
  --  separately and could disagree about what was wrong; the key is
  --  derived from the same answer so a screen and a refusal cannot
  --  drift.
  RETURN QUERY SELECT
    CASE
      WHEN v_product IS NULL THEN 'no_product'
      WHEN v_spec IS NULL    THEN 'no_specification'
      WHEN v_reason LIKE '%no result has been recorded%' THEN 'qc_missing'
      WHEN v_reason LIKE '%failed%'                      THEN 'qc_failed'
      WHEN v_reason LIKE '%does not meet specification%'  THEN 'qc_contradicts_spec'
      ELSE 'release_blocked'
    END::text,
    'blocked'::text,
    CASE
      WHEN v_product IS NULL THEN 'This batch names no product'
      WHEN v_spec IS NULL    THEN 'No approved specification applies'
      WHEN v_reason LIKE '%no result has been recorded%' THEN 'Required tests have no results'
      WHEN v_reason LIKE '%failed%'                      THEN 'A finished-product test failed'
      WHEN v_reason LIKE '%does not meet specification%'  THEN 'A pass does not meet the specification'
      ELSE 'This batch cannot be released'
    END::text,
    v_reason::text,
    NULL::text, 10;
END;
$$;


-- ── 8. Reading a specification from a screen ────────────────────────

ALTER TABLE public.product_specifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_specification_tests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS product_specifications_select ON public.product_specifications;
CREATE POLICY product_specifications_select ON public.product_specifications
  FOR SELECT TO authenticated USING (public.app_is_company_member(company_id));

DROP POLICY IF EXISTS product_specifications_write ON public.product_specifications;
CREATE POLICY product_specifications_write ON public.product_specifications
  FOR ALL TO authenticated
  USING (public.app_is_company_member(company_id))
  WITH CHECK (public.app_is_company_member(company_id));

DROP POLICY IF EXISTS product_specification_tests_select ON public.product_specification_tests;
CREATE POLICY product_specification_tests_select ON public.product_specification_tests
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.product_specifications s
                  WHERE s.id = specification_id
                    AND public.app_is_company_member(s.company_id)));

--  Drafting is open to members and FREEZING is the control, not the
--  policy: a draft is a document somebody is writing, and approval is
--  where authority is checked. The freeze trigger refuses every change
--  once it is effective, for everybody.
DROP POLICY IF EXISTS product_specification_tests_write ON public.product_specification_tests;
CREATE POLICY product_specification_tests_write ON public.product_specification_tests
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.product_specifications s
                  WHERE s.id = specification_id
                    AND public.app_is_company_member(s.company_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.product_specifications s
                       WHERE s.id = specification_id
                         AND public.app_is_company_member(s.company_id)));


-- ── 9. What this file assumes ───────────────────────────────────────

DO $assert$
BEGIN
  IF to_regprocedure('public.material_is_qa_authority(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION
      'PRODUCT_SPEC_NO_AUTHORITY_FN: material_is_qa_authority is missing, so nothing can approve a specification';
  END IF;

  --  The gate reads corrected_from_id. If 20261112000000 has not been
  --  applied, every superseded result would count again and a
  --  corrected failure would block forever.
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='batch_qc_results'
                    AND column_name='corrected_from_id') THEN
    RAISE EXCEPTION
      'PRODUCT_SPEC_WRONG_ORDER: batch_qc_results has no corrected_from_id; apply 20261112000000 first';
  END IF;

  --  A criterion function that cannot judge its own examples would
  --  pass everything silently.
  IF public.product_test_meets_criterion('range', 98, 102, NULL, '99.4 %') IS NOT TRUE
     OR public.product_test_meets_criterion('range', 98, 102, NULL, '88.1 %') IS NOT FALSE
     OR public.product_test_meets_criterion('max', NULL, 2.0, NULL, '2.4') IS NOT FALSE
     OR public.product_test_meets_criterion('min', 95, NULL, NULL, '96') IS NOT TRUE
     OR public.product_test_meets_criterion('exact_text', NULL, NULL, 'Complies', 'complies') IS NOT TRUE
     OR public.product_test_meets_criterion('range', 98, 102, NULL, 'white powder') IS NOT NULL
     OR public.product_test_meets_criterion('complies', NULL, NULL, NULL, 'yes') IS NOT NULL
  THEN
    RAISE EXCEPTION 'PRODUCT_SPEC_CRITERION_BROKEN: product_test_meets_criterion does not judge its own examples';
  END IF;
END;
$assert$;
