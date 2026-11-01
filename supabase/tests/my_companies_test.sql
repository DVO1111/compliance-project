-- =====================================================================
--  app_my_companies()  —  THE WORKSPACE LIST  (20261215000000)
--
--  A. The function's shape and privileges
--  B. It answers for the CALLER and for nobody else
--  C. Only ACTIVE memberships are offered
--  D. Names come back, including when the company row is unhelpful
--  E. It agrees with the tenant boundary it sits beside
--
--  WHY THIS FILE EXISTS
--  --------------------
--  This function is what the company switcher offers a person, so a fault
--  in it is a fault in who is shown which workspace. Two kinds of fault
--  would matter, and they fail in opposite directions:
--
--    * TOO WIDE — a company appears that the person is not an active
--      member of. Nothing leaks (the data behind it is guarded by
--      app_is_company_member() on every statement, and section E pins
--      that the two use the same condition), but the interface would be
--      offering a workspace that reads as empty, and a revoked membership
--      would look like a bug rather than a revocation.
--
--    * TOO NARROW — a company the person does hold is missing, so a
--      working workspace becomes unreachable from the interface. That is
--      the harder one to diagnose, which is why D covers the awkward rows
--      rather than only the tidy ones.
--
--  The function takes NO ARGUMENT by design. Section B is the test of that
--  decision: there is no parameter through which a caller could ask about
--  somebody else, so the usual "can I pass another user's id" class of
--  fault cannot exist here, and this suite proves the identity really is
--  taken from the session.
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
 *  Two people and three companies, arranged so that every interesting
 *  case is somebody's actual situation rather than a contrivance:
 *
 *    ALEX  — active in ACME and in BETA         (two workspaces: switchable)
 *          — SUSPENDED in GAMMA                 (must not be offered)
 *    BLAKE — active in BETA only                (one workspace: no switcher)
 *
 *  GAMMA also carries a blank name, which is the awkward row section D is
 *  about: a membership whose company is unnamed is still a membership.
 */
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-7d02-b000-0000000000a1', 'alex@my-companies.test'),
  ('00000000-0000-7d02-b000-0000000000b1', 'blake@my-companies.test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.companies (id, name) VALUES
  ('00000000-0000-7d02-c000-00000000ace0', 'Acme Pharmaceuticals'),
  ('00000000-0000-7d02-c000-00000000beef', 'Beta Foods'),
  ('00000000-0000-7d02-c000-00000000dade', '   ')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.company_members (company_id, user_id, role, status) VALUES
  ('00000000-0000-7d02-c000-00000000ace0', '00000000-0000-7d02-b000-0000000000a1', 'owner',  'active'),
  ('00000000-0000-7d02-c000-00000000beef', '00000000-0000-7d02-b000-0000000000a1', 'member', 'active'),
  ('00000000-0000-7d02-c000-00000000dade', '00000000-0000-7d02-b000-0000000000a1', 'owner',  'suspended'),
  ('00000000-0000-7d02-c000-00000000beef', '00000000-0000-7d02-b000-0000000000b1', 'admin',  'active')
ON CONFLICT (company_id, user_id) DO UPDATE
  SET role = EXCLUDED.role, status = EXCLUDED.status;


-- ── A. Shape and privileges ──────────────────────────────────────────
DO $a$
DECLARE v_secdef boolean; v_args text; v_vol char; v_anon boolean; v_auth boolean;
BEGIN
  SELECT p.prosecdef, pg_get_function_identity_arguments(p.oid), p.provolatile
    INTO v_secdef, v_args, v_vol
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'app_my_companies';

  PERFORM _sk('A', 'the function exists', v_secdef IS NOT NULL);

  --  SECURITY DEFINER is not incidental: `companies` has RLS on and no
  --  policy, so an INVOKER function would read no names at all.
  PERFORM _sk('A', 'it is SECURITY DEFINER', v_secdef, 'prosecdef=' || coalesce(v_secdef::text,'null'));

  --  NO ARGUMENTS. This is the security property, not a convenience: a
  --  caller cannot name a user, so there is nothing to tamper with.
  PERFORM _sk('A', 'it takes no argument', coalesce(v_args,'x') = '',
              'args=' || coalesce(v_args,'null'));

  PERFORM _sk('A', 'it is read-only (stable)', v_vol = 's', 'provolatile=' || coalesce(v_vol,'null'));

  SELECT has_function_privilege('anon',          'public.app_my_companies()', 'EXECUTE'),
         has_function_privilege('authenticated', 'public.app_my_companies()', 'EXECUTE')
    INTO v_anon, v_auth;

  --  A signed-out caller has no business asking. auth.uid() would be null
  --  and the answer empty anyway, but the grant is withheld regardless.
  PERFORM _sk('A', 'anon may NOT execute it', NOT v_anon);
  PERFORM _sk('A', 'authenticated may execute it', v_auth);
END
$a$;


-- ── B. It answers for the caller ─────────────────────────────────────
DO $b$
DECLARE v_alex int; v_blake int; v_none int; v_names text;
BEGIN
  --  Same statement, three different sessions, three different answers.
  PERFORM set_config('request.jwt.claims',
    '{"sub":"00000000-0000-7d02-b000-0000000000a1","role":"authenticated"}', true);
  SELECT count(*) INTO v_alex FROM public.app_my_companies();

  PERFORM set_config('request.jwt.claims',
    '{"sub":"00000000-0000-7d02-b000-0000000000b1","role":"authenticated"}', true);
  SELECT count(*) INTO v_blake FROM public.app_my_companies();
  SELECT string_agg(company_name, ', ' ORDER BY company_name) INTO v_names
    FROM public.app_my_companies();

  --  No session at all. Not "everything", not an error: nothing.
  PERFORM set_config('request.jwt.claims', NULL, true);
  SELECT count(*) INTO v_none FROM public.app_my_companies();

  PERFORM _sk('B', 'alex gets his two active workspaces', v_alex = 2, 'count=' || v_alex);
  PERFORM _sk('B', 'blake gets his one', v_blake = 1, 'count=' || v_blake);
  PERFORM _sk('B', 'and blake gets HIS, not alex''s', v_names = 'Beta Foods',
              'names=' || coalesce(v_names,'null'));
  PERFORM _sk('B', 'no session returns no rows', v_none = 0, 'count=' || v_none);
END
$b$;


-- ── C. Only active memberships ───────────────────────────────────────
DO $c$
DECLARE v_has_gamma boolean; v_before int; v_after int;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"00000000-0000-7d02-b000-0000000000a1","role":"authenticated"}', true);

  SELECT EXISTS (SELECT 1 FROM public.app_my_companies()
                  WHERE company_id = '00000000-0000-7d02-c000-00000000dade')
    INTO v_has_gamma;
  --  Alex is an OWNER of Gamma. He is also suspended there, and that is
  --  the fact that decides it — a suspended owner is not offered the
  --  workspace, because app_is_company_member() would refuse him its data.
  PERFORM _sk('C', 'a suspended membership is not offered', NOT v_has_gamma);

  SELECT count(*) INTO v_before FROM public.app_my_companies();

  --  Revoke Beta, then ask again IN THE SAME SESSION. The list is not
  --  cached anywhere server-side, so the revocation takes effect at once.
  UPDATE public.company_members SET status = 'removed'
   WHERE user_id = '00000000-0000-7d02-b000-0000000000a1'
     AND company_id = '00000000-0000-7d02-c000-00000000beef';

  SELECT count(*) INTO v_after FROM public.app_my_companies();
  PERFORM _sk('C', 'a revoked membership disappears immediately',
              v_before = 2 AND v_after = 1, 'before=' || v_before || ' after=' || v_after);

  UPDATE public.company_members SET status = 'active'
   WHERE user_id = '00000000-0000-7d02-b000-0000000000a1'
     AND company_id = '00000000-0000-7d02-c000-00000000beef';
END
$c$;


-- ── D. Names, including the unhelpful ones ───────────────────────────
DO $d$
DECLARE v_name text; v_role text; v_gamma_name text; v_orphan_count int;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"00000000-0000-7d02-b000-0000000000a1","role":"authenticated"}', true);

  SELECT company_name, role INTO v_name, v_role
    FROM public.app_my_companies()
   WHERE company_id = '00000000-0000-7d02-c000-00000000ace0';

  --  The name is the entire reason this function exists rather than the
  --  client reading company_members directly.
  PERFORM _sk('D', 'the company name comes back', v_name = 'Acme Pharmaceuticals',
              'name=' || coalesce(v_name,'null'));

  --  And the PER-COMPANY role, which is the field most likely to differ
  --  between two of one person's workspaces.
  PERFORM _sk('D', 'the caller''s role in that company comes back', v_role = 'owner',
              'role=' || coalesce(v_role,'null'));

  --  A blank name must not come back blank — the switcher would render an
  --  unlabelled row that cannot be told apart from any other.
  UPDATE public.company_members SET status = 'active'
   WHERE user_id = '00000000-0000-7d02-b000-0000000000a1'
     AND company_id = '00000000-0000-7d02-c000-00000000dade';
  SELECT company_name INTO v_gamma_name FROM public.app_my_companies()
   WHERE company_id = '00000000-0000-7d02-c000-00000000dade';
  PERFORM _sk('D', 'a blank company name is replaced, not passed through',
              v_gamma_name IS NOT NULL AND btrim(v_gamma_name) <> '',
              'name=' || coalesce('[' || v_gamma_name || ']','null'));

  --  A membership whose company row does not exist. The data behind it is
  --  still readable — the RLS helper reads company_members, not
  --  companies — so dropping it here would hide a working workspace.
  INSERT INTO public.company_members (company_id, user_id, role, status)
  VALUES ('00000000-0000-7d02-c000-0000000ff000', '00000000-0000-7d02-b000-0000000000a1', 'owner', 'active')
  ON CONFLICT (company_id, user_id) DO NOTHING;

  SELECT count(*) INTO v_orphan_count FROM public.app_my_companies()
   WHERE company_id = '00000000-0000-7d02-c000-0000000ff000';
  PERFORM _sk('D', 'a membership with no company row is still listed', v_orphan_count = 1,
              'count=' || v_orphan_count);

  DELETE FROM public.company_members
   WHERE company_id = '00000000-0000-7d02-c000-0000000ff000';
  UPDATE public.company_members SET status = 'suspended'
   WHERE user_id = '00000000-0000-7d02-b000-0000000000a1'
     AND company_id = '00000000-0000-7d02-c000-00000000dade';
END
$d$;


-- ── E. It agrees with the tenant boundary ────────────────────────────
DO $e$
DECLARE r record; v_mismatch int := 0; v_checked int := 0;
BEGIN
  /*
   *  THE PROPERTY THAT MATTERS MOST.
   *
   *  The switcher offers what this function returns; the data is guarded
   *  by app_is_company_member(). If those two ever disagreed, the product
   *  would either offer a workspace that reads as empty or hide one that
   *  works. Both use `status = 'active'`, so they agree by construction —
   *  this walks every membership of both test users and checks it row by
   *  row rather than trusting that the two definitions stayed in step.
   */
  FOR r IN
    SELECT cm.user_id, cm.company_id
      FROM public.company_members cm
     WHERE cm.user_id IN ('00000000-0000-7d02-b000-0000000000a1',
                          '00000000-0000-7d02-b000-0000000000b1')
  LOOP
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', r.user_id, 'role', 'authenticated')::text, true);

    v_checked := v_checked + 1;
    IF EXISTS (SELECT 1 FROM public.app_my_companies() WHERE company_id = r.company_id)
         IS DISTINCT FROM public.app_is_company_member(r.company_id, r.user_id) THEN
      v_mismatch := v_mismatch + 1;
    END IF;
  END LOOP;

  PERFORM _sk('E', 'every membership was checked', v_checked >= 4, 'checked=' || v_checked);
  PERFORM _sk('E', 'the offer and the tenant boundary never disagree', v_mismatch = 0,
              'mismatches=' || v_mismatch);
END
$e$;


-- ── Teardown ─────────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims', NULL, true);

DELETE FROM public.company_members
 WHERE user_id IN ('00000000-0000-7d02-b000-0000000000a1',
                   '00000000-0000-7d02-b000-0000000000b1');
DELETE FROM public.companies
 WHERE id IN ('00000000-0000-7d02-c000-00000000ace0',
              '00000000-0000-7d02-c000-00000000beef',
              '00000000-0000-7d02-c000-00000000dade');
DELETE FROM auth.users
 WHERE id IN ('00000000-0000-7d02-b000-0000000000a1',
              '00000000-0000-7d02-b000-0000000000b1');


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
    RAISE EXCEPTION '% assertion(s) failed in my_companies_test.sql', n;
  END IF;
END
$done$;
