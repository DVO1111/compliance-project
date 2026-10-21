-- =====================================================================
--  app_is_service_context() DID NOT WORK ON SUPABASE
-- =====================================================================
--  Found by applying migrations to the live project. 20260919000000
--  ended with:
--
--    ERROR: LIFECYCLE_NOT_AUTHENTICATED: no authenticated user
--    CONTEXT: PL/pgSQL function lifecycle_initialize(...)
--      SQL statement "SELECT public.lifecycle_initialize('product', ...)"
--      PL/pgSQL function fn_products_initialize_lifecycle()
--      PL/pgSQL function backfill_product_registry() line 73
--
--  lifecycle_initialize already handles this case. Its actor block is:
--
--    IF v_service THEN v_actor := coalesce(p_actor_id, v_uid);
--    ELSE IF v_uid IS NULL THEN RAISE 'LIFECYCLE_NOT_AUTHENTICATED'
--
--  So the raise only fires when app_is_service_context() is FALSE — and
--  it was false for a migration, which is the one situation it exists to
--  recognise. Its own comment says so: "True when running as
--  service_role, or as a superuser login with no role set (migrations,
--  psql)."
--
--  WHY IT WAS FALSE. 20260907000000 implemented "superuser login" as:
--
--    coalesce((SELECT rolsuper FROM pg_roles WHERE rolname = session_user), false)
--
--  On a local Postgres, `postgres` is a superuser, so this is true and
--  every test passes. ON SUPABASE, `postgres` IS NOT A SUPERUSER — the
--  managed platform reserves that — so it is false, and every
--  service-context path in this schema behaves differently in
--  production than in the harness that tests it. Twenty-four migrations
--  reference this function.
--
--  That is the shape of bug this repository keeps paying for: correct
--  against the database it is tested on, wrong against the one it runs
--  on, and silent until something refuses.
--
--  THE FIX ADDS ONE ALTERNATIVE, AND WIDENS NOTHING THAT FACES A USER.
--  A session may also be a service context when session_user is allowed
--  to assume service_role — which on Supabase is `postgres` and
--  `supabase_admin`, and is not `authenticated` or `anon`.
--
--  It cannot widen the API surface, and the reason is the guard it sits
--  inside rather than the clause itself. A request through PostgREST
--  arrives with the role already set to `authenticated` or `anon`, so
--  current_setting('role') is one of those and the whole second branch
--  is skipped before this clause is reached. The clause only ever
--  applies to a session with NO role set, which means a direct
--  connection: a migration, psql, or service tooling. That is precisely
--  the set the comment always described.
--
--  USAGE rather than MEMBER, because the question is "could this session
--  become service_role", which is what makes it equivalent to one, and
--  USAGE is true for an inherited membership as well as a settable one.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.app_is_service_context()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT coalesce(current_setting('role', true), 'none') = 'service_role'
      OR (coalesce(current_setting('role', true), 'none') IN ('none','')
          AND (
               --  a genuine superuser login, as before
               coalesce((SELECT rolsuper FROM pg_roles WHERE rolname = session_user), false)
               --  or a login that may assume service_role, which is what
               --  the owner role is on a managed platform. Guarded on the
               --  role existing: a plain Postgres built from these
               --  migrations has no service_role, and pg_has_role raises
               --  rather than returning false for a role that is absent.
            OR (EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role')
                AND pg_has_role(session_user, 'service_role', 'USAGE'))
          ));
$$;

COMMENT ON FUNCTION public.app_is_service_context() IS
  'True when running as service_role, as a superuser login with no role set, or as a login that may assume service_role with no role set (migrations, psql, service tooling). Used to decide whether a caller may act on another user''s behalf. The rolsuper test alone was not enough: on Supabase the postgres role is not a superuser, so every service-context path failed in production while passing locally.';

REVOKE ALL ON FUNCTION public.app_is_service_context() FROM public;
GRANT EXECUTE ON FUNCTION public.app_is_service_context() TO authenticated, service_role;

--  A session with a user-facing role set must never be a service
--  context, whatever else is true of it. Asserted here rather than
--  trusted, because this function decides whether a caller may act as
--  somebody else and the clause above is the kind that looks harmless.
DO $assert$
DECLARE
  v boolean;
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  SELECT public.app_is_service_context() INTO v;
  PERFORM set_config('role', 'none', true);
  IF v THEN
    RAISE EXCEPTION
      'SERVICE_CONTEXT_TOO_WIDE: app_is_service_context() is true for an authenticated session';
  END IF;
EXCEPTION
  WHEN undefined_object THEN
    --  No `authenticated` role on this database, so the case cannot
    --  arise here. A plain Postgres built from these migrations.
    PERFORM set_config('role', 'none', true);
END $assert$;
