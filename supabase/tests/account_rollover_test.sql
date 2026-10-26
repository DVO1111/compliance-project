-- =====================================================================
--  SAFE ACCOUNT ROLLOVER (20261213000000)
--
--  A. Historical attribution survives
--  B. Membership revocation ends data access
--  C. THE LAST APPROVER CANNOT BE REMOVED
--  D. The allowlist survives the rollover
--  E. Privilege: service-role only
--  F. Undo
--  G. A rolled-over account cannot be re-promoted
--
--  WHY A AND C ARE THE POINT OF THIS FILE
--  --------------------------------------
--  A rollover has two ways to be a disaster, and they pull in opposite
--  directions.
--
--  Lose the user row and the batch records that name it lose their
--  authorship — which is the thing a GMP record exists to carry, and the
--  reason deletion was refused in docs/ACCOUNT_RESET_DRYRUN.md. So A
--  proves the row, its id and every reference to it are still there
--  afterwards.
--
--  Revoke one row too many and the project has nobody who can approve an
--  access request or administer the allowlist, and the only way back is a
--  service-role write by somebody who knows that. So C removes approvers
--  until one is left and requires the next removal to be refused.
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
 *  The keep-one trigger is disabled around fixture setup and teardown, and
 *  only there. It exists to stop an OPERATOR removing the last approver;
 *  a suite that could not clear its own fixtures would simply be
 *  un-runnable a second time. Section C re-enables it before testing it,
 *  so the thing under test is never the thing that was switched off.
 */
ALTER TABLE public.access_approvers DISABLE TRIGGER trg_access_approvers_keep_one;

DO $fx$
DECLARE
  co uuid := '00000000-0000-7d01-a000-000000000001';
  u_old uuid := '00000000-0000-7d01-b000-000000000001';  -- rolled over
  u_app uuid := '00000000-0000-7d01-b000-000000000002';  -- approver, kept
  u_new uuid := '00000000-0000-7d01-b000-000000000003';  -- the fresh account
  si    uuid := '00000000-0000-7d01-c000-000000000001';
BEGIN
  DELETE FROM public.account_rollovers WHERE old_user_id IN (u_old,u_app,u_new);
  DELETE FROM public.access_approvers  WHERE user_id IN (u_old,u_app,u_new);
  DELETE FROM public.company_members   WHERE user_id IN (u_old,u_app,u_new);
  DELETE FROM public.allowed_signins   WHERE email LIKE '%@rollover.test';
  DELETE FROM public.sites             WHERE company_id = co;
  DELETE FROM public.profiles          WHERE id IN (u_old,u_app,u_new);
  DELETE FROM auth.users               WHERE id IN (u_old,u_app,u_new);
  DELETE FROM public.companies         WHERE id = co;

  INSERT INTO public.companies(id,name) VALUES (co,'Rollover Co');
  INSERT INTO auth.users(id,email) VALUES
    (u_old,'old@rollover.test'), (u_app,'approver@rollover.test'),
    (u_new,'fresh@rollover.test');
  INSERT INTO public.profiles(id,email,full_name,role,company_id) VALUES
    (u_old,'old@rollover.test','Old User','admin',co),
    (u_app,'approver@rollover.test','The Approver','admin',co),
    (u_new,'fresh@rollover.test','Fresh User','admin',co);
  INSERT INTO public.company_members(company_id,user_id,role,status) VALUES
    (co,u_old,'owner','active'), (co,u_app,'member','active');
  INSERT INTO public.access_approvers(user_id) VALUES (u_old), (u_app);
END
$fx$;

--  Armed again, before anything that depends on it.
ALTER TABLE public.access_approvers ENABLE TRIGGER trg_access_approvers_keep_one;

DO $fx2$
DECLARE
  co uuid := '00000000-0000-7d01-a000-000000000001';
  si uuid := '00000000-0000-7d01-c000-000000000001';
BEGIN

  --  The approved address the old user held. It must still be approved
  --  after the rollover, so the same person can register again.
  INSERT INTO public.allowed_signins(email,note)
    VALUES ('old@rollover.test','approved before the rollover');

  --  A business record naming the old user, so section A has something
  --  real to protect. `sites` has created_by with no cascade.
  INSERT INTO public.sites(id,company_id,name) VALUES (si,co,'Rollover plant');
END
$fx2$;


-- =====================================================================
--  A — historical attribution survives
-- =====================================================================
SET ROLE service_role;

DO $a$
DECLARE
  u_old uuid := '00000000-0000-7d01-b000-000000000001';
  r jsonb; n integer; v text;
BEGIN
  SELECT public.app_rollover_revoke(u_old, 'fresh onboarding cycle') INTO r;

  --  THE ROW IS STILL THERE. Nothing was deleted, so nothing that points
  --  at it has been orphaned or had its authorship rewritten.
  SELECT count(*) INTO n FROM auth.users WHERE id = u_old;
  PERFORM _sk('A','A1 the auth.users row still exists', n = 1, n||' row(s)');

  SELECT count(*) INTO n FROM public.profiles WHERE id = u_old;
  PERFORM _sk('A','A2 the profile still exists, so FK attribution holds', n = 1);

  --  And the record of WHO that was, which the rename would otherwise
  --  destroy.
  SELECT original_email INTO v FROM public.account_rollovers WHERE old_user_id = u_old;
  PERFORM _sk('A','A3 the original address is recorded before it is freed',
              v = 'old@rollover.test', coalesce(v,'null'));

  SELECT tombstone_email INTO v FROM public.account_rollovers WHERE old_user_id = u_old;
  PERFORM _sk('A','A4 the tombstone is in a reserved, undeliverable domain',
              v LIKE '%@criateur.invalid', coalesce(v,'null'));

  PERFORM _sk('A','A5 the tombstone is deterministic, so a re-run does not make a second one',
              v = public.app_rollover_tombstone(u_old));

END
$a$;

/*
 *  A6 needs the account to be tombstoned, which in production is the Auth
 *  Admin API's half of the rollover — GoTrue owns auth.users and
 *  service_role cannot write it directly, as this suite confirms by
 *  needing the owner role here. The UPDATE below stands in for that call
 *  so the database half can be tested without GoTrue.
 */
RESET ROLE;
UPDATE auth.users
   SET email = public.app_rollover_tombstone('00000000-0000-7d01-b000-000000000001')
 WHERE id = '00000000-0000-7d01-b000-000000000001';
SET ROLE service_role;

DO $a6$
DECLARE u_old uuid := '00000000-0000-7d01-b000-000000000001';
BEGIN
  --  Running it twice must not quietly produce a second rollover, nor
  --  overwrite the original address with the tombstone.
  BEGIN
    PERFORM public.app_rollover_revoke(u_old, 'again');
    PERFORM _sk('A','A6 a second rollover of the same account is refused', false, 'accepted');
  EXCEPTION WHEN raise_exception THEN
    PERFORM _sk('A','A6 a second rollover of the same account is refused',
                SQLERRM LIKE '%ROLLOVER_ALREADY_DONE%', SQLERRM);
  END;

  PERFORM _sk('A','A7 and the recorded original address was not overwritten',
              (SELECT original_email FROM public.account_rollovers
                WHERE old_user_id = u_old) = 'old@rollover.test');
END
$a6$;


-- =====================================================================
--  B — membership revocation ends data access
-- =====================================================================
DO $b$
DECLARE
  u_old uuid := '00000000-0000-7d01-b000-000000000001';
  n integer; v jsonb;
BEGIN
  SELECT count(*) INTO n FROM public.company_members WHERE user_id = u_old;
  /*
   *  This is what actually ends access, and it ends it at once: every RLS
   *  policy in this schema reads company_members, and a policy is
   *  evaluated per statement. Banning the account does not do this, and
   *  an access token already issued keeps being accepted as a signature —
   *  but the rows it can reach are gone.
   */
  PERFORM _sk('B','B1 the membership is gone', n = 0, n||' row(s)');

  SELECT revoked_memberships INTO v
    FROM public.account_rollovers WHERE old_user_id = u_old;
  PERFORM _sk('B','B2 what was revoked is recorded, so it can be undone',
              jsonb_array_length(v) = 1, v::text);

  --  The company itself is untouched: business records are not the
  --  account's to take with it.
  SELECT count(*) INTO n FROM public.companies
   WHERE id = '00000000-0000-7d01-a000-000000000001';
  PERFORM _sk('B','B3 the company survives', n = 1);

  SELECT count(*) INTO n FROM public.sites
   WHERE company_id = '00000000-0000-7d01-a000-000000000001';
  PERFORM _sk('B','B4 and its business records survive', n = 1, n||' site(s)');
END
$b$;


-- =====================================================================
--  C — THE LAST APPROVER CANNOT BE REMOVED
-- =====================================================================
DO $c$
DECLARE
  u_app uuid := '00000000-0000-7d01-b000-000000000002';
  n integer;
BEGIN
  --  The old user WAS an approver and lost it with the rollover, which is
  --  correct — there was a second one.
  SELECT count(*) INTO n FROM public.access_approvers;
  PERFORM _sk('C','C1 the rolled-over approver was removed', n >= 1, n||' approver(s)');

  PERFORM _sk('C','C2 and that it was an approver is recorded',
              (SELECT was_approver FROM public.account_rollovers
                WHERE old_user_id = '00000000-0000-7d01-b000-000000000001'));

  --  Reduce to exactly one, then require the next removal to be refused.
  DELETE FROM public.access_approvers WHERE user_id <> u_app;
  SELECT count(*) INTO n FROM public.access_approvers;
  PERFORM _sk('C','C3 exactly one approver remains', n = 1, n||' approver(s)');

  /*
   *  THE ASSERTION THIS FILE EXISTS FOR. Without it a rollover can leave a
   *  project where nobody can approve an access request or administer the
   *  allowlist — and the failure is silent, because everything else keeps
   *  working until somebody tries.
   */
  BEGIN
    DELETE FROM public.access_approvers WHERE user_id = u_app;
    PERFORM _sk('C','C4 removing the last approver is refused', false, 'accepted');
  EXCEPTION WHEN raise_exception THEN
    PERFORM _sk('C','C4 removing the last approver is refused',
                SQLERRM LIKE '%ACCESS_APPROVERS_LAST_ONE%', SQLERRM);
  END;

  SELECT count(*) INTO n FROM public.access_approvers;
  PERFORM _sk('C','C5 and the refusal really prevented it', n = 1, n||' approver(s)');

  --  A rollover of the last approver must abort the WHOLE rollover, not
  --  half-complete and leave the project locked out.
  BEGIN
    PERFORM public.app_rollover_revoke(u_app, 'should be refused');
    PERFORM _sk('C','C6 rolling over the last approver is refused', false, 'accepted');
  EXCEPTION WHEN raise_exception THEN
    PERFORM _sk('C','C6 rolling over the last approver is refused',
                SQLERRM LIKE '%ACCESS_APPROVERS_LAST_ONE%', SQLERRM);
  END;

  SELECT count(*) INTO n FROM public.company_members WHERE user_id = u_app;
  PERFORM _sk('C','C7 and its membership was NOT revoked by the aborted attempt',
              n = 1, n||' membership(s)');
END
$c$;


-- =====================================================================
--  D — the allowlist survives the rollover
-- =====================================================================
DO $d$
DECLARE n integer;
BEGIN
  /*
   *  The point of the whole exercise: the same approved person registers
   *  again. If the rollover removed their approval they would be locked
   *  out by the gate that is supposed to let them in.
   */
  SELECT count(*) INTO n FROM public.allowed_signins
   WHERE email = 'old@rollover.test' AND is_enabled;
  PERFORM _sk('D','D1 the approved address is still approved', n = 1, n||' row(s)');

  PERFORM _sk('D','D2 and the gate still admits it',
              public.app_signin_is_allowed('old@rollover.test'));

  --  allowed_signins.added_by is ON DELETE SET NULL and nothing here
  --  deletes users anyway, so no approved address can be removed by a
  --  rollover.
  SELECT count(*) INTO n FROM pg_constraint c
   WHERE c.conrelid = 'public.allowed_signins'::regclass
     AND c.contype = 'f' AND c.confdeltype = 'c';
  PERFORM _sk('D','D3 no CASCADE foreign key can take an approved address with it',
              n = 0, n||' cascade(s)');
END
$d$;


-- =====================================================================
--  E — privilege: service-role only
-- =====================================================================
RESET ROLE;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-7d01-b000-000000000002","role":"authenticated"}', false);
SET ROLE authenticated;

DO $e$
DECLARE n integer;
BEGIN
  BEGIN
    PERFORM public.app_rollover_revoke('00000000-0000-7d01-b000-000000000003', 'nope');
    PERFORM _sk('E','E1 an ordinary user cannot roll anyone over', false, 'accepted');
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN
    PERFORM _sk('E','E1 an ordinary user cannot roll anyone over', true, SQLERRM);
  END;

  BEGIN
    PERFORM public.admin_bootstrap_approver('fresh@rollover.test');
    PERFORM _sk('E','E2 nor promote themselves to approver', false, 'accepted');
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN
    PERFORM _sk('E','E2 nor promote themselves to approver', true, SQLERRM);
  END;

  /*
   *  The rollover record is a list of real people's former addresses. The
   *  grant is revoked outright rather than left to RLS, so a browser
   *  session cannot even COUNT it — a stronger property than "returns no
   *  rows", and the one asserted here.
   */
  BEGIN
    SELECT count(*) INTO n FROM public.account_rollovers;
    PERFORM _sk('E','E4 the rollover record is not readable from a browser',
                false, 'read '||n||' row(s)');
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM _sk('E','E4 the rollover record is not readable from a browser', true);
  END;
END
$e$;

RESET ROLE;
SELECT set_config('request.jwt.claims','',false);

/*
 *  E3 is verified as the owner, not as `authenticated`: access_approvers
 *  has its grants revoked from anon and authenticated outright, so a
 *  browser session cannot even COUNT it — which is the stronger property,
 *  and the reason the check cannot be made from inside section E.
 */
DO $e3$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM public.access_approvers
   WHERE user_id = '00000000-0000-7d01-b000-000000000003';
  PERFORM _sk('E','E3 and the refused promotion really did not write', n = 0, n||' row(s)');

  SELECT count(*) INTO n
    FROM information_schema.role_table_grants
   WHERE table_schema='public' AND table_name='access_approvers'
     AND grantee IN ('anon','authenticated');
  PERFORM _sk('E','E5 anon and authenticated hold no grant on access_approvers',
              n = 0, n||' grant(s)');
END
$e3$;


-- =====================================================================
--  F — undo
-- =====================================================================
SET ROLE service_role;

DO $f$
DECLARE
  u_old uuid := '00000000-0000-7d01-b000-000000000001';
  n integer;
BEGIN
  SELECT public.app_rollover_restore_membership(u_old) INTO n;
  PERFORM _sk('F','F1 a rollover performed in error can be undone',
              n = 1, n||' membership(s) restored');

  SELECT count(*) INTO n FROM public.company_members
   WHERE user_id = u_old AND role = 'owner' AND status = 'active';
  PERFORM _sk('F','F2 and the role and status come back as they were', n = 1);

  --  Undo is only possible because the revocation recorded what it took.
  BEGIN
    PERFORM public.app_rollover_restore_membership('00000000-0000-7d01-b000-000000000003');
    PERFORM _sk('F','F3 restoring a user who was never rolled over is refused', false, 'accepted');
  EXCEPTION WHEN raise_exception THEN
    PERFORM _sk('F','F3 restoring a user who was never rolled over is refused',
                SQLERRM LIKE '%ROLLOVER_NO_RECORD%', SQLERRM);
  END;

  DELETE FROM public.company_members WHERE user_id = u_old;
END
$f$;


-- =====================================================================
--  G — a rolled-over account cannot be re-promoted
-- =====================================================================
DO $g$
DECLARE v uuid;
BEGIN
  /*
   *  The old account is tombstoned and banned, so promoting it would hand
   *  administration to an account nobody can sign in to — a lockout that
   *  looks like a successful bootstrap.
   */
  BEGIN
    PERFORM public.admin_bootstrap_approver('old@rollover.test');
    PERFORM _sk('G','G1 a tombstoned account cannot be promoted', false, 'accepted');
  EXCEPTION WHEN raise_exception THEN
    PERFORM _sk('G','G1 a tombstoned account cannot be promoted',
                SQLERRM LIKE '%NO_LIVE_USER%', SQLERRM);
  END;

  --  The fresh account can be, which is the whole point of the bootstrap.
  SELECT public.admin_bootstrap_approver('fresh@rollover.test') INTO v;
  PERFORM _sk('G','G2 the fresh account can be promoted',
              v = '00000000-0000-7d01-b000-000000000003', coalesce(v::text,'null'));

  PERFORM _sk('G','G3 and is now an approver',
              EXISTS (SELECT 1 FROM public.access_approvers
                       WHERE user_id = '00000000-0000-7d01-b000-000000000003'));

  --  Idempotent: running the bootstrap twice is not an error.
  SELECT public.admin_bootstrap_approver('fresh@rollover.test') INTO v;
  PERFORM _sk('G','G4 promoting twice is not an error', v IS NOT NULL);
END
$g$;

RESET ROLE;


-- ── Fixture cleanup ──────────────────────────────────────────────────
ALTER TABLE public.access_approvers DISABLE TRIGGER trg_access_approvers_keep_one;

DO $cl$
DECLARE
  co uuid := '00000000-0000-7d01-a000-000000000001';
  ids uuid[] := ARRAY['00000000-0000-7d01-b000-000000000001'::uuid,
                      '00000000-0000-7d01-b000-000000000002'::uuid,
                      '00000000-0000-7d01-b000-000000000003'::uuid];
BEGIN
  DELETE FROM public.account_rollovers WHERE old_user_id = ANY(ids);
  DELETE FROM public.access_approvers  WHERE user_id = ANY(ids);
  DELETE FROM public.company_members   WHERE user_id = ANY(ids);
  DELETE FROM public.allowed_signins   WHERE email LIKE '%@rollover.test';
  DELETE FROM public.sites             WHERE company_id = co;
  DELETE FROM public.profiles          WHERE id = ANY(ids);
  DELETE FROM auth.users               WHERE id = ANY(ids);
  DELETE FROM public.companies         WHERE id = co;
END
$cl$;

ALTER TABLE public.access_approvers ENABLE TRIGGER trg_access_approvers_keep_one;


\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo '  SAFE ACCOUNT ROLLOVER'
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
  IF f > 0 THEN RAISE EXCEPTION 'ACCOUNT ROLLOVER: % assertion(s) failed', f; END IF;
  RAISE NOTICE 'ACCOUNT ROLLOVER: all assertions passed';
END
$v$;
