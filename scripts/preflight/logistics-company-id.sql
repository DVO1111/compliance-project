-- =====================================================================
--  READ-ONLY PREFLIGHT — company_id on the logistics tables
--
--  WHAT THIS IS FOR
--  ----------------
--  Four logistics tables carry `company_id uuid NOT NULL` with NO
--  foreign key to `companies`:
--
--      shipments
--      shipment_events
--      cn_declarations
--      contraband_rejection_log        <-- not in the original report
--
--  Every other table in the schema that is company-scoped references
--  `companies (id)`, and the three facility tables added in
--  20261204000000 do too. These four are the exception.
--
--  Adding the constraint is a one-line migration. Adding it SAFELY is
--  not, because `ALTER TABLE ... ADD FOREIGN KEY` validates every
--  existing row, and a single row whose company_id names a company
--  that no longer exists will abort the whole migration. On a
--  deployment that runs migrations in order, that aborts everything
--  after it too.
--
--  So this script answers one question, without changing anything:
--  IS THERE ANY SUCH ROW?
--
--  HOW TO RUN IT
--  -------------
--      psql "$DATABASE_URL" -X -f scripts/preflight/logistics-company-id.sql
--
--  It is SELECT-only. It creates nothing, writes nothing and locks
--  nothing beyond the ACCESS SHARE a read takes. It is safe to run
--  against a live database, and safe to interrupt.
--
--  Read the DECISION block at the end before writing any migration.
-- =====================================================================
\set ON_ERROR_STOP on
\pset pager off

\echo ''
\echo '═══════════════════════════════════════════════════════════════'
\echo '  LOGISTICS company_id PREFLIGHT  (read-only)'
\echo '═══════════════════════════════════════════════════════════════'
\echo ''

SELECT current_database() AS database,
       current_user       AS run_as,
       now()              AS run_at;

\echo ''
\echo '── 1. Which tables are actually missing the constraint ────────'
\echo '   Checked live rather than assumed: if a constraint has been'
\echo '   added since this script was written, it says so.'
\echo ''

SELECT c.relname AS table_name,
       EXISTS (
         SELECT 1 FROM pg_constraint k
          WHERE k.conrelid = c.oid
            AND k.contype = 'f'
            AND k.confrelid = 'public.companies'::regclass
            AND a.attnum = ANY (k.conkey)
       ) AS has_company_fk,
       a.attnotnull AS company_id_not_null
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'company_id'
 WHERE n.nspname = 'public'
   AND c.relkind = 'r'
   AND c.relname IN ('shipments','shipment_events','cn_declarations',
                     'contraband_rejection_log')
 ORDER BY c.relname;

\echo ''
\echo '── 2. Row counts, so a zero orphan count means something ──────'
\echo '   An empty table cannot have an orphan, and reporting "clean"'
\echo '   for one would be misleading.'
\echo ''

SELECT 'shipments' AS table_name, count(*) AS rows,
       count(DISTINCT company_id) AS distinct_companies FROM public.shipments
UNION ALL SELECT 'shipment_events', count(*), count(DISTINCT company_id)
  FROM public.shipment_events
UNION ALL SELECT 'cn_declarations', count(*), count(DISTINCT company_id)
  FROM public.cn_declarations
UNION ALL SELECT 'contraband_rejection_log', count(*), count(DISTINCT company_id)
  FROM public.contraband_rejection_log
 ORDER BY 1;

\echo ''
\echo '── 3. ORPHANS — the rows that would abort an ADD FOREIGN KEY ──'
\echo '   A company_id with no matching row in companies. This is the'
\echo '   answer the migration depends on.'
\echo ''

WITH orphans AS (
  SELECT 'shipments' AS table_name, s.id, s.company_id
    FROM public.shipments s
    LEFT JOIN public.companies c ON c.id = s.company_id
   WHERE c.id IS NULL
  UNION ALL
  SELECT 'shipment_events', e.id, e.company_id
    FROM public.shipment_events e
    LEFT JOIN public.companies c ON c.id = e.company_id
   WHERE c.id IS NULL
  UNION ALL
  SELECT 'cn_declarations', d.id, d.company_id
    FROM public.cn_declarations d
    LEFT JOIN public.companies c ON c.id = d.company_id
   WHERE c.id IS NULL
  UNION ALL
  SELECT 'contraband_rejection_log', r.id, r.company_id
    FROM public.contraband_rejection_log r
    LEFT JOIN public.companies c ON c.id = r.company_id
   WHERE c.id IS NULL
)
SELECT table_name,
       count(*) AS orphan_rows,
       count(DISTINCT company_id) AS distinct_missing_companies
  FROM orphans
 GROUP BY table_name
 ORDER BY table_name;

\echo ''
\echo '   The offending company ids, so each can be traced. No row'
\echo '   contents are selected — only the ids needed to decide.'
\echo ''

WITH orphans AS (
  SELECT 'shipments' AS table_name, s.company_id
    FROM public.shipments s
    LEFT JOIN public.companies c ON c.id = s.company_id WHERE c.id IS NULL
  UNION ALL
  SELECT 'shipment_events', e.company_id
    FROM public.shipment_events e
    LEFT JOIN public.companies c ON c.id = e.company_id WHERE c.id IS NULL
  UNION ALL
  SELECT 'cn_declarations', d.company_id
    FROM public.cn_declarations d
    LEFT JOIN public.companies c ON c.id = d.company_id WHERE c.id IS NULL
  UNION ALL
  SELECT 'contraband_rejection_log', r.company_id
    FROM public.contraband_rejection_log r
    LEFT JOIN public.companies c ON c.id = r.company_id WHERE c.id IS NULL
)
SELECT company_id AS missing_company_id,
       string_agg(DISTINCT table_name, ', ' ORDER BY table_name) AS seen_in,
       count(*) AS rows_affected
  FROM orphans
 GROUP BY company_id
 ORDER BY count(*) DESC
 LIMIT 50;

\echo ''
\echo '── 4. A nil or all-zero company_id, which is its own case ─────'
\echo '   A placeholder id is an orphan too, but it is remediated by'
\echo '   deciding what the row belonged to, not by restoring a'
\echo '   deleted company.'
\echo ''

SELECT 'shipments' AS table_name, count(*) AS nil_company_rows
  FROM public.shipments WHERE company_id = '00000000-0000-0000-0000-000000000000'
UNION ALL SELECT 'shipment_events', count(*) FROM public.shipment_events
 WHERE company_id = '00000000-0000-0000-0000-000000000000'
UNION ALL SELECT 'cn_declarations', count(*) FROM public.cn_declarations
 WHERE company_id = '00000000-0000-0000-0000-000000000000'
UNION ALL SELECT 'contraband_rejection_log', count(*) FROM public.contraband_rejection_log
 WHERE company_id = '00000000-0000-0000-0000-000000000000'
 ORDER BY 1;

\echo ''
\echo '── 5. Child rows pointing at a parent of a DIFFERENT company ──'
\echo '   Not what the foreign key would catch, but the same class of'
\echo '   defect and worth knowing before touching these tables: an'
\echo '   event whose shipment belongs to another company.'
\echo ''

SELECT count(*) AS events_whose_shipment_is_another_company
  FROM public.shipment_events e
  JOIN public.shipments s ON s.id = e.shipment_id
 WHERE s.company_id <> e.company_id;

\echo ''
\echo '═══════════════════════════════════════════════════════════════'
\echo '  DECISION'
\echo '═══════════════════════════════════════════════════════════════'
\echo ''
\echo '  Section 3 reports NO orphans, in every table:'
\echo '    The constraint can be added normally. Prefer the two-step'
\echo '    form anyway (ADD ... NOT VALID, then VALIDATE CONSTRAINT)'
\echo '    because VALIDATE takes a weaker lock than ADD, and the'
\echo '    pattern is already used for shipment_events_event_type_check'
\echo '    in 20261203000000.'
\echo ''
\echo '  Section 3 reports ANY orphans:'
\echo '    Do NOT add the constraint yet. Each orphan is a row whose'
\echo '    owner is unknown, and there are only three honest outcomes,'
\echo '    none of which a migration should pick on its own:'
\echo '      - the company was deleted and the row should go too;'
\echo '      - the company was deleted in error and should be restored;'
\echo '      - the id was always wrong, and somebody has to say which'
\echo '        company the row belonged to.'
\echo '    Deleting them to make a constraint apply would destroy'
\echo '    customs and shipment records to tidy a schema.'
\echo ''
\echo '  Either way: this script does not decide. It reports.'
\echo ''
