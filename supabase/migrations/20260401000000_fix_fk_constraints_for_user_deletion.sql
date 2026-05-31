-- ============================================================
-- Fix all FK constraints on auth.users that block user deletion
-- Changes bare REFERENCES to ON DELETE SET NULL or ON DELETE CASCADE
-- ============================================================

-- ── companies.created_by (the error you're hitting now) ───────
ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_created_by_fkey;
ALTER TABLE companies
  ADD CONSTRAINT companies_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ── policy_versions.created_by ────────────────────────────────
DO $$ BEGIN
  ALTER TABLE policy_versions DROP CONSTRAINT IF EXISTS policy_versions_created_by_fkey;
  ALTER TABLE policy_versions
    ADD CONSTRAINT policy_versions_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- ── policies.published_by ─────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE policies DROP CONSTRAINT IF EXISTS policies_published_by_fkey;
  ALTER TABLE policies
    ADD CONSTRAINT policies_published_by_fkey
    FOREIGN KEY (published_by) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- ── content_blocks ────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE content_blocks DROP CONSTRAINT IF EXISTS content_blocks_approved_by_fkey;
  ALTER TABLE content_blocks
    ADD CONSTRAINT content_blocks_approved_by_fkey
    FOREIGN KEY (approved_by) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE content_blocks DROP CONSTRAINT IF EXISTS content_blocks_created_by_fkey;
  ALTER TABLE content_blocks
    ADD CONSTRAINT content_blocks_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- ── patient_consent_templates ─────────────────────────────────
DO $$ BEGIN
  ALTER TABLE patient_consent_templates DROP CONSTRAINT IF EXISTS patient_consent_templates_created_by_fkey;
  ALTER TABLE patient_consent_templates
    ADD CONSTRAINT patient_consent_templates_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- ── consent_links ─────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE consent_links DROP CONSTRAINT IF EXISTS consent_links_linked_by_fkey;
  ALTER TABLE consent_links
    ADD CONSTRAINT consent_links_linked_by_fkey
    FOREIGN KEY (linked_by) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- ── consent_scans ─────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE consent_scans DROP CONSTRAINT IF EXISTS consent_scans_scanned_by_fkey;
  ALTER TABLE consent_scans
    ADD CONSTRAINT consent_scans_scanned_by_fkey
    FOREIGN KEY (scanned_by) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- ── drift_baselines ───────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE drift_baselines DROP CONSTRAINT IF EXISTS drift_baselines_created_by_fkey;
  ALTER TABLE drift_baselines
    ADD CONSTRAINT drift_baselines_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- ── drift_alerts ──────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE drift_alerts DROP CONSTRAINT IF EXISTS drift_alerts_resolved_by_fkey;
  ALTER TABLE drift_alerts
    ADD CONSTRAINT drift_alerts_resolved_by_fkey
    FOREIGN KEY (resolved_by) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- ── adverse_event_reports ─────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE adverse_event_reports DROP CONSTRAINT IF EXISTS adverse_event_reports_resolved_by_fkey;
  ALTER TABLE adverse_event_reports
    ADD CONSTRAINT adverse_event_reports_resolved_by_fkey
    FOREIGN KEY (resolved_by) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- ── channel_rules ─────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE channel_rules DROP CONSTRAINT IF EXISTS channel_rules_created_by_fkey;
  ALTER TABLE channel_rules
    ADD CONSTRAINT channel_rules_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- ── crisis_response_plans ─────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE crisis_response_plans DROP CONSTRAINT IF EXISTS crisis_response_plans_triggered_by_fkey;
  ALTER TABLE crisis_response_plans
    ADD CONSTRAINT crisis_response_plans_triggered_by_fkey
    FOREIGN KEY (triggered_by) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- ── whistleblower_reports ─────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE whistleblower_reports DROP CONSTRAINT IF EXISTS whistleblower_reports_submitted_by_fkey;
  ALTER TABLE whistleblower_reports
    ADD CONSTRAINT whistleblower_reports_submitted_by_fkey
    FOREIGN KEY (submitted_by) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- ── social_mentions ───────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE social_mentions DROP CONSTRAINT IF EXISTS social_mentions_created_by_fkey;
  ALTER TABLE social_mentions
    ADD CONSTRAINT social_mentions_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- ── claim_extractions ─────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE claim_extractions DROP CONSTRAINT IF EXISTS claim_extractions_extracted_by_fkey;
  ALTER TABLE claim_extractions
    ADD CONSTRAINT claim_extractions_extracted_by_fkey
    FOREIGN KEY (extracted_by) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- ── chat_channels.created_by ──────────────────────────────────
DO $$ BEGIN
  ALTER TABLE chat_channels DROP CONSTRAINT IF EXISTS chat_channels_created_by_fkey;
  ALTER TABLE chat_channels
    ADD CONSTRAINT chat_channels_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- ── chat_messages.sender_id ───────────────────────────────────
DO $$ BEGIN
  ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_sender_id_fkey;
  ALTER TABLE chat_messages
    ADD CONSTRAINT chat_messages_sender_id_fkey
    FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- ── enterprise_hierarchy.created_by ───────────────────────────
DO $$ BEGIN
  ALTER TABLE business_units DROP CONSTRAINT IF EXISTS business_units_created_by_fkey;
  ALTER TABLE business_units
    ADD CONSTRAINT business_units_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- ── unit_members.added_by ─────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE unit_members DROP CONSTRAINT IF EXISTS unit_members_added_by_fkey;
  ALTER TABLE unit_members
    ADD CONSTRAINT unit_members_added_by_fkey
    FOREIGN KEY (added_by) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- ── compliance_features_batch2 tables ─────────────────────────
DO $$ BEGIN
  ALTER TABLE vendor_questionnaires DROP CONSTRAINT IF EXISTS vendor_questionnaires_created_by_fkey;
  ALTER TABLE vendor_questionnaires
    ADD CONSTRAINT vendor_questionnaires_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- ── content_submissions.deleted_by ────────────────────────────
DO $$ BEGIN
  ALTER TABLE content_submissions DROP CONSTRAINT IF EXISTS content_submissions_deleted_by_fkey;
  ALTER TABLE content_submissions
    ADD CONSTRAINT content_submissions_deleted_by_fkey
    FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- ── profiles (should already CASCADE but let's be sure) ───────
DO $$ BEGIN
  ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
  ALTER TABLE profiles
    ADD CONSTRAINT profiles_id_fkey
    FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION WHEN others THEN NULL;
END $$;
