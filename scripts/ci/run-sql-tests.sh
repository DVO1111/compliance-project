#!/usr/bin/env bash
#
#  Builds a Postgres database from the migrations and runs every SQL
#  suite against it.
#
#  The same script runs in CI and locally, deliberately: a suite that
#  passes on a developer's machine and not in CI is worth less than one
#  that runs the same way in both. Point it at any disposable database.
#
#      PGHOST=127.0.0.1 PGPORT=55432 PGUSER=postgres \
#        scripts/ci/run-sql-tests.sh
#
#  WHY THE DATABASE IS CALLED criateur_local
#  -----------------------------------------
#  Sixteen of the suites carry a guard that refuses to run unless
#  current_database() is 'postgres' or 'criateur_local' — a safety net
#  against pointing them at something real. Naming the database to
#  satisfy it is cheaper and safer than editing sixteen guards.
#
#  WHAT THIS SCRIPT ENFORCES
#  -------------------------
#    1. Every migration applies, except the set pinned in
#       expected-migration-failures.txt — and that set must match
#       exactly, in both directions.
#    2. Every suite reports at least one assertion. A suite that aborts
#       early produces zero, which would otherwise look indistinguish-
#       able from a clean pass.
#    3. No assertion fails.
#
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DB="${SQL_TEST_DB:-criateur_local}"
export PGHOST="${PGHOST:-127.0.0.1}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-postgres}"
export PGPASSWORD="${PGPASSWORD:-postgres}"

EXPECTED="$ROOT/scripts/ci/expected-migration-failures.txt"
BOOTSTRAP="$ROOT/scripts/ci/db-bootstrap.sql"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }

psql_q() { psql -v ON_ERROR_STOP=1 -q --no-psqlrc "$@"; }

# ── 1. a clean database ──────────────────────────────────────────────
say "Creating database $DB"
psql_q -d postgres -c "DROP DATABASE IF EXISTS \"$DB\";" >/dev/null
psql_q -d postgres -c "CREATE DATABASE \"$DB\";"         >/dev/null

say "Applying the harness bootstrap"
if ! psql_q -d "$DB" -f "$BOOTSTRAP"; then
  echo "FATAL: the bootstrap shim failed to apply." >&2
  exit 1
fi

# ── 2. migrations ────────────────────────────────────────────────────
say "Applying migrations"
mapfile -t MIGRATIONS < <(find "$ROOT/supabase/migrations" -maxdepth 1 -name '*.sql' -printf '%f\n' | sort)
echo "  ${#MIGRATIONS[@]} migration files"

: > "$WORK/failed.txt"
applied=0
for f in "${MIGRATIONS[@]}"; do
  if psql_q -d "$DB" -f "$ROOT/supabase/migrations/$f" >"$WORK/last.log" 2>&1; then
    applied=$((applied + 1))
  else
    echo "$f" >> "$WORK/failed.txt"
    #  Keep the first error for the summary, so a new failure is
    #  diagnosable from the CI log without re-running anything.
    {
      echo "--- $f"
      grep -iE 'ERROR|DETAIL' "$WORK/last.log" | head -3 | sed 's/^/    /'
    } >> "$WORK/failures-detail.txt"
  fi
done
echo "  applied: $applied    failed: $(wc -l < "$WORK/failed.txt" | tr -d ' ')"

#  The pinned baseline, comments and blanks stripped.
grep -vE '^\s*(#|$)' "$EXPECTED" | sort -u > "$WORK/expected.txt"
sort -u "$WORK/failed.txt" > "$WORK/actual.txt"

NEW_FAILURES="$(comm -13 "$WORK/expected.txt" "$WORK/actual.txt")"
NOW_PASSING="$(comm -23 "$WORK/expected.txt" "$WORK/actual.txt")"

status=0

if [ -n "$NEW_FAILURES" ]; then
  say "MIGRATIONS THAT FAILED AND ARE NOT IN THE BASELINE"
  echo "$NEW_FAILURES" | sed 's/^/  /'
  echo
  echo "  These are new. Fix the migration, or — if the failure is"
  echo "  genuinely expected on a plain Postgres — add it to"
  echo "  scripts/ci/expected-migration-failures.txt with a reason."
  status=1
fi

if [ -n "$NOW_PASSING" ]; then
  say "MIGRATIONS IN THE BASELINE THAT NOW APPLY CLEANLY"
  echo "$NOW_PASSING" | sed 's/^/  /'
  echo
  echo "  Good news, and the baseline is now wrong. Remove these lines"
  echo "  from scripts/ci/expected-migration-failures.txt so the list"
  echo "  keeps shrinking instead of quietly growing stale."
  status=1
fi

if [ -s "$WORK/failures-detail.txt" ] && [ -n "$NEW_FAILURES" ]; then
  say "First error from each failed migration"
  cat "$WORK/failures-detail.txt"
fi

if [ "$status" -ne 0 ]; then
  say "Stopping before the suites: the schema is not what the baseline describes."
  exit "$status"
fi

# ── 3. the suites ────────────────────────────────────────────────────
say "Running SQL suites"
total=0; passed=0; failed=0; empty=0
printf '  %-46s %8s %8s\n' "suite" "passed" "failed"
printf '  %-46s %8s %8s\n' "----------------------------------------------" "------" "------"

for suite in "$ROOT"/supabase/tests/*.sql; do
  name="$(basename "$suite")"
  out="$WORK/$name.out"
  #  ON_ERROR_STOP is deliberately NOT set: the suites record failures as
  #  rows and print a summary, and several raise on purpose to prove a
  #  guard bites. The verdict comes from the summary, not the exit code.
  psql -q --no-psqlrc -d "$DB" -f "$suite" > "$out" 2>&1

  #  Two summary formats are in use across the suites.
  p="$(grep -oE '^ PASS +\| +[0-9]+' "$out" | grep -oE '[0-9]+$' | head -1)"
  f="$(grep -oE '^ FAIL +\| +[0-9]+' "$out" | grep -oE '[0-9]+$' | head -1)"
  if [ -z "$p" ]; then
    line="$(grep -E '^ +[0-9]+ \| +[0-9]+ \| +[0-9]+ *$' "$out" | tail -1)"
    p="$(awk -F'|' '{print $2}' <<<"$line" | tr -d ' ')"
    f="$(awk -F'|' '{print $3}' <<<"$line" | tr -d ' ')"
  fi
  p="${p:-0}"; f="${f:-0}"

  printf '  %-46s %8s %8s' "$name" "$p" "$f"

  if [ "$p" = "0" ] && [ "$f" = "0" ]; then
    #  Zero assertions means the suite never reached its summary. That is
    #  a failure, not a pass — it is exactly what an aborted run looks
    #  like, and treating it as green is how a broken suite goes unseen.
    echo "   <-- NO ASSERTIONS REPORTED"
    empty=$((empty + 1))
    status=1
  elif [ "$f" != "0" ]; then
    echo "   <-- FAILURES"
    status=1
  else
    echo
  fi

  total=$((total + p + f)); passed=$((passed + p)); failed=$((failed + f))
done

say "TOTAL: $total assertions, $passed passed, $failed failed"

if [ "$empty" -ne 0 ] || [ "$failed" -ne 0 ]; then
  say "Details from the suites that did not pass"
  for suite in "$ROOT"/supabase/tests/*.sql; do
    name="$(basename "$suite")"
    out="$WORK/$name.out"
    [ -f "$out" ] || continue
    if grep -qE '^ [A-Z0-9]+ +\|.*\| FAIL' "$out" \
       || ! grep -qE '^ +[0-9]+ \|| PASS +\|' "$out"; then
      echo
      echo "=== $name"
      #  The failing assertion rows, or the error that stopped the suite.
      grep -E '\| FAIL|^psql.*(ERROR|FATAL)' "$out" | head -12 | sed 's/^/    /'
    fi
  done
fi

exit "$status"
