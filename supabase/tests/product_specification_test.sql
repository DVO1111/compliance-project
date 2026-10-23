-- =====================================================================
--  FINISHED-PRODUCT SPECIFICATIONS
--
--  Covers 20261113000000_product_specifications.sql.
--
--  THE DECISION THIS TESTS. Entry 12 of docs/figma-conflicts.md
--  recorded that nothing said which tests a product requires, so a
--  batch with no results was indistinguishable from a product that
--  needs none. The decision taken: require an approved, versioned
--  specification with acceptance criteria and required tests; fail
--  closed with an explanation where none exists; invent no criteria
--  and provide no silent bypass.
--
--  Sections:
--    A. A specification states criteria or it is not approved
--    B. Only a designated QA authority approves one
--    C. Once effective it is frozen, and superseding is the way on
--    D. A batch is judged against the version in force when it was made
--    E. A required test with no result blocks, BY NAME
--    F. A pass the criterion does not support blocks
--    G. What the criterion cannot judge, it does not pretend to
--    H. No bypass: no product, no specification, no release
-- =====================================================================
\set ON_ERROR_STOP on
SET client_min_messages = warning;

RESET ROLE;
SELECT set_config('request.jwt.claims','', false);

CREATE TEMP TABLE _ps(section text, name text, ok boolean, detail text);
GRANT ALL ON _ps TO anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION _psk(p_section text, p_name text, p_ok boolean, p_detail text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO _ps VALUES (p_section,p_name,coalesce(p_ok,false),p_detail); END $$;

DO $fx$
DECLARE
  c_a uuid := gen_random_uuid();
  u_qa uuid := gen_random_uuid();   -- designated QA authority
  u_no uuid := gen_random_uuid();   -- a member who is not one
  p_a uuid := gen_random_uuid();
  tag text := substr(replace(gen_random_uuid()::text,'-',''),1,8);
BEGIN
  PERFORM set_config('ps.c_a', c_a::text, false);
  PERFORM set_config('ps.u_qa', u_qa::text, false);
  PERFORM set_config('ps.u_no', u_no::text, false);
  PERFORM set_config('ps.p_a', p_a::text, false);

  INSERT INTO public.companies(id,name) VALUES (c_a,'Spec Works '||tag);
  INSERT INTO auth.users(id,email) VALUES
    (u_qa,'qa-'||tag||'@ps.test'), (u_no,'no-'||tag||'@ps.test');
  INSERT INTO public.profiles(id,email,full_name,company_id,role) VALUES
    (u_qa,'qa-'||tag||'@ps.test','Ngozi Quality', c_a,'compliance_officer'),
    (u_no,'no-'||tag||'@ps.test','Tunde Member',  c_a,'content_creator');
  INSERT INTO public.company_members(company_id,user_id,role,status) VALUES
    (c_a,u_qa,'qa_manager','active'), (c_a,u_no,'qc_analyst','active');

  INSERT INTO public.material_qa_authorities(company_id,user_id,designated_by)
  VALUES (c_a,u_qa,u_qa);

  INSERT INTO public.products(id,company_id,product_code,trade_name,generic_name,category,created_by)
  VALUES (p_a,c_a,'PS-'||tag,'Tablet S','Paracetamol','drug_pharmaceutical',u_qa);
END
$fx$;


-- =====================================================================
--  A — a specification states criteria or it is not approved
-- =====================================================================
DO $a$
DECLARE
  c_a uuid := current_setting('ps.c_a')::uuid;
  p_a uuid := current_setting('ps.p_a')::uuid;
  v_id uuid; v_ok boolean := false; v_msg text;
BEGIN
  INSERT INTO public.product_specifications(company_id,product_id,version,status,created_by)
  VALUES (c_a,p_a,'EMPTY','draft',current_setting('ps.u_qa')::uuid) RETURNING id INTO v_id;

  BEGIN
    PERFORM public.product_specification_approve(v_id);
    v_msg := 'A SPECIFICATION WITH NO TESTS WAS APPROVED';
  EXCEPTION WHEN OTHERS THEN
    v_ok := SQLERRM LIKE 'PRODUCT_SPEC_NO_TESTS%'; v_msg := SQLERRM;
  END;
  PERFORM _psk('A','A1 a specification with no tests cannot be approved', v_ok, left(v_msg,140));

  --  Tests but none required would approve a batch on nothing — a
  --  silent bypass wearing a document's clothes. Refused when the
  --  document is written rather than when a batch is waiting.
  INSERT INTO public.product_specification_tests
    (specification_id,test_name,limit_type,min_value,max_value,is_required)
  VALUES (v_id,'Appearance','complies',NULL,NULL,false);

  v_ok := false;
  BEGIN
    PERFORM public.product_specification_approve(v_id);
    v_msg := 'A SPECIFICATION REQUIRING NOTHING WAS APPROVED';
  EXCEPTION WHEN OTHERS THEN
    v_ok := SQLERRM LIKE 'PRODUCT_SPEC_NOTHING_REQUIRED%'; v_msg := SQLERRM;
  END;
  PERFORM _psk('A','A2 nor one that marks no test as required', v_ok, left(v_msg,140));

  --  The CHECK constraint says the same thing from the other side: a
  --  row cannot CLAIM to be effective without an approver and a date.
  v_ok := false;
  BEGIN
    INSERT INTO public.product_specifications
      (company_id,product_id,version,status,created_by)
    VALUES (c_a,p_a,'LIAR','effective',current_setting('ps.u_qa')::uuid);
    v_msg := 'A ROW CLAIMED TO BE EFFECTIVE WITH NO APPROVAL';
  EXCEPTION WHEN OTHERS THEN
    v_ok := SQLERRM LIKE '%product_spec_effective_is_complete%'; v_msg := SQLERRM;
  END;
  PERFORM _psk('A','A3 a row cannot claim to be effective without an approval and a date',
    v_ok, left(v_msg,140));
END
$a$;


-- =====================================================================
--  B — only a designated QA authority approves one
--
--  PM-03 has no column for specifications and no step for approving
--  one, so this file does not invent a role. It uses the register that
--  already approves a master formula and releases a material lot, and
--  that choice is recorded for confirmation rather than presented as
--  settled.
-- =====================================================================
DO $bfx$
DECLARE
  c_a uuid := current_setting('ps.c_a')::uuid;
  p_a uuid := current_setting('ps.p_a')::uuid;
  v_id uuid;
BEGIN
  INSERT INTO public.product_specifications(company_id,product_id,version,status,created_by)
  VALUES (c_a,p_a,'1.0','draft',current_setting('ps.u_qa')::uuid) RETURNING id INTO v_id;
  --  expected_text goes in on the INSERT: the CHECK demands it for an
  --  exact_text limit, which is the constraint doing its job.
  INSERT INTO public.product_specification_tests
    (specification_id,test_name,test_method,limit_type,min_value,max_value,expected_text,unit,is_required,sort_order)
  VALUES (v_id,'Assay','HPLC','range',98,102,NULL,'%',true,10),
         (v_id,'Dissolution','USP II','min',80,NULL,NULL,'%',true,20),
         (v_id,'Appearance',NULL,'exact_text',NULL,NULL,'White tablet',NULL,false,30);
  PERFORM set_config('ps.spec1', v_id::text, false);
END
$bfx$;

SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('ps.u_no'), 'role','authenticated')::text, false);
SET ROLE authenticated;
DO $b$
DECLARE v_ok boolean := false; v_msg text;
BEGIN
  BEGIN
    PERFORM public.product_specification_approve(current_setting('ps.spec1')::uuid);
    v_msg := 'A NON-AUTHORITY APPROVED A SPECIFICATION';
  EXCEPTION WHEN OTHERS THEN
    v_ok := SQLERRM LIKE 'PRODUCT_SPEC_FORBIDDEN%'; v_msg := SQLERRM;
  END;
  --  The refusal is now about the ROLE, not a register: u_no is a
  --  qc_analyst. An owner or admin is refused by the same clause,
  --  which is the whole of "administrative access does not carry this
  --  authority" — asserted in section I.
  PERFORM _psk('B','B1 a member who is not the QA manager cannot approve one',
    v_ok, left(v_msg,140));
END
$b$;
RESET ROLE;

--  AN ELECTRONIC SIGNATURE, which 20261117000000 requires of a human
--  approver. Minted here, as a service context, because
--  electronic_signatures is not writable by an authenticated session —
--  signing goes through sign_electronic_record(), which needs a
--  password fixture that belongs to the electronic signature suite
--  rather than this one. What matters here is that approval CONSUMES a
--  signature bound to this signer, this specification and the approve
--  action, which it does either way.
DO $mint$
DECLARE v_sig uuid;
BEGIN
  INSERT INTO public.electronic_signatures (
    company_id, signer_id, signer_name, signer_email,
    entity_type, entity_id, action, meaning, record_hash, signed_state
  ) VALUES (
    current_setting('ps.c_a')::uuid, current_setting('ps.u_qa')::uuid,
    'Ngozi Quality', 'qa@ps.test',
    'product_specification', current_setting('ps.spec1')::uuid, 'approve', 'approved',
    --  The specification's OWN content hash. electronic_signature_record_hash
    --  reads entity_current_state and returns NULL for a specification,
    --  which would make every signature stale — see 20261117000000.
    public.product_specification_record_hash(current_setting('ps.spec1')::uuid),
    'draft'
  ) RETURNING id INTO v_sig;
  PERFORM set_config('ps.sig1', v_sig::text, false);
END
$mint$;

SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('ps.u_qa'), 'role','authenticated')::text, false);
SET ROLE authenticated;
DO $b2$
DECLARE r jsonb; v_ok boolean := false; v_msg text; v_sig uuid;
BEGIN
  v_sig := current_setting('ps.sig1')::uuid;

  BEGIN
    r := public.product_specification_approve(current_setting('ps.spec1')::uuid,
                                              current_date - 30, v_sig);
    v_ok := (r->>'ok')::boolean; v_msg := r::text;
  EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM;
  END;
  PERFORM _psk('B','B2 the QA manager can, with a signature', v_ok, left(v_msg,160));

  PERFORM _psk('B','B2b and the role they held is recorded with it',
    (SELECT approved_by_role FROM public.product_specifications
      WHERE id = current_setting('ps.spec1')::uuid) = 'qa_manager',
    (SELECT coalesce(approved_by_role,'<null>') FROM public.product_specifications
      WHERE id = current_setting('ps.spec1')::uuid));

  PERFORM _psk('B','B2c and the signature is recorded against the version',
    (SELECT approval_signature_id FROM public.product_specifications
      WHERE id = current_setting('ps.spec1')::uuid) = v_sig);

  PERFORM _psk('B','B3 and it counts the required tests, not all of them',
    (r->>'required_tests')::int = 2, r::text);

  PERFORM _psk('B','B4 the specification is effective, approved and dated',
    (SELECT status = 'effective' AND approved_by IS NOT NULL AND approved_at IS NOT NULL
            AND effective_date = current_date - 30
       FROM public.product_specifications WHERE id = current_setting('ps.spec1')::uuid));
END
$b2$;
RESET ROLE;


-- =====================================================================
--  C — once effective it is frozen
-- =====================================================================
DO $c$
DECLARE
  v_id uuid := current_setting('ps.spec1')::uuid;
  v_ok boolean := false; v_msg text;
BEGIN
  BEGIN
    UPDATE public.product_specification_tests SET max_value = 999
     WHERE specification_id = v_id AND test_name = 'Assay';
    v_msg := 'AN EFFECTIVE SPECIFICATION''S LIMITS WERE WIDENED';
  EXCEPTION WHEN OTHERS THEN
    v_ok := SQLERRM LIKE 'PRODUCT_SPEC_FROZEN%'; v_msg := SQLERRM;
  END;
  PERFORM _psk('C','C1 its tests cannot be changed', v_ok, left(v_msg,140));

  v_ok := false;
  BEGIN
    DELETE FROM public.product_specification_tests
     WHERE specification_id = v_id AND test_name = 'Dissolution';
    v_msg := 'A REQUIRED TEST WAS DELETED FROM AN EFFECTIVE SPECIFICATION';
  EXCEPTION WHEN OTHERS THEN
    v_ok := SQLERRM LIKE 'PRODUCT_SPEC_FROZEN%'; v_msg := SQLERRM;
  END;
  PERFORM _psk('C','C2 nor removed', v_ok, left(v_msg,140));

  v_ok := false;
  BEGIN
    INSERT INTO public.product_specification_tests
      (specification_id,test_name,limit_type,is_required)
    VALUES (v_id,'Sneaked in','complies',true);
    v_msg := 'A TEST WAS ADDED TO AN EFFECTIVE SPECIFICATION';
  EXCEPTION WHEN OTHERS THEN
    v_ok := SQLERRM LIKE 'PRODUCT_SPEC_FROZEN%'; v_msg := SQLERRM;
  END;
  PERFORM _psk('C','C3 nor added to', v_ok, left(v_msg,140));

  v_ok := false;
  BEGIN
    UPDATE public.product_specifications SET effective_date = current_date WHERE id = v_id;
    v_msg := 'AN APPROVED SPECIFICATION WAS BACKDATED';
  EXCEPTION WHEN OTHERS THEN
    v_ok := SQLERRM LIKE 'PRODUCT_SPEC_IMMUTABLE%'; v_msg := SQLERRM;
  END;
  PERFORM _psk('C','C4 and what it says cannot be rewritten', v_ok, left(v_msg,140));
END
$c$;


-- =====================================================================
--  D — judged against the version in force when it was made
--
--  A specification tightened after a batch was manufactured must not
--  retrospectively fail material that met the standard it was made to.
--  This is a quality judgement with a regulatory flavour and it is
--  flagged in docs/figma-conflicts.md rather than presented as settled.
-- =====================================================================
DO $d$
DECLARE
  c_a uuid := current_setting('ps.c_a')::uuid;
  p_a uuid := current_setting('ps.p_a')::uuid;
  v_new uuid; b_old uuid := gen_random_uuid(); b_new uuid := gen_random_uuid();
BEGIN
  --  Version 2.0, in force from yesterday, with a tighter assay.
  INSERT INTO public.product_specifications(company_id,product_id,version,status,created_by)
  VALUES (c_a,p_a,'2.0','draft',current_setting('ps.u_qa')::uuid) RETURNING id INTO v_new;
  INSERT INTO public.product_specification_tests
    (specification_id,test_name,limit_type,min_value,max_value,unit,is_required)
  VALUES (v_new,'Assay','range',99,101,'%',true);
  PERFORM public.product_specification_approve(v_new, current_date - 1);
  PERFORM set_config('ps.spec2', v_new::text, false);

  PERFORM _psk('D','D1 approving a new version supersedes the old one',
    (SELECT status FROM public.product_specifications
      WHERE id = current_setting('ps.spec1')::uuid) = 'superseded',
    (SELECT status FROM public.product_specifications
      WHERE id = current_setting('ps.spec1')::uuid));

  --  A batch made 10 days ago: 1.0 was in force, 2.0 was not.
  INSERT INTO public.batch_records
    (id,company_id,batch_number,product_name,product_id,manufacturing_date,expiry_date,batch_size,unit)
  VALUES (b_old,c_a,'OLD-1','Tablet S',p_a,current_date-10,current_date+355,100,'kg');
  PERFORM set_config('ps.b_old', b_old::text, false);

  INSERT INTO public.batch_records
    (id,company_id,batch_number,product_name,product_id,manufacturing_date,expiry_date,batch_size,unit)
  VALUES (b_new,c_a,'NEW-1','Tablet S',p_a,current_date,current_date+365,100,'kg');
  PERFORM set_config('ps.b_new', b_new::text, false);

  PERFORM _psk('D','D2 a batch made before 2.0 is judged against 1.0',
    public.batch_governing_specification(b_old) = current_setting('ps.spec1')::uuid,
    coalesce(public.batch_governing_specification(b_old)::text,'<null>'));

  PERFORM _psk('D','D3 and one made today against 2.0',
    public.batch_governing_specification(b_new) = v_new,
    coalesce(public.batch_governing_specification(b_new)::text,'<null>'));

  --  A SUPERSEDED SPECIFICATION STILL GOVERNS ITS OWN BATCHES. That is
  --  the whole point of choosing by manufacturing date, and the
  --  assertion is here because the obvious implementation — "the
  --  effective one" — would have silently judged old batches against
  --  limits that did not exist when they were made.
  PERFORM _psk('D','D4 a superseded version still governs the batches made under it',
    (SELECT status FROM public.product_specifications
      WHERE id = public.batch_governing_specification(b_old)) = 'superseded');
END
$d$;


-- =====================================================================
--  E — a required test with no result blocks, by name
-- =====================================================================
DO $e$
DECLARE
  b uuid := current_setting('ps.b_old')::uuid;
  v_reason text;
BEGIN
  v_reason := public.batch_release_block_reason(b);
  PERFORM _psk('E','E1 the reason names the specification version',
    v_reason LIKE '%1.0%', v_reason);
  PERFORM _psk('E','E2 and names both missing required tests',
    v_reason LIKE '%Assay%' AND v_reason LIKE '%Dissolution%', v_reason);

  --  Appearance is declared and NOT required, so it is not demanded.
  PERFORM _psk('E','E3 but not the test it does not require',
    v_reason NOT LIKE '%Appearance%', v_reason);

  --  One of the two recorded; the other is still named.
  INSERT INTO public.batch_qc_results(batch_id,test_name,result,pass,tested_by)
  VALUES (b,'Assay','99.4 %',true,current_setting('ps.u_no')::uuid);

  v_reason := public.batch_release_block_reason(b);
  PERFORM _psk('E','E4 recording one leaves the other named',
    v_reason LIKE '%Dissolution%' AND v_reason NOT LIKE '%Assay%', v_reason);

  INSERT INTO public.batch_qc_results(batch_id,test_name,result,pass,tested_by)
  VALUES (b,'Dissolution','86 %',true,current_setting('ps.u_no')::uuid);

  PERFORM _psk('E','E5 and both recorded clears the objection',
    public.batch_release_block_reason(b) IS NULL,
    coalesce(public.batch_release_block_reason(b),'<null>'));
END
$e$;


-- =====================================================================
--  F — a pass the criterion does not support
--
--  The verdict is typed by a person; the limits come from the approved
--  specification. Where the two can be compared and disagree, the
--  specification wins.
-- =====================================================================
DO $f$
DECLARE
  b uuid := current_setting('ps.b_new')::uuid;
  v_reason text;
BEGIN
  --  b_new is judged against 2.0: Assay 99 to 101.
  INSERT INTO public.batch_qc_results(batch_id,test_name,result,pass,tested_by)
  VALUES (b,'Assay','97.2 %',true,current_setting('ps.u_no')::uuid);

  v_reason := public.batch_release_block_reason(b);
  PERFORM _psk('F','F1 a pass outside the limits is refused',
    v_reason LIKE '%does not meet specification%', v_reason);
  PERFORM _psk('F','F2 and the reason quotes the value and the limit',
    v_reason LIKE '%97.2%' AND v_reason LIKE '%99%' AND v_reason LIKE '%101%', v_reason);

  PERFORM _psk('F','F3 the condition row says so too',
    EXISTS (SELECT 1 FROM public.batch_release_conditions(b)
             WHERE condition_key = 'qc_contradicts_spec'));

  --  Corrected to a value inside the limits: the objection lifts,
  --  because the gate reads the result that stands.
  INSERT INTO public.batch_qc_results
    (batch_id,test_name,result,pass,tested_by,corrected_from_id,correction_reason)
  SELECT b,'Assay','99.8 %',true,current_setting('ps.u_no')::uuid,r.id,'Integration re-run'
    FROM public.batch_qc_results r
   WHERE r.batch_id = b AND r.result = '97.2 %';

  PERFORM _psk('F','F4 correcting it to a value inside the limits clears it',
    public.batch_release_block_reason(b) IS NULL,
    coalesce(public.batch_release_block_reason(b),'<null>'));
END
$f$;


-- =====================================================================
--  G — what the criterion cannot judge, it does not pretend to
--
--  A LIMITATION, ASSERTED RATHER THAN HOPED FOR. The comparison reads
--  the first number out of a result, so a textual result against a
--  numeric limit cannot be judged. It returns NULL — "not judged
--  here" — and the recorded verdict stands alone. Somebody can still
--  pass a batch by typing words where a number belongs.
-- =====================================================================
DO $g$
BEGIN
  PERFORM _psk('G','G1 a number inside the range is a pass',
    public.product_test_meets_criterion('range',98,102,NULL,'99.4 %') IS TRUE);
  PERFORM _psk('G','G2 a number outside it is a fail',
    public.product_test_meets_criterion('range',98,102,NULL,'88.1 %') IS FALSE);

  --  THE BUG THE MIGRATION'S OWN SELF-TEST CAUGHT. The first version
  --  used a capturing group, so regexp_match returned ".4" for
  --  "99.4 %" — and .4 is not inside 98 to 102, which made every
  --  out-of-specification decimal read as a FAIL rather than a pass.
  --  Both directions are asserted so a regression shows up whichever
  --  way it goes.
  PERFORM _psk('G','G3 the decimal is read whole, not as a fragment',
    public.product_test_meets_criterion('range',0,1,NULL,'99.4 %') IS FALSE);

  PERFORM _psk('G','G4 text against a numeric limit is not judged',
    public.product_test_meets_criterion('range',98,102,NULL,'white powder') IS NULL);
  PERFORM _psk('G','G5 complies is left to the person who recorded it',
    public.product_test_meets_criterion('complies',NULL,NULL,NULL,'yes') IS NULL);
  PERFORM _psk('G','G6 exact text is compared case-insensitively',
    public.product_test_meets_criterion('exact_text',NULL,NULL,'Complies','complies') IS TRUE);
  PERFORM _psk('G','G7 and a different text is a fail',
    public.product_test_meets_criterion('exact_text',NULL,NULL,'Complies','does not comply') IS FALSE);
END
$g$;


-- =====================================================================
--  H — no bypass
-- =====================================================================
DO $h$
DECLARE
  c_a uuid := current_setting('ps.c_a')::uuid;
  b_np uuid := gen_random_uuid();
  p_b uuid := gen_random_uuid();
  b_ns uuid := gen_random_uuid();
  tag text := substr(replace(gen_random_uuid()::text,'-',''),1,6);
BEGIN
  --  A batch naming no product.
  INSERT INTO public.batch_records
    (id,company_id,batch_number,product_name,manufacturing_date,expiry_date,batch_size,unit)
  VALUES (b_np,c_a,'NP-'||tag,'Unlinked',current_date,current_date+365,100,'kg');
  PERFORM _psk('H','H1 a batch naming no product is refused',
    public.batch_release_block_reason(b_np) LIKE '%names no product%',
    public.batch_release_block_reason(b_np));

  --  A product with no approved specification at all.
  INSERT INTO public.products(id,company_id,product_code,trade_name,generic_name,category,created_by)
  VALUES (p_b,c_a,'NS-'||tag,'Tablet N','Ibuprofen','drug_pharmaceutical',current_setting('ps.u_qa')::uuid);
  INSERT INTO public.batch_records
    (id,company_id,batch_number,product_name,product_id,manufacturing_date,expiry_date,batch_size,unit)
  VALUES (b_ns,c_a,'NS-'||tag,'Tablet N',p_b,current_date,current_date+365,100,'kg');

  PERFORM _psk('H','H2 a product with no approved specification is refused',
    public.batch_release_block_reason(b_ns) LIKE '%no approved finished-product specification%',
    public.batch_release_block_reason(b_ns));

  --  AND THE REFUSAL SAYS WHAT TO DO. A gate that says "no" without
  --  saying what is missing gets worked around rather than satisfied.
  PERFORM _psk('H','H3 and the refusal says what would satisfy it',
    public.batch_release_block_reason(b_ns) LIKE '%Approve a specification%',
    public.batch_release_block_reason(b_ns));

  --  A DRAFT IS NOT A SPECIFICATION. The obvious bypass.
  INSERT INTO public.product_specifications(company_id,product_id,version,status,created_by)
  VALUES (c_a,p_b,'0.1','draft',current_setting('ps.u_qa')::uuid);
  PERFORM _psk('H','H4 a draft specification does not satisfy it',
    public.batch_governing_specification(b_ns) IS NULL,
    coalesce(public.batch_governing_specification(b_ns)::text,'<null>'));

  --  Nor one that comes into force after the batch was made.
  DECLARE v_late uuid;
  BEGIN
    INSERT INTO public.product_specifications(company_id,product_id,version,status,created_by)
    VALUES (c_a,p_b,'9.9','draft',current_setting('ps.u_qa')::uuid) RETURNING id INTO v_late;
    INSERT INTO public.product_specification_tests
      (specification_id,test_name,limit_type,min_value,max_value,is_required)
    VALUES (v_late,'Assay','range',98,102,true);
    PERFORM public.product_specification_approve(v_late, current_date + 7);
    PERFORM _psk('H','H5 nor one effective only after the batch was made',
      public.batch_governing_specification(b_ns) IS NULL,
      coalesce(public.batch_governing_specification(b_ns)::text,'<null>'));
  END;
END
$h$;

SELECT set_config('request.jwt.claims','', false);


-- =====================================================================
--  Results — COLUMN ORDER IS total, passed, failed.
-- =====================================================================
SELECT section, name, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result, detail
  FROM _ps ORDER BY section, name;

SELECT count(*) AS total,
       count(*) FILTER (WHERE ok) AS passed,
       count(*) FILTER (WHERE NOT ok) AS failed
  FROM _ps;

DO $gate$
DECLARE v_failed bigint;
BEGIN
  SELECT count(*) INTO v_failed FROM _ps WHERE NOT ok;
  IF v_failed > 0 THEN
    RAISE EXCEPTION 'PRODUCT SPECIFICATIONS: % assertion(s) failed', v_failed;
  END IF;
END
$gate$;
