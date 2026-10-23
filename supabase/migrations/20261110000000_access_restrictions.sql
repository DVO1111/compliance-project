-- PM-04's individual restrictions, with somewhere to live and teeth.
--
-- ── WHAT PM-04 DRAWS AND WHAT EXISTED ──
--
-- PM-04 is the per-person access panel. It shows the role's standing
-- access, the extra grants on top of it, a list of INDIVIDUAL
-- RESTRICTIONS, and a history of what has been changed for this person
-- and when.
--
-- The history is derivable: access_grants already carries granted_at,
-- granted_by, revoked_at, revoked_by, revoke_reason and valid_until,
-- which is the whole of what the panel prints. Nothing new is needed
-- for it and nothing new is added here.
--
-- Restrictions had no table. The panel passed an empty array, with a
-- comment saying a history that invents entries is worse than one that
-- is honestly short — which was the right call for a screen and is not
-- a feature.
--
-- ── A RESTRICTION THAT DOES NOT RESTRICT IS DECORATION ──
--
-- The point of this file is the second half: `app_section_access`
-- consults the table, so an active restriction lowers what a person may
-- do EVERYWHERE, not only on the screen that records it. Every guard
-- added by 20261106000000, 20261107000000 and 20261109000000 reaches
-- the grid through that one function, so a restricted storekeeper is
-- refused by the goods-receipt guard without that guard knowing
-- restrictions exist.
--
-- Written this way round deliberately. The alternative — a table the
-- access screen reads and nothing else does — produces a system that
-- displays a restriction it is not applying, which is worse than having
-- no restrictions at all because somebody believes it.
--
-- ── A RESTRICTION ONLY EVER LOWERS ──
--
-- `to_level` is 'view' or 'none'. There is no 'act', because raising
-- somebody above their role is what a GRANT is, and access_grants
-- already does that with a request, an approver and an expiry behind
-- it. A restriction that could raise access would be a second,
-- unreviewed route to the same place.
--
-- The effective access is the LESSER of the role's cell and any active
-- restriction, so the two cannot be combined into something neither
-- says.
--
-- ── WHO MAY SET ONE ──
--
-- PM-03's step table: "Change roles and permissions — Compliance admin
-- — Logged". A restriction is a permission change, so it goes through
-- app_assert_step(..., 'roles_change') — the rule that already exists
-- rather than a new one invented for this table.


-- ── 1. The table ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.access_restrictions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL,
  section_key  text NOT NULL,
  --  Only downwards. See the header.
  to_level     text NOT NULL CHECK (to_level IN ('view', 'none')),
  --  NOT NULL and non-empty: a restriction nobody explained cannot be
  --  reviewed, and the person it applies to has to be told something.
  reason       text NOT NULL CHECK (btrim(reason) <> ''),
  --  NULL means indefinite, which is a deliberate state rather than a
  --  missing value — some restrictions last until a qualification is
  --  renewed and nobody knows the date.
  until        date,
  set_by       uuid,
  set_at       timestamptz NOT NULL DEFAULT now(),
  lifted_at    timestamptz,
  lifted_by    uuid,
  lift_reason  text,
  CONSTRAINT access_restrictions_lift_has_reason
    CHECK (lifted_at IS NULL OR btrim(coalesce(lift_reason, '')) <> '')
);

CREATE INDEX IF NOT EXISTS access_restrictions_active_idx
  ON public.access_restrictions (company_id, user_id, section_key)
  WHERE lifted_at IS NULL;

COMMENT ON TABLE public.access_restrictions IS
  'PM-04 individual restrictions. Lowers one person''s access to one section below their role''s standing level, for a period or indefinitely. Applied by app_section_access, so every section guard honours it.';

ALTER TABLE public.access_restrictions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS access_restrictions_select ON public.access_restrictions;
CREATE POLICY access_restrictions_select ON public.access_restrictions
  FOR SELECT TO authenticated
  USING (public.app_is_company_member(company_id));

--  No INSERT/UPDATE/DELETE policy from the browser. Restrictions are
--  set through the function below, which logs and checks the step.


-- ── 2. The active restriction on a person and a section ─────────────
--
-- "Active" is three conditions and all three matter: not lifted, and
-- either indefinite or not yet expired. An expired restriction is left
-- in the table rather than deleted, because the history is the point.

CREATE OR REPLACE FUNCTION public.app_active_restriction(
  p_company_id uuid,
  p_user_id    uuid,
  p_section    text
) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT r.to_level
    FROM public.access_restrictions r
   WHERE r.company_id = p_company_id
     AND r.user_id = p_user_id
     AND r.section_key = p_section
     AND r.lifted_at IS NULL
     AND (r.until IS NULL OR r.until >= current_date)
   --  The strictest active one wins. Two overlapping restrictions
   --  should not combine into the more generous of them.
   ORDER BY CASE r.to_level WHEN 'none' THEN 0 ELSE 1 END
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.app_active_restriction(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_active_restriction(uuid, uuid, text) TO authenticated, service_role;


-- ── 3. app_section_access honours it ────────────────────────────────
--
-- THE HALF THAT MAKES THIS A FEATURE. Replaces the function added by
-- 20261106000000; the signature and the meaning of the return are
-- unchanged, so every caller and every guard is unaffected except that
-- they now see the restricted answer.

CREATE OR REPLACE FUNCTION public.app_section_access(
  p_company_id uuid,
  p_section    text,
  p_user_id    uuid DEFAULT auth.uid()
) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_role        text;
  v_grid        text;
  v_restriction text;
BEGIN
  v_role := public.app_work_role(p_company_id, p_user_id);
  IF v_role IS NULL THEN RETURN NULL; END IF;

  SELECT access INTO v_grid
    FROM public.section_permissions
   WHERE section = p_section AND role = v_role;

  --  A role PM-03 does not tabulate has no cell, which is a silence
  --  rather than a refusal. A restriction on such a person is recorded
  --  and has nothing to lower, which is the honest answer — inventing
  --  a cell in order to restrict it would be enforcing a rule the
  --  design does not contain.
  IF v_grid IS NULL THEN RETURN NULL; END IF;

  v_restriction := public.app_active_restriction(p_company_id, p_user_id, p_section);
  IF v_restriction IS NULL THEN RETURN v_grid; END IF;

  --  THE LESSER OF THE TWO. act > view > none.
  RETURN CASE
    WHEN v_grid = 'none' OR v_restriction = 'none' THEN 'none'
    WHEN v_grid = 'view' OR v_restriction = 'view' THEN 'view'
    ELSE 'act'
  END;
END;
$$;

COMMENT ON FUNCTION public.app_section_access(uuid, text, uuid) IS
  'The access a person actually has to a section: their PM-03 cell, lowered by any active individual restriction. NULL when their role is not one of PM-03''s eight.';

REVOKE ALL ON FUNCTION public.app_section_access(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_section_access(uuid, text, uuid) TO authenticated, service_role;


-- ── 4. Setting and lifting one ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.access_restrict(
  p_company_id uuid,
  p_user_id    uuid,
  p_section    text,
  p_to_level   text,
  p_reason     text,
  p_until      date DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_id uuid; v_actor uuid := auth.uid();
BEGIN
  --  PM-03: "Change roles and permissions — Compliance admin".
  PERFORM public.app_assert_step(p_company_id, 'roles_change');

  IF NOT EXISTS (SELECT 1 FROM public.section_permissions WHERE section = p_section) THEN
    RAISE EXCEPTION 'SECTION_UNKNOWN: no permission column for section %', p_section
      USING ERRCODE = 'P0001';
  END IF;

  IF p_to_level NOT IN ('view', 'none') THEN
    RAISE EXCEPTION
      'RESTRICTION_ONLY_LOWERS: a restriction may set view or none, not %. Raising access is a grant.',
      p_to_level USING ERRCODE = 'P0001';
  END IF;

  IF btrim(coalesce(p_reason, '')) = '' THEN
    RAISE EXCEPTION 'RESTRICTION_NO_REASON: a restriction requires a reason'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_until IS NOT NULL AND p_until < current_date THEN
    RAISE EXCEPTION 'RESTRICTION_ALREADY_EXPIRED: % is in the past', p_until
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.company_members
                  WHERE company_id = p_company_id AND user_id = p_user_id) THEN
    RAISE EXCEPTION 'RESTRICTION_NOT_A_MEMBER: that person is not a member of this company'
      USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.access_restrictions
    (company_id, user_id, section_key, to_level, reason, until, set_by)
  VALUES (p_company_id, p_user_id, p_section, p_to_level, btrim(p_reason), p_until, v_actor)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.access_restrict(uuid, uuid, text, text, text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.access_restrict(uuid, uuid, text, text, text, date) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.access_restriction_lift(
  p_restriction_id uuid,
  p_reason         text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_company uuid; v_lifted timestamptz;
BEGIN
  SELECT company_id, lifted_at INTO v_company, v_lifted
    FROM public.access_restrictions WHERE id = p_restriction_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'RESTRICTION_NOT_FOUND: no such restriction' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.app_assert_step(v_company, 'roles_change');

  IF v_lifted IS NOT NULL THEN
    RAISE EXCEPTION 'RESTRICTION_ALREADY_LIFTED: that restriction was lifted at %', v_lifted
      USING ERRCODE = 'P0001';
  END IF;

  IF btrim(coalesce(p_reason, '')) = '' THEN
    RAISE EXCEPTION 'RESTRICTION_NO_LIFT_REASON: lifting a restriction requires a reason'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.access_restrictions
     SET lifted_at = now(), lifted_by = auth.uid(), lift_reason = btrim(p_reason)
   WHERE id = p_restriction_id;
END;
$$;

REVOKE ALL ON FUNCTION public.access_restriction_lift(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.access_restriction_lift(uuid, text) TO authenticated, service_role;


-- ── 5. A restriction, once set, is not quietly edited ───────────────
--
-- The row is the record of a decision. Lifting it is a decision too,
-- and has its own columns. Anything else is a rewrite of what was
-- decided, which is the thing a history is for preventing.

CREATE OR REPLACE FUNCTION public.fn_access_restrictions_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'RESTRICTION_IMMUTABLE: a restriction is lifted, not deleted'
      USING ERRCODE = 'P0001';
  END IF;

  IF NEW.company_id  IS DISTINCT FROM OLD.company_id
     OR NEW.user_id     IS DISTINCT FROM OLD.user_id
     OR NEW.section_key IS DISTINCT FROM OLD.section_key
     OR NEW.to_level    IS DISTINCT FROM OLD.to_level
     OR NEW.reason      IS DISTINCT FROM OLD.reason
     OR NEW.until       IS DISTINCT FROM OLD.until
     OR NEW.set_by      IS DISTINCT FROM OLD.set_by
     OR NEW.set_at      IS DISTINCT FROM OLD.set_at THEN
    RAISE EXCEPTION 'RESTRICTION_IMMUTABLE: what a restriction says cannot be changed; lift it and set another'
      USING ERRCODE = 'P0001';
  END IF;

  IF OLD.lifted_at IS NOT NULL AND NEW.lifted_at IS DISTINCT FROM OLD.lifted_at THEN
    RAISE EXCEPTION 'RESTRICTION_IMMUTABLE: a lifted restriction cannot be un-lifted'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_access_restrictions_immutable ON public.access_restrictions;
CREATE TRIGGER trg_access_restrictions_immutable
  BEFORE UPDATE OR DELETE ON public.access_restrictions
  FOR EACH ROW EXECUTE FUNCTION public.fn_access_restrictions_immutable();


-- ── 6. Proving the half that matters ────────────────────────────────
--
-- A restriction that does not reach the guards is decoration, and the
-- way to find out is not to read the code. Done in a subtransaction
-- that rolls back.

DO $assert$
DECLARE
  v_c uuid := gen_random_uuid();
  v_u uuid := gen_random_uuid();
  v_before text; v_after text;
BEGIN
  BEGIN
    INSERT INTO public.companies(id, name) VALUES (v_c, 'Restriction self test');
    INSERT INTO auth.users(id, email) VALUES (v_u, 'restriction-self-test@invalid.test');
    INSERT INTO public.company_members(company_id, user_id, role, status)
    VALUES (v_c, v_u, 'qa_manager', 'active');

    v_before := public.app_section_access(v_c, 'suppliers', v_u);
    IF v_before <> 'act' THEN
      RAISE EXCEPTION 'RESTRICTION_SELF_TEST_BASELINE: a qa_manager should hold act on suppliers, got %',
        coalesce(v_before, '<null>');
    END IF;

    INSERT INTO public.access_restrictions
      (company_id, user_id, section_key, to_level, reason, set_by)
    VALUES (v_c, v_u, 'suppliers', 'view', 'self test', v_u);

    v_after := public.app_section_access(v_c, 'suppliers', v_u);
    IF v_after <> 'view' THEN
      RAISE EXCEPTION
        'RESTRICTION_INERT: app_section_access still reports % after a restriction to view', v_after;
    END IF;

    RAISE EXCEPTION 'RESTRICTION_SELF_TEST_PASSED';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM <> 'RESTRICTION_SELF_TEST_PASSED' THEN RAISE; END IF;
  END;
END;
$assert$;
