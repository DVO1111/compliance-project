-- =====================================================================
--  OPERATIONAL ROLES, SEPARATE FROM MEMBERSHIP
--
--  company_members.role answers "what is this person to this workspace"
--  — owner, admin, legal, marketing, viewer. On the live Criateur
--  project it is the enum company_role and holds exactly those five.
--  It is NOT touched here, and no owner or admin is converted into
--  anything.
--
--  PM-03's eight roles answer a different question: "what is this
--  person allowed to do on the floor". That is an operational
--  assignment, it is company-scoped, a person may hold more than one,
--  it is granted and revoked by a named someone for a recorded reason,
--  and it is evidence. It therefore gets its own table rather than a
--  widened enum.
--
--  What this migration changes about enforcement:
--
--    app_work_role  (one role)   →  app_work_roles  (a set)
--
--  and every guard that resolved a single role now resolves the set.
--  Access is the UNION across the roles a person was given: being
--  assigned both QC Analyst and Storekeeper grants both columns,
--  because somebody decided to grant both. An individual PM-04
--  restriction still lowers the result, because a restriction is a
--  decision about the person and outranks any of their roles.
--
--  The union is also why 20261120000000 exists. PM-03 separated
--  duties by giving them to roles nobody could hold at once; once one
--  person can hold two, that separation has to be enforced per batch
--  instead of per role.
-- =====================================================================

-- ── 1. The eight, named once ────────────────────────────────────────
--
-- Every later list in this file reads from here, so an addition is one
-- edit rather than a hunt.

CREATE OR REPLACE FUNCTION public.app_operational_roles()
RETURNS text[]
LANGUAGE sql IMMUTABLE
AS $$
  SELECT ARRAY['procurement','storekeeper','qc_analyst','qa_officer',
               'qa_manager','production_supervisor','compliance_admin','management']::text[];
$$;

COMMENT ON FUNCTION public.app_operational_roles() IS
  'PM-03''s eight operational roles. Not membership roles; see company_members.role for those.';

GRANT EXECUTE ON FUNCTION public.app_operational_roles() TO authenticated, service_role;


-- ── 2. The assignments ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.operational_role_assignments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL,
  role           text NOT NULL,
  --  WHY, not just what. An assignment with no reason is an assignment
  --  nobody can review.
  reason         text NOT NULL CHECK (btrim(reason) <> ''),
  assigned_by    uuid,
  assigned_at    timestamptz NOT NULL DEFAULT now(),
  --  Revocation is a second fact about the same row, never a delete.
  --  Who held what, when, and who ended it is the evidence.
  revoked_by     uuid,
  revoked_at     timestamptz,
  revoke_reason  text,
  CONSTRAINT operational_role_is_one_of_the_eight
    CHECK (role = ANY (public.app_operational_roles())),
  CONSTRAINT operational_role_revocation_is_complete
    CHECK (
      (revoked_at IS NULL AND revoked_by IS NULL AND revoke_reason IS NULL)
      OR (revoked_at IS NOT NULL AND revoke_reason IS NOT NULL
          AND btrim(revoke_reason) <> '')
    )
);

--  One live assignment of a role per person per company. Revoked rows
--  are exempt, so the same role can be granted again later and both
--  grants stay visible.
CREATE UNIQUE INDEX IF NOT EXISTS operational_role_assignments_live_uniq
  ON public.operational_role_assignments (company_id, user_id, role)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS operational_role_assignments_lookup_idx
  ON public.operational_role_assignments (company_id, user_id)
  WHERE revoked_at IS NULL;

COMMENT ON TABLE public.operational_role_assignments IS
  'Who may do what on the floor. Separate from company_members.role, which is workspace membership and is not read as an operational role.';

ALTER TABLE public.operational_role_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS operational_role_assignments_read ON public.operational_role_assignments;
CREATE POLICY operational_role_assignments_read
  ON public.operational_role_assignments FOR SELECT TO authenticated
  --  app_is_company_member rather than an inline EXISTS over
  --  company_members: a policy's USING runs as the querying user, so an
  --  inline subquery is filtered by THAT table's policies in turn and
  --  the row disappears for reasons nothing in this file states.
  USING (public.app_is_company_member(company_id));

--  WRITE POLICIES THAT ADMIT THE MEMBER AND LET THE TRIGGER DECIDE.
--
--  The first draft had no write policies at all, on the theory that
--  everything should go through the RPCs. It was wrong twice over:
--  RLS refused the write before the trigger ran, so every authority
--  message in section 6 was unreachable for an application caller and
--  exempted for a service one — a guard that was installed, attached
--  and could never fire. Which is the dead-guard hazard this schema
--  keeps meeting.
--
--  So the policy asks only the membership question, and the trigger
--  asks the authority question. A direct INSERT and a call to
--  operational_role_assign then meet exactly the same refusals, which
--  is the property worth having.
DROP POLICY IF EXISTS operational_role_assignments_write ON public.operational_role_assignments;
CREATE POLICY operational_role_assignments_write
  ON public.operational_role_assignments FOR INSERT TO authenticated
  WITH CHECK (public.app_is_company_member(company_id));

DROP POLICY IF EXISTS operational_role_assignments_revoke ON public.operational_role_assignments;
CREATE POLICY operational_role_assignments_revoke
  ON public.operational_role_assignments FOR UPDATE TO authenticated
  USING (public.app_is_company_member(company_id))
  WITH CHECK (public.app_is_company_member(company_id));

--  Admitted so that the trigger can refuse it by name. Without the
--  policy a delete is refused as "violates row-level security", which
--  tells the caller nothing about why the row is permanent.
DROP POLICY IF EXISTS operational_role_assignments_delete ON public.operational_role_assignments;
CREATE POLICY operational_role_assignments_delete
  ON public.operational_role_assignments FOR DELETE TO authenticated
  USING (public.app_is_company_member(company_id));


-- ── 3. Resolving the set ────────────────────────────────────────────

--  THE COMPATIBILITY BRIDGE, made explicit rather than implied.
--
--  Every test fixture in this repository, and every from-scratch
--  development build, seeds company_members.role with free text and
--  puts an operational role in it — because until now that was where
--  the role lived. Reading it still is what keeps 2397 existing
--  assertions meaningful instead of rewriting them all to assert the
--  new table.
--
--  On the live project the column is the enum company_role, whose five
--  values are owner, admin, legal, marketing and viewer. NONE of them
--  is one of the eight, so the bridge admits nothing there. It cannot
--  promote an owner or an admin; the filter is membership of the eight,
--  not a mapping.
--
--  It is a switch so that it can be turned off after real assignments
--  exist, and so that "is the bridge on" is a question with an answer
--  rather than a reading of a function body.
CREATE TABLE IF NOT EXISTS public.work_role_resolution (
  id                      boolean PRIMARY KEY DEFAULT true CHECK (id),
  legacy_membership_bridge boolean NOT NULL DEFAULT true,
  note                    text,
  updated_at              timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.work_role_resolution (id, legacy_membership_bridge, note)
VALUES (true, true,
        'On while company_members.role may still carry an operational role (development and test builds). Inert where that column is the company_role enum. Turn off once operational_role_assignments is populated.')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.work_role_resolution ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS work_role_resolution_read ON public.work_role_resolution;
CREATE POLICY work_role_resolution_read
  ON public.work_role_resolution FOR SELECT TO authenticated USING (true);


CREATE OR REPLACE FUNCTION public.app_work_roles(
  p_company_id uuid,
  p_user_id    uuid DEFAULT auth.uid()
) RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT coalesce(array_agg(r ORDER BY r), ARRAY[]::text[])
    FROM (
      SELECT DISTINCT s.r
        FROM (
          SELECT a.role AS r
            FROM public.operational_role_assignments a
           WHERE a.company_id = p_company_id
             AND a.user_id = p_user_id
             AND a.revoked_at IS NULL

          UNION

          --  The bridge. `= ANY (the eight)` is the whole filter, so an
          --  owner contributes nothing.
          SELECT lower(replace(btrim(cm.role::text), '-', '_'))
            FROM public.company_members cm
           CROSS JOIN public.work_role_resolution w
           WHERE cm.company_id = p_company_id
             AND cm.user_id = p_user_id
             AND coalesce(cm.status::text, 'active') = 'active'
             AND w.legacy_membership_bridge
             AND lower(replace(btrim(cm.role::text), '-', '_'))
                   = ANY (public.app_operational_roles())
        ) s
    ) d;
$$;

COMMENT ON FUNCTION public.app_work_roles(uuid, uuid) IS
  'Every operational role a person holds in a company, sorted, empty when none. Membership roles (owner, admin, legal, marketing, viewer) are never among them.';

REVOKE ALL ON FUNCTION public.app_work_roles(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_work_roles(uuid, uuid) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.app_has_work_role(
  p_company_id uuid,
  p_role       text,
  p_user_id    uuid DEFAULT auth.uid()
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT p_role = ANY (public.app_work_roles(p_company_id, p_user_id));
$$;

COMMENT ON FUNCTION public.app_has_work_role(uuid, text, uuid) IS
  'Whether a person holds a named operational role. The check to use where one specific role carries an authority.';

REVOKE ALL ON FUNCTION public.app_has_work_role(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_has_work_role(uuid, text, uuid) TO authenticated, service_role;


--  KEPT, NARROWED, AND OFF THE ENFORCEMENT PATH.
--
--  It answered "the role", and there can now be several. Returning one
--  of them would make every caller's behaviour depend on which — so it
--  returns the sole role when there is exactly one and NULL otherwise,
--  which is never a wrong answer, only sometimes no answer. Section 7
--  asserts that no guard still calls it.
CREATE OR REPLACE FUNCTION public.app_work_role(
  p_company_id uuid,
  p_user_id    uuid DEFAULT auth.uid()
) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT CASE
           WHEN array_length(public.app_work_roles(p_company_id, p_user_id), 1) = 1
           THEN (public.app_work_roles(p_company_id, p_user_id))[1]
         END;
$$;

COMMENT ON FUNCTION public.app_work_role(uuid, uuid) IS
  'DEPRECATED since 20261119000000. The sole operational role, or NULL when the person holds none or several. Use app_work_roles or app_has_work_role; no guard may call this.';


-- ── 4. Access is the union, lowered by a restriction ────────────────

CREATE OR REPLACE FUNCTION public.app_section_access(
  p_company_id uuid,
  p_section    text,
  p_user_id    uuid DEFAULT auth.uid()
) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_roles       text[];
  v_grid        text;
  v_restriction text;
BEGIN
  v_roles := public.app_work_roles(p_company_id, p_user_id);
  IF v_roles IS NULL OR array_length(v_roles, 1) IS NULL THEN RETURN NULL; END IF;

  --  THE MOST PERMISSIVE CELL ANY HELD ROLE HAS. Two roles were granted
  --  on purpose, so the grant is both of them; taking the lesser would
  --  make adding a role remove access, which nobody intends when they
  --  add one.
  SELECT CASE
           WHEN bool_or(sp.access = 'act')  THEN 'act'
           WHEN bool_or(sp.access = 'view') THEN 'view'
           ELSE 'none'
         END
    INTO v_grid
    FROM public.section_permissions sp
   WHERE sp.section = p_section
     AND sp.role = ANY (v_roles);

  --  No held role has a cell for this section: a silence, not a
  --  refusal. Unchanged from 20261110000000 and deliberate.
  IF v_grid IS NULL THEN RETURN NULL; END IF;

  v_restriction := public.app_active_restriction(p_company_id, p_user_id, p_section);
  IF v_restriction IS NULL THEN RETURN v_grid; END IF;

  --  THE LESSER OF THE TWO. act > view > none. A restriction names one
  --  person, so it outranks every role that person holds.
  RETURN CASE
    WHEN v_grid = 'none' OR v_restriction = 'none' THEN 'none'
    WHEN v_grid = 'view' OR v_restriction = 'view' THEN 'view'
    ELSE 'act'
  END;
END;
$$;

COMMENT ON FUNCTION public.app_section_access(uuid, text, uuid) IS
  'The access a person actually has to a section: the most permissive PM-03 cell across the operational roles they hold, lowered by any active individual restriction. NULL when no held role has a cell.';

REVOKE ALL ON FUNCTION public.app_section_access(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_section_access(uuid, text, uuid) TO authenticated, service_role;


-- ── 5. A step is held if any role holds it ──────────────────────────

CREATE OR REPLACE FUNCTION public.app_assert_step(
  p_company_id uuid,
  p_step       text
) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_roles   text[];
  v_held    text[];
  v_label   text;
  v_section text;
  v_limit   text;
  v_actor   uuid := auth.uid();
BEGIN
  IF public.app_is_service_context() THEN RETURN; END IF;

  SELECT sp.roles, sp.label, sp.section
    INTO v_roles, v_label, v_section
    FROM public.step_permissions sp
   WHERE sp.step = p_step;

  IF v_roles IS NULL THEN
    RAISE EXCEPTION 'STEP_UNKNOWN: no permission row for step %', p_step
      USING ERRCODE = 'P0001';
  END IF;

  --  ── THE RESTRICTION, CHECKED BEFORE THE ROLE ──
  --
  --  Before, because it applies to people the role check would abstain
  --  for. See 20261114000000: read straight from access_restrictions,
  --  because app_section_access returns NULL for someone holding no
  --  tabulated role and would swallow the restriction with it.
  IF v_section IS NOT NULL AND v_actor IS NOT NULL THEN
    v_limit := public.app_active_restriction(p_company_id, v_actor, v_section);
    IF v_limit IS NOT NULL AND v_limit <> 'act' THEN
      RAISE EXCEPTION
        'STEP_RESTRICTED: your access to % is restricted to %, so you may not %',
        v_section, v_limit, coalesce(v_label, p_step)
        USING ERRCODE = 'P0001',
              HINT = 'A compliance admin set this restriction. It can be lifted from the person''s access panel.';
    END IF;
  END IF;

  v_held := public.app_work_roles(p_company_id, v_actor);

  --  SEE 20261104000000: this rules on PM-03's eight roles and on
  --  nothing else. Somebody holding no operational role is NOT refused
  --  on that silence — they are refused, where they are refused, by the
  --  section guards and the policies instead.
  IF v_held IS NULL OR array_length(v_held, 1) IS NULL THEN RETURN; END IF;

  --  ANY held role suffices. The person was given each of them.
  IF NOT (v_held && v_roles) THEN
    RAISE EXCEPTION 'STEP_FORBIDDEN: % may not %',
      array_to_string(v_held, ', '), coalesce(v_label, p_step)
      USING ERRCODE = 'P0001',
            HINT = 'This step is reserved to: ' || array_to_string(v_roles, ', ');
  END IF;
END;
$$;

COMMENT ON FUNCTION public.app_assert_step(uuid, text) IS
  'Raises STEP_RESTRICTED when an individual restriction covers the step''s section, or STEP_FORBIDDEN unless one of the caller''s operational roles is permitted. Service contexts are exempt; holding no operational role abstains, but an explicit restriction still applies.';

REVOKE ALL ON FUNCTION public.app_assert_step(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_assert_step(uuid, text) TO authenticated, service_role;


-- ── 6. Who may assign, change and revoke ────────────────────────────
--
-- Two independent authorities, because neither alone works:
--
--   * A member whose MEMBERSHIP role is owner or admin. This is
--     workspace administration, it is the authority that already
--     exists, and it is the only way the first operational role can
--     ever be granted. It does not make them a QA Manager; it lets
--     them appoint one.
--   * Anyone holding the compliance_admin operational role, which is
--     PM-03's own "Change roles and permissions".
--
-- And one refusal that applies to both: NOT YOURSELF.

CREATE OR REPLACE FUNCTION public.app_may_assign_operational_roles(
  p_company_id uuid,
  p_user_id    uuid DEFAULT auth.uid()
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_members cm
     WHERE cm.company_id = p_company_id
       AND cm.user_id = p_user_id
       AND coalesce(cm.status::text, 'active') = 'active'
       AND lower(btrim(cm.role::text)) IN ('owner', 'admin')
  ) OR public.app_has_work_role(p_company_id, 'compliance_admin', p_user_id);
$$;

COMMENT ON FUNCTION public.app_may_assign_operational_roles(uuid, uuid) IS
  'Whether a person may grant or revoke operational roles: workspace owner/admin, or holder of compliance_admin. Never a licence to do it to oneself; see fn_operational_role_authority.';

REVOKE ALL ON FUNCTION public.app_may_assign_operational_roles(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_may_assign_operational_roles(uuid, uuid) TO authenticated, service_role;


--  ON THE TABLE, NOT INSIDE THE RPC, so the route in does not matter:
--  a direct INSERT, an UPDATE through some future policy, a call to
--  the RPC, all arrive here.
CREATE OR REPLACE FUNCTION public.fn_operational_role_authority()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_row   public.operational_role_assignments;
BEGIN
  v_row := CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;

  --  ── INTEGRITY FIRST, AND IT BINDS SERVICE CONTEXTS TOO ──
  --
  --  These are not authority rules. Who may grant a role is a question
  --  about a person, and a migration is not a person; but what an
  --  assignment row MEANS is the same question whoever is asking, and
  --  a scheduler that can re-stamp a revocation's timestamp can move
  --  the date somebody lost an authority. The suite found this: with
  --  the checks below the exemption, revoking an already-revoked
  --  assignment from a service context silently succeeded and
  --  re-dated the decision.
  IF TG_OP = 'UPDATE' THEN
    --  Only revocation may change an existing row. Everything else is
    --  rewriting what was granted, to whom, and when.
    IF (NEW.company_id, NEW.user_id, NEW.role, NEW.reason, NEW.assigned_by, NEW.assigned_at)
       IS DISTINCT FROM
       (OLD.company_id, OLD.user_id, OLD.role, OLD.reason, OLD.assigned_by, OLD.assigned_at)
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
    --  A service revocation is still stamped by the server clock. It
    --  has no auth.uid() to be the revoker, and that absence is the
    --  honest record of a revocation nobody signed for.
    IF TG_OP = 'UPDATE' THEN
      NEW.revoked_at := now();
      RETURN NEW;
    END IF;
    RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  --  An assignment is evidence of who could do what, when. Deleting one
  --  destroys that; revocation is an UPDATE and leaves the row.
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

  --  SELF-ASSIGNMENT IS THE FAILURE THIS CONTROL EXISTS FOR. An admin
  --  who can give themselves qa_manager can release their own batches,
  --  and every separation downstream becomes decoration. A second
  --  person must act — which does mean a one-person workspace cannot
  --  create its first operational role, deliberately.
  --
  --  Giving one UP is not the same act and is not refused: you may
  --  always drop your own authority, never award it to yourself. The
  --  UPDATE branch below is where that distinction is enforced.
  IF TG_OP = 'INSERT' AND NEW.user_id = v_actor THEN
    RAISE EXCEPTION
      'OPERATIONAL_ROLE_SELF: you may not grant yourself an operational role'
      USING ERRCODE = 'P0001',
            HINT = 'Another owner, admin or compliance admin must do it.';
  END IF;

  IF TG_OP = 'INSERT' THEN
    --  Who granted it is recorded by the server, not offered by the
    --  caller. A direct INSERT naming somebody else as the grantor
    --  would otherwise write a false record of who gave the authority.
    NEW.assigned_by := v_actor;
    NEW.assigned_at := now();
    NEW.revoked_at  := NULL;
    NEW.revoked_by  := NULL;
    NEW.revoke_reason := NULL;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    --  The integrity checks already ran above, before the service
    --  exemption. All that is left is to record who ended it, by the
    --  same reasoning as the INSERT branch: the server says, the
    --  caller does not offer.
    NEW.revoked_by := v_actor;
    NEW.revoked_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_operational_role_authority ON public.operational_role_assignments;
CREATE TRIGGER trg_operational_role_authority
  BEFORE INSERT OR UPDATE OR DELETE ON public.operational_role_assignments
  FOR EACH ROW EXECUTE FUNCTION public.fn_operational_role_authority();


CREATE OR REPLACE FUNCTION public.operational_role_assign(
  p_company_id uuid,
  p_user_id    uuid,
  p_role       text,
  p_reason     text
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

  --  The authority and self-assignment checks are the trigger's, so
  --  that a direct INSERT meets exactly the same refusals.
  INSERT INTO public.operational_role_assignments
    (company_id, user_id, role, reason, assigned_by)
  VALUES (p_company_id, p_user_id, p_role, p_reason, v_actor)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.operational_role_assign(uuid, uuid, text, text) IS
  'Grants an operational role. Refuses an unknown role, a non-member, a caller without authority, and the caller themselves.';

REVOKE ALL ON FUNCTION public.operational_role_assign(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.operational_role_assign(uuid, uuid, text, text) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.operational_role_revoke(
  p_assignment_id uuid,
  p_reason        text
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
     SET revoked_at = now(), revoked_by = v_actor, revoke_reason = p_reason
   WHERE id = p_assignment_id
   RETURNING true INTO v_found;

  IF NOT coalesce(v_found, false) THEN
    RAISE EXCEPTION 'OPERATIONAL_ROLE_NOT_FOUND: no assignment %', p_assignment_id
      USING ERRCODE = 'P0001';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.operational_role_revoke(uuid, text) IS
  'Withdraws an operational role, recording who and why. The row stays; the person loses the role from the next statement onward.';

REVOKE ALL ON FUNCTION public.operational_role_revoke(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.operational_role_revoke(uuid, text) TO authenticated, service_role;


-- ── 5b. The section guard names the roles held, not "the" role ──────
--
-- Only the refusal message changes: the decision was already
-- app_section_access's, which is the union now. But it printed one
-- role, and printing one of several would tell somebody holding two
-- roles that a role they do not recognise was refused.

CREATE OR REPLACE FUNCTION public.app_assert_section_act(
  p_company_id uuid,
  p_section    text
) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_access text;
  v_held   text[];
  v_actors text;
BEGIN
  --  A section with no column is not silently permitted: that would
  --  make guarding a new table a way to grant access to everyone.
  --  CHECKED BEFORE THE SERVICE-CONTEXT EXEMPTION — see 20261106000000.
  IF NOT EXISTS (SELECT 1 FROM public.section_permissions WHERE section = p_section) THEN
    RAISE EXCEPTION 'SECTION_UNKNOWN: no permission column for section %', p_section
      USING ERRCODE = 'P0001';
  END IF;

  IF public.app_is_service_context() THEN RETURN; END IF;

  v_held   := public.app_work_roles(p_company_id);
  v_access := public.app_section_access(p_company_id, p_section);

  --  Abstention, unchanged: no held role has a cell, or the caller is
  --  not a member at all.
  IF v_access IS NULL THEN RETURN; END IF;

  IF v_access <> 'act' THEN
    SELECT string_agg(role, ', ' ORDER BY role) INTO v_actors
      FROM public.section_permissions
     WHERE section = p_section AND access = 'act';

    RAISE EXCEPTION 'SECTION_FORBIDDEN: % has % access to % and may not act in it',
      CASE WHEN v_held IS NULL OR array_length(v_held, 1) IS NULL
           THEN '(no operational role)'
           ELSE array_to_string(v_held, ', ') END,
      v_access, p_section
      USING ERRCODE = 'P0001',
            HINT = coalesce('Acting in this section is reserved to: ' || v_actors,
                            'No role has act access to this section.');
  END IF;
END;
$$;

COMMENT ON FUNCTION public.app_assert_section_act(uuid, text) IS
  'Raises SECTION_FORBIDDEN unless the most permissive cell across the caller''s operational roles is Act. Abstains when no held role has a cell; service contexts are exempt.';

REVOKE ALL ON FUNCTION public.app_assert_section_act(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_assert_section_act(uuid, text) TO authenticated, service_role;


-- ── 6b. The one authority that names a single role ──────────────────
--
-- Specification approval is reserved to the QA Manager. 20261117000000
-- asked whether the caller's role IS qa_manager, which was right when
-- there was one. Now it asks whether qa_manager is among the roles
-- they hold — so someone assigned both QA Manager and QC Analyst still
-- approves, and someone assigned neither still does not.
--
-- Still no abstention here. Holding no operational role is a refusal,
-- not a silence, because on the live project everyone's membership
-- role is `owner` and an abstaining check would let all of them
-- approve.

CREATE OR REPLACE FUNCTION public.product_specification_approver_error(
  p_company_id uuid,
  p_actor      uuid
) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_held text[];
BEGIN
  IF public.app_has_work_role(p_company_id, 'qa_manager', p_actor) THEN
    RETURN NULL;
  END IF;

  v_held := public.app_work_roles(p_company_id, p_actor);

  RETURN
    'PRODUCT_SPEC_FORBIDDEN: approving a finished-product specification is reserved to the QA Manager; your role is '
    || CASE
         WHEN v_held IS NULL OR array_length(v_held, 1) IS NULL THEN '(none)'
         ELSE array_to_string(v_held, ', ')
       END;
END;
$$;

COMMENT ON FUNCTION public.product_specification_approver_error(uuid, uuid) IS
  'The reason this caller may not approve a specification, or NULL when they may. Asks whether qa_manager is among their operational roles; a workspace owner or admin is refused like anyone else.';

REVOKE ALL ON FUNCTION public.product_specification_approver_error(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.product_specification_approver_error(uuid, uuid)
  TO authenticated, service_role;


-- ── 7. Prove it, rather than trust that it is installed ─────────────

DO $assert$
DECLARE
  v_callers text;
  v_c uuid; v_u uuid; v_other uuid; v_id uuid; v_hit boolean;
BEGIN
  --  (a) No guard still resolves a single role. The deprecated shim is
  --  allowed to exist; it is not allowed to be enforcement.
  SELECT string_agg(p.proname, ', ') INTO v_callers
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname <> 'app_work_role'
     AND p.prosrc ~ '\mapp_work_role\s*\(';
  IF v_callers IS NOT NULL THEN
    RAISE EXCEPTION
      'WORK_ROLE_SINGULAR_STILL_USED: % still resolve one role; with multiple assignments that answer is arbitrary',
      v_callers;
  END IF;

  --  (b) A membership role is never an operational role. This is the
  --  assertion behind "do not convert owners and admins", and it runs
  --  against the bridge switched ON, which is the risky setting.
  IF EXISTS (SELECT 1 FROM unnest(ARRAY['owner','admin','legal','marketing','viewer']) m
              WHERE m = ANY (public.app_operational_roles())) THEN
    RAISE EXCEPTION
      'MEMBERSHIP_ROLE_IS_OPERATIONAL: a company_role value is tabulated as an operational role';
  END IF;

  --  (c) The authority, the self-assignment refusal and the union, each
  --  attempted for real inside a subtransaction that rolls back.
  BEGIN
    v_c := gen_random_uuid(); v_u := gen_random_uuid(); v_other := gen_random_uuid();

    INSERT INTO public.companies (id, name) VALUES (v_c, 'Operational role self test');
    INSERT INTO auth.users (id, email) VALUES
      (v_u,     'operational-role-admin@invalid.test'),
      (v_other, 'operational-role-member@invalid.test');
    INSERT INTO public.company_members (company_id, user_id, role, status)
    VALUES (v_c, v_u, 'admin', 'active'), (v_c, v_other, 'viewer', 'active');

    --  The bridge admits neither of them.
    IF array_length(public.app_work_roles(v_c, v_u), 1) IS NOT NULL THEN
      RAISE EXCEPTION 'BRIDGE_PROMOTED_A_MEMBERSHIP_ROLE: admin resolved to an operational role';
    END IF;

    --  LEAVING SERVICE CONTEXT, which is the whole difficulty of
    --  self-testing an authority check inside a migration. The trigger
    --  exempts service callers and a migration is one, so asserting
    --  from here as postgres would have proved only that the exemption
    --  works. app_is_service_context() reads current_setting('role'),
    --  so setting it locally puts this block on the other side of the
    --  guard it is testing.
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims',
                       json_build_object('sub', v_u::text, 'role', 'authenticated')::text, true);
    IF public.app_is_service_context() THEN
      RAISE EXCEPTION 'SELF_TEST_STILL_SERVICE: the assertion below would prove nothing';
    END IF;

    --  An admin may appoint somebody else …
    v_id := public.operational_role_assign(v_c, v_other, 'qa_manager', 'assertion');
    IF NOT public.app_has_work_role(v_c, 'qa_manager', v_other) THEN
      RAISE EXCEPTION 'ASSIGNMENT_DID_NOT_TAKE';
    END IF;

    --  … and may not appoint themselves.
    v_hit := false;
    BEGIN
      PERFORM public.operational_role_assign(v_c, v_u, 'qa_manager', 'assertion');
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE 'OPERATIONAL_ROLE_SELF%' THEN v_hit := true; ELSE RAISE; END IF;
    END;
    IF NOT v_hit THEN
      RAISE EXCEPTION 'SELF_ASSIGNMENT_ALLOWED: an admin granted themselves an operational role';
    END IF;

    --  A second role unions rather than replaces.
    PERFORM public.operational_role_assign(v_c, v_other, 'storekeeper', 'assertion');
    IF array_length(public.app_work_roles(v_c, v_other), 1) <> 2 THEN
      RAISE EXCEPTION 'UNION_LOST_A_ROLE';
    END IF;
    IF public.app_section_access(v_c, 'batch_release', v_other) <> 'act'
       OR public.app_section_access(v_c, 'goods_receipt', v_other) <> 'act' THEN
      RAISE EXCEPTION 'UNION_DID_NOT_GRANT_BOTH_COLUMNS';
    END IF;

    --  Revocation takes effect, and the row survives it.
    PERFORM public.operational_role_revoke(v_id, 'assertion');
    IF public.app_has_work_role(v_c, 'qa_manager', v_other) THEN
      RAISE EXCEPTION 'REVOCATION_DID_NOT_TAKE';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.operational_role_assignments
                    WHERE id = v_id AND revoked_at IS NOT NULL) THEN
      RAISE EXCEPTION 'REVOCATION_REMOVED_THE_EVIDENCE';
    END IF;

    RAISE EXCEPTION 'ROLLBACK_THE_ASSERTION';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM <> 'ROLLBACK_THE_ASSERTION' THEN
        PERFORM set_config('role', 'none', true);
        RAISE;
      END IF;
  END;

  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', NULL, true);
END;
$assert$;
