-- ============================================================================
--  An invitation is the approval (20261217000000_invite_is_approval.sql).
--
--  The change admits an address that Supabase Auth records as invited. A
--  suite for a WIDENED gate has to prove the opposite things from a suite
--  for a new one, so the sections are chosen accordingly:
--
--    A.  the clause admits the invited and still refuses everyone else.
--        A widening that admits everybody passes any test that only
--        checks the happy path.
--    B.  provision_profile — the only caller — now lets an invited
--        session create its profile, WITHOUT reopening the bypass. B2 is
--        the one that matters: it re-runs the original bypass with an
--        INVITED address as the client-supplied argument, which is the
--        exact shape the new clause could have made exploitable.
--    C.  invited_at is really what admitted them. Every assertion in A
--        and B would also pass if the function had simply started
--        returning true, so C closes the door again by clearing the
--        marker and checks the refusal comes back.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

DO $guard$
BEGIN
  IF current_database() NOT IN ('postgres','criateur_local') THEN
    RAISE EXCEPTION 'REFUSING TO RUN: this suite writes fixtures. Database is %', current_database();
  END IF;
END $guard$;

CREATE TEMP TABLE IF NOT EXISTS iia_results(
  id text, name text, status text, detail text
) ON COMMIT PRESERVE ROWS;
TRUNCATE iia_results;

CREATE OR REPLACE FUNCTION pg_temp.iia_ok(p_id text, p_name text, p_cond boolean, p_detail text DEFAULT '')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO iia_results VALUES (p_id, p_name, CASE WHEN p_cond THEN 'PASS' ELSE 'FAIL' END, p_detail);
END $$;

-- ── fixtures ────────────────────────────────────────────────────────────────
--  Three accounts, differing in exactly one attribute each, so a failure
--  names its own cause:
--
--    invited   — invited_at set, NOT on the allowlist   (the new case)
--    plain     — invited_at NULL, NOT on the allowlist  (must stay out)
--    listed    — invited_at NULL, ON the allowlist      (must stay in)

DO $fix$
DECLARE
  u_invited uuid := '00000000-0000-6a11-d000-000000000001';
  u_plain   uuid := '00000000-0000-6a11-d000-000000000002';
  u_listed  uuid := '00000000-0000-6a11-d000-000000000003';
BEGIN
  INSERT INTO auth.users(id, email, invited_at) VALUES
    (u_invited, 'iia-invited@local.test', now()),
    (u_plain,   'iia-plain@local.test',   NULL),
    (u_listed,  'iia-listed@local.test',  NULL)
    ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.allowed_signins(email, note)
  VALUES ('iia-listed@local.test', 'iia fixture')
  ON CONFLICT (email) DO NOTHING;

  --  The gate is only a gate while the list is non-empty: an empty table
  --  means "open" by design, and every assertion below would pass
  --  vacuously. 20261017 seeds the owner, so this holds in practice; it
  --  is asserted rather than assumed.
  IF NOT EXISTS (SELECT 1 FROM public.allowed_signins) THEN
    RAISE EXCEPTION 'PRECONDITION: allowed_signins is empty, so the gate is open and this suite would prove nothing.';
  END IF;
END $fix$;

-- ── A. the clause ───────────────────────────────────────────────────────────

DO $a$
BEGIN
  PERFORM pg_temp.iia_ok('A1','an invited address is admitted though it is not listed',
    public.app_signin_is_allowed('iia-invited@local.test'));

  PERFORM pg_temp.iia_ok('A2','an address that is neither invited nor listed is still refused',
    NOT public.app_signin_is_allowed('iia-plain@local.test'));

  PERFORM pg_temp.iia_ok('A3','a listed address is admitted as before',
    public.app_signin_is_allowed('iia-listed@local.test'));

  --  How an address arrives from a form, and how it is stored in
  --  auth.users, need not agree on case or padding.
  PERFORM pg_temp.iia_ok('A4','case and surrounding space do not matter for an invite',
    public.app_signin_is_allowed('  IIA-Invited@Local.TEST '));

  PERFORM pg_temp.iia_ok('A5','a null address is refused, not admitted',
    NOT public.app_signin_is_allowed(NULL));

  --  An empty argument must not compare equal to an empty stored
  --  address. Without the NULLIF in the function this is admitted.
  PERFORM pg_temp.iia_ok('A6','an empty address is refused, not admitted',
    NOT public.app_signin_is_allowed('   '));

  PERFORM pg_temp.iia_ok('A7','it is not a substring match',
    NOT public.app_signin_is_allowed('iia-invited@local.test.attacker.net'));

  --  An unknown address is the population this gate exists to exclude.
  PERFORM pg_temp.iia_ok('A8','an address with no account at all is refused',
    NOT public.app_signin_is_allowed('iia-nobody@local.test'));
END $a$;

-- ── B. enforcement in provision_profile ─────────────────────────────────────

DO $b$
DECLARE
  u_invited uuid := '00000000-0000-6a11-d000-000000000001';
  u_plain   uuid := '00000000-0000-6a11-d000-000000000002';
  v_err  text;
  v_role text;
BEGIN
  -- B1 — THE FIX. This is the call that failed in production with
  -- SIGNIN_NOT_ALLOWED and left the person owning companies they could
  -- not reach.
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub',u_invited)::text, true);
    PERFORM public.provision_profile('iia-invited@local.test','Invited User','IIA Co',NULL,false,NULL,NULL,NULL);
    PERFORM pg_temp.iia_ok('B1','an invited session provisions its profile',
      EXISTS (SELECT 1 FROM public.profiles WHERE id = u_invited));
  EXCEPTION WHEN others THEN
    v_err := SQLERRM;
    PERFORM pg_temp.iia_ok('B1','an invited session provisions its profile', false, v_err);
  END;

  -- B2 — THE BYPASS, re-run with the new clause. An uninvited, unlisted
  -- session names an INVITED address as the argument. If the guard read
  -- p_email this would now be the easiest way in: invited addresses are
  -- colleagues' addresses, not secrets.
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub',u_plain)::text, true);
    PERFORM public.provision_profile('iia-invited@local.test');
    PERFORM pg_temp.iia_ok('B2','naming an invited address does not get an uninvited session in',
      false, 'BYPASSED: the client-supplied address was trusted');
  EXCEPTION WHEN others THEN
    v_err := SQLERRM;
    PERFORM pg_temp.iia_ok('B2','naming an invited address does not get an uninvited session in',
      v_err LIKE 'SIGNIN_NOT_ALLOWED%', v_err);
  END;

  -- B3 — the gate is still a gate. A refusal for nobody would pass B1.
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub',u_plain)::text, true);
    PERFORM public.provision_profile('iia-plain@local.test');
    PERFORM pg_temp.iia_ok('B3','an uninvited, unlisted session is still refused',
      false, 'IT SUCCEEDED');
  EXCEPTION WHEN others THEN
    v_err := SQLERRM;
    PERFORM pg_temp.iia_ok('B3','an uninvited, unlisted session is still refused',
      v_err LIKE 'SIGNIN_NOT_ALLOWED%', v_err);
  END;

  -- B4 — an invite buys a profile, not a privilege. The role is written
  -- by the server; this confirms the widened door does not open onto a
  -- better room.
  SELECT role INTO v_role FROM public.profiles WHERE id = u_invited;
  PERFORM pg_temp.iia_ok('B4','the invited profile holds the least-privileged role',
    v_role = 'content_creator', coalesce('role=' || v_role, 'NO PROFILE ROW'));

  PERFORM pg_temp.iia_ok('B5','the invited profile claims no custom role',
    EXISTS (SELECT 1 FROM public.profiles WHERE id = u_invited AND custom_role_id IS NULL));

  PERFORM set_config('request.jwt.claims', '', true);
END $b$;

-- ── C. invited_at is what did it ────────────────────────────────────────────
--  Without this section every assertion above would also pass against a
--  function that had simply started returning true.

DO $c$
DECLARE
  u_invited uuid := '00000000-0000-6a11-d000-000000000001';
BEGIN
  UPDATE auth.users SET invited_at = NULL WHERE id = u_invited;

  PERFORM pg_temp.iia_ok('C1','clearing invited_at closes the door again',
    NOT public.app_signin_is_allowed('iia-invited@local.test'));

  UPDATE auth.users SET invited_at = now() WHERE id = u_invited;

  PERFORM pg_temp.iia_ok('C2','restoring invited_at opens it',
    public.app_signin_is_allowed('iia-invited@local.test'));

  --  A self-signup must not be marked invited by any default or trigger,
  --  here or in the shim. If this fails the whole gate is open and A2
  --  only passed by accident of ordering.
  PERFORM pg_temp.iia_ok('C3','a self-signup account carries no invite marker',
    EXISTS (SELECT 1 FROM auth.users WHERE email = 'iia-plain@local.test' AND invited_at IS NULL));
END $c$;

-- ── summary ─────────────────────────────────────────────────────────────────

SELECT id, name, status, detail FROM iia_results ORDER BY id;

--  Column order is total, passed, failed — the shape the harness reads.
SELECT
  count(*)                                AS total,
  count(*) FILTER (WHERE status = 'PASS') AS passed,
  count(*) FILTER (WHERE status = 'FAIL') AS failed
FROM iia_results;

-- ── cleanup ─────────────────────────────────────────────────────────────────

DO $cleanup$
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  DELETE FROM public.company_members WHERE user_id::text LIKE '00000000-0000-6a11-d000-%';
  DELETE FROM public.profiles        WHERE email LIKE 'iia-%@local.test';
  DELETE FROM auth.users             WHERE email LIKE 'iia-%@local.test';
  DELETE FROM public.allowed_signins WHERE email LIKE 'iia-%@local.test';
  DELETE FROM public.companies       WHERE name = 'IIA Co';
  RAISE NOTICE 'iia fixtures removed.';
EXCEPTION WHEN others THEN
  RAISE WARNING 'CLEANUP INCOMPLETE (%). Remove iia rows manually.', SQLERRM;
END $cleanup$;
