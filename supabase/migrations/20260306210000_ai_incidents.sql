-- Phase 6 - Sprint 3: AI Incidents + Escalations Schema

-- ══════════════════════════════════════════════════════════════
-- 1. Create AI Incidents Table
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.ai_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  ai_asset_id uuid REFERENCES public.ai_assets(id) ON DELETE SET NULL,
  usage_log_id uuid REFERENCES public.ai_usage_logs(id) ON DELETE SET NULL,
  incident_type text NOT NULL CHECK (
    incident_type IN (
      'hallucination',
      'bias',
      'privacy_leak',
      'forbidden_output',
      'unsafe_recommendation',
      'policy_violation',
      'model_misuse',
      'other'
    )
  ),
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'escalated', 'resolved', 'dismissed')),
  linked_risk_id uuid REFERENCES public.risks(id) ON DELETE SET NULL,
  linked_policy_id uuid, -- Soft link to public.policies(id)
  title text NOT NULL,
  description text,
  reported_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'usage_review', 'system_rule', 'llm_analysis')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

-- ══════════════════════════════════════════════════════════════
-- 2. Indexes
-- ══════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_ai_incidents_company ON public.ai_incidents(company_id);
CREATE INDEX IF NOT EXISTS idx_ai_incidents_asset ON public.ai_incidents(company_id, ai_asset_id);
CREATE INDEX IF NOT EXISTS idx_ai_incidents_usage_log ON public.ai_incidents(company_id, usage_log_id);
CREATE INDEX IF NOT EXISTS idx_ai_incidents_status ON public.ai_incidents(company_id, status);
CREATE INDEX IF NOT EXISTS idx_ai_incidents_severity ON public.ai_incidents(company_id, severity);
CREATE INDEX IF NOT EXISTS idx_ai_incidents_created ON public.ai_incidents(company_id, created_at DESC);

-- ══════════════════════════════════════════════════════════════
-- 3. Row Level Security
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.ai_incidents ENABLE ROW LEVEL SECURITY;

-- Select Policy: View incidents for your company
CREATE POLICY ai_incidents_select ON public.ai_incidents
  FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- Manage Policy: Create/Update/Delete for privileged roles
CREATE POLICY ai_incidents_manage ON public.ai_incidents
  FOR ALL TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles 
      WHERE id = auth.uid() AND role IN ('admin', 'administrator', 'compliance', 'compliance_officer', 'executive')
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.profiles 
      WHERE id = auth.uid() AND role IN ('admin', 'administrator', 'compliance', 'compliance_officer', 'executive')
    )
  );

-- Insert Policy for Standard Users: Allow reporting incidents for own company
CREATE POLICY ai_incidents_report ON public.ai_incidents
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
    AND source = 'manual'
  );

-- ══════════════════════════════════════════════════════════════
-- 4. Triggers
-- ══════════════════════════════════════════════════════════════

CREATE TRIGGER trg_ai_incidents_updated_at
  BEFORE UPDATE ON public.ai_incidents
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
