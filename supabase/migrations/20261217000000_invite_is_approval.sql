-- =====================================================================
--  AN INVITATION IS THE APPROVAL.
--
--  WHAT WENT WRONG, IN THE ORDER THE PERSON EXPERIENCED IT.
--
--  An address was invited through Supabase's admin API. The invite email
--  arrived, the link worked, the password screen worked, the sign-in
--  worked. Then "create your workspace" failed, and the error the screen
--  could offer was SIGNIN_NOT_ALLOWED (P0001).
--
--  Everything about that is working as written. Sign-in has no database
--  gate at all: the only gate is app_signin_is_allowed, and the only
--  caller of it is provision_profile, so the allowlist decides who may
--  hold a PROFILE, not who may hold a session. A profile is what a
--  workspace needs. So an invited-but-unlisted person could do
--  everything except the one thing the invitation was for.
--
--  It is also the worst possible shape for the failure. create_company
--  has no such gate, and the frontend creates the company BEFORE the
--  profile, so each attempt left a real company behind with the person
--  as its owner and no profile to reach it. The account that prompted
--  this migration had two such companies after two attempts.
--
--  WHAT CHANGES. app_signin_is_allowed now also admits an address that
--  Supabase Auth records as INVITED. Nothing else changes: the function
--  keeps its signature, its volatility, its SECURITY DEFINER, its
--  search_path, and both of its existing clauses.
--
--  WHY invited_at IS A SOUND APPROVAL, and not a hole.
--
--    * It is written only by the admin invite API, which requires the
--      service-role key. A self-signup leaves it NULL. On this project
--      16 of the 22 accounts are self-signups with invited_at NULL, so
--      this is emphatically not the same as opening the product: those
--      16 stay out, and so does anyone who finds the signup form.
--    * auth.users is not writable by `authenticated`, so the marker
--      cannot be set by the person it would admit.
--    * It is checked against the RESOLVED address. provision_profile
--      passes v_email -- the address auth.users holds for the session --
--      never the caller's p_email argument. That ordering is what makes
--      the existing guard a gate rather than a suggestion, and this
--      migration does not move it. The accompanying suite re-proves the
--      bypass is still closed with an INVITED address in the argument.
--
--  WHAT THIS COSTS, said plainly rather than discovered later: removing
--  somebody from allowed_signins no longer keeps an invited address out,
--  because the invite itself now admits it. To deny an invited person,
--  delete the auth user (which also ends their session and password) or
--  revoke the invite before it is accepted. The allowlist was never a
--  revocation mechanism for an account that already had a profile --
--  app_signin_is_allowed is read at profile creation and never again --
--  so this narrows no revocation path that previously worked. If an
--  explicit deny that outranks an invite is wanted, that is a deliberate
--  addition to this table and belongs in its own migration.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.app_signin_is_allowed(p_email text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
  --  The address is normalised once, here, so the three clauses cannot
  --  disagree about what they are comparing. NULLIF matters: without it
  --  an empty argument compares equal to an empty stored address, and a
  --  missing address would read as an admitted one.
  WITH want AS (
    SELECT nullif(btrim(lower(coalesce(p_email, ''))), '') AS email
  )
  SELECT
    --  An empty list means the product is open. Stated here, once, so
    --  there is no second switch that can disagree with the table.
    NOT EXISTS (SELECT 1 FROM public.allowed_signins)
    OR EXISTS (
      SELECT 1 FROM public.allowed_signins a, want w
      WHERE a.email = w.email
    )
    --  An invitation is an administrative act, so it carries its own
    --  approval. See the header for why invited_at cannot be set by the
    --  person it admits.
    OR EXISTS (
      SELECT 1 FROM auth.users u, want w
      WHERE lower(btrim(u.email)) = w.email
        AND u.invited_at IS NOT NULL
    );
$function$;

COMMENT ON FUNCTION public.app_signin_is_allowed(text) IS
  'True when the address may hold a profile: the allowlist is empty (product open), the address is listed, or Supabase Auth records the address as invited. Read by provision_profile against the session''s resolved address, never a client-supplied one.';

-- ── Deploy-time assertions ──────────────────────────────────────────────────
--  The same discipline as 20261017000000: a gate that is silently lost to
--  a later redefinition is worse than no gate, because the colour stays
--  green. These fail the migration rather than warn.

DO $assert$
DECLARE
  v_src text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'app_signin_is_allowed'
    AND p.prokind = 'f'
  LIMIT 1;

  IF v_src IS NULL THEN
    RAISE EXCEPTION
      'app_signin_is_allowed does not exist — this migration must run after 20261017000000_signin_allowlist.sql';
  END IF;

  IF v_src NOT LIKE '%invited_at%' THEN
    RAISE EXCEPTION 'DEPLOY GUARD: app_signin_is_allowed does not consult invited_at.';
  END IF;

  IF v_src NOT LIKE '%allowed_signins%' THEN
    RAISE EXCEPTION
      'DEPLOY GUARD: app_signin_is_allowed no longer reads allowed_signins. The invite clause is an ADDITION to the list, not a replacement for it.';
  END IF;

  IF v_src NOT LIKE '%SECURITY DEFINER%' THEN
    RAISE EXCEPTION
      'DEPLOY GUARD: app_signin_is_allowed is not SECURITY DEFINER. It reads auth.users and allowed_signins, neither of which the caller can read.';
  END IF;

  --  provision_profile must still be the thing that enforces it. If a
  --  later migration restated provision_profile without the guard, this
  --  change would widen a gate nobody is reading.
  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'provision_profile'
    AND p.prokind = 'f'
  LIMIT 1;

  IF v_src IS NULL OR v_src NOT LIKE '%app_signin_is_allowed%' THEN
    RAISE EXCEPTION
      'DEPLOY GUARD: provision_profile does not call app_signin_is_allowed, so this change would have no effect. Re-apply 20261017000000_signin_allowlist.sql.';
  END IF;

  IF v_src NOT LIKE '%app_signin_is_allowed(v_email)%' THEN
    RAISE EXCEPTION
      'DEPLOY GUARD: provision_profile does not check the RESOLVED address. A guard on the client-supplied p_email is a bypass, not a gate.';
  END IF;
END $assert$;
