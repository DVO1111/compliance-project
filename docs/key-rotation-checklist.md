# Key rotation checklist

**Nothing in this checklist has been performed.** No key has been
rotated, no production setting changed, no secret touched. This is the
dependency map and the procedure, written so that rotation can be done
deliberately rather than discovered halfway through.

Rotation is an operational action, separate from the code change on
this branch. It needs its own window and its own approval.

Last reviewed: 2026-10-23.

---

## 1. What is actually exposed

Three files at `HEAD` contain a Supabase JWT literal. Every one of
them is an **anon** key — `"role": "anon"` in the payload. **No
`service_role` key appears anywhere in the repository**, at `HEAD` or
in the history searched.

| File | Project ref in the token | What it is |
|---|---|---|
| `scripts/check_db_state.mjs` | `ovxfflilbqaxedzovgmz` | the live project's anon key |
| `scripts/test-calendar-sync.mjs` | `ovxfflilbqaxedzovgmz` | the live project's anon key |
| `supabase/functions/publish-dispatch/index.ts` | none; `iss: supabase-demo` | the standard **local** demo key, not a secret |
| `scripts/repair_audit_chain.mjs` | `ovxfflilbqaxedzovgmz` | the live project's anon key — in history; the file is withdrawn on this branch |

### How bad this is, stated plainly

An anon key is **designed to be public**. It is shipped to every
browser that loads the application and it is not a credential in the
sense a password is. Its leak does not grant access that a visitor to
the site does not already have.

What it does do:

- identifies the project to anyone who finds it;
- grants whatever RLS lets the `anon` role do — which is the real
  question, and is about the policies, not the key;
- removes any benefit of the key being unguessable, which some setups
  lean on more than they should.

So this is **housekeeping, not an incident** — unless the RLS review
in §5 finds that `anon` can read something it should not, in which
case the policies are the emergency and the key is a footnote.

The environment hygiene around it is sound: `.gitignore` covers
`.env`, `.env.local` and `.env.*.local`; the only committed env file
is `.env.staging.example`; every edge function reads
`SUPABASE_SERVICE_ROLE_KEY` from `Deno.env`, none hard-codes it.

---

## 2. The dependency that decides the whole procedure

**Verify this first, before anything else.** Supabase has two key
schemes and they rotate completely differently:

| Scheme | Rotating the anon/publishable key |
|---|---|
| **Legacy JWT keys** (`anon` + `service_role`, both signed by the project's JWT secret) | rotating the JWT secret **invalidates both at once**. Every `service_role` holder breaks at the same moment as every anon holder. |
| **New API keys** (publishable + secret keys) | they rotate **independently**, and a secret key can be rolled with an overlap window. |

If this project is on the legacy scheme — which its token format
suggests, but which has not been confirmed — then rotating the anon
key is **not** a small action. It is a rotation of everything.

**Check in the Supabase dashboard under Settings → API before
planning the window.** This could not be checked from this session:
the Supabase MCP server has dropped out (`ERR_PROXY_TUNNEL`).

---

## 3. Everything that holds a key today

Identified before rotating, because the failure mode is a service that
nobody remembered going dark an hour later.

### Anon / publishable key

| Holder | How it is supplied | Breaks on rotation |
|---|---|---|
| The web application | `VITE_SUPABASE_ANON_KEY`, baked in **at build time** | yes — needs a **rebuild and redeploy**, not just a setting change |
| GitHub Actions `ci.yml` | `secrets.VITE_SUPABASE_ANON_KEY` | yes — update the repository secret |
| `.github/workflows/pages.yml` | repository secret | yes |
| `scripts/check_db_state.mjs` | hard-coded | yes |
| `scripts/test-calendar-sync.mjs` | hard-coded | yes |
| Any developer's local `.env` | local file | yes, each one |
| `supabase/functions/publish-dispatch/index.ts` | hard-coded **demo** key | no — local only |

The build-time point is the one that catches people: the anon key is
compiled into the bundle. Rotating it without redeploying leaves every
user on the old key until the next deploy.

### Service-role key — **only if §2 says both rotate together**

| Holder | How it is supplied | Breaks |
|---|---|---|
| **23 edge functions** | `SUPABASE_SERVICE_ROLE_KEY`, auto-injected by the Supabase runtime | normally no — the platform supplies the current value — **but verify**, because a function that caches it at module load keeps the old one until redeployed |
| Any function given the key as a custom secret | function secrets | yes — update, then redeploy that function |

### Other credentials in the same blast radius

These are **not** rotated by a key rotation and must not be confused
with it, but they live in the same settings and are worth auditing in
the same window:

| Secret | Where | Note |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | `db-migrate.yml` repository secret | personal access token; separate lifecycle |
| `SUPABASE_DB_PASSWORD` | `db-migrate.yml` repository secret | the database password; rotating it breaks the migration workflow |
| `SUPABASE_DB_HOST`, `SUPABASE_PROJECT_REF` | repository secrets | not secrets in any real sense |
| `SMTP_PASSWORD` | edge function secret | **must never appear in source, a patch, or a committed env file**. It does not today. |

---

## 4. The procedure

Do not start until §2 is answered and §3 is confirmed complete for
this project as it stands today, not as this document found it.

1. **Confirm the key scheme** (§2). The answer changes everything
   below.
2. **Inventory holders again**, live. Re-run the searches in §3
   against the current tree; new call sites appear.
3. **Announce a window.** On the legacy scheme the application is
   down for users on the old bundle between rotation and redeploy.
4. **Rotate** in the Supabase dashboard.
5. **Update the repository secrets** — `VITE_SUPABASE_ANON_KEY` in
   `ci.yml` and `pages.yml`.
6. **Rebuild and redeploy the application.** The key is compiled in.
7. **Redeploy the edge functions** if §2 says the service-role key
   moved, or if any function caches it at module load.
8. **Verify**: sign in; load a page that reads data; run one edge
   function that writes; check the functions' logs for 401s.
9. **Update every developer's local `.env`.**
10. **Remove the hard-coded keys from the two scripts**, replacing
    them with `process.env` reads. Do this as a code change on a
    branch, not during the window.

### Rollback

There is none for step 4. A rotated key cannot be un-rotated; the
remedy for a botched rotation is to finish it. That is the reason for
the inventory.

---

## 5. What matters more than the rotation

**Audit what the `anon` role can actually do.** The key being public
is only a problem in proportion to what it unlocks, and that is a
policy question:

```sql
-- Every policy that admits anon, which is the real exposure.
SELECT c.relname AS table_name, p.polname, p.polcmd,
       pg_get_expr(p.polqual, p.polrelid) AS using_expr
  FROM pg_policy p
  JOIN pg_class c ON c.oid = p.polrelid
 WHERE 'anon' = ANY (SELECT rolname FROM pg_roles WHERE oid = ANY (p.polroles))
 ORDER BY 1, 2;

-- And any table where anon holds a direct grant.
SELECT table_name, privilege_type
  FROM information_schema.role_table_grants
 WHERE grantee = 'anon' AND table_schema = 'public'
 ORDER BY 1, 2;
```

Both are read-only and safe to run against production. Run them
**before** scheduling a rotation: if they come back empty or confined
to genuinely public tables, the exposed anon key is housekeeping and
the window can be scheduled at leisure. If they do not, the finding is
the policies and it is more urgent than the key.

---

## 6. Status

| Item | State |
|---|---|
| Keys rotated | **No.** Nothing has been rotated. |
| Production settings changed | **No.** |
| Hard-coded anon keys removed from the two scripts | **No** — listed as step 10, a separate code change |
| `scripts/repair_audit_chain.mjs` | withdrawn on this branch; its key remains in git history |
| Key scheme confirmed (§2) | **No** — needs the Supabase dashboard |
| `anon` policy audit (§5) | **Not run** — needs the live project |
| `service_role` key in the repository | **None found**, at `HEAD` or in history |
