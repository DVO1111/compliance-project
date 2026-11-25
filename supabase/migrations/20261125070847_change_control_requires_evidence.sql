-- =====================================================================
--  CHANGE CONTROL: A STAGE IS SOMETHING YOU DID, NOT SOMETHING YOU CLICKED.
--
--  UAT found it in one sentence: "clicking the next stage just
--  automatically indicates that it's completed without any evidence of
--  actual activity done. E.g. no where to include more change control
--  details, or send for approval."
--
--  That is accurate, and the cause is not the screen. The seeded graph
--  for change_control was ANY-TO-ANY: 56 transitions, every state to
--  every other state, no required role, no signature, and a comment
--  required on exactly one path (set_rejected). So `draft -> closed` was
--  a legal single move, and so was `closed -> approved`. The button was
--  only doing what the database permitted.
--
--  A change control with no recorded assessment, no approval event and
--  no verification evidence is not a weak record, it is an absent one.
--  This migration makes the database require the evidence, so that the
--  form cannot be the only thing asking for it.
--
--  WHAT CHANGES
--
--  1. A REAL WORKFLOW. The any-to-any edges are replaced by the eleven
--     that describe how a change actually moves, including the backward
--     ones that real work needs: return to draft, send back for rework,
--     return to implementation. Everything else is removed.
--
--  2. EVERY FORWARD STEP CARRIES A COMMENT. requires_comment is set on
--     all of them, so no stage can advance with an empty record of why.
--
--  3. APPROVAL IS SIGNED. set_approved carries requires_signature, so it
--     goes through lifecycle_consume_signature and the e-signature
--     register rather than being a status write. This is the same path
--     batch release already uses.
--
--  4. STAGE EVIDENCE IS A PRECONDITION, not a field somebody may fill in
--     later: a change cannot reach pending_approval without an impact
--     assessment, verification without an implementation summary, or
--     closed without verification evidence.
--
--  WHAT DOES NOT CHANGE, AND WHY
--
--  NO ROLE GATE. required_role is supported and used elsewhere with
--  'admin' and 'compliance_officer'. Not one account on this project
--  holds either — the live profile roles are content_creator, Executive
--  and legal_partner — so gating approval on a role would lock every
--  existing user out of their own workflow. Approval is gated on a
--  signature, which every user can give, rather than on a role nobody
--  has.
--
--  SELF-APPROVAL IS RECORDED, NOT YET REFUSED. The owner's decision, on
--  the record: testers work in single-user workspaces today, so blocking
--  it outright would dead-end every workflow in UAT. The rule exists and
--  is enforced here; it is switched off by default and turning it on is
--  one row in company_change_control_settings, not another migration.
--  Until then approved_by and created_by are both stored, so a
--  self-approval is visible to anyone reading the record and to the UI,
--  which says so plainly.
-- =====================================================================

-- ── 1. Stage evidence columns ───────────────────────────────────────────────
--  impact_assessment already exists and was display-only: nothing in the
--  application could write it. These two complete the set, one per stage
--  that has to prove something happened.

ALTER TABLE public.change_controls
  ADD COLUMN IF NOT EXISTS implementation_summary text,
  ADD COLUMN IF NOT EXISTS verification_summary   text;

COMMENT ON COLUMN public.change_controls.implementation_summary IS
  'What was actually done to implement the change. Required before the record may enter verification.';
COMMENT ON COLUMN public.change_controls.verification_summary IS
  'Evidence that the implemented change works and is effective. Required before the record may be closed.';

-- ── 2. The segregation-of-duties switch, as a row ───────────────────────────
--  Same shape as company_rca_settings: a decision held as a value, so
--  answering it is an UPDATE and reversing it is the same UPDATE.

CREATE TABLE IF NOT EXISTS public.company_change_control_settings (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,

  --  OFF by default, deliberately. See the header: enforcing it today
  --  would dead-end every single-user workspace at the approval step.
  --  The enforcement below is already written and tested; this is the
  --  only thing standing between it and being live.
  require_segregation_of_duties boolean NOT NULL DEFAULT false,

  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.company_change_control_settings IS
  'Per-company change control settings. require_segregation_of_duties makes the database refuse an approval by the person who raised the change; it defaults to false so that single-user workspaces can complete a workflow, and turning it on is one row rather than a deployment.';

ALTER TABLE public.company_change_control_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ccs_select ON public.company_change_control_settings;
CREATE POLICY ccs_select ON public.company_change_control_settings FOR SELECT TO authenticated
  USING (public.app_is_company_member(company_id));

DROP POLICY IF EXISTS ccs_write ON public.company_change_control_settings;
CREATE POLICY ccs_write ON public.company_change_control_settings FOR ALL TO authenticated
  USING (public.app_is_company_member(company_id))
  WITH CHECK (public.app_is_company_member(company_id));

-- ── 3. The workflow graph ───────────────────────────────────────────────────

DO $graph$
DECLARE
  --  The graph, as one value.
  --
  --  This was a TEMP TABLE and could not stay one: the harness and the
  --  Supabase migration runner both execute statements in autocommit, so
  --  `ON COMMIT DROP` took the table away before the next statement
  --  could read it. A constant keeps the single definition the two
  --  statements below share, without depending on how the file is run.
  v_keep CONSTANT jsonb := $json$[
    {"from_key":"draft",             "to_key":"impact_assessment","action_key":"set_impact_assessment","req_comment":true,"req_sig":false,"label":"Start Impact Assessment",  "sort_order":10},
    {"from_key":"impact_assessment", "to_key":"pending_approval", "action_key":"set_pending_approval", "req_comment":true,"req_sig":false,"label":"Submit for Approval",      "sort_order":20},
    {"from_key":"pending_approval",  "to_key":"approved",         "action_key":"set_approved",         "req_comment":true,"req_sig":true, "label":"Approve (signature)",      "sort_order":30},
    {"from_key":"approved",          "to_key":"implementing",     "action_key":"set_implementing",     "req_comment":true,"req_sig":false,"label":"Begin Implementation",     "sort_order":40},
    {"from_key":"implementing",      "to_key":"verification",     "action_key":"set_verification",     "req_comment":true,"req_sig":false,"label":"Move to Verification",     "sort_order":50},
    {"from_key":"verification",      "to_key":"closed",           "action_key":"set_closed",           "req_comment":true,"req_sig":false,"label":"Close Change",             "sort_order":60},

    {"from_key":"impact_assessment", "to_key":"draft",            "action_key":"set_draft",            "req_comment":true,"req_sig":false,"label":"Return to Draft",          "sort_order":70},
    {"from_key":"pending_approval",  "to_key":"impact_assessment","action_key":"set_impact_assessment","req_comment":true,"req_sig":false,"label":"Send Back for Rework",     "sort_order":80},
    {"from_key":"verification",      "to_key":"implementing",     "action_key":"set_implementing",     "req_comment":true,"req_sig":false,"label":"Return to Implementation", "sort_order":90},

    {"from_key":"draft",             "to_key":"rejected",         "action_key":"set_rejected",         "req_comment":true,"req_sig":false,"label":"Cancel Change",            "sort_order":100},
    {"from_key":"impact_assessment", "to_key":"rejected",         "action_key":"set_rejected",         "req_comment":true,"req_sig":false,"label":"Reject Change",            "sort_order":110},
    {"from_key":"pending_approval",  "to_key":"rejected",         "action_key":"set_rejected",         "req_comment":true,"req_sig":false,"label":"Reject Change",            "sort_order":120}
  ]$json$::jsonb;

  d           record;
  v_removed   integer;
  v_stranded  text;
BEGIN
  FOR d IN SELECT id FROM public.lifecycle_definitions WHERE entity_type = 'change_control' LOOP

    --  Apply the requirements to the edges that stay.
    UPDATE public.lifecycle_transitions t
       SET requires_comment   = k.req_comment,
           requires_signature = k.req_sig,
           label              = k.label,
           sort_order         = k.sort_order
      FROM jsonb_to_recordset(v_keep) AS k(
             from_key text, to_key text, action_key text,
             req_comment boolean, req_sig boolean, label text, sort_order integer)
     WHERE t.definition_id = d.id
       AND t.action_key    = k.action_key
       AND t.from_state_id = (SELECT s.id FROM public.lifecycle_states s
                               WHERE s.definition_id = d.id AND s.state_key = k.from_key)
       AND t.to_state_id   = (SELECT s.id FROM public.lifecycle_states s
                               WHERE s.definition_id = d.id AND s.state_key = k.to_key);

    --  Remove everything else.
    --
    --  entity_state_history.transition_id is ON DELETE NO ACTION, so a
    --  delete that would orphan a recorded transition FAILS rather than
    --  taking history with it. That is the safety property relied on
    --  here: the two edges this project's history references
    --  (draft -> impact_assessment, impact_assessment -> pending_approval)
    --  are both in v_keep, so nothing referenced is removed — and if
    --  that ever stops being true on another database, this migration
    --  stops rather than destroying an audit trail.
    DELETE FROM public.lifecycle_transitions t
     WHERE t.definition_id = d.id
       AND NOT EXISTS (
         SELECT 1 FROM jsonb_to_recordset(v_keep) AS k(
                        from_key text, to_key text, action_key text,
                        req_comment boolean, req_sig boolean, label text, sort_order integer)
          WHERE t.action_key    = k.action_key
            AND t.from_state_id = (SELECT s.id FROM public.lifecycle_states s
                                    WHERE s.definition_id = d.id AND s.state_key = k.from_key)
            AND t.to_state_id   = (SELECT s.id FROM public.lifecycle_states s
                                    WHERE s.definition_id = d.id AND s.state_key = k.to_key));
    GET DIAGNOSTICS v_removed = ROW_COUNT;
    RAISE NOTICE 'change_control definition %: % any-to-any transitions removed', d.id, v_removed;
  END LOOP;

  --  NOTHING MAY BE STRANDED. A record sitting in a state that no longer
  --  has an outgoing edge is unreachable work: the UI would offer no
  --  action and the only way out would be the database. Terminal states
  --  are terminal on purpose and are excluded.
  SELECT string_agg(DISTINCT cc.status, ', ') INTO v_stranded
    FROM public.change_controls cc
   WHERE cc.status NOT IN ('closed','rejected')
     AND NOT EXISTS (
       SELECT 1
         FROM public.lifecycle_transitions t
         JOIN public.lifecycle_states fs ON fs.id = t.from_state_id
         JOIN public.lifecycle_definitions df ON df.id = t.definition_id
        WHERE df.entity_type = 'change_control'
          AND fs.state_key = cc.status);

  IF v_stranded IS NOT NULL THEN
    RAISE EXCEPTION
      'DEPLOY GUARD: records exist in state(s) % with no outgoing transition. They would be stuck.', v_stranded;
  END IF;
END $graph$;

-- ── 4. Stage evidence and segregation of duties ─────────────────────────────

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

  --  ONLY AN UPDATE IS A MOVE, and this distinction is load-bearing.
  --
  --  An INSERT into entity_current_state is the lifecycle ADOPTING a
  --  record — either initialising a new one at draft, or backfilling a
  --  legacy row into the state it is already in. Policing that would
  --  mean refusing to record history as it actually was: the adoption
  --  backfill carries rows that sit in pending_approval from before this
  --  rule existed and have no impact assessment, and they are not
  --  claiming anything, they are being described.
  --
  --  Guarding INSERT is how this was first written, and it broke the
  --  backfill outright. The evidence rule is about ADVANCING a record,
  --  which is always an UPDATE: lifecycle_transition writes the new
  --  state onto the existing row.
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  --  An UPDATE that touches another column is not a transition either.
  IF NEW.state_id IS NOT DISTINCT FROM OLD.state_id THEN
    RETURN NEW;
  END IF;

  SELECT s.state_key INTO v_to FROM public.lifecycle_states s WHERE s.id = NEW.state_id;
  SELECT * INTO v_cc FROM public.change_controls WHERE id = NEW.entity_id;

  --  The lifecycle engine is generic and this trigger is not the place to
  --  decide that a missing row is an error.
  IF v_cc.id IS NULL THEN
    RETURN NEW;
  END IF;

  --  The evidence each stage exists to produce. Checked on ENTRY to the
  --  next state, which is the moment the claim is made.
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

  --  Segregation of duties. Off by default — see the header.
  IF v_to = 'approved' THEN
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
END $$;

COMMENT ON FUNCTION public.change_control_state_guard() IS
  'Refuses a change control state entry whose evidence is absent: impact assessment before pending_approval, implementation summary before verification, verification evidence before closed. Also refuses a self-approval when the company has require_segregation_of_duties set.';

DROP TRIGGER IF EXISTS trg_change_control_state_guard ON public.entity_current_state;
CREATE TRIGGER trg_change_control_state_guard
  BEFORE UPDATE ON public.entity_current_state
  FOR EACH ROW EXECUTE FUNCTION public.change_control_state_guard();

-- ── Deploy-time assertions ──────────────────────────────────────────────────

DO $assert$
DECLARE
  v_total integer;
  v_nocomment integer;
  v_sig integer;
BEGIN
  SELECT count(*) INTO v_total
    FROM public.lifecycle_transitions t
    JOIN public.lifecycle_definitions d ON d.id = t.definition_id
   WHERE d.entity_type = 'change_control';

  IF v_total = 0 THEN
    RAISE EXCEPTION 'DEPLOY GUARD: the change_control graph is empty. Every record would be frozen.';
  END IF;

  --  The point of the migration. If a forward edge can be taken with no
  --  comment, the complaint that prompted this is still true.
  SELECT count(*) INTO v_nocomment
    FROM public.lifecycle_transitions t
    JOIN public.lifecycle_definitions d ON d.id = t.definition_id
   WHERE d.entity_type = 'change_control'
     AND t.requires_comment IS DISTINCT FROM true;

  IF v_nocomment > 0 THEN
    RAISE EXCEPTION
      'DEPLOY GUARD: % change_control transition(s) still advance without a comment.', v_nocomment;
  END IF;

  SELECT count(*) INTO v_sig
    FROM public.lifecycle_transitions t
    JOIN public.lifecycle_definitions d ON d.id = t.definition_id
    JOIN public.lifecycle_states ts ON ts.id = t.to_state_id
   WHERE d.entity_type = 'change_control'
     AND ts.state_key = 'approved'
     AND t.requires_signature IS DISTINCT FROM true;

  IF v_sig > 0 THEN
    RAISE EXCEPTION
      'DEPLOY GUARD: an approval path exists that needs no signature.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.entity_current_state'::regclass
       AND tgname = 'trg_change_control_state_guard'
       AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'DEPLOY GUARD: the stage evidence trigger is not installed.';
  END IF;
END $assert$;
