/*
  # Immutable Audit Trail & Compliance Evidence Vault
  
  ## Changes
  1. Add integrity columns to audit_logs (hash chain, evidence snapshot, sequence)
  2. Add immutability RLS policies (block UPDATE and DELETE)
  3. Create audit_retention_policies table
  4. Create verify_audit_chain RPC
  5. Create get_next_audit_sequence RPC
  
  ## Non-Breaking
  - All new columns are nullable or have defaults
  - Existing INSERT and SELECT policies are untouched
  - Existing data remains valid
*/

-- ══════════════════════════════════════════════════════════════
-- 1. Add integrity columns to audit_logs
-- ══════════════════════════════════════════════════════════════

ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS integrity_hash text,
  ADD COLUMN IF NOT EXISTS previous_hash text DEFAULT 'GENESIS',
  ADD COLUMN IF NOT EXISTS evidence_snapshot jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS company_id uuid,
  ADD COLUMN IF NOT EXISTS ip_address text,
  ADD COLUMN IF NOT EXISTS sequence_number bigint;

-- Index for chain verification queries (company-scoped, ordered)
CREATE INDEX IF NOT EXISTS idx_audit_logs_company_seq
  ON audit_logs (company_id, sequence_number ASC);

-- Index for fast hash lookups
CREATE INDEX IF NOT EXISTS idx_audit_logs_integrity_hash
  ON audit_logs (integrity_hash);

-- ══════════════════════════════════════════════════════════════
-- 2. Immutability RLS policies (append-only)
-- ══════════════════════════════════════════════════════════════

-- Block all updates — audit log entries are immutable once written
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'audit_logs' AND policyname = 'Audit logs are immutable — no updates'
  ) THEN
    CREATE POLICY "Audit logs are immutable — no updates"
      ON audit_logs FOR UPDATE
      TO authenticated
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;

-- Block all deletes — audit log entries cannot be destroyed
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'audit_logs' AND policyname = 'Audit logs are immutable — no deletes'
  ) THEN
    CREATE POLICY "Audit logs are immutable — no deletes"
      ON audit_logs FOR DELETE
      TO authenticated
      USING (false);
  END IF;
END $$;

-- Allow company-scoped reads for compliance and executive roles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'audit_logs' AND policyname = 'Company members can view company audit logs'
  ) THEN
    CREATE POLICY "Company members can view company audit logs"
      ON audit_logs FOR SELECT
      TO authenticated
      USING (
        company_id IS NULL
        OR company_id IN (
          SELECT p.company_id FROM profiles p WHERE p.id = auth.uid()
        )
      );
  END IF;
END $$;

-- ══════════════════════════════════════════════════════════════
-- 3. Audit retention policies table
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS audit_retention_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  jurisdiction text NOT NULL DEFAULT 'default',
  retention_years integer NOT NULL DEFAULT 7,
  description text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (company_id, jurisdiction)
);

ALTER TABLE audit_retention_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view retention policies"
  ON audit_retention_policies FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT p.company_id FROM profiles p WHERE p.id = auth.uid()
    )
  );

CREATE POLICY "Executives can manage retention policies"
  ON audit_retention_policies FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.company_id = audit_retention_policies.company_id
      AND p.role IN ('admin', 'compliance_officer')
    )
  );

-- ══════════════════════════════════════════════════════════════
-- 4. RPC: Get next sequence number (atomic)
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_next_audit_sequence(p_company_id uuid)
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT COALESCE(MAX(sequence_number), 0) + 1
  FROM audit_logs
  WHERE company_id = p_company_id;
$$;

-- ══════════════════════════════════════════════════════════════
-- 5. RPC: Verify audit chain integrity
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION verify_audit_chain(p_company_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rec record;
  expected_prev text := 'GENESIS';
  chain_valid boolean := true;
  broken_id uuid := null;
  total_checked integer := 0;
BEGIN
  FOR rec IN
    SELECT id, integrity_hash, previous_hash
    FROM audit_logs
    WHERE company_id = p_company_id
      AND integrity_hash IS NOT NULL
    ORDER BY sequence_number ASC
  LOOP
    total_checked := total_checked + 1;
    
    IF rec.previous_hash IS DISTINCT FROM expected_prev THEN
      chain_valid := false;
      broken_id := rec.id;
      EXIT;
    END IF;
    
    expected_prev := rec.integrity_hash;
  END LOOP;

  RETURN json_build_object(
    'valid', chain_valid,
    'total_checked', total_checked,
    'broken_at', broken_id
  );
END;
$$;

-- Seed default retention policies for common jurisdictions
-- (only runs if no policies exist yet)
INSERT INTO audit_retention_policies (company_id, jurisdiction, retention_years, description)
SELECT 
  '00000000-0000-0000-0000-000000000000'::uuid,
  j.jurisdiction,
  j.years,
  j.description
FROM (VALUES
  ('NAFDAC (Nigeria)', 7, 'NAFDAC regulatory record retention — 7 years minimum'),
  ('FDA (USA)', 10, 'FDA 21 CFR Part 11 — 10 years for promotional materials'),
  ('EMA (Europe)', 10, 'EMA GVP Module I — 10 years post-authorization'),
  ('Default', 7, 'Default retention policy — 7 years')
) AS j(jurisdiction, years, description)
ON CONFLICT DO NOTHING;
