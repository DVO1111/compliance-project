-- ============================================================================
--  Change control: a stage is something you did
--  (20261125070847_change_control_requires_evidence.sql).
--
--  The complaint this migration answers was that advancing a stage
--  "automatically indicates that it's completed without any evidence of
--  actual activity done". So the suite is written against the ways that
--  could still be true afterwards:
--
--    A.  THE GRAPH. The old graph was any-to-any, which is what let a
--        record go draft -> closed in one move. A1 is the assertion that
--        matters most: not that the new edges exist, but that the old
--        shortcuts do NOT. A graph test that only checks for presence
--        passes just as happily on a graph that still contains all 56.
--    B.  THE EVIDENCE. Checked by driving entity_current_state directly,
--        because that is the surface the guard protects: anything that
--        moves a record ends up there, so a rule proven here cannot be
--        stepped around by calling a different function.
--    C.  SEGREGATION OF DUTIES. Off by default is a decision, not an
--        oversight, so it is asserted as such — C1 fails if someone
--        "fixes" the default and silently dead-ends every single-user
--        workspace.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

DO $guard$
BEGIN
  IF current_database() NOT IN ('postgres','criateur_local') THEN
    RAISE EXCEPTION 'REFUSING TO RUN: this suite writes fixtures. Database is %', current_database();
  END IF;
END $guard$;

CREATE TEMP TABLE IF NOT EXISTS cce_results(
  id text, name text, status text, detail text
) ON COMMIT PRESERVE ROWS;
TRUNCATE cce_results;

CREATE OR REPLACE FUNCTION pg_temp.cce_ok(p_id text, p_name text, p_cond boolean, p_detail text DEFAULT '')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO cce_results VALUES (p_id, p_name, CASE WHEN p_cond THEN 'PASS' ELSE 'FAIL' END, p_detail);
END $$;

--  Moves a change control's state the way every caller ultimately does,
--  and reports the error instead of aborting the suite.
CREATE OR REPLACE FUNCTION pg_temp.cce_move(p_cc uuid, p_state text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_company uuid;
  v_def     uuid;
  v_state   uuid;
BEGIN
  SELECT company_id INTO v_company FROM public.change_controls WHERE id = p_cc;
  v_def := public.lifecycle_resolve_definition('change_control', v_company);
  SELECT id INTO v_state FROM public.lifecycle_states
   WHERE definition_id = v_def AND state_key = p_state;

  IF v_state IS NULL THEN RETURN 'NO_SUCH_STATE'; END IF;

  UPDATE public.entity_current_state
     SET state_id = v_state
   WHERE entity_type = 'change_control' AND entity_id = p_cc;

  RETURN 'OK';
EXCEPTION WHEN others THEN
  RETURN SQLERRM;
END $$;

-- ── fixtures ────────────────────────────────────────────────────────────────

DO $fix$
DECLARE
  v_company uuid;
  u_raiser  uuid := '00000000-0000-6a11-e000-000000000001';
  u_other   uuid := '00000000-0000-6a11-e000-000000000002';
BEGIN
  INSERT INTO auth.users(id, email) VALUES
    (u_raiser, 'cce-raiser@local.test'),
    (u_other,  'cce-other@local.test')
    ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.companies(name) VALUES ('CCE Co') RETURNING id INTO v_company;

  INSERT INTO public.change_controls
    (company_id, change_number, title, change_type, change_category, created_by)
  VALUES
    (v_company, 'CC-TEST-0001', 'Evidence fixture', 'process', 'minor', u_raiser);
END $fix$;

-- ── A. the graph ────────────────────────────────────────────────────────────

DO $a$
DECLARE
  v_any     integer;
  v_shortcut integer;
BEGIN
  --  A1 — THE ONE THAT MATTERS. The shortcuts that made a click look
  --  like a completed stage are gone.
  SELECT count(*) INTO v_shortcut
    FROM public.lifecycle_transitions t
    JOIN public.lifecycle_definitions d ON d.id = t.definition_id
    JOIN public.lifecycle_states fs ON fs.id = t.from_state_id
    JOIN public.lifecycle_states ts ON ts.id = t.to_state_id
   WHERE d.entity_type = 'change_control'
     AND (fs.state_key, ts.state_key) IN (
       ('draft','closed'), ('draft','approved'), ('draft','implementing'),
       ('draft','verification'), ('draft','pending_approval'),
       ('closed','approved'), ('closed','draft'), ('rejected','approved'),
       ('impact_assessment','closed'), ('impact_assessment','approved'),
       ('pending_approval','closed'), ('pending_approval','implementing'));

  PERFORM pg_temp.cce_ok('A1','the any-to-any shortcuts are gone', v_shortcut = 0,
    v_shortcut || ' shortcut edge(s) remain');

  --  A2 — nothing advances silently.
  SELECT count(*) INTO v_any
    FROM public.lifecycle_transitions t
    JOIN public.lifecycle_definitions d ON d.id = t.definition_id
   WHERE d.entity_type = 'change_control'
     AND t.requires_comment IS DISTINCT FROM true;
  PERFORM pg_temp.cce_ok('A2','every transition requires a comment', v_any = 0,
    v_any || ' transition(s) need no comment');

  --  A3 — approval is a signed act, on every path into approved.
  SELECT count(*) INTO v_any
    FROM public.lifecycle_transitions t
    JOIN public.lifecycle_definitions d ON d.id = t.definition_id
    JOIN public.lifecycle_states ts ON ts.id = t.to_state_id
   WHERE d.entity_type = 'change_control'
     AND ts.state_key = 'approved'
     AND t.requires_signature IS DISTINCT FROM true;
  PERFORM pg_temp.cce_ok('A3','every path into approved requires a signature', v_any = 0,
    v_any || ' unsigned approval path(s)');

  --  A4 — the forward path is complete. Without this the suite would
  --  pass against a graph with no edges at all.
  SELECT count(*) INTO v_any
    FROM (VALUES
      ('draft','impact_assessment'), ('impact_assessment','pending_approval'),
      ('pending_approval','approved'), ('approved','implementing'),
      ('implementing','verification'), ('verification','closed')
    ) AS want(from_key, to_key)
   WHERE NOT EXISTS (
     SELECT 1 FROM public.lifecycle_transitions t
       JOIN public.lifecycle_definitions d ON d.id = t.definition_id
       JOIN public.lifecycle_states fs ON fs.id = t.from_state_id
       JOIN public.lifecycle_states ts ON ts.id = t.to_state_id
      WHERE d.entity_type = 'change_control'
        AND fs.state_key = want.from_key AND ts.state_key = want.to_key);
  PERFORM pg_temp.cce_ok('A4','the whole forward path still exists', v_any = 0,
    v_any || ' forward edge(s) missing');

  --  A5 — rework paths, so a record is never a dead end short of
  --  rejection.
  SELECT count(*) INTO v_any
    FROM (VALUES
      ('impact_assessment','draft'), ('pending_approval','impact_assessment'),
      ('verification','implementing')
    ) AS want(from_key, to_key)
   WHERE NOT EXISTS (
     SELECT 1 FROM public.lifecycle_transitions t
       JOIN public.lifecycle_definitions d ON d.id = t.definition_id
       JOIN public.lifecycle_states fs ON fs.id = t.from_state_id
       JOIN public.lifecycle_states ts ON ts.id = t.to_state_id
      WHERE d.entity_type = 'change_control'
        AND fs.state_key = want.from_key AND ts.state_key = want.to_key);
  PERFORM pg_temp.cce_ok('A5','the rework paths exist', v_any = 0,
    v_any || ' rework edge(s) missing');
END $a$;

-- ── B. the evidence ─────────────────────────────────────────────────────────

DO $b$
DECLARE
  v_cc  uuid;
  v_res text;
BEGIN
  SELECT id INTO v_cc FROM public.change_controls WHERE change_number = 'CC-TEST-0001';

  -- B1 — no impact assessment, no approval queue.
  v_res := pg_temp.cce_move(v_cc, 'pending_approval');
  PERFORM pg_temp.cce_ok('B1','pending_approval is refused with no impact assessment',
    v_res LIKE 'CC_IMPACT_ASSESSMENT_REQUIRED%', v_res);

  -- B2 — and permitted once it is recorded. A rule that refused
  -- everything would pass B1.
  UPDATE public.change_controls SET impact_assessment = 'Assessed: affects cleaning SOP only.' WHERE id = v_cc;
  v_res := pg_temp.cce_move(v_cc, 'pending_approval');
  PERFORM pg_temp.cce_ok('B2','pending_approval is allowed once it is recorded', v_res = 'OK', v_res);

  -- B3 — verification needs to know what was implemented.
  v_res := pg_temp.cce_move(v_cc, 'verification');
  PERFORM pg_temp.cce_ok('B3','verification is refused with no implementation summary',
    v_res LIKE 'CC_IMPLEMENTATION_SUMMARY_REQUIRED%', v_res);

  UPDATE public.change_controls SET implementation_summary = 'SOP-012 revised to rev 4; two operators retrained.' WHERE id = v_cc;
  v_res := pg_temp.cce_move(v_cc, 'verification');
  PERFORM pg_temp.cce_ok('B4','verification is allowed once it is recorded', v_res = 'OK', v_res);

  -- B5 — closing needs evidence it worked. This is the assertion that
  -- stops a record being closed on a click.
  v_res := pg_temp.cce_move(v_cc, 'closed');
  PERFORM pg_temp.cce_ok('B5','closed is refused with no verification evidence',
    v_res LIKE 'CC_VERIFICATION_EVIDENCE_REQUIRED%', v_res);

  UPDATE public.change_controls SET verification_summary = 'Three cleaning cycles verified against swab limits.' WHERE id = v_cc;
  v_res := pg_temp.cce_move(v_cc, 'closed');
  PERFORM pg_temp.cce_ok('B6','closed is allowed once the evidence is recorded', v_res = 'OK', v_res);

  --  B7 — whitespace is not evidence.
  --
  --  The record is sitting in 'closed' after B6, and the guard ignores
  --  an UPDATE that does not change the state — correctly, since that is
  --  not a move. So this has to step the record OUT before testing the
  --  way back IN, or it asserts nothing at all. It did exactly that on
  --  the first run and reported a pass for a transition that never
  --  happened.
  UPDATE public.change_controls SET verification_summary = '   ' WHERE id = v_cc;
  PERFORM pg_temp.cce_move(v_cc, 'implementing');
  v_res := pg_temp.cce_move(v_cc, 'closed');
  PERFORM pg_temp.cce_ok('B7','a blank-but-present field is not evidence',
    v_res LIKE 'CC_VERIFICATION_EVIDENCE_REQUIRED%', v_res);
END $b$;

-- ── C. segregation of duties ────────────────────────────────────────────────

DO $c$
DECLARE
  v_cc      uuid;
  v_company uuid;
  u_raiser  uuid := '00000000-0000-6a11-e000-000000000001';
  u_other   uuid := '00000000-0000-6a11-e000-000000000002';
  v_res     text;
BEGIN
  SELECT id, company_id INTO v_cc, v_company
    FROM public.change_controls WHERE change_number = 'CC-TEST-0001';

  --  Every case below has to ENTER 'approved' from somewhere else, or
  --  the guard rightly ignores it as a non-move. B7 left the record in
  --  implementing with a blank verification summary, so the evidence
  --  fields are restored and the record parked in pending_approval
  --  before each attempt.
  UPDATE public.change_controls
     SET impact_assessment    = 'Assessed.',
         implementation_summary = 'Implemented.',
         verification_summary   = 'Verified.'
   WHERE id = v_cc;

  --  C1 — OFF BY DEFAULT, deliberately. If this fails, every
  --  single-user workspace has just been dead-ended at approval.
  PERFORM pg_temp.cce_move(v_cc, 'pending_approval');
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_raiser)::text, true);
  v_res := pg_temp.cce_move(v_cc, 'approved');
  PERFORM pg_temp.cce_ok('C1','with no setting row, a self-approval is allowed', v_res = 'OK', v_res);

  --  C2 — and refused once the company turns it on.
  INSERT INTO public.company_change_control_settings(company_id, require_segregation_of_duties)
  VALUES (v_company, true)
  ON CONFLICT (company_id) DO UPDATE SET require_segregation_of_duties = true;

  PERFORM pg_temp.cce_move(v_cc, 'pending_approval');
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_raiser)::text, true);
  v_res := pg_temp.cce_move(v_cc, 'approved');
  PERFORM pg_temp.cce_ok('C2','with the setting on, the raiser cannot approve their own change',
    v_res LIKE 'CC_SELF_APPROVAL_REFUSED%', v_res);

  --  C3 — somebody else still can. A rule that refused every approval
  --  would pass C2.
  PERFORM pg_temp.cce_move(v_cc, 'pending_approval');
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_other)::text, true);
  v_res := pg_temp.cce_move(v_cc, 'approved');
  PERFORM pg_temp.cce_ok('C3','with the setting on, a second person can approve', v_res = 'OK', v_res);

  PERFORM set_config('request.jwt.claims', '', true);
END $c$;

-- ── summary ─────────────────────────────────────────────────────────────────

SELECT id, name, status, detail FROM cce_results ORDER BY id;

--  Column order is total, passed, failed — the shape the harness reads.
SELECT
  count(*)                                AS total,
  count(*) FILTER (WHERE status = 'PASS') AS passed,
  count(*) FILTER (WHERE status = 'FAIL') AS failed
FROM cce_results;

-- ── cleanup ─────────────────────────────────────────────────────────────────

DO $cleanup$
DECLARE
  v_company uuid;
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  SELECT company_id INTO v_company FROM public.change_controls WHERE change_number = 'CC-TEST-0001';

  DELETE FROM public.entity_state_history WHERE entity_type = 'change_control'
     AND entity_id IN (SELECT id FROM public.change_controls WHERE change_number = 'CC-TEST-0001');
  DELETE FROM public.entity_current_state WHERE entity_type = 'change_control'
     AND entity_id IN (SELECT id FROM public.change_controls WHERE change_number = 'CC-TEST-0001');
  DELETE FROM public.change_controls WHERE change_number = 'CC-TEST-0001';
  DELETE FROM public.company_change_control_settings WHERE company_id = v_company;
  DELETE FROM public.companies WHERE id = v_company;
  DELETE FROM auth.users WHERE email LIKE 'cce-%@local.test';
  RAISE NOTICE 'cce fixtures removed.';
EXCEPTION WHEN others THEN
  RAISE WARNING 'CLEANUP INCOMPLETE (%). Remove cce rows manually.', SQLERRM;
END $cleanup$;
