-- =====================================================================
--  FACILITY LOGS, PART 5 — WATER TREATMENT (20261208000000)
--
--  A. Posture
--  B. A RANGE LIMIT, BOTH ENDS
--  C. A qualitative limit
--  D. A maximum, and its boundary
--  E. Awaiting the laboratory
--  F. The outcome is the database's, not the caller's
--  G. Company agreement
--  H. The constraints that keep a limit usable
--  I. The register
--
--  WHY B IS THE POINT OF THIS FILE
--  -------------------------------
--  FL-11 draws a pH limit of "5.0 – 7.0". The environmental function
--  asks only whether a result is ABOVE its limit, so expressing that
--  range as an upper bound of 7.0 reports a pH of 4.0 — far too
--  acidic to release purified water on — as `within_limits`.
--
--  B3 asserts the old function really does say that, so the reason
--  this second derivation exists is recorded as a fact and not as a
--  claim in a comment. If `facility_log_outcome` is ever changed to
--  handle ranges, B3 fails and this whole model should be revisited.
-- =====================================================================
\set ON_ERROR_STOP on
SET client_min_messages = warning;

CREATE TEMP TABLE _s(section text, name text, ok boolean, detail text);
CREATE OR REPLACE FUNCTION _sk(p_section text, p_name text, p_ok boolean, p_detail text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO _s VALUES (p_section,p_name,coalesce(p_ok,false),p_detail); END $$;

GRANT ALL ON _s TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION _sk(text,text,boolean,text) TO anon, authenticated, service_role;


-- ── Fixture: FL-11's own source and its six tests ────────────────────
DO $fx$
DECLARE
  ca uuid := '00000000-0000-7b04-a000-000000000001';
  cb uuid := '00000000-0000-7b04-a000-000000000002';
  ua uuid := '00000000-0000-7b04-b000-000000000001';
  ub uuid := '00000000-0000-7b04-b000-000000000002';
  sa uuid := '00000000-0000-7b04-c000-000000000001';
  sb uuid := '00000000-0000-7b04-c000-000000000002';
  wa uuid := '00000000-0000-7b04-d000-000000000001';
  wb uuid := '00000000-0000-7b04-d000-000000000002';
BEGIN
  DELETE FROM public.facility_water_results WHERE company_id IN (ca,cb);
  DELETE FROM public.facility_water_tests   WHERE company_id IN (ca,cb);
  DELETE FROM public.facility_water_stages  WHERE company_id IN (ca,cb);
  DELETE FROM public.facility_water_sources WHERE company_id IN (ca,cb);
  DELETE FROM public.sites           WHERE company_id IN (ca,cb);
  DELETE FROM public.company_members WHERE company_id IN (ca,cb);
  DELETE FROM public.profiles        WHERE id IN (ua,ub);
  DELETE FROM auth.users             WHERE id IN (ua,ub);
  DELETE FROM public.companies       WHERE id IN (ca,cb);

  INSERT INTO public.companies(id,name) VALUES (ca,'WT Alpha'),(cb,'WT Bravo');
  INSERT INTO auth.users(id,email) VALUES (ua,'wt-a@local.test'),(ub,'wt-b@local.test');
  INSERT INTO public.profiles(id,email,full_name,role,company_id) VALUES
    (ua,'wt-a@local.test','Ada Alpha','admin',ca),
    (ub,'wt-b@local.test','Bo Bravo','admin',cb);
  INSERT INTO public.company_members(company_id,user_id,role,status) VALUES
    (ca,ua,'owner','active'),(cb,ub,'owner','active');
  INSERT INTO public.sites(id,company_id,name) VALUES (sa,ca,'WT plant'),(sb,cb,'WT depot');

  INSERT INTO public.facility_water_sources
    (id,company_id,site_id,name,source_ref,source_detail,purpose,created_by)
  VALUES
    (wa,ca,sa,'WT Purified water loop','BH-1','Borehole BH-1, 60 m',
     'Purified water for production',ua),
    (wb,cb,sb,'WT Bravo water','BH-9','Borehole BH-9','Process water',ub);

  --  The treatment train FL-11 draws, in order.
  INSERT INTO public.facility_water_stages(company_id,source_id,position,name,equipment_ref)
  VALUES
    (ca,wa,0,'Borehole BH-1',NULL),
    (ca,wa,1,'Sand filter',NULL),
    (ca,wa,2,'Carbon filter',NULL),
    (ca,wa,3,'Softener',NULL),
    (ca,wa,4,'Reverse osmosis','RO-1'),
    (ca,wa,5,'UV lamp','UV-1'),
    (ca,wa,6,'Purified water loop',NULL);

  --  FL-11's six rows, with their four shapes of limit.
  INSERT INTO public.facility_water_tests
    (id,company_id,source_id,name,sample_point,frequency,
     limit_kind,limit_min,limit_max,expected_text,result_unit,
     laboratory_kind,laboratory_name)
  VALUES
    ('00000000-0000-7b04-e000-000000000001',ca,wa,'Free chlorine after carbon',
     'After carbon filter','daily','max',NULL,0.00,NULL,'mg/L','in_house','In-house'),
    ('00000000-0000-7b04-e000-000000000002',ca,wa,'Conductivity, RO permeate',
     'RO permeate','daily','max',NULL,1.3,NULL,'µS/cm','in_house','In-house'),
    ('00000000-0000-7b04-e000-000000000003',ca,wa,'pH, loop return',
     'Loop return','daily','range',5.0,7.0,NULL,NULL,'in_house','In-house'),
    ('00000000-0000-7b04-e000-000000000004',ca,wa,'Total viable count, PW-03',
     'PW-03','weekly','max',NULL,100,NULL,'cfu/mL','external','Labcheck Analytical'),
    ('00000000-0000-7b04-e000-000000000005',ca,wa,'Coliforms, PW-03',
     'PW-03','weekly','qualitative',NULL,NULL,'Absent',NULL,'external','Labcheck Analytical'),
    ('00000000-0000-7b04-e000-000000000006',ca,wa,'Full chemical analysis, raw water',
     'Raw water','monthly','max',NULL,9999,NULL,NULL,'external','Labcheck Analytical');

  INSERT INTO public.facility_water_tests
    (id,company_id,source_id,name,frequency,limit_kind,limit_max,laboratory_kind)
  VALUES ('00000000-0000-7b04-e000-000000000009',cb,wb,'Bravo conductivity',
          'daily','max',2.0,'in_house');
END
$fx$;


-- =====================================================================
--  A — posture
-- =====================================================================
DO $a$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['facility_water_sources','facility_water_stages',
                           'facility_water_tests','facility_water_results']
  LOOP
    PERFORM _sk('A','A1 '||t||' has RLS enabled',
      (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.'||t)::regclass), t);
    PERFORM _sk('A','A2 '||t||' has a company_id FK to companies',
      (SELECT count(*) = 1 FROM pg_constraint k
        WHERE k.conrelid = ('public.'||t)::regclass AND k.contype='f'
          AND k.confrelid = 'public.companies'::regclass), t);
  END LOOP;

  --  IMMUTABLE, so the same inputs always give the same verdict. A
  --  volatile judgement on a GMP record would be unreproducible.
  PERFORM _sk('A','A3 facility_water_outcome is IMMUTABLE',
    (SELECT provolatile = 'i' FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='facility_water_outcome'));

  PERFORM _sk('A','A4 the outcome trigger is attached BEFORE insert and update',
    (SELECT count(*) = 1 FROM pg_trigger
      WHERE tgrelid='public.facility_water_results'::regclass
        AND tgname='trg_facility_water_outcome' AND NOT tgisinternal));

  PERFORM _sk('A','A5 the register is SECURITY INVOKER',
    (SELECT NOT prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='facility_water_register'));
END
$a$;


-- =====================================================================
--  B — A RANGE LIMIT, BOTH ENDS
-- =====================================================================
DO $b$
DECLARE v text;
BEGIN
  --  pH range 5.0 – 7.0, straight from FL-11.
  PERFORM _sk('B','B1 a pH below the range is outside limits',
    public.facility_water_outcome('range',5.0,7.0,NULL,4.0,NULL,true) = 'outside_limits',
    public.facility_water_outcome('range',5.0,7.0,NULL,4.0,NULL,true));

  PERFORM _sk('B','B2 a pH above the range is outside limits',
    public.facility_water_outcome('range',5.0,7.0,NULL,9.0,NULL,true) = 'outside_limits',
    public.facility_water_outcome('range',5.0,7.0,NULL,9.0,NULL,true));

  /*
   *  THE REASON THIS MODEL EXISTS, asserted rather than claimed. The
   *  environmental function only asks whether a result is above its
   *  limit, so a range expressed as an upper bound passes a pH of 4.0.
   *
   *  If this assertion ever fails, facility_log_outcome has learned
   *  about ranges and this separate derivation should be reconsidered.
   */
  PERFORM _sk('B','B3 the environmental function would have passed pH 4.0',
    public.facility_log_outcome(true, 4.0, 7.0, 7.0) = 'within_limits',
    'facility_log_outcome said '||public.facility_log_outcome(true, 4.0, 7.0, 7.0));

  PERFORM _sk('B','B4 a pH inside the range is within limits',
    public.facility_water_outcome('range',5.0,7.0,NULL,6.1,NULL,true) = 'within_limits');

  --  Inclusive at both ends: a specification of 5.0 to 7.0 admits
  --  5.0 and 7.0 themselves.
  PERFORM _sk('B','B5 the lower bound itself passes',
    public.facility_water_outcome('range',5.0,7.0,NULL,5.0,NULL,true) = 'within_limits');
  PERFORM _sk('B','B6 the upper bound itself passes',
    public.facility_water_outcome('range',5.0,7.0,NULL,7.0,NULL,true) = 'within_limits');

  --  Through the trigger, not just the function.
  INSERT INTO public.facility_water_results
    (company_id,test_id,sampled_on,result_value)
  VALUES ('00000000-0000-7b04-a000-000000000001',
          '00000000-0000-7b04-e000-000000000003','2026-10-21',4.0);
  SELECT outcome INTO v FROM public.facility_water_results
   WHERE test_id='00000000-0000-7b04-e000-000000000003' AND sampled_on='2026-10-21';
  PERFORM _sk('B','B7 an acidic pH is recorded as outside limits',
              v = 'outside_limits', 'got '||coalesce(v,'null'));
END
$b$;


-- =====================================================================
--  C — a qualitative limit
-- =====================================================================
DO $c$
DECLARE v text;
BEGIN
  PERFORM _sk('C','C1 "Absent" against "Absent" is within limits',
    public.facility_water_outcome('qualitative',NULL,NULL,'Absent',NULL,'Absent',true)
      = 'within_limits');

  PERFORM _sk('C','C2 "Present" against "Absent" is outside limits',
    public.facility_water_outcome('qualitative',NULL,NULL,'Absent',NULL,'Present',true)
      = 'outside_limits');

  --  Case and spacing must not decide a water result.
  PERFORM _sk('C','C3 case and padding do not fail a passing result',
    public.facility_water_outcome('qualitative',NULL,NULL,'Absent',NULL,'  absent ',true)
      = 'within_limits');

  --  No answer is not a pass.
  PERFORM _sk('C','C4 an empty qualitative result is not assessed',
    public.facility_water_outcome('qualitative',NULL,NULL,'Absent',NULL,'  ',true)
      = 'not_assessed');

  --  A number sent to a qualitative test is still unassessed: it
  --  cannot be compared with "Absent".
  PERFORM _sk('C','C5 a numeric result on a qualitative test is not assessed',
    public.facility_water_outcome('qualitative',NULL,NULL,'Absent',42,NULL,true)
      = 'not_assessed');

  INSERT INTO public.facility_water_results
    (company_id,test_id,sampled_on,result_text,report_ref)
  VALUES ('00000000-0000-7b04-a000-000000000001',
          '00000000-0000-7b04-e000-000000000005','2026-10-15','Absent','LA-88412');
  SELECT outcome INTO v FROM public.facility_water_results
   WHERE test_id='00000000-0000-7b04-e000-000000000005';
  PERFORM _sk('C','C6 a coliform absence is recorded as within limits',
              v = 'within_limits', 'got '||coalesce(v,'null'));

  --  "Lab reports attach to the result."
  PERFORM _sk('C','C7 the report reference is kept on the result',
    (SELECT report_ref = 'LA-88412' FROM public.facility_water_results
      WHERE test_id='00000000-0000-7b04-e000-000000000005'));

  --  And the laboratory is inherited from the test when not sent.
  PERFORM _sk('C','C8 the laboratory is inherited from the test',
    (SELECT laboratory_name = 'Labcheck Analytical' FROM public.facility_water_results
      WHERE test_id='00000000-0000-7b04-e000-000000000005'));
END
$c$;


-- =====================================================================
--  D — a maximum, and its boundary
-- =====================================================================
DO $d$
BEGIN
  --  FL-11's free-chlorine row: the limit is 0.00 and the result is
  --  0.00. An exclusive comparison would fail every compliant day.
  PERFORM _sk('D','D1 a result equal to a zero maximum passes',
    public.facility_water_outcome('max',NULL,0.00,NULL,0.00,NULL,true) = 'within_limits');

  PERFORM _sk('D','D2 anything above a zero maximum fails',
    public.facility_water_outcome('max',NULL,0.00,NULL,0.01,NULL,true) = 'outside_limits');

  PERFORM _sk('D','D3 conductivity of 1.1 against 1.3 passes',
    public.facility_water_outcome('max',NULL,1.3,NULL,1.1,NULL,true) = 'within_limits');

  PERFORM _sk('D','D4 the maximum itself passes',
    public.facility_water_outcome('max',NULL,1.3,NULL,1.3,NULL,true) = 'within_limits');

  PERFORM _sk('D','D5 a viable count over 100 fails',
    public.facility_water_outcome('max',NULL,100,NULL,142,NULL,true) = 'outside_limits');

  PERFORM _sk('D','D6 no result is not assessed, not a pass',
    public.facility_water_outcome('max',NULL,100,NULL,NULL,NULL,true) = 'not_assessed');
END
$d$;


-- =====================================================================
--  E — awaiting the laboratory
-- =====================================================================
DO $e$
DECLARE v text;
BEGIN
  --  FL-11's "Not received · due 15 Oct". The sample was taken; the
  --  report has not come back. Judging that as a pass would be the
  --  worst available default, so it is checked FIRST.
  PERFORM _sk('E','E1 an unreceived result awaits the laboratory',
    public.facility_water_outcome('max',NULL,100,NULL,NULL,NULL,false)
      = 'awaiting_laboratory');

  --  Even if a value somehow accompanies it, "not received" wins:
  --  an unreported figure is not a result.
  PERFORM _sk('E','E2 not-received outranks a value that came with it',
    public.facility_water_outcome('max',NULL,100,NULL,5,NULL,false)
      = 'awaiting_laboratory');

  INSERT INTO public.facility_water_results
    (company_id,test_id,sampled_on,due_on,received)
  VALUES ('00000000-0000-7b04-a000-000000000001',
          '00000000-0000-7b04-e000-000000000006','2026-10-01','2026-10-15',false);
  SELECT outcome INTO v FROM public.facility_water_results
   WHERE test_id='00000000-0000-7b04-e000-000000000006';
  PERFORM _sk('E','E3 the monthly analysis is recorded as awaiting',
              v = 'awaiting_laboratory', 'got '||coalesce(v,'null'));

  --  And it is re-derived when the report arrives.
  UPDATE public.facility_water_results
     SET received = true, result_value = 12, report_ref = 'LA-88500'
   WHERE test_id='00000000-0000-7b04-e000-000000000006';
  SELECT outcome INTO v FROM public.facility_water_results
   WHERE test_id='00000000-0000-7b04-e000-000000000006';
  PERFORM _sk('E','E4 the outcome is re-derived when the report arrives',
              v = 'within_limits', 'got '||coalesce(v,'null'));
END
$e$;


--  Everything below runs as company A's admin.
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-7b04-b000-000000000001","role":"authenticated"}', false);
SET ROLE authenticated;

-- =====================================================================
--  F — the outcome is the database's, not the caller's
-- =====================================================================
DO $f$
DECLARE v text;
BEGIN
  --  A caller asserting a pass on a failing conductivity reading.
  INSERT INTO public.facility_water_results
    (company_id,test_id,sampled_on,result_value,outcome,recorded_by)
  VALUES ('00000000-0000-7b04-a000-000000000001',
          '00000000-0000-7b04-e000-000000000002','2026-10-22',9.9,
          'within_limits',auth.uid());
  SELECT outcome INTO v FROM public.facility_water_results
   WHERE test_id='00000000-0000-7b04-e000-000000000002' AND sampled_on='2026-10-22';
  PERFORM _sk('F','F1 a claimed pass on a failing result is discarded',
              v = 'outside_limits', 'got '||coalesce(v,'null'));

  --  And on UPDATE too, or the rule would be insert-only.
  UPDATE public.facility_water_results SET outcome = 'within_limits'
   WHERE test_id='00000000-0000-7b04-e000-000000000002' AND sampled_on='2026-10-22';
  SELECT outcome INTO v FROM public.facility_water_results
   WHERE test_id='00000000-0000-7b04-e000-000000000002' AND sampled_on='2026-10-22';
  PERFORM _sk('F','F2 it cannot be overwritten by a later update',
              v = 'outside_limits', 'got '||coalesce(v,'null'));

  --  Lowering the reading re-derives honestly.
  UPDATE public.facility_water_results SET result_value = 1.0
   WHERE test_id='00000000-0000-7b04-e000-000000000002' AND sampled_on='2026-10-22';
  SELECT outcome INTO v FROM public.facility_water_results
   WHERE test_id='00000000-0000-7b04-e000-000000000002' AND sampled_on='2026-10-22';
  PERFORM _sk('F','F3 a corrected reading re-derives the outcome',
              v = 'within_limits', 'got '||coalesce(v,'null'));
END
$f$;


-- =====================================================================
--  G — company agreement
-- =====================================================================
DO $g$
DECLARE v_err text; n integer;
BEGIN
  --  Own company_id, Bravo's test.
  BEGIN
    INSERT INTO public.facility_water_results
      (company_id,test_id,sampled_on,result_value,recorded_by)
    VALUES ('00000000-0000-7b04-a000-000000000001',
            '00000000-0000-7b04-e000-000000000009','2026-10-22',1.0,auth.uid());
    PERFORM _sk('G','G1 a result cannot be filed against another company''s test',
                false,'the insert succeeded');
  EXCEPTION WHEN others THEN
    v_err := SQLERRM;
    PERFORM _sk('G','G1 a result cannot be filed against another company''s test',
      v_err LIKE 'WATER_TEST_NOT_FOUND%' OR v_err LIKE 'WATER_TEST_WRONG_COMPANY%', v_err);
  END;

  --  Own company_id, Bravo's source, on a test.
  BEGIN
    INSERT INTO public.facility_water_tests
      (company_id,source_id,name,frequency,limit_kind,limit_max)
    VALUES ('00000000-0000-7b04-a000-000000000001',
            '00000000-0000-7b04-d000-000000000002','Smuggled test','daily','max',1);
    PERFORM _sk('G','G2 a test cannot hang off another company''s source',
                false,'the insert succeeded');
  EXCEPTION WHEN others THEN
    v_err := SQLERRM;
    PERFORM _sk('G','G2 a test cannot hang off another company''s source',
      v_err LIKE 'WATER_SOURCE_NOT_FOUND%' OR v_err LIKE 'WATER_SOURCE_WRONG_COMPANY%', v_err);
  END;

  SELECT count(*) INTO n FROM public.facility_water_tests
   WHERE company_id = '00000000-0000-7b04-a000-000000000002';
  PERFORM _sk('G','G3 sees none of the other company''s tests', n = 0, n||' row(s)');

  --  The silent-filter case, on ROW_COUNT.
  UPDATE public.facility_water_tests SET limit_max = 999
   WHERE id = '00000000-0000-7b04-e000-000000000009';
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM _sk('G','G4 updating another company''s test changes no row', n = 0, n||' row(s)');
END
$g$;


-- =====================================================================
--  H — the constraints that keep a limit usable
-- =====================================================================
DO $h$
BEGIN
  --  A range needs both ends, or everything reads as unassessable.
  BEGIN
    INSERT INTO public.facility_water_tests
      (company_id,source_id,name,frequency,limit_kind,limit_max)
    VALUES ('00000000-0000-7b04-a000-000000000001',
            '00000000-0000-7b04-d000-000000000001','Half a range','daily','range',7.0);
    PERFORM _sk('H','H1 a range with no lower bound is refused', false,'the insert succeeded');
  EXCEPTION WHEN check_violation THEN
    PERFORM _sk('H','H1 a range with no lower bound is refused', true, SQLSTATE);
  END;

  --  An inverted range would fail every result.
  BEGIN
    INSERT INTO public.facility_water_tests
      (company_id,source_id,name,frequency,limit_kind,limit_min,limit_max)
    VALUES ('00000000-0000-7b04-a000-000000000001',
            '00000000-0000-7b04-d000-000000000001','Inverted','daily','range',7.0,5.0);
    PERFORM _sk('H','H2 an inverted range is refused', false,'the insert succeeded');
  EXCEPTION WHEN check_violation THEN
    PERFORM _sk('H','H2 an inverted range is refused', true, SQLSTATE);
  END;

  --  A qualitative test with nothing to compare against.
  BEGIN
    INSERT INTO public.facility_water_tests
      (company_id,source_id,name,frequency,limit_kind)
    VALUES ('00000000-0000-7b04-a000-000000000001',
            '00000000-0000-7b04-d000-000000000001','No expectation','weekly','qualitative');
    PERFORM _sk('H','H3 a qualitative test with no expected text is refused',
                false,'the insert succeeded');
  EXCEPTION WHEN check_violation THEN
    PERFORM _sk('H','H3 a qualitative test with no expected text is refused', true, SQLSTATE);
  END;

  --  A maximum with no maximum.
  BEGIN
    INSERT INTO public.facility_water_tests
      (company_id,source_id,name,frequency,limit_kind)
    VALUES ('00000000-0000-7b04-a000-000000000001',
            '00000000-0000-7b04-d000-000000000001','No ceiling','daily','max');
    PERFORM _sk('H','H4 a max with no limit_max is refused', false,'the insert succeeded');
  EXCEPTION WHEN check_violation THEN
    PERFORM _sk('H','H4 a max with no limit_max is refused', true, SQLSTATE);
  END;

  --  An unknown kind would have no defined way to judge a result.
  BEGIN
    INSERT INTO public.facility_water_tests
      (company_id,source_id,name,frequency,limit_kind,limit_max)
    VALUES ('00000000-0000-7b04-a000-000000000001',
            '00000000-0000-7b04-d000-000000000001','Invented kind','daily','vibes',1);
    PERFORM _sk('H','H5 an unknown limit kind is refused', false,'the insert succeeded');
  EXCEPTION WHEN check_violation THEN
    PERFORM _sk('H','H5 an unknown limit kind is refused', true, SQLSTATE);
  END;

  --  The treatment train is ordered, and a position cannot repeat.
  BEGIN
    INSERT INTO public.facility_water_stages(company_id,source_id,position,name)
    VALUES ('00000000-0000-7b04-a000-000000000001',
            '00000000-0000-7b04-d000-000000000001',2,'A second carbon filter');
    PERFORM _sk('H','H6 two stages cannot share a position', false,'the insert succeeded');
  EXCEPTION WHEN unique_violation THEN
    PERFORM _sk('H','H6 two stages cannot share a position', true, SQLSTATE);
  END;
END
$h$;


-- =====================================================================
--  I — the register
-- =====================================================================
DO $i$
DECLARE r record; n integer;
BEGIN
  SELECT count(*) INTO n FROM public.facility_water_register(
    '00000000-0000-7b04-a000-000000000001');
  PERFORM _sk('I','I1 lists the active tests of this company', n = 6, n||' row(s)');

  SELECT * INTO r FROM public.facility_water_register(
    '00000000-0000-7b04-a000-000000000001')
   WHERE test_name = 'pH, loop return';
  PERFORM _sk('I','I2 carries the range so the screen can print it',
              r.limit_kind = 'range' AND r.limit_min = 5.0 AND r.limit_max = 7.0);
  PERFORM _sk('I','I3 shows the latest result and its outcome',
              r.last_value = 4.0 AND r.last_outcome = 'outside_limits',
              coalesce(r.last_outcome,'null'));

  SELECT * INTO r FROM public.facility_water_register(
    '00000000-0000-7b04-a000-000000000001')
   WHERE test_name = 'Coliforms, PW-03';
  PERFORM _sk('I','I4 carries a qualitative expectation and its text result',
              r.expected_text = 'Absent' AND r.last_text = 'Absent');

  --  A test with no result at all must still appear, or a never-run
  --  test would vanish from the register rather than read as due.
  SELECT * INTO r FROM public.facility_water_register(
    '00000000-0000-7b04-a000-000000000001')
   WHERE test_name = 'Free chlorine after carbon';
  PERFORM _sk('I','I5 a test with no result still appears',
              r.test_id IS NOT NULL AND r.last_result_id IS NULL);

  PERFORM _sk('I','I6 names the source each test belongs to',
              r.source_name = 'WT Purified water loop' AND r.source_ref = 'BH-1');

  SELECT count(*) INTO n FROM public.facility_water_register(
    '00000000-0000-7b04-a000-000000000002');
  PERFORM _sk('I','I7 returns nothing for another company', n = 0, n||' row(s)');

  --  Retiring a test takes it off the register without deleting its
  --  results.
  UPDATE public.facility_water_tests SET is_active = false
   WHERE id = '00000000-0000-7b04-e000-000000000001';
  SELECT count(*) INTO n FROM public.facility_water_register(
    '00000000-0000-7b04-a000-000000000001');
  PERFORM _sk('I','I8 a retired test leaves the register', n = 5, n||' row(s)');
END
$i$;

RESET ROLE;
SELECT set_config('request.jwt.claims','',false);


\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo '  FACILITY LOGS, PART 5 — WATER TREATMENT'
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
  IF f > 0 THEN RAISE EXCEPTION 'WATER TREATMENT: % assertion(s) failed', f; END IF;
  RAISE NOTICE 'WATER TREATMENT: all assertions passed';
END
$v$;
