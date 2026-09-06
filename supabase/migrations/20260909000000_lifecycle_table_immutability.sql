-- =====================================================================
--  FIX: lifecycle tables were writable outside the engine  (Finding B)
-- =====================================================================
--  entity_state_history is documented in Deliverable 01 as an
--  "append-only record of every transition". It was not.
--
--  RLS on these tables is correct — SELECT-only policies, no write policy
--  for `authenticated` — and it does block INSERT, UPDATE and DELETE.
--  Verified: an authenticated INSERT raises "new row violates row-level
--  security policy". But the tables also carry the schema's default table
--  privileges, which include TRUNCATE, and **TRUNCATE is not subject to
--  row level security**. No policy can restrain it. Verified on a local
--  database, as `authenticated`:
--
--    TRUNCATE entity_state_history   → SUCCEEDED
--    TRUNCATE entity_current_state   → SUCCEEDED
--    TRUNCATE lifecycle_transitions  → SUCCEEDED
--    TRUNCATE lifecycle_definitions  → SUCCEEDED
--
--  So any authenticated user could erase the entire transition history
--  for every tenant, or delete the lifecycle configuration outright.
--
--  THE PRECEDENT THIS FOLLOWS
--  --------------------------
--  This project already solved exactly this problem for the sibling
--  table. 20260702000000_audit_immutability_hardening.sql does:
--
--    REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_logs
--      FROM PUBLIC, authenticated, anon, service_role;
--
--  leaving audit_logs with INSERT, REFERENCES, SELECT, TRIGGER. D01
--  created an append-only table without applying that pattern. This
--  migration applies it, and extends it to the rest of the engine.
--
--  WHY REVOKING IS SAFE
--  --------------------
--  Every legitimate writer is a SECURITY DEFINER function owned by
--  postgres (verified: lifecycle_initialize, lifecycle_transition,
--  lifecycle_available_actions, lifecycle_resolve_definition,
--  lifecycle_actor_role are all owned by a superuser). Those execute as
--  the owner and are unaffected by grants made to anon, authenticated or
--  service_role. RLS policies are left exactly as they are — nothing
--  here weakens or bypasses them; this only removes privileges that RLS
--  was never able to police.
--
--  THE SPLIT, AND WHY
--  ------------------
--  Two different rules, taken from D01's own stated design.
--
--  1. RECORDS — entity_state_history, entity_current_state.
--     Revoked from service_role as well as from the client roles. D01
--     states there is "exactly one transition path". A service_role that
--     could write entity_current_state directly would move an entity
--     without a history row, which is the precise thing the engine's
--     atomicity guarantee exists to prevent. Forcing service callers
--     through lifecycle_transition() preserves that invariant. History
--     additionally loses INSERT, matching the append-only claim: the
--     engine is the only thing that may append.
--
--  2. CONFIGURATION — lifecycle_definitions, states, transitions.
--     Client roles lose every write. service_role keeps them, because
--     D01 says definitions are "managed by migrations or the service
--     role, never by the browser" — seeding a tenant's lifecycle
--     override is legitimate service-role work.
--
--  SELECT is untouched everywhere; RLS continues to scope reads by tenant.
-- =====================================================================

DO $harden$
DECLARE
  r text;
BEGIN
  -- ── Records: nothing but the engine may write these ────────────────
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE
    ON public.entity_state_history, public.entity_current_state
    FROM PUBLIC;

  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format(
        'REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.entity_state_history, public.entity_current_state FROM %I', r);
    END IF;
  END LOOP;

  -- ── Configuration: not from the browser; service_role retained ─────
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE
    ON public.lifecycle_definitions, public.lifecycle_states, public.lifecycle_transitions
    FROM PUBLIC;

  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format(
        'REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.lifecycle_definitions, public.lifecycle_states, public.lifecycle_transitions FROM %I', r);
    END IF;
  END LOOP;
END
$harden$;

-- Reads stay as D01 granted them; RLS scopes them by tenant.
DO $reads$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT ON public.lifecycle_definitions, public.lifecycle_states,
                    public.lifecycle_transitions, public.entity_current_state,
                    public.entity_state_history
      TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT SELECT ON public.entity_current_state, public.entity_state_history TO service_role;
  END IF;
END
$reads$;

COMMENT ON TABLE public.entity_state_history IS
  'Append-only transition history. Written only by lifecycle_transition()/lifecycle_initialize(); INSERT, UPDATE, DELETE and TRUNCATE are revoked from every application role, because RLS cannot restrain TRUNCATE.';
COMMENT ON TABLE public.entity_current_state IS
  'Authoritative current state. Written only by the lifecycle engine, so that no state change can occur without its matching history row.';
