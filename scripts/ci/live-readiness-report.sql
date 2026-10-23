-- =====================================================================
--  LIVE READINESS REPORT  —  READ ONLY
--
--  Every statement below is a SELECT. It creates nothing, changes
--  nothing and locks nothing beyond a read. It is safe to run against
--  production and is meant to be: the numbers it returns are what the
--  deployment plan is built from, and they move.
--
--  Run:
--    psql "$CRIATEUR_DB_URL" -f scripts/ci/live-readiness-report.sql
--
--  or paste each section into the Supabase SQL editor.
--
--  Re-run it immediately before deploying. Every figure here is a
--  statement about a moment.
--
--  Sections 1 and 2 read supabase_migrations.schema_migrations, which
--  the Supabase CLI maintains. A local database built straight from
--  the migration files has no such schema and those two sections will
--  error there. That is expected and is not a finding; every other
--  section runs on both.
-- =====================================================================

\echo '=== 1. Identity and migration position ==='
SELECT
  current_database()                                           AS db,
  (SELECT count(*) FROM information_schema.tables
    WHERE table_schema='public')                               AS public_tables,
  (SELECT count(*) FROM supabase_migrations.schema_migrations) AS migrations_applied,
  (SELECT max(version) FROM supabase_migrations.schema_migrations) AS latest_applied;

\echo '=== 2. Which of this branch''s migrations are outstanding ==='
WITH expected(version) AS (VALUES
  ('20261103000000'),('20261104000000'),('20261105000000'),('20261106000000'),
  ('20261107000000'),('20261108000000'),('20261109000000'),('20261110000000'),
  ('20261111000000'),('20261112000000'),('20261113000000'),('20261114000000'),
  ('20261115000000'),('20261116000000'),('20261117000000'),('20261118000000')
)
SELECT e.version,
       CASE WHEN m.version IS NULL THEN 'OUTSTANDING' ELSE 'applied' END AS state
  FROM expected e
  LEFT JOIN supabase_migrations.schema_migrations m ON m.version = e.version
 ORDER BY e.version;

\echo '=== 3. OPERATIONAL ROLES ==='
\echo '-- Since 20261119000000 PM-03 reads operational_role_assignments,'
\echo '-- NOT company_members.role. The membership column below is shown'
\echo '-- because it must stay untouched, and because a value of one of'
\echo '-- the eight would be bridged -- which no company_role can be.'
\echo '-- Until assignments exist, every guard ABSTAINS and the layer is'
\echo '-- inert. members_with_a_pm03_role should read 0 here, always.'
SELECT
  (SELECT format_type(a.atttypid, a.atttypmod) FROM pg_attribute a
    WHERE a.attrelid='public.company_members'::regclass
      AND a.attname='role' AND a.attnum>0)                     AS role_column_type,
  (SELECT string_agg(enumlabel, ', ' ORDER BY enumsortorder)
     FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
    WHERE t.typname='company_role')                            AS enum_values,
  (SELECT count(*) FROM public.company_members)                AS members_total,
  (SELECT count(*) FROM public.company_members
    WHERE role::text IN ('procurement','storekeeper','qc_analyst','qa_officer',
                         'qa_manager','production_supervisor','compliance_admin',
                         'management'))                        AS members_with_a_pm03_role;

\echo '-- Who holds what today, and any free-text job titles that hint at intent.'
SELECT role::text AS member_role, count(*) AS members
  FROM public.company_members GROUP BY 1 ORDER BY 2 DESC;

SELECT coalesce(job_title,'(none recorded)') AS job_title, count(*) AS people
  FROM public.company_members GROUP BY 1 ORDER BY 2 DESC;

\echo '-- The register that now decides. Before deployment this table does'
\echo '-- not exist; after it, it is empty until somebody appoints people.'
\echo '-- Wrapped in EXECUTE so the script runs on either side of the'
\echo '-- deployment rather than failing to parse on one of them.'
DO $$
DECLARE v record;
BEGIN
  IF to_regclass('public.operational_role_assignments') IS NULL THEN
    RAISE NOTICE 'operational_role_assignments: NOT DEPLOYED YET';
    RETURN;
  END IF;

  EXECUTE $q$
    SELECT (SELECT count(*) FROM public.operational_role_assignments
             WHERE revoked_at IS NULL)                              AS live_assignments,
           (SELECT count(DISTINCT user_id) FROM public.operational_role_assignments
             WHERE revoked_at IS NULL)                              AS people_with_a_role,
           (SELECT count(*) FROM public.operational_role_assignments
             WHERE revoked_at IS NULL AND role = 'qa_manager')      AS qa_managers,
           (SELECT legacy_membership_bridge
              FROM public.work_role_resolution)                     AS bridge_on
  $q$ INTO v;

  RAISE NOTICE 'live assignments: %, people with a role: %, QA Managers: %, bridge on: %',
    v.live_assignments, v.people_with_a_role, v.qa_managers, v.bridge_on;
END $$;

\echo '-- Companies with only one active member cannot appoint anybody,'
\echo '-- because nobody may assign themselves an operational role.'
SELECT company_id, count(*) AS active_members
  FROM public.company_members
 WHERE coalesce(status::text,'active') = 'active'
 GROUP BY 1 HAVING count(*) < 2
 ORDER BY 2;

\echo '=== 4. Specification readiness ==='
\echo '-- A batch cannot be released without an approved specification in'
\echo '-- force on its manufacturing date. These are the products that need one.'
SELECT
  (SELECT count(*) FROM public.products)                       AS products_total,
  (SELECT count(DISTINCT product_id) FROM public.batch_records
    WHERE product_id IS NOT NULL
      AND status::text NOT IN ('released','rejected','archived')) AS products_with_open_batches,
  (SELECT count(*) FROM public.batch_records
    WHERE status::text = 'qc_in_progress')                     AS batches_awaiting_release,
  (SELECT count(*) FROM public.batch_records
    WHERE product_id IS NULL)                                  AS batches_with_no_product,
  (SELECT count(*) FROM public.batch_qc_results)               AS finished_qc_results_recorded;

\echo '-- Per product, the batches that will block and whether a spec exists.'
SELECT p.id AS product_id,
       p.trade_name,
       p.status::text AS product_status,
       count(b.id) FILTER (WHERE b.status::text NOT IN ('released','rejected','archived'))
         AS open_batches,
       count(b.id) FILTER (WHERE b.status::text = 'qc_in_progress')
         AS awaiting_release,
       min(b.manufacturing_date) FILTER (WHERE b.status::text NOT IN ('released','rejected','archived'))
         AS earliest_open_manufacture,
       CASE WHEN to_regclass('public.product_specifications') IS NULL
            THEN 'table not deployed yet' ELSE 'check after deploy' END AS specification
  FROM public.products p
  LEFT JOIN public.batch_records b ON b.product_id = p.id
 GROUP BY p.id, p.trade_name, p.status
HAVING count(b.id) > 0
 ORDER BY awaiting_release DESC, open_batches DESC;

\echo '=== 5. Audit records ==='
SELECT
  (SELECT count(*) FROM public.audit_logs)                     AS entries_total,
  (SELECT count(*) FROM public.audit_logs
    WHERE integrity_hash IS NOT NULL)                          AS entries_hashed,
  (SELECT count(*) FROM public.audit_logs
    WHERE integrity_hash IS NULL)                              AS entries_UNHASHED_a_finding,
  (SELECT count(DISTINCT company_id) FROM public.audit_logs)   AS companies_with_entries,
  (SELECT count(*) FROM public.audit_logs
    WHERE action = 'CHAIN_REANCHOR')                           AS chain_reanchor_entries;

\echo '-- The immutability controls. 20260225000000 is recorded as applied on'
\echo '-- the Criateur project and its triggers are ABSENT there; 20261116000000'
\echo '-- restores them.'
SELECT t.tgname AS trigger_name,
       CASE t.tgenabled WHEN 'D' THEN 'DISABLED' ELSE 'enabled' END AS state
  FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
 WHERE c.relname = 'audit_logs' AND NOT t.tgisinternal
 ORDER BY t.tgname;

\echo '-- Entries that will be marked legacy-client-v0 by 20261115000000.'
SELECT count(*) AS will_be_marked_legacy
  FROM public.audit_logs
 WHERE integrity_hash IS NOT NULL
   AND (to_regclass('public.audit_hash_conventions') IS NULL
        OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                        WHERE table_schema='public' AND table_name='audit_logs'
                          AND column_name='hash_algo'));

\echo '=== 6. Other deployment dependencies ==='
SELECT
  (SELECT count(*) FROM public.material_qa_authorities
    WHERE revoked_at IS NULL)                                  AS qa_authorities_designated,
  (SELECT count(*) FROM public.access_grants)                  AS access_grants_existing,
  (SELECT coalesce(t.requires_signature::text,'(no transition)')
     FROM public.lifecycle_transitions t
     JOIN public.lifecycle_definitions d ON d.id=t.definition_id
     JOIN public.lifecycle_states s ON s.id=t.to_state_id
    WHERE d.entity_type='batch_record' AND s.state_key='released'
      AND t.action_key='release' LIMIT 1)                      AS release_requires_signature_today,
  (SELECT count(*) FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
    WHERE c.relname IN ('batch_records','batch_qc_results','raw_material_receipts',
                        'certificate_of_analysis')
      AND p.polcmd='w'
      AND coalesce(pg_get_expr(p.polqual,p.polrelid),'') LIKE '%owner%admin%'
      AND coalesce(pg_get_expr(p.polqual,p.polrelid),'') NOT LIKE '%app_section_access%')
                                                               AS write_policies_excluding_work_roles;

\echo '=== 7. Lifecycle states the new guards name ==='
\echo '-- A guard naming a state that does not exist never fires.'
SELECT d.entity_type,
       string_agg(s.state_key, ', ' ORDER BY s.sort_order) AS states
  FROM public.lifecycle_states s
  JOIN public.lifecycle_definitions d ON d.id = s.definition_id
 WHERE d.entity_type IN ('batch_record','material_lot','supplier','deviation','capa_record')
 GROUP BY d.entity_type
 ORDER BY d.entity_type;
