# Migration history reconciliation

Five migration files cannot be recorded in the ledger because each
shares a version string with a sibling. This is the reconciliation of
all five: what each contains, what the live database actually has, and
whether marking it applied without executing it would be true.

**For two of the five it would not have been.** §3.

| | |
|---|---|
| Live project | `ovxfflilbqaxedzovgmz` |
| Read | 2026-10-23 / 2026-10-24, read-only (`SELECT` only) |
| Rehearsal | PostgreSQL **17.6**, Supabase CLI **2.122.0** |
| Production writes | **none** |

---

## 1. The five pairs

`supabase_migrations.schema_migrations` has `version` as its primary
key. Two files with the same 14-digit prefix can never both be
recorded.

| Version | File A — in the live ledger | File B — stranded |
|---|---|---|
| `20260226200000` | `content_calendar` | **`team_chat`** |
| `20260227100000` | `fix_custom_roles_403` | **`fix_dash_rpcs`** |
| `20260301000000` | `calendar_deadline_reminders` | **`update_activity_feed_limit`** |
| `20260305100000` | `create_legal_partner_tables` | **`policy_attestation_enhancements`** |
| `20260306190000` | `ai_asset_inventory` | **`retention_legal_hold`** |

The right-hand column is a live reading: production's ledger holds
exactly the left-hand name at each version.

**Why each File B is outstanding:** the CLI lists local files not
present in the ledger. Each File B's version *is* present — under its
sibling's name — but the CLI matches on version alone, so it sees five
files it believes unapplied, all with versions older than the newest
applied migration (`20261101000000`). That is the condition
`DbPushMissingRemoteError` describes, and it stops `db push` before
the first migration.

`supabase migration repair --status applied <version>` cannot fix it:
the version it would insert is already taken.

---

## 2. Effect-by-effect comparison

**Object existence was treated as insufficient, and that mattered.**
Every intended effect of each file was enumerated from its source and
checked against the live database: tables, columns with types,
nullability and defaults, indexes with uniqueness, constraints,
function definitions, triggers, policies by name, grants, enum
changes, data changes.

No file in the five makes an enum change. None writes data (M1's
`ensure_default_chat_channels` inserts only when called). None issues
an explicit `GRANT`.

### M1 — `20260226200000_team_chat.sql` → `20260226200002`

| Effect | Intended | Live | |
|---|---|---|---|
| Tables | 6 (`chat_channels`, `chat_channel_members`, `chat_messages`, `chat_reactions`, `chat_mentions`, `chat_relay_destinations`) | all 6 present | ✅ |
| RLS | enabled on all 6 | enabled on all 6 | ✅ |
| Indexes | 9 | all 9 present | ✅ |
| Policies | 19, named | **all 19 present under the exact same names** | ✅ |
| Function | `ensure_default_chat_channels(uuid)` | present | ✅ |

**Verdict: `effects_already_present`.**

One asymmetry, and it points the other way: the live function
additionally carries `SET search_path`, added later by
`20260304100000` (applied). **Executing this file would strip that
hardening.** Marking it applied preserves it.

### M2 — `20260227100000_fix_dash_rpcs.sql` → `20260227100001`

Function-only. Existence proves nothing; the bodies were compared.

| Function | Intended marker | Live | |
|---|---|---|---|
| `mark_content_in_review(uuid)` | `lower(v_role)` — the case-insensitivity fix this file exists for | present, carries `lower(v_role)` and `legal_reviewer` | ✅ |
| `get_my_past_decisions(uuid,integer,uuid)` | returns `days_to_decide` | present, matches | ✅ |
| `get_reviewer_workload(uuid,integer)` | returns `avg_turnaround_hours` | present, matches | ✅ |
| `get_decisions_summary(uuid,uuid)` | returns `avg_hours_to_decide` | present but **does NOT contain that column** — 1675 chars against this file's ~700 | ⚠️ **superseded** |

`get_decisions_summary` on production is a **later** definition,
installed by `20260305200000_fix_decisions_summary_rpc.sql`, which is
applied. So this file's version of it is obsolete.

**Verdict: `effects_superseded`.** Nothing is missing.

**Executing this file would regress `get_decisions_summary`** to the
older body and strip `SET search_path` from all four functions. This
is the clearest case in the set where running the migration is worse
than marking it applied.

### M3 — `20260301000000_update_activity_feed_limit.sql` → `20260301000001`

One function. `pg_get_functiondef` was fetched in full and compared
against the file.

**The live body is character-identical to the file**, CRLF line
endings included: same `recent_logs` CTE, same
`LIMIT GREATEST(p_limit, 1)` — the fix the file exists to make — same
`COALESCE(p.full_name, p.email, 'System')`.

**Verdict: `effects_already_present`.** Plus `SET search_path`, which
executing the file would strip.

### M4 — `20260305100000_policy_attestation_enhancements.sql` → `20260305100001`

| Effect | Intended | Live | |
|---|---|---|---|
| `policy_versions.requires_ack` | `BOOLEAN NOT NULL DEFAULT true` | `boolean NOT NULL` — **DEFAULT `false`** | ❌ |
| `policy_versions.due_days` | `INTEGER DEFAULT 14` (nullable) | `integer NOT NULL DEFAULT 14` | ⚠️ stricter |
| `policy_versions.published_by` | `UUID REFERENCES auth.users(id)` | `uuid`, FK → **`profiles(id) ON DELETE SET NULL`** | ⚠️ different target |
| `UNIQUE (policy_id, version_id, user_id)` on `policy_acknowledgements` | required | **ABSENT** | ❌ |
| RLS on `policy_acknowledgements` | enabled | enabled | ✅ |
| Policies | 3, named | **2**, differently named (`users_read_own_acks`, `users_insert_own_acks`) | ❌ |

**Verdict: `effects_completed_by_this_migration`.** Three real
divergences, one of them a missing data-integrity constraint.

**And this file cannot be executed at all.** Two of its three
`CREATE POLICY` statements reference `policy_acknowledgements.company_id`.
That column **does not exist** — not on production
(`id, policy_id, version_id, user_id, acknowledged_at, ip_address, user_agent`)
and not locally. The file's own comment admits the assumption:
*"Note: Assuming policy_acknowledgements already has company_id based
on previous sprint context."* It was wrong. Running this migration
would fail with `column "company_id" does not exist`.

So for M4 the choice was never "run it or mark it applied". It was
"mark it applied with its gaps closed, or leave `db push` broken".

### M5 — `20260306190000_retention_legal_hold.sql` → `20260306190001`

| Effect | Intended | Live | |
|---|---|---|---|
| Tables | 3 (`retention_policies`, `legal_holds`, `legal_hold_items`) | all 3 present | ✅ |
| RLS | enabled on all 3 | enabled on all 3 | ✅ |
| `idx_legal_hold_items_unique` (**UNIQUE**) | required | **ABSENT** | ❌ |
| `idx_legal_hold_items_lookup` | required | **ABSENT** | ❌ |
| `idx_retention_policies_company` | required | **ABSENT** | ❌ |
| `idx_legal_holds_company` | required | **ABSENT** | ❌ |
| Policies | 6 (2 per table), named | 6 (2 per table), **different names** | ⚠️ unverified |
| Function `is_on_legal_hold(text,uuid)` | required | present | ✅ |

**Verdict: `effects_completed_by_this_migration`.** Every table and
the function exist, and **not one of the four indexes does** — which
is precisely why object existence is not equivalence. The unique one
is a data-integrity control: without it the same entity can be placed
under the same legal hold twice.

The policy names differ (live: *"Users can view their company's legal
holds"*; file: *"Legal holds are viewable by company members"*).
Counts match and the intent appears equivalent, but **the predicates
were not compared clause by clause**, so this is recorded as
unverified rather than equivalent.

---

## 3. Blockers found, and what was done about them

| Unverified or missing effect | Treatment |
|---|---|
| M4: `UNIQUE (policy_id, version_id, user_id)` absent | **Closed** by `20261202000000` |
| M5: four indexes absent, one UNIQUE | **Closed** by `20261202000000` |
| M4: `requires_ack` defaults `false`, file said `true` | **Left alone — needs a decision.** Flipping it makes every future policy version require acknowledgement. That is a compliance choice |
| M4: third policy absent (compliance reads others' attestations) | **Left alone — needs a decision.** It grants read access over other people's records, and cannot be created without first adding `company_id` |
| M4: `published_by` → `profiles(id)` not `auth.users(id)` | **Left alone.** The live target is arguably better; changing a foreign key is not a reconciliation |
| M4: `due_days` NOT NULL where the file allowed null | **Left alone.** Live is stricter |
| M5: policy predicates not compared clause by clause | **Recorded as unverified** in the register |

`20261202000000_reconcile_duplicate_version_migrations.sql` adds **only
integrity constraints and indexes** — things that refuse bad data and
grant nobody anything. It changes no default, creates no policy, and
alters no foreign key.

It also refuses to proceed if the data would violate what it adds:

```
POLICY_ACK_DUPLICATES_EXIST: … Resolve the duplicates through the
quality process first; do not delete attestation records to make a
migration pass.
```

**Checked before proposing, not assumed:** `policy_acknowledgements`,
`legal_hold_items`, `legal_holds`, `retention_policies` and
`policy_versions` all hold **zero rows** on production, with zero
duplicate key groups. Nothing can fail on existing data, and nothing
needs backfilling.

### Why a register table

Five migrations will show in the production ledger as applied although
they were never executed, and the ledger has no column for "why".
`public.migration_reconciliations` holds one row per file with its
verdict, its evidence, and what was deliberately **not** reconciled.
It is a rule table: readable by `authenticated`, writable by nobody
(the same treatment `20261123000000` gave the six it found open).

---

## 4. Strategy comparison

| | **S1 — versioned file correction** (chosen) | **S2 — mark applied, files untouched** | **S3 — bypass the CLI** |
|---|---|---|---|
| What happens | rename the five File Bs to unique versions; `migration repair` those versions; a forward migration supplies the missing effects | impossible — the version is already in the ledger under the sibling | apply the 31 with `psql`, insert ledger rows by hand |
| Duplicate versions after | **none** | n/a | five remain |
| History preserved | **yes** — file contents unchanged, originals recorded in the register | n/a | yes, but the defect stays |
| `db push` works afterwards | **yes** | n/a | **no** — breaks again next deployment |
| Missing effects | **supplied and asserted** | n/a | still missing unless hand-applied |
| Ordering guarantees | the CLI's | n/a | **abandoned** |
| Cost | 5 renames, 5 ledger writes, 1 migration | — | manual, repeats every deployment |

**S2 is not an option**, which is worth stating because it is the
obvious first idea: `migration repair --status applied 20260226200000`
fails, since that version is already recorded as `content_calendar`.

**S3 leaves the defect in place.** The next migration added to this
repository hits the same wall.

**S1 chosen.** It is the only strategy that leaves the repository in a
state where the documented tool works, and the renames change not one
byte of any migration's content.

---

## 5. The rehearsal, on PostgreSQL 17.6

Isolated cluster, real CLI, production's ledger position, nothing
touching Supabase.

| Step | Result |
|---|---|
| Workdir with the five renamed | duplicate versions: **0** |
| Pre-boundary build | 169 applied, **15 failed — the pinned baseline** |
| Ledger seeded to production's position + 5 repairs | **184 rows**, latest `20261101000000` |
| `supabase db push --dry-run` | **31 outstanding** — no `--include-all` needed |
| `supabase db push` | **31 of 31 applied**, in filename order, **1.45 s** |
| Ledger after | **215 rows**, latest `20261202000000` |
| `batch_release_signature_postcondition()` | **PASS** |

Post-deployment verification in the rehearsal database:

| | |
|---|---|
| `policy_acknowledgements_version_user_unique` | **present** — `UNIQUE (policy_id, version_id, user_id)` |
| `idx_legal_hold_items_unique` | **present, UNIQUE** |
| `idx_legal_hold_items_lookup`, `idx_retention_policies_company`, `idx_legal_holds_company` | **present** |
| `migration_reconciliations` | **5 rows**, 2 of them `effects_completed_by_this_migration` |

Compare with before: the same push, without the renames, refused
outright; with `--include-all` it widened to 35 and died on
`idx_chat_channels_company already exists`
([`deployment-rehearsal.md`](deployment-rehearsal.md) §3).

### Regression coverage

`supabase/tests/migration_reconciliation_test.sql` — **18 assertions**:
the constraint exists and covers the right three columns; the unique
index exists *and is unique*; the other three indexes exist; a
duplicate attestation is refused with **SQLSTATE 23505**; all five
files are registered with distinct versions that differ from their
originals and collide with no real migration; the two incomplete ones
are recorded as such; every row carries evidence; the `requires_ack`
divergence is on the record; an unrecognised verdict and an
evidence-free row are both refused; and the register is not writable
by an application role.

A5 is worth a note: its first version inserted a `company_id` column
that does not exist, so it "passed" on an undefined-column error while
proving nothing. It now asserts the SQLSTATE. **That false pass is how
M4's absent `company_id` — and therefore its unexecutability — came to
light.**

---

## 6. What this needs from you

Two approvals, and neither is a software change:

1. **Rename the five files in the repository** to the versions in the
   register, and push. No content changes.
2. **Five `supabase migration repair --status applied` calls** against
   production — the exact commands are in
   [`deployment-plan.md`](deployment-plan.md) §3. **These are writes to
   the production ledger.**

And three decisions that are not reconciliation and should not be
bundled with it:

3. `requires_ack` default — `false` (live) or `true` (as M4 intended)?
4. Should compliance staff be able to read other people's policy
   attestations? If yes, that needs a `company_id` column on
   `policy_acknowledgements` first, with a backfill.
5. Should M5's live policy predicates be compared clause by clause
   against the file's, or is "2 policies per table, intent equivalent"
   sufficient?

Nothing in items 3–5 blocks the deployment. They are recorded in
`migration_reconciliations.not_reconciled` so they cannot be lost.
