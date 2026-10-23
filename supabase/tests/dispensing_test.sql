-- =====================================================================
--  WEEK 4 / ITEM 09 — DISPENSING AND GENEALOGY LINKS
--
--  NOT DONE IF
--    A quarantined or rejected lot can be dispensed through a direct call.
--    The link is written but the quantity is not decremented, or the
--      reverse.
--    Two operators dispensing one lot at the same moment can take it
--      below zero.
--
--  THE FIXTURE IS THE INTEGRATION TEST
--  -----------------------------------
--  Nothing below is stubbed into place. The lot reaches 'approved' by the
--  item 04/05 route — sampled, signed for by a designated QA authority,
--  released — and the batch reaches a dispensable state by the item 07/08
--  route: initiated against an approved formula and a registered product,
--  put on a line, the line cleared on its checklist, a changeover result
--  recorded, signed by one person and verified by another.
--
--  That is deliberate. Item 04 said its dispensing block "was only ever
--  tested against a stub" is a NOT DONE IF, and item 08 left "clearance
--  is recorded but dispensing never checks it" open. Both are closed here
--  or not at all, and a fixture that shortcut the chain would close
--  neither while appearing to.
--
--  Sections:
--    A. The happy path, end to end
--    B. The clearance gate, finally called
--    C. Only approved lots — through the RPC and through a direct INSERT
--    D. Coherence: material, units, stage, formula version, closed batch
--    E. Tolerance and supervisor authorisation
--    F. Dispenser and verifier
--    G. The link and the decrement, together or not at all
--    H. Two operators, one lot, at the same moment
--    I. Immutability
--    J. Tenancy
-- =====================================================================
\set ON_ERROR_STOP on
SET client_min_messages = warning;

CREATE TEMP TABLE _d9(section text, name text, ok boolean, detail text);
GRANT ALL ON _d9 TO anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION _d9k(p_section text, p_name text, p_ok boolean, p_detail text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO _d9 VALUES (p_section,p_name,coalesce(p_ok,false),p_detail); END $$;

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

--  Section H needs a SECOND BACKEND to prove the concurrency clause, and
--  dblink is the only way to get one from inside a psql script. It ships
--  in postgresql-contrib, which the postgres:16 image CI uses includes.
--  The connection is made over the local socket with no password: the
--  server process is the postgres OS user, so peer auth applies and no
--  credential appears in this file.
CREATE EXTENSION IF NOT EXISTS dblink;


-- ── fixtures ─────────────────────────────────────────────────────────
DO $fx$
DECLARE
  c_a uuid := gen_random_uuid();
  c_b uuid := gen_random_uuid();
  u_op uuid := gen_random_uuid();   -- dispenses
  u_qa uuid := gen_random_uuid();   -- verifies, and is the QA authority
  u_sup uuid := gen_random_uuid();  -- supervisor, authorises deviations
  u_b  uuid := gen_random_uuid();
  tag text := substr(replace(gen_random_uuid()::text,'-',''),1,8);
  p_a uuid; m_api uuid; m_exc uuid; f uuid; s1 uuid; ln uuid; spec uuid; bal uuid;
  fm_api uuid; fm_exc uuid;
BEGIN
  PERFORM set_config('d9.c_a', c_a::text, false);
  PERFORM set_config('d9.c_b', c_b::text, false);
  PERFORM set_config('d9.u_op', u_op::text, false);
  PERFORM set_config('d9.u_qa', u_qa::text, false);
  PERFORM set_config('d9.u_sup', u_sup::text, false);
  PERFORM set_config('d9.u_b',  u_b::text,  false);
  PERFORM set_config('d9.tag',  tag, false);

  INSERT INTO public.companies(id,name) VALUES
    (c_a,'Item09 Manufacturing '||tag), (c_b,'Item09 Elsewhere '||tag);

  INSERT INTO auth.users(id,email) VALUES
    (u_op ,'op-' ||tag||'@item09.test'),
    (u_qa ,'qa-' ||tag||'@item09.test'),
    (u_sup,'sup-'||tag||'@item09.test'),
    (u_b  ,'b-'  ||tag||'@item09.test');
  UPDATE auth.users SET encrypted_password = extensions.crypt('CorrectHorse1!', extensions.gen_salt('bf'))
   WHERE id IN (u_op,u_qa,u_sup,u_b);

  INSERT INTO public.profiles(id,email,full_name,company_id,role) VALUES
    (u_op ,'op-' ||tag||'@item09.test','Zainab Operator',  c_a,'content_creator'),
    (u_qa ,'qa-' ||tag||'@item09.test','Chidi Quality',    c_a,'compliance_officer'),
    (u_sup,'sup-'||tag||'@item09.test','Folake Supervisor',c_a,'admin'),
    (u_b  ,'b-'  ||tag||'@item09.test','Far Away',         c_b,'admin');

  INSERT INTO public.company_members(company_id,user_id,role,status) VALUES
    (c_a,u_op,'member','active'),(c_a,u_qa,'member','active'),
    (c_a,u_sup,'owner','active'),(c_b,u_b,'owner','active');

  --  Lot numbers come from the company format (item 04).
  INSERT INTO public.company_numbering_formats(company_id,scope,pattern,prefix,seq_width)
  VALUES (c_a,'material_lot','{PREFIX}-{SEQ}','D9',4);

  --  The QA authority who may release a lot (item 05).
  INSERT INTO public.material_qa_authorities(company_id,user_id,designated_by)
  VALUES (c_a,u_qa,u_qa);

  INSERT INTO public.products(id,company_id,product_code,trade_name,generic_name,category,created_by)
  VALUES (gen_random_uuid(),c_a,'ITEM09-'||tag,'Syrup Nine','Paracetamol','drug_pharmaceutical',u_op)
  RETURNING id INTO p_a;
  PERFORM set_config('d9.p_a', p_a::text, false);

  INSERT INTO public.materials(company_id,code,name,material_type,criticality,unit_of_measure,created_by)
  VALUES (c_a,'API9-'||tag,'Paracetamol powder','active_ingredient','critical','kg',u_op)
  RETURNING id INTO m_api;
  INSERT INTO public.materials(company_id,code,name,material_type,criticality,unit_of_measure,created_by)
  VALUES (c_a,'EXC9-'||tag,'Sorbitol solution','excipient','standard','kg',u_op)
  RETURNING id INTO m_exc;
  PERFORM set_config('d9.m_api', m_api::text, false);
  PERFORM set_config('d9.m_exc', m_exc::text, false);

  --  An effective specification for the API, because a certificate is
  --  verified AGAINST one and item 05 refuses to verify without it. Two
  --  parameters, matching the certificate the lot helper captures.
  INSERT INTO public.material_specifications
    (company_id,material_id,version,status,effective_date,created_by)
  VALUES (c_a,m_api,'1.0','effective',current_date-1,u_qa) RETURNING id INTO spec;
  INSERT INTO public.material_specification_parameters
    (specification_id,parameter,unit,limit_type,min_value,max_value,is_critical,sort_order)
  VALUES (spec,'Assay','%','range',98.0,102.0,true,10);
  INSERT INTO public.material_specification_parameters
    (specification_id,parameter,limit_type,is_critical,sort_order)
  VALUES (spec,'Identification','complies',true,20);

  INSERT INTO public.master_formulas(company_id,product_id,version,batch_size,batch_size_unit,created_by)
  VALUES (c_a,p_a,'1.0',1000,'litres',u_op) RETURNING id INTO f;

  --  tolerance_pct is set BEFORE approval: master_formula_approve() freezes
  --  the children, which is item 06 doing its job.
  --
  --    the API line declares +/-2%
  --    the excipient line declares NOTHING, so section E can prove the
  --    fail-closed behaviour on an undeclared tolerance
  INSERT INTO public.master_formula_materials
    (formula_id,material_id,role,quantity_per_batch,unit,tolerance_pct,sort_order)
  VALUES (f,m_api,'active',24.0,'kg',2.0,10) RETURNING id INTO fm_api;
  INSERT INTO public.master_formula_materials
    (formula_id,material_id,role,quantity_per_batch,unit,tolerance_pct,sort_order)
  VALUES (f,m_exc,'diluent',50.0,'kg',NULL,20) RETURNING id INTO fm_exc;
  PERFORM set_config('d9.fm_api', fm_api::text, false);
  PERFORM set_config('d9.fm_exc', fm_exc::text, false);

  INSERT INTO public.master_formula_stages(formula_id,sequence_no,stage_code,name)
  VALUES (f,1,'MIX','Mixing') RETURNING id INTO s1;
  PERFORM set_config('d9.f', f::text, false);

  INSERT INTO public.production_lines(company_id,code,name,area,created_by)
  VALUES (c_a,'LINE-9','Syrup line 9','Block 3',u_op) RETURNING id INTO ln;
  PERFORM set_config('d9.ln', ln::text, false);

  --  Week 4 item 10 replaced the free-text balance with a REGISTERED
  --  INSTRUMENT, so a dispensing now names one and its calibration is
  --  checked. The calibration itself is recorded through the real route
  --  in the block below; a bare instrument row would have no due date and
  --  would be blocked, which is item 10 working.
  INSERT INTO public.instruments(company_id,code,name,instrument_type,location,owner_user_id,created_by)
  VALUES (c_a,'BAL-07','Bench balance 07','balance','Block 3',u_sup,u_op)
  RETURNING id INTO bal;
  PERFORM set_config('d9.bal', bal::text, false);
END
$fx$;

--  Registration and formula approval.
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('d9.u_sup'), 'role','authenticated')::text, false);
SET ROLE authenticated;
DO $setup$
DECLARE c_a uuid := current_setting('d9.c_a')::uuid; p uuid := current_setting('d9.p_a')::uuid;
BEGIN
  PERFORM public.lifecycle_transition('product', p, 'start_regulatory_prep', c_a);
  PERFORM public.lifecycle_transition('product', p, 'submit_to_regulator',   c_a);
  PERFORM public.lifecycle_transition('product', p, 'record_registration',   c_a, NULL, 'NAFDAC listing granted');
END
$setup$;
RESET ROLE;

--  The formula is approved by the DESIGNATED QA AUTHORITY, not merely by
--  an admin. Once anybody is designated for a company, material_qa
--  _authorities is the only route — which is item 05 doing its job, and
--  worth noting because the owner above cannot do this.
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('d9.u_qa'), 'role','authenticated')::text, false);
SET ROLE authenticated;
DO $approve$
BEGIN
  PERFORM public.master_formula_approve(current_setting('d9.f')::uuid);
END
$approve$;
RESET ROLE;

--  The balance's calibration certificate, in date. Recorded rather than
--  the due date being written onto the instrument, because item 10
--  refuses a hand-written due date: the only way to extend a calibration
--  is to record one.
DO $calibrate$
BEGIN
  INSERT INTO public.instrument_calibrations
    (company_id, instrument_id, certificate_number, calibrated_on, due_on,
     performed_by_org, result, uploaded_by)
  VALUES (current_setting('d9.c_a')::uuid, current_setting('d9.bal')::uuid,
          'CAL-2026-0071', current_date - 30, current_date + 335,
          'Lagos Metrology Services', 'pass', current_setting('d9.u_sup')::uuid);
END
$calibrate$;

--  Lots, taken to 'approved' through the real item 04/05 route by the
--  designated QA authority. A helper because five lots need the same
--  three steps, and a sequence repeated five times is one that drifts.
CREATE OR REPLACE FUNCTION _d9_lot(
  p_material uuid, p_qty numeric, p_unit text, p_disposition text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  c_a uuid := current_setting('d9.c_a')::uuid;
  u_qa uuid := current_setting('d9.u_qa')::uuid;
  l uuid; r jsonb; coa uuid; v_crit text;
BEGIN
  --  GOODS RECEIPT IS NOT WHAT THIS FIXTURE TESTS. Since
  --  20261126000000 received_by is written from the session, and
  --  decision 1 refuses the disposition to whoever received the lot —
  --  so building and releasing a lot as one person is now refused,
  --  correctly. This helper is SECURITY DEFINER and cannot change
  --  role, so its CALLERS run it in service context instead; see the
  --  $lots$ block below.
  INSERT INTO public.material_lots
    (company_id,material_id,quantity_received,quantity_available,unit_of_measure,created_by)
  VALUES (c_a,p_material,p_qty,p_qty,p_unit,u_qa) RETURNING id INTO l;

  IF p_disposition = 'quarantine' THEN
    RETURN l;                     -- left exactly where receipt puts it
  END IF;

  IF p_disposition = 'rejected' THEN
    PERFORM public.lifecycle_transition('material_lot', l, 'reject', c_a, u_qa, 'Rejected on receipt');
    RETURN l;
  END IF;

  --  A CRITICAL material cannot be released without a VERIFIED
  --  certificate of analysis — item 05's gate, and the reason this
  --  fixture is longer than a status UPDATE would have been. The API in
  --  this suite is genuinely critical, so the certificate is genuinely
  --  captured and verified rather than the material being downgraded to
  --  make the fixture shorter.
  --
  --  Conditional on criticality rather than done for every lot, because
  --  that is the actual rule: a standard excipient needs no certificate,
  --  and verifying one against a specification it does not have would
  --  fail. The excipient in this suite deliberately has neither.
  SELECT criticality INTO v_crit FROM public.materials WHERE id = p_material;
  IF v_crit = 'critical' THEN
    INSERT INTO public.material_certificates_of_analysis
      (company_id, material_lot_id, supplier_results, uploaded_by)
    VALUES (c_a, l, '[{"parameter":"Assay","stated_value":99.4},
                      {"parameter":"Identification","stated_text":"Complies"}]'::jsonb, u_qa)
    RETURNING id INTO coa;
    PERFORM public.material_coa_verify(coa);
  END IF;

  --  approved: sample, sign, release — the real path.
  PERFORM public.lifecycle_transition('material_lot', l, 'sample', c_a, u_qa, 'Sampled');
  r := public.sign_electronic_record(c_a,'material_lot',l,'release','released','CorrectHorse1!');
  IF (r->>'ok') <> 'true' THEN
    RAISE EXCEPTION 'FIXTURE: could not sign for lot release: %', r::text;
  END IF;
  PERFORM public.material_lot_release(l,(r->>'signature_id')::uuid,'full');
  RETURN l;
END $$;

SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('d9.u_qa'), 'role','authenticated')::text, false);
--  RESET ROLE, deliberately: the lots below are scaffolding, not the
--  subject. Built in service context so no person is recorded as
--  having received them, which is what lets the same fixture user go
--  on to disposition them. See 20261126000000.
RESET ROLE;
DO $lots$
BEGIN
  PERFORM set_config('d9.lot_ok',   _d9_lot(current_setting('d9.m_api')::uuid, 100, 'kg','approved')::text, false);
  PERFORM set_config('d9.lot_q',    _d9_lot(current_setting('d9.m_api')::uuid,  50, 'kg','quarantine')::text, false);
  PERFORM set_config('d9.lot_rej',  _d9_lot(current_setting('d9.m_api')::uuid,  50, 'kg','rejected')::text, false);
  --  Held in GRAMS while the formula asks for kg: section D.
  PERFORM set_config('d9.lot_g',    _d9_lot(current_setting('d9.m_exc')::uuid, 100000, 'g','approved')::text, false);
  PERFORM set_config('d9.lot_exh',  _d9_lot(current_setting('d9.m_exc')::uuid,  50, 'kg','approved')::text, false);
  PERFORM set_config('d9.lot_conc', _d9_lot(current_setting('d9.m_api')::uuid, 100, 'kg','approved')::text, false);
  --  A second untouched lot, for the asynchronous lost-update window in
  --  section H. It needs a known starting quantity that nothing else has
  --  reduced, or the arithmetic proves nothing.
  PERFORM set_config('d9.lot_conc2',_d9_lot(current_setting('d9.m_api')::uuid, 100, 'kg','approved')::text, false);
END
$lots$;
RESET ROLE;

DO $fxcheck$
BEGIN
  IF (SELECT status FROM public.material_lots WHERE id=current_setting('d9.lot_ok')::uuid) <> 'approved' THEN
    RAISE EXCEPTION 'FIXTURE: lot_ok should be approved, not %',
      (SELECT status FROM public.material_lots WHERE id=current_setting('d9.lot_ok')::uuid);
  END IF;
  IF (SELECT status FROM public.material_lots WHERE id=current_setting('d9.lot_q')::uuid) <> 'quarantine' THEN
    RAISE EXCEPTION 'FIXTURE: lot_q must stay in quarantine or section C proves nothing';
  END IF;
  IF (SELECT status FROM public.material_lots WHERE id=current_setting('d9.lot_rej')::uuid) <> 'rejected' THEN
    RAISE EXCEPTION 'FIXTURE: lot_rej must be rejected or section C proves nothing';
  END IF;
END
$fxcheck$;

--  Batches, lines and clearances — the item 07/08 route.
--  _d9_clear() runs the whole item 08 flow so a batch ends up dispensable.
CREATE OR REPLACE FUNCTION _d9_clear(p_batch uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  c_a uuid := current_setting('d9.c_a')::uuid;
  u_op uuid := current_setting('d9.u_op')::uuid;
  u_qa uuid := current_setting('d9.u_qa')::uuid;
  cl uuid; r jsonb; it record;
BEGIN
  PERFORM public.batch_record_assign_line(p_batch, current_setting('d9.ln')::uuid);
  r := public.line_clearance_open(p_batch);
  cl := (r->>'clearance_id')::uuid;

  --  Answer every item. The three that demand a record get one.
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
  json_build_object('sub', current_setting('d9.u_op'), 'role','authenticated')::text, false);
SET ROLE authenticated;
DO $batches$
DECLARE c_a uuid := current_setting('d9.c_a')::uuid; r jsonb; b uuid;
BEGIN
  --  b1: fully cleared, the happy path.
  r := public.batch_record_initiate(c_a,'D9-0001',current_setting('d9.p_a')::uuid,
         current_date, current_date+365, 1000,'litres');
  b := (r->>'batch_id')::uuid;
  PERFORM set_config('d9.b1', b::text, false);
  PERFORM set_config('d9.cl1', _d9_clear(b)::text, false);

  --  b2: on a line, clearance opened and signed but NOT verified. Section
  --  B uses it to prove the gate wants the second signature.
  r := public.batch_record_initiate(c_a,'D9-0002',current_setting('d9.p_a')::uuid,
         current_date, current_date+365, 1000,'litres');
  b := (r->>'batch_id')::uuid;
  PERFORM set_config('d9.b2', b::text, false);
  PERFORM set_config('d9.cl2', _d9_clear(b)::text, false);

  --  b3: no line at all.
  r := public.batch_record_initiate(c_a,'D9-0003',current_setting('d9.p_a')::uuid,
         current_date, current_date+365, 1000,'litres');
  PERFORM set_config('d9.b3', (r->>'batch_id'), false);

  --  b4: cleared, kept for the concurrency section so section H starts
  --  from a known quantity nothing else has touched.
  r := public.batch_record_initiate(c_a,'D9-0004',current_setting('d9.p_a')::uuid,
         current_date, current_date+365, 1000,'litres');
  b := (r->>'batch_id')::uuid;
  PERFORM set_config('d9.b4', b::text, false);
  PERFORM set_config('d9.cl4', _d9_clear(b)::text, false);

  --  b5: for the asynchronous half of section H.
  r := public.batch_record_initiate(c_a,'D9-0005',current_setting('d9.p_a')::uuid,
         current_date, current_date+365, 1000,'litres');
  b := (r->>'batch_id')::uuid;
  PERFORM set_config('d9.b5', b::text, false);
  PERFORM set_config('d9.cl5', _d9_clear(b)::text, false);
END
$batches$;
RESET ROLE;

--  The verifier's half of the two clearances that need it.
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('d9.u_qa'), 'role','authenticated')::text, false);
SET ROLE authenticated;
DO $verify$
DECLARE c_a uuid := current_setting('d9.c_a')::uuid; r jsonb; cl uuid;
BEGIN
  FOREACH cl IN ARRAY ARRAY[current_setting('d9.cl1')::uuid, current_setting('d9.cl4')::uuid,
                            current_setting('d9.cl5')::uuid]
  LOOP
    r := public.sign_electronic_record(c_a,'line_clearance',cl,'verify','verified','CorrectHorse1!');
    PERFORM public.line_clearance_verify(cl,(r->>'signature_id')::uuid);
  END LOOP;
END
$verify$;
RESET ROLE;


-- =====================================================================
--  A — the happy path, end to end
-- =====================================================================
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('d9.u_op'), 'role','authenticated')::text, false);
SET ROLE authenticated;

DO $a$
DECLARE
  b1 uuid := current_setting('d9.b1')::uuid;
  lot uuid := current_setting('d9.lot_ok')::uuid;
  r jsonb; d uuid; v_reason text;
BEGIN
  --  The whole chain says yes before anything is weighed.
  v_reason := public.dispensing_block_reason(b1, lot, 24);
  PERFORM _d9k('A','A1 nothing blocks a cleared batch and an approved lot',
    v_reason IS NULL, coalesce(left(v_reason,160),'not blocked'));

  r := public.material_dispense(
         p_batch_id => b1,
         p_material_lot_id => lot,
         p_actual_quantity => 24.0,
         p_instrument_id => current_setting('d9.bal')::uuid,
         p_formula_material_id => current_setting('d9.fm_api')::uuid);
  d := (r->>'dispensing_id')::uuid;
  PERFORM set_config('d9.d1', d::text, false);

  PERFORM _d9k('A','A2 a dispensing is recorded', d IS NOT NULL, coalesce(r::text,'NULL'));

  --  "records material, internal lot, required quantity, actual quantity,
  --   balance used, dispenser" — all six, asserted by name.
  PERFORM _d9k('A','A3 it records all six things the brief names',
    (SELECT material_id = current_setting('d9.m_api')::uuid
        AND internal_lot_number = (SELECT lot_number FROM public.material_lots WHERE id=lot)
        AND required_quantity = 24.0
        AND actual_quantity   = 24.0
        --  Snapshotted from the instrument register by the gate, not
        --  supplied by the caller — the RPC was given a uuid.
        AND balance_identifier = 'BAL-07'
        AND instrument_id = current_setting('d9.bal')::uuid
        AND dispensed_by = current_setting('d9.u_op')::uuid
       FROM public.dispensing_records WHERE id=d));

  --  The required quantity came from the FORMULA, not from the caller —
  --  nothing above passed p_required_quantity.
  PERFORM _d9k('A','A4 the required quantity was resolved from the formula',
    (r->>'required_quantity')::numeric = 24.0, coalesce(r->>'required_quantity','NULL'));

  PERFORM _d9k('A','A5 and the lot was decremented by what was dispensed',
    (SELECT quantity_available FROM public.material_lots WHERE id=lot) = 76.0,
    (SELECT quantity_available::text FROM public.material_lots WHERE id=lot));

  PERFORM _d9k('A','A6 the genealogy edge was written',
    (SELECT total_quantity = 24.0 AND dispensing_count = 1 AND unit = 'kg'
       FROM public.batch_material_genealogy
      WHERE batch_id=b1 AND material_lot_id=lot));

  PERFORM _d9k('A','A7 the dispensing starts unverified',
    (SELECT verified_by IS NULL AND verified_at IS NULL
       FROM public.dispensing_records WHERE id=d));
END
$a$;


-- =====================================================================
--  B — the clearance gate, finally called
--
--  This is the clause item 08 shipped open: "Clearance is recorded but
--  dispensing never checks it."
-- =====================================================================
DO $b$
DECLARE
  b2 uuid := current_setting('d9.b2')::uuid;
  b3 uuid := current_setting('d9.b3')::uuid;
  lot uuid := current_setting('d9.lot_ok')::uuid;
  ok boolean; msg text; v_reason text; v_before numeric;
BEGIN
  SELECT quantity_available INTO v_before FROM public.material_lots WHERE id=lot;

  --  b2's clearance is signed but not verified.
  ok := false; msg := NULL;
  BEGIN
    PERFORM public.material_dispense(b2, lot, 24.0, current_setting('d9.bal')::uuid,
              current_setting('d9.fm_api')::uuid);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'LINE_NOT_CLEARED%'; msg := SQLERRM; END;
  PERFORM _d9k('B','B1 dispensing is refused while the clearance is unverified',
    ok, left(coalesce(msg,''),180));

  PERFORM _d9k('B','B2 and the refusal names the second signature',
    msg LIKE '%not yet verified by a second person%', left(coalesce(msg,''),180));

  --  b3 has no line.
  ok := false; msg := NULL;
  BEGIN
    PERFORM public.material_dispense(b3, lot, 24.0, current_setting('d9.bal')::uuid,
              current_setting('d9.fm_api')::uuid);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'LINE_NOT_CLEARED%'; msg := SQLERRM; END;
  PERFORM _d9k('B','B3 and refused for a batch with no line at all',
    ok, left(coalesce(msg,''),180));

  --  THE DIRECT CALL. The RPC is one way in; the gate is on the table.
  ok := false; msg := NULL;
  BEGIN
    INSERT INTO public.dispensing_records
      (company_id,batch_id,material_id,material_lot_id,internal_lot_number,
       required_quantity,actual_quantity,unit,balance_identifier,instrument_id,dispensed_by)
    VALUES (current_setting('d9.c_a')::uuid, b2, current_setting('d9.m_api')::uuid, lot,
            'x', 24.0, 24.0, 'kg', 'pending', current_setting('d9.bal')::uuid, current_setting('d9.u_op')::uuid);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'LINE_NOT_CLEARED%'; msg := SQLERRM; END;
  PERFORM _d9k('B','B4 a direct INSERT meets the clearance gate too',
    ok, left(coalesce(msg,''),180));

  PERFORM _d9k('B','B5 and none of the refusals moved any quantity',
    (SELECT quantity_available FROM public.material_lots WHERE id=lot) = v_before,
    (SELECT quantity_available::text FROM public.material_lots WHERE id=lot));

  PERFORM _d9k('B','B6 nor wrote a genealogy edge',
    NOT EXISTS (SELECT 1 FROM public.batch_material_genealogy WHERE batch_id IN (b2,b3)));

  --  And the combined read agrees with the insert path.
  v_reason := public.dispensing_block_reason(b2, lot, 24);
  PERFORM _d9k('B','B7 the screen-facing read gives the same answer',
    v_reason IS NOT NULL AND v_reason LIKE '%not yet verified%',
    coalesce(left(v_reason,160),'NULL'));
END
$b$;


-- =====================================================================
--  C — only approved lots
--
--  NOT DONE IF: "A quarantined or rejected lot can be dispensed through a
--  direct call."
-- =====================================================================
DO $c$
DECLARE
  b1 uuid := current_setting('d9.b1')::uuid;
  lq uuid := current_setting('d9.lot_q')::uuid;
  lr uuid := current_setting('d9.lot_rej')::uuid;
  ok boolean; msg text;
BEGIN
  ok := false; msg := NULL;
  BEGIN PERFORM public.material_dispense(b1, lq, 10.0, current_setting('d9.bal')::uuid);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'MATERIAL_DISPENSE_BLOCKED%'; msg := SQLERRM; END;
  PERFORM _d9k('C','C1 a quarantined lot cannot be dispensed through the RPC',
    ok, left(coalesce(msg,''),180));

  ok := false; msg := NULL;
  BEGIN PERFORM public.material_dispense(b1, lr, 10.0, current_setting('d9.bal')::uuid);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'MATERIAL_DISPENSE_BLOCKED%'; msg := SQLERRM; END;
  PERFORM _d9k('C','C2 nor can a rejected lot', ok, left(coalesce(msg,''),180));

  --  THE CLAUSE, exactly: a direct call.
  ok := false; msg := NULL;
  BEGIN
    INSERT INTO public.dispensing_records
      (company_id,batch_id,material_id,material_lot_id,internal_lot_number,
       required_quantity,actual_quantity,unit,balance_identifier,instrument_id,dispensed_by)
    VALUES (current_setting('d9.c_a')::uuid, b1, current_setting('d9.m_api')::uuid, lq,
            'x', 10.0, 10.0, 'kg', 'pending', current_setting('d9.bal')::uuid, current_setting('d9.u_op')::uuid);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'MATERIAL_DISPENSE_BLOCKED%'; msg := SQLERRM; END;
  PERFORM _d9k('C','C3 a quarantined lot cannot be dispensed by a DIRECT INSERT either',
    ok, left(coalesce(msg,''),180));

  ok := false; msg := NULL;
  BEGIN
    INSERT INTO public.dispensing_records
      (company_id,batch_id,material_id,material_lot_id,internal_lot_number,
       required_quantity,actual_quantity,unit,balance_identifier,instrument_id,dispensed_by)
    VALUES (current_setting('d9.c_a')::uuid, b1, current_setting('d9.m_api')::uuid, lr,
            'x', 10.0, 10.0, 'kg', 'pending', current_setting('d9.bal')::uuid, current_setting('d9.u_op')::uuid);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'MATERIAL_DISPENSE_BLOCKED%'; msg := SQLERRM; END;
  PERFORM _d9k('C','C4 nor a rejected one', ok, left(coalesce(msg,''),180));

  PERFORM _d9k('C','C5 and neither blocked lot lost any quantity',
    (SELECT quantity_available FROM public.material_lots WHERE id=lq) = 50.0
    AND (SELECT quantity_available FROM public.material_lots WHERE id=lr) = 50.0);

  --  More than the lot holds.
  ok := false; msg := NULL;
  BEGIN PERFORM public.material_dispense(b1, current_setting('d9.lot_ok')::uuid, 500.0, current_setting('d9.bal')::uuid);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'MATERIAL_DISPENSE_BLOCKED%'; msg := SQLERRM; END;
  PERFORM _d9k('C','C6 and a lot cannot be overdrawn in one go', ok, left(coalesce(msg,''),180));
END
$c$;


-- =====================================================================
--  D — coherence: material, units, stage, formula version, closed batch
-- =====================================================================
DO $d$
DECLARE
  b1 uuid := current_setting('d9.b1')::uuid;
  lot uuid := current_setting('d9.lot_ok')::uuid;
  lg  uuid := current_setting('d9.lot_g')::uuid;
  ok boolean; msg text;
BEGIN
  --  A lot of the wrong material. Through a direct insert, because the
  --  RPC takes the material FROM the lot and cannot express the error.
  ok := false; msg := NULL;
  BEGIN
    INSERT INTO public.dispensing_records
      (company_id,batch_id,material_id,material_lot_id,internal_lot_number,
       required_quantity,actual_quantity,unit,balance_identifier,instrument_id,dispensed_by)
    VALUES (current_setting('d9.c_a')::uuid, b1, current_setting('d9.m_exc')::uuid, lot,
            'x', 10.0, 10.0, 'kg', 'pending', current_setting('d9.bal')::uuid, current_setting('d9.u_op')::uuid);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'DISPENSE_MATERIAL_MISMATCH%'; msg := SQLERRM; END;
  PERFORM _d9k('D','D1 a lot cannot be dispensed as a different material',
    ok, left(coalesce(msg,''),180));

  --  THE UNIT TRAP. The formula asks for 50 kg of sorbitol; the lot is
  --  held in grams. Every number is positive and in range, and the
  --  tolerance arithmetic would be comparing kg against g.
  ok := false; msg := NULL;
  BEGIN
    PERFORM public.material_dispense(b1, lg, 50000.0, current_setting('d9.bal')::uuid,
              current_setting('d9.fm_exc')::uuid);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'DISPENSE_FORMULA_UNIT_MISMATCH%'; msg := SQLERRM; END;
  PERFORM _d9k('D','D2 a formula in kg cannot be satisfied from a lot held in g',
    ok, left(coalesce(msg,''),180));

  PERFORM _d9k('D','D3 the refusal names both units rather than guessing a conversion',
    msg LIKE '%kg%' AND msg LIKE '%g%' AND msg LIKE '%no conversion is applied%',
    left(coalesce(msg,''),180));

  --  A dispensing unit that disagrees with the lot, by direct insert.
  ok := false; msg := NULL;
  BEGIN
    INSERT INTO public.dispensing_records
      (company_id,batch_id,material_id,material_lot_id,internal_lot_number,
       required_quantity,actual_quantity,unit,balance_identifier,instrument_id,dispensed_by)
    VALUES (current_setting('d9.c_a')::uuid, b1, current_setting('d9.m_api')::uuid, lot,
            'x', 10.0, 10.0, 'g', 'pending', current_setting('d9.bal')::uuid, current_setting('d9.u_op')::uuid);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'DISPENSE_UNIT_MISMATCH%'; msg := SQLERRM; END;
  PERFORM _d9k('D','D4 nor can a dispensing be recorded in a unit the lot is not held in',
    ok, left(coalesce(msg,''),180));

  --  A stage belonging to another batch.
  ok := false; msg := NULL;
  BEGIN
    PERFORM public.material_dispense(b1, lot, 24.0, current_setting('d9.bal')::uuid,
              current_setting('d9.fm_api')::uuid,
              (SELECT id FROM public.batch_stages
                WHERE batch_id = current_setting('d9.b2')::uuid LIMIT 1));
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'DISPENSE_STAGE_MISMATCH%'; msg := SQLERRM; END;
  PERFORM _d9k('D','D5 a stage of another batch cannot be named', ok, left(coalesce(msg,''),180));

  --  Item 10 replaced the free-text balance with a registered
  --  instrument, so "the balance has to be recorded" is now "the balance
  --  has to be an instrument whose calibration can be checked". The
  --  lockout itself is asserted in that item's own suite; here it is the
  --  requirement that matters, because dispensing is where it bites.
  ok := false; msg := NULL;
  BEGIN PERFORM public.material_dispense(b1, lot, 24.0, NULL,
              current_setting('d9.fm_api')::uuid);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'DISPENSE_NO_INSTRUMENT%'; msg := SQLERRM; END;
  PERFORM _d9k('D','D6 the balance has to be a registered instrument', ok, left(coalesce(msg,''),180));

  --  And a direct INSERT naming no instrument is refused too, which is
  --  what stops the lockout being bypassed by the path item 09's own
  --  NOT DONE IF warns about.
  ok := false; msg := NULL;
  BEGIN
    INSERT INTO public.dispensing_records
      (company_id,batch_id,material_id,material_lot_id,internal_lot_number,
       required_quantity,actual_quantity,unit,balance_identifier,dispensed_by)
    VALUES (current_setting('d9.c_a')::uuid, b1, current_setting('d9.m_api')::uuid, lot,
            'x', 24.0, 24.0, 'kg', 'BAL-07', current_setting('d9.u_op')::uuid);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'DISPENSE_NO_INSTRUMENT%'; msg := SQLERRM; END;
  PERFORM _d9k('D','D6a nor can a direct insert name a balance as free text',
    ok, left(coalesce(msg,''),180));

  ok := false; msg := NULL;
  BEGIN PERFORM public.material_dispense(b1, lot, 0, current_setting('d9.bal')::uuid);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'DISPENSE_BAD_QUANTITY%'; msg := SQLERRM; END;
  PERFORM _d9k('D','D7 and a zero quantity is not a dispensing', ok, left(coalesce(msg,''),180));
END
$d$;


-- =====================================================================
--  E — tolerance and supervisor authorisation
-- =====================================================================
DO $e$
DECLARE
  b1 uuid := current_setting('d9.b1')::uuid;
  lot uuid := current_setting('d9.lot_ok')::uuid;
  lexh uuid := current_setting('d9.lot_exh')::uuid;
  fm_api uuid := current_setting('d9.fm_api')::uuid;
  fm_exc uuid := current_setting('d9.fm_exc')::uuid;
  r jsonb; ok boolean; msg text;
BEGIN
  --  +/-2% of 24 kg is 0.48. 24.4 is inside; 25.0 is not.
  r := public.material_dispense(b1, lot, 24.4, current_setting('d9.bal')::uuid, fm_api);
  PERFORM _d9k('E','E1 a quantity inside the formula tolerance needs no authorisation',
    (r->>'tolerance_exception')='false', coalesce(r::text,'NULL'));

  ok := false; msg := NULL;
  BEGIN PERFORM public.material_dispense(b1, lot, 25.0, current_setting('d9.bal')::uuid, fm_api);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'DISPENSE_AUTHORISATION_REQUIRED%'; msg := SQLERRM; END;
  PERFORM _d9k('E','E2 one outside it is refused without a supervisor and a reason',
    ok, left(coalesce(msg,''),180));

  --  A supervisor with no reason is not an authorisation.
  ok := false; msg := NULL;
  BEGIN PERFORM public.material_dispense(b1, lot, 25.0, current_setting('d9.bal')::uuid, fm_api,
          p_authorised_by => current_setting('d9.u_sup')::uuid);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'DISPENSE_AUTHORISATION_REQUIRED%'; msg := SQLERRM; END;
  PERFORM _d9k('E','E3 a named supervisor with no reason is still refused',
    ok, left(coalesce(msg,''),180));

  --  The dispenser authorising themselves.
  ok := false; msg := NULL;
  BEGIN PERFORM public.material_dispense(b1, lot, 25.0, current_setting('d9.bal')::uuid, fm_api,
          p_authorised_by => current_setting('d9.u_op')::uuid,
          p_authorisation_reason => 'it is fine');
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'DISPENSE_SELF_AUTHORISED%'; msg := SQLERRM; END;
  PERFORM _d9k('E','E4 the dispenser cannot authorise their own deviation',
    ok, left(coalesce(msg,''),180));

  --  Somebody who is not in the company.
  ok := false; msg := NULL;
  BEGIN PERFORM public.material_dispense(b1, lot, 25.0, current_setting('d9.bal')::uuid, fm_api,
          p_authorised_by => current_setting('d9.u_b')::uuid,
          p_authorisation_reason => 'an outsider says so');
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'DISPENSE_AUTHORISER_UNKNOWN%'; msg := SQLERRM; END;
  PERFORM _d9k('E','E5 nor can an outsider authorise it', ok, left(coalesce(msg,''),180));

  --  Properly authorised.
  r := public.material_dispense(b1, lot, 25.0, current_setting('d9.bal')::uuid, fm_api,
         p_authorised_by => current_setting('d9.u_sup')::uuid,
         p_authorisation_reason => 'Scale drift on BAL-07; excess within the 5% process allowance and documented in the batch record');
  PERFORM _d9k('E','E6 with a supervisor and a reason it saves',
    (r->>'tolerance_exception')='true', coalesce(r::text,'NULL'));

  PERFORM _d9k('E','E7 and the authorisation is on the record',
    (SELECT tolerance_exception
        AND authorised_by = current_setting('d9.u_sup')::uuid
        AND authorisation_reason LIKE 'Scale drift%'
       FROM public.dispensing_records WHERE id=(r->>'dispensing_id')::uuid));

  --  THE UNDECLARED TOLERANCE. The excipient line declares none, so the
  --  system refuses rather than inventing one — and says what to do.
  ok := false; msg := NULL;
  BEGIN PERFORM public.material_dispense(b1, lexh, 49.0, current_setting('d9.bal')::uuid, fm_exc);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'DISPENSE_AUTHORISATION_REQUIRED%'; msg := SQLERRM; END;
  PERFORM _d9k('E','E8 a formula line with no declared tolerance fails closed',
    ok, left(coalesce(msg,''),180));

  --  ...and an exact match on that line needs nothing.
  r := public.material_dispense(b1, lexh, 50.0, current_setting('d9.bal')::uuid, fm_exc);
  PERFORM _d9k('E','E9 while an exact match on it needs no authorisation',
    (r->>'tolerance_exception')='false', coalesce(r::text,'NULL'));

  --  The flag is derived, not asserted: a direct insert claiming an
  --  exception on an in-tolerance quantity is refused.
  ok := false; msg := NULL;
  BEGIN
    INSERT INTO public.dispensing_records
      (company_id,batch_id,formula_material_id,material_id,material_lot_id,internal_lot_number,
       required_quantity,actual_quantity,unit,balance_identifier,instrument_id,dispensed_by,
       tolerance_exception,authorised_by,authorisation_reason)
    VALUES (current_setting('d9.c_a')::uuid, b1, fm_api, current_setting('d9.m_api')::uuid, lot,
            'x', 24.0, 24.0, 'kg', 'pending', current_setting('d9.bal')::uuid, current_setting('d9.u_op')::uuid,
            true, current_setting('d9.u_sup')::uuid, 'invented');
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'DISPENSE_NOT_OUT_OF_TOLERANCE%'; msg := SQLERRM; END;
  PERFORM _d9k('E','E10 an exception cannot be claimed where there is none',
    ok, left(coalesce(msg,''),180));

  --  And the reverse: a direct insert outside tolerance with no
  --  authorisation at all. 26.0 against a required 24.0 is outside the
  --  +/-2% (0.48) band, and deliberately WITHIN what the lot still holds
  --  — the dispensability gate runs before the tolerance gate, so asking
  --  for more than the lot has would test the wrong refusal.
  ok := false; msg := NULL;
  BEGIN
    INSERT INTO public.dispensing_records
      (company_id,batch_id,formula_material_id,material_id,material_lot_id,internal_lot_number,
       required_quantity,actual_quantity,unit,balance_identifier,instrument_id,dispensed_by)
    VALUES (current_setting('d9.c_a')::uuid, b1, fm_api, current_setting('d9.m_api')::uuid, lot,
            'x', 24.0, 26.0, 'kg', 'pending', current_setting('d9.bal')::uuid, current_setting('d9.u_op')::uuid);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'DISPENSE_OUT_OF_TOLERANCE%'; msg := SQLERRM; END;
  PERFORM _d9k('E','E11 and a direct insert outside tolerance is refused outright',
    ok, left(coalesce(msg,''),180));

  --  E2 and E3 above prove the RPC demands a supervisor and a reason.
  --  They do NOT prove the TABLE does, and mutation testing showed
  --  exactly that: dropping dr_authorisation_complete_chk left the suite
  --  green because every probe went through the RPC. The gate lets these
  --  inserts past — the quantity really is out of tolerance and the flag
  --  really is set — so the constraint is the only thing left.
  ok := false; msg := NULL;
  BEGIN
    INSERT INTO public.dispensing_records
      (company_id,batch_id,formula_material_id,material_id,material_lot_id,internal_lot_number,
       required_quantity,actual_quantity,unit,balance_identifier,instrument_id,dispensed_by,tolerance_exception)
    VALUES (current_setting('d9.c_a')::uuid, b1, fm_api, current_setting('d9.m_api')::uuid, lot,
            'x', 24.0, 26.0, 'kg', 'pending', current_setting('d9.bal')::uuid, current_setting('d9.u_op')::uuid, true);
  EXCEPTION WHEN others THEN ok := true; msg := SQLERRM; END;
  PERFORM _d9k('E','E12 the table refuses an exception with no authoriser or reason',
    ok, left(coalesce(msg,''),180));

  ok := false; msg := NULL;
  BEGIN
    INSERT INTO public.dispensing_records
      (company_id,batch_id,formula_material_id,material_id,material_lot_id,internal_lot_number,
       required_quantity,actual_quantity,unit,balance_identifier,instrument_id,dispensed_by,
       tolerance_exception,authorised_by,authorisation_reason)
    VALUES (current_setting('d9.c_a')::uuid, b1, fm_api, current_setting('d9.m_api')::uuid, lot,
            'x', 24.0, 26.0, 'kg', 'pending', current_setting('d9.bal')::uuid, current_setting('d9.u_op')::uuid,
            true, current_setting('d9.u_op')::uuid, 'I authorise myself');
  EXCEPTION WHEN others THEN ok := true; msg := SQLERRM; END;
  PERFORM _d9k('E','E13 and refuses a dispenser who authorises their own deviation',
    ok, left(coalesce(msg,''),180));
END
$e$;


-- =====================================================================
--  F — dispenser and verifier
-- =====================================================================
DO $f$
DECLARE d uuid := current_setting('d9.d1')::uuid; ok boolean; msg text;
BEGIN
  ok := false; msg := NULL;
  BEGIN PERFORM public.material_dispense_verify(d);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'DISPENSE_SELF_VERIFIED%'; msg := SQLERRM; END;
  PERFORM _d9k('F','F1 the dispenser cannot verify their own dispensing',
    ok, left(coalesce(msg,''),180));

  --  The table CHECK, which no write path can walk around.
  ok := false; msg := NULL;
  BEGIN
    UPDATE public.dispensing_records
       SET verified_by = dispensed_by, verified_at = now() WHERE id = d;
  EXCEPTION WHEN others THEN ok := true; msg := SQLERRM; END;
  PERFORM _d9k('F','F2 nor can a direct write make it self-verified',
    ok, left(coalesce(msg,''),180));
END
$f$;

SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('d9.u_qa'), 'role','authenticated')::text, false);
DO $f2$
DECLARE d uuid := current_setting('d9.d1')::uuid; ok boolean; msg text;
BEGIN
  PERFORM public.material_dispense_verify(d);
  PERFORM _d9k('F','F3 a second person verifies it',
    (SELECT verified_by = current_setting('d9.u_qa')::uuid AND verified_at IS NOT NULL
       FROM public.dispensing_records WHERE id=d));

  ok := false; msg := NULL;
  BEGIN PERFORM public.material_dispense_verify(d);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'DISPENSE_ALREADY_VERIFIED%'; msg := SQLERRM; END;
  PERFORM _d9k('F','F4 and it cannot be verified twice', ok, left(coalesce(msg,''),180));
END
$f2$;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('d9.u_op'), 'role','authenticated')::text, false);


-- =====================================================================
--  G — the link and the decrement, together or not at all
--
--  NOT DONE IF: "The link is written but the quantity is not decremented,
--  or the reverse."
-- =====================================================================
DO $g$
DECLARE
  b1 uuid := current_setting('d9.b1')::uuid;
  lot uuid := current_setting('d9.lot_ok')::uuid;
  n integer; v_sum numeric; v_edge numeric;
BEGIN
  --  THE ANTI-DRIFT ASSERTION. batch_material_genealogy is an aggregate
  --  maintained by trigger, so it could in principle disagree with the
  --  rows it is derived from. Checked for every edge in the company, not
  --  just the one above.
  SELECT count(*) INTO n
    FROM public.batch_material_genealogy g
    CROSS JOIN LATERAL (
      SELECT coalesce(sum(d.actual_quantity),0) AS qty, count(*)::integer AS cnt
        FROM public.dispensing_records d
       WHERE d.batch_id = g.batch_id AND d.material_lot_id = g.material_lot_id
    ) src
   WHERE g.company_id = current_setting('d9.c_a')::uuid
     AND (g.total_quantity, g.dispensing_count) IS DISTINCT FROM (src.qty, src.cnt);
  PERFORM _d9k('G','G1 every genealogy edge agrees with the dispensings behind it',
    n = 0, n||' edge(s) disagree');

  --  And the lot's remaining quantity agrees with what left it.
  SELECT coalesce(sum(actual_quantity),0) INTO v_sum
    FROM public.dispensing_records WHERE material_lot_id = lot;
  PERFORM _d9k('G','G2 the lot''s remaining quantity agrees with what left it',
    (SELECT quantity_received - v_sum = quantity_available
       FROM public.material_lots WHERE id=lot),
    (SELECT format('received %s, dispensed %s, available %s',
                   quantity_received, v_sum, quantity_available)
       FROM public.material_lots WHERE id=lot));

  --  Several dispensings of one lot to one batch collapse to ONE edge,
  --  which is the shape a trace query wants.
  SELECT count(*) INTO n FROM public.batch_material_genealogy
   WHERE batch_id=b1 AND material_lot_id=lot;
  PERFORM _d9k('G','G3 repeated dispensings of one lot make one edge, not many',
    n = 1, n||' edge(s)');

  SELECT total_quantity INTO v_edge FROM public.batch_material_genealogy
   WHERE batch_id=b1 AND material_lot_id=lot;
  PERFORM _d9k('G','G4 and the edge carries the running total',
    v_edge = 24.0 + 24.4 + 25.0, coalesce(v_edge::text,'NULL'));

  --  The recall direction: where did this lot go.
  PERFORM _d9k('G','G5 the edge is traversable backwards, from lot to batches',
    (SELECT count(DISTINCT batch_id) FROM public.batch_material_genealogy
      WHERE material_lot_id=lot) = 1);

  --  A lot dispensed to nothing is exhausted, derived rather than swept.
  PERFORM _d9k('G','G6 a lot dispensed to zero becomes exhausted',
    (SELECT quantity_available = 0 AND status = 'exhausted'
       FROM public.material_lots WHERE id=current_setting('d9.lot_exh')::uuid),
    (SELECT format('%s / %s', quantity_available, status)
       FROM public.material_lots WHERE id=current_setting('d9.lot_exh')::uuid));

  --  The genealogy table takes no hand-written rows. An edge a client
  --  could write is an edge a trace query would repeat as fact.
  PERFORM _d9k('G','G7 the application role cannot write a genealogy edge by hand',
    NOT has_table_privilege('authenticated','public.batch_material_genealogy','INSERT')
    AND NOT has_table_privilege('authenticated','public.batch_material_genealogy','UPDATE'));
END
$g$;


-- =====================================================================
--  H — two operators, one lot, at the same moment
--
--  NOT DONE IF: "Two operators dispensing one lot at the same moment can
--  take it below zero."
--
--  This needs a SECOND BACKEND, so dblink opens one. The hazard is not
--  really a negative number — material_lots has a CHECK for that. It is
--  the LOST UPDATE: both sessions read 100, both compute 100 - 60, both
--  write 40, and 120 kg has left a lot that held 100 while no constraint
--  ever fired.
-- =====================================================================
RESET ROLE;
DO $h$
DECLARE
  b4 uuid := current_setting('d9.b4')::uuid;
  lot uuid := current_setting('d9.lot_conc')::uuid;
  c_a uuid := current_setting('d9.c_a')::uuid;
  m uuid := current_setting('d9.m_api')::uuid;
  u uuid := current_setting('d9.u_op')::uuid;
  v_sql text; ok boolean; msg text;
BEGIN
  PERFORM _d9k('H','H1 a second backend is available to test this with',
    (SELECT count(*) FROM pg_extension WHERE extname='dblink') = 1);

  PERFORM dblink_connect('d9b', 'dbname='||current_database());
  --  So session B gives up instead of hanging this script forever.
  PERFORM dblink_exec('d9b', 'SET statement_timeout = ''2000ms''');

  v_sql := format(
    'INSERT INTO public.dispensing_records
       (company_id,batch_id,material_id,material_lot_id,internal_lot_number,
        required_quantity,actual_quantity,unit,balance_identifier,instrument_id,dispensed_by)
     VALUES (%L,%L,%L,%L,%L,%s,%s,%L,%L,%L,%L)',
    c_a, b4, m, lot, 'x', 60, 60, 'kg', 'pending', current_setting('d9.bal')::uuid, u);
  PERFORM set_config('d9.concsql', v_sql, false);

  --  SESSION A — this one — takes 60 and does not commit yet, because
  --  everything in a DO block is one transaction.
  INSERT INTO public.dispensing_records
    (company_id,batch_id,material_id,material_lot_id,internal_lot_number,
     required_quantity,actual_quantity,unit,balance_identifier,instrument_id,dispensed_by)
  VALUES (c_a, b4, m, lot, 'x', 60, 60, 'kg', 'pending', current_setting('d9.bal')::uuid, u);

  --  SESSION B tries the same 60 while A holds the row lock. It must
  --  BLOCK — not read the stale 100 and proceed. The timeout is what
  --  proves it blocked.
  ok := false; msg := NULL;
  BEGIN
    PERFORM dblink_exec('d9b', v_sql);
    msg := 'SESSION B WAS NOT BLOCKED — IT DISPENSED FROM A LOCKED LOT';
  --  query_canceled is named EXPLICITLY. PL/pgSQL's `WHEN OTHERS` does
  --  not trap it, by design, so the timeout that proves session B blocked
  --  would otherwise escape this handler and abort the suite — which is
  --  how this was found.
  EXCEPTION WHEN query_canceled OR others THEN
    ok := SQLERRM ILIKE '%timeout%' OR SQLERRM ILIKE '%canceling statement%';
    msg := SQLERRM;
  END;
  PERFORM _d9k('H','H2 a concurrent dispensing BLOCKS on the locked lot',
    ok, left(coalesce(msg,''),200));
END
$h$;

--  A's 60 is committed now. B retries.
DO $h2$
DECLARE ok boolean; msg text; lot uuid := current_setting('d9.lot_conc')::uuid; n integer;
BEGIN
  PERFORM _d9k('H','H3 after the first commits, the lot is down to 40',
    (SELECT quantity_available FROM public.material_lots WHERE id=lot) = 40.0,
    (SELECT quantity_available::text FROM public.material_lots WHERE id=lot));

  --  THE CLAUSE. B's predicate is re-evaluated against the committed row,
  --  so it sees 40, fails `quantity_available >= 60`, updates no rows,
  --  and is refused. A lost update would have left the lot at 40 with
  --  120 kg dispensed.
  ok := false; msg := NULL;
  BEGIN
    PERFORM dblink_exec('d9b', current_setting('d9.concsql'));
    msg := 'SESSION B OVERDREW THE LOT';
  EXCEPTION WHEN others THEN
    ok := SQLERRM LIKE '%DISPENSE_INSUFFICIENT_QUANTITY%'
       OR SQLERRM LIKE '%MATERIAL_DISPENSE_BLOCKED%';
    msg := SQLERRM;
  END;
  PERFORM _d9k('H','H4 and is then refused rather than overdrawing the lot',
    ok, left(coalesce(msg,''),200));

  PERFORM _d9k('H','H5 the lot never went below zero',
    (SELECT quantity_available >= 0 FROM public.material_lots WHERE id=lot),
    (SELECT quantity_available::text FROM public.material_lots WHERE id=lot));

  SELECT count(*) INTO n FROM public.dispensing_records WHERE material_lot_id=lot;
  PERFORM _d9k('H','H6 and exactly one of the two dispensings exists',
    n = 1, n||' record(s)');

  PERFORM _d9k('H','H7 the quantity that left equals the quantity recorded',
    (SELECT quantity_received - quantity_available FROM public.material_lots WHERE id=lot)
    = (SELECT coalesce(sum(actual_quantity),0) FROM public.dispensing_records WHERE material_lot_id=lot));

  --  B can still take what is actually there.
  ok := false; msg := NULL;
  BEGIN
    PERFORM dblink_exec('d9b', replace(current_setting('d9.concsql'), '60,60', '40,40'));
    ok := true;
  EXCEPTION WHEN others THEN msg := SQLERRM; END;
  PERFORM _d9k('H','H8 but may take the 40 that remain', ok, left(coalesce(msg,''),200));

  PERFORM _d9k('H','H9 which exhausts the lot',
    (SELECT quantity_available = 0 AND status='exhausted'
       FROM public.material_lots WHERE id=lot),
    (SELECT format('%s / %s', quantity_available, status)
       FROM public.material_lots WHERE id=lot));

  PERFORM dblink_disconnect('d9b');
END
$h2$;

-- ─────────────────────────────────────────────────────────────────────
--  H, second half — THE LOST UPDATE ITSELF
--
--  Everything above proves session B BLOCKS and that, retried afterwards,
--  it is refused. That is necessary and it is not sufficient, and
--  mutation testing is what showed the difference: replacing the atomic
--  conditional UPDATE with the naive
--
--      SELECT quantity_available INTO v;
--      IF v < qty THEN RAISE; END IF;
--      UPDATE ... SET quantity_available = v - qty;
--
--  left the whole suite green. The reason is that B's statement_timeout
--  fired while A still held the lock, so B gave up before A committed —
--  and the lost-update window never opened.
--
--  The window only opens if B is STILL WAITING when A commits. So B's
--  statement is sent ASYNCHRONOUSLY, with no timeout, and its result is
--  collected after A's transaction has ended:
--
--      A: insert 60, still uncommitted, holding the row lock
--      B: send 60 asynchronously — reads 100, then blocks on the UPDATE
--      A: commits; the lot is now 40
--      B: unblocks
--
--  With the naive decrement B now writes 100 - 60 = 40 from the value it
--  read before A committed: 120 kg has left a lot that held 100, the
--  column says 40, and no constraint fired. With the atomic conditional
--  UPDATE, Postgres re-evaluates the WHERE clause against the committed
--  row, sees 40, matches nothing, and the ROW_COUNT check refuses it.
-- ─────────────────────────────────────────────────────────────────────
DO $h3$
DECLARE
  b5 uuid := current_setting('d9.b5')::uuid;
  lot uuid := current_setting('d9.lot_conc2')::uuid;
  c_a uuid := current_setting('d9.c_a')::uuid;
  m uuid := current_setting('d9.m_api')::uuid;
  u uuid := current_setting('d9.u_op')::uuid;
  v_sql text;
BEGIN
  PERFORM _d9k('H','H10 the second lot starts at 100 and is untouched',
    (SELECT quantity_available FROM public.material_lots WHERE id=lot) = 100.0
    AND NOT EXISTS (SELECT 1 FROM public.dispensing_records WHERE material_lot_id=lot),
    (SELECT quantity_available::text FROM public.material_lots WHERE id=lot));

  PERFORM dblink_connect('d9c', 'dbname='||current_database());
  --  No timeout: B must WAIT for the lock, not give up. The whole point.
  PERFORM dblink_exec('d9c', 'SET statement_timeout = 0');

  v_sql := format(
    'INSERT INTO public.dispensing_records
       (company_id,batch_id,material_id,material_lot_id,internal_lot_number,
        required_quantity,actual_quantity,unit,balance_identifier,instrument_id,dispensed_by)
     VALUES (%L,%L,%L,%L,%L,%s,%s,%L,%L,%L,%L)',
    c_a, b5, m, lot, 'x', 60, 60, 'kg', 'pending', current_setting('d9.bal')::uuid, u);
  PERFORM set_config('d9.conc2sql', v_sql, false);

  --  A takes 60 and holds the lock for the rest of this DO block.
  INSERT INTO public.dispensing_records
    (company_id,batch_id,material_id,material_lot_id,internal_lot_number,
     required_quantity,actual_quantity,unit,balance_identifier,instrument_id,dispensed_by)
  VALUES (c_a, b5, m, lot, 'x', 60, 60, 'kg', 'pending', current_setting('d9.bal')::uuid, u);

  --  B is sent on its way and left waiting. dblink_send_query returns as
  --  soon as the query is WRITTEN TO THE SOCKET, which is well before the
  --  remote backend has executed any of it — so without the pause below,
  --  A commits first and B reads a fresh quantity. That is precisely what
  --  made this test miss a read-modify-write decrement: the lost-update
  --  window never opened and the suite went green on the broken version.
  --
  --  Half a second is far longer than B needs to parse, plan and reach
  --  its read (microseconds), and dblink_is_busy afterwards is then a
  --  meaningful assertion: B is BLOCKED ON THE LOCK, not merely queued.
  PERFORM dblink_send_query('d9c', v_sql);
  PERFORM pg_sleep(0.5);

  PERFORM _d9k('H','H11 session B has started and is blocked on the lock',
    dblink_is_busy('d9c') = 1, 'busy='||dblink_is_busy('d9c'));
END
$h3$;

--  This DO block ended, so A has COMMITTED. B is unblocking now.
DO $h4$
DECLARE
  lot uuid := current_setting('d9.lot_conc2')::uuid;
  st text; ok boolean; msg text; n integer; v_disp numeric;
BEGIN
  ok := false; msg := NULL;
  BEGIN
    SELECT * INTO st FROM dblink_get_result('d9c') AS t(status text);
    msg := 'SESSION B SUCCEEDED AFTER WAITING: '||coalesce(st,'(null)');
  EXCEPTION WHEN query_canceled OR others THEN
    ok := SQLERRM LIKE '%DISPENSE_INSUFFICIENT_QUANTITY%'
       OR SQLERRM LIKE '%MATERIAL_DISPENSE_BLOCKED%';
    msg := SQLERRM;
  END;
  PERFORM _d9k('H','H12 B is refused when it unblocks, not served from a stale read',
    ok, left(coalesce(msg,''),200));

  PERFORM _d9k('H','H13 the lot is at 40, and only 60 ever left it',
    (SELECT quantity_available FROM public.material_lots WHERE id=lot) = 40.0,
    (SELECT quantity_available::text FROM public.material_lots WHERE id=lot));

  SELECT count(*), coalesce(sum(actual_quantity),0) INTO n, v_disp
    FROM public.dispensing_records WHERE material_lot_id=lot;
  PERFORM _d9k('H','H14 exactly one of the two dispensings exists',
    n = 1, n||' record(s)');

  --  THE CONSERVATION LAW, which is what the clause is really about:
  --  what left the lot equals what was recorded as leaving it.
  PERFORM _d9k('H','H15 what left the lot equals what was recorded leaving it',
    (SELECT quantity_received - quantity_available FROM public.material_lots WHERE id=lot) = v_disp,
    (SELECT format('gone %s, recorded %s',
                   quantity_received - quantity_available, v_disp)
       FROM public.material_lots WHERE id=lot));

  PERFORM _d9k('H','H16 and the genealogy edge agrees',
    (SELECT total_quantity FROM public.batch_material_genealogy
      WHERE material_lot_id=lot) = v_disp);

  PERFORM dblink_disconnect('d9c');
END
$h4$;
SET ROLE authenticated;


-- =====================================================================
--  I — immutability
-- =====================================================================
DO $i$
DECLARE d uuid := current_setting('d9.d1')::uuid; ok boolean; msg text; n integer;
BEGIN
  ok := false; msg := NULL;
  BEGIN UPDATE public.dispensing_records SET actual_quantity = 1 WHERE id=d;
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'DISPENSE_IMMUTABLE%'; msg := SQLERRM; END;
  PERFORM _d9k('I','I1 the dispensed quantity cannot be edited after the fact',
    ok, left(coalesce(msg,''),180));

  ok := false; msg := NULL;
  BEGIN UPDATE public.dispensing_records SET material_lot_id = current_setting('d9.lot_q')::uuid WHERE id=d;
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'DISPENSE_IMMUTABLE%'; msg := SQLERRM; END;
  PERFORM _d9k('I','I2 nor the lot it came from', ok, left(coalesce(msg,''),180));

  ok := false; msg := NULL;
  BEGIN DELETE FROM public.dispensing_records WHERE id=d;
  EXCEPTION WHEN others THEN
    ok := SQLERRM LIKE 'DISPENSE_IMMUTABLE%' OR SQLERRM LIKE 'permission denied%';
    msg := SQLERRM;
  END;
  PERFORM _d9k('I','I3 and a dispensing cannot be deleted', ok, left(coalesce(msg,''),180));

  --  The notes CAN be edited — nothing is derived from them.
  UPDATE public.dispensing_records SET notes = 'Weighed on the bench scale' WHERE id=d;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM _d9k('I','I4 while the notes, which nothing derives from, stay editable',
    n = 1, n||' row(s)');
END
$i$;

RESET ROLE;
DO $i2$
DECLARE d uuid := current_setting('d9.d1')::uuid; ok boolean; msg text;
BEGIN
  ok := false; msg := NULL;
  BEGIN DELETE FROM public.dispensing_records WHERE id=d;
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'DISPENSE_IMMUTABLE%'; msg := SQLERRM; END;
  PERFORM _d9k('I','I5 the immutability trigger refuses a delete on its own',
    ok, left(coalesce(msg,''),180));
END
$i2$;
SET ROLE authenticated;


-- =====================================================================
--  J — tenancy
-- =====================================================================
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('d9.u_b'), 'role','authenticated')::text, false);
DO $j$
DECLARE
  c_a uuid := current_setting('d9.c_a')::uuid;
  b1 uuid := current_setting('d9.b1')::uuid;
  lot uuid := current_setting('d9.lot_ok')::uuid;
  n integer; ok boolean; msg text;
BEGIN
  SELECT count(*) INTO n FROM public.dispensing_records WHERE company_id=c_a;
  PERFORM _d9k('J','J1 another company cannot see the dispensings', n=0, n||' row(s)');

  SELECT count(*) INTO n FROM public.batch_material_genealogy WHERE company_id=c_a;
  PERFORM _d9k('J','J2 nor the genealogy — which is the recall question',
    n=0, n||' row(s)');

  ok := false; msg := NULL;
  BEGIN PERFORM public.material_dispense(b1, lot, 10.0, current_setting('d9.bal')::uuid);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'DISPENSE_FORBIDDEN%'; msg := SQLERRM; END;
  PERFORM _d9k('J','J3 nor dispense against somebody else''s batch', ok, left(coalesce(msg,''),180));

  ok := false; msg := NULL;
  BEGIN PERFORM public.dispensing_block_reason(b1, lot, 10.0);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'DISPENSE_FORBIDDEN%'; msg := SQLERRM; END;
  PERFORM _d9k('J','J4 and the gate refuses to report on it', ok, left(coalesce(msg,''),180));

  ok := false; msg := NULL;
  BEGIN PERFORM public.material_dispense_verify(current_setting('d9.d1')::uuid);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'DISPENSE_%'; msg := SQLERRM; END;
  PERFORM _d9k('J','J5 nor verify one of their dispensings', ok, left(coalesce(msg,''),180));
END
$j$;
RESET ROLE; RESET request.jwt.claims;

DO $j2$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM public.dispensing_records
   WHERE company_id=current_setting('d9.c_a')::uuid;
  PERFORM _d9k('J','J6 and the owner is not locked out of their own', n >= 4, n||' row(s)');
END
$j2$;

DROP FUNCTION IF EXISTS _d9_lot(uuid,numeric,text,text);
DROP FUNCTION IF EXISTS _d9_clear(uuid);

-- =====================================================================
--  K — W4·18: flagged versus blocked, and the picker that never lies
-- =====================================================================
--  The design states one rule that spans all seven screens of this
--  section, and it is the only one written as a definition:
--
--    "Flagged vs blocked: flagged = amber, info icon, 'you can
--     continue with…'; blocked = solid red, ✕, 'can't', no way past
--     it on screen."
--
--  K1-K6 hold the common shape to it. K7-K11 are the picker:
--  "Unapproved lots selectable then refused: no. They are never
--  listed."
--
--  The API line declares 24.0 kg ± 2 %, so 23.5 is inside and 26.0 is
--  outside — the flagged case the gate can only report by refusing.
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('d9.u_op'), 'role','authenticated')::text, false);
SET ROLE authenticated;

DO $k$
DECLARE
  b1 uuid := current_setting('d9.b1')::uuid;
  lot_ok uuid := current_setting('d9.lot_ok')::uuid;
  n integer; r record;
BEGIN
  --  A quantity inside tolerance raises nothing at all. An amber
  --  notice on a correct weight would train people to ignore amber.
  SELECT count(*) INTO n FROM public.dispensing_conditions(b1, lot_ok, 24.0);
  PERFORM _d9k('K','K1 a weight inside tolerance reports no condition', n=0, n||' row(s)');

  --  THE FLAGGED CASE, and the reason the common shape exists.
  SELECT * INTO r FROM public.dispensing_conditions(b1, lot_ok, 26.0)
   WHERE condition_key='out_of_tolerance';
  PERFORM _d9k('K','K2 a weight outside tolerance is flagged, not blocked',
    r.severity='flagged', coalesce(r.severity,'(none)'));

  --  "you can continue with…" — a flagged row without this renders as
  --  that sentence followed by nothing.
  PERFORM _d9k('K','K3 and names who can let the work continue',
    coalesce(btrim(r.continue_with),'') <> '' AND r.continue_with ILIKE '%supervisor%',
    coalesce(r.continue_with,'NULL'));

  --  The detail has to carry the numbers. "Outside tolerance" alone
  --  leaves an operator unable to say how far out, which is the first
  --  thing a supervisor asks.
  PERFORM _d9k('K','K4 and states the allowed range',
    r.detail LIKE '%24.0%' AND r.detail LIKE '%2%',
    coalesce(r.detail,'NULL'));

  --  THE INVARIANT THE WHOLE FILE EXISTS FOR, checked on real rows
  --  rather than only by the deploy assertion.
  SELECT count(*) INTO n FROM public.dispensing_conditions(b1, lot_ok, 26.0)
   WHERE severity NOT IN ('flagged','blocked');
  PERFORM _d9k('K','K5 every condition is flagged or blocked and nothing else', n=0, n||' row(s)');

  SELECT count(*) INTO n FROM public.dispensing_conditions(b1, lot_ok, 26.0)
   WHERE (severity='flagged' AND coalesce(btrim(continue_with),'')='')
      OR (severity='blocked' AND continue_with IS NOT NULL);
  PERFORM _d9k('K','K6 flagged always offers a way on, blocked never does', n=0, n||' row(s)');
END
$k$;

DO $k2$
DECLARE
  b1 uuid := current_setting('d9.b1')::uuid;
  m_api uuid := current_setting('d9.m_api')::uuid;
  lot_ok uuid := current_setting('d9.lot_ok')::uuid;
  n integer; r record;
BEGIN
  --  "They are never listed; the picker says so."
  PERFORM _d9k('K','K7 the approved lot is offered',
    EXISTS (SELECT 1 FROM public.dispensable_lots(b1, m_api) WHERE lot_id=lot_ok));

  --  Quarantined, rejected and exhausted lots must be absent — not
  --  greyed, not listed with a reason: absent.
  SELECT count(*) INTO n FROM public.dispensable_lots(b1, m_api)
   WHERE lot_id IN (current_setting('d9.lot_q')::uuid,
                    current_setting('d9.lot_rej')::uuid,
                    current_setting('d9.lot_exh')::uuid);
  PERFORM _d9k('K','K8 quarantined, rejected and exhausted lots are not listed at all',
    n=0, n||' row(s)');

  --  And the list agrees with the gate on every row it does offer. A
  --  picker that listed something the gate refuses is the exact
  --  failure the design rules out.
  SELECT count(*) INTO n FROM public.dispensable_lots(b1, m_api) dl
   WHERE public.dispensing_block_reason(b1, dl.lot_id, NULL) IS NOT NULL;
  PERFORM _d9k('K','K9 nothing offered would be refused by the gate', n=0, n||' row(s)');

  --  Oldest usable stock first, so nobody takes the newest drum off
  --  the front of the rack and leaves the older one to expire.
  SELECT count(*) INTO n FROM (
    SELECT retest_due_date,
           lag(retest_due_date) OVER () AS prev
      FROM public.dispensable_lots(b1, m_api)) q
   WHERE prev IS NOT NULL AND retest_due_date IS NOT NULL AND retest_due_date < prev;
  PERFORM _d9k('K','K10 the list is ordered oldest first', n=0, n||' out of order');

  --  Every offered lot has stock. A lot with nothing left is not a
  --  choice, it is a dead end one tap in.
  SELECT count(*) INTO n FROM public.dispensable_lots(b1, m_api)
   WHERE quantity_available IS NULL OR quantity_available <= 0;
  PERFORM _d9k('K','K11 every offered lot has stock left', n=0, n||' row(s)');
END
$k2$;

RESET ROLE; RESET request.jwt.claims;

\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo '  WEEK 4 / ITEM 09 — DISPENSING AND GENEALOGY LINKS'
\echo '════════════════════════════════════════════════════════════════'
SELECT section, count(*) AS assertions, count(*) FILTER (WHERE NOT ok) AS failures
  FROM _d9 GROUP BY section ORDER BY section;
SELECT section, name, coalesce(detail,'') AS detail FROM _d9 WHERE NOT ok ORDER BY section, name;
SELECT count(*) AS total, count(*) FILTER (WHERE ok) AS passed,
       count(*) FILTER (WHERE NOT ok) AS failed FROM _d9;

DO $v$
DECLARE f integer;
BEGIN
  SELECT count(*) INTO f FROM _d9 WHERE NOT ok;
  IF f > 0 THEN RAISE EXCEPTION 'ITEM 09: % assertion(s) failed', f; END IF;
  RAISE NOTICE 'ITEM 09: all assertions passed';
END
$v$;

DROP FUNCTION IF EXISTS _d9k(text,text,boolean,text);
DROP TABLE IF EXISTS _d9;
