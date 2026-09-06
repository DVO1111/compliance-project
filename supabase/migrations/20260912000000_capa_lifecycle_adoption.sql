-- =====================================================================
--  D03 — CAPA ADOPTS THE LIFECYCLE ENGINE
-- =====================================================================
--  CAPA only. SOP / Document Control is untouched.
--
-- ---------------------------------------------------------------------
--  DISCOVERY THAT SHAPED THIS MIGRATION
-- ---------------------------------------------------------------------
--  * capa_records.company_id is NOT NULL with an FK to companies, so the
--    backfill cannot meet a null or dangling tenant.
--  * capa_records_status_check permits exactly the seven states D01
--    seeded, so every status maps 1:1 onto a lifecycle state.
--  * The only server-side rule on the table is policy capa_records_company
--    (FOR ALL, scoped by profiles.company_id). There are no transition
--    rules and no triggers. The graph is therefore PRESERVED as seeded:
--    7 states, 42 any-to-any transitions. Nothing is added or removed.
--
-- ---------------------------------------------------------------------
--  `overdue` — PRESERVED AS A LEGACY, CURRENTLY UNREACHABLE STATE
-- ---------------------------------------------------------------------
--  1. `overdue` stays in the lifecycle definition to preserve the D01
--     seeded graph exactly.
--  2. Existing CAPA behaviour does not use status='overdue'. Nothing
--     writes it: CapaManagementPage offers only six status buttons
--     (open, investigating, action_planned, in_progress, verification,
--     closed), no trigger or database function writes it, and the alert
--     scanner only reads.
--  3. Overdue REPORTING stays derived from due_date, exactly as today.
--     Six independent consumers compute `due_date < now AND status <>
--     'closed'` — CapaManagementPage, compliance-alert-scanner,
--     audit-prep-assembler, complianceDriftService,
--     complianceOSReportService and aiInsightsService. None of them is
--     touched by this migration.
--  4. No new writer of status='overdue' is introduced here.
--  5. Whether to retire `overdue` from the lifecycle, or make it a
--     genuine automated state, is deferred to a separate workflow-design
--     task. This migration does not decide it.
--
-- ---------------------------------------------------------------------
--  THE SCHEDULED CREATION PATH
-- ---------------------------------------------------------------------
--  sweep_overdue_obligations() — SECURITY DEFINER, run by pg_cron at
--  0 2 * * * — INSERTs CAPA rows with status='open' and created_by NULL,
--  from a session with no JWT and no authenticated user.
--
--  The initialisation trigger below therefore passes NO actor to
--  lifecycle_initialize(). The engine derives the actor from the session:
--  a real user's insert is attributed to them, and the cron path records
--  a NULL actor rather than a fabricated one. Passing created_by instead
--  would be worse in both directions — it is NULL for cron anyway, and an
--  insert where created_by differs from the caller would be rejected as
--  LIFECYCLE_ACTOR_MISMATCH, breaking a working path.
--
--  This migration does not modify the scheduled job.
--
-- ---------------------------------------------------------------------
--  STATUS ARCHITECTURE: server-maintained read model (option B)
-- ---------------------------------------------------------------------
--  capa_records.status is read by capaService (getCapas,
--  hasPendingCapaForControl), CapaManagementPage, complianceDriftService,
--  complianceOSReportService, aiInsightsService, the audit-prep-assembler
--  and compliance-alert-scanner Edge Functions, and by
--  sweep_overdue_obligations() itself inside the database.
--
--  That is two deployed Edge Functions and a cron job in addition to the
--  application. Removing the column would mean rewriting all of them in
--  the same change that moves the workflow. The column is kept, derived
--  from entity_current_state by trigger, and made unwritable by anything
--  else — so there is exactly one writer of state (the engine) and one
--  writer of status (the sync trigger). That is not dual-writing.
--
--  NO COMMENT REQUIREMENT IS ADDED. CAPA has none today: updateCapaStatus
--  takes no comment or reason argument, and the UI collects none. Change
--  Control had an existing browser-enforced rejection reason to migrate;
--  CAPA has no equivalent, so inventing one would be a new business rule
--  rather than a migration.
-- =====================================================================


-- ── 1. Backfill existing records ─────────────────────────────────────
INSERT INTO public.entity_current_state
  (company_id, definition_id, entity_type, entity_id, state_id, entered_at, entered_by, updated_at)
SELECT c.company_id,
       public.lifecycle_resolve_definition('capa_record', c.company_id),
       'capa_record',
       c.id,
       s.id,
       coalesce(c.closed_at, c.created_at, now()),
       c.created_by,
       now()
  FROM public.capa_records c
  JOIN public.lifecycle_states s
    ON s.definition_id = public.lifecycle_resolve_definition('capa_record', c.company_id)
   AND s.state_key = c.status
 WHERE public.lifecycle_resolve_definition('capa_record', c.company_id) IS NOT NULL
ON CONFLICT (definition_id, entity_id) DO NOTHING;

-- One adoption record per row. No historical transitions are fabricated:
-- the source holds a current status only, so from_state_id is NULL.
INSERT INTO public.entity_state_history
  (company_id, definition_id, entity_type, entity_id, from_state_id, to_state_id, transition_id, actor_id, comment, metadata, created_at)
SELECT ecs.company_id, ecs.definition_id, 'capa_record', ecs.entity_id,
       NULL, ecs.state_id, NULL, ecs.entered_by, NULL,
       jsonb_build_object('reason','backfill_d03','source','capa_records.status'),
       ecs.entered_at
  FROM public.entity_current_state ecs
 WHERE ecs.entity_type = 'capa_record'
   AND NOT EXISTS (SELECT 1 FROM public.entity_state_history h
                    WHERE h.entity_type = 'capa_record' AND h.entity_id = ecs.entity_id);

DO $verify$
DECLARE v_missing int;
BEGIN
  SELECT count(*) INTO v_missing
    FROM public.capa_records c
   WHERE NOT EXISTS (SELECT 1 FROM public.entity_current_state ecs
                      WHERE ecs.entity_type='capa_record' AND ecs.entity_id = c.id);
  IF v_missing > 0 THEN
    RAISE EXCEPTION 'CAPA_BACKFILL_INCOMPLETE: % row(s) have no lifecycle state', v_missing;
  END IF;
END
$verify$;


-- ── 2. Every new CAPA gets lifecycle state, whoever creates it ───────
--  No actor is passed. See the header: the engine derives it, so the
--  cron path records NULL rather than an invented user.
CREATE OR REPLACE FUNCTION public.fn_capa_records_initialize_lifecycle()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.lifecycle_initialize('capa_record', NEW.id, NEW.company_id, NULL, NULL);
  RETURN NULL;
EXCEPTION WHEN others THEN
  IF SQLERRM LIKE 'LIFECYCLE_ALREADY_INITIALIZED%' THEN RETURN NULL; END IF;
  RAISE;
END
$$;

DROP TRIGGER IF EXISTS trg_capa_records_initialize_lifecycle ON public.capa_records;
CREATE TRIGGER trg_capa_records_initialize_lifecycle
  AFTER INSERT ON public.capa_records
  FOR EACH ROW EXECUTE FUNCTION public.fn_capa_records_initialize_lifecycle();


-- ── 3. status becomes a derived read model ───────────────────────────
--  closed_at is maintained here too. It was previously stamped by the
--  client alongside the status write; with status now written only by
--  this trigger, keeping closed_at in the client would leave it NULL for
--  any transition that did not come through the UI. It is set on entry
--  to `closed` and, as before, never cleared.
CREATE OR REPLACE FUNCTION public.fn_capa_records_sync_status()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_key text;
BEGIN
  IF NEW.entity_type <> 'capa_record' THEN RETURN NULL; END IF;

  SELECT state_key INTO v_key FROM public.lifecycle_states WHERE id = NEW.state_id;
  IF v_key IS NULL THEN RETURN NULL; END IF;

  PERFORM set_config('app.lifecycle_capa_sync', '1', true);
  UPDATE public.capa_records
     SET status    = v_key,
         closed_at = CASE WHEN v_key = 'closed' THEN coalesce(closed_at, now()) ELSE closed_at END
   WHERE id = NEW.entity_id
     AND (status IS DISTINCT FROM v_key
          OR (v_key = 'closed' AND closed_at IS NULL));
  PERFORM set_config('app.lifecycle_capa_sync', '', true);

  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS trg_entity_current_state_sync_capa ON public.entity_current_state;
CREATE TRIGGER trg_entity_current_state_sync_capa
  AFTER INSERT OR UPDATE OF state_id ON public.entity_current_state
  FOR EACH ROW EXECUTE FUNCTION public.fn_capa_records_sync_status();


-- ── 4. The no-dual-write guard ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_capa_records_guard_status()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND coalesce(current_setting('app.lifecycle_capa_sync', true), '') <> '1' THEN
    RAISE EXCEPTION 'CAPA_STATUS_READ_ONLY: status is derived from the lifecycle engine; use lifecycle_transition() instead of writing it'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_capa_records_guard_status ON public.capa_records;
CREATE TRIGGER trg_capa_records_guard_status
  BEFORE UPDATE ON public.capa_records
  FOR EACH ROW EXECUTE FUNCTION public.fn_capa_records_guard_status();


-- ── 5. Retire the obsolete CHECK constraint ──────────────────────────
ALTER TABLE public.capa_records DROP CONSTRAINT IF EXISTS capa_records_status_check;

COMMENT ON COLUMN public.capa_records.status IS
  'DERIVED read model. Maintained by fn_capa_records_sync_status() from entity_current_state; direct writes are rejected. The lifecycle engine is authoritative — change state with lifecycle_transition(). Note: ''overdue'' is a legacy state of the seeded lifecycle that nothing currently writes; overdue reporting is derived from due_date.';
