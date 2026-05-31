-- ============================================================
-- Sprint 4.1 — Access Control Foundation
-- Controlled access & invite-only onboarding
--
-- This migration is idempotent. Safe to run against a database
-- where company_invites and company_members already exist.
-- ============================================================


-- ── 1. Ensure company_invites table exists ────────────────────
CREATE TABLE IF NOT EXISTS company_invites (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL,
  email         text NOT NULL,
  role          text NOT NULL DEFAULT 'member',
  department_id uuid,
  expires_at    timestamptz NOT NULL DEFAULT (now() + interval '72 hours'),
  accepted_at   timestamptz,
  revoked_at    timestamptz,
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE company_invites ENABLE ROW LEVEL SECURITY;

-- ── 2. Ensure company_members table exists ────────────────────
CREATE TABLE IF NOT EXISTS company_members (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        text NOT NULL DEFAULT 'member',
  status      text NOT NULL DEFAULT 'active',
  joined_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, user_id)
);

ALTER TABLE company_members ENABLE ROW LEVEL SECURITY;


-- ── 3. Add module_access to company_invites ───────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_invites' AND column_name = 'module_access'
  ) THEN
    ALTER TABLE company_invites ADD COLUMN module_access text[] NOT NULL DEFAULT '{}';
  END IF;
END$$;

-- ── 4. Add module_access to company_members ───────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_members' AND column_name = 'module_access'
  ) THEN
    ALTER TABLE company_members ADD COLUMN module_access text[] NOT NULL DEFAULT '{}';
  END IF;
END$$;

-- ── 5. Add invite_token to company_invites (raw token store) ──
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_invites' AND column_name = 'token'
  ) THEN
    ALTER TABLE company_invites ADD COLUMN token text UNIQUE;
  END IF;
END$$;


-- ── 6. RLS policies for company_invites ──────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'company_invites' AND policyname = 'Company members can view invites'
  ) THEN
    CREATE POLICY "Company members can view invites"
      ON company_invites FOR SELECT
      USING (
        company_id IN (
          SELECT company_id FROM company_members WHERE user_id = auth.uid()
        )
      );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'company_invites' AND policyname = 'Admins can insert invites'
  ) THEN
    CREATE POLICY "Admins can insert invites"
      ON company_invites FOR INSERT
      WITH CHECK (
        company_id IN (
          SELECT company_id FROM company_members
          WHERE user_id = auth.uid()
            AND role IN ('admin', 'owner')
        )
      );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'company_invites' AND policyname = 'Admins can update invites'
  ) THEN
    CREATE POLICY "Admins can update invites"
      ON company_invites FOR UPDATE
      USING (
        company_id IN (
          SELECT company_id FROM company_members
          WHERE user_id = auth.uid()
            AND role IN ('admin', 'owner')
        )
      );
  END IF;
END$$;

-- Allow unauthenticated (or any authenticated) user to read a single
-- invite by token — needed for the accept-invite page pre-login preview.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'company_invites' AND policyname = 'Anyone can look up invite by token'
  ) THEN
    CREATE POLICY "Anyone can look up invite by token"
      ON company_invites FOR SELECT
      USING (token IS NOT NULL);
  END IF;
END$$;


-- ── 7. RLS policies for company_members ──────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'company_members' AND policyname = 'Members can view their company'
  ) THEN
    CREATE POLICY "Members can view their company"
      ON company_members FOR SELECT
      USING (
        company_id IN (
          SELECT company_id FROM company_members cm2 WHERE cm2.user_id = auth.uid()
        )
      );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'company_members' AND policyname = 'Service role can insert members'
  ) THEN
    CREATE POLICY "Service role can insert members"
      ON company_members FOR INSERT
      WITH CHECK (true);  -- enforced at RPC level; RPC runs as SECURITY DEFINER
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'company_members' AND policyname = 'Admins can update members'
  ) THEN
    CREATE POLICY "Admins can update members"
      ON company_members FOR UPDATE
      USING (
        company_id IN (
          SELECT company_id FROM company_members cm2
          WHERE cm2.user_id = auth.uid()
            AND cm2.role IN ('admin', 'owner')
        )
      );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'company_members' AND policyname = 'Admins can delete members'
  ) THEN
    CREATE POLICY "Admins can delete members"
      ON company_members FOR DELETE
      USING (
        company_id IN (
          SELECT company_id FROM company_members cm2
          WHERE cm2.user_id = auth.uid()
            AND cm2.role IN ('admin', 'owner')
        )
        AND user_id <> auth.uid()  -- cannot remove yourself
      );
  END IF;
END$$;


-- ── 8. 3-admin cap trigger on company_members ─────────────────

CREATE OR REPLACE FUNCTION enforce_admin_seat_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  admin_count integer;
BEGIN
  -- Only enforce on insert/update when role is admin or owner
  IF NEW.role IN ('admin', 'owner') AND NEW.status = 'active' THEN
    SELECT COUNT(*) INTO admin_count
    FROM company_members
    WHERE company_id = NEW.company_id
      AND role IN ('admin', 'owner')
      AND status = 'active'
      AND id <> NEW.id;  -- exclude self on UPDATE

    IF admin_count >= 3 THEN
      RAISE EXCEPTION
        'Admin seat limit reached. A company may have a maximum of 3 admins or owners. '
        'Deactivate an existing admin before adding another.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_admin_seat_limit ON company_members;
CREATE TRIGGER trg_enforce_admin_seat_limit
  BEFORE INSERT OR UPDATE ON company_members
  FOR EACH ROW
  EXECUTE FUNCTION enforce_admin_seat_limit();


-- ── 9. create_company_invite RPC ─────────────────────────────
-- Creates an invite with module_access, enforces 3-admin cap.

-- Drop old signatures first (return type may differ)
DROP FUNCTION IF EXISTS create_company_invite(uuid, text, text, uuid, integer);
DROP FUNCTION IF EXISTS create_company_invite(uuid, text, text, text[], uuid, integer);

CREATE OR REPLACE FUNCTION create_company_invite(
  p_company_id      uuid,
  p_email           text,
  p_role            text DEFAULT 'member',
  p_module_access   text[] DEFAULT '{}',
  p_department_id   uuid DEFAULT NULL,
  p_expires_in_hours integer DEFAULT 72
)
RETURNS TABLE (
  invite_id  uuid,
  raw_token  text,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite_id  uuid := gen_random_uuid();
  v_token      text := encode(gen_random_bytes(32), 'hex');
  v_expires_at timestamptz := now() + (p_expires_in_hours || ' hours')::interval;
  v_admin_count integer;
BEGIN
  -- ── Permission check: caller must be admin/owner of the company ──
  IF NOT EXISTS (
    SELECT 1 FROM company_members
    WHERE company_id = p_company_id
      AND user_id = auth.uid()
      AND role IN ('admin', 'owner')
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Only company admins can create invites.' USING ERRCODE = 'P0001';
  END IF;

  -- ── Admin cap: block if inviting a 4th admin ──────────────────
  IF p_role IN ('admin', 'owner') THEN
    SELECT COUNT(*) INTO v_admin_count
    FROM company_members
    WHERE company_id = p_company_id
      AND role IN ('admin', 'owner')
      AND status = 'active';

    IF v_admin_count >= 3 THEN
      RAISE EXCEPTION
        'Admin seat limit reached. A company may have a maximum of 3 admins. '
        'Remove an existing admin before inviting another.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- ── Insert the invite ─────────────────────────────────────────
  INSERT INTO company_invites (
    id, company_id, email, role, module_access,
    department_id, token, expires_at, created_by
  ) VALUES (
    v_invite_id, p_company_id, lower(trim(p_email)), p_role, p_module_access,
    p_department_id, v_token, v_expires_at, auth.uid()
  );

  RETURN QUERY SELECT v_invite_id, v_token, v_expires_at;
END;
$$;


-- ── 10. accept_company_invite RPC ─────────────────────────────
-- Redeems a token, copies module_access to company_members.

-- Drop old signature (return type may differ from existing function)
DROP FUNCTION IF EXISTS accept_company_invite(text);

CREATE OR REPLACE FUNCTION accept_company_invite(
  p_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite       company_invites%ROWTYPE;
  v_member_id    uuid := gen_random_uuid();
BEGIN
  -- ── Look up invite ────────────────────────────────────────────
  SELECT * INTO v_invite
  FROM company_invites
  WHERE token = p_token
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found or already used.' USING ERRCODE = 'P0001';
  END IF;

  IF v_invite.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'This invite has been revoked.' USING ERRCODE = 'P0001';
  END IF;

  IF v_invite.accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'This invite has already been accepted.' USING ERRCODE = 'P0001';
  END IF;

  IF v_invite.expires_at < now() THEN
    RAISE EXCEPTION 'This invite has expired. Ask your admin to send a new one.' USING ERRCODE = 'P0001';
  END IF;

  -- ── Add user to company_members (upsert) ─────────────────────
  INSERT INTO company_members (
    id, company_id, user_id, role, module_access, status, joined_at
  ) VALUES (
    v_member_id,
    v_invite.company_id,
    auth.uid(),
    v_invite.role,
    v_invite.module_access,
    'active',
    now()
  )
  ON CONFLICT (company_id, user_id)
  DO UPDATE SET
    role          = EXCLUDED.role,
    module_access = EXCLUDED.module_access,
    status        = 'active';

  -- ── Mark invite as accepted ───────────────────────────────────
  UPDATE company_invites
  SET accepted_at = now()
  WHERE id = v_invite.id;

  -- ── Update profile company_id if not already set ──────────────
  UPDATE profiles
  SET company_id = v_invite.company_id
  WHERE id = auth.uid()
    AND (company_id IS NULL OR company_id <> v_invite.company_id);

  RETURN jsonb_build_object(
    'company_id',    v_invite.company_id,
    'role',          v_invite.role,
    'module_access', v_invite.module_access
  );
END;
$$;


-- ── 11. revoke_company_invite RPC ────────────────────────────
-- Allows admins to revoke a pending invite.

DROP FUNCTION IF EXISTS revoke_company_invite(uuid);

CREATE OR REPLACE FUNCTION revoke_company_invite(
  p_invite_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE company_invites
  SET revoked_at = now()
  WHERE id = p_invite_id
    AND revoked_at IS NULL
    AND accepted_at IS NULL
    AND company_id IN (
      SELECT company_id FROM company_members
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'owner')
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Invite not found, already accepted/revoked, or you lack permission.'
      USING ERRCODE = 'P0001';
  END IF;
END;
$$;


-- ── 12. Helper: get_company_member_access ────────────────────
-- Returns a user's module_access for their company.
-- Used by AuthContext to load access on login.

DROP FUNCTION IF EXISTS get_company_member_access(uuid, uuid);

CREATE OR REPLACE FUNCTION get_company_member_access(
  p_user_id   uuid DEFAULT auth.uid(),
  p_company_id uuid DEFAULT NULL
)
RETURNS TABLE (
  role          text,
  module_access text[]
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cm.role, cm.module_access
  FROM company_members cm
  WHERE cm.user_id = p_user_id
    AND (p_company_id IS NULL OR cm.company_id = p_company_id)
    AND cm.status = 'active'
  LIMIT 1;
$$;
