-- =====================================================================
--  D04 / D05 / D06 — INTEGRATION ACCEPTANCE PASS
--  LOCAL / DISPOSABLE DATABASE ONLY
-- =====================================================================
--  The three per-deliverable suites each build their own fixtures and
--  prove their own deliverable. What none of them exercises is the
--  seams: one product, one submission, one licence, one batch, carried
--  end to end through all three.
--
--  This suite follows a single regulated product through its whole
--  regulatory life and asserts the eight handoffs:
--
--    1. Product        -> Registration -> Submission
--    2. Submission     -> Approval     -> Licence
--    3. Licence        -> Product status
--    4. Licence expiry -> Batch initiation
--    5. Licence expiry -> Batch release
--    6. Renewal        -> Successor licence
--    7. Variation      -> Parent registration
--    8. Company tenancy across all three deliverables
--
--  It deliberately re-proves almost nothing that the unit suites cover.
--  Where a case here overlaps one there, it is because the value being
--  read was produced by a DIFFERENT deliverable than the one asserting
--  it — which is the whole point.
--
--  Run:  psql "<local url>" -f supabase/tests/d04_d06_integration_test.sql
-- =====================================================================

\set ON_ERROR_STOP off

DO $guard$
BEGIN
  IF current_database() NOT IN ('postgres','criateur_local') THEN
    RAISE EXCEPTION 'REFUSING TO RUN outside a local database (got %)', current_database();
  END IF;
  IF to_regprocedure('public.licence_record_approval(uuid,text,date,date,boolean)') IS NULL
     OR to_regprocedure('public.submission_raise_directive(uuid,text,date,date)') IS NULL
     OR to_regprocedure('public.product_is_release_eligible(uuid)') IS NULL THEN
    RAISE EXCEPTION 'D04, D05 and D06 must all be applied to this database.';
  END IF;
END $guard$;

DROP TABLE IF EXISTS int_results;
CREATE TEMP TABLE int_results(seq serial, id text, name text, verdict text, detail text);
GRANT ALL ON int_results TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE int_results_seq_seq TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION int_assert(p_id text, p_name text, p_cond boolean, p_detail text DEFAULT '')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO int_results(id,name,verdict,detail)
  VALUES (p_id,p_name,CASE WHEN p_cond THEN 'PASS' ELSE 'FAIL' END,p_detail);
END $$;

-- ── fixtures: one company, one product, nothing else ─────────────────
DO $fx$
DECLARE
  ca uuid := '00000000-0000-7600-a000-00000000000a';
  cz uuid := '00000000-0000-7600-a000-0000000000ff';
  ua uuid := '00000000-0000-7600-b000-000000000001';   -- admin
  up uuid := '00000000-0000-7600-b000-000000000002';   -- production
  uz uuid := '00000000-0000-7600-b000-000000000009';   -- outsider
BEGIN
  INSERT INTO public.companies(id,name) VALUES
    (ca,'INT Alpha'), (cz,'INT Outsider') ON CONFLICT (id) DO NOTHING;

  INSERT INTO auth.users(id,email) VALUES
    (ua,'int-a@local.test'), (up,'int-p@local.test'), (uz,'int-z@local.test')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.profiles(id,email,full_name,role,company_id) VALUES
    (ua,'int-a@local.test','Ada Admin','admin',ca),
    (up,'int-p@local.test','Pat Production','content_creator',ca),
    (uz,'int-z@local.test','Zoe Outsider','admin',cz)
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.company_members(company_id,user_id,role,status) VALUES
    (ca,ua,'owner','active'), (ca,up,'production','active'), (cz,uz,'owner','active')
    ON CONFLICT DO NOTHING;

  --  The only domain row created up front. Everything else in this
  --  suite is produced by the deliverables themselves.
  INSERT INTO public.products
    (id,company_id,product_code,trade_name,generic_name,category,
     manufacturing_type,dosage_form,strength,created_by)
  VALUES ('00000000-0000-7600-c000-000000000001',ca,'INT-001','Integration Syrup',
          'Paracetamol','drug_pharmaceutical','in_house','Oral Suspension','120mg/5ml',ua);

  IF NOT EXISTS (SELECT 1 FROM public.company_members
                  WHERE user_id = uz AND company_id = cz AND status='active') THEN
    RAISE EXCEPTION 'outsider fixture did not take; section 8 would prove nothing';
  END IF;
END $fx$;

SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-7600-b000-000000000001","role":"authenticated"}', false);


-- =====================================================================
--  1 — Product -> Registration -> Submission
-- =====================================================================
SET ROLE authenticated;
DO $h1$
DECLARE v_status text; v_ok boolean := false; v_msg text;
BEGIN
  SELECT status INTO v_status FROM public.products
   WHERE id='00000000-0000-7600-c000-000000000001';
  PERFORM int_assert('1.1','a new product enters the registry at concept',
    v_status = 'concept', coalesce(v_status,'NULL'));

  --  The submission is raised AGAINST the registry product, not against
  --  a free-text product name. That link is what lets D06 later move the
  --  product when the licence is granted.
  INSERT INTO public.regulatory_submissions
    (id,company_id,product_id,product_name,product_category,submission_type,
     regulatory_body,document_checklist,checklist_phases,created_by)
  VALUES ('00000000-0000-7600-d000-000000000001','00000000-0000-7600-a000-00000000000a',
          '00000000-0000-7600-c000-000000000001','Integration Syrup','drug_pharmaceutical',
          'local_manufacture','nafdac',
          jsonb_build_object(
            'CAC Certificate',       jsonb_build_object('is_present',true),
            'Product Label',         jsonb_build_object('is_present',false),
            'GMP Inspection Report', jsonb_build_object('is_present',false)),
          jsonb_build_object('CAC Certificate','pre','Product Label','pre',
                             'GMP Inspection Report','post'),
          '00000000-0000-7600-b000-000000000001');

  PERFORM int_assert('1.2','the submission is linked to the registry product, not a name',
    (SELECT product_id FROM public.regulatory_submissions
      WHERE id='00000000-0000-7600-d000-000000000001')
      = '00000000-0000-7600-c000-000000000001');

  --  D04's gate, reached through the engine.
  BEGIN
    PERFORM public.lifecycle_transition('regulatory_submission',
      '00000000-0000-7600-d000-000000000001','submit',
      '00000000-0000-7600-a000-00000000000a',NULL,NULL,'{}'::jsonb);
    v_msg := 'INCOMPLETE SUBMISSION ACCEPTED';
  EXCEPTION WHEN others THEN
    v_ok := SQLERRM LIKE 'SUBMISSION_INCOMPLETE%'; v_msg := SQLERRM;
  END;
  PERFORM int_assert('1.3','submit is refused while a pre-submission document is missing',
    v_ok, left(v_msg,110));
  PERFORM int_assert('1.4','and the refusal names the missing document',
    v_msg LIKE '%Product Label%', left(v_msg,110));
  PERFORM int_assert('1.5','the post-submission document is not counted against it',
    v_msg NOT LIKE '%GMP Inspection Report%', left(v_msg,110));

  UPDATE public.regulatory_submissions
     SET document_checklist = jsonb_set(document_checklist,
           '{Product Label,is_present}', 'true'::jsonb)
   WHERE id='00000000-0000-7600-d000-000000000001';

  PERFORM public.lifecycle_transition('regulatory_submission',
    '00000000-0000-7600-d000-000000000001','submit',
    '00000000-0000-7600-a000-00000000000a',NULL,NULL,'{}'::jsonb);

  SELECT current_status INTO v_status FROM public.regulatory_submissions
   WHERE id='00000000-0000-7600-d000-000000000001';
  PERFORM int_assert('1.6','once the pre-submission set is complete it submits',
    v_status = 'submitted', coalesce(v_status,'NULL'));

  --  The product follows the filing. Two separate lifecycles, moved
  --  deliberately — neither infers its state from the other.
  PERFORM public.lifecycle_transition('product','00000000-0000-7600-c000-000000000001',
    'start_regulatory_prep','00000000-0000-7600-a000-00000000000a',NULL,NULL,'{}'::jsonb);
  PERFORM public.lifecycle_transition('product','00000000-0000-7600-c000-000000000001',
    'submit_to_regulator','00000000-0000-7600-a000-00000000000a',NULL,NULL,'{}'::jsonb);

  SELECT status INTO v_status FROM public.products
   WHERE id='00000000-0000-7600-c000-000000000001';
  PERFORM int_assert('1.7','the product is with the regulator alongside its submission',
    v_status = 'submitted', coalesce(v_status,'NULL'));

  --  D05's release gate is already live and already refuses: the
  --  product is not registered yet.
  PERFORM int_assert('1.8','an unregistered product is not release-eligible',
    NOT public.product_is_release_eligible('00000000-0000-7600-c000-000000000001'));
END $h1$;


-- =====================================================================
--  2 — Submission -> Approval -> Licence
-- =====================================================================
DO $h2$
DECLARE r jsonb; b jsonb; v_status text; d_id uuid;
BEGIN
  PERFORM public.lifecycle_transition('regulatory_submission','00000000-0000-7600-d000-000000000001',
    'begin_division_review','00000000-0000-7600-a000-00000000000a',NULL,NULL,'{}'::jsonb);
  PERFORM public.lifecycle_transition('regulatory_submission','00000000-0000-7600-d000-000000000001',
    'schedule_inspection','00000000-0000-7600-a000-00000000000a',NULL,NULL,'{}'::jsonb);
  PERFORM public.lifecycle_transition('regulatory_submission','00000000-0000-7600-d000-000000000001',
    'complete_inspection','00000000-0000-7600-a000-00000000000a',NULL,NULL,'{}'::jsonb);
  PERFORM public.lifecycle_transition('regulatory_submission','00000000-0000-7600-d000-000000000001',
    'begin_lab_testing','00000000-0000-7600-a000-00000000000a',NULL,NULL,'{}'::jsonb);

  --  Backdate the filing so the two clocks have something to separate.
  UPDATE public.regulatory_submissions SET submitted_date = current_date - 30
   WHERE id='00000000-0000-7600-d000-000000000001';

  r := public.submission_raise_directive('00000000-0000-7600-d000-000000000001',
        'Provide batch analysis for three consecutive batches',
        current_date - 20, current_date + 10);
  d_id := (r ->> 'directive_id')::uuid;

  PERFORM int_assert('2.1','a directive raised in lab testing records that stage',
    (r ->> 'originating_state') = 'lab_testing', coalesce(r ->> 'originating_state','NULL'));

  PERFORM public.lifecycle_transition('regulatory_submission','00000000-0000-7600-d000-000000000001',
    'await_applicant_response','00000000-0000-7600-a000-00000000000a',NULL,NULL,'{}'::jsonb);
  r := public.submission_respond_to_directive(d_id, 'Batch analyses attached');

  SELECT current_status INTO v_status FROM public.regulatory_submissions
   WHERE id='00000000-0000-7600-d000-000000000001';
  PERFORM int_assert('2.2','answering it restores lab testing, not Submitted or Draft',
    v_status = 'lab_testing', coalesce(v_status,'NULL'));

  b := public.submission_time_breakdown('00000000-0000-7600-d000-000000000001');
  PERFORM int_assert('2.3','the directive clock is separate from active review time',
    (b ->> 'directive_days')::int >= 19
    AND (b ->> 'active_review_days')::int BETWEEN 1 AND 15
    AND (b ->> 'total_days')::int >= 30,
    'total='||(b ->> 'total_days')||' directive='||(b ->> 'directive_days')
      ||' active='||(b ->> 'active_review_days'));

  PERFORM public.lifecycle_transition('regulatory_submission','00000000-0000-7600-d000-000000000001',
    'refer_to_fdrc','00000000-0000-7600-a000-00000000000a',NULL,NULL,'{}'::jsonb);
  PERFORM public.lifecycle_transition('regulatory_submission','00000000-0000-7600-d000-000000000001',
    'approve','00000000-0000-7600-a000-00000000000a',NULL,'FDRC approved','{}'::jsonb);

  SELECT current_status INTO v_status FROM public.regulatory_submissions
   WHERE id='00000000-0000-7600-d000-000000000001';
  PERFORM int_assert('2.4','the submission reaches approved through the engine',
    v_status = 'approved', coalesce(v_status,'NULL'));

  --  The certificate that results from the approval carries both links,
  --  which is what makes the audit trail traceable in both directions.
  INSERT INTO public.regulatory_licences
    (id,company_id,licence_type,name,product_name,product_id,submission_id,
     regulatory_body,created_by)
  VALUES ('00000000-0000-7600-e000-000000000001','00000000-0000-7600-a000-00000000000a',
          'nafdac_product_registration','Integration Syrup Registration','Integration Syrup',
          '00000000-0000-7600-c000-000000000001','00000000-0000-7600-d000-000000000001',
          'nafdac','00000000-0000-7600-b000-000000000001');

  PERFORM int_assert('2.5','the licence is traceable back to its submission and its product',
    EXISTS (SELECT 1 FROM public.regulatory_licences
             WHERE id='00000000-0000-7600-e000-000000000001'
               AND submission_id='00000000-0000-7600-d000-000000000001'
               AND product_id='00000000-0000-7600-c000-000000000001'));

  SELECT status INTO v_status FROM public.regulatory_licences
   WHERE id='00000000-0000-7600-e000-000000000001';
  PERFORM int_assert('2.6','an approved submission does not by itself grant the licence',
    v_status = 'draft', coalesce(v_status,'NULL'));
END $h2$;


-- =====================================================================
--  3 — Licence -> Product status  (the approval cascade)
-- =====================================================================
DO $h3$
DECLARE r jsonb; n int; v_status text; v_num text; v_exp date;
BEGIN
  r := public.licence_record_approval('00000000-0000-7600-e000-000000000001',
        'A4-INT-001', (current_date + interval '2 years')::date, current_date, true);

  PERFORM int_assert('3.1','the cascade runs all five steps in one transaction',
    jsonb_array_length(r -> 'steps') = 5, jsonb_array_length(r -> 'steps')||'');

  SELECT count(*) INTO n FROM public.audit_logs
   WHERE company_id='00000000-0000-7600-a000-00000000000a';
  PERFORM int_assert('3.2','each step is its own audit row', n = 5, n||' row(s)');

  SELECT count(*) INTO n FROM public.audit_logs a
   WHERE a.company_id='00000000-0000-7600-a000-00000000000a'
     AND a.sequence_number > 1
     AND NOT EXISTS (SELECT 1 FROM public.audit_logs p
                      WHERE p.company_id = a.company_id
                        AND p.sequence_number = a.sequence_number - 1
                        AND p.integrity_hash = a.previous_hash);
  PERFORM int_assert('3.3','and the five rows form an unbroken chain', n = 0, n||' break(s)');

  SELECT status INTO v_status FROM public.regulatory_licences
   WHERE id='00000000-0000-7600-e000-000000000001';
  PERFORM int_assert('3.4','the licence is granted', v_status='active', coalesce(v_status,'NULL'));

  --  THE HANDOFF: a D06 cascade moved a D05 entity through the D01 engine.
  SELECT status INTO v_status FROM public.products
   WHERE id='00000000-0000-7600-c000-000000000001';
  PERFORM int_assert('3.5','granting the licence moved the product to registered',
    v_status = 'registered', coalesce(v_status,'NULL'));

  SELECT nafdac_number, registration_expiry_date INTO v_num, v_exp
    FROM public.products WHERE id='00000000-0000-7600-c000-000000000001';
  PERFORM int_assert('3.6','the product carries the registration number from the licence',
    v_num = 'A4-INT-001', coalesce(v_num,'NULL'));
  PERFORM int_assert('3.7','and the expiry date from the licence',
    v_exp = (current_date + interval '2 years')::date, coalesce(v_exp::text,'NULL'));

  --  …which is what finally makes the product release-eligible under D05.
  PERFORM int_assert('3.8','the product is now release-eligible under the D05 gate',
    public.product_is_release_eligible('00000000-0000-7600-c000-000000000001'));

  PERFORM int_assert('3.9','the engine history records the product move as a transition',
    EXISTS (SELECT 1 FROM public.entity_state_history
             WHERE entity_type='product'
               AND entity_id='00000000-0000-7600-c000-000000000001'
               AND metadata ->> 'licence_id' = '00000000-0000-7600-e000-000000000001'));
END $h3$;
RESET ROLE;

--  Read as the recipient: the notification policy is
--  recipient_id = auth.uid(), so the admin who filed cannot see it.
DO $h3n$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.notifications
   WHERE type='licence_granted' AND content_id='00000000-0000-7600-e000-000000000001'
     AND recipient_id='00000000-0000-7600-b000-000000000002';
  PERFORM int_assert('3.10','production was told the product may now be made', n = 1, n||'');
END $h3n$;
SET ROLE authenticated;


-- =====================================================================
--  4 — Licence expiry -> Batch initiation
-- =====================================================================
RESET ROLE;
DO $h4$
DECLARE v_ok boolean := false; v_msg text;
BEGIN
  --  While the registration is in force, manufacturing proceeds.
  INSERT INTO public.batch_records
    (id,company_id,batch_number,product_name,product_id,
     manufacturing_date,expiry_date,batch_size,created_by)
  VALUES ('00000000-0000-7600-f000-000000000001','00000000-0000-7600-a000-00000000000a',
          'INT-B-001','Integration Syrup','00000000-0000-7600-c000-000000000001',
          current_date, current_date + 730, 500,'00000000-0000-7600-b000-000000000001');
  PERFORM int_assert('4.1','a batch can be started against a licence in force',
    EXISTS (SELECT 1 FROM public.batch_records WHERE id='00000000-0000-7600-f000-000000000001'));

  --  Two years pass.
  UPDATE public.regulatory_licences SET expiry_date = current_date - 1
   WHERE id='00000000-0000-7600-e000-000000000001';
  PERFORM public.lifecycle_transition('regulatory_licence','00000000-0000-7600-e000-000000000001',
    'lapse','00000000-0000-7600-a000-00000000000a',
    '00000000-0000-7600-b000-000000000001',NULL,'{}'::jsonb);

  BEGIN
    INSERT INTO public.batch_records
      (id,company_id,batch_number,product_name,product_id,
       manufacturing_date,expiry_date,batch_size,created_by)
    VALUES ('00000000-0000-7600-f000-000000000002','00000000-0000-7600-a000-00000000000a',
            'INT-B-002','Integration Syrup','00000000-0000-7600-c000-000000000001',
            current_date, current_date + 730, 500,'00000000-0000-7600-b000-000000000001');
    v_msg := 'BATCH STARTED AGAINST A LAPSED REGISTRATION';
  EXCEPTION WHEN others THEN
    v_ok := SQLERRM LIKE 'LICENCE_EXPIRED%'; v_msg := SQLERRM;
  END;
  PERFORM int_assert('4.2','once the licence lapses, initiation is blocked', v_ok, left(v_msg,120));

  PERFORM int_assert('4.3','the block names the licence, the expiry date and the renewal status',
    v_msg LIKE '%Integration Syrup Registration%'
    AND v_msg LIKE '%'||(current_date - 1)::text||'%'
    AND v_msg LIKE '%renewal status:%', left(v_msg,140));

  --  D05's gate fires only on release, so on initiation the licence gate
  --  is the only voice — the operator is not shown two overlapping
  --  refusals for one cause.
  PERFORM int_assert('4.4','the product gate stays quiet on initiation',
    v_msg NOT LIKE '%BATCH_PRODUCT_NOT_ELIGIBLE%', left(v_msg,120));
END $h4$;


-- =====================================================================
--  5 — Licence expiry -> Batch release
-- =====================================================================
DO $h5$
DECLARE v_ok boolean := false; v_msg text;
BEGIN
  --  The batch was legitimately started while the licence was valid.
  --  It still must not be released now that it is not.
  BEGIN
    UPDATE public.batch_records SET status='released'
     WHERE id='00000000-0000-7600-f000-000000000001';
    v_msg := 'RELEASED AGAINST A LAPSED REGISTRATION';
  EXCEPTION WHEN others THEN
    v_ok := SQLERRM LIKE 'LICENCE_EXPIRED%'; v_msg := SQLERRM;
  END;
  PERFORM int_assert('5.1','a batch started under a valid licence cannot be released after it lapses',
    v_ok, left(v_msg,120));

  --  Defence in depth: D05's product gate is an independent control, not
  --  the same check reached twice. With D06's gate suspended, the
  --  release is still refused — for the product's expired registration.
  ALTER TABLE public.batch_records DISABLE TRIGGER trg_batch_records_licence_gate;
  v_ok := false;
  BEGIN
    UPDATE public.batch_records SET status='released'
     WHERE id='00000000-0000-7600-f000-000000000001';
    v_msg := 'ONLY ONE CONTROL — THE PRODUCT GATE DID NOT FIRE';
  EXCEPTION WHEN others THEN
    v_ok := SQLERRM LIKE 'BATCH_PRODUCT_NOT_ELIGIBLE%'; v_msg := SQLERRM;
  END;
  ALTER TABLE public.batch_records ENABLE TRIGGER trg_batch_records_licence_gate;
  PERFORM int_assert('5.2','the D05 product gate independently refuses the same release',
    v_ok, left(v_msg,120));
END $h5$;


-- =====================================================================
--  6 — Renewal -> Successor licence
-- =====================================================================
DO $h6$
DECLARE r jsonb; v_new uuid; v_status text; v_exp date; v_old_exp date;
BEGIN
  SELECT expiry_date INTO v_old_exp FROM public.regulatory_licences
   WHERE id='00000000-0000-7600-e000-000000000001';

  PERFORM public.lifecycle_transition('regulatory_licence','00000000-0000-7600-e000-000000000001',
    'begin_late_renewal','00000000-0000-7600-a000-00000000000a',
    '00000000-0000-7600-b000-000000000001','Renewal filed late','{}'::jsonb);

  r := public.licence_complete_renewal('00000000-0000-7600-e000-000000000001',
        'A4-INT-001-R1', (current_date + interval '5 years')::date,
        'Renewed certificate collected');
  v_new := (r ->> 'new_licence_id')::uuid;

  SELECT status INTO v_status FROM public.regulatory_licences
   WHERE id='00000000-0000-7600-e000-000000000001';
  PERFORM int_assert('6.1','the lapsed certificate closes as renewed',
    v_status='renewed', coalesce(v_status,'NULL'));

  PERFORM int_assert('6.2','the successor is active and carries the new registration',
    (SELECT status FROM public.regulatory_licences WHERE id=v_new) = 'active'
    AND (SELECT registration_number FROM public.regulatory_licences WHERE id=v_new) = 'A4-INT-001-R1');

  PERFORM int_assert('6.3','the successor inherits the product link',
    (SELECT product_id FROM public.regulatory_licences WHERE id=v_new)
      = '00000000-0000-7600-c000-000000000001');

  --  The superseded record keeps its own dates, which is what lets a
  --  release from two years ago still be explained.
  PERFORM int_assert('6.4','the superseded record keeps the expiry it actually had',
    (SELECT expiry_date FROM public.regulatory_licences
      WHERE id='00000000-0000-7600-e000-000000000001') = v_old_exp,
    coalesce(v_old_exp::text,'NULL'));

  --  THE HANDOFF: the successor's cascade refreshed the product.
  SELECT registration_expiry_date INTO v_exp FROM public.products
   WHERE id='00000000-0000-7600-c000-000000000001';
  PERFORM int_assert('6.5','the renewal cascade refreshed the product registration expiry',
    v_exp = (current_date + interval '5 years')::date, coalesce(v_exp::text,'NULL'));

  PERFORM int_assert('6.6','the product is release-eligible again under D05',
    public.product_is_release_eligible('00000000-0000-7600-c000-000000000001'));

  PERFORM int_assert('6.7','and the licence gate no longer blocks',
    public.licence_block_reason('00000000-0000-7600-c000-000000000001','release') IS NULL,
    coalesce(left(public.licence_block_reason('00000000-0000-7600-c000-000000000001','release'),80),
             'not blocked'));
END $h6$;

RESET ROLE;
DO $h6b$
DECLARE v_ok boolean := false; v_msg text;
BEGIN
  --  The batch held back in section 5 can now be released, and it is the
  --  same batch — not a new one created to make the test pass.
  BEGIN
    UPDATE public.batch_records SET status='released', released_at=now()
     WHERE id='00000000-0000-7600-f000-000000000001';
    v_ok := true; v_msg := 'released';
  EXCEPTION WHEN others THEN v_msg := SQLERRM;
  END;
  PERFORM int_assert('6.8','the batch held back in section 5 releases once the renewal lands',
    v_ok AND (SELECT status FROM public.batch_records
               WHERE id='00000000-0000-7600-f000-000000000001') = 'released',
    left(v_msg,110));
END $h6b$;
SET ROLE authenticated;


-- =====================================================================
--  7 — Variation -> Parent registration
-- =====================================================================
DO $h7$
DECLARE v_new uuid; r jsonb; v_ok boolean := false; v_msg text; v_exp date;
BEGIN
  SELECT id INTO v_new FROM public.regulatory_licences
   WHERE product_id='00000000-0000-7600-c000-000000000001' AND status='active'
   ORDER BY created_at DESC LIMIT 1;

  INSERT INTO public.licence_variations
    (id,company_id,licence_id,product_id,variation_class,variation_type,
     title,description,created_by)
  VALUES ('00000000-0000-7600-9000-000000000001','00000000-0000-7600-a000-00000000000a',
          v_new,'00000000-0000-7600-c000-000000000001','major','manufacturing_site_change',
          'Move filling to the Ota site','Secondary packaging relocated',
          '00000000-0000-7600-b000-000000000001');

  PERFORM int_assert('7.1','the variation hangs off the current registration, not the superseded one',
    (SELECT licence_id FROM public.licence_variations
      WHERE id='00000000-0000-7600-9000-000000000001') = v_new);

  PERFORM public.lifecycle_transition('licence_variation','00000000-0000-7600-9000-000000000001',
    'submit','00000000-0000-7600-a000-00000000000a',NULL,NULL,'{}'::jsonb);
  PERFORM public.lifecycle_transition('licence_variation','00000000-0000-7600-9000-000000000001',
    'begin_review','00000000-0000-7600-a000-00000000000a',NULL,NULL,'{}'::jsonb);

  BEGIN
    PERFORM public.licence_variation_approve('00000000-0000-7600-9000-000000000001','ok',NULL);
    v_msg := 'MAJOR VARIATION APPROVED WITHOUT SUPPORTING EVIDENCE';
  EXCEPTION WHEN others THEN
    v_ok := SQLERRM LIKE 'VARIATION_MAJOR_INCOMPLETE%'; v_msg := SQLERRM;
  END;
  PERFORM int_assert('7.2','a site change cannot be approved without justification and impact',
    v_ok, left(v_msg,110));

  UPDATE public.licence_variations
     SET justification='Ota site qualified for filling',
         impact_assessment='Process validation and three consecutive batches completed'
   WHERE id='00000000-0000-7600-9000-000000000001';

  PERFORM public.licence_variation_approve('00000000-0000-7600-9000-000000000001',
    'NAFDAC approved the site change', (current_date + interval '7 years')::date);

  SELECT expiry_date INTO v_exp FROM public.regulatory_licences WHERE id = v_new;
  PERFORM int_assert('7.3','approval alone does not move the parent registration',
    v_exp = (current_date + interval '5 years')::date, coalesce(v_exp::text,'NULL'));

  PERFORM public.licence_variation_implement('00000000-0000-7600-9000-000000000001',
    'Ota site in routine production');

  SELECT expiry_date INTO v_exp FROM public.regulatory_licences WHERE id = v_new;
  PERFORM int_assert('7.4','implementation moves the parent registration',
    v_exp = (current_date + interval '7 years')::date, coalesce(v_exp::text,'NULL'));

  --  THE HANDOFF: and the product registry follows the parent.
  SELECT registration_expiry_date INTO v_exp FROM public.products
   WHERE id='00000000-0000-7600-c000-000000000001';
  PERFORM int_assert('7.5','and the product registry follows it',
    v_exp = (current_date + interval '7 years')::date, coalesce(v_exp::text,'NULL'));

  PERFORM int_assert('7.6','the variation is terminal once implemented',
    (SELECT s.is_terminal FROM public.entity_current_state ecs
       JOIN public.lifecycle_states s ON s.id = ecs.state_id
      WHERE ecs.entity_type='licence_variation'
        AND ecs.entity_id='00000000-0000-7600-9000-000000000001'));
END $h7$;
RESET ROLE;


-- =====================================================================
--  8 — Company tenancy across all three deliverables
-- =====================================================================
--  One caller, one loop through everything the three deliverables
--  expose. The outsider is a real signed-in admin of another company.
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-7600-b000-000000000009","role":"authenticated"}', false);
SET ROLE authenticated;

DO $h8$
DECLARE n int; v_ok boolean; v_msg text;
BEGIN
  PERFORM int_assert('8.0','the outsider is an admin of a different company, not of nothing',
    public.app_is_company_member('00000000-0000-7600-a000-0000000000ff')
    AND NOT public.app_is_company_member('00000000-0000-7600-a000-00000000000a'));

  SELECT count(*) INTO n FROM public.products
   WHERE id='00000000-0000-7600-c000-000000000001';
  PERFORM int_assert('8.1','D05: the product is invisible', n = 0, n||' row(s)');

  SELECT count(*) INTO n FROM public.regulatory_submissions
   WHERE id='00000000-0000-7600-d000-000000000001';
  PERFORM int_assert('8.2','D04: the submission is invisible', n = 0, n||' row(s)');

  SELECT count(*) INTO n FROM public.regulatory_licences
   WHERE product_id='00000000-0000-7600-c000-000000000001';
  PERFORM int_assert('8.3','D06: the licences are invisible', n = 0, n||' row(s)');

  SELECT count(*) INTO n FROM public.licence_variations
   WHERE id='00000000-0000-7600-9000-000000000001';
  PERFORM int_assert('8.4','D06: the variation is invisible', n = 0, n||' row(s)');

  SELECT count(*) INTO n FROM public.batch_records
   WHERE company_id='00000000-0000-7600-a000-00000000000a';
  PERFORM int_assert('8.5','the batch records are invisible', n = 0, n||' row(s)');

  SELECT count(*) INTO n FROM public.licence_renewal_alerts
   WHERE company_id='00000000-0000-7600-a000-00000000000a';
  PERFORM int_assert('8.6','the renewal alerts are invisible', n = 0, n||' row(s)');

  SELECT count(*) INTO n FROM public.entity_state_history
   WHERE company_id='00000000-0000-7600-a000-00000000000a';
  PERFORM int_assert('8.7','the engine history is invisible', n = 0, n||' row(s)');

  --  …and the RPCs, which run SECURITY DEFINER and so are not covered
  --  by any of the above.
  v_ok := false;
  BEGIN
    PERFORM public.submission_raise_directive('00000000-0000-7600-d000-000000000001',
      'injected directive', current_date, NULL);
    v_msg := 'D04 DIRECTIVE RAISED ACROSS TENANTS';
  EXCEPTION WHEN others THEN
    v_ok := SQLERRM LIKE 'SUBMISSION_FORBIDDEN%'; v_msg := SQLERRM;
  END;
  PERFORM int_assert('8.8','D04: a directive cannot be raised across companies', v_ok, left(v_msg,100));

  v_ok := false;
  BEGIN
    PERFORM public.licence_block_reason('00000000-0000-7600-c000-000000000001','release');
    v_msg := 'D06 LICENCE DETAILS LEAKED';
  EXCEPTION WHEN others THEN
    v_ok := SQLERRM LIKE 'LICENCE_FORBIDDEN%'; v_msg := SQLERRM;
  END;
  PERFORM int_assert('8.9','D06: licence details do not leak through the batch gate helper',
    v_ok, left(v_msg,100));

  v_ok := false;
  BEGIN
    PERFORM public.licence_record_approval('00000000-0000-7600-e000-000000000001',
      'HIJACK', (current_date + interval '1 year')::date, current_date, false);
    v_msg := 'D06 CASCADE RAN ACROSS TENANTS';
  EXCEPTION WHEN others THEN
    v_ok := SQLERRM LIKE 'LICENCE_FORBIDDEN%'; v_msg := SQLERRM;
  END;
  PERFORM int_assert('8.10','D06: the approval cascade refuses across companies',
    v_ok, left(v_msg,100));

  v_ok := false;
  BEGIN
    PERFORM public.lifecycle_transition('product','00000000-0000-7600-c000-000000000001',
      'discontinue','00000000-0000-7600-a000-00000000000a',NULL,'sabotage','{}'::jsonb);
    v_msg := 'D05 PRODUCT MOVED ACROSS TENANTS';
  EXCEPTION WHEN others THEN
    v_ok := SQLERRM LIKE 'LIFECYCLE_FORBIDDEN%'; v_msg := SQLERRM;
  END;
  PERFORM int_assert('8.11','D01/D05: the engine refuses a transition across companies',
    v_ok, left(v_msg,100));

  --  product_is_release_eligible() is SECURITY DEFINER and takes an id.
  --  It returns only a boolean, but that boolean is another tenant's
  --  commercial state — whether a product they cannot see is on the
  --  market. This integration pass is what found it.
  v_ok := false;
  BEGIN
    PERFORM public.product_is_release_eligible('00000000-0000-7600-c000-000000000001');
    v_msg := 'D05 ELIGIBILITY LEAKED ACROSS TENANTS';
  EXCEPTION WHEN others THEN
    v_ok := SQLERRM LIKE 'PRODUCT_FORBIDDEN%'; v_msg := SQLERRM;
  END;
  PERFORM int_assert('8.12','D05: product eligibility is not readable across companies',
    v_ok, left(v_msg,100));

  v_ok := false;
  BEGIN
    PERFORM public.product_available_documents('00000000-0000-7600-c000-000000000001');
    v_ok := true; v_msg := 'returned no rows';
  EXCEPTION WHEN others THEN v_msg := SQLERRM;
  END;
  PERFORM int_assert('8.13','D05: another company''s product documents are not listed',
    NOT EXISTS (SELECT 1 FROM public.product_available_documents(
                  '00000000-0000-7600-c000-000000000001')), left(v_msg,100));
END $h8$;
RESET ROLE;


-- ── results ──────────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims','',false);
\echo ''
\echo '======== D04-D06 INTEGRATION ACCEPTANCE — RESULTS ========'
SELECT id, name, verdict, detail FROM int_results ORDER BY seq;
\echo ''
SELECT verdict, count(*) FROM int_results GROUP BY verdict ORDER BY verdict;

-- ── cleanup ──────────────────────────────────────────────────────────
DO $cleanup$
BEGIN
  DELETE FROM public.licence_renewal_alerts   WHERE company_id::text LIKE '00000000-0000-7600-a000-%';
  DELETE FROM public.licence_renewal_steps    WHERE company_id::text LIKE '00000000-0000-7600-a000-%';
  DELETE FROM public.licence_renewal_policies WHERE company_id::text LIKE '00000000-0000-7600-a000-%';

  DELETE FROM public.entity_state_history WHERE company_id::text LIKE '00000000-0000-7600-a000-%';
  DELETE FROM public.entity_current_state WHERE company_id::text LIKE '00000000-0000-7600-a000-%';

  DELETE FROM public.licence_variations   WHERE company_id::text LIKE '00000000-0000-7600-a000-%';
  DELETE FROM public.submission_directives WHERE company_id::text LIKE '00000000-0000-7600-a000-%';
  DELETE FROM public.notifications        WHERE recipient_id::text LIKE '00000000-0000-7600-b000-%';
  DELETE FROM public.batch_records        WHERE company_id::text LIKE '00000000-0000-7600-a000-%';

  ALTER TABLE public.audit_logs DISABLE TRIGGER trg_block_audit_update;
  ALTER TABLE public.audit_logs DISABLE TRIGGER trg_block_audit_delete;
  ALTER TABLE public.audit_logs DISABLE TRIGGER trg_prevent_audit_log_deletion;
  DELETE FROM public.audit_logs WHERE company_id::text LIKE '00000000-0000-7600-a000-%';
  ALTER TABLE public.audit_logs ENABLE TRIGGER trg_prevent_audit_log_deletion;
  ALTER TABLE public.audit_logs ENABLE TRIGGER trg_block_audit_delete;
  ALTER TABLE public.audit_logs ENABLE TRIGGER trg_block_audit_update;

  DELETE FROM public.regulatory_licences  WHERE company_id::text LIKE '00000000-0000-7600-a000-%';
  DELETE FROM public.regulatory_submissions WHERE company_id::text LIKE '00000000-0000-7600-a000-%';
  DELETE FROM public.products             WHERE company_id::text LIKE '00000000-0000-7600-a000-%';
  DELETE FROM public.company_members      WHERE user_id::text LIKE '00000000-0000-7600-b000-%';
  DELETE FROM public.profiles             WHERE email LIKE 'int-%@local.test';
  DELETE FROM auth.users                  WHERE email LIKE 'int-%@local.test';
  DELETE FROM public.companies            WHERE name LIKE 'INT %';
  RAISE NOTICE 'int fixtures removed.';
EXCEPTION WHEN others THEN
  RAISE WARNING 'CLEANUP INCOMPLETE (%). Remove int rows manually.', SQLERRM;
END $cleanup$;

DROP FUNCTION IF EXISTS int_assert(text,text,boolean,text);
DROP TABLE IF EXISTS int_results;
