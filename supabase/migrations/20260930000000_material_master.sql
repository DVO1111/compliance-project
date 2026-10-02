-- =====================================================================
--  WEEK 3 / ITEM 03 — MATERIAL MASTER, LOTS AND LIFECYCLE
-- =====================================================================
--  Blocks items 04, 05, 06 and 07. Due Tuesday.
--
--  WHAT ALREADY EXISTED, AND WHY THIS IS NOT IT
--  --------------------------------------------
--  public.raw_material_receipts (20260701000100) is a single flat table:
--  material_name text, lot_number text, supplier_name text, and a
--  `test_status` column constrained to pending/passed/failed/quarantined.
--  It is live — batchReleaseService.ts lists rows, adds rows and calls
--  updateRawMaterialStatus(), and auditPrepService.ts counts them.
--
--  It cannot carry this deliverable, for three reasons:
--
--    1. It has no material master. Every receipt repeats the material as
--       free text, so there is nothing to hold criticality, specification
--       reference, retest period or storage conditions, and nothing for a
--       specification to be compared against in item 05.
--    2. Its `test_status` column IS the anti-pattern this item names:
--       "a status column on material_lots instead of the lifecycle engine.
--       This rebuilds the problem Week 1 solved."
--    3. updateRawMaterialStatus() sets test_status to 'passed' directly
--       from the browser with no role check, no test result and no
--       signature. Material release is currently self-asserted.
--
--  So this migration builds the real model beside it and leaves the
--  legacy table untouched, exactly as D06 left the legacy licence vault
--  untouched. Nothing here reads or writes raw_material_receipts, so the
--  existing screens keep working unchanged. Retiring it means migrating
--  those three call sites, which is a separate change with its own review
--  — and until that happens there are two tables that look like they
--  answer "is this material released". Only this one actually enforces it.
--
--  THE STATUS QUESTION
--  -------------------
--  material_lots carries a `status` column, which looks like the thing
--  item 03 forbids. It is not: it is a DERIVED MIRROR, maintained by a
--  trigger off entity_current_state, and a direct write to it is rejected
--  by a guard trigger. The lifecycle engine remains the only way to move a
--  lot. This is the pattern D05 and D06 established — the mirror exists so
--  a list screen can filter and index on state without joining three
--  tables, and the guard is what stops it becoming a second source of
--  truth. `SELECT status` is fine; `UPDATE status` raises.
--
--  WHAT ITEM 03 DID NOT LIST BUT NEEDS
--  -----------------------------------
--  suppliers — "Lot record carries supplier", and item 04 requires that
--  material "cannot be received from a supplier in a disqualified state",
--  which needs somewhere for that state to live. Registered with the
--  lifecycle engine for the same reason material lots are.
--
--  company_numbering_formats — "Internal lot numbering follows the company
--  configured format", and nothing in the schema configured any format.
--  Built generically (scoped by a key) so batch numbering can reuse it in
--  Week 5 rather than inventing a second mechanism.
-- =====================================================================


-- ── 1. Company-configured numbering ──────────────────────────────────
--  The format is a pattern of tokens, not code. Adding a company's
--  convention is a row, not a deployment.
--
--    {PREFIX}         the configured prefix
--    {YYYY} {YY} {MM} the date the number is issued
--    {MATERIAL_CODE}  the material's code, for lot numbers
--    {SEQ}            the counter, zero-padded to seq_width
--
--  A lot number is issued once, at insert, and never recomputed: it is
--  printed on labels and quoted in dossiers, so it must not drift when
--  the format changes. The format applies to lots created after it.
CREATE TABLE IF NOT EXISTS public.company_numbering_formats (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  scope          text        NOT NULL,
  pattern        text        NOT NULL,
  prefix         text,
  seq_width      integer     NOT NULL DEFAULT 4,
  --  Whether the counter restarts, and on what boundary.
  seq_reset      text        NOT NULL DEFAULT 'yearly',
  next_seq       integer     NOT NULL DEFAULT 1,
  seq_period     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_numbering_formats_scope_chk
    CHECK (scope IN ('material_lot','batch','deviation','change_control')),
  CONSTRAINT company_numbering_formats_reset_chk
    CHECK (seq_reset IN ('never','yearly','monthly')),
  CONSTRAINT company_numbering_formats_width_chk CHECK (seq_width BETWEEN 1 AND 12),
  CONSTRAINT company_numbering_formats_seq_chk   CHECK (next_seq > 0),
  CONSTRAINT company_numbering_formats_uniq      UNIQUE (company_id, scope)
);

COMMENT ON TABLE public.company_numbering_formats IS
  'Per-company document numbering conventions. Read by numbering_next(); never hardcoded in application code.';

CREATE OR REPLACE FUNCTION public.numbering_next(
  p_company_id uuid,
  p_scope      text,
  p_context    jsonb DEFAULT '{}'::jsonb
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_fmt    public.company_numbering_formats;
  v_period text;
  v_seq    integer;
  v_out    text;
BEGIN
  --  SECURITY DEFINER, so it checks the caller itself: RLS does not apply
  --  inside it and it both reads and advances another company's counter
  --  if handed their id.
  IF NOT public.app_is_service_context()
     AND NOT public.app_is_company_member(p_company_id) THEN
    RAISE EXCEPTION 'NUMBERING_FORBIDDEN: caller is not a member of the owning company'
      USING ERRCODE = 'P0001';
  END IF;

  --  FOR UPDATE, so two concurrent receipts cannot take the same number.
  SELECT * INTO v_fmt FROM public.company_numbering_formats
   WHERE company_id = p_company_id AND scope = p_scope
     FOR UPDATE;

  IF v_fmt.id IS NULL THEN
    RAISE EXCEPTION 'NUMBERING_NO_FORMAT: company % has no numbering format configured for scope "%"', p_company_id, p_scope
      USING ERRCODE = 'P0002';
  END IF;

  v_period := CASE v_fmt.seq_reset
                WHEN 'yearly'  THEN to_char(current_date,'YYYY')
                WHEN 'monthly' THEN to_char(current_date,'YYYY-MM')
                ELSE 'never'
              END;

  --  A new period restarts the counter; the same period continues it.
  IF v_fmt.seq_period IS DISTINCT FROM v_period THEN
    v_seq := 1;
    UPDATE public.company_numbering_formats
       SET next_seq = 2, seq_period = v_period, updated_at = now()
     WHERE id = v_fmt.id;
  ELSE
    v_seq := v_fmt.next_seq;
    UPDATE public.company_numbering_formats
       SET next_seq = next_seq + 1, updated_at = now()
     WHERE id = v_fmt.id;
  END IF;

  v_out := v_fmt.pattern;
  v_out := replace(v_out, '{PREFIX}',        coalesce(v_fmt.prefix,''));
  v_out := replace(v_out, '{YYYY}',          to_char(current_date,'YYYY'));
  v_out := replace(v_out, '{YY}',            to_char(current_date,'YY'));
  v_out := replace(v_out, '{MM}',            to_char(current_date,'MM'));
  v_out := replace(v_out, '{MATERIAL_CODE}', coalesce(p_context->>'material_code',''));
  v_out := replace(v_out, '{SEQ}',           lpad(v_seq::text, v_fmt.seq_width, '0'));
  RETURN v_out;
END $$;

COMMENT ON FUNCTION public.numbering_next(uuid,text,jsonb) IS
  'Issues the next number for a company and scope from its configured pattern, advancing the counter under a row lock. SECURITY DEFINER, so it enforces company membership itself.';

REVOKE ALL ON FUNCTION public.numbering_next(uuid,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.numbering_next(uuid,text,jsonb) TO authenticated, service_role;


-- ── 2. Suppliers ─────────────────────────────────────────────────────
--  qualification_status is a derived mirror of the supplier lifecycle,
--  on the same terms as material_lots.status below.
CREATE TABLE IF NOT EXISTS public.suppliers (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name                 text        NOT NULL,
  code                 text,
  qualification_status text        NOT NULL DEFAULT 'pending',
  qualified_until      date,
  address              text,
  country              text,
  contact_email        text,
  notes                text,
  created_by           uuid REFERENCES auth.users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT suppliers_qualification_chk
    CHECK (qualification_status IN ('pending','qualified','conditional','disqualified','suspended')),
  CONSTRAINT suppliers_code_uniq UNIQUE (company_id, code)
);

CREATE INDEX IF NOT EXISTS suppliers_company_idx
  ON public.suppliers (company_id, qualification_status);

COMMENT ON COLUMN public.suppliers.qualification_status IS
  'DERIVED read model. Maintained by fn_suppliers_sync_status() from entity_current_state; direct writes are rejected.';


-- ── 3. Material master ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.materials (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code                      text        NOT NULL,
  name                      text        NOT NULL,
  material_type             text        NOT NULL,
  --  Criticality drives how hard the gates bite in items 04 and 06.
  criticality               text        NOT NULL DEFAULT 'standard',
  --  "whether it requires further processing" — an API received as a
  --  crude that must be milled or dried before use is not ready to
  --  dispense even once approved.
  requires_further_processing boolean   NOT NULL DEFAULT false,
  further_processing_note   text,
  --  Specification reference. The compared-against specification itself
  --  arrives with item 06; this is the controlled document it points to.
  specification_reference   text,
  specification_version     text,
  --  Retest period in days. NULL means the material does not retest,
  --  which is different from a period of zero.
  retest_period_days        integer,
  storage_conditions        text,
  storage_temperature_min_c numeric(5,2),
  storage_temperature_max_c numeric(5,2),
  unit_of_measure           text        NOT NULL DEFAULT 'kg',
  is_active                 boolean     NOT NULL DEFAULT true,
  created_by                uuid REFERENCES auth.users(id),
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT materials_code_uniq UNIQUE (company_id, code),
  CONSTRAINT materials_type_chk CHECK (material_type IN
    ('active_ingredient','excipient','packaging','solvent','reagent','intermediate','other')),
  CONSTRAINT materials_criticality_chk CHECK (criticality IN ('critical','major','standard')),
  CONSTRAINT materials_retest_chk CHECK (retest_period_days IS NULL OR retest_period_days >= 0),
  CONSTRAINT materials_temp_range_chk CHECK (
    storage_temperature_min_c IS NULL OR storage_temperature_max_c IS NULL
    OR storage_temperature_min_c <= storage_temperature_max_c)
);

CREATE INDEX IF NOT EXISTS materials_company_idx
  ON public.materials (company_id, is_active, material_type);

COMMENT ON TABLE public.materials IS
  'Material master. One row per material a company buys, not per receipt — receipts are material_lots.';


-- ── 4. Material lots ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.material_lots (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id             uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  material_id            uuid        NOT NULL REFERENCES public.materials(id) ON DELETE RESTRICT,
  --  Issued from the company's configured format by the trigger below.
  lot_number             text        NOT NULL,
  supplier_id            uuid REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  --  The supplier's own batch reference, which is not ours and is not
  --  unique across suppliers.
  supplier_batch_number  text,
  quantity_received      numeric(14,4),
  quantity_available     numeric(14,4),
  unit_of_measure        text,
  received_date          date        NOT NULL DEFAULT current_date,
  manufacture_date       date,
  supplier_expiry_date   date,
  retest_due_date        date,
  storage_location       text,
  --  DERIVED. See the header, and the guard trigger below.
  status                 text        NOT NULL DEFAULT 'quarantine',
  received_by            uuid REFERENCES auth.users(id),
  created_by             uuid REFERENCES auth.users(id),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT material_lots_number_uniq UNIQUE (company_id, lot_number),
  CONSTRAINT material_lots_status_chk CHECK (status IN
    ('quarantine','under_test','approved','rejected','expired','exhausted','on_hold')),
  CONSTRAINT material_lots_qty_chk CHECK (
    (quantity_received IS NULL OR quantity_received >= 0)
    AND (quantity_available IS NULL OR quantity_available >= 0)),
  --  A lot cannot be manufactured after it was received.
  CONSTRAINT material_lots_dates_chk CHECK (
    manufacture_date IS NULL OR manufacture_date <= received_date)
);

CREATE INDEX IF NOT EXISTS material_lots_company_idx
  ON public.material_lots (company_id, status, received_date DESC);
CREATE INDEX IF NOT EXISTS material_lots_material_idx
  ON public.material_lots (material_id, status);
CREATE INDEX IF NOT EXISTS material_lots_retest_idx
  ON public.material_lots (company_id, retest_due_date)
  WHERE retest_due_date IS NOT NULL;

COMMENT ON COLUMN public.material_lots.status IS
  'DERIVED read model. Maintained by fn_material_lots_sync_status() from entity_current_state; direct writes are rejected. Move a lot with lifecycle_transition().';


-- ── 5. Incoming certificates of analysis ─────────────────────────────
--  Item 05 does the comparison against specification. This is the record
--  it compares: the supplier's stated results as STRUCTURED DATA, which
--  is why supplier_results is jsonb and not merely a stored file.
CREATE TABLE IF NOT EXISTS public.material_certificates_of_analysis (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id             uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  material_lot_id        uuid        NOT NULL REFERENCES public.material_lots(id) ON DELETE CASCADE,
  certificate_number     text,
  issued_date            date,
  received_date          date        NOT NULL DEFAULT current_date,
  --  Parameter-by-parameter, as the supplier stated them. Item 05 reads
  --  this against the internal specification; a file alone cannot be
  --  compared, and filing is not verification.
  supplier_results       jsonb       NOT NULL DEFAULT '[]'::jsonb,
  document_path          text,
  document_mime_type     text,
  document_size_bytes    bigint,
  --  Verification outcome, written by item 05. Deliberately NOT a
  --  lifecycle: a certificate is not an entity that moves through states,
  --  it is a document that is either checked or not.
  verification_status    text        NOT NULL DEFAULT 'unverified',
  verified_at            timestamptz,
  verified_by            uuid REFERENCES auth.users(id),
  discrepancy_count      integer     NOT NULL DEFAULT 0,
  uploaded_by            uuid REFERENCES auth.users(id),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT material_coa_verification_chk CHECK (verification_status IN
    ('unverified','verified','discrepant','rejected')),
  CONSTRAINT material_coa_results_is_array CHECK (jsonb_typeof(supplier_results) = 'array'),
  CONSTRAINT material_coa_discrepancy_chk CHECK (discrepancy_count >= 0),
  CONSTRAINT material_coa_size_chk CHECK (document_size_bytes IS NULL OR document_size_bytes >= 0)
);

CREATE INDEX IF NOT EXISTS material_coa_lot_idx
  ON public.material_certificates_of_analysis (material_lot_id, verification_status);
CREATE INDEX IF NOT EXISTS material_coa_company_idx
  ON public.material_certificates_of_analysis (company_id, verification_status);

COMMENT ON COLUMN public.material_certificates_of_analysis.supplier_results IS
  'Array of {parameter, unit, stated_value, stated_text}. Structured so item 05 can compare it against the internal specification parameter by parameter.';


-- ── 6. Lifecycles ────────────────────────────────────────────────────
--  Both registered as system definitions (company_id NULL), which
--  lifecycle_resolve_definition() uses as the fallback when a company has
--  not defined its own. A company that wants extra states adds its own
--  definition and it wins, without this migration changing.
DO $mat_lc$
DECLARE
  v_def uuid;
  s_quar uuid; s_test uuid; s_appr uuid; s_rej uuid;
  s_exp uuid;  s_exh uuid;  s_hold uuid;
BEGIN
  SELECT id INTO v_def FROM public.lifecycle_definitions
   WHERE entity_type = 'material_lot' AND company_id IS NULL AND version = 1;

  IF v_def IS NULL THEN
    INSERT INTO public.lifecycle_definitions(company_id, entity_type, name, description, version, is_active)
    VALUES (NULL,'material_lot','Material lot lifecycle',
            'Incoming material from receipt through test to approval, rejection or exhaustion.',1,true)
    RETURNING id INTO v_def;

    --  quarantine is initial: item 04 requires that receipt put a lot
    --  there automatically, and the engine's initial state is what makes
    --  that true without anyone remembering to set it.
    INSERT INTO public.lifecycle_states(definition_id,state_key,label,description,sort_order,is_initial,is_terminal) VALUES
      (v_def,'quarantine','Quarantine','Received, not yet released for use. Cannot be dispensed.',10,true ,false),
      (v_def,'under_test','Under test','Sampled and undergoing testing.',                          20,false,false),
      (v_def,'approved','Approved','Released for use.',                                            30,false,false),
      (v_def,'on_hold','On hold','Use suspended pending investigation.',                           40,false,false),
      (v_def,'rejected','Rejected','Failed testing or otherwise unfit. Terminal.',                 50,false,true ),
      (v_def,'expired','Expired','Past supplier expiry. Terminal.',                                60,false,true ),
      (v_def,'exhausted','Exhausted','Fully consumed. Terminal.',                                  70,false,true );

    SELECT id INTO s_quar FROM public.lifecycle_states WHERE definition_id=v_def AND state_key='quarantine';
    SELECT id INTO s_test FROM public.lifecycle_states WHERE definition_id=v_def AND state_key='under_test';
    SELECT id INTO s_appr FROM public.lifecycle_states WHERE definition_id=v_def AND state_key='approved';
    SELECT id INTO s_hold FROM public.lifecycle_states WHERE definition_id=v_def AND state_key='on_hold';
    SELECT id INTO s_rej  FROM public.lifecycle_states WHERE definition_id=v_def AND state_key='rejected';
    SELECT id INTO s_exp  FROM public.lifecycle_states WHERE definition_id=v_def AND state_key='expired';
    SELECT id INTO s_exh  FROM public.lifecycle_states WHERE definition_id=v_def AND state_key='exhausted';

    --  requires_signature is a HARD GATE, not a stored hint: the engine's
    --  enforcement layer raises LIFECYCLE_SIGNATURE_REQUIRED unless a
    --  signature has been consumed. So it is set on exactly one action —
    --  `release` — because that is the one the specification names:
    --  "the release transition is role gated to a designated QA role and
    --  requires electronic signature".
    --
    --  Rejection is left on requires_comment only. It is arguably worth
    --  signing too, but nothing has asked for that, and turning it on
    --  would make every rejection in item 04's tests and item 11's seed
    --  data need a signed act. Item 06 owns release and rejection
    --  enforcement and can make that call with the requirement in hand.
    INSERT INTO public.lifecycle_transitions
      (definition_id,from_state_id,to_state_id,action_key,label,sort_order,requires_comment,requires_signature) VALUES
      (v_def,s_quar,s_test,'sample',   'Sample for testing', 10,false,false),
      (v_def,s_test,s_appr,'release',  'Release',             20,false,true ),
      (v_def,s_test,s_rej ,'reject',   'Reject',              30,true ,false),
      (v_def,s_quar,s_rej ,'reject',   'Reject on receipt',   40,true ,false),
      (v_def,s_test,s_quar,'return_to_quarantine','Return to quarantine',50,true,false),
      --  Retest reversion (item 04) uses this, so the return is a real
      --  transition with a history row rather than a status overwrite.
      (v_def,s_appr,s_quar,'retest_due','Retest due',         60,false,false),
      (v_def,s_appr,s_hold,'hold',     'Place on hold',       70,true ,false),
      (v_def,s_test,s_hold,'hold',     'Place on hold',       80,true ,false),
      (v_def,s_hold,s_quar,'release_hold','Release hold',     90,true ,false),
      (v_def,s_hold,s_rej ,'reject',   'Reject',             100,true ,false),
      (v_def,s_appr,s_exp ,'expire',   'Mark expired',       110,false,false),
      (v_def,s_quar,s_exp ,'expire',   'Mark expired',       120,false,false),
      (v_def,s_appr,s_exh ,'exhaust',  'Mark exhausted',     130,false,false);
  END IF;

  --  Supplier qualification.
  SELECT id INTO v_def FROM public.lifecycle_definitions
   WHERE entity_type = 'supplier' AND company_id IS NULL AND version = 1;

  IF v_def IS NULL THEN
    INSERT INTO public.lifecycle_definitions(company_id, entity_type, name, description, version, is_active)
    VALUES (NULL,'supplier','Supplier qualification lifecycle',
            'Supplier from first contact through qualification to disqualification.',1,true)
    RETURNING id INTO v_def;

    INSERT INTO public.lifecycle_states(definition_id,state_key,label,description,sort_order,is_initial,is_terminal) VALUES
      (v_def,'pending','Pending qualification','Not yet qualified. Material cannot be received.',10,true ,false),
      (v_def,'qualified','Qualified','Approved to supply.',                                       20,false,false),
      (v_def,'conditional','Conditionally qualified','Approved with documented restrictions.',     30,false,false),
      (v_def,'suspended','Suspended','Supply suspended pending investigation.',                    40,false,false),
      (v_def,'disqualified','Disqualified','Not approved to supply. Terminal.',                    50,false,true );

    --  requires_signature is deliberately FALSE on every supplier
    --  transition. The engine's enforcement layer treats that flag as a
    --  hard gate — lifecycle_transition() raises
    --  LIFECYCLE_SIGNATURE_REQUIRED without a consumed signature — and
    --  item 03 asks for signatures nowhere. Item 06 is where signature
    --  gating is a stated requirement, and it is on material release, not
    --  on qualifying a supplier. Putting it here too would have made
    --  seeding (item 11) and every qualification workflow require a
    --  signed act nobody asked for. requires_comment carries the audit
    --  need instead: a disqualification without a reason is useless.
    INSERT INTO public.lifecycle_transitions
      (definition_id,from_state_id,to_state_id,action_key,label,sort_order,requires_comment,requires_signature)
    SELECT v_def, f.id, t.id, x.action_key, x.label, x.sort_order, x.rc, x.rs
      FROM (VALUES
        ('pending','qualified','qualify','Qualify',10,true,false),
        ('pending','conditional','qualify_conditional','Qualify with conditions',20,true,false),
        ('qualified','conditional','restrict','Apply conditions',30,true,false),
        ('conditional','qualified','lift_conditions','Lift conditions',40,true,false),
        ('qualified','suspended','suspend','Suspend',50,true,false),
        ('conditional','suspended','suspend','Suspend',60,true,false),
        ('suspended','qualified','reinstate','Reinstate',70,true,false),
        ('qualified','disqualified','disqualify','Disqualify',80,true,false),
        ('conditional','disqualified','disqualify','Disqualify',90,true,false),
        ('suspended','disqualified','disqualify','Disqualify',100,true,false),
        ('pending','disqualified','disqualify','Disqualify',110,true,false)
      ) AS x(from_key,to_key,action_key,label,sort_order,rc,rs)
      JOIN public.lifecycle_states f ON f.definition_id=v_def AND f.state_key=x.from_key
      JOIN public.lifecycle_states t ON t.definition_id=v_def AND t.state_key=x.to_key;
  END IF;
END
$mat_lc$;


-- ── 7. material_lots: initialise, mirror, guard ──────────────────────
--  Receipt puts a lot in quarantine automatically. Item 04 states this as
--  a requirement; it is here because the initialise trigger is the only
--  place that makes it unconditional.
CREATE OR REPLACE FUNCTION public.fn_material_lots_initialize_lifecycle()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.lifecycle_initialize('material_lot', NEW.id, NEW.company_id,
                                      coalesce(NEW.created_by, NEW.received_by));
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_material_lots_initialize_lifecycle ON public.material_lots;
CREATE TRIGGER trg_material_lots_initialize_lifecycle
  AFTER INSERT ON public.material_lots
  FOR EACH ROW EXECUTE FUNCTION public.fn_material_lots_initialize_lifecycle();

CREATE OR REPLACE FUNCTION public.fn_material_lots_sync_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_key text;
BEGIN
  IF NEW.entity_type <> 'material_lot' THEN RETURN NULL; END IF;
  SELECT state_key INTO v_key FROM public.lifecycle_states WHERE id = NEW.state_id;
  IF v_key IS NULL THEN RETURN NULL; END IF;

  PERFORM set_config('app.lifecycle_material_lot_sync','1',true);
  UPDATE public.material_lots
     SET status = v_key, updated_at = now()
   WHERE id = NEW.entity_id AND status IS DISTINCT FROM v_key;
  PERFORM set_config('app.lifecycle_material_lot_sync','',true);
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_material_lots_sync_status ON public.entity_current_state;
CREATE TRIGGER trg_material_lots_sync_status
  AFTER INSERT OR UPDATE ON public.entity_current_state
  FOR EACH ROW EXECUTE FUNCTION public.fn_material_lots_sync_status();

CREATE OR REPLACE FUNCTION public.fn_material_lots_guard_status()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND coalesce(current_setting('app.lifecycle_material_lot_sync', true),'') <> '1' THEN
    RAISE EXCEPTION 'MATERIAL_LOT_STATUS_READ_ONLY: status is derived from the lifecycle engine; use lifecycle_transition() instead of writing it'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_material_lots_guard_status ON public.material_lots;
CREATE TRIGGER trg_material_lots_guard_status
  BEFORE UPDATE ON public.material_lots
  FOR EACH ROW EXECUTE FUNCTION public.fn_material_lots_guard_status();

--  Lot number issued from the company format, and the retest date derived
--  from the material's retest period. Both BEFORE INSERT so the row is
--  never briefly wrong.
CREATE OR REPLACE FUNCTION public.fn_material_lots_defaults()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_code text; v_retest integer; v_unit text;
BEGIN
  SELECT m.code, m.retest_period_days, m.unit_of_measure
    INTO v_code, v_retest, v_unit
    FROM public.materials m WHERE m.id = NEW.material_id;

  IF v_code IS NULL THEN
    RAISE EXCEPTION 'MATERIAL_LOT_NO_MATERIAL: material % does not exist', NEW.material_id
      USING ERRCODE = 'P0002';
  END IF;

  --  The material must belong to the same company as the lot. Without
  --  this, a lot could reference another tenant's material and the lot
  --  number would carry their material code.
  IF NOT EXISTS (SELECT 1 FROM public.materials m
                  WHERE m.id = NEW.material_id AND m.company_id = NEW.company_id) THEN
    RAISE EXCEPTION 'MATERIAL_LOT_CROSS_COMPANY: material % belongs to another company', NEW.material_id
      USING ERRCODE = 'P0001';
  END IF;

  IF NEW.lot_number IS NULL OR btrim(NEW.lot_number) = '' THEN
    NEW.lot_number := public.numbering_next(
      NEW.company_id, 'material_lot', jsonb_build_object('material_code', v_code));
  END IF;

  IF NEW.unit_of_measure IS NULL THEN NEW.unit_of_measure := v_unit; END IF;
  IF NEW.quantity_available IS NULL THEN NEW.quantity_available := NEW.quantity_received; END IF;

  IF NEW.retest_due_date IS NULL AND v_retest IS NOT NULL THEN
    NEW.retest_due_date := NEW.received_date + v_retest;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_material_lots_defaults ON public.material_lots;
CREATE TRIGGER trg_material_lots_defaults
  BEFORE INSERT ON public.material_lots
  FOR EACH ROW EXECUTE FUNCTION public.fn_material_lots_defaults();


-- ── 8. suppliers: initialise, mirror, guard ──────────────────────────
CREATE OR REPLACE FUNCTION public.fn_suppliers_initialize_lifecycle()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.lifecycle_initialize('supplier', NEW.id, NEW.company_id, NEW.created_by);
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_suppliers_initialize_lifecycle ON public.suppliers;
CREATE TRIGGER trg_suppliers_initialize_lifecycle
  AFTER INSERT ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.fn_suppliers_initialize_lifecycle();

CREATE OR REPLACE FUNCTION public.fn_suppliers_sync_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_key text;
BEGIN
  IF NEW.entity_type <> 'supplier' THEN RETURN NULL; END IF;
  SELECT state_key INTO v_key FROM public.lifecycle_states WHERE id = NEW.state_id;
  IF v_key IS NULL THEN RETURN NULL; END IF;

  PERFORM set_config('app.lifecycle_supplier_sync','1',true);
  UPDATE public.suppliers
     SET qualification_status = v_key, updated_at = now()
   WHERE id = NEW.entity_id AND qualification_status IS DISTINCT FROM v_key;
  PERFORM set_config('app.lifecycle_supplier_sync','',true);
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_suppliers_sync_status ON public.entity_current_state;
CREATE TRIGGER trg_suppliers_sync_status
  AFTER INSERT OR UPDATE ON public.entity_current_state
  FOR EACH ROW EXECUTE FUNCTION public.fn_suppliers_sync_status();

CREATE OR REPLACE FUNCTION public.fn_suppliers_guard_status()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.qualification_status IS DISTINCT FROM OLD.qualification_status
     AND coalesce(current_setting('app.lifecycle_supplier_sync', true),'') <> '1' THEN
    RAISE EXCEPTION 'SUPPLIER_STATUS_READ_ONLY: qualification_status is derived from the lifecycle engine; use lifecycle_transition() instead of writing it'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_suppliers_guard_status ON public.suppliers;
CREATE TRIGGER trg_suppliers_guard_status
  BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.fn_suppliers_guard_status();


-- ── 9. updated_at ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_materials_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp
AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DO $touch$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['materials','material_certificates_of_analysis','company_numbering_formats']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_touch ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_touch BEFORE UPDATE ON public.%I '
                   'FOR EACH ROW EXECUTE FUNCTION public.fn_materials_touch_updated_at()', t, t);
  END LOOP;
END
$touch$;


-- ── 10. Row-level security ───────────────────────────────────────────
--  Every table carries company_id and every table has RLS. Membership
--  resolves through app_is_company_member(), the same helper the rest of
--  the schema uses, rather than an inline subquery that can drift.
ALTER TABLE public.company_numbering_formats          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers                          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materials                           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_lots                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_certificates_of_analysis   ENABLE ROW LEVEL SECURITY;

DO $rls$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['company_numbering_formats','suppliers','materials',
                           'material_lots','material_certificates_of_analysis']
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

    --  DELETE is policed explicitly rather than left absent: without a
    --  policy a delete is a silent no-op, which reads as success.
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_delete', t);
    EXECUTE format($p$CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
                      USING (public.app_is_company_member(company_id))$p$, t||'_delete', t);
  END LOOP;
END
$rls$;


-- ── 11. Grants ───────────────────────────────────────────────────────
--  TRUNCATE is not subject to RLS, so it is revoked rather than policed.
DO $grants$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['company_numbering_formats','suppliers','materials',
                           'material_lots','material_certificates_of_analysis']
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO service_role', t);
  END LOOP;
END
$grants$;
