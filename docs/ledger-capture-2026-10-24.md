# Production ledger capture — 2026-10-24 06:03:06 UTC

Read-only capture of `supabase_migrations.schema_migrations` on
`ovxfflilbqaxedzovgmz`, taken before any proposed ledger mutation.

**Nothing was written. No repair has been run.**

---

## Global state

| | |
|---|---|
| Read at | **2026-10-24 06:03:06 UTC** (database `now()`) |
| PostgreSQL | **17.6** |
| Rows | **133** |
| Latest applied | **`20261101000000`** |
| Applied above the boundary | **0** |
| Rows carrying `statements` | **82** of 133 |
| **Fingerprint** | **`ebbd113e5966eaa1e934bba790e9860a`** |

Fingerprint definition — reproduce exactly:

```sql
SELECT count(*) AS rows,
       md5(string_agg(version||'|'||coalesce(name,'')||'|'||
           coalesce(array_length(statements,1)::text,'0'), E'\n' ORDER BY version)) AS fingerprint
  FROM supabase_migrations.schema_migrations;
```

This value is **unchanged** from the one recorded in
`docs/APPROVAL-PACKAGE.md` §2 on 2026-10-23, which demonstrates that
none of the preparation work altered production.

---

## The five at-risk rows

These are the rows a mistyped repair command would overwrite
(`--status applied`) or delete (`--status reverted`). Each `statements`
array is hashed so damage is detectable per row rather than only in
aggregate.

| Version | Name | `statements` | `md5(array_to_string(statements, E'\n'))` |
|---|---|---|---|
| `20260226200000` | `content_calendar` | **20** | `a64bacc39cdf1a32450573dda5bd09f3` |
| `20260227100000` | `fix_custom_roles_403` | **2** | `5947600852d94ad1fe826b7e72848eb8` |
| `20260301000000` | `calendar_deadline_reminders` | **5** | `c37a66ba9fe0cea8c2257506e082ec97` |
| `20260305100000` | `create_legal_partner_tables` | **12** | `f4337d0203f6873e3bce1b55dbd0e4d7` |
| `20260306190000` | `ai_asset_inventory` | **20** | `ef33a52fb40ae83abe3e989de2a54c96` |

Per-row verification:

```sql
SELECT version, name, array_length(statements,1) AS stmts,
       md5(array_to_string(statements, E'\n')) AS statements_md5
  FROM supabase_migrations.schema_migrations
 WHERE version IN ('20260226200000','20260227100000','20260301000000',
                   '20260305100000','20260306190000')
 ORDER BY version;
```

Any difference from the table above means that row was modified.

## The five repair targets

| Version | State at capture |
|---|---|
| `20260226200002` | **free** — absent from the ledger |
| `20260227100001` | **free** |
| `20260301000001` | **free** |
| `20260305100001` | **free** |
| `20260306190001` | **free** |

Confirmed by `repair_targets_present = 0`.

---

## THIS IS DETECTION, NOT RECOVERY

**Stated plainly because the distinction decides whether the repairs
may proceed.**

What this capture gives: the ability to **detect** that a ledger row
was damaged, globally by fingerprint and per-row by md5.

What it does **not** give: the ability to **restore** a damaged row.
Restoring requires the `statements` text itself, and that needs either

- `pg_dump --schema=supabase_migrations` with a **PostgreSQL 17**
  client and the project's database credentials, or
- point-in-time recovery.

**Neither is available to this session.** Verified 2026-10-24:

| | |
|---|---|
| Database credentials | **absent.** `SUPABASE_DB_URL`, `DATABASE_URL`, `PGPASSWORD`, `POSTGRES_PASSWORD`, `PROD_URL` all unset; no production `.env`; `supabase/config.toml` carries local ports only. The MCP connector executes SQL and exposes no connection string |
| `pg_dump` version available | **16.15** and **16.2** — both refuse a 17.6 server (`aborting because of server version mismatch`) |
| `postgresql-client-17` | **not installable** — PGDG is blocked by this environment's proxy policy |
| PITR | **not available** — organization `lgcbbmkiywvcpuffkszy` is on plan `free` |

### Consequence

`docs/APPROVAL-PACKAGE.md` §2 requires a *recoverable* copy before any
repair, and Phase 3 of the release brief requires the same. **That
requirement is not satisfied by this file and cannot be satisfied from
this session.**

So the five ledger repairs must not be run yet — independently of the
Phase 2 recovery decision. Both blockers have the same two root causes:
no PostgreSQL 17 client, and no database credentials.

The outstanding action is in the final report: an authorised operator
with the project's credentials and a PG17 client takes the capture, or
PITR is enabled.
