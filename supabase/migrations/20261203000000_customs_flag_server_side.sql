-- =====================================================================
--  LOGISTICS AND CUSTOMS — move two rules out of the browser
--
--  The Logistics domain (shipments, shipment events, CN22/CN23
--  declarations, contraband rejections, customer flags) is in the pilot
--  by product decision D2. Reviewing it for that turned up two places
--  where a rule the interface enforces is not enforced anywhere else.
--  Both are reachable by a direct API call with an ordinary member's
--  token, because PostgREST exposes these tables for insert and update.
--
--  ── 1. THE CN22 FLAG WAS COMPUTED IN THE BROWSER ──
--
--  `autoFlag()` in src/lib/customsDeclarationService.ts decides whether
--  a declaration is flagged — a CN22 above the GBP 270 threshold, or a
--  contents description too vague for customs — and then the client
--  INSERTS `is_flagged` and `flag_reason` as ordinary columns.
--
--  So the flag was advisory. Anybody posting straight to the table
--  could file a CN22 for GBP 5,000 with `is_flagged: false` and the row
--  would read as reviewed and clean. On a customs declaration that is
--  not a cosmetic problem: the flag is the record that the form was
--  checked against the threshold.
--
--  The rule now lives in `cn_declaration_flag_reason()` and a BEFORE
--  trigger applies it. What the caller sends in those two columns is
--  ignored on insert. The client keeps its copy of the rule so the form
--  can warn before submitting — that is a convenience, and the database
--  no longer depends on it.
--
--  ── 2. CLEARING A FLAG ERASED WHY IT WAS RAISED ──
--
--  `resolveDeclarationFlag()` set `is_flagged = false, flag_reason =
--  NULL`. That loses the only record of what was wrong, and leaves no
--  trace of who decided it was acceptable. A resolution is now an
--  auditable act: `flag_resolved_by` and `flag_resolved_at` are
--  required to clear a flag, `flag_reason` is KEPT, and a flag cannot
--  be cleared while the data still trips the rule unless somebody
--  signs for it.
--
--  ── 3. shipment_events.event_type HAD NO CONSTRAINT ──
--
--  Sixteen event types are declared in TypeScript (`ALL_EVENT_TYPES`)
--  and nowhere else, so the column accepted any string. A shipment
--  history is evidence of custody; a typo or an invented event type
--  silently becomes part of it. A CHECK constraint now holds the same
--  sixteen.
--
--  ── WHAT THIS MIGRATION DOES NOT DO ──
--
--  It does not add a foreign key from these tables' `company_id` to
--  `companies`. Three of them were created without one and existing
--  rows have not been checked against it, so adding it here could fail
--  on live data. Recorded in docs/navigation-decisions.md as outstanding
--  rather than attempted blind.
-- =====================================================================

-- ── 1. The sixteen shipment event types ──────────────────────────────

DO $evt$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'shipment_events_event_type_check'
       AND conrelid = 'public.shipment_events'::regclass
  ) THEN
    --  NOT VALID first, then validated separately: an existing row with
    --  an event type outside the sixteen would otherwise abort the
    --  migration, and on a custody record the right response is to see
    --  the row rather than to lose the deployment.
    ALTER TABLE public.shipment_events
      ADD CONSTRAINT shipment_events_event_type_check
      CHECK (event_type IN (
        'collected', 'departed_origin', 'arrived_hub',
        'customs_export_filed', 'customs_export_cleared',
        'departed_origin_country', 'arrived_destination_country',
        'customs_import_filed', 'customs_import_cleared',
        'out_for_delivery', 'delivered', 'delivery_attempted',
        'returned_to_sender', 'on_hold', 'exception', 'note'
      )) NOT VALID;
  END IF;
END
$evt$;

DO $val$
DECLARE v_bad integer;
BEGIN
  SELECT count(*) INTO v_bad
    FROM public.shipment_events
   WHERE event_type NOT IN (
     'collected', 'departed_origin', 'arrived_hub',
     'customs_export_filed', 'customs_export_cleared',
     'departed_origin_country', 'arrived_destination_country',
     'customs_import_filed', 'customs_import_cleared',
     'out_for_delivery', 'delivered', 'delivery_attempted',
     'returned_to_sender', 'on_hold', 'exception', 'note'
   );

  IF v_bad = 0 THEN
    ALTER TABLE public.shipment_events
      VALIDATE CONSTRAINT shipment_events_event_type_check;
  ELSE
    --  Deliberately a NOTICE and not an exception: the constraint is
    --  already in force for new rows, and the existing ones are named
    --  so somebody can look at them.
    RAISE NOTICE
      'shipment_events: % row(s) carry an event_type outside the sixteen. The constraint is enforced for new rows and left NOT VALID; review those rows, then VALIDATE CONSTRAINT.',
      v_bad;
  END IF;
END
$val$;


-- ── 2. Resolution columns on cn_declarations ─────────────────────────

ALTER TABLE public.cn_declarations
  ADD COLUMN IF NOT EXISTS flag_resolved_by uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS flag_resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS flag_resolution_note text;

COMMENT ON COLUMN public.cn_declarations.flag_resolved_by IS
  'Who accepted a flagged declaration. Required to clear is_flagged; flag_reason is kept so the record still says what was wrong.';


-- ── 3. The rule, in one place ────────────────────────────────────────

/**
 *  The flag reason for a declaration, or NULL when it is clean.
 *
 *  Mirrors autoFlag() in src/lib/customsDeclarationService.ts. The two
 *  copies exist on purpose — the client one lets the form warn before
 *  submitting — and the threshold and the vague-description list are
 *  asserted equal in both src/tests/logisticsCustoms.test.ts and
 *  supabase/tests/logistics_customs_security_test.sql, so a change to
 *  one without the other fails a test rather than drifting.
 *
 *  IMMUTABLE: it reads only its arguments.
 */
CREATE OR REPLACE FUNCTION public.cn_declaration_flag_reason(
  p_declaration_type text,
  p_total_value_gbp  numeric,
  p_contents         text
) RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_declaration_type = 'CN22' AND coalesce(p_total_value_gbp, 0) > 270 THEN
      'Declared value £' || to_char(coalesce(p_total_value_gbp, 0), 'FM999999990.00')
      || ' exceeds the CN22 threshold of £270. A CN23 form is required for items above this value.'
    WHEN lower(btrim(coalesce(p_contents, ''))) IN (
      'items', 'goods', 'stuff', 'personal', 'misc', 'miscellaneous', 'various',
      'personal effects', 'personal belongings', 'clothing', 'gift'
    ) THEN
      'Vague contents description detected. Customs may require a specific itemised description to clear this shipment.'
    ELSE NULL
  END
$$;

REVOKE ALL ON FUNCTION public.cn_declaration_flag_reason(text, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cn_declaration_flag_reason(text, numeric, text)
  TO authenticated, service_role;


-- ── 4. The trigger that makes it authoritative ───────────────────────

CREATE OR REPLACE FUNCTION public.fn_cn_declaration_flag()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_reason text;
BEGIN
  v_reason := public.cn_declaration_flag_reason(
    NEW.declaration_type, NEW.total_value_gbp, NEW.contents_description
  );

  IF TG_OP = 'INSERT' THEN
    --  Whatever the caller sent in these two columns is discarded. That
    --  is the point of the migration.
    NEW.is_flagged  := (v_reason IS NOT NULL);
    NEW.flag_reason := v_reason;
    NEW.flag_resolved_by := NULL;
    NEW.flag_resolved_at := NULL;
    RETURN NEW;
  END IF;

  --  UPDATE. Four cases, kept as separate statements because plpgsql
  --  reads an IF condition only as far as the first THEN, so a CASE
  --  inside one does not compile.

  --  (a) ALREADY RESOLVED, and this has to be tested FIRST.
  --
  --      An earlier version of this trigger tested the "still trips the
  --      rule" case first, and a caller who sent
  --      `flag_resolved_by = NULL` on a resolved row satisfied it: the
  --      flag was re-raised and the resolution was wiped on the way
  --      through, destroying the record of who had accepted the
  --      declaration. Caught by E10 in
  --      supabase/tests/logistics_customs_security_test.sql.
  --
  --      A resolution is evidence. Once recorded it is not editable
  --      here, so every field it consists of is restored from OLD.
  IF OLD.flag_resolved_by IS NOT NULL THEN
    NEW.flag_resolved_by := OLD.flag_resolved_by;
    NEW.flag_resolved_at := OLD.flag_resolved_at;
    NEW.is_flagged       := OLD.is_flagged;
    NEW.flag_reason      := OLD.flag_reason;
    RETURN NEW;
  END IF;

  --  (b) The data still trips the rule and the row is not being
  --      resolved: the flag stands, whatever was sent.
  IF v_reason IS NOT NULL AND NEW.flag_resolved_by IS NULL THEN
    NEW.is_flagged  := true;
    NEW.flag_reason := v_reason;
    RETURN NEW;
  END IF;

  --  (c) A resolution. Somebody is accepting a flagged declaration, so
  --      it has to be attributable and the reason has to survive.
  IF NEW.flag_resolved_by IS NOT NULL AND OLD.flag_resolved_by IS NULL THEN
    IF NOT OLD.is_flagged THEN
      RAISE EXCEPTION
        'CN_FLAG_NOT_RAISED: this declaration is not flagged, so there is nothing to resolve'
        USING ERRCODE = 'P0001';
    END IF;
    NEW.is_flagged       := false;
    --  Kept, not nulled: the record still says what was wrong.
    NEW.flag_reason      := OLD.flag_reason;
    NEW.flag_resolved_at := coalesce(NEW.flag_resolved_at, now());
    RETURN NEW;
  END IF;

  --  (d) The data no longer trips the rule — corrected rather than
  --      accepted — so the flag clears on its own and no resolver is
  --      needed. Case (a) has already returned for a resolved row, so
  --      reaching here means there is no resolution to preserve.
  NEW.is_flagged  := false;
  NEW.flag_reason := NULL;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_cn_declaration_flag ON public.cn_declarations;
CREATE TRIGGER trg_cn_declaration_flag
  BEFORE INSERT OR UPDATE ON public.cn_declarations
  FOR EACH ROW EXECUTE FUNCTION public.fn_cn_declaration_flag();


-- ── 5. Backfill: rows filed while the rule was advisory ──────────────

DO $back$
DECLARE v_fixed integer;
BEGIN
  WITH recomputed AS (
    SELECT id,
           public.cn_declaration_flag_reason(
             declaration_type, total_value_gbp, contents_description
           ) AS reason
      FROM public.cn_declarations
     WHERE flag_resolved_by IS NULL
  )
  UPDATE public.cn_declarations d
     SET is_flagged  = (r.reason IS NOT NULL),
         flag_reason = r.reason
    FROM recomputed r
   WHERE d.id = r.id
     AND (d.is_flagged IS DISTINCT FROM (r.reason IS NOT NULL)
          OR d.flag_reason IS DISTINCT FROM r.reason);

  GET DIAGNOSTICS v_fixed = ROW_COUNT;
  IF v_fixed > 0 THEN
    RAISE NOTICE
      'cn_declarations: % row(s) had a flag that did not match the rule and were recomputed.',
      v_fixed;
  END IF;
END
$back$;
