-- ============================================================================
--  Raising a CAPA carries what was written
--  (20261126115405_capa_is_written_when_it_is_raised.sql).
--
--  The complaint: "it just changes the status to a CAPA has been raised
--  without actually allowing me to write the CAPA, add responsibility
--  and timeline." The form is where that is collected; this is the half
--  that proves the database accepts and keeps it, and refuses the one
--  thing worth refusing.
--
--  B2 is the assertion that matters most. The provenance line is the
--  easiest casualty of restating a function this size, and losing it
--  turns every CAPA into an orphan the first time somebody asks why it
--  exists — so the test checks the line survived ALONGSIDE the author's
--  text, not instead of it.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

DO $guard$
BEGIN
  IF current_database() NOT IN ('postgres','criateur_local') THEN
    RAISE EXCEPTION 'REFUSING TO RUN: this suite writes fixtures. Database is %', current_database();
  END IF;
END $guard$;

CREATE TEMP TABLE IF NOT EXISTS crf_results(
  id text, name text, status text, detail text
) ON COMMIT PRESERVE ROWS;
TRUNCATE crf_results;

CREATE OR REPLACE FUNCTION pg_temp.crf_ok(p_id text, p_name text, p_cond boolean, p_detail text DEFAULT '')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO crf_results VALUES (p_id, p_name, CASE WHEN p_cond THEN 'PASS' ELSE 'FAIL' END, p_detail);
END $$;

-- ── A. the signature ────────────────────────────────────────────────────────

DO $a$
DECLARE v_count int; v_args text;
BEGIN
  SELECT count(*) INTO v_count
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname='capa_raise_from_deviation';

  --  Two overloads would make which one PostgREST calls depend on the
  --  arguments the browser happened to send — a coin toss between a
  --  CAPA that records the author's text and one that drops it.
  PERFORM pg_temp.crf_ok('A1','exactly one capa_raise_from_deviation exists',
    v_count = 1, v_count || ' found');

  SELECT pg_get_function_arguments(p.oid) INTO v_args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname='capa_raise_from_deviation' LIMIT 1;

  PERFORM pg_temp.crf_ok('A2','it takes a description, an owner and a due date',
    v_args LIKE '%p_description%' AND v_args LIKE '%p_owner_id%' AND v_args LIKE '%p_due_date%',
    coalesce(v_args,'<none>'));
END $a$;

-- ── B. what it records ──────────────────────────────────────────────────────

DO $b$
DECLARE
  v_company uuid;
  u_raiser  uuid := '00000000-0000-6a11-0a00-000000000001';
  u_owner   uuid := '00000000-0000-6a11-0a00-000000000002';
  u_outside uuid := '00000000-0000-6a11-0a00-000000000003';
  v_dev     uuid;
  v_capa    public.capa_records;
  v_err     text;
BEGIN
  INSERT INTO auth.users(id, email) VALUES
    (u_raiser,  'crf-raiser@local.test'),
    (u_owner,   'crf-owner@local.test'),
    (u_outside, 'crf-outside@local.test')
    ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.companies(name) VALUES ('CRF Co') RETURNING id INTO v_company;
  INSERT INTO public.company_members(company_id, user_id, role, status) VALUES
    (v_company, u_raiser, 'owner', 'active'),
    (v_company, u_owner,  'admin', 'active');

  INSERT INTO public.profiles(id, email, full_name, company_id)
  VALUES (u_owner, 'crf-owner@local.test', 'Ada Okafor', v_company)
  ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

  INSERT INTO public.deviations
    (company_id, deviation_number, title, description, severity,
     product_quality_impact, source_type, entry_point, raised_by)
  VALUES
    --  source_type 'process', not 'manual': deviations_source_id_required
    --  insists that anything other than process or facility carries a
    --  source_id, and this deviation points at nothing in particular.
    (v_company, 'DEV-CRF-1', 'Hardness out of specification',
     'Observed during in-process checks.', 'major', 'yes', 'process', 'manual', u_raiser)
  RETURNING id INTO v_dev;

  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', u_raiser)::text, true);

  v_capa := public.capa_raise_from_deviation(
    v_dev,
    'Re-qualify the tablet press',
    'corrective',
    NULL,
    false,
    '2026-12-10'::timestamptz,
    'Re-qualify the press and retrain two operators on the hardness check.',
    u_owner);

  PERFORM pg_temp.crf_ok('B1','the title given is the title kept',
    v_capa.title = 'Re-qualify the tablet press', coalesce(v_capa.title,'<null>'));

  --  BOTH, not either. See the header.
  PERFORM pg_temp.crf_ok('B2','the description keeps the provenance line AND the author''s text',
    v_capa.description LIKE '%Raised from deviation DEV-CRF-1%'
    AND v_capa.description LIKE '%retrain two operators%',
    left(coalesce(v_capa.description,'<null>'), 120));

  PERFORM pg_temp.crf_ok('B3','responsibility is recorded as an identity',
    v_capa.owner_id = u_owner, coalesce(v_capa.owner_id::text,'<null>'));

  --  The text column is derived rather than typed, so the two cannot
  --  disagree about who the owner is.
  PERFORM pg_temp.crf_ok('B4','the legacy owner_name is derived from that identity',
    v_capa.owner_name = 'Ada Okafor', coalesce(v_capa.owner_name,'<null>'));

  PERFORM pg_temp.crf_ok('B5','the timeline is recorded',
    v_capa.due_date IS NOT NULL, coalesce(v_capa.due_date::text,'<null>'));

  --  Severity carries across when the caller does not override it.
  PERFORM pg_temp.crf_ok('B6','a major deviation still yields a high priority',
    v_capa.priority = 'high', coalesce(v_capa.priority,'<null>'));

  --  C. work assigned outside the workspace is work nobody can see.
  BEGIN
    PERFORM public.capa_raise_from_deviation(
      v_dev, 'Outside owner', 'corrective', NULL, false, NULL, 'Body.', u_outside);
    PERFORM pg_temp.crf_ok('C1','an owner outside the workspace is refused',
      false, 'IT SUCCEEDED');
  EXCEPTION WHEN others THEN
    v_err := SQLERRM;
    PERFORM pg_temp.crf_ok('C1','an owner outside the workspace is refused',
      v_err LIKE 'CAPA_OWNER_NOT_A_MEMBER%', v_err);
  END;

  --  And a CAPA with no owner is still permitted, because the database
  --  is deliberately not the gate for completeness — the form is. A
  --  rule that refused this would reject the CAPA this project already
  --  has and break any browser running the previous bundle.
  BEGIN
    PERFORM public.capa_raise_from_deviation(v_dev);
    PERFORM pg_temp.crf_ok('C2','a CAPA with no owner is still accepted by the database', true);
  EXCEPTION WHEN others THEN
    PERFORM pg_temp.crf_ok('C2','a CAPA with no owner is still accepted by the database',
      false, SQLERRM);
  END;

  PERFORM set_config('request.jwt.claims', '', true);
END $b$;

-- ── summary ─────────────────────────────────────────────────────────────────

SELECT id, name, status, detail FROM crf_results ORDER BY id;

--  Column order is total, passed, failed — the shape the harness reads.
SELECT
  count(*)                                AS total,
  count(*) FILTER (WHERE status = 'PASS') AS passed,
  count(*) FILTER (WHERE status = 'FAIL') AS failed
FROM crf_results;

-- ── cleanup ─────────────────────────────────────────────────────────────────

DO $cleanup$
DECLARE v_company uuid;
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  SELECT id INTO v_company FROM public.companies WHERE name = 'CRF Co';

  DELETE FROM public.deviation_links WHERE company_id = v_company;
  DELETE FROM public.capa_records    WHERE company_id = v_company;
  DELETE FROM public.entity_state_history WHERE company_id = v_company;
  DELETE FROM public.entity_current_state WHERE company_id = v_company;
  DELETE FROM public.deviations      WHERE company_id = v_company;
  DELETE FROM public.profiles        WHERE email LIKE 'crf-%@local.test';
  DELETE FROM public.company_members WHERE company_id = v_company;
  DELETE FROM public.companies       WHERE id = v_company;
  DELETE FROM auth.users             WHERE email LIKE 'crf-%@local.test';
  RAISE NOTICE 'crf fixtures removed.';
EXCEPTION WHEN others THEN
  RAISE WARNING 'CLEANUP INCOMPLETE (%). Remove crf rows manually.', SQLERRM;
END $cleanup$;
