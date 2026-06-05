-- ============================================================
-- Continuous Control Monitoring — Tier 1 Item 2
-- ============================================================
-- Three tables that turn the static Framework Library catalogue
-- into a live compliance health tracker:
--   framework_evidence      — evidence items linked to controls
--   framework_test_log      — pass/fail/partial assessment records
--   framework_control_config — per-company control configuration
-- ============================================================

-- ── Evidence items ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.framework_evidence (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  control_id    uuid        NOT NULL REFERENCES public.framework_controls(id) ON DELETE CASCADE,
  title         text        NOT NULL,
  description   text,
  evidence_type text        NOT NULL DEFAULT 'document'
    CHECK (evidence_type IN (
      'document','record','audit_report','certificate',
      'policy','procedure','test_result','screenshot','other'
    )),
  file_name     text,
  file_url      text,
  expires_at    date,
  uploaded_by   uuid        REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS framework_evidence_company_idx
  ON public.framework_evidence (company_id);
CREATE INDEX IF NOT EXISTS framework_evidence_control_idx
  ON public.framework_evidence (control_id);

-- ── Test / assessment log ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.framework_test_log (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  control_id    uuid        NOT NULL REFERENCES public.framework_controls(id) ON DELETE CASCADE,
  status        text        NOT NULL
    CHECK (status IN ('pass','fail','partial','not_applicable')),
  notes         text,
  tested_by     uuid        REFERENCES auth.users(id),
  next_test_due date,
  tested_at     timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS framework_test_log_company_idx
  ON public.framework_test_log (company_id);
CREATE INDEX IF NOT EXISTS framework_test_log_control_idx
  ON public.framework_test_log (control_id);
CREATE INDEX IF NOT EXISTS framework_test_log_tested_at_idx
  ON public.framework_test_log (company_id, control_id, tested_at DESC);

-- ── Per-company control configuration ────────────────────────
CREATE TABLE IF NOT EXISTS public.framework_control_config (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  control_id         uuid        NOT NULL REFERENCES public.framework_controls(id) ON DELETE CASCADE,
  is_applicable      boolean     NOT NULL DEFAULT true,
  test_interval_days integer     NOT NULL DEFAULT 365,
  owner_id           uuid        REFERENCES auth.users(id),
  notes              text,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, control_id)
);

CREATE INDEX IF NOT EXISTS framework_control_config_company_idx
  ON public.framework_control_config (company_id);

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE public.framework_evidence        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.framework_test_log        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.framework_control_config  ENABLE ROW LEVEL SECURITY;

-- Evidence: company-scoped full access
CREATE POLICY "Company members can manage framework evidence"
  ON public.framework_evidence FOR ALL
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

-- Test log: company-scoped full access
CREATE POLICY "Company members can manage framework test log"
  ON public.framework_test_log FOR ALL
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

-- Config: company-scoped full access
CREATE POLICY "Company members can manage framework control config"
  ON public.framework_control_config FOR ALL
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );
