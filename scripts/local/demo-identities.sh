#!/usr/bin/env bash
#
#  The demo story's eleven actors, as REAL local accounts.
#
#      scripts/local/demo-identities.sh            create them
#      scripts/local/demo-identities.sh --remove   take them away again
#
#  ── WHY THIS IS A SCRIPT AND NOT PART OF THE SEED ─────────────────────────
#
#  Because accounts are not data. `company_members.user_id` has a foreign
#  key to `auth.users`, so the seed cannot carry memberships without the
#  accounts existing first — and the ids cannot be known at build time,
#  because GoTrue assigns them. The source's eleven user uuids are
#  therefore TRANSLATED to the ids the local Auth server hands out, and the
#  translation is written to a file the rest of the pipeline reads.
#
#  Nothing here is a claim about a real person. The addresses are the
#  source's own `.example` ones (RFC 2606, undeliverable), the accounts
#  exist only in a disposable container, and docs/seed/DEMO_IDENTITIES.md
#  says what a demonstration with real participants would have to do
#  instead.
#
#  ── THE ALLOWLIST IS NOT TOUCHED ──────────────────────────────────────────
#
#  Deliberately. These are fictional actors and the allowlist is the list of
#  people permitted to register against the real product. The accounts are
#  created through the Auth Admin API, which — measured, not assumed —
#  BYPASSES the before-user-created hook:
#
#      POST /admin/users with a non-allowlisted address -> 200, user created
#
#  That is worth knowing for its own sake and is asserted in
#  test-allowlist-signup.sh: the hook guards the PUBLIC signup path, and
#  what stops a service-role-created account becoming a member of anything
#  is the database-side `provision_profile` guard. Defence in depth, now
#  measured rather than claimed.
#
#  LOCAL ONLY. Refuses anything but the loopback stack.
#
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API="${LOCAL_API_URL:-http://127.0.0.1:54321}"
SEED="${SEED_JSON:-}"
OUT="${DEMO_IDENTITIES:-$ROOT/.demo-identities.json}"
export PGHOST=127.0.0.1 PGPORT=54322 PGUSER=postgres PGPASSWORD=postgres PGDATABASE=postgres

REMOVE=0
for a in "$@"; do [ "$a" = "--remove" ] && REMOVE=1; done

case "$API" in http://127.0.0.1:*|http://localhost:*) ;;
  *) echo "REFUSING: $API is not a local API." >&2; exit 1;; esac
[ -n "${LOCAL_SERVICE_ROLE_KEY:-}" ] || { echo "LOCAL_SERVICE_ROLE_KEY is not set." >&2; exit 2; }

q() { psql -X -At -c "$1" 2>/dev/null; }

#  A single shared password for eleven throwaway accounts in a container.
#  Generated per run, printed NOWHERE, and written only to the identities
#  file, which is git-ignored.
PASSWORD="${DEMO_PASSWORD:-DemoLocal-$(head -c 12 /dev/urandom | base64 | tr -dc 'A-Za-z0-9')7xZ!}"

# ── removal ───────────────────────────────────────────────────────────────
if [ "$REMOVE" = "1" ]; then
  if [ ! -f "$OUT" ]; then echo "No $OUT — nothing to remove."; exit 0; fi
  gone=0; kept=0
  while read -r uid email; do
    [ -z "$uid" ] && continue
    q "DELETE FROM public.company_members WHERE user_id = '$uid';" >/dev/null
    q "DELETE FROM public.material_qa_authorities WHERE user_id = '$uid';" >/dev/null
    q "DELETE FROM public.profiles WHERE id = '$uid';" >/dev/null
    q "DELETE FROM auth.identities WHERE user_id = '$uid';" >/dev/null
    q "DELETE FROM auth.sessions WHERE user_id = '$uid';" >/dev/null
    #  NOT swallowed. An account that approved something is referenced by
    #  master_formulas.approved_by with ON DELETE NO ACTION, so the
    #  database REFUSES to delete it — which is the same protection that
    #  made deletion the wrong tool for the production reset. An earlier
    #  version of this script sent the error to /dev/null and reported
    #  eleven removals when one account was still there, and the next run
    #  then failed to sign in as it because the password had moved on.
    err="$(psql -X -At -c "DELETE FROM auth.users WHERE id = '$uid';" 2>&1 >/dev/null)"
    if [ -z "$err" ]; then
      gone=$((gone + 1))
    else
      kept=$((kept + 1))
      printf '  kept  %s\n' "$email"
      printf '        %s\n' "$(printf '%s' "$err" | head -1)"
    fi
  done < <(python3 -I -c "
import json, sys
d = json.load(open('$OUT'))
for a in d['actors']: print(a['local_id'], a['email'])")

  if [ "$kept" -gt 0 ]; then
    echo
    echo "Removed $gone; $kept could NOT be removed because a record attributes"
    echo "something to them. Reset the seed first — 30_demo_reset.sql drops the"
    echo "formulas that name them — and then run --remove again. $OUT is kept"
    echo "so the remaining accounts can still be found."
    exit 1
  fi
  rm -f "$OUT"
  echo "Removed $gone demo account(s) and $OUT."
  exit 0
fi

# ── creation ──────────────────────────────────────────────────────────────
[ -n "$SEED" ] || { echo "SEED_JSON must point at the generator's seed.json." >&2; exit 2; }
[ -f "$SEED" ] || { echo "No seed.json at $SEED." >&2; exit 2; }

#  The companies must exist: company_members references them. This is the
#  seed's job, so it has to have run.
cos="$(q "SELECT count(*) FROM public.companies;")"
if [ "${cos:-0}" = "0" ]; then
  echo "REFUSING: no companies in the database." >&2
  echo "Load 10_demo_adapted.sql first — memberships have nowhere to point." >&2
  exit 1
fi

printf '\n\033[1mProvisioning the demo story'"'"'s actors\033[0m\n'

tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
python3 -I -c "
import json
d = json.load(open('$SEED'))
for u in d['users']:
    print('\t'.join([u['id'], u['email'], u['full_name'], u['role_key'], u['company_id'], u.get('job_title','')]))
" > "$tmp/users.tsv"

made=0; skipped=0
: > "$tmp/map.tsv"
while IFS=$'\t' read -r src_id email full_name role_key company_id job_title; do
  [ -z "$email" ] && continue
  #  Only ever `.example`. A real address here would mean a real person's
  #  account being created, which is the one thing this must not do.
  case "$email" in
    *.example) ;;
    *) echo "  REFUSING $email — not a .example address" >&2; exit 1;;
  esac

  existing="$(q "SELECT id FROM auth.users WHERE lower(email) = lower('$email');")"
  if [ -n "$existing" ]; then
    local_id="$existing"; skipped=$((skipped + 1))
    #  The password is regenerated every run, so an account that survived
    #  a previous one still has the OLD one and the identities file would
    #  be a lie. Re-set it, or the next step cannot sign in as them —
    #  which is exactly how this was found.
    curl -sS -o /dev/null -X PUT "$API/auth/v1/admin/users/$local_id" \
      -H "apikey: $LOCAL_SERVICE_ROLE_KEY" -H "Authorization: Bearer $LOCAL_SERVICE_ROLE_KEY" \
      -H 'Content-Type: application/json' \
      --data "$(python3 -I -c "
import json, sys; print(json.dumps({'password': sys.argv[1]}))" "$PASSWORD")" 2>/dev/null
  else
    local_id="$(curl -sS -X POST "$API/auth/v1/admin/users" \
      -H "apikey: $LOCAL_SERVICE_ROLE_KEY" -H "Authorization: Bearer $LOCAL_SERVICE_ROLE_KEY" \
      -H 'Content-Type: application/json' \
      --data "$(python3 -I -c "
import json, sys
print(json.dumps({'email': sys.argv[1], 'password': sys.argv[2], 'email_confirm': True,
                  'user_metadata': {'full_name': sys.argv[3], 'demo_actor': True}}))
" "$email" "$PASSWORD" "$full_name")" 2>/dev/null \
      | python3 -I -c "
import json, sys
try: print(json.load(sys.stdin).get('id','') or '')
except Exception: print('')")"
    [ -n "$local_id" ] || { echo "  x could not create $email" >&2; exit 1; }
    made=$((made + 1))
  fi

  #  The PLATFORM role is not the operational role. profiles.role is the
  #  coarse one the lifecycle engine reads (admin / compliance_officer /
  #  content_creator); the story's role_key is the operational one and
  #  lives on company_members. A QA manager therefore gets
  #  compliance_officer here and qa_manager there — two different
  #  questions with two different answers.
  case "$role_key" in
    qa_manager) prole='compliance_officer' ;;
    *)          prole='content_creator' ;;
  esac
  q "INSERT INTO public.profiles (id, email, full_name, role)
     VALUES ('$local_id', '$email', \$\$$full_name\$\$, '$prole')
     ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;" >/dev/null
  q "INSERT INTO public.company_members (company_id, user_id, role, status, job_title)
     VALUES ('$company_id', '$local_id', '$role_key', 'active', \$\$$job_title\$\$)
     ON CONFLICT (company_id, user_id) DO UPDATE SET role = EXCLUDED.role;" >/dev/null

  printf '%s\t%s\t%s\t%s\t%s\n' "$src_id" "$local_id" "$email" "$role_key" "$company_id" >> "$tmp/map.tsv"
done < "$tmp/users.tsv"

python3 -I -c "
import json, sys
actors = []
for line in open('$tmp/map.tsv'):
    s, l, e, r, c = line.rstrip('\n').split('\t')
    actors.append({'source_id': s, 'local_id': l, 'email': e, 'role_key': r, 'company_id': c})
json.dump({'password': '$PASSWORD', 'actors': actors}, open('$OUT', 'w'), indent=2)
print(f'  {len(actors)} actor(s) mapped')"
chmod 600 "$OUT"

echo "  created $made, already present $skipped"
echo "  memberships: $(q "SELECT count(*) FROM public.company_members cm JOIN public.profiles p ON p.id = cm.user_id WHERE p.email LIKE '%.example';")"
echo "  translation written to $OUT (git-ignored, mode 600; the shared"
echo "  password is in it and is not printed anywhere)"
