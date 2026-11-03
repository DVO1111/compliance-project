-- =====================================================================
--  FACILITY LOGS, PART 3 — TRENDS (W6·29, FL-06 and FL-07)
--
--  FL-06 is drawn, and it states its own aggregation in the subtitle:
--
--      "Highest settle-plate count per zone per week. Each chart has
--       its own limits drawn as labelled lines."
--
--  So this is a WEEKLY MAXIMUM per zone, not a mean and not every
--  reading. A mean would hide the one excursion that matters, which is
--  presumably why the design says highest.
--
--  ── WHAT THE DESIGN FIXES, AND IS IMPLEMENTED ──
--
--    - One series per chart, per zone. FL-06 draws a separate chart
--      for Compression hall C1 and for Granulation room G2.
--    - Y axis is the highest count in the period; X axis is the week
--      starting. Both axes are labelled on the screen.
--    - Each chart carries BOTH limit lines, labelled at the line end
--      ("Alert 50", "Action 100").
--    - Only measured logs trend. A cleaning record is done or not
--      done, so `result_value IS NOT NULL` is the filter.
--
--  ── WHAT THE DESIGN DOES NOT FIX ──
--
--  WHICH DAY A WEEK STARTS ON. FL-06's x-axis reads 04 Aug, 11 Aug,
--  18 Aug … and in 2026 the 4th of August is a TUESDAY, so the mock's
--  buckets are not Monday-aligned and no rule is stated anywhere.
--  `date_trunc('week', …)` is used, which is ISO-8601 and therefore
--  Monday. That is a choice, not a reading of the design, so it is
--  written down here and pinned by a test rather than left implicit.
--
--  THE THREE SUB-TABS. FL-06 offers "Settle plates", "Surface swabs"
--  and "Active air", but `log_type` has only `environmental_air` and
--  `environmental_surface`: settle plates and active air are both AIR
--  methods and the schema cannot tell them apart — only the schedule's
--  `description` does ("Air · settle plates, 4 positions"). Inventing
--  a third enum value, or a `method` column, would be deciding how a
--  company classifies its own air monitoring. So this function trends
--  by `log_type`, and the gap is reported rather than guessed.
--
--  Nothing here derives an outcome, raises a deviation or writes
--  anything. It is a read.
-- =====================================================================

/**
 *  Weekly maxima per zone for one log type.
 *
 *  SECURITY INVOKER, like `facility_log_register`: the caller's own
 *  RLS decides which zones and entries are visible, so this cannot
 *  become a way to read another company's readings. STABLE because it
 *  only reads.
 *
 *  ── WHY THE LIMITS ARE min() ──
 *
 *  A zone may carry more than one schedule of the same log type, and
 *  FL-06 draws ONE pair of limit lines per chart. Taking the tightest
 *  means a reading is never drawn as comfortable against a looser
 *  limit than one of its own schedules imposes. The alternative —
 *  the newest schedule's limits — would redraw history every time a
 *  limit was relaxed. Per-entry judgement is unaffected either way:
 *  `outcome` was decided against that entry's own schedule when it
 *  was written, and is not recomputed here.
 */
CREATE OR REPLACE FUNCTION public.facility_log_trend(
  p_company_id uuid,
  p_log_type   text,
  p_weeks      integer DEFAULT 12
)
RETURNS TABLE (
  zone_id       uuid,
  zone_name     text,
  zone_grade    text,
  week_start    date,
  max_value     numeric,
  --  WHEN the peak reading was taken, not just which week it fell in.
  --  FL-06's narrative for Granulation room G2 reads "52 on 18 Oct",
  --  naming the day inside the week of 13 Oct, so the week start alone
  --  cannot produce the sentence the design shows.
  max_recorded_at timestamptz,
  sample_count  bigint,
  result_unit   text,
  alert_limit   numeric,
  action_limit  numeric
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
           --  mode() rather than min(): the unit is a label, and the
           --  commonest one is a better caption than the
           --  alphabetically smallest.
           mode() WITHIN GROUP (ORDER BY s.result_unit) AS result_unit
      FROM public.facility_zone_schedules s
     WHERE s.company_id = p_company_id
       AND s.log_type = p_log_type
     GROUP BY s.zone_id
  ),
  --  In range, measured, and nothing else. Named once so the two CTEs
  --  below cannot drift apart on the filter.
  scoped AS (
    SELECT e.zone_id,
           date_trunc('week', e.recorded_at)::date AS week_start,
           e.recorded_at,
           e.result_value
      FROM public.facility_log_entries e
     WHERE e.company_id = p_company_id
       AND e.log_type = p_log_type
       --  A cleaning or pest visit has no number to plot.
       AND e.result_value IS NOT NULL
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
  --  The peak reading itself. Ties break to the EARLIEST, so the
  --  sentence names the first time the week's high was reached rather
  --  than an arbitrary one of several equal readings.
  peaks AS (
    SELECT DISTINCT ON (s.zone_id, s.week_start)
           s.zone_id, s.week_start, s.recorded_at
      FROM scoped s
     ORDER BY s.zone_id, s.week_start, s.result_value DESC, s.recorded_at ASC
  )
  SELECT z.id, z.name, z.grade,
         w.week_start, w.max_value, p.recorded_at, w.sample_count,
         l.result_unit, l.alert_limit, l.action_limit
    FROM weekly w
    JOIN public.facility_zones z ON z.id = w.zone_id
    JOIN peaks p ON p.zone_id = w.zone_id AND p.week_start = w.week_start
    LEFT JOIN limits l ON l.zone_id = w.zone_id
   ORDER BY z.name, w.week_start
$$;

GRANT EXECUTE ON FUNCTION public.facility_log_trend(uuid, text, integer) TO authenticated;
