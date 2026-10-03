-- =====================================================================
--  WEEK 3 / ITEM 12 — MASTER FORMULA (pulled forward from Week 4)
-- =====================================================================
--  CONDITIONAL: only if items 03 to 06 and 11 are complete. They are —
--  20260930000000, 20261002000000, 20261003000000, 20261004000000 and
--  20261006000000 — and each shipped with its own suite before this was
--  started, so the "started at the expense of" clause is satisfied by
--  the order of the branch rather than by assertion.
--
--  parameter_type IS THE POINT OF THIS ITEM
--  ----------------------------------------
--  "It exists to resolve the interlock question with Damilola and
--  Aderoh, and adding it later means a migration."
--
--  So it is not a label. A machine setting and a product attribute are
--  different kinds of statement and the schema treats them differently:
--
--    machine_setting    an INSTRUCTION. Someone dials it in before the
--                       stage runs: impeller speed, inlet air
--                       temperature, compression force, screen size. It
--                       must carry a target, because an instruction
--                       without a value tells an operator nothing.
--
--    product_attribute  an ACCEPTANCE CRITERION. Someone measures it
--                       after the stage runs and the batch passes or
--                       fails on it: granule moisture, tablet hardness,
--                       friability, disintegration time. It must carry
--                       limits, because a criterion with no limits
--                       cannot be judged — and a parameter that cannot
--                       be judged would pass by being unjudgeable, which
--                       is the same failure mode items 05 and 06 were
--                       written against.
--
--  Those two requirements are a CHECK constraint, not a convention. A
--  machine setting with no target, or a product attribute with no
--  limits, cannot be stored. That is what makes the column resolve
--  anything: downstream code can rely on a target existing wherever it
--  needs an instruction, and on limits existing wherever it needs a
--  verdict.
--
--  VERSIONING: A NEW VERSION, NOT AN EDIT
--  --------------------------------------
--  "Changing an approved formula creates a new version rather than
--  editing in place."
--
--  Enforced at both levels, because enforcing it only on the parent
--  would move the editing down a level rather than stop it:
--
--    * An approved formula's own substance is frozen. The guard trigger
--      permits only the status column to move, and only onward to
--      superseded or withdrawn.
--    * Its materials, stages and stage parameters are frozen too. A
--      formula whose header is immutable but whose bill of materials can
--      be rewritten is not versioned at all.
--
--  master_formula_new_version() clones the whole tree into a fresh draft
--  and records what it supersedes, so the lineage is readable in both
--  directions.
--
--  ONE APPROVED VERSION PER PRODUCT
--  --------------------------------
--  A partial unique index, for the same reason item 05 allows only one
--  effective specification per material: "the master formula for this
--  product" has to have one answer, or something downstream will pick
--  one arbitrarily and nobody will know which.
-- =====================================================================


-- ── 1. The formula header ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.master_formulas (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id          uuid        NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  version             text        NOT NULL,
  status              text        NOT NULL DEFAULT 'draft',
  --  The batch the quantities below are expressed for. Without it a
  --  bill of materials is a list of numbers with no denominator.
  batch_size          numeric(14,4) NOT NULL,
  batch_size_unit     text        NOT NULL,
  --  Theoretical yield, and the band within which a real batch is
  --  acceptable. Week 5's batch release compares against these.
  expected_yield_pct  numeric(6,3),
  yield_min_pct       numeric(6,3),
  yield_max_pct       numeric(6,3),
  effective_date      date,
  approved_by         uuid REFERENCES auth.users(id),
  approved_at         timestamptz,
  signature_id        uuid REFERENCES public.electronic_signatures(id),
  --  What this version replaced. Set by master_formula_new_version().
  supersedes_id       uuid REFERENCES public.master_formulas(id) ON DELETE SET NULL,
  superseded_at       timestamptz,
  notes               text,
  created_by          uuid REFERENCES auth.users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT master_formulas_status_chk
    CHECK (status IN ('draft','approved','superseded','withdrawn')),
  CONSTRAINT master_formulas_version_uniq UNIQUE (product_id, version),
  CONSTRAINT master_formulas_batch_chk CHECK (batch_size > 0),
  CONSTRAINT master_formulas_yield_chk CHECK (
    (yield_min_pct IS NULL OR yield_max_pct IS NULL OR yield_min_pct <= yield_max_pct)
    AND (expected_yield_pct IS NULL OR expected_yield_pct > 0)),
  --  An approved formula has to say who approved it and when. Without
  --  this, 'approved' is a word in a column.
  CONSTRAINT master_formulas_approval_chk CHECK (
    status <> 'approved' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
  CONSTRAINT master_formulas_no_self_supersede CHECK (supersedes_id IS DISTINCT FROM id)
);

--  One approved formula per product at a time.
CREATE UNIQUE INDEX IF NOT EXISTS master_formulas_one_approved
  ON public.master_formulas (product_id) WHERE status = 'approved';

CREATE INDEX IF NOT EXISTS master_formulas_company_idx
  ON public.master_formulas (company_id, status);
CREATE INDEX IF NOT EXISTS master_formulas_lineage_idx
  ON public.master_formulas (supersedes_id) WHERE supersedes_id IS NOT NULL;


-- ── 2. The bill of materials ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.master_formula_materials (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  formula_id         uuid        NOT NULL REFERENCES public.master_formulas(id) ON DELETE CASCADE,
  material_id        uuid        NOT NULL REFERENCES public.materials(id) ON DELETE RESTRICT,
  --  What the material is doing in this formulation. The same excipient
  --  is a diluent in one product and a binder in another, so the role
  --  belongs to the line, not to the material.
  role               text        NOT NULL,
  quantity_per_batch numeric(16,6) NOT NULL,
  unit               text        NOT NULL,
  --  Overage: deliberate excess for a known process loss. Separate from
  --  the quantity so the reconciliation in Week 5 can tell the two
  --  apart rather than inferring it.
  overage_pct        numeric(6,3) NOT NULL DEFAULT 0,
  is_critical        boolean     NOT NULL DEFAULT false,
  --  Which stage consumes it. Nullable, because a formula may be written
  --  before its stages are, and assigning every line to a stage is a
  --  later refinement rather than a precondition.
  consumed_at_stage  uuid,
  sort_order         integer     NOT NULL DEFAULT 0,
  notes              text,
  CONSTRAINT master_formula_materials_uniq UNIQUE (formula_id, material_id, role),
  CONSTRAINT master_formula_materials_role_chk CHECK (role IN
    ('active','diluent','binder','disintegrant','lubricant','glidant',
     'coating','solvent','colourant','flavour','other')),
  CONSTRAINT master_formula_materials_qty_chk CHECK (quantity_per_batch > 0),
  CONSTRAINT master_formula_materials_overage_chk CHECK (overage_pct >= 0 AND overage_pct <= 100)
);

CREATE INDEX IF NOT EXISTS master_formula_materials_formula_idx
  ON public.master_formula_materials (formula_id, sort_order);
CREATE INDEX IF NOT EXISTS master_formula_materials_material_idx
  ON public.master_formula_materials (material_id);


-- ── 3. Stages: a sequence, configured per product ────────────────────
--  Rows, not an enum. "Stage sequence hardcoded rather than
--  configurable per product" is a NOT DONE IF, so nothing here names a
--  stage: a tablet formula can be dispense → granulate → dry → mill →
--  blend → compress → coat → pack, a capsule formula can be dispense →
--  blend → encapsulate → polish → pack, and neither is privileged.
CREATE TABLE IF NOT EXISTS public.master_formula_stages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  formula_id       uuid        NOT NULL REFERENCES public.master_formulas(id) ON DELETE CASCADE,
  --  The position in the sequence. Unique per formula, so there is
  --  never a tie for "what happens next".
  sequence_no      integer     NOT NULL,
  stage_code       text        NOT NULL,
  name             text        NOT NULL,
  description      text,
  equipment        text,
  duration_minutes integer,
  --  A stage the operator may not leave until signed off. Carried now
  --  so Week 5's execution has somewhere to look.
  requires_signoff boolean     NOT NULL DEFAULT false,
  CONSTRAINT master_formula_stages_seq_uniq  UNIQUE (formula_id, sequence_no),
  CONSTRAINT master_formula_stages_code_uniq UNIQUE (formula_id, stage_code),
  CONSTRAINT master_formula_stages_seq_chk   CHECK (sequence_no > 0),
  CONSTRAINT master_formula_stages_duration_chk
    CHECK (duration_minutes IS NULL OR duration_minutes > 0)
);

CREATE INDEX IF NOT EXISTS master_formula_stages_formula_idx
  ON public.master_formula_stages (formula_id, sequence_no);

--  Added after the stages table exists, because a material line points
--  at a stage of its own formula.
ALTER TABLE public.master_formula_materials
  DROP CONSTRAINT IF EXISTS master_formula_materials_stage_fk;
ALTER TABLE public.master_formula_materials
  ADD CONSTRAINT master_formula_materials_stage_fk
  FOREIGN KEY (consumed_at_stage) REFERENCES public.master_formula_stages(id) ON DELETE SET NULL;


-- ── 4. Stage parameters, and the distinction that matters ────────────
CREATE TABLE IF NOT EXISTS public.master_formula_stage_parameters (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id        uuid        NOT NULL REFERENCES public.master_formula_stages(id) ON DELETE CASCADE,
  parameter       text        NOT NULL,
  --  THE REQUIREMENT. See the header: a machine setting is an
  --  instruction, a product attribute is an acceptance criterion, and
  --  the constraint below makes each carry what its kind needs.
  parameter_type  text        NOT NULL,
  unit            text,
  target_value    numeric(18,6),
  target_text     text,
  min_value       numeric(18,6),
  max_value       numeric(18,6),
  is_critical     boolean     NOT NULL DEFAULT false,
  sort_order      integer     NOT NULL DEFAULT 0,
  notes           text,
  CONSTRAINT master_formula_stage_param_uniq UNIQUE (stage_id, parameter),
  CONSTRAINT master_formula_stage_param_type_chk
    CHECK (parameter_type IN ('machine_setting','product_attribute')),
  CONSTRAINT master_formula_stage_param_range_chk
    CHECK (min_value IS NULL OR max_value IS NULL OR min_value <= max_value),

  --  A machine setting is an instruction: it must say what to set, as a
  --  number or as a named position. An instruction with no value tells
  --  an operator nothing.
  CONSTRAINT master_formula_stage_param_setting_chk CHECK (
    parameter_type <> 'machine_setting'
    OR target_value IS NOT NULL
    OR (target_text IS NOT NULL AND btrim(target_text) <> '')),

  --  A product attribute is an acceptance criterion: it must be
  --  judgeable. Without limits it would pass by being unjudgeable,
  --  which is the failure mode items 05 and 06 exist to prevent.
  CONSTRAINT master_formula_stage_param_attribute_chk CHECK (
    parameter_type <> 'product_attribute'
    OR min_value IS NOT NULL OR max_value IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS master_formula_stage_param_stage_idx
  ON public.master_formula_stage_parameters (stage_id, sort_order);
CREATE INDEX IF NOT EXISTS master_formula_stage_param_type_idx
  ON public.master_formula_stage_parameters (parameter_type)
  WHERE is_critical;

COMMENT ON COLUMN public.master_formula_stage_parameters.parameter_type IS
  'machine_setting = an instruction, set before the stage runs, and required to carry a target. product_attribute = an acceptance criterion, measured after, and required to carry limits. Both requirements are CHECK constraints, so downstream code can rely on them.';


-- ── 5. Cross-company and cross-formula integrity ─────────────────────
--  The formula, its product and its materials must all belong to one
--  company, and a material line must not point at a stage of a
--  different formula. Neither is expressible as a simple foreign key.
CREATE OR REPLACE FUNCTION public.fn_master_formulas_validate()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp
AS $$
DECLARE v_pc uuid;
BEGIN
  SELECT company_id INTO v_pc FROM public.products WHERE id = NEW.product_id;
  IF v_pc IS NULL THEN
    RAISE EXCEPTION 'MASTER_FORMULA_NO_PRODUCT: product % does not exist', NEW.product_id
      USING ERRCODE = 'P0002';
  END IF;
  IF v_pc <> NEW.company_id THEN
    RAISE EXCEPTION 'MASTER_FORMULA_CROSS_COMPANY: product % belongs to another company', NEW.product_id
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_master_formulas_validate ON public.master_formulas;
CREATE TRIGGER trg_master_formulas_validate
  BEFORE INSERT OR UPDATE ON public.master_formulas
  FOR EACH ROW EXECUTE FUNCTION public.fn_master_formulas_validate();


CREATE OR REPLACE FUNCTION public.fn_master_formula_materials_validate()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp
AS $$
DECLARE v_fc uuid; v_mc uuid; v_sf uuid;
BEGIN
  SELECT company_id INTO v_fc FROM public.master_formulas WHERE id = NEW.formula_id;
  SELECT company_id INTO v_mc FROM public.materials       WHERE id = NEW.material_id;

  IF v_mc IS NULL THEN
    RAISE EXCEPTION 'MASTER_FORMULA_NO_MATERIAL: material % does not exist', NEW.material_id
      USING ERRCODE = 'P0002';
  END IF;
  IF v_mc <> v_fc THEN
    RAISE EXCEPTION 'MASTER_FORMULA_CROSS_COMPANY: material % belongs to another company', NEW.material_id
      USING ERRCODE = 'P0001';
  END IF;

  IF NEW.consumed_at_stage IS NOT NULL THEN
    SELECT formula_id INTO v_sf FROM public.master_formula_stages WHERE id = NEW.consumed_at_stage;
    IF v_sf IS DISTINCT FROM NEW.formula_id THEN
      RAISE EXCEPTION 'MASTER_FORMULA_STAGE_MISMATCH: stage % belongs to a different formula', NEW.consumed_at_stage
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_master_formula_materials_validate ON public.master_formula_materials;
CREATE TRIGGER trg_master_formula_materials_validate
  BEFORE INSERT OR UPDATE ON public.master_formula_materials
  FOR EACH ROW EXECUTE FUNCTION public.fn_master_formula_materials_validate();


-- ── 6. An approved formula is frozen ─────────────────────────────────
--  The header. Only status may change, and only onward.
CREATE OR REPLACE FUNCTION public.fn_master_formulas_freeze()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.status <> 'approved' THEN RETURN NEW; END IF;

  --  Status may move on to superseded or withdrawn. Nothing else about
  --  an approved formula may change, and it may not go back to draft:
  --  that would be editing in place with extra steps.
  IF NEW.status NOT IN ('approved','superseded','withdrawn') THEN
    RAISE EXCEPTION 'MASTER_FORMULA_APPROVED_FROZEN: an approved formula cannot return to %. Create a new version with master_formula_new_version().', NEW.status
      USING ERRCODE = 'P0001';
  END IF;

  IF (NEW.product_id, NEW.version, NEW.batch_size, NEW.batch_size_unit,
      NEW.expected_yield_pct, NEW.yield_min_pct, NEW.yield_max_pct,
      NEW.effective_date, NEW.approved_by, NEW.signature_id, NEW.notes)
     IS DISTINCT FROM
     (OLD.product_id, OLD.version, OLD.batch_size, OLD.batch_size_unit,
      OLD.expected_yield_pct, OLD.yield_min_pct, OLD.yield_max_pct,
      OLD.effective_date, OLD.approved_by, OLD.signature_id, OLD.notes) THEN
    RAISE EXCEPTION 'MASTER_FORMULA_APPROVED_FROZEN: an approved formula cannot be edited. Create a new version with master_formula_new_version().'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_master_formulas_freeze ON public.master_formulas;
CREATE TRIGGER trg_master_formulas_freeze
  BEFORE UPDATE ON public.master_formulas
  FOR EACH ROW EXECUTE FUNCTION public.fn_master_formulas_freeze();

--  And the children. Freezing only the header would move the editing
--  one level down: a formula whose bill of materials can be rewritten
--  after approval is not versioned.
CREATE OR REPLACE FUNCTION public.fn_master_formula_child_freeze()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp
AS $$
DECLARE v_formula uuid; v_status text;
BEGIN
  --  Resolve the owning formula, whichever child table fired this and
  --  whichever direction the row is moving.
  IF TG_TABLE_NAME = 'master_formula_stage_parameters' THEN
    SELECT s.formula_id INTO v_formula FROM public.master_formula_stages s
     WHERE s.id = coalesce(NEW.stage_id, OLD.stage_id);
  ELSE
    v_formula := coalesce(NEW.formula_id, OLD.formula_id);
  END IF;

  SELECT status INTO v_status FROM public.master_formulas WHERE id = v_formula;

  IF v_status = 'approved' THEN
    RAISE EXCEPTION 'MASTER_FORMULA_APPROVED_FROZEN: % cannot be changed on an approved formula. Create a new version with master_formula_new_version().', TG_TABLE_NAME
      USING ERRCODE = 'P0001';
  END IF;

  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END $$;

DO $freeze$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['master_formula_materials','master_formula_stages',
                           'master_formula_stage_parameters']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_freeze ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_freeze
                      BEFORE INSERT OR UPDATE OR DELETE ON public.%I
                      FOR EACH ROW EXECUTE FUNCTION public.fn_master_formula_child_freeze()', t, t);
  END LOOP;
END
$freeze$;


-- ── 7. Approval ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.master_formula_approve(
  p_formula_id   uuid,
  p_signature_id uuid DEFAULT NULL,
  p_effective    date DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE f record; v_actor uuid := auth.uid(); v_prev uuid; n_mat integer; n_stg integer;
BEGIN
  SELECT * INTO f FROM public.master_formulas WHERE id = p_formula_id;
  IF f.id IS NULL THEN
    RAISE EXCEPTION 'MASTER_FORMULA_NOT_FOUND: no such formula %', p_formula_id
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.app_is_service_context()
     AND NOT public.app_is_company_member(f.company_id) THEN
    RAISE EXCEPTION 'MASTER_FORMULA_FORBIDDEN: caller is not a member of the owning company'
      USING ERRCODE = 'P0001';
  END IF;

  IF f.status <> 'draft' THEN
    RAISE EXCEPTION 'MASTER_FORMULA_NOT_DRAFT: formula % is %, only a draft can be approved',
      f.version, f.status USING ERRCODE = 'P0001';
  END IF;

  --  The same authority that releases material approves the formula it
  --  is dispensed against. Item 12 does not name a role; reusing item
  --  06's designation rather than inventing a second idea of "who may
  --  approve" keeps one answer to that question.
  IF NOT public.app_is_service_context() THEN
    IF v_actor IS NULL OR NOT public.material_is_qa_authority(f.company_id, v_actor) THEN
      RAISE EXCEPTION 'MASTER_FORMULA_FORBIDDEN: approving a master formula requires a designated QA authority'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  --  A formula with no materials or no stages is not a formula. Checked
  --  at approval rather than at insert, because a draft is built up a
  --  row at a time.
  SELECT count(*) INTO n_mat FROM public.master_formula_materials WHERE formula_id = p_formula_id;
  SELECT count(*) INTO n_stg FROM public.master_formula_stages    WHERE formula_id = p_formula_id;
  IF n_mat = 0 THEN
    RAISE EXCEPTION 'MASTER_FORMULA_NO_MATERIALS: formula % has no bill of materials', f.version
      USING ERRCODE = 'P0001';
  END IF;
  IF n_stg = 0 THEN
    RAISE EXCEPTION 'MASTER_FORMULA_NO_STAGES: formula % has no stages', f.version
      USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.master_formula_materials
                  WHERE formula_id = p_formula_id AND role = 'active') THEN
    RAISE EXCEPTION 'MASTER_FORMULA_NO_ACTIVE: formula % declares no active ingredient', f.version
      USING ERRCODE = 'P0001';
  END IF;

  --  The sequence must be 1..n with no gaps. A gap means a stage was
  --  removed and the numbering not repaired, and "what happens after
  --  stage 3" would have no answer.
  IF EXISTS (
    SELECT 1 FROM (
      SELECT sequence_no, row_number() OVER (ORDER BY sequence_no) AS rn
        FROM public.master_formula_stages WHERE formula_id = p_formula_id) q
     WHERE q.sequence_no <> q.rn) THEN
    RAISE EXCEPTION 'MASTER_FORMULA_STAGE_GAP: the stage sequence for % must run 1..n with no gaps', f.version
      USING ERRCODE = 'P0001';
  END IF;

  --  Supersede the formula this one replaces, inside the same
  --  transaction as the approval, so there is never a moment with two
  --  approved versions or none.
  SELECT id INTO v_prev FROM public.master_formulas
   WHERE product_id = f.product_id AND status = 'approved' AND id <> p_formula_id;

  IF v_prev IS NOT NULL THEN
    UPDATE public.master_formulas
       SET status = 'superseded', superseded_at = now(), updated_at = now()
     WHERE id = v_prev;
  END IF;

  UPDATE public.master_formulas
     SET status = 'approved', approved_by = coalesce(v_actor, created_by),
         approved_at = now(), signature_id = p_signature_id,
         effective_date = coalesce(p_effective, current_date), updated_at = now()
   WHERE id = p_formula_id;

  RETURN jsonb_build_object('formula_id', p_formula_id, 'version', f.version,
    'status', 'approved', 'superseded', v_prev,
    'materials', n_mat, 'stages', n_stg);
END $$;

COMMENT ON FUNCTION public.master_formula_approve(uuid,uuid,date) IS
  'Approves a draft master formula, superseding the product''s previous approved version in the same transaction. Requires a designated QA authority — the same designation that releases material. Refuses a formula with no materials, no stages, no active ingredient, or a gap in its stage sequence.';

REVOKE ALL ON FUNCTION public.master_formula_approve(uuid,uuid,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.master_formula_approve(uuid,uuid,date) TO authenticated, service_role;


-- ── 8. A new version, not an edit ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.master_formula_new_version(
  p_formula_id uuid,
  p_version    text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  f        record;
  v_new    uuid;
  v_ver    text;
  v_actor  uuid := auth.uid();
  v_map    jsonb := '{}'::jsonb;   -- old stage id -> new stage id
  r        record;
  v_sid    uuid;
BEGIN
  SELECT * INTO f FROM public.master_formulas WHERE id = p_formula_id;
  IF f.id IS NULL THEN
    RAISE EXCEPTION 'MASTER_FORMULA_NOT_FOUND: no such formula %', p_formula_id
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.app_is_service_context()
     AND NOT public.app_is_company_member(f.company_id) THEN
    RAISE EXCEPTION 'MASTER_FORMULA_FORBIDDEN: caller is not a member of the owning company'
      USING ERRCODE = 'P0001';
  END IF;

  --  Next version number, if the caller did not name one. Numeric
  --  versions increment; anything else needs an explicit name, because
  --  guessing the successor to "2.0-RevB" would be inventing a
  --  convention nobody asked for.
  v_ver := p_version;
  IF v_ver IS NULL THEN
    IF f.version ~ '^[0-9]+(\.[0-9]+)?$' THEN
      v_ver := (floor(f.version::numeric) + 1)::text || '.0';
    ELSE
      RAISE EXCEPTION 'MASTER_FORMULA_VERSION_REQUIRED: version "%" is not numeric, so the next version must be given explicitly', f.version
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  INSERT INTO public.master_formulas
    (company_id, product_id, version, status, batch_size, batch_size_unit,
     expected_yield_pct, yield_min_pct, yield_max_pct, supersedes_id, notes, created_by)
  VALUES (f.company_id, f.product_id, v_ver, 'draft', f.batch_size, f.batch_size_unit,
     f.expected_yield_pct, f.yield_min_pct, f.yield_max_pct, f.id, f.notes,
     coalesce(v_actor, f.created_by))
  RETURNING id INTO v_new;

  --  Stages first, keeping a map from old id to new, so the material
  --  lines below can point at the right stage of the NEW formula rather
  --  than at the old one.
  FOR r IN SELECT * FROM public.master_formula_stages
            WHERE formula_id = p_formula_id ORDER BY sequence_no
  LOOP
    INSERT INTO public.master_formula_stages
      (formula_id, sequence_no, stage_code, name, description, equipment,
       duration_minutes, requires_signoff)
    VALUES (v_new, r.sequence_no, r.stage_code, r.name, r.description, r.equipment,
       r.duration_minutes, r.requires_signoff)
    RETURNING id INTO v_sid;
    v_map := v_map || jsonb_build_object(r.id::text, v_sid);

    INSERT INTO public.master_formula_stage_parameters
      (stage_id, parameter, parameter_type, unit, target_value, target_text,
       min_value, max_value, is_critical, sort_order, notes)
    SELECT v_sid, p.parameter, p.parameter_type, p.unit, p.target_value, p.target_text,
           p.min_value, p.max_value, p.is_critical, p.sort_order, p.notes
      FROM public.master_formula_stage_parameters p
     WHERE p.stage_id = r.id;
  END LOOP;

  INSERT INTO public.master_formula_materials
    (formula_id, material_id, role, quantity_per_batch, unit, overage_pct,
     is_critical, consumed_at_stage, sort_order, notes)
  SELECT v_new, m.material_id, m.role, m.quantity_per_batch, m.unit, m.overage_pct,
         m.is_critical,
         CASE WHEN m.consumed_at_stage IS NULL THEN NULL
              ELSE (v_map->>m.consumed_at_stage::text)::uuid END,
         m.sort_order, m.notes
    FROM public.master_formula_materials m
   WHERE m.formula_id = p_formula_id;

  RETURN v_new;
END $$;

COMMENT ON FUNCTION public.master_formula_new_version(uuid,text) IS
  'Clones a formula and its whole tree — stages, stage parameters and bill of materials — into a new draft that records what it supersedes. Stage references on material lines are remapped to the new formula''s own stages. This is how an approved formula is changed, since editing one is refused.';

REVOKE ALL ON FUNCTION public.master_formula_new_version(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.master_formula_new_version(uuid,text) TO authenticated, service_role;


-- ── 9. The formula a batch would actually be made against ────────────
CREATE OR REPLACE VIEW public.master_formula_current
  WITH (security_invoker = true) AS
  SELECT f.id AS formula_id, f.company_id, f.product_id, p.product_code,
         p.trade_name, p.generic_name, p.dosage_form, p.strength,
         f.version, f.batch_size, f.batch_size_unit, f.expected_yield_pct,
         f.yield_min_pct, f.yield_max_pct, f.effective_date, f.approved_at,
         (SELECT count(*) FROM public.master_formula_materials mm WHERE mm.formula_id = f.id) AS material_lines,
         (SELECT count(*) FROM public.master_formula_stages ms WHERE ms.formula_id = f.id)   AS stages,
         (SELECT count(*) FROM public.master_formula_stage_parameters sp
            JOIN public.master_formula_stages ms2 ON ms2.id = sp.stage_id
           WHERE ms2.formula_id = f.id AND sp.parameter_type = 'machine_setting')            AS machine_settings,
         (SELECT count(*) FROM public.master_formula_stage_parameters sp
            JOIN public.master_formula_stages ms3 ON ms3.id = sp.stage_id
           WHERE ms3.formula_id = f.id AND sp.parameter_type = 'product_attribute')          AS product_attributes
    FROM public.master_formulas f
    JOIN public.products p ON p.id = f.product_id
   WHERE f.status = 'approved';

COMMENT ON VIEW public.master_formula_current IS
  'The approved master formula per product, with its machine settings and product attributes counted separately. security_invoker, so row-level security on the underlying tables applies — a view runs as its owner otherwise.';

REVOKE ALL ON public.master_formula_current FROM PUBLIC, anon;
GRANT SELECT ON public.master_formula_current TO authenticated, service_role;


-- ── 10. RLS, policies and grants ─────────────────────────────────────
ALTER TABLE public.master_formulas                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_formula_materials         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_formula_stages            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_formula_stage_parameters  ENABLE ROW LEVEL SECURITY;

DO $rls$
BEGIN
  --  The header carries company_id directly.
  EXECUTE 'DROP POLICY IF EXISTS master_formulas_select ON public.master_formulas';
  EXECUTE $p$CREATE POLICY master_formulas_select ON public.master_formulas
             FOR SELECT TO authenticated USING (public.app_is_company_member(company_id))$p$;
  EXECUTE 'DROP POLICY IF EXISTS master_formulas_insert ON public.master_formulas';
  EXECUTE $p$CREATE POLICY master_formulas_insert ON public.master_formulas
             FOR INSERT TO authenticated WITH CHECK (public.app_is_company_member(company_id))$p$;
  EXECUTE 'DROP POLICY IF EXISTS master_formulas_update ON public.master_formulas';
  EXECUTE $p$CREATE POLICY master_formulas_update ON public.master_formulas
             FOR UPDATE TO authenticated USING (public.app_is_company_member(company_id))
             WITH CHECK (public.app_is_company_member(company_id))$p$;
  EXECUTE 'DROP POLICY IF EXISTS master_formulas_delete ON public.master_formulas';
  EXECUTE $p$CREATE POLICY master_formulas_delete ON public.master_formulas
             FOR DELETE TO authenticated USING (public.app_is_company_member(company_id))$p$;
END
$rls$;

--  The children have no company_id: they are scoped through the formula,
--  so the two can never disagree about which company a line belongs to.
DO $rls2$
DECLARE t text; cmd text; pred text;
BEGIN
  FOREACH t IN ARRAY ARRAY['master_formula_materials','master_formula_stages']
  LOOP
    pred := format($x$EXISTS (SELECT 1 FROM public.master_formulas f
                               WHERE f.id = formula_id
                                 AND public.app_is_company_member(f.company_id))$x$);
    FOREACH cmd IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE']
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_'||lower(cmd), t);
      IF cmd = 'INSERT' THEN
        EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)',
                       t||'_insert', t, pred);
      ELSIF cmd = 'UPDATE' THEN
        EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',
                       t||'_update', t, pred, pred);
      ELSE
        EXECUTE format('CREATE POLICY %I ON public.%I FOR %s TO authenticated USING (%s)',
                       t||'_'||lower(cmd), t, cmd, pred);
      END IF;
    END LOOP;
  END LOOP;

  --  Stage parameters are two levels down.
  pred := $x$EXISTS (SELECT 1 FROM public.master_formula_stages s
                      JOIN public.master_formulas f ON f.id = s.formula_id
                     WHERE s.id = stage_id
                       AND public.app_is_company_member(f.company_id))$x$;
  FOREACH cmd IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.master_formula_stage_parameters',
                   'master_formula_stage_parameters_'||lower(cmd));
    IF cmd = 'INSERT' THEN
      EXECUTE format('CREATE POLICY %I ON public.master_formula_stage_parameters FOR INSERT TO authenticated WITH CHECK (%s)',
                     'master_formula_stage_parameters_insert', pred);
    ELSIF cmd = 'UPDATE' THEN
      EXECUTE format('CREATE POLICY %I ON public.master_formula_stage_parameters FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',
                     'master_formula_stage_parameters_update', pred, pred);
    ELSE
      EXECUTE format('CREATE POLICY %I ON public.master_formula_stage_parameters FOR %s TO authenticated USING (%s)',
                     'master_formula_stage_parameters_'||lower(cmd), cmd, pred);
    END IF;
  END LOOP;
END
$rls2$;

DO $grants$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['master_formulas','master_formula_materials',
                           'master_formula_stages','master_formula_stage_parameters']
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO service_role', t);
  END LOOP;
END
$grants$;

DROP TRIGGER IF EXISTS trg_master_formulas_touch ON public.master_formulas;
CREATE TRIGGER trg_master_formulas_touch
  BEFORE UPDATE ON public.master_formulas
  FOR EACH ROW EXECUTE FUNCTION public.fn_materials_touch_updated_at();
