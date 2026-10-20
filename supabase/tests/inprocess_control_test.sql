-- =====================================================================
--  WEEK 4 / ITEM 11 — IN-PROCESS CONTROL AND OOS HANDLING
--
--  NOT DONE IF
--    An OOS reading blocks entry. Damilola was explicit and repeated on
--      this.
--    An OOS reading creates a deviation automatically.
--    Zone limits are global rather than per product.
--    The interlock path was built anyway.
--
--  The first clause gets the most attention here, because it is the one
--  that is easy to fail by accident: ANY refusal on the path from
--  "operator types a number" to "the number is in the database" fails
--  it. Section C therefore saves a reading at every zone and well
--  outside specification, and asserts each one landed.
--
--  The last clause is unusual — building MORE than was asked is the
--  failure — so section H asserts the absence of an interlock rather
--  than the presence of a feature. An assertion about something not
--  existing is weak by nature, and the section says so.
--
--  Sections:
--    A. Sampling frequency and due prompts
--    B. Numbered in sequence, timestamped
--    C. OOS does not block entry
--    D. The five zones, and every boundary between them
--    E. Zone limits are per product, with no global fallback
--    F. Acknowledgement, which is not a refusal
--    G. Escalation and the supervisor's decision
--    H. What was deliberately NOT built
--    I. Derived fields are not editable
--    J. Tenancy
-- =====================================================================
\set ON_ERROR_STOP on
SET client_min_messages = warning;

CREATE TEMP TABLE _i11(section text, name text, ok boolean, detail text);
GRANT ALL ON _i11 TO anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION _i11k(p_section text, p_name text, p_ok boolean, p_detail text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO _i11 VALUES (p_section,p_name,coalesce(p_ok,false),p_detail); END $$;

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

CREATE EXTENSION IF NOT EXISTS dblink;


-- ── fixtures ─────────────────────────────────────────────────────────
DO $fx$
DECLARE
  c_a uuid := gen_random_uuid();
  c_b uuid := gen_random_uuid();
  u_op uuid := gen_random_uuid();
  u_sup uuid := gen_random_uuid();   -- the supervisor who decides
  u_qa uuid := gen_random_uuid();
  u_b  uuid := gen_random_uuid();
  tag text := substr(replace(gen_random_uuid()::text,'-',''),1,8);
  p_a uuid; p_nolimits uuid; m_api uuid; f uuid; f2 uuid; st uuid; st2 uuid; ln uuid;
BEGIN
  PERFORM set_config('i11.c_a', c_a::text, false);
  PERFORM set_config('i11.c_b', c_b::text, false);
  PERFORM set_config('i11.u_op', u_op::text, false);
  PERFORM set_config('i11.u_sup', u_sup::text, false);
  PERFORM set_config('i11.u_qa', u_qa::text, false);
  PERFORM set_config('i11.u_b',  u_b::text,  false);

  INSERT INTO public.companies(id,name) VALUES
    (c_a,'Item11 Manufacturing '||tag), (c_b,'Item11 Elsewhere '||tag);

  INSERT INTO auth.users(id,email) VALUES
    (u_op ,'op-' ||tag||'@item11.test'),
    (u_sup,'sup-'||tag||'@item11.test'),
    (u_qa ,'qa-' ||tag||'@item11.test'),
    (u_b  ,'b-'  ||tag||'@item11.test');
  UPDATE auth.users SET encrypted_password = extensions.crypt('CorrectHorse1!', extensions.gen_salt('bf'))
   WHERE id IN (u_op,u_sup,u_qa,u_b);

  INSERT INTO public.profiles(id,email,full_name,company_id,role) VALUES
    (u_op ,'op-' ||tag||'@item11.test','Kemi Operator',   c_a,'content_creator'),
    (u_sup,'sup-'||tag||'@item11.test','Dayo Supervisor', c_a,'admin'),
    (u_qa ,'qa-' ||tag||'@item11.test','Nneka Quality',   c_a,'compliance_officer'),
    (u_b  ,'b-'  ||tag||'@item11.test','Far Away',        c_b,'admin');

  INSERT INTO public.company_members(company_id,user_id,role,status) VALUES
    (c_a,u_op,'member','active'),(c_a,u_sup,'owner','active'),
    (c_a,u_qa,'member','active'),(c_b,u_b,'owner','active');

  INSERT INTO public.company_numbering_formats(company_id,scope,pattern,prefix,seq_width)
  VALUES (c_a,'material_lot','{PREFIX}-{SEQ}','I11',4);
  INSERT INTO public.material_qa_authorities(company_id,user_id,designated_by)
  VALUES (c_a,u_qa,u_qa);

  --  TWO PRODUCTS, on purpose: one with weight limits and one without.
  --  Section E proves the limits are per product by giving them
  --  DIFFERENT limits and showing the same weight lands in different
  --  zones — which a global table could not do.
  INSERT INTO public.products(id,company_id,product_code,trade_name,generic_name,category,created_by)
  VALUES (gen_random_uuid(),c_a,'ITEM11A-'||tag,'Tablet A','Paracetamol','drug_pharmaceutical',u_op)
  RETURNING id INTO p_a;
  INSERT INTO public.products(id,company_id,product_code,trade_name,category,created_by)
  VALUES (gen_random_uuid(),c_a,'ITEM11B-'||tag,'Tablet B (no limits)','drug_pharmaceutical',u_op)
  RETURNING id INTO p_nolimits;
  PERFORM set_config('i11.p_a', p_a::text, false);
  PERFORM set_config('i11.p_nolimits', p_nolimits::text, false);

  INSERT INTO public.materials(company_id,code,name,material_type,criticality,unit_of_measure,created_by)
  VALUES (c_a,'API11-'||tag,'Paracetamol powder','active_ingredient','standard','kg',u_op)
  RETURNING id INTO m_api;
  PERFORM set_config('i11.m_api', m_api::text, false);

  -- ── product A's formula: a weight test, a non-weight attribute, a
  --    machine setting, and a test with no sampling interval.
  INSERT INTO public.master_formulas(company_id,product_id,version,batch_size,batch_size_unit,created_by)
  VALUES (c_a,p_a,'1.0',100000,'tablets',u_op) RETURNING id INTO f;
  INSERT INTO public.master_formula_materials(formula_id,material_id,role,quantity_per_batch,unit)
  VALUES (f,m_api,'active',24.0,'kg');
  INSERT INTO public.master_formula_stages(formula_id,sequence_no,stage_code,name)
  VALUES (f,1,'COMP','Compression') RETURNING id INTO st;

  INSERT INTO public.master_formula_stage_parameters
    (stage_id,parameter,parameter_type,unit,target_value,min_value,max_value,
     is_critical,sort_order,sampling_interval_minutes,is_weight_variation)
  VALUES
    --  THE WEIGHT TEST. Specification 540-560 mg; the zone limits below
    --  are deliberately TIGHTER than the specification at the warning
    --  level and WIDER at the action level, so zone and in_specification
    --  are genuinely independent judgements and a test cannot pass by
    --  conflating them.
    (st,'Tablet mass','product_attribute','mg',550,530,570,true,10,30,true),
    --  A non-weight product attribute, so "only the weight test gets a
    --  zone" has something to be false about.
    (st,'Hardness','product_attribute','N',80,60,100,true,20,60,false),
    --  A machine setting. Item 11 leaves its interlock unbuilt.
    (st,'Turret speed','machine_setting','rpm',30,25,35,false,30,30,false),
    --  No sampling interval: never prompts. It still carries limits because
    --  item 07 refuses a product attribute with neither a minimum nor a
    --  maximum — an attribute nobody can judge is not a specification.
    (st,'Friability','product_attribute','%',0.5,NULL,1.0,false,40,NULL,false),
    --  A CRITICAL machine setting, which is the only kind of parameter
    --  that may be critical (MF-04). Section L needs one: it is the
    --  branch IP-05 proposes turning into a hard stop, and the point of
    --  section L is that it is still only a flag. No sampling interval,
    --  so section A's count of timed tests is unchanged.
    (st,'Compression force','machine_setting','kN',12,10,14,true,50,NULL,false);

  PERFORM set_config('i11.f', f::text, false);
  PERFORM set_config('i11.st_def', st::text, false);

  -- ── product B's formula, with its own weight test and NO limits.
  INSERT INTO public.master_formulas(company_id,product_id,version,batch_size,batch_size_unit,created_by)
  VALUES (c_a,p_nolimits,'1.0',100000,'tablets',u_op) RETURNING id INTO f2;
  INSERT INTO public.master_formula_materials(formula_id,material_id,role,quantity_per_batch,unit)
  VALUES (f2,m_api,'active',24.0,'kg');
  INSERT INTO public.master_formula_stages(formula_id,sequence_no,stage_code,name)
  VALUES (f2,1,'COMP','Compression') RETURNING id INTO st2;
  INSERT INTO public.master_formula_stage_parameters
    (stage_id,parameter,parameter_type,unit,target_value,min_value,max_value,
     is_critical,sort_order,sampling_interval_minutes,is_weight_variation)
  VALUES (st2,'Tablet mass','product_attribute','mg',550,530,570,true,10,30,true);
  PERFORM set_config('i11.f2', f2::text, false);

  --  Product A's zone limits. LAL 520 < LWL 540 <= 550 <= UWL 560 < UAL 580.
  INSERT INTO public.product_weight_limits
    (company_id,product_id,target_value,lal,lwl,uwl,ual,unit,created_by)
  VALUES (c_a,p_a,550,520,540,560,580,'mg',u_op);

  INSERT INTO public.production_lines(company_id,code,name,created_by)
  VALUES (c_a,'LINE-11','Compression line 11',u_op) RETURNING id INTO ln;
  PERFORM set_config('i11.ln', ln::text, false);

  INSERT INTO public.instruments(company_id,code,name,instrument_type,owner_user_id,created_by)
  VALUES (c_a,'BAL-11','Compression balance','balance',u_sup,u_op);
  PERFORM set_config('i11.bal',
    (SELECT id::text FROM public.instruments WHERE company_id=c_a AND code='BAL-11'), false);
END
$fx$;

DO $cal$
BEGIN
  INSERT INTO public.instrument_calibrations
    (company_id,instrument_id,certificate_number,calibrated_on,due_on,performed_in_house,result,uploaded_by)
  VALUES (current_setting('i11.c_a')::uuid, current_setting('i11.bal')::uuid,
          'CAL-11-001', current_date-10, current_date+355, true, 'pass',
          current_setting('i11.u_sup')::uuid);
END
$cal$;

--  Registration, approval, lot, batch, clearance — the chain, briefly.
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('i11.u_sup'), 'role','authenticated')::text, false);
SET ROLE authenticated;
DO $reg$
DECLARE c_a uuid := current_setting('i11.c_a')::uuid; p uuid;
BEGIN
  FOREACH p IN ARRAY ARRAY[current_setting('i11.p_a')::uuid, current_setting('i11.p_nolimits')::uuid]
  LOOP
    PERFORM public.lifecycle_transition('product', p, 'start_regulatory_prep', c_a);
    PERFORM public.lifecycle_transition('product', p, 'submit_to_regulator',   c_a);
    PERFORM public.lifecycle_transition('product', p, 'record_registration',   c_a, NULL, 'Granted');
  END LOOP;
END
$reg$;
RESET ROLE;

SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('i11.u_qa'), 'role','authenticated')::text, false);
SET ROLE authenticated;
DO $approve$
DECLARE
  c_a uuid := current_setting('i11.c_a')::uuid;
  u_qa uuid := current_setting('i11.u_qa')::uuid;
  l uuid; r jsonb;
BEGIN
  PERFORM public.master_formula_approve(current_setting('i11.f')::uuid);
  PERFORM public.master_formula_approve(current_setting('i11.f2')::uuid);

  INSERT INTO public.material_lots
    (company_id,material_id,quantity_received,quantity_available,unit_of_measure,created_by)
  VALUES (c_a,current_setting('i11.m_api')::uuid,500,500,'kg',u_qa) RETURNING id INTO l;
  PERFORM public.lifecycle_transition('material_lot', l, 'sample', c_a, u_qa, 'Sampled');
  r := public.sign_electronic_record(c_a,'material_lot',l,'release','released','CorrectHorse1!');
  PERFORM public.material_lot_release(l,(r->>'signature_id')::uuid,'full');
  PERFORM set_config('i11.lot', l::text, false);
END
$approve$;
RESET ROLE;

--  A helper, because two batches need the same journey to a started stage.
CREATE OR REPLACE FUNCTION _i11_batch(p_product uuid, p_number text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  c_a uuid := current_setting('i11.c_a')::uuid;
  r jsonb; b uuid; cl uuid; it record; stage uuid;
BEGIN
  r := public.batch_record_initiate(c_a, p_number, p_product,
         current_date, current_date+365, 100000, 'tablets');
  b := (r->>'batch_id')::uuid;

  PERFORM public.batch_record_assign_line(b, current_setting('i11.ln')::uuid);
  r := public.line_clearance_open(b);
  cl := (r->>'clearance_id')::uuid;
  FOR it IN SELECT item_code, requires_record_reference
              FROM public.line_clearance_check_results WHERE clearance_id = cl
  LOOP
    PERFORM public.line_clearance_answer(cl, it.item_code, 'pass',
      CASE WHEN it.requires_record_reference THEN 'REC-'||upper(substr(it.item_code,1,6)) END);
  END LOOP;
  PERFORM public.line_changeover_record(cl,'Swab test','pass','Clear',0.2,2.0,'ug/cm2');
  r := public.sign_electronic_record(c_a,'line_clearance',cl,'perform','authored','CorrectHorse1!');
  PERFORM public.line_clearance_perform(cl,(r->>'signature_id')::uuid);

  SELECT id INTO stage FROM public.batch_stages WHERE batch_id=b AND sequence_no=1;
  PERFORM public.batch_stage_start(stage);
  RETURN stage;
END $$;

SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('i11.u_op'), 'role','authenticated')::text, false);
SET ROLE authenticated;
DO $batches$
BEGIN
  PERFORM set_config('i11.stage_a',
    _i11_batch(current_setting('i11.p_a')::uuid, 'I11-0001')::text, false);
  PERFORM set_config('i11.stage_b',
    _i11_batch(current_setting('i11.p_nolimits')::uuid, 'I11-0002')::text, false);

  --  The parameter ids, resolved once.
  PERFORM set_config('i11.p_mass',
    (SELECT id::text FROM public.master_formula_stage_parameters
      WHERE stage_id=current_setting('i11.st_def')::uuid AND parameter='Tablet mass'), false);
  PERFORM set_config('i11.p_hard',
    (SELECT id::text FROM public.master_formula_stage_parameters
      WHERE stage_id=current_setting('i11.st_def')::uuid AND parameter='Hardness'), false);
  PERFORM set_config('i11.p_turret',
    (SELECT id::text FROM public.master_formula_stage_parameters
      WHERE stage_id=current_setting('i11.st_def')::uuid AND parameter='Turret speed'), false);
  PERFORM set_config('i11.p_friab',
    (SELECT id::text FROM public.master_formula_stage_parameters
      WHERE stage_id=current_setting('i11.st_def')::uuid AND parameter='Friability'), false);
  PERFORM set_config('i11.p_force',
    (SELECT id::text FROM public.master_formula_stage_parameters
      WHERE stage_id=current_setting('i11.st_def')::uuid AND parameter='Compression force'), false);
  PERFORM set_config('i11.p_mass_b',
    (SELECT fp.id::text FROM public.master_formula_stage_parameters fp
       JOIN public.master_formula_stages fs ON fs.id=fp.stage_id
      WHERE fs.formula_id=current_setting('i11.f2')::uuid AND fp.parameter='Tablet mass'), false);
END
$batches$;


-- =====================================================================
--  A — sampling frequency and due prompts
-- =====================================================================
DO $a$
DECLARE
  stage uuid := current_setting('i11.stage_a')::uuid;
  n integer; v_due record;
BEGIN
  PERFORM _i11k('A','A1 the sampling interval is configurable per test',
    (SELECT sampling_interval_minutes FROM public.master_formula_stage_parameters
      WHERE id=current_setting('i11.p_mass')::uuid) = 30
    AND (SELECT sampling_interval_minutes FROM public.master_formula_stage_parameters
          WHERE id=current_setting('i11.p_hard')::uuid) = 60);

  PERFORM _i11k('A','A2 and a test with no interval simply never prompts',
    (SELECT sampling_interval_minutes IS NULL FROM public.master_formula_stage_parameters
      WHERE id=current_setting('i11.p_friab')::uuid));

  --  The stage started a moment ago, so nothing is due yet. The first
  --  sample falls due one interval AFTER the start — a prompt that
  --  appeared the instant a stage opened would be noise.
  SELECT count(*) INTO n FROM public.inprocess_sampling_due(stage);
  PERFORM _i11k('A','A3 nothing is due the instant a stage starts', n = 0, n||' due');

  --  Backdate the stage start by two hours. Both the 30-minute and the
  --  60-minute test are then overdue.
  UPDATE public.batch_stages SET started_at = now() - interval '2 hours' WHERE id = stage;

  SELECT count(*) INTO n FROM public.inprocess_sampling_due(stage);
  PERFORM _i11k('A','A4 two hours in, both timed tests are due', n = 3, n||' due');

  --  Most overdue first, so a prompt can be ordered by urgency.
  SELECT * INTO v_due FROM public.inprocess_sampling_due(stage) LIMIT 1;
  PERFORM _i11k('A','A5 the most overdue test is reported first',
    v_due.interval_minutes = 30, coalesce(v_due.parameter,'NULL'));

  PERFORM _i11k('A','A6 and the prompt says how overdue, not merely that it is',
    v_due.minutes_overdue > 80, coalesce(v_due.minutes_overdue::text,'NULL'));

  PERFORM _i11k('A','A7 the un-intervalled test is not among them',
    NOT EXISTS (SELECT 1 FROM public.inprocess_sampling_due(stage)
                 WHERE formula_parameter_id = current_setting('i11.p_friab')::uuid));

END
$a$;

--  WHAT THE CONFIGURATION WILL NOT ACCEPT.
--
--  These go on a SCRATCH DRAFT formula, not on the fixture's. The
--  fixture's formula is approved by the time section A runs, so item 06's
--  freeze trigger would refuse any child write on it — and the probes
--  would pass on the freeze while telling us nothing whatsoever about
--  item 11's own check constraints. A probe answered by the wrong control
--  is a probe that has been got out of the way, not one that was run.
RESET ROLE;
DO $a2$
DECLARE
  c_a uuid := current_setting('i11.c_a')::uuid;
  u_op uuid := current_setting('i11.u_op')::uuid;
  fs uuid; st uuid; ok boolean; msg text;
BEGIN
  INSERT INTO public.master_formulas(company_id,product_id,version,batch_size,batch_size_unit,created_by)
  VALUES (c_a,current_setting('i11.p_a')::uuid,'99.0',1000,'tablets',u_op) RETURNING id INTO fs;
  INSERT INTO public.master_formula_stages(formula_id,sequence_no,stage_code,name)
  VALUES (fs,1,'SCRATCH','Scratch') RETURNING id INTO st;

  --  "CONFIGURABLE" IS NOT "ANY VALUE". A zero or negative interval is
  --  not a fast sampling regime, it is a prompt that falls due before the
  --  stage starts and stays due for ever. Refused rather than coerced to
  --  NULL, because silently switching sampling off would leave a formula
  --  author believing they had configured it.
  ok := false; msg := NULL;
  BEGIN
    INSERT INTO public.master_formula_stage_parameters
      (stage_id,parameter,parameter_type,unit,target_value,min_value,max_value,
       sampling_interval_minutes)
    VALUES (st,'Zero interval','product_attribute','mg',550,530,570,0);
  EXCEPTION WHEN check_violation THEN ok := true; msg := SQLERRM;
            WHEN others THEN msg := SQLERRM;
  END;
  PERFORM _i11k('A','A8 a zero sampling interval is refused', ok,
    left(coalesce(msg,'the zero was stored'),160));

  ok := false; msg := NULL;
  BEGIN
    INSERT INTO public.master_formula_stage_parameters
      (stage_id,parameter,parameter_type,unit,target_value,min_value,max_value,
       sampling_interval_minutes)
    VALUES (st,'Negative interval','product_attribute','mg',550,530,570,-30);
  EXCEPTION WHEN check_violation THEN ok := true; msg := SQLERRM;
            WHEN others THEN msg := SQLERRM;
  END;
  PERFORM _i11k('A','A9 and so is a negative one', ok,
    left(coalesce(msg,'the negative was stored'),160));

  --  THE WEIGHT TEST IS A PRODUCT ATTRIBUTE, NOT A MACHINE SETTING. A
  --  turret speed marked as the weight-variation test would be classified
  --  against the product's tablet mass limits — 30 rpm against a 520 mg
  --  action limit — and would read as a catastrophic under-weight on
  --  every single sample.
  ok := false; msg := NULL;
  BEGIN
    INSERT INTO public.master_formula_stage_parameters
      (stage_id,parameter,parameter_type,target_value,is_weight_variation)
    VALUES (st,'Speed as weight','machine_setting',30,true);
  EXCEPTION WHEN check_violation THEN ok := true; msg := SQLERRM;
            WHEN others THEN msg := SQLERRM;
  END;
  PERFORM _i11k('A','A10 a machine setting cannot be the weight test', ok,
    left(coalesce(msg,'the machine setting was marked as the weight test'),160));

  --  ...and the same row as a product attribute goes in, so A10 is about
  --  the parameter type and not about something else in the row.
  ok := false; msg := NULL;
  BEGIN
    INSERT INTO public.master_formula_stage_parameters
      (stage_id,parameter,parameter_type,unit,target_value,min_value,max_value,is_weight_variation)
    VALUES (st,'Mass as weight','product_attribute','mg',550,530,570,true);
    ok := true;
  EXCEPTION WHEN others THEN msg := SQLERRM; END;
  PERFORM _i11k('A','A11 while a product attribute can be', ok,
    left(coalesce(msg,''),160));

  DELETE FROM public.master_formula_stage_parameters WHERE stage_id = st;
  DELETE FROM public.master_formula_stages WHERE formula_id = fs;
  DELETE FROM public.master_formulas WHERE id = fs;
END
$a2$;
SET ROLE authenticated;


-- =====================================================================
--  B — numbered in sequence, timestamped
-- =====================================================================
DO $b$
DECLARE
  stage uuid := current_setting('i11.stage_a')::uuid;
  p_mass uuid := current_setting('i11.p_mass')::uuid;
  p_hard uuid := current_setting('i11.p_hard')::uuid;
  r1 jsonb; r2 jsonb; r3 jsonb; h1 jsonb; ok boolean; msg text;
BEGIN
  r1 := public.batch_stage_record_reading(stage, p_mass, 550);
  r2 := public.batch_stage_record_reading(stage, p_mass, 551);
  r3 := public.batch_stage_record_reading(stage, p_mass, 549);

  PERFORM _i11k('B','B1 results are numbered in sequence, from one',
    (r1->>'sequence_no')='1' AND (r2->>'sequence_no')='2' AND (r3->>'sequence_no')='3',
    format('%s, %s, %s', r1->>'sequence_no', r2->>'sequence_no', r3->>'sequence_no'));

  --  The sequence is PER TEST, not per stage: sample 1 of the hardness
  --  test is sample 1, not sample 4.
  h1 := public.batch_stage_record_reading(stage, p_hard, 80);
  PERFORM _i11k('B','B2 the sequence is per test, not per stage',
    (h1->>'sequence_no')='1', coalesce(h1->>'sequence_no','NULL'));

  PERFORM _i11k('B','B3 each result is timestamped',
    (SELECT count(*) FROM public.batch_stage_parameter_readings
      WHERE batch_stage_id=stage AND recorded_at IS NOT NULL) = 4);

  --  The number is the database's. A client-supplied one is a number two
  --  operators can choose at the same moment.
  ok := false; msg := NULL;
  BEGIN
    INSERT INTO public.batch_stage_parameter_readings
      (company_id,batch_stage_id,formula_parameter_id,parameter_name,parameter_type,
       reading_value,sequence_no,recorded_by)
    VALUES (current_setting('i11.c_a')::uuid,stage,p_mass,'Tablet mass','product_attribute',
            550,99,current_setting('i11.u_op')::uuid);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'BSPR_SEQUENCE_ASSIGNED%'; msg := SQLERRM; END;
  PERFORM _i11k('B','B4 a caller cannot supply the result number',
    ok, left(coalesce(msg,''),160));

  PERFORM set_config('i11.r1', (r1->>'reading_id'), false);
END
$b$;

--  THE CONCURRENCY CASE for the sequence. max()+1 is a lost update
--  waiting to happen, so the assignment takes an advisory lock. Two
--  operators recording the same test at the same moment must get
--  consecutive numbers, not a duplicate and not an error.
RESET ROLE;
DO $b2$
DECLARE
  stage uuid := current_setting('i11.stage_a')::uuid;
  p_mass uuid := current_setting('i11.p_mass')::uuid;
  c_a uuid := current_setting('i11.c_a')::uuid;
  u uuid := current_setting('i11.u_op')::uuid;
  v_sql text;
BEGIN
  PERFORM dblink_connect('i11b', 'dbname='||current_database());
  PERFORM dblink_exec('i11b', 'SET statement_timeout = 0');

  v_sql := format(
    'INSERT INTO public.batch_stage_parameter_readings
       (company_id,batch_stage_id,formula_parameter_id,parameter_name,parameter_type,reading_value,recorded_by)
     VALUES (%L,%L,%L,%L,%L,%s,%L)',
    c_a, stage, p_mass, 'Tablet mass', 'product_attribute', 552, u);

  --  Session A takes a number and holds the advisory lock, uncommitted.
  INSERT INTO public.batch_stage_parameter_readings
    (company_id,batch_stage_id,formula_parameter_id,parameter_name,parameter_type,reading_value,recorded_by)
  VALUES (c_a,stage,p_mass,'Tablet mass','product_attribute',553,u);

  --  Session B is sent on its way and left waiting on that lock.
  PERFORM dblink_send_query('i11b', v_sql);
  PERFORM pg_sleep(0.5);
  PERFORM _i11k('B','B5 a concurrent reading blocks on the sequence lock',
    dblink_is_busy('i11b') = 1, 'busy='||dblink_is_busy('i11b'));
END
$b2$;

DO $b3$
DECLARE
  stage uuid := current_setting('i11.stage_a')::uuid;
  p_mass uuid := current_setting('i11.p_mass')::uuid;
  st text; ok boolean; msg text; n integer; nd integer;
BEGIN
  ok := false; msg := NULL;
  BEGIN
    SELECT * INTO st FROM dblink_get_result('i11b') AS t(status text);
    ok := true; msg := st;
  EXCEPTION WHEN query_canceled OR others THEN msg := SQLERRM; END;
  PERFORM _i11k('B','B6 and then succeeds rather than colliding',
    ok, left(coalesce(msg,''),160));

  SELECT count(*), count(DISTINCT sequence_no) INTO n, nd
    FROM public.batch_stage_parameter_readings
   WHERE batch_stage_id=stage AND formula_parameter_id=p_mass;
  PERFORM _i11k('B','B7 every result number is distinct',
    n = nd, format('%s readings, %s distinct numbers', n, nd));

  PERFORM _i11k('B','B8 and they are consecutive with no gap',
    (SELECT max(sequence_no) FROM public.batch_stage_parameter_readings
      WHERE batch_stage_id=stage AND formula_parameter_id=p_mass) = n,
    format('max %s of %s',
      (SELECT max(sequence_no) FROM public.batch_stage_parameter_readings
        WHERE batch_stage_id=stage AND formula_parameter_id=p_mass), n));

  PERFORM dblink_disconnect('i11b');
END
$b3$;

--  THE CONSTRAINT UNDER THE LOCK. B5-B8 prove the advisory lock hands
--  out consecutive numbers, but they pass whether or not a UNIQUE
--  constraint exists, because a working lock never produces a duplicate
--  for it to refuse. The lock is application logic and the constraint is
--  the storage rule beneath it; a suite that only tests the lock would
--  not notice the constraint being dropped — which is exactly what
--  mutation testing caught here.
--
--  Forcing a duplicate means getting past the assignment trigger, which
--  refuses caller-supplied numbers, so it is disabled for one statement.
--  That is the only way to reach the constraint directly, and reaching it
--  directly is the point.
DO $b4$
DECLARE
  stage uuid := current_setting('i11.stage_a')::uuid;
  p_mass uuid := current_setting('i11.p_mass')::uuid;
  ok boolean := false; msg text;
BEGIN
  ALTER TABLE public.batch_stage_parameter_readings DISABLE TRIGGER trg_bspr_a_assign_sequence;
  BEGIN
    INSERT INTO public.batch_stage_parameter_readings
      (company_id,batch_stage_id,formula_parameter_id,parameter_name,parameter_type,
       reading_value,sequence_no,recorded_by)
    VALUES (current_setting('i11.c_a')::uuid,stage,p_mass,'Tablet mass','product_attribute',
            550,1,current_setting('i11.u_op')::uuid);
  EXCEPTION WHEN unique_violation THEN ok := true; msg := SQLERRM;
            WHEN others THEN msg := SQLERRM;
  END;
  ALTER TABLE public.batch_stage_parameter_readings ENABLE TRIGGER trg_bspr_a_assign_sequence;

  PERFORM _i11k('B','B9 and storage refuses a duplicate number even so',
    ok, left(coalesce(msg,'the duplicate was stored'),160));
END
$b4$;
SET ROLE authenticated;


-- =====================================================================
--  C — an OOS reading does not block entry
--
--  "An OOS reading blocks entry. Damilola was explicit and repeated on
--   this." Any refusal on the path from a typed number to a stored row
--   fails this clause, so each probe asserts the ROW LANDED.
-- =====================================================================
DO $c$
DECLARE
  stage uuid := current_setting('i11.stage_a')::uuid;
  p_mass uuid := current_setting('i11.p_mass')::uuid;
  p_turret uuid := current_setting('i11.p_turret')::uuid;
  r jsonb; n_before integer; n_after integer;
BEGIN
  SELECT count(*) INTO n_before FROM public.batch_stage_parameter_readings
   WHERE batch_stage_id=stage;

  --  Specification is 530-570. 600 is far outside it, in zone 3U, and it
  --  SAVES.
  r := public.batch_stage_record_reading(stage, p_mass, 600, NULL, true);
  PERFORM _i11k('C','C1 a wildly out-of-specification reading is SAVED',
    (r->>'ok')='true' AND (r->>'reading_id') IS NOT NULL, coalesce(r::text,'NULL'));

  PERFORM _i11k('C','C2 and it is flagged, not hidden',
    (r->>'in_specification')='false', coalesce(r::text,'NULL'));

  PERFORM _i11k('C','C3 the row is really there',
    EXISTS (SELECT 1 FROM public.batch_stage_parameter_readings
             WHERE id=(r->>'reading_id')::uuid AND reading_value=600));

  --  Below the lower action limit too.
  r := public.batch_stage_record_reading(stage, p_mass, 500, NULL, true);
  PERFORM _i11k('C','C4 so is one far below the specification',
    (r->>'ok')='true' AND (r->>'in_specification')='false', coalesce(r::text,'NULL'));

  --  A MACHINE SETTING out of specification also saves. Its interlock is
  --  the thing item 11 leaves unbuilt, and leaving it unbuilt must not
  --  turn into refusing the reading.
  r := public.batch_stage_record_reading(stage, p_turret, 45, NULL, true);
  PERFORM _i11k('C','C5 an out-of-specification MACHINE SETTING saves too',
    (r->>'ok')='true' AND (r->>'in_specification')='false', coalesce(r::text,'NULL'));
  PERFORM set_config('i11.r_turret', (r->>'reading_id'), false);

  SELECT count(*) INTO n_after FROM public.batch_stage_parameter_readings
   WHERE batch_stage_id=stage;
  PERFORM _i11k('C','C6 every one of them landed',
    n_after = n_before + 3, format('%s then %s', n_before, n_after));

  --  AND NO DEVIATION WAS CREATED.
  --
  --  This assertion was written as "there is no deviations table at
  --  all yet" — the strongest form available when item 11 was built,
  --  and one deliberately destined to expire. Week 5 item 02 built the
  --  table, so the proxy went from strongest to simply false, and the
  --  suite had been failing on it unnoticed because dblink could not
  --  reach the server on this machine.
  --
  --  Rewritten to the thing it always meant: recording an
  --  out-of-specification reading must not raise a deviation by
  --  itself. Somebody decides that; the system does not decide it for
  --  them.
  PERFORM _i11k('C','C7 no deviation was raised by recording the readings',
    NOT EXISTS (SELECT 1 FROM public.deviations
                 WHERE company_id = current_setting('i11.c_a')::uuid)
    AND NOT EXISTS (SELECT 1 FROM public.deviation_links
                     WHERE company_id = current_setting('i11.c_a')::uuid),
    (SELECT coalesce(string_agg(deviation_number, ', '), 'none')
       FROM public.deviations WHERE company_id = current_setting('i11.c_a')::uuid));

  PERFORM _i11k('C','C8 nor any escalation raised by the system itself',
    NOT EXISTS (SELECT 1 FROM public.inprocess_oos_escalations
                 WHERE company_id=current_setting('i11.c_a')::uuid));
END
$c$;


-- =====================================================================
--  D — the five zones, and every boundary between them
--
--  Limits: LAL 520, LWL 540, target 550, UWL 560, UAL 580.
--  Specification is 530-570, deliberately NOT the same numbers, so a
--  zone cannot be inferred from in_specification or the reverse.
-- =====================================================================
DO $d$
DECLARE
  stage uuid := current_setting('i11.stage_a')::uuid;
  p_mass uuid := current_setting('i11.p_mass')::uuid;
  p_a uuid := current_setting('i11.p_a')::uuid;
  z record;
  cases record;
BEGIN
  --  The classifier, probed directly at every value that matters. The
  --  boundaries are the whole point: a zone scheme with ambiguous edges
  --  is five zones that sometimes mean four.
  FOR cases IN
    SELECT * FROM (VALUES
      (519.0, '3L', 'below the lower action limit'),
      (520.0, '2L', 'exactly ON the lower action limit'),
      (521.0, '2L', 'just inside the lower action limit'),
      (539.9, '2L', 'just below the lower warning limit'),
      (540.0, '1' , 'exactly ON the lower warning limit'),
      (550.0, '1' , 'at target'),
      (560.0, '1' , 'exactly ON the upper warning limit'),
      (560.1, '2U', 'just above the upper warning limit'),
      (580.0, '2U', 'exactly ON the upper action limit'),
      (580.1, '3U', 'just above the upper action limit')
    ) AS t(v, expect, label)
  LOOP
    SELECT * INTO z FROM public.weight_variation_zone(p_a, cases.v);
    PERFORM _i11k('D', format('D-%s mg is zone %s — %s', cases.v, cases.expect, cases.label),
      z.zone = cases.expect, format('got %s', coalesce(z.zone,'NULL')));
  END LOOP;

  --  The ACTION comes with the zone, from the product's configuration.
  SELECT * INTO z FROM public.weight_variation_zone(p_a, 550);
  PERFORM _i11k('D','D11 zone 1 carries its configured action',
    z.action = 'accept', coalesce(z.action,'NULL'));
  SELECT * INTO z FROM public.weight_variation_zone(p_a, 570);
  PERFORM _i11k('D','D12 zone 2U carries its configured action',
    z.action = 'adjust', coalesce(z.action,'NULL'));
  SELECT * INTO z FROM public.weight_variation_zone(p_a, 600);
  PERFORM _i11k('D','D13 zone 3U carries its configured action',
    z.action = 'reject', coalesce(z.action,'NULL'));

  --  THE ACTION IS CONFIGURABLE, not a constant. "An action per zone"
  --  means the mapping is the product's to choose, so changing it has to
  --  change the answer.
  UPDATE public.product_weight_limits SET zone_3u_action = 'resample' WHERE product_id = p_a;
  SELECT * INTO z FROM public.weight_variation_zone(p_a, 600);
  PERFORM _i11k('D','D14 and the action is configuration, not a constant',
    z.action = 'resample', coalesce(z.action,'NULL'));
  UPDATE public.product_weight_limits SET zone_3u_action = 'reject' WHERE product_id = p_a;

  --  A reading records the zone it fell in AND the limits it was judged
  --  against, so a later revision of the limits cannot rewrite history.
  PERFORM _i11k('D','D15 a reading snapshots its zone and the four limits',
    (SELECT weight_zone='1' AND zone_action='accept'
        AND zone_lal=520 AND zone_lwl=540 AND zone_uwl=560 AND zone_ual=580
       FROM public.batch_stage_parameter_readings
      WHERE id=current_setting('i11.r1')::uuid));

  --  ZONE AND SPECIFICATION ARE INDEPENDENT. 565 is inside the
  --  specification (530-570) and in zone 2U — so a system that derived
  --  one from the other would get this wrong.
  DECLARE r jsonb;
  BEGIN
    r := public.batch_stage_record_reading(stage, p_mass, 565);
    PERFORM _i11k('D','D16 a reading can be IN specification and in zone 2U',
      (r->>'in_specification')='true' AND (r->>'weight_zone')='2U',
      coalesce(r::text,'NULL'));

    --  ...and the reverse: 575 is OUT of specification but still only
    --  zone 2U, because the action limit is wider than the spec.
    r := public.batch_stage_record_reading(stage, p_mass, 575, NULL, true);
    PERFORM _i11k('D','D17 and OUT of specification while still only zone 2U',
      (r->>'in_specification')='false' AND (r->>'weight_zone')='2U',
      coalesce(r::text,'NULL'));
  END;

  --  Only the weight test gets a zone.
  DECLARE r2 jsonb;
  BEGIN
    r2 := public.batch_stage_record_reading(stage, current_setting('i11.p_hard')::uuid, 80);
    PERFORM _i11k('D','D18 a non-weight attribute gets no zone',
      (r2->>'weight_zone') IS NULL, coalesce(r2::text,'NULL'));
  END;
END
$d$;


-- =====================================================================
--  E — zone limits are per product, with no global fallback
--
--  NOT DONE IF: "Zone limits are global rather than per product."
-- =====================================================================
DO $e$
DECLARE
  c_a uuid := current_setting('i11.c_a')::uuid;
  p_a uuid := current_setting('i11.p_a')::uuid;
  p_b uuid := current_setting('i11.p_nolimits')::uuid;
  stage_b uuid := current_setting('i11.stage_b')::uuid;
  z record; r jsonb; ok boolean; msg text;
BEGIN
  --  Product B has NO limits. 550 mg is dead centre for product A, and
  --  for product B it is unclassifiable — not zone 1.
  SELECT * INTO z FROM public.weight_variation_zone(p_b, 550);
  PERFORM _i11k('E','E1 a product with no limits yields no zone, not zone 1',
    z.zone IS NULL AND z.limits_configured = false,
    format('zone %s, configured %s', coalesce(z.zone,'NULL'), z.limits_configured));

  --  And the reading still SAVES. Refusing it would block entry for a
  --  configuration gap, which is the first NOT DONE IF.
  UPDATE public.batch_stages SET started_at = now() - interval '2 hours' WHERE id = stage_b;
  r := public.batch_stage_record_reading(stage_b, current_setting('i11.p_mass_b')::uuid, 550);
  PERFORM _i11k('E','E2 and the reading saves anyway, unclassified',
    (r->>'ok')='true' AND (r->>'weight_zone') IS NULL, coalesce(r::text,'NULL'));

  PERFORM _i11k('E','E3 the result says so, so a screen need not guess',
    (r->>'zone_unclassified')='true', coalesce(r::text,'NULL'));

  --  ...while in_specification is still judged, because that comes from
  --  the parameter's own limits and has nothing to do with zones.
  PERFORM _i11k('E','E4 in_specification is unaffected by missing zone limits',
    (r->>'in_specification')='true', coalesce(r::text,'NULL'));

  --  THE PROOF THAT LIMITS ARE PER PRODUCT: give product B DIFFERENT
  --  limits and the same weight lands in a different zone. A global
  --  table could not produce this.
  INSERT INTO public.product_weight_limits
    (company_id,product_id,target_value,lal,lwl,uwl,ual,unit,created_by)
  VALUES (c_a,p_b,700,660,680,720,740,'mg',current_setting('i11.u_op')::uuid);

  SELECT * INTO z FROM public.weight_variation_zone(p_a, 550);
  PERFORM _i11k('E','E5 550 mg is zone 1 for product A', z.zone = '1', coalesce(z.zone,'NULL'));

  SELECT * INTO z FROM public.weight_variation_zone(p_b, 550);
  PERFORM _i11k('E','E6 and zone 3L for product B — the same weight, two answers',
    z.zone = '3L', coalesce(z.zone,'NULL'));

  --  The ordering of the limits is the whole meaning, so it is enforced.
  ok := false; msg := NULL;
  BEGIN
    UPDATE public.product_weight_limits SET uwl = 590 WHERE product_id = p_a;  -- above UAL
  EXCEPTION WHEN others THEN ok := true; msg := SQLERRM; END;
  PERFORM _i11k('E','E7 limits out of order are refused', ok, left(coalesce(msg,''),160));

  ok := false; msg := NULL;
  BEGIN
    INSERT INTO public.product_weight_limits
      (company_id,product_id,target_value,lal,lwl,uwl,ual,unit)
    VALUES (c_a,p_a,550,520,540,560,580,'mg');
  EXCEPTION WHEN others THEN ok := true; msg := SQLERRM; END;
  PERFORM _i11k('E','E8 and a product cannot hold two sets of limits',
    ok, left(coalesce(msg,''),160));

  ok := false; msg := NULL;
  BEGIN
    UPDATE public.product_weight_limits SET zone_1_action = 'explode' WHERE product_id = p_a;
  EXCEPTION WHEN others THEN ok := true; msg := SQLERRM; END;
  PERFORM _i11k('E','E9 an action outside accept/adjust/resample/reject is refused',
    ok, left(coalesce(msg,''),160));
END
$e$;


-- =====================================================================
--  F — acknowledgement, which is not a refusal
-- =====================================================================
DO $f$
DECLARE
  stage uuid := current_setting('i11.stage_a')::uuid;
  p_mass uuid := current_setting('i11.p_mass')::uuid;
  c_a uuid := current_setting('i11.c_a')::uuid;
  r jsonb; ok boolean; msg text;
BEGIN
  ok := false; msg := NULL;
  BEGIN PERFORM public.batch_stage_record_reading(stage, p_mass, 600);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'BSPR_OOS_NEEDS_ACKNOWLEDGEMENT%'; msg := SQLERRM; END;
  PERFORM _i11k('F','F1 saving an OOS reading unacknowledged is refused',
    ok, left(coalesce(msg,''),200));

  --  AND THE MESSAGE SAYS THE READING CAN BE SAVED. This is not
  --  decoration: an operator who reads a refusal as "the system will not
  --  take my number" writes it on paper, which is the outcome the first
  --  NOT DONE IF exists to prevent.
  PERFORM _i11k('F','F2 and the refusal says the reading CAN be saved',
    msg LIKE '%can be saved%' AND msg LIKE '%acknowledge%',
    left(coalesce(msg,''),200));

  PERFORM _i11k('F','F3 it also names the limits it fell outside',
    msg LIKE '%530%' AND msg LIKE '%570%', left(coalesce(msg,''),200));

  --  With the acknowledgement, it saves.
  r := public.batch_stage_record_reading(stage, p_mass, 600, NULL, true);
  PERFORM _i11k('F','F4 with the acknowledgement it saves',
    (r->>'ok')='true', coalesce(r::text,'NULL'));

  PERFORM _i11k('F','F5 and the acknowledgement records who and when',
    (SELECT oos_acknowledged_by = current_setting('i11.u_op')::uuid
        AND oos_acknowledged_at IS NOT NULL
       FROM public.batch_stage_parameter_readings WHERE id=(r->>'reading_id')::uuid));

  PERFORM _i11k('F','F6 the result offers escalation rather than demanding it',
    (r->>'escalation_offered')='true', coalesce(r::text,'NULL'));
  PERFORM set_config('i11.r_oos', (r->>'reading_id'), false);

  --  An IN-specification reading needs no acknowledgement at all.
  r := public.batch_stage_record_reading(stage, p_mass, 550);
  PERFORM _i11k('F','F7 an in-specification reading needs no acknowledgement',
    (r->>'ok')='true'
    AND (SELECT oos_acknowledged_by IS NULL FROM public.batch_stage_parameter_readings
          WHERE id=(r->>'reading_id')::uuid));

  --  The constraint is the backstop: a direct insert cannot slip an
  --  unacknowledged OOS reading past it.
  ok := false; msg := NULL;
  BEGIN
    INSERT INTO public.batch_stage_parameter_readings
      (company_id,batch_stage_id,formula_parameter_id,parameter_name,parameter_type,
       min_value,max_value,reading_value,recorded_by)
    VALUES (c_a,stage,p_mass,'Tablet mass','product_attribute',530,570,600,
            current_setting('i11.u_op')::uuid);
  EXCEPTION WHEN others THEN ok := true; msg := SQLERRM; END;
  PERFORM _i11k('F','F8 a direct insert cannot skip the acknowledgement',
    ok, left(coalesce(msg,''),160));
END
$f$;


-- =====================================================================
--  G — escalation and the supervisor's decision
-- =====================================================================
DO $g$
DECLARE
  r_oos uuid := current_setting('i11.r_oos')::uuid;
  r jsonb; ok boolean; msg text;
BEGIN
  r := public.inprocess_escalate_reading(r_oos, 'Third consecutive high reading on the same punch');
  PERFORM _i11k('G','G1 an OOS reading can be escalated',
    (r->>'ok')='true', coalesce(r::text,'NULL'));
  PERFORM set_config('i11.esc', (r->>'escalation_id'), false);

  PERFORM _i11k('G','G2 and the escalation records who raised it, and the note',
    (SELECT raised_by = current_setting('i11.u_op')::uuid
        AND raised_note LIKE 'Third consecutive%'
        AND decision IS NULL
       FROM public.inprocess_oos_escalations WHERE id=(r->>'escalation_id')::uuid));

  --  ESCALATION IS OFFERED, NOT REQUIRED. The reading was already saved
  --  before any of this, which is what makes it optional.
  PERFORM _i11k('G','G3 the reading was saved before anyone escalated it',
    (SELECT recorded_at < (SELECT raised_at FROM public.inprocess_oos_escalations
                            WHERE id=(r->>'escalation_id')::uuid)
       FROM public.batch_stage_parameter_readings WHERE id=r_oos));

  --  A second escalation of the same reading would be two supervisors
  --  answering one question.
  ok := false; msg := NULL;
  BEGIN PERFORM public.inprocess_escalate_reading(r_oos, 'again');
  EXCEPTION WHEN others THEN ok := true; msg := SQLERRM; END;
  PERFORM _i11k('G','G4 one reading cannot be escalated twice', ok, left(coalesce(msg,''),160));

  --  The operator cannot answer their own escalation.
  ok := false; msg := NULL;
  BEGIN PERFORM public.inprocess_decide_escalation(
          current_setting('i11.esc')::uuid, 'accept', 'It is fine');
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'OOS_SELF_DECIDED%'; msg := SQLERRM; END;
  PERFORM _i11k('G','G5 the person who raised it cannot decide it',
    ok, left(coalesce(msg,''),180));

  --  Escalating a perfectly good reading is escalating nothing.
  ok := false; msg := NULL;
  BEGIN PERFORM public.inprocess_escalate_reading(current_setting('i11.r1')::uuid);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'BSPR_NOTHING_TO_ESCALATE%'; msg := SQLERRM; END;
  PERFORM _i11k('G','G6 an in-specification reading in zone 1 has nothing to escalate',
    ok, left(coalesce(msg,''),180));
END
$g$;

--  The supervisor decides.
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('i11.u_sup'), 'role','authenticated')::text, false);
DO $g2$
DECLARE esc uuid := current_setting('i11.esc')::uuid; r jsonb; ok boolean; msg text;
BEGIN
  ok := false; msg := NULL;
  BEGIN PERFORM public.inprocess_decide_escalation(esc, 'accept', '   ');
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'OOS_DECISION_NO_REASON%'; msg := SQLERRM; END;
  PERFORM _i11k('G','G7 a decision with no reason is refused', ok, left(coalesce(msg,''),180));

  ok := false; msg := NULL;
  BEGIN PERFORM public.inprocess_decide_escalation(esc, 'ignore it', 'because');
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'OOS_BAD_DECISION%'; msg := SQLERRM; END;
  PERFORM _i11k('G','G8 and so is a verdict outside the vocabulary',
    ok, left(coalesce(msg,''),180));

  r := public.inprocess_decide_escalation(esc, 'resample',
         'Punch 14 found loose and retightened; resampling 20 tablets before release of the sub-lot');
  PERFORM _i11k('G','G9 the supervisor''s decision is recorded',
    (r->>'ok')='true' AND (r->>'decision')='resample', coalesce(r::text,'NULL'));

  PERFORM _i11k('G','G10 with the verdict, the reason, who and when',
    (SELECT decision='resample'
        AND decision_reason LIKE 'Punch 14%'
        AND decided_by = current_setting('i11.u_sup')::uuid
        AND decided_at IS NOT NULL
       FROM public.inprocess_oos_escalations WHERE id=esc));

  --  AND STILL NO DEVIATION. Not even on a decision of 'investigate'.
  PERFORM _i11k('G','G11 and no deviation was created',
    (r->>'deviation_created')='false'
    AND (SELECT deviation_id IS NULL FROM public.inprocess_oos_escalations WHERE id=esc),
    coalesce(r::text,'NULL'));

  --  A recorded decision is final.
  ok := false; msg := NULL;
  BEGIN PERFORM public.inprocess_decide_escalation(esc, 'accept', 'changed my mind');
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'OOS_DECISION_FINAL%'; msg := SQLERRM; END;
  PERFORM _i11k('G','G12 a decision cannot be decided twice', ok, left(coalesce(msg,''),180));

  ok := false; msg := NULL;
  BEGIN UPDATE public.inprocess_oos_escalations SET decision='accept' WHERE id=esc;
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'OOS_DECISION_FINAL%'; msg := SQLERRM; END;
  PERFORM _i11k('G','G13 nor edited afterwards', ok, left(coalesce(msg,''),180));

  ok := false; msg := NULL;
  BEGIN DELETE FROM public.inprocess_oos_escalations WHERE id=esc;
  EXCEPTION WHEN others THEN
    ok := SQLERRM LIKE 'OOS_ESCALATION_IMMUTABLE%' OR SQLERRM LIKE 'permission denied%';
    msg := SQLERRM;
  END;
  PERFORM _i11k('G','G14 nor deleted', ok, left(coalesce(msg,''),180));
END
$g2$;

--  THE STORAGE RULES BENEATH THE RPC.
--
--  G7 and G8 go through inprocess_decide_escalation, which validates the
--  reason and the vocabulary itself — so they pass whether or not the
--  CHECK constraints exist, and mutation testing showed exactly that:
--  dropping either constraint changed nothing either assertion could see.
--  The RPC is the front door and the constraints are the floor; a suite
--  that only knocks on the door never finds out there is no floor.
--
--  Reaching the constraints means writing the table directly, which RLS
--  permits for an owner, so no trigger needs disabling here.
RESET ROLE;
DO $g3$
DECLARE
  c_a uuid := current_setting('i11.c_a')::uuid;
  u_op uuid := current_setting('i11.u_op')::uuid;
  u_sup uuid := current_setting('i11.u_sup')::uuid;
  r uuid; e uuid; ok boolean; msg text;
BEGIN
  --  A fresh OOS reading to hang the probes on, so nothing here disturbs
  --  the escalation section G already decided.
  INSERT INTO public.batch_stage_parameter_readings
    (company_id,batch_stage_id,formula_parameter_id,parameter_name,parameter_type,
     reading_value,recorded_by,oos_acknowledged_by,oos_acknowledged_at)
  VALUES (c_a,current_setting('i11.stage_a')::uuid,current_setting('i11.p_mass')::uuid,
          'Tablet mass','product_attribute',500,u_op,u_op,now())
  RETURNING id INTO r;

  ok := false; msg := NULL;
  BEGIN
    INSERT INTO public.inprocess_oos_escalations
      (company_id,reading_id,raised_by,decision,decided_by,decided_at)
    VALUES (c_a,r,u_op,'reject',u_sup,now());
  EXCEPTION WHEN check_violation THEN ok := true; msg := SQLERRM;
            WHEN others THEN msg := SQLERRM;
  END;
  PERFORM _i11k('G','G15 storage refuses a decision with no reason', ok,
    left(coalesce(msg,'the reasonless decision was stored'),180));

  ok := false; msg := NULL;
  BEGIN
    INSERT INTO public.inprocess_oos_escalations
      (company_id,reading_id,raised_by,decision,decision_reason,decided_by,decided_at)
    VALUES (c_a,r,u_op,'maybe later','Felt right at the time',u_sup,now());
  EXCEPTION WHEN check_violation THEN ok := true; msg := SQLERRM;
            WHEN others THEN msg := SQLERRM;
  END;
  PERFORM _i11k('G','G16 and a verdict outside the vocabulary', ok,
    left(coalesce(msg,'the invented verdict was stored'),180));

  --  A decided-by with no decision is the same incompleteness from the
  --  other side: somebody recorded as having answered a question that
  --  was never answered.
  ok := false; msg := NULL;
  BEGIN
    INSERT INTO public.inprocess_oos_escalations
      (company_id,reading_id,raised_by,decided_by,decided_at)
    VALUES (c_a,r,u_op,u_sup,now());
  EXCEPTION WHEN check_violation THEN ok := true; msg := SQLERRM;
            WHEN others THEN msg := SQLERRM;
  END;
  PERFORM _i11k('G','G17 nor a decider with no decision', ok,
    left(coalesce(msg,'the half-decision was stored'),180));

  --  And the complete row goes in, so G15-G17 are about what is missing
  --  from each and not about the insert being impossible.
  ok := false; msg := NULL;
  BEGIN
    INSERT INTO public.inprocess_oos_escalations
      (company_id,reading_id,raised_by,decision,decision_reason,decided_by,decided_at)
    VALUES (c_a,r,u_op,'reject','Under the lower action limit; batch portion rejected',
            u_sup,now())
    RETURNING id INTO e;
    ok := e IS NOT NULL;
  EXCEPTION WHEN others THEN msg := SQLERRM; END;
  PERFORM _i11k('G','G18 while a complete decision is accepted', ok,
    left(coalesce(msg,''),180));
END
$g3$;
SET ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('i11.u_op'), 'role','authenticated')::text, false);


-- =====================================================================
--  H — what was deliberately NOT built
--
--  NOT DONE IF: "The interlock path was built anyway."
--
--  An assertion about something NOT existing is weak by nature — it
--  cannot distinguish "deliberately absent" from "forgotten". So these
--  probe the OBSERVABLE CONSEQUENCE of the interlock not being there: an
--  out-of-specification machine setting is recorded, flagged, and
--  changes nothing else. If an interlock is added later, these fail and
--  whoever added it has to come and read this section, which is the
--  point.
-- =====================================================================
DO $h$
DECLARE
  stage uuid := current_setting('i11.stage_a')::uuid;
  r_turret uuid := current_setting('i11.r_turret')::uuid;
  v_status text;
BEGIN
  PERFORM _i11k('H','H1 the out-of-specification machine setting was recorded and flagged',
    (SELECT in_specification = false AND parameter_type='machine_setting'
       FROM public.batch_stage_parameter_readings WHERE id=r_turret));

  --  The stage did not move. An interlock, whatever it turns out to be,
  --  would show up here first.
  SELECT status INTO v_status FROM public.batch_stages WHERE id=stage;
  PERFORM _i11k('H','H2 and the stage was not stopped, held or otherwise moved',
    v_status = 'in_progress', coalesce(v_status,'NULL'));

  --  No instrument was taken out of service either — the other obvious
  --  shape an interlock could take.
  PERFORM _i11k('H','H3 nor was any instrument taken out of service',
    (SELECT status='in_service' FROM public.instruments
      WHERE id=current_setting('i11.bal')::uuid));

  --  And the batch itself is untouched.
  PERFORM _i11k('H','H4 nor the batch record',
    (SELECT br.status = 'in_progress'
       FROM public.batch_records br
       JOIN public.batch_stages bs ON bs.batch_id = br.id
      WHERE bs.id = stage));

  --  The machine setting got no zone, because zones are a weight test's.
  PERFORM _i11k('H','H5 a machine setting gets no weight zone',
    (SELECT weight_zone IS NULL FROM public.batch_stage_parameter_readings WHERE id=r_turret));

  --  A weight-variation flag on a machine setting is refused outright,
  --  which is the one piece of the interlock question this migration
  --  does settle: zones belong to product attributes.
  DECLARE ok boolean := false; msg text;
  BEGIN
    BEGIN
      INSERT INTO public.master_formula_stage_parameters
        (stage_id,parameter,parameter_type,unit,target_value,is_weight_variation)
      VALUES (current_setting('i11.st_def')::uuid,'Bogus setting','machine_setting','rpm',10,true);
    EXCEPTION WHEN others THEN ok := true; msg := SQLERRM; END;
    PERFORM _i11k('H','H6 a machine setting cannot be marked as a weight-variation test',
      ok, left(coalesce(msg,''),160));
  END;
END
$h$;


-- =====================================================================
--  I — derived fields are not editable
-- =====================================================================
DO $i$
DECLARE r1 uuid := current_setting('i11.r1')::uuid; ok boolean; msg text; n integer;
BEGIN
  ok := false; msg := NULL;
  BEGIN UPDATE public.batch_stage_parameter_readings SET sequence_no = 99 WHERE id=r1;
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'BSPR_DERIVED_READ_ONLY%'; msg := SQLERRM; END;
  PERFORM _i11k('I','I1 the result number cannot be changed', ok, left(coalesce(msg,''),180));

  ok := false; msg := NULL;
  BEGIN UPDATE public.batch_stage_parameter_readings SET weight_zone = '1' WHERE id=
    (SELECT id FROM public.batch_stage_parameter_readings
      WHERE batch_stage_id=current_setting('i11.stage_a')::uuid AND weight_zone='3U' LIMIT 1);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'BSPR_DERIVED_READ_ONLY%'; msg := SQLERRM; END;
  PERFORM _i11k('I','I2 nor the zone it fell in', ok, left(coalesce(msg,''),180));

  --  Item 07's rule still holds: the value itself is immutable too.
  ok := false; msg := NULL;
  BEGIN UPDATE public.batch_stage_parameter_readings SET reading_value = 555 WHERE id=r1;
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'BATCH_READING_IMMUTABLE%'; msg := SQLERRM; END;
  PERFORM _i11k('I','I3 and the reading itself is still immutable', ok, left(coalesce(msg,''),180));

  SELECT count(*) INTO n FROM public.batch_stage_parameter_readings
   WHERE batch_stage_id=current_setting('i11.stage_a')::uuid;
  PERFORM _i11k('I','I4 and the readings are all still there', n >= 12, n||' reading(s)');
END
$i$;


-- =====================================================================
--  J — tenancy
-- =====================================================================
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('i11.u_b'), 'role','authenticated')::text, false);
DO $j$
DECLARE
  c_a uuid := current_setting('i11.c_a')::uuid;
  stage uuid := current_setting('i11.stage_a')::uuid;
  n integer; ok boolean; msg text;
BEGIN
  SELECT count(*) INTO n FROM public.product_weight_limits WHERE company_id=c_a;
  PERFORM _i11k('J','J1 another company cannot see the zone limits', n=0, n||' row(s)');

  SELECT count(*) INTO n FROM public.inprocess_oos_escalations WHERE company_id=c_a;
  PERFORM _i11k('J','J2 nor the escalations and decisions', n=0, n||' row(s)');

  SELECT count(*) INTO n FROM public.batch_stage_parameter_readings WHERE company_id=c_a;
  PERFORM _i11k('J','J3 nor the readings', n=0, n||' row(s)');

  --  THE CLASSIFIER IS SECURITY DEFINER, so J1 proving the table is
  --  closed proves nothing about the function over it. A foreign caller
  --  who knows a product id could otherwise probe it at a few values and
  --  read the action limits off the answers.
  ok := false; msg := NULL;
  BEGIN PERFORM public.weight_variation_zone(current_setting('i11.p_a')::uuid, 550);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'WEIGHT_LIMITS_FORBIDDEN%'; msg := SQLERRM; END;
  PERFORM _i11k('J','J4 nor read the limits through the classifier over them',
    ok, left(coalesce(msg,'no error raised'),180));

  --  ...and a product that simply has no limits still answers
  --  "unconfigured", because existence is not what J4 guards.
  PERFORM _i11k('J','J5 while an unconfigured product is still reported, not refused',
    (SELECT limits_configured = false
       FROM public.weight_variation_zone('00000000-0000-4000-1111-00000000ffff'::uuid, 550)));

  ok := false; msg := NULL;
  BEGIN PERFORM public.inprocess_sampling_due(stage);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'BSPR_FORBIDDEN%'; msg := SQLERRM; END;
  PERFORM _i11k('J','J6 and cannot ask what is due on their stage',
    ok, left(coalesce(msg,''),180));

  ok := false; msg := NULL;
  BEGIN PERFORM public.inprocess_escalate_reading(current_setting('i11.r1')::uuid);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'BSPR_FORBIDDEN%'; msg := SQLERRM; END;
  PERFORM _i11k('J','J7 nor escalate one of their readings', ok, left(coalesce(msg,''),180));

  ok := false; msg := NULL;
  BEGIN PERFORM public.inprocess_decide_escalation(
          current_setting('i11.esc')::uuid,'accept','mine now');
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'BSPR_FORBIDDEN%' OR SQLERRM LIKE 'OOS_%'; msg := SQLERRM; END;
  PERFORM _i11k('J','J8 nor decide one', ok, left(coalesce(msg,''),180));
END
$j$;
RESET ROLE; RESET request.jwt.claims;

DO $j2$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM public.product_weight_limits
   WHERE company_id=current_setting('i11.c_a')::uuid;
  PERFORM _i11k('J','J9 and the owner is not locked out of their own limits',
    n = 2, n||' row(s)');
END
$j2$;

-- ═════════════════════════════════════════════════════════════════════
--  W4·19 — WHAT THE SCREENS ARE TOLD
--
--  Sections K, L and M cover the three in-process reports added in
--  20261031000000_inprocess_zone_entry_and_yield_accounting.sql. They
--  live in THIS suite rather than a new one on purpose: the zone key
--  and the live verdict both have to agree with weight_variation_zone(),
--  whose boundary convention section D asserts at every edge, and two
--  files is how those drift apart.
-- ═════════════════════════════════════════════════════════════════════
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('i11.u_op'), 'role','authenticated')::text, false);
SET ROLE authenticated;

DO $k$
DECLARE
  p_a uuid := current_setting('i11.p_a')::uuid;
  p_bare uuid;
  n integer; row_k record; z record; ok boolean; msg text;
BEGIN
  SELECT count(*) INTO n FROM public.inprocess_zone_key(p_a);
  PERFORM _i11k('K','K1 the zone key has one band per zone', n = 5, n||' band(s)');

  --  LOW TO HIGH, not the order the brief names the zones in. The key
  --  draws a gauge, and a gauge in the order "1, 2U, 2L, 3U, 3L" puts
  --  target in the middle of nothing.
  PERFORM _i11k('K','K2 and runs low to high, so it can be drawn as a scale',
    (SELECT array_agg(zone ORDER BY sort_order) FROM public.inprocess_zone_key(p_a))
      = ARRAY['3L','2L','1','2U','3U'],
    (SELECT array_agg(zone ORDER BY sort_order)::text FROM public.inprocess_zone_key(p_a)));

  PERFORM _i11k('K','K3 the bounds are the product''s own four limits',
    (SELECT lower_bound IS NULL AND upper_bound = 520
       FROM public.inprocess_zone_key(p_a) WHERE zone='3L')
    AND (SELECT lower_bound = 520 AND upper_bound = 540
       FROM public.inprocess_zone_key(p_a) WHERE zone='2L')
    AND (SELECT lower_bound = 540 AND upper_bound = 560
       FROM public.inprocess_zone_key(p_a) WHERE zone='1')
    AND (SELECT lower_bound = 560 AND upper_bound = 580
       FROM public.inprocess_zone_key(p_a) WHERE zone='2U')
    AND (SELECT lower_bound = 580 AND upper_bound IS NULL
       FROM public.inprocess_zone_key(p_a) WHERE zone='3U'));

  --  An unbounded end is NULL, not a large number. A gauge that drew a
  --  ceiling on zone 3U would be inventing a limit nobody configured.
  PERFORM _i11k('K','K4 an unbounded end is reported as absent, not as a big number',
    (SELECT count(*) = 2 FROM public.inprocess_zone_key(p_a)
      WHERE lower_bound IS NULL OR upper_bound IS NULL));

  --  ═══ THE ONE THAT MATTERS ═══
  --  The key and the classifier must agree at every edge. The key says
  --  which end of each band includes its own bound; section D says what
  --  the classifier does with a value sitting exactly there. If these
  --  two ever disagree, a gauge paints a reading in a band the database
  --  filed it outside of — and that is the single case nobody checks,
  --  because both answers look right on their own.
  ok := true; msg := '';
  FOR row_k IN SELECT * FROM public.inprocess_zone_key(p_a) ORDER BY sort_order LOOP
    IF row_k.lower_bound IS NOT NULL THEN
      SELECT * INTO z FROM public.weight_variation_zone(p_a, row_k.lower_bound);
      IF row_k.lower_inclusive AND z.zone <> row_k.zone THEN
        ok := false;
        msg := msg || format('%s claims %s inclusive but the classifier says %s; ',
                             row_k.zone, row_k.lower_bound, z.zone);
      ELSIF NOT row_k.lower_inclusive AND z.zone = row_k.zone THEN
        ok := false;
        msg := msg || format('%s claims %s exclusive but the classifier puts it there; ',
                             row_k.zone, row_k.lower_bound);
      END IF;
    END IF;
    IF row_k.upper_bound IS NOT NULL THEN
      SELECT * INTO z FROM public.weight_variation_zone(p_a, row_k.upper_bound);
      IF row_k.upper_inclusive AND z.zone <> row_k.zone THEN
        ok := false;
        msg := msg || format('%s claims %s inclusive but the classifier says %s; ',
                             row_k.zone, row_k.upper_bound, z.zone);
      ELSIF NOT row_k.upper_inclusive AND z.zone = row_k.zone THEN
        ok := false;
        msg := msg || format('%s claims %s exclusive but the classifier puts it there; ',
                             row_k.zone, row_k.upper_bound);
      END IF;
    END IF;
  END LOOP;
  PERFORM _i11k('K','K5 every bound the key declares agrees with the classifier',
    ok, left(msg,400));

  --  The actions are configuration, the same as D14 proves for the
  --  classifier. The key must not hardcode its own copy.
  UPDATE public.product_weight_limits SET zone_2u_action = 'resample' WHERE product_id = p_a;
  PERFORM _i11k('K','K6 the action on a band is configuration, not a constant',
    (SELECT action = 'resample' FROM public.inprocess_zone_key(p_a) WHERE zone='2U'));
  UPDATE public.product_weight_limits SET zone_2u_action = 'adjust' WHERE product_id = p_a;

  --  NO ROWS for an unconfigured product, rather than five empty bands.
  --  Five bands with null bounds would draw a gauge that looks set up;
  --  nothing lets the screen say so. Same refusal to default as D.
  --
  --  A PRODUCT OF ITS OWN, because i11.p_nolimits stops living up to
  --  its name in section E — E5/E6 give it limits of its own to prove
  --  the limits are per product. A test that reused it here would pass
  --  only as long as it ran before E.
  INSERT INTO public.products(company_id,product_code,trade_name,category,created_by)
  VALUES (current_setting('i11.c_a')::uuid, 'ITEM11K-'||substr(md5(random()::text),1,8),
          'Tablet K (never zoned)','drug_pharmaceutical',
          current_setting('i11.u_op')::uuid)
  RETURNING id INTO p_bare;

  SELECT count(*) INTO n FROM public.inprocess_zone_key(p_bare);
  PERFORM _i11k('K','K7 a product with no limits gets no bands, not five empty ones',
    n = 0, n||' band(s)');

  ok := false; msg := NULL;
  BEGIN PERFORM public.inprocess_zone_key('00000000-0000-4000-1111-0000000f0f0f'::uuid);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'IP_NO_PRODUCT%'; msg := SQLERRM; END;
  PERFORM _i11k('K','K8 and a product that does not exist is named as such',
    ok, left(coalesce(msg,'no error raised'),180));
END
$k$;


DO $l$
DECLARE
  stage uuid := current_setting('i11.stage_a')::uuid;
  stage_b uuid := current_setting('i11.stage_b')::uuid;
  p_mass uuid := current_setting('i11.p_mass')::uuid;
  p_hard uuid := current_setting('i11.p_hard')::uuid;
  p_turret uuid := current_setting('i11.p_turret')::uuid;
  p_force uuid := current_setting('i11.p_force')::uuid;
  p_mass_b uuid := current_setting('i11.p_mass_b')::uuid;
  n integer; n_readings integer; ok boolean; msg text; v numeric;
  v_lal numeric; v_lwl numeric; v_uwl numeric; v_ual numeric; v_target numeric;
BEGIN
  --  An empty field is the normal state of a form, not a condition.
  SELECT count(*) INTO n FROM public.inprocess_reading_conditions(stage, p_mass, NULL);
  PERFORM _i11k('L','L1 nothing typed yet is not a condition', n = 0, n||' row(s)');

  --  550 mg is on target: in specification and in zone 1. A calm
  --  screen says nothing, which is what makes a flag mean something.
  SELECT count(*) INTO n FROM public.inprocess_reading_conditions(stage, p_mass, 550);
  PERFORM _i11k('L','L2 a value on target raises nothing', n = 0, n||' row(s)');

  --  ═══ THE ONE THAT MATTERS ═══
  --  EVERY ROW IS FLAGGED, at every value, on every parameter. Item
  --  11's first NOT DONE IF is "an OOS reading blocks entry" and the
  --  machine-setting interlock is a proposal Damilola and Aderoh have
  --  not decided on. A single blocked row here would put a red "can't"
  --  on a tablet on the strength of an undecided control.
  ok := true; msg := '';
  FOREACH v IN ARRAY ARRAY[400,519,520,529,530,539,540,550,560,561,570,571,580,581,700] LOOP
    IF EXISTS (SELECT 1 FROM public.inprocess_reading_conditions(stage, p_mass, v)
                WHERE severity <> 'flagged') THEN
      ok := false; msg := msg || v || ' ';
    END IF;
    IF EXISTS (SELECT 1 FROM public.inprocess_reading_conditions(stage, p_force, v)
                WHERE severity <> 'flagged') THEN
      ok := false; msg := msg || 'force@' || v || ' ';
    END IF;
  END LOOP;
  PERFORM _i11k('L','L3 no value on any parameter produces a blocked row',
    ok, left(msg,300));

  --  W4·18's shape rule: a flagged condition names what lets the work
  --  continue. "You can continue with:" followed by nothing is worse
  --  than no distinction at all, because it looks right.
  ok := true; msg := '';
  FOREACH v IN ARRAY ARRAY[400,520,529,540,561,571,581,700] LOOP
    IF EXISTS (SELECT 1 FROM public.inprocess_reading_conditions(stage, p_mass, v)
                WHERE coalesce(btrim(continue_with),'') = '') THEN
      ok := false; msg := msg || v || ' ';
    END IF;
  END LOOP;
  PERFORM _i11k('L','L4 and every flagged row says what lets the work continue',
    ok, left(msg,300));

  --  529 mg is below the 530 specification minimum AND in zone 2L —
  --  two independent judgements, reported as two rows. Section D keeps
  --  the limits deliberately offset from the specification so a test
  --  cannot pass by conflating them, and the same offset matters here:
  --  a screen showing one row would hide half of what is wrong.
  PERFORM _i11k('L','L5 a value both out of specification and out of zone raises both',
    (SELECT count(*) = 2 FROM public.inprocess_reading_conditions(stage, p_mass, 529))
    AND EXISTS (SELECT 1 FROM public.inprocess_reading_conditions(stage, p_mass, 529)
                 WHERE condition_key = 'reading_out_of_specification')
    AND EXISTS (SELECT 1 FROM public.inprocess_reading_conditions(stage, p_mass, 529)
                 WHERE condition_key = 'weight_zone_2l'),
    (SELECT string_agg(condition_key,', ' ORDER BY sort_order)
       FROM public.inprocess_reading_conditions(stage, p_mass, 529)));

  --  565 mg is INSIDE the 530-570 specification and in zone 2U. The
  --  zone is the point of the zones: a reading can be perfectly in
  --  specification and still say the machine is drifting.
  PERFORM _i11k('L','L6 a value in specification can still be out of zone',
    (SELECT count(*) = 1 FROM public.inprocess_reading_conditions(stage, p_mass, 565))
    AND EXISTS (SELECT 1 FROM public.inprocess_reading_conditions(stage, p_mass, 565)
                 WHERE condition_key = 'weight_zone_2u'),
    (SELECT string_agg(condition_key,', ' ORDER BY sort_order)
       FROM public.inprocess_reading_conditions(stage, p_mass, 565)));

  --  A zone 3 row sorts above a zone 2 row, so the gravest thing on a
  --  screen is the thing at the top of it.
  PERFORM _i11k('L','L7 the specification row sorts above the zone row',
    (SELECT min(sort_order) FROM public.inprocess_reading_conditions(stage, p_mass, 600)
      WHERE condition_key='reading_out_of_specification')
    < (SELECT min(sort_order) FROM public.inprocess_reading_conditions(stage, p_mass, 600)
        WHERE condition_key LIKE 'weight_zone%'));

  --  Hardness is a product attribute that is NOT the weight test, so it
  --  never gets a zone row however far out it is.
  PERFORM _i11k('L','L8 a non-weight test never gets a zone row',
    NOT EXISTS (SELECT 1 FROM public.inprocess_reading_conditions(stage, p_hard, 10)
                 WHERE condition_key LIKE 'weight_zone%'
                    OR condition_key = 'no_weight_limits'),
    (SELECT string_agg(condition_key,', ') FROM
       public.inprocess_reading_conditions(stage, p_hard, 10)));

  --  An unconfigured product's weight test is told so, rather than
  --  being told zone 1 — a green light nobody set.
  --
  --  Product B's limits are lifted for the length of this assertion and
  --  put back, because section E gave it limits of its own to prove the
  --  limits are per product, and section G's readings were judged
  --  against them.
  SELECT lal, lwl, uwl, ual, target_value INTO v_lal, v_lwl, v_uwl, v_ual, v_target
    FROM public.product_weight_limits WHERE product_id = current_setting('i11.p_nolimits')::uuid;
  DELETE FROM public.product_weight_limits
   WHERE product_id = current_setting('i11.p_nolimits')::uuid;

  PERFORM _i11k('L','L9 an unconfigured product is told so, not given a zone',
    EXISTS (SELECT 1 FROM public.inprocess_reading_conditions(stage_b, p_mass_b, 550)
             WHERE condition_key = 'no_weight_limits' AND severity = 'flagged'
               AND coalesce(btrim(continue_with),'') <> '')
    AND NOT EXISTS (SELECT 1 FROM public.inprocess_reading_conditions(stage_b, p_mass_b, 550)
                     WHERE condition_key LIKE 'weight_zone%'),
    (SELECT string_agg(condition_key,', ')
       FROM public.inprocess_reading_conditions(stage_b, p_mass_b, 550)));

  INSERT INTO public.product_weight_limits
    (company_id,product_id,target_value,lal,lwl,uwl,ual,unit,created_by)
  VALUES (current_setting('i11.c_a')::uuid, current_setting('i11.p_nolimits')::uuid,
          v_target, v_lal, v_lwl, v_uwl, v_ual, 'mg', current_setting('i11.u_op')::uuid);

  --  IP-05. A CRITICAL machine setting out of specification gets its own
  --  row, and that row is flagged. This is the proposal the design shows
  --  in red; the backend will not say red until somebody decides it.
  PERFORM _i11k('L','L10 a critical machine setting out of specification is flagged, not stopped',
    EXISTS (SELECT 1 FROM public.inprocess_reading_conditions(stage, p_force, 20)
             WHERE condition_key = 'critical_machine_setting' AND severity = 'flagged'
               AND coalesce(btrim(continue_with),'') <> ''));

  --  Turret speed is a machine setting that is NOT critical, so the
  --  critical row does not fire for it. Without this, the row would be
  --  "any machine setting", and the proposal in IP-05 is narrower.
  PERFORM _i11k('L','L11 and a non-critical machine setting does not raise that row',
    NOT EXISTS (SELECT 1 FROM public.inprocess_reading_conditions(stage, p_turret, 99)
                 WHERE condition_key = 'critical_machine_setting'));

  --  The report is STABLE and asking it about a value commits nothing.
  --  A screen updates this on every keystroke; a report that wrote a
  --  row would fill the record with numbers nobody meant to record.
  SELECT count(*) INTO n_readings FROM public.batch_stage_parameter_readings
   WHERE batch_stage_id = stage;
  PERFORM public.inprocess_reading_conditions(stage, p_mass, 601);
  PERFORM public.inprocess_reading_conditions(stage, p_mass, 602);
  SELECT count(*) INTO n FROM public.batch_stage_parameter_readings
   WHERE batch_stage_id = stage;
  PERFORM _i11k('L','L12 asking about a value records nothing',
    n = n_readings, n_readings||' before, '||n||' after');

  --  A parameter that is not a test on this stage is named as such,
  --  rather than silently returning no conditions — which a screen
  --  would render as "nothing wrong".
  ok := false; msg := NULL;
  BEGIN PERFORM public.inprocess_reading_conditions(stage, p_mass_b, 550);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'BSPR_NO_PARAMETER%'; msg := SQLERRM; END;
  PERFORM _i11k('L','L13 a parameter from another stage is refused, not reported as clean',
    ok, left(coalesce(msg,'no error raised'),180));
END
$l$;


DO $m$
DECLARE
  stage uuid; p_mass uuid := current_setting('i11.p_mass')::uuid;
  r jsonb; n integer; t timestamptz; ok boolean; msg text;
BEGIN
  --  Its own stage, so the history under test is exactly the readings
  --  this section took. Earlier sections record on stage_a and a
  --  history assertion that counted those would break whenever one of
  --  them gained a reading.
  stage := _i11_batch(current_setting('i11.p_a')::uuid, 'I11-0019');

  PERFORM public.batch_stage_record_reading(stage, p_mass, 550);
  PERFORM public.batch_stage_record_reading(stage, p_mass, 565);
  r := public.batch_stage_record_reading(stage, p_mass, 585, NULL, true);

  SELECT count(*) INTO n FROM public.inprocess_shift_history(stage, p_mass);
  PERFORM _i11k('M','M1 the history has a chip per reading', n = 3, n||' chip(s)');

  PERFORM _i11k('M','M2 in the order they were taken, with the zone each fell in',
    (SELECT array_agg(zone ORDER BY sequence_no) FROM public.inprocess_shift_history(stage, p_mass))
      = ARRAY['1','2U','3U'],
    (SELECT array_agg(zone ORDER BY sequence_no)::text
       FROM public.inprocess_shift_history(stage, p_mass)));

  --  ═══ THE ONE THAT MATTERS ═══
  --  The zone is read from the column the reading snapshotted, NOT
  --  recomputed. A product's limits can be revised, and a history that
  --  re-zoned old readings against today's limits would quietly rewrite
  --  what the shift saw — the shift would be told it had been working
  --  inside the warning limits all along.
  UPDATE public.product_weight_limits
     SET lwl = 500, uwl = 600, lal = 480, ual = 620 WHERE product_id = current_setting('i11.p_a')::uuid;
  PERFORM _i11k('M','M3 revising the limits does not re-zone what the shift already saw',
    (SELECT array_agg(zone ORDER BY sequence_no) FROM public.inprocess_shift_history(stage, p_mass))
      = ARRAY['1','2U','3U'],
    (SELECT array_agg(zone ORDER BY sequence_no)::text
       FROM public.inprocess_shift_history(stage, p_mass)));
  UPDATE public.product_weight_limits
     SET lal = 520, lwl = 540, uwl = 560, ual = 580 WHERE product_id = current_setting('i11.p_a')::uuid;

  --  Escalated but undecided is a different chip from decided. A
  --  supervisor having been asked and a supervisor having answered are
  --  not the same state, and an operator waiting on one needs to know
  --  which.
  PERFORM public.inprocess_escalate_reading((r->>'reading_id')::uuid, 'Third sample high');
  PERFORM _i11k('M','M4 an escalated reading shows as escalated and undecided',
    (SELECT escalated AND decision IS NULL FROM public.inprocess_shift_history(stage, p_mass)
      WHERE reading_id = (r->>'reading_id')::uuid));

  PERFORM _i11k('M','M5 and an un-escalated one shows as neither',
    (SELECT count(*) = 2 FROM public.inprocess_shift_history(stage, p_mass)
      WHERE NOT escalated AND decision IS NULL));

  --  The window is a parameter, because this schema does not know what
  --  a shift is. A clock-derived default would be a guess with an
  --  operator's name on it.
  t := now() + interval '1 minute';
  SELECT count(*) INTO n FROM public.inprocess_shift_history(stage, p_mass, t);
  PERFORM _i11k('M','M6 a window after the readings is empty', n = 0, n||' chip(s)');

  SELECT count(*) INTO n
    FROM public.inprocess_shift_history(stage, p_mass, now() - interval '1 day');
  PERFORM _i11k('M','M7 and a window before them holds them all', n = 3, n||' chip(s)');

  PERFORM set_config('i11.stage_hist', stage::text, false);
END
$m$;
RESET ROLE; RESET request.jwt.claims;

SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('i11.u_b'), 'role','authenticated')::text, false);
SET ROLE authenticated;

DO $m2$
DECLARE ok boolean; msg text;
BEGIN
  --  All three reports are SECURITY DEFINER, so section J proving the
  --  tables are closed proves nothing about them.
  ok := false; msg := NULL;
  BEGIN PERFORM public.inprocess_zone_key(current_setting('i11.p_a')::uuid);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'IP_FORBIDDEN%'; msg := SQLERRM; END;
  PERFORM _i11k('M','M8 a foreign company cannot read the zone key',
    ok, left(coalesce(msg,'no error raised'),180));

  ok := false; msg := NULL;
  BEGIN PERFORM public.inprocess_reading_conditions(
          current_setting('i11.stage_a')::uuid, current_setting('i11.p_mass')::uuid, 600);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'BSPR_FORBIDDEN%'; msg := SQLERRM; END;
  PERFORM _i11k('M','M9 nor ask what a value would be flagged as',
    ok, left(coalesce(msg,'no error raised'),180));

  ok := false; msg := NULL;
  BEGIN PERFORM public.inprocess_shift_history(
          current_setting('i11.stage_hist')::uuid, current_setting('i11.p_mass')::uuid);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'BSPR_FORBIDDEN%'; msg := SQLERRM; END;
  PERFORM _i11k('M','M10 nor read the shift history',
    ok, left(coalesce(msg,'no error raised'),180));
END
$m2$;
RESET ROLE; RESET request.jwt.claims;

DROP FUNCTION IF EXISTS _i11_batch(uuid,text);

\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo '  WEEK 4 / ITEM 11 — IN-PROCESS CONTROL AND OOS HANDLING'
\echo '════════════════════════════════════════════════════════════════'
SELECT section, count(*) AS assertions, count(*) FILTER (WHERE NOT ok) AS failures
  FROM _i11 GROUP BY section ORDER BY section;
SELECT section, name, coalesce(detail,'') AS detail FROM _i11 WHERE NOT ok ORDER BY section, name;
SELECT count(*) AS total, count(*) FILTER (WHERE ok) AS passed,
       count(*) FILTER (WHERE NOT ok) AS failed FROM _i11;

DO $v$
DECLARE f integer;
BEGIN
  SELECT count(*) INTO f FROM _i11 WHERE NOT ok;
  IF f > 0 THEN RAISE EXCEPTION 'ITEM 11: % assertion(s) failed', f; END IF;
  RAISE NOTICE 'ITEM 11: all assertions passed';
END
$v$;

DROP FUNCTION IF EXISTS _i11k(text,text,boolean,text);
DROP TABLE IF EXISTS _i11;
