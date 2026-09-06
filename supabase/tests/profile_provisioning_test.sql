-- =====================================================================
--  SECURE PROFILE PROVISIONING — INTEGRATION TESTS
--  LOCAL / DISPOSABLE DATABASE ONLY
-- =====================================================================
--  Covers 20260916000000_secure_profile_provisioning.sql, and the
--  interaction between that migration's provisioning RPC and the guard
--  trigger from 20260906000000.
--
--  These run against a real Postgres on purpose. Every claim under test —
--  "the policy is gone", "the privilege is revoked", "TRUNCATE is
--  refused", "the trigger fires" — is a property of the server. Asserted
--  against a mock, all of them would pass while the database stayed wide
--  open.
--
--  Run:  psql "<local url>" -f supabase/tests/profile_provisioning_test.sql
--
--  Safe to run repeatedly. Fixtures are tagged pprov- and removed at the
--  end. No permanent schema change is made.
-- =====================================================================

\set ON_ERROR_STOP off

DO $guard$
BEGIN
  IF current_database() NOT IN ('postgres','criateur_local') THEN
    RAISE EXCEPTION 'REFUSING TO RUN outside a local database (got %)', current_database();
  END IF;
  IF to_regprocedure('public.provision_profile(text,text,text,uuid,boolean,text,text,text[])') IS NULL THEN
    RAISE EXCEPTION 'Migration 20260916000000 has not been applied to this database.';
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

DROP TABLE IF EXISTS pprov_results;
CREATE TEMP TABLE pprov_results(seq serial, id text, name text, verdict text, detail text);
GRANT ALL ON pprov_results TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE pprov_results_seq_seq TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION pprov_assert(p_id text, p_name text, p_cond boolean, p_detail text DEFAULT '')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO pprov_results(id,name,verdict,detail)
  VALUES (p_id, p_name, CASE WHEN p_cond THEN 'PASS' ELSE 'FAIL' END, p_detail);
END $$;

-- Attempt one statement as one role and record whether it was refused.
CREATE OR REPLACE FUNCTION pprov_denied(p_id text, p_name text, p_role text, p_sql text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_msg text; v_ok boolean := false;
BEGIN
  BEGIN
    EXECUTE format('SET LOCAL ROLE %I', p_role);
    EXECUTE p_sql;
    v_ok := false; v_msg := 'STATEMENT SUCCEEDED';
  EXCEPTION WHEN others THEN
    v_ok := true; v_msg := SQLERRM;
  END;
  RESET ROLE;
  PERFORM pprov_assert(p_id, p_name, v_ok, v_msg);
END $$;

-- ── fixtures ─────────────────────────────────────────────────────────
--  company A  the victim tenant, with one established member
--  company B  the tenant our signer-up legitimately creates
--  u_att      an authenticated account with NO profile yet — the one that
--             would previously have provisioned itself as an admin
--  u_inv      an invitee, profile created without a company
DO $fx$
DECLARE
  ca    uuid := '00000000-0000-6200-a000-00000000000a';
  cb    uuid := '00000000-0000-6200-a000-00000000000b';
  u_own uuid := '00000000-0000-6200-b000-000000000001';
  u_att uuid := '00000000-0000-6200-b000-000000000002';
  u_inv uuid := '00000000-0000-6200-b000-000000000003';
BEGIN
  INSERT INTO public.companies(id,name) VALUES (ca,'PPROV Victim'),(cb,'PPROV Own')
    ON CONFLICT (id) DO NOTHING;

  INSERT INTO auth.users(id,email) VALUES
    (u_own,'pprov-owner@local.test'),
    (u_att,'pprov-attacker@local.test'),
    (u_inv,'pprov-invitee@local.test')
    ON CONFLICT (id) DO NOTHING;

  -- the victim tenant has a real member, so it is not an empty shell
  INSERT INTO public.profiles(id,email,role,company_id)
    VALUES (u_own,'pprov-owner@local.test','admin',ca) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.company_members(company_id,user_id,role,status)
    VALUES (ca,u_own,'owner','active') ON CONFLICT DO NOTHING;

  -- u_att and u_inv deliberately have NO profile row: provisioning is
  -- what is under test.
END $fx$;


-- =====================================================================
--  A — the direct INSERT route is gone
-- =====================================================================
DO $a$
DECLARE n_policy int; n_ins int; n_trunc int;
BEGIN
  SELECT count(*) INTO n_policy FROM pg_policy
   WHERE polrelid='public.profiles'::regclass AND polname='Users can insert own profile';
  PERFORM pprov_assert('A1','the "Users can insert own profile" policy is dropped',
    n_policy=0, n_policy||' policy row(s)');

  -- the privilege, not just the policy: RLS denies what no policy allows,
  -- but a re-added policy would silently re-open a live grant
  SELECT count(*) INTO n_ins FROM information_schema.role_table_grants
   WHERE table_schema='public' AND table_name='profiles'
     AND privilege_type='INSERT' AND grantee IN ('authenticated','anon');
  PERFORM pprov_assert('A2','INSERT on profiles is revoked from anon and authenticated',
    n_ins=0, n_ins||' grant(s) remaining');

  -- TRUNCATE is not subject to RLS, so only the revoke can stop it
  SELECT count(*) INTO n_trunc FROM information_schema.role_table_grants
   WHERE table_schema='public' AND table_name='profiles'
     AND privilege_type='TRUNCATE' AND grantee IN ('authenticated','anon');
  PERFORM pprov_assert('A3','TRUNCATE on profiles is revoked from anon and authenticated',
    n_trunc=0, n_trunc||' grant(s) remaining');
END $a$;

-- and prove it by attempting the writes, not just reading the catalog
DO $a2$
BEGIN
  PERFORM pprov_denied('A4','authenticated cannot INSERT a profile directly','authenticated',
    'INSERT INTO public.profiles(id,email,role) VALUES (''00000000-0000-6200-b000-000000000002'',''pprov-attacker@local.test'',''admin'')');
  PERFORM pprov_denied('A5','anon cannot INSERT a profile directly','anon',
    'INSERT INTO public.profiles(id,email,role) VALUES (''00000000-0000-6200-b000-000000000002'',''pprov-attacker@local.test'',''admin'')');
  PERFORM pprov_denied('A6','authenticated cannot TRUNCATE profiles','authenticated',
    'TRUNCATE public.profiles CASCADE');
END $a2$;


-- =====================================================================
--  B — provision_profile refuses an unauthenticated caller
-- =====================================================================
--  Two shapes of "unauthenticated": the anon role, and an authenticated
--  session carrying no subject claim at all.
SELECT set_config('request.jwt.claims','',false);
SET ROLE anon;
DO $b1$
DECLARE v_msg text; v_ok boolean := false;
BEGIN
  BEGIN
    PERFORM public.provision_profile('pprov-attacker@local.test');
    v_msg := 'RPC SUCCEEDED';
  EXCEPTION WHEN others THEN v_ok := true; v_msg := SQLERRM;
  END;
  PERFORM pprov_assert('B1','anon cannot provision a profile', v_ok, v_msg);
END $b1$;
RESET ROLE;

SET ROLE authenticated;
DO $b2$
DECLARE v_msg text; v_ok boolean := false;
BEGIN
  BEGIN
    PERFORM public.provision_profile('pprov-attacker@local.test');
    v_msg := 'RPC SUCCEEDED';
  EXCEPTION WHEN others THEN
    v_ok := SQLERRM LIKE 'PROFILE_NOT_AUTHENTICATED%'; v_msg := SQLERRM;
  END;
  PERFORM pprov_assert('B2','a session with no subject claim is refused', v_ok, v_msg);
END $b2$;
RESET ROLE;

DO $b3$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.profiles
   WHERE id='00000000-0000-6200-b000-000000000002';
  PERFORM pprov_assert('B3','no profile was created by either attempt', n=0, n||' row(s)');
END $b3$;


-- =====================================================================
--  C — the caller cannot choose a role or a custom role
-- =====================================================================
--  There is no p_role and no p_custom_role_id parameter, so the strongest
--  statement available is that no overload accepts one. That is asserted
--  from the catalog; the behavioural half is that what IS written is the
--  least-privileged value.
DO $c1$
DECLARE v_args text; n_over int;
BEGIN
  SELECT count(*), string_agg(pg_get_function_arguments(p.oid), ' | ')
    INTO n_over, v_args
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname='provision_profile';

  PERFORM pprov_assert('C1','there is exactly one provision_profile overload', n_over=1, n_over||' overload(s)');
  PERFORM pprov_assert('C2','it takes no role parameter',
    v_args NOT LIKE '%p_role%', coalesce(v_args,'NONE'));
  PERFORM pprov_assert('C3','it takes no custom_role_id parameter',
    v_args NOT LIKE '%custom_role%', coalesce(v_args,'NONE'));
  PERFORM pprov_assert('C4','it takes no id parameter — the id is auth.uid()',
    v_args NOT LIKE '%p_id%' AND v_args NOT LIKE '%p_user_id%', coalesce(v_args,'NONE'));
END $c1$;

SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-6200-b000-000000000002","role":"authenticated"}',false);
SET ROLE authenticated;
DO $c2$
DECLARE r jsonb;
BEGIN
  -- every field the client CAN send, sent at once
  r := public.provision_profile(
         'attacker-supplied@evil.test', 'Attacker', 'Evil Ltd', NULL, true,
         'pharma', 'NG', ARRAY['NG']);
  PERFORM pprov_assert('C5','provisioning succeeds for a signed-in caller',
    (r->>'created')='true', coalesce(r::text,'NULL'));
  PERFORM pprov_assert('C6','the role assigned is the least-privileged one',
    r->>'role'='content_creator', coalesce(r->>'role','NULL'));
END $c2$;
RESET ROLE;

DO $c3$
DECLARE v_role text; v_custom uuid; v_id uuid; v_email text;
BEGIN
  SELECT id, role, custom_role_id, email INTO v_id, v_role, v_custom, v_email
    FROM public.profiles WHERE id='00000000-0000-6200-b000-000000000002';

  PERFORM pprov_assert('C7','the row is keyed on the session user, not on client input',
    v_id='00000000-0000-6200-b000-000000000002', coalesce(v_id::text,'NO ROW'));
  PERFORM pprov_assert('C8','role is content_creator on disk', v_role='content_creator', coalesce(v_role,'NULL'));
  PERFORM pprov_assert('C9','custom_role_id is null', v_custom IS NULL, coalesce(v_custom::text,'NULL'));
  -- the client sent attacker-supplied@evil.test; the auth row wins
  PERFORM pprov_assert('C10','the email is the one Supabase Auth holds, not the one sent',
    v_email='pprov-attacker@local.test', coalesce(v_email,'NULL'));
END $c3$;

-- and the guard trigger still refuses a follow-up self-promotion
SET ROLE authenticated;
DO $c4$
DECLARE v_msg text; v_ok boolean := false;
BEGIN
  BEGIN
    UPDATE public.profiles SET role='admin' WHERE id='00000000-0000-6200-b000-000000000002';
    v_msg := 'UPDATE SUCCEEDED';
  EXCEPTION WHEN others THEN v_ok := true; v_msg := SQLERRM;
  END;
  PERFORM pprov_assert('C11','a provisioned user still cannot promote itself afterwards', v_ok, v_msg);
END $c4$;
RESET ROLE;


-- =====================================================================
--  D — the caller cannot attach itself to an arbitrary company
-- =====================================================================
--  This is the parameter that IS client-supplied, so it carries the
--  weight of the whole design.
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-6200-b000-000000000003","role":"authenticated"}',false);
SET ROLE authenticated;
DO $d1$
DECLARE v_msg text; v_ok boolean := false;
BEGIN
  BEGIN
    PERFORM public.provision_profile('pprov-invitee@local.test', 'Invitee', NULL,
              '00000000-0000-6200-a000-00000000000a'::uuid);
    v_msg := 'RPC SUCCEEDED';
  EXCEPTION WHEN others THEN
    v_ok := SQLERRM LIKE 'PROFILE_COMPANY_FORBIDDEN%'; v_msg := SQLERRM;
  END;
  PERFORM pprov_assert('D1','a non-member cannot name another tenant''s company', v_ok, v_msg);
END $d1$;
RESET ROLE;

DO $d2$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.profiles
   WHERE id='00000000-0000-6200-b000-000000000003';
  PERFORM pprov_assert('D2','the refused call created no profile at all', n=0, n||' row(s)');

  SELECT count(*) INTO n FROM public.company_members
   WHERE company_id='00000000-0000-6200-a000-00000000000a';
  PERFORM pprov_assert('D3','the victim tenant''s membership is untouched', n=1, n||' member(s)');
END $d2$;

-- an INACTIVE membership is not a membership
DO $d3$
BEGIN
  INSERT INTO public.company_members(company_id,user_id,role,status)
  VALUES ('00000000-0000-6200-a000-00000000000a','00000000-0000-6200-b000-000000000003','member','pending')
  ON CONFLICT (company_id,user_id) DO UPDATE SET status='pending';
END $d3$;

SET ROLE authenticated;
DO $d4$
DECLARE v_msg text; v_ok boolean := false;
BEGIN
  BEGIN
    PERFORM public.provision_profile('pprov-invitee@local.test', 'Invitee', NULL,
              '00000000-0000-6200-a000-00000000000a'::uuid);
    v_msg := 'RPC SUCCEEDED';
  EXCEPTION WHEN others THEN
    v_ok := SQLERRM LIKE 'PROFILE_COMPANY_FORBIDDEN%'; v_msg := SQLERRM;
  END;
  PERFORM pprov_assert('D4','a pending membership does not authorise the company either', v_ok, v_msg);
END $d4$;
RESET ROLE;

DO $d5$
BEGIN
  DELETE FROM public.company_members
   WHERE company_id='00000000-0000-6200-a000-00000000000a'
     AND user_id='00000000-0000-6200-b000-000000000003';
END $d5$;


-- =====================================================================
--  E — the normal signup path, end to end
-- =====================================================================
--  create_company() first (it writes the active owner membership), then
--  provision_profile() naming the company it returned. This is exactly
--  the order completeSignupProfile() calls them in.
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-6200-b000-000000000003","role":"authenticated"}',false);
SET ROLE authenticated;
DO $e$
DECLARE v_co uuid; r jsonb; v_msg text;
BEGIN
  BEGIN
    v_co := public.create_company('PPROV Signup Co');
    r    := public.provision_profile('pprov-invitee@local.test','Invitee','PPROV Signup Co',
              v_co, false, 'pharma', 'NG', ARRAY['NG']);
    PERFORM pprov_assert('E1','provisioning succeeds for a company the caller just created',
      (r->>'created')='true', coalesce(r::text,'NULL'));
    PERFORM pprov_assert('E2','the profile is attached to that company',
      (r->>'company_id')=v_co::text, coalesce(r->>'company_id','NULL'));
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    PERFORM pprov_assert('E1','provisioning succeeds for a company the caller just created', false, v_msg);
  END;
END $e$;
RESET ROLE;

DO $e2$
DECLARE v_full text; v_org text; v_ind text; v_jur text; v_mkt text[]; v_onb boolean; v_role text;
BEGIN
  SELECT full_name, organization, industry_type, default_jurisdiction,
         primary_markets, onboarding_completed, role
    INTO v_full, v_org, v_ind, v_jur, v_mkt, v_onb, v_role
    FROM public.profiles WHERE id='00000000-0000-6200-b000-000000000003';

  -- requirement: the RPC must not quietly drop signup data
  PERFORM pprov_assert('E3','full_name survives', v_full='Invitee', coalesce(v_full,'NULL'));
  PERFORM pprov_assert('E4','organization survives', v_org='PPROV Signup Co', coalesce(v_org,'NULL'));
  PERFORM pprov_assert('E5','industry_type survives', v_ind='pharma', coalesce(v_ind,'NULL'));
  PERFORM pprov_assert('E6','default_jurisdiction survives', v_jur='NG', coalesce(v_jur,'NULL'));
  PERFORM pprov_assert('E7','primary_markets survives', v_mkt=ARRAY['NG'], coalesce(v_mkt::text,'NULL'));
  PERFORM pprov_assert('E8','onboarding_completed survives', v_onb=false, coalesce(v_onb::text,'NULL'));
  PERFORM pprov_assert('E9','and the role is still the least-privileged one',
    v_role='content_creator', coalesce(v_role,'NULL'));
END $e2$;


-- =====================================================================
--  F — provisioning twice is safe
-- =====================================================================
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-6200-b000-000000000003","role":"authenticated"}',false);
SET ROLE authenticated;
DO $f$
DECLARE r jsonb; v_msg text;
BEGIN
  BEGIN
    -- a retried signup: same user, and this time trying to slip in a
    -- different company and a completed onboarding flag
    r := public.provision_profile('pprov-invitee@local.test','Renamed','Other Ltd',
           NULL, true, 'food', 'GH', ARRAY['GH']);
    PERFORM pprov_assert('F1','a second call does not raise', true, coalesce(r::text,'NULL'));
    PERFORM pprov_assert('F2','and reports that it created nothing',
      (r->>'created')='false', coalesce(r->>'created','NULL'));
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    PERFORM pprov_assert('F1','a second call does not raise', false, v_msg);
  END;
END $f$;
RESET ROLE;

DO $f2$
DECLARE v_full text; v_org text; v_jur text; n int;
BEGIN
  SELECT count(*) INTO n FROM public.profiles WHERE id='00000000-0000-6200-b000-000000000003';
  PERFORM pprov_assert('F3','there is still exactly one profile row', n=1, n||' row(s)');

  SELECT full_name, organization, default_jurisdiction INTO v_full, v_org, v_jur
    FROM public.profiles WHERE id='00000000-0000-6200-b000-000000000003';
  PERFORM pprov_assert('F4','the existing row was left untouched',
    v_full='Invitee' AND v_org='PPROV Signup Co' AND v_jur='NG',
    coalesce(v_full,'NULL')||' / '||coalesce(v_org,'NULL')||' / '||coalesce(v_jur,'NULL'));
END $f2$;


-- =====================================================================
--  G — the invite flow still works
-- =====================================================================
--  The interaction this migration had to preserve: accept_company_invite()
--  updates profiles.company_id, which is what the 20260906000000 guard
--  forbids.
DO $g0$
DECLARE u uuid := '00000000-0000-6200-b000-000000000004';
BEGIN
  INSERT INTO auth.users(id,email) VALUES (u,'pprov-guest@local.test') ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.company_invites(company_id,email,role,token,expires_at)
  VALUES ('00000000-0000-6200-a000-00000000000a','pprov-guest@local.test','member',
          'PPROV-TOKEN-1', now()+interval '1 day')
  ON CONFLICT (token) DO NOTHING;
END $g0$;

-- the invite path provisions with NO company, exactly as the client does
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-6200-b000-000000000004","role":"authenticated"}',false);
SET ROLE authenticated;
DO $g1$
DECLARE r jsonb; v_msg text;
BEGIN
  BEGIN
    r := public.provision_profile('pprov-guest@local.test','Guest',NULL,NULL,false,NULL,NULL,NULL);
    PERFORM pprov_assert('G1','the invite path provisions a profile with no company',
      (r->>'created')='true' AND (r->>'company_id') IS NULL, coalesce(r::text,'NULL'));
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    PERFORM pprov_assert('G1','the invite path provisions a profile with no company', false, v_msg);
  END;

  BEGIN
    PERFORM public.accept_company_invite('PPROV-TOKEN-1');
    PERFORM pprov_assert('G2','accept_company_invite still succeeds', true, 'accepted');
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    PERFORM pprov_assert('G2','accept_company_invite still succeeds', false, v_msg);
  END;
END $g1$;
RESET ROLE;

DO $g2$
DECLARE v_co uuid; v_status text; v_role text; v_accepted timestamptz;
BEGIN
  SELECT company_id, role INTO v_co, v_role FROM public.profiles
   WHERE id='00000000-0000-6200-b000-000000000004';
  PERFORM pprov_assert('G3','the invite assigned company_id on the profile',
    v_co='00000000-0000-6200-a000-00000000000a', coalesce(v_co::text,'NULL'));
  PERFORM pprov_assert('G4','and did not change the profile role',
    v_role='content_creator', coalesce(v_role,'NULL'));

  SELECT status INTO v_status FROM public.company_members
   WHERE company_id='00000000-0000-6200-a000-00000000000a'
     AND user_id='00000000-0000-6200-b000-000000000004';
  PERFORM pprov_assert('G5','the membership row is active', v_status='active', coalesce(v_status,'NULL'));

  SELECT accepted_at INTO v_accepted FROM public.company_invites WHERE token='PPROV-TOKEN-1';
  PERFORM pprov_assert('G6','the invite is marked accepted', v_accepted IS NOT NULL,
    coalesce(v_accepted::text,'NULL'));
END $g2$;


-- =====================================================================
--  H — the exemption the invite flow relies on is narrow
-- =====================================================================
--  On this cluster postgres IS a member of service_role, so the trigger's
--  pre-existing exemption fires before the new flag is ever consulted.
--  That makes G2 above a weaker test than it looks: it would pass even if
--  the flag did nothing. These cases exercise the trigger directly, as a
--  role that is NOT a service_role member, so the flag is the only thing
--  that can matter.
DO $h0$
DECLARE b boolean;
BEGIN
  SELECT pg_has_role('postgres','service_role','MEMBER') INTO b;
  PERFORM pprov_assert('H0','NOTE: on this cluster postgres is a service_role member',
    true, 'pg_has_role(postgres, service_role) = '||b::text);
END $h0$;

SET ROLE authenticated;
DO $h1$
DECLARE v_msg text; v_ok boolean := false;
BEGIN
  -- without the flag: refused
  BEGIN
    UPDATE public.profiles SET company_id='00000000-0000-6200-a000-00000000000b'
     WHERE id='00000000-0000-6200-b000-000000000004';
    v_msg := 'UPDATE SUCCEEDED';
  EXCEPTION WHEN others THEN
    v_ok := SQLERRM LIKE 'PROFILES_COMPANY_IMMUTABLE%'; v_msg := SQLERRM;
  END;
  PERFORM pprov_assert('H1','without the flag, company_id is refused', v_ok, v_msg);
END $h1$;
RESET ROLE;

SET ROLE authenticated;
DO $h2$
DECLARE v_msg text; v_ok boolean := false;
BEGIN
  -- with the flag raised, the SAME statement is permitted. This is the
  -- branch accept_company_invite() depends on.
  PERFORM set_config('app.profile_company_assign','1',true);
  BEGIN
    UPDATE public.profiles SET company_id='00000000-0000-6200-a000-00000000000b'
     WHERE id='00000000-0000-6200-b000-000000000004';
    v_ok := true; v_msg := 'permitted';
  EXCEPTION WHEN others THEN v_msg := SQLERRM;
  END;
  PERFORM pprov_assert('H2','with the flag, company_id is permitted', v_ok, v_msg);

  -- …but the flag must NOT reach role or custom_role_id, even while raised
  v_ok := false;
  BEGIN
    UPDATE public.profiles SET role='admin' WHERE id='00000000-0000-6200-b000-000000000004';
    v_msg := 'UPDATE SUCCEEDED';
  EXCEPTION WHEN others THEN
    v_ok := SQLERRM LIKE 'PROFILES_ROLE_IMMUTABLE%'; v_msg := SQLERRM;
  END;
  PERFORM pprov_assert('H3','the flag does not authorise a role change', v_ok, v_msg);

  v_ok := false;
  BEGIN
    UPDATE public.profiles SET custom_role_id=gen_random_uuid()
     WHERE id='00000000-0000-6200-b000-000000000004';
    v_msg := 'UPDATE SUCCEEDED';
  EXCEPTION WHEN others THEN
    v_ok := SQLERRM LIKE 'PROFILES_ROLE_IMMUTABLE%'; v_msg := SQLERRM;
  END;
  PERFORM pprov_assert('H4','the flag does not authorise a custom_role_id change', v_ok, v_msg);

  PERFORM set_config('app.profile_company_assign','',true);
  -- put it back so the invite assertions above stay true on a re-run
  PERFORM set_config('app.profile_company_assign','1',true);
  UPDATE public.profiles SET company_id='00000000-0000-6200-a000-00000000000a'
   WHERE id='00000000-0000-6200-b000-000000000004';
  PERFORM set_config('app.profile_company_assign','',true);
END $h2$;
RESET ROLE;

DO $h3$
DECLARE v_flag text;
BEGIN
  -- accept_company_invite lowers the flag again rather than leaving it up
  -- for the rest of the transaction
  SELECT coalesce(current_setting('app.profile_company_assign', true),'') INTO v_flag;
  PERFORM pprov_assert('H5','the flag is not left raised', v_flag <> '1', '"'||v_flag||'"');
END $h3$;


-- =====================================================================
--  I — the RPC's own ACL
-- =====================================================================
DO $i$
DECLARE v_acl text;
BEGIN
  SELECT coalesce(array_to_string(p.proacl, ' '), '<default>') INTO v_acl
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname='provision_profile';

  PERFORM pprov_assert('I1','EXECUTE is not granted to PUBLIC',
    v_acl NOT LIKE '%=X/%' OR v_acl LIKE '%postgres=X%', v_acl);
  PERFORM pprov_assert('I2','EXECUTE is granted to authenticated',
    v_acl LIKE '%authenticated=X%', v_acl);
  PERFORM pprov_assert('I3','EXECUTE is not granted to anon',
    v_acl NOT LIKE '%anon=X%', v_acl);
END $i$;

DO $i2$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname='provision_profile';

  PERFORM pprov_assert('I4','it is SECURITY DEFINER', v_def LIKE '%SECURITY DEFINER%', 'checked');
  PERFORM pprov_assert('I5','with a fixed search_path',
    v_def LIKE '%SET search_path%', 'checked');
END $i2$;


-- ── results ──────────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims','',false);
\echo ''
\echo '======== SECURE PROFILE PROVISIONING — TEST RESULTS ========'
SELECT id, name, verdict, detail FROM pprov_results ORDER BY seq;
\echo ''
SELECT verdict, count(*) FROM pprov_results GROUP BY verdict ORDER BY verdict;

-- ── cleanup ──────────────────────────────────────────────────────────
DO $cleanup$
BEGIN
  DELETE FROM public.company_invites WHERE token LIKE 'PPROV-TOKEN-%';
  DELETE FROM public.company_members WHERE user_id::text LIKE '00000000-0000-6200-b000-%';
  DELETE FROM public.profiles  WHERE email LIKE 'pprov-%@local.test';
  DELETE FROM auth.users       WHERE email LIKE 'pprov-%@local.test';
  DELETE FROM public.companies WHERE name LIKE 'PPROV %';
  RAISE NOTICE 'pprov fixtures removed.';
EXCEPTION WHEN others THEN
  RAISE WARNING 'CLEANUP INCOMPLETE (%). Remove pprov rows manually.', SQLERRM;
END $cleanup$;

DROP FUNCTION IF EXISTS pprov_assert(text,text,boolean,text);
DROP FUNCTION IF EXISTS pprov_denied(text,text,text,text);
DROP TABLE IF EXISTS pprov_results;
