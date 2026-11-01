-- =====================================================================
--  WHICH WORKSPACES MAY I OPEN?  —  app_my_companies()
--
--  The product has always supported a person belonging to more than one
--  company: `company_members` is keyed (company_id, user_id) and
--  AuthContext's loadProfileInner already fetches every row for the
--  signed-in user, noting in its own comment that "several rows come back
--  for someone in more than one company". What it then did was discard all
--  but the one matching `profiles.company_id`, so the second membership was
--  real in the database and unreachable in the interface.
--
--  A switcher needs one thing the browser cannot work out for itself: the
--  NAMES of the companies it may offer. This function is that, and it is
--  deliberately the only way the client learns them.
--
--  WHY A FUNCTION AND NOT A POLICY ON `companies`
--  ----------------------------------------------
--  `public.companies` has RLS enabled (20260206000000) and NOT ONE policy
--  in any migration in this repository. For `authenticated` that means no
--  row is readable: `select name from companies` returns nothing, silently.
--  Adding a SELECT policy would work, but it widens a table that several
--  tenants share, for a single read that has one correct shape. A
--  SECURITY DEFINER function answers exactly the question asked —
--  "the companies I am an active member of, and what I am in each" —
--  and nothing else. No existing policy is touched.
--
--  WHY IT IS SAFE
--  --------------
--    * It takes NO argument. There is nothing to tamper with: the caller
--      cannot ask about another user, because the user is auth.uid().
--    * `status = 'active'` is the same condition app_is_company_member()
--      uses, so this function and the RLS that guards every company-scoped
--      table agree by construction. A membership that is suspended or
--      removed disappears from the switcher and from the data at once.
--    * It is STABLE and read-only.
--
--  WHAT IT IS NOT
--  --------------
--  It is NOT the tenant boundary. Every company-scoped table is guarded by
--  app_is_company_member(company_id), which reads `company_members` on each
--  statement and knows nothing about what the client believes its active
--  company to be. A client that forges an active company id — in memory, in
--  localStorage, anywhere — reads zero rows and writes nothing. This
--  function exists so the interface can offer the right choices, not so
--  that choosing can grant anything.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.app_my_companies()
RETURNS TABLE (
  company_id   uuid,
  company_name text,
  role         text,
  joined_at    timestamptz
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    cm.company_id,
    --  LEFT JOIN, and a fallback name.
    --
    --  A membership whose company row is missing or unnamed is still a
    --  membership: the data behind it is readable, because the RLS helper
    --  reads `company_members` and not `companies`. Dropping it here would
    --  make a workspace that works unreachable, which is the harder fault
    --  to diagnose of the two.
    coalesce(nullif(btrim(c.name), ''), 'Untitled workspace') AS company_name,
    cm.role,
    cm.joined_at
  FROM public.company_members cm
  LEFT JOIN public.companies c ON c.id = cm.company_id
  WHERE cm.user_id = auth.uid()
    AND cm.status = 'active'
  ORDER BY company_name;
$$;

COMMENT ON FUNCTION public.app_my_companies() IS
  'The companies the CALLER is an active member of, with their name and the '
  'caller''s role in each. Drives the workspace switcher. Not a tenant '
  'boundary: app_is_company_member() is, and it is consulted per statement.';

--  `anon` is deliberately absent. With no session auth.uid() is null and the
--  function would return nothing anyway, but a signed-out caller has no
--  business asking.
REVOKE ALL ON FUNCTION public.app_my_companies() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_my_companies() TO authenticated;
GRANT EXECUTE ON FUNCTION public.app_my_companies() TO service_role;
