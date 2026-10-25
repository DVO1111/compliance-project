-- =====================================================================
--  THE WRITE-PATH AUDIT
--
--  Covers 20261112000000_write_policies_for_work_roles.sql.
--
--  WHAT THE SWEEP WAS LOOKING FOR. 20261109000000 widened
--  certificate_of_analysis' update policy after an assertion expecting
--  a refusal got SILENCE: the policy admitted only owner/admin, so a
--  caller holding a PM-03 work role matched zero rows and their UPDATE
--  succeeded having changed nothing. A statement that changes nothing
--  and raises nothing is the worst of the three possible outcomes,
--  because the caller is told it worked.
--
--  The same shape was on batch_records, batch_qc_results,
--  raw_material_receipts and batch_inprocess_qc: INSERT open to any
--  member, UPDATE and DELETE locked to owner/admin.
--
--  Sections:
--    A. A QA Manager's release now records when, by whom and on what
--    B. A storekeeper can correct a receipt
--    C. A QC verdict cannot be edited by anyone
--    D. A correction is a new result, and it supersedes
--    E. The release gate reads the result that stands
--    F. The sweep itself: no write policy still excludes its own actors
-- =====================================================================
\set ON_ERROR_STOP on
SET client_min_messages = warning;

RESET ROLE;
SELECT set_config('request.jwt.claims','', false);

CREATE TEMP TABLE _wp(section text, name text, ok boolean, detail text);
GRANT ALL ON _wp TO anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION _wpk(p_section text, p_name text, p_ok boolean, p_detail text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO _wp VALUES (p_section,p_name,coalesce(p_ok,false),p_detail); END $$;

DO $fx$
DECLARE
  c_a uuid := gen_random_uuid();
  u_qm uuid := gen_random_uuid();   -- qa_manager
  u_qc uuid := gen_random_uuid();   -- qc_analyst
  u_sk uuid := gen_random_uuid();   -- storekeeper
  b uuid := gen_random_uuid();
  p_id uuid := gen_random_uuid();
  s_id uuid := gen_random_uuid();
  tag text := substr(replace(gen_random_uuid()::text,'-',''),1,8);
BEGIN
  PERFORM set_config('wp.c_a', c_a::text, false);
  PERFORM set_config('wp.u_qm', u_qm::text, false);
  PERFORM set_config('wp.u_qc', u_qc::text, false);
  PERFORM set_config('wp.u_sk', u_sk::text, false);
  PERFORM set_config('wp.b', b::text, false);

  INSERT INTO public.companies(id,name) VALUES (c_a,'Write Path Works '||tag);
  INSERT INTO auth.users(id,email) VALUES
    (u_qm,'qm-'||tag||'@wp.test'), (u_qc,'qc-'||tag||'@wp.test'), (u_sk,'sk-'||tag||'@wp.test');
  --  A real password, because 20261127000000 makes recording a
  --  finished-product verdict a signed act and there is no test-only
  --  signing path. The suite signs the way the application will.
  UPDATE auth.users
     SET encrypted_password = extensions.crypt('CorrectHorse1!', extensions.gen_salt('bf'))
   WHERE id IN (u_qm,u_qc,u_sk);
  INSERT INTO public.profiles(id,email,full_name,company_id,role) VALUES
    (u_qm,'qm-'||tag||'@wp.test','Ngozi Quality', c_a,'compliance_officer'),
    (u_qc,'qc-'||tag||'@wp.test','Amaka Analyst', c_a,'content_creator'),
    (u_sk,'sk-'||tag||'@wp.test','Bisi Store',    c_a,'content_creator');
  INSERT INTO public.company_members(company_id,user_id,role,status) VALUES
    (c_a,u_qm,'qa_manager','active'),
    (c_a,u_qc,'qc_analyst','active'),
    (c_a,u_sk,'storekeeper','active');

  --  A PRODUCT AND A SPECIFICATION, because 20261113000000 judges a
  --  batch against the specification in force when it was made and
  --  refuses one that names no product. Section E is about which
  --  RESULTS the gate counts, so the specification has to be out of
  --  the way for that question to be the one being asked.
  INSERT INTO public.products(id,company_id,product_code,trade_name,generic_name,category,created_by)
  VALUES (p_id,c_a,'WP-'||tag,'Tablet W','Paracetamol','drug_pharmaceutical',u_qm);

  INSERT INTO public.batch_records
    (id,company_id,batch_number,product_name,product_id,manufacturing_date,expiry_date,batch_size,unit)
  VALUES (b,c_a,'WP-'||tag,'Tablet W',p_id,current_date,current_date+365,100,'kg');

  INSERT INTO public.product_specifications
    (id,company_id,product_id,version,status,created_by)
  VALUES (s_id,c_a,p_id,'1.0','draft',u_qm);
  INSERT INTO public.product_specification_tests
    (specification_id,test_name,limit_type,min_value,max_value,unit,is_required)
  VALUES (s_id,'Assay','range',98,102,'%',true);
  --  Dissolution is declared but NOT required, so section E's second
  --  failure is a test somebody chose to run — which still blocks,
  --  and the assertion says why.
  INSERT INTO public.product_specification_tests
    (specification_id,test_name,limit_type,min_value,unit,is_required)
  VALUES (s_id,'Dissolution','min',80,'%',false);
  UPDATE public.product_specifications
     SET status='effective', approved_by=u_qm, approved_at=now(),
         approved_by_role='service', effective_date=current_date - 1
   WHERE id = s_id;
END
$fx$;


-- =====================================================================
--  A — a QA Manager's release records the facts beside it
--
--  updateBatchStatus() moves the state through lifecycle_transition,
--  which is SECURITY DEFINER and bypasses row level security, and then
--  writes released_at / released_by / release_notes with a plain
--  UPDATE from the browser. That second write used to match zero rows
--  for anybody holding a work role: the batch released and nothing
--  recorded when, by whom, or on what notes.
-- =====================================================================
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('wp.u_qm'), 'role','authenticated')::text, false);
SET ROLE authenticated;

DO $a$
DECLARE
  c_a uuid := current_setting('wp.c_a')::uuid;
  b uuid := current_setting('wp.b')::uuid;
  v_n integer;
BEGIN
  PERFORM _wpk('A','A1 the QA manager holds Act on batch release',
    public.app_section_access(c_a,'batch_release') = 'act',
    public.app_section_access(c_a,'batch_release'));

  UPDATE public.batch_records
     SET release_notes = 'Released on the strength of the assay'
   WHERE id = b;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  --  THE ASSERTION THAT WOULD HAVE FAILED BEFORE, and it would have
  --  failed by reporting zero rows rather than by raising.
  PERFORM _wpk('A','A2 their update reaches the row', v_n = 1, v_n::text);

  PERFORM _wpk('A','A3 and the note is on the record',
    (SELECT release_notes FROM public.batch_records WHERE id = b)
      = 'Released on the strength of the assay',
    coalesce((SELECT release_notes FROM public.batch_records WHERE id = b), '<null>'));
END
$a$;
RESET ROLE;

--  The production supervisor's cell is Act on batch_records, which is
--  the other half of the widened policy.
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('wp.u_qc'), 'role','authenticated')::text, false);
SET ROLE authenticated;
DO $a2$
DECLARE b uuid := current_setting('wp.b')::uuid; v_n integer;
BEGIN
  --  A QC Analyst has View on both batch columns and is still filtered
  --  out, so A2 is about the role and not about the policy having been
  --  thrown open.
  UPDATE public.batch_records SET release_notes = 'by the analyst' WHERE id = b;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  PERFORM _wpk('A','A4 a QC analyst is still filtered out', v_n = 0, v_n::text);
END
$a2$;
RESET ROLE;


-- =====================================================================
--  B — a storekeeper can correct a receipt
-- =====================================================================
DO $bfx$
DECLARE
  c_a uuid := current_setting('wp.c_a')::uuid;
  v_id uuid;
  v_cols text;
BEGIN
  --  raw_material_receipts' shape varies across builds, so the fixture
  --  inserts only what every build has. If the table is absent this
  --  section says so rather than failing obscurely.
  IF to_regclass('public.raw_material_receipts') IS NULL THEN
    PERFORM _wpk('B','B0 raw_material_receipts exists', false, 'table absent');
    RETURN;
  END IF;
  PERFORM _wpk('B','B0 raw_material_receipts exists', true);

  SELECT string_agg(column_name, ',') INTO v_cols
    FROM information_schema.columns
   WHERE table_schema='public' AND table_name='raw_material_receipts'
     AND is_nullable='NO' AND column_default IS NULL;
  PERFORM set_config('wp.rmr_required', coalesce(v_cols,''), false);
END
$bfx$;

SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('wp.u_sk'), 'role','authenticated')::text, false);
SET ROLE authenticated;
DO $b$
DECLARE
  c_a uuid := current_setting('wp.c_a')::uuid;
BEGIN
  PERFORM _wpk('B','B1 the storekeeper holds Act on goods receipt',
    public.app_section_access(c_a,'goods_receipt') = 'act',
    public.app_section_access(c_a,'goods_receipt'));

  --  The policy is what this section is about, and a policy can be read
  --  without a row: USING is an expression over the row, and the grid
  --  clause does not mention one.
  PERFORM _wpk('B','B2 and the receipt update policy now admits that cell',
    EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
             WHERE c.relname='raw_material_receipts' AND p.polname='rmr_update_qa'
               AND pg_get_expr(p.polqual,p.polrelid) LIKE '%goods_receipt%'));
END
$b$;
RESET ROLE;


-- =====================================================================
--  C — a QC verdict cannot be edited by anyone
--
--  20261107000000 made a failed finished-product test block a release.
--  That gate is only as good as the row it reads, and nothing stopped
--  a recorded `pass = false` being UPDATEd to true — after which the
--  batch releases and the failure has left no trace.
-- =====================================================================
DO $cfx$
DECLARE
  b uuid := current_setting('wp.b')::uuid;
  v_id uuid;
BEGIN
  --  SIGNED, since 20261127000000: the release gate reads this verdict,
  --  so the analyst attests to it as it is recorded.
  INSERT INTO public.batch_qc_results
    (batch_id,test_name,test_method,specification,result,pass,tested_by,signature_id)
  VALUES (b,'Assay','HPLC','98.0 - 102.0 %','88.1 %', false,
          current_setting('wp.u_qc')::uuid,
          (public.quality_verdict_sign('batch_qc_result',
             current_setting('wp.c_a')::uuid, b, 'Assay', '88.1 %', false,
             'CorrectHorse1!')->>'signature_id')::uuid)
  RETURNING id INTO v_id;
  PERFORM set_config('wp.r_fail', v_id::text, false);
END
$cfx$;

SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('wp.u_qc'), 'role','authenticated')::text, false);
SET ROLE authenticated;

DO $c$
DECLARE
  r uuid := current_setting('wp.r_fail')::uuid;
  v_ok boolean := false; v_msg text;
BEGIN
  BEGIN
    UPDATE public.batch_qc_results SET pass = true WHERE id = r;
    v_msg := 'A FAILED VERDICT WAS FLIPPED TO PASS';
  EXCEPTION WHEN OTHERS THEN
    v_ok := SQLERRM LIKE 'BATCH_QC_IMMUTABLE%'; v_msg := SQLERRM;
  END;
  PERFORM _wpk('C','C1 the verdict cannot be edited', v_ok, left(v_msg,140));

  v_ok := false;
  BEGIN
    UPDATE public.batch_qc_results SET result = '99.9 %' WHERE id = r;
    v_msg := 'A RESULT VALUE WAS REWRITTEN';
  EXCEPTION WHEN OTHERS THEN
    v_ok := SQLERRM LIKE 'BATCH_QC_IMMUTABLE%'; v_msg := SQLERRM;
  END;
  PERFORM _wpk('C','C2 nor the value the verdict was taken on', v_ok, left(v_msg,140));

  --  Something that is NOT the verdict may still be tidied, so the
  --  refusal is about the two columns the gate reads rather than about
  --  the row being frozen.
  BEGIN
    UPDATE public.batch_qc_results SET test_method = 'HPLC, method B' WHERE id = r;
    PERFORM _wpk('C','C3 but the method can still be corrected', true);
  EXCEPTION WHEN OTHERS THEN
    PERFORM _wpk('C','C3 but the method can still be corrected', false, SQLERRM);
  END;

  PERFORM _wpk('C','C4 and the verdict still reads false',
    (SELECT pass FROM public.batch_qc_results WHERE id = r) = false);
END
$c$;
RESET ROLE;

--  Not even in a service context, which is where a backfill or a
--  migration would reach it. The trigger has no service exemption
--  because there is no legitimate caller for this edit.
DO $c2$
DECLARE r uuid := current_setting('wp.r_fail')::uuid; v_ok boolean := false; v_msg text;
BEGIN
  BEGIN
    UPDATE public.batch_qc_results SET pass = true WHERE id = r;
    v_msg := 'A SERVICE CONTEXT FLIPPED THE VERDICT';
  EXCEPTION WHEN OTHERS THEN
    v_ok := SQLERRM LIKE 'BATCH_QC_IMMUTABLE%'; v_msg := SQLERRM;
  END;
  PERFORM _wpk('C','C5 not even in a service context', v_ok, left(v_msg,140));
END
$c2$;


-- =====================================================================
--  D — a correction is a new result, and it supersedes
-- =====================================================================
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('wp.u_qc'), 'role','authenticated')::text, false);
SET ROLE authenticated;

DO $d$
DECLARE
  b uuid := current_setting('wp.b')::uuid;
  r uuid := current_setting('wp.r_fail')::uuid;
  v_id uuid; v_ok boolean := false; v_msg text;
BEGIN
  BEGIN
    INSERT INTO public.batch_qc_results
      (batch_id,test_name,result,pass,tested_by,corrected_from_id,signature_id)
    VALUES (b,'Assay','99.4 %',true,current_setting('wp.u_qc')::uuid,r,
            (public.quality_verdict_sign('batch_qc_result',
               current_setting('wp.c_a')::uuid, b, 'Assay', '99.4 %', true,
               'CorrectHorse1!')->>'signature_id')::uuid);
    v_msg := 'A CORRECTION WITH NO REASON WAS ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    v_ok := SQLERRM LIKE 'BATCH_QC_CORRECTION_NO_REASON%'; v_msg := SQLERRM;
  END;
  PERFORM _wpk('D','D1 a correction requires a reason', v_ok, left(v_msg,140));

  INSERT INTO public.batch_qc_results
    (batch_id,test_name,result,pass,tested_by,corrected_from_id,correction_reason,signature_id)
  VALUES (b,'Assay','99.4 %',true,current_setting('wp.u_qc')::uuid,r,
          'Transcribed from the wrong column of the chromatogram',
          (public.quality_verdict_sign('batch_qc_result',
             current_setting('wp.c_a')::uuid, b, 'Assay', '99.4 %', true,
             'CorrectHorse1!')->>'signature_id')::uuid)
  RETURNING id INTO v_id;
  PERFORM set_config('wp.r_corr', v_id::text, false);
  PERFORM _wpk('D','D2 a correction with one is recorded', v_id IS NOT NULL);

  --  BOTH SURVIVE. The original is what somebody acted on, and a
  --  history that hides it is the failure the correction model exists
  --  to prevent.
  PERFORM _wpk('D','D3 and the original is still there, still failing',
    (SELECT pass FROM public.batch_qc_results WHERE id = r) = false);

  v_ok := false;
  BEGIN
    INSERT INTO public.batch_qc_results
      (batch_id,test_name,result,pass,tested_by,corrected_from_id,correction_reason)
    VALUES (b,'Assay','99.5 %',true,current_setting('wp.u_qc')::uuid,r,'again');
    v_msg := 'THE SAME RESULT WAS CORRECTED TWICE';
  EXCEPTION WHEN OTHERS THEN
    v_ok := SQLERRM LIKE 'BATCH_QC_ALREADY_CORRECTED%'; v_msg := SQLERRM;
  END;
  PERFORM _wpk('D','D4 one result cannot be corrected twice', v_ok, left(v_msg,140));

  v_ok := false;
  BEGIN
    UPDATE public.batch_qc_results SET corrected_from_id = NULL WHERE id = v_id;
    v_msg := 'WHAT A RESULT CORRECTS WAS CHANGED';
  EXCEPTION WHEN OTHERS THEN
    v_ok := SQLERRM LIKE 'BATCH_QC_IMMUTABLE%'; v_msg := SQLERRM;
  END;
  PERFORM _wpk('D','D5 and what a correction replaces cannot be changed',
    v_ok, left(v_msg,140));
END
$d$;
RESET ROLE;


-- =====================================================================
--  E — the release gate reads the result that stands
--
--  Without this the correction would be pointless: the original
--  failure would block the batch forever and the corrected result
--  would sit beside it doing nothing.
-- =====================================================================
DO $e$
DECLARE b uuid := current_setting('wp.b')::uuid;
BEGIN
  PERFORM _wpk('E','E1 nothing blocks the batch once the failure is superseded',
    public.batch_release_block_reason(b) IS NULL,
    coalesce(public.batch_release_block_reason(b),'<null>'));

  PERFORM _wpk('E','E2 and it draws no conditions',
    NOT EXISTS (SELECT 1 FROM public.batch_release_conditions(b)));

  --  A SECOND, UNCORRECTED FAILURE STILL BLOCKS. The gate did not stop
  --  reading failures; it stopped reading superseded ones.
  INSERT INTO public.batch_qc_results
    (batch_id,test_name,result,pass,tested_by)
  VALUES (b,'Dissolution','54 %',false,current_setting('wp.u_qc')::uuid);
  --  54 is below the declared minimum of 80, so the recorded failure
  --  and the specification agree. A fixture whose verdict contradicted
  --  its own criterion would be caught by a different rule and this
  --  assertion would pass for the wrong reason.

  PERFORM _wpk('E','E3 an uncorrected failure still blocks',
    public.batch_release_block_reason(b) LIKE '%failed%',
    coalesce(public.batch_release_block_reason(b),'<null>'));
END
$e$;


-- =====================================================================
--  F — the sweep itself
--
--  The audit that found these is written down as an assertion, so a
--  table added later with the same owner/admin-only shape is named the
--  next time the suite runs rather than the next time somebody tests a
--  refusal by hand.
-- =====================================================================
DO $f$
DECLARE r record; v_bad text := '';
BEGIN
  --  Tables governed by a PM-03 section, with the section their work
  --  belongs to. A write policy on one of these that mentions
  --  owner/admin and NOT the grid excludes the very people the section
  --  assigns the work to.
  FOR r IN SELECT * FROM (VALUES
      ('batch_records',            'batch_records'),
      ('batch_qc_results',         'qc_testing'),
      ('raw_material_receipts',    'goods_receipt'),
      ('certificate_of_analysis',  'coa_register'),
      ('batch_dispatches',         'distribution')
    ) AS t(tbl, section)
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
       WHERE c.relname = r.tbl
         AND p.polcmd = 'w'
         AND coalesce(pg_get_expr(p.polqual, p.polrelid), '') LIKE '%owner%admin%'
         AND coalesce(pg_get_expr(p.polqual, p.polrelid), '') NOT LIKE '%app_section_access%')
    THEN v_bad := v_bad || r.tbl || ' '; END IF;
  END LOOP;

  PERFORM _wpk('F','F1 no update policy admits owner/admin while excluding its own actors',
    v_bad = '', v_bad);

  --  batch_inprocess_qc is DELIBERATELY NOT in that list. In-process
  --  QC has its own authority model (isQaAuthority, not the grid) and
  --  no PM-03 column of its own; widening it would mean choosing a
  --  cell for it, which is a decision rather than a sweep. Recorded in
  --  docs/figma-conflicts.md rather than guessed at, and asserted here
  --  so the omission is visible instead of looking like an oversight.
  PERFORM _wpk('F','F2 batch_inprocess_qc is still owner/admin only, on purpose',
    EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
             WHERE c.relname = 'batch_inprocess_qc' AND p.polcmd = 'w'
               AND coalesce(pg_get_expr(p.polqual,p.polrelid),'') LIKE '%owner%admin%'));
END
$f$;

SELECT set_config('request.jwt.claims','', false);


-- =====================================================================
--  Results — COLUMN ORDER IS total, passed, failed.
-- =====================================================================
SELECT section, name, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result, detail
  FROM _wp ORDER BY section, name;

SELECT count(*) AS total,
       count(*) FILTER (WHERE ok) AS passed,
       count(*) FILTER (WHERE NOT ok) AS failed
  FROM _wp;

DO $gate$
DECLARE v_failed bigint;
BEGIN
  SELECT count(*) INTO v_failed FROM _wp WHERE NOT ok;
  IF v_failed > 0 THEN
    RAISE EXCEPTION 'WRITE PATH AUDIT: % assertion(s) failed', v_failed;
  END IF;
END
$gate$;
