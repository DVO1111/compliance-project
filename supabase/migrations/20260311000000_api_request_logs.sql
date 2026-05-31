-- Migration: 20260311000000_api_request_logs.sql
-- Description: API Request Telemetry and Observability

-- ──────────────────────────────────────────────────────────────
-- 1. API REQUEST LOGS
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.api_request_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    api_key_id UUID REFERENCES public.api_keys(id) ON DELETE SET NULL,
    service_account_id UUID REFERENCES public.service_accounts(id) ON DELETE SET NULL,
    method TEXT NOT NULL,
    path TEXT NOT NULL,
    status_code INTEGER,
    request_id TEXT,
    source_ip TEXT,
    user_agent TEXT,
    latency_ms INTEGER,
    scopes_used TEXT[] NOT NULL DEFAULT '{}',
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_api_request_logs_company ON public.api_request_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_api_request_logs_key ON public.api_request_logs(api_key_id);
CREATE INDEX IF NOT EXISTS idx_api_request_logs_account ON public.api_request_logs(service_account_id);
CREATE INDEX IF NOT EXISTS idx_api_request_logs_path ON public.api_request_logs(path);
CREATE INDEX IF NOT EXISTS idx_api_request_logs_status ON public.api_request_logs(status_code);
CREATE INDEX IF NOT EXISTS idx_api_request_logs_created_at ON public.api_request_logs(created_at DESC);

-- ──────────────────────────────────────────────────────────────
-- 2. SECURITY (RLS)
-- ──────────────────────────────────────────────────────────────
ALTER TABLE public.api_request_logs ENABLE ROW LEVEL SECURITY;

-- Admins can view logs for their company
CREATE POLICY "Users can view their company's api request logs"
    ON public.api_request_logs FOR SELECT
    USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- Only service role (Edge Function) can insert
CREATE POLICY "Service role can insert api request logs"
    ON public.api_request_logs FOR INSERT
    WITH CHECK (true);

-- ──────────────────────────────────────────────────────────────
-- 3. PERMISSIONS MAPPING
-- ──────────────────────────────────────────────────────────────
-- conceptually, canViewEcosystem implies access to these logs.
