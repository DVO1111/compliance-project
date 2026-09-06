-- =====================================================================
--  SECURE PROFILE PROVISIONING
-- =====================================================================
--  THE HOLE
--  --------
--    CREATE POLICY "Users can insert own profile"
--      ON profiles FOR INSERT TO authenticated
--      WITH CHECK (auth.uid() = id);          -- 20260211143037
--
--  The predicate constrains exactly one column. Every other column is
--  whatever the client sends, and profiles carries three that are
--  privilege, not data:
--
--    role            'admin' | 'compliance_officer' | 'content_creator'
--    custom_role_id  -> custom_roles.permissions, an arbitrary jsonb
--                       permission set
--    company_id      the tenant the row belongs to
--
--  So any authenticated user could create their first profile as an admin
--  of any company id they cared to name. 20260906000000 closed the UPDATE
--  route with a guard trigger and said explicitly that INSERT was left
--  open because closing it needs a server-side provisioning path. This is
--  that path.
--
--  WHAT REPLACES IT
--  ----------------
--  provision_profile() is SECURITY DEFINER with a fixed search_path. It
--  takes no role and no custom_role_id parameter AT ALL — the safest way
--  to keep a field out of client control is to give the client nowhere to
--  put it. The id is auth.uid() and is never a parameter either.
--
--  company_id IS a parameter, because normal signup has to name the
--  company create_company() just made. It is checked, not trusted: the
--  caller must already hold an ACTIVE company_members row for it. That
--  check is what makes the parameter safe, and it is why the ordering in
--  the client matters — create_company() creates the membership in its
--  own transaction before this function is called.
--
--  ADJACENT HOLE FOUND WHILE REVOKING, AND CLOSED HERE
--  ---------------------------------------------------
--  authenticated and anon hold table-level INSERT, UPDATE, DELETE and
--  TRUNCATE on profiles. Dropping the policy stops INSERT, because RLS
--  denies what no policy permits — but TRUNCATE IS NOT SUBJECT TO RLS.
--  Verified on a local database: as authenticated,
--
--    TRUNCATE public.profiles CASCADE;   -- SUCCEEDS
--
--  and cascades into risk_links, correlation_events, ai_asset_controls,
--  api_keys, webhook_subscriptions, webhook_deliveries, api_request_logs
--  and capa_actions. Every profile in every tenant, from any logged-in
--  account. This is the same class of bug 20260908000000 fixed on
--  company_members, on a table this migration is already revoking from,
--  so it is closed here rather than left for later. DELETE is left alone:
--  RLS does restrain it (verified: 0 rows affected) and "Users can update
--  own profile" style self-service deletes are not in question here.
--
--  REVERSIBILITY
--  -------------
--  To revert: recreate the policy from 20260211143037, re-grant INSERT,
--  and drop provision_profile(). The trigger and accept_company_invite()
--  changes below are independent of the policy and can stay.
-- =====================================================================


-- ── 1. The provisioning RPC ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.provision_profile(
  p_email                text,
  p_full_name            text    DEFAULT NULL,
  p_organization         text    DEFAULT NULL,
  p_company_id           uuid    DEFAULT NULL,
  p_onboarding_completed boolean DEFAULT false,
  p_industry_type        text    DEFAULT NULL,
  p_default_jurisdiction text    DEFAULT NULL,
  p_primary_markets      text[]  DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_email   text;
  v_id      uuid;
  v_row     public.profiles%ROWTYPE;
BEGIN
  -- ── identity ───────────────────────────────────────────────────────
  -- The id is the session's, full stop. There is no parameter for it, so
  -- there is nothing to validate and nothing to spoof.
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'PROFILE_NOT_AUTHENTICATED: a profile can only be provisioned by a signed-in user'
      USING ERRCODE = 'P0001';
  END IF;

  -- Prefer the address Supabase Auth holds over the one the client sent.
  -- They are the same in the real flow; if they ever differ, the verified
  -- one is the truthful one. p_email remains the fallback for accounts
  -- with no email on the auth row (phone signup).
  SELECT u.email INTO v_email FROM auth.users u WHERE u.id = v_uid;
  v_email := coalesce(nullif(btrim(v_email), ''), nullif(btrim(p_email), ''));
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'PROFILE_EMAIL_REQUIRED: an email address is required'
      USING ERRCODE = 'P0001';
  END IF;

  -- ── tenancy ────────────────────────────────────────────────────────
  -- The one client-supplied privileged field. A caller may name a company
  -- only if they are ALREADY an active member of it — which, on the normal
  -- signup path, create_company() has just made them.
  IF p_company_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.company_members m
        WHERE m.company_id = p_company_id
          AND m.user_id    = v_uid
          AND m.status     = 'active') THEN
    RAISE EXCEPTION 'PROFILE_COMPANY_FORBIDDEN: caller is not an active member of the named company'
      USING ERRCODE = 'P0001';
  END IF;

  -- ── the write ──────────────────────────────────────────────────────
  --  role is written by the server as the least-privileged value the
  --  CHECK constraint allows, which is also the column default and
  --  therefore exactly what the previous client INSERT produced. No
  --  behaviour changes; the difference is that it is no longer possible
  --  to ask for anything else. custom_role_id is written NULL for the
  --  same reason: a custom role is granted by an admin afterwards, never
  --  claimed at signup.
  --
  --  ON CONFLICT DO NOTHING makes a retried signup idempotent. It is
  --  deliberately DO NOTHING rather than DO UPDATE: an upsert here would
  --  fire the UPDATE path and hand a caller a second way to move their
  --  own company_id, which is precisely what 20260906000000's guard
  --  exists to prevent.
  INSERT INTO public.profiles (
    id, email, full_name, organization, company_id,
    onboarding_completed, industry_type, default_jurisdiction, primary_markets,
    role, custom_role_id
  ) VALUES (
    v_uid,
    v_email,
    nullif(btrim(coalesce(p_full_name, '')), ''),
    nullif(btrim(coalesce(p_organization, '')), ''),
    p_company_id,
    coalesce(p_onboarding_completed, false),
    nullif(btrim(coalesce(p_industry_type, '')), ''),
    nullif(btrim(coalesce(p_default_jurisdiction, '')), ''),
    coalesce(p_primary_markets, '{}'::text[]),
    'content_creator',
    NULL
  )
  ON CONFLICT (id) DO NOTHING
  RETURNING id INTO v_id;

  SELECT * INTO v_row FROM public.profiles WHERE id = v_uid;

  RETURN jsonb_build_object(
    'id',         v_row.id,
    'company_id', v_row.company_id,
    'role',       v_row.role,
    -- false means a row was already there and was left untouched
    'created',    v_id IS NOT NULL
  );
END
$$;

COMMENT ON FUNCTION public.provision_profile(text,text,text,uuid,boolean,text,text,text[]) IS
  'Creates the caller''s own profile. id comes from auth.uid(); role and custom_role_id are server-assigned and have no parameters; company_id is accepted only if the caller already holds an active company_members row for it. Idempotent: a second call leaves the existing row untouched.';

REVOKE ALL ON FUNCTION public.provision_profile(text,text,text,uuid,boolean,text,text,text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provision_profile(text,text,text,uuid,boolean,text,text,text[]) TO authenticated;


-- ── 2. Close the direct INSERT route ─────────────────────────────────
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

-- The policy is the RLS half. The privilege is the other half, and
-- TRUNCATE bypasses RLS entirely — see the header.
DO $revoke$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE INSERT, TRUNCATE ON public.profiles FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE INSERT, TRUNCATE ON public.profiles FROM anon;
  END IF;
END
$revoke$;


-- ── 3. The guard trigger vs. accept_company_invite() ─────────────────
--  MEASURED, NOT ASSUMED. accept_company_invite() ends with
--
--    UPDATE profiles SET company_id = v_invite.company_id
--     WHERE id = auth.uid() AND (company_id IS NULL OR company_id <> …);
--
--  which is exactly what 20260906000000's guard forbids. Run against a
--  local database as the authenticated invitee, it SUCCEEDS today. The
--  reason it succeeds is worth writing down, because it is not by design:
--
--    inside a SECURITY DEFINER function owned by postgres,
--      current_user            = postgres
--      current_setting('role') = authenticated   (the GUC survives)
--      pg_has_role(postgres, service_role, MEMBER) = TRUE
--
--  So the trigger's service_role exemption fires — not because this call
--  is trusted, but because the deployment happens to grant service_role
--  to postgres. Every SECURITY DEFINER function owned by postgres is
--  exempt on that basis, and any deployment WITHOUT that grant breaks
--  invite acceptance with PROFILES_COMPANY_IMMUTABLE.
--
--  This replaces the ambient reason with a stated one. The new exemption
--  is strictly NARROWER than the one it supplements, not wider:
--
--    * it is transaction-local (set_config(..., true)), so it cannot
--      leak between PostgREST requests, and set_config itself lives in
--      pg_catalog and is not exposed as an RPC;
--    * accept_company_invite() clears it immediately after its UPDATE;
--    * it permits company_id ONLY. role and custom_role_id stay refused
--      no matter what the flag says, so even a leaked flag cannot be
--      turned into self-promotion.
--
--  The existing service_role exemption is left exactly as it is. Removing
--  it is a bigger change than this one and would need every other
--  definer-owned writer audited first.
CREATE OR REPLACE FUNCTION public.profiles_guard_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_service oid := to_regrole('service_role');
  v_assigning boolean := coalesce(current_setting('app.profile_company_assign', true), '') = '1';
BEGIN
  -- to_regrole() rather than a bare name: pg_has_role() raises if the role
  -- does not exist, which would turn a missing role into a failed UPDATE.
  IF current_setting('role', true) = 'service_role'
     OR (v_service IS NOT NULL AND pg_has_role(current_user, v_service, 'MEMBER')) THEN
    RETURN NEW;
  END IF;

  -- company_id: refused, unless a trusted RPC has declared this statement
  -- to be an invite acceptance.
  IF NEW.company_id IS DISTINCT FROM OLD.company_id AND NOT v_assigning THEN
    RAISE EXCEPTION 'PROFILES_COMPANY_IMMUTABLE: company_id cannot be changed through a profile update'
      USING ERRCODE = 'P0001';
  END IF;

  -- role and custom_role_id: refused unconditionally. The flag above does
  -- not reach these two, deliberately.
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'PROFILES_ROLE_IMMUTABLE: role cannot be changed through a profile update'
      USING ERRCODE = 'P0001';
  END IF;

  -- custom_roles.permissions is a jsonb permission set, so custom_role_id
  -- carries privilege exactly as role does.
  IF NEW.custom_role_id IS DISTINCT FROM OLD.custom_role_id THEN
    RAISE EXCEPTION 'PROFILES_ROLE_IMMUTABLE: custom_role_id cannot be changed through a profile update'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END
$$;

COMMENT ON FUNCTION public.profiles_guard_privileged_columns() IS
  'Blocks self-service changes to profiles.company_id, role and custom_role_id. service_role is exempt. accept_company_invite() may set company_id only, by declaring app.profile_company_assign for the length of its own statement; role and custom_role_id are refused regardless.';


-- ── 4. accept_company_invite(), declaring what it is doing ───────────
--  Verbatim from 20260329000000 apart from the two set_config calls that
--  bracket the profile UPDATE.
CREATE OR REPLACE FUNCTION public.accept_company_invite(
  p_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
  --  The membership row above is written first and is the authority; this
  --  only mirrors it onto the profile. The flag is raised for this one
  --  statement and lowered immediately, and it cannot authorise a role or
  --  custom_role_id change even while raised.
  PERFORM set_config('app.profile_company_assign', '1', true);
  UPDATE profiles
  SET company_id = v_invite.company_id
  WHERE id = auth.uid()
    AND (company_id IS NULL OR company_id <> v_invite.company_id);
  PERFORM set_config('app.profile_company_assign', '', true);

  RETURN jsonb_build_object(
    'company_id',    v_invite.company_id,
    'role',          v_invite.role,
    'module_access', v_invite.module_access
  );
END;
$$;

COMMENT ON FUNCTION public.accept_company_invite(text) IS
  'Redeems an invite token: writes the company_members row, marks the invite accepted, and mirrors company_id onto the caller''s profile. The profile write declares app.profile_company_assign so it does not depend on postgres happening to be a member of service_role.';
