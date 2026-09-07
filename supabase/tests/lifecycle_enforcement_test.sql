-- =====================================================================
--  LIFECYCLE ENFORCEMENT — INTEGRATION TESTS (Engineering Deliverable 02)
--  LOCAL / DISPOSABLE DATABASE ONLY
-- =====================================================================
--  Two things are under test:
--
--   PART 1  the P0 fix to D01's write path — cross-tenant writes, forged
--           attribution and mis-filed history. D01's own suite tested
--           cross-tenant READS only, which is why it missed all three.
--   PART 2  the requirement enforcement: required_role, requires_comment,
--           and the two fail-closed cases.
--
--  Run:  psql "<local url>" -f supabase/tests/lifecycle_enforcement_test.sql
--
--  Safe to run repeatedly. Fixtures are tagged lcenf and removed at the
--  end. No permanent schema change is made.
-- =====================================================================

\set ON_ERROR_STOP off

DO $guard$
BEGIN
  IF current_database() NOT IN ('postgres','criateur_local') THEN
    RAISE EXCEPTION 'REFUSING TO RUN outside a local database (got %)', current_database();
  END IF;
  IF to_regprocedure('public.app_is_service_context()') IS NULL THEN
    RAISE EXCEPTION 'Migration 20260907000000 has not been applied to this database.';
  END IF;
END $guard$;

DO $companies$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema='public' AND table_name='companies') THEN
    CREATE TABLE public.companies (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL,
      created_at timestamptz DEFAULT now()
    );
    ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
    GRANT ALL ON public.companies TO anon, authenticated, service_role;
    RAISE WARNING 'public.companies scaffolded for testing (absent from migrations).';
  END IF;
END $companies$;

DROP TABLE IF EXISTS lcenf_results;
CREATE TEMP TABLE lcenf_results(seq serial, id text, name text, verdict text, detail text);
GRANT ALL ON lcenf_results TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE lcenf_results_seq_seq TO authenticated, service_role;

CREATE OR REPLACE FUNCTION lcenf_assert(p_id text, p_name text, p_cond boolean, p_detail text DEFAULT '')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO lcenf_results(id,name,verdict,detail)
  VALUES (p_id, p_name, CASE WHEN p_cond THEN 'PASS' ELSE 'FAIL' END, p_detail);
END $$;

-- ── fixtures ─────────────────────────────────────────────────────────
--  company A : admin, compliance_officer, content_creator
--  company B : content_creator  (the attacker in the tenancy tests)
--
--  Lifecycle lcenf_doc, deliberately restrictive, with one transition per
--  requirement so each check can be exercised in isolation.
DO $fx$
DECLARE
  ca uuid := '00000000-0000-4500-a000-00000000000a';
  cb uuid := '00000000-0000-4500-a000-00000000000b';
  u_adm uuid := '00000000-0000-4500-b000-000000000001';
  u_off uuid := '00000000-0000-4500-b000-000000000002';
  u_cre uuid := '00000000-0000-4500-b000-000000000003';
  u_b   uuid := '00000000-0000-4500-b000-000000000004';
  v_def uuid; s_draft uuid; s_review uuid; s_appr uuid; s_rej uuid;
  e uuid;
BEGIN
  INSERT INTO public.companies(id,name) VALUES (ca,'LCENF-A'),(cb,'LCENF-B') ON CONFLICT (id) DO NOTHING;

  INSERT INTO auth.users(id,email) VALUES
    (u_adm,'lcenf-admin@local.test'), (u_off,'lcenf-officer@local.test'),
    (u_cre,'lcenf-creator@local.test'), (u_b,'lcenf-b@local.test')
    ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles(id,email,role,company_id) VALUES
    (u_adm,'lcenf-admin@local.test','admin',ca),
    (u_off,'lcenf-officer@local.test','compliance_officer',ca),
    (u_cre,'lcenf-creator@local.test','content_creator',ca),
    (u_b,'lcenf-b@local.test','content_creator',cb)
    ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.company_members(company_id,user_id,status) VALUES
    (ca,u_adm,'active'),(ca,u_off,'active'),(ca,u_cre,'active'),(cb,u_b,'active')
    ON CONFLICT DO NOTHING;

  DELETE FROM public.lifecycle_definitions WHERE entity_type='lcenf_doc';
  INSERT INTO public.lifecycle_definitions(company_id,entity_type,name,version,is_active)
  VALUES (NULL,'lcenf_doc','LCENF test lifecycle',1,true) RETURNING id INTO v_def;

  INSERT INTO public.lifecycle_states(definition_id,state_key,label,sort_order,is_initial)
  VALUES (v_def,'draft','Draft',0,true) RETURNING id INTO s_draft;
  INSERT INTO public.lifecycle_states(definition_id,state_key,label,sort_order,is_initial)
  VALUES (v_def,'in_review','In Review',1,false) RETURNING id INTO s_review;
  INSERT INTO public.lifecycle_states(definition_id,state_key,label,sort_order,is_initial)
  VALUES (v_def,'approved','Approved',2,false) RETURNING id INTO s_appr;
  INSERT INTO public.lifecycle_states(definition_id,state_key,label,sort_order,is_initial)
  VALUES (v_def,'rejected','Rejected',3,false) RETURNING id INTO s_rej;

  INSERT INTO public.lifecycle_transitions
    (definition_id,from_state_id,to_state_id,action_key,label,sort_order,
     required_role,required_permission,requires_comment,requires_signature)
  VALUES
    -- no requirements at all
    (v_def,s_draft ,s_review,'submit'    ,'Submit'          ,0,NULL,NULL,false,false),
    -- comma-separated role list AND a mandatory comment
    (v_def,s_review,s_appr  ,'approve'   ,'Approve'         ,1,'admin,compliance_officer',NULL,true ,false),
    -- single role
    (v_def,s_review,s_rej   ,'reject'    ,'Reject'          ,2,'admin',NULL,false,false),
    -- fail-closed: signature
    (v_def,s_review,s_appr  ,'sign_off'  ,'Sign off'        ,3,NULL,NULL,false,true ),
    -- fail-closed: permission
    (v_def,s_review,s_rej   ,'escalate'  ,'Escalate'        ,4,NULL,'canApproveCapa',false,false);

  -- e1 stays in draft (tenancy tests); e2..e5 are moved to in_review
  PERFORM public.lifecycle_initialize('lcenf_doc','00000000-0000-4500-c000-000000000001',ca,u_cre,NULL);
  FOR e IN SELECT unnest(ARRAY['00000000-0000-4500-c000-000000000002',
                               '00000000-0000-4500-c000-000000000003',
                               '00000000-0000-4500-c000-000000000004',
                               '00000000-0000-4500-c000-000000000005']::uuid[]) LOOP
    PERFORM public.lifecycle_initialize('lcenf_doc',e,ca,u_cre,NULL);
    PERFORM public.lifecycle_transition('lcenf_doc',e,'submit',ca,u_cre,NULL,'{}'::jsonb);
  END LOOP;
END $fx$;


-- =====================================================================
--  PART 1 — tenancy and actor identity (the P0 fix)
-- =====================================================================

-- P1.1/P1.2 — user B, a member of company B only, attacks company A's e1
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4500-b000-000000000004","role":"authenticated"}',false);
SET ROLE authenticated;
DO $p1$
DECLARE v_msg text; v_state text; v_hist int;
BEGIN
  SELECT count(*) INTO v_hist FROM public.entity_state_history
   WHERE entity_id='00000000-0000-4500-c000-000000000001';

  -- claiming their OWN company, targeting another tenant's entity
  BEGIN
    PERFORM public.lifecycle_transition('lcenf_doc','00000000-0000-4500-c000-000000000001','submit',
             '00000000-0000-4500-a000-00000000000b'::uuid);
    PERFORM lcenf_assert('P1.1','cross-tenant transition is rejected', false, 'transition SUCCEEDED');
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    PERFORM lcenf_assert('P1.1','cross-tenant transition is rejected',
                         v_msg LIKE 'LIFECYCLE_COMPANY_MISMATCH%' OR v_msg LIKE 'LIFECYCLE_NOT_INITIALIZED%', v_msg);
  END;

  -- claiming the VICTIM's company, of which they are not a member
  BEGIN
    PERFORM public.lifecycle_transition('lcenf_doc','00000000-0000-4500-c000-000000000001','submit',
             '00000000-0000-4500-a000-00000000000a'::uuid);
    PERFORM lcenf_assert('P1.2','claiming another company is rejected', false, 'transition SUCCEEDED');
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    PERFORM lcenf_assert('P1.2','claiming another company is rejected',
                         v_msg LIKE 'LIFECYCLE_FORBIDDEN%', v_msg);
  END;

  -- initialising an entity into a company they do not belong to
  BEGIN
    PERFORM public.lifecycle_initialize('lcenf_doc','00000000-0000-4500-c000-0000000000ff',
             '00000000-0000-4500-a000-00000000000a'::uuid);
    PERFORM lcenf_assert('P1.3','cross-tenant initialize is rejected', false, 'initialize SUCCEEDED');
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    -- Originally this asserted LIFECYCLE_FORBIDDEN, from the tenancy check
    -- inside lifecycle_initialize(). 20260914000000 replaced that with a
    -- stronger defence: the function is no longer granted to clients at
    -- all, because the engine cannot verify that an arbitrary entity_id
    -- belongs to the company a caller names. Both are rejections; the
    -- permission denial is the better one and is what is seen here. The
    -- in-function check still guards service-context callers.
    PERFORM lcenf_assert('P1.3','cross-tenant initialize is rejected',
                         v_msg LIKE '%permission denied%' OR v_msg LIKE 'LIFECYCLE_FORBIDDEN%', v_msg);
  END;
END $p1$;
RESET ROLE;

-- nothing may have been written by any of those attempts
DO $p1v$
DECLARE v_state text; v_hist int; v_orphan int;
BEGIN
  SELECT s.state_key INTO v_state FROM public.entity_current_state ecs
    JOIN public.lifecycle_states s ON s.id=ecs.state_id
   WHERE ecs.entity_id='00000000-0000-4500-c000-000000000001';
  SELECT count(*) INTO v_hist FROM public.entity_state_history
   WHERE entity_id='00000000-0000-4500-c000-000000000001';
  SELECT count(*) INTO v_orphan FROM public.entity_current_state
   WHERE entity_id='00000000-0000-4500-c000-0000000000ff';

  PERFORM lcenf_assert('P1.4','the attacked entity is still in its original state', v_state='draft', coalesce(v_state,'NULL'));
  PERFORM lcenf_assert('P1.5','no history row was written by the attacks', v_hist=1, v_hist||' row(s)');
  PERFORM lcenf_assert('P1.6','no entity was created in the victim tenant', v_orphan=0, v_orphan||' row(s)');
END $p1v$;

-- P1.7 — a member of the right company cannot forge the actor
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4500-b000-000000000003","role":"authenticated"}',false);
SET ROLE authenticated;
DO $p1f$
DECLARE v_msg text;
BEGIN
  BEGIN
    PERFORM public.lifecycle_transition('lcenf_doc','00000000-0000-4500-c000-000000000001','submit',
             '00000000-0000-4500-a000-00000000000a'::uuid,
             '00000000-0000-4500-b000-000000000001'::uuid);   -- claim to be the admin
    PERFORM lcenf_assert('P1.7','a forged actor is rejected', false, 'transition SUCCEEDED');
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    PERFORM lcenf_assert('P1.7','a forged actor is rejected', v_msg LIKE 'LIFECYCLE_ACTOR_MISMATCH%', v_msg);
  END;
END $p1f$;
RESET ROLE;

-- P1.8/P1.9 — a legitimate transition attributes and files correctly
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4500-b000-000000000003","role":"authenticated"}',false);
SET ROLE authenticated;
DO $p1ok$
DECLARE r jsonb; v_actor uuid; v_co uuid;
BEGIN
  r := public.lifecycle_transition('lcenf_doc','00000000-0000-4500-c000-000000000001','submit',
        '00000000-0000-4500-a000-00000000000a'::uuid);
  SELECT actor_id, company_id INTO v_actor, v_co FROM public.entity_state_history
   WHERE entity_id='00000000-0000-4500-c000-000000000001' ORDER BY created_at DESC LIMIT 1;

  PERFORM lcenf_assert('P1.8','the actor recorded is the session user',
    v_actor='00000000-0000-4500-b000-000000000003' AND r->>'actor_id'=v_actor::text, coalesce(v_actor::text,'NULL'));
  PERFORM lcenf_assert('P1.9','history is filed under the entity''s company',
    v_co='00000000-0000-4500-a000-00000000000a', coalesce(v_co::text,'NULL'));
END $p1ok$;
RESET ROLE;

-- P1.10 — an authenticated session with no user at all
SELECT set_config('request.jwt.claims','',false);
SET ROLE authenticated;
DO $p1u$
DECLARE v_msg text;
BEGIN
  BEGIN
    PERFORM public.lifecycle_transition('lcenf_doc','00000000-0000-4500-c000-000000000002','approve',
             '00000000-0000-4500-a000-00000000000a'::uuid,NULL,'x');
    PERFORM lcenf_assert('P1.10','an unauthenticated call is rejected', false, 'transition SUCCEEDED');
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    PERFORM lcenf_assert('P1.10','an unauthenticated call is rejected',
                         v_msg LIKE 'LIFECYCLE_NOT_AUTHENTICATED%', v_msg);
  END;
END $p1u$;
RESET ROLE;


-- =====================================================================
--  PART 2 — required_role
-- =====================================================================
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4500-b000-000000000003","role":"authenticated"}',false);
SET ROLE authenticated;
DO $p2$
DECLARE v_msg text;
BEGIN
  BEGIN
    PERFORM public.lifecycle_transition('lcenf_doc','00000000-0000-4500-c000-000000000002','approve',
             '00000000-0000-4500-a000-00000000000a'::uuid,NULL,'looks fine');
    PERFORM lcenf_assert('P2.1','content_creator cannot approve', false, 'transition SUCCEEDED');
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    PERFORM lcenf_assert('P2.1','content_creator cannot approve', v_msg LIKE 'LIFECYCLE_ROLE_REQUIRED%', v_msg);
    PERFORM lcenf_assert('P2.2','the error names both the required roles and the caller''s',
      v_msg LIKE '%admin or compliance_officer%' AND v_msg LIKE '%content_creator%', v_msg);
  END;

  BEGIN
    PERFORM public.lifecycle_transition('lcenf_doc','00000000-0000-4500-c000-000000000002','reject',
             '00000000-0000-4500-a000-00000000000a'::uuid);
    PERFORM lcenf_assert('P2.3','content_creator cannot reject (admin only)', false, 'transition SUCCEEDED');
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    PERFORM lcenf_assert('P2.3','content_creator cannot reject (admin only)', v_msg LIKE 'LIFECYCLE_ROLE_REQUIRED%', v_msg);
  END;
END $p2$;
RESET ROLE;

-- the compliance_officer is the second entry in the comma-separated list
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4500-b000-000000000002","role":"authenticated"}',false);
SET ROLE authenticated;
DO $p2b$
DECLARE r jsonb; v_msg text;
BEGIN
  BEGIN
    r := public.lifecycle_transition('lcenf_doc','00000000-0000-4500-c000-000000000002','approve',
          '00000000-0000-4500-a000-00000000000a'::uuid,NULL,'reviewed and approved');
    PERFORM lcenf_assert('P2.4','compliance_officer CAN approve (comma list honoured)',
                         r->>'to_state'='approved', 'to '||coalesce(r->>'to_state','NULL'));
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    PERFORM lcenf_assert('P2.4','compliance_officer CAN approve (comma list honoured)', false, v_msg);
  END;
END $p2b$;
RESET ROLE;


-- =====================================================================
--  PART 3 — requires_comment
-- =====================================================================
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4500-b000-000000000001","role":"authenticated"}',false);
SET ROLE authenticated;
DO $p3$
DECLARE v_msg text; v_state text; r jsonb;
BEGIN
  BEGIN
    PERFORM public.lifecycle_transition('lcenf_doc','00000000-0000-4500-c000-000000000003','approve',
             '00000000-0000-4500-a000-00000000000a'::uuid);
    PERFORM lcenf_assert('P3.1','approve without a comment is rejected', false, 'transition SUCCEEDED');
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    PERFORM lcenf_assert('P3.1','approve without a comment is rejected', v_msg LIKE 'LIFECYCLE_COMMENT_REQUIRED%', v_msg);
  END;

  BEGIN
    PERFORM public.lifecycle_transition('lcenf_doc','00000000-0000-4500-c000-000000000003','approve',
             '00000000-0000-4500-a000-00000000000a'::uuid,NULL,'   ');
    PERFORM lcenf_assert('P3.2','a whitespace-only comment is rejected', false, 'transition SUCCEEDED');
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    PERFORM lcenf_assert('P3.2','a whitespace-only comment is rejected', v_msg LIKE 'LIFECYCLE_COMMENT_REQUIRED%', v_msg);
  END;

  SELECT s.state_key INTO v_state FROM public.entity_current_state ecs
    JOIN public.lifecycle_states s ON s.id=ecs.state_id
   WHERE ecs.entity_id='00000000-0000-4500-c000-000000000003';
  PERFORM lcenf_assert('P3.3','the rejected approvals changed nothing', v_state='in_review', coalesce(v_state,'NULL'));

  r := public.lifecycle_transition('lcenf_doc','00000000-0000-4500-c000-000000000003','approve',
        '00000000-0000-4500-a000-00000000000a'::uuid,NULL,'checked against batch record');
  PERFORM lcenf_assert('P3.4','admin approves with a real comment', r->>'to_state'='approved',
                       'to '||coalesce(r->>'to_state','NULL'));
END $p3$;
RESET ROLE;


-- =====================================================================
--  PART 4 — fail-closed requirements
-- =====================================================================
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4500-b000-000000000001","role":"authenticated"}',false);
SET ROLE authenticated;
DO $p4$
DECLARE v_msg text;
BEGIN
  BEGIN
    PERFORM public.lifecycle_transition('lcenf_doc','00000000-0000-4500-c000-000000000004','sign_off',
             '00000000-0000-4500-a000-00000000000a'::uuid);
    PERFORM lcenf_assert('P4.1','a signature requirement fails closed', false, 'transition SUCCEEDED');
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    -- D02 asserted LIFECYCLE_SIGNATURE_UNSUPPORTED, because no signature
    -- subsystem existed and the engine refused outright. 20260917000000
    -- built one, so the refusal is now LIFECYCLE_SIGNATURE_REQUIRED: the
    -- caller must supply a signature rather than being told the feature
    -- does not exist. The property under test is unchanged and still
    -- holds — an unsigned attempt does not transition — so both codes
    -- are accepted here and the suite passes before and after.
    PERFORM lcenf_assert('P4.1','a signature requirement fails closed',
                         v_msg LIKE 'LIFECYCLE_SIGNATURE_UNSUPPORTED%'
                      OR v_msg LIKE 'LIFECYCLE_SIGNATURE_REQUIRED%', v_msg);
  END;

  BEGIN
    PERFORM public.lifecycle_transition('lcenf_doc','00000000-0000-4500-c000-000000000004','escalate',
             '00000000-0000-4500-a000-00000000000a'::uuid);
    PERFORM lcenf_assert('P4.2','a permission requirement fails closed', false, 'transition SUCCEEDED');
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    PERFORM lcenf_assert('P4.2','a permission requirement fails closed',
                         v_msg LIKE 'LIFECYCLE_PERMISSION_UNSUPPORTED%', v_msg);
  END;
END $p4$;
RESET ROLE;

-- and service_role must NOT be able to bypass either of them
SET ROLE service_role;
DO $p4s$
DECLARE v_msg text;
BEGIN
  BEGIN
    PERFORM public.lifecycle_transition('lcenf_doc','00000000-0000-4500-c000-000000000004','sign_off',
             '00000000-0000-4500-a000-00000000000a'::uuid,'00000000-0000-4500-b000-000000000001'::uuid);
    PERFORM lcenf_assert('P4.3','service_role cannot bypass the signature requirement', false, 'transition SUCCEEDED');
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    -- see P4.1 on the code change; the point of this case is that the
    -- service context gets no exemption, which is still true
    PERFORM lcenf_assert('P4.3','service_role cannot bypass the signature requirement',
                         v_msg LIKE 'LIFECYCLE_SIGNATURE_UNSUPPORTED%'
                      OR v_msg LIKE 'LIFECYCLE_SIGNATURE_REQUIRED%', v_msg);
  END;

  BEGIN
    PERFORM public.lifecycle_transition('lcenf_doc','00000000-0000-4500-c000-000000000004','escalate',
             '00000000-0000-4500-a000-00000000000a'::uuid,'00000000-0000-4500-b000-000000000001'::uuid);
    PERFORM lcenf_assert('P4.4','service_role cannot bypass the permission requirement', false, 'transition SUCCEEDED');
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    PERFORM lcenf_assert('P4.4','service_role cannot bypass the permission requirement',
                         v_msg LIKE 'LIFECYCLE_PERMISSION_UNSUPPORTED%', v_msg);
  END;
END $p4s$;
RESET ROLE;


-- =====================================================================
--  PART 5 — available_actions reports what the caller may actually do
-- =====================================================================
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4500-b000-000000000003","role":"authenticated"}',false);
SET ROLE authenticated;
DO $p5$
DECLARE v_appr record; v_sign record; v_esc record; n int;
BEGIN
  SELECT * INTO v_appr FROM public.lifecycle_available_actions(
    'lcenf_doc','00000000-0000-4500-c000-000000000005','00000000-0000-4500-a000-00000000000a')
   WHERE action_key='approve';
  SELECT * INTO v_sign FROM public.lifecycle_available_actions(
    'lcenf_doc','00000000-0000-4500-c000-000000000005','00000000-0000-4500-a000-00000000000a')
   WHERE action_key='sign_off';
  SELECT * INTO v_esc FROM public.lifecycle_available_actions(
    'lcenf_doc','00000000-0000-4500-c000-000000000005','00000000-0000-4500-a000-00000000000a')
   WHERE action_key='escalate';
  SELECT count(*) INTO n FROM public.lifecycle_available_actions(
    'lcenf_doc','00000000-0000-4500-c000-000000000005','00000000-0000-4500-a000-00000000000a');

  PERFORM lcenf_assert('P5.1','all four in_review actions are still listed', n=4, n||' action(s)');
  PERFORM lcenf_assert('P5.2','approve is marked not permitted for a content_creator',
    v_appr.is_permitted = false AND v_appr.blocked_reason='LIFECYCLE_ROLE_REQUIRED', coalesce(v_appr.blocked_reason,'NULL'));
  -- Before 20260917000000 this action was reported BLOCKED, because a
  -- signature could not be produced at all. Now it is reported as
  -- available with requires_signature set, so the UI can prompt for one
  -- instead of hiding the action. What must not regress is that the
  -- requirement is still surfaced rather than silently dropped.
  PERFORM lcenf_assert('P5.3','sign_off still surfaces its signature requirement',
    v_sign.requires_signature = true
    AND (v_sign.is_permitted = true OR v_sign.blocked_reason='LIFECYCLE_SIGNATURE_UNSUPPORTED'),
    'requires_signature='||coalesce(v_sign.requires_signature::text,'NULL')
      ||' blocked='||coalesce(v_sign.blocked_reason,'none'));
  PERFORM lcenf_assert('P5.4','escalate is marked blocked by the permission gap',
    v_esc.is_permitted = false AND v_esc.blocked_reason='LIFECYCLE_PERMISSION_UNSUPPORTED', coalesce(v_esc.blocked_reason,'NULL'));
END $p5$;
RESET ROLE;

SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4500-b000-000000000002","role":"authenticated"}',false);
SET ROLE authenticated;
DO $p5b$
DECLARE v_appr record; v_rej record;
BEGIN
  SELECT * INTO v_appr FROM public.lifecycle_available_actions(
    'lcenf_doc','00000000-0000-4500-c000-000000000005','00000000-0000-4500-a000-00000000000a')
   WHERE action_key='approve';
  SELECT * INTO v_rej FROM public.lifecycle_available_actions(
    'lcenf_doc','00000000-0000-4500-c000-000000000005','00000000-0000-4500-a000-00000000000a')
   WHERE action_key='reject';

  PERFORM lcenf_assert('P5.5','approve IS permitted for a compliance_officer',
    v_appr.is_permitted = true AND v_appr.blocked_reason IS NULL, coalesce(v_appr.blocked_reason,'<null>'));
  PERFORM lcenf_assert('P5.6','a mandatory comment does not block the action',
    v_appr.requires_comment = true AND v_appr.is_permitted = true, 'requires_comment='||v_appr.requires_comment);
  PERFORM lcenf_assert('P5.7','reject stays blocked (admin only)',
    v_rej.is_permitted = false AND v_rej.blocked_reason='LIFECYCLE_ROLE_REQUIRED', coalesce(v_rej.blocked_reason,'NULL'));
END $p5b$;
RESET ROLE;

-- a member of another tenant sees nothing at all
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4500-b000-000000000004","role":"authenticated"}',false);
SET ROLE authenticated;
DO $p5c$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.lifecycle_available_actions(
    'lcenf_doc','00000000-0000-4500-c000-000000000005','00000000-0000-4500-a000-00000000000a');
  PERFORM lcenf_assert('P5.8','another tenant sees no available actions', n=0, n||' action(s)');
END $p5c$;
RESET ROLE;


-- =====================================================================
--  PART 6 — service context
-- =====================================================================
SET ROLE service_role;
DO $p6$
DECLARE r jsonb; v_actor uuid;
BEGIN
  -- acts on behalf of the content_creator, on an action requiring admin
  r := public.lifecycle_transition('lcenf_doc','00000000-0000-4500-c000-000000000005','reject',
        '00000000-0000-4500-a000-00000000000a'::uuid,'00000000-0000-4500-b000-000000000003'::uuid);
  SELECT actor_id INTO v_actor FROM public.entity_state_history
   WHERE entity_id='00000000-0000-4500-c000-000000000005' ORDER BY created_at DESC LIMIT 1;

  PERFORM lcenf_assert('P6.1','service_role is exempt from required_role', r->>'to_state'='rejected',
                       'to '||coalesce(r->>'to_state','NULL'));
  PERFORM lcenf_assert('P6.2','service_role may attribute to a named actor',
                       v_actor='00000000-0000-4500-b000-000000000003', coalesce(v_actor::text,'NULL'));
EXCEPTION WHEN others THEN
  PERFORM lcenf_assert('P6.1','service_role is exempt from required_role', false, SQLERRM);
END $p6$;
RESET ROLE;
SELECT set_config('request.jwt.claims','',false);


-- ── results ──────────────────────────────────────────────────────────
\echo ''
\echo '======== LIFECYCLE ENFORCEMENT — TEST RESULTS ========'
SELECT id, name, verdict, detail FROM lcenf_results ORDER BY seq;
\echo ''
SELECT verdict, count(*) FROM lcenf_results GROUP BY verdict ORDER BY verdict;

-- ── cleanup ──────────────────────────────────────────────────────────
DO $cleanup$
BEGIN
  DELETE FROM public.entity_state_history WHERE entity_id::text LIKE '00000000-0000-4500-c000-%';
  DELETE FROM public.entity_current_state WHERE entity_id::text LIKE '00000000-0000-4500-c000-%';
  DELETE FROM public.lifecycle_definitions WHERE entity_type='lcenf_doc';
  DELETE FROM public.company_members WHERE user_id::text LIKE '00000000-0000-4500-b000-%';
  DELETE FROM public.profiles  WHERE email LIKE 'lcenf-%@local.test';
  DELETE FROM auth.users       WHERE email LIKE 'lcenf-%@local.test';
  DELETE FROM public.companies WHERE name LIKE 'LCENF%';
  RAISE NOTICE 'lcenf fixtures removed.';
EXCEPTION WHEN others THEN
  RAISE WARNING 'CLEANUP INCOMPLETE (%). Remove lcenf rows manually.', SQLERRM;
END $cleanup$;

DROP FUNCTION IF EXISTS lcenf_assert(text,text,boolean,text);
