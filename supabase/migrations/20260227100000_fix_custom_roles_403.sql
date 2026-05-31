-- ============================================================
-- FIX: custom_roles 403 errors
-- Creates a SECURITY DEFINER RPC for seeding system roles
-- so the browser never does direct INSERT/UPSERT on custom_roles.
-- ============================================================

-- A) Create/replace the idempotent seeding function
CREATE OR REPLACE FUNCTION public.ensure_system_roles(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER          -- runs as DB owner, bypasses RLS
SET search_path = public  -- security best-practice
AS $$
BEGIN
  INSERT INTO custom_roles (company_id, name, description, is_system, permissions)
  VALUES (
    p_company_id, 'Marketing', 'Content creators and campaign managers', true,
    '{"canViewMembers":true,"canInvite":false,"canRevokeInvite":false,"canViewLegalReview":false,"canUpload":true,"canViewArchive":true,"canViewTraining":true,"canViewLicenseVault":false,"canViewAuditTrail":false,"canManageRoles":false}'::jsonb
  ) ON CONFLICT (company_id, name) DO NOTHING;

  INSERT INTO custom_roles (company_id, name, description, is_system, permissions)
  VALUES (
    p_company_id, 'Compliance', 'Legal and regulatory compliance officers', true,
    '{"canViewMembers":true,"canInvite":false,"canRevokeInvite":false,"canViewLegalReview":true,"canUpload":false,"canViewArchive":false,"canViewTraining":false,"canViewLicenseVault":false,"canViewAuditTrail":true,"canManageRoles":false}'::jsonb
  ) ON CONFLICT (company_id, name) DO NOTHING;

  INSERT INTO custom_roles (company_id, name, description, is_system, permissions)
  VALUES (
    p_company_id, 'Executive', 'Company administrators with full visibility', true,
    '{"canViewMembers":true,"canInvite":true,"canRevokeInvite":true,"canViewLegalReview":true,"canUpload":false,"canViewArchive":true,"canViewTraining":false,"canViewLicenseVault":true,"canViewAuditTrail":true,"canManageRoles":true}'::jsonb
  ) ON CONFLICT (company_id, name) DO NOTHING;
END;
$$;

-- B) Allow any authenticated user to call this RPC
GRANT EXECUTE ON FUNCTION public.ensure_system_roles(uuid) TO authenticated;
