-- ===================================================================
--  Week 4, closing the two gaps in items 05 and 06
--
--  The Week 4 brief says of materials and master formula: "Engineering
--  began materials in Week 3. Where existing work already meets an
--  item's criteria, tick it and report it. Do not rebuild it."
--
--  Audited against the merged Week 3 work, items 04, 05 and 06 are met
--  except for two clauses, which this migration adds. Nothing already
--  built is rebuilt here.
--
--    item 05  "Allergen attributes on the material record: contains, may
--              contain, processing aid, and a hidden flag. Attributes
--              only, no allergen module."
--
--    item 06  "Formula changes routed through change control."
-- ===================================================================


-- ── 1. Allergen attributes on the material record ────────────────────
--
--  ATTRIBUTES, NOT A REGISTER
--  --------------------------
--  Item 05's NOT DONE IF is explicit: "Allergen attributes built as a
--  register with workflow. That is deferred." So these are four columns
--  on `materials` and nothing else — no child table, no states, no
--  approval path. A register is a different shape and a later decision.
--
--  WHY THE VALUES ARE CONSTRAINED
--  ------------------------------
--  An unconstrained text[] invites 'milk', 'Milk', 'dairy' and 'MILK' to
--  mean the same thing and match none of each other. The moment anyone
--  asks "which materials contain milk" — which is the entire point of
--  recording this — free text stops answering. The permitted values are
--  the Codex Alimentarius list of foods known to cause hypersensitivity
--  (CXS 1-1985, General Standard for the Labelling of Prepackaged Foods,
--  clause 4.2.1.4), which is the list NAFDAC labelling follows.
--
--  Stored as snake_case identifiers rather than display text: these are
--  keys to match on, and the label belongs in the interface where it can
--  be translated.
CREATE OR REPLACE FUNCTION public.allergen_codex_list()
RETURNS text[]
LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT ARRAY[
    'cereals_containing_gluten',  -- wheat, rye, barley, oats, spelt and their hybrids
    'crustacea',
    'eggs',
    'fish',
    'peanuts',
    'soybeans',
    'milk',                       -- including lactose
    'tree_nuts',
    'sulphites'                   -- at 10 mg/kg or more, as SO2
  ]::text[];
$$;

COMMENT ON FUNCTION public.allergen_codex_list() IS
  'The Codex Alimentarius CXS 1-1985 clause 4.2.1.4 list of foods and ingredients known to cause hypersensitivity, as the identifiers the materials allergen columns accept. IMMUTABLE so the CHECK constraints below can call it.';

ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS allergen_contains        text[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS allergen_may_contain     text[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS allergen_processing_aid  text[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS allergen_hidden          boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.materials.allergen_contains IS
  'Allergens the material contains as an intended ingredient.';
COMMENT ON COLUMN public.materials.allergen_may_contain IS
  'Allergens that may be present through cross-contact, not deliberately added.';
COMMENT ON COLUMN public.materials.allergen_processing_aid IS
  'Allergens present as a processing aid. Recorded separately because labelling rules treat an aid differently from an ingredient, and because the distinction is the one most often lost when all three are collapsed into one list.';
COMMENT ON COLUMN public.materials.allergen_hidden IS
  'The material carries an allergen its NAME does not reveal — casein in a non-dairy creamer, lysozyme in wine. It is the case that a reader checking the ingredient name alone would miss, which is why it is a flag and not an inference.';

--  Each column admits only Codex identifiers. `<@` is array containment:
--  every element of the left array must appear in the right.
DO $allergen_checks$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'materials_allergen_contains_chk') THEN
    ALTER TABLE public.materials ADD CONSTRAINT materials_allergen_contains_chk
      CHECK (allergen_contains <@ public.allergen_codex_list());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'materials_allergen_may_contain_chk') THEN
    ALTER TABLE public.materials ADD CONSTRAINT materials_allergen_may_contain_chk
      CHECK (allergen_may_contain <@ public.allergen_codex_list());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'materials_allergen_aid_chk') THEN
    ALTER TABLE public.materials ADD CONSTRAINT materials_allergen_aid_chk
      CHECK (allergen_processing_aid <@ public.allergen_codex_list());
  END IF;

  --  A hidden flag with no allergen recorded anywhere says "something is
  --  hidden" and nothing else, which is worse than silence: it reads as
  --  a warning nobody can act on.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'materials_allergen_hidden_chk') THEN
    ALTER TABLE public.materials ADD CONSTRAINT materials_allergen_hidden_chk
      CHECK (
        allergen_hidden = false
        OR cardinality(allergen_contains) > 0
        OR cardinality(allergen_may_contain) > 0
        OR cardinality(allergen_processing_aid) > 0
      );
  END IF;
END
$allergen_checks$;

--  Answering "which materials carry this allergen" is the reason the data
--  exists, so the arrays are indexed for containment.
CREATE INDEX IF NOT EXISTS materials_allergen_contains_idx
  ON public.materials USING gin (allergen_contains);
CREATE INDEX IF NOT EXISTS materials_allergen_may_contain_idx
  ON public.materials USING gin (allergen_may_contain);


-- ── 2. Formula changes routed through change control ─────────────────
--
--  WHAT "ROUTED THROUGH" IS TAKEN TO MEAN
--  --------------------------------------
--  A CHANGE goes through change control. Creating a formula that never
--  existed is not a change, so a first version is not gated — there is
--  nothing to assess the impact of against. master_formulas.supersedes_id
--  draws that line exactly: it is null on a first version and set on
--  every revision, because master_formula_new_version() sets it.
--
--  So the gate is: a formula that supersedes another cannot be APPROVED
--  until a change control of type 'formulation' is linked and itself
--  approved. Drafting a new version stays free — the point of change
--  control is to govern what takes effect, not to stop people working.
ALTER TABLE public.master_formulas
  ADD COLUMN IF NOT EXISTS change_control_id uuid
    REFERENCES public.change_controls(id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.master_formulas.change_control_id IS
  'The change control governing this revision. Required before a formula that supersedes another can be approved; null on a first version, which is a creation rather than a change. ON DELETE RESTRICT so the governing record cannot be removed out from under an approved formula.';

CREATE INDEX IF NOT EXISTS master_formulas_change_control_idx
  ON public.master_formulas(change_control_id)
  WHERE change_control_id IS NOT NULL;

--  The gate itself. A BEFORE UPDATE trigger rather than an edit to
--  master_formula_approve(), deliberately: the RPC is one way in, and a
--  control that only exists inside it is a control anyone can walk around
--  with a direct UPDATE. The same reasoning as the Week 3 status mirrors.
CREATE OR REPLACE FUNCTION public.fn_master_formula_change_control_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE cc record;
BEGIN
  --  Only the draft -> approved transition is gated.
  IF NEW.status <> 'approved' OR OLD.status = 'approved' THEN
    RETURN NEW;
  END IF;

  --  A first version is a creation, not a change.
  IF NEW.supersedes_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.change_control_id IS NULL THEN
    RAISE EXCEPTION
      'MASTER_FORMULA_CHANGE_CONTROL_REQUIRED: version % supersedes formula % and cannot be approved without a change control. Raise one of type ''formulation'', have it approved, and set change_control_id.',
      NEW.version, NEW.supersedes_id
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO cc FROM public.change_controls WHERE id = NEW.change_control_id;

  IF cc.id IS NULL THEN
    RAISE EXCEPTION 'MASTER_FORMULA_CHANGE_CONTROL_NOT_FOUND: no change control %',
      NEW.change_control_id USING ERRCODE = 'P0002';
  END IF;

  --  A change control belonging to another company would let one tenant
  --  authorise another's formula.
  IF cc.company_id <> NEW.company_id THEN
    RAISE EXCEPTION
      'MASTER_FORMULA_CHANGE_CONTROL_FOREIGN: change control % belongs to another company',
      NEW.change_control_id USING ERRCODE = 'P0001';
  END IF;

  IF cc.change_type <> 'formulation' THEN
    RAISE EXCEPTION
      'MASTER_FORMULA_CHANGE_CONTROL_WRONG_TYPE: change control % is of type %, expected ''formulation''',
      NEW.change_control_id, cc.change_type USING ERRCODE = 'P0001';
  END IF;

  --  'approved' and everything after it mean the assessment is done and
  --  the change is authorised to proceed. Anything earlier does not.
  IF cc.status NOT IN ('approved', 'implementing', 'verification', 'closed') THEN
    RAISE EXCEPTION
      'MASTER_FORMULA_CHANGE_CONTROL_NOT_APPROVED: change control % is %, so version % cannot take effect',
      NEW.change_control_id, cc.status, NEW.version
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_master_formula_change_control_gate ON public.master_formulas;
CREATE TRIGGER trg_master_formula_change_control_gate
  BEFORE UPDATE ON public.master_formulas
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_master_formula_change_control_gate();

COMMENT ON FUNCTION public.fn_master_formula_change_control_gate() IS
  'Refuses to let a formula that supersedes another reach approved status without a linked, approved change control of type formulation, belonging to the same company. A trigger rather than a check inside master_formula_approve(), so a direct UPDATE cannot walk around it.';
