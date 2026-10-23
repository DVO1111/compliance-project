# Live verification checklist — READ ONLY

For an operator with database access to the Criateur project. Every
statement is a `SELECT`. Nothing here creates, changes or deletes
anything.

**Status: NOT RUN.** No query in this document has been executed
against the Criateur project. The Supabase connector has been failing
(`ERR_PROXY_TUNNEL`) since 2026-10-23, and the figures in
`docs/live-readiness.md` are a snapshot from that date, not current.

**Do not report live verification as complete until every section
below has been run against project `ovxfflilbqaxedzovgmz` and its
output recorded.**

---

## Before you start

| | |
|---|---|
| Project | `ovxfflilbqaxedzovgmz` — confirm it in §0 before trusting anything else |
| Other projects | **Do not connect to any other project.** Nonameyet and Traitwar are out of scope |
| Permissions needed | read access to `public` and `supabase_migrations` |
| Expected duration | a few minutes; every query is bounded |
| When to run | **twice** — once before applying any migration, once after |

Record the output of each section. A section with findings is not a
blocker by itself; it is something to explain before release.

---

## §0 — Identity and position

Run first. If this does not match, stop.

```sql
SELECT current_database() AS db,
       (SELECT count(*) FROM information_schema.tables
         WHERE table_schema='public')                        AS public_tables,
       (SELECT count(*) FROM supabase_migrations.schema_migrations)
                                                             AS migrations_applied,
       (SELECT max(version) FROM supabase_migrations.schema_migrations)
                                                             AS latest_applied,
       (SELECT count(*) FROM public.companies)               AS companies;
```

**Expected before deployment:** 258 public tables, 133 migrations,
latest `20261101000000`, 30 companies. Different numbers are not
wrong — they are newer — but they mean `docs/live-readiness.md` is
stale and §7 below matters more.

---

## §1 — Which of this branch's migrations are outstanding

```sql
WITH expected(version) AS (VALUES
  ('20261103000000'),('20261104000000'),('20261105000000'),('20261106000000'),
  ('20261107000000'),('20261108000000'),('20261109000000'),('20261110000000'),
  ('20261111000000'),('20261112000000'),('20261113000000'),('20261114000000'),
  ('20261115000000'),('20261116000000'),('20261117000000'),('20261118000000'),
  ('20261119000000'),('20261120000000'),('20261121000000'),('20261122000000'),
  ('20261123000000'),('20261124000000'),('20261125000000'),('20261126000000'),
  ('20261127000000'),('20261128000000'),('20261129000000')
)
SELECT e.version,
       CASE WHEN m.version IS NULL THEN 'OUTSTANDING' ELSE 'applied' END AS state
  FROM expected e
  LEFT JOIN supabase_migrations.schema_migrations m ON m.version = e.version
 ORDER BY e.version;
```

**Before deployment:** all 27 OUTSTANDING.
**After:** all 27 applied, and §§2–8 re-run.

---

## §2 — Unsigned service-context role grants

**Mandatory. A non-empty result is a finding to explain, not a list to
skim.**

```sql
SELECT co.name AS company, g.*
  FROM public.companies co,
       LATERAL public.operational_role_unsigned_grants(co.id) g
 WHERE g.still_live
 ORDER BY co.name, g.assigned_at;
```

Every row is an operational role somebody holds that **no person
signed for**. The `finding` column says which kind:

| `provenance` | Means |
|---|---|
| `service` | a migration, seed or scheduler granted it. No password, no second person |
| `bootstrap_self_declared` | a sole owner declared it during initial setup. Authority is declared, **not independently verified** |
| `rpc` with no signature | a GMP-critical grant that reached the table without one — should be impossible after deployment; investigate |

For each row: revoke and re-grant through the signed path, or record
in the quality system why it stands.

**This listing is the entire mitigation for "anyone who can run a
migration can appoint a QA Manager".** Skipping it removes the
mitigation and leaves the residual.

*Before deployment this query does not exist — the function arrives
with `20261121000000`. Run it in the after pass.*

---

## §3 — Stranded work

```sql
SELECT co.name AS company, w.*
  FROM public.companies co,
       LATERAL public.operational_role_stranded_work(co.id) w
 WHERE w.still_stranded
 ORDER BY co.name, w.last_acted_at;
```

Unfinished records whose last actor lost an operational role and can
no longer carry on. Each needs either

```sql
SELECT public.stranded_work_reassign(
  '<company>', '<entity_type>', '<entity_id>', '<to_user>', '<reason>');
```

to somebody who can act in that section, or a recorded explanation.

**Expected immediately after deployment: empty**, because no role has
been revoked yet. Rows appearing later are the mechanism working.

*Arrives with `20261124000000`.*

---

## §4 — Outstanding duty decisions

```sql
SELECT * FROM public.duty_decisions_outstanding();
```

**Expected: exactly one row — sampling versus testing.** Anything else
means the database and the approved decisions have drifted.

Cross-check the enforced set:

```sql
SELECT scope, duty_a, duty_b, enforced, decision_status, authority,
       left(coalesce(approved_reference,''), 60) AS reference
  FROM public.duty_conflicts
 ORDER BY scope, duty_a, duty_b;
```

**Expected: 6 enforced, 1 not.** Five carry
`authority = 'derived_from_pm03'`; one — CoA verification versus
disposition — carries `approved_by_quality` with a reference.
See `docs/decision-note-coa-separation.md`.

*Arrives with `20261125000000` / `20261128000000`.*

---

## §5 — Unsigned quality verdicts

```sql
SELECT b.company_id, q.batch_id, b.batch_number, q.test_name,
       q.result, q.pass, q.tested_by, q.tested_at
  FROM public.batch_qc_results q
  JOIN public.batch_records b ON b.id = q.batch_id
 WHERE q.signature_id IS NULL
 ORDER BY q.tested_at DESC;
```

Finished-product verdicts nobody signed for. After deployment the
application cannot create one; rows here are seeds, migrations, or
results recorded before the control existed.

**A released batch resting on an unsigned verdict is a finding.** To
find those specifically:

```sql
SELECT b.batch_number, b.status, b.released_at, q.test_name, q.pass
  FROM public.batch_records b
  JOIN public.batch_qc_results q ON q.batch_id = b.id
 WHERE b.status = 'released' AND q.signature_id IS NULL
 ORDER BY b.released_at DESC;
```

And the two signature requirements still held pending policy:

```sql
SELECT action_key, required, decision_status, left(basis, 70) AS basis
  FROM public.signed_quality_actions ORDER BY action_key;
```

**Expected: `batch_qc_result` required; `material_test_result` and
`batch_execution_close` not.** See
`docs/separation-of-duties.md` §5.5.

*Arrives with `20261127000000`.*

---

## §6 — Audit-chain findings

Three separate questions. Run all three.

### 6a. Are the immutability controls present?

```sql
SELECT t.tgname,
       CASE t.tgenabled WHEN 'D' THEN 'DISABLED' ELSE 'enabled' END AS state
  FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
 WHERE c.relname = 'audit_logs' AND NOT t.tgisinternal
 ORDER BY t.tgname;
```

**Before deployment, expect only `trg_prevent_audit_log_deletion`** —
`20260225000000` is recorded as applied and its triggers are absent.
**After, expect `trg_block_audit_update`, `trg_block_audit_delete` and
`trg_block_audit_truncate` as well**, all enabled.

### 6b. Entries, hashes and the re-anchor

```sql
SELECT count(*)                                       AS entries,
       count(*) FILTER (WHERE integrity_hash IS NOT NULL) AS hashed,
       count(*) FILTER (WHERE integrity_hash IS NULL)     AS unhashed,
       count(*) FILTER (WHERE action = 'CHAIN_REANCHOR')  AS reanchor_entries,
       count(DISTINCT company_id)                     AS companies
  FROM public.audit_logs;
```

**Known and expected:** 57 unhashed entries and 1 `CHAIN_REANCHOR`
row. Both are documented in `docs/audit-threat-model.md` §4 and are
**left in place deliberately**. Do not compute hashes for the
unhashed entries and do not remove the re-anchor row — rewriting
history to tidy a rewrite of history is the same act twice.

### 6c. Does the chain verify?

```sql
SELECT co.name, v.*
  FROM public.companies co,
       LATERAL public.verify_audit_chain(co.id) v
 ORDER BY co.name;
```

Expect `unsealed` / `unhashed` findings corresponding to 6b. A
**contents** mismatch would be new and is a blocker.

---

## §7 — Missing specifications and batches awaiting release

### 7a. What is waiting

```sql
SELECT status, count(*) AS batches
  FROM public.batch_records GROUP BY status ORDER BY 2 DESC;
```

**Snapshot of 2026-10-23:** 7 released, 4 rejected, 3 `qc_pending`,
2 `hold`, 2 `qc_in_progress`. The `qc_in_progress` ones are those
immediately blocked by the specification gate.

### 7b. Which products need a specification

```sql
SELECT p.id, p.trade_name, p.status,
       count(b.id) FILTER (WHERE b.status NOT IN ('released','rejected','archived'))
         AS open_batches,
       min(b.manufacturing_date) FILTER (WHERE b.status NOT IN ('released','rejected','archived'))
         AS earliest_open_manufacture,
       (SELECT count(*) FROM public.product_specifications s
         WHERE s.product_id = p.id AND s.status IN ('effective','superseded'))
         AS approved_specifications
  FROM public.products p
  LEFT JOIN public.batch_records b ON b.product_id = p.id
 GROUP BY p.id, p.trade_name, p.status
HAVING count(b.id) > 0
 ORDER BY open_batches DESC;
```

`earliest_open_manufacture` is the date each specification's
`effective_date` must reach back to. **A product with open batches and
zero approved specifications cannot release any of them.**

### 7c. Why a specific batch is blocked

```sql
SELECT b.batch_number, public.batch_release_block_reason(b.id) AS blocked_because
  FROM public.batch_records b
 WHERE b.status NOT IN ('released','rejected','archived')
 ORDER BY b.manufacturing_date;
```

NULL means nothing in the gate objects.

### 7d. Finished-product QC data

```sql
SELECT count(*) AS finished_qc_results FROM public.batch_qc_results;
```

**Snapshot: 0.** A specification alone will not release a batch that
has no results against it.

---

## §8 — Operational roles

```sql
SELECT (SELECT count(*) FROM public.operational_role_assignments
         WHERE revoked_at IS NULL)                        AS live_assignments,
       (SELECT count(DISTINCT user_id) FROM public.operational_role_assignments
         WHERE revoked_at IS NULL)                        AS people_with_a_role,
       (SELECT count(*) FROM public.operational_role_assignments
         WHERE revoked_at IS NULL AND role = 'qa_manager') AS qa_managers,
       (SELECT legacy_membership_bridge
          FROM public.work_role_resolution)               AS bridge_on;
```

**Immediately after deployment: all zero.** The table deploys empty
and nothing is back-filled — inventing an assignment would assert an
authority nobody granted.

**Until `qa_managers` is at least 1, no specification can be approved
and no batch can be released.** And until anybody holds a role, every
PM-03 guard abstains: the controls are installed, exercised on every
write, and silent.

Companies that cannot appoint anybody, because nobody may assign
themselves a role:

```sql
SELECT company_id, count(*) AS active_members
  FROM public.company_members
 WHERE coalesce(status::text,'active') = 'active'
 GROUP BY 1 HAVING count(*) < 2;
```

Each needs `operational_role_bootstrap(...)`, which is self-declared,
signed, permanently marked and reported by §2.

---

## §9 — Membership is untouched

A safety check, not a finding. Confirms the deployment did what it
said.

```sql
SELECT format_type(a.atttypid, a.atttypmod) AS role_column_type,
       (SELECT string_agg(enumlabel, ', ' ORDER BY enumsortorder)
          FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
         WHERE t.typname = 'company_role')  AS enum_values,
       (SELECT count(*) FROM public.company_members) AS members
  FROM pg_attribute a
 WHERE a.attrelid = 'public.company_members'::regclass AND a.attname = 'role';
```

**Expected, before and after, unchanged:** `company_role`, with
`owner, admin, legal, marketing, viewer`, and the same member count.
No migration on this branch alters the enum or the table — verified
against the branch, not assumed.

---

## Recording the result

| Section | Run? | Findings | Explained / actioned |
|---|---|---|---|
| §0 identity | ☐ | | |
| §1 migrations | ☐ | | |
| §2 unsigned grants | ☐ | | |
| §3 stranded work | ☐ | | |
| §4 duty decisions | ☐ | | |
| §5 unsigned verdicts | ☐ | | |
| §6 audit chain | ☐ | | |
| §7 specifications and batches | ☐ | | |
| §8 operational roles | ☐ | | |
| §9 membership untouched | ☐ | | |

Live verification is complete when every box is ticked **against
project `ovxfflilbqaxedzovgmz`** and every finding has an entry in the
last column. Until then it is not complete, however much of the local
suite passes.
