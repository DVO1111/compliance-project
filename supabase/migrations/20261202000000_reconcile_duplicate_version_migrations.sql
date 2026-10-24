-- =====================================================================
--  THE EFFECTS FIVE STRANDED MIGRATIONS NEVER DELIVERED
--
--  ── WHY THIS FILE EXISTS ──
--
--  Five migration files share a version string with a sibling:
--
--    20260226200000  content_calendar          / team_chat
--    20260227100000  fix_custom_roles_403      / fix_dash_rpcs
--    20260301000000  calendar_deadline_reminders / update_activity_feed_limit
--    20260305100000  create_legal_partner_tables / policy_attestation_enhancements
--    20260306190000  ai_asset_inventory        / retention_legal_hold
--
--  supabase_migrations.schema_migrations keys on `version`, so only one
--  of each pair can ever be recorded. The live ledger holds the first
--  of each pair; the second is permanently "outstanding and older than
--  the newest applied migration", which makes `supabase db push` refuse
--  to run at all.
--
--  The fix for the LEDGER is to give those five files versions of
--  their own and mark them applied. But marking a migration applied
--  asserts that its effects are already present, and
--  docs/migration-history-reconciliation.md establishes — by comparing
--  every intended effect against the live database, not by checking
--  that objects exist — that for two of the five THAT IS FALSE.
--
--  This migration supplies what is actually missing, so that the
--  assertion becomes true. It is the thing that makes the repair
--  honest rather than convenient.
--
--  ── WHAT WAS MISSING, AND HOW IT WAS ESTABLISHED ──
--
--  From 20260305100000_policy_attestation_enhancements.sql:
--    * UNIQUE (policy_id, version_id, user_id) on
--      policy_acknowledgements — ABSENT. Without it the same person can
--      attest to the same policy version twice, which is the one thing
--      an attestation register must not allow.
--
--  From 20260306190000_retention_legal_hold.sql:
--    * idx_legal_hold_items_unique — ABSENT, and it is UNIQUE. Without
--      it the same entity can be placed under the same legal hold
--      twice.
--    * idx_retention_policies_company, idx_legal_holds_company,
--      idx_legal_hold_items_lookup — ABSENT. Performance only.
--
--  All five affected tables were read and hold ZERO rows, so none of
--  these can fail on existing data. Checked, not assumed: a UNIQUE
--  constraint added over a table that already violates it aborts the
--  migration, and that is the usual way this goes wrong.
--
--  ── WHAT THIS FILE DELIBERATELY DOES NOT DO ──
--
--  Three further divergences were found. None is a missing safeguard,
--  each would change behaviour or permissions, and none is mine to
--  decide. They are recorded in the reconciliation document and left
--  alone:
--
--    1. policy_versions.requires_ack DEFAULTS TO false on the live
--       database; the migration said `NOT NULL DEFAULT true`. Flipping
--       it would make every future policy version require
--       acknowledgement — a compliance decision, not a repair.
--    2. policy_versions.published_by references profiles(id)
--       ON DELETE SET NULL; the migration said auth.users(id). The
--       live version is arguably better and changing a foreign key
--       target is not a reconciliation.
--    3. policy_acknowledgements carries two policies
--       (users_read_own_acks, users_insert_own_acks) where the
--       migration named three. The third would let compliance staff
--       read other people's attestations. GRANTING A READ OVER OTHER
--       PEOPLE'S RECORDS IS NOT A GAP TO BE QUIETLY CLOSED.
--
--  So this migration adds integrity constraints and indexes — things
--  that only ever refuse bad data — and nothing that grants anybody
--  access or changes a default.
-- =====================================================================

-- ── 1. The attestation uniqueness constraint ────────────────────────
--
-- IF NOT EXISTS has no spelling for ADD CONSTRAINT, hence the guard.

DO $$
BEGIN
  IF to_regclass('public.policy_acknowledgements') IS NULL THEN
    RAISE NOTICE 'policy_acknowledgements absent; nothing to constrain';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint
              WHERE conname = 'policy_acknowledgements_version_user_unique') THEN
    RAISE NOTICE 'policy_acknowledgements_version_user_unique already present';
    RETURN;
  END IF;

  --  Refuse rather than silently skip if the data would violate it.
  --  The live table was empty when this was written; if that has
  --  changed, somebody must decide what to do with the duplicates.
  IF EXISTS (
    SELECT 1 FROM public.policy_acknowledgements
     GROUP BY policy_id, version_id, user_id HAVING count(*) > 1)
  THEN
    RAISE EXCEPTION
      'POLICY_ACK_DUPLICATES_EXIST: policy_acknowledgements already holds duplicate (policy_id, version_id, user_id) rows, so the uniqueness constraint 20260305100000 intended cannot be added. Resolve the duplicates through the quality process first; do not delete attestation records to make a migration pass.';
  END IF;

  ALTER TABLE public.policy_acknowledgements
    ADD CONSTRAINT policy_acknowledgements_version_user_unique
    UNIQUE (policy_id, version_id, user_id);
END
$$;


-- ── 2. The legal-hold indexes ───────────────────────────────────────
--
-- idx_legal_hold_items_unique is the one that matters: it is UNIQUE,
-- so it stops the same entity being held twice under one hold. The
-- other three are access paths.

DO $$
BEGIN
  IF to_regclass('public.legal_hold_items') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.legal_hold_items
       GROUP BY legal_hold_id, entity_type, entity_id HAVING count(*) > 1)
    THEN
      RAISE EXCEPTION
        'LEGAL_HOLD_ITEM_DUPLICATES_EXIST: legal_hold_items already holds duplicate (legal_hold_id, entity_type, entity_id) rows, so the unique index 20260306190000 intended cannot be created. Resolve them before deploying.';
    END IF;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_legal_hold_items_unique
      ON public.legal_hold_items (legal_hold_id, entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_legal_hold_items_lookup
      ON public.legal_hold_items (entity_type, entity_id);
  END IF;

  IF to_regclass('public.retention_policies') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_retention_policies_company
      ON public.retention_policies (company_id);
  END IF;

  IF to_regclass('public.legal_holds') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_legal_holds_company
      ON public.legal_holds (company_id, status);
  END IF;
END
$$;


-- ── 3. A record of what was reconciled, and what was not ────────────
--
-- The five files are about to be marked applied in the ledger. A
-- reader a year from now will see five migrations recorded as applied
-- that were never executed, and nothing in the ledger explains why.
-- This row is where that explanation lives.

CREATE TABLE IF NOT EXISTS public.migration_reconciliations (
  version          text PRIMARY KEY,
  original_version text NOT NULL,
  filename         text NOT NULL,
  verdict          text NOT NULL
    CHECK (verdict IN ('effects_already_present',
                       'effects_superseded',
                       'effects_completed_by_this_migration')),
  evidence         text NOT NULL,
  not_reconciled   text,
  recorded_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT migration_reconciliation_evidence_is_evidence
    CHECK (length(btrim(evidence)) >= 40)
);

COMMENT ON TABLE public.migration_reconciliations IS
  'Why five migration files were marked applied in the ledger without being executed. One row per file, with the evidence that its effects were already present and a note of any intended effect deliberately NOT reconciled. Written by 20261202000000; see docs/migration-history-reconciliation.md.';

ALTER TABLE public.migration_reconciliations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS migration_reconciliations_read ON public.migration_reconciliations;
CREATE POLICY migration_reconciliations_read ON public.migration_reconciliations
  FOR SELECT TO authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.migration_reconciliations
  FROM anon, authenticated;
GRANT SELECT ON public.migration_reconciliations TO authenticated, service_role;

INSERT INTO public.migration_reconciliations
  (version, original_version, filename, verdict, evidence, not_reconciled)
VALUES
  ('20260226200002','20260226200000','20260226200000_team_chat.sql',
   'effects_already_present',
   'All 6 tables present with RLS enabled; all 9 indexes present; all 19 policies present under the exact names the file creates; ensure_default_chat_channels(uuid) present. Verified against the live database 2026-10-23/24.',
   'Nothing. The live function additionally carries SET search_path, added later by 20260304100000, so EXECUTING this file would strip that hardening.'),

  ('20260227100001','20260227100000','20260227100000_fix_dash_rpcs.sql',
   'effects_superseded',
   'All 4 functions present. mark_content_in_review carries the lower(v_role) fix this file introduced. get_my_past_decisions and get_reviewer_workload match. get_decisions_summary is a LATER definition installed by 20260305200000 (applied), so this file''s version is superseded.',
   'Nothing missing. EXECUTING this file would regress get_decisions_summary to the older body and strip SET search_path from all four.'),

  ('20260301000001','20260301000000','20260301000000_update_activity_feed_limit.sql',
   'effects_already_present',
   'get_company_activity_feed(uuid,integer) body is character-identical to this file, including the LIMIT GREATEST(p_limit, 1) fix it exists to introduce, plus SET search_path added later by 20260304100000.',
   'Nothing. EXECUTING this file would strip SET search_path.'),

  ('20260305100001','20260305100000','20260305100000_policy_attestation_enhancements.sql',
   'effects_completed_by_this_migration',
   'Columns requires_ack, due_days and published_by present on policy_versions; RLS enabled on policy_acknowledgements. The UNIQUE (policy_id, version_id, user_id) constraint was ABSENT and is added by this migration.',
   'THREE divergences left alone deliberately: requires_ack defaults to false (file said true) — a compliance decision; published_by references profiles(id) ON DELETE SET NULL (file said auth.users(id)); and policy_acknowledgements carries 2 policies, not the file''s 3 — the third would grant compliance staff read access to other people''s attestations. See docs/migration-history-reconciliation.md.'),

  ('20260306190001','20260306190000','20260306190000_retention_legal_hold.sql',
   'effects_completed_by_this_migration',
   'All 3 tables present with RLS enabled and 2 policies each; is_on_legal_hold(text,uuid) present. ALL FOUR indexes were ABSENT, including the UNIQUE idx_legal_hold_items_unique, and are created by this migration.',
   'Policy NAMES differ from the file''s (live: "Users can view their company''s legal holds" etc.; file: "Legal holds are viewable by company members" etc.). Counts match at 2 per table and intent appears equivalent, but the predicates were not compared clause by clause, so this is recorded as unverified rather than equivalent.')
ON CONFLICT (version) DO UPDATE SET
  original_version = EXCLUDED.original_version,
  filename         = EXCLUDED.filename,
  verdict          = EXCLUDED.verdict,
  evidence         = EXCLUDED.evidence,
  not_reconciled   = EXCLUDED.not_reconciled;


-- ── 4. Postconditions ───────────────────────────────────────────────
--
-- Same discipline as 20261201000000: state what this migration is
-- supposed to have achieved and refuse to complete if it has not.

DO $assert$
DECLARE v_missing text;
BEGIN
  --  (a) The attestation constraint exists, if its table does.
  IF to_regclass('public.policy_acknowledgements') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint
                      WHERE conname='policy_acknowledgements_version_user_unique')
  THEN
    RAISE EXCEPTION 'RECONCILE_FAILED: the attestation uniqueness constraint was not created';
  END IF;

  --  (b) Every index this migration owes, present.
  SELECT string_agg(i, ', ') INTO v_missing
    FROM unnest(ARRAY['idx_legal_hold_items_unique','idx_legal_hold_items_lookup',
                      'idx_retention_policies_company','idx_legal_holds_company']) AS i
   WHERE NOT EXISTS (SELECT 1 FROM pg_indexes
                      WHERE schemaname='public' AND indexname = i)
     AND to_regclass('public.legal_hold_items') IS NOT NULL;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'RECONCILE_FAILED: indexes still missing: %', v_missing;
  END IF;

  --  (c) idx_legal_hold_items_unique must actually BE unique. A
  --  non-unique index of that name would satisfy (b) and none of the
  --  purpose.
  IF to_regclass('public.legal_hold_items') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_indexes
                      WHERE schemaname='public'
                        AND indexname='idx_legal_hold_items_unique'
                        AND indexdef ILIKE '%UNIQUE%')
  THEN
    RAISE EXCEPTION 'RECONCILE_FAILED: idx_legal_hold_items_unique exists but is not UNIQUE';
  END IF;

  --  (d) All five files are accounted for, with evidence.
  IF (SELECT count(*) FROM public.migration_reconciliations) <> 5 THEN
    RAISE EXCEPTION 'RECONCILE_FAILED: expected 5 reconciliation rows, found %',
      (SELECT count(*) FROM public.migration_reconciliations);
  END IF;

  --  (e) And the two that needed completing say so, rather than
  --  claiming their effects were already there.
  IF (SELECT count(*) FROM public.migration_reconciliations
       WHERE verdict = 'effects_completed_by_this_migration') <> 2 THEN
    RAISE EXCEPTION 'RECONCILE_FAILED: the two files whose effects were incomplete must be recorded as such';
  END IF;

  RAISE NOTICE 'reconciliation: attestation uniqueness constraint and 4 legal-hold indexes present; 5 files recorded with evidence; 3 divergences left for decision.';
END
$assert$;
