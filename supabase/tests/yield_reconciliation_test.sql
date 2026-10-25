-- =====================================================================
--  WEEK 4 / ITEM 12 — YIELD RECONCILIATION
--
--  NOT DONE IF
--    The calculation is right but the threshold blocks nothing.
--    Threshold hardcoded.
--    Proceeding without a recorded authorisation.
--
--  THE FIRST CLAUSE SHAPES THIS WHOLE SUITE. An item that computes
--  yields correctly and blocks nothing would pass any number of
--  assertions about arithmetic while failing completely — and it would
--  look healthy from the outside: configs present, percentages right,
--  variances reported. So section D does not check a function's return
--  value. It calls batch_stage_complete and asserts the stage is STILL
--  NOT COMPLETE afterwards, which is the only evidence that a block
--  blocks.
--
--  THE SECOND CLAUSE is tested by giving two products different
--  thresholds for the same stage position, and two stages of one product
--  different thresholds — so an arrangement that reached for any single
--  number could not produce these answers. Section A also asserts the
--  column has no default, because a conventional default is a hardcoded
--  threshold wearing a column's clothes.
--
--  THE THIRD CLAUSE is section E: every incomplete authorisation is
--  refused, and the stage stays blocked after each refusal.
--
--  Sections:
--    A. Configuration: per product AND per stage, with no default
--    B. The arithmetic, including the threshold boundary
--    C. The four theoretical bases, and the units that are not converted
--    D. THE BLOCK on stage completion
--    E. Investigation, then authorisation, then proceeding
--    F. The block at batch completion
--    G. Recorded figures are not editable
--    H. What was deliberately NOT built
--    I. The status read for the screens
--    J. Tenancy
-- =====================================================================
\set ON_ERROR_STOP on
SET client_min_messages = warning;

CREATE TEMP TABLE _i12(section text, name text, ok boolean, detail text);
GRANT ALL ON _i12 TO anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION _i12k(p_section text, p_name text, p_ok boolean, p_detail text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO _i12 VALUES (p_section,p_name,coalesce(p_ok,false),p_detail); END $$;

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
--  TWO PRODUCTS and, for product A, TWO RECONCILED STAGES, because
--  "configurable per product and stage" cannot be demonstrated by one
--  of each. Granulation reconciles in kg against what was dispensed to
--  it; compression reconciles in tablets against granulation's output,
--  with an explicit conversion the product states.
DO $fx$
DECLARE
  c_a uuid := gen_random_uuid();
  c_b uuid := gen_random_uuid();
  u_op uuid := gen_random_uuid();
  u_sup uuid := gen_random_uuid();
  u_qa uuid := gen_random_uuid();
  u_b  uuid := gen_random_uuid();
  tag text := substr(replace(gen_random_uuid()::text,'-',''),1,8);
  p_a uuid; p_b uuid; p_c uuid; p_d uuid; m_api uuid; m_exc uuid;
  f_a uuid; f_b uuid; f_c uuid; f_d uuid;
  sg uuid; sc uuid; sb uuid; sc1 uuid; sd1 uuid; sd2 uuid; sd3 uuid; ln uuid;
BEGIN
  PERFORM set_config('i12.c_a', c_a::text, false);
  PERFORM set_config('i12.c_b', c_b::text, false);
  PERFORM set_config('i12.u_op', u_op::text, false);
  PERFORM set_config('i12.u_sup', u_sup::text, false);
  PERFORM set_config('i12.u_qa', u_qa::text, false);
  PERFORM set_config('i12.u_b',  u_b::text,  false);
  PERFORM set_config('i12.tag',  tag, false);

  INSERT INTO public.companies(id,name) VALUES
    (c_a,'Item12 Manufacturing '||tag), (c_b,'Item12 Elsewhere '||tag);

  INSERT INTO auth.users(id,email) VALUES
    (u_op ,'op-' ||tag||'@item12.test'),
    (u_sup,'sup-'||tag||'@item12.test'),
    (u_qa ,'qa-' ||tag||'@item12.test'),
    (u_b  ,'b-'  ||tag||'@item12.test');
  UPDATE auth.users SET encrypted_password = extensions.crypt('CorrectHorse1!', extensions.gen_salt('bf'))
   WHERE id IN (u_op,u_sup,u_qa,u_b);

  INSERT INTO public.profiles(id,email,full_name,company_id,role) VALUES
    (u_op ,'op-' ||tag||'@item12.test','Tunde Operator',  c_a,'content_creator'),
    (u_sup,'sup-'||tag||'@item12.test','Amara Supervisor',c_a,'admin'),
    (u_qa ,'qa-' ||tag||'@item12.test','Chidi Quality',   c_a,'compliance_officer'),
    (u_b  ,'b-'  ||tag||'@item12.test','Far Away',        c_b,'admin');

  INSERT INTO public.company_members(company_id,user_id,role,status) VALUES
    (c_a,u_op,'member','active'),(c_a,u_sup,'owner','active'),
    (c_a,u_qa,'member','active'),(c_b,u_b,'owner','active');

  INSERT INTO public.company_numbering_formats(company_id,scope,pattern,prefix,seq_width)
  VALUES (c_a,'material_lot','{PREFIX}-{SEQ}','I12',4);
  INSERT INTO public.material_qa_authorities(company_id,user_id,designated_by)
  VALUES (c_a,u_qa,u_qa);

  INSERT INTO public.products(id,company_id,product_code,trade_name,generic_name,category,created_by)
  VALUES (gen_random_uuid(),c_a,'ITEM12A-'||tag,'Yieldacet 500','Paracetamol','drug_pharmaceutical',u_op)
  RETURNING id INTO p_a;
  --  Product B exists to prove the threshold is per PRODUCT: the same
  --  stage position, a different number.
  INSERT INTO public.products(id,company_id,product_code,trade_name,generic_name,category,created_by)
  VALUES (gen_random_uuid(),c_a,'ITEM12B-'||tag,'Yieldamox 250','Amoxicillin','drug_pharmaceutical',u_op)
  RETURNING id INTO p_b;
  --  Product C is reconciled NOWHERE. Section D needs a stage that is
  --  genuinely not flagged, to prove the gate lets an unflagged stage
  --  through rather than blocking everything it is asked about. Without
  --  it, a gate that always said no would pass every other assertion in
  --  that section.
  INSERT INTO public.products(id,company_id,product_code,trade_name,generic_name,category,created_by)
  VALUES (gen_random_uuid(),c_a,'ITEM12C-'||tag,'Yieldazole 100','Fluconazole','drug_pharmaceutical',u_op)
  RETURNING id INTO p_c;
  PERFORM set_config('i12.p_a', p_a::text, false);
  PERFORM set_config('i12.p_b', p_b::text, false);
  --  Product D has THREE stages, and exists for one assertion:
  --  previous_stage_output must take the NEAREST EARLIER reconciliation,
  --  not the first one and not simply sequence_no - 1. With only two
  --  stages anywhere, ascending and descending order pick the same row
  --  and the claim is untestable — which is exactly what mutation
  --  testing found.
  INSERT INTO public.products(id,company_id,product_code,trade_name,generic_name,category,created_by)
  VALUES (gen_random_uuid(),c_a,'ITEM12D-'||tag,'Yieldapril 10','Lisinopril','drug_pharmaceutical',u_op)
  RETURNING id INTO p_d;
  PERFORM set_config('i12.p_c', p_c::text, false);
  PERFORM set_config('i12.p_d', p_d::text, false);

  INSERT INTO public.materials(company_id,code,name,material_type,criticality,unit_of_measure,created_by)
  VALUES (c_a,'API12-'||tag,'Paracetamol powder','active_ingredient','standard','kg',u_op)
  RETURNING id INTO m_api;
  INSERT INTO public.materials(company_id,code,name,material_type,criticality,unit_of_measure,created_by)
  VALUES (c_a,'EXC12-'||tag,'Microcrystalline cellulose','excipient','standard','kg',u_op)
  RETURNING id INTO m_exc;
  PERFORM set_config('i12.m_api', m_api::text, false);
  PERFORM set_config('i12.m_exc', m_exc::text, false);

  -- ── product A: granulation then compression.
  INSERT INTO public.master_formulas(company_id,product_id,version,batch_size,batch_size_unit,created_by)
  VALUES (c_a,p_a,'1.0',100000,'tablets',u_op) RETURNING id INTO f_a;
  INSERT INTO public.master_formula_stages(formula_id,sequence_no,stage_code,name)
  VALUES (f_a,1,'GRAN','Wet granulation') RETURNING id INTO sg;
  INSERT INTO public.master_formula_stages(formula_id,sequence_no,stage_code,name)
  VALUES (f_a,2,'COMP','Compression') RETURNING id INTO sc;
  --  40 kg of API and 10 kg of excipient: 50 kg dispensed to granulation.
  INSERT INTO public.master_formula_materials
    (formula_id,material_id,role,quantity_per_batch,unit,tolerance_pct,consumed_at_stage)
  VALUES (f_a,m_api,'active',40.0,'kg',2.0,sg),
         (f_a,m_exc,'diluent',10.0,'kg',2.0,sg);
  PERFORM set_config('i12.f_a', f_a::text, false);
  PERFORM set_config('i12.sg_def', sg::text, false);
  PERFORM set_config('i12.sc_def', sc::text, false);

  -- ── product B: one stage, and a DIFFERENT threshold for it.
  INSERT INTO public.master_formulas(company_id,product_id,version,batch_size,batch_size_unit,created_by)
  VALUES (c_a,p_b,'1.0',50000,'tablets',u_op) RETURNING id INTO f_b;
  INSERT INTO public.master_formula_stages(formula_id,sequence_no,stage_code,name)
  VALUES (f_b,1,'GRAN','Wet granulation') RETURNING id INTO sb;
  INSERT INTO public.master_formula_materials
    (formula_id,material_id,role,quantity_per_batch,unit,tolerance_pct,consumed_at_stage)
  VALUES (f_b,m_api,'active',20.0,'kg',2.0,sb);
  PERFORM set_config('i12.f_b', f_b::text, false);
  PERFORM set_config('i12.sb_def', sb::text, false);

  -- ── product C: one stage, no reconciliation config anywhere.
  INSERT INTO public.master_formulas(company_id,product_id,version,batch_size,batch_size_unit,created_by)
  VALUES (c_a,p_c,'1.0',50000,'tablets',u_op) RETURNING id INTO f_c;
  INSERT INTO public.master_formula_stages(formula_id,sequence_no,stage_code,name)
  VALUES (f_c,1,'GRAN','Wet granulation') RETURNING id INTO sc1;
  INSERT INTO public.master_formula_materials
    (formula_id,material_id,role,quantity_per_batch,unit,tolerance_pct,consumed_at_stage)
  VALUES (f_c,m_api,'active',20.0,'kg',2.0,sc1);
  PERFORM set_config('i12.f_c', f_c::text, false);
  PERFORM set_config('i12.sc1_def', sc1::text, false);

  -- ── product D: three stages, each reconciled, all in kg.
  INSERT INTO public.master_formulas(company_id,product_id,version,batch_size,batch_size_unit,created_by)
  VALUES (c_a,p_d,'1.0',50000,'tablets',u_op) RETURNING id INTO f_d;
  INSERT INTO public.master_formula_stages(formula_id,sequence_no,stage_code,name)
  VALUES (f_d,1,'BLEND','Blending') RETURNING id INTO sd1;
  INSERT INTO public.master_formula_stages(formula_id,sequence_no,stage_code,name)
  VALUES (f_d,2,'GRAN','Wet granulation') RETURNING id INTO sd2;
  INSERT INTO public.master_formula_stages(formula_id,sequence_no,stage_code,name)
  VALUES (f_d,3,'DRY','Drying') RETURNING id INTO sd3;
  INSERT INTO public.master_formula_materials
    (formula_id,material_id,role,quantity_per_batch,unit,tolerance_pct,consumed_at_stage)
  VALUES (f_d,m_api,'active',30.0,'kg',2.0,sd1);
  PERFORM set_config('i12.f_d', f_d::text, false);
  PERFORM set_config('i12.sd1_def', sd1::text, false);
  PERFORM set_config('i12.sd2_def', sd2::text, false);
  PERFORM set_config('i12.sd3_def', sd3::text, false);

  INSERT INTO public.production_lines(company_id,code,name,created_by)
  VALUES (c_a,'LINE-12','Yield line',u_op) RETURNING id INTO ln;
  PERFORM set_config('i12.ln', ln::text, false);

  --  Item 10 made material_dispense take an INSTRUMENT rather than a
  --  balance identifier, and it re-checks the calibration on every
  --  dispensing and again at stage completion. So this suite needs a
  --  balance in calibration, or every fixture dispensing would be
  --  refused by item 10's lockout and item 12 would never be reached.
  INSERT INTO public.instruments(company_id,code,name,instrument_type,owner_user_id,created_by)
  VALUES (c_a,'BAL-12','Dispensary balance','balance',u_sup,u_op);
  PERFORM set_config('i12.bal',
    (SELECT id::text FROM public.instruments WHERE company_id=c_a AND code='BAL-12'), false);
END
$fx$;

DO $cal$
BEGIN
  INSERT INTO public.instrument_calibrations
    (company_id,instrument_id,certificate_number,calibrated_on,due_on,
     performed_in_house,result,uploaded_by)
  VALUES (current_setting('i12.c_a')::uuid, current_setting('i12.bal')::uuid,
          'CAL-12-001', current_date-10, current_date+355, true, 'pass',
          current_setting('i12.u_sup')::uuid);
END
$cal$;


-- ── the configuration under test ─────────────────────────────────────
--
--  THREE CONFIGS FOR PRODUCT A, with three different thresholds, so no
--  single number can satisfy the suite:
--
--    granulation   2%    kg -> kg,      basis: dispensed to the stage
--    compression   5%    kg -> tablets, basis: the previous stage's
--                                       output, 2000 tablets per kg
--    at completion 3%    tablets,       basis: the planned batch size
--
--  and ONE for product B at 10% on the same stage position as product
--  A's 2%.
DO $cfg$
DECLARE
  c_a uuid := current_setting('i12.c_a')::uuid;
  u_sup uuid := current_setting('i12.u_sup')::uuid;
BEGIN
  INSERT INTO public.yield_reconciliation_configs
    (company_id,product_id,formula_stage_id,theoretical_basis,
     input_unit,output_unit,output_per_input,variance_threshold_pct,created_by)
  VALUES
    (c_a,current_setting('i12.p_a')::uuid,current_setting('i12.sg_def')::uuid,
     'dispensed_to_stage','kg','kg',1,2.0,u_sup),
    (c_a,current_setting('i12.p_a')::uuid,current_setting('i12.sc_def')::uuid,
     'previous_stage_output','kg','tablets',2000,5.0,u_sup),
    (c_a,current_setting('i12.p_a')::uuid,NULL,
     'planned_batch_size','tablets','tablets',1,3.0,u_sup),
    (c_a,current_setting('i12.p_b')::uuid,current_setting('i12.sb_def')::uuid,
     'dispensed_to_stage','kg','kg',1,10.0,u_sup),
    --  Product D: blending from what was dispensed, granulation and
    --  drying each from the stage before. Generous thresholds, because
    --  this product is here to test the CHAIN and not the block.
    (c_a,current_setting('i12.p_d')::uuid,current_setting('i12.sd1_def')::uuid,
     'dispensed_to_stage','kg','kg',1,20.0,u_sup),
    (c_a,current_setting('i12.p_d')::uuid,current_setting('i12.sd2_def')::uuid,
     'previous_stage_output','kg','kg',1,20.0,u_sup),
    --  DRYING'S CONFIG EXPECTS TONNES while every stage before it works
    --  in kg. Deliberate: it is the only way to reach the input-unit
    --  check on its own, because a mixed-unit DISPENSING set is refused
    --  earlier by yield_theoretical_basis and masks it.
    (c_a,current_setting('i12.p_d')::uuid,current_setting('i12.sd3_def')::uuid,
     'previous_stage_output','tonnes','tonnes',1,20.0,u_sup);
END
$cfg$;


-- ── registration, approval, lots, batches, clearance ─────────────────
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('i12.u_sup'), 'role','authenticated')::text, false);
SET ROLE authenticated;
DO $reg$
DECLARE c_a uuid := current_setting('i12.c_a')::uuid; p uuid;
BEGIN
  FOREACH p IN ARRAY ARRAY[current_setting('i12.p_a')::uuid, current_setting('i12.p_b')::uuid,
                           current_setting('i12.p_c')::uuid, current_setting('i12.p_d')::uuid]
  LOOP
    PERFORM public.lifecycle_transition('product', p, 'start_regulatory_prep', c_a);
    PERFORM public.lifecycle_transition('product', p, 'submit_to_regulator',   c_a);
    PERFORM public.lifecycle_transition('product', p, 'record_registration',   c_a, NULL, 'Granted');
  END LOOP;
END
$reg$;
RESET ROLE;

SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('i12.u_qa'), 'role','authenticated')::text, false);
SET ROLE authenticated;
DO $approve$
DECLARE
  c_a uuid := current_setting('i12.c_a')::uuid;
  u_qa uuid := current_setting('i12.u_qa')::uuid;
  l uuid; r jsonb; m uuid;
BEGIN
  PERFORM public.master_formula_approve(current_setting('i12.f_a')::uuid);
  PERFORM public.master_formula_approve(current_setting('i12.f_b')::uuid);
  PERFORM public.master_formula_approve(current_setting('i12.f_c')::uuid);
  PERFORM public.master_formula_approve(current_setting('i12.f_d')::uuid);

  --  A released lot of each material, generously sized: several batches
  --  draw on them.
  FOREACH m IN ARRAY ARRAY[current_setting('i12.m_api')::uuid, current_setting('i12.m_exc')::uuid]
  LOOP
    --  RECEIVED BY SOMEBODY ELSE. 20261126000000 writes received_by
    --  from the session, and 20261125000000 refuses the disposition
    --  to whoever received the lot — so a fixture that receives and
    --  releases as one person is refused, correctly. The INSERT runs
    --  in service context so the receiver on the row is the one this
    --  fixture means.
    PERFORM set_config('role','none',true);
    INSERT INTO public.material_lots
      (company_id,material_id,quantity_received,quantity_available,unit_of_measure,
       created_by,received_by)
    VALUES (c_a,m,2000,2000,'kg',u_qa,current_setting('i12.u_op')::uuid)
    RETURNING id INTO l;
    PERFORM set_config('role','authenticated',true);
    PERFORM public.lifecycle_transition('material_lot', l, 'sample', c_a, u_qa, 'Sampled');
    r := public.sign_electronic_record(c_a,'material_lot',l,'release','released','CorrectHorse1!');
    PERFORM public.material_lot_release(l,(r->>'signature_id')::uuid,'full');
    IF m = current_setting('i12.m_api')::uuid
      THEN PERFORM set_config('i12.lot_api', l::text, false);
      ELSE PERFORM set_config('i12.lot_exc', l::text, false);
    END IF;
  END LOOP;
END
$approve$;
RESET ROLE;

--  A helper: a batch taken as far as "stage 1 in progress, materials
--  dispensed". Several sections need one, and each needs its own,
--  because a reconciliation is unique per stage.
--
--  THE HELPER CHANGES HANDS PARTWAY THROUGH, because the chain it walks
--  requires it to: item 08 will not let the person who signed a line
--  clearance verify it, and item 09 will not dispense against a
--  clearance that has not been verified. So the claims are switched to
--  the QA user for the verification and switched back for the
--  dispensing. A fixture that quietly performed every step as one user
--  would not have been able to reach item 12 at all.
CREATE OR REPLACE FUNCTION _i12_batch(p_product uuid, p_number text, p_dispense boolean DEFAULT true)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  c_a uuid := current_setting('i12.c_a')::uuid;
  v_op  text := json_build_object('sub', current_setting('i12.u_op'), 'role','authenticated')::text;
  v_qa  text := json_build_object('sub', current_setting('i12.u_qa'), 'role','authenticated')::text;
  r jsonb; b uuid; cl uuid; it record; stage uuid; fm record;
BEGIN
  PERFORM set_config('request.jwt.claims', v_op, false);

  r := public.batch_record_initiate(c_a, p_number, p_product,
         current_date, current_date+365,
         CASE WHEN p_product = current_setting('i12.p_a')::uuid THEN 100000 ELSE 50000 END,
         'tablets');
  b := (r->>'batch_id')::uuid;

  PERFORM public.batch_record_assign_line(b, current_setting('i12.ln')::uuid);
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

  --  The second person.
  PERFORM set_config('request.jwt.claims', v_qa, false);
  r := public.sign_electronic_record(c_a,'line_clearance',cl,'verify','verified','CorrectHorse1!');
  PERFORM public.line_clearance_verify(cl,(r->>'signature_id')::uuid);

  --  Back to the operator for execution.
  PERFORM set_config('request.jwt.claims', v_op, false);

  SELECT id INTO stage FROM public.batch_stages WHERE batch_id=b AND sequence_no=1;
  PERFORM public.batch_stage_start(stage);

  IF p_dispense THEN
    --  Every formula material at exactly its required quantity, so the
    --  theoretical input is the formula's nominal total and any variance
    --  a section tests comes from the OUTPUT, not the input.
    FOR fm IN SELECT fmm.id, fmm.material_id, fmm.quantity_per_batch
                FROM public.master_formula_materials fmm
                JOIN public.batch_records br ON br.formula_id = fmm.formula_id
               WHERE br.id = b
    LOOP
      PERFORM public.material_dispense(
        b,
        CASE WHEN fm.material_id = current_setting('i12.m_api')::uuid
             THEN current_setting('i12.lot_api')::uuid
             ELSE current_setting('i12.lot_exc')::uuid END,
        fm.quantity_per_batch,
        current_setting('i12.bal')::uuid,
        fm.id, stage);
    END LOOP;
  END IF;

  RETURN stage;
END $$;

SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('i12.u_op'), 'role','authenticated')::text, false);
SET ROLE authenticated;
DO $batches$
DECLARE tag text := current_setting('i12.tag');
BEGIN
  --  One batch per scenario, because a reconciliation is unique per
  --  stage and several sections each need a fresh one.
  PERFORM set_config('i12.s_good',  _i12_batch(current_setting('i12.p_a')::uuid,'I12-GOOD-'||tag)::text, false);
  PERFORM set_config('i12.s_bad',   _i12_batch(current_setting('i12.p_a')::uuid,'I12-BAD-'||tag)::text, false);
  PERFORM set_config('i12.s_edge',  _i12_batch(current_setting('i12.p_a')::uuid,'I12-EDGE-'||tag)::text, false);
  PERFORM set_config('i12.s_auth',  _i12_batch(current_setting('i12.p_a')::uuid,'I12-AUTH-'||tag)::text, false);
  PERFORM set_config('i12.s_chain', _i12_batch(current_setting('i12.p_a')::uuid,'I12-CHAIN-'||tag)::text, false);
  PERFORM set_config('i12.s_zero',  _i12_batch(current_setting('i12.p_a')::uuid,'I12-ZERO-'||tag)::text, false);
  PERFORM set_config('i12.s_nodisp',
    _i12_batch(current_setting('i12.p_a')::uuid,'I12-NODISP-'||tag, false)::text, false);
  PERFORM set_config('i12.s_b',     _i12_batch(current_setting('i12.p_b')::uuid,'I12-PRODB-'||tag)::text, false);
  PERFORM set_config('i12.s_c',     _i12_batch(current_setting('i12.p_c')::uuid,'I12-PRODC-'||tag)::text, false);
  PERFORM set_config('i12.s_d',     _i12_batch(current_setting('i12.p_d')::uuid,'I12-PRODD-'||tag)::text, false);

  PERFORM set_config('i12.b_good',
    (SELECT batch_id::text FROM public.batch_stages WHERE id=current_setting('i12.s_good')::uuid), false);
  PERFORM set_config('i12.b_bad',
    (SELECT batch_id::text FROM public.batch_stages WHERE id=current_setting('i12.s_bad')::uuid), false);
  PERFORM set_config('i12.b_edge',
    (SELECT batch_id::text FROM public.batch_stages WHERE id=current_setting('i12.s_edge')::uuid), false);
  PERFORM set_config('i12.b_auth',
    (SELECT batch_id::text FROM public.batch_stages WHERE id=current_setting('i12.s_auth')::uuid), false);
  PERFORM set_config('i12.b_chain',
    (SELECT batch_id::text FROM public.batch_stages WHERE id=current_setting('i12.s_chain')::uuid), false);
  PERFORM set_config('i12.b_zero',
    (SELECT batch_id::text FROM public.batch_stages WHERE id=current_setting('i12.s_zero')::uuid), false);
  PERFORM set_config('i12.b_nodisp',
    (SELECT batch_id::text FROM public.batch_stages WHERE id=current_setting('i12.s_nodisp')::uuid), false);
  PERFORM set_config('i12.b_b',
    (SELECT batch_id::text FROM public.batch_stages WHERE id=current_setting('i12.s_b')::uuid), false);
  PERFORM set_config('i12.b_c',
    (SELECT batch_id::text FROM public.batch_stages WHERE id=current_setting('i12.s_c')::uuid), false);
  PERFORM set_config('i12.b_d',
    (SELECT batch_id::text FROM public.batch_stages WHERE id=current_setting('i12.s_d')::uuid), false);
END
$batches$;


-- =====================================================================
--  A — configuration: per product AND per stage, with no default
--
--  NOT DONE IF: "Threshold hardcoded."
-- =====================================================================
DO $a$
DECLARE
  c_a uuid := current_setting('i12.c_a')::uuid;
  ok boolean; msg text; n integer;
BEGIN
  --  PER STAGE: two stages of ONE product with different thresholds.
  PERFORM _i12k('A','A1 the threshold differs between two stages of one product',
    (SELECT variance_threshold_pct FROM public.yield_reconciliation_configs
      WHERE formula_stage_id = current_setting('i12.sg_def')::uuid) = 2.0
    AND (SELECT variance_threshold_pct FROM public.yield_reconciliation_configs
          WHERE formula_stage_id = current_setting('i12.sc_def')::uuid) = 5.0);

  --  PER PRODUCT: the same stage position, a different threshold.
  PERFORM _i12k('A','A2 and between two products at the same stage position',
    (SELECT variance_threshold_pct FROM public.yield_reconciliation_configs
      WHERE formula_stage_id = current_setting('i12.sb_def')::uuid) = 10.0,
    'product B granulation');

  --  THE COLUMN HAS NO DEFAULT. A conventional default would be a
  --  hardcoded threshold that happens to live in a column, which is the
  --  second NOT DONE IF; the deploy guard checks this too.
  PERFORM _i12k('A','A3 variance_threshold_pct has no default at all',
    NOT EXISTS (SELECT 1 FROM pg_attrdef d
                  JOIN pg_attribute at ON at.attrelid=d.adrelid AND at.attnum=d.adnum
                 WHERE d.adrelid='public.yield_reconciliation_configs'::regclass
                   AND at.attname='variance_threshold_pct'));

  --  ...so a config without one cannot be written.
  ok := false; msg := NULL;
  BEGIN
    INSERT INTO public.yield_reconciliation_configs
      (company_id,product_id,formula_stage_id,theoretical_basis,input_unit,output_unit)
    VALUES (c_a,current_setting('i12.p_b')::uuid,NULL,'planned_batch_size','tablets','tablets');
  EXCEPTION WHEN not_null_violation THEN ok := true; msg := SQLERRM;
            WHEN others THEN msg := SQLERRM;
  END;
  PERFORM _i12k('A','A4 and a config cannot be created without choosing one', ok,
    left(coalesce(msg,'a config with no threshold was stored'),160));

  --  One config per product and stage, including the batch-level row.
  --  Without NULLS NOT DISTINCT a product could carry several
  --  batch-level thresholds and the gate would pick one arbitrarily.
  ok := false; msg := NULL;
  BEGIN
    INSERT INTO public.yield_reconciliation_configs
      (company_id,product_id,formula_stage_id,theoretical_basis,
       input_unit,output_unit,variance_threshold_pct)
    VALUES (c_a,current_setting('i12.p_a')::uuid,NULL,'planned_batch_size','tablets','tablets',9.0);
  EXCEPTION WHEN unique_violation THEN ok := true; msg := SQLERRM;
            WHEN others THEN msg := SQLERRM;
  END;
  PERFORM _i12k('A','A5 a product cannot carry two batch-level thresholds', ok,
    left(coalesce(msg,'a second batch-level config was stored'),160));

  --  A negative threshold is not a tolerance.
  ok := false; msg := NULL;
  BEGIN
    INSERT INTO public.yield_reconciliation_configs
      (company_id,product_id,formula_stage_id,theoretical_basis,
       input_unit,output_unit,variance_threshold_pct)
    VALUES (c_a,current_setting('i12.p_b')::uuid,NULL,'planned_batch_size','tablets','tablets',-1);
  EXCEPTION WHEN check_violation THEN ok := true; msg := SQLERRM;
            WHEN others THEN msg := SQLERRM;
  END;
  PERFORM _i12k('A','A6 a negative threshold is refused', ok,
    left(coalesce(msg,'a negative threshold was stored'),160));

  --  A threshold of 100% or more would mean a batch that yielded nothing
  --  is within tolerance.
  ok := false; msg := NULL;
  BEGIN
    INSERT INTO public.yield_reconciliation_configs
      (company_id,product_id,formula_stage_id,theoretical_basis,
       input_unit,output_unit,variance_threshold_pct)
    VALUES (c_a,current_setting('i12.p_b')::uuid,NULL,'planned_batch_size','tablets','tablets',100);
  EXCEPTION WHEN check_violation THEN ok := true; msg := SQLERRM;
            WHEN others THEN msg := SQLERRM;
  END;
  PERFORM _i12k('A','A7 so is a threshold of 100% or more', ok,
    left(coalesce(msg,'a 100% threshold was stored'),160));

  --  ZERO IS ALLOWED. "Any variance at all blocks" is a legitimate
  --  choice for a high-value product, and refusing it would be this
  --  file deciding a policy question for its users.
  ok := false; msg := NULL;
  BEGIN
    INSERT INTO public.yield_reconciliation_configs
      (company_id,product_id,formula_stage_id,theoretical_basis,
       input_unit,output_unit,variance_threshold_pct)
    VALUES (c_a,current_setting('i12.p_b')::uuid,NULL,'planned_batch_size','tablets','tablets',0);
    ok := true;
  EXCEPTION WHEN others THEN msg := SQLERRM; END;
  PERFORM _i12k('A','A8 a threshold of zero is allowed', ok, left(coalesce(msg,''),160));
  DELETE FROM public.yield_reconciliation_configs
   WHERE product_id = current_setting('i12.p_b')::uuid AND formula_stage_id IS NULL;

  --  planned_batch_size belongs to batch completion and nowhere else: a
  --  stage reconciled against the whole batch's planned size would
  --  report the same variance at every stage.
  ok := false; msg := NULL;
  BEGIN
    INSERT INTO public.yield_reconciliation_configs
      (company_id,product_id,formula_stage_id,theoretical_basis,
       input_unit,output_unit,variance_threshold_pct)
    VALUES (c_a,current_setting('i12.p_b')::uuid,current_setting('i12.sb_def')::uuid,
            'planned_batch_size','tablets','tablets',5);
  EXCEPTION WHEN check_violation THEN ok := true; msg := SQLERRM;
            WHEN others THEN msg := SQLERRM;
  END;
  PERFORM _i12k('A','A9 a stage cannot reconcile against the planned batch size', ok,
    left(coalesce(msg,'a stage config used planned_batch_size'),160));

  --  And the batch-level row cannot use a stage basis.
  ok := false; msg := NULL;
  BEGIN
    INSERT INTO public.yield_reconciliation_configs
      (company_id,product_id,formula_stage_id,theoretical_basis,
       input_unit,output_unit,variance_threshold_pct)
    VALUES (c_a,current_setting('i12.p_b')::uuid,NULL,'dispensed_to_stage','kg','kg',5);
  EXCEPTION WHEN check_violation THEN ok := true; msg := SQLERRM;
            WHEN others THEN msg := SQLERRM;
  END;
  PERFORM _i12k('A','A10 nor the batch level against a stage basis', ok,
    left(coalesce(msg,'the batch config used a stage basis'),160));

  --  An invented basis.
  ok := false; msg := NULL;
  BEGIN
    INSERT INTO public.yield_reconciliation_configs
      (company_id,product_id,formula_stage_id,theoretical_basis,
       input_unit,output_unit,variance_threshold_pct)
    VALUES (c_a,current_setting('i12.p_b')::uuid,NULL,'whatever_is_handy','tablets','tablets',5);
  EXCEPTION WHEN check_violation THEN ok := true; msg := SQLERRM;
            WHEN others THEN msg := SQLERRM;
  END;
  PERFORM _i12k('A','A11 and a basis outside the vocabulary', ok,
    left(coalesce(msg,'an invented basis was stored'),160));

  --  A conversion factor of zero or less makes every theoretical yield
  --  zero or negative.
  ok := false; msg := NULL;
  BEGIN
    INSERT INTO public.yield_reconciliation_configs
      (company_id,product_id,formula_stage_id,theoretical_basis,
       input_unit,output_unit,output_per_input,variance_threshold_pct)
    VALUES (c_a,current_setting('i12.p_b')::uuid,NULL,'planned_batch_size','tablets','tablets',0,5);
  EXCEPTION WHEN check_violation THEN ok := true; msg := SQLERRM;
            WHEN others THEN msg := SQLERRM;
  END;
  PERFORM _i12k('A','A12 a conversion factor of zero is refused', ok,
    left(coalesce(msg,'a zero factor was stored'),160));

  --  Seven: three for product A (granulation, compression, batch), one
  --  for product B, three for product D. Product C has none, which is
  --  what makes it the unflagged case in section D.
  SELECT count(*) INTO n FROM public.yield_reconciliation_configs WHERE company_id = c_a;
  PERFORM _i12k('A','A13 and the seven real configs are the only ones left', n = 7, n||' config(s)');
END
$a$;


-- =====================================================================
--  B — the arithmetic
--
--  "Theoretical yield, actual yield, percentage and variance
--   calculated."
-- =====================================================================
DO $b$
DECLARE r jsonb; v record;
BEGIN
  --  50 kg dispensed to granulation, 49 kg of granule out: 98%, -2%.
  --  Exactly ON the 2% threshold, which the boundary assertions below
  --  turn on.
  r := public.yield_reconcile_stage(current_setting('i12.s_edge')::uuid, 49.0);
  PERFORM set_config('i12.r_edge', (r->>'reconciliation_id'), false);

  PERFORM _i12k('B','B1 the theoretical yield is derived, not supplied',
    (r->>'theoretical_quantity')::numeric = 50.0, coalesce(r->>'theoretical_quantity','NULL'));
  PERFORM _i12k('B','B2 the actual yield is what was recorded',
    (r->>'actual_quantity')::numeric = 49.0, coalesce(r->>'actual_quantity','NULL'));
  PERFORM _i12k('B','B3 the percentage is calculated',
    (r->>'yield_pct')::numeric = 98.0, coalesce(r->>'yield_pct','NULL'));
  PERFORM _i12k('B','B4 and the variance',
    (r->>'variance_pct')::numeric = -2.0, coalesce(r->>'variance_pct','NULL'));

  --  THE BOUNDARY IS INCLUSIVE. A variance exactly on the threshold is
  --  within it — the same convention as item 11's zone limits, so the
  --  two items do not teach an operator two meanings of "limit".
  PERFORM _i12k('B','B5 a variance exactly ON the threshold is within it',
    (r->>'within_threshold')::boolean, coalesce(r->>'within_threshold','NULL'));
  PERFORM _i12k('B','B6 so it does not block',
    (r->>'blocks_completion')::boolean = false, coalesce(r->>'blocks_completion','NULL'));

  --  The threshold the reconciliation was judged against is snapshotted,
  --  so revising the config later cannot restate a closed batch's
  --  verdict.
  PERFORM _i12k('B','B7 the threshold it was judged against is recorded',
    (r->>'threshold_pct')::numeric = 2.0, coalesce(r->>'threshold_pct','NULL'));

  --  ...and so is the basis, so the arithmetic stays re-checkable.
  PERFORM _i12k('B','B8 with the basis and the input quantity',
    (r->>'basis') = 'dispensed_to_stage' AND (r->>'basis_quantity')::numeric = 50.0,
    format('%s / %s', r->>'basis', r->>'basis_quantity'));

  --  VARIANCE IS SIGNED. 103% and 97% are both 3% out but they are
  --  different problems, and an absolute variance throws that away.
  r := public.yield_reconcile_stage(current_setting('i12.s_bad')::uuid, 46.0);
  PERFORM set_config('i12.r_bad', (r->>'reconciliation_id'), false);
  PERFORM _i12k('B','B9 a shortfall is a negative variance',
    (r->>'yield_pct')::numeric = 92.0 AND (r->>'variance_pct')::numeric = -8.0,
    format('%s%% / %s', r->>'yield_pct', r->>'variance_pct'));

  r := public.yield_reconcile_stage(current_setting('i12.s_good')::uuid, 51.5);
  PERFORM set_config('i12.r_good', (r->>'reconciliation_id'), false);
  PERFORM _i12k('B','B10 and an overage a positive one',
    (r->>'yield_pct')::numeric = 103.0 AND (r->>'variance_pct')::numeric = 3.0,
    format('%s%% / %s', r->>'yield_pct', r->>'variance_pct'));

  --  THE THRESHOLD IS APPLIED TO THE MAGNITUDE. 103% against a 2%
  --  threshold is outside it, in the generous direction — a yield of
  --  more than theory means material is unaccounted for just as surely
  --  as a shortfall does.
  PERFORM _i12k('B','B11 an overage beyond threshold is outside it too',
    (r->>'within_threshold')::boolean = false, coalesce(r->>'within_threshold','NULL'));

  --  A ZERO YIELD IS A MEASUREMENT. Fifty kilograms in and nothing out
  --  is a catastrophe, and recording it is how anybody finds out; it is
  --  the theoretical figure that cannot be zero, because that is the
  --  denominator.
  r := public.yield_reconcile_stage(current_setting('i12.s_zero')::uuid, 0);
  PERFORM _i12k('B','B12 a zero actual yield is recorded, not refused',
    (r->>'yield_pct')::numeric = 0 AND (r->>'within_threshold')::boolean = false,
    format('%s%% within=%s', r->>'yield_pct', r->>'within_threshold'));

  --  Product B's own threshold is 10%, so 92% is WITHIN it for product B
  --  while the same 92% was outside product A's 2%. The clearest proof
  --  that the threshold is the product's and not the system's.
  r := public.yield_reconcile_stage(current_setting('i12.s_b')::uuid, 18.4);
  PERFORM _i12k('B','B13 the same 92% is within product B''s 10% threshold',
    (r->>'yield_pct')::numeric = 92.0 AND (r->>'within_threshold')::boolean,
    format('%s%% within=%s thr=%s', r->>'yield_pct', r->>'within_threshold', r->>'threshold_pct'));
END
$b$;


-- =====================================================================
--  C — the four theoretical bases, and the units nothing converts
-- =====================================================================
DO $c$
DECLARE
  v record; r jsonb; ok boolean; msg text; v_stage2 uuid;
BEGIN
  --  dispensed_to_stage: the sum of what went into THIS stage.
  SELECT * INTO v FROM public.yield_theoretical_basis(
    current_setting('i12.b_good')::uuid, current_setting('i12.s_good')::uuid, 'dispensed_to_stage');
  PERFORM _i12k('C','C1 dispensed_to_stage sums what went into the stage',
    v.basis_quantity = 50.0 AND v.basis_unit = 'kg',
    format('%s %s (%s)', v.basis_quantity, v.basis_unit, v.detail));

  --  ...and it SAYS how it was arrived at, so a reviewer can check it
  --  rather than take the number on trust.
  PERFORM _i12k('C','C2 and says how many dispensings it came from',
    v.detail LIKE '%2 dispensing%', coalesce(v.detail,'NULL'));

  --  planned_batch_size: the batch's own planned size, in its own unit.
  SELECT * INTO v FROM public.yield_theoretical_basis(
    current_setting('i12.b_good')::uuid, NULL, 'planned_batch_size');
  PERFORM _i12k('C','C3 planned_batch_size is the batch''s planned size',
    v.basis_quantity = 100000 AND v.basis_unit = 'tablets',
    format('%s %s', v.basis_quantity, v.basis_unit));

  --  previous_stage_output: the nearest EARLIER reconciled stage's
  --  actual yield. Not sequence_no - 1: a batch may reconcile at stages
  --  1 and 3, and stage 3's input is stage 1's output.
  --
  --  The chain batch's granulation yielded 49.5 kg of 50 — 99%, inside
  --  its 2% threshold, so the stage can be completed and stage 2 can
  --  start. A chained basis cannot be tested without walking the chain.
  r := public.yield_reconcile_stage(current_setting('i12.s_chain')::uuid, 49.5);
  PERFORM set_config('i12.r_chain', (r->>'reconciliation_id'), false);

  DECLARE sg jsonb;
  BEGIN
    sg := public.sign_electronic_record(current_setting('i12.c_a')::uuid,'batch_stage',
            current_setting('i12.s_chain')::uuid,'complete','authored','CorrectHorse1!');
    PERFORM public.batch_stage_complete(current_setting('i12.s_chain')::uuid,
                                        (sg->>'signature_id')::uuid);
  END;

  SELECT id INTO v_stage2 FROM public.batch_stages
   WHERE batch_id = current_setting('i12.b_chain')::uuid AND sequence_no = 2;
  PERFORM set_config('i12.s_chain2', v_stage2::text, false);
  PERFORM public.batch_stage_start(v_stage2);

  SELECT * INTO v FROM public.yield_theoretical_basis(
    current_setting('i12.b_chain')::uuid, v_stage2, 'previous_stage_output');
  PERFORM _i12k('C','C4 previous_stage_output is the earlier stage''s actual yield',
    v.basis_quantity = 49.5 AND v.basis_unit = 'kg',
    format('%s %s (%s)', v.basis_quantity, v.basis_unit, v.detail));

  PERFORM _i12k('C','C5 and names which stage it came from',
    v.detail LIKE '%stage 1%', coalesce(v.detail,'NULL'));

  --  A stage whose basis is the previous stage's output, with no earlier
  --  reconciliation, says so rather than reconciling against nothing.
  --  The nodisp batch, whose stage 1 has no reconciliation. Using the
  --  good batch here was wrong: B10 reconciled ITS stage 1, so there was
  --  an earlier reconciliation and the probe passed on the wrong premise.
  ok := false; msg := NULL;
  BEGIN
    SELECT * INTO v FROM public.yield_theoretical_basis(
      current_setting('i12.b_nodisp')::uuid,
      (SELECT id FROM public.batch_stages
        WHERE batch_id=current_setting('i12.b_nodisp')::uuid AND sequence_no=2),
      'previous_stage_output');
  EXCEPTION WHEN others THEN
    ok := SQLERRM LIKE 'YIELD_NO_PREVIOUS_RECONCILIATION%'; msg := SQLERRM;
  END;
  PERFORM _i12k('C','C6 with no earlier reconciliation it refuses rather than guessing',
    ok, left(coalesce(msg,'it returned something'),180));

  --  A stage nothing was dispensed to.
  ok := false; msg := NULL;
  BEGIN
    SELECT * INTO v FROM public.yield_theoretical_basis(
      current_setting('i12.b_nodisp')::uuid, current_setting('i12.s_nodisp')::uuid,
      'dispensed_to_stage');
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'YIELD_NO_DISPENSING%'; msg := SQLERRM; END;
  PERFORM _i12k('C','C7 and nothing dispensed is reported, not treated as zero',
    ok, left(coalesce(msg,'it returned something'),180));

  --  THE CONVERSION IS EXPLICIT AND SNAPSHOTTED. Compression's config
  --  says 2000 tablets per kg, so 49.5 kg of granule is 99,000 tablets
  --  of theory. Nothing derived that 2000 from the product's tablet mass
  --  or anywhere else; the product stated it.
  r := public.yield_reconcile_stage(current_setting('i12.s_chain2')::uuid, 97000);
  PERFORM _i12k('C','C8 the stated conversion turns 49.5 kg into 99,000 tablets',
    (r->>'theoretical_quantity')::numeric = 99000,
    coalesce(r->>'theoretical_quantity','NULL'));
  PERFORM _i12k('C','C9 and the factor is recorded on the reconciliation',
    (SELECT output_per_input = 2000 FROM public.batch_yield_reconciliations
      WHERE id = (r->>'reconciliation_id')::uuid));
  PERFORM _i12k('C','C10 97,000 of 99,000 is within compression''s 5% threshold',
    (r->>'within_threshold')::boolean
    AND (r->>'threshold_pct')::numeric = 5.0,
    format('%s%% thr=%s', r->>'yield_pct', r->>'threshold_pct'));
END
$c$;

--  MIXED UNITS ARE NOT SUMMABLE, and the refusal is by name. Adding 40
--  kg to 10,000 g gives 10,040 of nothing, and the yield computed from
--  it would look entirely plausible. This is the one case where a wrong
--  answer is invisible to a reviewer, which is why it is refused rather
--  than converted.
RESET ROLE;
DO $c2$
DECLARE
  v record; ok boolean; msg text; v_batch uuid; v_stage uuid;
BEGIN
  v_batch := current_setting('i12.b_nodisp')::uuid;
  v_stage := current_setting('i12.s_nodisp')::uuid;

  --  Written directly, because material_dispense takes the unit from the
  --  lot and could not produce a mixed set. A real one would come from
  --  two lots of the same material held in different units.
  ALTER TABLE public.dispensing_records DISABLE TRIGGER USER;
  INSERT INTO public.dispensing_records
    (company_id,batch_id,batch_stage_id,material_id,material_lot_id,internal_lot_number,
     required_quantity,actual_quantity,unit,balance_identifier,dispensed_by)
  VALUES
    (current_setting('i12.c_a')::uuid, v_batch, v_stage,
     current_setting('i12.m_api')::uuid, current_setting('i12.lot_api')::uuid,'MIX-1',
     40,40,'kg','BAL-12',current_setting('i12.u_op')::uuid),
    (current_setting('i12.c_a')::uuid, v_batch, v_stage,
     current_setting('i12.m_exc')::uuid, current_setting('i12.lot_exc')::uuid,'MIX-2',
     10000,10000,'g','BAL-12',current_setting('i12.u_op')::uuid);
  ALTER TABLE public.dispensing_records ENABLE TRIGGER USER;

  ok := false; msg := NULL;
  BEGIN
    SELECT * INTO v FROM public.yield_theoretical_basis(v_batch, v_stage, 'dispensed_to_stage');
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'YIELD_MIXED_DISPENSING_UNITS%'; msg := SQLERRM; END;
  PERFORM _i12k('C','C11 a mixed-unit dispensing set is refused, not summed',
    ok, left(coalesce(msg,'it summed them'),200));

  PERFORM _i12k('C','C12 and the refusal names both units',
    coalesce(msg,'') LIKE '%g, kg%', left(coalesce(msg,''),200));

  --  THE UNIT CHECK COMES BEFORE THE ARITHMETIC. Item 09 had this the
  --  wrong way round once, and a quantity in the wrong unit demanded a
  --  supervisor's signature for what was a data-entry error. Here the
  --  same mistake would report a 99,900% variance and call for an
  --  investigation into a units slip.
  ok := false; msg := NULL;
  BEGIN
    PERFORM public.yield_reconcile_stage(v_stage, 49.0);
  EXCEPTION WHEN others THEN
    ok := SQLERRM LIKE 'YIELD_MIXED_DISPENSING_UNITS%'
       OR SQLERRM LIKE 'YIELD_INPUT_UNIT_MISMATCH%';
    msg := SQLERRM;
  END;
  PERFORM _i12k('C','C13 so reconciling refuses before computing a variance',
    ok, left(coalesce(msg,'it computed one'),200));
  PERFORM _i12k('C','C14 and no reconciliation was recorded',
    NOT EXISTS (SELECT 1 FROM public.batch_yield_reconciliations WHERE batch_stage_id = v_stage));

  --  An output unit that disagrees with the configuration.
  ok := false; msg := NULL;
  BEGIN
    PERFORM public.yield_reconcile_stage(current_setting('i12.s_auth')::uuid, 49.0, 'tonnes');
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'YIELD_OUTPUT_UNIT_MISMATCH%'; msg := SQLERRM; END;
  PERFORM _i12k('C','C15 an actual yield in the wrong unit is refused',
    ok, left(coalesce(msg,'it was accepted'),200));

  --  Cleared again so nothing later trips over a deliberately
  --  inconsistent dispensing set. Item 09 refuses a delete — correctly,
  --  because material that left the store cannot be un-issued — so the
  --  trigger comes off for the one statement. Were these rows left
  --  behind, section D would still pass (the block there is "nothing
  --  reconciled", decided before any basis is computed) but a later
  --  reader would have to work that out.
  ALTER TABLE public.dispensing_records DISABLE TRIGGER USER;
  DELETE FROM public.dispensing_records WHERE internal_lot_number IN ('MIX-1','MIX-2');
  ALTER TABLE public.dispensing_records ENABLE TRIGGER USER;
END
$c2$;
SET ROLE authenticated;


-- =====================================================================
--  D — THE BLOCK
--
--  NOT DONE IF: "The calculation is right but the threshold blocks
--  nothing."
--
--  Every assertion here calls batch_stage_complete and then checks the
--  STAGE'S STATE. Checking a return value or a block-reason string would
--  pass just as happily against an item that computed everything and
--  refused nothing, which is exactly the failure this clause describes.
-- =====================================================================
DO $d$
DECLARE
  c_a uuid := current_setting('i12.c_a')::uuid;
  s_bad uuid := current_setting('i12.s_bad')::uuid;
  s_edge uuid := current_setting('i12.s_edge')::uuid;
  s_nodisp uuid := current_setting('i12.s_nodisp')::uuid;
  sig jsonb; ok boolean; msg text; st text;
BEGIN
  -- ── D1-D3: a stage flagged for reconciliation, with none recorded.
  PERFORM _i12k('D','D1 an unreconciled flagged stage reports a block',
    public.yield_block_reason(s_nodisp) LIKE '%no reconciliation has been recorded%',
    left(coalesce(public.yield_block_reason(s_nodisp),'NULL'),180));

  sig := public.sign_electronic_record(c_a,'batch_stage',s_nodisp,'complete','authored','CorrectHorse1!');
  ok := false; msg := NULL;
  BEGIN
    PERFORM public.batch_stage_complete(s_nodisp,(sig->>'signature_id')::uuid);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'YIELD_VARIANCE_BLOCKED%'; msg := SQLERRM; END;
  PERFORM _i12k('D','D2 and completing it is refused', ok, left(coalesce(msg,'it completed'),200));

  SELECT status INTO st FROM public.batch_stages WHERE id = s_nodisp;
  PERFORM _i12k('D','D3 THE STAGE IS STILL NOT COMPLETE', st <> 'complete', 'status '||st);

  -- ── D4-D7: a reconciliation outside its threshold.
  PERFORM _i12k('D','D4 a variance beyond threshold reports a block',
    public.yield_block_reason(s_bad) LIKE '%needs an investigation and a supervisor%',
    left(coalesce(public.yield_block_reason(s_bad),'NULL'),200));

  --  The block SAYS the numbers, so an operator is told why rather than
  --  only that.
  PERFORM _i12k('D','D5 the block states the yield, the variance and the threshold',
    public.yield_block_reason(s_bad) LIKE '%92%'
    AND public.yield_block_reason(s_bad) LIKE '%-8%'
    AND public.yield_block_reason(s_bad) LIKE '%2%',
    left(coalesce(public.yield_block_reason(s_bad),'NULL'),200));

  sig := public.sign_electronic_record(c_a,'batch_stage',s_bad,'complete','authored','CorrectHorse1!');
  ok := false; msg := NULL;
  BEGIN
    PERFORM public.batch_stage_complete(s_bad,(sig->>'signature_id')::uuid);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'YIELD_VARIANCE_BLOCKED%'; msg := SQLERRM; END;
  PERFORM _i12k('D','D6 and completing the stage is refused', ok,
    left(coalesce(msg,'it completed'),200));

  SELECT status INTO st FROM public.batch_stages WHERE id = s_bad;
  PERFORM _i12k('D','D7 THE STAGE IS STILL NOT COMPLETE', st <> 'complete', 'status '||st);

  -- ── D8-D10: a reconciliation INSIDE its threshold does not block.
  --  Without this the whole section would pass against something that
  --  blocked unconditionally, which is a different bug and just as bad:
  --  a control that always says no gets switched off.
  PERFORM _i12k('D','D8 a variance within threshold reports no block',
    public.yield_block_reason(s_edge) IS NULL,
    coalesce(public.yield_block_reason(s_edge),'NULL'));

  sig := public.sign_electronic_record(c_a,'batch_stage',s_edge,'complete','authored','CorrectHorse1!');
  ok := false; msg := NULL;
  BEGIN
    PERFORM public.batch_stage_complete(s_edge,(sig->>'signature_id')::uuid);
    ok := true;
  EXCEPTION WHEN others THEN msg := SQLERRM; END;
  PERFORM _i12k('D','D9 and the stage completes', ok, left(coalesce(msg,''),200));

  SELECT status INTO st FROM public.batch_stages WHERE id = s_edge;
  PERFORM _i12k('D','D10 THE STAGE IS COMPLETE', st = 'complete', 'status '||st);

  -- ── D11-D13: a stage NOT flagged for reconciliation is not blocked.
  --
  --  Without this, every assertion above would pass against a gate that
  --  blocked unconditionally — which is a different bug, and just as
  --  bad: a control that always says no is a control somebody switches
  --  off. Product C is reconciled nowhere, so its stage is the honest
  --  test of the unflagged path.
  PERFORM _i12k('D','D11 an unflagged stage reports no block',
    public.yield_block_reason(current_setting('i12.s_c')::uuid) IS NULL,
    coalesce(public.yield_block_reason(current_setting('i12.s_c')::uuid),'NULL'));

  sig := public.sign_electronic_record(c_a,'batch_stage',current_setting('i12.s_c')::uuid,
           'complete','authored','CorrectHorse1!');
  ok := false; msg := NULL;
  BEGIN
    PERFORM public.batch_stage_complete(current_setting('i12.s_c')::uuid,
                                        (sig->>'signature_id')::uuid);
    ok := true;
  EXCEPTION WHEN others THEN msg := SQLERRM; END;
  PERFORM _i12k('D','D12 and completes with no reconciliation at all', ok,
    left(coalesce(msg,''),200));

  SELECT status INTO st FROM public.batch_stages WHERE id = current_setting('i12.s_c')::uuid;
  PERFORM _i12k('D','D13 THE UNFLAGGED STAGE IS COMPLETE', st = 'complete', 'status '||st);
END
$d$;


-- =====================================================================
--  E — investigation, then authorisation, then proceeding
--
--  NOT DONE IF: "Proceeding without a recorded authorisation."
--
--  Every incomplete authorisation below is refused AND the stage is
--  re-checked afterwards, because "it threw an error" and "the stage
--  stayed blocked" are different claims and only the second one is the
--  control.
-- =====================================================================
DO $e$
DECLARE
  c_a uuid := current_setting('i12.c_a')::uuid;
  s_auth uuid := current_setting('i12.s_auth')::uuid;
  r jsonb; v_rec uuid; ok boolean; msg text;
BEGIN
  r := public.yield_reconcile_stage(s_auth, 45.0);
  v_rec := (r->>'reconciliation_id')::uuid;
  PERFORM set_config('i12.r_auth', v_rec::text, false);

  PERFORM _i12k('E','E1 the variance is recorded, not refused',
    (r->>'yield_pct')::numeric = 90.0 AND (r->>'within_threshold')::boolean = false,
    format('%s%% within=%s', r->>'yield_pct', r->>'within_threshold'));

  --  AUTHORISATION BEFORE INVESTIGATION IS REFUSED. The brief pairs them
  --  in that order, and an authorisation with no investigation behind it
  --  is a signature on an empty page.
  ok := false; msg := NULL;
  BEGIN
    PERFORM public.yield_authorise_variance(v_rec, 'Looks fine to me', gen_random_uuid());
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'YIELD_INVESTIGATION_REQUIRED%'; msg := SQLERRM; END;
  PERFORM _i12k('E','E2 authorising before the investigation is refused', ok,
    left(coalesce(msg,'it was authorised'),200));

  --  The investigation flag needs a note saying what was investigated.
  ok := false; msg := NULL;
  BEGIN PERFORM public.yield_flag_investigation(v_rec, '   ');
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'YIELD_INVESTIGATION_NO_NOTE%'; msg := SQLERRM; END;
  PERFORM _i12k('E','E3 an investigation flag with no note is refused', ok,
    left(coalesce(msg,'an empty note was accepted'),200));

  PERFORM public.yield_flag_investigation(v_rec,
    'Granulator bowl residue weighed separately; 4.6 kg recovered from the bowl and ducting.');
  PERFORM _i12k('E','E4 the investigation is flagged, with its note',
    (SELECT investigation_required AND investigation_note LIKE '%bowl residue%'
       FROM public.batch_yield_reconciliations WHERE id = v_rec));

  --  STILL BLOCKED. An investigation is not an authorisation.
  PERFORM _i12k('E','E5 but the stage is still blocked after the investigation',
    public.yield_block_reason(s_auth) IS NOT NULL,
    coalesce(public.yield_block_reason(s_auth),'NULL'));

  --  A reason is required.
  ok := false; msg := NULL;
  BEGIN PERFORM public.yield_authorise_variance(v_rec, '  ', gen_random_uuid());
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'YIELD_AUTHORISATION_NO_REASON%'; msg := SQLERRM; END;
  PERFORM _i12k('E','E6 an authorisation with no reason is refused', ok,
    left(coalesce(msg,'it was authorised'),200));

  --  THE SECOND PERSON. The operator who measured the yield cannot
  --  authorise proceeding past it.
  ok := false; msg := NULL;
  BEGIN
    PERFORM public.yield_authorise_variance(v_rec, 'I am content with my own numbers',
                                            gen_random_uuid());
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'YIELD_SELF_AUTHORISED%'; msg := SQLERRM; END;
  PERFORM _i12k('E','E7 the person who recorded it cannot authorise it', ok,
    left(coalesce(msg,'they authorised their own'),200));

  PERFORM _i12k('E','E8 and the stage is still blocked', public.yield_block_reason(s_auth) IS NOT NULL);
END
$e$;

--  The supervisor's half.
RESET ROLE;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('i12.u_sup'), 'role','authenticated')::text, false);
SET ROLE authenticated;
DO $e2$
DECLARE
  c_a uuid := current_setting('i12.c_a')::uuid;
  s_auth uuid := current_setting('i12.s_auth')::uuid;
  v_rec uuid := current_setting('i12.r_auth')::uuid;
  sig jsonb; ok boolean; msg text; st text;
BEGIN
  --  A SIGNATURE IS OPTIONAL HERE, and the reason is worth stating in
  --  the suite as well as the migration: sign_electronic_record only
  --  signs LIFECYCLE-GOVERNED records, and a yield reconciliation has no
  --  lifecycle, so a signature taken ON this reconciliation cannot be
  --  issued at all. The first draft of item 12 demanded one, which would
  --  have made this gate permanently unclearable — a control nobody can
  --  satisfy by the proper route is worse than none, because the route
  --  people take instead is around it.
  --
  --  So E9 asserts that a signature cannot be FABRICATED, E10 that it
  --  cannot be BORROWED, and E11 that the authorisation stands without
  --  one. What the brief requires is a RECORDED authorisation: a named
  --  supervisor, a time and a reason.
  ok := false; msg := NULL;
  BEGIN PERFORM public.yield_authorise_variance(v_rec, 'Residue accounted for', gen_random_uuid());
  EXCEPTION WHEN others THEN
    ok := SQLERRM LIKE 'YIELD_AUTHORISATION_SIGNATURE_INVALID%'; msg := SQLERRM; END;
  PERFORM _i12k('E','E9 a signature that does not exist is refused', ok,
    left(coalesce(msg,'it was authorised'),200));

  --  SOMEBODY ELSE'S SIGNATURE. The operator signed the stage; the
  --  supervisor cannot hand that in as their own authorisation.
  ok := false; msg := NULL;
  BEGIN PERFORM public.yield_authorise_variance(v_rec, 'Residue accounted for',
          (SELECT id FROM public.electronic_signatures
            WHERE company_id = c_a AND signer_id = current_setting('i12.u_op')::uuid
            ORDER BY signed_at DESC LIMIT 1));
  EXCEPTION WHEN others THEN
    ok := SQLERRM LIKE 'YIELD_AUTHORISATION_SIGNATURE_MISMATCH%'; msg := SQLERRM; END;
  PERFORM _i12k('E','E10 nor another person''s signature', ok,
    left(coalesce(msg,'it was authorised'),200));

  PERFORM _i12k('E','E11 and after every refusal the stage is still blocked',
    public.yield_block_reason(s_auth) IS NOT NULL,
    coalesce(public.yield_block_reason(s_auth),'NULL'));

  --  THE WHOLE AUTHORISATION: a named supervisor, a reason, and a time.
  ok := false; msg := NULL;
  BEGIN
    PERFORM public.yield_authorise_variance(v_rec,
      '4.6 kg recovered from the granulator bowl and ducting; material accounted for in full.');
    ok := true;
  EXCEPTION WHEN others THEN msg := SQLERRM; END;
  PERFORM _i12k('E','E12 a complete authorisation is accepted', ok, left(coalesce(msg,''),200));

  PERFORM _i12k('E','E13 and it records who, when and why',
    (SELECT authorised_by = current_setting('i12.u_sup')::uuid
        AND authorised_at IS NOT NULL
        AND authorisation_reason LIKE '%granulator bowl%'
       FROM public.batch_yield_reconciliations WHERE id = v_rec));

  --  And the record says, in the table, that this was authorised by
  --  somebody other than the person who measured it.
  PERFORM _i12k('E','E14 by somebody other than the person who recorded it',
    (SELECT authorised_by <> recorded_by
       FROM public.batch_yield_reconciliations WHERE id = v_rec));

  PERFORM _i12k('E','E15 the stage is no longer blocked',
    public.yield_block_reason(s_auth) IS NULL,
    coalesce(public.yield_block_reason(s_auth),'NULL'));

  --  AND NO DEVIATION WAS CREATED. Item 12 marks the link point and
  --  leaves Week 6 to build it.
  PERFORM _i12k('E','E16 and no deviation was created',
    (SELECT deviation_id IS NULL FROM public.batch_yield_reconciliations WHERE id = v_rec));

  --  Authorising twice.
  ok := false; msg := NULL;
  BEGIN PERFORM public.yield_authorise_variance(v_rec,'Again');
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'YIELD_ALREADY_AUTHORISED%'; msg := SQLERRM; END;
  PERFORM _i12k('E','E17 a variance cannot be authorised twice', ok,
    left(coalesce(msg,'it was authorised again'),200));

  --  Authorising a yield that was inside its threshold is authorising
  --  nothing, and would leave a record implying there had been a problem.
  ok := false; msg := NULL;
  BEGIN
    PERFORM public.yield_flag_investigation(current_setting('i12.r_edge')::uuid,'Curiosity');
    PERFORM public.yield_authorise_variance(current_setting('i12.r_edge')::uuid,
              'Nothing wrong with it');
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'YIELD_NOTHING_TO_AUTHORISE%'; msg := SQLERRM; END;
  PERFORM _i12k('E','E18 a within-threshold yield has nothing to authorise', ok,
    left(coalesce(msg,'it was authorised'),200));

  --  THE STAGE NOW COMPLETES. This is the other half of the control: a
  --  block that cannot be cleared by the proper route is not a gate, it
  --  is a wall, and people route around walls.
  sig := public.sign_electronic_record(c_a,'batch_stage',s_auth,'complete','authored','CorrectHorse1!');
  ok := false; msg := NULL;
  BEGIN
    PERFORM public.batch_stage_complete(s_auth,(sig->>'signature_id')::uuid);
    ok := true;
  EXCEPTION WHEN others THEN msg := SQLERRM; END;
  PERFORM _i12k('E','E19 and the stage completes on the authorisation', ok,
    left(coalesce(msg,''),200));

  SELECT status INTO st FROM public.batch_stages WHERE id = s_auth;
  PERFORM _i12k('E','E20 THE STAGE IS COMPLETE', st = 'complete', 'status '||st);
END
$e2$;
RESET ROLE;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('i12.u_op'), 'role','authenticated')::text, false);
SET ROLE authenticated;


-- =====================================================================
--  F — the block at batch completion
--
--  "Reconciliation at stages flagged for it AND AT BATCH COMPLETION."
-- =====================================================================
DO $f$
DECLARE
  c_a uuid := current_setting('i12.c_a')::uuid;
  b_c uuid := current_setting('i12.b_c')::uuid;
  b_edge uuid := current_setting('i12.b_edge')::uuid;
  r jsonb; ok boolean; msg text; v_closed timestamptz;
BEGIN
  --  Product C has no batch-level config either, so closing it is not
  --  blocked on yield grounds. Its one stage is already complete.
  PERFORM _i12k('F','F1 a product with no batch-level config is not blocked',
    public.yield_batch_block_reason(b_c) IS NULL,
    coalesce(public.yield_batch_block_reason(b_c),'NULL'));

  ok := false; msg := NULL;
  BEGIN PERFORM public.batch_record_close(b_c, 'Execution complete'); ok := true;
  EXCEPTION WHEN others THEN msg := SQLERRM; END;
  PERFORM _i12k('F','F2 and it closes', ok, left(coalesce(msg,''),200));

  --  THE EDGE BATCH HAS TWO STAGES, and item 07 refuses to close a
  --  record while any stage is open — before item 12's check is reached.
  --  So compression is walked through as well, which is the honest thing
  --  to do anyway: a batch-completion reconciliation only arises on a
  --  batch whose stages are all done. Without this, F4 to F12 were all
  --  passing or failing on item 07's gate and said nothing about item
  --  12's.
  DECLARE v_s2 uuid; sg jsonb; rr jsonb;
  BEGIN
    SELECT id INTO v_s2 FROM public.batch_stages
     WHERE batch_id = b_edge AND sequence_no = 2;
    PERFORM public.batch_stage_start(v_s2);
    --  49 kg of granule at 2000 tablets per kg is 98,000 of theory;
    --  97,000 made is a 1.02% variance, inside compression's 5%.
    rr := public.yield_reconcile_stage(v_s2, 97000);
    sg := public.sign_electronic_record(c_a,'batch_stage',v_s2,'complete','authored','CorrectHorse1!');
    PERFORM public.batch_stage_complete(v_s2,(sg->>'signature_id')::uuid);
  END;

  PERFORM _i12k('F','F3 product A''s batch is blocked with no reconciliation',
    public.yield_batch_block_reason(b_edge) LIKE '%no reconciliation has been recorded%',
    left(coalesce(public.yield_batch_block_reason(b_edge),'NULL'),200));

  ok := false; msg := NULL;
  BEGIN PERFORM public.batch_record_close(b_edge, 'Execution complete');
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'YIELD_VARIANCE_BLOCKED%'; msg := SQLERRM; END;
  PERFORM _i12k('F','F4 and closing is refused', ok, left(coalesce(msg,'it closed'),200));

  SELECT execution_closed_at INTO v_closed FROM public.batch_records WHERE id = b_edge;
  PERFORM _i12k('F','F5 THE BATCH IS STILL OPEN', v_closed IS NULL,
    coalesce(v_closed::text,'open'));

  --  100,000 tablets planned, 90,000 made: 90%, a 10% variance against a
  --  3% threshold.
  r := public.yield_reconcile_batch(b_edge, 90000);
  PERFORM set_config('i12.r_batch', (r->>'reconciliation_id'), false);
  PERFORM _i12k('F','F6 the batch reconciliation is against the planned size',
    (r->>'theoretical_quantity')::numeric = 100000
    AND (r->>'basis') = 'planned_batch_size',
    format('%s %s', r->>'theoretical_quantity', r->>'basis'));
  PERFORM _i12k('F','F7 and reports the variance and that it blocks',
    (r->>'variance_pct')::numeric = -10.0 AND (r->>'blocks_closure')::boolean,
    format('%s / %s', r->>'variance_pct', r->>'blocks_closure'));

  ok := false; msg := NULL;
  BEGIN PERFORM public.batch_record_close(b_edge, 'Execution complete');
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'YIELD_VARIANCE_BLOCKED%'; msg := SQLERRM; END;
  PERFORM _i12k('F','F8 an unauthorised batch variance still refuses closure', ok,
    left(coalesce(msg,'it closed'),200));

  SELECT execution_closed_at INTO v_closed FROM public.batch_records WHERE id = b_edge;
  PERFORM _i12k('F','F9 THE BATCH IS STILL OPEN', v_closed IS NULL,
    coalesce(v_closed::text,'open'));

  PERFORM public.yield_flag_investigation(current_setting('i12.r_batch')::uuid,
    'Reject bin reconciled: 9,800 tablets rejected at metal detection, 200 destroyed in sampling.');
END
$f$;

RESET ROLE;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('i12.u_sup'), 'role','authenticated')::text, false);
SET ROLE authenticated;
DO $f2$
DECLARE
  c_a uuid := current_setting('i12.c_a')::uuid;
  b_edge uuid := current_setting('i12.b_edge')::uuid;
  v_rec uuid := current_setting('i12.r_batch')::uuid;
  sig jsonb; ok boolean; msg text; v_closed timestamptz;
BEGIN
  PERFORM public.yield_authorise_variance(v_rec,
    'Rejects and sampling account for the shortfall in full; no material unaccounted for.');

  PERFORM _i12k('F','F10 an authorised batch variance no longer blocks',
    public.yield_batch_block_reason(b_edge) IS NULL,
    coalesce(public.yield_batch_block_reason(b_edge),'NULL'));

  ok := false; msg := NULL;
  BEGIN PERFORM public.batch_record_close(b_edge, 'Execution complete'); ok := true;
  EXCEPTION WHEN others THEN msg := SQLERRM; END;
  PERFORM _i12k('F','F11 and the batch closes', ok, left(coalesce(msg,''),200));

  SELECT execution_closed_at INTO v_closed FROM public.batch_records WHERE id = b_edge;
  PERFORM _i12k('F','F12 THE BATCH IS CLOSED', v_closed IS NOT NULL, coalesce(v_closed::text,'open'));

  --  Closure is permanent, and it locks the reconciliations with
  --  everything else.
  ok := false; msg := NULL;
  BEGIN PERFORM public.yield_reconcile_batch(b_edge, 95000);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'BATCH_CLOSED%'; msg := SQLERRM; END;
  PERFORM _i12k('F','F13 a closed batch cannot be reconciled again', ok,
    left(coalesce(msg,'it was reconciled'),200));
END
$f2$;
RESET ROLE;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('i12.u_op'), 'role','authenticated')::text, false);
SET ROLE authenticated;


-- =====================================================================
--  G — the recorded figures are not editable
--
--  A yield that can be adjusted after the fact is not a reconciliation,
--  and editing the threshold a reconciliation was judged against would
--  let somebody clear the block by moving the goalposts — which is the
--  quietest way to fail all three NOT DONE IF clauses at once.
-- =====================================================================
RESET ROLE;
DO $g$
DECLARE
  v_rec uuid := current_setting('i12.r_bad')::uuid;
  v_auth uuid := current_setting('i12.r_auth')::uuid;
  ok boolean; msg text; n integer;
BEGIN
  --  The owner can update the row at all. Without this first, every
  --  "the write was refused" probe below could be passing because RLS
  --  matched no rows and no trigger ever fired.
  UPDATE public.batch_yield_reconciliations SET notes = 'touched' WHERE id = v_rec;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM _i12k('G','G1 the row is writable at all, so the refusals below mean something',
    n = 1, n||' row(s)');

  ok := false; msg := NULL;
  BEGIN UPDATE public.batch_yield_reconciliations SET actual_quantity = 49.9 WHERE id = v_rec;
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'YIELD_RECONCILIATION_IMMUTABLE%'; msg := SQLERRM; END;
  PERFORM _i12k('G','G2 the actual yield cannot be edited', ok,
    left(coalesce(msg,'it was edited'),180));

  ok := false; msg := NULL;
  BEGIN UPDATE public.batch_yield_reconciliations SET theoretical_quantity = 46.5 WHERE id = v_rec;
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'YIELD_RECONCILIATION_IMMUTABLE%'; msg := SQLERRM; END;
  PERFORM _i12k('G','G3 nor the theoretical yield', ok, left(coalesce(msg,'it was edited'),180));

  --  THE GOALPOSTS. Raising the threshold on a recorded reconciliation
  --  would clear the block without anybody authorising anything.
  ok := false; msg := NULL;
  BEGIN UPDATE public.batch_yield_reconciliations SET threshold_pct = 20 WHERE id = v_rec;
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'YIELD_RECONCILIATION_IMMUTABLE%'; msg := SQLERRM; END;
  PERFORM _i12k('G','G4 and NOT the threshold it was judged against', ok,
    left(coalesce(msg,'the threshold was moved'),180));

  ok := false; msg := NULL;
  BEGIN UPDATE public.batch_yield_reconciliations SET basis_quantity = 46.5 WHERE id = v_rec;
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'YIELD_RECONCILIATION_IMMUTABLE%'; msg := SQLERRM; END;
  PERFORM _i12k('G','G5 nor the input it was computed from', ok,
    left(coalesce(msg,'it was edited'),180));

  ok := false; msg := NULL;
  BEGIN UPDATE public.batch_yield_reconciliations SET output_per_input = 4000 WHERE id = v_rec;
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'YIELD_RECONCILIATION_IMMUTABLE%'; msg := SQLERRM; END;
  PERFORM _i12k('G','G6 nor the conversion factor', ok, left(coalesce(msg,'it was edited'),180));

  --  The derived figures are recomputed by trigger on every write, so a
  --  hand-written percentage is overwritten rather than trusted.
  UPDATE public.batch_yield_reconciliations SET yield_pct = 100, variance_pct = 0,
         within_threshold = true WHERE id = v_rec;
  PERFORM _i12k('G','G7 a hand-written percentage is recomputed, not trusted',
    (SELECT yield_pct = 92.0 AND variance_pct = -8.0 AND within_threshold = false
       FROM public.batch_yield_reconciliations WHERE id = v_rec),
    (SELECT format('%s%% / %s / %s', yield_pct, variance_pct, within_threshold)
       FROM public.batch_yield_reconciliations WHERE id = v_rec));

  --  AN AUTHORISATION, ONCE GIVEN, IS GIVEN. Withdrawing it after a
  --  stage was completed on the strength of it would leave a completed
  --  stage with nothing behind it.
  ok := false; msg := NULL;
  BEGIN UPDATE public.batch_yield_reconciliations SET authorised_by = NULL, authorised_at = NULL
         WHERE id = v_auth;
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'YIELD_AUTHORISATION_FINAL%'; msg := SQLERRM; END;
  PERFORM _i12k('G','G8 an authorisation cannot be withdrawn', ok,
    left(coalesce(msg,'it was withdrawn'),180));

  ok := false; msg := NULL;
  BEGIN UPDATE public.batch_yield_reconciliations SET authorisation_reason = 'Actually, no'
         WHERE id = v_auth;
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'YIELD_AUTHORISATION_FINAL%'; msg := SQLERRM; END;
  PERFORM _i12k('G','G9 nor its reason rewritten', ok, left(coalesce(msg,'it was rewritten'),180));

  --  Un-requiring an investigation would make an existing authorisation
  --  unexplainable.
  ok := false; msg := NULL;
  BEGIN UPDATE public.batch_yield_reconciliations SET investigation_required = false
         WHERE id = v_auth;
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'YIELD_INVESTIGATION_FINAL%'; msg := SQLERRM; END;
  PERFORM _i12k('G','G10 an investigation cannot be un-required', ok,
    left(coalesce(msg,'it was cleared'),180));

  --  DELETING IT IS THE SIMPLEST WAY ROUND THE BLOCK.
  ok := false; msg := NULL;
  BEGIN DELETE FROM public.batch_yield_reconciliations WHERE id = v_rec;
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'YIELD_RECONCILIATION_APPEND_ONLY%'; msg := SQLERRM; END;
  PERFORM _i12k('G','G11 and a reconciliation cannot be deleted', ok,
    left(coalesce(msg,'it was deleted'),180));

  PERFORM _i12k('G','G12 so the blocked stage is still blocked after all that',
    public.yield_block_reason(current_setting('i12.s_bad')::uuid) IS NOT NULL,
    coalesce(public.yield_block_reason(current_setting('i12.s_bad')::uuid),'NULL'));
END
$g$;


-- =====================================================================
--  K — the chained basis, and the input unit on its own
--
--  Both of these exist because mutation testing found the suite could
--  not tell the difference. Product D has three stages for the first and
--  a deliberately wrong unit on its third for the second.
-- =====================================================================
RESET ROLE;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('i12.u_op'), 'role','authenticated')::text, false);
SET ROLE authenticated;
DO $k$
DECLARE
  c_a uuid := current_setting('i12.c_a')::uuid;
  b_d uuid := current_setting('i12.b_d')::uuid;
  s1 uuid := current_setting('i12.s_d')::uuid;
  s2 uuid; s3 uuid; r jsonb; sg jsonb; v record; ok boolean; msg text;
BEGIN
  SELECT id INTO s2 FROM public.batch_stages WHERE batch_id=b_d AND sequence_no=2;
  SELECT id INTO s3 FROM public.batch_stages WHERE batch_id=b_d AND sequence_no=3;

  --  Blending: 30 kg dispensed, 29 kg out.
  r := public.yield_reconcile_stage(s1, 29.0);
  PERFORM _i12k('K','K1 stage 1 reconciles against what was dispensed',
    (r->>'theoretical_quantity')::numeric = 30.0 AND (r->>'actual_quantity')::numeric = 29.0,
    format('%s -> %s', r->>'theoretical_quantity', r->>'actual_quantity'));

  sg := public.sign_electronic_record(c_a,'batch_stage',s1,'complete','authored','CorrectHorse1!');
  PERFORM public.batch_stage_complete(s1,(sg->>'signature_id')::uuid);
  PERFORM public.batch_stage_start(s2);

  --  Granulation: 29 kg in from stage 1, 27 kg out.
  r := public.yield_reconcile_stage(s2, 27.0);
  PERFORM _i12k('K','K2 stage 2 reconciles against stage 1''s output',
    (r->>'theoretical_quantity')::numeric = 29.0 AND (r->>'basis') = 'previous_stage_output',
    format('%s / %s', r->>'theoretical_quantity', r->>'basis'));

  sg := public.sign_electronic_record(c_a,'batch_stage',s2,'complete','authored','CorrectHorse1!');
  PERFORM public.batch_stage_complete(s2,(sg->>'signature_id')::uuid);
  PERFORM public.batch_stage_start(s3);

  --  THE NEAREST EARLIER, NOT THE FIRST. Stage 3's basis must be stage
  --  2's 27 kg, not stage 1's 29 kg. With only two reconciled stages
  --  anywhere, ascending and descending order pick the same row and this
  --  claim cannot be tested — which is why product D exists.
  SELECT * INTO v FROM public.yield_theoretical_basis(b_d, s3, 'previous_stage_output');
  PERFORM _i12k('K','K3 the basis is the NEAREST earlier output, not the first',
    v.basis_quantity = 27.0,
    format('%s %s (%s)', v.basis_quantity, v.basis_unit, v.detail));
  PERFORM _i12k('K','K4 and it names stage 2, not stage 1',
    v.detail LIKE '%stage 2%', coalesce(v.detail,'NULL'));

  --  THE INPUT UNIT CHECK, REACHED ON ITS OWN. Drying's config expects
  --  tonnes; stage 2 produced kg. Nothing converts, so this is refused —
  --  and the refusal is the INPUT unit check specifically, not the
  --  mixed-dispensing check that masks it everywhere else.
  ok := false; msg := NULL;
  BEGIN PERFORM public.yield_reconcile_stage(s3, 26.0, 'tonnes');
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'YIELD_INPUT_UNIT_MISMATCH%'; msg := SQLERRM; END;
  PERFORM _i12k('K','K5 a single-unit basis that disagrees with the config is refused',
    ok, left(coalesce(msg,'it was accepted'),200));

  PERFORM _i12k('K','K6 and the refusal names both units',
    coalesce(msg,'') LIKE '%kg%' AND coalesce(msg,'') LIKE '%tonnes%',
    left(coalesce(msg,''),200));

  PERFORM _i12k('K','K7 with nothing recorded',
    NOT EXISTS (SELECT 1 FROM public.batch_yield_reconciliations WHERE batch_stage_id = s3));

  --  ONE RECONCILIATION PER STAGE. The RPC is the only way in, and a
  --  second call on the same stage has to be refused — otherwise a stage
  --  could carry two verdicts and the gate would read whichever it found.
  ok := false; msg := NULL;
  BEGIN PERFORM public.yield_reconcile_stage(s2, 28.0);
  EXCEPTION WHEN unique_violation THEN ok := true; msg := SQLERRM;
            WHEN others THEN msg := SQLERRM; END;
  PERFORM _i12k('K','K8 a stage cannot be reconciled twice', ok,
    left(coalesce(msg,'it was reconciled again'),200));

  PERFORM _i12k('K','K9 and the first reconciliation stands',
    (SELECT count(*) = 1 AND min(actual_quantity) = 27.0
       FROM public.batch_yield_reconciliations WHERE batch_stage_id = s2));
END
$k$;


-- =====================================================================
--  L — the storage rules beneath the RPC
--
--  Section E goes through yield_authorise_variance, which validates the
--  investigation, the reason and the second person itself — so those
--  assertions pass whether or not the CHECK constraints exist. Mutation
--  testing showed exactly that: dropping any of four constraints changed
--  nothing any assertion could see.
--
--  The RPC is the front door and the constraints are the floor. A suite
--  that only knocks on the door never finds out there is no floor, and a
--  floor matters here because an authorisation is the one thing that
--  clears the block.
-- =====================================================================
RESET ROLE;
DO $l$
DECLARE
  c_a uuid := current_setting('i12.c_a')::uuid;
  u_op uuid := current_setting('i12.u_op')::uuid;
  u_sup uuid := current_setting('i12.u_sup')::uuid;
  b uuid := current_setting('i12.b_nodisp')::uuid;
  v_stage uuid;
  ok boolean; msg text;
BEGIN
  --  Stage 2 of the nodisp batch carries no reconciliation, so it is the
  --  one free slot byr_scope_uniq leaves for a direct write.
  SELECT id INTO v_stage FROM public.batch_stages WHERE batch_id=b AND sequence_no=2;

  --  An authorisation with no reason.
  ok := false; msg := NULL;
  BEGIN
    INSERT INTO public.batch_yield_reconciliations
      (company_id,batch_id,batch_stage_id,theoretical_basis,basis_quantity,output_per_input,
       threshold_pct,theoretical_quantity,actual_quantity,unit,
       investigation_required,investigation_note,authorised_by,authorised_at,recorded_by)
    VALUES (c_a,b,v_stage,'dispensed_to_stage',50,1,2.0,50,40,'kg',
            true,'Investigated',u_sup,now(),u_op);
  EXCEPTION WHEN check_violation THEN ok := true; msg := SQLERRM;
            WHEN others THEN msg := SQLERRM; END;
  PERFORM _i12k('L','L1 storage refuses an authorisation with no reason', ok,
    left(coalesce(msg,'the reasonless authorisation was stored'),180));

  --  An authorisation with no investigation behind it.
  ok := false; msg := NULL;
  BEGIN
    INSERT INTO public.batch_yield_reconciliations
      (company_id,batch_id,batch_stage_id,theoretical_basis,basis_quantity,output_per_input,
       threshold_pct,theoretical_quantity,actual_quantity,unit,
       investigation_required,authorised_by,authorised_at,authorisation_reason,recorded_by)
    VALUES (c_a,b,v_stage,'dispensed_to_stage',50,1,2.0,50,40,'kg',
            false,u_sup,now(),'Waved through',u_op);
  EXCEPTION WHEN check_violation THEN ok := true; msg := SQLERRM;
            WHEN others THEN msg := SQLERRM; END;
  PERFORM _i12k('L','L2 nor one with no investigation behind it', ok,
    left(coalesce(msg,'the uninvestigated authorisation was stored'),180));

  --  An investigation flag with no note.
  ok := false; msg := NULL;
  BEGIN
    INSERT INTO public.batch_yield_reconciliations
      (company_id,batch_id,batch_stage_id,theoretical_basis,basis_quantity,output_per_input,
       threshold_pct,theoretical_quantity,actual_quantity,unit,
       investigation_required,recorded_by)
    VALUES (c_a,b,v_stage,'dispensed_to_stage',50,1,2.0,50,40,'kg',true,u_op);
  EXCEPTION WHEN check_violation THEN ok := true; msg := SQLERRM;
            WHEN others THEN msg := SQLERRM; END;
  PERFORM _i12k('L','L3 nor an investigation flag with no note', ok,
    left(coalesce(msg,'the noteless investigation was stored'),180));

  --  THE SECOND PERSON, at storage level. The operator authorising their
  --  own variance is the single most valuable thing on this list to
  --  refuse twice.
  ok := false; msg := NULL;
  BEGIN
    INSERT INTO public.batch_yield_reconciliations
      (company_id,batch_id,batch_stage_id,theoretical_basis,basis_quantity,output_per_input,
       threshold_pct,theoretical_quantity,actual_quantity,unit,
       investigation_required,investigation_note,authorised_by,authorised_at,
       authorisation_reason,recorded_by)
    VALUES (c_a,b,v_stage,'dispensed_to_stage',50,1,2.0,50,40,'kg',
            true,'Investigated',u_op,now(),'My own numbers are fine',u_op);
  EXCEPTION WHEN check_violation THEN ok := true; msg := SQLERRM;
            WHEN others THEN msg := SQLERRM; END;
  PERFORM _i12k('L','L4 and refuses the recorder authorising their own', ok,
    left(coalesce(msg,'the self-authorisation was stored'),180));

  --  A decided-at with no decider, and the reverse.
  ok := false; msg := NULL;
  BEGIN
    INSERT INTO public.batch_yield_reconciliations
      (company_id,batch_id,batch_stage_id,theoretical_basis,basis_quantity,output_per_input,
       threshold_pct,theoretical_quantity,actual_quantity,unit,
       investigation_required,investigation_note,authorised_at,recorded_by)
    VALUES (c_a,b,v_stage,'dispensed_to_stage',50,1,2.0,50,40,'kg',
            true,'Investigated',now(),u_op);
  EXCEPTION WHEN check_violation THEN ok := true; msg := SQLERRM;
            WHEN others THEN msg := SQLERRM; END;
  PERFORM _i12k('L','L5 nor a time of authorisation with nobody attached', ok,
    left(coalesce(msg,'the half-authorisation was stored'),180));

  --  A theoretical quantity of zero: the denominator.
  ok := false; msg := NULL;
  BEGIN
    INSERT INTO public.batch_yield_reconciliations
      (company_id,batch_id,batch_stage_id,theoretical_basis,basis_quantity,output_per_input,
       threshold_pct,theoretical_quantity,actual_quantity,unit,recorded_by)
    VALUES (c_a,b,v_stage,'dispensed_to_stage',0,1,2.0,0,40,'kg',u_op);
  EXCEPTION WHEN others THEN
    ok := SQLERRM LIKE 'YIELD_NO_THEORETICAL%' OR SQLERRM LIKE '%byr_quantities_chk%';
    msg := SQLERRM; END;
  PERFORM _i12k('L','L6 and a theoretical quantity of zero', ok,
    left(coalesce(msg,'a zero denominator was stored'),180));

  --  ...while the complete row goes in, so L1 to L6 are about what is
  --  missing from each and not about the insert being impossible.
  ok := false; msg := NULL;
  BEGIN
    INSERT INTO public.batch_yield_reconciliations
      (company_id,batch_id,batch_stage_id,theoretical_basis,basis_quantity,output_per_input,
       threshold_pct,theoretical_quantity,actual_quantity,unit,
       investigation_required,investigation_note,authorised_by,authorised_at,
       authorisation_reason,recorded_by)
    VALUES (c_a,b,v_stage,'dispensed_to_stage',50,1,2.0,50,40,'kg',
            true,'Bowl residue weighed',u_sup,now(),'Accounted for in full',u_op);
    ok := true;
  EXCEPTION WHEN others THEN msg := SQLERRM; END;
  PERFORM _i12k('L','L7 while a complete authorisation is accepted', ok,
    left(coalesce(msg,''),180));

  --  ONE PER STAGE, at storage level. The RPC refuses a second
  --  reconciliation (K8), but so must the table: a stage carrying two
  --  verdicts is a stage where the gate reads whichever it finds first.
  ok := false; msg := NULL;
  BEGIN
    INSERT INTO public.batch_yield_reconciliations
      (company_id,batch_id,batch_stage_id,theoretical_basis,basis_quantity,output_per_input,
       threshold_pct,theoretical_quantity,actual_quantity,unit,recorded_by)
    VALUES (c_a,b,v_stage,'dispensed_to_stage',50,1,2.0,50,49,'kg',u_op);
  EXCEPTION WHEN unique_violation THEN ok := true; msg := SQLERRM;
            WHEN others THEN msg := SQLERRM; END;
  PERFORM _i12k('L','L8 and storage refuses a second reconciliation for the stage', ok,
    left(coalesce(msg,'a second verdict was stored'),180));
END
$l$;
SET ROLE authenticated;


-- =====================================================================
--  M — item 10's lockout, tested by behaviour and not by text
--
--  H4 asserts that batch_stage_complete still MENTIONS
--  instrument_block_reason. Mutation testing showed that assertion is
--  weaker than it looks: gutting the IF that acts on the answer leaves
--  the function name in the SELECT above it, and H4 passed on a
--  completely disabled lockout.
--
--  Three items have now re-declared batch_stage_complete, so this item
--  owes the next one a behavioural check rather than a text search.
-- =====================================================================
RESET ROLE;
DO $m_fix$
DECLARE c_a uuid := current_setting('i12.c_a')::uuid;
BEGIN
  --  A balance that is IN calibration to begin with. It has to be: item
  --  10 refuses to record a USE of an instrument that is already out,
  --  so a lapsed balance cannot be attached to a stage at all. The real
  --  scenario — and the reason item 10 re-checks at sign-off rather than
  --  trusting the use record — is a balance that passed, was used, and
  --  then failed its next calibration check. Everything weighed on it
  --  since is suspect, and that is what the re-check catches.
  INSERT INTO public.instruments(company_id,code,name,instrument_type,owner_user_id,created_by)
  VALUES (c_a,'BAL-12-FAILED','Balance that later failed','balance',
          current_setting('i12.u_sup')::uuid, current_setting('i12.u_op')::uuid);
  PERFORM set_config('i12.bal_bad',
    (SELECT id::text FROM public.instruments WHERE company_id=c_a AND code='BAL-12-FAILED'), false);
  INSERT INTO public.instrument_calibrations
    (company_id,instrument_id,certificate_number,calibrated_on,due_on,
     performed_in_house,result,uploaded_by)
  VALUES (c_a, current_setting('i12.bal_bad')::uuid, 'CAL-12-OK',
          current_date-200, current_date+165, true, 'pass',
          current_setting('i12.u_sup')::uuid);
END
$m_fix$;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('i12.u_op'), 'role','authenticated')::text, false);
SET ROLE authenticated;
DO $m$
DECLARE
  c_a uuid := current_setting('i12.c_a')::uuid;
  s2 uuid := current_setting('i12.s_chain2')::uuid;
  sig jsonb; ok boolean; msg text; st text;
BEGIN
  --  The balance is fine, so recording its use is permitted.
  PERFORM _i12k('M','M1 the balance is in calibration when it is used',
    public.instrument_block_reason(current_setting('i12.bal_bad')::uuid) IS NULL,
    coalesce(public.instrument_block_reason(current_setting('i12.bal_bad')::uuid),'NULL'));

  INSERT INTO public.instrument_usages
    (company_id,instrument_id,entity_type,entity_id,used_by)
  VALUES (c_a, current_setting('i12.bal_bad')::uuid, 'batch_stage', s2,
          current_setting('i12.u_op')::uuid);
  PERFORM _i12k('M','M2 and the use is recorded against the stage',
    EXISTS (SELECT 1 FROM public.instrument_usages
             WHERE entity_type='batch_stage' AND entity_id=s2
               AND instrument_id=current_setting('i12.bal_bad')::uuid));

  --  And the stage's own yield does not block it, so whatever refuses
  --  below is item 10's lockout and nothing else.
  PERFORM _i12k('M','M3 the stage''s own yield does not block it',
    public.yield_block_reason(s2) IS NULL, coalesce(public.yield_block_reason(s2),'NULL'));
END
$m$;

--  NOW IT FAILS ITS NEXT CHECK.
RESET ROLE;
DO $m_fail$
BEGIN
  INSERT INTO public.instrument_calibrations
    (company_id,instrument_id,certificate_number,calibrated_on,due_on,
     performed_in_house,result,uploaded_by)
  VALUES (current_setting('i12.c_a')::uuid, current_setting('i12.bal_bad')::uuid,
          'CAL-12-FAIL', current_date, current_date+365, true, 'fail',
          current_setting('i12.u_sup')::uuid);
END
$m_fail$;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('i12.u_op'), 'role','authenticated')::text, false);
SET ROLE authenticated;
DO $m2$
DECLARE
  c_a uuid := current_setting('i12.c_a')::uuid;
  s2 uuid := current_setting('i12.s_chain2')::uuid;
  sig jsonb; ok boolean; msg text; st text;
BEGIN
  PERFORM _i12k('M','M4 a failed calibration puts the balance out of use',
    public.instrument_block_reason(current_setting('i12.bal_bad')::uuid) IS NOT NULL,
    coalesce(public.instrument_block_reason(current_setting('i12.bal_bad')::uuid),'NULL'));

  --  SO THE ONLY THING THAT CAN REFUSE THIS SIGN-OFF IS ITEM 10'S
  --  LOCKOUT, re-checking the instrument as it stands NOW rather than as
  --  it stood when the use was recorded.
  sig := public.sign_electronic_record(c_a,'batch_stage',s2,'complete','authored','CorrectHorse1!');
  ok := false; msg := NULL;
  BEGIN
    PERFORM public.batch_stage_complete(s2,(sig->>'signature_id')::uuid);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'INSTRUMENT_NOT_CALIBRATED%'; msg := SQLERRM; END;
  PERFORM _i12k('M','M5 item 10''s lockout still refuses the sign-off', ok,
    left(coalesce(msg,'it completed'),200));

  SELECT status INTO st FROM public.batch_stages WHERE id = s2;
  PERFORM _i12k('M','M6 THE STAGE IS STILL NOT COMPLETE', st <> 'complete', 'status '||st);
END
$m2$;


-- =====================================================================
--  H — the NOT DONE IF clauses, stated directly
-- =====================================================================
DO $h$
DECLARE n integer; st text; ok boolean; msg text;
BEGIN
  --  "The calculation is right but the threshold blocks nothing."
  --
  --  The strongest single statement of the opposite: a stage whose
  --  reconciliation is outside threshold and unauthorised is STILL NOT
  --  COMPLETE after batch_stage_complete has been called on it. Section
  --  D proved the call refuses; this asserts the state, which is what
  --  the clause is actually about.
  SELECT status INTO st FROM public.batch_stages WHERE id = current_setting('i12.s_bad')::uuid;
  PERFORM _i12k('H','H1 an unauthorised variance leaves the stage incomplete',
    st <> 'complete', 'status '||st);

  --  And the block is wired into the function everybody calls, not
  --  bolted on beside it. The deploy guard checks this too; here it is
  --  asserted as a fact about the shipped function.
  PERFORM _i12k('H','H2 the block lives inside batch_stage_complete itself',
    (SELECT pg_get_functiondef(p.oid) LIKE '%yield_block_reason%'
       FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
      WHERE ns.nspname='public' AND p.proname='batch_stage_complete'));

  PERFORM _i12k('H','H3 and inside batch_record_close',
    (SELECT pg_get_functiondef(p.oid) LIKE '%yield_batch_block_reason%'
       FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
      WHERE ns.nspname='public' AND p.proname='batch_record_close'));

  --  ITEM 10'S LOCKOUT SURVIVED THIS ITEM'S RE-DECLARATION of
  --  batch_stage_complete. Three items have now rewritten that function,
  --  and re-declaring a function another item extended is how a control
  --  gets quietly dropped.
  --
  --  H4 AND H5 ARE TEXT SEARCHES, and worth exactly what a text search
  --  is worth: mutation testing gutted the IF that acts on the lockout's
  --  answer and H4 still passed, because the function name remained in
  --  the SELECT above it. Section M tests the same thing by behaviour.
  --  These two are kept because they catch the cruder failure — a
  --  re-declaration that drops the call outright — and fail loudly.
  PERFORM _i12k('H','H4 item 10''s calibration lockout survived the re-declaration',
    (SELECT pg_get_functiondef(p.oid) LIKE '%instrument_block_reason%'
       FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
      WHERE ns.nspname='public' AND p.proname='batch_stage_complete'));

  PERFORM _i12k('H','H5 and item 07''s self-verification rule',
    (SELECT pg_get_functiondef(p.oid) LIKE '%BATCH_STAGE_SELF_VERIFIED%'
       FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
      WHERE ns.nspname='public' AND p.proname='batch_stage_complete'));

  --  "Threshold hardcoded."
  --
  --  Four configs, three distinct thresholds across them, and no default
  --  on the column. A system reaching for one number could not produce
  --  these answers.
  SELECT count(DISTINCT variance_threshold_pct) INTO n
    FROM public.yield_reconciliation_configs WHERE company_id = current_setting('i12.c_a')::uuid;
  PERFORM _i12k('H','H6 five different thresholds are in play at once', n = 5, n||' distinct');

  PERFORM _i12k('H','H7 and the threshold column has no default',
    NOT EXISTS (SELECT 1 FROM pg_attrdef d
                  JOIN pg_attribute at ON at.attrelid=d.adrelid AND at.attnum=d.adnum
                 WHERE d.adrelid='public.yield_reconciliation_configs'::regclass
                   AND at.attname='variance_threshold_pct'));

  --  No constant anywhere in the migration is doing the work of a
  --  threshold: the gate reads the SNAPSHOT on the reconciliation, which
  --  came from the config.
  PERFORM _i12k('H','H8 the gate reads the reconciliation''s own snapshot',
    (SELECT pg_get_functiondef(p.oid) LIKE '%r.threshold_pct%'
       FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
      WHERE ns.nspname='public' AND p.proname='yield_block_reason'));

  --  "Proceeding without a recorded authorisation."
  --
  --  The authorised reconciliation carries all of who, when and why, and
  --  its stage completed only after that.
  PERFORM _i12k('H','H9 the one stage that proceeded has a complete authorisation behind it',
    (SELECT r.authorised_by IS NOT NULL AND r.authorised_at IS NOT NULL
        AND btrim(coalesce(r.authorisation_reason,'')) <> ''
        AND r.investigation_required
        AND btrim(coalesce(r.investigation_note,'')) <> ''
        AND r.authorised_by <> r.recorded_by
       FROM public.batch_yield_reconciliations r
      WHERE r.id = current_setting('i12.r_auth')::uuid));

  --  WHAT WAS DELIBERATELY NOT BUILT: no deviation, anywhere. Item 12
  --  marks the link point and Week 6 owns it. An assertion about
  --  something not existing is weak by nature, and the honest version of
  --  it is that no reconciliation in this suite acquired a deviation_id
  --  — including the one that was investigated and authorised, which is
  --  the case where a system inclined to open one would have.
  SELECT count(*) INTO n FROM public.batch_yield_reconciliations
   WHERE company_id = current_setting('i12.c_a')::uuid AND deviation_id IS NOT NULL;
  PERFORM _i12k('H','H10 no reconciliation acquired a deviation', n = 0, n||' with a deviation');
END
$h$;


-- =====================================================================
--  I — the status read for the screens (item 19)
-- =====================================================================
DO $i$
DECLARE n integer; v record;
BEGIN
  SELECT count(*) INTO n FROM public.yield_reconciliation_status(current_setting('i12.b_bad')::uuid);
  --  Two stages plus the batch row.
  PERFORM _i12k('I','I1 every stage is reported, plus the batch', n = 3, n||' row(s)');

  SELECT * INTO v FROM public.yield_reconciliation_status(current_setting('i12.b_bad')::uuid)
   WHERE scope = 'stage' AND sequence_no = 1;
  PERFORM _i12k('I','I2 with the variance, the threshold and the block together',
    v.variance_pct = -8.0 AND v.threshold_pct = 2.0 AND v.block_reason IS NOT NULL,
    format('%s / %s / %s', v.variance_pct, v.threshold_pct, left(coalesce(v.block_reason,'NULL'),60)));

  PERFORM _i12k('I','I3 and says the stage is configured for reconciliation',
    v.configured, coalesce(v.configured::text,'NULL'));

  --  A stage with no reconciliation recorded reports configured=true and
  --  no figures, which is a different thing from an unconfigured stage
  --  and a screen has to be able to tell them apart.
  SELECT * INTO v FROM public.yield_reconciliation_status(current_setting('i12.b_bad')::uuid)
   WHERE scope = 'stage' AND sequence_no = 2;
  PERFORM _i12k('I','I4 a flagged stage with nothing recorded is distinguishable',
    v.configured AND v.reconciliation_id IS NULL AND v.block_reason IS NOT NULL,
    format('configured=%s recon=%s', v.configured, coalesce(v.reconciliation_id::text,'NULL')));

  --  Product C: unconfigured everywhere, so configured is false and
  --  nothing blocks.
  SELECT * INTO v FROM public.yield_reconciliation_status(current_setting('i12.b_c')::uuid)
   WHERE scope = 'stage' AND sequence_no = 1;
  PERFORM _i12k('I','I5 an unconfigured stage says so, and does not block',
    v.configured = false AND v.block_reason IS NULL,
    format('configured=%s block=%s', v.configured, coalesce(v.block_reason,'NULL')));

  SELECT * INTO v FROM public.yield_reconciliation_status(current_setting('i12.b_edge')::uuid)
   WHERE scope = 'batch';
  PERFORM _i12k('I','I6 the batch row carries the authorised variance',
    v.variance_pct = -10.0 AND v.authorised_by IS NOT NULL AND v.block_reason IS NULL,
    format('%s / auth=%s / block=%s', v.variance_pct,
           coalesce(v.authorised_by::text,'NULL'), coalesce(v.block_reason,'NULL')));
END
$i$;


-- =====================================================================
--  J — tenancy
-- =====================================================================
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('i12.u_b'), 'role','authenticated')::text, false);
SET ROLE authenticated;
DO $j$
DECLARE
  c_a uuid := current_setting('i12.c_a')::uuid;
  s_bad uuid := current_setting('i12.s_bad')::uuid;
  n integer; ok boolean; msg text;
BEGIN
  SELECT count(*) INTO n FROM public.yield_reconciliation_configs WHERE company_id = c_a;
  PERFORM _i12k('J','J1 another company cannot see the thresholds', n = 0, n||' row(s)');

  SELECT count(*) INTO n FROM public.batch_yield_reconciliations WHERE company_id = c_a;
  PERFORM _i12k('J','J2 nor the reconciliations', n = 0, n||' row(s)');

  --  THE FUNCTIONS OVER THE TABLES ARE SECURITY DEFINER, so J1 and J2
  --  prove nothing about them. Each is checked on its own.
  ok := false; msg := NULL;
  BEGIN PERFORM public.yield_block_reason(s_bad);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'BATCH_FORBIDDEN%'; msg := SQLERRM; END;
  PERFORM _i12k('J','J3 and cannot ask why another company''s stage is blocked',
    ok, left(coalesce(msg,'it answered'),180));

  ok := false; msg := NULL;
  BEGIN PERFORM public.yield_batch_block_reason(current_setting('i12.b_bad')::uuid);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'BATCH_FORBIDDEN%'; msg := SQLERRM; END;
  PERFORM _i12k('J','J4 nor about their batch', ok, left(coalesce(msg,'it answered'),180));

  ok := false; msg := NULL;
  BEGIN PERFORM public.yield_theoretical_basis(current_setting('i12.b_bad')::uuid, s_bad,
                                               'dispensed_to_stage');
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'BATCH_FORBIDDEN%'; msg := SQLERRM; END;
  PERFORM _i12k('J','J5 nor read what went into it', ok, left(coalesce(msg,'it answered'),180));

  ok := false; msg := NULL;
  BEGIN PERFORM public.yield_reconciliation_status(current_setting('i12.b_bad')::uuid);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'BATCH_FORBIDDEN%'; msg := SQLERRM; END;
  PERFORM _i12k('J','J6 nor read the status view', ok, left(coalesce(msg,'it answered'),180));

  ok := false; msg := NULL;
  BEGIN PERFORM public.yield_reconcile_stage(s_bad, 50);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'BATCH_FORBIDDEN%'; msg := SQLERRM; END;
  PERFORM _i12k('J','J7 nor record a reconciliation on it', ok, left(coalesce(msg,'it recorded one'),180));

  --  AND CANNOT CLEAR THE BLOCK, which is the one that would matter.
  ok := false; msg := NULL;
  BEGIN PERFORM public.yield_flag_investigation(current_setting('i12.r_bad')::uuid,'Mine now');
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'BATCH_FORBIDDEN%'; msg := SQLERRM; END;
  PERFORM _i12k('J','J8 nor flag an investigation on it', ok, left(coalesce(msg,'it was flagged'),180));

  ok := false; msg := NULL;
  BEGIN PERFORM public.yield_authorise_variance(current_setting('i12.r_bad')::uuid,'Mine now');
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'BATCH_FORBIDDEN%'; msg := SQLERRM; END;
  PERFORM _i12k('J','J9 and above all cannot authorise it', ok,
    left(coalesce(msg,'it was authorised'),180));
END
$j$;
RESET ROLE; RESET request.jwt.claims;

DO $j2$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM public.yield_reconciliation_configs
   WHERE company_id = current_setting('i12.c_a')::uuid;
  PERFORM _i12k('J','J10 and the owner is not locked out of their own configs',
    n = 7, n||' row(s)');
END
$j2$;

-- ═════════════════════════════════════════════════════════════════════
--  SECTION N — W4·19'S YIELD ACCOUNT
--
--  "Theoretical, packed, samples, rejects, unaccounted, yield and
--   variance against the threshold" (YR-01).
--
--  YR-01's figures settle what "actual yield" means, and section N is
--  written to keep it settled:
--
--      theoretical 300,000 · packed 289,440 · samples 1,260 ·
--      rejects 2,100 · unaccounted 7,200 (2.4%) ·
--      actual yield 96.5% · variance −3.5%
--
--  96.5% is packed over theoretical, NOT the accounted total over
--  theoretical (which is 97.6%). So actual_quantity IS the packed
--  figure, there is no second packed column, and the two percentages
--  on the screen are different numbers on purpose: one is the yield
--  the threshold blocks on, the other is the material nobody can find.
--
--  N2 and N4 are the pair that holds it. N2 keeps the verdict on
--  packed alone; N4 keeps unaccounted counting samples and rejects as
--  found. Collapse either and the screen shows a number the gate did
--  not use.
-- ═════════════════════════════════════════════════════════════════════
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('i12.u_op'), 'role','authenticated')::text, false);
SET ROLE authenticated;

DO $n$
DECLARE
  s_acct uuid; s_over uuid; r jsonb; v_rec uuid; v_over uuid;
  n integer; ok boolean; msg text; rec record;
BEGIN
  s_acct := _i12_batch(current_setting('i12.p_a')::uuid, 'I12-ACCT-N1');
  s_over := _i12_batch(current_setting('i12.p_a')::uuid, 'I12-ACCT-N2');
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', current_setting('i12.u_op'), 'role','authenticated')::text, false);

  --  50 kg theoretical. 49 kg packed, with 0.5 kg sampled and 0.4 kg
  --  rejected on top. The packed figure is section B's edge case: 98%,
  --  -2%, exactly on the 2% threshold and therefore within it.
  r := public.yield_reconcile_stage_accounted(s_acct, 49.0, 0.5, 0.4);
  v_rec := (r->>'reconciliation_id')::uuid;

  PERFORM _i12k('N','N1 the packed figure is the actual yield',
    (r->>'actual_quantity')::numeric = 49.0, coalesce(r->>'actual_quantity','NULL'));

  --  ═══ THE FIRST OF THE PAIR ═══
  --  The verdict is on PACKED ALONE, and it is item 12's, unchanged.
  --  Summing the account into the actual yield would read 49.9 kg here
  --  — 99.8%, a -0.2% variance — and a stage that packed 2% short
  --  would pass because somebody sampled it.
  PERFORM _i12k('N','N2 and the verdict is on packed alone, derived by item 12',
    (r->>'yield_pct')::numeric = 98.0 AND (r->>'variance_pct')::numeric = -2.0
    AND (r->>'within_threshold')::boolean,
    format('%s%% / %s / within %s', r->>'yield_pct', r->>'variance_pct',
           r->>'within_threshold'));

  --  And packed is not stored twice. A packed_quantity column would be
  --  a second home for actual_quantity; the migration asserts it never
  --  appears, and so does this.
  PERFORM _i12k('N','N2b packed is not held in a column of its own',
    NOT EXISTS (SELECT 1 FROM pg_attribute
                 WHERE attrelid = 'public.batch_yield_reconciliations'::regclass
                   AND attname = 'packed_quantity' AND NOT attisdropped));

  PERFORM _i12k('N','N3 one reconciliation, not two',
    (SELECT count(*) = 1 FROM public.batch_yield_reconciliations
      WHERE batch_stage_id = s_acct));

  --  ═══ THE SECOND OF THE PAIR ═══
  --  Samples and rejects are ACCOUNTED FOR, so the unaccounted line is
  --  theoretical minus all three — 50 − 49.9 = 0.1 kg, not the 1 kg
  --  the variance alone suggests. An account that treated them as lost
  --  would report 1 kg missing at Packing and send somebody looking
  --  for material that is sitting in the QC lab.
  SELECT quantity, pct_of_theoretical INTO rec
    FROM public.yield_account_lines(v_rec) WHERE line_key = 'unaccounted';
  PERFORM _i12k('N','N4 unaccounted counts samples and rejects as found',
    rec.quantity = 0.1,
    format('%s kg / %s%%', rec.quantity, rec.pct_of_theoretical));

  --  ...and it is therefore NOT the variance. The two numbers sit on
  --  the same screen and mean different things: 2% short on yield,
  --  0.2% of the batch unlocated. Collapsing them would lose one.
  PERFORM _i12k('N','N4b and is a different figure from the variance, deliberately',
    rec.pct_of_theoretical
      <> -(SELECT variance_pct FROM public.batch_yield_reconciliations WHERE id = v_rec)
    AND rec.pct_of_theoretical = 0.2,
    format('unaccounted %s%% against variance %s%%', rec.pct_of_theoretical,
           (SELECT variance_pct FROM public.batch_yield_reconciliations WHERE id = v_rec)));

  --  The six lines YR-01 shows, in the order it shows them.
  PERFORM _i12k('N','N5 the account has the six lines, in the design''s order',
    (SELECT array_agg(line_key ORDER BY sort_order) FROM public.yield_account_lines(v_rec))
      = ARRAY['theoretical','packed','samples','rejects','accounted','unaccounted'],
    (SELECT array_agg(line_key ORDER BY sort_order)::text
       FROM public.yield_account_lines(v_rec)));

  PERFORM _i12k('N','N6 the lines are what was counted',
    (SELECT quantity = 49.0 FROM public.yield_account_lines(v_rec) WHERE line_key='packed')
    AND (SELECT quantity = 0.5 FROM public.yield_account_lines(v_rec) WHERE line_key='samples')
    AND (SELECT quantity = 0.4 FROM public.yield_account_lines(v_rec) WHERE line_key='rejects')
    AND (SELECT quantity = 49.9 FROM public.yield_account_lines(v_rec) WHERE line_key='accounted'));

  --  The packed line reads actual_quantity and its share is yield_pct,
  --  rather than a second division of the same two numbers. Four
  --  decimal places apart is still two answers.
  PERFORM _i12k('N','N7 the packed line reads the yield item 12 derived',
    (SELECT pct_of_theoretical FROM public.yield_account_lines(v_rec) WHERE line_key='packed')
    = (SELECT yield_pct FROM public.batch_yield_reconciliations WHERE id = v_rec));

  --  Decision 4 for the lead is still open, so nothing demands an
  --  explanation yet. Asserted rather than left implicit: the day
  --  somebody answers yes, this assertion is where the answer lands.
  PERFORM _i12k('N','N8 no line demands an explanation yet (decision 4 open)',
    NOT EXISTS (SELECT 1 FROM public.yield_account_lines(v_rec) WHERE must_explain));

  --  AN OVERAGE MAKES UNACCOUNTED NEGATIVE. 51.5 kg packed out of 50
  --  is +3%, and with the account on top there is 2.4 kg more material
  --  than theory allows for. An absolute value would report it as
  --  "2.4 kg unaccounted", which reads like a loss — a different
  --  problem with a different cause.
  r := public.yield_reconcile_stage_accounted(s_over, 51.5, 0.5, 0.4);
  v_over := (r->>'reconciliation_id')::uuid;
  PERFORM _i12k('N','N9 an overage leaves unaccounted negative, not absolute',
    (SELECT quantity = -2.4 FROM public.yield_account_lines(v_over)
      WHERE line_key='unaccounted'),
    (SELECT quantity::text FROM public.yield_account_lines(v_over) WHERE line_key='unaccounted'));

  --  A reconciliation recorded WITHOUT a breakdown still has an
  --  account: its packed line and its yield are intact, and the lines
  --  nobody counted are absent. The breakdown explains a figure; it is
  --  not a precondition for having one, and every reconciliation
  --  recorded before this migration has none.
  PERFORM _i12k('N','N10 a reconciliation with no breakdown still has an account',
    (SELECT count(*) = 6 FROM public.yield_account_lines(current_setting('i12.r_edge')::uuid))
    AND (SELECT quantity = 49.0 FROM public.yield_account_lines(
           current_setting('i12.r_edge')::uuid) WHERE line_key='packed')
    AND (SELECT quantity IS NULL FROM public.yield_account_lines(
           current_setting('i12.r_edge')::uuid) WHERE line_key='samples'));

  --  And "accounted for" is ABSENT rather than equal to packed. Equal
  --  to packed would be a claim that nothing was sampled or rejected,
  --  which is not what a missing breakdown means.
  PERFORM _i12k('N','N10b with the derived lines absent, not assumed to be zero',
    (SELECT quantity IS NULL FROM public.yield_account_lines(
       current_setting('i12.r_edge')::uuid) WHERE line_key='accounted')
    AND (SELECT quantity IS NULL FROM public.yield_account_lines(
       current_setting('i12.r_edge')::uuid) WHERE line_key='unaccounted'));

  --  A HALF-WRITTEN ACCOUNT IS REFUSED. It looks like a breakdown and
  --  the remainder it implies is wrong by exactly the line nobody
  --  entered, which is worse than no breakdown at all.
  ok := false; msg := NULL;
  BEGIN PERFORM public.yield_reconcile_stage_accounted(
          _i12_batch(current_setting('i12.p_a')::uuid, 'I12-ACCT-N3'), 46.0, NULL, 1.5);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'YIELD_ACCOUNT_INCOMPLETE%'; msg := SQLERRM; END;
  PERFORM _i12k('N','N11 a half-written account is refused by name', ok,
    left(coalesce(msg,'it was accepted'),200));
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', current_setting('i12.u_op'), 'role','authenticated')::text, false);

  --  WRITE-ONCE. A breakdown that can be revised after a supervisor
  --  authorised the variance is not a record of what was counted.
  ok := false; msg := NULL;
  BEGIN
    UPDATE public.batch_yield_reconciliations SET samples_quantity = 9.0 WHERE id = v_rec;
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'YIELD_ACCOUNT_FROZEN%'; msg := SQLERRM; END;
  PERFORM _i12k('N','N12 and the lines cannot be revised afterwards', ok,
    left(coalesce(msg,'the samples figure was changed'),200));

  --  ...and a half-written account cannot be written around the RPC
  --  either, so the constraint holds for any writer and not only for
  --  the one path that happens to check.
  ok := false; msg := NULL;
  BEGIN
    UPDATE public.batch_yield_reconciliations SET samples_quantity = 1.0
     WHERE id = current_setting('i12.r_good')::uuid;
  EXCEPTION WHEN others THEN ok := true; msg := SQLERRM; END;
  PERFORM _i12k('N','N13 nor can one line be set on its own', ok,
    left(coalesce(msg,'a lone samples figure was stored'),200));

  --  A negative line is not a measurement.
  ok := false; msg := NULL;
  BEGIN
    UPDATE public.batch_yield_reconciliations
       SET samples_quantity = -1.0, rejects_quantity = 0
     WHERE id = current_setting('i12.r_good')::uuid;
  EXCEPTION WHEN others THEN ok := true; msg := SQLERRM; END;
  PERFORM _i12k('N','N14 and a negative line is refused', ok,
    left(coalesce(msg,'a negative samples figure was stored'),200));

  --  A variance beyond threshold still blocks, with or without an
  --  account. The breakdown explains the block; it does not soften it.
  PERFORM _i12k('N','N15 an accounted variance beyond threshold still blocks',
    (SELECT yield_block_reason(s_over) IS NOT NULL),
    coalesce((SELECT yield_block_reason(s_over)), 'nothing blocked'));

  PERFORM set_config('i12.r_acct', v_rec::text, false);
  PERFORM set_config('i12.s_acct', s_acct::text, false);
END
$n$;
RESET ROLE; RESET request.jwt.claims;

SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('i12.u_b'), 'role','authenticated')::text, false);
SET ROLE authenticated;

DO $n2$
DECLARE ok boolean; msg text;
BEGIN
  --  Both new functions are SECURITY DEFINER, so section J proving the
  --  tables are closed proves nothing about them.
  ok := false; msg := NULL;
  BEGIN PERFORM public.yield_account_lines(current_setting('i12.r_acct')::uuid);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'YIELD_FORBIDDEN%'; msg := SQLERRM; END;
  PERFORM _i12k('N','N16 a foreign company cannot read the account', ok,
    left(coalesce(msg,'they read it'),180));

  ok := false; msg := NULL;
  BEGIN PERFORM public.yield_reconcile_stage_accounted(
          current_setting('i12.s_acct')::uuid, 1.0, 1.0, 1.0);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'BATCH_FORBIDDEN%'; msg := SQLERRM; END;
  PERFORM _i12k('N','N17 nor record one', ok, left(coalesce(msg,'they recorded one'),180));
END
$n2$;
RESET ROLE; RESET request.jwt.claims;

DROP FUNCTION IF EXISTS _i12_batch(uuid,text,boolean);

\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo '  WEEK 4 / ITEM 12 — YIELD RECONCILIATION'
\echo '════════════════════════════════════════════════════════════════'
SELECT section, count(*) AS assertions, count(*) FILTER (WHERE NOT ok) AS failures
  FROM _i12 GROUP BY section ORDER BY section;
SELECT section, name, coalesce(detail,'') AS detail FROM _i12 WHERE NOT ok ORDER BY section, name;
SELECT count(*) AS total, count(*) FILTER (WHERE ok) AS passed,
       count(*) FILTER (WHERE NOT ok) AS failed FROM _i12;

DO $v$
DECLARE f integer;
BEGIN
  SELECT count(*) INTO f FROM _i12 WHERE NOT ok;
  IF f > 0 THEN RAISE EXCEPTION 'ITEM 12: % assertion(s) failed', f; END IF;
  RAISE NOTICE 'ITEM 12: all assertions passed';
END
$v$;
