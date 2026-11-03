-- =====================================================================
--  FACILITY LOGS, PART 3 — TRENDS (20261206000000)
--
--  A. The function's posture
--  B. The weekly figure is the MAXIMUM
--  C. The peak reading's timestamp
--  D. What does not trend
--  E. Cross-tenant
--  F. Which limits a chart draws
--  G. Where a week starts
--  H. The period window
--
--  WHY B MATTERS MOST
--  ------------------
--  FL-06's subtitle states the aggregation: "Highest settle-plate
--  count per zone per week." A mean would hide the single excursion
--  that the whole screen exists to show — a week with readings of
--  10, 10, 10 and 112 averages to 35.5, which sits under an action
--  limit of 100 and would draw as comfortable. Section B is what
--  stops that.
-- =====================================================================
\set ON_ERROR_STOP on
SET client_min_messages = warning;

CREATE TEMP TABLE _s(section text, name text, ok boolean, detail text);
CREATE OR REPLACE FUNCTION _sk(p_section text, p_name text, p_ok boolean, p_detail text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO _s VALUES (p_section,p_name,coalesce(p_ok,false),p_detail); END $$;

GRANT ALL ON _s TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION _sk(text,text,boolean,text) TO anon, authenticated, service_role;


-- ── Fixture ──────────────────────────────────────────────────────────
--  Two companies. Company A has one zone with two air schedules whose
--  limits DIFFER (so section F has something to choose between), and
--  four weeks of readings anchored to the current week so the period
--  window in section H is testable without freezing the clock.
DO $fx$
DECLARE
  ca uuid := '00000000-0000-7b02-a000-000000000001';
  cb uuid := '00000000-0000-7b02-a000-000000000002';
  ua uuid := '00000000-0000-7b02-b000-000000000001';
  ub uuid := '00000000-0000-7b02-b000-000000000002';
  sa uuid := '00000000-0000-7b02-c000-000000000001';
  sb uuid := '00000000-0000-7b02-c000-000000000002';
  za uuid := '00000000-0000-7b02-d000-000000000001';
  zb uuid := '00000000-0000-7b02-d000-000000000002';
  sch_tight uuid := '00000000-0000-7b02-e000-000000000001';
  sch_loose uuid := '00000000-0000-7b02-e000-000000000002';
  sch_clean uuid := '00000000-0000-7b02-e000-000000000003';
  sch_b     uuid := '00000000-0000-7b02-e000-000000000004';
  wk0 timestamptz := date_trunc('week', now());
BEGIN
  DELETE FROM public.facility_log_entries WHERE company_id IN (ca,cb);
  DELETE FROM public.facility_zone_schedules WHERE company_id IN (ca,cb);
  DELETE FROM public.facility_zones WHERE company_id IN (ca,cb);
  DELETE FROM public.sites WHERE company_id IN (ca,cb);
  DELETE FROM public.company_members WHERE company_id IN (ca,cb);
  DELETE FROM public.profiles WHERE id IN (ua,ub);
  DELETE FROM auth.users WHERE id IN (ua,ub);
  DELETE FROM public.companies WHERE id IN (ca,cb);

  INSERT INTO public.companies(id,name) VALUES (ca,'FT Alpha'),(cb,'FT Bravo');
  INSERT INTO auth.users(id,email) VALUES (ua,'ft-a@local.test'),(ub,'ft-b@local.test');
  INSERT INTO public.profiles(id,email,full_name,role,company_id) VALUES
    (ua,'ft-a@local.test','Ada Alpha','admin',ca),
    (ub,'ft-b@local.test','Bo Bravo','admin',cb);
  INSERT INTO public.company_members(company_id,user_id,role,status) VALUES
    (ca,ua,'owner','active'),(cb,ub,'owner','active');

  INSERT INTO public.sites(id,company_id,name) VALUES (sa,ca,'FT plant'),(sb,cb,'FT depot');
  INSERT INTO public.facility_zones(id,company_id,site_id,name,grade,created_by) VALUES
    (za,ca,sa,'FT Compression C1','Grade D',ua),
    (zb,cb,sb,'FT Bravo room','Grade D',ub);

  --  Two air schedules on the SAME zone with different limits.
  INSERT INTO public.facility_zone_schedules
    (id,company_id,zone_id,log_type,description,frequency,alert_limit,action_limit,result_unit)
  VALUES
    (sch_tight,ca,za,'environmental_air','Air · settle plates','daily',50,100,'CFU'),
    (sch_loose,ca,za,'environmental_air','Air · second round','weekly',80,200,'CFU'),
    (sch_clean,ca,za,'cleaning_routine','Routine clean','daily',NULL,NULL,NULL),
    (sch_b,cb,zb,'environmental_air','Bravo air','daily',10,20,'CFU');

  --  Week -3: a single modest reading.
  INSERT INTO public.facility_log_entries
    (company_id,zone_id,schedule_id,log_type,recorded_at,result_value,result_unit,recorded_by)
  VALUES (ca,za,sch_tight,'environmental_air', wk0 - interval '3 weeks' + interval '1 day',
          28,'CFU',ua);

  --  Week -2: FOUR readings, three low and one high. The mean is 35.5
  --  and the maximum is 112 — section B turns on this row.
  INSERT INTO public.facility_log_entries
    (company_id,zone_id,schedule_id,log_type,recorded_at,result_value,result_unit,recorded_by)
  VALUES
    (ca,za,sch_tight,'environmental_air', wk0 - interval '2 weeks' + interval '1 day', 10,'CFU',ua),
    (ca,za,sch_tight,'environmental_air', wk0 - interval '2 weeks' + interval '2 days', 10,'CFU',ua),
    (ca,za,sch_tight,'environmental_air', wk0 - interval '2 weeks' + interval '3 days', 10,'CFU',ua),
    (ca,za,sch_tight,'environmental_air', wk0 - interval '2 weeks' + interval '4 days', 112,'CFU',ua);

  --  Week -1: two readings TIED at the week's maximum, the earlier one
  --  on day 1. Section C requires the earlier to be named.
  INSERT INTO public.facility_log_entries
    (company_id,zone_id,schedule_id,log_type,recorded_at,result_value,result_unit,recorded_by)
  VALUES
    (ca,za,sch_tight,'environmental_air', wk0 - interval '1 week' + interval '1 day', 60,'CFU',ua),
    (ca,za,sch_tight,'environmental_air', wk0 - interval '1 week' + interval '5 days', 60,'CFU',ua);

  --  A cleaning record in the current week: performed, no number.
  INSERT INTO public.facility_log_entries
    (company_id,zone_id,schedule_id,log_type,recorded_at,result_value,performed,recorded_by)
  VALUES (ca,za,sch_clean,'cleaning_routine', wk0 + interval '1 day', NULL, true, ua);

  --  Something well outside any window, for section H.
  INSERT INTO public.facility_log_entries
    (company_id,zone_id,schedule_id,log_type,recorded_at,result_value,result_unit,recorded_by)
  VALUES (ca,za,sch_tight,'environmental_air', wk0 - interval '40 weeks', 7,'CFU',ua);

  --  Bravo's own reading, which company A must never see.
  INSERT INTO public.facility_log_entries
    (company_id,zone_id,schedule_id,log_type,recorded_at,result_value,result_unit,recorded_by)
  VALUES (cb,zb,sch_b,'environmental_air', wk0 - interval '1 week', 999,'CFU',ub);
END
$fx$;


-- =====================================================================
--  A — the function's posture
-- =====================================================================
DO $a$
BEGIN
  PERFORM _sk('A','A1 facility_log_trend exists',
    (SELECT count(*) = 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='facility_log_trend'));

  --  SECURITY INVOKER is what keeps RLS in force. A definer version
  --  would read every company's readings.
  PERFORM _sk('A','A2 is SECURITY INVOKER',
    (SELECT NOT prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='facility_log_trend'));

  PERFORM _sk('A','A3 is STABLE, not VOLATILE',
    (SELECT provolatile = 's' FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='facility_log_trend'));

  PERFORM _sk('A','A4 pins a search_path',
    (SELECT proconfig::text LIKE '%search_path=public, pg_temp%'
       FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='facility_log_trend'));
END
$a$;


--  Everything below runs as company A's admin.
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-7b02-b000-000000000001","role":"authenticated"}', false);
SET ROLE authenticated;

-- =====================================================================
--  B — the weekly figure is the MAXIMUM
-- =====================================================================
DO $b$
DECLARE v numeric; n bigint;
BEGIN
  SELECT max_value, sample_count INTO v, n
    FROM public.facility_log_trend('00000000-0000-7b02-a000-000000000001','environmental_air',12)
   WHERE week_start = (date_trunc('week', now()) - interval '2 weeks')::date;

  --  10, 10, 10, 112 — the mean is 35.5 and would read as comfortable
  --  against an action limit of 100.
  PERFORM _sk('B','B1 the week of four readings reports 112, not the mean',
              v = 112, 'got '||coalesce(v::text,'null'));
  PERFORM _sk('B','B2 and still counts all four readings',
              n = 4, 'got '||coalesce(n::text,'null'));

  SELECT max_value INTO v
    FROM public.facility_log_trend('00000000-0000-7b02-a000-000000000001','environmental_air',12)
   WHERE week_start = (date_trunc('week', now()) - interval '3 weeks')::date;
  PERFORM _sk('B','B3 a single-reading week reports that reading',
              v = 28, 'got '||coalesce(v::text,'null'));

  --  One row per zone per week, or the chart would draw duplicates.
  SELECT count(*) INTO n FROM (
    SELECT zone_id, week_start, count(*) AS c
      FROM public.facility_log_trend('00000000-0000-7b02-a000-000000000001','environmental_air',52)
     GROUP BY zone_id, week_start HAVING count(*) > 1
  ) dupes;
  PERFORM _sk('B','B4 one row per zone per week', n = 0, n||' duplicated bucket(s)');
END
$b$;


-- =====================================================================
--  C — the peak reading's timestamp
-- =====================================================================
DO $c$
DECLARE ts timestamptz; expect timestamptz;
BEGIN
  SELECT max_recorded_at INTO ts
    FROM public.facility_log_trend('00000000-0000-7b02-a000-000000000001','environmental_air',12)
   WHERE week_start = (date_trunc('week', now()) - interval '2 weeks')::date;
  expect := date_trunc('week', now()) - interval '2 weeks' + interval '4 days';
  --  The 112 was taken on day 4, not on the first day of the week.
  PERFORM _sk('C','C1 names the day the peak was taken, not the week start',
              ts = expect, 'got '||coalesce(ts::text,'null'));

  SELECT max_recorded_at INTO ts
    FROM public.facility_log_trend('00000000-0000-7b02-a000-000000000001','environmental_air',12)
   WHERE week_start = (date_trunc('week', now()) - interval '1 week')::date;
  expect := date_trunc('week', now()) - interval '1 week' + interval '1 day';
  --  Two readings tied at 60; the earlier is the first time the week's
  --  high was reached, which is the honest answer.
  PERFORM _sk('C','C2 breaks a tie to the earliest reading',
              ts = expect, 'got '||coalesce(ts::text,'null'));
END
$c$;


-- =====================================================================
--  D — what does not trend
-- =====================================================================
DO $d$
DECLARE n bigint;
BEGIN
  --  The cleaning record has no number. Plotting it as zero would
  --  draw a clean room as a perfect air result.
  SELECT count(*) INTO n
    FROM public.facility_log_trend('00000000-0000-7b02-a000-000000000001','cleaning_routine',12);
  PERFORM _sk('D','D1 a log type with no measured readings returns nothing',
              n = 0, n||' row(s)');

  SELECT count(*) INTO n
    FROM public.facility_log_trend('00000000-0000-7b02-a000-000000000001','environmental_air',12)
   WHERE week_start = date_trunc('week', now())::date;
  --  The only entry in the current week is that cleaning record.
  PERFORM _sk('D','D2 a week holding only unmeasured records has no bucket',
              n = 0, n||' row(s)');

  SELECT count(*) INTO n
    FROM public.facility_log_trend('00000000-0000-7b02-a000-000000000001','environmental_surface',12);
  PERFORM _sk('D','D3 a log type with no entries at all returns nothing',
              n = 0, n||' row(s)');
END
$d$;


-- =====================================================================
--  E — cross-tenant
-- =====================================================================
DO $e$
DECLARE n bigint; v numeric;
BEGIN
  --  Asking for Bravo's company outright. SECURITY INVOKER means RLS
  --  answers, not the function.
  SELECT count(*) INTO n
    FROM public.facility_log_trend('00000000-0000-7b02-a000-000000000002','environmental_air',52);
  PERFORM _sk('E','E1 returns nothing for another company', n = 0, n||' row(s)');

  --  And Bravo's 999 must not leak into company A's own series.
  SELECT max(max_value) INTO v
    FROM public.facility_log_trend('00000000-0000-7b02-a000-000000000001','environmental_air',52);
  PERFORM _sk('E','E2 no other company''s reading appears in our own series',
              coalesce(v,0) < 999, 'highest seen '||coalesce(v::text,'null'));
END
$e$;


-- =====================================================================
--  F — which limits a chart draws
-- =====================================================================
DO $f$
DECLARE a numeric; ac numeric; u text;
BEGIN
  SELECT DISTINCT alert_limit, action_limit, result_unit INTO a, ac, u
    FROM public.facility_log_trend('00000000-0000-7b02-a000-000000000001','environmental_air',12);

  --  The zone carries two air schedules: 50/100 and 80/200. The
  --  tightest is drawn, so a reading is never shown as comfortable
  --  against a looser limit than one of its own schedules imposes.
  PERFORM _sk('F','F1 draws the tightest alert limit of the zone''s schedules',
              a = 50, 'got '||coalesce(a::text,'null'));
  PERFORM _sk('F','F2 draws the tightest action limit',
              ac = 100, 'got '||coalesce(ac::text,'null'));
  PERFORM _sk('F','F3 carries the unit, so the axis can be captioned',
              u = 'CFU', 'got '||coalesce(u,'null'));
END
$f$;


-- =====================================================================
--  G — where a week starts
-- =====================================================================
DO $g$
DECLARE n bigint;
BEGIN
  --  NOT established by the design: FL-06's axis reads 04 Aug, 11 Aug
  --  … and 04 Aug 2026 is a TUESDAY. date_trunc('week') is ISO-8601,
  --  so Monday. That is a choice, and this pins it: if it is ever
  --  changed it should be because someone decided to.
  SELECT count(*) INTO n
    FROM public.facility_log_trend('00000000-0000-7b02-a000-000000000001','environmental_air',52)
   WHERE extract(isodow FROM week_start) <> 1;
  PERFORM _sk('G','G1 every bucket starts on a Monday (ISO-8601)',
              n = 0, n||' bucket(s) not on a Monday');
END
$g$;


-- =====================================================================
--  H — the period window
-- =====================================================================
DO $h$
DECLARE n bigint; v numeric;
BEGIN
  --  The 40-week-old reading of 7 is outside a 12-week window.
  SELECT count(*) INTO n
    FROM public.facility_log_trend('00000000-0000-7b02-a000-000000000001','environmental_air',12)
   WHERE week_start < (date_trunc('week', now()) - interval '11 weeks')::date;
  PERFORM _sk('H','H1 nothing older than the requested window', n = 0, n||' row(s)');

  --  A 4-week window keeps weeks -3, -2 and -1 and drops the rest.
  SELECT count(*) INTO n
    FROM public.facility_log_trend('00000000-0000-7b02-a000-000000000001','environmental_air',4);
  PERFORM _sk('H','H2 a 4-week window keeps the three recent buckets',
              n = 3, n||' row(s)');

  --  A long window reaches the old one.
  SELECT count(*) INTO n
    FROM public.facility_log_trend('00000000-0000-7b02-a000-000000000001','environmental_air',52);
  PERFORM _sk('H','H3 a 52-week window also reaches the 40-week-old reading',
              n = 4, n||' row(s)');

  --  A nonsense window must not return the whole table: greatest(,1)
  --  clamps it to the current week.
  SELECT count(*) INTO n
    FROM public.facility_log_trend('00000000-0000-7b02-a000-000000000001','environmental_air',0);
  PERFORM _sk('H','H4 a zero window is clamped, not treated as unbounded',
              n = 0, n||' row(s)');

  SELECT max_value INTO v
    FROM public.facility_log_trend('00000000-0000-7b02-a000-000000000001','environmental_air',52)
   WHERE week_start = (date_trunc('week', now()) - interval '40 weeks')::date;
  PERFORM _sk('H','H5 and reports it correctly', v = 7, 'got '||coalesce(v::text,'null'));
END
$h$;

RESET ROLE;
SELECT set_config('request.jwt.claims','',false);


\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo '  FACILITY LOGS, PART 3 — TRENDS'
\echo '════════════════════════════════════════════════════════════════'
SELECT section, count(*) AS assertions, count(*) FILTER (WHERE NOT ok) AS failures
  FROM _s GROUP BY section ORDER BY section;
SELECT section, name, coalesce(detail,'') AS detail FROM _s WHERE NOT ok ORDER BY section, name;
SELECT count(*) AS total, count(*) FILTER (WHERE ok) AS passed,
       count(*) FILTER (WHERE NOT ok) AS failed FROM _s;

DO $v$
DECLARE f integer;
BEGIN
  SELECT count(*) INTO f FROM _s WHERE NOT ok;
  IF f > 0 THEN RAISE EXCEPTION 'FACILITY TRENDS: % assertion(s) failed', f; END IF;
  RAISE NOTICE 'FACILITY TRENDS: all assertions passed';
END
$v$;
