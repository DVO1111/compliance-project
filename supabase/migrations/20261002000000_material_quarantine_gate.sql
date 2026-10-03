-- =====================================================================
--  WEEK 3 / ITEM 04 — MATERIAL QUARANTINE GATE
-- =====================================================================
--  Waits on item 03. Four requirements, and the interesting part of each
--  is where the enforcement actually lives.
--
--  1. Receipt creates a lot in quarantine automatically.
--     Already true: item 03's AFTER INSERT trigger calls
--     lifecycle_initialize(), and quarantine is the definition's initial
--     state. Asserted again here so the guarantee is covered by this
--     item's own tests rather than only by item 03's.
--
--  2. Material in quarantine cannot be dispensed, as a hard block at the
--     service layer.
--
--     The specification says "service layer", and its NOT DONE IF says
--     "the block exists only in the interface". Taken literally, a check
--     in src/lib/ satisfies the first and fails the spirit of the second:
--     the browser holds the anon key and talks to PostgREST directly, so
--     a TypeScript guard is bypassable by anyone who opens a console. It
--     is a usability feature, not a control.
--
--     So the block is here, in the database, as a function that RAISES —
--     and the service layer calls it. That gives the stated service-layer
--     method and its unit test (see materialDispensingService.ts and
--     src/tests/materialDispensing.test.ts) while making the block real
--     for callers who never go through that service at all.
--
--  3. Material cannot be received from a supplier in a disqualified
--     state. Enforced by a BEFORE INSERT trigger on material_lots.
--
--  4. Approaching retest date raises an alert; passing retest date
--     returns the lot to quarantine automatically, with no manual action.
--
--     "Automatically" is the whole requirement, so it is not left to a
--     scheduled job alone. material_lot_retest_sweep() does the reversion
--     and the alerting and is registered with pg_cron where pg_cron
--     exists — but the dispensing gate ALSO re-derives the retest state
--     at the moment it is asked. If the sweep has not run yet, a lot past
--     its retest date is still refused. The sweep moves the record; the
--     gate is what makes the guarantee independent of it.
--
--     That ordering matters. A gate that trusted material_lots.status
--     alone would hand out material for as long as the sweep was late,
--     which is exactly the window a nightly job creates.
-- =====================================================================


-- ── 1. Alert policy ──────────────────────────────────────────────────
--  "Approaching" needs a threshold, and a hardcoded one is a number
--  nobody can change without a deployment. One row per company, with a
--  documented fallback when there is no row.
CREATE TABLE IF NOT EXISTS public.material_alert_policies (
  company_id        uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  retest_lead_days  integer     NOT NULL DEFAULT 30,
  expiry_lead_days  integer     NOT NULL DEFAULT 60,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT material_alert_policies_retest_chk CHECK (retest_lead_days BETWEEN 0 AND 365),
  CONSTRAINT material_alert_policies_expiry_chk CHECK (expiry_lead_days BETWEEN 0 AND 730)
);

COMMENT ON TABLE public.material_alert_policies IS
  'Per-company lead times for material alerts. A company with no row gets the defaults from material_alert_lead_days().';

CREATE OR REPLACE FUNCTION public.material_alert_lead_days(p_company_id uuid)
RETURNS TABLE (retest_lead_days integer, expiry_lead_days integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  --  30 and 60 are the fallback, not the rule. They apply only until a
  --  company sets its own, and they are stated in one place so the two
  --  callers below cannot disagree about them.
  SELECT coalesce(p.retest_lead_days, 30), coalesce(p.expiry_lead_days, 60)
    FROM (SELECT p_company_id AS cid) q
    LEFT JOIN public.material_alert_policies p ON p.company_id = q.cid
   WHERE public.app_is_service_context() OR public.app_is_company_member(p_company_id);
$$;

COMMENT ON FUNCTION public.material_alert_lead_days(uuid) IS
  'Alert lead times for a company, falling back to 30/60 days. SECURITY DEFINER, so it checks membership itself.';

REVOKE ALL ON FUNCTION public.material_alert_lead_days(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.material_alert_lead_days(uuid) TO authenticated, service_role;


-- ── 2. Alerts ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.material_lot_alerts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  material_lot_id uuid        NOT NULL REFERENCES public.material_lots(id) ON DELETE CASCADE,
  alert_type      text        NOT NULL,
  --  The date the alert is about, which is what makes it unique: a lot
  --  whose retest date moves gets a new alert rather than a duplicate of
  --  the old one, and a sweep that runs twice a day raises one alert.
  due_date        date        NOT NULL,
  lead_days       integer     NOT NULL,
  raised_at       timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES auth.users(id),
  CONSTRAINT material_lot_alerts_type_chk
    CHECK (alert_type IN ('retest_approaching','retest_due','expiry_approaching','expiry_passed')),
  CONSTRAINT material_lot_alerts_uniq UNIQUE (material_lot_id, alert_type, due_date),
  CONSTRAINT material_lot_alerts_lead_chk CHECK (lead_days >= 0)
);

CREATE INDEX IF NOT EXISTS material_lot_alerts_open_idx
  ON public.material_lot_alerts (company_id, due_date)
  WHERE acknowledged_at IS NULL;


-- ── 3. Receipt is refused from a supplier that cannot supply ─────────
CREATE OR REPLACE FUNCTION public.fn_material_lots_supplier_gate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_status text; v_name text; v_company uuid;
BEGIN
  IF NEW.supplier_id IS NULL THEN
    RETURN NEW;                      -- no supplier named; nothing to check
  END IF;

  SELECT s.qualification_status, s.name, s.company_id
    INTO v_status, v_name, v_company
    FROM public.suppliers s WHERE s.id = NEW.supplier_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'MATERIAL_RECEIPT_NO_SUPPLIER: supplier % does not exist', NEW.supplier_id
      USING ERRCODE = 'P0002';
  END IF;

  --  A supplier belonging to another tenant would otherwise let one
  --  company's receipt be gated by another company's qualification data.
  IF v_company <> NEW.company_id THEN
    RAISE EXCEPTION 'MATERIAL_RECEIPT_CROSS_COMPANY: supplier % belongs to another company', NEW.supplier_id
      USING ERRCODE = 'P0001';
  END IF;

  --  The specification names 'disqualified'. 'suspended' is included
  --  because a suspension that does not stop receipt is not a
  --  suspension — it is a note. 'pending' is deliberately NOT blocked:
  --  nothing asked for it, and refusing receipt from an un-assessed
  --  supplier would stop a company entering its existing stock on the
  --  day it starts using the system. Qualification is then a thing they
  --  work through, not a wall on arrival.
  IF v_status IN ('disqualified','suspended') THEN
    RAISE EXCEPTION 'MATERIAL_RECEIPT_SUPPLIER_BLOCKED: % is %; material cannot be received from this supplier',
                    v_name, v_status
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_material_lots_supplier_gate ON public.material_lots;
--  Fires after trg_material_lots_defaults (alphabetical order among
--  BEFORE triggers on the same event), so the lot number has already
--  been issued. That is intentional: a refused receipt should not
--  silently consume a number from the company's sequence... and it does
--  not, because the exception rolls the whole statement back including
--  the counter advance. Both happen in one transaction.
CREATE TRIGGER trg_material_lots_supplier_gate
  BEFORE INSERT ON public.material_lots
  FOR EACH ROW EXECUTE FUNCTION public.fn_material_lots_supplier_gate();


-- ── 4. The dispensing gate ───────────────────────────────────────────
--  Returns NULL when the lot may be dispensed, or a sentence saying why
--  not. Modelled on licence_block_reason() from D06: the message names
--  the record, the state and the cause, so a screen can show the reason
--  rather than an unexplained disabled button.
CREATE OR REPLACE FUNCTION public.material_lot_block_reason(
  p_lot_id    uuid,
  p_quantity  numeric DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE l record;
BEGIN
  SELECT ml.id, ml.company_id, ml.lot_number, ml.status, ml.retest_due_date,
         ml.supplier_expiry_date, ml.quantity_available, ml.unit_of_measure,
         m.name AS material_name, m.requires_further_processing
    INTO l
    FROM public.material_lots ml
    JOIN public.materials m ON m.id = ml.material_id
   WHERE ml.id = p_lot_id;

  IF l.id IS NULL THEN
    RETURN 'This material lot does not exist.';
  END IF;

  --  SECURITY DEFINER, so RLS does not hide another tenant's lot from
  --  it. It refuses rather than reporting on a record the caller may not
  --  see — and refuses by RAISING, because a NULL return here reads as
  --  "dispensable" to every caller.
  IF NOT public.app_is_service_context()
     AND NOT public.app_is_company_member(l.company_id) THEN
    RAISE EXCEPTION 'MATERIAL_FORBIDDEN: caller is not a member of the owning company'
      USING ERRCODE = 'P0001';
  END IF;

  --  Retest is checked BEFORE status, and against the date rather than
  --  the stored state. material_lot_retest_sweep() moves such a lot back
  --  to quarantine, but it runs on a schedule; until it does, the lot
  --  still reads 'approved'. Deriving it here is what makes the block
  --  independent of whether the sweep has run.
  IF l.retest_due_date IS NOT NULL AND l.retest_due_date < current_date THEN
    RETURN format('Lot %s of %s passed its retest date on %s and has returned to quarantine. It cannot be dispensed until it is retested and released.',
                  l.lot_number, l.material_name, to_char(l.retest_due_date,'DD Mon YYYY'));
  END IF;

  IF l.supplier_expiry_date IS NOT NULL AND l.supplier_expiry_date < current_date THEN
    RETURN format('Lot %s of %s expired on %s and cannot be dispensed.',
                  l.lot_number, l.material_name, to_char(l.supplier_expiry_date,'DD Mon YYYY'));
  END IF;

  IF l.status <> 'approved' THEN
    RETURN format('Lot %s of %s is %s and cannot be dispensed. Only approved material may be dispensed.',
                  l.lot_number, l.material_name,
                  CASE l.status
                    WHEN 'quarantine' THEN 'in quarantine'
                    WHEN 'under_test' THEN 'under test'
                    WHEN 'on_hold'    THEN 'on hold'
                    WHEN 'rejected'   THEN 'rejected'
                    WHEN 'expired'    THEN 'expired'
                    WHEN 'exhausted'  THEN 'exhausted'
                    ELSE l.status
                  END);
  END IF;

  --  Approved but not yet in a usable form. Carried on the material, so
  --  it applies to every lot of it.
  IF l.requires_further_processing THEN
    RETURN format('Lot %s of %s requires further processing before it can be dispensed.',
                  l.lot_number, l.material_name);
  END IF;

  IF p_quantity IS NOT NULL THEN
    IF p_quantity <= 0 THEN
      RETURN 'A dispensing quantity must be greater than zero.';
    END IF;
    IF l.quantity_available IS NULL OR l.quantity_available < p_quantity THEN
      RETURN format('Lot %s of %s has %s %s available, which is less than the %s %s requested.',
                    l.lot_number, l.material_name,
                    coalesce(l.quantity_available,0), coalesce(l.unit_of_measure,''),
                    p_quantity, coalesce(l.unit_of_measure,''));
    END IF;
  END IF;

  --  Item 05 adds "a lot cannot be released while its certificate is
  --  unverified", and item 06 adds the test gates. Both belong here, in
  --  this function, so there stays one place that answers the question.
  RETURN NULL;
END $$;

COMMENT ON FUNCTION public.material_lot_block_reason(uuid,numeric) IS
  'NULL when a lot may be dispensed, otherwise a sentence naming the lot and the reason. Re-derives retest and expiry from dates rather than trusting the status mirror, so the answer does not depend on the sweep having run.';

REVOKE ALL ON FUNCTION public.material_lot_block_reason(uuid,numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.material_lot_block_reason(uuid,numeric) TO authenticated, service_role;


--  The hard block. Week 5's dispensing calls this; it raises, so a caller
--  that ignores the return value still cannot proceed.
CREATE OR REPLACE FUNCTION public.material_lot_assert_dispensable(
  p_lot_id   uuid,
  p_quantity numeric DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_reason text;
BEGIN
  v_reason := public.material_lot_block_reason(p_lot_id, p_quantity);
  IF v_reason IS NOT NULL THEN
    RAISE EXCEPTION 'MATERIAL_DISPENSE_BLOCKED: %', v_reason
      USING ERRCODE = 'P0001';
  END IF;
END $$;

COMMENT ON FUNCTION public.material_lot_assert_dispensable(uuid,numeric) IS
  'Raises MATERIAL_DISPENSE_BLOCKED unless the lot may be dispensed. The hard block referred to by Week 3 item 04; dispensing itself arrives in Week 5 and must call this.';

REVOKE ALL ON FUNCTION public.material_lot_assert_dispensable(uuid,numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.material_lot_assert_dispensable(uuid,numeric) TO authenticated, service_role;


-- ── 5. Retest alerting and automatic reversion ───────────────────────
--  One function does both, because they are two readings of the same
--  date and splitting them invites one to run without the other.
--
--  Idempotent: the alert table's unique constraint absorbs a repeat, and
--  the reversion only touches lots that are still 'approved'.
CREATE OR REPLACE FUNCTION public.material_lot_retest_sweep(
  p_company_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  r              record;
  v_alerts       integer := 0;
  v_reverted     integer := 0;
  v_retest_lead  integer;
  v_expiry_lead  integer;
BEGIN
  --  A caller may sweep their own company, or — as the scheduler, which
  --  runs as the table owner with no JWT — every company.
  IF p_company_id IS NOT NULL
     AND NOT public.app_is_service_context()
     AND NOT public.app_is_company_member(p_company_id) THEN
    RAISE EXCEPTION 'MATERIAL_FORBIDDEN: caller is not a member of the named company'
      USING ERRCODE = 'P0001';
  END IF;
  IF p_company_id IS NULL AND NOT public.app_is_service_context() THEN
    RAISE EXCEPTION 'MATERIAL_FORBIDDEN: sweeping every company requires the service context'
      USING ERRCODE = 'P0001';
  END IF;

  --  (a) Reversion first. A lot past its retest date goes back to
  --      quarantine through the engine, so the move has a history row
  --      and an actor, rather than a status overwrite. This is the
  --      "returns the lot to quarantine automatically" requirement, and
  --      it is why 'retest_due' exists as a declared transition.
  FOR r IN
    SELECT ml.id, ml.company_id, ml.retest_due_date
      FROM public.material_lots ml
     WHERE ml.status = 'approved'
       AND ml.retest_due_date IS NOT NULL
       AND ml.retest_due_date < current_date
       AND (p_company_id IS NULL OR ml.company_id = p_company_id)
  LOOP
    BEGIN
      PERFORM public.lifecycle_transition(
        'material_lot', r.id, 'retest_due', r.company_id, NULL,
        format('Retest date %s passed; returned to quarantine automatically.',
               to_char(r.retest_due_date,'DD Mon YYYY')));
      v_reverted := v_reverted + 1;
    EXCEPTION WHEN others THEN
      --  One lot that cannot be moved must not abandon the rest of the
      --  sweep. The alert below still fires for it, so it does not go
      --  quiet.
      NULL;
    END;

    INSERT INTO public.material_lot_alerts
      (company_id, material_lot_id, alert_type, due_date, lead_days)
    VALUES (r.company_id, r.id, 'retest_due', r.retest_due_date, 0)
    ON CONFLICT (material_lot_id, alert_type, due_date) DO NOTHING;
    v_alerts := v_alerts + 1;
  END LOOP;

  --  (b) Approaching retest, and approaching supplier expiry.
  FOR r IN
    SELECT ml.id, ml.company_id, ml.retest_due_date, ml.supplier_expiry_date, ml.status
      FROM public.material_lots ml
     WHERE ml.status IN ('approved','under_test','quarantine','on_hold')
       AND (p_company_id IS NULL OR ml.company_id = p_company_id)
  LOOP
    SELECT a.retest_lead_days, a.expiry_lead_days
      INTO v_retest_lead, v_expiry_lead
      FROM public.material_alert_lead_days(r.company_id) a;
    v_retest_lead := coalesce(v_retest_lead, 30);
    v_expiry_lead := coalesce(v_expiry_lead, 60);

    IF r.retest_due_date IS NOT NULL
       AND r.retest_due_date >= current_date
       AND r.retest_due_date <= current_date + v_retest_lead THEN
      INSERT INTO public.material_lot_alerts
        (company_id, material_lot_id, alert_type, due_date, lead_days)
      VALUES (r.company_id, r.id, 'retest_approaching', r.retest_due_date, v_retest_lead)
      ON CONFLICT (material_lot_id, alert_type, due_date) DO NOTHING;
      IF FOUND THEN v_alerts := v_alerts + 1; END IF;
    END IF;

    IF r.supplier_expiry_date IS NOT NULL
       AND r.supplier_expiry_date >= current_date
       AND r.supplier_expiry_date <= current_date + v_expiry_lead THEN
      INSERT INTO public.material_lot_alerts
        (company_id, material_lot_id, alert_type, due_date, lead_days)
      VALUES (r.company_id, r.id, 'expiry_approaching', r.supplier_expiry_date, v_expiry_lead)
      ON CONFLICT (material_lot_id, alert_type, due_date) DO NOTHING;
      IF FOUND THEN v_alerts := v_alerts + 1; END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('alerts_raised', v_alerts, 'lots_reverted', v_reverted);
END $$;

COMMENT ON FUNCTION public.material_lot_retest_sweep(uuid) IS
  'Raises approaching-retest and approaching-expiry alerts, and returns lots past their retest date to quarantine through the lifecycle engine. Idempotent. Called nightly; the dispensing gate re-derives retest independently, so correctness does not depend on this having run.';

REVOKE ALL ON FUNCTION public.material_lot_retest_sweep(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.material_lot_retest_sweep(uuid) TO authenticated, service_role;


-- ── 6. Schedule it where a scheduler exists ──────────────────────────
--  pg_cron is present on Supabase and absent from a plain Postgres, so
--  this is guarded: the migration must apply in both places. The sweep is
--  correct whether or not it is scheduled — being late delays an alert,
--  it does not open the gate, because material_lot_block_reason() reads
--  the date rather than the state.
DO $sched$
BEGIN
  IF to_regnamespace('cron') IS NULL THEN
    RAISE NOTICE 'pg_cron not installed; material_lot_retest_sweep() is not scheduled here. Schedule it wherever jobs run.';
    RETURN;
  END IF;

  BEGIN
    PERFORM cron.unschedule('material-lot-retest-sweep');
  EXCEPTION WHEN others THEN NULL;   -- was not scheduled yet
  END;

  --  02:30, after sweep-overdue-obligations at 02:00.
  PERFORM cron.schedule('material-lot-retest-sweep', '30 2 * * *',
                        $job$ SELECT public.material_lot_retest_sweep(); $job$);
END
$sched$;


-- ── 7. RLS, policies and grants ──────────────────────────────────────
ALTER TABLE public.material_alert_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_lot_alerts     ENABLE ROW LEVEL SECURITY;

DO $rls$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['material_alert_policies','material_lot_alerts']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_select', t);
    EXECUTE format($p$CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
                      USING (public.app_is_company_member(company_id))$p$, t||'_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_insert', t);
    EXECUTE format($p$CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
                      WITH CHECK (public.app_is_company_member(company_id))$p$, t||'_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_update', t);
    EXECUTE format($p$CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
                      USING (public.app_is_company_member(company_id))
                      WITH CHECK (public.app_is_company_member(company_id))$p$, t||'_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_delete', t);
    EXECUTE format($p$CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
                      USING (public.app_is_company_member(company_id))$p$, t||'_delete', t);

    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO service_role', t);
  END LOOP;
END
$rls$;

DROP TRIGGER IF EXISTS trg_material_alert_policies_touch ON public.material_alert_policies;
CREATE TRIGGER trg_material_alert_policies_touch
  BEFORE UPDATE ON public.material_alert_policies
  FOR EACH ROW EXECUTE FUNCTION public.fn_materials_touch_updated_at();


-- ── 8. Correcting a description from item 03 ─────────────────────────
--  Item 03 described the supplier `pending` state as "Not yet qualified.
--  Material cannot be received." The gate above deliberately does not
--  block pending, so that description was a claim the code does not make.
UPDATE public.lifecycle_states s
   SET description = 'Not yet assessed. Receipt is allowed; qualification is still outstanding.'
  FROM public.lifecycle_definitions d
 WHERE d.id = s.definition_id
   AND d.entity_type = 'supplier'
   AND d.company_id IS NULL
   AND s.state_key = 'pending';
