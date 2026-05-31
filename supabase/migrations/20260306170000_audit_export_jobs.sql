-- ============================================================
-- Phase 5 Sprint 3: Audit Evidence Export Engine
-- Table: audit_export_jobs
-- ============================================================

CREATE TABLE IF NOT EXISTS public.audit_export_jobs (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  audit_session_id uuid        NOT NULL REFERENCES public.audit_sessions(id) ON DELETE CASCADE,
  requested_by     uuid        REFERENCES public.profiles(id),
  export_type      text        NOT NULL CHECK (export_type IN ('json_bundle','csv_bundle','print_view')),
  status           text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed')),
  file_url         text,
  metadata         jsonb       DEFAULT '{}'::jsonb,
  created_at       timestamptz DEFAULT now(),
  completed_at     timestamptz
);

CREATE INDEX IF NOT EXISTS idx_audit_export_jobs_company   ON public.audit_export_jobs(company_id);
CREATE INDEX IF NOT EXISTS idx_audit_export_jobs_session   ON public.audit_export_jobs(audit_session_id);
CREATE INDEX IF NOT EXISTS idx_audit_export_jobs_status    ON public.audit_export_jobs(status);

ALTER TABLE public.audit_export_jobs ENABLE ROW LEVEL SECURITY;

-- Company members (compliance/admin) can view all company export jobs
CREATE POLICY aej_company_select ON public.audit_export_jobs
  FOR SELECT TO authenticated
  USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

-- Auditors can view export jobs for sessions they participate in
CREATE POLICY aej_auditor_select ON public.audit_export_jobs
  FOR SELECT TO authenticated
  USING (
    audit_session_id IN (
      SELECT audit_session_id FROM public.audit_session_participants
      WHERE user_id = auth.uid()
    )
  );

-- Company admins/compliance can manage export jobs
CREATE POLICY aej_company_manage ON public.audit_export_jobs
  FOR ALL TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'compliance_officer', 'compliance', 'executive')
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'compliance_officer', 'compliance', 'executive')
    )
  );

-- Auditors can create export jobs for their sessions
CREATE POLICY aej_auditor_insert ON public.audit_export_jobs
  FOR INSERT TO authenticated
  WITH CHECK (
    audit_session_id IN (
      SELECT audit_session_id FROM public.audit_session_participants
      WHERE user_id = auth.uid()
    )
  );
