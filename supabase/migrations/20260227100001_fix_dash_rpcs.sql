-- ============================================================
-- Fix mark_content_in_review case sensitivity
-- Add missing legal dashboard metric RPCs
-- ============================================================

-- Fix marking content in review to be case insensitive for roles
DROP FUNCTION IF EXISTS public.mark_content_in_review(uuid);
CREATE OR REPLACE FUNCTION public.mark_content_in_review(p_submission_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role text;
  v_company_id uuid;
BEGIN
  -- Get user info
  SELECT role, company_id INTO v_role, v_company_id
  FROM profiles
  WHERE id = auth.uid();

  IF lower(v_role) NOT IN ('compliance', 'legal', 'compliance_officer', 'legal_reviewer') THEN
    RAISE EXCEPTION 'Only compliance/legal can mark in_review';
  END IF;

  -- Update submission
  UPDATE content_submissions
  SET signoff_status = 'in_review',
      submitted_for_legal_at = COALESCE(submitted_for_legal_at, now()),
      updated_at = now()
  WHERE id = p_submission_id
    AND company_id = v_company_id;
END;
$$;

-- Missing RPCs for dashboard widgets (return blank data structure if real logic is complex)
CREATE OR REPLACE FUNCTION public.get_my_past_decisions(
    p_company_id uuid,
    p_limit integer DEFAULT 5,
    p_reviewer_id uuid DEFAULT NULL
)
RETURNS TABLE (
    submission_id uuid,
    title text,
    decision text,
    decided_at timestamptz,
    days_to_decide numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id AS submission_id,
        s.title,
        CASE
            WHEN s.signoff_status = 'signed_off' THEN 'approved'
            WHEN s.signoff_status IN ('rejected', 'amend_requested') THEN 'rejected'
            ELSE 'other'
        END AS decision,
        s.legal_decided_at AS decided_at,
        ROUND((EXTRACT(EPOCH FROM (s.legal_decided_at - s.submitted_for_legal_at)) / 86400)::numeric, 1) AS days_to_decide
    FROM content_submissions s
    WHERE s.company_id = p_company_id
      AND s.legal_decided_by = COALESCE(p_reviewer_id, auth.uid())
      AND s.legal_decided_at IS NOT NULL
      AND s.signoff_status IN ('signed_off', 'rejected', 'amend_requested')
    ORDER BY s.legal_decided_at DESC
    LIMIT p_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_decisions_summary(
    p_company_id uuid,
    p_reviewer_id uuid DEFAULT NULL
)
RETURNS TABLE (
    total_decisions bigint,
    approved bigint,
    rejected bigint,
    amend_requested bigint,
    avg_hours_to_decide numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        count(*)::bigint AS total_decisions,
        SUM(CASE WHEN signoff_status = 'signed_off' THEN 1 ELSE 0 END)::bigint AS approved,
        SUM(CASE WHEN signoff_status = 'rejected' THEN 1 ELSE 0 END)::bigint AS rejected,
        SUM(CASE WHEN signoff_status = 'amend_requested' THEN 1 ELSE 0 END)::bigint AS amend_requested,
        COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (legal_decided_at - submitted_for_legal_at)) / 3600)::numeric, 1), 0) AS avg_hours_to_decide
    FROM content_submissions
    WHERE company_id = p_company_id
      AND legal_decided_by = COALESCE(p_reviewer_id, auth.uid())
      AND legal_decided_at IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_reviewer_workload(
    p_company_id uuid,
    p_days integer DEFAULT 7
)
RETURNS TABLE (
    reviewer_id uuid,
    reviewer_name text,
    reviewer_role text,
    pending_count bigint,
    completed_count bigint,
    avg_turnaround_hours numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id AS reviewer_id,
        COALESCE(p.full_name, 'Unknown') AS reviewer_name,
        p.role AS reviewer_role,
        (SELECT count(*) FROM review_assignments ra 
         WHERE p.id = ANY(ra.reviewer_ids) 
           AND ra.status = 'open' 
           AND ra.company_id = p_company_id)::bigint AS pending_count,
        (SELECT count(*) FROM content_submissions s 
         WHERE s.legal_decided_by = p.id 
           AND s.company_id = p_company_id
           AND s.legal_decided_at >= now() - (p_days || ' days')::interval)::bigint AS completed_count,
        (SELECT COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (s.legal_decided_at - s.submitted_for_legal_at)) / 3600)::numeric, 1), 0)
         FROM content_submissions s
         WHERE s.legal_decided_by = p.id
           AND s.company_id = p_company_id
           AND s.legal_decided_at >= now() - (p_days || ' days')::interval) AS avg_turnaround_hours
    FROM profiles p
    WHERE p.company_id = p_company_id
      AND lower(p.role) IN ('compliance', 'legal', 'compliance_officer', 'legal_reviewer')
    ORDER BY pending_count DESC, completed_count DESC;
END;
$$;
