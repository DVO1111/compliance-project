-- =====================================================================
--  ENVIRONMENTAL SAMPLING METHODS (Phase 2, decision 4)
--
--  Batch 3 reported this gap rather than guessing at it: FL-06 offers
--  three sub-tabs — "Settle plates", "Surface swabs" and "Active air"
--  — while `log_type` has only `environmental_air` and
--  `environmental_surface`, because settle plates and active air are
--  both AIR methods and only the schedule's description told them
--  apart.
--
--  The product owner has settled it:
--
--      "Support both settle-plate and active-air sampling as distinct
--       methods in the facility-log model and FL-06 workflow. Preserve
--       method-specific measurement metadata and configurable,
--       protocol-based limits. Reuse existing schema and services
--       where appropriate. Do not assume universal alert thresholds."
--
--  ── WHY THE LAST SENTENCE IS THE WHOLE POINT ──
--
--  A settle plate measures colony-forming units per plate over an
--  exposure period: CFU / plate / 4 h. Active air measures them per
--  volume of air drawn through a sampler: CFU / m³. THEY ARE NOT THE
--  SAME QUANTITY. A limit of 50 means something different for each,
--  and the ratio between them depends on the plate area, the exposure
--  time and the sampler's flow rate.
--
--  So this migration adds NO default limit, NO conversion between the
--  methods, and NO shared threshold. Limits stay exactly where they
--  already were — per schedule, nullable, set by the company — and
--  `facility_water_outcome`-style arithmetic is untouched. What the
--  method adds is the metadata that makes a number interpretable, and
--  the ability for FL-06 to show the three tabs it draws.
--
--  ── REUSING THE EXISTING SCHEMA ──
--
--  "Reuse existing schema and services where appropriate", so this is
--  additive: no table is created, no column is dropped, `log_type`
--  keeps its six values and `facility_log_outcome()` is not touched.
--  A schedule gains a method and its protocol; an entry gains what was
--  actually done.
-- =====================================================================

-- ── 1. The method, on the schedule that defines the protocol ─────────

/**
 *  The three methods FL-06's sub-tabs name, and nothing else.
 *
 *  Constrained, unlike a grade or a unit, because the three ARE the
 *  vocabulary: FL-06 has one tab per method and an unknown method
 *  would have nowhere to appear. Nullable, because cleaning, water and
 *  pest schedules have no sampling method at all.
 */
ALTER TABLE public.facility_zone_schedules
  ADD COLUMN IF NOT EXISTS sample_method text,
  --  "Air · settle plates, 4 positions" — the protocol, as the design
  --  prints it. These are the method-specific measurement metadata
  --  the instruction asks to preserve.
  ADD COLUMN IF NOT EXISTS protocol_positions integer,
  ADD COLUMN IF NOT EXISTS protocol_exposure_minutes integer,
  ADD COLUMN IF NOT EXISTS protocol_volume_litres numeric(10,2);

DO $c$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'facility_schedule_sample_method_chk'
  ) THEN
    ALTER TABLE public.facility_zone_schedules
      ADD CONSTRAINT facility_schedule_sample_method_chk CHECK (
        sample_method IS NULL
        OR sample_method IN ('settle_plate', 'active_air', 'surface_swab')
      );
  END IF;

  /*
   *  A method belongs to an environmental log type, and an
   *  environmental type's method must match its medium: a settle plate
   *  and an active-air sampler both sample AIR, and a swab samples a
   *  SURFACE. Without this a surface schedule could claim active-air
   *  sampling, and the number would be uninterpretable.
   *
   *  Environmental schedules are allowed to have NO method stated,
   *  because every schedule that existed before this migration does.
   */
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'facility_schedule_method_medium_chk'
  ) THEN
    ALTER TABLE public.facility_zone_schedules
      ADD CONSTRAINT facility_schedule_method_medium_chk CHECK (
        sample_method IS NULL
        OR (log_type = 'environmental_air'
              AND sample_method IN ('settle_plate', 'active_air'))
        OR (log_type = 'environmental_surface'
              AND sample_method = 'surface_swab')
      );
  END IF;

  /*
   *  THE METADATA HAS TO MATCH THE METHOD.
   *
   *  A settle plate without an exposure period is a count with no
   *  denominator — "40 CFU" means nothing without "per plate per four
   *  hours". Active air without a sampled volume is the same problem.
   *  A swab has neither, because it samples a defined area rather than
   *  a duration or a volume.
   *
   *  Stated as a CHECK rather than left to the client, because the
   *  denominator is what makes the result comparable to its limit, and
   *  an incomparable result is worse than a missing one.
   */
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'facility_schedule_protocol_shape_chk'
  ) THEN
    ALTER TABLE public.facility_zone_schedules
      ADD CONSTRAINT facility_schedule_protocol_shape_chk CHECK (
        sample_method IS NULL
        OR (sample_method = 'settle_plate'
              AND protocol_exposure_minutes IS NOT NULL
              AND protocol_exposure_minutes > 0
              AND protocol_volume_litres IS NULL)
        OR (sample_method = 'active_air'
              AND protocol_volume_litres IS NOT NULL
              AND protocol_volume_litres > 0
              AND protocol_exposure_minutes IS NULL)
        OR (sample_method = 'surface_swab'
              AND protocol_exposure_minutes IS NULL
              AND protocol_volume_litres IS NULL)
      );
  END IF;
END
$c$;

COMMENT ON COLUMN public.facility_zone_schedules.sample_method IS
  'FL-06 sub-tab: settle_plate, active_air or surface_swab. Null on '
  'cleaning, water and pest schedules, and on environmental schedules '
  'created before 20261210000000.';
COMMENT ON COLUMN public.facility_zone_schedules.protocol_volume_litres IS
  'Active air only: the volume of air the protocol draws, in litres. '
  'The denominator a CFU count is read against. There is deliberately '
  'no default: a sampler flow rate is the company''s own.';


-- ── 2. What was actually done, on the entry ──────────────────────────

/**
 *  The protocol says what should be done; the entry records what was.
 *  They are separate because a reading taken for ten minutes against
 *  a thirty-minute protocol is a real event that has to be
 *  recordable — and visible — rather than silently assumed correct.
 */
ALTER TABLE public.facility_log_entries
  ADD COLUMN IF NOT EXISTS sample_method text,
  ADD COLUMN IF NOT EXISTS exposure_minutes integer,
  ADD COLUMN IF NOT EXISTS volume_litres numeric(10,2);

DO $c2$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'facility_entry_sample_method_chk'
  ) THEN
    ALTER TABLE public.facility_log_entries
      ADD CONSTRAINT facility_entry_sample_method_chk CHECK (
        sample_method IS NULL
        OR sample_method IN ('settle_plate', 'active_air', 'surface_swab')
      );
  END IF;
END
$c2$;


-- ── 3. Inheritance, in the trigger that already runs ─────────────────

/**
 *  Replaces fn_facility_log_outcome() from 20261204000000, adding
 *  method inheritance to what it already did.
 *
 *  THE OUTCOME DERIVATION IS UNCHANGED. `facility_log_outcome()` is
 *  called with the same four arguments and still decides the verdict,
 *  because the method changes what a number MEANS, not how it is
 *  compared with its own schedule's limits. That is also why no
 *  conversion appears anywhere here: a settle-plate result is judged
 *  against a settle-plate limit, and an active-air result against an
 *  active-air limit, and the two are never compared with each other.
 */
CREATE OR REPLACE FUNCTION public.fn_facility_log_outcome()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_zone_company uuid;
  v_sched        record;
BEGIN
  SELECT z.company_id INTO v_zone_company
    FROM public.facility_zones z WHERE z.id = NEW.zone_id;

  IF v_zone_company IS NULL THEN
    RAISE EXCEPTION 'FACILITY_ZONE_NOT_FOUND';
  END IF;
  IF v_zone_company <> NEW.company_id THEN
    RAISE EXCEPTION 'FACILITY_ZONE_WRONG_COMPANY';
  END IF;

  IF NEW.schedule_id IS NOT NULL THEN
    SELECT s.zone_id, s.alert_limit, s.action_limit, s.result_unit, s.log_type,
           s.sample_method, s.protocol_exposure_minutes, s.protocol_volume_litres
      INTO v_sched
      FROM public.facility_zone_schedules s
     WHERE s.id = NEW.schedule_id;

    /*
     *  ONE REFUSAL, NOT TWO, and the existing contract is why.
     *
     *  20261204000000 selected the schedule into scalars with no
     *  "not found" branch: an invisible schedule left zone_id NULL
     *  and `IS DISTINCT FROM` raised WRONG_ZONE. That collapse is
     *  correct, and for the same reason the site check in
     *  20261205000000 collapses: this function runs under the
     *  caller's RLS, so a schedule belonging to another zone of
     *  another company is INVISIBLE rather than merely wrong, and the
     *  two cases cannot be told apart from here.
     *
     *  A first draft of this rewrite added a separate
     *  FACILITY_SCHEDULE_NOT_FOUND branch ahead of it, which changed
     *  the refusal an existing caller sees and broke E1 of
     *  facility_logs_test. Kept as one refusal.
     */
    IF v_sched IS NULL OR v_sched.zone_id IS DISTINCT FROM NEW.zone_id THEN
      RAISE EXCEPTION 'FACILITY_SCHEDULE_WRONG_ZONE'
        USING ERRCODE = 'P0001';
    END IF;

    --  Unchanged from 20261204000000.
    IF NEW.result_unit IS NULL THEN NEW.result_unit := v_sched.result_unit; END IF;
    IF NEW.log_type IS NULL THEN NEW.log_type := v_sched.log_type; END IF;

    --  New: the method and its denominator come from the protocol
    --  unless the recorder states otherwise, so an entry can never
    --  disagree with its schedule by omission.
    IF NEW.sample_method IS NULL THEN
      NEW.sample_method := v_sched.sample_method;
    END IF;
    IF NEW.exposure_minutes IS NULL THEN
      NEW.exposure_minutes := v_sched.protocol_exposure_minutes;
    END IF;
    IF NEW.volume_litres IS NULL THEN
      NEW.volume_litres := v_sched.protocol_volume_litres;
    END IF;

    NEW.outcome := public.facility_log_outcome(
      NEW.performed, NEW.result_value, v_sched.alert_limit, v_sched.action_limit
    );
  ELSE
    --  No schedule: an ad-hoc reading has no limits to be judged
    --  against, which `facility_log_outcome` reports as not_assessed.
    NEW.outcome := public.facility_log_outcome(
      NEW.performed, NEW.result_value, NULL, NULL
    );
  END IF;

  --  No `NEW.updated_at` here: `facility_log_entries` does not have
  --  that column. A reading is an event rather than a record that is
  --  edited, which is why 20261204000000 gave it `created_at` only —
  --  and adding the assignment by habit is how this trigger broke the
  --  whole entries suite with "record new has no field updated_at".
  RETURN NEW;
END
$$;


-- ── 4. FL-06's three sub-tabs ────────────────────────────────────────

/**
 *  The trend function gains a method filter, so FL-06 can show
 *  "Settle plates" and "Active air" as the separate series the design
 *  draws instead of one mixed air chart.
 *
 *  MIXING THEM WOULD BE THE DEFECT. A settle-plate count and an
 *  active-air count on one axis, against one limit line, would draw
 *  two different quantities as though they were comparable — which is
 *  exactly what "do not assume universal alert thresholds" rules out.
 *
 *  Dropped and recreated rather than overloaded: two functions whose
 *  signatures differ only by a defaulted argument are ambiguous to
 *  call. Every existing three-argument call still resolves.
 */
DROP FUNCTION IF EXISTS public.facility_log_trend(uuid, text, integer);

CREATE OR REPLACE FUNCTION public.facility_log_trend(
  p_company_id    uuid,
  p_log_type      text,
  p_weeks         integer DEFAULT 12,
  --  NULL means every method, which is what the three-argument callers
  --  that existed before this migration get.
  p_sample_method text DEFAULT NULL
)
RETURNS TABLE (
  zone_id       uuid,
  zone_name     text,
  zone_grade    text,
  week_start    date,
  max_value     numeric,
  max_recorded_at timestamptz,
  sample_count  bigint,
  result_unit   text,
  alert_limit   numeric,
  action_limit  numeric,
  sample_method text,
  protocol_exposure_minutes integer,
  protocol_volume_litres numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH limits AS (
    SELECT s.zone_id,
           min(s.alert_limit)  AS alert_limit,
           min(s.action_limit) AS action_limit,
           mode() WITHIN GROUP (ORDER BY s.result_unit) AS result_unit,
           mode() WITHIN GROUP (ORDER BY s.sample_method) AS sample_method,
           --  The denominator, carried through so the chart can print
           --  it. A count without it is not interpretable: "3 CFU"
           --  means nothing until it is "per plate per four hours".
           mode() WITHIN GROUP (ORDER BY s.protocol_exposure_minutes)
             AS protocol_exposure_minutes,
           mode() WITHIN GROUP (ORDER BY s.protocol_volume_litres)
             AS protocol_volume_litres
      FROM public.facility_zone_schedules s
     WHERE s.company_id = p_company_id
       AND s.log_type = p_log_type
       --  The limits drawn must come from schedules of the SAME
       --  method, or a settle-plate chart could show an active-air
       --  limit line.
       AND (p_sample_method IS NULL OR s.sample_method = p_sample_method)
     GROUP BY s.zone_id
  ),
  scoped AS (
    SELECT e.zone_id,
           date_trunc('week', e.recorded_at)::date AS week_start,
           e.recorded_at,
           e.result_value
      FROM public.facility_log_entries e
     WHERE e.company_id = p_company_id
       AND e.log_type = p_log_type
       AND e.result_value IS NOT NULL
       AND (p_sample_method IS NULL OR e.sample_method = p_sample_method)
       AND e.recorded_at >= date_trunc('week', now())
                            - (greatest(p_weeks, 1) - 1) * interval '1 week'
  ),
  weekly AS (
    SELECT s.zone_id, s.week_start,
           max(s.result_value) AS max_value,
           count(*)            AS sample_count
      FROM scoped s
     GROUP BY s.zone_id, s.week_start
  ),
  peaks AS (
    SELECT DISTINCT ON (s.zone_id, s.week_start)
           s.zone_id, s.week_start, s.recorded_at
      FROM scoped s
     ORDER BY s.zone_id, s.week_start, s.result_value DESC, s.recorded_at ASC
  )
  SELECT z.id, z.name, z.grade,
         w.week_start, w.max_value, p.recorded_at, w.sample_count,
         l.result_unit, l.alert_limit, l.action_limit, l.sample_method,
         l.protocol_exposure_minutes, l.protocol_volume_litres
    FROM weekly w
    JOIN public.facility_zones z ON z.id = w.zone_id
    JOIN peaks p ON p.zone_id = w.zone_id AND p.week_start = w.week_start
    LEFT JOIN limits l ON l.zone_id = w.zone_id
   ORDER BY z.name, w.week_start
$$;

GRANT EXECUTE ON FUNCTION public.facility_log_trend(uuid, text, integer, text)
  TO authenticated;


-- ── 5. What the register shows ───────────────────────────────────────

/**
 *  FL-01's register gains the method, so a row can say "Air · settle
 *  plates" rather than just "Air" — which matters most where a zone
 *  runs both methods and two rows would otherwise be
 *  indistinguishable.
 */
--  Dropped first: adding OUT parameters changes the row type, which
--  CREATE OR REPLACE cannot do.
DROP FUNCTION IF EXISTS public.facility_log_register(uuid);

CREATE OR REPLACE FUNCTION public.facility_log_register(p_company_id uuid)
RETURNS TABLE (
  schedule_id   uuid,
  zone_id       uuid,
  zone_name     text,
  zone_grade    text,
  zone_line_ref text,
  log_type      text,
  description   text,
  frequency     text,
  due_time      time,
  alert_limit   numeric,
  action_limit  numeric,
  result_unit   text,
  sample_method text,
  protocol_positions integer,
  protocol_exposure_minutes integer,
  protocol_volume_litres numeric,
  last_entry_id uuid,
  last_recorded_at timestamptz,
  last_result_value numeric,
  last_result_position text,
  last_outcome  text,
  last_reference text,
  days_since_last numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT s.id, z.id, z.name, z.grade, z.line_ref,
         s.log_type, s.description, s.frequency, s.due_time,
         s.alert_limit, s.action_limit, s.result_unit,
         s.sample_method, s.protocol_positions,
         s.protocol_exposure_minutes, s.protocol_volume_litres,
         e.id, e.recorded_at, e.result_value, e.result_position,
         e.outcome, e.reference,
         CASE WHEN e.recorded_at IS NULL THEN NULL
              ELSE EXTRACT(EPOCH FROM (now() - e.recorded_at)) / 86400.0 END
    FROM public.facility_zone_schedules s
    JOIN public.facility_zones z ON z.id = s.zone_id
    LEFT JOIN LATERAL (
      SELECT x.* FROM public.facility_log_entries x
       WHERE x.schedule_id = s.id
       ORDER BY x.recorded_at DESC
       LIMIT 1
    ) e ON true
   WHERE s.company_id = p_company_id
     AND s.is_active
   ORDER BY z.name, s.description
$$;

GRANT EXECUTE ON FUNCTION public.facility_log_register(uuid) TO authenticated;
