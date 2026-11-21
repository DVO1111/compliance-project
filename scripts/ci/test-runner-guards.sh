#!/usr/bin/env bash
#
#  Regression tests for the SQL runner's own guards.
#
#  WHY THIS EXISTS. The runner is the thing that decides whether every
#  other SQL test passed. A hole in it is invisible by construction: the
#  symptom of a broken verdict is a green run, which is also the symptom
#  of everything being fine.
#
#  So each guard is exercised by giving the runner a suite that trips it
#  and requiring a NON-ZERO EXIT. A test that only checked the printed
#  output would pass against a runner that prints a warning and exits 0,
#  which is the exact failure mode being guarded against — so the exit
#  code is the assertion, every time.
#
#  These run the real runner against the real migrations, so they are
#  slow. That is the cost of testing the thing rather than a model of it.
#
#      scripts/ci/test-runner-guards.sh
#
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUNNER="$ROOT/scripts/ci/run-sql-tests.sh"
TESTS="$ROOT/supabase/tests"
MANIFEST="$ROOT/scripts/ci/expected-suite-assertions.txt"
WORK="$(mktemp -d)"

pass=0; fail=0

#  Anything this script creates must be removed even if it is killed, or
#  the next real run inherits a planted failing suite.
cleanup() {
  rm -f "$TESTS"/zzz_guard_*.sql
  [ -f "$WORK/manifest.bak" ] && cp "$WORK/manifest.bak" "$MANIFEST"
  rm -rf "$WORK"
}
trap cleanup EXIT INT TERM

cp "$MANIFEST" "$WORK/manifest.bak"

ok() { printf '  \033[32mPASS\033[0m %s\n' "$1"; pass=$((pass + 1)); }
no() { printf '  \033[31mFAIL\033[0m %s\n' "$1"; fail=$((fail + 1)); }

#  Run the runner, discard its output, return its exit code.
run_runner() { bash "$RUNNER" > "$WORK/run.log" 2>&1; echo $?; }

expect_nonzero() {
  local what="$1" rc="$2"
  if [ "$rc" -ne 0 ]; then ok "$what (exit $rc)"; else
    no "$what — THE RUNNER EXITED 0"
    sed -n '/Running SQL suites/,$p' "$WORK/run.log" | head -20 | sed 's/^/      /'
  fi
}

printf '\n\033[1mSQL runner guards\033[0m\n'

# ── 1. a suite that aborts before printing a summary ─────────────────
cat > "$TESTS/zzz_guard_abort_test.sql" <<'SQL'
\set ON_ERROR_STOP on
DO $$ BEGIN RAISE EXCEPTION 'guard probe: aborting before the summary'; END $$;
SQL
rc="$(run_runner)"
expect_nonzero "an aborting suite fails the run" "$rc"
grep -q "NO ASSERTIONS REPORTED" "$WORK/run.log" \
  && ok "and it is named as reporting no assertions" \
  || no "but it was not named as reporting no assertions"
rm -f "$TESTS/zzz_guard_abort_test.sql"

# ── 2. a suite that loses assertions but still passes ────────────────
#  The case the zero-assertion check cannot see: a summary is printed,
#  nothing fails, and the count has quietly fallen.
cat > "$TESTS/zzz_guard_shrunk_test.sql" <<'SQL'
CREATE TEMP TABLE _s(section text, name text, ok boolean, detail text);
INSERT INTO _s VALUES ('A','only one assertion left',true,NULL);
SELECT count(*) AS total, count(*) FILTER (WHERE ok) AS passed,
       count(*) FILTER (WHERE NOT ok) AS failed FROM _s;
SQL
#  Declare it as having had ten, so one is a loss of nine.
echo "zzz_guard_shrunk_test.sql 10" >> "$MANIFEST"
rc="$(run_runner)"
expect_nonzero "a suite below its assertion floor fails the run" "$rc"
grep -q "ONLY 1 OF 10 EXPECTED ASSERTIONS" "$WORK/run.log" \
  && ok "and the shortfall is reported with both numbers" \
  || no "but the shortfall was not reported"
cp "$WORK/manifest.bak" "$MANIFEST"
rm -f "$TESTS/zzz_guard_shrunk_test.sql"

# ── 3. a suite whose file has gone ───────────────────────────────────
#  The glob cannot report a file that is not there, so a deleted suite
#  would otherwise leave the run green.
echo "zzz_guard_deleted_test.sql 12" >> "$MANIFEST"
rc="$(run_runner)"
expect_nonzero "an expected suite with no file fails the run" "$rc"
grep -q "EXPECTED BUT DID NOT RUN" "$WORK/run.log" \
  && ok "and the missing suite is named" \
  || no "but the missing suite was not named"
cp "$WORK/manifest.bak" "$MANIFEST"

# ── 4. the aggregate floor ───────────────────────────────────────────
#  Belt and braces over the per-suite floors: a drop that slips past
#  them still has to pass this.
python3 - "$MANIFEST" <<'PY'
import re, sys
p = sys.argv[1]
s = open(p).read()
cur = int(re.search(r'^TOTAL (\d+)$', s, re.M).group(1))
open(p, 'w').write(re.sub(r'^TOTAL \d+$', f'TOTAL {cur + 500}', s, count=1, flags=re.M))
PY
rc="$(run_runner)"
expect_nonzero "an aggregate below the TOTAL floor fails the run" "$rc"
grep -q "TOTAL ASSERTION COUNT HAS FALLEN" "$WORK/run.log" \
  && ok "and the shortfall is reported" \
  || no "but the aggregate shortfall was not reported"
cp "$WORK/manifest.bak" "$MANIFEST"

# ── 5. the control: a clean tree still passes ────────────────────────
#  Without this the other four prove only that the runner can fail, not
#  that it can still succeed — a runner hard-wired to exit 1 would pass
#  every test above.
rc="$(run_runner)"
if [ "$rc" -eq 0 ]; then ok "an unmodified tree still exits 0"; else
  no "an unmodified tree now FAILS (exit $rc) — the guards are too strict"
  sed -n '/Running SQL suites/,$p' "$WORK/run.log" | grep -E '<--' | head -10 | sed 's/^/      /'
fi

printf '\n  %d passed, %d failed\n\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
