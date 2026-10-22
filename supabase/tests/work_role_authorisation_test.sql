-- =====================================================================
--  WORK-ROLE STEP AUTHORISATION — INTEGRATION TESTS  (PM-03)
--  LOCAL / DISPOSABLE DATABASE ONLY
-- =====================================================================
--  Covers 20261104000000_work_role_step_authorisation.sql.
--
--  WHAT THIS IS FOR. The application refuses a Storekeeper the QA
--  disposition screen, and until that migration the database did not:
--  material_lot_release checked membership and the release gates and
--  never asked what job the caller held. A rule the UI asserts and the
--  database does not hold is not a rule — it is a button that happens
--  to be missing, and the RPC is one fetch away.
--
--  So the assertions here are deliberately the RUDE ones: not "does a
--  QA Manager succeed" but "is a Storekeeper actually stopped", tested
--  by setting the session to that person and attempting the step.
--
--  Run:  psql "<local url>" -f supabase/tests/work_role_authorisation_test.sql
--
--  Safe to run repeatedly. Fixtures are tagged wra- and removed at the
--  end. No permanent schema change is made.
-- =====================================================================

\set ON_ERROR_STOP off

RESET ROLE;
SELECT set_config('request.jwt.claims','', false);

DO $guard$
BEGIN
  IF current_database() NOT IN ('postgres','criateur_local') THEN
    RAISE EXCEPTION 'REFUSING TO RUN outside a local database (got %)', current_database();
  END IF;
  IF to_regprocedure('public.app_assert_step(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'Migration 20261104000000 has not been applied to this database.';
  END IF;
END $guard$;

DROP TABLE IF EXISTS wra_results;
CREATE TEMP TABLE wra_results(seq serial, id text, name text, verdict text, detail text);
GRANT ALL ON wra_results TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE wra_results_seq_seq TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION wra_assert(p_id text, p_name text, p_cond boolean, p_detail text DEFAULT '')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO wra_results(id,name,verdict,detail)
  VALUES (p_id,p_name,CASE WHEN p_cond THEN 'PASS' ELSE 'FAIL' END,p_detail);
END $$;

-- ── Fixtures: one company, six people, one per PM-03 role ──────────
DO $fix$
DECLARE
  v_company uuid;
  v_role    text;
  v_uid     uuid;
BEGIN
  DELETE FROM public.company_members
   WHERE company_id = 'a0a0a0a0-0000-4000-8000-000000000001'::uuid;
  DELETE FROM public.companies WHERE name = 'wra-co';

  --  A FIXED ID, NOT ONE LOOKED UP LATER. Section C runs as
  --  `authenticated`, and row-level security on companies hides this
  --  row from a session that is not a member of it — so a subquery for
  --  the id returned NULL there, app_assert_step was handed a null
  --  company, found no work role and abstained. Every refusal
  --  assertion then reported ALLOWED and the guard looked broken when
  --  the test was.
  v_company := 'a0a0a0a0-0000-4000-8000-000000000001'::uuid;
  INSERT INTO public.companies (id, name) VALUES (v_company, 'wra-co');

  --  One member per role. user_id references auth.users on some
  --  builds; where it does, these ids must exist, so they are created
  --  if the table is reachable and skipped if it is not.
  FOREACH v_role IN ARRAY ARRAY[
    'storekeeper','qc_analyst','qa_officer','qa_manager',
    'production_supervisor','compliance_admin',
    --  A role PM-03 does not tabulate, to prove the abstention above.
    'member'
  ] LOOP
    v_uid := md5('wra-' || v_role)::uuid;
    BEGIN
      INSERT INTO auth.users (id, email)
      VALUES (v_uid, 'wra-' || v_role || '@test.local')
      ON CONFLICT (id) DO NOTHING;
    EXCEPTION WHEN others THEN NULL;
    END;
    INSERT INTO public.company_members (company_id, user_id, role, status)
    VALUES (v_company, v_uid, v_role, 'active')
    ON CONFLICT (company_id, user_id) DO UPDATE SET role = EXCLUDED.role;
  END LOOP;
END $fix$;


-- ── A. The rules are in the database, and they are PM-03's ──────────
DO $a$
DECLARE r record;
BEGIN
  PERFORM wra_assert('A1','five steps are defined',
    (SELECT count(*) FROM public.step_permissions) = 5,
    'got ' || (SELECT count(*) FROM public.step_permissions)::text);

  SELECT * INTO r FROM public.step_permissions WHERE step = 'batch_release';
  PERFORM wra_assert('A2','releasing a batch is the QA Manager only',
    r.roles = ARRAY['qa_manager'], array_to_string(r.roles, ','));
  PERFORM wra_assert('A3','releasing a batch needs a signature',
    r.needs = 'signature', r.needs);

  SELECT * INTO r FROM public.step_permissions WHERE step = 'material_disposition';
  PERFORM wra_assert('A4','disposition is QA Officer or QA Manager',
    r.roles @> ARRAY['qa_officer'] AND r.roles @> ARRAY['qa_manager']
      AND array_length(r.roles,1) = 2,
    array_to_string(r.roles, ','));

  SELECT * INTO r FROM public.step_permissions WHERE step = 'roles_change';
  PERFORM wra_assert('A5','changing roles is the Compliance admin, logged',
    r.roles = ARRAY['compliance_admin'] AND r.needs = 'logged',
    array_to_string(r.roles, ',') || '/' || r.needs);
END $a$;


-- ── B. The caller's role is read, and normalised ────────────────────
DO $b$
DECLARE v_company uuid;
BEGIN
  v_company := 'a0a0a0a0-0000-4000-8000-000000000001'::uuid;

  PERFORM wra_assert('B1','a member’s work role is readable',
    public.app_work_role(v_company, 'd79620e5-72b8-278f-91ac-d66b5b139141'::uuid) = 'qa_manager',
    coalesce(public.app_work_role(v_company, 'd79620e5-72b8-278f-91ac-d66b5b139141'::uuid), '(null)'));

  PERFORM wra_assert('B2','a non-member has no work role',
    public.app_work_role(v_company, '00000000-0000-4000-8000-000000000999'::uuid) IS NULL);
END $b$;


-- ── C. THE ONES THAT MATTER: a wrong role is refused ────────────────
--
--  Impersonation is done with SET request.jwt.claims at STATEMENT
--  level, the idiom the other suites use, because auth.uid() reads
--  that JSON and not a request.jwt.claim.sub GUC. Setting it inside a
--  DO block left auth.uid() null, app_work_role returned NULL, and
--  every assertion below passed for the wrong reason — the first run
--  of this file reported "the step was ALLOWED" five times and it was
--  the test that was broken, not the guard.
--
--  RESET ROLE between blocks, or the session stays authenticated and
--  the cleanup at the end cannot run.

CREATE OR REPLACE FUNCTION wra_try(p_company uuid, p_step text)
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.app_assert_step(p_company, p_step);
  RETURN 'ALLOWED';
EXCEPTION WHEN others THEN
  RETURN SQLERRM;
END $$;

SET ROLE authenticated;

SET request.jwt.claims = '{"sub":"f8b3f689-931b-c6dd-6cb1-4602a0230654","role":"authenticated"}';
SELECT wra_assert('C1','a Storekeeper is refused material disposition',
  wra_try('a0a0a0a0-0000-4000-8000-000000000001'::uuid, 'material_disposition')
    LIKE 'STEP_FORBIDDEN%%',
  wra_try('a0a0a0a0-0000-4000-8000-000000000001'::uuid, 'material_disposition'));

SET request.jwt.claims = '{"sub":"6a22e781-c1ed-6c53-cd9c-51a4155530a3","role":"authenticated"}';
SELECT wra_assert('C2','a QC Analyst is refused batch release',
  wra_try('a0a0a0a0-0000-4000-8000-000000000001'::uuid, 'batch_release')
    LIKE 'STEP_FORBIDDEN%%',
  wra_try('a0a0a0a0-0000-4000-8000-000000000001'::uuid, 'batch_release'));

SET request.jwt.claims = '{"sub":"f9f5626a-9f12-503e-2c84-b702bc53306b","role":"authenticated"}';
SELECT wra_assert('C3','a Production supervisor is refused batch release',
  wra_try('a0a0a0a0-0000-4000-8000-000000000001'::uuid, 'batch_release')
    LIKE 'STEP_FORBIDDEN%%',
  wra_try('a0a0a0a0-0000-4000-8000-000000000001'::uuid, 'batch_release'));

--  The segregation PM-03 prints: the compliance admin sees everything
--  and acts in no quality step.
SET request.jwt.claims = '{"sub":"ecc6b68c-f7ca-7c83-6a00-aaf1f127f3a7","role":"authenticated"}';
SELECT wra_assert('C4','a Compliance admin is refused QA disposition',
  wra_try('a0a0a0a0-0000-4000-8000-000000000001'::uuid, 'material_disposition')
    LIKE 'STEP_FORBIDDEN%%',
  wra_try('a0a0a0a0-0000-4000-8000-000000000001'::uuid, 'material_disposition'));

SET request.jwt.claims = '{"sub":"d79620e5-72b8-278f-91ac-d66b5b139141","role":"authenticated"}';
SELECT wra_assert('C5','a QA Manager may release a batch',
  wra_try('a0a0a0a0-0000-4000-8000-000000000001'::uuid, 'batch_release') = 'ALLOWED',
  wra_try('a0a0a0a0-0000-4000-8000-000000000001'::uuid, 'batch_release'));

SET request.jwt.claims = '{"sub":"ad9bf007-ad66-cb1a-2110-cd5a46dc6aad","role":"authenticated"}';
SELECT wra_assert('C6','a QA Officer may dispose of material',
  wra_try('a0a0a0a0-0000-4000-8000-000000000001'::uuid, 'material_disposition') = 'ALLOWED',
  wra_try('a0a0a0a0-0000-4000-8000-000000000001'::uuid, 'material_disposition'));

SELECT wra_assert('C7','a QA Officer is refused batch release',
  wra_try('a0a0a0a0-0000-4000-8000-000000000001'::uuid, 'batch_release')
    LIKE 'STEP_FORBIDDEN%%',
  wra_try('a0a0a0a0-0000-4000-8000-000000000001'::uuid, 'batch_release'));

SELECT wra_assert('C8','an undefined step is refused',
  wra_try('a0a0a0a0-0000-4000-8000-000000000001'::uuid, 'not_a_real_step')
    LIKE 'STEP_UNKNOWN%%',
  wra_try('a0a0a0a0-0000-4000-8000-000000000001'::uuid, 'not_a_real_step'));

--  A role PM-03 does not tabulate is NOT refused — the scope of the
--  evidence, not laxness. See the migration header.
SET request.jwt.claims = '{"sub":"c672d8bf-5448-e6d8-f562-54eef10dfed0","role":"authenticated"}';
SELECT wra_assert('C9','a role the design does not tabulate is not refused',
  wra_try('a0a0a0a0-0000-4000-8000-000000000001'::uuid, 'batch_release') = 'ALLOWED',
  wra_try('a0a0a0a0-0000-4000-8000-000000000001'::uuid, 'batch_release'));

RESET ROLE; RESET request.jwt.claims;


-- ── D. The rule is wired to the transition, not only callable ───────
DO $d$
DECLARE v_company uuid;
BEGIN
  v_company := 'a0a0a0a0-0000-4000-8000-000000000001'::uuid;

  PERFORM wra_assert('D1','material disposition is guarded on the state table',
    to_regprocedure('public.fn_material_lots_disposition_role()') IS NOT NULL);
  PERFORM wra_assert('D2','batch release is guarded on the state table',
    to_regprocedure('public.fn_batch_release_role()') IS NOT NULL);
  PERFORM wra_assert('D3','supplier approval is guarded',
    to_regprocedure('public.fn_supplier_approve_role()') IS NOT NULL);
  PERFORM wra_assert('D4','closing a deviation is guarded',
    to_regprocedure('public.fn_deviation_close_role()') IS NOT NULL);

  PERFORM wra_assert('D5','each guard is attached to entity_current_state',
    (SELECT count(*) FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
     WHERE c.relname = 'entity_current_state'
       AND t.tgname IN ('trg_material_lots_disposition_role','trg_batch_release_role',
                        'trg_supplier_approve_role','trg_deviation_close_role')) = 4,
    'found ' || (SELECT count(*) FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
     WHERE c.relname = 'entity_current_state'
       AND t.tgname IN ('trg_material_lots_disposition_role','trg_batch_release_role',
                        'trg_supplier_approve_role','trg_deviation_close_role'))::text);
END $d$;


-- ── E. A service context is exempt, and only a service context ──────
DO $e$
DECLARE v_company uuid;
BEGIN
  v_company := 'a0a0a0a0-0000-4000-8000-000000000001'::uuid;

  --  This session IS a service context (the suite runs as the owner),
  --  so a step the caller's role would never permit must still pass.
  BEGIN
    PERFORM public.app_assert_step(v_company, 'batch_release');
    PERFORM wra_assert('E1','a migration or backfill is not blocked', true);
  EXCEPTION WHEN others THEN
    PERFORM wra_assert('E1','a migration or backfill is not blocked', false, SQLERRM);
  END;

  PERFORM wra_assert('E2','the exemption is the service-context test, not a role test',
    public.app_is_service_context() = true);
END $e$;


-- ── F. Every guard fires on a state that EXISTS ─────────────────────
--
--  THE ASSERTION THAT WAS MISSING. 20261104000000 guarded suppliers on
--  the state 'approved'; the supplier lifecycle has pending,
--  qualified, conditional, suspended and disqualified, and no
--  'approved'. The trigger was installed, attached, and never fired —
--  so "Approve a supplier", a QA-Manager-only step, was unenforced by
--  a migration that claimed to enforce it.
--
--  D1-D5 above did not catch it, because asserting that a trigger
--  EXISTS says nothing about whether its condition can ever be true.
--  This asserts the states themselves.

DO $f$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(x.entity_type || '.' || x.state_key, ', ')
    INTO v_missing
    FROM (VALUES
            ('material_lot','approved'), ('material_lot','rejected'),
            ('batch_record','released'), ('batch_record','rejected'),
            ('deviation','closed'),      ('capa_record','closed'),
            ('supplier','qualified'),    ('supplier','conditional')
         ) AS x(entity_type, state_key)
   WHERE NOT EXISTS (
     SELECT 1 FROM public.lifecycle_definitions d
       JOIN public.lifecycle_states s ON s.definition_id = d.id
      WHERE d.entity_type = x.entity_type AND s.state_key = x.state_key);

  PERFORM wra_assert('F1','every guarded state exists in its lifecycle',
    v_missing IS NULL, coalesce('missing: ' || v_missing, 'all present'));
END $f$;

DO $f2$
BEGIN
  PERFORM wra_assert('F2','CAPA closure is guarded',
    to_regprocedure('public.fn_capa_close_role()') IS NOT NULL);

  PERFORM wra_assert('F3','five role guards are attached to the state table',
    (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
      WHERE c.relname = 'entity_current_state'
        AND t.tgname IN ('trg_material_lots_disposition_role','trg_batch_release_role',
                         'trg_supplier_approve_role','trg_deviation_close_role',
                         'trg_capa_close_role')) = 5);

  --  The other mutation path: a status column somebody could PATCH
  --  directly through PostgREST, going round the lifecycle engine and
  --  every guard hanging off it. Each workflow table either has no
  --  status column or refuses a direct write to it.
  PERFORM wra_assert('F4','material_lots.status cannot be written directly',
    to_regprocedure('public.fn_material_lots_guard_status()') IS NOT NULL);
  PERFORM wra_assert('F5','batch_records.status cannot be written directly',
    to_regprocedure('public.fn_batch_records_guard_status()') IS NOT NULL);
  PERFORM wra_assert('F6','suppliers.status cannot be written directly',
    to_regprocedure('public.fn_suppliers_guard_status()') IS NOT NULL);
  PERFORM wra_assert('F7','deviations has no status column to write',
    NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='deviations'
                   AND column_name='status'));
END $f2$;


-- ── Results ─────────────────────────────────────────────────────────
SELECT id, name, verdict, detail FROM wra_results ORDER BY seq;

--  TOTAL, PASSED, FAILED, IN THAT ORDER. The harness reads columns 2
--  and 3 as passed and failed, so any other order reports a clean
--  suite as a broken one — which is exactly what the first version of
--  this file did: 23 green assertions printed as "0 passed, 23
--  failed", and nothing in the detail dump, because there were no FAIL
--  rows to find. material_release_readiness_test.sql documents the
--  same trap above its summary.
SELECT count(*) AS total,
       count(*) FILTER (WHERE verdict = 'PASS') AS passed,
       count(*) FILTER (WHERE verdict = 'FAIL') AS failed
FROM wra_results;

DO $cleanup$
BEGIN
  DELETE FROM public.company_members
   WHERE company_id = 'a0a0a0a0-0000-4000-8000-000000000001'::uuid;
  DELETE FROM public.companies WHERE name = 'wra-co';
EXCEPTION WHEN others THEN NULL;
END $cleanup$;
