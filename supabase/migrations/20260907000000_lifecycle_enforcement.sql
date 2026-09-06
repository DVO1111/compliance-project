-- =====================================================================
--  LIFECYCLE ENFORCEMENT LAYER  (Engineering Deliverable 02)
-- =====================================================================
--  Two things happen here.
--
--  PART 1 — a P0 fix to Deliverable 01's write path.
--  PART 2 — the enforcement the D01 schema declared but did not apply.
--
--  No table is added, altered or dropped. This migration replaces four
--  functions and nothing else.
--
-- ---------------------------------------------------------------------
--  PART 1 — WHAT WAS WRONG
-- ---------------------------------------------------------------------
--  lifecycle_transition() and lifecycle_initialize() are SECURITY DEFINER
--  and granted to `authenticated`, and they took BOTH p_company_id and
--  p_actor_id from the caller without verifying either. Only the read
--  function (lifecycle_available_actions) checked app_is_company_member().
--
--  Reproduced against a local database, as a user belonging only to
--  company B, against an entity owned by company A:
--
--    transition(entity=A's capa, action='set_investigating', company=B) → OK
--    transition(entity=A's capa, action='set_closed', company=B,
--               actor=some other user)                                 → OK
--
--    entity_current_state : company_id A, state 'closed'
--    entity_state_history : company_id B, actor_id <the other user>
--
--  Three separate failures:
--
--    1. Cross-tenant write. Any authenticated user could drive any
--       entity's lifecycle in any tenant, given only its UUID.
--    2. Forged attribution. p_actor_id was written verbatim, so the
--       history could name a user who did not perform the action. For a
--       compliance product this is the most serious of the three.
--    3. Mis-filed history. Rows were stamped with the CALLER's company,
--       not the entity's, so the owning tenant could not see them through
--       its own read policy while another tenant could.
--
--  D01's tests covered cross-tenant READS and never exercised a
--  cross-tenant WRITE, which is why they passed. The enforcement tests
--  added alongside this migration cover the write path directly.
--
--  THE FIX
--    * The caller must be a member of the company it names.
--    * The entity's own company must match the company named, so an
--      entity in another tenant cannot be reached even by a member.
--    * The actor is taken from auth.uid(). A caller-supplied actor is
--      accepted only in a service context, and a mismatched one is an
--      error rather than being silently overridden.
--    * History is written with the ENTITY's company_id.
--
-- ---------------------------------------------------------------------
--  PART 2 — ENFORCEMENT, AND THE CHOICES BEHIND IT
-- ---------------------------------------------------------------------
--  required_role      → enforced against public.profiles.role.
--        Chosen over company_members.role (correct in principle, but its
--        vocabulary is undefined and the table is largely unpopulated)
--        and over custom_roles.permissions (whose keys are all UI
--        visibility flags — canViewArchive, canManageRoles — with no
--        approval vocabulary to gate on). profiles.company_id is
--        singular, so one role per user is coherent with the product's
--        own model. A comma-separated list is accepted so that
--        'admin,compliance_officer' does not require a schema change.
--
--  required_permission → FAILS CLOSED. No workflow-permission vocabulary
--        exists. Rather than store a field that looks like a control and
--        checks nothing, a transition declaring one is rejected outright.
--
--  requires_signature  → FAILS CLOSED. There is no e-signature table, no
--        signature record and no re-authentication anywhere in this
--        codebase. A half-implemented signature would be worse than an
--        absent one, so declaring the requirement is honoured by refusing
--        the transition until a signature subsystem exists.
--
--  requires_comment    → enforced. Blank and whitespace-only are rejected.
--
--  Both fail-closed checks apply to service callers too. If service_role
--  could bypass them, an automation would silently skip the very control
--  the definition asked for.
--
--  BEHAVIOUR CHANGE: none today. Every transition seeded by D01 has
--  required_role NULL, required_permission NULL, requires_comment false
--  and requires_signature false, so all four checks are inert until D03
--  sets requirements deliberately. The tenancy and actor fixes in Part 1
--  DO change behaviour — they remove access that should never have
--  existed.
--
--  DEPENDENCY NOTE: the role read below is inlined rather than delegated
--  to app_current_profile_role() from 20260906000000. These functions are
--  SECURITY DEFINER owned by a superuser, so they already read profiles
--  with RLS bypassed and cannot hit the profiles recursion. Inlining
--  keeps this migration independent of whether that fix has been applied.
-- =====================================================================

-- ── Service-context detection ────────────────────────────────────────
-- current_user is useless inside SECURITY DEFINER (it becomes the owner).
-- Verified against a live database: the `role` GUC set by PostgREST's
-- `SET LOCAL ROLE` DOES survive into a definer function, and session_user
-- stays the login role. So:
--   * a PostgREST service-key request  → role GUC 'service_role'
--   * a PostgREST user request         → role GUC 'authenticated'
--   * psql/migrations as an admin      → role GUC unset, session_user super
-- The session_user clause is gated on the GUC being unset so that an
-- explicit `SET ROLE authenticated` in a local test is NOT treated as a
-- service context merely because the login role happens to be a superuser.
CREATE OR REPLACE FUNCTION public.app_is_service_context()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT coalesce(current_setting('role', true), 'none') = 'service_role'
      OR (coalesce(current_setting('role', true), 'none') IN ('none','')
          AND coalesce((SELECT rolsuper FROM pg_roles WHERE rolname = session_user), false));
$$;

COMMENT ON FUNCTION public.app_is_service_context() IS
  'True when running as service_role, or as a superuser login with no role set (migrations, psql). Used to decide whether a caller may act on another user''s behalf.';

REVOKE ALL ON FUNCTION public.app_is_service_context() FROM public;
GRANT EXECUTE ON FUNCTION public.app_is_service_context() TO authenticated, service_role;


-- ── Caller's profile role, without touching profiles RLS ─────────────
-- SECURITY DEFINER owned by a superuser, so the read bypasses RLS and
-- therefore cannot re-enter the recursive policy on profiles.
CREATE OR REPLACE FUNCTION public.lifecycle_actor_role(p_actor_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = p_actor_id;
$$;

COMMENT ON FUNCTION public.lifecycle_actor_role(uuid) IS
  'profiles.role for a given user, read with RLS bypassed. Internal to the lifecycle engine.';

REVOKE ALL ON FUNCTION public.lifecycle_actor_role(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.lifecycle_actor_role(uuid) TO authenticated, service_role;


-- =====================================================================
--  lifecycle_initialize — tenancy and actor enforced
-- =====================================================================
CREATE OR REPLACE FUNCTION public.lifecycle_initialize(
  p_entity_type text,
  p_entity_id   uuid,
  p_company_id  uuid,
  p_actor_id    uuid DEFAULT auth.uid(),
  p_state_key   text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_service boolean := public.app_is_service_context();
  v_uid     uuid    := auth.uid();
  v_actor   uuid;
  v_def uuid; v_state uuid; v_key text;
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
      RAISE EXCEPTION 'LIFECYCLE_ACTOR_MISMATCH: an action cannot be attributed to another user'
        USING ERRCODE = 'P0001';
    END IF;
    v_actor := v_uid;
  END IF;

  -- ── tenancy ────────────────────────────────────────────────────────
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

  IF p_state_key IS NULL THEN
    SELECT id, state_key INTO v_state, v_key
      FROM public.lifecycle_states WHERE definition_id = v_def AND is_initial;
    IF v_state IS NULL THEN
      RAISE EXCEPTION 'LIFECYCLE_NO_INITIAL_STATE: definition for "%" declares no initial state', p_entity_type
        USING ERRCODE = 'P0002';
    END IF;
  ELSE
    SELECT id, state_key INTO v_state, v_key
      FROM public.lifecycle_states WHERE definition_id = v_def AND state_key = p_state_key;
    IF v_state IS NULL THEN
      RAISE EXCEPTION 'LIFECYCLE_UNKNOWN_STATE: "%" is not a state of the lifecycle for "%"', p_state_key, p_entity_type
        USING ERRCODE = 'P0002';
    END IF;
  END IF;

  INSERT INTO public.entity_current_state
    (company_id, definition_id, entity_type, entity_id, state_id, entered_by)
  VALUES (p_company_id, v_def, p_entity_type, p_entity_id, v_state, v_actor)
  ON CONFLICT (definition_id, entity_id) DO NOTHING;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LIFECYCLE_ALREADY_INITIALIZED: entity % already has a state in this lifecycle', p_entity_id
      USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.entity_state_history
    (company_id, definition_id, entity_type, entity_id, from_state_id, to_state_id, transition_id, actor_id, metadata)
  VALUES (p_company_id, v_def, p_entity_type, p_entity_id, NULL, v_state, NULL, v_actor,
          jsonb_build_object('reason','initialize'));

  RETURN jsonb_build_object('definition_id', v_def, 'state_id', v_state,
                            'state_key', v_key, 'actor_id', v_actor);
END
$$;


-- =====================================================================
--  lifecycle_transition — tenancy, actor and requirements enforced
-- =====================================================================
CREATE OR REPLACE FUNCTION public.lifecycle_transition(
  p_entity_type text,
  p_entity_id   uuid,
  p_action_key  text,
  p_company_id  uuid,
  p_actor_id    uuid DEFAULT auth.uid(),
  p_comment     text DEFAULT NULL,
  p_metadata    jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_service boolean := public.app_is_service_context();
  v_uid     uuid    := auth.uid();
  v_actor   uuid;
  v_def uuid; v_company uuid;
  v_cur_state uuid; v_cur_key text;
  v_tr record; v_hist uuid;
  v_required text[]; v_role text;
BEGIN
  -- ── actor ──────────────────────────────────────────────────────────
  -- Taken from the session, not from the argument. A mismatched argument
  -- is refused rather than silently overridden: a caller that believes it
  -- is acting as someone else has a bug worth surfacing.
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

  -- Lock the current-state row so two concurrent transitions cannot both
  -- read the same "from" state and race each other.
  SELECT ecs.state_id, s.state_key, ecs.company_id
    INTO v_cur_state, v_cur_key, v_company
  FROM public.entity_current_state ecs
  JOIN public.lifecycle_states s ON s.id = ecs.state_id
  WHERE ecs.definition_id = v_def AND ecs.entity_id = p_entity_id
  FOR UPDATE OF ecs;

  IF v_cur_state IS NULL THEN
    RAISE EXCEPTION 'LIFECYCLE_NOT_INITIALIZED: entity % has no current state in the lifecycle for "%"', p_entity_id, p_entity_type
      USING ERRCODE = 'P0002';
  END IF;

  -- The entity's own company is authoritative. Membership of the named
  -- company is not enough to reach an entity that belongs to another one.
  IF v_company IS DISTINCT FROM p_company_id THEN
    RAISE EXCEPTION 'LIFECYCLE_COMPANY_MISMATCH: entity % does not belong to the named company', p_entity_id
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
  -- Fail-closed checks first, and they apply to service callers too: a
  -- requirement nothing can currently satisfy must not be bypassable.
  IF v_tr.required_permission IS NOT NULL THEN
    RAISE EXCEPTION 'LIFECYCLE_PERMISSION_UNSUPPORTED: action "%" declares required_permission "%", but no workflow permission vocabulary is defined yet',
      p_action_key, v_tr.required_permission
      USING ERRCODE = 'P0001';
  END IF;

  IF v_tr.requires_signature THEN
    RAISE EXCEPTION 'LIFECYCLE_SIGNATURE_UNSUPPORTED: action "%" requires an electronic signature, and no signature subsystem exists yet',
      p_action_key
      USING ERRCODE = 'P0001';
  END IF;

  IF v_tr.requires_comment AND coalesce(btrim(p_comment), '') = '' THEN
    RAISE EXCEPTION 'LIFECYCLE_COMMENT_REQUIRED: action "%" requires a comment', p_action_key
      USING ERRCODE = 'P0001';
  END IF;

  -- A role requirement gates people, not the system; service callers and
  -- migrations are exempt.
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

  -- v_company, not p_company_id: the history belongs to the entity's
  -- tenant regardless of what the caller passed.
  INSERT INTO public.entity_state_history
    (company_id, definition_id, entity_type, entity_id, from_state_id, to_state_id, transition_id, actor_id, comment, metadata)
  VALUES (v_company, v_def, p_entity_type, p_entity_id, v_cur_state, v_tr.to_state_id, v_tr.id, v_actor,
          p_comment, coalesce(p_metadata, '{}'::jsonb))
  RETURNING id INTO v_hist;

  RETURN jsonb_build_object(
    'definition_id', v_def,
    'from_state',    v_cur_key,
    'to_state',      v_tr.to_key,
    'transition_id', v_tr.id,
    'history_id',    v_hist,
    'actor_id',      v_actor
  );
END
$$;


-- =====================================================================
--  lifecycle_available_actions — now reports what the caller may do
-- =====================================================================
--  Returning actions that would be rejected is misleading once the rules
--  are enforced, so each row carries whether the caller can take it and,
--  if not, the code that would be raised.
--
--  requires_comment is deliberately NOT a blocker here: whether it is
--  satisfied depends on the comment supplied at call time, not on the
--  caller. The flag is already returned so the UI can prompt for one.
DROP FUNCTION IF EXISTS public.lifecycle_available_actions(text, uuid, uuid);

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
             WHEN t.required_permission IS NOT NULL THEN 'LIFECYCLE_PERMISSION_UNSUPPORTED'
             WHEN t.requires_signature               THEN 'LIFECYCLE_SIGNATURE_UNSUPPORTED'
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

-- D01 revoked these from public and granted EXECUTE to `authenticated`
-- only, so service_role — which has BYPASSRLS but no function privileges
-- of its own — could not call the engine at all. Any Edge Function or
-- server-side automation would have been locked out. Corrected here; the
-- service-context branches above are otherwise unreachable in production.
REVOKE ALL ON FUNCTION public.lifecycle_initialize(text,uuid,uuid,uuid,text) FROM public;
REVOKE ALL ON FUNCTION public.lifecycle_transition(text,uuid,text,uuid,uuid,text,jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.lifecycle_initialize(text,uuid,uuid,uuid,text)            TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.lifecycle_transition(text,uuid,text,uuid,uuid,text,jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.lifecycle_available_actions(text,uuid,uuid)               TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.lifecycle_resolve_definition(text,uuid)                   TO authenticated, service_role;

COMMENT ON FUNCTION public.lifecycle_transition(text,uuid,text,uuid,uuid,text,jsonb) IS
  'Authoritative transition (Deliverable 02). Enforces tenancy, actor identity and the transition requirements, then writes current state and history atomically.';
COMMENT ON FUNCTION public.lifecycle_available_actions(text,uuid,uuid) IS
  'Transitions available from the entity''s current state, each marked with whether this caller may take it.';
