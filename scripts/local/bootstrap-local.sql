-- ====================================================================
--  What a REAL local Supabase stack still lacks.
--
--  scripts/ci/db-bootstrap.sql shims a bare Postgres: it creates the
--  auth schema, auth.users, auth.uid() and the three roles, because none
--  of that exists there. A CLI-started stack has all of it for real —
--  GoTrue owns auth.users, and trying to CREATE it fails with
--  "permission denied for schema auth", which is correct.
--
--  So this file is the short remainder: the things no migration creates
--  and no Supabase service provides either.
--
--  LOCAL DISPOSABLE DATABASE ONLY.
-- ====================================================================

-- ── public.companies is NOT created here any more ───────────────────
--  It was, because no migration created it. That question is settled:
--  supabase/migrations/20260206000000_baseline_companies.sql creates it,
--  dated before every other migration. Keeping a second copy here would
--  be a competing definition of the same table, and the migration pass
--  that follows this file applies the real one.

-- ── the owner account the access-request migration requires ─────────
--  20261022000000_access_requests.sql seeds the product owner as the
--  first approver and REFUSES TO INSTALL if that row is absent — a
--  sound guard against a project ending up with an approvals table and
--  nobody able to approve.
--
--  The address is the one that migration names. This is a row in a
--  throwaway container with no password and no identity, so it is not
--  an account anywhere and cannot be signed in to; it exists only to
--  satisfy the guard. Every address this phase actually tests with is a
--  disposable @local.test one.
--  ── THE EMPTY STRINGS ARE LOAD-BEARING, NOT TIDINESS ───────────────
--
--  GoTrue scans these four columns into plain Go `string` fields, and
--  four of the eight token columns have NO '' default in the schema. A
--  row inserted without them — as this one originally was — leaves them
--  NULL, and the whole Admin API user listing then fails:
--
--      GET /admin/users -> 500
--      unable to fetch records: sql: Scan error on column index 3,
--      name "confirmation_token": converting NULL to string is
--      unsupported
--
--  It is ONE bad row and it breaks listing for EVERY user, so
--  scripts/rollover/rollover.ts — which starts with listUsers() — could
--  not get off the ground. Nothing in the error names this row or this
--  file. GoTrue's own inserts always write '', which is why no real
--  signup ever triggers it and why only a hand-made row can.
INSERT INTO auth.users (
  id, instance_id, aud, role, email, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change)
VALUES ('00000000-0000-4000-8000-00000000c0de',
        '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated',
        'ayomideelijah1@gmail.com', now(), now(),
        '', '', '', '')
ON CONFLICT (id) DO NOTHING;

--  Repairs a row left behind by the version of this file that omitted
--  them, so an existing local database does not have to be rebuilt. It
--  touches only the columns that must not be NULL, and only where they
--  are.
UPDATE auth.users SET
  confirmation_token         = coalesce(confirmation_token, ''),
  recovery_token             = coalesce(recovery_token, ''),
  email_change_token_new     = coalesce(email_change_token_new, ''),
  email_change               = coalesce(email_change, ''),
  email_change_token_current = coalesce(email_change_token_current, ''),
  phone_change               = coalesce(phone_change, ''),
  phone_change_token         = coalesce(phone_change_token, ''),
  reauthentication_token     = coalesce(reauthentication_token, '')
WHERE confirmation_token IS NULL OR recovery_token IS NULL
   OR email_change_token_new IS NULL OR email_change IS NULL
   OR email_change_token_current IS NULL OR phone_change IS NULL
   OR phone_change_token IS NULL OR reauthentication_token IS NULL;
