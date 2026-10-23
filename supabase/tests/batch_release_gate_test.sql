-- =====================================================================
--  FINISHED QC AND BATCH RELEASE, AS TWO WORKFLOWS
--
--  Covers 20261107000000_batch_release_gate_and_finished_qc.sql.
--
--  THE CLAIM UNDER TEST. Before that migration a batch record had no
--  release gate. Material lots had one — fn_material_lots_release_gate
--  calls material_lot_release_block_reason and refuses on a sentence —
--  and batches had only guards about the PRODUCT (registered? licence
--  current?) and the PERSON (a QA Manager?). Nothing looked at whether
--  the batch passed its finished-product tests. A batch with no
--  results, with a failed result, or with a result carrying no verdict
--  could be released by a QA Manager in good standing.
--
--  The lifecycle forced the batch through `qc_in_progress`, which is a
--  state somebody moved it into. Reaching the QC state and passing QC
--  are different facts and only the first was held anywhere.
--
--  WHAT "DO NOT EQUATE QC COMPLETION WITH RELEASE" MEANS HERE, and
--  section F is the whole of it: recording a passing result is a QC
--  Analyst's act in PM-03's `QC testing` column. It authorises nothing.
--  It removes an objection. The release is a separate decision, in a
--  separate column, reserved to a separate person, and it still needs
--  an electronic signature that the QC Analyst cannot provide.
--
--  Sections:
--    A. The two columns are held by different roles
--    B. No results at all
--    C. A failed result
--    D. A result with no verdict
--    E. A passing result, released properly — the positive path
--    F. QC completion is not release authorisation
--    G. PM-03's electronic signature
--    H. Separation of duties: the tester may not release
--    I. Who may record a finished-product result
-- =====================================================================
\set ON_ERROR_STOP on
SET client_min_messages = warning;

RESET ROLE;
SELECT set_config('request.jwt.claims','', false);

CREATE TEMP TABLE _br(section text, name text, ok boolean, detail text);
GRANT ALL ON _br TO anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION _brk(p_section text, p_name text, p_ok boolean, p_detail text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO _br VALUES (p_section,p_name,coalesce(p_ok,false),p_detail); END $$;

DO $scaffold$
DECLARE v_ext text;
BEGIN
  IF to_regprocedure('extensions.crypt(text,text)') IS NULL THEN
    SELECT n.nspname INTO v_ext FROM pg_extension e
      JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname='pgcrypto';
    IF v_ext IS NULL THEN
      CREATE EXTENSION IF NOT EXISTS pgcrypto;
      SELECT n.nspname INTO v_ext FROM pg_extension e
        JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname='pgcrypto';
    END IF;
    CREATE SCHEMA IF NOT EXISTS extensions;
    EXECUTE format('CREATE OR REPLACE FUNCTION extensions.crypt(text,text) RETURNS text
                    LANGUAGE sql IMMUTABLE STRICT AS $f$SELECT %I.crypt($1,$2)$f$', v_ext);
    EXECUTE format('CREATE OR REPLACE FUNCTION extensions.gen_salt(text) RETURNS text
                    LANGUAGE sql VOLATILE STRICT AS $f$SELECT %I.gen_salt($1)$f$', v_ext);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='auth' AND table_name='users'
                    AND column_name='encrypted_password') THEN
    ALTER TABLE auth.users ADD COLUMN encrypted_password text;
  END IF;
END
$scaffold$;


-- ── fixtures ─────────────────────────────────────────────────────────
DO $fx$
DECLARE
  c_a  uuid := gen_random_uuid();
  u_ps uuid := gen_random_uuid();   -- production_supervisor: runs batches
  u_qc uuid := gen_random_uuid();   -- qc_analyst: records finished QC
  u_qm uuid := gen_random_uuid();   -- qa_manager: releases
  u_qo uuid := gen_random_uuid();   -- qa_officer: Act on the section, not the step
  u_ow uuid := gen_random_uuid();
  tag  text := substr(replace(gen_random_uuid()::text,'-',''),1,8);
  p_a uuid; f uuid; m_api uuid; spec_p uuid := gen_random_uuid();
BEGIN
  PERFORM set_config('br.c_a', c_a::text, false);
  PERFORM set_config('br.u_ps', u_ps::text, false);
  PERFORM set_config('br.u_qc', u_qc::text, false);
  PERFORM set_config('br.u_qm', u_qm::text, false);
  PERFORM set_config('br.u_qo', u_qo::text, false);
  PERFORM set_config('br.u_ow', u_ow::text, false);

  INSERT INTO public.companies(id,name) VALUES (c_a,'Release Gate Works '||tag);

  INSERT INTO auth.users(id,email) VALUES
    (u_ps,'ps-'||tag||'@brg.test'), (u_qc,'qc-'||tag||'@brg.test'),
    (u_qm,'qm-'||tag||'@brg.test'), (u_qo,'qo-'||tag||'@brg.test'),
    (u_ow,'ow-'||tag||'@brg.test');
  UPDATE auth.users SET encrypted_password = extensions.crypt('CorrectHorse1!', extensions.gen_salt('bf'))
   WHERE id IN (u_ps,u_qc,u_qm,u_qo,u_ow);

  INSERT INTO public.profiles(id,email,full_name,company_id,role) VALUES
    (u_ps,'ps-'||tag||'@brg.test','Chidi Supervisor', c_a,'content_creator'),
    (u_qc,'qc-'||tag||'@brg.test','Amaka Analyst',    c_a,'content_creator'),
    (u_qm,'qm-'||tag||'@brg.test','Ngozi Quality',    c_a,'compliance_officer'),
    (u_qo,'qo-'||tag||'@brg.test','Femi Officer',     c_a,'compliance_officer'),
    (u_ow,'ow-'||tag||'@brg.test','Adaeze Owner',     c_a,'admin');

  INSERT INTO public.company_members(company_id,user_id,role,status) VALUES
    (c_a,u_ps,'production_supervisor','active'),
    (c_a,u_qc,'qc_analyst','active'),
    (c_a,u_qm,'qa_manager','active'),
    (c_a,u_qo,'qa_officer','active'),
    (c_a,u_ow,'owner','active');

  INSERT INTO public.material_qa_authorities(company_id,user_id,designated_by)
  VALUES (c_a,u_qm,u_ow);

  INSERT INTO public.products(id,company_id,product_code,trade_name,generic_name,category,created_by)
  VALUES (gen_random_uuid(),c_a,'BRG-'||tag,'Tablet Release','Paracetamol','drug_pharmaceutical',u_ow)
  RETURNING id INTO p_a;
  PERFORM set_config('br.p_a', p_a::text, false);

  --  A formula needs a bill of materials before it can be approved,
  --  so the material is real rather than the formula being empty.
  INSERT INTO public.materials(company_id,code,name,material_type,criticality,unit_of_measure,created_by)
  VALUES (c_a,'APIR-'||tag,'Paracetamol powder','active_ingredient','standard','kg',u_ow)
  RETURNING id INTO m_api;

  INSERT INTO public.master_formulas(company_id,product_id,version,batch_size,batch_size_unit,created_by)
  VALUES (c_a,p_a,'1.0',1000,'litres',u_ow) RETURNING id INTO f;
  INSERT INTO public.master_formula_materials
    (formula_id,material_id,role,quantity_per_batch,unit,tolerance_pct,sort_order)
  VALUES (f,m_api,'active',24.0,'kg',2.0,10);
  INSERT INTO public.master_formula_stages(formula_id,sequence_no,stage_code,name,requires_signoff)
  VALUES (f,1,'MIX','Mixing',false);
  PERFORM set_config('br.f', f::text, false);

  --  A FINISHED-PRODUCT SPECIFICATION, which 20261113000000 requires
  --  before any batch of this product can be released. One required
  --  test, Assay, 98.0 to 102.0 % — so sections B to E are about the
  --  RESULTS, with the specification satisfied and out of the way.
  --  Section I tests the specification itself.
  INSERT INTO public.product_specifications
    (id,company_id,product_id,version,status,created_by)
  VALUES (spec_p,c_a,p_a,'1.0','draft',u_ow);
  INSERT INTO public.product_specification_tests
    (specification_id,test_name,test_method,limit_type,min_value,max_value,unit,is_required)
  VALUES (spec_p,'Assay','HPLC','range',98,102,'%',true);
  UPDATE public.product_specifications
     SET status='effective', approved_by=u_qm, approved_at=now(),
         approved_by_role='service', effective_date=current_date - 1
   WHERE id = spec_p;
  PERFORM set_config('br.spec', spec_p::text, false);
END
$fx$;

SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('br.u_ow'), 'role','authenticated')::text, false);
SET ROLE authenticated;
DO $reg$
DECLARE c_a uuid := current_setting('br.c_a')::uuid; p uuid := current_setting('br.p_a')::uuid;
BEGIN
  PERFORM public.lifecycle_transition('product', p, 'start_regulatory_prep', c_a);
  PERFORM public.lifecycle_transition('product', p, 'submit_to_regulator',   c_a);
  PERFORM public.lifecycle_transition('product', p, 'record_registration',   c_a, NULL, 'NAFDAC listing granted');
END
$reg$;
RESET ROLE;

SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('br.u_qm'), 'role','authenticated')::text, false);
SET ROLE authenticated;
DO $approve$
BEGIN PERFORM public.master_formula_approve(current_setting('br.f')::uuid); END
$approve$;
RESET ROLE;

--  Five batches, each walked to qc_in_progress. Initiated by the
--  Production supervisor because 20261106000000 reserves that to them.
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('br.u_ps'), 'role','authenticated')::text, false);
SET ROLE authenticated;
DO $batches$
DECLARE
  c_a uuid := current_setting('br.c_a')::uuid; r jsonb; b uuid; k text;
BEGIN
  FOREACH k IN ARRAY ARRAY['b_none','b_fail','b_null','b_pass','b_self'] LOOP
    r := public.batch_record_initiate(c_a, 'BRG-'||upper(replace(k,'_','')),
           current_setting('br.p_a')::uuid, current_date, current_date+365, 1000,'litres');
    b := (r->>'batch_id')::uuid;
    PERFORM public.lifecycle_transition('batch_record', b, 'close_execution', c_a);
    PERFORM public.lifecycle_transition('batch_record', b, 'submit_for_qc',   c_a);
    PERFORM public.lifecycle_transition('batch_record', b, 'start_qc',        c_a);
    PERFORM set_config('br.'||k, b::text, false);
  END LOOP;
END
$batches$;
RESET ROLE;

--  The QC Analyst records the finished-product results. This is the
--  only place results are written in this suite, by the only role
--  PM-03 gives Act on `QC testing`.
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('br.u_qc'), 'role','authenticated')::text, false);
SET ROLE authenticated;
DO $results$
DECLARE
  u_qc uuid := current_setting('br.u_qc')::uuid;
  c_a  uuid := current_setting('br.c_a')::uuid;
  b_f  uuid := current_setting('br.b_fail')::uuid;
  b_p  uuid := current_setting('br.b_pass')::uuid;
  r jsonb;
BEGIN
  --  SIGNED, since 20261127000000. The release gate reads `pass` and
  --  the value, so the analyst attests to them as they are recorded.
  --  The signature is taken over the verdict rather than the row, so
  --  the suite cannot sign one result and write another.
  r := public.quality_verdict_sign('batch_qc_result', c_a, b_f,
         'Assay', '88.1 %', false, 'CorrectHorse1!');
  INSERT INTO public.batch_qc_results
    (batch_id, test_name, test_method, specification, result, pass, tested_by, signature_id)
  VALUES (b_f,'Assay','HPLC','98.0 - 102.0 %','88.1 %', false, u_qc,
          (r->>'signature_id')::uuid);

  r := public.quality_verdict_sign('batch_qc_result', c_a, b_p,
         'Assay', '99.4 %', true, 'CorrectHorse1!');
  INSERT INTO public.batch_qc_results
    (batch_id, test_name, test_method, specification, result, pass, tested_by, signature_id)
  VALUES (b_p,'Assay','HPLC','98.0 - 102.0 %','99.4 %', true, u_qc,
          (r->>'signature_id')::uuid);
END
$results$;
RESET ROLE;

--  b_self's result is recorded by the QA MANAGER, so section H can show
--  that the person who tested it cannot also release it. Recorded in a
--  service context because a QA Manager has View on `QC testing` and
--  section I proves that refusal separately — using the refused route
--  to build the fixture would make H untestable.
DO $selfresult$
BEGIN
  INSERT INTO public.batch_qc_results
    (batch_id, test_name, test_method, specification, result, pass, tested_by)
  VALUES (current_setting('br.b_self')::uuid,'Assay','HPLC','98.0 - 102.0 %','99.6 %', true,
          current_setting('br.u_qm')::uuid);
END
$selfresult$;

--  Signing helper: the real route, with a password, so the signature is
--  bound to this caller, this record and this action the way
--  lifecycle_consume_signature requires.
CREATE OR REPLACE FUNCTION _br_sign(p_batch uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE r jsonb;
BEGIN
  r := public.sign_electronic_record(current_setting('br.c_a')::uuid,
         'batch_record', p_batch, 'release', 'released', 'CorrectHorse1!');
  IF (r->>'ok') <> 'true' THEN
    RAISE EXCEPTION 'FIXTURE: could not sign for release: %', r::text;
  END IF;
  RETURN (r->>'signature_id')::uuid;
END $$;


-- =====================================================================
--  A — the two columns are held by different roles
-- =====================================================================
DO $a$
DECLARE c_a uuid := current_setting('br.c_a')::uuid; v text;
BEGIN
  SELECT string_agg(role, ',' ORDER BY role) INTO v
    FROM public.section_permissions WHERE section = 'qc_testing' AND access = 'act';
  PERFORM _brk('A','A1 QC testing is Act for the QC analyst alone',
    v = 'qc_analyst', v);

  --  THE QA MANAGER ALONE. An earlier version of the seed gave the QA
  --  Officer act here too, and this assertion was written to match it;
  --  both were wrong. roleAccess.ts has View for that cell, and
  --  src/tests/sectionGrid.test.ts now compares the two grids so the
  --  transposition cannot come back.
  SELECT string_agg(role, ',' ORDER BY role) INTO v
    FROM public.section_permissions WHERE section = 'batch_release' AND access = 'act';
  PERFORM _brk('A','A2 batch release is Act for the QA manager alone',
    v = 'qa_manager', v);

  --  And the STEP is narrower than the section: PM-03's step table
  --  reserves "Release a batch" to the QA Manager, with a signature.
  SELECT array_to_string(roles, ',') INTO v
    FROM public.step_permissions WHERE step = 'batch_release';
  PERFORM _brk('A','A3 but the release STEP is the QA manager only',
    v = 'qa_manager', v);

  PERFORM _brk('A','A4 nobody holds Act on both columns',
    NOT EXISTS (
      SELECT 1 FROM public.section_permissions a
        JOIN public.section_permissions b ON b.role = a.role
       WHERE a.section = 'qc_testing' AND a.access = 'act'
         AND b.section = 'batch_release' AND b.access = 'act'));

  --  PM-03 records that the release needs an e-signature. Until
  --  20261107000000 that was recorded in step_permissions.needs and
  --  read by nothing; the lifecycle engine's own column was false.
  PERFORM _brk('A','A5 step_permissions still records the signature requirement',
    (SELECT needs FROM public.step_permissions WHERE step='batch_release') = 'signature');

  PERFORM _brk('A','A6 and the lifecycle transition now enforces it',
    (SELECT t.requires_signature
       FROM public.lifecycle_transitions t
       JOIN public.lifecycle_definitions d ON d.id = t.definition_id
       JOIN public.lifecycle_states s ON s.id = t.to_state_id
      WHERE d.entity_type='batch_record' AND s.state_key='released'
        AND t.action_key='release'));
END
$a$;


-- =====================================================================
--  B to E — what the gate reads, as the QA Manager
-- =====================================================================
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('br.u_qm'), 'role','authenticated')::text, false);
SET ROLE authenticated;

DO $bcde$
DECLARE
  c_a uuid := current_setting('br.c_a')::uuid;
  b uuid; v_sig uuid; v_msg text; v_ok boolean;
BEGIN
  -- ── B. no results at all ──
  b := current_setting('br.b_none')::uuid;
  --  NAMED, not counted. "no results have been recorded" told somebody
  --  nothing about what to do; the specification knows which test is
  --  missing and the sentence says which.
  PERFORM _brk('B','B1 the block reason names the test the specification requires',
    public.batch_release_block_reason(b) LIKE '%requires Assay, and no result has been recorded%',
    public.batch_release_block_reason(b));

  v_ok := false;
  BEGIN
    v_sig := _br_sign(b);
    PERFORM public.lifecycle_transition('batch_record', b, 'release', c_a,
      current_setting('br.u_qm')::uuid, NULL, '{}'::jsonb, v_sig);
    v_msg := 'AN UNTESTED BATCH WAS RELEASED';
  EXCEPTION WHEN OTHERS THEN
    v_ok := SQLERRM LIKE 'BATCH_RELEASE_BLOCKED%'; v_msg := SQLERRM;
  END;
  PERFORM _brk('B','B2 and a signed release by the right role is still refused', v_ok, left(v_msg,160));

  PERFORM _brk('B','B3 the batch did not move',
    (SELECT status FROM public.batch_records WHERE id=b) = 'qc_in_progress',
    (SELECT status FROM public.batch_records WHERE id=b));

  --  The same answer as a row a screen can draw, from the same facts.
  PERFORM _brk('B','B4 the condition rows say the same thing',
    EXISTS (SELECT 1 FROM public.batch_release_conditions(b)
             WHERE condition_key='qc_missing' AND severity='blocked'));

  --  A blocked condition carries no "continue with" — there is nobody
  --  to authorise past it. floorConditions treats a blocked row with a
  --  continuation as malformed.
  PERFORM _brk('B','B5 and the blocked row offers no way past it',
    NOT EXISTS (SELECT 1 FROM public.batch_release_conditions(b)
                 WHERE severity='blocked' AND continue_with IS NOT NULL));

  -- ── C. a failed result ──
  b := current_setting('br.b_fail')::uuid;
  PERFORM _brk('C','C1 a failed test is named as the reason',
    public.batch_release_block_reason(b) LIKE '%failed%',
    public.batch_release_block_reason(b));

  v_ok := false;
  BEGIN
    v_sig := _br_sign(b);
    PERFORM public.lifecycle_transition('batch_record', b, 'release', c_a,
      current_setting('br.u_qm')::uuid, NULL, '{}'::jsonb, v_sig);
    v_msg := 'A BATCH WITH A FAILED TEST WAS RELEASED';
  EXCEPTION WHEN OTHERS THEN
    v_ok := SQLERRM LIKE 'BATCH_RELEASE_BLOCKED%'; v_msg := SQLERRM;
  END;
  PERFORM _brk('C','C2 and the release is refused', v_ok, left(v_msg,160));

  PERFORM _brk('C','C3 the condition row is qc_failed',
    EXISTS (SELECT 1 FROM public.batch_release_conditions(b) WHERE condition_key='qc_failed'));

  -- ── D. a result with no verdict cannot exist ──
  --
  --  THE GUARD THAT IS DELIBERATELY ABSENT. An earlier draft of
  --  20261107000000 blocked release on a result with pass IS NULL.
  --  batch_qc_results.pass is NOT NULL, so that branch could never have
  --  fired — a guard installed, attached and silently dead, which is
  --  the exact failure 20261105000000 was written about. It was removed
  --  and this is what stands in its place: an assertion that the case
  --  is unrepresentable, which fails the day it stops being so.
  b := current_setting('br.b_null')::uuid;
  v_ok := false;
  BEGIN
    INSERT INTO public.batch_qc_results(batch_id, test_name, result, pass, tested_by)
    VALUES (b, 'Assay', 'pending', NULL, current_setting('br.u_qc')::uuid);
    v_msg := 'AN UNRESOLVED RESULT WAS RECORDED';
  EXCEPTION WHEN OTHERS THEN
    --  Two refusals are possible and either proves the point: the QA
    --  Manager has View on QC testing, so the section guard may answer
    --  first. What must never happen is the row being accepted.
    v_ok := SQLERRM LIKE '%null value in column "pass"%'
         OR SQLERRM LIKE '%not-null%'
         OR SQLERRM LIKE 'SECTION_FORBIDDEN%'; v_msg := SQLERRM;
  END;
  PERFORM _brk('D','D1 a result with no verdict cannot be recorded at all',
    v_ok, left(v_msg,160));

  --  So a batch sitting in qc_in_progress with nothing recorded is
  --  indistinguishable from one nobody has started testing, and is
  --  refused by B's rule rather than by a rule of its own.
  PERFORM _brk('D','D2 so an untested batch falls to the missing-required-test rule',
    public.batch_release_block_reason(b) LIKE '%requires Assay%',
    public.batch_release_block_reason(b));

  -- ── E. the positive path ──
  --
  --  THE REASON B, C AND D MEAN ANYTHING. Same company, same product,
  --  same formula, same role, same signing route — one passing result
  --  recorded by somebody else is the whole difference.
  b := current_setting('br.b_pass')::uuid;
  PERFORM _brk('E','E1 nothing blocks a batch whose test passed',
    public.batch_release_block_reason(b) IS NULL,
    coalesce(public.batch_release_block_reason(b),'<null>'));

  PERFORM _brk('E','E2 and it draws no conditions',
    NOT EXISTS (SELECT 1 FROM public.batch_release_conditions(b)));

  --  ── THE NEGATIVE TEST FOR THE SIGNATURE REQUIREMENT ──
  --
  --  Run HERE, on this batch, at this moment, because this is the only
  --  point in the suite where the signature is the ONLY thing left
  --  standing between a caller and a released batch: the gate has no
  --  objection (E1), the batch draws no conditions (E2), the caller is
  --  the QA Manager who holds `batch_release` Act, and the batch has
  --  not been released yet.
  --
  --  Anywhere else a refusal would be ambiguous — B2 is refused by the
  --  gate and F2 by the role — so neither proves the signature
  --  requirement bites. This does.
  v_ok := false;
  BEGIN
    PERFORM public.lifecycle_transition('batch_record', b, 'release', c_a,
      current_setting('br.u_qm')::uuid, NULL, '{}'::jsonb, NULL);
    v_msg := 'RELEASED WITH NO SIGNATURE';
  EXCEPTION WHEN OTHERS THEN
    v_ok := SQLERRM LIKE 'LIFECYCLE_SIGNATURE_REQUIRED%'; v_msg := SQLERRM;
  END;
  PERFORM _brk('E','E2b an unsigned release is refused though nothing else objects',
    v_ok, left(v_msg,160));

  PERFORM _brk('E','E2c and the refused batch did not move',
    (SELECT status FROM public.batch_records WHERE id=b) = 'qc_in_progress',
    (SELECT status FROM public.batch_records WHERE id=b));

  v_ok := false;
  BEGIN
    v_sig := _br_sign(b);
    PERFORM public.lifecycle_transition('batch_record', b, 'release', c_a,
      current_setting('br.u_qm')::uuid, NULL, '{}'::jsonb, v_sig);
    v_ok := true; v_msg := 'released';
  EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM;
  END;
  PERFORM _brk('E','E3 the QA manager releases it', v_ok, left(v_msg,160));

  PERFORM _brk('E','E4 and the batch is released',
    (SELECT status FROM public.batch_records WHERE id=b) = 'released',
    (SELECT status FROM public.batch_records WHERE id=b));

  --  Checked after RESET ROLE below: electronic_signature_consumptions
  --  is not readable by the authenticated session that created it.
  PERFORM set_config('br.sig_pass', v_sig::text, false);
END
$bcde$;
RESET ROLE;

--  The signature was CONSUMED, not merely presented. Read as a service
--  context because the consumption table is not visible to the
--  authenticated session that produced the row.
DO $e5$
BEGIN
  PERFORM _brk('E','E5 the signature was consumed, so it cannot be reused',
    EXISTS (SELECT 1 FROM public.electronic_signature_consumptions
             WHERE signature_id = current_setting('br.sig_pass')::uuid));
END
$e5$;


-- =====================================================================
--  F — QC completion is not release authorisation
--
--  The instruction this file was written around, as an assertion rather
--  than a comment. The QC Analyst recorded the passing result on
--  b_pass; that act did not let them release it, and the gate that
--  stops them is not the QC gate.
-- =====================================================================
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('br.u_qc'), 'role','authenticated')::text, false);
SET ROLE authenticated;

DO $f$
DECLARE
  c_a uuid := current_setting('br.c_a')::uuid;
  b uuid := current_setting('br.b_none')::uuid; v_msg text; v_ok boolean := false;
BEGIN
  --  Not "view" — PM-03 gives the QC Analyst NO access to the batch
  --  release column at all. The person who runs the test cannot even
  --  see the decision screen.
  PERFORM _brk('F','F1 the analyst who tests has no access to batch release',
    public.app_section_access(c_a,'batch_release') = 'none',
    public.app_section_access(c_a,'batch_release'));

  --  A batch whose QC the analyst completed: b_pass is already
  --  released, so F2 uses one that is not, to show the refusal is about
  --  the PERSON and not about the batch's state.
  BEGIN
    PERFORM public.lifecycle_transition('batch_record', b, 'release', c_a,
      current_setting('br.u_qc')::uuid);
    v_msg := 'THE QC ANALYST RELEASED A BATCH';
  EXCEPTION WHEN OTHERS THEN
    v_ok := SQLERRM LIKE 'STEP_FORBIDDEN%'
         OR SQLERRM LIKE 'LIFECYCLE_SIGNATURE_REQUIRED%'; v_msg := SQLERRM;
  END;
  PERFORM _brk('F','F2 and cannot release a batch', v_ok, left(v_msg,160));

  --  THE POINT, STATED DIRECTLY. Completing QC on b_pass removed an
  --  objection; it conferred nothing. The analyst's cell is unchanged
  --  by the act of testing.
  PERFORM _brk('F','F3 completing QC did not change what the analyst may do',
    public.app_section_access(c_a,'batch_release') = 'none'
    AND NOT EXISTS (SELECT 1 FROM public.step_permissions
                     WHERE step='batch_release' AND 'qc_analyst' = ANY(roles)));
END
$f$;
RESET ROLE;

--  The QA Officer is refused twice over: View on the batch_release
--  section, and not a holder of the release step either. Both of
--  PM-03's statements agree, which is worth asserting because an
--  earlier seed had them disagreeing — through a transcription error
--  in the seed, not through anything in the design.
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('br.u_qo'), 'role','authenticated')::text, false);
SET ROLE authenticated;

DO $f2$
DECLARE
  c_a uuid := current_setting('br.c_a')::uuid;
  --  b_self, NOT b_none. The release gate runs before the step guard,
  --  so on an untested batch this assertion came back
  --  BATCH_RELEASE_BLOCKED and proved nothing about the step. b_self
  --  carries a passing result the QA Officer did not record, which
  --  leaves the step guard as the only thing able to refuse.
  b uuid := current_setting('br.b_self')::uuid; v_msg text; v_ok boolean := false;
BEGIN
  PERFORM _brk('F','F4 the QA officer has View on the batch release section',
    public.app_section_access(c_a,'batch_release') = 'view',
    public.app_section_access(c_a,'batch_release'));

  BEGIN
    PERFORM public.lifecycle_transition('batch_record', b, 'release', c_a,
      current_setting('br.u_qo')::uuid, NULL, '{}'::jsonb, _br_sign(b));
    v_msg := 'THE QA OFFICER PERFORMED THE RELEASE STEP';
  EXCEPTION WHEN OTHERS THEN
    v_ok := SQLERRM LIKE 'STEP_FORBIDDEN%'; v_msg := SQLERRM;
  END;
  PERFORM _brk('F','F5 and is refused the release step as well', v_ok, left(v_msg,160));
END
$f2$;
RESET ROLE;


-- =====================================================================
--  G — PM-03's electronic signature
-- =====================================================================
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('br.u_qm'), 'role','authenticated')::text, false);
SET ROLE authenticated;

DO $g$
DECLARE
  c_a uuid := current_setting('br.c_a')::uuid;
  b uuid := current_setting('br.b_self')::uuid; v_msg text; v_ok boolean := false;
BEGIN
  --  Unsigned, by the right role, on a batch with a passing result.
  --  The only thing missing is the signature.
  BEGIN
    PERFORM public.lifecycle_transition('batch_record', b, 'release', c_a,
      current_setting('br.u_qm')::uuid);
    v_msg := 'RELEASED WITH NO SIGNATURE';
  EXCEPTION WHEN OTHERS THEN
    v_ok := SQLERRM LIKE 'LIFECYCLE_SIGNATURE_REQUIRED%'; v_msg := SQLERRM;
  END;
  PERFORM _brk('G','G1 an unsigned release is refused', v_ok, left(v_msg,160));

  --  A signature for a DIFFERENT action does not stand in for this one.
  v_ok := false;
  BEGIN
    PERFORM public.lifecycle_transition('batch_record', b, 'release', c_a,
      current_setting('br.u_qm')::uuid, NULL, '{}'::jsonb,
      (public.sign_electronic_record(c_a,'batch_record',b,'hold','reviewed','CorrectHorse1!')
        ->>'signature_id')::uuid);
    v_msg := 'A SIGNATURE FOR ANOTHER ACTION WAS ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    v_ok := SQLERRM LIKE 'LIFECYCLE_SIGNATURE_MISMATCH%'; v_msg := SQLERRM;
  END;
  PERFORM _brk('G','G2 a signature for another action is refused', v_ok, left(v_msg,160));
END
$g$;
RESET ROLE;


-- =====================================================================
--  H — separation of duties
--
--  b_self carries a PASSING result recorded by the QA Manager. The QC
--  gate has nothing to object to. The refusal is about who recorded it.
-- =====================================================================
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('br.u_qm'), 'role','authenticated')::text, false);
SET ROLE authenticated;

DO $h$
DECLARE
  c_a uuid := current_setting('br.c_a')::uuid;
  b uuid := current_setting('br.b_self')::uuid; v_msg text; v_ok boolean := false;
BEGIN
  PERFORM _brk('H','H1 the QC gate has no objection to this batch',
    public.batch_release_block_reason(b) IS NULL,
    coalesce(public.batch_release_block_reason(b),'<null>'));

  BEGIN
    PERFORM public.lifecycle_transition('batch_record', b, 'release', c_a,
      current_setting('br.u_qm')::uuid, NULL, '{}'::jsonb, _br_sign(b));
    v_msg := 'THE TESTER RELEASED THEIR OWN BATCH';
  EXCEPTION WHEN OTHERS THEN
    v_ok := SQLERRM LIKE 'BATCH_RELEASE_SELF_TESTED%'; v_msg := SQLERRM;
  END;
  PERFORM _brk('H','H2 but the person who recorded the results may not release it',
    v_ok, left(v_msg,160));

  PERFORM _brk('H','H3 and the batch did not move',
    (SELECT status FROM public.batch_records WHERE id=b) = 'qc_in_progress',
    (SELECT status FROM public.batch_records WHERE id=b));
END
$h$;
RESET ROLE;


-- =====================================================================
--  I — who may record a finished-product result
-- =====================================================================
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('br.u_ps'), 'role','authenticated')::text, false);
SET ROLE authenticated;

DO $i$
DECLARE v_msg text; v_ok boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.batch_qc_results(batch_id, test_name, result, pass, tested_by)
    VALUES (current_setting('br.b_none')::uuid,'Assay','99.0 %', true,
            current_setting('br.u_ps')::uuid);
    v_msg := 'THE PRODUCTION SUPERVISOR RECORDED A QC RESULT';
  EXCEPTION WHEN OTHERS THEN
    v_ok := SQLERRM LIKE 'SECTION_FORBIDDEN%'; v_msg := SQLERRM;
  END;
  PERFORM _brk('I','I1 a production supervisor cannot record a finished QC result',
    v_ok, left(v_msg,160));
END
$i$;
RESET ROLE;

SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('br.u_qm'), 'role','authenticated')::text, false);
SET ROLE authenticated;
DO $i2$
DECLARE v_msg text; v_ok boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.batch_qc_results(batch_id, test_name, result, pass, tested_by)
    VALUES (current_setting('br.b_none')::uuid,'Assay','99.0 %', true,
            current_setting('br.u_qm')::uuid);
    v_msg := 'THE QA MANAGER RECORDED A QC RESULT';
  EXCEPTION WHEN OTHERS THEN
    v_ok := SQLERRM LIKE 'SECTION_FORBIDDEN%'; v_msg := SQLERRM;
  END;
  PERFORM _brk('I','I2 nor can a QA manager, who has View on QC testing',
    v_ok, left(v_msg,160));
END
$i2$;
RESET ROLE;

SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('br.u_qc'), 'role','authenticated')::text, false);
SET ROLE authenticated;
DO $i3$
DECLARE v_msg text; v_ok boolean := false;
BEGIN
  BEGIN
    --  WITH A SIGNATURE, since 20261127000000. The point of I3 is that
    --  the analyst is the one who may record a verdict; what they now
    --  do is attest to it as they record it.
    INSERT INTO public.batch_qc_results
      (batch_id, test_name, result, pass, tested_by, signature_id)
    VALUES (current_setting('br.b_none')::uuid,'Dissolution','82 %', true,
            current_setting('br.u_qc')::uuid,
            (public.quality_verdict_sign('batch_qc_result',
               current_setting('br.c_a')::uuid, current_setting('br.b_none')::uuid,
               'Dissolution', '82 %', true, 'CorrectHorse1!')->>'signature_id')::uuid);
    v_ok := true; v_msg := 'recorded';
  EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM;
  END;
  PERFORM _brk('I','I3 the QC analyst can, with a signature', v_ok, left(v_msg,160));
END
$i3$;
RESET ROLE;
SELECT set_config('request.jwt.claims','', false);


-- =====================================================================
--  Results
--
-- =====================================================================
--  J — THE POSTCONDITION, AND THAT A MISMATCH FAILS RATHER THAN PASSES
--
--  20261107000000 installs the signature requirement with an UPDATE
--  matched on four values: entity_type `batch_record`, from_state
--  `qc_in_progress`, to_state `released`, action `release`. If the
--  target database differs in any of them the UPDATE matches zero
--  rows, REPORTS SUCCESS, and the requirement is silently absent.
--
--  20261201000000 turns that silence into a failure, and exposes the
--  same logic read-only for the operator checklist. These assertions
--  are about the detection, not the requirement: they break the
--  transition four different ways and confirm each is caught.
--
--  Every mutation below is reverted in the same block, and J9 proves
--  the schema was left as it was found.
-- =====================================================================
RESET ROLE;

DO $j$
DECLARE
  v_tid uuid; v_from uuid; v_to uuid; v_other uuid; v_defn uuid;
BEGIN
  --  The postcondition holds as the migrations leave it.
  PERFORM _brk('J','J1 the postcondition passes on this schema',
    public.batch_release_signature_postcondition() IS NULL,
    coalesce(public.batch_release_signature_postcondition(),'(pass)'));

  SELECT t.id, t.from_state_id, t.to_state_id, t.definition_id
    INTO v_tid, v_from, v_to, v_defn
    FROM public.lifecycle_transitions t
    JOIN public.lifecycle_definitions d ON d.id = t.definition_id
    JOIN public.lifecycle_states s      ON s.id = t.to_state_id
   WHERE d.entity_type = 'batch_record' AND s.state_key = 'released';

  PERFORM _brk('J','J2 exactly one transition reaches released',
    v_tid IS NOT NULL
    AND (SELECT count(*) FROM public.lifecycle_transitions t
           JOIN public.lifecycle_definitions d ON d.id = t.definition_id
           JOIN public.lifecycle_states s ON s.id = t.to_state_id
          WHERE d.entity_type='batch_record' AND s.state_key='released') = 1);

  --  (a) THE REQUIREMENT SWITCHED OFF. The case that matters most,
  --  because it is the state the live database is in before this
  --  branch deploys.
  UPDATE public.lifecycle_transitions SET requires_signature = false WHERE id = v_tid;
  PERFORM _brk('J','J3 requires_signature=false is caught as UNSIGNED',
    public.batch_release_signature_postcondition() LIKE 'UNSIGNED:%',
    left(coalesce(public.batch_release_signature_postcondition(),'(pass)'), 90));
  UPDATE public.lifecycle_transitions SET requires_signature = true WHERE id = v_tid;

  --  (b) A DIFFERENT ACTION KEY. 20261107000000's UPDATE would match
  --  zero rows against this schema.
  UPDATE public.lifecycle_transitions SET action_key = 'release_batch' WHERE id = v_tid;
  PERFORM _brk('J','J4 a renamed action is caught as MISMATCHED',
    public.batch_release_signature_postcondition() LIKE 'MISMATCHED:%',
    left(coalesce(public.batch_release_signature_postcondition(),'(pass)'), 90));
  UPDATE public.lifecycle_transitions SET action_key = 'release' WHERE id = v_tid;

  --  (c) A DIFFERENT FROM-STATE.
  SELECT id INTO v_other FROM public.lifecycle_states
   WHERE definition_id = v_defn AND state_key = 'qc_pending';
  UPDATE public.lifecycle_transitions SET from_state_id = v_other WHERE id = v_tid;
  PERFORM _brk('J','J5 a different from-state is caught as MISMATCHED',
    public.batch_release_signature_postcondition() LIKE 'MISMATCHED:%',
    left(coalesce(public.batch_release_signature_postcondition(),'(pass)'), 90));
  UPDATE public.lifecycle_transitions SET from_state_id = v_from WHERE id = v_tid;

  --  (d) NO TRANSITION REACHES `released` AT ALL. Redirected rather
  --  than deleted: a transition that has been used is protected by a
  --  foreign key from entity_state_history, which is itself worth
  --  knowing — history cannot be orphaned by tidying the rules.
  SELECT id INTO v_other FROM public.lifecycle_states
   WHERE definition_id = v_defn AND state_key = 'rejected';
  UPDATE public.lifecycle_transitions SET to_state_id = v_other WHERE id = v_tid;
  PERFORM _brk('J','J6 no route into released is caught as MISSING, not as a pass',
    public.batch_release_signature_postcondition() LIKE 'MISSING:%',
    left(coalesce(public.batch_release_signature_postcondition(),'(pass)'), 90));
  UPDATE public.lifecycle_transitions SET to_state_id = v_to WHERE id = v_tid;

  --  THE POINT OF J6, SAID SEPARATELY. The obvious verification query
  --  returns ZERO ROWS in that state, and an operator reading
  --  "(0 rows)" can tick the box. The function cannot be misread.
  PERFORM _brk('J','J7 and the naive query would have returned an empty result there',
    (SELECT count(*) FROM public.lifecycle_transitions t
       JOIN public.lifecycle_definitions d ON d.id = t.definition_id
       JOIN public.lifecycle_states s ON s.id = t.to_state_id
      WHERE d.entity_type='batch_record' AND s.state_key='released'
        AND t.requires_signature) = 1);

  --  (e) The engine must be the only door in.
  PERFORM _brk('J','J8 entity_current_state is not writable by an app role',
    NOT EXISTS (SELECT 1 FROM information_schema.role_table_grants
                 WHERE table_schema='public' AND table_name='entity_current_state'
                   AND grantee IN ('anon','authenticated')
                   AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE')),
    (SELECT string_agg(DISTINCT grantee||':'||privilege_type,', ')
       FROM information_schema.role_table_grants
      WHERE table_schema='public' AND table_name='entity_current_state'
        AND grantee IN ('anon','authenticated')
        AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE')));

  --  AND THE SCHEMA IS BACK AS IT WAS. A test that probes by mutating
  --  must prove it put everything back, or it has quietly become a
  --  migration.
  PERFORM _brk('J','J9 every probe was reverted',
    public.batch_release_signature_postcondition() IS NULL,
    coalesce(public.batch_release_signature_postcondition(),'(pass)'));
END
$j$;


-- =====================================================================
--  COLUMN ORDER IS total, passed, failed — the harness reads columns 2
--  and 3 as passed and failed.
-- =====================================================================
SELECT section, name, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result, detail
  FROM _br ORDER BY section, name;

SELECT count(*) AS total,
       count(*) FILTER (WHERE ok) AS passed,
       count(*) FILTER (WHERE NOT ok) AS failed
  FROM _br;

DO $gate$
DECLARE v_failed bigint;
BEGIN
  SELECT count(*) INTO v_failed FROM _br WHERE NOT ok;
  IF v_failed > 0 THEN
    RAISE EXCEPTION 'BATCH RELEASE GATE: % assertion(s) failed', v_failed;
  END IF;
END
$gate$;
