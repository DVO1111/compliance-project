-- =====================================================================
--  D03 — CHANGE CONTROL ADOPTS THE LIFECYCLE ENGINE
-- =====================================================================
--  Change Control only. CAPA and SOP are untouched and keep their
--  current behaviour until their own migrations.
--
-- ---------------------------------------------------------------------
--  DISCOVERY THAT SHAPED THIS MIGRATION
-- ---------------------------------------------------------------------
--  * change_controls.company_id is NOT NULL with an FK to companies, so
--    the backfill cannot encounter a null or dangling tenant.
--  * change_controls_status_check permits exactly the eight states D01
--    seeded, so every status maps 1:1 onto a lifecycle state. Nothing
--    needs inventing.
--  * The only server-side rule on the table is
--    "Company members can manage change_controls" — FOR ALL, scoped by
--    company, with no transition rules whatsoever. The linear
--    progression in ChangeControlPage.tsx (NEXT_STATUS) and its
--    canReject list are CLIENT-side suggestions, not enforcement.
--
--  GRAPH DECISION: the seeded any-to-any graph (56 transitions) is
--  PRESERVED. There is no server-enforced Change Control workflow today,
--  so tightening the graph here would be a behaviour change, not a
--  migration. No transition is added or removed by this migration.
--
--  STATUS ARCHITECTURE: change_controls.status is kept as a SERVER-
--  MAINTAINED READ MODEL (option B). It is derived from
--  entity_current_state by trigger and can no longer be written by the
--  application at all.
--
--  Why not drop the column: status is read by ChangeControlPage,
--  changeControlService.listChangeControls (which filters on it),
--  ActiveWorkflowsWidget, auditPrepService, complianceOSReportService,
--  grcEvidenceService, the audit-prep-assembler Edge Function, and the
--  index idx_change_controls_company (company_id, status, created_at).
--  Dropping it would mean rewriting a deployed Edge Function and several
--  report paths in the same change that moves the workflow — a large
--  half-migrated surface for no security gain, since the column becomes
--  unwritable either way. Keeping it as a derived mirror leaves every
--  reader working unchanged while the engine becomes authoritative.
--
--  This is NOT dual-writing: there is exactly one writer of status (the
--  sync trigger below), driven by exactly one writer of state (the
--  lifecycle engine). The application's write path is removed, and a
--  guard trigger makes any attempt to reintroduce it fail loudly.
-- =====================================================================


-- ── 1. Mandatory comment on the "returned" path ──────────────────────
--  The D03 requirement names a "returned Change Control state with
--  mandatory comment". There is no `returned` state in this codebase —
--  the eight states contain no such value and the string appears nowhere
--  in the Change Control implementation. The state that carries that
--  meaning is `rejected`: ChangeControlPage prompts "Rejection reason:"
--  and refuses to proceed when it is empty, storing the text in
--  change_controls.rejected_reason.
--
--  That requirement is enforced ONLY in the browser today. Moving it to
--  requires_comment makes it a server-side rule for the first time.
--  Applied to the seven transitions that end in `rejected`; no other
--  transition gains a requirement, and no transition is added or removed.
UPDATE public.lifecycle_transitions t
   SET requires_comment = true
  FROM public.lifecycle_definitions d, public.lifecycle_states ts
 WHERE d.id = t.definition_id
   AND ts.id = t.to_state_id
   AND d.entity_type = 'change_control'
   AND ts.state_key  = 'rejected'
   AND t.requires_comment IS DISTINCT FROM true;


-- ── 2. Backfill existing records ─────────────────────────────────────
--  Every existing row gets a current state matching its status, plus a
--  single history row recording the adoption. No historical transitions
--  are fabricated: the source data holds only a current status, so the
--  history row has from_state_id NULL and is labelled as a backfill,
--  exactly as an initialisation is.
INSERT INTO public.entity_current_state
  (company_id, definition_id, entity_type, entity_id, state_id, entered_at, entered_by, updated_at)
SELECT cc.company_id,
       public.lifecycle_resolve_definition('change_control', cc.company_id),
       'change_control',
       cc.id,
       s.id,
       coalesce(cc.updated_at, cc.created_at, now()),
       cc.created_by,
       now()
  FROM public.change_controls cc
  JOIN public.lifecycle_states s
    ON s.definition_id = public.lifecycle_resolve_definition('change_control', cc.company_id)
   AND s.state_key = cc.status
 WHERE public.lifecycle_resolve_definition('change_control', cc.company_id) IS NOT NULL
ON CONFLICT (definition_id, entity_id) DO NOTHING;

INSERT INTO public.entity_state_history
  (company_id, definition_id, entity_type, entity_id, from_state_id, to_state_id, transition_id, actor_id, comment, metadata, created_at)
SELECT ecs.company_id, ecs.definition_id, 'change_control', ecs.entity_id,
       NULL, ecs.state_id, NULL, ecs.entered_by,
       NULL,
       jsonb_build_object('reason','backfill_d03','source','change_controls.status'),
       ecs.entered_at
  FROM public.entity_current_state ecs
 WHERE ecs.entity_type = 'change_control'
   AND NOT EXISTS (SELECT 1 FROM public.entity_state_history h
                    WHERE h.entity_type = 'change_control' AND h.entity_id = ecs.entity_id);

-- A row that could not be mapped would be silently skipped above, which
-- is exactly what must not happen. Fail the migration instead.
DO $verify$
DECLARE v_missing int;
BEGIN
  SELECT count(*) INTO v_missing
    FROM public.change_controls cc
   WHERE NOT EXISTS (SELECT 1 FROM public.entity_current_state ecs
                      WHERE ecs.entity_type='change_control' AND ecs.entity_id = cc.id);
  IF v_missing > 0 THEN
    RAISE EXCEPTION 'CHANGE_CONTROL_BACKFILL_INCOMPLETE: % row(s) have no lifecycle state', v_missing;
  END IF;
END
$verify$;


-- ── 3. Every new Change Control gets a lifecycle state ───────────────
--  A trigger rather than a service call, so a record cannot be created
--  without lifecycle state by any path — including direct PostgREST
--  inserts, which the table's FOR ALL policy still permits.
CREATE OR REPLACE FUNCTION public.fn_change_controls_initialize_lifecycle()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.lifecycle_initialize('change_control', NEW.id, NEW.company_id, NEW.created_by, NULL);
  RETURN NULL;
EXCEPTION WHEN others THEN
  -- LIFECYCLE_ALREADY_INITIALIZED is benign (re-insert of the same id);
  -- anything else must not be swallowed.
  IF SQLERRM LIKE 'LIFECYCLE_ALREADY_INITIALIZED%' THEN RETURN NULL; END IF;
  RAISE;
END
$$;

DROP TRIGGER IF EXISTS trg_change_controls_initialize_lifecycle ON public.change_controls;
CREATE TRIGGER trg_change_controls_initialize_lifecycle
  AFTER INSERT ON public.change_controls
  FOR EACH ROW EXECUTE FUNCTION public.fn_change_controls_initialize_lifecycle();


-- ── 4. status becomes a derived read model ───────────────────────────
--  The engine writes entity_current_state; this mirrors it onto
--  change_controls.status so every existing reader keeps working. The
--  transaction-local flag tells the guard in §5 that this particular
--  UPDATE is the sanctioned one, and it is cleared immediately after so
--  the exemption cannot leak to later statements in the same
--  transaction.
CREATE OR REPLACE FUNCTION public.fn_change_controls_sync_status()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_key text;
BEGIN
  IF NEW.entity_type <> 'change_control' THEN RETURN NULL; END IF;

  SELECT state_key INTO v_key FROM public.lifecycle_states WHERE id = NEW.state_id;
  IF v_key IS NULL THEN RETURN NULL; END IF;

  PERFORM set_config('app.lifecycle_cc_sync', '1', true);
  UPDATE public.change_controls
     SET status = v_key
   WHERE id = NEW.entity_id
     AND status IS DISTINCT FROM v_key;
  PERFORM set_config('app.lifecycle_cc_sync', '', true);

  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS trg_entity_current_state_sync_change_control ON public.entity_current_state;
CREATE TRIGGER trg_entity_current_state_sync_change_control
  AFTER INSERT OR UPDATE OF state_id ON public.entity_current_state
  FOR EACH ROW EXECUTE FUNCTION public.fn_change_controls_sync_status();


-- ── 5. The no-dual-write guard ───────────────────────────────────────
--  Without this, the FOR ALL policy on change_controls would still let
--  any company member set status directly, which is precisely the second
--  source of workflow truth this migration exists to remove.
CREATE OR REPLACE FUNCTION public.fn_change_controls_guard_status()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND coalesce(current_setting('app.lifecycle_cc_sync', true), '') <> '1' THEN
    RAISE EXCEPTION 'CHANGE_CONTROL_STATUS_READ_ONLY: status is derived from the lifecycle engine; use lifecycle_transition() instead of writing it'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_change_controls_guard_status ON public.change_controls;
CREATE TRIGGER trg_change_controls_guard_status
  BEFORE UPDATE ON public.change_controls
  FOR EACH ROW EXECUTE FUNCTION public.fn_change_controls_guard_status();


-- ── 6. Retire the obsolete CHECK constraint ──────────────────────────
--  The vocabulary now lives in lifecycle_states, and status can only be
--  written by the sync trigger, which writes a state_key by construction.
ALTER TABLE public.change_controls DROP CONSTRAINT IF EXISTS change_controls_status_check;

COMMENT ON COLUMN public.change_controls.status IS
  'DERIVED read model. Maintained by fn_change_controls_sync_status() from entity_current_state; direct writes are rejected. The lifecycle engine is authoritative — change state with lifecycle_transition().';
