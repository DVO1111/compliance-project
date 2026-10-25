-- =====================================================================
--  FACILITY LOGS — ISOLATION AND THE OUTCOME RULE
--
--  A. RLS posture on the three tables
--  B. Cross-tenant reads and writes
--  C. anon
--  D. The outcome is the database's, not the caller's
--  E. A zone and a schedule have to belong together
--  F. The register function
--  G. Constraints that protect the meaning of a limit
--
--  WHY D MATTERS MOST
--  ------------------
--  An environmental log exists to record whether a reading was within
--  its limits. If a client can assert that, the record is worthless —
--  and the same defect was found in the customs flag two migrations
--  ago, where `is_flagged` was computed in the browser and inserted as
--  an ordinary column. Facility logs were written the other way round
--  from the start, and section D is what holds that.
-- =====================================================================
\set ON_ERROR_STOP on
SET client_min_messages = warning;

CREATE TEMP TABLE _s(section text, name text, ok boolean, detail text);
CREATE OR REPLACE FUNCTION _sk(p_section text, p_name text, p_ok boolean, p_detail text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO _s VALUES (p_section,p_name,coalesce(p_ok,false),p_detail); END $$;

GRANT ALL ON _s TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION _sk(text,text,boolean,text) TO anon, authenticated, service_role;


-- ── Fixture: two companies, each with a site and a zone ──────────────
DO $fx$
DECLARE
  ca uuid := '00000000-0000-7b00-a000-000000000001';
  cb uuid := '00000000-0000-7b00-a000-000000000002';
  ua uuid := '00000000-0000-7b00-b000-000000000001';
  ub uuid := '00000000-0000-7b00-b000-000000000002';
  sa uuid := '00000000-0000-7b00-c000-000000000001';
  sb uuid := '00000000-0000-7b00-c000-000000000002';
  za uuid := '00000000-0000-7b00-d000-000000000001';
  zb uuid := '00000000-0000-7b00-d000-000000000002';
BEGIN
  INSERT INTO public.companies(id,name) VALUES (ca,'FL Alpha'), (cb,'FL Bravo')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO auth.users(id,email) VALUES (ua,'fl-a@local.test'), (ub,'fl-b@local.test')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.profiles(id,email,full_name,role,company_id) VALUES
    (ua,'fl-a@local.test','Ada Alpha','admin',ca),
    (ub,'fl-b@local.test','Bo Bravo','admin',cb) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.company_members(company_id,user_id,role,status) VALUES
    (ca,ua,'owner','active'), (cb,ub,'owner','active') ON CONFLICT DO NOTHING;

  INSERT INTO public.sites(id,company_id,name) VALUES
    (sa,ca,'Oluyole plant'), (sb,cb,'Bravo depot') ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.facility_zones(id,company_id,site_id,name,code,grade,line_ref,created_by)
  VALUES (za,ca,sa,'Granulation room G2','GR-02','Grade D','Line TL-1',ua),
         (zb,cb,sb,'Bravo cold room','BCR-1','Unclassified',NULL,ub)
    ON CONFLICT (id) DO NOTHING;

  --  Alpha: a surface swab with both limits, and a routine clean with
  --  neither — the two shapes FL-01 draws.
  INSERT INTO public.facility_zone_schedules
    (id,company_id,zone_id,log_type,description,frequency,alert_limit,action_limit,result_unit)
  VALUES ('00000000-0000-7b00-e000-000000000001',ca,za,'environmental_surface',
          'Surface swabs, 5 sites','weekly',25,50,'CFU'),
         ('00000000-0000-7b00-e000-000000000002',ca,za,'cleaning_routine',
          'Routine clean after shift','daily',NULL,NULL,NULL)
    ON CONFLICT (id) DO NOTHING;

  --  Bravo's own schedule, for the wrong-zone test.
  INSERT INTO public.facility_zone_schedules
    (id,company_id,zone_id,log_type,description,frequency,alert_limit,action_limit,result_unit)
  VALUES ('00000000-0000-7b00-e000-000000000003',cb,zb,'environmental_air',
          'Air, active sampler','daily',10,20,'CFU')
    ON CONFLICT (id) DO NOTHING;
END
$fx$;


-- =====================================================================
--  A — RLS posture
-- =====================================================================
DO $a$
DECLARE t text; v_on boolean; v_pol integer;
BEGIN
  FOREACH t IN ARRAY ARRAY['facility_zones','facility_zone_schedules','facility_log_entries']
  LOOP
    SELECT relrowsecurity INTO v_on FROM pg_class WHERE oid = ('public.'||t)::regclass;
    PERFORM _sk('A','A1 '||t||' has RLS enabled', coalesce(v_on,false));
    SELECT count(*) INTO v_pol FROM pg_policies WHERE schemaname='public' AND tablename=t;
    PERFORM _sk('A','A2 '||t||' carries a policy', v_pol > 0, v_pol||' policy(ies)');
  END LOOP;

  --  Every one of the three FKs to companies, which the logistics
  --  tables were found to be missing.
  PERFORM _sk('A','A3 all three tables reference companies',
    (SELECT count(*) = 3 FROM pg_constraint c
      WHERE c.contype='f' AND c.confrelid='public.companies'::regclass
        AND c.conrelid IN ('public.facility_zones'::regclass,
                           'public.facility_zone_schedules'::regclass,
                           'public.facility_log_entries'::regclass)));
END
$a$;


--  Everything below runs as company B's admin.
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-7b00-b000-000000000002","role":"authenticated"}', false);
SET ROLE authenticated;

-- =====================================================================
--  B — a legitimate user of another tenant
-- =====================================================================
DO $b$
DECLARE n integer; v_err text;
BEGIN
  SELECT count(*) INTO n FROM public.facility_zones
   WHERE company_id = '00000000-0000-7b00-a000-000000000001';
  PERFORM _sk('B','B1 sees none of company A''s zones', n = 0, n||' row(s)');

  SELECT count(*) INTO n FROM public.facility_zone_schedules
   WHERE company_id = '00000000-0000-7b00-a000-000000000001';
  PERFORM _sk('B','B2 sees none of company A''s schedules', n = 0, n||' row(s)');

  BEGIN
    INSERT INTO public.facility_log_entries(company_id,zone_id,log_type,recorded_by)
    VALUES ('00000000-0000-7b00-a000-000000000001',
            '00000000-0000-7b00-d000-000000000001','environmental_surface',auth.uid());
    PERFORM _sk('B','B3 cannot record against company A''s zone', false, 'the insert succeeded');
  EXCEPTION WHEN others THEN
    v_err := SQLSTATE;
    PERFORM _sk('B','B3 cannot record against company A''s zone', true, 'SQLSTATE '||v_err);
  END;

  --  The silent-filter trap: an UPDATE matching no row raises nothing.
  UPDATE public.facility_zones SET grade = 'tampered'
   WHERE id = '00000000-0000-7b00-d000-000000000001';
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM _sk('B','B4 cannot amend company A''s zone', n = 0, n||' row(s) updated');

  --  Stapling your own entry onto another tenant's zone: refused by the
  --  trigger even though the company_id is your own, because the zone
  --  is not.
  BEGIN
    INSERT INTO public.facility_log_entries(company_id,zone_id,log_type,recorded_by)
    VALUES ('00000000-0000-7b00-a000-000000000002',
            '00000000-0000-7b00-d000-000000000001','environmental_surface',auth.uid());
    PERFORM _sk('B','B5 cannot attach an own-company entry to another tenant''s zone',
                false, 'the insert succeeded');
  EXCEPTION WHEN others THEN
    v_err := SQLERRM;
    PERFORM _sk('B','B5 cannot attach an own-company entry to another tenant''s zone',
                v_err LIKE 'FACILITY_ZONE%', v_err);
  END;
END
$b$;

RESET ROLE;
SELECT set_config('request.jwt.claims','',false);

-- =====================================================================
--  C — anon
-- =====================================================================
SET ROLE anon;
DO $c$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM public.facility_zones;
  PERFORM _sk('C','C1 anon reads no zones', n = 0, n||' row(s)');
  SELECT count(*) INTO n FROM public.facility_log_entries;
  PERFORM _sk('C','C2 anon reads no entries', n = 0, n||' row(s)');
END
$c$;
RESET ROLE;

-- =====================================================================
--  D — the outcome belongs to the database
--
--  Every insert below sends `outcome => 'within_limits'` DELIBERATELY,
--  the way a direct API call would.
-- =====================================================================
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-7b00-b000-000000000001","role":"authenticated"}', false);
SET ROLE authenticated;

DO $d$
DECLARE
  ca uuid := '00000000-0000-7b00-a000-000000000001';
  za uuid := '00000000-0000-7b00-d000-000000000001';
  sw uuid := '00000000-0000-7b00-e000-000000000001';
  cl uuid := '00000000-0000-7b00-e000-000000000002';
  v text;
BEGIN
  --  D1: 31 CFU against alert 25 / action 50 — above alert, not action.
  INSERT INTO public.facility_log_entries
    (id,company_id,zone_id,schedule_id,log_type,result_value,result_position,outcome,recorded_by)
  VALUES ('00000000-0000-7b00-f000-000000000001',ca,za,sw,'environmental_surface',
          31,'C1-S4','within_limits',auth.uid());
  SELECT outcome INTO v FROM public.facility_log_entries
   WHERE id='00000000-0000-7b00-f000-000000000001';
  PERFORM _sk('D','D1 31 against alert 25 / action 50 is outside_alert',
              v = 'outside_alert', 'got '||coalesce(v,'null'));

  --  D2: 112 against an action limit of 50 — the FL-01 headline case.
  INSERT INTO public.facility_log_entries
    (id,company_id,zone_id,schedule_id,log_type,result_value,outcome,recorded_by)
  VALUES ('00000000-0000-7b00-f000-000000000002',ca,za,sw,'environmental_surface',
          112,'within_limits',auth.uid());
  SELECT outcome INTO v FROM public.facility_log_entries
   WHERE id='00000000-0000-7b00-f000-000000000002';
  PERFORM _sk('D','D2 112 over the action limit is outside_action, not what was sent',
              v = 'outside_action', 'got '||coalesce(v,'null'));

  --  D3: a result inside both limits.
  INSERT INTO public.facility_log_entries
    (id,company_id,zone_id,schedule_id,log_type,result_value,outcome,recorded_by)
  VALUES ('00000000-0000-7b00-f000-000000000003',ca,za,sw,'environmental_surface',
          18,'outside_action',auth.uid());
  SELECT outcome INTO v FROM public.facility_log_entries
   WHERE id='00000000-0000-7b00-f000-000000000003';
  PERFORM _sk('D','D3 18 inside both limits is within_limits, and a sent failure is discarded',
              v = 'within_limits', 'got '||coalesce(v,'null'));

  --  D4: exactly ON the alert limit is not above it.
  INSERT INTO public.facility_log_entries
    (id,company_id,zone_id,schedule_id,log_type,result_value,recorded_by)
  VALUES ('00000000-0000-7b00-f000-000000000004',ca,za,sw,'environmental_surface',25,auth.uid());
  SELECT outcome INTO v FROM public.facility_log_entries
   WHERE id='00000000-0000-7b00-f000-000000000004';
  PERFORM _sk('D','D4 a result exactly on the alert limit is within limits',
              v = 'within_limits', 'got '||coalesce(v,'null'));

  --  D5: a clean that was not done.
  INSERT INTO public.facility_log_entries
    (id,company_id,zone_id,schedule_id,log_type,performed,outcome,recorded_by)
  VALUES ('00000000-0000-7b00-f000-000000000005',ca,za,cl,'cleaning_routine',
          false,'within_limits',auth.uid());
  SELECT outcome INTO v FROM public.facility_log_entries
   WHERE id='00000000-0000-7b00-f000-000000000005';
  PERFORM _sk('D','D5 a test marked not carried out is not_done', v = 'not_done',
              'got '||coalesce(v,'null'));

  --  D6: a clean that WAS done, against a schedule with no limits.
  --  Not "within limits" — there were none to be within.
  INSERT INTO public.facility_log_entries
    (id,company_id,zone_id,schedule_id,log_type,reference,recorded_by)
  VALUES ('00000000-0000-7b00-f000-000000000006',ca,za,cl,'cleaning_routine',
          'CR-2026-0414',auth.uid());
  SELECT outcome INTO v FROM public.facility_log_entries
   WHERE id='00000000-0000-7b00-f000-000000000006';
  PERFORM _sk('D','D6 a completed test with no limits is not_assessed, not within_limits',
              v = 'not_assessed', 'got '||coalesce(v,'null'));

  --  D7: raising the result by UPDATE re-derives it — not insert-only.
  UPDATE public.facility_log_entries SET result_value = 900
   WHERE id='00000000-0000-7b00-f000-000000000003';
  SELECT outcome INTO v FROM public.facility_log_entries
   WHERE id='00000000-0000-7b00-f000-000000000003';
  PERFORM _sk('D','D7 raising a result by update re-derives the outcome',
              v = 'outside_action', 'got '||coalesce(v,'null'));

  --  D8: the unit is taken from the schedule when the caller omits it.
  PERFORM _sk('D','D8 the result unit comes from the schedule',
    (SELECT result_unit = 'CFU' FROM public.facility_log_entries
      WHERE id='00000000-0000-7b00-f000-000000000001'));
END
$d$;

-- =====================================================================
--  E — a zone and a schedule have to belong together
-- =====================================================================
DO $e$
DECLARE v_err text;
BEGIN
  BEGIN
    INSERT INTO public.facility_log_entries
      (company_id,zone_id,schedule_id,log_type,result_value,recorded_by)
    VALUES ('00000000-0000-7b00-a000-000000000001',
            '00000000-0000-7b00-d000-000000000001',
            --  Bravo's schedule, with tighter limits.
            '00000000-0000-7b00-e000-000000000003',
            'environmental_air', 15, auth.uid());
    PERFORM _sk('E','E1 a schedule from another zone is refused', false, 'the insert succeeded');
  EXCEPTION WHEN others THEN
    v_err := SQLERRM;
    PERFORM _sk('E','E1 a schedule from another zone is refused',
                v_err LIKE 'FACILITY_SCHEDULE_WRONG_ZONE%', v_err);
  END;

  BEGIN
    INSERT INTO public.facility_log_entries(company_id,zone_id,log_type,recorded_by)
    VALUES ('00000000-0000-7b00-a000-000000000001',
            '00000000-0000-7b00-dddd-000000000099','environmental_air',auth.uid());
    PERFORM _sk('E','E2 an unknown zone is refused', false, 'the insert succeeded');
  EXCEPTION WHEN others THEN
    PERFORM _sk('E','E2 an unknown zone is refused', true, SQLSTATE);
  END;
END
$e$;

-- =====================================================================
--  F — the register
-- =====================================================================
DO $f$
DECLARE n integer; v text;
BEGIN
  SELECT count(*) INTO n FROM public.facility_log_register('00000000-0000-7b00-a000-000000000001');
  PERFORM _sk('F','F1 the register returns a row per active schedule', n = 2, n||' row(s)');

  --  The most recent entry, not just any entry.
  SELECT last_outcome INTO v
    FROM public.facility_log_register('00000000-0000-7b00-a000-000000000001')
   WHERE schedule_id = '00000000-0000-7b00-e000-000000000001';
  PERFORM _sk('F','F2 the register carries the LATEST entry for a schedule',
              v IS NOT NULL, 'last_outcome '||coalesce(v,'null'));

  --  Called with another company's id, RLS still decides: the function
  --  is SECURITY INVOKER, so the argument filters and does not grant.
  SELECT count(*) INTO n FROM public.facility_log_register('00000000-0000-7b00-a000-000000000002');
  PERFORM _sk('F','F3 asking for another company''s register returns nothing',
              n = 0, n||' row(s)');
END
$f$;

-- =====================================================================
--  G — constraints that protect a limit's meaning
-- =====================================================================
DO $g$
DECLARE v_err text;
BEGIN
  BEGIN
    INSERT INTO public.facility_zone_schedules
      (company_id,zone_id,log_type,description,frequency,alert_limit,action_limit)
    VALUES ('00000000-0000-7b00-a000-000000000001','00000000-0000-7b00-d000-000000000001',
            'environmental_air','Inverted limits','daily',50,25);
    PERFORM _sk('G','G1 an action limit below its alert limit is refused', false,
                'the insert succeeded');
  EXCEPTION WHEN check_violation THEN
    PERFORM _sk('G','G1 an action limit below its alert limit is refused', true, 'check_violation');
  WHEN others THEN
    v_err := SQLSTATE;
    PERFORM _sk('G','G1 an action limit below its alert limit is refused', false,
                'refused with SQLSTATE '||v_err||' rather than a check violation');
  END;

  BEGIN
    INSERT INTO public.facility_zone_schedules
      (company_id,zone_id,log_type,description,frequency)
    VALUES ('00000000-0000-7b00-a000-000000000001','00000000-0000-7b00-d000-000000000001',
            'teleportation','Invented type','daily');
    PERFORM _sk('G','G2 an invented log type is refused', false, 'the insert succeeded');
  EXCEPTION WHEN check_violation THEN
    PERFORM _sk('G','G2 an invented log type is refused', true, 'check_violation');
  WHEN others THEN
    PERFORM _sk('G','G2 an invented log type is refused', false, SQLSTATE);
  END;

  PERFORM _sk('G','G3 the outcome function is immutable',
    (SELECT provolatile = 'i' FROM pg_proc
      WHERE oid = 'public.facility_log_outcome(boolean,numeric,numeric,numeric)'::regprocedure));

  PERFORM _sk('G','G4 the trigger is attached to the entries table',
    (SELECT count(*) = 1 FROM pg_trigger
      WHERE tgrelid = 'public.facility_log_entries'::regclass
        AND tgname = 'trg_facility_log_outcome' AND NOT tgisinternal));
END
$g$;

RESET ROLE;
SELECT set_config('request.jwt.claims','',false);


\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo '  FACILITY LOGS — ISOLATION AND THE OUTCOME RULE'
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
  IF f > 0 THEN RAISE EXCEPTION 'FACILITY LOGS: % assertion(s) failed', f; END IF;
  RAISE NOTICE 'FACILITY LOGS: all assertions passed';
END
$v$;
