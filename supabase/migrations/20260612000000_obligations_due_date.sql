-- Add due_date to regulatory_obligations for overdue escalation tracking
ALTER TABLE public.regulatory_obligations
  ADD COLUMN IF NOT EXISTS due_date date;

CREATE INDEX IF NOT EXISTS idx_reg_obligations_due_date
  ON public.regulatory_obligations (company_id, due_date)
  WHERE due_date IS NOT NULL;
