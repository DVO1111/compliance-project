-- =====================================================================
--  WEEK 4 / ITEM 08 — LINE CLEARANCE AND CHANGEOVER VERIFICATION
--
--  The brief's three NOT DONE IF clauses are the spine:
--
--    "One user can both perform and verify."
--    "Clearance is recorded but dispensing never checks it."
--    "A failed verification can be overridden without a recorded
--     decision."
--
--  The middle one cannot be fully closed this week and this suite does
--  not pretend otherwise. Dispensing is item 09 and does not exist, so
--  what is asserted here is that the GATE gives the right answers —
--  including the uncomfortable ones, like blocking a batch with no line.
--  The assertion that dispensing calls it belongs to item 09's suite.
--
--  Sections:
--    A. The line, and its configurable checklist
--    B. Opening a clearance snapshots the checklist
--    C. The answers, and what an answer has to carry
--    D. The performer's signature, and what it is refused for
--    E. Two signatures from two different people
--    F. The gate
--    G. A failed changeover blocks the line
--    H. An override is a recorded decision
--    I. Restart, the other way out of failed
--    J. Tenancy
--
--  Fixtures are random per run, for the reason item 07's suite gives:
--  changeover verifications and override decisions refuse DELETE by
--  design, and their foreign keys are ON DELETE RESTRICT, so a run's rows
--  cannot be cleaned up. Inventing a company per run is cheaper than
--  weakening a control so the test can tidy after itself.
-- =====================================================================
\set ON_ERROR_STOP on
SET client_min_messages = warning;

CREATE TEMP TABLE _lc(section text, name text, ok boolean, detail text);
GRANT ALL ON _lc TO anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION _lck(p_section text, p_name text, p_ok boolean, p_detail text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO _lc VALUES (p_section,p_name,coalesce(p_ok,false),p_detail); END $$;

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
  u_op uuid := gen_random_uuid();   -- the operator who performs clearances
  u_qa uuid := gen_random_uuid();   -- the second person who verifies
  u_ad uuid := gen_random_uuid();   -- owner of company A
  u_b  uuid := gen_random_uuid();   -- the other company
  tag text := substr(replace(gen_random_uuid()::text,'-',''),1,8);
  p_a uuid; m_api uuid; f uuid; ln1 uuid; ln2 uuid;
BEGIN
  PERFORM set_config('lc.c_a', c_a::text, false);
  PERFORM set_config('lc.c_b', c_b::text, false);
  PERFORM set_config('lc.u_op', u_op::text, false);
  PERFORM set_config('lc.u_qa', u_qa::text, false);
  PERFORM set_config('lc.u_ad', u_ad::text, false);
  PERFORM set_config('lc.u_b',  u_b::text,  false);

  INSERT INTO public.companies(id,name) VALUES
    (c_a,'Item08 Manufacturing '||tag), (c_b,'Item08 Elsewhere '||tag);

  INSERT INTO auth.users(id,email) VALUES
    (u_op,'op-'||tag||'@item08.test'),
    (u_qa,'qa-'||tag||'@item08.test'),
    (u_ad,'ad-'||tag||'@item08.test'),
    (u_b ,'b-' ||tag||'@item08.test');
  UPDATE auth.users SET encrypted_password = extensions.crypt('CorrectHorse1!', extensions.gen_salt('bf'))
   WHERE id IN (u_op,u_qa,u_ad,u_b);

  INSERT INTO public.profiles(id,email,full_name,company_id,role) VALUES
    (u_op,'op-'||tag||'@item08.test','Ifeoma Operator',  c_a,'content_creator'),
    (u_qa,'qa-'||tag||'@item08.test','Segun Quality',    c_a,'compliance_officer'),
    (u_ad,'ad-'||tag||'@item08.test','Amara Owner',      c_a,'admin'),
    (u_b ,'b-' ||tag||'@item08.test','Far Away',         c_b,'admin');

  INSERT INTO public.company_members(company_id,user_id,role,status) VALUES
    (c_a,u_op,'member','active'),(c_a,u_qa,'member','active'),
    (c_a,u_ad,'owner','active'),(c_b,u_b,'owner','active');

  INSERT INTO public.products(id,company_id,product_code,trade_name,generic_name,category,created_by)
  VALUES (gen_random_uuid(),c_a,'ITEM08-'||tag,'Syrup Eight','Paracetamol','drug_pharmaceutical',u_op)
  RETURNING id INTO p_a;
  PERFORM set_config('lc.p_a', p_a::text, false);

  INSERT INTO public.materials(company_id,code,name,material_type,criticality,unit_of_measure,created_by)
  VALUES (c_a,'API8-'||tag,'Paracetamol powder','active_ingredient','critical','kg',u_op)
  RETURNING id INTO m_api;

  INSERT INTO public.master_formulas(company_id,product_id,version,batch_size,batch_size_unit,created_by)
  VALUES (c_a,p_a,'1.0',1000,'litres',u_op) RETURNING id INTO f;
  INSERT INTO public.master_formula_materials(formula_id,material_id,role,quantity_per_batch,unit)
  VALUES (f,m_api,'active',24.0,'kg');
  INSERT INTO public.master_formula_stages(formula_id,sequence_no,stage_code,name)
  VALUES (f,1,'MIX','Mixing');
  PERFORM set_config('lc.f', f::text, false);
END
$fx$;

--  Registration and formula approval, as a member.
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('lc.u_ad'), 'role','authenticated')::text, false);
SET ROLE authenticated;
DO $setup$
DECLARE c_a uuid := current_setting('lc.c_a')::uuid; p uuid := current_setting('lc.p_a')::uuid;
BEGIN
  PERFORM public.lifecycle_transition('product', p, 'start_regulatory_prep', c_a);
  PERFORM public.lifecycle_transition('product', p, 'submit_to_regulator',   c_a);
  PERFORM public.lifecycle_transition('product', p, 'record_registration',   c_a, NULL, 'NAFDAC listing granted');
  PERFORM public.master_formula_approve(current_setting('lc.f')::uuid);
END
$setup$;
RESET ROLE;


-- =====================================================================
--  A — the line, and its configurable checklist
-- =====================================================================
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('lc.u_op'), 'role','authenticated')::text, false);
SET ROLE authenticated;

DO $a$
DECLARE
  c_a uuid := current_setting('lc.c_a')::uuid;
  ln1 uuid; ln2 uuid; n integer; ok boolean; msg text;
BEGIN
  INSERT INTO public.production_lines(company_id,code,name,area,created_by)
  VALUES (c_a,'LINE-A','Liquids line A','Block 2, Bay 1',current_setting('lc.u_op')::uuid)
  RETURNING id INTO ln1;
  INSERT INTO public.production_lines(company_id,code,name,area,created_by)
  VALUES (c_a,'LINE-B','Liquids line B','Block 2, Bay 2',current_setting('lc.u_op')::uuid)
  RETURNING id INTO ln2;
  PERFORM set_config('lc.ln1', ln1::text, false);
  PERFORM set_config('lc.ln2', ln2::text, false);

  PERFORM _lck('A','A1 a production line can be created', ln1 IS NOT NULL);

  SELECT count(*) INTO n FROM public.line_clearance_checklist_items WHERE line_id = ln1;
  PERFORM _lck('A','A2 it arrives with the brief''s seven default items', n = 7, n||' item(s)');

  --  The default list is the brief's list, in the brief's order. Asserted
  --  by code so a reordering or a quiet deletion is caught.
  PERFORM _lck('A','A3 the default items are the ones the brief names, in order',
    (SELECT array_agg(item_code ORDER BY sort_order)
       FROM public.line_clearance_checklist_items WHERE line_id = ln1)
    = ARRAY['previous_product_removed','materials_removed',
            'labels_and_printed_material_removed','equipment_cleaned',
            'area_cleaned','calibration_current','previous_documents_removed'],
    (SELECT array_agg(item_code ORDER BY sort_order)::text
       FROM public.line_clearance_checklist_items WHERE line_id = ln1));

  --  "equipment and area cleaned WITH RECORDS PRESENT" — the record is
  --  the requirement, not the tick, so those items demand a reference.
  PERFORM _lck('A','A4 the items whose evidence is a record demand a reference',
    (SELECT array_agg(item_code ORDER BY sort_order)
       FROM public.line_clearance_checklist_items
      WHERE line_id = ln1 AND requires_record_reference)
    = ARRAY['labels_and_printed_material_removed','equipment_cleaned','area_cleaned'],
    (SELECT array_agg(item_code ORDER BY sort_order)::text
       FROM public.line_clearance_checklist_items
      WHERE line_id = ln1 AND requires_record_reference));

  --  Both lines get their own copy, which is what makes it per-line
  --  rather than per-company.
  PERFORM _lck('A','A5 each line gets its own checklist, not a shared one',
    (SELECT count(DISTINCT line_id) FROM public.line_clearance_checklist_items
      WHERE line_id IN (ln1,ln2)) = 2
    AND (SELECT count(*) FROM public.line_clearance_checklist_items WHERE line_id = ln2) = 7);

  --  "configurable per line": add one to LINE-A only.
  INSERT INTO public.line_clearance_checklist_items
    (company_id,line_id,item_code,label,requires_record_reference,is_required,sort_order)
  VALUES (c_a,ln1,'filling_nozzles_changed','Filling nozzles changed and recorded',true,true,80);

  PERFORM _lck('A','A6 a line-specific item can be added to one line only',
    (SELECT count(*) FROM public.line_clearance_checklist_items WHERE line_id=ln1) = 8
    AND (SELECT count(*) FROM public.line_clearance_checklist_items WHERE line_id=ln2) = 7);

  --  Retiring is is_active=false, not DELETE, so a past clearance that
  --  asked the item still explains itself.
  UPDATE public.line_clearance_checklist_items
     SET is_active = false WHERE line_id = ln1 AND item_code = 'calibration_current';
  PERFORM _lck('A','A7 an item can be retired without being deleted',
    (SELECT NOT is_active FROM public.line_clearance_checklist_items
      WHERE line_id=ln1 AND item_code='calibration_current'));

  ok := false; msg := NULL;
  BEGIN
    INSERT INTO public.line_clearance_checklist_items
      (company_id,line_id,item_code,label,sort_order)
    VALUES (c_a,ln1,'area_cleaned','A second area item',90);
  EXCEPTION WHEN others THEN ok := true; msg := SQLERRM; END;
  PERFORM _lck('A','A8 one line cannot carry the same item code twice', ok, left(coalesce(msg,''),120));

  ok := false; msg := NULL;
  BEGIN
    INSERT INTO public.production_lines(company_id,code,name) VALUES (c_a,'LINE-A','Duplicate');
  EXCEPTION WHEN others THEN ok := true; msg := SQLERRM; END;
  PERFORM _lck('A','A9 nor can one company carry the same line code twice', ok, left(coalesce(msg,''),120));
END
$a$;


-- =====================================================================
--  B — opening a clearance snapshots the checklist
-- =====================================================================
DO $b$
DECLARE
  c_a uuid := current_setting('lc.c_a')::uuid;
  res jsonb; b1 uuid; b2 uuid; cl uuid; n integer; ok boolean; msg text;
BEGIN
  res := public.batch_record_initiate(
           c_a,'LC-0001',current_setting('lc.p_a')::uuid,
           current_date, current_date + 365, 1000,'litres');
  b1 := (res->>'batch_id')::uuid;
  PERFORM set_config('lc.b1', b1::text, false);

  res := public.batch_record_initiate(
           c_a,'LC-0002',current_setting('lc.p_a')::uuid,
           current_date, current_date + 365, 1000,'litres');
  b2 := (res->>'batch_id')::uuid;
  PERFORM set_config('lc.b2', b2::text, false);

  --  A batch with no line has nothing to clear.
  ok := false; msg := NULL;
  BEGIN PERFORM public.line_clearance_open(b1);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'LINE_CLEARANCE_NO_LINE%'; msg := SQLERRM; END;
  PERFORM _lck('B','B1 a batch with no line cannot be cleared', ok, left(coalesce(msg,''),140));

  PERFORM public.batch_record_assign_line(b1, current_setting('lc.ln1')::uuid);
  PERFORM _lck('B','B2 a batch can be assigned to a line',
    (SELECT line_id FROM public.batch_records WHERE id=b1) = current_setting('lc.ln1')::uuid);

  res := public.line_clearance_open(b1, NULL, 'Changeover from the previous syrup');
  cl := (res->>'clearance_id')::uuid;
  PERFORM set_config('lc.cl1', cl::text, false);

  --  LINE-A has eight items, one of them retired in section A, so the
  --  snapshot is seven — and the retired one is not among them.
  SELECT count(*) INTO n FROM public.line_clearance_check_results WHERE clearance_id = cl;
  PERFORM _lck('B','B3 the clearance snapshots the line''s ACTIVE items', n = 7, n||' item(s)');

  PERFORM _lck('B','B4 the retired item was not asked',
    NOT EXISTS (SELECT 1 FROM public.line_clearance_check_results
                 WHERE clearance_id=cl AND item_code='calibration_current'));

  PERFORM _lck('B','B5 the line-specific item WAS asked',
    EXISTS (SELECT 1 FROM public.line_clearance_check_results
             WHERE clearance_id=cl AND item_code='filling_nozzles_changed'));

  PERFORM _lck('B','B6 it starts in the engine''s initial state, in progress',
    (SELECT status FROM public.line_clearance_records WHERE id=cl) = 'in_progress'
    AND (SELECT s.state_key FROM public.entity_current_state ecs
           JOIN public.lifecycle_states s ON s.id=ecs.state_id
          WHERE ecs.entity_type='line_clearance' AND ecs.entity_id=cl) = 'in_progress');

  PERFORM _lck('B','B7 every item starts unanswered, as NULL rather than a value',
    (SELECT count(*) FROM public.line_clearance_check_results
      WHERE clearance_id=cl AND result IS NULL) = 7);

  --  A second live clearance would make the gate choose between two.
  ok := false; msg := NULL;
  BEGIN PERFORM public.line_clearance_open(b1);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'LINE_CLEARANCE_ALREADY_OPEN%'; msg := SQLERRM; END;
  PERFORM _lck('B','B8 a second live clearance for the same batch is refused', ok, left(coalesce(msg,''),140));

  --  THE SNAPSHOT IS A SNAPSHOT. Editing the template afterwards must not
  --  change what this clearance asked.
  UPDATE public.line_clearance_checklist_items
     SET label = 'RELABELLED AFTER THE FACT'
   WHERE line_id = current_setting('lc.ln1')::uuid AND item_code = 'area_cleaned';
  PERFORM _lck('B','B9 editing the template does not rewrite what was asked',
    (SELECT label FROM public.line_clearance_check_results
      WHERE clearance_id=cl AND item_code='area_cleaned') = 'Area cleaned, with the cleaning record present',
    (SELECT label FROM public.line_clearance_check_results
      WHERE clearance_id=cl AND item_code='area_cleaned'));

  --  Moving the batch to another line now would orphan the clearance.
  ok := false; msg := NULL;
  BEGIN PERFORM public.batch_record_assign_line(b1, current_setting('lc.ln2')::uuid);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'LINE_CLEARANCE_EXISTS%'; msg := SQLERRM; END;
  PERFORM _lck('B','B10 a cleared batch cannot be quietly moved to another line',
    ok, left(coalesce(msg,''),140));

  --  THE SHORTEST ROUTE TO AN UNCLEARED LINE READING AS CLEARED: write
  --  the mirror directly. Worth stating plainly that this is probed as an
  --  ORDINARY MEMBER, because this table's RLS write policy is FOR ALL to
  --  any member — unlike batch_records, which only an owner may update.
  --  So RLS is not standing in the way here and the guard trigger is the
  --  only thing that is. Mutation testing found this untested: dropping
  --  trg_lcr_guard_status left the whole suite green.
  n := 0;
  UPDATE public.line_clearance_records SET notes = 'a member can write this row' WHERE id = cl;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM _lck('B','B11 an ordinary member can update the clearance row at all',
    n = 1, n||' row(s)');

  ok := false; msg := NULL;
  BEGIN UPDATE public.line_clearance_records SET status = 'verified' WHERE id = cl;
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'LINE_CLEARANCE_STATUS_READ_ONLY%'; msg := SQLERRM; END;
  PERFORM _lck('B','B12 but cannot write the status mirror to open the line',
    ok, left(coalesce(msg,''),140));

  PERFORM _lck('B','B13 and the refused write left the clearance in progress',
    (SELECT status FROM public.line_clearance_records WHERE id=cl) = 'in_progress',
    (SELECT status FROM public.line_clearance_records WHERE id=cl));

  PERFORM _lck('B','B14 the engine agrees with the mirror',
    (SELECT s.state_key FROM public.entity_current_state ecs
       JOIN public.lifecycle_states s ON s.id=ecs.state_id
      WHERE ecs.entity_type='line_clearance' AND ecs.entity_id=cl) = 'in_progress');
END
$b$;


-- =====================================================================
--  C — the answers, and what an answer has to carry
-- =====================================================================
DO $c$
DECLARE
  cl uuid := current_setting('lc.cl1')::uuid;
  ok boolean; msg text;
BEGIN
  --  "with records present": a pass on a record-bearing item needs the
  --  reference. A tick is not a record.
  ok := false; msg := NULL;
  BEGIN PERFORM public.line_clearance_answer(cl,'equipment_cleaned','pass');
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'LINE_CLEARANCE_RECORD_REQUIRED%'; msg := SQLERRM; END;
  PERFORM _lck('C','C1 an item needing evidence cannot pass on a tick alone', ok, left(coalesce(msg,''),140));

  ok := false; msg := NULL;
  BEGIN PERFORM public.line_clearance_answer(cl,'previous_product_removed','not_applicable');
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'LINE_CLEARANCE_NA_NEEDS_NOTE%'; msg := SQLERRM; END;
  PERFORM _lck('C','C2 not applicable needs a reason, or it is a tick in disguise',
    ok, left(coalesce(msg,''),140));

  ok := false; msg := NULL;
  BEGIN PERFORM public.line_clearance_answer(cl,'no_such_item','pass');
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'LINE_CLEARANCE_NO_ITEM%'; msg := SQLERRM; END;
  PERFORM _lck('C','C3 an item this clearance never asked cannot be answered',
    ok, left(coalesce(msg,''),140));

  --  Now answer them properly.
  PERFORM public.line_clearance_answer(cl,'previous_product_removed','pass');
  PERFORM public.line_clearance_answer(cl,'materials_removed','pass');
  PERFORM public.line_clearance_answer(cl,'labels_and_printed_material_removed','pass','RECON-2026-0412');
  PERFORM public.line_clearance_answer(cl,'equipment_cleaned','pass','CLN-EQ-2026-0188');
  PERFORM public.line_clearance_answer(cl,'area_cleaned','pass','CLN-AR-2026-0189');
  PERFORM public.line_clearance_answer(cl,'previous_documents_removed','pass');
  PERFORM public.line_clearance_answer(cl,'filling_nozzles_changed','not_applicable',NULL,
    'Same nozzle set retained; previous product used identical fill');

  PERFORM _lck('C','C4 an answer records who and when',
    (SELECT answered_by = current_setting('lc.u_op')::uuid AND answered_at IS NOT NULL
       FROM public.line_clearance_check_results
      WHERE clearance_id=cl AND item_code='equipment_cleaned'));

  PERFORM _lck('C','C5 and keeps the record reference it was given',
    (SELECT record_reference FROM public.line_clearance_check_results
      WHERE clearance_id=cl AND item_code='equipment_cleaned') = 'CLN-EQ-2026-0188');

  --  The table CHECK is the backstop: the RPC is one way in.
  ok := false; msg := NULL;
  BEGIN
    UPDATE public.line_clearance_check_results
       SET record_reference = NULL
     WHERE clearance_id=cl AND item_code='area_cleaned';
  EXCEPTION WHEN others THEN ok := true; msg := SQLERRM; END;
  PERFORM _lck('C','C6 a direct write cannot strip the record off a passing item',
    ok, left(coalesce(msg,''),140));

  --  C2 above proves the RPC refuses an unreasoned "not applicable". It
  --  does NOT prove the table does, and mutation testing showed exactly
  --  that: dropping lccr_na_needs_note_chk left the suite green, because
  --  every probe went through the RPC. The RPC is one way in.
  ok := false; msg := NULL;
  BEGIN
    UPDATE public.line_clearance_check_results
       SET result = 'not_applicable', note = NULL
     WHERE clearance_id=cl AND item_code='materials_removed';
  EXCEPTION WHEN others THEN ok := true; msg := SQLERRM; END;
  PERFORM _lck('C','C7 nor mark an item not applicable with no reason given',
    ok, left(coalesce(msg,''),140));
END
$c$;


-- =====================================================================
--  D — the performer's signature, and what it is refused for
-- =====================================================================
DO $d$
DECLARE
  c_a uuid := current_setting('lc.c_a')::uuid;
  cl uuid := current_setting('lc.cl1')::uuid;
  r jsonb; sig uuid; ok boolean; msg text;
BEGIN
  --  "A result is required before clearance completes."
  ok := false; msg := NULL;
  BEGIN PERFORM public.line_clearance_perform(cl, NULL);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'LINE_CHANGEOVER_REQUIRED%'; msg := SQLERRM; END;
  PERFORM _lck('D','D1 a clearance cannot be signed with no changeover verification',
    ok, left(coalesce(msg,''),140));

  --  A failing one does not satisfy it either — and section G proves a
  --  failure blocks the line outright, so here it is a PASS that is
  --  needed, not merely a result.
  r := public.line_changeover_record(cl,'Swab test, residual paracetamol','pass',
         'Swab recovery below the limit on all five sites', 0.4, 2.0, 'ug/cm2');
  PERFORM _lck('D','D2 a passing changeover verification can be recorded',
    (r->>'result')='pass', coalesce(r::text,'NULL'));

  --  Still refused without a signature: the engine declares `perform` as
  --  requiring one, which is a hard gate rather than a hint.
  ok := false; msg := NULL;
  BEGIN PERFORM public.line_clearance_perform(cl, NULL);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%SIGNATURE_REQUIRED%'; msg := SQLERRM; END;
  PERFORM _lck('D','D3 nor without a signature', ok, left(coalesce(msg,''),140));

  r := public.sign_electronic_record(c_a,'line_clearance',cl,'perform','authored','CorrectHorse1!');
  PERFORM _lck('D','D4 the operator can sign the clearance',
    (r->>'ok')='true', coalesce(r::text,'NULL'));
  sig := (r->>'signature_id')::uuid;

  PERFORM public.line_clearance_perform(cl, sig);
  PERFORM _lck('D','D5 with every item answered and a passing result, it signs',
    (SELECT status FROM public.line_clearance_records WHERE id=cl) = 'performed',
    (SELECT status FROM public.line_clearance_records WHERE id=cl));

  PERFORM _lck('D','D6 the performer and the moment are recorded',
    (SELECT performed_by = current_setting('lc.u_op')::uuid
        AND performed_at IS NOT NULL AND performed_signature_id = sig
       FROM public.line_clearance_records WHERE id=cl));

  --  Once signed, the answers are what the signature covers.
  ok := false; msg := NULL;
  BEGIN
    UPDATE public.line_clearance_check_results SET note='changed my mind'
     WHERE clearance_id=cl AND item_code='materials_removed';
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'LINE_CLEARANCE_SIGNED%'; msg := SQLERRM; END;
  PERFORM _lck('D','D7 the answers freeze once the clearance is signed', ok, left(coalesce(msg,''),140));

  ok := false; msg := NULL;
  BEGIN PERFORM public.line_clearance_answer(cl,'materials_removed','fail');
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'LINE_CLEARANCE_NOT_OPEN%'; msg := SQLERRM; END;
  PERFORM _lck('D','D8 and the RPC says so in a sentence', ok, left(coalesce(msg,''),140));

  PERFORM set_config('lc.sig_perf', sig::text, false);
END
$d$;


-- =====================================================================
--  E — two signatures from two different people
--
--  The NOT DONE IF: "One user can both perform and verify."
-- =====================================================================
DO $e$
DECLARE
  c_a uuid := current_setting('lc.c_a')::uuid;
  cl uuid := current_setting('lc.cl1')::uuid;
  r jsonb; ok boolean; msg text;
BEGIN
  --  The performer, trying to verify their own work with a fresh
  --  signature of their own. This is the clause, exactly.
  r := public.sign_electronic_record(c_a,'line_clearance',cl,'verify','verified','CorrectHorse1!');
  PERFORM _lck('E','E1 the performer can obtain a verify signature',
    (r->>'ok')='true', coalesce(r::text,'NULL'));

  ok := false; msg := NULL;
  BEGIN PERFORM public.line_clearance_verify(cl, (r->>'signature_id')::uuid);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'LINE_CLEARANCE_SELF_VERIFIED%'; msg := SQLERRM; END;
  PERFORM _lck('E','E2 but cannot verify their own clearance', ok, left(coalesce(msg,''),140));

  PERFORM _lck('E','E3 and the refusal left the clearance unverified',
    (SELECT status FROM public.line_clearance_records WHERE id=cl) = 'performed',
    (SELECT status FROM public.line_clearance_records WHERE id=cl));

  --  The table CHECK, which no write path can walk around.
  ok := false; msg := NULL;
  BEGIN
    UPDATE public.line_clearance_records SET verified_by = performed_by WHERE id=cl;
  EXCEPTION WHEN others THEN ok := true; msg := SQLERRM; END;
  PERFORM _lck('E','E4 a direct write cannot make a clearance self-verified either',
    ok, left(coalesce(msg,''),140));
END
$e$;

--  The second person, being themselves.
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('lc.u_qa'), 'role','authenticated')::text, false);
DO $e2$
DECLARE
  c_a uuid := current_setting('lc.c_a')::uuid;
  cl uuid := current_setting('lc.cl1')::uuid;
  r jsonb; ok boolean; msg text;
BEGIN
  --  First: the verifier offering the PERFORMER's signature. The engine
  --  binds a signature to the actor who made the transition, so this is
  --  refused without the RPC needing to know about it.
  ok := false; msg := NULL;
  BEGIN PERFORM public.line_clearance_verify(cl, current_setting('lc.sig_perf')::uuid);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%SIGNATURE_MISMATCH%'; msg := SQLERRM; END;
  PERFORM _lck('E','E5 nor can the verifier sign with somebody else''s signature',
    ok, left(coalesce(msg,''),140));

  r := public.sign_electronic_record(c_a,'line_clearance',cl,'verify','verified','CorrectHorse1!');
  PERFORM public.line_clearance_verify(cl, (r->>'signature_id')::uuid);

  PERFORM _lck('E','E6 a second person verifies it, and the line is clear',
    (SELECT status FROM public.line_clearance_records WHERE id=cl) = 'verified',
    (SELECT status FROM public.line_clearance_records WHERE id=cl));

  PERFORM _lck('E','E7 both people and both signatures are on the record',
    (SELECT performed_by = current_setting('lc.u_op')::uuid
        AND verified_by  = current_setting('lc.u_qa')::uuid
        AND performed_signature_id IS NOT NULL
        AND verified_signature_id  IS NOT NULL
        AND verified_at IS NOT NULL
       FROM public.line_clearance_records WHERE id=cl));

  --  §11.50(a)(2): a signature has to say what signing MEANT. Two
  --  signatures that both said the same thing would be a
  --  countersignature, not a verification.
  PERFORM _lck('E','E8 the two signatures carry different meanings',
    (SELECT sp.meaning='authored' AND sv.meaning='verified'
       FROM public.line_clearance_records r
       JOIN public.electronic_signatures sp ON sp.id=r.performed_signature_id
       JOIN public.electronic_signatures sv ON sv.id=r.verified_signature_id
      WHERE r.id=cl));

  PERFORM _lck('E','E9 and they were given by two different signers',
    (SELECT sp.signer_id <> sv.signer_id
       FROM public.line_clearance_records r
       JOIN public.electronic_signatures sp ON sp.id=r.performed_signature_id
       JOIN public.electronic_signatures sv ON sv.id=r.verified_signature_id
      WHERE r.id=cl));
END
$e2$;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('lc.u_op'), 'role','authenticated')::text, false);


-- =====================================================================
--  F — the gate
--
--  The NOT DONE IF this serves: "Clearance is recorded but dispensing
--  never checks it." Dispensing is item 09 and does not exist, so what is
--  asserted here is that the gate answers correctly, including when the
--  honest answer is "blocked". Item 09's suite asserts that dispensing
--  calls it.
-- =====================================================================
DO $f$
DECLARE
  b1 uuid := current_setting('lc.b1')::uuid;
  b2 uuid := current_setting('lc.b2')::uuid;
  v_reason text; ok boolean; msg text;
BEGIN
  --  b1 is cleared and verified.
  v_reason := public.line_clearance_block_reason(b1);
  PERFORM _lck('F','F1 a verified clearance does not block', v_reason IS NULL,
    coalesce(left(v_reason,120),'not blocked'));

  BEGIN PERFORM public.line_clearance_assert_cleared(b1); ok := true;
  EXCEPTION WHEN others THEN ok := false; msg := SQLERRM; END;
  PERFORM _lck('F','F2 and the asserting form is silent', ok, left(coalesce(msg,''),140));

  --  b2 has no line at all. A batch that cannot be PROVED cleared is
  --  blocked — the permissive default here is cross-contamination.
  v_reason := public.line_clearance_block_reason(b2);
  PERFORM _lck('F','F3 a batch with no line is BLOCKED, not waved through',
    v_reason IS NOT NULL AND v_reason LIKE '%not assigned to a production line%',
    coalesce(left(v_reason,140),'NULL'));

  ok := false; msg := NULL;
  BEGIN PERFORM public.line_clearance_assert_cleared(b2);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'LINE_NOT_CLEARED%'; msg := SQLERRM; END;
  PERFORM _lck('F','F4 and the asserting form raises', ok, left(coalesce(msg,''),140));

  --  A line, but no clearance on it.
  PERFORM public.batch_record_assign_line(b2, current_setting('lc.ln2')::uuid);
  v_reason := public.line_clearance_block_reason(b2);
  PERFORM _lck('F','F5 a line with no clearance record is blocked',
    v_reason IS NOT NULL AND v_reason LIKE '%no clearance record%',
    coalesce(left(v_reason,140),'NULL'));

  --  Opened but not signed.
  PERFORM public.line_clearance_open(b2);
  v_reason := public.line_clearance_block_reason(b2);
  PERFORM _lck('F','F6 a clearance in progress is blocked',
    v_reason IS NOT NULL AND v_reason LIKE '%still in progress%',
    coalesce(left(v_reason,140),'NULL'));

  --  A nonexistent batch is not "fine".
  v_reason := public.line_clearance_block_reason(gen_random_uuid());
  PERFORM _lck('F','F7 a batch that does not exist is blocked',
    v_reason IS NOT NULL, coalesce(left(v_reason,120),'NULL'));

  --  THE ONE THAT CATCHES A STALE READ. b1 is verified. A line that is
  --  re-cleared — the run is interrupted, something is changed, the line
  --  is cleared again — has a NEWER clearance, and until that one is
  --  verified the line is not clear. A gate that found "a verified
  --  clearance exists" rather than "the current clearance is verified"
  --  would keep the line open on the strength of a superseded record.
  PERFORM public.line_clearance_open(b1, NULL, 'Line re-cleared after an interruption');
  v_reason := public.line_clearance_block_reason(b1);
  PERFORM _lck('F','F8 a newer unfinished clearance supersedes an older verified one',
    v_reason IS NOT NULL AND v_reason LIKE '%still in progress%',
    coalesce(left(v_reason,160),'NULL'));

  PERFORM _lck('F','F9 and the older verified clearance is still on the record',
    (SELECT count(*) FROM public.line_clearance_records
      WHERE batch_id=b1 AND status='verified') = 1);

  ok := false; msg := NULL;
  BEGIN PERFORM public.line_clearance_assert_cleared(b1);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'LINE_NOT_CLEARED%'; msg := SQLERRM; END;
  PERFORM _lck('F','F10 so the hard block bites again', ok, left(coalesce(msg,''),140));
END
$f$;


-- =====================================================================
--  G — a failed changeover blocks the line
-- =====================================================================
DO $g$
DECLARE
  c_a uuid := current_setting('lc.c_a')::uuid;
  b2 uuid := current_setting('lc.b2')::uuid;
  cl uuid; r jsonb; v_reason text; ok boolean; msg text;
BEGIN
  SELECT id INTO cl FROM public.line_clearance_records
   WHERE batch_id=b2 ORDER BY created_at DESC LIMIT 1;
  PERFORM set_config('lc.cl2', cl::text, false);

  --  A failure with no explanation cannot be acted on.
  ok := false; msg := NULL;
  BEGIN PERFORM public.line_changeover_record(cl,'Rinse sample','fail');
  EXCEPTION WHEN others THEN ok := true; msg := SQLERRM; END;
  PERFORM _lck('G','G1 a failing result with no detail is refused', ok, left(coalesce(msg,''),140));

  r := public.line_changeover_record(cl,'Rinse sample, conductivity','fail',
         'Conductivity 48 uS/cm against a limit of 10; previous product still detectable',
         48, 10, 'uS/cm');
  PERFORM set_config('lc.fail1', (r->>'verification_id'), false);

  --  "A failed result blocks the line" — by the recording of it, with
  --  nobody having to remember a second step.
  PERFORM _lck('G','G2 recording a failure moves the clearance to failed by itself',
    (SELECT status FROM public.line_clearance_records WHERE id=cl) = 'failed',
    (SELECT status FROM public.line_clearance_records WHERE id=cl));

  v_reason := public.line_clearance_block_reason(b2);
  PERFORM _lck('G','G3 and the gate now reports the line as blocked',
    v_reason IS NOT NULL AND v_reason LIKE '%FAILED%',
    coalesce(left(v_reason,140),'NULL'));

  --  A result is evidence. A failure that can be edited into a pass is
  --  not a control.
  ok := false; msg := NULL;
  BEGIN UPDATE public.line_changeover_verifications SET result='pass' WHERE clearance_id=cl;
  EXCEPTION WHEN others THEN
    ok := SQLERRM LIKE 'LINE_VERIFICATION_IMMUTABLE%' OR SQLERRM LIKE 'permission denied%';
    msg := SQLERRM;
  END;
  PERFORM _lck('G','G4 a verification cannot be edited', ok, left(coalesce(msg,''),140));

  ok := false; msg := NULL;
  BEGIN DELETE FROM public.line_changeover_verifications WHERE clearance_id=cl;
  EXCEPTION WHEN others THEN
    ok := SQLERRM LIKE 'LINE_VERIFICATION_IMMUTABLE%' OR SQLERRM LIKE 'permission denied%';
    msg := SQLERRM;
  END;
  PERFORM _lck('G','G5 nor deleted', ok, left(coalesce(msg,''),140));

  --  A failed clearance takes no more results, so a failure cannot be
  --  buried under a later pass on the same record.
  ok := false; msg := NULL;
  BEGIN PERFORM public.line_changeover_record(cl,'Rinse sample, repeat','pass','Clear after re-clean');
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'LINE_CLEARANCE_NOT_OPEN%'; msg := SQLERRM; END;
  PERFORM _lck('G','G6 a failed clearance takes no further results until it is dealt with',
    ok, left(coalesce(msg,''),140));
END
$g$;

--  The grants answer first for the application role, so the immutability
--  triggers behind them are asserted where no grant is in the way.
RESET ROLE;
DO $g2$
DECLARE cl uuid := current_setting('lc.cl2')::uuid; ok boolean; msg text; n integer;
BEGIN
  ok := false; msg := NULL;
  BEGIN UPDATE public.line_changeover_verifications SET result='pass' WHERE clearance_id=cl;
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'LINE_VERIFICATION_IMMUTABLE%'; msg := SQLERRM; END;
  PERFORM _lck('G','G7 the immutability trigger refuses an edit on its own',
    ok, left(coalesce(msg,''),140));

  ok := false; msg := NULL;
  BEGIN DELETE FROM public.line_changeover_verifications WHERE clearance_id=cl;
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'LINE_VERIFICATION_IMMUTABLE%'; msg := SQLERRM; END;
  PERFORM _lck('G','G8 and a delete, even with every grant in hand',
    ok, left(coalesce(msg,''),140));

  SELECT count(*) INTO n FROM public.line_changeover_verifications WHERE clearance_id=cl;
  PERFORM _lck('G','G9 so the result is still on the record', n=1, n||' row(s)');
END
$g2$;
SET ROLE authenticated;


-- =====================================================================
--  H — an override is a recorded decision
--
--  The NOT DONE IF: "A failed verification can be overridden without a
--  recorded decision."
-- =====================================================================
DO $h$
DECLARE
  c_a uuid := current_setting('lc.c_a')::uuid;
  cl uuid := current_setting('lc.cl2')::uuid;
  r jsonb; sig uuid; ok boolean; msg text;
BEGIN
  --  THE CLAUSE. Straight at the engine, bypassing the RPC entirely:
  --  this is the move a caller with lifecycle_transition() in hand would
  --  make, and it has to be refused.
  r := public.sign_electronic_record(c_a,'line_clearance',cl,'override','approved','CorrectHorse1!');
  sig := (r->>'signature_id')::uuid;

  ok := false; msg := NULL;
  BEGIN
    PERFORM public.lifecycle_transition('line_clearance', cl, 'override', c_a,
      current_setting('lc.u_op')::uuid, 'just let it through', '{}'::jsonb, sig);
  EXCEPTION WHEN others THEN
    ok := SQLERRM LIKE 'LINE_CLEARANCE_OVERRIDE_NOT_RECORDED%'; msg := SQLERRM;
  END;
  PERFORM _lck('H','H1 the engine refuses an override with no decision on file',
    ok, left(coalesce(msg,''),160));

  PERFORM _lck('H','H2 and the clearance is still failed',
    (SELECT status FROM public.line_clearance_records WHERE id=cl) = 'failed',
    (SELECT status FROM public.line_clearance_records WHERE id=cl));

  ok := false; msg := NULL;
  BEGIN PERFORM public.line_clearance_override(cl, '   ', sig);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'LINE_CLEARANCE_OVERRIDE_NO_REASON%'; msg := SQLERRM; END;
  PERFORM _lck('H','H3 the RPC refuses an override with no reason', ok, left(coalesce(msg,''),140));

  --  The proper route: the decision is recorded, then the move happens.
  r := public.line_clearance_override(cl,
         'Second rinse sample clear at 6 uS/cm; first sample drawn before the final rinse completed. QA authorises proceeding.',
         sig);
  PERFORM _lck('H','H4 with a recorded decision the override is accepted',
    (r->>'overrode_verification') = current_setting('lc.fail1'), coalesce(r::text,'NULL'));

  PERFORM _lck('H','H5 the decision records who, which failure, why and the signature',
    EXISTS (SELECT 1 FROM public.line_clearance_overrides
             WHERE clearance_id=cl
               AND verification_id = current_setting('lc.fail1')::uuid
               AND authorised_by = current_setting('lc.u_op')::uuid
               AND reason LIKE 'Second rinse sample clear%'
               AND signature_id = sig
               AND decided_at IS NOT NULL));

  --  An override returns the clearance to performed. It does NOT make it
  --  verified: a second person still has to say so.
  PERFORM _lck('H','H6 an override returns it to performed, not to verified',
    (SELECT status FROM public.line_clearance_records WHERE id=cl) = 'performed',
    (SELECT status FROM public.line_clearance_records WHERE id=cl));

  PERFORM _lck('H','H7 so the gate still blocks until a second person verifies',
    public.line_clearance_block_reason(current_setting('lc.b2')::uuid) IS NOT NULL,
    coalesce(left(public.line_clearance_block_reason(current_setting('lc.b2')::uuid),120),'NULL'));

  ok := false; msg := NULL;
  BEGIN UPDATE public.line_clearance_overrides SET reason='nothing to see' WHERE clearance_id=cl;
  EXCEPTION WHEN others THEN
    ok := SQLERRM LIKE 'LINE_OVERRIDE_IMMUTABLE%' OR SQLERRM LIKE 'permission denied%';
    msg := SQLERRM;
  END;
  PERFORM _lck('H','H8 a decision cannot be edited afterwards', ok, left(coalesce(msg,''),140));

  ok := false; msg := NULL;
  BEGIN DELETE FROM public.line_clearance_overrides WHERE clearance_id=cl;
  EXCEPTION WHEN others THEN
    ok := SQLERRM LIKE 'LINE_OVERRIDE_IMMUTABLE%' OR SQLERRM LIKE 'permission denied%';
    msg := SQLERRM;
  END;
  PERFORM _lck('H','H9 nor deleted', ok, left(coalesce(msg,''),140));

  --  One authorisation, one failure. A second override row against the
  --  same verification would let one signature be pointed at a second
  --  failure. Probed by direct insert, because the RPC cannot reach it —
  --  and mutation testing showed that dropping the uniqueness rule left
  --  the suite green for exactly that reason.
  ok := false; msg := NULL;
  BEGIN
    INSERT INTO public.line_clearance_overrides
      (company_id, clearance_id, verification_id, authorised_by, reason, signature_id)
    VALUES (c_a, cl, current_setting('lc.fail1')::uuid,
            current_setting('lc.u_op')::uuid, 'and again', sig);
  EXCEPTION WHEN others THEN ok := true; msg := SQLERRM; END;
  PERFORM _lck('H','H12 one failure cannot carry two override decisions',
    ok, left(coalesce(msg,''),140));
END
$h$;

--  AND THE CASE THAT MATTERS MOST: a decision authorises ONE failure.
--  The clearance is back at performed after the override; a fresh failing
--  verification must block it again, and the override already on file
--  must not cover the new failure.
DO $h3$
DECLARE
  c_a uuid := current_setting('lc.c_a')::uuid;
  cl uuid := current_setting('lc.cl2')::uuid;
  r jsonb; sig uuid; ok boolean; msg text;
BEGIN
  r := public.line_changeover_record(cl,'Swab test, second site','fail',
         'Residue detected at the filler neck after the authorised restart', 31, 10, 'ug/cm2');

  PERFORM _lck('H','H13 a second, different failure blocks the line again',
    (SELECT status FROM public.line_clearance_records WHERE id=cl) = 'failed',
    (SELECT status FROM public.line_clearance_records WHERE id=cl));

  r := public.sign_electronic_record(c_a,'line_clearance',cl,'override','approved','CorrectHorse1!');
  sig := (r->>'signature_id')::uuid;

  ok := false; msg := NULL;
  BEGIN
    PERFORM public.lifecycle_transition('line_clearance', cl, 'override', c_a,
      current_setting('lc.u_op')::uuid, 'the earlier decision covers this', '{}'::jsonb, sig);
  EXCEPTION WHEN others THEN
    ok := SQLERRM LIKE 'LINE_CLEARANCE_OVERRIDE_NOT_RECORDED%'; msg := SQLERRM;
  END;
  PERFORM _lck('H','H14 and the earlier decision does not cover it',
    ok, left(coalesce(msg,''),160));
END
$h3$;

RESET ROLE;
DO $h2$
DECLARE cl uuid := current_setting('lc.cl2')::uuid; ok boolean; msg text; n integer;
BEGIN
  ok := false; msg := NULL;
  BEGIN UPDATE public.line_clearance_overrides SET reason='rewritten' WHERE clearance_id=cl;
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'LINE_OVERRIDE_IMMUTABLE%'; msg := SQLERRM; END;
  PERFORM _lck('H','H10 the immutability trigger refuses an edit on its own',
    ok, left(coalesce(msg,''),140));

  SELECT count(*) INTO n FROM public.line_clearance_overrides WHERE clearance_id=cl;
  PERFORM _lck('H','H11 and the decision is still on the record', n=1, n||' row(s)');
END
$h2$;
SET ROLE authenticated;


-- =====================================================================
--  I — restart, the other way out of failed
-- =====================================================================
DO $i$
DECLARE
  c_a uuid := current_setting('lc.c_a')::uuid;
  b1 uuid := current_setting('lc.b1')::uuid;
  res jsonb; b3 uuid; cl uuid; r jsonb; ok boolean; msg text; n integer;
BEGIN
  --  A fresh batch and clearance, failed on a CHECKLIST item rather than
  --  a changeover result — which is the case an override must not cover.
  res := public.batch_record_initiate(
           c_a,'LC-0003',current_setting('lc.p_a')::uuid,
           current_date, current_date + 365, 1000,'litres');
  b3 := (res->>'batch_id')::uuid;
  PERFORM public.batch_record_assign_line(b3, current_setting('lc.ln1')::uuid);
  res := public.line_clearance_open(b3);
  cl := (res->>'clearance_id')::uuid;
  PERFORM set_config('lc.cl3', cl::text, false);

  PERFORM public.line_clearance_answer(cl,'previous_product_removed','pass');
  PERFORM public.line_clearance_answer(cl,'labels_and_printed_material_removed','fail',NULL,
    'Two pallets of the previous run''s cartons still at the end of the line');

  PERFORM _lck('I','I1 a failed checklist item blocks the line too',
    (SELECT status FROM public.line_clearance_records WHERE id=cl) = 'failed',
    (SELECT status FROM public.line_clearance_records WHERE id=cl));

  --  There is no changeover failure to answer, so the override route is
  --  not available. Offering it would be an authorisation for nothing.
  r := public.sign_electronic_record(c_a,'line_clearance',cl,'override','approved','CorrectHorse1!');
  ok := false; msg := NULL;
  BEGIN PERFORM public.line_clearance_override(cl,'wave it through',(r->>'signature_id')::uuid);
  EXCEPTION WHEN others THEN
    ok := SQLERRM LIKE 'LINE_CLEARANCE_OVERRIDE_NOT_APPLICABLE%'; msg := SQLERRM;
  END;
  PERFORM _lck('I','I2 a checklist failure cannot be overridden, only restarted',
    ok, left(coalesce(msg,''),160));

  ok := false; msg := NULL;
  BEGIN PERFORM public.line_clearance_restart(cl,'  ');
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'LINE_CLEARANCE_RESTART_NO_REASON%'; msg := SQLERRM; END;
  PERFORM _lck('I','I3 a restart needs a reason', ok, left(coalesce(msg,''),140));

  PERFORM public.line_clearance_restart(cl,'Cartons removed to the staging area and the line re-checked');

  PERFORM _lck('I','I4 a restart reopens the clearance',
    (SELECT status FROM public.line_clearance_records WHERE id=cl) = 'in_progress',
    (SELECT status FROM public.line_clearance_records WHERE id=cl));

  SELECT count(*) INTO n FROM public.line_clearance_check_results
   WHERE clearance_id=cl AND result IS NOT NULL;
  PERFORM _lck('I','I5 and clears the answers, which described a line since cleaned',
    n = 0, n||' answered');

  PERFORM _lck('I','I6 including the performer''s signature',
    (SELECT performed_by IS NULL AND performed_signature_id IS NULL
       FROM public.line_clearance_records WHERE id=cl));

  --  The verifications are NOT cleared. They are evidence, and the
  --  failure stays on the record.
  SELECT count(*) INTO n FROM public.line_clearance_check_results WHERE clearance_id=cl;
  PERFORM _lck('I','I7 the items themselves are still there to answer', n = 7, n||' item(s)');
END
$i$;


-- =====================================================================
--  J — tenancy
-- =====================================================================
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('lc.u_b'), 'role','authenticated')::text, false);
DO $j$
DECLARE
  c_a uuid := current_setting('lc.c_a')::uuid;
  b1 uuid := current_setting('lc.b1')::uuid;
  cl uuid := current_setting('lc.cl1')::uuid;
  n integer; ok boolean; msg text;
BEGIN
  SELECT count(*) INTO n FROM public.production_lines WHERE company_id=c_a;
  PERFORM _lck('J','J1 another company cannot see the lines', n=0, n||' row(s)');

  SELECT count(*) INTO n FROM public.line_clearance_records WHERE company_id=c_a;
  PERFORM _lck('J','J2 nor the clearances', n=0, n||' row(s)');

  SELECT count(*) INTO n FROM public.line_clearance_check_results WHERE company_id=c_a;
  PERFORM _lck('J','J3 nor the checklist answers', n=0, n||' row(s)');

  SELECT count(*) INTO n FROM public.line_changeover_verifications WHERE company_id=c_a;
  PERFORM _lck('J','J4 nor the changeover results', n=0, n||' row(s)');

  SELECT count(*) INTO n FROM public.line_clearance_overrides WHERE company_id=c_a;
  PERFORM _lck('J','J5 nor the override decisions', n=0, n||' row(s)');

  --  Invisible is not untouchable, so the SECURITY DEFINER functions are
  --  probed directly: inside them RLS is off.
  ok := false; msg := NULL;
  BEGIN PERFORM public.line_clearance_block_reason(b1);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'LINE_CLEARANCE_FORBIDDEN%'; msg := SQLERRM; END;
  PERFORM _lck('J','J6 the gate refuses to report on another company''s batch',
    ok, left(coalesce(msg,''),140));

  ok := false; msg := NULL;
  BEGIN PERFORM public.line_clearance_open(b1);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'LINE_CLEARANCE_%'; msg := SQLERRM; END;
  PERFORM _lck('J','J7 nor open a clearance on it', ok, left(coalesce(msg,''),140));

  ok := false; msg := NULL;
  BEGIN PERFORM public.line_clearance_answer(cl,'area_cleaned','pass','FORGED');
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'LINE_CLEARANCE_FORBIDDEN%'; msg := SQLERRM; END;
  PERFORM _lck('J','J8 nor answer its checklist', ok, left(coalesce(msg,''),140));

  ok := false; msg := NULL;
  BEGIN PERFORM public.line_changeover_record(cl,'forged','pass');
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'LINE_CLEARANCE_FORBIDDEN%'; msg := SQLERRM; END;
  PERFORM _lck('J','J9 nor record a changeover result against it', ok, left(coalesce(msg,''),140));

  ok := false; msg := NULL;
  BEGIN PERFORM public.batch_record_assign_line(b1, current_setting('lc.ln1')::uuid);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE 'LINE_CLEARANCE_FORBIDDEN%'; msg := SQLERRM; END;
  PERFORM _lck('J','J10 nor move it to a line', ok, left(coalesce(msg,''),140));
END
$j$;
RESET ROLE; RESET request.jwt.claims;

DO $j2$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM public.production_lines
   WHERE company_id=current_setting('lc.c_a')::uuid;
  PERFORM _lck('J','J11 and the owner is not locked out of their own lines', n=2, n||' row(s)');
END
$j2$;


\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo '  WEEK 4 / ITEM 08 — LINE CLEARANCE AND CHANGEOVER VERIFICATION'
\echo '════════════════════════════════════════════════════════════════'
SELECT section, count(*) AS assertions, count(*) FILTER (WHERE NOT ok) AS failures
  FROM _lc GROUP BY section ORDER BY section;
SELECT section, name, coalesce(detail,'') AS detail FROM _lc WHERE NOT ok ORDER BY section, name;
SELECT count(*) AS total, count(*) FILTER (WHERE ok) AS passed,
       count(*) FILTER (WHERE NOT ok) AS failed FROM _lc;

DO $v$
DECLARE f integer;
BEGIN
  SELECT count(*) INTO f FROM _lc WHERE NOT ok;
  IF f > 0 THEN RAISE EXCEPTION 'ITEM 08: % assertion(s) failed', f; END IF;
  RAISE NOTICE 'ITEM 08: all assertions passed';
END
$v$;

DROP FUNCTION IF EXISTS _lck(text,text,boolean,text);
DROP TABLE IF EXISTS _lc;
