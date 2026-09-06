-- =====================================================================
--  HARDENING: lifecycle_initialize() is no longer callable by clients
-- =====================================================================
--  REVIEW FINDING
--  --------------
--  lifecycle_initialize(entity_type, entity_id, company_id, actor, state)
--  was granted to `authenticated`. Its tenancy check confirms the caller
--  belongs to the company it names, but the engine is generic: it has no
--  way to know which table an entity_type maps to, so it cannot verify
--  that the entity_id actually exists in that company. An authenticated
--  caller could therefore create entity_current_state and
--  entity_state_history rows for an arbitrary UUID under their own
--  company.
--
--  That is not a cross-tenant transition — lifecycle_transition() checks
--  the entity's OWN company and rejects a mismatch — but it is an
--  integrity hole in the initialisation API: junk lifecycle records for
--  entities that do not exist, written by a client.
--
--  WHY A REVOKE RATHER THAN AN OWNERSHIP CHECK
--  -------------------------------------------
--  Verifying ownership generically would mean teaching the engine a
--  registry of entity_type -> table -> company column. That is a design
--  addition, and it would still only cover the types in the registry.
--
--  It is also unnecessary, because nothing legitimate calls this function
--  as a client. Verified before making this change:
--
--    * Database callers: exactly three, all SECURITY DEFINER owned by a
--      superuser — fn_change_controls_initialize_lifecycle,
--      fn_capa_records_initialize_lifecycle,
--      fn_sop_documents_initialize_lifecycle. Calls made inside a
--      SECURITY DEFINER function execute with the owner's privileges, so
--      all three keep working after this revoke.
--    * Application callers: none. lifecycleService.initialize() exists as
--      an export but has no call sites.
--
--  So the smallest correct fix is to stop exposing it. A module that
--  needs entity initialisation adopts the established pattern: an AFTER
--  INSERT trigger on its own table, which knows its own company column
--  and cannot be pointed at an arbitrary UUID.
--
--  Migrations and service-context callers keep the capability, which is
--  what historical backfills need.
-- =====================================================================

REVOKE EXECUTE ON FUNCTION public.lifecycle_initialize(text,uuid,uuid,uuid,text) FROM PUBLIC;

DO $revoke$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE EXECUTE ON FUNCTION public.lifecycle_initialize(text,uuid,uuid,uuid,text) FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE EXECUTE ON FUNCTION public.lifecycle_initialize(text,uuid,uuid,uuid,text) FROM anon;
  END IF;
END
$revoke$;

-- service_role keeps it: provisioning and backfills are its job.
GRANT EXECUTE ON FUNCTION public.lifecycle_initialize(text,uuid,uuid,uuid,text) TO service_role;

COMMENT ON FUNCTION public.lifecycle_initialize(text,uuid,uuid,uuid,text) IS
  'Gives an entity its first lifecycle state. NOT callable by clients: the engine cannot verify that an arbitrary entity_id belongs to the named company, so initialisation happens through each module''s own AFTER INSERT trigger, or in service context for backfills.';
