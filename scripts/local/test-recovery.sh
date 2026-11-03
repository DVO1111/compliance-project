#!/usr/bin/env bash
#
#  Branded password recovery, against a REAL local GoTrue and a real
#  mail catcher.
#
#      scripts/local/up.sh
#      npx supabase@2.122.0 functions serve --env-file <local env>
#      scripts/local/test-recovery.sh
#
#  ── WHAT THIS PROVES, AND WHAT IT DOES NOT ────────────────────────────────
#
#  It proves that GoTrue renders supabase/templates/recovery.html, that the
#  rendered message carries Criateur's own subject and branding, that the
#  one-time link in it is Supabase's own and still works, and that a
#  password actually changes through it.
#
#  IT PROVES NOTHING ABOUT EMAIL DELIVERY. The message is handed to a
#  catcher running beside the stack. Whether Hostinger's SMTP accepts the
#  same message, whether it authenticates, and whether SPF, DKIM and DMARC
#  pass for criateur.com are separate facts that only a real send to a real
#  mailbox can settle. See docs/ALLOWLIST_AND_RECOVERY.md; the hosted
#  checklist in docs/STAGING_CHECKLIST.md lists them as outstanding.
#
#  ── WHY THE CATCHER AND NOT A LOCAL SMTP SERVER ───────────────────────────
#
#  Because the CLI does not wire [auth.email.smtp] into a local stack at
#  all — custom SMTP is a hosted-project setting. With [inbucket] enabled
#  GoTrue is pointed at the catcher; with it disabled GoTrue is given no
#  GOTRUE_SMTP_HOST at all, so nothing is sent anywhere. Measured, after an
#  attempt to redirect it at scripts/local/smtp-sink.py failed silently.
#
#  LOCAL ONLY. `.test` address, removed afterwards.
#
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API="${LOCAL_API_URL:-http://127.0.0.1:54321}"
CATCHER="${LOCAL_MAIL_URL:-http://127.0.0.1:54324}"
export PGHOST=127.0.0.1 PGPORT=54322 PGUSER=postgres PGPASSWORD=postgres PGDATABASE=postgres

[ -n "${LOCAL_ANON_KEY:-}" ] || { echo "LOCAL_ANON_KEY is not set." >&2; exit 2; }
case "$API" in http://127.0.0.1:*|http://localhost:*) ;; *) echo "REFUSING: $API is not local." >&2; exit 1;; esac

SUBJECT_ADDR="recovery.pilot@criateur.test"
OLD_PASSWORD="LocalOnly-Old9aA!"
NEW_PASSWORD="LocalOnly-New7bB!"
WORK="$(mktemp -d)"

total=0; passed=0; failed=0
ok()  { total=$((total+1)); passed=$((passed+1)); printf '  \033[32mPASS\033[0m  %s\n' "$1"; }
bad() { total=$((total+1)); failed=$((failed+1)); printf '  \033[31mFAIL\033[0m  %s\n' "$1"; [ -n "${2:-}" ] && printf '          %s\n' "$2"; }
head2() { printf '\n\033[1m%s\033[0m\n' "$*"; }
q() { psql -X -At -c "$1" 2>/dev/null; }

cleanup() {
  q "DELETE FROM public.profiles WHERE lower(email) = lower('$SUBJECT_ADDR');" >/dev/null
  q "DELETE FROM auth.identities WHERE user_id IN
       (SELECT id FROM auth.users WHERE lower(email) = lower('$SUBJECT_ADDR'));" >/dev/null
  q "DELETE FROM auth.sessions WHERE user_id IN
       (SELECT id FROM auth.users WHERE lower(email) = lower('$SUBJECT_ADDR'));" >/dev/null
  q "DELETE FROM auth.users WHERE lower(email) = lower('$SUBJECT_ADDR');" >/dev/null
  q "DELETE FROM public.allowed_signins WHERE lower(email) = lower('$SUBJECT_ADDR');" >/dev/null
}
#  $WORK is removed separately: `cleanup` also runs once up front to clear
#  residue from an interrupted run, and deleting the work directory there
#  would take the captured message with it.
trap 'cleanup; rm -rf "$WORK"' EXIT

head2 "The mail catcher is the one GoTrue is pointed at"
#  Asserted first: if GoTrue is delivering somewhere else, an empty mailbox
#  would be read as "no email was sent" when the truth is "we looked in the
#  wrong place".
smtp_host="$(docker exec supabase_auth_project sh -c 'printf "%s:%s" "$GOTRUE_SMTP_HOST" "$GOTRUE_SMTP_PORT"' 2>/dev/null)"
echo "  GoTrue delivers to : ${smtp_host:-unknown}"
info="$(curl -sS "$CATCHER/api/v1/info" 2>/dev/null)"
case "$smtp_host" in
  supabase_inbucket_project:1025|supabase_mailpit_project:1025)
    ok "GoTrue's SMTP target is the CLI's catcher, which is what this reads" ;;
  "") bad "could not read GoTrue's SMTP configuration" ;;
  *)  bad "GoTrue delivers to '$smtp_host', which is not the catcher being read" ;;
esac
[ -n "$info" ] && ok "the catcher's API answers" || bad "the catcher's API did not answer at $CATCHER"

head2 "Fixture: a real approved account with a known password"
cleanup >/dev/null 2>&1
q "INSERT INTO public.allowed_signins (email, note) VALUES ('$SUBJECT_ADDR','local recovery test')
   ON CONFLICT (email) DO UPDATE SET is_enabled = true;" >/dev/null
code="$(curl -sS -o "$WORK/su" -w '%{http_code}' -X POST "$API/auth/v1/signup" \
  -H "apikey: $LOCAL_ANON_KEY" -H 'Content-Type: application/json' \
  --data "$(printf '{"email":"%s","password":"%s"}' "$SUBJECT_ADDR" "$OLD_PASSWORD")" 2>/dev/null)"
[ "$code" = "200" ] && ok "the account was created through the real signup endpoint" \
                    || bad "could not create the fixture account (http $code)" "$(head -c 200 "$WORK/su")"

#  Empty the mailbox, so the message read below is unambiguously this one.
curl -sS -X DELETE "$CATCHER/api/v1/messages" >/dev/null 2>&1
before="$(curl -sS "$CATCHER/api/v1/messages?limit=1" 2>/dev/null | python3 -c 'import json,sys;print(json.load(sys.stdin).get("messages_count",0))' 2>/dev/null)"
echo "  mailbox emptied (${before:-0} message(s))"

head2 "1. Requesting a reset actually sends a message"
rc="$(curl -sS -o "$WORK/rec" -w '%{http_code}' -X POST "$API/auth/v1/recover" \
  -H "apikey: $LOCAL_ANON_KEY" -H 'Content-Type: application/json' \
  --data "$(printf '{"email":"%s"}' "$SUBJECT_ADDR")" 2>/dev/null)"
[ "$rc" = "200" ] && ok "POST /auth/v1/recover returned 200" \
                  || bad "recover returned http $rc" "$(head -c 200 "$WORK/rec")"

MSG_ID=""
for _ in $(seq 1 20); do
  sleep 1
  MSG_ID="$(curl -sS "$CATCHER/api/v1/messages?limit=5" 2>/dev/null | python3 -c '
import json,sys
try: d = json.load(sys.stdin)
except Exception: sys.exit()
for m in d.get("messages", []):
    print(m.get("ID","")); break' 2>/dev/null)"
  [ -n "$MSG_ID" ] && break
done
[ -n "$MSG_ID" ] && ok "a message arrived at the catcher" \
                 || bad "no message arrived within 20s"

if [ -z "$MSG_ID" ]; then
  head2 "Result"; printf '  total %d | passed %d | failed %d\n\n' "$total" "$passed" "$failed"; exit 1
fi

curl -sS "$CATCHER/api/v1/message/$MSG_ID" >"$WORK/msg.json" 2>/dev/null
python3 - "$WORK/msg.json" "$WORK" <<'PY'
import json, sys
d = json.load(open(sys.argv[1])); out = sys.argv[2]
open(f"{out}/subject", "w").write(d.get("Subject", "") or "")
open(f"{out}/html", "w").write(d.get("HTML", "") or "")
open(f"{out}/text", "w").write(d.get("Text", "") or "")
frm = d.get("From") or {}
open(f"{out}/from", "w").write(f"{frm.get('Name','')} <{frm.get('Address','')}>")
to = (d.get("To") or [{}])[0]
open(f"{out}/to", "w").write(to.get("Address", "") or "")
PY

head2 "2. It is addressed and titled as Criateur's own"
[ "$(cat "$WORK/to")" = "$SUBJECT_ADDR" ] \
  && ok "addressed to the requesting account" \
  || bad "addressed to '$(cat "$WORK/to")'"
subj="$(cat "$WORK/subject")"
echo "  subject: $subj"
[ "$subj" = "Reset your Criateur password" ] \
  && ok "the subject is the configured Criateur one, not Supabase's default" \
  || bad "unexpected subject" "$subj"
case "$subj" in
  *"Reset Your Password"*) bad "the subject is still Supabase's stock wording" ;;
  *) ok "the subject is not Supabase's stock 'Reset Your Password'" ;;
esac

head2 "3. The template was rendered, not sent raw"
html="$WORK/html"
[ -s "$html" ] && ok "the message has an HTML part" || bad "no HTML part"
#  An unsubstituted action or variable is the failure mode that looks fine
#  in the template file and arrives broken.
if grep -qE '\{\{|\}\}' "$html"; then
  bad "the HTML still contains Go template delimiters, so it was not rendered" \
      "$(grep -oE '\{\{[^}]*\}\}' "$html" | head -3 | tr '\n' ' ')"
else
  ok "no unsubstituted {{ ... }} remains"
fi
for marker in 'Criateur' '#0d1933' '#3e7a41'; do
  grep -qF "$marker" "$html" \
    && ok "the rendered HTML carries the brand marker '$marker'" \
    || bad "the rendered HTML is missing '$marker'"
done
#  Proof it is OUR file and not a default that happens to say Criateur:
#  a distinctive string from the committed template must survive rendering.
pick="$(python3 - "$ROOT/supabase/templates/recovery.html" <<'PY'
import re, sys
s = open(sys.argv[1]).read()
s = re.sub(r'<!--.*?-->', '', s, flags=re.S)
#  The longest run of plain prose in the template, which no stock
#  Supabase template could contain by chance.
cands = [t.strip() for t in re.findall(r'>([^<>{}]{25,120})<', s)]
print(max(cands, key=len) if cands else '')
PY
)"
if [ -n "$pick" ] && grep -qF "$pick" "$html"; then
  ok "a distinctive sentence from the committed template is present in the sent mail"
else
  bad "could not match the committed template's own wording in the sent mail" "looked for: ${pick:0:70}"
fi

head2 "4. The link is Supabase's own one-time recovery link"
LINK="$(python3 - "$html" <<'PY'
import html as H, re, sys
s = H.unescape(open(sys.argv[1]).read())
m = [u for u in re.findall(r'https?://[^\s"\'<>]+', s) if 'token=' in u and 'verify' in u]
print(m[0] if m else '')
PY
)"
[ -n "$LINK" ] && ok "the mail contains a /auth/v1/verify link carrying a token" \
              || bad "no recovery link with a token was found in the mail"
case "$LINK" in
  *"type=recovery"*) ok "the link declares type=recovery" ;;
  *)                 bad "the link does not declare type=recovery" "$LINK" ;;
esac
#  The template's own header says the token must never be written into a
#  mailto or an analytics parameter, where it could be logged or forwarded.
TOKEN="$(printf '%s' "$LINK" | sed -n 's/.*[?&]token=\([^&]*\).*/\1/p')"
if [ -n "$TOKEN" ]; then
  leaks="$(grep -oF "$TOKEN" "$html" | wc -l | tr -d ' ')"
  [ "${leaks:-0}" -le 2 ] \
    && ok "the token appears only in the action link ($leaks occurrence(s))" \
    || bad "the token appears $leaks times — it is being written somewhere else as well"
  grep -qiE "mailto:[^\"'<>]*$TOKEN" "$html" \
    && bad "the token is embedded in a mailto: link" \
    || ok "the token is not embedded in a mailto: link"
fi

head2 "5. The reset actually works, end to end"
#  The point of keeping Supabase's own token flow: verifying the OTP must
#  yield a session, and that session must be able to set a new password.
#  FOLLOWED, not reconstructed. The `token=` in the emailed URL is a token
#  HASH, not the raw OTP, so POSTing it to /verify as `token` is refused
#  ("Verify requires either a token or a token hash", then otp_expired).
#  Fetching the link is also what a recipient actually does: GoTrue answers
#  303 and puts the session in the redirect's URL fragment.
headers="$(curl -sS -i -o /dev/null -D - "$LINK" 2>/dev/null)"
AT="$(printf '%s' "$headers" | python3 -c '
import re, sys, urllib.parse as up
loc = ""
for line in sys.stdin:
    if line.lower().startswith("location:"):
        loc = line.split(":", 1)[1].strip()
#  The tokens come back in the fragment, which is where a browser would
#  hand them to the app, not in the query string.
frag = loc.split("#", 1)[1] if "#" in loc else ""
print(up.parse_qs(frag).get("access_token", [""])[0])')"
if [ -n "$AT" ]; then
  ok "following the emailed link yields a real session"
else
  bad "following the emailed link did not yield a session" \
      "$(printf '%s' "$headers" | grep -i '^location:' | head -c 200)"
fi

if [ -n "$AT" ]; then
  upd="$(curl -sS -o "$WORK/upd" -w '%{http_code}' -X PUT "$API/auth/v1/user" \
    -H "apikey: $LOCAL_ANON_KEY" -H "Authorization: Bearer $AT" \
    -H 'Content-Type: application/json' \
    --data "$(printf '{"password":"%s"}' "$NEW_PASSWORD")" 2>/dev/null)"
  [ "$upd" = "200" ] && ok "that session sets a new password" \
                     || bad "setting the password failed (http $upd)" "$(head -c 200 "$WORK/upd")"

  newlogin="$(curl -sS -X POST "$API/auth/v1/token?grant_type=password" \
    -H "apikey: $LOCAL_ANON_KEY" -H 'Content-Type: application/json' \
    --data "$(printf '{"email":"%s","password":"%s"}' "$SUBJECT_ADDR" "$NEW_PASSWORD")" 2>/dev/null)"
  case "$newlogin" in
    *access_token*) ok "the account logs in with the NEW password" ;;
    *)              bad "the new password does not work" "$(printf '%s' "$newlogin" | head -c 160)" ;;
  esac
  oldlogin="$(curl -sS -X POST "$API/auth/v1/token?grant_type=password" \
    -H "apikey: $LOCAL_ANON_KEY" -H 'Content-Type: application/json' \
    --data "$(printf '{"email":"%s","password":"%s"}' "$SUBJECT_ADDR" "$OLD_PASSWORD")" 2>/dev/null)"
  case "$oldlogin" in
    *access_token*) bad "the OLD password still works after the reset" ;;
    *)              ok "the old password no longer works" ;;
  esac
  #  A recovery link is single-use; if it were not, a forwarded email would
  #  stay live. Followed the same way, so the comparison is like for like.
  again="$(curl -sS -i -o /dev/null -D - "$LINK" 2>/dev/null \
    | python3 -c '
import sys, urllib.parse as up
loc = ""
for line in sys.stdin:
    if line.lower().startswith("location:"):
        loc = line.split(":", 1)[1].strip()
frag = loc.split("#", 1)[1] if "#" in loc else ""
tok = up.parse_qs(frag).get("access_token", [""])[0]
#  A spent link redirects with an error in the fragment or query instead.
print("REUSED" if tok else "REFUSED:" + loc[-90:])')"
  case "$again" in
    REUSED) bad "the same recovery link worked a second time" ;;
    *)      ok "the recovery link cannot be reused (${again#REFUSED:})" ;;
  esac
fi

head2 "6. What this run did NOT establish"
cat <<'NOTE'
  The message above was accepted by the CLI's local mail catcher, which
  accepts everything. This run says nothing about:
    * whether Hostinger's SMTP accepts and relays the same message,
    * whether SMTP authentication against it succeeds,
    * whether SPF, DKIM and DMARC pass for the sending domain,
    * whether it lands in an inbox rather than a spam folder.
  Those need a real send to a real mailbox, from the hosted project, and
  are listed as outstanding in docs/STAGING_CHECKLIST.md.
NOTE

head2 "Result"
printf '  total %d | passed %d | failed %d\n\n' "$total" "$passed" "$failed"
[ "$failed" -eq 0 ] || exit 1
