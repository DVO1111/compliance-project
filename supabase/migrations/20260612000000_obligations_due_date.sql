-- Add due_date to regulatory_obligations for overdue escalation tracking
-- Guard: only alter if the table exists (it may have been created outside the migration runner)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'regulatory_obligations'
  ) THEN
    ALTER TABLE public.regulatory_obligations
      ADD COLUMN IF NOT EXISTS due_date date;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'regulatory_obligations'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'regulatory_obligations'
      AND indexname = 'idx_reg_obligations_due_date'
  ) THEN
    CREATE INDEX idx_reg_obligations_due_date
      ON public.regulatory_obligations (company_id, due_date)
      WHERE due_date IS NOT NULL;
  END IF;
END $$;
