-- =====================================================================
--  SIGNING A QUALITY VERDICT
--
--  DECISION 5. 20261121000000 required a signature to GRANT a
--  GMP-critical role. This is the other half: a signature on the
--  ACTIONS that role performs.
--
--  ── WHICH ACTIONS, AND WHY THESE ──
--
--  Taken from the workflow model rather than from a list of things
--  that sound important. An action is here when a later control reads
--  its result and acts on it:
--
--    batch_qc_result        The release gate reads `pass` and the
--                           recorded value, and refuses the batch on
--                           them. It is the verdict release depends
--                           on. ENFORCED.
--
--    material_test_result   The disposition gate reads it the same
--                           way. The mechanism is built and the
--                           action is registered, but enforcement is
--                           held pending the site's testing
--                           procedure — see `required`.
--
--    batch_execution_close  Production Supervisor's declaration that
--                           execution is finished. Stage completion is
--                           ALREADY signed (batch_stage_complete), so
--                           this is the one step of execution that is
--                           not. Registered, not enforced, pending
--                           procedure.
--
--  ── WHAT IS NOT CHANGED ──
--
--  No existing signing control is weakened and the Part 11 `meaning`
--  vocabulary is not widened: a verdict is signed with meaning
--  'authored' — the analyst is attesting to a result they produced,
--  which is what 'authored' means — and `action` carries which verdict
--  it was. The same throttle, the same password, the same immutable
--  signature row, no test-only path.
-- =====================================================================

-- ── 1. The register of actions that need signing ────────────────────

CREATE TABLE IF NOT EXISTS public.signed_quality_actions (
  action_key      text PRIMARY KEY,
  entity          text NOT NULL,
  performed_by    text NOT NULL,
  --  OFF means the mechanism exists and is not yet enforced. It is a
  --  column rather than an absent row so that "we looked at this and
  --  are waiting" is distinguishable from "nobody considered it".
  required        boolean NOT NULL DEFAULT false,
  decision_status text NOT NULL DEFAULT 'awaiting_procedure'
    CHECK (decision_status IN ('enforced', 'awaiting_procedure', 'declined')),
  basis           text NOT NULL,
  CONSTRAINT signed_action_status_matches_enforcement
    CHECK (required = (decision_status = 'enforced'))
);

COMMENT ON TABLE public.signed_quality_actions IS
  'Actions whose result a later control reads, and which therefore carry an electronic signature. Decision 5.';

INSERT INTO public.signed_quality_actions
  (action_key, entity, performed_by, required, decision_status, basis)
VALUES
  ('batch_qc_result', 'batch_qc_results', 'qc_analyst', true, 'enforced',
   'The release gate reads pass and the recorded value and refuses the batch on them. '
   || 'The verdict release depends on is the verdict that gets signed.'),
  ('material_test_result', 'material_test_results', 'qc_analyst', false, 'awaiting_procedure',
   'The material disposition gate reads it the same way. Mechanism built; enforcement '
   || 'held pending the site''s testing procedure, which decides whether every test '
   || 'result is signed or only those on critical parameters.'),
  ('batch_execution_close', 'batch_records', 'production_supervisor', false, 'awaiting_procedure',
   'Stage completion is already signed by batch_stage_complete. Closing execution is the '
   || 'one step that is not. Held pending procedure: on some sites closing is clerical and '
   || 'the stage signatures are the record.')
ON CONFLICT (action_key) DO UPDATE
  SET entity = EXCLUDED.entity, performed_by = EXCLUDED.performed_by,
      required = EXCLUDED.required, decision_status = EXCLUDED.decision_status,
      basis = EXCLUDED.basis;

ALTER TABLE public.signed_quality_actions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS signed_quality_actions_read ON public.signed_quality_actions;
CREATE POLICY signed_quality_actions_read
  ON public.signed_quality_actions FOR SELECT TO authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.signed_quality_actions
  FROM anon, authenticated;
GRANT SELECT ON public.signed_quality_actions TO anon, authenticated;


CREATE OR REPLACE FUNCTION public.quality_action_needs_signature(p_action text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT coalesce((SELECT required FROM public.signed_quality_actions
                    WHERE action_key = p_action), false);
$$;

GRANT EXECUTE ON FUNCTION public.quality_action_needs_signature(text)
  TO authenticated, service_role;


-- ── 2. The hash a verdict signature is taken over ───────────────────
--
-- The VERDICT, not the row id. Signing an id would let the values be
-- edited afterwards with the signature still attached; signing the
-- values means an edit invalidates it, which is the property that
-- makes a signature worth taking.

CREATE OR REPLACE FUNCTION public.quality_verdict_hash(
  p_action    text,
  p_company_id uuid,
  p_record_id uuid,
  p_subject   text,
  p_result    text,
  p_pass      boolean
) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public, extensions, pg_temp
AS $$
  SELECT encode(extensions.digest(
    concat_ws('|',
      'sha256-qualityverdict-v1',
      p_action, p_company_id::text, p_record_id::text,
      coalesce(p_subject,''), coalesce(p_result,''),
      coalesce(p_pass::text,'')),
    'sha256'), 'hex');
$$;

COMMENT ON FUNCTION public.quality_verdict_hash(text, uuid, uuid, text, text, boolean) IS
  'The hash a quality-verdict signature is taken over: the action, the record it belongs to, the test, the value recorded and the verdict. Change any of them and the signature no longer matches.';

GRANT EXECUTE ON FUNCTION public.quality_verdict_hash(text, uuid, uuid, text, text, boolean)
  TO authenticated, service_role;


-- ── 3. Minting one ──────────────────────────────────────────────────
--
-- Minted BEFORE the row exists, like a role grant and for the same
-- reason: the result is being attested to as it is recorded. So the
-- caller passes the values they are about to write, and the trigger
-- checks that what landed is what was signed.

CREATE OR REPLACE FUNCTION public.quality_verdict_sign(
  p_action     text,
  p_company_id uuid,
  p_record_id  uuid,
  p_subject    text,
  p_result     text,
  p_pass       boolean,
  p_password   text,
  p_reason     text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_name text; v_email text; v_hash text; v_sig uuid; v_fails int;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'E_SIGNATURE_NO_USER',
      'message', 'no authenticated user to sign as');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.signed_quality_actions WHERE action_key = p_action) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'E_SIGNATURE_BAD_ACTION',
      'message', 'not an action this schema signs');
  END IF;

  SELECT count(*) INTO v_fails FROM public.electronic_signature_attempts
   WHERE user_id = v_uid AND outcome = 'bad_password'
     AND created_at > now() - interval '15 minutes';
  IF v_fails >= 5 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'E_SIGNATURE_LOCKED',
      'message', 'too many failed signature attempts; wait before trying again');
  END IF;

  IF NOT public.verify_user_password(p_password) THEN
    INSERT INTO public.electronic_signature_attempts
      (company_id,user_id,entity_type,entity_id,action,outcome,detail)
    VALUES (p_company_id,v_uid,'quality_verdict',p_record_id,p_action,'bad_password',NULL);
    RETURN jsonb_build_object('ok', false, 'code', 'E_SIGNATURE_BAD_PASSWORD',
      'message', 'that password is not correct');
  END IF;

  SELECT full_name, email INTO v_name, v_email FROM public.profiles WHERE id = v_uid;
  v_hash := public.quality_verdict_hash(
              p_action, p_company_id, p_record_id, p_subject, p_result, p_pass);

  INSERT INTO public.electronic_signatures (
    company_id, signer_id, signer_name, signer_email,
    entity_type, entity_id, action, meaning, reason, record_hash, signed_state, metadata
  ) VALUES (
    p_company_id, v_uid, coalesce(v_name,'Unknown'), coalesce(v_email,'unknown'),
    'quality_verdict', p_record_id, p_action,
    --  'authored': the analyst attests to a result they produced. The
    --  Part 11 vocabulary already has the word; widening it to add
    --  'tested' would say what `action` already says.
    'authored',
    nullif(btrim(coalesce(p_reason,'')),''), v_hash,
    coalesce(p_pass::text,'unknown'),
    jsonb_build_object('subject', p_subject, 'result', p_result, 'pass', p_pass)
  ) RETURNING id INTO v_sig;

  INSERT INTO public.electronic_signature_attempts
    (company_id,user_id,entity_type,entity_id,action,outcome,detail)
  VALUES (p_company_id,v_uid,'quality_verdict',p_record_id,p_action,'signed',v_sig::text);

  RETURN jsonb_build_object('ok', true, 'signature_id', v_sig);
END;
$$;

REVOKE ALL ON FUNCTION public.quality_verdict_sign(text,uuid,uuid,text,text,boolean,text,text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quality_verdict_sign(text,uuid,uuid,text,text,boolean,text,text)
  TO authenticated, service_role;


-- ── 4. Verifying one ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.quality_verdict_signature_error(
  p_signature_id uuid,
  p_action       text,
  p_company_id   uuid,
  p_record_id    uuid,
  p_subject      text,
  p_result       text,
  p_pass         boolean,
  p_actor        uuid
) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_sig public.electronic_signatures; v_hash text;
BEGIN
  IF p_signature_id IS NULL THEN
    RETURN format('QUALITY_VERDICT_SIGNATURE_REQUIRED: recording a %s requires an electronic signature',
                  replace(p_action,'_',' '));
  END IF;

  SELECT * INTO v_sig FROM public.electronic_signatures WHERE id = p_signature_id;
  IF v_sig.id IS NULL THEN
    RETURN 'QUALITY_VERDICT_SIGNATURE_INVALID: no such signature';
  END IF;

  IF v_sig.signer_id IS DISTINCT FROM p_actor
     OR v_sig.company_id IS DISTINCT FROM p_company_id
     OR v_sig.action IS DISTINCT FROM p_action THEN
    RETURN 'QUALITY_VERDICT_SIGNATURE_MISMATCH: that signature does not match this verdict';
  END IF;

  --  THE VALUES, not the row. A signature taken over 99.4 % PASS does
  --  not cover 91.0 % PASS, which is the edit it exists to catch.
  v_hash := public.quality_verdict_hash(
              p_action, p_company_id, p_record_id, p_subject, p_result, p_pass);
  IF v_sig.record_hash IS DISTINCT FROM v_hash THEN
    RETURN 'QUALITY_VERDICT_SIGNATURE_MISMATCH: that signature was taken over a different result';
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION
  public.quality_verdict_signature_error(uuid,text,uuid,uuid,text,text,boolean,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  public.quality_verdict_signature_error(uuid,text,uuid,uuid,text,text,boolean,uuid)
  TO authenticated, service_role;


-- ── 5. The finished-product verdict carries one ─────────────────────

ALTER TABLE public.batch_qc_results
  ADD COLUMN IF NOT EXISTS signature_id uuid REFERENCES public.electronic_signatures(id);

--  Single use. A signature covers one verdict.
CREATE UNIQUE INDEX IF NOT EXISTS batch_qc_results_signature_uniq
  ON public.batch_qc_results (signature_id) WHERE signature_id IS NOT NULL;

ALTER TABLE public.material_test_results
  ADD COLUMN IF NOT EXISTS signature_id uuid REFERENCES public.electronic_signatures(id);
CREATE UNIQUE INDEX IF NOT EXISTS material_test_results_signature_uniq
  ON public.material_test_results (signature_id) WHERE signature_id IS NOT NULL;


CREATE OR REPLACE FUNCTION public.fn_batch_qc_results_require_signature()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_err text; v_company uuid;
BEGIN
  --  A service context has no password and is not a person. The
  --  attribution trigger leaves such a row named by whoever the
  --  fixture says; this leaves it unsigned, which is the honest
  --  record of a verdict nobody attested to.
  IF public.app_is_service_context() THEN RETURN NEW; END IF;

  IF NOT public.quality_action_needs_signature('batch_qc_result') THEN
    RETURN NEW;
  END IF;

  SELECT company_id INTO v_company FROM public.batch_records WHERE id = NEW.batch_id;

  v_err := public.quality_verdict_signature_error(
             NEW.signature_id, 'batch_qc_result', v_company, NEW.batch_id,
             NEW.test_name, NEW.result, NEW.pass, auth.uid());
  IF v_err IS NOT NULL THEN
    RAISE EXCEPTION '%', v_err USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

--  ── NAMED TO FIRE LAST ──
--
--  BEFORE triggers run in alphabetical order, and this one has to come
--  after the section guard (trg_batch_qc_results_section_role) and the
--  correction rules (trg_batch_qc_results_correction). Asking somebody
--  to sign a result they are not allowed to record, or one with no
--  verdict in it, answers the wrong question — and the suite caught
--  exactly that: four assertions about authority and validity began
--  failing on a missing signature instead.
--
--  `z_` is a blunt way to say "last", and a comment saying why is
--  worth more than a clever name that loses the ordering on the next
--  edit.
DROP TRIGGER IF EXISTS trg_batch_qc_results_require_signature ON public.batch_qc_results;
DROP TRIGGER IF EXISTS z_trg_batch_qc_results_require_signature ON public.batch_qc_results;
CREATE TRIGGER z_trg_batch_qc_results_require_signature
  BEFORE INSERT ON public.batch_qc_results
  FOR EACH ROW EXECUTE FUNCTION public.fn_batch_qc_results_require_signature();


-- ── 6. Prove it ─────────────────────────────────────────────────────

DO $assert$
DECLARE
  v_c uuid; v_a uuid; v_prod uuid; v_batch uuid; v_sig uuid; r jsonb; v_hit boolean;
BEGIN
  BEGIN
    v_c := gen_random_uuid(); v_a := gen_random_uuid();

    INSERT INTO public.companies(id,name) VALUES (v_c,'Verdict signature self test');
    INSERT INTO auth.users(id,email) VALUES (v_a,'verdict-a@invalid.test');
    UPDATE auth.users
       SET encrypted_password = extensions.crypt('CorrectHorse1!', extensions.gen_salt('bf'))
     WHERE id = v_a;
    INSERT INTO public.profiles(id,email,full_name,company_id,role)
    VALUES (v_a,'verdict-a@invalid.test','Ada Analyst',v_c,'compliance_officer');
    INSERT INTO public.company_members(company_id,user_id,role,status)
    VALUES (v_c,v_a,'admin','active');

    INSERT INTO public.products
      (id,company_id,product_code,trade_name,generic_name,category,created_by)
    VALUES (gen_random_uuid(),v_c,'VSP-1','Tablet V','Paracetamol','drug_pharmaceutical',v_a)
    RETURNING id INTO v_prod;
    INSERT INTO public.batch_records
      (id,company_id,batch_number,product_name,product_id,
       manufacturing_date,expiry_date,batch_size,unit)
    VALUES (gen_random_uuid(),v_c,'VSB-1','Tablet V',v_prod,
            current_date,current_date+365,10,'kg')
    RETURNING id INTO v_batch;

    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_a::text, 'role','authenticated')::text, true);
    IF public.app_is_service_context() THEN RAISE EXCEPTION 'SELF_TEST_STILL_SERVICE'; END IF;

    --  (a) Unsigned is refused.
    v_hit := false;
    BEGIN
      INSERT INTO public.batch_qc_results(batch_id,test_name,result,pass)
      VALUES (v_batch,'Assay','99.4 %',true);
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE 'QUALITY_VERDICT_SIGNATURE_REQUIRED%' THEN v_hit := true; ELSE RAISE; END IF;
    END;
    IF NOT v_hit THEN RAISE EXCEPTION 'UNSIGNED_VERDICT_ACCEPTED'; END IF;

    --  (b) Signed is accepted.
    r := public.quality_verdict_sign('batch_qc_result', v_c, v_batch,
                                     'Assay', '99.4 %', true, 'CorrectHorse1!');
    IF (r->>'ok')::boolean IS NOT TRUE THEN
      RAISE EXCEPTION 'SIGN_FAILED: %', coalesce(r->>'code','?');
    END IF;
    v_sig := (r->>'signature_id')::uuid;

    INSERT INTO public.batch_qc_results(batch_id,test_name,result,pass,signature_id)
    VALUES (v_batch,'Assay','99.4 %',true,v_sig);

    --  (c) THE VALUES ARE WHAT IS SIGNED. The same signature does not
    --  cover a different result.
    r := public.quality_verdict_sign('batch_qc_result', v_c, v_batch,
                                     'Assay', '99.4 %', true, 'CorrectHorse1!');
    v_hit := false;
    BEGIN
      INSERT INTO public.batch_qc_results(batch_id,test_name,result,pass,signature_id)
      VALUES (v_batch,'Assay','91.0 %',true,(r->>'signature_id')::uuid);
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE 'QUALITY_VERDICT_SIGNATURE_MISMATCH%' THEN v_hit := true; ELSE RAISE; END IF;
    END;
    IF NOT v_hit THEN RAISE EXCEPTION 'SIGNATURE_COVERED_A_DIFFERENT_RESULT'; END IF;

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
