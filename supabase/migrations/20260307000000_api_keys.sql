-- ── 1. api_keys ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.api_keys (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  key_hash    TEXT NOT NULL UNIQUE, -- SHA-256 hash of the full key
  key_prefix  TEXT NOT NULL,        -- First 8 chars for human identification
  scopes      TEXT[] NOT NULL DEFAULT '{}',
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at  TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookup by hash (API Gateway performance)
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON public.api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_company ON public.api_keys(company_id);

-- Enable RLS
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

-- Policy: Company-scoped access
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'api_keys' AND policyname = 'Users can manage their company api keys'
    ) THEN
        CREATE POLICY "Users can manage their company api keys"
            ON public.api_keys FOR ALL
            TO authenticated
            USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
            WITH CHECK (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
    END IF;
END $$;

-- Track updates
CREATE TRIGGER set_timestamp_api_keys
BEFORE UPDATE ON public.api_keys
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- ── 2. Add to immutable audit logging ──────────────────────────
-- No schema changes needed for audit logs, but ensure the actor_type 'api_key' is supported conceptually.
