-- Phase 2 - Sprint 1: GRC Automation Schema
-- Multi-tenant automation engine infrastructure

-- ══════════════════════════════════════════════════════════════
-- 1. Helper Functions
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.handle_automation_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ══════════════════════════════════════════════════════════════
-- 2. grc_control_tests
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.grc_control_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  control_id uuid NOT NULL REFERENCES public.grc_controls(id) ON DELETE CASCADE,
  test_name text NOT NULL,
  provider_id text NOT NULL,
  connection_id uuid NOT NULL REFERENCES public.integration_connections(id) ON DELETE RESTRICT,
  check_type text NOT NULL CHECK (check_type IN ('configuration', 'log_audit', 'resource_list', 'identity_verify')),
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  frequency text NOT NULL DEFAULT 'daily',
  enabled boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  next_run_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, control_id, test_name)
);

CREATE INDEX IF NOT EXISTS idx_grc_control_tests_company_id ON public.grc_control_tests(company_id);
CREATE INDEX IF NOT EXISTS idx_grc_control_tests_control ON public.grc_control_tests(company_id, control_id);
CREATE INDEX IF NOT EXISTS idx_grc_control_tests_provider ON public.grc_control_tests(company_id, provider_id);
CREATE INDEX IF NOT EXISTS idx_grc_control_tests_active_run ON public.grc_control_tests(company_id, enabled, next_run_at);

CREATE TRIGGER trg_grc_control_tests_updated_at
  BEFORE UPDATE ON public.grc_control_tests
  FOR EACH ROW EXECUTE FUNCTION public.handle_automation_updated_at();

-- Cross-company reference safety trigger
CREATE OR REPLACE FUNCTION public.validate_grc_test_refs()
RETURNS TRIGGER AS $$
DECLARE
  v_control_co uuid;
  v_connection_co uuid;
BEGIN
  -- Validate Control
  SELECT company_id INTO v_control_co FROM public.grc_controls WHERE id = NEW.control_id;
  IF v_control_co IS NULL OR v_control_co <> NEW.company_id THEN
    RAISE EXCEPTION 'Control ID % does not belong to company %', NEW.control_id, NEW.company_id;
  END IF;

  -- Validate Connection
  SELECT company_id INTO v_connection_co FROM public.integration_connections WHERE id = NEW.connection_id;
  IF v_connection_co IS NULL OR v_connection_co <> NEW.company_id THEN
    RAISE EXCEPTION 'Connection ID % does not belong to company %', NEW.connection_id, NEW.company_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_grc_test_refs
  BEFORE INSERT OR UPDATE ON public.grc_control_tests
  FOR EACH ROW EXECUTE FUNCTION public.validate_grc_test_refs();

-- ══════════════════════════════════════════════════════════════
-- 3. grc_test_runs
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.grc_test_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  test_id uuid NOT NULL REFERENCES public.grc_control_tests(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('queued', 'running', 'success', 'failed', 'error')),
  result text CHECK (result IN ('pass', 'fail', 'warning')),
  evidence_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  executed_at timestamptz NOT NULL DEFAULT now(),
  duration_ms integer,
  error_message text
);

CREATE INDEX IF NOT EXISTS idx_grc_test_runs_company_id ON public.grc_test_runs(company_id);
CREATE INDEX IF NOT EXISTS idx_grc_test_runs_test_history ON public.grc_test_runs(company_id, test_id, executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_grc_test_runs_global_history ON public.grc_test_runs(company_id, executed_at DESC);

-- ══════════════════════════════════════════════════════════════
-- 4. grc_test_run_evidence
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.grc_test_run_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  test_run_id uuid NOT NULL REFERENCES public.grc_test_runs(id) ON DELETE CASCADE,
  control_evidence_id uuid NOT NULL REFERENCES public.grc_control_evidence(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, test_run_id, control_evidence_id)
);

CREATE INDEX IF NOT EXISTS idx_grc_test_run_ev_company_id ON public.grc_test_run_evidence(company_id);
CREATE INDEX IF NOT EXISTS idx_grc_test_run_ev_run ON public.grc_test_run_evidence(company_id, test_run_id);

-- ══════════════════════════════════════════════════════════════
-- 5. Row Level Security
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.grc_control_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grc_test_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grc_test_run_evidence ENABLE ROW LEVEL SECURITY;

-- 5.1 grc_control_tests policies
CREATE POLICY "Company members can view control tests"
  ON public.grc_control_tests FOR SELECT
  TO authenticated
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Admins can manage control tests"
  ON public.grc_control_tests FOR ALL
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'compliance_officer'))
  )
  WITH CHECK (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'compliance_officer'))
  );

-- 5.2 grc_test_runs policies
CREATE POLICY "Company members can view test runs"
  ON public.grc_test_runs FOR SELECT
  TO authenticated
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- Allow service_role and automation runner to insert runs
-- In Supabase, service_role bypasses RLS, so we only need to policy for authenticated users if they can manual trigger
CREATE POLICY "Admins can insert test runs"
  ON public.grc_test_runs FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'compliance_officer'))
  );

-- 5.3 grc_test_run_evidence policies
CREATE POLICY "Company members can view test run evidence links"
  ON public.grc_test_run_evidence FOR SELECT
  TO authenticated
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Admins can manage test run evidence links"
  ON public.grc_test_run_evidence FOR ALL
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'compliance_officer'))
  )
  WITH CHECK (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'compliance_officer'))
  );
