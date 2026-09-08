-- =====================================================================
--  LICENCE LIFECYCLE — INTEGRATION TESTS  (Deliverable 06)
--  LOCAL / DISPOSABLE DATABASE ONLY
-- =====================================================================
--  Covers 20260921000000_licence_lifecycle.sql.
--
--  The cases are written against the failure modes the brief names as
--  disqualifying: alerts that are only a computed view, a 12-month alert
--  that does not open the checklist, an approval logged as one lump, a
--  block message that does not say which licence expired when, and
--  variations treated as an edit to the parent record.
--
--  Three companies are used so that the alert generator — which is
--  company-wide by design — can be counted exactly in each section
--  without one section's fixtures polluting another's.
--
--  Run:  psql "<local url>" -f supabase/tests/licence_lifecycle_test.sql
-- =====================================================================

\set ON_ERROR_STOP off

DO $guard$
BEGIN
  IF current_database() NOT IN ('postgres','criateur_local') THEN
    RAISE EXCEPTION 'REFUSING TO RUN outside a local database (got %)', current_database();
  END IF;
  IF to_regprocedure('public.licence_record_approval(uuid,text,date,date,boolean)') IS NULL THEN
    RAISE EXCEPTION 'Migration 20260921000000 has not been applied to this database.';
  END IF;
END $guard$;

DROP TABLE IF EXISTS lic_results;
CREATE TEMP TABLE lic_results(seq serial, id text, name text, verdict text, detail text);
GRANT ALL ON lic_results TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE lic_results_seq_seq TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION lic_assert(p_id text, p_name text, p_cond boolean, p_detail text DEFAULT '')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO lic_results(id,name,verdict,detail)
  VALUES (p_id,p_name,CASE WHEN p_cond THEN 'PASS' ELSE 'FAIL' END,p_detail);
END $$;

-- ── fixtures ─────────────────────────────────────────────────────────
DO $fx$
DECLARE
  ca uuid := '00000000-0000-7500-a000-00000000000a';   -- cascade / variations
  cb uuid := '00000000-0000-7500-a000-00000000000b';   -- alerts / templates
  cc uuid := '00000000-0000-7500-a000-00000000000c';   -- batch gates
  ua uuid := '00000000-0000-7500-b000-000000000001';   -- admin
  up uuid := '00000000-0000-7500-b000-000000000002';   -- production
BEGIN
  INSERT INTO public.companies(id,name) VALUES
    (ca,'LIC Alpha'), (cb,'LIC Bravo'), (cc,'LIC Charlie') ON CONFLICT (id) DO NOTHING;

  INSERT INTO auth.users(id,email) VALUES
    (ua,'lic-a@local.test'), (up,'lic-p@local.test') ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.profiles(id,email,full_name,role,company_id) VALUES
    (ua,'lic-a@local.test','Ada Admin','admin',ca),
    (up,'lic-p@local.test','Pat Production','content_creator',ca)
    ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.company_members(company_id,user_id,role,status) VALUES
    (ca,ua,'owner','active'), (cb,ua,'owner','active'), (cc,ua,'owner','active'),
    (ca,up,'production','active')
    ON CONFLICT DO NOTHING;

  -- ── company A: a product on its way to registration ───────────────
  INSERT INTO public.products
    (id,company_id,product_code,trade_name,category,manufacturing_type,created_by)
  VALUES ('00000000-0000-7500-c000-000000000001',ca,'LIC-PRD-001','Alpha Syrup',
          'drug_pharmaceutical','in_house',ua);

  --  A draft licence for it, to be granted through the cascade.
  INSERT INTO public.regulatory_licences
    (id,company_id,licence_type,name,product_name,product_id,regulatory_body,created_by)
  VALUES ('00000000-0000-7500-d000-000000000001',ca,'nafdac_product_registration',
          'Alpha Syrup Registration','Alpha Syrup','00000000-0000-7500-c000-000000000001',
          'nafdac',ua);

  -- ── company B: a licence five months from expiry ──────────────────
  --  Five months, deliberately: the 12- and 6-month milestones have
  --  been reached, the 3-month one has not. That is what makes the
  --  count in section B mean something.
  INSERT INTO public.products
    (id,company_id,product_code,trade_name,category,manufacturing_type,created_by)
  VALUES ('00000000-0000-7500-c000-000000000002',cb,'LIC-PRD-002','Bravo Tablets',
          'drug_pharmaceutical','in_house',ua);

  INSERT INTO public.regulatory_licences
    (id,company_id,licence_type,name,product_name,product_id,registration_number,
     regulatory_body,issue_date,expiry_date,created_by)
  VALUES ('00000000-0000-7500-d000-000000000002',cb,'nafdac_product_registration',
          'Bravo Tablets Registration','Bravo Tablets','00000000-0000-7500-c000-000000000002',
          'A4-1234','nafdac',current_date - 700, (current_date + interval '5 months')::date, ua);

  --  …and one belonging to a discontinued product.
  INSERT INTO public.products
    (id,company_id,product_code,trade_name,category,manufacturing_type,created_by)
  VALUES ('00000000-0000-7500-c000-000000000003',cb,'LIC-PRD-003','Bravo Legacy',
          'food','in_house',ua);

  --  15 months out, deliberately: no milestone has been reached, so
  --  section D can prove suppression by generating alerts at a future
  --  as-of date rather than by deleting rows it raised itself.
  INSERT INTO public.regulatory_licences
    (id,company_id,licence_type,name,product_name,product_id,registration_number,
     regulatory_body,expiry_date,created_by)
  VALUES ('00000000-0000-7500-d000-000000000003',cb,'nafdac_product_registration',
          'Bravo Legacy Registration','Bravo Legacy','00000000-0000-7500-c000-000000000003',
          'A4-9999','nafdac',(current_date + interval '15 months')::date, ua);

  --  a third company-B licence, discontinued in section D
  INSERT INTO public.regulatory_licences
    (id,company_id,licence_type,name,registration_number,regulatory_body,expiry_date,created_by)
  VALUES ('00000000-0000-7500-d000-000000000004',cb,'nafdac_gmp_certificate',
          'Bravo Site GMP','GMP-77','nafdac',(current_date + interval '4 months')::date, ua);

  --  …and a fourth, reserved for the template-override case. Also 15
  --  months out so the generator never instantiates the system template
  --  against it first.
  INSERT INTO public.regulatory_licences
    (id,company_id,licence_type,name,registration_number,regulatory_body,expiry_date,created_by)
  VALUES ('00000000-0000-7500-d000-000000000007',cb,'nafdac_import_permit',
          'Bravo Import Permit','IMP-12','nafdac',(current_date + interval '15 months')::date, ua);

  -- ── company C: an expired licence and a valid one ─────────────────
  INSERT INTO public.products
    (id,company_id,product_code,trade_name,category,manufacturing_type,
     status,created_by)
  VALUES ('00000000-0000-7500-c000-000000000004',cc,'LIC-PRD-004','Charlie Cream',
          'cosmetic','in_house','development',ua),
         ('00000000-0000-7500-c000-000000000005',cc,'LIC-PRD-005','Charlie Balm',
          'cosmetic','in_house','development',ua),
         ('00000000-0000-7500-c000-000000000006',cc,'LIC-PRD-006','Charlie Unlicensed',
          'cosmetic','in_house','development',ua);

  INSERT INTO public.regulatory_licences
    (id,company_id,licence_type,name,product_id,registration_number,
     regulatory_body,expiry_date,created_by)
  VALUES
    ('00000000-0000-7500-d000-000000000005',cc,'nafdac_product_registration',
     'Charlie Cream Registration','00000000-0000-7500-c000-000000000004',
     'C4-0001','nafdac',(current_date - interval '10 days')::date, ua),
    ('00000000-0000-7500-d000-000000000006',cc,'nafdac_product_registration',
     'Charlie Balm Registration','00000000-0000-7500-c000-000000000005',
     'C4-0002','nafdac',(current_date + interval '2 years')::date, ua);

  --  Company C's licences have to be granted and, for the Cream, lapsed
  --  — a draft row is a certificate being prepared, and section F is
  --  about certificates that lapsed after being granted.
  PERFORM public.lifecycle_transition('regulatory_licence','00000000-0000-7500-d000-000000000005',
    'grant_licence',cc,ua,'fixture grant','{}'::jsonb);
  PERFORM public.lifecycle_transition('regulatory_licence','00000000-0000-7500-d000-000000000005',
    'lapse',cc,ua,'fixture lapse','{}'::jsonb);
  PERFORM public.lifecycle_transition('regulatory_licence','00000000-0000-7500-d000-000000000006',
    'grant_licence',cc,ua,'fixture grant','{}'::jsonb);
END $fx$;

--  The fixtures above ran as the migration user. Everything from here
--  runs as the application role, because role enforcement and RLS are
--  part of what is being tested.
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-7500-b000-000000000001","role":"authenticated"}', false);


-- =====================================================================
--  A — the licence is a lifecycle entity, not a date with a label
-- =====================================================================
DO $a$
DECLARE n int; v_term boolean; v_status text;
BEGIN
  SELECT count(*) INTO n FROM public.lifecycle_states s
    JOIN public.lifecycle_definitions d ON d.id = s.definition_id
   WHERE d.entity_type = 'regulatory_licence';
  PERFORM lic_assert('A1','regulatory_licence is a lifecycle entity', n = 8, n||' state(s)');

  SELECT count(*) INTO n FROM public.lifecycle_states s
    JOIN public.lifecycle_definitions d ON d.id = s.definition_id
   WHERE d.entity_type = 'regulatory_licence'
     AND s.state_key IN ('renewal_due','renewal_in_progress');
  PERFORM lic_assert('A2','renewal_due and renewal_in_progress are lifecycle states', n = 2, n||'');

  PERFORM lic_assert('A3','a licence is initialised into the engine on insert',
    EXISTS (SELECT 1 FROM public.entity_current_state
             WHERE entity_type='regulatory_licence'
               AND entity_id='00000000-0000-7500-d000-000000000001'));

  SELECT s.is_terminal INTO v_term FROM public.lifecycle_states s
    JOIN public.lifecycle_definitions d ON d.id = s.definition_id
   WHERE d.entity_type='regulatory_licence' AND s.state_key='renewed';
  PERFORM lic_assert('A4','renewed is terminal — a superseded certificate cannot move again',
    v_term, coalesce(v_term::text,'NULL'));

  SELECT s.is_terminal INTO v_term FROM public.lifecycle_states s
    JOIN public.lifecycle_definitions d ON d.id = s.definition_id
   WHERE d.entity_type='regulatory_licence' AND s.state_key='discontinued';
  PERFORM lic_assert('A5','discontinued is terminal', v_term, coalesce(v_term::text,'NULL'));

  --  A new licence row is a certificate being prepared, not a granted
  --  one. Starting it anywhere but draft would record a grant nobody
  --  made.
  SELECT status INTO v_status FROM public.regulatory_licences
   WHERE id='00000000-0000-7500-d000-000000000002';
  PERFORM lic_assert('A6','a newly created licence starts in draft, not silently active',
    v_status = 'draft', coalesce(v_status,'NULL'));

  --  …and the migration's backfill left nothing behind: every licence
  --  in the database, including those that predate the engine, has a
  --  current state.
  SELECT count(*) INTO n FROM public.regulatory_licences l
   WHERE NOT EXISTS (SELECT 1 FROM public.entity_current_state ecs
                      WHERE ecs.entity_type='regulatory_licence' AND ecs.entity_id = l.id);
  PERFORM lic_assert('A7','no licence is left outside the engine', n = 0, n||' orphan(s)');
END $a$;

SET ROLE authenticated;
DO $a2$
DECLARE v_ok boolean := false; v_msg text;
BEGIN
  BEGIN
    UPDATE public.regulatory_licences SET status = 'active'
     WHERE id = '00000000-0000-7500-d000-000000000001';
    v_msg := 'DIRECT STATUS WRITE ACCEPTED';
  EXCEPTION WHEN others THEN
    v_ok := SQLERRM LIKE 'LICENCE_STATUS_READ_ONLY%'; v_msg := SQLERRM;
  END;
  PERFORM lic_assert('A8','licence status cannot be written directly', v_ok, left(v_msg,90));
END $a2$;
RESET ROLE;


-- =====================================================================
--  B — 12 / 6 / 3 then monthly, and configurable
-- =====================================================================
SET ROLE authenticated;
DO $b$
DECLARE m integer[]; r jsonb; n int;
BEGIN
  m := public.licence_alert_milestones('00000000-0000-7500-a000-00000000000b');
  PERFORM lic_assert('B1','the default schedule is 12, 6, 3, then monthly',
    m = ARRAY[12,6,3,2,1,0], array_to_string(m,','));

  --  Company B is moved onto its own schedule, then back, so the rest
  --  of the section runs on the default.
  INSERT INTO public.licence_renewal_policies(company_id, alert_months, monthly_from_month)
  VALUES ('00000000-0000-7500-a000-00000000000b', ARRAY[18,9], 2)
  ON CONFLICT (company_id) DO UPDATE SET alert_months = EXCLUDED.alert_months,
                                         monthly_from_month = EXCLUDED.monthly_from_month;
  m := public.licence_alert_milestones('00000000-0000-7500-a000-00000000000b');
  PERFORM lic_assert('B2','a company can set its own milestones',
    m = ARRAY[18,9,1,0], array_to_string(m,','));

  DELETE FROM public.licence_renewal_policies
   WHERE company_id = '00000000-0000-7500-a000-00000000000b';
  m := public.licence_alert_milestones('00000000-0000-7500-a000-00000000000b');
  PERFORM lic_assert('B3','removing the policy restores the defaults',
    m = ARRAY[12,6,3,2,1,0], array_to_string(m,','));
END $b$;

--  Company B's licences need to be active before renewal_due can be
--  reached; the fixture inserted them in draft.
DO $b_grant$
DECLARE l uuid;
BEGIN
  FOR l IN SELECT id FROM public.regulatory_licences
            WHERE company_id='00000000-0000-7500-a000-00000000000b'
              AND status='draft' LOOP
    PERFORM public.lifecycle_transition('regulatory_licence', l, 'grant_licence',
      '00000000-0000-7500-a000-00000000000b', NULL, 'fixture grant', '{}'::jsonb);
  END LOOP;
END $b_grant$;

DO $b2$
DECLARE r jsonb; n int; n2 int; v_ms int[];
BEGIN
  r := public.licence_generate_renewal_alerts('00000000-0000-7500-a000-00000000000b');

  SELECT array_agg(milestone_months ORDER BY milestone_months DESC) INTO v_ms
    FROM public.licence_renewal_alerts
   WHERE licence_id = '00000000-0000-7500-d000-000000000002';
  PERFORM lic_assert('B4','a licence 5 months out has reached the 12- and 6-month milestones only',
    v_ms = ARRAY[12,6], coalesce(array_to_string(v_ms,','),'none'));

  SELECT count(*) INTO n FROM public.licence_renewal_alerts
   WHERE company_id = '00000000-0000-7500-a000-00000000000b';

  --  Idempotence is the property that lets this be scheduled.
  r := public.licence_generate_renewal_alerts('00000000-0000-7500-a000-00000000000b');
  SELECT count(*) INTO n2 FROM public.licence_renewal_alerts
   WHERE company_id = '00000000-0000-7500-a000-00000000000b';
  PERFORM lic_assert('B5','re-running the generator raises nothing new',
    n = n2 AND (r ->> 'alerts_created') = '0', n||' -> '||n2);

  PERFORM lic_assert('B6','an alert is a stored row with a raised_at, not a computed view',
    EXISTS (SELECT 1 FROM public.licence_renewal_alerts
             WHERE licence_id='00000000-0000-7500-d000-000000000002'
               AND raised_at IS NOT NULL AND acknowledged_at IS NULL));

  PERFORM lic_assert('B7','the alert records the expiry cycle it was raised against',
    EXISTS (SELECT 1 FROM public.licence_renewal_alerts a
             JOIN public.regulatory_licences l ON l.id = a.licence_id
            WHERE a.licence_id='00000000-0000-7500-d000-000000000002'
              AND a.renewal_cycle_expiry = l.expiry_date));
END $b2$;
RESET ROLE;


-- =====================================================================
--  C — the first milestone opens the 12-step renewal checklist
-- =====================================================================
SET ROLE authenticated;
DO $c$
DECLARE n int; v_title text; v_deadline date; v_expiry date; v_status text;
BEGIN
  SELECT count(*) INTO n FROM public.licence_renewal_task_templates
   WHERE company_id IS NULL AND template_key = 'nafdac_2026';
  PERFORM lic_assert('C1','the shipped renewal template has exactly 12 steps', n = 12, n||'');

  SELECT title INTO v_title FROM public.licence_renewal_task_templates
   WHERE company_id IS NULL AND template_key='nafdac_2026' AND step_no = 1;
  PERFORM lic_assert('C2','step 1 is the Power of Attorney step',
    v_title = 'Obtain current Power of Attorney (PoA)', coalesce(v_title,'NULL'));

  SELECT title INTO v_title FROM public.licence_renewal_task_templates
   WHERE company_id IS NULL AND template_key='nafdac_2026' AND step_no = 12;
  PERFORM lic_assert('C3','step 12 is collecting the renewed certificate',
    v_title = 'Receive renewed certificate / track status', coalesce(v_title,'NULL'));

  --  The point of the deliverable: the alert did this, not a person.
  SELECT count(*) INTO n FROM public.licence_renewal_steps
   WHERE licence_id = '00000000-0000-7500-d000-000000000002';
  PERFORM lic_assert('C4','the 12-month alert instantiated all 12 steps', n = 12, n||'');

  SELECT expiry_date INTO v_expiry FROM public.regulatory_licences
   WHERE id='00000000-0000-7500-d000-000000000002';
  SELECT deadline INTO v_deadline FROM public.licence_renewal_steps
   WHERE licence_id='00000000-0000-7500-d000-000000000002' AND step_no = 1;
  PERFORM lic_assert('C5','step deadlines are derived from the expiry date',
    v_deadline = (v_expiry - 180), coalesce(v_deadline::text,'NULL')||' vs '||(v_expiry-180)::text);

  PERFORM lic_assert('C6','the steps are keyed to the current renewal cycle',
    EXISTS (SELECT 1 FROM public.licence_renewal_steps
             WHERE licence_id='00000000-0000-7500-d000-000000000002'
               AND renewal_cycle_expiry = v_expiry));

  --  …and the licence moved, so "renewal due" is a state and not an
  --  inference somebody re-derives from a date each time.
  SELECT status INTO v_status FROM public.regulatory_licences
   WHERE id='00000000-0000-7500-d000-000000000002';
  PERFORM lic_assert('C7','the licence moved to renewal_due',
    v_status = 'renewal_due', coalesce(v_status,'NULL'));

  SELECT count(*) INTO n FROM public.entity_state_history
   WHERE entity_type='regulatory_licence'
     AND entity_id='00000000-0000-7500-d000-000000000002';
  PERFORM lic_assert('C8','the move is in the engine history, not just the mirror', n >= 2, n||' row(s)');

  --  Re-running must not duplicate a half-completed checklist.
  n := public.licence_generate_renewal_steps('00000000-0000-7500-d000-000000000002');
  PERFORM lic_assert('C9','regenerating the checklist adds nothing', n = 0, n||' created');
END $c$;

--  A company template replaces the system one whole, rather than
--  merging into a checklist nobody wrote.
DO $c2$
DECLARE n int; v_title text;
BEGIN
  --  Licence …0007 is 15 months out, so no milestone has fired against
  --  it and no system-template steps exist to mask the override.
  SELECT count(*) INTO n FROM public.licence_renewal_steps
   WHERE licence_id='00000000-0000-7500-d000-000000000007';
  PERFORM lic_assert('C10','the override fixture starts with no steps', n = 0, n||'');

  INSERT INTO public.licence_renewal_task_templates
    (company_id, template_key, step_no, title, description, months_before)
  VALUES ('00000000-0000-7500-a000-00000000000b','nafdac_2026',1,
          'Bravo house step','company override',2)
  ON CONFLICT DO NOTHING;

  PERFORM public.licence_generate_renewal_steps('00000000-0000-7500-d000-000000000007');
  SELECT count(*) INTO n FROM public.licence_renewal_steps
   WHERE licence_id='00000000-0000-7500-d000-000000000007';
  PERFORM lic_assert('C11','a company template replaces the system one wholesale', n = 1, n||' step(s)');

  SELECT title INTO v_title FROM public.licence_renewal_steps
   WHERE licence_id='00000000-0000-7500-d000-000000000007' AND step_no = 1;
  PERFORM lic_assert('C12','the company step is the one instantiated',
    v_title = 'Bravo house step', coalesce(v_title,'NULL'));

  DELETE FROM public.licence_renewal_task_templates
   WHERE company_id = '00000000-0000-7500-a000-00000000000b';
END $c2$;
RESET ROLE;


-- =====================================================================
--  D — discontinued products and licences stop generating noise
-- =====================================================================
SET ROLE authenticated;
DO $d$
DECLARE v_reason text; n_before int; n_after int; r jsonb;
BEGIN
  --  Discontinue the product behind licence …0003.
  PERFORM public.lifecycle_transition('product','00000000-0000-7500-c000-000000000003',
    'abandon','00000000-0000-7500-a000-00000000000b', NULL,
    'end of life', '{}'::jsonb);

  v_reason := public.licence_alerting_suppressed('00000000-0000-7500-d000-000000000003');
  PERFORM lic_assert('D1','a licence on a discontinued product is suppressed, and says why',
    v_reason = 'product is discontinued', coalesce(v_reason,'NOT SUPPRESSED'));

  --  Licence …0003 expires in 15 months, so nothing has fired for it
  --  yet. Running the generator at a date past its 12-month milestone
  --  is the honest test: alerts WOULD be due, and none are raised.
  --  (Deleting rows the suite raised itself would prove nothing, and
  --  alerts are not deletable by an application user anyway.)
  SELECT count(*) INTO n_before FROM public.licence_renewal_alerts
   WHERE licence_id = '00000000-0000-7500-d000-000000000003';
  r := public.licence_generate_renewal_alerts('00000000-0000-7500-a000-00000000000b',
        (current_date + interval '100 days')::date);
  SELECT count(*) INTO n_after FROM public.licence_renewal_alerts
   WHERE licence_id = '00000000-0000-7500-d000-000000000003';
  PERFORM lic_assert('D2','no alerts are raised for it even once a milestone is due',
    n_before = 0 AND n_after = 0, n_before||' -> '||n_after);
  PERFORM lic_assert('D2b','the generator reports the suppression rather than hiding it',
    (r ->> 'licences_suppressed')::int >= 1, coalesce(r ->> 'licences_suppressed','NULL'));

  --  …and the suppression is configurable, not baked in.
  INSERT INTO public.licence_renewal_policies(company_id, suppress_when_discontinued)
  VALUES ('00000000-0000-7500-a000-00000000000b', false)
  ON CONFLICT (company_id) DO UPDATE SET suppress_when_discontinued = false;

  v_reason := public.licence_alerting_suppressed('00000000-0000-7500-d000-000000000003');
  PERFORM lic_assert('D3','a company may switch discontinued-suppression off',
    v_reason IS NULL, coalesce(v_reason,'not suppressed'));

  DELETE FROM public.licence_renewal_policies
   WHERE company_id = '00000000-0000-7500-a000-00000000000b';

  --  A discontinued LICENCE is suppressed whatever the policy says:
  --  there is nothing left to renew.
  PERFORM public.lifecycle_transition('regulatory_licence','00000000-0000-7500-d000-000000000004',
    'discontinue_from_renewal_due','00000000-0000-7500-a000-00000000000b', NULL,
    'site closed', '{}'::jsonb);
  v_reason := public.licence_alerting_suppressed('00000000-0000-7500-d000-000000000004');
  PERFORM lic_assert('D4','a discontinued licence is suppressed',
    v_reason = 'licence is discontinued', coalesce(v_reason,'NOT SUPPRESSED'));
END $d$;
RESET ROLE;


-- =====================================================================
--  E — the approval cascade, each step individually audit logged
-- =====================================================================
SET ROLE authenticated;
DO $e$
DECLARE
  r jsonb; n int; v_actions text[]; v_status text; v_expiry date;
  v_ok boolean := false; v_msg text;
BEGIN
  --  The product has to be with the regulator for the cascade to have
  --  anything to move it from.
  PERFORM public.lifecycle_transition('product','00000000-0000-7500-c000-000000000001',
    'start_regulatory_prep','00000000-0000-7500-a000-00000000000a',NULL,NULL,'{}'::jsonb);
  PERFORM public.lifecycle_transition('product','00000000-0000-7500-c000-000000000001',
    'submit_to_regulator','00000000-0000-7500-a000-00000000000a',NULL,NULL,'{}'::jsonb);

  r := public.licence_record_approval(
    '00000000-0000-7500-d000-000000000001', 'A4-5678',
    (current_date + interval '3 years')::date, current_date, true);

  PERFORM lic_assert('E1','the cascade reports all five steps',
    jsonb_array_length(r -> 'steps') = 5, jsonb_array_length(r -> 'steps')||'');

  SELECT array_agg(DISTINCT action ORDER BY action) INTO v_actions
    FROM public.audit_logs
   WHERE company_id = '00000000-0000-7500-a000-00000000000a'
     AND action LIKE 'licence.%' OR (company_id = '00000000-0000-7500-a000-00000000000a'
     AND action IN ('product.status_updated','production.notified'));
  PERFORM lic_assert('E2','each cascade action is its own audit entry',
    v_actions @> ARRAY['licence.approval_recorded','licence.registration_captured',
                       'licence.renewal_scheduled','product.status_updated','production.notified'],
    coalesce(array_to_string(v_actions,','),'none'));

  SELECT count(*) INTO n FROM public.audit_logs
   WHERE company_id = '00000000-0000-7500-a000-00000000000a';
  PERFORM lic_assert('E3','five audit rows, not one summary row', n = 5, n||' row(s)');

  --  Each row must extend the hash chain, or the audit trail is five
  --  unlinked assertions rather than evidence.
  SELECT count(*) INTO n FROM public.audit_logs a
   WHERE a.company_id = '00000000-0000-7500-a000-00000000000a'
     AND a.integrity_hash IS NOT NULL
     AND a.sequence_number IS NOT NULL;
  PERFORM lic_assert('E4','every cascade audit row is hash-chained', n = 5, n||'');

  SELECT count(*) INTO n FROM public.audit_logs a
   WHERE a.company_id = '00000000-0000-7500-a000-00000000000a'
     AND a.sequence_number > 1
     AND NOT EXISTS (SELECT 1 FROM public.audit_logs p
                      WHERE p.company_id = a.company_id
                        AND p.sequence_number = a.sequence_number - 1
                        AND p.integrity_hash = a.previous_hash);
  PERFORM lic_assert('E5','the chain links each row to the one before it', n = 0, n||' break(s)');

  -- registration and expiry captured
  SELECT registration_number, expiry_date INTO v_msg, v_expiry
    FROM public.regulatory_licences WHERE id='00000000-0000-7500-d000-000000000001';
  PERFORM lic_assert('E6','registration number and expiry are captured on the licence',
    v_msg = 'A4-5678' AND v_expiry = (current_date + interval '3 years')::date,
    coalesce(v_msg,'NULL')||' / '||coalesce(v_expiry::text,'NULL'));

  SELECT status INTO v_status FROM public.regulatory_licences
   WHERE id='00000000-0000-7500-d000-000000000001';
  PERFORM lic_assert('E7','the licence itself moved draft -> active',
    v_status = 'active', coalesce(v_status,'NULL'));

  -- the product followed
  SELECT status INTO v_status FROM public.products
   WHERE id='00000000-0000-7500-c000-000000000001';
  PERFORM lic_assert('E8','the product moved submitted -> registered',
    v_status = 'registered', coalesce(v_status,'NULL'));

  SELECT registration_expiry_date INTO v_expiry FROM public.products
   WHERE id='00000000-0000-7500-c000-000000000001';
  PERFORM lic_assert('E9','the product carries the registration expiry',
    v_expiry = (current_date + interval '3 years')::date, coalesce(v_expiry::text,'NULL'));

  -- the renewal schedule was opened
  SELECT count(*) INTO n FROM public.licence_renewal_alerts
   WHERE licence_id = '00000000-0000-7500-d000-000000000001';
  PERFORM lic_assert('E13','a three-year licence has no milestone due yet', n = 0, n||' alert(s)');

  PERFORM lic_assert('E14','the renewal schedule step is recorded even when nothing is due yet',
    EXISTS (SELECT 1 FROM public.audit_logs
             WHERE company_id='00000000-0000-7500-a000-00000000000a'
               AND action='licence.renewal_scheduled'));
END $e$;
RESET ROLE;

--  The notification assertions run unprivileged-free on purpose: the
--  policy on `notifications` is recipient_id = auth.uid(), so the admin
--  who triggered the cascade cannot see the row it sent to the
--  production user. Reading it as the admin would report zero and prove
--  only that RLS works.
DO $e_notify$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.notifications
   WHERE type = 'licence_granted' AND content_id = '00000000-0000-7500-d000-000000000001';
  PERFORM lic_assert('E10','production is notified', n = 1, n||' notification(s)');

  PERFORM lic_assert('E11','the notification names the licence and its expiry',
    EXISTS (SELECT 1 FROM public.notifications
             WHERE content_id='00000000-0000-7500-d000-000000000001'
               AND message LIKE '%A4-5678%' AND message LIKE '%expires on%'));

  --  It went to the production-role member and NOT to the admin who
  --  filed it — a notification everybody gets is one nobody reads.
  PERFORM lic_assert('E12','it went to the production-role member, not to everyone',
    EXISTS (SELECT 1 FROM public.notifications
             WHERE content_id='00000000-0000-7500-d000-000000000001'
               AND recipient_id='00000000-0000-7500-b000-000000000002')
    AND NOT EXISTS (SELECT 1 FROM public.notifications
             WHERE content_id='00000000-0000-7500-d000-000000000001'
               AND recipient_id='00000000-0000-7500-b000-000000000001'));

  PERFORM lic_assert('E12b','the audit row records who was notified and why',
    EXISTS (SELECT 1 FROM public.audit_logs
             WHERE action='production.notified'
               AND entity_id='00000000-0000-7500-d000-000000000001'
               AND (metadata ->> 'recipients') = '1'
               AND metadata ->> 'detail' LIKE '%production recipient%'));
END $e_notify$;
SET ROLE authenticated;

DO $e2$
DECLARE v_ok boolean := false; v_msg text;
BEGIN
  BEGIN
    PERFORM public.licence_record_approval('00000000-0000-7500-d000-000000000001',
      '   ', (current_date + interval '1 year')::date, current_date, false);
    v_msg := 'BLANK REGISTRATION ACCEPTED';
  EXCEPTION WHEN others THEN
    v_ok := SQLERRM LIKE 'LICENCE_REGISTRATION_REQUIRED%'; v_msg := SQLERRM;
  END;
  PERFORM lic_assert('E15','a grant without a registration number is refused', v_ok, left(v_msg,80));

  v_ok := false;
  BEGIN
    PERFORM public.licence_record_approval('00000000-0000-7500-d000-000000000001',
      'X-1', NULL, current_date, false);
    v_msg := 'MISSING EXPIRY ACCEPTED';
  EXCEPTION WHEN others THEN
    v_ok := SQLERRM LIKE 'LICENCE_EXPIRY_REQUIRED%'; v_msg := SQLERRM;
  END;
  PERFORM lic_assert('E16','a grant without an expiry date is refused', v_ok, left(v_msg,80));

  v_ok := false;
  BEGIN
    PERFORM public.licence_record_approval('00000000-0000-7500-d000-000000000001',
      'X-1', current_date - 1, current_date, false);
    v_msg := 'EXPIRY BEFORE ISSUE ACCEPTED';
  EXCEPTION WHEN others THEN
    v_ok := SQLERRM LIKE 'LICENCE_EXPIRY_BEFORE_ISSUE%'; v_msg := SQLERRM;
  END;
  PERFORM lic_assert('E17','an expiry that precedes the issue date is refused', v_ok, left(v_msg,80));
END $e2$;
RESET ROLE;


-- =====================================================================
--  F — an expired licence blocks batch initiation and batch release
-- =====================================================================
DO $f$
DECLARE v_reason text; v_ok boolean := false; v_msg text;
BEGIN
  v_reason := public.licence_block_reason('00000000-0000-7500-c000-000000000004','initiation');
  PERFORM lic_assert('F1','an expired licence blocks batch initiation',
    v_reason IS NOT NULL, coalesce(left(v_reason,110),'NOT BLOCKED'));

  PERFORM lic_assert('F2','the message names the licence',
    v_reason LIKE '%Charlie Cream Registration%', coalesce(left(v_reason,110),''));
  PERFORM lic_assert('F3','the message names the expiry date',
    v_reason LIKE '%'||(current_date - 10)::text||'%', coalesce(left(v_reason,110),''));
  PERFORM lic_assert('F4','the message names the renewal status',
    v_reason LIKE '%renewal status:%', coalesce(left(v_reason,110),''));

  v_reason := public.licence_block_reason('00000000-0000-7500-c000-000000000005','release');
  PERFORM lic_assert('F5','a valid licence does not block', v_reason IS NULL,
    coalesce(left(v_reason,80),'not blocked'));

  --  A product with no licence on file is the product registry's
  --  problem, not this gate's; two gates firing on one cause would hide
  --  whichever spoke second.
  v_reason := public.licence_block_reason('00000000-0000-7500-c000-000000000006','release');
  PERFORM lic_assert('F6','a product with no licence is left to the product gate',
    v_reason IS NULL, coalesce(left(v_reason,80),'not blocked'));

  v_ok := false;
  BEGIN
    INSERT INTO public.batch_records
      (id,company_id,batch_number,product_name,product_id,
       manufacturing_date,expiry_date,batch_size,created_by)
    VALUES ('00000000-0000-7500-e000-000000000001','00000000-0000-7500-a000-00000000000c',
            'BLOCKED-001','Charlie Cream','00000000-0000-7500-c000-000000000004',
            current_date, current_date + 365, 100,'00000000-0000-7500-b000-000000000001');
    v_msg := 'BATCH INITIATION ACCEPTED AGAINST AN EXPIRED LICENCE';
  EXCEPTION WHEN others THEN
    v_ok := SQLERRM LIKE 'LICENCE_EXPIRED%'; v_msg := SQLERRM;
  END;
  PERFORM lic_assert('F7','the database refuses the batch insert, not just the UI',
    v_ok, left(v_msg,110));

  --  A batch that was legitimately started under a valid licence must
  --  still be stopped at release once that licence lapses.
  INSERT INTO public.batch_records
    (id,company_id,batch_number,product_name,product_id,
     manufacturing_date,expiry_date,batch_size,created_by)
  VALUES ('00000000-0000-7500-e000-000000000002','00000000-0000-7500-a000-00000000000c',
          'VALID-001','Charlie Balm','00000000-0000-7500-c000-000000000005',
          current_date, current_date + 365, 100,'00000000-0000-7500-b000-000000000001');

  PERFORM set_config('app.lifecycle_licence_sync','',true);
  UPDATE public.regulatory_licences SET expiry_date = current_date - 1
   WHERE id = '00000000-0000-7500-d000-000000000006';

  v_ok := false;
  BEGIN
    UPDATE public.batch_records SET status = 'released'
     WHERE id = '00000000-0000-7500-e000-000000000002';
    v_msg := 'RELEASE ACCEPTED AGAINST AN EXPIRED LICENCE';
  EXCEPTION WHEN others THEN
    v_ok := SQLERRM LIKE 'LICENCE_EXPIRED%'; v_msg := SQLERRM;
  END;
  PERFORM lic_assert('F8','release is blocked once the licence has lapsed', v_ok, left(v_msg,110));
END $f$;


-- =====================================================================
--  G — the renewal-in-progress exception, per company
-- =====================================================================
DO $g$
DECLARE v_reason text; v_ok boolean := false; v_msg text;
BEGIN
  --  Somebody starts renewing the Charlie Cream registration.
  PERFORM public.lifecycle_transition('regulatory_licence','00000000-0000-7500-d000-000000000005',
    'begin_late_renewal','00000000-0000-7500-a000-00000000000c', NULL,
    'renewal filed with NAFDAC', '{}'::jsonb);

  v_reason := public.licence_block_reason('00000000-0000-7500-c000-000000000004','initiation');
  PERFORM lic_assert('G1','by default a renewal in progress does not unblock anything',
    v_reason IS NOT NULL, coalesce(left(v_reason,120),'NOT BLOCKED'));
  PERFORM lic_assert('G2','and the message says the exception is not enabled',
    v_reason LIKE '%renewal-in-progress exception%'
      AND v_reason LIKE '%renewal status: renewal in progress%',
    coalesce(left(v_reason,140),''));

  INSERT INTO public.licence_renewal_policies(company_id, renewal_exception_allows_initiation)
  VALUES ('00000000-0000-7500-a000-00000000000c', true)
  ON CONFLICT (company_id) DO UPDATE SET renewal_exception_allows_initiation = true;

  v_reason := public.licence_block_reason('00000000-0000-7500-c000-000000000004','initiation');
  PERFORM lic_assert('G3','a company may permit initiation during renewal',
    v_reason IS NULL, coalesce(left(v_reason,100),'not blocked'));

  --  The two permissions are independent on purpose: starting a batch
  --  you may not be able to sell is a commercial decision; releasing one
  --  against a lapsed registration is a regulatory offence.
  v_reason := public.licence_block_reason('00000000-0000-7500-c000-000000000004','release');
  PERFORM lic_assert('G4','permitting initiation does not permit release',
    v_reason IS NOT NULL, coalesce(left(v_reason,100),'NOT BLOCKED'));

  UPDATE public.licence_renewal_policies SET renewal_exception_allows_release = true
   WHERE company_id = '00000000-0000-7500-a000-00000000000c';
  v_reason := public.licence_block_reason('00000000-0000-7500-c000-000000000004','release');
  PERFORM lic_assert('G5','release can be permitted separately',
    v_reason IS NULL, coalesce(left(v_reason,100),'not blocked'));

  --  the gate honours the exception, not just the reporting function
  v_ok := false;
  BEGIN
    INSERT INTO public.batch_records
      (id,company_id,batch_number,product_name,product_id,
       manufacturing_date,expiry_date,batch_size,created_by)
    VALUES ('00000000-0000-7500-e000-000000000003','00000000-0000-7500-a000-00000000000c',
            'EXCEPT-001','Charlie Cream','00000000-0000-7500-c000-000000000004',
            current_date, current_date + 365, 100,'00000000-0000-7500-b000-000000000001');
    v_ok := true; v_msg := 'accepted';
  EXCEPTION WHEN others THEN v_msg := SQLERRM;
  END;
  PERFORM lic_assert('G6','the batch gate honours the exception too', v_ok, left(v_msg,100));

  DELETE FROM public.licence_renewal_policies
   WHERE company_id = '00000000-0000-7500-a000-00000000000c';

  v_reason := public.licence_block_reason('00000000-0000-7500-c000-000000000004','initiation');
  PERFORM lic_assert('G7','removing the policy restores the strict default',
    v_reason IS NOT NULL, coalesce(left(v_reason,100),'NOT BLOCKED'));
END $g$;


-- =====================================================================
--  H — variations are their own record type, with their own lifecycle
-- =====================================================================
SET ROLE authenticated;
DO $h$
DECLARE n int; v_ok boolean := false; v_msg text; v_status text;
BEGIN
  SELECT count(*) INTO n FROM public.lifecycle_states s
    JOIN public.lifecycle_definitions d ON d.id = s.definition_id
   WHERE d.entity_type = 'licence_variation';
  PERFORM lic_assert('H1','licence_variation is a lifecycle entity of its own', n = 8, n||' state(s)');

  --  minor
  INSERT INTO public.licence_variations
    (id, company_id, licence_id, product_id, variation_class, variation_type,
     title, description, created_by)
  VALUES ('00000000-0000-7500-f000-000000000001','00000000-0000-7500-a000-00000000000a',
          '00000000-0000-7500-d000-000000000001','00000000-0000-7500-c000-000000000001',
          'minor','pack_size','Add 200ml pack','New secondary pack size',
          '00000000-0000-7500-b000-000000000001');

  PERFORM lic_assert('H2','a variation is linked to the parent registration',
    EXISTS (SELECT 1 FROM public.licence_variations v
             JOIN public.regulatory_licences l ON l.id = v.licence_id
            WHERE v.id='00000000-0000-7500-f000-000000000001'
              AND l.id='00000000-0000-7500-d000-000000000001'));

  PERFORM lic_assert('H3','it is initialised into the engine on insert',
    EXISTS (SELECT 1 FROM public.entity_current_state
             WHERE entity_type='licence_variation'
               AND entity_id='00000000-0000-7500-f000-000000000001'));

  --  Classification is not a free choice.
  BEGIN
    INSERT INTO public.licence_variations
      (id, company_id, licence_id, variation_class, variation_type, title, created_by)
    VALUES ('00000000-0000-7500-f000-000000000009','00000000-0000-7500-a000-00000000000a',
            '00000000-0000-7500-d000-000000000001','minor','manufacturing_site_change',
            'Move the site quietly','00000000-0000-7500-b000-000000000001');
    v_msg := 'SITE CHANGE ACCEPTED AS A MINOR VARIATION';
  EXCEPTION WHEN others THEN
    v_ok := SQLERRM LIKE 'VARIATION_CLASS_TOO_LOW%'; v_msg := SQLERRM;
  END;
  PERFORM lic_assert('H4','a site change cannot be filed as a minor variation', v_ok, left(v_msg,100));

  PERFORM lic_assert('H5','a minor-by-default type may still be escalated to major',
    public.licence_variation_minimum_class('pack_size') = 'minor'
    AND public.licence_variation_minimum_class('api_source_change') = 'major');
END $h$;

DO $h2$
DECLARE v_ok boolean := false; v_msg text; v_status text; r jsonb;
BEGIN
  BEGIN
    UPDATE public.licence_variations SET status='approved'
     WHERE id='00000000-0000-7500-f000-000000000001';
    v_msg := 'DIRECT STATUS WRITE ACCEPTED';
  EXCEPTION WHEN others THEN
    v_ok := SQLERRM LIKE 'VARIATION_STATUS_READ_ONLY%'; v_msg := SQLERRM;
  END;
  PERFORM lic_assert('H6','variation status is derived, not writable', v_ok, left(v_msg,90));

  PERFORM public.lifecycle_transition('licence_variation','00000000-0000-7500-f000-000000000001',
    'submit','00000000-0000-7500-a000-00000000000a',NULL,NULL,'{}'::jsonb);
  PERFORM public.lifecycle_transition('licence_variation','00000000-0000-7500-f000-000000000001',
    'begin_review','00000000-0000-7500-a000-00000000000a',NULL,NULL,'{}'::jsonb);

  SELECT status, submitted_date IS NOT NULL INTO v_status, v_ok
    FROM public.licence_variations WHERE id='00000000-0000-7500-f000-000000000001';
  PERFORM lic_assert('H7','the engine drives the variation status mirror',
    v_status = 'under_review' AND v_ok, coalesce(v_status,'NULL'));

  --  a minor variation approves on the strength of the review alone
  r := public.licence_variation_approve('00000000-0000-7500-f000-000000000001',
        'Pack size accepted by NAFDAC', NULL);
  SELECT status INTO v_status FROM public.licence_variations
   WHERE id='00000000-0000-7500-f000-000000000001';
  PERFORM lic_assert('H8','a minor variation can be approved without an impact assessment',
    v_status = 'approved', coalesce(v_status,'NULL'));
END $h2$;

DO $h3$
DECLARE v_ok boolean := false; v_msg text; r jsonb; v_expiry date;
BEGIN
  --  major: classification has to cost something or it is decoration
  INSERT INTO public.licence_variations
    (id, company_id, licence_id, product_id, variation_class, variation_type,
     title, description, created_by)
  VALUES ('00000000-0000-7500-f000-000000000002','00000000-0000-7500-a000-00000000000a',
          '00000000-0000-7500-d000-000000000001','00000000-0000-7500-c000-000000000001',
          'major','api_source_change','New API supplier','Second source qualification',
          '00000000-0000-7500-b000-000000000001');

  PERFORM public.lifecycle_transition('licence_variation','00000000-0000-7500-f000-000000000002',
    'submit','00000000-0000-7500-a000-00000000000a',NULL,NULL,'{}'::jsonb);
  PERFORM public.lifecycle_transition('licence_variation','00000000-0000-7500-f000-000000000002',
    'begin_review','00000000-0000-7500-a000-00000000000a',NULL,NULL,'{}'::jsonb);

  BEGIN
    r := public.licence_variation_approve('00000000-0000-7500-f000-000000000002','ok', NULL);
    v_msg := 'MAJOR VARIATION APPROVED WITH NO JUSTIFICATION';
  EXCEPTION WHEN others THEN
    v_ok := SQLERRM LIKE 'VARIATION_MAJOR_INCOMPLETE%'; v_msg := SQLERRM;
  END;
  PERFORM lic_assert('H9','a major variation cannot be approved bare', v_ok, left(v_msg,110));
  PERFORM lic_assert('H10','and the refusal lists what is missing',
    v_msg LIKE '%justification%' AND v_msg LIKE '%impact assessment%', left(v_msg,110));

  UPDATE public.licence_variations
     SET justification = 'Primary supplier discontinued the grade',
         impact_assessment = 'Comparative dissolution and stability completed; no change to specification'
   WHERE id='00000000-0000-7500-f000-000000000002';

  r := public.licence_variation_approve('00000000-0000-7500-f000-000000000002',
        'Approved by NAFDAC', (current_date + interval '4 years')::date);
  PERFORM lic_assert('H11','with both present the major variation approves',
    (SELECT status FROM public.licence_variations WHERE id='00000000-0000-7500-f000-000000000002')
      = 'approved');

  --  the parent registration is not touched at approval…
  SELECT expiry_date INTO v_expiry FROM public.regulatory_licences
   WHERE id='00000000-0000-7500-d000-000000000001';
  PERFORM lic_assert('H12','approval alone does not alter the parent registration',
    v_expiry = (current_date + interval '3 years')::date, coalesce(v_expiry::text,'NULL'));

  --  …only when the change is actually implemented
  r := public.licence_variation_implement('00000000-0000-7500-f000-000000000002',
        'Second source in routine use');
  SELECT expiry_date INTO v_expiry FROM public.regulatory_licences
   WHERE id='00000000-0000-7500-d000-000000000001';
  PERFORM lic_assert('H13','implementation applies the variation to the parent registration',
    v_expiry = (current_date + interval '4 years')::date, coalesce(v_expiry::text,'NULL'));

  PERFORM lic_assert('H14','implementation is audit logged in its own right',
    EXISTS (SELECT 1 FROM public.audit_logs
             WHERE action='licence_variation.implemented'
               AND entity_id='00000000-0000-7500-f000-000000000002'));
END $h3$;
RESET ROLE;


-- =====================================================================
--  I — completing a renewal opens a new cycle rather than editing the old
-- =====================================================================
SET ROLE authenticated;
DO $i$
DECLARE r jsonb; v_new uuid; v_status text; v_old_expiry date; v_reason text;
BEGIN
  SELECT expiry_date INTO v_old_expiry FROM public.regulatory_licences
   WHERE id='00000000-0000-7500-d000-000000000002';

  PERFORM public.lifecycle_transition('regulatory_licence','00000000-0000-7500-d000-000000000002',
    'begin_renewal','00000000-0000-7500-a000-00000000000b',NULL,NULL,'{}'::jsonb);

  r := public.licence_complete_renewal('00000000-0000-7500-d000-000000000002',
        'A4-1234-R1', (current_date + interval '5 years')::date,
        'Renewal certificate received');
  v_new := (r ->> 'new_licence_id')::uuid;

  SELECT status INTO v_status FROM public.regulatory_licences
   WHERE id='00000000-0000-7500-d000-000000000002';
  PERFORM lic_assert('I1','the old certificate closes as renewed',
    v_status = 'renewed', coalesce(v_status,'NULL'));

  PERFORM lic_assert('I2','a successor record carries the new registration',
    EXISTS (SELECT 1 FROM public.regulatory_licences
             WHERE id = v_new AND registration_number = 'A4-1234-R1'
               AND expiry_date = (current_date + interval '5 years')::date));

  PERFORM lic_assert('I3','the two are linked',
    (SELECT superseded_by_licence_id FROM public.regulatory_licences
      WHERE id='00000000-0000-7500-d000-000000000002') = v_new);

  --  This is the property that keeps a three-year-old batch release
  --  explicable: the superseded record still says what it was valid for.
  PERFORM lic_assert('I4','the superseded record keeps its own expiry',
    (SELECT expiry_date FROM public.regulatory_licences
      WHERE id='00000000-0000-7500-d000-000000000002') = v_old_expiry,
    coalesce(v_old_expiry::text,'NULL'));

  v_reason := public.licence_alerting_suppressed('00000000-0000-7500-d000-000000000002');
  PERFORM lic_assert('I5','the superseded record stops generating renewal noise',
    v_reason = 'licence has been renewed and superseded', coalesce(v_reason,'NOT SUPPRESSED'));

  PERFORM lic_assert('I6','the successor went through the same approval cascade',
    jsonb_array_length(r -> 'cascade' -> 'steps') = 5);

  PERFORM lic_assert('I7','the successor is active',
    (SELECT status FROM public.regulatory_licences WHERE id = v_new) = 'active');
END $i$;

--  the reporting surface the dashboard consumes
DO $i2$
DECLARE d jsonb;
BEGIN
  d := public.licence_renewal_dashboard('00000000-0000-7500-a000-00000000000b');
  PERFORM lic_assert('I8','the dashboard reports the milestone schedule',
    (d ->> 'milestones') = '[12, 6, 3, 2, 1, 0]', coalesce(d ->> 'milestones','NULL'));
  PERFORM lic_assert('I9','the dashboard reports open renewal steps',
    (d ->> 'open_steps')::int >= 12, coalesce(d ->> 'open_steps','NULL'));
END $i2$;
RESET ROLE;


-- =====================================================================
--  J — SECURITY DEFINER readers are not a way around RLS
-- =====================================================================
--  Every function in this deliverable that reads licence data is
--  SECURITY DEFINER, which means row-level security does NOT apply
--  inside it. Each one therefore has to check the caller itself, and
--  these cases are what keeps that true. The outsider below is a real
--  signed-in user of another company, not an anonymous caller.
DO $j_fx$
DECLARE
  cz uuid := '00000000-0000-7500-a000-0000000000ff';
  uz uuid := '00000000-0000-7500-b000-000000000009';
BEGIN
  INSERT INTO public.companies(id,name) VALUES (cz,'LIC Outsider')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO auth.users(id,email) VALUES (uz,'lic-z@local.test') ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.profiles(id,email,full_name,role,company_id)
    VALUES (uz,'lic-z@local.test','Zoe Outsider','admin',cz) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.company_members(company_id,user_id,role,status)
    VALUES (cz,uz,'owner','active') ON CONFLICT DO NOTHING;

  --  If this block does not actually run, every case below would still
  --  "pass" — against a user who belongs to no company at all, which is
  --  a much weaker claim than the one being made.
  IF NOT EXISTS (SELECT 1 FROM public.company_members
                  WHERE user_id = uz AND company_id = cz AND status='active') THEN
    RAISE EXCEPTION 'J fixtures did not take; section J would prove nothing';
  END IF;
END $j_fx$;

SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-7500-b000-000000000009","role":"authenticated"}', false);
SET ROLE authenticated;

DO $j$
DECLARE v_ok boolean; v_msg text; d jsonb; m integer[];
BEGIN
  --  Sanity: the outsider really is a signed-in member of a different
  --  company, and really cannot see company B through ordinary RLS.
  PERFORM lic_assert('J0','the outsider is a member of another company, not of nothing',
    public.app_is_company_member('00000000-0000-7500-a000-0000000000ff')
    AND NOT public.app_is_company_member('00000000-0000-7500-a000-00000000000b'));

  v_ok := false;
  BEGIN
    PERFORM public.licence_block_reason('00000000-0000-7500-c000-000000000004','initiation');
    v_msg := 'ANOTHER TENANT''S LICENCE DETAILS WERE RETURNED';
  EXCEPTION WHEN others THEN
    v_ok := SQLERRM LIKE 'LICENCE_FORBIDDEN%'; v_msg := SQLERRM;
  END;
  PERFORM lic_assert('J1','licence_block_reason refuses another company''s product',
    v_ok, left(v_msg,100));

  v_ok := false;
  BEGIN
    PERFORM public.licence_alerting_suppressed('00000000-0000-7500-d000-000000000002');
    v_msg := 'ANOTHER TENANT''S LICENCE STATE WAS RETURNED';
  EXCEPTION WHEN others THEN
    v_ok := SQLERRM LIKE 'LICENCE_FORBIDDEN%'; v_msg := SQLERRM;
  END;
  PERFORM lic_assert('J2','licence_alerting_suppressed refuses another company''s licence',
    v_ok, left(v_msg,100));

  d := public.licence_renewal_dashboard('00000000-0000-7500-a000-00000000000b');
  PERFORM lic_assert('J3','the dashboard returns nothing for another company',
    d IS NULL, coalesce(left(d::text,80),'NULL'));

  d := public.licence_renewal_policy('00000000-0000-7500-a000-00000000000b');
  PERFORM lic_assert('J4','the renewal policy is not readable across companies',
    d IS NULL, coalesce(left(d::text,80),'NULL'));

  m := public.licence_alert_milestones('00000000-0000-7500-a000-00000000000b');
  PERFORM lic_assert('J5','the milestone schedule is not readable across companies',
    m IS NULL, coalesce(array_to_string(m,','),'NULL'));

  v_ok := false;
  BEGIN
    PERFORM public.licence_generate_renewal_steps('00000000-0000-7500-d000-000000000002');
    v_msg := 'STEPS WERE WRITTEN INTO ANOTHER TENANT';
  EXCEPTION WHEN others THEN
    v_ok := SQLERRM LIKE 'LICENCE_FORBIDDEN%'; v_msg := SQLERRM;
  END;
  PERFORM lic_assert('J6','a checklist cannot be opened inside another company',
    v_ok, left(v_msg,100));

  v_ok := false;
  BEGIN
    PERFORM public.licence_generate_renewal_alerts('00000000-0000-7500-a000-00000000000b');
    v_msg := 'ALERTS WERE GENERATED FOR ANOTHER TENANT';
  EXCEPTION WHEN others THEN
    v_ok := SQLERRM LIKE 'LICENCE_FORBIDDEN%'; v_msg := SQLERRM;
  END;
  PERFORM lic_assert('J7','alerts cannot be generated for another company',
    v_ok, left(v_msg,100));

  v_ok := false;
  BEGIN
    PERFORM public.licence_record_approval('00000000-0000-7500-d000-000000000002',
      'HIJACK-1', (current_date + interval '1 year')::date, current_date, false);
    v_msg := 'ANOTHER TENANT''S LICENCE WAS GRANTED';
  EXCEPTION WHEN others THEN
    v_ok := SQLERRM LIKE 'LICENCE_FORBIDDEN%'; v_msg := SQLERRM;
  END;
  PERFORM lic_assert('J8','the approval cascade refuses another company''s licence',
    v_ok, left(v_msg,100));

  --  audit rows are written by a DEFINER helper; a client must not be
  --  able to call it and forge one.
  v_ok := false;
  BEGIN
    PERFORM public.licence_audit_step('00000000-0000-7500-a000-00000000000b',
      'licence.approval_recorded','regulatory_licence',
      '00000000-0000-7500-d000-000000000002','{}'::jsonb);
    v_msg := 'A CLIENT FORGED AN AUDIT ROW';
  EXCEPTION WHEN others THEN
    v_ok := true; v_msg := SQLERRM;
  END;
  PERFORM lic_assert('J9','the audit helper is not callable by a client', v_ok, left(v_msg,100));
END $j$;
RESET ROLE;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-7500-b000-000000000001","role":"authenticated"}', false);


-- ── results ──────────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims','',false);
\echo ''
\echo '======== LICENCE LIFECYCLE — TEST RESULTS ========'
SELECT id, name, verdict, detail FROM lic_results ORDER BY seq;
\echo ''
SELECT verdict, count(*) FROM lic_results GROUP BY verdict ORDER BY verdict;

-- ── cleanup ──────────────────────────────────────────────────────────
DO $cleanup$
BEGIN
  DELETE FROM public.licence_renewal_alerts   WHERE company_id::text LIKE '00000000-0000-7500-a000-%';
  DELETE FROM public.licence_renewal_steps    WHERE company_id::text LIKE '00000000-0000-7500-a000-%';
  DELETE FROM public.licence_renewal_task_templates
                                              WHERE company_id::text LIKE '00000000-0000-7500-a000-%';
  DELETE FROM public.licence_renewal_policies WHERE company_id::text LIKE '00000000-0000-7500-a000-%';

  DELETE FROM public.entity_state_history WHERE entity_type='licence_variation'
     AND entity_id IN (SELECT id FROM public.licence_variations
                        WHERE company_id::text LIKE '00000000-0000-7500-a000-%');
  DELETE FROM public.entity_current_state WHERE entity_type='licence_variation'
     AND entity_id IN (SELECT id FROM public.licence_variations
                        WHERE company_id::text LIKE '00000000-0000-7500-a000-%');
  DELETE FROM public.licence_variations   WHERE company_id::text LIKE '00000000-0000-7500-a000-%';

  DELETE FROM public.notifications        WHERE recipient_id::text LIKE '00000000-0000-7500-b000-%';
  DELETE FROM public.batch_records        WHERE company_id::text LIKE '00000000-0000-7500-a000-%';

  --  audit_logs is append-only by trigger as well as by policy, which is
  --  correct and is asserted elsewhere. Suspending the triggers is the
  --  only way a suite can remove its own fixtures; they are restored
  --  immediately, and this runs on a disposable local database.
  ALTER TABLE public.audit_logs DISABLE TRIGGER trg_block_audit_update;
  ALTER TABLE public.audit_logs DISABLE TRIGGER trg_block_audit_delete;
  ALTER TABLE public.audit_logs DISABLE TRIGGER trg_prevent_audit_log_deletion;
  DELETE FROM public.audit_logs WHERE company_id::text LIKE '00000000-0000-7500-a000-%';
  ALTER TABLE public.audit_logs ENABLE TRIGGER trg_prevent_audit_log_deletion;
  ALTER TABLE public.audit_logs ENABLE TRIGGER trg_block_audit_delete;
  ALTER TABLE public.audit_logs ENABLE TRIGGER trg_block_audit_update;

  DELETE FROM public.entity_state_history WHERE entity_type IN ('regulatory_licence','product')
     AND entity_id IN (SELECT id FROM public.regulatory_licences
                        WHERE company_id::text LIKE '00000000-0000-7500-a000-%'
                       UNION ALL
                       SELECT id FROM public.products
                        WHERE company_id::text LIKE '00000000-0000-7500-a000-%');
  DELETE FROM public.entity_current_state WHERE entity_type IN ('regulatory_licence','product')
     AND entity_id IN (SELECT id FROM public.regulatory_licences
                        WHERE company_id::text LIKE '00000000-0000-7500-a000-%'
                       UNION ALL
                       SELECT id FROM public.products
                        WHERE company_id::text LIKE '00000000-0000-7500-a000-%');

  DELETE FROM public.regulatory_licences  WHERE company_id::text LIKE '00000000-0000-7500-a000-%';
  DELETE FROM public.products             WHERE company_id::text LIKE '00000000-0000-7500-a000-%';
  DELETE FROM public.licence_renewal_policies
                                          WHERE company_id::text LIKE '00000000-0000-7500-a000-%';
  DELETE FROM public.company_members      WHERE user_id::text LIKE '00000000-0000-7500-b000-%';
  DELETE FROM public.profiles             WHERE email LIKE 'lic-%@local.test';
  DELETE FROM auth.users                  WHERE email LIKE 'lic-%@local.test';
  DELETE FROM public.companies            WHERE name LIKE 'LIC %';
  RAISE NOTICE 'lic fixtures removed.';
EXCEPTION WHEN others THEN
  RAISE WARNING 'CLEANUP INCOMPLETE (%). Remove lic rows manually.', SQLERRM;
END $cleanup$;

DROP FUNCTION IF EXISTS lic_assert(text,text,boolean,text);
DROP TABLE IF EXISTS lic_results;
