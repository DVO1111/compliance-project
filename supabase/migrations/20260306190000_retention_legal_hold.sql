/*
  # Data Retention & Legal Hold Framework

  ## Changes
  1. Create `retention_policies` table
  2. Create `legal_holds` table
  3. Create `legal_hold_items` table
  4. Implement RLS and Audit triggers
*/

-- ══════════════════════════════════════════════════════════════
-- 1. Retention Policies
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS retention_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  data_class text NOT NULL,
  retention_days integer NOT NULL,
  archive_after_days integer DEFAULT NULL,
  auto_delete boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (company_id, data_class)
);

ALTER TABLE retention_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Retention policies are viewable by company members"
  ON retention_policies FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT p.company_id FROM profiles p WHERE p.id = auth.uid()
    )
  );

CREATE POLICY "Retention policies are manageable by compliance and admin"
  ON retention_policies FOR ALL -- INSERT, UPDATE, DELETE
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.company_id = retention_policies.company_id
      AND p.role IN ('admin', 'compliance_officer')
    )
  );

-- ══════════════════════════════════════════════════════════════
-- 2. Legal Holds
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS legal_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  reason text,
  status text NOT NULL CHECK (status IN ('active', 'released')),
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  released_at timestamptz DEFAULT NULL,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE legal_holds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Legal holds are viewable by company members"
  ON legal_holds FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT p.company_id FROM profiles p WHERE p.id = auth.uid()
    )
  );

CREATE POLICY "Legal holds are manageable by compliance and admin"
  ON legal_holds FOR ALL
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.company_id = legal_holds.company_id
      AND p.role IN ('admin', 'compliance_officer')
    )
  );

-- ══════════════════════════════════════════════════════════════
-- 3. Legal Hold Items
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS legal_hold_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  legal_hold_id uuid NOT NULL REFERENCES legal_holds(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Unique constraint to prevent duplicate items in same hold
CREATE UNIQUE INDEX idx_legal_hold_items_unique ON legal_hold_items (legal_hold_id, entity_type, entity_id);

ALTER TABLE legal_hold_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Legal hold items are viewable by company members"
  ON legal_hold_items FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT p.company_id FROM profiles p WHERE p.id = auth.uid()
    )
  );

CREATE POLICY "Legal hold items are manageable by compliance and admin"
  ON legal_hold_items FOR ALL
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.company_id = legal_hold_items.company_id
      AND p.role IN ('admin', 'compliance_officer')
    )
  );

-- ══════════════════════════════════════════════════════════════
-- 4. Indexes for performance
-- ══════════════════════════════════════════════════════════════

CREATE INDEX idx_retention_policies_company ON retention_policies(company_id);
CREATE INDEX idx_legal_holds_company ON legal_holds(company_id, status);
CREATE INDEX idx_legal_hold_items_lookup ON legal_hold_items(entity_type, entity_id);

-- ══════════════════════════════════════════════════════════════
-- 5. Helper Function: Check if entity is on legal hold
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION is_on_legal_hold(p_entity_type text, p_entity_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM legal_hold_items lhi
    JOIN legal_holds lh ON lh.id = lhi.legal_hold_id
    WHERE lhi.entity_type = p_entity_type
      AND lhi.entity_id = p_entity_id
      AND lh.status = 'active'
  );
END;
$$;
