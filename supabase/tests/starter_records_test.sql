-- ============================================================================
--  The starter records ONB-06 writes.
--
--  src/tests/starterRecords.test.ts checks every seeded row against a COPY
--  of these CHECK constraints, written out in TypeScript. That copy is only
--  as good as the day it was made: widen or narrow a constraint here and the
--  TypeScript suite goes on passing against a schema that no longer exists,
--  and the failure surfaces as a broken insert on the last click of setup,
--  after six steps of work.
--
--  So this suite asserts the two things the copy depends on:
--
--    A.  the exact values ONB-06 writes are still accepted;
--    B.  the columns it relies on being OPTIONAL still are — a licence with
--        no expiry date, a record with no owner. "Renewal alerts begin only
--        once a date exists" (A5.1) is only true if a licence can exist
--        without one.
--
--  Section C inserts the real shapes and reads them back, because a
--  constraint that accepts a value proves nothing about a NOT NULL column
--  nobody remembered.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

DO $guard$
BEGIN
  IF current_database() NOT IN ('postgres','criateur_local') THEN
    RAISE EXCEPTION 'REFUSING TO RUN: this suite writes fixtures. Database is %', current_database();
  END IF;
END $guard$;

DROP TABLE IF EXISTS sr_results;
CREATE TEMP TABLE sr_results(seq serial, id text, name text, status text, detail text);
--  Section D runs as `authenticated`, which needs to record its own
--  results. Without these grants the whole section aborts on the first
--  assertion and the suite reports a smaller, clean-looking total.
GRANT ALL ON sr_results TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE sr_results_seq_seq TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION sr_ok(p_id text, p_name text, p_cond boolean, p_detail text DEFAULT '')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO sr_results(id,name,status,detail)
  VALUES (p_id,p_name,CASE WHEN p_cond THEN 'PASS' ELSE 'FAIL' END,p_detail);
END $$;

--  Does a table's CHECK constraints mention this value anywhere?
CREATE OR REPLACE FUNCTION sr_accepts(p_table text, p_value text)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = ('public.' || p_table)::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%''' || p_value || '''%'
  );
$$;

-- ── A. the values ONB-06 writes ─────────────────────────────────────────────

DO $a$
BEGIN
  PERFORM sr_ok('A1','obligations still accept status identified',
    sr_accepts('regulatory_obligations','identified'));
  PERFORM sr_ok('A2','…and frequency annual',
    sr_accepts('regulatory_obligations','annual'));

  PERFORM sr_ok('A3','licences still accept status draft',
    sr_accepts('regulatory_licences','draft'));
  PERFORM sr_ok('A4','…and the four licence types the template uses',
    sr_accepts('regulatory_licences','nafdac_site_manufacturing_licence')
    AND sr_accepts('regulatory_licences','nafdac_gmp_certificate')
    AND sr_accepts('regulatory_licences','nafdac_import_permit')
    AND sr_accepts('regulatory_licences','son_mancap_approval'));
  --  PCN premises and practising licences have no type of their own, so
  --  they are written as 'other' with the regulator in regulatory_body.
  PERFORM sr_ok('A5','…and other, which is what the PCN rows use',
    sr_accepts('regulatory_licences','other'));

  PERFORM sr_ok('A6','policies still accept operational and hr',
    sr_accepts('policies','operational') AND sr_accepts('policies','hr'));

  PERFORM sr_ok('A7','risks still accept the categories the template uses',
    sr_accepts('risks','operational') AND sr_accepts('risks','compliance'));
  PERFORM sr_ok('A8','…and the levels high and medium',
    sr_accepts('risks','high') AND sr_accepts('risks','medium'));
  PERFORM sr_ok('A9','…and status identified',
    sr_accepts('risks','identified'));
END $a$;

-- ── B. what must stay optional ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION sr_nullable(p_table text, p_column text)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce((
    SELECT is_nullable = 'YES' OR column_default IS NOT NULL
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = p_table AND column_name = p_column
  ), false);
$$;

DO $b$
BEGIN
  --  THE A5.1 PROMISE. "Renewal alerts begin only once a date exists" is
  --  only true if a licence can be stored without one.
  PERFORM sr_ok('B1','a licence can exist with no expiry date',
    sr_nullable('regulatory_licences','expiry_date'));
  PERFORM sr_ok('B2','…and no certificate number',
    sr_nullable('regulatory_licences','registration_number'));

  --  "These records are unowned until assigned."
  PERFORM sr_ok('B3','an obligation can be unowned',
    sr_nullable('regulatory_obligations','owner_id'));
  PERFORM sr_ok('B4','…and have no due date',
    sr_nullable('regulatory_obligations','due_date'));
  PERFORM sr_ok('B5','a policy can be unowned', sr_nullable('policies','owner_id'));
  PERFORM sr_ok('B6','a risk can be unowned',  sr_nullable('risks','owner_id'));
END $b$;

-- ── C. the real shapes, inserted and read back ──────────────────────────────

DO $c$
DECLARE
  ca uuid := '00000000-0000-5737-a000-00000000000a';
  ua uuid := '00000000-0000-5737-b000-000000000001';
  n int;
  v_expiry date;
BEGIN
  INSERT INTO public.companies(id,name) VALUES (ca,'SR Alpha') ON CONFLICT (id) DO NOTHING;
  INSERT INTO auth.users(id,email) VALUES (ua,'sr-a@local.test') ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.profiles(id,email,full_name,role,company_id)
    VALUES (ua,'sr-a@local.test','Ada SR','admin',ca) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.company_members(company_id,user_id,role,status)
    VALUES (ca,ua,'owner','active') ON CONFLICT DO NOTHING;

  BEGIN
    INSERT INTO public.regulatory_obligations
      (company_id, title, description, jurisdiction, category, status, is_recurring, frequency)
    VALUES
      (ca, 'SR NAFDAC GMP: keep the site inspection-ready',
       'Good Manufacturing Practice conditions are maintained continuously.',
       'Nigeria', 'gmp', 'identified', true, NULL),
      (ca, 'SR PCN premises registration renewal',
       'Pharmacists Council of Nigeria registration of the premises is renewed each year.',
       'Nigeria', 'licensing', 'identified', true, 'annual');
    PERFORM sr_ok('C1','the obligation rows insert', true);
  EXCEPTION WHEN others THEN
    PERFORM sr_ok('C1','the obligation rows insert', false, SQLERRM);
  END;

  BEGIN
    INSERT INTO public.regulatory_licences
      (company_id, licence_type, name, regulatory_body, status, notes, created_by)
    VALUES
      (ca, 'nafdac_site_manufacturing_licence', 'SR NAFDAC manufacturing licence',
       'nafdac', 'draft', 'Starter record.', ua),
      (ca, 'other', 'SR PCN premises registration', 'pcn', 'draft', 'Starter record.', ua);
    PERFORM sr_ok('C2','the licence rows insert with no dates at all', true);
  EXCEPTION WHEN others THEN
    PERFORM sr_ok('C2','the licence rows insert with no dates at all', false, SQLERRM);
  END;

  SELECT expiry_date INTO v_expiry
  FROM public.regulatory_licences WHERE company_id = ca AND name = 'SR PCN premises registration';
  PERFORM sr_ok('C3','a starter licence really has no expiry date', v_expiry IS NULL,
    coalesce(v_expiry::text,'null'));

  BEGIN
    INSERT INTO public.policies (company_id, category, title, description, review_cycle_months)
    VALUES (ca, 'operational', 'SR Quality policy',
            'The commitment to product quality and who is accountable for it.', 12);
    PERFORM sr_ok('C4','the policy rows insert', true);
  EXCEPTION WHEN others THEN
    PERFORM sr_ok('C4','the policy rows insert', false, SQLERRM);
  END;

  BEGIN
    INSERT INTO public.risks
      (company_id, title, description, risk_category, risk_level, status, created_by)
    VALUES (ca, 'SR Cross-contamination between products',
            'Residue from one product carried into another through shared equipment.',
            'operational', 'high', 'identified', ua);
    PERFORM sr_ok('C5','the risk rows insert', true);
  EXCEPTION WHEN others THEN
    PERFORM sr_ok('C5','the risk rows insert', false, SQLERRM);
  END;

  --  "Seeded records are a starting point, not a constraint: editable and
  --  deletable (J3.5)." Nothing may stop a plain DELETE.
  DELETE FROM public.risks WHERE company_id = ca AND title LIKE 'SR %';
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM sr_ok('C6','a starter record can simply be deleted', n = 1, format('%s rows', n));
END $c$;

-- ── D. the person who actually does this ────────────────────────────────────
--  THE CASE THAT WAS BROKEN. The owner of a new workspace is written as
--  company_members.role = 'owner' by create_company, and
--  profiles.role = 'content_creator' by provision_profile — deliberately,
--  as the least-privileged value. Section C ran as the table owner, which
--  bypasses RLS and therefore proves nothing about them.
--
--  Everything below runs as that person, through the policies.

SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-5737-b000-000000000002","role":"authenticated"}', false);

DO $d$
DECLARE
  cb uuid := '00000000-0000-5737-a000-00000000000b';
  ub uuid := '00000000-0000-5737-b000-000000000002';
BEGIN
  INSERT INTO public.companies(id,name) VALUES (cb,'SR Bravo') ON CONFLICT (id) DO NOTHING;
  INSERT INTO auth.users(id,email) VALUES (ub,'sr-owner@local.test') ON CONFLICT (id) DO NOTHING;
  --  content_creator, exactly as provision_profile writes it.
  INSERT INTO public.profiles(id,email,full_name,role,company_id)
    VALUES (ub,'sr-owner@local.test','Ada Owner','content_creator',cb)
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.company_members(company_id,user_id,role,status)
    VALUES (cb,ub,'owner','active') ON CONFLICT DO NOTHING;
END $d$;

SET ROLE authenticated;

DO $d2$
DECLARE
  cb uuid := '00000000-0000-5737-a000-00000000000b';
  ub uuid := '00000000-0000-5737-b000-000000000002';
BEGIN
  PERFORM sr_ok('D0','the caller owns the workspace but is not a privileged profile role',
    public.app_has_company_role(cb, ARRAY['owner','admin'])
    AND (SELECT role FROM public.profiles WHERE id = ub) = 'content_creator');

  BEGIN
    INSERT INTO public.regulatory_obligations
      (company_id, title, description, jurisdiction, category, status, is_recurring)
    VALUES (cb, 'SR owner obligation', 'Written by the workspace owner.',
            'Nigeria', 'gmp', 'identified', true);
    PERFORM sr_ok('D1','the owner can write an obligation', true);
  EXCEPTION WHEN others THEN
    PERFORM sr_ok('D1','the owner can write an obligation', false,
      format('%s / %s', SQLSTATE, SQLERRM));
  END;

  BEGIN
    INSERT INTO public.regulatory_licences
      (company_id, licence_type, name, regulatory_body, status, created_by)
    VALUES (cb, 'nafdac_gmp_certificate', 'SR owner licence', 'nafdac', 'draft', ub);
    PERFORM sr_ok('D2','…a licence', true);
  EXCEPTION WHEN others THEN
    PERFORM sr_ok('D2','…a licence', false, format('%s / %s', SQLSTATE, SQLERRM));
  END;

  BEGIN
    INSERT INTO public.policies (company_id, category, title, description)
    VALUES (cb, 'operational', 'SR owner policy', 'Written by the workspace owner.');
    PERFORM sr_ok('D3','…a policy', true);
  EXCEPTION WHEN others THEN
    PERFORM sr_ok('D3','…a policy', false, format('%s / %s', SQLSTATE, SQLERRM));
  END;

  --  This one was refused before 20261021000000: risks_manage asked for a
  --  profiles.role the workspace owner does not have.
  BEGIN
    INSERT INTO public.risks
      (company_id, title, description, risk_category, risk_level, status, created_by)
    VALUES (cb, 'SR owner risk', 'Written by the workspace owner.',
            'operational', 'high', 'identified', ub);
    PERFORM sr_ok('D4','…and a risk', true);
  EXCEPTION WHEN others THEN
    PERFORM sr_ok('D4','…and a risk', false, format('%s / %s', SQLSTATE, SQLERRM));
  END;

  --  And reads them back: a write the writer cannot see is a row that has
  --  vanished as far as the product is concerned.
  PERFORM sr_ok('D5','and can see the obligation afterwards',
    EXISTS (SELECT 1 FROM public.regulatory_obligations
            WHERE company_id = cb AND title = 'SR owner obligation'));
END $d2$;

RESET ROLE;
SELECT set_config('request.jwt.claims','',false);

-- ── summary ─────────────────────────────────────────────────────────────────
--  total, passed, failed — the shape run-sql-tests.sh reads.

SELECT id, name, status, detail FROM sr_results ORDER BY seq;

SELECT
  count(*)                                AS total,
  count(*) FILTER (WHERE status = 'PASS') AS passed,
  count(*) FILTER (WHERE status = 'FAIL') AS failed
FROM sr_results;

-- ── cleanup ─────────────────────────────────────────────────────────────────

DO $cleanup$
BEGIN
  DELETE FROM public.regulatory_obligations WHERE title LIKE 'SR %';
  DELETE FROM public.regulatory_licences    WHERE name  LIKE 'SR %';
  DELETE FROM public.policies               WHERE title LIKE 'SR %';
  DELETE FROM public.risks                  WHERE title LIKE 'SR %';
  DELETE FROM public.company_members WHERE user_id::text LIKE '00000000-0000-5737-b000-%';
  DELETE FROM public.companies       WHERE name = 'SR Bravo';
  DELETE FROM public.profiles        WHERE email LIKE 'sr-%@local.test';
  DELETE FROM auth.users             WHERE email LIKE 'sr-%@local.test';
  DELETE FROM public.companies       WHERE name = 'SR Alpha';
  RAISE NOTICE 'sr fixtures removed.';
EXCEPTION WHEN others THEN
  RAISE WARNING 'CLEANUP INCOMPLETE (%). Remove SR rows manually.', SQLERRM;
END $cleanup$;
