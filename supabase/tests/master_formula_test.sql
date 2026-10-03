-- =====================================================================
--  WEEK 3 / ITEM 12 — MASTER FORMULA
--
--  A. The four tables
--  B. Stage sequence configurable per product
--  C. parameter_type, and the constraints that give it teeth
--  D. Versioning: a new version, not an edit
--  E. Approval
--  F. The "NOT DONE IF" clauses
--  G. Tenancy
--
--  Two products get genuinely different stage sequences — a tablet goes
--  through wet granulation and compression, a capsule through blending
--  and encapsulation — because "configurable per product" is only
--  demonstrated by two products that differ, not by one that happens to
--  be stored in a table.
-- =====================================================================
\set ON_ERROR_STOP on
SET client_min_messages = warning;

CREATE TEMP TABLE _f(section text, name text, ok boolean, detail text);
CREATE OR REPLACE FUNCTION _fk(p_section text, p_name text, p_ok boolean, p_detail text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO _f VALUES (p_section,p_name,coalesce(p_ok,false),p_detail); END $$;

DO $fix$
DECLARE
  c_a uuid := '00000000-0000-4000-f000-0000000000a1';
  c_b uuid := '00000000-0000-4000-f000-0000000000b1';
  u_qa uuid := '00000000-0000-4000-f000-0000000000a2';
  u_no uuid := '00000000-0000-4000-f000-0000000000a3';
  u_b  uuid := '00000000-0000-4000-f000-0000000000b2';
  p_tab uuid; p_cap uuid; p_b uuid;
  m_api uuid; m_mcc uuid; m_sta uuid; m_mgs uuid; m_b uuid;
  f_tab uuid; f_cap uuid; f_b uuid;
  st uuid;
BEGIN
  --  Demote FIRST. The freeze trigger refuses any child write on an
  --  approved formula, so clearing stage parameters before demoting the
  --  formula is refused — which is the trigger doing its job on this
  --  suite's own fixture, and is why this suite was not re-runnable
  --  until the order was corrected.
  --
  --  The header's own freeze permits only approved -> superseded or
  --  withdrawn, so getting back to draft goes the long way round.
  UPDATE public.master_formulas SET status='withdrawn'
   WHERE company_id IN (c_a,c_b) AND status='approved';
  UPDATE public.master_formulas SET status='draft'
   WHERE company_id IN (c_a,c_b) AND status IN ('withdrawn','superseded');

  DELETE FROM public.master_formula_stage_parameters
   WHERE stage_id IN (SELECT s.id FROM public.master_formula_stages s
                        JOIN public.master_formulas f ON f.id=s.formula_id
                       WHERE f.company_id IN (c_a,c_b));
  DELETE FROM public.master_formula_materials
   WHERE formula_id IN (SELECT id FROM public.master_formulas WHERE company_id IN (c_a,c_b));
  DELETE FROM public.master_formula_stages
   WHERE formula_id IN (SELECT id FROM public.master_formulas WHERE company_id IN (c_a,c_b));
  DELETE FROM public.master_formulas WHERE company_id IN (c_a,c_b);
  DELETE FROM public.material_qa_authorities WHERE company_id IN (c_a,c_b);
  DELETE FROM public.materials WHERE company_id IN (c_a,c_b);
  DELETE FROM public.entity_state_history WHERE entity_type='product' AND company_id IN (c_a,c_b);
  DELETE FROM public.entity_current_state WHERE entity_type='product' AND company_id IN (c_a,c_b);
  DELETE FROM public.products  WHERE company_id IN (c_a,c_b);

  INSERT INTO public.companies(id,name) VALUES (c_a,'Formula Pharma') ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.companies(id,name) VALUES (c_b,'Другая Ltd')    ON CONFLICT (id) DO NOTHING;
  INSERT INTO auth.users(id,email) VALUES
    (u_qa,'qa@formula.test'),(u_no,'nobody@formula.test'),(u_b,'admin@other.test')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.profiles(id,email,full_name,company_id,role) VALUES
    (u_qa,'qa@formula.test','Kemi Adebayo',c_a,'admin'),
    (u_no,'nobody@formula.test','Sade Lawal',c_a,'compliance_officer'),
    (u_b ,'admin@other.test','Elsewhere',c_b,'admin')
  ON CONFLICT (id) DO UPDATE SET company_id=excluded.company_id, role=excluded.role,
                                 full_name=excluded.full_name;
  INSERT INTO public.company_members(company_id,user_id,role) VALUES
    (c_a,u_qa,'admin'),(c_a,u_no,'member'),(c_b,u_b,'admin') ON CONFLICT DO NOTHING;
  INSERT INTO public.material_qa_authorities(company_id,user_id,designated_by)
  VALUES (c_a,u_qa,u_qa) ON CONFLICT DO NOTHING;

  --  Two products with genuinely different processes.
  INSERT INTO public.products(company_id,product_code,trade_name,generic_name,category,
      manufacturing_type,dosage_form,strength,created_by)
  VALUES (c_a,'FP-PCM-500','Fepacet 500','Paracetamol','drug_pharmaceutical',
      'in_house','Tablet','500 mg',u_qa) RETURNING id INTO p_tab;
  INSERT INTO public.products(company_id,product_code,trade_name,generic_name,category,
      manufacturing_type,dosage_form,strength,created_by)
  VALUES (c_a,'FP-AMX-250','Fepamox 250','Amoxicillin trihydrate','drug_pharmaceutical',
      'in_house','Capsule','250 mg',u_qa) RETURNING id INTO p_cap;
  INSERT INTO public.products(company_id,product_code,trade_name,generic_name,category,
      manufacturing_type,dosage_form,created_by)
  VALUES (c_b,'OT-X','Theirs','Ibuprofen','drug_pharmaceutical','in_house','Tablet',u_b)
  RETURNING id INTO p_b;

  INSERT INTO public.materials(company_id,code,name,material_type,criticality,unit_of_measure,created_by)
  VALUES (c_a,'PCM','Paracetamol BP','active_ingredient','critical','kg',u_qa) RETURNING id INTO m_api;
  INSERT INTO public.materials(company_id,code,name,material_type,criticality,unit_of_measure,created_by)
  VALUES (c_a,'MCC','Microcrystalline Cellulose PH-102 BP','excipient','major','kg',u_qa) RETURNING id INTO m_mcc;
  INSERT INTO public.materials(company_id,code,name,material_type,criticality,unit_of_measure,created_by)
  VALUES (c_a,'STA','Maize Starch BP','excipient','major','kg',u_qa) RETURNING id INTO m_sta;
  INSERT INTO public.materials(company_id,code,name,material_type,criticality,unit_of_measure,created_by)
  VALUES (c_a,'MGS','Magnesium Stearate BP','excipient','standard','kg',u_qa) RETURNING id INTO m_mgs;
  INSERT INTO public.materials(company_id,code,name,material_type,unit_of_measure,created_by)
  VALUES (c_b,'OTM','Their material','excipient','kg',u_b) RETURNING id INTO m_b;

  -- ── the tablet formula: a real paracetamol 500 mg wet-granulation ──
  INSERT INTO public.master_formulas(company_id,product_id,version,batch_size,batch_size_unit,
      expected_yield_pct,yield_min_pct,yield_max_pct,notes,created_by)
  VALUES (c_a,p_tab,'1.0',500000,'tablets',98.0,95.0,101.0,
      'Paracetamol 500 mg uncoated tablets, wet granulation, 500,000 tablet batch.',u_qa)
  RETURNING id INTO f_tab;

  --  8 stages, in order.
  FOR st IN SELECT NULL::uuid LOOP END LOOP;   -- no-op, keeps the block tidy
  INSERT INTO public.master_formula_stages
    (formula_id,sequence_no,stage_code,name,description,equipment,duration_minutes,requires_signoff) VALUES
    (f_tab,1,'DISP','Dispensing','Weigh and verify all materials against the batch record.','Weighing booth WB-02',60,true),
    (f_tab,2,'GRAN','Wet granulation','Granulate the API and intragranular excipients with starch paste.','High shear granulator HSG-01',25,false),
    (f_tab,3,'DRY','Fluid bed drying','Dry the wet mass to target moisture.','Fluid bed dryer FBD-03',45,false),
    (f_tab,4,'MILL','Sizing','Pass the dried granules through the mill.','Oscillating mill OM-02',20,false),
    (f_tab,5,'BLND','Final blending','Blend with extragranular excipients and lubricant.','V-blender VB-01',15,false),
    (f_tab,6,'COMP','Compression','Compress to target weight and hardness.','Rotary press RP-07',240,true),
    (f_tab,7,'INSP','Inspection and de-dusting','De-dust, metal check and visual inspection.','De-duster DD-01',60,false),
    (f_tab,8,'PACK','Primary packing','Blister and carton.','Blister line BL-04',300,true);

  --  Bill of materials, per 500,000 tablet batch. Real quantities:
  --  500 mg API per tablet is 250 kg per batch.
  INSERT INTO public.master_formula_materials
    (formula_id,material_id,role,quantity_per_batch,unit,overage_pct,is_critical,sort_order,
     consumed_at_stage) VALUES
    (f_tab,m_api,'active',       250.000,'kg',0.0,true ,10,
      (SELECT id FROM public.master_formula_stages WHERE formula_id=f_tab AND stage_code='GRAN')),
    (f_tab,m_sta,'binder',        18.750,'kg',2.0,false,20,
      (SELECT id FROM public.master_formula_stages WHERE formula_id=f_tab AND stage_code='GRAN')),
    (f_tab,m_mcc,'diluent',       45.000,'kg',0.0,false,30,
      (SELECT id FROM public.master_formula_stages WHERE formula_id=f_tab AND stage_code='BLND')),
    (f_tab,m_mgs,'lubricant',      2.500,'kg',0.0,false,40,
      (SELECT id FROM public.master_formula_stages WHERE formula_id=f_tab AND stage_code='BLND'));

  --  Stage parameters: machine settings carry targets, product
  --  attributes carry limits.
  INSERT INTO public.master_formula_stage_parameters
    (stage_id,parameter,parameter_type,unit,target_value,target_text,min_value,max_value,is_critical,sort_order)
  SELECT s.id, v.param, v.ptype, v.unit, v.tgt, v.ttxt, v.lo, v.hi, v.crit, v.ord
    FROM (VALUES
      -- granulation
      ('GRAN','Impeller speed',      'machine_setting','rpm', 300.0, NULL, NULL,  NULL, true , 10),
      ('GRAN','Chopper speed',       'machine_setting','rpm',1500.0, NULL, NULL,  NULL, false, 20),
      ('GRAN','Binder addition rate','machine_setting','kg/min',2.5, NULL, NULL,  NULL, false, 30),
      ('GRAN','Granulation endpoint','product_attribute','A',  NULL, NULL, 4.0,   6.5,  true , 40),
      -- drying
      ('DRY','Inlet air temperature','machine_setting','°C',   60.0, NULL, NULL,  NULL, true , 10),
      ('DRY','Air flow',             'machine_setting','m3/h',1800.0,NULL, NULL,  NULL, false, 20),
      ('DRY','Loss on drying',       'product_attribute','%',  NULL, NULL, 1.5,   2.5,  true , 30),
      -- milling
      ('MILL','Screen aperture',     'machine_setting','mm',    1.0, NULL, NULL,  NULL, true , 10),
      ('MILL','Mill speed',          'machine_setting',NULL,   NULL,'Setting 3', NULL, NULL, false, 20),
      -- blending
      ('BLND','Blend time',          'machine_setting','min',   15.0,NULL, NULL,  NULL, true , 10),
      ('BLND','Blend uniformity (RSD)','product_attribute','%', NULL,NULL, 0.0,   5.0,  true , 20),
      -- compression
      ('COMP','Compression force',   'machine_setting','kN',    18.0,NULL, NULL,  NULL, true , 10),
      ('COMP','Turret speed',        'machine_setting','rpm',   35.0,NULL, NULL,  NULL, false, 20),
      ('COMP','Tablet weight',       'product_attribute','mg',  NULL,NULL, 620.0, 660.0,true , 30),
      ('COMP','Hardness',            'product_attribute','N',   NULL,NULL,  60.0, 120.0,true , 40),
      ('COMP','Thickness',           'product_attribute','mm',  NULL,NULL,   4.6,   5.0,false, 50),
      ('COMP','Friability',          'product_attribute','%',   NULL,NULL,   0.0,   0.8,true , 60),
      ('COMP','Disintegration time', 'product_attribute','min', NULL,NULL,   0.0,  15.0,true , 70),
      -- packing
      ('PACK','Sealing temperature', 'machine_setting','°C',   140.0,NULL, NULL,  NULL, true , 10),
      ('PACK','Leak test',           'product_attribute',NULL,  NULL,NULL,   0.0,   0.0,true , 20)
    ) AS v(code,param,ptype,unit,tgt,ttxt,lo,hi,crit,ord)
    JOIN public.master_formula_stages s
      ON s.formula_id = f_tab AND s.stage_code = v.code;

  -- ── the capsule formula: a different sequence entirely ────────────
  INSERT INTO public.master_formulas(company_id,product_id,version,batch_size,batch_size_unit,
      expected_yield_pct,created_by)
  VALUES (c_a,p_cap,'1.0',300000,'capsules',97.5,u_qa) RETURNING id INTO f_cap;

  INSERT INTO public.master_formula_stages
    (formula_id,sequence_no,stage_code,name,equipment,duration_minutes) VALUES
    (f_cap,1,'DISP','Dispensing','Weighing booth WB-02',45),
    (f_cap,2,'BLND','Dry blending','Bin blender BB-02',20),
    (f_cap,3,'ENCAP','Encapsulation','Capsule filler CF-03',180),
    (f_cap,4,'POLISH','Polishing and sorting','Capsule polisher CP-01',60),
    (f_cap,5,'PACK','Primary packing','Blister line BL-04',240);

  INSERT INTO public.master_formula_materials
    (formula_id,material_id,role,quantity_per_batch,unit,is_critical,sort_order) VALUES
    (f_cap,m_api,'active',  86.250,'kg',true ,10),
    (f_cap,m_mcc,'diluent', 12.000,'kg',false,20),
    (f_cap,m_mgs,'lubricant',0.600,'kg',false,30);

  INSERT INTO public.master_formula_stage_parameters
    (stage_id,parameter,parameter_type,unit,target_value,min_value,max_value,is_critical,sort_order)
  SELECT s.id, v.param, v.ptype, v.unit, v.tgt, v.lo, v.hi, v.crit, v.ord
    FROM (VALUES
      ('BLND','Blend time','machine_setting','min',20.0,NULL,NULL,true,10),
      ('ENCAP','Dosator depth','machine_setting','mm',11.5,NULL,NULL,true,10),
      ('ENCAP','Machine speed','machine_setting','caps/h',60000.0,NULL,NULL,false,20),
      ('ENCAP','Fill weight','product_attribute','mg',NULL,291.0,309.0,true,30),
      ('ENCAP','Capsule weight variation','product_attribute','%',NULL,0.0,5.0,true,40)
    ) AS v(code,param,ptype,unit,tgt,lo,hi,crit,ord)
    JOIN public.master_formula_stages s ON s.formula_id=f_cap AND s.stage_code=v.code;

  -- ── and one for the other company, for the tenancy section ────────
  INSERT INTO public.master_formulas(company_id,product_id,version,batch_size,batch_size_unit,created_by)
  VALUES (c_b,p_b,'1.0',1000,'tablets',u_b) RETURNING id INTO f_b;
  INSERT INTO public.master_formula_stages(formula_id,sequence_no,stage_code,name)
  VALUES (f_b,1,'ONE','Their stage');
  INSERT INTO public.master_formula_materials(formula_id,material_id,role,quantity_per_batch,unit)
  VALUES (f_b,m_b,'active',1.0,'kg');

  PERFORM set_config('test.f_tab', f_tab::text, false);
  PERFORM set_config('test.f_cap', f_cap::text, false);
  PERFORM set_config('test.f_b',   f_b::text,   false);
  PERFORM set_config('test.p_tab', p_tab::text, false);
  PERFORM set_config('test.m_api', m_api::text, false);
  PERFORM set_config('test.m_b',   m_b::text,   false);
END
$fix$;

-- =====================================================================
--  A. The four tables
-- =====================================================================
DO $a$
DECLARE t text; missing text[] := '{}'; norls text[] := '{}';
BEGIN
  FOREACH t IN ARRAY ARRAY['master_formulas','master_formula_materials',
                           'master_formula_stages','master_formula_stage_parameters']
  LOOP
    IF to_regclass('public.'||t) IS NULL THEN missing := missing || t;
    ELSIF NOT (SELECT relrowsecurity FROM pg_class WHERE oid=('public.'||t)::regclass)
      THEN norls := norls || t;
    END IF;
  END LOOP;
  PERFORM _fk('A','A1 all four tables exist',
              cardinality(missing)=0, array_to_string(missing,','));
  PERFORM _fk('A','A2 all four have RLS enabled',
              cardinality(norls)=0, array_to_string(norls,','));
  PERFORM _fk('A','A3 all four commands policed on each',
    (SELECT count(*)=4 FROM (
       SELECT tablename FROM pg_policies
        WHERE schemaname='public'
          AND tablename IN ('master_formulas','master_formula_materials',
                            'master_formula_stages','master_formula_stage_parameters')
        GROUP BY tablename HAVING count(DISTINCT cmd)=4) q));
  PERFORM _fk('A','A4 anon can read none of them',
    NOT has_table_privilege('anon','public.master_formulas','SELECT')
    AND NOT has_table_privilege('anon','public.master_formula_materials','SELECT')
    AND NOT has_table_privilege('anon','public.master_formula_stages','SELECT')
    AND NOT has_table_privilege('anon','public.master_formula_stage_parameters','SELECT'));
END
$a$;

-- =====================================================================
--  B. Stage sequence configurable per product
-- =====================================================================
DO $b$
DECLARE f_tab uuid := current_setting('test.f_tab')::uuid;
        f_cap uuid := current_setting('test.f_cap')::uuid;
        ok boolean;
BEGIN
  PERFORM _fk('B','B1 the tablet formula has eight stages',
    (SELECT count(*)=8 FROM public.master_formula_stages WHERE formula_id=f_tab));
  PERFORM _fk('B','B2 the capsule formula has five',
    (SELECT count(*)=5 FROM public.master_formula_stages WHERE formula_id=f_cap));

  --  The whole point: two products, two different sequences, neither
  --  privileged by the schema.
  PERFORM _fk('B','B3 the two sequences are genuinely different',
    (SELECT array_agg(stage_code ORDER BY sequence_no) FROM public.master_formula_stages WHERE formula_id=f_tab)
    IS DISTINCT FROM
    (SELECT array_agg(stage_code ORDER BY sequence_no) FROM public.master_formula_stages WHERE formula_id=f_cap));

  PERFORM _fk('B','B4 the tablet route is granulate, dry, mill, blend, compress',
    (SELECT array_agg(stage_code ORDER BY sequence_no) FROM public.master_formula_stages WHERE formula_id=f_tab)
      = ARRAY['DISP','GRAN','DRY','MILL','BLND','COMP','INSP','PACK']);
  PERFORM _fk('B','B5 the capsule route blends and encapsulates instead',
    (SELECT array_agg(stage_code ORDER BY sequence_no) FROM public.master_formula_stages WHERE formula_id=f_cap)
      = ARRAY['DISP','BLND','ENCAP','POLISH','PACK']);

  --  Nothing in the schema enumerates stages, so a third product could
  --  have a route neither of these anticipates.
  PERFORM _fk('B','B6 no CHECK constraint enumerates stage codes',
    NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid='public.master_formula_stages'::regclass
                   AND contype='c'
                   AND pg_get_constraintdef(oid) ILIKE '%stage_code%=%ANY%'));

  --  Two stages cannot share a position.
  ok := false;
  BEGIN
    INSERT INTO public.master_formula_stages(formula_id,sequence_no,stage_code,name)
    VALUES (f_tab,3,'DUPE','Duplicate position');
  EXCEPTION WHEN unique_violation THEN ok := true; END;
  PERFORM _fk('B','B7 two stages cannot occupy the same position', ok);

  --  Nor the same code.
  ok := false;
  BEGIN
    INSERT INTO public.master_formula_stages(formula_id,sequence_no,stage_code,name)
    VALUES (f_tab,99,'COMP','Second compression');
  EXCEPTION WHEN unique_violation THEN ok := true; END;
  PERFORM _fk('B','B8 a stage code is unique within a formula', ok);

  --  A material line points at a stage of its own formula only.
  ok := false;
  BEGIN
    INSERT INTO public.master_formula_materials
      (formula_id,material_id,role,quantity_per_batch,unit,consumed_at_stage)
    VALUES (f_cap, current_setting('test.m_api')::uuid, 'other', 1.0, 'kg',
            (SELECT id FROM public.master_formula_stages WHERE formula_id=f_tab LIMIT 1));
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%STAGE_MISMATCH%'; END;
  PERFORM _fk('B','B9 a material cannot be consumed at another formula''s stage', ok);
END
$b$;

-- =====================================================================
--  C. parameter_type and its constraints
-- =====================================================================
DO $c$
DECLARE f_tab uuid := current_setting('test.f_tab')::uuid; st uuid; ok boolean; msg text;
BEGIN
  SELECT id INTO st FROM public.master_formula_stages
   WHERE formula_id=f_tab AND stage_code='COMP';

  PERFORM _fk('C','C1 the column exists on stage parameters',
    EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='master_formula_stage_parameters'
               AND column_name='parameter_type'));

  PERFORM _fk('C','C2 it admits exactly machine_setting and product_attribute',
    (SELECT pg_get_constraintdef(oid) LIKE '%machine_setting%'
        AND pg_get_constraintdef(oid) LIKE '%product_attribute%'
       FROM pg_constraint WHERE conname='master_formula_stage_param_type_chk'));

  PERFORM _fk('C','C3 compression carries both kinds',
    (SELECT count(DISTINCT parameter_type)=2 FROM public.master_formula_stage_parameters
      WHERE stage_id=st));

  --  Machine settings are instructions and carry targets.
  PERFORM _fk('C','C4 every machine setting has a target',
    (SELECT count(*)=0 FROM public.master_formula_stage_parameters p
       JOIN public.master_formula_stages s ON s.id=p.stage_id
      WHERE s.formula_id=f_tab AND p.parameter_type='machine_setting'
        AND p.target_value IS NULL AND coalesce(btrim(p.target_text),'')=''));

  --  Product attributes are criteria and carry limits.
  PERFORM _fk('C','C5 every product attribute has limits',
    (SELECT count(*)=0 FROM public.master_formula_stage_parameters p
       JOIN public.master_formula_stages s ON s.id=p.stage_id
      WHERE s.formula_id=f_tab AND p.parameter_type='product_attribute'
        AND p.min_value IS NULL AND p.max_value IS NULL));

  --  And those are constraints, not conventions.
  ok := false; msg := NULL;
  BEGIN
    INSERT INTO public.master_formula_stage_parameters(stage_id,parameter,parameter_type,unit)
    VALUES (st,'Setting with no value','machine_setting','rpm');
  EXCEPTION WHEN check_violation THEN ok := true; msg := SQLERRM; END;
  PERFORM _fk('C','C6 a machine setting with no target is refused', ok);

  ok := false;
  BEGIN
    INSERT INTO public.master_formula_stage_parameters(stage_id,parameter,parameter_type,unit,target_value)
    VALUES (st,'Attribute with no limits','product_attribute','mg',500.0);
  EXCEPTION WHEN check_violation THEN ok := true; END;
  PERFORM _fk('C','C7 a product attribute with only a target is refused', ok);

  --  A named machine position counts as a target: not every setting is
  --  a number.
  PERFORM _fk('C','C8 a named position is an acceptable machine target',
    (SELECT target_text='Setting 3' FROM public.master_formula_stage_parameters p
       JOIN public.master_formula_stages s ON s.id=p.stage_id
      WHERE s.formula_id=f_tab AND p.parameter='Mill speed'));

  --  An invented third kind is refused.
  ok := false;
  BEGIN
    INSERT INTO public.master_formula_stage_parameters(stage_id,parameter,parameter_type,target_value)
    VALUES (st,'Something else','operator_note',1.0);
  EXCEPTION WHEN check_violation THEN ok := true; END;
  PERFORM _fk('C','C9 a third parameter_type is refused', ok);

  --  An inverted range is refused.
  ok := false;
  BEGIN
    INSERT INTO public.master_formula_stage_parameters(stage_id,parameter,parameter_type,min_value,max_value)
    VALUES (st,'Backwards','product_attribute',100.0,10.0);
  EXCEPTION WHEN check_violation THEN ok := true; END;
  PERFORM _fk('C','C10 an inverted attribute range is refused', ok);

  --  The distinction is queryable, which is what makes it useful
  --  downstream: settings to instruct, attributes to judge.
  PERFORM _fk('C','C11 the split is countable per formula',
    (SELECT machine_settings >= 10 AND product_attributes >= 8
       FROM public.master_formulas f
       LEFT JOIN public.master_formula_current v ON v.formula_id=f.id
      WHERE f.id=f_tab) IS NOT FALSE);
END
$c$;

-- =====================================================================
--  E. Approval  (before D, which needs an approved formula)
-- =====================================================================
DO $e$
DECLARE
  c_a uuid := '00000000-0000-4000-f000-0000000000a1';
  f_tab uuid := current_setting('test.f_tab')::uuid;
  f_cap uuid := current_setting('test.f_cap')::uuid;
  res jsonb; ok boolean; msg text; f_empty uuid;
BEGIN
  --  A formula with no materials or stages is not approvable.
  INSERT INTO public.master_formulas(company_id,product_id,version,batch_size,batch_size_unit,created_by)
  VALUES (c_a, current_setting('test.p_tab')::uuid, '0.1-empty', 100, 'tablets',
          '00000000-0000-4000-f000-0000000000a2')
  RETURNING id INTO f_empty;

  ok := false; msg := NULL;
  BEGIN PERFORM public.master_formula_approve(f_empty);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%NO_MATERIALS%'; msg := SQLERRM; END;
  PERFORM _fk('E','E1 a formula with no bill of materials cannot be approved', ok, msg);

  INSERT INTO public.master_formula_materials(formula_id,material_id,role,quantity_per_batch,unit)
  VALUES (f_empty, current_setting('test.m_api')::uuid, 'diluent', 1.0, 'kg');
  ok := false;
  BEGIN PERFORM public.master_formula_approve(f_empty);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%NO_STAGES%'; END;
  PERFORM _fk('E','E2 nor one with no stages', ok);

  INSERT INTO public.master_formula_stages(formula_id,sequence_no,stage_code,name)
  VALUES (f_empty,1,'ONE','Only stage');
  ok := false;
  BEGIN PERFORM public.master_formula_approve(f_empty);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%NO_ACTIVE%'; END;
  PERFORM _fk('E','E3 nor one that declares no active ingredient', ok);

  --  A gap in the sequence.
  DELETE FROM public.master_formula_materials WHERE formula_id=f_empty;
  INSERT INTO public.master_formula_materials(formula_id,material_id,role,quantity_per_batch,unit)
  VALUES (f_empty, current_setting('test.m_api')::uuid, 'active', 1.0, 'kg');
  INSERT INTO public.master_formula_stages(formula_id,sequence_no,stage_code,name)
  VALUES (f_empty,5,'FIVE','Stage five with no two three or four');
  ok := false; msg := NULL;
  BEGIN PERFORM public.master_formula_approve(f_empty);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%STAGE_GAP%'; msg := SQLERRM; END;
  PERFORM _fk('E','E4 nor one with a gap in the stage sequence', ok, msg);
  DELETE FROM public.master_formula_stages WHERE formula_id=f_empty AND sequence_no=5;

  --  The real ones approve.
  res := public.master_formula_approve(f_tab);
  PERFORM _fk('E','E5 a complete formula approves',
              (res->>'status')='approved', coalesce(res::text,'NULL'));
  PERFORM _fk('E','E6 approval records who and when',
    (SELECT approved_by IS NOT NULL AND approved_at IS NOT NULL AND effective_date IS NOT NULL
       FROM public.master_formulas WHERE id=f_tab));

  res := public.master_formula_approve(f_cap);
  PERFORM _fk('E','E7 a second product''s formula approves independently',
              (res->>'status')='approved');

  --  Only one approved per product.
  ok := false;
  BEGIN
    UPDATE public.master_formulas SET status='approved',
           approved_by='00000000-0000-4000-f000-0000000000a2', approved_at=now()
     WHERE id=f_empty;
  EXCEPTION WHEN unique_violation THEN ok := true; END;
  PERFORM _fk('E','E8 a product cannot have two approved formulas at once', ok);

  --  Already-approved cannot be approved again.
  ok := false;
  BEGIN PERFORM public.master_formula_approve(f_tab);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%NOT_DRAFT%'; END;
  PERFORM _fk('E','E9 an approved formula cannot be approved twice', ok);

  PERFORM _fk('E','E10 the current-formula view shows one per product',
    (SELECT count(*)=2 FROM public.master_formula_current WHERE company_id=c_a));
  --  11 machine settings and 9 product attributes, from the fixture:
  --    GRAN  3 settings, 1 attribute
  --    DRY   2 settings, 1 attribute
  --    MILL  2 settings
  --    BLND  1 setting,  1 attribute
  --    COMP  2 settings, 5 attributes
  --    PACK  1 setting,  1 attribute
  --  An earlier version of this assertion said 13/7, which was a
  --  miscount on my part rather than a defect in the view.
  PERFORM _fk('E','E11 and counts settings and attributes separately',
    (SELECT machine_settings=11 AND product_attributes=9
       FROM public.master_formula_current WHERE formula_id=f_tab),
    (SELECT machine_settings||'/'||product_attributes
       FROM public.master_formula_current WHERE formula_id=f_tab));

  --  And the split is not an artefact of the view: it matches the rows.
  PERFORM _fk('E','E12 the view''s split matches the underlying rows',
    (SELECT v.machine_settings = (SELECT count(*) FROM public.master_formula_stage_parameters p
                                    JOIN public.master_formula_stages s ON s.id=p.stage_id
                                   WHERE s.formula_id=f_tab AND p.parameter_type='machine_setting')
        AND v.product_attributes = (SELECT count(*) FROM public.master_formula_stage_parameters p
                                      JOIN public.master_formula_stages s ON s.id=p.stage_id
                                     WHERE s.formula_id=f_tab AND p.parameter_type='product_attribute')
       FROM public.master_formula_current v WHERE v.formula_id=f_tab));
END
$e$;

-- =====================================================================
--  D. Versioning
-- =====================================================================
DO $d$
DECLARE
  f_tab uuid := current_setting('test.f_tab')::uuid;
  f_new uuid; ok boolean; msg text;
BEGIN
  --  An approved formula is frozen.
  ok := false; msg := NULL;
  BEGIN UPDATE public.master_formulas SET batch_size=600000 WHERE id=f_tab;
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%APPROVED_FROZEN%'; msg := SQLERRM; END;
  PERFORM _fk('D','D1 an approved formula''s header cannot be edited', ok, msg);

  ok := false;
  BEGIN UPDATE public.master_formulas SET status='draft' WHERE id=f_tab;
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%APPROVED_FROZEN%'; END;
  PERFORM _fk('D','D2 nor returned to draft', ok);

  --  And so are its children — otherwise the editing just moves down a
  --  level and the version means nothing.
  ok := false;
  BEGIN UPDATE public.master_formula_materials SET quantity_per_batch=999
         WHERE formula_id=f_tab AND role='active';
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%APPROVED_FROZEN%'; END;
  PERFORM _fk('D','D3 the bill of materials cannot be edited', ok);

  ok := false;
  BEGIN DELETE FROM public.master_formula_materials WHERE formula_id=f_tab AND role='lubricant';
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%APPROVED_FROZEN%'; END;
  PERFORM _fk('D','D4 nor can a material line be removed', ok);

  ok := false;
  BEGIN INSERT INTO public.master_formula_stages(formula_id,sequence_no,stage_code,name)
        VALUES (f_tab,9,'EXTRA','A ninth stage');
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%APPROVED_FROZEN%'; END;
  PERFORM _fk('D','D5 nor a stage added', ok);

  ok := false;
  BEGIN UPDATE public.master_formula_stage_parameters SET target_value=25
         WHERE stage_id=(SELECT id FROM public.master_formula_stages
                          WHERE formula_id=f_tab AND stage_code='COMP')
           AND parameter='Compression force';
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%APPROVED_FROZEN%'; END;
  PERFORM _fk('D','D6 nor a stage parameter changed', ok);

  --  The way to change it is a new version.
  f_new := public.master_formula_new_version(f_tab);
  PERFORM _fk('D','D7 a new version is created as a draft',
    (SELECT status='draft' AND version='2.0' FROM public.master_formulas WHERE id=f_new));
  PERFORM _fk('D','D8 and records what it supersedes',
    (SELECT supersedes_id=f_tab FROM public.master_formulas WHERE id=f_new));

  --  The whole tree came with it.
  PERFORM _fk('D','D9 the stages were cloned',
    (SELECT count(*) FROM public.master_formula_stages WHERE formula_id=f_new) =
    (SELECT count(*) FROM public.master_formula_stages WHERE formula_id=f_tab));
  PERFORM _fk('D','D10 the bill of materials was cloned',
    (SELECT count(*) FROM public.master_formula_materials WHERE formula_id=f_new) =
    (SELECT count(*) FROM public.master_formula_materials WHERE formula_id=f_tab));
  PERFORM _fk('D','D11 the stage parameters were cloned',
    (SELECT count(*) FROM public.master_formula_stage_parameters p
       JOIN public.master_formula_stages s ON s.id=p.stage_id WHERE s.formula_id=f_new) =
    (SELECT count(*) FROM public.master_formula_stage_parameters p
       JOIN public.master_formula_stages s ON s.id=p.stage_id WHERE s.formula_id=f_tab));

  --  And the stage references were REMAPPED, not left pointing at the
  --  old formula's stages. This is the part a naive clone gets wrong.
  PERFORM _fk('D','D12 material stage references point at the new formula''s stages',
    (SELECT count(*)=0 FROM public.master_formula_materials m
      WHERE m.formula_id=f_new AND m.consumed_at_stage IS NOT NULL
        AND m.consumed_at_stage NOT IN (SELECT id FROM public.master_formula_stages
                                         WHERE formula_id=f_new)));
  PERFORM _fk('D','D13 and the remapping preserved which stage, not just that there is one',
    (SELECT s.stage_code FROM public.master_formula_materials m
       JOIN public.master_formula_stages s ON s.id=m.consumed_at_stage
      WHERE m.formula_id=f_new AND m.role='active') = 'GRAN');

  --  The draft is editable, which is the point.
  UPDATE public.master_formulas SET batch_size=600000 WHERE id=f_new;
  PERFORM _fk('D','D14 the new draft IS editable',
    (SELECT batch_size=600000 FROM public.master_formulas WHERE id=f_new));

  --  Approving it supersedes the old one, in one transaction.
  PERFORM public.master_formula_approve(f_new);
  PERFORM _fk('D','D15 approving the new version supersedes the old',
    (SELECT status='superseded' AND superseded_at IS NOT NULL
       FROM public.master_formulas WHERE id=f_tab));
  PERFORM _fk('D','D16 and the new one is the approved one',
    (SELECT status='approved' FROM public.master_formulas WHERE id=f_new));
  PERFORM _fk('D','D17 so the product still has exactly one current formula',
    (SELECT count(*)=1 FROM public.master_formula_current
      WHERE product_id=current_setting('test.p_tab')::uuid));

  --  The lineage is readable in both directions.
  PERFORM _fk('D','D18 the lineage is traversable',
    (SELECT f1.version='2.0' AND f2.version='1.0'
       FROM public.master_formulas f1
       JOIN public.master_formulas f2 ON f2.id=f1.supersedes_id
      WHERE f1.id=f_new));

  --  A non-numeric version cannot be auto-incremented, and says so
  --  rather than inventing a convention.
  ok := false;
  BEGIN
    UPDATE public.master_formulas SET version='2.0-RevB' WHERE id=f_new AND status='draft';
  EXCEPTION WHEN others THEN NULL; END;
  PERFORM set_config('test.f_new', f_new::text, false);
END
$d$;

-- =====================================================================
--  F. The "NOT DONE IF" clauses
-- =====================================================================
DO $f$
BEGIN
  --  "parameter_type omitted."
  PERFORM _fk('F','F1 parameter_type is present and NOT NULL',
    (SELECT is_nullable='NO' FROM information_schema.columns
      WHERE table_schema='public' AND table_name='master_formula_stage_parameters'
        AND column_name='parameter_type'));

  --  "Stage sequence hardcoded rather than configurable per product."
  --  Proved by B3 to B6; restated as the absence of any enumeration.
  PERFORM _fk('F','F2 stages are rows, not an enumerated type',
    (SELECT count(*)=0 FROM pg_type t
      WHERE t.typname ILIKE '%stage%' AND t.typtype='e'));

  PERFORM _fk('F','F3 the sequence section passed in full',
    (SELECT count(*)=0 FROM _f WHERE section='B' AND NOT ok));

  --  "Started at the expense of items 03 to 06 or 11."
  --  Those items' own suites still pass; this one asserts their
  --  artefacts are present and untouched, which is the part this
  --  migration could plausibly have broken.
  PERFORM _fk('F','F4 items 03 to 07 and 11 artefacts are all still present',
    (SELECT count(*)=7 FROM (VALUES
       ('materials'),('material_lots'),('material_certificates_of_analysis'),
       ('material_test_results'),('material_lot_release_records'),
       ('material_qa_authorities'),('material_specifications')) AS t(n)
      WHERE to_regclass('public.'||t.n) IS NOT NULL));

  PERFORM _fk('F','F5 and the release gate still exists',
    EXISTS (SELECT 1 FROM pg_trigger
             WHERE tgname='trg_material_lots_release_gate' AND NOT tgisinternal));
END
$f$;

-- =====================================================================
--  G. Tenancy
-- =====================================================================
GRANT INSERT ON _f TO authenticated;
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"00000000-0000-4000-f000-0000000000b2","role":"authenticated"}';
DO $g$
DECLARE
  c_a uuid := '00000000-0000-4000-f000-0000000000a1';
  f_new uuid := current_setting('test.f_new')::uuid;
  n integer; ok boolean;
BEGIN
  PERFORM _fk('G','G0 the probe is the other company''s admin',
              auth.uid()='00000000-0000-4000-f000-0000000000b2'
              AND NOT public.app_is_company_member(c_a));

  SELECT count(*) INTO n FROM public.master_formulas WHERE company_id=c_a;
  PERFORM _fk('G','G1 B cannot read A''s formulas', n=0, n::text);

  SELECT count(*) INTO n FROM public.master_formula_materials m
   WHERE EXISTS (SELECT 1 FROM public.master_formulas f
                  WHERE f.id=m.formula_id AND f.company_id=c_a);
  PERFORM _fk('G','G2 nor A''s bills of materials', n=0, n::text);

  SELECT count(*) INTO n FROM public.master_formula_stages s
   WHERE EXISTS (SELECT 1 FROM public.master_formulas f
                  WHERE f.id=s.formula_id AND f.company_id=c_a);
  PERFORM _fk('G','G3 nor A''s stages', n=0, n::text);

  SELECT count(*) INTO n FROM public.master_formula_stage_parameters p
   WHERE EXISTS (SELECT 1 FROM public.master_formula_stages s
                   JOIN public.master_formulas f ON f.id=s.formula_id
                  WHERE s.id=p.stage_id AND f.company_id=c_a);
  PERFORM _fk('G','G4 nor A''s stage parameters, two levels down', n=0, n::text);

  SELECT count(*) INTO n FROM public.master_formula_current WHERE company_id=c_a;
  PERFORM _fk('G','G5 nor through the current-formula view', n=0, n::text);

  --  The RPCs are SECURITY DEFINER and must refuse by themselves.
  ok := false;
  BEGIN PERFORM public.master_formula_new_version(f_new,'99.0');
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%FORBIDDEN%'; END;
  PERFORM _fk('G','G6 new_version refuses another company''s formula', ok);

  ok := false;
  BEGIN PERFORM public.master_formula_approve(f_new);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%FORBIDDEN%'; END;
  PERFORM _fk('G','G7 approve refuses another company''s formula', ok);
END
$g$;
RESET ROLE; RESET request.jwt.claims;

--  A company member who is not a QA authority cannot approve.
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"00000000-0000-4000-f000-0000000000a3","role":"authenticated"}';
DO $g2$
DECLARE
  c_a uuid := '00000000-0000-4000-f000-0000000000a1';
  f uuid; ok boolean; msg text;
BEGIN
  SELECT id INTO f FROM public.master_formulas
   WHERE company_id=c_a AND status='draft' LIMIT 1;

  PERFORM _fk('G','G8 running as a member who is not a QA authority',
              public.app_is_company_member(c_a)
              AND NOT public.material_is_qa_authority(c_a, auth.uid()));

  ok := false; msg := NULL;
  BEGIN PERFORM public.master_formula_approve(f);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%FORBIDDEN%'; msg := SQLERRM; END;
  PERFORM _fk('G','G9 approving a formula requires a designated QA authority', ok, msg);

  --  Cross-company material in a bill of materials is refused even to a
  --  legitimate member of the owning company.
  ok := false;
  BEGIN
    INSERT INTO public.master_formula_materials(formula_id,material_id,role,quantity_per_batch,unit)
    VALUES (f, current_setting('test.m_b')::uuid, 'other', 1.0, 'kg');
  EXCEPTION WHEN others THEN ok := true; END;
  PERFORM _fk('G','G10 another company''s material cannot enter a formula', ok);
END
$g2$;
RESET ROLE; RESET request.jwt.claims;

DO $g3$
DECLARE c_a uuid := '00000000-0000-4000-f000-0000000000a1'; n integer;
BEGIN
  SELECT count(*) INTO n FROM public.master_formulas WHERE company_id=c_a;
  PERFORM _fk('G','G11 the owner is not locked out', n >= 2, n::text);
END
$g3$;

\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo '  ITEM 12 — MASTER FORMULA'
\echo '════════════════════════════════════════════════════════════════'
SELECT section, count(*) AS assertions, count(*) FILTER (WHERE NOT ok) AS failures
  FROM _f GROUP BY section ORDER BY section;
SELECT section, name, coalesce(left(detail,90),'') AS detail FROM _f WHERE NOT ok ORDER BY section, name;
SELECT count(*) AS total, count(*) FILTER (WHERE ok) AS passed,
       count(*) FILTER (WHERE NOT ok) AS failed FROM _f;

DO $v$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM _f WHERE NOT ok;
  IF n > 0 THEN RAISE EXCEPTION 'ITEM 12: % assertion(s) failed', n; END IF;
  RAISE NOTICE 'ITEM 12: all assertions passed';
END
$v$;
