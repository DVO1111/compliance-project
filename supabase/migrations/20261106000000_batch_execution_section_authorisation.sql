-- PM-03's SECTION grid, enforced by the database, starting with batch
-- execution.
--
-- ── WHAT 20261104000000 LEFT OPEN ──
--
-- That migration enforced PM-03's five named STEPS. PM-03 has a second,
-- larger statement: an 8 x 11 grid of sections, each cell Act, View or
-- no access. Nothing enforced the grid.
--
-- The difference is not academic. "Release a batch" is a step and is
-- guarded. RUNNING a batch is not a step — it is the `Batch records`
-- column, where PM-03 gives Act to the Production supervisor and View
-- to everybody else it tabulates, QA Manager included. Before this
-- file, every batch-execution RPC checked company membership and
-- nothing else:
--
--   batch_stage_start           membership
--   batch_stage_complete        membership
--   batch_stage_record_reading  membership
--   material_dispense           membership
--   batch_record_initiate       membership
--
-- So a Storekeeper holding the anon key could start a stage, weigh
-- material into a batch, record readings and sign the stage off. The
-- application refuses it (roleAccess.ts), which is the same inversion
-- 20261104000000 was written to fix: the interface asserting a rule the
-- database does not hold.
--
-- ── WHY A GRID TABLE AND NOT EIGHT CASE STATEMENTS ──
--
-- 88 cells transcribed into plpgsql is 88 chances to transpose a row.
-- As rows they can be counted, diffed against the TypeScript grid by a
-- test, and read in the same shape PM-03 draws them.
--
-- ── WHAT IS GUARDED HERE, AND WHAT IS NOT ──
--
-- Guarded: the four write paths that constitute acting on a batch
-- record — instantiating one, moving a stage, recording a reading, and
-- dispensing into it. Dispensing is in this section rather than in
-- `Material lots` because the flow card the dashboards draw puts it at
-- stage 05 PRODUCTION, governed by `batch_records`; a lot is read by
-- dispensing, and the thing being written is the batch.
--
-- NOT guarded: the other ten sections. Their write paths are a
-- different piece of work, and a half-applied grid that looked complete
-- would be worse than one that is plainly partial. `batch_release` in
-- particular already has a step guard, which is stricter.
--
-- ── THE TWO SILENCES, HANDLED AS 20261104000000 HANDLES THEM ──
--
-- A role outside PM-03's eight abstains, for the reason written at
-- length in that file: refusing on a silence locks existing workspaces
-- out of their own work. A service context is exempt, same as there.


-- ── 1. The grid ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.section_permissions (
  section     text NOT NULL,
  role        text NOT NULL,
  access      text NOT NULL CHECK (access IN ('act', 'view', 'none')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (section, role)
);

ALTER TABLE public.section_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS section_permissions_select ON public.section_permissions;
CREATE POLICY section_permissions_select ON public.section_permissions
  FOR SELECT TO authenticated USING (true);

--  No write policy, for the same reason step_permissions has none:
--  these are the quality system's rules, changed by a migration.

--  PM-03 cell for cell. Written as one VALUES list per role, in the
--  design's own column order, so a row reads left to right against the
--  frame. Deliberately the same shape and the same order as the tuples
--  in src/lib/access/roleAccess.ts.
--
--  THE TWO ARE COMPARED BY A TEST, and they need to be: the qa_officer
--  row here was wrong when it was first written. It gave that role Act
--  on `batch_release` and on `distribution` where roleAccess.ts has
--  View for both — a transposition made while re-typing the same grid
--  into a second language, which is the exact failure the tuple layout
--  was chosen to make visible and which happened anyway on the way
--  across. src/tests/sectionGrid.test.ts now reads this array out of
--  this file and compares it cell by cell.
--
--                        sup   gds   lot   qc    dis   bat   rel   dev   coa   trc   dst
WITH grid(role, cells) AS (VALUES
  ('procurement',           ARRAY['act','view','view','none','none','none','none','view','view','view','none']),
  ('storekeeper',           ARRAY['view','act','act','none','none','view','none','none','none','view','act']),
  ('qc_analyst',            ARRAY['none','view','view','act','none','view','none','act','view','view','none']),
  ('qa_officer',            ARRAY['view','view','view','view','act','view','view','act','act','view','view']),
  ('qa_manager',            ARRAY['act','view','view','view','act','view','act','act','act','act','view']),
  ('production_supervisor', ARRAY['none','none','view','none','none','act','none','act','none','view','none']),
  ('compliance_admin',      ARRAY['view','view','view','view','view','view','view','view','view','view','view']),
  ('management',            ARRAY['view','view','view','view','view','view','view','view','view','view','view'])
), cols(section, ord) AS (VALUES
  ('suppliers', 1), ('goods_receipt', 2), ('material_lots', 3), ('qc_testing', 4),
  ('qa_disposition', 5), ('batch_records', 6), ('batch_release', 7),
  ('deviation_capa', 8), ('coa_register', 9), ('traceability', 10), ('distribution', 11)
)
INSERT INTO public.section_permissions (section, role, access)
SELECT cols.section, grid.role, grid.cells[cols.ord]
  FROM grid CROSS JOIN cols
ON CONFLICT (section, role) DO UPDATE SET access = EXCLUDED.access;


-- ── 2. Reading a cell, and asserting one ────────────────────────────

CREATE OR REPLACE FUNCTION public.app_section_access(
  p_company_id uuid,
  p_section    text,
  p_user_id    uuid DEFAULT auth.uid()
) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT sp.access
    FROM public.section_permissions sp
   WHERE sp.section = p_section
     AND sp.role = public.app_work_role(p_company_id, p_user_id);
$$;

COMMENT ON FUNCTION public.app_section_access(uuid, text, uuid) IS
  'The PM-03 cell for a person and a section: act, view or none. NULL when their role is not one of PM-03''s eight, which is a silence rather than a refusal.';

REVOKE ALL ON FUNCTION public.app_section_access(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_section_access(uuid, text, uuid) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.app_assert_section_act(
  p_company_id uuid,
  p_section    text
) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_access text;
  v_role   text;
  v_actors text;
BEGIN
  --  A section with no column is not silently permitted: that would
  --  make guarding a new table a way to grant access to everyone.
  --
  --  CHECKED BEFORE THE SERVICE-CONTEXT EXEMPTION, deliberately. This
  --  raise exists to catch a misspelled section in a guard, and a
  --  migration or backfill is exactly the context where a new guard
  --  runs for the first time. Exempting service callers first would
  --  have made the typo silent for every caller that could still have
  --  found it. The suite caught this ordering: A4 called the function
  --  with 'batch_recrods' from psql and it returned cleanly.
  IF NOT EXISTS (SELECT 1 FROM public.section_permissions WHERE section = p_section) THEN
    RAISE EXCEPTION 'SECTION_UNKNOWN: no permission column for section %', p_section
      USING ERRCODE = 'P0001';
  END IF;

  --  Migrations, backfills and the SQL suite.
  IF public.app_is_service_context() THEN RETURN; END IF;

  v_role   := public.app_work_role(p_company_id);
  v_access := public.app_section_access(p_company_id, p_section);

  --  SEE THE HEADER. A role PM-03 does not tabulate abstains; so does a
  --  person who is not a member of this company at all, because that is
  --  a membership question and every one of these RPCs already answers
  --  it with its own refusal.
  IF v_access IS NULL THEN RETURN; END IF;

  IF v_access <> 'act' THEN
    SELECT string_agg(role, ', ' ORDER BY role) INTO v_actors
      FROM public.section_permissions
     WHERE section = p_section AND access = 'act';

    RAISE EXCEPTION 'SECTION_FORBIDDEN: % has % access to % and may not act in it',
      v_role, v_access, p_section
      USING ERRCODE = 'P0001',
            HINT = coalesce('Acting in this section is reserved to: ' || v_actors,
                            'No role has act access to this section.');
  END IF;
END;
$$;

COMMENT ON FUNCTION public.app_assert_section_act(uuid, text) IS
  'Raises SECTION_FORBIDDEN unless the caller''s PM-03 cell for the section is Act. Abstains for a role PM-03 does not tabulate; service contexts are exempt.';

REVOKE ALL ON FUNCTION public.app_assert_section_act(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_assert_section_act(uuid, text) TO authenticated, service_role;


-- ── 3. Instantiating a batch record ─────────────────────────────────
--
-- Creating the record and its stages from the approved formula. Hung on
-- the table rather than inside batch_record_initiate(), so a direct
-- INSERT meets the same rule as the RPC.

CREATE OR REPLACE FUNCTION public.fn_batch_records_section_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.company_id IS NULL THEN RETURN NEW; END IF;
  PERFORM public.app_assert_section_act(NEW.company_id, 'batch_records');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_batch_records_section_role ON public.batch_records;
CREATE TRIGGER trg_batch_records_section_role
  BEFORE INSERT ON public.batch_records
  FOR EACH ROW EXECUTE FUNCTION public.fn_batch_records_section_role();


-- ── 4. Moving a stage ───────────────────────────────────────────────
--
-- Starting it, signing it, verifying it, reopening it. Every one of
-- those is a status change on batch_stages, which is why the guard is
-- on the status column rather than on four function names.
--
-- INSERT is covered by section 3's trigger on the parent record: stages
-- are instantiated with the batch, in the same transaction, by the same
-- caller. Guarding both would refuse the same caller twice.

CREATE OR REPLACE FUNCTION public.fn_batch_stages_section_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  --  Only a change of status is acting. Touching updated_at, or an
  --  UPDATE that sets status to what it already was, is not.
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF NEW.company_id IS NULL THEN RETURN NEW; END IF;

  PERFORM public.app_assert_section_act(NEW.company_id, 'batch_records');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_batch_stages_section_role ON public.batch_stages;
CREATE TRIGGER trg_batch_stages_section_role
  BEFORE UPDATE ON public.batch_stages
  FOR EACH ROW EXECUTE FUNCTION public.fn_batch_stages_section_role();


-- ── 5. Recording a reading ──────────────────────────────────────────
--
-- A reading is append-only — a correction is a new row pointing at the
-- old one (20261011000000) — so INSERT is the whole of the write path.

CREATE OR REPLACE FUNCTION public.fn_batch_readings_section_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.company_id IS NULL THEN RETURN NEW; END IF;
  PERFORM public.app_assert_section_act(NEW.company_id, 'batch_records');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_batch_readings_section_role ON public.batch_stage_parameter_readings;
CREATE TRIGGER trg_batch_readings_section_role
  BEFORE INSERT ON public.batch_stage_parameter_readings
  FOR EACH ROW EXECUTE FUNCTION public.fn_batch_readings_section_role();


-- ── 6. Dispensing into a batch ──────────────────────────────────────
--
-- The lot-eligibility gate (fn_dispensing_gate, 20261013000000) already
-- refuses a quarantined, rejected or expired lot for every caller. It
-- says nothing about WHO is weighing, which is this file's question.
-- Both run: eligibility and authorisation are different refusals and a
-- screen should be able to tell them apart.
--
-- UPDATE is left alone. The second person's check is recorded by
-- material_dispense_verify(), which refuses the dispenser by identity;
-- that is a separation-of-duties rule, not a section rule, and folding
-- it in here would refuse a verifier PM-03 does not exclude.

CREATE OR REPLACE FUNCTION public.fn_dispensing_section_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.company_id IS NULL THEN RETURN NEW; END IF;
  PERFORM public.app_assert_section_act(NEW.company_id, 'batch_records');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dispensing_section_role ON public.dispensing_records;
CREATE TRIGGER trg_dispensing_section_role
  BEFORE INSERT ON public.dispensing_records
  FOR EACH ROW EXECUTE FUNCTION public.fn_dispensing_section_role();


-- ── 7. The grid cannot be half-applied without saying so ────────────
--
-- 20261105000000 exists because a guard named a lifecycle state that
-- did not exist, was installed, attached, and never fired, while a test
-- asserting the trigger EXISTED passed throughout. The same hazard
-- applies to a section name: a trigger calling
-- app_assert_section_act(..., 'batch_recrods') would raise
-- SECTION_UNKNOWN on every write instead of authorising anything, and
-- a typo the other way — a section seeded under a name no trigger uses
-- — would guard nothing at all.
--
-- So the shape of the grid is asserted here, at apply time, and again
-- in the suite.

DO $assert$
DECLARE
  v_sections constant text[] := ARRAY[
    'suppliers','goods_receipt','material_lots','qc_testing','qa_disposition',
    'batch_records','batch_release','deviation_capa','coa_register',
    'traceability','distribution'
  ];
  v_roles constant text[] := ARRAY[
    'procurement','storekeeper','qc_analyst','qa_officer','qa_manager',
    'production_supervisor','compliance_admin','management'
  ];
  v_rows   bigint;
  v_stray  text;
BEGIN
  SELECT count(*) INTO v_rows FROM public.section_permissions;
  IF v_rows <> array_length(v_sections, 1) * array_length(v_roles, 1) THEN
    RAISE EXCEPTION
      'SECTION_GRID_INCOMPLETE: expected % cells, found %',
      array_length(v_sections, 1) * array_length(v_roles, 1), v_rows;
  END IF;

  SELECT string_agg(DISTINCT section, ', ') INTO v_stray
    FROM public.section_permissions WHERE NOT (section = ANY (v_sections));
  IF v_stray IS NOT NULL THEN
    RAISE EXCEPTION 'SECTION_GRID_UNKNOWN_SECTION: %', v_stray;
  END IF;

  SELECT string_agg(DISTINCT role, ', ') INTO v_stray
    FROM public.section_permissions WHERE NOT (role = ANY (v_roles));
  IF v_stray IS NOT NULL THEN
    RAISE EXCEPTION 'SECTION_GRID_UNKNOWN_ROLE: %', v_stray;
  END IF;

  --  Every section a guard installed by this file names must exist as a
  --  column, or that guard refuses everything rather than authorising.
  SELECT string_agg(DISTINCT m[1], ', ') INTO v_stray
    FROM pg_proc p
    CROSS JOIN LATERAL regexp_matches(
      pg_get_functiondef(p.oid),
      'app_assert_section_act\([^,]+,\s*''([a-z_]+)''\)', 'g') AS m
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname LIKE 'fn_%_section_role'
     AND NOT EXISTS (
       SELECT 1 FROM public.section_permissions sp WHERE sp.section = m[1]);
  IF v_stray IS NOT NULL THEN
    RAISE EXCEPTION
      'SECTION_GUARD_UNKNOWN_SECTION: a guard asserts on section(s) with no column: %',
      v_stray;
  END IF;
END;
$assert$;
