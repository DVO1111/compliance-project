-- ============================================================================
--  The authorised signatory register (20261020000000).
--
--  This table decides whose signature a regulatory submission will accept
--  (A3.1, A3.3). Three ways a register like this is quietly not a control:
--
--    A.  anyone can add themselves. Then it carries the authority of a
--        control while being a preference. The write policy must be
--        admin-only, and the test must be run as a REAL non-admin member
--        of the same company — not an anonymous caller, who is refused by
--        everything and proves nothing.
--
--    B.  removal is a DELETE. Then "was this letter signed by someone
--        authorised at the time?" is unanswerable, which is the only
--        question the register exists to answer.
--
--    C.  changes are not logged. The notes say they are, and a log that
--        is wired but never fires looks exactly like one that is.
--
--  Section D covers the trigger that carries an invite's sites, job title
--  and signing authority onto the membership when it is accepted — the
--  part of ONB-05 that happens when nobody is watching.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

DO $guard$
BEGIN
  IF current_database() NOT IN ('postgres','criateur_local') THEN
    RAISE EXCEPTION 'REFUSING TO RUN: this suite writes fixtures. Database is %', current_database();
  END IF;
END $guard$;

DROP TABLE IF EXISTS sg_results;
CREATE TEMP TABLE sg_results(seq serial, id text, name text, status text, detail text);
GRANT ALL ON sg_results TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE sg_results_seq_seq TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION sg_ok(p_id text, p_name text, p_cond boolean, p_detail text DEFAULT '')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO sg_results(id,name,status,detail)
  VALUES (p_id,p_name,CASE WHEN p_cond THEN 'PASS' ELSE 'FAIL' END,p_detail);
END $$;

-- ── fixtures: one company, an admin and an ordinary member ──────────────────

DO $fx$
DECLARE
  ca uuid := '00000000-0000-5167-a000-00000000000a';
  cb uuid := '00000000-0000-5167-a000-00000000000b';
  ua uuid := '00000000-0000-5167-b000-000000000001';  -- admin
  um uuid := '00000000-0000-5167-b000-000000000002';  -- ordinary member
BEGIN
  INSERT INTO public.companies(id,name) VALUES (ca,'SG Alpha'), (cb,'SG Bravo')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO auth.users(id,email) VALUES
    (ua,'sg-admin@local.test'), (um,'sg-member@local.test')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.profiles(id,email,full_name,role,company_id) VALUES
    (ua,'sg-admin@local.test','Ada Admin','admin',ca),
    (um,'sg-member@local.test','Mo Member','content_creator',ca) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.company_members(company_id,user_id,role,status) VALUES
    (ca,ua,'owner','active'), (ca,um,'viewer','active') ON CONFLICT DO NOTHING;
END $fx$;

-- ── A. only an admin may change the register ────────────────────────────────

SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-5167-b000-000000000002","role":"authenticated"}', false);
SET ROLE authenticated;

DO $a$
DECLARE
  ca uuid := '00000000-0000-5167-a000-00000000000a';
BEGIN
  PERFORM sg_ok('A0','the caller is a real, active member of the company',
    public.app_is_company_member(ca));

  --  THE ONE THAT MATTERS. A member who could add themselves has given
  --  themselves signing authority over regulatory submissions.
  BEGIN
    INSERT INTO public.authorised_signatories(company_id,email,full_name)
    VALUES (ca,'sg-member@local.test','Mo Member');
    PERFORM sg_ok('A1','an ordinary member cannot add themselves', false, 'IT WAS ACCEPTED');
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM sg_ok('A1','an ordinary member cannot add themselves', true);
  WHEN others THEN
    PERFORM sg_ok('A1','an ordinary member cannot add themselves',
      SQLSTATE = '42501', format('%s / %s', SQLSTATE, SQLERRM));
  END;
END $a$;

RESET ROLE;

-- ── B. the register, as an admin ────────────────────────────────────────────

SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-5167-b000-000000000001","role":"authenticated"}', false);
SET ROLE authenticated;

DO $b$
DECLARE
  ca uuid := '00000000-0000-5167-a000-00000000000a';
  cb uuid := '00000000-0000-5167-a000-00000000000b';
  ua uuid := '00000000-0000-5167-b000-000000000001';
  v_id uuid;
  n int;
BEGIN
  BEGIN
    INSERT INTO public.authorised_signatories(company_id,user_id,email,full_name,job_title,added_by)
    VALUES (ca,ua,'sg-admin@local.test','Ada Admin','Head of Quality / QA Manager',ua)
    RETURNING id INTO v_id;
    PERFORM sg_ok('B1','an admin adds someone to the register', v_id IS NOT NULL);
  EXCEPTION WHEN others THEN
    PERFORM sg_ok('B1','an admin adds someone to the register', false, SQLERRM);
  END;

  --  One ACTIVE entry per address. Two live rows for one person means two
  --  answers to "are they authorised", and nothing says which is right.
  BEGIN
    INSERT INTO public.authorised_signatories(company_id,email)
    VALUES (ca,'  SG-Admin@Local.TEST ');
    PERFORM sg_ok('B2','the same person cannot be on the register twice', false, 'IT WAS ACCEPTED');
  EXCEPTION WHEN unique_violation THEN
    PERFORM sg_ok('B2','the same person cannot be on the register twice', true);
  END;

  PERFORM sg_ok('B3','an admin cannot write into another company''s register',
    NOT public.app_has_company_role(cb, ARRAY['owner','admin']));

  BEGIN
    INSERT INTO public.authorised_signatories(company_id,email) VALUES (ca,'   ');
    PERFORM sg_ok('B4','a blank address is refused', false, 'IT WAS ACCEPTED');
  EXCEPTION WHEN check_violation THEN
    PERFORM sg_ok('B4','a blank address is refused', true);
  END;

  -- ── Removal is a date, not a DELETE ──
  UPDATE public.authorised_signatories
  SET removed_at = now(), removed_by = ua
  WHERE id = v_id;

  SELECT count(*) INTO n FROM public.authorised_signatories WHERE id = v_id;
  PERFORM sg_ok('B5','a removed signatory is still on record', n = 1, format('%s rows', n));

  SELECT count(*) INTO n
  FROM public.authorised_signatories
  WHERE company_id = ca AND removed_at IS NULL;
  PERFORM sg_ok('B6','…but no longer counts as authorised', n = 0, format('%s active', n));

  --  Someone reinstated is a SECOND row with its own history, not an edit
  --  of the first, which is why the unique index is partial.
  BEGIN
    INSERT INTO public.authorised_signatories(company_id,user_id,email,added_by)
    VALUES (ca,ua,'sg-admin@local.test',ua);
    PERFORM sg_ok('B7','someone removed can be put back on', true);
  EXCEPTION WHEN others THEN
    PERFORM sg_ok('B7','someone removed can be put back on', false, SQLERRM);
  END;

  BEGIN
    INSERT INTO public.authorised_signatories(company_id,email,added_at,removed_at)
    VALUES (ca,'sg-timetravel@local.test', now(), now() - interval '1 day');
    PERFORM sg_ok('B8','a removal cannot precede the addition', false, 'IT WAS ACCEPTED');
  EXCEPTION WHEN check_violation THEN
    PERFORM sg_ok('B8','a removal cannot precede the addition', true);
  END;
END $b$;

-- ── C. changes are logged (A3.3) ────────────────────────────────────────────

DO $c$
DECLARE
  ca uuid := '00000000-0000-5167-a000-00000000000a';
  n int;
BEGIN
  SELECT count(*) INTO n
  FROM public.audit_logs
  WHERE company_id = ca AND entity_type = 'authorised_signatory'
    AND action = 'signatory_added';
  PERFORM sg_ok('C1','adding a signatory is logged', n >= 2, format('%s entries', n));

  SELECT count(*) INTO n
  FROM public.audit_logs
  WHERE company_id = ca AND entity_type = 'authorised_signatory'
    AND action = 'signatory_removed';
  PERFORM sg_ok('C2','removing one is logged as a removal', n >= 1, format('%s entries', n));

  --  The entry has to say WHO, or it records that something happened to
  --  somebody, which is not a log.
  SELECT count(*) INTO n
  FROM public.audit_logs
  WHERE company_id = ca AND entity_type = 'authorised_signatory'
    AND metadata->>'email' = 'sg-admin@local.test';
  PERFORM sg_ok('C3','the entry names the person', n >= 2, format('%s entries', n));

  --  The log is hash-chained. A trigger that inserted rows without a
  --  link would break the chain for every table that uses it.
  SELECT count(*) INTO n
  FROM public.audit_logs
  WHERE company_id = ca AND entity_type = 'authorised_signatory'
    AND (integrity_hash IS NULL OR previous_hash IS NULL);
  PERFORM sg_ok('C4','the entries are chained like every other', n = 0, format('%s unchained', n));
END $c$;

RESET ROLE;
SELECT set_config('request.jwt.claims','',false);

-- ── D. an invite's extras reach the membership on acceptance ────────────────
--  The trigger is the only thing that carries site_ids, job_title and the
--  signing flag across. Without it the screen collects three answers and
--  stores one.

DO $d$
DECLARE
  ca uuid := '00000000-0000-5167-a000-00000000000a';
  ua uuid := '00000000-0000-5167-b000-000000000001';
  un uuid := '00000000-0000-5167-b000-000000000003';  -- the invited person
  s1 uuid := '00000000-0000-5167-c000-000000000001';
  v_invite uuid := '00000000-0000-5167-d000-000000000001';
  v_sites uuid[];
  v_title text;
  n int;
BEGIN
  INSERT INTO auth.users(id,email) VALUES (un,'sg-invited@local.test')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.profiles(id,email,full_name,role,company_id)
    VALUES (un,'sg-invited@local.test','Ngozi Invited','content_creator',ca)
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.sites(id,company_id,name,site_type)
    VALUES (s1,ca,'SG Ibadan plant','manufacturing')
    ON CONFLICT (company_id,name) DO NOTHING;

  INSERT INTO public.company_invites
    (id, company_id, email, role, module_access, token, expires_at, created_by,
     site_ids, job_title, signs_applications)
  VALUES
    (v_invite, ca, 'sg-invited@local.test', 'viewer', ARRAY['quality_operations'],
     'sg-token', now() + interval '72 hours', ua,
     ARRAY[s1], 'QC Analyst', true);

  --  accept_company_invite writes the membership first and marks the
  --  invite accepted second. The fixture does the same in that order,
  --  because the trigger depends on it.
  INSERT INTO public.company_members(company_id,user_id,role,status)
    VALUES (ca,un,'viewer','active') ON CONFLICT DO NOTHING;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub',un,'role','authenticated')::text, true);

  UPDATE public.company_invites SET accepted_at = now() WHERE id = v_invite;

  SELECT site_ids, job_title INTO v_sites, v_title
  FROM public.company_members WHERE company_id = ca AND user_id = un;

  PERFORM sg_ok('D1','the invited person''s site comes across', v_sites = ARRAY[s1],
    coalesce(v_sites::text,'null'));
  PERFORM sg_ok('D2','…and their job title', v_title = 'QC Analyst', coalesce(v_title,'null'));

  SELECT count(*) INTO n
  FROM public.authorised_signatories
  WHERE company_id = ca AND user_id = un AND removed_at IS NULL;
  PERFORM sg_ok('D3','…and they are put on the signatory register', n = 1, format('%s rows', n));

  --  Accepting twice must not make a second register entry. The trigger
  --  fires on any update to accepted_at, not only the first.
  UPDATE public.company_invites SET accepted_at = now() WHERE id = v_invite;
  SELECT count(*) INTO n
  FROM public.authorised_signatories
  WHERE company_id = ca AND user_id = un AND removed_at IS NULL;
  PERFORM sg_ok('D4','accepting again does not duplicate the register entry',
    n = 1, format('%s rows', n));

  PERFORM set_config('request.jwt.claims','',true);
END $d$;

-- ── summary ─────────────────────────────────────────────────────────────────
--  total, passed, failed — the shape run-sql-tests.sh reads.

SELECT id, name, status, detail FROM sg_results ORDER BY seq;

SELECT
  count(*)                                AS total,
  count(*) FILTER (WHERE status = 'PASS') AS passed,
  count(*) FILTER (WHERE status = 'FAIL') AS failed
FROM sg_results;

-- ── cleanup ─────────────────────────────────────────────────────────────────

DO $cleanup$
BEGIN
  PERFORM set_config('request.jwt.claims','',true);
  DELETE FROM public.authorised_signatories WHERE email LIKE 'sg-%@local.test';
  DELETE FROM public.audit_logs         WHERE entity_type = 'authorised_signatory';
  DELETE FROM public.company_invites    WHERE email LIKE 'sg-%@local.test';
  DELETE FROM public.sites              WHERE name LIKE 'SG %';
  DELETE FROM public.company_members    WHERE user_id::text LIKE '00000000-0000-5167-b000-%';
  DELETE FROM public.profiles           WHERE email LIKE 'sg-%@local.test';
  DELETE FROM auth.users                WHERE email LIKE 'sg-%@local.test';
  DELETE FROM public.companies          WHERE name IN ('SG Alpha','SG Bravo');
  RAISE NOTICE 'sg fixtures removed.';
EXCEPTION WHEN others THEN
  RAISE WARNING 'CLEANUP INCOMPLETE (%). Remove SG rows manually.', SQLERRM;
END $cleanup$;
