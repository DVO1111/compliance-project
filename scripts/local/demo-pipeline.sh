#!/usr/bin/env bash
#
#  The whole demonstration pipeline, in the one order that works.
#
#      scripts/local/up.sh
#      scripts/local/demo-pipeline.sh            import + identities + approve
#      scripts/local/demo-pipeline.sh --manufacture   …and manufacture
#
#  ── THE ORDER IS NOT ARBITRARY ────────────────────────────────────────────
#
#  Each step is a precondition of the next, and every one of these was found
#  by the application refusing:
#
#    1. import        companies must exist before memberships can point at
#                     them, and a formula needs its stages and materials
#                     before it can be approved at all
#                     (MASTER_FORMULA_NO_MATERIALS / NO_STAGES)
#    2. identities    company_members.user_id has a foreign key to
#                     auth.users, and the ids cannot be known until GoTrue
#                     assigns them
#    3. approve       a batch cannot be initiated against a draft formula
#                     (BATCH_FORMULA_NOT_APPROVED)
#    4. manufacture   products must reach `active` before initiation
#                     (BATCH_PRODUCT_NOT_REGISTERED), and stages run in
#                     sequence, each completed before the next can start
#
#  ── MANUFACTURING IS ONE-WAY ──────────────────────────────────────────────
#
#  Steps 1-3 are repeatable: the import is idempotent and `30_demo_reset.sql`
#  removes exactly what the registry owns. Step 4 is NOT reversible, and
#  that is the application being correct rather than a limitation to work
#  around — `electronic_signatures` carries no_update / no_delete /
#  no_truncate, so the signatures it produces are permanent, and
#  `batch_records.formula_id` is ON DELETE RESTRICT, so a manufactured batch
#  pins its formula. The reset refuses afterwards with
#  DEMO_MANUFACTURED_CANNOT_RESET.
#
#  The way back to clean is `scripts/local/down.sh`, which drops the volume.
#  Deleting the signatures is not an option and must not become one.
#
#  So --manufacture is opt-in: the default leaves a resettable database.
#
#  LOCAL ONLY.
#
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SEED="${SEED_JSON:-}"
OUT="${DEMO_OUT:-}"
IDS="${DEMO_IDENTITIES:-$ROOT/.demo-identities.json}"
export PGHOST=127.0.0.1 PGPORT=54322 PGUSER=postgres PGPASSWORD=postgres PGDATABASE=postgres

MANUFACTURE=0
for a in "$@"; do [ "$a" = "--manufacture" ] && MANUFACTURE=1; done

[ -n "$SEED" ] || { echo "SEED_JSON must point at the generator's seed.json." >&2; exit 2; }
[ -f "$SEED" ] || { echo "No seed.json at $SEED." >&2; exit 2; }
[ -n "$OUT" ]  || { echo "DEMO_OUT must point at a writable output directory." >&2; exit 2; }
[ -n "${LOCAL_SERVICE_ROLE_KEY:-}" ] || { echo "LOCAL_SERVICE_ROLE_KEY is not set." >&2; exit 2; }

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
q() { psql -X -At -c "$1" 2>/dev/null; }
run() { psql -X -q -v ON_ERROR_STOP=1 -c "SET criateur.environment='demo'" "$@"; }

#  A hosted project is never on loopback; this is the same proof up.sh uses.
case "${PGHOST}" in 127.0.0.1|localhost|::1) ;; *) echo "REFUSING: $PGHOST is not loopback." >&2; exit 1;; esac

say "1. Build the adapted import"
mkdir -p "$OUT"
npx --yes tsx "$ROOT/scripts/seed/demo/build.ts" --seed "$SEED" --out "$OUT" \
  | grep -E 'rows across|problem' | sed 's/^/  /'

say "2. Load it"
run -f "$OUT/10_demo_adapted.sql" >/dev/null || { echo "load failed" >&2; exit 1; }
echo "  registry: $(q 'SELECT count(*) FROM demo_seed_records;') row(s)"

say "3. Provision the demo identities"
SEED_JSON="$SEED" DEMO_IDENTITIES="$IDS" bash "$ROOT/scripts/local/demo-identities.sh" \
  | grep -E 'mapped|created|memberships' | sed 's/^/  /'

say "4. Facility logs: zones, schedules and entries"
#  After the identities, because a cleaning entry's verifier must have a
#  profile naming the company (FACILITY_VERIFIER_WRONG_COMPANY), and the
#  profiles are written by step 3.
python3 -I "$ROOT/scripts/seed/demo/facility.py" \
  --seed "$SEED" --identities "$IDS" --out "$OUT" | sed 's/^/  /'
run -f "$OUT/15_demo_facility.sql" >/dev/null || { echo "facility load failed" >&2; exit 1; }
echo "  outcomes, derived by the database:"
q "SELECT '    '||outcome||'  '||count(*)::text FROM public.facility_log_entries GROUP BY outcome ORDER BY outcome;"

say "5. Approve the formulas through the application"
bash "$ROOT/scripts/local/demo-approve-formulas.sh" | grep -E 'PASS|FAIL|total' | sed 's/^/  /'

if [ "$MANUFACTURE" = "0" ]; then
  say "Done — and the database is still resettable"
  cat <<INFO
  Import, identities, facility logs and formula approvals are in place.
  The registry owns all of it, so the reset still removes exactly those
  rows — run 25_demo_facility_reset.sql first, then 30_demo_reset.sql,
  because the zones reference sites that the second one deletes.

  Add --manufacture to initiate batches and execute their stages. That step
  produces immutable signatures and cannot be undone; after it, the way
  back to clean is scripts/local/down.sh.
INFO
  exit 0
fi

say "6. Manufacture: initiate batches and execute their stages"
#  The signing password is read from the identities file and passed as a
#  psql variable, so it is never written into the generated SQL.
PW="$(python3 -I -c "import json,sys; print(json.load(open(sys.argv[1]))['password'])" "$IDS")"
python3 -I "$ROOT/scripts/seed/demo/manufacture.py" \
  --seed "$SEED" --identities "$IDS" --out "$OUT" | sed 's/^/  /'
psql -X -q -v ON_ERROR_STOP=1 -v demo_password="$PW" \
  -c "SET criateur.environment='demo'" -f "$OUT/20_demo_manufacture.sql" >/dev/null \
  || { echo "manufacturing failed" >&2; exit 1; }

say "What the application produced"
psql -X -At -c "
SELECT '  batch_records                  '||count(*)||'   ('||string_agg(DISTINCT status,', ')||')' FROM public.batch_records;
SELECT '  batch_stages                   '||count(*)||'   ('||string_agg(DISTINCT status,', ')||')' FROM public.batch_stages;
SELECT '  batch_stage_parameter_readings '||count(*) FROM public.batch_stage_parameter_readings;
SELECT '  electronic_signatures          '||count(*) FROM public.electronic_signatures;
SELECT '  products active                '||count(*) FROM public.products WHERE status='active';"

say "And that those records are genuine"
#  Asserted, not assumed: a signature with a fabricated signer, a borrowed
#  hash or a backdated timestamp would be worse than none at all.
psql -X -At -c "
SELECT '  every signature has a 64-hex hash under the application''s own convention: '||
  (count(*) = count(*) FILTER (WHERE record_hash ~ '^[0-9a-f]{64}\$'
                                 AND hash_convention IS NOT NULL))::text
  FROM public.electronic_signatures;
SELECT '  every signer is a real local account:                                     '||
  (count(*) = (SELECT count(*) FROM public.electronic_signatures es
                JOIN auth.users u ON u.id = es.signer_id))::text
  FROM public.electronic_signatures;
SELECT '  no signature is backdated:                                                '||
  (count(*) = 0)::text FROM public.electronic_signatures WHERE signed_at < current_date;
SELECT '  every two-person stage was signed by two DIFFERENT people:                '||
  (count(*) = count(*) FILTER (WHERE operator_id IS DISTINCT FROM verifier_id))::text
  FROM public.batch_stages WHERE verifier_signature_id IS NOT NULL;
SELECT '  no reading was written around the application:                            '||
  (count(*) = count(*) FILTER (WHERE recorded_by IS NOT NULL))::text
  FROM public.batch_stage_parameter_readings;"

say "This database is now one-way"
echo "  30_demo_reset.sql will refuse (DEMO_MANUFACTURED_CANNOT_RESET)."
echo "  Use scripts/local/down.sh to get back to a clean database."
