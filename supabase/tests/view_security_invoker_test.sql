-- =====================================================================
--  VIEW OWNERSHIP — THE FOUR PERFORMANCE VIEWS
--
--  A. Every view in public carries security_invoker
--  B. Cross-tenant reads, with a real second company's credentials
--  C. The counts survive the fix for a PLAIN member, not just an admin
--  D. policy_ack_coverage() authorises rather than trusting its argument
--  E. anon
--  F. The organization_id/company_id repair
--  G. The guard in section 7 of the migration
--
--  WHY SECTION C EXISTS
--  --------------------
--  security_invoker is not a free win. RLS on profiles and
--  policy_acknowledgements shows a plain member only their own row, so a
--  bare invoker view would have reported total_users = 1 and a
--  compliance rate of 0% or 100% — wrong, with no error. These
--  assertions are the ones that would fail if someone later "simplified"
--  the view by inlining the counts again.
--
--  WHY B USES A SECOND COMPANY RATHER THAN A FABRICATED CLAIM
--  ---------------------------------------------------------
--  A caller who cannot see anything proves nothing. Company B's admin is
--  a legitimate, fully provisioned user; the point is that legitimacy in
--  one tenant buys nothing in another.
-- =====================================================================
\set ON_ERROR_STOP on
SET client_min_messages = warning;

DO $guard$
BEGIN
  IF current_database() NOT IN ('postgres','criateur_local') THEN
    RAISE EXCEPTION 'REFUSING TO RUN outside a local database (got %)', current_database();
  END IF;
END $guard$;

DROP TABLE IF EXISTS _vs;
CREATE TEMP TABLE _vs(section text, name text, ok boolean, detail text);
GRANT ALL ON _vs TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION _vsk(p_section text, p_name text, p_ok boolean, p_detail text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO _vs VALUES (p_section,p_name,coalesce(p_ok,false),p_detail); END $$;
GRANT EXECUTE ON FUNCTION _vsk(text,text,boolean,text) TO anon, authenticated, service_role;


-- =====================================================================
--  FIXTURE
--
--  Two companies, each with an admin and a plain member, and one active
--  policy per company with a published version. Company A's members
--  acknowledge; company B's do not, so a leak shows up as a non-zero
--  count rather than as a coincidence.
--
--  Re-runnable: everything is keyed on fixed UUIDs and removed first, in
--  dependency order.
-- =====================================================================
DO $fixture$
DECLARE
  ca uuid := '00000000-0000-7900-a000-00000000000a';
  cb uuid := '00000000-0000-7900-a000-00000000000b';
  a_admin  uuid := '00000000-0000-7900-b000-00000000a001';
  a_member uuid := '00000000-0000-7900-b000-00000000a002';
  b_admin  uuid := '00000000-0000-7900-b000-00000000b001';
  pa uuid := '00000000-0000-7900-c000-0000000000a1';
  pb uuid := '00000000-0000-7900-c000-0000000000b1';
  va uuid := '00000000-0000-7900-d000-0000000000a1';
  vb uuid := '00000000-0000-7900-d000-0000000000b1';
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);

  DELETE FROM public.policy_acknowledgements WHERE version_id IN (va, vb);
  DELETE FROM public.policy_versions         WHERE id IN (va, vb);
  DELETE FROM public.policies                WHERE id IN (pa, pb);
  DELETE FROM public.company_members         WHERE company_id IN (ca, cb);
  DELETE FROM public.profiles                WHERE id IN (a_admin, a_member, b_admin);
  DELETE FROM auth.users                     WHERE id IN (a_admin, a_member, b_admin);
  DELETE FROM public.companies               WHERE id IN (ca, cb);

  INSERT INTO public.companies(id, name) VALUES
    (ca, 'View Test Company A'), (cb, 'View Test Company B');

  --  Three profiles in A, one in B, so a correct headcount for A is 2
  --  (admin + member) and is distinguishable from 1 (own row only).
  --
  --  A's second member is content_creator deliberately: profiles_role_check
  --  allows admin, compliance_officer and content_creator, and the RLS
  --  policy "Reviewers can view company profiles" grants company-wide
  --  read to the first two only. content_creator is therefore the role
  --  that sees just its own row — the case section C depends on.
  --  profiles.id is a foreign key onto auth.users, so the identities
  --  have to exist before the profiles do.
  INSERT INTO auth.users(id, email) VALUES
    (a_admin,  'a.admin@viewtest.invalid'),
    (a_member, 'a.member@viewtest.invalid'),
    (b_admin,  'b.admin@viewtest.invalid')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles(id, company_id, role, full_name, email) VALUES
    (a_admin,  ca, 'admin',  'A Admin',  'a.admin@viewtest.invalid'),
    (a_member, ca, 'content_creator', 'A Member', 'a.member@viewtest.invalid'),
    (b_admin,  cb, 'admin',  'B Admin',  'b.admin@viewtest.invalid');

  --  status is set explicitly because app_is_company_member() requires
  --  status = 'active'. Leaving it to a column default would make
  --  section D's membership check pass without being exercised.
  INSERT INTO public.company_members(company_id, user_id, role, status) VALUES
    (ca, a_admin,  'owner',  'active'),
    (ca, a_member, 'member', 'active'),
    (cb, b_admin,  'owner',  'active')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.policies(id, company_id, category, title, is_active) VALUES
    (pa, ca, 'privacy', 'A Data Retention', true),
    (pb, cb, 'privacy', 'B Data Retention', true);

  INSERT INTO public.policy_versions(id, policy_id, version_label, status, published_at, created_at) VALUES
    (va, pa, '1.0', 'published', now() - interval '10 days', now() - interval '10 days'),
    (vb, pb, '1.0', 'published', now() - interval '10 days', now() - interval '10 days');

  --  One of A's two members has acknowledged -> 1 of 2 -> 50%.
  INSERT INTO public.policy_acknowledgements(version_id, user_id, policy_id)
    VALUES (va, a_admin, pa);
END
$fixture$;


-- =====================================================================
--  A — the clause is set on every view in public
-- =====================================================================
DO $a$
DECLARE missing text;
BEGIN
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO missing
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'v'
     AND COALESCE(c.reloptions::text, '') NOT LIKE '%security_invoker=true%';

  PERFORM _vsk('A','A1 no view in public executes as its owner',
    missing IS NULL, coalesce('without the clause: '||missing, 'all views carry it'));

  PERFORM _vsk('A','A2 v_policy_compliance_stats carries it',
    EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname='v_policy_compliance_stats'
               AND c.reloptions::text LIKE '%security_invoker=true%'));

  --  The other two may legitimately not exist: performance_views.sql
  --  aborts before creating them. Assert the implication, not existence.
  PERFORM _vsk('A','A3 v_vendor_risk_exposure carries it if present',
    NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                 WHERE n.nspname='public' AND c.relname='v_vendor_risk_exposure'
                   AND c.relkind='v'
                   AND COALESCE(c.reloptions::text,'') NOT LIKE '%security_invoker=true%'));

  PERFORM _vsk('A','A4 v_audit_velocity carries it if present',
    NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                 WHERE n.nspname='public' AND c.relname='v_audit_velocity'
                   AND c.relkind='v'
                   AND COALESCE(c.reloptions::text,'') NOT LIKE '%security_invoker=true%'));

  PERFORM _vsk('A','A5 v_automation_health_summary carries it if present',
    NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                 WHERE n.nspname='public' AND c.relname='v_automation_health_summary'
                   AND c.relkind='v'
                   AND COALESCE(c.reloptions::text,'') NOT LIKE '%security_invoker=true%'));
END
$a$;


-- =====================================================================
--  B — company B's admin reads the view. Legitimate user, wrong tenant.
-- =====================================================================
RESET ROLE;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-7900-b000-00000000b001","role":"authenticated"}', false);
SET ROLE authenticated;

DO $b$
DECLARE n bigint; leaked bigint;
BEGIN
  --  The whole view, unfiltered. Under the old definition this returned
  --  every company's policies.
  SELECT count(*) INTO n FROM public.v_policy_compliance_stats;
  SELECT count(*) INTO leaked FROM public.v_policy_compliance_stats
    WHERE company_id = '00000000-0000-7900-a000-00000000000a';

  PERFORM _vsk('B','B1 sees no row belonging to company A',
    leaked = 0, format('rows for A visible to B: %s', leaked));

  PERFORM _vsk('B','B2 still sees its own company (not an outage)',
    EXISTS (SELECT 1 FROM public.v_policy_compliance_stats
             WHERE company_id = '00000000-0000-7900-a000-00000000000b'),
    format('total rows visible: %s', n));

  --  The client-supplied filter the frontend uses. Passing another
  --  company's id must yield nothing now.
  SELECT count(*) INTO leaked FROM public.v_policy_compliance_stats
    WHERE company_id = '00000000-0000-7900-a000-00000000000a';
  PERFORM _vsk('B','B3 naming A''s company_id explicitly yields nothing',
    leaked = 0,
    'this is the exact call commandCenterService.ts makes, with companyId changed');
END
$b$;


-- =====================================================================
--  C — the counts are right for a PLAIN member, not only an admin
--
--  A's correct answer is total_users = 2, acknowledged_users = 1,
--  compliance_rate = 50. A bare security_invoker view would give 1/1 and
--  100 to the admin and 1/0 and 0 to the member.
-- =====================================================================
RESET ROLE;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-7900-b000-00000000a002","role":"authenticated"}', false);
SET ROLE authenticated;

DO $c$
DECLARE t bigint; ack bigint; rate numeric; own bigint;
BEGIN
  --  First, prove the premise: this member really can only read one
  --  profile and one acknowledgement. If that stops being true the rest
  --  of section C stops testing anything.
  SELECT count(*) INTO own FROM public.profiles;
  PERFORM _vsk('C','C1 a plain member can read only their own profile',
    own = 1, format('profiles visible to a plain member: %s', own));

  SELECT total_users, acknowledged_users, compliance_rate
    INTO t, ack, rate
    FROM public.v_policy_compliance_stats
   WHERE company_id = '00000000-0000-7900-a000-00000000000a';

  PERFORM _vsk('C','C2 total_users is the company headcount, not 1',
    t = 2, format('total_users=%s (expected 2)', t));
  PERFORM _vsk('C','C3 acknowledged_users counts the company, not the caller',
    ack = 1, format('acknowledged_users=%s (expected 1)', ack));
  PERFORM _vsk('C','C4 compliance_rate is 50, not 0 or 100',
    rate = 50, format('compliance_rate=%s', rate));
END
$c$;

--  The admin must agree with the member. Two roles, one answer.
RESET ROLE;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-7900-b000-00000000a001","role":"authenticated"}', false);
SET ROLE authenticated;

DO $c2$
DECLARE t bigint; ack bigint;
BEGIN
  SELECT total_users, acknowledged_users INTO t, ack
    FROM public.v_policy_compliance_stats
   WHERE company_id = '00000000-0000-7900-a000-00000000000a';

  PERFORM _vsk('C','C5 an admin sees the same numbers as a plain member',
    t = 2 AND ack = 1, format('admin saw total=%s ack=%s', t, ack));
END
$c2$;


-- =====================================================================
--  D — the helper authorises, rather than trusting the id it is given
-- =====================================================================
RESET ROLE;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-7900-b000-00000000b001","role":"authenticated"}', false);
SET ROLE authenticated;

DO $d$
DECLARE t bigint; ack bigint;
BEGIN
  --  B's admin names A's policy id directly, bypassing the view. The
  --  function is SECURITY DEFINER, so RLS will not stop it; the
  --  membership check must.
  SELECT total_users, acknowledged_users INTO t, ack
    FROM public.policy_ack_coverage('00000000-0000-7900-c000-0000000000a1');

  PERFORM _vsk('D','D1 a non-member gets zeros from the helper',
    t = 0 AND ack = 0,
    format('a foreign caller got total=%s ack=%s — an argument is not an authorisation', t, ack));

  SELECT total_users INTO t
    FROM public.policy_ack_coverage('00000000-0000-7900-c000-0000000000b1');
  PERFORM _vsk('D','D2 a member still gets their own company''s count',
    t = 1, format('B has 1 profile, helper returned %s', t));

  SELECT total_users, acknowledged_users INTO t, ack
    FROM public.policy_ack_coverage('00000000-0000-0000-0000-000000000000');
  PERFORM _vsk('D','D3 an unknown policy id returns zeros, not an error',
    t = 0 AND ack = 0);
END
$d$;

DO $d4$
DECLARE ok boolean;
BEGIN
  SELECT has_function_privilege('anon', 'public.policy_ack_coverage(uuid)', 'EXECUTE')
    INTO ok;
  PERFORM _vsk('D','D4 anon cannot execute the helper', NOT ok);
END
$d4$;


-- =====================================================================
--  E — anon
-- =====================================================================
RESET ROLE;
SELECT set_config('request.jwt.claims', '', false);
SET ROLE anon;

DO $e$
DECLARE n bigint; denied boolean := false;
BEGIN
  BEGIN
    SELECT count(*) INTO n FROM public.v_policy_compliance_stats;
  EXCEPTION WHEN insufficient_privilege THEN
    denied := true; n := 0;
  END;

  PERFORM _vsk('E','E1 anon reads nothing from the view',
    denied OR n = 0,
    format('denied=%s rows=%s', denied, n));
END
$e$;

RESET ROLE;
SELECT set_config('request.jwt.claims', '', false);


-- =====================================================================
--  F — the organization_id / company_id repair
--
--  The old view grouped profiles by organization_id, which references
--  organizations(id) and is never backfilled from company_id, so the
--  join to policies.company_id did not match and the rate was always 0.
--  Section C already proves the number is now right; this proves the
--  cause is gone rather than masked.
-- =====================================================================
DO $f$
DECLARE def text;
BEGIN
  SELECT pg_get_viewdef('public.v_policy_compliance_stats'::regclass, true) INTO def;

  PERFORM _vsk('F','F1 the view no longer reads profiles.organization_id',
    def NOT LIKE '%organization_id%',
    'organization_id references organizations(id), not companies(id)');

  PERFORM _vsk('F','F2 the counts come from the membership-checked helper',
    def LIKE '%policy_ack_coverage%');

  --  And the two columns really are distinct, so F1 is not vacuous.
  PERFORM _vsk('F','F3 profiles has both columns, so the confusion was real',
    (SELECT count(*) = 2 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='profiles'
        AND column_name IN ('organization_id','company_id')));
END
$f$;


-- =====================================================================
--  G — the migration's own guard
--
--  Section 7 of the migration raises if any view lacks the clause. Prove
--  it by removing the clause and re-running that block, then restoring.
--  A guard nobody has seen bite is a guard nobody knows works.
-- =====================================================================
DO $g$
DECLARE bit boolean := false;
BEGIN
  ALTER VIEW public.v_policy_compliance_stats SET (security_invoker = false);
  BEGIN
    DECLARE v_leaky text;
    BEGIN
      SELECT string_agg(c.relname, ', ') INTO v_leaky
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname='public' AND c.relkind='v'
         AND COALESCE(c.reloptions::text,'') NOT LIKE '%security_invoker=true%';
      IF v_leaky IS NOT NULL THEN
        RAISE EXCEPTION 'leaky: %', v_leaky;
      END IF;
    END;
  EXCEPTION WHEN raise_exception THEN
    bit := true;
  END;
  ALTER VIEW public.v_policy_compliance_stats SET (security_invoker = true);

  PERFORM _vsk('G','G1 the deploy-time guard detects a view without the clause', bit);
  PERFORM _vsk('G','G2 and the view was restored afterwards',
    (SELECT c.reloptions::text LIKE '%security_invoker=true%'
       FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname='v_policy_compliance_stats'));
END
$g$;


-- =====================================================================
--  CLEANUP — in dependency order, so the suite is re-runnable
-- =====================================================================
DO $cleanup$
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  DELETE FROM public.policy_acknowledgements
    WHERE version_id IN ('00000000-0000-7900-d000-0000000000a1',
                         '00000000-0000-7900-d000-0000000000b1');
  DELETE FROM public.policy_versions
    WHERE id IN ('00000000-0000-7900-d000-0000000000a1',
                 '00000000-0000-7900-d000-0000000000b1');
  DELETE FROM public.policies
    WHERE id IN ('00000000-0000-7900-c000-0000000000a1',
                 '00000000-0000-7900-c000-0000000000b1');
  DELETE FROM public.company_members
    WHERE company_id IN ('00000000-0000-7900-a000-00000000000a',
                         '00000000-0000-7900-a000-00000000000b');
  DELETE FROM public.profiles
    WHERE id IN ('00000000-0000-7900-b000-00000000a001',
                 '00000000-0000-7900-b000-00000000a002',
                 '00000000-0000-7900-b000-00000000b001');
  DELETE FROM auth.users
    WHERE id IN ('00000000-0000-7900-b000-00000000a001',
                 '00000000-0000-7900-b000-00000000a002',
                 '00000000-0000-7900-b000-00000000b001');
  DELETE FROM public.companies
    WHERE id IN ('00000000-0000-7900-a000-00000000000a',
                 '00000000-0000-7900-a000-00000000000b');
END
$cleanup$;


\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo '  VIEW OWNERSHIP — THE FOUR PERFORMANCE VIEWS'
\echo '════════════════════════════════════════════════════════════════'
SELECT section, count(*) AS assertions, count(*) FILTER (WHERE NOT ok) AS failures
  FROM _vs GROUP BY section ORDER BY section;
SELECT section, name, coalesce(detail,'') AS detail FROM _vs WHERE NOT ok ORDER BY section, name;
SELECT count(*) AS total, count(*) FILTER (WHERE ok) AS passed,
       count(*) FILTER (WHERE NOT ok) AS failed FROM _vs;

DO $v$
DECLARE f integer;
BEGIN
  SELECT count(*) INTO f FROM _vs WHERE NOT ok;
  IF f > 0 THEN RAISE EXCEPTION 'VIEW OWNERSHIP: % assertion(s) failed', f; END IF;
  RAISE NOTICE 'VIEW OWNERSHIP: all assertions passed';
END
$v$;
