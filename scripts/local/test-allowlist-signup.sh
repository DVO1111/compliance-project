#!/usr/bin/env bash
#
#  Allowlisted signup, against a REAL local GoTrue.
#
#      scripts/local/up.sh
#      npx supabase@2.122.0 functions serve --env-file <local env>
#      scripts/local/test-allowlist-signup.sh
#
#  ── WHY THIS EXISTS WHEN THERE ARE ALREADY UNIT TESTS ─────────────────────
#
#  Because the thing being tested is whether `auth.users` ends up with a row
#  in it, and no unit test can answer that. The claim the hook makes is not
#  "the function returns 403" — it is "the signup transaction is aborted, so
#  no account exists". The only way to know is to ask the Auth server to
#  create one and then look in the table.
#
#  So every case here drives the real POST /auth/v1/signup endpoint and then
#  counts rows in auth.users. A case that only checked the HTTP response
#  would pass just as happily against a hook that denied the request after
#  the user was written.
#
#  LOCAL ONLY. Refuses to run against anything but 127.0.0.1:54322, uses
#  `.test` addresses throughout (RFC 2606), and deletes everything it made.
#
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API="${LOCAL_API_URL:-http://127.0.0.1:54321}"
export PGHOST=127.0.0.1 PGPORT=54322 PGUSER=postgres PGPASSWORD=postgres PGDATABASE=postgres

[ -n "${LOCAL_ANON_KEY:-}" ] || { echo "LOCAL_ANON_KEY is not set." >&2; exit 2; }
[ -n "${AUTH_HOOK_SECRET:-}" ] || { echo "AUTH_HOOK_SECRET is not set." >&2; exit 2; }

case "$API" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) echo "REFUSING: $API is not a local API." >&2; exit 1;;
esac

#  Fixed, obviously-synthetic addresses on a reserved TLD. The approved one
#  is added to the LOCAL allowlist only; nothing here touches the real one.
APPROVED="approved.pilot@criateur.test"
MIXEDCASE="  Approved.Pilot@Criateur.TEST  "
STRANGER="stranger@criateur.test"
DISABLED="disabled.pilot@criateur.test"
#  Section 8 needs an address that has NEVER registered: $APPROVED has by
#  then, so GoTrue answers 422 "already registered" and the refusal under
#  test is indistinguishable from a duplicate.
CLOSED="closed.probe@criateur.test"
PASSWORD="LocalOnly-$(head -c 9 /dev/urandom | base64 | tr -dc 'A-Za-z0-9')9aA!"

total=0; passed=0; failed=0
ok()   { total=$((total+1)); passed=$((passed+1)); printf '  \033[32mPASS\033[0m  %s\n' "$1"; }
bad()  { total=$((total+1)); failed=$((failed+1)); printf '  \033[31mFAIL\033[0m  %s\n' "$1"; [ -n "${2:-}" ] && printf '          %s\n' "$2"; }
head2() { printf '\n\033[1m%s\033[0m\n' "$*"; }

q() { psql -X -At -c "$1" 2>/dev/null; }

#  How many auth users hold this address, asked of auth.users directly
#  rather than of any endpoint that might answer from a cache.
authusers() { q "SELECT count(*) FROM auth.users WHERE lower(email) = lower('$1');"; }
profiles()  { q "SELECT count(*) FROM public.profiles WHERE lower(email) = lower('$1');"; }

#  POST /auth/v1/signup. Prints "<http status><newline><body>".
signup() {
  curl -sS -o /tmp/.su.$$ -w '%{http_code}' \
    -X POST "$API/auth/v1/signup" \
    -H "apikey: $LOCAL_ANON_KEY" -H 'Content-Type: application/json' \
    --data "$(printf '{"email":%s,"password":"%s"}' "$(printf '%s' "$1" | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read()))')" "$PASSWORD")" \
    2>/dev/null
  echo
  cat /tmp/.su.$$ 2>/dev/null; rm -f /tmp/.su.$$
}

#  A Standard Webhooks request to the hook, signed exactly the way GoTrue
#  signs one. `--ts` and `--secret` are overridable so the replay and
#  wrong-key cases are the same code path with one input changed.
hook_post() {
  local body="$1" ts="${2:-$(date +%s)}" secret="${3:-$AUTH_HOOK_SECRET}" id="msg_$RANDOM$RANDOM"
  local sig
  sig="$(SW_SECRET="$secret" python3 -I - "$id" "$ts" "$body" <<'PY'
import base64, hashlib, hmac, os, sys
msg_id, ts, body = sys.argv[1], sys.argv[2], sys.argv[3]
secret = os.environ["SW_SECRET"]
b64 = secret.split(",", 1)[1] if "," in secret else secret
b64 = b64.removeprefix("whsec_")
#  Pad to a multiple of four rather than appending a fixed "===", which
#  produces a length Python refuses outright — and a silently empty
#  signature, which reads as a rejected request rather than a broken test.
key = base64.b64decode(b64 + "=" * (-len(b64) % 4))
mac = hmac.new(key, f"{msg_id}.{ts}.{body}".encode(), hashlib.sha256).digest()
print("v1," + base64.b64encode(mac).decode())
PY
)"
  curl -sS -X POST "$API/functions/v1/before-user-created" \
    -H 'Content-Type: application/json' \
    -H "webhook-id: $id" -H "webhook-timestamp: $ts" -H "webhook-signature: $sig" \
    --data "$body" 2>/dev/null
}

cleanup() {
  for e in "$APPROVED" "$STRANGER" "$DISABLED" "$CLOSED"; do
    q "DELETE FROM public.profiles WHERE lower(email) = lower('$e');" >/dev/null
    q "DELETE FROM auth.identities WHERE user_id IN
         (SELECT id FROM auth.users WHERE lower(email) = lower('$e'));" >/dev/null
    q "DELETE FROM auth.users WHERE lower(email) = lower('$e');" >/dev/null
    q "DELETE FROM public.allowed_signins WHERE lower(email) = lower('$e');" >/dev/null
  done
}
trap cleanup EXIT

head2 "Preparing local fixtures"
cleanup
#  The allowlist treats an EMPTY table as open — a deliberate bootstrap
#  affordance. It is not empty here (the local database carries the owner
#  row), but assert it rather than assume it, because every refusal below
#  would otherwise be vacuous.
openrows="$(q "SELECT count(*) FROM public.allowed_signins WHERE is_enabled;")"
if [ "${openrows:-0}" -ge 1 ]; then
  ok "allowlist is populated ($openrows enabled), so the gate is closed by default"
else
  bad "allowlist has no enabled rows — an empty allowlist is open, so these tests would be vacuous"
fi

q "INSERT INTO public.allowed_signins (email, note) VALUES
     ('$APPROVED', 'local integration test'),
     ('$DISABLED', 'local integration test')
   ON CONFLICT (email) DO UPDATE SET is_enabled = true, disabled_at = NULL, disabled_by = NULL;" >/dev/null
q "UPDATE public.allowed_signins SET is_enabled = false, disabled_at = now()
    WHERE lower(email) = lower('$DISABLED');" >/dev/null
echo "  fixtures: 1 enabled, 1 disabled, 1 absent"

# ─────────────────────────────────────────────────────────────────────────
head2 "1. The hook is actually reachable and refuses an unsigned caller"
#  Asserted first, because every later refusal would also "pass" against a
#  hook that was simply unreachable — GoTrue would refuse the signup and the
#  row count would be zero for the wrong reason.
unsigned="$(curl -sS -X POST "$API/functions/v1/before-user-created" \
             -H 'Content-Type: application/json' --data '{"user":{"email":"x@criateur.test"}}' 2>/dev/null)"
case "$unsigned" in
  *'"http_code":401'*) ok "unsigned POST is refused 401 Unauthorized" ;;
  '')                  bad "unsigned POST got no response — the hook is not being served" ;;
  *)                   bad "unsigned POST was not refused 401" "$unsigned" ;;
esac
case "$unsigned" in
  *"not approved"*|*"criateur.com"*)
    bad "the 401 body leaks the allowlist refusal message to an unsigned caller" ;;
  *) ok "the unsigned refusal reveals nothing about any address" ;;
esac

head2 "2. A signed request with the WRONG key is refused"
wrong="$(hook_post '{"user":{"email":"'"$APPROVED"'"}}' "$(date +%s)" \
          "v1,whsec_$(head -c 32 /dev/urandom | base64)")"
case "$wrong" in
  *'"http_code":401'*) ok "a signature made with another secret is refused 401" ;;
  *)                   bad "a wrong-key signature was not refused 401" "$wrong" ;;
esac

head2 "3. A valid signature with a STALE timestamp is refused (replay window)"
stale="$(hook_post '{"user":{"email":"'"$APPROVED"'"}}' "$(( $(date +%s) - 600 ))")"
case "$stale" in
  *'"http_code":401'*) ok "a correctly signed request 10 minutes old is refused 401" ;;
  *)                   bad "a stale signed request was accepted" "$stale" ;;
esac
fresh="$(hook_post '{"user":{"email":"'"$APPROVED"'"}}')"
case "$fresh" in
  '{}') ok "the same request signed with a current timestamp is allowed" ;;
  *)    bad "a correctly signed approved address was not allowed" "$fresh" ;;
esac

head2 "4. Normalisation matches the database's"
norm="$(hook_post "$(printf '{"user":{"email":%s}}' \
         "$(printf '%s' "$MIXEDCASE" | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read()))')")")"
case "$norm" in
  '{}') ok "'  Approved.Pilot@Criateur.TEST  ' is allowed, as the trimmed lowered form is" ;;
  *)    bad "the hook and the database disagree about normalisation" "$norm" ;;
esac

# ─────────────────────────────────────────────────────────────────────────
#  From here on the assertions are about auth.users, not about the hook.
# ─────────────────────────────────────────────────────────────────────────
head2 "5. An approved address can register, and the account really exists"
before="$(authusers "$APPROVED")"
resp="$(signup "$APPROVED")"
code="$(echo "$resp" | head -1)"; body="$(echo "$resp" | tail -n +2)"
after="$(authusers "$APPROVED")"
if [ "$code" = "200" ] && [ "${before:-0}" = "0" ] && [ "${after:-0}" = "1" ]; then
  ok "signup returned 200 and auth.users went 0 -> 1"
else
  bad "approved signup did not create exactly one auth user (http $code, $before -> $after)" "$body"
fi

head2 "6. A NON-ALLOWLISTED address is refused, and leaves no account behind"
resp="$(signup "$STRANGER")"
code="$(echo "$resp" | head -1)"; body="$(echo "$resp" | tail -n +2)"
users="$(authusers "$STRANGER")"; profs="$(profiles "$STRANGER")"
[ "$code" != "200" ] && ok "signup was refused (http $code)" \
                     || bad "an unapproved signup returned 200" "$body"
case "$body" in
  *"not approved"*) ok "the refusal carries the hook's own message through GoTrue" ;;
  *)                bad "the refusal did not carry the allowlist message" "$body" ;;
esac
#  THE POINT OF THE WHOLE EXERCISE. The old database-only gate let the row
#  be written and then refused the profile; the hook runs inside the signup
#  transaction, so there must be nothing at all.
[ "${users:-1}" = "0" ] && ok "auth.users holds NO row for the refused address" \
                        || bad "a refused signup still created $users auth user(s)"
[ "${profs:-1}" = "0" ] && ok "public.profiles holds no row for the refused address" \
                        || bad "a refused signup still created $profs profile(s)"

head2 "7. A DISABLED allowlist entry is refused the same way"
resp="$(signup "$DISABLED")"
code="$(echo "$resp" | head -1)"; body="$(echo "$resp" | tail -n +2)"
users="$(authusers "$DISABLED")"
[ "$code" != "200" ] && ok "a disabled address is refused (http $code)" \
                     || bad "a disabled address was allowed to register" "$body"
[ "${users:-1}" = "0" ] && ok "a disabled address leaves no auth user" \
                        || bad "a disabled address created $users auth user(s)"
#  Re-enabling must restore access, or `is_enabled` is a one-way door and
#  the admin UI is lying about what the toggle does.
q "UPDATE public.allowed_signins SET is_enabled = true, disabled_at = NULL
    WHERE lower(email) = lower('$DISABLED');" >/dev/null
resp="$(signup "$DISABLED")"
code="$(echo "$resp" | head -1)"
users="$(authusers "$DISABLED")"
if [ "$code" = "200" ] && [ "${users:-0}" = "1" ]; then
  ok "re-enabling the same entry lets that address register"
else
  bad "re-enabling did not restore access (http $code, $users user(s))"
fi

head2 "8. CLOSED BY DEFAULT — an empty allowlist denies, against real GoTrue"
#  This is the case 20261214000000 changed, and the only way to know the
#  product is actually shut is to empty the list and ask the real Auth
#  server to create an account.
#
#  The whole table is parked and restored, because every later assertion
#  depends on it and an empty allowlist would deny them all.
q "CREATE TABLE IF NOT EXISTS public._parked_allowlist AS SELECT * FROM public.allowed_signins WHERE false;" >/dev/null
q "DELETE FROM public._parked_allowlist;" >/dev/null
q "INSERT INTO public._parked_allowlist SELECT * FROM public.allowed_signins;" >/dev/null
parked_n="$(q "SELECT count(*) FROM public._parked_allowlist;")"
q "DELETE FROM public.allowed_signins;" >/dev/null
echo "  allowlist emptied (${parked_n} row(s) parked)"

resp="$(signup "$CLOSED")"
code="$(echo "$resp" | head -1)"; body="$(echo "$resp" | tail -n +2)"
users="$(authusers "$CLOSED")"
[ "$code" != "200" ] && ok "with an EMPTY allowlist, signup is refused (http $code)" \
                     || bad "an empty allowlist let a signup through — the product is open" "$body"
[ "${users:-1}" = "0" ] && ok "and no auth user was created" \
                        || bad "$users auth user(s) created against an empty allowlist"
[ "$(q "SELECT public.app_signin_is_allowed('$CLOSED')::text;")" = "false" ] \
  && ok "the database gate agrees: an empty list denies" \
  || bad "app_signin_is_allowed returned true for an empty list"

#  All-disabled is a different state from empty and must give the same
#  answer, so there is nothing in between that opens the product.
q "INSERT INTO public.allowed_signins (email, note, is_enabled, disabled_at)
   VALUES ('$CLOSED', 'emptied-list test', false, now());" >/dev/null
resp="$(signup "$CLOSED")"
code="$(echo "$resp" | head -1)"
[ "$code" != "200" ] && ok "a list holding only DISABLED rows also refuses (http $code)" \
                     || bad "an all-disabled allowlist let a signup through"
[ "$(authusers "$CLOSED")" = "0" ] && ok "and still no auth user" \
                                     || bad "an all-disabled list created an auth user"

#  And the deliberate switch is the only thing that opens it — tested
#  because a tightened gate that cannot be opened on purpose would be a
#  different bug.
q "DELETE FROM public.allowed_signins;" >/dev/null
q "UPDATE public.signin_policy SET public_signup_enabled = true,
     reason = 'local integration test', enabled_at = now() WHERE id;" >/dev/null
resp="$(signup "$CLOSED")"
code="$(echo "$resp" | head -1)"
users="$(authusers "$CLOSED")"
if [ "$code" = "200" ] && [ "${users:-0}" = "1" ]; then
  ok "with public signup deliberately ON, an unlisted address can register"
else
  bad "the deliberate switch did not open signup (http $code, $users user(s))"
fi
q "UPDATE public.signin_policy SET public_signup_enabled = false,
     reason = NULL, enabled_at = NULL, enabled_by = NULL WHERE id;" >/dev/null
#  Clean up the account that switch allowed, then restore the real list.
q "DELETE FROM public.profiles WHERE lower(email) = lower('$CLOSED');" >/dev/null
q "DELETE FROM auth.identities WHERE user_id IN
     (SELECT id FROM auth.users WHERE lower(email) = lower('$CLOSED'));" >/dev/null
q "DELETE FROM auth.users WHERE lower(email) = lower('$CLOSED');" >/dev/null
q "DELETE FROM public.allowed_signins;" >/dev/null
q "INSERT INTO public.allowed_signins SELECT * FROM public._parked_allowlist;" >/dev/null
q "DROP TABLE IF EXISTS public._parked_allowlist;" >/dev/null
restored="$(q "SELECT count(*) FROM public.allowed_signins;")"
[ "${restored:-0}" = "${parked_n:-0}" ] \
  && ok "the real allowlist is restored (${restored} row(s))" \
  || bad "the allowlist was not restored (${restored} vs ${parked_n})"
#  The fixtures the earlier sections rely on went with the parking.
q "INSERT INTO public.allowed_signins (email, note) VALUES
     ('$APPROVED', 'local integration test'), ('$DISABLED', 'local integration test')
   ON CONFLICT (email) DO UPDATE SET is_enabled = true, disabled_at = NULL, disabled_by = NULL;" >/dev/null

head2 "9. The database gate is still there underneath"
#  Defence in depth, as the function's own header claims: the hook is
#  configuration and can be switched off, so `provision_profile` must still
#  refuse an address that is not approved.
guard="$(q "SELECT public.app_signin_is_allowed('$STRANGER')::text;")"
[ "$guard" = "false" ] \
  && ok "app_signin_is_allowed() — the one rule both gates call — refuses the stranger" \
  || bad "app_signin_is_allowed() returned '$guard' for an unapproved address"
#  THE HOOK GUARDS THE PUBLIC SIGNUP PATH, AND ONLY THAT.
#
#  Measured rather than assumed: POST /auth/v1/admin/users with a
#  service-role key creates an account for an address that is NOT on the
#  allowlist, because an Auth hook does not run on an admin create. So the
#  question the brief asks — can an existing user bypass the database-side
#  provisioning checks — has to be answered about the DATABASE gate, which
#  is the half that travels with the schema and cannot be switched off in a
#  dashboard. This is the defence-in-depth claim the function's header
#  makes, tested instead of trusted.
if [ -n "${LOCAL_SERVICE_ROLE_KEY:-}" ]; then
  admin_id="$(curl -sS -X POST "$API/auth/v1/admin/users" \
    -H "apikey: $LOCAL_SERVICE_ROLE_KEY" -H "Authorization: Bearer $LOCAL_SERVICE_ROLE_KEY" \
    -H 'Content-Type: application/json' \
    --data "$(printf '{"email":"%s","password":"%s","email_confirm":true}' "$STRANGER" "$PASSWORD")" \
    2>/dev/null | python3 -c 'import json,sys
try: print(json.load(sys.stdin).get("id","") or "")
except Exception: print("")')"
  if [ -n "$admin_id" ]; then
    ok "the Admin API does create a non-allowlisted account (so the hook is not the only gate that matters)"
    #  That account now exists. What must still be impossible is it
    #  becoming a member of anything, which is what every RLS policy in
    #  this schema is written against.
    #  The whole output, not its last line: PL/pgSQL prints the RAISE and
    #  then a CONTEXT line, and matching only the tail reads the context
    #  as the result and calls a refusal an acceptance.
    prov="$(psql -X -At -c "
      SELECT set_config('request.jwt.claims',
        json_build_object('sub','$admin_id','role','authenticated')::text, true);
      SELECT public.provision_profile('$STRANGER', 'Stranger', 'Nowhere Ltd')::text;" 2>&1)"
    if printf '%s' "$prov" | grep -q '^ERROR:'; then
      ok "provision_profile refuses it: $(printf '%s' "$prov" | grep -m1 '^ERROR:' | cut -c1-96)"
    else
      bad "provision_profile accepted a non-allowlisted address" "$(printf '%s' "$prov" | head -c 200)"
    fi
    [ "$(q "SELECT count(*) FROM public.company_members WHERE user_id='$admin_id';")" = "0" ] \
      && ok "and it holds no company membership" \
      || bad "the admin-created account gained a membership"
  else
    bad "could not create an account through the Admin API, so this case was not exercised"
  fi
fi

rls="$(q "SELECT relrowsecurity::text FROM pg_class WHERE oid = 'public.allowed_signins'::regclass;")"
pol="$(q "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='allowed_signins';")"
if [ "$rls" = "true" ] && [ "${pol:-1}" = "0" ]; then
  ok "allowed_signins has RLS on and no policy, so it cannot be enumerated from a browser"
else
  bad "allowed_signins is enumerable (rls=$rls, policies=$pol)"
fi

head2 "Result"
printf '  total %d | passed %d | failed %d\n\n' "$total" "$passed" "$failed"
[ "$failed" -eq 0 ] || exit 1
