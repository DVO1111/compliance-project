#!/usr/bin/env bash
#
#  Seed import rehearsal — against a throwaway database, never the project.
#
#      PGHOST=/tmp PGPORT=5432 PGUSER=postgres scripts/seed/rehearse.sh
#
#  WHAT IT PROVES
#  --------------
#    1. The reconciliation exits non-zero while the package does not match
#       the application schema, so it can gate a load rather than be read
#       by eye.
#    2. The seed refuses to run against a database not marked as a demo
#       environment — its own guard, checked rather than assumed.
#    3. The load fails against the real schema, and fails at the FIRST
#       table rather than part-way through.
#    4. NOTHING IS WRITTEN. The generated SQL is wrapped in a single
#       transaction, so a failure rolls the whole thing back. Proven by
#       counting rows before and after, not by trusting the wrapper.
#
#  WHY THE DATABASE IS A COPY. It is built with CREATE DATABASE … TEMPLATE
#  from the migration-built local database, so the rehearsal runs against
#  the real application schema without touching the one the SQL suites use.
#  It is dropped at the end.
#
#  THIS SCRIPT NEVER CONNECTS TO THE LIVE PROJECT. It takes no URL and no
#  key, and operates only on a local database it creates and destroys.
#
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SRC="${SEED_TEMPLATE_DB:-criateur_local}"
DB="seed_rehearsal"
SEED_SQL="$ROOT/seed/incoming/sql/10_seed_demo.sql"
LIFECYCLE_SQL="$ROOT/seed/incoming/sql/20_lifecycle_state.sql"

pass=0; fail=0
ok() { printf '  \033[32mPASS\033[0m %s\n' "$1"; pass=$((pass + 1)); }
no() { printf '  \033[31mFAIL\033[0m %s\n' "$1"; fail=$((fail + 1)); }

cleanup() { psql -d postgres -X -q -c "DROP DATABASE IF EXISTS $DB;" >/dev/null 2>&1; }
trap cleanup EXIT INT TERM

if [ ! -f "$SEED_SQL" ]; then
  echo "No seed package under seed/incoming/sql. Nothing to rehearse." >&2
  exit 2
fi

printf '\n\033[1mSeed import rehearsal\033[0m\n'

# ── 1. reconciliation gates the load ─────────────────────────────────
( cd "$ROOT" && npx tsx scripts/seed/reconcile.ts ) > /tmp/.recon.$$ 2>&1
rc=$?
if [ "$rc" -ne 0 ]; then
  ok "reconciliation exits non-zero while the schema does not match (exit $rc)"
else
  no "reconciliation exited 0 — it would wave an incompatible package through"
fi
grep -qE 'MISSING TABLE +[1-9]' /tmp/.recon.$$ \
  && ok "and names the tables the application does not have" \
  || no "but did not name any missing table"
rm -f /tmp/.recon.$$

# ── 2. a disposable copy of the real schema ──────────────────────────
cleanup
if ! psql -d postgres -X -q -c "CREATE DATABASE $DB TEMPLATE $SRC;" >/dev/null 2>&1; then
  echo "Could not create $DB from template $SRC. Build it first with scripts/ci/run-sql-tests.sh." >&2
  exit 2
fi

before="$(psql -d "$DB" -X -At -c "SELECT count(*) FROM companies;")"

# ── 3. the seed's own environment guard ──────────────────────────────
psql -d "$DB" -X -q -v ON_ERROR_STOP=1 -f "$SEED_SQL" > /tmp/.load1.$$ 2>&1
if grep -q "criateur.environment" /tmp/.load1.$$; then
  ok "the seed refuses a database not marked as a demo environment"
else
  no "the seed did NOT enforce its own environment guard"
fi
rm -f /tmp/.load1.$$

# ── 4. the load against the real schema ──────────────────────────────
psql -d "$DB" -X -q -v ON_ERROR_STOP=1 \
  -c "SET criateur.environment = 'demo'" -f "$SEED_SQL" > /tmp/.load2.$$ 2>&1
rc=$?
if [ "$rc" -ne 0 ]; then
  ok "the load fails against the application schema (exit $rc)"
  printf '       %s\n' "$(grep -m1 'ERROR' /tmp/.load2.$$ | sed 's/^.*ERROR:/ERROR:/')"
else
  no "the load SUCCEEDED — the reconciliation and this disagree, investigate"
fi
rm -f /tmp/.load2.$$

# ── 5. nothing was written ───────────────────────────────────────────
after="$(psql -d "$DB" -X -At -c "SELECT count(*) FROM companies;")"
if [ "$before" = "$after" ]; then
  ok "no partial import: companies $before before, $after after"
else
  no "PARTIAL IMPORT: companies went from $before to $after"
fi

#  The same property for the two tables a partial load would damage most.
for t in company_members electronic_signatures; do
  n="$(psql -d "$DB" -X -At -c "SELECT count(*) FROM $t;")"
  seeded="$(psql -d "$DB" -X -At -c "SELECT count(*) FROM $t WHERE company_id IN ('43ff9447-0022-5109-b9bf-edea7cc884df','5ca6a800-5bc2-51a3-9c1a-917888509791');")"
  if [ "$seeded" = "0" ]; then
    ok "no demo rows reached $t (total $n, demo-company rows 0)"
  else
    no "$seeded demo row(s) reached $t despite the failure"
  fi
done

# ── 6. the lifecycle file alone is equally refused ───────────────────
psql -d "$DB" -X -q -v ON_ERROR_STOP=1 \
  -c "SET criateur.environment = 'demo'" -f "$LIFECYCLE_SQL" > /tmp/.load3.$$ 2>&1
rc=$?
[ "$rc" -ne 0 ] \
  && ok "the lifecycle file is also refused on its own (exit $rc)" \
  || no "the lifecycle file loaded on its own — it should depend on the seed"
rm -f /tmp/.load3.$$

printf '\n  %d passed, %d failed\n\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
