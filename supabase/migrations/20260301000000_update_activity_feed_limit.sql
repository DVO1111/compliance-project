-- Update get_company_activity_feed to strictly enforce the limit parameter

CREATE OR REPLACE FUNCTION get_company_activity_feed(
  p_company_id uuid,
  p_limit int DEFAULT 5
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
  WITH recent_logs AS (
    SELECT
      al.id,
      al.created_at,
      al.action,
      al.entity_type,
      al.entity_id,
      al.user_id,
      al.metadata
    FROM audit_logs al
    WHERE al.metadata->>'company_id' = p_company_id::text
    ORDER BY al.created_at DESC
    LIMIT GREATEST(p_limit, 1)
  )
  SELECT
    rl.id,
    rl.created_at,
    rl.action,
    rl.entity_type,
    rl.entity_id,
    rl.user_id,
    COALESCE(p.full_name, p.email, 'System') AS user_name,
    rl.metadata
  FROM recent_logs rl
  LEFT JOIN profiles p ON p.id = rl.user_id
  ORDER BY rl.created_at DESC;
$$;
