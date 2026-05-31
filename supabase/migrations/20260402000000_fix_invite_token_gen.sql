-- Fixes applied to create_company_invite:
--   1. gen_random_bytes qualified as extensions.gen_random_bytes (search_path = public excludes it)
--   2. p_role default changed from 'member' (not in enum) to 'viewer'
--   3. p_role cast to company_role enum on INSERT
--   4. token_hash (NOT NULL column added outside migrations) populated via sha256(token)

CREATE OR REPLACE FUNCTION create_company_invite(
  p_company_id       uuid,
  p_email            text,
  p_role             text    DEFAULT 'viewer',
  p_module_access    text[]  DEFAULT '{}',
  p_department_id    uuid    DEFAULT NULL,
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
  v_invite_id   uuid        := gen_random_uuid();
  v_token       text        := encode(extensions.gen_random_bytes(32), 'hex');
  v_token_hash  text        := encode(sha256(v_token::bytea), 'hex');
  v_expires_at  timestamptz := now() + (p_expires_in_hours || ' hours')::interval;
  v_admin_count integer;
BEGIN
  -- Permission check: caller must be admin/owner of the company
  IF NOT EXISTS (
    SELECT 1 FROM company_members
    WHERE company_id = p_company_id
      AND user_id    = auth.uid()
      AND role       IN ('admin', 'owner')
      AND status     = 'active'
  ) THEN
    RAISE EXCEPTION 'Only company admins can create invites.' USING ERRCODE = 'P0001';
  END IF;

  -- Admin cap: block if inviting a 4th admin
  IF p_role IN ('admin', 'owner') THEN
    SELECT COUNT(*) INTO v_admin_count
    FROM company_members
    WHERE company_id = p_company_id
      AND role       IN ('admin', 'owner')
      AND status     = 'active';

    IF v_admin_count >= 3 THEN
      RAISE EXCEPTION
        'Admin seat limit reached. A company may have a maximum of 3 admins. '
        'Remove an existing admin before inviting another.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Insert the invite
  INSERT INTO company_invites (
    id, company_id, email, role, module_access,
    department_id, token, token_hash, expires_at, created_by
  ) VALUES (
    v_invite_id, p_company_id, lower(trim(p_email)), p_role::company_role, p_module_access,
    p_department_id, v_token, v_token_hash, v_expires_at, auth.uid()
  );

  RETURN QUERY SELECT v_invite_id, v_token, v_expires_at;
END;
$$;
