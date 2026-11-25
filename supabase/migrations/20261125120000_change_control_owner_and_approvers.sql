-- =====================================================================
--  THE OWNER RAISES IT AND ASKS. SOMEBODY ELSE APPROVES.
--
--  The model, in the owner's words: "The person that raised the
--  deviation or change is the owner by default... he follows up by
--  requesting approval and QA also follows up by ensuring appropriate
--  reviews and approvals."
--
--  Three things were missing for that to be expressible.
--
--  1. NO OWNER. change_controls had no owner column at all. deviations
--     has investigation_owner, and not one of the live deviations has it
--     set, because nothing ever populated it. The raiser was recorded
--     (created_by, raised_by) but ownership was never claimed from it.
--
--  2. NO APPROVER. 20261125070847 made approval a signed act, which says
--     WHETHER it was really that person but not whether that person was
--     the right one. Anyone who could open the record could sign it.
--
--  3. NOTHING TOLD QA. "Submit for Approval" moved the record and
--     informed nobody, so following up meant remembering to look.
--
--  WHY NOT operational_role_assignments, which is what this product's
--  own design uses for QA Manager. Because it is not in this database.
--  That table arrives with a block of 30 migrations written against
--  from-scratch builds where company_members.role is free text; here it
--  is the company_role enum (owner, admin, legal, marketing, viewer),
--  and at least one of those migrations fails outright on that
--  difference. Waiting for that reconciliation would mean shipping
--  nothing.
--
--  So approval authority is named directly, per company, in a table that
--  answers one question. When the operational roles do land, a QA
--  Manager can be mapped into this table and nothing else has to change.
--
--  CLOSED BY DEFAULT WOULD HAVE BEEN WRONG HERE. A company with no
--  approvers listed keeps today's behaviour — any member may sign the
--  approval — because the alternative is that this migration silently
--  freezes every workspace's change control at pending_approval. The
--  gate turns itself on the moment somebody is named, which is also the
--  moment somebody has decided who QA is.
-- =====================================================================

-- ── 1. The owner ────────────────────────────────────────────────────────────

ALTER TABLE public.change_controls
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.change_controls.owner_id IS
  'Who is accountable for driving this change. Defaults to the person who raised it and may be reassigned. Not the approver: see change_control_approvers.';

--  Existing records: the raiser is the owner, which is the rule being
--  introduced applied backwards. Nothing is invented — created_by is
--  already recorded on every row.
UPDATE public.change_controls
   SET owner_id = created_by
 WHERE owner_id IS NULL AND created_by IS NOT NULL;

CREATE OR REPLACE FUNCTION public.fn_change_control_default_owner()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp
AS $$
BEGIN
  --  "By default" means exactly this: the raiser, unless the caller
  --  named somebody. It is not forced, so reassigning is a plain UPDATE.
  NEW.owner_id := coalesce(NEW.owner_id, NEW.created_by, auth.uid());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_change_control_default_owner ON public.change_controls;
CREATE TRIGGER trg_change_control_default_owner
  BEFORE INSERT ON public.change_controls
  FOR EACH ROW EXECUTE FUNCTION public.fn_change_control_default_owner();

-- ── 2. The same rule for deviations ─────────────────────────────────────────
--  The column already existed and was never filled, which is the same
--  gap wearing different clothes.

UPDATE public.deviations
   SET investigation_owner = raised_by
 WHERE investigation_owner IS NULL AND raised_by IS NOT NULL;

CREATE OR REPLACE FUNCTION public.fn_deviation_default_owner()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.investigation_owner := coalesce(NEW.investigation_owner, NEW.raised_by, auth.uid());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deviation_default_owner ON public.deviations;
CREATE TRIGGER trg_deviation_default_owner
  BEFORE INSERT ON public.deviations
  FOR EACH ROW EXECUTE FUNCTION public.fn_deviation_default_owner();

-- ── 3. Who may approve ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.change_control_approvers (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL,
  --  WHY this person. An authority with no stated basis cannot be
  --  reviewed, which is the same reason operational_role_assignments
  --  requires one.
  note       text,
  added_by   uuid,
  added_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, user_id)
);

COMMENT ON TABLE public.change_control_approvers IS
  'Who may approve a change control in this company — QA, in practice. Empty means the company has not decided, and approval stays open to any member rather than closed to everyone.';

ALTER TABLE public.change_control_approvers ENABLE ROW LEVEL SECURITY;

--  Everyone in the workspace may SEE who approves. That is not a
--  privilege, it is how the owner knows whom they are waiting for.
DROP POLICY IF EXISTS cc_approvers_select ON public.change_control_approvers;
CREATE POLICY cc_approvers_select ON public.change_control_approvers
  FOR SELECT TO authenticated
  USING (public.app_is_company_member(company_id));

--  Naming an approver is an authority change, so it is the workspace's
--  owner or admin, the only authority vocabulary this database has.
DROP POLICY IF EXISTS cc_approvers_write ON public.change_control_approvers;
CREATE POLICY cc_approvers_write ON public.change_control_approvers
  FOR ALL TO authenticated
  USING (public.app_has_company_role(company_id, ARRAY['owner','admin']))
  WITH CHECK (public.app_has_company_role(company_id, ARRAY['owner','admin']));

CREATE OR REPLACE FUNCTION public.app_may_approve_change_control(
  p_company_id uuid,
  p_user_id    uuid DEFAULT auth.uid()
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT
    --  Nobody named: the company has not decided, so nothing is
    --  narrowed. See the header for why this is not closed by default.
    NOT EXISTS (SELECT 1 FROM public.change_control_approvers
                 WHERE company_id = p_company_id)
    OR EXISTS (SELECT 1 FROM public.change_control_approvers
                WHERE company_id = p_company_id AND user_id = p_user_id);
$$;

COMMENT ON FUNCTION public.app_may_approve_change_control(uuid, uuid) IS
  'Whether this person may approve a change control here. True for everyone while no approver is named, and only for the named approvers once any is.';

REVOKE ALL ON FUNCTION public.app_may_approve_change_control(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_may_approve_change_control(uuid, uuid) TO authenticated, service_role;

-- ── 4. The guard learns the second question ─────────────────────────────────
--  Restated in full rather than patched, because this is the one place
--  the evidence rules and the authority rule have to agree about what a
--  move is. The evidence clauses are unchanged from 20261125070847.

CREATE OR REPLACE FUNCTION public.change_control_state_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_to    text;
  v_cc    public.change_controls%ROWTYPE;
  v_actor uuid := auth.uid();
  v_sod   boolean;
BEGIN
  IF NEW.entity_type IS DISTINCT FROM 'change_control' THEN
    RETURN NEW;
  END IF;

  --  ONLY AN UPDATE IS A MOVE. An INSERT is the lifecycle ADOPTING a
  --  record, which describes rather than claims. Guarding it breaks the
  --  adoption backfill.
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF NEW.state_id IS NOT DISTINCT FROM OLD.state_id THEN
    RETURN NEW;
  END IF;

  SELECT s.state_key INTO v_to FROM public.lifecycle_states s WHERE s.id = NEW.state_id;
  SELECT * INTO v_cc FROM public.change_controls WHERE id = NEW.entity_id;

  IF v_cc.id IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_to = 'pending_approval'
     AND nullif(btrim(coalesce(v_cc.impact_assessment, '')), '') IS NULL THEN
    RAISE EXCEPTION 'CC_IMPACT_ASSESSMENT_REQUIRED: record the impact assessment before submitting this change for approval'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_to = 'verification'
     AND nullif(btrim(coalesce(v_cc.implementation_summary, '')), '') IS NULL THEN
    RAISE EXCEPTION 'CC_IMPLEMENTATION_SUMMARY_REQUIRED: record what was implemented before moving this change to verification'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_to = 'closed'
     AND nullif(btrim(coalesce(v_cc.verification_summary, '')), '') IS NULL THEN
    RAISE EXCEPTION 'CC_VERIFICATION_EVIDENCE_REQUIRED: record the verification evidence before closing this change'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_to = 'approved' THEN
    --  WHO. Checked before the self-approval rule, because "you are not
    --  an approver" is the more basic refusal and the clearer message.
    --  Service contexts are exempt: a migration or the SQL suite has no
    --  authenticated user and is not claiming to be QA.
    IF NOT public.app_is_service_context()
       AND v_actor IS NOT NULL
       AND NOT public.app_may_approve_change_control(NEW.company_id, v_actor) THEN
      RAISE EXCEPTION 'CC_APPROVER_NOT_AUTHORISED: this workspace has named who may approve a change, and you are not one of them'
        USING ERRCODE = 'P0001',
              HINT = 'Ask one of the named approvers to review it, or have an owner or admin add you in Settings.';
    END IF;

    --  Segregation of duties, still off by default.
    SELECT coalesce(s.require_segregation_of_duties, false) INTO v_sod
      FROM public.company_change_control_settings s
     WHERE s.company_id = NEW.company_id;
    v_sod := coalesce(v_sod, false);

    IF v_sod
       AND v_actor IS NOT NULL
       AND v_cc.created_by IS NOT NULL
       AND v_actor = v_cc.created_by THEN
      RAISE EXCEPTION 'CC_SELF_APPROVAL_REFUSED: this workspace requires a different person to approve a change from the one who raised it'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.change_control_state_guard() IS
  'Refuses a change control state entry whose evidence is absent, an approval by somebody the company has not named as an approver, and a self-approval where the company requires segregation of duties.';

-- ── 5. Asking is telling ────────────────────────────────────────────────────
--  Submitting for approval notifies the people who can act on it. An
--  AFTER trigger: a failed notification must never undo a legitimate
--  transition, and the state change is the fact that matters.

CREATE OR REPLACE FUNCTION public.fn_change_control_request_notifies()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_to     text;
  v_cc     public.change_controls%ROWTYPE;
  v_actor  uuid := auth.uid();
  v_sent   integer := 0;
BEGIN
  IF NEW.entity_type IS DISTINCT FROM 'change_control' THEN RETURN NULL; END IF;
  IF TG_OP = 'UPDATE' AND NEW.state_id IS NOT DISTINCT FROM OLD.state_id THEN RETURN NULL; END IF;

  SELECT s.state_key INTO v_to FROM public.lifecycle_states s WHERE s.id = NEW.state_id;
  IF v_to IS DISTINCT FROM 'pending_approval' THEN RETURN NULL; END IF;

  SELECT * INTO v_cc FROM public.change_controls WHERE id = NEW.entity_id;
  IF v_cc.id IS NULL THEN RETURN NULL; END IF;

  --  The named approvers, or — while nobody is named — the workspace's
  --  owners and admins, so that a request never goes nowhere. The
  --  requester is not told about their own request.
  INSERT INTO public.notifications (user_id, recipient_id, type, content_id, message)
  SELECT coalesce(v_actor, v_cc.owner_id, v_cc.created_by), r.user_id,
         'change_control_approval_request', v_cc.id,
         v_cc.change_number || ' — ' || v_cc.title || ' is awaiting your approval.'
    FROM (
      SELECT a.user_id
        FROM public.change_control_approvers a
       WHERE a.company_id = NEW.company_id

      UNION

      SELECT m.user_id
        FROM public.company_members m
       WHERE m.company_id = NEW.company_id
         AND coalesce(m.status::text, 'active') = 'active'
         AND m.role::text IN ('owner','admin')
         AND NOT EXISTS (SELECT 1 FROM public.change_control_approvers a2
                          WHERE a2.company_id = NEW.company_id)
    ) r
   WHERE r.user_id IS DISTINCT FROM v_actor
     AND coalesce(v_actor, v_cc.owner_id, v_cc.created_by) IS NOT NULL;

  GET DIAGNOSTICS v_sent = ROW_COUNT;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  --  A notification is a courtesy, not the record. Losing one must not
  --  roll back a transition that the lifecycle already accepted and
  --  wrote history for.
  RAISE WARNING 'change control approval notification failed: %', SQLERRM;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_change_control_request_notifies ON public.entity_current_state;
CREATE TRIGGER trg_change_control_request_notifies
  AFTER UPDATE ON public.entity_current_state
  FOR EACH ROW EXECUTE FUNCTION public.fn_change_control_request_notifies();

-- ── Deploy-time assertions ──────────────────────────────────────────────────

DO $assert$
DECLARE
  v_src      text;
  v_ownerless integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='change_controls'
                    AND column_name='owner_id') THEN
    RAISE EXCEPTION 'DEPLOY GUARD: change_controls.owner_id was not created.';
  END IF;

  --  Every existing record has an owner, or the backfill did not do what
  --  the header says it does.
  SELECT count(*) INTO v_ownerless
    FROM public.change_controls WHERE owner_id IS NULL AND created_by IS NOT NULL;
  IF v_ownerless > 0 THEN
    RAISE EXCEPTION 'DEPLOY GUARD: % change control(s) still have no owner.', v_ownerless;
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname='change_control_state_guard' AND p.prokind='f'
   LIMIT 1;

  IF v_src IS NULL OR v_src NOT LIKE '%CC_APPROVER_NOT_AUTHORISED%' THEN
    RAISE EXCEPTION 'DEPLOY GUARD: the approval authority check is not in the guard.';
  END IF;

  --  The evidence rules this migration restated must still be there. A
  --  restatement that silently dropped one would be the worst outcome
  --  of writing the function out in full.
  IF v_src NOT LIKE '%CC_IMPACT_ASSESSMENT_REQUIRED%'
     OR v_src NOT LIKE '%CC_IMPLEMENTATION_SUMMARY_REQUIRED%'
     OR v_src NOT LIKE '%CC_VERIFICATION_EVIDENCE_REQUIRED%'
     OR v_src NOT LIKE '%CC_SELF_APPROVAL_REFUSED%' THEN
    RAISE EXCEPTION
      'DEPLOY GUARD: restating change_control_state_guard lost one of the rules it was supposed to keep.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.entity_current_state'::regclass
       AND tgname = 'trg_change_control_request_notifies'
       AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'DEPLOY GUARD: the approval-request notification trigger is not installed.';
  END IF;
END $assert$;
