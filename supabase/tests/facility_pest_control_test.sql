-- =====================================================================
--  FACILITY LOGS, PART 4 — PEST CONTROL (20261207000000)
--
--  A. Tables, RLS and triggers
--  B. Company agreement on every parent
--  C. THE CLOSURE RULE
--  D. A finding that does NOT need action
--  E. Cross-tenant
--  F. The register function
--  G. Attributability
--
--  WHY C IS THE POINT OF THIS FILE
--  -------------------------------
--  W6·29's note on FL-13 states the rule in one sentence: "A finding
--  marked as needing action can't be closed by a note; it becomes a
--  task with an owner and a due date."
--
--  A note is exactly what a `resolution_note` is. So the test that
--  matters is C2: writing a resolution_note onto a finding marked as
--  needing action must be REFUSED, however plausible the note. C4 is
--  its mirror — un-marking the finding after closing it would reach
--  the same place from the other side.
-- =====================================================================
\set ON_ERROR_STOP on
SET client_min_messages = warning;

CREATE TEMP TABLE _s(section text, name text, ok boolean, detail text);
CREATE OR REPLACE FUNCTION _sk(p_section text, p_name text, p_ok boolean, p_detail text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO _s VALUES (p_section,p_name,coalesce(p_ok,false),p_detail); END $$;

GRANT ALL ON _s TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION _sk(text,text,boolean,text) TO anon, authenticated, service_role;


-- ── Fixture: two companies, a provider and a visit each ──────────────
DO $fx$
DECLARE
  ca uuid := '00000000-0000-7b03-a000-000000000001';
  cb uuid := '00000000-0000-7b03-a000-000000000002';
  ua uuid := '00000000-0000-7b03-b000-000000000001';
  ub uuid := '00000000-0000-7b03-b000-000000000002';
  sa uuid := '00000000-0000-7b03-c000-000000000001';
  sb uuid := '00000000-0000-7b03-c000-000000000002';
  za uuid := '00000000-0000-7b03-d000-000000000001';
  zb uuid := '00000000-0000-7b03-d000-000000000002';
  pa uuid := '00000000-0000-7b03-e000-000000000001';
  pb uuid := '00000000-0000-7b03-e000-000000000002';
  va uuid := '00000000-0000-7b03-f000-000000000001';
  vb uuid := '00000000-0000-7b03-f000-000000000002';
BEGIN
  DELETE FROM public.facility_pest_findings  WHERE company_id IN (ca,cb);
  DELETE FROM public.facility_pest_visits    WHERE company_id IN (ca,cb);
  DELETE FROM public.facility_pest_providers WHERE company_id IN (ca,cb);
  DELETE FROM public.facility_zones   WHERE company_id IN (ca,cb);
  DELETE FROM public.sites            WHERE company_id IN (ca,cb);
  DELETE FROM public.company_members  WHERE company_id IN (ca,cb);
  DELETE FROM public.profiles         WHERE id IN (ua,ub);
  DELETE FROM auth.users              WHERE id IN (ua,ub);
  DELETE FROM public.companies        WHERE id IN (ca,cb);

  INSERT INTO public.companies(id,name) VALUES (ca,'PC Alpha'),(cb,'PC Bravo');
  INSERT INTO auth.users(id,email) VALUES (ua,'pc-a@local.test'),(ub,'pc-b@local.test');
  INSERT INTO public.profiles(id,email,full_name,role,company_id) VALUES
    (ua,'pc-a@local.test','Ada Alpha','admin',ca),
    (ub,'pc-b@local.test','Bo Bravo','admin',cb);
  INSERT INTO public.company_members(company_id,user_id,role,status) VALUES
    (ca,ua,'owner','active'),(cb,ub,'owner','active');

  INSERT INTO public.sites(id,company_id,name) VALUES (sa,ca,'PC plant'),(sb,cb,'PC depot');
  INSERT INTO public.facility_zones(id,company_id,site_id,name,created_by) VALUES
    (za,ca,sa,'PC Warehouse W1',ua), (zb,cb,sb,'PC Bravo store',ub);

  INSERT INTO public.facility_pest_providers
    (id,company_id,site_id,name,visit_frequency,contract_until,methods,next_visit_on,created_by)
  VALUES
    (pa,ca,sa,'PC Greenshield Ltd','Fortnightly visits','2027-03-31',
     ARRAY['Bait stations','Insect light traps'],'2026-11-03',ua),
    (pb,cb,sb,'PC Bravo Pest Co','Monthly','2027-01-31',ARRAY['Bait stations'],'2026-11-10',ub);

  INSERT INTO public.facility_pest_visits
    (id,company_id,provider_id,reference,visited_on,technician_name,report_file_ref,created_by)
  VALUES
    (va,ca,pa,'PC-2026-0019','2026-10-20','Kunle Ade','greenshield-20oct.pdf',ua),
    (vb,cb,pb,'PC-2026-0019','2026-10-21','Other Tech','bravo.pdf',ub);
END
$fx$;


-- =====================================================================
--  A — tables, RLS and triggers
-- =====================================================================
DO $a$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['facility_pest_providers','facility_pest_visits','facility_pest_findings']
  LOOP
    PERFORM _sk('A','A1 '||t||' has RLS enabled',
      (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.'||t)::regclass), t);

    --  Every company-scoped table in this feature carries the FK the
    --  logistics tables were found to be missing.
    PERFORM _sk('A','A2 '||t||' has a company_id FK to companies',
      (SELECT count(*) = 1 FROM pg_constraint k
        WHERE k.conrelid = ('public.'||t)::regclass
          AND k.contype = 'f'
          AND k.confrelid = 'public.companies'::regclass), t);
  END LOOP;

  PERFORM _sk('A','A3 the visit trigger is attached BEFORE insert and update',
    (SELECT count(*) = 1 FROM pg_trigger
      WHERE tgrelid='public.facility_pest_visits'::regclass
        AND tgname='trg_facility_pest_visit_integrity' AND NOT tgisinternal));

  PERFORM _sk('A','A4 the finding trigger is attached BEFORE insert and update',
    (SELECT count(*) = 1 FROM pg_trigger
      WHERE tgrelid='public.facility_pest_findings'::regclass
        AND tgname='trg_facility_pest_finding_integrity' AND NOT tgisinternal));

  --  corrective_task_id deliberately has NO foreign key: there is no
  --  task register to point at. If one is ever added this assertion
  --  should be revisited, which is why it is stated rather than left
  --  as an absence.
  PERFORM _sk('A','A5 corrective_task_id has no FK, because no task register exists',
    (SELECT count(*) = 0 FROM pg_constraint k
      JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = ANY (k.conkey)
      WHERE k.conrelid='public.facility_pest_findings'::regclass
        AND k.contype='f' AND a.attname='corrective_task_id'));
END
$a$;


--  Everything below runs as company A's admin.
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-7b03-b000-000000000001","role":"authenticated"}', false);
SET ROLE authenticated;

-- =====================================================================
--  B — company agreement on every parent
-- =====================================================================
DO $b$
DECLARE v_err text; v_id uuid;
BEGIN
  --  B1: the ordinary case, or nothing below proves anything.
  INSERT INTO public.facility_pest_findings
    (company_id,visit_id,station_code,location_ref,finding,method_used,created_by)
  VALUES ('00000000-0000-7b03-a000-000000000001','00000000-0000-7b03-f000-000000000001',
          'BS-03','PC Warehouse W1 · rear wall','No activity','Bait checked',auth.uid())
  RETURNING id INTO v_id;
  PERFORM _sk('B','B1 a finding on an own-company visit is accepted', v_id IS NOT NULL);

  --  B2: own company_id, Bravo's visit. RLS passes it; the trigger
  --  must not. Under the caller's RLS Bravo's visit is invisible, so
  --  NOT_FOUND is the expected refusal — the same contract as
  --  20261205000000, where section H covers the other branch.
  BEGIN
    INSERT INTO public.facility_pest_findings
      (company_id,visit_id,station_code,finding,created_by)
    VALUES ('00000000-0000-7b03-a000-000000000001','00000000-0000-7b03-f000-000000000002',
            'BS-99','Smuggled finding',auth.uid());
    PERFORM _sk('B','B2 a finding cannot be attached to another company''s visit',
                false, 'the insert succeeded');
  EXCEPTION WHEN others THEN
    v_err := SQLERRM;
    PERFORM _sk('B','B2 a finding cannot be attached to another company''s visit',
      v_err LIKE 'PEST_VISIT_NOT_FOUND%' OR v_err LIKE 'PEST_VISIT_WRONG_COMPANY%', v_err);
  END;

  --  B3: a zone from another company, named on an otherwise valid
  --  finding.
  BEGIN
    INSERT INTO public.facility_pest_findings
      (company_id,visit_id,zone_id,station_code,finding,created_by)
    VALUES ('00000000-0000-7b03-a000-000000000001','00000000-0000-7b03-f000-000000000001',
            '00000000-0000-7b03-d000-000000000002','BS-98','Wrong zone',auth.uid());
    PERFORM _sk('B','B3 a finding cannot name another company''s zone',
                false, 'the insert succeeded');
  EXCEPTION WHEN others THEN
    v_err := SQLERRM;
    PERFORM _sk('B','B3 a finding cannot name another company''s zone',
      v_err LIKE 'FACILITY_ZONE_NOT_FOUND%' OR v_err LIKE 'FACILITY_ZONE_WRONG_COMPANY%', v_err);
  END;

  --  B4: a station in a canteen or corridor has no zone, which FL-13
  --  draws, so a null zone must be accepted.
  INSERT INTO public.facility_pest_findings
    (company_id,visit_id,station_code,location_ref,finding,created_by)
  VALUES ('00000000-0000-7b03-a000-000000000001','00000000-0000-7b03-f000-000000000001',
          'BS-11','Canteen, outside','Bait taken 20%',auth.uid())
  RETURNING id INTO v_id;
  PERFORM _sk('B','B4 a finding with no zone is accepted', v_id IS NOT NULL);

  --  B5: a visit cannot hang off another company's provider.
  BEGIN
    INSERT INTO public.facility_pest_visits
      (company_id,provider_id,reference,visited_on,created_by)
    VALUES ('00000000-0000-7b03-a000-000000000001','00000000-0000-7b03-e000-000000000002',
            'PC-2026-9999','2026-10-22',auth.uid());
    PERFORM _sk('B','B5 a visit cannot hang off another company''s provider',
                false, 'the insert succeeded');
  EXCEPTION WHEN others THEN
    v_err := SQLERRM;
    PERFORM _sk('B','B5 a visit cannot hang off another company''s provider',
      v_err LIKE 'PEST_PROVIDER_NOT_FOUND%' OR v_err LIKE 'PEST_PROVIDER_WRONG_COMPANY%', v_err);
  END;

  --  B6: two companies may use the same visit reference. The unique
  --  constraint is per company, and PC-2026-0019 exists on both.
  PERFORM _sk('B','B6 a visit reference is unique per company, not globally',
    (SELECT count(*) = 1 FROM public.facility_pest_visits
      WHERE reference = 'PC-2026-0019'),
    'company A should see exactly its own');
END
$b$;


-- =====================================================================
--  C — THE CLOSURE RULE
--
--  "A finding marked as needing action can't be closed by a note."
-- =====================================================================
DO $c$
DECLARE v_err text; v_id uuid; n integer;
BEGIN
  --  The FL-13 row that needs action: rodent droppings at BS-07.
  INSERT INTO public.facility_pest_findings
    (company_id,visit_id,station_code,location_ref,finding,method_used,
     needs_action,created_by)
  VALUES ('00000000-0000-7b03-a000-000000000001','00000000-0000-7b03-f000-000000000001',
          'BS-07','PC Warehouse W1 · dock door',
          'Rodent droppings; 60% of bait taken',
          'Bait replaced, entry gap under door noted', true, auth.uid())
  RETURNING id INTO v_id;
  PERFORM _sk('C','C1 a finding can be marked as needing action', v_id IS NOT NULL);

  --  C2: THE ASSERTION THIS FILE EXISTS FOR. A plausible, detailed,
  --  well-meant note — and it must still be refused, because the
  --  design says a corrective action is not a note.
  BEGIN
    UPDATE public.facility_pest_findings
       SET resolved_at = now(), resolved_by = auth.uid(),
           resolution_note = 'Gap under the dock door sealed by maintenance on 21 Oct.'
     WHERE id = v_id;
    PERFORM _sk('C','C2 it cannot be closed by a note alone', false, 'the update succeeded');
  EXCEPTION WHEN others THEN
    v_err := SQLERRM;
    PERFORM _sk('C','C2 it cannot be closed by a note alone',
                v_err LIKE 'PEST_FINDING_NEEDS_CORRECTIVE_TASK%', v_err);
  END;

  --  C3: and it is still open afterwards — the refusal has to leave
  --  the row alone, not half-apply.
  SELECT count(*) INTO n FROM public.facility_pest_findings
   WHERE id = v_id AND resolved_at IS NULL AND needs_action;
  PERFORM _sk('C','C3 the finding is still open after the refusal', n = 1, n||' row(s)');

  --  C4: THE SAME LOOPHOLE FROM THE OTHER SIDE. Closing it first is
  --  refused by C2, so try un-marking it and closing it as an
  --  ordinary finding.
  --
  --  On its OWN row, deliberately. Reusing C2's finding made this
  --  assertion depend on C2 having failed to close it — so when the
  --  rule was broken on purpose to check these tests detect it, C2
  --  passed its close, C4's bare UPDATE hit ALREADY_ACTIONED and the
  --  whole suite aborted instead of reporting one clean failure. Each
  --  assertion gets its own row.
  INSERT INTO public.facility_pest_findings
    (company_id,visit_id,station_code,finding,needs_action,created_by)
  VALUES ('00000000-0000-7b03-a000-000000000001','00000000-0000-7b03-f000-000000000001',
          'BS-07b','Mis-marked on the day', true, auth.uid())
  RETURNING id INTO v_id;

  UPDATE public.facility_pest_findings SET needs_action = false WHERE id = v_id;
  UPDATE public.facility_pest_findings
     SET resolved_at = now(), resolved_by = auth.uid(), resolution_note = 'Not really an issue'
   WHERE id = v_id;
  --  That path IS open, and it should be: a mis-marked finding must be
  --  correctable while it is still open. What must not be possible is
  --  re-marking history after the fact, which C5 covers.
  PERFORM _sk('C','C4 un-marking a finding that is still open is allowed',
    (SELECT resolved_at IS NOT NULL FROM public.facility_pest_findings WHERE id = v_id));

  --  C5: a finding that WAS actioned and closed cannot have its
  --  needs_action flag cleared afterwards.
  INSERT INTO public.facility_pest_findings
    (company_id,visit_id,station_code,finding,needs_action,
     corrective_task_id,resolved_at,resolved_by,resolution_note,created_by)
  VALUES ('00000000-0000-7b03-a000-000000000001','00000000-0000-7b03-f000-000000000001',
          'BS-22','Cockroach activity, canteen drain', true,
          gen_random_uuid(), now(), auth.uid(), 'drain cover replaced', auth.uid())
  RETURNING id INTO v_id;
  PERFORM _sk('C','C5a a finding WITH a corrective task can be closed', v_id IS NOT NULL);

  BEGIN
    UPDATE public.facility_pest_findings SET needs_action = false WHERE id = v_id;
    PERFORM _sk('C','C5b a closed actioned finding cannot be un-marked',
                false, 'the update succeeded');
  EXCEPTION WHEN others THEN
    v_err := SQLERRM;
    PERFORM _sk('C','C5b a closed actioned finding cannot be un-marked',
                v_err LIKE 'PEST_FINDING_ALREADY_ACTIONED%', v_err);
  END;

  --  C6: marking an EXISTING open finding as needing action, then
  --  trying to close it, is refused the same way. The rule is on the
  --  row's state, not on how it got there.
  INSERT INTO public.facility_pest_findings
    (company_id,visit_id,station_code,finding,created_by)
  VALUES ('00000000-0000-7b03-a000-000000000001','00000000-0000-7b03-f000-000000000001',
          'BS-33','Initially looked like nothing',auth.uid())
  RETURNING id INTO v_id;
  UPDATE public.facility_pest_findings SET needs_action = true WHERE id = v_id;
  BEGIN
    UPDATE public.facility_pest_findings
       SET resolved_at = now(), resolved_by = auth.uid(), resolution_note = 'handled'
     WHERE id = v_id;
    PERFORM _sk('C','C6 a later-marked finding is refused too', false, 'the update succeeded');
  EXCEPTION WHEN others THEN
    v_err := SQLERRM;
    PERFORM _sk('C','C6 a later-marked finding is refused too',
                v_err LIKE 'PEST_FINDING_NEEDS_CORRECTIVE_TASK%', v_err);
  END;
END
$c$;


-- =====================================================================
--  D — a finding that does NOT need action
-- =====================================================================
DO $d$
DECLARE v_id uuid;
BEGIN
  --  FL-13's "Normal level · no action" row. A note is the right and
  --  sufficient disposition here, and the rule must not block it:
  --  three flies on a glue board is not a corrective action.
  INSERT INTO public.facility_pest_findings
    (company_id,visit_id,station_code,location_ref,finding,method_used,
     needs_action,disposition_note,created_by)
  VALUES ('00000000-0000-7b03-a000-000000000001','00000000-0000-7b03-f000-000000000001',
          'ILT-02','PC Packing hall','3 flies on glue board','Board replaced',
          false,'Normal level · no action',auth.uid())
  RETURNING id INTO v_id;

  UPDATE public.facility_pest_findings
     SET resolved_at = now(), resolved_by = auth.uid(),
         resolution_note = 'Within the normal range for this station.'
   WHERE id = v_id;

  PERFORM _sk('D','D1 an ordinary finding CAN be closed with a note',
    (SELECT resolved_at IS NOT NULL FROM public.facility_pest_findings WHERE id = v_id));

  --  D2: the disposition is free text, not an enum. FL-13 shows
  --  "Normal level · no action" and "Watch at next visit", and
  --  constraining to what one screen draws would invent a rule.
  UPDATE public.facility_pest_findings
     SET disposition_note = 'Watch at next visit' WHERE id = v_id;
  PERFORM _sk('D','D2 any disposition note is accepted',
    (SELECT disposition_note = 'Watch at next visit'
       FROM public.facility_pest_findings WHERE id = v_id));

  --  D3: blank station codes and blank findings are refused — a row
  --  that names neither a place nor an observation records nothing.
  BEGIN
    INSERT INTO public.facility_pest_findings
      (company_id,visit_id,station_code,finding,created_by)
    VALUES ('00000000-0000-7b03-a000-000000000001','00000000-0000-7b03-f000-000000000001',
            '   ','something',auth.uid());
    PERFORM _sk('D','D3 a blank station code is refused', false, 'the insert succeeded');
  EXCEPTION WHEN check_violation THEN
    PERFORM _sk('D','D3 a blank station code is refused', true, SQLSTATE);
  END;
END
$d$;


-- =====================================================================
--  E — cross-tenant
-- =====================================================================
DO $e$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM public.facility_pest_providers
   WHERE company_id = '00000000-0000-7b03-a000-000000000002';
  PERFORM _sk('E','E1 sees none of the other company''s providers', n = 0, n||' row(s)');

  SELECT count(*) INTO n FROM public.facility_pest_findings
   WHERE company_id = '00000000-0000-7b03-a000-000000000002';
  PERFORM _sk('E','E2 sees none of the other company''s findings', n = 0, n||' row(s)');

  --  The silent-filter case: RLS removes the row before the UPDATE
  --  sees it, so the statement succeeds having changed nothing. The
  --  assertion has to be on ROW_COUNT.
  UPDATE public.facility_pest_visits SET technician_name = 'Injected'
   WHERE id = '00000000-0000-7b03-f000-000000000002';
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM _sk('E','E3 updating another company''s visit changes no row', n = 0, n||' row(s)');
END
$e$;


-- =====================================================================
--  F — the register function
-- =====================================================================
DO $f$
DECLARE r record; n integer;
BEGIN
  PERFORM _sk('F','F1 is SECURITY INVOKER',
    (SELECT NOT prosecdef FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
      WHERE ns.nspname='public' AND p.proname='facility_pest_register'));

  SELECT * INTO r FROM public.facility_pest_register(
    '00000000-0000-7b03-a000-000000000001') LIMIT 1;
  PERFORM _sk('F','F2 returns the visit with its provider',
              r.reference = 'PC-2026-0019' AND r.provider_name = 'PC Greenshield Ltd',
              coalesce(r.reference,'null')||' / '||coalesce(r.provider_name,'null'));

  PERFORM _sk('F','F3 carries the contract details FL-13''s header prints',
              r.visit_frequency = 'Fortnightly visits' AND r.contract_until = '2027-03-31',
              coalesce(r.visit_frequency,'null'));

  --  The badge count: marked as needing action AND still open.
  --
  --  Compared against a direct count rather than a hardcoded number,
  --  so adding a case to section C cannot silently invalidate this
  --  assertion — which is exactly what happened once while these
  --  tests were being written.
  SELECT count(*) INTO n FROM public.facility_pest_findings f
   WHERE f.visit_id = r.visit_id AND f.needs_action AND f.resolved_at IS NULL;
  PERFORM _sk('F','F4 counts only findings still needing action',
              r.open_action_count = n,
              'register said '||coalesce(r.open_action_count::text,'null')
              ||', direct count '||n);

  --  And it is not simply counting everything: closed and
  --  no-action-needed findings exist on this visit, so an equal
  --  total would mean the FILTER was doing nothing.
  PERFORM _sk('F','F4b the open count is not just the total',
              r.open_action_count < r.finding_count,
              coalesce(r.open_action_count::text,'null')||' of '
              ||coalesce(r.finding_count::text,'null'));

  PERFORM _sk('F','F5 counts every finding on the visit',
              r.finding_count >= 6, 'got '||coalesce(r.finding_count::text,'null'));

  SELECT count(*) INTO n FROM public.facility_pest_register(
    '00000000-0000-7b03-a000-000000000002');
  PERFORM _sk('F','F6 returns nothing for another company', n = 0, n||' row(s)');
END
$f$;


-- =====================================================================
--  G — attributability
-- =====================================================================
DO $g$
BEGIN
  --  A timestamp with no person is not attributable, and a person
  --  with no timestamp is not a record of when. Both halves or
  --  neither, enforced by CHECK rather than by the client.
  BEGIN
    UPDATE public.facility_pest_visits SET checked_at = now()
     WHERE id = '00000000-0000-7b03-f000-000000000001';
    PERFORM _sk('G','G1 a check timestamp needs the person who made it',
                false, 'the update succeeded');
  EXCEPTION WHEN check_violation THEN
    PERFORM _sk('G','G1 a check timestamp needs the person who made it', true, SQLSTATE);
  END;

  UPDATE public.facility_pest_visits
     SET checked_by = auth.uid(), checked_at = now()
   WHERE id = '00000000-0000-7b03-f000-000000000001';
  PERFORM _sk('G','G2 both halves together are accepted',
    (SELECT checked_by IS NOT NULL AND checked_at IS NOT NULL
       FROM public.facility_pest_visits WHERE id='00000000-0000-7b03-f000-000000000001'));

  BEGIN
    INSERT INTO public.facility_pest_findings
      (company_id,visit_id,station_code,finding,resolved_at,created_by)
    VALUES ('00000000-0000-7b03-a000-000000000001','00000000-0000-7b03-f000-000000000001',
            'BS-44','x',now(),auth.uid());
    PERFORM _sk('G','G3 a resolution needs the person who made it',
                false, 'the insert succeeded');
  EXCEPTION WHEN check_violation THEN
    PERFORM _sk('G','G3 a resolution needs the person who made it', true, SQLSTATE);
  END;
END
$g$;

RESET ROLE;
SELECT set_config('request.jwt.claims','',false);


\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo '  FACILITY LOGS, PART 4 — PEST CONTROL'
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
  IF f > 0 THEN RAISE EXCEPTION 'PEST CONTROL: % assertion(s) failed', f; END IF;
  RAISE NOTICE 'PEST CONTROL: all assertions passed';
END
$v$;
