-- =====================================================================
--  FIX: is_locked and is_terminal were decorative  (Finding C)
-- =====================================================================
--  lifecycle_states has carried both columns since Deliverable 01:
--
--    is_terminal    boolean NOT NULL DEFAULT false,
--    is_locked      boolean NOT NULL DEFAULT false,
--
--  Nothing read them. Verified against a live database: no engine
--  function body referenced either column. An entity could transition
--  out of a state marked terminal, and a state marked locked locked
--  nothing. This is the same failure mode as required_permission and
--  requires_signature before D02 — a field that looks like a control and
--  is not one — and it is the more dangerous version, because D03 will
--  naturally mark `closed` and `approved` as terminal and reasonably
--  expect that to mean something.
--
--  WHAT IS ENFORCED
--  ----------------
--    is_locked   on the entity's CURRENT state → no transition out of it.
--                The record is frozen while it sits there.
--    is_terminal on the entity's CURRENT state → no transition out of it.
--                The workflow has ended.
--
--  Both are checked against the state the entity is IN, before the
--  requested action is even looked up, so the error names the real
--  reason ("this record is locked") rather than a misleading one
--  ("that action isn't available from here").
--
--  Both leave current state and history untouched: the checks raise
--  before any write, inside the same transaction as the rest of the
--  function, so nothing can be partially applied.
--
--  NO CALLER IS EXEMPT, INCLUDING service_role
--  -------------------------------------------
--  Unlike required_role — a privilege gate, which service callers
--  legitimately bypass — locked and terminal are structural properties
--  of the workflow itself. A terminal state that an automation can walk
--  out of is not terminal. If an administrative override is ever wanted,
--  it needs to be an explicit, separately audited mechanism, not a
--  silent consequence of which key made the request.
--
--  WHAT IS DELIBERATELY NOT CHANGED
--  --------------------------------
--  1. No seeded state is marked terminal or locked. D01's seed sets
--     neither column on any row, and this migration does not either.
--     The enforcement mechanism is being built; the workflows are not
--     being redesigned. That belongs to D03, with evidence.
--     Consequence: this change is INERT against current data.
--
--  2. lifecycle_initialize() is not restricted. Giving an entity a
--     terminal or locked state as its FIRST state is how a historical
--     record gets backfilled — a CAPA that was already closed before the
--     engine adopted it. Blocking that would prevent migration, not
--     prevent abuse; initialisation is idempotent and cannot be used to
--     move an entity that already has a state.
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
  v_cur_locked boolean; v_cur_terminal boolean;
  v_tr record; v_hist uuid;
  v_required text[]; v_role text;
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

  IF v_tr.requires_signature THEN
    RAISE EXCEPTION 'LIFECYCLE_SIGNATURE_UNSUPPORTED: action "%" requires an electronic signature, and no signature subsystem exists yet',
      p_action_key
      USING ERRCODE = 'P0001';
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
--  available_actions must report the state gates too
-- =====================================================================
--  The state gates are checked FIRST, because they describe the entity
--  rather than the action: when a record is locked or finished, every
--  action is unavailable for the same reason, and saying so once is
--  more useful than marking each action individually unavailable for
--  some incidental reason.
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

COMMENT ON FUNCTION public.lifecycle_transition(text,uuid,text,uuid,uuid,text,jsonb) IS
  'Authoritative transition. Enforces tenancy, actor identity, locked/terminal state and the transition requirements, then writes current state and history atomically.';
