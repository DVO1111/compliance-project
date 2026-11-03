# Rollover preflight — read-only, 26 October 2026

Facts established by read-only queries against `ovxfflilbqaxedzovgmz`
(production). Nothing was changed. Counts are re-established each time
rather than carried forward — the figures below supersede the earlier ones.

## Current state

| | |
|---|---|
| `auth.users` | **20** |
| Live (not tombstoned) | 20 |
| Currently banned | **0** |
| `auth.identities` | 20 |
| **Identities keyed by email** | **0** |
| `auth.sessions` | 25 |
| `access_approvers` | **1** |
| `allowed_signins` | 5 |
| `company_members` | 21 |
| `20261212000000` applied | **NO** |
| `20261213000000` applied | **NO** |

## Prerequisites — status

| Precondition | Status |
|---|---|
| Rollover migration applied | ❌ **not applied** — `account_rollovers` does not exist |
| Allowlist enabled-state applied | ❌ **not applied** — `allowed_signins.is_enabled` does not exist |
| `app_rollover_preflight()` callable | ❌ absent; the script exits 2 with "apply the migration first" |
| Replacement owner created | ❌ not created |
| Replacement owner promoted | ❌ not promoted |
| ≥1 approver remains after rollover | ❌ **1 approver, all 20 users in scope** |
| Renaming frees the address | ✅ 0 of 20 identities keyed by email |
| Allowlist survives | ✅ keyed on email; only FK is `added_by … SET NULL` |
| Attribution preserved | ✅ by design — nothing is deleted |

**Four blocking preconditions.** The rollover cannot run, and the script
refuses at two separate points before touching anything.

## Refusal behaviour — no partial changes

Three independent refusals, in the order they fire:

1. **Migration absent** → `app_rollover_preflight` does not exist, the
   script exits 2 before listing users. Nothing touched.
2. **Identities keyed by email** → refuses before the first user. Currently
   0, so this would pass.
3. **Every approver in scope** → refuses before the first user, naming the
   bootstrap step. Currently 1 approver and 20 users in scope, so **this is
   the one that would fire today**.

All three are pre-flight: they happen before any write. The per-user loop
revokes membership first and exits non-zero on failure, so a user is never
left renamed-but-still-a-member.

The `access_approvers` keep-one trigger is the backstop if a rollover is
ever driven by hand instead of the script.

## Order to clear them

1. Apply `20261212000000`, then `20261213000000`.
2. Create the replacement owner: approved address, normal signup, **email
   verified**.
3. Promote it — service role only:
   `select public.admin_bootstrap_approver('<new-owner-email>');`
   It refuses a tombstoned account by design.
4. Confirm `select count(*) from public.access_approvers;` ≥ 2, or run the
   rollover with `--only=` to exclude the new owner.
5. Dry run: `npx tsx scripts/rollover/rollover.ts` — expect a plan, no
   refusal.
6. **Get explicit operator authorisation**, then `--apply`.

## Backup, audit and rollback

**Before:** export ids and addresses (no passwords, no tokens) outside the
repository; confirm a recent Supabase backup covers the business tables.

**Audit trail:** `account_rollovers` records the original address, the
tombstone, the memberships removed and whether the account was an approver
— written *before* the rename. Without it, `batch_records.created_by`
resolves to a tombstone and the authorship a GMP record carries is lost.
It is `ON DELETE RESTRICT`, so it cannot be removed by deleting the user it
describes.

**Rollback limits:**

* Membership — fully restorable from the record.
* Approver — restorable with the bootstrap function.
* **The account itself is not restorable.** The address may already have
  been re-registered, and the old row is tombstoned and banned. This is the
  irreversible part, and it is why the dry run exists.

## Not verified

**The Auth Admin API flow has never been executed.** There is no GoTrue in
this environment and no Supabase branch was created (billable). The
database half has 33 assertions, mutation-tested; the rename, ban, identity
update and global sign-out have only been reasoned about and asserted as
code shape. **It is not end-to-end verified and must not be described as
such.** The first real execution will be against production, which is why
the dry run and the explicit authorisation step are not optional.
