-- ═══════════════════════════════════════════════════════════════
-- Pharma Integrations — Sync Events, AE Reports, Label Changes
-- ═══════════════════════════════════════════════════════════════

-- Bidirectional sync event log
CREATE TABLE IF NOT EXISTS pharma_sync_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL,
  provider_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
  event_type TEXT NOT NULL,
  entity_type TEXT,          -- 'document', 'label', 'approval', 'annotation'
  entity_id TEXT,            -- external system ID
  payload JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed','skipped')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE pharma_sync_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pharma_sync_events_company" ON pharma_sync_events
  FOR ALL USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE INDEX idx_pharma_sync_company ON pharma_sync_events(company_id);
CREATE INDEX idx_pharma_sync_status ON pharma_sync_events(status);

-- Adverse event forwarding queue
CREATE TABLE IF NOT EXISTS pharma_ae_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  connection_id UUID,
  source_channel TEXT NOT NULL,       -- 'social_media', 'patient_support', 'field_report', 'digital_channel'
  product_name TEXT NOT NULL,
  event_description TEXT NOT NULL,
  reporter_type TEXT DEFAULT 'consumer',
  seriousness TEXT DEFAULT 'non_serious' CHECK (seriousness IN ('non_serious','serious','fatal')),
  patient_initials TEXT,
  meddra_pt TEXT,                     -- MedDRA preferred term
  date_of_onset DATE,
  forwarded_to_pv BOOLEAN DEFAULT FALSE,
  pv_case_id TEXT,                    -- case ID from PV system
  forwarded_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','forwarded','acknowledged','under_review','closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

ALTER TABLE pharma_ae_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pharma_ae_reports_company" ON pharma_ae_reports
  FOR ALL USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE INDEX idx_pharma_ae_company ON pharma_ae_reports(company_id);
CREATE INDEX idx_pharma_ae_status ON pharma_ae_reports(status);

-- Label change notifications and re-review triggers
CREATE TABLE IF NOT EXISTS pharma_label_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  connection_id UUID,
  product_name TEXT NOT NULL,
  label_version TEXT,
  change_type TEXT NOT NULL CHECK (change_type IN ('new_indication','safety_update','dosage_change','contraindication','black_box','general_update')),
  change_summary TEXT NOT NULL,
  source_system TEXT DEFAULT 'veeva_rim',
  affected_content_count INT DEFAULT 0,
  re_review_triggered BOOLEAN DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reviewing','completed','dismissed')),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE pharma_label_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pharma_label_changes_company" ON pharma_label_changes
  FOR ALL USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE INDEX idx_pharma_label_company ON pharma_label_changes(company_id);
CREATE INDEX idx_pharma_label_status ON pharma_label_changes(status);
