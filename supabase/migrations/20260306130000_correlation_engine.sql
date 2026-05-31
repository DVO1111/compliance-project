-- Phase 4 - Sprint 4: Cross-System Risk Correlation Engine
-- Tables for logic-based risk detection across multiple modules

-- ══════════════════════════════════════════════════════════════
-- 1. Correlation Rules
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.correlation_rules (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  rule_name         text NOT NULL,
  description       text,
  signal_conditions jsonb NOT NULL, -- e.g. { "vendor_risk": 70, "automation_failures": 3 }
  risk_impact       text NOT NULL CHECK (risk_impact IN ('security', 'privacy', 'operational', 'financial', 'legal', 'compliance')),
  severity          text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_corr_rules_company ON public.correlation_rules(company_id);

ALTER TABLE public.correlation_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY corr_rules_select ON public.correlation_rules FOR SELECT
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY corr_rules_manage ON public.correlation_rules FOR ALL
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'compliance_officer')));

-- ══════════════════════════════════════════════════════════════
-- 2. Correlation Events (Insight Findings)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.correlation_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  rule_id           uuid REFERENCES public.correlation_rules(id) ON DELETE SET NULL,
  triggered_at      timestamptz NOT NULL DEFAULT now(),
  severity          text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  description       text NOT NULL,
  status            text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved', 'dismissed')),
  linked_risk_id    uuid REFERENCES public.risks(id) ON DELETE SET NULL,
  metadata          jsonb DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_corr_events_company ON public.correlation_events(company_id);
CREATE INDEX IF NOT EXISTS idx_corr_events_status ON public.correlation_events(company_id, status);
CREATE INDEX IF NOT EXISTS idx_corr_events_severity ON public.correlation_events(company_id, severity);

ALTER TABLE public.correlation_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY corr_events_select ON public.correlation_events FOR SELECT
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY corr_events_manage ON public.correlation_events FOR ALL
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'compliance_officer')));

-- ══════════════════════════════════════════════════════════════
-- 3. Initial Seed Rules (Template)
-- ══════════════════════════════════════════════════════════════

INSERT INTO public.correlation_rules (company_id, rule_name, description, signal_conditions, risk_impact, severity)
SELECT 
  id as company_id,
  'High Vendor Risk + Automation Failure',
  'Triggered when a vendor with high risk score also has associated control automation failures.',
  '{ "vendor_risk_threshold": 70, "automation_failure_count": 3 }'::jsonb,
  'operational',
  'high'
FROM public.companies
ON CONFLICT DO NOTHING;

INSERT INTO public.correlation_rules (company_id, rule_name, description, signal_conditions, risk_impact, severity)
SELECT 
  id as company_id,
  'Policy Gap + Non-Compliant Controls',
  'Triggered when multiple regulatory obligations are implementation-pending while associated controls are non-compliant.',
  '{ "pending_obligation_count": 5, "non_compliant_control_count": 2 }'::jsonb,
  'compliance',
  'critical'
FROM public.companies
ON CONFLICT DO NOTHING;
