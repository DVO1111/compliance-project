#!/usr/bin/env bash
#
#  Stop the disposable local stack and, by default, DESTROY its data.
#
#      scripts/local/down.sh              stop and remove the database volume
#      scripts/local/down.sh --keep-data  stop but leave the volume in place
#
#  ── WHY THE VOLUME IS REMOVED, AND WHY THAT IS NOT THE DEFAULT IN THE CLI ──
#
#  `supabase stop --no-backup` does NOT delete the database volume — it only
#  skips the backup dump it would otherwise take. The volume
#  `supabase_db_<project>` survives, so the next `up.sh` finds a populated
#  database and takes its reuse path. That is usually convenient and was
#  this script's behaviour, silently.
#
#  It stops being convenient once the demo has been MANUFACTURED.
#  scripts/seed/demo/manufacture.py drives real batches through the
#  application, and the records that come out cannot be removed:
#  `electronic_signatures` carries no_update / no_delete / no_truncate
#  triggers, and `batch_records.formula_id` is ON DELETE RESTRICT, so a
#  manufactured batch pins the formula it was made to. The registry-bounded
#  reset refuses with DEMO_MANUFACTURED_CANNOT_RESET and says to drop the
#  database instead.
#
#  Dropping the database is therefore the documented way back to clean, and
#  it has to actually work. So this removes the volume.
#
#  `--keep-data` is there for the case where you are only restarting the
#  containers — after the reaper has taken them, say — and want the schema
#  you already built.
#
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

KEEP=0
ARGS=()
for a in "$@"; do
  if [ "$a" = "--keep-data" ]; then KEEP=1; else ARGS+=("$a"); fi
done

npx --yes supabase@2.122.0 stop --no-backup ${ARGS+"${ARGS[@]}"}

if [ "$KEEP" = "1" ]; then
  echo "Containers stopped; the database volume was kept (--keep-data)."
  exit 0
fi

#  Only the CLI's own volumes for this project, named by the CLI. Nothing
#  here matches a volume that is not the local stack's.
removed=0
for v in $(docker volume ls --format '{{.Name}}' 2>/dev/null \
             | grep -E '^supabase_(db|edge_runtime|storage|inbucket)_project$'); do
  docker volume rm "$v" >/dev/null 2>&1 && removed=$((removed + 1))
done
echo "Containers stopped and ${removed} local volume(s) removed — the next up.sh builds clean."
