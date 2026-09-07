-- =====================================================================
--  ELECTRONIC SIGNATURES & TRACEABILITY
-- =====================================================================
--  This is a hardened rewrite of the handoff package of the same name.
--  The original established the right shape — a definer RPC, signer from
--  auth.uid(), membership checked, immutability triggers, RLS — and that
--  shape is kept. What it did not do was make the signature MEAN
--  anything, and each of the following was reproduced against a local
--  database before being fixed:
--
--    1. NO CREDENTIAL CHALLENGE. The signing gate was a checkbox. Anyone
--       holding a live session could sign. §11.200(a)(1) wants two
--       identification components at the moment of signing.
--    2. NO AUTHORISATION. A content_creator signed 'qa_final_release'
--       with the meaning "I release this batch to market." Any active
--       member could sign any action.
--    3. NO RECORD BINDING. evidence_hash was nullable, client-supplied
--       and stored verbatim — the string 'not-a-hash-at-all' was
--       accepted. §11.70 exists to stop exactly this.
--    4. CROSS-TENANT SIGNING. entity_id was never checked against
--       company_id, so a member of one company could sign an entity id
--       belonging to another.
--    5. OUTSIDE THE AUDIT CHAIN. The audit row was written with a NULL
--       integrity_hash and NULL sequence_number, so verify_audit_chain()
--       — which filters on integrity_hash IS NOT NULL — could not see
--       it. Measured: 0 of 1 rows in chain scope.
--    6. UNREADABLE BY THE APP. REVOKE ALL ... FROM authenticated removed
--       the SELECT the policy grants; a policy cannot restore a revoked
--       privilege. The listing page failed with permission denied.
--    7. service_role COULD TRUNCATE the table. Row triggers do not fire
--       on TRUNCATE and RLS does not restrain it.
--    8. NO PRINTED NAME (§11.50). Only signer_id, rendered in the UI as
--       a raw UUID, and nothing frozen at signing time.
--
--  THE SHAPE OF THE FIX
--  --------------------
--  Authorisation is not reinvented here. A signature attaches to a
--  governed workflow action, so the question "may this person do this?"
--  is answered by the lifecycle engine that already answers it for
--  everything else. An entity with no lifecycle definition cannot be
--  signed at all — fail closed, as D02 established.
--
--  Refusals RETURN rather than raise, for the same reason the denial
--  audit does: a raise rolls back its own evidence, and §11.300(d) wants
--  attempted unauthorised use recorded, not discarded. Genuine faults
--  still raise.
--
--  WHAT THIS STILL DOES NOT CLAIM
--  ------------------------------
--  One factor. User ID + password is the conventional reading of
--  §11.200(a)(1)'s two components and both exist here, but there is no
--  MFA in this product (SecurityTab.tsx says "MFA Coming Soon"). Whether
--  that satisfies your regulator is a QA determination, not an
--  engineering one, and it must be recorded as such. This migration does
--  not make Criateur validated or Part 11 compliant.
-- =====================================================================


-- ── 1. The signature record ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.electronic_signatures (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  signer_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,

  -- §11.50: the manifestation must carry the printed name of the signer.
  -- Captured HERE, at signing time, and never recomputed: a later profile
  -- rename must not retroactively change what a signature says.
  signer_name    text NOT NULL,
  signer_email   text NOT NULL,

  entity_type    text NOT NULL,
  entity_id      uuid NOT NULL,
  action         text NOT NULL,

  -- §11.50: the MEANING is the point of the signature, and a free-text
  -- box lets the record attest to something other than what happened.
  meaning        text NOT NULL,
  reason         text,

  -- §11.70: the binding. Computed server-side over the record's own
  -- state, never accepted from a caller. The convention is named so a
  -- future change is distinguishable rather than silently mixed.
  record_hash     text NOT NULL,
  hash_convention text NOT NULL DEFAULT 'sha256-esig-record-v1',

  -- what the record actually was, in readable form, so an inspector does
  -- not have to reproduce a hash to see what was signed
  signed_state    text NOT NULL,
  definition_id   uuid REFERENCES public.lifecycle_definitions(id),

  signed_at      timestamptz NOT NULL DEFAULT now(),
  metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT electronic_signatures_meaning_vocab CHECK (meaning IN (
    'authored','reviewed','approved','rejected','verified','witnessed','released'
  )),
  CONSTRAINT electronic_signatures_action_not_blank CHECK (length(btrim(action)) > 0),
  CONSTRAINT electronic_signatures_hash_shape CHECK (record_hash ~ '^[0-9a-f]{64}$')
);

CREATE INDEX IF NOT EXISTS idx_electronic_signatures_company_signed_at
  ON public.electronic_signatures(company_id, signed_at DESC);
CREATE INDEX IF NOT EXISTS idx_electronic_signatures_entity
  ON public.electronic_signatures(company_id, entity_type, entity_id);


-- ── 2. Consumption, kept separate so signatures stay truly immutable ──
--  A signature is spent when a transition uses it. Recording that by
--  UPDATEing the signature would mean carving an exception into the
--  immutability rule, so it goes in its own table instead. The primary
--  key is what prevents a signature being replayed across two
--  transitions.
CREATE TABLE IF NOT EXISTS public.electronic_signature_consumptions (
  signature_id uuid PRIMARY KEY REFERENCES public.electronic_signatures(id) ON DELETE RESTRICT,
  history_id   uuid NOT NULL REFERENCES public.entity_state_history(id) ON DELETE RESTRICT,
  consumed_at  timestamptz NOT NULL DEFAULT now()
);


-- ── 3. Attempts, including the failures ──────────────────────────────
--  §11.300(d) wants attempted unauthorised use detected and reported. A
--  refusal that raises cannot record itself, which is why the RPC below
--  returns instead. This table is also what makes throttling possible.
CREATE TABLE IF NOT EXISTS public.electronic_signature_attempts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid,
  user_id      uuid,
  entity_type  text,
  entity_id    uuid,
  action       text,
  outcome      text NOT NULL,
  detail       text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_esig_attempts_user_time
  ON public.electronic_signature_attempts(user_id, created_at DESC);


-- ── 4. Privileges ────────────────────────────────────────────────────
--  The original revoked ALL from authenticated and then wrote a SELECT
--  policy, which cannot restore a revoked privilege — the listing page
--  could not read its own table. SELECT is granted; every write verb is
--  revoked, from service_role too. TRUNCATE is revoked explicitly
--  because it is not subject to RLS and does not fire row triggers.
ALTER TABLE public.electronic_signatures              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.electronic_signature_consumptions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.electronic_signature_attempts      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company members can view electronic signatures" ON public.electronic_signatures;
CREATE POLICY "Company members can view electronic signatures"
ON public.electronic_signatures FOR SELECT TO authenticated
USING (public.app_is_company_member(company_id));

DROP POLICY IF EXISTS "Company members can view signature attempts" ON public.electronic_signature_attempts;
CREATE POLICY "Company members can view signature attempts"
ON public.electronic_signature_attempts FOR SELECT TO authenticated
USING (company_id IS NOT NULL AND public.app_is_company_member(company_id));

DO $priv$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format(
        'REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.electronic_signatures,
           public.electronic_signature_consumptions, public.electronic_signature_attempts FROM %I', r);
    END IF;
  END LOOP;
  -- reads: the app needs them, the RLS policies scope them
  FOREACH r IN ARRAY ARRAY['authenticated','service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT SELECT ON public.electronic_signatures,
        public.electronic_signature_attempts TO %I', r);
    END IF;
  END LOOP;
END
$priv$;


-- ── 5. Immutability, including the statement-level verb ──────────────
CREATE OR REPLACE FUNCTION public.prevent_electronic_signature_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, extensions, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'ELECTRONIC_SIGNATURES_ARE_IMMUTABLE: % is not permitted', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

DROP TRIGGER IF EXISTS electronic_signatures_no_update   ON public.electronic_signatures;
DROP TRIGGER IF EXISTS electronic_signatures_no_delete   ON public.electronic_signatures;
DROP TRIGGER IF EXISTS electronic_signatures_no_truncate ON public.electronic_signatures;

CREATE TRIGGER electronic_signatures_no_update
  BEFORE UPDATE ON public.electronic_signatures
  FOR EACH ROW EXECUTE FUNCTION public.prevent_electronic_signature_mutation();
CREATE TRIGGER electronic_signatures_no_delete
  BEFORE DELETE ON public.electronic_signatures
  FOR EACH ROW EXECUTE FUNCTION public.prevent_electronic_signature_mutation();
-- the one the original was missing: TRUNCATE fires no row triggers
CREATE TRIGGER electronic_signatures_no_truncate
  BEFORE TRUNCATE ON public.electronic_signatures
  FOR EACH STATEMENT EXECUTE FUNCTION public.prevent_electronic_signature_mutation();


-- ── 6. The record hash (§11.70) ──────────────────────────────────────
--  Binds a signature to the exact state of the record it signed. Derived
--  only from the record, so it is reproducible from the record later —
--  which is the whole point. It deliberately excludes anything about the
--  signature itself.
CREATE OR REPLACE FUNCTION public.electronic_signature_record_hash(
  p_entity_type text, p_entity_id uuid, p_company_id uuid
) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $$
  SELECT encode(digest(
    concat_ws('|',
      'sha256-esig-record-v1',
      ecs.entity_type,
      ecs.entity_id::text,
      ecs.company_id::text,
      ecs.definition_id::text,
      s.state_key,
      ecs.updated_at::text),
    'sha256'), 'hex')
  FROM public.entity_current_state ecs
  JOIN public.lifecycle_states s ON s.id = ecs.state_id
  WHERE ecs.entity_type = p_entity_type
    AND ecs.entity_id   = p_entity_id
    AND ecs.company_id  = p_company_id;
$$;


-- ── 7. Signing ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sign_electronic_record(
  p_company_id  uuid,
  p_entity_type text,
  p_entity_id   uuid,
  p_action      text,
  p_meaning     text,
  p_password    text,
  p_reason      text DEFAULT NULL,
  p_metadata    jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_name     text;
  v_email    text;
  v_state    text;
  v_def      uuid;
  v_hash     text;
  v_fails    int;
  v_act      record;
  v_sig      public.electronic_signatures;
  v_prev     text := 'GENESIS';
  v_seq      bigint := 1;
  v_now      timestamptz := now();
  v_meta     jsonb;
  v_ahash    text;
BEGIN
  -- every refusal below records itself and RETURNS; see the header
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'E_SIGNATURE_NOT_AUTHENTICATED',
      'message', 'no authenticated user');
  END IF;

  -- ── throttle before doing any credential work ──────────────────────
  SELECT count(*) INTO v_fails
    FROM public.electronic_signature_attempts
   WHERE user_id = v_uid AND outcome <> 'signed'
     AND created_at > v_now - interval '15 minutes';
  IF v_fails >= 5 THEN
    INSERT INTO public.electronic_signature_attempts
      (company_id,user_id,entity_type,entity_id,action,outcome,detail)
    VALUES (p_company_id,v_uid,p_entity_type,p_entity_id,p_action,'throttled',
            v_fails||' failed attempts in 15 minutes');
    RETURN jsonb_build_object('ok', false, 'code', 'E_SIGNATURE_THROTTLED',
      'message', 'too many failed signing attempts; try again later');
  END IF;

  -- ── membership ─────────────────────────────────────────────────────
  IF p_company_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.company_members cm
     WHERE cm.company_id = p_company_id AND cm.user_id = v_uid AND cm.status = 'active') THEN
    INSERT INTO public.electronic_signature_attempts
      (company_id,user_id,entity_type,entity_id,action,outcome,detail)
    VALUES (p_company_id,v_uid,p_entity_type,p_entity_id,p_action,'company_denied',NULL);
    RETURN jsonb_build_object('ok', false, 'code', 'E_SIGNATURE_COMPANY_ACCESS_DENIED',
      'message', 'caller is not an active member of the named company');
  END IF;

  -- ── the record must exist IN THIS COMPANY (finding 4) ──────────────
  SELECT s.state_key, ecs.definition_id INTO v_state, v_def
    FROM public.entity_current_state ecs
    JOIN public.lifecycle_states s ON s.id = ecs.state_id
   WHERE ecs.entity_type = p_entity_type
     AND ecs.entity_id   = p_entity_id
     AND ecs.company_id  = p_company_id;

  IF v_state IS NULL THEN
    INSERT INTO public.electronic_signature_attempts
      (company_id,user_id,entity_type,entity_id,action,outcome,detail)
    VALUES (p_company_id,v_uid,p_entity_type,p_entity_id,p_action,'no_record',NULL);
    RETURN jsonb_build_object('ok', false, 'code', 'E_SIGNATURE_NO_RECORD',
      'message', 'no lifecycle-governed record with that id in this company');
  END IF;

  -- ── authorisation, delegated to the engine (finding 2) ─────────────
  --  An action is signable when the engine would permit it, or would
  --  permit it but for the signature requirement itself.
  SELECT * INTO v_act FROM public.lifecycle_available_actions(
           p_entity_type, p_entity_id, p_company_id)
   WHERE action_key = p_action;

  IF v_act IS NULL THEN
    INSERT INTO public.electronic_signature_attempts
      (company_id,user_id,entity_type,entity_id,action,outcome,detail)
    VALUES (p_company_id,v_uid,p_entity_type,p_entity_id,p_action,'no_such_action',NULL);
    RETURN jsonb_build_object('ok', false, 'code', 'E_SIGNATURE_ACTION_UNAVAILABLE',
      'message', format('action "%s" is not available from state "%s"', p_action, v_state));
  END IF;

  IF NOT v_act.is_permitted
     AND coalesce(v_act.blocked_reason,'') <> 'LIFECYCLE_SIGNATURE_UNSUPPORTED' THEN
    INSERT INTO public.electronic_signature_attempts
      (company_id,user_id,entity_type,entity_id,action,outcome,detail)
    VALUES (p_company_id,v_uid,p_entity_type,p_entity_id,p_action,'not_permitted',v_act.blocked_reason);
    RETURN jsonb_build_object('ok', false, 'code', 'E_SIGNATURE_NOT_PERMITTED',
      'message', format('caller may not perform "%s": %s', p_action, v_act.blocked_reason));
  END IF;

  -- ── the credential challenge (finding 1) ───────────────────────────
  --  §11.200(a)(1). Deliberately AFTER authorisation so a caller cannot
  --  use this as an oracle for which actions exist, and recorded either
  --  way so a wrong password is visible to the company.
  IF p_password IS NULL OR NOT public.verify_user_password(p_password) THEN
    INSERT INTO public.electronic_signature_attempts
      (company_id,user_id,entity_type,entity_id,action,outcome,detail)
    VALUES (p_company_id,v_uid,p_entity_type,p_entity_id,p_action,'bad_credential',NULL);
    RETURN jsonb_build_object('ok', false, 'code', 'E_SIGNATURE_BAD_CREDENTIAL',
      'message', 'the password did not match');
  END IF;

  -- ── identity, frozen now (finding 8) ───────────────────────────────
  SELECT coalesce(nullif(btrim(p.full_name),''), p.email), p.email
    INTO v_name, v_email
    FROM public.profiles p WHERE p.id = v_uid;
  v_name  := coalesce(v_name,  'unknown');
  SELECT coalesce(v_email, u.email) INTO v_email FROM auth.users u WHERE u.id = v_uid;

  -- ── the binding, computed here (finding 3) ─────────────────────────
  v_hash := public.electronic_signature_record_hash(p_entity_type, p_entity_id, p_company_id);

  INSERT INTO public.electronic_signatures (
    company_id, signer_id, signer_name, signer_email,
    entity_type, entity_id, action, meaning, reason,
    record_hash, signed_state, definition_id, metadata
  ) VALUES (
    p_company_id, v_uid, v_name, coalesce(v_email,'unknown'),
    btrim(p_entity_type), p_entity_id, btrim(p_action), p_meaning,
    nullif(btrim(coalesce(p_reason,'')),''),
    v_hash, v_state, v_def, coalesce(p_metadata,'{}'::jsonb)
  ) RETURNING * INTO v_sig;

  INSERT INTO public.electronic_signature_attempts
    (company_id,user_id,entity_type,entity_id,action,outcome,detail)
  VALUES (p_company_id,v_uid,p_entity_type,p_entity_id,p_action,'signed',v_sig.id::text);

  -- ── the audit row, INSIDE the chain this time (finding 5) ──────────
  PERFORM pg_advisory_xact_lock(hashtext('esig_audit'), hashtext(p_company_id::text));
  SELECT integrity_hash, sequence_number INTO v_prev, v_seq
    FROM public.audit_logs
   WHERE company_id = p_company_id AND integrity_hash IS NOT NULL
   ORDER BY sequence_number DESC LIMIT 1;
  v_prev := coalesce(v_prev,'GENESIS');
  v_seq  := coalesce(v_seq,0) + 1;

  v_meta := coalesce(p_metadata,'{}'::jsonb) || jsonb_build_object(
    'signature_id', v_sig.id, 'signed_action', v_sig.action,
    'meaning', v_sig.meaning, 'reason', v_sig.reason,
    'record_hash', v_sig.record_hash, 'signed_state', v_sig.signed_state,
    'signer_name', v_sig.signer_name,
    'audit_hash_convention', 'sha256-sql-v1');

  v_ahash := encode(digest(concat_ws('|',
      'electronic_signature', p_entity_type, p_entity_id::text, v_uid::text,
      v_meta::text, v_now::text, v_prev, v_seq::text), 'sha256'), 'hex');

  INSERT INTO public.audit_logs
    (user_id, action, entity_type, entity_id, metadata, created_at,
     integrity_hash, previous_hash, company_id, sequence_number)
  VALUES
    (v_uid, 'electronic_signature', p_entity_type, p_entity_id, v_meta, v_now,
     v_ahash, v_prev, p_company_id, v_seq);

  RETURN jsonb_build_object('ok', true, 'signature_id', v_sig.id,
    'signer_name', v_sig.signer_name, 'record_hash', v_sig.record_hash,
    'signed_state', v_sig.signed_state, 'signed_at', v_sig.signed_at);
END;
$$;

COMMENT ON FUNCTION public.sign_electronic_record(uuid,text,uuid,text,text,text,text,jsonb) IS
  'Creates an electronic signature. Signer is auth.uid(); authorisation is delegated to lifecycle_available_actions(); the password is re-verified at signing; the record hash is computed server-side. Refusals are RETURNED and recorded, never raised.';

REVOKE ALL ON FUNCTION public.sign_electronic_record(uuid,text,uuid,text,text,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sign_electronic_record(uuid,text,uuid,text,text,text,text,jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.electronic_signature_record_hash(text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.electronic_signature_record_hash(text,uuid,uuid) TO authenticated, service_role;

-- The handoff version of this function took p_evidence_hash and no
-- password. It must not survive alongside the new one: PostgreSQL would
-- keep both as overloads, and a caller could reach the unauthenticated
-- path simply by passing the old argument shape.
DO $drop_old$
DECLARE v_oid oid;
BEGIN
  SELECT p.oid INTO v_oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='sign_electronic_record'
     AND pg_get_function_arguments(p.oid) LIKE '%p_evidence_hash%';
  IF v_oid IS NOT NULL THEN
    EXECUTE 'DROP FUNCTION ' || v_oid::regprocedure;
  END IF;
END
$drop_old$;


-- ── 8. Wire it into the engine (finding 10) ──────────────────────────
--  requires_signature stops meaning "refuse" and starts meaning
--  "require". A transition that needs a signature now demands one that
--  belongs to this caller, this record, this action, is unspent, and
--  whose record hash still matches — so a signature cannot be reused,
--  transferred, or applied to a record that changed after signing.
CREATE OR REPLACE FUNCTION public.lifecycle_consume_signature(
  p_signature_id uuid, p_entity_type text, p_entity_id uuid,
  p_company_id uuid, p_action_key text, p_actor uuid
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $$
DECLARE v_sig public.electronic_signatures; v_hash text;
BEGIN
  IF p_signature_id IS NULL THEN
    RETURN 'LIFECYCLE_SIGNATURE_REQUIRED: this action requires an electronic signature';
  END IF;

  SELECT * INTO v_sig FROM public.electronic_signatures WHERE id = p_signature_id;
  IF v_sig.id IS NULL THEN
    RETURN 'LIFECYCLE_SIGNATURE_INVALID: no such signature';
  END IF;
  IF v_sig.signer_id  IS DISTINCT FROM p_actor
     OR v_sig.company_id  IS DISTINCT FROM p_company_id
     OR v_sig.entity_type IS DISTINCT FROM p_entity_type
     OR v_sig.entity_id   IS DISTINCT FROM p_entity_id
     OR v_sig.action      IS DISTINCT FROM p_action_key THEN
    RETURN 'LIFECYCLE_SIGNATURE_MISMATCH: the signature does not match this action';
  END IF;
  IF EXISTS (SELECT 1 FROM public.electronic_signature_consumptions
              WHERE signature_id = p_signature_id) THEN
    RETURN 'LIFECYCLE_SIGNATURE_SPENT: that signature has already been used';
  END IF;

  v_hash := public.electronic_signature_record_hash(p_entity_type, p_entity_id, p_company_id);
  IF v_hash IS DISTINCT FROM v_sig.record_hash THEN
    RETURN 'LIFECYCLE_SIGNATURE_STALE: the record changed after it was signed';
  END IF;

  RETURN NULL;   -- accepted
END;
$$;

REVOKE ALL ON FUNCTION public.lifecycle_consume_signature(uuid,text,uuid,uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lifecycle_consume_signature(uuid,text,uuid,uuid,text,uuid) TO service_role;

-- available_actions: a signature requirement is no longer a blocker, it
-- is a condition the caller can satisfy. Reported so the UI can prompt.
CREATE OR REPLACE FUNCTION public.lifecycle_available_actions(
  p_entity_type text,
  p_entity_id   uuid,
  p_company_id  uuid
) RETURNS TABLE (
  action_key text, label text, to_state_key text, sort_order integer,
  required_role text, required_permission text,
  requires_comment boolean, requires_signature boolean,
  is_permitted boolean, blocked_reason text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH caller AS (
    SELECT public.app_is_service_context() AS is_service,
           public.lifecycle_actor_role(auth.uid()) AS role
  ), rows AS (
    SELECT t.action_key, t.label, ts.state_key AS to_state_key, t.sort_order,
           t.required_role, t.required_permission,
           t.requires_comment, t.requires_signature,
           CASE
             WHEN cur.is_locked                      THEN 'LIFECYCLE_STATE_LOCKED'
             WHEN cur.is_terminal                    THEN 'LIFECYCLE_STATE_TERMINAL'
             WHEN t.required_permission IS NOT NULL  THEN 'LIFECYCLE_PERMISSION_UNSUPPORTED'
             WHEN t.required_role IS NOT NULL
              AND NOT c.is_service
              AND (c.role IS NULL
                   OR NOT (c.role = ANY (ARRAY(SELECT btrim(x)
                                                 FROM unnest(string_to_array(t.required_role, ',')) AS x
                                                WHERE btrim(x) <> ''))))
                                                     THEN 'LIFECYCLE_ROLE_REQUIRED'
             ELSE NULL
           END AS blocked_reason
    FROM public.entity_current_state ecs
    JOIN public.lifecycle_states cur ON cur.id = ecs.state_id
    CROSS JOIN caller c
    JOIN public.lifecycle_transitions t
      ON t.definition_id = ecs.definition_id AND t.from_state_id = ecs.state_id
    JOIN public.lifecycle_states ts ON ts.id = t.to_state_id
    WHERE ecs.entity_id = p_entity_id
      AND ecs.entity_type = p_entity_type
      AND ecs.company_id = p_company_id
      AND public.app_is_company_member(ecs.company_id)
  )
  SELECT action_key, label, to_state_key, sort_order,
         required_role, required_permission, requires_comment, requires_signature,
         blocked_reason IS NULL AS is_permitted, blocked_reason
  FROM rows
  ORDER BY sort_order, action_key;
$$;


-- ── 9. lifecycle_transition now consumes a signature ─────────────────
--  The new p_signature_id parameter is added LAST and defaults to NULL,
--  so every existing call site is unaffected. The 7-argument version has
--  to be DROPPED rather than replaced: CREATE OR REPLACE only replaces a
--  function with the identical argument list, so leaving it would create
--  an overload — the old refusing version would stay reachable, and a
--  7-argument call would become ambiguous. Its grants are restored
--  below, unchanged from what it had.
DROP FUNCTION IF EXISTS public.lifecycle_transition(text,uuid,text,uuid,uuid,text,jsonb);

CREATE OR REPLACE FUNCTION public.lifecycle_transition(p_entity_type text, p_entity_id uuid, p_action_key text, p_company_id uuid, p_actor_id uuid DEFAULT auth.uid(), p_comment text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb,
 p_signature_id uuid DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_service boolean := public.app_is_service_context();
  v_uid     uuid    := auth.uid();
  v_actor   uuid;
  v_def uuid; v_company uuid;
  v_cur_state uuid; v_cur_key text;
  v_cur_locked boolean; v_cur_terminal boolean;
  v_tr record; v_hist uuid;
  v_required text[]; v_role text;
  v_sig_err text;
BEGIN
  -- ── actor ──────────────────────────────────────────────────────────
  IF v_service THEN
    v_actor := coalesce(p_actor_id, v_uid);
  ELSE
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'LIFECYCLE_NOT_AUTHENTICATED: no authenticated user'
        USING ERRCODE = 'P0001';
    END IF;
    IF p_actor_id IS NOT NULL AND p_actor_id <> v_uid THEN
      RAISE EXCEPTION 'LIFECYCLE_ACTOR_MISMATCH: a transition cannot be attributed to another user'
        USING ERRCODE = 'P0001';
    END IF;
    v_actor := v_uid;
  END IF;

  -- ── tenancy, before anything is read ───────────────────────────────
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'LIFECYCLE_FORBIDDEN: a company is required' USING ERRCODE = 'P0001';
  END IF;
  IF NOT v_service AND NOT public.app_is_company_member(p_company_id, v_actor) THEN
    RAISE EXCEPTION 'LIFECYCLE_FORBIDDEN: caller is not a member of the named company'
      USING ERRCODE = 'P0001';
  END IF;

  v_def := public.lifecycle_resolve_definition(p_entity_type, p_company_id);
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'LIFECYCLE_NO_DEFINITION: no active lifecycle definition for entity type "%"', p_entity_type
      USING ERRCODE = 'P0002';
  END IF;

  SELECT ecs.state_id, s.state_key, ecs.company_id, s.is_locked, s.is_terminal
    INTO v_cur_state, v_cur_key, v_company, v_cur_locked, v_cur_terminal
  FROM public.entity_current_state ecs
  JOIN public.lifecycle_states s ON s.id = ecs.state_id
  WHERE ecs.definition_id = v_def AND ecs.entity_id = p_entity_id
  FOR UPDATE OF ecs;

  IF v_cur_state IS NULL THEN
    RAISE EXCEPTION 'LIFECYCLE_NOT_INITIALIZED: entity % has no current state in the lifecycle for "%"', p_entity_id, p_entity_type
      USING ERRCODE = 'P0002';
  END IF;

  IF v_company IS DISTINCT FROM p_company_id THEN
    RAISE EXCEPTION 'LIFECYCLE_COMPANY_MISMATCH: entity % does not belong to the named company', p_entity_id
      USING ERRCODE = 'P0001';
  END IF;

  -- ── state gates (Finding C) ────────────────────────────────────────
  -- Checked against the state the entity is IN, before the action is
  -- resolved, so the caller is told the real reason. No write has
  -- happened yet, so raising here leaves state and history untouched.
  IF v_cur_locked THEN
    RAISE EXCEPTION 'LIFECYCLE_STATE_LOCKED: state "%" is locked; the record cannot be changed while it is in this state', v_cur_key
      USING ERRCODE = 'P0001';
  END IF;

  IF v_cur_terminal THEN
    RAISE EXCEPTION 'LIFECYCLE_STATE_TERMINAL: state "%" is terminal; no further transitions are possible', v_cur_key
      USING ERRCODE = 'P0001';
  END IF;

  SELECT t.id, t.to_state_id, ts.state_key AS to_key,
         t.required_role, t.required_permission, t.requires_comment, t.requires_signature
    INTO v_tr
  FROM public.lifecycle_transitions t
  JOIN public.lifecycle_states ts ON ts.id = t.to_state_id
  WHERE t.definition_id = v_def
    AND t.from_state_id = v_cur_state
    AND t.action_key    = p_action_key;

  IF v_tr.id IS NULL THEN
    RAISE EXCEPTION 'LIFECYCLE_INVALID_TRANSITION: action "%" is not available from state "%" for entity type "%"',
      p_action_key, v_cur_key, p_entity_type
      USING ERRCODE = 'P0001';
  END IF;

  -- ── requirements ───────────────────────────────────────────────────
  IF v_tr.required_permission IS NOT NULL THEN
    RAISE EXCEPTION 'LIFECYCLE_PERMISSION_UNSUPPORTED: action "%" declares required_permission "%", but no workflow permission vocabulary is defined yet',
      p_action_key, v_tr.required_permission
      USING ERRCODE = 'P0001';
  END IF;

  -- 20260917000000: requires_signature now REQUIRES rather than refuses.
  -- The signature must belong to this caller, this record and this
  -- action, be unspent, and still match the record's current hash.
  IF v_tr.requires_signature THEN
    v_sig_err := public.lifecycle_consume_signature(
                   p_signature_id, p_entity_type, p_entity_id,
                   v_company, p_action_key, v_actor);
    IF v_sig_err IS NOT NULL THEN
      RAISE EXCEPTION '%', v_sig_err USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF v_tr.requires_comment AND coalesce(btrim(p_comment), '') = '' THEN
    RAISE EXCEPTION 'LIFECYCLE_COMMENT_REQUIRED: action "%" requires a comment', p_action_key
      USING ERRCODE = 'P0001';
  END IF;

  IF v_tr.required_role IS NOT NULL AND NOT v_service THEN
    v_required := ARRAY(SELECT btrim(x)
                          FROM unnest(string_to_array(v_tr.required_role, ',')) AS x
                         WHERE btrim(x) <> '');
    v_role := public.lifecycle_actor_role(v_actor);
    IF v_role IS NULL OR NOT (v_role = ANY (v_required)) THEN
      RAISE EXCEPTION 'LIFECYCLE_ROLE_REQUIRED: action "%" requires role %, caller has %',
        p_action_key, array_to_string(v_required, ' or '), coalesce(v_role, 'no role')
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- ── write ──────────────────────────────────────────────────────────
  UPDATE public.entity_current_state
     SET state_id = v_tr.to_state_id, entered_at = now(), entered_by = v_actor, updated_at = now()
   WHERE definition_id = v_def AND entity_id = p_entity_id;

  INSERT INTO public.entity_state_history
    (company_id, definition_id, entity_type, entity_id, from_state_id, to_state_id, transition_id, actor_id, comment, metadata)
  VALUES (v_company, v_def, p_entity_type, p_entity_id, v_cur_state, v_tr.to_state_id, v_tr.id, v_actor,
          p_comment, coalesce(p_metadata, '{}'::jsonb))
  RETURNING id INTO v_hist;

  IF v_tr.requires_signature THEN
    INSERT INTO public.electronic_signature_consumptions (signature_id, history_id)
    VALUES (p_signature_id, v_hist);
  END IF;

  RETURN jsonb_build_object(
    'definition_id', v_def,
    'from_state',    v_cur_key,
    'to_state',      v_tr.to_key,
    'transition_id', v_tr.id,
    'history_id',    v_hist,
    'actor_id',      v_actor
  );
END
$function$;

COMMENT ON FUNCTION public.lifecycle_transition(text,uuid,text,uuid,uuid,text,jsonb,uuid) IS
  'Authoritative transition. Enforces tenancy, actor identity, locked/terminal state and the transition requirements. A transition whose definition sets requires_signature now demands a matching, unspent electronic signature whose record hash still matches.';

REVOKE ALL ON FUNCTION public.lifecycle_transition(text,uuid,text,uuid,uuid,text,jsonb,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lifecycle_transition(text,uuid,text,uuid,uuid,text,jsonb,uuid) TO authenticated, service_role;
