-- =====================================================================
--  THE SIX DECISIONS, SETTLED CONSERVATIVELY
--
--  docs/separation-of-duties.md §5 left six questions open. Each is
--  now implemented with the SAFE default — the reading that refuses
--  more — except where refusing more would mean inventing a rule the
--  design does not contain, which is the one thing that must not
--  happen here.
--
--  A conservative default is not an answer. It is a position to hold
--  until there is one, chosen so that being wrong costs a conversation
--  rather than a release. Every pair below records which it is:
--
--    mandatory            an existing product decision requires it
--    conservative_default enforced as the safe reading, PENDING YOUR
--                         CONFIRMATION
--    awaiting_decision    not enforced; needs your answer, and in two
--                         cases a change to PM-03 first
--
--  The decision list is in docs/separation-of-duties.md §5. Nothing
--  here invents a quality rule: where the safe default would have
--  required one, the pair is left unenforced and says so.
-- =====================================================================

-- ── 1. A third decision status ──────────────────────────────────────

ALTER TABLE public.duty_conflicts
  DROP CONSTRAINT IF EXISTS duty_conflict_decision_known,
  DROP CONSTRAINT IF EXISTS duty_conflict_decision_matches_enforcement;

ALTER TABLE public.duty_conflicts
  ADD CONSTRAINT duty_conflict_decision_known
    CHECK (decision_status IN ('mandatory', 'conservative_default',
                               'awaiting_decision', 'declined')),
  --  Still no contradictions: an unenforced pair cannot call itself
  --  settled, and an enforced one cannot call itself open.
  ADD CONSTRAINT duty_conflict_decision_matches_enforcement
    CHECK (enforced = (decision_status IN ('mandatory', 'conservative_default')));


-- ── 2. Decision 1 — the receiver may not disposition ────────────────
--
-- ENFORCED, as a conservative default.
--
-- Derivable: PM-03 gives goods_receipt to the Storekeeper and
-- qa_disposition to QA, and no role holds both. So enforcing it reads
-- the matrix rather than overruling it.
--
-- What it costs: almost nothing. A storekeeper has no Act on
-- qa_disposition, so they could never have dispositioned a lot
-- anyway. The ONLY person this refuses is somebody holding both
-- storekeeper AND qa_manager or qa_officer — which is exactly the
-- multi-role case the whole separation layer exists for, and exactly
-- the case PM-03's arithmetic used to make impossible.

UPDATE public.duty_conflicts
   SET enforced = true,
       decision_status = 'conservative_default',
       note = 'Conservative default, 20261125000000, PENDING CONFIRMATION. '
              || 'Derivable: PM-03 separates goods_receipt (Storekeeper) from '
              || 'qa_disposition (QA). Bites only somebody holding both roles, '
              || 'which is the case this layer exists for. Decision 1 in '
              || 'docs/separation-of-duties.md.'
 WHERE scope = 'material_lot' AND duty_a = 'disposition' AND duty_b = 'receipt';


-- ── 3. Decisions 2 and 3 — recorded, and NOT enforced ───────────────
--
-- These are the two where the safe-sounding answer would have been the
-- wrong one.
--
-- Decision 2, CoA verification vs disposition: PM-03 gives
-- coa_register AND qa_disposition both to qa_manager and qa_officer.
-- The design CONTEMPLATES one person doing both. Enforcing a split
-- would contradict the matrix, not extend it, and a gate that
-- disagrees with the permission screen is worse than no gate.
--
-- Decision 3, sampling vs testing: sampling has no PM-03 column at
-- all, so the matrix says nothing either way. Adding the row with
-- enforced = false records that it was examined — the next person
-- should not have to re-derive the same dead end.
--
-- Both need a PM-03 change before they could be enforced, which makes
-- them yours twice over.

INSERT INTO public.duty_conflicts
  (scope, duty_a, duty_b, section_a, section_b, error_code, reason,
   enforced, decision_status, note)
VALUES
  ('material_lot', 'qc_testing', 'sampling', 'qc_testing', 'qc_testing',
   'MATERIAL_TEST_SELF_SAMPLED',
   'you took the sample from this lot, so somebody else has to test it',
   false, 'awaiting_decision',
   'Decision 3. NOT derivable: sampling has no PM-03 column, so the matrix '
   || 'rules neither way. Enforcing it needs a column first. Recorded so the '
   || 'question is visible rather than re-derived.')
ON CONFLICT (scope, duty_a, duty_b) DO UPDATE
  SET enforced = EXCLUDED.enforced,
      decision_status = EXCLUDED.decision_status,
      note = EXCLUDED.note;

UPDATE public.duty_conflicts
   SET note = 'Decision 2. NOT derivable: PM-03 gives coa_register and '
              || 'qa_disposition both to qa_manager and qa_officer, so the '
              || 'matrix contemplates one person doing both. Enforcing this '
              || 'needs PM-03 changed first, not a seed.'
 WHERE scope = 'material_lot' AND duty_a = 'coa_verification' AND duty_b = 'disposition';


-- ── 4. Decision 4 — dispatch after release stays enforced ───────────
--
-- Already enforced by 20261120000000. Reclassified from 'mandatory' to
-- 'conservative_default', because calling it mandatory overstated it:
-- it is derivable from PM-03 and it is the safe reading, but unlike
-- the qc/release pair it does not follow from a decision the product
-- had already made. It is the weakest of the three batch pairs and the
-- one most likely to meet a site procedure that disagrees.

UPDATE public.duty_conflicts
   SET decision_status = 'conservative_default',
       note = 'Conservative default, reclassified 20261125000000, PENDING '
              || 'CONFIRMATION. Derivable — PM-03 separates distribution '
              || '(Storekeeper) from batch_release (QA Manager) — but it '
              || 'separates a decision from a physical movement rather than '
              || 'from the work it judges, which is a weaker case than the '
              || 'other two. Decision 4 in docs/separation-of-duties.md: '
              || 'delete this row if your procedure puts dispatch under the '
              || 'QA who released.'
 WHERE scope = 'batch' AND duty_a = 'dispatch' AND duty_b = 'release';


-- ── 4b. What each duty actually reads ───────────────────────────────
--
-- The conflict table says which duties clash. It never said what a
-- duty IS — that lived only in the body of batch_actor_duties and
-- material_lot_actor_duties, where a reviewer would have to read
-- PL/pgSQL to find out whether recording one in-process reading counts
-- as executing a batch.
--
-- It does (decision 6), and that is a judgement, so it belongs
-- somewhere a reviewer can see it beside the rule it feeds.

CREATE TABLE IF NOT EXISTS public.duty_definitions (
  scope           text NOT NULL,
  duty            text NOT NULL,
  --  The columns the reader consults, in words. Prose rather than a
  --  machine-checked list: the readers are hand-written functions and
  --  a column list here that drifted from them would be worse than
  --  none.
  reads           text NOT NULL,
  decision_status text NOT NULL DEFAULT 'mandatory'
    CHECK (decision_status IN ('mandatory','conservative_default','awaiting_decision')),
  note            text,
  PRIMARY KEY (scope, duty),
  CONSTRAINT duty_definition_scope_known CHECK (scope IN ('batch','material_lot'))
);

COMMENT ON TABLE public.duty_definitions IS
  'What each duty means — which recorded actions count as having performed it. The readings that are judgements are marked conservative_default.';

ALTER TABLE public.duty_definitions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS duty_definitions_read ON public.duty_definitions;
CREATE POLICY duty_definitions_read
  ON public.duty_definitions FOR SELECT TO authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.duty_definitions FROM anon, authenticated;
GRANT SELECT ON public.duty_definitions TO anon, authenticated;


-- ── 5. Decision 6 — "executed it" keeps its broad reading ───────────
--
-- batch_actor_duties treats somebody who started one stage, recorded
-- one reading, or closed execution as having executed the batch. That
-- is the broad reading and it is kept, because the narrow one — only
-- whoever closed execution — would let a supervisor record every
-- reading on a batch and still release it, which is the hole the pair
-- exists to close.
--
-- Recorded in the table rather than only in a comment, so that the
-- reading is reviewable beside the rule it feeds.

INSERT INTO public.duty_definitions (scope, duty, reads, decision_status, note)
VALUES
  ('batch', 'execution',
   'batch_stages.started_by, batch_stage_parameter_readings.recorded_by, batch_records.execution_closed_by',
   'conservative_default',
   'Decision 6, PENDING CONFIRMATION. The BROAD reading: one stage started or '
   || 'one reading recorded counts as having executed the batch. The narrow '
   || 'reading (execution_closed_by alone) would let somebody record every '
   || 'reading and still release it. Narrowing means editing batch_actor_duties.'),
  ('batch', 'qc_testing',
   'batch_qc_results.tested_by, batch_inprocess_qc.tested_by', 'mandatory',
   'Both finished-product and in-process results count. The product already '
   || 'decided a tester does not judge their own results.'),
  ('batch', 'release',   'batch_records.released_by', 'mandatory', NULL),
  ('batch', 'dispatch',  'batch_dispatches.dispatched_by', 'mandatory', NULL),
  ('material_lot', 'receipt', 'material_lots.received_by', 'mandatory', NULL),
  ('material_lot', 'sampling', 'material_lot_sampling.sampled_by', 'mandatory', NULL),
  ('material_lot', 'qc_testing',
   'material_test_results.analyst_id (not superseded)', 'mandatory',
   'Superseded results are excluded: a corrected result is the correction''s author''s.'),
  ('material_lot', 'coa_verification',
   'material_certificates_of_analysis.verified_by', 'mandatory', NULL),
  ('material_lot', 'disposition',
   'material_lot_release_records.authorised_by, .released_by, material_lot_rejections.decided_by',
   'mandatory', NULL)
ON CONFLICT (scope, duty) DO UPDATE
  SET reads = EXCLUDED.reads, decision_status = EXCLUDED.decision_status,
      note = EXCLUDED.note;


-- ── 6. Decision 5 — signatures stay on the derived three ────────────
--
-- Whether qc_analyst and production_supervisor should also need a
-- signature to be granted.
--
-- NOT CHANGED, and this is the one place where the conservative answer
-- is NOT the stricter one. 20261121000000 derives the list from
-- step_permissions and FAILS if a seeded role holds no protected step.
-- Adding these two would mean either disabling that assertion or
-- giving them a protected step they do not have — the first removes
-- the thing that stops this file inventing rules, and the second is a
-- change to PM-03.
--
-- So the list stays at qa_manager, qa_officer and compliance_admin,
-- and the recommendation is recorded rather than acted on.

COMMENT ON TABLE public.gmp_critical_roles IS
  'Operational roles whose grant and revocation require an electronic signature. Derived from step_permissions: these are the roles PM-03 gives one of its five protected steps. Decision 5 (docs/separation-of-duties.md) asks whether qc_analyst and production_supervisor should join them; they cannot without PM-03 giving them a protected step, because 20261121000000 asserts the derivation.';


-- ── 7. Re-assert, now that enforcement has moved ────────────────────

DO $assert$
DECLARE v_bad text;
BEGIN
  --  (a) Every ENFORCED pair is still one PM-03 separates. The whole
  --  point of a conservative default is that it is a safe reading of
  --  the design, not a new rule bolted on.
  SELECT string_agg(format('%s %s/%s', c.scope, c.section_a, c.section_b), '; ')
    INTO v_bad
    FROM public.duty_conflicts c
   WHERE c.enforced AND NOT public.duty_pair_is_derived(c.section_a, c.section_b);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'DUTY_CONFLICT_NOT_DERIVED: % — a conservative default is still a reading of PM-03', v_bad;
  END IF;

  --  (b) Nothing claims to be settled that is not enforced, and
  --  nothing enforced claims to be open. The CHECK covers it; this
  --  says so at deploy time.
  SELECT string_agg(format('%s/%s/%s', scope, duty_a, duty_b), '; ') INTO v_bad
    FROM public.duty_conflicts
   WHERE enforced <> (decision_status IN ('mandatory','conservative_default'));
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'DUTY_DECISION_CONTRADICTS_ENFORCEMENT: %', v_bad;
  END IF;

  --  (c) Every duty named in a conflict has a definition saying which
  --  columns it reads. A rule whose terms are undefined is a rule
  --  nobody can review.
  SELECT string_agg(format('%s/%s', u.scope, u.d), ', ') INTO v_bad
    FROM (SELECT scope, duty_a AS d FROM public.duty_conflicts
          UNION SELECT scope, duty_b FROM public.duty_conflicts) u
   WHERE NOT EXISTS (SELECT 1 FROM public.duty_definitions dd
                      WHERE dd.scope = u.scope AND dd.duty = u.d);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'DUTY_UNDEFINED: % appears in a conflict with no definition', v_bad;
  END IF;

  --  (d) And every conservative default is findable, because the
  --  point of the status is that somebody comes back to it.
  IF NOT EXISTS (SELECT 1 FROM public.duty_conflicts
                  WHERE decision_status = 'conservative_default') THEN
    RAISE EXCEPTION 'NO_CONSERVATIVE_DEFAULTS: the status exists and nothing carries it';
  END IF;
END
$assert$;


-- ── 8. One query that answers "what is still mine to decide" ────────

CREATE OR REPLACE FUNCTION public.duty_decisions_outstanding()
RETURNS TABLE (
  decision        text,
  scope           text,
  pair            text,
  enforced        boolean,
  decision_status text,
  derivable       boolean,
  note            text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT CASE
           WHEN c.decision_status = 'conservative_default'
             THEN 'Confirm or overturn'
           ELSE 'Decide'
         END,
         c.scope,
         format('%s + %s', c.duty_a, c.duty_b),
         c.enforced,
         c.decision_status,
         public.duty_pair_is_derived(c.section_a, c.section_b),
         c.note
    FROM public.duty_conflicts c
   WHERE c.decision_status IN ('conservative_default', 'awaiting_decision')
   UNION ALL
  SELECT 'Confirm or overturn', d.scope, format('how "%s" is read', d.duty),
         true, d.decision_status, true, d.note
    FROM public.duty_definitions d
   WHERE d.decision_status = 'conservative_default'
   ORDER BY 5, 2, 3;
$$;

COMMENT ON FUNCTION public.duty_decisions_outstanding() IS
  'Every separation-of-duties choice still waiting on a quality decision: the conservative defaults to confirm, and the pairs not enforced at all.';

GRANT EXECUTE ON FUNCTION public.duty_decisions_outstanding() TO authenticated, service_role;
