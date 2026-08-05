-- Raw Material Receipts
-- Logs incoming raw material lots and their receiving / QC test outcome, the
-- upstream input to a manufacturing batch.

CREATE TABLE IF NOT EXISTS public.raw_material_receipts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  material_name  text NOT NULL,
  material_code  text,
  lot_number     text NOT NULL,
  supplier_name  text,
  quantity       numeric,
  unit           text DEFAULT 'kg',
  received_date  date NOT NULL DEFAULT current_date,
  test_status    text NOT NULL DEFAULT 'pending'
    CHECK (test_status IN ('pending','passed','failed','quarantined')),
  test_result    text,
  received_by    uuid REFERENCES auth.users(id),
  created_by     uuid REFERENCES auth.users(id),
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

ALTER TABLE public.raw_material_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view raw_material_receipts"
  ON public.raw_material_receipts FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Company members can manage raw_material_receipts"
  ON public.raw_material_receipts FOR ALL TO authenticated
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

CREATE INDEX IF NOT EXISTS idx_raw_material_receipts_company
  ON public.raw_material_receipts(company_id, received_date DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_raw_material_receipts_lot
  ON public.raw_material_receipts(company_id, material_code, lot_number);

CREATE OR REPLACE FUNCTION fn_raw_material_receipts_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_raw_material_receipts_updated_at
  BEFORE UPDATE ON public.raw_material_receipts
  FOR EACH ROW EXECUTE FUNCTION fn_raw_material_receipts_updated_at();
