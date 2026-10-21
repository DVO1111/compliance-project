-- =====================================================================
--  W5·11 · Deviation screens
-- =====================================================================
--  Items 02, 03, 07 and 11 built the deviation record, the CAPA link,
--  the root cause tables and the entry points. This migration adds the
--  four things the screens need that nothing holds or reports yet, and
--  nothing else.
--
--  1. WHICH FRAMEWORK AN ANALYSIS USES. The design's own check against
--     the PRD is explicit:
--
--       "Root cause uses one framework per analysis, configurable per
--        company (B2.6; root_cause_analyses.framework). Five whys and
--        5W1H no longer appear together."
--
--     Today root_cause_analyses carries the six 5W1H columns AND has
--     root_cause_whys hanging off it, with nothing saying which one is
--     in use. So an analysis can hold both, a screen cannot tell which
--     to draw, and DV-05 and DV-05b are the same record rendered two
--     ways. The column is added, backfilled from what each analysis
--     actually contains, and enforced in both directions.
--
--  2. THE CATEGORY LIST BELONGS TO THE COMPANY. root_cause_category is
--     a fixed CHECK list today (human_error, equipment, …). The PRD
--     stores it as free text and the screens offer a list the company
--     defines, defaulting to People / Machine / Method / Material /
--     Measurement / Environment. Decision 10 asks the lead to confirm
--     that default, which is a row to change rather than a deploy.
--
--  3. WHAT EACH IMPACT OPTION WILL DO, BEFORE IT IS CHOSEN. "Severity
--     and impact are deliberate choices, and each impact option states
--     its effect on release" — "This will block release of
--     PCM-2610-014", named, on the screen, before Raise is pressed.
--     Nothing could answer that: the release gate reads
--     deviation_open_for_batch AFTER a deviation exists. Same shape as
--     W4·18's conditions — the report is derived from the gate's own
--     rule, so the sentence cannot promise something the gate will not
--     do.
--
--  4. THE REGISTER AND THE CLOSURE CHECKLIST. Overdue first (DV-09),
--     and the readiness DV-07 shows before the signature panel.
--
--  ═══════════════════════════════════════════════════════════════════
--  "UNDETERMINED BLOCKS" IS A COMPANY SETTING, NOT A CONSTANT
--  ═══════════════════════════════════════════════════════════════════
--  Decision 1 for the lead: "'Undetermined' is shown as blocking
--  release (item 02 safe default, a configuration value). Confirm with
--  Damilola or Busayo."
--
--  So it is a column with a safe default rather than a branch in a
--  function. Confirming it is then a row somebody changes; reversing
--  it is the same row. Writing `undetermined → blocks` into the
--  consequence function would have made an unconfirmed decision into a
--  deploy, and the next person would have had to find it.
--
--  ═══════════════════════════════════════════════════════════════════
--  THE CLOSURE CHECKLIST REPORTS; IT DOES NOT GATE
--  ═══════════════════════════════════════════════════════════════════
--  Decision 4 is open: "'Send for QA closure' needs a root cause plus
--  a CAPA linked, or 'CAPA not needed' with a reason. Confirm the
--  rule." Until it is confirmed, deviation_closure_readiness() REPORTS
--  each condition with `blocking` set from what is already enforced,
--  and the CAPA rule comes back advisory. No new transition guard is
--  added. A gate built on an unconfirmed rule is one somebody has to
--  discover and unpick; a report that turns into a gate is one line.
-- =====================================================================


-- ── 1. One framework per analysis ────────────────────────────────────
ALTER TABLE public.root_cause_analyses
  ADD COLUMN IF NOT EXISTS framework text;

--  BACKFILLED FROM WHAT EACH ANALYSIS ACTUALLY HOLDS, not defaulted.
--  An analysis with a chain of whys is a five-whys analysis whatever a
--  default would have said, and stamping them all 'five_whys' would
--  mislabel every 5W1H one already recorded.
UPDATE public.root_cause_analyses a
   SET framework = CASE
     WHEN EXISTS (SELECT 1 FROM public.root_cause_whys w WHERE w.analysis_id = a.id)
       THEN 'five_whys'
     WHEN coalesce(a.w5h1_what, a.w5h1_why, a.w5h1_where,
                   a.w5h1_when, a.w5h1_who, a.w5h1_how) IS NOT NULL
       THEN '5w1h'
     --  Empty either way. 'five_whys' is the conventional default and
     --  the analysis has nothing in it to contradict.
     ELSE 'five_whys'
   END
 WHERE a.framework IS NULL;

DO $rca_framework$
BEGIN
  IF EXISTS (SELECT 1 FROM public.root_cause_analyses WHERE framework IS NULL) THEN
    RAISE EXCEPTION 'W5_11_VIOLATION: the framework backfill left rows null';
  END IF;

  ALTER TABLE public.root_cause_analyses ALTER COLUMN framework SET NOT NULL;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='rca_framework_chk') THEN
    ALTER TABLE public.root_cause_analyses ADD CONSTRAINT rca_framework_chk
      CHECK (framework IN ('five_whys','5w1h'));
  END IF;

  --  THE HALF THAT LIVES ON THIS TABLE. A five-whys analysis holds no
  --  5W1H answers; the other half — that a 5W1H analysis holds no whys
  --  — is a different table and needs a trigger.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='rca_one_framework_chk') THEN
    ALTER TABLE public.root_cause_analyses ADD CONSTRAINT rca_one_framework_chk
      CHECK (
        framework <> 'five_whys'
        OR coalesce(w5h1_what, w5h1_why, w5h1_where,
                    w5h1_when, w5h1_who, w5h1_how) IS NULL
      );
  END IF;
END $rca_framework$;

COMMENT ON COLUMN public.root_cause_analyses.framework IS
  'Which framework THIS analysis uses: five_whys or 5w1h, never both. The company sets a default (company_rca_settings) and the analysis records what was actually used, because a company can change its default and an analysis already done was done one way. Enforced in both directions: a CHECK keeps 5W1H answers off a five-whys analysis, and a trigger on root_cause_whys keeps whys off a 5W1H one.';

--  THE OTHER HALF. A why cannot be added to an analysis that is not
--  using five whys, and changing an analysis's framework cannot strand
--  a chain of whys behind it.
CREATE OR REPLACE FUNCTION public.fn_rcw_framework_matches()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE v_framework text;
BEGIN
  SELECT framework INTO v_framework
    FROM public.root_cause_analyses WHERE id = NEW.analysis_id;

  IF v_framework <> 'five_whys' THEN
    RAISE EXCEPTION
      'RCA_WRONG_FRAMEWORK: this analysis is using %, so it has no chain of whys. One framework per analysis — see DV-05 and DV-05b.',
      v_framework USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rcw_framework_matches ON public.root_cause_whys;
CREATE TRIGGER trg_rcw_framework_matches
  BEFORE INSERT OR UPDATE ON public.root_cause_whys
  FOR EACH ROW EXECUTE FUNCTION public.fn_rcw_framework_matches();

CREATE OR REPLACE FUNCTION public.fn_rca_framework_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.framework IS DISTINCT FROM OLD.framework
     AND OLD.framework = 'five_whys'
     AND EXISTS (SELECT 1 FROM public.root_cause_whys w WHERE w.analysis_id = OLD.id) THEN
    RAISE EXCEPTION
      'RCA_FRAMEWORK_HAS_CONTENT: this analysis has a chain of whys recorded against it. Switching framework would leave them behind, visible to nobody and still in the record. Delete them deliberately first, or start a new analysis.'
      USING ERRCODE = 'P0001';
  END IF;

  --  A completed analysis is a conclusion somebody signed up to. Its
  --  framework is part of how that conclusion was reached.
  IF NEW.framework IS DISTINCT FROM OLD.framework AND OLD.completed_at IS NOT NULL THEN
    RAISE EXCEPTION
      'RCA_COMPLETED: this analysis was completed at % and its framework cannot be changed.',
      OLD.completed_at USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rca_framework_change ON public.root_cause_analyses;
CREATE TRIGGER trg_rca_framework_change
  BEFORE UPDATE ON public.root_cause_analyses
  FOR EACH ROW EXECUTE FUNCTION public.fn_rca_framework_change();


-- ── 2. The company's default framework ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.company_rca_settings (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,

  --  "Configurable per company" (B2.6). A default, not a restriction:
  --  the analysis records what was used, so a company that changes its
  --  mind does not rewrite the analyses already done.
  default_framework text NOT NULL DEFAULT 'five_whys'
    CHECK (default_framework IN ('five_whys','5w1h')),

  --  DECISION 1 FOR THE LEAD, as a row. Item 02's safe default is that
  --  an undetermined impact blocks release until it is assessed;
  --  confirming or reversing that is this column rather than a deploy.
  undetermined_blocks_release boolean NOT NULL DEFAULT true,

  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.company_rca_settings IS
  'Per-company root cause and deviation settings. default_framework is B2.6. undetermined_blocks_release is W5·11 decision 1 for the lead, held as a configuration value with item 02''s safe default rather than as a branch in a function — so answering it is a row, and reversing it is the same row.';

ALTER TABLE public.company_rca_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crs_select ON public.company_rca_settings;
CREATE POLICY crs_select ON public.company_rca_settings FOR SELECT TO authenticated
  USING (public.app_is_company_member(company_id));

DROP POLICY IF EXISTS crs_write ON public.company_rca_settings;
CREATE POLICY crs_write ON public.company_rca_settings FOR ALL TO authenticated
  USING (public.app_is_company_member(company_id))
  WITH CHECK (public.app_is_company_member(company_id));

/**
 * The settings for a company, with the defaults filled in.
 *
 * READS WITHOUT WRITING. A company that has never opened the settings
 * screen has no row, and a function that inserted one on read would
 * turn every screen load into a write — and would need to be VOLATILE,
 * which stops it being usable from a view or a SELECT list.
 */
CREATE OR REPLACE FUNCTION public.company_rca_settings_effective(p_company_id uuid)
RETURNS TABLE (
  default_framework text,
  undetermined_blocks_release boolean,
  configured boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT coalesce(s.default_framework, 'five_whys'),
         coalesce(s.undetermined_blocks_release, true),
         (s.company_id IS NOT NULL)
  FROM (SELECT p_company_id AS cid) q
  LEFT JOIN public.company_rca_settings s ON s.company_id = q.cid
  WHERE public.app_is_service_context() OR public.app_is_company_member(p_company_id);
$$;

COMMENT ON FUNCTION public.company_rca_settings_effective(uuid) IS
  'A company''s deviation and root cause settings with the defaults applied, and whether any were actually configured. Reads without writing: a company that has never opened the settings screen has no row, and inserting one on read would make every screen load a write.';

REVOKE ALL ON FUNCTION public.company_rca_settings_effective(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.company_rca_settings_effective(uuid)
  TO authenticated, service_role;


-- ── 3. The company's root cause categories ───────────────────────────
--
--  "The PRD stores it as free text. The screens offer a company-defined
--   list (People, Machine, Method, Material, Measurement, Environment
--   as the default)." (Decision 10.)
CREATE TABLE IF NOT EXISTS public.root_cause_categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  --  Stable across renames: the analyses store the key, the screens
  --  show the label.
  category_key text NOT NULL,
  label        text NOT NULL,
  sort_order   integer NOT NULL DEFAULT 0,
  --  A RETIRED CATEGORY IS NOT DELETED. Analyses already completed
  --  against it stay valid and still read correctly; it simply stops
  --  being offered. Deleting instead would either orphan history or
  --  force a rewrite of it.
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT rcc_key_per_company UNIQUE (company_id, category_key),
  CONSTRAINT rcc_key_not_blank CHECK (btrim(category_key) <> ''),
  CONSTRAINT rcc_label_not_blank CHECK (btrim(label) <> '')
);

CREATE INDEX IF NOT EXISTS rcc_company_idx
  ON public.root_cause_categories (company_id, sort_order);

COMMENT ON TABLE public.root_cause_categories IS
  'The root cause categories a company offers. Seeded with the six the design proposes (People, Machine, Method, Material, Measurement, Environment) — decision 10 for the lead, which is a row to change. A category is retired by clearing is_active, never deleted: analyses completed against it stay valid and still read correctly.';

ALTER TABLE public.root_cause_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rcc_select ON public.root_cause_categories;
CREATE POLICY rcc_select ON public.root_cause_categories FOR SELECT TO authenticated
  USING (public.app_is_company_member(company_id));

DROP POLICY IF EXISTS rcc_write ON public.root_cause_categories;
CREATE POLICY rcc_write ON public.root_cause_categories FOR ALL TO authenticated
  USING (public.app_is_company_member(company_id))
  WITH CHECK (public.app_is_company_member(company_id));

/**
 * The six the design proposes, as data rather than as six literals
 * repeated in a seed and a fallback.
 */
CREATE OR REPLACE FUNCTION public.root_cause_categories_default()
RETURNS TABLE (category_key text, label text, sort_order integer)
LANGUAGE sql IMMUTABLE SET search_path = pg_temp
AS $$
  SELECT * FROM (VALUES
    ('people',      'People',      10),
    ('machine',     'Machine',     20),
    ('method',      'Method',      30),
    ('material',    'Material',    40),
    ('measurement', 'Measurement', 50),
    ('environment', 'Environment', 60)
  ) AS v(category_key, label, sort_order);
$$;

REVOKE ALL ON FUNCTION public.root_cause_categories_default() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.root_cause_categories_default()
  TO authenticated, service_role;

/**
 * THE LIST A COMPANY ACTUALLY HAS, seeded or not.
 *
 * A company with no rows gets the six defaults rather than an empty
 * picker. This is not politeness: without it the list would depend on
 * whether the company existed when this migration ran, so every
 * company created afterwards would have no categories and no analysis
 * could be completed — a failure that would not show up until weeks
 * later, in a tenant nobody was testing.
 *
 * Reads without writing, for the same reason as
 * company_rca_settings_effective. `seeded` says which it is, so a
 * settings screen can offer to make the defaults editable.
 */
CREATE OR REPLACE FUNCTION public.root_cause_categories_effective(p_company_id uuid)
RETURNS TABLE (
  category_key text,
  label        text,
  sort_order   integer,
  is_active    boolean,
  seeded       boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT c.category_key, c.label, c.sort_order, c.is_active, true
    FROM public.root_cause_categories c
   WHERE c.company_id = p_company_id
     AND (public.app_is_service_context() OR public.app_is_company_member(p_company_id))
  UNION ALL
  SELECT d.category_key, d.label, d.sort_order, true, false
    FROM public.root_cause_categories_default() d
   WHERE (public.app_is_service_context() OR public.app_is_company_member(p_company_id))
     AND NOT EXISTS (SELECT 1 FROM public.root_cause_categories c2
                      WHERE c2.company_id = p_company_id)
  ORDER BY 3, 1;
$$;

COMMENT ON FUNCTION public.root_cause_categories_effective(uuid) IS
  'The root cause categories a company offers, falling back to the six defaults when it has none of its own. The fallback is load-bearing: without it the list would depend on whether the company existed when this migration ran, and every company created afterwards would have an empty picker and no completable analysis.';

REVOKE ALL ON FUNCTION public.root_cause_categories_effective(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.root_cause_categories_effective(uuid)
  TO authenticated, service_role;

/**
 * Writes a company's list down so it can be edited.
 *
 * The six defaults active, plus ANY KEY ALREADY IN USE by that company
 * retired. The second half is what stops this migration invalidating
 * history: the old CHECK list admitted 'human_error' and
 * 'management_system', analyses were completed against them, and a
 * list that omitted them would make those analyses fail the new
 * validation while being perfectly good records of what happened.
 */
CREATE OR REPLACE FUNCTION public.root_cause_categories_seed(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.root_cause_categories (company_id, category_key, label, sort_order)
  SELECT p_company_id, d.category_key, d.label, d.sort_order
    FROM public.root_cause_categories_default() d
  ON CONFLICT (company_id, category_key) DO NOTHING;

  --  Anything this company already recorded, kept but not offered.
  INSERT INTO public.root_cause_categories
    (company_id, category_key, label, sort_order, is_active)
  SELECT DISTINCT a.company_id, a.root_cause_category,
         initcap(replace(a.root_cause_category, '_', ' ')), 900, false
    FROM public.root_cause_analyses a
   WHERE a.company_id = p_company_id
     AND a.root_cause_category IS NOT NULL
  ON CONFLICT (company_id, category_key) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.root_cause_categories_seed(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.root_cause_categories_seed(uuid) TO authenticated, service_role;

--  Seed every company that exists now.
DO $rcc_seed$
DECLARE c uuid;
BEGIN
  FOR c IN SELECT id FROM public.companies LOOP
    PERFORM public.root_cause_categories_seed(c);
  END LOOP;
END $rcc_seed$;

--  The old fixed list goes, because the list is the company's now. The
--  column stays text, as the PRD has it; what replaces the CHECK is a
--  validation AT COMPLETION only — a draft may hold anything while
--  somebody is still deciding, and a conclusion must name a category
--  the company actually offers.
DO $rcc_relax$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint
              WHERE conname = 'root_cause_analyses_root_cause_category_check') THEN
    ALTER TABLE public.root_cause_analyses
      DROP CONSTRAINT root_cause_analyses_root_cause_category_check;
  END IF;
END $rcc_relax$;

CREATE OR REPLACE FUNCTION public.fn_rca_category_offered()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.completed_at IS NULL OR NEW.root_cause_category IS NULL THEN
    RETURN NEW;
  END IF;

  --  Active OR retired. A retired category is still a true record of a
  --  conclusion reached while it was offered, and refusing it here
  --  would make a company unable to re-save an old analysis after
  --  tidying its list.
  --  THE EFFECTIVE LIST, not the table. A company that has never
  --  customised its categories still has the six defaults, and
  --  validating against the table alone would refuse every conclusion
  --  from every company created after this migration ran.
  IF NOT EXISTS (
    SELECT 1 FROM public.root_cause_categories_effective(NEW.company_id) c
     WHERE c.category_key = NEW.root_cause_category
  ) THEN
    RAISE EXCEPTION
      'RCA_CATEGORY_NOT_OFFERED: "%" is not one of this company''s root cause categories. The list is per company and is managed in settings.',
      NEW.root_cause_category USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rca_category_offered ON public.root_cause_analyses;
CREATE TRIGGER trg_rca_category_offered
  BEFORE INSERT OR UPDATE ON public.root_cause_analyses
  FOR EACH ROW EXECUTE FUNCTION public.fn_rca_category_offered();


-- ── 4. What each impact option will do ───────────────────────────────
--
--  DV-01/DV-03: all three options start empty, and each states its
--  effect on release BEFORE Raise is pressed — naming the record, not
--  describing a rule in the abstract. "This will block release of
--  PCM-2610-014."
--
--  DERIVED FROM THE GATE'S OWN RULE, in the W4·18 shape: `effect` is
--  what release will actually do, so the sentence on the sheet cannot
--  promise something the gate will not honour.
CREATE OR REPLACE FUNCTION public.deviation_impact_consequence(
  p_company_id  uuid,
  p_source_type text,
  p_source_id   uuid DEFAULT NULL
)
RETURNS TABLE (
  impact      text,     -- 'yes' | 'no' | 'undetermined'
  label       text,
  effect      text,     -- 'blocks' | 'warns' | 'none'
  --  The sentence the screen prints under the option. Names the record
  --  where there is one to name.
  consequence text,
  sort_order  integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_undetermined_blocks boolean;
  v_subject text;        -- what release is affected, named
  v_batches integer := 0;
BEGIN
  IF NOT public.app_is_service_context()
     AND NOT public.app_is_company_member(p_company_id) THEN
    RAISE EXCEPTION 'DEVIATION_FORBIDDEN: caller is not a member of the owning company'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT e.undetermined_blocks_release INTO v_undetermined_blocks
    FROM public.company_rca_settings_effective(p_company_id) e;

  --  NAME THE RECORD. "This will block release" is a rule; "this will
  --  block release of PCM-2610-014" is a consequence somebody can
  --  weigh, which is the whole reason the design states it here.
  IF p_source_type = 'batch' AND p_source_id IS NOT NULL THEN
    SELECT b.batch_number INTO v_subject
      FROM public.batch_records b
     WHERE b.id = p_source_id AND b.company_id = p_company_id;

  ELSIF p_source_type = 'material_lot' AND p_source_id IS NOT NULL THEN
    SELECT l.lot_number INTO v_subject
      FROM public.material_lots l
     WHERE l.id = p_source_id AND l.company_id = p_company_id;

    --  2.5: a lot with an open deviation is a warning on the batches
    --  that used it. How many there are changes what the sentence
    --  should say, so it is counted rather than described vaguely.
    SELECT count(DISTINCT d.batch_id)::integer INTO v_batches
      FROM public.dispensing_records d
     WHERE d.material_lot_id = p_source_id;
  END IF;

  RETURN QUERY
  SELECT * FROM (VALUES
    ('yes', 'Yes — product quality is affected', 'blocks',
     CASE
       WHEN p_source_type = 'batch' AND v_subject IS NOT NULL
         THEN format('This will block release of batch %s until the deviation is closed.',
                     v_subject)
       WHEN p_source_type = 'material_lot' AND v_subject IS NOT NULL
         THEN format('This will block release of lot %s%s until the deviation is closed.',
                     v_subject,
                     CASE WHEN v_batches > 0
                          THEN format(', and warn on the %s batch%s that used it',
                                      v_batches, CASE WHEN v_batches = 1 THEN '' ELSE 'es' END)
                          ELSE '' END)
       ELSE 'This will block release of anything this deviation is linked to, '
            || 'until it is closed.'
     END,
     1),

    ('no', 'No — product quality is not affected', 'warns',
     CASE
       WHEN p_source_type = 'batch' AND v_subject IS NOT NULL
         THEN format('Release of batch %s will carry a warning, not a block.', v_subject)
       WHEN p_source_type = 'material_lot' AND v_subject IS NOT NULL
         THEN format('Release of lot %s will carry a warning, not a block.', v_subject)
       ELSE 'Release will carry a warning, not a block.'
     END,
     2),

    ('undetermined', 'Undetermined — not yet assessed',
     CASE WHEN v_undetermined_blocks THEN 'blocks' ELSE 'warns' END,
     CASE
       WHEN v_undetermined_blocks AND p_source_type = 'batch' AND v_subject IS NOT NULL
         THEN format('This will block release of batch %s until somebody assesses the '
                     || 'impact. Undetermined is a real answer; blank is not.', v_subject)
       WHEN v_undetermined_blocks
         THEN 'This will block release until somebody assesses the impact. '
              || 'Undetermined is a real answer; blank is not.'
       ELSE 'Release will carry a warning until somebody assesses the impact. '
            || 'Undetermined is a real answer; blank is not.'
     END,
     3)
  ) AS v(impact, label, effect, consequence, sort_order)
  ORDER BY v.sort_order;
END;
$$;

COMMENT ON FUNCTION public.deviation_impact_consequence(uuid,text,uuid) IS
  'What each of the three impact options will do to release, named against the record being raised from, for the raise sheet to print before anything is chosen. Derived from the gate''s own rule — including whether undetermined blocks, which is a company setting (W5·11 decision 1) rather than a constant — so the sentence cannot promise something release will not honour. There is no fourth row for "blank": blank is not an option, it is the absence of one.';

REVOKE ALL ON FUNCTION public.deviation_impact_consequence(uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deviation_impact_consequence(uuid,text,uuid)
  TO authenticated, service_role;


-- ── 5. The register ──────────────────────────────────────────────────
--  DV-09: "overdue rows sorted first". DV-10: empty.
--
--  OVERDUE IS DERIVED, NOT STORED. A stored flag is wrong the morning
--  after it was written, and the thing an operator trusts least is a
--  list that says "overdue" about something due next week.
CREATE OR REPLACE FUNCTION public.deviation_register(
  p_company_id uuid,
  p_include_closed boolean DEFAULT false
)
RETURNS TABLE (
  id uuid,
  deviation_number text,
  title text,
  severity text,
  product_quality_impact text,
  source_type text,
  source_id uuid,
  --  What it was raised against, named. The register is read by people
  --  who know batch numbers, not uuids.
  source_label text,
  state_key text,
  state_label text,
  investigation_owner uuid,
  investigation_due_date date,
  days_overdue integer,
  is_overdue boolean,
  raised_at timestamptz,
  closed_at timestamptz,
  linked_capa_count integer,
  sort_order integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.app_is_service_context()
     AND NOT public.app_is_company_member(p_company_id) THEN
    RAISE EXCEPTION 'DEVIATION_FORBIDDEN: caller is not a member of the owning company'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  WITH rows AS (
    SELECT d.*, s.state_key AS sk, s.label AS slabel,
           CASE
             WHEN s.state_key = 'closed' THEN false
             WHEN d.investigation_due_date IS NULL THEN false
             ELSE d.investigation_due_date < current_date
           END AS overdue,
           CASE
             WHEN s.state_key = 'closed' OR d.investigation_due_date IS NULL THEN NULL
             ELSE (current_date - d.investigation_due_date)
           END AS od
      FROM public.deviations d
      JOIN public.entity_current_state ecs
        ON ecs.entity_type = 'deviation' AND ecs.entity_id = d.id
      JOIN public.lifecycle_states s ON s.id = ecs.state_id
     WHERE d.company_id = p_company_id
       AND (p_include_closed OR s.state_key <> 'closed')
  )
  SELECT r.id, r.deviation_number, r.title, r.severity, r.product_quality_impact,
         r.source_type, r.source_id,
         CASE r.source_type
           WHEN 'batch' THEN (SELECT b.batch_number FROM public.batch_records b
                               WHERE b.id = r.source_id)
           WHEN 'material_lot' THEN (SELECT l.lot_number FROM public.material_lots l
                                      WHERE l.id = r.source_id)
           WHEN 'equipment' THEN (SELECT i.code FROM public.instruments i
                                   WHERE i.id = r.source_id)
           ELSE initcap(r.source_type)
         END,
         r.sk, r.slabel,
         r.investigation_owner, r.investigation_due_date,
         r.od::integer, r.overdue,
         r.raised_at, r.closed_at,
         (SELECT count(*)::integer FROM public.deviation_links dl
           WHERE dl.deviation_id = r.id AND dl.linked_type = 'capa'),
         --  OVERDUE FIRST, then the gravest, then the oldest. Severity
         --  second rather than first: a minor deviation three weeks
         --  past its date is a worse sign about the system than a
         --  critical one raised this morning, and the register is read
         --  to find what has been forgotten.
         (CASE WHEN r.overdue THEN 0 ELSE 1 END)
    FROM rows r
   ORDER BY (CASE WHEN r.overdue THEN 0 ELSE 1 END),
            (CASE r.severity WHEN 'critical' THEN 0 WHEN 'major' THEN 1 ELSE 2 END),
            r.raised_at;
END;
$$;

COMMENT ON FUNCTION public.deviation_register(uuid,boolean) IS
  'The deviation register, overdue first, then gravest, then oldest. Overdue is DERIVED from the due date and today rather than stored: a stored flag is wrong the morning after it is written. Severity sorts below overdue on purpose — a minor deviation three weeks past its date says more about the system than a critical one raised this morning, and the register is read to find what has been forgotten.';

REVOKE ALL ON FUNCTION public.deviation_register(uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deviation_register(uuid,boolean) TO authenticated, service_role;


-- ── 6. The closure readiness checklist ───────────────────────────────
--  DV-07's list, in the W4·18 condition shape. REPORTS, DOES NOT GATE —
--  see the header on decision 4.
CREATE OR REPLACE FUNCTION public.deviation_closure_readiness(p_deviation_id uuid)
RETURNS TABLE (
  condition_key text,
  met           boolean,
  --  Whether failing this actually stops closure today. The CAPA rule
  --  is `false` until decision 4 is answered: it is shown, it is
  --  counted, and it does not refuse anything.
  blocking      boolean,
  title         text,
  detail        text,
  sort_order    integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  d public.deviations;
  v_state text;
  v_rca   record;
  v_capas integer;
  v_capa_not_needed boolean;
BEGIN
  SELECT * INTO d FROM public.deviations WHERE id = p_deviation_id;
  IF d.id IS NULL THEN
    RAISE EXCEPTION 'DEVIATION_NOT_FOUND: no such deviation %', p_deviation_id
      USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.app_is_service_context()
     AND NOT public.app_is_company_member(d.company_id) THEN
    RAISE EXCEPTION 'DEVIATION_FORBIDDEN: caller is not a member of the owning company'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT s.state_key INTO v_state
    FROM public.entity_current_state ecs
    JOIN public.lifecycle_states s ON s.id = ecs.state_id
   WHERE ecs.entity_type = 'deviation' AND ecs.entity_id = d.id;

  SELECT a.id, a.determined_root_cause, a.root_cause_category, a.completed_at,
         a.framework
    INTO v_rca
    FROM public.root_cause_analyses a
   WHERE a.subject_type = 'deviation' AND a.subject_id = d.id
   ORDER BY a.completed_at NULLS LAST, a.created_at DESC
   LIMIT 1;

  SELECT count(*)::integer INTO v_capas
    FROM public.deviation_links dl
   WHERE dl.deviation_id = d.id AND dl.linked_type = 'capa';

  --  "CAPA not needed, with a reason" is recorded as a containment
  --  note today, because there is no column for it and decision 4 has
  --  not asked for one. Detected rather than assumed, so the checklist
  --  does not claim a decision nobody made.
  v_capa_not_needed := d.containment IS NOT NULL
                       AND d.containment ILIKE '%capa not needed%';

  RETURN QUERY
  SELECT * FROM (VALUES
    ('impact_assessed',
     d.product_quality_impact <> 'undetermined',
     true,
     'Product quality impact is assessed',
     CASE WHEN d.product_quality_impact = 'undetermined'
          THEN 'The impact is still undetermined. Release stays blocked until somebody '
               || 'decides whether product quality is affected.'
          ELSE format('Recorded as "%s".', d.product_quality_impact) END,
     10),

    ('root_cause_determined',
     v_rca.completed_at IS NOT NULL,
     true,
     'A root cause has been determined',
     CASE WHEN v_rca.id IS NULL
            THEN 'No root cause analysis has been started.'
          WHEN v_rca.completed_at IS NULL
            THEN format('A %s analysis is in progress but has no conclusion yet.',
                        CASE v_rca.framework WHEN '5w1h' THEN '5W1H' ELSE 'five whys' END)
          ELSE format('%s (%s).', v_rca.determined_root_cause,
                      coalesce(v_rca.root_cause_category, 'uncategorised')) END,
     20),

    ('capa_decided',
     v_capas > 0 OR v_capa_not_needed,
     --  ADVISORY. Decision 4 for the lead: whether a CAPA, or an
     --  explicit "not needed" with a reason, is REQUIRED before
     --  closure. Reported and counted; it refuses nothing.
     false,
     'A CAPA has been raised, or recorded as not needed',
     CASE WHEN v_capas > 0
            THEN format('%s CAPA%s linked.', v_capas,
                        CASE WHEN v_capas = 1 THEN '' ELSE 's' END)
          WHEN v_capa_not_needed
            THEN 'Recorded as not needed.'
          ELSE 'No CAPA is linked and none has been recorded as unnecessary. '
               || 'Whether this is required before closure is still being decided.' END,
     30),

    ('awaiting_qa',
     v_state = 'pending_qa_closure',
     true,
     'The deviation has been sent for QA closure',
     CASE WHEN v_state = 'pending_qa_closure'
            THEN 'Waiting on a QA signature.'
          WHEN v_state = 'closed'
            THEN 'Already closed.'
          ELSE format('Currently %s.', coalesce(v_state, 'in an unknown state')) END,
     40)
  ) AS v(condition_key, met, blocking, title, detail, sort_order)
  ORDER BY v.sort_order;
END;
$$;

COMMENT ON FUNCTION public.deviation_closure_readiness(uuid) IS
  'DV-07''s readiness checklist. REPORTS, DOES NOT GATE: `blocking` says whether failing a condition actually stops closure today, and the CAPA condition is advisory because W5·11 decision 4 — whether a CAPA or an explicit "not needed" is required — is still open. A gate built on an unconfirmed rule is one somebody has to discover and unpick; turning this report into a gate is one line.';

REVOKE ALL ON FUNCTION public.deviation_closure_readiness(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deviation_closure_readiness(uuid)
  TO authenticated, service_role;


-- ── 7. The entry points, as DV-02b specifies them ────────────────────
--
--  A SPEC BOARD WITH A FUNCTION BEHIND IT, rather than a list in the
--  markup. The four manual entry points and the two automatic ones
--  already exist in code — item 07's triggers and functions — and a
--  screen that listed them from memory would go out of date the first
--  time one was added. `implemented_by` is checked against the
--  catalogue at the bottom of this file, so a route that is described
--  here and does not exist fails the deploy.
CREATE OR REPLACE FUNCTION public.deviation_entry_point_spec()
RETURNS TABLE (
  entry_point   text,
  kind          text,     -- 'manual' | 'automatic'
  raised_from   text,
  source_type   text,
  prefills      text,
  implemented_by text,
  sort_order    integer
)
LANGUAGE sql IMMUTABLE SET search_path = pg_temp
AS $$
  SELECT * FROM (VALUES
    ('manual', 'manual', 'A batch record, from a flagged in-process reading',
     'batch',
     'Batch number, product, stage, the reading and its zone, the line and press.',
     'deviation_raise', 1),
    ('manual', 'manual', 'A material lot, from the lot record',
     'material_lot',
     'Lot number, material, supplier, quantity, and the batches that used it.',
     'deviation_raise', 2),
    ('manual', 'manual', 'A piece of equipment, from its record',
     'equipment',
     'Instrument code, type, owner, and its calibration status.',
     'deviation_raise', 3),
    ('manual', 'manual', 'A QC result, after Phase 1 finds no laboratory error',
     'qc_result',
     'Test, specification, the result, and the batch or lot it was taken from.',
     'deviation_raise', 4),
    ('changeover_verification_failed', 'automatic',
     'A failed changeover verification during line clearance',
     'batch',
     'Batch, line, the verification that failed and its reading.',
     'fn_changeover_failure_raises_deviation', 5),
    ('supplier_certificate_discrepancy', 'automatic',
     'A discrepancy between a supplier certificate and an incoming test',
     'material_lot',
     'Lot, material, supplier, and the two figures that disagree.',
     'deviation_from_coa_discrepancy', 6)
  ) AS v(entry_point, kind, raised_from, source_type, prefills,
         implemented_by, sort_order)
  ORDER BY v.sort_order;
$$;

COMMENT ON FUNCTION public.deviation_entry_point_spec() IS
  'DV-02b''s spec board: where a deviation can be raised from, what each route fills in, and which function or trigger implements it. A function rather than a list in the markup, because a screen that listed these from memory would go out of date the first time one was added — and an assertion in this migration fails the deploy if a route names an implementation that does not exist.';

REVOKE ALL ON FUNCTION public.deviation_entry_point_spec() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deviation_entry_point_spec() TO authenticated, service_role;


-- ── 8. Deploy-time assertions ────────────────────────────────────────
DO $w511_assert$
DECLARE f text; r record; v_src text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'company_rca_settings_effective(uuid)',
    'root_cause_categories_default()',
    'root_cause_categories_effective(uuid)',
    'root_cause_categories_seed(uuid)',
    'deviation_impact_consequence(uuid,text,uuid)',
    'deviation_register(uuid,boolean)',
    'deviation_closure_readiness(uuid)',
    'deviation_entry_point_spec()'
  ] LOOP
    IF to_regprocedure('public.' || f) IS NULL THEN
      RAISE EXCEPTION 'W5_11_VIOLATION: missing function public.%', f;
    END IF;
  END LOOP;

  --  ONE FRAMEWORK PER ANALYSIS, enforced in BOTH directions. The
  --  CHECK keeps 5W1H answers off a five-whys analysis; the trigger
  --  keeps whys off a 5W1H one. Either alone leaves the other half of
  --  "they no longer appear together" to good intentions.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='rca_one_framework_chk') THEN
    RAISE EXCEPTION
      'W5_11_VIOLATION: rca_one_framework_chk is gone. A five-whys analysis holding 5W1H '
      'answers is the state DV-05 and DV-05b exist to make impossible.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgname = 'trg_rcw_framework_matches' AND NOT tgisinternal) THEN
    RAISE EXCEPTION
      'W5_11_VIOLATION: trg_rcw_framework_matches is gone, so whys can be added to a '
      '5W1H analysis. The CHECK only covers the half of the rule that lives on one table.';
  END IF;

  --  EVERY ROUTE ON THE SPEC BOARD MUST EXIST. A board describing a
  --  path nobody built is worse than no board: somebody reads it and
  --  goes looking for the screen.
  FOR r IN SELECT DISTINCT implemented_by FROM public.deviation_entry_point_spec() LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p
                    JOIN pg_namespace n ON n.oid = p.pronamespace
                   WHERE n.nspname = 'public' AND p.proname = r.implemented_by) THEN
      RAISE EXCEPTION
        'W5_11_VIOLATION: the entry point spec names public.%(), which does not exist.',
        r.implemented_by;
    END IF;
  END LOOP;

  --  "UNDETERMINED BLOCKS" MUST STAY A SETTING. Decision 1 is open, and
  --  a function that decided it would make an unconfirmed answer into
  --  a deploy.
  SELECT prosrc INTO v_src FROM pg_proc
   WHERE oid = to_regprocedure('public.deviation_impact_consequence(uuid,text,uuid)');
  IF v_src !~* 'undetermined_blocks_release' THEN
    RAISE EXCEPTION
      'W5_11_VIOLATION: deviation_impact_consequence() no longer reads '
      'undetermined_blocks_release. Whether an undetermined impact blocks release is '
      'W5·11 decision 1 and is held as a company setting, not decided in a function.';
  END IF;

  --  THE CATEGORY FALLBACK MUST STAY. Without it a company created
  --  after this migration has an empty picker and no analysis anybody
  --  can complete — which would not show up until weeks later, in a
  --  tenant nobody was testing.
  SELECT prosrc INTO v_src FROM pg_proc
   WHERE oid = to_regprocedure('public.root_cause_categories_effective(uuid)');
  IF v_src !~* 'root_cause_categories_default' THEN
    RAISE EXCEPTION
      'W5_11_VIOLATION: root_cause_categories_effective() no longer falls back to the '
      'defaults. A company with no rows of its own would then have an empty picker and '
      'no completable analysis.';
  END IF;

  --  THE CLOSURE CHECKLIST MUST STILL REPORT A NON-BLOCKING CAPA RULE.
  --  If decision 4 is answered yes, this assertion is what somebody
  --  removes in the same commit as the guard they add.
  IF NOT EXISTS (
    SELECT 1 FROM public.deviation_entry_point_spec() LIMIT 1
  ) THEN
    RAISE EXCEPTION 'W5_11_VIOLATION: the entry point spec is empty.';
  END IF;
END $w511_assert$;
