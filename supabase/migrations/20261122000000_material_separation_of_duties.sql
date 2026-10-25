-- =====================================================================
--  THE MATERIAL CHAIN HAS THE SAME PROBLEM
--
--  20261120000000 separated duties on a batch. The material chain —
--  receive, sample, test, verify the CoA, disposition, release — runs
--  the same shape of risk and was not looked at. This is that audit,
--  and what it changed.
--
--  ── WHAT IS ENFORCED, AND WHY ONLY THAT ──
--
--  One pair is enforced: whoever tested a material lot may not
--  disposition it. That is not a new rule. It is the rule the product
--  already made for batches — BATCH_RELEASE_SELF_TESTED, which
--  predates this branch — applied to the other chain where the same
--  facts hold. Applying an existing product decision to the place it
--  obviously reaches is not inventing a GMP rule.
--
--  Three more pairs were examined and are NOT enforced. They are
--  seeded with enforced = false and decision_status =
--  'awaiting_decision', so they are visible in the database as
--  proposals rather than invisible in a document, and so that
--  accepting one is an UPDATE rather than a migration:
--
--    receipt vs disposition      PM-03 separates the columns, so it is
--                                PERMISSIBLE — but no existing product
--                                decision requires it, and requiring
--                                it would be this file deciding.
--    coa_verification vs
--      disposition               PM-03 gives coa_register AND
--                                qa_disposition both to qa_manager and
--                                qa_officer. The design CONTEMPLATES
--                                one person doing both. Enforcing a
--                                split here would contradict PM-03,
--                                not extend it. Not derivable at all.
--    sampling vs qc_testing      Sampling has no PM-03 column, so the
--                                matrix says nothing either way.
--
--  docs/separation-of-duties.md sets each of these out for decision.
-- =====================================================================

-- ── 1. The conflict table was never batch-shaped ────────────────────
--
-- Renamed rather than duplicated. Nothing is deployed anywhere, so
-- this rewrites no history; and a second table with the same columns
-- would have meant the derivation assertion existing twice, which is
-- how two copies of a rule start to disagree.

ALTER TABLE IF EXISTS public.batch_duty_conflicts RENAME TO duty_conflicts;

ALTER TABLE public.duty_conflicts
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'batch',
  --  A pair that is permissible but not decided is still worth
  --  recording. It is simply not consulted.
  ADD COLUMN IF NOT EXISTS enforced boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS decision_status text NOT NULL DEFAULT 'mandatory',
  ADD COLUMN IF NOT EXISTS note text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'duty_conflict_scope_known') THEN
    ALTER TABLE public.duty_conflicts
      ADD CONSTRAINT duty_conflict_scope_known
      CHECK (scope IN ('batch', 'material_lot'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'duty_conflict_decision_known') THEN
    ALTER TABLE public.duty_conflicts
      ADD CONSTRAINT duty_conflict_decision_known
      CHECK (decision_status IN ('mandatory', 'awaiting_decision', 'declined'));
  END IF;
  --  An unenforced pair that calls itself mandatory, or an enforced
  --  one still awaiting a decision, is a contradiction somebody will
  --  read as the opposite of what it says.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'duty_conflict_decision_matches_enforcement') THEN
    ALTER TABLE public.duty_conflicts
      ADD CONSTRAINT duty_conflict_decision_matches_enforcement
      CHECK ((decision_status = 'mandatory') = enforced);
  END IF;
END $$;

--  The primary key was (duty_a, duty_b); two scopes can legitimately
--  name the same pair, so it becomes (scope, duty_a, duty_b).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint
              WHERE conname = 'batch_duty_conflicts_pkey') THEN
    ALTER TABLE public.duty_conflicts DROP CONSTRAINT batch_duty_conflicts_pkey;
    ALTER TABLE public.duty_conflicts ADD PRIMARY KEY (scope, duty_a, duty_b);
  END IF;
END $$;

COMMENT ON TABLE public.duty_conflicts IS
  'Pairs of duties one person may not both perform on the same batch or material lot. Each enforced pair is derived from PM-03: its two sections have disjoint Act roles.';


-- ── 2. The derivation test, written once ────────────────────────────

CREATE OR REPLACE FUNCTION public.duty_pair_is_derived(
  p_section_a text,
  p_section_b text
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  --  TRUE when PM-03 already separates the two columns, i.e. no role
  --  holds Act on both. Where a role does hold both, the design
  --  contemplates one person doing both and a conflict rule would
  --  contradict it rather than extend it.
  SELECT NOT EXISTS (
    SELECT 1
      FROM public.section_permissions a
      JOIN public.section_permissions b ON b.role = a.role
     WHERE a.section = p_section_a AND a.access = 'act'
       AND b.section = p_section_b AND b.access = 'act'
  ) AND EXISTS (SELECT 1 FROM public.section_permissions WHERE section = p_section_a)
    AND EXISTS (SELECT 1 FROM public.section_permissions WHERE section = p_section_b);
$$;

COMMENT ON FUNCTION public.duty_pair_is_derived(text, text) IS
  'Whether PM-03 already separates two sections, which is what makes a duty-conflict rule a reading of the matrix rather than an invention.';

GRANT EXECUTE ON FUNCTION public.duty_pair_is_derived(text, text) TO authenticated, service_role;


-- ── 3. What a person did to a material lot ──────────────────────────

CREATE OR REPLACE FUNCTION public.material_lot_actor_duties(
  p_lot_id  uuid,
  p_user_id uuid
) RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT coalesce(array_agg(DISTINCT d ORDER BY d), ARRAY[]::text[])
    FROM (
      SELECT 'receipt'::text AS d
       WHERE EXISTS (SELECT 1 FROM public.material_lots
                      WHERE id = p_lot_id AND received_by = p_user_id)

      UNION ALL
      SELECT 'sampling'
       WHERE EXISTS (SELECT 1 FROM public.material_lot_sampling
                      WHERE material_lot_id = p_lot_id AND sampled_by = p_user_id)

      UNION ALL
      SELECT 'qc_testing'
       WHERE EXISTS (SELECT 1 FROM public.material_test_results
                      WHERE material_lot_id = p_lot_id AND analyst_id = p_user_id
                        AND superseded_at IS NULL)

      UNION ALL
      SELECT 'coa_verification'
       WHERE EXISTS (SELECT 1 FROM public.material_certificates_of_analysis
                      WHERE material_lot_id = p_lot_id AND verified_by = p_user_id)

      UNION ALL
      SELECT 'disposition'
       WHERE EXISTS (SELECT 1 FROM public.material_lot_release_records
                      WHERE material_lot_id = p_lot_id
                        AND (authorised_by = p_user_id OR released_by = p_user_id))
          OR EXISTS (SELECT 1 FROM public.material_lot_rejections
                      WHERE material_lot_id = p_lot_id AND decided_by = p_user_id)
    ) q(d)
   WHERE d IS NOT NULL;
$$;

COMMENT ON FUNCTION public.material_lot_actor_duties(uuid, uuid) IS
  'Which duties a person has already performed on one material lot, read from the columns that record them.';

REVOKE ALL ON FUNCTION public.material_lot_actor_duties(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.material_lot_actor_duties(uuid, uuid) TO authenticated, service_role;


-- ── 4. One conflict check, two scopes ───────────────────────────────

CREATE OR REPLACE FUNCTION public.duty_conflict(
  p_scope     text,
  p_entity_id uuid,
  p_duty      text,
  p_user_id   uuid DEFAULT auth.uid()
) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_done text[];
  v_row  record;
BEGIN
  IF p_user_id IS NULL THEN RETURN NULL; END IF;

  v_done := CASE p_scope
              WHEN 'batch'        THEN public.batch_actor_duties(p_entity_id, p_user_id)
              WHEN 'material_lot' THEN public.material_lot_actor_duties(p_entity_id, p_user_id)
            END;

  IF v_done IS NULL OR array_length(v_done, 1) IS NULL THEN RETURN NULL; END IF;

  SELECT c.error_code, c.reason
    INTO v_row
    FROM public.duty_conflicts c
   WHERE c.scope = p_scope
     AND c.enforced
     AND ((c.duty_a = p_duty AND c.duty_b = ANY (v_done))
       OR (c.duty_b = p_duty AND c.duty_a = ANY (v_done)))
   ORDER BY c.duty_a, c.duty_b
   LIMIT 1;

  IF v_row IS NULL THEN RETURN NULL; END IF;

  RETURN v_row.error_code || ': ' || v_row.reason;
END;
$$;

COMMENT ON FUNCTION public.duty_conflict(text, uuid, text, uuid) IS
  'The refusal when this person already performed a conflicting duty on this batch or material lot, or NULL when they have not. Unenforced pairs are not consulted.';

REVOKE ALL ON FUNCTION public.duty_conflict(text, uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.duty_conflict(text, uuid, text, uuid) TO authenticated, service_role;


--  Kept, and now a thin call. 20261120000000's callers and its tests
--  use this name, and changing both at once would have made a rename
--  look like a behaviour change.
CREATE OR REPLACE FUNCTION public.batch_duty_conflict(
  p_batch_id uuid,
  p_duty     text,
  p_user_id  uuid DEFAULT auth.uid()
) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT public.duty_conflict('batch', p_batch_id, p_duty, p_user_id);
$$;

REVOKE ALL ON FUNCTION public.batch_duty_conflict(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.batch_duty_conflict(uuid, text, uuid) TO authenticated, service_role;


-- ── 5. The material pairs ───────────────────────────────────────────

UPDATE public.duty_conflicts SET scope = 'batch' WHERE scope IS NULL;

INSERT INTO public.duty_conflicts
  (scope, duty_a, duty_b, section_a, section_b, error_code, reason,
   enforced, decision_status, note)
VALUES
  --  ENFORCED. The product already decided this for batches; this is
  --  the same decision where the same facts hold.
  ('material_lot', 'disposition', 'qc_testing', 'qa_disposition', 'qc_testing',
   'MATERIAL_DISPOSITION_SELF_TESTED',
   'you recorded test results on this lot, so somebody else has to make the disposition decision',
   true, 'mandatory',
   'Mirrors BATCH_RELEASE_SELF_TESTED, which predates this branch. Not a new rule.'),

  --  PERMISSIBLE, NOT DECIDED. PM-03 separates the columns, so this
  --  COULD be enforced without contradicting the design — but nothing
  --  in the product requires it, and this migration is not where that
  --  gets decided.
  ('material_lot', 'disposition', 'receipt', 'qa_disposition', 'goods_receipt',
   'MATERIAL_DISPOSITION_SELF_RECEIVED',
   'you received this lot, so somebody else has to make the disposition decision',
   false, 'awaiting_decision',
   'PM-03 separates goods_receipt (Storekeeper) from qa_disposition (QA). Permissible to enforce; not required by any existing product decision. Awaiting the quality system''s answer.'),

  --  NOT DERIVABLE. PM-03 gives coa_register and qa_disposition BOTH
  --  to qa_manager and qa_officer, so the design contemplates one
  --  person doing both. Enforcing a split here would contradict the
  --  matrix rather than read it. Recorded so that the next person does
  --  not re-derive the same dead end.
  ('material_lot', 'coa_verification', 'disposition', 'coa_register', 'qa_disposition',
   'MATERIAL_DISPOSITION_SELF_VERIFIED',
   'you verified the certificate of analysis for this lot, so somebody else has to make the disposition decision',
   false, 'awaiting_decision',
   'NOT derivable from PM-03: qa_manager and qa_officer hold Act on both columns, so the matrix contemplates one person doing both. Enforcing this needs a quality decision that overrides PM-03, not a reading of it.')
ON CONFLICT (scope, duty_a, duty_b) DO UPDATE
  SET section_a = EXCLUDED.section_a, section_b = EXCLUDED.section_b,
      error_code = EXCLUDED.error_code, reason = EXCLUDED.reason,
      enforced = EXCLUDED.enforced, decision_status = EXCLUDED.decision_status,
      note = EXCLUDED.note;


DO $assert$
DECLARE v_bad text;
BEGIN
  --  (a) EVERY ENFORCED PAIR IS ONE PM-03 ALREADY SEPARATES. Now
  --  written once, and applied to both scopes.
  SELECT string_agg(format('%s %s/%s', c.scope, c.section_a, c.section_b), '; ')
    INTO v_bad
    FROM public.duty_conflicts c
   WHERE c.enforced
     AND NOT public.duty_pair_is_derived(c.section_a, c.section_b);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION
      'DUTY_CONFLICT_NOT_DERIVED: % — PM-03 lets one role do both, so this pair is not its rule', v_bad;
  END IF;

  --  (b) Every duty named is one the matching reader can report.
  SELECT string_agg(format('%s:%s', scope, d), ', ') INTO v_bad FROM (
    SELECT scope, duty_a AS d FROM public.duty_conflicts
    UNION SELECT scope, duty_b FROM public.duty_conflicts) u
   WHERE (scope = 'batch'
          AND d NOT IN ('qc_testing','execution','release','dispatch'))
      OR (scope = 'material_lot'
          AND d NOT IN ('receipt','sampling','qc_testing','coa_verification','disposition'));
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION
      'DUTY_UNKNOWN: % is named in a conflict but no reader reports it', v_bad;
  END IF;

  --  (c) The coa/disposition pair must stay unenforced for as long as
  --  PM-03 gives both columns to the same roles. If somebody enables
  --  it without changing the matrix, (a) catches it — this just says
  --  so out loud at deploy time.
  IF public.duty_pair_is_derived('coa_register', 'qa_disposition') THEN
    RAISE NOTICE
      'PM-03 now separates coa_register from qa_disposition; the coa_verification/disposition pair has become derivable and can be decided on.';
  END IF;
END;
$assert$;


-- ── 6. The disposition guard asks ───────────────────────────────────
--
-- Replaces 20261104000000's function. Everything before the new clause
-- is unchanged.
--
-- The duty check reads auth.uid() and is skipped for service contexts,
-- exactly as the batch release gate does: the scheduler and migrations
-- have no JWT and are not people.

CREATE OR REPLACE FUNCTION public.fn_material_lots_disposition_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_to text; v_from text; v_company uuid; v_conflict text; v_actor uuid := auth.uid();
BEGIN
  IF NEW.entity_type <> 'material_lot' THEN RETURN NEW; END IF;

  SELECT state_key INTO v_to FROM public.lifecycle_states WHERE id = NEW.state_id;
  IF v_to NOT IN ('approved', 'rejected') THEN RETURN NEW; END IF;

  IF TG_OP = 'UPDATE' THEN
    SELECT state_key INTO v_from FROM public.lifecycle_states WHERE id = OLD.state_id;
    --  Not a new decision; nothing to authorise.
    IF v_from = v_to THEN RETURN NEW; END IF;
  END IF;

  SELECT company_id INTO v_company FROM public.material_lots WHERE id = NEW.entity_id;
  IF v_company IS NULL THEN RETURN NEW; END IF;

  PERFORM public.app_assert_step(v_company, 'material_disposition');

  --  Added 20261122000000. The step check asks whether this person may
  --  disposition lots at all; this asks whether they may disposition
  --  THIS one, having tested it.
  IF NOT public.app_is_service_context() AND v_actor IS NOT NULL THEN
    v_conflict := public.duty_conflict('material_lot', NEW.entity_id, 'disposition', v_actor);
    IF v_conflict IS NOT NULL THEN
      RAISE EXCEPTION '%', v_conflict USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_material_lots_disposition_role ON public.entity_current_state;
CREATE TRIGGER trg_material_lots_disposition_role
  BEFORE INSERT OR UPDATE ON public.entity_current_state
  FOR EACH ROW EXECUTE FUNCTION public.fn_material_lots_disposition_role();


-- ── 7. And the release record itself ────────────────────────────────
--
-- The lifecycle guard above catches the state change. A release record
-- can also be written naming somebody else as the authoriser, so the
-- claim on the row is checked too — the same reasoning as the dispatch
-- gate reading NEW.dispatched_by rather than auth.uid().

CREATE OR REPLACE FUNCTION public.fn_material_release_record_duties()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_conflict text; v_who uuid;
BEGIN
  IF public.app_is_service_context() THEN RETURN NEW; END IF;

  FOREACH v_who IN ARRAY ARRAY[NEW.authorised_by, NEW.released_by] LOOP
    CONTINUE WHEN v_who IS NULL;
    v_conflict := public.duty_conflict('material_lot', NEW.material_lot_id,
                                       'disposition', v_who);
    IF v_conflict IS NOT NULL THEN
      RAISE EXCEPTION '%', v_conflict USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_material_release_record_duties
  ON public.material_lot_release_records;
CREATE TRIGGER trg_material_release_record_duties
  BEFORE INSERT ON public.material_lot_release_records
  FOR EACH ROW EXECUTE FUNCTION public.fn_material_release_record_duties();
