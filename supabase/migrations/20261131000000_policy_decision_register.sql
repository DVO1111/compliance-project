-- =====================================================================
--  THE POLICY DECISIONS, IN ONE PLACE, WITH THEIR KIND OF OPEN
--
--  Decisions about this system's quality policy are currently recorded
--  in three tables, each with its own decision_status vocabulary:
--
--    duty_conflicts.decision_status       mandatory | conservative_default
--                                         | awaiting_decision | declined
--    duty_definitions.decision_status     mandatory | conservative_default
--                                         | awaiting_decision
--    signed_quality_actions.decision_status
--                                         enforced | awaiting_procedure
--                                         | declined
--
--  Each is right for its own table, and none of them can hold a
--  decision that is not about a duty pair or a signature — which the
--  product-specification decisions and the accepted CoA exception both
--  are. So an operator cannot answer "what is still open" with one
--  query, which is the question a release needs answered.
--
--  This adds that one place. It does NOT move the enforcement: the
--  three tables above are still what the guards read. This register
--  records WHO HAS TO DECIDE WHAT, and is deliberately a reporting
--  surface rather than a control.
--
--  ── THREE DIFFERENT THINGS ARE ALL CALLED "PENDING" ──
--
--  Keeping them apart is the point of the table, because they need
--  opposite handling:
--
--    enforced_pending_confirmation
--        The control is ON and biting. What is open is whether the
--        site's approved procedures and the applicable regulations
--        agree with it. If they do not, a control comes OFF — which is
--        a change to live behaviour.
--
--    awaiting_decision
--        The control is OFF. The mechanism exists and the attribution
--        it would read is already recorded, but nothing refuses
--        anything. If the decision goes the other way, a control comes
--        ON — which may strand work in progress.
--
--    awaiting_procedure
--        The mechanism is built and switched off pending a procedural
--        question that is narrower than a policy decision.
--
--  ── NO SOP IS INVENTED HERE ──
--
--  Every `needs` value below is phrased as the question to put to the
--  site's quality procedures, not as an answer. Where this system has
--  taken a default it says so and says it is a default. Nothing in
--  this table asserts that a GMP requirement exists.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.policy_decisions (
  key          text PRIMARY KEY,
  area         text NOT NULL,
  title        text NOT NULL,

  --  Which of the three kinds of open this is, or that it is closed.
  state        text NOT NULL
    CHECK (state IN ('settled',
                     'enforced_pending_confirmation',
                     'awaiting_decision',
                     'awaiting_procedure')),

  --  Whether the control bites TODAY. Separate from `state` because
  --  the two are genuinely independent: a decision can be open while
  --  the control is on (a conservative default) or open while it is
  --  off (no default was safe to pick).
  enforced     boolean NOT NULL,

  --  TRUE when the current arrangement was accepted as a release
  --  exception rather than as the intended end state. A temporary
  --  acceptance that is never revisited is how an exception becomes
  --  the design by default, so it is a column and it is reported.
  temporary    boolean NOT NULL DEFAULT false,

  --  What happens in the meantime, in words. Mandatory: a register
  --  that records an open question without recording the behaviour
  --  people are living with is not much use to an operator.
  interim      text NOT NULL,

  --  What would close it. A question for somebody with authority, not
  --  a task for a migration.
  needs        text NOT NULL,

  --  Where the decision and its reasoning are written down.
  reference    text NOT NULL,

  --  Which table actually enforces it, so the reader can go and check
  --  rather than trusting this row.
  enforced_in  text,

  CONSTRAINT policy_decision_settled_is_not_temporary
    CHECK (NOT (state = 'settled' AND temporary)),
  --  An open decision whose control is ON is either a conservative
  --  default or an accepted exception. Either way somebody chose it,
  --  so it must carry a reference — the same discipline
  --  20261128000000 imposed on duty_conflicts.
  CONSTRAINT policy_decision_reference_is_a_reference
    CHECK (length(btrim(reference)) >= 20)
);

COMMENT ON TABLE public.policy_decisions IS
  'The quality-policy decisions this system has taken, is holding, or cannot take without an authority. A reporting register, not a control: duty_conflicts, duty_definitions and signed_quality_actions are what the guards read. `temporary` marks an arrangement accepted as a release exception rather than as the intended end state.';

COMMENT ON COLUMN public.policy_decisions.state IS
  'settled; enforced_pending_confirmation (control ON, agreement with the site''s procedures not yet confirmed); awaiting_decision (control OFF, no safe default); awaiting_procedure (mechanism built and switched off pending a narrower procedural question).';


-- ── Rule table, so: readable, not writable ──────────────────────────
--
-- 20261123000000 found six rule tables world-writable as
-- `authenticated` and closed them. A seventh arriving open would undo
-- that finding, so it is closed here in the same shape.

ALTER TABLE public.policy_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.policy_decisions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS policy_decisions_read ON public.policy_decisions;
CREATE POLICY policy_decisions_read ON public.policy_decisions
  FOR SELECT TO authenticated USING (true);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.policy_decisions
  FROM anon, authenticated;
GRANT SELECT ON public.policy_decisions TO authenticated, service_role;


-- ── The decisions ───────────────────────────────────────────────────

INSERT INTO public.policy_decisions
  (key, area, title, state, enforced, temporary, interim, needs, reference, enforced_in)
VALUES
  --  ACCEPTED AS A TEMPORARY EXCEPTION. The control stays; what was
  --  accepted is that PM-03 is not redrawn to match it in this
  --  release.
  ('coa_verification_vs_disposition',
   'separation of duties',
   'Whoever verified a lot''s incoming certificate may not make its disposition',
   'enforced_pending_confirmation', true, true,
   'Enforced, and unchanged by the exception: the verifier is refused that lot''s '
   || 'disposition (MATERIAL_DISPOSITION_SELF_VERIFIED). The gate is stricter than '
   || 'PM-03, which has no column for the incoming verification act at all, so the '
   || 'pair carries authority = approved_by_quality rather than derived_from_pm03.',
   'Option B was accepted for this release as a TEMPORARY, documented exception: '
   || 'do not redesign PM-03 and do not build a verification screen now. To close '
   || 'it, Option A: add an `incoming_coa_verification` column to PM-03 with Act '
   || 'roles disjoint from qa_disposition''s, decide WHICH role holds it (this '
   || 'system will not choose), build the screen, and reduce the pair to '
   || 'derived_from_pm03. Until then the divergence between the gate and the matrix '
   || 'stands and is on the record.',
   'docs/decision-note-coa-separation.md §7 Option B; figma-conflicts.md §40; '
   || 'accepted by the project owner 2026-10-23',
   'duty_conflicts (scope=material_lot, coa_verification/disposition)'),

  --  OPEN, AND THE CONTROL IS OFF. Two separate things are missing,
  --  and neither can be supplied from inside the database.
  ('material_sampling_vs_testing',
   'separation of duties',
   'Whether whoever sampled a material lot may also test it',
   'awaiting_decision', false, false,
   'NOT enforced. Sampling and testing are both recorded and attributed — '
   || 'material_lot_sampling and material_test_results both carry a server-written '
   || 'actor that cannot be forged or reassigned — so if this is decided either way '
   || 'later, the evidence to apply it exists. Nothing refuses anything today.',
   'TWO things, not one. (1) A PM-03 column for sampling: the matrix does not '
   || 'tabulate the act, so the pair cannot be derived and a role cannot be named. '
   || '(2) The site''s approved procedure stating whether sampling and testing must '
   || 'be independent. Many sites have the same analyst do both; some do not. This '
   || 'system will not assume either, and no conservative default was taken because '
   || 'switching the control ON later is the smaller disruption of the two.',
   'docs/separation-of-duties.md §5.3; duty_decisions_outstanding() returns '
   || 'exactly this row',
   'duty_conflicts (scope=material_lot, qc_testing/sampling, enforced=false)'),

  --  MECHANISM BUILT, SWITCHED OFF.
  ('material_test_result_signature',
   'electronic signatures',
   'Whether recording a material test result requires an electronic signature',
   'awaiting_procedure', false, false,
   'NOT required. The signing path exists and works — quality_verdict_sign() will '
   || 'sign this action key today — but no trigger demands it, so a result can be '
   || 'recorded unsigned. Registered as held rather than left absent, so that '
   || '"considered and waiting" is distinguishable from "nobody thought about it".',
   'The site''s testing procedure: a signature on EVERY result, or only on results '
   || 'for parameters marked critical. The distinction matters because the volume '
   || 'differs by an order of magnitude and a signature nobody has time to give '
   || 'becomes a shared password.',
   'docs/separation-of-duties.md §6; signed_quality_actions.basis for this key',
   'signed_quality_actions (material_test_result, required=false)'),

  ('batch_execution_close_signature',
   'electronic signatures',
   'Whether closing a batch execution record requires an electronic signature',
   'awaiting_procedure', false, false,
   'NOT required. Same shape: the mechanism exists, nothing demands it.',
   'Whether closing is a clerical act or a quality judgement at this site. Stage '
   || 'completion is ALREADY signed, so a signature on the close may be duplicating '
   || 'an attestation rather than adding one — which is the question, and it is the '
   || 'site''s to answer, not this system''s.',
   'docs/separation-of-duties.md §6; signed_quality_actions.basis for this key',
   'signed_quality_actions (batch_execution_close, required=false)'),

  --  ENFORCED, PENDING CONFIRMATION. Implemented as proposed defaults
  --  and biting today; what is open is whether the site and the
  --  regulator agree.
  ('product_specification_approver',
   'product specifications',
   'Decision A — approving a product specification is the QA Manager''s act',
   'enforced_pending_confirmation', true, false,
   'Enforced and signed. app_section_access is NOT allowed to abstain for this '
   || 'act: on the live database every member holds `owner`, and an abstention '
   || 'would let all 21 of them approve specifications. So a named role is '
   || 'required, and a workspace with no QA Manager appointed cannot approve one '
   || 'at all — which is the intended failure, not an outage.',
   'Confirmation against the site''s approved quality procedures and the '
   || 'applicable NAFDAC requirements that the QA Manager is the correct approver, '
   || 'and that no second approver is required. If a second is required, the '
   || 'signature mechanism supports it but nothing currently demands it.',
   'docs/release-readiness.md §4.3; docs/separation-of-duties.md; '
   || '20261117000000_specification_approval_by_qa_manager.sql',
   'product_specification_approver_error() + the approval signature'),

  ('product_specification_governing_version',
   'product specifications',
   'Decision B — the governing version is the one effective at manufacture',
   'enforced_pending_confirmation', true, false,
   'Enforced. The specification in force when the batch was manufactured is '
   || 'stamped onto the batch record and locked, so a later revision cannot '
   || 'retrospectively change what a batch was judged against.',
   'Confirmation against the site''s change-control procedure that "effective at '
   || 'manufacture" is the right rule, rather than "effective at release" or '
   || '"latest approved". The three give different answers for any batch '
   || 'manufactured across a revision.',
   'docs/release-readiness.md §4.3; '
   || '20261118000000_governing_specification_preserved.sql',
   'batch_records.governing_specification_id, stamped and locked')
ON CONFLICT (key) DO UPDATE SET
  area = EXCLUDED.area, title = EXCLUDED.title, state = EXCLUDED.state,
  enforced = EXCLUDED.enforced, temporary = EXCLUDED.temporary,
  interim = EXCLUDED.interim, needs = EXCLUDED.needs,
  reference = EXCLUDED.reference, enforced_in = EXCLUDED.enforced_in;


--  The CoA pair's own note says the exception is temporary, so a
--  reader who reaches duty_conflicts without passing through this
--  register still learns it.
UPDATE public.duty_conflicts
   SET note = note
     || ' OPTION B ACCEPTED 2026-10-23 AS A TEMPORARY RELEASE EXCEPTION: PM-03 is '
     || 'not redrawn to match this gate in this release, and no verification screen '
     || 'is built. The divergence stands on the record. See policy_decisions '
     || '(key = ''coa_verification_vs_disposition'').'
 WHERE scope = 'material_lot'
   AND duty_a = 'coa_verification' AND duty_b = 'disposition'
   AND note NOT LIKE '%OPTION B ACCEPTED%';


-- ── The one query a release needs ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.policy_decisions_outstanding()
RETURNS TABLE (
  key text, area text, title text, state text,
  enforced boolean, temporary boolean, needs text, reference text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT d.key, d.area, d.title, d.state,
         d.enforced, d.temporary, d.needs, d.reference
    FROM public.policy_decisions d
   WHERE d.state <> 'settled'
   ORDER BY
     --  Temporary exceptions first: they are the ones with an expiry
     --  nobody has written down.
     d.temporary DESC,
     --  Then controls that are ON pending confirmation, because if the
     --  confirmation goes the other way live behaviour changes.
     CASE d.state
       WHEN 'enforced_pending_confirmation' THEN 1
       WHEN 'awaiting_decision'             THEN 2
       WHEN 'awaiting_procedure'            THEN 3
       ELSE 4 END,
     d.key;
$$;

COMMENT ON FUNCTION public.policy_decisions_outstanding() IS
  'Every policy decision that is not settled, temporary exceptions first. Read-only. Intended for the pre-release check in docs/live-verification-checklist.md.';

REVOKE ALL ON FUNCTION public.policy_decisions_outstanding() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.policy_decisions_outstanding()
  TO authenticated, service_role;


-- ── Assertions: the register must agree with the enforcement ────────
--
-- A reporting register that drifts from the tables it reports on is
-- worse than none, because it is believed. So every row's `enforced`
-- claim is checked against the table that actually enforces it.

DO $assert$
DECLARE v_bad text; v_n int;
BEGIN
  --  (a) The CoA pair: enforced, and the register says so.
  IF NOT EXISTS (
    SELECT 1 FROM public.duty_conflicts
     WHERE scope='material_lot' AND duty_a='coa_verification'
       AND duty_b='disposition' AND enforced
       AND authority = 'approved_by_quality')
  THEN
    RAISE EXCEPTION 'REGISTER_DISAGREES: the CoA pair is not enforced on an approval, but policy_decisions says it is';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.policy_decisions
                  WHERE key='coa_verification_vs_disposition'
                    AND temporary AND enforced) THEN
    RAISE EXCEPTION 'OPTION_B_NOT_RECORDED_AS_TEMPORARY';
  END IF;

  --  (b) Sampling: the control is OFF, and the register says so. If
  --  somebody enforces it without updating the register, this fails.
  IF (SELECT enforced FROM public.duty_conflicts
       WHERE scope='material_lot' AND duty_a='qc_testing' AND duty_b='sampling')
     IS DISTINCT FROM false
  THEN
    RAISE EXCEPTION 'REGISTER_DISAGREES: sampling/testing is now enforced; update policy_decisions';
  END IF;

  --  (c) The two held signatures are still held, and still two.
  SELECT count(*) INTO v_n FROM public.signed_quality_actions
   WHERE NOT required AND decision_status = 'awaiting_procedure';
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'REGISTER_DISAGREES: % signature action(s) held, expected 2', v_n;
  END IF;

  --  (d) Every awaiting_* row claims the control is off, and every
  --  enforced_pending_confirmation row claims it is on. A row that
  --  gets this backwards is the drift this block exists to catch.
  SELECT string_agg(format('%s state=%s enforced=%s', key, state,
                           CASE WHEN enforced THEN 'true' ELSE 'false' END), '; ')
    INTO v_bad
    FROM public.policy_decisions
   WHERE (state LIKE 'awaiting_%' AND enforced)
      OR (state = 'enforced_pending_confirmation' AND NOT enforced);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'REGISTER_INCOHERENT: %', v_bad;
  END IF;

  --  (e) The four items the brief named are all present and open.
  --  Named explicitly so that deleting one is a failure rather than a
  --  silently shorter report.
  SELECT string_agg(k, ', ') INTO v_bad
    FROM unnest(ARRAY['material_sampling_vs_testing',
                      'material_test_result_signature',
                      'batch_execution_close_signature',
                      'product_specification_approver',
                      'product_specification_governing_version']) AS k
   WHERE NOT EXISTS (SELECT 1 FROM public.policy_decisions d
                      WHERE d.key = k AND d.state <> 'settled');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'REGISTER_MISSING_PENDING_ITEM: %', v_bad;
  END IF;

  --  (f) And the register is not writable by an app role, which is
  --  what 20261123000000 established for its six siblings.
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
     WHERE table_schema='public' AND table_name='policy_decisions'
       AND grantee IN ('anon','authenticated')
       AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE'))
  THEN
    RAISE EXCEPTION 'POLICY_REGISTER_IS_WRITABLE';
  END IF;
END
$assert$;
