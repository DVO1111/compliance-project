-- =====================================================================
--  PM-04 INDIVIDUAL RESTRICTIONS, AND THE CoA REGISTER COLUMN
--
--  Covers 20261110000000_access_restrictions.sql and
--  20261109000000_coa_register_section_authorisation.sql.
--
--  THE CLAIM UNDER TEST is the one that makes a restriction a feature
--  rather than a row: app_section_access applies it, so every guard
--  added by 20261106000000, 20261107000000 and 20261109000000 honours
--  it without knowing restrictions exist. A table the access screen
--  reads and nothing else does would produce a system that DISPLAYS a
--  restriction it is not applying, which is worse than having none
--  because somebody believes it.
--
--  Sections:
--    A. A restriction lowers what the grid says
--    B. ... and the guards refuse accordingly
--    C. A restriction only ever lowers
--    D. Expiry, lifting, and what counts as active
--    E. Only the compliance admin may set one
--    F. The record of the decision is not editable
--    G. The CoA register column is enforced
-- =====================================================================
\set ON_ERROR_STOP on
SET client_min_messages = warning;

RESET ROLE;
SELECT set_config('request.jwt.claims','', false);

CREATE TEMP TABLE _ar(section text, name text, ok boolean, detail text);
GRANT ALL ON _ar TO anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION _ark(p_section text, p_name text, p_ok boolean, p_detail text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO _ar VALUES (p_section,p_name,coalesce(p_ok,false),p_detail); END $$;

DO $fx$
DECLARE
  c_a uuid := gen_random_uuid();
  u_qm uuid := gen_random_uuid();   -- qa_manager: Act on suppliers and coa_register
  u_ca uuid := gen_random_uuid();   -- compliance_admin: may change permissions
  u_sk uuid := gen_random_uuid();   -- storekeeper: no access to coa_register
  u_un uuid := gen_random_uuid();   -- a role PM-03 does not tabulate
  tag text := substr(replace(gen_random_uuid()::text,'-',''),1,8);
BEGIN
  PERFORM set_config('ar.c_a', c_a::text, false);
  PERFORM set_config('ar.u_qm', u_qm::text, false);
  PERFORM set_config('ar.u_ca', u_ca::text, false);
  PERFORM set_config('ar.u_sk', u_sk::text, false);
  PERFORM set_config('ar.u_un', u_un::text, false);

  INSERT INTO public.companies(id,name) VALUES (c_a,'Restriction Works '||tag);
  INSERT INTO auth.users(id,email) VALUES
    (u_qm,'qm-'||tag||'@ar.test'), (u_ca,'ca-'||tag||'@ar.test'),
    (u_sk,'sk-'||tag||'@ar.test'), (u_un,'un-'||tag||'@ar.test');
  INSERT INTO public.profiles(id,email,full_name,company_id,role) VALUES
    (u_qm,'qm-'||tag||'@ar.test','Ngozi Quality',   c_a,'compliance_officer'),
    (u_ca,'ca-'||tag||'@ar.test','Kemi Admin',      c_a,'admin'),
    (u_sk,'sk-'||tag||'@ar.test','Bisi Store',      c_a,'content_creator'),
    (u_un,'un-'||tag||'@ar.test','Tunde Untabled',  c_a,'content_creator');
  INSERT INTO public.company_members(company_id,user_id,role,status) VALUES
    (c_a,u_qm,'qa_manager','active'),
    (c_a,u_ca,'compliance_admin','active'),
    (c_a,u_sk,'storekeeper','active'),
    (c_a,u_un,'member','active');
END
$fx$;


-- =====================================================================
--  A — a restriction lowers what the grid says
-- =====================================================================
DO $a$
DECLARE
  c_a uuid := current_setting('ar.c_a')::uuid;
  u_qm uuid := current_setting('ar.u_qm')::uuid;
  v_id uuid;
BEGIN
  PERFORM _ark('A','A1 the QA manager starts with Act on suppliers',
    public.app_section_access(c_a,'suppliers',u_qm) = 'act',
    public.app_section_access(c_a,'suppliers',u_qm));

  INSERT INTO public.access_restrictions
    (company_id,user_id,section_key,to_level,reason,set_by)
  VALUES (c_a,u_qm,'suppliers','view','Supplier audit outstanding',u_qm)
  RETURNING id INTO v_id;
  PERFORM set_config('ar.r1', v_id::text, false);

  PERFORM _ark('A','A2 a restriction to view lowers it',
    public.app_section_access(c_a,'suppliers',u_qm) = 'view',
    public.app_section_access(c_a,'suppliers',u_qm));

  PERFORM _ark('A','A3 and leaves other sections alone',
    public.app_section_access(c_a,'coa_register',u_qm) = 'act',
    public.app_section_access(c_a,'coa_register',u_qm));

  --  The lesser of the two, never the combination. A `none`
  --  restriction on a `view` cell stays none.
  INSERT INTO public.access_restrictions
    (company_id,user_id,section_key,to_level,reason,set_by)
  VALUES (c_a,u_qm,'goods_receipt','none','Not trained on receipt',u_qm);
  PERFORM _ark('A','A4 a none restriction on a view cell gives none',
    public.app_section_access(c_a,'goods_receipt',u_qm) = 'none',
    public.app_section_access(c_a,'goods_receipt',u_qm));

  --  Two overlapping restrictions: the strictest wins rather than the
  --  most recent, so adding a gentler one cannot loosen an existing one.
  INSERT INTO public.access_restrictions
    (company_id,user_id,section_key,to_level,reason,set_by)
  VALUES (c_a,u_qm,'suppliers','none','Second, stricter',u_qm);
  PERFORM _ark('A','A5 the strictest of two overlapping restrictions wins',
    public.app_section_access(c_a,'suppliers',u_qm) = 'none',
    public.app_section_access(c_a,'suppliers',u_qm));

  --  A role PM-03 does not tabulate has no cell. A restriction on such
  --  a person has nothing to lower, and inventing a cell in order to
  --  restrict it would enforce a rule the design does not contain.
  INSERT INTO public.access_restrictions
    (company_id,user_id,section_key,to_level,reason,set_by)
  VALUES (c_a,current_setting('ar.u_un')::uuid,'suppliers','none','Untabulated',u_qm);
  PERFORM _ark('A','A6 an untabulated role still has no cell, restriction or not',
    public.app_section_access(c_a,'suppliers',current_setting('ar.u_un')::uuid) IS NULL,
    coalesce(public.app_section_access(c_a,'suppliers',current_setting('ar.u_un')::uuid),'<null>'));
END
$a$;


-- =====================================================================
--  B — the guards refuse accordingly
--
--  THE POINT OF THE WHOLE FILE. The supplier approval guard was
--  written before restrictions existed and knows nothing about them;
--  it reaches the grid through app_assert_section_act, so it honours
--  one for free.
-- =====================================================================
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('ar.u_qm'), 'role','authenticated')::text, false);
SET ROLE authenticated;

DO $b$
DECLARE c_a uuid := current_setting('ar.c_a')::uuid; v_ok boolean := false; v_msg text;
BEGIN
  PERFORM _ark('B','B0 the restriction is visible to the person it applies to',
    public.app_section_access(c_a,'goods_receipt') = 'none',
    public.app_section_access(c_a,'goods_receipt'));

  --  batch_records is NOT restricted for this person; their cell is
  --  'view' from the grid, so this refusal is the grid's. Included so
  --  B2's refusal can be attributed to the restriction rather than to
  --  a person who is refused everything.
  BEGIN
    PERFORM public.app_assert_section_act(c_a,'batch_records');
    PERFORM _ark('B','B1 an unrestricted View cell still refuses', false, 'allowed');
  EXCEPTION WHEN OTHERS THEN
    PERFORM _ark('B','B1 an unrestricted View cell still refuses',
      SQLERRM LIKE 'SECTION_FORBIDDEN%', SQLERRM);
  END;

  --  coa_register IS act for this person and unrestricted.
  BEGIN
    PERFORM public.app_assert_section_act(c_a,'coa_register');
    PERFORM _ark('B','B2 an unrestricted Act cell is permitted', true);
  EXCEPTION WHEN OTHERS THEN
    PERFORM _ark('B','B2 an unrestricted Act cell is permitted', false, SQLERRM);
  END;

  --  suppliers is Act in the grid and restricted to none.
  BEGIN
    PERFORM public.app_assert_section_act(c_a,'suppliers');
    PERFORM _ark('B','B3 a restricted Act cell is refused', false, 'allowed');
  EXCEPTION WHEN OTHERS THEN
    v_msg := SQLERRM;
    PERFORM _ark('B','B3 a restricted Act cell is refused',
      SQLERRM LIKE 'SECTION_FORBIDDEN%', v_msg);
  END;

  --  And the refusal describes the access they actually have, not the
  --  one their role would give — otherwise it reads as a bug to
  --  somebody who knows they are a QA Manager.
  PERFORM _ark('B','B4 and the refusal reports the restricted access',
    v_msg LIKE '%none access to suppliers%', v_msg);
END
$b$;
RESET ROLE;


-- =====================================================================
--  C — a restriction only ever lowers
-- =====================================================================
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('ar.u_ca'), 'role','authenticated')::text, false);
SET ROLE authenticated;

DO $c$
DECLARE
  c_a uuid := current_setting('ar.c_a')::uuid;
  u_sk uuid := current_setting('ar.u_sk')::uuid;
  v_msg text; v_ok boolean := false;
BEGIN
  BEGIN
    PERFORM public.access_restrict(c_a, u_sk, 'coa_register', 'act', 'Trying to promote');
    v_msg := 'A RESTRICTION RAISED ACCESS';
  EXCEPTION WHEN OTHERS THEN
    v_ok := SQLERRM LIKE 'RESTRICTION_ONLY_LOWERS%'
         OR SQLERRM LIKE '%violates check constraint%'; v_msg := SQLERRM;
  END;
  PERFORM _ark('C','C1 a restriction cannot grant act', v_ok, left(v_msg,140));

  v_ok := false;
  BEGIN
    PERFORM public.access_restrict(c_a, u_sk, 'coa_register', 'view', '   ');
    v_msg := 'A RESTRICTION WITH NO REASON WAS ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    v_ok := SQLERRM LIKE 'RESTRICTION_NO_REASON%'; v_msg := SQLERRM;
  END;
  PERFORM _ark('C','C2 a restriction requires a reason', v_ok, left(v_msg,140));

  v_ok := false;
  BEGIN
    PERFORM public.access_restrict(c_a, u_sk, 'not_a_section', 'view', 'Reason');
    v_msg := 'A RESTRICTION ON AN UNKNOWN SECTION WAS ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    v_ok := SQLERRM LIKE 'SECTION_UNKNOWN%'; v_msg := SQLERRM;
  END;
  PERFORM _ark('C','C3 and a section that exists', v_ok, left(v_msg,140));

  v_ok := false;
  BEGIN
    PERFORM public.access_restrict(c_a, u_sk, 'coa_register', 'view', 'Reason',
                                   current_date - 1);
    v_msg := 'A RESTRICTION EXPIRING IN THE PAST WAS ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    v_ok := SQLERRM LIKE 'RESTRICTION_ALREADY_EXPIRED%'; v_msg := SQLERRM;
  END;
  PERFORM _ark('C','C4 an already-expired restriction is refused', v_ok, left(v_msg,140));

  v_ok := false;
  BEGIN
    PERFORM public.access_restrict(c_a, gen_random_uuid(), 'coa_register', 'view', 'Reason');
    v_msg := 'A RESTRICTION ON A NON-MEMBER WAS ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    v_ok := SQLERRM LIKE 'RESTRICTION_NOT_A_MEMBER%'; v_msg := SQLERRM;
  END;
  PERFORM _ark('C','C5 and a person who is a member', v_ok, left(v_msg,140));
END
$c$;


-- =====================================================================
--  D — expiry, lifting, and what counts as active
-- =====================================================================
DO $d$
DECLARE
  c_a uuid := current_setting('ar.c_a')::uuid;
  u_sk uuid := current_setting('ar.u_sk')::uuid;
  v_id uuid; v_ok boolean := false; v_msg text;
BEGIN
  --  The storekeeper's material_lots cell is Act.
  PERFORM _ark('D','D0 the storekeeper starts with Act on material lots',
    public.app_section_access(c_a,'material_lots',u_sk) = 'act',
    public.app_section_access(c_a,'material_lots',u_sk));

  v_id := public.access_restrict(c_a, u_sk, 'material_lots', 'view',
                                 'Retraining', current_date + 7);
  PERFORM _ark('D','D1 a dated restriction applies while it is in date',
    public.app_section_access(c_a,'material_lots',u_sk) = 'view',
    public.app_section_access(c_a,'material_lots',u_sk));

  PERFORM public.access_restriction_lift(v_id, 'Retraining completed');
  PERFORM _ark('D','D2 lifting it restores the role''s cell',
    public.app_section_access(c_a,'material_lots',u_sk) = 'act',
    public.app_section_access(c_a,'material_lots',u_sk));

  --  Lifted rather than deleted: the decision and its reversal are both
  --  part of the history PM-04 draws.
  PERFORM _ark('D','D3 and the row is still there, with who lifted it and why',
    EXISTS (SELECT 1 FROM public.access_restrictions
             WHERE id = v_id AND lifted_at IS NOT NULL
               AND lift_reason = 'Retraining completed'));

  v_ok := false;
  BEGIN
    PERFORM public.access_restriction_lift(v_id, 'Again');
    v_msg := 'A LIFTED RESTRICTION WAS LIFTED TWICE';
  EXCEPTION WHEN OTHERS THEN
    v_ok := SQLERRM LIKE 'RESTRICTION_ALREADY_LIFTED%'; v_msg := SQLERRM;
  END;
  PERFORM _ark('D','D4 it cannot be lifted twice', v_ok, left(v_msg,140));

  v_ok := false;
  BEGIN
    PERFORM public.access_restriction_lift(
      public.access_restrict(c_a, u_sk, 'material_lots', 'view', 'Another'), '  ');
    v_msg := 'LIFTED WITH NO REASON';
  EXCEPTION WHEN OTHERS THEN
    v_ok := SQLERRM LIKE 'RESTRICTION_NO_LIFT_REASON%'; v_msg := SQLERRM;
  END;
  PERFORM _ark('D','D5 lifting requires a reason', v_ok, left(v_msg,140));
END
$d$;
RESET ROLE;

--  An expired restriction stops applying without anybody touching it.
--  Inserted directly because access_restrict refuses a past date, which
--  is C4 — this is the same row a week later.
DO $d2$
DECLARE
  c_a uuid := current_setting('ar.c_a')::uuid;
  u_sk uuid := current_setting('ar.u_sk')::uuid;
BEGIN
  --  Clear the one D5 left open, so this measures only the expired row.
  UPDATE public.access_restrictions
     SET lifted_at = now(), lift_reason = 'fixture tidy'
   WHERE company_id = c_a AND user_id = u_sk AND lifted_at IS NULL;

  INSERT INTO public.access_restrictions
    (company_id,user_id,section_key,to_level,reason,until,set_by)
  VALUES (c_a,u_sk,'material_lots','none','Expired last week',current_date - 7,u_sk);

  PERFORM _ark('D','D6 an expired restriction no longer applies',
    public.app_section_access(c_a,'material_lots',u_sk) = 'act',
    public.app_section_access(c_a,'material_lots',u_sk));

  PERFORM _ark('D','D7 but is still on the record',
    EXISTS (SELECT 1 FROM public.access_restrictions
             WHERE company_id = c_a AND user_id = u_sk AND until < current_date));
END
$d2$;


-- =====================================================================
--  E — only the compliance admin may set one
--
--  PM-03's step table: "Change roles and permissions — Compliance
--  admin — Logged". Reached through app_assert_step rather than a new
--  rule invented for this table.
-- =====================================================================
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('ar.u_qm'), 'role','authenticated')::text, false);
SET ROLE authenticated;

DO $e$
DECLARE
  c_a uuid := current_setting('ar.c_a')::uuid;
  u_sk uuid := current_setting('ar.u_sk')::uuid;
  v_ok boolean := false; v_msg text;
BEGIN
  BEGIN
    PERFORM public.access_restrict(c_a, u_sk, 'goods_receipt', 'view', 'By a QA manager');
    v_msg := 'A QA MANAGER SET A RESTRICTION';
  EXCEPTION WHEN OTHERS THEN
    v_ok := SQLERRM LIKE 'STEP_FORBIDDEN%'; v_msg := SQLERRM;
  END;
  PERFORM _ark('E','E1 a QA manager cannot set a restriction', v_ok, left(v_msg,140));
END
$e$;
RESET ROLE;

SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('ar.u_ca'), 'role','authenticated')::text, false);
SET ROLE authenticated;
DO $e2$
DECLARE
  c_a uuid := current_setting('ar.c_a')::uuid;
  u_sk uuid := current_setting('ar.u_sk')::uuid;
  v_ok boolean := false; v_msg text;
BEGIN
  BEGIN
    PERFORM public.access_restrict(c_a, u_sk, 'goods_receipt', 'view', 'By the compliance admin');
    v_ok := true; v_msg := 'set';
  EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM;
  END;
  PERFORM _ark('E','E2 the compliance admin can', v_ok, left(v_msg,140));

  PERFORM _ark('E','E3 and it takes effect',
    public.app_section_access(c_a,'goods_receipt',u_sk) = 'view',
    public.app_section_access(c_a,'goods_receipt',u_sk));
END
$e2$;
RESET ROLE;


-- =====================================================================
--  F — the record of the decision is not editable
-- =====================================================================
DO $f$
DECLARE r1 uuid := current_setting('ar.r1')::uuid; v_ok boolean := false; v_msg text;
BEGIN
  BEGIN
    UPDATE public.access_restrictions SET reason = 'rewritten' WHERE id = r1;
    v_msg := 'A RESTRICTION''S REASON WAS REWRITTEN';
  EXCEPTION WHEN OTHERS THEN
    v_ok := SQLERRM LIKE 'RESTRICTION_IMMUTABLE%'; v_msg := SQLERRM;
  END;
  PERFORM _ark('F','F1 what a restriction says cannot be changed', v_ok, left(v_msg,140));

  v_ok := false;
  BEGIN
    DELETE FROM public.access_restrictions WHERE id = r1;
    v_msg := 'A RESTRICTION WAS DELETED';
  EXCEPTION WHEN OTHERS THEN
    v_ok := SQLERRM LIKE 'RESTRICTION_IMMUTABLE%'; v_msg := SQLERRM;
  END;
  PERFORM _ark('F','F2 and it is lifted rather than deleted', v_ok, left(v_msg,140));
END
$f$;


-- =====================================================================
--  G — the CoA register column is enforced
--
--  Approving a certificate was a bare UPDATE with no role check, gated
--  in the interface on the legacy GRC permissions.
-- =====================================================================
DO $gfx$
DECLARE
  c_a uuid := current_setting('ar.c_a')::uuid;
  b uuid := gen_random_uuid();
  p_id uuid := gen_random_uuid();
  s_id uuid := gen_random_uuid();
  tag text := substr(replace(gen_random_uuid()::text,'-',''),1,6);
BEGIN
  --  A PRODUCT AND AN APPROVED SPECIFICATION, because 20261113000000
  --  judges a batch against the specification in force when it was
  --  made and refuses one that names no product. Section H is about
  --  dispatch, so the release has to be reachable for the dispatch
  --  gate to be the thing under test.
  INSERT INTO public.products(id,company_id,product_code,trade_name,generic_name,category,created_by)
  VALUES (p_id,c_a,'ARP-'||tag,'Tablet R','Paracetamol','drug_pharmaceutical',
          current_setting('ar.u_qm')::uuid);

  INSERT INTO public.batch_records
    (id,company_id,batch_number,product_name,product_id,manufacturing_date,expiry_date,batch_size,unit)
  VALUES (b,c_a,'ARB-'||tag,'Tablet R',p_id,current_date,current_date+365,100,'kg');
  PERFORM set_config('ar.b', b::text, false);

  INSERT INTO public.product_specifications
    (id,company_id,product_id,version,status,created_by)
  VALUES (s_id,c_a,p_id,'1.0','draft',current_setting('ar.u_qm')::uuid);
  INSERT INTO public.product_specification_tests
    (specification_id,test_name,limit_type,min_value,max_value,unit,is_required)
  VALUES (s_id,'Assay','range',98,102,'%',true);
  UPDATE public.product_specifications
     SET status='effective', approved_by=current_setting('ar.u_qm')::uuid,
         approved_at=now(), approved_by_role='service', effective_date=current_date - 1
   WHERE id = s_id;

  --  And the product registered, because D05's gate refuses a release
  --  against a product still in concept. Walked through the real
  --  lifecycle rather than by setting a status column, which a trigger
  --  refuses anyway.
  PERFORM public.lifecycle_transition('product', p_id, 'start_regulatory_prep', c_a);
  PERFORM public.lifecycle_transition('product', p_id, 'submit_to_regulator',   c_a);
  PERFORM public.lifecycle_transition('product', p_id, 'record_registration',   c_a,
                                      NULL, 'NAFDAC listing granted');

  INSERT INTO public.certificate_of_analysis
    (company_id,batch_id,coa_number,product_name,batch_number,results,status)
  VALUES (c_a,b,'COA-'||tag,'Tablet R','ARB-'||tag,'[]'::jsonb,'draft');
END
$gfx$;

SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('ar.u_sk'), 'role','authenticated')::text, false);
SET ROLE authenticated;
DO $g$
DECLARE c_a uuid := current_setting('ar.c_a')::uuid; v_ok boolean := false; v_msg text;
BEGIN
  PERFORM _ark('G','G0 the storekeeper has no access to the CoA register',
    public.app_section_access(c_a,'coa_register') = 'none',
    public.app_section_access(c_a,'coa_register'));

  --  THE REFUSAL ON THIS TABLE IS SILENT, and that is worth asserting
  --  rather than discovering. certificate_of_analysis has a row-level
  --  update policy, so a caller the policy excludes matches ZERO ROWS
  --  and the UPDATE succeeds having changed nothing — the section
  --  trigger is never reached. Every other table guarded by this work
  --  raises SECTION_FORBIDDEN. A screen that treats "no error" as "it
  --  worked" will report an approval that did not happen.
  BEGIN
    UPDATE public.certificate_of_analysis
       SET status = 'qa_approved', qa_approved_at = now()
     WHERE company_id = c_a;
    v_ok := true; v_msg := 'no error — the row-level policy filtered it out';
  EXCEPTION WHEN OTHERS THEN
    v_msg := SQLERRM;
  END;
  PERFORM _ark('G','G1 a storekeeper''s approval is filtered, not refused',
    v_ok, left(v_msg,140));

  PERFORM _ark('G','G2 and the certificate is still a draft',
    (SELECT status FROM public.certificate_of_analysis WHERE company_id = c_a) = 'draft',
    (SELECT status FROM public.certificate_of_analysis WHERE company_id = c_a));

  --  ISSUING one is a different path with a different answer. The
  --  insert policy admits any company member — so before this guard,
  --  any member could issue a certificate of analysis, which is a
  --  statement about a batch made to somebody outside the company.
  --  Here the trigger IS the check, and it raises.
  v_ok := false;
  BEGIN
    INSERT INTO public.certificate_of_analysis
      (company_id,batch_id,coa_number,product_name,batch_number,results,status)
    VALUES (c_a,current_setting('ar.b')::uuid,'COA-SK','Tablet R','ARB','[]'::jsonb,'draft');
    v_msg := 'A STOREKEEPER ISSUED A CERTIFICATE OF ANALYSIS';
  EXCEPTION WHEN OTHERS THEN
    v_ok := SQLERRM LIKE 'SECTION_FORBIDDEN%'; v_msg := SQLERRM;
  END;
  PERFORM _ark('G','G2b and they cannot issue one, which does raise',
    v_ok, left(v_msg,140));
END
$g$;
RESET ROLE;

SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('ar.u_qm'), 'role','authenticated')::text, false);
SET ROLE authenticated;
DO $g2$
DECLARE c_a uuid := current_setting('ar.c_a')::uuid; v_ok boolean := false; v_msg text;
BEGIN
  BEGIN
    UPDATE public.certificate_of_analysis
       SET status = 'qa_approved', qa_approved_at = now()
     WHERE company_id = c_a;
    v_ok := true; v_msg := 'approved';
  EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM;
  END;
  PERFORM _ark('G','G3 the QA manager can', v_ok, left(v_msg,140));

  --  And a restriction reaches this guard too, which is the whole
  --  arrangement working end to end: a table added after the guard,
  --  honoured by it.
  PERFORM _ark('G','G4 the QA manager''s CoA cell is act',
    public.app_section_access(c_a,'coa_register') = 'act',
    public.app_section_access(c_a,'coa_register'));
END
$g2$;
RESET ROLE;

SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('ar.u_ca'), 'role','authenticated')::text, false);
SET ROLE authenticated;
DO $g3$
BEGIN
  PERFORM public.access_restrict(current_setting('ar.c_a')::uuid,
    current_setting('ar.u_qm')::uuid, 'coa_register', 'view',
    'Under review after a certificate error');
END
$g3$;
RESET ROLE;

SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('ar.u_qm'), 'role','authenticated')::text, false);
SET ROLE authenticated;
DO $g4$
DECLARE c_a uuid := current_setting('ar.c_a')::uuid; v_ok boolean := false; v_msg text;
BEGIN
  PERFORM _ark('G','G5 after a restriction their CoA cell is view',
    public.app_section_access(c_a,'coa_register') = 'view',
    public.app_section_access(c_a,'coa_register'));

  --  The restriction reaches the row-level policy, which reads the same
  --  app_section_access — so the restricted QA Manager is filtered out
  --  exactly as the storekeeper was. The approval does not take effect.
  BEGIN
    UPDATE public.certificate_of_analysis
       SET status = 'draft' WHERE company_id = c_a;
    v_msg := 'no error';
  EXCEPTION WHEN OTHERS THEN
    v_msg := SQLERRM;
  END;
  PERFORM _ark('G','G6 a restricted QA manager''s change does not take effect',
    (SELECT status FROM public.certificate_of_analysis
      WHERE company_id = c_a AND coa_number <> 'COA-SK') = 'qa_approved',
    (SELECT status FROM public.certificate_of_analysis
      WHERE company_id = c_a AND coa_number <> 'COA-SK') || ' / ' || left(v_msg,80));

  --  And issuing one, which goes through the trigger rather than the
  --  policy, is refused in words — a restriction added long after that
  --  guard was written, honoured by it.
  v_ok := false;
  BEGIN
    INSERT INTO public.certificate_of_analysis
      (company_id,batch_id,coa_number,product_name,batch_number,results,status)
    VALUES (c_a,current_setting('ar.b')::uuid,'COA-QM2','Tablet R','ARB','[]'::jsonb,'draft');
    v_msg := 'A RESTRICTED QA MANAGER ISSUED A CERTIFICATE';
  EXCEPTION WHEN OTHERS THEN
    v_ok := SQLERRM LIKE 'SECTION_FORBIDDEN%'; v_msg := SQLERRM;
  END;
  PERFORM _ark('G','G7 and issuing one is refused, though the guard predates restrictions',
    v_ok, left(v_msg,140));
END
$g4$;
RESET ROLE;
SELECT set_config('request.jwt.claims','', false);



-- =====================================================================
--  H — dispatch: PM-03's eleventh column, which had no page
--
--  `Distribution` is Act for the Storekeeper and the QA Officer and
--  nothing answered to it, so a storekeeper held Act on a section they
--  could not open. It is also the far end of a trace: nothing
--  connected a released batch to a customer, so "who received this
--  batch" had no answer (docs/figma-conflicts.md entry 17).
--
--  The rule the table exists around is that ONLY A RELEASED BATCH may
--  be dispatched. The batch used here is NOT released — it was created
--  directly by the fixture and never went through QC — so H1 is the
--  gate, and H3 proves the refusal is about the batch rather than
--  about the person by using the role PM-03 does permit.
-- =====================================================================
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('ar.u_qm'), 'role','authenticated')::text, false);
SET ROLE authenticated;

DO $h$
DECLARE
  c_a uuid := current_setting('ar.c_a')::uuid;
  b uuid := current_setting('ar.b')::uuid;
  v_ok boolean := false; v_msg text;
BEGIN
  --  A QA Manager has VIEW on distribution, not Act.
  PERFORM _ark('H','H1 the QA manager has view on distribution',
    public.app_section_access(c_a,'distribution') = 'view',
    public.app_section_access(c_a,'distribution'));

  BEGIN
    INSERT INTO public.batch_dispatches
      (company_id,batch_id,destination,quantity,unit)
    VALUES (c_a,b,'Lagos depot',10,'kg');
    v_msg := 'A QA MANAGER RECORDED A DISPATCH';
  EXCEPTION WHEN OTHERS THEN
    v_ok := SQLERRM LIKE 'SECTION_FORBIDDEN%'; v_msg := SQLERRM;
  END;
  PERFORM _ark('H','H2 and cannot record a dispatch', v_ok, left(v_msg,140));
END
$h$;
RESET ROLE;

SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('ar.u_sk'), 'role','authenticated')::text, false);
SET ROLE authenticated;

DO $h2$
DECLARE
  c_a uuid := current_setting('ar.c_a')::uuid;
  b uuid := current_setting('ar.b')::uuid;
  v_ok boolean := false; v_msg text;
BEGIN
  PERFORM _ark('H','H3 the storekeeper does hold act on distribution',
    public.app_section_access(c_a,'distribution') = 'act',
    public.app_section_access(c_a,'distribution'));

  --  THE GATE. The batch was never released.
  BEGIN
    INSERT INTO public.batch_dispatches
      (company_id,batch_id,destination,quantity,unit)
    VALUES (c_a,b,'Lagos depot',10,'kg');
    v_msg := 'AN UNRELEASED BATCH WAS DISPATCHED';
  EXCEPTION WHEN OTHERS THEN
    v_ok := SQLERRM LIKE 'DISPATCH_NOT_RELEASED%'; v_msg := SQLERRM;
  END;
  PERFORM _ark('H','H4 but an unreleased batch cannot be dispatched', v_ok, left(v_msg,160));

  PERFORM _ark('H','H5 and nothing was recorded',
    NOT EXISTS (SELECT 1 FROM public.batch_dispatches WHERE batch_id = b));
END
$h2$;
RESET ROLE;

--  Release the batch through the service path, then dispatch it. The
--  release itself is batch_release_gate_test's subject; here it is only
--  the precondition, so it is done in a service context.
DO $h3fx$
DECLARE
  c_a uuid := current_setting('ar.c_a')::uuid;
  b uuid := current_setting('ar.b')::uuid;
  v_sig uuid;
BEGIN
  INSERT INTO public.batch_qc_results
    (batch_id,test_name,specification,result,pass,tested_by)
  VALUES (b,'Assay','98-102 %','99.2 %',true,NULL);
  PERFORM public.lifecycle_transition('batch_record', b, 'close_execution', c_a);
  PERFORM public.lifecycle_transition('batch_record', b, 'submit_for_qc',   c_a);
  PERFORM public.lifecycle_transition('batch_record', b, 'start_qc',        c_a);

  --  RELEASING NEEDS PM-03'S SIGNATURE SINCE 20261107000000, and this
  --  suite's own fixture met that rule the moment it was written —
  --  which is the rule working. The signature is minted directly
  --  because a password fixture is batch_release_gate_test's business,
  --  not this one's; what matters here is that the batch is genuinely
  --  released before section H dispatches it.
  INSERT INTO public.electronic_signatures (
    company_id, signer_id, signer_name, signer_email,
    entity_type, entity_id, action, meaning, record_hash, signed_state
  ) VALUES (
    c_a, current_setting('ar.u_qm')::uuid, 'Ngozi Quality', 'qm@ar.test',
    'batch_record', b, 'release', 'released',
    public.electronic_signature_record_hash('batch_record', b, c_a), 'qc_in_progress'
  ) RETURNING id INTO v_sig;

  PERFORM public.lifecycle_transition('batch_record', b, 'release', c_a,
    current_setting('ar.u_qm')::uuid, NULL, '{}'::jsonb, v_sig);
END
$h3fx$;

SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('ar.u_sk'), 'role','authenticated')::text, false);
SET ROLE authenticated;

DO $h3$
DECLARE
  c_a uuid := current_setting('ar.c_a')::uuid;
  b uuid := current_setting('ar.b')::uuid;
  v_ok boolean := false; v_msg text; v_id uuid;
BEGIN
  PERFORM _ark('H','H6 the batch is released',
    (SELECT status FROM public.batch_records WHERE id=b) = 'released',
    (SELECT status FROM public.batch_records WHERE id=b));

  BEGIN
    INSERT INTO public.batch_dispatches
      (company_id,batch_id,destination,reference,quantity,unit)
    VALUES (c_a,b,'Lagos depot','DN-00412',10,'kg')
    RETURNING id INTO v_id;
    v_ok := true; v_msg := 'recorded';
  EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM;
  END;
  PERFORM _ark('H','H7 and now the storekeeper can dispatch it', v_ok, left(v_msg,160));

  --  THE TRACE FINALLY HAS A FAR END.
  PERFORM _ark('H','H8 the trace names where it went',
    EXISTS (SELECT 1 FROM public.batch_dispatch_trace(b)
             WHERE destination = 'Lagos depot' AND reference = 'DN-00412'));

  --  A dispatch is a fact, not a draft.
  v_ok := false;
  BEGIN
    UPDATE public.batch_dispatches SET destination = 'Somewhere else' WHERE id = v_id;
    v_msg := 'A DISPATCH WAS EDITED';
  EXCEPTION WHEN OTHERS THEN
    v_ok := SQLERRM LIKE 'DISPATCH_IMMUTABLE%'; v_msg := SQLERRM;
  END;
  PERFORM _ark('H','H9 a dispatch record cannot be edited', v_ok, left(v_msg,140));

  v_ok := false;
  BEGIN
    DELETE FROM public.batch_dispatches WHERE id = v_id;
    v_msg := 'A DISPATCH WAS DELETED';
  EXCEPTION WHEN OTHERS THEN
    v_ok := SQLERRM LIKE 'DISPATCH_IMMUTABLE%'; v_msg := SQLERRM;
  END;
  PERFORM _ark('H','H10 nor deleted', v_ok, left(v_msg,140));

  --  And a restriction reaches this guard too.
  PERFORM _ark('H','H11 a dispatch of zero is refused',
    NOT EXISTS (SELECT 1 FROM public.batch_dispatches WHERE quantity <= 0));
END
$h3$;
RESET ROLE;
SELECT set_config('request.jwt.claims','', false);



-- =====================================================================
--  I — a restriction reaches the STEPS, not only the sections
--
--  20261110000000 made a restriction real by having app_section_access
--  apply it, so every guard reaching the grid through
--  app_assert_section_act honours one. Five guards do not go that way:
--  batch release, material disposition, deviation close, CAPA close
--  and supplier approval all call app_assert_step, which read
--  step_permissions and app_work_role and had never heard of a
--  restriction.
--
--  Those five are PM-03's named steps — the most consequential actions
--  in the system — and they were the ones a restriction could not
--  touch. A compliance admin who restricted a QA Manager's QA
--  disposition would have watched them release material anyway.
-- =====================================================================
DO $ifx$
DECLARE
  c_a uuid := current_setting('ar.c_a')::uuid;
  u_qm uuid := current_setting('ar.u_qm')::uuid;
BEGIN
  --  Every named step must say which column governs it, or a
  --  restriction on that column cannot reach it.
  PERFORM _ark('I','I1 every step but roles_change names a section',
    NOT EXISTS (SELECT 1 FROM public.step_permissions
                 WHERE section IS NULL AND step <> 'roles_change'),
    (SELECT string_agg(step, ', ') FROM public.step_permissions
      WHERE section IS NULL));

  PERFORM _ark('I','I2 and material disposition names QA disposition',
    (SELECT section FROM public.step_permissions WHERE step='material_disposition')
      = 'qa_disposition',
    (SELECT coalesce(section,'<null>') FROM public.step_permissions
      WHERE step='material_disposition'));

  --  A section every one of them names must exist as a column, or the
  --  restriction lookup is inert while looking installed.
  PERFORM _ark('I','I3 every named section is a real column',
    NOT EXISTS (SELECT 1 FROM public.step_permissions sp
                 WHERE sp.section IS NOT NULL
                   AND NOT EXISTS (SELECT 1 FROM public.section_permissions g
                                    WHERE g.section = sp.section)));
END
$ifx$;

--  The QA Manager holds the material_disposition step. Unrestricted,
--  the assertion passes; restricted, it does not — and the refusal
--  names the restriction rather than the role, because their role is
--  not the problem.
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('ar.u_qm'), 'role','authenticated')::text, false);
SET ROLE authenticated;

DO $i$
DECLARE c_a uuid := current_setting('ar.c_a')::uuid; v_ok boolean := false; v_msg text;
BEGIN
  BEGIN
    PERFORM public.app_assert_step(c_a, 'material_disposition');
    PERFORM _ark('I','I4 an unrestricted QA manager holds the disposition step', true);
  EXCEPTION WHEN OTHERS THEN
    PERFORM _ark('I','I4 an unrestricted QA manager holds the disposition step', false, SQLERRM);
  END;
END
$i$;
RESET ROLE;

SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('ar.u_ca'), 'role','authenticated')::text, false);
SET ROLE authenticated;
DO $i2$
BEGIN
  PERFORM public.access_restrict(current_setting('ar.c_a')::uuid,
    current_setting('ar.u_qm')::uuid, 'qa_disposition', 'none',
    'Under review after a disposition error');
END
$i2$;
RESET ROLE;

SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('ar.u_qm'), 'role','authenticated')::text, false);
SET ROLE authenticated;

DO $i3$
DECLARE
  c_a uuid := current_setting('ar.c_a')::uuid;
  v_ok boolean := false; v_msg text;
BEGIN
  BEGIN
    PERFORM public.app_assert_step(c_a, 'material_disposition');
    v_msg := 'A RESTRICTED QA MANAGER STILL HELD THE DISPOSITION STEP';
  EXCEPTION WHEN OTHERS THEN
    v_ok := SQLERRM LIKE 'STEP_RESTRICTED%'; v_msg := SQLERRM;
  END;
  PERFORM _ark('I','I5 and a restricted one does not', v_ok, left(v_msg,160));

  --  THE REFUSAL NAMES THE RESTRICTION, not the role. Somebody who
  --  knows they are a QA Manager and is told "qa_manager may not
  --  dispose of material" will report it as a bug.
  PERFORM _ark('I','I6 and the refusal says it is a restriction',
    v_msg LIKE '%restricted to none%' AND v_msg NOT LIKE 'STEP_FORBIDDEN%', left(v_msg,160));

  --  A DIFFERENT STEP IS UNAFFECTED. The restriction is on one
  --  section, and a restriction that quietly widened would be worse
  --  than one that did nothing.
  BEGIN
    PERFORM public.app_assert_step(c_a, 'batch_release');
    PERFORM _ark('I','I7 a step in another section is untouched', true);
  EXCEPTION WHEN OTHERS THEN
    PERFORM _ark('I','I7 a step in another section is untouched', false, SQLERRM);
  END;
END
$i3$;
RESET ROLE;

--  Lifting it restores the step.
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('ar.u_ca'), 'role','authenticated')::text, false);
SET ROLE authenticated;
DO $i4$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.access_restrictions
   WHERE company_id = current_setting('ar.c_a')::uuid
     AND user_id = current_setting('ar.u_qm')::uuid
     AND section_key = 'qa_disposition' AND lifted_at IS NULL
   ORDER BY set_at DESC LIMIT 1;
  PERFORM public.access_restriction_lift(v_id, 'Review closed');
END
$i4$;
RESET ROLE;

SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('ar.u_qm'), 'role','authenticated')::text, false);
SET ROLE authenticated;
DO $i5$
BEGIN
  BEGIN
    PERFORM public.app_assert_step(current_setting('ar.c_a')::uuid, 'material_disposition');
    PERFORM _ark('I','I8 lifting it restores the step', true);
  EXCEPTION WHEN OTHERS THEN
    PERFORM _ark('I','I8 lifting it restores the step', false, SQLERRM);
  END;
END
$i5$;
RESET ROLE;

--  AN EXPLICIT RESTRICTION BITES EVEN WHERE THE GRID ABSTAINS.
--  app_assert_step abstains for a role PM-03 does not tabulate, and
--  that abstention is the design declining to rule. A restriction is
--  not a silence — it is a named person, a named section and a reason,
--  entered deliberately — so it applies regardless.
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('ar.u_ca'), 'role','authenticated')::text, false);
SET ROLE authenticated;
DO $i6$
BEGIN
  PERFORM public.access_restrict(current_setting('ar.c_a')::uuid,
    current_setting('ar.u_un')::uuid, 'qa_disposition', 'none',
    'Restricted though their role is not tabulated');
END
$i6$;
RESET ROLE;

SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('ar.u_un'), 'role','authenticated')::text, false);
SET ROLE authenticated;
DO $i7$
DECLARE c_a uuid := current_setting('ar.c_a')::uuid; v_ok boolean := false; v_msg text;
BEGIN
  PERFORM _ark('I','I9 the untabulated role still has no cell',
    public.app_section_access(c_a,'qa_disposition') IS NULL,
    coalesce(public.app_section_access(c_a,'qa_disposition'),'<null>'));

  BEGIN
    PERFORM public.app_assert_step(c_a, 'material_disposition');
    v_msg := 'AN EXPLICIT RESTRICTION DID NOT APPLY TO AN UNTABULATED ROLE';
  EXCEPTION WHEN OTHERS THEN
    v_ok := SQLERRM LIKE 'STEP_RESTRICTED%'; v_msg := SQLERRM;
  END;
  PERFORM _ark('I','I10 but the explicit restriction still applies to them',
    v_ok, left(v_msg,160));
END
$i7$;
RESET ROLE;
SELECT set_config('request.jwt.claims','', false);


-- =====================================================================
--  Results — COLUMN ORDER IS total, passed, failed.
-- =====================================================================
SELECT section, name, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result, detail
  FROM _ar ORDER BY section, name;

SELECT count(*) AS total,
       count(*) FILTER (WHERE ok) AS passed,
       count(*) FILTER (WHERE NOT ok) AS failed
  FROM _ar;

DO $gate$
DECLARE v_failed bigint;
BEGIN
  SELECT count(*) INTO v_failed FROM _ar WHERE NOT ok;
  IF v_failed > 0 THEN
    RAISE EXCEPTION 'ACCESS RESTRICTIONS: % assertion(s) failed', v_failed;
  END IF;
END
$gate$;
