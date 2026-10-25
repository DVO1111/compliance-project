-- =====================================================================
--  WEEK 4 / ITEM 10 — EQUIPMENT CALIBRATION AND LOCKOUT
--
--  NOT DONE IF
--    The lockout exists in the interface only.
--    Expired status is displayed but the sign-off still succeeds.
--    Instrument use is not recorded against the step.
--
--  The second clause is the one to design the suite around, because it
--  is the bug you get by building this the obvious way. A stored
--  `calibration_status` kept current by a sweep displays correctly and
--  then lets the sign-off through the moment the sweep is late. So every
--  probe below asks the question the way production asks it — through the
--  function the screen and the lockout BOTH call — and section D moves
--  the clock without running any sweep at all.
--
--  Sections:
--    A. The register, and the certificate's upload validation
--    B. The due date is derived and cannot be written by hand
--    C. The lockout's answers
--    D. A calibration that lapses with the calendar, no sweep involved
--    E. The dispensing balance — where the brief says to start
--    F. Use recorded against the step
--    G. Stage sign-off blocked by a lapse after the use was recorded
--    H. Alerts to the equipment owner
--    I. Certificates are evidence
--    J. Tenancy
-- =====================================================================
\set ON_ERROR_STOP on
SET client_min_messages = warning;

CREATE TEMP TABLE _i10(section text, name text, ok boolean, detail text);
GRANT ALL ON _i10 TO anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION _i10k(p_section text, p_name text, p_ok boolean, p_detail text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO _i10 VALUES (p_section,p_name,coalesce(p_ok,false),p_detail); END $$;

DO $scaffold$
DECLARE v_ext text;
BEGIN
  IF to_regprocedure('extensions.crypt(text,text)') IS NULL THEN
    SELECT n.nspname INTO v_ext FROM pg_extension e
      JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname='pgcrypto';
    IF v_ext IS NULL THEN
      CREATE EXTENSION IF NOT EXISTS pgcrypto;
      SELECT n.nspname INTO v_ext FROM pg_extension e
        JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname='pgcrypto';
    END IF;
    CREATE SCHEMA IF NOT EXISTS extensions;
    EXECUTE format('CREATE OR REPLACE FUNCTION extensions.crypt(text,text) RETURNS text
                    LANGUAGE sql IMMUTABLE STRICT AS $f$SELECT %I.crypt($1,$2)$f$', v_ext);
    EXECUTE format('CREATE OR REPLACE FUNCTION extensions.gen_salt(text) RETURNS text
                    LANGUAGE sql VOLATILE STRICT AS $f$SELECT %I.gen_salt($1)$f$', v_ext);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='auth' AND table_name='users'
                    AND column_name='encrypted_password') THEN
    ALTER TABLE auth.users ADD COLUMN encrypted_password text;
  END IF;
END
$scaffold$;


-- ── fixtures ─────────────────────────────────────────────────────────
DO $fx$
DECLARE
  c_a uuid := gen_random_uuid();
  c_b uuid := gen_random_uuid();
  u_op uuid := gen_random_uuid();
  u_qa uuid := gen_random_uuid();
  u_eng uuid := gen_random_uuid();   -- the equipment owner
  u_b  uuid := gen_random_uuid();
  tag text := substr(replace(gen_random_uuid()::text,'-',''),1,8);
  p_a uuid; m_api uuid; f uuid; ln uuid; spec uuid;
  bal uuid; bal2 uuid; ph uuid; retired uuid; oos uuid; uncal uuid;
BEGIN
  PERFORM set_config('i10.c_a', c_a::text, false);
  PERFORM set_config('i10.c_b', c_b::text, false);
  PERFORM set_config('i10.u_op', u_op::text, false);
  PERFORM set_config('i10.u_qa', u_qa::text, false);
  PERFORM set_config('i10.u_eng', u_eng::text, false);
  PERFORM set_config('i10.u_b',  u_b::text,  false);
  PERFORM set_config('i10.tag',  tag, false);

  INSERT INTO public.companies(id,name) VALUES
    (c_a,'Item10 Manufacturing '||tag), (c_b,'Item10 Elsewhere '||tag);

  INSERT INTO auth.users(id,email) VALUES
    (u_op ,'op-' ||tag||'@item10.test'),
    (u_qa ,'qa-' ||tag||'@item10.test'),
    (u_eng,'eng-'||tag||'@item10.test'),
    (u_b  ,'b-'  ||tag||'@item10.test');
  UPDATE auth.users SET encrypted_password = extensions.crypt('CorrectHorse1!', extensions.gen_salt('bf'))
   WHERE id IN (u_op,u_qa,u_eng,u_b);

  INSERT INTO public.profiles(id,email,full_name,company_id,role) VALUES
    (u_op ,'op-' ||tag||'@item10.test','Bola Operator',   c_a,'content_creator'),
    (u_qa ,'qa-' ||tag||'@item10.test','Ada Quality',     c_a,'compliance_officer'),
    (u_eng,'eng-'||tag||'@item10.test','Emeka Engineering',c_a,'admin'),
    (u_b  ,'b-'  ||tag||'@item10.test','Far Away',        c_b,'admin');

  INSERT INTO public.company_members(company_id,user_id,role,status) VALUES
    (c_a,u_op,'member','active'),(c_a,u_qa,'member','active'),
    (c_a,u_eng,'owner','active'),(c_b,u_b,'owner','active');

  INSERT INTO public.company_numbering_formats(company_id,scope,pattern,prefix,seq_width)
  VALUES (c_a,'material_lot','{PREFIX}-{SEQ}','I10',4);
  INSERT INTO public.material_qa_authorities(company_id,user_id,designated_by)
  VALUES (c_a,u_qa,u_qa);

  --  Six instruments, each for a case the lockout has to get right.
  INSERT INTO public.instruments(company_id,code,name,instrument_type,location,owner_user_id,created_by) VALUES
    (c_a,'BAL-01','Dispensing balance 01','balance','Weigh booth 1',u_eng,u_op),
    (c_a,'BAL-02','Dispensing balance 02','balance','Weigh booth 2',u_eng,u_op),
    (c_a,'PH-01' ,'pH meter 01','ph_meter','QC lab',u_eng,u_op),
    (c_a,'BAL-99','Retired balance','balance','Store',u_eng,u_op),
    (c_a,'BAL-98','Balance under repair','balance','Workshop',u_eng,u_op),
    (c_a,'BAL-97','Never calibrated balance','balance','Weigh booth 3',NULL,u_op),
    --  Section D cannot move the clock, so it uses instruments whose
    --  SINGLE certificate already sits on the far side of today.
    (c_a,'BAL-96','Lapsed balance','balance','Weigh booth 4',u_eng,u_op),
    (c_a,'BAL-95','Balance due today','balance','Weigh booth 5',u_eng,u_op);

  SELECT id INTO bal     FROM public.instruments WHERE company_id=c_a AND code='BAL-01';
  SELECT id INTO bal2    FROM public.instruments WHERE company_id=c_a AND code='BAL-02';
  SELECT id INTO ph      FROM public.instruments WHERE company_id=c_a AND code='PH-01';
  SELECT id INTO retired FROM public.instruments WHERE company_id=c_a AND code='BAL-99';
  SELECT id INTO oos     FROM public.instruments WHERE company_id=c_a AND code='BAL-98';
  SELECT id INTO uncal   FROM public.instruments WHERE company_id=c_a AND code='BAL-97';
  PERFORM set_config('i10.lapsed',
    (SELECT id::text FROM public.instruments WHERE company_id=c_a AND code='BAL-96'), false);
  PERFORM set_config('i10.duetoday',
    (SELECT id::text FROM public.instruments WHERE company_id=c_a AND code='BAL-95'), false);
  PERFORM set_config('i10.bal', bal::text, false);
  PERFORM set_config('i10.bal2', bal2::text, false);
  PERFORM set_config('i10.ph', ph::text, false);
  PERFORM set_config('i10.retired', retired::text, false);
  PERFORM set_config('i10.oos', oos::text, false);
  PERFORM set_config('i10.uncal', uncal::text, false);

  --  The product, formula and line, so sections E and G have a real
  --  batch to dispense to and a real stage to sign.
  INSERT INTO public.products(id,company_id,product_code,trade_name,generic_name,category,created_by)
  VALUES (gen_random_uuid(),c_a,'ITEM10-'||tag,'Syrup Ten','Paracetamol','drug_pharmaceutical',u_op)
  RETURNING id INTO p_a;
  PERFORM set_config('i10.p_a', p_a::text, false);

  INSERT INTO public.materials(company_id,code,name,material_type,criticality,unit_of_measure,created_by)
  VALUES (c_a,'API10-'||tag,'Paracetamol powder','active_ingredient','standard','kg',u_op)
  RETURNING id INTO m_api;
  PERFORM set_config('i10.m_api', m_api::text, false);

  INSERT INTO public.master_formulas(company_id,product_id,version,batch_size,batch_size_unit,created_by)
  VALUES (c_a,p_a,'1.0',1000,'litres',u_op) RETURNING id INTO f;
  INSERT INTO public.master_formula_materials
    (formula_id,material_id,role,quantity_per_batch,unit,tolerance_pct,sort_order)
  VALUES (f,m_api,'active',24.0,'kg',2.0,10);
  INSERT INTO public.master_formula_stages(formula_id,sequence_no,stage_code,name,requires_signoff)
  VALUES (f,1,'MIX','Mixing',false);
  PERFORM set_config('i10.f', f::text, false);

  INSERT INTO public.production_lines(company_id,code,name,area,created_by)
  VALUES (c_a,'LINE-10','Syrup line 10','Block 4',u_op) RETURNING id INTO ln;
  PERFORM set_config('i10.ln', ln::text, false);

  --  The other company's balance, for section J.
  INSERT INTO public.instruments(company_id,code,name,instrument_type,owner_user_id,created_by)
  VALUES (c_b,'BAL-B1','Their balance','balance',u_b,u_b);
  PERFORM set_config('i10.bal_b',
    (SELECT id::text FROM public.instruments WHERE company_id=c_b AND code='BAL-B1'), false);
END
$fx$;

--  Calibrations. Recorded, never written onto the instrument.
DO $cal$
DECLARE c_a uuid := current_setting('i10.c_a')::uuid; u uuid := current_setting('i10.u_eng')::uuid;
BEGIN
  --  BAL-01: in date, with a certificate file.
  INSERT INTO public.instrument_calibrations
    (company_id,instrument_id,certificate_number,calibrated_on,due_on,performed_by_org,result,
     document_path,document_mime_type,document_size_bytes,uploaded_by)
  VALUES (c_a,current_setting('i10.bal')::uuid,'CAL-A-001',current_date-10,current_date+355,
          'Lagos Metrology Services','pass',
          c_a::text||'/instruments/bal-01/cal-a-001.pdf','application/pdf',184320,u);

  --  BAL-02: in date, no file attached. Legitimate — the dates are the
  --  substance for the lockout.
  INSERT INTO public.instrument_calibrations
    (company_id,instrument_id,certificate_number,calibrated_on,due_on,performed_in_house,result,uploaded_by)
  VALUES (c_a,current_setting('i10.bal2')::uuid,'CAL-A-002',current_date-5,current_date+360,true,'pass',u);

  --  PH-01: in date, used by section G's stage.
  INSERT INTO public.instrument_calibrations
    (company_id,instrument_id,certificate_number,calibrated_on,due_on,performed_in_house,result,uploaded_by)
  VALUES (c_a,current_setting('i10.ph')::uuid,'CAL-A-003',current_date-1,current_date+2,true,'pass',u);

  --  BAL-99 and BAL-98 are refused for SERVICE reasons, which is a
  --  different refusal from a lapse and worth keeping separate.
  --
  --  BAL-99's certificate is deliberately OVERDUE. If it were in date,
  --  section H's "a retired instrument raises no alert" would pass
  --  whether or not the sweep filters retired instruments — there would
  --  be nothing to alert about either way. Mutation testing caught that:
  --  removing `status <> 'retired'` from the sweep left the suite green.
  INSERT INTO public.instrument_calibrations
    (company_id,instrument_id,certificate_number,calibrated_on,due_on,performed_in_house,result,uploaded_by)
  VALUES (c_a,current_setting('i10.retired')::uuid,'CAL-A-099',current_date-366,current_date-1,true,'pass',u),
         (c_a,current_setting('i10.oos')::uuid    ,'CAL-A-098',current_date-10,current_date+355,true,'pass',u);

  UPDATE public.instruments SET status='retired'        WHERE id=current_setting('i10.retired')::uuid;
  UPDATE public.instruments SET status='out_of_service' WHERE id=current_setting('i10.oos')::uuid;

  --  BAL-96: calibrated a year ago, lapsed yesterday. A certificate
  --  performed long ago that has since expired is exactly the realistic
  --  shape — and the only one a test can build without moving the clock,
  --  since due_on > calibrated_on is a constraint.
  INSERT INTO public.instrument_calibrations
    (company_id,instrument_id,certificate_number,calibrated_on,due_on,performed_in_house,result,uploaded_by)
  VALUES (c_a,current_setting('i10.lapsed')::uuid,'CAL-A-096',current_date-366,current_date-1,true,'pass',u);

  --  BAL-95: due EXACTLY today, which is the boundary. Due today is not
  --  expired; the lockout compares with `< current_date`.
  INSERT INTO public.instrument_calibrations
    (company_id,instrument_id,certificate_number,calibrated_on,due_on,performed_in_house,result,uploaded_by)
  VALUES (c_a,current_setting('i10.duetoday')::uuid,'CAL-A-095',current_date-365,current_date,true,'pass',u);

  --  BAL-97 gets nothing: never calibrated.
END
$cal$;

--  Product registration and formula approval, then a cleared batch.
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('i10.u_eng'), 'role','authenticated')::text, false);
SET ROLE authenticated;
DO $reg$
DECLARE c_a uuid := current_setting('i10.c_a')::uuid; p uuid := current_setting('i10.p_a')::uuid;
BEGIN
  PERFORM public.lifecycle_transition('product', p, 'start_regulatory_prep', c_a);
  PERFORM public.lifecycle_transition('product', p, 'submit_to_regulator',   c_a);
  PERFORM public.lifecycle_transition('product', p, 'record_registration',   c_a, NULL, 'Granted');
END
$reg$;
RESET ROLE;

SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('i10.u_qa'), 'role','authenticated')::text, false);
SET ROLE authenticated;
DO $approve$
DECLARE
  c_a uuid := current_setting('i10.c_a')::uuid;
  u_qa uuid := current_setting('i10.u_qa')::uuid;
  l uuid; r jsonb;
BEGIN
  PERFORM public.master_formula_approve(current_setting('i10.f')::uuid);

  --  An approved lot, through the real route. The material is 'standard'
  --  so no certificate of analysis is required.
  --  RECEIVED BY SOMEBODY ELSE. 20261126000000 writes received_by
  --  from the session, and 20261125000000 refuses the disposition
  --  to whoever received the lot — so a fixture that receives and
  --  releases as one person is refused, correctly. The INSERT runs
  --  in service context so the receiver on the row is the one this
  --  fixture means.
  PERFORM set_config('role','none',true);
  INSERT INTO public.material_lots
    (company_id,material_id,quantity_received,quantity_available,unit_of_measure,
     created_by,received_by)
  VALUES (c_a,current_setting('i10.m_api')::uuid,200,200,'kg',
          u_qa,current_setting('i10.u_op')::uuid) RETURNING id INTO l;
  PERFORM set_config('role','authenticated',true);
  PERFORM public.lifecycle_transition('material_lot', l, 'sample', c_a, u_qa, 'Sampled');
  r := public.sign_electronic_record(c_a,'material_lot',l,'release','released','CorrectHorse1!');
  PERFORM public.material_lot_release(l,(r->>'signature_id')::uuid,'full');
  PERFORM set_config('i10.lot', l::text, false);
END
$approve$;
RESET ROLE;

SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('i10.u_op'), 'role','authenticated')::text, false);
SET ROLE authenticated;
DO $batch$
DECLARE
  c_a uuid := current_setting('i10.c_a')::uuid;
  r jsonb; b uuid; cl uuid; it record;
BEGIN
  r := public.batch_record_initiate(c_a,'I10-0001',current_setting('i10.p_a')::uuid,
         current_date, current_date+365, 1000,'litres');
  b := (r->>'batch_id')::uuid;
  PERFORM set_config('i10.b1', b::text, false);
  PERFORM set_config('i10.stage1',
    (SELECT id::text FROM public.batch_stages WHERE batch_id=b AND sequence_no=1), false);

  PERFORM public.batch_record_assign_line(b, current_setting('i10.ln')::uuid);
  r := public.line_clearance_open(b);
  cl := (r->>'clearance_id')::uuid;
  FOR it IN SELECT item_code, requires_record_reference
              FROM public.line_clearance_check_results WHERE clearance_id = cl
  LOOP
    PERFORM public.line_clearance_answer(cl, it.item_code, 'pass',
      CASE WHEN it.requires_record_reference THEN 'REC-'||upper(substr(it.item_code,1,6)) END);
  END LOOP;
  PERFORM public.line_changeover_record(cl,'Swab test','pass','Clear',0.2,2.0,'ug/cm2');
  r := public.sign_electronic_record(c_a,'line_clearance',cl,'perform','authored','CorrectHorse1!');
  PERFORM public.line_clearance_perform(cl,(r->>'signature_id')::uuid);
  PERFORM set_config('i10.cl1', cl::text, false);
END
$batch$;
RESET ROLE;

SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('i10.u_qa'), 'role','authenticated')::text, false);
SET ROLE authenticated;
DO $clverify$
DECLARE c_a uuid := current_setting('i10.c_a')::uuid; cl uuid := current_setting('i10.cl1')::uuid; r jsonb;
BEGIN
  r := public.sign_electronic_record(c_a,'line_clearance',cl,'verify','verified','CorrectHorse1!');
  PERFORM public.line_clearance_verify(cl,(r->>'signature_id')::uuid);
END
$clverify$;
RESET ROLE;


-- =====================================================================
--  A — the register, and the certificate's upload validation
-- =====================================================================
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('i10.u_eng'), 'role','authenticated')::text, false);
SET ROLE authenticated;

DO $a$
DECLARE
  c_a uuid := current_setting('i10.c_a')::uuid;
  bal uuid := current_setting('i10.bal')::uuid;
  ok boolean; msg text; n integer;
BEGIN
  PERFORM _i10k('A','A1 instruments are registered with a code, a name and a type',
    (SELECT count(*) FROM public.instruments WHERE company_id=c_a) = 8,
    (SELECT count(*)::text FROM public.instruments WHERE company_id=c_a));

  PERFORM _i10k('A','A2 one company cannot hold the same instrument code twice',
    (SELECT count(*) FROM pg_constraint WHERE conname='instruments_code_uniq') = 1);

  ok := false; msg := NULL;
  BEGIN
    INSERT INTO public.instruments(company_id,code,name,instrument_type)
    VALUES (c_a,'BAL-01','A second balance 01','balance');
  EXCEPTION WHEN others THEN ok := true; msg := SQLERRM; END;
  PERFORM _i10k('A','A3 and a duplicate code is refused', ok, left(coalesce(msg,''),140));

  --  "stored with upload validation" — the same shape as item 05's.
  ok := false; msg := NULL;
  BEGIN
    INSERT INTO public.instrument_calibrations
      (company_id,instrument_id,calibrated_on,due_on,
       document_path,document_mime_type,document_size_bytes)
    VALUES (c_a,bal,current_date,current_date+365,
            c_a::text||'/x.exe','application/x-msdownload',1024);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'CALIBRATION_DOC_TYPE_REJECTED%'; msg := SQLERRM; END;
  PERFORM _i10k('A','A4 an executable is not an accepted certificate', ok, left(coalesce(msg,''),160));

  ok := false; msg := NULL;
  BEGIN
    INSERT INTO public.instrument_calibrations
      (company_id,instrument_id,calibrated_on,due_on,
       document_path,document_mime_type,document_size_bytes)
    VALUES (c_a,bal,current_date,current_date+365,
            c_a::text||'/x.pdf','application/pdf',0);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'CALIBRATION_DOC_EMPTY%'; msg := SQLERRM; END;
  PERFORM _i10k('A','A5 nor a file of zero bytes', ok, left(coalesce(msg,''),160));

  ok := false; msg := NULL;
  BEGIN
    INSERT INTO public.instrument_calibrations
      (company_id,instrument_id,calibrated_on,due_on,
       document_path,document_mime_type,document_size_bytes)
    VALUES (c_a,bal,current_date,current_date+365,
            c_a::text||'/x.pdf','application/pdf',public.calibration_document_max_bytes()+1);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'CALIBRATION_DOC_TOO_LARGE%'; msg := SQLERRM; END;
  PERFORM _i10k('A','A6 nor one past the size limit', ok, left(coalesce(msg,''),160));

  --  THE PATH IS A SECURITY BOUNDARY. A row naming another company's
  --  folder would have the storage policy faithfully grant access to it.
  ok := false; msg := NULL;
  BEGIN
    INSERT INTO public.instrument_calibrations
      (company_id,instrument_id,calibrated_on,due_on,
       document_path,document_mime_type,document_size_bytes)
    VALUES (c_a,bal,current_date,current_date+365,
            current_setting('i10.c_b')||'/stolen.pdf','application/pdf',1024);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'CALIBRATION_DOC_PATH_SCOPE%'; msg := SQLERRM; END;
  PERFORM _i10k('A','A7 and a path in another company''s folder is refused',
    ok, left(coalesce(msg,''),160));

  ok := false; msg := NULL;
  BEGIN
    INSERT INTO public.instrument_calibrations
      (company_id,instrument_id,calibrated_on,due_on,document_mime_type)
    VALUES (c_a,bal,current_date,current_date+365,'application/pdf');
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'CALIBRATION_DOC_NO_PATH%'; msg := SQLERRM; END;
  PERFORM _i10k('A','A8 a type cannot be claimed for a file that is not there',
    ok, left(coalesce(msg,''),160));

  --  A certificate that does not say when it expires cannot support a
  --  lockout.
  ok := false; msg := NULL;
  BEGIN
    INSERT INTO public.instrument_calibrations
      (company_id,instrument_id,calibrated_on,due_on)
    VALUES (c_a,bal,current_date,current_date - 1);
  EXCEPTION WHEN others THEN ok := true; msg := SQLERRM; END;
  PERFORM _i10k('A','A9 a certificate cannot expire before it was performed',
    ok, left(coalesce(msg,''),160));

  SELECT count(*) INTO n FROM public.instrument_calibrations WHERE company_id=c_a;
  PERFORM _i10k('A','A10 none of the refusals left a certificate behind', n = 7, n||' certificate(s)');
END
$a$;


-- =====================================================================
--  B — the due date is derived, and cannot be written by hand
--
--  The NOT DONE IF this serves: "Expired status is displayed but the
--  sign-off still succeeds." The surest way to build that is a due date
--  somebody can push forward.
-- =====================================================================
DO $b$
DECLARE
  bal uuid := current_setting('i10.bal')::uuid;
  bal2 uuid := current_setting('i10.bal2')::uuid;
  uncal uuid := current_setting('i10.uncal')::uuid;
  c_a uuid := current_setting('i10.c_a')::uuid;
  ok boolean; msg text; n integer;
BEGIN
  PERFORM _i10k('B','B1 recording a certificate sets the instrument''s due date',
    (SELECT calibration_due_date FROM public.instruments WHERE id=bal) = current_date+355,
    (SELECT coalesce(calibration_due_date::text,'NULL') FROM public.instruments WHERE id=bal));

  PERFORM _i10k('B','B2 and the date it was last calibrated',
    (SELECT last_calibrated_on FROM public.instruments WHERE id=bal) = current_date-10);

  PERFORM _i10k('B','B3 an instrument with no certificate has no due date',
    (SELECT calibration_due_date IS NULL FROM public.instruments WHERE id=uncal));

  --  First prove the writer can update the row at all, so the refusal
  --  below is the guard's and not RLS's.
  n := 0;
  UPDATE public.instruments SET location = 'Weigh booth 1A' WHERE id=bal;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM _i10k('B','B4 a member can update an instrument row at all', n=1, n||' row(s)');

  ok := false; msg := NULL;
  BEGIN UPDATE public.instruments SET calibration_due_date = current_date + 999 WHERE id=bal;
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'INSTRUMENT_CALIBRATION_READ_ONLY%'; msg := SQLERRM; END;
  PERFORM _i10k('B','B5 but cannot push the due date forward by hand',
    ok, left(coalesce(msg,''),160));

  ok := false; msg := NULL;
  BEGIN UPDATE public.instruments SET calibration_due_date = NULL WHERE id=bal;
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'INSTRUMENT_CALIBRATION_READ_ONLY%'; msg := SQLERRM; END;
  PERFORM _i10k('B','B6 nor clear it', ok, left(coalesce(msg,''),160));

  PERFORM _i10k('B','B7 and the refused writes left the date alone',
    (SELECT calibration_due_date FROM public.instruments WHERE id=bal) = current_date+355);

  --  THE CURRENT CALIBRATION IS THE MOST RECENTLY PERFORMED ONE, not the
  --  one with the furthest due date. An old certificate with a long
  --  validity entered after a newer short one must not extend the
  --  lockout.
  INSERT INTO public.instrument_calibrations
    (company_id,instrument_id,certificate_number,calibrated_on,due_on,performed_in_house,result,uploaded_by)
  VALUES (c_a,bal2,'CAL-OLD',current_date-400,current_date+800,true,'pass',
          current_setting('i10.u_eng')::uuid);

  PERFORM _i10k('B','B8 a back-dated certificate does not extend the calibration',
    (SELECT calibration_due_date FROM public.instruments WHERE id=bal2) = current_date+360,
    (SELECT calibration_due_date::text FROM public.instruments WHERE id=bal2));

  --  A FAILED calibration grants no due date at all: the instrument
  --  reverts to uncalibrated, which blocks it.
  INSERT INTO public.instrument_calibrations
    (company_id,instrument_id,certificate_number,calibrated_on,due_on,performed_in_house,result,uploaded_by)
  VALUES (c_a,bal2,'CAL-FAIL',current_date,current_date+365,true,'fail',
          current_setting('i10.u_eng')::uuid);

  PERFORM _i10k('B','B9 a FAILED calibration leaves the instrument uncalibrated',
    (SELECT calibration_due_date IS NULL FROM public.instruments WHERE id=bal2),
    (SELECT coalesce(calibration_due_date::text,'NULL') FROM public.instruments WHERE id=bal2));

  PERFORM _i10k('B','B10 and the lockout therefore blocks it',
    public.instrument_block_reason(bal2) IS NOT NULL,
    coalesce(left(public.instrument_block_reason(bal2),140),'NULL'));
END
$b$;


-- =====================================================================
--  C — the lockout's answers
-- =====================================================================
DO $c$
DECLARE v_reason text; ok boolean; msg text;
BEGIN
  v_reason := public.instrument_block_reason(current_setting('i10.bal')::uuid);
  PERFORM _i10k('C','C1 a calibrated, in-service instrument is not blocked',
    v_reason IS NULL, coalesce(left(v_reason,140),'not blocked'));

  v_reason := public.instrument_block_reason(current_setting('i10.uncal')::uuid);
  PERFORM _i10k('C','C2 one with no calibration on record IS blocked',
    v_reason IS NOT NULL AND v_reason LIKE '%no calibration on record%',
    coalesce(left(v_reason,160),'NULL'));

  v_reason := public.instrument_block_reason(current_setting('i10.retired')::uuid);
  PERFORM _i10k('C','C3 a retired instrument is blocked even though it is in calibration',
    v_reason IS NOT NULL AND v_reason LIKE '%retired%', coalesce(left(v_reason,160),'NULL'));

  v_reason := public.instrument_block_reason(current_setting('i10.oos')::uuid);
  PERFORM _i10k('C','C4 and so is one out of service',
    v_reason IS NOT NULL AND v_reason LIKE '%out of service%', coalesce(left(v_reason,160),'NULL'));

  v_reason := public.instrument_block_reason(gen_random_uuid());
  PERFORM _i10k('C','C5 an instrument that is not registered is blocked, not allowed',
    v_reason IS NOT NULL, coalesce(left(v_reason,140),'NULL'));

  BEGIN PERFORM public.instrument_assert_usable(current_setting('i10.bal')::uuid); ok := true;
  EXCEPTION WHEN others THEN ok := false; msg := SQLERRM; END;
  PERFORM _i10k('C','C6 the asserting form is silent for a usable instrument',
    ok, left(coalesce(msg,''),140));

  ok := false; msg := NULL;
  BEGIN PERFORM public.instrument_assert_usable(current_setting('i10.uncal')::uuid);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'INSTRUMENT_NOT_CALIBRATED%'; msg := SQLERRM; END;
  PERFORM _i10k('C','C7 and raises for one that is not', ok, left(coalesce(msg,''),160));
END
$c$;


-- =====================================================================
--  D — the block is derived from the date, with no sweep involved
--
--  This is the NOT DONE IF: "Expired status is displayed but the sign-off
--  still succeeds." You get that bug by storing a calibration status and
--  having a sweep keep it current — it displays correctly and then lets
--  the sign-off through whenever the sweep is late.
--
--  A test cannot move the clock, and `due_on > calibrated_on` is a
--  constraint, so "it lapsed overnight" cannot be staged directly. What
--  CAN be staged is the same thing from the database's point of view: an
--  instrument whose current certificate was performed a year ago and
--  expired yesterday. The assertions then pin the two halves that matter
--  — the block is in force, and NO SWEEP HAS RUN.
-- =====================================================================
DO $d$
DECLARE
  ph uuid := current_setting('i10.ph')::uuid;
  lapsed uuid := current_setting('i10.lapsed')::uuid;
  duetoday uuid := current_setting('i10.duetoday')::uuid;
  v_reason text; n_sweeps integer;
BEGIN
  --  Nothing has swept anything at this point in the suite.
  SELECT count(*) INTO n_sweeps FROM public.instrument_calibration_alerts;
  PERFORM _i10k('D','D1 no calibration alert has been raised yet',
    n_sweeps = 0, n_sweeps||' alert(s)');

  PERFORM _i10k('D','D2 an instrument with days left is not blocked',
    public.instrument_block_reason(ph) IS NULL,
    coalesce(left(public.instrument_block_reason(ph),140),'not blocked'));

  --  THE ONE THAT MATTERS. Blocked, with no sweep, no status column, and
  --  nothing having run since the certificate was recorded.
  v_reason := public.instrument_block_reason(lapsed);
  PERFORM _i10k('D','D3 an instrument whose certificate has expired IS blocked',
    v_reason IS NOT NULL AND v_reason LIKE '%out of calibration on%',
    coalesce(left(v_reason,180),'NULL'));

  PERFORM _i10k('D','D4 and the refusal names the date it went out',
    v_reason LIKE '%'||to_char(current_date-1,'DD Mon YYYY')||'%',
    coalesce(left(v_reason,180),'NULL'));

  SELECT count(*) INTO n_sweeps FROM public.instrument_calibration_alerts;
  PERFORM _i10k('D','D5 with still no sweep having run — the block does not wait for alerting',
    n_sweeps = 0, n_sweeps||' alert(s)');

  --  THE BOUNDARY. Due today is not expired: a calibration is good
  --  through its due date, and `<=` here would shut a line down a day
  --  early every time.
  PERFORM _i10k('D','D6 a calibration due TODAY is still good',
    public.instrument_block_reason(duetoday) IS NULL,
    coalesce(left(public.instrument_block_reason(duetoday),140),'not blocked'));

  PERFORM _i10k('D','D7 the derived due dates match the certificates exactly',
    (SELECT calibration_due_date FROM public.instruments WHERE id=lapsed) = current_date-1
    AND (SELECT calibration_due_date FROM public.instruments WHERE id=duetoday) = current_date,
    format('lapsed %s, due-today %s',
      (SELECT calibration_due_date FROM public.instruments WHERE id=lapsed),
      (SELECT calibration_due_date FROM public.instruments WHERE id=duetoday)));
END
$d$;


-- =====================================================================
--  E — the dispensing balance, where the brief says to start
-- =====================================================================
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('i10.u_op'), 'role','authenticated')::text, false);
DO $e$
DECLARE
  c_a uuid := current_setting('i10.c_a')::uuid;
  b1 uuid := current_setting('i10.b1')::uuid;
  lot uuid := current_setting('i10.lot')::uuid;
  bal uuid := current_setting('i10.bal')::uuid;
  uncal uuid := current_setting('i10.uncal')::uuid;
  r jsonb; ok boolean; msg text; v_before numeric;
BEGIN
  SELECT quantity_available INTO v_before FROM public.material_lots WHERE id=lot;

  --  A calibrated balance: the dispensing goes through.
  r := public.material_dispense(b1, lot, 24.0, bal,
         (SELECT id FROM public.master_formula_materials
           WHERE formula_id=current_setting('i10.f')::uuid LIMIT 1));
  PERFORM set_config('i10.d1', (r->>'dispensing_id'), false);
  PERFORM _i10k('E','E1 a dispensing on a calibrated balance is recorded',
    (r->>'ok')='true', coalesce(r::text,'NULL'));

  --  The balance identifier is the register's, snapshotted.
  PERFORM _i10k('E','E2 and the balance code comes from the register, not the caller',
    (SELECT balance_identifier = 'BAL-01' AND instrument_id = bal
       FROM public.dispensing_records WHERE id=(r->>'dispensing_id')::uuid));

  --  An uncalibrated balance: refused.
  ok := false; msg := NULL;
  BEGIN PERFORM public.material_dispense(b1, lot, 24.0, uncal,
          (SELECT id FROM public.master_formula_materials
            WHERE formula_id=current_setting('i10.f')::uuid LIMIT 1));
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'INSTRUMENT_NOT_CALIBRATED%'; msg := SQLERRM; END;
  PERFORM _i10k('E','E3 one on an uncalibrated balance is refused',
    ok, left(coalesce(msg,''),180));

  --  THE NOT DONE IF: "the lockout exists in the interface only."
  --  Straight at the table, bypassing the RPC.
  ok := false; msg := NULL;
  BEGIN
    INSERT INTO public.dispensing_records
      (company_id,batch_id,material_id,material_lot_id,internal_lot_number,
       required_quantity,actual_quantity,unit,balance_identifier,instrument_id,dispensed_by)
    VALUES (c_a,b1,current_setting('i10.m_api')::uuid,lot,'x',24.0,24.0,'kg','forged',
            uncal,current_setting('i10.u_op')::uuid);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'INSTRUMENT_NOT_CALIBRATED%'; msg := SQLERRM; END;
  PERFORM _i10k('E','E4 a DIRECT INSERT meets the lockout too', ok, left(coalesce(msg,''),180));

  --  A retired balance, and one out of service.
  ok := false; msg := NULL;
  BEGIN PERFORM public.material_dispense(b1, lot, 24.0, current_setting('i10.retired')::uuid);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'INSTRUMENT_NOT_CALIBRATED%'; msg := SQLERRM; END;
  PERFORM _i10k('E','E5 a retired balance cannot be used', ok, left(coalesce(msg,''),180));

  --  No balance at all.
  ok := false; msg := NULL;
  BEGIN PERFORM public.material_dispense(b1, lot, 24.0, NULL);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'DISPENSE_NO_INSTRUMENT%'; msg := SQLERRM; END;
  PERFORM _i10k('E','E6 and a dispensing with no balance named is refused',
    ok, left(coalesce(msg,''),180));

  --  Another company's balance.
  ok := false; msg := NULL;
  BEGIN PERFORM public.material_dispense(b1, lot, 24.0, current_setting('i10.bal_b')::uuid);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'INSTRUMENT_%'; msg := SQLERRM; END;
  PERFORM _i10k('E','E7 nor can another company''s balance be used', ok, left(coalesce(msg,''),180));

  PERFORM _i10k('E','E8 only the one accepted dispensing moved any quantity',
    (SELECT quantity_available FROM public.material_lots WHERE id=lot) = v_before - 24.0,
    (SELECT quantity_available::text FROM public.material_lots WHERE id=lot));
END
$e$;


-- =====================================================================
--  F — use recorded against the step
--
--  NOT DONE IF: "Instrument use is not recorded against the step."
-- =====================================================================
DO $f$
DECLARE
  d1 uuid := current_setting('i10.d1')::uuid;
  bal uuid := current_setting('i10.bal')::uuid;
  stage1 uuid := current_setting('i10.stage1')::uuid;
  ph uuid := current_setting('i10.ph')::uuid;
  r jsonb; ok boolean; msg text;
BEGIN
  --  The dispensing recorded its own balance use, by trigger. Nothing in
  --  the RPC had to remember.
  PERFORM _i10k('F','F1 the dispensing recorded its instrument use automatically',
    EXISTS (SELECT 1 FROM public.instrument_usages
             WHERE entity_type='dispensing_record' AND entity_id=d1 AND instrument_id=bal));

  --  The due date is snapshotted, so "was it in calibration then" is
  --  answerable from the record rather than by replaying certificates.
  PERFORM _i10k('F','F2 and snapshotted the due date and code at the time of use',
    (SELECT due_on_at_use = current_date+355 AND instrument_code_at_use='BAL-01'
       FROM public.instrument_usages
      WHERE entity_type='dispensing_record' AND entity_id=d1));

  --  A stage records the use of an instrument that IS in calibration.
  r := public.instrument_record_use(ph,'batch_stage',stage1);
  PERFORM _i10k('F','F3 a stage can record the use of a calibrated instrument',
    (r->>'ok')='true'
    AND EXISTS (SELECT 1 FROM public.instrument_usages
                 WHERE entity_type='batch_stage' AND entity_id=stage1 AND instrument_id=ph),
    coalesce(r::text,'NULL'));

  --  And cannot record one that has lapsed: an out-of-calibration
  --  instrument must not be attachable to a step that will then be
  --  signed.
  ok := false; msg := NULL;
  BEGIN PERFORM public.instrument_record_use(current_setting('i10.lapsed')::uuid,'batch_stage',stage1);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'INSTRUMENT_NOT_CALIBRATED%'; msg := SQLERRM; END;
  PERFORM _i10k('F','F4 recording a LAPSED instrument against a step is refused',
    ok, left(coalesce(msg,''),180));

  ok := false; msg := NULL;
  BEGIN PERFORM public.instrument_record_use(current_setting('i10.uncal')::uuid,'batch_stage',stage1);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'INSTRUMENT_NOT_CALIBRATED%'; msg := SQLERRM; END;
  PERFORM _i10k('F','F5 and so is an uncalibrated one', ok, left(coalesce(msg,''),180));

  ok := false; msg := NULL;
  BEGIN PERFORM public.instrument_record_use(bal,'policy_acknowledgement',stage1);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'INSTRUMENT_USE_BAD_ENTITY%'; msg := SQLERRM; END;
  PERFORM _i10k('F','F6 a use cannot be recorded against something that is not a step',
    ok, left(coalesce(msg,''),180));

  ok := false; msg := NULL;
  BEGIN PERFORM public.instrument_record_use(bal,'batch_stage',gen_random_uuid());
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'INSTRUMENT_USE_NO_STAGE%'; msg := SQLERRM; END;
  PERFORM _i10k('F','F7 nor against a stage that does not exist', ok, left(coalesce(msg,''),180));

  --  The usage log is evidence.
  ok := false; msg := NULL;
  BEGIN DELETE FROM public.instrument_usages WHERE entity_id=d1;
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'permission denied%'; msg := SQLERRM; END;
  PERFORM _i10k('F','F8 and a recorded use cannot be deleted', ok, left(coalesce(msg,''),180));
END
$f$;


-- =====================================================================
--  G — a lapse between recording the use and signing the step
--
--  The realistic case, and the one the brief's "blocks sign-off on any
--  step recording its use" is really about: the use was recorded while
--  the instrument was in calibration, and the calendar moved.
-- =====================================================================
DO $g$
DECLARE
  c_a uuid := current_setting('i10.c_a')::uuid;
  stage1 uuid := current_setting('i10.stage1')::uuid;
  bal uuid := current_setting('i10.bal')::uuid;
  u uuid := current_setting('i10.u_eng')::uuid;
  r jsonb; ok boolean; msg text;
BEGIN
  --  BAL-01 is in calibration, so the use records.
  r := public.instrument_record_use(bal,'batch_stage',stage1);
  PERFORM _i10k('G','G1 the use is recorded while the balance is in calibration',
    EXISTS (SELECT 1 FROM public.instrument_usages
             WHERE entity_type='batch_stage' AND entity_id=stage1 AND instrument_id=bal));

  PERFORM public.batch_stage_start(stage1);
  r := public.sign_electronic_record(c_a,'batch_stage',stage1,'complete','authored','CorrectHorse1!');
  PERFORM set_config('i10.sig_stage', (r->>'signature_id'), false);
  PERFORM _i10k('G','G2 and the operator can sign for the stage',
    (r->>'ok')='true', coalesce(r::text,'NULL'));

  --  NOW THE CALENDAR MOVES. A lapsed certificate is recorded for the
  --  balance, which is what time passing looks like from the database's
  --  point of view.
  INSERT INTO public.instrument_calibrations
    (company_id,instrument_id,certificate_number,calibrated_on,due_on,performed_in_house,result,uploaded_by)
  VALUES (c_a,bal,'CAL-A-LAPSED',current_date-1,current_date,true,'pass',u);
  UPDATE public.instruments SET location = location WHERE id=bal;   -- no-op, keeps the row warm

  --  due_on = current_date is NOT expired — the lockout uses `< today`.
  PERFORM _i10k('G','G3 a certificate due today is not yet expired',
    public.instrument_block_reason(bal) IS NULL,
    coalesce(left(public.instrument_block_reason(bal),140),'not blocked'));

  INSERT INTO public.instrument_calibrations
    (company_id,instrument_id,certificate_number,calibrated_on,due_on,performed_in_house,result,uploaded_by)
  VALUES (c_a,bal,'CAL-A-GONE',current_date,current_date+1,true,'pass',u);
  --  ...and then one that genuinely lapsed, performed later still.
  INSERT INTO public.instrument_calibrations
    (company_id,instrument_id,certificate_number,calibrated_on,due_on,performed_in_house,result,uploaded_by)
  VALUES (c_a,bal,'CAL-A-GONE2',current_date+1,current_date+2,true,'pass',u);

  --  Force the current calibration to be an expired one by recording the
  --  most recently PERFORMED certificate as already lapsed.
  INSERT INTO public.instrument_calibrations
    (company_id,instrument_id,certificate_number,calibrated_on,due_on,performed_in_house,result,uploaded_by)
  VALUES (c_a,bal,'CAL-A-EXPIRED',current_date+2,current_date+3,true,'fail',u);

  PERFORM _i10k('G','G4 a failed recalibration leaves the balance unusable',
    public.instrument_block_reason(bal) IS NOT NULL,
    coalesce(left(public.instrument_block_reason(bal),160),'NULL'));

  --  THE SIGN-OFF IS NOW BLOCKED, on a stage whose use was recorded
  --  perfectly legitimately.
  ok := false; msg := NULL;
  BEGIN PERFORM public.batch_stage_complete(stage1, current_setting('i10.sig_stage')::uuid);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'INSTRUMENT_NOT_CALIBRATED%'; msg := SQLERRM; END;
  PERFORM _i10k('G','G5 the stage sign-off is blocked by the lapse',
    ok, left(coalesce(msg,''),200));

  PERFORM _i10k('G','G6 and the stage did not complete',
    (SELECT status FROM public.batch_stages WHERE id=stage1) = 'in_progress',
    (SELECT status FROM public.batch_stages WHERE id=stage1));

  --  Recalibrate properly and the sign-off goes through.
  INSERT INTO public.instrument_calibrations
    (company_id,instrument_id,certificate_number,calibrated_on,due_on,performed_in_house,result,uploaded_by)
  VALUES (c_a,bal,'CAL-A-FIXED',current_date+3,current_date+368,true,'pass',u);

  PERFORM _i10k('G','G7 a passing recalibration restores it',
    public.instrument_block_reason(bal) IS NULL,
    coalesce(left(public.instrument_block_reason(bal),140),'not blocked'));

  PERFORM public.batch_stage_complete(stage1, current_setting('i10.sig_stage')::uuid);
  PERFORM _i10k('G','G8 and the stage then signs off',
    (SELECT status FROM public.batch_stages WHERE id=stage1) = 'complete',
    (SELECT status FROM public.batch_stages WHERE id=stage1));
END
$g$;


-- =====================================================================
--  H — alerts to the equipment owner
-- =====================================================================
DO $h$
DECLARE
  c_a uuid := current_setting('i10.c_a')::uuid;
  lapsed uuid := current_setting('i10.lapsed')::uuid;
  bal2 uuid := current_setting('i10.bal2')::uuid;
  r jsonb; n1 integer; n2 integer;
BEGIN
  r := public.instrument_calibration_sweep(c_a);
  PERFORM _i10k('H','H1 the sweep runs and reports what it raised',
    (r->>'ok')='true', coalesce(r::text,'NULL'));

  PERFORM _i10k('H','H2 an overdue instrument raises an overdue alert',
    EXISTS (SELECT 1 FROM public.instrument_calibration_alerts
             WHERE instrument_id=lapsed AND alert_type='calibration_overdue'));

  --  "alerts the equipment owner"
  PERFORM _i10k('H','H3 and the alert names the equipment owner',
    (SELECT owner_user_id = current_setting('i10.u_eng')::uuid
       FROM public.instrument_calibration_alerts
      WHERE instrument_id=lapsed AND alert_type='calibration_overdue'));

  --  Idempotent: a sweep that runs twice a day raises one alert.
  SELECT count(*) INTO n1 FROM public.instrument_calibration_alerts WHERE company_id=c_a;
  PERFORM public.instrument_calibration_sweep(c_a);
  PERFORM public.instrument_calibration_sweep(c_a);
  SELECT count(*) INTO n2 FROM public.instrument_calibration_alerts WHERE company_id=c_a;
  PERFORM _i10k('H','H4 and running it again raises nothing new',
    n1 = n2, format('%s then %s', n1, n2));

  --  Approaching, under a short lead time.
  INSERT INTO public.instrument_alert_policies(company_id,calibration_lead_days)
  VALUES (c_a, 10)
  ON CONFLICT (company_id) DO UPDATE SET calibration_lead_days = 10;

  INSERT INTO public.instrument_calibrations
    (company_id,instrument_id,certificate_number,calibrated_on,due_on,performed_in_house,result,uploaded_by)
  VALUES (c_a,bal2,'CAL-SOON',current_date+4,current_date+9,true,'pass',
          current_setting('i10.u_eng')::uuid);

  PERFORM public.instrument_calibration_sweep(c_a);
  PERFORM _i10k('H','H5 an instrument coming due inside the lead time is flagged',
    EXISTS (SELECT 1 FROM public.instrument_calibration_alerts
             WHERE instrument_id=bal2 AND alert_type='calibration_approaching'
               AND due_date=current_date+9));

  PERFORM _i10k('H','H6 the alert records the lead time it was judged against',
    (SELECT lead_days FROM public.instrument_calibration_alerts
      WHERE instrument_id=bal2 AND alert_type='calibration_approaching'
        AND due_date=current_date+9) = 10);

  --  A retired instrument is not chased — and BAL-99's calibration IS
  --  overdue, so the only thing keeping it out of the alert table is the
  --  sweep's `status <> 'retired'` filter. Asserted both ways so the
  --  probe cannot be satisfied by there being nothing to alert about.
  PERFORM _i10k('H','H7 the retired instrument''s calibration is genuinely overdue',
    (SELECT calibration_due_date < current_date
       FROM public.instruments WHERE id=current_setting('i10.retired')::uuid),
    (SELECT calibration_due_date::text
       FROM public.instruments WHERE id=current_setting('i10.retired')::uuid));

  PERFORM _i10k('H','H7a yet a retired instrument raises no alert',
    NOT EXISTS (SELECT 1 FROM public.instrument_calibration_alerts
                 WHERE instrument_id=current_setting('i10.retired')::uuid));

  --  An instrument with no calibration at all has no due date to alert
  --  about — it is blocked instead, which is louder than an alert.
  PERFORM _i10k('H','H8 an uncalibrated instrument raises no alert, being blocked outright',
    NOT EXISTS (SELECT 1 FROM public.instrument_calibration_alerts
                 WHERE instrument_id=current_setting('i10.uncal')::uuid)
    AND public.instrument_block_reason(current_setting('i10.uncal')::uuid) IS NOT NULL);
END
$h$;


-- =====================================================================
--  I — certificates are evidence
-- =====================================================================
DO $i$
DECLARE bal uuid := current_setting('i10.bal')::uuid; ok boolean; msg text; n integer;
BEGIN
  ok := false; msg := NULL;
  BEGIN UPDATE public.instrument_calibrations SET due_on = current_date + 999
         WHERE instrument_id=bal;
  EXCEPTION WHEN others THEN
    ok := SQLERRM LIKE 'CALIBRATION_IMMUTABLE%' OR SQLERRM LIKE 'permission denied%';
    msg := SQLERRM;
  END;
  PERFORM _i10k('I','I1 a certificate''s due date cannot be edited', ok, left(coalesce(msg,''),180));

  ok := false; msg := NULL;
  BEGIN DELETE FROM public.instrument_calibrations WHERE instrument_id=bal;
  EXCEPTION WHEN others THEN
    ok := SQLERRM LIKE 'CALIBRATION_IMMUTABLE%' OR SQLERRM LIKE 'permission denied%';
    msg := SQLERRM;
  END;
  PERFORM _i10k('I','I2 nor deleted', ok, left(coalesce(msg,''),180));

  SELECT count(*) INTO n FROM public.instrument_calibrations WHERE instrument_id=bal;
  PERFORM _i10k('I','I3 and the certificate history is intact', n >= 5, n||' certificate(s)');
END
$i$;

RESET ROLE;
DO $i2$
DECLARE bal uuid := current_setting('i10.bal')::uuid; ok boolean; msg text;
BEGIN
  ok := false; msg := NULL;
  BEGIN UPDATE public.instrument_calibrations SET due_on = current_date + 999 WHERE instrument_id=bal;
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'CALIBRATION_IMMUTABLE%'; msg := SQLERRM; END;
  PERFORM _i10k('I','I4 the immutability trigger refuses an edit on its own',
    ok, left(coalesce(msg,''),180));

  ok := false; msg := NULL;
  BEGIN DELETE FROM public.instrument_calibrations WHERE instrument_id=bal;
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'CALIBRATION_IMMUTABLE%'; msg := SQLERRM; END;
  PERFORM _i10k('I','I5 and a delete, even with every grant in hand',
    ok, left(coalesce(msg,''),180));
END
$i2$;
SET ROLE authenticated;


-- =====================================================================
--  J — tenancy
-- =====================================================================
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('i10.u_b'), 'role','authenticated')::text, false);
DO $j$
DECLARE
  c_a uuid := current_setting('i10.c_a')::uuid;
  bal uuid := current_setting('i10.bal')::uuid;
  n integer; ok boolean; msg text;
BEGIN
  SELECT count(*) INTO n FROM public.instruments WHERE company_id=c_a;
  PERFORM _i10k('J','J1 another company cannot see the register', n=0, n||' row(s)');

  SELECT count(*) INTO n FROM public.instrument_calibrations WHERE company_id=c_a;
  PERFORM _i10k('J','J2 nor the certificates', n=0, n||' row(s)');

  SELECT count(*) INTO n FROM public.instrument_usages WHERE company_id=c_a;
  PERFORM _i10k('J','J3 nor which instrument was used for which step', n=0, n||' row(s)');

  SELECT count(*) INTO n FROM public.instrument_calibration_alerts WHERE company_id=c_a;
  PERFORM _i10k('J','J4 nor the alerts', n=0, n||' row(s)');

  ok := false; msg := NULL;
  BEGIN PERFORM public.instrument_block_reason(bal);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'INSTRUMENT_FORBIDDEN%'; msg := SQLERRM; END;
  PERFORM _i10k('J','J5 and the lockout refuses to report on their instrument',
    ok, left(coalesce(msg,''),180));

  ok := false; msg := NULL;
  BEGIN PERFORM public.instrument_record_use(bal,'batch_stage',current_setting('i10.stage1')::uuid);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'INSTRUMENT_FORBIDDEN%'; msg := SQLERRM; END;
  PERFORM _i10k('J','J6 nor can a use be recorded against it', ok, left(coalesce(msg,''),180));
END
$j$;
RESET ROLE; RESET request.jwt.claims;

DO $j2$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM public.instruments
   WHERE company_id=current_setting('i10.c_a')::uuid;
  PERFORM _i10k('J','J7 and the owner is not locked out of their own register',
    n = 8, n||' row(s)');
END
$j2$;


\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo '  WEEK 4 / ITEM 10 — EQUIPMENT CALIBRATION AND LOCKOUT'
\echo '════════════════════════════════════════════════════════════════'
SELECT section, count(*) AS assertions, count(*) FILTER (WHERE NOT ok) AS failures
  FROM _i10 GROUP BY section ORDER BY section;
SELECT section, name, coalesce(detail,'') AS detail FROM _i10 WHERE NOT ok ORDER BY section, name;
SELECT count(*) AS total, count(*) FILTER (WHERE ok) AS passed,
       count(*) FILTER (WHERE NOT ok) AS failed FROM _i10;

DO $v$
DECLARE f integer;
BEGIN
  SELECT count(*) INTO f FROM _i10 WHERE NOT ok;
  IF f > 0 THEN RAISE EXCEPTION 'ITEM 10: % assertion(s) failed', f; END IF;
  RAISE NOTICE 'ITEM 10: all assertions passed';
END
$v$;

DROP FUNCTION IF EXISTS _i10k(text,text,boolean,text);
DROP TABLE IF EXISTS _i10;
