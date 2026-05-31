-- Migration: Patient Consent Management
-- Tables for consent tracking, content-consent linking, and PHI scan results

-- Patient Consents
CREATE TABLE IF NOT EXISTS public.patient_consents (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL,
  patient_name text NOT NULL,
  patient_identifier_hash text,
  consent_type text NOT NULL CHECK (consent_type IN ('testimonial','case_study','ugc','imagery','video','general')),
  consent_status text NOT NULL DEFAULT 'active' CHECK (consent_status IN ('active','expired','revoked')),
  signed_at timestamptz,
  expires_at timestamptz,
  consent_document_url text,
  digital_signature_hash text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.patient_consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "patient_consents_company_access" ON public.patient_consents;
CREATE POLICY "patient_consents_company_access"
  ON public.patient_consents FOR ALL
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- Consent <-> Content Links
CREATE TABLE IF NOT EXISTS public.consent_content_links (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL,
  consent_id uuid NOT NULL REFERENCES public.patient_consents(id) ON DELETE CASCADE,
  content_id uuid NOT NULL REFERENCES public.content_submissions(id) ON DELETE CASCADE,
  linked_at timestamptz NOT NULL DEFAULT now(),
  linked_by uuid REFERENCES auth.users(id),
  UNIQUE(consent_id, content_id)
);

ALTER TABLE public.consent_content_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "consent_content_links_company_access" ON public.consent_content_links;
CREATE POLICY "consent_content_links_company_access"
  ON public.consent_content_links FOR ALL
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- PHI Scan Results
CREATE TABLE IF NOT EXISTS public.phi_scan_results (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL,
  content_id uuid REFERENCES public.content_submissions(id) ON DELETE SET NULL,
  scan_type text NOT NULL DEFAULT 'text' CHECK (scan_type IN ('text','image','video')),
  findings jsonb NOT NULL DEFAULT '[]'::jsonb,
  risk_level text NOT NULL DEFAULT 'none' CHECK (risk_level IN ('none','low','medium','high','critical')),
  scanned_at timestamptz NOT NULL DEFAULT now(),
  scanned_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.phi_scan_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "phi_scan_results_company_access" ON public.phi_scan_results;
CREATE POLICY "phi_scan_results_company_access"
  ON public.phi_scan_results FOR ALL
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
