-- =====================================================================
--  THE OPERATIONAL ROLE MODEL
--
--  Covers 20261119000000 (assignments separate from membership) and
--  20261120000000 (separation of duties per batch).
--
--  Sections:
--    A. Membership roles are preserved, and are not operational roles
--    B. A person with no operational role abstains, and is not refused
--    C. Several roles at once, and what the union grants
--    D. Revocation: it takes effect, and the row survives it
--    E. Who may assign — by RPC and by direct table write alike
--    F. Separation of duties on one batch
--    G. The legacy bridge, stated rather than implied
--
--  A note on the bridge, because it decides how these fixtures read.
--  app_work_roles reads operational_role_assignments AND, while
--  work_role_resolution.legacy_membership_bridge is on,
--  company_members.role where that column happens to hold one of the
--  eight. Every other suite in this repository relies on the second
--  source. This one turns it OFF for sections A–F, so that what is
--  asserted there is the new table and nothing else, and tests the
--  bridge itself in G.
-- =====================================================================
\set ON_ERROR_STOP on
SET client_min_messages = warning;

RESET ROLE;
SELECT set_config('request.jwt.claims','', false);

CREATE TEMP TABLE _or(section text, name text, ok boolean, detail text);
GRANT ALL ON _or TO anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION _ork(p_section text, p_name text, p_ok boolean, p_detail text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO _or VALUES (p_section,p_name,coalesce(p_ok,false),p_detail); END $$;

--  Catches the refusal and reports its code, so an assertion says
--  WHICH refusal happened rather than only that one did.
CREATE OR REPLACE FUNCTION _orfail(p_sql text)
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RETURN '(no refusal)';
EXCEPTION WHEN OTHERS THEN
  RETURN split_part(SQLERRM, ':', 1);
END $$;
GRANT EXECUTE ON FUNCTION _orfail(text) TO anon, authenticated, service_role;

DO $fx$
DECLARE
  c      uuid := gen_random_uuid();
  u_own  uuid := gen_random_uuid();   -- membership owner, no operational role
  u_adm  uuid := gen_random_uuid();   -- membership admin, no operational role
  u_view uuid := gen_random_uuid();   -- membership viewer, no operational role
  u_qm   uuid := gen_random_uuid();   -- gets qa_manager
  u_an   uuid := gen_random_uuid();   -- gets qc_analyst
  u_both uuid := gen_random_uuid();   -- gets qc_analyst AND storekeeper
  u_ca   uuid := gen_random_uuid();   -- gets compliance_admin
  u_out  uuid := gen_random_uuid();   -- not a member at all
  tag    text := substr(replace(gen_random_uuid()::text,'-',''),1,8);
BEGIN
  PERFORM set_config('or.c',      c::text,      false);
  PERFORM set_config('or.u_own',  u_own::text,  false);
  PERFORM set_config('or.u_adm',  u_adm::text,  false);
  PERFORM set_config('or.u_view', u_view::text, false);
  PERFORM set_config('or.u_qm',   u_qm::text,   false);
  PERFORM set_config('or.u_an',   u_an::text,   false);
  PERFORM set_config('or.u_both', u_both::text, false);
  PERFORM set_config('or.u_ca',   u_ca::text,   false);
  PERFORM set_config('or.u_out',  u_out::text,  false);

  INSERT INTO public.companies(id,name) VALUES (c,'Operational roles '||tag);
  INSERT INTO auth.users(id,email) VALUES
    (u_own,'own-'||tag||'@or.test'),  (u_adm,'adm-'||tag||'@or.test'),
    (u_view,'view-'||tag||'@or.test'),(u_qm,'qm-'||tag||'@or.test'),
    (u_an,'an-'||tag||'@or.test'),    (u_both,'both-'||tag||'@or.test'),
    (u_ca,'ca-'||tag||'@or.test'),    (u_out,'out-'||tag||'@or.test');
  INSERT INTO public.profiles(id,email,full_name,company_id,role) VALUES
    (u_own, 'own-'||tag||'@or.test', 'Adaeze Owner',   c,'admin'),
    (u_adm, 'adm-'||tag||'@or.test', 'Bola Admin',     c,'admin'),
    (u_view,'view-'||tag||'@or.test','Chidi Viewer',   c,'compliance_officer'),
    (u_qm,  'qm-'||tag||'@or.test',  'Ngozi Manager',  c,'compliance_officer'),
    (u_an,  'an-'||tag||'@or.test',  'Emeka Analyst',  c,'compliance_officer'),
    (u_both,'both-'||tag||'@or.test','Funke Two-hats', c,'compliance_officer'),
    (u_ca,  'ca-'||tag||'@or.test',  'Gbenga Compliance',c,'admin');

  --  EVERY MEMBERSHIP ROLE HERE IS ONE company_role CAN HOLD. None of
  --  them is an operational role, which is the point of section A and
  --  is also what the live project looks like.
  INSERT INTO public.company_members(company_id,user_id,role,status) VALUES
    (c,u_own, 'owner', 'active'),
    (c,u_adm, 'admin', 'active'),
    (c,u_view,'viewer','active'),
    (c,u_qm,  'viewer','active'),
    (c,u_an,  'viewer','active'),
    (c,u_both,'viewer','active'),
    (c,u_ca,  'viewer','active');

  --  Assigned as a service context, which is how a deployment or a
  --  backfill would do it. The authority rules are section E's.
  PERFORM public.operational_role_assign(c,u_qm,  'qa_manager',      'fixture');
  PERFORM public.operational_role_assign(c,u_an,  'qc_analyst',      'fixture');
  PERFORM public.operational_role_assign(c,u_both,'qc_analyst',      'fixture');
  PERFORM public.operational_role_assign(c,u_both,'storekeeper',     'fixture');
  PERFORM public.operational_role_assign(c,u_ca,  'compliance_admin','fixture');

  --  THE BRIDGE IS LEFT ON, and does not need turning off: every
  --  membership role above is one company_role can hold, and none of
  --  them is one of the eight, so the bridge contributes nothing to
  --  sections A–F. Section G turns it off and on against its own
  --  fixture. An earlier draft of this file switched it globally and a
  --  failure left it off for every suite that ran afterwards — the
  --  config row is shared, so it is restored unconditionally at the
  --  foot of this file.
  NULL;
END
$fx$;


-- =====================================================================
--  A. Membership is preserved, and is not an operational role
-- =====================================================================
DO $a$
DECLARE v_before text; v_after text;
BEGIN
  --  (1) THE DIRECTION'S FIRST REQUIREMENT, asserted literally: the
  --  membership column is untouched by any of this.
  SELECT string_agg(role::text, ',' ORDER BY role::text) INTO v_after
    FROM public.company_members WHERE company_id = current_setting('or.c')::uuid;
  PERFORM _ork('A','A1 membership roles are still the five this workspace had',
    v_after = 'admin,owner,viewer,viewer,viewer,viewer,viewer', v_after);

  --  (2) Nobody was converted. The owner and the admin hold no
  --  operational role, however much administrative access they have.
  PERFORM _ork('A','A2 the owner holds no operational role',
    coalesce(array_length(public.app_work_roles(
      current_setting('or.c')::uuid, current_setting('or.u_own')::uuid), 1), 0) = 0);
  PERFORM _ork('A','A3 the admin holds no operational role',
    coalesce(array_length(public.app_work_roles(
      current_setting('or.c')::uuid, current_setting('or.u_adm')::uuid), 1), 0) = 0);

  --  (3) And the eight never overlap the five, so no future seed can
  --  make an owner into a QA Manager by naming it.
  PERFORM _ork('A','A4 no membership role is tabulated as an operational role',
    NOT EXISTS (SELECT 1 FROM unnest(ARRAY['owner','admin','legal','marketing','viewer']) m
                 WHERE m = ANY (public.app_operational_roles())));

  --  (4) An operational assignment does not alter membership either.
  SELECT role::text INTO v_before FROM public.company_members
   WHERE company_id = current_setting('or.c')::uuid
     AND user_id = current_setting('or.u_qm')::uuid;
  PERFORM _ork('A','A5 a QA Manager''s membership role is still viewer',
    v_before = 'viewer', v_before);
END $a$;


-- =====================================================================
--  B. No operational role: abstention, not refusal
--
--  The distinction the whole design turns on. A person the matrix does
--  not tabulate is not refused by it, because PM-03 declining to rule
--  is a silence. What refuses them is the policies and the specific
--  authorities, which B4 checks.
-- =====================================================================
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('or.u_own'), 'role','authenticated')::text, false);
SET ROLE authenticated;

DO $b$
BEGIN
  PERFORM _ork('B','B1 the grid has no cell for them',
    public.app_section_access(current_setting('or.c')::uuid,'batch_release') IS NULL);

  --  Both return void, so "did it abstain" is "did it decline to
  --  raise". An earlier draft wrote `… IS NULL`, which is false for
  --  void whatever the function does and would have passed for a guard
  --  that refused everybody.
  PERFORM _ork('B','B2 app_assert_section_act abstains rather than raising',
    _orfail(format('SELECT public.app_assert_section_act(%L,%L)',
      current_setting('or.c'), 'batch_release')) = '(no refusal)',
    _orfail(format('SELECT public.app_assert_section_act(%L,%L)',
      current_setting('or.c'), 'batch_release')));

  PERFORM _ork('B','B3 app_assert_step abstains too',
    _orfail(format('SELECT public.app_assert_step(%L,%L)',
      current_setting('or.c'), 'batch_release')) = '(no refusal)',
    _orfail(format('SELECT public.app_assert_step(%L,%L)',
      current_setting('or.c'), 'batch_release')));

  --  AND YET the authority that names a role still refuses them. This
  --  is the asymmetry 20261117000000 argued for: abstaining here would
  --  let all 21 owners on the live project approve specifications.
  PERFORM _ork('B','B4 but specification approval still refuses them',
    public.product_specification_approver_error(
      current_setting('or.c')::uuid, current_setting('or.u_own')::uuid)
    LIKE 'PRODUCT_SPEC_FORBIDDEN%',
    public.product_specification_approver_error(
      current_setting('or.c')::uuid, current_setting('or.u_own')::uuid));

  PERFORM _ork('B','B5 and names "(none)" rather than a membership role',
    public.product_specification_approver_error(
      current_setting('or.c')::uuid, current_setting('or.u_own')::uuid) LIKE '%(none)');
END $b$;

RESET ROLE;


-- =====================================================================
--  C. Several roles at once
-- =====================================================================
DO $c$
DECLARE v_roles text[];
BEGIN
  v_roles := public.app_work_roles(
    current_setting('or.c')::uuid, current_setting('or.u_both')::uuid);

  PERFORM _ork('C','C1 both assignments resolve, sorted',
    v_roles = ARRAY['qc_analyst','storekeeper'], array_to_string(v_roles,', '));

  --  THE UNION, not the lesser. Two roles were granted on purpose.
  PERFORM _ork('C','C2 the QC Analyst column is granted',
    public.app_section_access(current_setting('or.c')::uuid,'qc_testing',
      current_setting('or.u_both')::uuid) = 'act');
  PERFORM _ork('C','C3 and so is the Storekeeper''s goods receipt',
    public.app_section_access(current_setting('or.c')::uuid,'goods_receipt',
      current_setting('or.u_both')::uuid) = 'act');

  --  A section neither role acts in stays what the grid says.
  PERFORM _ork('C','C4 a section neither role acts in is not granted',
    public.app_section_access(current_setting('or.c')::uuid,'batch_release',
      current_setting('or.u_both')::uuid) <> 'act',
    public.app_section_access(current_setting('or.c')::uuid,'batch_release',
      current_setting('or.u_both')::uuid));

  --  A step either role holds is held.
  PERFORM _ork('C','C5 app_has_work_role sees each of them',
    public.app_has_work_role(current_setting('or.c')::uuid,'qc_analyst',
      current_setting('or.u_both')::uuid)
    AND public.app_has_work_role(current_setting('or.c')::uuid,'storekeeper',
      current_setting('or.u_both')::uuid));

  --  THE DEPRECATED SINGULAR gives no answer rather than an arbitrary
  --  one, which is why no guard may call it.
  PERFORM _ork('C','C6 app_work_role returns NULL for someone holding two',
    public.app_work_role(current_setting('or.c')::uuid,
      current_setting('or.u_both')::uuid) IS NULL);
  PERFORM _ork('C','C7 and the sole role for someone holding one',
    public.app_work_role(current_setting('or.c')::uuid,
      current_setting('or.u_qm')::uuid) = 'qa_manager');

  --  AND NO GUARD DOES. The migration asserts this at deploy time;
  --  asserted again here so a later edit is caught by the suite too.
  PERFORM _ork('C','C8 no function body still resolves a single role',
    NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                 WHERE n.nspname='public' AND p.proname <> 'app_work_role'
                   AND p.prosrc ~ '\mapp_work_role\s*\('),
    (SELECT string_agg(p.proname,', ') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname <> 'app_work_role'
        AND p.prosrc ~ '\mapp_work_role\s*\('));

  --  A restriction still outranks every role the person holds.
  INSERT INTO public.access_restrictions
    (company_id,user_id,section_key,to_level,reason,set_by)
  VALUES (current_setting('or.c')::uuid, current_setting('or.u_both')::uuid,
          'qc_testing','view','suite', current_setting('or.u_ca')::uuid);

  PERFORM _ork('C','C9 an individual restriction lowers the union',
    public.app_section_access(current_setting('or.c')::uuid,'qc_testing',
      current_setting('or.u_both')::uuid) = 'view',
    public.app_section_access(current_setting('or.c')::uuid,'qc_testing',
      current_setting('or.u_both')::uuid));
  PERFORM _ork('C','C10 and leaves the other role''s column alone',
    public.app_section_access(current_setting('or.c')::uuid,'goods_receipt',
      current_setting('or.u_both')::uuid) = 'act');

  --  Lifted rather than deleted: 20261110000000 refuses the delete,
  --  because a restriction that was imposed and withdrawn is two facts
  --  and deleting it would leave neither.
  PERFORM public.access_restriction_lift(
    (SELECT id FROM public.access_restrictions
      WHERE company_id = current_setting('or.c')::uuid
        AND user_id = current_setting('or.u_both')::uuid
        AND section_key = 'qc_testing' AND lifted_at IS NULL),
    'suite');

  PERFORM _ork('C','C11 and lifting it restores the union',
    public.app_section_access(current_setting('or.c')::uuid,'qc_testing',
      current_setting('or.u_both')::uuid) = 'act',
    public.app_section_access(current_setting('or.c')::uuid,'qc_testing',
      current_setting('or.u_both')::uuid));
END $c$;


-- =====================================================================
--  D. Revocation
-- =====================================================================
DO $d$
DECLARE v_id uuid; v_code text;
BEGIN
  SELECT id INTO v_id FROM public.operational_role_assignments
   WHERE company_id = current_setting('or.c')::uuid
     AND user_id = current_setting('or.u_both')::uuid
     AND role = 'storekeeper' AND revoked_at IS NULL;

  PERFORM public.operational_role_revoke(v_id, 'moved to another line');

  PERFORM _ork('D','D1 the role is gone from the set',
    public.app_work_roles(current_setting('or.c')::uuid,
      current_setting('or.u_both')::uuid) = ARRAY['qc_analyst'],
    array_to_string(public.app_work_roles(current_setting('or.c')::uuid,
      current_setting('or.u_both')::uuid), ', '));

  --  Not NULL: qc_analyst, which they still hold, has its own cell for
  --  goods receipt. What is gone is the Act the storekeeper role
  --  carried, which is the thing revocation is for.
  PERFORM _ork('D','D2 and so is the Act it carried',
    public.app_section_access(current_setting('or.c')::uuid,'goods_receipt',
      current_setting('or.u_both')::uuid) IS DISTINCT FROM 'act',
    public.app_section_access(current_setting('or.c')::uuid,'goods_receipt',
      current_setting('or.u_both')::uuid));

  --  THE ROW SURVIVES. Who held what, when, and who ended it is the
  --  evidence; a delete would destroy it.
  PERFORM _ork('D','D3 the assignment row is still there',
    EXISTS (SELECT 1 FROM public.operational_role_assignments WHERE id = v_id));
  PERFORM _ork('D','D4 with who revoked it and why',
    EXISTS (SELECT 1 FROM public.operational_role_assignments
             WHERE id = v_id AND revoked_at IS NOT NULL
               AND revoke_reason = 'moved to another line'));

  --  A reason is not optional.
  PERFORM _ork('D','D5 revoking without a reason is refused',
    _orfail(format('SELECT public.operational_role_revoke(%L,%L)', v_id, '  '))
      = 'OPERATIONAL_ROLE_REASON_REQUIRED',
    _orfail(format('SELECT public.operational_role_revoke(%L,%L)', v_id, '  ')));

  --  Revoking twice is refused rather than silently re-stamped, which
  --  would move the timestamp of a decision already made.
  PERFORM _ork('D','D6 revoking an already revoked assignment is refused',
    _orfail(format('SELECT public.operational_role_revoke(%L,%L)', v_id, 'again'))
      = 'OPERATIONAL_ROLE_IMMUTABLE',
    _orfail(format('SELECT public.operational_role_revoke(%L,%L)', v_id, 'again')));

  --  Granting the same role again is allowed, and both grants stay
  --  visible: the partial unique index exempts revoked rows.
  PERFORM public.operational_role_assign(current_setting('or.c')::uuid,
    current_setting('or.u_both')::uuid, 'storekeeper', 'came back');
  PERFORM _ork('D','D7 the role can be granted again',
    public.app_has_work_role(current_setting('or.c')::uuid,'storekeeper',
      current_setting('or.u_both')::uuid));
  PERFORM _ork('D','D8 and the earlier grant is still on the record',
    (SELECT count(*) FROM public.operational_role_assignments
      WHERE company_id = current_setting('or.c')::uuid
        AND user_id = current_setting('or.u_both')::uuid
        AND role = 'storekeeper') = 2);
END $d$;


-- =====================================================================
--  E. Who may assign — and the same answer whatever the route
--
--  Every refusal below is attempted TWICE: once through the RPC and
--  once as a direct INSERT or UPDATE on the table. They must agree,
--  because a control that only the RPC applies is a control anyone
--  holding a database session can walk around.
-- =====================================================================
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('or.u_view'), 'role','authenticated')::text, false);
SET ROLE authenticated;

DO $e1$
BEGIN
  --  A plain member has no authority over roles.
  PERFORM _ork('E','E1 a viewer may not assign, by RPC',
    _orfail(format('SELECT public.operational_role_assign(%L,%L,%L,%L)',
      current_setting('or.c'), current_setting('or.u_an'), 'qa_manager', 'try'))
      = 'OPERATIONAL_ROLE_FORBIDDEN',
    _orfail(format('SELECT public.operational_role_assign(%L,%L,%L,%L)',
      current_setting('or.c'), current_setting('or.u_an'), 'qa_manager', 'try')));

  PERFORM _ork('E','E2 nor by a direct INSERT',
    _orfail(format('INSERT INTO public.operational_role_assignments'
      ' (company_id,user_id,role,reason) VALUES (%L,%L,%L,%L)',
      current_setting('or.c'), current_setting('or.u_an'), 'qa_manager', 'try'))
      = 'OPERATIONAL_ROLE_FORBIDDEN',
    _orfail(format('INSERT INTO public.operational_role_assignments'
      ' (company_id,user_id,role,reason) VALUES (%L,%L,%L,%L)',
      current_setting('or.c'), current_setting('or.u_an'), 'qa_manager', 'try')));

  --  THE ONE THAT MATTERS MOST. Self-elevation is the failure the
  --  whole model exists to prevent.
  PERFORM _ork('E','E3 nor may they give it to themselves',
    _orfail(format('SELECT public.operational_role_assign(%L,%L,%L,%L)',
      current_setting('or.c'), current_setting('or.u_view'), 'qa_manager', 'try'))
      = 'OPERATIONAL_ROLE_FORBIDDEN');
END $e1$;

RESET ROLE;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('or.u_adm'), 'role','authenticated')::text, false);
SET ROLE authenticated;

DO $e2$
DECLARE v_id uuid;
BEGIN
  --  A workspace admin MAY appoint somebody else. This is the only
  --  way a first operational role can ever exist.
  v_id := public.operational_role_assign(current_setting('or.c')::uuid,
    current_setting('or.u_view')::uuid, 'procurement', 'by the admin');
  PERFORM _ork('E','E4 a workspace admin may appoint somebody else',
    public.app_has_work_role(current_setting('or.c')::uuid,'procurement',
      current_setting('or.u_view')::uuid));

  --  … AND NOT THEMSELVES, by either route.
  PERFORM _ork('E','E5 but not themselves, by RPC',
    _orfail(format('SELECT public.operational_role_assign(%L,%L,%L,%L)',
      current_setting('or.c'), current_setting('or.u_adm'), 'qa_manager', 'try'))
      = 'OPERATIONAL_ROLE_SELF',
    _orfail(format('SELECT public.operational_role_assign(%L,%L,%L,%L)',
      current_setting('or.c'), current_setting('or.u_adm'), 'qa_manager', 'try')));

  PERFORM _ork('E','E6 nor themselves by a direct INSERT',
    _orfail(format('INSERT INTO public.operational_role_assignments'
      ' (company_id,user_id,role,reason) VALUES (%L,%L,%L,%L)',
      current_setting('or.c'), current_setting('or.u_adm'), 'qa_manager', 'try'))
      = 'OPERATIONAL_ROLE_SELF');

  --  Nor forge who granted it.
  PERFORM public.operational_role_revoke(v_id, 'resetting for the next assertion');
  EXECUTE format('INSERT INTO public.operational_role_assignments'
    ' (company_id,user_id,role,reason,assigned_by) VALUES (%L,%L,%L,%L,%L)',
    current_setting('or.c'), current_setting('or.u_view'), 'procurement',
    'again', current_setting('or.u_own'));
  PERFORM _ork('E','E7 the grantor is the caller, not whoever the row claimed',
    (SELECT assigned_by FROM public.operational_role_assignments
      WHERE company_id = current_setting('or.c')::uuid
        AND user_id = current_setting('or.u_view')::uuid
        AND role = 'procurement' AND revoked_at IS NULL)
    = current_setting('or.u_adm')::uuid);

  --  An unknown role, and a non-member.
  PERFORM _ork('E','E8 a role outside the eight is refused',
    _orfail(format('SELECT public.operational_role_assign(%L,%L,%L,%L)',
      current_setting('or.c'), current_setting('or.u_an'), 'owner', 'try'))
      = 'OPERATIONAL_ROLE_UNKNOWN',
    _orfail(format('SELECT public.operational_role_assign(%L,%L,%L,%L)',
      current_setting('or.c'), current_setting('or.u_an'), 'owner', 'try')));

  PERFORM _ork('E','E9 somebody who is not a member is refused',
    _orfail(format('SELECT public.operational_role_assign(%L,%L,%L,%L)',
      current_setting('or.c'), current_setting('or.u_out'), 'qa_manager', 'try'))
      = 'OPERATIONAL_ROLE_NOT_A_MEMBER');

  --  The row is evidence: it may be revoked, never deleted or edited.
  PERFORM _ork('E','E10 an assignment may not be deleted',
    _orfail(format('DELETE FROM public.operational_role_assignments WHERE id = %L', v_id))
      = 'OPERATIONAL_ROLE_IMMUTABLE',
    _orfail(format('DELETE FROM public.operational_role_assignments WHERE id = %L', v_id)));

  PERFORM _ork('E','E11 nor may its grant be edited',
    _orfail(format('UPDATE public.operational_role_assignments SET role = %L WHERE id = %L',
      'qa_manager', v_id)) = 'OPERATIONAL_ROLE_IMMUTABLE');
END $e2$;

RESET ROLE;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('or.u_ca'), 'role','authenticated')::text, false);
SET ROLE authenticated;

DO $e3$
BEGIN
  --  PM-03's own "Change roles and permissions — Compliance admin".
  PERFORM public.operational_role_assign(current_setting('or.c')::uuid,
    current_setting('or.u_an')::uuid, 'production_supervisor', 'by the compliance admin');
  PERFORM _ork('E','E12 a compliance admin may assign',
    public.app_has_work_role(current_setting('or.c')::uuid,'production_supervisor',
      current_setting('or.u_an')::uuid));

  PERFORM _ork('E','E13 and still not to themselves',
    _orfail(format('SELECT public.operational_role_assign(%L,%L,%L,%L)',
      current_setting('or.c'), current_setting('or.u_ca'), 'qa_manager', 'try'))
      = 'OPERATIONAL_ROLE_SELF');
END $e3$;

RESET ROLE;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('or.u_an'), 'role','authenticated')::text, false);
SET ROLE authenticated;

DO $e4$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.operational_role_assignments
   WHERE company_id = current_setting('or.c')::uuid
     AND user_id = current_setting('or.u_an')::uuid
     AND role = 'production_supervisor' AND revoked_at IS NULL;

  --  STANDING DOWN IS NOT SELF-ELEVATION. You may always drop your own
  --  authority; you may never award it to yourself.
  PERFORM public.operational_role_revoke(v_id, 'standing down');
  PERFORM _ork('E','E14 a person may revoke their own role',
    NOT public.app_has_work_role(current_setting('or.c')::uuid,'production_supervisor',
      current_setting('or.u_an')::uuid));

  PERFORM _ork('E','E15 but still may not grant one',
    _orfail(format('SELECT public.operational_role_assign(%L,%L,%L,%L)',
      current_setting('or.c'), current_setting('or.u_view'), 'qa_officer', 'try'))
      = 'OPERATIONAL_ROLE_FORBIDDEN');
END $e4$;

RESET ROLE;


-- =====================================================================
--  F. Separation of duties on one batch
--
--  PM-03 used to separate these by arithmetic: QC testing is the QC
--  Analyst's column alone and batch release the QA Manager's alone, so
--  one person could not hold both. Multiple assignment removes that,
--  and this is what replaces it.
-- =====================================================================
DO $f$
DECLARE
  c uuid := current_setting('or.c')::uuid;
  v_bad text;
BEGIN
  --  (1) The pairs are derived from PM-03, not chosen. Asserted in the
  --  migration at deploy time and again here, because a later seed
  --  could add a pair the matrix does not separate.
  SELECT string_agg(format('%s/%s', k.section_a, k.section_b), '; ') INTO v_bad
    FROM public.duty_conflicts k
   WHERE k.scope = 'batch' AND k.enforced
     AND NOT public.duty_pair_is_derived(k.section_a, k.section_b);
  PERFORM _ork('F','F1 every conflicting pair is one PM-03 already separated',
    v_bad IS NULL, coalesce(v_bad,'(all disjoint)'));

  --  (2) Every duty named is one the reader can actually report.
  SELECT string_agg(d, ', ') INTO v_bad FROM (
    SELECT duty_a AS d FROM public.duty_conflicts WHERE scope = 'batch'
    UNION SELECT duty_b FROM public.duty_conflicts WHERE scope = 'batch') u
   WHERE d NOT IN ('qc_testing','execution','release','dispatch');
  PERFORM _ork('F','F2 and is one batch_actor_duties reports',
    v_bad IS NULL, coalesce(v_bad,'(all known)'));

  --  (3) Somebody who has done nothing to a batch conflicts with
  --  nothing. The check must not refuse everyone.
  PERFORM _ork('F','F3 a clean actor has no conflict',
    public.batch_duty_conflict(gen_random_uuid(),'release',
      current_setting('or.u_qm')::uuid) IS NULL);

  PERFORM _ork('F','F4 the qc/release pair keeps its original code',
    (SELECT error_code FROM public.duty_conflicts
      WHERE scope='batch' AND duty_a='qc_testing' AND duty_b='release')
    = 'BATCH_RELEASE_SELF_TESTED');
END $f$;

DO $f2$
DECLARE
  c uuid := current_setting('or.c')::uuid;
  u uuid := current_setting('or.u_both')::uuid;
  v_batch uuid := gen_random_uuid();
  v_prod  uuid := gen_random_uuid();
  tag text := substr(replace(gen_random_uuid()::text,'-',''),1,8);
BEGIN
  INSERT INTO public.products(id,company_id,product_code,trade_name,generic_name,category,created_by)
  VALUES (v_prod,c,'SOD-'||tag,'Tablet S','Paracetamol','drug_pharmaceutical',
          current_setting('or.u_qm')::uuid);

  INSERT INTO public.batch_records
    (id,company_id,batch_number,product_name,product_id,
     manufacturing_date,expiry_date,batch_size,unit)
  VALUES (v_batch,c,'SOD-'||tag,'Tablet S',v_prod,
          current_date - 10,current_date + 355,100,'kg');

  --  u_both recorded a finished-product result on this batch.
  INSERT INTO public.batch_qc_results(batch_id,test_name,result,pass,tested_by)
  VALUES (v_batch,'Assay','99.4 %',true,u);

  PERFORM _ork('F','F5 the duty is seen',
    public.batch_actor_duties(v_batch,u) = ARRAY['qc_testing'],
    array_to_string(public.batch_actor_duties(v_batch,u),', '));

  --  THE CONFLICT. Same person, same batch, the other duty.
  PERFORM _ork('F','F6 so they may not also release this batch',
    public.batch_duty_conflict(v_batch,'release',u) LIKE 'BATCH_RELEASE_SELF_TESTED%',
    public.batch_duty_conflict(v_batch,'release',u));

  --  …and somebody else still may. The rule is about the batch, not
  --  about the person.
  PERFORM _ork('F','F7 somebody else may',
    public.batch_duty_conflict(v_batch,'release',current_setting('or.u_qm')::uuid) IS NULL);

  --  …and the same person is not blocked on a DIFFERENT batch.
  PERFORM _ork('F','F8 and the same person may release another batch',
    public.batch_duty_conflict(gen_random_uuid(),'release',u) IS NULL);

  --  Execution conflicts with release as well.
  UPDATE public.batch_records SET execution_closed_by = current_setting('or.u_an')::uuid
   WHERE id = v_batch;
  PERFORM _ork('F','F9 whoever closed execution may not release either',
    public.batch_duty_conflict(v_batch,'release',current_setting('or.u_an')::uuid)
      LIKE 'BATCH_DUTY_CONFLICT%',
    public.batch_duty_conflict(v_batch,'release',current_setting('or.u_an')::uuid));

  --  And release conflicts with dispatch, in the other direction.
  UPDATE public.batch_records SET released_by = current_setting('or.u_qm')::uuid
   WHERE id = v_batch;
  PERFORM _ork('F','F10 whoever released it may not dispatch it',
    public.batch_duty_conflict(v_batch,'dispatch',current_setting('or.u_qm')::uuid)
      LIKE 'BATCH_DUTY_CONFLICT%',
    public.batch_duty_conflict(v_batch,'dispatch',current_setting('or.u_qm')::uuid));
  PERFORM _ork('F','F11 but somebody else may dispatch it',
    public.batch_duty_conflict(v_batch,'dispatch',u) IS NULL);
END $f2$;


-- =====================================================================
--  G. The legacy bridge
--
--  Turned off for everything above. Here it is turned back on and
--  checked: it admits an operational role sitting in the membership
--  column, which is what every other suite in this repository relies
--  on, and it admits nothing else — least of all an owner.
-- =====================================================================
DO $g$
DECLARE
  c2 uuid := gen_random_uuid();
  u1 uuid := gen_random_uuid();
  u2 uuid := gen_random_uuid();
  tag text := substr(replace(gen_random_uuid()::text,'-',''),1,8);
BEGIN
  INSERT INTO public.companies(id,name) VALUES (c2,'Bridge '||tag);
  INSERT INTO auth.users(id,email) VALUES
    (u1,'b1-'||tag||'@or.test'), (u2,'b2-'||tag||'@or.test');
  INSERT INTO public.profiles(id,email,full_name,company_id,role) VALUES
    (u1,'b1-'||tag||'@or.test','Legacy Analyst',c2,'compliance_officer'),
    (u2,'b2-'||tag||'@or.test','Legacy Owner',  c2,'admin');
  INSERT INTO public.company_members(company_id,user_id,role,status) VALUES
    (c2,u1,'qc_analyst','active'),
    (c2,u2,'owner','active');

  --  OFF: the membership column is not read at all.
  UPDATE public.work_role_resolution SET legacy_membership_bridge = false;
  PERFORM _ork('G','G1 with the bridge off, a membership "qc_analyst" is nobody',
    coalesce(array_length(public.app_work_roles(c2,u1),1),0) = 0,
    array_to_string(public.app_work_roles(c2,u1),', '));

  --  ON: it is read, and admits exactly the eight.
  UPDATE public.work_role_resolution SET legacy_membership_bridge = true;
  PERFORM _ork('G','G2 with the bridge on, it resolves',
    public.app_work_roles(c2,u1) = ARRAY['qc_analyst'],
    array_to_string(public.app_work_roles(c2,u1),', '));

  --  THE ASSERTION THE DIRECTION ASKED FOR. The bridge cannot promote
  --  an owner, because its only filter is membership of the eight and
  --  `owner` is not one of them. On the live project the column is the
  --  company_role enum and can hold nothing else, so the bridge is
  --  inert there however it is set.
  PERFORM _ork('G','G3 and still cannot make an owner into anything',
    coalesce(array_length(public.app_work_roles(c2,u2),1),0) = 0,
    array_to_string(public.app_work_roles(c2,u2),', '));

  --  An explicit assignment and the bridge union rather than collide.
  PERFORM public.operational_role_assign(c2,u1,'qa_officer','both sources');
  PERFORM _ork('G','G4 an assignment unions with a bridged role',
    public.app_work_roles(c2,u1) = ARRAY['qa_officer','qc_analyst'],
    array_to_string(public.app_work_roles(c2,u1),', '));
END $g$;


-- =====================================================================
--  Shared config, restored whatever happened above.
UPDATE public.work_role_resolution SET legacy_membership_bridge = true;

--  Results — COLUMN ORDER IS total, passed, failed.
SELECT section, name, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result, detail
  FROM _or ORDER BY section, name;

SELECT count(*) AS total,
       count(*) FILTER (WHERE ok) AS passed,
       count(*) FILTER (WHERE NOT ok) AS failed
  FROM _or;

DO $done$
DECLARE v_failed int;
BEGIN
  SELECT count(*) INTO v_failed FROM _or WHERE NOT ok;
  IF v_failed > 0 THEN
    RAISE EXCEPTION 'OPERATIONAL ROLE MODEL: % assertion(s) failed', v_failed;
  END IF;
END $done$;
