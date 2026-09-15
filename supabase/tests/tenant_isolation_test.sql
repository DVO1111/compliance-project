-- =====================================================================
--  TENANT ISOLATION — REGRESSION TESTS
--  LOCAL / DISPOSABLE DATABASE ONLY
-- =====================================================================
--  Companion to docs/TENANT_ISOLATION_AUDIT.md.
--
--  Two companies, two real signed-in admins — not an anonymous caller,
--  because "anon is refused" proves far less than "a legitimate user of
--  another tenant is refused". Company B's admin tries to read company
--  A's data through every path the audit identified:
--
--    * direct table reads, where RLS is the primary control;
--    * the evidence-export query shape, verbatim;
--    * every SECURITY DEFINER function that takes an id and returns
--      data about it — RLS does NOT apply inside those, so each must
--      carry its own check.
--
--  The three functions fixed in 20260922000000 are covered here so the
--  leak cannot silently return.
--
--  Run:  psql "<local url>" -f supabase/tests/tenant_isolation_test.sql
-- =====================================================================

\set ON_ERROR_STOP off

DO $guard$
BEGIN
  IF current_database() NOT IN ('postgres','criateur_local') THEN
    RAISE EXCEPTION 'REFUSING TO RUN outside a local database (got %)', current_database();
  END IF;
END $guard$;

DROP TABLE IF EXISTS ti_results;
CREATE TEMP TABLE ti_results(seq serial, id text, name text, verdict text, detail text);
GRANT ALL ON ti_results TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE ti_results_seq_seq TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION ti_assert(p_id text, p_name text, p_cond boolean, p_detail text DEFAULT '')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO ti_results(id,name,verdict,detail)
  VALUES (p_id,p_name,CASE WHEN p_cond THEN 'PASS' ELSE 'FAIL' END,p_detail);
END $$;

-- ── fixtures: company A owns everything, company B owns nothing ──────
DO $fx$
DECLARE
  ca uuid := '00000000-0000-7800-a000-00000000000a';
  cb uuid := '00000000-0000-7800-a000-00000000000b';
  ua uuid := '00000000-0000-7800-b000-000000000001';
  ub uuid := '00000000-0000-7800-b000-000000000002';
  v_prev text; v_seq bigint;
BEGIN
  INSERT INTO public.companies(id,name) VALUES (ca,'TI Alpha'), (cb,'TI Bravo')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO auth.users(id,email) VALUES (ua,'ti-a@local.test'), (ub,'ti-b@local.test')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.profiles(id,email,full_name,role,company_id) VALUES
    (ua,'ti-a@local.test','Ada Alpha','admin',ca),
    (ub,'ti-b@local.test','Bo Bravo','admin',cb) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.company_members(company_id,user_id,role,status) VALUES
    (ca,ua,'owner','active'), (cb,ub,'owner','active') ON CONFLICT DO NOTHING;

  -- product + licence + submission, all company A
  INSERT INTO public.products
    (id,company_id,product_code,trade_name,category,manufacturing_type,created_by)
  VALUES ('00000000-0000-7800-c000-000000000001',ca,'TI-001','Alpha Secret Syrup',
          'drug_pharmaceutical','in_house',ua);

  INSERT INTO public.regulatory_submissions
    (id,company_id,product_id,product_name,product_category,submission_type,regulatory_body,
     document_checklist,checklist_phases,submitted_date,created_by)
  VALUES ('00000000-0000-7800-d000-000000000001',ca,'00000000-0000-7800-c000-000000000001',
          'Alpha Secret Syrup','drug_pharmaceutical','local_manufacture','nafdac',
          jsonb_build_object('Confidential Filing A', jsonb_build_object('is_present',false)),
          jsonb_build_object('Confidential Filing A','pre'), current_date - 10, ua);

  INSERT INTO public.regulatory_licences
    (id,company_id,licence_type,name,product_id,registration_number,regulatory_body,
     expiry_date,created_by)
  VALUES ('00000000-0000-7800-e000-000000000001',ca,'nafdac_product_registration',
          'Alpha Secret Registration','00000000-0000-7800-c000-000000000001',
          'TI-REG-001','nafdac',(current_date + interval '2 years')::date, ua);

  INSERT INTO public.product_documents
    (id,company_id,scope,product_id,document_type,name,uploaded_by)
  VALUES ('00000000-0000-7800-f000-000000000001',ca,'product',
          '00000000-0000-7800-c000-000000000001','cover_letter','Alpha Confidential Cover Letter',ua);

  INSERT INTO public.batch_records
    (id,company_id,batch_number,product_name,product_id,manufacturing_date,expiry_date,
     batch_size,created_by)
  VALUES ('00000000-0000-7800-9000-000000000001',ca,'TI-BATCH-001','Alpha Secret Syrup',
          '00000000-0000-7800-c000-000000000001',current_date,current_date+365,100,ua);

  --  An audit entry with an evidence snapshot — this is what a sealed
  --  evidence export gathers.
  SELECT integrity_hash, sequence_number INTO v_prev, v_seq
    FROM public.audit_logs WHERE company_id = ca AND integrity_hash IS NOT NULL
    ORDER BY sequence_number DESC LIMIT 1;
  INSERT INTO public.audit_logs
    (id,user_id,action,entity_type,entity_id,metadata,evidence_snapshot,
     integrity_hash,previous_hash,company_id,sequence_number)
  VALUES ('00000000-0000-7800-8000-000000000001',ua,'content.approved','content_submission',
          '00000000-0000-7800-7000-000000000001',
          jsonb_build_object('note','alpha only'),
          jsonb_build_object('secret_evidence','ALPHA-CONFIDENTIAL-SNAPSHOT'),
          'TI-HASH-001', coalesce(v_prev,'GENESIS'), ca, coalesce(v_seq,0)+1);
END $fx$;

--  Everything below runs as company B's admin.
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-7800-b000-000000000002","role":"authenticated"}', false);
SET ROLE authenticated;


-- =====================================================================
--  A — the caller really is a legitimate user of another tenant
-- =====================================================================
DO $a$
BEGIN
  PERFORM ti_assert('A1','the caller is an active member of company B',
    public.app_is_company_member('00000000-0000-7800-a000-00000000000b'));
  PERFORM ti_assert('A2','…and is NOT a member of company A',
    NOT public.app_is_company_member('00000000-0000-7800-a000-00000000000a'));
  PERFORM ti_assert('A3','…and is not running with service privileges',
    NOT public.app_is_service_context());
END $a$;


-- =====================================================================
--  B — RLS is the primary control: direct reads across the six areas
-- =====================================================================
DO $b$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.audit_logs
   WHERE id='00000000-0000-7800-8000-000000000001';
  PERFORM ti_assert('B1','audit_logs: company A''s entry is invisible', n=0, n||' row(s)');

  SELECT count(*) INTO n FROM public.audit_logs
   WHERE company_id='00000000-0000-7800-a000-00000000000a';
  PERFORM ti_assert('B2','audit_logs: no company A entries at all', n=0, n||' row(s)');

  SELECT count(*) INTO n FROM public.regulatory_submissions
   WHERE id='00000000-0000-7800-d000-000000000001';
  PERFORM ti_assert('B3','submissions: invisible', n=0, n||' row(s)');

  SELECT count(*) INTO n FROM public.regulatory_licences
   WHERE id='00000000-0000-7800-e000-000000000001';
  PERFORM ti_assert('B4','licences: invisible', n=0, n||' row(s)');

  SELECT count(*) INTO n FROM public.products
   WHERE id='00000000-0000-7800-c000-000000000001';
  PERFORM ti_assert('B5','products: invisible', n=0, n||' row(s)');

  SELECT count(*) INTO n FROM public.product_documents
   WHERE id='00000000-0000-7800-f000-000000000001';
  PERFORM ti_assert('B6','product documents (evidence): invisible', n=0, n||' row(s)');

  SELECT count(*) INTO n FROM public.batch_records
   WHERE id='00000000-0000-7800-9000-000000000001';
  PERFORM ti_assert('B7','batch records: invisible', n=0, n||' row(s)');

  SELECT count(*) INTO n FROM public.entity_state_history
   WHERE company_id='00000000-0000-7800-a000-00000000000a';
  PERFORM ti_assert('B8','lifecycle history: invisible', n=0, n||' row(s)');
END $b$;


-- =====================================================================
--  C — the evidence export paths, as the application issues them
-- =====================================================================
DO $c$
DECLARE n int; v_snapshot text;
BEGIN
  --  Exactly the query exportSealedEvidence() runs, with B's company id.
  SELECT count(*) INTO n FROM public.audit_logs
   WHERE company_id = '00000000-0000-7800-a000-00000000000b'
     AND entity_id  = '00000000-0000-7800-7000-000000000001'
     AND entity_type = 'content_submission';
  PERFORM ti_assert('C1','sealed evidence export scoped to B returns nothing of A''s',
    n=0, n||' row(s)');

  --  …and the same query with A's company id substituted — the attack
  --  the explicit filter alone would not stop, which is why RLS is the
  --  primary control and the app filter is only defence in depth.
  SELECT count(*) INTO n FROM public.audit_logs
   WHERE company_id = '00000000-0000-7800-a000-00000000000a'
     AND entity_id  = '00000000-0000-7800-7000-000000000001'
     AND entity_type = 'content_submission';
  PERFORM ti_assert('C2','…and substituting A''s company id still returns nothing',
    n=0, n||' row(s)');

  --  The evidence snapshot itself — the payload a sealed export writes
  --  into evidence_snapshots/.
  SELECT evidence_snapshot ->> 'secret_evidence' INTO v_snapshot
    FROM public.audit_logs WHERE id='00000000-0000-7800-8000-000000000001';
  PERFORM ti_assert('C3','evidence snapshot payload is unreadable',
    v_snapshot IS NULL, coalesce(v_snapshot,'NULL'));

  --  Chain verification must not become a side channel either.
  SELECT count(*) INTO n FROM public.audit_logs
   WHERE integrity_hash = 'TI-HASH-001';
  PERFORM ti_assert('C4','integrity hashes are not readable across tenants',
    n=0, n||' row(s)');
END $c$;


-- =====================================================================
--  D — SECURITY DEFINER functions: RLS does not apply inside them
-- =====================================================================
--  Each of these takes an id and returns data about it. Without an
--  internal check they are a read path that bypasses every policy above.
DO $d$
DECLARE v_ok boolean; v_msg text; v_txt text; n int;
BEGIN
  -- fixed in 20260922000000
  v_ok := false;
  BEGIN
    PERFORM * FROM public.submission_missing_documents('00000000-0000-7800-d000-000000000001');
    v_msg := 'LEAKED A''S CHECKLIST';
  EXCEPTION WHEN others THEN v_ok := SQLERRM LIKE 'SUBMISSION_FORBIDDEN%'; v_msg := SQLERRM;
  END;
  PERFORM ti_assert('D1','submission_missing_documents refuses', v_ok, left(v_msg,90));

  v_ok := false;
  BEGIN
    PERFORM public.submission_time_breakdown('00000000-0000-7800-d000-000000000001');
    v_msg := 'LEAKED A''S TIMINGS';
  EXCEPTION WHEN others THEN v_ok := SQLERRM LIKE 'SUBMISSION_FORBIDDEN%'; v_msg := SQLERRM;
  END;
  PERFORM ti_assert('D2','submission_time_breakdown refuses', v_ok, left(v_msg,90));

  --  Scoped by the CALLER, not merely by the company argument: passing
  --  the victim's own company id must not be enough.
  v_txt := public.electronic_signature_record_hash(
             'regulatory_submission','00000000-0000-7800-d000-000000000001',
             '00000000-0000-7800-a000-00000000000a');
  PERFORM ti_assert('D3','electronic_signature_record_hash yields nothing even with A''s company id',
    v_txt IS NULL, coalesce(v_txt,'NULL'));

  -- fixed earlier, held here so they cannot regress
  v_ok := false;
  BEGIN
    PERFORM public.licence_block_reason('00000000-0000-7800-c000-000000000001','release');
    v_msg := 'LEAKED A''S LICENCE DETAIL';
  EXCEPTION WHEN others THEN v_ok := SQLERRM LIKE 'LICENCE_FORBIDDEN%'; v_msg := SQLERRM;
  END;
  PERFORM ti_assert('D4','licence_block_reason refuses', v_ok, left(v_msg,90));

  v_ok := false;
  BEGIN
    PERFORM public.product_is_release_eligible('00000000-0000-7800-c000-000000000001');
    v_msg := 'LEAKED A''S PRODUCT ELIGIBILITY';
  EXCEPTION WHEN others THEN v_ok := SQLERRM LIKE 'PRODUCT_FORBIDDEN%'; v_msg := SQLERRM;
  END;
  PERFORM ti_assert('D5','product_is_release_eligible refuses', v_ok, left(v_msg,90));

  v_ok := false;
  BEGIN
    PERFORM public.licence_alerting_suppressed('00000000-0000-7800-e000-000000000001');
    v_msg := 'LEAKED A''S LICENCE STATE';
  EXCEPTION WHEN others THEN v_ok := SQLERRM LIKE 'LICENCE_FORBIDDEN%'; v_msg := SQLERRM;
  END;
  PERFORM ti_assert('D6','licence_alerting_suppressed refuses', v_ok, left(v_msg,90));

  PERFORM ti_assert('D7','licence_renewal_dashboard returns nothing for another company',
    public.licence_renewal_dashboard('00000000-0000-7800-a000-00000000000a') IS NULL);
  PERFORM ti_assert('D8','licence_renewal_policy returns nothing for another company',
    public.licence_renewal_policy('00000000-0000-7800-a000-00000000000a') IS NULL);
  PERFORM ti_assert('D9','licence_alert_milestones returns nothing for another company',
    public.licence_alert_milestones('00000000-0000-7800-a000-00000000000a') IS NULL);

  SELECT count(*) INTO n FROM public.product_available_documents('00000000-0000-7800-c000-000000000001');
  PERFORM ti_assert('D10','product_available_documents lists nothing of A''s', n=0, n||' row(s)');

  v_ok := false;
  BEGIN
    PERFORM public.lifecycle_transition('product','00000000-0000-7800-c000-000000000001',
      'start_regulatory_prep','00000000-0000-7800-a000-00000000000a',NULL,NULL,'{}'::jsonb);
    v_msg := 'MOVED A''S PRODUCT';
  EXCEPTION WHEN others THEN v_ok := SQLERRM LIKE 'LIFECYCLE_FORBIDDEN%'; v_msg := SQLERRM;
  END;
  PERFORM ti_assert('D11','the engine refuses a transition on another company''s record',
    v_ok, left(v_msg,90));
END $d$;


-- =====================================================================
--  E — the legitimate owner is not locked out by any of the above
-- =====================================================================
--  A control that refuses everybody is not isolation, it is an outage.
RESET ROLE;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-7800-b000-000000000001","role":"authenticated"}', false);
SET ROLE authenticated;

DO $e$
DECLARE n int; v_txt text; b jsonb;
BEGIN
  SELECT count(*) INTO n FROM public.submission_missing_documents('00000000-0000-7800-d000-000000000001');
  PERFORM ti_assert('E1','A''s own admin still sees the checklist', n=1, n||' item(s)');

  b := public.submission_time_breakdown('00000000-0000-7800-d000-000000000001');
  PERFORM ti_assert('E2','A''s own admin still gets the time breakdown',
    (b ->> 'total_days')::int = 10, coalesce(b ->> 'total_days','NULL'));

  v_txt := public.electronic_signature_record_hash(
             'regulatory_submission','00000000-0000-7800-d000-000000000001',
             '00000000-0000-7800-a000-00000000000a');
  PERFORM ti_assert('E3','A''s own admin still gets a record hash',
    v_txt IS NOT NULL, coalesce(left(v_txt,16),'NULL'));

  SELECT count(*) INTO n FROM public.audit_logs
   WHERE id='00000000-0000-7800-8000-000000000001';
  PERFORM ti_assert('E4','A''s own admin still reads their audit entry', n=1, n||' row(s)');

  SELECT count(*) INTO n FROM public.product_available_documents('00000000-0000-7800-c000-000000000001');
  PERFORM ti_assert('E5','A''s own admin still lists their product documents', n>=1, n||' row(s)');
END $e$;
RESET ROLE;


-- ── results ──────────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims','',false);
\echo ''
\echo '======== TENANT ISOLATION — TEST RESULTS ========'
SELECT id, name, verdict, detail FROM ti_results ORDER BY seq;
\echo ''
SELECT verdict, count(*) FROM ti_results GROUP BY verdict ORDER BY verdict;

-- ── cleanup ──────────────────────────────────────────────────────────
DO $cleanup$
BEGIN
  DELETE FROM public.batch_records     WHERE company_id::text LIKE '00000000-0000-7800-a000-%';
  DELETE FROM public.product_documents WHERE company_id::text LIKE '00000000-0000-7800-a000-%';

  ALTER TABLE public.audit_logs DISABLE TRIGGER trg_block_audit_update;
  ALTER TABLE public.audit_logs DISABLE TRIGGER trg_block_audit_delete;
  ALTER TABLE public.audit_logs DISABLE TRIGGER trg_prevent_audit_log_deletion;
  DELETE FROM public.audit_logs WHERE company_id::text LIKE '00000000-0000-7800-a000-%';
  ALTER TABLE public.audit_logs ENABLE TRIGGER trg_prevent_audit_log_deletion;
  ALTER TABLE public.audit_logs ENABLE TRIGGER trg_block_audit_delete;
  ALTER TABLE public.audit_logs ENABLE TRIGGER trg_block_audit_update;

  DELETE FROM public.entity_state_history WHERE company_id::text LIKE '00000000-0000-7800-a000-%';
  DELETE FROM public.entity_current_state WHERE company_id::text LIKE '00000000-0000-7800-a000-%';
  DELETE FROM public.regulatory_licences   WHERE company_id::text LIKE '00000000-0000-7800-a000-%';
  DELETE FROM public.regulatory_submissions WHERE company_id::text LIKE '00000000-0000-7800-a000-%';
  DELETE FROM public.products              WHERE company_id::text LIKE '00000000-0000-7800-a000-%';
  DELETE FROM public.company_members       WHERE user_id::text LIKE '00000000-0000-7800-b000-%';
  DELETE FROM public.profiles              WHERE email LIKE 'ti-%@local.test';
  DELETE FROM auth.users                   WHERE email LIKE 'ti-%@local.test';
  DELETE FROM public.companies             WHERE name LIKE 'TI %';
  RAISE NOTICE 'ti fixtures removed.';
EXCEPTION WHEN others THEN
  RAISE WARNING 'CLEANUP INCOMPLETE (%). Remove ti rows manually.', SQLERRM;
END $cleanup$;

DROP FUNCTION IF EXISTS ti_assert(text,text,boolean,text);
DROP TABLE IF EXISTS ti_results;
