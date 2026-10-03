# SQL suites

`run-sql-tests.sh` builds a Postgres database from `supabase/migrations`
and runs every suite in `supabase/tests` against it. The `SQL suites` job
in `.github/workflows/ci.yml` runs this script and nothing else, so CI
and a local run exercise the same code path.

## Running it locally

Any disposable Postgres 16 will do.

```sh
docker run --rm -d --name criateur-pg -e POSTGRES_PASSWORD=postgres \
  -p 55432:5432 postgres:16

PGHOST=127.0.0.1 PGPORT=55432 PGUSER=postgres PGPASSWORD=postgres \
  scripts/ci/run-sql-tests.sh
```

It drops and recreates the database each run, so it is safe to repeat and
the suites are all re-runnable.

`SQL_TEST_DB` overrides the database name, but sixteen of the suites
guard on `current_database()` and refuse anything other than `postgres`
or `criateur_local` — a safety net against pointing them at something
real. The default satisfies that guard; overriding it will make those
sixteen refuse to run.

## What it enforces

1. **Every migration applies**, except the set pinned in
   `expected-migration-failures.txt`. The actual failure set must match
   that file exactly, in both directions: a new failure fails the build,
   and so does a listed migration that starts working. The list can only
   shrink without someone noticing.
2. **Every suite reports at least one assertion.** A suite that aborts
   early reports zero, which is otherwise indistinguishable from a clean
   pass — and is exactly what a broken suite looks like.
3. **No assertion fails.**

## Why `db-bootstrap.sql` exists

The migrations and suites depend on parts of a Supabase project that no
migration creates: the `auth` schema and `auth.uid()`, the `anon` /
`authenticated` / `service_role` roles, the default table grants, and
`public.companies`. The shim supplies them.

Two details in it are load-bearing and easy to get wrong:

- It grants default privileges on **tables and sequences only**, never
  functions. PostgreSQL already grants `EXECUTE` to `PUBLIC` on function
  creation and several migrations deliberately `REVOKE` that and re-grant
  selectively. A standing grant to `anon` here would silently defeat
  those revokes, and the function-ACL suite would then pass against a
  permission the real project does not give — worse than having no
  harness at all.
- `auth.uid()` wraps its claim lookup in `nullif` before the cast. The
  suites simulate an unauthenticated caller with
  `request.jwt.claims = ''`, and `''::jsonb` throws where real Supabase
  returns `NULL`.

## The baseline, and what it says about the repository

15 of 162 migrations do not apply to a from-scratch database. Four need a
Supabase service a plain Postgres lacks (storage, `pg_net`, `pg_cron`),
three are seeds that require a company to already exist, and **eight are
genuine ordering problems in the repository's own history** — several
because four migrations carry no timestamp and therefore sort after every
timestamped one, while earlier migrations depend on tables they create.

Those eight are pre-existing and are recorded rather than fixed: repairing
migration history that has already been applied to production is its own
change with its own review, and the right fix differs per case. The file
names each one and why.
