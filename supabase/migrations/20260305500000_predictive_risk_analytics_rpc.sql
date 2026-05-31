-- Migration: Predictive Risk Analytics RPCs
-- Supporting Heatmap and Early Warning System

-- 1. get_risk_heatmap_data
-- Aggregates predictive risk scores by platform and therapeutic area
CREATE OR REPLACE FUNCTION get_risk_heatmap_data(p_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_agg(r) INTO v_result
  FROM (
    SELECT 
      platform,
      therapeutic_area,
      ROUND(AVG(predicted_risk)) as avg_risk,
      COUNT(*) as sample_size,
      MAX(risk_grade) as max_grade
    FROM risk_predictions
    WHERE company_id = p_company_id
    GROUP BY platform, therapeutic_area
  ) r;
  
  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- 2. get_risk_velocity
-- Detects rapid increases in risk profiles or high-density risk clusters
CREATE OR REPLACE FUNCTION get_risk_velocity(p_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
BEGIN
  -- Simple velocity: high risk predictions in the last 7 days vs previous period
  -- In a real scenario, this would use time-series window functions
  SELECT jsonb_agg(r) INTO v_result
  FROM (
    SELECT 
      'critical_cluster' as alert_type,
      platform,
      therapeutic_area,
      COUNT(*) as count,
      'High density of critical risk predictions detected in this quadrant.' as message
    FROM risk_predictions
    WHERE company_id = p_company_id
      AND created_at > now() - interval '7 days'
      AND predicted_risk > 70
    GROUP BY platform, therapeutic_area
    HAVING COUNT(*) >= 3
  ) r;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;
