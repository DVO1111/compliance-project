-- =====================================================================
--  SIGNED ROLE ASSIGNMENTS, BOOTSTRAP, AND DUTIES ACROSS BOTH CHAINS
--
--  Covers 20261121000000 (an electronic signature for granting and
--  revoking a GMP-critical role, and the initial-setup exception) and
--  20261122000000 (the material chain's separation of duties).
--
--  Sections:
--    A. A GMP-critical role cannot be granted without a signature
--    B. The signature is bound to the exact action and target
--    C. Revocation needs its own, and history survives it
--    D. Initial setup for a workspace of one
--    E. One person, two roles — QC Analyst and QA Manager
--    F. Duties across every route: RPC, direct write, retry
--    G. The material chain
--    H. Revocation takes effect immediately
--    I. Assignment security: service paths and privileged writes
-- =====================================================================
\set ON_ERROR_STOP on
SET client_min_messages = warning;

RESET ROLE;
SELECT set_config('request.jwt.claims','', false);

CREATE TEMP TABLE _rs(section text, name text, ok boolean, detail text);
GRANT ALL ON _rs TO anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION _rsk(p_section text, p_name text, p_ok boolean, p_detail text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO _rs VALUES (p_section,p_name,coalesce(p_ok,false),p_detail); END $$;

CREATE OR REPLACE FUNCTION _rsfail(p_sql text)
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RETURN '(no refusal)';
EXCEPTION WHEN OTHERS THEN
  RETURN split_part(SQLERRM, ':', 1);
END $$;
GRANT EXECUTE ON FUNCTION _rsfail(text) TO anon, authenticated, service_role;

--  Mints a signature as the CURRENT caller. Returns the id, or raises
--  with the code so a failure says which check refused it.
CREATE OR REPLACE FUNCTION _rssign(
  p_company uuid, p_user uuid, p_role text, p_action text, p_assignment uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
  r := public.operational_role_sign(
         p_company, p_user, p_role, p_action, 'CorrectHorse1!', p_assignment, 'suite');
  IF (r->>'ok')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'SIGN_FAILED: %', coalesce(r->>'code','?');
  END IF;
  RETURN (r->>'signature_id')::uuid;
END $$;
GRANT EXECUTE ON FUNCTION _rssign(uuid,uuid,text,text,uuid) TO anon, authenticated, service_role;


DO $fx$
DECLARE
  c     uuid := gen_random_uuid();   -- the ordinary workspace
  c1    uuid := gen_random_uuid();   -- a workspace of one, for section D
  u_adm uuid := gen_random_uuid();   -- membership admin: may appoint
  u_ca  uuid := gen_random_uuid();   -- compliance_admin
  u_qm  uuid := gen_random_uuid();   -- becomes qa_manager
  u_an  uuid := gen_random_uuid();   -- becomes qc_analyst
  u_two uuid := gen_random_uuid();   -- becomes BOTH, for section E
  u_sk  uuid := gen_random_uuid();   -- storekeeper
  u_solo uuid := gen_random_uuid();  -- the only member of c1
  tag   text := substr(replace(gen_random_uuid()::text,'-',''),1,8);
BEGIN
  PERFORM set_config('rs.c',     c::text,     false);
  PERFORM set_config('rs.c1',    c1::text,    false);
  PERFORM set_config('rs.u_adm', u_adm::text, false);
  PERFORM set_config('rs.u_ca',  u_ca::text,  false);
  PERFORM set_config('rs.u_qm',  u_qm::text,  false);
  PERFORM set_config('rs.u_an',  u_an::text,  false);
  PERFORM set_config('rs.u_two', u_two::text, false);
  PERFORM set_config('rs.u_sk',  u_sk::text,  false);
  PERFORM set_config('rs.u_solo',u_solo::text,false);

  INSERT INTO public.companies(id,name) VALUES
    (c,'Signed roles '||tag), (c1,'Workspace of one '||tag);

  INSERT INTO auth.users(id,email) VALUES
    (u_adm,'adm-'||tag||'@rs.test'), (u_ca,'ca-'||tag||'@rs.test'),
    (u_qm,'qm-'||tag||'@rs.test'),   (u_an,'an-'||tag||'@rs.test'),
    (u_two,'two-'||tag||'@rs.test'), (u_sk,'sk-'||tag||'@rs.test'),
    (u_solo,'solo-'||tag||'@rs.test');

  --  Every one of them can sign, because the signature is a password
  --  and the suite has to be able to produce a real one. There is no
  --  test-only signing path, deliberately.
  UPDATE auth.users
     SET encrypted_password = extensions.crypt('CorrectHorse1!', extensions.gen_salt('bf'))
   WHERE id IN (u_adm,u_ca,u_qm,u_an,u_two,u_sk,u_solo);

  INSERT INTO public.profiles(id,email,full_name,company_id,role) VALUES
    (u_adm,'adm-'||tag||'@rs.test','Bola Admin',    c, 'admin'),
    (u_ca, 'ca-'||tag||'@rs.test', 'Gbenga Compliance',c,'admin'),
    (u_qm, 'qm-'||tag||'@rs.test', 'Ngozi Manager', c, 'compliance_officer'),
    (u_an, 'an-'||tag||'@rs.test', 'Emeka Analyst', c, 'compliance_officer'),
    (u_two,'two-'||tag||'@rs.test','Funke Two-hats',c, 'compliance_officer'),
    (u_sk, 'sk-'||tag||'@rs.test', 'Tunde Stores',  c, 'compliance_officer'),
    (u_solo,'solo-'||tag||'@rs.test','Amaka Alone', c1,'admin');

  INSERT INTO public.company_members(company_id,user_id,role,status) VALUES
    (c,u_adm,'admin','active'),  (c,u_ca,'viewer','active'),
    (c,u_qm,'viewer','active'),  (c,u_an,'viewer','active'),
    (c,u_two,'viewer','active'), (c,u_sk,'viewer','active'),
    (c1,u_solo,'owner','active');

  --  Seeded in service context, which is how a deployment would do it.
  --  Section I checks that those grants are marked as unsigned.
  PERFORM public.operational_role_assign(c,u_ca,'compliance_admin','fixture');
  PERFORM public.operational_role_assign(c,u_sk,'storekeeper','fixture');
END
$fx$;


-- =====================================================================
--  A. A GMP-critical role cannot be granted without a signature
-- =====================================================================
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('rs.u_adm'), 'role','authenticated')::text, false);
SET ROLE authenticated;

DO $a$
DECLARE v_sig uuid; v_id uuid;
BEGIN
  --  (1) Which roles need one, and that the list is PM-03's.
  PERFORM _rsk('A','A1 qa_manager needs a signature',
    public.operational_role_needs_signature('qa_manager'));
  PERFORM _rsk('A','A2 qa_officer and compliance_admin too',
    public.operational_role_needs_signature('qa_officer')
    AND public.operational_role_needs_signature('compliance_admin'));
  PERFORM _rsk('A','A3 storekeeper does not',
    NOT public.operational_role_needs_signature('storekeeper'));
  PERFORM _rsk('A','A4 and every role on the list holds a protected step',
    NOT EXISTS (SELECT 1 FROM public.gmp_critical_roles g
                 WHERE NOT EXISTS (SELECT 1 FROM public.step_permissions sp
                                    WHERE g.role = ANY (sp.roles))),
    (SELECT string_agg(role,', ') FROM public.gmp_critical_roles));

  --  (2) The refusal, by RPC and by direct INSERT alike.
  PERFORM _rsk('A','A5 an unsigned grant is refused by RPC',
    _rsfail(format('SELECT public.operational_role_assign(%L,%L,%L,%L)',
      current_setting('rs.c'), current_setting('rs.u_qm'), 'qa_manager', 'try'))
      = 'OPERATIONAL_ROLE_SIGNATURE_REQUIRED',
    _rsfail(format('SELECT public.operational_role_assign(%L,%L,%L,%L)',
      current_setting('rs.c'), current_setting('rs.u_qm'), 'qa_manager', 'try')));

  PERFORM _rsk('A','A6 and by a direct INSERT',
    _rsfail(format('INSERT INTO public.operational_role_assignments'
      ' (company_id,user_id,role,reason) VALUES (%L,%L,%L,%L)',
      current_setting('rs.c'), current_setting('rs.u_qm'), 'qa_manager', 'try'))
      = 'OPERATIONAL_ROLE_SIGNATURE_REQUIRED');

  --  (3) A role that does not need one is still granted without one.
  --  A control that refuses everything is an outage.
  v_id := public.operational_role_assign(
            current_setting('rs.c')::uuid, current_setting('rs.u_an')::uuid,
            'qc_analyst', 'analyst, no signature needed');
  PERFORM _rsk('A','A7 an ordinary role is granted without one',
    public.app_has_work_role(current_setting('rs.c')::uuid,'qc_analyst',
      current_setting('rs.u_an')::uuid));

  --  (4) And a signature offered for it is discarded, so the column
  --  means exactly one thing.
  PERFORM _rsk('A','A8 no signature is stored for a role that needs none',
    (SELECT grant_signature_id IS NULL FROM public.operational_role_assignments
      WHERE id = v_id));

  --  (5) The signed path works.
  v_sig := _rssign(current_setting('rs.c')::uuid, current_setting('rs.u_qm')::uuid,
                   'qa_manager','grant');
  v_id := public.operational_role_assign(
            current_setting('rs.c')::uuid, current_setting('rs.u_qm')::uuid,
            'qa_manager', 'appointed QA Manager', v_sig);
  PERFORM set_config('rs.qm_assignment', v_id::text, false);

  PERFORM _rsk('A','A9 a signed grant succeeds',
    public.app_has_work_role(current_setting('rs.c')::uuid,'qa_manager',
      current_setting('rs.u_qm')::uuid));
  PERFORM _rsk('A','A10 and the signature is recorded against it',
    (SELECT grant_signature_id FROM public.operational_role_assignments
      WHERE id = v_id) = v_sig);

  --  (6) ACTOR, REASON, TIMESTAMP — preserved, and server-set.
  PERFORM _rsk('A','A11 the grantor, reason and time are on the row',
    (SELECT assigned_by = current_setting('rs.u_adm')::uuid
            AND reason = 'appointed QA Manager'
            AND assigned_at IS NOT NULL
            AND provenance = 'rpc'
       FROM public.operational_role_assignments WHERE id = v_id));

  --  (7) The signature itself carries the same facts, independently.
  PERFORM _rsk('A','A12 the signature names signer, action and role',
    (SELECT signer_id = current_setting('rs.u_adm')::uuid
            AND action = 'grant' AND signed_state = 'qa_manager'
            AND entity_type = 'operational_role_grant'
            AND entity_id = current_setting('rs.u_qm')::uuid
       FROM public.electronic_signatures WHERE id = v_sig));
END $a$;


-- =====================================================================
--  B. Bound to the exact action and target
--
--  The property that makes it a signature rather than a token: it
--  authorises ONE appointment and cannot be replayed onto another.
-- =====================================================================
DO $b$
DECLARE v_sig uuid;
BEGIN
  --  (1) A signature for appointing one person does not appoint another.
  v_sig := _rssign(current_setting('rs.c')::uuid, current_setting('rs.u_qm')::uuid,
                   'qa_officer','grant');
  PERFORM _rsk('B','B1 a signature for one person cannot appoint another',
    _rsfail(format('SELECT public.operational_role_assign(%L,%L,%L,%L,%L)',
      current_setting('rs.c'), current_setting('rs.u_two'), 'qa_officer', 'try', v_sig))
      = 'OPERATIONAL_ROLE_SIGNATURE_MISMATCH',
    _rsfail(format('SELECT public.operational_role_assign(%L,%L,%L,%L,%L)',
      current_setting('rs.c'), current_setting('rs.u_two'), 'qa_officer', 'try', v_sig)));

  --  (2) Nor a different role for the same person.
  PERFORM _rsk('B','B2 nor grant a different role',
    _rsfail(format('SELECT public.operational_role_assign(%L,%L,%L,%L,%L)',
      current_setting('rs.c'), current_setting('rs.u_qm'), 'compliance_admin', 'try', v_sig))
      = 'OPERATIONAL_ROLE_SIGNATURE_MISMATCH');

  --  (3) A revocation signature does not authorise a grant.
  PERFORM _rsk('B','B3 the action is part of the binding',
    public.operational_role_action_hash(
      current_setting('rs.c')::uuid, current_setting('rs.u_qm')::uuid, 'qa_officer','grant')
    IS DISTINCT FROM
    public.operational_role_action_hash(
      current_setting('rs.c')::uuid, current_setting('rs.u_qm')::uuid, 'qa_officer','revoke'));

  --  (4) And the company.
  PERFORM _rsk('B','B4 so is the company',
    public.operational_role_action_hash(
      current_setting('rs.c')::uuid, current_setting('rs.u_qm')::uuid, 'qa_officer','grant')
    IS DISTINCT FROM
    public.operational_role_action_hash(
      current_setting('rs.c1')::uuid, current_setting('rs.u_qm')::uuid, 'qa_officer','grant'));

  --  (5) It works for the appointment it WAS taken over.
  PERFORM public.operational_role_assign(
    current_setting('rs.c')::uuid, current_setting('rs.u_qm')::uuid,
    'qa_officer', 'also QA Officer', v_sig);
  PERFORM _rsk('B','B5 and authorises the appointment it was taken over',
    public.app_has_work_role(current_setting('rs.c')::uuid,'qa_officer',
      current_setting('rs.u_qm')::uuid));

  --  (6) SINGLE USE. The same signature cannot appoint twice, even to
  --  the same person and role after a revocation.
  PERFORM _rsk('B','B6 and cannot be spent twice',
    _rsfail(format('INSERT INTO public.operational_role_assignments'
      ' (company_id,user_id,role,reason,grant_signature_id) VALUES (%L,%L,%L,%L,%L)',
      current_setting('rs.c'), current_setting('rs.u_qm'), 'qa_officer', 'again', v_sig))
      <> '(no refusal)',
    _rsfail(format('INSERT INTO public.operational_role_assignments'
      ' (company_id,user_id,role,reason,grant_signature_id) VALUES (%L,%L,%L,%L,%L)',
      current_setting('rs.c'), current_setting('rs.u_qm'), 'qa_officer', 'again', v_sig)));
END $b$;

--  (7) BOUND TO THE SIGNER. A valid signature somebody else minted
--  does not authorise this caller.
RESET ROLE;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('rs.u_ca'), 'role','authenticated')::text, false);
SET ROLE authenticated;

DO $b2$
DECLARE v_sig uuid;
BEGIN
  --  Minted by the compliance admin …
  v_sig := _rssign(current_setting('rs.c')::uuid, current_setting('rs.u_two')::uuid,
                   'qa_manager','grant');
  PERFORM set_config('rs.ca_sig', v_sig::text, false);
  PERFORM _rsk('B','B7 a compliance admin may mint one', v_sig IS NOT NULL);
END $b2$;

RESET ROLE;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('rs.u_adm'), 'role','authenticated')::text, false);
SET ROLE authenticated;

DO $b3$
BEGIN
  --  … and used by the admin, who did not sign it.
  PERFORM _rsk('B','B8 but another caller cannot use it',
    _rsfail(format('SELECT public.operational_role_assign(%L,%L,%L,%L,%L)',
      current_setting('rs.c'), current_setting('rs.u_two'), 'qa_manager', 'try',
      current_setting('rs.ca_sig')))
      = 'OPERATIONAL_ROLE_SIGNATURE_MISMATCH',
    _rsfail(format('SELECT public.operational_role_assign(%L,%L,%L,%L,%L)',
      current_setting('rs.c'), current_setting('rs.u_two'), 'qa_manager', 'try',
      current_setting('rs.ca_sig'))));
END $b3$;


-- =====================================================================
--  C. Revocation needs its own signature, and history survives it
-- =====================================================================
DO $c$
DECLARE v_id uuid; v_sig uuid; v_assigned timestamptz; v_by uuid;
BEGIN
  SELECT id INTO v_id FROM public.operational_role_assignments
   WHERE company_id = current_setting('rs.c')::uuid
     AND user_id = current_setting('rs.u_qm')::uuid
     AND role = 'qa_officer' AND revoked_at IS NULL;

  SELECT assigned_at, assigned_by INTO v_assigned, v_by
    FROM public.operational_role_assignments WHERE id = v_id;

  PERFORM _rsk('C','C1 an unsigned revocation is refused',
    _rsfail(format('SELECT public.operational_role_revoke(%L,%L)', v_id, 'no signature'))
      = 'OPERATIONAL_ROLE_SIGNATURE_REQUIRED',
    _rsfail(format('SELECT public.operational_role_revoke(%L,%L)', v_id, 'no signature')));

  --  A GRANT signature does not revoke.
  v_sig := _rssign(current_setting('rs.c')::uuid, current_setting('rs.u_qm')::uuid,
                   'qa_officer','grant');
  PERFORM _rsk('C','C2 a grant signature does not authorise a revocation',
    _rsfail(format('SELECT public.operational_role_revoke(%L,%L,%L)', v_id, 'wrong kind', v_sig))
      = 'OPERATIONAL_ROLE_SIGNATURE_MISMATCH');

  --  A revocation signature for a DIFFERENT assignment does not either.
  v_sig := _rssign(current_setting('rs.c')::uuid, current_setting('rs.u_qm')::uuid,
                   'qa_officer','revoke', gen_random_uuid());
  PERFORM _rsk('C','C3 nor one taken over another assignment',
    _rsfail(format('SELECT public.operational_role_revoke(%L,%L,%L)', v_id, 'wrong row', v_sig))
      = 'OPERATIONAL_ROLE_SIGNATURE_MISMATCH');

  --  The right one works.
  v_sig := _rssign(current_setting('rs.c')::uuid, current_setting('rs.u_qm')::uuid,
                   'qa_officer','revoke', v_id);
  PERFORM public.operational_role_revoke(v_id, 'reassigned to another site', v_sig);

  PERFORM _rsk('C','C4 the right one revokes',
    NOT public.app_has_work_role(current_setting('rs.c')::uuid,'qa_officer',
      current_setting('rs.u_qm')::uuid));

  --  ── HISTORY PRESERVED ──
  PERFORM _rsk('C','C5 the grant''s actor and time are untouched',
    (SELECT assigned_at = v_assigned AND assigned_by = v_by
       FROM public.operational_role_assignments WHERE id = v_id));
  PERFORM _rsk('C','C6 and the revocation records who, why and with what',
    (SELECT revoked_by = current_setting('rs.u_adm')::uuid
            AND revoke_reason = 'reassigned to another site'
            AND revoke_signature_id = v_sig
            AND revoked_at IS NOT NULL
       FROM public.operational_role_assignments WHERE id = v_id));
  PERFORM _rsk('C','C7 the row still exists',
    EXISTS (SELECT 1 FROM public.operational_role_assignments WHERE id = v_id));
END $c$;


-- =====================================================================
--  D. Initial setup for a workspace of one
--
--  The documented exception. It is narrow, signed, declared, marked
--  and reported — and it does NOT independently verify anything, which
--  is the limitation docs/operational-role-model.md records.
-- =====================================================================
DO $d1$
BEGIN
  --  In the ordinary workspace, where other people could do it
  --  properly, bootstrap is unavailable. This is what stops it being a
  --  general self-assignment exception.
  PERFORM _rsk('D','D1 bootstrap is refused where somebody else could grant it',
    _rsfail(format('SELECT public.operational_role_bootstrap(%L,%L,%L,%L)',
      current_setting('rs.c'), 'qa_manager',
      'I am the registered QA person named on the NAFDAC submission.',
      gen_random_uuid()))
      = 'OPERATIONAL_ROLE_BOOTSTRAP_UNAVAILABLE',
    _rsfail(format('SELECT public.operational_role_bootstrap(%L,%L,%L,%L)',
      current_setting('rs.c'), 'qa_manager',
      'I am the registered QA person named on the NAFDAC submission.',
      gen_random_uuid())));
END $d1$;

RESET ROLE;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('rs.u_solo'), 'role','authenticated')::text, false);
SET ROLE authenticated;

DO $d2$
DECLARE v_sig uuid; v_id uuid; v_n int;
BEGIN
  --  Ordinary self-assignment is still refused, even here.
  PERFORM _rsk('D','D2 ordinary self-assignment is still refused',
    _rsfail(format('SELECT public.operational_role_assign(%L,%L,%L,%L)',
      current_setting('rs.c1'), current_setting('rs.u_solo'), 'storekeeper', 'try'))
      = 'OPERATIONAL_ROLE_SELF',
    _rsfail(format('SELECT public.operational_role_assign(%L,%L,%L,%L)',
      current_setting('rs.c1'), current_setting('rs.u_solo'), 'storekeeper', 'try')));

  --  A declaration is required, and one word is not one.
  v_sig := _rssign(current_setting('rs.c1')::uuid, current_setting('rs.u_solo')::uuid,
                   'qa_manager','grant');
  PERFORM _rsk('D','D3 a declaration is required',
    _rsfail(format('SELECT public.operational_role_bootstrap(%L,%L,%L,%L)',
      current_setting('rs.c1'), 'qa_manager', 'me', v_sig))
      = 'OPERATIONAL_ROLE_DECLARATION_REQUIRED');

  --  And a signature. Always — even though the role is being granted
  --  to the signer, which is exactly why.
  PERFORM _rsk('D','D4 and a signature',
    _rsfail(format('SELECT public.operational_role_bootstrap(%L,%L,%L,NULL)',
      current_setting('rs.c1'), 'qa_manager',
      'I am the QA person named on this facility''s NAFDAC submission.'))
      = 'OPERATIONAL_ROLE_SIGNATURE_REQUIRED');

  --  With both, it works.
  v_id := public.operational_role_bootstrap(
    current_setting('rs.c1')::uuid, 'qa_manager',
    'I am the QA person named on this facility''s NAFDAC submission, reference NAF/2026/0041.',
    v_sig);
  PERFORM set_config('rs.boot_id', v_id::text, false);

  PERFORM _rsk('D','D5 a sole owner can bootstrap one role',
    public.app_has_work_role(current_setting('rs.c1')::uuid,'qa_manager',
      current_setting('rs.u_solo')::uuid));

  --  ── MARKED, PERMANENTLY ──
  PERFORM _rsk('D','D6 and it is marked as self-declared',
    (SELECT provenance = 'bootstrap_self_declared'
            AND declaration LIKE '%NAF/2026/0041%'
            AND grant_signature_id = v_sig
       FROM public.operational_role_assignments WHERE id = v_id));

  --  ── AND REPORTED ──
  SELECT count(*) INTO v_n
    FROM public.operational_role_unsigned_grants(current_setting('rs.c1')::uuid)
   WHERE assignment_id = v_id AND provenance = 'bootstrap_self_declared';
  PERFORM _rsk('D','D7 and it is reported as not independently verified',
    v_n = 1, v_n::text);

  PERFORM _rsk('D','D8 the finding says so in words',
    (SELECT finding LIKE '%not independently verified%'
       FROM public.operational_role_unsigned_grants(current_setting('rs.c1')::uuid)
      WHERE assignment_id = v_id));

  --  The mark cannot be scrubbed afterwards.
  PERFORM _rsk('D','D9 the mark cannot be edited away',
    _rsfail(format('UPDATE public.operational_role_assignments'
      ' SET provenance = %L WHERE id = %L', 'rpc', v_id))
      = 'OPERATIONAL_ROLE_IMMUTABLE',
    _rsfail(format('UPDATE public.operational_role_assignments'
      ' SET provenance = %L WHERE id = %L', 'rpc', v_id)));
END $d2$;


-- =====================================================================
--  E. One person, two roles — QC Analyst and QA Manager
--
--  The combination the direction names. PM-03 never contemplated it:
--  qc_testing is the Analyst's column alone and batch_release the
--  Manager's alone. Granting both is now legitimate, and the whole
--  separation rests on the per-batch check.
-- =====================================================================
RESET ROLE;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('rs.u_ca'), 'role','authenticated')::text, false);
SET ROLE authenticated;

DO $e$
DECLARE v_sig uuid;
BEGIN
  PERFORM public.operational_role_assign(
    current_setting('rs.c')::uuid, current_setting('rs.u_two')::uuid,
    'qc_analyst', 'small plant: one person covers both');

  v_sig := _rssign(current_setting('rs.c')::uuid, current_setting('rs.u_two')::uuid,
                   'qa_manager','grant');
  PERFORM public.operational_role_assign(
    current_setting('rs.c')::uuid, current_setting('rs.u_two')::uuid,
    'qa_manager', 'small plant: one person covers both', v_sig);

  PERFORM _rsk('E','E1 one person holds QC Analyst and QA Manager',
    public.app_work_roles(current_setting('rs.c')::uuid, current_setting('rs.u_two')::uuid)
      = ARRAY['qa_manager','qc_analyst'],
    array_to_string(public.app_work_roles(
      current_setting('rs.c')::uuid, current_setting('rs.u_two')::uuid), ', '));

  --  The union gives them both columns, which is the point of allowing
  --  it: a plant with one qualified person can still run.
  PERFORM _rsk('E','E2 and holds Act on both columns',
    public.app_section_access(current_setting('rs.c')::uuid,'qc_testing',
      current_setting('rs.u_two')::uuid) = 'act'
    AND public.app_section_access(current_setting('rs.c')::uuid,'batch_release',
      current_setting('rs.u_two')::uuid) = 'act');

  --  And the step, which is the role-level check.
  PERFORM _rsk('E','E3 and the batch_release step is theirs',
    'qa_manager' = ANY (public.app_work_roles(
      current_setting('rs.c')::uuid, current_setting('rs.u_two')::uuid)));
END $e$;


-- =====================================================================
--  F. Duties across every route
-- =====================================================================
RESET ROLE;

DO $f$
DECLARE
  c uuid := current_setting('rs.c')::uuid;
  u uuid := current_setting('rs.u_two')::uuid;
  v_prod uuid := gen_random_uuid();
  v_b1 uuid := gen_random_uuid();   -- they tested this one
  v_b2 uuid := gen_random_uuid();   -- and not this one
  tag text := substr(replace(gen_random_uuid()::text,'-',''),1,8);
BEGIN
  INSERT INTO public.products(id,company_id,product_code,trade_name,generic_name,category,created_by)
  VALUES (v_prod,c,'RS-'||tag,'Tablet R','Paracetamol','drug_pharmaceutical',
          current_setting('rs.u_qm')::uuid);

  INSERT INTO public.batch_records
    (id,company_id,batch_number,product_name,product_id,
     manufacturing_date,expiry_date,batch_size,unit)
  VALUES
    (v_b1,c,'RSB1-'||tag,'Tablet R',v_prod,current_date-10,current_date+355,100,'kg'),
    (v_b2,c,'RSB2-'||tag,'Tablet R',v_prod,current_date-10,current_date+355,100,'kg');

  PERFORM set_config('rs.b1', v_b1::text, false);
  PERFORM set_config('rs.b2', v_b2::text, false);

  INSERT INTO public.batch_qc_results(batch_id,test_name,result,pass,tested_by)
  VALUES (v_b1,'Assay','99.4 %',true,u);

  PERFORM _rsk('F','F1 the duty is recorded against the batch they tested',
    public.batch_actor_duties(v_b1,u) = ARRAY['qc_testing'],
    array_to_string(public.batch_actor_duties(v_b1,u),', '));

  PERFORM _rsk('F','F2 so they may not release THAT batch',
    public.batch_duty_conflict(v_b1,'release',u) LIKE 'BATCH_RELEASE_SELF_TESTED%',
    public.batch_duty_conflict(v_b1,'release',u));

  PERFORM _rsk('F','F3 but may release the one they did not test',
    public.batch_duty_conflict(v_b2,'release',u) IS NULL);

  --  ── RETRIES ── a refusal is not a rate limit. Attempting it again
  --  must refuse again, with the same answer.
  PERFORM _rsk('F','F4 a retry is refused identically',
    public.batch_duty_conflict(v_b1,'release',u)
      = public.batch_duty_conflict(v_b1,'release',u));

  --  ── ROLE CHANGES AFTER WORK HAS BEGUN ──
  --
  --  The conflict is about what they DID, not what they hold, so
  --  neither granting nor revoking a role moves it.
  PERFORM _rsk('F','F5 revoking qc_analyst does not erase the duty',
    public.batch_actor_duties(v_b1,u) @> ARRAY['qc_testing']);
END $f$;

DO $f2$
DECLARE
  c uuid := current_setting('rs.c')::uuid;
  v_b uuid := current_setting('rs.b2')::uuid;
  v_qm uuid := current_setting('rs.u_qm')::uuid;
BEGIN
  --  batch_records.status is derived from the lifecycle engine and
  --  refuses a direct write, which is why this uses the plain actor
  --  columns instead. The end-to-end refusal through the release gate
  --  is batch_release_gate_test.sql section H, which predates this
  --  branch and still passes.
  UPDATE public.batch_records SET execution_closed_by = v_qm WHERE id = v_b;

  PERFORM _rsk('F','F6 whoever closed execution carries that duty',
    public.batch_actor_duties(v_b, v_qm) @> ARRAY['execution'],
    array_to_string(public.batch_actor_duties(v_b, v_qm),', '));

  PERFORM _rsk('F','F7 and may not then release it',
    public.duty_conflict('batch', v_b, 'release', v_qm) LIKE 'BATCH_DUTY_CONFLICT%',
    public.duty_conflict('batch', v_b, 'release', v_qm));

  --  ── THE GUARD IS WIRED, not merely defined ──
  --
  --  The dead-guard hazard in its usual form: a check that exists and
  --  is never called. Both gates are asserted to consult the duty
  --  check, so removing the clause fails the suite rather than quietly
  --  removing a control.
  PERFORM _rsk('F','F8 the release gate consults the duty check',
    (SELECT prosrc ~ 'duty_conflict' FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='fn_batch_records_release_gate'));
  PERFORM _rsk('F','F9 and so does the dispatch gate',
    (SELECT prosrc ~ 'duty_conflict' FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='fn_batch_dispatch_gate'));
  PERFORM _rsk('F','F10 and the material disposition guard',
    (SELECT prosrc ~ 'duty_conflict' FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='fn_material_lots_disposition_role'));
END $f2$;


-- =====================================================================
--  G. The material chain
-- =====================================================================
RESET ROLE;

DO $g$
DECLARE
  c uuid := current_setting('rs.c')::uuid;
  v_mat uuid := gen_random_uuid();
  v_lot uuid := gen_random_uuid();
  v_an  uuid := current_setting('rs.u_an')::uuid;
  v_qm  uuid := current_setting('rs.u_qm')::uuid;
  v_spec uuid; v_par uuid; v_def uuid;
  tag text := substr(replace(gen_random_uuid()::text,'-',''),1,8);
BEGIN
  INSERT INTO public.company_numbering_formats(company_id,scope,pattern,prefix,seq_width)
  VALUES (c,'material_lot','{PREFIX}-{SEQ}','RS',4)
  ON CONFLICT (company_id,scope) DO NOTHING;

  INSERT INTO public.materials
    (id,company_id,code,name,material_type,criticality,unit_of_measure,created_by)
  VALUES (v_mat,c,'RSM-'||tag,'Lactose','excipient','standard','kg',v_qm);

  INSERT INTO public.material_specifications(company_id,material_id,version,status,created_by)
  VALUES (c,v_mat,'1.0','effective',v_qm) RETURNING id INTO v_spec;
  INSERT INTO public.material_specification_parameters
    (specification_id,parameter,unit,limit_type,min_value,max_value,is_critical)
  VALUES (v_spec,'Assay','%','range',95.0,105.0,true) RETURNING id INTO v_par;
  INSERT INTO public.material_test_definitions
    (company_id,specification_parameter_id,code,name,is_required,created_by)
  VALUES (c,v_par,'T-RS','Assay',true,v_qm) RETURNING id INTO v_def;

  INSERT INTO public.material_lots(id,company_id,material_id,quantity_received,created_by,received_by)
  VALUES (v_lot,c,v_mat,100,v_qm,current_setting('rs.u_sk')::uuid);

  PERFORM public.lifecycle_transition('material_lot', v_lot, 'sample', c, v_qm, 'Sampled');
  PERFORM public.material_test_record_result(v_lot,v_def,99.2,NULL,v_an);

  PERFORM set_config('rs.lot', v_lot::text, false);

  PERFORM _rsk('G','G1 the analyst''s duty is seen on the lot',
    public.material_lot_actor_duties(v_lot, v_an) @> ARRAY['qc_testing'],
    array_to_string(public.material_lot_actor_duties(v_lot, v_an),', '));

  PERFORM _rsk('G','G2 the receiver''s duty is seen too',
    public.material_lot_actor_duties(v_lot, current_setting('rs.u_sk')::uuid)
      @> ARRAY['receipt'],
    array_to_string(public.material_lot_actor_duties(
      v_lot, current_setting('rs.u_sk')::uuid),', '));

  --  ENFORCED: tester may not disposition.
  PERFORM _rsk('G','G3 the analyst may not disposition the lot they tested',
    public.duty_conflict('material_lot', v_lot, 'disposition', v_an)
      LIKE 'MATERIAL_DISPOSITION_SELF_TESTED%',
    public.duty_conflict('material_lot', v_lot, 'disposition', v_an));

  --  AND SOMEBODY ELSE MAY. A gate that refuses everybody is an outage.
  PERFORM _rsk('G','G4 but the QA Manager may',
    public.duty_conflict('material_lot', v_lot, 'disposition', v_qm) IS NULL);

  --  ENFORCED SINCE 20261125000000, as a conservative default. It
  --  bites only somebody holding both storekeeper and a QA role,
  --  because a storekeeper has no Act on qa_disposition to begin with.
  PERFORM _rsk('G','G5 the receiver is refused too, as a conservative default',
    public.duty_conflict('material_lot', v_lot, 'disposition',
      current_setting('rs.u_sk')::uuid) LIKE 'MATERIAL_DISPOSITION_SELF_RECEIVED%',
    coalesce(public.duty_conflict('material_lot', v_lot, 'disposition',
      current_setting('rs.u_sk')::uuid), '(no conflict)'));

  --  …and it says so. 20261128000000 moved it from
  --  'conservative_default' to 'mandatory' when the brief confirmed
  --  it: leaving a ruled decision reading as provisional would
  --  misreport the state, which is the one thing the status exists to
  --  prevent.
  PERFORM _rsk('G','G6 and the brief''s confirmation is on the record',
    (SELECT decision_status = 'mandatory' AND enforced
       FROM public.duty_conflicts
      WHERE scope='material_lot' AND duty_a='disposition' AND duty_b='receipt'),
    (SELECT decision_status FROM public.duty_conflicts
      WHERE scope='material_lot' AND duty_a='disposition' AND duty_b='receipt'));

  --  DECISION 2, which PM-03 does not derive. It is enforced on an
  --  explicit approval, and the approval names where it is recorded.
  PERFORM _rsk('G','G6d the CoA pair is enforced on a named approval',
    (SELECT enforced AND authority = 'approved_by_quality'
            AND length(coalesce(approved_reference,'')) >= 40
       FROM public.duty_conflicts
      WHERE scope='material_lot' AND duty_a='coa_verification' AND duty_b='disposition'),
    (SELECT authority FROM public.duty_conflicts
      WHERE scope='material_lot' AND duty_a='coa_verification' AND duty_b='disposition'));

  --  And nothing enforced claims PM-03 as its authority without
  --  actually being derivable from it.
  PERFORM _rsk('G','G6e no pair claims a derivation it does not have',
    NOT EXISTS (SELECT 1 FROM public.duty_conflicts
                 WHERE enforced AND authority = 'derived_from_pm03'
                   AND NOT public.duty_pair_is_derived(section_a, section_b)),
    (SELECT string_agg(format('%s/%s',duty_a,duty_b),', ') FROM public.duty_conflicts
      WHERE enforced AND authority = 'derived_from_pm03'
        AND NOT public.duty_pair_is_derived(section_a, section_b)));

  --  The pairs that are NOT enforced must still refuse nobody. A
  --  recorded proposal is not a rule.
  PERFORM _rsk('G','G6b an unenforced pair refuses nobody',
    public.duty_conflict('material_lot', v_lot, 'qc_testing',
      current_setting('rs.u_sk')::uuid) IS NULL,
    coalesce(public.duty_conflict('material_lot', v_lot, 'qc_testing',
      current_setting('rs.u_sk')::uuid), '(no conflict)'));

  --  And every outstanding decision is findable in one query, which is
  --  what stops a conservative default becoming a permanent one by
  --  being forgotten.
  --  One left after the brief: sampling, which needs the site's
  --  procedure rather than a ruling. The query still has to work —
  --  that is what stops a decision being forgotten.
  PERFORM _rsk('G','G6c the outstanding decisions are still listed in one place',
    (SELECT count(*) FROM public.duty_decisions_outstanding()) >= 1,
    (SELECT string_agg(format('%s %s',scope,pair),'; ')
       FROM public.duty_decisions_outstanding()));

  --  NOT DERIVABLE: PM-03 gives both columns to the same roles, so the
  --  coa pair cannot be enforced without contradicting the matrix.
  PERFORM _rsk('G','G7 the CoA pair is not derivable from PM-03',
    NOT public.duty_pair_is_derived('coa_register','qa_disposition'));

  --  EVERY ENFORCED PAIR HAS AN AUTHORITY: PM-03 derives it, or
  --  somebody approved it by name. The CoA pair is the second kind and
  --  is a deliberate divergence from the matrix, so the assertion
  --  checks the authority rather than the derivation alone.
  PERFORM _rsk('G','G8 and every enforced pair has an authority',
    NOT EXISTS (
      SELECT 1 FROM public.duty_conflicts
       WHERE enforced
         AND NOT (public.duty_pair_is_derived(section_a, section_b)
                  OR (authority = 'approved_by_quality'
                      AND coalesce(approved_reference,'') <> ''))),
    (SELECT string_agg(format('%s %s/%s',scope,section_a,section_b),'; ')
       FROM public.duty_conflicts
      WHERE enforced
        AND NOT (public.duty_pair_is_derived(section_a, section_b)
                 OR (authority = 'approved_by_quality'
                     AND coalesce(approved_reference,'') <> ''))));
END $g$;

--  Through the real guard, as the analyst.
RESET ROLE;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('rs.u_an'), 'role','authenticated')::text, false);
SET ROLE authenticated;

DO $g2$
BEGIN
  PERFORM _rsk('G','G9 the disposition guard refuses them, through the engine',
    _rsfail(format('SELECT public.lifecycle_transition(%L,%L,%L,%L)',
      'material_lot', current_setting('rs.lot'), 'release', current_setting('rs.c')))
      <> '(no refusal)',
    _rsfail(format('SELECT public.lifecycle_transition(%L,%L,%L,%L)',
      'material_lot', current_setting('rs.lot'), 'release', current_setting('rs.c'))));

  --  ── AND THROUGH A DIRECT DATABASE WRITE ──
  --
  --  A release record can be written naming somebody else as the
  --  authoriser, so the claim ON THE ROW is checked rather than only
  --  auth.uid(). Same reasoning as the dispatch gate reading
  --  NEW.dispatched_by. This is the route that bypasses every RPC.
  PERFORM _rsk('G','G10 and a direct release record naming them is refused',
    _rsfail(format('INSERT INTO public.material_lot_release_records'
      ' (company_id,material_lot_id,release_type,released_by,authorised_by)'
      ' VALUES (%L,%L,%L,%L,%L)',
      current_setting('rs.c'), current_setting('rs.lot'), 'full',
      current_setting('rs.u_an'), current_setting('rs.u_an')))
      = 'MATERIAL_DISPOSITION_SELF_TESTED',
    _rsfail(format('INSERT INTO public.material_lot_release_records'
      ' (company_id,material_lot_id,release_type,released_by,authorised_by)'
      ' VALUES (%L,%L,%L,%L,%L)',
      current_setting('rs.c'), current_setting('rs.lot'), 'full',
      current_setting('rs.u_an'), current_setting('rs.u_an'))));
END $g2$;


-- =====================================================================
--  H. Revocation takes effect immediately
-- =====================================================================
RESET ROLE;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('rs.u_ca'), 'role','authenticated')::text, false);
SET ROLE authenticated;

DO $h$
DECLARE v_id uuid; v_sig uuid; v_before text[]; v_after text[];
BEGIN
  SELECT id INTO v_id FROM public.operational_role_assignments
   WHERE company_id = current_setting('rs.c')::uuid
     AND user_id = current_setting('rs.u_two')::uuid
     AND role = 'qa_manager' AND revoked_at IS NULL;

  v_before := public.app_work_roles(current_setting('rs.c')::uuid,
                                    current_setting('rs.u_two')::uuid);

  v_sig := _rssign(current_setting('rs.c')::uuid, current_setting('rs.u_two')::uuid,
                   'qa_manager','revoke', v_id);
  PERFORM public.operational_role_revoke(v_id, 'left the company', v_sig);

  v_after := public.app_work_roles(current_setting('rs.c')::uuid,
                                   current_setting('rs.u_two')::uuid);

  --  ── IMMEDIATE, IN THE SAME SESSION ──
  --
  --  No cache to expire and no token to re-issue: app_work_roles reads
  --  the table, and the session carries no copy of the answer. The
  --  next statement sees it, which is what "immediately" has to mean
  --  for a server-side control.
  PERFORM _rsk('H','H1 the role is gone in the same session, next statement',
    v_before @> ARRAY['qa_manager'] AND NOT (v_after @> ARRAY['qa_manager']),
    array_to_string(v_after, ', '));

  PERFORM _rsk('H','H2 and so is the access it carried',
    public.app_section_access(current_setting('rs.c')::uuid,'batch_release',
      current_setting('rs.u_two')::uuid) IS DISTINCT FROM 'act',
    coalesce(public.app_section_access(current_setting('rs.c')::uuid,'batch_release',
      current_setting('rs.u_two')::uuid),'(null)'));

  --  The other role is untouched.
  PERFORM _rsk('H','H3 the role they still hold is untouched',
    public.app_has_work_role(current_setting('rs.c')::uuid,'qc_analyst',
      current_setting('rs.u_two')::uuid));

  --  ── HISTORICAL ATTRIBUTION SURVIVES ──
  --
  --  The work they did while they held it still names them. Revoking a
  --  role is not a reason to rewrite who did what.
  PERFORM _rsk('H','H4 work they did while holding it still names them',
    (SELECT tested_by = current_setting('rs.u_two')::uuid
       FROM public.batch_qc_results
      WHERE batch_id = current_setting('rs.b1')::uuid));

  PERFORM _rsk('H','H5 and the duty it created still stands',
    public.batch_duty_conflict(current_setting('rs.b1')::uuid, 'release',
      current_setting('rs.u_two')::uuid) IS NOT NULL);
END $h$;

--  ── A SIGNATURE MINTED BEFORE REVOCATION ──
--
--  THE IN-FLIGHT CASE, and the answer to "what happens to work that
--  was already under way". A signature is not a licence. It records
--  that a person signed something at a moment; the authority to act on
--  it is checked when the action is taken. So a half-finished workflow
--  does not complete itself on the strength of a signature minted
--  while the signer still held the role.
DO $h2$
DECLARE v_sig uuid;
BEGIN
  --  The compliance admin signs for an appointment they are about to
  --  lose the authority to make.
  v_sig := _rssign(current_setting('rs.c')::uuid, current_setting('rs.u_sk')::uuid,
                   'qa_officer','grant');
  PERFORM set_config('rs.inflight_sig', v_sig::text, false);
  PERFORM _rsk('H','H6 a signature is minted while the authority is held', v_sig IS NOT NULL);
END $h2$;

RESET ROLE;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('rs.u_adm'), 'role','authenticated')::text, false);
SET ROLE authenticated;

DO $h3$
DECLARE v_id uuid; v_sig uuid;
BEGIN
  SELECT id INTO v_id FROM public.operational_role_assignments
   WHERE company_id = current_setting('rs.c')::uuid
     AND user_id = current_setting('rs.u_ca')::uuid
     AND role = 'compliance_admin' AND revoked_at IS NULL;

  v_sig := _rssign(current_setting('rs.c')::uuid, current_setting('rs.u_ca')::uuid,
                   'compliance_admin','revoke', v_id);
  PERFORM public.operational_role_revoke(v_id, 'left the quality unit', v_sig);

  PERFORM _rsk('H','H7 their compliance_admin is revoked',
    NOT public.app_has_work_role(current_setting('rs.c')::uuid,'compliance_admin',
      current_setting('rs.u_ca')::uuid));
END $h3$;

RESET ROLE;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('rs.u_ca'), 'role','authenticated')::text, false);
SET ROLE authenticated;

DO $h4$
BEGIN
  --  The signature is still valid in itself — same signer, same
  --  target, same hash. What is gone is the authority, and that is
  --  checked now rather than when the signature was minted.
  PERFORM _rsk('H','H8 and the signature they minted earlier authorises nothing',
    _rsfail(format('SELECT public.operational_role_assign(%L,%L,%L,%L,%L)',
      current_setting('rs.c'), current_setting('rs.u_sk'), 'qa_officer', 'in flight',
      current_setting('rs.inflight_sig')))
      = 'OPERATIONAL_ROLE_FORBIDDEN',
    _rsfail(format('SELECT public.operational_role_assign(%L,%L,%L,%L,%L)',
      current_setting('rs.c'), current_setting('rs.u_sk'), 'qa_officer', 'in flight',
      current_setting('rs.inflight_sig'))));

  --  AND THE SIGNATURE ROW SURVIVES. It is evidence that somebody
  --  signed, which stays true however the appointment ended up.
  PERFORM _rsk('H','H9 but the record that they signed survives',
    EXISTS (SELECT 1 FROM public.electronic_signatures
             WHERE id = current_setting('rs.inflight_sig')::uuid));

  --  The signature is not spent either: nothing consumed it, so a
  --  caller who DOES hold the authority could still be the one to use
  --  it — which is the honest outcome, since it names its signer.
  PERFORM _rsk('H','H10 and it was not consumed by the refusal',
    NOT EXISTS (SELECT 1 FROM public.operational_role_assignments
                 WHERE grant_signature_id = current_setting('rs.inflight_sig')::uuid));
END $h4$;


-- =====================================================================
--  I. Assignment security
-- =====================================================================
RESET ROLE;

DO $i$
DECLARE v_n int; v_id uuid;
BEGIN
  --  (1) Service-context grants are MARKED, not waved through
  --  silently. The fixture made two of them.
  SELECT count(*) INTO v_n
    FROM public.operational_role_unsigned_grants(current_setting('rs.c')::uuid)
   WHERE provenance = 'service';
  PERFORM _rsk('I','I1 service-context grants are reported as unsigned',
    v_n >= 2, v_n::text);

  PERFORM _rsk('I','I2 and say no person signed for them',
    (SELECT bool_and(finding LIKE '%No person signed for it%')
       FROM public.operational_role_unsigned_grants(current_setting('rs.c')::uuid)
      WHERE provenance = 'service'));

  --  (2) A service context cannot rewrite revocation history either.
  --  The integrity checks run BEFORE the service exemption.
  SELECT id INTO v_id FROM public.operational_role_assignments
   WHERE company_id = current_setting('rs.c')::uuid AND revoked_at IS NOT NULL
   LIMIT 1;

  PERFORM _rsk('I','I3 even a service caller cannot re-revoke',
    _rsfail(format('UPDATE public.operational_role_assignments'
      ' SET revoked_at = now(), revoke_reason = %L WHERE id = %L', 'again', v_id))
      = 'OPERATIONAL_ROLE_IMMUTABLE',
    _rsfail(format('UPDATE public.operational_role_assignments'
      ' SET revoked_at = now(), revoke_reason = %L WHERE id = %L', 'again', v_id)));

  PERFORM _rsk('I','I4 nor edit what was granted',
    _rsfail(format('UPDATE public.operational_role_assignments'
      ' SET role = %L WHERE id = %L', 'management', v_id))
      = 'OPERATIONAL_ROLE_IMMUTABLE');

  PERFORM _rsk('I','I5 nor un-revoke it',
    _rsfail(format('UPDATE public.operational_role_assignments'
      ' SET revoked_at = NULL, revoked_by = NULL, revoke_reason = NULL WHERE id = %L', v_id))
      = 'OPERATIONAL_ROLE_IMMUTABLE');

  --  (3) A signature cannot be bolted onto an existing row to make an
  --  unsigned grant look signed.
  SELECT id INTO v_id FROM public.operational_role_assignments
   WHERE company_id = current_setting('rs.c')::uuid
     AND provenance = 'service' AND revoked_at IS NULL LIMIT 1;
  PERFORM _rsk('I','I6 a signature cannot be attached afterwards',
    _rsfail(format('UPDATE public.operational_role_assignments'
      ' SET grant_signature_id = %L WHERE id = %L', gen_random_uuid(), v_id))
      = 'OPERATIONAL_ROLE_IMMUTABLE');
END $i$;

--  (4) Another company's member sees nothing and writes nothing.
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('rs.u_solo'), 'role','authenticated')::text, false);
SET ROLE authenticated;

DO $i2$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM public.operational_role_assignments
   WHERE company_id = current_setting('rs.c')::uuid;
  PERFORM _rsk('I','I7 a foreign member sees no assignments', v_n = 0, v_n::text);

  PERFORM _rsk('I','I8 and cannot create one',
    _rsfail(format('INSERT INTO public.operational_role_assignments'
      ' (company_id,user_id,role,reason) VALUES (%L,%L,%L,%L)',
      current_setting('rs.c'), current_setting('rs.u_an'), 'storekeeper', 'try'))
      <> '(no refusal)',
    _rsfail(format('INSERT INTO public.operational_role_assignments'
      ' (company_id,user_id,role,reason) VALUES (%L,%L,%L,%L)',
      current_setting('rs.c'), current_setting('rs.u_an'), 'storekeeper', 'try')));

  --  (5) And nobody deletes one, ever.
  PERFORM _rsk('I','I9 nobody deletes an assignment',
    _rsfail(format('DELETE FROM public.operational_role_assignments WHERE company_id = %L',
      current_setting('rs.c1')))
      <> '(no refusal)');
END $i2$;

-- =====================================================================
--  J. The rules themselves
--
--  Found by the security recheck rather than by design: duty_conflicts
--  and gmp_critical_roles were created without RLS, and the
--  project-wide default grant gave anon and authenticated full DML on
--  them. `DELETE FROM public.duty_conflicts` as a signed-in user
--  removed all six rules; the gates then ran and found nothing to
--  object to.
--
--  A control is only as strong as the table it reads its rule from, so
--  these assertions stand permanently.
-- =====================================================================
RESET ROLE;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('rs.u_an'), 'role','authenticated')::text, false);
SET ROLE authenticated;

DO $j$
DECLARE
  v_tables text[] := ARRAY['section_permissions','step_permissions','duty_conflicts',
                           'gmp_critical_roles','work_role_resolution',
                           'audit_hash_conventions'];
  t text; v_leaks text := ''; v_n int;
BEGIN
  --  (1) Readable — a screen that explains a refusal has to name the
  --  rule, so the lockdown must not have hidden them.
  SELECT count(*) INTO v_n FROM public.duty_conflicts;
  PERFORM _rsk('J','J1 an ordinary user can still read the rules', v_n > 0, v_n::text);

  --  (2) And not writable, by any of the four verbs, on any of them.
  FOREACH t IN ARRAY v_tables LOOP
    IF _rsfail(format('DELETE FROM public.%I', t)) = '(no refusal)' THEN
      v_leaks := v_leaks || t || ' (delete) ';
    END IF;
    IF _rsfail(format('UPDATE public.%I SET %I = %I', t,
                      (SELECT attname FROM pg_attribute
                        WHERE attrelid = ('public.'||t)::regclass AND attnum = 1),
                      (SELECT attname FROM pg_attribute
                        WHERE attrelid = ('public.'||t)::regclass AND attnum = 1)))
       = '(no refusal)' THEN
      v_leaks := v_leaks || t || ' (update) ';
    END IF;
  END LOOP;

  PERFORM _rsk('J','J2 no rule table is writable by a signed-in user',
    v_leaks = '', coalesce(nullif(v_leaks,''),'(all refused)'));

  --  (3) The privilege is gone, not merely unused. RLS alone would
  --  leave the grant in place for the next policy change to expose.
  PERFORM _rsk('J','J3 and the write privilege itself is revoked',
    NOT EXISTS (
      SELECT 1 FROM information_schema.role_table_grants g
       WHERE g.table_schema='public' AND g.table_name = ANY (v_tables)
         AND g.grantee IN ('anon','authenticated')
         AND g.privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE')),
    (SELECT string_agg(DISTINCT format('%s/%s',g.table_name,g.grantee), ', ')
       FROM information_schema.role_table_grants g
      WHERE g.table_schema='public' AND g.table_name = ANY (v_tables)
        AND g.grantee IN ('anon','authenticated')
        AND g.privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE')));

  --  (4) RLS is on wherever a write privilege could come back.
  PERFORM _rsk('J','J4 RLS is enabled on every rule table',
    NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='public' AND c.relname = ANY (v_tables)
         AND NOT c.relrowsecurity),
    (SELECT string_agg(c.relname, ', ') FROM pg_class c
       JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname = ANY (v_tables) AND NOT c.relrowsecurity));
END $j$;

RESET ROLE;
SELECT set_config('request.jwt.claims','', false);


-- =====================================================================
--  Results — COLUMN ORDER IS total, passed, failed.
-- =====================================================================
SELECT section, name, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result, detail
  FROM _rs ORDER BY section, name;

SELECT count(*) AS total,
       count(*) FILTER (WHERE ok) AS passed,
       count(*) FILTER (WHERE NOT ok) AS failed
  FROM _rs;

DO $gate$
DECLARE v_failed bigint;
BEGIN
  SELECT count(*) INTO v_failed FROM _rs WHERE NOT ok;
  IF v_failed > 0 THEN
    RAISE EXCEPTION 'ROLE SIGNATURES AND DUTIES: % assertion(s) failed', v_failed;
  END IF;
END
$gate$;
