# Approval package

Narrowly scoped. Everything needed to approve or reject the deployment
sequence, and nothing else. No review is repeated here; the evidence
behind each claim is linked.

| | |
|---|---|
| Baseline | `2503cc0` → this package |
| Target | `ovxfflilbqaxedzovgmz`, PostgreSQL **17.6** |
| Sequence | **31 migrations**, `20261103000000` … `20261202000000` |
| Production state | **untouched.** No write, no ledger repair, no merge |
| Regression | **2687 SQL assertions, 0 failed** on PostgreSQL 17.6; 1057 unit tests; typecheck and build clean |

---

## 0. The safety review you asked for, and what it found

You wrote: *"A command that restores the ledger count is not sufficient
by itself."* That was right, and the abort procedure I proposed was not
good enough. `supabase migration repair` was tested against a faithful
ledger model on PostgreSQL 17.6 — six cases, observing **row contents**,
not counts.

| Case | Command | Effect on the ledger |
|---|---|---|
| 1 | `repair --status applied <free version>` | Inserts the row, **and writes the file's statements into it** — 41 for `team_chat` — without executing them |
| 2 | `repair --status reverted <that version>` | **Deletes the row.** Clean, because it did not exist before |
| 3 | `repair --status applied <EXISTING version>` | **DESTRUCTIVE.** Overwrote a row's genuine evidence: `statements` went from 2 to 20, replaced by whatever the current file holds |
| 4 | `repair` a version with **no file** | `MigrationFileNotFoundError`. **Nothing written** — fails closed |
| 5 | `repair --status reverted <EXISTING version>` | **DESTRUCTIVE. The row is deleted outright**, evidence and all |
| 6 | `repair --status applied` twice | Idempotent |

### The single highest-risk keystroke in this deployment

Cases 3 and 5 are reachable by one transposed digit. The five target
versions end `…02`, `…01`, `…01`, `…01`, `…01`; the five originals end
`…00`. **Every original version has a migration file**, so a typo does
*not* fail closed the way case 4 does — it lands on real SQL and either
overwrites the row's evidence or deletes it.

Live confirmation of what is at stake:

| Original version | Occupied by | `statements` |
|---|---|---|
| `20260226200000` | `content_calendar` | **20** |
| `20260227100000` | `fix_custom_roles_403` | **2** |
| `20260301000000` | `calendar_deadline_reminders` | **5** |
| `20260305100000` | `create_legal_partner_tables` | **12** |
| `20260306190000` | `ai_asset_inventory` | **20** |

**Therefore:** no repair command is run until §2's full ledger capture
exists, because that capture is the only recovery for a destroyed row.
PITR would also recover it; a dump taken before the window would too.
Nothing else would.

### One consequence to accept knowingly

Case 1 means the five repaired rows will carry `statements` **read from
their files although that SQL was never executed**. The ledger will
therefore assert more than happened. That is inherent to
`migration repair` and cannot be configured away. It is why
`public.migration_reconciliations` exists: one row per file, with the
verdict, the evidence, and what was deliberately not reconciled, so the
ledger's claim is never left unexplained. Verdicts are
`effects_already_present` (2), `effects_superseded` (1), and
`effects_completed_by_this_migration` (2).

---

## 1. The five renames

Content-free: each file keeps its bytes and changes only its version
prefix. The sha256 is given so the diff can be checked as a pure rename.

| # | From | To | sha256 (first 16) | Lines |
|---|---|---|---|---|
| 1 | `20260226200000_team_chat.sql` | `20260226200002_team_chat.sql` | `00dd8b1e73b1e6c0` | 191 |
| 2 | `20260227100000_fix_dash_rpcs.sql` | `20260227100001_fix_dash_rpcs.sql` | `a5db27bb40be7f4a` | 142 |
| 3 | `20260301000000_update_activity_feed_limit.sql` | `20260301000001_update_activity_feed_limit.sql` | `7045931d55a36887` | 47 |
| 4 | `20260305100000_policy_attestation_enhancements.sql` | `20260305100001_policy_attestation_enhancements.sql` | `3f5723e26e1395ad` | 42 |
| 5 | `20260306190000_retention_legal_hold.sql` | `20260306190001_retention_legal_hold.sql` | `3570a8ad9e30b7a0` | 156 |

```bash
cd supabase/migrations
git mv 20260226200000_team_chat.sql                       20260226200002_team_chat.sql
git mv 20260227100000_fix_dash_rpcs.sql                   20260227100001_fix_dash_rpcs.sql
git mv 20260301000000_update_activity_feed_limit.sql      20260301000001_update_activity_feed_limit.sql
git mv 20260305100000_policy_attestation_enhancements.sql 20260305100001_policy_attestation_enhancements.sql
git mv 20260306190000_retention_legal_hold.sql            20260306190001_retention_legal_hold.sql
```

### Collision review

| Check | Result |
|---|---|
| Does any target version already exist **as a file**? | **No** — all five free |
| Does any target version already exist **in the live ledger**? | **No** — all five free (read 2026-10-24) |
| Duplicate 14-digit prefixes in the repo **after** renaming | **0** (verified in the rehearsal workdir) |
| Does any target collide with a future real timestamp? | No — `…0001`/`…0002` are seconds within an existing minute, and sort between their original and the next migration |
| Content changed by any rename | **None.** Verify with `git show --stat` — five renames, zero insertions, zero deletions |

**Verify after renaming, before pushing:**

```bash
git diff --stat HEAD   # expect 5 renames, 0 insertions, 0 deletions
ls supabase/migrations/*.sql | sed 's#.*/##' | grep -E '^[0-9]{14}_' \
  | awk '{v=substr($0,1,14); n[v]++} END{d=0; for(v in n) if(n[v]>1) d++; print "duplicate versions:", d}'
```

---

## 2. Ledger capture — before any repair

**This is a precondition, not a formality.** It is the only recovery
for cases 3 and 5 short of PITR.

```bash
psql "$PROD_URL" -At -F'|' -c "
  SELECT version, coalesce(name,''), coalesce(array_length(statements,1),0)
    FROM supabase_migrations.schema_migrations ORDER BY version;
" > ledger-before-$(date -u +%Y%m%dT%H%M%SZ).txt

# Full fidelity, including the statements themselves:
pg_dump "$PROD_URL" --schema=supabase_migrations -Fc \
  -f ledger-before-$(date -u +%Y%m%dT%H%M%SZ).dump      # needs pg_dump 17.x

sha256sum ledger-before-*.txt ledger-before-*.dump | tee ledger-before.sha256
```

Fingerprint, to be recorded and re-checked after:

```sql
SELECT count(*) AS rows,
       md5(string_agg(version||'|'||coalesce(name,'')||'|'||
           coalesce(array_length(statements,1)::text,'0'), E'\n' ORDER BY version)) AS fingerprint
  FROM supabase_migrations.schema_migrations;
```

**Expected now:** `rows = 133`, `fingerprint = ebbd113e5966eaa1e934bba790e9860a`
(read 2026-10-24; 82 of the 133 rows carry `statements`).

**ABORT if the fingerprint differs** — the ledger has changed since this
package was prepared, and every figure below must be recomputed.

---

## 3. The five repair commands, with per-command preconditions

Run them **one at a time**, checking the precondition immediately
before each and the postcondition immediately after. Do not paste all
five as a block.

For each version `V` in order:

**Precondition (must return `free`):**

```sql
SELECT CASE WHEN EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations
                          WHERE version = 'V')
            THEN 'OCCUPIED — STOP' ELSE 'free' END;
```

**Command:**

```bash
supabase migration repair --db-url "$PROD_URL" --status applied V
```

**Postcondition (must return exactly one row, with the expected name):**

```sql
SELECT version, name FROM supabase_migrations.schema_migrations WHERE version = 'V';
```

| # | `V` | Expected name after | Independently verified precondition |
|---|---|---|---|
| 1 | `20260226200002` | `team_chat` | Target free in ledger ✅ and as a file ✅. Effects **already present**: 6 tables with RLS, 9 indexes, **19 policies under identical names**, function present |
| 2 | `20260227100001` | `fix_dash_rpcs` | Target free ✅✅. Effects **superseded**: 4 functions present; `get_decisions_summary` is a later body from `20260305200000` (applied) |
| 3 | `20260301000001` | `update_activity_feed_limit` | Target free ✅✅. Effects **already present**: body character-identical, `LIMIT GREATEST(p_limit, 1)` included |
| 4 | `20260305100001` | `policy_attestation_enhancements` | Target free ✅✅. Effects **completed by `20261202000000`**, which must have run — see §4 ordering. Columns present; uniqueness constraint supplied by the forward migration |
| 5 | `20260306190001` | `retention_legal_hold` | Target free ✅✅. Effects **completed by `20261202000000`**: 3 tables with RLS and the function present; **all four indexes supplied by the forward migration** |

**After all five — the integrity check that matters:**

```sql
-- (a) Exactly five rows added, and the 133 originals untouched.
SELECT count(*) AS rows,
       md5(string_agg(version||'|'||coalesce(name,'')||'|'||
           coalesce(array_length(statements,1)::text,'0'), E'\n' ORDER BY version)) AS fingerprint
  FROM supabase_migrations.schema_migrations
 WHERE version NOT IN ('20260226200002','20260227100001','20260301000001',
                       '20260305100001','20260306190001');
```

**PASS:** `rows = 133` and `fingerprint = ebbd113e5966eaa1e934bba790e9860a`
— **identical to §2**. This proves the repairs *added* five rows and
**modified none**, which a count alone cannot show.

**FAIL:** any difference. A pre-existing row was overwritten or
deleted. Stop, and restore it from §2's capture.

---

## 4. Execution sequence

Ordering is forced: the repairs must precede the push, or `db push`
sees 36 outstanding instead of 31.

| Step | Action | Ledger after |
|---|---|---|
| 0 | Recovery gate satisfied (§5) | 133 |
| 1 | §2 ledger capture + fingerprint `ebbd113e…` | 133 |
| 2 | Pre-flight: `latest = 20261101000000`, duplicate-data checks zero | 133 |
| 3 | Renames pushed to the branch (§1) | 133 |
| 4 | **Five repairs** (§3), one at a time | **138** |
| 5 | §3's integrity check — 133 untouched rows, fingerprint matches | 138 |
| 6 | `supabase db push --dry-run` → **expect exactly 31** | 138 |
| 7 | `supabase db push` | **169** |
| 8 | Postconditions (§6) | 169 |

Between steps 4 and 7 the ledger asserts `20260305100001` and
`20260306190001` applied while their effects are still absent —
`20261202000000` supplies them at step 7. **That window must not be
left open.**

### Abort

| If it fails at | Do this |
|---|---|
| Step 4 (a repair) | Stop. Revert **only the target versions already repaired in this run** (below). Never revert an original version — case 5 deletes it |
| Step 5 (integrity check) | Stop. A pre-existing row was damaged. Restore from §2's capture; do not proceed on a damaged ledger |
| Step 6 (not 31) | Stop. Revert the five. Re-examine §1's collision review |
| Step 7 (the push) | Revert the five **first**, then diagnose. A partial push leaves a clean boundary at a file: earlier migrations are committed, the failing one is not recorded |

```bash
# ONLY these five versions. Never an original.
supabase migration repair --db-url "$PROD_URL" --status reverted 20260226200002
supabase migration repair --db-url "$PROD_URL" --status reverted 20260227100001
supabase migration repair --db-url "$PROD_URL" --status reverted 20260301000001
supabase migration repair --db-url "$PROD_URL" --status reverted 20260305100001
supabase migration repair --db-url "$PROD_URL" --status reverted 20260306190001
```

**Then prove the abort worked** — not by counting:

```sql
SELECT count(*) AS rows,
       md5(string_agg(version||'|'||coalesce(name,'')||'|'||
           coalesce(array_length(statements,1)::text,'0'), E'\n' ORDER BY version)) AS fingerprint
  FROM supabase_migrations.schema_migrations;
```

**Must return `133` and `ebbd113e5966eaa1e934bba790e9860a`** — byte-for-byte
the pre-deployment ledger. Case 2 was tested: reverting a version that
did not previously exist deletes exactly that row and leaves the rest
alone. A matching count with a different fingerprint is a **failed
abort**, and §2's capture is the remedy.

If step 7 partially applied migrations, the schema has moved and the
ledger alone cannot undo it. That is the recovery gate, §5.

---

## 5. Recovery — the gate, and what satisfies it

You recommend **Option B (Pro + PITR)**. I agree, and the repair
findings above strengthen the case: cases 3 and 5 can destroy ledger
rows, and a partial push moves the schema. PITR recovers both to a
chosen second; a logical dump recovers to one instant and takes hours.

Neither option is satisfied yet. Full comparison and limitations:
[`recovery-readiness.md`](recovery-readiness.md).

### If Option B

| # | Prerequisite |
|---|---|
| B1 | Organization `lgcbbmkiywvcpuffkszy` on **Pro or above** (currently `free`) |
| B2 | **PITR add-on enabled on this project** |
| B3 | Retention window long enough to cover the deployment *and* the time to notice a problem |
| B4 | Physical backups active — satisfied by PostgreSQL 17.6 |
| B5 | A named person authorised to trigger a restore |

Evidence required before the gate opens: **F1** PITR shown enabled with
its window; **F2** a restore actually performed into a separate project
or clone, never over production; **F3** the recovered state verified
with the 16-check script; **F4** wall-clock time recorded; **F5**
sign-off.

### If Option A

Requires a **PostgreSQL 17** `pg_dump` — demonstrated: a 16.2 client
refuses outright (`server version: 17.6; pg_dump version: 16.2`), so an
operator on a PG16 toolchain cannot back this project up at all. Routes:
`supabase db dump`, `postgresql-client-17`, or `docker postgres:17.6`.

Evidence: **E1** tool version 17.x; **E2** dump filename and size;
**E3** sha256; **E4** **test restore performed**; **E5** the 16-check
comparison, production versus restored, with a `diff` showing them
identical; **E6** encrypted off-site location; **E7** sign-off.

**The drill is tested; the artefact does not exist.** The procedure and
its verification script were exercised end to end on an isolated
database — 279 tables, 462 functions, 555 policies, all 16 checks
identical, zero `pg_restore` errors — but on PostgreSQL 16 with test
fixtures, not on production's data. **No dump of this project has been
taken**, and it cannot be taken from this session: the connector
executes SQL and does not hand out a database password.

---

## 6. Postconditions after the push

Blocker-level subset; full criteria in
[`live-verification-checklist.md`](live-verification-checklist.md).

| Check | PASS |
|---|---|
| Ledger | **169 rows**, latest `20261202000000` |
| `batch_release_signature_postcondition()` | `PASS` |
| Release transition | one row: `batch_record`, `qc_in_progress → released`, `release`, `requires_signature = true` |
| `migration_reconciliations` | 5 rows, 2 `effects_completed_by_this_migration` |
| `policy_acknowledgements_version_user_unique` | present, `UNIQUE (policy_id, version_id, user_id)` |
| Legal-hold indexes | 4 present, `idx_legal_hold_items_unique` **UNIQUE** |
| `audit_logs` triggers | 4 present, all enabled |
| Audit history | **57** unhashed, **1** `CHAIN_REANCHOR` — fewer means history was tidied |
| CoA guard | `trg_material_coa_verification_authority` enabled; `anon` has no `EXECUTE` on `material_coa_verify` |
| CoA negative / positive | a role-less member refused; every quality-role holder permitted |
| Rule tables | **0** write grants to `anon`/`authenticated` |
| Policy register | 6 open decisions, 1 `temporary` |

---

## 7. Decisions that genuinely require you

| # | Decision | Blocking? |
|---|---|---|
| 1 | **Recovery: Option A or Option B**, and authorise the spend if B | **Yes** |
| 2 | **Approve the five renames** (§1) — content-free, collision review clean | **Yes** |
| 3 | **Approve the five ledger repairs** (§3) — five production ledger writes, preconditions independently verified | **Yes** |
| 4 | **Authorise the 31-migration push** (§4 step 7) | **Yes** |
| 5 | Merge the branch | **No** — deliberately separate, and not requested |

Not blocking, and **not** engineering's to decide — do not bundle these
with the above:

| Decision | Owner |
|---|---|
| `requires_ack` default: `false` (live) or `true` (as M4 intended) | Quality |
| May compliance staff read others' policy attestations? Needs a `company_id` column and a backfill first | Quality |
| Whether M5's live policy predicates need clause-level comparison | Quality / engineering, after deployment |
| Disposition of the seven released batch rows — `FT-9767` and the six suspected demo-seed rows | **QA only.** [`historical-release-review.md`](historical-release-review.md) §8 |
| The six open quality decisions, one a temporary exception | Quality |

---

## 8. What I am not asking for, and what I will not do

- **No merge.** Not requested, and kept separate from deployment.
- **No production write** until items 1–4 are approved — no migration,
  no ledger repair, no key rotation, no infrastructure.
- **Nothing retrospective.** No signature, QC result or audit entry will
  be created for a past event.
- **No gate switched off** to make a batch releasable or a test pass.

Production is untouched. Every live statement in preparing this package
was a `SELECT`.
