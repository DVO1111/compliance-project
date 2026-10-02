-- =====================================================================
--  WEEK 3 / ITEM 06 — MATERIAL TESTING AND RELEASE
--
--  This suite signs for real. sign_electronic_record() verifies a
--  password against auth.users.encrypted_password, so the fixtures set
--  genuine bcrypt hashes and every release below goes through the same
--  path a QA person would. Asserting release against a stubbed signature
--  would prove nothing about the gate that matters most.
--
--  A. Tests configurable per material
--  B. A result captures all eight required things, and the verdict is ours
--  C. Release blocked: incomplete or failing required tests
--  D. Release blocked: unverified certificate (item 05, re-asserted here)
--  E. Release requires a designated QA authority
--  F. Release requires an electronic signature
--  G. Conditional release
--  H. Rejection disposition
--  I. The "NOT DONE IF" clauses
--  J. Tenancy
-- =====================================================================
\set ON_ERROR_STOP on
SET client_min_messages = warning;

CREATE TEMP TABLE _r6(section text, name text, ok boolean, detail text);
CREATE OR REPLACE FUNCTION _r6k(p_section text, p_name text, p_ok boolean, p_detail text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO _r6 VALUES (p_section,p_name,coalesce(p_ok,false),p_detail); END $$;

--  The esig subsystem needs extensions.crypt and
--  auth.users.encrypted_password. Both exist on Supabase; scaffold them
--  here if this cluster's auth stub lacks them, exactly as
--  electronic_signature_test.sql does.
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

DO $fix$
DECLARE
  c_a uuid := '00000000-0000-4000-d000-0000000000a1';
  c_b uuid := '00000000-0000-4000-d000-0000000000b1';
  u_qa uuid := '00000000-0000-4000-d000-0000000000a2';   -- designated QA, admin
  u_co uuid := '00000000-0000-4000-d000-0000000000a3';   -- compliance_officer, NOT designated
  u_cc uuid := '00000000-0000-4000-d000-0000000000a4';   -- content_creator
  u_b  uuid := '00000000-0000-4000-d000-0000000000b2';
  m uuid; spec uuid; p_assay uuid; p_water uuid; p_id uuid;
BEGIN
  DELETE FROM public.material_lot_rejections      WHERE company_id IN (c_a,c_b);
  DELETE FROM public.material_lot_release_records WHERE company_id IN (c_a,c_b);
  DELETE FROM public.material_test_results        WHERE company_id IN (c_a,c_b);
  DELETE FROM public.material_test_definitions    WHERE company_id IN (c_a,c_b);
  DELETE FROM public.material_qa_authorities      WHERE company_id IN (c_a,c_b);
  DELETE FROM public.material_coa_discrepancies   WHERE company_id IN (c_a,c_b);
  DELETE FROM public.material_certificates_of_analysis WHERE company_id IN (c_a,c_b);
  DELETE FROM public.material_specification_parameters
   WHERE specification_id IN (SELECT id FROM public.material_specifications WHERE company_id IN (c_a,c_b));
  DELETE FROM public.material_specifications      WHERE company_id IN (c_a,c_b);
  DELETE FROM public.material_lot_alerts          WHERE company_id IN (c_a,c_b);
  --  electronic_signatures is deliberately NOT cleaned: it is immutable,
  --  and a DELETE is refused by prevent_electronic_signature_mutation().
  --  That is correct — a signature is evidence — so the suite lets them
  --  accumulate across runs instead. An earlier version of this fixture
  --  tried to delete them, which made the suite pass once and then abort
  --  on every subsequent run.
  --  The traceability chain is signature -> consumption -> history row,
  --  and both foreign keys are ON DELETE RESTRICT, so the history row of
  --  a signed transition cannot be removed while its consumption exists.
  --  That is the point of the chain, and it means this fixture has to
  --  unwind it in order rather than deleting the lot and hoping.
  --
  --  Worth noting beyond the test: in production this makes a released
  --  lot undeletable, which is the correct GMP answer and not something
  --  to work around.
  DELETE FROM public.electronic_signature_consumptions
   WHERE history_id IN (SELECT id FROM public.entity_state_history
                         WHERE entity_type='material_lot' AND company_id IN (c_a,c_b));
  DELETE FROM public.entity_state_history WHERE entity_type='material_lot' AND company_id IN (c_a,c_b);
  DELETE FROM public.entity_current_state WHERE entity_type='material_lot' AND company_id IN (c_a,c_b);
  DELETE FROM public.material_lots                WHERE company_id IN (c_a,c_b);
  DELETE FROM public.materials                    WHERE company_id IN (c_a,c_b);
  DELETE FROM public.company_numbering_formats    WHERE company_id IN (c_a,c_b);

  --  sign_electronic_record() locks a signer out after repeated failures
  --  in a 15-minute window — real brute-force protection. This suite
  --  deliberately probes failures (a content_creator signing, a wrong
  --  password), so without clearing the window those probes accumulate
  --  across runs and eventually lock out the signer the later sections
  --  need. That made the suite pass, then fail, then abort at a
  --  different point each run.
  DELETE FROM public.electronic_signature_attempts
   WHERE user_id IN (u_qa,u_co,u_cc,u_b) OR company_id IN (c_a,c_b);

  INSERT INTO public.companies(id,name) VALUES (c_a,'Release Pharma') ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.companies(id,name) VALUES (c_b,'Elsewhere Ltd')  ON CONFLICT (id) DO NOTHING;

  INSERT INTO auth.users(id,email) VALUES
    (u_qa,'qa@release.test'),(u_co,'co@release.test'),
    (u_cc,'cc@release.test'),(u_b,'admin@elsewhere.test')
  ON CONFLICT (id) DO NOTHING;
  --  Real bcrypt, so verify_user_password() is genuinely exercised.
  UPDATE auth.users SET encrypted_password = extensions.crypt('CorrectHorse1!', extensions.gen_salt('bf'))
   WHERE id IN (u_qa,u_co,u_cc,u_b);

  INSERT INTO public.profiles(id,email,full_name,company_id,role) VALUES
    (u_qa,'qa@release.test','Adaeze Okonkwo',c_a,'admin'),
    (u_co,'co@release.test','Bode Adeyemi',c_a,'compliance_officer'),
    (u_cc,'cc@release.test','Chika Nwosu',c_a,'content_creator'),
    (u_b ,'admin@elsewhere.test','Far Away',c_b,'admin')
  ON CONFLICT (id) DO UPDATE SET company_id=excluded.company_id, role=excluded.role,
                                 full_name=excluded.full_name;
  INSERT INTO public.company_members(company_id,user_id,role) VALUES
    (c_a,u_qa,'admin'),(c_a,u_co,'member'),(c_a,u_cc,'member'),(c_b,u_b,'admin')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.company_numbering_formats(company_id,scope,pattern,prefix,seq_width)
  VALUES (c_a,'material_lot','{PREFIX}-{SEQ}','RP',4) ON CONFLICT (company_id,scope) DO NOTHING;
  INSERT INTO public.company_numbering_formats(company_id,scope,pattern,prefix,seq_width)
  VALUES (c_b,'material_lot','{PREFIX}-{SEQ}','EL',4) ON CONFLICT (company_id,scope) DO NOTHING;

  INSERT INTO public.materials(company_id,code,name,material_type,criticality,unit_of_measure,created_by)
  VALUES (c_a,'LAC','Lactose monohydrate','excipient','standard','kg',u_qa) RETURNING id INTO m;

  INSERT INTO public.material_specifications(company_id,material_id,version,status,effective_date,created_by)
  VALUES (c_a,m,'1.0','effective',current_date-10,u_qa) RETURNING id INTO spec;

  INSERT INTO public.material_specification_parameters
    (specification_id,parameter,unit,limit_type,min_value,max_value,is_critical,sort_order)
  VALUES (spec,'Assay','%','range',98.0,102.0,true,10) RETURNING id INTO p_assay;
  INSERT INTO public.material_specification_parameters
    (specification_id,parameter,unit,limit_type,max_value,is_critical,sort_order)
  VALUES (spec,'Water content','%','max',0.5,false,20) RETURNING id INTO p_water;
  INSERT INTO public.material_specification_parameters
    (specification_id,parameter,limit_type,is_critical,sort_order)
  VALUES (spec,'Identification','complies',true,30) RETURNING id INTO p_id;

  --  Two required tests and one optional, so "any required test" has
  --  something to be true and false about.
  INSERT INTO public.material_test_definitions
    (company_id,specification_parameter_id,code,name,method,instrument,is_required,sort_order,created_by)
  VALUES
    (c_a,p_assay,'T-ASSAY','Assay by HPLC','HPLC-UV, USP <621>','HPLC-07',true ,10,u_qa),
    (c_a,p_id   ,'T-ID'   ,'Identification by IR','FTIR','FTIR-02'    ,true ,20,u_qa),
    (c_a,p_water,'T-WATER','Water by KF','Karl Fischer','KF-03'       ,false,30,u_qa);

  --  u_qa is the designated QA authority. u_co is a compliance_officer
  --  who is NOT designated, which is what makes section E meaningful.
  INSERT INTO public.material_qa_authorities(company_id,user_id,designated_by)
  VALUES (c_a,u_qa,u_qa) ON CONFLICT DO NOTHING;

  IF NOT public.material_is_qa_authority(c_a,u_qa) THEN
    RAISE EXCEPTION 'FIXTURE: u_qa should be a QA authority';
  END IF;
  IF public.material_is_qa_authority(c_a,u_co) THEN
    RAISE EXCEPTION 'FIXTURE: u_co must NOT be a QA authority once someone is designated';
  END IF;
END
$fix$;

--  A lot, moved to under_test, with a verified certificate, so the only
--  remaining question in each section is the one that section is about.
CREATE OR REPLACE FUNCTION _r6_make_lot(p_tests text DEFAULT 'none')
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  c_a uuid := '00000000-0000-4000-d000-0000000000a1';
  u_qa uuid := '00000000-0000-4000-d000-0000000000a2';
  m uuid; l uuid; coa uuid; d_assay uuid; d_id uuid;
BEGIN
  SELECT id INTO m FROM public.materials WHERE company_id=c_a AND code='LAC';
  INSERT INTO public.material_lots(company_id,material_id,quantity_received,created_by)
  VALUES (c_a,m,250,u_qa) RETURNING id INTO l;

  INSERT INTO public.material_certificates_of_analysis
    (company_id,material_lot_id,supplier_results,uploaded_by)
  VALUES (c_a,l,'[{"parameter":"Assay","stated_value":99.5},
                  {"parameter":"Water content","stated_value":0.2},
                  {"parameter":"Identification","stated_text":"Complies"}]'::jsonb,u_qa)
  RETURNING id INTO coa;
  PERFORM public.material_coa_verify(coa);

  PERFORM public.lifecycle_transition('material_lot', l, 'sample', c_a, u_qa, 'Sampled');

  SELECT d.id INTO d_assay FROM public.material_test_definitions d
    JOIN public.material_specification_parameters p ON p.id=d.specification_parameter_id
   WHERE d.company_id=c_a AND p.parameter='Assay';
  SELECT d.id INTO d_id FROM public.material_test_definitions d
    JOIN public.material_specification_parameters p ON p.id=d.specification_parameter_id
   WHERE d.company_id=c_a AND p.parameter='Identification';

  IF p_tests = 'all_pass' THEN
    PERFORM public.material_test_record_result(l,d_assay,99.1,NULL,u_qa,current_date,NULL,'HPLC-07');
    PERFORM public.material_test_record_result(l,d_id,NULL,'Complies',u_qa,current_date,NULL,'FTIR-02');
  ELSIF p_tests = 'one_fail' THEN
    PERFORM public.material_test_record_result(l,d_assay,91.0,NULL,u_qa,current_date,NULL,'HPLC-07');
    PERFORM public.material_test_record_result(l,d_id,NULL,'Complies',u_qa,current_date,NULL,'FTIR-02');
  ELSIF p_tests = 'one_missing' THEN
    PERFORM public.material_test_record_result(l,d_assay,99.1,NULL,u_qa,current_date,NULL,'HPLC-07');
  END IF;

  RETURN l;
END $$;

-- =====================================================================
--  A. Tests configurable per material
-- =====================================================================
DO $a$
DECLARE
  c_a uuid := '00000000-0000-4000-d000-0000000000a1';
  u_qa uuid := '00000000-0000-4000-d000-0000000000a2';
  ok boolean; d uuid; p uuid;
BEGIN
  PERFORM _r6k('A','A1 three tests configured for the material',
    (SELECT count(*)=3 FROM public.material_test_definitions WHERE company_id=c_a));

  PERFORM _r6k('A','A2 two of them are required, one optional',
    (SELECT count(*) FILTER (WHERE is_required)=2
        AND count(*) FILTER (WHERE NOT is_required)=1
       FROM public.material_test_definitions WHERE company_id=c_a));

  PERFORM _r6k('A','A3 a test carries a method and an instrument',
    (SELECT method='HPLC-UV, USP <621>' AND instrument='HPLC-07'
       FROM public.material_test_definitions WHERE company_id=c_a AND code='T-ASSAY'));

  --  A test hangs off a specification parameter, so it is defined per
  --  material AND against a specification — not floating free.
  PERFORM _r6k('A','A4 every test resolves to a material through its specification',
    (SELECT count(*)=3 FROM public.material_test_definitions d
       JOIN public.material_specification_parameters pp ON pp.id=d.specification_parameter_id
       JOIN public.material_specifications s ON s.id=pp.specification_id
       JOIN public.materials mm ON mm.id=s.material_id
      WHERE d.company_id=c_a AND mm.code='LAC'));

  --  One test per parameter, so the expected result set is definite.
  SELECT pp.id INTO p FROM public.material_specification_parameters pp
    JOIN public.material_specifications s ON s.id=pp.specification_id
   WHERE s.company_id=c_a AND pp.parameter='Assay';
  ok := false;
  BEGIN
    INSERT INTO public.material_test_definitions(company_id,specification_parameter_id,name)
    VALUES (c_a,p,'Duplicate assay test');
  EXCEPTION WHEN unique_violation THEN ok := true;
  END;
  PERFORM _r6k('A','A5 two tests cannot claim the same parameter', ok);
END
$a$;

-- =====================================================================
--  B. A result captures the eight required things, and we judge it
-- =====================================================================
DO $b$
DECLARE
  c_a uuid := '00000000-0000-4000-d000-0000000000a1';
  u_qa uuid := '00000000-0000-4000-d000-0000000000a2';
  l uuid; d uuid; res jsonb; r record; ok boolean;
BEGIN
  l := _r6_make_lot('none');
  SELECT d2.id INTO d FROM public.material_test_definitions d2
    JOIN public.material_specification_parameters p ON p.id=d2.specification_parameter_id
   WHERE d2.company_id=c_a AND p.parameter='Assay';

  res := public.material_test_record_result(l,d,99.1,NULL,u_qa,current_date-1,'HPLC-UV','HPLC-07');
  SELECT * INTO r FROM public.material_test_results
   WHERE material_lot_id=l AND test_definition_id=d AND superseded_at IS NULL;

  PERFORM _r6k('B','B1 parameter',           r.parameter='Assay', r.parameter);
  PERFORM _r6k('B','B2 specification limits',r.specification_limit LIKE '98%102%', r.specification_limit);
  PERFORM _r6k('B','B3 actual value',        r.actual_value=99.1, r.actual_value::text);
  PERFORM _r6k('B','B4 pass or fail',        r.result='pass', r.result);
  PERFORM _r6k('B','B5 analyst',             r.analyst_id=u_qa AND r.analyst_name='Adaeze Okonkwo', r.analyst_name);
  PERFORM _r6k('B','B6 date',                r.test_date=current_date-1, r.test_date::text);
  PERFORM _r6k('B','B7 method',              r.method='HPLC-UV', r.method);
  PERFORM _r6k('B','B8 instrument',          r.instrument='HPLC-07', r.instrument);

  --  THE VERDICT IS COMPUTED. An out-of-range value is a fail no matter
  --  what the caller would have preferred — there is no parameter to say
  --  otherwise.
  PERFORM public.material_test_record_result(l,d,91.0,NULL,u_qa);
  PERFORM _r6k('B','B9 an out-of-range value is recorded as a fail',
    (SELECT result='fail' FROM public.material_test_results
      WHERE material_lot_id=l AND test_definition_id=d AND superseded_at IS NULL));

  --  The retest superseded the first result rather than erasing it.
  PERFORM _r6k('B','B10 a retest supersedes rather than overwrites',
    (SELECT count(*)=2 FROM public.material_test_results
      WHERE material_lot_id=l AND test_definition_id=d));
  PERFORM _r6k('B','B11 and exactly one result is live',
    (SELECT count(*)=1 FROM public.material_test_results
      WHERE material_lot_id=l AND test_definition_id=d AND superseded_at IS NULL));

  --  The limits are snapshot, so a superseded specification does not
  --  make the result unreviewable.
  PERFORM _r6k('B','B12 the numeric limits are snapshot onto the result',
    (SELECT limit_min=98.0 AND limit_max=102.0 AND limit_type='range'
       FROM public.material_test_results
      WHERE material_lot_id=l AND test_definition_id=d AND superseded_at IS NULL));

  --  A result with nothing measured is refused.
  ok := false;
  BEGIN PERFORM public.material_test_record_result(l,d,NULL,NULL,u_qa);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%MATERIAL_TEST_NO_VALUE%'; END;
  PERFORM _r6k('B','B13 a result with no measured value is refused', ok);

  --  A test definition for a different material cannot be filed here.
  DECLARE m2 uuid; s2 uuid; p2 uuid; d2 uuid;
  BEGIN
    INSERT INTO public.materials(company_id,code,name,material_type,created_by)
    VALUES (c_a,'OTHER-M','Another material','excipient',u_qa) RETURNING id INTO m2;
    INSERT INTO public.material_specifications(company_id,material_id,version,status,created_by)
    VALUES (c_a,m2,'1.0','effective',u_qa) RETURNING id INTO s2;
    INSERT INTO public.material_specification_parameters(specification_id,parameter,limit_type,max_value)
    VALUES (s2,'Ash','max',1.0) RETURNING id INTO p2;
    INSERT INTO public.material_test_definitions(company_id,specification_parameter_id,name)
    VALUES (c_a,p2,'Ash test') RETURNING id INTO d2;

    ok := false;
    BEGIN PERFORM public.material_test_record_result(l,d2,0.5,NULL,u_qa);
    EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%MATERIAL_TEST_MISMATCH%'; END;
    PERFORM _r6k('B','B14 a test for another material cannot be filed against this lot', ok);
  END;
END
$b$;

-- =====================================================================
--  C. Release blocked: incomplete or failing required tests
-- =====================================================================
DO $c$
DECLARE l uuid; r text;
BEGIN
  l := _r6_make_lot('none');
  r := public.material_lot_release_block_reason(l);
  PERFORM _r6k('C','C1 no tests performed blocks release',
               r IS NOT NULL AND r LIKE '%required test%not been performed%', r);
  PERFORM _r6k('C','C2 and the message names which ones',
               r LIKE '%Assay%' AND r LIKE '%Identification%', r);

  l := _r6_make_lot('one_missing');
  r := public.material_lot_release_block_reason(l);
  PERFORM _r6k('C','C3 one required test still outstanding blocks release',
               r IS NOT NULL AND r LIKE '%Identification%', r);
  PERFORM _r6k('C','C4 and the one already done is not listed as missing',
               r NOT LIKE '%Assay%', r);

  l := _r6_make_lot('one_fail');
  r := public.material_lot_release_block_reason(l);
  PERFORM _r6k('C','C5 a failing required test blocks release',
               r IS NOT NULL AND r LIKE '%not passed%', r);
  PERFORM _r6k('C','C6 and names the failing parameter',
               r LIKE '%Assay%', r);

  l := _r6_make_lot('all_pass');
  PERFORM _r6k('C','C7 all required tests passing clears the gate',
               public.material_lot_release_block_reason(l) IS NULL,
               coalesce(public.material_lot_release_block_reason(l),'NULL'));

  --  The optional test was never performed, and that is deliberately not
  --  a blocker: only a required test gates release.
  PERFORM _r6k('C','C8 an unperformed optional test does not block',
    (SELECT count(*)=0 FROM public.material_test_results r2
       JOIN public.material_test_definitions d ON d.id=r2.test_definition_id
      WHERE r2.material_lot_id=l AND NOT d.is_required));
END
$c$;

-- =====================================================================
--  D. Release blocked: unverified certificate (item 05, still true)
-- =====================================================================
DO $d$
DECLARE
  c_a uuid := '00000000-0000-4000-d000-0000000000a1';
  u_qa uuid := '00000000-0000-4000-d000-0000000000a2';
  l uuid; r text;
BEGIN
  l := _r6_make_lot('all_pass');
  --  Add a second, unverified certificate to a lot that is otherwise
  --  releasable.
  INSERT INTO public.material_certificates_of_analysis
    (company_id,material_lot_id,supplier_results,uploaded_by)
  VALUES (c_a,l,'[{"parameter":"Assay","stated_value":99.0}]'::jsonb,u_qa);
  r := public.material_lot_release_block_reason(l);
  PERFORM _r6k('D','D1 an unverified certificate still blocks release',
               r IS NOT NULL AND r LIKE '%not verified%', r);
  PERFORM _r6k('D','D2 the certificate clause is checked before the test clauses',
               r NOT LIKE '%required test%', r);
END
$d$;

-- =====================================================================
--  E. Release requires a designated QA authority
-- =====================================================================
SELECT set_config('test.lot_qa',   _r6_make_lot('all_pass')::text, false) \gset
SELECT set_config('test.lot_co',   _r6_make_lot('all_pass')::text, false) \gset
SELECT set_config('test.lot_cc',   _r6_make_lot('all_pass')::text, false) \gset
SELECT set_config('test.lot_cond', _r6_make_lot('all_pass')::text, false) \gset
SELECT set_config('test.lot_rej',  _r6_make_lot('one_fail')::text,  false) \gset
SELECT set_config('test.lot_other',_r6_make_lot('all_pass')::text, false) \gset

GRANT INSERT ON _r6 TO authenticated;

--  As the content_creator: refused by the engine's role requirement, so
--  they cannot even sign.
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"00000000-0000-4000-d000-0000000000a4","role":"authenticated"}';
DO $e1$
DECLARE l uuid := current_setting('test.lot_cc')::uuid; r jsonb; ok boolean;
BEGIN
  PERFORM _r6k('E','E0 running as the content_creator',
               auth.uid()='00000000-0000-4000-d000-0000000000a4');

  r := public.sign_electronic_record('00000000-0000-4000-d000-0000000000a1','material_lot',
         l,'release','released','CorrectHorse1!');
  PERFORM _r6k('E','E1 a content_creator cannot sign the release',
               (r->>'ok')='false', coalesce(r->>'code','NULL'));

  ok := false;
  BEGIN PERFORM public.material_lot_release(l, NULL, 'full');
  EXCEPTION WHEN others THEN ok := true; END;
  PERFORM _r6k('E','E2 and cannot release', ok);
END
$e1$;
RESET ROLE; RESET request.jwt.claims;

--  As the compliance_officer: passes the engine's role check, but is NOT
--  a designated QA authority, so the gate refuses.
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"00000000-0000-4000-d000-0000000000a3","role":"authenticated"}';
DO $e2$
DECLARE l uuid := current_setting('test.lot_co')::uuid; r jsonb; sig uuid; ok boolean; msg text;
BEGIN
  PERFORM _r6k('E','E3 running as the compliance_officer',
               auth.uid()='00000000-0000-4000-d000-0000000000a3');

  --  The engine's role check lets them sign — 'compliance_officer' is in
  --  required_role — which is exactly why the designation layer matters.
  r := public.sign_electronic_record('00000000-0000-4000-d000-0000000000a1','material_lot',
         l,'release','released','CorrectHorse1!');
  PERFORM _r6k('E','E4 the role check alone would have let them sign',
               (r->>'ok')='true', coalesce(r::text,'NULL'));
  sig := (r->>'signature_id')::uuid;

  ok := false; msg := NULL;
  BEGIN PERFORM public.material_lot_release(l, sig, 'full');
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%MATERIAL_RELEASE_FORBIDDEN%'; msg := SQLERRM; END;
  PERFORM _r6k('E','E5 but an undesignated user is refused by the gate', ok, msg);

  PERFORM _r6k('E','E6 and the lot did not move',
    (SELECT status='under_test' FROM public.material_lots WHERE id=l));
END
$e2$;
RESET ROLE; RESET request.jwt.claims;

-- =====================================================================
--  F. Release requires an electronic signature
-- =====================================================================
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"00000000-0000-4000-d000-0000000000a2","role":"authenticated"}';
DO $f$
DECLARE
  c_a uuid := '00000000-0000-4000-d000-0000000000a1';
  l uuid := current_setting('test.lot_qa')::uuid;
  r jsonb; sig uuid; ok boolean; msg text;
BEGIN
  PERFORM _r6k('F','F0 running as the designated QA authority',
               auth.uid()='00000000-0000-4000-d000-0000000000a2');

  --  No signature at all.
  ok := false; msg := NULL;
  BEGIN PERFORM public.material_lot_release(l, NULL, 'full');
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%SIGNATURE%'; msg := SQLERRM; END;
  PERFORM _r6k('F','F1 release without a signature is refused', ok, msg);

  --  The real signature is taken FIRST, before any failure probe. The
  --  lockout counts failures per signer over 15 minutes, so probing a
  --  wrong password before the real signature can block the very release
  --  this section exists to test.
  r := public.sign_electronic_record(c_a,'material_lot',l,'release','released','CorrectHorse1!',
                                     'All required tests passed; CoA verified');
  PERFORM _r6k('F','F3 the QA authority can sign', (r->>'ok')='true', coalesce(r::text,'NULL'));
  sig := (r->>'signature_id')::uuid;

  --  A signature obtained with the wrong password is not a signature.
  --  Probed on a different lot, so the attempt cannot interfere with the
  --  signature taken above.
  r := public.sign_electronic_record(c_a,'material_lot',
         current_setting('test.lot_other')::uuid,'release','released','wrong-password');
  PERFORM _r6k('F','F2 a wrong password yields no signature',
               (r->>'ok')='false' AND r->>'code'='E_SIGNATURE_BAD_CREDENTIAL',
               coalesce(r->>'code','NULL'));

  r := public.material_lot_release(l, sig, 'full');
  PERFORM _r6k('F','F4 and release succeeds', r IS NOT NULL, coalesce(r::text,'NULL'));
  PERFORM _r6k('F','F5 the lot is now approved',
    (SELECT status='approved' FROM public.material_lots WHERE id=l));
  PERFORM _r6k('F','F6 a release record was written, type full',
    (SELECT release_type='full' AND signature_id=sig
       FROM public.material_lot_release_records WHERE material_lot_id=l));
  PERFORM _r6k('F','F7 the signature records the meaning',
    (SELECT meaning='released' AND action='release'
       FROM public.electronic_signatures WHERE id=sig));

  --  The same signature cannot be spent twice.
  DECLARE l2 uuid := current_setting('test.lot_other')::uuid;
  BEGIN
    ok := false;
    BEGIN PERFORM public.material_lot_release(l2, sig, 'full');
    EXCEPTION WHEN others THEN ok := true; END;
    PERFORM _r6k('F','F8 a signature cannot be reused on another lot', ok);
  END;
END
$f$;
RESET ROLE; RESET request.jwt.claims;

-- =====================================================================
--  G. Conditional release
-- =====================================================================
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"00000000-0000-4000-d000-0000000000a2","role":"authenticated"}';
DO $g$
DECLARE
  c_a uuid := '00000000-0000-4000-d000-0000000000a1';
  u_qa uuid := '00000000-0000-4000-d000-0000000000a2';
  u_co uuid := '00000000-0000-4000-d000-0000000000a3';
  l uuid := current_setting('test.lot_cond')::uuid;
  r jsonb; sig uuid; ok boolean; msg text;
BEGIN
  r := public.sign_electronic_record(c_a,'material_lot',l,'release','released','CorrectHorse1!');
  sig := (r->>'signature_id')::uuid;

  --  No justification.
  ok := false; msg := NULL;
  BEGIN PERFORM public.material_lot_release(l, sig, 'conditional', NULL, u_qa);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%NO_JUSTIFICATION%'; msg := SQLERRM; END;
  PERFORM _r6k('G','G1 conditional release without a justification is refused', ok, msg);

  --  Whitespace is not a justification.
  ok := false;
  BEGIN PERFORM public.material_lot_release(l, sig, 'conditional', '   ', u_qa);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%NO_JUSTIFICATION%'; END;
  PERFORM _r6k('G','G2 whitespace is not a justification', ok);

  --  No authoriser.
  ok := false;
  BEGIN PERFORM public.material_lot_release(l, sig, 'conditional', 'Urgent production need', NULL);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%NO_AUTHORISER%'; END;
  PERFORM _r6k('G','G3 conditional release without a named authoriser is refused', ok);

  --  An authoriser who is not a QA authority.
  ok := false;
  BEGIN PERFORM public.material_lot_release(l, sig, 'conditional', 'Urgent production need', u_co);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%BAD_AUTHORISER%'; END;
  PERFORM _r6k('G','G4 the named authoriser must be a QA authority', ok);

  --  With both, it works.
  r := public.material_lot_release(l, sig, 'conditional',
         'Urgent production need; full microbial result outstanding, confirmed acceptable by QA', u_qa);
  PERFORM _r6k('G','G5 with justification and authoriser, conditional release succeeds',
               (r->>'release_type')='conditional', coalesce(r::text,'NULL'));
  PERFORM _r6k('G','G6 the justification and authoriser are recorded',
    (SELECT justification LIKE '%Urgent production need%' AND authorised_by=u_qa
       FROM public.material_lot_release_records WHERE material_lot_id=l));
  PERFORM _r6k('G','G7 and it is visible as conditionally released',
    (SELECT count(*)=1 FROM public.material_lots_conditionally_released
      WHERE material_lot_id=l));
END
$g$;
RESET ROLE; RESET request.jwt.claims;

-- =====================================================================
--  H. Rejection disposition
-- =====================================================================
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"00000000-0000-4000-d000-0000000000a2","role":"authenticated"}';
DO $h$
DECLARE
  c_a uuid := '00000000-0000-4000-d000-0000000000a1';
  l uuid := current_setting('test.lot_rej')::uuid;
  ok boolean; msg text; res jsonb;
BEGIN
  --  An invented disposition is refused.
  ok := false;
  BEGIN PERFORM public.material_lot_reject(l,'bin_it','Assay failed');
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%REJECT_DISPOSITION%'; END;
  PERFORM _r6k('H','H1 an invented disposition is refused', ok);

  --  A rejection with no reason is refused.
  ok := false;
  BEGIN PERFORM public.material_lot_reject(l,'return_to_supplier','  ');
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%REJECT_NO_REASON%'; END;
  PERFORM _r6k('H','H2 a rejection with no reason is refused', ok);

  res := public.material_lot_reject(l,'return_to_supplier',
           'Assay 91.0% against a 98.0-102.0% limit','Supplier RMA 2026-114');
  PERFORM _r6k('H','H3 rejection succeeds with a valid disposition',
               (res->>'disposition')='return_to_supplier', coalesce(res::text,'NULL'));
  PERFORM _r6k('H','H4 the lot is rejected',
    (SELECT status='rejected' FROM public.material_lots WHERE id=l));
  PERFORM _r6k('H','H5 the disposition and reason are recorded',
    (SELECT disposition='return_to_supplier' AND reason LIKE '%91.0%'
        AND disposition_note='Supplier RMA 2026-114'
       FROM public.material_lot_rejections WHERE material_lot_id=l));

  --  All three dispositions the item names are accepted, and nothing else.
  PERFORM _r6k('H','H6 exactly the three named dispositions are allowed',
    (SELECT pg_get_constraintdef(oid) LIKE '%return_to_supplier%'
        AND pg_get_constraintdef(oid) LIKE '%destruction%'
        AND pg_get_constraintdef(oid) LIKE '%downgrade_non_critical%'
       FROM pg_constraint
      WHERE conname='material_rejection_disposition_chk'));

  --  A rejected lot cannot then be released.
  ok := false;
  BEGIN PERFORM public.material_lot_release(l, NULL, 'full');
  EXCEPTION WHEN others THEN ok := true; END;
  PERFORM _r6k('H','H7 a rejected lot cannot be released', ok);
END
$h$;
RESET ROLE; RESET request.jwt.claims;

-- =====================================================================
--  I. The "NOT DONE IF" clauses
-- =====================================================================
DO $i$
DECLARE
  c_a uuid := '00000000-0000-4000-d000-0000000000a1';
BEGIN
  --  "Any user who can open the page can release material."
  PERFORM _r6k('I','I1 the release transition carries a role requirement',
    (SELECT t.required_role='admin,compliance_officer'
       FROM public.lifecycle_transitions t
       JOIN public.lifecycle_definitions d ON d.id=t.definition_id
       JOIN public.lifecycle_states f ON f.id=t.from_state_id
      WHERE d.entity_type='material_lot' AND d.company_id IS NULL
        AND f.state_key='under_test' AND t.action_key='release'));

  PERFORM _r6k('I','I2 and the gate is a trigger, so no path skips it',
    EXISTS (SELECT 1 FROM pg_trigger
             WHERE tgname='trg_material_lots_release_gate' AND NOT tgisinternal));

  --  "Release does not require signature."
  PERFORM _r6k('I','I3 the release transition requires a signature',
    (SELECT t.requires_signature
       FROM public.lifecycle_transitions t
       JOIN public.lifecycle_definitions d ON d.id=t.definition_id
       JOIN public.lifecycle_states f ON f.id=t.from_state_id
      WHERE d.entity_type='material_lot' AND d.company_id IS NULL
        AND f.state_key='under_test' AND t.action_key='release'));

  PERFORM _r6k('I','I4 every release so far carries a signature',
    NOT EXISTS (SELECT 1 FROM public.material_lot_release_records
                 WHERE company_id=c_a AND signature_id IS NULL));

  --  "Conditional release available without justification."
  --  Structural, not procedural: the constraint refuses the row.
  PERFORM _r6k('I','I5 a conditional release row without justification cannot exist',
    (SELECT pg_get_constraintdef(oid) LIKE '%conditional%'
       FROM pg_constraint WHERE conname='material_release_conditional_chk'));

  --  Results are evidence: a client cannot rewrite or delete one.
  PERFORM _r6k('I','I6 test results are not updatable by a client',
    NOT has_table_privilege('authenticated','public.material_test_results','UPDATE'));
  PERFORM _r6k('I','I7 nor deletable',
    NOT has_table_privilege('authenticated','public.material_test_results','DELETE'));
  PERFORM _r6k('I','I8 release records are not updatable either',
    NOT has_table_privilege('authenticated','public.material_lot_release_records','UPDATE'));

  PERFORM _r6k('I','I9 anon has no access to any of it',
    NOT has_table_privilege('anon','public.material_test_results','SELECT')
    AND NOT has_table_privilege('anon','public.material_lot_release_records','SELECT')
    AND NOT has_table_privilege('anon','public.material_qa_authorities','SELECT'));
END
$i$;

-- =====================================================================
--  J. Tenancy
-- =====================================================================
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"00000000-0000-4000-d000-0000000000b2","role":"authenticated"}';
DO $j$
DECLARE
  c_a uuid := '00000000-0000-4000-d000-0000000000a1';
  l uuid := current_setting('test.lot_other')::uuid;
  n integer; ok boolean; d uuid;
BEGIN
  PERFORM _r6k('J','J0 the probe is company B''s admin',
               auth.uid()='00000000-0000-4000-d000-0000000000b2'
               AND NOT public.app_is_company_member(c_a));

  ok := false;
  BEGIN PERFORM public.material_lot_release_block_reason(l);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%MATERIAL_FORBIDDEN%'; END;
  PERFORM _r6k('J','J1 the release gate refuses another company''s lot', ok);

  ok := false;
  BEGIN PERFORM public.material_lot_release(l, NULL, 'full');
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%MATERIAL_FORBIDDEN%'; END;
  PERFORM _r6k('J','J2 release refuses another company''s lot', ok);

  ok := false;
  BEGIN PERFORM public.material_lot_reject(l,'destruction','Because');
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%MATERIAL_FORBIDDEN%'; END;
  PERFORM _r6k('J','J3 rejection refuses another company''s lot', ok);

  SELECT id INTO d FROM public.material_test_definitions LIMIT 1;
  PERFORM _r6k('J','J4 B cannot even see A''s test definitions', d IS NULL);

  SELECT count(*) INTO n FROM public.material_test_results       WHERE company_id=c_a;
  PERFORM _r6k('J','J5 nor A''s results', n=0, n::text);
  SELECT count(*) INTO n FROM public.material_lot_release_records WHERE company_id=c_a;
  PERFORM _r6k('J','J6 nor A''s release records', n=0, n::text);
  SELECT count(*) INTO n FROM public.material_lot_rejections      WHERE company_id=c_a;
  PERFORM _r6k('J','J7 nor A''s rejections', n=0, n::text);
  SELECT count(*) INTO n FROM public.material_qa_authorities      WHERE company_id=c_a;
  PERFORM _r6k('J','J8 nor who A has designated', n=0, n::text);
  SELECT count(*) INTO n FROM public.material_lots_conditionally_released WHERE company_id=c_a;
  PERFORM _r6k('J','J9 nor A''s conditional releases through the view', n=0, n::text);
END
$j$;
RESET ROLE; RESET request.jwt.claims;

DO $j2$
DECLARE c_a uuid := '00000000-0000-4000-d000-0000000000a1'; n integer;
BEGIN
  SELECT count(*) INTO n FROM public.material_lot_release_records WHERE company_id=c_a;
  PERFORM _r6k('J','J10 the owner is not locked out', n >= 1, n::text);
END
$j2$;

DROP FUNCTION IF EXISTS _r6_make_lot(text);

\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo '  ITEM 06 — MATERIAL TESTING AND RELEASE'
\echo '════════════════════════════════════════════════════════════════'
SELECT section, count(*) AS assertions, count(*) FILTER (WHERE NOT ok) AS failures
  FROM _r6 GROUP BY section ORDER BY section;
SELECT section, name, coalesce(detail,'') AS detail FROM _r6 WHERE NOT ok ORDER BY section, name;
SELECT count(*) AS total, count(*) FILTER (WHERE ok) AS passed,
       count(*) FILTER (WHERE NOT ok) AS failed FROM _r6;

DO $v$
DECLARE f integer;
BEGIN
  SELECT count(*) INTO f FROM _r6 WHERE NOT ok;
  IF f > 0 THEN RAISE EXCEPTION 'ITEM 06: % assertion(s) failed', f; END IF;
  RAISE NOTICE 'ITEM 06: all assertions passed';
END
$v$;
