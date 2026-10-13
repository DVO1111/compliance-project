-- ============================================================================
--  The sign-in allowlist (20261017000000_signin_allowlist.sql).
--
--  The thing worth testing here is not that a listed address gets in.
--  It is the three ways a gate like this is quietly not a gate:
--
--    A.  it reads the address the CALLER SENT rather than the one the
--        session proves, so naming an allowlisted address is enough;
--    B.  it runs before the identity checks, so it changes what an
--        anonymous caller is told;
--    C.  it is on at all — an empty list means open, by design, and a
--        test that never checks the closed case passes against a gate
--        that admits everyone.
--
--  A is a real bypass and was present in the first draft of the
--  migration: the guard read p_email. Section C is the test that would
--  have caught it.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

DO $guard$
BEGIN
  IF current_database() NOT IN ('postgres','criateur_local') THEN
    RAISE EXCEPTION 'REFUSING TO RUN: this suite writes fixtures. Database is %', current_database();
  END IF;
END $guard$;

CREATE TEMP TABLE IF NOT EXISTS sal_results(
  id text, name text, status text, detail text
) ON COMMIT PRESERVE ROWS;
TRUNCATE sal_results;

CREATE OR REPLACE FUNCTION pg_temp.sal_ok(p_id text, p_name text, p_cond boolean, p_detail text DEFAULT '')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO sal_results VALUES (p_id, p_name, CASE WHEN p_cond THEN 'PASS' ELSE 'FAIL' END, p_detail);
END $$;

-- ── fixtures ────────────────────────────────────────────────────────────────

DO $fix$
DECLARE
  u_in  uuid := '00000000-0000-6a11-c000-000000000001';  -- listed
  u_out uuid := '00000000-0000-6a11-c000-000000000002';  -- not listed
BEGIN
  INSERT INTO auth.users(id,email) VALUES
    (u_in, 'sal-listed@local.test'),
    (u_out,'sal-unlisted@local.test')
    ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.allowed_signins(email, note)
  VALUES ('sal-listed@local.test','sal fixture')
  ON CONFLICT (email) DO NOTHING;
END $fix$;

-- ── A. the mechanism ────────────────────────────────────────────────────────

DO $a$
BEGIN
  PERFORM pg_temp.sal_ok('A1','a listed address is admitted',
    public.app_signin_is_allowed('sal-listed@local.test'));

  PERFORM pg_temp.sal_ok('A2','an unlisted address is refused',
    NOT public.app_signin_is_allowed('sal-unlisted@local.test'));

  --  Case and padding are how an address arrives from a form.
  PERFORM pg_temp.sal_ok('A3','case and surrounding space do not matter',
    public.app_signin_is_allowed('  SAL-Listed@Local.TEST '));

  PERFORM pg_temp.sal_ok('A4','a null address is refused, not admitted',
    NOT public.app_signin_is_allowed(NULL));

  --  A substring match would admit an attacker-controlled domain.
  PERFORM pg_temp.sal_ok('A5','it is not a substring match',
    NOT public.app_signin_is_allowed('sal-listed@local.test.attacker.net'));
END $a$;

-- ── B. enforcement in provision_profile ─────────────────────────────────────

DO $b$
DECLARE
  u_in  uuid := '00000000-0000-6a11-c000-000000000001';
  u_out uuid := '00000000-0000-6a11-c000-000000000002';
  v_err text;
BEGIN
  -- B1 — the unlisted user cannot provision.
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub',u_out)::text, true);
    PERFORM public.provision_profile('sal-unlisted@local.test');
    PERFORM pg_temp.sal_ok('B1','an unlisted session cannot provision a profile', false, 'IT SUCCEEDED');
  EXCEPTION WHEN others THEN
    v_err := SQLERRM;
    PERFORM pg_temp.sal_ok('B1','an unlisted session cannot provision a profile',
      v_err LIKE 'SIGNIN_NOT_ALLOWED%', v_err);
  END;

  -- B2 — THE BYPASS. The unlisted user names a LISTED address as the
  -- argument. p_email is client input; the gate must read the address
  -- the session proves. The first draft of the migration failed this.
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub',u_out)::text, true);
    PERFORM public.provision_profile('sal-listed@local.test');
    PERFORM pg_temp.sal_ok('B2','naming a listed address does not get an unlisted session in',
      false, 'BYPASSED: the client-supplied address was trusted');
  EXCEPTION WHEN others THEN
    v_err := SQLERRM;
    PERFORM pg_temp.sal_ok('B2','naming a listed address does not get an unlisted session in',
      v_err LIKE 'SIGNIN_NOT_ALLOWED%', v_err);
  END;

  -- B3 — the listed user is let through. Proves the gate is a gate and
  -- not a wall: a refusal for everyone would pass B1 and B2.
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub',u_in)::text, true);
    PERFORM public.provision_profile('sal-listed@local.test','Listed User','SAL Co',NULL,false,NULL,NULL,NULL);
    PERFORM pg_temp.sal_ok('B3','a listed session provisions normally', true);
  EXCEPTION WHEN others THEN
    v_err := SQLERRM;
    PERFORM pg_temp.sal_ok('B3','a listed session provisions normally', false, v_err);
  END;

  -- B4 — an anonymous caller is told it is unauthenticated, not that it
  -- is unlisted. Ordering: the allowlist must not pre-empt identity.
  BEGIN
    PERFORM set_config('request.jwt.claims', '', true);
    PERFORM public.provision_profile('sal-listed@local.test');
    PERFORM pg_temp.sal_ok('B4','an anonymous caller is refused as unauthenticated', false, 'IT SUCCEEDED');
  EXCEPTION WHEN others THEN
    v_err := SQLERRM;
    PERFORM pg_temp.sal_ok('B4','an anonymous caller is refused as unauthenticated',
      v_err LIKE 'PROFILE_NOT_AUTHENTICATED%', v_err);
  END;

  PERFORM set_config('request.jwt.claims', '', true);
END $b$;

-- ── C. the gate is on ───────────────────────────────────────────────────────
--  An empty table means open, deliberately. So "is it closed right now"
--  is a real assertion and not a tautology: every test above would pass
--  against a function that admitted everyone if the table were empty.

DO $c$
BEGIN
  PERFORM pg_temp.sal_ok('C1','the list is not empty, so the gate is closed by default',
    EXISTS (SELECT 1 FROM public.allowed_signins));

  PERFORM pg_temp.sal_ok('C2','the owner address shipped with the migration is present',
    EXISTS (SELECT 1 FROM public.allowed_signins WHERE email = 'ayomideelijah1@gmail.com'));

  --  Lower-case is enforced by a constraint, not by convention: an entry
  --  stored with a capital would never match, and would read as admitted.
  BEGIN
    INSERT INTO public.allowed_signins(email) VALUES ('SAL-Upper@local.test');
    PERFORM pg_temp.sal_ok('C3','an upper-case entry is refused by the table', false, 'IT WAS ACCEPTED');
    DELETE FROM public.allowed_signins WHERE email = 'SAL-Upper@local.test';
  EXCEPTION WHEN check_violation THEN
    PERFORM pg_temp.sal_ok('C3','an upper-case entry is refused by the table', true);
  END;
END $c$;

-- ── summary ─────────────────────────────────────────────────────────────────

SELECT id, name, status, detail FROM sal_results ORDER BY id;

--  Column order is total, passed, failed — the shape the harness reads
--  (scripts/ci/run-sql-tests.sh takes passed from the second column and
--  failed from the third). Emitting PASS | FAIL | TOTAL instead reports
--  a clean suite as entirely failed, which is how this suite first ran.
SELECT
  count(*)                                AS total,
  count(*) FILTER (WHERE status = 'PASS') AS passed,
  count(*) FILTER (WHERE status = 'FAIL') AS failed
FROM sal_results;

-- ── cleanup ─────────────────────────────────────────────────────────────────

DO $cleanup$
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  DELETE FROM public.company_members WHERE user_id::text LIKE '00000000-0000-6a11-c000-%';
  DELETE FROM public.profiles        WHERE email LIKE 'sal-%@local.test';
  DELETE FROM auth.users             WHERE email LIKE 'sal-%@local.test';
  DELETE FROM public.allowed_signins WHERE email LIKE 'sal-%@local.test';
  DELETE FROM public.companies       WHERE name = 'SAL Co';
  RAISE NOTICE 'sal fixtures removed.';
EXCEPTION WHEN others THEN
  RAISE WARNING 'CLEANUP INCOMPLETE (%). Remove sal rows manually.', SQLERRM;
END $cleanup$;
