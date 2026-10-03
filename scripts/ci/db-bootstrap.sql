-- ===================================================================
--  Local test harness shim: the parts of a Supabase project that the
--  migrations and suites depend on but that no migration creates.
--  LOCAL DISPOSABLE DATABASE ONLY.
-- ===================================================================
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon')          THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role')  THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;

GRANT USAGE ON SCHEMA public, auth, extensions TO anon, authenticated, service_role;
ALTER ROLE authenticated SET search_path = public, extensions;

--  TABLES and SEQUENCES only. Deliberately NOT functions: PostgreSQL
--  already grants EXECUTE to PUBLIC on creation, and the migrations
--  REVOKE that and re-grant selectively. Adding a standing grant to
--  anon here would silently defeat those revokes and make the function
--  ACL tests pass against a permission the real project does not give.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS auth.users (
  id                 uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  email              text UNIQUE,
  encrypted_password text,
  raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON auth.users TO authenticated, service_role;

--  nullif() before the cast: the suites simulate an unauthenticated
--  caller with request.jwt.claims = '', and ''::jsonb throws.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid;
$$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', ''), 'anon');
$$;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
$$;
GRANT EXECUTE ON FUNCTION auth.uid(), auth.role(), auth.jwt() TO anon, authenticated, service_role;

--  public.companies is referenced by many migrations but created by
--  none of them (the suites scaffold it too). Same shape as the suites use.
CREATE TABLE IF NOT EXISTS public.companies (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.companies TO anon, authenticated, service_role;
