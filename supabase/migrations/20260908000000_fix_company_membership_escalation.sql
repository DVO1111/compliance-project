-- =====================================================================
--  FIX: company membership escalation  (Finding A, A2, A3)
-- =====================================================================
--  Three routes led to the same outcome — an outsider obtaining
--  membership, and usually ownership, of somebody else's tenant. All
--  three are closed here. They are ordered least- to most-behaviour-
--  changing, so a partial failure leaves the system no worse than it
--  started.
--
--  Why this matters beyond one table: app_is_company_member() and
--  app_has_company_role() resolve tenancy for policies across the whole
--  schema, and both read company_members. Anyone who can write that
--  table defeats every policy built on them, including the lifecycle
--  engine's.
--
-- ---------------------------------------------------------------------
--  A3 — every pending invite token was world-readable
-- ---------------------------------------------------------------------
--    CREATE POLICY "Anyone can look up invite by token"
--      ON company_invites FOR SELECT USING (token IS NOT NULL);
--
--  token is always populated, so the predicate is USING (true), and the
--  policy has no TO clause, so it applies to anon as well. Verified
--  against a local database: an unauthenticated caller could read every
--  pending invite's token, target address and granted role, then pass
--  the token to accept_company_invite() to obtain that role.
--
--  Nothing reads it. AcceptInvitePage.tsx only calls the RPC, and
--  InvitesPage.tsx lists invites filtered by company_id without
--  selecting token — which the surviving "Company members can view
--  invites" policy already serves. So the policy is dropped outright.
--
-- ---------------------------------------------------------------------
--  A1 — anyone could insert themselves into any company
-- ---------------------------------------------------------------------
--    CREATE POLICY "Service role can insert members"
--      ON company_members FOR INSERT
--      WITH CHECK (true);  -- enforced at RPC level; RPC runs as SECURITY DEFINER
--
--  The comment states the intent; the SQL does not implement it. A
--  policy cannot restrict writes to an RPC, because PostgREST exposes
--  the table itself at POST /rest/v1/company_members, and with no TO
--  clause the policy admits anon and authenticated alike.
--
--  20260331000000_fix_company_members_and_departments_rls.sql later
--  revisited this table and rewrote its SELECT, UPDATE and DELETE
--  policies. INSERT was the one verb it did not revisit.
--
--  No replacement policy is added. Both legitimate writers are SECURITY
--  DEFINER functions owned by a superuser, so they bypass RLS entirely
--  and keep working with no policy at all. The privilege is revoked as
--  well as the policy, because a policy alone cannot stop TRUNCATE.
--
-- ---------------------------------------------------------------------
--  A2 — signing up with an existing company's name made you its owner
-- ---------------------------------------------------------------------
--  get_or_create_company() matched an existing tenant case-insensitively
--  by NAME and then upserted the caller as owner:
--
--    SELECT id INTO v_company_id FROM companies
--     WHERE lower(trim(name)) = lower(trim(p_name));
--    ...
--    ON CONFLICT (company_id, user_id) DO UPDATE SET role = 'owner';
--
--  This was the most reachable of the three: it needed no knowledge of
--  the API, only typing a company's name into the signup form.
--
--  A name is a label people choose, not a secret and not an identifier,
--  so it must never confer membership. create_company() therefore always
--  creates a new company. Joining an existing tenant now happens only by
--  invite. Two tenants may share a display name; their ids differ, and
--  nothing in the security model reads the name.
--
--  get_or_create_company() is kept as a thin delegate rather than
--  dropped, so that the fix holds regardless of whether this migration
--  or the frontend change deploys first.
-- =====================================================================


-- ── A3 ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anyone can look up invite by token" ON public.company_invites;


-- ── A1 ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Service role can insert members" ON public.company_members;

-- TRUNCATE is included deliberately: it is not subject to row level
-- security, so no policy can restrain it. Revoking it stops an
-- authenticated caller from emptying the membership table outright.
-- UPDATE and DELETE are left in place — "Admins can update members" and
-- "Admins can delete members" are correctly scoped and MembersPage
-- depends on them.
DO $revoke$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE INSERT, TRUNCATE ON public.company_members FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE INSERT, TRUNCATE ON public.company_members FROM anon;
  END IF;
END
$revoke$;


-- ── A2 ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_company(p_name text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_id   uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'COMPANY_NOT_AUTHENTICATED: a company can only be created by a signed-in user'
      USING ERRCODE = 'P0001';
  END IF;
  IF v_name = '' THEN
    RAISE EXCEPTION 'COMPANY_NAME_REQUIRED: a company name is required'
      USING ERRCODE = 'P0001';
  END IF;

  -- Always a new row. No lookup by name: see the header.
  INSERT INTO public.companies (name) VALUES (v_name) RETURNING id INTO v_id;

  -- The company was created in this statement, so no conflict is
  -- possible; the caller is its first and only member.
  INSERT INTO public.company_members (company_id, user_id, role, status, joined_at)
  VALUES (v_id, v_uid, 'owner', 'active', now());

  RETURN v_id;
END
$$;

COMMENT ON FUNCTION public.create_company(text) IS
  'Creates a new company and makes the caller its owner. Never joins an existing company: a company name is a display label and confers no membership. Joining an existing tenant happens only through accept_company_invite().';

-- Retained so an older frontend cannot reach the vulnerable behaviour.
CREATE OR REPLACE FUNCTION public.get_or_create_company(p_name text)
RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.create_company(p_name);
$$;

COMMENT ON FUNCTION public.get_or_create_company(text) IS
  'DEPRECATED — delegates to create_company(). It no longer "gets": matching an existing company by name granted ownership of it. Use create_company(); this exists only so an older client cannot reach the old behaviour.';

REVOKE ALL ON FUNCTION public.create_company(text)        FROM public;
REVOKE ALL ON FUNCTION public.get_or_create_company(text) FROM public;
GRANT EXECUTE ON FUNCTION public.create_company(text)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_company(text) TO authenticated;
