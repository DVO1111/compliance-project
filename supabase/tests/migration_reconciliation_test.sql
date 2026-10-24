-- =====================================================================
--  THE FIVE RECONCILED MIGRATIONS
--
--  Covers 20261202000000. Five migration files share a version string
--  with a sibling, so only one of each pair can ever be recorded in
--  supabase_migrations.schema_migrations. The remedy is to give the
--  five unique versions and mark them applied — and marking a
--  migration applied asserts its effects are already present.
--
--  For two of the five that was FALSE: the attestation uniqueness
--  constraint and all four legal-hold indexes were absent from the
--  live database even though every table and function existed. These
--  assertions hold the line that object existence is not equivalence.
--
--  Sections:
--    A. The effects that were missing are now present
--    B. The register says what was reconciled, and what was not
--    C. The register is a rule table, so it is not writable
-- =====================================================================
\set ON_ERROR_STOP on
SET client_min_messages = warning;

RESET ROLE;
SELECT set_config('request.jwt.claims','', false);

CREATE TEMP TABLE _mr(section text, name text, ok boolean, detail text);
GRANT ALL ON _mr TO anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION _mrk(p_section text, p_name text, p_ok boolean, p_detail text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO _mr VALUES (p_section,p_name,coalesce(p_ok,false),p_detail); END $$;

CREATE OR REPLACE FUNCTION _mrfail(p_sql text)
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RETURN '(no refusal)';
EXCEPTION WHEN OTHERS THEN
  RETURN split_part(SQLERRM, ':', 1);
END $$;
GRANT EXECUTE ON FUNCTION _mrfail(text) TO anon, authenticated, service_role;


-- =====================================================================
--  A — the effects that were missing from the live database
-- =====================================================================
DO $a$
DECLARE
  v_state text;
  p uuid := gen_random_uuid();
  v uuid := gen_random_uuid();
  u uuid := gen_random_uuid();
BEGIN
  --  THE ONE THAT MATTERS MOST. Without it the same person can attest
  --  to the same policy version twice, which is the single thing an
  --  attestation register exists to prevent.
  PERFORM _mrk('A','A1 policy_acknowledgements has its uniqueness constraint',
    EXISTS (SELECT 1 FROM pg_constraint
             WHERE conname='policy_acknowledgements_version_user_unique'
               AND contype='u'),
    coalesce((SELECT pg_get_constraintdef(oid) FROM pg_constraint
               WHERE conname='policy_acknowledgements_version_user_unique'),'MISSING'));

  --  And it covers the three columns 20260305100000 named, in case a
  --  constraint of the right name is ever created over the wrong ones.
  PERFORM _mrk('A','A2 and it covers (policy_id, version_id, user_id)',
    (SELECT pg_get_constraintdef(oid) FROM pg_constraint
      WHERE conname='policy_acknowledgements_version_user_unique')
      = 'UNIQUE (policy_id, version_id, user_id)',
    coalesce((SELECT pg_get_constraintdef(oid) FROM pg_constraint
               WHERE conname='policy_acknowledgements_version_user_unique'),'MISSING'));

  --  The legal-hold unique index, and that it is actually unique. A
  --  non-unique index of the same name would pass an existence check
  --  and serve none of the purpose.
  PERFORM _mrk('A','A3 idx_legal_hold_items_unique exists and is UNIQUE',
    EXISTS (SELECT 1 FROM pg_indexes
             WHERE schemaname='public' AND indexname='idx_legal_hold_items_unique'
               AND indexdef ILIKE '%UNIQUE%'),
    coalesce((SELECT indexdef FROM pg_indexes
               WHERE schemaname='public' AND indexname='idx_legal_hold_items_unique'),'MISSING'));

  PERFORM _mrk('A','A4 the three remaining legal-hold indexes exist',
    (SELECT count(*) FROM pg_indexes
      WHERE schemaname='public'
        AND indexname IN ('idx_legal_hold_items_lookup',
                          'idx_retention_policies_company',
                          'idx_legal_holds_company')) = 3,
    (SELECT coalesce(string_agg(i,', '),'(all present)')
       FROM unnest(ARRAY['idx_legal_hold_items_lookup','idx_retention_policies_company',
                         'idx_legal_holds_company']) AS i
      WHERE NOT EXISTS (SELECT 1 FROM pg_indexes
                         WHERE schemaname='public' AND indexname=i)));

  --  THE UNIQUENESS ACTUALLY BITES. A constraint nobody tested is a
  --  comment.
  --
  --  The SQLSTATE is checked, not merely that something was refused.
  --  The first version of this assertion named a `company_id` column
  --  that policy_acknowledgements does not have, so it "passed" on an
  --  undefined-column error while proving nothing about uniqueness —
  --  which is also how the divergence in §B's requires_ack note came
  --  to light, since the three policies 20260305100000 creates all
  --  reference that same absent column.
  BEGIN
    INSERT INTO public.policy_acknowledgements (policy_id, version_id, user_id)
    VALUES (p,v,u), (p,v,u);
    v_state := '(no refusal)';
  EXCEPTION WHEN OTHERS THEN
    v_state := SQLSTATE;
  END;

  PERFORM _mrk('A','A5 a duplicate attestation is refused as a unique violation',
    v_state = '23505', coalesce(v_state,'(null)'));
END
$a$;


-- =====================================================================
--  B — the register of what was reconciled
--
--  Five migrations will appear in the production ledger as applied
--  without ever having been executed. Nothing in the ledger explains
--  why. This table is where that explanation lives, and these
--  assertions keep it honest.
-- =====================================================================
DO $b$
BEGIN
  PERFORM _mrk('B','B1 all five files are accounted for',
    (SELECT count(*) FROM public.migration_reconciliations) = 5,
    (SELECT count(*)::text FROM public.migration_reconciliations));

  --  Each new version is distinct from every other, and from the
  --  original it replaces. The whole problem was duplicate versions;
  --  the fix must not create more.
  PERFORM _mrk('B','B2 every reconciled version is unique and differs from its original',
    (SELECT count(DISTINCT version) FROM public.migration_reconciliations) = 5
    AND NOT EXISTS (SELECT 1 FROM public.migration_reconciliations
                     WHERE version = original_version),
    (SELECT string_agg(original_version||' -> '||version, ', ' ORDER BY version)
       FROM public.migration_reconciliations));

  --  And none of the new versions collides with a migration that
  --  actually exists as a file, which would recreate the bug.
  PERFORM _mrk('B','B3 no reconciled version collides with a real migration version',
    NOT EXISTS (
      SELECT 1 FROM public.migration_reconciliations r
       WHERE r.version IN ('20260226200000','20260227100000','20260301000000',
                           '20260305100000','20260306190000')));

  --  THE TWO THAT NEEDED COMPLETING SAY SO. If somebody later edits a
  --  verdict to 'effects_already_present' to tidy the register, the
  --  evidence for marking them applied disappears with it.
  PERFORM _mrk('B','B4 the two incomplete files are recorded as completed by the migration',
    (SELECT count(*) FROM public.migration_reconciliations
      WHERE verdict = 'effects_completed_by_this_migration') = 2,
    (SELECT string_agg(version||'='||verdict, ', ' ORDER BY version)
       FROM public.migration_reconciliations));

  PERFORM _mrk('B','B5 and they are the policy-attestation and legal-hold files',
    (SELECT count(*) FROM public.migration_reconciliations
      WHERE verdict = 'effects_completed_by_this_migration'
        AND original_version IN ('20260305100000','20260306190000')) = 2);

  --  Every row carries evidence, enforced by a CHECK as well as here.
  PERFORM _mrk('B','B6 every row carries evidence of at least 40 characters',
    NOT EXISTS (SELECT 1 FROM public.migration_reconciliations
                 WHERE length(btrim(evidence)) < 40));

  --  The divergences left alone are RECORDED, not forgotten. Three
  --  were found; the two files that have them must say so.
  PERFORM _mrk('B','B7 the files with unreconciled divergences record them',
    (SELECT count(*) FROM public.migration_reconciliations
      WHERE not_reconciled IS NOT NULL AND length(btrim(not_reconciled)) > 20) = 5,
    (SELECT count(*)::text FROM public.migration_reconciliations
      WHERE not_reconciled IS NOT NULL));

  --  The requires_ack divergence specifically, because it is the one
  --  with compliance meaning and the one most likely to be "fixed"
  --  quietly.
  PERFORM _mrk('B','B8 the requires_ack default divergence is on the record',
    EXISTS (SELECT 1 FROM public.migration_reconciliations
             WHERE original_version = '20260305100000'
               AND not_reconciled ILIKE '%requires_ack%'));

  --  An unknown verdict is refused by the schema.
  PERFORM _mrk('B','B9 an unrecognised verdict is refused',
    _mrfail($q$
      INSERT INTO public.migration_reconciliations
        (version, original_version, filename, verdict, evidence)
      VALUES ('29999999999999','29999999999998','probe.sql','looks_fine',
              'evidence text long enough to satisfy the check constraint');
    $q$) <> '(no refusal)');

  --  So is a row with no real evidence.
  PERFORM _mrk('B','B10 a row with no evidence is refused',
    _mrfail($q$
      INSERT INTO public.migration_reconciliations
        (version, original_version, filename, verdict, evidence)
      VALUES ('29999999999997','29999999999996','probe.sql',
              'effects_already_present','too short');
    $q$) <> '(no refusal)');
END
$b$;


-- =====================================================================
--  C — the register is a rule table
--
--  20261123000000 found six rule tables world-writable as
--  `authenticated` and closed them. A seventh arriving open would undo
--  that finding; an eighth here would too.
-- =====================================================================
DO $c$
BEGIN
  PERFORM _mrk('C','C1 migration_reconciliations is not writable by an app role',
    NOT EXISTS (SELECT 1 FROM information_schema.role_table_grants
                 WHERE table_schema='public' AND table_name='migration_reconciliations'
                   AND grantee IN ('anon','authenticated')
                   AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE')),
    (SELECT string_agg(DISTINCT grantee||':'||privilege_type, ', ')
       FROM information_schema.role_table_grants
      WHERE table_schema='public' AND table_name='migration_reconciliations'
        AND grantee IN ('anon','authenticated')
        AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE')));

  PERFORM _mrk('C','C2 but it is readable, so the explanation is not hidden',
    EXISTS (SELECT 1 FROM pg_policies
             WHERE schemaname='public' AND tablename='migration_reconciliations'
               AND cmd = 'SELECT'));

  PERFORM _mrk('C','C3 and row level security is enabled and forced-safe',
    (SELECT relrowsecurity FROM pg_class
      WHERE oid = 'public.migration_reconciliations'::regclass));
END
$c$;


-- =====================================================================
--  Results — COLUMN ORDER IS total, passed, failed.
-- =====================================================================
SELECT section, name, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result, detail
  FROM _mr ORDER BY section, name;

SELECT count(*) AS total,
       count(*) FILTER (WHERE ok) AS passed,
       count(*) FILTER (WHERE NOT ok) AS failed
  FROM _mr;

DO $gate$
DECLARE v_failed bigint;
BEGIN
  SELECT count(*) INTO v_failed FROM _mr WHERE NOT ok;
  IF v_failed > 0 THEN
    RAISE EXCEPTION 'MIGRATION RECONCILIATION: % assertion(s) failed', v_failed;
  END IF;
END
$gate$;
