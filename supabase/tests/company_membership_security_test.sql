-- =====================================================================
--  COMPANY MEMBERSHIP SECURITY — INTEGRATION TESTS
--  Covers 20260908000000_fix_company_membership_escalation.sql
--  LOCAL / DISPOSABLE DATABASE ONLY
-- =====================================================================
--  Three escalation routes are closed here, and each had a legitimate
--  flow running alongside it. The regression half of this suite matters
--  as much as the security half: the easiest way to "fix" these is to
--  break onboarding, so invite acceptance, invite listing and member
--  administration are all re-proven after the change.
--
--  Run:  psql "<local url>" -f supabase/tests/company_membership_security_test.sql
--
--  Safe to run repeatedly. Fixtures are tagged CMSEC / cmsec- and removed
--  at the end.
-- =====================================================================

\set ON_ERROR_STOP off

DO $guard$
BEGIN
  IF current_database() NOT IN ('postgres','criateur_local') THEN
    RAISE EXCEPTION 'REFUSING TO RUN outside a local database (got %)', current_database();
  END IF;
  IF to_regprocedure('public.create_company(text)') IS NULL THEN
    RAISE EXCEPTION 'Migration 20260908000000 has not been applied to this database.';
  END IF;
END $guard$;

DROP TABLE IF EXISTS cmsec_results;
CREATE TEMP TABLE cmsec_results(seq serial, id text, name text, verdict text, detail text);
GRANT ALL ON cmsec_results TO authenticated, anon, service_role;
GRANT USAGE, SELECT ON SEQUENCE cmsec_results_seq_seq TO authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION cmsec_assert(p_id text, p_name text, p_cond boolean, p_detail text DEFAULT '')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO cmsec_results(id,name,verdict,detail)
  VALUES (p_id, p_name, CASE WHEN p_cond THEN 'PASS' ELSE 'FAIL' END, p_detail);
END $$;

-- Somewhere for a test running as `authenticated` to hand a value to a
-- later assertion running as postgres. public.companies has RLS enabled
-- with no policies in this scaffold, and company_members' SELECT policy
-- keys off profiles.company_id, so an outsider genuinely cannot read
-- back the company they just created — that is expected, and is why the
-- verification happens outside the role rather than inside it.
DROP TABLE IF EXISTS cmsec_ctx;
CREATE TEMP TABLE cmsec_ctx(k text PRIMARY KEY, v text);
GRANT ALL ON cmsec_ctx TO authenticated, anon, service_role;

-- ── fixtures ─────────────────────────────────────────────────────────
--  An established tenant with an owner, plus an outsider and an invitee.
DO $fx$
DECLARE
  ca uuid := '00000000-0000-4900-a000-00000000000a';
  u_own uuid := '00000000-0000-4900-b000-000000000001';
  u_out uuid := '00000000-0000-4900-b000-000000000002';
  u_inv uuid := '00000000-0000-4900-b000-000000000003';
BEGIN
  INSERT INTO public.companies(id,name) VALUES (ca,'CMSEC Victim Corp') ON CONFLICT (id) DO NOTHING;

  INSERT INTO auth.users(id,email) VALUES
    (u_own,'cmsec-owner@local.test'),(u_out,'cmsec-outsider@local.test'),(u_inv,'cmsec-invitee@local.test')
    ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles(id,email,role,company_id) VALUES
    (u_own,'cmsec-owner@local.test','admin',ca),
    (u_out,'cmsec-outsider@local.test','content_creator',NULL),
    (u_inv,'cmsec-invitee@local.test','content_creator',NULL)
    ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.company_members(company_id,user_id,role,status)
  VALUES (ca,u_own,'owner','active') ON CONFLICT DO NOTHING;

  INSERT INTO public.company_invites(company_id,email,role,token,expires_at)
  VALUES (ca,'cmsec-invitee@local.test','admin','CMSEC-TOKEN-LIVE', now() + interval '7 days')
  ON CONFLICT (token) DO NOTHING;

  INSERT INTO public.company_invites(company_id,email,role,token,expires_at)
  VALUES (ca,'cmsec-expired@local.test','admin','CMSEC-TOKEN-EXPIRED', now() - interval '1 day')
  ON CONFLICT (token) DO NOTHING;
END $fx$;


-- =====================================================================
--  M1 — the table itself is no longer writable from the client
-- =====================================================================
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4900-b000-000000000002","role":"authenticated"}',false);
SET ROLE authenticated;
DO $m1$
DECLARE v_msg text;
BEGIN
  BEGIN
    INSERT INTO public.company_members(company_id,user_id,role,status)
    VALUES ('00000000-0000-4900-a000-00000000000a', auth.uid(), 'admin', 'active');
    PERFORM cmsec_assert('M1.1','authenticated cannot insert itself into a company', false, 'INSERT SUCCEEDED');
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    PERFORM cmsec_assert('M1.1','authenticated cannot insert itself into a company', true, v_msg);
  END;

  BEGIN
    TRUNCATE public.company_members;
    PERFORM cmsec_assert('M1.3','authenticated cannot TRUNCATE company_members', false, 'TRUNCATE SUCCEEDED');
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    PERFORM cmsec_assert('M1.3','authenticated cannot TRUNCATE company_members', true, v_msg);
  END;
END $m1$;
RESET ROLE;

SET ROLE anon;
DO $m1b$
DECLARE v_msg text;
BEGIN
  BEGIN
    INSERT INTO public.company_members(company_id,user_id,role,status)
    VALUES ('00000000-0000-4900-a000-00000000000a','00000000-0000-4900-b000-000000000002','admin','active');
    PERFORM cmsec_assert('M1.2','anon cannot insert into company_members', false, 'INSERT SUCCEEDED');
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    PERFORM cmsec_assert('M1.2','anon cannot insert into company_members', true, v_msg);
  END;
END $m1b$;
RESET ROLE;

DO $m1v$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.company_members
   WHERE company_id='00000000-0000-4900-a000-00000000000a';
  PERFORM cmsec_assert('M1.4','the victim company still has exactly its one real member', n=1, n||' member(s)');
END $m1v$;


-- =====================================================================
--  M2 — a company name no longer confers membership
-- =====================================================================
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4900-b000-000000000002","role":"authenticated"}',false);
SET ROLE authenticated;
DO $m2$
DECLARE v_new uuid; n_victim int;
BEGIN
  -- the outsider types the victim's exact name, differently cased
  v_new := public.create_company('cmsec victim corp');
  INSERT INTO cmsec_ctx(k,v) VALUES ('new_company', v_new::text)
    ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v;

  -- these two are the security assertions and must hold as the caller
  SELECT count(*) INTO n_victim FROM public.company_members
   WHERE user_id = auth.uid() AND company_id = '00000000-0000-4900-a000-00000000000a';
  PERFORM cmsec_assert('M2.3','the caller did NOT become a member of the existing tenant', n_victim=0, n_victim||' row(s)');

  PERFORM cmsec_assert('M2.4','app_is_company_member is false for the existing tenant',
    public.app_is_company_member('00000000-0000-4900-a000-00000000000a') = false,
    coalesce(public.app_is_company_member('00000000-0000-4900-a000-00000000000a')::text,'NULL'));
END $m2$;
RESET ROLE;

-- verified outside the role: see the note on cmsec_ctx above
DO $m2v$
DECLARE v_new uuid; n_named int; v_role text;
BEGIN
  SELECT v::uuid INTO v_new FROM cmsec_ctx WHERE k='new_company';
  SELECT count(*) INTO n_named FROM public.companies WHERE lower(name)='cmsec victim corp';
  PERFORM cmsec_assert('M2.1','create_company made a NEW company rather than joining the existing one',
                       n_named = 2 AND v_new IS NOT NULL AND v_new <> '00000000-0000-4900-a000-00000000000a',
                       n_named||' companies named that; new id '||coalesce(v_new::text,'NULL'));

  SELECT role INTO v_role FROM public.company_members
   WHERE user_id='00000000-0000-4900-b000-000000000002' AND company_id = v_new;
  PERFORM cmsec_assert('M2.2','the caller owns the company they created', v_role='owner', coalesce(v_role,'NULL'));
END $m2v$;

-- the retained delegate must be equally safe
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4900-b000-000000000003","role":"authenticated"}',false);
SET ROLE authenticated;
DO $m2b$
DECLARE v_new uuid; n_victim int;
BEGIN
  v_new := public.get_or_create_company('CMSEC Victim Corp');
  SELECT count(*) INTO n_victim FROM public.company_members
   WHERE user_id = auth.uid() AND company_id = '00000000-0000-4900-a000-00000000000a';
  PERFORM cmsec_assert('M2.5','the deprecated get_or_create_company delegate also refuses to join',
                       n_victim = 0 AND v_new <> '00000000-0000-4900-a000-00000000000a',
                       n_victim||' row(s) in the victim tenant');
END $m2b$;
RESET ROLE;

SET ROLE authenticated;
DO $m2c$
DECLARE v_msg text;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-4900-b000-000000000002","role":"authenticated"}',false);
  BEGIN
    PERFORM public.create_company('   ');
    PERFORM cmsec_assert('M2.6','a blank company name is rejected', false, 'SUCCEEDED');
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    PERFORM cmsec_assert('M2.6','a blank company name is rejected', v_msg LIKE 'COMPANY_NAME_REQUIRED%', v_msg);
  END;

  PERFORM set_config('request.jwt.claims','',false);
  BEGIN
    PERFORM public.create_company('Anonymous Co');
    PERFORM cmsec_assert('M2.7','an unauthenticated caller cannot create a company', false, 'SUCCEEDED');
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    PERFORM cmsec_assert('M2.7','an unauthenticated caller cannot create a company',
                         v_msg LIKE 'COMPANY_NOT_AUTHENTICATED%', v_msg);
  END;
END $m2c$;
RESET ROLE;


-- =====================================================================
--  M3 — invite tokens are no longer world-readable
-- =====================================================================
SET ROLE anon;
DO $m3$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.company_invites;
  PERFORM cmsec_assert('M3.1','anon can no longer read invites', n=0, n||' row(s) visible');
END $m3$;
RESET ROLE;

SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4900-b000-000000000002","role":"authenticated"}',false);
SET ROLE authenticated;
DO $m3b$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.company_invites
   WHERE company_id='00000000-0000-4900-a000-00000000000a';
  PERFORM cmsec_assert('M3.2','a non-member cannot read another company''s invites', n=0, n||' row(s) visible');
END $m3b$;
RESET ROLE;

-- REGRESSION: InvitesPage must still work for a member of the company
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4900-b000-000000000001","role":"authenticated"}',false);
SET ROLE authenticated;
DO $m3c$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.company_invites
   WHERE company_id='00000000-0000-4900-a000-00000000000a';
  PERFORM cmsec_assert('M3.3','a company member CAN still list their own invites (InvitesPage)', n=2, n||' row(s) visible');
END $m3c$;
RESET ROLE;


-- =====================================================================
--  M4 — invite acceptance still works end to end
-- =====================================================================
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4900-b000-000000000003","role":"authenticated"}',false);
SET ROLE authenticated;
DO $m4$
DECLARE v_msg text; v_role text; v_co uuid;
BEGIN
  BEGIN
    PERFORM public.accept_company_invite('CMSEC-TOKEN-LIVE');
    SELECT role INTO v_role FROM public.company_members
     WHERE user_id = auth.uid() AND company_id='00000000-0000-4900-a000-00000000000a';
    PERFORM cmsec_assert('M4.1','a valid invite still grants membership with its role', v_role='admin', coalesce(v_role,'NULL'));
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    PERFORM cmsec_assert('M4.1','a valid invite still grants membership with its role', false, v_msg);
  END;

  BEGIN
    PERFORM public.accept_company_invite('CMSEC-TOKEN-LIVE');
    PERFORM cmsec_assert('M4.2','an already-accepted invite is rejected', false, 'SUCCEEDED');
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    PERFORM cmsec_assert('M4.2','an already-accepted invite is rejected', v_msg LIKE '%already been accepted%', v_msg);
  END;

  BEGIN
    PERFORM public.accept_company_invite('CMSEC-TOKEN-EXPIRED');
    PERFORM cmsec_assert('M4.3','an expired invite is rejected', false, 'SUCCEEDED');
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    PERFORM cmsec_assert('M4.3','an expired invite is rejected', v_msg LIKE '%expired%', v_msg);
  END;

  BEGIN
    PERFORM public.accept_company_invite('NO-SUCH-TOKEN');
    PERFORM cmsec_assert('M4.4','an unknown token is rejected', false, 'SUCCEEDED');
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    PERFORM cmsec_assert('M4.4','an unknown token is rejected', v_msg LIKE '%not found%', v_msg);
  END;
END $m4$;
RESET ROLE;

-- the invite path also sets profiles.company_id; the guard trigger from
-- the profiles RLS fix must not have broken that
DO $m4v$
DECLARE v_co uuid;
BEGIN
  SELECT company_id INTO v_co FROM public.profiles
   WHERE id='00000000-0000-4900-b000-000000000003';
  PERFORM cmsec_assert('M4.5','invite acceptance still sets profiles.company_id despite the guard trigger',
                       v_co='00000000-0000-4900-a000-00000000000a', coalesce(v_co::text,'NULL'));
END $m4v$;


-- =====================================================================
--  M5 — member administration is untouched
-- =====================================================================
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4900-b000-000000000001","role":"authenticated"}',false);
SET ROLE authenticated;
DO $m5$
DECLARE n int;
BEGIN
  UPDATE public.company_members SET role='member'
   WHERE company_id='00000000-0000-4900-a000-00000000000a'
     AND user_id='00000000-0000-4900-b000-000000000003';
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM cmsec_assert('M5.1','an admin can still update a member', n=1, n||' row(s) updated');

  DELETE FROM public.company_members
   WHERE company_id='00000000-0000-4900-a000-00000000000a'
     AND user_id='00000000-0000-4900-b000-000000000003';
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM cmsec_assert('M5.2','an admin can still remove a member', n=1, n||' row(s) deleted');
END $m5$;
RESET ROLE;
SELECT set_config('request.jwt.claims','',false);


-- ── results ──────────────────────────────────────────────────────────
\echo ''
\echo '===== COMPANY MEMBERSHIP SECURITY — TEST RESULTS ====='
SELECT id, name, verdict, detail FROM cmsec_results ORDER BY seq;
\echo ''
SELECT verdict, count(*) FROM cmsec_results GROUP BY verdict ORDER BY verdict;

-- ── cleanup ──────────────────────────────────────────────────────────
DO $cleanup$
BEGIN
  DELETE FROM public.company_invites WHERE token LIKE 'CMSEC-TOKEN-%';
  DELETE FROM public.company_members WHERE user_id::text LIKE '00000000-0000-4900-b000-%';
  DELETE FROM public.profiles  WHERE email LIKE 'cmsec-%@local.test';
  DELETE FROM auth.users       WHERE email LIKE 'cmsec-%@local.test';
  DELETE FROM public.companies WHERE lower(name) IN ('cmsec victim corp');
  RAISE NOTICE 'CMSEC fixtures removed.';
EXCEPTION WHEN others THEN
  RAISE WARNING 'CLEANUP INCOMPLETE (%). Remove CMSEC rows manually.', SQLERRM;
END $cleanup$;

DROP FUNCTION IF EXISTS cmsec_assert(text,text,boolean,text);
