-- Update get_company_dashboard_metrics with full trend coverage
CREATE OR REPLACE FUNCTION get_company_dashboard_metrics(p_company_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_result json;
  v_week_start date := current_date - interval '6 days';
  v_prev_week_start date := current_date - interval '13 days';
  v_prev_week_end date := current_date - interval '7 days';
BEGIN
  WITH daily_stats AS (
    SELECT
      d.day,
      count(cs.id) FILTER (WHERE cs.created_at::date = d.day) as submitted,
      count(cs.id) FILTER (WHERE cs.signoff_status IN ('awaiting_legal', 'in_review') AND cs.submitted_for_legal_at::date = d.day) as entering_queue,
      count(cs.id) FILTER (WHERE cs.signoff_status IN ('signed_off', 'published') AND cs.legal_decided_at::date = d.day) as approved,
      count(cs.id) FILTER (WHERE cs.signoff_status IN ('rejected', 'amend_requested') AND cs.legal_decided_at::date = d.day) as rejected,
      avg(EXTRACT(EPOCH FROM (legal_decided_at - submitted_for_legal_at)) / 3600.0) FILTER (WHERE legal_decided_at::date = d.day AND submitted_for_legal_at IS NOT NULL) as turnaround
    FROM generate_series(v_week_start, current_date, '1 day'::interval) d(day)
    LEFT JOIN content_submissions cs ON cs.company_id = p_company_id
    GROUP BY d.day
    ORDER BY d.day
  ),
  current_week AS (
    SELECT
      count(*) as total_submitted,
      count(*) FILTER (WHERE signoff_status IN ('awaiting_legal', 'in_review')) as entering_queue,
      count(*) FILTER (WHERE signoff_status IN ('signed_off', 'published')) as total_approved,
      count(*) FILTER (WHERE signoff_status IN ('rejected', 'amend_requested')) as total_rejected,
      avg(EXTRACT(EPOCH FROM (legal_decided_at - submitted_for_legal_at)) / 3600.0) FILTER (WHERE legal_decided_at IS NOT NULL AND submitted_for_legal_at IS NOT NULL) as avg_turnaround
    FROM content_submissions
    WHERE company_id = p_company_id 
    AND (created_at::date >= v_week_start OR legal_decided_at::date >= v_week_start)
  ),
  prev_week AS (
    SELECT
      count(*) as total_submitted,
      count(*) FILTER (WHERE signoff_status IN ('awaiting_legal', 'in_review')) as entering_queue,
      count(*) FILTER (WHERE signoff_status IN ('signed_off', 'published')) as total_approved,
      count(*) FILTER (WHERE signoff_status IN ('rejected', 'amend_requested')) as total_rejected,
      avg(EXTRACT(EPOCH FROM (legal_decided_at - submitted_for_legal_at)) / 3600.0) FILTER (WHERE legal_decided_at IS NOT NULL AND submitted_for_legal_at IS NOT NULL) as avg_turnaround
    FROM content_submissions
    WHERE company_id = p_company_id 
    AND (created_at::date BETWEEN v_prev_week_start AND v_prev_week_end OR legal_decided_at::date BETWEEN v_prev_week_start AND v_prev_week_end)
  )
  SELECT json_build_object(
    'total_submitted', (SELECT count(*) FROM content_submissions WHERE company_id = p_company_id),
    'total_submitted_trend', (SELECT array_agg(submitted) FROM daily_stats),
    'total_submitted_change', (
      SELECT CASE WHEN pw.total_submitted = 0 THEN 0 ELSE round(((cw.total_submitted - pw.total_submitted)::numeric / pw.total_submitted) * 100) END
      FROM current_week cw, prev_week pw
    ),
    
    'in_legal_queue', (SELECT count(*) FROM content_submissions WHERE company_id = p_company_id AND signoff_status IN ('awaiting_legal', 'in_review')),
    'in_legal_queue_trend', (SELECT array_agg(entering_queue) FROM daily_stats),
    'in_legal_queue_change', (
      SELECT CASE WHEN pw.entering_queue = 0 THEN 0 ELSE round(((cw.entering_queue - pw.entering_queue)::numeric / pw.entering_queue) * 100) END
      FROM current_week cw, prev_week pw
    ),
    
    'approved', (SELECT count(*) FROM content_submissions WHERE company_id = p_company_id AND signoff_status IN ('signed_off', 'published')),
    'approved_trend', (SELECT array_agg(approved) FROM daily_stats),
    'approved_change', (
      SELECT CASE WHEN pw.total_approved = 0 THEN 0 ELSE round(((cw.total_approved - pw.total_approved)::numeric / pw.total_approved) * 100) END
      FROM current_week cw, prev_week pw
    ),
    
    'rejected', (SELECT count(*) FROM content_submissions WHERE company_id = p_company_id AND signoff_status IN ('rejected', 'amend_requested')),
    'rejected_trend', (SELECT array_agg(rejected) FROM daily_stats),
    'rejected_change', (
      SELECT CASE WHEN pw.total_rejected = 0 THEN 0 ELSE round(((cw.total_rejected - pw.total_rejected)::numeric / pw.total_rejected) * 100) END
      FROM current_week cw, prev_week pw
    ),
    
    'avg_turnaround_hours', (
      SELECT COALESCE(EXTRACT(EPOCH FROM avg(legal_decided_at - submitted_for_legal_at)) / 3600.0, 0)
      FROM content_submissions
      WHERE company_id = p_company_id AND legal_decided_at IS NOT NULL AND submitted_for_legal_at IS NOT NULL
    ),
    'avg_turnaround_trend', (SELECT array_agg(COALESCE(turnaround, 0)) FROM daily_stats),
    'avg_turnaround_change', (
      SELECT CASE WHEN COALESCE(pw.avg_turnaround, 0) = 0 THEN 0 ELSE round(((COALESCE(cw.avg_turnaround, 0) - pw.avg_turnaround)::numeric / pw.avg_turnaround) * 100) END
      FROM current_week cw, prev_week pw
    ),
    
    'approval_rate', COALESCE(
      (SELECT count(*) FILTER (WHERE signoff_status IN ('signed_off', 'published'))::numeric
       / NULLIF(count(*) FILTER (WHERE signoff_status NOT IN ('draft', 'analyzed')), 0)
       FROM content_submissions WHERE company_id = p_company_id), 0
    ),
    'rejection_rate', COALESCE(
      (SELECT count(*) FILTER (WHERE signoff_status IN ('rejected', 'amend_requested'))::numeric
       / NULLIF(count(*) FILTER (WHERE signoff_status NOT IN ('draft', 'analyzed')), 0)
       FROM content_submissions WHERE company_id = p_company_id), 0
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;
