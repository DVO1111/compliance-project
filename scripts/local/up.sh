#!/usr/bin/env bash
#
#  Bring up the disposable local Supabase stack.
#
#      scripts/local/up.sh          start and build the schema
#      scripts/local/down.sh        stop and remove it
#
#  LOCAL ONLY. Every command here targets 127.0.0.1 and the CLI's own
#  containers. It never reads a project ref, never calls `supabase link`
#  and never calls `db push`, so there is no path from this script to the
#  hosted project.
#
#  ── WHY THE CLI IS NOT ALLOWED TO APPLY THE MIGRATIONS ────────────────────
#
#  Because they do not apply to an empty database, and that is a property
#  of the repository rather than of this script.
#
#      ERROR: relation "companies" does not exist
#      at 20260226100000_ai_risk_intelligence.sql
#
#  `public.companies` is referenced by dozens of migrations and CREATED BY
#  NONE of them. scripts/ci/db-bootstrap.sql says so in as many words and
#  scaffolds it, which is why CI is green and `supabase start` is not. The
#  CLI applies migrations with no shim and stops at the first failure.
#
#  So the stack is started WITHOUT migrations and the schema is then built
#  the same way CI builds it: bootstrap shim, then every migration, with
#  the fifteen pinned failures in scripts/ci/expected-migration-failures.txt
#  tolerated and anything new reported. The local database then matches the
#  one the SQL suites are proven against, and the gap stays visible instead
#  of being papered over by a migration written to make a tool happy.
#
#  Fixing that properly means deciding where `companies` ought to be
#  created, which is a schema decision about a live project and not
#  something to settle from a local-setup script.
#
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CLI="supabase@2.122.0"
CONFIG="$ROOT/supabase/config.toml"
EXCLUDE="studio,realtime,storage-api,imgproxy,logflare,vector,supavisor,postgres-meta,pgbouncer,mailpit"

#  mailpit is excluded because its image would not pull from any of the
#  three registries the CLI tries. Mail is caught by scripts/local/smtp-sink.py
#  instead; see the recovery runbook.

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }

[ -n "${AUTH_HOOK_SECRET:-}" ] || {
  echo "AUTH_HOOK_SECRET is not set." >&2
  echo "Generate a LOCAL-ONLY one — never the production value:" >&2
  echo '  export AUTH_HOOK_SECRET="v1,whsec_$(head -c 32 /dev/urandom | base64)"' >&2
  exit 2
}

#  KEEP THE BASE64 PADDING. An earlier version of the line above piped
#  through `tr -d =`, which produces a secret the CLI accepts, the hook's
#  own `atob` accepts, and GoTrue then CANNOT SIGN WITH:
#
#      Error generating signatures: unable to create webhook,
#      err: illegal base64 data at input byte 40
#
#  Every signup fails 500 — not refused, broken — and the failure looks
#  nothing like a malformed secret. Go's base64 decoder is strict where
#  `atob` and the CLI's validator are lenient, and GoTrue is the one that
#  has to sign, so it is the authority on the format. Checked here because
#  the symptom is so far from the cause.
case "$AUTH_HOOK_SECRET" in
  *,whsec_*) ;;
  *) echo "AUTH_HOOK_SECRET must look like 'v1,whsec_<base64>'." >&2; exit 2;;
esac
python3 - <<'PY' || exit 2
import base64, os, sys
b64 = os.environ["AUTH_HOOK_SECRET"].split(",", 1)[1].removeprefix("whsec_")
try:
    key = base64.b64decode(b64, validate=True)
except Exception:
    sys.exit("AUTH_HOOK_SECRET's base64 is not strictly decodable — keep the '=' padding.")
if len(key) < 32:
    sys.exit(f"AUTH_HOOK_SECRET decodes to {len(key)} bytes; GoTrue needs at least 32.")
PY

#  Restore the config however this exits, including on Ctrl-C.
restore() { [ -f "$CONFIG.up.bak" ] && mv "$CONFIG.up.bak" "$CONFIG"; }
trap restore EXIT INT TERM

say "Starting the local stack (migrations applied separately — see the header)"
cp "$CONFIG" "$CONFIG.up.bak"
#  Narrow, reverted immediately: only [db.migrations].enabled, and only for
#  the duration of `start`.
python3 - "$CONFIG" <<'PY'
import re, sys
p = sys.argv[1]
s = open(p).read()
s = re.sub(r'(\[db\.migrations\][^\[]*?)enabled = true', r'\1enabled = false', s, count=1, flags=re.S)
open(p, 'w').write(s)
PY

npx --yes "$CLI" start -x "$EXCLUDE" >/tmp/.up.$$ 2>&1
rc=$?
restore
if [ "$rc" -ne 0 ]; then
  echo "supabase start failed:" >&2
  tail -20 /tmp/.up.$$ >&2
  rm -f /tmp/.up.$$
  exit 1
fi
rm -f /tmp/.up.$$

# ── the target is local, proven before anything is written ───────────
DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
export PGHOST=127.0.0.1 PGPORT=54322 PGUSER=postgres PGPASSWORD=postgres PGDATABASE=postgres

say "Confirming the target is the disposable local database"
#  The decisive fact is the address and port THIS CLIENT DIALLED. A
#  hosted project is never reachable on loopback, so if the connection
#  works at 127.0.0.1:54322 the target cannot be production.
#
#  `SHOW port` is deliberately NOT used: it reports the port inside the
#  container (5432), not the host port the connection came in on, and
#  reading it as the target was this script's first bug.
echo "  dialled        : $PGHOST:$PGPORT"
case "$PGHOST" in
  127.0.0.1|localhost|::1) ;;
  *) echo "REFUSING: $PGHOST is not loopback, so the target is not provably local." >&2; exit 1;;
esac
[ "$PGPORT" = "54322" ] || {
  echo "REFUSING: $PGPORT is not the CLI's local database port." >&2; exit 1; }

#  And the server really is the container behind that mapping.
srv="$(psql -X -At -c "SELECT coalesce(host(inet_server_addr()), 'socket');" 2>/dev/null)"
echo "  server address : ${srv:-unknown}"
case "${srv:-socket}" in
  127.0.0.1|::1|socket|10.*|172.1[6-9].*|172.2[0-9].*|172.3[01].*|192.168.*) ;;
  *) echo "REFUSING: server address $srv is routable, not a local container." >&2; exit 1;;
esac

#  Belt and braces: a hosted project carries rows this fresh local one
#  cannot. If any real company is present, this is not a disposable database.
realco="$(psql -X -At -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';" 2>/dev/null)"
echo "  public tables  : ${realco:-0} (a freshly started local database starts empty)"
if [ "${realco:-0}" -gt 50 ]; then
  echo "REFUSING: ${realco} tables already exist — this is not a freshly started disposable database." >&2
  exit 1
fi

say "Applying the local bootstrap"
#  NOT scripts/ci/db-bootstrap.sql: that one shims a bare Postgres and
#  tries to CREATE auth.users, which a real stack refuses because GoTrue
#  owns that schema. This is the short remainder.
psql -X -q -v ON_ERROR_STOP=1 -f "$ROOT/scripts/local/bootstrap-local.sql" >/dev/null || {
  echo "bootstrap failed" >&2; exit 1; }

say "Applying migrations (the pinned baseline is tolerated, anything new is not)"
mapfile -t MIGS < <(find "$ROOT/supabase/migrations" -maxdepth 1 -name '*.sql' -printf '%f\n' | sort)
grep -vE '^\s*(#|$)' "$ROOT/scripts/ci/expected-migration-failures.txt" | sort -u > /tmp/.exp.$$
: > /tmp/.fail.$$
applied=0
for f in "${MIGS[@]}"; do
  if psql -X -q -v ON_ERROR_STOP=1 -f "$ROOT/supabase/migrations/$f" >/dev/null 2>&1; then
    applied=$((applied + 1))
  else
    echo "$f" >> /tmp/.fail.$$
  fi
done
sort -u /tmp/.fail.$$ > /tmp/.act.$$
#  Persisted so the first-apply failure set can be reported accurately.
#  Re-running migrations against an already-migrated database produces a
#  different and much longer list — "already exists" is not a failure.
cp /tmp/.act.$$ "$ROOT/.local-migration-failures.txt"
echo "  ${#MIGS[@]} migrations, $applied applied, $(wc -l < /tmp/.act.$$ | tr -d ' ') failed"
echo "  (list written to .local-migration-failures.txt)"

NEW="$(comm -13 /tmp/.exp.$$ /tmp/.act.$$)"
rm -f /tmp/.exp.$$ /tmp/.fail.$$ /tmp/.act.$$
if [ -n "$NEW" ]; then
  say "MIGRATIONS THAT FAILED AND ARE NOT IN THE BASELINE"
  echo "$NEW" | sed 's/^/  /'
  exit 1
fi

say "Local stack is up"
cat <<INFO
  API        http://127.0.0.1:54321
  Database   $DB_URL
  Auth       http://127.0.0.1:54321/auth/v1
  Mail sink  scripts/local/smtp-sink.py (mailpit image would not pull)

  Keys:      npx $CLI status -o env   (do not paste them anywhere)
  Teardown:  scripts/local/down.sh
INFO
