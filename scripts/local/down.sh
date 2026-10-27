#!/usr/bin/env bash
#
#  Tear down the disposable local stack.
#
#  LOCAL ONLY — `supabase stop` acts on the CLI's own containers and has
#  no path to a hosted project.
#
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
#  --no-backup: the point of a disposable database is that nothing in it
#  is worth keeping, and a stray dump of demo data is a liability.
npx --yes supabase@2.122.0 stop --no-backup "$@"
