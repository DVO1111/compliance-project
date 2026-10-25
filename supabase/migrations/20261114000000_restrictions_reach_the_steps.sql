-- PM-04 restrictions, on the five steps they did not reach.
--
-- ── THE GAP ──
--
-- 20261110000000 made an individual restriction real by having
-- app_section_access apply it, so every guard that reaches the grid
-- through app_assert_section_act honours one without knowing
-- restrictions exist. Six guards do: batch records, stage status,
-- readings, dispensings, CoA, dispatch.
--
-- Five do not. fn_batch_release_role, fn_material_lots_disposition_role,
-- fn_deviation_close_role, fn_capa_close_role and
-- fn_supplier_approve_role go through app_assert_step, which reads
-- step_permissions and app_work_role and has never heard of a
-- restriction.
--
-- Those five are PM-03's named steps — releasing a batch, dispositioning
-- material, closing a deviation, closing a CAPA, approving a supplier.
-- They are the most consequential actions in the system, and they were
-- the ones a restriction could not touch. A compliance admin who
-- restricted a QA Manager's `QA disposition` to none would have watched
-- them release material anyway.
--
-- ── WHY A RESTRICTION BITES EVEN WHERE THE GRID ABSTAINS ──
--
-- app_assert_step abstains for a role PM-03 does not tabulate, and
-- app_section_access returns NULL for the same silence. That abstention
-- is right: it is the design declining to rule, and refusing on it
-- would lock existing workspaces out of their own work.
--
-- An individual restriction is not a silence. It is a named person,
-- a named section, a reason and a date, entered by a compliance admin
-- through access_restrict(). So this check reads the restriction
-- DIRECTLY rather than through the grid: an explicit decision about one
-- person applies whether or not PM-03 has a row for their job title.


-- ── 1. Which column each step belongs to ────────────────────────────
--
-- A step is an action inside a section. The mapping is PM-03's own —
-- "Release a batch" is the Batch release column, "Material
-- disposition" is QA disposition — and it is stored beside the roles
-- rather than written into a CASE, for the reason step_permissions is
-- a table at all.
--
-- roles_change has no section: changing roles and permissions is
-- administration and PM-03 gives it no column. NULL means "no section
-- governs this step", which the assertion below treats as nothing to
-- restrict, not as a section named badly.

ALTER TABLE public.step_permissions
  ADD COLUMN IF NOT EXISTS section text;

COMMENT ON COLUMN public.step_permissions.section IS
  'The PM-03 column this step acts within, so an individual restriction on that section reaches the step. NULL for steps no column governs (roles_change).';

UPDATE public.step_permissions SET section = 'batch_release'   WHERE step = 'batch_release';
UPDATE public.step_permissions SET section = 'qa_disposition'  WHERE step = 'material_disposition';
UPDATE public.step_permissions SET section = 'deviation_capa'  WHERE step = 'deviation_close';
UPDATE public.step_permissions SET section = 'suppliers'       WHERE step = 'supplier_approve';
--  roles_change stays NULL, deliberately.


-- ── 2. app_assert_step consults the restriction ─────────────────────
--
-- Replaces the body from 20261104000000. The signature, the error
-- codes and the abstention for untabulated roles are unchanged; what
-- is added is the restriction check, which runs for everybody.

CREATE OR REPLACE FUNCTION public.app_assert_step(
  p_company_id uuid,
  p_step       text
) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_role    text;
  v_roles   text[];
  v_label   text;
  v_section text;
  v_limit   text;
  v_actor   uuid := auth.uid();
BEGIN
  --  Migrations, backfills and the SQL suite.
  IF public.app_is_service_context() THEN RETURN; END IF;

  SELECT roles, label, section INTO v_roles, v_label, v_section
    FROM public.step_permissions WHERE step = p_step;

  --  A step nobody has written a rule for is not silently permitted.
  IF v_roles IS NULL THEN
    RAISE EXCEPTION 'STEP_UNKNOWN: no permission rule for step %', p_step
      USING ERRCODE = 'P0001';
  END IF;

  --  ── THE RESTRICTION, CHECKED BEFORE THE ROLE ──
  --
  --  Before, because it applies to people the role check would abstain
  --  for. An individual restriction is an express decision about one
  --  person — who, which section, why, until when — and it is not the
  --  design declining to rule, which is what the abstention below is
  --  for. Read straight from access_restrictions rather than through
  --  app_section_access, which returns NULL for an untabulated role
  --  and would swallow the restriction with it.
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

  v_role := public.app_work_role(p_company_id);

  --  SEE 20261104000000: this rules on PM-03's eight roles and on
  --  nothing else. A member with no role, or one the design does not
  --  tabulate, is NOT refused on that silence.
  IF v_role IS NULL
     OR v_role = ''
     OR v_role NOT IN (
       'procurement','storekeeper','qc_analyst','qa_officer','qa_manager',
       'production_supervisor','compliance_admin','management'
     )
  THEN RETURN; END IF;

  IF NOT (v_role = ANY (v_roles)) THEN
    RAISE EXCEPTION 'STEP_FORBIDDEN: % may not %', v_role, coalesce(v_label, p_step)
      USING ERRCODE = 'P0001',
            HINT = 'This step is reserved to: ' || array_to_string(v_roles, ', ');
  END IF;
END;
$$;

COMMENT ON FUNCTION public.app_assert_step(uuid, text) IS
  'Raises STEP_RESTRICTED when an individual restriction covers the step''s section, or STEP_FORBIDDEN unless the caller holds a role PM-03 permits. Service contexts are exempt; a role PM-03 does not tabulate abstains, but an explicit restriction still applies.';


-- ── 3. Every guarded step names a section that exists ───────────────
--
-- The dead-guard hazard again (20261105000000): a step whose section
-- column held a name no grid column matches would consult a
-- restriction that could never exist, and the check would be inert
-- while looking installed.

DO $assert$
DECLARE v_bad text; v_unmapped text;
BEGIN
  SELECT string_agg(sp.step || ' -> ' || sp.section, ', ') INTO v_bad
    FROM public.step_permissions sp
   WHERE sp.section IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.section_permissions g
                      WHERE g.section = sp.section);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'STEP_SECTION_UNKNOWN: % names a section with no column', v_bad;
  END IF;

  --  A step with no section is a deliberate choice, and there is
  --  exactly one. If another appears, somebody added a step and did
  --  not decide which column governs it — which would leave that step
  --  unreachable by any restriction, silently.
  SELECT string_agg(step, ', ') INTO v_unmapped
    FROM public.step_permissions WHERE section IS NULL AND step <> 'roles_change';
  IF v_unmapped IS NOT NULL THEN
    RAISE EXCEPTION
      'STEP_SECTION_MISSING: % has no section, so no restriction can reach it', v_unmapped;
  END IF;

  --  And prove it BITES, rather than trusting that it is installed.
  --  In a subtransaction that rolls back.
  DECLARE
    v_c uuid := gen_random_uuid(); v_u uuid := gen_random_uuid(); v_hit boolean := false;
  BEGIN
    BEGIN
      INSERT INTO public.companies(id,name) VALUES (v_c,'Step restriction self test');
      INSERT INTO auth.users(id,email) VALUES (v_u,'step-restriction-self-test@invalid.test');
      INSERT INTO public.company_members(company_id,user_id,role,status)
      VALUES (v_c,v_u,'qa_manager','active');
      INSERT INTO public.access_restrictions
        (company_id,user_id,section_key,to_level,reason,set_by)
      VALUES (v_c,v_u,'qa_disposition','none','self test',v_u);

      --  app_assert_step exempts service contexts, so the check is
      --  made against the predicate it uses rather than by calling it
      --  as postgres, which would return before reaching the clause.
      IF public.app_active_restriction(v_c, v_u, 'qa_disposition') <> 'none' THEN
        RAISE EXCEPTION 'STEP_RESTRICTION_INERT: the restriction did not register';
      END IF;
      v_hit := true;
      RAISE EXCEPTION 'STEP_RESTRICTION_SELF_TEST_PASSED';
    EXCEPTION
      WHEN OTHERS THEN
        IF SQLERRM <> 'STEP_RESTRICTION_SELF_TEST_PASSED' THEN RAISE; END IF;
    END;
  END;
END;
$assert$;
