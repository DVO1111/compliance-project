-- =====================================================================
--  D03 — SOP / DOCUMENT CONTROL ADOPTS THE LIFECYCLE ENGINE
--        + the publish operation becomes atomic
-- =====================================================================
--  SOP only. Change Control and CAPA are untouched.
--
-- ---------------------------------------------------------------------
--  WHY THIS MIGRATION DOES TWO THINGS
-- ---------------------------------------------------------------------
--  SOP is not shaped like Change Control or CAPA. There are two tables,
--  each with its own status column:
--
--    sop_documents  — the document family. status has 6 values, matching
--                     the D01 `sop_document` lifecycle exactly.
--    sop_versions   — the versions. status has 5 values of its own
--                     (no `obsolete`), and sop_acknowledgements hangs off
--                     a version, not the document.
--
--  Publishing a version was three separate PostgREST calls from the
--  browser (sopService.publishSopVersion):
--
--    1. UPDATE sop_versions  SET status='superseded'
--         WHERE sop_id=? AND status='effective'
--    2. UPDATE sop_versions  SET status='effective', approved_by, ...
--         WHERE id=?
--    3. UPDATE sop_documents SET status='effective', current_version, ...
--         WHERE id=?
--
--  Nothing shared a transaction, and the "one effective version per
--  document" rule existed ONLY as the WHERE clause in step 1. A tab
--  closing between 1 and 2 leaves the document with no effective
--  version; between 2 and 3 leaves current_version stale.
--
--  Adopting the lifecycle for the parent alone would have made this
--  worse: step 3 would become an engine call while 1 and 2 stayed raw
--  writes, so the coupled operation would span an engine transaction and
--  two unrelated ones. So the publish operation is moved server-side
--  into one function first, and the parent's state change inside it goes
--  through the engine.
--
--  DELIBERATE BOUNDARY: sop_versions does NOT get its own lifecycle
--  definition. It stays a version-level model, managed by the publish
--  operation. The engine models the document family only. The
--  cross-record invariant is held by the transaction, not by pretending
--  the engine understands two tables.
--
--  GRAPH: preserved exactly as seeded — 6 states, 30 any-to-any
--  transitions. The only server-side rule on sop_documents is
--  "Company members can manage sop_documents" (FOR ALL, company-scoped),
--  with no transition rules, so tightening would be a behaviour change.
--
--  effective_date stays metadata: it is stamped by the human publish
--  action, exactly as before. No scheduler is added, and none exists —
--  the only trigger on either table is the updated_at trigger.
--
--  Overdue review stays derived from review_due_date in the reporting
--  layer. No lifecycle state is written from it and none is added.
--
--  No comment requirement is added: SOP has none today.
-- =====================================================================


-- ── 1. Backfill the document family ──────────────────────────────────
INSERT INTO public.entity_current_state
  (company_id, definition_id, entity_type, entity_id, state_id, entered_at, entered_by, updated_at)
SELECT d.company_id,
       public.lifecycle_resolve_definition('sop_document', d.company_id),
       'sop_document', d.id, s.id,
       coalesce(d.updated_at, d.created_at, now()), d.owner_id, now()
  FROM public.sop_documents d
  JOIN public.lifecycle_states s
    ON s.definition_id = public.lifecycle_resolve_definition('sop_document', d.company_id)
   AND s.state_key = d.status
 WHERE public.lifecycle_resolve_definition('sop_document', d.company_id) IS NOT NULL
ON CONFLICT (definition_id, entity_id) DO NOTHING;

INSERT INTO public.entity_state_history
  (company_id, definition_id, entity_type, entity_id, from_state_id, to_state_id, transition_id, actor_id, comment, metadata, created_at)
SELECT ecs.company_id, ecs.definition_id, 'sop_document', ecs.entity_id,
       NULL, ecs.state_id, NULL, ecs.entered_by, NULL,
       jsonb_build_object('reason','backfill_d03','source','sop_documents.status'), ecs.entered_at
  FROM public.entity_current_state ecs
 WHERE ecs.entity_type = 'sop_document'
   AND NOT EXISTS (SELECT 1 FROM public.entity_state_history h
                    WHERE h.entity_type='sop_document' AND h.entity_id = ecs.entity_id);

DO $verify$
DECLARE v_missing int;
BEGIN
  SELECT count(*) INTO v_missing FROM public.sop_documents d
   WHERE NOT EXISTS (SELECT 1 FROM public.entity_current_state ecs
                      WHERE ecs.entity_type='sop_document' AND ecs.entity_id = d.id);
  IF v_missing > 0 THEN
    RAISE EXCEPTION 'SOP_BACKFILL_INCOMPLETE: % row(s) have no lifecycle state', v_missing;
  END IF;
END
$verify$;


-- ── 2. Every new SOP gets lifecycle state ────────────────────────────
--  No actor is passed; the engine derives it from the session, so a
--  system-context insert records NULL rather than a fabricated user.
CREATE OR REPLACE FUNCTION public.fn_sop_documents_initialize_lifecycle()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.lifecycle_initialize('sop_document', NEW.id, NEW.company_id, NULL, NULL);
  RETURN NULL;
EXCEPTION WHEN others THEN
  IF SQLERRM LIKE 'LIFECYCLE_ALREADY_INITIALIZED%' THEN RETURN NULL; END IF;
  RAISE;
END
$$;

DROP TRIGGER IF EXISTS trg_sop_documents_initialize_lifecycle ON public.sop_documents;
CREATE TRIGGER trg_sop_documents_initialize_lifecycle
  AFTER INSERT ON public.sop_documents
  FOR EACH ROW EXECUTE FUNCTION public.fn_sop_documents_initialize_lifecycle();


-- ── 3. sop_documents.status becomes a derived read model ─────────────
CREATE OR REPLACE FUNCTION public.fn_sop_documents_sync_status()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_key text;
BEGIN
  IF NEW.entity_type <> 'sop_document' THEN RETURN NULL; END IF;

  SELECT state_key INTO v_key FROM public.lifecycle_states WHERE id = NEW.state_id;
  IF v_key IS NULL THEN RETURN NULL; END IF;

  PERFORM set_config('app.lifecycle_sop_sync', '1', true);
  UPDATE public.sop_documents
     SET status = v_key
   WHERE id = NEW.entity_id
     AND status IS DISTINCT FROM v_key;
  PERFORM set_config('app.lifecycle_sop_sync', '', true);

  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS trg_entity_current_state_sync_sop ON public.entity_current_state;
CREATE TRIGGER trg_entity_current_state_sync_sop
  AFTER INSERT OR UPDATE OF state_id ON public.entity_current_state
  FOR EACH ROW EXECUTE FUNCTION public.fn_sop_documents_sync_status();


-- ── 4. No direct writes to the parent status ─────────────────────────
CREATE OR REPLACE FUNCTION public.fn_sop_documents_guard_status()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND coalesce(current_setting('app.lifecycle_sop_sync', true), '') <> '1' THEN
    RAISE EXCEPTION 'SOP_STATUS_READ_ONLY: status is derived from the lifecycle engine; use lifecycle_transition() instead of writing it'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_sop_documents_guard_status ON public.sop_documents;
CREATE TRIGGER trg_sop_documents_guard_status
  BEFORE UPDATE ON public.sop_documents
  FOR EACH ROW EXECUTE FUNCTION public.fn_sop_documents_guard_status();


-- ── 5. The coupled version states cannot be set outside publish ──────
--  `effective` and `superseded` are the two version states the publish
--  operation pairs. Allowing a client to set either directly would let
--  the old three-call sequence be reconstructed by hand, which is the
--  bypass this migration exists to close. Draft/in_review/approved are
--  ordinary editorial states and stay freely writable.
CREATE OR REPLACE FUNCTION public.fn_sop_versions_guard_publish_states()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('effective','superseded')
     AND coalesce(current_setting('app.sop_publish', true), '') <> '1' THEN
    RAISE EXCEPTION 'SOP_VERSION_PUBLISH_ONLY: version status "%" is set by publish_sop_version(); it cannot be written directly', NEW.status
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_sop_versions_guard_publish_states ON public.sop_versions;
CREATE TRIGGER trg_sop_versions_guard_publish_states
  BEFORE UPDATE ON public.sop_versions
  FOR EACH ROW EXECUTE FUNCTION public.fn_sop_versions_guard_publish_states();


-- ── 6. The atomic publish operation ──────────────────────────────────
--  One function, therefore one transaction. Every write below commits
--  together or not at all: a failure anywhere leaves no superseded
--  version, no newly effective version, and no moved parent.
CREATE OR REPLACE FUNCTION public.publish_sop_version(
  p_version_id uuid,
  p_sop_id     uuid,
  p_company_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_service   boolean := public.app_is_service_context();
  v_uid       uuid    := auth.uid();
  v_company   uuid;
  v_version   text;
  v_superseded int := 0;
  v_state     text;
  v_today     date := current_date;
  v_moved     boolean := false;
BEGIN
  -- ── authorisation ──────────────────────────────────────────────────
  -- SECURITY DEFINER bypasses RLS, so the tenancy check is explicit.
  -- The parent's own transition is additionally checked by the engine.
  IF NOT v_service THEN
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'SOP_NOT_AUTHENTICATED: no authenticated user' USING ERRCODE = 'P0001';
    END IF;
    IF NOT public.app_is_company_member(p_company_id, v_uid) THEN
      RAISE EXCEPTION 'SOP_FORBIDDEN: caller is not a member of the named company' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  SELECT company_id INTO v_company FROM public.sop_documents WHERE id = p_sop_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'SOP_NOT_FOUND: no such SOP document' USING ERRCODE = 'P0002';
  END IF;
  IF v_company IS DISTINCT FROM p_company_id THEN
    RAISE EXCEPTION 'SOP_COMPANY_MISMATCH: SOP % does not belong to the named company', p_sop_id
      USING ERRCODE = 'P0001';
  END IF;

  -- the version must belong to this document; otherwise a caller could
  -- publish another family's version into this one
  IF NOT EXISTS (SELECT 1 FROM public.sop_versions WHERE id = p_version_id AND sop_id = p_sop_id) THEN
    RAISE EXCEPTION 'SOP_VERSION_MISMATCH: version % does not belong to SOP %', p_version_id, p_sop_id
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM set_config('app.sop_publish', '1', true);

  -- ── 1. supersede whatever is currently effective ───────────────────
  UPDATE public.sop_versions
     SET status = 'superseded'
   WHERE sop_id = p_sop_id AND status = 'effective' AND id <> p_version_id;
  GET DIAGNOSTICS v_superseded = ROW_COUNT;

  -- ── 2. make the requested version effective ────────────────────────
  --  approved_by comes from the session, never from the caller's
  --  arguments: a publish is a human act and must be attributed to the
  --  human who performed it.
  UPDATE public.sop_versions
     SET status         = 'effective',
         approved_by    = coalesce(approved_by, v_uid),
         approved_at    = coalesce(approved_at, now()),
         effective_date = coalesce(effective_date, v_today)
   WHERE id = p_version_id
   RETURNING version_number INTO v_version;

  -- ── 3. move the parent through the ENGINE, not by writing status ───
  --  The seeded graph has no self-transitions (lifecycle_transitions_no_self),
  --  so publishing a second version while the document is already
  --  effective must not attempt set_effective again. The version work
  --  above still happens; only the parent's state is already correct.
  SELECT s.state_key INTO v_state
    FROM public.entity_current_state ecs
    JOIN public.lifecycle_states s ON s.id = ecs.state_id
   WHERE ecs.entity_type = 'sop_document' AND ecs.entity_id = p_sop_id;

  IF v_state IS NULL THEN
    RAISE EXCEPTION 'SOP_NOT_INITIALIZED: SOP % has no lifecycle state', p_sop_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_state <> 'effective' THEN
    PERFORM public.lifecycle_transition(
      'sop_document', p_sop_id, 'set_effective', p_company_id,
      NULL, NULL,
      jsonb_build_object('reason','publish_sop_version',
                         'version_id', p_version_id,
                         'version_number', v_version));
    v_moved := true;
  END IF;

  -- ── 4. parent metadata (never status — the mirror owns that) ───────
  UPDATE public.sop_documents
     SET current_version = v_version,
         effective_date  = v_today
   WHERE id = p_sop_id;

  PERFORM set_config('app.sop_publish', '', true);

  RETURN jsonb_build_object(
    'sop_id',             p_sop_id,
    'version_id',         p_version_id,
    'version_number',     v_version,
    'superseded_count',   v_superseded,
    'parent_transitioned', v_moved,
    'effective_date',     v_today,
    -- the actor the DATABASE resolved from the session, so the caller
    -- records the publisher it actually was rather than one it asserted
    'actor_id',           v_uid
  );
END
$$;

COMMENT ON FUNCTION public.publish_sop_version(uuid,uuid,uuid) IS
  'Atomically publishes an SOP version: supersedes the previously effective version, makes the requested one effective, moves the parent document through the lifecycle engine, and updates parent metadata — all in one transaction.';

REVOKE ALL ON FUNCTION public.publish_sop_version(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_sop_version(uuid,uuid,uuid) TO authenticated, service_role;


-- ── 7. Retire the obsolete CHECK constraint ──────────────────────────
ALTER TABLE public.sop_documents DROP CONSTRAINT IF EXISTS sop_documents_status_check;

COMMENT ON COLUMN public.sop_documents.status IS
  'DERIVED read model. Maintained by fn_sop_documents_sync_status() from entity_current_state; direct writes are rejected. The lifecycle engine is authoritative — change state with lifecycle_transition(), or publish_sop_version() for the coupled version publish.';
COMMENT ON COLUMN public.sop_versions.status IS
  'Version-level state. Deliberately NOT a lifecycle engine entity: the engine models the document family. ''effective'' and ''superseded'' are set only by publish_sop_version(), which pairs them in one transaction.';
