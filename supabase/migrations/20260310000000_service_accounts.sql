-- ── 1. service_accounts ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.service_accounts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_service_accounts_company ON public.service_accounts(company_id);
CREATE INDEX IF NOT EXISTS idx_service_accounts_status ON public.service_accounts(status);

-- Enable RLS
ALTER TABLE public.service_accounts ENABLE ROW LEVEL SECURITY;

-- Policy: Company-scoped access
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'service_accounts' AND policyname = 'Users can manage their company service accounts'
    ) THEN
        CREATE POLICY "Users can manage their company service accounts"
            ON public.service_accounts FOR ALL
            TO authenticated
            USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
            WITH CHECK (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
    END IF;
END $$;

-- ── 2. Extend api_keys ─────────────────────────────────────────────
-- Add service_account_id if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'api_keys' AND COLUMN_NAME = 'service_account_id'
    ) THEN
        ALTER TABLE public.api_keys 
        ADD COLUMN service_account_id UUID REFERENCES public.service_accounts(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Add usage tracking columns if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'api_keys' AND COLUMN_NAME = 'last_used_ip'
    ) THEN
        ALTER TABLE public.api_keys 
        ADD COLUMN last_used_ip TEXT;
    END IF;
END $$;

-- ── 3. Automation Triggers ─────────────────────────────────────────
CREATE TRIGGER set_timestamp_service_accounts
BEFORE UPDATE ON public.service_accounts
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();
