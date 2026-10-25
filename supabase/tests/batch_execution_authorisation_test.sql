-- =====================================================================
--  PM-03's SECTION GRID ON BATCH EXECUTION
--
--  Covers 20261106000000_batch_execution_section_authorisation.sql.
--
--  THE CLAIM UNDER TEST is narrow and worth stating exactly: PM-03 gives
--  Act on `Batch records` to the Production supervisor and View to the
--  seven other roles it tabulates. Until 20261106000000 the database
--  checked company membership on every batch-execution write and nothing
--  else, so a Storekeeper with the anon key could start a stage, weigh
--  material into a batch, record readings and sign the stage off.
--
--  So the suite is mostly REFUSALS, for the reason material_chain_test
--  gives: a test that only walks the happy path cannot tell a working
--  gate from an absent one. The positive path is here to prove the
--  refusals are about the ROLE and not about a fixture that could never
--  have dispensed anything.
--
--  Sections:
--    A. The grid is in the database, in PM-03's shape
--    B. The guards are attached to the four write paths
--    C. A Production supervisor can run a batch end to end
--    D. A Storekeeper is refused every step of it
--    E. A QA Manager is refused too — View is not Act
--    F. A role PM-03 does not tabulate abstains
--    G. Eligibility and authorisation are different refusals
--    H. A direct write meets the same guard as the RPC
--
--  Fixtures are random per run and are not cleaned up, for the reason
--  item 07's and item 08's suites give: signatures, clearances and
--  dispensings refuse DELETE by design.
-- =====================================================================
\set ON_ERROR_STOP on
SET client_min_messages = warning;

RESET ROLE;
SELECT set_config('request.jwt.claims','', false);

CREATE TEMP TABLE _bx(section text, name text, ok boolean, detail text);
GRANT ALL ON _bx TO anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION _bxk(p_section text, p_name text, p_ok boolean, p_detail text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO _bx VALUES (p_section,p_name,coalesce(p_ok,false),p_detail); END $$;

--  The password scaffold every suite that signs needs.
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
--
--  Four work roles, chosen for what each proves:
--    u_ps  production_supervisor  the only Act on batch_records
--    u_sk  storekeeper            View — and Act on material_lots, so a
--                                 refusal here is not "no access at all"
--    u_qm  qa_manager             View, and the senior role in the file:
--                                 DB-01's "enforced for every role,
--                                 including admins"
--    u_un  member                 a role PM-03 does not tabulate
DO $fx$
DECLARE
  c_a  uuid := gen_random_uuid();
  u_ps uuid := gen_random_uuid();
  u_sk uuid := gen_random_uuid();
  u_qm uuid := gen_random_uuid();
  u_un uuid := gen_random_uuid();
  u_ow uuid := gen_random_uuid();
  tag  text := substr(replace(gen_random_uuid()::text,'-',''),1,8);
  p_a uuid; m_api uuid; f uuid; s1 uuid; fm uuid; spec uuid; ln uuid; bal uuid;
BEGIN
  PERFORM set_config('bx.c_a', c_a::text, false);
  PERFORM set_config('bx.u_ps', u_ps::text, false);
  PERFORM set_config('bx.u_sk', u_sk::text, false);
  PERFORM set_config('bx.u_qm', u_qm::text, false);
  PERFORM set_config('bx.u_un', u_un::text, false);
  PERFORM set_config('bx.u_ow', u_ow::text, false);

  INSERT INTO public.companies(id,name) VALUES (c_a,'PM03 Batch Works '||tag);

  INSERT INTO auth.users(id,email) VALUES
    (u_ps,'ps-'||tag||'@pm03.test'), (u_sk,'sk-'||tag||'@pm03.test'),
    (u_qm,'qm-'||tag||'@pm03.test'), (u_un,'un-'||tag||'@pm03.test'),
    (u_ow,'ow-'||tag||'@pm03.test');
  UPDATE auth.users SET encrypted_password = extensions.crypt('CorrectHorse1!', extensions.gen_salt('bf'))
   WHERE id IN (u_ps,u_sk,u_qm,u_un,u_ow);

  INSERT INTO public.profiles(id,email,full_name,company_id,role) VALUES
    (u_ps,'ps-'||tag||'@pm03.test','Chidi Supervisor',   c_a,'content_creator'),
    (u_sk,'sk-'||tag||'@pm03.test','Bisi Storekeeper',   c_a,'content_creator'),
    (u_qm,'qm-'||tag||'@pm03.test','Ngozi Quality',      c_a,'compliance_officer'),
    (u_un,'un-'||tag||'@pm03.test','Tunde Untabulated',  c_a,'content_creator'),
    (u_ow,'ow-'||tag||'@pm03.test','Adaeze Owner',       c_a,'admin');

  --  ::text everywhere this column is compared — it is the company_role
  --  enum on live and plain text here. See 20261104000000's header.
  INSERT INTO public.company_members(company_id,user_id,role,status) VALUES
    (c_a,u_ps,'production_supervisor','active'),
    (c_a,u_sk,'storekeeper','active'),
    (c_a,u_qm,'qa_manager','active'),
    (c_a,u_un,'member','active'),
    (c_a,u_ow,'owner','active');

  --  Lot numbers come from the company format (item 04). The tokens are
  --  UPPERCASE: a lowercase {prefix} is substituted by nothing and the
  --  lot number comes out as the literal pattern, which a "non-empty"
  --  assertion happily passes. material_chain_test learnt that one.
  INSERT INTO public.company_numbering_formats(company_id,scope,pattern,prefix,seq_width)
  VALUES (c_a,'material_lot','{PREFIX}-{SEQ}','BXL',4);

  --  The QA Manager is also the designated material QA authority, which
  --  is what lets the fixture release a lot through the real route.
  INSERT INTO public.material_qa_authorities(company_id,user_id,designated_by)
  VALUES (c_a,u_qm,u_ow);

  INSERT INTO public.products(id,company_id,product_code,trade_name,generic_name,category,created_by)
  VALUES (gen_random_uuid(),c_a,'PM03-'||tag,'Tablet Three','Paracetamol','drug_pharmaceutical',u_ow)
  RETURNING id INTO p_a;
  PERFORM set_config('bx.p_a', p_a::text, false);

  INSERT INTO public.materials(company_id,code,name,material_type,criticality,unit_of_measure,created_by)
  VALUES (c_a,'API3-'||tag,'Paracetamol powder','active_ingredient','critical','kg',u_ow)
  RETURNING id INTO m_api;
  PERFORM set_config('bx.m_api', m_api::text, false);

  INSERT INTO public.material_specifications(company_id,material_id,version,status,effective_date,created_by)
  VALUES (c_a,m_api,'1.0','effective',current_date-1,u_qm) RETURNING id INTO spec;
  INSERT INTO public.material_specification_parameters
    (specification_id,parameter,unit,limit_type,min_value,max_value,is_critical,sort_order)
  VALUES (spec,'Assay','%','range',98.0,102.0,true,10);

  INSERT INTO public.master_formulas(company_id,product_id,version,batch_size,batch_size_unit,created_by)
  VALUES (c_a,p_a,'1.0',1000,'litres',u_ow) RETURNING id INTO f;
  PERFORM set_config('bx.f', f::text, false);

  INSERT INTO public.master_formula_materials
    (formula_id,material_id,role,quantity_per_batch,unit,tolerance_pct,sort_order)
  VALUES (f,m_api,'active',24.0,'kg',2.0,10) RETURNING id INTO fm;
  PERFORM set_config('bx.fm', fm::text, false);

  --  ONE stage, requires_signoff false. A second signature is a
  --  separation-of-duties rule with its own suite (item 07); dragging it
  --  in here would mean a refusal in section C could be either rule.
  INSERT INTO public.master_formula_stages(formula_id,sequence_no,stage_code,name,requires_signoff)
  VALUES (f,1,'MIX','Mixing',false) RETURNING id INTO s1;

  INSERT INTO public.master_formula_stage_parameters
    (stage_id,parameter,parameter_type,unit,target_value,min_value,max_value,is_critical,sort_order)
  VALUES (s1,'Mixing speed','machine_setting','rpm',40,35,45,true,10);

  INSERT INTO public.production_lines(company_id,code,name,area,created_by)
  VALUES (c_a,'LINE-3','Tablet line 3','Block 1',u_ow) RETURNING id INTO ln;
  PERFORM set_config('bx.ln', ln::text, false);

  INSERT INTO public.instruments(company_id,code,name,instrument_type,location,owner_user_id,created_by)
  VALUES (c_a,'BAL-03','Bench balance 03','balance','Block 1',u_ps,u_ow)
  RETURNING id INTO bal;
  PERFORM set_config('bx.bal', bal::text, false);

  INSERT INTO public.instrument_calibrations
    (company_id, instrument_id, certificate_number, calibrated_on, due_on,
     performed_by_org, result, uploaded_by)
  VALUES (c_a, bal, 'CAL-2026-0103', current_date - 20, current_date + 345,
          'Lagos Metrology Services', 'pass', u_ow);
END
$fx$;

--  Registration, so a batch may be initiated at all.
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('bx.u_ow'), 'role','authenticated')::text, false);
SET ROLE authenticated;
DO $reg$
DECLARE c_a uuid := current_setting('bx.c_a')::uuid; p uuid := current_setting('bx.p_a')::uuid;
BEGIN
  PERFORM public.lifecycle_transition('product', p, 'start_regulatory_prep', c_a);
  PERFORM public.lifecycle_transition('product', p, 'submit_to_regulator',   c_a);
  PERFORM public.lifecycle_transition('product', p, 'record_registration',   c_a, NULL, 'NAFDAC listing granted');
END
$reg$;
RESET ROLE;

--  The formula is approved, and the lots released, by the designated QA
--  authority — who is the QA Manager, so the material_disposition step
--  guard from 20261104000000 is satisfied by the right person rather
--  than worked around.
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('bx.u_qm'), 'role','authenticated')::text, false);
SET ROLE authenticated;
DO $approve$
BEGIN PERFORM public.master_formula_approve(current_setting('bx.f')::uuid); END
$approve$;
RESET ROLE;

CREATE OR REPLACE FUNCTION _bx_lot(p_qty numeric, p_disposition text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  c_a uuid := current_setting('bx.c_a')::uuid;
  u_qm uuid := current_setting('bx.u_qm')::uuid;
  l uuid; r jsonb; coa uuid;
BEGIN
  INSERT INTO public.material_lots
    (company_id,material_id,quantity_received,quantity_available,unit_of_measure,created_by)
  VALUES (c_a,current_setting('bx.m_api')::uuid,p_qty,p_qty,'kg',u_qm) RETURNING id INTO l;

  IF p_disposition = 'quarantine' THEN RETURN l; END IF;

  --  A critical material cannot be released without a verified
  --  certificate of analysis. The fixture captures a real one rather
  --  than downgrading the material to make itself shorter.
  INSERT INTO public.material_certificates_of_analysis
    (company_id, material_lot_id, supplier_results, uploaded_by)
  VALUES (c_a, l, '[{"parameter":"Assay","stated_value":99.1}]'::jsonb, u_qm)
  RETURNING id INTO coa;
  PERFORM public.material_coa_verify(coa);

  PERFORM public.lifecycle_transition('material_lot', l, 'sample', c_a, u_qm, 'Sampled');
  r := public.sign_electronic_record(c_a,'material_lot',l,'release','released','CorrectHorse1!');
  IF (r->>'ok') <> 'true' THEN
    RAISE EXCEPTION 'FIXTURE: could not sign for lot release: %', r::text;
  END IF;
  PERFORM public.material_lot_release(l,(r->>'signature_id')::uuid,'full');
  RETURN l;
END $$;

SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('bx.u_qm'), 'role','authenticated')::text, false);
--  RESET ROLE, deliberately: these lots are scaffolding for the batch
--  under test, not the subject. Built in service context so nobody is
--  recorded as having received them — since 20261126000000 that is
--  written from the session, and decision 1 then refuses the
--  disposition to whoever received it. _bx_lot is SECURITY DEFINER and
--  cannot change role itself.
RESET ROLE;
DO $lots$
BEGIN
  PERFORM set_config('bx.lot_ok', _bx_lot(100,'approved')::text, false);
  PERFORM set_config('bx.lot_q',  _bx_lot(50,'quarantine')::text, false);
END
$lots$;
RESET ROLE;

DO $fxcheck$
BEGIN
  IF (SELECT status FROM public.material_lots WHERE id=current_setting('bx.lot_ok')::uuid) <> 'approved' THEN
    RAISE EXCEPTION 'FIXTURE: lot_ok should be approved, not %',
      (SELECT status FROM public.material_lots WHERE id=current_setting('bx.lot_ok')::uuid);
  END IF;
  IF (SELECT status FROM public.material_lots WHERE id=current_setting('bx.lot_q')::uuid) <> 'quarantine' THEN
    RAISE EXCEPTION 'FIXTURE: lot_q must stay in quarantine or section G proves nothing';
  END IF;
END
$fxcheck$;

--  Two batches, both initiated by the Production supervisor — who is the
--  one role PM-03 permits to create one. b1 is for the happy path, b2 is
--  kept untouched so the refusal sections act on a batch whose stage is
--  still at its first state.
CREATE OR REPLACE FUNCTION _bx_clear(p_batch uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  c_a uuid := current_setting('bx.c_a')::uuid; cl uuid; r jsonb; it record;
BEGIN
  PERFORM public.batch_record_assign_line(p_batch, current_setting('bx.ln')::uuid);
  r := public.line_clearance_open(p_batch);
  cl := (r->>'clearance_id')::uuid;
  FOR it IN SELECT item_code, requires_record_reference
              FROM public.line_clearance_check_results WHERE clearance_id = cl
  LOOP
    PERFORM public.line_clearance_answer(cl, it.item_code, 'pass',
      CASE WHEN it.requires_record_reference THEN 'REC-'||upper(substr(it.item_code,1,6)) END);
  END LOOP;
  PERFORM public.line_changeover_record(cl,'Swab test','pass','Clear on all sites',0.3,2.0,'ug/cm2');
  r := public.sign_electronic_record(c_a,'line_clearance',cl,'perform','authored','CorrectHorse1!');
  PERFORM public.line_clearance_perform(cl,(r->>'signature_id')::uuid);
  RETURN cl;
END $$;

SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('bx.u_ps'), 'role','authenticated')::text, false);
SET ROLE authenticated;
DO $batches$
DECLARE c_a uuid := current_setting('bx.c_a')::uuid; r jsonb; b uuid;
BEGIN
  r := public.batch_record_initiate(c_a,'BX-0001',current_setting('bx.p_a')::uuid,
         current_date, current_date+365, 1000,'litres');
  b := (r->>'batch_id')::uuid;
  PERFORM set_config('bx.b1', b::text, false);
  PERFORM set_config('bx.cl1', _bx_clear(b)::text, false);

  r := public.batch_record_initiate(c_a,'BX-0002',current_setting('bx.p_a')::uuid,
         current_date, current_date+365, 1000,'litres');
  b := (r->>'batch_id')::uuid;
  PERFORM set_config('bx.b2', b::text, false);
  PERFORM set_config('bx.cl2', _bx_clear(b)::text, false);
END
$batches$;
RESET ROLE;

--  The verifier's half of both clearances, by a different person.
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('bx.u_qm'), 'role','authenticated')::text, false);
SET ROLE authenticated;
DO $verify$
DECLARE c_a uuid := current_setting('bx.c_a')::uuid; r jsonb; cl uuid;
BEGIN
  FOREACH cl IN ARRAY ARRAY[current_setting('bx.cl1')::uuid, current_setting('bx.cl2')::uuid]
  LOOP
    r := public.sign_electronic_record(c_a,'line_clearance',cl,'verify','verified','CorrectHorse1!');
    PERFORM public.line_clearance_verify(cl,(r->>'signature_id')::uuid);
  END LOOP;
END
$verify$;
RESET ROLE;

DO $stageids$
BEGIN
  PERFORM set_config('bx.st1',
    (SELECT id::text FROM public.batch_stages
      WHERE batch_id = current_setting('bx.b1')::uuid ORDER BY sequence_no LIMIT 1), false);
  PERFORM set_config('bx.st2',
    (SELECT id::text FROM public.batch_stages
      WHERE batch_id = current_setting('bx.b2')::uuid ORDER BY sequence_no LIMIT 1), false);
  PERFORM set_config('bx.par',
    (SELECT p.id::text FROM public.master_formula_stage_parameters p
       JOIN public.master_formula_stages s ON s.id = p.stage_id
      WHERE s.formula_id = current_setting('bx.f')::uuid LIMIT 1), false);
END
$stageids$;


-- =====================================================================
--  A — the grid is in the database, in PM-03's shape
-- =====================================================================
DO $a$
DECLARE v_batch text; v_cells bigint; v_act text;
BEGIN
  SELECT count(*) INTO v_cells FROM public.section_permissions;
  PERFORM _bxk('A','A1 the grid holds 11 sections x 8 roles', v_cells = 88, v_cells::text);

  --  The batch_records column, read down in PM-03's own ROW order —
  --  procurement first, management last — not alphabetically by role,
  --  which would put compliance_admin at the top and make the string
  --  unreadable against the frame. One Act, seven View.
  SELECT string_agg(access, ' ' ORDER BY ord) INTO v_batch
    FROM public.section_permissions sp
    JOIN (VALUES ('procurement',1),('storekeeper',2),('qc_analyst',3),('qa_officer',4),
                 ('qa_manager',5),('production_supervisor',6),('compliance_admin',7),
                 ('management',8)) AS r(role, ord) ON r.role = sp.role
   WHERE sp.section = 'batch_records';
  PERFORM _bxk('A','A2 batch_records is Act for exactly one role',
    v_batch = 'none view view view view act view view', v_batch);

  SELECT string_agg(role, ',' ORDER BY role) INTO v_act
    FROM public.section_permissions WHERE section = 'batch_records' AND access = 'act';
  PERFORM _bxk('A','A3 and that role is the production supervisor',
    v_act = 'production_supervisor', v_act);

  --  A section no column covers must RAISE, not pass. Guarding a new
  --  table with a misspelled section would otherwise grant everyone
  --  access to it.
  BEGIN
    PERFORM public.app_assert_section_act(current_setting('bx.c_a')::uuid, 'batch_recrods');
    PERFORM _bxk('A','A4 an unknown section is refused, not permitted', false,
      'app_assert_section_act returned for a section with no column');
  EXCEPTION WHEN OTHERS THEN
    PERFORM _bxk('A','A4 an unknown section is refused, not permitted',
      SQLERRM LIKE 'SECTION_UNKNOWN%', SQLERRM);
  END;
END
$a$;


-- =====================================================================
--  B — the guards are attached to the four write paths
--
--  Asserting attachment is not asserting enforcement — 20261105000000
--  exists because a trigger was attached and never fired — so sections
--  C to H do the enforcing. B is here so a dropped trigger is named
--  directly rather than showing up as five confusing failures.
-- =====================================================================
DO $b$
DECLARE r record; v_missing text := '';
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('batch_records','trg_batch_records_section_role'),
      ('batch_stages','trg_batch_stages_section_role'),
      ('batch_stage_parameter_readings','trg_batch_readings_section_role'),
      ('dispensing_records','trg_dispensing_section_role')
    ) AS t(tbl, trg)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger tg JOIN pg_class c ON c.oid = tg.tgrelid
       WHERE c.relname = r.tbl AND tg.tgname = r.trg AND NOT tg.tgisinternal)
    THEN v_missing := v_missing || r.tbl || '.' || r.trg || ' '; END IF;
  END LOOP;
  PERFORM _bxk('B','B1 all four section guards are attached', v_missing = '', v_missing);
END
$b$;

--  Every section a guard names must exist as a column, or that guard
--  refuses every write instead of authorising. This is the same
--  self-discovering check as section G of work_role_authorisation_test,
--  and it was proven to fail by planting a guard with a bad section.
DO $b2$
DECLARE r record; v_bad text := '';
BEGIN
  FOR r IN
    SELECT p.proname, m[1] AS section
      FROM pg_proc p
      CROSS JOIN LATERAL regexp_matches(
        pg_get_functiondef(p.oid),
        'app_assert_section_act\([^,]+,\s*''([a-z_]+)''\)', 'g') AS m
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.proname LIKE 'fn_%_section_role'
  LOOP
    IF NOT EXISTS (SELECT 1 FROM public.section_permissions
                    WHERE section = r.section) THEN
      v_bad := v_bad || r.proname || ' -> ' || r.section || ' ';
    END IF;
  END LOOP;
  PERFORM _bxk('B','B2 no guard asserts on a section with no column', v_bad = '', v_bad);
END
$b2$;


-- =====================================================================
--  C — a Production supervisor can run a batch end to end
--
--  The positive half, and the reason the refusals below mean anything:
--  the same fixture, the same batch, the same lot.
-- =====================================================================
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('bx.u_ps'), 'role','authenticated')::text, false);
SET ROLE authenticated;

DO $c$
DECLARE
  c_a uuid := current_setting('bx.c_a')::uuid;
  st  uuid := current_setting('bx.st1')::uuid;
  r jsonb; v_sig uuid; v_blockers bigint;
BEGIN
  PERFORM _bxk('C','C0 the supervisor''s cell is Act',
    public.app_section_access(c_a,'batch_records') = 'act',
    public.app_section_access(c_a,'batch_records'));

  BEGIN
    r := public.batch_stage_start(st);
    PERFORM _bxk('C','C1 the supervisor can start a stage',
      (SELECT status FROM public.batch_stages WHERE id = st) = 'in_progress',
      (SELECT status FROM public.batch_stages WHERE id = st));
  EXCEPTION WHEN OTHERS THEN
    PERFORM _bxk('C','C1 the supervisor can start a stage', false, SQLERRM);
  END;

  BEGIN
    r := public.batch_stage_record_reading(st, current_setting('bx.par')::uuid, 40, NULL);
    PERFORM _bxk('C','C2 and record a reading, in specification',
      (r->>'in_specification') = 'true', r::text);
  EXCEPTION WHEN OTHERS THEN
    PERFORM _bxk('C','C2 and record a reading, in specification', false, SQLERRM);
  END;

  BEGIN
    r := public.material_dispense(current_setting('bx.b1')::uuid,
           current_setting('bx.lot_ok')::uuid, 24.0, current_setting('bx.bal')::uuid,
           current_setting('bx.fm')::uuid, st);
    PERFORM _bxk('C','C3 and dispense an approved lot into the batch',
      (r->>'dispensing_id') IS NOT NULL AND (r->>'tolerance_exception') = 'false', r::text);
  EXCEPTION WHEN OTHERS THEN
    PERFORM _bxk('C','C3 and dispense an approved lot into the batch', false, SQLERRM);
  END;

  --  Nothing outstanding, so the completion is about authorisation and
  --  not about a half-finished stage.
  SELECT count(*) INTO v_blockers
    FROM public.batch_stage_completion_blockers(st);
  PERFORM _bxk('C','C4 the stage has no outstanding blockers', v_blockers = 0, v_blockers::text);

  BEGIN
    r := public.sign_electronic_record(c_a,'batch_stage',st,'complete','authored','CorrectHorse1!');
    v_sig := (r->>'signature_id')::uuid;
    r := public.batch_stage_complete(st, v_sig, NULL, NULL);
    PERFORM _bxk('C','C5 and sign the stage complete',
      (SELECT status FROM public.batch_stages WHERE id = st) = 'complete',
      (SELECT status FROM public.batch_stages WHERE id = st));
  EXCEPTION WHEN OTHERS THEN
    PERFORM _bxk('C','C5 and sign the stage complete', false, SQLERRM);
  END;
END
$c$;
RESET ROLE;


-- =====================================================================
--  D — a Storekeeper is refused every step of it
--
--  The Storekeeper is the sharpest case in the file: PM-03 gives them
--  Act on Goods receipt and Material lots, so these refusals cannot be
--  explained away as a member with no access to anything.
-- =====================================================================
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('bx.u_sk'), 'role','authenticated')::text, false);
SET ROLE authenticated;

DO $d$
DECLARE
  c_a uuid := current_setting('bx.c_a')::uuid;
  st  uuid := current_setting('bx.st2')::uuid;
  v_before text; r jsonb;
BEGIN
  PERFORM _bxk('D','D0 the storekeeper''s cell is View, not Act',
    public.app_section_access(c_a,'batch_records') = 'view',
    public.app_section_access(c_a,'batch_records'));

  --  ... and Act on material lots, so the refusals below are about the
  --  section and not about the person.
  PERFORM _bxk('D','D0b while their material_lots cell is Act',
    public.app_section_access(c_a,'material_lots') = 'act',
    public.app_section_access(c_a,'material_lots'));

  SELECT status INTO v_before FROM public.batch_stages WHERE id = st;

  BEGIN
    r := public.batch_stage_start(st);
    PERFORM _bxk('D','D1 starting a stage is refused', false, 'it was allowed');
  EXCEPTION WHEN OTHERS THEN
    PERFORM _bxk('D','D1 starting a stage is refused', SQLERRM LIKE 'SECTION_FORBIDDEN%', SQLERRM);
  END;
  PERFORM _bxk('D','D2 and the stage did not move',
    (SELECT status FROM public.batch_stages WHERE id = st) = v_before,
    (SELECT status FROM public.batch_stages WHERE id = st));

  BEGIN
    r := public.batch_stage_record_reading(st, current_setting('bx.par')::uuid, 40, NULL);
    PERFORM _bxk('D','D3 recording a reading is refused', false, 'it was allowed');
  EXCEPTION WHEN OTHERS THEN
    PERFORM _bxk('D','D3 recording a reading is refused',
      SQLERRM LIKE 'SECTION_FORBIDDEN%' OR SQLERRM LIKE 'BATCH_STAGE_NOT_IN_PROGRESS%', SQLERRM);
  END;

  BEGIN
    r := public.material_dispense(current_setting('bx.b2')::uuid,
           current_setting('bx.lot_ok')::uuid, 24.0, current_setting('bx.bal')::uuid,
           current_setting('bx.fm')::uuid);
    PERFORM _bxk('D','D4 dispensing into a batch is refused', false, 'it was allowed');
  EXCEPTION WHEN OTHERS THEN
    PERFORM _bxk('D','D4 dispensing into a batch is refused',
      SQLERRM LIKE 'SECTION_FORBIDDEN%', SQLERRM);
  END;

  BEGIN
    r := public.batch_record_initiate(c_a,'BX-SK-01',current_setting('bx.p_a')::uuid,
           current_date, current_date+365, 1000,'litres');
    PERFORM _bxk('D','D5 initiating a batch is refused', false, 'it was allowed');
  EXCEPTION WHEN OTHERS THEN
    PERFORM _bxk('D','D5 initiating a batch is refused',
      SQLERRM LIKE 'SECTION_FORBIDDEN%', SQLERRM);
  END;

  PERFORM _bxk('D','D6 and no batch was created',
    NOT EXISTS (SELECT 1 FROM public.batch_records
                 WHERE company_id = c_a AND batch_number = 'BX-SK-01'));

  --  Nothing was weighed, either. A refusal that still decremented the
  --  lot would be worse than no refusal, because the stock figure is
  --  what a recall is scoped from.
  PERFORM _bxk('D','D7 and the lot was not decremented',
    (SELECT quantity_available FROM public.material_lots
      WHERE id = current_setting('bx.lot_ok')::uuid) = 76.0,
    (SELECT quantity_available::text FROM public.material_lots
      WHERE id = current_setting('bx.lot_ok')::uuid));
END
$d$;
RESET ROLE;


-- =====================================================================
--  E — a QA Manager is refused too
--
--  DB-01 prints "Enforced for every role, including admins" under its
--  own permission card. The QA Manager is the most powerful role PM-03
--  tabulates — Act on seven of eleven sections — and View on this one.
-- =====================================================================
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('bx.u_qm'), 'role','authenticated')::text, false);
SET ROLE authenticated;

DO $e$
DECLARE
  c_a uuid := current_setting('bx.c_a')::uuid;
  st  uuid := current_setting('bx.st2')::uuid;
  r jsonb;
BEGIN
  PERFORM _bxk('E','E0 the QA Manager''s cell is View',
    public.app_section_access(c_a,'batch_records') = 'view',
    public.app_section_access(c_a,'batch_records'));

  --  ... and Act on batch RELEASE, which is the distinction the whole
  --  grid turns on: deciding a batch is not running one.
  PERFORM _bxk('E','E0b while their batch_release cell is Act',
    public.app_section_access(c_a,'batch_release') = 'act',
    public.app_section_access(c_a,'batch_release'));

  BEGIN
    r := public.batch_stage_start(st);
    PERFORM _bxk('E','E1 starting a stage is refused', false, 'it was allowed');
  EXCEPTION WHEN OTHERS THEN
    PERFORM _bxk('E','E1 starting a stage is refused', SQLERRM LIKE 'SECTION_FORBIDDEN%', SQLERRM);
  END;

  BEGIN
    r := public.material_dispense(current_setting('bx.b2')::uuid,
           current_setting('bx.lot_ok')::uuid, 24.0, current_setting('bx.bal')::uuid,
           current_setting('bx.fm')::uuid);
    PERFORM _bxk('E','E2 dispensing is refused', false, 'it was allowed');
  EXCEPTION WHEN OTHERS THEN
    PERFORM _bxk('E','E2 dispensing is refused', SQLERRM LIKE 'SECTION_FORBIDDEN%', SQLERRM);
  END;

  --  The refusal names the role that may act, so the person reading it
  --  knows who to fetch rather than only that they cannot proceed.
  BEGIN
    PERFORM public.app_assert_section_act(c_a,'batch_records');
    PERFORM _bxk('E','E3 the refusal names who may act', false, 'no refusal');
  EXCEPTION WHEN OTHERS THEN
    PERFORM _bxk('E','E3 the refusal names who may act',
      SQLERRM LIKE '%qa_manager%' AND SQLERRM LIKE '%batch_records%', SQLERRM);
  END;
END
$e$;
RESET ROLE;


-- =====================================================================
--  F — a role PM-03 does not tabulate abstains
--
--  Same silence as app_assert_step, handled the same way and for the
--  same reason: refusing on it would lock every workspace created
--  before work roles were set out of its own production.
-- =====================================================================
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('bx.u_un'), 'role','authenticated')::text, false);
SET ROLE authenticated;

DO $f$
DECLARE
  c_a uuid := current_setting('bx.c_a')::uuid;
  st  uuid := current_setting('bx.st2')::uuid;
  r jsonb;
BEGIN
  PERFORM _bxk('F','F1 an untabulated role has no cell, not a "none" cell',
    public.app_section_access(c_a,'batch_records') IS NULL,
    coalesce(public.app_section_access(c_a,'batch_records'),'<null>'));

  BEGIN
    PERFORM public.app_assert_section_act(c_a,'batch_records');
    PERFORM _bxk('F','F2 and the assertion abstains rather than refusing', true);
  EXCEPTION WHEN OTHERS THEN
    PERFORM _bxk('F','F2 and the assertion abstains rather than refusing', false, SQLERRM);
  END;

  BEGIN
    r := public.batch_stage_start(st);
    PERFORM _bxk('F','F3 so they can still start a stage',
      (SELECT status FROM public.batch_stages WHERE id = st) = 'in_progress',
      (SELECT status FROM public.batch_stages WHERE id = st));
  EXCEPTION WHEN OTHERS THEN
    PERFORM _bxk('F','F3 so they can still start a stage', false, SQLERRM);
  END;
END
$f$;
RESET ROLE;


-- =====================================================================
--  G — eligibility and authorisation are different refusals
--
--  A screen has to tell "you may not do this" from "that lot may not be
--  used". They are different sentences, different error codes, and a
--  single boolean would have collapsed them.
-- =====================================================================
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('bx.u_ps'), 'role','authenticated')::text, false);
SET ROLE authenticated;

DO $g$
DECLARE r jsonb; v_code text;
BEGIN
  --  Right role, wrong lot: the quarantine gate refuses, not the grid.
  --
  --  THE QUANTITY IS THE FORMULA'S OWN 24 kg, DELIBERATELY. The first
  --  version of this assertion asked for 10 kg and passed — on
  --  DISPENSE_AUTHORISATION_REQUIRED, because 10 against a required 24
  --  is out of tolerance. It never reached the quarantine gate at all,
  --  and a condition of "not SECTION_FORBIDDEN and mentions DISPENSE"
  --  was loose enough not to notice. Asking for exactly the required
  --  quantity leaves quarantine as the only remaining objection, and
  --  the code is now matched exactly rather than by substring.
  BEGIN
    r := public.material_dispense(current_setting('bx.b2')::uuid,
           current_setting('bx.lot_q')::uuid, 24.0, current_setting('bx.bal')::uuid,
           current_setting('bx.fm')::uuid);
    PERFORM _bxk('G','G1 an authorised role is still refused a quarantined lot', false,
      'it was allowed');
  EXCEPTION WHEN OTHERS THEN
    PERFORM _bxk('G','G1 an authorised role is still refused a quarantined lot',
      SQLERRM LIKE 'MATERIAL_DISPENSE_BLOCKED%', SQLERRM);
  END;

  --  And the quarantined lot is still there afterwards.
  PERFORM _bxk('G','G2 and that lot is untouched',
    (SELECT quantity_available FROM public.material_lots
      WHERE id = current_setting('bx.lot_q')::uuid) = 50.0,
    (SELECT quantity_available::text FROM public.material_lots
      WHERE id = current_setting('bx.lot_q')::uuid));

  --  dispensable_lots is the picker's source and must not offer the
  --  quarantined one. "Unapproved lots selectable then refused: no."
  PERFORM _bxk('G','G3 the picker does not offer the quarantined lot',
    NOT EXISTS (SELECT 1 FROM public.dispensable_lots(
                  current_setting('bx.b2')::uuid, current_setting('bx.m_api')::uuid)
                 WHERE lot_id = current_setting('bx.lot_q')::uuid));
END
$g$;
RESET ROLE;


-- =====================================================================
--  H — a direct write meets the same guard as the RPC
--
--  The whole argument for putting these on the tables rather than inside
--  the functions. The browser holds the anon key and can address
--  PostgREST directly.
-- =====================================================================
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('bx.u_sk'), 'role','authenticated')::text, false);
SET ROLE authenticated;

DO $h$
DECLARE
  c_a uuid := current_setting('bx.c_a')::uuid;
  st  uuid := current_setting('bx.st2')::uuid;
BEGIN
  --  TWO GUARDS CAN REFUSE THIS ONE, AND THE OLDER ONE WINS.
  --  batch_stages.status is derived from the lifecycle engine and already
  --  read-only to a direct write (BATCH_STAGE_STATUS_READ_ONLY), so that
  --  refusal arrives before the section guard is consulted. Both are
  --  refusals and either is correct here; what this asserts is that the
  --  write does not land, not which trigger stopped it. The section
  --  guard's own enforcement on this table is proven by D1 and E1, which
  --  go through batch_stage_start() and come back SECTION_FORBIDDEN.
  BEGIN
    UPDATE public.batch_stages SET status = 'complete' WHERE id = st;
    PERFORM _bxk('H','H1 a direct UPDATE of a stage status is refused', false, 'it was allowed');
  EXCEPTION WHEN OTHERS THEN
    PERFORM _bxk('H','H1 a direct UPDATE of a stage status is refused',
      SQLERRM LIKE 'SECTION_FORBIDDEN%'
        OR SQLERRM LIKE 'BATCH_STAGE_STATUS_READ_ONLY%'
        OR SQLERRM LIKE '%row-level security%', SQLERRM);
  END;

  BEGIN
    INSERT INTO public.batch_stage_parameter_readings
      (company_id, batch_stage_id, formula_parameter_id, parameter_name,
       parameter_type, reading_value, recorded_by)
    VALUES (c_a, st, current_setting('bx.par')::uuid, 'Mixing speed',
            'machine_setting', 40, current_setting('bx.u_sk')::uuid);
    PERFORM _bxk('H','H2 a direct INSERT of a reading is refused', false, 'it was allowed');
  EXCEPTION WHEN OTHERS THEN
    PERFORM _bxk('H','H2 a direct INSERT of a reading is refused',
      SQLERRM LIKE 'SECTION_FORBIDDEN%' OR SQLERRM LIKE '%row-level security%', SQLERRM);
  END;

  BEGIN
    INSERT INTO public.batch_records
      (company_id, batch_number, product_name, product_id, manufacturing_date,
       expiry_date, batch_size, unit, created_by)
    VALUES (c_a, 'BX-SK-DIRECT', 'Tablet Three', current_setting('bx.p_a')::uuid,
            current_date, current_date+365, 1000, 'litres', current_setting('bx.u_sk')::uuid);
    PERFORM _bxk('H','H3 a direct INSERT of a batch record is refused', false, 'it was allowed');
  EXCEPTION WHEN OTHERS THEN
    PERFORM _bxk('H','H3 a direct INSERT of a batch record is refused',
      SQLERRM LIKE 'SECTION_FORBIDDEN%' OR SQLERRM LIKE '%row-level security%', SQLERRM);
  END;
END
$h$;
RESET ROLE;
SELECT set_config('request.jwt.claims','', false);


-- =====================================================================
--  Results
--
--  COLUMN ORDER IS total, passed, failed. The harness reads columns 2
--  and 3 as passed and failed; material_release_readiness_test.sql
--  documents the trap above its own summary, and getting it wrong once
--  printed 23 green assertions as "0 passed, 23 failed".
-- =====================================================================
SELECT section, name, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result, detail
  FROM _bx ORDER BY section, name;

SELECT count(*) AS total,
       count(*) FILTER (WHERE ok) AS passed,
       count(*) FILTER (WHERE NOT ok) AS failed
  FROM _bx;

DO $gate$
DECLARE v_failed bigint;
BEGIN
  SELECT count(*) INTO v_failed FROM _bx WHERE NOT ok;
  IF v_failed > 0 THEN
    RAISE EXCEPTION 'BATCH EXECUTION AUTHORISATION: % assertion(s) failed', v_failed;
  END IF;
END
$gate$;
