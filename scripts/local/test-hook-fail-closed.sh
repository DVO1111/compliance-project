#!/usr/bin/env bash
#
#  The hook fails CLOSED. Proven by breaking it on purpose.
#
#      scripts/local/test-hook-fail-closed.sh <env-file>
#
#  ── WHY THIS IS A SEPARATE SCRIPT ─────────────────────────────────────────
#
#  Because both cases need a deliberately broken configuration, and the only
#  honest way to test them is to actually break it: one re-serves the
#  function with no signing secret, the other revokes the allowlist function
#  from `service_role` so the RPC genuinely errors. Neither can sit beside
#  the ordinary tests, which need a working hook.
#
#  Both restore what they changed, and both assert on `auth.users` rather
#  than on the response, because the claim is "no account is created", not
#  "an error is returned".
#
#  The two cases are different failures with different correct answers:
#
#    missing secret  -> 401, learn nothing. The caller is unauthenticated,
#                       so it must not be told whether the address would
#                       have been approved.
#    broken RPC      -> 503, try later. The caller IS a genuine signup and
#                       the gate could not be evaluated, so the honest
#                       answer is that registration is unavailable — NOT
#                       "you are not approved", which would be a lie, and
#                       not success, which would be an open front door.
#
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENVFILE="${1:-}"
API="${LOCAL_API_URL:-http://127.0.0.1:54321}"
CLI="supabase@2.122.0"
export PGHOST=127.0.0.1 PGPORT=54322 PGUSER=postgres PGPASSWORD=postgres PGDATABASE=postgres

[ -f "$ENVFILE" ] || { echo "usage: $0 <env-file used for 'functions serve'>" >&2; exit 2; }
[ -n "${LOCAL_ANON_KEY:-}" ] || { echo "LOCAL_ANON_KEY is not set." >&2; exit 2; }
case "$API" in http://127.0.0.1:*|http://localhost:*) ;; *) echo "REFUSING: $API is not local." >&2; exit 1;; esac

SUBJECT="failclosed.pilot@criateur.test"
PASSWORD="LocalOnly-$(head -c 9 /dev/urandom | base64 | tr -dc 'A-Za-z0-9')9aA!"
WORK="$(mktemp -d)"

total=0; passed=0; failed=0
ok()  { total=$((total+1)); passed=$((passed+1)); printf '  \033[32mPASS\033[0m  %s\n' "$1"; }
bad() { total=$((total+1)); failed=$((failed+1)); printf '  \033[31mFAIL\033[0m  %s\n' "$1"; [ -n "${2:-}" ] && printf '          %s\n' "$2"; }
head2() { printf '\n\033[1m%s\033[0m\n' "$*"; }

q() { psql -X -At -c "$1" 2>/dev/null; }
authusers() { q "SELECT count(*) FROM auth.users WHERE lower(email) = lower('$SUBJECT');"; }

signup() {
  curl -sS -o "$WORK/body" -w '%{http_code}' -X POST "$API/auth/v1/signup" \
    -H "apikey: $LOCAL_ANON_KEY" -H 'Content-Type: application/json' \
    --data "$(printf '{"email":"%s","password":"%s"}' "$SUBJECT" "$PASSWORD")" 2>/dev/null
  echo; cat "$WORK/body" 2>/dev/null
}

#  `functions serve` holds the terminal, so it is backgrounded and waited on
#  by polling the endpoint rather than by sleeping a guessed interval.
stop_serve() {
  local pat='functions'' serve'
  for p in $(pgrep -f "$pat" 2>/dev/null); do [ "$p" != "$$" ] && kill "$p" 2>/dev/null; done
  sleep 3
}
start_serve() {
  nohup npx --yes "$CLI" functions serve --env-file "$1" >"$WORK/serve.log" 2>&1 &
  for _ in $(seq 1 40); do
    sleep 3
    [ "$(curl -sS -o /dev/null -w '%{http_code}' -X POST \
        "$API/functions/v1/before-user-created" -H 'content-type: application/json' \
        --data '{}' 2>/dev/null)" = "200" ] && return 0
  done
  return 1
}

cleanup() {
  q "UPDATE public.allowed_signins SET is_enabled = true WHERE lower(email) = lower('$SUBJECT');" >/dev/null
  q "GRANT EXECUTE ON FUNCTION public.app_signin_is_allowed(text) TO service_role;" >/dev/null
  q "DELETE FROM public.profiles WHERE lower(email) = lower('$SUBJECT');" >/dev/null
  q "DELETE FROM auth.identities WHERE user_id IN
       (SELECT id FROM auth.users WHERE lower(email) = lower('$SUBJECT'));" >/dev/null
  q "DELETE FROM auth.users WHERE lower(email) = lower('$SUBJECT');" >/dev/null
  q "DELETE FROM public.allowed_signins WHERE lower(email) = lower('$SUBJECT');" >/dev/null
}
#  $WORK is removed separately: `cleanup` also runs once up front to clear
#  any residue from an interrupted run, and deleting the work directory
#  there would take the env file and the serve log with it.
trap 'cleanup; rm -rf "$WORK"' EXIT

head2 "Fixture: an address that IS approved, so only the breakage can refuse it"
cleanup >/dev/null 2>&1
q "INSERT INTO public.allowed_signins (email, note) VALUES ('$SUBJECT', 'local fail-closed test')
   ON CONFLICT (email) DO UPDATE SET is_enabled = true;" >/dev/null
echo "  $SUBJECT is on the local allowlist and enabled"

# ── A. no signing secret ────────────────────────────────────────────────────
head2 "A. With AUTH_HOOK_SECRET unset, the hook refuses everything"
grep -v '^AUTH_HOOK_SECRET=' "$ENVFILE" > "$WORK/nosecret.env"
stop_serve
if ! start_serve "$WORK/nosecret.env"; then
  bad "could not serve the function without a secret" "$(tail -3 "$WORK/serve.log")"
else
  resp="$(signup)"; code="$(echo "$resp" | head -1)"; body="$(echo "$resp" | tail -n +2)"
  users="$(authusers)"
  #  An APPROVED address, refused purely because the gate cannot
  #  authenticate its caller. An unconfigured secret must never mean
  #  "accept anything".
  [ "$code" != "200" ] && ok "an approved address is refused when the secret is missing (http $code)" \
                       || bad "signup SUCCEEDED with no hook secret — the gate is open" "$body"
  [ "${users:-1}" = "0" ] && ok "no auth user was created" \
                          || bad "$users auth user(s) created despite the refusal"
  case "$body" in
    *"not approved"*|*"criateur.com"*)
      bad "the refusal told an unauthenticated caller about the allowlist" "$body" ;;
    *) ok "the refusal does not mention the allowlist" ;;
  esac
fi

# ── B. the allowlist RPC cannot be evaluated ────────────────────────────────
head2 "B. With the allowlist RPC unavailable, signup is refused as unavailable"
stop_serve
if ! start_serve "$ENVFILE"; then
  bad "could not restore the working hook" "$(tail -3 "$WORK/serve.log")"
else
  ok "the working hook is back (a signed request is served again)"
  #  Revoked from service_role only — the role the function authenticates
  #  as. The function itself is untouched, and the grant is restored on
  #  exit whatever happens.
  q "REVOKE EXECUTE ON FUNCTION public.app_signin_is_allowed(text) FROM service_role;" >/dev/null
  q "REVOKE EXECUTE ON FUNCTION public.app_signin_is_allowed(text) FROM PUBLIC;" >/dev/null
  granted="$(q "SELECT has_function_privilege('service_role',
                 'public.app_signin_is_allowed(text)', 'EXECUTE')::text;")"
  if [ "$granted" = "false" ]; then
    ok "service_role can no longer execute the allowlist function"
    resp="$(signup)"; code="$(echo "$resp" | head -1)"; body="$(echo "$resp" | tail -n +2)"
    users="$(authusers)"
    [ "$code" != "200" ] && ok "an approved address is refused when the gate errors (http $code)" \
                         || bad "signup SUCCEEDED while the gate was broken — fails OPEN" "$body"
    [ "${users:-1}" = "0" ] && ok "no auth user was created" \
                            || bad "$users auth user(s) created while the gate was broken"
    case "$body" in
      *"temporarily unavailable"*)
        ok "the message says registration is unavailable, not that the address is unapproved" ;;
      *"not approved"*)
        bad "a broken gate was reported to the user as 'not approved', which is untrue" "$body" ;;
      *) bad "unexpected refusal message" "$body" ;;
    esac
  else
    bad "could not revoke EXECUTE from service_role, so this case was not exercised"
  fi
  q "GRANT EXECUTE ON FUNCTION public.app_signin_is_allowed(text) TO service_role;" >/dev/null

  #  And the same address registers once the gate works again, so the two
  #  refusals above were caused by the breakage and nothing else.
  resp="$(signup)"; code="$(echo "$resp" | head -1)"; users="$(authusers)"
  if [ "$code" = "200" ] && [ "${users:-0}" = "1" ]; then
    ok "with the grant restored, the same approved address registers normally"
  else
    bad "the address did not register after the grant was restored (http $code, $users user(s))"
  fi
fi

head2 "Result"
printf '  total %d | passed %d | failed %d\n\n' "$total" "$passed" "$failed"
[ "$failed" -eq 0 ] || exit 1
