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

[ -n "$ADAPTED" ] || { echo "usage: rehearse.sh <adapted-dir>" >&2; exit 2; }
[ -f "$ADAPTED/10_demo_adapted.sql" ] || { echo "no 10_demo_adapted.sql in $ADAPTED" >&2; exit 2; }

pass=0; fail=0
ok() { printf '  \033[32mPASS\033[0m %s\n' "$1"; pass=$((pass + 1)); }
no() { printf '  \033[31mFAIL\033[0m %s\n' "$1"; fail=$((fail + 1)); }
q()  { psql -d "$DB" -X -At -c "$1" 2>/dev/null; }

cleanup() { psql -d postgres -X -q -c "DROP DATABASE IF EXISTS $DB;" >/dev/null 2>&1; }
trap cleanup EXIT INT TERM

load() {
  psql -d "$DB" -X -q -v ON_ERROR_STOP=1 \
    -c "SET criateur.environment='demo'" -f "$1" >"$2" 2>&1
}

printf '\n\033[1mDemonstration seed rehearsal\033[0m\n'

cleanup
psql -d postgres -X -q -c "CREATE DATABASE $DB TEMPLATE $SRC;" >/dev/null 2>&1 \
  || { echo "cannot create $DB from $SRC — run scripts/ci/run-sql-tests.sh first" >&2; exit 2; }

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

printf '\n  %d passed, %d failed\n\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
