-- =====================================================================
--  W4·17 · Dual sign-off, with the state in between
-- =====================================================================
--  The design draws three screens for one stage being signed:
--
--    BR-04 · "operator signed, waiting for verifier ... the verifier
--             signs in with their own account; the stage can't be
--             edited."
--    BR-05 · "both signed: two visibly different signature records;
--             the next stage unlocks."
--
--  and names it as a thing that must exist: "Dual sign-off WITH THE
--  STATE IN BETWEEN and the second signer's own login".
--
--  THE BACKEND COULD NOT REPRESENT THAT STATE. batch_stage_complete()
--  takes the operator signature and the verifier signature in one
--  call, and the stage lifecycle has three states — pending,
--  in_progress, complete — with nothing between the two signatures.
--  In practice that means both people must be standing at the same
--  tablet at the same moment, with the second typing their password
--  into a form the first opened. That is not a second signature; it is
--  the first person's session with somebody else's credential in it,
--  which is the precise thing a two-person rule exists to prevent.
--
--  So this file adds the missing state and the two steps that move
--  through it. batch_stage_complete() is UNCHANGED and still works:
--  stages that do not require a verifier, and callers that genuinely
--  have both signatures, keep their path. Nothing is taken away.
--
--  WHY THE STAGE IS FROZEN IN BETWEEN. Once the operator has signed,
--  their signature covers the readings as they stood. A reading
--  changed before the verifier signs would be covered by neither
--  signature — the operator signed something else, and the verifier is
--  about to countersign a record the operator never saw. The freeze
--  trigger below is what makes BR-04's "the stage can't be edited"
--  true rather than a styling choice.
-- =====================================================================

-- ── 1. The state in between ──────────────────────────────────────────
DO $awaiting$
DECLARE
  v_def  uuid;
  s_prog uuid; s_wait uuid; s_done uuid;
BEGIN
  SELECT id INTO v_def FROM public.lifecycle_definitions
   WHERE entity_type = 'batch_stage' AND company_id IS NULL AND version = 1;

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'W4_17_VIOLATION: the batch_stage lifecycle definition is missing; '
      'migration 20261011000000 must run first.';
  END IF;

  --  Idempotent: the definition's own seed runs only when it creates
  --  the definition, so this state has to be added to a definition
  --  that already exists on every deployed database.
  INSERT INTO public.lifecycle_states
    (definition_id, state_key, label, description, sort_order, is_initial, is_terminal)
  SELECT v_def, 'awaiting_verification', 'Awaiting verification',
         'The operator has signed. A second person must verify and sign before the stage is complete.',
         25, false, false
  WHERE NOT EXISTS (
    SELECT 1 FROM public.lifecycle_states
     WHERE definition_id = v_def AND state_key = 'awaiting_verification');

  SELECT id INTO s_prog FROM public.lifecycle_states
   WHERE definition_id = v_def AND state_key = 'in_progress';
  SELECT id INTO s_wait FROM public.lifecycle_states
   WHERE definition_id = v_def AND state_key = 'awaiting_verification';
  SELECT id INTO s_done FROM public.lifecycle_states
   WHERE definition_id = v_def AND state_key = 'complete';

  --  Both transitions carry requires_signature. That is the whole
  --  point: each step is one person signing for their own half, and
  --  the engine refuses either without a signature.
  INSERT INTO public.lifecycle_transitions
    (definition_id, from_state_id, to_state_id, action_key, label, sort_order,
     requires_comment, requires_signature)
  SELECT v_def, s_prog, s_wait, 'sign_operator', 'Operator signs', 15, false, true
  WHERE NOT EXISTS (
    SELECT 1 FROM public.lifecycle_transitions
     WHERE definition_id = v_def AND action_key = 'sign_operator'
       AND from_state_id = s_prog);

  INSERT INTO public.lifecycle_transitions
    (definition_id, from_state_id, to_state_id, action_key, label, sort_order,
     requires_comment, requires_signature)
  SELECT v_def, s_wait, s_done, 'verify', 'Verifier signs', 25, false, true
  WHERE NOT EXISTS (
    SELECT 1 FROM public.lifecycle_transitions
     WHERE definition_id = v_def AND action_key = 'verify'
       AND from_state_id = s_wait);

  --  A correction before the verifier signs sends the stage back for
  --  re-recording rather than leaving it stuck waiting for a signature
  --  on a record that has changed.
  INSERT INTO public.lifecycle_transitions
    (definition_id, from_state_id, to_state_id, action_key, label, sort_order,
     requires_comment, requires_signature)
  SELECT v_def, s_wait, s_prog, 'reopen', 'Reopen stage', 27, true, false
  WHERE NOT EXISTS (
    SELECT 1 FROM public.lifecycle_transitions
     WHERE definition_id = v_def AND action_key = 'reopen'
       AND from_state_id = s_wait);
END
$awaiting$;

-- ── 2. The operator signs ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.batch_stage_sign_operator(
  p_stage_id     uuid,
  p_signature_id uuid
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  c       record;
  v_actor uuid := auth.uid();
  v_sig   record;
  v_res   jsonb;
BEGIN
  SELECT * INTO c FROM public.batch_stage_context(p_stage_id);

  IF c.closed_at IS NOT NULL THEN
    RAISE EXCEPTION 'BATCH_CLOSED: batch % was closed at % and no stage can be signed',
      c.batch_id, c.closed_at USING ERRCODE = 'P0001';
  END IF;

  IF NOT c.requires_verifier THEN
    --  A stage with no second signer has no in-between state to move
    --  to. Sending it here would leave it awaiting a verification
    --  nobody is required to give.
    RAISE EXCEPTION 'BATCH_STAGE_NO_VERIFIER_REQUIRED: stage % does not require a verifier; use batch_stage_complete()',
      p_stage_id USING ERRCODE = 'P0001';
  END IF;

  SELECT s.signer_id, s.entity_type, s.entity_id INTO v_sig
    FROM public.electronic_signatures s WHERE s.id = p_signature_id;

  IF v_sig.signer_id IS NULL THEN
    RAISE EXCEPTION 'BATCH_STAGE_OPERATOR_SIGNATURE_INVALID: no such signature %',
      p_signature_id USING ERRCODE = 'P0001';
  END IF;

  --  A signature belonging to somebody else, or to another record,
  --  would make the whole two-person rule decorative — the same check
  --  batch_stage_complete() makes on the verifier's.
  IF v_sig.signer_id <> coalesce(v_actor, v_sig.signer_id)
     OR v_sig.entity_type <> 'batch_stage'
     OR v_sig.entity_id <> p_stage_id THEN
    RAISE EXCEPTION 'BATCH_STAGE_OPERATOR_SIGNATURE_INVALID: signature % does not belong to this signer and this stage',
      p_signature_id USING ERRCODE = 'P0001';
  END IF;

  v_res := public.lifecycle_transition(
    'batch_stage', p_stage_id, 'sign_operator', c.company_id, v_actor,
    NULL, '{}'::jsonb, p_signature_id);

  UPDATE public.batch_stages
     SET operator_id = coalesce(operator_id, v_actor),
         operator_signature_id = p_signature_id,
         updated_at = now()
   WHERE id = p_stage_id;

  RETURN v_res || jsonb_build_object('awaiting_verification', true);
END $$;

COMMENT ON FUNCTION public.batch_stage_sign_operator(uuid, uuid) IS
  'The first of two signatures. Moves the stage to awaiting_verification, where it is frozen until a second person signs — so the verifier countersigns the record the operator actually signed.';

-- ── 3. The verifier signs ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.batch_stage_verify(
  p_stage_id     uuid,
  p_signature_id uuid
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  c       record;
  v_actor uuid := auth.uid();
  v_sig   record;
  v_op    uuid;
  v_res   jsonb;
BEGIN
  SELECT * INTO c FROM public.batch_stage_context(p_stage_id);

  IF c.closed_at IS NOT NULL THEN
    RAISE EXCEPTION 'BATCH_CLOSED: batch % was closed at % and no stage can be verified',
      c.batch_id, c.closed_at USING ERRCODE = 'P0001';
  END IF;

  IF c.status <> 'awaiting_verification' THEN
    RAISE EXCEPTION 'BATCH_STAGE_NOT_AWAITING: stage % is %, not awaiting verification',
      p_stage_id, c.status USING ERRCODE = 'P0001';
  END IF;

  SELECT operator_id INTO v_op FROM public.batch_stages WHERE id = p_stage_id;

  --  THE RULE THE SCREEN CANNOT ENFORCE. "The verifier signs in with
  --  their own account" is a sentence on a tablet; this is what makes
  --  it true. The verifier is whoever is signed in NOW, and they may
  --  not be the operator.
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'BATCH_STAGE_VERIFIER_NOT_SIGNED_IN: the verifier must be signed in as themselves'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_actor = v_op THEN
    RAISE EXCEPTION 'BATCH_STAGE_SAME_SIGNER: the operator cannot also verify this stage'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT s.signer_id, s.entity_type, s.entity_id INTO v_sig
    FROM public.electronic_signatures s WHERE s.id = p_signature_id;

  IF v_sig.signer_id IS NULL THEN
    RAISE EXCEPTION 'BATCH_STAGE_VERIFIER_SIGNATURE_INVALID: no such signature %',
      p_signature_id USING ERRCODE = 'P0001';
  END IF;

  IF v_sig.signer_id <> v_actor
     OR v_sig.entity_type <> 'batch_stage'
     OR v_sig.entity_id <> p_stage_id THEN
    RAISE EXCEPTION 'BATCH_STAGE_VERIFIER_SIGNATURE_INVALID: signature % does not belong to this verifier and this stage',
      p_signature_id USING ERRCODE = 'P0001';
  END IF;

  v_res := public.lifecycle_transition(
    'batch_stage', p_stage_id, 'verify', c.company_id, v_actor,
    NULL, '{}'::jsonb, p_signature_id);

  UPDATE public.batch_stages
     SET verifier_id = v_actor,
         verifier_signature_id = p_signature_id,
         completed_at = now(),
         updated_at = now()
   WHERE id = p_stage_id;

  RETURN v_res || jsonb_build_object('verified_by', v_actor);
END $$;

COMMENT ON FUNCTION public.batch_stage_verify(uuid, uuid) IS
  'The second of two signatures, given by whoever is signed in now — who may not be the operator. Completes the stage, which unlocks the next one.';

-- ── 4. Frozen between the two signatures ─────────────────────────────
--  BR-04: "the stage can't be edited". Without this the verifier could
--  countersign a record that changed after the operator signed — a
--  record neither signature covers.
CREATE OR REPLACE FUNCTION public.fn_bspr_awaiting_freeze()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_status text;
BEGIN
  SELECT status INTO v_status FROM public.batch_stages
   WHERE id = coalesce(NEW.batch_stage_id, OLD.batch_stage_id);

  IF v_status = 'awaiting_verification' THEN
    RAISE EXCEPTION 'BATCH_STAGE_AWAITING_FROZEN: the operator has signed this stage. Reopen it to change a reading, which requires both signatures again.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END $$;

DROP TRIGGER IF EXISTS trg_bspr_awaiting_freeze ON public.batch_stage_parameter_readings;
CREATE TRIGGER trg_bspr_awaiting_freeze
  BEFORE INSERT OR UPDATE OR DELETE ON public.batch_stage_parameter_readings
  FOR EACH ROW EXECUTE FUNCTION public.fn_bspr_awaiting_freeze();

GRANT EXECUTE ON FUNCTION public.batch_stage_sign_operator(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.batch_stage_verify(uuid, uuid)        TO authenticated, service_role;

-- ── 5. Deploy-time assertions ────────────────────────────────────────
DO $$
DECLARE v_def uuid; v_n integer;
BEGIN
  SELECT id INTO v_def FROM public.lifecycle_definitions
   WHERE entity_type = 'batch_stage' AND company_id IS NULL AND version = 1;

  IF NOT EXISTS (SELECT 1 FROM public.lifecycle_states
                  WHERE definition_id = v_def AND state_key = 'awaiting_verification') THEN
    RAISE EXCEPTION 'W4_17_VIOLATION: the batch stage lifecycle has no awaiting_verification '
      'state, so "operator signed, waiting for verifier" (BR-04) cannot be represented and '
      'both people must sign at the same tablet.';
  END IF;

  --  Both halves must require a signature, or one of them becomes a
  --  button press and the two-person rule has one person in it.
  SELECT count(*) INTO v_n FROM public.lifecycle_transitions
   WHERE definition_id = v_def AND action_key IN ('sign_operator','verify')
     AND requires_signature;
  IF v_n < 2 THEN
    RAISE EXCEPTION 'W4_17_VIOLATION: % of the two sign-off transitions require a '
      'signature. Both must.', v_n;
  END IF;
END $$;
