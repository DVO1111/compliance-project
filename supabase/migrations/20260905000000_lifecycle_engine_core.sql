-- =====================================================================
--  LIFECYCLE ENGINE CORE  (Engineering Deliverable 01)
-- =====================================================================
--  Additive foundation only. This migration does NOT touch any existing
--  table, status column, CHECK constraint or policy. Nothing consumes the
--  engine yet — modules are migrated onto it in Deliverable 03.
--
--  Why the transition lives in a database function rather than in
--  TypeScript: the browser holds the anon key and talks straight to
--  PostgREST, so a service in src/lib is not a security boundary and
--  cannot offer a transaction. Putting the transition in plpgsql makes
--  the current-state write and the history write one statement in one
--  transaction, which is what makes them atomic, and makes the database
--  the authoritative transition mechanism.
--
--  Tenancy: policies resolve membership through app_is_company_member(),
--  the existing SECURITY DEFINER helper. That is deliberate — a policy
--  that reads public.profiles inline hits the pre-existing recursive
--  policy on that table ("Reviewers can view submitter profiles"), which
--  raises 42P17. Using the helper keeps this engine working regardless of
--  that unrelated bug, and does not paper over it.
-- =====================================================================

-- ── lifecycle_definitions ────────────────────────────────────────────
-- One row per (entity type, version). company_id NULL = a system default
-- available to every tenant; a non-null company_id is a tenant override.
CREATE TABLE IF NOT EXISTS public.lifecycle_definitions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid,
  entity_type    text        NOT NULL,
  name           text        NOT NULL,
  description    text,
  version        integer     NOT NULL DEFAULT 1,
  is_active      boolean     NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lifecycle_definitions_entity_type_chk CHECK (entity_type ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT lifecycle_definitions_version_chk     CHECK (version > 0)
);

-- Two partial indexes rather than one constraint, because NULL company_id
-- would otherwise not collide with itself and duplicate system defaults
-- could be inserted.
CREATE UNIQUE INDEX IF NOT EXISTS lifecycle_definitions_system_uniq
  ON public.lifecycle_definitions (entity_type, version)
  WHERE company_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS lifecycle_definitions_company_uniq
  ON public.lifecycle_definitions (company_id, entity_type, version)
  WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS lifecycle_definitions_lookup_idx
  ON public.lifecycle_definitions (entity_type, is_active);

-- ── lifecycle_states ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lifecycle_states (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  definition_id  uuid        NOT NULL REFERENCES public.lifecycle_definitions(id) ON DELETE CASCADE,
  state_key      text        NOT NULL,
  label          text        NOT NULL,
  description    text,
  sort_order     integer     NOT NULL DEFAULT 0,
  is_initial     boolean     NOT NULL DEFAULT false,
  is_terminal    boolean     NOT NULL DEFAULT false,
  -- Declared now, enforced in Deliverable 02. Present so the shape of a
  -- state does not have to change once locking is implemented.
  is_locked      boolean     NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lifecycle_states_key_uniq UNIQUE (definition_id, state_key)
);

-- At most one initial state per definition.
CREATE UNIQUE INDEX IF NOT EXISTS lifecycle_states_one_initial
  ON public.lifecycle_states (definition_id) WHERE is_initial;
CREATE INDEX IF NOT EXISTS lifecycle_states_definition_idx
  ON public.lifecycle_states (definition_id, sort_order);

-- ── lifecycle_transitions ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lifecycle_transitions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  definition_id       uuid        NOT NULL REFERENCES public.lifecycle_definitions(id) ON DELETE CASCADE,
  from_state_id       uuid        NOT NULL REFERENCES public.lifecycle_states(id) ON DELETE CASCADE,
  to_state_id         uuid        NOT NULL REFERENCES public.lifecycle_states(id) ON DELETE CASCADE,
  action_key          text        NOT NULL,
  label               text        NOT NULL,
  sort_order          integer     NOT NULL DEFAULT 0,
  -- ── Deliverable 02 fields: STORED BUT NOT ENFORCED HERE ──
  -- Carried now so the enforcement layer is an additive change to the
  -- engine rather than a schema change to every definition.
  required_role       text,
  required_permission text,
  requires_comment    boolean     NOT NULL DEFAULT false,
  requires_signature  boolean     NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lifecycle_transitions_action_uniq UNIQUE (definition_id, from_state_id, action_key),
  CONSTRAINT lifecycle_transitions_no_self CHECK (from_state_id <> to_state_id)
);

CREATE INDEX IF NOT EXISTS lifecycle_transitions_from_idx
  ON public.lifecycle_transitions (definition_id, from_state_id, sort_order);

-- ── entity_current_state ─────────────────────────────────────────────
-- Authoritative current state for an entity that has been adopted by the
-- engine. Existing modules are NOT adopted yet.
CREATE TABLE IF NOT EXISTS public.entity_current_state (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid        NOT NULL,
  definition_id  uuid        NOT NULL REFERENCES public.lifecycle_definitions(id) ON DELETE CASCADE,
  entity_type    text        NOT NULL,
  entity_id      uuid        NOT NULL,
  state_id       uuid        NOT NULL REFERENCES public.lifecycle_states(id),
  entered_at     timestamptz NOT NULL DEFAULT now(),
  entered_by     uuid,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  -- One current state per entity per lifecycle. This is the constraint
  -- that stops an entity holding two contradictory states at once.
  CONSTRAINT entity_current_state_uniq UNIQUE (definition_id, entity_id)
);

CREATE INDEX IF NOT EXISTS entity_current_state_entity_idx
  ON public.entity_current_state (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS entity_current_state_company_idx
  ON public.entity_current_state (company_id, entity_type);

-- ── entity_state_history ─────────────────────────────────────────────
-- Append-only record of every transition, including the initialisation
-- that gives an entity its first state (from_state_id IS NULL there).
CREATE TABLE IF NOT EXISTS public.entity_state_history (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid        NOT NULL,
  definition_id  uuid        NOT NULL REFERENCES public.lifecycle_definitions(id) ON DELETE CASCADE,
  entity_type    text        NOT NULL,
  entity_id      uuid        NOT NULL,
  from_state_id  uuid        REFERENCES public.lifecycle_states(id),
  to_state_id    uuid        NOT NULL REFERENCES public.lifecycle_states(id),
  transition_id  uuid        REFERENCES public.lifecycle_transitions(id),
  actor_id       uuid,
  comment        text,
  metadata       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS entity_state_history_entity_idx
  ON public.entity_state_history (entity_type, entity_id, created_at);
CREATE INDEX IF NOT EXISTS entity_state_history_definition_idx
  ON public.entity_state_history (definition_id, entity_id, created_at);
CREATE INDEX IF NOT EXISTS entity_state_history_company_idx
  ON public.entity_state_history (company_id, created_at);

-- ── company_id foreign keys ──────────────────────────────────────────
-- public.companies is referenced by 48 migrations but created by none of
-- them; it exists in production outside version control. Declaring the FK
-- unconditionally would make this migration fail on a fresh local reset,
-- so it is added only when the table is actually present. The column is
-- NOT NULL either way, so tenancy is still required — only referential
-- enforcement is conditional. Remove this block once companies is brought
-- under migration control.
DO $companies_fk$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'companies') THEN

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'entity_current_state_company_fk') THEN
      ALTER TABLE public.entity_current_state
        ADD CONSTRAINT entity_current_state_company_fk
        FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'entity_state_history_company_fk') THEN
      ALTER TABLE public.entity_state_history
        ADD CONSTRAINT entity_state_history_company_fk
        FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lifecycle_definitions_company_fk') THEN
      ALTER TABLE public.lifecycle_definitions
        ADD CONSTRAINT lifecycle_definitions_company_fk
        FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
    END IF;
  ELSE
    RAISE WARNING 'public.companies not found — lifecycle company_id foreign keys were skipped. Columns remain NOT NULL.';
  END IF;
END
$companies_fk$;

-- =====================================================================
--  ROW LEVEL SECURITY
-- =====================================================================
ALTER TABLE public.lifecycle_definitions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lifecycle_states       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lifecycle_transitions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_current_state   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_state_history   ENABLE ROW LEVEL SECURITY;

-- Definitions: system defaults are readable by any authenticated user;
-- tenant definitions only by members of that tenant. No write policy is
-- granted to authenticated at all — definitions are configuration and are
-- managed by migrations or the service role, never by the browser.
DROP POLICY IF EXISTS lifecycle_definitions_read ON public.lifecycle_definitions;
CREATE POLICY lifecycle_definitions_read
  ON public.lifecycle_definitions FOR SELECT TO authenticated
  USING (company_id IS NULL OR public.app_is_company_member(company_id));

DROP POLICY IF EXISTS lifecycle_states_read ON public.lifecycle_states;
CREATE POLICY lifecycle_states_read
  ON public.lifecycle_states FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.lifecycle_definitions d
    WHERE d.id = lifecycle_states.definition_id
      AND (d.company_id IS NULL OR public.app_is_company_member(d.company_id))
  ));

DROP POLICY IF EXISTS lifecycle_transitions_read ON public.lifecycle_transitions;
CREATE POLICY lifecycle_transitions_read
  ON public.lifecycle_transitions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.lifecycle_definitions d
    WHERE d.id = lifecycle_transitions.definition_id
      AND (d.company_id IS NULL OR public.app_is_company_member(d.company_id))
  ));

-- Current state and history: readable only inside the owning tenant.
-- Deliberately NO insert/update/delete policy for `authenticated` — the
-- only write path is the SECURITY DEFINER function below, so a client
-- cannot fabricate a state or a history row directly.
DROP POLICY IF EXISTS entity_current_state_read ON public.entity_current_state;
CREATE POLICY entity_current_state_read
  ON public.entity_current_state FOR SELECT TO authenticated
  USING (public.app_is_company_member(company_id));

DROP POLICY IF EXISTS entity_state_history_read ON public.entity_state_history;
CREATE POLICY entity_state_history_read
  ON public.entity_state_history FOR SELECT TO authenticated
  USING (public.app_is_company_member(company_id));

GRANT SELECT ON public.lifecycle_definitions, public.lifecycle_states,
                public.lifecycle_transitions, public.entity_current_state,
                public.entity_state_history
  TO authenticated;

-- =====================================================================
--  ENGINE FUNCTIONS
--  These are the authoritative transition mechanism.
-- =====================================================================

-- Resolve the active definition for an entity type, preferring a tenant
-- override over the system default, highest version first.
CREATE OR REPLACE FUNCTION public.lifecycle_resolve_definition(
  p_entity_type text,
  p_company_id  uuid
) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id FROM public.lifecycle_definitions
  WHERE entity_type = p_entity_type
    AND is_active
    AND (company_id = p_company_id OR company_id IS NULL)
  ORDER BY (company_id IS NOT NULL) DESC, version DESC
  LIMIT 1;
$$;

-- Give an entity its first state. Writes current state and the opening
-- history row in one statement pair inside one transaction.
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
  v_def uuid; v_state uuid; v_key text;
BEGIN
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
  VALUES (p_company_id, v_def, p_entity_type, p_entity_id, v_state, p_actor_id)
  ON CONFLICT (definition_id, entity_id) DO NOTHING;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LIFECYCLE_ALREADY_INITIALIZED: entity % already has a state in this lifecycle', p_entity_id
      USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.entity_state_history
    (company_id, definition_id, entity_type, entity_id, from_state_id, to_state_id, transition_id, actor_id, metadata)
  VALUES (p_company_id, v_def, p_entity_type, p_entity_id, NULL, v_state, NULL, p_actor_id,
          jsonb_build_object('reason','initialize'));

  RETURN jsonb_build_object('definition_id', v_def, 'state_id', v_state, 'state_key', v_key);
END
$$;

-- The single authoritative transition. Validates, then writes the state
-- change and the history row. Both statements run in the function's
-- transaction: an exception anywhere rolls back both, so the entity can
-- never end up in a new state without a matching history record.
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
  v_def uuid; v_cur_state uuid; v_cur_key text;
  v_tr  uuid; v_to_state uuid; v_to_key text;
  v_hist uuid;
BEGIN
  v_def := public.lifecycle_resolve_definition(p_entity_type, p_company_id);
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'LIFECYCLE_NO_DEFINITION: no active lifecycle definition for entity type "%"', p_entity_type
      USING ERRCODE = 'P0002';
  END IF;

  -- Lock the current-state row so two concurrent transitions cannot both
  -- read the same "from" state and race each other.
  SELECT ecs.state_id, s.state_key INTO v_cur_state, v_cur_key
  FROM public.entity_current_state ecs
  JOIN public.lifecycle_states s ON s.id = ecs.state_id
  WHERE ecs.definition_id = v_def AND ecs.entity_id = p_entity_id
  FOR UPDATE OF ecs;

  IF v_cur_state IS NULL THEN
    RAISE EXCEPTION 'LIFECYCLE_NOT_INITIALIZED: entity % has no current state in the lifecycle for "%"', p_entity_id, p_entity_type
      USING ERRCODE = 'P0002';
  END IF;

  SELECT t.id, t.to_state_id, ts.state_key INTO v_tr, v_to_state, v_to_key
  FROM public.lifecycle_transitions t
  JOIN public.lifecycle_states ts ON ts.id = t.to_state_id
  WHERE t.definition_id = v_def
    AND t.from_state_id = v_cur_state
    AND t.action_key    = p_action_key;

  IF v_tr IS NULL THEN
    -- Invalid transition. Nothing has been written, and raising here
    -- rolls back anything this function did.
    RAISE EXCEPTION 'LIFECYCLE_INVALID_TRANSITION: action "%" is not available from state "%" for entity type "%"',
      p_action_key, v_cur_key, p_entity_type
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.entity_current_state
     SET state_id = v_to_state, entered_at = now(), entered_by = p_actor_id, updated_at = now()
   WHERE definition_id = v_def AND entity_id = p_entity_id;

  INSERT INTO public.entity_state_history
    (company_id, definition_id, entity_type, entity_id, from_state_id, to_state_id, transition_id, actor_id, comment, metadata)
  VALUES (p_company_id, v_def, p_entity_type, p_entity_id, v_cur_state, v_to_state, v_tr, p_actor_id, p_comment, coalesce(p_metadata,'{}'::jsonb))
  RETURNING id INTO v_hist;

  RETURN jsonb_build_object(
    'definition_id', v_def,
    'from_state',    v_cur_key,
    'to_state',      v_to_key,
    'transition_id', v_tr,
    'history_id',    v_hist
  );
END
$$;

-- Transitions available from the entity's current state.
CREATE OR REPLACE FUNCTION public.lifecycle_available_actions(
  p_entity_type text,
  p_entity_id   uuid,
  p_company_id  uuid
) RETURNS TABLE (
  action_key text, label text, to_state_key text, sort_order integer,
  required_role text, required_permission text,
  requires_comment boolean, requires_signature boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT t.action_key, t.label, ts.state_key, t.sort_order,
         t.required_role, t.required_permission, t.requires_comment, t.requires_signature
  FROM public.entity_current_state ecs
  JOIN public.lifecycle_transitions t
    ON t.definition_id = ecs.definition_id AND t.from_state_id = ecs.state_id
  JOIN public.lifecycle_states ts ON ts.id = t.to_state_id
  WHERE ecs.entity_id = p_entity_id
    AND ecs.entity_type = p_entity_type
    AND ecs.company_id = p_company_id
    AND public.app_is_company_member(ecs.company_id)
  ORDER BY t.sort_order, t.action_key;
$$;

REVOKE ALL ON FUNCTION public.lifecycle_initialize(text,uuid,uuid,uuid,text) FROM public;
REVOKE ALL ON FUNCTION public.lifecycle_transition(text,uuid,text,uuid,uuid,text,jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.lifecycle_initialize(text,uuid,uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lifecycle_transition(text,uuid,text,uuid,uuid,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lifecycle_available_actions(text,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lifecycle_resolve_definition(text,uuid) TO authenticated;

-- =====================================================================
--  SEED — reproduces CURRENT behaviour, does not redesign it
-- =====================================================================
--  States are taken verbatim from the live CHECK constraints on
--  capa_records, change_controls and sop_documents. No state is renamed,
--  added or removed.
--
--  AMBIGUITY, RECORDED RATHER THAN RESOLVED:
--  today the database permits ANY status value to move to ANY other —
--  the policies on these tables are `FOR ALL` scoped by company only,
--  with no transition rules anywhere in SQL. The UI suggests a linear
--  progression, but the UI is not the enforcement layer. Seeding a
--  linear graph would therefore CHANGE behaviour, so the seed reproduces
--  the permissive reality: every state can reach every other state.
--  Deliverable 03 should tighten these graphs per module, with evidence,
--  as a deliberate behaviour change.
-- =====================================================================
DO $seed$
DECLARE
  r record;
  v_def uuid;
  spec jsonb := jsonb_build_array(
    jsonb_build_object(
      'entity_type','capa_record',
      'name','CAPA (as-is)',
      'initial','open',
      'states', jsonb_build_array('open','investigating','action_planned','in_progress','verification','closed','overdue')
    ),
    jsonb_build_object(
      'entity_type','change_control',
      'name','Change Control (as-is)',
      'initial','draft',
      'states', jsonb_build_array('draft','impact_assessment','pending_approval','approved','implementing','verification','closed','rejected')
    ),
    jsonb_build_object(
      'entity_type','sop_document',
      'name','SOP / Document Control (as-is)',
      'initial','draft',
      'states', jsonb_build_array('draft','in_review','approved','effective','superseded','obsolete')
    )
  );
  item jsonb; st text; idx int;
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(spec) LOOP
    -- system default (company_id NULL); skip if already seeded
    SELECT id INTO v_def FROM public.lifecycle_definitions
      WHERE company_id IS NULL AND entity_type = item->>'entity_type' AND version = 1;

    IF v_def IS NULL THEN
      INSERT INTO public.lifecycle_definitions (company_id, entity_type, name, description, version, is_active)
      VALUES (NULL, item->>'entity_type', item->>'name',
              'Seeded from the live CHECK constraint. Reproduces current behaviour; transitions are unrestricted because the database currently imposes none.',
              1, true)
      RETURNING id INTO v_def;

      idx := 0;
      FOR st IN SELECT jsonb_array_elements_text(item->'states') LOOP
        INSERT INTO public.lifecycle_states (definition_id, state_key, label, sort_order, is_initial)
        VALUES (v_def, st, initcap(replace(st,'_',' ')), idx, st = item->>'initial');
        idx := idx + 1;
      END LOOP;

      -- Any-to-any, mirroring today's absence of transition rules.
      INSERT INTO public.lifecycle_transitions
        (definition_id, from_state_id, to_state_id, action_key, label, sort_order)
      SELECT v_def, f.id, t.id, 'set_' || t.state_key, 'Set to ' || t.label, t.sort_order
      FROM public.lifecycle_states f
      JOIN public.lifecycle_states t
        ON t.definition_id = f.definition_id AND t.id <> f.id
      WHERE f.definition_id = v_def;
    END IF;
  END LOOP;
END
$seed$;

COMMENT ON TABLE public.lifecycle_definitions IS 'Lifecycle Engine core (Deliverable 01). Workflow configuration as data. Nothing consumes it yet; modules are migrated in Deliverable 03.';
COMMENT ON FUNCTION public.lifecycle_transition(text,uuid,text,uuid,uuid,text,jsonb) IS 'Authoritative transition. Validates the transition then writes current state and history atomically.';
