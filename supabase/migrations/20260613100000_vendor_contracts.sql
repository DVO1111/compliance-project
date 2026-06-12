-- TPRM: Contract risk tracking
-- Creates vendor_contracts table for capturing agreement terms, expiry risk, and SLA obligations

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'vendor_contracts'
  ) THEN
    CREATE TABLE public.vendor_contracts (
      id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      vendor_id           uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
      company_id          uuid NOT NULL,
      title               text NOT NULL,
      contract_value      numeric(18,2),
      currency            text NOT NULL DEFAULT 'USD',
      start_date          date,
      expiry_date         date,
      auto_renewal        boolean NOT NULL DEFAULT false,
      notice_period_days  int,
      sla_uptime_pct      numeric(5,2),             -- e.g. 99.9
      breach_penalty_clause boolean NOT NULL DEFAULT false,
      risk_score          int NOT NULL DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 100),
      status              text NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active','expiring_soon','expired','terminated')),
      notes               text,
      created_by          uuid,
      created_at          timestamptz NOT NULL DEFAULT now(),
      updated_at          timestamptz NOT NULL DEFAULT now()
    );

    -- RLS
    ALTER TABLE public.vendor_contracts ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "vendor_contracts_company_select"
      ON public.vendor_contracts FOR SELECT
      USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid() LIMIT 1));

    CREATE POLICY "vendor_contracts_company_insert"
      ON public.vendor_contracts FOR INSERT
      WITH CHECK (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid() LIMIT 1));

    CREATE POLICY "vendor_contracts_company_update"
      ON public.vendor_contracts FOR UPDATE
      USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid() LIMIT 1));

    CREATE POLICY "vendor_contracts_company_delete"
      ON public.vendor_contracts FOR DELETE
      USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid() LIMIT 1));
  END IF;
END $$;

-- Indexes
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public'
      AND tablename = 'vendor_contracts' AND indexname = 'idx_vendor_contracts_vendor'
  ) THEN
    CREATE INDEX idx_vendor_contracts_vendor
      ON public.vendor_contracts (vendor_id, status);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public'
      AND tablename = 'vendor_contracts' AND indexname = 'idx_vendor_contracts_expiry'
  ) THEN
    CREATE INDEX idx_vendor_contracts_expiry
      ON public.vendor_contracts (company_id, expiry_date)
      WHERE status NOT IN ('expired','terminated');
  END IF;
END $$;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_vendor_contracts_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_vendor_contracts_updated_at'
  ) THEN
    CREATE TRIGGER trg_vendor_contracts_updated_at
      BEFORE UPDATE ON public.vendor_contracts
      FOR EACH ROW EXECUTE FUNCTION public.update_vendor_contracts_updated_at();
  END IF;
END $$;
