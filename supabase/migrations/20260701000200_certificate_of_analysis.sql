-- Certificate of Analysis (CoA)
-- Auto-generated from a released batch's QC results, with an AI-synthesised
-- conformance statement and a timestamped QA approval (e-signature).

CREATE TABLE IF NOT EXISTS public.certificate_of_analysis (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  batch_id              uuid NOT NULL REFERENCES public.batch_records(id) ON DELETE CASCADE,
  coa_number            text NOT NULL,
  product_name          text NOT NULL,
  batch_number          text,
  conformance_statement text,
  results               jsonb NOT NULL DEFAULT '[]'::jsonb,  -- snapshot of batch_qc_results at generation time
  status                text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','qa_approved')),
  qa_approved_by        uuid REFERENCES auth.users(id),
  qa_approved_by_name   text,
  qa_approved_at        timestamptz,
  pdf_url               text,
  created_by            uuid REFERENCES auth.users(id),
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

ALTER TABLE public.certificate_of_analysis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view certificate_of_analysis"
  ON public.certificate_of_analysis FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Company members can manage certificate_of_analysis"
  ON public.certificate_of_analysis FOR ALL TO authenticated
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

CREATE INDEX IF NOT EXISTS idx_coa_company
  ON public.certificate_of_analysis(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_coa_batch
  ON public.certificate_of_analysis(batch_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_coa_number
  ON public.certificate_of_analysis(company_id, coa_number);

CREATE OR REPLACE FUNCTION fn_coa_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_coa_updated_at
  BEFORE UPDATE ON public.certificate_of_analysis
  FOR EACH ROW EXECUTE FUNCTION fn_coa_updated_at();
