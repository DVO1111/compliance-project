-- ============================================================
-- Regulatory Affairs Module
-- ============================================================
-- Covers three builds for the Bahvu/NASCO meeting:
--   1. regulatory_submissions  — NAPAMS application tracking
--   2. submission_status_log   — status change history
--   3. regulatory_licences     — structured NAFDAC/SON certificates
-- ============================================================

-- ── NAPAMS Application Tracker ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.regulatory_submissions (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  product_name        text        NOT NULL,
  product_category    text        NOT NULL
    CHECK (product_category IN (
      'food','drug_pharmaceutical','cosmetic',
      'medical_device','veterinary','biologic_vaccine',
      'agro_chemical','other'
    )),
  submission_type     text        NOT NULL
    CHECK (submission_type IN ('local_manufacture','importation','export')),
  regulatory_body     text        NOT NULL
    CHECK (regulatory_body IN ('nafdac','son','nafdac_son','ministry_of_health')),
  napams_reference    text,
  current_status      text        NOT NULL DEFAULT 'draft'
    CHECK (current_status IN (
      'draft','submitted','division_review','inspection_scheduled',
      'inspection_completed','lab_testing','fdrc_committee',
      'approved','rejected','compliance_directive','withdrawn'
    )),
  -- JSONB stores per-document check status keyed by document name:
  -- { "Power of Attorney": { "is_present": true, "notes": "...", "file_url": "..." } }
  document_checklist  jsonb       NOT NULL DEFAULT '{}',
  submitted_date      date,
  approved_date       date,
  registration_number text,
  expiry_date         date,
  notes               text,
  created_by          uuid        REFERENCES auth.users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS regulatory_submissions_company_idx
  ON public.regulatory_submissions (company_id);
CREATE INDEX IF NOT EXISTS regulatory_submissions_status_idx
  ON public.regulatory_submissions (company_id, current_status);

-- ── Status change history ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.submission_status_log (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid        NOT NULL REFERENCES public.regulatory_submissions(id) ON DELETE CASCADE,
  from_status   text,
  to_status     text        NOT NULL,
  notes         text,
  updated_by    uuid        REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS submission_status_log_submission_idx
  ON public.submission_status_log (submission_id);

-- ── Structured NAFDAC / SON certificate records ───────────────
CREATE TABLE IF NOT EXISTS public.regulatory_licences (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  licence_type        text        NOT NULL
    CHECK (licence_type IN (
      'nafdac_product_registration',
      'nafdac_site_manufacturing_licence',
      'nafdac_gmp_certificate',
      'nafdac_import_permit',
      'son_mancap_approval',
      'son_nis_certification',
      'ministry_health_licence',
      'other'
    )),
  name                text        NOT NULL,
  product_name        text,
  registration_number text,
  regulatory_body     text        NOT NULL DEFAULT 'nafdac',
  issue_date          date,
  expiry_date         date,
  renewal_lead_days   integer     NOT NULL DEFAULT 90,
  file_name           text,
  file_url            text,
  -- Links back to the submission that generated this licence (nullable)
  submission_id       uuid        REFERENCES public.regulatory_submissions(id) ON DELETE SET NULL,
  notes               text,
  created_by          uuid        REFERENCES auth.users(id),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS regulatory_licences_company_idx
  ON public.regulatory_licences (company_id);
CREATE INDEX IF NOT EXISTS regulatory_licences_expiry_idx
  ON public.regulatory_licences (company_id, expiry_date);

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE public.regulatory_submissions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submission_status_log   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.regulatory_licences     ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can manage regulatory submissions"
  ON public.regulatory_submissions FOR ALL TO authenticated
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Company members can manage submission status log"
  ON public.submission_status_log FOR ALL TO authenticated
  USING (
    submission_id IN (
      SELECT id FROM public.regulatory_submissions
      WHERE company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    )
  )
  WITH CHECK (
    submission_id IN (
      SELECT id FROM public.regulatory_submissions
      WHERE company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "Company members can manage regulatory licences"
  ON public.regulatory_licences FOR ALL TO authenticated
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
