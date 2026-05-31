-- supabase/migrations/20260306200000_ai_usage_logging.sql
-- Phase 6 Sprint 2: AI Usage Logging

-- Create AI Usage Logs table
CREATE TABLE IF NOT EXISTS public.ai_usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    ai_asset_id UUID REFERENCES public.ai_assets(id) ON DELETE SET NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    provider_name TEXT NOT NULL,
    model_name TEXT NOT NULL,
    input_summary TEXT,
    output_summary TEXT,
    risk_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
    performance JSONB NOT NULL DEFAULT '{}'::jsonb,
    review_status TEXT NOT NULL DEFAULT 'not_reviewed' CHECK (review_status IN ('not_reviewed', 'flagged', 'approved', 'rejected')),
    source TEXT NOT NULL DEFAULT 'llm_gateway',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_company_id ON public.ai_usage_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_company_asset ON public.ai_usage_logs(company_id, ai_asset_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_company_created ON public.ai_usage_logs(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_provider ON public.ai_usage_logs(provider_name);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_model ON public.ai_usage_logs(model_name);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_review_status ON public.ai_usage_logs(review_status);

-- RLS Policies

-- 1. Standard read policy for compliance/admin/executive
CREATE POLICY "Governance roles can view company AI usage logs" 
    ON public.ai_usage_logs
    FOR SELECT
    USING (
        company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
        AND (
            EXISTS (
                SELECT 1 FROM public.profiles 
                WHERE id = auth.uid() 
                AND role IN ('compliance_officer', 'administrator', 'executive')
            )
        )
    );

-- 2. Service-side insert (handled via edge function with service role or authenticated if needed)
-- Since llm-gateway runs under service role, it bypasses RLS, but we allow authenticated inserts for platform safety
CREATE POLICY "Authenticated users can insert usage logs"
    ON public.ai_usage_logs
    FOR INSERT
    WITH CHECK (
        company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    );

-- 3. Update policy for reviews
CREATE POLICY "Governance roles can update review status"
    ON public.ai_usage_logs
    FOR UPDATE
    USING (
        company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
        AND (
            EXISTS (
                SELECT 1 FROM public.profiles 
                WHERE id = auth.uid() 
                AND role IN ('compliance_officer', 'administrator')
            )
        )
    )
    WITH CHECK (
        company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    );

-- Seed metadata for retention framework if applicable
-- (Assuming the retention framework tracks table names)
COMMENT ON TABLE public.ai_usage_logs IS 'Audit trail for AI asset usage and model invocations across the platform.';
