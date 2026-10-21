# Connecting the live Supabase project to this repository

Status as of 2026-10-21: **the repository is wired for it, and the first
push has not happened.** This document says what has to be true before
it does, and why.

## The situation, measured rather than assumed

`scripts/fix/02-pharma-preflight.sql` asks the database what it contains.
Run against the live project on 2026-10-21, 87 catalogue checks came
back, and the shape of the answer was this:

| Present | Absent |
| --- | --- |
| `companies`, `profiles`, `company_members` | the lifecycle engine — `lifecycle_definitions`, `lifecycle_states`, `lifecycle_transitions`, `entity_current_state` |
| `batch_records` (June), `capa_records` (February) | `electronic_signatures`, and `sign_electronic_record` |
| `app_is_company_member` | `materials`, `material_lots`, `suppliers`, `master_formulas` |
| `regulatory_licences.status` — see below | `batch_stages`, `dispensing_records`, `instruments`, `line_clearance_records`, in-process, yield |
| | all fifteen tables added by the deviations and access work |

Everything present dates from February, March or June. Everything absent
dates from September onward. The boundary is
`20260905000000_lifecycle_engine_core.sql`, and **50 timestamped
migrations fall after it.**

`regulatory_licences.status` is the row that misleads. It is present, but
not because `20260921000000_licence_lifecycle.sql` ran — it is there
because `scripts/fix/onboarding-all.sql` adds it by hand at line 399. So
the live schema is not "the repository as of some date". It is the June
schema plus selected hand-patches, a shape that no migration file
describes.

This is consistent with what `scripts/fix/00-preflight.sql` already
recorded: the database "was built by hand rather than by replaying
supabase/migrations".

### The replica

A model of that database can be built from the repository alone —
migrations before the 5 September cutoff, plus the `scripts/fix/`
patches. Built that way it reproduces **all 85 schema rows** of the live
result exactly: every table, every column, every function.

Two rows differ, both explained. The replica has no
`supabase_migrations.schema_migrations`, because it is built by applying
files directly rather than through the CLI. And the replica has one view
without `security_invoker` (`v_policy_compliance_stats`, created by a
March migration that aborts halfway in a known way) where the live
project has none — there the live project is in the better state.

So the live schema can be tested against without touching it. That
matters: it means a catch-up can be written and proven before anybody
connects anything.

## Why the first push must not be automatic

`supabase db push` works out what to apply by comparing the files in
`supabase/migrations` against `supabase_migrations.schema_migrations` in
the target. That table **exists** in the live project, and the schema
disagrees with the repository. Until we know how the table and the
schema disagree, a push has three possible outcomes and none of them is
acceptable:

1. **The table lists most of the 187 files.** The push applies nothing.
   The repository looks connected, the gap becomes invisible, and the
   next person to read the setup concludes production is current. This
   is the worst outcome precisely because it looks like success.
2. **The table lists up to early September.** The push attempts fifty
   migrations against a hand-patched schema. Fourteen of them are pinned
   in `scripts/ci/expected-migration-failures.txt` as not applying to a
   from-scratch Postgres — several because four files carry no timestamp
   and therefore sort after every dated one. It aborts partway and the
   database is left half-migrated.
3. **The table is nearly empty.** The push attempts all 187 and fails in
   the first minute.

There is a second reason, independent of the history table. Among the
fifty are `20260908000000_fix_company_membership_escalation`,
`20260922000000_tenant_isolation_hardening` and
`20261008000000_view_security_invoker` — row-level security changes on a
multi-tenant database holding real customer workspaces. Applied wrongly
they do not break a screen; they either lock every user out or let one
company read another's batch records. Those get reviewed individually,
against the replica, before they go anywhere near live data.

## The order of work

1. **Read the history.** `supabase migration list --linked`, or
   directly:
   ```sql
   SELECT count(*), min(version), max(version)
   FROM supabase_migrations.schema_migrations;

   SELECT string_agg(version, ' ' ORDER BY version)
   FROM supabase_migrations.schema_migrations;
   ```
   This is the gating fact. Nothing below can be planned without it.
2. **Reconcile.** Where the table claims a migration that the schema
   shows is absent, the claim is wrong and `supabase migration repair`
   is the tool for correcting it. Used the wrong way round — marking an
   unapplied migration as applied — it makes the gap permanent, so each
   decision is made against preflight evidence, not against the
   filenames.
3. **Build the catch-up against the replica** and prove it takes a
   June-era database to current. One reviewed script, idempotent and
   guarded, rather than fifty files replayed.
4. **Back up the live project**, then run the catch-up in a window.
5. **Re-run the preflight** against live and confirm the rows that were
   false are now true. A migration that reports success and leaves an
   object uncreated is the failure mode this repository has already been
   bitten by.
6. **Then** add a `push:` trigger to `.github/workflows/db-migrate.yml`,
   so the repository stays the source of truth from that point on.

## Secrets the workflow expects

Set these as repository secrets. None of them belongs in the repository,
in a `.env` file, or in any frontend code.

| Secret | What it is |
| --- | --- |
| `SUPABASE_ACCESS_TOKEN` | A personal access token from the Supabase dashboard. Used by the CLI to link. |
| `SUPABASE_PROJECT_REF` | The project ref. Also doubles as the confirmation string for an apply. |
| `SUPABASE_DB_PASSWORD` | The database password. |
| `SUPABASE_REGION` | The pooler region, for the verification step. |

The workflow also names a GitHub environment, `production-database`. Add
a required reviewer to it in repository settings and an apply then waits
for a human before it runs.

## One cleanup worth doing

`scripts/check_db_state.mjs` hardcodes the project URL and a truncated
anon key as fallbacks. The anon key is publishable so this is not an
exposure, but a script that falls back to a live project when the
environment is unset is a trap. It should read the environment and fail
if unset.
