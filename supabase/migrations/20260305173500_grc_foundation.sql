-- Phase 1 - Sprint 1: GRC Foundation Schema

-- ══════════════════════════════════════════════════════════════
-- 1. Create Tables
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.grc_frameworks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  version text,
  status text CHECK (status IN ('active', 'inactive', 'draft')) DEFAULT 'draft',
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  UNIQUE (company_id, name, version)
);
CREATE INDEX IF NOT EXISTS idx_grc_frameworks_company_id ON public.grc_frameworks(company_id);

CREATE TABLE IF NOT EXISTS public.grc_controls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  framework_id uuid NOT NULL REFERENCES public.grc_frameworks(id) ON DELETE CASCADE,
  reference_code text,
  title text NOT NULL,
  description text,
  domain_category text,
  status text CHECK (status IN ('active', 'inactive')) DEFAULT 'active',
  owner_user_id uuid,
  created_by uuid,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_grc_controls_company_id ON public.grc_controls(company_id);
CREATE INDEX IF NOT EXISTS idx_grc_controls_framework ON public.grc_controls(company_id, framework_id);
CREATE INDEX IF NOT EXISTS idx_grc_controls_ref ON public.grc_controls(company_id, reference_code);
CREATE INDEX IF NOT EXISTS idx_grc_controls_owner ON public.grc_controls(company_id, owner_user_id);

CREATE TABLE IF NOT EXISTS public.grc_control_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  control_id uuid NOT NULL REFERENCES public.grc_controls(id) ON DELETE CASCADE,
  submission_id uuid REFERENCES public.content_submissions(id) ON DELETE SET NULL,
  status text CHECK (status IN ('valid', 'expired', 'missing')) DEFAULT 'valid',
  linked_by uuid,
  valid_until timestamptz,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_grc_control_evidence_company_id ON public.grc_control_evidence(company_id);
CREATE INDEX IF NOT EXISTS idx_grc_control_evidence_control ON public.grc_control_evidence(company_id, control_id);
CREATE INDEX IF NOT EXISTS idx_grc_control_evidence_submission ON public.grc_control_evidence(company_id, submission_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_grc_control_evidence_unique_link ON public.grc_control_evidence (company_id, control_id, submission_id) WHERE submission_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.grc_control_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  control_id uuid NOT NULL REFERENCES public.grc_controls(id) ON DELETE CASCADE,
  status text CHECK (status IN ('compliant', 'non_compliant', 'partial', 'unknown')) DEFAULT 'unknown',
  snapshot_date timestamptz DEFAULT now(),
  notes text,
  created_by uuid,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_grc_control_snapshots_company_id ON public.grc_control_snapshots(company_id);
CREATE INDEX IF NOT EXISTS idx_grc_control_snapshots_control ON public.grc_control_snapshots(company_id, control_id);
CREATE INDEX IF NOT EXISTS idx_grc_control_snapshots_date ON public.grc_control_snapshots(company_id, snapshot_date DESC);

-- ══════════════════════════════════════════════════════════════
-- 2. Evidence Deletion Trigger
-- When submission_id becomes NULL, status = 'missing'
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.set_grc_evidence_missing()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.submission_id IS NULL THEN
    NEW.status := 'missing';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_grc_evidence_missing ON public.grc_control_evidence;
CREATE TRIGGER trg_grc_evidence_missing
BEFORE UPDATE ON public.grc_control_evidence
FOR EACH ROW
WHEN (OLD.submission_id IS NOT NULL AND NEW.submission_id IS NULL)
EXECUTE FUNCTION public.set_grc_evidence_missing();


-- ══════════════════════════════════════════════════════════════
-- 3. Row Level Security Policies
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.grc_frameworks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grc_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grc_control_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grc_control_snapshots ENABLE ROW LEVEL SECURITY;

-- framework policies
CREATE POLICY "Company members can view frameworks"
  ON public.grc_frameworks FOR SELECT
  TO authenticated
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Admins can manage frameworks"
  ON public.grc_frameworks FOR ALL
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'compliance_officer'))
  )
  WITH CHECK (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'compliance_officer'))
  );

-- controls policies
CREATE POLICY "Company members can view controls"
  ON public.grc_controls FOR SELECT
  TO authenticated
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Admins can manage controls"
  ON public.grc_controls FOR ALL
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'compliance_officer'))
  )
  WITH CHECK (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'compliance_officer'))
  );

-- evidence policies
CREATE POLICY "Company members can view control evidence"
  ON public.grc_control_evidence FOR SELECT
  TO authenticated
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Admins can manage control evidence"
  ON public.grc_control_evidence FOR ALL
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'compliance_officer'))
  )
  WITH CHECK (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'compliance_officer'))
  );

-- snapshots policies
CREATE POLICY "Company members can view control snapshots"
  ON public.grc_control_snapshots FOR SELECT
  TO authenticated
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Admins can manage control snapshots"
  ON public.grc_control_snapshots FOR ALL
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'compliance_officer'))
  )
  WITH CHECK (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'compliance_officer'))
  );
