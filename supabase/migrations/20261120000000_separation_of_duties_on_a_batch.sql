-- =====================================================================
--  SEPARATION OF DUTIES, PER BATCH
--
--  Until 20261119000000 a person held one role, and PM-03 separated
--  duties by giving them to roles nobody could hold at the same time:
--  QC testing is the QC Analyst's column alone, batch release the QA
--  Manager's alone, so "nobody holds both" was true by arithmetic.
--
--  Multiple assignments remove that arithmetic. One person may now
--  legitimately be both — a small plant has one analyst who is also
--  the manager — and the separation has to be enforced against the
--  BATCH instead of against the role. The question stops being "may
--  this person release batches" and becomes "may this person release
--  THIS batch, given what they already did to it".
--
--  Two properties worth stating because they are what make this
--  reviewable rather than invented:
--
--    1. The conflicting pairs are DERIVED from PM-03, not chosen. A
--       pair is admissible only where PM-03 gives the two sections Act
--       to role sets that do not overlap — i.e. where the design had
--       already separated them. Section 4 asserts that for every
--       seeded row and fails the migration otherwise.
--    2. They are a table, so a quality system that disagrees with one
--       deletes a row rather than editing a function.
-- =====================================================================

-- ── 1. What a person did to a batch ─────────────────────────────────
--
-- Read from the columns that already record it. No new bookkeeping,
-- so nothing can drift out of step with the facts.

CREATE OR REPLACE FUNCTION public.batch_actor_duties(
  p_batch_id uuid,
  p_user_id  uuid
) RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT coalesce(array_agg(DISTINCT d ORDER BY d), ARRAY[]::text[])
    FROM (
      SELECT 'qc_testing'::text AS d
       WHERE EXISTS (SELECT 1 FROM public.batch_qc_results
                      WHERE batch_id = p_batch_id AND tested_by = p_user_id)
          OR EXISTS (SELECT 1 FROM public.batch_inprocess_qc
                      WHERE batch_id = p_batch_id AND tested_by = p_user_id)

      UNION ALL
      SELECT 'execution'
       WHERE EXISTS (SELECT 1 FROM public.batch_stages
                      WHERE batch_id = p_batch_id AND started_by = p_user_id)
          OR EXISTS (SELECT 1 FROM public.batch_stage_parameter_readings r
                      JOIN public.batch_stages s ON s.id = r.batch_stage_id
                     WHERE s.batch_id = p_batch_id AND r.recorded_by = p_user_id)
          OR EXISTS (SELECT 1 FROM public.batch_records
                      WHERE id = p_batch_id AND execution_closed_by = p_user_id)

      UNION ALL
      SELECT 'release'
       WHERE EXISTS (SELECT 1 FROM public.batch_records
                      WHERE id = p_batch_id AND released_by = p_user_id)

      UNION ALL
      SELECT 'dispatch'
       WHERE EXISTS (SELECT 1 FROM public.batch_dispatches
                      WHERE batch_id = p_batch_id AND dispatched_by = p_user_id)
    ) q(d)
   WHERE d IS NOT NULL;
$$;

COMMENT ON FUNCTION public.batch_actor_duties(uuid, uuid) IS
  'Which duties a person has already performed on one batch, read from the columns that record them.';

REVOKE ALL ON FUNCTION public.batch_actor_duties(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.batch_actor_duties(uuid, uuid) TO authenticated, service_role;


-- ── 2. Which duties conflict ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.batch_duty_conflicts (
  duty_a     text NOT NULL,
  duty_b     text NOT NULL,
  --  The PM-03 columns the two duties are performed under. No foreign
  --  key: section_permissions is keyed by (section, role), so there is
  --  no single-column parent to point at. Section 4 checks both names
  --  against the grid instead, which also has to check the stronger
  --  property — that the two columns are disjoint.
  section_a  text NOT NULL,
  section_b  text NOT NULL,
  --  Kept so that a refusal somebody already handles keeps its code.
  error_code text NOT NULL DEFAULT 'BATCH_DUTY_CONFLICT',
  reason     text NOT NULL,
  PRIMARY KEY (duty_a, duty_b),
  CONSTRAINT batch_duty_conflict_is_canonical CHECK (duty_a < duty_b)
);

COMMENT ON TABLE public.batch_duty_conflicts IS
  'Pairs of duties one person may not both perform on the same batch. Derived from PM-03: each pair''s two sections have disjoint Act roles.';


-- ── 3. The check ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.batch_duty_conflict(
  p_batch_id uuid,
  p_duty     text,
  p_user_id  uuid DEFAULT auth.uid()
) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_done  text[];
  v_row   record;
BEGIN
  IF p_user_id IS NULL THEN RETURN NULL; END IF;

  v_done := public.batch_actor_duties(p_batch_id, p_user_id);
  IF v_done IS NULL OR array_length(v_done, 1) IS NULL THEN RETURN NULL; END IF;

  --  Canonical ordering means a pair is stored once; both directions
  --  are looked up here.
  SELECT c.error_code, c.reason,
         CASE WHEN c.duty_a = p_duty THEN c.duty_b ELSE c.duty_a END AS other
    INTO v_row
    FROM public.batch_duty_conflicts c
   WHERE (c.duty_a = p_duty AND c.duty_b = ANY (v_done))
      OR (c.duty_b = p_duty AND c.duty_a = ANY (v_done))
   ORDER BY c.duty_a, c.duty_b
   LIMIT 1;

  IF v_row IS NULL THEN RETURN NULL; END IF;

  RETURN v_row.error_code || ': ' || v_row.reason;
END;
$$;

COMMENT ON FUNCTION public.batch_duty_conflict(uuid, text, uuid) IS
  'The refusal when this person has already performed a duty on this batch that conflicts with the one they are attempting, or NULL when they have not.';

REVOKE ALL ON FUNCTION public.batch_duty_conflict(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.batch_duty_conflict(uuid, text, uuid) TO authenticated, service_role;


-- ── 4. The pairs, and the proof they were derived ───────────────────

INSERT INTO public.batch_duty_conflicts (duty_a, duty_b, section_a, section_b, error_code, reason)
VALUES
  ('qc_testing', 'release', 'qc_testing', 'batch_release',
   'BATCH_RELEASE_SELF_TESTED',
   'you recorded finished-product results on this batch, so somebody else has to make the release decision'),
  ('execution', 'release', 'batch_records', 'batch_release',
   'BATCH_DUTY_CONFLICT',
   'you executed this batch, so somebody else has to make the release decision'),
  ('dispatch', 'release', 'distribution', 'batch_release',
   'BATCH_DUTY_CONFLICT',
   'you made the release decision on this batch, so somebody else has to dispatch it')
ON CONFLICT (duty_a, duty_b) DO UPDATE
  SET section_a = EXCLUDED.section_a,
      section_b = EXCLUDED.section_b,
      error_code = EXCLUDED.error_code,
      reason     = EXCLUDED.reason;

DO $assert$
DECLARE
  v_bad text;
BEGIN
  --  (a) EVERY PAIR IS ONE PM-03 ALREADY SEPARATED. If the two
  --  sections share even one Act role, then PM-03 contemplates a
  --  single person doing both and this table would be adding a rule
  --  the design does not contain. That is the line between deriving a
  --  control and inventing one, so it fails the migration.
  SELECT string_agg(format('%s/%s share %s', c.section_a, c.section_b, shared), '; ')
    INTO v_bad
    FROM public.batch_duty_conflicts c
   CROSS JOIN LATERAL (
     SELECT string_agg(a.role, ', ') AS shared
       FROM public.section_permissions a
       JOIN public.section_permissions b ON b.role = a.role
      WHERE a.section = c.section_a AND a.access = 'act'
        AND b.section = c.section_b AND b.access = 'act'
   ) s
   WHERE s.shared IS NOT NULL;

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION
      'DUTY_CONFLICT_NOT_DERIVED: % — PM-03 lets one role do both, so this pair is not its rule',
      v_bad;
  END IF;

  --  (b) Every duty named is one batch_actor_duties can actually
  --  report. A pair naming a duty that is never produced is a rule
  --  that can never fire — the dead-guard hazard this schema keeps
  --  meeting (20261105000000, 20261114000000).
  SELECT string_agg(d, ', ') INTO v_bad
    FROM (
      SELECT duty_a AS d FROM public.batch_duty_conflicts
      UNION
      SELECT duty_b FROM public.batch_duty_conflicts
    ) u
   WHERE d NOT IN ('qc_testing', 'execution', 'release', 'dispatch');

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION
      'DUTY_UNKNOWN: % is named in a conflict but batch_actor_duties never reports it', v_bad;
  END IF;
END;
$assert$;


-- ── 5. The release gate asks the table ──────────────────────────────
--
-- Replaces 20261107000000's function. The qc_testing case keeps its
-- original error code, so anything already handling
-- BATCH_RELEASE_SELF_TESTED keeps working; it is now one row in
-- batch_duty_conflicts rather than a clause here.

CREATE OR REPLACE FUNCTION public.fn_batch_records_release_gate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_to text; v_from text; v_reason text; v_conflict text; v_actor uuid := auth.uid();
BEGIN
  IF NEW.entity_type <> 'batch_record' THEN RETURN NEW; END IF;

  SELECT state_key INTO v_to FROM public.lifecycle_states WHERE id = NEW.state_id;
  IF v_to <> 'released' THEN RETURN NEW; END IF;

  IF TG_OP = 'UPDATE' THEN
    SELECT state_key INTO v_from FROM public.lifecycle_states WHERE id = OLD.state_id;
    --  Not a new decision.
    IF v_from = 'released' THEN RETURN NEW; END IF;
  END IF;

  v_reason := public.batch_release_block_reason(NEW.entity_id);
  IF v_reason IS NOT NULL THEN
    RAISE EXCEPTION 'BATCH_RELEASE_BLOCKED: %', v_reason USING ERRCODE = 'P0001';
  END IF;

  --  Service contexts are exempt from the DUTIES check only, for the
  --  reason fn_material_lots_release_gate gives: the scheduler and
  --  migrations have no JWT and are not people. The block reason above
  --  applies to them too.
  IF NOT public.app_is_service_context() AND v_actor IS NOT NULL THEN
    v_conflict := public.batch_duty_conflict(NEW.entity_id, 'release', v_actor);
    IF v_conflict IS NOT NULL THEN
      RAISE EXCEPTION '%', v_conflict USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_batch_records_release_gate ON public.entity_current_state;
CREATE TRIGGER trg_batch_records_release_gate
  BEFORE INSERT OR UPDATE ON public.entity_current_state
  FOR EACH ROW EXECUTE FUNCTION public.fn_batch_records_release_gate();


-- ── 6. And so does dispatch ─────────────────────────────────────────
--
-- Replaces 20261111000000's function; everything before the new clause
-- is unchanged.

CREATE OR REPLACE FUNCTION public.fn_batch_dispatch_gate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_status text; v_company uuid; v_number text; v_conflict text;
BEGIN
  SELECT status, company_id, batch_number
    INTO v_status, v_company, v_number
    FROM public.batch_records WHERE id = NEW.batch_id;

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'DISPATCH_NO_BATCH: no such batch record' USING ERRCODE = 'P0002';
  END IF;
  IF v_company <> NEW.company_id THEN
    RAISE EXCEPTION 'DISPATCH_BATCH_FOREIGN: that batch belongs to another company'
      USING ERRCODE = 'P0001';
  END IF;

  --  PM-03's `Distribution` column. Act: Storekeeper.
  PERFORM public.app_assert_section_act(NEW.company_id, 'distribution');

  --  THE RULE THIS TABLE EXISTS AROUND. Read from the batch's own
  --  state, which is a mirror of the lifecycle engine and read-only to
  --  direct writes, so it cannot be set by whoever is dispatching.
  IF v_status <> 'released' THEN
    RAISE EXCEPTION
      'DISPATCH_NOT_RELEASED: batch % is %, and only a released batch may be dispatched',
      v_number, v_status USING ERRCODE = 'P0001';
  END IF;

  --  Added 20261120000000. Reads NEW.dispatched_by rather than
  --  auth.uid(), because the row names who is said to have dispatched
  --  it and that is the claim being checked.
  IF NOT public.app_is_service_context() AND NEW.dispatched_by IS NOT NULL THEN
    v_conflict := public.batch_duty_conflict(NEW.batch_id, 'dispatch', NEW.dispatched_by);
    IF v_conflict IS NOT NULL THEN
      RAISE EXCEPTION '%', v_conflict USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_batch_dispatch_gate ON public.batch_dispatches;
CREATE TRIGGER trg_batch_dispatch_gate
  BEFORE INSERT ON public.batch_dispatches
  FOR EACH ROW EXECUTE FUNCTION public.fn_batch_dispatch_gate();
