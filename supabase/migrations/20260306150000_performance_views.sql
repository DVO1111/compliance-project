-- ============================================================
-- Performance Views & RPCs
-- Phase 5 Sprint 1
-- ============================================================

-- ── 1. Policy Compliance View ────────────────────────────────

CREATE OR REPLACE VIEW public.v_policy_compliance_stats AS
WITH latest_versions AS (
  SELECT DISTINCT ON (policy_id) 
    id, policy_id, published_at
  FROM public.policy_versions
  WHERE status = 'published'
  ORDER BY policy_id, created_at DESC
),
employee_counts AS (
  SELECT organization_id as company_id, count(*) as total_employees
  FROM public.profiles
  GROUP BY organization_id
),
ack_counts AS (
  SELECT v.policy_id, count(a.id) as ack_count
  FROM latest_versions v
  LEFT JOIN public.policy_acknowledgements a ON a.version_id = v.id
  GROUP BY v.policy_id
)
SELECT 
  p.id as policy_id,
  p.company_id,
  p.title as policy_title,
  coalesce(ec.total_employees, 0) as total_users,
  coalesce(ac.ack_count, 0) as acknowledged_users,
  CASE 
    WHEN coalesce(ec.total_employees, 0) = 0 THEN 0
    ELSE round((coalesce(ac.ack_count, 0)::numeric / ec.total_employees::numeric) * 100)
  END as compliance_rate
FROM public.policies p
LEFT JOIN employee_counts ec ON ec.company_id = p.company_id
LEFT JOIN ack_counts ac ON ac.policy_id = p.id
WHERE p.is_active = true;


-- ── 2. Automation Health View ────────────────────────────────

CREATE OR REPLACE VIEW public.v_automation_health_summary AS
SELECT 
  company_id,
  date_trunc('day', created_at) as run_date,
  count(*) filter (where status = 'passed') as passed_count,
  count(*) filter (where status = 'failed') as failed_count
FROM public.grc_automation_runs
WHERE created_at >= now() - interval '30 days'
GROUP BY company_id, run_date;


-- ── 3. Vendor Risk Aggregate View ────────────────────────────

CREATE OR REPLACE VIEW public.v_vendor_risk_exposure AS
SELECT 
  v.company_id,
  v.category,
  round(avg(p.risk_score)) as avg_risk_score,
  count(*) as vendor_count
FROM public.vendors v
JOIN public.vendor_risk_profiles p ON p.vendor_id = v.id
WHERE v.status = 'active'
GROUP BY v.company_id, v.category;


-- ── 4. Audit Velocity View ───────────────────────────────────

CREATE OR REPLACE VIEW public.v_audit_velocity AS
SELECT 
  r.company_id,
  r.audit_session_id,
  s.name as session_name,
  count(*) as total_requests,
  count(*) filter (where r.status = 'fulfilled') as fulfilled_requests
FROM public.audit_requests r
JOIN public.audit_sessions s ON s.id = r.audit_session_id
GROUP BY r.company_id, r.audit_session_id, s.name;


-- ── 5. Bulk Policy Reminders RPC ──────────────────────────────
-- Identifies all users who need reminders in a single call

CREATE OR REPLACE FUNCTION public.get_users_needing_policy_reminders()
RETURNS TABLE (
  recipient_id uuid,
  policy_title text,
  version_id uuid,
  is_overdue boolean
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id as recipient_id, 
    pol.title as policy_title,
    v.id as version_id,
    now() > (v.published_at + (v.due_days || ' days')::interval) as is_overdue
  FROM public.profiles p
  JOIN public.policy_versions v ON v.status = 'published' AND v.requires_ack = true
  JOIN public.policies pol ON pol.id = v.policy_id AND pol.company_id = p.organization_id
  LEFT JOIN public.policy_acknowledgements ack ON ack.version_id = v.id AND ack.user_id = p.id
  -- Avoid double-reminding in the same 24h
  LEFT JOIN public.notifications n ON n.recipient_id = p.id 
    AND n.type = 'policy_reminder' 
    AND n.created_at >= now() - interval '24 hours' 
    AND n.message ILIKE '%' || pol.title || '%'
  WHERE ack.id IS NULL AND n.id IS NULL;
END;
$$;
