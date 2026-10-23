-- =====================================================================
--  WEEK 4 / ITEM 07 — BATCH RECORD AND STAGES
--
--  The brief's NOT DONE IF clauses are the spine of this suite, because
--  each one names a way the feature can look finished and not be:
--
--    "A status column on batch_records instead of the lifecycle engine."
--    "Sequence enforced in the interface only."
--    "The same user can sign as operator and as verifier."
--    "A correction overwrites the original value."
--    "Closing a batch does not lock it."
--
--  Sections:
--    A. Initiation, and the formula a batch is built from
--    B. State lives in the engine; status is a mirror nobody can write
--    C. Sequence is enforced in the database
--    D. Completion requires the operator's own signature
--    E. The verifier is a second person
--    F. Readings carry the formula's limits, not the caller's
--    G. A correction never overwrites
--    H. Reopening is itself recorded
--    I. Closure locks permanently
--    J. Tenancy
--
--  WHY THE FIXTURES ARE RANDOM
--  ---------------------------
--  batch_stage_corrections refuses DELETE by design — a correction log
--  that can be emptied is not a correction log — and its foreign key to
--  batch_stages is ON DELETE RESTRICT, so a run's stages cannot be
--  cleaned up either. Rather than fight that (or worse, weaken it so the
--  test can tidy), every run invents its own company, users, product and
--  formula. Nothing is shared between runs, so nothing needs deleting
--  and the counts in section J stay exact.
-- =====================================================================
\set ON_ERROR_STOP on
SET client_min_messages = warning;

--  RELEASING A BATCH NOW NEEDS TWO THINGS IT DID NOT NEED BEFORE
--  (20261107000000): PM-03's electronic signature, and a finished-
--  product test result for the QC gate to read. Neither is what this
--  suite is testing, so both are supplied here rather than at each
--  call site — and supplied for real, through the same columns the
--  product uses, so these assertions still exercise the gate they
--  were written for instead of stopping at the one in front of it.
--
--  tested_by is left NULL deliberately: the release gate refuses a
--  releaser who recorded the results themselves, and this helper is
--  not here to walk into that.
CREATE OR REPLACE FUNCTION _release_batch(p_batch uuid, p_company uuid, p_actor uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_sig uuid; v_prod uuid; v_spec uuid; v_mfg date;
BEGIN
  --  A GOVERNING SPECIFICATION, because 20261113000000 refuses to
  --  release a batch without one. Built the way the product does —
  --  draft, tests, then effective — so the freeze and immutability
  --  triggers are met rather than side-stepped. Dated the day before
  --  manufacture so it is in force when the batch was made.
  SELECT product_id, manufacturing_date INTO v_prod, v_mfg
    FROM public.batch_records WHERE id = p_batch;

  IF v_prod IS NOT NULL AND public.batch_governing_specification(p_batch) IS NULL THEN
    INSERT INTO public.product_specifications
      (company_id, product_id, version, status, created_by)
    VALUES (p_company, v_prod, 'FIX-' || substr(md5(random()::text), 1, 8), 'draft', p_actor)
    RETURNING id INTO v_spec;

    INSERT INTO public.product_specification_tests
      (specification_id, test_name, limit_type, min_value, max_value, unit, is_required)
    VALUES (v_spec, 'Assay', 'range', 98, 102, '%', true);

    UPDATE public.product_specifications
       SET status = 'effective', approved_by = p_actor, approved_at = now(),
           --  No signer: this is a service-context fixture, and
           --  20261117000000 demands either a signature or an explicit
           --  statement that there was nobody to take one from.
           approved_by_role = 'service',
           effective_date = v_mfg - 1
     WHERE id = v_spec;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.batch_qc_results WHERE batch_id = p_batch) THEN
    INSERT INTO public.batch_qc_results
      (batch_id, test_name, test_method, specification, result, pass, tested_by)
    VALUES (p_batch, 'Assay', 'HPLC', '98.0 - 102.0 %', '99.4 %', true, NULL);
  END IF;

  INSERT INTO public.electronic_signatures (
    company_id, signer_id, signer_name, signer_email,
    entity_type, entity_id, action, meaning, record_hash, signed_state
  ) VALUES (
    p_company, p_actor, 'Suite Fixture', 'fixture@test.invalid',
    'batch_record', p_batch, 'release', 'released',
    public.electronic_signature_record_hash('batch_record', p_batch, p_company),
    'qc_in_progress'
  ) RETURNING id INTO v_sig;

  PERFORM public.lifecycle_transition('batch_record', p_batch, 'release',
    p_company, p_actor, NULL, '{}'::jsonb, v_sig);
END $$;


CREATE TEMP TABLE _b7(section text, name text, ok boolean, detail text);
GRANT ALL ON _b7 TO anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION _b7k(p_section text, p_name text, p_ok boolean, p_detail text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO _b7 VALUES (p_section,p_name,coalesce(p_ok,false),p_detail); END $$;

--  The signing subsystem needs extensions.crypt and
--  auth.users.encrypted_password. Both exist on Supabase; scaffolded
--  here if this cluster's auth stub lacks them, as the other
--  signature-using suites do.
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
  c_a uuid := gen_random_uuid();   -- the manufacturer
  c_b uuid := gen_random_uuid();   -- somebody else entirely
  u_op uuid := gen_random_uuid();  -- operator
  u_vf uuid := gen_random_uuid();  -- verifier, a different person
  --  An owner of the SAME company. batch_records' RLS only lets an owner
  --  or admin UPDATE the table at all, so without this user the "a
  --  direct write to status is refused" probes below would be refused by
  --  RLS before any trigger ran — they would pass while proving nothing
  --  about the mirror. An earlier version of this suite did exactly
  --  that, and mutation testing caught it.
  u_ad uuid := gen_random_uuid();  -- owner of the manufacturer
  u_b  uuid := gen_random_uuid();  -- the other company's admin
  tag text := substr(replace(gen_random_uuid()::text,'-',''),1,8);
  p_a uuid; p_other uuid; p_unreg uuid; m_api uuid; f uuid; f_draft uuid;
  s1 uuid; s2 uuid; s3 uuid;
BEGIN
  PERFORM set_config('b7.c_a', c_a::text, false);
  PERFORM set_config('b7.c_b', c_b::text, false);
  PERFORM set_config('b7.u_op', u_op::text, false);
  PERFORM set_config('b7.u_vf', u_vf::text, false);
  PERFORM set_config('b7.u_ad', u_ad::text, false);
  PERFORM set_config('b7.u_b',  u_b::text,  false);

  INSERT INTO public.companies(id,name) VALUES
    (c_a,'Item07 Manufacturing '||tag), (c_b,'Item07 Elsewhere '||tag);

  INSERT INTO auth.users(id,email) VALUES
    (u_op,'op-'||tag||'@item07.test'),
    (u_vf,'vf-'||tag||'@item07.test'),
    (u_ad,'ad-'||tag||'@item07.test'),
    (u_b ,'b-' ||tag||'@item07.test');
  --  Real bcrypt: every signature below goes through the same credential
  --  challenge an operator on the floor would.
  UPDATE auth.users SET encrypted_password = extensions.crypt('CorrectHorse1!', extensions.gen_salt('bf'))
   WHERE id IN (u_op,u_vf,u_ad,u_b);

  INSERT INTO public.profiles(id,email,full_name,company_id,role) VALUES
    (u_op,'op-'||tag||'@item07.test','Ngozi Operator',c_a,'content_creator'),
    (u_vf,'vf-'||tag||'@item07.test','Tunde Verifier',c_a,'compliance_officer'),
    (u_ad,'ad-'||tag||'@item07.test','Amaka Owner',   c_a,'admin'),
    (u_b ,'b-' ||tag||'@item07.test','Far Away',      c_b,'admin');

  INSERT INTO public.company_members(company_id,user_id,role,status) VALUES
    (c_a,u_op,'member','active'),(c_a,u_vf,'member','active'),
    (c_a,u_ad,'owner','active'),(c_b,u_b,'owner','active');

  --  Three products, because item 07's initiation preconditions need
  --  something to be true and false about:
  --    p_a      registered, with an approved formula — the happy path
  --    p_other  registered, with a DRAFT formula only
  --    p_unreg  left at 'concept', never registered
  --  p_a and p_other are walked to 'registered' below; the registry's
  --  status column is itself engine-backed and refuses a direct write.
  INSERT INTO public.products(id,company_id,product_code,trade_name,generic_name,category,created_by)
  VALUES (gen_random_uuid(),c_a,'ITEM07-'||tag,'Syrup Seven','Paracetamol','drug_pharmaceutical',u_op)
  RETURNING id INTO p_a;
  INSERT INTO public.products(id,company_id,product_code,trade_name,category,created_by)
  VALUES (gen_random_uuid(),c_a,'ITEM07B-'||tag,'Other Seven','drug_pharmaceutical',u_op)
  RETURNING id INTO p_other;
  INSERT INTO public.products(id,company_id,product_code,trade_name,category,created_by)
  VALUES (gen_random_uuid(),c_a,'ITEM07U-'||tag,'Unregistered Seven','drug_pharmaceutical',u_op)
  RETURNING id INTO p_unreg;
  PERFORM set_config('b7.p_a', p_a::text, false);
  PERFORM set_config('b7.p_other', p_other::text, false);
  PERFORM set_config('b7.p_unreg', p_unreg::text, false);

  INSERT INTO public.materials(company_id,code,name,material_type,criticality,unit_of_measure,created_by)
  VALUES (c_a,'API-'||tag,'Paracetamol powder','active_ingredient','critical','kg',u_op)
  RETURNING id INTO m_api;

  --  Three stages, so "sequence" has something to be out of, and the
  --  middle one requires a second person — which is what makes section
  --  E about a rule and not about a single row.
  INSERT INTO public.master_formulas(company_id,product_id,version,batch_size,batch_size_unit,created_by)
  VALUES (c_a,p_a,'1.0',1000,'litres',u_op) RETURNING id INTO f;

  INSERT INTO public.master_formula_materials(formula_id,material_id,role,quantity_per_batch,unit)
  VALUES (f,m_api,'active',24.0,'kg');

  INSERT INTO public.master_formula_stages(formula_id,sequence_no,stage_code,name,requires_signoff)
  VALUES (f,1,'DISP','Dispensing',false) RETURNING id INTO s1;
  INSERT INTO public.master_formula_stages(formula_id,sequence_no,stage_code,name,requires_signoff)
  VALUES (f,2,'MIX','Mixing',true) RETURNING id INTO s2;
  INSERT INTO public.master_formula_stages(formula_id,sequence_no,stage_code,name,requires_signoff)
  VALUES (f,3,'FILL','Filling',false) RETURNING id INTO s3;

  --  A machine setting and two product attributes, so the type is
  --  something the readings carry rather than something they assume.
  INSERT INTO public.master_formula_stage_parameters
    (stage_id,parameter,parameter_type,unit,target_value,min_value,max_value,is_critical,sort_order)
  VALUES (s2,'Mixing speed','machine_setting','rpm',120,100,140,false,10),
         (s2,'Viscosity','product_attribute','cP',450,400,500,true,20);
  --  No limits on this one: "unknown" has to stay unknown rather than
  --  quietly becoming "in specification".
  INSERT INTO public.master_formula_stage_parameters
    (stage_id,parameter,parameter_type,target_text,is_critical,sort_order)
  VALUES (s2,'Appearance','machine_setting','Clear amber',false,30);
  --  A parameter belonging to a DIFFERENT stage, for F5.
  INSERT INTO public.master_formula_stage_parameters
    (stage_id,parameter,parameter_type,unit,target_value,min_value,max_value,is_critical,sort_order)
  VALUES (s1,'Dispensed weight','product_attribute','kg',24,23.8,24.2,true,10);

  PERFORM set_config('b7.f', f::text, false);
  PERFORM set_config('b7.fs2', s2::text, false);

  --  A second, unapproved formula for the same company but the other
  --  product, so A7 probes a draft rather than a nonexistent formula.
  INSERT INTO public.master_formulas(company_id,product_id,version,batch_size,batch_size_unit,created_by)
  VALUES (c_a,p_other,'0.1',1000,'litres',u_op) RETURNING id INTO f_draft;
  INSERT INTO public.master_formula_materials(formula_id,material_id,role,quantity_per_batch,unit)
  VALUES (f_draft,m_api,'active',24.0,'kg');
  INSERT INTO public.master_formula_stages(formula_id,sequence_no,stage_code,name)
  VALUES (f_draft,1,'ONE','Only stage');
  PERFORM set_config('b7.f_draft', f_draft::text, false);
END
$fx$;

--  Registration and approval both run as a member, because the registry
--  and master_formula_approve() check membership rather than trusting the
--  caller.
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('b7.u_ad'), 'role','authenticated')::text, false);
SET ROLE authenticated;
DO $register$
DECLARE c_a uuid := current_setting('b7.c_a')::uuid; p uuid;
BEGIN
  FOREACH p IN ARRAY ARRAY[current_setting('b7.p_a')::uuid, current_setting('b7.p_other')::uuid]
  LOOP
    PERFORM public.lifecycle_transition('product', p, 'start_regulatory_prep', c_a);
    PERFORM public.lifecycle_transition('product', p, 'submit_to_regulator',   c_a);
    PERFORM public.lifecycle_transition('product', p, 'record_registration',   c_a, NULL,
                                        'NAFDAC listing granted');
  END LOOP;
END
$register$;
DO $approve$
BEGIN
  PERFORM public.master_formula_approve(current_setting('b7.f')::uuid);
END
$approve$;
RESET ROLE;

DO $fxcheck$
BEGIN
  IF (SELECT status FROM public.master_formulas WHERE id=current_setting('b7.f')::uuid) <> 'approved' THEN
    RAISE EXCEPTION 'FIXTURE: the formula should be approved before any batch is initiated';
  END IF;
  IF NOT public.product_is_release_eligible(current_setting('b7.p_a')::uuid) THEN
    RAISE EXCEPTION 'FIXTURE: p_a should be registered before any batch is initiated';
  END IF;
  IF public.product_is_release_eligible(current_setting('b7.p_unreg')::uuid) THEN
    RAISE EXCEPTION 'FIXTURE: p_unreg must NOT be registered, or sections A12 and A15 prove nothing';
  END IF;
END
$fxcheck$;


-- =====================================================================
--  A — initiation, and the formula a batch is built from
-- =====================================================================
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('b7.u_op'), 'role','authenticated')::text, false);
SET ROLE authenticated;

DO $a$
DECLARE
  c_a uuid := current_setting('b7.c_a')::uuid;
  res jsonb; b uuid; ok boolean; msg text; n integer;
BEGIN
  res := public.batch_record_initiate(
           c_a,'B7-0001',current_setting('b7.p_a')::uuid,
           current_date, current_date + 730, 1000,'litres','Acme Pharmacies Ltd');
  b := (res->>'batch_id')::uuid;
  PERFORM set_config('b7.b', b::text, false);

  PERFORM _b7k('A','A1 a batch can be initiated', b IS NOT NULL, coalesce(res::text,'NULL'));

  PERFORM _b7k('A','A2 it starts in the engine''s initial state, in_progress',
    (SELECT s.state_key FROM public.entity_current_state ecs
       JOIN public.lifecycle_states s ON s.id=ecs.state_id
      WHERE ecs.entity_type='batch_record' AND ecs.entity_id=b) = 'in_progress',
    (SELECT s.state_key FROM public.entity_current_state ecs
       JOIN public.lifecycle_states s ON s.id=ecs.state_id
      WHERE ecs.entity_type='batch_record' AND ecs.entity_id=b));

  SELECT count(*) INTO n FROM public.batch_stages WHERE batch_id=b;
  PERFORM _b7k('A','A3 the formula''s three stages were instantiated', n=3, n||' stage(s)');

  PERFORM _b7k('A','A4 in the formula''s own sequence, with its names',
    (SELECT array_agg(name ORDER BY sequence_no) FROM public.batch_stages WHERE batch_id=b)
      = ARRAY['Dispensing','Mixing','Filling']);

  --  The formula said stage 2 needs a sign-off. The batch stage has to
  --  carry that as a fact about this batch, not look it up later.
  PERFORM _b7k('A','A5 the sign-off requirement was copied from the formula stage',
    (SELECT array_agg(requires_verifier ORDER BY sequence_no)
       FROM public.batch_stages WHERE batch_id=b) = ARRAY[false,true,false]);

  PERFORM _b7k('A','A6 every stage starts pending in the engine',
    (SELECT count(*) FROM public.batch_stages bs
       JOIN public.entity_current_state ecs
         ON ecs.entity_type='batch_stage' AND ecs.entity_id=bs.id
       JOIN public.lifecycle_states s ON s.id=ecs.state_id
      WHERE bs.batch_id=b AND s.state_key='pending') = 3);

  --  "A batch in progress keeps the version it started on."
  PERFORM _b7k('A','A7 the batch records the formula version it was initiated on',
    (SELECT formula_id FROM public.batch_records WHERE id=b) = current_setting('b7.f')::uuid
    AND (res->>'formula_version') = '1.0', coalesce(res->>'formula_version','NULL'));

  --  "A customer field on the batch for contract manufacturing."
  PERFORM _b7k('A','A8 the customer is recorded for contract manufacturing',
    (SELECT customer_name FROM public.batch_records WHERE id=b) = 'Acme Pharmacies Ltd');

  ok := false; msg := NULL;
  BEGIN
    PERFORM public.batch_record_initiate(
      c_a,'B7-DRAFT',current_setting('b7.p_other')::uuid,
      current_date, current_date + 730, 1000,'litres',NULL,
      current_setting('b7.f_draft')::uuid);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'BATCH_FORMULA_NOT_APPROVED%'; msg := SQLERRM; END;
  PERFORM _b7k('A','A9 a batch cannot be manufactured to a draft formula', ok, left(coalesce(msg,''),120));

  ok := false; msg := NULL;
  BEGIN
    PERFORM public.batch_record_initiate(
      c_a,'B7-WRONGPROD',current_setting('b7.p_other')::uuid,
      current_date, current_date + 730, 1000,'litres',NULL,
      current_setting('b7.f')::uuid);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'BATCH_FORMULA_WRONG_PRODUCT%'; msg := SQLERRM; END;
  PERFORM _b7k('A','A10 nor to a formula belonging to a different product', ok, left(coalesce(msg,''),120));

  ok := false; msg := NULL;
  BEGIN
    PERFORM public.batch_record_initiate(
      c_a,'',current_setting('b7.p_a')::uuid,
      current_date, current_date + 730, 1000,'litres');
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'BATCH_NO_NUMBER%'; msg := SQLERRM; END;
  PERFORM _b7k('A','A11 a batch record needs a batch number', ok, left(coalesce(msg,''),120));

  --  "Initiation requires an approved formula, a registered product and
  --  an unexpired licence." The licence half is the existing gate, which
  --  d04_d06's integration suite covers. These two are item 07's.
  ok := false; msg := NULL;
  BEGIN
    PERFORM public.batch_record_initiate(
      c_a,'B7-UNREG',current_setting('b7.p_unreg')::uuid,
      current_date, current_date + 730, 1000,'litres');
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'BATCH_PRODUCT_NOT_REGISTERED%'; msg := SQLERRM; END;
  PERFORM _b7k('A','A12 initiation requires a registered product', ok, left(coalesce(msg,''),140));

  --  p_other is registered but has only a draft formula, so resolving
  --  "the approved formula for this product" finds nothing. That is a
  --  different refusal from A9, which names a draft explicitly.
  ok := false; msg := NULL;
  BEGIN
    PERFORM public.batch_record_initiate(
      c_a,'B7-NOFORMULA',current_setting('b7.p_other')::uuid,
      current_date, current_date + 730, 1000,'litres');
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'BATCH_NO_APPROVED_FORMULA%'; msg := SQLERRM; END;
  PERFORM _b7k('A','A13 and an approved formula', ok, left(coalesce(msg,''),140));

  PERFORM _b7k('A','A14 neither refusal left a batch behind',
    NOT EXISTS (SELECT 1 FROM public.batch_records
                 WHERE company_id=c_a AND batch_number IN ('B7-UNREG','B7-NOFORMULA')));
END
$a$;

--  THE DELIBERATE RESIDUE, asserted rather than left as a claim.
--
--  The registered-product precondition is on the RPC and not on the
--  table, because a validation batch is manufactured BEFORE registration
--  — the dossier NAFDAC registers is built from batches already made — so
--  a pre-registration batch has to be recordable. What must NOT be
--  possible is releasing it, and that control is in the database.
DO $a2$
DECLARE
  c_a uuid := current_setting('b7.c_a')::uuid;
  b uuid; ok boolean; msg text;
BEGIN
  INSERT INTO public.batch_records
    (company_id,batch_number,product_name,product_id,manufacturing_date,expiry_date,batch_size,created_by)
  VALUES (c_a,'B7-VALIDATION','Unregistered Seven',current_setting('b7.p_unreg')::uuid,
          current_date,current_date+365,10,current_setting('b7.u_op')::uuid)
  RETURNING id INTO b;
  PERFORM _b7k('A','A15 a pre-registration validation batch can still be recorded',
    b IS NOT NULL);

  PERFORM public.lifecycle_transition('batch_record', b, 'close_execution', c_a, current_setting('b7.u_op')::uuid);
  PERFORM public.lifecycle_transition('batch_record', b, 'submit_for_qc',   c_a, current_setting('b7.u_op')::uuid);
  PERFORM public.lifecycle_transition('batch_record', b, 'start_qc',        c_a, current_setting('b7.u_op')::uuid);

  ok := false; msg := NULL;
  BEGIN
    PERFORM _release_batch(b, c_a, current_setting('b7.u_op')::uuid);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'BATCH_PRODUCT_NOT_ELIGIBLE%'; msg := SQLERRM; END;
  PERFORM _b7k('A','A16 but it cannot be released, which is the control that matters',
    ok, left(coalesce(msg,''),140));

  --  And the table still refuses a formula reference that cannot be
  --  trusted, whatever path the insert comes in by.
  ok := false; msg := NULL;
  BEGIN
    INSERT INTO public.batch_records
      (company_id,batch_number,product_name,product_id,formula_id,
       manufacturing_date,expiry_date,batch_size,created_by)
    VALUES (c_a,'B7-DRAFTREF','Other Seven',current_setting('b7.p_other')::uuid,
            current_setting('b7.f_draft')::uuid,
            current_date,current_date+365,10,current_setting('b7.u_op')::uuid);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'BATCH_FORMULA_NOT_APPROVED%'; msg := SQLERRM; END;
  PERFORM _b7k('A','A17 a direct insert cannot point a batch at a draft formula',
    ok, left(coalesce(msg,''),140));

  ok := false; msg := NULL;
  BEGIN
    INSERT INTO public.batch_records
      (company_id,batch_number,product_name,product_id,formula_id,
       manufacturing_date,expiry_date,batch_size,created_by)
    VALUES (c_a,'B7-WRONGREF','Other Seven',current_setting('b7.p_other')::uuid,
            current_setting('b7.f')::uuid,
            current_date,current_date+365,10,current_setting('b7.u_op')::uuid);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'BATCH_FORMULA_WRONG_PRODUCT%'; msg := SQLERRM; END;
  PERFORM _b7k('A','A18 nor at another product''s formula',
    ok, left(coalesce(msg,''),140));
END
$a2$;


-- =====================================================================
--  B — state lives in the engine; status is a mirror nobody can write
--
--  The NOT DONE IF: "A status column on batch_records instead of the
--  lifecycle engine."
-- =====================================================================
DO $b$
DECLARE
  b uuid := current_setting('b7.b')::uuid;
  st uuid; ok boolean; msg text;
BEGIN
  SELECT id INTO st FROM public.batch_stages WHERE batch_id=b AND sequence_no=1;

  PERFORM _b7k('B','B1 the batch''s status column mirrors the engine''s state',
    (SELECT status FROM public.batch_records WHERE id=b) = 'in_progress',
    (SELECT status FROM public.batch_records WHERE id=b));

  ok := false; msg := NULL;
  BEGIN UPDATE public.batch_stages SET status='complete' WHERE id=st;
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'BATCH_STAGE_STATUS_READ_ONLY%'; msg := SQLERRM; END;
  PERFORM _b7k('B','B3 a direct write to batch_stages.status is refused', ok, left(coalesce(msg,''),120));

  --  The mirror is not decorative: it follows the engine.
  PERFORM public.batch_stage_start(st);
  PERFORM _b7k('B','B4 the stage mirror follows a transition',
    (SELECT status FROM public.batch_stages WHERE id=st) = 'in_progress',
    (SELECT status FROM public.batch_stages WHERE id=st));

  PERFORM _b7k('B','B6 every batch record in this company has an engine state row',
    NOT EXISTS (
      SELECT 1 FROM public.batch_records br
       WHERE br.company_id = current_setting('b7.c_a')::uuid
         AND NOT EXISTS (SELECT 1 FROM public.entity_current_state ecs
                          WHERE ecs.entity_type='batch_record' AND ecs.entity_id=br.id)));
END
$b$;

--  As the OWNER, who is the only kind of member batch_records' RLS lets
--  UPDATE the table. Running this as the operator would be refused by
--  RLS before the guard trigger was reached, which is a pass that proves
--  nothing — the point is that not even an owner can write the mirror.
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('b7.u_ad'), 'role','authenticated')::text, false);
DO $b2$
DECLARE
  b uuid := current_setting('b7.b')::uuid;
  n integer; ok boolean; msg text;
BEGIN
  --  First prove the writer really can update this row, so the refusal
  --  below is the trigger's and not RLS's.
  UPDATE public.batch_records SET release_notes='owner can write this row' WHERE id=b;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM _b7k('B','B2a the owner can update the batch row at all', n=1, n||' row(s)');

  ok := false; msg := NULL;
  BEGIN UPDATE public.batch_records SET status='released' WHERE id=b;
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'BATCH_STATUS_READ_ONLY%'; msg := SQLERRM; END;
  PERFORM _b7k('B','B2b but not even the owner can write batch_records.status',
    ok, left(coalesce(msg,''),120));

  PERFORM _b7k('B','B5 and the refused write left the batch where it was',
    (SELECT status FROM public.batch_records WHERE id=b) = 'in_progress',
    (SELECT status FROM public.batch_records WHERE id=b));
END
$b2$;

SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('b7.u_op'), 'role','authenticated')::text, false);


-- =====================================================================
--  C — sequence is enforced in the database
--
--  The NOT DONE IF: "Sequence enforced in the interface only."
-- =====================================================================
DO $c$
DECLARE
  b uuid := current_setting('b7.b')::uuid;
  s1 uuid; s2 uuid; s3 uuid; ok boolean; msg text;
BEGIN
  SELECT id INTO s1 FROM public.batch_stages WHERE batch_id=b AND sequence_no=1;
  SELECT id INTO s2 FROM public.batch_stages WHERE batch_id=b AND sequence_no=2;
  SELECT id INTO s3 FROM public.batch_stages WHERE batch_id=b AND sequence_no=3;

  --  Stage 1 is in_progress from section B, so 2 is blocked and 3 is
  --  blocked twice over.
  ok := false; msg := NULL;
  BEGIN PERFORM public.batch_stage_start(s2);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'BATCH_STAGE_OUT_OF_SEQUENCE%'; msg := SQLERRM; END;
  PERFORM _b7k('C','C1 stage 2 cannot start while stage 1 is unfinished', ok, left(coalesce(msg,''),140));

  PERFORM _b7k('C','C2 the refusal names the stage that is blocking and why',
    msg LIKE '%stage 1%' AND msg LIKE '%Dispensing%' AND msg LIKE '%in_progress%',
    left(coalesce(msg,''),140));

  ok := false; msg := NULL;
  BEGIN PERFORM public.batch_stage_start(s3);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'BATCH_STAGE_OUT_OF_SEQUENCE%'; msg := SQLERRM; END;
  PERFORM _b7k('C','C3 and the refusal points at the EARLIEST blocker, not the nearest',
    ok AND msg LIKE '%Dispensing%', left(coalesce(msg,''),140));

  PERFORM _b7k('C','C4 nothing was started by the refusals',
    (SELECT count(*) FROM public.batch_stages
      WHERE batch_id=b AND sequence_no>1 AND started_at IS NOT NULL) = 0);

  PERFORM _b7k('C','C5 starting records who and when',
    (SELECT started_at IS NOT NULL AND started_by = current_setting('b7.u_op')::uuid
       FROM public.batch_stages WHERE id=s1));

  --  Restarting a stage that is already running is not a no-op dressed
  --  up as success: the engine has no such transition.
  ok := false; msg := NULL;
  BEGIN PERFORM public.batch_stage_start(s1);
  EXCEPTION WHEN others THEN ok := true; msg := SQLERRM; END;
  PERFORM _b7k('C','C6 a stage already in progress cannot be started again', ok, left(coalesce(msg,''),120));
END
$c$;


-- =====================================================================
--  D — completion requires the operator's own signature
-- =====================================================================
DO $d$
DECLARE
  b uuid := current_setting('b7.b')::uuid;
  c_a uuid := current_setting('b7.c_a')::uuid;
  s1 uuid; r jsonb; sig uuid; ok boolean; msg text;
BEGIN
  SELECT id INTO s1 FROM public.batch_stages WHERE batch_id=b AND sequence_no=1;

  ok := false; msg := NULL;
  BEGIN PERFORM public.batch_stage_complete(s1, NULL);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%SIGNATURE_REQUIRED%'; msg := SQLERRM; END;
  PERFORM _b7k('D','D1 a stage cannot be completed without a signature', ok, left(coalesce(msg,''),120));

  PERFORM _b7k('D','D2 and the refusal left the stage running',
    (SELECT status FROM public.batch_stages WHERE id=s1) = 'in_progress');

  --  The real signature, taken as the operator against this stage and
  --  this action. Anything looser would not be a signature.
  r := public.sign_electronic_record(c_a,'batch_stage',s1,'complete',
         'authored','CorrectHorse1!');
  PERFORM _b7k('D','D3 the operator can sign the completion',
    (r->>'ok')='true', coalesce(r::text,'NULL'));
  sig := (r->>'signature_id')::uuid;

  r := public.sign_electronic_record(c_a,'batch_stage',s1,'complete',
         'authored','NotMyPassword9!');
  PERFORM _b7k('D','D4 a wrong password yields no signature',
    (r->>'ok')='false' AND (r->>'code')='E_SIGNATURE_BAD_CREDENTIAL', coalesce(r::text,'NULL'));

  PERFORM public.batch_stage_complete(s1, sig);
  PERFORM _b7k('D','D5 with a genuine signature the stage completes',
    (SELECT status FROM public.batch_stages WHERE id=s1) = 'complete',
    (SELECT status FROM public.batch_stages WHERE id=s1));

  PERFORM _b7k('D','D6 the signature and the operator are recorded on the stage',
    (SELECT operator_id = current_setting('b7.u_op')::uuid
        AND operator_signature_id = sig
        AND completed_at IS NOT NULL
       FROM public.batch_stages WHERE id=s1));

  PERFORM set_config('b7.sig_s1', sig::text, false);

  --  And now stage 2 can start, which is the other half of section C's
  --  rule: the sequence opens as stages close.
  PERFORM public.batch_stage_start(
    (SELECT id FROM public.batch_stages WHERE batch_id=b AND sequence_no=2));
  PERFORM _b7k('D','D8 completing stage 1 unblocks stage 2',
    (SELECT status FROM public.batch_stages WHERE batch_id=b AND sequence_no=2) = 'in_progress');
END
$d$;


--  electronic_signature_consumptions carries RLS with no policies at
--  all, deliberately: the chain is evidence for an auditor reading the
--  database, not data for the application. So the spend is asserted
--  outside the authenticated role rather than by weakening that.
RESET ROLE;
DO $d2$
BEGIN
  PERFORM _b7k('D','D7 the signature is spent',
    EXISTS (SELECT 1 FROM public.electronic_signature_consumptions
             WHERE signature_id = current_setting('b7.sig_s1')::uuid));
END
$d2$;
SET ROLE authenticated;


-- =====================================================================
--  E — the verifier is a second person
--
--  The NOT DONE IF: "The same user can sign as operator and as
--  verifier."
-- =====================================================================
DO $e$
DECLARE
  b uuid := current_setting('b7.b')::uuid;
  c_a uuid := current_setting('b7.c_a')::uuid;
  s2 uuid; r jsonb; sig_op uuid; ok boolean; msg text;
BEGIN
  SELECT id INTO s2 FROM public.batch_stages WHERE batch_id=b AND sequence_no=2;

  r := public.sign_electronic_record(c_a,'batch_stage',s2,'complete',
         'authored','CorrectHorse1!');
  sig_op := (r->>'signature_id')::uuid;
  PERFORM _b7k('E','E1 the operator signs the verified stage too',
    (r->>'ok')='true', coalesce(r::text,'NULL'));

  ok := false; msg := NULL;
  BEGIN PERFORM public.batch_stage_complete(s2, sig_op);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'BATCH_STAGE_VERIFIER_REQUIRED%'; msg := SQLERRM; END;
  PERFORM _b7k('E','E2 a stage that requires verification will not complete without one',
    ok, left(coalesce(msg,''),140));

  --  The operator naming themselves as the verifier.
  ok := false; msg := NULL;
  BEGIN PERFORM public.batch_stage_complete(s2, sig_op,
          current_setting('b7.u_op')::uuid, sig_op);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'BATCH_STAGE_SELF_VERIFIED%'; msg := SQLERRM; END;
  PERFORM _b7k('E','E3 the operator cannot also be the verifier', ok, left(coalesce(msg,''),140));

  --  A verifier named without their own signature.
  ok := false; msg := NULL;
  BEGIN PERFORM public.batch_stage_complete(s2, sig_op,
          current_setting('b7.u_vf')::uuid, NULL);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'BATCH_STAGE_VERIFIER_REQUIRED%'; msg := SQLERRM; END;
  PERFORM _b7k('E','E4 naming a verifier is not the same as their signing', ok, left(coalesce(msg,''),140));

  --  The operator's own signature offered AS the verifier's.
  ok := false; msg := NULL;
  BEGIN PERFORM public.batch_stage_complete(s2, sig_op,
          current_setting('b7.u_vf')::uuid, sig_op);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'BATCH_STAGE_VERIFIER_SIGNATURE_MISMATCH%'; msg := SQLERRM; END;
  PERFORM _b7k('E','E5 a signature given by somebody else is not the verifier''s',
    ok, left(coalesce(msg,''),140));

  PERFORM _b7k('E','E6 none of the refusals completed the stage',
    (SELECT status FROM public.batch_stages WHERE id=s2) = 'in_progress',
    (SELECT status FROM public.batch_stages WHERE id=s2));

  PERFORM set_config('b7.sig_op_s2', sig_op::text, false);
END
$e$;

--  The verifier signs as themselves, which means being themselves.
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('b7.u_vf'), 'role','authenticated')::text, false);
DO $e2$
DECLARE
  b uuid := current_setting('b7.b')::uuid;
  c_a uuid := current_setting('b7.c_a')::uuid;
  s2 uuid; r jsonb;
BEGIN
  SELECT id INTO s2 FROM public.batch_stages WHERE batch_id=b AND sequence_no=2;
  r := public.sign_electronic_record(c_a,'batch_stage',s2,'complete',
         'verified','CorrectHorse1!');
  PERFORM _b7k('E','E7 the verifier signs under their own credential',
    (r->>'ok')='true', coalesce(r::text,'NULL'));
  PERFORM set_config('b7.sig_vf_s2', (r->>'signature_id'), false);
END
$e2$;

--  Back to the operator: the operator completes, carrying the verifier's
--  signature. Completing AS the verifier would be the same failure the
--  section exists to prevent, one step along.
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('b7.u_op'), 'role','authenticated')::text, false);
DO $e3$
DECLARE
  b uuid := current_setting('b7.b')::uuid;
  s2 uuid; ok boolean; msg text;
BEGIN
  SELECT id INTO s2 FROM public.batch_stages WHERE batch_id=b AND sequence_no=2;

  PERFORM public.batch_stage_complete(s2,
    current_setting('b7.sig_op_s2')::uuid,
    current_setting('b7.u_vf')::uuid,
    current_setting('b7.sig_vf_s2')::uuid);

  PERFORM _b7k('E','E8 operator plus a genuine second signature completes the stage',
    (SELECT status FROM public.batch_stages WHERE id=s2) = 'complete',
    (SELECT status FROM public.batch_stages WHERE id=s2));

  PERFORM _b7k('E','E9 both people and both signatures are on the record',
    (SELECT operator_id = current_setting('b7.u_op')::uuid
        AND verifier_id = current_setting('b7.u_vf')::uuid
        AND operator_signature_id IS NOT NULL
        AND verifier_signature_id IS NOT NULL
       FROM public.batch_stages WHERE id=s2));

  --  §11.50(a)(2): a signature has to say what signing MEANT. Two
  --  signatures on one stage that both said the same thing would be a
  --  countersignature, not a verification.
  PERFORM _b7k('E','E9a the two signatures carry different meanings',
    (SELECT es_op.meaning='authored' AND es_vf.meaning='verified'
       FROM public.batch_stages bs
       JOIN public.electronic_signatures es_op ON es_op.id=bs.operator_signature_id
       JOIN public.electronic_signatures es_vf ON es_vf.id=bs.verifier_signature_id
      WHERE bs.id=s2));

  --  The table constraint is the backstop: the RPC is one way in, and a
  --  rule that only lives there is a rule a direct UPDATE walks around.
  ok := false; msg := NULL;
  BEGIN
    UPDATE public.batch_stages
       SET verifier_id = operator_id
     WHERE id=s2;
  EXCEPTION WHEN others THEN ok := true; msg := SQLERRM; END;
  PERFORM _b7k('E','E10 a direct UPDATE cannot make a stage self-verified either',
    ok, left(coalesce(msg,''),140));
END
$e3$;


-- =====================================================================
--  F — readings carry the formula's limits, not the caller's
-- =====================================================================
DO $f$
DECLARE
  b uuid := current_setting('b7.b')::uuid;
  s2 uuid; s3 uuid; p_visc uuid; p_speed uuid; p_appear uuid; p_other uuid;
  r jsonb; rid uuid; ok boolean; msg text;
BEGIN
  SELECT id INTO s2 FROM public.batch_stages WHERE batch_id=b AND sequence_no=2;
  SELECT id INTO s3 FROM public.batch_stages WHERE batch_id=b AND sequence_no=3;

  SELECT id INTO p_visc  FROM public.master_formula_stage_parameters
   WHERE stage_id=current_setting('b7.fs2')::uuid AND parameter='Viscosity';
  SELECT id INTO p_speed FROM public.master_formula_stage_parameters
   WHERE stage_id=current_setting('b7.fs2')::uuid AND parameter='Mixing speed';
  SELECT id INTO p_appear FROM public.master_formula_stage_parameters
   WHERE stage_id=current_setting('b7.fs2')::uuid AND parameter='Appearance';
  SELECT fp.id INTO p_other FROM public.master_formula_stage_parameters fp
    JOIN public.master_formula_stages fs ON fs.id=fp.stage_id
   WHERE fs.formula_id=current_setting('b7.f')::uuid AND fp.parameter='Dispensed weight';

  --  Stage 2 is complete now, so a reading against it is refused: a
  --  number recorded after sign-off is a number nobody signed for.
  ok := false; msg := NULL;
  BEGIN PERFORM public.batch_stage_record_reading(s2, p_visc, 450);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'BATCH_STAGE_NOT_IN_PROGRESS%'; msg := SQLERRM; END;
  PERFORM _b7k('F','F1 a reading cannot be taken against a stage that is not running',
    ok, left(coalesce(msg,''),140));

  --  Reopen it so the rest of the section has a live stage to work on.
  --  Section H asserts what the reopening itself recorded.
  PERFORM public.batch_stage_reopen(s2,'Viscosity reading was not entered before sign-off');

  r := public.batch_stage_record_reading(s2, p_visc, 450);
  rid := (r->>'reading_id')::uuid;
  PERFORM set_config('b7.rid', rid::text, false);

  PERFORM _b7k('F','F2 the limits and the unit came from the formula, not the caller',
    (SELECT min_value=400 AND max_value=500 AND target_value=450 AND unit='cP'
        AND parameter_name='Viscosity'
       FROM public.batch_stage_parameter_readings WHERE id=rid));

  --  "parameter_type decides how out-of-specification is handled", so it
  --  has to travel with the reading rather than be looked up through a
  --  formula that can be superseded.
  PERFORM _b7k('F','F3 and so did the parameter type',
    (SELECT parameter_type='product_attribute'
       FROM public.batch_stage_parameter_readings WHERE id=rid));

  PERFORM _b7k('F','F4 a reading inside the limits is in specification',
    (r->>'in_specification')='true', coalesce(r::text,'NULL'));

  --  Week 4 item 11 added the acknowledgement: an out-of-specification
  --  reading still SAVES — that is item 11's first NOT DONE IF — but the
  --  person entering it has to confirm they have seen the flag. Item 11's
  --  own suite asserts that the save is not blocked and that the refusal
  --  without acknowledgement says so in as many words.
  r := public.batch_stage_record_reading(s2, p_speed, 160, NULL, true);
  PERFORM _b7k('F','F5 a reading outside the limits is not',
    (r->>'in_specification')='false', coalesce(r::text,'NULL'));
  PERFORM _b7k('F','F6 the machine setting is typed as one',
    (SELECT parameter_type='machine_setting'
       FROM public.batch_stage_parameter_readings WHERE id=(r->>'reading_id')::uuid));

  --  No limits means unknown. "In specification" would be a claim the
  --  formula never made.
  r := public.batch_stage_record_reading(s2, p_appear, NULL, 'Clear amber');
  PERFORM _b7k('F','F7 a parameter with no limits records unknown, not pass',
    (r->>'in_specification') IS NULL, coalesce(r::text,'NULL'));

  ok := false; msg := NULL;
  BEGIN PERFORM public.batch_stage_record_reading(s2, p_other, 24);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'BATCH_PARAMETER_WRONG_STAGE%'; msg := SQLERRM; END;
  PERFORM _b7k('F','F8 a reading cannot be filed against another stage''s parameter',
    ok, left(coalesce(msg,''),140));

  ok := false; msg := NULL;
  BEGIN PERFORM public.batch_stage_record_reading(s2, p_visc, NULL, '   ');
  EXCEPTION WHEN others THEN ok := true; msg := SQLERRM; END;
  PERFORM _b7k('F','F9 a reading with no value at all is refused', ok, left(coalesce(msg,''),140));
END
$f$;


-- =====================================================================
--  G — a correction never overwrites
--
--  The NOT DONE IF: "A correction overwrites the original value."
-- =====================================================================
DO $g$
DECLARE
  b uuid := current_setting('b7.b')::uuid;
  rid uuid := current_setting('b7.rid')::uuid;
  s2 uuid; r jsonb; nid uuid; ok boolean; msg text; n integer;
BEGIN
  SELECT id INTO s2 FROM public.batch_stages WHERE batch_id=b AND sequence_no=2;

  ok := false; msg := NULL;
  BEGIN UPDATE public.batch_stage_parameter_readings SET reading_value=470 WHERE id=rid;
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'BATCH_READING_IMMUTABLE%'; msg := SQLERRM; END;
  PERFORM _b7k('G','G1 a recorded reading cannot be overwritten', ok, left(coalesce(msg,''),140));

  ok := false; msg := NULL;
  BEGIN PERFORM public.batch_stage_correct_reading(rid, 470, NULL, '   ');
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'BATCH_CORRECTION_NO_REASON%'; msg := SQLERRM; END;
  PERFORM _b7k('G','G2 a correction without a reason is refused', ok, left(coalesce(msg,''),140));

  r := public.batch_stage_correct_reading(rid, 470, NULL,
         'Transcribed from the wrong line of the logbook');
  nid := (r->>'reading_id')::uuid;

  PERFORM _b7k('G','G3 the correction is a NEW reading pointing at the original',
    nid <> rid AND (SELECT corrected_from_id FROM public.batch_stage_parameter_readings WHERE id=nid) = rid,
    coalesce(r::text,'NULL'));

  PERFORM _b7k('G','G4 the original value is still exactly as it was recorded',
    (SELECT reading_value FROM public.batch_stage_parameter_readings WHERE id=rid) = 450,
    (SELECT reading_value::text FROM public.batch_stage_parameter_readings WHERE id=rid));

  PERFORM _b7k('G','G5 the correction carries the formula''s limits too, and was judged',
    (SELECT min_value=400 AND max_value=500 AND in_specification
       FROM public.batch_stage_parameter_readings WHERE id=nid));

  --  Item 07 asks for all five: who, when, what it was, what it became,
  --  and why.
  PERFORM _b7k('G','G6 the log records who, when, from what, to what and why',
    EXISTS (SELECT 1 FROM public.batch_stage_corrections
             WHERE batch_stage_id=s2
               AND field_name='reading:Viscosity'
               AND original_value='450'
               AND new_value='470'
               AND reason='Transcribed from the wrong line of the logbook'
               AND corrected_by=current_setting('b7.u_op')::uuid
               AND corrected_at IS NOT NULL),
    (SELECT coalesce(original_value,'-')||' -> '||coalesce(new_value,'-')
       FROM public.batch_stage_corrections
      WHERE batch_stage_id=s2 AND field_name='reading:Viscosity' LIMIT 1));

  ok := false; msg := NULL;
  BEGIN PERFORM public.batch_stage_correct_reading(rid, 480, NULL, 'again');
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'BATCH_READING_ALREADY_CORRECTED%'; msg := SQLERRM; END;
  PERFORM _b7k('G','G7 the same reading cannot be corrected twice into two truths',
    ok, left(coalesce(msg,''),140));

  --  A correction log that can be edited is not a correction log. Two
  --  controls stand in the way — the revoked grant and the immutability
  --  trigger — and the grant speaks first, which is why the expected
  --  message is either one. The trigger is asserted on its own below,
  --  where the grant is not in the way.
  ok := false; msg := NULL;
  BEGIN UPDATE public.batch_stage_corrections SET reason='nothing to see' WHERE batch_stage_id=s2;
  EXCEPTION WHEN others THEN
    ok := SQLERRM LIKE 'BATCH_CORRECTION_IMMUTABLE%' OR SQLERRM LIKE 'permission denied%';
    msg := SQLERRM;
  END;
  PERFORM _b7k('G','G8 a correction cannot be edited', ok, left(coalesce(msg,''),140));

  ok := false; msg := NULL;
  BEGIN DELETE FROM public.batch_stage_corrections WHERE batch_stage_id=s2;
  EXCEPTION WHEN others THEN
    ok := SQLERRM LIKE 'BATCH_CORRECTION_IMMUTABLE%' OR SQLERRM LIKE 'permission denied%';
    msg := SQLERRM;
  END;
  PERFORM _b7k('G','G9 nor deleted', ok, left(coalesce(msg,''),140));

  SELECT count(*) INTO n FROM public.batch_stage_corrections WHERE batch_stage_id=s2;
  PERFORM _b7k('G','G10 and the log still holds both the reopening and the correction',
    n=2, n||' entr(y/ies)');
END
$g$;


--  The grant answers first for the application's role, so the trigger
--  behind it is asserted where no grant is in the way. A control that is
--  only ever reached by a path the test never takes is a control nobody
--  has checked.
RESET ROLE;
DO $g2$
DECLARE
  b uuid := current_setting('b7.b')::uuid;
  s2 uuid; ok boolean; msg text; n integer;
BEGIN
  SELECT id INTO s2 FROM public.batch_stages WHERE batch_id=b AND sequence_no=2;

  ok := false; msg := NULL;
  BEGIN UPDATE public.batch_stage_corrections SET reason='rewritten' WHERE batch_stage_id=s2;
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'BATCH_CORRECTION_IMMUTABLE%'; msg := SQLERRM; END;
  PERFORM _b7k('G','G11 the immutability trigger refuses an edit on its own',
    ok, left(coalesce(msg,''),140));

  ok := false; msg := NULL;
  BEGIN DELETE FROM public.batch_stage_corrections WHERE batch_stage_id=s2;
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'BATCH_CORRECTION_IMMUTABLE%'; msg := SQLERRM; END;
  PERFORM _b7k('G','G12 and a delete, even with every grant in hand',
    ok, left(coalesce(msg,''),140));

  SELECT count(*) INTO n FROM public.batch_stage_corrections WHERE batch_stage_id=s2;
  PERFORM _b7k('G','G13 so the log is still intact after all four attempts',
    n=2, n||' entr(y/ies)');
END
$g2$;
SET ROLE authenticated;


-- =====================================================================
--  H — reopening is itself recorded
-- =====================================================================
DO $h$
DECLARE
  b uuid := current_setting('b7.b')::uuid;
  s2 uuid; ok boolean; msg text;
BEGIN
  SELECT id INTO s2 FROM public.batch_stages WHERE batch_id=b AND sequence_no=2;

  --  Section F reopened this stage. That reopening had to leave a trace.
  PERFORM _b7k('H','H1 the reopening was logged with its reason',
    EXISTS (SELECT 1 FROM public.batch_stage_corrections
             WHERE batch_stage_id=s2 AND field_name='status'
               AND original_value='complete' AND new_value='in_progress'
               AND reason LIKE 'Viscosity reading was not entered%'));

  PERFORM _b7k('H','H2 and it moved the stage back into progress',
    (SELECT status FROM public.batch_stages WHERE id=s2) = 'in_progress',
    (SELECT status FROM public.batch_stages WHERE id=s2));

  ok := false; msg := NULL;
  BEGIN PERFORM public.batch_stage_reopen(s2, '   ');
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'BATCH_STAGE_REOPEN_NO_REASON%'; msg := SQLERRM; END;
  PERFORM _b7k('H','H3 reopening without a reason is refused', ok, left(coalesce(msg,''),140));
END
$h$;


-- =====================================================================
--  I — closure locks permanently
--
--  The NOT DONE IF: "Closing a batch does not lock it."
-- =====================================================================
DO $i$
DECLARE
  b uuid := current_setting('b7.b')::uuid;
  c_a uuid := current_setting('b7.c_a')::uuid;
  s2 uuid; s3 uuid; p_visc uuid; r jsonb; ok boolean; msg text;
BEGIN
  SELECT id INTO s2 FROM public.batch_stages WHERE batch_id=b AND sequence_no=2;
  SELECT id INTO s3 FROM public.batch_stages WHERE batch_id=b AND sequence_no=3;

  ok := false; msg := NULL;
  BEGIN PERFORM public.batch_record_close(b);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'BATCH_STAGE_INCOMPLETE%'; msg := SQLERRM; END;
  PERFORM _b7k('I','I1 a batch with an unfinished stage cannot be closed', ok, left(coalesce(msg,''),140));

  PERFORM _b7k('I','I2 the refused closure left the record open',
    (SELECT execution_closed_at IS NULL FROM public.batch_records WHERE id=b));

  --  Finish stage 2 again, then stage 3.
  r := public.sign_electronic_record(c_a,'batch_stage',s2,'complete',
         'authored','CorrectHorse1!');
  PERFORM public.batch_stage_complete(s2, (r->>'signature_id')::uuid,
    current_setting('b7.u_vf')::uuid, current_setting('b7.sig_vf_s2')::uuid);

  PERFORM public.batch_stage_start(s3);
  r := public.sign_electronic_record(c_a,'batch_stage',s3,'complete',
         'authored','CorrectHorse1!');
  PERFORM public.batch_stage_complete(s3, (r->>'signature_id')::uuid);

  PERFORM _b7k('I','I3 every stage is complete',
    (SELECT count(*) FROM public.batch_stages WHERE batch_id=b AND status<>'complete') = 0);

  r := public.batch_record_close(b,'Execution complete, record to QC');
  PERFORM _b7k('I','I4 the batch closes once every stage is complete',
    (r->>'execution_closed')='true', coalesce(r::text,'NULL'));

  PERFORM _b7k('I','I5 closure records when and by whom',
    (SELECT execution_closed_at IS NOT NULL
        AND execution_closed_by = current_setting('b7.u_op')::uuid
       FROM public.batch_records WHERE id=b));

  --  Closing is the hand-off to QC, not a dead end.
  PERFORM _b7k('I','I6 and the record is now with QC',
    (SELECT status FROM public.batch_records WHERE id=b) = 'qc_pending',
    (SELECT status FROM public.batch_records WHERE id=b));

  --  The locks. Each one is a separate path into the record, and a lock
  --  that only covers one of them is not a lock.
  ok := false; msg := NULL;
  BEGIN PERFORM public.batch_stage_reopen(s3,'changed my mind');
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'BATCH_CLOSED%'; msg := SQLERRM; END;
  PERFORM _b7k('I','I7 no stage can be reopened after closure', ok, left(coalesce(msg,''),140));

  SELECT id INTO p_visc FROM public.master_formula_stage_parameters
   WHERE stage_id=current_setting('b7.fs2')::uuid AND parameter='Viscosity';
  ok := false; msg := NULL;
  BEGIN PERFORM public.batch_stage_record_reading(s2, p_visc, 460);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'BATCH_CLOSED%'; msg := SQLERRM; END;
  PERFORM _b7k('I','I8 no reading can be added after closure', ok, left(coalesce(msg,''),140));

  ok := false; msg := NULL;
  BEGIN PERFORM public.batch_stage_correct_reading(
          current_setting('b7.rid')::uuid, 999, NULL, 'late correction');
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'BATCH_CLOSED%'; msg := SQLERRM; END;
  PERFORM _b7k('I','I9 nor corrected after closure', ok, left(coalesce(msg,''),140));

  --  Not only through the RPCs: the freeze is on the tables.
  ok := false; msg := NULL;
  BEGIN UPDATE public.batch_stages SET name='renamed after the fact' WHERE id=s3;
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'BATCH_CLOSED%'; msg := SQLERRM; END;
  PERFORM _b7k('I','I10 a direct UPDATE of a frozen stage is refused too', ok, left(coalesce(msg,''),140));

  ok := false; msg := NULL;
  BEGIN DELETE FROM public.batch_stage_parameter_readings WHERE id=current_setting('b7.rid')::uuid;
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'BATCH_CLOSED%'; msg := SQLERRM; END;
  PERFORM _b7k('I','I11 and a frozen reading cannot be deleted', ok, left(coalesce(msg,''),140));

  ok := false; msg := NULL;
  BEGIN PERFORM public.batch_record_close(b);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'BATCH_CLOSED%'; msg := SQLERRM; END;
  PERFORM _b7k('I','I14 and closing twice is refused', ok, left(coalesce(msg,''),140));

  --  The engine permits hold -> in_progress, which is right for a batch
  --  held mid-execution and wrong for a closed one: it would produce a
  --  record that claims to be in manufacturing and refuses every
  --  manufacturing write.
  PERFORM public.lifecycle_transition('batch_record', b, 'hold',
    current_setting('b7.c_a')::uuid, current_setting('b7.u_op')::uuid, 'held after closure');
  ok := false; msg := NULL;
  BEGIN
    PERFORM public.lifecycle_transition('batch_record', b, 'resume_execution',
      current_setting('b7.c_a')::uuid, current_setting('b7.u_op')::uuid, 'back to the floor');
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'BATCH_CLOSED%'; msg := SQLERRM; END;
  PERFORM _b7k('I','I15 a closed record cannot return to manufacturing', ok, left(coalesce(msg,''),140));

  PERFORM _b7k('I','I16 and it is still where the refusal found it',
    (SELECT status FROM public.batch_records WHERE id=b) = 'hold',
    (SELECT status FROM public.batch_records WHERE id=b));

  --  Resuming QC is the legitimate way out, and it still works.
  PERFORM public.lifecycle_transition('batch_record', b, 'resume_qc',
    current_setting('b7.c_a')::uuid, current_setting('b7.u_op')::uuid, 'review resumes');
  PERFORM _b7k('I','I17 resuming QC review is still open to it',
    (SELECT status FROM public.batch_records WHERE id=b) = 'qc_in_progress',
    (SELECT status FROM public.batch_records WHERE id=b));
END
$i$;

--  "Permanently" has to mean the lock cannot be taken off, or every
--  assertion above is one UPDATE away from being untrue. As the owner
--  again, for the reason section B gives.
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('b7.u_ad'), 'role','authenticated')::text, false);
DO $i2$
DECLARE b uuid := current_setting('b7.b')::uuid; n integer; ok boolean; msg text;
BEGIN
  UPDATE public.batch_records SET release_notes='owner can still write this row' WHERE id=b;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM _b7k('I','I12a the owner can still update the batch row', n=1, n||' row(s)');

  ok := false; msg := NULL;
  BEGIN UPDATE public.batch_records SET execution_closed_at=NULL WHERE id=b;
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'BATCH_CLOSED%'; msg := SQLERRM; END;
  PERFORM _b7k('I','I12b closure cannot be cleared', ok, left(coalesce(msg,''),140));

  ok := false; msg := NULL;
  BEGIN UPDATE public.batch_records SET execution_closed_at=now() - interval '3 days' WHERE id=b;
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'BATCH_CLOSED%'; msg := SQLERRM; END;
  PERFORM _b7k('I','I13 nor backdated', ok, left(coalesce(msg,''),140));
END
$i2$;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('b7.u_op'), 'role','authenticated')::text, false);


-- =====================================================================
--  J — tenancy
-- =====================================================================
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('b7.u_b'), 'role','authenticated')::text, false);
DO $j$
DECLARE
  b uuid := current_setting('b7.b')::uuid;
  n integer; ok boolean; msg text;
BEGIN
  SELECT count(*) INTO n FROM public.batch_stages WHERE batch_id=b;
  PERFORM _b7k('J','J1 another company cannot see the stages', n=0, n||' row(s)');

  SELECT count(*) INTO n FROM public.batch_stage_parameter_readings
   WHERE company_id=current_setting('b7.c_a')::uuid;
  PERFORM _b7k('J','J2 nor the readings', n=0, n||' row(s)');

  SELECT count(*) INTO n FROM public.batch_stage_corrections
   WHERE company_id=current_setting('b7.c_a')::uuid;
  PERFORM _b7k('J','J3 nor the correction log', n=0, n||' row(s)');

  --  Invisible is not the same as untouchable, so the RPCs are probed
  --  directly: they are SECURITY DEFINER and would otherwise run with
  --  RLS off.
  ok := false; msg := NULL;
  BEGIN PERFORM public.batch_record_close(b);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'BATCH_FORBIDDEN%'; msg := SQLERRM; END;
  PERFORM _b7k('J','J4 nor close somebody else''s batch', ok, left(coalesce(msg,''),140));

  ok := false; msg := NULL;
  BEGIN PERFORM public.batch_stage_start(
    (SELECT id FROM public.batch_stages WHERE batch_id=b AND sequence_no=1));
  EXCEPTION WHEN others THEN ok := true; msg := SQLERRM; END;
  PERFORM _b7k('J','J5 nor start a stage of it', ok, left(coalesce(msg,''),140));

  ok := false; msg := NULL;
  BEGIN PERFORM public.batch_record_initiate(
    current_setting('b7.c_a')::uuid,'J-INTRUDER',current_setting('b7.p_a')::uuid,
    current_date, current_date+365, 10);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'BATCH_FORBIDDEN%'; msg := SQLERRM; END;
  PERFORM _b7k('J','J6 nor initiate a batch in their company', ok, left(coalesce(msg,''),140));
END
$j$;
RESET ROLE; RESET request.jwt.claims;

DO $j2$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM public.batch_stages
   WHERE company_id=current_setting('b7.c_a')::uuid;
  PERFORM _b7k('J','J7 and the owner is not locked out of their own stages', n=3, n||' row(s)');
END
$j2$;


-- =====================================================================
--  K — W4·17: the stage strip, and dual sign-off with a state between
-- =====================================================================
--  Two of the design's "not done if" clauses:
--
--    "Locked stage greyed with no explanation: no. Every locked stage
--     says what it waits for."
--    "Dual sign-off WITH THE STATE IN BETWEEN and the second signer's
--     own login."
--
--  This section gets its OWN batch. The batch above is closed by
--  section I, and a section that depended on running before it would
--  break the first time somebody reordered the file — which is
--  exactly what happened when this was written against the shared
--  one.
--
--  Stage 2 is the stage that requires a verifier (A5), so that is the
--  one the two-step sign-off runs on.
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('b7.u_op'), 'role','authenticated')::text, false);
SET ROLE authenticated;

DO $k$
DECLARE
  c_a uuid := current_setting('b7.c_a')::uuid;
  r jsonb; kb uuid; s1 uuid; s2 uuid; s3 uuid;
  sig uuid; n integer; v_wait text; v_state text;
BEGIN
  r := public.batch_record_initiate(
         c_a, 'K-DUAL-001', current_setting('b7.p_a')::uuid,
         current_date, current_date + 365, 100, 'kg', NULL,
         current_setting('b7.f')::uuid);
  kb := (r->>'batch_id')::uuid;
  PERFORM set_config('b7.kb', kb::text, false);

  SELECT id INTO s1 FROM public.batch_stages WHERE batch_id=kb AND sequence_no=1;
  SELECT id INTO s2 FROM public.batch_stages WHERE batch_id=kb AND sequence_no=2;
  SELECT id INTO s3 FROM public.batch_stages WHERE batch_id=kb AND sequence_no=3;

  SELECT count(*) INTO n FROM public.batch_stage_strip(kb);
  PERFORM _b7k('K','K1 the strip reports every stage', n=3, n||' row(s)');

  --  THE ONE THE DESIGN RULES OUT. A strip that greys a stage without
  --  a sentence is the "locked with no explanation" failure.
  SELECT count(*) INTO n FROM public.batch_stage_strip(kb)
   WHERE state NOT IN ('current','done') AND coalesce(btrim(waiting_for),'')='';
  PERFORM _b7k('K','K2 no stage is locked without saying what it waits for', n=0, n||' row(s)');

  SELECT state, waiting_for INTO v_state, v_wait
    FROM public.batch_stage_strip(kb) WHERE stage_id=s3;
  PERFORM _b7k('K','K3 stage 3 is locked while stage 1 is unfinished',
    v_state='locked', coalesce(v_state,'NULL'));
  PERFORM _b7k('K','K4 and names the stage it is waiting for',
    v_wait LIKE '%stage 1%', coalesce(v_wait,'NULL'));

  --  "Complete and sign stays disabled with the reason given."
  PERFORM public.batch_stage_start(s1);
  SELECT count(*) INTO n FROM public.batch_stage_completion_blockers(s1);
  PERFORM _b7k('K','K5 an unfinished stage reports why it cannot be completed',
    n > 0, n||' blocker(s)');

  SELECT count(*) INTO n FROM public.batch_stage_completion_blockers(s1)
   WHERE coalesce(btrim(title),'')='' OR coalesce(btrim(detail),'')='';
  PERFORM _b7k('K','K6 and every reason carries words to show', n=0, n||' blank');
END
$k$;

--  Complete stage 1 so stage 2 can start. Stage 1 needs no verifier,
--  so it takes the one-call path, which this change leaves untouched.
DO $k2$
DECLARE
  c_a uuid := current_setting('b7.c_a')::uuid;
  kb uuid := current_setting('b7.kb')::uuid;
  s1 uuid; s2 uuid; r jsonb; fp record; ok boolean; msg text;
BEGIN
  SELECT id INTO s1 FROM public.batch_stages WHERE batch_id=kb AND sequence_no=1;
  SELECT id INTO s2 FROM public.batch_stages WHERE batch_id=kb AND sequence_no=2;

  FOR fp IN SELECT id FROM public.batch_stage_parameter_readings
             WHERE batch_stage_id=s1 AND reading_value IS NULL AND reading_text IS NULL
  LOOP
    NULL;  --  stage 1's readings are filled by the loop below
  END LOOP;

  FOR fp IN
    SELECT p.id, p.target_value, p.target_text
      FROM public.master_formula_stage_parameters p
      JOIN public.master_formula_stages fs ON fs.id = p.stage_id
      JOIN public.batch_stages bs ON bs.formula_stage_id = fs.id
     WHERE bs.id = s1
  LOOP
    PERFORM public.batch_stage_record_reading(s1, fp.id, fp.target_value, fp.target_text);
  END LOOP;

  r := public.sign_electronic_record(c_a,'batch_stage',s1,'complete',
         'authored','CorrectHorse1!');
  PERFORM public.batch_stage_complete(s1, (r->>'signature_id')::uuid);

  PERFORM _b7k('K','K7 stage 1 completes on one signature where no verifier is required',
    (SELECT status FROM public.batch_stages WHERE id=s1)='complete',
    (SELECT status FROM public.batch_stages WHERE id=s1));

  PERFORM _b7k('K','K8 and stage 2 is now the current one',
    (SELECT state FROM public.batch_stage_strip(kb) WHERE stage_id=s2)='current',
    (SELECT state FROM public.batch_stage_strip(kb) WHERE stage_id=s2));

  --  Now the two-step path on the stage that does require a verifier.
  PERFORM public.batch_stage_start(s2);
  FOR fp IN
    SELECT p.id, p.target_value, p.target_text
      FROM public.master_formula_stage_parameters p
      JOIN public.master_formula_stages fs ON fs.id = p.stage_id
      JOIN public.batch_stages bs ON bs.formula_stage_id = fs.id
     WHERE bs.id = s2
  LOOP
    PERFORM public.batch_stage_record_reading(s2, fp.id, fp.target_value, fp.target_text);
  END LOOP;

  r := public.sign_electronic_record(c_a,'batch_stage',s2,'sign_operator',
         'authored','CorrectHorse1!');
  PERFORM _b7k('K','K9 the operator can sign their half',
    (r->>'ok')='true', coalesce(r::text,'NULL'));
  PERFORM public.batch_stage_sign_operator(s2, (r->>'signature_id')::uuid);

  --  THE STATE THE BACKEND COULD NOT REPRESENT BEFORE. Without it both
  --  people must sign in one call at one tablet, which is one
  --  person's session with somebody else's credential in it.
  PERFORM _b7k('K','K10 the stage is now awaiting verification',
    (SELECT status FROM public.batch_stages WHERE id=s2)='awaiting_verification',
    (SELECT status FROM public.batch_stages WHERE id=s2));

  PERFORM _b7k('K','K11 the strip says a second person must sign',
    (SELECT waiting_for FROM public.batch_stage_strip(kb) WHERE stage_id=s2)
      LIKE '%second person%',
    (SELECT coalesce(waiting_for,'NULL') FROM public.batch_stage_strip(kb) WHERE stage_id=s2));

  PERFORM _b7k('K','K12 one signature does not complete it',
    (SELECT verifier_signature_id IS NULL FROM public.batch_stages WHERE id=s2));

  --  The operator may not be the verifier, checked against who is
  --  signed in now rather than a parameter somebody passes.
  r := public.sign_electronic_record(c_a,'batch_stage',s2,'verify',
         'witnessed','CorrectHorse1!');
  ok := false; msg := NULL;
  BEGIN PERFORM public.batch_stage_verify(s2, (r->>'signature_id')::uuid);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'BATCH_STAGE_SAME_SIGNER%'; msg := SQLERRM; END;
  PERFORM _b7k('K','K13 the operator cannot verify their own stage', ok, left(coalesce(msg,''),140));

  --  BR-04: "the stage can't be edited". A reading changed between the
  --  signatures would be covered by neither.
  ok := false; msg := NULL;
  BEGIN
    UPDATE public.batch_stage_parameter_readings SET reading_value = 1
     WHERE batch_stage_id = s2;
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'BATCH_STAGE_AWAITING_FROZEN%'; msg := SQLERRM; END;
  PERFORM _b7k('K','K14 readings are frozen between the two signatures', ok, left(coalesce(msg,''),140));
END
$k2$;

--  Now as the verifier, with their own account.
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('b7.u_vf'), 'role','authenticated')::text, false);

DO $k3$
DECLARE
  c_a uuid := current_setting('b7.c_a')::uuid;
  kb uuid := current_setting('b7.kb')::uuid;
  s2 uuid; r jsonb;
BEGIN
  SELECT id INTO s2 FROM public.batch_stages WHERE batch_id=kb AND sequence_no=2;

  r := public.sign_electronic_record(c_a,'batch_stage',s2,'verify',
         'witnessed','CorrectHorse1!');
  PERFORM public.batch_stage_verify(s2, (r->>'signature_id')::uuid);

  PERFORM _b7k('K','K15 the verifier''s own signature completes the stage',
    (SELECT status FROM public.batch_stages WHERE id=s2)='complete',
    (SELECT status FROM public.batch_stages WHERE id=s2));

  --  BR-05: "two visibly different signature records". Two rows, two
  --  signers — which is what makes them different.
  PERFORM _b7k('K','K16 the two signatures are by different people',
    (SELECT operator_signature_id IS DISTINCT FROM verifier_signature_id
            AND operator_id IS DISTINCT FROM verifier_id
       FROM public.batch_stages WHERE id=s2));

  --  BR-05: "the next stage unlocks".
  PERFORM _b7k('K','K17 and the next stage unlocks',
    (SELECT state FROM public.batch_stage_strip(kb) WHERE sequence_no=3)='current',
    (SELECT state FROM public.batch_stage_strip(kb) WHERE sequence_no=3));
END
$k3$;

RESET ROLE; RESET request.jwt.claims;

\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo '  WEEK 4 / ITEM 07 — BATCH RECORD AND STAGES'
\echo '════════════════════════════════════════════════════════════════'
SELECT section, count(*) AS assertions, count(*) FILTER (WHERE NOT ok) AS failures
  FROM _b7 GROUP BY section ORDER BY section;
SELECT section, name, coalesce(detail,'') AS detail FROM _b7 WHERE NOT ok ORDER BY section, name;
SELECT count(*) AS total, count(*) FILTER (WHERE ok) AS passed,
       count(*) FILTER (WHERE NOT ok) AS failed FROM _b7;

DO $v$
DECLARE f integer;
BEGIN
  SELECT count(*) INTO f FROM _b7 WHERE NOT ok;
  IF f > 0 THEN RAISE EXCEPTION 'ITEM 07: % assertion(s) failed', f; END IF;
  RAISE NOTICE 'ITEM 07: all assertions passed';
END
$v$;

DROP FUNCTION IF EXISTS _b7k(text,text,boolean,text);
DROP TABLE IF EXISTS _b7;
