-- Sprint 4: Vendor Risk Management (VRM)
-- Tables: vendors, vendor_risk_profiles, vendor_documents, vendor_questionnaires
-- All company-scoped with RLS

-- ─── PART A: Vendor Inventory ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vendors (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name          text NOT NULL,
  category      text NOT NULL DEFAULT 'cloud'   CHECK (category IN ('cloud','payment','marketing','legal')),
  risk_level    text NOT NULL DEFAULT 'medium'   CHECK (risk_level IN ('low','medium','high','critical')),
  status        text NOT NULL DEFAULT 'active'   CHECK (status IN ('active','archived')),
  website       text,
  primary_contact text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendors_company ON vendors(company_id);

ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;

CREATE POLICY vendors_select ON vendors FOR SELECT
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY vendors_insert ON vendors FOR INSERT
  WITH CHECK (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY vendors_update ON vendors FOR UPDATE
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY vendors_delete ON vendors FOR DELETE
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));


-- ─── PART B: Vendor Risk Profiles ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vendor_risk_profiles (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id             uuid NOT NULL UNIQUE REFERENCES vendors(id) ON DELETE CASCADE,
  risk_score            integer NOT NULL DEFAULT 0,
  risk_tier             text NOT NULL DEFAULT 'medium' CHECK (risk_tier IN ('low','medium','high','critical')),
  data_access_level     text NOT NULL DEFAULT 'none'   CHECK (data_access_level IN ('none','limited','moderate','full')),
  security_review_status text NOT NULL DEFAULT 'pending' CHECK (security_review_status IN ('pending','in_progress','completed','overdue')),
  last_review_date      timestamptz,
  next_review_date      timestamptz
);

CREATE INDEX IF NOT EXISTS idx_vrp_vendor ON vendor_risk_profiles(vendor_id);

ALTER TABLE vendor_risk_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY vrp_select ON vendor_risk_profiles FOR SELECT
  USING (vendor_id IN (SELECT id FROM vendors WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())));

CREATE POLICY vrp_insert ON vendor_risk_profiles FOR INSERT
  WITH CHECK (vendor_id IN (SELECT id FROM vendors WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())));

CREATE POLICY vrp_update ON vendor_risk_profiles FOR UPDATE
  USING (vendor_id IN (SELECT id FROM vendors WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())));

CREATE POLICY vrp_delete ON vendor_risk_profiles FOR DELETE
  USING (vendor_id IN (SELECT id FROM vendors WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())));


-- ─── PART C: Vendor Documents (links to content_submissions / Archive) ───────

CREATE TABLE IF NOT EXISTS vendor_documents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id       uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  submission_id   uuid NOT NULL REFERENCES content_submissions(id) ON DELETE CASCADE,
  document_type   text NOT NULL DEFAULT 'other' CHECK (document_type IN ('soc2','iso27001','pentest','dpa','nda','insurance','other')),
  uploaded_by     uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(vendor_id, submission_id)
);

CREATE INDEX IF NOT EXISTS idx_vdoc_vendor ON vendor_documents(vendor_id);

ALTER TABLE vendor_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY vdoc_select ON vendor_documents FOR SELECT
  USING (vendor_id IN (SELECT id FROM vendors WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())));

CREATE POLICY vdoc_insert ON vendor_documents FOR INSERT
  WITH CHECK (vendor_id IN (SELECT id FROM vendors WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())));

CREATE POLICY vdoc_delete ON vendor_documents FOR DELETE
  USING (vendor_id IN (SELECT id FROM vendors WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())));


-- ─── PART D: Vendor Questionnaires ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vendor_questionnaires (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id           uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  questionnaire_type  text NOT NULL DEFAULT 'general' CHECK (questionnaire_type IN ('security','privacy','compliance','general')),
  status              text NOT NULL DEFAULT 'draft'   CHECK (status IN ('draft','sent','in_progress','completed','overdue')),
  sent_at             timestamptz,
  completed_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vq_vendor ON vendor_questionnaires(vendor_id);

ALTER TABLE vendor_questionnaires ENABLE ROW LEVEL SECURITY;

CREATE POLICY vq_select ON vendor_questionnaires FOR SELECT
  USING (vendor_id IN (SELECT id FROM vendors WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())));

CREATE POLICY vq_insert ON vendor_questionnaires FOR INSERT
  WITH CHECK (vendor_id IN (SELECT id FROM vendors WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())));

CREATE POLICY vq_update ON vendor_questionnaires FOR UPDATE
  USING (vendor_id IN (SELECT id FROM vendors WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())));

CREATE POLICY vq_delete ON vendor_questionnaires FOR DELETE
  USING (vendor_id IN (SELECT id FROM vendors WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())));
