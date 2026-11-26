-- =====================================================================
--  FACILITY LOGS, PART 2 — SETTING UP A ZONE (W6·29, FL-02)
--
--  20261204000000 built the register, the recording of a reading and
--  the per-zone history. It left one thing out, and the omission made
--  the feature unusable rather than incomplete: there was no way to
--  CREATE a zone or a scheduled test. On a company that had never been
--  seeded, FL-01 showed its empty state permanently and no amount of
--  using the product could move it off that state.
--
--  FL-02 is the screen for this. It is drawn, so nothing here is
--  invented: the zone panel has a name, a code, a grade, a line, the
--  equipment, the cleaning SOP, an owner, the two overdue fields, and
--  beneath it the zone's scheduled tests with their frequency and
--  limits. This migration adds the server-side integrity those writes
--  need, and nothing else.
--
--  ── WHAT IS ENFORCED, AND WHY HERE ──
--
--  A zone names a SITE, and `sites` is itself company-scoped. So a
--  caller sending their own `company_id` with another company's
--  `site_id` would place a zone of theirs inside somebody else's
--  plant, and RLS would not stop it: the row's company_id is their
--  own, which is all the policy examines. That is the same defect
--  class the entry trigger in 20261204000000 already closes for
--  zone_id and schedule_id, extended to the one FK that migration did
--  not reach.
--
--  A schedule names a ZONE, and carries its own company_id, so it has
--  the identical hole. Closed the identical way.
--
--  ── WHAT IS DELIBERATELY NOT ENFORCED ──
--
--  FL-02 draws "Alert the owner after (days overdue)" above "Escalate
--  to QA Manager after (days)". It is tempting to require the
--  escalation to fall on or after the owner alert, and the column
--  defaults (0 and 1) read that way. The design states no such rule,
--  and a company that wants QA told first is not obviously wrong, so
--  the ordering is left unconstrained. The limits CHECK in
--  20261204000000 is a different case: an action limit below its alert
--  limit inverts the meaning of every result measured against it,
--  which is arithmetic rather than policy.
--
--  Nothing here adds a sign-off, a signature or an automatic
--  deviation. Those remain undrawn and therefore unbuilt.
-- =====================================================================

-- ── 1. A zone belongs to a site of its own company ───────────────────

/**
 *  BEFORE INSERT OR UPDATE on facility_zones.
 *
 *  Two integrity rules and one housekeeping touch. The blank-name
 *  check follows `sites_name_not_blank_chk` from 20261019000000:
 *  `name` is NOT NULL and unique per site, so without it a single
 *  zone named '' or '   ' could be created and then never named again.
 */
CREATE OR REPLACE FUNCTION public.fn_facility_zone_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_site_company uuid;
BEGIN
  IF btrim(coalesce(NEW.name, '')) = '' THEN
    RAISE EXCEPTION 'FACILITY_ZONE_NAME_REQUIRED';
  END IF;

  /*
   *  WHICH OF THESE TWO FIRES DEPENDS ON WHO IS ASKING, and that is
   *  worth stating because the first draft of this trigger got it
   *  wrong and the test suite caught it.
   *
   *  The function is SECURITY INVOKER, so this lookup runs under the
   *  caller's own RLS. For an ordinary authenticated user, another
   *  company's site is not merely wrong — it is INVISIBLE, so the
   *  SELECT finds nothing and the NOT_FOUND branch is the one that
   *  refuses the write. WRONG_COMPANY cannot fire for them.
   *
   *  It is still reachable, and still needed, in a context that
   *  bypasses RLS: the service role, a migration, or anything running
   *  as the table owner. There the row IS visible, so the company
   *  mismatch is what has to stop it.
   *
   *  The alternative — a SECURITY DEFINER helper so the trigger could
   *  always tell "does not exist" from "belongs to someone else" —
   *  was rejected. It would read every company's sites in order to
   *  improve an error message, and the message itself would then
   *  confirm to any caller whether an arbitrary site id exists in
   *  somebody else's company. Refusing both cases is the same
   *  security outcome without that.
   */
  SELECT s.company_id INTO v_site_company
    FROM public.sites s
   WHERE s.id = NEW.site_id;

  IF v_site_company IS NULL THEN
    --  Reads as "no site you can see has that id", which is the
    --  honest statement of what was checked.
    RAISE EXCEPTION 'FACILITY_SITE_NOT_FOUND';
  END IF;

  IF v_site_company <> NEW.company_id THEN
    RAISE EXCEPTION 'FACILITY_SITE_WRONG_COMPANY';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_facility_zone_integrity ON public.facility_zones;
CREATE TRIGGER trg_facility_zone_integrity
  BEFORE INSERT OR UPDATE ON public.facility_zones
  FOR EACH ROW EXECUTE FUNCTION public.fn_facility_zone_integrity();


-- ── 2. A schedule belongs to a zone of its own company ───────────────

/**
 *  BEFORE INSERT OR UPDATE on facility_zone_schedules.
 *
 *  `description` is what FL-01 prints under the log type on every row
 *  ("Air · settle plates, 4 positions"), so a blank one leaves the
 *  register with an unlabelled line.
 */
CREATE OR REPLACE FUNCTION public.fn_facility_schedule_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_zone_company uuid;
BEGIN
  IF btrim(coalesce(NEW.description, '')) = '' THEN
    RAISE EXCEPTION 'FACILITY_SCHEDULE_DESCRIPTION_REQUIRED';
  END IF;

  --  Same split as the zone trigger above, for the same reason: under
  --  the caller's RLS another company's zone is invisible, so
  --  NOT_FOUND is what an ordinary user gets and WRONG_COMPANY is the
  --  backstop for RLS-bypassing contexts.
  SELECT z.company_id INTO v_zone_company
    FROM public.facility_zones z
   WHERE z.id = NEW.zone_id;

  IF v_zone_company IS NULL THEN
    RAISE EXCEPTION 'FACILITY_ZONE_NOT_FOUND';
  END IF;

  IF v_zone_company <> NEW.company_id THEN
    RAISE EXCEPTION 'FACILITY_SCHEDULE_WRONG_COMPANY';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_facility_schedule_integrity ON public.facility_zone_schedules;
CREATE TRIGGER trg_facility_schedule_integrity
  BEFORE INSERT OR UPDATE ON public.facility_zone_schedules
  FOR EACH ROW EXECUTE FUNCTION public.fn_facility_schedule_integrity();


-- ── 3. Sites a zone may be placed in ─────────────────────────────────

/**
 *  FL-02's site selector. `sites` carries its own RLS, so this exists
 *  only to spare the client a second table import for two columns.
 *  SECURITY INVOKER: the caller's own policies decide what comes back.
 */
CREATE OR REPLACE FUNCTION public.facility_site_options(p_company_id uuid)
RETURNS TABLE (id uuid, name text, site_type text)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT s.id, s.name, s.site_type
    FROM public.sites s
   WHERE s.company_id = p_company_id
   ORDER BY s.name
$$;

GRANT EXECUTE ON FUNCTION public.facility_site_options(uuid) TO authenticated;
