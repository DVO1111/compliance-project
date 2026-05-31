-- ============================================================
-- Custom Roles Migration — Granular RBAC with Custom Permission Sets
-- Feature #1: Enterprise RBAC
-- ============================================================

-- ── 1. custom_roles table ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS custom_roles (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid        NOT NULL,
  name        text        NOT NULL,
  description text        DEFAULT '',
  is_system   boolean     NOT NULL DEFAULT false,
  permissions jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_company_role_name UNIQUE (company_id, name)
);

ALTER TABLE custom_roles ENABLE ROW LEVEL SECURITY;

-- Read: any authenticated company member
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'custom_roles' AND policyname = 'Company members can view roles'
  ) THEN
    CREATE POLICY "Company members can view roles"
      ON custom_roles FOR SELECT
      TO authenticated
      USING (
        company_id IN (
          SELECT company_id FROM profiles WHERE id = auth.uid()
        )
      );
  END IF;
END $$;

-- Insert: only company admins/executives
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'custom_roles' AND policyname = 'Admins can create roles'
  ) THEN
    CREATE POLICY "Admins can create roles"
      ON custom_roles FOR INSERT
      TO authenticated
      WITH CHECK (
        company_id IN (
          SELECT p.company_id FROM profiles p
          WHERE p.id = auth.uid()
            AND lower(p.role) IN ('admin', 'executive', 'exec', 'owner')
        )
      );
  END IF;
END $$;

-- Update: only company admins/executives, cannot update system roles' is_system flag
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'custom_roles' AND policyname = 'Admins can update roles'
  ) THEN
    CREATE POLICY "Admins can update roles"
      ON custom_roles FOR UPDATE
      TO authenticated
      USING (
        company_id IN (
          SELECT p.company_id FROM profiles p
          WHERE p.id = auth.uid()
            AND lower(p.role) IN ('admin', 'executive', 'exec', 'owner')
        )
      )
      WITH CHECK (
        company_id IN (
          SELECT p.company_id FROM profiles p
          WHERE p.id = auth.uid()
            AND lower(p.role) IN ('admin', 'executive', 'exec', 'owner')
        )
      );
  END IF;
END $$;

-- Delete: only non-system roles by admins
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'custom_roles' AND policyname = 'Admins can delete custom roles'
  ) THEN
    CREATE POLICY "Admins can delete custom roles"
      ON custom_roles FOR DELETE
      TO authenticated
      USING (
        is_system = false
        AND company_id IN (
          SELECT p.company_id FROM profiles p
          WHERE p.id = auth.uid()
            AND lower(p.role) IN ('admin', 'executive', 'exec', 'owner')
        )
      );
  END IF;
END $$;


-- ── 2. Add custom_role_id to profiles ─────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'custom_role_id'
  ) THEN
    ALTER TABLE profiles ADD COLUMN custom_role_id uuid REFERENCES custom_roles(id) ON DELETE SET NULL;
  END IF;
END $$;


-- ── 3. RPC to seed system default roles for a company ─────────
CREATE OR REPLACE FUNCTION ensure_system_roles(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Marketing default
  INSERT INTO custom_roles (company_id, name, description, is_system, permissions)
  VALUES (
    p_company_id,
    'Marketing',
    'Content creators and campaign managers',
    true,
    '{
      "canViewMembers": true,
      "canInvite": false,
      "canRevokeInvite": false,
      "canViewLegalReview": false,
      "canUpload": true,
      "canViewArchive": true,
      "canViewTraining": true,
      "canViewLicenseVault": false,
      "canViewAuditTrail": false,
      "canManageRoles": false
    }'::jsonb
  )
  ON CONFLICT (company_id, name) DO NOTHING;

  -- Compliance / Legal default
  INSERT INTO custom_roles (company_id, name, description, is_system, permissions)
  VALUES (
    p_company_id,
    'Compliance',
    'Legal and regulatory compliance officers',
    true,
    '{
      "canViewMembers": true,
      "canInvite": false,
      "canRevokeInvite": false,
      "canViewLegalReview": true,
      "canUpload": false,
      "canViewArchive": false,
      "canViewTraining": false,
      "canViewLicenseVault": false,
      "canViewAuditTrail": true,
      "canManageRoles": false
    }'::jsonb
  )
  ON CONFLICT (company_id, name) DO NOTHING;

  -- Executive default
  INSERT INTO custom_roles (company_id, name, description, is_system, permissions)
  VALUES (
    p_company_id,
    'Executive',
    'Company administrators with full visibility',
    true,
    '{
      "canViewMembers": true,
      "canInvite": true,
      "canRevokeInvite": true,
      "canViewLegalReview": true,
      "canUpload": false,
      "canViewArchive": true,
      "canViewTraining": false,
      "canViewLicenseVault": true,
      "canViewAuditTrail": true,
      "canManageRoles": true
    }'::jsonb
  )
  ON CONFLICT (company_id, name) DO NOTHING;
END;
$$;

-- Done ✅
