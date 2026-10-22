-- Write policies that admit the roles the work is assigned to.
--
-- ── THE SWEEP THAT FOUND THESE ──
--
-- 20261109000000 widened certificate_of_analysis' update policy after a
-- test asserting a refusal got SILENCE instead: the policy admitted
-- only `app_has_company_role(..., ARRAY['owner','admin'])`, so a caller
-- holding a PM-03 work role matched zero rows and their UPDATE
-- succeeded having changed nothing.
--
-- docs/figma-conflicts.md entry 19 asked whether other tables carried
-- the same shape. They do, and the pattern is identical on all of
-- them:
--
--   INSERT   app_is_company_member(...)        — any member
--   UPDATE   owner/admin only
--   DELETE   owner/admin only
--
-- on batch_records, batch_qc_results, raw_material_receipts and
-- batch_inprocess_qc.
--
-- ── WHAT THAT BREAKS, CONCRETELY ──
--
-- batch_records is the sharp one. updateBatchStatus() moves the state
-- through lifecycle_transition — a SECURITY DEFINER function, so it
-- bypasses row level security and SUCCEEDS — and then writes the side
-- columns the screens read with a plain UPDATE from the browser:
-- released_at, released_by, release_notes, qc_started_at, hold_reason.
--
-- For a QA Manager, that second write matched zero rows. The batch
-- released and no record was kept of when, by whom, or on what notes.
-- The service even has a comment explaining that a failure there is
-- logged rather than thrown, so nothing surfaced. It is not an error:
-- it is a successful statement that changed nothing.
--
-- ── WIDENED, NOT REPLACED ──
--
-- The owner/admin clause stays and the PM-03 clause is OR-ed beside
-- it, for the reason 20261109000000 gives: AND-ing two role models can
-- only subtract. The narrower check stays where it belongs — the
-- lifecycle guards and the section triggers.
--
-- DELETE policies are left alone deliberately. Nothing in these
-- workflows deletes a batch, a result or a receipt, and widening a
-- delete is not something to do while sweeping.


-- ── 1. batch_records ────────────────────────────────────────────────
--
-- `status` is read-only to direct writes (a trigger refuses it), so
-- widening this cannot be a way to move a batch — only to record the
-- facts beside the move. Both cells are admitted: the batch_release
-- holder writes released_at and release_notes, the batch_records
-- holder writes execution and line details.

DROP POLICY IF EXISTS br_update_qa ON public.batch_records;
CREATE POLICY br_update_qa ON public.batch_records
  FOR UPDATE TO authenticated
  USING (
    public.app_has_company_role(company_id, ARRAY['owner', 'admin'])
    OR public.app_section_access(company_id, 'batch_release') = 'act'
    OR public.app_section_access(company_id, 'batch_records') = 'act'
  )
  WITH CHECK (
    public.app_has_company_role(company_id, ARRAY['owner', 'admin'])
    OR public.app_section_access(company_id, 'batch_release') = 'act'
    OR public.app_section_access(company_id, 'batch_records') = 'act'
  );


-- ── 2. raw_material_receipts ────────────────────────────────────────
--
-- PM-03's `Goods receipt` column: Act for the Storekeeper. A
-- storekeeper could create a receipt and not correct one.

DROP POLICY IF EXISTS rmr_update_qa ON public.raw_material_receipts;
CREATE POLICY rmr_update_qa ON public.raw_material_receipts
  FOR UPDATE TO authenticated
  USING (
    public.app_has_company_role(company_id, ARRAY['owner', 'admin'])
    OR public.app_section_access(company_id, 'goods_receipt') = 'act'
  )
  WITH CHECK (
    public.app_has_company_role(company_id, ARRAY['owner', 'admin'])
    OR public.app_section_access(company_id, 'goods_receipt') = 'act'
  );


-- ── 3. batch_qc_results, and a hole the sweep opened up ─────────────
--
-- The policy question is the same — a QC Analyst holds Act on `QC
-- testing` and could write a result but not touch one — but widening
-- it alone would make things WORSE, so the correction model comes
-- first.
--
-- 20261107000000 made a failed finished-product test block a release.
-- That gate is only as good as the row it reads. Nothing stopped a
-- recorded `pass = false` being UPDATEd to true, after which the batch
-- releases and the failure has left no trace.
--
-- The schema already has an answer to this shape of problem and uses
-- it for batch readings (20261011000000): THERE IS NO EDIT. A
-- correction is a NEW ROW pointing at the one it replaces, both
-- survive, and the log carries who, when, from what, to what and why.
-- "A correction overwrites the original value" is one of that item's
-- NOT DONE IF clauses, and a QC verdict deserves at least what a
-- mixing speed gets.

ALTER TABLE public.batch_qc_results
  ADD COLUMN IF NOT EXISTS corrected_from_id uuid
    REFERENCES public.batch_qc_results(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS correction_reason text;

COMMENT ON COLUMN public.batch_qc_results.corrected_from_id IS
  'The result this one replaces. The superseded row stays; the release gate ignores it.';

CREATE INDEX IF NOT EXISTS batch_qc_results_corrected_from_idx
  ON public.batch_qc_results (corrected_from_id)
  WHERE corrected_from_id IS NOT NULL;

--  A correction names a reason, and may not correct a correction's
--  target twice — a chain is a history, a fork is an argument.
CREATE OR REPLACE FUNCTION public.fn_batch_qc_results_correction()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp
AS $$
DECLARE v_target record;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    --  THE VERDICT AND THE VALUE ARE WHAT THE RELEASE GATE READS.
    --  Everything else about a result may be tidied; these two are
    --  corrected by recording another result, never by editing this
    --  one.
    IF NEW.pass IS DISTINCT FROM OLD.pass
       OR NEW.result IS DISTINCT FROM OLD.result THEN
      RAISE EXCEPTION
        'BATCH_QC_IMMUTABLE: a result''s verdict cannot be edited — record a correcting result instead'
        USING ERRCODE = 'P0001';
    END IF;
    IF NEW.corrected_from_id IS DISTINCT FROM OLD.corrected_from_id THEN
      RAISE EXCEPTION 'BATCH_QC_IMMUTABLE: what a result corrects cannot be changed'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.corrected_from_id IS NULL THEN RETURN NEW; END IF;

  IF btrim(coalesce(NEW.correction_reason, '')) = '' THEN
    RAISE EXCEPTION 'BATCH_QC_CORRECTION_NO_REASON: a correction requires a reason'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT id, batch_id INTO v_target
    FROM public.batch_qc_results WHERE id = NEW.corrected_from_id;
  IF v_target.id IS NULL THEN
    RAISE EXCEPTION 'BATCH_QC_NO_SUCH_RESULT: no result % to correct', NEW.corrected_from_id
      USING ERRCODE = 'P0002';
  END IF;
  IF v_target.batch_id <> NEW.batch_id THEN
    RAISE EXCEPTION 'BATCH_QC_CORRECTION_FOREIGN: that result belongs to another batch'
      USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.batch_qc_results
              WHERE corrected_from_id = NEW.corrected_from_id) THEN
    RAISE EXCEPTION
      'BATCH_QC_ALREADY_CORRECTED: that result has already been corrected; correct the correction'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_batch_qc_results_correction ON public.batch_qc_results;
CREATE TRIGGER trg_batch_qc_results_correction
  BEFORE INSERT OR UPDATE ON public.batch_qc_results
  FOR EACH ROW EXECUTE FUNCTION public.fn_batch_qc_results_correction();

--  Now the policy can be widened: the dangerous edit is no longer
--  reachable by anyone, owner and admin included.
DROP POLICY IF EXISTS bqc_modify_qa ON public.batch_qc_results;
CREATE POLICY bqc_modify_qa ON public.batch_qc_results
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.batch_records b
     WHERE b.id = batch_qc_results.batch_id
       AND (public.app_has_company_role(b.company_id, ARRAY['owner', 'admin'])
            OR public.app_section_access(b.company_id, 'qc_testing') = 'act')))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.batch_records b
     WHERE b.id = batch_qc_results.batch_id
       AND (public.app_has_company_role(b.company_id, ARRAY['owner', 'admin'])
            OR public.app_section_access(b.company_id, 'qc_testing') = 'act')));


-- ── 4. The release gate reads the result that stands ────────────────
--
-- A superseded result is history, not an objection. Without this, a
-- correction would leave the original failure blocking the batch
-- forever and the correction would be pointless.
--
-- Replaces the body from 20261107000000; the signature, the return and
-- every caller are unchanged.

CREATE OR REPLACE FUNCTION public.batch_release_block_reason(p_batch_id uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_batch   record;
  v_total   bigint;
  v_failed  bigint;
BEGIN
  SELECT id, batch_number INTO v_batch
    FROM public.batch_records WHERE id = p_batch_id;
  IF v_batch.id IS NULL THEN
    RETURN 'no such batch record';
  END IF;

  --  SUPERSEDED RESULTS ARE EXCLUDED, not deleted. A result that has
  --  been corrected stays on the record and stops being an objection;
  --  the correction that replaced it is counted in its place.
  --
  --  Still no branch for a result with no verdict: batch_qc_results.pass
  --  is NOT NULL and the assertion at the foot of 20261107000000
  --  checks it is still so.
  SELECT count(*), count(*) FILTER (WHERE r.pass IS FALSE)
    INTO v_total, v_failed
    FROM public.batch_qc_results r
   WHERE r.batch_id = p_batch_id
     AND NOT EXISTS (SELECT 1 FROM public.batch_qc_results c
                      WHERE c.corrected_from_id = r.id);

  IF v_failed > 0 THEN
    RETURN format('%s finished-product test%s failed. A failed test is an '
               || 'investigation, not a release.',
                  v_failed, CASE WHEN v_failed = 1 THEN '' ELSE 's' END);
  END IF;

  IF v_total = 0 THEN
    RETURN 'no finished-product test results have been recorded. This schema '
        || 'holds no finished-product specification, so it cannot tell "none '
        || 'required" from "none done".';
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.batch_release_conditions(p_batch_id uuid)
RETURNS TABLE(condition_key text, severity text, title text, detail text,
              continue_with text, sort_order integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_total   bigint;
  v_failed  bigint;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE r.pass IS FALSE)
    INTO v_total, v_failed
    FROM public.batch_qc_results r
   WHERE r.batch_id = p_batch_id
     AND NOT EXISTS (SELECT 1 FROM public.batch_qc_results c
                      WHERE c.corrected_from_id = r.id);

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


-- ── 5. What this file assumes ───────────────────────────────────────

DO $assert$
DECLARE v_bad text;
BEGIN
  --  Every policy widened here must actually mention the grid, or the
  --  widening silently did not happen and the guard behind it is
  --  unreachable — which is exactly how certificate_of_analysis got
  --  past review the first time.
  SELECT string_agg(c.relname || '.' || p.polname, ', ') INTO v_bad
    FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
   WHERE p.polname IN ('br_update_qa', 'rmr_update_qa', 'bqc_modify_qa')
     AND coalesce(pg_get_expr(p.polqual, p.polrelid), '') NOT LIKE '%app_section_access%';
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'POLICY_NOT_WIDENED: % still admits only owner/admin', v_bad;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
     WHERE c.relname = 'batch_qc_results'
       AND t.tgname = 'trg_batch_qc_results_correction' AND NOT t.tgisinternal)
  THEN
    RAISE EXCEPTION
      'BATCH_QC_CORRECTION_NOT_ATTACHED: the verdict is editable again and the release gate reads an editable row';
  END IF;
END;
$assert$;
