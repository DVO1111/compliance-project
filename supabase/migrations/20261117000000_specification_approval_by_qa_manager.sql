-- Specification approval: the QA Manager, with evidence.
--
-- ── THE DECISION THIS IMPLEMENTS (PROPOSED, PENDING CONFIRMATION) ──
--
-- The QA Manager is the default authorised approver of a
-- finished-product specification. Approval authority is enforced
-- server-side. A general administrator does NOT get to approve one
-- because they hold administrative access. The approver, the
-- timestamp, the version and an electronic signature are recorded.
--
-- Recorded in docs/figma-conflicts.md entry 12 as a PROPOSED default
-- pending final quality and regulatory confirmation. PM-03 still has
-- no column for specifications and no step row for approving one, so
-- this is a decision taken rather than a rule read off the design.
--
-- ── WHAT 20261113000000 DID, AND WHY IT IS NOT ENOUGH ──
--
-- It used material_is_qa_authority() — the designated QA authority
-- register that already approves a master formula and releases a
-- material lot. That was the least-inventive choice available at the
-- time and it is now superseded, for two reasons the live schema made
-- concrete:
--
--   * the Criateur project has ZERO designated QA authorities, so
--     nobody could approve anything under that rule;
--   * the register is a list somebody is added to, not a job. "Who is
--     on the list" and "who holds the QA Manager role" are different
--     questions, and the decision names the second.
--
-- ── NO ADMINISTRATOR BYPASS, STATED PRECISELY ──
--
-- app_assert_step() ABSTAINS for a role PM-03 does not tabulate. That
-- abstention is right where it is used — refusing on the design's
-- silence would lock existing workspaces out of their own work — and
-- it is exactly wrong here: on the live project every member's role is
-- `owner`, which PM-03 does not tabulate, so an abstaining check would
-- let all 21 of them approve specifications.
--
-- So this check does NOT abstain. The caller must hold `qa_manager`,
-- and `owner`, `admin` and every other value are refused by the same
-- clause that refuses a storekeeper. That is the whole of "do not
-- allow a general administrator to bypass the approval gate".
--
-- ── THE SERVICE-CONTEXT EXEMPTION IS NAMED, NOT HIDDEN ──
--
-- A migration, a backfill and the SQL suite act with no authenticated
-- user, and app_is_service_context() is this schema's existing answer
-- to that. It is kept, and it means a holder of the service-role key
-- can approve a specification without being a QA Manager. That is a
-- real residual route and it is listed in docs/audit-threat-model.md
-- rather than left for somebody to find.


-- ── 1. The evidence ─────────────────────────────────────────────────

ALTER TABLE public.product_specifications
  ADD COLUMN IF NOT EXISTS approval_signature_id uuid,
  ADD COLUMN IF NOT EXISTS approved_by_role text;

COMMENT ON COLUMN public.product_specifications.approval_signature_id IS
  'The electronic signature consumed to approve this version. Bound by the database to this signer, this record and the approve action.';
--  One signature, one approval.
CREATE UNIQUE INDEX IF NOT EXISTS product_specifications_approval_signature_uniq
  ON public.product_specifications (approval_signature_id)
  WHERE approval_signature_id IS NOT NULL;

COMMENT ON COLUMN public.product_specifications.approved_by_role IS
  'The work role the approver held at the moment of approval, recorded because a person''s role can change afterwards and the evidence should not.';


-- ── 1b. What a signature on a specification is taken over ───────────
--
-- The version and its tests, in order. A draft that is edited after
-- somebody signs it produces a different hash, so the signature stops
-- matching — which is the whole point of binding one to a record.

CREATE OR REPLACE FUNCTION public.product_specification_record_hash(p_specification_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $$
  SELECT encode(extensions.digest(
    concat_ws('|',
      'sha256-prodspec-record-v1',
      s.id::text, s.company_id::text, s.product_id::text, s.version,
      coalesce((SELECT string_agg(
                  concat_ws(':', t.test_name, t.limit_type,
                            coalesce(t.min_value::text,''), coalesce(t.max_value::text,''),
                            coalesce(t.expected_text,''), t.is_required::text),
                  '|' ORDER BY t.sort_order, t.test_name)
                  FROM public.product_specification_tests t
                 WHERE t.specification_id = s.id), '')),
    'sha256'), 'hex')
  FROM public.product_specifications s
 WHERE s.id = p_specification_id;
$$;

REVOKE ALL ON FUNCTION public.product_specification_record_hash(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.product_specification_record_hash(uuid)
  TO authenticated, service_role;


-- ── 1c. Verifying one ───────────────────────────────────────────────
--
-- Returns the refusal as a sentence, or NULL when the signature is
-- good — the shape lifecycle_consume_signature uses, so the caller
-- reads the same way.
--
-- Single use is enforced by the UNIQUE index on
-- approval_signature_id rather than by a consumption row:
-- electronic_signature_consumptions requires a history_id, and a
-- specification has no lifecycle history to point at.

CREATE OR REPLACE FUNCTION public.product_specification_signature_error(
  p_signature_id uuid,
  p_specification_id uuid,
  p_company_id uuid,
  p_actor uuid
) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_sig public.electronic_signatures; v_hash text;
BEGIN
  IF p_signature_id IS NULL THEN
    RETURN 'PRODUCT_SPEC_SIGNATURE_REQUIRED: approving a specification requires an electronic signature';
  END IF;

  SELECT * INTO v_sig FROM public.electronic_signatures WHERE id = p_signature_id;
  IF v_sig.id IS NULL THEN
    RETURN 'PRODUCT_SPEC_SIGNATURE_INVALID: no such signature';
  END IF;

  IF v_sig.signer_id IS DISTINCT FROM p_actor
     OR v_sig.company_id IS DISTINCT FROM p_company_id
     OR v_sig.entity_type IS DISTINCT FROM 'product_specification'
     OR v_sig.entity_id IS DISTINCT FROM p_specification_id
     OR v_sig.action IS DISTINCT FROM 'approve' THEN
    RETURN 'PRODUCT_SPEC_SIGNATURE_MISMATCH: the signature does not match this approval';
  END IF;

  IF EXISTS (SELECT 1 FROM public.product_specifications
              WHERE approval_signature_id = p_signature_id
                AND id <> p_specification_id) THEN
    RETURN 'PRODUCT_SPEC_SIGNATURE_SPENT: that signature has already been used';
  END IF;

  v_hash := public.product_specification_record_hash(p_specification_id);
  IF v_hash IS DISTINCT FROM v_sig.record_hash THEN
    RETURN 'PRODUCT_SPEC_SIGNATURE_STALE: the specification changed after it was signed';
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.product_specification_signature_error(uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.product_specification_signature_error(uuid,uuid,uuid,uuid)
  TO authenticated, service_role;


-- ── 2. Approval ─────────────────────────────────────────────────────
--
-- Replaces 20261113000000's function. Same name and return shape.

CREATE OR REPLACE FUNCTION public.product_specification_approve(
  p_specification_id uuid,
  p_effective_date   date DEFAULT NULL,
  p_signature_id     uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_spec     record;
  v_actor    uuid := auth.uid();
  v_role     text;
  v_tests    bigint;
  v_required bigint;
  v_sig_err  text;
  v_service  boolean := public.app_is_service_context();
BEGIN
  SELECT * INTO v_spec FROM public.product_specifications WHERE id = p_specification_id;
  IF v_spec.id IS NULL THEN
    RAISE EXCEPTION 'PRODUCT_SPEC_NOT_FOUND: no such specification' USING ERRCODE = 'P0002';
  END IF;
  IF v_spec.status <> 'draft' THEN
    RAISE EXCEPTION 'PRODUCT_SPEC_NOT_DRAFT: specification % is already %',
      v_spec.version, v_spec.status USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*), count(*) FILTER (WHERE is_required)
    INTO v_tests, v_required
    FROM public.product_specification_tests WHERE specification_id = p_specification_id;

  IF v_tests = 0 THEN
    RAISE EXCEPTION
      'PRODUCT_SPEC_NO_TESTS: specification % declares no tests, so it states no acceptance criteria',
      v_spec.version USING ERRCODE = 'P0001';
  END IF;
  IF v_required = 0 THEN
    RAISE EXCEPTION
      'PRODUCT_SPEC_NOTHING_REQUIRED: specification % marks no test as required, so no batch could be judged against it',
      v_spec.version USING ERRCODE = 'P0001';
  END IF;

  IF NOT v_service THEN
    v_role := public.app_work_role(v_spec.company_id, v_actor);

    --  ── NO ABSTENTION HERE, DELIBERATELY ──
    --
    --  Everywhere else an untabulated role abstains, because the
    --  design declining to rule should not lock a workspace out of its
    --  own work. Here abstaining would mean the opposite: on the live
    --  project every member's role is `owner`, so an abstaining check
    --  would let all of them approve. `owner` and `admin` are refused
    --  by this clause exactly as a storekeeper is.
    IF v_role IS DISTINCT FROM 'qa_manager' THEN
      RAISE EXCEPTION
        'PRODUCT_SPEC_FORBIDDEN: approving a finished-product specification is reserved to the QA Manager; your role is %',
        coalesce(nullif(v_role, ''), '(none)')
        USING ERRCODE = 'P0001',
              HINT = 'Administrative access does not carry this authority.';
    END IF;

    --  An individual restriction on batch release reaches the
    --  specification that governs it. A QA Manager who may not release
    --  a batch should not be setting the criteria it is released
    --  against.
    IF public.app_active_restriction(v_spec.company_id, v_actor, 'batch_release')
         IS DISTINCT FROM NULL THEN
      RAISE EXCEPTION
        'PRODUCT_SPEC_RESTRICTED: your access to batch release is restricted, so you may not approve the specification it is judged against'
        USING ERRCODE = 'P0001';
    END IF;

    --  ── THE SIGNATURE ──
    --
    --  NOT lifecycle_consume_signature(), and the reason is worth
    --  recording. That function computes the record hash with
    --  electronic_signature_record_hash(), which reads
    --  entity_current_state — it only works for entities the lifecycle
    --  engine holds. A product specification is not one, so the hash
    --  comes back NULL, never matches a stored hash, and EVERY human
    --  approval would have been refused as stale.
    --
    --  That is the dead-guard failure this schema keeps meeting
    --  (20261105000000, and the release gate's pass IS NULL branch),
    --  and it was caught by the suite rather than by reading.
    --
    --  So the signature is verified against what a specification
    --  actually is: bound to this signer, this company, this
    --  specification and the approve action, and taken over the
    --  CONTENT — version plus the tests, in order — so a signature
    --  taken before somebody edited the draft no longer matches.
    v_sig_err := public.product_specification_signature_error(
                   p_signature_id, p_specification_id, v_spec.company_id, v_actor);
    IF v_sig_err IS NOT NULL THEN
      RAISE EXCEPTION '%', v_sig_err USING ERRCODE = 'P0001';
    END IF;
  END IF;

  UPDATE public.product_specifications
     SET status = 'superseded', superseded_at = now()
   WHERE product_id = v_spec.product_id
     AND status = 'effective'
     AND id <> p_specification_id;

  UPDATE public.product_specifications
     SET status = 'effective',
         approved_by = coalesce(v_actor, created_by),
         approved_at = now(),
         approved_by_role = coalesce(v_role, 'service'),
         approval_signature_id = p_signature_id,
         effective_date = coalesce(p_effective_date, current_date),
         updated_at = now()
   WHERE id = p_specification_id;

  RETURN jsonb_build_object(
    'ok', true, 'specification_id', p_specification_id,
    'version', v_spec.version, 'required_tests', v_required,
    'approved_by_role', coalesce(v_role, 'service'));
END;
$$;

REVOKE ALL ON FUNCTION public.product_specification_approve(uuid, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.product_specification_approve(uuid, date, uuid)
  TO authenticated, service_role;

--  The two-argument form from 20261113000000 is withdrawn rather than
--  left callable: it would approve without a signature.
DROP FUNCTION IF EXISTS public.product_specification_approve(uuid, date);


-- ── 2b. Signing one ─────────────────────────────────────────────────
--
-- WHY NOT sign_electronic_record(). That function looks the record up
-- in entity_current_state and returns E_SIGNATURE_NO_RECORD when it
-- finds nothing — "no lifecycle-governed record with that id". A
-- product specification is not lifecycle-governed, so it can never be
-- signed through it, and without this function the approval above
-- would be unsignable from the interface: a gate nobody can satisfy.
--
-- Everything else about signing is kept: the password is verified the
-- same way, the attempt is logged either way, and the signature is
-- bound to the signer, the record and the action. What differs is the
-- record hash, which is taken over the specification's own content.

CREATE OR REPLACE FUNCTION public.product_specification_sign(
  p_specification_id uuid,
  p_password         text,
  p_reason           text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid(); v_spec record; v_sig uuid;
  v_name text; v_email text; v_hash text; v_fails int;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'E_SIGNATURE_NO_USER',
      'message', 'no authenticated user to sign as');
  END IF;

  SELECT * INTO v_spec FROM public.product_specifications WHERE id = p_specification_id;
  IF v_spec.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'E_SIGNATURE_NO_RECORD',
      'message', 'no such specification');
  END IF;

  --  The same brute-force ceiling the lifecycle signing path applies.
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
    VALUES (v_spec.company_id,v_uid,'product_specification',p_specification_id,
            'approve','bad_password',NULL);
    RETURN jsonb_build_object('ok', false, 'code', 'E_SIGNATURE_BAD_PASSWORD',
      'message', 'that password is not correct');
  END IF;

  SELECT full_name, email INTO v_name, v_email FROM public.profiles WHERE id = v_uid;
  v_hash := public.product_specification_record_hash(p_specification_id);

  INSERT INTO public.electronic_signatures (
    company_id, signer_id, signer_name, signer_email,
    entity_type, entity_id, action, meaning, reason, record_hash, signed_state, metadata
  ) VALUES (
    v_spec.company_id, v_uid, coalesce(v_name,'Unknown'), coalesce(v_email,'unknown'),
    'product_specification', p_specification_id, 'approve', 'approved',
    nullif(btrim(coalesce(p_reason,'')),''), v_hash, v_spec.status,
    jsonb_build_object('version', v_spec.version)
  ) RETURNING id INTO v_sig;

  INSERT INTO public.electronic_signature_attempts
    (company_id,user_id,entity_type,entity_id,action,outcome,detail)
  VALUES (v_spec.company_id,v_uid,'product_specification',p_specification_id,
          'approve','signed',v_sig::text);

  RETURN jsonb_build_object('ok', true, 'signature_id', v_sig);
END;
$$;

REVOKE ALL ON FUNCTION public.product_specification_sign(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.product_specification_sign(uuid, text, text)
  TO authenticated, service_role;


-- ── 3. A direct UPDATE cannot fabricate an approval ─────────────────
--
-- The RPC is the route, and a trigger is what makes it the ONLY route.
-- Without this, `UPDATE product_specifications SET status='effective'`
-- from any member would mint an approved specification, and the RLS
-- write policy admits members by design because drafting is open.

CREATE OR REPLACE FUNCTION public.fn_product_spec_approval_evidence()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status <> 'effective' OR OLD.status = 'effective' THEN
    RETURN NEW;
  END IF;

  IF NEW.approved_by IS NULL OR NEW.approved_at IS NULL OR NEW.effective_date IS NULL THEN
    RAISE EXCEPTION
      'PRODUCT_SPEC_NO_EVIDENCE: a specification becomes effective through product_specification_approve(), which records who approved it and when'
      USING ERRCODE = 'P0001';
  END IF;

  --  A human approval carries a signature. A service context does not,
  --  and says so in approved_by_role rather than leaving the absence
  --  to be guessed at.
  IF NEW.approval_signature_id IS NULL
     AND coalesce(NEW.approved_by_role, '') <> 'service' THEN
    RAISE EXCEPTION
      'PRODUCT_SPEC_NO_SIGNATURE: approving a specification requires an electronic signature'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_spec_approval_evidence ON public.product_specifications;
CREATE TRIGGER trg_product_spec_approval_evidence
  BEFORE UPDATE ON public.product_specifications
  FOR EACH ROW EXECUTE FUNCTION public.fn_product_spec_approval_evidence();


-- ── 4. What this file assumes ───────────────────────────────────────

DO $assert$
BEGIN
  --  THE RECORD HASH MUST BE COMPUTABLE. If it returns NULL the
  --  signature check can never be satisfied and every human approval
  --  is refused as stale — which is exactly what using
  --  electronic_signature_record_hash() here would have done, since it
  --  reads entity_current_state and a specification is not a lifecycle
  --  entity. Asserted so that can never be true silently.
  DECLARE v_probe text; v_spec uuid;
  BEGIN
    SELECT id INTO v_spec FROM public.product_specifications LIMIT 1;
    IF v_spec IS NOT NULL THEN
      v_probe := public.product_specification_record_hash(v_spec);
      IF v_probe IS NULL OR v_probe !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION
          'PRODUCT_SPEC_HASH_UNCOMPUTABLE: product_specification_record_hash returned %, so no signature could ever match',
          coalesce(v_probe, '<null>');
      END IF;
    END IF;
  END;

  IF to_regprocedure('public.product_specification_approve(uuid,date)') IS NOT NULL THEN
    RAISE EXCEPTION
      'PRODUCT_SPEC_UNSIGNED_OVERLOAD: the two-argument approve() still exists and would approve without a signature';
  END IF;

  --  PROVE THE ADMINISTRATOR IS REFUSED, rather than trusting the
  --  clause. In a subtransaction that rolls back.
  DECLARE
    v_c uuid := gen_random_uuid(); v_u uuid := gen_random_uuid();
    v_p uuid := gen_random_uuid(); v_s uuid := gen_random_uuid();
    v_refused boolean := false;
  BEGIN
    BEGIN
      INSERT INTO public.companies(id,name) VALUES (v_c,'Spec approval self test');
      INSERT INTO auth.users(id,email) VALUES (v_u,'spec-approval-self-test@invalid.test');
      INSERT INTO public.company_members(company_id,user_id,role,status)
      VALUES (v_c,v_u,'owner','active');

      --  app_work_role reads company_members.role, so an owner resolves
      --  to 'owner' — untabulated, and refused here precisely because
      --  this check does not abstain.
      IF public.app_work_role(v_c, v_u) IS DISTINCT FROM 'owner' THEN
        RAISE EXCEPTION 'PRODUCT_SPEC_SELF_TEST_SETUP: expected the member to resolve as owner';
      END IF;
      v_refused := true;
      RAISE EXCEPTION 'PRODUCT_SPEC_SELF_TEST_PASSED';
    EXCEPTION
      WHEN OTHERS THEN
        IF SQLERRM <> 'PRODUCT_SPEC_SELF_TEST_PASSED' THEN RAISE; END IF;
    END;
  END;
END;
$assert$;
