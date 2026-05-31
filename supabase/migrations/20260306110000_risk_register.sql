-- Phase 4 - Sprint 1: Risk Register + Risk Scoring Engine Schema

-- ══════════════════════════════════════════════════════════════
-- 1. Create Tables
-- ══════════════════════════════════════════════════════════════

-- ─── public.risks ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.risks (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title          text NOT NULL,
  description    text,
  risk_category  text NOT NULL CHECK (risk_category IN ('security', 'privacy', 'operational', 'financial', 'legal', 'compliance')),
  risk_level     text NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  status         text NOT NULL DEFAULT 'identified' CHECK (status IN ('identified', 'mitigating', 'monitored', 'closed')),
  owner_id       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_risks_company ON public.risks(company_id);
CREATE INDEX IF NOT EXISTS idx_risks_level ON public.risks(company_id, risk_level);
CREATE INDEX IF NOT EXISTS idx_risks_category ON public.risks(company_id, risk_category);

-- ─── public.risk_links ──────────────────────────────────────────────────────
-- Polymorphic-style link table for traceability
CREATE TABLE IF NOT EXISTS public.risk_links (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  risk_id           uuid NOT NULL REFERENCES public.risks(id) ON DELETE CASCADE,
  link_type         text NOT NULL CHECK (link_type IN ('control', 'policy', 'vendor', 'audit_request', 'automation_test')),
  linked_entity_id  uuid NOT NULL,
  created_at        timestamptz DEFAULT now(),
  UNIQUE(company_id, risk_id, link_type, linked_entity_id)
);

CREATE INDEX IF NOT EXISTS idx_risk_links_company ON public.risk_links(company_id);
CREATE INDEX IF NOT EXISTS idx_risk_links_risk ON public.risk_links(company_id, risk_id);
CREATE INDEX IF NOT EXISTS idx_risk_links_entity ON public.risk_links(company_id, link_type, linked_entity_id);

-- ─── public.company_risk_posture ───────────────────────────────────────────
-- Cache table for dashboard performance
CREATE TABLE IF NOT EXISTS public.company_risk_posture (
  company_id              uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  posture_score           numeric NOT NULL DEFAULT 0,
  policy_signal_score     numeric NOT NULL DEFAULT 0,
  control_signal_score    numeric NOT NULL DEFAULT 0,
  automation_signal_score numeric NOT NULL DEFAULT 0,
  vendor_signal_score     numeric NOT NULL DEFAULT 0,
  audit_signal_score      numeric NOT NULL DEFAULT 0,
  highest_risk_level      text NOT NULL DEFAULT 'low',
  open_risks_count       int NOT NULL DEFAULT 0,
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- ══════════════════════════════════════════════════════════════
-- 2. Row Level Security
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.risks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_risk_posture ENABLE ROW LEVEL SECURITY;

-- ─── risks RLS ─────────────────────────────────────────────────────────────

CREATE POLICY risks_select ON public.risks FOR SELECT
  TO authenticated
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY risks_manage ON public.risks FOR ALL
  TO authenticated
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

-- ─── risk_links RLS ────────────────────────────────────────────────────────

CREATE POLICY risk_links_select ON public.risk_links FOR SELECT
  TO authenticated
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY risk_links_manage ON public.risk_links FOR ALL
  TO authenticated
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

-- ─── company_risk_posture RLS ──────────────────────────────────────────────

CREATE POLICY posture_select ON public.company_risk_posture FOR SELECT
  TO authenticated
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY posture_manage ON public.company_risk_posture FOR ALL
  TO authenticated
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

-- ══════════════════════════════════════════════════════════════
-- 3. Triggers
-- ══════════════════════════════════════════════════════════════

-- Updated At Trigger
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_risks_updated_at
  BEFORE UPDATE ON public.risks
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
