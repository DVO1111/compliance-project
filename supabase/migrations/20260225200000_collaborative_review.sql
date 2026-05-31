-- ═══════════════════════════════════════════════════════════════
-- Feature #4: Collaborative Review Workflow with SLA Enforcement
-- ═══════════════════════════════════════════════════════════════
-- Adds:
--   1. review_assignments  — parallel reviewer routing + quorum
--   2. review_votes        — individual reviewer decisions
--   3. anchored_annotations — paragraph-anchored comments
--   4. content_versions    — immutable version snapshots for diffing
--   5. approval_expiry_config — per-company auto-expiry settings
--   + column additions to content_submissions
-- ═══════════════════════════════════════════════════════════════

-- ── 1. review_assignments ───────────────────────────────────
CREATE TABLE IF NOT EXISTS review_assignments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL,
  submission_id uuid NOT NULL,
  reviewer_ids  uuid[] NOT NULL DEFAULT '{}',
  quorum        integer NOT NULL DEFAULT 1,
  sla_hours     integer NOT NULL DEFAULT 48,
  deadline_at   timestamptz,
  status        text NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open','resolved','expired','cancelled')),
  resolved_at   timestamptz,
  resolved_outcome text CHECK (resolved_outcome IN ('approved','rejected','amend_requested')),
  created_by    uuid NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ra_submission ON review_assignments(submission_id);
CREATE INDEX IF NOT EXISTS idx_ra_company    ON review_assignments(company_id);
CREATE INDEX IF NOT EXISTS idx_ra_status     ON review_assignments(status);

-- RLS
ALTER TABLE review_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ra_select_company ON review_assignments;
CREATE POLICY ra_select_company ON review_assignments
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS ra_insert_company ON review_assignments;
CREATE POLICY ra_insert_company ON review_assignments
  FOR INSERT WITH CHECK (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS ra_update_company ON review_assignments;
CREATE POLICY ra_update_company ON review_assignments
  FOR UPDATE USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  );


-- ── 2. review_votes ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS review_votes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id   uuid NOT NULL REFERENCES review_assignments(id) ON DELETE CASCADE,
  reviewer_id     uuid NOT NULL,
  vote            text NOT NULL CHECK (vote IN ('approve','reject','abstain','request_changes')),
  comments        text DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, reviewer_id)
);

CREATE INDEX IF NOT EXISTS idx_rv_assignment ON review_votes(assignment_id);
CREATE INDEX IF NOT EXISTS idx_rv_reviewer   ON review_votes(reviewer_id);

ALTER TABLE review_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rv_select_company ON review_votes;
CREATE POLICY rv_select_company ON review_votes
  FOR SELECT USING (
    assignment_id IN (
      SELECT id FROM review_assignments
      WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
    )
  );

DROP POLICY IF EXISTS rv_insert_own ON review_votes;
CREATE POLICY rv_insert_own ON review_votes
  FOR INSERT WITH CHECK (reviewer_id = auth.uid());

DROP POLICY IF EXISTS rv_update_own ON review_votes;
CREATE POLICY rv_update_own ON review_votes
  FOR UPDATE USING (reviewer_id = auth.uid());


-- ── 3. anchored_annotations ─────────────────────────────────
CREATE TABLE IF NOT EXISTS anchored_annotations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL,
  submission_id   uuid NOT NULL,
  author_id       uuid NOT NULL,
  -- Anchor: paragraph index + char offsets
  anchor_paragraph integer NOT NULL DEFAULT 0,
  anchor_start     integer NOT NULL DEFAULT 0,
  anchor_end       integer NOT NULL DEFAULT 0,
  anchor_text      text DEFAULT '',
  -- Content
  body             text NOT NULL,
  parent_id        uuid REFERENCES anchored_annotations(id) ON DELETE CASCADE,
  is_resolved      boolean NOT NULL DEFAULT false,
  resolved_by      uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_aa_submission ON anchored_annotations(submission_id);
CREATE INDEX IF NOT EXISTS idx_aa_parent     ON anchored_annotations(parent_id);

ALTER TABLE anchored_annotations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aa_select_company ON anchored_annotations;
CREATE POLICY aa_select_company ON anchored_annotations
  FOR SELECT USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS aa_insert_company ON anchored_annotations;
CREATE POLICY aa_insert_company ON anchored_annotations
  FOR INSERT WITH CHECK (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND author_id = auth.uid()
  );

DROP POLICY IF EXISTS aa_update_own ON anchored_annotations;
CREATE POLICY aa_update_own ON anchored_annotations
  FOR UPDATE USING (author_id = auth.uid());


-- ── 4. content_versions ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS content_versions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id   uuid NOT NULL,
  version_number  integer NOT NULL DEFAULT 1,
  content_text    text NOT NULL DEFAULT '',
  corrected_text  text DEFAULT '',
  snapshot_by     uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (submission_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_cv_submission ON content_versions(submission_id);

ALTER TABLE content_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cv_select_company ON content_versions;
CREATE POLICY cv_select_company ON content_versions
  FOR SELECT USING (
    submission_id IN (
      SELECT id FROM content_submissions
      WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
    )
  );

DROP POLICY IF EXISTS cv_insert_company ON content_versions;
CREATE POLICY cv_insert_company ON content_versions
  FOR INSERT WITH CHECK (snapshot_by = auth.uid());


-- ── 5. approval_expiry_config ───────────────────────────────
CREATE TABLE IF NOT EXISTS approval_expiry_config (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL UNIQUE,
  expiry_days     integer NOT NULL DEFAULT 90,
  auto_expire     boolean NOT NULL DEFAULT true,
  updated_by      uuid,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE approval_expiry_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aec_select_company ON approval_expiry_config;
CREATE POLICY aec_select_company ON approval_expiry_config
  FOR SELECT USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS aec_upsert_company ON approval_expiry_config;
CREATE POLICY aec_upsert_company ON approval_expiry_config
  FOR ALL USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  );


-- ── 6. Column additions to content_submissions ─────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'content_submissions' AND column_name = 'current_version_number'
  ) THEN
    ALTER TABLE content_submissions ADD COLUMN current_version_number integer DEFAULT 1;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'content_submissions' AND column_name = 'approval_expires_at'
  ) THEN
    ALTER TABLE content_submissions ADD COLUMN approval_expires_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'content_submissions' AND column_name = 'sla_deadline_at'
  ) THEN
    ALTER TABLE content_submissions ADD COLUMN sla_deadline_at timestamptz;
  END IF;
END $$;

-- ── 7. Update content_submissions status constraint ─────────
-- Add 'review_expired' status for auto-expired approvals
ALTER TABLE content_submissions
  DROP CONSTRAINT IF EXISTS content_submissions_status_check;

-- Re-add with expanded values (safe: if constraint doesn't exist, this is a no-op add)
DO $$
BEGIN
  ALTER TABLE content_submissions
    ADD CONSTRAINT content_submissions_status_check
    CHECK (signoff_status IN (
      'draft','analyzed','awaiting_legal','in_review',
      'amend_requested','signed_off','rejected','published',
      'reverification_required','review_expired'
    ));
EXCEPTION WHEN duplicate_object THEN
  NULL; -- constraint already exists
END $$;
