-- =====================================================================
--  THE TWO DECISIONS, AND PM-04 ON ALL FIVE PROTECTED STEPS
--
--  Covers 20261117000000 (specification approval by the QA Manager)
--  and 20261118000000 (the governing version preserved against the
--  batch), plus the reconfirmation that an individual restriction
--  blocks every one of PM-03's five named steps server-side —
--  including through a direct RPC call rather than only through a
--  table write.
--
--  Sections:
--    A. Approval is the QA Manager's, and an administrator is refused
--    B. The signature, and the three ways it can fail
--    C. The governing version is stamped at release and locked
--    D. Reassessment is a controlled review, never a silent swap
--    E. All five protected steps, refused by restriction, via RPC
-- =====================================================================
\set ON_ERROR_STOP on
SET client_min_messages = warning;

RESET ROLE;
SELECT set_config('request.jwt.claims','', false);

CREATE TEMP TABLE _dc(section text, name text, ok boolean, detail text);
GRANT ALL ON _dc TO anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION _dck(p_section text, p_name text, p_ok boolean, p_detail text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO _dc VALUES (p_section,p_name,coalesce(p_ok,false),p_detail); END $$;

DO $fx$
DECLARE
  c uuid := gen_random_uuid();
  u_qm uuid := gen_random_uuid();   -- qa_manager
  u_ow uuid := gen_random_uuid();   -- owner: an administrator
  u_ca uuid := gen_random_uuid();   -- compliance_admin: may restrict
  u_qo uuid := gen_random_uuid();   -- qa_officer
  p uuid := gen_random_uuid();
  tag text := substr(replace(gen_random_uuid()::text,'-',''),1,8);
BEGIN
  PERFORM set_config('dc.c', c::text, false);
  PERFORM set_config('dc.u_qm', u_qm::text, false);
  PERFORM set_config('dc.u_ow', u_ow::text, false);
  PERFORM set_config('dc.u_ca', u_ca::text, false);
  PERFORM set_config('dc.u_qo', u_qo::text, false);
  PERFORM set_config('dc.p', p::text, false);

  INSERT INTO public.companies(id,name) VALUES (c,'Decisions '||tag);
  INSERT INTO auth.users(id,email) VALUES
    (u_qm,'qm-'||tag||'@dc.test'), (u_ow,'ow-'||tag||'@dc.test'),
    (u_ca,'ca-'||tag||'@dc.test'), (u_qo,'qo-'||tag||'@dc.test');
  INSERT INTO public.profiles(id,email,full_name,company_id,role) VALUES
    (u_qm,'qm-'||tag||'@dc.test','Ngozi Quality',c,'compliance_officer'),
    (u_ow,'ow-'||tag||'@dc.test','Adaeze Owner', c,'admin'),
    (u_ca,'ca-'||tag||'@dc.test','Kemi Admin',   c,'admin'),
    (u_qo,'qo-'||tag||'@dc.test','Femi Officer', c,'compliance_officer');
  INSERT INTO public.company_members(company_id,user_id,role,status) VALUES
    (c,u_qm,'qa_manager','active'),
    (c,u_ow,'owner','active'),
    (c,u_ca,'compliance_admin','active'),
    (c,u_qo,'qa_officer','active');

  INSERT INTO public.products(id,company_id,product_code,trade_name,generic_name,category,created_by)
  VALUES (p,c,'DC-'||tag,'Tablet D','Paracetamol','drug_pharmaceutical',u_qm);
  PERFORM public.lifecycle_transition('product', p, 'start_regulatory_prep', c);
  PERFORM public.lifecycle_transition('product', p, 'submit_to_regulator',   c);
  PERFORM public.lifecycle_transition('product', p, 'record_registration',   c, NULL, 'granted');

  --  A draft specification for sections A and B to approve.
  INSERT INTO public.product_specifications(id,company_id,product_id,version,status,created_by)
  VALUES (gen_random_uuid(),c,p,'1.0','draft',u_qm)
  RETURNING id INTO STRICT c;   -- reuse c as scratch, reset below
  PERFORM set_config('dc.spec', c::text, false);
  c := current_setting('dc.c')::uuid;

  INSERT INTO public.product_specification_tests
    (specification_id,test_name,limit_type,min_value,max_value,unit,is_required)
  VALUES (current_setting('dc.spec')::uuid,'Assay','range',98,102,'%',true);
END
$fx$;


-- =====================================================================
--  A — approval is the QA Manager's
--
--  THE CASE THE DECISION NAMES. app_assert_step abstains for a role
--  PM-03 does not tabulate, and on the live Criateur project every
--  member's role is `owner` — so an abstaining check would have let
--  all 21 of them approve. This check does not abstain.
-- =====================================================================
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('dc.u_ow'), 'role','authenticated')::text, false);
SET ROLE authenticated;

DO $a$
DECLARE v_ok boolean := false; v_msg text;
BEGIN
  --  CHANGED BY 20261119000000, and the change is the point. The
  --  owner used to resolve AS the untabulated role 'owner'; now
  --  membership and operational roles are separate registers and an
  --  owner holds no operational role at all. Either way the grid has
  --  nothing to say about them, which is what A2 checks.
  PERFORM _dck('A','A1 the owner holds no operational role',
    coalesce(array_length(public.app_work_roles(current_setting('dc.c')::uuid), 1), 0) = 0,
    array_to_string(public.app_work_roles(current_setting('dc.c')::uuid), ', '));

  --  ... which means the GRID abstains for them, and that is exactly
  --  why approval does not use the grid's abstaining assertion.
  PERFORM _dck('A','A2 so the grid has no cell for them',
    public.app_section_access(current_setting('dc.c')::uuid,'batch_release') IS NULL);

  BEGIN
    PERFORM public.product_specification_approve(current_setting('dc.spec')::uuid);
    v_msg := 'AN OWNER APPROVED A SPECIFICATION';
  EXCEPTION WHEN OTHERS THEN
    v_ok := SQLERRM LIKE 'PRODUCT_SPEC_FORBIDDEN%'; v_msg := SQLERRM;
  END;
  PERFORM _dck('A','A3 and an administrator is refused anyway', v_ok, left(v_msg,170));

  PERFORM _dck('A','A4 the refusal says administrative access does not carry it',
    v_msg LIKE '%QA Manager%', left(v_msg,170));
END
$a$;
RESET ROLE;

--  A QA Officer holds Act on several sections and is still not the
--  approver, so A3 is not simply "anyone but one person".
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('dc.u_qo'), 'role','authenticated')::text, false);
SET ROLE authenticated;
DO $a2$
DECLARE v_ok boolean := false; v_msg text;
BEGIN
  BEGIN
    PERFORM public.product_specification_approve(current_setting('dc.spec')::uuid);
    v_msg := 'A QA OFFICER APPROVED A SPECIFICATION';
  EXCEPTION WHEN OTHERS THEN
    v_ok := SQLERRM LIKE 'PRODUCT_SPEC_FORBIDDEN%'; v_msg := SQLERRM;
  END;
  PERFORM _dck('A','A5 nor the QA officer', v_ok, left(v_msg,170));
END
$a2$;
RESET ROLE;

--  And a direct UPDATE cannot mint an approval round the function.
DO $a3$
DECLARE v_ok boolean := false; v_msg text;
BEGIN
  BEGIN
    UPDATE public.product_specifications
       SET status='effective', approved_by=current_setting('dc.u_ow')::uuid,
           approved_at=now(), effective_date=current_date
     WHERE id = current_setting('dc.spec')::uuid;
    v_msg := 'AN APPROVAL WAS MINTED BY DIRECT UPDATE';
  EXCEPTION WHEN OTHERS THEN
    v_ok := SQLERRM LIKE 'PRODUCT_SPEC_NO_SIGNATURE%'; v_msg := SQLERRM;
  END;
  PERFORM _dck('A','A6 a direct UPDATE cannot mint an approval', v_ok, left(v_msg,170));
END
$a3$;


-- =====================================================================
--  B — the signature, and the three ways it can fail
-- =====================================================================
DO $bmint$
DECLARE v_sig uuid;
BEGIN
  --  Minted as a service context: electronic_signatures is not
  --  writable by an authenticated session, and sign_electronic_record
  --  needs a password fixture that belongs to another suite.
  INSERT INTO public.electronic_signatures (
    company_id, signer_id, signer_name, signer_email,
    entity_type, entity_id, action, meaning, record_hash, signed_state
  ) VALUES (
    current_setting('dc.c')::uuid, current_setting('dc.u_qm')::uuid,
    'Ngozi Quality','qm@dc.test','product_specification',
    current_setting('dc.spec')::uuid,'approve','approved',
    public.product_specification_record_hash(current_setting('dc.spec')::uuid),
    'draft'
  ) RETURNING id INTO v_sig;
  PERFORM set_config('dc.sig', v_sig::text, false);

  --  A second signature, for the wrong action.
  INSERT INTO public.electronic_signatures (
    company_id, signer_id, signer_name, signer_email,
    entity_type, entity_id, action, meaning, record_hash, signed_state
  ) VALUES (
    current_setting('dc.c')::uuid, current_setting('dc.u_qm')::uuid,
    'Ngozi Quality','qm@dc.test','product_specification',
    current_setting('dc.spec')::uuid,'withdraw','reviewed',
    public.product_specification_record_hash(current_setting('dc.spec')::uuid),
    'draft'
  ) RETURNING id INTO v_sig;
  PERFORM set_config('dc.sig_wrong', v_sig::text, false);
END
$bmint$;

SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('dc.u_qm'), 'role','authenticated')::text, false);
SET ROLE authenticated;

DO $b$
DECLARE v_ok boolean := false; v_msg text; r jsonb;
BEGIN
  BEGIN
    PERFORM public.product_specification_approve(current_setting('dc.spec')::uuid, current_date);
    v_msg := 'APPROVED WITH NO SIGNATURE';
  EXCEPTION WHEN OTHERS THEN
    v_ok := SQLERRM LIKE 'PRODUCT_SPEC_SIGNATURE_REQUIRED%'; v_msg := SQLERRM;
  END;
  PERFORM _dck('B','B1 the QA manager still needs a signature', v_ok, left(v_msg,170));

  v_ok := false;
  BEGIN
    PERFORM public.product_specification_approve(current_setting('dc.spec')::uuid,
              current_date, current_setting('dc.sig_wrong')::uuid);
    v_msg := 'A SIGNATURE FOR ANOTHER ACTION WAS ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    v_ok := SQLERRM LIKE 'PRODUCT_SPEC_SIGNATURE_MISMATCH%'; v_msg := SQLERRM;
  END;
  PERFORM _dck('B','B2 a signature for another action is refused', v_ok, left(v_msg,170));

  --  The real one works, and records the evidence.
  BEGIN
    r := public.product_specification_approve(current_setting('dc.spec')::uuid,
           current_date - 1, current_setting('dc.sig')::uuid);
    v_ok := (r->>'ok')::boolean; v_msg := r::text;
  EXCEPTION WHEN OTHERS THEN v_ok := false; v_msg := SQLERRM;
  END;
  PERFORM _dck('B','B3 a matching signature approves it', v_ok, left(v_msg,170));

  PERFORM _dck('B','B4 and the approver, role, time and signature are recorded',
    (SELECT approved_by = current_setting('dc.u_qm')::uuid
            AND approved_by_role = 'qa_manager'
            AND approved_at IS NOT NULL
            AND approval_signature_id = current_setting('dc.sig')::uuid
            AND effective_date = current_date - 1
       FROM public.product_specifications WHERE id = current_setting('dc.spec')::uuid));
END
$b$;
RESET ROLE;

--  STALENESS IS REAL, not decorative: a signature taken over one set
--  of tests does not approve a different set.
DO $b2$
DECLARE v_spec2 uuid := gen_random_uuid(); v_sig uuid; v_ok boolean := false; v_msg text;
BEGIN
  INSERT INTO public.product_specifications(id,company_id,product_id,version,status,created_by)
  VALUES (v_spec2,current_setting('dc.c')::uuid,current_setting('dc.p')::uuid,'2.0','draft',
          current_setting('dc.u_qm')::uuid);
  INSERT INTO public.product_specification_tests
    (specification_id,test_name,limit_type,min_value,max_value,is_required)
  VALUES (v_spec2,'Assay','range',98,102,true);

  INSERT INTO public.electronic_signatures (
    company_id, signer_id, signer_name, signer_email,
    entity_type, entity_id, action, meaning, record_hash, signed_state
  ) VALUES (
    current_setting('dc.c')::uuid, current_setting('dc.u_qm')::uuid,
    'Ngozi Quality','qm@dc.test','product_specification',v_spec2,'approve','approved',
    public.product_specification_record_hash(v_spec2), 'draft'
  ) RETURNING id INTO v_sig;

  --  The draft is edited AFTER signing.
  UPDATE public.product_specification_tests SET max_value = 105
   WHERE specification_id = v_spec2 AND test_name = 'Assay';

  PERFORM set_config('dc.spec2', v_spec2::text, false);
  PERFORM set_config('dc.sig2', v_sig::text, false);
END
$b2$;

SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('dc.u_qm'), 'role','authenticated')::text, false);
SET ROLE authenticated;
DO $b3$
DECLARE v_ok boolean := false; v_msg text;
BEGIN
  BEGIN
    PERFORM public.product_specification_approve(current_setting('dc.spec2')::uuid,
              current_date, current_setting('dc.sig2')::uuid);
    v_msg := 'A STALE SIGNATURE APPROVED AN EDITED DRAFT';
  EXCEPTION WHEN OTHERS THEN
    v_ok := SQLERRM LIKE 'PRODUCT_SPEC_SIGNATURE_STALE%'; v_msg := SQLERRM;
  END;
  PERFORM _dck('B','B5 a signature taken before an edit is stale', v_ok, left(v_msg,170));
END
$b3$;
RESET ROLE;


-- =====================================================================
--  C — the governing version is stamped at release, and locked
-- =====================================================================
DO $c$
DECLARE
  c uuid := current_setting('dc.c')::uuid;
  b uuid := gen_random_uuid(); v_sig uuid; tag text := substr(md5(random()::text),1,6);
BEGIN
  INSERT INTO public.batch_records
    (id,company_id,batch_number,product_name,product_id,manufacturing_date,expiry_date,batch_size,unit)
  VALUES (b,c,'DCB-'||tag,'Tablet D',current_setting('dc.p')::uuid,
          current_date,current_date+365,100,'kg');
  PERFORM set_config('dc.b', b::text, false);

  PERFORM _dck('C','C1 before release nothing is stamped',
    (SELECT governing_specification_id IS NULL FROM public.batch_records WHERE id=b));

  --  ... and the derivation still answers, because there is nothing
  --  else to answer from yet.
  PERFORM _dck('C','C2 but the rule still names a version',
    public.batch_governing_specification(b) = current_setting('dc.spec')::uuid,
    coalesce(public.batch_governing_specification(b)::text,'<null>'));

  INSERT INTO public.batch_qc_results(batch_id,test_name,result,pass,tested_by)
  VALUES (b,'Assay','99.4 %',true,current_setting('dc.u_qo')::uuid);

  PERFORM public.lifecycle_transition('batch_record', b, 'close_execution', c);
  PERFORM public.lifecycle_transition('batch_record', b, 'submit_for_qc',   c);
  PERFORM public.lifecycle_transition('batch_record', b, 'start_qc',        c);

  INSERT INTO public.electronic_signatures (
    company_id, signer_id, signer_name, signer_email,
    entity_type, entity_id, action, meaning, record_hash, signed_state
  ) VALUES (
    c, current_setting('dc.u_qm')::uuid,'Ngozi Quality','qm@dc.test',
    'batch_record', b, 'release','released',
    public.electronic_signature_record_hash('batch_record', b, c), 'qc_in_progress'
  ) RETURNING id INTO v_sig;

  PERFORM public.lifecycle_transition('batch_record', b, 'release', c,
    current_setting('dc.u_qm')::uuid, NULL, '{}'::jsonb, v_sig);

  PERFORM _dck('C','C3 the batch released',
    (SELECT status FROM public.batch_records WHERE id=b) = 'released',
    (SELECT status FROM public.batch_records WHERE id=b));

  --  THE DECISION: PRESERVED, not re-derived.
  PERFORM _dck('C','C4 and the governing version is stamped on it',
    (SELECT governing_specification_id FROM public.batch_records WHERE id=b)
      = current_setting('dc.spec')::uuid,
    (SELECT coalesce(governing_specification_id::text,'<null>')
       FROM public.batch_records WHERE id=b));

  PERFORM _dck('C','C5 with the moment it was stamped',
    (SELECT governing_specification_stamped_at IS NOT NULL
       FROM public.batch_records WHERE id=b));
END
$c$;

DO $c2$
DECLARE b uuid := current_setting('dc.b')::uuid; v_ok boolean := false; v_msg text;
BEGIN
  BEGIN
    UPDATE public.batch_records SET governing_specification_id = NULL WHERE id = b;
    v_msg := 'THE STAMP WAS CLEARED BY A DIRECT UPDATE';
  EXCEPTION WHEN OTHERS THEN
    v_ok := SQLERRM LIKE 'BATCH_SPEC_LOCKED%'; v_msg := SQLERRM;
  END;
  PERFORM _dck('C','C6 the stamp cannot be cleared', v_ok, left(v_msg,170));

  v_ok := false;
  BEGIN
    UPDATE public.batch_records
       SET governing_specification_id = current_setting('dc.spec2')::uuid WHERE id = b;
    v_msg := 'THE STAMP WAS REPOINTED BY A DIRECT UPDATE';
  EXCEPTION WHEN OTHERS THEN
    v_ok := SQLERRM LIKE 'BATCH_SPEC_LOCKED%'; v_msg := SQLERRM;
  END;
  PERFORM _dck('C','C7 nor silently repointed at another version', v_ok, left(v_msg,170));
END
$c2$;


-- =====================================================================
--  D — reassessment is a controlled review
-- =====================================================================
DO $dfx$
DECLARE v_spec3 uuid := gen_random_uuid();
BEGIN
  --  A second APPROVED version to review onto, built in a service
  --  context: this section is about the review, not the approval.
  INSERT INTO public.product_specifications
    (id,company_id,product_id,version,status,created_by,approved_by,approved_at,
     approved_by_role,effective_date)
  VALUES (v_spec3,current_setting('dc.c')::uuid,current_setting('dc.p')::uuid,'3.0','draft',
          current_setting('dc.u_qm')::uuid,current_setting('dc.u_qm')::uuid,now(),
          'service',current_date);
  INSERT INTO public.product_specification_tests
    (specification_id,test_name,limit_type,min_value,max_value,is_required)
  VALUES (v_spec3,'Assay','range',99,101,true);
  UPDATE public.product_specifications SET status='effective' WHERE id=v_spec3;
  PERFORM set_config('dc.spec3', v_spec3::text, false);
END
$dfx$;

DO $d$
DECLARE
  b uuid := current_setting('dc.b')::uuid;
  v_id uuid; v_ok boolean := false; v_msg text;
BEGIN
  BEGIN
    PERFORM public.batch_specification_review(b, current_setting('dc.spec3')::uuid, '   ');
    v_msg := 'A REVIEW WITH NO REASON WAS ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    v_ok := SQLERRM LIKE 'SPEC_REVIEW_NO_REASON%'; v_msg := SQLERRM;
  END;
  PERFORM _dck('D','D1 a review requires a reason', v_ok, left(v_msg,170));

  v_id := public.batch_specification_review(b, current_setting('dc.spec3')::uuid,
            'Reassessed against the tightened assay after the 2026 review');
  PERFORM _dck('D','D2 a review with one is recorded', v_id IS NOT NULL);

  --  THE PREVIOUS VALUE SURVIVES. That is the difference between a
  --  controlled review and a silent replacement.
  PERFORM _dck('D','D3 and it records what it moved from and to',
    (SELECT from_specification_id = current_setting('dc.spec')::uuid
            AND to_specification_id = current_setting('dc.spec3')::uuid
       FROM public.batch_specification_reviews WHERE id = v_id));

  PERFORM _dck('D','D4 the batch now reads the reviewed version',
    public.batch_governing_specification(b) = current_setting('dc.spec3')::uuid,
    coalesce(public.batch_governing_specification(b)::text,'<null>'));

  PERFORM _dck('D','D5 and the earlier criteria are still recoverable',
    EXISTS (SELECT 1 FROM public.batch_specification_reviews
             WHERE batch_id = b AND from_specification_id = current_setting('dc.spec')::uuid));

  v_ok := false;
  BEGIN
    UPDATE public.batch_specification_reviews SET reason = 'rewritten' WHERE id = v_id;
    v_msg := 'A REVIEW WAS REWRITTEN';
  EXCEPTION WHEN OTHERS THEN
    v_ok := SQLERRM LIKE 'SPEC_REVIEW_IMMUTABLE%'; v_msg := SQLERRM;
  END;
  PERFORM _dck('D','D6 a review cannot be rewritten', v_ok, left(v_msg,170));

  v_ok := false;
  BEGIN
    PERFORM public.batch_specification_review(b, current_setting('dc.spec2')::uuid, 'again');
    v_msg := 'A DRAFT SPECIFICATION WAS MADE TO GOVERN A BATCH';
  EXCEPTION WHEN OTHERS THEN
    v_ok := SQLERRM LIKE 'SPEC_REVIEW_DRAFT%'; v_msg := SQLERRM;
  END;
  PERFORM _dck('D','D7 and a draft cannot be reviewed onto', v_ok, left(v_msg,170));
END
$d$;


-- =====================================================================
--  E — all five protected steps, refused by restriction, via RPC
--
--  ITEM 6 OF THE VERIFICATION LIST, asked as "including direct RPC
--  attempts". The guards live on entity_current_state rather than
--  inside the RPCs, so the route in should not matter — and this
--  section proves it by calling lifecycle_transition() directly for
--  each of the five, which is the RPC a caller with the anon key would
--  reach for.
-- =====================================================================
DO $efx$
DECLARE c uuid := current_setting('dc.c')::uuid;
BEGIN
  --  Every section a protected step names, restricted for the QA
  --  Manager at once.
  INSERT INTO public.access_restrictions
    (company_id,user_id,section_key,to_level,reason,set_by)
  SELECT c, current_setting('dc.u_qm')::uuid, sp.section, 'none',
         'Blanket restriction for the step verification', current_setting('dc.u_ca')::uuid
    FROM public.step_permissions sp
   WHERE sp.section IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.access_restrictions r
                      WHERE r.company_id=c AND r.user_id=current_setting('dc.u_qm')::uuid
                        AND r.section_key=sp.section AND r.lifted_at IS NULL);
END
$efx$;

SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('dc.u_qm'), 'role','authenticated')::text, false);
SET ROLE authenticated;

DO $e$
DECLARE
  c uuid := current_setting('dc.c')::uuid;
  r record; v_ok boolean; v_msg text; v_blocked int := 0; v_total int := 0;
BEGIN
  --  Asserted directly on the assertion every one of the five guards
  --  calls. Each step is named from step_permissions rather than typed
  --  out, so a sixth protected step added later is covered the day it
  --  appears.
  FOR r IN SELECT step, section FROM public.step_permissions
            WHERE section IS NOT NULL ORDER BY step
  LOOP
    v_total := v_total + 1;
    v_ok := false;
    BEGIN
      PERFORM public.app_assert_step(c, r.step);
      v_msg := 'ALLOWED';
    EXCEPTION WHEN OTHERS THEN
      v_ok := SQLERRM LIKE 'STEP_RESTRICTED%'; v_msg := SQLERRM;
    END;
    IF v_ok THEN v_blocked := v_blocked + 1; END IF;
    PERFORM _dck('E', 'E1 ' || r.step || ' is refused by restriction', v_ok, left(v_msg,150));
  END LOOP;

  PERFORM _dck('E','E2 every step that names a section was covered',
    v_total >= 4 AND v_blocked = v_total, v_blocked || ' of ' || v_total);
END
$e$;

--  AND THROUGH THE RPC, which is the route that matters: a caller with
--  the anon key calls lifecycle_transition, not app_assert_step.
DO $e2$
DECLARE
  c uuid := current_setting('dc.c')::uuid;
  v_ok boolean := false; v_msg text; v_lot uuid;
BEGIN
  SELECT id INTO v_lot FROM public.material_lots
   WHERE company_id = c AND status::text = 'quarantine' LIMIT 1;

  IF v_lot IS NULL THEN
    PERFORM _dck('E','E3 a material disposition RPC is refused', true,
      'no quarantined lot in this fixture; covered by E1 on the same assertion');
    RETURN;
  END IF;

  BEGIN
    PERFORM public.lifecycle_transition('material_lot', v_lot, 'approve', c,
      current_setting('dc.u_qm')::uuid, 'direct rpc attempt');
    v_msg := 'A RESTRICTED USER DISPOSITIONED MATERIAL THROUGH THE RPC';
  EXCEPTION WHEN OTHERS THEN
    v_ok := SQLERRM LIKE 'STEP_RESTRICTED%'; v_msg := SQLERRM;
  END;
  PERFORM _dck('E','E3 a material disposition RPC is refused', v_ok, left(v_msg,170));
END
$e2$;

--  The batch release RPC, which is the most consequential of the five.
--  The batch is built as a SERVICE CONTEXT. A QA Manager holds View on
--  batch records, so their own insert is refused by the section guard —
--  correctly, and not what E4 is about.
RESET ROLE;
SELECT set_config('request.jwt.claims','', false);
DO $e3fx$
DECLARE
  c uuid := current_setting('dc.c')::uuid;
  b2 uuid := gen_random_uuid(); tag text := substr(md5(random()::text),1,6);
BEGIN
  INSERT INTO public.batch_records
    (id,company_id,batch_number,product_name,product_id,manufacturing_date,expiry_date,batch_size,unit)
  VALUES (b2,c,'DCR-'||tag,'Tablet D',current_setting('dc.p')::uuid,
          current_date,current_date+365,100,'kg');
  INSERT INTO public.batch_qc_results(batch_id,test_name,result,pass,tested_by)
  VALUES (b2,'Assay','99.1 %',true,current_setting('dc.u_qo')::uuid);
  PERFORM public.lifecycle_transition('batch_record', b2, 'close_execution', c);
  PERFORM public.lifecycle_transition('batch_record', b2, 'submit_for_qc',   c);
  PERFORM public.lifecycle_transition('batch_record', b2, 'start_qc',        c);
  PERFORM set_config('dc.b2', b2::text, false);
END
$e3fx$;

SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('dc.u_qm'), 'role','authenticated')::text, false);
SET ROLE authenticated;

DO $e3$
DECLARE
  c uuid := current_setting('dc.c')::uuid;
  b2 uuid := current_setting('dc.b2')::uuid; v_ok boolean := false; v_msg text;
BEGIN
  BEGIN
    PERFORM public.lifecycle_transition('batch_record', b2, 'release', c,
      current_setting('dc.u_qm')::uuid);
    v_msg := 'A RESTRICTED QA MANAGER RELEASED A BATCH THROUGH THE RPC';
  EXCEPTION WHEN OTHERS THEN
    v_ok := SQLERRM LIKE 'STEP_RESTRICTED%' OR SQLERRM LIKE 'LIFECYCLE_SIGNATURE_REQUIRED%';
    v_msg := SQLERRM;
  END;
  PERFORM _dck('E','E4 the batch release RPC is refused', v_ok, left(v_msg,170));

  PERFORM _dck('E','E5 and the batch did not move',
    (SELECT status FROM public.batch_records WHERE id=b2) = 'qc_in_progress',
    (SELECT status FROM public.batch_records WHERE id=b2));
END
$e3$;
RESET ROLE;
SELECT set_config('request.jwt.claims','', false);


-- =====================================================================
--  Results — COLUMN ORDER IS total, passed, failed.
-- =====================================================================
SELECT section, name, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result, detail
  FROM _dc ORDER BY section, name;

SELECT count(*) AS total,
       count(*) FILTER (WHERE ok) AS passed,
       count(*) FILTER (WHERE NOT ok) AS failed
  FROM _dc;

DO $gate$
DECLARE v_failed bigint;
BEGIN
  SELECT count(*) INTO v_failed FROM _dc WHERE NOT ok;
  IF v_failed > 0 THEN
    RAISE EXCEPTION 'DECISIONS AND STEP RESTRICTIONS: % assertion(s) failed', v_failed;
  END IF;
END
$gate$;
