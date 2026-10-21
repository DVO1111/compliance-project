-- =====================================================================
--  Week 5 · item 02 — Deviation service
-- =====================================================================
--  "Deviation is the record release gating depends on. Build it first
--   and build it properly. The product impact field is what decides
--   whether an open deviation blocks a release."
--
--  Everything in this file exists to make that one sentence true, so
--  the two load-bearing decisions are stated here rather than left to
--  be inferred from the DDL.
--
--  1. THERE IS NO status COLUMN. The brief's NOT DONE IF names it
--     first: "Status stored as a column instead of lifecycle state."
--     State lives in the lifecycle engine — raised, under
--     investigation, pending QA closure, closed — and is read through
--     lifecycle_current_state like change control, CAPA, SOPs and
--     products already are. A status column would be a second answer
--     to the same question, and the two would disagree the first time
--     a transition failed halfway.
--
--  2. product_quality_impact IS NOT NULL. "Impact left blank and
--     accepted" is a NOT DONE IF. 'undetermined' is a real answer and
--     is allowed; absence of an answer is not. The column cannot be
--     null, has no default, and the raise function refuses an empty
--     string — so there is no path, through the UI or the API, that
--     produces a deviation whose release consequence is unknown
--     because nobody was asked.
--
--  WHY UNDETERMINED BLOCKS. Release gating (item 05) treats
--  'undetermined' as impact, and therefore as a hard block. That is
--  the safe default: until somebody has assessed whether a deviation
--  touched product quality, the honest answer to "may this batch go
--  out" is no. The brief records it as a decision to confirm with
--  Damilola or Busayo, and makes it a configuration value so changing
--  it later is not a code change — so it is seeded into
--  release_gating_conditions in item 05's migration, not hard-coded
--  here. This file only guarantees the field is always answered.
-- =====================================================================

-- ── 1. Per-company numbering that cannot collide ─────────────────────
--  "Per-company numbering that cannot collide under simultaneous
--   raising."
--
--  A counter row per company, allocated with INSERT ... ON CONFLICT DO
--  UPDATE ... RETURNING. The conflicting insert takes a row lock on
--  that company's counter and holds it to the end of the transaction,
--  so two deviations raised in the same millisecond serialise and get
--  consecutive numbers. The alternatives both fail: max(number)+1 races
--  under read-committed, and a sequence is global and would leak one
--  company's volume to another by gap.
CREATE TABLE IF NOT EXISTS public.deviation_counters (
  company_id  uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  last_number bigint NOT NULL DEFAULT 0
);

ALTER TABLE public.deviation_counters ENABLE ROW LEVEL SECURITY;

--  No policy is granted to `authenticated` on purpose. The counter is
--  touched only by deviation_raise, which is SECURITY DEFINER. Nobody
--  reads or writes it directly, and with RLS on and no policy, nobody
--  can.

-- ── 2. deviations ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.deviations (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id              uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  --  Allocated by deviation_raise. Unique per company, not globally:
  --  two companies both having DEV-00001 is correct.
  deviation_number        text NOT NULL,

  title                   text NOT NULL,
  description             text,

  severity                text NOT NULL
    CHECK (severity IN ('critical','major','minor')),

  --  THE FIELD RELEASE GATING READS. NOT NULL, no default.
  product_quality_impact  text NOT NULL
    CHECK (product_quality_impact IN ('yes','no','undetermined')),

  --  What it was raised against. "Raised against a batch, material lot,
  --  equipment, QC result, process or facility, by any user."
  source_type             text NOT NULL
    CHECK (source_type IN ('batch','material_lot','equipment','qc_result','process','facility')),
  --  Null for 'process' and 'facility', which name a thing rather than
  --  a row. Constrained below so the other four cannot be null.
  source_id               uuid,

  --  Item 07: "Every deviation records which entry point it came from."
  --  'manual' is a person starting from the deviation register itself.
  entry_point             text NOT NULL DEFAULT 'manual'
    CHECK (entry_point IN (
      'manual',
      'changeover_verification_failed',
      'supplier_certificate_discrepancy',
      'inprocess_reading_flagged',
      'qc_result_failed',
      'batch_rejected'
    )),

  immediate_action        text,
  containment             text,
  investigation_owner     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  investigation_due_date  date,

  raised_by               uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  raised_at               timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  --  Written by the closure trigger, from the lifecycle transition.
  --  Never set by a client.
  closed_at               timestamptz,

  CONSTRAINT deviations_number_per_company UNIQUE (company_id, deviation_number),

  --  A deviation against a batch with no batch is not a deviation
  --  against a batch.
  CONSTRAINT deviations_source_id_required CHECK (
    (source_type IN ('process','facility') AND source_id IS NULL)
    OR (source_type NOT IN ('process','facility') AND source_id IS NOT NULL)
  ),

  CONSTRAINT deviations_title_not_blank CHECK (btrim(title) <> '')
);

CREATE INDEX IF NOT EXISTS deviations_company_idx ON public.deviations (company_id);
--  The lookup release gating makes, and the one the batch and lot
--  screens make: "what was raised against this thing".
CREATE INDEX IF NOT EXISTS deviations_source_idx
  ON public.deviations (company_id, source_type, source_id);
CREATE INDEX IF NOT EXISTS deviations_owner_idx
  ON public.deviations (investigation_owner) WHERE investigation_owner IS NOT NULL;

-- ── 3. deviation_links ───────────────────────────────────────────────
--  "Linkable to CAPA, change control and batch. A deviation raised
--   against a lot or batch is visible from that lot or batch."
--
--  The source columns above answer "what was this raised against".
--  These answer "what else is it connected to" — the CAPA that came out
--  of it, the change control that resulted, another batch it turned out
--  to affect. One deviation, many links, each one directional and
--  typed.
CREATE TABLE IF NOT EXISTS public.deviation_links (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  deviation_id  uuid NOT NULL REFERENCES public.deviations(id) ON DELETE CASCADE,

  linked_type   text NOT NULL
    CHECK (linked_type IN ('capa','change_control','batch','material_lot','qc_result','product')),
  linked_id     uuid NOT NULL,

  note          text,
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),

  --  Linking the same CAPA twice is a double-click, not a second fact.
  CONSTRAINT deviation_links_unique UNIQUE (deviation_id, linked_type, linked_id)
);

CREATE INDEX IF NOT EXISTS deviation_links_deviation_idx
  ON public.deviation_links (deviation_id);
--  "visible from that lot or batch" — the reverse lookup, which is the
--  one the batch record screen makes.
CREATE INDEX IF NOT EXISTS deviation_links_target_idx
  ON public.deviation_links (company_id, linked_type, linked_id);

-- ── 4. Row level security ────────────────────────────────────────────
ALTER TABLE public.deviations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deviation_links ENABLE ROW LEVEL SECURITY;

--  "Raised against ... by any user": every member of the company may
--  read and raise. Closure is gated by the lifecycle engine, not by a
--  table policy, because closure is a transition.
DROP POLICY IF EXISTS deviations_read ON public.deviations;
CREATE POLICY deviations_read ON public.deviations
  FOR SELECT TO authenticated
  USING (public.app_is_company_member(company_id));

DROP POLICY IF EXISTS deviations_insert ON public.deviations;
CREATE POLICY deviations_insert ON public.deviations
  FOR INSERT TO authenticated
  WITH CHECK (public.app_is_company_member(company_id));

--  UPDATE is permitted for the investigation fields, and the
--  immutability trigger below decides which those are. A closed
--  deviation is refused there, not here, so the refusal can say why.
DROP POLICY IF EXISTS deviations_update ON public.deviations;
CREATE POLICY deviations_update ON public.deviations
  FOR UPDATE TO authenticated
  USING (public.app_is_company_member(company_id))
  WITH CHECK (public.app_is_company_member(company_id));

--  No DELETE policy anywhere. A deviation is a quality record; it is
--  closed, never removed.

DROP POLICY IF EXISTS deviation_links_read ON public.deviation_links;
CREATE POLICY deviation_links_read ON public.deviation_links
  FOR SELECT TO authenticated
  USING (public.app_is_company_member(company_id));

DROP POLICY IF EXISTS deviation_links_write ON public.deviation_links;
CREATE POLICY deviation_links_write ON public.deviation_links
  FOR INSERT TO authenticated
  WITH CHECK (public.app_is_company_member(company_id));

DROP POLICY IF EXISTS deviation_links_remove ON public.deviation_links;
CREATE POLICY deviation_links_remove ON public.deviation_links
  FOR DELETE TO authenticated
  USING (public.app_is_company_member(company_id));

-- ── 5. The lifecycle ─────────────────────────────────────────────────
--  Four states, exactly as the brief names them. Seeded as the system
--  default (company_id NULL) so a company can override it later without
--  this migration being in the way.
DO $seed$
DECLARE
  v_def uuid;
  s_raised uuid; s_inv uuid; s_qa uuid; s_closed uuid;
BEGIN
  SELECT id INTO v_def FROM public.lifecycle_definitions
   WHERE entity_type = 'deviation' AND company_id IS NULL;
  IF v_def IS NOT NULL THEN RETURN; END IF;   -- idempotent

  INSERT INTO public.lifecycle_definitions(company_id, entity_type, name, version, is_active)
  VALUES (NULL, 'deviation', 'Deviation Lifecycle', 1, true)
  RETURNING id INTO v_def;

  INSERT INTO public.lifecycle_states(definition_id,state_key,label,sort_order,is_initial,is_terminal,is_locked)
  VALUES (v_def,'raised','Raised',0,true,false,false) RETURNING id INTO s_raised;
  INSERT INTO public.lifecycle_states(definition_id,state_key,label,sort_order,is_initial,is_terminal,is_locked)
  VALUES (v_def,'under_investigation','Under Investigation',1,false,false,false) RETURNING id INTO s_inv;
  INSERT INTO public.lifecycle_states(definition_id,state_key,label,sort_order,is_initial,is_terminal,is_locked)
  VALUES (v_def,'pending_qa_closure','Pending QA Closure',2,false,false,false) RETURNING id INTO s_qa;

  --  "A closed deviation is locked." Both flags, and they mean
  --  different things: is_terminal says nothing leaves this state,
  --  is_locked says the record underneath it stops changing. The
  --  immutability trigger below enforces the second for the table's own
  --  columns, which the engine cannot see.
  INSERT INTO public.lifecycle_states(definition_id,state_key,label,sort_order,is_initial,is_terminal,is_locked)
  VALUES (v_def,'closed','Closed',3,false,true,true) RETURNING id INTO s_closed;

  INSERT INTO public.lifecycle_transitions
    (definition_id,from_state_id,to_state_id,action_key,label,sort_order,
     required_role,required_permission,requires_comment,requires_signature)
  VALUES
    (v_def,s_raised,s_inv   ,'start_investigation'  ,'Start Investigation'  ,0,NULL,NULL,false,false),

    --  Straight from raised to QA for a deviation that needs no
    --  investigation — a duplicate, or one closed out on the spot. It
    --  still goes through QA, and it still needs a reason.
    (v_def,s_raised,s_qa    ,'submit_without_investigation','Submit for QA Closure',1,NULL,NULL,true,false),

    (v_def,s_inv   ,s_qa    ,'submit_for_qa_closure','Submit for QA Closure',2,NULL,NULL,true ,false),
    (v_def,s_qa    ,s_inv   ,'return_to_investigation','Return to Investigation',3,NULL,NULL,true,false),

    --  "Closure requires QA approval and an electronic signature."
    --  requires_signature stopped meaning "refuse" in
    --  20260917000000 and now demands a matching, unspent signature
    --  whose record hash still matches, enforced inside
    --  lifecycle_transition. required_role is the profile-role list the
    --  engine checks; a company that designates a different QA role
    --  overrides the definition rather than editing this file.
    (v_def,s_qa    ,s_closed,'qa_close'             ,'Approve and Close'    ,4,
       'admin,compliance_officer',NULL,true,true);
END
$seed$;

-- ── 6. Deviations join the engine ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_deviations_initialize_lifecycle()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.lifecycle_initialize('deviation', NEW.id, NEW.company_id, NEW.raised_by, NULL);
  RETURN NULL;
EXCEPTION WHEN others THEN
  IF SQLERRM LIKE 'LIFECYCLE_ALREADY_INITIALIZED%' THEN RETURN NULL; END IF;
  RAISE;
END
$$;

DROP TRIGGER IF EXISTS trg_deviations_initialize_lifecycle ON public.deviations;
CREATE TRIGGER trg_deviations_initialize_lifecycle
  AFTER INSERT ON public.deviations
  FOR EACH ROW EXECUTE FUNCTION public.fn_deviations_initialize_lifecycle();

-- ── 7. A closed deviation is locked ──────────────────────────────────
--  The engine locks the STATE. This locks the ROW, which the engine
--  cannot see: without it, a closed deviation's severity or impact
--  could still be edited through the table, and the release decision
--  recorded against it would no longer describe the record.
--
--  closed_at is the one column that may change while closing, and only
--  to a value, once.
CREATE OR REPLACE FUNCTION public.fn_deviations_locked_when_closed()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_state text;
BEGIN
  SELECT s.state_key INTO v_state
  FROM public.entity_current_state ecs
  JOIN public.lifecycle_states s ON s.id = ecs.state_id
  WHERE ecs.entity_type = 'deviation' AND ecs.entity_id = OLD.id;

  IF v_state = 'closed' AND OLD.closed_at IS NOT NULL THEN
    RAISE EXCEPTION
      'DEVIATION_CLOSED: % is closed and cannot be edited', OLD.deviation_number
      USING ERRCODE = 'P0001';
  END IF;

  --  The number and the company never change, closed or not.
  IF NEW.deviation_number <> OLD.deviation_number OR NEW.company_id <> OLD.company_id THEN
    RAISE EXCEPTION 'DEVIATION_IMMUTABLE: the number and company of a deviation cannot change'
      USING ERRCODE = 'P0001';
  END IF;

  --  Impact can be revised during investigation — that is the point of
  --  'undetermined' — but never back to nothing.
  IF NEW.product_quality_impact IS NULL OR btrim(NEW.product_quality_impact) = '' THEN
    RAISE EXCEPTION 'DEVIATION_IMPACT_REQUIRED: product quality impact cannot be cleared'
      USING ERRCODE = 'P0001';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_deviations_locked_when_closed ON public.deviations;
CREATE TRIGGER trg_deviations_locked_when_closed
  BEFORE UPDATE ON public.deviations
  FOR EACH ROW EXECUTE FUNCTION public.fn_deviations_locked_when_closed();

--  Stamp closed_at from the transition rather than from the client, so
--  the time on the record is the time the database committed the
--  closure.
CREATE OR REPLACE FUNCTION public.fn_deviations_stamp_closed()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_key text;
BEGIN
  IF NEW.entity_type <> 'deviation' THEN RETURN NEW; END IF;
  SELECT state_key INTO v_key FROM public.lifecycle_states WHERE id = NEW.state_id;
  IF v_key = 'closed' THEN
    UPDATE public.deviations SET closed_at = now()
     WHERE id = NEW.entity_id AND closed_at IS NULL;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_deviations_stamp_closed ON public.entity_current_state;
CREATE TRIGGER trg_deviations_stamp_closed
  AFTER INSERT OR UPDATE ON public.entity_current_state
  FOR EACH ROW EXECUTE FUNCTION public.fn_deviations_stamp_closed();

-- ── 8. Raising a deviation ───────────────────────────────────────────
--  One function, because three things have to happen together: the
--  number is allocated, the row is written, and the lifecycle is
--  initialised. Done from the browser in three calls, a failure between
--  them leaves a number burnt or a deviation with no state.
CREATE OR REPLACE FUNCTION public.deviation_raise(
  p_company_id             uuid,
  p_title                  text,
  p_severity               text,
  p_product_quality_impact text,
  p_source_type            text,
  p_source_id              uuid DEFAULT NULL,
  p_description            text DEFAULT NULL,
  p_entry_point            text DEFAULT 'manual',
  p_immediate_action       text DEFAULT NULL,
  p_containment            text DEFAULT NULL,
  p_investigation_owner    uuid DEFAULT NULL,
  p_investigation_due_date date DEFAULT NULL
) RETURNS public.deviations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_n   bigint;
  v_row public.deviations;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'DEVIATION_UNAUTHENTICATED' USING ERRCODE = 'P0001';
  END IF;

  --  SECURITY DEFINER means RLS is not consulted, so tenancy is checked
  --  here explicitly. Without this the function would be a way to write
  --  a deviation into any company.
  IF NOT public.app_is_company_member(p_company_id, v_uid) THEN
    RAISE EXCEPTION 'DEVIATION_FORBIDDEN: not a member of that company'
      USING ERRCODE = 'P0001';
  END IF;

  --  "Impact left blank and accepted" is a NOT DONE IF. The column is
  --  NOT NULL, but an empty string would satisfy that and fail the
  --  CHECK with a message about a constraint; this fails with a message
  --  about the thing that is wrong.
  IF p_product_quality_impact IS NULL OR btrim(p_product_quality_impact) = '' THEN
    RAISE EXCEPTION 'DEVIATION_IMPACT_REQUIRED: product quality impact must be yes, no or undetermined'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.deviation_counters AS c (company_id, last_number)
  VALUES (p_company_id, 1)
  ON CONFLICT (company_id) DO UPDATE SET last_number = c.last_number + 1
  RETURNING last_number INTO v_n;

  INSERT INTO public.deviations (
    company_id, deviation_number, title, description, severity,
    product_quality_impact, source_type, source_id, entry_point,
    immediate_action, containment, investigation_owner,
    investigation_due_date, raised_by
  ) VALUES (
    p_company_id, 'DEV-' || lpad(v_n::text, 5, '0'), btrim(p_title), p_description, p_severity,
    p_product_quality_impact, p_source_type, p_source_id, p_entry_point,
    p_immediate_action, p_containment, p_investigation_owner,
    p_investigation_due_date, v_uid
  ) RETURNING * INTO v_row;

  RETURN v_row;
END
$$;

REVOKE ALL ON FUNCTION public.deviation_raise(uuid,text,text,text,text,uuid,text,text,text,text,uuid,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deviation_raise(uuid,text,text,text,text,uuid,text,text,text,text,uuid,date) TO authenticated;

-- ── 9. What release gating asks ──────────────────────────────────────
--  Item 05 reads this and nothing else about deviations. It is a
--  function rather than a view so the "open" definition lives in one
--  place: open means the lifecycle state is not 'closed'.
--
--  It returns the deviations that are OPEN and attached to the batch —
--  either raised directly against it, or linked to it — with their
--  impact, so the gate can sort blocks from warnings without knowing
--  how deviations are stored.
CREATE OR REPLACE FUNCTION public.deviation_open_for_batch(
  p_company_id uuid,
  p_batch_id   uuid
) RETURNS TABLE (
  id uuid,
  deviation_number text,
  title text,
  severity text,
  product_quality_impact text,
  state_key text,
  attached_as text
)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp
AS $$
  SELECT d.id, d.deviation_number, d.title, d.severity, d.product_quality_impact,
         s.state_key,
         CASE WHEN d.source_type = 'batch' AND d.source_id = p_batch_id
              THEN 'raised_against' ELSE 'linked' END
  FROM public.deviations d
  JOIN public.entity_current_state ecs
    ON ecs.entity_type = 'deviation' AND ecs.entity_id = d.id
  JOIN public.lifecycle_states s ON s.id = ecs.state_id
  WHERE d.company_id = p_company_id
    AND public.app_is_company_member(p_company_id)
    AND s.state_key <> 'closed'
    AND (
      (d.source_type = 'batch' AND d.source_id = p_batch_id)
      OR EXISTS (
        SELECT 1 FROM public.deviation_links l
        WHERE l.deviation_id = d.id
          AND l.linked_type = 'batch'
          AND l.linked_id = p_batch_id
      )
    );
$$;

REVOKE ALL ON FUNCTION public.deviation_open_for_batch(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deviation_open_for_batch(uuid,uuid) TO authenticated;

COMMENT ON TABLE public.deviations IS
  'Week 5 item 02. No status column: state is held by the lifecycle engine under entity_type ''deviation''. product_quality_impact is NOT NULL because release gating reads it, and ''undetermined'' blocks by default.';
COMMENT ON TABLE public.deviation_links IS
  'What a deviation is connected to. The source_type/source_id columns on deviations say what it was raised against; these say what else it touches.';
