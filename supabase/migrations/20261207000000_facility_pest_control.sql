-- =====================================================================
--  FACILITY LOGS, PART 4 — PEST CONTROL (W6·29, FL-12 / FL-13 / FL-14)
--
--  `pest_control` has been one of the six facility log types since
--  20261204000000, but a pest visit does not fit the shape of a
--  facility log entry. An entry is one reading in one zone; FL-13 is a
--  contracted PROVIDER, a VISIT by a named technician with a report
--  file, and MANY per-station findings inside that one visit.
--
--  ── WHAT ESTABLISHES THE FIELDS ──
--
--  W6·29's own note on FL-13, quoted in full because it is the whole
--  specification and it also states the rule:
--
--      "Fields are those PRD G3.9 names: provider, method, date,
--       findings and corrective actions. A finding marked as needing
--       action can't be closed by a note; it becomes a task with an
--       owner and a due date, alerted through the same overdue rule as
--       every facility log (engineering item 22)."
--
--  So the field list is approved (PRD G3.9, as quoted by the design)
--  and FL-13 draws every one of them concretely: the provider header
--  with its contract and methods, the visit with its technician and
--  checked-by, and the findings table STATION / WHERE / FINDING /
--  METHOD USED / ACTION.
--
--  ── THE RULE THIS MIGRATION ENFORCES, AND THE PART IT CANNOT ──
--
--  "A finding marked as needing action CAN'T BE CLOSED BY A NOTE."
--  That half is enforced here: `fn_facility_pest_finding_closure()`
--  refuses to set `resolved_at` on a finding whose `needs_action` is
--  true unless `corrective_task_id` names a task.
--
--  "It becomes a task with an owner and a due date." That half is NOT
--  implemented, and deliberately so. THERE IS NO TASK REGISTER in
--  this product. `src/lib/tasks/taskSources.ts` says so in its own
--  first line — "My tasks — derived, because there is no task
--  register" — and goes on: "It has no due date and no urgency
--  ordering, because nothing records them." A derived task is a
--  record sitting in a state only one role can move; it has no owner
--  and no due date, which is exactly what this rule requires.
--
--  The two candidates were both rejected:
--
--    - A free-text task reference would BE a note, which is the one
--      thing the design forbids.
--    - `capa_actions` has `assigned_to` and `due_date` and would fit
--      mechanically, but it hangs off `capa_records`. Making every
--      pest finding a CAPA classifies a bait station as a formal
--      corrective-and-preventive-action record, which is a quality
--      decision and not a schema convenience. FL-14 shows
--      "TASK-2026-0161", a task, not a CAPA number.
--
--  So `corrective_task_id` is a bare uuid with no foreign key and
--  nothing in the product can set it. The consequence is intended: a
--  finding marked as needing action can be recorded and shown, and
--  CANNOT be closed, until the task register exists. That is the
--  design's instruction — it may not be closed by a note — rather
--  than a loophole left open.
--
--  ── WHAT IS NOT INVENTED ──
--
--  No disposition ENUM. FL-13's ACTION column shows "—", "Normal
--  level · no action", "Watch at next visit" and a badge for the one
--  needing action. Only the last is load-bearing for the rule, so
--  `needs_action` is a boolean and the rest is `disposition_note`
--  free text — the same reasoning that left zone `grade` open.
--
--  No visit frequency enum either. FL-13 says "Fortnightly visits",
--  and `facility_zone_schedules.frequency` is constrained to daily /
--  weekly / monthly / quarterly, which does not include fortnightly.
--  Widening that CHECK would change the vocabulary of environmental
--  scheduling to fit a pest contract, so this carries its own free
--  text instead.
--
--  No automatic deviation, and no change to how facility log
--  `outcome` is derived.
-- =====================================================================

-- ── 1. The contracted provider ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.facility_pest_providers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  --  A contract is usually per site; FL-13's header sits under a site.
  site_id       uuid REFERENCES public.sites (id) ON DELETE SET NULL,

  name          text NOT NULL,
  --  "Fortnightly visits" — free text, see the header note.
  visit_frequency text,
  contract_until  date,
  --  "Bait stations, insect light traps, crack-and-crevice gel"
  methods       text[] NOT NULL DEFAULT '{}',
  --  FL-13 prints NEXT VISIT as a date on the header. It is recorded
  --  rather than computed, because a contracted visit is agreed with
  --  the provider and not derived from a frequency.
  next_visit_on date,

  is_active     boolean NOT NULL DEFAULT true,
  created_by    uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT facility_pest_provider_name_chk CHECK (btrim(name) <> '')
);

CREATE INDEX IF NOT EXISTS idx_pest_providers_company
  ON public.facility_pest_providers (company_id);


-- ── 2. A service visit ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.facility_pest_visits (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  provider_id   uuid NOT NULL REFERENCES public.facility_pest_providers (id) ON DELETE CASCADE,

  --  "PC-2026-0019". Unique per company so a visit can be quoted.
  reference     text NOT NULL,
  visited_on    date NOT NULL,
  --  The provider's technician, who is not a user of this system.
  technician_name text,
  --  "Report: greenshield-report-20oct.pdf". A reference to the file,
  --  not the file: storage is not this migration's business.
  report_file_ref text,

  --  "checked by Tunde Lawal (Storekeeper)" — somebody on our side
  --  confirms the provider's report. Nullable: a visit can be
  --  recorded before it has been checked.
  checked_by    uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  checked_at    timestamptz,

  notes         text,
  created_by    uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  UNIQUE (company_id, reference),
  CONSTRAINT facility_pest_visit_reference_chk CHECK (btrim(reference) <> ''),
  --  A check is an attributable act: both halves or neither, so a
  --  timestamp can never stand without the person who made it.
  CONSTRAINT facility_pest_visit_checked_pair_chk CHECK (
    (checked_by IS NULL AND checked_at IS NULL)
    OR (checked_by IS NOT NULL AND checked_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_pest_visits_company
  ON public.facility_pest_visits (company_id, visited_on DESC);


-- ── 3. Findings, by station ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.facility_pest_findings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  visit_id      uuid NOT NULL REFERENCES public.facility_pest_visits (id) ON DELETE CASCADE,

  --  "BS-07", "ILT-02". The provider's own station labels.
  station_code  text NOT NULL,
  --  "Warehouse W1 · dock door". Free text because a station is often
  --  somewhere a zone does not name.
  location_ref  text,
  --  Where the station does sit in a zone we know about, record it, so
  --  a finding can be read next to that zone's other logs. Nullable
  --  on purpose: FL-13 has stations in a canteen and a corridor.
  zone_id       uuid REFERENCES public.facility_zones (id) ON DELETE SET NULL,

  --  PRD G3.9's "findings" and "method".
  finding       text NOT NULL,
  method_used   text,

  /**
   *  THE ONE FLAG THE RULE TURNS ON. Marked by a person: the design
   *  says "a finding MARKED as needing action", and nothing in FL-13
   *  derives it from the finding text. Inventing a rule that decides
   *  when pest activity needs corrective action would be inventing a
   *  GMP judgement.
   */
  needs_action  boolean NOT NULL DEFAULT false,
  --  "Normal level · no action", "Watch at next visit", or empty.
  disposition_note text,

  /**
   *  The corrective-action task, when a task register exists to point
   *  at. NO FOREIGN KEY and nothing can set it today — see the header
   *  note. It is here so the closure rule below has something to
   *  require, rather than the rule being unenforceable.
   */
  corrective_task_id uuid,

  resolved_at   timestamptz,
  resolved_by   uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  resolution_note text,

  created_by    uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT facility_pest_finding_station_chk CHECK (btrim(station_code) <> ''),
  CONSTRAINT facility_pest_finding_text_chk CHECK (btrim(finding) <> ''),
  --  Same attributability rule as the visit check.
  CONSTRAINT facility_pest_finding_resolved_pair_chk CHECK (
    (resolved_at IS NULL AND resolved_by IS NULL)
    OR (resolved_at IS NOT NULL AND resolved_by IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_pest_findings_visit
  ON public.facility_pest_findings (visit_id);
CREATE INDEX IF NOT EXISTS idx_pest_findings_open
  ON public.facility_pest_findings (company_id)
  WHERE needs_action AND resolved_at IS NULL;


-- ── 4. Company agreement, as everywhere else in this feature ─────────

/**
 *  The same integrity rule 20261205000000 applies to zones and
 *  schedules: a child row carries its own company_id, so RLS alone
 *  would let a caller staple their row to another company's parent.
 */
CREATE OR REPLACE FUNCTION public.fn_facility_pest_visit_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE v_company uuid;
BEGIN
  SELECT p.company_id INTO v_company
    FROM public.facility_pest_providers p WHERE p.id = NEW.provider_id;

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'PEST_PROVIDER_NOT_FOUND';
  END IF;
  IF v_company <> NEW.company_id THEN
    RAISE EXCEPTION 'PEST_PROVIDER_WRONG_COMPANY';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_facility_pest_visit_integrity ON public.facility_pest_visits;
CREATE TRIGGER trg_facility_pest_visit_integrity
  BEFORE INSERT OR UPDATE ON public.facility_pest_visits
  FOR EACH ROW EXECUTE FUNCTION public.fn_facility_pest_visit_integrity();


/**
 *  A finding's visit must be ours, and so must the zone it names.
 *  THE CLOSURE RULE LIVES HERE TOO, because it is the same write.
 */
CREATE OR REPLACE FUNCTION public.fn_facility_pest_finding_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_visit_company uuid;
  v_zone_company  uuid;
BEGIN
  SELECT v.company_id INTO v_visit_company
    FROM public.facility_pest_visits v WHERE v.id = NEW.visit_id;

  IF v_visit_company IS NULL THEN
    RAISE EXCEPTION 'PEST_VISIT_NOT_FOUND';
  END IF;
  IF v_visit_company <> NEW.company_id THEN
    RAISE EXCEPTION 'PEST_VISIT_WRONG_COMPANY';
  END IF;

  IF NEW.zone_id IS NOT NULL THEN
    SELECT z.company_id INTO v_zone_company
      FROM public.facility_zones z WHERE z.id = NEW.zone_id;
    IF v_zone_company IS NULL THEN
      RAISE EXCEPTION 'FACILITY_ZONE_NOT_FOUND';
    END IF;
    IF v_zone_company <> NEW.company_id THEN
      RAISE EXCEPTION 'FACILITY_ZONE_WRONG_COMPANY';
    END IF;
  END IF;

  /*
   *  "A finding marked as needing action can't be closed by a note."
   *
   *  This is the sentence, enforced. A resolution_note is a note, and
   *  on its own it is not enough: the finding needs a corrective
   *  task. Nothing can supply one yet, which is why this refusal is
   *  the design's instruction rather than an obstacle — see the
   *  header.
   */
  IF NEW.resolved_at IS NOT NULL
     AND NEW.needs_action
     AND NEW.corrective_task_id IS NULL THEN
    RAISE EXCEPTION 'PEST_FINDING_NEEDS_CORRECTIVE_TASK';
  END IF;

  /*
   *  And it cannot be un-marked to get around that. Clearing
   *  needs_action on a finding that has already been closed would
   *  retrospectively turn a corrective action into a note, which is
   *  the same loophole approached from the other side.
   */
  IF TG_OP = 'UPDATE'
     AND OLD.needs_action
     AND NOT NEW.needs_action
     AND OLD.resolved_at IS NOT NULL THEN
    RAISE EXCEPTION 'PEST_FINDING_ALREADY_ACTIONED';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_facility_pest_finding_integrity ON public.facility_pest_findings;
CREATE TRIGGER trg_facility_pest_finding_integrity
  BEFORE INSERT OR UPDATE ON public.facility_pest_findings
  FOR EACH ROW EXECUTE FUNCTION public.fn_facility_pest_finding_integrity();


-- ── 5. RLS — the same company-isolation shape as the rest ────────────

ALTER TABLE public.facility_pest_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facility_pest_visits    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facility_pest_findings  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_iso_pest_providers" ON public.facility_pest_providers;
CREATE POLICY "company_iso_pest_providers" ON public.facility_pest_providers
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p
             WHERE p.id = auth.uid() AND p.company_id = facility_pest_providers.company_id)
  );

DROP POLICY IF EXISTS "company_iso_pest_visits" ON public.facility_pest_visits;
CREATE POLICY "company_iso_pest_visits" ON public.facility_pest_visits
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p
             WHERE p.id = auth.uid() AND p.company_id = facility_pest_visits.company_id)
  );

DROP POLICY IF EXISTS "company_iso_pest_findings" ON public.facility_pest_findings;
CREATE POLICY "company_iso_pest_findings" ON public.facility_pest_findings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p
             WHERE p.id = auth.uid() AND p.company_id = facility_pest_findings.company_id)
  );


-- ── 6. The register FL-13 draws ──────────────────────────────────────

/**
 *  Visits with their finding counts, newest first. SECURITY INVOKER,
 *  so the caller's own RLS decides what comes back.
 */
CREATE OR REPLACE FUNCTION public.facility_pest_register(p_company_id uuid)
RETURNS TABLE (
  visit_id          uuid,
  reference         text,
  visited_on        date,
  technician_name   text,
  report_file_ref   text,
  checked_by        uuid,
  checked_at        timestamptz,
  provider_id       uuid,
  provider_name     text,
  visit_frequency   text,
  contract_until    date,
  methods           text[],
  next_visit_on     date,
  finding_count     bigint,
  needs_action_count bigint,
  open_action_count bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT v.id, v.reference, v.visited_on, v.technician_name, v.report_file_ref,
         v.checked_by, v.checked_at,
         p.id, p.name, p.visit_frequency, p.contract_until, p.methods, p.next_visit_on,
         count(f.id),
         count(f.id) FILTER (WHERE f.needs_action),
         --  Open means marked as needing action and not yet closed.
         --  This is the number FL-13's badge counts.
         count(f.id) FILTER (WHERE f.needs_action AND f.resolved_at IS NULL)
    FROM public.facility_pest_visits v
    JOIN public.facility_pest_providers p ON p.id = v.provider_id
    LEFT JOIN public.facility_pest_findings f ON f.visit_id = v.id
   WHERE v.company_id = p_company_id
   GROUP BY v.id, v.reference, v.visited_on, v.technician_name, v.report_file_ref,
            v.checked_by, v.checked_at,
            p.id, p.name, p.visit_frequency, p.contract_until, p.methods, p.next_visit_on
   ORDER BY v.visited_on DESC, v.reference DESC
$$;

GRANT EXECUTE ON FUNCTION public.facility_pest_register(uuid) TO authenticated;
