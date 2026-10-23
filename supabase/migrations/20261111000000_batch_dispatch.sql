-- Where a released batch went — PM-03's `Distribution` column, and the
-- far end of a trace.
--
-- ── TWO GAPS THAT TURN OUT TO BE ONE ──
--
-- PM-03 tabulates eleven sections. Ten of them have a page. The
-- eleventh, `Distribution`, is Act for the Storekeeper and View for
-- five more roles, and NOTHING IN THIS CODEBASE
-- ANSWERS TO IT — a storekeeper holds Act on a section they cannot
-- open. DB-02's drawn rail carries a *Dispatch* item for exactly this
-- and the derived rail had nowhere to send it.
--
-- Separately, docs/figma-conflicts.md entry 17: a trace can be walked
-- backwards from a batch to its lots to their suppliers, and forwards
-- from a lot into the batches that used it — and then it stops dead at
-- release. `shipments` carries a sender, a recipient, two countries, a
-- weight and a declared value, and has no batch_id. No table connected
-- a batch to a customer, an order or a consignment, so "which
-- customers received this batch" had no answer.
--
-- They are the same gap. Giving Distribution a record gives the trace
-- its other end.
--
-- ── WHAT IS DELIBERATELY SMALL ABOUT THIS ──
--
-- There is no Figma frame for a dispatch screen, so this records the
-- few facts a recall needs and nothing more: which batch, how much,
-- where it went, when, and who sent it. It is not an order management
-- model and should not grow into one without a design.
--
-- ── ONLY A RELEASED BATCH ──
--
-- The central rule, and the reason this is a table with a trigger
-- rather than a form. Dispatching a batch that QA has not released is
-- the failure the whole release gate exists to prevent, arriving by a
-- different door. Checked against the lifecycle mirror, not against a
-- flag this table keeps.


CREATE TABLE IF NOT EXISTS public.batch_dispatches (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  batch_id       uuid NOT NULL REFERENCES public.batch_records(id) ON DELETE RESTRICT,
  --  Who received it. Free text because there is no customer model and
  --  inventing one here would be the order management this is not.
  destination    text NOT NULL CHECK (btrim(destination) <> ''),
  --  Their reference — a delivery note, an order number. What somebody
  --  quotes when they ring about a recall.
  reference      text,
  quantity       numeric NOT NULL CHECK (quantity > 0),
  unit           text NOT NULL CHECK (btrim(unit) <> ''),
  dispatched_at  timestamptz NOT NULL DEFAULT now(),
  dispatched_by  uuid,
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS batch_dispatches_batch_idx
  ON public.batch_dispatches (batch_id);
CREATE INDEX IF NOT EXISTS batch_dispatches_company_idx
  ON public.batch_dispatches (company_id, dispatched_at DESC);

COMMENT ON TABLE public.batch_dispatches IS
  'Where a released batch went. The forward end of a trace: a recall is scoped from these rows. Deliberately minimal — not an order model.';

ALTER TABLE public.batch_dispatches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS batch_dispatches_select ON public.batch_dispatches;
CREATE POLICY batch_dispatches_select ON public.batch_dispatches
  FOR SELECT TO authenticated
  USING (public.app_is_company_member(company_id));

--  The write policy admits members and the TRIGGER decides the cell, so
--  a refusal is a sentence rather than a row that silently does not
--  appear. certificate_of_analysis taught that one: a policy that
--  filters the caller out means the guard never runs and an excluded
--  caller sees no error at all.
DROP POLICY IF EXISTS batch_dispatches_insert ON public.batch_dispatches;
CREATE POLICY batch_dispatches_insert ON public.batch_dispatches
  FOR INSERT TO authenticated
  WITH CHECK (public.app_is_company_member(company_id));

--  UPDATE and DELETE are admitted by the policy and REFUSED BY THE
--  TRIGGER, which is not the same as leaving them unpoliced.
--
--  With no policy at all, row level security filters the row out and
--  the statement succeeds having changed nothing — a caller trying to
--  edit a dispatch record would see no error. The immutability trigger
--  would never run and could never say why. Admitting the row so the
--  trigger can refuse it in words costs nothing, because the trigger
--  refuses every update and every delete unconditionally.


-- ── The gate ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_batch_dispatch_gate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_status text; v_company uuid; v_number text;
BEGIN
  SELECT status, company_id, batch_number
    INTO v_status, v_company, v_number
    FROM public.batch_records WHERE id = NEW.batch_id;

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'DISPATCH_NO_BATCH: no such batch record' USING ERRCODE = 'P0002';
  END IF;
  IF v_company <> NEW.company_id THEN
    RAISE EXCEPTION 'DISPATCH_BATCH_FOREIGN: that batch belongs to another company'
      USING ERRCODE = 'P0001';
  END IF;

  --  PM-03's `Distribution` column. Act: Storekeeper.
  PERFORM public.app_assert_section_act(NEW.company_id, 'distribution');

  --  THE RULE THIS TABLE EXISTS AROUND. Read from the batch's own
  --  state, which is a mirror of the lifecycle engine and read-only to
  --  direct writes, so it cannot be set by whoever is dispatching.
  IF v_status <> 'released' THEN
    RAISE EXCEPTION
      'DISPATCH_NOT_RELEASED: batch % is %, and only a released batch may be dispatched',
      v_number, v_status USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_batch_dispatch_gate ON public.batch_dispatches;
CREATE TRIGGER trg_batch_dispatch_gate
  BEFORE INSERT ON public.batch_dispatches
  FOR EACH ROW EXECUTE FUNCTION public.fn_batch_dispatch_gate();


DROP POLICY IF EXISTS batch_dispatches_no_edit ON public.batch_dispatches;
CREATE POLICY batch_dispatches_no_edit ON public.batch_dispatches
  FOR UPDATE TO authenticated
  USING (public.app_is_company_member(company_id))
  WITH CHECK (public.app_is_company_member(company_id));

DROP POLICY IF EXISTS batch_dispatches_no_delete ON public.batch_dispatches;
CREATE POLICY batch_dispatches_no_delete ON public.batch_dispatches
  FOR DELETE TO authenticated
  USING (public.app_is_company_member(company_id));


-- ── A dispatch is a fact, not a draft ───────────────────────────────
--
-- It records that goods left the building. Correcting one is a new
-- record and a note, the same reasoning as a batch reading: both
-- numbers survive, because the first one is what somebody acted on.

CREATE OR REPLACE FUNCTION public.fn_batch_dispatches_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION
    'DISPATCH_IMMUTABLE: a dispatch record cannot be % — record a correcting dispatch instead',
    lower(TG_OP) USING ERRCODE = 'P0001';
END;
$$;

DROP TRIGGER IF EXISTS trg_batch_dispatches_immutable ON public.batch_dispatches;
CREATE TRIGGER trg_batch_dispatches_immutable
  BEFORE UPDATE OR DELETE ON public.batch_dispatches
  FOR EACH ROW EXECUTE FUNCTION public.fn_batch_dispatches_immutable();


-- ── The forward trace ───────────────────────────────────────────────
--
-- Shaped so a recall screen asks one question and gets an answer that
-- names destinations rather than ids.

CREATE OR REPLACE FUNCTION public.batch_dispatch_trace(p_batch_id uuid)
RETURNS TABLE(dispatch_id uuid, destination text, reference text,
              quantity numeric, unit text, dispatched_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT d.id, d.destination, d.reference, d.quantity, d.unit, d.dispatched_at
    FROM public.batch_dispatches d
    JOIN public.batch_records b ON b.id = d.batch_id
   WHERE d.batch_id = p_batch_id
     AND (public.app_is_service_context() OR public.app_is_company_member(b.company_id))
   ORDER BY d.dispatched_at DESC;
$$;

REVOKE ALL ON FUNCTION public.batch_dispatch_trace(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.batch_dispatch_trace(uuid) TO authenticated, service_role;


-- ── What this file assumes ──────────────────────────────────────────

DO $assert$
DECLARE v_actors text;
BEGIN
  SELECT string_agg(role, ', ' ORDER BY role) INTO v_actors
    FROM public.section_permissions WHERE section = 'distribution' AND access = 'act';
  IF v_actors IS NULL THEN
    RAISE EXCEPTION
      'DISPATCH_SECTION_HAS_NO_ACTORS: no role holds act on distribution, so this guard would refuse everyone';
  END IF;

  --  'released' must be a state a batch can actually reach, or the gate
  --  refuses every dispatch forever — the dead-guard failure
  --  20261105000000 was written about.
  IF NOT EXISTS (
    SELECT 1 FROM public.lifecycle_states s
      JOIN public.lifecycle_definitions d ON d.id = s.definition_id
     WHERE d.entity_type = 'batch_record' AND s.state_key = 'released')
  THEN
    RAISE EXCEPTION
      'DISPATCH_GUARDED_STATE_MISSING: batch_record has no released state, so nothing could ever be dispatched';
  END IF;
END;
$assert$;
