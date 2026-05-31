-- Advanced Compliance Features: 10 new tables
-- Translation, Crisis, Whistleblower, Programmatic Ad, Predictive Risk

-- ═══════════════════════════════════════════════════════
-- 1. TRANSLATION COMPLIANCE
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS translation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  content_title TEXT NOT NULL,
  source_language TEXT NOT NULL DEFAULT 'en-US',
  target_language TEXT NOT NULL,
  target_market TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_translation','translated','re_review','approved','flagged')),
  translator TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE translation_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "translation_jobs_company" ON translation_jobs
  FOR ALL USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE TABLE IF NOT EXISTS translation_compliance_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES translation_jobs(id) ON DELETE CASCADE,
  original_claim TEXT NOT NULL,
  translated_claim TEXT NOT NULL,
  issue TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info','warning','critical')),
  rule TEXT,
  market TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE translation_compliance_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "translation_flags_company" ON translation_compliance_flags
  FOR ALL USING (job_id IN (SELECT id FROM translation_jobs WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())));

-- ═══════════════════════════════════════════════════════
-- 2. CRISIS RESPONSE
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS crisis_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  level TEXT NOT NULL DEFAULT 'alert' CHECK (level IN ('watch','alert','critical','recall')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','contained','resolved','closed')),
  product TEXT NOT NULL,
  affected_channels TEXT[] DEFAULT '{}',
  affected_content_count INT DEFAULT 0,
  withdrawn_count INT DEFAULT 0,
  triggered_by UUID REFERENCES auth.users(id),
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

ALTER TABLE crisis_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crisis_events_company" ON crisis_events
  FOR ALL USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE TABLE IF NOT EXISTS crisis_timeline_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crisis_id UUID NOT NULL REFERENCES crisis_events(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  performer TEXT NOT NULL,
  details TEXT,
  automated BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE crisis_timeline_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crisis_timeline_company" ON crisis_timeline_entries
  FOR ALL USING (crisis_id IN (SELECT id FROM crisis_events WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())));

CREATE TABLE IF NOT EXISTS crisis_affected_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crisis_id UUID NOT NULL REFERENCES crisis_events(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  channel TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'live' CHECK (status IN ('live','withdrawn','under_review')),
  withdrawn_at TIMESTAMPTZ
);

ALTER TABLE crisis_affected_materials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crisis_materials_company" ON crisis_affected_materials
  FOR ALL USING (crisis_id IN (SELECT id FROM crisis_events WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())));

-- ═══════════════════════════════════════════════════════
-- 3. WHISTLEBLOWER / INTERNAL REPORTING
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS whistleblower_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  case_number TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('off_label_promotion','misleading_claims','data_integrity','kickback_concern','safety_reporting_failure','other')),
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','under_investigation','escalated','resolved','dismissed')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical')),
  anonymous BOOLEAN DEFAULT true,
  submitted_by UUID REFERENCES auth.users(id),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE whistleblower_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "whistleblower_reports_company" ON whistleblower_reports
  FOR ALL USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE TABLE IF NOT EXISTS whistleblower_case_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES whistleblower_reports(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  note TEXT,
  performed_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE whistleblower_case_updates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "whistleblower_updates_company" ON whistleblower_case_updates
  FOR ALL USING (report_id IN (SELECT id FROM whistleblower_reports WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())));

-- ═══════════════════════════════════════════════════════
-- 4. PROGRAMMATIC AD COMPLIANCE
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ad_placements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  campaign_name TEXT NOT NULL,
  product TEXT NOT NULL,
  platform TEXT NOT NULL,
  placement_url TEXT,
  context TEXT,
  audience_segment TEXT,
  status TEXT NOT NULL DEFAULT 'monitoring' CHECK (status IN ('approved','flagged','pulled','monitoring')),
  violation TEXT,
  impressions INT DEFAULT 0,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE ad_placements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ad_placements_company" ON ad_placements
  FOR ALL USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE TABLE IF NOT EXISTS targeting_guardrails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  guardrail_type TEXT NOT NULL CHECK (guardrail_type IN ('audience_exclusion','context_exclusion','frequency_cap','geo_restriction')),
  active BOOLEAN DEFAULT true,
  violations INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE targeting_guardrails ENABLE ROW LEVEL SECURITY;
CREATE POLICY "targeting_guardrails_company" ON targeting_guardrails
  FOR ALL USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

-- ═══════════════════════════════════════════════════════
-- 5. PREDICTIVE RISK
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS risk_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title TEXT,
  platform TEXT NOT NULL,
  therapeutic_area TEXT NOT NULL,
  target_market TEXT NOT NULL,
  claim_types TEXT[] DEFAULT '{}',
  audience_type TEXT DEFAULT 'general',
  predicted_risk INT NOT NULL,
  confidence INT NOT NULL,
  risk_grade TEXT NOT NULL,
  recommendation TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE risk_predictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "risk_predictions_company" ON risk_predictions
  FOR ALL USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));
