-- CTD Dossier Tracker
-- Common Technical Document preparation tracking for NAFDAC drug registration

CREATE TABLE IF NOT EXISTS ctd_dossiers (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id              uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  product_name            text NOT NULL,
  active_ingredient       text,
  dosage_form             text NOT NULL,
  strength                text,
  nafdac_number           text,
  application_type        text NOT NULL DEFAULT 'new_registration'
                            CHECK (application_type IN ('new_registration','renewal','variation','generic')),
  status                  text NOT NULL DEFAULT 'preparation'
                            CHECK (status IN ('preparation','screening','screening_cleared','under_review','approved','rejected','withdrawn')),
  target_submission_date  date,
  submission_date         date,
  screening_date          date,
  screening_clearance_date date,
  expected_approval_date  date,
  dossier_reference       text,
  notes                   text,
  created_by              uuid REFERENCES auth.users(id),
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now()
);

ALTER TABLE ctd_dossiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company members can manage ctd dossiers"
  ON ctd_dossiers FOR ALL
  USING (company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
  ));

-- One row per CTD module (1–5) per dossier
CREATE TABLE IF NOT EXISTS ctd_module_progress (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id       uuid NOT NULL REFERENCES ctd_dossiers(id) ON DELETE CASCADE,
  company_id       uuid NOT NULL,
  module_number    int  NOT NULL CHECK (module_number BETWEEN 1 AND 5),
  status           text NOT NULL DEFAULT 'not_started'
                     CHECK (status IN ('not_started','in_progress','complete','not_applicable')),
  completion_pct   int  NOT NULL DEFAULT 0 CHECK (completion_pct BETWEEN 0 AND 100),
  notes            text,
  updated_at       timestamptz DEFAULT now(),
  UNIQUE (dossier_id, module_number)
);

ALTER TABLE ctd_module_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company members can manage ctd module progress"
  ON ctd_module_progress FOR ALL
  USING (company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
  ));

-- Document-level checklist items seeded per dossier on creation
CREATE TABLE IF NOT EXISTS ctd_documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id    uuid NOT NULL REFERENCES ctd_dossiers(id) ON DELETE CASCADE,
  company_id    uuid NOT NULL,
  module_number int  NOT NULL CHECK (module_number BETWEEN 1 AND 5),
  document_name text NOT NULL,
  is_required   boolean NOT NULL DEFAULT true,
  status        text NOT NULL DEFAULT 'missing'
                  CHECK (status IN ('missing','draft','complete','not_applicable')),
  file_url      text,
  notes         text,
  updated_at    timestamptz DEFAULT now()
);

ALTER TABLE ctd_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company members can manage ctd documents"
  ON ctd_documents FOR ALL
  USING (company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
  ));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ctd_dossiers_company        ON ctd_dossiers(company_id);
CREATE INDEX IF NOT EXISTS idx_ctd_dossiers_status         ON ctd_dossiers(status);
CREATE INDEX IF NOT EXISTS idx_ctd_module_progress_dossier ON ctd_module_progress(dossier_id);
CREATE INDEX IF NOT EXISTS idx_ctd_documents_dossier       ON ctd_documents(dossier_id);
CREATE INDEX IF NOT EXISTS idx_ctd_dossiers_submission     ON ctd_dossiers(target_submission_date);
