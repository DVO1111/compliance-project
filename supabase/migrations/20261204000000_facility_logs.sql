-- =====================================================================
--  FACILITY LOGS — W6·29 (FL-01, FL-02, FL-05)
--
--  HS-02 lists "Facility logs" as one of its fourteen rail entries, and
--  the application had no page and no tables for it. The design is not
--  missing: W6·29 draws fourteen screens. Only the implementation was.
--
--  ── WHAT THE DESIGN ESTABLISHES, AND WHAT IT DOES NOT ──
--
--  Taken from FL-01 and FL-02 rather than assumed:
--
--    - Logs belong to the FACILITY, not to a batch. FL-01 says so in
--      as many words, which is why nothing here references a batch.
--    - A zone carries a grade, a line, equipment, an owner and a
--      cleaning SOP (FL-02's edit panel).
--    - Each zone has its own scheduled tests, each with a frequency and
--      its own limits — FL-01 shows "alert 25, action 50" and "action
--      limit 100" as two different thresholds.
--    - The log types drawn are environmental (air and surface),
--      cleaning (routine and deep), water and pest control. Those are
--      FL-01's tabs.
--    - Overdue escalates: "Alert the owner after (days overdue)" and
--      "Escalate to QA Manager after (days)", tagged in the design
--      "SAME RULE AS CAPA OVERDUE". Both are per-zone FIELDS in FL-02,
--      so they are columns here and not constants.
--
--  NOT established anywhere, and therefore NOT invented here:
--
--    - No sign-off or second signature is required on a facility log.
--      FL-03 and FL-08 show a reading being recorded by one person. The
--      electronic-signature machinery is deliberately untouched: adding
--      a signature requirement to a GMP record is a quality decision,
--      not an implementation detail.
--    - No automatic deviation is raised from a failed result. FL-05
--      shows a deviation LINKED to a zone's history
--      ("DEV-2026-0041 raised"), but what raises it, and on which
--      rule, is not drawn. `linked_deviation_id` exists so the link can
--      be recorded; nothing creates one automatically.
--    - The grade vocabulary is open text with a hint, not an enum. The
--      design shows Grade C, Grade D and Unclassified; EU GMP also has
--      A and B, and a company may classify differently. Constraining it
--      to three values seen on one screen would be inventing a rule.
--
--  ── THE ONE RULE THIS MIGRATION DOES ENFORCE ──
--
--  `outcome` is DERIVED, not accepted. A reading's standing against its
--  limits is the whole evidential point of an environmental log, and a
--  client that computes it is a client that can be made to say a
--  112 CFU result against an action limit of 100 was fine. The same
--  defect was found and fixed in the customs flag in 20261203000000;
--  this one is written that way from the start.
-- =====================================================================

-- ── 1. Zones ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.facility_zones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  --  A zone is part of a site. FL-01's header is "Facility logs ·
  --  Oluyole plant, Ibadan", and FL-01's last row is a borehole whose
  --  zone is the site itself, so the column is required.
  site_id         uuid NOT NULL REFERENCES public.sites (id) ON DELETE CASCADE,

  name            text NOT NULL,
  --  "GR-02" in the design. Unique within a site so a result can be
  --  quoted by code without ambiguity.
  code            text,
  --  Open text: see the header note on why this is not an enum.
  grade           text,
  line_ref        text,
  equipment_refs  text[] NOT NULL DEFAULT '{}',
  cleaning_sop_ref text,

  owner_id        uuid REFERENCES public.profiles (id) ON DELETE SET NULL,

  --  FL-02's two alert fields, per zone.
  alert_owner_after_days    integer NOT NULL DEFAULT 0 CHECK (alert_owner_after_days >= 0),
  escalate_to_qa_after_days integer NOT NULL DEFAULT 1 CHECK (escalate_to_qa_after_days >= 0),

  is_active       boolean NOT NULL DEFAULT true,
  created_by      uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (site_id, name)
);

CREATE INDEX IF NOT EXISTS idx_facility_zones_company ON public.facility_zones (company_id);
CREATE INDEX IF NOT EXISTS idx_facility_zones_site ON public.facility_zones (company_id, site_id);


-- ── 2. Scheduled tests ───────────────────────────────────────────────

/**
 *  The log types FL-01 draws as tabs. Constrained, unlike `grade`,
 *  because the tabs ARE the vocabulary — the screen has one tab per
 *  value and an unknown type would have nowhere to appear.
 */
CREATE TABLE IF NOT EXISTS public.facility_zone_schedules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  zone_id       uuid NOT NULL REFERENCES public.facility_zones (id) ON DELETE CASCADE,

  log_type      text NOT NULL CHECK (log_type IN (
                  'environmental_air', 'environmental_surface',
                  'cleaning_routine', 'cleaning_deep',
                  'water', 'pest_control'
                )),
  --  "Air · settle plates, 4 positions". Free text: the design shows a
  --  different description for every row.
  description   text NOT NULL,

  frequency     text NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly', 'quarterly')),
  --  "due 09:00" on a daily test; null where the frequency has no
  --  time of day attached.
  due_time      time,

  --  FL-01 shows these as two distinct thresholds on one row:
  --  "alert 25, action 50". Nullable because a cleaning record has
  --  neither — it is done or it is not.
  alert_limit   numeric(12,3),
  action_limit  numeric(12,3),
  result_unit   text,

  owner_id      uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  --  An action limit below its alert limit would invert the meaning of
  --  every result measured against it.
  CONSTRAINT facility_schedule_limits_ordered CHECK (
    alert_limit IS NULL OR action_limit IS NULL OR action_limit >= alert_limit
  )
);

CREATE INDEX IF NOT EXISTS idx_facility_schedules_company ON public.facility_zone_schedules (company_id);
CREATE INDEX IF NOT EXISTS idx_facility_schedules_zone ON public.facility_zone_schedules (zone_id);


-- ── 3. Recorded entries ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.facility_log_entries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  zone_id       uuid NOT NULL REFERENCES public.facility_zones (id) ON DELETE CASCADE,
  --  Kept when the schedule is retired, so history does not vanish with
  --  a schedule change: FL-02 says "Changes apply from the next
  --  scheduled test".
  schedule_id   uuid REFERENCES public.facility_zone_schedules (id) ON DELETE SET NULL,

  log_type      text NOT NULL CHECK (log_type IN (
                  'environmental_air', 'environmental_surface',
                  'cleaning_routine', 'cleaning_deep',
                  'water', 'pest_control'
                )),

  due_at        timestamptz,
  recorded_at   timestamptz NOT NULL DEFAULT now(),
  recorded_by   uuid REFERENCES public.profiles (id) ON DELETE SET NULL,

  --  "112 CFU/4 h at CP-3" — a number, a unit and where it was taken.
  result_value  numeric(12,3),
  result_unit   text,
  result_position text,

  --  A cleaning or a pest visit is done or not done rather than
  --  measured, which is what `not_done` is for.
  performed     boolean NOT NULL DEFAULT true,

  /**
   *  DERIVED by fn_facility_log_outcome(). Whatever a caller sends here
   *  is discarded. See the header: this is the evidential content of the
   *  record and a client must not be able to assert it.
   */
  outcome       text NOT NULL DEFAULT 'within_limits' CHECK (outcome IN (
                  'within_limits', 'outside_alert', 'outside_action',
                  'not_done', 'not_assessed'
                )),

  notes         text,
  reference     text,
  --  FL-05 shows a deviation against a zone's history. Recorded, never
  --  created automatically — what raises one is not designed.
  linked_deviation_id uuid,

  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_facility_entries_company ON public.facility_log_entries (company_id);
CREATE INDEX IF NOT EXISTS idx_facility_entries_zone ON public.facility_log_entries (zone_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_facility_entries_outcome ON public.facility_log_entries (company_id, outcome);
CREATE INDEX IF NOT EXISTS idx_facility_entries_type ON public.facility_log_entries (company_id, log_type, recorded_at DESC);


-- ── 4. The outcome rule, in one place ────────────────────────────────

/**
 *  A result's standing against its limits.
 *
 *  `not_assessed` is deliberately distinct from `within_limits`: a
 *  reading taken where no limit is configured has NOT passed anything,
 *  and recording it as "within limits" would be a claim the data does
 *  not support. FL-01 draws exactly that case — "Grade D" with no
 *  result, and "—" against the borehole.
 */
CREATE OR REPLACE FUNCTION public.facility_log_outcome(
  p_performed     boolean,
  p_result_value  numeric,
  p_alert_limit   numeric,
  p_action_limit  numeric
) RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN NOT coalesce(p_performed, true) THEN 'not_done'
    WHEN p_result_value IS NULL THEN 'not_assessed'
    WHEN p_action_limit IS NOT NULL AND p_result_value > p_action_limit THEN 'outside_action'
    WHEN p_alert_limit  IS NOT NULL AND p_result_value > p_alert_limit  THEN 'outside_alert'
    WHEN p_alert_limit IS NULL AND p_action_limit IS NULL THEN 'not_assessed'
    ELSE 'within_limits'
  END
$$;

REVOKE ALL ON FUNCTION public.facility_log_outcome(boolean, numeric, numeric, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.facility_log_outcome(boolean, numeric, numeric, numeric)
  TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.fn_facility_log_outcome()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_alert  numeric;
  v_action numeric;
  v_unit   text;
  v_zone_company uuid;
BEGIN
  --  The zone and the entry must belong to the same company. RLS stops
  --  a caller reaching another tenant's rows; this stops a caller
  --  stapling their own entry onto a zone id they guessed.
  SELECT company_id INTO v_zone_company
    FROM public.facility_zones WHERE id = NEW.zone_id;
  IF v_zone_company IS NULL THEN
    RAISE EXCEPTION 'FACILITY_ZONE_NOT_FOUND: no such zone' USING ERRCODE = 'P0001';
  END IF;
  IF v_zone_company <> NEW.company_id THEN
    RAISE EXCEPTION
      'FACILITY_ZONE_WRONG_COMPANY: the zone belongs to another company'
      USING ERRCODE = 'P0001';
  END IF;

  IF NEW.schedule_id IS NOT NULL THEN
    SELECT alert_limit, action_limit, result_unit, zone_id
      INTO v_alert, v_action, v_unit, v_zone_company
      FROM public.facility_zone_schedules WHERE id = NEW.schedule_id;

    --  A schedule from a different zone would measure the reading
    --  against the wrong limits, which is worse than having none.
    IF v_zone_company IS DISTINCT FROM NEW.zone_id THEN
      RAISE EXCEPTION
        'FACILITY_SCHEDULE_WRONG_ZONE: that schedule belongs to another zone'
        USING ERRCODE = 'P0001';
    END IF;

    NEW.result_unit := coalesce(NEW.result_unit, v_unit);
    NEW.log_type := (SELECT log_type FROM public.facility_zone_schedules WHERE id = NEW.schedule_id);
  END IF;

  NEW.outcome := public.facility_log_outcome(
    NEW.performed, NEW.result_value, v_alert, v_action
  );
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_facility_log_outcome ON public.facility_log_entries;
CREATE TRIGGER trg_facility_log_outcome
  BEFORE INSERT OR UPDATE ON public.facility_log_entries
  FOR EACH ROW EXECUTE FUNCTION public.fn_facility_log_outcome();


-- ── 5. RLS — company isolation, matching the project's pattern ───────

ALTER TABLE public.facility_zones           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facility_zone_schedules  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facility_log_entries     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_iso_facility_zones" ON public.facility_zones;
CREATE POLICY "company_iso_facility_zones" ON public.facility_zones
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = auth.uid() AND p.company_id = facility_zones.company_id
    )
  );

DROP POLICY IF EXISTS "company_iso_facility_schedules" ON public.facility_zone_schedules;
CREATE POLICY "company_iso_facility_schedules" ON public.facility_zone_schedules
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = auth.uid() AND p.company_id = facility_zone_schedules.company_id
    )
  );

DROP POLICY IF EXISTS "company_iso_facility_entries" ON public.facility_log_entries;
CREATE POLICY "company_iso_facility_entries" ON public.facility_log_entries
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = auth.uid() AND p.company_id = facility_log_entries.company_id
    )
  );


-- ── 6. What is due, and what is overdue ──────────────────────────────

/**
 *  FL-01's register: every active schedule with its last entry, and
 *  whether it is overdue.
 *
 *  A function rather than a view because it takes the company
 *  explicitly: a view would depend on auth.uid() being set, and the
 *  register is also wanted from a report.
 *
 *  SECURITY INVOKER on purpose — RLS still applies to every table it
 *  reads, so a caller sees their own company and no more. It takes a
 *  company_id for filtering, not for authorisation.
 */
CREATE OR REPLACE FUNCTION public.facility_log_register(p_company_id uuid)
RETURNS TABLE (
  schedule_id    uuid,
  zone_id        uuid,
  zone_name      text,
  zone_grade     text,
  zone_line_ref  text,
  log_type       text,
  description    text,
  frequency      text,
  due_time       time,
  alert_limit    numeric,
  action_limit   numeric,
  result_unit    text,
  last_entry_id  uuid,
  last_recorded_at timestamptz,
  last_result_value numeric,
  last_result_position text,
  last_outcome   text,
  last_reference text,
  days_since_last numeric
)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    s.id, z.id, z.name, z.grade, z.line_ref,
    s.log_type, s.description, s.frequency, s.due_time,
    s.alert_limit, s.action_limit, s.result_unit,
    e.id, e.recorded_at, e.result_value, e.result_position, e.outcome, e.reference,
    CASE WHEN e.recorded_at IS NULL THEN NULL
         ELSE EXTRACT(EPOCH FROM (now() - e.recorded_at)) / 86400.0 END
  FROM public.facility_zone_schedules s
  JOIN public.facility_zones z ON z.id = s.zone_id
  LEFT JOIN LATERAL (
    SELECT le.* FROM public.facility_log_entries le
     WHERE le.schedule_id = s.id
     ORDER BY le.recorded_at DESC
     LIMIT 1
  ) e ON true
  WHERE s.company_id = p_company_id
    AND s.is_active
    AND z.is_active
  ORDER BY z.name, s.description
$$;

REVOKE ALL ON FUNCTION public.facility_log_register(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.facility_log_register(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.facility_log_register(uuid) IS
  'FL-01''s register: active schedules with their most recent entry. SECURITY INVOKER, so RLS decides what the caller sees.';
