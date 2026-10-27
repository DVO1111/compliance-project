-- ============================================================================
--  CLOSED BY DEFAULT: an empty allowlist denies, it does not admit.
--
--  ── WHAT THIS CHANGES, AND WHAT IT DOES NOT ────────────────────────────────
--
--  `app_signin_is_allowed()` read:
--
--      NOT EXISTS (SELECT 1 FROM allowed_signins)      <- the open door
--      OR EXISTS (... email matches AND is_enabled)
--
--  The first clause made an EMPTY allowlist admit everyone. That was written
--  as a bootstrap affordance, and it was not needed for one:
--  20261017000000_signin_allowlist.sql seeds the owner's address in the same
--  migration that creates the table, precisely so that applying it cannot
--  lock the owner out. The table is therefore never empty on a project built
--  from this history — the open door only ever applied if somebody emptied
--  it, which is the exact moment the product should be closed, not open.
--
--  After this migration the gate is the second clause alone, plus one
--  explicit switch:
--
--      empty allowlist                 -> DENY
--      rows, all disabled              -> DENY
--      enabled row matching the email  -> ALLOW
--      disabled or unlisted address    -> DENY
--      public signup deliberately on   -> ALLOW
--
--  Nothing else moves. Both gates keep calling this one function, so the
--  signup hook and `provision_profile` cannot drift apart.
--
--  ── WHY NOBODY LOSES ACCESS ────────────────────────────────────────────────
--
--  Checked rather than asserted: `app_signin_is_allowed` is called by
--  `provision_profile` and by the before-user-created hook, and BY NOTHING
--  ELSE — no RLS policy, no view, no trigger. So it governs creating an Auth
--  user and provisioning a profile, and it has no part in authenticating a
--  session or in resolving a membership. Changing it cannot sign anyone out
--  and cannot remove anyone from a company.
--
--  It also changes nothing for a project whose allowlist already has rows:
--  for those, `NOT EXISTS` was already false and the gate was already the
--  matching clause alone. The only behaviour that changes is the empty-table
--  case.
--
--  ── TURNING PUBLIC SIGNUP ON IS NOW A DECISION ─────────────────────────────
--
--  Not the absence of data. `signin_policy` holds one row and the switch
--  defaults to false; opening it requires a reason and records who did it
--  and when. An operator who wants an open product has to say so.
-- ============================================================================

-- ── 1. The policy row ───────────────────────────────────────────────────────
/*
 *  One row, enforced by the primary key rather than by a trigger: `id` is a
 *  boolean that must be true, so a second row cannot exist. Platform-wide
 *  on purpose — signup happens before any company does, so this cannot hang
 *  off company_id the way access_settings does.
 */
CREATE TABLE IF NOT EXISTS public.signin_policy (
  id                    boolean PRIMARY KEY DEFAULT true,
  public_signup_enabled boolean NOT NULL DEFAULT false,
  --  "Open, but nobody knows who opened it or why" is not a record. Same
  --  reasoning as allowed_signins.disabled_at/disabled_by.
  reason                text,
  enabled_at            timestamptz,
  enabled_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT signin_policy_single_row CHECK (id),
  CONSTRAINT signin_policy_open_is_accounted_for CHECK (
    NOT public_signup_enabled
    OR (enabled_at IS NOT NULL AND reason IS NOT NULL AND btrim(reason) <> '')
  )
);

INSERT INTO public.signin_policy (id, public_signup_enabled)
VALUES (true, false)
ON CONFLICT (id) DO NOTHING;

--  No policy, deliberately — the same treatment allowed_signins gets. Whether
--  a product is in closed pilot is not something a browser needs to read, and
--  the functions below are the only way in.
ALTER TABLE public.signin_policy ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.signin_policy FROM anon, authenticated;
GRANT SELECT ON public.signin_policy TO service_role;

COMMENT ON TABLE public.signin_policy IS
  'Platform-wide signup policy. One row. public_signup_enabled defaults to '
  'false: an empty allowlist denies rather than admits, and opening signup '
  'to the public is an explicit change recorded with a reason.';


-- ── 2. Reading the switch ───────────────────────────────────────────────────
/*
 *  A function rather than an inline subquery, so the gate below reads as one
 *  sentence and so the default survives a missing row: a database whose
 *  policy row was deleted is CLOSED, not open.
 */
CREATE OR REPLACE FUNCTION public.app_public_signup_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT coalesce(
    (SELECT s.public_signup_enabled FROM public.signin_policy s WHERE s.id),
    false);
$$;

COMMENT ON FUNCTION public.app_public_signup_enabled() IS
  'True only when an operator has deliberately opened public signup. False '
  'when the policy row is missing, so a damaged configuration is closed.';


-- ── 3. The gate, with the open door removed ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.app_signin_is_allowed(p_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  --  Normalisation is unchanged and must stay identical to the hook's, or an
  --  address approved in the table would be refused at signup.
  SELECT EXISTS (
      SELECT 1 FROM public.allowed_signins a
       WHERE a.email = lower(trim(coalesce(p_email, '')))
         AND a.is_enabled
    )
    OR public.app_public_signup_enabled();
$$;

COMMENT ON FUNCTION public.app_signin_is_allowed(text) IS
  'True when the address may create an account and provision a profile. An '
  'empty or all-disabled allowlist denies everyone; public signup must be '
  'turned on deliberately in signin_policy.';

--  20261017000000's COMMENT still says an empty table opens the product.
--  Replaced here rather than by editing that migration: it is applied
--  history and describes what was true when it ran, and rewriting it would
--  make the deployed database and the file disagree for anyone who has
--  already applied it.
COMMENT ON TABLE public.allowed_signins IS
  'Addresses permitted to create an account and provision a profile. Only '
  'rows with is_enabled match. An EMPTY table denies everyone — it does not '
  'open the product, as it did before 20261214000000 — and opening signup '
  'to the public is a deliberate change in signin_policy.';


-- ── 4. The administrator surface for the switch ─────────────────────────────
/*
 *  Reuses app_is_allowlist_admin — the approver set the access-request flow
 *  already has — rather than inventing a second idea of who may change this.
 *  The caller is re-checked inside the function, so the check holds however
 *  the function is reached.
 */
CREATE OR REPLACE FUNCTION public.admin_set_public_signup(
  p_enabled boolean,
  p_reason  text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
BEGIN
  IF NOT public.app_is_allowlist_admin() THEN
    RAISE EXCEPTION 'ALLOWLIST_NOT_PERMITTED' USING ERRCODE = 'P0001';
  END IF;

  --  Opening the product to anyone is the one change here that cannot be
  --  undone quietly, so it has to be explained. Closing it needs no reason.
  IF p_enabled AND v_reason IS NULL THEN
    RAISE EXCEPTION
      'SIGNUP_POLICY_REASON_REQUIRED: opening public signup must record why'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.signin_policy (id, public_signup_enabled, reason, enabled_at, enabled_by, updated_at)
  VALUES (true, p_enabled, v_reason,
          CASE WHEN p_enabled THEN now() END,
          CASE WHEN p_enabled THEN auth.uid() END,
          now())
  ON CONFLICT (id) DO UPDATE
    SET public_signup_enabled = EXCLUDED.public_signup_enabled,
        reason      = EXCLUDED.reason,
        enabled_at  = EXCLUDED.enabled_at,
        enabled_by  = EXCLUDED.enabled_by,
        updated_at  = now();
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_public_signup(boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_public_signup(boolean, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_public_signup_enabled() TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_set_public_signup(boolean, text) IS
  'Approver-only. Turns public signup on or off; turning it on requires a '
  'reason, which is stored with the actor and the time.';


-- ── 5. Refuse to leave the project unreachable ──────────────────────────────
/*
 *  This migration tightens a gate, so the one way it could do harm is by
 *  being applied to a database that has no enabled address — which would
 *  deny everyone, including the person applying it, with no way back in
 *  through signup.
 *
 *  20261017000000 seeds two addresses, so this holds on any project built
 *  from this history. It is asserted rather than assumed, because the cost
 *  of being wrong is a project nobody can register against.
 */
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM public.allowed_signins WHERE is_enabled;
  IF n = 0 AND NOT public.app_public_signup_enabled() THEN
    RAISE EXCEPTION
      'SIGNUP_WOULD_BE_CLOSED_TO_EVERYONE: allowed_signins has no enabled row '
      'and public signup is off, so applying this would deny every signup. '
      'Add an approved address with admin_allowlist_add() first, or open '
      'public signup deliberately with admin_set_public_signup(true, <reason>).'
      USING ERRCODE = 'P0001';
  END IF;
  RAISE NOTICE 'closed-by-default signup active; % enabled allowlist address(es)', n;
END $$;
