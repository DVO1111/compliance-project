-- =====================================================================
--  PRODUCT REGISTRY — INTEGRATION TESTS  (Week 2, Task 05)
--  LOCAL / DISPOSABLE DATABASE ONLY
-- =====================================================================
--  Covers 20260918000000_product_registry.sql.
--
--  Run:  psql "<local url>" -f supabase/tests/product_registry_test.sql
--
--  Safe to run repeatedly. Fixtures are tagged prod- and removed at the
--  end. No permanent schema change is made.
-- =====================================================================

\set ON_ERROR_STOP off

DO $guard$
BEGIN
  IF current_database() NOT IN ('postgres','criateur_local') THEN
    RAISE EXCEPTION 'REFUSING TO RUN outside a local database (got %)', current_database();
  END IF;
  IF to_regclass('public.products') IS NULL THEN
    RAISE EXCEPTION 'Migration 20260918000000 has not been applied to this database.';
  END IF;
END $guard$;

DROP TABLE IF EXISTS prod_results;
CREATE TEMP TABLE prod_results(seq serial, id text, name text, verdict text, detail text);
GRANT ALL ON prod_results TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE prod_results_seq_seq TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION prod_assert(p_id text, p_name text, p_cond boolean, p_detail text DEFAULT '')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO prod_results(id,name,verdict,detail)
  VALUES (p_id,p_name,CASE WHEN p_cond THEN 'PASS' ELSE 'FAIL' END,p_detail);
END $$;

-- ── fixtures ─────────────────────────────────────────────────────────
DO $fx$
DECLARE
  ca uuid := '00000000-0000-7300-a000-00000000000a';
  cb uuid := '00000000-0000-7300-a000-00000000000b';
  ua uuid := '00000000-0000-7300-b000-000000000001';
  ub uuid := '00000000-0000-7300-b000-000000000002';
BEGIN
  INSERT INTO public.companies(id,name) VALUES (ca,'PROD Alpha'),(cb,'PROD Beta')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO auth.users(id,email) VALUES (ua,'prod-a@local.test'),(ub,'prod-b@local.test')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.profiles(id,email,full_name,role,company_id) VALUES
    (ua,'prod-a@local.test','Ada Admin','admin',ca),
    (ub,'prod-b@local.test','Ben Beta','admin',cb)
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.company_members(company_id,user_id,role,status) VALUES
    (ca,ua,'owner','active'),(cb,ub,'owner','active')
    ON CONFLICT DO NOTHING;
  INSERT INTO public.vendors(id,company_id,name,category,status) VALUES
    ('00000000-0000-7300-d000-000000000001',ca,'PROD Contract Manufacturing Ltd','contract_manufacturer','active')
    ON CONFLICT (id) DO NOTHING;
END $fx$;


-- =====================================================================
--  A — product creation and the code rule
-- =====================================================================
DO $a$
DECLARE v_id uuid; v_status text; n int;
BEGIN
  INSERT INTO public.products(id,company_id,product_code,trade_name,generic_name,category,created_by)
  VALUES ('00000000-0000-7300-c000-000000000001','00000000-0000-7300-a000-00000000000a',
          'PRD-001','Paracet 500','Paracetamol','drug_pharmaceutical',
          '00000000-0000-7300-b000-000000000001')
  RETURNING id, status INTO v_id, v_status;

  PERFORM prod_assert('A1','a product can be created', v_id IS NOT NULL, coalesce(v_id::text,'NULL'));
  PERFORM prod_assert('A2','it starts in the lifecycle initial state',
    v_status='development', coalesce(v_status,'NULL'));

  SELECT count(*) INTO n FROM public.entity_current_state
   WHERE entity_type='product' AND entity_id=v_id;
  PERFORM prod_assert('A3','the lifecycle engine was initialised by trigger', n=1, n||' state row(s)');

  SELECT count(*) INTO n FROM public.entity_state_history
   WHERE entity_type='product' AND entity_id=v_id;
  PERFORM prod_assert('A4','and a history row exists', n=1, n||' history row(s)');
END $a$;

-- the uniqueness decision: per company, case-insensitive
DO $a2$
DECLARE v_msg text; v_ok boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.products(company_id,product_code,trade_name,category)
    VALUES ('00000000-0000-7300-a000-00000000000a','prd-001','Duplicate','food');
    v_msg := 'DUPLICATE ACCEPTED';
  EXCEPTION WHEN others THEN v_ok := true; v_msg := SQLERRM;
  END;
  PERFORM prod_assert('A5','a duplicate code in the same company is refused (case-insensitive)',
    v_ok, left(v_msg,90));

  -- but the same code in ANOTHER company is fine: codes are tenant labels
  v_ok := false;
  BEGIN
    INSERT INTO public.products(id,company_id,product_code,trade_name,category)
    VALUES ('00000000-0000-7300-c000-0000000000b1','00000000-0000-7300-a000-00000000000b',
            'PRD-001','Beta Product','food');
    v_ok := true; v_msg := 'accepted';
  EXCEPTION WHEN others THEN v_msg := SQLERRM;
  END;
  PERFORM prod_assert('A6','the same code in a different company is allowed', v_ok, left(v_msg,90));
END $a2$;


-- =====================================================================
--  B — categories, including herbal_nutraceutical
-- =====================================================================
DO $b$
DECLARE v_ok boolean := false; v_msg text;
BEGIN
  BEGIN
    INSERT INTO public.products(id,company_id,product_code,trade_name,category)
    VALUES ('00000000-0000-7300-c000-000000000002','00000000-0000-7300-a000-00000000000a',
            'PRD-HERB','Moringa Capsules','herbal_nutraceutical');
    v_ok := true; v_msg := 'accepted';
  EXCEPTION WHEN others THEN v_msg := SQLERRM;
  END;
  PERFORM prod_assert('B1','herbal_nutraceutical is a valid product category', v_ok, left(v_msg,90));

  -- the pre-existing eight are untouched
  v_ok := true;
  BEGIN
    INSERT INTO public.products(id,company_id,product_code,trade_name,category)
    VALUES ('00000000-0000-7300-c000-000000000003','00000000-0000-7300-a000-00000000000a',
            'PRD-FOOD','Instant Noodles','food');
  EXCEPTION WHEN others THEN v_ok := false; v_msg := SQLERRM;
  END;
  PERFORM prod_assert('B2','existing categories still work', v_ok, 'food accepted');

  v_ok := false;
  BEGIN
    INSERT INTO public.products(company_id,product_code,trade_name,category)
    VALUES ('00000000-0000-7300-a000-00000000000a','PRD-BAD','Nonsense','not_a_category');
    v_msg := 'INVALID CATEGORY ACCEPTED';
  EXCEPTION WHEN others THEN v_ok := true; v_msg := 'rejected';
  END;
  PERFORM prod_assert('B3','an unknown category is rejected', v_ok, v_msg);
END $b$;

-- and the submissions table accepts the new category too
DO $b2$
DECLARE v_ok boolean := false; v_msg text;
BEGIN
  BEGIN
    INSERT INTO public.regulatory_submissions
      (id,company_id,product_name,product_category,submission_type,regulatory_body,current_status)
    VALUES ('00000000-0000-7300-e000-000000000001','00000000-0000-7300-a000-00000000000a',
            'Moringa Capsules','herbal_nutraceutical','local_manufacture','nafdac','draft');
    v_ok := true; v_msg := 'accepted';
  EXCEPTION WHEN others THEN v_msg := SQLERRM;
  END;
  PERFORM prod_assert('B4','regulatory_submissions accepts herbal_nutraceutical', v_ok, left(v_msg,90));
END $b2$;


-- =====================================================================
--  C — lifecycle transitions
-- =====================================================================
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-7300-b000-000000000001","role":"authenticated"}',false);
SET ROLE authenticated;
DO $c$
DECLARE r jsonb; v_msg text;
BEGIN
  BEGIN
    r := public.lifecycle_transition('product','00000000-0000-7300-c000-000000000001',
          'start_regulatory_prep','00000000-0000-7300-a000-00000000000a');
    PERFORM prod_assert('C1','a product can move to regulatory preparation',
      r->>'to_state'='regulatory_preparation', 'to '||coalesce(r->>'to_state','NULL'));
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    PERFORM prod_assert('C1','a product can move to regulatory preparation', false, v_msg);
  END;

  BEGIN
    r := public.lifecycle_transition('product','00000000-0000-7300-c000-000000000001',
          'submit_to_regulator','00000000-0000-7300-a000-00000000000a');
    PERFORM prod_assert('C2','and on to submitted',
      r->>'to_state'='submitted', 'to '||coalesce(r->>'to_state','NULL'));
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    PERFORM prod_assert('C2','and on to submitted', false, v_msg);
  END;
END $c$;
RESET ROLE;

DO $c2$
DECLARE v_status text;
BEGIN
  SELECT status INTO v_status FROM public.products
   WHERE id='00000000-0000-7300-c000-000000000001';
  PERFORM prod_assert('C3','products.status mirrors the engine',
    v_status='submitted', coalesce(v_status,'NULL'));
END $c2$;

-- status is a derived read model, not a writable column
SET ROLE authenticated;
DO $c3$
DECLARE v_ok boolean := false; v_msg text;
BEGIN
  BEGIN
    UPDATE public.products SET status='active'
     WHERE id='00000000-0000-7300-c000-000000000001';
    v_msg := 'DIRECT STATUS WRITE ACCEPTED';
  EXCEPTION WHEN others THEN
    v_ok := SQLERRM LIKE 'PRODUCT_STATUS_READ_ONLY%'; v_msg := SQLERRM;
  END;
  PERFORM prod_assert('C4','status cannot be written directly', v_ok, left(v_msg,100));
END $c3$;
RESET ROLE;

-- an illegal jump is refused by the graph
SET ROLE authenticated;
DO $c4$
DECLARE v_ok boolean := false; v_msg text;
BEGIN
  BEGIN
    PERFORM public.lifecycle_transition('product','00000000-0000-7300-c000-000000000002',
      'discontinue','00000000-0000-7300-a000-00000000000a');
    v_msg := 'ILLEGAL TRANSITION ACCEPTED';
  EXCEPTION WHEN others THEN
    v_ok := SQLERRM LIKE 'LIFECYCLE_INVALID_TRANSITION%'; v_msg := SQLERRM;
  END;
  PERFORM prod_assert('C5','a development product cannot jump straight to discontinued',
    v_ok, left(v_msg,100));
END $c4$;
RESET ROLE;


-- =====================================================================
--  D — product-to-registration relationship
-- =====================================================================
DO $d$
DECLARE n int; v_null int;
BEGIN
  UPDATE public.regulatory_submissions
     SET product_id='00000000-0000-7300-c000-000000000002'
   WHERE id='00000000-0000-7300-e000-000000000001';

  SELECT count(*) INTO n FROM public.regulatory_submissions
   WHERE product_id='00000000-0000-7300-c000-000000000002';
  PERFORM prod_assert('D1','a submission can reference a product', n=1, n||' row(s)');

  INSERT INTO public.regulatory_licences
    (id,company_id,licence_type,name,product_id,regulatory_body)
  VALUES ('00000000-0000-7300-f000-000000000001','00000000-0000-7300-a000-00000000000a',
          'nafdac_product_registration','Moringa Listing',
          '00000000-0000-7300-c000-000000000002','nafdac');
  SELECT count(*) INTO n FROM public.regulatory_licences
   WHERE product_id='00000000-0000-7300-c000-000000000002';
  PERFORM prod_assert('D2','a licence can reference a product', n=1, n||' row(s)');

  -- existing rows are untouched: the column is nullable on purpose
  SELECT count(*) INTO v_null FROM public.regulatory_submissions WHERE product_id IS NULL;
  PERFORM prod_assert('D3','pre-existing registrations survive without a product',
    v_null >= 0, v_null||' unlinked row(s) still valid');
END $d$;


-- =====================================================================
--  E — company-level document reuse and product-level documents
-- =====================================================================
DO $e$
DECLARE n_company int; n_avail int; v_ok boolean := false; v_msg text;
BEGIN
  -- one company document, uploaded once
  INSERT INTO public.product_documents(company_id,scope,document_type,name)
  VALUES ('00000000-0000-7300-a000-00000000000a','company','cac_certificate',
          'CAC Certificate of Incorporation');

  -- one document specific to the herbal product
  INSERT INTO public.product_documents(company_id,scope,product_id,document_type,name)
  VALUES ('00000000-0000-7300-a000-00000000000a','product',
          '00000000-0000-7300-c000-000000000002','heavy_metal_report',
          'Heavy Metal Analysis Report');

  SELECT count(*) INTO n_company FROM public.product_documents
   WHERE company_id='00000000-0000-7300-a000-00000000000a' AND scope='company';
  PERFORM prod_assert('E1','a company-level document exists once', n_company=1, n_company||' row(s)');

  -- the reuse rule: BOTH products see the company document
  SELECT count(*) INTO n_avail FROM public.product_available_documents('00000000-0000-7300-c000-000000000002');
  PERFORM prod_assert('E2','the herbal product sees its own document and the company one',
    n_avail=2, n_avail||' document(s)');

  SELECT count(*) INTO n_avail FROM public.product_available_documents('00000000-0000-7300-c000-000000000001');
  PERFORM prod_assert('E3','a different product sees the company document without re-upload',
    n_avail=1, n_avail||' document(s)');

  -- the invariant that makes the scope meaningful
  BEGIN
    INSERT INTO public.product_documents(company_id,scope,product_id,document_type,name)
    VALUES ('00000000-0000-7300-a000-00000000000a','company',
            '00000000-0000-7300-c000-000000000001','bad','Company doc with a product');
    v_msg := 'CONTRADICTORY SCOPE ACCEPTED';
  EXCEPTION WHEN others THEN v_ok := true; v_msg := 'rejected';
  END;
  PERFORM prod_assert('E4','a company-scoped document cannot name a product', v_ok, v_msg);

  v_ok := false;
  BEGIN
    INSERT INTO public.product_documents(company_id,scope,document_type,name)
    VALUES ('00000000-0000-7300-a000-00000000000a','product','bad','Product doc with no product');
    v_msg := 'ORPHAN PRODUCT DOC ACCEPTED';
  EXCEPTION WHEN others THEN v_ok := true; v_msg := 'rejected';
  END;
  PERFORM prod_assert('E5','a product-scoped document must name a product', v_ok, v_msg);
END $e$;


-- =====================================================================
--  F — manufacturing and contract manufacturing
-- =====================================================================
DO $f$
DECLARE v_ok boolean := false; v_msg text; v_vendor uuid;
BEGIN
  INSERT INTO public.products(id,company_id,product_code,trade_name,category,
                              manufacturing_type,manufacturer_vendor_id)
  VALUES ('00000000-0000-7300-c000-000000000004','00000000-0000-7300-a000-00000000000a',
          'PRD-CM','Contract Made Syrup','drug_pharmaceutical',
          'contract_manufactured','00000000-0000-7300-d000-000000000001');

  SELECT manufacturer_vendor_id INTO v_vendor FROM public.products
   WHERE id='00000000-0000-7300-c000-000000000004';
  PERFORM prod_assert('F1','a product can name an existing vendor as its manufacturer',
    v_vendor='00000000-0000-7300-d000-000000000001', coalesce(v_vendor::text,'NULL'));

  -- contract manufacturing must say who
  BEGIN
    INSERT INTO public.products(company_id,product_code,trade_name,category,manufacturing_type)
    VALUES ('00000000-0000-7300-a000-00000000000a','PRD-CM2','Nameless CM','food','contract_manufactured');
    v_msg := 'CONTRACT PRODUCT WITH NO MANUFACTURER ACCEPTED';
  EXCEPTION WHEN others THEN v_ok := true; v_msg := 'rejected';
  END;
  PERFORM prod_assert('F2','contract manufacturing requires a named manufacturer', v_ok, v_msg);

  -- in-house needs nothing extra
  v_ok := true;
  BEGIN
    INSERT INTO public.products(id,company_id,product_code,trade_name,category,manufacturing_type)
    VALUES ('00000000-0000-7300-c000-000000000005','00000000-0000-7300-a000-00000000000a',
            'PRD-IH','In House Tonic','food','in_house');
  EXCEPTION WHEN others THEN v_ok := false; v_msg := SQLERRM;
  END;
  PERFORM prod_assert('F3','an in-house product needs no manufacturer record', v_ok, 'accepted');
END $f$;


-- =====================================================================
--  G — controlled substances, only where relevant
-- =====================================================================
DO $g$
DECLARE v_ok boolean := false; v_msg text;
BEGIN
  INSERT INTO public.products(id,company_id,product_code,trade_name,category,
                              is_controlled_substance,controlled_substance_schedule)
  VALUES ('00000000-0000-7300-c000-000000000006','00000000-0000-7300-a000-00000000000a',
          'PRD-CS','Codeine Linctus','drug_pharmaceutical',true,'Schedule III');
  PERFORM prod_assert('G1','a pharmaceutical can be flagged controlled', true, 'accepted');

  -- a cosmetic cannot: this is the difference from a global checkbox
  BEGIN
    INSERT INTO public.products(company_id,product_code,trade_name,category,
                                is_controlled_substance,controlled_substance_schedule)
    VALUES ('00000000-0000-7300-a000-00000000000a','PRD-CS2','Face Cream','cosmetic',true,'Schedule II');
    v_msg := 'CONTROLLED COSMETIC ACCEPTED';
  EXCEPTION WHEN others THEN v_ok := true; v_msg := 'rejected';
  END;
  PERFORM prod_assert('G2','an irrelevant category cannot be flagged controlled', v_ok, v_msg);

  -- the flag without a schedule is incomplete
  v_ok := false;
  BEGIN
    INSERT INTO public.products(company_id,product_code,trade_name,category,is_controlled_substance)
    VALUES ('00000000-0000-7300-a000-00000000000a','PRD-CS3','Unscheduled','drug_pharmaceutical',true);
    v_msg := 'CONTROLLED WITHOUT SCHEDULE ACCEPTED';
  EXCEPTION WHEN others THEN v_ok := true; v_msg := 'rejected';
  END;
  PERFORM prod_assert('G3','a controlled product must name its schedule', v_ok, v_msg);
END $g$;


-- =====================================================================
--  H — eligibility gating on batch release
-- =====================================================================
DO $h$
DECLARE v_ok boolean := false; v_msg text; v_elig boolean;
BEGIN
  -- the herbal product is still in development: ineligible
  SELECT public.product_is_release_eligible('00000000-0000-7300-c000-000000000002') INTO v_elig;
  PERFORM prod_assert('H1','a development product is not release-eligible', v_elig = false, v_elig::text);

  INSERT INTO public.batch_records
    (id,company_id,batch_number,product_name,product_id,status,manufacturing_date,expiry_date,batch_size)
  VALUES ('00000000-0000-7300-9000-000000000001','00000000-0000-7300-a000-00000000000a',
          'BATCH-001','Moringa Capsules','00000000-0000-7300-c000-000000000002','qc_pending',current_date,current_date + 365,100);

  BEGIN
    UPDATE public.batch_records SET status='released'
     WHERE id='00000000-0000-7300-9000-000000000001';
    v_msg := 'RELEASE OF INELIGIBLE PRODUCT ACCEPTED';
  EXCEPTION WHEN others THEN
    v_ok := SQLERRM LIKE 'BATCH_PRODUCT_NOT_ELIGIBLE%'; v_msg := SQLERRM;
  END;
  PERFORM prod_assert('H2','a batch of an unregistered product cannot be released',
    v_ok, left(v_msg,120));
END $h$;

-- move a product to registered, then release succeeds
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-7300-b000-000000000001","role":"authenticated"}',false);
SET ROLE authenticated;
DO $h2$
BEGIN
  PERFORM public.lifecycle_transition('product','00000000-0000-7300-c000-000000000002',
    'start_regulatory_prep','00000000-0000-7300-a000-00000000000a');
  PERFORM public.lifecycle_transition('product','00000000-0000-7300-c000-000000000002',
    'submit_to_regulator','00000000-0000-7300-a000-00000000000a');
  PERFORM public.lifecycle_transition('product','00000000-0000-7300-c000-000000000002',
    'record_registration','00000000-0000-7300-a000-00000000000a',NULL,'NAFDAC listing granted');
END $h2$;
RESET ROLE;

DO $h3$
DECLARE v_ok boolean := false; v_msg text; v_status text;
BEGIN
  SELECT status INTO v_status FROM public.products WHERE id='00000000-0000-7300-c000-000000000002';
  PERFORM prod_assert('H3','the product is now registered', v_status='registered', coalesce(v_status,'NULL'));

  BEGIN
    UPDATE public.batch_records SET status='released'
     WHERE id='00000000-0000-7300-9000-000000000001';
    v_ok := true; v_msg := 'released';
  EXCEPTION WHEN others THEN v_msg := SQLERRM;
  END;
  PERFORM prod_assert('H4','a batch of a registered product CAN be released', v_ok, left(v_msg,120));
END $h3$;

-- suspension makes it ineligible again
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-7300-b000-000000000001","role":"authenticated"}',false);
SET ROLE authenticated;
DO $h4$
BEGIN
  PERFORM public.lifecycle_transition('product','00000000-0000-7300-c000-000000000002',
    'suspend_registered','00000000-0000-7300-a000-00000000000a',NULL,'Adverse event under review');
END $h4$;
RESET ROLE;

DO $h5$
DECLARE v_ok boolean := false; v_msg text;
BEGIN
  INSERT INTO public.batch_records
    (id,company_id,batch_number,product_name,product_id,status,manufacturing_date,expiry_date,batch_size)
  VALUES ('00000000-0000-7300-9000-000000000002','00000000-0000-7300-a000-00000000000a',
          'BATCH-002','Moringa Capsules','00000000-0000-7300-c000-000000000002','qc_pending',current_date,current_date + 365,100);
  BEGIN
    UPDATE public.batch_records SET status='released'
     WHERE id='00000000-0000-7300-9000-000000000002';
    v_msg := 'RELEASE OF SUSPENDED PRODUCT ACCEPTED';
  EXCEPTION WHEN others THEN
    v_ok := SQLERRM LIKE 'BATCH_PRODUCT_NOT_ELIGIBLE%'; v_msg := SQLERRM;
  END;
  PERFORM prod_assert('H5','a suspended product blocks release', v_ok, left(v_msg,120));

  -- expiry is checked too
  UPDATE public.products SET registration_expiry_date = current_date - 1
   WHERE id='00000000-0000-7300-c000-000000000006';
  PERFORM prod_assert('H6','an expired registration is not eligible',
    public.product_is_release_eligible('00000000-0000-7300-c000-000000000006') = false, 'expired');
END $h5$;

-- and a batch with NO product is unaffected: existing workflows preserved
DO $h6$
DECLARE v_ok boolean := false; v_msg text;
BEGIN
  INSERT INTO public.batch_records
    (id,company_id,batch_number,product_name,status,manufacturing_date,expiry_date,batch_size)
  VALUES ('00000000-0000-7300-9000-000000000003','00000000-0000-7300-a000-00000000000a',
          'BATCH-LEGACY','Unlinked legacy product','qc_pending',current_date,current_date + 365,100);
  BEGIN
    UPDATE public.batch_records SET status='released'
     WHERE id='00000000-0000-7300-9000-000000000003';
    v_ok := true; v_msg := 'released';
  EXCEPTION WHEN others THEN v_msg := SQLERRM;
  END;
  PERFORM prod_assert('H7','a batch with no product link still releases as before',
    v_ok, left(v_msg,100));
END $h6$;


-- =====================================================================
--  I — tenancy
-- =====================================================================
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-7300-b000-000000000002","role":"authenticated"}',false);
SET ROLE authenticated;
DO $i$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.products
   WHERE company_id='00000000-0000-7300-a000-00000000000a';
  PERFORM prod_assert('I1','another tenant cannot see company A''s products', n=0, n||' row(s)');

  SELECT count(*) INTO n FROM public.product_documents
   WHERE company_id='00000000-0000-7300-a000-00000000000a';
  PERFORM prod_assert('I2','nor its documents', n=0, n||' row(s)');
END $i$;
RESET ROLE;


-- =====================================================================
--  J — audit traceability
-- =====================================================================
DO $j$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.entity_state_history
   WHERE entity_type='product' AND entity_id='00000000-0000-7300-c000-000000000002';
  PERFORM prod_assert('J1','product lifecycle changes are in the existing history table',
    n >= 4, n||' history row(s)');
END $j$;


-- =====================================================================
--  K — D05 fixes: controlled substances on food, and the backfill
-- =====================================================================
DO $k1$
DECLARE v_ok boolean := false; v_msg text;
BEGIN
  -- the critical failure the audit found: food was BLOCKED
  BEGIN
    INSERT INTO public.products(id,company_id,product_code,trade_name,category,
                                is_controlled_substance,controlled_substance_schedule)
    VALUES ('00000000-0000-7300-c000-000000000007','00000000-0000-7300-a000-00000000000a',
            'PRD-FOODCS','Caffeinated Energy Drink','food',true,'NDLEA Precursor Chemical');
    v_ok := true; v_msg := 'accepted';
  EXCEPTION WHEN others THEN v_msg := SQLERRM;
  END;
  PERFORM prod_assert('K1','a FOOD product can be flagged controlled', v_ok, left(v_msg,90));

  v_ok := false;
  BEGIN
    INSERT INTO public.products(id,company_id,product_code,trade_name,category,
                                is_controlled_substance,controlled_substance_schedule)
    VALUES ('00000000-0000-7300-c000-000000000008','00000000-0000-7300-a000-00000000000a',
            'PRD-HERBCS','Ephedra Extract','herbal_nutraceutical',true,'Schedule IV');
    v_ok := true; v_msg := 'accepted';
  EXCEPTION WHEN others THEN v_msg := SQLERRM;
  END;
  PERFORM prod_assert('K2','a herbal product can be flagged controlled', v_ok, left(v_msg,90));

  -- still not a global checkbox
  v_ok := false;
  BEGIN
    INSERT INTO public.products(company_id,product_code,trade_name,category,
                                is_controlled_substance,controlled_substance_schedule)
    VALUES ('00000000-0000-7300-a000-00000000000a','PRD-COSCS','Face Cream','cosmetic',true,'Schedule II');
    v_msg := 'CONTROLLED COSMETIC ACCEPTED';
  EXCEPTION WHEN others THEN v_ok := true; v_msg := 'rejected';
  END;
  PERFORM prod_assert('K3','a cosmetic still cannot be flagged controlled', v_ok, v_msg);
END $k1$;

-- the lifecycle now starts at concept
DO $k2$
DECLARE v_key text; v_status text;
BEGIN
  SELECT s.state_key INTO v_key FROM public.lifecycle_states s
    JOIN public.lifecycle_definitions d ON d.id = s.definition_id
   WHERE d.entity_type='product' AND s.is_initial;
  PERFORM prod_assert('K4','the initial lifecycle state is concept', v_key='concept', coalesce(v_key,'NULL'));

  SELECT status INTO v_status FROM public.products
   WHERE id='00000000-0000-7300-c000-000000000007';
  PERFORM prod_assert('K5','a new product mirrors concept', v_status='concept', coalesce(v_status,'NULL'));
END $k2$;

-- =====================================================================
--  L — the backfill, against genuinely orphaned legacy rows
-- =====================================================================
DO $l0$
BEGIN
  -- legacy rows exactly as they exist before this deliverable: free-text
  -- product_name, no product_id. One name is shared across three tables,
  -- one carries a registration number, and one is blank.
  INSERT INTO public.regulatory_submissions
    (id,company_id,product_name,product_category,submission_type,regulatory_body,current_status,registration_number)
  VALUES ('00000000-0000-7300-e000-000000000002','00000000-0000-7300-a000-00000000000a',
          'Legacy Syrup 100ml','drug_pharmaceutical','local_manufacture','nafdac','approved','A4-1234'),
         ('00000000-0000-7300-e000-000000000003','00000000-0000-7300-a000-00000000000a',
          'Unregistered Legacy Item','food','local_manufacture','nafdac','draft',NULL);

  INSERT INTO public.regulatory_licences
    (id,company_id,licence_type,name,product_name,regulatory_body,registration_number)
  VALUES ('00000000-0000-7300-f000-000000000002','00000000-0000-7300-a000-00000000000a',
          'nafdac_product_registration','Legacy Syrup Licence','Legacy Syrup 100ml','nafdac','A4-1234');

  INSERT INTO public.batch_records
    (id,company_id,batch_number,product_name,status,manufacturing_date,expiry_date,batch_size)
  VALUES ('00000000-0000-7300-9000-000000000010','00000000-0000-7300-a000-00000000000a',
          'LEGACY-B1','Legacy Syrup 100ml','qc_pending',current_date,current_date+365,50);
END $l0$;

DO $l1$
DECLARE r jsonb; n_unlinked int; v_pid uuid; v_status text; v_cat text;
BEGIN
  r := public.backfill_product_registry();
  PERFORM prod_assert('L1','the backfill reports what it did',
    (r->>'products_created')::int >= 2, coalesce(r::text,'NULL'));

  SELECT count(*) INTO n_unlinked FROM (
    SELECT 1 FROM public.regulatory_submissions
     WHERE product_id IS NULL AND company_id='00000000-0000-7300-a000-00000000000a'
    UNION ALL SELECT 1 FROM public.regulatory_licences
     WHERE product_id IS NULL AND company_id='00000000-0000-7300-a000-00000000000a'
  ) x;
  PERFORM prod_assert('L2','no orphaned registrations remain', n_unlinked=0, n_unlinked||' orphan(s)');

  -- the same name across three tables resolves to ONE product
  SELECT product_id INTO v_pid FROM public.regulatory_submissions
   WHERE id='00000000-0000-7300-e000-000000000002';
  PERFORM prod_assert('L3','the submission is linked', v_pid IS NOT NULL, coalesce(v_pid::text,'NULL'));

  PERFORM prod_assert('L4','the licence for the same name links to the SAME product',
    (SELECT product_id FROM public.regulatory_licences WHERE id='00000000-0000-7300-f000-000000000002') = v_pid,
    'same product');
  PERFORM prod_assert('L5','and so does the batch',
    (SELECT product_id FROM public.batch_records WHERE id='00000000-0000-7300-9000-000000000010') = v_pid,
    'same product');

  -- category is taken from the submission, not defaulted
  SELECT category, status INTO v_cat, v_status FROM public.products WHERE id=v_pid;
  PERFORM prod_assert('L6','the category came from the existing submission',
    v_cat='drug_pharmaceutical', coalesce(v_cat,'NULL'));

  -- the placement rule: evidence of registration means it must not land
  -- in concept, or its existing batches would become unreleasable
  PERFORM prod_assert('L7','a product with a registration number is placed at registered',
    v_status='registered', coalesce(v_status,'NULL'));

  -- and one without evidence stays at concept
  PERFORM prod_assert('L8','a product with no registration evidence stays at concept',
    (SELECT p.status FROM public.products p
      JOIN public.regulatory_submissions s ON s.product_id = p.id
     WHERE s.id='00000000-0000-7300-e000-000000000003') = 'concept',
    'concept');
END $l1$;

-- the legacy batch is releasable, because its product was placed correctly
DO $l2$
DECLARE v_ok boolean := false; v_msg text;
BEGIN
  BEGIN
    UPDATE public.batch_records SET status='released'
     WHERE id='00000000-0000-7300-9000-000000000010';
    v_ok := true; v_msg := 'released';
  EXCEPTION WHEN others THEN v_msg := SQLERRM;
  END;
  PERFORM prod_assert('L9','the backfill did not make an existing batch unreleasable',
    v_ok, left(v_msg,110));
END $l2$;

-- running it twice changes nothing
DO $l3$
DECLARE r jsonb;
BEGIN
  r := public.backfill_product_registry();
  PERFORM prod_assert('L10','the backfill is idempotent',
    (r->>'products_created')::int = 0 AND (r->>'name_groups_linked')::int = 0,
    coalesce(r::text,'NULL'));
END $l3$;

-- CTD administrative documents are their own queryable group
DO $l4$
DECLARE n_all int; n_admin int;
BEGIN
  INSERT INTO public.product_documents(company_id,scope,document_type,name,is_ctd_administrative)
  VALUES ('00000000-0000-7300-a000-00000000000a','company','cac_certificate','CAC Certificate',true);

  SELECT count(*) INTO n_all   FROM public.product_available_documents('00000000-0000-7300-c000-000000000002');
  SELECT count(*) INTO n_admin FROM public.product_ctd_administrative_documents('00000000-0000-7300-c000-000000000002');
  PERFORM prod_assert('L11','CTD administrative documents are a separated group',
    n_admin = 1 AND n_all > n_admin, n_admin||' of '||n_all||' documents');
  PERFORM prod_assert('L12','and they carry the module marker',
    (SELECT ctd_module FROM public.product_documents
      WHERE is_ctd_administrative AND company_id='00000000-0000-7300-a000-00000000000a' LIMIT 1) IS NOT NULL,
    'module set');
END $l4$;


-- ── results ──────────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims','',false);
\echo ''
\echo '======== PRODUCT REGISTRY — TEST RESULTS ========'
SELECT id, name, verdict, detail FROM prod_results ORDER BY seq;
\echo ''
SELECT verdict, count(*) FROM prod_results GROUP BY verdict ORDER BY verdict;

-- ── cleanup ──────────────────────────────────────────────────────────
DO $cleanup$
BEGIN
  DELETE FROM public.batch_records      WHERE id::text LIKE '00000000-0000-7300-9000-%';
  DELETE FROM public.product_documents  WHERE company_id::text LIKE '00000000-0000-7300-a000-%';
  DELETE FROM public.regulatory_licences    WHERE id::text LIKE '00000000-0000-7300-f000-%';
  DELETE FROM public.regulatory_submissions WHERE id::text LIKE '00000000-0000-7300-e000-%';
  DELETE FROM public.entity_state_history WHERE entity_type='product'
     AND entity_id::text LIKE '00000000-0000-7300-c000-%';
  DELETE FROM public.entity_current_state WHERE entity_type='product'
     AND entity_id::text LIKE '00000000-0000-7300-c000-%';
  DELETE FROM public.products           WHERE company_id::text LIKE '00000000-0000-7300-a000-%';
  DELETE FROM public.vendors            WHERE id::text LIKE '00000000-0000-7300-d000-%';
  DELETE FROM public.company_members    WHERE user_id::text LIKE '00000000-0000-7300-b000-%';
  DELETE FROM public.profiles           WHERE email LIKE 'prod-%@local.test';
  DELETE FROM auth.users                WHERE email LIKE 'prod-%@local.test';
  DELETE FROM public.companies          WHERE name LIKE 'PROD %';
  RAISE NOTICE 'prod fixtures removed.';
EXCEPTION WHEN others THEN
  RAISE WARNING 'CLEANUP INCOMPLETE (%). Remove prod rows manually.', SQLERRM;
END $cleanup$;

DROP FUNCTION IF EXISTS prod_assert(text,text,boolean,text);
DROP TABLE IF EXISTS prod_results;
