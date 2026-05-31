-- Phase 6 - Sprint 4: AI Controls + Approvals Schema

-- ══════════════════════════════════════════════════════════════
-- 1. Create AI Prompt Templates Table
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.ai_prompt_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  ai_asset_id uuid REFERENCES public.ai_assets(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  prompt_text text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_review', 'approved', 'rejected', 'retired')),
  version integer NOT NULL DEFAULT 1,
  owner_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_prompt_templates_company ON public.ai_prompt_templates(company_id);
CREATE INDEX IF NOT EXISTS idx_ai_prompt_templates_status ON public.ai_prompt_templates(company_id, status);
CREATE INDEX IF NOT EXISTS idx_ai_prompt_templates_asset ON public.ai_prompt_templates(ai_asset_id);

-- ══════════════════════════════════════════════════════════════
-- 2. Create AI Output Reviews Table (HITL)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.ai_output_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  usage_log_id uuid NOT NULL REFERENCES public.ai_usage_logs(id) ON DELETE CASCADE,
  ai_asset_id uuid REFERENCES public.ai_assets(id) ON DELETE SET NULL,
  review_type text NOT NULL CHECK (review_type IN ('hitl', 'policy_check', 'quality_check', 'safety_check')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'escalated')),
  reviewer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  decision_notes text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_ai_output_reviews_company ON public.ai_output_reviews(company_id);
CREATE INDEX IF NOT EXISTS idx_ai_output_reviews_usage ON public.ai_output_reviews(company_id, usage_log_id);
CREATE INDEX IF NOT EXISTS idx_ai_output_reviews_status ON public.ai_output_reviews(company_id, status);
CREATE INDEX IF NOT EXISTS idx_ai_output_reviews_asset ON public.ai_output_reviews(company_id, ai_asset_id);

-- ══════════════════════════════════════════════════════════════
-- 3. Row Level Security
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.ai_prompt_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_output_reviews ENABLE ROW LEVEL SECURITY;

-- Prompt Templates: Company Scoping
CREATE POLICY ai_prompt_templates_select ON public.ai_prompt_templates
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY ai_prompt_templates_manage ON public.ai_prompt_templates
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

CREATE POLICY ai_prompt_templates_create ON public.ai_prompt_templates
  FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- Output Reviews: Company Scoping
CREATE POLICY ai_output_reviews_select ON public.ai_output_reviews
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY ai_output_reviews_manage ON public.ai_output_reviews
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

-- ══════════════════════════════════════════════════════════════
-- 4. Triggers
-- ══════════════════════════════════════════════════════════════

CREATE TRIGGER trg_ai_prompt_templates_updated_at
  BEFORE UPDATE ON public.ai_prompt_templates
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
