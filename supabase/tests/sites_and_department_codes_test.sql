-- ============================================================================
--  Sites and department codes (20261019000000).
--
--  ONB-03 introduces a table the product never had. Three things about
--  it are worth asserting, because each is the kind of thing that looks
--  fine on the screen and is wrong in the data:
--
--    A.  the shape rules — a site must be named, must be a kind of place
--        the product recognises, and two sites in one company cannot
--        share a name. "Ibadan plant" on a batch record has to mean one
--        building.
--
--    B.  the department code — it goes into a document number, so a
--        lower-case or punctuated code would split one series into two
--        (CC-qa-2026-0001 beside CC-QA-2026-0001). It must also be
--        unique per company, and NULL must not count as a collision:
--        several departments can be waiting for a code at once.
--
--    C.  tenancy — a new table with RLS enabled and no working policy is
--        readable by nobody, and a new table with RLS off is readable by
--        everybody. Both pass a test that only ever looks at its own
--        company, so this section runs as a real signed-in user of a
--        DIFFERENT company.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

DO $guard$
BEGIN
  IF current_database() NOT IN ('postgres','criateur_local') THEN
    RAISE EXCEPTION 'REFUSING TO RUN: this suite writes fixtures. Database is %', current_database();
  END IF;
END $guard$;

DROP TABLE IF EXISTS st_results;
CREATE TEMP TABLE st_results(seq serial, id text, name text, status text, detail text);
GRANT ALL ON st_results TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE st_results_seq_seq TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION st_ok(p_id text, p_name text, p_cond boolean, p_detail text DEFAULT '')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO st_results(id,name,status,detail)
  VALUES (p_id,p_name,CASE WHEN p_cond THEN 'PASS' ELSE 'FAIL' END,p_detail);
END $$;

-- ── fixtures: two companies, one real member each ───────────────────────────

DO $fx$
DECLARE
  ca uuid := '00000000-0000-5173-a000-00000000000a';
  cb uuid := '00000000-0000-5173-a000-00000000000b';
  ua uuid := '00000000-0000-5173-b000-000000000001';
  ub uuid := '00000000-0000-5173-b000-000000000002';
BEGIN
  INSERT INTO public.companies(id,name) VALUES (ca,'ST Alpha'), (cb,'ST Bravo')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO auth.users(id,email) VALUES (ua,'st-a@local.test'), (ub,'st-b@local.test')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.profiles(id,email,full_name,role,company_id) VALUES
    (ua,'st-a@local.test','Ada Alpha','admin',ca),
    (ub,'st-b@local.test','Bo Bravo','admin',cb) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.company_members(company_id,user_id,role,status) VALUES
    (ca,ua,'owner','active'), (cb,ub,'owner','active') ON CONFLICT DO NOTHING;

  INSERT INTO public.sites(id,company_id,name,site_type,address,product_categories)
  VALUES ('00000000-0000-5173-c000-000000000001', ca, 'ST Ibadan plant', 'manufacturing',
          '14 Oluyole Industrial Estate, Ibadan, Oyo State',
          ARRAY['drug_pharmaceutical','herbal_nutraceutical'])
  ON CONFLICT (company_id, name) DO NOTHING;
END $fx$;

-- ── A. a site is a named place of a known kind ──────────────────────────────

DO $a$
DECLARE
  ca uuid := '00000000-0000-5173-a000-00000000000a';
  cb uuid := '00000000-0000-5173-a000-00000000000b';
BEGIN
  PERFORM st_ok('A1','the fixture site was stored with its categories',
    EXISTS (SELECT 1 FROM public.sites
            WHERE company_id = ca AND name = 'ST Ibadan plant'
              AND 'herbal_nutraceutical' = ANY (product_categories)));

  --  A warehouse that only stores makes nothing. The column is an array
  --  with a default, not a required field, which is why this must work.
  BEGIN
    INSERT INTO public.sites(company_id,name,site_type,address)
    VALUES (ca,'ST Lagos warehouse','warehouse','Plot 9, Ikeja Industrial Estate, Lagos');
    PERFORM st_ok('A2','a site may make nothing', true);
  EXCEPTION WHEN others THEN
    PERFORM st_ok('A2','a site may make nothing', false, SQLERRM);
  END;

  BEGIN
    INSERT INTO public.sites(company_id,name) VALUES (ca,'   ');
    PERFORM st_ok('A3','a blank name is refused', false, 'IT WAS ACCEPTED');
  EXCEPTION WHEN check_violation THEN
    PERFORM st_ok('A3','a blank name is refused', true);
  END;

  --  'factory' is the obvious thing to type and is not one of the four.
  --  Catching it here is cheaper than finding a site the product cannot
  --  categorise after a hundred of them exist.
  BEGIN
    INSERT INTO public.sites(company_id,name,site_type) VALUES (ca,'ST Odd','factory');
    PERFORM st_ok('A4','an unrecognised site type is refused', false, 'IT WAS ACCEPTED');
  EXCEPTION WHEN check_violation THEN
    PERFORM st_ok('A4','an unrecognised site type is refused', true);
  END;

  BEGIN
    INSERT INTO public.sites(company_id,name) VALUES (ca,'ST Ibadan plant');
    PERFORM st_ok('A5','two sites in one company cannot share a name', false, 'IT WAS ACCEPTED');
  EXCEPTION WHEN unique_violation THEN
    PERFORM st_ok('A5','two sites in one company cannot share a name', true);
  END;

  --  …but two COMPANIES can. Everybody has a Lagos warehouse.
  BEGIN
    INSERT INTO public.sites(company_id,name) VALUES (cb,'ST Ibadan plant');
    PERFORM st_ok('A6','a different company may use the same name', true);
  EXCEPTION WHEN others THEN
    PERFORM st_ok('A6','a different company may use the same name', false, SQLERRM);
  END;

  --  The company's own list, separate from any one site's.
  BEGIN
    UPDATE public.companies SET product_categories = ARRAY['drug_pharmaceutical'] WHERE id = ca;
    PERFORM st_ok('A7','the company records what it makes',
      (SELECT product_categories FROM public.companies WHERE id = ca) = ARRAY['drug_pharmaceutical']);
  EXCEPTION WHEN others THEN
    PERFORM st_ok('A7','the company records what it makes', false, SQLERRM);
  END;
END $a$;

-- ── B. the department code is fit to go in a document number ────────────────

DO $b$
DECLARE
  ca uuid := '00000000-0000-5173-a000-00000000000a';
  cb uuid := '00000000-0000-5173-a000-00000000000b';
BEGIN
  BEGIN
    INSERT INTO public.departments(company_id,name,code) VALUES (ca,'ST Quality Assurance','QA');
    PERFORM st_ok('B1','a short upper-case code is accepted', true);
  EXCEPTION WHEN others THEN
    PERFORM st_ok('B1','a short upper-case code is accepted', false, SQLERRM);
  END;

  --  CC-qa-2026-0001 and CC-QA-2026-0001 would be two series for one
  --  department, and neither would look wrong on screen.
  BEGIN
    INSERT INTO public.departments(company_id,name,code) VALUES (ca,'ST Lower','qa');
    PERFORM st_ok('B2','a lower-case code is refused', false, 'IT WAS ACCEPTED');
  EXCEPTION WHEN check_violation THEN
    PERFORM st_ok('B2','a lower-case code is refused', true);
  END;

  BEGIN
    INSERT INTO public.departments(company_id,name,code) VALUES (ca,'ST Punctuated','Q-A');
    PERFORM st_ok('B3','a code with punctuation is refused', false, 'IT WAS ACCEPTED');
  EXCEPTION WHEN check_violation THEN
    PERFORM st_ok('B3','a code with punctuation is refused', true);
  END;

  BEGIN
    INSERT INTO public.departments(company_id,name,code) VALUES (ca,'ST Long','REGULATORYAFFAIRS');
    PERFORM st_ok('B4','an over-long code is refused', false, 'IT WAS ACCEPTED');
  EXCEPTION WHEN check_violation THEN
    PERFORM st_ok('B4','an over-long code is refused', true);
  END;

  BEGIN
    INSERT INTO public.departments(company_id,name,code) VALUES (ca,'ST Duplicate QA','QA');
    PERFORM st_ok('B5','one company cannot issue the same code twice', false, 'IT WAS ACCEPTED');
  EXCEPTION WHEN unique_violation THEN
    PERFORM st_ok('B5','one company cannot issue the same code twice', true);
  END;

  BEGIN
    INSERT INTO public.departments(company_id,name,code) VALUES (cb,'ST Bravo QA','QA');
    PERFORM st_ok('B6','another company may use the same code', true);
  EXCEPTION WHEN others THEN
    PERFORM st_ok('B6','another company may use the same code', false, SQLERRM);
  END;

  --  THE ONE THAT MATTERS IN PRACTICE. Departments arrive from ONB-01
  --  with names and no codes. If NULLs collided, the second department
  --  anyone added would be rejected for a code it does not have.
  BEGIN
    INSERT INTO public.departments(company_id,name) VALUES (ca,'ST Uncoded one');
    INSERT INTO public.departments(company_id,name) VALUES (ca,'ST Uncoded two');
    PERFORM st_ok('B7','several departments may be waiting for a code', true);
  EXCEPTION WHEN others THEN
    PERFORM st_ok('B7','several departments may be waiting for a code', false, SQLERRM);
  END;

  --  The whole point of a separate column: the number already issued
  --  under QA must survive the department being renamed.
  BEGIN
    UPDATE public.departments SET name = 'ST Quality Assurance (QA)'
    WHERE company_id = ca AND code = 'QA';
    PERFORM st_ok('B8','renaming a department does not change its code',
      (SELECT code FROM public.departments
       WHERE company_id = ca AND name = 'ST Quality Assurance (QA)') = 'QA');
  EXCEPTION WHEN others THEN
    PERFORM st_ok('B8','renaming a department does not change its code', false, SQLERRM);
  END;
END $b$;

-- ── C. tenancy ──────────────────────────────────────────────────────────────
--  As company B's owner — a real, legitimate signed-in user who simply
--  has no business reading company A's premises.

SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-5173-b000-000000000002","role":"authenticated"}', false);
SET ROLE authenticated;

DO $c$
DECLARE
  ca uuid := '00000000-0000-5173-a000-00000000000a';
  cb uuid := '00000000-0000-5173-a000-00000000000b';
  n int;
BEGIN
  PERFORM st_ok('C1','the caller is a member of company B and not of company A',
    public.app_is_company_member(cb) AND NOT public.app_is_company_member(ca));

  SELECT count(*) INTO n FROM public.sites WHERE company_id = ca;
  PERFORM st_ok('C2','another company''s sites are invisible', n = 0, format('saw %s', n));

  --  RLS on with no usable policy reads exactly like a leak-free table
  --  from the test above, and would break the product for everyone. So
  --  the caller's OWN rows must still be there.
  SELECT count(*) INTO n FROM public.sites WHERE company_id = cb;
  PERFORM st_ok('C3','the caller''s own sites are visible', n > 0, format('saw %s', n));

  BEGIN
    INSERT INTO public.sites(company_id,name) VALUES (ca,'ST Planted');
    PERFORM st_ok('C4','a site cannot be planted in another company', false, 'IT WAS ACCEPTED');
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM st_ok('C4','a site cannot be planted in another company', true);
  WHEN others THEN
    PERFORM st_ok('C4','a site cannot be planted in another company',
      SQLSTATE = '42501', format('%s / %s', SQLSTATE, SQLERRM));
  END;

  BEGIN
    INSERT INTO public.sites(company_id,name) VALUES (cb,'ST Bravo new site');
    PERFORM st_ok('C5','the caller may add a site to their own company', true);
  EXCEPTION WHEN others THEN
    PERFORM st_ok('C5','the caller may add a site to their own company', false, SQLERRM);
  END;

  UPDATE public.sites SET name = 'ST Renamed by Bravo' WHERE company_id = ca;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM st_ok('C6','another company''s site cannot be renamed', n = 0, format('%s rows', n));

  DELETE FROM public.sites WHERE company_id = ca;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM st_ok('C7','another company''s site cannot be deleted', n = 0, format('%s rows', n));
END $c$;

RESET ROLE;
SELECT set_config('request.jwt.claims','',false);

-- ── summary ─────────────────────────────────────────────────────────────────
--  Column order is total, passed, failed — the shape run-sql-tests.sh
--  reads (passed from column two, failed from column three).

SELECT id, name, status, detail FROM st_results ORDER BY seq;

SELECT
  count(*)                                AS total,
  count(*) FILTER (WHERE status = 'PASS') AS passed,
  count(*) FILTER (WHERE status = 'FAIL') AS failed
FROM st_results;

-- ── cleanup ─────────────────────────────────────────────────────────────────

DO $cleanup$
BEGIN
  PERFORM set_config('request.jwt.claims','',true);
  DELETE FROM public.sites        WHERE name LIKE 'ST %';
  DELETE FROM public.departments  WHERE name LIKE 'ST %';
  DELETE FROM public.company_members WHERE user_id::text LIKE '00000000-0000-5173-b000-%';
  DELETE FROM public.profiles     WHERE email LIKE 'st-%@local.test';
  DELETE FROM auth.users          WHERE email LIKE 'st-%@local.test';
  DELETE FROM public.companies    WHERE name IN ('ST Alpha','ST Bravo');
  RAISE NOTICE 'st fixtures removed.';
EXCEPTION WHEN others THEN
  RAISE WARNING 'CLEANUP INCOMPLETE (%). Remove ST rows manually.', SQLERRM;
END $cleanup$;
