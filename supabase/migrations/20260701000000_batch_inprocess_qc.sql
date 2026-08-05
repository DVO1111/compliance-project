-- Batch In-Process QC
-- Logs intermediate in-process quality-control stages for a batch, in addition
-- to the final release QC captured in batch_qc_results.

CREATE TABLE IF NOT EXISTS public.batch_inprocess_qc (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  batch_id      uuid NOT NULL REFERENCES public.batch_records(id) ON DELETE CASCADE,
  stage_name    text NOT NULL,
  parameter     text NOT NULL,
  specification text,
  result        text NOT NULL,
  pass          boolean NOT NULL DEFAULT true,
  tested_by     uuid REFERENCES auth.users(id),
  tested_at     timestamptz DEFAULT now(),
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE public.batch_inprocess_qc ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view batch_inprocess_qc"
  ON public.batch_inprocess_qc FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Company members can manage batch_inprocess_qc"
  ON public.batch_inprocess_qc FOR ALL TO authenticated
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

CREATE INDEX IF NOT EXISTS idx_batch_inprocess_qc_batch
  ON public.batch_inprocess_qc(batch_id, tested_at DESC);

CREATE INDEX IF NOT EXISTS idx_batch_inprocess_qc_company
  ON public.batch_inprocess_qc(company_id);
