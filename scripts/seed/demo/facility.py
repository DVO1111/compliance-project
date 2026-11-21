#!/usr/bin/env python3
"""
Emit the demo's facility logs: zones, schedules and entries.

    scripts/seed/demo/facility.py \
      --seed <seed.json> --identities <.demo-identities.json> --out <dir>

── WHY THIS IS NOT A TABLE MAPPING ──────────────────────────────────────────

The source keeps environmental monitoring and cleaning as flat rows with a
free-text `zone` on each. The application models them as ENTRIES against a
`facility_zone_schedules` row, which belongs to a `facility_zones` row,
which belongs to a site — and the schedule is what carries the limits and
the sampling cadence. So two entities have to be derived before a single
reading can be recorded, and `build.ts` maps source rows to target rows and
cannot invent a parent.

Nothing is invented all the same. Every zone is a distinct `zone` string the
source already uses, against the site the source already names. Every
schedule's limits are the `alert_limit` and `acceptance_limit` the source
records on its readings. The outcome of each entry is NOT set here: the
application derives it with `fn_facility_log_outcome`, and supplying one
would be asserting a verdict the database is supposed to compute.

── FREQUENCY IS READ OFF THE DATES, OR THE ROWS ARE LEFT OUT ────────────────

`facility_zone_schedules.frequency` is NOT NULL and its vocabulary is
daily / weekly / monthly / quarterly. The source does not state a frequency,
but its `scheduled_date`s reveal one: five of the seven (zone, test) groups
are spaced at a uniform 7 or 28 days, which is weekly and monthly as a fact
about the data rather than a guess.

Two groups are not:

  Compression room active_air      one reading, so no interval exists
  Granulation surface_swab         gaps of 1, 2, 13 and 14 days — the
                                   story's failed swab and its re-swabs,
                                   with no representable base cadence
                                   (14 days is not in the vocabulary)

Those readings are NOT loaded. A schedule needs a frequency, 14-daily cannot
be expressed, and writing "weekly" over an irregular series would state a
monitoring cadence the factory did not run.

── THE ONE THING THE MODEL HOLDS AND THE SOURCE DOES NOT ────────────────────

A SCHEDULE's `sample_method` is bound to its protocol by
`facility_schedule_protocol_shape_chk`: a settle-plate schedule must carry
`protocol_exposure_minutes`, an active-air schedule must carry
`protocol_volume_litres`. The source records the method but neither
protocol figure, and inventing an exposure time or a sampled volume would be
fabricating the sampling protocol — the numbers a reading is only meaningful
against.

So the schedules leave `sample_method` NULL, and the method goes on each
ENTRY, whose own `facility_entry_sample_method_chk` constrains the
vocabulary and requires no protocol. The source's fact is kept, in the
structured column, and the protocol it does not have is not asserted. The
schedule's description names the method too, so the register still reads
correctly.
"""
from __future__ import annotations

import argparse
import json
import uuid
from collections import defaultdict
from datetime import date
from pathlib import Path

#  A fixed namespace, so re-running produces the same ids and the load stays
#  idempotent without needing to read anything back.
NS = uuid.UUID("0b5d1f6a-2c1e-4e7a-9f3b-8c2d4e6f7a81")

#  source test_type -> (application log_type, entry sample_method)
TEST = {
    "air_settle_plate": ("environmental_air", "settle_plate"),
    "active_air": ("environmental_air", "active_air"),
    "surface_swab": ("environmental_surface", "surface_swab"),
}
#  source cleaning_type -> application log_type
CLEAN = {"routine": "cleaning_routine", "deep": "cleaning_deep"}
#  observed interval in days -> the vocabulary's word for it
FREQ = {1: "daily", 7: "weekly", 28: "monthly", 30: "monthly", 91: "quarterly"}


def q(v) -> str:
    return "NULL" if v is None else "'" + str(v).replace("'", "''") + "'"


def num(v) -> str:
    return "NULL" if v is None else repr(float(v))


def det(*parts: str) -> str:
    return str(uuid.uuid5(NS, "|".join(str(p) for p in parts)))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", required=True)
    ap.add_argument("--identities", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    T = json.loads(Path(args.seed).read_text())["tables"]
    ids = json.loads(Path(args.identities).read_text())
    who = {a["source_id"]: a for a in ids["actors"]}

    env = T["environmental_monitoring"]
    cln = T["cleaning_records"]
    sites = {s["id"]: s for s in T["sites"]}

    skipped: list[str] = []

    # ── zones, from the strings the source already uses ────────────────────
    zones: dict[tuple[str, str, str], str] = {}
    for r in env + cln:
        key = (r["company_id"], r["site_id"], r["zone"])
        if key not in zones:
            zones[key] = det("zone", *key)

    # ── schedules: one per (zone, log_type, method), frequency from the data
    groups: dict[tuple, list[dict]] = defaultdict(list)
    for r in env:
        if r["test_type"] not in TEST:
            skipped.append(f"environmental test_type '{r['test_type']}' has no counterpart")
            continue
        groups[(r["company_id"], r["site_id"], r["zone"], r["test_type"])].append(r)

    schedules: list[dict] = []
    entries: list[dict] = []

    for key, rows in sorted(groups.items()):
        company, site, zone, test = key
        log_type, method = TEST[test]
        ds = sorted({date.fromisoformat(r["scheduled_date"]) for r in rows if r.get("scheduled_date")})
        gaps = sorted({(ds[i + 1] - ds[i]).days for i in range(len(ds) - 1)})
        freq = FREQ.get(gaps[0]) if len(gaps) == 1 else None
        if freq is None:
            skipped.append(
                f"{zone} / {test}: {len(rows)} reading(s) with "
                + (f"intervals {gaps}" if gaps else "no interval at all")
                + " — frequency is NOT NULL on a schedule and its vocabulary is "
                  "daily/weekly/monthly/quarterly, so no cadence can be stated "
                  "without inventing one; these readings are not loaded"
            )
            continue

        sid = det("sched", company, site, zone, test)
        #  Limits are the source's own, taken from its readings. They agree
        #  across a group; if they ever did not, the schedule would be
        #  describing two different limit sets and is reported instead.
        alerts = {r.get("alert_limit") for r in rows}
        actions = {r.get("acceptance_limit") for r in rows}
        units = {r.get("result_unit") for r in rows}
        if len(alerts) > 1 or len(actions) > 1:
            skipped.append(
                f"{zone} / {test}: the source's readings disagree about the limits "
                f"(alert {sorted(a for a in alerts if a is not None)}, "
                f"action {sorted(a for a in actions if a is not None)}), so one "
                "schedule cannot describe them")
            continue
        schedules.append({
            "id": sid, "company_id": company, "zone_id": zones[(company, site, zone)],
            "log_type": log_type,
            #  The method is named here because the schedule's own
            #  sample_method cannot be set without a protocol; see the header.
            "description": f"{zone} — {method.replace('_', ' ')} monitoring "
                           f"(from the demonstration dataset)",
            "frequency": freq,
            "alert_limit": next(iter(alerts)), "action_limit": next(iter(actions)),
            "result_unit": next(iter(units)),
        })
        for r in rows:
            rec = who.get(r.get("sampled_by"))
            entries.append({
                "id": det("entry", r["id"]), "company_id": company,
                "zone_id": zones[(company, site, zone)], "schedule_id": sid,
                "log_type": log_type, "due_at": r.get("scheduled_date"),
                "recorded_at": r.get("sampled_at") or r.get("scheduled_date"),
                "recorded_by": rec["local_id"] if rec else None,
                "result_value": r.get("result_value"), "result_unit": r.get("result_unit"),
                "sample_method": method,
                "performed": r.get("sampled_at") is not None,
            })

    # ── cleaning entries ──────────────────────────────────────────────────
    #  No schedule: a routine clean follows production, and the source's
    #  twelve records are not a cadence. schedule_id is nullable, and the
    #  entry carries everything FL-09 added for exactly this data.
    for r in cln:
        lt = CLEAN.get(r["cleaning_type"])
        if lt is None:
            skipped.append(f"cleaning_type '{r['cleaning_type']}' has no counterpart")
            continue
        perf = who.get(r.get("performed_by"))
        ver = who.get(r.get("verified_by")) if r.get("verified_by") else None
        agents = r.get("chemicals_used")
        if isinstance(agents, str):
            agents = [a.strip() for a in agents.split(",") if a.strip()]
        entries.append({
            "id": det("entry", r["id"]), "company_id": r["company_id"],
            "zone_id": zones[(r["company_id"], r["site_id"], r["zone"])],
            "schedule_id": None, "log_type": lt,
            "due_at": None, "recorded_at": r.get("performed_at"),
            "recorded_by": perf["local_id"] if perf else None,
            "result_value": None, "result_unit": None, "sample_method": None,
            "performed": True,
            "cleaning_method": r.get("method"), "cleaning_agents": agents,
            "contact_minutes": r.get("contact_time_minutes"),
            "started_at": r.get("performed_at"),
            "finished_at": r.get("performed_at"),
            "verified_by": ver["local_id"] if ver else None,
            "verified_at": r.get("performed_at") if ver else None,
        })

    # ── emit ──────────────────────────────────────────────────────────────
    sql = [
        "-- Criateur demonstration seed — FACILITY LOGS.",
        "-- Generated by scripts/seed/demo/facility.py. Do not edit by hand.",
        "--",
        "-- `outcome` is never written: fn_facility_log_outcome derives it.",
        "-- Every id is deterministic, so a repeated run is a no-op.",
        "",
        "BEGIN;",
        "",
        "DO $$ BEGIN",
        "  IF COALESCE(current_setting('criateur.environment', true), '') <> 'demo' THEN",
        "    RAISE EXCEPTION 'Refusing to run: set criateur.environment = ''demo''.';",
        "  END IF;",
        "END $$;",
        "",
        f"-- facility_zones: {len(zones)}",
    ]
    for (company, site, zone), zid in sorted(zones.items(), key=lambda kv: kv[1]):
        sql.append(
            "INSERT INTO public.facility_zones (id, company_id, site_id, name) VALUES "
            f"({q(zid)}, {q(company)}, {q(site)}, {q(zone)}) ON CONFLICT (id) DO NOTHING;")

    sql += ["", f"-- facility_zone_schedules: {len(schedules)}"]
    for s in schedules:
        sql.append(
            "INSERT INTO public.facility_zone_schedules "
            "(id, company_id, zone_id, log_type, description, frequency, "
            "alert_limit, action_limit, result_unit) VALUES ("
            f"{q(s['id'])}, {q(s['company_id'])}, {q(s['zone_id'])}, {q(s['log_type'])}, "
            f"{q(s['description'])}, {q(s['frequency'])}, {num(s['alert_limit'])}, "
            f"{num(s['action_limit'])}, {q(s['result_unit'])}) ON CONFLICT (id) DO NOTHING;")

    sql += ["", f"-- facility_log_entries: {len(entries)}"]
    for e in entries:
        cols = ["id", "company_id", "zone_id", "schedule_id", "log_type", "due_at",
                "recorded_at", "recorded_by", "result_value", "result_unit",
                "sample_method", "performed"]
        vals = [q(e["id"]), q(e["company_id"]), q(e["zone_id"]), q(e["schedule_id"]),
                q(e["log_type"]), q(e["due_at"]), q(e["recorded_at"]), q(e["recorded_by"]),
                num(e["result_value"]), q(e["result_unit"]), q(e["sample_method"]),
                "true" if e["performed"] else "false"]
        for c in ("cleaning_method", "contact_minutes", "started_at", "finished_at",
                  "verified_by", "verified_at"):
            if e.get(c) is not None:
                cols.append(c)
                vals.append(num(e[c]) if c == "contact_minutes" else q(e[c]))
        if e.get("cleaning_agents"):
            cols.append("cleaning_agents")
            vals.append("ARRAY[" + ", ".join(q(a) for a in e["cleaning_agents"]) + "]::text[]")
        sql.append(f"INSERT INTO public.facility_log_entries ({', '.join(cols)}) VALUES "
                   f"({', '.join(vals)}) ON CONFLICT (id) DO NOTHING;")

    #  Registered, so the registry-bounded reset removes exactly these.
    sql += ["", "-- registry, so the reset owns these rows too"]
    for table, rows in (("facility_zones", list(zones.values())),
                        ("facility_zone_schedules", [s["id"] for s in schedules]),
                        ("facility_log_entries", [e["id"] for e in entries])):
        if not rows:
            continue
        sql.append("INSERT INTO public.demo_seed_records (table_name, record_id) VALUES")
        sql.append(",\n".join(f"  ({q(table)}, {q(r)})" for r in rows)
                   + " ON CONFLICT DO NOTHING;")
    sql += ["", "COMMIT;", ""]

    #  Its own teardown, run BEFORE the main reset: zones point at sites,
    #  and the main reset deletes the sites.
    reset = [
        "-- Criateur demonstration seed — FACILITY LOGS, reset.",
        "-- Deletes only the rows the registry records for these three tables.",
        "-- Run BEFORE 30_demo_reset.sql: zones reference sites, which that removes.",
        "",
        "BEGIN;",
        "DO $$ BEGIN",
        "  IF COALESCE(current_setting('criateur.environment', true), '') <> 'demo' THEN",
        "    RAISE EXCEPTION 'Refusing to run: set criateur.environment = ''demo''.';",
        "  END IF;",
        "END $$;",
        "",
    ]
    for table in ("facility_log_entries", "facility_zone_schedules", "facility_zones"):
        reset += [
            f"DELETE FROM public.{table} WHERE id IN (",
            f"  SELECT record_id FROM public.demo_seed_records WHERE table_name = {q(table)});",
            "DELETE FROM public.demo_seed_records WHERE table_name = " + q(table) + ";",
        ]
    reset += ["", "COMMIT;", ""]

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    (out / "15_demo_facility.sql").write_text("\n".join(sql) + "\n")
    (out / "25_demo_facility_reset.sql").write_text("\n".join(reset) + "\n")

    report = [
        "# Facility logs — what loaded and what did not", "",
        "| target | rows |", "|---|---|",
        f"| `facility_zones` | {len(zones)} |",
        f"| `facility_zone_schedules` | {len(schedules)} |",
        f"| `facility_log_entries` | {len(entries)} |", "",
        "`outcome` is derived by `fn_facility_log_outcome`, never written here.",
        "",
        "## The derived outcome is sharper than the source's flag",
        "",
        "Worth knowing, because it looks at first like a mapping error. The",
        "Compression room settle plate of 2026-10-24 reads **52** against an",
        "alert limit of 50 and an action limit of 100. The source marks it",
        "`within_limit = true`, so its flag means *within the ACTION limit*.",
        "",
        "The application does not flatten the two: `fn_facility_log_outcome`",
        "returns `within_limits`, `outside_alert` or `outside_action`, and for",
        "this reading it derives **`outside_alert`** — over the alert limit,",
        "under the action limit. That is the more precise verdict and it is the",
        "database's, not the seed's; the seed writes no outcome at all.",
        "",
        "So one loaded reading reads `outside_alert` where the source reads",
        "\"within limit\". Both are true of their own question.",
        "", "## Not loaded, and why", "",
    ]
    report += [f"- {m}" for m in dict.fromkeys(skipped)] or ["- nothing"]
    (out / "FACILITY_REPORT.md").write_text("\n".join(report) + "\n")

    print(f"  zones {len(zones)}   schedules {len(schedules)}   entries {len(entries)}")
    for m in dict.fromkeys(skipped):
        print(f"  not loaded: {m[:110]}")


if __name__ == "__main__":
    main()
