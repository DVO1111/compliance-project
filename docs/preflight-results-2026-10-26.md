# Production preflight results — 26 October 2026

**Scope of authority.** The product owner authorised read-only
preflight queries against the real database for the four proposed
foreign keys and the `rejection_reason` constraint, with these limits:
no DDL, no data repair, no migration, no other production change, and
no exposure of sensitive records.

**What was run.** Four `SELECT`-only statements against project
`ovxfflilbqaxedzovgmz` (`ACTIVE_HEALTHY`, PostgreSQL 17.6.1.063)
through the Supabase MCP connection. Nothing else. No `ALTER`, no
`INSERT`, no `UPDATE`, no `DELETE`, no migration was applied, and no
row contents were selected — only constraint metadata, counts, and
(where asked for) distinct vocabulary values.

**Nothing was changed.** These results are for review before any
production-facing migration is prepared.

---

## 1. Do the constraints already exist?

| Table | `company_id` FK to `companies` | `company_id NOT NULL` |
|---|---|---|
| `shipments` | **no** | yes |
| `shipment_events` | **no** | yes |
| `cn_declarations` | **no** | yes |
| `contraband_rejection_log` | **no** | yes |

Checked live rather than assumed. All four are missing the foreign key
in production, confirming the finding made from the migrations, and
`contraband_rejection_log` is among them — the fourth table, not named
in the original report of three.

`reltuples` read `-1` on all four, meaning they have never been
`ANALYZE`d. That is why the counts below were taken with `count(*)`
rather than from the planner's estimate.

---

## 2. Row counts and orphans

| Table | Rows | Distinct companies | Orphan rows | Orphan companies | Nil-UUID rows |
|---|---|---|---|---|---|
| `shipments` | **0** | 0 | 0 | 0 | 0 |
| `shipment_events` | **0** | 0 | 0 | 0 | 0 |
| `cn_declarations` | **0** | 0 | 0 | 0 | 0 |
| `contraband_rejection_log` | **0** | 0 | 0 | 0 | 0 |

An "orphan" is a row whose `company_id` has no matching row in
`companies` — precisely what `ALTER TABLE … ADD FOREIGN KEY` validates
and aborts on.

### What this does and does not establish

**It establishes** that adding the four foreign keys cannot fail on
existing data, and cannot require any row to be deleted, reassigned or
repaired. There is no data to conflict with them.

**It does not establish that the data is clean**, because there is no
data. The four tables are empty, which means the logistics and customs
feature has never been used in production — not that it has been used
cleanly. The distinction matters for how this result should be read
later: it is evidence about *today's* table contents and nothing more.
If these tables are populated before the migration is deployed, the
preflight should be run again.

---

## 3. `contraband_rejection_log.rejection_reason`

| Measure | Result |
|---|---|
| Total rows | **0** |
| CHECK constraints on the column | **(none)** |
| Rows outside the eleven accepted values | 0 |
| Blank rows | 0 |
| Values with leading/trailing whitespace | 0 |
| Distinct values present | 0 |

The column is free text in production, with no constraint, exactly as
the migrations describe. Because the table is empty there are no
incompatible values, and no row would be refused by a CHECK over the
eleven values `REJECTION_REASONS` offers.

**No value had to be redacted from this report**, because none exists.
Had any been present, the out-of-vocabulary values would have been
reviewed before being quoted here, since the column is free text and
could in principle hold a customer name.

---

## 4. Context — is the database fresh, or is the feature unused?

This was asked because "zero orphans" means different things in an
empty database and a busy one.

| Table | Rows |
|---|---|
| `companies` | 30 |
| `profiles` | 20 |
| `batch_records` | 18 |
| `audit_logs` | 194 |
| `capa_records` | 2 |
| `deviations` | 0 |
| `material_lots` | 0 |
| `suppliers` | 0 |

So production is **a real but lightly used database**, not a blank
one: thirty companies, twenty profiles, eighteen batch records and
194 audit entries. The logistics tables are empty because that feature
has not been used, not because the database is new.

### Two tables do not exist in production at all

Both of these queries failed with `42P01 relation does not exist`:

- **`facility_zones`** — so none of the facility-logs migrations
  (`20261204000000` onwards) has been applied to production. Expected,
  and required: this branch's migrations are not deployed.
- **`section_permissions`** — so **the PM-03 migrations have not been
  applied to production either**.

The second is worth flagging on its own. PM-03 is the operational
authorisation matrix, and `app_section_access()` reads
`section_permissions` to decide what a role may do. A deployment that
adds the four foreign keys would still leave that gap, and anything
relying on PM-03 server-side enforcement in production is relying on a
table that is not there.

This is reported, not acted on. It was found while establishing
context for the preflight and is outside what was authorised here.

---

## Recommendation

For the four foreign keys and the `rejection_reason` CHECK, the data
objection is resolved: **there is nothing to migrate around.** The
two-step form is still the right one, for lock duration rather than
for safety:

```sql
ALTER TABLE public.shipments
  ADD CONSTRAINT shipments_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES public.companies (id) NOT VALID;

ALTER TABLE public.shipments VALIDATE CONSTRAINT shipments_company_id_fkey;
```

`VALIDATE` takes a weaker lock than adding a valid constraint
outright, and the pattern is already used for
`shipment_events_event_type_check` in `20261203000000`.

For `rejection_reason`, the same two-step CHECK over the eleven values
— with the caveat recorded in `navigation-decisions.md` that a closed
list means every new reason needs a migration, and that
`Other Policy Violation` already exists as its tail.

**No migration has been written.** Per the instruction, these results
go for review first.
