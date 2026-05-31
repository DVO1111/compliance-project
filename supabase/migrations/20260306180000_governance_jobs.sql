-- ============================================================
-- Phase 5 Sprint 4: Observability + Governance Job Control Plane
-- Table: governance_job_runs
-- ============================================================

CREATE TABLE IF NOT EXISTS public.governance_job_runs (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid        REFERENCES public.companies(id) ON DELETE CASCADE,
  job_type         text        NOT NULL,
  job_name         text        NOT NULL,
  source           text        NOT NULL CHECK (source IN ('cron','manual','system')),
  status           text        NOT NULL CHECK (status IN ('queued','running','completed','failed','cancelled')),
  started_at       timestamptz DEFAULT now(),
  completed_at     timestamptz,
  duration_ms      integer,
  triggered_by     uuid        REFERENCES public.profiles(id),
  related_entity_type text,
  related_entity_id   uuid,
  metadata         jsonb       DEFAULT '{}'::jsonb,
  error_message    text
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_gjr_company    ON public.governance_job_runs(company_id);
CREATE INDEX IF NOT EXISTS idx_gjr_job_type   ON public.governance_job_runs(job_type);
CREATE INDEX IF NOT EXISTS idx_gjr_status     ON public.governance_job_runs(status);
CREATE INDEX IF NOT EXISTS idx_gjr_started_at ON public.governance_job_runs(started_at DESC);

ALTER TABLE public.governance_job_runs ENABLE ROW LEVEL SECURITY;

-- Company admins/compliance can view runs for their company
CREATE POLICY gjr_company_select ON public.governance_job_runs
  FOR SELECT TO authenticated
  USING (
    company_id IS NULL OR 
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

-- Only service role / internal systems should insert/update logs
-- (In this MVP we allow authenticated for simplicity of service calls, 
-- but constrained by user role in the service layer)
CREATE POLICY gjr_admin_manage ON public.governance_job_runs
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role IN ('admin', 'compliance_officer', 'compliance', 'executive')
    )
  );
