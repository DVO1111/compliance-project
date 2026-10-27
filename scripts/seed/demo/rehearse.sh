#!/usr/bin/env bash
#
#  Demonstration-seed rehearsal, against a disposable database.
#
#      PGHOST=/tmp PGPORT=5432 PGUSER=postgres \
#        scripts/seed/demo/rehearse.sh /path/to/adapted
#
#  Builds a throwaway copy of the migration-built schema, loads the adapted
#  seed, and checks what actually happened — row by row, from the database,
#  never from the loader's own say-so.
#
#  IT NEVER CONNECTS TO THE LIVE PROJECT. No URL, no key, and it creates and
#  drops the only database it touches.
#
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
ADAPTED="${1:-}"
SRC="${SEED_TEMPLATE_DB:-criateur_local}"
DB="demo_rehearsal"

#  ── TWO MODES, BECAUSE ONE OF THEM CANNOT WORK EVERYWHERE ───────────
#
#  CLONE (the default): copies the schema with CREATE DATABASE ... TEMPLATE
#  and works on the bare PG 17 rig the SQL suites build.
#
#  IN PLACE (--in-place): loads into the database it is pointed at. Needed
#  for a CLI-started Supabase stack, where cloning is impossible —
#
#      ERROR: source database "postgres" is being accessed by other users
#      DETAIL: There are 5 other sessions using the database.
#
#  because GoTrue, PostgREST and Kong hold connections open for as long as
#  the stack is up. The point of rehearsing there rather than only on the
#  rig is that it is the schema the application actually runs against,
#  with GoTrue's own auth schema present.
#
#  In place, the rehearsal ends by resetting and CHECKING the database was
#  returned to how it was found. The clone mode deliberately leaves the
#  seed loaded, since the database is dropped a moment later anyway.
INPLACE=0
for a in "$@"; do [ "$a" = "--in-place" ] && INPLACE=1; done
if [ "$INPLACE" = "1" ]; then
  DB="${PGDATABASE:-postgres}"
  ADAPTED="$(for a in "$@"; do [ "$a" != "--in-place" ] && { echo "$a"; break; }; done)"
fi

[ -n "$ADAPTED" ] || { echo "usage: rehearse.sh <adapted-dir> [--in-place]" >&2; exit 2; }
[ -f "$ADAPTED/10_demo_adapted.sql" ] || { echo "no 10_demo_adapted.sql in $ADAPTED" >&2; exit 2; }

pass=0; fail=0
ok() { printf '  \033[32mPASS\033[0m %s\n' "$1"; pass=$((pass + 1)); }
no() { printf '  \033[31mFAIL\033[0m %s\n' "$1"; fail=$((fail + 1)); }
q()  { psql -d "$DB" -X -At -c "$1" 2>/dev/null; }

cleanup() {
  #  In place there is nothing to drop; the final reset is what cleans up,
  #  and it is an assertion rather than a teardown.
  [ "$INPLACE" = "1" ] && return 0
  psql -d postgres -X -q -c "DROP DATABASE IF EXISTS $DB;" >/dev/null 2>&1
}
trap cleanup EXIT INT TERM

load() {
  psql -d "$DB" -X -q -v ON_ERROR_STOP=1 \
    -c "SET criateur.environment='demo'" -f "$1" >"$2" 2>&1
}

printf '\n\033[1mDemonstration seed rehearsal\033[0m\n'

if [ "$INPLACE" = "1" ]; then
  printf '  mode: IN PLACE against %s on %s:%s\n' \
    "$DB" "${PGHOST:-local}" "${PGPORT:-5432}"
  #  A rehearsal must not be the thing that writes demo data into a real
  #  database. Loopback is the same proof scripts/local/up.sh relies on: a
  #  hosted project is never reachable there.
  case "${PGHOST:-}" in
    127.0.0.1|localhost|::1|/tmp|/var/run/postgresql) ;;
    *) echo "REFUSING: --in-place needs a loopback PGHOST, got '${PGHOST:-unset}'." >&2
       exit 1;;
  esac
  #  And it must leave nothing behind, which is only checkable if the
  #  database starts clean of seed-owned rows.
  pre_reg="$(q "SELECT count(*) FROM demo_seed_records;" 2>/dev/null)"
  if [ -n "${pre_reg:-}" ] && [ "${pre_reg:-0}" -gt 0 ]; then
    echo "REFUSING: $pre_reg demo_seed_records row(s) already present." >&2
    echo "Run 30_demo_reset.sql first; this rehearsal cannot tell its own" >&2
    echo "rows from a previous run's." >&2
    exit 1
  fi
else
  cleanup
  psql -d postgres -X -q -c "CREATE DATABASE $DB TEMPLATE $SRC;" >/dev/null 2>&1 \
    || { echo "cannot create $DB from $SRC — run scripts/ci/run-sql-tests.sh first" >&2; exit 2; }
fi

base_companies="$(q 'SELECT count(*) FROM companies;')"
base_suppliers="$(q 'SELECT count(*) FROM suppliers;')"

# ── 1. the environment guard ─────────────────────────────────────────
psql -d "$DB" -X -q -v ON_ERROR_STOP=1 -f "$ADAPTED/10_demo_adapted.sql" >/tmp/.g.$$ 2>&1
grep -q "criateur.environment" /tmp/.g.$$ \
  && ok "refuses a database not marked as the demo environment" \
  || no "did NOT enforce the environment guard"
rm -f /tmp/.g.$$

# ── 2. the load ──────────────────────────────────────────────────────
load "$ADAPTED/10_demo_adapted.sql" /tmp/.l.$$
rc=$?
if [ "$rc" -eq 0 ]; then ok "the adapted seed loads (exit 0)"; else
  no "the load failed (exit $rc)"
  grep -m2 'ERROR' /tmp/.l.$$ | sed 's/^/       /'
fi
rm -f /tmp/.l.$$

# ── 3. what arrived ──────────────────────────────────────────────────
seeded="$(q 'SELECT count(*) FROM demo_seed_records;')"
[ "${seeded:-0}" -gt 0 ] \
  && ok "the registry records $seeded seed-owned row(s)" \
  || no "the registry is empty — reset would have nothing to key on"

printf '       rows by table:\n'
q "SELECT '         '||table_name||' = '||count(*) FROM demo_seed_records GROUP BY table_name ORDER BY table_name;"

# ── 4. tenant isolation is untouched ─────────────────────────────────
#  The seed must not have widened anything. RLS still on, policies intact.
rls_off="$(q "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relname IN ('companies','company_members','material_lots','deviations','capa_records','suppliers') AND NOT c.relrowsecurity;")"
[ "${rls_off:-1}" = "0" ] \
  && ok "row-level security still enabled on every seeded table" \
  || no "$rls_off seeded table(s) have RLS disabled"

cross="$(q "SELECT count(*) FROM material_lots l JOIN suppliers s ON s.id = l.supplier_id WHERE s.company_id <> l.company_id;")"
[ "${cross:-1}" = "0" ] \
  && ok "no seeded lot references a supplier of another company" \
  || no "$cross cross-tenant lot/supplier reference(s)"

cross2="$(q "SELECT count(*) FROM material_specifications ms JOIN materials m ON m.id = ms.material_id WHERE m.company_id <> ms.company_id;")"
[ "${cross2:-1}" = "0" ] \
  && ok "no seeded specification crosses a company boundary" \
  || no "$cross2 cross-tenant specification(s)"

# ── 5. repeating the import does not duplicate ───────────────────────
before_dup="$(q 'SELECT count(*) FROM material_lots;')"
load "$ADAPTED/10_demo_adapted.sql" /tmp/.l2.$$
rc=$?
after_dup="$(q 'SELECT count(*) FROM material_lots;')"
rm -f /tmp/.l2.$$
if [ "$rc" -eq 0 ] && [ "$before_dup" = "$after_dup" ]; then
  ok "a repeated import is a no-op (material_lots $before_dup -> $after_dup)"
else
  no "a repeated import changed the data ($before_dup -> $after_dup, exit $rc)"
fi

# ── 6. the reset removes only seed-owned data ────────────────────────
load "$ADAPTED/30_demo_reset.sql" /tmp/.r.$$
rc=$?
rm -f /tmp/.r.$$
after_companies="$(q 'SELECT count(*) FROM companies;')"
after_suppliers="$(q 'SELECT count(*) FROM suppliers;')"
if [ "$rc" -eq 0 ] && [ "$after_companies" = "$base_companies" ] \
   && [ "$after_suppliers" = "$base_suppliers" ]; then
  ok "the reset restores the pre-seed counts exactly (companies $base_companies, suppliers $base_suppliers)"
else
  no "the reset did not restore the baseline (companies $base_companies->$after_companies, suppliers $base_suppliers->$after_suppliers, exit $rc)"
fi

left="$(q 'SELECT count(*) FROM demo_seed_records;')"
[ "${left:-1}" = "0" ] \
  && ok "and the registry is emptied with it" \
  || no "$left registry row(s) survived the reset"

# ── 7. reseed restores the state ─────────────────────────────────────
load "$ADAPTED/10_demo_adapted.sql" /tmp/.l3.$$
rc=$?
rm -f /tmp/.l3.$$
reseeded="$(q 'SELECT count(*) FROM demo_seed_records;')"
if [ "$rc" -eq 0 ] && [ "$reseeded" = "$seeded" ]; then
  ok "reseeding restores the same $reseeded row(s)"
else
  no "reseed gave $reseeded row(s), expected $seeded (exit $rc)"
fi

# ── 8. an invalid import rolls back entirely ─────────────────────────
#  A deliberately broken copy: the last statement references a company
#  that does not exist, so the whole transaction must be discarded.
probe="/tmp/.bad.$$.sql"
{
  sed '$d' "$ADAPTED/10_demo_adapted.sql"
  echo "INSERT INTO sites (id, company_id, name, site_type) VALUES"
  echo "  ('00000000-0000-0000-0000-0000000000ff',"
  echo "   '00000000-0000-0000-0000-0000000000fe', 'Nowhere', 'manufacturing');"
  echo "COMMIT;"
} > "$probe"
pre_sites="$(q 'SELECT count(*) FROM sites;')"
load "$probe" /tmp/.l4.$$
rc=$?
post_sites="$(q 'SELECT count(*) FROM sites;')"
rm -f "$probe" /tmp/.l4.$$
if [ "$rc" -ne 0 ] && [ "$pre_sites" = "$post_sites" ]; then
  ok "an invalid import rolls back with no partial write (sites $pre_sites unchanged)"
else
  no "invalid import left changes behind (sites $pre_sites -> $post_sites, exit $rc)"
fi

# ── 9. no signature was fabricated ───────────────────────────────────
#  The seed must not have written an electronic signature by any route.
sigs="$(q "SELECT count(*) FROM demo_seed_records WHERE table_name = 'electronic_signatures';")"
[ "${sigs:-1}" = "0" ] \
  && ok "no electronic signature was seeded" \
  || no "$sigs signature(s) were seeded — hashes cannot be carried over"

# ── 10. in place, the database is handed back as it was found ────────
#  Step 7 left the seed loaded, which is fine in a database about to be
#  dropped and not fine in one that is staying. This is both the teardown
#  and the assertion that the reset is exact: if the counts do not come
#  back to their baselines, the reset removed too much or too little, and
#  either way the next rehearsal starts from somewhere unknown.
if [ "$INPLACE" = "1" ]; then
  load "$ADAPTED/30_demo_reset.sql" /tmp/.r2.$$
  rc=$?
  rm -f /tmp/.r2.$$
  end_companies="$(q 'SELECT count(*) FROM companies;')"
  end_suppliers="$(q 'SELECT count(*) FROM suppliers;')"
  end_reg="$(q 'SELECT count(*) FROM demo_seed_records;')"
  if [ "$rc" -eq 0 ] && [ "$end_companies" = "$base_companies" ] \
     && [ "$end_suppliers" = "$base_suppliers" ] && [ "${end_reg:-1}" = "0" ]; then
    ok "the database was returned to its pre-rehearsal state (companies $base_companies, suppliers $base_suppliers, registry empty)"
  else
    no "the database was NOT returned to its pre-rehearsal state (companies $base_companies->$end_companies, suppliers $base_suppliers->$end_suppliers, registry $end_reg, exit $rc)"
  fi
fi

printf '\n  %d passed, %d failed\n\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
