-- ============================================================
-- Fix: company_members infinite-recursion RLS + departments RLS
--        + get_or_create_company RPC role fix
--
-- Problem 1: The SELECT policy on company_members references
-- company_members itself, causing Postgres to detect infinite
-- recursion.  Fix: use profiles.company_id (a separate table)
-- to resolve the user's company, avoiding the self-referencing loop.
--
-- Problem 2: The departments table has RLS enabled but lacks
-- INSERT/UPDATE/DELETE policies for authenticated users.
--
-- Problem 3: The get_or_create_company RPC was creating members
-- with a non-owner role.  Normal signup users should be owners.
--
-- Problem 4: UPDATE/DELETE policies on company_members also
-- self-reference company_members causing the same recursion.
-- Fix: use profiles.company_id + a helper function SECURITY DEFINER.
-- ============================================================


-- ── 0. Helper: check if user is admin/owner (avoids RLS recursion) ──
-- This function runs as SECURITY DEFINER so it bypasses RLS and can
-- safely query company_members without triggering the recursive policy.

CREATE OR REPLACE FUNCTION is_company_admin(p_company_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM company_members
    WHERE company_id = p_company_id
      AND user_id = p_user_id
      AND role IN ('admin', 'owner')
      AND status = 'active'
  );
$$;


-- ── 1. Fix company_members SELECT policy ──────────────────────
-- Use profiles.company_id instead of self-referencing company_members.

DROP POLICY IF EXISTS "Members can view their company" ON company_members;

CREATE POLICY "Members can view their company"
  ON company_members FOR SELECT
  USING (
    company_id IN (
      SELECT p.company_id FROM profiles p WHERE p.id = auth.uid()
    )
  );

-- ── 2. Fix company_members UPDATE policy ──────────────────────
-- Use the SECURITY DEFINER helper to avoid RLS recursion.

DROP POLICY IF EXISTS "Admins can update members" ON company_members;

CREATE POLICY "Admins can update members"
  ON company_members FOR UPDATE
  USING (
    company_id IN (
      SELECT p.company_id FROM profiles p WHERE p.id = auth.uid()
    )
    AND is_company_admin(company_id)
  );

-- ── 3. Fix company_members DELETE policy ──────────────────────

DROP POLICY IF EXISTS "Admins can delete members" ON company_members;

CREATE POLICY "Admins can delete members"
  ON company_members FOR DELETE
  USING (
    company_id IN (
      SELECT p.company_id FROM profiles p WHERE p.id = auth.uid()
    )
    AND is_company_admin(company_id)
    AND user_id <> auth.uid()  -- cannot remove yourself
  );


-- ── 4. Fix company_invites policies ───────────────────────────
-- Same recursion fix: use profiles + is_company_admin helper.

DROP POLICY IF EXISTS "Company members can view invites" ON company_invites;

CREATE POLICY "Company members can view invites"
  ON company_invites FOR SELECT
  USING (
    company_id IN (
      SELECT p.company_id FROM profiles p WHERE p.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins can insert invites" ON company_invites;

CREATE POLICY "Admins can insert invites"
  ON company_invites FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT p.company_id FROM profiles p WHERE p.id = auth.uid()
    )
    AND is_company_admin(company_id)
  );

DROP POLICY IF EXISTS "Admins can update invites" ON company_invites;

CREATE POLICY "Admins can update invites"
  ON company_invites FOR UPDATE
  USING (
    company_id IN (
      SELECT p.company_id FROM profiles p WHERE p.id = auth.uid()
    )
    AND is_company_admin(company_id)
  );


-- ── 5. Departments table + RLS policies ───────────────────────

CREATE TABLE IF NOT EXISTS departments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL,
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE departments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view departments" ON departments;
DROP POLICY IF EXISTS "Admins can insert departments" ON departments;
DROP POLICY IF EXISTS "Admins can update departments" ON departments;
DROP POLICY IF EXISTS "Admins can delete departments" ON departments;

CREATE POLICY "Members can view departments"
  ON departments FOR SELECT
  USING (
    company_id IN (
      SELECT p.company_id FROM profiles p WHERE p.id = auth.uid()
    )
  );

CREATE POLICY "Admins can insert departments"
  ON departments FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT p.company_id FROM profiles p WHERE p.id = auth.uid()
    )
    AND is_company_admin(company_id)
  );

CREATE POLICY "Admins can update departments"
  ON departments FOR UPDATE
  USING (
    company_id IN (
      SELECT p.company_id FROM profiles p WHERE p.id = auth.uid()
    )
    AND is_company_admin(company_id)
  );

CREATE POLICY "Admins can delete departments"
  ON departments FOR DELETE
  USING (
    company_id IN (
      SELECT p.company_id FROM profiles p WHERE p.id = auth.uid()
    )
    AND is_company_admin(company_id)
  );


-- ── 6. Add department_id FK to company_members if missing ─────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_members' AND column_name = 'department_id'
  ) THEN
    ALTER TABLE company_members ADD COLUMN department_id uuid REFERENCES departments(id) ON DELETE SET NULL;
  END IF;
END$$;


-- ── 7. Fix get_or_create_company RPC ──────────────────────────
-- Ensure the founding user who creates the company is set as 'owner'.
-- This replaces any previous version that set 'member' or 'viewer'.

CREATE OR REPLACE FUNCTION get_or_create_company(p_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  -- Try to find existing company by name
  SELECT id INTO v_company_id
  FROM companies
  WHERE lower(trim(name)) = lower(trim(p_name))
  LIMIT 1;

  -- If not found, create it
  IF v_company_id IS NULL THEN
    INSERT INTO companies (name)
    VALUES (trim(p_name))
    RETURNING id INTO v_company_id;
  END IF;

  -- Upsert the caller as owner in company_members
  INSERT INTO company_members (company_id, user_id, role, status, joined_at)
  VALUES (v_company_id, auth.uid(), 'owner', 'active', now())
  ON CONFLICT (company_id, user_id)
  DO UPDATE SET role = 'owner', status = 'active';

  RETURN v_company_id;
END;
$$;


-- ── 8. Fix existing users stuck with wrong role ───────────────
-- Any user who is the ONLY member of their company should be 'owner'.
-- This fixes users who signed up before this fix was applied.

UPDATE company_members cm
SET role = 'owner'
WHERE role NOT IN ('owner', 'admin')
  AND NOT EXISTS (
    SELECT 1 FROM company_members cm2
    WHERE cm2.company_id = cm.company_id
      AND cm2.id <> cm.id
  );
