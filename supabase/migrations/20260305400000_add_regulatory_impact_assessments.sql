-- Migration: Add Regulatory Impact Assessments
-- Supporting AI-driven policy update recommendations

CREATE TABLE IF NOT EXISTS regulatory_impact_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, -- Mapping to organizations as seen in enterprise hierarchy
  update_id UUID NOT NULL REFERENCES regulation_updates(id) ON DELETE CASCADE,
  content_id UUID NOT NULL REFERENCES content_submissions(id) ON DELETE CASCADE,
  
  impact_level TEXT NOT NULL CHECK (impact_level IN ('low', 'medium', 'high', 'critical')),
  reason TEXT NOT NULL,
  suggested_change TEXT NOT NULL,
  original_content TEXT, -- Snapshot of content when assessment was made
  
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'dismissed', 'needs_review')),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE regulatory_impact_assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view impact assessments for their org"
  ON regulatory_impact_assessments FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "System can manage impact assessments"
  ON regulatory_impact_assessments FOR ALL
  TO authenticated
  USING (
    company_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Indexing
CREATE INDEX IF NOT EXISTS idx_reg_impact_org ON regulatory_impact_assessments(company_id);
CREATE INDEX IF NOT EXISTS idx_reg_impact_update ON regulatory_impact_assessments(update_id);
CREATE INDEX IF NOT EXISTS idx_reg_impact_content ON regulatory_impact_assessments(content_id);
CREATE INDEX IF NOT EXISTS idx_reg_impact_status ON regulatory_impact_assessments(status);
