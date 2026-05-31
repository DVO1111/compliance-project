/*
  # Dashboard Enhancement RPCs

  New RPCs for the dashboard enhancement widgets:
  1. get_top_risk_causes       — Most violated rules from compliance issues
  2. get_reviewer_workload     — Per-reviewer stats from legal_reviews
  3. get_my_content_stats      — Personal marketing stats
  4. get_jurisdiction_comparison — Side-by-side jurisdiction metrics
  5. get_decisions_summary     — Today/this week decisions for legal
  6. get_my_past_decisions     — Historical decisions log for legal
*/

-- ============================================================
-- 1) get_top_risk_causes
--    Aggregates the "issue" text from compliance_reports.issues JSONB
--    to find which compliance rules are violated most often.
-- ============================================================

CREATE OR REPLACE FUNCTION get_top_risk_causes(
  p_company_id uuid,
  p_user_id uuid DEFAULT NULL,
  p_jurisdiction text DEFAULT NULL,
  p_limit int DEFAULT 10
)
RETURNS TABLE(
  cause text,
  severity text,
  occurrences bigint,
  category text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    issue_obj->>'issue' AS cause,
    issue_obj->>'severity' AS severity,
    count(*) AS occurrences,
    COALESCE(issue_obj->>'category', 'general') AS category
  FROM compliance_reports cr
  JOIN content_submissions cs ON cs.id = cr.content_id
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(cr.issues) = 'array' THEN cr.issues ELSE '[]'::jsonb END
  ) AS issue_obj
  WHERE cs.company_id = p_company_id
    AND (p_user_id IS NULL OR cs.user_id = p_user_id)
    AND (p_jurisdiction IS NULL OR cs.jurisdiction = p_jurisdiction)
  GROUP BY
    issue_obj->>'issue',
    issue_obj->>'severity',
    COALESCE(issue_obj->>'category', 'general')
  ORDER BY count(*) DESC
  LIMIT GREATEST(p_limit, 1);
$$;

-- ============================================================
-- 2) get_reviewer_workload
--    Per-reviewer stats: queue size, reviews done, avg turnaround.
-- ============================================================

CREATE OR REPLACE FUNCTION get_reviewer_workload(
  p_company_id uuid,
  p_days int DEFAULT 30
)
RETURNS TABLE(
  reviewer_id uuid,
  reviewer_name text,
  reviews_completed bigint,
  approved bigint,
  rejected bigint,
  avg_turnaround_hours numeric,
  current_queue bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH reviewers AS (
    SELECT DISTINCT lr.reviewer_id
    FROM legal_reviews lr
    JOIN content_submissions cs ON cs.id = lr.content_id
    WHERE cs.company_id = p_company_id
      AND lr.reviewer_id IS NOT NULL
  ),
  completed AS (
    SELECT
      lr.reviewer_id,
      count(*) AS reviews_completed,
      count(*) FILTER (WHERE lr.status = 'approved') AS approved,
      count(*) FILTER (WHERE lr.status = 'rejected') AS rejected,
      avg(
        CASE WHEN cs.legal_decided_at IS NOT NULL AND cs.submitted_for_legal_at IS NOT NULL
        THEN EXTRACT(EPOCH FROM (cs.legal_decided_at - cs.submitted_for_legal_at)) / 3600.0
        ELSE NULL END
      ) AS avg_turnaround_hours
    FROM legal_reviews lr
    JOIN content_submissions cs ON cs.id = lr.content_id
    WHERE cs.company_id = p_company_id
      AND lr.reviewer_id IS NOT NULL
      AND lr.created_at >= (current_date - p_days)
    GROUP BY lr.reviewer_id
  ),
  queued AS (
    SELECT
      lr.reviewer_id,
      count(*) AS current_queue
    FROM legal_reviews lr
    JOIN content_submissions cs ON cs.id = lr.content_id
    WHERE cs.company_id = p_company_id
      AND lr.reviewer_id IS NOT NULL
      AND lr.status = 'pending'
    GROUP BY lr.reviewer_id
  )
  SELECT
    r.reviewer_id,
    COALESCE(p.full_name, p.email, 'Unknown') AS reviewer_name,
    COALESCE(c.reviews_completed, 0) AS reviews_completed,
    COALESCE(c.approved, 0) AS approved,
    COALESCE(c.rejected, 0) AS rejected,
    c.avg_turnaround_hours,
    COALESCE(q.current_queue, 0) AS current_queue
  FROM reviewers r
  LEFT JOIN profiles p ON p.id = r.reviewer_id
  LEFT JOIN completed c ON c.reviewer_id = r.reviewer_id
  LEFT JOIN queued q ON q.reviewer_id = r.reviewer_id
  ORDER BY COALESCE(c.reviews_completed, 0) DESC;
$$;

-- ============================================================
-- 3) get_my_content_stats
--    Personal stats for marketing users.
-- ============================================================

CREATE OR REPLACE FUNCTION get_my_content_stats(
  p_company_id uuid,
  p_user_id uuid
)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT json_build_object(
    'total_all_time',
      (SELECT count(*) FROM content_submissions
       WHERE company_id = p_company_id AND user_id = p_user_id),
    'total_this_month',
      (SELECT count(*) FROM content_submissions
       WHERE company_id = p_company_id AND user_id = p_user_id
         AND created_at >= date_trunc('month', current_date)),
    'approved',
      (SELECT count(*) FROM content_submissions
       WHERE company_id = p_company_id AND user_id = p_user_id
         AND signoff_status IN ('signed_off', 'published')),
    'rejected',
      (SELECT count(*) FROM content_submissions
       WHERE company_id = p_company_id AND user_id = p_user_id
         AND signoff_status IN ('rejected', 'amend_requested')),
    'published',
      (SELECT count(*) FROM content_submissions
       WHERE company_id = p_company_id AND user_id = p_user_id
         AND signoff_status = 'published'),
    'approval_rate',
      COALESCE(
        (SELECT count(*) FILTER (WHERE signoff_status IN ('signed_off', 'published'))::numeric
         / NULLIF(count(*) FILTER (WHERE signoff_status NOT IN ('draft', 'analyzed')), 0)
         FROM content_submissions
         WHERE company_id = p_company_id AND user_id = p_user_id),
        0
      ),
    'rework_rate',
      COALESCE(
        (SELECT count(*) FILTER (WHERE signoff_status IN ('rejected', 'amend_requested'))::numeric
         / NULLIF(count(*), 0)
         FROM content_submissions
         WHERE company_id = p_company_id AND user_id = p_user_id),
        0
      ),
    'avg_time_to_approval_hours',
      (SELECT EXTRACT(EPOCH FROM avg(legal_decided_at - submitted_for_legal_at)) / 3600.0
       FROM content_submissions
       WHERE company_id = p_company_id AND user_id = p_user_id
         AND legal_decided_at IS NOT NULL
         AND submitted_for_legal_at IS NOT NULL
         AND signoff_status IN ('signed_off', 'published')),
    'platforms',
      COALESCE((
        SELECT json_agg(row_to_json(t))
        FROM (
          SELECT platform, count(*) AS count
          FROM content_submissions
          WHERE company_id = p_company_id AND user_id = p_user_id
          GROUP BY platform ORDER BY count(*) DESC
        ) t
      ), '[]'::json)
  );
$$;

-- ============================================================
-- 4) get_jurisdiction_comparison
--    Side-by-side metrics per jurisdiction.
-- ============================================================

CREATE OR REPLACE FUNCTION get_jurisdiction_comparison(
  p_company_id uuid,
  p_user_id uuid DEFAULT NULL
)
RETURNS TABLE(
  jurisdiction text,
  total_submissions bigint,
  approved bigint,
  rejected bigint,
  approval_rate numeric,
  avg_risk_score numeric,
  flagged bigint,
  critical bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    cs.jurisdiction,
    count(*) AS total_submissions,
    count(*) FILTER (WHERE cs.signoff_status IN ('signed_off', 'published')) AS approved,
    count(*) FILTER (WHERE cs.signoff_status IN ('rejected', 'amend_requested')) AS rejected,
    COALESCE(
      count(*) FILTER (WHERE cs.signoff_status IN ('signed_off', 'published'))::numeric
      / NULLIF(count(*) FILTER (WHERE cs.signoff_status NOT IN ('draft', 'analyzed')), 0),
      0
    ) AS approval_rate,
    avg(CASE
      WHEN cr.overall_risk = 'low' THEN 1
      WHEN cr.overall_risk = 'medium' THEN 2
      WHEN cr.overall_risk = 'high' THEN 3
      WHEN cr.overall_risk = 'critical' THEN 4
      ELSE NULL
    END) AS avg_risk_score,
    count(*) FILTER (WHERE cs.status = 'flagged') AS flagged,
    count(*) FILTER (WHERE cs.status = 'critical') AS critical
  FROM content_submissions cs
  LEFT JOIN LATERAL (
    SELECT cr2.overall_risk
    FROM compliance_reports cr2
    WHERE cr2.content_id = cs.id
    ORDER BY cr2.created_at DESC
    LIMIT 1
  ) cr ON TRUE
  WHERE cs.company_id = p_company_id
    AND (p_user_id IS NULL OR cs.user_id = p_user_id)
  GROUP BY cs.jurisdiction
  ORDER BY count(*) DESC;
$$;

-- ============================================================
-- 5) get_decisions_summary
--    Decisions made today / this week / this month by a reviewer.
-- ============================================================

CREATE OR REPLACE FUNCTION get_decisions_summary(
  p_company_id uuid,
  p_reviewer_id uuid
)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT json_build_object(
    'today_total',
      (SELECT count(*) FROM legal_reviews lr
       JOIN content_submissions cs ON cs.id = lr.content_id
       WHERE cs.company_id = p_company_id
         AND lr.reviewer_id = p_reviewer_id
         AND lr.status != 'pending'
         AND lr.updated_at::date = current_date),
    'today_approved',
      (SELECT count(*) FROM legal_reviews lr
       JOIN content_submissions cs ON cs.id = lr.content_id
       WHERE cs.company_id = p_company_id
         AND lr.reviewer_id = p_reviewer_id
         AND lr.status = 'approved'
         AND lr.updated_at::date = current_date),
    'today_rejected',
      (SELECT count(*) FROM legal_reviews lr
       JOIN content_submissions cs ON cs.id = lr.content_id
       WHERE cs.company_id = p_company_id
         AND lr.reviewer_id = p_reviewer_id
         AND lr.status = 'rejected'
         AND lr.updated_at::date = current_date),
    'this_week_total',
      (SELECT count(*) FROM legal_reviews lr
       JOIN content_submissions cs ON cs.id = lr.content_id
       WHERE cs.company_id = p_company_id
         AND lr.reviewer_id = p_reviewer_id
         AND lr.status != 'pending'
         AND lr.updated_at >= date_trunc('week', current_date)),
    'this_month_total',
      (SELECT count(*) FROM legal_reviews lr
       JOIN content_submissions cs ON cs.id = lr.content_id
       WHERE cs.company_id = p_company_id
         AND lr.reviewer_id = p_reviewer_id
         AND lr.status != 'pending'
         AND lr.updated_at >= date_trunc('month', current_date))
  );
$$;

-- ============================================================
-- 6) get_my_past_decisions
--    Historical log of decisions made by a reviewer.
-- ============================================================

CREATE OR REPLACE FUNCTION get_my_past_decisions(
  p_company_id uuid,
  p_reviewer_id uuid,
  p_limit int DEFAULT 20
)
RETURNS TABLE(
  review_id uuid,
  content_id uuid,
  content_title text,
  platform text,
  decision text,
  comments text,
  decided_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    lr.id AS review_id,
    lr.content_id,
    cs.title AS content_title,
    cs.platform,
    lr.status AS decision,
    lr.comments,
    lr.updated_at AS decided_at
  FROM legal_reviews lr
  JOIN content_submissions cs ON cs.id = lr.content_id
  WHERE cs.company_id = p_company_id
    AND lr.reviewer_id = p_reviewer_id
    AND lr.status != 'pending'
  ORDER BY lr.updated_at DESC
  LIMIT GREATEST(p_limit, 1);
$$;
