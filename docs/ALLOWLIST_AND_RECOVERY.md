# Allowlisted registration, and branded password recovery

Two things that are mostly already built, and the parts of each that only a
dashboard can finish. Read the "still required" sections before calling
either one done.

---

# 1. Allowlisted registration

## What was already there

`20261017000000_signin_allowlist.sql` built `public.allowed_signins` and put
the gate on `provision_profile`. That migration's own header is honest about
what it could not do:

> It does not stop someone creating an auth user: sign-up is Supabase's own
> endpoint and is governed in the dashboard, not here. It stops that user
> becoming a member of anything.

That was the right control to build first. Without a profile there is no
company, no membership, and every RLS policy in this schema is written
against company membership — so such a session reads nothing. But it leaves a
real residue: an unapproved address could still create an `auth.users` row
and receive a Criateur-branded verification email.

## What was added

**`supabase/functions/before-user-created/index.ts`** — a Supabase *Before
User Created* hook. It runs inside the signup transaction, so a refusal
means **no `auth.users` row is ever written**.

It calls the same `app_signin_is_allowed` the database guard calls, so there
is one rule and not two that can drift. It:

* verifies the Standard Webhooks signature **before** consulting the
  allowlist, so the endpoint cannot be used to probe the list one address at
  a time;
* rejects requests older than five minutes;
* **fails closed** — an unset `AUTH_HOOK_SECRET`, or an error from the
  allowlist check, refuses the signup. A refused signup is visible and
  recoverable; an unnoticed opening is neither, because its symptom is
  accounts being created successfully;
* allows only on an explicit `true`;
* logs refusals **without the address**.

**`20261212000000_allowlist_enabled_state.sql`** adds:

* `is_enabled`, `disabled_at`, `disabled_by`, with a CHECK that the pair
  agrees — "disabled but nobody knows when" is not a record;
* an administrator surface: `admin_allowlist_list`, `admin_allowlist_add`,
  `admin_allowlist_set_enabled`, each `SECURITY DEFINER` and each
  re-checking the caller against `access_approvers` **inside the function**,
  so the check holds however the function is reached;
* no new notion of administrator — it reuses the approver set the
  access-request flow already has.

The table keeps RLS enabled **with no policy at all**. Even an approver
reading it directly sees nothing; the functions are the only way in. The
list of who has early access to a compliance product is a list of a
factory's quality staff, and it must not be enumerable.

### Both gates stay

| | Stops | Lives in |
|---|---|---|
| Before User Created hook | the account being created | dashboard configuration |
| `provision_profile` guard | an existing account becoming a member | the schema |

The hook can be switched off in a dashboard; the guard travels with the
database. `allowlist_enabled_state_test.sql` section F asserts both.

### "Empty means open" — and why "all disabled" must not

`app_signin_is_allowed` returns true for everyone when the table is
**empty**. That is deliberate and dates from the original migration: ending
the pilot is a data change, not a code change.

A table of **disabled** rows is not empty and does **not** open the product.
If it did, disabling the last pilot user would publish the application to
the entire internet — and the operator doing it would believe they had just
locked it down. Section C of the SQL suite exists for exactly that.

## What removing someone actually does

This is the question Task 2 asks to be documented, and the answer is less
than most people expect.

Disabling an address:

* **stops them creating an account** — the hook refuses;
* **stops them provisioning a profile** — the database guard refuses;
* **does not sign them out.** Supabase access tokens are self-contained
  JWTs, verified by signature and never looked up in the database, so a
  session already issued keeps working until it expires — **one hour** by
  default on this project;
* **does not revoke their refresh token**, so it keeps minting new access
  tokens until it is revoked;
* **does not remove their data access**, because RLS is written against
  company membership, not against the allowlist.

**Disabling is a gate on getting in, not a revocation.** To actually remove
someone:

1. `admin_allowlist_set_enabled(<email>, false)` — stops re-entry.
2. Delete their `company_members` row(s) — this is what actually ends data
   access, immediately, because every RLS policy reads membership.
3. Revoke their sessions: `auth.admin.signOut(userId, 'global')`, or delete
   the user outright.

Step 2 is the one that matters within the hour. An operator who does only
step 1 has a false sense of having acted.

## Still required — dashboard only

1. **Deploy the function:**
   ```
   npx supabase functions deploy before-user-created --project-ref ovxfflilbqaxedzovgmz
   ```
2. **Authentication → Hooks → Before User Created**: enable, point it at
   `https://ovxfflilbqaxedzovgmz.supabase.co/functions/v1/before-user-created`,
   and copy the generated signing secret.
3. **Set the secret** (the value is shown once; it is not in this repo):
   ```
   npx supabase secrets set AUTH_HOOK_SECRET=v1,whsec_... --project-ref ovxfflilbqaxedzovgmz
   ```
4. **Apply** `20261212000000_allowlist_enabled_state.sql` to the project.
5. Verify with one unapproved address — signup must be refused **and**
   `auth.users` must not grow.

Until steps 1–3 are done the hook is not in force, and the
`provision_profile` guard is the only gate. That is the state the project is
in today.

**Keep the base64 padding on the secret.** A secret whose `=` padding has
been stripped passes the CLI's validator and the hook's own `atob`, and then
GoTrue cannot sign with it — every signup fails with a 500 reading
`illegal base64 data at input byte 40`, which looks nothing like a malformed
secret. Found while setting the hook up locally.

## Verified locally against a real GoTrue

`scripts/local/up.sh` brings up a disposable stack and two suites exercise
the gate against it — 26 assertions, all passing:

* `scripts/local/test-allowlist-signup.sh` (17) drives the real
  `POST /auth/v1/signup` and then **counts rows in `auth.users`**. The
  central one: a refused signup leaves no Auth user and no profile. It also
  covers the unsigned caller, a wrong-key signature, the five-minute replay
  window, normalisation, a disabled entry, re-enabling, and that the table
  is still unenumerable.
* `scripts/local/test-hook-fail-closed.sh` (9) breaks the hook deliberately
  — served with no secret, and with `EXECUTE` revoked from `service_role` so
  the allowlist RPC genuinely errors. Both refuse an **approved** address and
  create no account.

This does not replace step 5 above. The hook is per-project configuration,
so the production project still has to be checked once it is enabled there.

---

# 2. Branded password recovery

## What was already there, and is unchanged

`src/lib/auth/passwordReset.ts`, `ResetPasswordPage.tsx` and the
`PASSWORD_RECOVERY` handling in `AuthContext`. Supabase generates and
verifies the recovery token; the app exchanges it and calls
`supabase.auth.updateUser`. `isAccountEnumerationError` keeps "Forgot
password?" from becoming an account enumerator.

**None of that was replaced.** Task 3 is about who sends the email and what
it looks like, not about how the token works. There is no homemade token
system here and there must not be.

## What was added

`supabase/templates/recovery.html` — a branded, responsive template in the
design system's own colours (ink `#0d1933`, accent `#3e7a41`, paper
`#fbf9f5`). Table layout and inline styles, because Outlook and Gmail strip
`<style>` blocks and `<link>` tags.

It uses `{{ .ConfirmationURL }}` and nothing else token-shaped. The raw
`{{ .Token }}` never appears — in a link, an image URL or an analytics
parameter it would be a live credential somewhere it can be logged or
forwarded. A test asserts its absence.

The link appears twice: as a button and as selectable text, because some
clients mangle the button and a recipient who cannot click should not have
to request a second email.

`supabase/config.toml` now declares `[auth.email.template.recovery]`.

## The provider

The repository already has **two** mail integrations. Neither needed adding:

| | Used by | Credentials |
|---|---|---|
| **Hostinger SMTP** | `request-info` (lead capture) | `SMTP_HOST=smtp.hostinger.com`, `SMTP_PORT=465`, `SMTP_USERNAME=partnerships@criateur.com`, `SMTP_PASSWORD` |
| **Resend** | `notify` | `RESEND_API_KEY`, `RESEND_FROM` (currently the `onboarding@resend.dev` test sender) |

**Use Hostinger.** It is already sending from `criateur.com`, which is the
branded domain, and those credentials are proven in production by
`request-info`. Resend is still on its default test sender, which would put
`resend.dev` in the From line of a password-reset email — the one message
where a recipient is most likely to be checking.

### Settings to enter — Authentication → Emails → SMTP

| Field | Value |
|---|---|
| Host | `smtp.hostinger.com` |
| Port | `465` |
| Username | the Criateur mailbox, e.g. `no-reply@criateur.com` |
| Password | that mailbox's password — **secret only** |
| Sender email | the same address |
| Sender name | `Criateur` |

Port 465 (implicit TLS) is what the existing integration uses. Note the
constraint that forced it there applies to *Edge Functions*, which cannot
open 25 or 587; Supabase Auth's own sender is not subject to it, so 587
would also work. 465 is recommended only because it is the configuration
already proven against this mailbox.

**`SMTP_PASSWORD` must never appear in the patch, in source, in frontend
code or in a committed `.env`.** It is not in this repository and must not
be added to it.

### Then the template

Supabase's hosted project does **not** read `supabase/config.toml`. Paste
the contents of `supabase/templates/recovery.html` into **Authentication →
Emails → Reset Password**, with subject **"Reset your Criateur password"**.

### And the redirect

`passwordResetRedirectTo` returns `<origin>/?recovery=1`. That exact URL
must be on **Authentication → URL Configuration → Redirect URLs**, or the
link refuses to open. This is the one part of the flow that cannot be fixed
from the codebase.

## Still required — dashboard only

1. Create or choose the sending mailbox on `criateur.com`.
2. Enter the SMTP settings above.
3. Paste the recovery template and subject.
4. Add `https://<production-origin>/?recovery=1` to the redirect allow-list.
5. **Send one real reset to a mailbox you control** and confirm: it arrives
   from `criateur.com`, renders branded in at least one desktop and one
   mobile client, the button opens the app's reset screen, the new password
   is accepted, and the link fails cleanly when used a second time.

## Verified locally — and what that does and does not cover

`scripts/local/test-recovery.sh` passes 23 assertions against a real local
GoTrue and the CLI's own mail catcher. It establishes that GoTrue renders
`supabase/templates/recovery.html`, that the sent message carries Criateur's
subject and brand colours with no unsubstituted `{{ ... }}`, that a
distinctive sentence from the committed template is present in what was
actually sent, that the link is Supabase's own one-time recovery link with
the token nowhere but the action URL, and that **following it changes the
password**: the new one works, the old one stops working, and the link
cannot be reused a second time.

So steps 3 and most of step 5's *behaviour* are now evidenced. What is still
entirely unproven is **delivery**, because the catcher accepts everything:

* whether Hostinger's SMTP accepts and relays the message,
* whether SMTP authentication against it succeeds,
* whether SPF, DKIM and DMARC pass for `criateur.com`,
* whether it reaches an inbox rather than a spam folder,
* whether the HTML survives Gmail and Outlook, which strip `<style>` and
  rewrite tables.

**Step 5 therefore still stands**, narrowed to what only a real send can
answer: one reset to a mailbox on a domain you do not control, confirmed
arriving in the inbox and rendering in a desktop and a mobile client. Until
that has happened the recovery flow is implemented and locally verified, but
**not** verified to be deliverable. `docs/STAGING_CHECKLIST.md` carries the
same list.
