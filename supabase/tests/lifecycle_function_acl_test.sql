-- =====================================================================
--  LIFECYCLE FUNCTION ACLs — TESTS (review finding G7)
--  LOCAL / DISPOSABLE DATABASE ONLY
-- =====================================================================
--  Covers 20260910000000_lifecycle_function_acl.sql.
--
--  Both halves matter: that anon is refused, and that authenticated and
--  service_role are not. A REVOKE that also breaks the legitimate
--  callers would pass a one-sided test.
--
--  Run:  psql "<local url>" -f supabase/tests/lifecycle_function_acl_test.sql
-- =====================================================================

\set ON_ERROR_STOP off

DO $guard$
BEGIN
  IF current_database() NOT IN ('postgres','criateur_local') THEN
    RAISE EXCEPTION 'REFUSING TO RUN outside a local database (got %)', current_database();
  END IF;
END $guard$;

DROP TABLE IF EXISTS lcacl_results;
CREATE TEMP TABLE lcacl_results(seq serial, id text, name text, verdict text, detail text);
GRANT ALL ON lcacl_results TO authenticated, anon, service_role;
GRANT USAGE, SELECT ON SEQUENCE lcacl_results_seq_seq TO authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION lcacl_assert(p_id text, p_name text, p_cond boolean, p_detail text DEFAULT '')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO lcacl_results(id,name,verdict,detail)
  VALUES (p_id, p_name, CASE WHEN p_cond THEN 'PASS' ELSE 'FAIL' END, p_detail);
END $$;

-- ── catalog: no PUBLIC entry survives on either function ──────────────
DO $a1$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.proname,
           exists (SELECT 1 FROM unnest(coalesce(p.proacl,'{}'::aclitem[])) a
                    WHERE a::text LIKE '=%') AS public_exec,
           p.proacl IS NULL AS default_acl,
           coalesce(array_to_string(p.proacl,'  '),'<default>') AS acl
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public'
       AND p.proname IN ('lifecycle_available_actions','lifecycle_resolve_definition')
  LOOP
    PERFORM lcacl_assert('A1.'||r.proname, r.proname||' has no PUBLIC EXECUTE',
                         NOT r.public_exec AND NOT r.default_acl, r.acl);
  END LOOP;
END $a1$;

-- ── catalog: the intended grants are present ─────────────────────────
DO $a2$
DECLARE fn text; ro text;
BEGIN
  FOREACH fn IN ARRAY ARRAY['public.lifecycle_available_actions(text,uuid,uuid)',
                            'public.lifecycle_resolve_definition(text,uuid)'] LOOP
    PERFORM lcacl_assert('A2.anon',   'anon cannot execute '||split_part(fn,'(',1),
      has_function_privilege('anon', fn, 'EXECUTE') = false,
      coalesce(has_function_privilege('anon', fn, 'EXECUTE')::text,'NULL'));
    FOREACH ro IN ARRAY ARRAY['authenticated','service_role'] LOOP
      PERFORM lcacl_assert('A2.'||ro, ro||' can execute '||split_part(fn,'(',1),
        has_function_privilege(ro, fn, 'EXECUTE') = true,
        coalesce(has_function_privilege(ro, fn, 'EXECUTE')::text,'NULL'));
    END LOOP;
  END LOOP;
END $a2$;

-- ── behavioural: anon is actually refused ────────────────────────────
SET ROLE anon;
DO $a3$
DECLARE v_msg text;
BEGIN
  BEGIN
    PERFORM public.lifecycle_resolve_definition('capa_record', gen_random_uuid());
    PERFORM lcacl_assert('A3.1','anon is refused lifecycle_resolve_definition', false, 'CALL SUCCEEDED');
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    PERFORM lcacl_assert('A3.1','anon is refused lifecycle_resolve_definition',
                         v_msg LIKE '%permission denied%', v_msg);
  END;

  BEGIN
    PERFORM * FROM public.lifecycle_available_actions('capa_record', gen_random_uuid(), gen_random_uuid());
    PERFORM lcacl_assert('A3.2','anon is refused lifecycle_available_actions', false, 'CALL SUCCEEDED');
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    PERFORM lcacl_assert('A3.2','anon is refused lifecycle_available_actions',
                         v_msg LIKE '%permission denied%', v_msg);
  END;
END $a3$;
RESET ROLE;

-- ── behavioural regression: the legitimate callers still work ────────
SET ROLE authenticated;
DO $a4$
DECLARE v_def uuid; n int; v_msg text;
BEGIN
  BEGIN
    v_def := public.lifecycle_resolve_definition('capa_record', gen_random_uuid());
    PERFORM lcacl_assert('A4.1','authenticated can still resolve a definition', v_def IS NOT NULL,
                         coalesce(v_def::text,'NULL'));
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    PERFORM lcacl_assert('A4.1','authenticated can still resolve a definition', false, v_msg);
  END;

  BEGIN
    SELECT count(*) INTO n
      FROM public.lifecycle_available_actions('capa_record', gen_random_uuid(), gen_random_uuid());
    -- zero rows is the correct answer for a non-member; the point is that
    -- the call is permitted rather than refused
    PERFORM lcacl_assert('A4.2','authenticated can still call available_actions', true, n||' row(s)');
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    PERFORM lcacl_assert('A4.2','authenticated can still call available_actions', false, v_msg);
  END;
END $a4$;
RESET ROLE;

SET ROLE service_role;
DO $a5$
DECLARE v_def uuid; n int; v_msg text;
BEGIN
  BEGIN
    v_def := public.lifecycle_resolve_definition('capa_record', gen_random_uuid());
    SELECT count(*) INTO n
      FROM public.lifecycle_available_actions('capa_record', gen_random_uuid(), gen_random_uuid());
    PERFORM lcacl_assert('A5.1','service_role behaviour is unchanged', v_def IS NOT NULL,
                         'definition '||coalesce(v_def::text,'NULL')||', '||n||' action row(s)');
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    PERFORM lcacl_assert('A5.1','service_role behaviour is unchanged', false, v_msg);
  END;
END $a5$;
RESET ROLE;

-- ── the other engine functions must not have regressed ───────────────
DO $a6$
DECLARE n_public int;
BEGIN
  SELECT count(*) INTO n_public
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public'
     AND p.proname IN ('lifecycle_transition','lifecycle_initialize','lifecycle_actor_role',
                       'app_is_service_context','app_current_profile_company','app_current_profile_role',
                       'create_company','get_or_create_company')
     AND (p.proacl IS NULL
          OR exists (SELECT 1 FROM unnest(p.proacl) a WHERE a::text LIKE '=%'));
  PERFORM lcacl_assert('A6.1','no other engine or security function has PUBLIC EXECUTE',
                       n_public = 0, n_public||' function(s) with PUBLIC EXECUTE');
END $a6$;

-- ── lifecycle_initialize is not a client-callable API ────────────────
--  The engine cannot verify that an arbitrary entity_id belongs to the
--  company a caller names, so initialisation is reachable only from each
--  module's own AFTER INSERT trigger (SECURITY DEFINER, owner privileges)
--  or in service context for backfills.
DO $a7$
DECLARE v_auth bool; v_anon bool; v_svc bool; v_public bool;
BEGIN
  SELECT has_function_privilege('authenticated','public.lifecycle_initialize(text,uuid,uuid,uuid,text)','EXECUTE') INTO v_auth;
  SELECT has_function_privilege('anon',         'public.lifecycle_initialize(text,uuid,uuid,uuid,text)','EXECUTE') INTO v_anon;
  SELECT has_function_privilege('service_role', 'public.lifecycle_initialize(text,uuid,uuid,uuid,text)','EXECUTE') INTO v_svc;
  SELECT exists (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace,
                      unnest(coalesce(p.proacl,'{}'::aclitem[])) a
                  WHERE n.nspname='public' AND p.proname='lifecycle_initialize' AND a::text LIKE '=%')
    INTO v_public;

  PERFORM lcacl_assert('A7.1','authenticated cannot execute lifecycle_initialize', v_auth = false, coalesce(v_auth::text,'NULL'));
  PERFORM lcacl_assert('A7.2','anon cannot execute lifecycle_initialize',          v_anon = false, coalesce(v_anon::text,'NULL'));
  PERFORM lcacl_assert('A7.3','service_role CAN still initialize (backfills)',     v_svc  = true,  coalesce(v_svc::text,'NULL'));
  PERFORM lcacl_assert('A7.4','lifecycle_initialize has no PUBLIC EXECUTE',        v_public = false, coalesce(v_public::text,'NULL'));
END $a7$;

SET ROLE authenticated;
DO $a8$
DECLARE v_msg text;
BEGIN
  BEGIN
    PERFORM public.lifecycle_initialize('capa_record', gen_random_uuid(), gen_random_uuid(), NULL, NULL);
    PERFORM lcacl_assert('A8.1','a client cannot initialize an arbitrary entity id', false, 'CALL SUCCEEDED');
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    PERFORM lcacl_assert('A8.1','a client cannot initialize an arbitrary entity id',
                         v_msg LIKE '%permission denied%', v_msg);
  END;
END $a8$;
RESET ROLE;

\echo ''
\echo '===== LIFECYCLE FUNCTION ACLs — TEST RESULTS ====='
SELECT id, name, verdict, detail FROM lcacl_results ORDER BY seq;
\echo ''
SELECT verdict, count(*) FROM lcacl_results GROUP BY verdict ORDER BY verdict;

DROP FUNCTION IF EXISTS lcacl_assert(text,text,boolean,text);
