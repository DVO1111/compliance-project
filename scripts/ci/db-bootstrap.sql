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

--  THE OWNER ACCOUNT, because a migration now requires it to exist.
--  20261022000000_access_requests.sql makes the product owner the first
--  approver and then REFUSES TO INSTALL if that row is absent — a sound
--  guard against a real project ending up with an approvals table and
--  nobody able to approve. On a disposable database built from nothing
--  there are no accounts at all, so the guard fired on every run and
--  stopped the harness before a single suite executed.
--
--  Seeded here rather than pinned in expected-migration-failures.txt:
--  listing it there would make the harness green again while leaving
--  the access-request tables untested, which is the opposite of what
--  that file is for. This is a shim for something a real Supabase
--  project has and no migration creates, which is exactly this file's
--  job. The id is fixed so a suite can refer to it.
INSERT INTO auth.users (id, email)
VALUES ('00000000-0000-4000-8000-00000000c0de', 'ayomideelijah1@gmail.com')
ON CONFLICT (id) DO NOTHING;

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
