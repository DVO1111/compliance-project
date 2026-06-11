-- Add source_risk_id backref to capa_records so CAPAs spawned from a risk
-- can trace their origin without a separate join.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'capa_records'
  ) THEN
    RETURN;
  END IF;

  ALTER TABLE public.capa_records
    ADD COLUMN IF NOT EXISTS source_risk_id uuid;

  -- Add FK only if risks table also exists and constraint not yet present
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'risks'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.capa_records'::regclass
      AND conname = 'capa_records_source_risk_id_fkey'
  ) THEN
    ALTER TABLE public.capa_records
      ADD CONSTRAINT capa_records_source_risk_id_fkey
      FOREIGN KEY (source_risk_id) REFERENCES public.risks(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'capa_records'
      AND indexname = 'idx_capa_source_risk'
  ) THEN
    CREATE INDEX idx_capa_source_risk
      ON public.capa_records (company_id, source_risk_id)
      WHERE source_risk_id IS NOT NULL;
  END IF;
END $$;
