-- Finished QC and batch release, as two workflows rather than one.
--
-- ── WHAT WAS ACTUALLY TRUE BEFORE THIS FILE ──
--
-- A material lot cannot reach `approved` without passing through
-- fn_material_lots_release_gate, which calls
-- material_lot_release_block_reason() and refuses on a sentence. A
-- batch record had no equivalent. Its only guards were:
--
--   trg_batch_release_role        who may release          (PM-03)
--   trg_batch_records_licence_gate   the licence is current
--   the product eligibility gate     the product is registered
--   the lifecycle path            qc_in_progress -> released
--
-- Every one of those is about the PRODUCT or the PERSON. Not one of
-- them looks at whether the batch passed its finished-product tests.
--
-- So a QA Manager could release a batch on which:
--   * no finished QC result had ever been recorded, or
--   * a recorded result had pass = false, or
--   * a recorded result had no verdict at all.
--
-- The lifecycle path forced the batch through `qc_in_progress`, which
-- is a STATE somebody moved it into — not evidence that any testing
-- happened. Reaching the QC state and passing QC are different facts,
-- and the schema only had the first.
--
-- ── THE SIGNATURE PM-03 ASKS FOR AND NOBODY TOOK ──
--
-- PM-03's step table says "Release a batch — QA Manager — E-signature",
-- and 20261104000000 recorded that as step_permissions.needs =
-- 'signature'. Nothing read that column. The lifecycle engine has its
-- own mechanism — lifecycle_transitions.requires_signature, which
-- lifecycle_transition() enforces by consuming a signature bound to
-- this caller, this record and this action — and for batch_record
-- 'release' it was false (20261011000000, line 142).
--
-- Setting it true is the whole of the fix. A rule recorded in one
-- table and enforced from another is how a requirement gets lost.
--
-- REJECTION IS NOT CHANGED. PM-03 has a row for releasing a batch and
-- none for rejecting one. fn_batch_release_role already covers both
-- states for the role question; whether a rejection needs its own
-- signature is a question for the design and is registered rather than
-- guessed. See docs/figma-conflicts.md.
--
-- ── FINISHED QC IS A DIFFERENT SECTION FROM BATCH RELEASE ──
--
-- PM-03's `QC testing` column gives Act to the QC Analyst alone. Its
-- `Batch release` column gives Act to the QA Officer and QA Manager.
-- They are different columns with different holders, and recording a
-- finished-product result now meets the first while releasing meets
-- the second. Nobody holds both.
--
-- That is what "do not equate QC completion with batch-release
-- authorisation" means in this schema: completing QC is a QC Analyst's
-- act, and it does not authorise anything. It removes an objection.


-- ── 1. The signature PM-03 asks for ─────────────────────────────────

UPDATE public.lifecycle_transitions t
   SET requires_signature = true
  FROM public.lifecycle_definitions d, public.lifecycle_states f, public.lifecycle_states s
 WHERE t.definition_id = d.id
   AND d.entity_type = 'batch_record'
   AND f.id = t.from_state_id AND f.state_key = 'qc_in_progress'
   AND s.id = t.to_state_id   AND s.state_key = 'released'
   AND t.action_key = 'release';


-- ── 2. Why a batch may not be released ──────────────────────────────
--
-- ONE FUNCTION, TWO CALLERS, which is the arrangement
-- material_lot_release_block_reason established and the reason a
-- screen and a gate cannot drift apart: the notice a person reads and
-- the refusal they hit are the same sentence from the same query.
--
-- IT IS ABOUT THE RECORD, NOT THE CALLER. Who may release is
-- fn_batch_release_role's question and the separation-of-duties check
-- in section 4's. Mixing them in here was a mistake material_chain_test
-- caught on the material side: a block reason that knew about the
-- caller could not be shown on a screen to somebody merely looking.

CREATE OR REPLACE FUNCTION public.batch_release_block_reason(p_batch_id uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_batch   record;
  v_total   bigint;
  v_failed  bigint;
BEGIN
  SELECT id, batch_number
    INTO v_batch
    FROM public.batch_records WHERE id = p_batch_id;
  IF v_batch.id IS NULL THEN
    RETURN 'no such batch record';
  END IF;

  --  NO execution_closed_at CHECK HERE, and the omission is deliberate.
  --
  --  The column and the lifecycle state are set by DIFFERENT PATHS.
  --  batch_record_close() stamps the column and transitions; a bare
  --  lifecycle_transition(..., 'close_execution') moves the state and
  --  leaves the column null. So a batch can legitimately sit in
  --  qc_in_progress with execution_closed_at still null, and blocking
  --  on the column would refuse a batch that followed a path the
  --  lifecycle engine itself permits.
  --
  --  The ordering is already enforced where it belongs: `release` is
  --  only a valid action from qc_in_progress, which is only reachable
  --  through execution_complete and qc_pending. A column check here
  --  would add no guarantee and one false refusal.
  --
  --  That the two can disagree is itself worth knowing, and is
  --  recorded in docs/figma-conflicts.md rather than papered over.

  --  NO "UNRESOLVED RESULT" BRANCH, and its absence is checked below
  --  rather than assumed. batch_qc_results.pass is NOT NULL, so a
  --  recorded result always carries a verdict and a branch on
  --  `pass IS NULL` could never fire. 20261105000000 exists because a
  --  guard named a state that did not exist, was installed, attached,
  --  and silently never ran; writing one here on purpose would be the
  --  same mistake with the excuse of thoroughness.
  --
  --  What that means for the product is in docs/figma-conflicts.md:
  --  this schema cannot record a finished-product test that is under
  --  way or inconclusive. `qc_in_progress` is a batch state with no
  --  test-level counterpart.
  SELECT count(*), count(*) FILTER (WHERE pass IS FALSE)
    INTO v_total, v_failed
    FROM public.batch_qc_results WHERE batch_id = p_batch_id;

  IF v_failed > 0 THEN
    RETURN format('%s finished-product test%s failed. A failed test is an '
               || 'investigation, not a release.',
                  v_failed, CASE WHEN v_failed = 1 THEN '' ELSE 's' END);
  END IF;

  --  SEE THE HEADER AND docs/figma-conflicts.md. There is no
  --  finished-product specification anywhere in this schema — no table
  --  says which tests a product requires — so an empty result set
  --  cannot be told apart from "this product requires none".
  --
  --  Refused, because the two readings have opposite consequences and
  --  only one of them is survivable: releasing a batch nobody tested is
  --  the failure a quality system exists to prevent, and holding a
  --  batch whose product genuinely requires no testing costs an entry
  --  in this table. The rule is named so it can be lifted deliberately
  --  once a specification exists, rather than discovered later as an
  --  unexplained refusal.
  IF v_total = 0 THEN
    RETURN 'no finished-product test results have been recorded. This schema '
        || 'holds no finished-product specification, so it cannot tell "none '
        || 'required" from "none done".';
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.batch_release_block_reason(uuid) IS
  'Why this batch may not be released, as a sentence, or NULL. About the record only — who may release is fn_batch_release_role''s question.';

REVOKE ALL ON FUNCTION public.batch_release_block_reason(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.batch_release_block_reason(uuid) TO authenticated, service_role;


-- ── 3. The same answer, as rows a screen can draw ───────────────────
--
-- Shaped like dispensing_conditions and line_clearance_conditions so
-- FloorNotice renders it without a third shape. Severity comes from
-- the database; the screens render it and do not classify.

CREATE OR REPLACE FUNCTION public.batch_release_conditions(p_batch_id uuid)
RETURNS TABLE(condition_key text, severity text, title text, detail text,
              continue_with text, sort_order integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_total   bigint;
  v_failed  bigint;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE pass IS FALSE)
    INTO v_total, v_failed
    FROM public.batch_qc_results WHERE batch_id = p_batch_id;

  IF v_failed > 0 THEN
    RETURN QUERY SELECT 'qc_failed'::text, 'blocked'::text,
      format('%s finished-product test%s failed',
             v_failed, CASE WHEN v_failed = 1 THEN '' ELSE 's' END)::text,
      'A failed test opens an investigation. It is not something a release decision overrides.'::text,
      NULL::text, 20;
  END IF;

  IF v_total = 0 THEN
    RETURN QUERY SELECT 'qc_none'::text, 'blocked'::text,
      'No finished-product tests recorded'::text,
      ('Nothing has been tested on this batch. This system holds no finished-product '
       || 'specification, so it cannot tell a product that requires no testing from a '
       || 'batch that was never tested, and will not release either.')::text,
      NULL::text, 40;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.batch_release_conditions(uuid) IS
  'The release objections on a batch, as rows for a screen. Derived from the same facts as batch_release_block_reason so the notice and the refusal agree.';

REVOKE ALL ON FUNCTION public.batch_release_conditions(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.batch_release_conditions(uuid) TO authenticated, service_role;


-- ── 4. The gate ─────────────────────────────────────────────────────
--
-- On entity_current_state beside the role guard, so it applies to any
-- route into `released` rather than only to one RPC — and so a direct
-- PostgREST call meets it too.
--
-- SEPARATION OF DUTIES IS CHECKED HERE AND NOT IN block_reason,
-- because it is about the CALLER. The schema already refuses a
-- verifier who is the operator (batch_stage_verify) and a dispensing
-- verifier who is the dispenser (material_dispense_verify); releasing a
-- batch on the strength of results you recorded yourself is the same
-- shape of question, and this is the same answer.
--
-- Service contexts are exempt from the duties check only, for the
-- reason fn_material_lots_release_gate gives: the scheduler and
-- migrations have no JWT and are not people. The BLOCK REASON applies
-- to them too — a seed that releases an untested batch is still
-- releasing an untested batch.

CREATE OR REPLACE FUNCTION public.fn_batch_records_release_gate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_to text; v_from text; v_reason text; v_actor uuid := auth.uid();
BEGIN
  IF NEW.entity_type <> 'batch_record' THEN RETURN NEW; END IF;

  SELECT state_key INTO v_to FROM public.lifecycle_states WHERE id = NEW.state_id;
  IF v_to <> 'released' THEN RETURN NEW; END IF;

  IF TG_OP = 'UPDATE' THEN
    SELECT state_key INTO v_from FROM public.lifecycle_states WHERE id = OLD.state_id;
    --  Not a new decision.
    IF v_from = 'released' THEN RETURN NEW; END IF;
  END IF;

  v_reason := public.batch_release_block_reason(NEW.entity_id);
  IF v_reason IS NOT NULL THEN
    RAISE EXCEPTION 'BATCH_RELEASE_BLOCKED: %', v_reason USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.app_is_service_context() AND v_actor IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.batch_qc_results
                WHERE batch_id = NEW.entity_id AND tested_by = v_actor) THEN
      RAISE EXCEPTION
        'BATCH_RELEASE_SELF_TESTED: you recorded finished-product results on this '
        'batch, so somebody else has to make the release decision'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_batch_records_release_gate ON public.entity_current_state;
CREATE TRIGGER trg_batch_records_release_gate
  BEFORE INSERT OR UPDATE ON public.entity_current_state
  FOR EACH ROW EXECUTE FUNCTION public.fn_batch_records_release_gate();


-- ── 5. Who may record a finished-product result ─────────────────────
--
-- PM-03's `QC testing` column: Act for the QC Analyst alone.
--
-- batch_qc_results has no company_id, so the guard reads it from the
-- batch. Adding the column would be the tidier schema and a riskier
-- migration against a live table; the join is the same answer.

CREATE OR REPLACE FUNCTION public.fn_batch_qc_results_section_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_company uuid;
BEGIN
  SELECT company_id INTO v_company FROM public.batch_records WHERE id = NEW.batch_id;
  IF v_company IS NULL THEN RETURN NEW; END IF;
  PERFORM public.app_assert_section_act(v_company, 'qc_testing');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_batch_qc_results_section_role ON public.batch_qc_results;
CREATE TRIGGER trg_batch_qc_results_section_role
  BEFORE INSERT OR UPDATE ON public.batch_qc_results
  FOR EACH ROW EXECUTE FUNCTION public.fn_batch_qc_results_section_role();


-- ── 6. What this file assumes, asserted ─────────────────────────────
--
-- 20261105000000 exists because a guard named a lifecycle state that
-- did not exist and therefore never fired. Everything this file names
-- is checked here, at apply time.

DO $assert$
DECLARE v_sig boolean; v_cols bigint;
BEGIN
  --  The transition the signature was set on must exist, or section 1
  --  updated nothing and PM-03's e-signature is still unenforced.
  SELECT t.requires_signature INTO v_sig
    FROM public.lifecycle_transitions t
    JOIN public.lifecycle_definitions d ON d.id = t.definition_id
    JOIN public.lifecycle_states f ON f.id = t.from_state_id
    JOIN public.lifecycle_states s ON s.id = t.to_state_id
   WHERE d.entity_type = 'batch_record'
     AND f.state_key = 'qc_in_progress' AND s.state_key = 'released'
     AND t.action_key = 'release';

  IF v_sig IS NULL THEN
    RAISE EXCEPTION
      'BATCH_RELEASE_TRANSITION_MISSING: no qc_in_progress -> released transition to require a signature on';
  END IF;
  IF NOT v_sig THEN
    RAISE EXCEPTION
      'BATCH_RELEASE_SIGNATURE_NOT_SET: the release transition still does not require a signature';
  END IF;

  --  The columns the block reason reads.
  SELECT count(*) INTO v_cols FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'batch_qc_results'
     AND column_name IN ('batch_id', 'pass', 'tested_by');
  IF v_cols <> 3 THEN
    RAISE EXCEPTION
      'BATCH_QC_SHAPE_CHANGED: batch_qc_results is missing one of batch_id, pass, tested_by (found %)',
      v_cols;
  END IF;

  --  The block reason has no branch for a result with no verdict
  --  BECAUSE ONE CANNOT EXIST. If that stops being true, this file is
  --  letting an unresolved test through and should be revisited rather
  --  than silently covering a case it never considered.
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='batch_qc_results'
                AND column_name='pass' AND is_nullable='YES') THEN
    RAISE EXCEPTION
      'BATCH_QC_PASS_NOW_NULLABLE: batch_qc_results.pass can be null, so an unresolved result is now representable and batch_release_block_reason does not consider it';
  END IF;

END;
$assert$;
