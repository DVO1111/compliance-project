-- =====================================================================
--  FIX: infinite recursion in public.profiles RLS  (42P17)
-- =====================================================================
--  ROOT CAUSE
--  ----------
--  One policy on profiles queries profiles:
--
--    CREATE POLICY "Reviewers can view submitter profiles"
--      ON profiles FOR SELECT TO authenticated
--      USING (EXISTS (SELECT 1 FROM profiles AS p
--                     WHERE p.id = auth.uid()
--                       AND p.role IN ('admin','compliance_officer')));
--
--  (created in 20260211144030_add_archive_signoff_and_tags.sql)
--
--  The inner SELECT on profiles is itself subject to profiles' RLS, which
--  re-evaluates the same policy, which runs the inner SELECT again:
--
--    SELECT profiles → policy → SELECT profiles → policy → … → 42P17
--
--  MEASURED IMPACT (local, full migration set)
--  -------------------------------------------
--  Because policies are evaluated for every statement, this breaks BOTH
--  reads and writes: `SELECT count(*) FROM profiles` and
--  `UPDATE profiles SET … WHERE id = auth.uid()` each raise 42P17 for the
--  authenticated role. profiles is currently unusable from the client.
--
--  This also means the recursive policy grants nothing today — it can
--  never successfully evaluate. There is therefore no working behaviour
--  to preserve, only a stated intent to honour.
--
--  DECISION, STATED EXPLICITLY RATHER THAN MADE SILENTLY
--  -----------------------------------------------------
--  The original policy has NO company predicate. Repaired literally, it
--  would let any admin/compliance_officer read EVERY profile in EVERY
--  company. Since the policy has never actually worked, repairing it
--  literally would not restore behaviour — it would grant cross-tenant
--  read access that has never existed.
--
--  This migration therefore scopes the reviewer read to the reviewer's
--  own company. That is the conservative reading and matches the rest of
--  the tenancy model. If cross-company profile visibility is genuinely
--  intended for some role, it must be added deliberately and separately.
--
--  SECOND ISSUE, UNCOVERED BY THE FIX
--  ----------------------------------
--  The UPDATE policy is `USING (auth.uid() = id) WITH CHECK (auth.uid() = id)`
--  with no column restriction. While profiles was unusable this was inert.
--  The moment the recursion is fixed, a user could update their OWN row to
--  change company_id (moving themselves into another tenant), role
--  (self-promoting to admin) or custom_role_id (pointing at a custom role
--  whose jsonb permission set grants anything). Fixing the recursion
--  without closing that would create a privilege-escalation path that did
--  not exist before, so the guard belongs in this migration rather than a
--  later one.
--
--  WHAT THIS MIGRATION DELIBERATELY DOES NOT CLOSE
--  -----------------------------------------------
--  1. INSERT. "Users can insert own profile" is WITH CHECK (auth.uid() = id)
--     and nothing else, and INSERT never recursed — so a user creating
--     their first profile row can already choose their own role and
--     company_id today, independently of this bug. Verified against a
--     local database. Closing it requires a server-side provisioning
--     path, which is not this change.
--  2. organization_id / business_unit_id / brand_id. These are written
--     from the client by hierarchyService.assignUserToHierarchy(); they
--     are placement rather than privilege, and guarding them would break
--     a working call site. Flagged, not changed.
--
--  REVERSIBILITY
--  -------------
--  To revert: drop the two helpers, the trigger and its function, drop
--  policy "Reviewers can view company profiles", and recreate the original
--  policy from 20260211144030. That restores the recursion, so a revert is
--  only meaningful alongside reverting whatever depended on this fix.
-- =====================================================================

-- ── Helpers ──────────────────────────────────────────────────────────
-- Both are SECURITY DEFINER so they read profiles with RLS bypassed,
-- which is what breaks the cycle. Both are deliberately parameterless:
-- they can only ever report on the CALLER's own row, so neither can be
-- used to read another user's company or role. Fixed search_path, no
-- dynamic SQL, no way to influence which row is returned.

CREATE OR REPLACE FUNCTION public.app_current_profile_company()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT company_id FROM public.profiles WHERE id = auth.uid();
$$;

COMMENT ON FUNCTION public.app_current_profile_company() IS
  'Caller''s own company_id. SECURITY DEFINER to break the profiles RLS recursion. Parameterless by design: cannot report on any other user.';

CREATE OR REPLACE FUNCTION public.app_current_profile_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

COMMENT ON FUNCTION public.app_current_profile_role() IS
  'Caller''s own profile role. SECURITY DEFINER to break the profiles RLS recursion. Parameterless by design: cannot report on any other user.';

REVOKE ALL ON FUNCTION public.app_current_profile_company() FROM public;
REVOKE ALL ON FUNCTION public.app_current_profile_role()    FROM public;
GRANT EXECUTE ON FUNCTION public.app_current_profile_company() TO authenticated;
GRANT EXECUTE ON FUNCTION public.app_current_profile_role()    TO authenticated;

-- ── Replace the recursive SELECT policy ──────────────────────────────
-- "Users can view own profile" is left exactly as it is; self-access does
-- not depend on this policy and must keep working even for a user whose
-- company_id is NULL.
DROP POLICY IF EXISTS "Reviewers can view submitter profiles" ON public.profiles;
-- re-runnable (branch resets, `supabase db reset`); the whole migration
-- runs in one transaction, so there is no window without a policy
DROP POLICY IF EXISTS "Reviewers can view company profiles" ON public.profiles;

CREATE POLICY "Reviewers can view company profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    -- No reference to profiles here: both helpers resolve it with RLS
    -- bypassed, so this predicate cannot re-enter profiles' policies.
    company_id IS NOT NULL
    AND company_id = public.app_current_profile_company()
    AND public.app_current_profile_role() = ANY (ARRAY['admin','compliance_officer'])
  );

-- ── Close the escalation the fix would otherwise open ────────────────
-- RLS WITH CHECK cannot see the OLD row, so a column-level guard has to
-- be a trigger. service_role is exempt: provisioning and administrative
-- RPCs legitimately move members between companies and set roles.
CREATE OR REPLACE FUNCTION public.profiles_guard_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_service oid := to_regrole('service_role');
BEGIN
  -- to_regrole() rather than a bare name: pg_has_role() raises if the role
  -- does not exist, which would turn a missing role into a failed UPDATE.
  IF current_setting('role', true) = 'service_role'
     OR (v_service IS NOT NULL AND pg_has_role(current_user, v_service, 'MEMBER')) THEN
    RETURN NEW;
  END IF;

  IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION 'PROFILES_COMPANY_IMMUTABLE: company_id cannot be changed through a profile update'
      USING ERRCODE = 'P0001';
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'PROFILES_ROLE_IMMUTABLE: role cannot be changed through a profile update'
      USING ERRCODE = 'P0001';
  END IF;

  -- custom_roles.permissions is a jsonb permission set, so custom_role_id
  -- carries privilege exactly as role does. The recursion blocks it today;
  -- fixing the recursion without this line would newly allow a user to
  -- point their own profile at an admin custom role.
  IF NEW.custom_role_id IS DISTINCT FROM OLD.custom_role_id THEN
    RAISE EXCEPTION 'PROFILES_ROLE_IMMUTABLE: custom_role_id cannot be changed through a profile update'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS profiles_guard_privileged_columns_trg ON public.profiles;
CREATE TRIGGER profiles_guard_privileged_columns_trg
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_guard_privileged_columns();

COMMENT ON FUNCTION public.profiles_guard_privileged_columns() IS
  'Blocks self-service changes to profiles.company_id and profiles.role. service_role is exempt so provisioning RPCs still work.';
