-- =====================================================================
--  THE NINE DECISIONS, ENFORCED
--
--  Covers 20261126000000 (the attribution the guards read),
--  20261127000000 (signed quality verdicts) and 20261128000000
--  (separations approved beyond PM-03).
--
--  Sections:
--    A. Attribution is written by the server, and frozen
--    B. Decision 1 — the receiver may not disposition
--    C. Decision 2 — nor may the CoA verifier, on a named approval
--    D. Decision 3 — sampling is registered and NOT enforced
--    E. Decision 4 — dispatch cannot precede or predate its release
--    F. Decision 5 — the verdict the release gate reads is signed
--    G. Decision 6 — a correction cannot launder the author
--    H. The decision record itself
-- =====================================================================
\set ON_ERROR_STOP on
SET client_min_messages = warning;

RESET ROLE;
SELECT set_config('request.jwt.claims','', false);

CREATE TEMP TABLE _de(section text, name text, ok boolean, detail text);
GRANT ALL ON _de TO anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION _dek(p_section text, p_name text, p_ok boolean, p_detail text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO _de VALUES (p_section,p_name,coalesce(p_ok,false),p_detail); END $$;

CREATE OR REPLACE FUNCTION _defail(p_sql text)
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RETURN '(no refusal)';
EXCEPTION WHEN OTHERS THEN
  RETURN split_part(SQLERRM, ':', 1);
END $$;
GRANT EXECUTE ON FUNCTION _defail(text) TO anon, authenticated, service_role;


DO $fx$
DECLARE
  c     uuid := gen_random_uuid();
  u_sk  uuid := gen_random_uuid();   -- storekeeper: receives
  u_an  uuid := gen_random_uuid();   -- qc_analyst: tests, verifies CoAs
  u_qa  uuid := gen_random_uuid();   -- qa_manager: dispositions, releases
  u_ps  uuid := gen_random_uuid();   -- production_supervisor: executes
  v_mat uuid := gen_random_uuid();
  v_prod uuid := gen_random_uuid();
  tag   text := substr(replace(gen_random_uuid()::text,'-',''),1,8);
BEGIN
  PERFORM set_config('de.c',    c::text,    false);
  PERFORM set_config('de.u_sk', u_sk::text, false);
  PERFORM set_config('de.u_an', u_an::text, false);
  PERFORM set_config('de.u_qa', u_qa::text, false);
  PERFORM set_config('de.u_ps', u_ps::text, false);
  PERFORM set_config('de.mat',  v_mat::text,false);
  PERFORM set_config('de.prod', v_prod::text,false);

  INSERT INTO public.companies(id,name) VALUES (c,'Decisions '||tag);
  INSERT INTO auth.users(id,email) VALUES
    (u_sk,'sk-'||tag||'@de.test'), (u_an,'an-'||tag||'@de.test'),
    (u_qa,'qa-'||tag||'@de.test'), (u_ps,'ps-'||tag||'@de.test');
  --  Real passwords: 20261127000000 makes recording a verdict a signed
  --  act and there is no test-only signing path.
  UPDATE auth.users
     SET encrypted_password = extensions.crypt('CorrectHorse1!', extensions.gen_salt('bf'))
   WHERE id IN (u_sk,u_an,u_qa,u_ps);
  INSERT INTO public.profiles(id,email,full_name,company_id,role) VALUES
    (u_sk,'sk-'||tag||'@de.test','Tunde Stores',   c,'compliance_officer'),
    (u_an,'an-'||tag||'@de.test','Amaka Analyst',  c,'compliance_officer'),
    (u_qa,'qa-'||tag||'@de.test','Ngozi Quality',  c,'admin'),
    (u_ps,'ps-'||tag||'@de.test','Yemi Supervisor',c,'compliance_officer');
  INSERT INTO public.company_members(company_id,user_id,role,status) VALUES
    (c,u_sk,'viewer','active'), (c,u_an,'viewer','active'),
    (c,u_qa,'admin','active'),  (c,u_ps,'viewer','active');

  PERFORM public.operational_role_assign(c,u_sk,'storekeeper','fixture');
  PERFORM public.operational_role_assign(c,u_an,'qc_analyst','fixture');
  PERFORM public.operational_role_assign(c,u_qa,'qa_manager','fixture');
  PERFORM public.operational_role_assign(c,u_ps,'production_supervisor','fixture');

  INSERT INTO public.company_numbering_formats(company_id,scope,pattern,prefix,seq_width)
  VALUES (c,'material_lot','{PREFIX}-{SEQ}','DE',4)
  ON CONFLICT (company_id,scope) DO NOTHING;

  INSERT INTO public.materials
    (id,company_id,code,name,material_type,criticality,unit_of_measure,created_by)
  VALUES (v_mat,c,'DEM-'||tag,'Lactose','excipient','standard','kg',u_qa);

  INSERT INTO public.products
    (id,company_id,product_code,trade_name,generic_name,category,created_by)
  VALUES (v_prod,c,'DEP-'||tag,'Tablet D','Paracetamol','drug_pharmaceutical',u_qa);
  --  Registered, because a batch cannot be released against a product
  --  still in `concept` — 20260918000000 — and section E needs a
  --  released batch to talk about dispatch at all.
  PERFORM public.lifecycle_transition('product', v_prod, 'start_regulatory_prep', c);
  PERFORM public.lifecycle_transition('product', v_prod, 'submit_to_regulator',   c);
  PERFORM public.lifecycle_transition('product', v_prod, 'record_registration',   c, NULL, 'granted');
END
$fx$;


-- =====================================================================
--  A. Attribution is the server's, and it is frozen
--
--  Every rule below reads one of these columns. Before 20261126000000
--  two of them were written by whoever was asking and one was never
--  written at all.
-- =====================================================================
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('de.u_sk'), 'role','authenticated')::text, false);
SET ROLE authenticated;

DO $a$
DECLARE v_lot uuid;
BEGIN
  --  The storekeeper books a delivery in and NAMES SOMEBODY ELSE as
  --  the receiver. The claim is discarded.
  INSERT INTO public.material_lots
    (id,company_id,material_id,quantity_received,created_by,received_by)
  VALUES (gen_random_uuid(), current_setting('de.c')::uuid,
          current_setting('de.mat')::uuid, 100,
          current_setting('de.u_sk')::uuid, current_setting('de.u_qa')::uuid)
  RETURNING id INTO v_lot;
  PERFORM set_config('de.lot', v_lot::text, false);

  PERFORM _dek('A','A1 the receiver is the caller, not the name on the row',
    (SELECT received_by FROM public.material_lots WHERE id = v_lot)
      = current_setting('de.u_sk')::uuid,
    (SELECT coalesce(received_by::text,'NULL') FROM public.material_lots WHERE id = v_lot));

  --  THE BUG THIS FIXED. receiveLot() never set received_by at all, so
  --  decision 1 read NULL for every lot the application created and
  --  could not fire. A guard installed, attached and unreachable.
  PERFORM _dek('A','A2 so the receipt duty is visible at all',
    public.material_lot_actor_duties(v_lot, current_setting('de.u_sk')::uuid)
      @> ARRAY['receipt'],
    array_to_string(public.material_lot_actor_duties(
      v_lot, current_setting('de.u_sk')::uuid), ', '));

  PERFORM _dek('A','A3 and cannot be moved afterwards',
    _defail(format('UPDATE public.material_lots SET received_by = %L WHERE id = %L',
      current_setting('de.u_qa'), v_lot)) = 'MATERIAL_LOT_RECEIVER_FROZEN',
    _defail(format('UPDATE public.material_lots SET received_by = %L WHERE id = %L',
      current_setting('de.u_qa'), v_lot)));
END $a$;


-- =====================================================================
--  B. Decision 1 — the receiver may not disposition
-- =====================================================================
DO $b$
DECLARE v_lot uuid := current_setting('de.lot')::uuid;
BEGIN
  PERFORM _dek('B','B1 the storekeeper who received it is refused the disposition',
    public.duty_conflict('material_lot', v_lot, 'disposition',
      current_setting('de.u_sk')::uuid) LIKE 'MATERIAL_DISPOSITION_SELF_RECEIVED%',
    public.duty_conflict('material_lot', v_lot, 'disposition',
      current_setting('de.u_sk')::uuid));

  --  AND SOMEBODY ELSE IS NOT. A rule that refuses everybody is an
  --  outage, not a control.
  PERFORM _dek('B','B2 the QA manager, who received nothing, is not',
    public.duty_conflict('material_lot', v_lot, 'disposition',
      current_setting('de.u_qa')::uuid) IS NULL);

  --  The pair is enforced on PM-03's own separation, not on an opinion.
  PERFORM _dek('B','B3 and it is derived from PM-03, not asserted',
    (SELECT authority = 'derived_from_pm03'
            AND public.duty_pair_is_derived(section_a, section_b)
       FROM public.duty_conflicts
      WHERE scope='material_lot' AND duty_a='disposition' AND duty_b='receipt'));
END $b$;


-- =====================================================================
--  C. Decision 2 — nor may the CoA verifier
--
--  The one that goes BEYOND PM-03, which gives coa_register and
--  qa_disposition both to qa_manager and qa_officer. Enforced on a
--  named approval instead, and the approval has to say where it is
--  recorded.
-- =====================================================================
RESET ROLE;

DO $c$
DECLARE v_lot uuid := current_setting('de.lot')::uuid; v_coa uuid;
BEGIN
  INSERT INTO public.material_certificates_of_analysis
    (company_id, material_lot_id, supplier_results, uploaded_by,
     verified_by, verified_at, verification_status)
  VALUES (current_setting('de.c')::uuid, v_lot, '[]'::jsonb,
          current_setting('de.u_sk')::uuid,
          current_setting('de.u_an')::uuid, now(), 'verified')
  RETURNING id INTO v_coa;
  PERFORM set_config('de.coa', v_coa::text, false);

  PERFORM _dek('C','C1 the verifier and the certificate are on the record',
    (SELECT verified_by = current_setting('de.u_an')::uuid AND verified_at IS NOT NULL
       FROM public.material_certificates_of_analysis WHERE id = v_coa));

  PERFORM _dek('C','C2 so the verification duty is seen',
    public.material_lot_actor_duties(v_lot, current_setting('de.u_an')::uuid)
      @> ARRAY['coa_verification'],
    array_to_string(public.material_lot_actor_duties(
      v_lot, current_setting('de.u_an')::uuid), ', '));

  PERFORM _dek('C','C3 and they are refused the disposition of that lot',
    public.duty_conflict('material_lot', v_lot, 'disposition',
      current_setting('de.u_an')::uuid) LIKE 'MATERIAL_DISPOSITION_SELF_VERIFIED%',
    public.duty_conflict('material_lot', v_lot, 'disposition',
      current_setting('de.u_an')::uuid));

  --  PM-03 STILL DOES NOT DERIVE IT. The divergence is the point: the
  --  gate is stricter than the matrix, deliberately and on a recorded
  --  authority. If this ever flips, the approval can be withdrawn.
  PERFORM _dek('C','C4 PM-03 does not separate those columns',
    NOT public.duty_pair_is_derived('coa_register','qa_disposition'));

  PERFORM _dek('C','C5 so it is enforced on a named approval',
    (SELECT enforced AND authority = 'approved_by_quality'
       FROM public.duty_conflicts
      WHERE scope='material_lot' AND duty_a='coa_verification' AND duty_b='disposition'));

  --  THE LABEL NAMES THE RIGHT ACT. `coa_register` is the OUTGOING
  --  finished-product register (certificate_of_analysis); decision 2
  --  is about the INCOMING supplier certificate
  --  (material_certificates_of_analysis), which PM-03 does not
  --  tabulate at all. 20261129000000 corrected the label, and this
  --  keeps it corrected.
  PERFORM _dek('C','C5b the pair names the incoming act, not the outgoing register',
    (SELECT section_a = 'incoming_coa_verification'
       FROM public.duty_conflicts
      WHERE scope='material_lot' AND duty_a='coa_verification' AND duty_b='disposition'),
    (SELECT section_a FROM public.duty_conflicts
      WHERE scope='material_lot' AND duty_a='coa_verification' AND duty_b='disposition'));

  --  And that marker is NOT a PM-03 column — if it ever becomes one,
  --  the pair silently turns derivable and stops needing the approval.
  PERFORM _dek('C','C5c and that marker is not a PM-03 column',
    NOT EXISTS (SELECT 1 FROM public.section_permissions
                 WHERE section = 'incoming_coa_verification'));

  --  The outgoing register is untouched: both QA roles still hold Act.
  PERFORM _dek('C','C5d the outgoing CoA register column is unchanged',
    (SELECT count(*) FROM public.section_permissions
      WHERE section='coa_register' AND access='act'
        AND role IN ('qa_manager','qa_officer')) = 2);

  PERFORM _dek('C','C6 and the approval says where it is recorded',
    (SELECT approved_reference LIKE '%Decision 2%'
            AND approved_reference LIKE '%decision-note-coa-separation%'
       FROM public.duty_conflicts
      WHERE scope='material_lot' AND duty_a='coa_verification' AND duty_b='disposition'));

  --  AN APPROVAL CANNOT BE CLAIMED WITHOUT ONE. This is what keeps the
  --  second authority from becoming a way round the first.
  PERFORM _dek('C','C7 an approval with no reference is refused by the schema',
    _defail(format(
      'INSERT INTO public.duty_conflicts'
      ' (scope,duty_a,duty_b,section_a,section_b,error_code,reason,enforced,'
      '  decision_status,authority) VALUES'
      ' (%L,%L,%L,%L,%L,%L,%L,true,%L,%L)',
      'material_lot','aaa','zzz','coa_register','qa_disposition',
      'X','invented',  'mandatory','approved_by_quality'))
      <> '(no refusal)');
END $c$;


-- =====================================================================
--  D. Decision 3 — sampling, registered and NOT enforced
--
--  The brief: require independence only where the site procedure does.
--  So the activities are distinct and attributed, the pair is on the
--  record, and nobody is refused.
-- =====================================================================
DO $d$
DECLARE v_lot uuid := current_setting('de.lot')::uuid;
BEGIN
  INSERT INTO public.material_lot_sampling
    (company_id, material_lot_id, reference, sampled_by, sampled_on,
     containers_sampled, containers_total)
  VALUES (current_setting('de.c')::uuid, v_lot, 'SMP-DE-0001',
          current_setting('de.u_an')::uuid, current_date, 1, 1);

  PERFORM _dek('D','D1 sampling is a distinct activity with its own actor and date',
    (SELECT sampled_by = current_setting('de.u_an')::uuid AND sampled_on IS NOT NULL
       FROM public.material_lot_sampling WHERE material_lot_id = v_lot));

  PERFORM _dek('D','D2 and it is reported as a duty',
    public.material_lot_actor_duties(v_lot, current_setting('de.u_an')::uuid)
      @> ARRAY['sampling']);

  --  NOT ENFORCED. The sampler may still test, because no procedure
  --  has said otherwise and this file does not invent one.
  PERFORM _dek('D','D3 but the sampler is not refused the test',
    public.duty_conflict('material_lot', v_lot, 'qc_testing',
      current_setting('de.u_an')::uuid) IS NULL,
    coalesce(public.duty_conflict('material_lot', v_lot, 'qc_testing',
      current_setting('de.u_an')::uuid), '(no conflict)'));

  PERFORM _dek('D','D4 and the pair is on the record as awaiting a procedure',
    (SELECT NOT enforced AND decision_status = 'awaiting_decision'
            AND note LIKE '%TO ENFORCE%'
       FROM public.duty_conflicts
      WHERE scope='material_lot' AND duty_a='qc_testing' AND duty_b='sampling'));
END $d$;


-- =====================================================================
--  E. Decision 4 — dispatch after release, and not before it
-- =====================================================================
DO $e$
DECLARE
  c uuid := current_setting('de.c')::uuid;
  v_b uuid := gen_random_uuid();
  tag text := substr(replace(gen_random_uuid()::text,'-',''),1,6);
BEGIN
  INSERT INTO public.batch_records
    (id,company_id,batch_number,product_name,product_id,
     manufacturing_date,expiry_date,batch_size,unit)
  VALUES (v_b,c,'DEB-'||tag,'Tablet D',current_setting('de.prod')::uuid,
          current_date-10,current_date+355,100,'kg');
  PERFORM set_config('de.batch', v_b::text, false);

  --  UNRELEASED: the gate refuses it whatever the row says.
  PERFORM _dek('E','E1 an unreleased batch cannot be dispatched',
    _defail(format('INSERT INTO public.batch_dispatches'
      ' (company_id,batch_id,dispatched_by,quantity,unit,destination)'
      ' VALUES (%L,%L,%L,10,''kg'',%L)', c, v_b, current_setting('de.u_sk'), 'Lagos'))
      = 'DISPATCH_NOT_RELEASED',
    _defail(format('INSERT INTO public.batch_dispatches'
      ' (company_id,batch_id,dispatched_by,quantity,unit,destination)'
      ' VALUES (%L,%L,%L,10,''kg'',%L)', c, v_b, current_setting('de.u_sk'), 'Lagos')));

  --  A GOVERNING SPECIFICATION AND A STANDING RESULT, because the
  --  release gate refuses the batch without them and this section is
  --  about dispatch, not about the gate. Built in service context the
  --  way a fixture may: approved_by_role 'service' is the explicit
  --  statement that there was nobody to take a signature from.
  DECLARE v_spec uuid;
  BEGIN
    INSERT INTO public.product_specifications
      (company_id, product_id, version, status, created_by)
    VALUES (c, current_setting('de.prod')::uuid, 'DE-1.0', 'draft',
            current_setting('de.u_qa')::uuid)
    RETURNING id INTO v_spec;
    INSERT INTO public.product_specification_tests
      (specification_id, test_name, limit_type, min_value, max_value, unit, is_required)
    VALUES (v_spec, 'Assay', 'range', 98, 102, '%', true);
    UPDATE public.product_specifications
       SET status = 'effective', approved_by = current_setting('de.u_qa')::uuid,
           approved_at = now(), approved_by_role = 'service',
           effective_date = current_date - 20
     WHERE id = v_spec;

    INSERT INTO public.batch_qc_results(batch_id,test_name,result,pass,tested_by)
    VALUES (v_b,'Assay','99.4 %',true,current_setting('de.u_an')::uuid);
  END;

  --  Released, through the engine's own mirror: status is derived and
  --  refuses a direct write, so the lifecycle row is what moves it.
  UPDATE public.entity_current_state ecs
     SET state_id = s.id
    FROM public.lifecycle_definitions d
    JOIN public.lifecycle_states s ON s.definition_id = d.id
   WHERE d.entity_type='batch_record' AND s.state_key='released'
     AND ecs.entity_type='batch_record' AND ecs.entity_id = v_b;
  UPDATE public.batch_records
     SET released_by = current_setting('de.u_qa')::uuid, released_at = now()
   WHERE id = v_b;

  PERFORM _dek('E','E2 a released batch can be',
    _defail(format('INSERT INTO public.batch_dispatches'
      ' (company_id,batch_id,dispatched_by,quantity,unit,destination)'
      ' VALUES (%L,%L,%L,10,''kg'',%L)', c, v_b, current_setting('de.u_sk'), 'Lagos'))
      = '(no refusal)',
    _defail(format('INSERT INTO public.batch_dispatches'
      ' (company_id,batch_id,dispatched_by,quantity,unit,destination)'
      ' VALUES (%L,%L,%L,11,''kg'',%L)', c, v_b, current_setting('de.u_sk'), 'Kano')));

  --  ── BACKDATING ──
  --
  --  dispatched_at defaults to now() and was caller-suppliable, so a
  --  dispatch could be recorded as having happened before the release
  --  that authorised it — on a row that passed the gate.
  PERFORM _dek('E','E3 but not dated before the release that authorised it',
    _defail(format('INSERT INTO public.batch_dispatches'
      ' (company_id,batch_id,dispatched_by,quantity,unit,destination,dispatched_at)'
      ' VALUES (%L,%L,%L,10,''kg'',%L,%L)', c, v_b, current_setting('de.u_sk'), 'Lagos',
      (now() - interval '10 days')::text))
      = 'DISPATCH_BEFORE_RELEASE',
    _defail(format('INSERT INTO public.batch_dispatches'
      ' (company_id,batch_id,dispatched_by,quantity,unit,destination,dispatched_at)'
      ' VALUES (%L,%L,%L,10,''kg'',%L,%L)', c, v_b, current_setting('de.u_sk'), 'Lagos',
      (now() - interval '10 days')::text)));

  PERFORM _dek('E','E4 nor in the future',
    _defail(format('INSERT INTO public.batch_dispatches'
      ' (company_id,batch_id,dispatched_by,quantity,unit,destination,dispatched_at)'
      ' VALUES (%L,%L,%L,10,''kg'',%L,%L)', c, v_b, current_setting('de.u_sk'), 'Lagos',
      (now() + interval '2 days')::text))
      = 'DISPATCH_IN_THE_FUTURE');

  --  And the releaser still may not dispatch it, which is decision 4's
  --  other half and predates this migration.
  PERFORM _dek('E','E5 and the releaser may not dispatch it',
    public.duty_conflict('batch', v_b, 'dispatch',
      current_setting('de.u_qa')::uuid) LIKE 'BATCH_DUTY_CONFLICT%',
    public.duty_conflict('batch', v_b, 'dispatch', current_setting('de.u_qa')::uuid));
END $e$;


-- =====================================================================
--  F. Decision 5 — the verdict the release gate reads is signed
-- =====================================================================
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('de.u_an'), 'role','authenticated')::text, false);
SET ROLE authenticated;

DO $f$
DECLARE
  c uuid := current_setting('de.c')::uuid;
  v_b uuid := current_setting('de.batch')::uuid;
  r jsonb; v_sig uuid;
BEGIN
  PERFORM _dek('F','F1 recording a finished-product verdict needs a signature',
    _defail(format('INSERT INTO public.batch_qc_results'
      ' (batch_id,test_name,result,pass) VALUES (%L,%L,%L,true)',
      v_b,'Assay','99.4 %'))
      = 'QUALITY_VERDICT_SIGNATURE_REQUIRED',
    _defail(format('INSERT INTO public.batch_qc_results'
      ' (batch_id,test_name,result,pass) VALUES (%L,%L,%L,true)',
      v_b,'Assay','99.4 %')));

  r := public.quality_verdict_sign('batch_qc_result', c, v_b,
                                   'Assay','99.4 %',true,'CorrectHorse1!');
  PERFORM _dek('F','F2 the analyst can mint one with their password',
    (r->>'ok')::boolean, coalesce(r->>'code','ok'));
  v_sig := (r->>'signature_id')::uuid;

  PERFORM _dek('F','F3 a wrong password is refused',
    (public.quality_verdict_sign('batch_qc_result', c, v_b,
       'Assay','99.4 %',true,'wrong')->>'code') = 'E_SIGNATURE_BAD_PASSWORD');

  --  ── THE SIGNATURE COVERS THE VALUES ──
  PERFORM _dek('F','F4 it does not cover a different result',
    _defail(format('INSERT INTO public.batch_qc_results'
      ' (batch_id,test_name,result,pass,signature_id) VALUES (%L,%L,%L,true,%L)',
      v_b,'Assay','91.0 %',v_sig))
      = 'QUALITY_VERDICT_SIGNATURE_MISMATCH',
    _defail(format('INSERT INTO public.batch_qc_results'
      ' (batch_id,test_name,result,pass,signature_id) VALUES (%L,%L,%L,true,%L)',
      v_b,'Assay','91.0 %',v_sig)));

  PERFORM _dek('F','F5 nor a different verdict on the same value',
    _defail(format('INSERT INTO public.batch_qc_results'
      ' (batch_id,test_name,result,pass,signature_id) VALUES (%L,%L,%L,false,%L)',
      v_b,'Assay','99.4 %',v_sig))
      = 'QUALITY_VERDICT_SIGNATURE_MISMATCH');

  PERFORM _dek('F','F6 nor a different test',
    _defail(format('INSERT INTO public.batch_qc_results'
      ' (batch_id,test_name,result,pass,signature_id) VALUES (%L,%L,%L,true,%L)',
      v_b,'Dissolution','99.4 %',v_sig))
      = 'QUALITY_VERDICT_SIGNATURE_MISMATCH');

  --  The one it WAS taken over is accepted.
  INSERT INTO public.batch_qc_results(batch_id,test_name,result,pass,signature_id)
  VALUES (v_b,'Assay','99.4 %',true,v_sig);
  PERFORM _dek('F','F7 and the one it was taken over is recorded',
    EXISTS (SELECT 1 FROM public.batch_qc_results
             WHERE batch_id = v_b AND signature_id = v_sig));

  --  SINGLE USE.
  PERFORM _dek('F','F8 and cannot be spent twice',
    _defail(format('INSERT INTO public.batch_qc_results'
      ' (batch_id,test_name,result,pass,signature_id) VALUES (%L,%L,%L,true,%L)',
      v_b,'Assay','99.4 %',v_sig))
      <> '(no refusal)');

  --  THE ANALYST IS THE SESSION, whatever the row claims.
  PERFORM _dek('F','F9 the analyst on the row is the caller',
    (SELECT tested_by FROM public.batch_qc_results
      WHERE batch_id = v_b AND signature_id = v_sig)
      = current_setting('de.u_an')::uuid);

  --  AND THE SIGNATURE IS BOUND TO THEM, so one analyst cannot record
  --  a verdict on another's signature.
  PERFORM _dek('F','F10 the signature names its signer',
    (SELECT signer_id = current_setting('de.u_an')::uuid
            AND entity_type = 'quality_verdict' AND action = 'batch_qc_result'
            AND meaning = 'authored'
       FROM public.electronic_signatures WHERE id = v_sig));
END $f$;

RESET ROLE;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('de.u_qa'), 'role','authenticated')::text, false);
SET ROLE authenticated;

DO $f2$
DECLARE c uuid := current_setting('de.c')::uuid; v_b uuid := current_setting('de.batch')::uuid;
BEGIN
  --  Another person's signature does not authorise this caller's
  --  verdict, even though it is valid in itself.
  PERFORM _dek('F','F11 another caller cannot use it',
    _defail(format('INSERT INTO public.batch_qc_results'
      ' (batch_id,test_name,result,pass,signature_id) VALUES (%L,%L,%L,true,%L)',
      v_b,'Assay','99.4 %',
      (SELECT id FROM public.electronic_signatures
        WHERE entity_type='quality_verdict' AND entity_id = v_b
          AND signer_id = current_setting('de.u_an')::uuid LIMIT 1)))
      <> '(no refusal)');
END $f2$;


-- =====================================================================
--  G. Decision 6 — a correction cannot launder the author
-- =====================================================================
RESET ROLE;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('de.u_ps'), 'role','authenticated')::text, false);
SET ROLE authenticated;

DO $g$
DECLARE
  c uuid := current_setting('de.c')::uuid;
  v_b uuid := current_setting('de.batch')::uuid;
  v_stage uuid; v_read uuid;
BEGIN
  SELECT id INTO v_stage FROM public.batch_stages WHERE batch_id = v_b LIMIT 1;
  IF v_stage IS NULL THEN
    --  No formula on this batch, so no stages. The attribution rule is
    --  still assertable on its own terms.
    PERFORM _dek('G','G0 no stage on this batch, reading rules asserted directly', true,
      'no formula');
  END IF;

  PERFORM _dek('G','G1 recording a reading counts as execution',
    (SELECT reads LIKE '%recorded_by%' FROM public.duty_definitions
      WHERE scope='batch' AND duty='execution'),
    (SELECT reads FROM public.duty_definitions WHERE scope='batch' AND duty='execution'));

  PERFORM _dek('G','G2 and the brief''s confirmation of the broad reading is recorded',
    (SELECT decision_status = 'mandatory' AND note LIKE '%CONFIRMED%'
       FROM public.duty_definitions WHERE scope='batch' AND duty='execution'));

  --  A CORRECTION IS A NEW ROW. The original keeps its author by
  --  construction, and neither author can be edited.
  PERFORM _dek('G','G3 a reading''s recorder cannot be edited',
    (SELECT prosrc LIKE '%READING_RECORDER_FROZEN%'
       FROM pg_proc WHERE proname = 'fn_reading_attribute_recorder'));

  PERFORM _dek('G','G4 nor a QC result''s analyst',
    (SELECT prosrc LIKE '%BATCH_QC_ANALYST_FROZEN%'
       FROM pg_proc WHERE proname = 'fn_batch_qc_results_attribute_analyst'));

END $g$;

--  G5 IN SERVICE CONTEXT, deliberately, and the reason is worth
--  recording: run as u_ps the UPDATE matched NO ROWS, because RLS
--  filtered them out before the trigger could see them — so it
--  "succeeded" having changed nothing and the assertion read that as
--  the freeze not working. That is the silent-filter hazard this
--  schema keeps meeting. Asserted where the row is visible, which also
--  proves the freeze binds a service caller.
RESET ROLE;

DO $g2$
DECLARE v_b uuid := current_setting('de.batch')::uuid;
BEGIN
  PERFORM _dek('G','G5 and the refusal is real, for a service caller too',
    _defail(format('UPDATE public.batch_qc_results SET tested_by = %L WHERE batch_id = %L',
      current_setting('de.u_qa'), v_b)) = 'BATCH_QC_ANALYST_FROZEN',
    _defail(format('UPDATE public.batch_qc_results SET tested_by = %L WHERE batch_id = %L',
      current_setting('de.u_qa'), v_b)));

  PERFORM _dek('G','G6 and the rows are visible here, so that proved something',
    (SELECT count(*) FROM public.batch_qc_results WHERE batch_id = v_b) > 0,
    (SELECT count(*)::text FROM public.batch_qc_results WHERE batch_id = v_b));
END $g2$;


-- =====================================================================
--  H. The decision record itself
-- =====================================================================
RESET ROLE;
SELECT set_config('request.jwt.claims','', false);

DO $h$
DECLARE v_bad text;
BEGIN
  --  Every enforced pair has an authority, and claims only the one it
  --  has.
  SELECT string_agg(format('%s %s/%s',scope,duty_a,duty_b),'; ') INTO v_bad
    FROM public.duty_conflicts
   WHERE enforced
     AND NOT (public.duty_pair_is_derived(section_a, section_b)
              OR (authority = 'approved_by_quality'
                  AND coalesce(approved_reference,'') <> ''));
  PERFORM _dek('H','H1 every enforced pair has an authority',
    v_bad IS NULL, coalesce(v_bad,'(all authorised)'));

  SELECT string_agg(format('%s %s/%s',scope,duty_a,duty_b),'; ') INTO v_bad
    FROM public.duty_conflicts
   WHERE enforced AND authority = 'derived_from_pm03'
     AND NOT public.duty_pair_is_derived(section_a, section_b);
  PERFORM _dek('H','H2 and none claims a derivation it does not have',
    v_bad IS NULL, coalesce(v_bad,'(all derived)'));

  --  Nothing still reads as provisional after the brief ruled.
  PERFORM _dek('H','H3 no confirmed decision still reads as provisional',
    NOT EXISTS (SELECT 1 FROM public.duty_conflicts
                 WHERE decision_status = 'conservative_default')
    AND NOT EXISTS (SELECT 1 FROM public.duty_definitions
                     WHERE decision_status = 'conservative_default'));

  --  What is left open is listed, and it is sampling.
  PERFORM _dek('H','H4 what remains open is listed and is sampling',
    (SELECT count(*) FROM public.duty_decisions_outstanding()) = 1
    AND EXISTS (SELECT 1 FROM public.duty_decisions_outstanding()
                 WHERE pair LIKE '%sampling%'),
    (SELECT string_agg(format('%s %s',scope,pair),'; ')
       FROM public.duty_decisions_outstanding()));

  --  The signed actions, and which are enforced.
  PERFORM _dek('H','H5 the finished-product verdict is the enforced signed action',
    (SELECT required FROM public.signed_quality_actions
      WHERE action_key = 'batch_qc_result'));

  PERFORM _dek('H','H6 and the two held pending procedure say so',
    (SELECT count(*) FROM public.signed_quality_actions
      WHERE NOT required AND decision_status = 'awaiting_procedure') = 2,
    (SELECT string_agg(action_key,', ') FROM public.signed_quality_actions
      WHERE NOT required));

  --  The rule tables stay locked down, including the two added here.
  PERFORM _dek('H','H7 the new rule tables are not writable by an app role',
    NOT EXISTS (
      SELECT 1 FROM information_schema.role_table_grants g
       WHERE g.table_schema='public'
         AND g.table_name IN ('signed_quality_actions','duty_definitions',
                              'lifecycle_entity_sections')
         AND g.grantee IN ('anon','authenticated')
         AND g.privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE')),
    (SELECT string_agg(DISTINCT format('%s/%s',g.table_name,g.grantee),', ')
       FROM information_schema.role_table_grants g
      WHERE g.table_schema='public'
        AND g.table_name IN ('signed_quality_actions','duty_definitions',
                             'lifecycle_entity_sections')
        AND g.grantee IN ('anon','authenticated')
        AND g.privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE')));
END $h$;


-- =====================================================================
--  I. WHO MAY VERIFY AN INCOMING CERTIFICATE AT ALL
--
--  Section C proves that whoever verifies a lot's incoming
--  certificate is then refused its disposition. This section asks the
--  question underneath it: who was entitled to verify in the first
--  place.
--
--  Before 20261130000000 the answer was "any member of the company".
--  material_coa_verify() is SECURITY DEFINER with EXECUTE granted to
--  `authenticated`, and its only check was app_is_company_member(). A
--  storekeeper — a real role PM-03 gives no quality column at all —
--  could record a verification, and the disposition gate would then
--  read it as one.
--
--  The correction derives the authority from the columns PM-03
--  already has (qc_testing Act, qa_disposition Act) rather than
--  adding one, and does NOT abstain for somebody holding no role:
--  abstaining is exactly how the hole stayed open.
-- =====================================================================
RESET ROLE;

DO $i$
DECLARE
  c      uuid := current_setting('de.c')::uuid;
  u_sk   uuid := current_setting('de.u_sk')::uuid;
  u_an   uuid := current_setting('de.u_an')::uuid;
  u_qa   uuid := current_setting('de.u_qa')::uuid;
  u_non  uuid := gen_random_uuid();
  v_mat  uuid := current_setting('de.mat')::uuid;
  v_spec uuid; v_lot uuid; v_coa uuid;
  tag    text := substr(replace(gen_random_uuid()::text,'-',''),1,8);
BEGIN
  --  A member of the company holding NO operational role. Everywhere
  --  else in this system that person abstains; here they must not.
  INSERT INTO auth.users(id,email) VALUES (u_non,'non-'||tag||'@de.test');
  INSERT INTO public.profiles(id,email,full_name,company_id,role)
  VALUES (u_non,'non-'||tag||'@de.test','Chidi Nobody',c,'content_creator');
  INSERT INTO public.company_members(company_id,user_id,role,status)
  VALUES (c,u_non,'viewer','active');
  PERFORM set_config('de.u_non', u_non::text, false);

  --  A specification with one parameter, so the RPC has arithmetic to
  --  do and a verification to reach rather than failing earlier for an
  --  unrelated reason.
  INSERT INTO public.material_specifications(company_id,material_id,version,status,created_by)
  VALUES (c,v_mat,'I-'||tag,'effective',u_qa) RETURNING id INTO v_spec;
  INSERT INTO public.material_specification_parameters
    (specification_id,parameter,unit,limit_type,min_value,max_value,is_critical)
  VALUES (v_spec,'Assay','%','range',95.0,105.0,true);

  INSERT INTO public.material_lots
    (id,company_id,material_id,quantity_received,created_by,received_by)
  VALUES (gen_random_uuid(),c,v_mat,25,u_sk,u_sk) RETURNING id INTO v_lot;
  PERFORM set_config('de.i_lot', v_lot::text, false);

  INSERT INTO public.material_certificates_of_analysis
    (company_id,material_lot_id,supplier_results,uploaded_by)
  VALUES (c,v_lot,'[{"parameter":"Assay","stated_value":99.0}]'::jsonb,u_sk)
  RETURNING id INTO v_coa;
  PERFORM set_config('de.i_coa', v_coa::text, false);
END
$i$;

--  Impersonation, because this control is about who the caller is.
SET ROLE authenticated;

DO $i2$
DECLARE
  c     uuid := current_setting('de.c')::uuid;
  v_coa uuid := current_setting('de.i_coa')::uuid;
  v_lot uuid := current_setting('de.i_lot')::uuid;
BEGIN
  --  ── The storekeeper: a real role, no quality column ──────────────
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', current_setting('de.u_sk'), 'role','authenticated')::text, false);

  PERFORM _dek('I','I0 the impersonation is not a service context',
    NOT public.app_is_service_context());

  PERFORM _dek('I','I1 a storekeeper holds no Act on either quality column',
    public.app_section_access(c,'qc_testing')      IS DISTINCT FROM 'act'
    AND public.app_section_access(c,'qa_disposition') IS DISTINCT FROM 'act',
    format('qc_testing=%s qa_disposition=%s',
      coalesce(public.app_section_access(c,'qc_testing'),'(abstain)'),
      coalesce(public.app_section_access(c,'qa_disposition'),'(abstain)')));

  --  THE CALL THAT USED TO SUCCEED.
  PERFORM _dek('I','I2 so the storekeeper is refused the verification',
    _defail(format('SELECT public.material_coa_verify(%L)', v_coa))
      = 'COA_VERIFY_FORBIDDEN',
    _defail(format('SELECT public.material_coa_verify(%L)', v_coa)));

  --  And the same fields written directly, which is the route a guard
  --  living only inside the RPC would have missed.
  PERFORM _dek('I','I3 and refused a direct write of the verification fields',
    _defail(format(
      'UPDATE public.material_certificates_of_analysis'
      ' SET verification_status=%L, verified_by=%L, verified_at=now() WHERE id=%L',
      'verified', current_setting('de.u_sk'), v_coa)) = 'COA_VERIFY_FORBIDDEN',
    _defail(format(
      'UPDATE public.material_certificates_of_analysis'
      ' SET verification_status=%L, verified_by=%L, verified_at=now() WHERE id=%L',
      'verified', current_setting('de.u_sk'), v_coa)));

  --  BUT UPLOADING ONE IS STILL CLERICAL. A control that also stopped
  --  the storekeeper filing the supplier's paperwork would be a
  --  different and wrong rule.
  PERFORM _dek('I','I4 but filing a certificate is still clerical, and allowed',
    _defail(format(
      'INSERT INTO public.material_certificates_of_analysis'
      ' (company_id,material_lot_id,supplier_results,uploaded_by)'
      ' VALUES (%L,%L,%L,%L)',
      c, v_lot, '[{"parameter":"Assay","stated_value":98.0}]', current_setting('de.u_sk')))
      = '(no refusal)',
    _defail(format(
      'INSERT INTO public.material_certificates_of_analysis'
      ' (company_id,material_lot_id,supplier_results,uploaded_by)'
      ' VALUES (%L,%L,%L,%L)',
      c, v_lot, '[{"parameter":"Assay","stated_value":98.0}]', current_setting('de.u_sk'))));

  --  ── Somebody holding no role at all: refused, NOT abstained ──────
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', current_setting('de.u_non'), 'role','authenticated')::text, false);

  PERFORM _dek('I','I5 a member holding no operational role is refused, not abstained',
    _defail(format('SELECT public.material_coa_verify(%L)', v_coa))
      = 'COA_VERIFY_FORBIDDEN',
    _defail(format('SELECT public.material_coa_verify(%L)', v_coa)));

  --  ── The QC Analyst: qc_testing Act. MUST still be able to ────────
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', current_setting('de.u_an'), 'role','authenticated')::text, false);

  PERFORM _dek('I','I6 the QC Analyst still verifies',
    (public.material_coa_verify(v_coa) ->> 'verification_status') IS NOT NULL,
    public.material_coa_verify(v_coa)::text);

  PERFORM _dek('I','I7 and the verification is attributed to them',
    (SELECT verified_by FROM public.material_certificates_of_analysis WHERE id = v_coa)
      = current_setting('de.u_an')::uuid,
    (SELECT coalesce(verified_by::text,'NULL')
       FROM public.material_certificates_of_analysis WHERE id = v_coa));

  --  ── AND DECISION 2 IS UNCHANGED. Narrowing who may verify must
  --  not narrow what verifying costs them.
  PERFORM _dek('I','I8 the verifier is still refused that lot''s disposition',
    public.duty_conflict('material_lot', v_lot, 'disposition',
      current_setting('de.u_an')::uuid) LIKE 'MATERIAL_DISPOSITION_SELF_VERIFIED%',
    public.duty_conflict('material_lot', v_lot, 'disposition',
      current_setting('de.u_an')::uuid));

  --  ── The QA Manager: qa_disposition Act, so also entitled ─────────
  PERFORM _dek('I','I9 a QA Manager holds Act on qa_disposition',
    public.app_section_access(c,'qa_disposition',
      current_setting('de.u_qa')::uuid) = 'act',
    coalesce(public.app_section_access(c,'qa_disposition',
      current_setting('de.u_qa')::uuid),'(abstain)'));

  PERFORM _dek('I','I10 and is not refused the verification',
    public.material_coa_verify_authority_error(c, current_setting('de.u_qa')::uuid) IS NULL,
    coalesce(public.material_coa_verify_authority_error(
      c, current_setting('de.u_qa')::uuid),'(allowed)'));

  --  The refusal says what is missing. A bare "forbidden" sends
  --  somebody to the wrong person.
  PERFORM _dek('I','I11 the refusal names the roles that may',
    public.material_coa_verify_authority_error(c, current_setting('de.u_non')::uuid)
      LIKE '%QC testing or QA disposition%',
    public.material_coa_verify_authority_error(c, current_setting('de.u_non')::uuid));
END
$i2$;

RESET ROLE;
SELECT set_config('request.jwt.claims','', false);

--  The RPC's grants are part of the finding: EXECUTE to `authenticated`
--  is what made membership-only authorisation reachable. Asserted so
--  that a future migration widening it to anon or PUBLIC is noticed.
DO $i3$
BEGIN
  PERFORM _dek('I','I12 material_coa_verify is not executable by anon or PUBLIC',
    NOT (has_function_privilege('anon',
          'public.material_coa_verify(uuid)', 'EXECUTE')
         OR has_function_privilege('public',
          'public.material_coa_verify(uuid)', 'EXECUTE')));

  --  A service context is exempt, as everywhere: migrations, backfills
  --  and edge functions are not people and hold no roles. The same
  --  write that was refused above goes through here.
  PERFORM _dek('I','I13 a service context is exempt from the authority check',
    public.app_is_service_context()
    AND _defail(format(
      'UPDATE public.material_certificates_of_analysis'
      ' SET verification_status=%L WHERE id=%L',
      'rejected', current_setting('de.i_coa'))) = '(no refusal)');

  --  And the authority check itself still says no about that person —
  --  the exemption is the context, not a change of their standing.
  PERFORM _dek('I','I14 without the check itself changing its answer',
    public.material_coa_verify_authority_error(
      current_setting('de.c')::uuid, current_setting('de.u_non')::uuid) IS NOT NULL);
END
$i3$;


-- =====================================================================
--  J. THE POLICY REGISTER
--
--  20261131000000 puts every open policy decision in one table, with
--  WHICH KIND of open it is. A reporting register that drifts from the
--  tables it reports on is worse than none, because it is believed —
--  so these assertions check the register against the enforcement
--  rather than against itself.
-- =====================================================================
DO $j$
BEGIN
  --  Option B is recorded, and recorded as TEMPORARY. The whole point
  --  of the column is that an exception nobody revisits becomes the
  --  design by default.
  PERFORM _dek('J','J1 Option B is recorded as a temporary exception',
    (SELECT temporary AND enforced AND state = 'enforced_pending_confirmation'
       FROM public.policy_decisions
      WHERE key = 'coa_verification_vs_disposition'),
    (SELECT format('state=%s enforced=%s temporary=%s', state,
             CASE WHEN enforced THEN 'y' ELSE 'n' END,
             CASE WHEN temporary THEN 'y' ELSE 'n' END)
       FROM public.policy_decisions
      WHERE key = 'coa_verification_vs_disposition'));

  --  AND THE CONTROL IS STILL ON. "Temporary exception" means PM-03 is
  --  not redrawn; it does not mean the duty conflict was withdrawn.
  PERFORM _dek('J','J2 and the duty conflict it describes is still enforced',
    (SELECT enforced AND authority = 'approved_by_quality'
       FROM public.duty_conflicts
      WHERE scope='material_lot' AND duty_a='coa_verification' AND duty_b='disposition'));

  PERFORM _dek('J','J3 the exception is the only temporary one',
    (SELECT count(*) FROM public.policy_decisions WHERE temporary) = 1,
    (SELECT string_agg(key,', ') FROM public.policy_decisions WHERE temporary));

  --  The four the brief named are open, by name. Deleting one must be
  --  a failure, not a shorter report.
  PERFORM _dek('J','J4 sampling versus testing is open, and its control is off',
    (SELECT state = 'awaiting_decision' AND NOT enforced
       FROM public.policy_decisions WHERE key = 'material_sampling_vs_testing'));

  PERFORM _dek('J','J5 the material-test signature is held, not required',
    (SELECT p.state = 'awaiting_procedure' AND NOT p.enforced
       FROM public.policy_decisions p WHERE p.key = 'material_test_result_signature')
    AND (SELECT NOT required FROM public.signed_quality_actions
          WHERE action_key = 'material_test_result'));

  PERFORM _dek('J','J6 the batch-execution-close signature is held, not required',
    (SELECT p.state = 'awaiting_procedure' AND NOT p.enforced
       FROM public.policy_decisions p WHERE p.key = 'batch_execution_close_signature')
    AND (SELECT NOT required FROM public.signed_quality_actions
          WHERE action_key = 'batch_execution_close'));

  PERFORM _dek('J','J7 Decisions A and B are enforced but pending confirmation',
    (SELECT count(*) FROM public.policy_decisions
      WHERE key IN ('product_specification_approver',
                    'product_specification_governing_version')
        AND state = 'enforced_pending_confirmation' AND enforced) = 2);

  --  The register must not contradict itself: nothing awaiting a
  --  decision may claim its control is on, and nothing enforced
  --  pending confirmation may claim it is off.
  PERFORM _dek('J','J8 no row claims a state its enforcement contradicts',
    NOT EXISTS (SELECT 1 FROM public.policy_decisions
                 WHERE (state LIKE 'awaiting_%' AND enforced)
                    OR (state = 'enforced_pending_confirmation' AND NOT enforced)),
    (SELECT string_agg(format('%s/%s',key,state),', ') FROM public.policy_decisions
      WHERE (state LIKE 'awaiting_%' AND enforced)
         OR (state = 'enforced_pending_confirmation' AND NOT enforced)));

  --  Temporary exceptions sort first, because they are the ones with
  --  no written expiry.
  PERFORM _dek('J','J9 the outstanding report puts the temporary exception first',
    (SELECT key FROM public.policy_decisions_outstanding() LIMIT 1)
      = 'coa_verification_vs_disposition',
    (SELECT key FROM public.policy_decisions_outstanding() LIMIT 1));

  PERFORM _dek('J','J10 and reports six open decisions, none settled',
    (SELECT count(*) FROM public.policy_decisions_outstanding()) = 6
    AND (SELECT count(*) FROM public.policy_decisions WHERE state = 'settled') = 0,
    (SELECT count(*)::text FROM public.policy_decisions_outstanding()));

  --  Every open row says what people are living with meanwhile, and
  --  what would close it. A register of questions with no interim
  --  behaviour recorded does not help an operator.
  PERFORM _dek('J','J11 every open decision records its interim behaviour and what closes it',
    NOT EXISTS (SELECT 1 FROM public.policy_decisions
                 WHERE state <> 'settled'
                   AND (length(btrim(interim)) < 20 OR length(btrim(needs)) < 20)),
    (SELECT string_agg(key,', ') FROM public.policy_decisions
      WHERE state <> 'settled'
        AND (length(btrim(interim)) < 20 OR length(btrim(needs)) < 20)));

  --  And a seventh rule table arriving world-writable would undo what
  --  20261123000000 established.
  PERFORM _dek('J','J12 the register is not writable by an app role',
    NOT EXISTS (SELECT 1 FROM information_schema.role_table_grants
                 WHERE table_schema='public' AND table_name='policy_decisions'
                   AND grantee IN ('anon','authenticated')
                   AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE')));

  --  A settled decision cannot also be a temporary exception. The
  --  CHECK is the control; this proves the CHECK is there.
  PERFORM _dek('J','J13 a settled decision cannot be temporary',
    _defail(
      'INSERT INTO public.policy_decisions'
      ' (key,area,title,state,enforced,temporary,interim,needs,reference)'
      ' VALUES (''zz_probe'',''probe'',''probe'',''settled'',true,true,'
      '''interim behaviour text long enough'','
      '''what would close it, text long enough'','
      '''a reference long enough to be one'')')
      <> '(no refusal)',
    _defail(
      'INSERT INTO public.policy_decisions'
      ' (key,area,title,state,enforced,temporary,interim,needs,reference)'
      ' VALUES (''zz_probe2'',''probe'',''probe'',''settled'',true,true,'
      '''interim behaviour text long enough'','
      '''what would close it, text long enough'','
      '''a reference long enough to be one'')'));
END
$j$;


-- =====================================================================
--  Results — COLUMN ORDER IS total, passed, failed.
-- =====================================================================
SELECT section, name, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result, detail
  FROM _de ORDER BY section, name;

SELECT count(*) AS total,
       count(*) FILTER (WHERE ok) AS passed,
       count(*) FILTER (WHERE NOT ok) AS failed
  FROM _de;

DO $gate$
DECLARE v_failed bigint;
BEGIN
  SELECT count(*) INTO v_failed FROM _de WHERE NOT ok;
  IF v_failed > 0 THEN
    RAISE EXCEPTION 'DECISION ENFORCEMENT: % assertion(s) failed', v_failed;
  END IF;
END
$gate$;
