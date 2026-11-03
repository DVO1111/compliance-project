#!/usr/bin/env bash
#
#  Approve the demo master formulas THROUGH THE APPLICATION.
#
#      scripts/local/demo-approve-formulas.sh
#
#  ── WHY NOT SEED THE APPROVAL ─────────────────────────────────────────────
#
#  Because `master_formulas.approved_by` and `approved_at` are the record of
#  a person having approved something. The source supplies both, and writing
#  them in would state that a named QA manager approved a formula when
#  nobody did — fabricated attribution, and indistinguishable from the real
#  thing once it is in the table.
#
#  So the approval is PERFORMED, by a real local account, through
#  `master_formula_approve` — the application's own approval API. It sets
#  approved_by from `auth.uid()` and approved_at from `now()`, so the row
#  then says what actually happened: this demo account approved it, just
#  now, in a disposable container.
#
#  The function is not a formality. It refuses unless the caller is a member
#  of the owning company AND a designated QA authority, and unless the
#  formula has a bill of materials, at least one stage, an ACTIVE
#  ingredient, and a stage sequence running 1..n with no gaps. All of those
#  are checked here by doing it rather than by reading the source.
#
#  ── ONE FORMULA CANNOT BE APPROVED, AND THAT IS CORRECT ───────────────────
#
#  The orange-drink formula declares no active ingredient — its materials
#  are packaging and raw ingredients, because it is a beverage. The
#  application requires one (MASTER_FORMULA_NO_ACTIVE). Relabelling a
#  sugar syrup as the "active" would be inventing a formulation fact to get
#  past a correct rule, so it is left unapproved and the refusal is
#  asserted below as the expected outcome.
#
#  LOCAL ONLY.
#
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API="${LOCAL_API_URL:-http://127.0.0.1:54321}"
IDS="${DEMO_IDENTITIES:-$ROOT/.demo-identities.json}"
export PGHOST=127.0.0.1 PGPORT=54322 PGUSER=postgres PGPASSWORD=postgres PGDATABASE=postgres

case "$API" in http://127.0.0.1:*|http://localhost:*) ;;
  *) echo "REFUSING: $API is not a local API." >&2; exit 1;; esac
[ -n "${LOCAL_ANON_KEY:-}" ] || { echo "LOCAL_ANON_KEY is not set." >&2; exit 2; }
[ -f "$IDS" ] || { echo "No $IDS — run scripts/local/demo-identities.sh first." >&2; exit 2; }

total=0; passed=0; failed=0
ok()  { total=$((total+1)); passed=$((passed+1)); printf '  \033[32mPASS\033[0m  %s\n' "$1"; }
bad() { total=$((total+1)); failed=$((failed+1)); printf '  \033[31mFAIL\033[0m  %s\n' "$1"; [ -n "${2:-}" ] && printf '          %s\n' "$2"; }
head2() { printf '\n\033[1m%s\033[0m\n' "$*"; }
q() { psql -X -At -c "$1" 2>/dev/null; }

#  Sign in for real: the RPC reads auth.uid(), so a database connection
#  cannot stand in for a session.
login_as() {
  curl -sS -X POST "$API/auth/v1/token?grant_type=password" \
    -H "apikey: $LOCAL_ANON_KEY" -H 'Content-Type: application/json' \
    --data "$(python3 -I -c "
import json,sys; print(json.dumps({'email': sys.argv[1], 'password': sys.argv[2]}))" "$1" "$2")" \
    2>/dev/null | python3 -I -c "
import json,sys
try: print(json.load(sys.stdin).get('access_token','') or '')
except Exception: print('')"
}

#  Called over PostgREST as the signed-in user, so every gate in the
#  function sees a real actor and the real RLS context.
approve() {
  curl -sS -X POST "$API/rest/v1/rpc/master_formula_approve" \
    -H "apikey: $LOCAL_ANON_KEY" -H "Authorization: Bearer $2" \
    -H 'Content-Type: application/json' \
    --data "$(printf '{"p_formula_id":"%s"}' "$1")" 2>/dev/null
}

PASSWORD="$(python3 -I -c "import json; print(json.load(open('$IDS'))['password'])")"

head2 "Approving, through master_formula_approve"
#  Every company that has a QA manager approves ITS OWN formulas. Looping
#  over companies rather than picking one is what gets the beverage
#  formula's refusal exercised: it belongs to the second company, and a
#  single-actor run would never reach it.
FIRST_QA_COMPANY=""
while read -r qa_email qa_company; do
  [ -z "$qa_email" ] && continue
  [ -z "$FIRST_QA_COMPANY" ] && FIRST_QA_COMPANY="$qa_company"
  printf '  actor: %s\n' "$qa_email"
  prole="$(q "SELECT role FROM public.profiles WHERE lower(email)=lower('$qa_email');")"
  [ "$prole" = "compliance_officer" ] \
    && ok "platform role is compliance_officer, which the QA-authority gate accepts" \
    || bad "platform role is '$prole', which the QA-authority gate will refuse"

  TOKEN="$(login_as "$qa_email" "$PASSWORD")"
  [ -n "$TOKEN" ] && ok "they can sign in to the local Auth server" \
                 || { bad "could not sign in as $qa_email"; continue; }

  while read -r fid version; do
    [ -z "$fid" ] && continue
    actives="$(q "SELECT count(*) FROM public.master_formula_materials WHERE formula_id='$fid' AND role='active';")"
    st0="$(q "SELECT status FROM public.master_formulas WHERE id='$fid';")"
    [ "$st0" != "draft" ] && continue
    res="$(approve "$fid" "$TOKEN")"
    st="$(q "SELECT status FROM public.master_formulas WHERE id='$fid';")"
    if [ "${actives:-0}" -gt 0 ]; then
      case "$res" in
        *'"status": "approved"'*|*'"status":"approved"'*)
          [ "$st" = "approved" ] \
            && ok "v$version (${fid:0:8}) approved, and the row now reads approved" \
            || bad "v$version reported approved but the row reads '$st'" ;;
        *) bad "v$version (${fid:0:8}) was not approved" "$(printf '%s' "$res" | head -c 180)" ;;
      esac
    else
      #  The expected refusal, asserted as an outcome rather than skipped.
      case "$res" in
        *MASTER_FORMULA_NO_ACTIVE*)
          ok "v$version (${fid:0:8}) refused for declaring no active ingredient — the correct refusal" ;;
        *) bad "v$version was not refused for the expected reason" "$(printf '%s' "$res" | head -c 180)" ;;
      esac
      [ "$st" = "draft" ] && ok "and it is still a draft" || bad "it is now '$st'"
    fi
  done < <(q "SELECT id||' '||version FROM public.master_formulas WHERE company_id='$qa_company' ORDER BY version;")
done < <(q "
SELECT p.email||' '||cm.company_id
  FROM public.company_members cm
  JOIN public.profiles p ON p.id = cm.user_id
 WHERE cm.role = 'qa_manager' AND p.email LIKE '%.example'
 ORDER BY cm.company_id;")
QA_COMPANY="$FIRST_QA_COMPANY"
QA_EMAIL="$(q "
SELECT p.email FROM public.company_members cm
  JOIN public.profiles p ON p.id = cm.user_id
 WHERE cm.role='qa_manager' AND cm.company_id='$QA_COMPANY' AND p.email LIKE '%.example' LIMIT 1;")"

head2 "What the approval actually recorded"
#  The point of doing it this way: the row names the account that acted,
#  not the source's fictional approver.
rows="$(q "
SELECT count(*) FROM public.master_formulas f
 JOIN public.profiles p ON p.id = f.approved_by
WHERE f.status='approved' AND lower(p.email) = lower('$QA_EMAIL');")"
[ "${rows:-0}" -ge 1 ] \
  && ok "$rows approved formula(s) are attributed to the account that signed in" \
  || bad "no approved formula names the approving account"
stale="$(q "SELECT count(*) FROM public.master_formulas WHERE status='approved' AND approved_at < now() - interval '1 hour';")"
[ "${stale:-1}" = "0" ] \
  && ok "no approval carries a backdated timestamp" \
  || bad "$stale approval(s) are backdated — an approval time was written rather than performed"

head2 "A non-member cannot approve"
#  The other company's QA manager, against this company's formula.
read -r OTHER_EMAIL < <(python3 -I -c "
import json
d = json.load(open('$IDS'))
a = [x for x in d['actors'] if x['role_key'] == 'qa_manager' and x['company_id'] != '$QA_COMPANY']
print(a[0]['email'] if a else '')")
#  The surviving draft is the beverage formula in the OTHER company, so the
#  test runs in that direction: this company's QA manager against a formula
#  they are not a member of. If they were refused only for the missing
#  active ingredient, the membership gate would be untested — so the error
#  must name FORBIDDEN specifically.
draft="$(q "SELECT id FROM public.master_formulas
             WHERE status='draft' AND company_id <> '$QA_COMPANY' LIMIT 1;")"
TOKEN="$(login_as "$QA_EMAIL" "$PASSWORD")"
if [ -n "$draft" ] && [ -n "$TOKEN" ]; then
  r2="$(approve "$draft" "$TOKEN")"
  case "$r2" in
    *MASTER_FORMULA_FORBIDDEN*)
      ok "a QA manager of another company is refused on membership, not on anything else" ;;
    *'"status": "approved"'*|*'"status":"approved"'*)
      bad "a non-member approved another company's formula" ;;
    *) bad "refused, but not with MASTER_FORMULA_FORBIDDEN" "$(printf '%s' "$r2" | head -c 180)" ;;
  esac
  st="$(q "SELECT status FROM public.master_formulas WHERE id='$draft';")"
  [ "$st" = "draft" ] && ok "and that formula is still a draft" || bad "it is now '$st'"
else
  echo "  (skipped: no cross-company draft available)"
fi

head2 "The batch gate is now open for the approved formulas"
#  The reason any of this matters: BATCH_FORMULA_NOT_APPROVED was what
#  blocked the batch half of the demo. Asserted as a property of the data
#  rather than by trying an insert, which has six further gates of its own.
open="$(q "SELECT count(*) FROM public.master_formulas WHERE status='approved';")"
shut="$(q "SELECT count(*) FROM public.master_formulas WHERE status='draft';")"
echo "  approved: ${open:-0}   still draft: ${shut:-0}"
[ "${open:-0}" -ge 1 ] \
  && ok "${open} formula(s) could now manufacture a batch against them" \
  || bad "no formula was approved, so batches remain blocked"

head2 "Result"
printf '  total %d | passed %d | failed %d\n\n' "$total" "$passed" "$failed"
[ "$failed" -eq 0 ] || exit 1
