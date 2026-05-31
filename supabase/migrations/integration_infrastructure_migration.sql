-- ============================================================
-- Integration Infrastructure Migration — Safe, Idempotent
-- Run via: Supabase SQL Editor or supabase db push
-- ============================================================

-- ── 1. integration_connections ───────────────────────────────
CREATE TABLE IF NOT EXISTS integration_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  provider_id text NOT NULL,
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  credentials_encrypted text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at timestamptz,
  last_health_check_at timestamptz,
  last_error text,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_int_conn_company ON integration_connections(company_id);
CREATE INDEX IF NOT EXISTS idx_int_conn_provider ON integration_connections(provider_id);
CREATE INDEX IF NOT EXISTS idx_int_conn_status ON integration_connections(status);

ALTER TABLE integration_connections ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'integration_connections'
      AND policyname = 'Company members can view connections'
  ) THEN
    CREATE POLICY "Company members can view connections"
      ON integration_connections FOR SELECT
      USING (company_id IN (
        SELECT company_id FROM profiles WHERE id = auth.uid()
      ));
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'integration_connections'
      AND policyname = 'Company members can manage connections'
  ) THEN
    CREATE POLICY "Company members can manage connections"
      ON integration_connections FOR ALL
      USING (company_id IN (
        SELECT company_id FROM profiles WHERE id = auth.uid()
      ))
      WITH CHECK (company_id IN (
        SELECT company_id FROM profiles WHERE id = auth.uid()
      ));
  END IF;
END$$;


-- ── 2. integration_logs ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS integration_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  connection_id uuid REFERENCES integration_connections(id) ON DELETE SET NULL,
  action text NOT NULL,
  level text NOT NULL DEFAULT 'info',
  message text NOT NULL DEFAULT '',
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_int_logs_company ON integration_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_int_logs_connection ON integration_logs(connection_id);
CREATE INDEX IF NOT EXISTS idx_int_logs_action ON integration_logs(action);
CREATE INDEX IF NOT EXISTS idx_int_logs_created ON integration_logs(created_at DESC);

ALTER TABLE integration_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'integration_logs'
      AND policyname = 'Company members can view integration logs'
  ) THEN
    CREATE POLICY "Company members can view integration logs"
      ON integration_logs FOR SELECT
      USING (company_id IN (
        SELECT company_id FROM profiles WHERE id = auth.uid()
      ));
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'integration_logs'
      AND policyname = 'System can insert integration logs'
  ) THEN
    CREATE POLICY "System can insert integration logs"
      ON integration_logs FOR INSERT
      WITH CHECK (company_id IN (
        SELECT company_id FROM profiles WHERE id = auth.uid()
      ));
  END IF;
END$$;

-- Done ✅
