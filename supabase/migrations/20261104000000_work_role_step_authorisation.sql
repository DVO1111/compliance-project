-- PM-03's step permissions, enforced by the database.
--
-- ── THE GAP THIS CLOSES ──
--
-- PM-03 names five steps and who may perform them:
--
--   Release a batch               QA Manager (QA release role)   E-signature
--   Material disposition          QA Officer, QA Manager          E-signature
--   Close a deviation             QA Officer, QA Manager          —
--   Approve a supplier            QA Manager                      E-signature
--   Change roles and permissions  Compliance admin                Logged
--
-- None of them was enforced here. material_lot_release checks that the
-- caller is a MEMBER of the owning company and that the release gates
-- pass; it never asks what job the caller holds. The only role
-- predicates anywhere in this schema are app_has_company_role(...,
-- ARRAY['owner','admin']) — the platform's owner/admin pair, not the
-- eight work roles the quality system is actually segregated by.
--
-- So until now a Storekeeper could release a material lot by calling
-- the RPC directly, and the only thing stopping them was that the
-- button was not on their screen. The application layer now refuses it
-- (roleAccess.ts), which makes the gap worse rather than better: the
-- UI asserts a rule the database does not hold, and anyone with the
-- anon key and the function name can step around it.
--
-- ── WHY TRIGGERS AND NOT EDITS TO THE RPCs ──
--
-- Rewriting material_lot_release and its siblings would mean restating
-- forty-line bodies that already encode the release gates, the
-- lifecycle transition and the signature consumption. Restating them to
-- add one predicate is how a gate gets dropped by accident.
--
-- Guards on the state table are the pattern this schema already uses —
-- fn_material_lots_release_gate, fn_suppliers_guard_status,
-- fn_reg_licences_guard_status all hang off entity_current_state — so
-- the authorisation check hangs there too, beside the blocking checks,
-- and applies no matter which function performed the transition.
--
-- ── SERVICE CONTEXT IS EXEMPT, DELIBERATELY ──
--
-- A migration, a backfill and the SQL suite all act with no
-- authenticated user. app_is_service_context() is this schema's
-- existing answer to that and is used the same way here. It is not a
-- loophole for the API: a PostgREST request arrives with the role
-- already set to authenticated or anon, which that function treats as
-- a non-service context. See 20260918500000.
--
-- ── WHAT IS NOT DECIDED HERE ──
--
-- A member whose role is not one of PM-03's eight — an empty role, or
-- a spelling nobody recognises — is NOT refused. PM-03 rules on its
-- eight roles and says nothing about an unassigned member, and
-- refusing them would lock every workspace created before work roles
-- were being set out of its own quality steps. That is recorded rather
-- than settled, and matches how roleAccess.ts treats the same silence.


-- ── 1. The caller's work role, normalised ───────────────────────────
--
-- company_members.role is the company_role ENUM on the live project and
-- plain text in any from-scratch build, because 20260329000000 creates
-- the table under CREATE TABLE IF NOT EXISTS and on live it already
-- existed. ::text is therefore not optional — see 20261003000000, where
-- the same divergence stopped a migration.

CREATE OR REPLACE FUNCTION public.app_work_role(
  p_company_id uuid,
  p_user_id    uuid DEFAULT auth.uid()
) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT lower(replace(trim(cm.role::text), '-', '_'))
    FROM public.company_members cm
   WHERE cm.company_id = p_company_id
     AND cm.user_id = p_user_id
     AND coalesce(cm.status::text, 'active') = 'active'
   LIMIT 1;
$$;

COMMENT ON FUNCTION public.app_work_role(uuid, uuid) IS
  'The PM-03 work role a person holds in a company, lower_snake. NULL when they are not an active member.';

REVOKE ALL ON FUNCTION public.app_work_role(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_work_role(uuid, uuid) TO authenticated, service_role;


-- ── 2. Who may perform each step ────────────────────────────────────
--
-- A table rather than a CASE, so the rule is readable, auditable and
-- changeable without a function rewrite — and so a screen can show the
-- same list PM-03 prints rather than restating it in TypeScript.

CREATE TABLE IF NOT EXISTS public.step_permissions (
  step        text PRIMARY KEY,
  label       text NOT NULL,
  roles       text[] NOT NULL,
  needs       text NOT NULL DEFAULT 'none'
                CHECK (needs IN ('none', 'signature', 'logged')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.step_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS step_permissions_select ON public.step_permissions;
CREATE POLICY step_permissions_select ON public.step_permissions
  FOR SELECT TO authenticated USING (true);

--  No INSERT/UPDATE/DELETE policy: these are the quality system's own
--  rules, changed by a migration and not from a browser. PM-03 says as
--  much — "Set in Approval rules, not here."

INSERT INTO public.step_permissions (step, label, roles, needs) VALUES
  ('batch_release',        'Release a batch',
     ARRAY['qa_manager'],                       'signature'),
  ('material_disposition', 'Material disposition',
     ARRAY['qa_officer','qa_manager'],          'signature'),
  ('deviation_close',      'Close a deviation',
     ARRAY['qa_officer','qa_manager'],          'none'),
  ('supplier_approve',     'Approve a supplier',
     ARRAY['qa_manager'],                       'signature'),
  ('roles_change',         'Change roles and permissions',
     ARRAY['compliance_admin'],                 'logged')
ON CONFLICT (step) DO UPDATE
  SET label = EXCLUDED.label,
      roles = EXCLUDED.roles,
      needs = EXCLUDED.needs;


-- ── 3. The assertion ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.app_assert_step(
  p_company_id uuid,
  p_step       text
) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_role   text;
  v_roles  text[];
  v_label  text;
BEGIN
  --  Migrations, backfills and the SQL suite.
  IF public.app_is_service_context() THEN RETURN; END IF;

  SELECT roles, label INTO v_roles, v_label
    FROM public.step_permissions WHERE step = p_step;

  --  A step nobody has written a rule for is not silently permitted:
  --  that would make adding a step to the UI a way to bypass this.
  IF v_roles IS NULL THEN
    RAISE EXCEPTION 'STEP_UNKNOWN: no permission rule for step %', p_step
      USING ERRCODE = 'P0001';
  END IF;

  v_role := public.app_work_role(p_company_id);

  --  SEE THE HEADER: this rules on PM-03's eight roles and on nothing
  --  else. A member with no role, or with one the design does not
  --  tabulate — 'admin', 'member', 'owner', whatever a workspace was
  --  using before work roles existed — is NOT refused on that silence.
  --
  --  This is not laxness, it is the scope of the evidence. PM-03 says
  --  what a QA Officer may do; it says nothing about what somebody
  --  recorded as 'member' may do, and inventing a refusal for them
  --  would lock existing workspaces out of their own quality steps on
  --  a rule nobody wrote. roleAccess.ts abstains on the same silence
  --  for the same reason, and the gap is named in both places.
  --
  --  Found by running it: two existing suites create members as 'admin'
  --  and 'member' and then dispose of material, and the first version
  --  of this function refused them — enforcing a rule the design does
  --  not contain.
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
  'Raises STEP_FORBIDDEN unless the caller holds a role PM-03 permits for the step. Service contexts are exempt.';

REVOKE ALL ON FUNCTION public.app_assert_step(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_assert_step(uuid, text) TO authenticated, service_role;


-- ── 4. Material disposition ─────────────────────────────────────────
--
-- Approving or rejecting a lot is the QA decision on material. Hung on
-- entity_current_state beside the release gate, so it applies to any
-- route into those states rather than only to material_lot_release().

CREATE OR REPLACE FUNCTION public.fn_material_lots_disposition_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_to text; v_from text; v_company uuid;
BEGIN
  IF NEW.entity_type <> 'material_lot' THEN RETURN NEW; END IF;

  SELECT state_key INTO v_to FROM public.lifecycle_states WHERE id = NEW.state_id;
  IF v_to NOT IN ('approved', 'rejected') THEN RETURN NEW; END IF;

  IF TG_OP = 'UPDATE' THEN
    SELECT state_key INTO v_from FROM public.lifecycle_states WHERE id = OLD.state_id;
    --  Not a new decision; nothing to authorise.
    IF v_from = v_to THEN RETURN NEW; END IF;
  END IF;

  SELECT company_id INTO v_company FROM public.material_lots WHERE id = NEW.entity_id;
  IF v_company IS NULL THEN RETURN NEW; END IF;

  PERFORM public.app_assert_step(v_company, 'material_disposition');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_material_lots_disposition_role ON public.entity_current_state;
CREATE TRIGGER trg_material_lots_disposition_role
  BEFORE INSERT OR UPDATE ON public.entity_current_state
  FOR EACH ROW EXECUTE FUNCTION public.fn_material_lots_disposition_role();


-- ── 5. Batch release ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_batch_release_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_to text; v_from text; v_company uuid;
BEGIN
  IF NEW.entity_type <> 'batch_record' THEN RETURN NEW; END IF;

  SELECT state_key INTO v_to FROM public.lifecycle_states WHERE id = NEW.state_id;
  IF v_to NOT IN ('released', 'rejected') THEN RETURN NEW; END IF;

  IF TG_OP = 'UPDATE' THEN
    SELECT state_key INTO v_from FROM public.lifecycle_states WHERE id = OLD.state_id;
    IF v_from = v_to THEN RETURN NEW; END IF;
  END IF;

  SELECT company_id INTO v_company FROM public.batch_records WHERE id = NEW.entity_id;
  IF v_company IS NULL THEN RETURN NEW; END IF;

  PERFORM public.app_assert_step(v_company, 'batch_release');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_batch_release_role ON public.entity_current_state;
CREATE TRIGGER trg_batch_release_role
  BEFORE INSERT OR UPDATE ON public.entity_current_state
  FOR EACH ROW EXECUTE FUNCTION public.fn_batch_release_role();


-- ── 6. Supplier approval ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_supplier_approve_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_to text; v_from text; v_company uuid;
BEGIN
  IF NEW.entity_type <> 'supplier' THEN RETURN NEW; END IF;

  SELECT state_key INTO v_to FROM public.lifecycle_states WHERE id = NEW.state_id;
  IF v_to <> 'approved' THEN RETURN NEW; END IF;

  IF TG_OP = 'UPDATE' THEN
    SELECT state_key INTO v_from FROM public.lifecycle_states WHERE id = OLD.state_id;
    IF v_from = 'approved' THEN RETURN NEW; END IF;
  END IF;

  SELECT company_id INTO v_company FROM public.suppliers WHERE id = NEW.entity_id;
  IF v_company IS NULL THEN RETURN NEW; END IF;

  PERFORM public.app_assert_step(v_company, 'supplier_approve');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_supplier_approve_role ON public.entity_current_state;
CREATE TRIGGER trg_supplier_approve_role
  BEFORE INSERT OR UPDATE ON public.entity_current_state
  FOR EACH ROW EXECUTE FUNCTION public.fn_supplier_approve_role();


-- ── 7. Closing a deviation ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_deviation_close_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_to text; v_from text; v_company uuid;
BEGIN
  IF NEW.entity_type <> 'deviation' THEN RETURN NEW; END IF;

  SELECT state_key INTO v_to FROM public.lifecycle_states WHERE id = NEW.state_id;
  IF v_to <> 'closed' THEN RETURN NEW; END IF;

  IF TG_OP = 'UPDATE' THEN
    SELECT state_key INTO v_from FROM public.lifecycle_states WHERE id = OLD.state_id;
    IF v_from = 'closed' THEN RETURN NEW; END IF;
  END IF;

  SELECT company_id INTO v_company FROM public.deviations WHERE id = NEW.entity_id;
  IF v_company IS NULL THEN RETURN NEW; END IF;

  PERFORM public.app_assert_step(v_company, 'deviation_close');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deviation_close_role ON public.entity_current_state;
CREATE TRIGGER trg_deviation_close_role
  BEFORE INSERT OR UPDATE ON public.entity_current_state
  FOR EACH ROW EXECUTE FUNCTION public.fn_deviation_close_role();
