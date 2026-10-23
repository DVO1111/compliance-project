# Audit-chain threat model

What the audit chain protects against, what it does not, and the one
thing it cannot do at all.

This document is deliberately unflattering. An integrity control that
is described only by its guarantees is not a control, it is a claim.
Nothing here establishes regulatory compliance or validation.

Last reviewed: 2026-10-23.

---

## 1. What the chain is

Every write to a guarded table appends a row to `audit_logs`. Since
`20261108000000` the server assigns three fields and **discards
whatever the client sent** for them:

| Field | Assigned by | Meaning |
|---|---|---|
| `sequence_number` | `trg_audit_logs_seal` | position in that company's chain |
| `previous_hash` | `trg_audit_logs_seal` | the `integrity_hash` of the row before it |
| `integrity_hash` | `trg_audit_logs_seal` | `sha256` over this row's own contents plus `previous_hash` |

The chain is per company. `pg_advisory_xact_lock` on the company id,
taken inside the sealer, stops two concurrent writers from claiming the
same sequence number.

`verify_audit_chain` walks a company's rows in order and recomputes
each hash from the row itself. It reports three kinds of problem:
linkage (`previous_hash` does not match the prior row's hash),
contents (the recomputed hash does not match the stored one), and
absence (`integrity_hash` is NULL).

---

## 2. Who can alter a record

Ordered by how much it should worry you.

| # | Actor | Can they alter a record? | Detected? |
|---|---|---|---|
| 1 | Application user (anon / authenticated key) | **No** | n/a |
| 2 | `service_role` key holder | **No** — the triggers carry no service exemption | n/a |
| 3 | Someone who can run SQL as the table owner or a superuser — a Supabase dashboard SQL editor session, a direct connection with the database password, a Postgres role with `BYPASSRLS` | **Yes** | **Partly** — see below |
| 4 | Anyone who can restore a database dump | **Yes, completely** | **No** |
| 5 | Anyone who can edit a migration and have it applied | **Yes, completely** | **No** |

### Rows 1 and 2 — the application

`trg_block_audit_update`, `trg_block_audit_delete` and
`trg_block_audit_truncate` refuse the write, and the sealer overwrites
any hash the caller supplied. A caller cannot forge an entry's hash,
because the hash it offers is thrown away before the row lands.

This is the part the test suite proves, and it is real.

### Row 3 — the database owner

A superuser or the table's owner can:

```sql
ALTER TABLE public.audit_logs DISABLE TRIGGER trg_block_audit_update;
UPDATE public.audit_logs SET action = '…' WHERE id = '…';
ALTER TABLE public.audit_logs ENABLE TRIGGER trg_block_audit_update;
```

The suite does exactly this to simulate a tamper, which is the proof
that the route exists.

What saves you, partly, is that the contents are **recomputed** on
verification. An owner who edits a row and leaves the hashes alone is
caught: `verify_audit_chain` names the row and says the contents
disagree with the hash.

What does not save you is that recomputing is not secret.
`audit_log_payload` is a plain function in the same database. An owner
who edits a row, recomputes its hash, and then recomputes every
subsequent hash in that company's chain, produces a chain that verifies
cleanly and is a lie. It takes one loop.

**So: tamper-evident against careless alteration by the database
owner, and not tamper-evident against deliberate alteration by the
database owner.** Those are different things and the difference is the
whole point of this section.

### Rows 4 and 5 — wholesale replacement

A restored dump carries whatever it carries. A migration applied by
whoever controls deployment can do anything, including dropping the
triggers — which is not hypothetical; see §4.

Neither is detectable from inside the database.

---

## 3. There is no external anchor

Nothing in the chain is signed by a key the database does not hold.
Nothing is written anywhere the database owner does not control. There
is no third party who has seen any hash.

The consequence is exact: **the chain can demonstrate that records are
internally consistent; it cannot demonstrate that records were not
replaced.** For a regulator asking "how do you know this batch record
was not written last week", the chain alone does not answer, because
every artefact it would answer with lives in the same place as the
records.

An external anchor would be: a scheduled job that exports the latest
`sequence_number` and `integrity_hash` per company to somewhere outside
the database's trust boundary — a signed append-only log, a different
provider's storage with write-once retention, a timestamping service, a
countersignature from a key held in a KMS the database role cannot
reach — and a verifier that compares the live chain head against the
last anchored one.

**That is not built.** It is not partially built. Nothing in this
branch anchors anything. The cheapest version worth having is probably
a daily export of one row per company to object storage with object
lock, plus a check that today's chain head descends from yesterday's
anchored head; that is a small piece of work, and it is a decision for
you rather than something to add unasked.

---

## 4. What is actually true of the Criateur project today

Read-only inspection, 2026-10-23, project `ovxfflilbqaxedzovgmz`.
These are findings about production, not about this branch.

### The immutability triggers are absent

Migration `20260225000000_immutable_audit_trail` is recorded in
`supabase_migrations.schema_migrations` as applied. The triggers it
creates are **not on the table.** The only trigger on `audit_logs`
is `trg_prevent_audit_log_deletion`.

`fn_block_audit_mutation` does not exist either.

So on production, right now, before this branch is deployed: **audit
entries are UPDATE-able by anything that passes RLS.** The guarantee
in row 1 of the table above is a guarantee of this branch, not a
description of production.

How a recorded migration comes to have left no trace is not
established. A later migration dropping the function with `CASCADE`
would do it, as would a restore from a dump taken before February, as
would a manual `DROP`. The migration ledger does not record which.
**That is itself a finding**: the ledger says what was run, not what
survived.

`20261116000000_restore_audit_immutability.sql` recreates the function
and all three triggers, and self-tests them in a rolled-back
subtransaction by actually attempting the refused writes rather than
checking that a trigger exists. It is idempotent and safe to apply to
a database where they are already present.

### 57 entries have no hash

192 entries across 5 companies. 135 carry an `integrity_hash`; **57
carry none.** Those predate sealing and were written by code paths that
did not compute one.

They are reported as `unhashed` by `verify_audit_chain`, which is a
finding, and they are deliberately **not** marked legacy — marking them
would imply something was verified. No hash has been computed for them
after the fact and none should be: a hash computed today over a row
written in February proves only that the row says what it says today.

### An entry was back-dated and another was rewritten

`scripts/repair_audit_chain.mjs` **ran against production.** The
evidence is in the table:

- one `CHAIN_REANCHOR` entry exists, at `sequence_number` 7, for
  company `da3f4665-074b-4d6a-8866-e4c7ea84f3dc`
- its `created_at` is `2026-02-25 15:08:15+00` — a timestamp chosen to
  sit in the historical record, not the moment the row was written
- the `previous_hash` of the sequence-8 entry was `UPDATE`d so the
  chain would link through the new row

This is precisely what Decision 2 forbids: a fabricated hash and a
rewritten timestamp, presented as history.

Two things follow, and neither is a repair:

1. **The script is withdrawn, not fixed.** `scripts/repair_audit_chain.mjs`
   now throws on execution and carries a header recording what it did.
   The original is not in the tree.
2. **The entry it inserted is left alone.** Rewriting history to tidy
   up a rewrite of history is the same act twice. It stays, and it is
   recorded here, and the reanchor count is now one of the numbers
   `scripts/ci/live-readiness-report.sql` prints.

Since `20261108000000` (server-side sealing) and `20261116000000`
(immutability restored) the script could not work even if run: the
sealer would discard its hashes and the triggers would refuse the
`UPDATE`.

The script also contained a hardcoded anon key. That key is in git
history. Rotating it is a separate action, listed in the deployment
steps.

---

## 5. What this chain is good for

Being honest about the limits is not the same as saying it is
worthless. It defends against the threats that actually occur in a
system like this:

- a user editing a record to cover a mistake — **stopped**
- a user deleting an inconvenient entry — **stopped**
- a client forging a plausible hash — **stopped**, the hash is thrown away
- a batch record appearing to have been approved earlier than it was — **stopped** for anything written through the application
- silent corruption or a partial restore — **detected**, as broken linkage
- an insider with the database password rewriting a quarter of history — **not stopped, and not reliably detected**

The last line is the one to put in front of whoever signs off on this.
It is a reason to add an external anchor, and it is a reason not to
describe the audit trail to a regulator as tamper-proof.

---

## 6. Open items

| Item | Status |
|---|---|
| External integrity anchor | **Not built.** Decision needed: whether it is a release blocker. |
| 57 unhashed entries | Reported as a finding. No action proposed; hashing them now would be fabrication. |
| The back-dated `CHAIN_REANCHOR` entry | Left in place and documented. |
| Anon key in git history | Rotation required before production use. |
| Why `20260225000000` left no triggers | Unexplained. Worth establishing before trusting the migration ledger as evidence of anything. |
| Whether `requires_signature` should be true for the `release` transition | Currently false on production. Decision pending; see `docs/release-verification.md` §2. |
