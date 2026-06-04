-- Change Control Module
-- Tracks formal change requests through impact assessment, approval, implementation,
-- and verification — following NAFDAC GMP and ISO 22000 change management requirements.

CREATE TABLE IF NOT EXISTS public.change_controls (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  change_number        text NOT NULL,  -- e.g. CC-2024-0001
  title                text NOT NULL,
  description          text,
  change_type          text NOT NULL
    CHECK (change_type IN ('sop','formulation','equipment','process','supplier','packaging','other')),
  change_category      text NOT NULL DEFAULT 'minor'
    CHECK (change_category IN ('major','minor','emergency')),
  impact_assessment    text,
  regulatory_impact    boolean DEFAULT false,
  validation_required  boolean DEFAULT false,
  status               text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','impact_assessment','pending_approval','approved','implementing','verification','closed','rejected')),
  effective_date       date,
  approved_by          uuid REFERENCES auth.users(id),
  approved_at          timestamptz,
  rejected_reason      text,
  created_by           uuid REFERENCES auth.users(id),
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE public.change_controls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view change_controls"
  ON public.change_controls FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Company members can manage change_controls"
  ON public.change_controls FOR ALL TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    )
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_change_controls_company
  ON public.change_controls(company_id, status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_change_controls_number
  ON public.change_controls(company_id, change_number);

-- updated_at trigger
CREATE OR REPLACE FUNCTION fn_change_controls_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_change_controls_updated_at
  BEFORE UPDATE ON public.change_controls
  FOR EACH ROW EXECUTE FUNCTION fn_change_controls_updated_at();
