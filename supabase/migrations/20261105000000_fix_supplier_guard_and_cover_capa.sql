-- A guard that named a state the lifecycle does not have, and the one
-- entity PM-03 covers that nothing guarded.
--
-- ── 1. THE SUPPLIER GUARD WAS DEAD CODE ──
--
-- 20261104000000 added fn_supplier_approve_role() and had it fire when
-- a supplier reached the state 'approved'. The supplier lifecycle has
-- no such state. Its states are:
--
--     pending · qualified · conditional · suspended · disqualified
--
-- So the trigger was installed, attached, and never once fired.
-- "Approve a supplier" — a PM-03 step reserved to the QA Manager and
-- requiring an e-signature — has been unenforced since that migration
-- claimed to enforce it, which is worse than not having written it: a
-- test asserting the trigger EXISTS passed, and the assertion that it
-- WORKS was never made.
--
-- Qualifying a supplier is the approval. 'conditional' is the same
-- decision with limits attached — a supplier that may be used under
-- conditions is a supplier that has been approved — so both are
-- guarded. 'suspended' and 'disqualified' are withdrawals of approval
-- and are deliberately NOT gated here: stopping the use of a supplier
-- must never be harder than starting it.
--
-- ── 2. CAPA WAS NOT COVERED ──
--
-- capa_record reaches 'closed' and nothing checked who did it. PM-03
-- has no "Close a CAPA" row, but it does put Deviation / CAPA in ONE
-- column, and its step table reserves "Close a deviation" to the QA
-- Officer and QA Manager. Closing the corrective action that came out
-- of a deviation is the same decision by the same people in the same
-- section.
--
-- That is a DERIVATION and it is recorded as one in
-- docs/figma-conflicts.md, not presented as something the design says.
--
-- ── 3. WHAT IS DELIBERATELY STILL UNGUARDED ──
--
-- change_control, sop_document, regulatory_submission,
-- regulatory_licence, licence_variation and product all reach approved
-- or effective or active states, and PM-03 does not tabulate ANY of
-- those sections. There is no column for change control, the SOP
-- library, products or registrations, and no step row for approving
-- one.
--
-- Guarding them would mean inventing a permission rule and enforcing
-- it against working features, which is the opposite of what this
-- repair is for. They are listed in the conflict register with the
-- decision outstanding. Failing closed is the right instinct where
-- authorisation is AMBIGUOUS; it is the wrong one where the design
-- simply does not reach, because the result is removing a feature on a
-- rule nobody wrote.


-- ── The supplier guard, against the states that exist ───────────────

CREATE OR REPLACE FUNCTION public.fn_supplier_approve_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_to text; v_from text; v_company uuid;
BEGIN
  IF NEW.entity_type <> 'supplier' THEN RETURN NEW; END IF;

  SELECT state_key INTO v_to FROM public.lifecycle_states WHERE id = NEW.state_id;
  --  Qualifying IS approving. 'conditional' is approval with limits.
  --  Withdrawals (suspended, disqualified) are not gated: stopping the
  --  use of a supplier must not be harder than starting it.
  IF v_to NOT IN ('qualified', 'conditional') THEN RETURN NEW; END IF;

  IF TG_OP = 'UPDATE' THEN
    SELECT state_key INTO v_from FROM public.lifecycle_states WHERE id = OLD.state_id;
    IF v_from = v_to THEN RETURN NEW; END IF;
  END IF;

  SELECT company_id INTO v_company FROM public.suppliers WHERE id = NEW.entity_id;
  IF v_company IS NULL THEN RETURN NEW; END IF;

  PERFORM public.app_assert_step(v_company, 'supplier_approve');
  RETURN NEW;
END;
$$;


-- ── Closing a CAPA ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_capa_close_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_to text; v_from text; v_company uuid;
BEGIN
  IF NEW.entity_type <> 'capa_record' THEN RETURN NEW; END IF;

  SELECT state_key INTO v_to FROM public.lifecycle_states WHERE id = NEW.state_id;
  IF v_to <> 'closed' THEN RETURN NEW; END IF;

  IF TG_OP = 'UPDATE' THEN
    SELECT state_key INTO v_from FROM public.lifecycle_states WHERE id = OLD.state_id;
    IF v_from = 'closed' THEN RETURN NEW; END IF;
  END IF;

  SELECT company_id INTO v_company FROM public.capa_records WHERE id = NEW.entity_id;
  IF v_company IS NULL THEN RETURN NEW; END IF;

  --  Derived from the deviation step: see the header.
  PERFORM public.app_assert_step(v_company, 'deviation_close');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_capa_close_role ON public.entity_current_state;
CREATE TRIGGER trg_capa_close_role
  BEFORE INSERT OR UPDATE ON public.entity_current_state
  FOR EACH ROW EXECUTE FUNCTION public.fn_capa_close_role();


-- ── A guard that names a state nobody has is not a guard ────────────
--
-- The assertion that would have caught the supplier bug, made part of
-- the schema rather than left to a test somebody might not run. Every
-- state a role guard fires on must exist in the lifecycle definition
-- it belongs to; if one does not, this migration refuses to apply.

DO $assert$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(x.entity_type || '.' || x.state_key, ', ')
    INTO v_missing
    FROM (VALUES
            ('material_lot',  'approved'),
            ('material_lot',  'rejected'),
            ('batch_record',  'released'),
            ('batch_record',  'rejected'),
            ('deviation',     'closed'),
            ('capa_record',   'closed'),
            ('supplier',      'qualified'),
            ('supplier',      'conditional')
         ) AS x(entity_type, state_key)
   WHERE NOT EXISTS (
     SELECT 1
       FROM public.lifecycle_definitions d
       JOIN public.lifecycle_states s ON s.definition_id = d.id
      WHERE d.entity_type = x.entity_type
        AND s.state_key   = x.state_key
   );

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION
      'GUARDED_STATE_MISSING: these guards name states their lifecycle does not have: %',
      v_missing
      USING HINT = 'A guard on a non-existent state never fires and silently leaves the step unenforced.';
  END IF;
END $assert$;
