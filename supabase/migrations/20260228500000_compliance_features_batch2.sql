-- 6 New Compliance Features: 12 tables
-- Social Listening, Website Monitoring, Vendor Scorecard, CAPA, Training Sim, NLP Claims

-- ═══════════════════════════════════════════════════════
-- 1. SOCIAL MEDIA LISTENING
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS social_monitoring_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  product TEXT,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('keyword','hashtag','mention','influencer')),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE social_monitoring_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "social_rules_company" ON social_monitoring_rules
  FOR ALL USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE TABLE IF NOT EXISTS social_mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  author TEXT NOT NULL,
  author_type TEXT NOT NULL CHECK (author_type IN ('employee','agency','hcp','patient','influencer','unknown')),
  content TEXT NOT NULL,
  url TEXT,
  flag_type TEXT CHECK (flag_type IN ('off_label','undisclosed_sponsorship','misleading_claim','adverse_event','compliant',NULL)),
  severity TEXT DEFAULT 'low' CHECK (severity IN ('low','medium','high','critical')),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','reviewing','escalated','resolved','dismissed')),
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
ALTER TABLE social_mentions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "social_mentions_company" ON social_mentions
  FOR ALL USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

-- ═══════════════════════════════════════════════════════
-- 2. WEBSITE & LANDING PAGE MONITORING
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS monitored_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  page_url TEXT NOT NULL,
  page_title TEXT NOT NULL,
  approved_content_hash TEXT,
  last_crawled_at TIMESTAMPTZ,
  crawl_frequency TEXT DEFAULT 'daily' CHECK (crawl_frequency IN ('hourly','daily','weekly')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE monitored_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "monitored_pages_company" ON monitored_pages
  FOR ALL USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE TABLE IF NOT EXISTS page_compliance_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID NOT NULL REFERENCES monitored_pages(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('content_drift','label_update','expired_claim','unauthorized_change','regulatory_change')),
  description TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE page_compliance_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "page_alerts_company" ON page_compliance_alerts
  FOR ALL USING (page_id IN (SELECT id FROM monitored_pages WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())));

-- ═══════════════════════════════════════════════════════
-- 3. VENDOR SCORECARD
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS vendor_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  vendor_name TEXT NOT NULL,
  vendor_type TEXT NOT NULL CHECK (vendor_type IN ('agency','cro','consultancy','technology','other')),
  contact_email TEXT,
  compliance_certified BOOLEAN DEFAULT false,
  certification_expiry TIMESTAMPTZ,
  risk_tier TEXT DEFAULT 'medium' CHECK (risk_tier IN ('low','medium','high','critical')),
  overall_score INT DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE vendor_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vendor_profiles_company" ON vendor_profiles
  FOR ALL USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE TABLE IF NOT EXISTS vendor_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES vendor_profiles(id) ON DELETE CASCADE,
  audit_type TEXT NOT NULL CHECK (audit_type IN ('initial','periodic','for_cause','follow_up')),
  findings TEXT,
  score INT DEFAULT 0,
  auditor TEXT NOT NULL,
  audit_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  next_audit_due TIMESTAMPTZ
);
ALTER TABLE vendor_audits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vendor_audits_company" ON vendor_audits
  FOR ALL USING (vendor_id IN (SELECT id FROM vendor_profiles WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())));

-- ═══════════════════════════════════════════════════════
-- 4. CAPA MANAGEMENT
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS capa_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  capa_number TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('audit_finding','compliance_failure','near_miss','customer_complaint','regulatory_action','internal_review')),
  capa_type TEXT NOT NULL CHECK (capa_type IN ('corrective','preventive','both')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','investigating','action_planned','in_progress','verification','closed','overdue')),
  root_cause TEXT,
  due_date TIMESTAMPTZ,
  owner_name TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);
ALTER TABLE capa_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "capa_records_company" ON capa_records
  FOR ALL USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE TABLE IF NOT EXISTS capa_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  capa_id UUID NOT NULL REFERENCES capa_records(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN ('investigation','corrective_action','preventive_action','verification','closure')),
  description TEXT NOT NULL,
  assigned_to TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','overdue')),
  due_date TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE capa_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "capa_actions_company" ON capa_actions
  FOR ALL USING (capa_id IN (SELECT id FROM capa_records WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())));

-- ═══════════════════════════════════════════════════════
-- 5. SIMULATION TRAINING
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS training_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  scenario_type TEXT NOT NULL CHECK (scenario_type IN ('off_label_question','misleading_claim','unsubstantiated_superlative','adverse_event_report','social_media_post','agency_review')),
  difficulty TEXT NOT NULL DEFAULT 'intermediate' CHECK (difficulty IN ('beginner','intermediate','advanced')),
  scenario_text TEXT NOT NULL,
  correct_response TEXT NOT NULL,
  explanation TEXT NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE training_scenarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "training_scenarios_company" ON training_scenarios
  FOR ALL USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE TABLE IF NOT EXISTS scenario_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id UUID NOT NULL REFERENCES training_scenarios(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  user_response TEXT NOT NULL,
  score INT NOT NULL DEFAULT 0,
  passed BOOLEAN DEFAULT false,
  feedback TEXT,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE scenario_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scenario_attempts_company" ON scenario_attempts
  FOR ALL USING (scenario_id IN (SELECT id FROM training_scenarios WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())));

-- ═══════════════════════════════════════════════════════
-- 6. NLP CLAIM EXTRACTION
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS extracted_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  source_document TEXT NOT NULL,
  claim_text TEXT NOT NULL,
  claim_type TEXT NOT NULL CHECK (claim_type IN ('efficacy','safety','comparative','economic','mechanism','general')),
  confidence FLOAT DEFAULT 0,
  has_evidence BOOLEAN DEFAULT false,
  status TEXT NOT NULL DEFAULT 'unreviewed' CHECK (status IN ('unreviewed','approved','rejected','needs_evidence')),
  extracted_by UUID REFERENCES auth.users(id),
  extracted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE extracted_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY "extracted_claims_company" ON extracted_claims
  FOR ALL USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE TABLE IF NOT EXISTS claim_evidence_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL REFERENCES extracted_claims(id) ON DELETE CASCADE,
  evidence_type TEXT NOT NULL CHECK (evidence_type IN ('clinical_trial','meta_analysis','real_world_data','label_reference','guideline','expert_opinion')),
  reference_title TEXT NOT NULL,
  reference_url TEXT,
  strength TEXT DEFAULT 'moderate' CHECK (strength IN ('strong','moderate','weak')),
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE claim_evidence_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "claim_evidence_company" ON claim_evidence_links
  FOR ALL USING (claim_id IN (SELECT id FROM extracted_claims WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())));
