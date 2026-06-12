-- Policy Lifecycle: full approval workflow, review cycles, retirement
-- Adds reviewer/approver fields, extends status enum, adds review cycle to policies

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'policy_versions'
  ) THEN RETURN; END IF;

  -- Extend the status CHECK to include the new workflow stages.
  -- Postgres doesn't support ALTER CHECK in-place, so we drop and re-add.
  ALTER TABLE public.policy_versions
    DROP CONSTRAINT IF EXISTS policy_versions_status_check;

  ALTER TABLE public.policy_versions
    ADD CONSTRAINT policy_versions_status_check
    CHECK (status IN ('draft','under_review','pending_approval','approved','published','archived','retired'));

  -- Reviewer / approver assignment
  ALTER TABLE public.policy_versions
    ADD COLUMN IF NOT EXISTS reviewer_id          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS approver_id          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS submitted_for_review_at timestamptz,
    ADD COLUMN IF NOT EXISTS reviewed_at          timestamptz,
    ADD COLUMN IF NOT EXISTS approved_at          timestamptz,
    ADD COLUMN IF NOT EXISTS rejected_at          timestamptz,
    ADD COLUMN IF NOT EXISTS review_notes         text,
    ADD COLUMN IF NOT EXISTS expiry_date          date;
END $$;

-- Review cycle fields on the policies table
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'policies'
  ) THEN RETURN; END IF;

  ALTER TABLE public.policies
    ADD COLUMN IF NOT EXISTS review_cycle_months  int  NOT NULL DEFAULT 12,
    ADD COLUMN IF NOT EXISTS next_review_due      date,
    ADD COLUMN IF NOT EXISTS last_reviewed_at     timestamptz;
END $$;

-- Index for finding versions awaiting review / approval per policy
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'policy_versions'
      AND indexname = 'idx_policy_versions_workflow_status'
  ) THEN
    CREATE INDEX idx_policy_versions_workflow_status
      ON public.policy_versions (policy_id, status)
      WHERE status IN ('under_review','pending_approval');
  END IF;
END $$;
