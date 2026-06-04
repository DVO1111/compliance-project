-- Batch Release Workflow
-- Tracks pharmaceutical / FMCG batch records through QC to release/rejection.
-- Every status change is logged to audit_logs via the shared engine.

CREATE TABLE IF NOT EXISTS public.batch_records (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  batch_number        text NOT NULL,
  product_name        text NOT NULL,
  product_code        text,
  manufacturing_date  date NOT NULL,
  expiry_date         date NOT NULL,
  batch_size          numeric NOT NULL,
  unit                text NOT NULL DEFAULT 'kg',
  status              text NOT NULL DEFAULT 'qc_pending'
    CHECK (status IN ('qc_pending','qc_in_progress','hold','released','rejected','archived')),
  hold_reason         text,
  release_notes       text,
  qc_started_at       timestamptz,
  qc_completed_at     timestamptz,
  released_at         timestamptz,
  released_by         uuid REFERENCES auth.users(id),
  created_by          uuid REFERENCES auth.users(id),
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.batch_qc_results (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id     uuid NOT NULL REFERENCES public.batch_records(id) ON DELETE CASCADE,
  test_name    text NOT NULL,
  test_method  text,
  specification text,
  result       text NOT NULL,
  pass         boolean NOT NULL,
  tested_by    uuid REFERENCES auth.users(id),
  tested_at    timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE public.batch_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batch_qc_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view batch_records"
  ON public.batch_records FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Company members can manage batch_records"
  ON public.batch_records FOR ALL TO authenticated
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

CREATE POLICY "Company members can view batch_qc_results"
  ON public.batch_qc_results FOR SELECT TO authenticated
  USING (
    batch_id IN (
      SELECT id FROM public.batch_records WHERE company_id IN (
        SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Company members can manage batch_qc_results"
  ON public.batch_qc_results FOR ALL TO authenticated
  USING (
    batch_id IN (
      SELECT id FROM public.batch_records WHERE company_id IN (
        SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    batch_id IN (
      SELECT id FROM public.batch_records WHERE company_id IN (
        SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
      )
    )
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_batch_records_company
  ON public.batch_records(company_id, status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_batch_records_number
  ON public.batch_records(company_id, batch_number);

-- updated_at trigger
CREATE OR REPLACE FUNCTION fn_batch_records_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_batch_records_updated_at
  BEFORE UPDATE ON public.batch_records
  FOR EACH ROW EXECUTE FUNCTION fn_batch_records_updated_at();
