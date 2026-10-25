-- =====================================================================
--  SIGNING A ROLE ASSIGNMENT
--
--  20261119000000 required a reason, an assigner and a timestamp for
--  every operational role. For the roles that carry a quality
--  authority that is not enough: appointing a QA Manager is the act
--  that decides who may release batches, and it should be signed by
--  the same mechanism that signs the release.
--
--  Three things make this a signature rather than a checkbox:
--
--    1. It is minted by password, through the same throttled path as
--       every other electronic signature in this schema. There is no
--       second way to produce one.
--    2. It is bound to the EXACT action — this company, this person,
--       this role, granting or revoking, and for a revocation this
--       assignment. A signature for granting Ngozi qa_manager cannot
--       be replayed to grant anybody else anything.
--    3. It is single-use, by unique index, and it is recorded on the
--       row it authorised, so the evidence and the act cannot drift
--       apart.
--
--  WHICH ROLES. Not every role, and the subset is derived rather than
--  chosen: a role requires a signature when PM-03 names it in
--  step_permissions — i.e. when it carries one of the five
--  authorities the design singled out as needing step-level
--  permission. That is qa_manager, qa_officer and compliance_admin.
--  Section 1 asserts the derivation and fails the migration if a
--  seeded role is not one PM-03 names.
-- =====================================================================

-- ── 1. Which roles carry an authority worth signing for ─────────────

CREATE TABLE IF NOT EXISTS public.gmp_critical_roles (
  role       text PRIMARY KEY,
  --  WHY this role is on the list, in words, so the next person does
  --  not have to reconstruct the derivation from the seed.
  basis      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gmp_critical_role_is_one_of_the_eight
    CHECK (role = ANY (public.app_operational_roles()))
);

COMMENT ON TABLE public.gmp_critical_roles IS
  'Operational roles whose grant and revocation require an electronic signature. Derived from step_permissions: these are the roles PM-03 gives one of its five protected steps.';

INSERT INTO public.gmp_critical_roles (role, basis) VALUES
  ('qa_manager',
   'PM-03 gives it batch_release, material_disposition, deviation_close and supplier_approve'),
  ('qa_officer',
   'PM-03 gives it material_disposition and deviation_close'),
  ('compliance_admin',
   'PM-03 gives it roles_change, so it can appoint the other two')
ON CONFLICT (role) DO UPDATE SET basis = EXCLUDED.basis;

DO $assert$
DECLARE v_bad text;
BEGIN
  --  DERIVED, NOT CHOSEN. A role on this list that PM-03 gives no
  --  protected step would be a rule invented here, and this migration
  --  is not where quality rules get invented.
  SELECT string_agg(g.role, ', ') INTO v_bad
    FROM public.gmp_critical_roles g
   WHERE NOT EXISTS (SELECT 1 FROM public.step_permissions sp
                      WHERE g.role = ANY (sp.roles));
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION
      'GMP_CRITICAL_NOT_DERIVED: % holds no protected step in PM-03, so requiring a signature for it is a rule this migration invented',
      v_bad;
  END IF;

  --  And the other direction: a role PM-03 trusts with a protected
  --  step and that is NOT on this list is a gap, not a decision.
  --  Reported rather than fatal, because adding one is the quality
  --  system's call and not this file's.
  SELECT string_agg(DISTINCT r, ', ') INTO v_bad
    FROM public.step_permissions sp, unnest(sp.roles) r
   WHERE NOT EXISTS (SELECT 1 FROM public.gmp_critical_roles g WHERE g.role = r);
  IF v_bad IS NOT NULL THEN
    RAISE NOTICE
      'GMP_CRITICAL_INCOMPLETE: % hold a protected step but need no signature to be granted', v_bad;
  END IF;
END;
$assert$;


CREATE OR REPLACE FUNCTION public.operational_role_needs_signature(p_role text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM public.gmp_critical_roles WHERE role = p_role);
$$;

GRANT EXECUTE ON FUNCTION public.operational_role_needs_signature(text)
  TO authenticated, service_role;


-- ── 2. The hash the signature is taken over ─────────────────────────
--
-- NOT a record hash, because at grant time there is no record yet —
-- the signature has to exist before the row it authorises. So it is an
-- ACTION hash: every field that makes the action what it is.
--
-- p_assignment_id is NULL for a grant and the assignment for a
-- revocation, which is what stops a revocation signature authorising
-- a different revocation.

CREATE OR REPLACE FUNCTION public.operational_role_action_hash(
  p_company_id    uuid,
  p_user_id       uuid,
  p_role          text,
  p_action        text,
  p_assignment_id uuid DEFAULT NULL
) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public, extensions, pg_temp
AS $$
  SELECT encode(extensions.digest(
    concat_ws('|',
      'sha256-roleassign-action-v1',
      p_company_id::text, p_user_id::text, p_role, p_action,
      coalesce(p_assignment_id::text, '')),
    'sha256'), 'hex');
$$;

COMMENT ON FUNCTION public.operational_role_action_hash(uuid, uuid, text, text, uuid) IS
  'The hash an operational-role signature is taken over: company, person, role, action, and the assignment for a revocation. Binds a signature to one action and no other.';

GRANT EXECUTE ON FUNCTION public.operational_role_action_hash(uuid, uuid, text, text, uuid)
  TO authenticated, service_role;


-- ── 3. Minting one ──────────────────────────────────────────────────
--
-- The same shape as product_specification_sign, and for the same
-- reason it is not sign_electronic_record: that function requires the
-- entity to exist in the lifecycle catalogue, and a role assignment
-- is not a lifecycle entity. Nothing here is weaker — the password,
-- the throttle, the attempt log and the immutable signature row are
-- the same machinery.

CREATE OR REPLACE FUNCTION public.operational_role_sign(
  p_company_id    uuid,
  p_user_id       uuid,
  p_role          text,
  p_action        text,
  p_password      text,
  p_assignment_id uuid DEFAULT NULL,
  p_reason        text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_name text; v_email text; v_hash text; v_sig uuid; v_fails int;
  v_entity_type text; v_entity_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'E_SIGNATURE_NO_USER',
      'message', 'no authenticated user to sign as');
  END IF;

  IF p_action NOT IN ('grant', 'revoke') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'E_SIGNATURE_BAD_ACTION',
      'message', 'an operational role is granted or revoked, nothing else');
  END IF;

  IF NOT (p_role = ANY (public.app_operational_roles())) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'E_SIGNATURE_BAD_ROLE',
      'message', 'not one of the eight operational roles');
  END IF;

  IF p_action = 'revoke' AND p_assignment_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'E_SIGNATURE_NO_RECORD',
      'message', 'a revocation signature names the assignment it ends');
  END IF;

  --  Two entity types rather than one, so that entity_id is a real
  --  reference in both cases: the person being appointed, or the
  --  assignment being ended.
  v_entity_type := CASE p_action
                     WHEN 'grant' THEN 'operational_role_grant'
                     ELSE 'operational_role_revocation' END;
  v_entity_id   := CASE p_action WHEN 'grant' THEN p_user_id ELSE p_assignment_id END;

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
    VALUES (p_company_id,v_uid,v_entity_type,v_entity_id,p_action,'bad_password',NULL);
    RETURN jsonb_build_object('ok', false, 'code', 'E_SIGNATURE_BAD_PASSWORD',
      'message', 'that password is not correct');
  END IF;

  SELECT full_name, email INTO v_name, v_email FROM public.profiles WHERE id = v_uid;
  v_hash := public.operational_role_action_hash(
              p_company_id, p_user_id, p_role, p_action, p_assignment_id);

  INSERT INTO public.electronic_signatures (
    company_id, signer_id, signer_name, signer_email,
    entity_type, entity_id, action, meaning, reason, record_hash, signed_state, metadata
  ) VALUES (
    p_company_id, v_uid, coalesce(v_name,'Unknown'), coalesce(v_email,'unknown'),
    v_entity_type, v_entity_id, p_action,
    --  'approved', for both. electronic_signatures.meaning carries a
    --  fixed Part 11 vocabulary — authored, reviewed, approved,
    --  rejected, verified, witnessed, released — and the meaning of
    --  signing here really is approval: of the appointment, or of the
    --  withdrawal. Widening that vocabulary to add 'granted' would
    --  change an existing signing control to say something `action`
    --  already says, so it is left alone and `action` carries the
    --  distinction.
    'approved',
    nullif(btrim(coalesce(p_reason,'')),''), v_hash, p_role,
    jsonb_build_object('role', p_role, 'target_user', p_user_id,
                       'assignment_id', p_assignment_id)
  ) RETURNING id INTO v_sig;

  INSERT INTO public.electronic_signature_attempts
    (company_id,user_id,entity_type,entity_id,action,outcome,detail)
  VALUES (p_company_id,v_uid,v_entity_type,v_entity_id,p_action,'signed',v_sig::text);

  RETURN jsonb_build_object('ok', true, 'signature_id', v_sig);
END;
$$;

REVOKE ALL ON FUNCTION public.operational_role_sign(uuid,uuid,text,text,text,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.operational_role_sign(uuid,uuid,text,text,text,uuid,text)
  TO authenticated, service_role;


-- ── 4. Verifying one ────────────────────────────────────────────────

ALTER TABLE public.operational_role_assignments
  ADD COLUMN IF NOT EXISTS grant_signature_id  uuid REFERENCES public.electronic_signatures(id),
  ADD COLUMN IF NOT EXISTS revoke_signature_id uuid REFERENCES public.electronic_signatures(id),
  --  How this assignment came to exist. 'rpc' is the ordinary path;
  --  the other two are recorded because they are the paths that did
  --  NOT carry a countersigning second person, and a report that
  --  cannot tell them apart is a report that hides them.
  ADD COLUMN IF NOT EXISTS provenance text NOT NULL DEFAULT 'rpc'
    CHECK (provenance IN ('rpc', 'service', 'bootstrap_self_declared')),
  ADD COLUMN IF NOT EXISTS declaration text;

--  SINGLE USE. By unique index rather than a consumption flag: a flag
--  can be reset and an index cannot.
CREATE UNIQUE INDEX IF NOT EXISTS operational_role_grant_signature_uniq
  ON public.operational_role_assignments (grant_signature_id)
  WHERE grant_signature_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS operational_role_revoke_signature_uniq
  ON public.operational_role_assignments (revoke_signature_id)
  WHERE revoke_signature_id IS NOT NULL;


CREATE OR REPLACE FUNCTION public.operational_role_signature_error(
  p_signature_id  uuid,
  p_company_id    uuid,
  p_user_id       uuid,
  p_role          text,
  p_action        text,
  p_assignment_id uuid,
  p_actor         uuid
) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_sig public.electronic_signatures; v_hash text;
BEGIN
  IF p_signature_id IS NULL THEN
    RETURN format(
      'OPERATIONAL_ROLE_SIGNATURE_REQUIRED: %sing %s requires an electronic signature',
      p_action, p_role);
  END IF;

  SELECT * INTO v_sig FROM public.electronic_signatures WHERE id = p_signature_id;
  IF v_sig.id IS NULL THEN
    RETURN 'OPERATIONAL_ROLE_SIGNATURE_INVALID: no such signature';
  END IF;

  --  BOUND TO THE SIGNER. A signature somebody else minted does not
  --  authorise this caller's action, however valid it is in itself.
  IF v_sig.signer_id IS DISTINCT FROM p_actor
     OR v_sig.company_id IS DISTINCT FROM p_company_id
     OR v_sig.action IS DISTINCT FROM p_action THEN
    RETURN 'OPERATIONAL_ROLE_SIGNATURE_MISMATCH: that signature does not match this action';
  END IF;

  --  AND TO THE TARGET. The hash carries company, person, role, action
  --  and assignment, so a signature for appointing one person cannot
  --  be replayed to appoint another.
  v_hash := public.operational_role_action_hash(
              p_company_id, p_user_id, p_role, p_action, p_assignment_id);
  IF v_sig.record_hash IS DISTINCT FROM v_hash THEN
    RETURN 'OPERATIONAL_ROLE_SIGNATURE_MISMATCH: that signature was taken over a different appointment';
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.operational_role_signature_error(uuid,uuid,uuid,text,text,uuid,uuid)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.operational_role_signature_error(uuid,uuid,uuid,text,text,uuid,uuid)
  TO authenticated, service_role;


-- ── 5. The trigger requires it ──────────────────────────────────────
--
-- Replaces 20261119000000's function. Everything that was there is
-- still there, in the same order and for the same reasons; the
-- signature clauses are added after the authority clauses, so a caller
-- with no authority is told that first rather than being asked to sign
-- something they could not do anyway.

CREATE OR REPLACE FUNCTION public.fn_operational_role_authority()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_row   public.operational_role_assignments;
  v_err   text;
BEGIN
  v_row := CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;

  --  ── INTEGRITY FIRST, AND IT BINDS SERVICE CONTEXTS TOO ──
  --
  --  These are not authority rules. Who may grant a role is a question
  --  about a person, and a migration is not a person; but what an
  --  assignment row MEANS is the same question whoever is asking, and
  --  a scheduler that can re-stamp a revocation's timestamp can move
  --  the date somebody lost an authority.
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.company_id, NEW.user_id, NEW.role, NEW.reason, NEW.assigned_by, NEW.assigned_at,
        NEW.grant_signature_id, NEW.provenance, NEW.declaration)
       IS DISTINCT FROM
       (OLD.company_id, OLD.user_id, OLD.role, OLD.reason, OLD.assigned_by, OLD.assigned_at,
        OLD.grant_signature_id, OLD.provenance, OLD.declaration)
    THEN
      RAISE EXCEPTION
        'OPERATIONAL_ROLE_IMMUTABLE: an assignment''s grant may not be edited; revoke it and make a new one'
        USING ERRCODE = 'P0001';
    END IF;

    IF OLD.revoked_at IS NOT NULL THEN
      RAISE EXCEPTION 'OPERATIONAL_ROLE_IMMUTABLE: this assignment is already revoked'
        USING ERRCODE = 'P0001';
    END IF;

    IF NEW.revoked_at IS NULL THEN
      RAISE EXCEPTION
        'OPERATIONAL_ROLE_IMMUTABLE: the only change an assignment accepts is its revocation'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF public.app_is_service_context() THEN
    IF TG_OP = 'INSERT' THEN
      --  MARKED, NOT WAVED THROUGH. A service context has no password
      --  and no second person, so it cannot sign; what it can do is
      --  leave a mark that says so, which
      --  operational_role_unsigned_grants() reports on.
      NEW.provenance := 'service';
      NEW.grant_signature_id := NULL;
      RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' THEN
      NEW.revoked_at := now();
      RETURN NEW;
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION
      'OPERATIONAL_ROLE_IMMUTABLE: an assignment is revoked, never deleted'
      USING ERRCODE = 'P0001',
            HINT = 'Call operational_role_revoke, which records who ended it and why.';
  END IF;

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'OPERATIONAL_ROLE_FORBIDDEN: no authenticated caller'
      USING ERRCODE = 'P0001';
  END IF;

  --  Standing down from your own role needs no authority over roles.
  --  Everything else does.
  IF NOT (TG_OP = 'UPDATE' AND NEW.user_id = v_actor AND NEW.revoked_at IS NOT NULL)
     AND NOT public.app_may_assign_operational_roles(v_row.company_id, v_actor) THEN
    RAISE EXCEPTION
      'OPERATIONAL_ROLE_FORBIDDEN: assigning operational roles is reserved to a workspace owner or admin, or to a compliance admin'
      USING ERRCODE = 'P0001',
            HINT = 'Being able to administer the workspace is not itself an operational role.';
  END IF;

  --  SELF-ASSIGNMENT IS THE FAILURE THIS CONTROL EXISTS FOR.
  --  Bootstrap is the one documented exception and it arrives with
  --  provenance already set by operational_role_bootstrap, which does
  --  its own, narrower, checking. It is not a general exception: the
  --  function refuses unless nobody else could have done it.
  IF TG_OP = 'INSERT' AND NEW.user_id = v_actor
     AND NEW.provenance IS DISTINCT FROM 'bootstrap_self_declared' THEN
    RAISE EXCEPTION
      'OPERATIONAL_ROLE_SELF: you may not grant yourself an operational role'
      USING ERRCODE = 'P0001',
            HINT = 'Another owner, admin or compliance admin must do it.';
  END IF;

  IF TG_OP = 'INSERT' THEN
    --  Who granted it is recorded by the server, not offered by the
    --  caller.
    NEW.assigned_by := v_actor;
    NEW.assigned_at := now();
    NEW.revoked_at  := NULL;
    NEW.revoked_by  := NULL;
    NEW.revoke_reason := NULL;
    IF NEW.provenance IS DISTINCT FROM 'bootstrap_self_declared' THEN
      NEW.provenance := 'rpc';
    END IF;

    IF public.operational_role_needs_signature(NEW.role) THEN
      v_err := public.operational_role_signature_error(
                 NEW.grant_signature_id, NEW.company_id, NEW.user_id,
                 NEW.role, 'grant', NULL, v_actor);
      IF v_err IS NOT NULL THEN
        RAISE EXCEPTION '%', v_err USING ERRCODE = 'P0001';
      END IF;
    ELSE
      --  A signature offered for a role that does not need one is
      --  discarded rather than stored, so the column means exactly one
      --  thing: this grant was signed for, and it had to be.
      NEW.grant_signature_id := NULL;
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF public.operational_role_needs_signature(NEW.role) THEN
      v_err := public.operational_role_signature_error(
                 NEW.revoke_signature_id, NEW.company_id, NEW.user_id,
                 NEW.role, 'revoke', NEW.id, v_actor);
      IF v_err IS NOT NULL THEN
        RAISE EXCEPTION '%', v_err USING ERRCODE = 'P0001';
      END IF;
    ELSE
      NEW.revoke_signature_id := NULL;
    END IF;

    NEW.revoked_by := v_actor;
    NEW.revoked_at := now();
  END IF;

  RETURN NEW;
END;
$$;


-- ── 6. The RPCs carry the signature ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.operational_role_assign(
  p_company_id   uuid,
  p_user_id      uuid,
  p_role         text,
  p_reason       text,
  p_signature_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_id uuid; v_actor uuid := auth.uid();
BEGIN
  IF NOT (p_role = ANY (public.app_operational_roles())) THEN
    RAISE EXCEPTION 'OPERATIONAL_ROLE_UNKNOWN: % is not one of PM-03''s eight roles', p_role
      USING ERRCODE = 'P0001',
            HINT = 'One of: ' || array_to_string(public.app_operational_roles(), ', ');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.company_members cm
                  WHERE cm.company_id = p_company_id AND cm.user_id = p_user_id
                    AND coalesce(cm.status::text, 'active') = 'active') THEN
    RAISE EXCEPTION
      'OPERATIONAL_ROLE_NOT_A_MEMBER: that person is not an active member of this company'
      USING ERRCODE = 'P0001';
  END IF;

  --  The authority, self-assignment and signature checks are the
  --  trigger's, so that a direct INSERT meets exactly the same
  --  refusals.
  INSERT INTO public.operational_role_assignments
    (company_id, user_id, role, reason, assigned_by, grant_signature_id)
  VALUES (p_company_id, p_user_id, p_role, p_reason, v_actor, p_signature_id)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.operational_role_assign(uuid, uuid, text, text, uuid) IS
  'Grants an operational role. Refuses an unknown role, a non-member, a caller without authority, the caller themselves, and — for a GMP-critical role — a missing or mismatched signature.';

REVOKE ALL ON FUNCTION public.operational_role_assign(uuid,uuid,text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.operational_role_assign(uuid,uuid,text,text,uuid)
  TO authenticated, service_role;

--  The 4-argument form is DROPPED rather than left beside the new one.
--  Leaving it would leave a callable path that takes no signature, and
--  the whole point of this migration is that no such path exists.
DROP FUNCTION IF EXISTS public.operational_role_assign(uuid, uuid, text, text);


CREATE OR REPLACE FUNCTION public.operational_role_revoke(
  p_assignment_id uuid,
  p_reason        text,
  p_signature_id  uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_actor uuid := auth.uid(); v_found boolean;
BEGIN
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'OPERATIONAL_ROLE_REASON_REQUIRED: say why the role is being withdrawn'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.operational_role_assignments
     SET revoked_at = now(), revoked_by = v_actor, revoke_reason = p_reason,
         revoke_signature_id = p_signature_id
   WHERE id = p_assignment_id
   RETURNING true INTO v_found;

  IF NOT coalesce(v_found, false) THEN
    RAISE EXCEPTION 'OPERATIONAL_ROLE_NOT_FOUND: no assignment %', p_assignment_id
      USING ERRCODE = 'P0001';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.operational_role_revoke(uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.operational_role_revoke(uuid,text,uuid)
  TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.operational_role_revoke(uuid, text);


-- ── 7. Initial setup and recovery, for a workspace of one ───────────
--
-- 20261119000000 refuses self-assignment outright, which means a
-- workspace with one active member can never create its first
-- operational role. That is correct as a rule and unusable as a
-- product, so this is the documented exception.
--
-- ── WHAT IT DOES NOT DO ──
--
-- It does NOT independently verify authority, and nothing inside this
-- database can. Independent verification means a second party who is
-- not the person being appointed, and in a workspace of one there is
-- no second party — the owner controls the account, the password and
-- the email. A code that arrives by email and a signature taken with
-- the same password both verify the same thing: that the one person
-- is still the one person.
--
-- So the design does not pretend. It makes the act:
--
--   * narrow   — only when NOBODY ELSE could have granted it;
--   * signed   — by password, through the same throttled path;
--   * declared — the caller states in writing what authority they hold;
--   * marked   — provenance 'bootstrap_self_declared', permanently;
--   * reported — operational_role_unsigned_grants() lists it.
--
-- The compensating control is external and belongs in the quality
-- system: the registered QA person is named on the regulatory
-- submission, and that document — not this database — is what says
-- whether the declaration is true. docs/operational-role-model.md
-- records this as an accepted operational limitation.

CREATE OR REPLACE FUNCTION public.operational_role_bootstrap(
  p_company_id  uuid,
  p_role        text,
  p_declaration text,
  p_signature_id uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_others int;
  v_id uuid;
  v_err text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'OPERATIONAL_ROLE_FORBIDDEN: no authenticated caller'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT (p_role = ANY (public.app_operational_roles())) THEN
    RAISE EXCEPTION 'OPERATIONAL_ROLE_UNKNOWN: % is not one of PM-03''s eight roles', p_role
      USING ERRCODE = 'P0001';
  END IF;

  IF p_declaration IS NULL OR length(btrim(p_declaration)) < 20 THEN
    RAISE EXCEPTION
      'OPERATIONAL_ROLE_DECLARATION_REQUIRED: state, in writing, what authority you hold and under what appointment'
      USING ERRCODE = 'P0001',
            HINT = 'This is the record a regulator reads. One word is not a declaration.';
  END IF;

  --  The caller must already administer the workspace. Bootstrap does
  --  not create authority out of nothing; it lets an owner who is
  --  alone in the workspace carry their administrative authority into
  --  the operational register.
  IF NOT EXISTS (
    SELECT 1 FROM public.company_members cm
     WHERE cm.company_id = p_company_id AND cm.user_id = v_actor
       AND coalesce(cm.status::text,'active') = 'active'
       AND lower(btrim(cm.role::text)) IN ('owner','admin')
  ) THEN
    RAISE EXCEPTION
      'OPERATIONAL_ROLE_FORBIDDEN: initial setup is the workspace owner''s or admin''s'
      USING ERRCODE = 'P0001';
  END IF;

  --  ── THE NARROWING CLAUSE ──
  --
  --  Anybody else at all who could have granted this — another owner,
  --  another admin, a compliance admin — and the answer is no. This is
  --  what keeps it from being a general self-assignment exception: it
  --  is unavailable the moment a second person exists who could do it
  --  properly.
  SELECT count(*) INTO v_others
    FROM public.company_members cm
   WHERE cm.company_id = p_company_id
     AND cm.user_id <> v_actor
     AND coalesce(cm.status::text,'active') = 'active'
     AND (lower(btrim(cm.role::text)) IN ('owner','admin')
          OR public.app_has_work_role(p_company_id, 'compliance_admin', cm.user_id));

  IF v_others > 0 THEN
    RAISE EXCEPTION
      'OPERATIONAL_ROLE_BOOTSTRAP_UNAVAILABLE: % other people in this workspace can grant this role, so one of them must',
      v_others
      USING ERRCODE = 'P0001',
            HINT = 'Initial setup exists only where nobody else could do it.';
  END IF;

  --  Signed, always — even for a role that would not otherwise need
  --  one. A self-declared grant is the weakest link in the model and
  --  it is not going to be the unsigned one as well.
  v_err := public.operational_role_signature_error(
             p_signature_id, p_company_id, v_actor, p_role, 'grant', NULL, v_actor);
  IF v_err IS NOT NULL THEN
    RAISE EXCEPTION '%', v_err USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.operational_role_assignments
    (company_id, user_id, role, reason, assigned_by,
     grant_signature_id, provenance, declaration)
  VALUES (p_company_id, v_actor, p_role,
          'Initial setup: no other person in this workspace could grant it',
          v_actor, p_signature_id, 'bootstrap_self_declared', btrim(p_declaration))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.operational_role_bootstrap(uuid, text, text, uuid) IS
  'Initial setup for a workspace where nobody else can grant a role. Self-declared, signed, permanently marked, and reported. It does NOT independently verify authority — see docs/operational-role-model.md.';

REVOKE ALL ON FUNCTION public.operational_role_bootstrap(uuid, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.operational_role_bootstrap(uuid, text, text, uuid)
  TO authenticated, service_role;


-- ── 8. What a reviewer needs to be able to ask ──────────────────────
--
-- Every grant that nobody countersigned, in one query, because the
-- whole value of marking them is that somebody can find them.

CREATE OR REPLACE FUNCTION public.operational_role_unsigned_grants(p_company_id uuid)
RETURNS TABLE (
  assignment_id uuid,
  user_id       uuid,
  role          text,
  provenance    text,
  reason        text,
  declaration   text,
  assigned_at   timestamptz,
  still_live    boolean,
  finding       text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT a.id, a.user_id, a.role, a.provenance, a.reason, a.declaration, a.assigned_at,
         a.revoked_at IS NULL,
         CASE a.provenance
           WHEN 'bootstrap_self_declared'
             THEN 'Granted by the holder to themselves during initial setup. Authority is declared, not independently verified.'
           WHEN 'service'
             THEN 'Granted by a migration, seed or scheduler. No person signed for it.'
           ELSE 'A GMP-critical role granted without a signature.'
         END
    FROM public.operational_role_assignments a
   WHERE a.company_id = p_company_id
     AND (a.provenance <> 'rpc'
          OR (public.operational_role_needs_signature(a.role)
              AND a.grant_signature_id IS NULL))
   ORDER BY a.assigned_at DESC;
$$;

COMMENT ON FUNCTION public.operational_role_unsigned_grants(uuid) IS
  'Every operational role grant that no second person signed for: bootstrap self-declarations, service-context grants, and any GMP-critical grant missing a signature.';

GRANT EXECUTE ON FUNCTION public.operational_role_unsigned_grants(uuid)
  TO authenticated, service_role;


-- ── 9. Prove it bites ───────────────────────────────────────────────

DO $assert$
DECLARE
  v_c uuid; v_a uuid; v_b uuid;
BEGIN
  BEGIN
    v_c := gen_random_uuid(); v_a := gen_random_uuid(); v_b := gen_random_uuid();

    INSERT INTO public.companies (id, name) VALUES (v_c, 'Role signature self test');
    INSERT INTO auth.users (id, email) VALUES
      (v_a, 'role-sig-admin@invalid.test'), (v_b, 'role-sig-member@invalid.test');
    INSERT INTO public.company_members (company_id, user_id, role, status)
    VALUES (v_c, v_a, 'admin', 'active'), (v_c, v_b, 'viewer', 'active');

    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims',
                       json_build_object('sub', v_a::text, 'role', 'authenticated')::text, true);
    IF public.app_is_service_context() THEN
      RAISE EXCEPTION 'SELF_TEST_STILL_SERVICE';
    END IF;

    --  (a) A GMP-critical role cannot be granted without a signature.
    BEGIN
      PERFORM public.operational_role_assign(v_c, v_b, 'qa_manager', 'assertion');
      RAISE EXCEPTION 'UNSIGNED_GMP_GRANT_ALLOWED';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM NOT LIKE 'OPERATIONAL_ROLE_SIGNATURE_REQUIRED%' THEN RAISE; END IF;
    END;

    --  (b) A role that is not GMP-critical still can be.
    PERFORM public.operational_role_assign(v_c, v_b, 'storekeeper', 'assertion');
    IF NOT public.app_has_work_role(v_c, 'storekeeper', v_b) THEN
      RAISE EXCEPTION 'UNSIGNED_ORDINARY_GRANT_REFUSED';
    END IF;

    --  (c) The hash distinguishes the target. Two appointments that
    --  differ only in who is appointed must not share a hash.
    IF public.operational_role_action_hash(v_c, v_a, 'qa_manager', 'grant')
       = public.operational_role_action_hash(v_c, v_b, 'qa_manager', 'grant') THEN
      RAISE EXCEPTION 'ACTION_HASH_IGNORES_THE_TARGET';
    END IF;
    IF public.operational_role_action_hash(v_c, v_b, 'qa_manager', 'grant')
       = public.operational_role_action_hash(v_c, v_b, 'qa_manager', 'revoke') THEN
      RAISE EXCEPTION 'ACTION_HASH_IGNORES_THE_ACTION';
    END IF;

    --  (d) Bootstrap is unavailable while somebody else could grant it.
    BEGIN
      PERFORM public.operational_role_bootstrap(
        v_c, 'qa_manager',
        'I am the registered QA person named on the NAFDAC submission for this facility.',
        gen_random_uuid());
      RAISE EXCEPTION 'BOOTSTRAP_AVAILABLE_WITH_A_SECOND_ADMIN';
    EXCEPTION WHEN OTHERS THEN
      --  v_b is a viewer, so the narrowing clause should NOT fire; what
      --  should fire is the signature check on a signature that does
      --  not exist.
      IF SQLERRM NOT LIKE 'OPERATIONAL_ROLE_SIGNATURE_INVALID%' THEN RAISE; END IF;
    END;

    RAISE EXCEPTION 'ROLLBACK_THE_ASSERTION';
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM set_config('role', 'none', true);
      IF SQLERRM <> 'ROLLBACK_THE_ASSERTION' THEN RAISE; END IF;
  END;

  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', NULL, true);
END;
$assert$;
