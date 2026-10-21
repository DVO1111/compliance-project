-- PHARMA PREFLIGHT — read-only. Changes nothing. Run this first.
--
-- WHY THIS EXISTS, AND WHY IT IS NOT A LIST OF MIGRATIONS TO RUN.
--
-- 00-preflight.sql already records the fact that governs everything
-- here: this project's live database "was built by hand rather than by
-- replaying supabase/migrations". There is no migration history table,
-- no `supabase db push` in any workflow, and no deploy step anywhere in
-- .github/. So the 187 files in supabase/migrations are not a record of
-- what production contains. They are a parallel artefact that happens to
-- describe the same system.
--
-- That has a consequence worth stating plainly: NOBODY KNOWS WHICH OF
-- THEM THE LIVE DATABASE HAS. Not partially — not at all. The question
-- "which migrations still need applying?" has no answer that can be
-- derived from the repository, and a runbook that assumed one would be
-- fiction. Two workspaces have already broken on exactly this gap:
-- 20260921000000_licence_lifecycle has never been applied, and the
-- symptom surfaced days later as "starter licences cannot be saved",
-- pointing at the wrong cause.
--
-- The repository also proves the files cannot simply be replayed in
-- order. scripts/ci/expected-migration-failures.txt pins fourteen
-- migrations that do NOT apply to a from-scratch Postgres, several
-- because four files carry no timestamp at all and therefore sort after
-- every dated one. Replaying history is its own project.
--
-- So this asks the database what it has, instead of assuming. Every
-- object below is something a screen on main now calls. A `false` row
-- is a screen that will fail for a real user.
--
-- Paste the WHOLE result back. Every column matters, including the
-- false rows — especially the false rows.
--
-- It needs only read access. It creates nothing, alters nothing, drops
-- nothing, and reads no row of business data: every check is against
-- the catalogue. It is safe to run against production, and safe to run
-- repeatedly.

WITH
-- ---------------------------------------------------------------------
-- The ground the eleven newest migrations stand on. These are NOT new.
-- Each is created by a migration dated between 2026-09-30 and
-- 2026-10-16, which is inside the same unverified band, so a false here
-- means the gap is older and wider than the eleven.
-- ---------------------------------------------------------------------
want_base(item) AS (
  VALUES
    ('companies'), ('profiles'), ('company_members'),
    ('material_lots'), ('materials'), ('suppliers'),
    ('company_numbering_formats'), ('material_coa_discrepancies'),
    ('master_formulas'), ('master_formula_stages'),
    ('master_formula_stage_parameters'),
    ('batch_records'), ('batch_stages'), ('batch_stage_parameter_readings'),
    ('production_lines'), ('line_clearance_records'),
    ('line_changeover_verifications'),
    ('dispensing_records'), ('instruments'), ('instrument_calibrations'),
    ('inprocess_oos_escalations'), ('batch_yield_reconciliations'),
    ('capa_records'), ('electronic_signatures'),
    ('lifecycle_definitions'), ('lifecycle_states'),
    ('lifecycle_transitions'), ('entity_current_state')
),

-- ---------------------------------------------------------------------
-- The fifteen tables the eleven new migrations create. All false is a
-- clean starting point. SOME true and some false is the dangerous case:
-- it means a migration was applied in part, and the runbook has to
-- start by establishing how far it got.
-- ---------------------------------------------------------------------
want_new(item) AS (
  VALUES
    ('deviations'), ('deviation_counters'), ('deviation_links'),
    ('root_cause_analyses'), ('root_cause_whys'),
    ('root_cause_categories'), ('company_rca_settings'),
    ('material_lot_sampling'),
    ('access_sections'), ('access_duty_conflicts'), ('access_act_owners'),
    ('access_settings'), ('access_request_counters'),
    ('access_permission_requests'), ('access_grants')
),

-- ---------------------------------------------------------------------
-- Columns. A table can be present and still be the wrong shape, which
-- is the failure mode that cost two workspaces a working setup: the
-- table existed, one column did not, and every insert was rejected.
-- ---------------------------------------------------------------------
want_cols(item, tbl, col) AS (
  VALUES
    -- added by 20261031, and the yield screen writes both
    ('batch_yield_reconciliations.samples_quantity',
     'batch_yield_reconciliations', 'samples_quantity'),
    ('batch_yield_reconciliations.rejects_quantity',
     'batch_yield_reconciliations', 'rejects_quantity'),
    -- packed_quantity must NOT exist. See the note under the results.
    ('batch_yield_reconciliations.packed_quantity (EXPECTED FALSE)',
     'batch_yield_reconciliations', 'packed_quantity'),
    -- added by 20261101, NOT NULL, so its absence breaks every insert
    ('root_cause_analyses.framework', 'root_cause_analyses', 'framework'),
    ('company_rca_settings.undetermined_blocks_release',
     'company_rca_settings', 'undetermined_blocks_release'),
    ('root_cause_categories.is_active',
     'root_cause_categories', 'is_active'),
    -- added by 20261029100000; the sign-off pair needs the middle state
    ('batch_stages.operator_signature_id',
     'batch_stages', 'operator_signature_id'),
    ('batch_stages.verifier_signature_id',
     'batch_stages', 'verifier_signature_id'),
    -- added by 20260921, and already known absent as of last week
    ('regulatory_licences.status (known absent 2026-10-18)',
     'regulatory_licences', 'status')
),

-- ---------------------------------------------------------------------
-- The entry points. Every one of these is called by name from
-- src/lib/**, so a false row maps to a specific screen that is now on
-- main and will fail. The signature is checked, not just the name: a
-- function present with different parameters is a different function,
-- and PostgREST will not find it.
-- ---------------------------------------------------------------------
want_funcs(item, sig) AS (
  VALUES
    -- W4·15 materials (20261027)
    ('material_lot_release_conditions',
     'public.material_lot_release_conditions(uuid)'),
    ('material_lot_record_sampling',
     'public.material_lot_record_sampling(uuid, integer, integer, text, date, text)'),
    -- W4·16 master formulas (20261028)
    ('master_formula_stage_move',
     'public.master_formula_stage_move(uuid, text)'),
    ('master_formula_compare',
     'public.master_formula_compare(uuid, uuid)'),
    -- W4·17 batch stage strip and sign-off (20261029, 20261029100000)
    ('batch_stage_strip', 'public.batch_stage_strip(uuid)'),
    ('batch_stage_completion_blockers',
     'public.batch_stage_completion_blockers(uuid)'),
    ('batch_stage_sign_operator',
     'public.batch_stage_sign_operator(uuid, uuid)'),
    ('batch_stage_verify', 'public.batch_stage_verify(uuid, uuid)'),
    -- W4·18 floor conditions (20261030)
    ('line_clearance_conditions',
     'public.line_clearance_conditions(uuid)'),
    ('dispensing_conditions',
     'public.dispensing_conditions(uuid, uuid, numeric)'),
    ('instrument_conditions', 'public.instrument_conditions(uuid)'),
    ('dispensable_lots', 'public.dispensable_lots(uuid, uuid)'),
    -- W4·19 in-process and yield (20261031)
    ('inprocess_zone_key', 'public.inprocess_zone_key(uuid)'),
    ('inprocess_shift_history',
     'public.inprocess_shift_history(uuid, uuid, timestamptz)'),
    ('inprocess_reading_conditions',
     'public.inprocess_reading_conditions(uuid, uuid, numeric)'),
    ('yield_reconcile_stage_accounted',
     'public.yield_reconcile_stage_accounted(uuid, numeric, numeric, numeric, text, text)'),
    ('yield_account_lines', 'public.yield_account_lines(uuid)'),
    -- W5·11 deviations (20261023, 20261024, 20261025, 20261101)
    ('deviation_raise',
     'public.deviation_raise(uuid, text, text, text, text, uuid, text, text, text, text, uuid, date)'),
    ('deviation_open_for_batch',
     'public.deviation_open_for_batch(uuid, uuid)'),
    ('deviation_register', 'public.deviation_register(uuid, boolean)'),
    ('deviation_closure_readiness',
     'public.deviation_closure_readiness(uuid)'),
    ('deviation_impact_consequence',
     'public.deviation_impact_consequence(uuid, text, uuid)'),
    ('deviation_entry_point_spec',
     'public.deviation_entry_point_spec()'),
    ('capa_raise_from_deviation',
     'public.capa_raise_from_deviation(uuid, text, text, text, boolean, timestamptz)'),
    ('company_rca_settings_effective',
     'public.company_rca_settings_effective(uuid)'),
    ('root_cause_categories_effective',
     'public.root_cause_categories_effective(uuid)'),
    ('root_cause_categories_default',
     'public.root_cause_categories_default()'),
    -- W2·0 access (20261026)
    ('access_request_raise',
     'public.access_request_raise(uuid, text, text, text, date, text, text)'),
    ('access_decide',
     'public.access_decide(uuid, text, text, text, date, text)'),
    ('access_grant_revoke', 'public.access_grant_revoke(uuid, text)'),
    -- the two the whole tree leans on. If either is false, nothing
    -- above can work regardless of what else is present.
    ('lifecycle_transition',
     'public.lifecycle_transition(text, uuid, text, uuid, uuid, text, jsonb, uuid)'),
    ('sign_electronic_record',
     'public.sign_electronic_record(uuid, text, uuid, text, text, text, text, jsonb)'),
    ('app_is_company_member',
     'public.app_is_company_member(uuid, uuid)')
)

SELECT 'A base table' AS kind, item,
       (to_regclass('public.' || item) IS NOT NULL) AS present
FROM want_base
UNION ALL
SELECT 'B new table', item, (to_regclass('public.' || item) IS NOT NULL)
FROM want_new
UNION ALL
SELECT 'C column', item, EXISTS (
  SELECT 1 FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = w.tbl
    AND c.column_name = w.col
)
FROM want_cols w
UNION ALL
SELECT 'D function', item, (to_regprocedure(sig) IS NOT NULL)
FROM want_funcs
UNION ALL
-- Is there a migration history table at all? If this is true, the
-- answer to "what has been applied" may be readable directly and this
-- whole script is a cross-check rather than the only source.
SELECT 'E history', 'supabase_migrations.schema_migrations',
       (to_regclass('supabase_migrations.schema_migrations') IS NOT NULL)
UNION ALL
-- Views must be security_invoker or they bypass row-level security.
-- 20261008000000 closed this; the count says whether it ever ran here.
SELECT 'F rls', 'public views WITHOUT security_invoker: ' || count(*)::text,
       count(*) = 0
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'v'
  AND coalesce(
        (SELECT option_value FROM pg_options_to_table(c.reloptions)
         WHERE option_name = 'security_invoker'), 'false') <> 'true'
ORDER BY 1, 2;

-- HOW TO READ THE RESULT
--
-- Section A all true, section B all false
--   The clean case. The eleven new migrations have a complete base to
--   land on and none of them has been applied. A runbook can be written
--   straight from this.
--
-- Any row in section A false
--   The gap predates the eleven. Whatever is false has to be installed
--   first, and the migration that creates it may itself depend on
--   something older. This is the case to expect, given that
--   20260921000000_licence_lifecycle is already known absent.
--
-- Section B mixed
--   A migration landed in part. Each of the eleven is a single
--   transaction with its own deploy-time assertions, so this should not
--   happen — but it is the one state that needs establishing before
--   anything is applied, because re-running over a half-applied
--   migration is where data gets damaged.
--
-- Section C, packed_quantity
--   This row is EXPECTED FALSE. The yield arithmetic treats packed
--   output as the actual yield and passes it straight through; a
--   packed_quantity column means someone added a second place to store
--   it, and the two can then disagree. 20261031 carries an assertion
--   that fails the deploy if the column exists. True here is a genuine
--   problem, not a missing migration.
--
-- Section F above zero
--   Views are bypassing row-level security. That is a tenant-isolation
--   finding, not a missing feature, and it outranks everything else on
--   this list.
--
-- WHAT THIS SCRIPT DOES NOT TELL YOU
--
-- Whether an object that is present is the CURRENT version. A function
-- can exist with the right signature and an older body — several of
-- these were redefined by later migrations (material_lot_release_block_reason
-- three times, batch_stage_complete twice, material_dispense twice).
-- Establishing that needs the body compared, not the signature, and
-- that is a second pass once this one has narrowed the field.
