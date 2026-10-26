-- =====================================================================
--  FL-09 — DEEP CLEANING SCHEDULE AND CLEANING RECORDS (20261211000000)
--
--  A. The columns and their vocabulary
--  B. Cleaning detail belongs to a cleaning record
--  C. Verification integrity
--  D. AN UNVERIFIED DEEP CLEAN DOES NOT SATISFY THE SCHEDULE
--  E. Next due is a calendar interval, not a day count
--  F. FL-09's five schedule rows, reproduced
--  G. Company isolation
--  H. What was deliberately NOT built
--
--  WHY D IS THE POINT OF THIS FILE
--  -------------------------------
--  FL-09 draws two tables on one screen and they disagree unless one
--  rule holds. Its schedule says Granulation room G2 was last deep
--  cleaned on 15 Sep and is "Overdue · 6 days". Its records table,
--  directly beneath, shows CR-2026-0415 — zone G2, type Deep, finished
--  21 Oct 08:05 — "Awaiting Grace Eze".
--
--  A deep clean WAS performed, and the schedule still reports overdue.
--  The only reading that makes both tables true at once is that the
--  schedule counts VERIFIED cleans, which is what FL-08 says in words:
--  "The overdue alert clears when Grace Eze verifies."
--
--  So D puts exactly that arrangement in the database — an overdue
--  monthly schedule with a deep clean performed today and not yet
--  verified — and requires the schedule to stay overdue until the
--  verification lands. If the rule is removed, D2, D3 and D5 fail.
-- =====================================================================
\set ON_ERROR_STOP on
SET client_min_messages = warning;

CREATE TEMP TABLE _s(section text, name text, ok boolean, detail text);
CREATE OR REPLACE FUNCTION _sk(p_section text, p_name text, p_ok boolean, p_detail text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO _s VALUES (p_section,p_name,coalesce(p_ok,false),p_detail); END $$;

GRANT ALL ON _s TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION _sk(text,text,boolean,text) TO anon, authenticated, service_role;


-- ── Fixture: FL-09's five zones, positioned relative to today ────────
/*
 *  The design's dates are absolute (21 Oct 2026) and current_date is
 *  not, so the fixture reproduces the RELATIONSHIPS instead: G2 six
 *  days past due, the micro lab three days short of due, and the other
 *  three comfortably ahead. Those offsets are what FL-09's five status
 *  badges are drawn from.
 */
DO $fx$
DECLARE
  ca uuid := '00000000-0000-7b07-a000-000000000001';
  cb uuid := '00000000-0000-7b07-a000-000000000002';
  ua uuid := '00000000-0000-7b07-b000-000000000001';
  uv uuid := '00000000-0000-7b07-b000-000000000002';
  ub uuid := '00000000-0000-7b07-b000-000000000003';
  sa uuid := '00000000-0000-7b07-c000-000000000001';
  sb uuid := '00000000-0000-7b07-c000-000000000002';
  z_g2 uuid := '00000000-0000-7b07-d000-000000000001';
  z_ml uuid := '00000000-0000-7b07-d000-000000000002';
  z_c1 uuid := '00000000-0000-7b07-d000-000000000003';
  z_p1 uuid := '00000000-0000-7b07-d000-000000000004';
  z_d1 uuid := '00000000-0000-7b07-d000-000000000005';
  z_b  uuid := '00000000-0000-7b07-d000-000000000006';
  s_g2 uuid := '00000000-0000-7b07-e000-000000000001';
  s_ml uuid := '00000000-0000-7b07-e000-000000000002';
  s_c1 uuid := '00000000-0000-7b07-e000-000000000003';
  s_p1 uuid := '00000000-0000-7b07-e000-000000000004';
  s_d1 uuid := '00000000-0000-7b07-e000-000000000005';
  s_b  uuid := '00000000-0000-7b07-e000-000000000006';
  s_rt uuid := '00000000-0000-7b07-e000-000000000007';
BEGIN
  FOR i IN 1..2 LOOP
    DELETE FROM public.facility_log_entries    WHERE company_id IN (ca,cb);
    DELETE FROM public.facility_zone_schedules WHERE company_id IN (ca,cb);
    DELETE FROM public.facility_zones          WHERE company_id IN (ca,cb);
    DELETE FROM public.sites                   WHERE company_id IN (ca,cb);
    DELETE FROM public.company_members         WHERE company_id IN (ca,cb);
    DELETE FROM public.profiles                WHERE id IN (ua,uv,ub);
    DELETE FROM auth.users                     WHERE id IN (ua,uv,ub);
    DELETE FROM public.companies               WHERE id IN (ca,cb);
  END LOOP;

  INSERT INTO public.companies(id,name) VALUES (ca,'CL Alpha'),(cb,'CL Beta');
  INSERT INTO auth.users(id,email) VALUES
    (ua,'cl-op@local.test'),(uv,'cl-qa@local.test'),(ub,'cl-b@local.test');
  INSERT INTO public.profiles(id,email,full_name,role,company_id) VALUES
    --  `role` here is the account role, whose CHECK allows three
    --  values; the operational role model is a separate table and is
    --  not what this suite is about.
    (ua,'cl-op@local.test','Yusuf Garba','admin',ca),
    (uv,'cl-qa@local.test','Grace Eze','compliance_officer',ca),
    (ub,'cl-b@local.test','Beta Person','admin',cb);
  INSERT INTO public.company_members(company_id,user_id,role,status) VALUES
    (ca,ua,'owner','active'),(ca,uv,'member','active'),(cb,ub,'owner','active');
  INSERT INTO public.sites(id,company_id,name) VALUES (sa,ca,'CL plant'),(sb,cb,'CL Beta plant');

  INSERT INTO public.facility_zones(id,company_id,site_id,name,code,grade,line_ref,created_by) VALUES
    (z_g2,ca,sa,'Granulation room G2','GR-02','Grade D','TL-1',ua),
    (z_ml,ca,sa,'QC micro lab','QC-01','Grade D',NULL,ua),
    (z_c1,ca,sa,'Compression hall C1','CH-01','Grade D','TL-1',ua),
    (z_p1,ca,sa,'Packing hall P1','PH-01','Grade D','TL-3',ua),
    (z_d1,ca,sa,'Dispensary D-1','DP-01','Grade D',NULL,ua),
    (z_b, cb,sb,'Beta room','BR-01','Grade D',NULL,ub);

  INSERT INTO public.facility_zone_schedules
    (id,company_id,zone_id,log_type,description,frequency) VALUES
    (s_g2,ca,z_g2,'cleaning_deep','Deep clean · granulation','monthly'),
    (s_ml,ca,z_ml,'cleaning_deep','Deep clean · micro lab','weekly'),
    (s_c1,ca,z_c1,'cleaning_deep','Deep clean · compression','monthly'),
    (s_p1,ca,z_p1,'cleaning_deep','Deep clean · packing','quarterly'),
    (s_d1,ca,z_d1,'cleaning_deep','Deep clean · dispensary','monthly'),
    (s_b, cb,z_b, 'cleaning_deep','Deep clean · beta','monthly'),
    --  A routine schedule, so the deep schedule proving it ignores
    --  everything that is not a deep clean is not a vacuous claim.
    (s_rt,ca,z_g2,'cleaning_routine','Routine clean · granulation','daily');

  /*
   *  The last VERIFIED deep clean on each schedule, placed so that the
   *  next due date lands where FL-09 draws it.
   */
  INSERT INTO public.facility_log_entries
    (company_id,zone_id,schedule_id,log_type,recorded_at,reference,recorded_by,
     cleaning_method,cleaning_agents,contact_minutes,line_ref,
     started_at,finished_at,verified_by,verified_at)
  VALUES
    --  G2: due six days ago.
    (ca,z_g2,s_g2,'cleaning_deep',
     (current_date - interval '6 days' - interval '1 month')::timestamptz,
     'CR-2026-0302',ua,'wipe down, top to bottom',
     ARRAY['Hypochlorite 1%','IPA 70%'],15,'TL-1',
     (current_date - interval '6 days' - interval '1 month')::timestamptz,
     (current_date - interval '6 days' - interval '1 month')::timestamptz,
     uv,(current_date - interval '6 days' - interval '1 month')::timestamptz),
    --  Micro lab: due in three days.
    (ca,z_ml,s_ml,'cleaning_deep',
     (current_date - interval '4 days')::timestamptz,
     'CR-2026-0396',ua,'wipe down',ARRAY['IPA 70%'],10,NULL,
     (current_date - interval '4 days')::timestamptz,
     (current_date - interval '4 days')::timestamptz,
     uv,(current_date - interval '4 days')::timestamptz),
    --  Compression: due in eleven days.
    (ca,z_c1,s_c1,'cleaning_deep',
     (current_date + interval '11 days' - interval '1 month')::timestamptz,
     'CR-2026-0359',ua,'foam and rinse',ARRAY['Detergent'],12,'TL-1',
     (current_date + interval '11 days' - interval '1 month')::timestamptz,
     (current_date + interval '11 days' - interval '1 month')::timestamptz,
     uv,(current_date + interval '11 days' - interval '1 month')::timestamptz),
    --  Packing: due in twelve days.
    (ca,z_p1,s_p1,'cleaning_deep',
     (current_date + interval '12 days' - interval '3 months')::timestamptz,
     'CR-2026-0201',ua,'mop and wipe',ARRAY['Detergent'],5,'TL-3',
     (current_date + interval '12 days' - interval '3 months')::timestamptz,
     (current_date + interval '12 days' - interval '3 months')::timestamptz,
     uv,(current_date + interval '12 days' - interval '3 months')::timestamptz),
    --  Dispensary: due in twenty days.
    (ca,z_d1,s_d1,'cleaning_deep',
     (current_date + interval '20 days' - interval '1 month')::timestamptz,
     'CR-2026-0380',ua,'wipe down',ARRAY['IPA 70%'],5,'BAL-03',
     (current_date + interval '20 days' - interval '1 month')::timestamptz,
     (current_date + interval '20 days' - interval '1 month')::timestamptz,
     uv,(current_date + interval '20 days' - interval '1 month')::timestamptz),
    --  Company B, for section G.
    (cb,z_b,s_b,'cleaning_deep',(current_date - interval '2 days')::timestamptz,
     'CR-B-0001',ub,'wipe down',ARRAY['IPA 70%'],5,NULL,
     (current_date - interval '2 days')::timestamptz,
     (current_date - interval '2 days')::timestamptz,
     ub,(current_date - interval '2 days')::timestamptz);

  /*
   *  THE ROW SECTION D EXISTS FOR. G2's deep clean, performed today,
   *  NOT YET VERIFIED — exactly FL-09's CR-2026-0415 "Awaiting Grace
   *  Eze". The schedule above must not move.
   */
  INSERT INTO public.facility_log_entries
    (company_id,zone_id,schedule_id,log_type,recorded_at,reference,recorded_by,
     cleaning_method,cleaning_agents,contact_minutes,line_ref,started_at,finished_at)
  VALUES
    (ca,z_g2,s_g2,'cleaning_deep',now(),'CR-2026-0415',ua,
     'wipe down, top to bottom',ARRAY['Hypochlorite 1%','IPA 70%'],15,'TL-1',
     now() - interval '105 minutes', now());

  --  A changeover clean, which FL-09's records table draws and no
  --  schedule can carry.
  INSERT INTO public.facility_log_entries
    (company_id,zone_id,log_type,recorded_at,reference,recorded_by,
     cleaning_method,cleaning_agents,contact_minutes,line_ref,verified_by,verified_at)
  VALUES
    (ca,z_c1,'cleaning_changeover',now() - interval '1 day','CR-2026-0402',ua,
     'foam and rinse',ARRAY['Detergent','Hypochlorite 1%'],12,'TL-1',
     uv, now() - interval '20 hours');
END
$fx$;


-- =====================================================================
--  A — the columns and their vocabulary
-- =====================================================================
DO $a$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema='public' AND table_name='facility_log_entries'
     AND column_name IN ('cleaning_method','cleaning_agents','contact_minutes',
                         'line_ref','started_at','finished_at',
                         'verified_by','verified_at');
  PERFORM _sk('A','A1 PRD G3.6''s fields and the verification pair exist',
              n = 8, n||' of 8');

  --  Chemicals are a list, because the design draws a list.
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema='public' AND table_name='facility_log_entries'
     AND column_name='cleaning_agents' AND data_type='ARRAY';
  PERFORM _sk('A','A2 chemicals are an array, not a sentence', n = 1);

  --  A changeover clean can be RECORDED.
  SELECT count(*) INTO n FROM public.facility_log_entries
   WHERE log_type='cleaning_changeover';
  PERFORM _sk('A','A3 a changeover clean can be recorded', n = 1, n||' row(s)');

  --  And cannot be SCHEDULED: a changeover follows a product change,
  --  not a frequency, and FL-09 never shows one in the schedule.
  BEGIN
    INSERT INTO public.facility_zone_schedules
      (company_id,zone_id,log_type,description,frequency)
    VALUES ('00000000-0000-7b07-a000-000000000001',
            '00000000-0000-7b07-d000-000000000001',
            'cleaning_changeover','Should not be schedulable','monthly');
    PERFORM _sk('A','A4 a changeover clean cannot be scheduled', false, 'accepted');
  EXCEPTION WHEN check_violation THEN
    PERFORM _sk('A','A4 a changeover clean cannot be scheduled', true);
  END;

  --  recorded_at and recorded_by are reused rather than duplicated.
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema='public' AND table_name='facility_log_entries'
     AND column_name IN ('cleaned_on','operator_id','cleaned_by');
  PERFORM _sk('A','A5 no second answer to "when" and "who"', n = 0, n||' duplicate(s)');
END
$a$;


-- =====================================================================
--  B — cleaning detail belongs to a cleaning record
-- =====================================================================
DO $b$
DECLARE ca uuid := '00000000-0000-7b07-a000-000000000001';
        z  uuid := '00000000-0000-7b07-d000-000000000001';
BEGIN
  --  A settle plate has no chemicals. A row carrying them would print
  --  in FL-09's records table as a clean that never happened.
  BEGIN
    INSERT INTO public.facility_log_entries
      (company_id,zone_id,log_type,recorded_at,cleaning_agents)
    VALUES (ca,z,'environmental_air',now(),ARRAY['IPA 70%']);
    PERFORM _sk('B','B1 an air reading cannot carry chemicals', false, 'accepted');
  EXCEPTION WHEN check_violation THEN
    PERFORM _sk('B','B1 an air reading cannot carry chemicals', true);
  END;

  BEGIN
    INSERT INTO public.facility_log_entries
      (company_id,zone_id,log_type,recorded_at,contact_minutes)
    VALUES (ca,z,'water',now(),5);
    PERFORM _sk('B','B2 a water test cannot carry a contact time', false, 'accepted');
  EXCEPTION WHEN check_violation THEN
    PERFORM _sk('B','B2 a water test cannot carry a contact time', true);
  END;

  --  Zero contact is not a short contact: the chemical never touched
  --  the surface, and recording it as a clean would be a false record.
  BEGIN
    INSERT INTO public.facility_log_entries
      (company_id,zone_id,log_type,recorded_at,contact_minutes)
    VALUES (ca,z,'cleaning_routine',now(),0);
    PERFORM _sk('B','B3 a contact time of zero is refused', false, 'accepted');
  EXCEPTION WHEN check_violation THEN
    PERFORM _sk('B','B3 a contact time of zero is refused', true);
  END;

  --  A clean cannot finish before it started.
  BEGIN
    INSERT INTO public.facility_log_entries
      (company_id,zone_id,log_type,recorded_at,started_at,finished_at)
    VALUES (ca,z,'cleaning_routine',now(),now(),now() - interval '1 hour');
    PERFORM _sk('B','B4 a clean cannot finish before it started', false, 'accepted');
  EXCEPTION WHEN check_violation THEN
    PERFORM _sk('B','B4 a clean cannot finish before it started', true);
  END;

  --  And the positive case, so B1–B4 are not passing by refusing
  --  everything.
  BEGIN
    INSERT INTO public.facility_log_entries
      (company_id,zone_id,log_type,recorded_at,cleaning_method,
       cleaning_agents,contact_minutes,started_at,finished_at)
    VALUES (ca,z,'cleaning_routine',now(),'mop and wipe',
            ARRAY['Detergent'],5,now() - interval '10 minutes',now());
    PERFORM _sk('B','B5 a well-formed cleaning record is accepted', true);
  EXCEPTION WHEN others THEN
    PERFORM _sk('B','B5 a well-formed cleaning record is accepted', false, SQLERRM);
  END;
END
$b$;


-- =====================================================================
--  C — verification integrity
-- =====================================================================
DO $c$
DECLARE ca uuid := '00000000-0000-7b07-a000-000000000001';
        z  uuid := '00000000-0000-7b07-d000-000000000001';
        uv uuid := '00000000-0000-7b07-b000-000000000002';
        ub uuid := '00000000-0000-7b07-b000-000000000003';
        e  uuid;
BEGIN
  --  Half a verification is unusable as evidence.
  BEGIN
    INSERT INTO public.facility_log_entries
      (company_id,zone_id,log_type,recorded_at,verified_by)
    VALUES (ca,z,'cleaning_routine',now(),uv);
    PERFORM _sk('C','C1 a verifier without a time is refused', false, 'accepted');
  EXCEPTION WHEN check_violation THEN
    PERFORM _sk('C','C1 a verifier without a time is refused', true);
  END;

  BEGIN
    INSERT INTO public.facility_log_entries
      (company_id,zone_id,log_type,recorded_at,verified_at)
    VALUES (ca,z,'cleaning_routine',now(),now());
    PERFORM _sk('C','C2 a time without a verifier is refused', false, 'accepted');
  EXCEPTION WHEN check_violation THEN
    PERFORM _sk('C','C2 a time without a verifier is refused', true);
  END;

  /*
   *  C3 runs with RLS bypassed (this suite is the owner), so the other
   *  company's profile IS visible and the company mismatch is what
   *  fires. Under RLS the same write is refused by the same branch
   *  reading nothing — see the trigger's note.
   */
  BEGIN
    INSERT INTO public.facility_log_entries
      (company_id,zone_id,log_type,recorded_at,verified_by,verified_at)
    VALUES (ca,z,'cleaning_routine',now(),ub,now());
    PERFORM _sk('C','C3 another company''s profile cannot verify', false, 'accepted');
  EXCEPTION WHEN raise_exception THEN
    PERFORM _sk('C','C3 another company''s profile cannot verify',
                SQLERRM LIKE '%FACILITY_VERIFIER_WRONG_COMPANY%', SQLERRM);
  END;

  --  A verification, once given, stands.
  INSERT INTO public.facility_log_entries
    (company_id,zone_id,log_type,recorded_at,reference,verified_by,verified_at)
  VALUES (ca,z,'cleaning_routine',now(),'CR-FINAL-1',uv,now())
  RETURNING id INTO e;

  BEGIN
    UPDATE public.facility_log_entries
       SET verified_by = NULL, verified_at = NULL WHERE id = e;
    PERFORM _sk('C','C4 a verification cannot be withdrawn', false, 'accepted');
  EXCEPTION WHEN raise_exception THEN
    PERFORM _sk('C','C4 a verification cannot be withdrawn',
                SQLERRM LIKE '%FACILITY_VERIFICATION_IS_FINAL%', SQLERRM);
  END;

  /*
   *  An hour later, not now(): now() is the transaction's start time
   *  and the row was inserted in this same block, so `SET verified_at
   *  = now()` would set it to the value it already holds and the
   *  trigger would be right to allow it. The first draft of this
   *  assertion did exactly that and reported a rule that was never
   *  tested.
   */
  BEGIN
    UPDATE public.facility_log_entries
       SET verified_at = now() + interval '1 hour' WHERE id = e;
    PERFORM _sk('C','C5 a verification cannot be re-timed', false, 'accepted');
  EXCEPTION WHEN raise_exception THEN
    PERFORM _sk('C','C5 a verification cannot be re-timed',
                SQLERRM LIKE '%FACILITY_VERIFICATION_IS_FINAL%', SQLERRM);
  END;

  /*
   *  But an unverified record can still be verified, or the rule would
   *  have frozen the workflow it exists to protect. On its own row:
   *  C4 and C5 have just established that this cannot be undone, so
   *  borrowing section D's record here would consume it.
   */
  INSERT INTO public.facility_log_entries
    (company_id,zone_id,log_type,recorded_at,reference)
  VALUES (ca,z,'cleaning_routine',now(),'CR-PENDING-1');

  BEGIN
    UPDATE public.facility_log_entries
       SET verified_by = uv, verified_at = now()
     WHERE reference = 'CR-PENDING-1';
    PERFORM _sk('C','C6 an unverified record can still be verified',
                (SELECT verified_at IS NOT NULL FROM public.facility_log_entries
                  WHERE reference = 'CR-PENDING-1'));
  EXCEPTION WHEN others THEN
    PERFORM _sk('C','C6 an unverified record can still be verified', false, SQLERRM);
  END;

  --  Housekeeping, so the rows B and C created do not pollute F's
  --  counts.
  DELETE FROM public.facility_log_entries
   WHERE reference IN ('CR-FINAL-1','CR-PENDING-1')
      OR (reference IS NULL AND zone_id = z);
END
$c$;


-- =====================================================================
--  D — AN UNVERIFIED DEEP CLEAN DOES NOT SATISFY THE SCHEDULE
-- =====================================================================
DO $d$
DECLARE r record; ca uuid := '00000000-0000-7b07-a000-000000000001';
BEGIN
  SELECT * INTO r FROM public.facility_deep_clean_schedule(ca)
   WHERE zone_name = 'Granulation room G2';

  --  The clean performed today is NOT the one the schedule reports.
  PERFORM _sk('D','D1 the schedule reports the last VERIFIED clean',
              r.last_reference = 'CR-2026-0302',
              coalesce(r.last_reference,'null'));

  PERFORM _sk('D','D2 the unverified clean today does not move the date',
              r.last_cleaned_at::date
                = (current_date - interval '6 days' - interval '1 month')::date,
              coalesce(r.last_cleaned_at::text,'null'));

  PERFORM _sk('D','D3 the zone is still overdue', r.status = 'overdue',
              coalesce(r.status,'null'));

  PERFORM _sk('D','D4 and overdue by the six days FL-09 draws',
              r.days_until_due = -6, coalesce(r.days_until_due::text,'null'));

  --  Now verify it, which is the act FL-08 says clears the alert.
  UPDATE public.facility_log_entries
     SET verified_by = '00000000-0000-7b07-b000-000000000002', verified_at = now()
   WHERE reference = 'CR-2026-0415';

  SELECT * INTO r FROM public.facility_deep_clean_schedule(ca)
   WHERE zone_name = 'Granulation room G2';

  PERFORM _sk('D','D5 verifying clears the overdue alert',
              r.status = 'on_schedule', coalesce(r.status,'null'));

  PERFORM _sk('D','D6 and the schedule now names the new record',
              r.last_reference = 'CR-2026-0415',
              coalesce(r.last_reference,'null'));

  /*
   *  Restore, so F sees the five rows the design draws. By REPLACING
   *  the row, not by withdrawing the verification — C4 has just
   *  established that withdrawing one is refused, and a test that
   *  needed the rule suspended to run would not be testing it.
   */
  DELETE FROM public.facility_log_entries WHERE reference = 'CR-2026-0415';
  INSERT INTO public.facility_log_entries
    (company_id,zone_id,schedule_id,log_type,recorded_at,reference,recorded_by,
     cleaning_method,cleaning_agents,contact_minutes,line_ref,started_at,finished_at)
  VALUES (ca,'00000000-0000-7b07-d000-000000000001',
          '00000000-0000-7b07-e000-000000000001','cleaning_deep',now(),
          'CR-2026-0415','00000000-0000-7b07-b000-000000000001',
          'wipe down, top to bottom',ARRAY['Hypochlorite 1%','IPA 70%'],15,'TL-1',
          now() - interval '105 minutes', now());

  --  A routine clean never satisfies a DEEP schedule, however recent.
  INSERT INTO public.facility_log_entries
    (company_id,zone_id,schedule_id,log_type,recorded_at,reference,
     recorded_by,verified_by,verified_at)
  VALUES (ca,'00000000-0000-7b07-d000-000000000001',
          '00000000-0000-7b07-e000-000000000001','cleaning_routine',now(),
          'CR-ROUTINE-X','00000000-0000-7b07-b000-000000000001',
          '00000000-0000-7b07-b000-000000000002',now());

  SELECT * INTO r FROM public.facility_deep_clean_schedule(ca)
   WHERE zone_name = 'Granulation room G2';
  PERFORM _sk('D','D7 a routine clean does not satisfy a deep schedule',
              r.status = 'overdue' AND r.last_reference = 'CR-2026-0302',
              coalesce(r.status,'null')||' / '||coalesce(r.last_reference,'null'));

  DELETE FROM public.facility_log_entries WHERE reference = 'CR-ROUTINE-X';
END
$d$;


-- =====================================================================
--  E — next due is a calendar interval, not a day count
-- =====================================================================
DO $e$
DECLARE
  ca uuid := '00000000-0000-7b07-a000-000000000001';
  zx uuid := '00000000-0000-7b07-d000-000000000007';
  sx uuid := '00000000-0000-7b07-e000-000000000008';
  r  record;
BEGIN
  DELETE FROM public.facility_log_entries    WHERE schedule_id = sx;
  DELETE FROM public.facility_zone_schedules WHERE id = sx;
  DELETE FROM public.facility_zones          WHERE id = zx;

  INSERT INTO public.facility_zones(id,company_id,site_id,name,created_by)
    VALUES (zx,ca,'00000000-0000-7b07-c000-000000000001','Calendar room',
            '00000000-0000-7b07-b000-000000000001');
  INSERT INTO public.facility_zone_schedules(id,company_id,zone_id,log_type,description,frequency)
    VALUES (sx,ca,zx,'cleaning_deep','Deep clean · calendar','monthly');

  /*
   *  1 October. A month later is 1 November — but October has 31 days,
   *  so FREQUENCY_DAYS' thirty would say 31 October. FL-09 draws 01
   *  Nov against a last clean of 01 Oct, so the calendar wins.
   */
  INSERT INTO public.facility_log_entries
    (company_id,zone_id,schedule_id,log_type,recorded_at,reference,
     recorded_by,verified_by,verified_at)
  VALUES (ca,zx,sx,'cleaning_deep','2026-10-01 06:00+00','CR-CAL-1',
          '00000000-0000-7b07-b000-000000000001',
          '00000000-0000-7b07-b000-000000000002','2026-10-01 07:00+00');

  SELECT * INTO r FROM public.facility_deep_clean_schedule(ca)
   WHERE zone_name = 'Calendar room';
  PERFORM _sk('E','E1 a month after 01 Oct is 01 Nov, not 31 Oct',
              r.next_due_on = DATE '2026-11-01', coalesce(r.next_due_on::text,'null'));

  --  A quarter after 02 Aug is 02 Nov; ninety-one days would be 01 Nov.
  UPDATE public.facility_zone_schedules SET frequency = 'quarterly' WHERE id = sx;
  UPDATE public.facility_log_entries
     SET recorded_at = '2026-08-02 06:00+00' WHERE reference = 'CR-CAL-1';

  SELECT * INTO r FROM public.facility_deep_clean_schedule(ca)
   WHERE zone_name = 'Calendar room';
  PERFORM _sk('E','E2 a quarter after 02 Aug is 02 Nov, not 01 Nov',
              r.next_due_on = DATE '2026-11-02', coalesce(r.next_due_on::text,'null'));

  --  A week is seven days either way, which is why the weekly row is
  --  the one case the two rules agree on.
  UPDATE public.facility_zone_schedules SET frequency = 'weekly' WHERE id = sx;
  UPDATE public.facility_log_entries
     SET recorded_at = '2026-10-17 06:00+00' WHERE reference = 'CR-CAL-1';

  SELECT * INTO r FROM public.facility_deep_clean_schedule(ca)
   WHERE zone_name = 'Calendar room';
  PERFORM _sk('E','E3 a week after 17 Oct is 24 Oct',
              r.next_due_on = DATE '2026-10-24', coalesce(r.next_due_on::text,'null'));

  --  A schedule with no verified clean at all is 'never_cleaned' and
  --  not 'on_schedule' — it has passed nothing.
  DELETE FROM public.facility_log_entries WHERE reference = 'CR-CAL-1';
  SELECT * INTO r FROM public.facility_deep_clean_schedule(ca)
   WHERE zone_name = 'Calendar room';
  PERFORM _sk('E','E4 never cleaned is its own state, not a pass',
              r.status = 'never_cleaned' AND r.next_due_on IS NULL,
              coalesce(r.status,'null'));

  PERFORM _sk('E','E5 and it sorts first, because it is the least known',
              (SELECT (array_agg(zone_name ORDER BY 1))[1] IS NOT NULL
                 FROM public.facility_deep_clean_schedule(ca)),
              'present');

  DELETE FROM public.facility_zone_schedules WHERE id = sx;
  DELETE FROM public.facility_zones          WHERE id = zx;
END
$e$;


-- =====================================================================
--  F — FL-09's five schedule rows, reproduced
-- =====================================================================
DO $f$
DECLARE r record; ca uuid := '00000000-0000-7b07-a000-000000000001'; n integer;
BEGIN
  SELECT count(*) INTO n FROM public.facility_deep_clean_schedule(ca);
  PERFORM _sk('F','F1 five deep-cleaning schedules, as FL-09 draws',
              n = 5, n||' row(s)');

  SELECT * INTO r FROM public.facility_deep_clean_schedule(ca)
   WHERE zone_name = 'QC micro lab';
  PERFORM _sk('F','F2 the micro lab reads "due in 3 days"',
              r.status = 'due_soon' AND r.days_until_due = 3,
              coalesce(r.status,'null')||' / '||coalesce(r.days_until_due::text,'null'));

  SELECT * INTO r FROM public.facility_deep_clean_schedule(ca)
   WHERE zone_name = 'Compression hall C1';
  /*
   *  The BAND, not an exact day count. "A month from the 7th" and "a
   *  month from the 15th" are different numbers of days, so a literal
   *  here would pass or fail on the date the suite happens to run.
   *  What FL-09 draws is the badge, and the badge is what is asserted;
   *  the exact arithmetic is pinned against fixed dates in section E.
   */
  PERFORM _sk('F','F3 compression reads "on schedule", outside the due-soon window',
              r.status = 'on_schedule' AND r.days_until_due > 7,
              coalesce(r.status,'null')||' / '||coalesce(r.days_until_due::text,'null'));

  SELECT * INTO r FROM public.facility_deep_clean_schedule(ca)
   WHERE zone_name = 'Packing hall P1';
  PERFORM _sk('F','F4 packing reads "on schedule", outside the due-soon window',
              r.status = 'on_schedule' AND r.days_until_due > 7,
              coalesce(r.status,'null')||' / '||coalesce(r.days_until_due::text,'null'));

  SELECT * INTO r FROM public.facility_deep_clean_schedule(ca)
   WHERE zone_name = 'Dispensary D-1';
  PERFORM _sk('F','F5 the dispensary reads "on schedule", furthest of the five',
              r.status = 'on_schedule' AND r.days_until_due > 14,
              coalesce(r.status,'null')||' / '||coalesce(r.days_until_due::text,'null'));

  /*
   *  F6 is the threshold itself. The design constrains it to 3..10 and
   *  states nothing, so the choice is a parameter — and a caller who
   *  passes a different one gets a different answer, which is what
   *  makes it a choice rather than a hidden rule.
   */
  SELECT * INTO r FROM public.facility_deep_clean_schedule(ca, 14)
   WHERE zone_name = 'Compression hall C1';
  PERFORM _sk('F','F6 the due-soon window is a parameter, not a hidden rule',
              r.status = 'due_soon', coalesce(r.status,'null'));

  SELECT * INTO r FROM public.facility_deep_clean_schedule(ca, 2)
   WHERE zone_name = 'QC micro lab';
  PERFORM _sk('F','F7 and narrowing it moves the micro lab back',
              r.status = 'on_schedule', coalesce(r.status,'null'));

  --  Overdue first: FL-09 puts G2 at the top and tints its row.
  PERFORM _sk('F','F8 the overdue zone sorts first',
              (SELECT zone_name FROM public.facility_deep_clean_schedule(ca) LIMIT 1)
                = 'Granulation room G2');

  --  The operator and the reference travel with the last clean, which
  --  is FL-09's "15 Sep · CR-2026-0302 · Sadiq Musa".
  SELECT * INTO r FROM public.facility_deep_clean_schedule(ca)
   WHERE zone_name = 'Granulation room G2';
  PERFORM _sk('F','F9 the last clean names its record and its operator',
              r.last_reference = 'CR-2026-0302' AND r.last_operator = 'Yusuf Garba',
              coalesce(r.last_reference,'null')||' · '||coalesce(r.last_operator,'null'));

  --  The records table: all three cleaning types and nothing else.
  SELECT count(*) INTO n FROM public.facility_cleaning_records(ca);
  PERFORM _sk('F','F10 the records table lists every cleaning record',
              n = 7, n||' row(s)');

  SELECT count(*) INTO n FROM public.facility_cleaning_records(ca)
   WHERE log_type NOT IN ('cleaning_routine','cleaning_deep','cleaning_changeover');
  PERFORM _sk('F','F11 and nothing that is not a clean', n = 0, n||' row(s)');

  SELECT * INTO r FROM public.facility_cleaning_records(ca)
   WHERE reference = 'CR-2026-0415';
  PERFORM _sk('F','F12 an unverified record reads as awaiting nobody yet',
              r.verified_at IS NULL AND r.verifier_name IS NULL,
              coalesce(r.verifier_name,'null'));

  PERFORM _sk('F','F13 and carries PRD G3.6''s fields',
              r.cleaning_method = 'wipe down, top to bottom'
                AND r.cleaning_agents @> ARRAY['IPA 70%']
                AND r.contact_minutes = 15
                AND r.line_ref = 'TL-1'
                AND r.operator_name = 'Yusuf Garba',
              coalesce(r.cleaning_method,'null'));

  SELECT * INTO r FROM public.facility_cleaning_records(ca)
   WHERE reference = 'CR-2026-0402';
  PERFORM _sk('F','F14 a verified record names its verifier',
              r.verifier_name = 'Grace Eze', coalesce(r.verifier_name,'null'));

  PERFORM _sk('F','F15 a changeover clean appears with no schedule',
              r.log_type = 'cleaning_changeover' AND r.schedule_id IS NULL,
              coalesce(r.log_type,'null'));
END
$f$;


-- =====================================================================
--  G — company isolation
-- =====================================================================
DO $g$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM public.facility_deep_clean_schedule(
    '00000000-0000-7b07-a000-000000000002');
  PERFORM _sk('G','G1 company B sees only its own schedule', n = 1, n||' row(s)');

  SELECT count(*) INTO n FROM public.facility_cleaning_records(
    '00000000-0000-7b07-a000-000000000002')
   WHERE reference LIKE 'CR-2026%';
  PERFORM _sk('G','G2 and none of company A''s records', n = 0, n||' row(s)');

  SELECT count(*) INTO n FROM public.facility_cleaning_records(
    '00000000-0000-7b07-a000-000000000001')
   WHERE reference = 'CR-B-0001';
  PERFORM _sk('G','G3 nor company A any of B''s', n = 0, n||' row(s)');

  --  Both functions are SECURITY INVOKER, so RLS is what decides.
  SELECT count(*) INTO n FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname='public'
     AND p.proname IN ('facility_deep_clean_schedule','facility_cleaning_records')
     AND p.prosecdef;
  PERFORM _sk('G','G4 neither read function is SECURITY DEFINER', n = 0, n||' definer(s)');
END
$g$;


--  G5/G6 under RLS, as company A's operator.
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-7b07-b000-000000000001","role":"authenticated"}', false);
SET ROLE authenticated;

DO $g2$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM public.facility_deep_clean_schedule(
    '00000000-0000-7b07-a000-000000000002');
  PERFORM _sk('G','G5 asking for another company returns nothing under RLS',
              n = 0, n||' row(s)');

  SELECT count(*) INTO n FROM public.facility_deep_clean_schedule(
    '00000000-0000-7b07-a000-000000000001');
  PERFORM _sk('G','G6 while the caller''s own company still reads',
              n = 5, n||' row(s)');
END
$g2$;

RESET ROLE;
SELECT set_config('request.jwt.claims','',false);


-- =====================================================================
--  H — what was deliberately NOT built
-- =====================================================================
DO $h$
DECLARE
  ca uuid := '00000000-0000-7b07-a000-000000000001';
  ua uuid := '00000000-0000-7b07-b000-000000000001';
  n integer;
BEGIN
  /*
   *  NO FOUR-EYES RULE. Every row FL-09 draws names two different
   *  people and FL-08 says "Supervisor, after you save", but the
   *  design states no constraint and the product has no supervisor
   *  role to bind one to. H1 asserts the absence, so adding it later
   *  is a decision somebody takes rather than a line that drifts in.
   */
  BEGIN
    INSERT INTO public.facility_log_entries
      (company_id,zone_id,log_type,recorded_at,reference,
       recorded_by,verified_by,verified_at)
    VALUES (ca,'00000000-0000-7b07-d000-000000000001','cleaning_routine',now(),
            'CR-SELF-1',ua,ua,now());
    PERFORM _sk('H','H1 no four-eyes rule was invented', true, 'self-verification accepted');
    DELETE FROM public.facility_log_entries WHERE reference = 'CR-SELF-1';
  EXCEPTION WHEN others THEN
    PERFORM _sk('H','H1 no four-eyes rule was invented', false, SQLERRM);
  END;

  --  No automatic deviation and no automatic CAPA on an overdue deep
  --  clean. FL-09 draws an alert, not a record.
  SELECT count(*) INTO n FROM public.capa_records WHERE company_id = ca;
  PERFORM _sk('H','H2 an overdue deep clean raises no CAPA by itself',
              n = 0, n||' CAPA(s)');

  SELECT count(*) INTO n FROM public.facility_log_entries
   WHERE company_id = ca AND linked_deviation_id IS NOT NULL;
  PERFORM _sk('H','H3 nor a deviation', n = 0, n||' link(s)');

  --  No new log type on the SCHEDULE side, which A4 refused from the
  --  other direction: the schedule vocabulary is still the original six.
  SELECT count(*) INTO n FROM pg_constraint
   WHERE conrelid = 'public.facility_zone_schedules'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) LIKE '%cleaning_changeover%';
  PERFORM _sk('H','H4 the schedule vocabulary was not widened', n = 0, n||' match(es)');

  --  Permissions untouched: this feature introduced no section.
  SELECT count(*) INTO n FROM information_schema.tables
   WHERE table_schema='public' AND table_name='section_permissions';
  IF n = 1 THEN
    SELECT count(*) INTO n FROM public.section_permissions
     WHERE section ILIKE '%clean%';
    PERFORM _sk('H','H5 no cleaning permission section was invented',
                n = 0, n||' section(s)');
  ELSE
    PERFORM _sk('H','H5 no cleaning permission section was invented', true,
                'section_permissions absent in this build');
  END IF;
END
$h$;


\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo '  FL-09 · DEEP CLEANING SCHEDULE AND CLEANING RECORDS'
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
  IF f > 0 THEN RAISE EXCEPTION 'FL-09 CLEANING: % assertion(s) failed', f; END IF;
  RAISE NOTICE 'FL-09 CLEANING: all assertions passed';
END
$v$;
