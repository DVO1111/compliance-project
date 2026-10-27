-- =====================================================================
--  ALLOWLIST ENABLED STATE AND ADMIN SURFACE (20261212000000)
--
--  A. The column and its shape
--  B. A disabled address is refused
--  C. NEITHER AN EMPTY NOR A DISABLED TABLE OPENS THE PRODUCT
--  D. The administrator surface refuses non-administrators
--  E. The list is not readable or writable from a browser
--  F. Both gates are still in place
--
--  WHY C IS THE POINT OF THIS FILE
--  -------------------------------
--  20261017000000 made "the table is empty" mean "the product is open",
--  so that ending the pilot would be a data change rather than a code
--  change. Adding a disabled state put a trap next to that rule: if "no
--  ENABLED rows" were also read as open, then disabling the last pilot
--  user would publish the application to the entire internet, and the
--  operator doing it would believe they had just locked it down.
--
--  20261214000000 removed the rule itself. Only approved addresses may
--  register, so an empty list denies like any other list that matches
--  nothing, and opening the product is now an explicit switch in
--  signin_policy rather than the absence of data.
--
--  So C requires the gate to stay SHUT for a fully disabled list AND for
--  an empty one. signin_policy_test.sql covers the switch.
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
 *  20261213000000 added a trigger refusing the removal of the LAST
 *  access_approvers row, so an operator cannot lock the project out of its
 *  own administration. This suite creates and removes an approver of its
 *  own, so it disables that trigger around its fixtures — and only there.
 *
 *  Found by the trigger breaking this file: the suite aborted and the
 *  runner reported it as zero assertions rather than as a failure, which
 *  is why the total is checked and not just the failure count.
 */
ALTER TABLE public.access_approvers DISABLE TRIGGER trg_access_approvers_keep_one;

DO $fx$
DECLARE
  ua uuid := '00000000-0000-7c01-b000-000000000001';  -- an approver
  ub uuid := '00000000-0000-7c01-b000-000000000002';  -- not an approver
BEGIN
  DELETE FROM public.allowed_signins WHERE email LIKE '%@allowlist.test';
  DELETE FROM public.access_approvers WHERE user_id IN (ua, ub);
  DELETE FROM public.profiles WHERE id IN (ua, ub);
  DELETE FROM auth.users WHERE id IN (ua, ub);

  INSERT INTO auth.users(id,email) VALUES
    (ua,'approver@allowlist.test'), (ub,'ordinary@allowlist.test');
  INSERT INTO public.access_approvers(user_id) VALUES (ua);

  INSERT INTO public.allowed_signins(email, note) VALUES
    ('enabled@allowlist.test',  'enabled fixture'),
    ('disabled@allowlist.test', 'disabled fixture');

  UPDATE public.allowed_signins
     SET is_enabled = false, disabled_at = now()
   WHERE email = 'disabled@allowlist.test';
END
$fx$;

ALTER TABLE public.access_approvers ENABLE TRIGGER trg_access_approvers_keep_one;


-- =====================================================================
--  A — the column and its shape
-- =====================================================================
DO $a$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema='public' AND table_name='allowed_signins'
     AND column_name IN ('is_enabled','disabled_at','disabled_by');
  PERFORM _sk('A','A1 the state and its audit columns exist', n = 3, n||' of 3');

  --  New rows are enabled, so adding an address does not silently add a
  --  disabled one.
  SELECT count(*) INTO n FROM public.allowed_signins
   WHERE email='enabled@allowlist.test' AND is_enabled;
  PERFORM _sk('A','A2 a new entry is enabled by default', n = 1);

  --  "Disabled but nobody knows when" is not a record.
  BEGIN
    INSERT INTO public.allowed_signins(email, is_enabled, disabled_at)
    VALUES ('halfdisabled@allowlist.test', false, NULL);
    PERFORM _sk('A','A3 disabled without a time is refused', false, 'accepted');
  EXCEPTION WHEN check_violation THEN
    PERFORM _sk('A','A3 disabled without a time is refused', true);
  END;

  BEGIN
    INSERT INTO public.allowed_signins(email, is_enabled, disabled_at)
    VALUES ('halfenabled@allowlist.test', true, now());
    PERFORM _sk('A','A4 enabled with a disabled time is refused', false, 'accepted');
  EXCEPTION WHEN check_violation THEN
    PERFORM _sk('A','A4 enabled with a disabled time is refused', true);
  END;

  --  The lower-case rule from 20261017000000 still holds.
  BEGIN
    INSERT INTO public.allowed_signins(email) VALUES ('MiXeD@allowlist.test');
    PERFORM _sk('A','A5 a mixed-case address is still refused', false, 'accepted');
  EXCEPTION WHEN check_violation THEN
    PERFORM _sk('A','A5 a mixed-case address is still refused', true);
  END;
END
$a$;


-- =====================================================================
--  B — a disabled address is refused
-- =====================================================================
DO $b$
BEGIN
  PERFORM _sk('B','B1 an enabled address is admitted',
              public.app_signin_is_allowed('enabled@allowlist.test'));

  PERFORM _sk('B','B2 a disabled address is refused',
              NOT public.app_signin_is_allowed('disabled@allowlist.test'));

  --  Case and whitespace are normalised the same way the hook normalises,
  --  or an address approved in the table would be refused at signup.
  PERFORM _sk('B','B3 matching is case-insensitive',
              public.app_signin_is_allowed('ENABLED@ALLOWLIST.TEST'));

  PERFORM _sk('B','B4 and tolerates surrounding whitespace',
              public.app_signin_is_allowed('  enabled@allowlist.test  '));

  PERFORM _sk('B','B5 a disabled address is refused in any case too',
              NOT public.app_signin_is_allowed('DISABLED@allowlist.test'));

  PERFORM _sk('B','B6 an unknown address is refused',
              NOT public.app_signin_is_allowed('nobody@allowlist.test'));

  --  Null and empty must not be read as "no filter".
  PERFORM _sk('B','B7 a null address is refused',
              NOT public.app_signin_is_allowed(NULL));
  PERFORM _sk('B','B8 an empty address is refused',
              NOT public.app_signin_is_allowed(''));
END
$b$;


-- =====================================================================
--  C — NEITHER AN EMPTY NOR A DISABLED TABLE OPENS THE PRODUCT
-- =====================================================================
DO $c$
DECLARE n integer;
BEGIN
  CREATE TEMP TABLE _saved_allowlist AS
    SELECT * FROM public.allowed_signins;

  --  Every row disabled. NOT the same as empty.
  UPDATE public.allowed_signins SET is_enabled = false, disabled_at = now();

  SELECT count(*) INTO n FROM public.allowed_signins;
  PERFORM _sk('C','C1 the table is non-empty and fully disabled', n > 0, n||' row(s)');

  /*
   *  THE ASSERTION THIS FILE EXISTS FOR. If disabling every row opened the
   *  product, the operator who revoked the last pilot user would have
   *  published the application to everyone, believing the opposite.
   */
  PERFORM _sk('C','C2 a wholly disabled list does NOT open the product',
              NOT public.app_signin_is_allowed('anyone@allowlist.test'));

  PERFORM _sk('C','C3 not even for an address that is on it, disabled',
              NOT public.app_signin_is_allowed('enabled@allowlist.test'));

  /*
   *  C4 ASSERTED THE OPPOSITE UNTIL 20261214000000.
   *
   *  20261017000000 made an empty table mean "open", so that ending the
   *  pilot would be a data change rather than a code change. That reading
   *  is now withdrawn: only approved addresses may register, so an empty
   *  allowlist denies like any other list that matches nothing, and
   *  opening the product is a deliberate switch instead of the absence of
   *  data. The old rule turned "somebody emptied the table" into "the
   *  product is public", which is the one moment it should be shut.
   */
  DELETE FROM public.allowed_signins;
  PERFORM _sk('C','C4 an EMPTY list now DENIES, it does not open the product',
              NOT public.app_signin_is_allowed('anyone@allowlist.test'));

  INSERT INTO public.allowed_signins SELECT * FROM _saved_allowlist;
  DROP TABLE _saved_allowlist;

  PERFORM _sk('C','C5 and the fixture is restored',
              public.app_signin_is_allowed('enabled@allowlist.test'));
END
$c$;


-- =====================================================================
--  D — the administrator surface refuses non-administrators
-- =====================================================================
--  As an ordinary authenticated user who is NOT an approver.
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-7c01-b000-000000000002","role":"authenticated"}', false);
SET ROLE authenticated;

DO $d$
BEGIN
  PERFORM _sk('D','D1 a non-approver is not an allowlist admin',
              NOT public.app_is_allowlist_admin());

  BEGIN
    PERFORM * FROM public.admin_allowlist_list();
    PERFORM _sk('D','D2 a non-approver cannot list the allowlist', false, 'listed');
  EXCEPTION WHEN raise_exception THEN
    PERFORM _sk('D','D2 a non-approver cannot list the allowlist',
                SQLERRM LIKE '%ALLOWLIST_NOT_PERMITTED%', SQLERRM);
  END;

  BEGIN
    PERFORM public.admin_allowlist_add('sneak@allowlist.test','added by a stranger');
    PERFORM _sk('D','D3 a non-approver cannot add an address', false, 'added');
  EXCEPTION WHEN raise_exception THEN
    PERFORM _sk('D','D3 a non-approver cannot add an address',
                SQLERRM LIKE '%ALLOWLIST_NOT_PERMITTED%', SQLERRM);
  END;

  BEGIN
    PERFORM public.admin_allowlist_set_enabled('enabled@allowlist.test', false);
    PERFORM _sk('D','D4 a non-approver cannot disable an address', false, 'disabled');
  EXCEPTION WHEN raise_exception THEN
    PERFORM _sk('D','D4 a non-approver cannot disable an address',
                SQLERRM LIKE '%ALLOWLIST_NOT_PERMITTED%', SQLERRM);
  END;

  --  And the refusal actually prevented the write, rather than merely
  --  reporting one — a check that raises after writing is not a check.
  PERFORM _sk('D','D5 the refused add really did not write',
              NOT EXISTS (SELECT 1 FROM public.allowed_signins
                           WHERE email='sneak@allowlist.test'));
END
$d$;

RESET ROLE;

--  As the approver.
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-7c01-b000-000000000001","role":"authenticated"}', false);
SET ROLE authenticated;

DO $d2$
DECLARE n integer; v_enabled boolean; v_note text; v_created timestamptz;
BEGIN
  PERFORM _sk('D','D6 an approver IS an allowlist admin',
              public.app_is_allowlist_admin());

  SELECT count(*) INTO n FROM public.admin_allowlist_list();
  PERFORM _sk('D','D7 an approver can list it', n >= 2, n||' row(s)');

  /*
   *  Read back through admin_allowlist_list(), NOT with a direct SELECT.
   *  This block runs as `authenticated`, and the table's RLS hides every
   *  row from it — which is the property E1 asserts. The first draft of
   *  these three assertions queried the table directly and got NULL,
   *  which is the gate working, not the function failing.
   */
  PERFORM public.admin_allowlist_add('NewPerson@Allowlist.TEST', '  added by admin  ');
  SELECT l.is_enabled, l.note INTO v_enabled, v_note
    FROM public.admin_allowlist_list() l WHERE l.email='newperson@allowlist.test';
  PERFORM _sk('D','D8 an added address is normalised and enabled',
              v_enabled AND v_note = 'added by admin',
              coalesce(v_note,'null'));

  PERFORM public.admin_allowlist_set_enabled('newperson@allowlist.test', false);
  PERFORM _sk('D','D9 an admin can disable an address',
              NOT public.app_signin_is_allowed('newperson@allowlist.test'));

  --  Re-adding re-enables rather than failing on the primary key, and
  --  keeps the original approval date.
  SELECT l.created_at INTO v_created
    FROM public.admin_allowlist_list() l WHERE l.email='newperson@allowlist.test';
  PERFORM public.admin_allowlist_add('newperson@allowlist.test', NULL);
  PERFORM _sk('D','D10 re-adding a disabled address re-enables it',
              public.app_signin_is_allowed('newperson@allowlist.test'));
  PERFORM _sk('D','D11 and keeps the original approval date',
              (SELECT l.created_at FROM public.admin_allowlist_list() l
                WHERE l.email='newperson@allowlist.test') = v_created);
  PERFORM _sk('D','D12 and keeps the note when none is supplied',
              (SELECT l.note FROM public.admin_allowlist_list() l
                WHERE l.email='newperson@allowlist.test') = 'added by admin');

  --  A mistyped address must not report success.
  BEGIN
    PERFORM public.admin_allowlist_set_enabled('typo@allowlist.test', false);
    PERFORM _sk('D','D13 disabling an unknown address is refused', false, 'accepted');
  EXCEPTION WHEN raise_exception THEN
    PERFORM _sk('D','D13 disabling an unknown address is refused',
                SQLERRM LIKE '%ALLOWLIST_NOT_FOUND%', SQLERRM);
  END;

  BEGIN
    PERFORM public.admin_allowlist_add('not-an-email', NULL);
    PERFORM _sk('D','D14 a malformed address is refused by name', false, 'accepted');
  EXCEPTION WHEN raise_exception THEN
    PERFORM _sk('D','D14 a malformed address is refused by name',
                SQLERRM LIKE '%ALLOWLIST_INVALID_EMAIL%', SQLERRM);
  END;
END
$d2$;


-- =====================================================================
--  E — the list is not readable or writable from a browser
-- =====================================================================
DO $e$
DECLARE n integer;
BEGIN
  --  RLS is on with no policy, so even an authenticated approver reading
  --  the table DIRECTLY sees nothing. The surface is the functions.
  SELECT count(*) INTO n FROM public.allowed_signins;
  PERFORM _sk('E','E1 a direct SELECT returns nothing even for an admin',
              n = 0, n||' row(s)');

  BEGIN
    INSERT INTO public.allowed_signins(email) VALUES ('direct@allowlist.test');
    PERFORM _sk('E','E2 a direct INSERT is refused', false, 'accepted');
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    PERFORM _sk('E','E2 a direct INSERT is refused', true);
  END;
END
$e$;

RESET ROLE;
SELECT set_config('request.jwt.claims','',false);

DO $e2$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname='public' AND tablename='allowed_signins';
  PERFORM _sk('E','E3 the table still carries no RLS policy at all',
              n = 0, n||' polic(ies)');

  SELECT count(*) INTO n FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
   WHERE ns.nspname='public' AND c.relname='allowed_signins' AND c.relrowsecurity;
  PERFORM _sk('E','E4 with row-level security enabled', n = 1);

  --  anon must not be able to call the gate and use it as an oracle for
  --  who is on the list.
  SELECT count(*) INTO n
    FROM information_schema.role_routine_grants
   WHERE routine_schema='public'
     AND routine_name IN ('admin_allowlist_list','admin_allowlist_add',
                          'admin_allowlist_set_enabled')
     AND grantee = 'anon';
  PERFORM _sk('E','E5 anon holds no grant on the admin functions',
              n = 0, n||' grant(s)');
END
$e2$;


-- =====================================================================
--  F — both gates are still in place
-- =====================================================================
DO $f$
DECLARE v_src text; n integer;
BEGIN
  /*
   *  The hook stops the ACCOUNT being created; the database guard stops an
   *  account that exists from becoming a member of anything. The hook is
   *  configuration and can be switched off in a dashboard; the guard is
   *  schema and travels with the database. Losing either one silently is
   *  what this asserts against.
   */
  SELECT pg_get_functiondef(p.oid) INTO v_src
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname='public' AND p.proname='provision_profile' LIMIT 1;

  PERFORM _sk('F','F1 provision_profile still carries the allowlist guard',
              v_src LIKE '%app_signin_is_allowed(v_email)%');

  --  On the RESOLVED address, not the client-supplied argument.
  PERFORM _sk('F','F2 the guard reads v_email, not p_email',
              v_src NOT LIKE '%app_signin_is_allowed(p_email)%');

  --  The gate is SECURITY DEFINER or it cannot read a table whose RLS
  --  hides every row.
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname='app_signin_is_allowed' AND p.prosecdef;
  PERFORM _sk('F','F3 the gate is SECURITY DEFINER', n = 1);

  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public'
     AND p.proname IN ('admin_allowlist_list','admin_allowlist_add',
                       'admin_allowlist_set_enabled','app_is_allowlist_admin')
     AND p.prosecdef;
  PERFORM _sk('F','F4 so are the four admin functions', n = 4, n||' of 4');

  --  Each pins its search_path, or a caller could shadow `public` and have
  --  a SECURITY DEFINER function read their own table instead.
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public'
     AND p.proname IN ('app_signin_is_allowed','app_is_allowlist_admin',
                       'admin_allowlist_list','admin_allowlist_add',
                       'admin_allowlist_set_enabled')
     AND array_to_string(coalesce(p.proconfig,'{}'),',') LIKE '%search_path%';
  PERFORM _sk('F','F5 and every one pins its search_path', n = 5, n||' of 5');
END
$f$;


-- ── Fixture cleanup ──────────────────────────────────────────────────
ALTER TABLE public.access_approvers DISABLE TRIGGER trg_access_approvers_keep_one;

DO $cl$
DECLARE
  ua uuid := '00000000-0000-7c01-b000-000000000001';
  ub uuid := '00000000-0000-7c01-b000-000000000002';
BEGIN
  DELETE FROM public.allowed_signins WHERE email LIKE '%@allowlist.test';
  DELETE FROM public.access_approvers WHERE user_id IN (ua, ub);
  DELETE FROM auth.users WHERE id IN (ua, ub);
END
$cl$;

ALTER TABLE public.access_approvers ENABLE TRIGGER trg_access_approvers_keep_one;


\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo '  ALLOWLIST ENABLED STATE AND ADMIN SURFACE'
\echo '════════════════════════════════════════════════════════════════'
SELECT section, count(*) AS assertions, count(*) FILTER (WHERE NOT ok) AS failures
  FROM _s GROUP BY section ORDER BY section;
SELECT section, name, coalesce(detail,'') AS detail FROM _s WHERE NOT ok ORDER BY section, name;
SELECT count(*) AS total, count(*) FILTER (WHERE ok) AS passed,
       count(*) FILTER (WHERE NOT ok) AS failed FROM _s;

DO $v$
DECLARE f integer;
BEGIN
  SELECT count(*) INTO f FROM _s WHERE NOT ok;
  IF f > 0 THEN RAISE EXCEPTION 'ALLOWLIST STATE: % assertion(s) failed', f; END IF;
  RAISE NOTICE 'ALLOWLIST STATE: all assertions passed';
END
$v$;
