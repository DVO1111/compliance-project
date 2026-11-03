#!/usr/bin/env bash
#
#  Account rollover, against a REAL local GoTrue.
#
#      scripts/local/up.sh
#      npx supabase@2.122.0 functions serve --env-file <local env>
#      scripts/local/test-rollover.sh
#
#  ── WHAT ONLY A REAL AUTH SERVER CAN SETTLE ───────────────────────────────
#
#  The rollover's whole claim is about `auth.users` and `auth.identities`:
#  that renaming the row frees the address, that the freed address can be
#  registered again, that the new account gets a different id, and that
#  every business record still points at the OLD id. Each of those is a
#  statement about GoTrue's own uniqueness constraints and its Admin API.
#
#  So this creates real accounts through POST /auth/v1/signup, runs the
#  real scripts/rollover/rollover.ts against the Admin API, and then
#  re-registers the freed address for real. Nothing is mocked and nothing
#  is asserted from reading the script.
#
#  LOCAL ONLY. Refuses anything but 127.0.0.1:54322, uses `.test` addresses
#  (RFC 2606), and removes everything it created.
#
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API="${LOCAL_API_URL:-http://127.0.0.1:54321}"
export PGHOST=127.0.0.1 PGPORT=54322 PGUSER=postgres PGPASSWORD=postgres PGDATABASE=postgres

[ -n "${LOCAL_ANON_KEY:-}" ]         || { echo "LOCAL_ANON_KEY is not set." >&2; exit 2; }
[ -n "${LOCAL_SERVICE_ROLE_KEY:-}" ] || { echo "LOCAL_SERVICE_ROLE_KEY is not set." >&2; exit 2; }
case "$API" in http://127.0.0.1:*|http://localhost:*) ;; *) echo "REFUSING: $API is not local." >&2; exit 1;; esac

OWNER="owner.rollover@criateur.test"       # sole approver to begin with
WORKER="worker.rollover@criateur.test"     # ordinary member, raises a deviation
NEWOWNER="newowner.rollover@criateur.test" # the replacement approver
LATECOMER="latecomer.rollover@criateur.test"
ALL=("$OWNER" "$WORKER" "$NEWOWNER" "$LATECOMER")
PASSWORD="LocalOnly-$(head -c 9 /dev/urandom | base64 | tr -dc 'A-Za-z0-9')9aA!"
#  Fixed ids in a reserved-looking range, so a leftover row from an
#  interrupted run is recognisable and the cleanup can target it exactly.
CO_ID="3b1f0000-0000-4000-8000-000000000a11"
DEV_ID="3b1f0000-0000-4000-8000-000000000d01"

total=0; passed=0; failed=0
ok()  { total=$((total+1)); passed=$((passed+1)); printf '  \033[32mPASS\033[0m  %s\n' "$1"; }
bad() { total=$((total+1)); failed=$((failed+1)); printf '  \033[31mFAIL\033[0m  %s\n' "$1"; [ -n "${2:-}" ] && printf '          %s\n' "$2"; }
head2() { printf '\n\033[1m%s\033[0m\n' "$*"; }

q()  { psql -X -At -c "$1" 2>/dev/null; }
qe() { psql -X -At -c "$1" 2>&1; }

uid()   { q "SELECT id::text FROM auth.users WHERE lower(email) = lower('$1');"; }
mailof(){ q "SELECT email FROM auth.users WHERE id = '$1';"; }

signup() {
  local out; out="$(mktemp)"
  local code; code="$(curl -sS -o "$out" -w '%{http_code}' -X POST "$API/auth/v1/signup" \
    -H "apikey: $LOCAL_ANON_KEY" -H 'Content-Type: application/json' \
    --data "$(printf '{"email":"%s","password":"%s"}' "$1" "$PASSWORD")" 2>/dev/null)"
  echo "$code"; cat "$out"; rm -f "$out"
}

#  A real password grant, so the session/refresh-token assertions are about
#  tokens GoTrue actually issued.
login() {
  curl -sS -X POST "$API/auth/v1/token?grant_type=password" \
    -H "apikey: $LOCAL_ANON_KEY" -H 'Content-Type: application/json' \
    --data "$(printf '{"email":"%s","password":"%s"}' "$1" "$PASSWORD")" 2>/dev/null
}

rollover() {
  ( cd "$ROOT" && SUPABASE_URL="$API" SUPABASE_SERVICE_ROLE_KEY="$LOCAL_SERVICE_ROLE_KEY" \
      npx --yes tsx scripts/rollover/rollover.ts "$@" 2>&1 )
}

cleanup() {
  q "DELETE FROM public.deviations WHERE id = '$DEV_ID';" >/dev/null
  q "DELETE FROM public.account_rollovers WHERE original_email IN
       ('$OWNER','$WORKER','$NEWOWNER','$LATECOMER');" >/dev/null
  for e in "${ALL[@]}"; do
    q "DELETE FROM public.company_members WHERE user_id IN
         (SELECT id FROM auth.users WHERE lower(email) = lower('$e'));" >/dev/null
    q "DELETE FROM public.allowed_signins WHERE lower(email) = lower('$e');" >/dev/null
  done
  #  Tombstoned rows no longer carry the original address, so they are found
  #  through the rollover record and then through the metadata tag.
  q "ALTER TABLE public.access_approvers DISABLE TRIGGER trg_access_approvers_keep_one;" >/dev/null
  q "DELETE FROM public.access_approvers WHERE user_id IN
       (SELECT id FROM auth.users
         WHERE email LIKE '%@criateur.test' OR email LIKE 'rolled-over+%@criateur.invalid');" >/dev/null
  q "DELETE FROM public.account_rollovers WHERE old_user_id IN
       (SELECT id FROM auth.users WHERE email LIKE 'rolled-over+%@criateur.invalid');" >/dev/null
  q "DELETE FROM public.profiles WHERE id IN
       (SELECT id FROM auth.users
         WHERE email LIKE '%@criateur.test' OR email LIKE 'rolled-over+%@criateur.invalid');" >/dev/null
  q "DELETE FROM public.company_members WHERE company_id = '$CO_ID';" >/dev/null
  q "DELETE FROM auth.identities WHERE user_id IN
       (SELECT id FROM auth.users
         WHERE email LIKE '%@criateur.test' OR email LIKE 'rolled-over+%@criateur.invalid');" >/dev/null
  q "DELETE FROM auth.sessions WHERE user_id IN
       (SELECT id FROM auth.users
         WHERE email LIKE '%@criateur.test' OR email LIKE 'rolled-over+%@criateur.invalid');" >/dev/null
  q "DELETE FROM auth.users
      WHERE email LIKE '%@criateur.test' OR email LIKE 'rolled-over+%@criateur.invalid';" >/dev/null
  q "DELETE FROM public.companies WHERE id = '$CO_ID';" >/dev/null
  q "ALTER TABLE public.access_approvers ENABLE TRIGGER trg_access_approvers_keep_one;" >/dev/null
}
trap cleanup EXIT

head2 "Fixtures: four real accounts, one company, one attributed deviation"
cleanup >/dev/null 2>&1
#  Pre-existing approvers are parked, so the approver invariant is tested
#  against a set this script fully controls rather than against whatever
#  the local database happens to hold.
PARKED="$(q "SELECT count(*) FROM public.access_approvers;")"
q "ALTER TABLE public.access_approvers DISABLE TRIGGER trg_access_approvers_keep_one;" >/dev/null
#  An ordinary table, not a temp one: every statement here is its own psql
#  connection, and a temp table would not outlive the one that made it.
q "CREATE TABLE IF NOT EXISTS public._rollover_parked_approvers AS
     SELECT * FROM public.access_approvers WHERE false;" >/dev/null
q "INSERT INTO public._rollover_parked_approvers SELECT * FROM public.access_approvers
     ON CONFLICT DO NOTHING;" >/dev/null
q "DELETE FROM public.access_approvers;" >/dev/null
q "ALTER TABLE public.access_approvers ENABLE TRIGGER trg_access_approvers_keep_one;" >/dev/null
restore_parked() {
  q "ALTER TABLE public.access_approvers DISABLE TRIGGER trg_access_approvers_keep_one;" >/dev/null
  q "INSERT INTO public.access_approvers SELECT * FROM public._rollover_parked_approvers
       ON CONFLICT (user_id) DO NOTHING;" >/dev/null
  q "DROP TABLE IF EXISTS public._rollover_parked_approvers;" >/dev/null
  q "ALTER TABLE public.access_approvers ENABLE TRIGGER trg_access_approvers_keep_one;" >/dev/null
}
trap 'restore_parked; cleanup' EXIT
echo "  parked $PARKED pre-existing approver row(s)"

for e in "${ALL[@]}"; do
  q "INSERT INTO public.allowed_signins (email, note) VALUES ('$e','local rollover test')
     ON CONFLICT (email) DO UPDATE SET is_enabled = true;" >/dev/null
done
#  Real signups through the hook, so these are accounts GoTrue made.
made=0
for e in "$OWNER" "$WORKER" "$NEWOWNER"; do
  [ "$(signup "$e" | head -1)" = "200" ] && made=$((made+1))
done
[ "$made" = "3" ] && ok "three accounts created through the real signup endpoint" \
                  || bad "only $made of 3 accounts were created — the hook or allowlist is misconfigured"

OWNER_ID="$(uid "$OWNER")"; WORKER_ID="$(uid "$WORKER")"; NEWOWNER_ID="$(uid "$NEWOWNER")"
q "INSERT INTO public.companies (id, name) VALUES ('$CO_ID','Rollover Test Co')
   ON CONFLICT (id) DO NOTHING;" >/dev/null
q "INSERT INTO public.company_members (company_id, user_id, role, status)
   VALUES ('$CO_ID','$OWNER_ID','admin','active'),
          ('$CO_ID','$WORKER_ID','qa_manager','active')
   ON CONFLICT DO NOTHING;" >/dev/null
#  deviations.raised_by is ON DELETE NO ACTION: one of the attribution
#  columns the rollover exists to preserve.
devmsg="$(qe "INSERT INTO public.deviations
   (id, company_id, deviation_number, title, severity, product_quality_impact,
    source_type, entry_point, raised_by)
   VALUES ('$DEV_ID','$CO_ID','DEV-ROLLOVER-1','Rollover attribution fixture',
           'minor','no','process','manual','$WORKER_ID');")"
[ -n "$(q "SELECT 1 FROM public.deviations WHERE id='$DEV_ID';")" ] \
  && ok "a deviation is attributed to the worker (raised_by, ON DELETE NO ACTION)" \
  || bad "could not create the attribution fixture" "$devmsg"

q "INSERT INTO public.access_approvers (user_id) VALUES ('$OWNER_ID')
   ON CONFLICT DO NOTHING;" >/dev/null
[ "$(q "SELECT count(*) FROM public.access_approvers;")" = "1" ] \
  && ok "the owner is the sole access approver" \
  || bad "approver fixture is not as expected"

# ─────────────────────────────────────────────────────────────────────────
head2 "1. Preflight reports what the script relies on"
pre="$(q "SELECT identities_total||'/'||identities_keyed_by_email||'/'||live_users||'/'||approvers
          FROM public.app_rollover_preflight();")"
echo "  identities/keyed-by-email/live-users/approvers = ${pre:-unavailable}"
keyed="$(echo "$pre" | cut -d/ -f2)"
[ "${keyed:-1}" = "0" ] \
  && ok "no identity row is keyed by email, so renaming auth.users frees the address" \
  || bad "$keyed identity row(s) keyed by email — renaming alone would NOT free the address"

head2 "2. Dry run is the default and changes nothing"
out="$(rollover --only="$WORKER")"
case "$out" in
  *"would roll over $WORKER"*) ok "the plan names the target without touching it" ;;
  *) bad "the dry run did not report the planned target" "$(echo "$out" | tail -3)" ;;
esac
[ "$(mailof "$WORKER_ID")" = "$WORKER" ] \
  && ok "the worker's address is unchanged after the dry run" \
  || bad "the dry run changed the address"
[ "$(q "SELECT count(*) FROM public.company_members WHERE user_id='$WORKER_ID';")" = "1" ] \
  && ok "the worker's membership is unchanged after the dry run" \
  || bad "the dry run revoked membership"

head2 "3. It refuses to roll over the last approver"
out="$(rollover --only="$OWNER" --apply)"
case "$out" in
  *"REFUSING TO RUN"*) ok "rolling over the only approver is refused before anything is touched" ;;
  *) bad "the sole approver was not protected" "$(echo "$out" | tail -4)" ;;
esac
[ "$(mailof "$OWNER_ID")" = "$OWNER" ] \
  && ok "the owner's address is untouched by the refused run" \
  || bad "the refused run still renamed the owner"
#  And the database refuses it independently of the script, which is the
#  guarantee that survives someone running SQL by hand.
delmsg="$(qe "DELETE FROM public.access_approvers WHERE user_id='$OWNER_ID';")"
case "$delmsg" in
  *ACCESS_APPROVERS_LAST_ONE*) ok "the database trigger refuses it too (ACCESS_APPROVERS_LAST_ONE)" ;;
  *) bad "deleting the last approver was not refused by the database" "$delmsg" ;;
esac

head2 "4. A replacement approver can be bootstrapped"
boot="$(qe "SELECT public.admin_bootstrap_approver('$NEWOWNER')::text;")"
case "$boot" in
  "$NEWOWNER_ID") ok "admin_bootstrap_approver promoted the replacement and returned its id" ;;
  *)              bad "bootstrap did not promote the replacement" "$boot" ;;
esac
[ "$(q "SELECT count(*) FROM public.access_approvers;")" = "2" ] \
  && ok "there are now two approvers, so a rollover of the first is permissible" \
  || bad "approver count is not 2"

# ─────────────────────────────────────────────────────────────────────────
head2 "5. The worker is rolled over for real"
pre_login="$(login "$WORKER")"
tok="$(echo "$pre_login" | python3 -c 'import json,sys
try: print(json.load(sys.stdin).get("access_token","") or "")
except Exception: print("")')"
rtok="$(echo "$pre_login" | python3 -c 'import json,sys
try: print(json.load(sys.stdin).get("refresh_token","") or "")
except Exception: print("")')"
[ -n "$tok" ] && [ -n "$rtok" ] \
  && ok "the worker held a real access token and refresh token before the rollover" \
  || bad "could not log the worker in, so revocation cannot be tested"

out="$(rollover --only="$WORKER" --apply)"
case "$out" in
  *"+ $WORKER -> rolled-over+"*) ok "the script reports the rename to a tombstone" ;;
  *) bad "the rollover did not report a rename" "$(echo "$out" | tail -4)" ;;
esac

newmail="$(mailof "$WORKER_ID")"
case "$newmail" in
  rolled-over+*@criateur.invalid)
    ok "auth.users now holds an undeliverable .invalid tombstone" ;;
  *) bad "the address was not replaced by a tombstone (got '$newmail')" ;;
esac
[ "$(q "SELECT count(*) FROM public.company_members WHERE user_id='$WORKER_ID';")" = "0" ] \
  && ok "membership is revoked, so every RLS policy now excludes this account" \
  || bad "membership survived the rollover"
banned="$(q "SELECT (banned_until IS NOT NULL AND banned_until > now())::text
             FROM auth.users WHERE id='$WORKER_ID';")"
[ "$banned" = "true" ] && ok "the account is banned, so the old password cannot sign in" \
                       || bad "the account is not banned (banned_until check returned '$banned')"
#  The ban is only meaningful if GoTrue enforces it, so all three ways in
#  are tried for real. Session ROWS are deliberately not asserted: this
#  GoTrue exposes no admin route to delete another user's sessions, and the
#  rows grant nothing once the ban is in place — which is what these three
#  assertions establish, rather than taking it on trust.
relogin="$(login "$WORKER")"
case "$relogin" in
  *access_token*) bad "the old address still logs in after the rollover" ;;
  *)              ok "a fresh password login with the old address fails" ;;
esac
refreshed="$(curl -sS -X POST "$API/auth/v1/token?grant_type=refresh_token" \
  -H "apikey: $LOCAL_ANON_KEY" -H 'Content-Type: application/json' \
  --data "$(printf '{"refresh_token":"%s"}' "$rtok")" 2>/dev/null)"
case "$refreshed" in
  *access_token*) bad "a refresh token issued before the rollover still mints access tokens" ;;
  *user_banned*)  ok "the pre-rollover refresh token is refused (user_banned)" ;;
  *)              ok "the pre-rollover refresh token is refused" ;;
esac
mecode="$(curl -sS -o /dev/null -w '%{http_code}' "$API/auth/v1/user" \
  -H "apikey: $LOCAL_ANON_KEY" -H "Authorization: Bearer $tok" 2>/dev/null)"
[ "$mecode" != "200" ] \
  && ok "the access token issued before the rollover is rejected by GoTrue (http $mecode)" \
  || bad "an access token issued before the rollover still identifies the user"

head2 "6. Attribution survives, which is the whole reason nothing is deleted"
[ "$(q "SELECT raised_by::text FROM public.deviations WHERE id='$DEV_ID';")" = "$WORKER_ID" ] \
  && ok "the deviation still names the original user id" \
  || bad "the deviation's raised_by changed"
[ "$(q "SELECT count(*) FROM auth.users WHERE id='$WORKER_ID';")" = "1" ] \
  && ok "the auth.users row still exists, so the foreign key still resolves" \
  || bad "the auth.users row was deleted"
rec="$(q "SELECT original_email FROM public.account_rollovers WHERE old_user_id='$WORKER_ID';")"
[ "$rec" = "$WORKER" ] \
  && ok "account_rollovers records who the account was, which the rename would otherwise lose" \
  || bad "no rollover audit record holds the old address (got '$rec')"
restrict="$(qe "DELETE FROM auth.users WHERE id='$WORKER_ID';")"
case "$restrict" in
  *violates*|*constraint*) ok "the audit record cannot be removed by deleting the user (ON DELETE RESTRICT)" ;;
  *) bad "deleting the user was not refused, so the rollover record is not protected" "$restrict" ;;
esac

head2 "7. identity_data no longer claims the freed address"
#  Step 3 of the documented order. Asserted separately because it is the
#  safeguard for a GoTrue version that keys identities by email, and a
#  safeguard that silently does nothing is worse than none.
idmail="$(q "SELECT identity_data->>'email' FROM auth.identities
             WHERE user_id='$WORKER_ID' AND provider='email';")"
if [ "$idmail" = "$newmail" ]; then
  ok "auth.identities.identity_data->>'email' was updated to the tombstone"
elif [ "$idmail" = "$WORKER" ]; then
  bad "identity_data still names the freed address '$WORKER' — step 3 did not happen"
else
  bad "identity_data holds an unexpected address" "got '$idmail'"
fi

head2 "8. The freed address can be registered again, as a NEW account"
code="$(signup "$WORKER" | head -1)"
reused_id="$(q "SELECT id::text FROM auth.users WHERE lower(email) = lower('$WORKER');")"
[ "$code" = "200" ] && ok "the freed address registers again through the ordinary signup path" \
                    || bad "the freed address could not be registered (http $code)"
if [ -n "$reused_id" ] && [ "$reused_id" != "$WORKER_ID" ]; then
  ok "the new account has a different user id, so the old attribution is unambiguous"
else
  bad "the re-registered address did not produce a distinct new account id"
fi

head2 "9. A tombstoned account cannot be promoted to approver"
tomb="$(qe "SELECT public.admin_bootstrap_approver('$newmail')::text;")"
case "$tomb" in
  *ROLLED_OVER*|*ERROR*) ok "admin_bootstrap_approver refuses a tombstoned address" ;;
  *) bad "a tombstoned account was promoted to approver" "$tomb" ;;
esac

head2 "10. Revocation is reversible"
#  The membership the rollover captured can be put back, so a rollover
#  performed in error does not have to be reconstructed from memory.
restored="$(q "SELECT public.app_rollover_restore_membership('$WORKER_ID')::text;")"
[ "${restored:-0}" -ge 1 ] \
  && ok "app_rollover_restore_membership put back $restored membership row(s)" \
  || bad "membership could not be restored (returned '$restored')"
q "DELETE FROM public.company_members WHERE user_id='$WORKER_ID';" >/dev/null

head2 "11. A later authorised user is still provisioned normally"
code="$(signup "$LATECOMER" | head -1)"
lid="$(uid "$LATECOMER")"
[ "$code" = "200" ] && [ -n "$lid" ] \
  && ok "a newly approved address registers after the rollover" \
  || bad "a later approved signup failed (http $code)"
[ "$(q "SELECT count(*) FROM public.access_approvers;")" -ge 1 ] \
  && ok "the project still has at least one approver, so it can administer itself" \
  || bad "no approvers remain — the project would be locked out"

head2 "Result"
printf '  total %d | passed %d | failed %d\n\n' "$total" "$passed" "$failed"
[ "$failed" -eq 0 ] || exit 1
