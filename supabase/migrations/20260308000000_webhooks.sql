-- Migration: 20260308000000_webhooks.sql
-- Description: Outbound Webhook Infrastructure

-- ──────────────────────────────────────────────────────────────
-- 1. WEBHOOK ENDPOINTS
-- ──────────────────────────────────────────────────────────────
CREATE TABLE public.webhook_endpoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    target_url TEXT NOT NULL,
    signing_secret_encrypted TEXT NOT NULL,
    secret_prefix TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_webhook_endpoints_company_id ON public.webhook_endpoints(company_id);
CREATE INDEX idx_webhook_endpoints_enabled ON public.webhook_endpoints(enabled);

-- RLS
ALTER TABLE public.webhook_endpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their company's webhook endpoints"
    ON public.webhook_endpoints FOR SELECT
    USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Admins can manage their company's webhook endpoints"
    ON public.webhook_endpoints FOR ALL
    USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
    WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- ──────────────────────────────────────────────────────────────
-- 2. WEBHOOK SUBSCRIPTIONS
-- ──────────────────────────────────────────────────────────────
CREATE TABLE public.webhook_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    endpoint_id UUID NOT NULL REFERENCES public.webhook_endpoints(id) ON DELETE CASCADE,
    event_name TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(endpoint_id, event_name)
);

CREATE INDEX idx_webhook_subscriptions_company_id ON public.webhook_subscriptions(company_id);
CREATE INDEX idx_webhook_subscriptions_endpoint_id ON public.webhook_subscriptions(endpoint_id);
CREATE INDEX idx_webhook_subscriptions_event_name ON public.webhook_subscriptions(event_name);

-- RLS
ALTER TABLE public.webhook_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their company's webhook subscriptions"
    ON public.webhook_subscriptions FOR SELECT
    USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Admins can manage their company's webhook subscriptions"
    ON public.webhook_subscriptions FOR ALL
    USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
    WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- ──────────────────────────────────────────────────────────────
-- 3. WEBHOOK DELIVERIES (Outbox)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE public.webhook_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    endpoint_id UUID NOT NULL REFERENCES public.webhook_endpoints(id) ON DELETE CASCADE,
    event_name TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonB,
    status TEXT NOT NULL CHECK (status IN ('pending','delivered','failed','dead_letter')),
    attempt_count INTEGER NOT NULL DEFAULT 0,
    last_attempt_at TIMESTAMPTZ,
    next_attempt_at TIMESTAMPTZ,
    response_status INTEGER,
    response_body_preview TEXT,
    error_message TEXT,
    related_entity_type TEXT,
    related_entity_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_webhook_deliveries_company_id ON public.webhook_deliveries(company_id);
CREATE INDEX idx_webhook_deliveries_endpoint_id ON public.webhook_deliveries(endpoint_id);
CREATE INDEX idx_webhook_deliveries_status ON public.webhook_deliveries(status);
CREATE INDEX idx_webhook_deliveries_next_attempt_at ON public.webhook_deliveries(next_attempt_at) WHERE status IN ('pending', 'failed');
CREATE INDEX idx_webhook_deliveries_created_at_desc ON public.webhook_deliveries(created_at DESC);

-- RLS
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their company's webhook deliveries"
    ON public.webhook_deliveries FOR SELECT
    USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER set_timestamp_webhook_endpoints
BEFORE UPDATE ON public.webhook_endpoints
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
