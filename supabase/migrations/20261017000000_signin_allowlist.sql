-- ============================================================================
-- Who is allowed into Criateur while it is not open to the public.
--
-- THE CLIENT-SIDE LIST IS NOT A CONTROL. src/lib/auth/allowlist.ts keeps
-- the product's front door shut, and that is all it can do: the browser
-- holds the Supabase anon key, so anyone who can open the site can call
-- the auth endpoint directly and obtain a session without ever loading
-- that file. A list in JavaScript tells you who is expected. It does not
-- decide who gets in.
--
-- This migration is the control. It puts the same rule where the client
-- cannot reach it, on the one operation that turns an authenticated
-- stranger into a user of this product: provisioning a profile. Without
-- a profile row there is no company, no membership and no data — every
-- RLS policy in this schema is written against company membership, so a
-- session with no profile can read nothing and write nothing.
--
-- WHAT IT DOES NOT DO. It does not stop someone creating an auth user:
-- sign-up is Supabase's own endpoint and is governed in the dashboard,
-- not here. It stops that user becoming a member of anything. If you
-- want the account itself refused, turn off public sign-ups in the
-- Supabase dashboard (Authentication → Providers → Email → disable
-- "Enable sign ups"), which is an operator setting and cannot be
-- expressed in a migration.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.allowed_signins (
  email       text PRIMARY KEY,
  note        text,
  added_by    uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),

  --  Stored lower-case so the gate cannot be walked around with a
  --  capital letter. The check is a constraint rather than a trigger so
  --  a hand-written INSERT cannot skip it either.
  CONSTRAINT allowed_signins_email_lower_chk CHECK (email = lower(email)),
  CONSTRAINT allowed_signins_email_shape_chk CHECK (email LIKE '%_@_%._%')
);

COMMENT ON TABLE public.allowed_signins IS
  'Addresses permitted to provision a profile while sign-in is closed. '
  'An empty table means the gate is OFF and anyone may provision — see '
  'the function below, which is deliberately written that way so that '
  'emptying the table is how you open the product, rather than editing '
  'code and redeploying.';

ALTER TABLE public.allowed_signins ENABLE ROW LEVEL SECURITY;

--  No one reads this table from the browser. It is consulted by a
--  SECURITY DEFINER function, which is not subject to RLS. Leaving it
--  with RLS on and no policy means a client query returns nothing at
--  all — which is correct: the list of who has early access is not
--  something a visitor should be able to enumerate.

-- ── The gate ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.app_signin_is_allowed(p_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT
    --  An empty list means the product is open. Stated here, once, so
    --  there is no second switch that can disagree with the table.
    NOT EXISTS (SELECT 1 FROM public.allowed_signins)
    OR EXISTS (
      SELECT 1 FROM public.allowed_signins a
      WHERE a.email = lower(trim(coalesce(p_email, '')))
    );
$$;

COMMENT ON FUNCTION public.app_signin_is_allowed(text) IS
  'True when the address may provision a profile. True for everyone when '
  'allowed_signins is empty.';

-- ── Seed ────────────────────────────────────────────────────────────────────
-- The first address, so that applying this migration does not lock the
-- person applying it out of their own product.

INSERT INTO public.allowed_signins (email, note)
VALUES ('ayomideelijah1@gmail.com', 'Owner. Added with the allowlist itself.')
ON CONFLICT (email) DO NOTHING;

-- ============================================================================
-- Enforcement.
--
-- provision_profile is the only path to a profile row — the direct
-- INSERT privilege was revoked in 20260916000000_secure_profile_provisioning
-- — so this one check covers every way in: sign-up, invite acceptance,
-- and anything added later that calls it.
--
-- The guard is added by ALTERING the existing function's body rather
-- than restating it, because restating it here would mean maintaining a
-- second copy that silently diverges. A deploy-time assertion below
-- fails if the guard is ever lost to a later redefinition.
-- ============================================================================

DO $$
DECLARE
  v_src text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'provision_profile'
  LIMIT 1;

  IF v_src IS NULL THEN
    RAISE EXCEPTION
      'provision_profile does not exist — this migration must run after 20260916000000_secure_profile_provisioning.sql';
  END IF;

  IF v_src LIKE '%app_signin_is_allowed%' THEN
    RAISE NOTICE 'provision_profile already carries the allowlist guard';
    RETURN;
  END IF;

  --  Insert the guard immediately after the function's opening BEGIN, so
  --  it runs before any row is written.
  v_src := regexp_replace(
    v_src,
    '(\$function\$[[:space:]]*(DECLARE[\s\S]*?)?BEGIN)',
    E'\\1\n  IF NOT public.app_signin_is_allowed(p_email) THEN\n'
    '    RAISE EXCEPTION ''SIGNIN_NOT_ALLOWED: this address is not permitted to use Criateur yet''\n'
    '      USING ERRCODE = ''P0001'';\n  END IF;\n',
    ''
  );

  EXECUTE v_src;
END $$;

-- ── Deploy-time assertions ──────────────────────────────────────────────────

DO $$
DECLARE
  v_src text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'provision_profile'
  LIMIT 1;

  IF v_src NOT LIKE '%app_signin_is_allowed%' THEN
    RAISE EXCEPTION
      'DEPLOY GUARD: provision_profile lost its allowlist check. A later migration redefined it without the guard; re-apply this one after that migration.';
  END IF;

  --  The gate must fail CLOSED for an address that is not listed. A
  --  function that answered true for everything would pass the text
  --  check above while gating nothing, so it is exercised rather than
  --  read.
  IF public.app_signin_is_allowed('definitely-not-listed@example.invalid') THEN
    RAISE EXCEPTION
      'DEPLOY GUARD: app_signin_is_allowed admitted an unlisted address while the list is non-empty';
  END IF;

  IF NOT public.app_signin_is_allowed('AYOMIDEELIJAH1@GMAIL.COM') THEN
    RAISE EXCEPTION
      'DEPLOY GUARD: app_signin_is_allowed is case-sensitive; a listed address was refused';
  END IF;
END $$;
