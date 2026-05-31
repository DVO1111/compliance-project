-- Restore get_decisions_summary to return a JSON object with time-windowed metrics
-- This fix ensures the "Your Activity" section on the legal dashboard renders correctly.

-- MUST Drop before recreated because return type changed from TABLE to JSON
DROP FUNCTION IF EXISTS public.get_decisions_summary(uuid, uuid);

CREATE OR REPLACE FUNCTION public.get_decisions_summary(
  p_company_id uuid,
  p_reviewer_id uuid
)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'today_total',
      (SELECT count(*) FROM content_submissions
       WHERE company_id = p_company_id
         AND legal_decided_by = p_reviewer_id
         AND signoff_status IN ('signed_off', 'rejected', 'amend_requested')
         AND legal_decided_at::date = current_date),
    'today_approved',
      (SELECT count(*) FROM content_submissions
       WHERE company_id = p_company_id
         AND legal_decided_by = p_reviewer_id
         AND signoff_status = 'signed_off'
         AND legal_decided_at::date = current_date),
    'today_rejected',
      (SELECT count(*) FROM content_submissions
       WHERE company_id = p_company_id
         AND legal_decided_by = p_reviewer_id
         AND signoff_status IN ('rejected', 'amend_requested')
         AND legal_decided_at::date = current_date),
    'this_week_total',
      (SELECT count(*) FROM content_submissions
       WHERE company_id = p_company_id
         AND legal_decided_by = p_reviewer_id
         AND signoff_status IN ('signed_off', 'rejected', 'amend_requested')
         AND legal_decided_at >= date_trunc('week', current_date)),
    'this_month_total',
      (SELECT count(*) FROM content_submissions
       WHERE company_id = p_company_id
         AND legal_decided_by = p_reviewer_id
         AND signoff_status IN ('signed_off', 'rejected', 'amend_requested')
         AND legal_decided_at >= date_trunc('month', current_date))
  );
$$;
