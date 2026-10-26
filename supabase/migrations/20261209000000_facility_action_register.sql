-- =====================================================================
--  FACILITY LOGS, PART 6 — THE ACTION REGISTER (Phase 2, decision 1)
--
--  20261207000000 built pest control and enforced half of W6·29's
--  rule — "a finding marked as needing action can't be closed by a
--  note" — while refusing to build the other half, because "it
--  becomes a task with an owner and a due date" presupposed a task
--  register that did not exist, and because making every pest finding
--  a CAPA would have classified a bait station as a formal
--  corrective-and-preventive-action record.
--
--  The product owner has now settled both:
--
--      "Implement a general, auditable action register for findings
--       requiring action. Link or escalate findings to formal CAPA
--       when the approved severity, recurrence or product-impact
--       criteria require it. Never allow a finding requiring action to
--       be closed without its required action and closure evidence.
--       Define the escalation criteria explicitly rather than
--       inventing hidden rules."
--
--  ── THE LAST SENTENCE IS THE DESIGN CONSTRAINT ──
--
--  "Explicitly rather than hidden" is why `facility_escalation_criteria`
--  is a TABLE and not a CASE expression inside a trigger. A threshold
--  compiled into a function is a rule nobody can read, nobody can
--  show an inspector, and nobody can change without a migration. Here
--  each criterion is a row a company can list, and every escalation
--  decision records WHICH criterion it matched — so the answer to
--  "why did this become a CAPA?" is a row, not an archaeology exercise
--  through plpgsql.
--
--  Nothing in this migration decides what a company's criteria ARE.
--  No severity scale is invented, no recurrence window is assumed and
--  no threshold is seeded. The three BASES are fixed, because those
--  are the three the instruction names; the values are data.
--
--  ── WHAT "GENERAL" MEANS HERE ──
--
--  The register is not pest-specific. `source_kind` admits a facility
--  log entry as well as a pest finding, so an environmental breach
--  (FL-04) can raise an action through the same register when that
--  screen is built. Only the pest path is wired today, and the
--  register is the reason FL-04 will not need a second mechanism.
-- =====================================================================

-- ── 1. The criteria, as readable rows ────────────────────────────────

/**
 *  One row = one rule a company has adopted.
 *
 *  `basis` is constrained to the three the instruction names. A fourth
 *  kind of rule would be a new decision, and an unknown basis would
 *  have no defined way to be evaluated.
 */
CREATE TABLE IF NOT EXISTS public.facility_escalation_criteria (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,

  --  A short code the company quotes, e.g. "ESC-SEV-1".
  code          text NOT NULL,
  --  What the rule says, in the company's own words. Shown next to
  --  any escalation it causes.
  description   text NOT NULL,

  basis         text NOT NULL CHECK (basis IN ('severity','recurrence','product_impact')),

  /**
   *  basis = 'severity': the severity labels this criterion matches.
   *
   *  TEXT LABELS, NOT A NUMERIC SCALE, and deliberately so. No
   *  severity scale is drawn anywhere in W6·29 or stated in the
   *  instruction, so inventing "1 to 5" or "minor/major/critical"
   *  would be deciding how a company grades its own findings. A
   *  company enumerates its own labels here.
   */
  match_values  text[],

  /**
   *  basis = 'recurrence': the same station recurring `min_count`
   *  times within `window_days`. Both are the company's numbers.
   */
  window_days   integer CHECK (window_days IS NULL OR window_days > 0),
  min_count     integer CHECK (min_count IS NULL OR min_count > 1),

  /**
   *  Whether matching this criterion REQUIRES a formal CAPA, or merely
   *  flags the finding for attention. "Link or escalate … when the
   *  criteria require it" — so requiring is a property of the
   *  criterion, not of the code.
   */
  requires_capa boolean NOT NULL DEFAULT false,

  is_active     boolean NOT NULL DEFAULT true,
  created_by    uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  UNIQUE (company_id, code),
  CONSTRAINT facility_escalation_code_chk CHECK (btrim(code) <> ''),
  CONSTRAINT facility_escalation_description_chk CHECK (btrim(description) <> ''),

  /**
   *  A criterion has to be evaluable for the basis it claims. Without
   *  this, a 'severity' row with no labels would match nothing while
   *  appearing to be a rule, and a 'recurrence' row with no window
   *  would be unevaluable — both are worse than an error, because
   *  they look like protection that is not there.
   */
  CONSTRAINT facility_escalation_shape_chk CHECK (
    (basis = 'severity' AND match_values IS NOT NULL AND array_length(match_values,1) > 0)
    OR (basis = 'recurrence' AND window_days IS NOT NULL AND min_count IS NOT NULL)
    OR (basis = 'product_impact')
  )
);

CREATE INDEX IF NOT EXISTS idx_escalation_criteria_company
  ON public.facility_escalation_criteria (company_id) WHERE is_active;


-- ── 2. The findings gain what the criteria evaluate ──────────────────

/**
 *  Both are additive and nullable/defaulted, so every existing
 *  finding keeps its meaning: `severity` unstated and
 *  `affects_product` false until somebody says otherwise. A default of
 *  true would assert product impact on records nobody has assessed.
 */
ALTER TABLE public.facility_pest_findings
  ADD COLUMN IF NOT EXISTS severity text,
  ADD COLUMN IF NOT EXISTS affects_product boolean NOT NULL DEFAULT false;


-- ── 3. The register ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.facility_action_register (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,

  --  General: a pest finding today, a facility log entry when FL-04
  --  is built. The register is the reason that will not need a second
  --  mechanism.
  source_kind   text NOT NULL CHECK (source_kind IN ('pest_finding','facility_log_entry')),
  source_id     uuid NOT NULL,

  --  "A task with an owner and a due date" — the two fields W6·29
  --  names, and the two a derived task could never have.
  title         text NOT NULL,
  description   text,
  owner_id      uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  due_on        date,

  status        text NOT NULL DEFAULT 'open'
                CHECK (status IN ('open','in_progress','completed','cancelled')),

  /**
   *  CLOSURE EVIDENCE. "Never allow a finding requiring action to be
   *  closed without its required action AND closure evidence." So
   *  evidence is a field of the action, and completing an action
   *  without it is refused below.
   */
  closure_evidence text,
  closure_ref      text,
  completed_at  timestamptz,
  completed_by  uuid REFERENCES public.profiles (id) ON DELETE SET NULL,

  --  Set when a criterion requiring CAPA matched. Linked, not
  --  duplicated: the CAPA is the formal record and this points at it.
  linked_capa_id uuid REFERENCES public.capa_records (id) ON DELETE SET NULL,

  cancelled_reason text,
  created_by    uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT facility_action_title_chk CHECK (btrim(title) <> ''),

  --  Attributability: a completion timestamp and the person who made
  --  it, both or neither.
  CONSTRAINT facility_action_completed_pair_chk CHECK (
    (completed_at IS NULL AND completed_by IS NULL)
    OR (completed_at IS NOT NULL AND completed_by IS NOT NULL)
  ),
  --  A completed action carries its evidence and its completion; an
  --  action that is not completed carries neither.
  CONSTRAINT facility_action_completion_shape_chk CHECK (
    (status = 'completed'
       AND completed_at IS NOT NULL
       AND btrim(coalesce(closure_evidence,'')) <> '')
    OR (status <> 'completed' AND completed_at IS NULL)
  ),
  --  A cancelled action says why. Cancelling is how an action that
  --  should never have been raised leaves the register, and an
  --  unexplained cancellation is indistinguishable from suppression.
  CONSTRAINT facility_action_cancelled_reason_chk CHECK (
    status <> 'cancelled' OR btrim(coalesce(cancelled_reason,'')) <> ''
  )
);

CREATE INDEX IF NOT EXISTS idx_action_register_source
  ON public.facility_action_register (source_kind, source_id);
CREATE INDEX IF NOT EXISTS idx_action_register_open
  ON public.facility_action_register (company_id, due_on)
  WHERE status IN ('open','in_progress');


/**
 *  The finding's corrective action is now a row in the register, so
 *  the column that stood in for one becomes a real reference.
 *
 *  20261207000000 left `corrective_task_id` deliberately without a
 *  foreign key, because there was nothing to point at. There is now.
 *
 *  ON DELETE RESTRICT, NOT SET NULL, and the test fixture is what
 *  made the difference clear. With SET NULL, deleting an action
 *  silently stripped the evidence from a finding that had been closed
 *  on the strength of it — and then the closure invariant refused the
 *  cascade anyway, so the delete failed with a confusing error from
 *  two tables away.
 *
 *  RESTRICT states the real rule: the completed action IS the closure
 *  evidence for that finding, so it cannot be removed while the
 *  finding points at it. Deleting the finding first is the deliberate
 *  order, and the error now names the right table.
 */
/*
 *  FIRST, CLEAR ANY VALUE THAT CANNOT BE A REFERENCE.
 *
 *  Before this migration there was no table for `corrective_task_id`
 *  to point at, and 20261207000000 says so at the column: nothing in
 *  the product could set it. So by construction any value present is
 *  a placeholder that references nothing — left by a fixture, a test
 *  or a manual insert — and nulling it loses no information that ever
 *  existed.
 *
 *  Stated rather than done quietly, because this is the one
 *  data-modifying statement in the migration. It is scoped to values
 *  that have no matching action, so a real reference is never
 *  touched. `facility_pest_findings` does not exist in production at
 *  all, so this affects development and test databases only.
 */
UPDATE public.facility_pest_findings f
   SET corrective_task_id = NULL
 WHERE f.corrective_task_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.facility_action_register a WHERE a.id = f.corrective_task_id
   );

DO $fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'facility_pest_findings_corrective_task_fkey'
  ) THEN
    ALTER TABLE public.facility_pest_findings
      ADD CONSTRAINT facility_pest_findings_corrective_task_fkey
      FOREIGN KEY (corrective_task_id)
      REFERENCES public.facility_action_register (id) ON DELETE RESTRICT;
  END IF;
END
$fk$;


-- ── 4. Evaluating the criteria ───────────────────────────────────────

/**
 *  Which active criteria a pest finding matches, and whether any of
 *  them requires a CAPA.
 *
 *  Returns ROWS, not a verdict, because the point of the instruction
 *  is that the reason is inspectable: a caller gets the code and the
 *  description of every criterion that fired.
 *
 *  SECURITY INVOKER — the caller's RLS decides which criteria and
 *  findings are visible, so this cannot read another company's rules.
 */
CREATE OR REPLACE FUNCTION public.facility_escalation_matches(p_finding_id uuid)
RETURNS TABLE (
  criterion_id  uuid,
  code          text,
  description   text,
  basis         text,
  requires_capa boolean,
  detail        text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH f AS (
    SELECT pf.id, pf.company_id, pf.severity, pf.affects_product,
           pf.station_code, pv.visited_on
      FROM public.facility_pest_findings pf
      JOIN public.facility_pest_visits pv ON pv.id = pf.visit_id
     WHERE pf.id = p_finding_id
  )
  --  Severity: the finding's label is one this criterion names.
  SELECT c.id, c.code, c.description, c.basis, c.requires_capa,
         'severity ' || coalesce(f.severity,'(unstated)')
    FROM f
    JOIN public.facility_escalation_criteria c
      ON c.company_id = f.company_id AND c.is_active AND c.basis = 'severity'
   WHERE f.severity IS NOT NULL AND f.severity = ANY (c.match_values)

  UNION ALL

  --  Product impact: no threshold to compare, so the criterion
  --  matches whenever the finding is marked as affecting product.
  SELECT c.id, c.code, c.description, c.basis, c.requires_capa,
         'affects product'
    FROM f
    JOIN public.facility_escalation_criteria c
      ON c.company_id = f.company_id AND c.is_active AND c.basis = 'product_impact'
   WHERE f.affects_product

  UNION ALL

  --  Recurrence: the SAME STATION, marked as needing action, at least
  --  `min_count` times within `window_days` ending at this visit.
  --  Counted inclusively of this finding, which is why min_count is
  --  constrained to be greater than one — a single occurrence is not
  --  a recurrence.
  SELECT c.id, c.code, c.description, c.basis, c.requires_capa,
         'station ' || f.station_code || ': ' || cnt.n
           || ' findings needing action in ' || c.window_days || ' days'
    FROM f
    JOIN public.facility_escalation_criteria c
      ON c.company_id = f.company_id AND c.is_active AND c.basis = 'recurrence'
    JOIN LATERAL (
      SELECT count(*) AS n
        FROM public.facility_pest_findings pf2
        JOIN public.facility_pest_visits pv2 ON pv2.id = pf2.visit_id
       WHERE pf2.company_id = f.company_id
         AND pf2.station_code = f.station_code
         AND pf2.needs_action
         AND pv2.visited_on BETWEEN (f.visited_on - c.window_days) AND f.visited_on
    ) cnt ON cnt.n >= c.min_count
$$;

GRANT EXECUTE ON FUNCTION public.facility_escalation_matches(uuid) TO authenticated;


-- ── 5. The closure rule, now with the register behind it ─────────────

/**
 *  Replaces the closure half of fn_facility_pest_finding_integrity().
 *
 *  A finding marked as needing action may be closed only when all
 *  three hold:
 *
 *    1. a corrective action exists in the register for it;
 *    2. that action is COMPLETED and carries closure evidence;
 *    3. if any active criterion that matches the finding requires a
 *       CAPA, the action links to one.
 *
 *  (2) is the instruction's "required action and closure evidence".
 *  (3) is its "escalate to formal CAPA when the criteria require it" —
 *  and because the criteria are rows, the refusal can name the
 *  criterion that caused it.
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
  v_action        record;
  v_needs_capa    text;
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

  IF NEW.resolved_at IS NOT NULL AND NEW.needs_action THEN
    --  (1) an action must exist.
    IF NEW.corrective_task_id IS NULL THEN
      RAISE EXCEPTION 'PEST_FINDING_NEEDS_CORRECTIVE_TASK';
    END IF;

    SELECT a.status, a.closure_evidence, a.linked_capa_id, a.company_id
      INTO v_action
      FROM public.facility_action_register a
     WHERE a.id = NEW.corrective_task_id;

    IF v_action IS NULL THEN
      RAISE EXCEPTION 'ACTION_NOT_FOUND';
    END IF;
    IF v_action.company_id <> NEW.company_id THEN
      RAISE EXCEPTION 'ACTION_WRONG_COMPANY';
    END IF;

    --  (2) completed, with evidence. The register's own CHECK already
    --  ties evidence to the completed status, so this is really a
    --  status test — but it is stated in full because the refusal a
    --  reader sees should say which of the two is missing.
    IF v_action.status <> 'completed' THEN
      RAISE EXCEPTION 'ACTION_NOT_COMPLETED';
    END IF;
    IF btrim(coalesce(v_action.closure_evidence,'')) = '' THEN
      RAISE EXCEPTION 'ACTION_NEEDS_CLOSURE_EVIDENCE';
    END IF;

    --  (3) escalation. The criteria are rows, so the refusal names
    --  the one that requires it.
    IF v_action.linked_capa_id IS NULL THEN
      SELECT string_agg(m.code, ', ' ORDER BY m.code) INTO v_needs_capa
        FROM public.facility_escalation_matches(NEW.id) m
       WHERE m.requires_capa;

      IF v_needs_capa IS NOT NULL THEN
        RAISE EXCEPTION 'ACTION_NEEDS_CAPA: %', v_needs_capa;
      END IF;
    END IF;
  END IF;

  --  Unchanged from 20261207000000: a finding already closed as
  --  needing action cannot be un-marked, which would retrospectively
  --  turn a corrective action into a note.
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


/**
 *  The register's own integrity: an action belongs to a source of its
 *  own company, and completion is attributable.
 */
CREATE OR REPLACE FUNCTION public.fn_facility_action_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE v_company uuid;
BEGIN
  /*
   *  ONLY WHEN THE SOURCE IS ACTUALLY BEING SET OR CHANGED.
   *
   *  The first version of this trigger re-checked the source on every
   *  UPDATE, and the test fixture found the consequence: deleting a
   *  profile sets `completed_by` to NULL through the foreign key's
   *  ON DELETE SET NULL, that fires this trigger, and the check then
   *  failed because the source finding had been deleted earlier in
   *  the same cascade.
   *
   *  That is not a test artefact. In production the same shape would
   *  make removing a user fail whenever one of their completed
   *  actions pointed at a source that had since gone — a cascade
   *  unrelated to the source would be refused for the source's sake.
   *
   *  So the source is validated when it is written, which is the only
   *  time it can become wrong.
   */
  IF TG_OP = 'INSERT'
     OR NEW.source_kind IS DISTINCT FROM OLD.source_kind
     OR NEW.source_id IS DISTINCT FROM OLD.source_id
     OR NEW.company_id IS DISTINCT FROM OLD.company_id THEN

    IF NEW.source_kind = 'pest_finding' THEN
      SELECT f.company_id INTO v_company
        FROM public.facility_pest_findings f WHERE f.id = NEW.source_id;
    ELSIF NEW.source_kind = 'facility_log_entry' THEN
      SELECT e.company_id INTO v_company
        FROM public.facility_log_entries e WHERE e.id = NEW.source_id;
    END IF;

    IF v_company IS NULL THEN
      RAISE EXCEPTION 'ACTION_SOURCE_NOT_FOUND';
    END IF;
    IF v_company <> NEW.company_id THEN
      RAISE EXCEPTION 'ACTION_SOURCE_WRONG_COMPANY';
    END IF;
  END IF;

  --  A linked CAPA must be ours too, or an action could point at
  --  another company's formal record. Checked only when it changes,
  --  for the same reason as the source above.
  IF NEW.linked_capa_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.linked_capa_id IS DISTINCT FROM OLD.linked_capa_id) THEN
    SELECT c.company_id INTO v_company
      FROM public.capa_records c WHERE c.id = NEW.linked_capa_id;
    IF v_company IS NULL THEN
      RAISE EXCEPTION 'CAPA_NOT_FOUND';
    END IF;
    IF v_company <> NEW.company_id THEN
      RAISE EXCEPTION 'CAPA_WRONG_COMPANY';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_facility_action_integrity ON public.facility_action_register;
CREATE TRIGGER trg_facility_action_integrity
  BEFORE INSERT OR UPDATE ON public.facility_action_register
  FOR EACH ROW EXECUTE FUNCTION public.fn_facility_action_integrity();


-- ── 6. RLS ───────────────────────────────────────────────────────────

ALTER TABLE public.facility_escalation_criteria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facility_action_register     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_iso_escalation_criteria" ON public.facility_escalation_criteria;
CREATE POLICY "company_iso_escalation_criteria" ON public.facility_escalation_criteria
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p
             WHERE p.id = auth.uid()
               AND p.company_id = facility_escalation_criteria.company_id)
  );

DROP POLICY IF EXISTS "company_iso_action_register" ON public.facility_action_register;
CREATE POLICY "company_iso_action_register" ON public.facility_action_register
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p
             WHERE p.id = auth.uid()
               AND p.company_id = facility_action_register.company_id)
  );


-- ── 7. The register, for the screen ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.facility_action_list(p_company_id uuid)
RETURNS TABLE (
  action_id        uuid,
  source_kind      text,
  source_id        uuid,
  title            text,
  description      text,
  owner_id         uuid,
  due_on           date,
  status           text,
  closure_evidence text,
  closure_ref      text,
  completed_at     timestamptz,
  linked_capa_id   uuid,
  capa_number      text,
  station_code     text,
  visit_reference  text,
  is_overdue       boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT a.id, a.source_kind, a.source_id, a.title, a.description,
         a.owner_id, a.due_on, a.status, a.closure_evidence, a.closure_ref,
         a.completed_at, a.linked_capa_id, c.capa_number,
         f.station_code, v.reference,
         --  Overdue is arithmetic on a recorded date, not a judgement.
         (a.status IN ('open','in_progress')
            AND a.due_on IS NOT NULL
            AND a.due_on < current_date) AS is_overdue
    FROM public.facility_action_register a
    LEFT JOIN public.capa_records c ON c.id = a.linked_capa_id
    LEFT JOIN public.facility_pest_findings f
           ON a.source_kind = 'pest_finding' AND f.id = a.source_id
    LEFT JOIN public.facility_pest_visits v ON v.id = f.visit_id
   WHERE a.company_id = p_company_id
   ORDER BY
     CASE a.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1
                   WHEN 'completed' THEN 2 ELSE 3 END,
     a.due_on NULLS LAST, a.created_at
$$;

GRANT EXECUTE ON FUNCTION public.facility_action_list(uuid) TO authenticated;
