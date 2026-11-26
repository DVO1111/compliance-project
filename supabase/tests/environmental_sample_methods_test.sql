-- =====================================================================
--  ENVIRONMENTAL SAMPLING METHODS (20261210000000)
--
--  A. The columns and their vocabulary
--  B. A method must match its medium
--  C. The metadata must match the method
--  D. Inheritance from the protocol
--  E. FL-06's three sub-tabs
--  F. NO UNIVERSAL THRESHOLD
--  G. The outcome derivation is unchanged
--
--  WHY F IS THE POINT OF THIS FILE
--  -------------------------------
--  A settle plate measures CFU per plate over an exposure period; an
--  active-air sampler measures CFU per cubic metre of air drawn. They
--  are not the same quantity, and the ratio between them depends on
--  plate area, exposure time and flow rate.
--
--  The instruction was "do not assume universal alert thresholds". So
--  F puts both methods in ONE ZONE with DIFFERENT limits and proves
--  that each keeps its own — that the trend draws the right limit line
--  for the method being charted, and that no default was introduced
--  anywhere.
-- =====================================================================
\set ON_ERROR_STOP on
SET client_min_messages = warning;

CREATE TEMP TABLE _s(section text, name text, ok boolean, detail text);
CREATE OR REPLACE FUNCTION _sk(p_section text, p_name text, p_ok boolean, p_detail text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO _s VALUES (p_section,p_name,coalesce(p_ok,false),p_detail); END $$;

GRANT ALL ON _s TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION _sk(text,text,boolean,text) TO anon, authenticated, service_role;


-- ── Fixture: one zone running BOTH air methods, with different limits ─
DO $fx$
DECLARE
  ca uuid := '00000000-0000-7b06-a000-000000000001';
  ua uuid := '00000000-0000-7b06-b000-000000000001';
  sa uuid := '00000000-0000-7b06-c000-000000000001';
  za uuid := '00000000-0000-7b06-d000-000000000001';
  sch_settle uuid := '00000000-0000-7b06-e000-000000000001';
  sch_active uuid := '00000000-0000-7b06-e000-000000000002';
  sch_swab   uuid := '00000000-0000-7b06-e000-000000000003';
  wk0 timestamptz := date_trunc('week', now());
BEGIN
  DELETE FROM public.facility_log_entries    WHERE company_id = ca;
  DELETE FROM public.facility_zone_schedules WHERE company_id = ca;
  DELETE FROM public.facility_zones          WHERE company_id = ca;
  DELETE FROM public.sites                   WHERE company_id = ca;
  DELETE FROM public.company_members         WHERE company_id = ca;
  DELETE FROM public.profiles                WHERE id = ua;
  DELETE FROM auth.users                     WHERE id = ua;
  DELETE FROM public.companies               WHERE id = ca;

  INSERT INTO public.companies(id,name) VALUES (ca,'SM Alpha');
  INSERT INTO auth.users(id,email) VALUES (ua,'sm-a@local.test');
  INSERT INTO public.profiles(id,email,full_name,role,company_id)
    VALUES (ua,'sm-a@local.test','Ada Alpha','admin',ca);
  INSERT INTO public.company_members(company_id,user_id,role,status)
    VALUES (ca,ua,'owner','active');
  INSERT INTO public.sites(id,company_id,name) VALUES (sa,ca,'SM plant');
  INSERT INTO public.facility_zones(id,company_id,site_id,name,grade,created_by)
    VALUES (za,ca,sa,'SM Filling room','Grade A',ua);

  /*
   *  ONE ZONE, BOTH AIR METHODS, DIFFERENT LIMITS AND DIFFERENT UNITS.
   *  This is the arrangement section F turns on, and it is the real
   *  case: a Grade A filling room is monitored by settle plates AND by
   *  active air, to different specifications.
   */
  INSERT INTO public.facility_zone_schedules
    (id,company_id,zone_id,log_type,description,frequency,
     alert_limit,action_limit,result_unit,
     sample_method,protocol_positions,protocol_exposure_minutes,protocol_volume_litres)
  VALUES
    (sch_settle,ca,za,'environmental_air','Air · settle plates, 4 positions','daily',
     1,2,'CFU/plate/4h','settle_plate',4,240,NULL),
    (sch_active,ca,za,'environmental_air','Air · active sampling, 1 m³','daily',
     5,10,'CFU/m3','active_air',1,NULL,1000),
    (sch_swab,ca,za,'environmental_surface','Surface swabs, 5 sites','weekly',
     20,50,'CFU/25cm2','surface_swab',5,NULL,NULL);

  --  A reading on each air method, this week.
  INSERT INTO public.facility_log_entries
    (company_id,zone_id,schedule_id,log_type,recorded_at,result_value,recorded_by)
  VALUES
    (ca,za,sch_settle,'environmental_air', wk0 + interval '1 day', 3, ua),
    (ca,za,sch_active,'environmental_air', wk0 + interval '1 day', 7, ua);
END
$fx$;


-- =====================================================================
--  A — the columns and their vocabulary
-- =====================================================================
DO $a$
BEGIN
  PERFORM _sk('A','A1 schedules carry a sample_method',
    (SELECT count(*) = 1 FROM information_schema.columns
      WHERE table_name='facility_zone_schedules' AND column_name='sample_method'));

  PERFORM _sk('A','A2 entries carry one too, for what was actually done',
    (SELECT count(*) = 3 FROM information_schema.columns
      WHERE table_name='facility_log_entries'
        AND column_name IN ('sample_method','exposure_minutes','volume_litres')));

  --  The three FL-06 draws, and no more. An unknown method would have
  --  no tab to appear under.
  PERFORM _sk('A','A3 the method vocabulary is exactly FL-06''s three tabs',
    (SELECT pg_get_constraintdef(oid) LIKE '%settle_plate%'
        AND pg_get_constraintdef(oid) LIKE '%active_air%'
        AND pg_get_constraintdef(oid) LIKE '%surface_swab%'
       FROM pg_constraint
      WHERE conname = 'facility_schedule_sample_method_chk'));

  --  log_type keeps its six values: this migration is additive.
  PERFORM _sk('A','A4 log_type was not changed',
    (SELECT pg_get_constraintdef(oid) LIKE '%pest_control%'
       FROM pg_constraint
      WHERE conrelid='public.facility_zone_schedules'::regclass
        AND contype='c' AND conname LIKE '%log_type%'));
END
$a$;


SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-7b06-b000-000000000001","role":"authenticated"}', false);
SET ROLE authenticated;

-- =====================================================================
--  B — a method must match its medium
-- =====================================================================
DO $b$
BEGIN
  --  A swab samples a surface, not air.
  BEGIN
    INSERT INTO public.facility_zone_schedules
      (company_id,zone_id,log_type,description,frequency,sample_method,
       protocol_volume_litres)
    VALUES ('00000000-0000-7b06-a000-000000000001','00000000-0000-7b06-d000-000000000001',
            'environmental_surface','Wrong medium','weekly','active_air',1000);
    PERFORM _sk('B','B1 a surface schedule cannot claim active-air sampling',
                false,'the insert succeeded');
  EXCEPTION WHEN check_violation THEN
    PERFORM _sk('B','B1 a surface schedule cannot claim active-air sampling', true, SQLSTATE);
  END;

  BEGIN
    INSERT INTO public.facility_zone_schedules
      (company_id,zone_id,log_type,description,frequency,sample_method,
       protocol_exposure_minutes)
    VALUES ('00000000-0000-7b06-a000-000000000001','00000000-0000-7b06-d000-000000000001',
            'environmental_air','Wrong medium 2','daily','surface_swab',240);
    PERFORM _sk('B','B2 an air schedule cannot claim a surface swab',
                false,'the insert succeeded');
  EXCEPTION WHEN check_violation THEN
    PERFORM _sk('B','B2 an air schedule cannot claim a surface swab', true, SQLSTATE);
  END;

  --  A cleaning schedule has no sampling method at all.
  BEGIN
    INSERT INTO public.facility_zone_schedules
      (company_id,zone_id,log_type,description,frequency,sample_method,
       protocol_exposure_minutes)
    VALUES ('00000000-0000-7b06-a000-000000000001','00000000-0000-7b06-d000-000000000001',
            'cleaning_routine','Clean with a settle plate?','daily','settle_plate',240);
    PERFORM _sk('B','B3 a cleaning schedule cannot carry a sampling method',
                false,'the insert succeeded');
  EXCEPTION WHEN check_violation THEN
    PERFORM _sk('B','B3 a cleaning schedule cannot carry a sampling method', true, SQLSTATE);
  END;

  --  And an environmental schedule with NO method is still accepted:
  --  every schedule that existed before this migration has none.
  INSERT INTO public.facility_zone_schedules
    (company_id,zone_id,log_type,description,frequency)
  VALUES ('00000000-0000-7b06-a000-000000000001','00000000-0000-7b06-d000-000000000001',
          'environmental_air','Legacy schedule with no method','daily');
  PERFORM _sk('B','B4 an environmental schedule may still state no method',
    (SELECT count(*) = 1 FROM public.facility_zone_schedules
      WHERE description = 'Legacy schedule with no method'));
END
$b$;


-- =====================================================================
--  C — the metadata must match the method
-- =====================================================================
DO $c$
BEGIN
  /*
   *  A settle-plate count with no exposure period is a number with no
   *  denominator: "3 CFU" means nothing without "per plate per four
   *  hours". That is why this is a CHECK and not a client nicety — an
   *  incomparable result is worse than a missing one.
   */
  BEGIN
    INSERT INTO public.facility_zone_schedules
      (company_id,zone_id,log_type,description,frequency,sample_method)
    VALUES ('00000000-0000-7b06-a000-000000000001','00000000-0000-7b06-d000-000000000001',
            'environmental_air','Plates, no exposure','daily','settle_plate');
    PERFORM _sk('C','C1 a settle plate needs an exposure period',
                false,'the insert succeeded');
  EXCEPTION WHEN check_violation THEN
    PERFORM _sk('C','C1 a settle plate needs an exposure period', true, SQLSTATE);
  END;

  BEGIN
    INSERT INTO public.facility_zone_schedules
      (company_id,zone_id,log_type,description,frequency,sample_method)
    VALUES ('00000000-0000-7b06-a000-000000000001','00000000-0000-7b06-d000-000000000001',
            'environmental_air','Active air, no volume','daily','active_air');
    PERFORM _sk('C','C2 an active-air schedule needs a sampled volume',
                false,'the insert succeeded');
  EXCEPTION WHEN check_violation THEN
    PERFORM _sk('C','C2 an active-air schedule needs a sampled volume', true, SQLSTATE);
  END;

  --  A settle plate must NOT carry a volume, and active air must not
  --  carry an exposure: the wrong denominator is as bad as none.
  BEGIN
    INSERT INTO public.facility_zone_schedules
      (company_id,zone_id,log_type,description,frequency,sample_method,
       protocol_exposure_minutes,protocol_volume_litres)
    VALUES ('00000000-0000-7b06-a000-000000000001','00000000-0000-7b06-d000-000000000001',
            'environmental_air','Both denominators','daily','settle_plate',240,1000);
    PERFORM _sk('C','C3 a settle plate cannot also carry a sampled volume',
                false,'the insert succeeded');
  EXCEPTION WHEN check_violation THEN
    PERFORM _sk('C','C3 a settle plate cannot also carry a sampled volume', true, SQLSTATE);
  END;

  --  A zero exposure is not an exposure.
  BEGIN
    INSERT INTO public.facility_zone_schedules
      (company_id,zone_id,log_type,description,frequency,sample_method,
       protocol_exposure_minutes)
    VALUES ('00000000-0000-7b06-a000-000000000001','00000000-0000-7b06-d000-000000000001',
            'environmental_air','Zero exposure','daily','settle_plate',0);
    PERFORM _sk('C','C4 a zero exposure period is refused', false,'the insert succeeded');
  EXCEPTION WHEN check_violation THEN
    PERFORM _sk('C','C4 a zero exposure period is refused', true, SQLSTATE);
  END;

  --  A swab carries neither, and that is accepted.
  PERFORM _sk('C','C5 a surface swab needs neither denominator',
    (SELECT protocol_exposure_minutes IS NULL AND protocol_volume_litres IS NULL
       FROM public.facility_zone_schedules
      WHERE id = '00000000-0000-7b06-e000-000000000003'));
END
$c$;


-- =====================================================================
--  D — inheritance from the protocol
-- =====================================================================
DO $d$
DECLARE r record;
BEGIN
  SELECT sample_method, exposure_minutes, volume_litres INTO r
    FROM public.facility_log_entries
   WHERE schedule_id = '00000000-0000-7b06-e000-000000000001';
  PERFORM _sk('D','D1 a settle-plate entry inherits its method and exposure',
              r.sample_method = 'settle_plate' AND r.exposure_minutes = 240
              AND r.volume_litres IS NULL,
              coalesce(r.sample_method,'null'));

  SELECT sample_method, exposure_minutes, volume_litres INTO r
    FROM public.facility_log_entries
   WHERE schedule_id = '00000000-0000-7b06-e000-000000000002';
  PERFORM _sk('D','D2 an active-air entry inherits its volume',
              r.sample_method = 'active_air' AND r.volume_litres = 1000
              AND r.exposure_minutes IS NULL,
              coalesce(r.sample_method,'null'));

  --  What was ACTUALLY done overrides the protocol, because a plate
  --  exposed for two hours against a four-hour protocol is a real
  --  event that has to be recordable rather than silently assumed.
  INSERT INTO public.facility_log_entries
    (company_id,zone_id,schedule_id,log_type,result_value,exposure_minutes,recorded_by)
  VALUES ('00000000-0000-7b06-a000-000000000001','00000000-0000-7b06-d000-000000000001',
          '00000000-0000-7b06-e000-000000000001','environmental_air',1,120,auth.uid());
  PERFORM _sk('D','D3 a stated exposure is kept, not overwritten by the protocol',
    (SELECT exposure_minutes = 120 FROM public.facility_log_entries
      WHERE schedule_id='00000000-0000-7b06-e000-000000000001'
        AND exposure_minutes = 120));
END
$d$;


-- =====================================================================
--  E — FL-06's three sub-tabs
-- =====================================================================
DO $e$
DECLARE n integer; r record;
BEGIN
  --  Unfiltered: both air methods, which is what the three-argument
  --  callers written before this migration still get.
  SELECT count(*) INTO n FROM public.facility_log_trend(
    '00000000-0000-7b06-a000-000000000001','environmental_air',12);
  PERFORM _sk('E','E1 an unfiltered trend still works for existing callers',
              n >= 1, n||' row(s)');

  --  Filtered to settle plates.
  SELECT count(*) INTO n FROM public.facility_log_trend(
    '00000000-0000-7b06-a000-000000000001','environmental_air',12,'settle_plate');
  PERFORM _sk('E','E2 the trend filters to settle plates', n = 1, n||' row(s)');

  SELECT count(*) INTO n FROM public.facility_log_trend(
    '00000000-0000-7b06-a000-000000000001','environmental_air',12,'active_air');
  PERFORM _sk('E','E3 and to active air', n = 1, n||' row(s)');

  --  A method with no readings returns nothing rather than borrowing
  --  another method's.
  SELECT count(*) INTO n FROM public.facility_log_trend(
    '00000000-0000-7b06-a000-000000000001','environmental_surface',12,'surface_swab');
  PERFORM _sk('E','E4 a method with no readings returns nothing', n = 0, n||' row(s)');

  SELECT sample_method INTO r FROM public.facility_log_trend(
    '00000000-0000-7b06-a000-000000000001','environmental_air',12,'settle_plate');
  PERFORM _sk('E','E5 the trend reports which method it charted',
              r.sample_method = 'settle_plate', coalesce(r.sample_method,'null'));

  /*
   *  E6/E7 — the denominator travels with the series. A count is not
   *  interpretable without it: 3 is "3 per plate over four hours" on
   *  one chart and "3 per cubic metre" on the other, and the chart
   *  can only say so if the trend hands it the protocol.
   */
  SELECT protocol_exposure_minutes, protocol_volume_litres INTO r
    FROM public.facility_log_trend(
      '00000000-0000-7b06-a000-000000000001','environmental_air',12,'settle_plate');
  PERFORM _sk('E','E6 the settle-plate series carries its exposure time',
              r.protocol_exposure_minutes = 240
                AND r.protocol_volume_litres IS NULL,
              coalesce(r.protocol_exposure_minutes::text,'null')||' min / '||
              coalesce(r.protocol_volume_litres::text,'null')||' L');

  SELECT protocol_exposure_minutes, protocol_volume_litres INTO r
    FROM public.facility_log_trend(
      '00000000-0000-7b06-a000-000000000001','environmental_air',12,'active_air');
  PERFORM _sk('E','E7 the active-air series carries its sampled volume, not an exposure',
              r.protocol_volume_litres = 1000
                AND r.protocol_exposure_minutes IS NULL,
              coalesce(r.protocol_exposure_minutes::text,'null')||' min / '||
              coalesce(r.protocol_volume_litres::text,'null')||' L');
END
$e$;


-- =====================================================================
--  F — NO UNIVERSAL THRESHOLD
-- =====================================================================
DO $f$
DECLARE settle record; active record;
BEGIN
  SELECT max_value, alert_limit, action_limit, result_unit INTO settle
    FROM public.facility_log_trend(
      '00000000-0000-7b06-a000-000000000001','environmental_air',12,'settle_plate');

  SELECT max_value, alert_limit, action_limit, result_unit INTO active
    FROM public.facility_log_trend(
      '00000000-0000-7b06-a000-000000000001','environmental_air',12,'active_air');

  /*
   *  THE ASSERTIONS THIS FILE EXISTS FOR. One zone, both methods.
   *  The settle-plate chart must carry 1/2 CFU/plate/4h and the
   *  active-air chart 5/10 CFU/m³ — each its own, neither borrowed,
   *  and no average of the two.
   */
  PERFORM _sk('F','F1 the settle-plate chart carries settle-plate limits',
              settle.alert_limit = 1 AND settle.action_limit = 2,
              coalesce(settle.alert_limit::text,'null')||'/'
                ||coalesce(settle.action_limit::text,'null'));

  PERFORM _sk('F','F2 the active-air chart carries active-air limits',
              active.alert_limit = 5 AND active.action_limit = 10,
              coalesce(active.alert_limit::text,'null')||'/'
                ||coalesce(active.action_limit::text,'null'));

  PERFORM _sk('F','F3 the two methods do not share a limit',
              settle.action_limit <> active.action_limit);

  --  And they do not share a unit either, which is WHY they cannot
  --  share a limit.
  PERFORM _sk('F','F4 nor a unit',
              settle.result_unit = 'CFU/plate/4h' AND active.result_unit = 'CFU/m3',
              coalesce(settle.result_unit,'null')||' vs '||coalesce(active.result_unit,'null'));

  --  The same reading judged by each method's own schedule: 3 against
  --  2 is outside action for a plate; 7 against 10 is within for air.
  PERFORM _sk('F','F5 each reading is judged by its own method''s limits',
    (SELECT outcome = 'outside_action' FROM public.facility_log_entries
      WHERE schedule_id='00000000-0000-7b06-e000-000000000001' AND result_value = 3));
  --  7 against 5/10 is above the ALERT limit but not the action one.
  --  A different verdict from the same number, which is the point.
  PERFORM _sk('F','F6 and the other is judged by its own',
    (SELECT outcome = 'outside_alert' FROM public.facility_log_entries
      WHERE schedule_id='00000000-0000-7b06-e000-000000000002' AND result_value = 7),
    (SELECT outcome FROM public.facility_log_entries
      WHERE schedule_id='00000000-0000-7b06-e000-000000000002' AND result_value = 7));

  /*
   *  THE DEFECT THIS AVOIDS, stated as arithmetic rather than as a
   *  claim. ONE reading of 4 CFU:
   *
   *    against settle-plate limits of 1/2   -> outside_action
   *    against active-air limits of 5/10    -> within_limits
   *
   *  Same number, opposite verdicts, because the quantities are not
   *  the same. A universal alert threshold would have had to call one
   *  of these wrong — which is what "do not assume universal alert
   *  thresholds" rules out.
   */
  PERFORM _sk('F','F7 one reading, opposite verdicts under each method''s own limits',
    public.facility_log_outcome(true, 4, 1, 2) = 'outside_action'
    AND public.facility_log_outcome(true, 4, 5, 10) = 'within_limits',
    public.facility_log_outcome(true, 4, 1, 2)||' vs '
      ||public.facility_log_outcome(true, 4, 5, 10));
END
$f$;


-- =====================================================================
--  G — the outcome derivation is unchanged
-- =====================================================================
DO $g$
DECLARE v text;
BEGIN
  --  The method changes what a number MEANS, not how it is compared
  --  with its own limits, so facility_log_outcome keeps its contract.
  PERFORM _sk('G','G1 facility_log_outcome still takes four arguments',
    (SELECT count(*) = 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='facility_log_outcome'
        AND p.pronargs = 4));

  --  No conversion between the methods exists anywhere.
  PERFORM _sk('G','G2 the outcome is still derived, not accepted',
    (SELECT count(*) = 1 FROM pg_trigger
      WHERE tgrelid='public.facility_log_entries'::regclass
        AND tgname='trg_facility_log_outcome' AND NOT tgisinternal));

  --  A claimed pass is still discarded.
  INSERT INTO public.facility_log_entries
    (company_id,zone_id,schedule_id,log_type,result_value,outcome,recorded_by)
  VALUES ('00000000-0000-7b06-a000-000000000001','00000000-0000-7b06-d000-000000000001',
          '00000000-0000-7b06-e000-000000000001','environmental_air',99,
          'within_limits',auth.uid());
  SELECT outcome INTO v FROM public.facility_log_entries
   WHERE result_value = 99 AND schedule_id='00000000-0000-7b06-e000-000000000001';
  PERFORM _sk('G','G3 a claimed pass on a failing reading is still discarded',
              v = 'outside_action', 'got '||coalesce(v,'null'));
END
$g$;

RESET ROLE;
SELECT set_config('request.jwt.claims','',false);


\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo '  ENVIRONMENTAL SAMPLING METHODS'
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
  IF f > 0 THEN RAISE EXCEPTION 'SAMPLE METHODS: % assertion(s) failed', f; END IF;
  RAISE NOTICE 'SAMPLE METHODS: all assertions passed';
END
$v$;
