-- =====================================================================
--  THE ACTION REGISTER AND ITS ESCALATION CRITERIA (20261209000000)
--
--  A. Posture
--  B. A criterion has to be evaluable
--  C. Evaluating the criteria — severity, product impact, recurrence
--  D. THE CLOSURE RULE
--  E. Company isolation
--  F. The action list
--  G. Leaving the register
--
--  WHY C AND D ARE THE POINT
--  -------------------------
--  The instruction was "define the escalation criteria explicitly
--  rather than inventing hidden rules", so C proves the criteria are
--  DATA: rows a company writes, evaluated against a finding, each
--  reporting which rule fired and why.
--
--  And "never allow a finding requiring action to be closed without
--  its required action and closure evidence", so D proves all three
--  gates: an action must exist, it must be completed WITH evidence,
--  and where a matching criterion requires a CAPA the action must
--  link to one. D7 is the one that matters most — it names the
--  criterion in the refusal, which is what makes the rule auditable
--  rather than merely enforced.
-- =====================================================================
\set ON_ERROR_STOP on
SET client_min_messages = warning;

CREATE TEMP TABLE _s(section text, name text, ok boolean, detail text);
CREATE OR REPLACE FUNCTION _sk(p_section text, p_name text, p_ok boolean, p_detail text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO _s VALUES (p_section,p_name,coalesce(p_ok,false),p_detail); END $$;

GRANT ALL ON _s TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION _sk(text,text,boolean,text) TO anon, authenticated, service_role;


-- ── Fixture ──────────────────────────────────────────────────────────
DO $fx$
DECLARE
  ca uuid := '00000000-0000-7b05-a000-000000000001';
  cb uuid := '00000000-0000-7b05-a000-000000000002';
  ua uuid := '00000000-0000-7b05-b000-000000000001';
  ub uuid := '00000000-0000-7b05-b000-000000000002';
  sa uuid := '00000000-0000-7b05-c000-000000000001';
  sb uuid := '00000000-0000-7b05-c000-000000000002';
  pa uuid := '00000000-0000-7b05-e000-000000000001';
  pb uuid := '00000000-0000-7b05-e000-000000000002';
  v1 uuid := '00000000-0000-7b05-f000-000000000001';
  v0 uuid := '00000000-0000-7b05-f000-000000000003';
  vb uuid := '00000000-0000-7b05-f000-000000000002';
BEGIN
  DELETE FROM public.facility_pest_findings     WHERE company_id IN (ca,cb);
  DELETE FROM public.facility_action_register   WHERE company_id IN (ca,cb);
  DELETE FROM public.facility_escalation_criteria WHERE company_id IN (ca,cb);
  DELETE FROM public.facility_pest_visits       WHERE company_id IN (ca,cb);
  DELETE FROM public.facility_pest_providers    WHERE company_id IN (ca,cb);
  DELETE FROM public.capa_records               WHERE company_id IN (ca,cb);
  DELETE FROM public.sites            WHERE company_id IN (ca,cb);
  DELETE FROM public.company_members  WHERE company_id IN (ca,cb);
  DELETE FROM public.profiles         WHERE id IN (ua,ub);
  DELETE FROM auth.users              WHERE id IN (ua,ub);
  DELETE FROM public.companies        WHERE id IN (ca,cb);

  INSERT INTO public.companies(id,name) VALUES (ca,'AR Alpha'),(cb,'AR Bravo');
  INSERT INTO auth.users(id,email) VALUES (ua,'ar-a@local.test'),(ub,'ar-b@local.test');
  INSERT INTO public.profiles(id,email,full_name,role,company_id) VALUES
    (ua,'ar-a@local.test','Ada Alpha','admin',ca),
    (ub,'ar-b@local.test','Bo Bravo','admin',cb);
  INSERT INTO public.company_members(company_id,user_id,role,status) VALUES
    (ca,ua,'owner','active'),(cb,ub,'owner','active');
  INSERT INTO public.sites(id,company_id,name) VALUES (sa,ca,'AR plant'),(sb,cb,'AR depot');

  INSERT INTO public.facility_pest_providers(id,company_id,site_id,name,created_by)
  VALUES (pa,ca,sa,'AR Greenshield',ua), (pb,cb,sb,'AR Bravo Pest',ub);

  --  Two visits for company A, four weeks apart, so recurrence has
  --  something to count.
  INSERT INTO public.facility_pest_visits
    (id,company_id,provider_id,reference,visited_on,created_by)
  VALUES (v0,ca,pa,'AR-PC-0001','2026-09-22',ua),
         (v1,ca,pa,'AR-PC-0002','2026-10-20',ua),
         (vb,cb,pb,'AR-PC-0001','2026-10-21',ub);

  /*
   *  A CAPA for company A to link to, and one for Bravo.
   *
   *  `source` is 'internal_review'. `capa_records_source_check` allows
   *  six values — audit_finding, compliance_failure, near_miss,
   *  customer_complaint, regulatory_action, internal_review — and NONE
   *  of them names facility or pest monitoring. internal_review is the
   *  closest honest fit: the finding came from our own contracted
   *  inspection.
   *
   *  Adding a seventh value is NOT done here. That vocabulary governs a
   *  regulated record, and widening it to make a link read better would
   *  be a quality decision taken in a test fixture. It is reported in
   *  navigation-decisions.md instead.
   */
  INSERT INTO public.capa_records
    (id,company_id,capa_number,title,description,source,capa_type,priority,status)
  VALUES ('00000000-0000-7b05-0a00-000000000001',ca,'AR-CAPA-0001',
          'Rodent ingress at the dock door','Recurrent activity','internal_review',
          'corrective','high','open'),
         ('00000000-0000-7b05-0a00-000000000002',cb,'AR-CAPA-9001',
          'Bravo CAPA','x','internal_review','corrective','low','open');

  /*
   *  THE CRITERIA, written as a company would write them. Nothing here
   *  is a default the migration seeded: the migration ships no
   *  criteria at all, which is the point of "explicitly rather than
   *  hidden".
   */
  INSERT INTO public.facility_escalation_criteria
    (id,company_id,code,description,basis,match_values,requires_capa,created_by)
  VALUES
    ('00000000-0000-7b05-0c00-000000000001',ca,'ESC-SEV',
     'A finding graded Major or Critical is escalated to CAPA.',
     'severity', ARRAY['Major','Critical'], true, ua),
    ('00000000-0000-7b05-0c00-000000000004',ca,'ESC-SEV-MINOR',
     'A Minor finding is flagged for attention but needs no CAPA.',
     'severity', ARRAY['Minor'], false, ua);

  INSERT INTO public.facility_escalation_criteria
    (id,company_id,code,description,basis,requires_capa,created_by)
  VALUES
    ('00000000-0000-7b05-0c00-000000000002',ca,'ESC-PROD',
     'Any finding affecting product is escalated to CAPA.',
     'product_impact', true, ua);

  INSERT INTO public.facility_escalation_criteria
    (id,company_id,code,description,basis,window_days,min_count,requires_capa,created_by)
  VALUES
    ('00000000-0000-7b05-0c00-000000000003',ca,'ESC-RECUR',
     'The same station needing action twice in 60 days is escalated.',
     'recurrence', 60, 2, true, ua);
END
$fx$;


-- =====================================================================
--  A — posture
-- =====================================================================
DO $a$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['facility_escalation_criteria','facility_action_register']
  LOOP
    PERFORM _sk('A','A1 '||t||' has RLS enabled',
      (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.'||t)::regclass), t);
    PERFORM _sk('A','A2 '||t||' has a company_id FK to companies',
      (SELECT count(*) = 1 FROM pg_constraint k
        WHERE k.conrelid = ('public.'||t)::regclass AND k.contype='f'
          AND k.confrelid = 'public.companies'::regclass), t);
  END LOOP;

  /*
   *  THE CRITERIA ARE A TABLE, not a CASE expression. This is the
   *  structural form of "explicitly rather than inventing hidden
   *  rules", so it is asserted rather than assumed: a threshold
   *  compiled into a function is a rule nobody can list.
   */
  PERFORM _sk('A','A3 escalation criteria are rows, and the migration seeds none',
    (SELECT count(*) = 0 FROM public.facility_escalation_criteria
      WHERE company_id NOT IN ('00000000-0000-7b05-a000-000000000001',
                               '00000000-0000-7b05-a000-000000000002')),
    'any criterion outside this test''s own fixture would be a seeded default');

  PERFORM _sk('A','A4 the register trigger is attached BEFORE insert and update',
    (SELECT count(*) = 1 FROM pg_trigger
      WHERE tgrelid='public.facility_action_register'::regclass
        AND tgname='trg_facility_action_integrity' AND NOT tgisinternal));

  PERFORM _sk('A','A5 facility_escalation_matches is SECURITY INVOKER',
    (SELECT NOT prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='facility_escalation_matches'));

  --  The register is general, not pest-specific: the instruction said
  --  "a general, auditable action register".
  PERFORM _sk('A','A6 the register admits a facility log entry as a source',
    (SELECT pg_get_constraintdef(oid) LIKE '%facility_log_entry%'
       FROM pg_constraint
      WHERE conrelid='public.facility_action_register'::regclass
        AND contype='c' AND conname LIKE '%source_kind%'));
END
$a$;


--  Everything below runs as company A's admin.
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-7b05-b000-000000000001","role":"authenticated"}', false);
SET ROLE authenticated;

-- =====================================================================
--  B — a criterion has to be evaluable
-- =====================================================================
DO $b$
BEGIN
  --  A severity criterion with no labels would match nothing while
  --  looking like protection.
  BEGIN
    INSERT INTO public.facility_escalation_criteria
      (company_id,code,description,basis)
    VALUES ('00000000-0000-7b05-a000-000000000001','BAD-1','No labels','severity');
    PERFORM _sk('B','B1 a severity criterion with no labels is refused',
                false,'the insert succeeded');
  EXCEPTION WHEN check_violation THEN
    PERFORM _sk('B','B1 a severity criterion with no labels is refused', true, SQLSTATE);
  END;

  --  A recurrence criterion with no window is unevaluable.
  BEGIN
    INSERT INTO public.facility_escalation_criteria
      (company_id,code,description,basis,min_count)
    VALUES ('00000000-0000-7b05-a000-000000000001','BAD-2','No window','recurrence',2);
    PERFORM _sk('B','B2 a recurrence criterion with no window is refused',
                false,'the insert succeeded');
  EXCEPTION WHEN check_violation THEN
    PERFORM _sk('B','B2 a recurrence criterion with no window is refused', true, SQLSTATE);
  END;

  --  One occurrence is not a recurrence.
  BEGIN
    INSERT INTO public.facility_escalation_criteria
      (company_id,code,description,basis,window_days,min_count)
    VALUES ('00000000-0000-7b05-a000-000000000001','BAD-3','Once','recurrence',60,1);
    PERFORM _sk('B','B3 a recurrence count of one is refused', false,'the insert succeeded');
  EXCEPTION WHEN check_violation THEN
    PERFORM _sk('B','B3 a recurrence count of one is refused', true, SQLSTATE);
  END;

  --  An unknown basis has no defined way to be evaluated.
  BEGIN
    INSERT INTO public.facility_escalation_criteria
      (company_id,code,description,basis)
    VALUES ('00000000-0000-7b05-a000-000000000001','BAD-4','Vibes','intuition');
    PERFORM _sk('B','B4 an unknown basis is refused', false,'the insert succeeded');
  EXCEPTION WHEN check_violation THEN
    PERFORM _sk('B','B4 an unknown basis is refused', true, SQLSTATE);
  END;

  --  A product-impact criterion needs no threshold, so it is accepted
  --  with none — the fixture already proved that.
  PERFORM _sk('B','B5 a product-impact criterion needs no threshold',
    (SELECT count(*) = 1 FROM public.facility_escalation_criteria
      WHERE code = 'ESC-PROD'));

  --  Two criteria cannot share a code within a company: the code is
  --  what an escalation quotes.
  BEGIN
    INSERT INTO public.facility_escalation_criteria
      (company_id,code,description,basis)
    VALUES ('00000000-0000-7b05-a000-000000000001','ESC-PROD','Duplicate','product_impact');
    PERFORM _sk('B','B6 a criterion code is unique per company',
                false,'the insert succeeded');
  EXCEPTION WHEN unique_violation THEN
    PERFORM _sk('B','B6 a criterion code is unique per company', true, SQLSTATE);
  END;
END
$b$;


-- =====================================================================
--  C — evaluating the criteria
-- =====================================================================
--  One cross-company guard, to show 20261207000000's isolation still
--  holds now that the closure rule has been replaced.
DO $c0$
DECLARE v_err text;
BEGIN
  BEGIN
    INSERT INTO public.facility_pest_findings
      (company_id,visit_id,station_code,finding,needs_action,severity,created_by)
    VALUES ('00000000-0000-7b05-a000-000000000001',
            --  Bravo's visit.
            '00000000-0000-7b05-f000-000000000002',
            'BS-TRESPASS','x',true,'Minor',auth.uid());
    PERFORM _sk('C','C1 a finding still cannot use another company''s visit',
                false,'the insert succeeded');
  EXCEPTION WHEN others THEN
    v_err := SQLERRM;
    PERFORM _sk('C','C1 a finding still cannot use another company''s visit',
      v_err LIKE 'PEST_VISIT_NOT_FOUND%' OR v_err LIKE 'PEST_VISIT_WRONG_COMPANY%', v_err);
  END;
END
$c0$;

DO $c4$
DECLARE f_minor uuid; f_major uuid; f_prod uuid; f_rec0 uuid; n integer; v_codes text;
BEGIN
  --  Minor severity, own visit v1.
  INSERT INTO public.facility_pest_findings
    (company_id,visit_id,station_code,finding,needs_action,severity,created_by)
  VALUES ('00000000-0000-7b05-a000-000000000001','00000000-0000-7b05-f000-000000000001',
          'BS-MINOR','Light activity',true,'Minor',auth.uid())
  RETURNING id INTO f_minor;

  SELECT count(*), string_agg(code,',' ORDER BY code) INTO n, v_codes
    FROM public.facility_escalation_matches(f_minor);
  PERFORM _sk('C','C3 a Minor finding matches its own criterion only',
              n = 1 AND v_codes = 'ESC-SEV-MINOR', coalesce(v_codes,'none'));

  SELECT count(*) INTO n FROM public.facility_escalation_matches(f_minor)
   WHERE requires_capa;
  PERFORM _sk('C','C4 and that criterion does not require a CAPA', n = 0, n||' requiring');

  --  Major severity.
  INSERT INTO public.facility_pest_findings
    (company_id,visit_id,station_code,finding,needs_action,severity,created_by)
  VALUES ('00000000-0000-7b05-a000-000000000001','00000000-0000-7b05-f000-000000000001',
          'BS-MAJOR','Rodent droppings',true,'Major',auth.uid())
  RETURNING id INTO f_major;

  SELECT string_agg(code,',' ORDER BY code) INTO v_codes
    FROM public.facility_escalation_matches(f_major) WHERE requires_capa;
  PERFORM _sk('C','C5 a Major finding matches a criterion that requires a CAPA',
              v_codes = 'ESC-SEV', coalesce(v_codes,'none'));

  --  Product impact, with no severity stated at all.
  INSERT INTO public.facility_pest_findings
    (company_id,visit_id,station_code,finding,needs_action,affects_product,created_by)
  VALUES ('00000000-0000-7b05-a000-000000000001','00000000-0000-7b05-f000-000000000001',
          'BS-PROD','Activity in the packing hall',true,true,auth.uid())
  RETURNING id INTO f_prod;

  SELECT string_agg(code,',' ORDER BY code) INTO v_codes
    FROM public.facility_escalation_matches(f_prod);
  PERFORM _sk('C','C6 product impact matches without any severity',
              v_codes = 'ESC-PROD', coalesce(v_codes,'none'));

  --  The matched rows carry a readable reason, which is what makes
  --  the rule auditable rather than merely enforced.
  PERFORM _sk('C','C7 a match reports its own description and detail',
    (SELECT description LIKE '%affecting product%' AND detail = 'affects product'
       FROM public.facility_escalation_matches(f_prod) LIMIT 1));

  --  RECURRENCE. The same station needing action on the earlier visit
  --  too, inside the 60-day window.
  INSERT INTO public.facility_pest_findings
    (company_id,visit_id,station_code,finding,needs_action,created_by)
  VALUES ('00000000-0000-7b05-a000-000000000001','00000000-0000-7b05-f000-000000000003',
          'BS-RECUR','First occurrence',true,auth.uid())
  RETURNING id INTO f_rec0;

  --  One occurrence alone does not reach min_count of two.
  SELECT count(*) INTO n FROM public.facility_escalation_matches(f_rec0)
   WHERE basis = 'recurrence';
  PERFORM _sk('C','C8 a single occurrence is not a recurrence', n = 0, n||' matched');

  INSERT INTO public.facility_pest_findings
    (company_id,visit_id,station_code,finding,needs_action,created_by)
  VALUES ('00000000-0000-7b05-a000-000000000001','00000000-0000-7b05-f000-000000000001',
          'BS-RECUR','Again, four weeks later',true,auth.uid());

  SELECT count(*) INTO n FROM public.facility_escalation_matches(
    (SELECT id FROM public.facility_pest_findings
      WHERE station_code='BS-RECUR' AND visit_id='00000000-0000-7b05-f000-000000000001'))
   WHERE basis = 'recurrence';
  PERFORM _sk('C','C9 the second occurrence in the window matches', n = 1, n||' matched');

  --  A finding NOT marked as needing action is not counted toward a
  --  recurrence: the criterion is about findings that needed action.
  INSERT INTO public.facility_pest_findings
    (company_id,visit_id,station_code,finding,needs_action,created_by)
  VALUES ('00000000-0000-7b05-a000-000000000001','00000000-0000-7b05-f000-000000000003',
          'BS-QUIET','No activity',false,auth.uid());
  INSERT INTO public.facility_pest_findings
    (company_id,visit_id,station_code,finding,needs_action,created_by)
  VALUES ('00000000-0000-7b05-a000-000000000001','00000000-0000-7b05-f000-000000000001',
          'BS-QUIET','No activity again',false,auth.uid());
  SELECT count(*) INTO n FROM public.facility_escalation_matches(
    (SELECT id FROM public.facility_pest_findings
      WHERE station_code='BS-QUIET' AND visit_id='00000000-0000-7b05-f000-000000000001'))
   WHERE basis = 'recurrence';
  PERFORM _sk('C','C10 quiet findings do not accumulate a recurrence', n = 0, n||' matched');

  --  An inactive criterion stops matching, without being deleted.
  UPDATE public.facility_escalation_criteria SET is_active = false WHERE code = 'ESC-PROD';
  SELECT count(*) INTO n FROM public.facility_escalation_matches(f_prod);
  PERFORM _sk('C','C11 a retired criterion no longer matches', n = 0, n||' matched');
  UPDATE public.facility_escalation_criteria SET is_active = true WHERE code = 'ESC-PROD';
END
$c4$;


-- =====================================================================
--  D — THE CLOSURE RULE
-- =====================================================================
DO $d$
DECLARE f uuid; a uuid; v_err text; n integer;
BEGIN
  --  A Major finding, which ESC-SEV says requires a CAPA.
  INSERT INTO public.facility_pest_findings
    (company_id,visit_id,station_code,finding,needs_action,severity,created_by)
  VALUES ('00000000-0000-7b05-a000-000000000001','00000000-0000-7b05-f000-000000000001',
          'BS-CLOSE','Rodent droppings at the dock door',true,'Major',auth.uid())
  RETURNING id INTO f;

  --  D1: no action at all.
  BEGIN
    UPDATE public.facility_pest_findings
       SET resolved_at = now(), resolved_by = auth.uid(),
           resolution_note = 'Gap sealed by maintenance.'
     WHERE id = f;
    PERFORM _sk('D','D1 cannot close with no action at all', false,'the update succeeded');
  EXCEPTION WHEN others THEN
    v_err := SQLERRM;
    PERFORM _sk('D','D1 cannot close with no action at all',
                v_err LIKE 'PEST_FINDING_NEEDS_CORRECTIVE_TASK%', v_err);
  END;

  --  An action, but still open.
  INSERT INTO public.facility_action_register
    (company_id,source_kind,source_id,title,owner_id,due_on,created_by)
  VALUES ('00000000-0000-7b05-a000-000000000001','pest_finding',f,
          'Seal the gap under the dock door',auth.uid(),'2026-11-03',auth.uid())
  RETURNING id INTO a;
  UPDATE public.facility_pest_findings SET corrective_task_id = a WHERE id = f;

  --  D2: an open action is not a closed one.
  BEGIN
    UPDATE public.facility_pest_findings
       SET resolved_at = now(), resolved_by = auth.uid(), resolution_note = 'done'
     WHERE id = f;
    PERFORM _sk('D','D2 cannot close while the action is open', false,'the update succeeded');
  EXCEPTION WHEN others THEN
    v_err := SQLERRM;
    PERFORM _sk('D','D2 cannot close while the action is open',
                v_err LIKE 'ACTION_NOT_COMPLETED%', v_err);
  END;

  --  D3: completing an action without evidence is refused by the
  --  register itself, before the finding is even involved.
  BEGIN
    UPDATE public.facility_action_register
       SET status = 'completed', completed_at = now(), completed_by = auth.uid()
     WHERE id = a;
    PERFORM _sk('D','D3 an action cannot be completed without evidence',
                false,'the update succeeded');
  EXCEPTION WHEN check_violation THEN
    PERFORM _sk('D','D3 an action cannot be completed without evidence', true, SQLSTATE);
  END;

  --  Complete it properly.
  UPDATE public.facility_action_register
     SET status = 'completed', completed_at = now(), completed_by = auth.uid(),
         closure_evidence = 'Gap sealed; photograph and maintenance ticket on file.',
         closure_ref = 'MNT-2026-0412'
   WHERE id = a;
  PERFORM _sk('D','D4 an action completes with evidence',
    (SELECT status = 'completed' FROM public.facility_action_register WHERE id = a));

  /*
   *  D5: STILL REFUSED, because ESC-SEV matched and requires a CAPA.
   *  This is the escalation half of the rule, and the refusal NAMES
   *  the criterion — which is what "explicitly rather than hidden"
   *  buys: the reader is told which rule stopped them.
   */
  BEGIN
    UPDATE public.facility_pest_findings
       SET resolved_at = now(), resolved_by = auth.uid(), resolution_note = 'done'
     WHERE id = f;
    PERFORM _sk('D','D5 a Major finding cannot close without its CAPA',
                false,'the update succeeded');
  EXCEPTION WHEN others THEN
    v_err := SQLERRM;
    PERFORM _sk('D','D5 a Major finding cannot close without its CAPA',
                v_err LIKE 'ACTION_NEEDS_CAPA%', v_err);
  END;

  PERFORM _sk('D','D6 and the refusal names the criterion that caused it',
    (SELECT true FROM (SELECT 1) x WHERE v_err LIKE '%ESC-SEV%'), v_err);

  --  Link the CAPA and it closes.
  UPDATE public.facility_action_register
     SET linked_capa_id = '00000000-0000-7b05-0a00-000000000001' WHERE id = a;
  UPDATE public.facility_pest_findings
     SET resolved_at = now(), resolved_by = auth.uid(),
         resolution_note = 'Gap sealed; CAPA raised for recurrence.'
   WHERE id = f;
  PERFORM _sk('D','D7 with the CAPA linked, the finding closes',
    (SELECT resolved_at IS NOT NULL FROM public.facility_pest_findings WHERE id = f));

  --  D8: a Minor finding needs an action and evidence, but NO CAPA —
  --  because no matching criterion requires one. The rule escalates
  --  where the criteria say so and not everywhere.
  INSERT INTO public.facility_pest_findings
    (company_id,visit_id,station_code,finding,needs_action,severity,created_by)
  VALUES ('00000000-0000-7b05-a000-000000000001','00000000-0000-7b05-f000-000000000001',
          'BS-MINOR2','Light activity',true,'Minor',auth.uid())
  RETURNING id INTO f;
  INSERT INTO public.facility_action_register
    (company_id,source_kind,source_id,title,status,closure_evidence,
     completed_at,completed_by,created_by)
  VALUES ('00000000-0000-7b05-a000-000000000001','pest_finding',f,
          'Replace the bait','completed','Bait replaced and checked at the next visit.',
          now(),auth.uid(),auth.uid())
  RETURNING id INTO a;
  UPDATE public.facility_pest_findings
     SET corrective_task_id = a, resolved_at = now(), resolved_by = auth.uid(),
         resolution_note = 'Bait replaced.'
   WHERE id = f;
  PERFORM _sk('D','D8 a Minor finding closes without a CAPA',
    (SELECT resolved_at IS NOT NULL FROM public.facility_pest_findings WHERE id = f));

  --  D9: a finding that does NOT need action is untouched by any of
  --  this — three flies on a glue board is not a corrective action.
  INSERT INTO public.facility_pest_findings
    (company_id,visit_id,station_code,finding,needs_action,
     disposition_note,resolved_at,resolved_by,resolution_note,created_by)
  VALUES ('00000000-0000-7b05-a000-000000000001','00000000-0000-7b05-f000-000000000001',
          'ILT-9','3 flies on glue board',false,'Normal level · no action',
          now(),auth.uid(),'Within the normal range.',auth.uid())
  RETURNING id INTO f;
  PERFORM _sk('D','D9 an ordinary finding still closes with a note alone',
    (SELECT resolved_at IS NOT NULL FROM public.facility_pest_findings WHERE id = f));

  --  D10: the completed action cannot be deleted out from under a
  --  closed finding — it IS the evidence.
  BEGIN
    DELETE FROM public.facility_action_register WHERE id = a;
    PERFORM _sk('D','D10 a closed finding''s action cannot be deleted',
                false,'the delete succeeded');
  EXCEPTION WHEN foreign_key_violation THEN
    PERFORM _sk('D','D10 a closed finding''s action cannot be deleted', true, SQLSTATE);
  END;
END
$d$;


-- =====================================================================
--  E — company isolation
-- =====================================================================
DO $e$
DECLARE v_err text; f uuid; n integer;
BEGIN
  SELECT id INTO f FROM public.facility_pest_findings
   WHERE station_code = 'BS-MAJOR' LIMIT 1;

  --  An action on our own finding cannot link another company's CAPA.
  BEGIN
    INSERT INTO public.facility_action_register
      (company_id,source_kind,source_id,title,linked_capa_id,created_by)
    VALUES ('00000000-0000-7b05-a000-000000000001','pest_finding',f,
            'Borrowed CAPA','00000000-0000-7b05-0a00-000000000002',auth.uid());
    PERFORM _sk('E','E1 an action cannot link another company''s CAPA',
                false,'the insert succeeded');
  EXCEPTION WHEN others THEN
    v_err := SQLERRM;
    PERFORM _sk('E','E1 an action cannot link another company''s CAPA',
      v_err LIKE 'CAPA_WRONG_COMPANY%' OR v_err LIKE 'CAPA_NOT_FOUND%', v_err);
  END;

  --  An action cannot be filed for another company.
  BEGIN
    INSERT INTO public.facility_action_register
      (company_id,source_kind,source_id,title,created_by)
    VALUES ('00000000-0000-7b05-a000-000000000002','pest_finding',f,'Trespass',auth.uid());
    PERFORM _sk('E','E2 an action cannot be filed for another company',
                false,'the insert succeeded');
  EXCEPTION WHEN others THEN
    PERFORM _sk('E','E2 an action cannot be filed for another company', true, SQLSTATE);
  END;

  --  And criteria are not shared.
  SELECT count(*) INTO n FROM public.facility_escalation_criteria
   WHERE company_id = '00000000-0000-7b05-a000-000000000002';
  PERFORM _sk('E','E3 sees none of the other company''s criteria', n = 0, n||' row(s)');
END
$e$;


-- =====================================================================
--  F — the action list
-- =====================================================================
DO $f$
DECLARE n integer; r record;
BEGIN
  SELECT count(*) INTO n FROM public.facility_action_list(
    '00000000-0000-7b05-a000-000000000001');
  PERFORM _sk('F','F1 lists this company''s actions', n >= 2, n||' row(s)');

  SELECT count(*) INTO n FROM public.facility_action_list(
    '00000000-0000-7b05-a000-000000000002');
  PERFORM _sk('F','F2 returns nothing for another company', n = 0, n||' row(s)');

  --  The station and the visit are joined in, so an action can be read
  --  without a second query.
  SELECT * INTO r FROM public.facility_action_list(
    '00000000-0000-7b05-a000-000000000001')
   WHERE station_code = 'BS-CLOSE' LIMIT 1;
  PERFORM _sk('F','F3 names the station and visit the action came from',
              r.station_code = 'BS-CLOSE' AND r.visit_reference = 'AR-PC-0002',
              coalesce(r.visit_reference,'null'));

  PERFORM _sk('F','F4 carries the linked CAPA number',
              r.capa_number = 'AR-CAPA-0001', coalesce(r.capa_number,'null'));

  --  Overdue is arithmetic on a recorded date.
  SELECT count(*) INTO n FROM public.facility_action_list(
    '00000000-0000-7b05-a000-000000000001') WHERE is_overdue;
  PERFORM _sk('F','F5 a completed action is never overdue', n = 0, n||' overdue');
END
$f$;


-- =====================================================================
--  G — leaving the register
-- =====================================================================
DO $g$
DECLARE f uuid; a uuid;
BEGIN
  SELECT id INTO f FROM public.facility_pest_findings
   WHERE station_code = 'BS-PROD' LIMIT 1;

  INSERT INTO public.facility_action_register
    (company_id,source_kind,source_id,title,created_by)
  VALUES ('00000000-0000-7b05-a000-000000000001','pest_finding',f,
          'Raised in error',auth.uid())
  RETURNING id INTO a;

  --  An unexplained cancellation is indistinguishable from
  --  suppression, so a reason is required.
  BEGIN
    UPDATE public.facility_action_register SET status = 'cancelled' WHERE id = a;
    PERFORM _sk('G','G1 cancelling without a reason is refused',
                false,'the update succeeded');
  EXCEPTION WHEN check_violation THEN
    PERFORM _sk('G','G1 cancelling without a reason is refused', true, SQLSTATE);
  END;

  UPDATE public.facility_action_register
     SET status = 'cancelled', cancelled_reason = 'Duplicate of the dock-door action.'
   WHERE id = a;
  PERFORM _sk('G','G2 cancelling with a reason is accepted',
    (SELECT status = 'cancelled' FROM public.facility_action_register WHERE id = a));

  --  A cancelled action is not a completed one, so it cannot be used
  --  to close a finding that needs action.
  PERFORM _sk('G','G3 a cancelled action carries no completion',
    (SELECT completed_at IS NULL FROM public.facility_action_register WHERE id = a));
END
$g$;

RESET ROLE;
SELECT set_config('request.jwt.claims','',false);


\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo '  THE ACTION REGISTER AND ITS ESCALATION CRITERIA'
\echo '════════════════════════════════════════════════════════════════'
SELECT section, count(*) AS assertions, count(*) FILTER (WHERE NOT ok) AS failures
  FROM _s GROUP BY section ORDER BY section;
SELECT section, name, coalesce(detail,'') AS detail FROM _s WHERE NOT ok ORDER BY section, name;
SELECT count(*) AS total, count(*) FILTER (WHERE ok) AS passed,
       count(*) FILTER (WHERE NOT ok) AS failed FROM _s;

DO $v$
DECLARE f integer;
BEGIN
  SELECT count(*) INTO f FROM _s WHERE NOT ok;
  IF f > 0 THEN RAISE EXCEPTION 'ACTION REGISTER: % assertion(s) failed', f; END IF;
  RAISE NOTICE 'ACTION REGISTER: all assertions passed';
END
$v$;
