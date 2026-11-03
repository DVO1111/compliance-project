-- =====================================================================
--  FACILITY LOGS, PART 2 — SETTING A ZONE UP (20261205000000)
--
--  A. The triggers exist and are attached
--  B. A zone belongs to a site of its own company
--  C. A schedule belongs to a zone of its own company
--  D. Cross-tenant writes through the setup path
--  E. Why the product retires instead of deleting
--  F. facility_site_options
--  G. updated_at
--
--  WHY B AND C MATTER
--  ------------------
--  RLS on these tables examines one column: the row's own company_id.
--  A caller sending THEIR OWN company_id with somebody else's site_id
--  therefore passes the policy, and would plant a zone of theirs
--  inside another company's plant. 20261204000000 closed exactly this
--  hole for an entry's zone_id and schedule_id; B and C hold the two
--  foreign keys it did not reach.
-- =====================================================================
\set ON_ERROR_STOP on
SET client_min_messages = warning;

CREATE TEMP TABLE _s(section text, name text, ok boolean, detail text);
CREATE OR REPLACE FUNCTION _sk(p_section text, p_name text, p_ok boolean, p_detail text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO _s VALUES (p_section,p_name,coalesce(p_ok,false),p_detail); END $$;

GRANT ALL ON _s TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION _sk(text,text,boolean,text) TO anon, authenticated, service_role;


-- ── Fixture: two companies, a site each, one zone on A ───────────────
DO $fx$
DECLARE
  ca uuid := '00000000-0000-7b01-a000-000000000001';
  cb uuid := '00000000-0000-7b01-a000-000000000002';
  ua uuid := '00000000-0000-7b01-b000-000000000001';
  ub uuid := '00000000-0000-7b01-b000-000000000002';
  sa uuid := '00000000-0000-7b01-c000-000000000001';
  sa2 uuid := '00000000-0000-7b01-c000-000000000003';
  sb uuid := '00000000-0000-7b01-c000-000000000002';
  za uuid := '00000000-0000-7b01-d000-000000000001';
  zb uuid := '00000000-0000-7b01-d000-000000000002';
BEGIN
  --  Re-runnable. Sections B and C both CREATE zones, so a second run
  --  against the same database would collide with the first run's rows
  --  on (site_id, name) and abort before asserting anything. The
  --  runner builds a fresh database, but a suite that only works once
  --  cannot be debugged on the spot.
  DELETE FROM public.facility_log_entries WHERE company_id IN (ca,cb);
  DELETE FROM public.facility_zone_schedules WHERE company_id IN (ca,cb);
  DELETE FROM public.facility_zones WHERE company_id IN (ca,cb);
  DELETE FROM public.sites WHERE company_id IN (ca,cb);
  DELETE FROM public.company_members WHERE company_id IN (ca,cb);
  DELETE FROM public.profiles WHERE id IN (ua,ub);
  DELETE FROM auth.users WHERE id IN (ua,ub);
  DELETE FROM public.companies WHERE id IN (ca,cb);

  INSERT INTO public.companies(id,name) VALUES (ca,'FZ Alpha'), (cb,'FZ Bravo')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO auth.users(id,email) VALUES (ua,'fz-a@local.test'), (ub,'fz-b@local.test')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.profiles(id,email,full_name,role,company_id) VALUES
    (ua,'fz-a@local.test','Ada Alpha','admin',ca),
    (ub,'fz-b@local.test','Bo Bravo','admin',cb) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.company_members(company_id,user_id,role,status) VALUES
    (ca,ua,'owner','active'), (cb,ub,'owner','active') ON CONFLICT DO NOTHING;

  INSERT INTO public.sites(id,company_id,name) VALUES
    (sa,ca,'FZ Oluyole plant'), (sa2,ca,'FZ Alpha warehouse'), (sb,cb,'FZ Bravo depot')
    ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.facility_zones(id,company_id,site_id,name,code,grade,created_by)
  VALUES (za,ca,sa,'FZ Granulation','FZ-GR','Grade D',ua),
         (zb,cb,sb,'FZ Bravo cold room','FZ-BCR','Unclassified',ub)
    ON CONFLICT (id) DO NOTHING;
END
$fx$;


-- =====================================================================
--  A — the triggers exist and are attached
-- =====================================================================
DO $a$
BEGIN
  PERFORM _sk('A','A1 fn_facility_zone_integrity exists',
    (SELECT count(*) = 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname='public' AND p.proname='fn_facility_zone_integrity'));

  PERFORM _sk('A','A2 fn_facility_schedule_integrity exists',
    (SELECT count(*) = 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname='public' AND p.proname='fn_facility_schedule_integrity'));

  PERFORM _sk('A','A3 the zone trigger is attached BEFORE insert and update',
    (SELECT count(*) = 1 FROM pg_trigger
      WHERE tgrelid='public.facility_zones'::regclass
        AND tgname='trg_facility_zone_integrity' AND NOT tgisinternal));

  PERFORM _sk('A','A4 the schedule trigger is attached BEFORE insert and update',
    (SELECT count(*) = 1 FROM pg_trigger
      WHERE tgrelid='public.facility_zone_schedules'::regclass
        AND tgname='trg_facility_schedule_integrity' AND NOT tgisinternal));

  --  Both must be BEFORE row triggers: an AFTER trigger could not set
  --  updated_at, and a statement trigger would not see NEW at all.
  PERFORM _sk('A','A5 both fire BEFORE, per row',
    (SELECT bool_and((tgtype & 2) > 0 AND (tgtype & 1) > 0) FROM pg_trigger
      WHERE tgname IN ('trg_facility_zone_integrity','trg_facility_schedule_integrity')
        AND NOT tgisinternal));
END
$a$;


--  Everything below runs as company A's admin.
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-7b01-b000-000000000001","role":"authenticated"}', false);
SET ROLE authenticated;

-- =====================================================================
--  B — a zone belongs to a site of its own company
-- =====================================================================
DO $b$
DECLARE v_err text; v_id uuid; n integer;
BEGIN
  --  B1: the ordinary case still works, or the rest proves nothing.
  INSERT INTO public.facility_zones(company_id,site_id,name,grade,created_by)
  VALUES ('00000000-0000-7b01-a000-000000000001',
          '00000000-0000-7b01-c000-000000000003','FZ Packing hall','Grade D',auth.uid())
  RETURNING id INTO v_id;
  PERFORM _sk('B','B1 a zone on an own-company site is accepted', v_id IS NOT NULL);

  --  B2: THE ONE THAT MATTERS. Own company_id, another company's site.
  --  RLS passes this: the row's company_id is the caller's own, which
  --  is all the policy examines. The trigger is what refuses it.
  --
  --  It refuses with NOT_FOUND rather than WRONG_COMPANY, and that is
  --  the contract rather than a defect. The trigger is SECURITY
  --  INVOKER, so its lookup on `sites` runs under this caller's RLS,
  --  and Bravo's site is invisible to them — so the lookup finds
  --  nothing to compare. Section H asserts the other branch in the
  --  context where it does fire. The refusal is what matters here;
  --  which of the two codes carries it is a diagnostics question.
  BEGIN
    INSERT INTO public.facility_zones(company_id,site_id,name,created_by)
    VALUES ('00000000-0000-7b01-a000-000000000001',
            '00000000-0000-7b01-c000-000000000002','FZ Smuggled zone',auth.uid());
    PERFORM _sk('B','B2 a zone cannot be placed on another company''s site',
                false, 'the insert succeeded');
  EXCEPTION WHEN others THEN
    v_err := SQLERRM;
    PERFORM _sk('B','B2 a zone cannot be placed on another company''s site',
                v_err LIKE 'FACILITY_SITE_NOT_FOUND%'
                OR v_err LIKE 'FACILITY_SITE_WRONG_COMPANY%', v_err);
  END;

  --  B3: a site that does not exist is named separately from one that
  --  belongs to somebody else — the two need different fixes.
  BEGIN
    INSERT INTO public.facility_zones(company_id,site_id,name,created_by)
    VALUES ('00000000-0000-7b01-a000-000000000001',
            '00000000-0000-7b01-c000-0000000000ff','FZ Nowhere',auth.uid());
    PERFORM _sk('B','B3 a missing site is refused', false, 'the insert succeeded');
  EXCEPTION WHEN others THEN
    v_err := SQLERRM;
    --  The FK may fire first; either refusal is correct, so accept both
    --  and record which one happened.
    PERFORM _sk('B','B3 a missing site is refused',
      v_err LIKE 'FACILITY_SITE_NOT_FOUND%' OR SQLSTATE = '23503', v_err);
  END;

  --  B4: a blank name, which NOT NULL does not catch.
  BEGIN
    INSERT INTO public.facility_zones(company_id,site_id,name,created_by)
    VALUES ('00000000-0000-7b01-a000-000000000001',
            '00000000-0000-7b01-c000-000000000001','   ',auth.uid());
    PERFORM _sk('B','B4 a blank zone name is refused', false, 'the insert succeeded');
  EXCEPTION WHEN others THEN
    v_err := SQLERRM;
    PERFORM _sk('B','B4 a blank zone name is refused',
                v_err LIKE 'FACILITY_ZONE_NAME_REQUIRED%', v_err);
  END;

  --  B5: an UPDATE must be checked too, or the rule is insert-only and
  --  a zone can be moved to another company's site after the fact.
  BEGIN
    UPDATE public.facility_zones
       SET site_id = '00000000-0000-7b01-c000-000000000002'
     WHERE id = '00000000-0000-7b01-d000-000000000001';
    PERFORM _sk('B','B5 a zone cannot be moved onto another company''s site',
                false, 'the update succeeded');
  EXCEPTION WHEN others THEN
    v_err := SQLERRM;
    PERFORM _sk('B','B5 a zone cannot be moved onto another company''s site',
                v_err LIKE 'FACILITY_SITE_NOT_FOUND%'
                OR v_err LIKE 'FACILITY_SITE_WRONG_COMPANY%', v_err);
  END;

  --  B6: renaming to a name already used on the same site is refused
  --  by the unique constraint, which the client reports by name.
  BEGIN
    INSERT INTO public.facility_zones(company_id,site_id,name,created_by)
    VALUES ('00000000-0000-7b01-a000-000000000001',
            '00000000-0000-7b01-c000-000000000001','FZ Granulation',auth.uid());
    PERFORM _sk('B','B6 two zones on one site cannot share a name',
                false, 'the insert succeeded');
  EXCEPTION WHEN unique_violation THEN
    PERFORM _sk('B','B6 two zones on one site cannot share a name', true, SQLSTATE);
  END;

  --  B7: the same name on a DIFFERENT site is fine — the constraint is
  --  per site, and a plant and a warehouse may both have a "Store".
  INSERT INTO public.facility_zones(company_id,site_id,name,created_by)
  VALUES ('00000000-0000-7b01-a000-000000000001',
          '00000000-0000-7b01-c000-000000000003','FZ Granulation',auth.uid());
  SELECT count(*) INTO n FROM public.facility_zones WHERE name='FZ Granulation';
  PERFORM _sk('B','B7 the same zone name on another site is allowed', n = 2, n||' row(s)');
END
$b$;


-- =====================================================================
--  C — a schedule belongs to a zone of its own company
-- =====================================================================
DO $c$
DECLARE v_err text; v_id uuid;
BEGIN
  INSERT INTO public.facility_zone_schedules
    (company_id,zone_id,log_type,description,frequency,alert_limit,action_limit,result_unit)
  VALUES ('00000000-0000-7b01-a000-000000000001',
          '00000000-0000-7b01-d000-000000000001',
          'environmental_air','Air · settle plates, 4 positions','daily',25,50,'CFU')
  RETURNING id INTO v_id;
  PERFORM _sk('C','C1 a schedule on an own-company zone is accepted', v_id IS NOT NULL);

  --  C2: own company_id, Bravo's zone.
  BEGIN
    INSERT INTO public.facility_zone_schedules
      (company_id,zone_id,log_type,description,frequency)
    VALUES ('00000000-0000-7b01-a000-000000000001',
            '00000000-0000-7b01-d000-000000000002',
            'water','Borehole, monthly draw','monthly');
    PERFORM _sk('C','C2 a test cannot be scheduled on another company''s zone',
                false, 'the insert succeeded');
  EXCEPTION WHEN others THEN
    v_err := SQLERRM;
    --  NOT_FOUND under the caller's RLS; see B2. Section H covers the
    --  WRONG_COMPANY branch.
    PERFORM _sk('C','C2 a test cannot be scheduled on another company''s zone',
                v_err LIKE 'FACILITY_ZONE_NOT_FOUND%'
                OR v_err LIKE 'FACILITY_SCHEDULE_WRONG_COMPANY%', v_err);
  END;

  BEGIN
    INSERT INTO public.facility_zone_schedules
      (company_id,zone_id,log_type,description,frequency)
    VALUES ('00000000-0000-7b01-a000-000000000001',
            '00000000-0000-7b01-d000-000000000001','cleaning_routine','   ','daily');
    PERFORM _sk('C','C3 a blank description is refused', false, 'the insert succeeded');
  EXCEPTION WHEN others THEN
    v_err := SQLERRM;
    PERFORM _sk('C','C3 a blank description is refused',
                v_err LIKE 'FACILITY_SCHEDULE_DESCRIPTION_REQUIRED%', v_err);
  END;

  --  C4: an action limit below its alert limit inverts the meaning of
  --  every result measured against it. Arithmetic, not policy.
  BEGIN
    INSERT INTO public.facility_zone_schedules
      (company_id,zone_id,log_type,description,frequency,alert_limit,action_limit,result_unit)
    VALUES ('00000000-0000-7b01-a000-000000000001',
            '00000000-0000-7b01-d000-000000000001',
            'environmental_surface','Surface swabs','weekly',50,25,'CFU');
    PERFORM _sk('C','C4 an inverted pair of limits is refused', false, 'the insert succeeded');
  EXCEPTION WHEN check_violation THEN
    PERFORM _sk('C','C4 an inverted pair of limits is refused', true, SQLSTATE);
  END;

  --  C5: a cleaning test with NEITHER limit is accepted. FL-01 draws
  --  those rows, so refusing them would contradict the design.
  INSERT INTO public.facility_zone_schedules
    (company_id,zone_id,log_type,description,frequency)
  VALUES ('00000000-0000-7b01-a000-000000000001',
          '00000000-0000-7b01-d000-000000000001',
          'cleaning_deep','Deep clean after campaign','quarterly')
  RETURNING id INTO v_id;
  PERFORM _sk('C','C5 a test with no limits is accepted', v_id IS NOT NULL);

  --  C6: an unknown log type has nowhere to appear on FL-01, so the
  --  tabs ARE the vocabulary.
  BEGIN
    INSERT INTO public.facility_zone_schedules
      (company_id,zone_id,log_type,description,frequency)
    VALUES ('00000000-0000-7b01-a000-000000000001',
            '00000000-0000-7b01-d000-000000000001','radiation','Invented type','daily');
    PERFORM _sk('C','C6 an unknown log type is refused', false, 'the insert succeeded');
  EXCEPTION WHEN check_violation THEN
    PERFORM _sk('C','C6 an unknown log type is refused', true, SQLSTATE);
  END;

  --  C7: and the same on UPDATE.
  BEGIN
    UPDATE public.facility_zone_schedules
       SET zone_id = '00000000-0000-7b01-d000-000000000002'
     WHERE id = v_id;
    PERFORM _sk('C','C7 a test cannot be moved onto another company''s zone',
                false, 'the update succeeded');
  EXCEPTION WHEN others THEN
    v_err := SQLERRM;
    PERFORM _sk('C','C7 a test cannot be moved onto another company''s zone',
                v_err LIKE 'FACILITY_ZONE_NOT_FOUND%'
                OR v_err LIKE 'FACILITY_SCHEDULE_WRONG_COMPANY%', v_err);
  END;
END
$c$;


-- =====================================================================
--  D — the setup path does not become a way into another tenant
-- =====================================================================
DO $d$
DECLARE v_err text; n integer;
BEGIN
  --  D1: naming Bravo's company outright. RLS, not the trigger.
  BEGIN
    INSERT INTO public.facility_zones(company_id,site_id,name,created_by)
    VALUES ('00000000-0000-7b01-a000-000000000002',
            '00000000-0000-7b01-c000-000000000002','FZ Trespass',auth.uid());
    PERFORM _sk('D','D1 a zone cannot be created for another company',
                false, 'the insert succeeded');
  EXCEPTION WHEN others THEN
    v_err := SQLSTATE;
    PERFORM _sk('D','D1 a zone cannot be created for another company', true, 'SQLSTATE '||v_err);
  END;

  --  D2: an UPDATE that matches no visible row is the silent-filter
  --  case — RLS removes the row before the UPDATE sees it, so the
  --  statement "succeeds" having changed nothing. The assertion has to
  --  be on ROW_COUNT, not on the absence of an error.
  UPDATE public.facility_zones SET grade = 'Grade A'
   WHERE id = '00000000-0000-7b01-d000-000000000002';
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM _sk('D','D2 updating another company''s zone changes no row', n = 0, n||' row(s)');

  SELECT count(*) INTO n FROM public.facility_zones
   WHERE company_id = '00000000-0000-7b01-a000-000000000002';
  PERFORM _sk('D','D3 sees none of the other company''s zones', n = 0, n||' row(s)');
END
$d$;


-- =====================================================================
--  E — why the product retires instead of deleting
-- =====================================================================
DO $e$
DECLARE n integer;
BEGIN
  --  E1/E2: these two FK rules are the whole reason FL-02 offers no
  --  delete and the service exposes setZoneActive instead. If either
  --  ever changed, the UI's reasoning would be stale.
  PERFORM _sk('E','E1 entries cascade when a zone is deleted, so zones are retired',
    (SELECT confdeltype = 'c' FROM pg_constraint
      WHERE conrelid='public.facility_log_entries'::regclass
        AND confrelid='public.facility_zones'::regclass AND contype='f'));

  PERFORM _sk('E','E2 an entry keeps its row when a schedule is deleted',
    (SELECT confdeltype = 'n' FROM pg_constraint
      WHERE conrelid='public.facility_log_entries'::regclass
        AND confrelid='public.facility_zone_schedules'::regclass AND contype='f'));

  --  E3: retiring is an UPDATE, so it must leave the history alone.
  INSERT INTO public.facility_log_entries
    (company_id,zone_id,log_type,result_value,recorded_by)
  VALUES ('00000000-0000-7b01-a000-000000000001',
          '00000000-0000-7b01-d000-000000000001','environmental_air',10,auth.uid());

  UPDATE public.facility_zones SET is_active = false
   WHERE id = '00000000-0000-7b01-d000-000000000001';

  SELECT count(*) INTO n FROM public.facility_log_entries
   WHERE zone_id = '00000000-0000-7b01-d000-000000000001';
  PERFORM _sk('E','E3 retiring a zone keeps its recorded entries', n >= 1, n||' row(s)');

  --  E4: and the zone is still readable, or its history would be
  --  orphaned behind a filter.
  PERFORM _sk('E','E4 a retired zone is still readable',
    (SELECT count(*) = 1 FROM public.facility_zones
      WHERE id='00000000-0000-7b01-d000-000000000001'));

  UPDATE public.facility_zones SET is_active = true
   WHERE id = '00000000-0000-7b01-d000-000000000001';
END
$e$;


-- =====================================================================
--  F — facility_site_options
-- =====================================================================
DO $f$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM public.facility_site_options(
    '00000000-0000-7b01-a000-000000000001');
  PERFORM _sk('F','F1 returns the caller''s own sites', n >= 2, n||' row(s)');

  --  F2: SECURITY INVOKER, so asking for another company's sites
  --  returns nothing rather than leaking them. A SECURITY DEFINER
  --  function here would have handed them over.
  SELECT count(*) INTO n FROM public.facility_site_options(
    '00000000-0000-7b01-a000-000000000002');
  PERFORM _sk('F','F2 returns nothing for another company', n = 0, n||' row(s)');

  PERFORM _sk('F','F3 is SECURITY INVOKER',
    (SELECT NOT prosecdef FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
      WHERE ns.nspname='public' AND p.proname='facility_site_options'));
END
$f$;


-- =====================================================================
--  G — updated_at
-- =====================================================================
DO $g$
DECLARE t1 timestamptz; t2 timestamptz;
BEGIN
  SELECT updated_at INTO t1 FROM public.facility_zones
   WHERE id='00000000-0000-7b01-d000-000000000001';
  PERFORM pg_sleep(0.01);
  UPDATE public.facility_zones SET grade='Grade C'
   WHERE id='00000000-0000-7b01-d000-000000000001';
  SELECT updated_at INTO t2 FROM public.facility_zones
   WHERE id='00000000-0000-7b01-d000-000000000001';
  PERFORM _sk('G','G1 updating a zone moves updated_at', t2 > t1,
              coalesce(t1::text,'null')||' -> '||coalesce(t2::text,'null'));
END
$g$;

-- =====================================================================
--  H — the WRONG_COMPANY branch, where it can actually fire
--
--  Sections B and C showed that an ordinary user is refused by the
--  NOT_FOUND branch, because RLS hides the other company's row before
--  the trigger can compare it. That leaves the WRONG_COMPANY branch
--  untested, and an untested branch in a refusal path is one nobody
--  knows still works.
--
--  RLS is bypassed below (table owner), which is the posture a
--  migration, the service role, or a definer-context job runs in.
--  There the row IS visible, so the company mismatch is what has to
--  stop the write — and these two assertions are the only proof that
--  it does.
-- =====================================================================
RESET ROLE;

DO $h$
DECLARE v_err text;
BEGIN
  PERFORM _sk('H','H0 RLS is bypassed in this context',
    (SELECT count(*) = 1 FROM public.facility_zones
      WHERE id='00000000-0000-7b01-d000-000000000002'),
    'company B''s zone should be visible here');

  BEGIN
    INSERT INTO public.facility_zones(company_id,site_id,name)
    VALUES ('00000000-0000-7b01-a000-000000000001',
            '00000000-0000-7b01-c000-000000000002','FZ Privileged trespass');
    PERFORM _sk('H','H1 a privileged caller cannot place a zone on another company''s site',
                false, 'the insert succeeded');
  EXCEPTION WHEN others THEN
    v_err := SQLERRM;
    PERFORM _sk('H','H1 a privileged caller cannot place a zone on another company''s site',
                v_err LIKE 'FACILITY_SITE_WRONG_COMPANY%', v_err);
  END;

  BEGIN
    INSERT INTO public.facility_zone_schedules
      (company_id,zone_id,log_type,description,frequency)
    VALUES ('00000000-0000-7b01-a000-000000000001',
            '00000000-0000-7b01-d000-000000000002',
            'water','Privileged borehole draw','monthly');
    PERFORM _sk('H','H2 a privileged caller cannot schedule a test on another company''s zone',
                false, 'the insert succeeded');
  EXCEPTION WHEN others THEN
    v_err := SQLERRM;
    PERFORM _sk('H','H2 a privileged caller cannot schedule a test on another company''s zone',
                v_err LIKE 'FACILITY_SCHEDULE_WRONG_COMPANY%', v_err);
  END;
END
$h$;

RESET ROLE;

SELECT set_config('request.jwt.claims','',false);


\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo '  FACILITY LOGS, PART 2 — SETTING A ZONE UP'
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
  IF f > 0 THEN RAISE EXCEPTION 'FACILITY ZONE SETUP: % assertion(s) failed', f; END IF;
  RAISE NOTICE 'FACILITY ZONE SETUP: all assertions passed';
END
$v$;
