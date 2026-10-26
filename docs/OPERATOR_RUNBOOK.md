# Operator runbook — rollover, allowlist, recovery, seed

Everything that needs a human with dashboard access, in the order it has to
happen. No credential, hook secret, service-role key or recovery token
appears in this file, and none may be added to it.

Target project: **`ovxfflilbqaxedzovgmz`** (production). There is no staging
project, so every step here is a production step and the dry runs matter.

---

## 1. Account rollover — behaviour and limits

### What it does

Existing users lose access and their approved addresses become available
again, while every business record keeps the authorship it already has.

Nothing is deleted. The `auth.users` row stays with its id, so
`batch_records.created_by`, `regulatory_licences.created_by` and every other
reference still resolves. What changes is the address the row holds, whether
it can sign in, and whether it is a member of anything.

Per account, in this order:

| Step | Effect |
|---|---|
| `app_rollover_revoke(id)` | records who they were, captures and removes memberships — **this is what ends data access** |
| `updateUserById` → tombstone | frees the address (`users_email_partial_key` was holding it) |
| `identity_data.email` | updated so the identity row does not claim an address it no longer owns |
| `ban_duration` permanent | the account cannot sign in even with a known password |
| `signOut(id,'global')` | deletes sessions and refresh tokens |

Revocation is first deliberately: it is the step that matters within the
hour and the only one that can be undone.

### The security boundary, stated exactly

Removing `company_members` ends data access **immediately** — every RLS
policy reads membership and is evaluated per statement.

An **access token already issued stays valid until it expires — one hour by
default**. It is a self-contained JWT, verified by signature and never
looked up in the database. During that window the holder can still make
authenticated requests; they return nothing, because the rows are gone. If
an immediate hard cut is required, the JWT signing key must be rotated,
which invalidates every session in the project at once and is **not** part
of this procedure.

### Limits

* **It will not run while rolling over the last approver.** Both the script
  and a database trigger refuse. Create the replacement owner first.
* **It cannot un-free an address.** Once freed, someone may register it.
  `app_rollover_restore_membership` restores membership; it cannot restore
  the account.
* **The Auth half is untested here.** The database half has 33 assertions in
  `account_rollover_test.sql`, run against a local Postgres. The Admin API
  calls need a real GoTrue and have not been executed — no Supabase branch
  was created, because that is billable infrastructure.

### Procedure

```bash
# 0. Apply the migration to the project first.
# 1. Plan. Changes nothing.
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  npx tsx scripts/rollover/rollover.ts

# 2. Create the replacement owner account (normal signup, approved address),
#    then promote it — service role only:
#      select public.admin_bootstrap_approver('<new-owner-email>');

# 3. Roll over. Irreversible for the addresses it frees.
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  npx tsx scripts/rollover/rollover.ts --apply
```

**As of the last check the plan step will refuse**, because all 20 users are
in scope and there is exactly 1 approver. That is step 2 telling you it has
not been done yet.

---

## 2. Allowlist and new-user onboarding

Full detail in `docs/ALLOWLIST_AND_RECOVERY.md`. The short version:

* An address must be in `allowed_signins` **and enabled** to register.
* Administration is `admin_allowlist_add` / `admin_allowlist_set_enabled` /
  `admin_allowlist_list`, each restricted to `access_approvers` members.
* The table has RLS on with **no policy**, so it cannot be read from a
  browser at all.
* **An empty table opens the product.** A table of disabled rows does not —
  otherwise disabling the last pilot user would publish the application.
* The allowlist **survives a rollover**: it is keyed on email, and its only
  link to `auth.users` is `added_by … ON DELETE SET NULL`.

### Still required — dashboard

1. `npx supabase functions deploy before-user-created --project-ref ovxfflilbqaxedzovgmz`
2. **Authentication → Hooks → Before User Created**: enable, point at
   `https://ovxfflilbqaxedzovgmz.supabase.co/functions/v1/before-user-created`,
   copy the signing secret.
3. `npx supabase secrets set AUTH_HOOK_SECRET=<the secret> --project-ref ovxfflilbqaxedzovgmz`
4. Apply `20261212000000` and `20261213000000`.
5. Test with one unapproved address: signup refused **and** `auth.users`
   does not grow.

Until 1–3 are done the hook is not in force and `provision_profile` is the
only gate.

---

## 3. SMTP and password recovery

Supabase still generates and verifies the recovery token. Only the sender
and the styling change. There is no homemade token system and there must not
be one.

**Provider: Hostinger**, already sending from `criateur.com` and proven by
the `request-info` function. Resend is also configured but still on its
`onboarding@resend.dev` test sender — the wrong thing to have in the From
line of a password reset.

**Authentication → Emails → SMTP**

| Field | Value |
|---|---|
| Host | `smtp.hostinger.com` |
| Port | `465` |
| Username | the Criateur mailbox, e.g. `no-reply@criateur.com` |
| Password | that mailbox's password — **secret only, never committed** |
| Sender email | the same address |
| Sender name | `Criateur` |

**Authentication → Emails → Reset Password**: subject
`Reset your Criateur password`, body = contents of
`supabase/templates/recovery.html`. The hosted project does not read
`supabase/config.toml`.

**Authentication → URL Configuration → Redirect URLs**: add
`https://<production-origin>/?recovery=1` exactly. `passwordResetRedirectTo`
produces that URL and the link will not open without it. Keep the list to
approved application origins only — a wildcard here is an open redirect for
a recovery token.

**Not done and cannot be done from here:** send one real reset to a mailbox
you control and confirm it arrives from `criateur.com`, renders branded,
opens the reset screen, accepts a new password, and fails cleanly on second
use. **Until that is done the recovery flow is configured but not verified.**

---

## 4. Seed import — local and test only

See `docs/SEED_IMPORT.md` for the process and
`docs/seed/SCHEMA_INVENTORY.md` for the authoritative table shapes (285
tables, generated from the migrations).

**The seed package is not in this workspace.** Nothing from it has been
read, regenerated, reconciled or imported. Place the files at exactly:

```
seed/incoming/README.md.docx
seed/incoming/generate.py
seed/incoming/prd_tables_extracted.sql
seed/incoming/<sql-archive>.zip
seed/incoming/<excel-exports>.zip
```

`seed/incoming/` is git-ignored, so real data never enters the repository
history.

Once they are there I can regenerate from `generate.py`, reconcile the
README's 528-row/12-table summary against the SQL's 882-row/42-table count,
check `00_assumed_tables.sql` against the inventory to say which gaps are
genuine, and validate keys, constraints, company ids, lifecycle states and
email references. **None of that has been done** — the numbers above are
yours, quoted back, not findings of mine.

**`30_reset_demo.sql` must never be run against `ovxfflilbqaxedzovgmz`.** It
is scoped to demo-company business data and is for a local database only.
The full seed → showing → reset → reseed cycle runs locally.

Demo accounts in the package use `.example` addresses and are **not** the
signup allowlist. Do not add them to `allowed_signins`.

---

## 5. Backup, rollback, administrator recovery

### Before a rollover

* Export ids and addresses (no passwords, no tokens) — the current export is
  `auth-users-backup-2026-10-26.csv`, delivered outside the repository
  because it is twenty real addresses.
* Confirm `select count(*) from public.access_approvers` ≥ 2 if you intend
  to roll over an approver.
* A Supabase point-in-time or daily backup covers the business tables. A
  rollover does not touch them, but a mistake at the SQL console might.

### Rolling back a rollover

* **Membership:** `select public.app_rollover_restore_membership('<uuid>')`
  — restores exactly what was removed, from the record written before the
  removal.
* **Approver:** `select public.admin_bootstrap_approver('<email>')`.
* **The account itself cannot be restored.** The address may already have
  been re-registered by someone else, and the old row is tombstoned and
  banned. This is the irreversible part; it is why the plan step exists.

### If administration is locked out

Symptom: nobody can approve an access request or open the allowlist screen.

1. `select count(*) from public.access_approvers;` — if 0, the trigger was
   bypassed or the table was truncated.
2. With the service role: `select public.admin_bootstrap_approver('<email>')`
   for a **live** (not rolled-over) account.
3. The function refuses a tombstoned account on purpose — promoting one
   would hand administration to an account nobody can sign in to.

### If the allowlist is emptied by accident

An empty `allowed_signins` **opens the product to anyone**. Restore from
backup, or re-add the approved addresses immediately with
`admin_allowlist_add`. This is the single highest-consequence mistake
available at the SQL console, which is why disabling is the supported way to
remove someone and deletion is not.
