-- =====================================================================
--  CLOSED-BY-DEFAULT SIGNUP (20261214000000)
--
--  A. The policy row and its shape
--  B. The gate's four answers
--  C. Public signup is a deliberate switch, not the absence of data
--  D. A damaged configuration is CLOSED, not open
--  E. The administrator surface refuses non-administrators
--  F. The policy is not readable or writable from a browser
--  G. Both gates still call the one function
--
--  WHY THIS FILE EXISTS
--  --------------------
--  `app_signin_is_allowed` used to begin with
--
--      NOT EXISTS (SELECT 1 FROM allowed_signins)
--
--  so an EMPTY allowlist admitted everyone. The product requirement is the
--  opposite: only approved addresses may register. The risk in changing it
--  is that "deny everyone" is also what a broken configuration looks like,
--  so B and D together pin the difference — a deliberate switch opens the
--  product, and a missing or damaged policy row does not.
-- =====================================================================
\set ON_ERROR_STOP on
SET client_min_messages = warning;

CREATE TEMP TABLE _s(section text, name text, ok boolean, detail text);
CREATE OR REPLACE FUNCTION _sk(p_section text, p_name text, p_ok boolean, p_detail text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO _s VALUES (p_section,p_name,coalesce(p_ok,false),p_detail); END $$;

GRANT ALL ON _s TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION _sk(text,text,boolean,text) TO anon, authenticated, service_role;


-- ── Fixture ──────────────────────────────────────────────────────────
/*
 *  Everything here runs against a saved copy of both tables and restores
 *  them at the end, because emptying `allowed_signins` is exactly what
 *  section B has to do and leaving it empty would deny every later suite's
 *  fixtures. The approver trigger is disabled around the fixture for the
 *  same reason allowlist_enabled_state_test.sql does it.
 */
ALTER TABLE public.access_approvers DISABLE TRIGGER trg_access_approvers_keep_one;

CREATE TEMP TABLE _saved_allow AS SELECT * FROM public.allowed_signins;
CREATE TEMP TABLE _saved_policy AS SELECT * FROM public.signin_policy;

--  id and email only. The suites run against scripts/ci/db-bootstrap.sql's
--  shim of auth.users, which has six columns and none of GoTrue's token
--  columns — naming instance_id here aborted the whole file, and the
--  harness reported it as NO ASSERTIONS REPORTED, which is how it was
--  found. Every other suite inserts the same two columns for this reason.
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-7d01-b000-000000000001','policy.admin@signin.test'),
  ('00000000-0000-7d01-b000-000000000002','policy.user@signin.test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, email, role)
VALUES ('00000000-0000-7d01-b000-000000000001','policy.admin@signin.test','admin'),
       ('00000000-0000-7d01-b000-000000000002','policy.user@signin.test','content_creator')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.access_approvers (user_id)
VALUES ('00000000-0000-7d01-b000-000000000001') ON CONFLICT DO NOTHING;

DELETE FROM public.allowed_signins;
--  `disabled_at` must be set in the same row as is_enabled = false:
--  allowed_signins_disabled_shape_chk refuses "disabled but nobody knows
--  when", so setting the flag first and the timestamp afterwards is
--  rejected outright.
INSERT INTO public.allowed_signins (email, note, is_enabled, disabled_at)
VALUES ('listed@signin.test', 'policy suite', true,  NULL),
       ('off@signin.test',    'policy suite', false, now());


-- =====================================================================
--  A — the policy row and its shape
-- =====================================================================
DO $a$
DECLARE n integer; ok boolean;
BEGIN
  PERFORM _sk('A','A1 signin_policy exists',
              to_regclass('public.signin_policy') IS NOT NULL);

  SELECT count(*) INTO n FROM public.signin_policy;
  PERFORM _sk('A','A2 it holds exactly one row', n = 1, n||' row(s)');

  SELECT public_signup_enabled INTO ok FROM public.signin_policy WHERE id;
  PERFORM _sk('A','A3 public signup is OFF by default', ok IS FALSE);

  --  A second row cannot exist, so there is never a question of which one
  --  the gate reads.
  BEGIN
    INSERT INTO public.signin_policy (id, public_signup_enabled, reason, enabled_at)
    VALUES (false, true, 'second row', now());
    PERFORM _sk('A','A4 a second policy row is refused', false, 'it was accepted');
  EXCEPTION WHEN check_violation THEN
    PERFORM _sk('A','A4 a second policy row is refused', true);
  END;

  --  "Open, but nobody recorded why" is not a record.
  BEGIN
    UPDATE public.signin_policy SET public_signup_enabled = true, reason = NULL WHERE id;
    PERFORM _sk('A','A5 opening signup without a reason is refused', false, 'it was accepted');
  EXCEPTION WHEN check_violation THEN
    PERFORM _sk('A','A5 opening signup without a reason is refused', true);
  END;
END
$a$;


-- =====================================================================
--  B — the gate's four answers
-- =====================================================================
DO $b$
BEGIN
  PERFORM _sk('B','B1 an enabled, listed address is allowed',
              public.app_signin_is_allowed('listed@signin.test'));

  PERFORM _sk('B','B2 a disabled address is denied',
              NOT public.app_signin_is_allowed('off@signin.test'));

  PERFORM _sk('B','B3 an unlisted address is denied',
              NOT public.app_signin_is_allowed('stranger@signin.test'));

  --  Normalisation must stay identical to the hook's, or an address
  --  approved in the table would be refused at signup.
  PERFORM _sk('B','B4 matching is case- and space-insensitive',
              public.app_signin_is_allowed('  LISTED@Signin.TEST  '));

  --  THE CHANGE. This returned true before 20261214000000.
  DELETE FROM public.allowed_signins;
  PERFORM _sk('B','B5 an EMPTY allowlist denies everyone',
              NOT public.app_signin_is_allowed('anyone@signin.test'));

  --  And a list that exists but matches nothing is the same answer, so
  --  there is no state in between.
  INSERT INTO public.allowed_signins (email, note, is_enabled, disabled_at)
  VALUES ('off@signin.test', 'policy suite', false, now());
  PERFORM _sk('B','B6 a wholly disabled allowlist denies everyone',
              NOT public.app_signin_is_allowed('off@signin.test'));
END
$b$;


-- =====================================================================
--  C — public signup is a deliberate switch
-- =====================================================================
DO $c$
BEGIN
  --  Still empty of enabled addresses from B. The ONLY thing that opens it
  --  is the switch.
  UPDATE public.signin_policy
     SET public_signup_enabled = true, reason = 'suite: opened deliberately',
         enabled_at = now()
   WHERE id;

  PERFORM _sk('C','C1 with the switch on, an unlisted address is allowed',
              public.app_signin_is_allowed('anyone@signin.test'));
  PERFORM _sk('C','C2 app_public_signup_enabled() reports it',
              public.app_public_signup_enabled());

  UPDATE public.signin_policy
     SET public_signup_enabled = false, reason = NULL, enabled_at = NULL, enabled_by = NULL
   WHERE id;

  PERFORM _sk('C','C3 turning it off closes the product again',
              NOT public.app_signin_is_allowed('anyone@signin.test'));

  --  A disabled entry is not rescued by the switch being off, and an
  --  enabled one does not need the switch at all.
  INSERT INTO public.allowed_signins (email, note, is_enabled)
  VALUES ('listed@signin.test', 'policy suite', true)
  ON CONFLICT (email) DO UPDATE SET is_enabled = true, disabled_at = NULL;

  PERFORM _sk('C','C4 an approved address is allowed with the switch off',
              public.app_signin_is_allowed('listed@signin.test'));
END
$c$;


-- =====================================================================
--  D — a damaged configuration is CLOSED, not open
-- =====================================================================
DO $d$
BEGIN
  /*
   *  The failure mode worth guarding. "Deny everyone" is also what a
   *  broken configuration looks like, and the wrong default would turn a
   *  deleted row — a restore gone wrong, a bad migration — into an open
   *  front door that nobody notices, because the symptom is signups
   *  succeeding.
   */
  DELETE FROM public.signin_policy;
  PERFORM _sk('D','D1 with no policy row at all, public signup reads FALSE',
              NOT public.app_public_signup_enabled());
  PERFORM _sk('D','D2 and an unlisted address is still denied',
              NOT public.app_signin_is_allowed('anyone@signin.test'));
  PERFORM _sk('D','D3 while an approved address still works',
              public.app_signin_is_allowed('listed@signin.test'));

  INSERT INTO public.signin_policy (id, public_signup_enabled) VALUES (true, false);
END
$d$;


-- =====================================================================
--  E — the administrator surface refuses non-administrators
-- =====================================================================
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-7d01-b000-000000000002","role":"authenticated"}', false);
SET ROLE authenticated;

DO $e$
BEGIN
  BEGIN
    PERFORM public.admin_set_public_signup(true, 'should not be permitted');
    PERFORM _sk('E','E1 a non-approver cannot open public signup', false, 'it succeeded');
  EXCEPTION WHEN OTHERS THEN
    PERFORM _sk('E','E1 a non-approver cannot open public signup',
                SQLERRM LIKE '%ALLOWLIST_NOT_PERMITTED%', SQLERRM);
  END;
END
$e$;

RESET ROLE;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-7d01-b000-000000000001","role":"authenticated"}', false);
SET ROLE authenticated;

/*
 *  The writes happen as the approver; the READS happen after RESET ROLE.
 *
 *  Not a convenience: `authenticated` deliberately holds no grant on
 *  signin_policy, so selecting from it under that role is refused — which
 *  aborted this file until the reads were moved out. That refusal is the
 *  behaviour section F asserts, so the suite has to respect it rather than
 *  grant its way around it.
 */
DO $e2$
BEGIN
  BEGIN
    PERFORM public.admin_set_public_signup(true, NULL);
    PERFORM _sk('E','E2 an approver still cannot open it without a reason', false, 'it succeeded');
  EXCEPTION WHEN OTHERS THEN
    PERFORM _sk('E','E2 an approver still cannot open it without a reason',
                SQLERRM LIKE '%SIGNUP_POLICY_REASON_REQUIRED%', SQLERRM);
  END;

  --  Readable under this role only through the SECURITY DEFINER function,
  --  which is the point of having one.
  PERFORM public.admin_set_public_signup(true, 'suite: approver opened it');
  PERFORM _sk('E','E3 an approver can open it with a reason',
              public.app_public_signup_enabled());
END
$e2$;

RESET ROLE;
SELECT set_config('request.jwt.claims', NULL, false);

DO $e3$
DECLARE ok boolean; r text; who uuid;
BEGIN
  SELECT public_signup_enabled, reason, enabled_by INTO ok, r, who
    FROM public.signin_policy WHERE id;
  PERFORM _sk('E','E4 the switch is on and the reason is stored',
              ok IS TRUE AND r = 'suite: approver opened it', coalesce(r,'null'));
  --  Who did it, not just that it happened.
  PERFORM _sk('E','E5 the actor is recorded',
              who = '00000000-0000-7d01-b000-000000000001', coalesce(who::text,'null'));
END
$e3$;

SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-7d01-b000-000000000001","role":"authenticated"}', false);
SET ROLE authenticated;
SELECT public.admin_set_public_signup(false, NULL);
RESET ROLE;
SELECT set_config('request.jwt.claims', NULL, false);

DO $e4$
DECLARE ok boolean;
BEGIN
  SELECT public_signup_enabled INTO ok FROM public.signin_policy WHERE id;
  PERFORM _sk('E','E6 closing it again needs no reason', ok IS FALSE);
END
$e4$;


-- =====================================================================
--  F — the policy is not readable or writable from a browser
-- =====================================================================
DO $f$
DECLARE n integer;
BEGIN
  PERFORM _sk('F','F1 RLS is enabled on signin_policy',
              (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.signin_policy'::regclass));

  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'signin_policy';
  --  No policy at all, like allowed_signins: whether a product is in
  --  closed pilot is not something a browser needs to read.
  PERFORM _sk('F','F2 and it carries no policy, so nobody reads it directly', n = 0, n||' policy(ies)');

  SELECT count(*) INTO n FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'signin_policy'
     AND grantee IN ('anon','authenticated');
  PERFORM _sk('F','F3 neither anon nor authenticated hold a table grant', n = 0, n||' grant(s)');
END
$f$;


-- =====================================================================
--  G — both gates still call the one function
-- =====================================================================
DO $g$
DECLARE v_src text;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'provision_profile';
  PERFORM _sk('G','G1 provision_profile still calls app_signin_is_allowed',
              v_src LIKE '%app_signin_is_allowed%');

  SELECT prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'app_signin_is_allowed';
  --  The removed clause, named explicitly: if it ever comes back, an empty
  --  allowlist opens the product again and this is the only place that
  --  would notice.
  PERFORM _sk('G','G2 the empty-table open door is gone',
              v_src NOT LIKE '%NOT EXISTS (SELECT 1 FROM public.allowed_signins)%');
  PERFORM _sk('G','G3 and the gate consults the policy switch',
              v_src LIKE '%app_public_signup_enabled%');
END
$g$;


-- ── Teardown ─────────────────────────────────────────────────────────
DELETE FROM public.allowed_signins;
INSERT INTO public.allowed_signins SELECT * FROM _saved_allow;
DELETE FROM public.signin_policy;
INSERT INTO public.signin_policy SELECT * FROM _saved_policy;
DELETE FROM public.access_approvers WHERE user_id = '00000000-0000-7d01-b000-000000000001';
DELETE FROM public.profiles WHERE id IN ('00000000-0000-7d01-b000-000000000001',
                                         '00000000-0000-7d01-b000-000000000002');
DELETE FROM auth.users WHERE id IN ('00000000-0000-7d01-b000-000000000001',
                                    '00000000-0000-7d01-b000-000000000002');
ALTER TABLE public.access_approvers ENABLE TRIGGER trg_access_approvers_keep_one;


-- ── Summary ──────────────────────────────────────────────────────────
SELECT count(*) AS total,
       count(*) FILTER (WHERE ok) AS passed,
       count(*) FILTER (WHERE NOT ok) AS failed
  FROM _s;

SELECT section, name, detail FROM _s WHERE NOT ok ORDER BY section, name;

DO $done$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM _s WHERE NOT ok;
  IF n > 0 THEN
    RAISE EXCEPTION '% assertion(s) failed in signin_policy_test.sql', n;
  END IF;
END
$done$;
