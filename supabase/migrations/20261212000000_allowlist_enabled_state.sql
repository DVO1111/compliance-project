-- ============================================================================
--  The allowlist gains an enabled/disabled state, and an administrator
--  surface that is not the SQL console.
--
--  20261017000000 built the list and put it where a browser cannot read it:
--  RLS on, no policy, consulted only by a SECURITY DEFINER function. That
--  part is unchanged and deliberately so — the list of who has early access
--  to a compliance product is a list of a factory's quality staff, and it
--  must not be enumerable.
--
--  What it lacked was a way to take someone OFF the list without erasing the
--  fact that they were ever on it. DELETE loses the note, the date and who
--  added them, which on a controlled system is the record of a decision.
--  `is_enabled` makes removal reversible and auditable.
--
--  WHAT "REMOVAL" DOES AND DOES NOT DO — the question Task 2 asks to be
--  documented, answered here because this is where the switch lives:
--
--    * A disabled address can no longer CREATE an account. The
--      before-user-created hook calls app_signin_is_allowed and is refused.
--    * A disabled address can no longer PROVISION A PROFILE. The guard in
--      provision_profile calls the same function.
--    * An EXISTING user is NOT signed out and their session is NOT revoked.
--      Supabase access tokens are self-contained JWTs; nothing in the
--      database is consulted while one is still valid, so a session already
--      issued keeps working until it expires (one hour by default) and its
--      refresh token keeps minting new ones until it is revoked.
--    * Their DATA ACCESS is unaffected by this table, because RLS is written
--      against company membership, not against the allowlist.
--
--  So disabling an address is a gate on getting in, not a revocation. To
--  actually remove someone's access you must also remove their company
--  membership and revoke their sessions — see
--  `docs/ALLOWLIST_AND_RECOVERY.md`, which sets out the full sequence.
--  Saying this plainly matters more than the switch itself: an operator who
--  believes disabling is revocation has a false sense of having acted.
-- ============================================================================

ALTER TABLE public.allowed_signins
  ADD COLUMN IF NOT EXISTS is_enabled  boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS disabled_at timestamptz,
  ADD COLUMN IF NOT EXISTS disabled_by uuid REFERENCES auth.users (id) ON DELETE SET NULL;

--  The pair must agree, for the same reason a verification is a person and
--  a time or neither: "disabled, but nobody knows when" is not a record.
ALTER TABLE public.allowed_signins
  DROP CONSTRAINT IF EXISTS allowed_signins_disabled_shape_chk;

ALTER TABLE public.allowed_signins
  ADD CONSTRAINT allowed_signins_disabled_shape_chk CHECK (
    is_enabled = (disabled_at IS NULL)
  );

COMMENT ON COLUMN public.allowed_signins.is_enabled IS
  'False withdraws permission to create an account or provision a profile. '
  'It does NOT revoke an existing session or remove company membership.';


-- ── The gate, now reading the state ─────────────────────────────────────────
/*
 *  One behaviour is deliberately preserved from 20261017000000: an EMPTY
 *  table means the product is open. That is how the pilot is ended — by
 *  emptying the table, not by editing code — and the earlier migration's
 *  deploy guards assert it.
 *
 *  A table with only DISABLED rows is NOT empty and therefore NOT open. The
 *  distinction matters: if disabling every row opened the product to
 *  everyone, then revoking the last pilot user would silently publish the
 *  application. The rule is "no rows means open", never "no enabled rows".
 */
CREATE OR REPLACE FUNCTION public.app_signin_is_allowed(p_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT
    NOT EXISTS (SELECT 1 FROM public.allowed_signins)
    OR EXISTS (
      SELECT 1 FROM public.allowed_signins a
      WHERE a.email = lower(trim(coalesce(p_email, '')))
        AND a.is_enabled
    );
$$;

COMMENT ON FUNCTION public.app_signin_is_allowed(text) IS
  'True when the address may create an account and provision a profile. '
  'True for everyone when allowed_signins is empty; a table of disabled '
  'rows is not empty.';


-- ── Who may administer the list ─────────────────────────────────────────────
/*
 *  The same approver set the access-request flow already uses, rather than a
 *  new notion of administrator. A second list of administrators is a second
 *  thing to get wrong, and `access_approvers` is already seeded with the
 *  owner, already has RLS on with no policy, and is already the gate the
 *  approve-signup function checks.
 */
CREATE OR REPLACE FUNCTION public.app_is_allowlist_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.access_approvers a WHERE a.user_id = auth.uid()
     );
$$;


-- ── The administrator surface ───────────────────────────────────────────────
/*
 *  Three functions rather than table grants. A grant would let an approver
 *  write any column — including `email`, which the lower-case CHECK guards
 *  but which could still be rewritten to point a note at a different person
 *  — and would expose the whole table to `SELECT *`. These accept exactly
 *  what an administrator needs to decide, and normalise on the way in.
 *
 *  Every one re-checks the caller. The check is not in the route, the UI or
 *  a policy: it is in the function, so it holds however the function is
 *  reached.
 */

CREATE OR REPLACE FUNCTION public.admin_allowlist_list()
RETURNS TABLE (
  email       text,
  note        text,
  is_enabled  boolean,
  created_at  timestamptz,
  disabled_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NOT public.app_is_allowlist_admin() THEN
    RAISE EXCEPTION 'ALLOWLIST_NOT_PERMITTED' USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
    SELECT a.email, a.note, a.is_enabled, a.created_at, a.disabled_at
      FROM public.allowed_signins a
     ORDER BY a.is_enabled DESC, a.email;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_allowlist_add(
  p_email text,
  p_note  text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_email text := lower(trim(coalesce(p_email, '')));
BEGIN
  IF NOT public.app_is_allowlist_admin() THEN
    RAISE EXCEPTION 'ALLOWLIST_NOT_PERMITTED' USING ERRCODE = 'P0001';
  END IF;

  --  Shape-checked here as well as by the CHECK constraint, so the caller
  --  gets a message naming the problem rather than a constraint name.
  IF v_email NOT LIKE '%_@_%._%' THEN
    RAISE EXCEPTION 'ALLOWLIST_INVALID_EMAIL' USING ERRCODE = 'P0001';
  END IF;

  --  Re-adding a disabled address re-enables it rather than failing on the
  --  primary key, which is what an administrator means by "add them back",
  --  and keeps the original created_at as the record of first approval.
  INSERT INTO public.allowed_signins (email, note, added_by)
  VALUES (v_email, nullif(trim(coalesce(p_note, '')), ''), auth.uid())
  ON CONFLICT (email) DO UPDATE
    SET is_enabled  = true,
        disabled_at = NULL,
        disabled_by = NULL,
        note        = coalesce(
          nullif(trim(coalesce(p_note, '')), ''),
          public.allowed_signins.note
        );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_allowlist_set_enabled(
  p_email   text,
  p_enabled boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_email text := lower(trim(coalesce(p_email, '')));
  v_rows  integer;
BEGIN
  IF NOT public.app_is_allowlist_admin() THEN
    RAISE EXCEPTION 'ALLOWLIST_NOT_PERMITTED' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.allowed_signins
     SET is_enabled  = p_enabled,
         disabled_at = CASE WHEN p_enabled THEN NULL ELSE now() END,
         disabled_by = CASE WHEN p_enabled THEN NULL ELSE auth.uid() END
   WHERE email = v_email;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  --  Checked rather than assumed: an UPDATE that matched nothing "succeeds",
  --  so without this an administrator disabling a mistyped address would be
  --  told it worked.
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'ALLOWLIST_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

--  anon is given nothing. `authenticated` may CALL these, and every one
--  refuses a caller who is not an approver — which is what lets the UI
--  offer the screen without the database trusting the UI.
REVOKE ALL ON FUNCTION public.admin_allowlist_list()                FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_allowlist_add(text, text)       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_allowlist_set_enabled(text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.app_is_allowlist_admin()              FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_allowlist_list()                TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_allowlist_add(text, text)       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_allowlist_set_enabled(text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_is_allowlist_admin()              TO authenticated, service_role;

--  The gate itself must stay callable by the hook, which runs as the
--  service role, and by provision_profile.
GRANT EXECUTE ON FUNCTION public.app_signin_is_allowed(text) TO authenticated, service_role;


-- ── Deploy-time assertions ──────────────────────────────────────────────────
DO $$
BEGIN
  --  The guard in provision_profile must still be there. 20261017000000
  --  asserts this too; repeated here because THIS migration redefines
  --  app_signin_is_allowed, and a redefinition that broke the gate would
  --  otherwise pass unnoticed.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'provision_profile'
       AND pg_get_functiondef(p.oid) LIKE '%app_signin_is_allowed(v_email)%'
  ) THEN
    RAISE EXCEPTION
      'DEPLOY GUARD: provision_profile no longer carries the allowlist check on v_email';
  END IF;

  --  Case-insensitive, as the hook relies on.
  IF NOT public.app_signin_is_allowed('AYOMIDEELIJAH1@GMAIL.COM') THEN
    RAISE EXCEPTION 'DEPLOY GUARD: the gate became case-sensitive';
  END IF;

  IF public.app_signin_is_allowed('definitely-not-listed@example.invalid') THEN
    RAISE EXCEPTION 'DEPLOY GUARD: the gate admitted an unlisted address';
  END IF;

  --  And the new rule: a disabled address is refused.
  INSERT INTO public.allowed_signins (email, note, is_enabled, disabled_at)
  VALUES ('deploy-guard-disabled@example.invalid', 'deploy guard', false, now())
  ON CONFLICT (email) DO UPDATE SET is_enabled = false, disabled_at = now();

  IF public.app_signin_is_allowed('deploy-guard-disabled@example.invalid') THEN
    RAISE EXCEPTION 'DEPLOY GUARD: a disabled address was admitted';
  END IF;

  DELETE FROM public.allowed_signins
   WHERE email = 'deploy-guard-disabled@example.invalid';
END $$;
