-- CONSTRAINT PREFLIGHT — read-only. Changes nothing. Run before any
-- migration is applied to the live database.
--
-- WHY THIS IS SEPARATE FROM 02-pharma-preflight.sql.
--
-- 02 asks whether objects exist. This asks whether the DATA already in
-- the live database would survive the constraints the catch-up adds.
-- They are different questions and only one of them can be answered by
-- a replica.
--
-- All fifty migrations from 20260905 onward replay cleanly onto a
-- replica of the live schema — applied=50, failed=0. That is a real
-- result and it is also the limit of what a replica can tell you,
-- because the replica holds no rows. A migration that adds a CHECK, a
-- UNIQUE or a FOREIGN KEY to a table that already has data succeeds
-- instantly on an empty table and fails on a populated one, and the
-- failure aborts that migration's transaction.
--
-- Eight of the fifty constrain a table the live database already has.
-- Those eight, and only those, are below.
--
-- TWO COLUMNS, BECAUSE A ZERO IS AMBIGUOUS ON ITS OWN. Several of
-- these constraints are already present on live, added by hand by
-- scripts/fix/onboarding-all.sql rather than by their migration —
-- which is also why regulatory_licences.status exists there while
-- 20260921 has never run. For an already-enforced constraint the
-- violating count is necessarily zero, and reading that as "the data is
-- clean" would be wrong: nothing could have got in. So `enforced` says
-- whether the constraint is already there, and `violating` is only
-- meaningful when it is not.
--
--   enforced = yes            -> the migration's ADD CONSTRAINT is a
--                                no-op. Nothing to check.
--   enforced = no, violating 0 -> applies cleanly. Nothing to do.
--   enforced = no, violating N -> those rows are rejected and the
--                                migration aborts. Decide before
--                                running it.
--   'column absent'           -> the column is added by the same
--                                migration, so no existing row can
--                                violate it. Safe.
--
-- HOW IT STAYS READ-ONLY WHILE STILL COUNTING. A plain SELECT cannot
-- name a column that may not exist — it fails at parse time, before any
-- guard runs. So each count goes through query_to_xml(), which takes
-- its statement as text and is evaluated only when the guard above it
-- passes. query_to_xml runs a SELECT and returns xml. It creates
-- nothing, and the only statements handed to it are the counts written
-- here.

WITH
-- ── CHECK constraints ────────────────────────────────────────────────
-- A CHECK passes when it evaluates to TRUE or to NULL, so a violating
-- row is one where the expression IS FALSE. Counting `NOT (expr)`
-- instead would wrongly report NULLs as violations.
check_constraints(sort, label, tbl, col, conname, expr) AS (
  VALUES
    (1, '20260918 product_registry: regulatory_submissions.product_category',
        'regulatory_submissions', 'product_category',
        'regulatory_submissions_product_category_check',
        $$product_category = ANY (ARRAY['food','drug_pharmaceutical','cosmetic','medical_device','veterinary','biologic_vaccine','agro_chemical','herbal_nutraceutical','other'])$$),
    (2, '20260918 product_registry: vendors.category',
        'vendors', 'category',
        'vendors_category_check',
        $$category = ANY (ARRAY['cloud','payment','marketing','legal','logistics_carrier','customs_broker','last_mile','contract_manufacturer'])$$),
    (3, '20260920 submission_lifecycle: regulatory_submissions.regulatory_body',
        'regulatory_submissions', 'regulatory_body',
        'regulatory_submissions_regulatory_body_check',
        $$regulatory_body = ANY (ARRAY['nafdac','son','nafdac_son','ministry_of_health','pcn'])$$),
    (4, '20260920 submission_lifecycle: regulatory_submissions.current_status',
        'regulatory_submissions', 'current_status',
        'regulatory_submissions_current_status_check',
        $$current_status = ANY (ARRAY['draft','submitted','division_review','inspection_scheduled','inspection_completed','lab_testing','fdrc_committee','compliance_directive','awaiting_applicant_response','approved','rejected','withdrawn'])$$),
    (5, '20260920 submission_lifecycle: ctd_dossiers.status',
        'ctd_dossiers', 'status',
        'ctd_dossiers_status_check',
        $$status = ANY (ARRAY['preparation','screening','screening_query','screening_cleared','under_review','approved','rejected','withdrawn'])$$),
    -- The known hybrid: onboarding-all.sql added the status column by
    -- hand, so live HAS rows in it while the migration that constrains
    -- it has not run. The most likely place for a real violation.
    (6, '20260921 licence_lifecycle: regulatory_licences.status',
        'regulatory_licences', 'status',
        'regulatory_licences_status_check',
        $$status = ANY (ARRAY['draft','active','renewal_due','renewal_in_progress','renewed','expired','suspended','discontinued'])$$),
    (7, '20261011 batch_record_and_stages: batch_records.status',
        'batch_records', 'status',
        'batch_records_status_check',
        $$status IN ('in_progress','execution_complete','qc_pending','qc_in_progress','hold','released','rejected','archived')$$),
    -- Also hand-patched: cac_registration_number comes from
    -- onboarding-all.sql, so live may hold values that fail the shape.
    (8, '20261018 company_profile_fields: companies.cac_registration_number',
        'companies', 'cac_registration_number',
        'companies_cac_number_shape_chk',
        $$cac_registration_number IS NULL OR (btrim(cac_registration_number) <> '' AND length(cac_registration_number) <= 64)$$),
    (9, '20261019 sites_and_department_codes: departments.code shape',
        'departments', 'code',
        'departments_code_shape_chk',
        $$code IS NULL OR code ~ '^[A-Z0-9]{2,8}$'$$)
),

-- ── UNIQUE constraints ───────────────────────────────────────────────
-- Counts the duplicate GROUPS, not the rows: two departments sharing a
-- code is one collision to resolve.
unique_constraints(sort, label, tbl, conname, cols) AS (
  VALUES
    (10, '20261019 sites_and_department_codes: departments (company_id, code) duplicates',
         'departments', 'departments_code_unique_per_company', 'company_id, code')
),

-- ── FOREIGN KEY constraints ──────────────────────────────────────────
-- Counts orphans: rows whose non-null reference has no parent. A NULL
-- reference never violates a foreign key.
fk_constraints(sort, label, tbl, col, conname, parent, parent_col) AS (
  VALUES
    (11, '20261021 fix_obligations_and_risks_tenancy: regulatory_obligations.company_id -> companies',
         'regulatory_obligations', 'company_id',
         'regulatory_obligations_company_id_fkey', 'companies', 'id'),
    (12, '20261021 fix_obligations_and_risks_tenancy: obligation_links.company_id -> companies',
         'obligation_links', 'company_id',
         'obligation_links_company_id_fkey', 'companies', 'id'),
    (13, '20261024 capa_link_and_root_cause: capa_records.batch_id -> batch_records',
         'capa_records', 'batch_id',
         'capa_records_batch_id_fkey', 'batch_records', 'id'),
    -- deviations does not exist on live yet, so this reads 'parent
    -- absent'. It becomes checkable only after 20261023 runs, and by
    -- then the column is new and empty.
    (14, '20261024 capa_link_and_root_cause: capa_records.source_deviation_id -> deviations',
         'capa_records', 'source_deviation_id',
         'capa_records_source_deviation_id_fkey', 'deviations', 'id')
)

SELECT sort, label, enforced, violating FROM (
  SELECT sort, label,
    CASE WHEN to_regclass('public.' || tbl) IS NULL THEN '-'
         WHEN EXISTS (SELECT 1 FROM pg_constraint
                      WHERE conrelid = to_regclass('public.' || tbl)
                        AND pg_constraint.conname = check_constraints.conname)
         THEN 'yes' ELSE 'no' END AS enforced,
    CASE
      WHEN to_regclass('public.' || tbl) IS NULL THEN 'table absent'
      WHEN NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = tbl AND column_name = col
      ) THEN 'column absent - nothing can violate it'
      ELSE (xpath('/row/c/text()', query_to_xml(
        format('SELECT count(*) AS c FROM public.%I WHERE (%s) IS FALSE', tbl, expr),
        false, true, '')))[1]::text
    END AS violating
  FROM check_constraints

  UNION ALL

  SELECT sort, label,
    CASE WHEN to_regclass('public.' || tbl) IS NULL THEN '-'
         WHEN EXISTS (SELECT 1 FROM pg_constraint
                      WHERE conrelid = to_regclass('public.' || tbl)
                        AND pg_constraint.conname = unique_constraints.conname)
         THEN 'yes' ELSE 'no' END,
    CASE
      WHEN to_regclass('public.' || tbl) IS NULL THEN 'table absent'
      ELSE (xpath('/row/c/text()', query_to_xml(
        format('SELECT count(*) AS c FROM (SELECT %s FROM public.%I GROUP BY %s HAVING count(*) > 1) d',
               cols, tbl, cols),
        false, true, '')))[1]::text
    END
  FROM unique_constraints

  UNION ALL

  SELECT sort, label,
    CASE WHEN to_regclass('public.' || tbl) IS NULL THEN '-'
         WHEN EXISTS (SELECT 1 FROM pg_constraint
                      WHERE conrelid = to_regclass('public.' || tbl)
                        AND pg_constraint.conname = fk_constraints.conname)
         THEN 'yes' ELSE 'no' END,
    CASE
      WHEN to_regclass('public.' || tbl) IS NULL THEN 'table absent'
      WHEN to_regclass('public.' || parent) IS NULL THEN 'parent absent - check after the parent exists'
      WHEN NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = tbl AND column_name = col
      ) THEN 'column absent - nothing can violate it'
      ELSE (xpath('/row/c/text()', query_to_xml(
        format('SELECT count(*) AS c FROM public.%I t WHERE t.%I IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.%I p WHERE p.%I = t.%I)',
               tbl, col, parent, parent_col, col),
        false, true, '')))[1]::text
    END
  FROM fk_constraints
) r
ORDER BY sort;

-- WHAT TO DO WITH A NON-ZERO
--
-- Each is a decision, not a cleanup to run blind. A status value that
-- is not on the allowed list is either a typo to correct or a real
-- state the list is missing — and if it is the latter, the migration's
-- list is wrong and should be widened rather than the data narrowed.
-- Deleting or rewriting customer rows to make a constraint fit is the
-- one thing not to do here.
--
-- WHAT THIS DOES NOT COVER
--
-- NOT NULL additions and backfills, because the eight migrations do not
-- add any to tables the live database already has. If that changes, this
-- file changes with it.
