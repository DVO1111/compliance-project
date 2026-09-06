-- =====================================================================
--  profiles RLS — INTEGRATION TESTS
--  LOCAL / DISPOSABLE DATABASE ONLY
-- =====================================================================
--  Covers 20260906000000_fix_profiles_rls_recursion.sql.
--
--  These run against a real Postgres because the thing under test is a
--  policy: recursion, tenant isolation and column immutability are
--  properties of the planner and the executor, not of the client. A
--  mocked test of this migration would assert nothing.
--
--  Run:  psql "<local url>" -f supabase/tests/profiles_rls_test.sql
--   or:  supabase db execute --file supabase/tests/profiles_rls_test.sql
--
--  Safe to run repeatedly. Fixtures are tagged prlstest- and removed at
--  the end. Two policies and one restrictive policy are created and
--  dropped again; no permanent schema change is made.
-- =====================================================================

\set ON_ERROR_STOP off

DO $guard$
BEGIN
  IF current_database() NOT IN ('postgres','criateur_local') THEN
    RAISE EXCEPTION 'REFUSING TO RUN outside a local database (got %)', current_database();
  END IF;
END $guard$;

DO $prereq$
BEGIN
  IF to_regprocedure('public.app_current_profile_company()') IS NULL THEN
    RAISE EXCEPTION 'Migration 20260906000000 has not been applied to this database.';
  END IF;
END $prereq$;

-- public.companies is referenced by many migrations but created by none;
-- scaffolded for the test only, exactly as in lifecycle_engine_test.sql.
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

DROP TABLE IF EXISTS prls_results;
CREATE TEMP TABLE prls_results(seq serial, id text, name text, verdict text, detail text);
-- assertions are recorded while running as ROLE authenticated (most of
-- them) and as ROLE service_role (the exemption case), so both need write
-- access to the results table
GRANT ALL ON prls_results TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE prls_results_seq_seq TO authenticated, service_role;

CREATE OR REPLACE FUNCTION prls_assert(p_id text, p_name text, p_cond boolean, p_detail text DEFAULT '')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO prls_results(id,name,verdict,detail)
  VALUES (p_id, p_name, CASE WHEN p_cond THEN 'PASS' ELSE 'FAIL' END, p_detail);
END $$;

-- ── fixtures: two companies, six users ───────────────────────────────
--  company A : a_admin (admin), a_officer (compliance_officer), a_member
--  company B : b_admin (admin), b_member
--  no company: nocomp   (company_id IS NULL — the onboarding state)
DO $fx$
DECLARE
  ca uuid := '00000000-0000-4200-a000-00000000000a';
  cb uuid := '00000000-0000-4200-a000-00000000000b';
BEGIN
  INSERT INTO public.companies(id,name) VALUES (ca,'PRLSTEST-A'),(cb,'PRLSTEST-B')
    ON CONFLICT (id) DO NOTHING;

  INSERT INTO auth.users(id,email) VALUES
    ('00000000-0000-4200-b000-000000000001','prlstest-a-admin@local.test'),
    ('00000000-0000-4200-b000-000000000002','prlstest-a-officer@local.test'),
    ('00000000-0000-4200-b000-000000000003','prlstest-a-member@local.test'),
    ('00000000-0000-4200-b000-000000000004','prlstest-b-admin@local.test'),
    ('00000000-0000-4200-b000-000000000005','prlstest-b-member@local.test'),
    ('00000000-0000-4200-b000-000000000006','prlstest-nocomp@local.test')
    ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles(id,email,role,company_id) VALUES
    ('00000000-0000-4200-b000-000000000001','prlstest-a-admin@local.test','admin',ca),
    ('00000000-0000-4200-b000-000000000002','prlstest-a-officer@local.test','compliance_officer',ca),
    ('00000000-0000-4200-b000-000000000003','prlstest-a-member@local.test','content_creator',ca),
    ('00000000-0000-4200-b000-000000000004','prlstest-b-admin@local.test','admin',cb),
    ('00000000-0000-4200-b000-000000000005','prlstest-b-member@local.test','content_creator',cb),
    ('00000000-0000-4200-b000-000000000006','prlstest-nocomp@local.test','content_creator',NULL)
    ON CONFLICT (id) DO NOTHING;
END $fx$;


-- =====================================================================
--  T1 — a user can read their own profile
-- =====================================================================
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4200-b000-000000000003","role":"authenticated"}',false);
SET ROLE authenticated;
DO $t1$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.profiles WHERE id = auth.uid();
  PERFORM prls_assert('T1.1','a member can read their own profile', n = 1, n||' row(s)');
END $t1$;
RESET ROLE;

-- the same must hold for a user who has not been placed in a company yet,
-- because "Users can view own profile" must not depend on company_id
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4200-b000-000000000006","role":"authenticated"}',false);
SET ROLE authenticated;
DO $t1b$
DECLARE n int; total int;
BEGIN
  SELECT count(*) INTO n FROM public.profiles WHERE id = auth.uid();
  SELECT count(*) INTO total FROM public.profiles;
  PERFORM prls_assert('T1.2','a user with NULL company_id can still read their own profile', n = 1, n||' row(s)');
  PERFORM prls_assert('T1.3','a user with NULL company_id sees no one else',                 total = 1, total||' row(s) visible');
END $t1b$;
RESET ROLE;


-- =====================================================================
--  T2 — a reviewer can read authorised teammates in the SAME company
-- =====================================================================
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4200-b000-000000000001","role":"authenticated"}',false);
SET ROLE authenticated;
DO $t2$
DECLARE n_mate int; n_total int;
BEGIN
  SELECT count(*) INTO n_mate FROM public.profiles
   WHERE id = '00000000-0000-4200-b000-000000000003';
  SELECT count(*) INTO n_total FROM public.profiles
   WHERE email LIKE 'prlstest-%';
  PERFORM prls_assert('T2.1','admin can read a teammate profile in the same company', n_mate = 1, n_mate||' row(s)');
  PERFORM prls_assert('T2.2','admin sees exactly the three company-A fixtures',        n_total = 3, n_total||' row(s) visible');
END $t2$;
RESET ROLE;

SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4200-b000-000000000002","role":"authenticated"}',false);
SET ROLE authenticated;
DO $t2b$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.profiles WHERE email LIKE 'prlstest-%';
  PERFORM prls_assert('T2.3','compliance_officer has the same company-scoped read', n = 3, n||' row(s) visible');
END $t2b$;
RESET ROLE;

-- the role gate must still bite: a content_creator is not a reviewer
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4200-b000-000000000003","role":"authenticated"}',false);
SET ROLE authenticated;
DO $t2c$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.profiles WHERE email LIKE 'prlstest-%';
  PERFORM prls_assert('T2.4','content_creator sees only themselves, not the company', n = 1, n||' row(s) visible');
END $t2c$;
RESET ROLE;


-- =====================================================================
--  T3 — no profile is readable across a company boundary
-- =====================================================================
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4200-b000-000000000001","role":"authenticated"}',false);
SET ROLE authenticated;
DO $t3$
DECLARE n_b int;
BEGIN
  SELECT count(*) INTO n_b FROM public.profiles
   WHERE id IN ('00000000-0000-4200-b000-000000000004','00000000-0000-4200-b000-000000000005');
  PERFORM prls_assert('T3.1','company-A admin cannot read company-B profiles', n_b = 0, n_b||' row(s) visible');
END $t3$;
RESET ROLE;

SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4200-b000-000000000004","role":"authenticated"}',false);
SET ROLE authenticated;
DO $t3b$
DECLARE n_a int;
BEGIN
  SELECT count(*) INTO n_a FROM public.profiles
   WHERE company_id = '00000000-0000-4200-a000-00000000000a';
  PERFORM prls_assert('T3.2','company-B admin cannot read company-A profiles', n_a = 0, n_a||' row(s) visible');
END $t3b$;
RESET ROLE;


-- =====================================================================
--  T4 — a user cannot change their own company membership or role
-- =====================================================================
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4200-b000-000000000003","role":"authenticated"}',false);
SET ROLE authenticated;
DO $t4$
DECLARE v_state text; v_msg text; v_co uuid; v_role text; n int;
BEGIN
  BEGIN
    UPDATE public.profiles SET company_id = '00000000-0000-4200-a000-00000000000b'
     WHERE id = auth.uid();
    PERFORM prls_assert('T4.1','self-service company_id change is rejected', false, 'UPDATE succeeded');
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    PERFORM prls_assert('T4.1','self-service company_id change is rejected',
                        v_msg LIKE 'PROFILES_COMPANY_IMMUTABLE%', v_state||' '||v_msg);
  END;

  BEGIN
    UPDATE public.profiles SET role = 'admin' WHERE id = auth.uid();
    PERFORM prls_assert('T4.2','self-promotion to admin is rejected', false, 'UPDATE succeeded');
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    PERFORM prls_assert('T4.2','self-promotion to admin is rejected',
                        v_msg LIKE 'PROFILES_ROLE_IMMUTABLE%', v_state||' '||v_msg);
  END;

  BEGIN
    UPDATE public.profiles SET custom_role_id = '00000000-0000-4200-c000-000000000001'
     WHERE id = auth.uid();
    PERFORM prls_assert('T4.2b','self-assigning a custom role is rejected', false, 'UPDATE succeeded');
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    PERFORM prls_assert('T4.2b','self-assigning a custom role is rejected',
                        v_msg LIKE 'PROFILES_ROLE_IMMUTABLE%', v_state||' '||v_msg);
  END;

  -- the guard must not be a blanket block on the row
  UPDATE public.profiles SET full_name = 'Prls Test' WHERE id = auth.uid();
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM prls_assert('T4.3','an ordinary self-update still succeeds', n = 1, n||' row(s) updated');

  -- and no write may reach another user's row at all
  UPDATE public.profiles SET full_name = 'hijacked'
   WHERE id = '00000000-0000-4200-b000-000000000001';
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM prls_assert('T4.4','a user cannot update another profile', n = 0, n||' row(s) updated');
END $t4$;
RESET ROLE;

-- the rejected updates must have left the row untouched
DO $t4v$
DECLARE v_co uuid; v_role text;
BEGIN
  SELECT company_id, role INTO v_co, v_role FROM public.profiles
   WHERE id = '00000000-0000-4200-b000-000000000003';
  PERFORM prls_assert('T4.5','company_id unchanged after the rejected update',
                      v_co = '00000000-0000-4200-a000-00000000000a', coalesce(v_co::text,'NULL'));
  PERFORM prls_assert('T4.6','role unchanged after the rejected update',
                      v_role = 'content_creator', coalesce(v_role,'NULL'));
END $t4v$;

-- service_role is exempt: provisioning still has to be able to move people
SET ROLE service_role;
DO $t4s$
DECLARE n int;
BEGIN
  UPDATE public.profiles SET company_id = '00000000-0000-4200-a000-00000000000b'
   WHERE id = '00000000-0000-4200-b000-000000000006';
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM prls_assert('T4.7','service_role can still set company_id', n = 1, n||' row(s) updated');
  UPDATE public.profiles SET company_id = NULL WHERE id = '00000000-0000-4200-b000-000000000006';
EXCEPTION WHEN others THEN
  PERFORM prls_assert('T4.7','service_role can still set company_id', false, SQLERRM);
END $t4s$;
RESET ROLE;


-- =====================================================================
--  T5 — the recursive path is gone (and the harness can still see it)
-- =====================================================================
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4200-b000-000000000001","role":"authenticated"}',false);
SET ROLE authenticated;
DO $t5$
DECLARE n int; v_state text;
BEGIN
  BEGIN
    SELECT count(*) INTO n FROM public.profiles;
    PERFORM prls_assert('T5.1','SELECT on profiles no longer raises 42P17', true, n||' row(s) visible');
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
    PERFORM prls_assert('T5.1','SELECT on profiles no longer raises 42P17', false, v_state||' '||SQLERRM);
  END;

  BEGIN
    UPDATE public.profiles SET full_name = full_name WHERE id = auth.uid();
    PERFORM prls_assert('T5.2','UPDATE on profiles no longer raises 42P17', true, '');
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
    PERFORM prls_assert('T5.2','UPDATE on profiles no longer raises 42P17', false, v_state||' '||SQLERRM);
  END;
END $t5$;
RESET ROLE;

-- Re-introduce the original policy verbatim to prove (a) that it really is
-- the cause and (b) that this test would fail if the fix were reverted.
CREATE POLICY "prls_tmp_original_recursive_policy"
  ON public.profiles FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p
                 WHERE p.id = auth.uid()
                   AND p.role = ANY (ARRAY['admin','compliance_officer'])));

SET ROLE authenticated;
DO $t5c$
DECLARE n int; v_state text := 'none';
BEGIN
  BEGIN
    SELECT count(*) INTO n FROM public.profiles;
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
  END;
  PERFORM prls_assert('T5.3','the original policy does reproduce 42P17 (control)',
                      v_state = '42P17', 'sqlstate '||v_state);
END $t5c$;
RESET ROLE;

DROP POLICY "prls_tmp_original_recursive_policy" ON public.profiles;

-- structural: the replacement predicate must not mention profiles at all
DO $t5d$
DECLARE v_qual text;
BEGIN
  SELECT qual INTO v_qual FROM pg_policies
   WHERE schemaname='public' AND tablename='profiles'
     AND policyname='Reviewers can view company profiles';
  PERFORM prls_assert('T5.4','the replacement policy contains no reference to profiles',
                      v_qual IS NOT NULL AND v_qual !~* '\mprofiles\M', coalesce(v_qual,'POLICY MISSING'));
END $t5d$;


-- =====================================================================
--  T6 — the helpers do not re-enter profiles RLS
-- =====================================================================
-- Deny every authenticated SELECT on profiles with a RESTRICTIVE policy.
-- If the helpers went through RLS they would now return NULL. They do not,
-- which is precisely why the policy that calls them cannot recurse.
CREATE POLICY "prls_tmp_deny_all_select"
  ON public.profiles AS RESTRICTIVE FOR SELECT TO authenticated
  USING (false);

SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4200-b000-000000000001","role":"authenticated"}',false);
SET ROLE authenticated;
DO $t6$
DECLARE v_direct uuid; v_helper uuid; v_role text; n int;
BEGIN
  SELECT count(*) INTO n FROM public.profiles;
  SELECT company_id INTO v_direct FROM public.profiles WHERE id = auth.uid();
  v_helper := public.app_current_profile_company();
  v_role   := public.app_current_profile_role();

  PERFORM prls_assert('T6.1','the restrictive policy really does block direct reads',
                      n = 0 AND v_direct IS NULL, n||' row(s), direct='||coalesce(v_direct::text,'NULL'));
  PERFORM prls_assert('T6.2','app_current_profile_company() resolves despite that policy',
                      v_helper = '00000000-0000-4200-a000-00000000000a', coalesce(v_helper::text,'NULL'));
  PERFORM prls_assert('T6.3','app_current_profile_role() resolves despite that policy',
                      v_role = 'admin', coalesce(v_role,'NULL'));
END $t6$;
RESET ROLE;

DROP POLICY "prls_tmp_deny_all_select" ON public.profiles;

-- structural preconditions the argument above depends on
DO $t6b$
DECLARE v_secdef bool; v_nargs int; v_cfg text[]; v_force bool; v_owner_bypass bool;
BEGIN
  SELECT bool_and(p.prosecdef), max(p.pronargs)
    INTO v_secdef, v_nargs
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public'
     AND p.proname IN ('app_current_profile_company','app_current_profile_role');
  SELECT p.proconfig INTO v_cfg FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='app_current_profile_company';
  SELECT c.relforcerowsecurity INTO v_force FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname='profiles';
  SELECT r.rolsuper OR r.rolbypassrls INTO v_owner_bypass
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner
   WHERE n.nspname='public' AND p.proname='app_current_profile_company';

  PERFORM prls_assert('T6.4','both helpers are SECURITY DEFINER',        v_secdef, coalesce(v_secdef::text,'NULL'));
  PERFORM prls_assert('T6.5','both helpers are parameterless',           v_nargs = 0, v_nargs||' arg(s)');
  PERFORM prls_assert('T6.6','both helpers pin search_path',             v_cfg @> ARRAY['search_path=public'], coalesce(array_to_string(v_cfg,','),'NULL'));
  PERFORM prls_assert('T6.7','profiles does not FORCE row level security', v_force = false, coalesce(v_force::text,'NULL'));
  PERFORM prls_assert('T6.8','the helper owner bypasses RLS',            v_owner_bypass, coalesce(v_owner_bypass::text,'NULL'));
END $t6b$;

-- and the helpers must not be reachable by an unauthenticated caller
DO $t6c$
DECLARE v_anon bool;
BEGIN
  SELECT has_function_privilege('anon','public.app_current_profile_company()','EXECUTE') INTO v_anon;
  PERFORM prls_assert('T6.9','anon cannot execute the helpers', v_anon = false, coalesce(v_anon::text,'NULL'));
END $t6c$;


-- =====================================================================
--  T7 — access cannot be obtained by manipulating company_id
-- =====================================================================
-- A company-B content_creator tries to move into company A and read it.
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4200-b000-000000000005","role":"authenticated"}',false);
SET ROLE authenticated;
DO $t7$
DECLARE v_msg text; n int;
BEGIN
  BEGIN
    UPDATE public.profiles SET company_id = '00000000-0000-4200-a000-00000000000a'
     WHERE id = auth.uid();
    PERFORM prls_assert('T7.1','moving oneself into another company is rejected', false, 'UPDATE succeeded');
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    PERFORM prls_assert('T7.1','moving oneself into another company is rejected',
                        v_msg LIKE 'PROFILES_COMPANY_IMMUTABLE%', v_msg);
  END;

  SELECT count(*) INTO n FROM public.profiles
   WHERE company_id = '00000000-0000-4200-a000-00000000000a';
  PERFORM prls_assert('T7.2','and company-A profiles remain invisible to them', n = 0, n||' row(s) visible');
END $t7$;
RESET ROLE;

-- Even granting the company outright is not enough: the role gate is
-- independent. nocomp is placed in company A by service_role, keeps
-- content_creator, and still sees only itself.
SET ROLE service_role;
UPDATE public.profiles SET company_id = '00000000-0000-4200-a000-00000000000a'
 WHERE id = '00000000-0000-4200-b000-000000000006';
RESET ROLE;

SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4200-b000-000000000006","role":"authenticated"}',false);
SET ROLE authenticated;
DO $t7b$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.profiles WHERE email LIKE 'prlstest-%';
  PERFORM prls_assert('T7.3','company membership alone does not grant the reviewer read', n = 1, n||' row(s) visible');
END $t7b$;
RESET ROLE;

SET ROLE service_role;
UPDATE public.profiles SET company_id = NULL WHERE id = '00000000-0000-4200-b000-000000000006';
RESET ROLE;

-- A forged JWT claim cannot help either: the policy reads company and role
-- from the caller's own row, never from the token.
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4200-b000-000000000005","role":"authenticated","company_id":"00000000-0000-4200-a000-00000000000a","user_role":"admin"}',
  false);
SET ROLE authenticated;
DO $t7c$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.profiles
   WHERE company_id = '00000000-0000-4200-a000-00000000000a';
  PERFORM prls_assert('T7.4','extra JWT claims do not widen the policy', n = 0, n||' row(s) visible');
END $t7c$;
RESET ROLE;
SELECT set_config('request.jwt.claims','',false);


-- =====================================================================
--  T8 — record the gap this migration does NOT close
-- =====================================================================
--  INSERT never recursed, so self-provisioning a profile with any role and
--  any company_id already works today and still works after this fix. This
--  is recorded rather than asserted: it is a pre-existing hole that needs a
--  server-side provisioning path, not a policy tweak. The row flips to
--  CLOSED if someone later restricts the INSERT policy, so the gap cannot
--  quietly persist unnoticed.
INSERT INTO auth.users(id,email) VALUES
  ('00000000-0000-4200-b000-000000000007','prlstest-insert@local.test')
  ON CONFLICT (id) DO NOTHING;

SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4200-b000-000000000007","role":"authenticated"}',false);
SET ROLE authenticated;
DO $t8$
DECLARE v_ok bool := false;
BEGIN
  BEGIN
    INSERT INTO public.profiles(id,email,role,company_id)
    VALUES (auth.uid(),'prlstest-insert@local.test','admin','00000000-0000-4200-a000-00000000000a');
    v_ok := true;
  EXCEPTION WHEN others THEN
    v_ok := false;
  END;
  INSERT INTO prls_results(id,name,verdict,detail) VALUES (
    'T8.1',
    'self-INSERT with role=admin into an arbitrary company',
    CASE WHEN v_ok THEN 'KNOWN-GAP' ELSE 'CLOSED' END,
    CASE WHEN v_ok THEN 'still possible — pre-existing, out of scope for this migration'
         ELSE 'the INSERT policy now rejects it' END);
END $t8$;
RESET ROLE;
SELECT set_config('request.jwt.claims','',false);


-- ── results ──────────────────────────────────────────────────────────
\echo ''
\echo '============ profiles RLS — TEST RESULTS ============'
SELECT id, name, verdict, detail FROM prls_results ORDER BY seq;
\echo ''
SELECT verdict, count(*) FROM prls_results GROUP BY verdict ORDER BY verdict;

-- ── cleanup ──────────────────────────────────────────────────────────
DO $cleanup$
BEGIN
  DROP POLICY IF EXISTS "prls_tmp_original_recursive_policy" ON public.profiles;
  DROP POLICY IF EXISTS "prls_tmp_deny_all_select" ON public.profiles;
  DELETE FROM public.profiles  WHERE email LIKE 'prlstest-%@local.test';
  DELETE FROM auth.users       WHERE email LIKE 'prlstest-%@local.test';
  DELETE FROM public.companies WHERE name LIKE 'PRLSTEST%';
  RAISE NOTICE 'prlstest fixtures removed.';
EXCEPTION WHEN others THEN
  RAISE WARNING 'CLEANUP INCOMPLETE (%). Remove prlstest rows manually.', SQLERRM;
END $cleanup$;

DROP FUNCTION IF EXISTS prls_assert(text,text,boolean,text);
