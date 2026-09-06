-- =====================================================================
--  FIX: PUBLIC EXECUTE on two lifecycle functions  (review finding G7)
-- =====================================================================
--  Two of the engine's functions were executable by PUBLIC, which on
--  Supabase means the `anon` role — the key shipped in the browser
--  bundle. The other nine functions across D01/D02 and the security
--  fixes are correctly restricted; these two were not.
--
--    lifecycle_resolve_definition(text,uuid)
--      D01 granted EXECUTE but never revoked from PUBLIC. This is the
--      more exposed of the two: its body performs NO tenancy check of
--      any kind, so an anonymous caller received a real lifecycle
--      definition UUID back. No tenant data, but an unauthenticated
--      call returning internal identifiers with nothing checked.
--
--    lifecycle_available_actions(text,uuid,uuid)
--      D02 changed its return type, which requires DROP + CREATE, and
--      a newly created function gets PUBLIC EXECUTE by default. The
--      REVOKE that D01 had was lost and not reinstated. Exposure was
--      nil in practice — the function's own app_is_company_member()
--      check returns zero rows to an anonymous caller — but the
--      privilege should not have been there.
--
--  This migration changes privileges only. No function body, no policy,
--  no table, no data.
-- =====================================================================

REVOKE ALL ON FUNCTION public.lifecycle_available_actions(text,uuid,uuid)  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lifecycle_resolve_definition(text,uuid)      FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.lifecycle_available_actions(text,uuid,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.lifecycle_resolve_definition(text,uuid)     TO authenticated, service_role;

COMMENT ON FUNCTION public.lifecycle_resolve_definition(text,uuid) IS
  'Resolves the active lifecycle definition for an entity type. Performs no tenancy check of its own, so EXECUTE is restricted to authenticated and service_role; it must not be reachable by anon.';
