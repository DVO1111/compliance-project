-- AI Policy Writing & Editing Assistant Infrastructure
-- Tables for RAG-based policy generation

CREATE TABLE IF NOT EXISTS policy_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('pharma', 'medical_devices', 'general', 'privacy', 'clinical_trials')),
  base_content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS policy_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source_circular_id UUID REFERENCES regulatory_circulars(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'approved')),
  version INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS Policies
ALTER TABLE policy_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read templates"
  ON policy_templates FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can manage own drafts"
  ON policy_drafts FOR ALL TO authenticated
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

-- Seed Initial Templates
INSERT INTO policy_templates (title, category, base_content) VALUES
('Standard Telehealth Privacy Policy', 'privacy', '## Telehealth Privacy Policy Template\n\n1. **Data Collection**: We collect patient health information for the purpose of virtual consultations...\n2. **Security**: Data is encrypted in transit and at rest using AES-256...\n3. **Patient Rights**: Patients may request access to their records at any time...'),
('Pharmaceutical Marketing Ethics Code', 'pharma', '## Pharmaceutical Marketing Ethics\n\n1. **Accuracy**: All marketing materials must be substantiated by clinical evidence...\n2. **Transparency**: Disclose all safety information and contraindications...\n3. **Professionalism**: Interactions with healthcare providers must be based on scientific information...'),
('Clinical Trial Consent Framework', 'clinical_trials', '## Participant Informed Consent Policy\n\n1. **Voluntary Participation**: No participant shall be coerced into joining a trial...\n2. **Right to Withdraw**: Participants can leave at any time without penalty...\n3. **Benefit vs Risk**: A clear summary of potential side effects must be provided...');
