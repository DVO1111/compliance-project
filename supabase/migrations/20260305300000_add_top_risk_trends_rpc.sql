-- RPC to get daily trends for the top risk causes
-- Returns JSONB in the format: [{ "day": "2026-03-01", "Cause A": 5, "Cause B": 2 }, ...]

CREATE OR REPLACE FUNCTION get_top_risk_trends(
  p_company_id uuid,
  p_user_id uuid DEFAULT NULL,
  p_jurisdiction text DEFAULT NULL,
  p_days int DEFAULT 30,
  p_limit int DEFAULT 5
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_top_causes text[];
  v_result JSONB;
BEGIN
  -- 1) Identify the top p_limit causes for the company/context in the last p_days
  SELECT array_agg(cause) INTO v_top_causes
  FROM (
    SELECT
      issue_obj->>'issue' AS cause,
      count(*) AS cnt
    FROM compliance_reports cr
    JOIN content_submissions cs ON cs.id = cr.content_id
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(cr.issues) = 'array' THEN cr.issues ELSE '[]'::jsonb END
    ) AS issue_obj
    WHERE cs.company_id = p_company_id
      AND (p_user_id IS NULL OR cs.user_id = p_user_id)
      AND (p_jurisdiction IS NULL OR cs.jurisdiction = p_jurisdiction)
      AND cr.created_at >= (current_date - p_days)
    GROUP BY 1
    ORDER BY 2 DESC
    LIMIT p_limit
  ) t;

  -- 2) If no causes found, return empty array
  IF v_top_causes IS NULL THEN
    RETURN '[]'::JSONB;
  END IF;

  -- 3) Aggregate daily counts for these specific top causes
  WITH days AS (
    SELECT generate_series(
      (current_date - p_days + 1)::timestamp,
      current_date::timestamp,
      '1 day'::interval
    )::date AS day
  ),
  daily_stats AS (
    SELECT
      cr.created_at::date AS day,
      issue_obj->>'issue' AS cause,
      count(*) AS cnt
    FROM compliance_reports cr
    JOIN content_submissions cs ON cs.id = cr.content_id
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(cr.issues) = 'array' THEN cr.issues ELSE '[]'::jsonb END
    ) AS issue_obj
    WHERE cs.company_id = p_company_id
      AND (p_user_id IS NULL OR cs.user_id = p_user_id)
      AND (p_jurisdiction IS NULL OR cs.jurisdiction = p_jurisdiction)
      AND cr.created_at >= (current_date - (p_days + 1)) -- buffer for timezone
      AND (issue_obj->>'issue') = ANY(v_top_causes)
    GROUP BY 1, 2
  ),
  cross_joined AS (
    SELECT d.day, c.cause
    FROM days d
    CROSS JOIN (SELECT unnest(v_top_causes) AS cause) c
  ),
  final_rows AS (
    SELECT
      cj.day,
      cj.cause,
      COALESCE(ds.cnt, 0) AS cnt
    FROM cross_joined cj
    LEFT JOIN daily_stats ds ON ds.day = cj.day AND ds.cause = cj.cause
  ),
  json_chunks AS (
    SELECT
      day,
      jsonb_object_agg(cause, cnt) AS metrics
    FROM final_rows
    GROUP BY day
  )
  SELECT jsonb_agg(
    jsonb_build_object('day', day) || metrics
    ORDER BY day
  ) INTO v_result
  FROM json_chunks;

  RETURN v_result;
END;
$$;
