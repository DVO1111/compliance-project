# Hosted staging — what to set up, and what is still unproven

Phase 4 built a disposable local stack and verified the signup gate, the
account rollover, branded recovery and the demo-seed workflow against a real
GoTrue. This is what a hosted staging project would need, and — more
importantly — the list of things **local verification cannot settle**, so
nobody reads a green local run as more than it is.

**Nothing here has been provisioned.** No project was created, no key
rotated, no paid resource allocated. Creating a hosted project costs money
on this plan and needs a decision, not a script.

---

## Why staging is needed at all

There is exactly one Supabase project today — `ovxfflilbqaxedzovgmz` — and it
is production. That means four things currently have nowhere to happen:

1. **A demonstration with real actors.** `docs/seed/DEMO_IDENTITIES.md` sets
   the rule: the eleven `.example` story actors are not real people and must
   never be created, and a demo shown to anyone needs genuinely approved
   accounts in a non-production project. The demo seed is ready; the place
   to put it is not.
2. **Email delivery.** See below — this is the largest single gap.
3. **A migration rehearsal.** 11 of 230 migrations fail on a fresh database
   (the pinned baseline in `scripts/ci/expected-migration-failures.txt`).
   Production has them applied from an older state. Staging is where that
   divergence would become visible.
4. **The Before User Created hook.** It is configuration, set per project in
   the dashboard. A new project does not have it.

---

## Setting one up

In order; each step depends on the one before.

### 1. The project

A new Supabase project in the same organisation and region (`eu-west-1`), so
latency and residency match. **Needs approval: this is a billable resource.**

Do not use a branch of production for this. A Supabase branch shares the
parent's Auth configuration, and the whole point here is to change Auth
configuration without touching production.

### 2. The schema

`supabase db push` against the staging ref only — never with production
linked. Expect the pinned failures; `scripts/local/up.sh` tolerates exactly
those eleven and fails on anything new, and the same list applies here.

`public.companies` is created by **no migration** (only by
`scripts/ci/db-bootstrap.sql` and `scripts/local/bootstrap-local.sql`), so a
push to an empty project stops at
`20260226100000_ai_risk_intelligence.sql`. Deciding where `companies` ought
to be created is a schema decision for a live project and is still open; it
has to be settled before any project can be built from the migrations alone.

### 3. The allowlist

Seed `allowed_signins` with the **real** addresses of whoever will use
staging, through `admin_allowlist_add`.

> An empty `allowed_signins` is treated as OPEN, deliberately, so a fresh
> project is not locked out of its own bootstrap. A staging project with an
> empty allowlist therefore accepts anyone whose signup reaches it. Seed it
> before announcing the URL.

**Never add the eleven demo actors here, or to production.** They are
fictional; `docs/seed/DEMO_IDENTITIES.md` explains what to do instead.

### 4. The hook

Create the Before User Created hook pointing at the deployed
`before-user-created` function, and set `AUTH_HOOK_SECRET` from the secret
the dashboard generates.

**Keep the base64 padding.** A secret whose `=` padding has been stripped is
accepted by the CLI's validator and by the function's own `atob`, and then
GoTrue cannot sign with it:

```
Error generating signatures: unable to create webhook,
err: illegal base64 data at input byte 40
```

Every signup fails with a 500 that looks nothing like a malformed secret.
Verified locally; `scripts/local/up.sh` now checks the secret strictly
before starting anything.

The hook **fails closed** — an unset secret or an unreachable allowlist
refuses signups rather than admitting them. That is intended, and it means a
misconfigured hook presents as "nobody can register", not as a silent
opening.

### 5. Email

Custom SMTP, the recovery subject, and the recovery template body all go in
through the dashboard. `supabase db push` does not carry them, and the CLI
does **not** apply `[auth.email.smtp]` to a local stack at all, so the local
run proves nothing about them (see below).

`SMTP_PASSWORD` goes in the dashboard only. It must not appear in the repo,
in any `.env`, or in a build.

---

## What local verification did NOT establish

This is the part to read before calling anything done.

### Email delivery is entirely unproven

`scripts/local/test-recovery.sh` passes 23 assertions, and what they cover
is narrow: GoTrue rendered `supabase/templates/recovery.html`, the subject
and branding are Criateur's, the link is Supabase's own one-time recovery
link, following it yields a session, the password actually changes, the old
password stops working, and the link cannot be reused.

The message was accepted by the CLI's local mail catcher, **which accepts
everything**. None of the following is known:

| Unproven | Why it needs a real send |
|---|---|
| Hostinger's SMTP accepts and relays the message | The catcher never refuses, never greylists, never rate-limits |
| SMTP authentication succeeds | The catcher accepts any credentials; it was written to |
| SPF, DKIM and DMARC pass for the sending domain | These are DNS facts about `criateur.com`, not message facts |
| It lands in an inbox rather than spam | Depends on reputation, authentication and content together |
| The HTML survives real clients | Gmail and Outlook strip `<style>` and rewrite tables; the template is built for that, and it has not been seen in either |

**The test to run on staging:** request a reset for a real mailbox on a
domain you do not control (a personal Gmail, say), and confirm it arrives,
in the inbox, rendered, with a working link. Until that has happened, treat
branded recovery as implemented but unverified.

### The rollover's one-hour window

An access token issued before a rollover stays cryptographically valid until
it expires, because PostgREST checks the signature and not the ban. What
stops it reading anything is membership revocation — every RLS policy is
written against `company_members`, and policies are evaluated per statement.
Verified locally: the refresh grant is refused (`400 user_banned`) and
GoTrue's own endpoints reject the token (`403`), but PostgREST was not
exercised with a stale token against a live policy set. Worth doing on
staging.

Session rows are also left in `auth.sessions`. They grant nothing once the
ban is in place, and this GoTrue exposes no admin route to delete another
user's sessions. Noted so nobody reads them as live sessions.

### The local GoTrue is not the hosted GoTrue

Everything about Auth was verified against **GoTrue v2.197.0** as shipped by
CLI 2.122.0. Two findings depend on that version and must be re-checked on
staging because a different build could change them:

* `auth.identities.provider_id` holds the **user uuid**, not the address, so
  renaming `auth.users.email` frees the address. `rollover.ts` re-reads this
  from the database on every run and refuses to proceed if it stops being
  true — but a refusal on staging is better discovered deliberately.
* GoTrue maintains `identity_data.email` itself on an admin email change.
  The rollover relies on that and asserts it.

### PM-03 is still not deployed

The 8-role × 11-section permission matrix is in the repo and **not in
production**. Staging is where to find out what deploying it changes before
it reaches anyone's live account.

### What was not tested at all

* The React application against the local stack. Only the Auth and database
  layers were exercised; no browser session, no UI flow.
* Any Edge Function other than `before-user-created`.
* Storage, Realtime and the connection pooler — all excluded from the local
  stack.
* Anything about performance or concurrency.

---

## Do not infer compliance from any of this

None of the above is validation evidence, and Criateur is not a validated or
Part 11 compliant system. These are engineering checks on a disposable
database.
