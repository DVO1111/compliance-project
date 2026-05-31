-- Migration: 20260309000000_external_evidence.sql
-- Description: External Evidence Ingestion Infrastructure

-- 1. Extend platform CHECK constraint safely
ALTER TABLE public.content_submissions 
DROP CONSTRAINT IF EXISTS content_submissions_platform_check;

ALTER TABLE public.content_submissions 
ADD CONSTRAINT content_submissions_platform_check 
CHECK (platform IN (
    'instagram', 'x', 'website', 'linkedin', 'print', 'radio', 
    'automation', 'external_evidence'
));

-- 2. External Evidence Ingestions (Provenance tracking)
CREATE TABLE public.external_evidence_ingestions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    source_name TEXT NOT NULL,
    source_type TEXT NOT NULL CHECK (source_type IN ('api','webhook','import','integration')),
    status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received','processed','failed')),
    submission_id UUID REFERENCES public.content_submissions(id) ON DELETE SET NULL,
    related_control_id UUID REFERENCES public.grc_controls(id) ON DELETE SET NULL,
    related_audit_request_id UUID REFERENCES public.audit_requests(id) ON DELETE SET NULL,
    requested_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonB,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at TIMESTAMPTZ
);

-- Indexes for performance
CREATE INDEX idx_evidence_ingestions_company ON public.external_evidence_ingestions(company_id);
CREATE INDEX idx_evidence_ingestions_status ON public.external_evidence_ingestions(status);
CREATE INDEX idx_evidence_ingestions_created ON public.external_evidence_ingestions(created_at DESC);
CREATE INDEX idx_evidence_ingestions_submission ON public.external_evidence_ingestions(submission_id);
CREATE INDEX idx_evidence_ingestions_control ON public.external_evidence_ingestions(related_control_id);
CREATE INDEX idx_evidence_ingestions_audit ON public.external_evidence_ingestions(related_audit_request_id);

-- RLS
ALTER TABLE public.external_evidence_ingestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their company's evidence ingestions"
    ON public.external_evidence_ingestions FOR SELECT
    USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- Ingestions are typically server-side but we allow select for dashboard visibility
-- Insert/Update/Delete managed via service layer (service_role) or restricted by app logic
