-- Add source_risk_id backref to capa_records so CAPAs spawned from a risk
-- can trace their origin without a separate join.
ALTER TABLE public.capa_records
  ADD COLUMN IF NOT EXISTS source_risk_id uuid REFERENCES public.risks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_capa_source_risk
  ON public.capa_records (company_id, source_risk_id)
  WHERE source_risk_id IS NOT NULL;
