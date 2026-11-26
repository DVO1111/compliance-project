# Seed package reconciliation — 27 October 2026

Read-only. Nothing was imported anywhere, and nothing touched the live
project.

## Verdict

**The supplied dataset cannot be loaded into this application as
supplied.** Not one of its 42 tables is compatible. 170 distinct blockers.

This is not a defect in the package. The generator was written against
`source/prd_tables_extracted.sql` — the PRD's table definitions — and this
application's schema has moved on from that extract independently. The two
describe the same *domain* and not the same *database*.

## Files inspected

| File | |
|---|---|
| `seed/incoming/PACKAGE_RECONCILIATION.md` | read first, as instructed |
| `seed/incoming/source/generate.py` | 107 KB canonical generator |
| `seed/incoming/source/prd_tables_extracted.sql` | 18 KB PRD extract the seed targets |
| `seed/incoming/source/README.md.docx` | present; not parsed (binary) |
| `seed/incoming/sql/00_assumed_tables.sql` | creates 18 tables, alters 2 — **not applied anywhere** |
| `seed/incoming/sql/10_seed_demo.sql` | 770 INSERTs across 40 tables |
| `seed/incoming/sql/20_lifecycle_state.sql` | 112 INSERTs across 2 tables |
| `seed/incoming/sql/30_reset_demo.sql` | **not executed anywhere** |
| `seed/incoming/workbooks/*.xlsx` | 43 files (42 tables + `demo_users`) |

## One dataset, confirmed independently

The package note says the workbooks and the SQL are the same dataset. I
checked rather than took it: **770 + 112 = 882 INSERT statements across
40 + 2 = 42 tables**, matching both the note's figures and the workbook
count exactly. They are alternate representations of one dataset and must
not be loaded twice. The generator is canonical; the workbooks are
cross-check material.

## Compatibility, by table

| Verdict | Tables | Rows |
|---|---|---|
| Compatible as supplied | **0** | 0 |
| Table absent from the application | 17 | 316 |
| Table exists, columns missing | 24 | 562 |
| Table exists, required columns never supplied | 1 | 4 |

Totals: **17 missing tables, 111 missing columns, 42 required columns the
seed never supplies.**

### The 17 tables with no destination

`calibration_records`, `capas`, `certificates_of_analysis`,
`cleaning_records`, `coa_templates`, `documents`,
`environmental_monitoring`, `equipment`, `licences`,
`numbering_sequences`, `personnel_certificates`, `product_registrations`,
`qc_results`, `release_configurations`, `release_decisions`,
`specification_tests`, `training_assignments`.

`00_assumed_tables.sql` would create most of them. **It must not be
applied.** It is the PRD's shape, not this application's, and applying it
would give the project two parallel models of the same domain — one the
app writes to and one only the demo data lives in.

### Candidate mappings, scored by column overlap

Name similarity is a guess, so each was scored by how many of the seed's
columns the candidate actually has:

| Seed table | Best candidate | Coverage |
|---|---|---|
| `capas` | `capa_records` | 70% |
| `product_registrations` | `regulatory_licences` | 67% |
| `release_configurations` | `product_specifications` | 67% |
| `cleaning_records` | `line_clearance_records` | 46% |
| `licences` | `regulatory_licences` | 44% |
| `calibration_records` | `instrument_calibrations` | 43% |
| `qc_results` | *(best 31%)* | — |
| `environmental_monitoring` | `facility_log_entries` | 29% |

Only `capas → capa_records` is above two-thirds, and even there the
unmatched columns (`action_type`, `owner`, `raised_at`) are the ones
carrying meaning. Below about 50% the overlap is `id`, `company_id`,
`status`, `created_at` — present in almost every table, and therefore
evidence of nothing.

**No mapping is safe to apply automatically.** Each is a modelling
decision about what the demo record *means* in this application, and
`environmental_monitoring` and `cleaning_records` in particular would have
to be re-expressed as `facility_log_entries` rows against
`facility_zone_schedules` — a different shape, not a column rename.

## The three blockers that are not about column names

### 1. Electronic signatures — 139 rows, and the hardest of the three

The seed writes `content_hash`, `meaning_text`, `signer_role`,
`authenticated_at`, `auth_method`. The application has `record_hash`,
`hash_convention`, `signed_state`, `signer_email`, `action`, `reason`,
`definition_id`, `metadata`. Almost nothing lines up.

The hashes are the real problem. Both are 64-hex SHA-256, so the
application's `CHECK (record_hash ~ '^[0-9a-f]{64}$')` would **accept** the
seed's values. But the application computes its hash over its own canonical
serialisation and records which one in `hash_convention`; the seed computed
its over the generator's. Transplanting them produces 139 signatures that
pass the constraint and **fail verification** — records that look signed
and are not.

I will not generate replacement hashes. Fabricating signature hashes is
fabricating audit evidence, and a demo dataset is not worth it. If demo
signatures are wanted they must be produced by the application's own
signing path, which is also the only way `hash_convention` gets a truthful
value.

The seed's `meaning` values also include `acknowledged` and `performed`,
which are outside the application's allowed set (`authored`, `reviewed`,
`approved`, `rejected`, `verified`, `witnessed`, `released`).

### 2. Auth users — the seed requires 11 real accounts first

`company_members.user_id` has a foreign key to `auth.users` with
`ON DELETE CASCADE`. The seed resolves its users through a helper:

```sql
CREATE FUNCTION pg_temp.uid(e text) RETURNS uuid ...
  SELECT id INTO r FROM auth.users WHERE lower(email) = lower(e);
  IF r IS NULL THEN RAISE EXCEPTION 'Demo user % does not exist...'
```

It looks up real accounts and **raises if they are absent** rather than
inventing ids — good design, and it means loading the demo requires
creating 11 Auth accounts for `.example` addresses first.

**These 11 are demo actors, not the approved allowlist.** They are
`ada.okafor@ibadanpharma.example` and similar, in two fictional companies.
They must not be added to `allowed_signins`, and on a project where the
Before User Created hook is enabled they could not register anyway.

### 3. Demo scoping has nothing to key on

`companies.is_demo` does not exist in this application. It is the first
column the load touches and the first thing that fails, and it is also what
`30_reset_demo.sql` guards on. So the reset script cannot run against this
schema even if someone set `criateur.environment = 'demo'` — the guard
query itself errors on the missing column.

Accidentally protective, and not a substitute for the rule: **never run it
against the live project.**

## Rehearsal results

`scripts/seed/rehearse.sh`, against a throwaway database created with
`CREATE DATABASE … TEMPLATE` from the migration-built local one. **8 passed,
0 failed.**

1. Reconciliation exits non-zero while the schema does not match, so it can
   gate a load instead of being read by eye.
2. It names the missing tables.
3. The seed refuses a database not marked `criateur.environment = 'demo'` —
   its own guard, checked rather than assumed.
4. With the guard satisfied, the load fails against the real schema:
   `ERROR: column "is_demo" does not exist`, at the first table.
5. **No partial import.** `companies` 62 before, 62 after.
6. No demo rows reached `company_members`.
7. No demo rows reached `electronic_signatures`.
8. The lifecycle file is refused on its own too.

Point 5 is the one worth keeping: the generated SQL is wrapped in a single
`BEGIN`/`COMMIT`, so any failure rolls the whole thing back. That is a
property of the package, and it was verified by counting rows rather than
by reading the wrapper.

## Is the demo dataset technically ready?

**No.** Three things stand between here and a load, in order of difficulty:

1. **Decide what the 17 absent tables map to**, or accept new tables for
   them. This is modelling, not translation.
2. **Decide what demo signatures are.** Either produced through the
   application's signing path, or the dataset ships without them — and 139
   of 882 rows are signatures, so the demo story changes either way.
3. **Create the 11 demo Auth accounts** in whatever environment hosts the
   demo, which is not the production project.

What *is* ready: the reconciliation is reproducible
(`npx tsx scripts/seed/reconcile.ts`), the rehearsal is reproducible
(`scripts/seed/rehearse.sh`), both are read-only against a throwaway
database, and the importer refuses to write when either fails.

## Recommendation

Do not attempt a mapping layer for 42 tables. Either:

**(a)** Host the demo on its own database built from
`00_assumed_tables.sql` + the PRD extract — the shape the generator
already targets — and keep it entirely separate from the application. Fast,
and the demo is then a demo of the PRD rather than of the product.

**(b)** Regenerate from `generate.py` against *this* application's schema,
using `docs/seed/SCHEMA_INVENTORY.md` as the target. Slower, and the result
is a demo of the real product with real lifecycle states and real
signatures.

(b) is the one worth doing if the demo is meant to show Criateur. It is a
rewrite of the generator's table definitions, not a patch, and it should be
scoped as such.
