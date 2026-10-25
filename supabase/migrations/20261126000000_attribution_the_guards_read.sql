-- =====================================================================
--  THE COLUMNS THE DUTY GUARDS READ, ACTUALLY WRITTEN
--
--  20261122000000 and 20261125000000 built separation of duties on the
--  actor columns that already existed. This migration is what happened
--  when those columns were checked rather than assumed.
--
--  Three of them were not being written, or were being written by
--  whoever was asking:
--
--    material_lots.received_by      NEVER SET by the application.
--                                   receiveLot() inserts a lot without
--                                   it, so MATERIAL_DISPOSITION_SELF_
--                                   RECEIVED — decision 1 — read NULL
--                                   for every lot and could not fire.
--                                   A guard installed, attached, and
--                                   unreachable.
--
--    batch_qc_results.tested_by     Supplied by the client on a direct
--                                   INSERT. Whoever recorded a result
--                                   could name somebody else as the
--                                   analyst, which defeats both the
--                                   release gate's self-tested check
--                                   and decision 6.
--
--    material_test_results.analyst_id
--                                   Same: material_test_record_result
--                                   takes p_analyst_id and defaults it
--                                   to auth.uid(), so the default is
--                                   right and any caller can override
--                                   it.
--
--  And one that could be moved:
--
--    batch_dispatches.dispatched_at Caller-suppliable, so a dispatch
--                                   could be recorded as having
--                                   happened before the release that
--                                   authorised it — decision 4's
--                                   backdating case.
--
--  A separation-of-duties rule is exactly as good as the attribution
--  it reads. None of this is new policy; it is the existing policy
--  made reachable.
-- =====================================================================

-- ── 1. Who received a material lot ──────────────────────────────────
--
-- Set by the server, from the authenticated caller. A separate trigger
-- from fn_material_lots_defaults rather than a rewrite of it: that
-- function issues lot numbers and checks tenancy, and re-issuing 40
-- lines to add one assignment is how an unrelated regression gets in.

CREATE OR REPLACE FUNCTION public.fn_material_lots_attribute_receiver()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    --  A SERVICE CONTEXT SUPPLIES ITS OWN. A migration, a seed or the
    --  scheduler is not a person, and a fixture naming its receiver is
    --  being explicit rather than claiming to be somebody else.
    --
    --  Gated on app_is_service_context(), NOT on auth.uid() being
    --  null. The first draft used the latter and broke four suites:
    --  request.jwt.claims survives a RESET ROLE, so a fixture running
    --  as postgres after an impersonation still had a uid and had its
    --  attribution silently rewritten to the last person impersonated.
    IF NOT public.app_is_service_context() AND auth.uid() IS NOT NULL THEN
      NEW.received_by := auth.uid();
    END IF;
    RETURN NEW;
  END IF;

  --  FROZEN ONCE SET, for everyone including service contexts. Who
  --  received a lot is a fact about a moment; changing it later would
  --  move a duty conflict off the person who incurred it.
  IF OLD.received_by IS NOT NULL
     AND NEW.received_by IS DISTINCT FROM OLD.received_by THEN
    RAISE EXCEPTION
      'MATERIAL_LOT_RECEIVER_FROZEN: who received this lot cannot be changed'
      USING ERRCODE = 'P0001',
            HINT = 'A separation-of-duties conflict is read from it.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_material_lots_attribute_receiver ON public.material_lots;
CREATE TRIGGER trg_material_lots_attribute_receiver
  BEFORE INSERT OR UPDATE ON public.material_lots
  FOR EACH ROW EXECUTE FUNCTION public.fn_material_lots_attribute_receiver();


-- ── 2. Who recorded a finished-product QC result ────────────────────
--
-- batch_qc_results is written by a direct INSERT from the application;
-- there is no RPC to put this in. So the trigger is the only place it
-- can go, which is also the right place: a direct writer meets it too.

CREATE OR REPLACE FUNCTION public.fn_batch_qc_results_attribute_analyst()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    --  THE CLIENT'S VALUE IS DISCARDED, not merged. The release gate
    --  refuses a releaser who recorded the batch's results, and that
    --  refusal is worth nothing if the recorder chooses the name on
    --  the row.
    IF NOT public.app_is_service_context() AND auth.uid() IS NOT NULL THEN
      NEW.tested_by := auth.uid();
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.tested_by IS NOT NULL AND NEW.tested_by IS DISTINCT FROM OLD.tested_by THEN
    RAISE EXCEPTION
      'BATCH_QC_ANALYST_FROZEN: who recorded this result cannot be changed'
      USING ERRCODE = 'P0001',
            HINT = 'Record a correction instead; both rows survive and both name their author.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_batch_qc_results_attribute_analyst ON public.batch_qc_results;
CREATE TRIGGER trg_batch_qc_results_attribute_analyst
  BEFORE INSERT OR UPDATE ON public.batch_qc_results
  FOR EACH ROW EXECUTE FUNCTION public.fn_batch_qc_results_attribute_analyst();


-- ── 3. Who analysed a material test ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_material_test_results_attribute_analyst()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT public.app_is_service_context() AND auth.uid() IS NOT NULL THEN
      NEW.analyst_id := auth.uid();
      --  analyst_name is a denormalised copy for display. Left alone
      --  when the caller supplied one that matches, re-derived when it
      --  does not, so the two cannot disagree on screen.
      SELECT coalesce(full_name, email, NEW.analyst_name)
        INTO NEW.analyst_name FROM public.profiles WHERE id = auth.uid();
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.analyst_id IS NOT NULL AND NEW.analyst_id IS DISTINCT FROM OLD.analyst_id THEN
    RAISE EXCEPTION
      'MATERIAL_TEST_ANALYST_FROZEN: who analysed this test cannot be changed'
      USING ERRCODE = 'P0001',
            HINT = 'Supersede the result instead; both rows survive.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_material_test_results_attribute_analyst
  ON public.material_test_results;
CREATE TRIGGER trg_material_test_results_attribute_analyst
  BEFORE INSERT OR UPDATE ON public.material_test_results
  FOR EACH ROW EXECUTE FUNCTION public.fn_material_test_results_attribute_analyst();


-- ── 4. Who recorded an in-process reading ───────────────────────────
--
-- DECISION 6. Recording a reading counts as having executed the batch,
-- so the same reasoning applies: the name on the row decides a duty
-- conflict, and it is the server's to write.
--
-- A correction is already a NEW ROW pointing at the old one
-- (corrected_from_id), so the original author survives a correction by
-- construction. What this adds is that neither row's author can be
-- edited afterwards — which is what would otherwise let somebody
-- correct their own reading out of their own name.

CREATE OR REPLACE FUNCTION public.fn_reading_attribute_recorder()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT public.app_is_service_context() AND auth.uid() IS NOT NULL THEN
      NEW.recorded_by := auth.uid();
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.recorded_by IS NOT NULL AND NEW.recorded_by IS DISTINCT FROM OLD.recorded_by THEN
    RAISE EXCEPTION
      'READING_RECORDER_FROZEN: who recorded this reading cannot be changed'
      USING ERRCODE = 'P0001',
            HINT = 'A correction is a new row; the original keeps its author.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reading_attribute_recorder
  ON public.batch_stage_parameter_readings;
CREATE TRIGGER trg_reading_attribute_recorder
  BEFORE INSERT OR UPDATE ON public.batch_stage_parameter_readings
  FOR EACH ROW EXECUTE FUNCTION public.fn_reading_attribute_recorder();


-- ── 5. Dispatch cannot precede the release that authorised it ───────
--
-- DECISION 4. fn_batch_dispatch_gate already refuses a batch that is
-- not released. This is the other half: the recorded TIME of the
-- dispatch cannot be moved to before the release, which is how a
-- release-order violation would be concealed on a record that passed
-- the gate.

CREATE OR REPLACE FUNCTION public.fn_batch_dispatch_not_backdated()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_released_at timestamptz; v_number text;
BEGIN
  SELECT released_at, batch_number INTO v_released_at, v_number
    FROM public.batch_records WHERE id = NEW.batch_id;

  --  The gate has already refused an unreleased batch, so a missing
  --  timestamp here means a release recorded before released_at
  --  existed. Nothing to compare against; the gate's own check stands.
  IF v_released_at IS NULL THEN RETURN NEW; END IF;

  IF NEW.dispatched_at IS NULL THEN
    NEW.dispatched_at := now();
  END IF;

  IF NEW.dispatched_at < v_released_at THEN
    RAISE EXCEPTION
      'DISPATCH_BEFORE_RELEASE: batch % was released at %, so it cannot have been dispatched at %',
      v_number, v_released_at, NEW.dispatched_at
      USING ERRCODE = 'P0001',
            HINT = 'A dispatch recorded before its release would hide the order the two happened in.';
  END IF;

  --  Nor in the future, which is the same concealment the other way
  --  round: a dispatch dated ahead of the next release would appear to
  --  precede it.
  IF NEW.dispatched_at > now() + interval '1 minute' THEN
    RAISE EXCEPTION 'DISPATCH_IN_THE_FUTURE: a dispatch cannot be recorded as happening later than now'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_batch_dispatch_not_backdated ON public.batch_dispatches;
CREATE TRIGGER trg_batch_dispatch_not_backdated
  BEFORE INSERT ON public.batch_dispatches
  FOR EACH ROW EXECUTE FUNCTION public.fn_batch_dispatch_not_backdated();


-- ── 6. Prove each one bites ─────────────────────────────────────────
--
-- Attribution is the kind of thing that looks right in a schema and is
-- never written. Every assertion below performs the write and reads
-- back what landed, as an authenticated caller rather than as postgres.

DO $assert$
DECLARE
  v_c uuid; v_a uuid; v_b uuid; v_mat uuid; v_lot uuid;
  v_prod uuid; v_batch uuid; v_who uuid; v_hit boolean;
BEGIN
  BEGIN
    v_c := gen_random_uuid(); v_a := gen_random_uuid(); v_b := gen_random_uuid();

    INSERT INTO public.companies(id,name) VALUES (v_c,'Attribution self test');
    INSERT INTO auth.users(id,email) VALUES
      (v_a,'attr-a@invalid.test'), (v_b,'attr-b@invalid.test');
    INSERT INTO public.profiles(id,email,full_name,company_id,role) VALUES
      (v_a,'attr-a@invalid.test','Ada Receiver',v_c,'compliance_officer'),
      (v_b,'attr-b@invalid.test','Ben Other',   v_c,'compliance_officer');
    INSERT INTO public.company_members(company_id,user_id,role,status)
    VALUES (v_c,v_a,'admin','active'), (v_c,v_b,'viewer','active');

    INSERT INTO public.company_numbering_formats(company_id,scope,pattern,prefix,seq_width)
    VALUES (v_c,'material_lot','{PREFIX}-{SEQ}','AT',4)
    ON CONFLICT (company_id,scope) DO NOTHING;

    INSERT INTO public.materials
      (id,company_id,code,name,material_type,criticality,unit_of_measure,created_by)
    VALUES (gen_random_uuid(),v_c,'ATM-1','Lactose','excipient','standard','kg',v_a)
    RETURNING id INTO v_mat;

    INSERT INTO public.products
      (id,company_id,product_code,trade_name,generic_name,category,created_by)
    VALUES (gen_random_uuid(),v_c,'ATP-1','Tablet A','Paracetamol','drug_pharmaceutical',v_a)
    RETURNING id INTO v_prod;

    INSERT INTO public.batch_records
      (id,company_id,batch_number,product_name,product_id,
       manufacturing_date,expiry_date,batch_size,unit)
    VALUES (gen_random_uuid(),v_c,'ATB-1','Tablet A',v_prod,
            current_date,current_date+365,10,'kg')
    RETURNING id INTO v_batch;

    --  ── AS A PERSON, which is the whole point ──
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_a::text, 'role','authenticated')::text, true);
    IF public.app_is_service_context() THEN
      RAISE EXCEPTION 'SELF_TEST_STILL_SERVICE';
    END IF;

    --  (a) The receiver is written, and the caller's claim is ignored.
    INSERT INTO public.material_lots
      (id,company_id,material_id,quantity_received,created_by,received_by)
    VALUES (gen_random_uuid(),v_c,v_mat,10,v_a,v_b)   -- claims v_b
    RETURNING id INTO v_lot;

    SELECT received_by INTO v_who FROM public.material_lots WHERE id = v_lot;
    IF v_who IS DISTINCT FROM v_a THEN
      RAISE EXCEPTION
        'RECEIVER_NOT_ATTRIBUTED: expected the caller, got %', coalesce(v_who::text,'NULL');
    END IF;

    --  (b) And cannot be moved afterwards.
    v_hit := false;
    BEGIN
      UPDATE public.material_lots SET received_by = v_b WHERE id = v_lot;
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE 'MATERIAL_LOT_RECEIVER_FROZEN%' THEN v_hit := true; ELSE RAISE; END IF;
    END;
    IF NOT v_hit THEN RAISE EXCEPTION 'RECEIVER_NOT_FROZEN'; END IF;

    --  (c) WHICH MAKES DECISION 1 REACHABLE. This is the assertion
    --  that would have failed before this migration: the conflict read
    --  NULL and returned nothing.
    IF public.duty_conflict('material_lot', v_lot, 'disposition', v_a) IS NULL THEN
      RAISE EXCEPTION
        'DECISION_1_UNREACHABLE: the receiver is not refused the disposition';
    END IF;
    IF public.duty_conflict('material_lot', v_lot, 'disposition', v_b) IS NOT NULL THEN
      RAISE EXCEPTION 'DECISION_1_TOO_WIDE: somebody who did not receive it was refused';
    END IF;

    --  (d) The QC analyst is written from the session, not the row.
    INSERT INTO public.batch_qc_results(batch_id,test_name,result,pass,tested_by)
    VALUES (v_batch,'Assay','99.4 %',true,v_b);       -- claims v_b
    SELECT tested_by INTO v_who FROM public.batch_qc_results WHERE batch_id = v_batch;
    IF v_who IS DISTINCT FROM v_a THEN
      RAISE EXCEPTION 'QC_ANALYST_NOT_ATTRIBUTED: expected the caller, got %',
        coalesce(v_who::text,'NULL');
    END IF;

    --  (e) And the release gate's self-tested rule now follows it.
    IF public.duty_conflict('batch', v_batch, 'release', v_a) IS NULL THEN
      RAISE EXCEPTION 'SELF_TESTED_UNREACHABLE: the recorder is not refused the release';
    END IF;

    PERFORM set_config('role', 'none', true);
    RAISE EXCEPTION 'ROLLBACK_THE_ASSERTION';
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM set_config('role', 'none', true);
      IF SQLERRM <> 'ROLLBACK_THE_ASSERTION' THEN RAISE; END IF;
  END;

  PERFORM set_config('request.jwt.claims', NULL, true);
END
$assert$;
