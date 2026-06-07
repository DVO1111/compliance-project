-- SON Compliance Tracker tables
-- Standards Organisation of Nigeria: MAN CAP applications, audits, certificates

-- MAN CAP applications
CREATE TABLE IF NOT EXISTS son_mancap_applications (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  product_name        text NOT NULL,
  nis_standard        text NOT NULL,
  application_date    date NOT NULL,
  status              text NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','submitted','under_review','inspection_scheduled','approved','rejected','expired')),
  reference_number    text,
  certificate_number  text,
  certificate_expiry  date,
  notes               text,
  created_by          uuid REFERENCES auth.users(id),
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

ALTER TABLE son_mancap_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company members can manage mancap applications"
  ON son_mancap_applications FOR ALL
  USING (company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
  ));

-- SON audits
CREATE TABLE IF NOT EXISTS son_audits (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  audit_type          text NOT NULL DEFAULT 'quarterly'
                        CHECK (audit_type IN ('quarterly','annual','special')),
  scheduled_date      date NOT NULL,
  status              text NOT NULL DEFAULT 'scheduled'
                        CHECK (status IN ('scheduled','completed','passed','failed','pending_corrective_action')),
  auditor_name        text,
  findings            text,
  corrective_actions  text,
  created_by          uuid REFERENCES auth.users(id),
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

ALTER TABLE son_audits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company members can manage son audits"
  ON son_audits FOR ALL
  USING (company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
  ));

-- SON certificates
CREATE TABLE IF NOT EXISTS son_certificates (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  certificate_type    text NOT NULL DEFAULT 'man_cap'
                        CHECK (certificate_type IN ('man_cap','nis_conformity','son_approval')),
  certificate_number  text NOT NULL,
  product_name        text NOT NULL,
  nis_standard        text NOT NULL,
  issue_date          date NOT NULL,
  expiry_date         date NOT NULL,
  certificate_url     text,
  notes               text,
  created_by          uuid REFERENCES auth.users(id),
  created_at          timestamptz DEFAULT now()
);

ALTER TABLE son_certificates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company members can manage son certificates"
  ON son_certificates FOR ALL
  USING (company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
  ));

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_son_mancap_company   ON son_mancap_applications(company_id);
CREATE INDEX IF NOT EXISTS idx_son_audits_company   ON son_audits(company_id);
CREATE INDEX IF NOT EXISTS idx_son_certs_company    ON son_certificates(company_id);
CREATE INDEX IF NOT EXISTS idx_son_certs_expiry     ON son_certificates(expiry_date);
