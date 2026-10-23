-- The governing specification, preserved against the batch.
--
-- ── THE DECISION THIS IMPLEMENTS (PROPOSED, PENDING CONFIRMATION) ──
--
-- The approved specification effective at the time of manufacture is
-- the proposed governing version, subject to confirmation against the
-- applicable regulatory requirements and quality procedures. It is
-- PRESERVED AGAINST THE BATCH. Any later reassessment is recorded as a
-- controlled review, never a silent replacement of historical criteria.
--
-- ── WHY DERIVING IT EVERY TIME IS NOT THE SAME AS PRESERVING IT ──
--
-- 20261113000000 computes the governing version on demand:
-- batch_governing_specification() picks the approved version whose
-- effective_date is the latest on or before the batch's manufacturing
-- date. That is the right rule and it is not a record.
--
-- A derived answer changes when the inputs change. Correct a batch's
-- manufacturing_date, approve a version with an earlier effective
-- date, withdraw one — and the batch is suddenly judged against
-- different criteria, with nothing anywhere saying it used to be
-- judged against others. For a batch already released, the criteria it
-- was released against would simply stop being recoverable.
--
-- So the derivation stays, as the rule for choosing; and the answer is
-- STAMPED on the batch at the moment it is released, after which the
-- stamp is what counts and it cannot be changed.
--
-- ── A REASSESSMENT IS A DECISION SOMEBODY TAKES ──
--
-- batch_specification_reviews records one: which batch, from which
-- version to which, why, by whom, when, and under which signature.
-- Changing the stamp is possible ONLY by recording one of those, and
-- the previous value survives in it.


-- ── 1. The stamp ────────────────────────────────────────────────────

ALTER TABLE public.batch_records
  ADD COLUMN IF NOT EXISTS governing_specification_id uuid
    REFERENCES public.product_specifications(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS governing_specification_stamped_at timestamptz;

COMMENT ON COLUMN public.batch_records.governing_specification_id IS
  'The finished-product specification this batch was released against, fixed at release. Null until released. Changed only by recording a controlled review in batch_specification_reviews.';


-- ── 2. The controlled review ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.batch_specification_reviews (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  batch_id      uuid NOT NULL REFERENCES public.batch_records(id) ON DELETE RESTRICT,
  from_specification_id uuid REFERENCES public.product_specifications(id) ON DELETE RESTRICT,
  to_specification_id   uuid NOT NULL REFERENCES public.product_specifications(id) ON DELETE RESTRICT,
  --  NOT NULL and non-empty: a reassessment of the criteria a released
  --  batch was judged against is not something to record without
  --  saying why.
  reason        text NOT NULL CHECK (btrim(reason) <> ''),
  reviewed_by   uuid,
  reviewed_at   timestamptz NOT NULL DEFAULT now(),
  signature_id  uuid,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS batch_specification_reviews_batch_idx
  ON public.batch_specification_reviews (batch_id, reviewed_at DESC);

COMMENT ON TABLE public.batch_specification_reviews IS
  'Controlled reviews of which specification governs a batch. The only route by which a stamped governing specification may change, and the previous value survives here.';

ALTER TABLE public.batch_specification_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS batch_specification_reviews_select ON public.batch_specification_reviews;
CREATE POLICY batch_specification_reviews_select ON public.batch_specification_reviews
  FOR SELECT TO authenticated USING (public.app_is_company_member(company_id));

--  Written through the function below, which checks authority. The
--  policy admits members so the trigger can refuse in words rather
--  than the row silently not appearing — the lesson from
--  certificate_of_analysis.
DROP POLICY IF EXISTS batch_specification_reviews_insert ON public.batch_specification_reviews;
CREATE POLICY batch_specification_reviews_insert ON public.batch_specification_reviews
  FOR INSERT TO authenticated
  WITH CHECK (public.app_is_company_member(company_id));

--  A review is a record of a decision. It is not edited or withdrawn;
--  a further review supersedes it.
CREATE OR REPLACE FUNCTION public.fn_batch_spec_reviews_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION
    'SPEC_REVIEW_IMMUTABLE: a specification review cannot be % — record another review instead',
    lower(TG_OP) USING ERRCODE = 'P0001';
END;
$$;

DROP TRIGGER IF EXISTS trg_batch_spec_reviews_immutable ON public.batch_specification_reviews;
CREATE TRIGGER trg_batch_spec_reviews_immutable
  BEFORE UPDATE OR DELETE ON public.batch_specification_reviews
  FOR EACH ROW EXECUTE FUNCTION public.fn_batch_spec_reviews_immutable();


-- ── 3. Stamping, at release ─────────────────────────────────────────
--
-- On the status mirror rather than inside a release function, so it
-- happens whichever route reached `released` — the same reasoning that
-- puts the guards on entity_current_state.
--
-- By the time this runs the release gate has already passed, so
-- batch_governing_specification() is non-null: the gate refuses
-- without one. The null branch is defensive and does not invent a
-- value.

CREATE OR REPLACE FUNCTION public.fn_batch_stamp_governing_specification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_spec uuid;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF NEW.status <> 'released' THEN RETURN NEW; END IF;
  IF NEW.governing_specification_id IS NOT NULL THEN RETURN NEW; END IF;

  v_spec := public.batch_governing_specification(NEW.id);
  IF v_spec IS NULL THEN RETURN NEW; END IF;

  NEW.governing_specification_id := v_spec;
  NEW.governing_specification_stamped_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_batch_stamp_governing_specification ON public.batch_records;
CREATE TRIGGER trg_batch_stamp_governing_specification
  BEFORE UPDATE ON public.batch_records
  FOR EACH ROW EXECUTE FUNCTION public.fn_batch_stamp_governing_specification();


-- ── 4. Once stamped, only a review moves it ─────────────────────────
--
-- The session flag is set by the review function and nothing else, so
-- a direct UPDATE cannot clear or repoint the stamp. It is scoped to
-- the transaction (`true` on set_config) and cleared immediately.

CREATE OR REPLACE FUNCTION public.fn_batch_governing_spec_locked()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.governing_specification_id IS NOT DISTINCT FROM OLD.governing_specification_id THEN
    RETURN NEW;
  END IF;
  IF OLD.governing_specification_id IS NULL THEN RETURN NEW; END IF;

  IF coalesce(current_setting('app.spec_review', true), '') <> OLD.id::text THEN
    RAISE EXCEPTION
      'BATCH_SPEC_LOCKED: the specification a batch was released against cannot be changed; record a controlled review'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_batch_governing_spec_locked ON public.batch_records;
CREATE TRIGGER trg_batch_governing_spec_locked
  BEFORE UPDATE ON public.batch_records
  FOR EACH ROW EXECUTE FUNCTION public.fn_batch_governing_spec_locked();


-- ── 5. Recording a review ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.batch_specification_review(
  p_batch_id         uuid,
  p_to_specification uuid,
  p_reason           text,
  p_signature_id     uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_batch record; v_to record; v_actor uuid := auth.uid();
  v_id uuid; v_sig_err text;
BEGIN
  SELECT id, company_id, product_id, governing_specification_id, status
    INTO v_batch FROM public.batch_records WHERE id = p_batch_id;
  IF v_batch.id IS NULL THEN
    RAISE EXCEPTION 'SPEC_REVIEW_NO_BATCH: no such batch record' USING ERRCODE = 'P0002';
  END IF;

  SELECT id, product_id, status INTO v_to
    FROM public.product_specifications WHERE id = p_to_specification;
  IF v_to.id IS NULL THEN
    RAISE EXCEPTION 'SPEC_REVIEW_NO_SPEC: no such specification' USING ERRCODE = 'P0002';
  END IF;
  IF v_to.product_id IS DISTINCT FROM v_batch.product_id THEN
    RAISE EXCEPTION 'SPEC_REVIEW_WRONG_PRODUCT: that specification belongs to another product'
      USING ERRCODE = 'P0001';
  END IF;
  IF v_to.status = 'draft' THEN
    RAISE EXCEPTION 'SPEC_REVIEW_DRAFT: a draft specification cannot govern a batch'
      USING ERRCODE = 'P0001';
  END IF;
  IF btrim(coalesce(p_reason, '')) = '' THEN
    RAISE EXCEPTION 'SPEC_REVIEW_NO_REASON: a controlled review requires a reason'
      USING ERRCODE = 'P0001';
  END IF;
  IF v_batch.governing_specification_id IS NOT DISTINCT FROM p_to_specification THEN
    RAISE EXCEPTION 'SPEC_REVIEW_NO_CHANGE: that specification already governs this batch'
      USING ERRCODE = 'P0001';
  END IF;

  --  Reassessing the criteria a batch was released against is a
  --  release-shaped decision, so it is the release step's holder —
  --  and an individual restriction on batch release reaches it,
  --  because app_assert_step consults one (20261114000000).
  PERFORM public.app_assert_step(v_batch.company_id, 'batch_release');

  IF NOT public.app_is_service_context() THEN
    v_sig_err := public.lifecycle_consume_signature(
                   p_signature_id, 'batch_record', p_batch_id,
                   v_batch.company_id, 'specification_review', v_actor);
    IF v_sig_err IS NOT NULL THEN
      RAISE EXCEPTION '%', v_sig_err USING ERRCODE = 'P0001';
    END IF;
  END IF;

  INSERT INTO public.batch_specification_reviews
    (company_id, batch_id, from_specification_id, to_specification_id,
     reason, reviewed_by, signature_id)
  VALUES (v_batch.company_id, p_batch_id, v_batch.governing_specification_id,
          p_to_specification, btrim(p_reason), v_actor, p_signature_id)
  RETURNING id INTO v_id;

  --  Scoped to this transaction and cleared straight after, so the
  --  lock above admits exactly this one change to exactly this batch.
  PERFORM set_config('app.spec_review', p_batch_id::text, true);
  UPDATE public.batch_records
     SET governing_specification_id = p_to_specification,
         governing_specification_stamped_at = now()
   WHERE id = p_batch_id;
  PERFORM set_config('app.spec_review', '', true);

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.batch_specification_review(uuid, uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.batch_specification_review(uuid, uuid, text, uuid)
  TO authenticated, service_role;


-- ── 6. What governs a batch, stamp first ────────────────────────────
--
-- Reads the stamp where there is one and derives only where there is
-- not. A released batch answers from the record; one still in
-- manufacture answers from the rule, because there is nothing else to
-- answer from yet.

CREATE OR REPLACE FUNCTION public.batch_governing_specification(p_batch_id uuid)
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_stamped uuid; v_derived uuid;
BEGIN
  SELECT governing_specification_id INTO v_stamped
    FROM public.batch_records WHERE id = p_batch_id;
  IF v_stamped IS NOT NULL THEN RETURN v_stamped; END IF;

  SELECT s.id INTO v_derived
    FROM public.batch_records b
    JOIN public.product_specifications s ON s.product_id = b.product_id
   WHERE b.id = p_batch_id
     --  Superseded counts: a version is superseded going forward and
     --  still governed every batch made while it was in force.
     --  'withdrawn' does not: it was retracted rather than replaced.
     AND s.status IN ('effective', 'superseded')
     AND s.approved_at IS NOT NULL
     AND s.effective_date IS NOT NULL
     AND s.effective_date <= b.manufacturing_date
   ORDER BY s.effective_date DESC, s.approved_at DESC
   LIMIT 1;

  RETURN v_derived;
END;
$$;

COMMENT ON FUNCTION public.batch_governing_specification(uuid) IS
  'The specification a batch is judged against: the version stamped on it at release where there is one, otherwise the approved version in force on its manufacturing date.';


-- ── 7. What this file assumes ───────────────────────────────────────

DO $assert$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='batch_records'
                    AND column_name='governing_specification_id') THEN
    RAISE EXCEPTION 'BATCH_SPEC_STAMP_MISSING: the stamp column was not added';
  END IF;

  --  The stamp must be read in preference to the derivation, or
  --  "preserved" means nothing.
  IF pg_get_functiondef('public.batch_governing_specification(uuid)'::regprocedure)
       NOT LIKE '%governing_specification_id INTO v_stamped%' THEN
    RAISE EXCEPTION
      'BATCH_SPEC_NOT_PRESERVED: batch_governing_specification does not read the stamp';
  END IF;
END;
$assert$;
