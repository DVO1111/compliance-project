#!/usr/bin/env python3
"""
Emit SQL that MANUFACTURES the demo batches through the application.

    scripts/seed/demo/manufacture.py \
      --seed <seed.json> --identities <.demo-identities.json> --out <dir>

── WHY THIS IS NOT A MAPPING ────────────────────────────────────────────────

`batch_records`, `batch_stages` and `batch_stage_parameter_readings` are the
output of a manufacturing workflow, not rows to be copied. The application
says so in six separate gates on `batch_records` alone, and the only way in
is `batch_record_initiate` — which then creates the stages itself from the
approved formula. So the stages are never mapped: asking the application to
initiate a batch produces them.

What this emits is therefore a script of RPC CALLS in the order a factory
would make them:

    product    start_regulatory_prep -> submit_to_regulator
               -> record_registration -> activate
    batch      batch_record_initiate            (stages created here)
    per stage  batch_stage_start
               batch_stage_record_reading       (xN, from the source)
               sign_electronic_record           (operator)
               sign_electronic_record           (verifier, if required)
               batch_stage_complete

── WHERE THIS STOPS ─────────────────────────────────────────────────────────

At the end of execution. It does NOT call `batch_record_close`, submit for
QC, or release, so every batch is left `in_progress`.

That is deliberate rather than unfinished. Release is a signed act with its
own preconditions — QC results against a governing specification, a release
decision — and the source's QC data is keyed to free-standing specification
tests rather than to a batch, which is a modelling gap recorded in
docs/seed/DEMO_STORY_GAPS.md and not something to paper over by closing
batches that have no QC behind them.

One batch is left part-executed on purpose: PCM-2610-014's last two stages
have no `started_by` and no `completed_at` in the source, so they are not
started here either.

Every id is resolved inside the SQL from a natural key — batch number, stage
sequence, product code — so no round trip is needed and the script is
deterministic and reviewable before it is run.

── WHAT MAKES THE RECORDS LEGITIMATE ────────────────────────────────────────

Each call runs as a real local account: `request.jwt.claims` carries that
actor's id and the statement runs as `authenticated`, so `auth.uid()`,
`app_is_company_member()` and `lifecycle_available_actions()` all see a real
actor. Signatures come from `sign_electronic_record`, which re-verifies the
signer's password and computes the record hash itself — the hashes are the
application's own, over its own serialisation, and the timestamps are the
moment the script ran.

The actors are taken from the SOURCE: the operator who started a stage, the
one who completed it, the supervisor who verified it, the analyst who
recorded a reading. Their source uuids are translated to the local accounts
`demo-identities.sh` created. Nobody is substituted and no action is
attributed to a person who is not in the source as having done it.

Values are the source's own. A reading's number, its unit, whether it was in
specification, and the two out-of-specification readings' supervisor
authorisations all come from the dataset.

── WHAT IT DELIBERATELY WILL NOT DO ─────────────────────────────────────────

It emits nothing for a batch whose formula is not approved, and nothing for
a product that cannot reach `active` — the beverage formula declares no
active ingredient, so its batch is simply not attempted. It does not insert
into any of the three tables directly, and it does not grant itself a role
or disable a trigger to get past a refusal.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

#  The meanings the application's CHECK allows; these two are the ones a
#  stage signature carries.
MEANING_OPERATOR = "authored"
MEANING_VERIFIER = "verified"


def q(text: str) -> str:
    """A SQL string literal."""
    return "'" + str(text).replace("'", "''") + "'"


def num(v) -> str:
    return "NULL" if v is None else repr(float(v))


class Script:
    def __init__(self) -> None:
        self.lines: list[str] = []
        self.actor: str | None = None

    def say(self, *lines: str) -> None:
        self.lines.extend(lines)

    def as_actor(self, uid: str, label: str) -> None:
        """Switch the acting identity. Emitted only when it changes."""
        if self.actor == uid:
            return
        self.actor = uid
        self.say(
            "",
            f"--  acting as {label}",
            "RESET ROLE;",
            "SELECT set_config('request.jwt.claims', "
            f"json_build_object('sub', {q(uid)}, 'role', 'authenticated')::text, false);",
            "SET ROLE authenticated;",
        )


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", required=True)
    ap.add_argument("--identities", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    seed = json.loads(Path(args.seed).read_text())
    ids = json.loads(Path(args.identities).read_text())
    T = seed["tables"]
    #  The signing password is NOT written into the generated SQL. It is
    #  referenced as a psql variable, so the script can be read, reviewed
    #  and committed without carrying a credential, and the caller supplies
    #  it with -v demo_password=... at run time.
    _ = ids.get("password")

    #  source user uuid -> local account
    who = {a["source_id"]: a for a in ids["actors"]}

    products = {p["id"]: p for p in T["products"]}
    formulas = {f["id"]: f for f in T["master_formulas"]}
    fstages = T["master_formula_stages"]
    fparams = {p["id"]: p for p in T["master_formula_stage_parameters"]}
    bstages = T["batch_stages"]
    regs = T["product_registrations"]
    readings = T["batch_stage_parameter_readings"]

    #  A formula is manufacturable only if it declares an active ingredient;
    #  the application refuses to approve it otherwise, so a batch against
    #  it can never be initiated. Determined from the source's own material
    #  types rather than from the database, so the plan can be read before
    #  anything runs.
    mats = {m["id"]: m for m in T["materials"]}
    has_active = {
        f["id"]: any(
            mats.get(r["material_id"], {}).get("material_type") == "api"
            for r in T["master_formula_materials"]
            if r["master_formula_id"] == f["id"]
        )
        for f in T["master_formulas"]
    }

    s = Script()
    skipped: list[str] = []
    planned_batches: list[dict] = []

    s.say(
        "-- Criateur demonstration seed — MANUFACTURING, through the application.",
        "-- Generated by scripts/seed/demo/manufacture.py. Do not edit by hand.",
        "--",
        "-- Every statement is an application RPC called as a real local account.",
        "-- Nothing is inserted into batch_records, batch_stages or",
        "-- batch_stage_parameter_readings directly.",
        "",
        "\\set ON_ERROR_STOP on",
        "SET client_min_messages = warning;",
        "",
        "--  Supplied by the caller as -v demo_password=... ; never stored here.",
        "\\if :{?demo_password}",
        "\\else",
        "\\echo 'demo_password is not set. Pass -v demo_password=<the local demo password>.'",
        "\\quit 2",
        "\\endif",
        "",
        "DO $$ BEGIN",
        "  IF COALESCE(current_setting('criateur.environment', true), '') <> 'demo' THEN",
        "    RAISE EXCEPTION 'Refusing to run: set criateur.environment = ''demo''.';",
        "  END IF;",
        "END $$;",
    )

    # ── 1. products to `active`, citing the source's own registration ──────
    s.say("", "-- ═══ 1. Products through the registration lifecycle ═══")
    #  Only products that have a formula we can actually manufacture; moving
    #  the others would assert a registration for no reason.
    wanted = {
        f["product_id"]
        for f in T["master_formulas"]
        if has_active[f["id"]]
    }
    for pid in sorted(wanted):
        p = products[pid]
        #  An approver of the owning company performs it: record_registration
        #  and activate both require admin or compliance_officer.
        qa = next((a for a in ids["actors"]
                   if a["role_key"] == "qa_manager" and a["company_id"] == p["company_id"]), None)
        if qa is None:
            skipped.append(f"product {p['product_code']}: no qa_manager for its company")
            continue
        reg = next((r for r in regs if r["product_id"] == pid and r["jurisdiction"] == "NG"), None)
        #  The comment is a fact from the source, not a sentence invented to
        #  satisfy LIFECYCLE_COMMENT_REQUIRED.
        note = (
            f"Registration {reg['registration_number']} ({reg['jurisdiction']}), "
            f"issued {reg['issued_date']}, expires {reg['expiry_date']} — "
            "from the demonstration dataset's product_registrations."
            if reg else
            "No registration on record in the demonstration dataset."
        )
        s.as_actor(qa["local_id"], f"{qa['email']} (qa_manager)")
        sel = f"(SELECT id FROM public.products WHERE product_code = {q(p['product_code'])})"
        #  Each transition is guarded on the state it comes FROM, so the
        #  script is re-runnable: a product already advanced is skipped
        #  rather than raising LIFECYCLE_INVALID_TRANSITION and aborting
        #  everything after it. `products.status` mirrors the lifecycle
        #  state, so the guard reads the same fact the engine does.
        for action, from_state, comment in (
                ("start_regulatory_prep", "concept", None),
                ("submit_to_regulator", "regulatory_preparation", None),
                ("record_registration", "submitted", note),
                ("activate", "registered", None)):
            c = q(comment) if comment else "NULL"
            s.say(
                "DO $mfg$ BEGIN",
                f"  IF (SELECT status FROM public.products WHERE product_code = {q(p['product_code'])})"
                f" = {q(from_state)} THEN",
                f"    PERFORM public.lifecycle_transition('product', {sel}, {q(action)}, "
                f"{q(p['company_id'])}, NULL, {c});",
                "  END IF;",
                "END $mfg$;",
            )

    # ── 2. initiate each manufacturable batch ──────────────────────────────
    s.say("", "-- ═══ 2. Batch initiation (the stages are created by this call) ═══")
    for b in sorted(T["batch_records"], key=lambda r: r["batch_number"]):
        f = formulas.get(b["master_formula_id"])
        if f is None or not has_active[f["id"]]:
            skipped.append(
                f"batch {b['batch_number']}: its formula declares no active ingredient, "
                "so the application will not approve the formula and will not initiate a batch"
            )
            continue
        #  The application requires both dates at initiation and the column
        #  is NOT NULL for each. The source's part-finished batch has
        #  neither, because it had not been manufactured yet — so supplying
        #  one would be writing a manufacturing date onto a GMP record that
        #  the dataset does not claim.
        if not b.get("manufacturing_date") or not b.get("expiry_date"):
            skipped.append(
                f"batch {b['batch_number']}: the source records no manufacturing or expiry "
                "date, and batch_records requires both at initiation — inventing them "
                "would fabricate the dates on a batch record")
            continue
        actor = who.get(b["initiated_by"])
        if actor is None:
            skipped.append(f"batch {b['batch_number']}: initiator not among the demo actors")
            continue
        p = products[b["product_id"]]
        s.as_actor(actor["local_id"], f"{actor['email']} ({actor['role_key']})")
        s.say(
            "DO $mfg$ BEGIN",
            "  IF NOT EXISTS (SELECT 1 FROM public.batch_records "
            f"WHERE batch_number = {q(b['batch_number'])}) THEN",
            "    PERFORM public.batch_record_initiate("
            f"{q(b['company_id'])}, {q(b['batch_number'])}, "
            f"(SELECT id FROM public.products WHERE product_code = {q(p['product_code'])}), "
            f"{q(b['manufacturing_date'])}, {q(b['expiry_date'])}, "
            f"{num(b['planned_batch_size'])}, {q(f['batch_size_unit'])});",
            "  END IF;",
            "END $mfg$;",
        )
        planned_batches.append(b)

    # ── 3. execute each stage ──────────────────────────────────────────────
    s.say("", "-- ═══ 3. Stage execution: start, record, sign, complete ═══")
    by_batch: dict[str, list[dict]] = {}
    for bs in bstages:
        by_batch.setdefault(bs["batch_record_id"], []).append(bs)

    reading_count = 0
    sig_count = 0
    stage_count = 0

    for b in planned_batches:
        f = formulas[b["master_formula_id"]]
        stages = sorted(by_batch.get(b["id"], []), key=lambda r: r["sequence_order"])
        bn = q(b["batch_number"])
        s.say("", f"--  batch {b['batch_number']}")
        for bs in stages:
            #  The application numbered the stage from the formula, so it is
            #  found by (batch number, sequence) rather than by the source id.
            fstage = next((x for x in fstages
                           if x["master_formula_id"] == f["id"]
                           and x["stage_key"] == bs["stage_key"]), None)
            if fstage is None:
                skipped.append(
                    f"batch {b['batch_number']} stage {bs['stage_name']}: "
                    "no matching formula stage, so the application did not create it")
                continue
            sel_stage = (
                "(SELECT bs.id FROM public.batch_stages bs "
                "JOIN public.batch_records br ON br.id = bs.batch_id "
                f"WHERE br.batch_number = {bn} AND bs.sequence_no = {fstage['sequence_order']})"
            )

            if bs.get("started_by") is None:
                #  NOT a gap. The source leaves this batch part-finished —
                #  no started_by, no completed_at, no release decision — so
                #  the stage genuinely had not begun. Starting it here would
                #  manufacture something the dataset does not say happened.
                skipped.append(
                    f"batch {b['batch_number']} stage {bs['stage_name']}: not started in the "
                    "source, so the batch is left part-executed as the dataset has it")
                continue
            starter = who.get(bs["started_by"])
            if starter is None:
                skipped.append(
                    f"batch {b['batch_number']} stage {bs['stage_name']}: the source's "
                    "operator is not one of the demo actors")
                continue
            s.as_actor(starter["local_id"], f"{starter['email']} ({starter['role_key']})")
            s.say(
                "DO $mfg$ BEGIN",
                f"  IF (SELECT status FROM public.batch_stages WHERE id = {sel_stage}) = 'pending' THEN",
                f"    PERFORM public.batch_stage_start({sel_stage});",
                "  END IF;",
                "END $mfg$;",
            )
            stage_count += 1

            #  readings, each by the person the source says recorded it
            mine = [r for r in readings if r["batch_stage_id"] == bs["id"]]
            mine.sort(key=lambda r: (r["parameter_name"], r.get("sample_sequence") or 0))
            for r in mine:
                fp = next((p for p in fparams.values()
                           if p["stage_id"] == fstage["id"]
                           and p["parameter_name"] == r["parameter_name"]), None)
                if fp is None:
                    skipped.append(
                        f"reading {r['parameter_name']} on {bs['stage_name']}: "
                        "no formula parameter defines it")
                    continue
                rec = who.get(r["recorded_by"])
                if rec is None:
                    skipped.append(f"reading {r['parameter_name']}: recorder unknown")
                    continue
                s.as_actor(rec["local_id"], f"{rec['email']} ({rec['role_key']})")
                #  An out-of-specification reading must be acknowledged, and
                #  the source names the supervisor who authorised it.
                oos = "true" if r.get("is_within_spec") is False else "false"
                s.say(
                    "DO $mfg$ BEGIN",
                    f"  IF (SELECT status FROM public.batch_stages WHERE id = {sel_stage})"
                    " = 'in_progress'",
                    "     AND NOT EXISTS (SELECT 1 FROM public.batch_stage_parameter_readings",
                    f"                     WHERE batch_stage_id = {sel_stage}",
                    f"                       AND formula_parameter_id = {q(fp['id'])}",
                    f"                       AND reading_value = {num(r.get('recorded_value'))}) THEN",
                    "    PERFORM public.batch_stage_record_reading("
                    f"{sel_stage}, {q(fp['id'])}, {num(r.get('recorded_value'))}, NULL, {oos});",
                    "  END IF;",
                    "END $mfg$;",
                )
                reading_count += 1

            #  ── signing, and which of the two flows applies ──────────
            #
            #  The batch_stage lifecycle offers two routes out of
            #  `in_progress`, and which one is correct depends on the stage:
            #
            #    one person   in_progress --[complete]--> complete
            #    two people   in_progress --[sign_operator]--> awaiting_
            #                 verification --[verify]--> complete
            #
            #  A stage whose formula says `requires_dual_signoff` gets the
            #  second. Signing `verify` from `in_progress` is NOT available,
            #  so a single `complete` signature plus a verifier id is
            #  refused with BATCH_STAGE_VERIFIER_REQUIRED — which is how
            #  this was found.
            completer = who.get(bs["completed_by"]) or starter
            verifier = who.get(bs.get("verified_by")) if bs.get("verified_by") else None
            dual = bool(fstage.get("requires_dual_signoff")) and verifier is not None \
                and verifier["local_id"] != completer["local_id"]

            s.as_actor(completer["local_id"], f"{completer['email']} ({completer['role_key']})")
            s.say(
                "CREATE TEMP TABLE IF NOT EXISTS _mfg_sig(k text PRIMARY KEY, v uuid);",
                "DELETE FROM _mfg_sig;",
            )
            op_action = "sign_operator" if dual else "complete"
            s.say(
                "INSERT INTO _mfg_sig(k, v) SELECT 'op', ((public.sign_electronic_record("
                f"{q(b['company_id'])}, 'batch_stage', {sel_stage}, {q(op_action)}, "
                f"{q(MEANING_OPERATOR)}, :'demo_password', "
                f"{q('Stage executed: ' + bs['stage_name'])}))->>'signature_id')::uuid"
                f" WHERE (SELECT status FROM public.batch_stages WHERE id = {sel_stage})"
                " = 'in_progress';",
            )
            sig_count += 1

            if dual:
                #  The operator's signature moves the stage to awaiting
                #  verification; it does not complete it.
                s.say(
                    "DO $mfg$ BEGIN",
                    "  IF EXISTS (SELECT 1 FROM _mfg_sig WHERE k = 'op' AND v IS NOT NULL) THEN",
                    f"    PERFORM public.batch_stage_sign_operator({sel_stage}, "
                    "(SELECT v FROM _mfg_sig WHERE k='op'));",
                    "  END IF;",
                    "END $mfg$;",
                )
                #  A SECOND person, who the source names, signs the
                #  verification. batch_stage_verify refuses the operator.
                s.as_actor(verifier["local_id"], f"{verifier['email']} ({verifier['role_key']})")
                s.say(
                    "INSERT INTO _mfg_sig(k, v) SELECT 'ver', ((public.sign_electronic_record("
                    f"{q(b['company_id'])}, 'batch_stage', {sel_stage}, 'verify', "
                    f"{q(MEANING_VERIFIER)}, :'demo_password', "
                    f"{q('Stage verified: ' + bs['stage_name'])}))->>'signature_id')::uuid"
                    f" WHERE (SELECT status FROM public.batch_stages WHERE id = {sel_stage})"
                    " = 'awaiting_verification';",
                )
                sig_count += 1
                s.say(
                    "DO $mfg$ BEGIN",
                    "  IF EXISTS (SELECT 1 FROM _mfg_sig WHERE k = 'ver' AND v IS NOT NULL) THEN",
                    f"    PERFORM public.batch_stage_verify({sel_stage}, "
                    "(SELECT v FROM _mfg_sig WHERE k='ver'));",
                    "  END IF;",
                    "END $mfg$;",
                )
            else:
                s.say(
                    "DO $mfg$ BEGIN",
                    "  IF EXISTS (SELECT 1 FROM _mfg_sig WHERE k = 'op' AND v IS NOT NULL) THEN",
                    f"    PERFORM public.batch_stage_complete({sel_stage}, "
                    "(SELECT v FROM _mfg_sig WHERE k='op'));",
                    "  END IF;",
                    "END $mfg$;",
                )

    s.say("", "RESET ROLE;", "SELECT set_config('request.jwt.claims', NULL, false);", "")

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    (out / "20_demo_manufacture.sql").write_text("\n".join(s.lines) + "\n")

    report = [
        "# Manufacturing plan", "",
        "Generated by `scripts/seed/demo/manufacture.py`. Every line of the SQL",
        "it emits is an application RPC; nothing is inserted into the three",
        "batch tables directly.", "",
        "| step | count |", "|---|---|",
        f"| products driven to `active` | {len(wanted)} |",
        f"| batches initiated | {len(planned_batches)} |",
        f"| stages started and completed | {stage_count} |",
        f"| in-process readings recorded | {reading_count} |",
        f"| electronic signatures produced by the application | {sig_count} |",
        "",
        "## Not attempted, and why", "",
    ]
    if skipped:
        seen = set()
        for line in skipped:
            if line not in seen:
                report.append(f"- {line}")
                seen.add(line)
    else:
        report.append("- nothing")
    (out / "MANUFACTURE_PLAN.md").write_text("\n".join(report) + "\n")

    print(f"wrote {out / '20_demo_manufacture.sql'}")
    print(f"  products  {len(wanted)}   batches {len(planned_batches)}   "
          f"stages {stage_count}   readings {reading_count}   signatures {sig_count}")
    if skipped:
        print(f"  {len(set(skipped))} thing(s) not attempted — see MANUFACTURE_PLAN.md")


if __name__ == "__main__":
    main()
