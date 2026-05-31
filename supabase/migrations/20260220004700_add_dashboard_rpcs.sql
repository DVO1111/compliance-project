/*
  # Add Dashboard RPC Functions + Missing Columns

  1. Missing Columns (idempotent — skipped if they already exist)
     - content_submissions: company_id, submitted_for_legal_at, legal_decided_at,
       published_at, published_by, department
     - profiles: company_id

  2. Widen signoff_status CHECK to include full workflow states

  3. RPC Functions
     - get_company_dashboard_metrics
     - get_company_dashboard_trends
     - get_company_dashboard_breakdown
     - get_company_activity_feed
     - get_company_risk_distribution
     - get_legal_queue
     - get_legal_performance
     - get_marketing_pipeline
*/

-- ============================================================
-- 1) Add missing columns (safe IF NOT EXISTS)
-- ============================================================

DO $$
BEGIN
  -- profiles.company_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'company_id'
  ) THEN
    ALTER TABLE profiles ADD COLUMN company_id uuid;
  END IF;

  -- content_submissions.company_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'content_submissions' AND column_name = 'company_id'
  ) THEN
    ALTER TABLE content_submissions ADD COLUMN company_id uuid;
  END IF;

  -- content_submissions.submitted_for_legal_at
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'content_submissions' AND column_name = 'submitted_for_legal_at'
  ) THEN
    ALTER TABLE content_submissions ADD COLUMN submitted_for_legal_at timestamptz;
  END IF;

  -- content_submissions.legal_decided_at
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'content_submissions' AND column_name = 'legal_decided_at'
  ) THEN
    ALTER TABLE content_submissions ADD COLUMN legal_decided_at timestamptz;
  END IF;

  -- content_submissions.legal_decided_by
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'content_submissions' AND column_name = 'legal_decided_by'
  ) THEN
    ALTER TABLE content_submissions ADD COLUMN legal_decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;

  -- content_submissions.published_at
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'content_submissions' AND column_name = 'published_at'
  ) THEN
    ALTER TABLE content_submissions ADD COLUMN published_at timestamptz;
  END IF;

  -- content_submissions.published_by
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'content_submissions' AND column_name = 'published_by'
  ) THEN
    ALTER TABLE content_submissions ADD COLUMN published_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;

  -- content_submissions.department
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'content_submissions' AND column_name = 'department'
  ) THEN
    ALTER TABLE content_submissions ADD COLUMN department text;
  END IF;
END $$;

-- ============================================================
-- 2) Widen signoff_status CHECK constraint
--    Drop old constraint, add new one with full workflow states.
-- ============================================================

DO $$
DECLARE
  _constraint_name text;
BEGIN
  -- Find the CHECK constraint on signoff_status
  SELECT conname INTO _constraint_name
  FROM pg_constraint c
  JOIN pg_attribute a ON a.attnum = ANY(c.conkey) AND a.attrelid = c.conrelid
  WHERE c.conrelid = 'content_submissions'::regclass
    AND a.attname = 'signoff_status'
    AND c.contype = 'c'
  LIMIT 1;

  IF _constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE content_submissions DROP CONSTRAINT %I', _constraint_name);
  END IF;
END $$;

ALTER TABLE content_submissions
  ADD CONSTRAINT content_submissions_signoff_status_check
  CHECK (signoff_status IN (
    'draft', 'analyzed', 'awaiting_legal', 'in_review',
    'signed_off', 'amend_requested', 'rejected', 'published'
  ));

-- Indexes on new columns
CREATE INDEX IF NOT EXISTS idx_cs_company_id ON content_submissions(company_id);
CREATE INDEX IF NOT EXISTS idx_cs_submitted_for_legal ON content_submissions(submitted_for_legal_at);
CREATE INDEX IF NOT EXISTS idx_cs_department ON content_submissions(department);
CREATE INDEX IF NOT EXISTS idx_profiles_company_id ON profiles(company_id);

-- ============================================================
-- 3) RPC: get_company_dashboard_metrics
-- ============================================================

CREATE OR REPLACE FUNCTION get_company_dashboard_metrics(p_company_id uuid)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT json_build_object(
    'total_submitted',
      (SELECT count(*) FROM content_submissions WHERE company_id = p_company_id),
    'in_legal_queue',
      (SELECT count(*) FROM content_submissions
       WHERE company_id = p_company_id
         AND signoff_status IN ('awaiting_legal', 'in_review')),
    'approved',
      (SELECT count(*) FROM content_submissions
       WHERE company_id = p_company_id
         AND signoff_status IN ('signed_off', 'published')),
    'rejected',
      (SELECT count(*) FROM content_submissions
       WHERE company_id = p_company_id
         AND signoff_status IN ('rejected', 'amend_requested')),
    'approval_rate',
      COALESCE(
        (SELECT count(*) FILTER (WHERE signoff_status IN ('signed_off', 'published'))::numeric
         / NULLIF(count(*) FILTER (WHERE signoff_status NOT IN ('draft', 'analyzed')), 0)
         FROM content_submissions WHERE company_id = p_company_id),
        0
      ),
    'rejection_rate',
      COALESCE(
        (SELECT count(*) FILTER (WHERE signoff_status IN ('rejected', 'amend_requested'))::numeric
         / NULLIF(count(*) FILTER (WHERE signoff_status NOT IN ('draft', 'analyzed')), 0)
         FROM content_submissions WHERE company_id = p_company_id),
        0
      ),
    'avg_turnaround_hours',
      (SELECT EXTRACT(EPOCH FROM avg(legal_decided_at - submitted_for_legal_at)) / 3600.0
       FROM content_submissions
       WHERE company_id = p_company_id
         AND legal_decided_at IS NOT NULL
         AND submitted_for_legal_at IS NOT NULL)
  );
$$;

-- ============================================================
-- 4) RPC: get_company_dashboard_trends
-- ============================================================

CREATE OR REPLACE FUNCTION get_company_dashboard_trends(
  p_company_id uuid,
  p_days int DEFAULT 30,
  p_jurisdiction text DEFAULT NULL
)
RETURNS TABLE(
  day date,
  submitted bigint,
  sent_to_legal bigint,
  approved bigint,
  rejected bigint,
  avg_turnaround_hours numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH days_series AS (
    SELECT generate_series(
      (current_date - (p_days - 1)),
      current_date,
      '1 day'::interval
    )::date AS day
  ),
  filtered AS (
    SELECT *
    FROM content_submissions
    WHERE company_id = p_company_id
      AND (p_jurisdiction IS NULL OR jurisdiction = p_jurisdiction)
  )
  SELECT
    d.day,
    COALESCE(count(*) FILTER (WHERE f.created_at::date = d.day), 0) AS submitted,
    COALESCE(count(*) FILTER (WHERE f.submitted_for_legal_at::date = d.day), 0) AS sent_to_legal,
    COALESCE(count(*) FILTER (
      WHERE f.legal_decided_at::date = d.day
        AND f.signoff_status IN ('signed_off', 'published')
    ), 0) AS approved,
    COALESCE(count(*) FILTER (
      WHERE f.legal_decided_at::date = d.day
        AND f.signoff_status IN ('rejected', 'amend_requested')
    ), 0) AS rejected,
    (
      SELECT EXTRACT(EPOCH FROM avg(f2.legal_decided_at - f2.submitted_for_legal_at)) / 3600.0
      FROM content_submissions f2
      WHERE f2.company_id = p_company_id
        AND (p_jurisdiction IS NULL OR f2.jurisdiction = p_jurisdiction)
        AND f2.legal_decided_at::date = d.day
        AND f2.submitted_for_legal_at IS NOT NULL
    )::numeric AS avg_turnaround_hours
  FROM days_series d
  LEFT JOIN filtered f ON TRUE
  GROUP BY d.day
  ORDER BY d.day;
$$;

-- ============================================================
-- 5) RPC: get_company_dashboard_breakdown
-- ============================================================

CREATE OR REPLACE FUNCTION get_company_dashboard_breakdown(
  p_company_id uuid,
  p_jurisdiction text DEFAULT NULL
)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT json_build_object(
    'by_department',
    COALESCE((
      SELECT json_agg(row_to_json(dept))
      FROM (
        SELECT
          COALESCE(cs.department, 'unassigned') AS department,
          count(*) AS total,
          count(*) FILTER (WHERE cs.signoff_status IN ('signed_off', 'published')) AS approved,
          count(*) FILTER (WHERE cs.signoff_status IN ('rejected', 'amend_requested')) AS rejected,
          COALESCE(
            count(*) FILTER (WHERE cs.signoff_status IN ('signed_off', 'published'))::numeric
            / NULLIF(count(*), 0),
            0
          ) AS approval_rate
        FROM content_submissions cs
        WHERE cs.company_id = p_company_id
          AND (p_jurisdiction IS NULL OR cs.jurisdiction = p_jurisdiction)
        GROUP BY cs.department
        ORDER BY count(*) DESC
      ) dept
    ), '[]'::json),

    'by_platform',
    COALESCE((
      SELECT json_agg(row_to_json(plat))
      FROM (
        SELECT
          cs.platform,
          count(*) AS total,
          count(*) FILTER (WHERE cs.signoff_status IN ('signed_off', 'published')) AS approved,
          count(*) FILTER (WHERE cs.signoff_status IN ('rejected', 'amend_requested')) AS rejected,
          count(*) FILTER (WHERE cs.signoff_status IN ('awaiting_legal', 'in_review')) AS in_legal_queue
        FROM content_submissions cs
        WHERE cs.company_id = p_company_id
          AND (p_jurisdiction IS NULL OR cs.jurisdiction = p_jurisdiction)
        GROUP BY cs.platform
        ORDER BY count(*) DESC
      ) plat
    ), '[]'::json)
  );
$$;

-- ============================================================
-- 6) RPC: get_company_activity_feed
-- ============================================================

CREATE OR REPLACE FUNCTION get_company_activity_feed(
  p_company_id uuid,
  p_limit int DEFAULT 10
)
RETURNS TABLE(
  id uuid,
  created_at timestamptz,
  action text,
  entity_type text,
  entity_id uuid,
  user_id uuid,
  user_name text,
  metadata jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    al.id,
    al.created_at,
    al.action,
    al.entity_type,
    al.entity_id,
    al.user_id,
    COALESCE(p.full_name, p.email, 'Unknown') AS user_name,
    al.metadata
  FROM audit_logs al
  LEFT JOIN profiles p ON p.id = al.user_id
  WHERE al.metadata->>'company_id' = p_company_id::text
  ORDER BY al.created_at DESC
  LIMIT GREATEST(p_limit, 1);
$$;

-- ============================================================
-- 7) RPC: get_company_risk_distribution
-- ============================================================

CREATE OR REPLACE FUNCTION get_company_risk_distribution(
  p_company_id uuid,
  p_jurisdiction text DEFAULT NULL
)
RETURNS TABLE(status text, count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    cs.status,
    count(*) AS count
  FROM content_submissions cs
  WHERE cs.company_id = p_company_id
    AND (p_jurisdiction IS NULL OR cs.jurisdiction = p_jurisdiction)
  GROUP BY cs.status
  ORDER BY count(*) DESC;
$$;

-- ============================================================
-- 8) RPC: get_legal_queue
-- ============================================================

CREATE OR REPLACE FUNCTION get_legal_queue(
  p_company_id uuid,
  p_statuses text[] DEFAULT ARRAY['awaiting_legal', 'in_review'],
  p_priority text DEFAULT NULL,
  p_department text DEFAULT NULL,
  p_platform text DEFAULT NULL,
  p_jurisdiction text DEFAULT NULL
)
RETURNS TABLE(
  content_id uuid,
  title text,
  department text,
  platform text,
  priority text,
  jurisdiction text,
  signoff_status text,
  submitted_for_legal_at timestamptz,
  time_in_queue_hours numeric,
  risk text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    cs.id AS content_id,
    cs.title,
    cs.department,
    cs.platform,
    cs.priority,
    cs.jurisdiction,
    cs.signoff_status,
    cs.submitted_for_legal_at,
    CASE
      WHEN cs.submitted_for_legal_at IS NOT NULL
      THEN EXTRACT(EPOCH FROM (now() - cs.submitted_for_legal_at)) / 3600.0
      ELSE NULL
    END AS time_in_queue_hours,
    cr.overall_risk AS risk
  FROM content_submissions cs
  LEFT JOIN LATERAL (
    SELECT cr2.overall_risk
    FROM compliance_reports cr2
    WHERE cr2.content_id = cs.id
    ORDER BY cr2.created_at DESC
    LIMIT 1
  ) cr ON TRUE
  WHERE cs.company_id = p_company_id
    AND cs.signoff_status = ANY(p_statuses)
    AND (p_priority IS NULL OR cs.priority = p_priority)
    AND (p_department IS NULL OR cs.department = p_department)
    AND (p_platform IS NULL OR cs.platform = p_platform)
    AND (p_jurisdiction IS NULL OR cs.jurisdiction = p_jurisdiction)
  ORDER BY cs.submitted_for_legal_at ASC NULLS LAST;
$$;

-- ============================================================
-- 9) RPC: get_legal_performance
-- ============================================================

CREATE OR REPLACE FUNCTION get_legal_performance(
  p_company_id uuid,
  p_days int DEFAULT 30
)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT json_build_object(
    'window_days', p_days,
    'approved_count',
      (SELECT count(*)
       FROM content_submissions
       WHERE company_id = p_company_id
         AND signoff_status IN ('signed_off', 'published')
         AND legal_decided_at >= (current_date - p_days)),
    'rejected_count',
      (SELECT count(*)
       FROM content_submissions
       WHERE company_id = p_company_id
         AND signoff_status IN ('rejected', 'amend_requested')
         AND legal_decided_at >= (current_date - p_days)),
    'sla_breaches_24h',
      (SELECT count(*)
       FROM content_submissions
       WHERE company_id = p_company_id
         AND signoff_status IN ('awaiting_legal', 'in_review')
         AND submitted_for_legal_at IS NOT NULL
         AND submitted_for_legal_at < (now() - interval '24 hours')),
    'avg_turnaround_hours',
      (SELECT EXTRACT(EPOCH FROM avg(legal_decided_at - submitted_for_legal_at)) / 3600.0
       FROM content_submissions
       WHERE company_id = p_company_id
         AND legal_decided_at IS NOT NULL
         AND submitted_for_legal_at IS NOT NULL
         AND legal_decided_at >= (current_date - p_days))
  );
$$;

-- ============================================================
-- 10) RPC: get_marketing_pipeline
-- ============================================================

CREATE OR REPLACE FUNCTION get_marketing_pipeline(
  p_company_id uuid,
  p_user_id uuid,
  p_jurisdiction text DEFAULT NULL
)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH base AS (
    SELECT
      cs.id,
      cs.title,
      cs.platform,
      cs.signoff_status,
      cs.scheduled_date,
      cs.published_at,
      cs.priority,
      cs.created_at
    FROM content_submissions cs
    WHERE cs.company_id = p_company_id
      AND cs.user_id = p_user_id
      AND (p_jurisdiction IS NULL OR cs.jurisdiction = p_jurisdiction)
  )
  SELECT json_build_object(
    'drafts',
    COALESCE((
      SELECT json_agg(row_to_json(t) ORDER BY t.created_at DESC)
      FROM (SELECT * FROM base WHERE signoff_status IN ('draft', 'analyzed')) t
    ), '[]'::json),

    'awaiting_legal',
    COALESCE((
      SELECT json_agg(row_to_json(t) ORDER BY t.created_at DESC)
      FROM (SELECT * FROM base WHERE signoff_status IN ('awaiting_legal', 'in_review')) t
    ), '[]'::json),

    'needs_rework',
    COALESCE((
      SELECT json_agg(row_to_json(t) ORDER BY t.created_at DESC)
      FROM (SELECT * FROM base WHERE signoff_status IN ('amend_requested', 'rejected')) t
    ), '[]'::json),

    'ready_to_publish',
    COALESCE((
      SELECT json_agg(row_to_json(t) ORDER BY t.created_at DESC)
      FROM (SELECT * FROM base WHERE signoff_status = 'signed_off') t
    ), '[]'::json),

    'scheduled',
    COALESCE((
      SELECT json_agg(row_to_json(t) ORDER BY t.scheduled_date ASC NULLS LAST)
      FROM (SELECT * FROM base WHERE scheduled_date IS NOT NULL AND signoff_status != 'published') t
    ), '[]'::json)
  );
$$;
