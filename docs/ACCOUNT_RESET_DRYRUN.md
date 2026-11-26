# Auth account reset — dry run, 26 October 2026

**No accounts were deleted.** This is the dry-run report, and it ends in a
blocker that needs a decision before anything is removed.

## Target environment

| | |
|---|---|
| Project ref | `ovxfflilbqaxedzovgmz` |
| Name | `my-app` |
| Region | `eu-west-1` |
| Postgres | 17.6.1.063 |
| Status | `ACTIVE_HEALTHY` |
| Classification | **Production.** It is the ref named throughout `docs/recovery-readiness.md`, `docs/key-rotation-checklist.md`, `docs/ACCESS_REQUEST_ONBOARDING.md` and the deploy commands, and it is the only active project on the account. |

The organisation holds one other project, `lzuuwdtrivqvccedbivz` ("RentTruth
App", `INACTIVE`). It is unrelated to Criateur and was not touched.

There is **no separate staging or preview Supabase project**. `supabase/config.toml`
describes a local stack only (`project_id = "project"`, `site_url =
http://127.0.0.1:3000`). So a deletion here is a deletion in production, with
no rehearsal environment available.

No credentials or keys appear in this document.

## What is in the project

| | Count |
|---|---|
| `auth.users` | **20** (0 soft-deleted) |
| `auth.identities` | 20 |
| `auth.sessions` | 25 |
| `auth.refresh_tokens` | 169 |
| `public.profiles` | 20 |
| `public.allowed_signins` | 5 |
| `public.companies` | 30 |
| `storage.objects` | 6 |

Pagination: 20 users is a single page of the Admin API's default 50, so no
paging is required.

**Auth triggers:** none. There are no custom triggers on any `auth.*` table,
so nothing user-defined runs on delete.

**Storage:** `storage.objects.owner` has **no foreign key** to `auth.users`.
Objects therefore neither block deletion nor are removed by it. Two of the
six objects are already owned by uuids that are not in `auth.users`, which
confirms this directly. No storage object will be deleted, as instructed.

## The allowlist survives — confirmed

`public.allowed_signins` is keyed on `email`, not on a user id. Its only link
to `auth.users` is `added_by uuid … ON DELETE SET NULL`. Deleting every Auth
user therefore leaves all five rows intact, with `added_by` becoming `NULL`.

The approved list is **not derived from `auth.users`** and does not need
re-creating after a reset.

## Blocker — the operation cannot complete as specified

Three of the twenty users **cannot be deleted** without first deleting
regulated business records, which Task 1 item 7 forbids.

They are referenced by foreign keys declared `NO ACTION`, which refuses the
delete rather than cascading:

| Address | Blocking references |
|---|---|
| `samuelbalogun77@gmail.com` | `batch_records.created_by`, `batch_records.released_by`, `regulatory_submissions.created_by` |
| `aeoladehinde@sterlinglams.com` | `batch_records.created_by`, `regulatory_licences.created_by` |
| `fmuyiwa58@gmail.com` | `regulatory_licences.created_by`, `regulatory_submissions.created_by` |

Affected rows: 6 batch records, 5 regulatory licences, 5 regulatory
submissions. These are exactly the attribution columns a GMP system exists to
keep — "who created this batch record", "who released it" — so the refusal is
the schema working as intended, not a defect to route around.

`electronic_signatures.signer_id` is `RESTRICT` and currently holds **0**
rows, so it blocks nothing today. It would block immediately once anyone
signs anything.

## Cascade effects on the other seventeen

Deleting them succeeds, and takes these with it:

| Table | Rows destroyed |
|---|---|
| `chat_channel_members` | 22 |
| `company_members` | **21** |
| `profiles` | 20 |
| `content_submissions` | 5 |
| `legal_partner_profiles` | 2 |
| `access_approvers` | **1** |

Two of these are worth stating plainly rather than leaving in a table.

**`company_members` → 21 rows.** Every RLS policy in this schema is written
against company membership. The 30 companies and all their business data
survive the deletion — `companies.created_by` is `SET NULL` — but with no
members, **no one can read any of it**. The data is intact and unreachable.

**`access_approvers` → 1 row.** That is the owner's approver status, and it
is what the access-request flow and the new allowlist admin functions check.
After the reset, nobody can approve an access request or administer the
allowlist until the row is re-seeded against a new user id.

Around 100 further columns are `SET NULL` (`audit_logs.user_id`,
`capa_records.created_by`, `deviations.raised_by`, `companies.created_by` and
so on). Those rows survive with the attribution blanked.

## Recommendation

This meets Task 1 item 8 — the operation "would destroy application data
beyond the understood account-linked effects" — so it was stopped and is
reported rather than guessed at. Three options, for your decision:

1. **Delete the 17 deletable users, keep the 3 blocked ones.** Does not give
   a clean slate, and still empties `company_members` and `access_approvers`.
2. **Delete all 20 by first removing the 6 batch records, 5 licences and 5
   submissions.** This destroys regulated records and is forbidden by item 7
   as written. It would need explicit authorisation naming those rows.
3. **Reassign the blocking attributions to a retained service identity**, then
   delete. Keeps the records and their history, changes who they are
   attributed to — which on a GMP system is itself a records-integrity
   decision, not a technical one.

Whichever is chosen, re-seeding `access_approvers` with the new owner account
must be part of it, or the project locks itself out of its own
administration.

## Access-token expiry

Deleting a user removes their rows from `auth.sessions` and
`auth.refresh_tokens` by cascade, so no new access token can be minted for
them. It does **not** invalidate an access token already issued: Supabase
access tokens are self-contained JWTs, verified by signature and not looked
up in the database, so one already in a browser keeps working until it
expires — **one hour** by default on this project (`jwt_expiry = 3600`).

So a deleted user may continue to make authenticated requests for up to an
hour. In practice their requests return nothing almost immediately, because
their `profiles` and `company_members` rows are gone and every RLS policy is
written against membership — but the token itself is still accepted as a
signature. If an immediate hard cut is required, the JWT signing key must be
rotated, which invalidates every session in the project at once.

## Method, if and when it proceeds

The Supabase Auth Admin API (`auth.admin.deleteUser`), one user at a time, in
a loop that records the outcome per id and stops on the first unexpected
error. Not `TRUNCATE`, not a direct `DELETE` on `auth.users`: both bypass
Auth's own bookkeeping, and Task 1 item 6 excludes them.

The backup of ids and addresses — ids, emails, created/last-sign-in dates,
confirmation status, allowlist membership and blocking references, with no
passwords, tokens or secrets — has been exported and sent separately. It is
deliberately **not committed to this repository**, because it is twenty real
people's email addresses and a git history is the wrong place for them.
