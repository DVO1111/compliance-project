-- Link CTD dossiers to regulatory submissions so that a pharma
-- NAPAMS application can reference the CTD dossier that underpins it.

ALTER TABLE regulatory_submissions
  ADD COLUMN IF NOT EXISTS dossier_id uuid REFERENCES ctd_dossiers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_reg_submissions_dossier_id
  ON regulatory_submissions(dossier_id)
  WHERE dossier_id IS NOT NULL;
