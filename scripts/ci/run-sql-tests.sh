#!/usr/bin/env bash
#
#  Builds a Postgres database from the migrations and runs every SQL
#  suite against it.
#
#  The same script runs in CI and locally, deliberately: a suite that
#  passes on a developer's machine and not in CI is worth less than one
#  that runs the same way in both. Point it at any disposable database.
#
#      PGHOST=127.0.0.1 PGUSER=postgres scripts/ci/run-sql-tests.sh
#
#  IT HAS TO BE PORT 5432, AND THAT IS NOT A PREFERENCE.
#  --------------------------------------------------
#  dispensing_test.sql and inprocess_control_test.sql use dblink to
#  open a SECOND connection to the same database, and they build its
#  connection string from the defaults rather than from PGPORT. Point
#  this script at a server on any other port and those two suites fail
#  with what looks like a dropped connection — not a configuration
#  error — which is how they can go unrun for weeks while the summary
#  still prints a total.
#
#  This header used to carry PGPORT=55432 as its example, which is the
#  one thing that does not work. If you need another port, teach those
#  two suites to pass PGPORT into their dblink string first.
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
#    4. Every suite named in expected-suite-assertions.txt EXISTS and
#       reports at least the assertions recorded there. The zero check
#       cannot see a suite that loses half its sections, or one whose
#       file has been deleted — the glob simply does not run it.
#    5. The aggregate assertion count does not fall below its floor.
#    6. No suite exits non-zero while reporting no failures. A suite
#       that fails raises on purpose, so a non-zero exit WITH a clean
#       summary is a suite that broke after printing it.
#
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DB="${SQL_TEST_DB:-criateur_local}"
export PGHOST="${PGHOST:-127.0.0.1}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-postgres}"
export PGPASSWORD="${PGPASSWORD:-postgres}"

EXPECTED="$ROOT/scripts/ci/expected-migration-failures.txt"
EXPECTED_ASSERTIONS="$ROOT/scripts/ci/expected-suite-assertions.txt"
WRITE_EXPECTED=0
[ "${1:-}" = "--write-expected" ] && WRITE_EXPECTED=1
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
grep -vE '^\s*(#|$)' "$EXPECTED_ASSERTIONS" > "$WORK/floors.txt" || true
: > "$WORK/observed.txt"
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
  suite_rc=$?

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
    #  A suite that fails raises on purpose, so a non-zero exit with a
    #  clean summary means it broke AFTER printing one — which the
    #  summary itself cannot show.
    if [ "$suite_rc" -ne 0 ]; then
      echo "   <-- EXITED $suite_rc AFTER A CLEAN SUMMARY"
      status=1
    else
      floor="$(awk -v n="$name" '$1==n {print $2}' "$WORK/floors.txt")"
      if [ -n "$floor" ] && [ "$p" -lt "$floor" ]; then
        echo "   <-- ONLY $p OF $floor EXPECTED ASSERTIONS"
        status=1
      else
        echo
      fi
    fi
  fi
  echo "$name $p" >> "$WORK/observed.txt"

  total=$((total + p + f)); passed=$((passed + p)); failed=$((failed + f))
done

say "TOTAL: $total assertions, $passed passed, $failed failed"

# ── 4. the suites that did not run at all ────────────────────────────
#  The glob cannot report a file that is not there. A deleted or renamed
#  suite would otherwise leave the run green because nothing failed.
MISSING=""
while read -r mname _; do
  [ "$mname" = "TOTAL" ] && continue
  grep -qE "^$mname " "$WORK/observed.txt" || MISSING="$MISSING  $mname"$'\n'
done < "$WORK/floors.txt"

if [ -n "$MISSING" ]; then
  say "SUITES THAT ARE EXPECTED BUT DID NOT RUN"
  printf '%s' "$MISSING"
  echo
  echo "  Each is named in expected-suite-assertions.txt and no file was"
  echo "  found for it. Restore the suite, or remove its line in the same"
  echo "  commit that deletes it."
  status=1
fi

# ── 5. the aggregate floor ───────────────────────────────────────────
TOTAL_FLOOR="$(awk '$1=="TOTAL" {print $2}' "$WORK/floors.txt")"
if [ -n "$TOTAL_FLOOR" ] && [ "$total" -lt "$TOTAL_FLOOR" ]; then
  say "THE TOTAL ASSERTION COUNT HAS FALLEN"
  echo "  expected at least $TOTAL_FLOOR, got $total"
  echo
  echo "  Assertions have been lost somewhere the per-suite floors did"
  echo "  not catch. If the drop is intended, lower the TOTAL line in"
  echo "  the same commit that removes them."
  status=1
fi

if [ "$WRITE_EXPECTED" -eq 1 ]; then
  say "Rewriting $EXPECTED_ASSERTIONS"
  {
    grep -E '^\s*#' "$EXPECTED_ASSERTIONS"
    echo
    echo "TOTAL $total"
    echo
    sort "$WORK/observed.txt"
  } > "$EXPECTED_ASSERTIONS.new" && mv "$EXPECTED_ASSERTIONS.new" "$EXPECTED_ASSERTIONS"
  echo "  wrote $(wc -l < "$WORK/observed.txt" | tr -d ' ') suite floors, TOTAL $total"
fi

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
