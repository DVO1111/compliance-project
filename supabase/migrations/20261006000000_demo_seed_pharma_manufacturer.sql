-- =====================================================================
--  WEEK 3 / ITEM 11 — SEEDED DEMONSTRATION DATA
-- =====================================================================
--  "The MVP definition requires this explicitly and nobody has been
--  assigned it until now. The walkthrough is in early October and seeded
--  data is not something to build the week before."
--
--  FOUR DECISIONS, EACH DIFFERENT FROM HOW THIS REPOSITORY HAS SEEDED
--  DEMO DATA BEFORE
--  ------------------------------------------------------------------
--
--  1. IT IS A FUNCTION, NOT A MIGRATION BODY.
--     20260603600000_seed_nasco_demo_data.sql runs on every deployment,
--     which means it creates demo data in production. This migration
--     only DEFINES demo_seed_pharma_manufacturer(); seeding is then a
--     deliberate act:
--
--         SELECT public.demo_seed_pharma_manufacturer('<actor uuid>');
--
--     Nothing is created by applying this migration.
--
--  2. IT NAMES ITS OWN COMPANY.
--     The NASCO seed picks its target with
--     `SELECT id FROM companies ORDER BY created_at LIMIT 1` — whatever
--     company happens to be oldest, which on a production database is a
--     real customer. This one uses a fixed id and refuses to touch a
--     company that is not marked as demonstration data.
--
--  3. EVERY DATE IS RELATIVE TO THE SEED RUN.
--     The NASCO seed hardcodes 2024 dates, which now read as two years
--     stale. Everything here is derived from p_as_of (default
--     current_date), so re-running before a walkthrough refreshes the
--     whole timeline. "Dates that contradict each other, such as a lot
--     released before it was received" is a NOT DONE IF, so the
--     chronology is constructed rather than typed: manufacture precedes
--     receipt, receipt precedes sampling, sampling precedes release, and
--     the function asserts that at the end.
--
--  4. IT GOES THROUGH THE GATES, NOT AROUND THEM.
--     Lots are received into quarantine by the item 03 trigger, sampled
--     and released through lifecycle_transition(), with real test
--     results computed by material_test_record_result() and real
--     certificates verified by material_coa_verify(). The release
--     signature is a genuine electronic_signatures row whose record_hash
--     is computed by the platform's own function, so
--     lifecycle_consume_signature() accepts it on the merits.
--
--     That is deliberate: if this seed ran, items 03 to 07 work. A seed
--     that INSERTed `status = 'approved'` would prove nothing and would
--     be rejected by the guard triggers anyway.
--
--  NO CREDENTIALS ARE CREATED
--  --------------------------
--  p_actor_id is required and must be a real user. The seed creates no
--  synthetic accounts and sets no passwords, so it cannot leave a known
--  login behind in any environment. Analyst names on test results are
--  free text — realistic to an audience, attached to no identity.
--
--  SUPPLIER NAMES ARE FICTIONAL, ON PURPOSE
--  ----------------------------------------
--  One demo supplier is disqualified and one is conditionally qualified,
--  because item 04's receipt gate is only demonstrable if someone is in
--  those states. Naming a real supplier in them would be a false
--  statement about an identifiable company, so every supplier below is
--  invented. The materials, dosage forms, pharmacopoeial parameters and
--  limits are real; the trading names are not.
-- =====================================================================

--  The demonstration company's fixed id. Fixed so the seed is
--  idempotent and so a reset can be scoped to it and nothing else.
CREATE OR REPLACE FUNCTION public.demo_company_id()
RETURNS uuid LANGUAGE sql IMMUTABLE SET search_path = pg_temp
AS $$ SELECT 'd0000000-0000-4000-a000-000000000001'::uuid $$;

--  The marker that makes a company safe to reset. Written into
--  company_settings.project_name, checked before anything is deleted.
CREATE OR REPLACE FUNCTION public.demo_marker()
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = pg_temp
AS $$ SELECT 'CRIATEUR_DEMO_PHARMA' $$;


-- ── Reset ────────────────────────────────────────────────────────────
--  Unwinds the demo company's materials data in dependency order.
--
--  This deletes evidence — test results, signature consumptions, state
--  history — which is exactly what must never happen to a real company.
--  So it refuses outright unless the company carries the demo marker.
--  The order matters and was not guessable: signature consumptions hold
--  ON DELETE RESTRICT references to entity_state_history, so a released
--  lot cannot be removed until its consumption is, and electronic
--  signatures themselves cannot be deleted at all — the rows are left
--  in place, orphaned but immutable, which is the correct outcome for a
--  signature.
CREATE OR REPLACE FUNCTION public.demo_reset_pharma_manufacturer(
  p_company_id uuid DEFAULT public.demo_company_id()
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_marker text; v_lots integer;
BEGIN
  IF NOT public.app_is_service_context() THEN
    RAISE EXCEPTION 'DEMO_SEED_FORBIDDEN: demo seeding and reset run in the service context only'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT project_name INTO v_marker FROM public.company_settings WHERE company_id = p_company_id;
  IF coalesce(v_marker,'') <> public.demo_marker() THEN
    RAISE EXCEPTION 'DEMO_RESET_REFUSED: company % is not marked as demonstration data (expected project_name %), refusing to delete anything',
      p_company_id, public.demo_marker()
      USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*) INTO v_lots FROM public.material_lots WHERE company_id = p_company_id;

  DELETE FROM public.material_lot_rejections      WHERE company_id = p_company_id;
  DELETE FROM public.material_lot_release_records WHERE company_id = p_company_id;
  DELETE FROM public.material_test_results        WHERE company_id = p_company_id;
  DELETE FROM public.material_test_definitions     WHERE company_id = p_company_id;
  DELETE FROM public.material_qa_authorities       WHERE company_id = p_company_id;
  DELETE FROM public.material_coa_discrepancies    WHERE company_id = p_company_id;
  DELETE FROM public.material_certificates_of_analysis WHERE company_id = p_company_id;
  DELETE FROM public.material_specification_parameters
   WHERE specification_id IN (SELECT id FROM public.material_specifications WHERE company_id = p_company_id);
  DELETE FROM public.material_specifications       WHERE company_id = p_company_id;
  DELETE FROM public.material_lot_alerts           WHERE company_id = p_company_id;
  DELETE FROM public.material_alert_policies       WHERE company_id = p_company_id;
  DELETE FROM public.material_notification_recipients WHERE company_id = p_company_id;

  --  The traceability chain, innermost first.
  DELETE FROM public.electronic_signature_consumptions
   WHERE history_id IN (SELECT id FROM public.entity_state_history
                         WHERE company_id = p_company_id
                           AND entity_type IN ('material_lot','supplier','product'));
  DELETE FROM public.entity_state_history
   WHERE company_id = p_company_id AND entity_type IN ('material_lot','supplier','product');
  DELETE FROM public.entity_current_state
   WHERE company_id = p_company_id AND entity_type IN ('material_lot','supplier','product');

  DELETE FROM public.material_lots WHERE company_id = p_company_id;
  DELETE FROM public.suppliers     WHERE company_id = p_company_id;
  DELETE FROM public.materials     WHERE company_id = p_company_id;
  DELETE FROM public.products      WHERE company_id = p_company_id;
  DELETE FROM public.company_numbering_formats WHERE company_id = p_company_id;

  RETURN jsonb_build_object('reset', true, 'lots_removed', v_lots,
    'note', 'Electronic signatures are immutable and were left in place.');
END $$;

COMMENT ON FUNCTION public.demo_reset_pharma_manufacturer(uuid) IS
  'Removes the demonstration company''s materials data. Refuses any company not carrying the demo marker in company_settings.project_name, because it deletes evidence.';

REVOKE ALL ON FUNCTION public.demo_reset_pharma_manufacturer(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.demo_reset_pharma_manufacturer(uuid) TO service_role;


-- ── Seed ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.demo_seed_pharma_manufacturer(
  p_actor_id   uuid,
  p_as_of      date DEFAULT current_date,
  p_company_id uuid DEFAULT public.demo_company_id()
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  c            uuid := p_company_id;
  v_signer     record;
  m            jsonb := '{}'::jsonb;   -- material code -> id
  s            jsonb := '{}'::jsonb;   -- supplier code -> id
  sp           jsonb := '{}'::jsonb;   -- material code -> specification id
  r            record;
  v_id         uuid;
  v_lot        uuid;
  v_coa        uuid;
  v_sig        uuid;
  v_hash       text;
  v_def        uuid;
  v_counts     jsonb;
BEGIN
  IF NOT public.app_is_service_context() THEN
    RAISE EXCEPTION 'DEMO_SEED_FORBIDDEN: demo seeding runs in the service context only'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'DEMO_SEED_NO_ACTOR: an actor is required. The seed creates no accounts and sets no passwords, so it needs a real user to attribute records to.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT pr.id, coalesce(pr.full_name, pr.email) AS nm, pr.email
    INTO v_signer FROM public.profiles pr WHERE pr.id = p_actor_id;
  IF v_signer.id IS NULL THEN
    RAISE EXCEPTION 'DEMO_SEED_NO_PROFILE: user % has no profile', p_actor_id
      USING ERRCODE = 'P0002';
  END IF;

  -- ── 1. The company ────────────────────────────────────────────────
  --  A fictional manufacturer, a real manufacturing location (Ota in
  --  Ogun State is Nigeria's pharmaceutical cluster), and a scale that
  --  matches a mid-sized WHO-GMP tablet and capsule plant.
  INSERT INTO public.companies(id, name)
  VALUES (c, 'Lagoon Pharmaceuticals Limited')
  ON CONFLICT (id) DO UPDATE SET name = excluded.name;

  INSERT INTO public.company_settings(company_id, name, tagline, project_name)
  VALUES (c, 'Lagoon Pharmaceuticals Limited',
          'WHO-GMP oral solid dosage manufacturing · Idiroko Road, Ota, Ogun State · 3 lines, 180 staff, 1.4bn tablets per year',
          public.demo_marker())
  ON CONFLICT (company_id) DO UPDATE
    SET name = excluded.name, tagline = excluded.tagline, project_name = excluded.project_name;

  --  Reset after the marker is in place, so a re-run refreshes rather
  --  than duplicating, and so the reset's safety check can pass.
  PERFORM public.demo_reset_pharma_manufacturer(c);

  INSERT INTO public.company_members(company_id, user_id, role)
  VALUES (c, p_actor_id, 'admin') ON CONFLICT DO NOTHING;

  --  Give the seed an identity for the rest of its work.
  --
  --  auth.uid() is NULL in the service context, and material_lot_release()
  --  attributes the release to auth.uid(). Without this, every release
  --  would be attributed to nobody and
  --  lifecycle_consume_signature() would reject the signature as
  --  LIFECYCLE_SIGNATURE_MISMATCH — the signature names a signer, the
  --  transition named NULL. Which is the check doing its job: a signed
  --  release has to be signed BY someone.
  --
  --  app_is_service_context() keys off the role rather than the JWT
  --  (see its definition), so setting claims gives the seed an actor
  --  without giving up the service context the reset above needs.
  --  Transaction-local, so it reverts when the seed commits.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_actor_id::text, 'role', 'authenticated')::text, true);

  INSERT INTO public.company_numbering_formats
    (company_id, scope, pattern, prefix, seq_width, seq_reset)
  VALUES (c, 'material_lot', '{PREFIX}/{YY}/{SEQ}', 'LPL-RM', 4, 'yearly')
  ON CONFLICT (company_id, scope) DO UPDATE
    SET pattern = excluded.pattern, prefix = excluded.prefix,
        seq_width = excluded.seq_width, next_seq = 1, seq_period = NULL;

  INSERT INTO public.material_alert_policies(company_id, retest_lead_days, expiry_lead_days)
  VALUES (c, 45, 90) ON CONFLICT (company_id) DO UPDATE
    SET retest_lead_days = excluded.retest_lead_days, expiry_lead_days = excluded.expiry_lead_days;

  INSERT INTO public.material_qa_authorities(company_id, user_id, designated_by)
  VALUES (c, p_actor_id, p_actor_id) ON CONFLICT DO NOTHING;

  -- ── 2. Suppliers ──────────────────────────────────────────────────
  FOR r IN SELECT * FROM (VALUES
    ('SUP-HBL','Harbourline Chemicals Limited','IN','qa@harbourline.example','API supplier, audited 2 years ago','qualify'),
    ('SUP-YFA','Yangtze Fine Actives Co. Limited','CN','export@yfa.example','API supplier, WHO prequalified site','qualify'),
    ('SUP-SEN','Sahel Excipients Nigeria Limited','NG','sales@sahelexcipients.example','Local excipient distributor','qualify'),
    ('SUP-MPI','Meridian Pharma Inputs BV','NL','orders@meridianinputs.example','Conditional: single-source for povidone, audit overdue','qualify_conditional'),
    ('SUP-NGT','Northgate Trading Company','CN','info@northgatetrading.example','Disqualified after 2 out-of-specification consignments','disqualify')
  ) AS v(code,nm,cty,eml,note,action)
  LOOP
    INSERT INTO public.suppliers(company_id, name, code, country, contact_email, notes, created_by)
    VALUES (c, r.nm, r.code, r.cty, r.eml, r.note, p_actor_id)
    RETURNING id INTO v_id;
    s := s || jsonb_build_object(r.code, v_id);

    --  Through the engine, so each supplier has a qualification history
    --  rather than a status someone typed.
    PERFORM public.lifecycle_transition('supplier', v_id, r.action, c, p_actor_id,
      CASE r.action
        WHEN 'disqualify' THEN 'Disqualified following two out-of-specification consignments and a failed corrective action response.'
        WHEN 'qualify_conditional' THEN 'Conditionally qualified: sole source for povidone K30, on-site audit overdue by 4 months.'
        ELSE 'Qualified following satisfactory on-site audit and three conforming consignments.'
      END);
  END LOOP;

  -- ── 3. Products ───────────────────────────────────────────────────
  FOR r IN SELECT * FROM (VALUES
    ('LPL-PCM-500','Lagocet 500','Paracetamol','Tablet','500 mg','10 x 10 blister',36,'A4-2301','active'),
    ('LPL-ALU-2012','Lagomal 20/120','Artemether / Lumefantrine','Tablet','20 mg / 120 mg','6 x 4 blister',24,'A4-2318','active'),
    ('LPL-AMX-250','Lagomox 250','Amoxicillin trihydrate','Capsule','250 mg','10 x 10 blister',24,'A4-2344','active'),
    ('LPL-MET-500','Lagoformin 500','Metformin hydrochloride','Tablet','500 mg','3 x 10 blister',36,'A4-2402','registered'),
    ('LPL-ZNS-20','Lagozinc 20','Zinc sulfate monohydrate','Dispersible tablet','20 mg','10 x 10 blister',24,NULL,'submitted')
  ) AS v(code,trade,generic,form,strength,pack,shelf,nafdac,target)
  LOOP
    INSERT INTO public.products(company_id, product_code, trade_name, generic_name, category,
        manufacturing_type, manufacturing_site, dosage_form, strength, pack_size,
        shelf_life_months, nafdac_number, is_controlled_substance, created_by,
        registration_expiry_date)
    VALUES (c, r.code, r.trade, r.generic, 'drug_pharmaceutical',
        'in_house', 'Idiroko Road, Ota, Ogun State', r.form, r.strength, r.pack,
        r.shelf, r.nafdac, false, p_actor_id,
        CASE WHEN r.nafdac IS NULL THEN NULL ELSE p_as_of + 500 END)
    RETURNING id INTO v_id;

    --  Walked forward through the engine, so each product has a real
    --  regulatory history and the dossier screens have something to show.
    PERFORM public.lifecycle_transition('product', v_id, 'start_regulatory_prep', c, p_actor_id);
    PERFORM public.lifecycle_transition('product', v_id, 'submit_to_regulator', c, p_actor_id);
    IF r.target IN ('registered','active') THEN
      PERFORM public.lifecycle_transition('product', v_id, 'record_registration', c, p_actor_id,
        format('NAFDAC registration %s granted.', r.nafdac));
    END IF;
    IF r.target = 'active' THEN
      PERFORM public.lifecycle_transition('product', v_id, 'activate', c, p_actor_id);
    END IF;
  END LOOP;

  -- ── 4. Materials ──────────────────────────────────────────────────
  FOR r IN SELECT * FROM (VALUES
    ('PCM-API','Paracetamol BP','active_ingredient','critical',  730,'Store below 25 °C, protected from light and moisture',15,25,'kg',false),
    ('ART-API','Artemether USP','active_ingredient','critical',  365,'Store below 25 °C, protected from light',15,25,'kg',false),
    ('LUM-API','Lumefantrine USP','active_ingredient','critical',365,'Store below 25 °C, protected from light',15,25,'kg',false),
    ('AMX-API','Amoxicillin Trihydrate BP','active_ingredient','critical',365,'Store at 2–8 °C, protected from moisture',2,8,'kg',false),
    ('MCC-102','Microcrystalline Cellulose PH-102 BP','excipient','major',1095,'Store in a dry place below 30 °C',NULL,30,'kg',false),
    ('STA-MAI','Maize Starch BP','excipient','major',              730,'Store in a dry place below 30 °C',NULL,30,'kg',false),
    ('MGS-VEG','Magnesium Stearate BP (vegetable grade)','excipient','standard',1095,'Store in a dry place below 30 °C',NULL,30,'kg',false),
    ('PVP-K30','Povidone K30 BP','excipient','standard',          1095,'Store in a dry place below 30 °C, hygroscopic',NULL,30,'kg',true)
  ) AS v(code,nm,typ,crit,retest,storage,tmin,tmax,uom,fp)
  LOOP
    INSERT INTO public.materials(company_id, code, name, material_type, criticality,
        requires_further_processing, further_processing_note, specification_reference,
        specification_version, retest_period_days, storage_conditions,
        storage_temperature_min_c, storage_temperature_max_c, unit_of_measure, created_by)
    VALUES (c, r.code, r.nm, r.typ, r.crit,
        r.fp, CASE WHEN r.fp THEN 'Requires sieving through a 500 µm screen before dispensing.' END,
        'SPEC-'||r.code, '2.0', r.retest, r.storage, r.tmin, r.tmax, r.uom, p_actor_id)
    RETURNING id INTO v_id;
    m := m || jsonb_build_object(r.code, v_id);

    INSERT INTO public.material_specifications(company_id, material_id, version, reference,
        status, effective_date, created_by)
    VALUES (c, v_id, '2.0', 'SPEC-'||r.code||'-v2', 'effective', p_as_of - 400, p_actor_id)
    RETURNING id INTO v_lot;   -- reusing v_lot as a scratch id
    sp := sp || jsonb_build_object(r.code, v_lot);
  END LOOP;

  -- ── 5. Specifications: identity, assay, microbial, physical ───────
  --  Real pharmacopoeial parameters and limits. The four categories the
  --  item names are all present for every material, because a
  --  specification missing microbial limits is not a specification an
  --  auditor would accept.
  FOR r IN SELECT * FROM (VALUES
    -- material, parameter, unit, limit_type, min, max, expected, critical, order
    ('PCM-API','Description',             NULL,'exact_text',NULL,  NULL,  'White crystalline powder', false, 10),
    ('PCM-API','Identification (IR)',     NULL,'complies',  NULL,  NULL,  NULL,                       true , 20),
    ('PCM-API','Assay (anhydrous basis)', '%', 'range',     99.0,  101.0, NULL,                       true , 30),
    ('PCM-API','Loss on drying',          '%', 'max',       NULL,  0.5,   NULL,                       false, 40),
    ('PCM-API','4-Aminophenol',           '%', 'max',       NULL,  0.005, NULL,                       true , 50),
    ('PCM-API','Heavy metals',            'ppm','max',      NULL,  20.0,  NULL,                       true , 60),
    ('PCM-API','Total aerobic microbial count','cfu/g','max',NULL, 1000.0,NULL,                       true , 70),
    ('PCM-API','Total yeasts and moulds', 'cfu/g','max',    NULL,  100.0, NULL,                       false, 80),
    ('PCM-API','Escherichia coli',        NULL,'absent',    NULL,  NULL,  NULL,                       true , 90),

    ('ART-API','Description',             NULL,'exact_text',NULL,  NULL,  'White crystalline powder', false, 10),
    ('ART-API','Identification (IR)',     NULL,'complies',  NULL,  NULL,  NULL,                       true , 20),
    ('ART-API','Assay (dried basis)',     '%', 'range',     98.0,  102.0, NULL,                       true , 30),
    ('ART-API','Specific optical rotation','deg','range',   166.0, 173.0, NULL,                       true , 40),
    ('ART-API','Loss on drying',          '%', 'max',       NULL,  0.5,   NULL,                       false, 50),
    ('ART-API','Total aerobic microbial count','cfu/g','max',NULL, 1000.0,NULL,                       true , 60),
    ('ART-API','Escherichia coli',        NULL,'absent',    NULL,  NULL,  NULL,                       true , 70),

    ('LUM-API','Description',             NULL,'exact_text',NULL,  NULL,  'Yellow crystalline powder',false, 10),
    ('LUM-API','Identification (IR)',     NULL,'complies',  NULL,  NULL,  NULL,                       true , 20),
    ('LUM-API','Assay (anhydrous basis)', '%', 'range',     98.0,  102.0, NULL,                       true , 30),
    ('LUM-API','Water content',           '%', 'max',       NULL,  0.5,   NULL,                       false, 40),
    ('LUM-API','Total aerobic microbial count','cfu/g','max',NULL, 1000.0,NULL,                       true , 50),

    ('AMX-API','Description',             NULL,'exact_text',NULL,  NULL,  'White crystalline powder', false, 10),
    ('AMX-API','Identification (HPLC)',   NULL,'complies',  NULL,  NULL,  NULL,                       true , 20),
    ('AMX-API','Assay (anhydrous basis)', '%', 'range',     95.0,  102.0, NULL,                       true , 30),
    ('AMX-API','Water content',           '%', 'range',     11.5,  14.5,  NULL,                       true , 40),
    ('AMX-API','pH (0.2% w/v solution)',  NULL,'range',     3.5,   6.0,   NULL,                       false, 50),
    ('AMX-API','Total aerobic microbial count','cfu/g','max',NULL, 100.0, NULL,                       true , 60),
    ('AMX-API','Escherichia coli',        NULL,'absent',    NULL,  NULL,  NULL,                       true , 70),

    ('MCC-102','Description',             NULL,'exact_text',NULL,  NULL,  'White or almost white powder',false,10),
    ('MCC-102','Identification',          NULL,'complies',  NULL,  NULL,  NULL,                       true , 20),
    ('MCC-102','Loss on drying',          '%', 'max',       NULL,  5.0,   NULL,                       false, 30),
    ('MCC-102','pH (aqueous extract)',    NULL,'range',     5.0,   7.5,   NULL,                       false, 40),
    ('MCC-102','Bulk density',            'g/mL','range',   0.28,  0.38,  NULL,                       false, 50),
    ('MCC-102','Total aerobic microbial count','cfu/g','max',NULL, 1000.0,NULL,                       true , 60),
    ('MCC-102','Escherichia coli',        NULL,'absent',    NULL,  NULL,  NULL,                       true , 70),

    ('STA-MAI','Description',             NULL,'exact_text',NULL,  NULL,  'White powder',             false, 10),
    ('STA-MAI','Identification (microscopy)',NULL,'complies',NULL, NULL,  NULL,                       true , 20),
    ('STA-MAI','Loss on drying',          '%', 'max',       NULL,  15.0,  NULL,                       false, 30),
    ('STA-MAI','pH',                      NULL,'range',     4.0,   7.0,   NULL,                       false, 40),
    ('STA-MAI','Sulphated ash',           '%', 'max',       NULL,  0.6,   NULL,                       false, 50),
    ('STA-MAI','Total aerobic microbial count','cfu/g','max',NULL, 1000.0,NULL,                       true , 60),

    ('MGS-VEG','Description',             NULL,'exact_text',NULL,  NULL,  'Fine white powder, greasy to the touch',false,10),
    ('MGS-VEG','Identification',          NULL,'complies',  NULL,  NULL,  NULL,                       true , 20),
    ('MGS-VEG','Assay (as Mg)',           '%', 'range',     4.0,   5.0,   NULL,                       true , 30),
    ('MGS-VEG','Loss on drying',          '%', 'max',       NULL,  6.0,   NULL,                       false, 40),
    ('MGS-VEG','Total aerobic microbial count','cfu/g','max',NULL, 1000.0,NULL,                       false, 50),

    ('PVP-K30','Description',             NULL,'exact_text',NULL,  NULL,  'White to creamy-white powder',false,10),
    ('PVP-K30','Identification (IR)',     NULL,'complies',  NULL,  NULL,  NULL,                       true , 20),
    ('PVP-K30','K-value',                 NULL,'range',     27.0,  32.4,  NULL,                       true , 30),
    ('PVP-K30','Water content',           '%', 'max',       NULL,  5.0,   NULL,                       false, 40),
    ('PVP-K30','Aldehydes',               'ppm','max',      NULL,  500.0, NULL,                       false, 50),
    ('PVP-K30','Total aerobic microbial count','cfu/g','max',NULL, 1000.0,NULL,                       false, 60)
  ) AS v(mat,param,unit,ltype,lmin,lmax,ltext,crit,ord)
  LOOP
    INSERT INTO public.material_specification_parameters
      (specification_id, parameter, unit, limit_type, min_value, max_value,
       expected_text, is_critical, sort_order)
    VALUES ((sp->>r.mat)::uuid, r.param, r.unit, r.ltype, r.lmin, r.lmax,
            r.ltext, r.crit, r.ord);
  END LOOP;

  -- ── 6. Test definitions ───────────────────────────────────────────
  --  Every critical parameter becomes a required in-house test, so the
  --  release gate has something real to withhold. Non-critical
  --  parameters become optional tests, which is what makes "a required
  --  test" a meaningful distinction on screen.
  INSERT INTO public.material_test_definitions
    (company_id, specification_parameter_id, code, name, method, instrument,
     is_required, sort_order, created_by)
  SELECT c, p.id,
         'T-' || upper(left(regexp_replace(p.parameter,'[^A-Za-z]','','g'), 8)),
         p.parameter,
         CASE
           WHEN p.parameter LIKE 'Identification (IR)%'    THEN 'FTIR, BP Appendix II A'
           WHEN p.parameter LIKE 'Identification (HPLC)%'  THEN 'HPLC, USP <621>'
           WHEN p.parameter LIKE 'Assay%'                  THEN 'HPLC, USP <621>'
           WHEN p.parameter LIKE '%microbial count%'        THEN 'Plate count, USP <61>'
           WHEN p.parameter = 'Escherichia coli'            THEN 'Specified micro-organisms, USP <62>'
           WHEN p.parameter LIKE 'Loss on drying%'          THEN 'Gravimetric, BP Appendix IX D'
           WHEN p.parameter LIKE 'Water content%'           THEN 'Karl Fischer, USP <921>'
           WHEN p.parameter LIKE 'Heavy metals%'            THEN 'ICP-OES, USP <233>'
           WHEN p.parameter LIKE 'pH%'                      THEN 'Potentiometry, USP <791>'
           WHEN p.parameter LIKE 'Bulk density%'            THEN 'USP <616>'
           WHEN p.parameter LIKE 'Specific optical rotation%' THEN 'Polarimetry, USP <781>'
           WHEN p.parameter = 'Description'                 THEN 'Visual examination'
           ELSE 'In-house method'
         END,
         CASE
           WHEN p.parameter LIKE '%(IR)%'                   THEN 'FTIR-02'
           WHEN p.parameter LIKE 'Assay%' OR p.parameter LIKE '%(HPLC)%' THEN 'HPLC-07'
           WHEN p.parameter LIKE '%microbial%' OR p.parameter = 'Escherichia coli' THEN 'INC-03'
           WHEN p.parameter LIKE 'Water content%'           THEN 'KF-03'
           WHEN p.parameter LIKE 'Heavy metals%'            THEN 'ICP-01'
           WHEN p.parameter LIKE 'pH%'                      THEN 'PH-04'
           ELSE NULL
         END,
         p.is_critical, p.sort_order, p_actor_id
    FROM public.material_specification_parameters p
    JOIN public.material_specifications ms ON ms.id = p.specification_id
   WHERE ms.company_id = c;

  -- ── 7. Lots, and the chronology ───────────────────────────────────
  --  Every date is derived from p_as_of and from the date before it, so
  --  the ordering holds by construction: manufactured, then received,
  --  then sampled, then released.
  FOR r IN SELECT * FROM (VALUES
    --  The batch reference is a STEM plus a serial, not a literal. An
    --  earlier version wrote references like 'HBL/PCM/24118', whose
    --  embedded 24 said 2024 while the lot was manufactured in 2026 —
    --  a contradiction a demonstration audience reading batch numbers
    --  would spot, and the kind the NOT DONE IF is about. The year is
    --  now taken from the manufacture date the row actually gets.
    -- material, supplier, batch stem, serial, qty, received days ago, shelf months, outcome
    ('PCM-API','SUP-HBL','HBL/PCM','118', 2000.0, 240, 36, 'released'),
    ('PCM-API','SUP-HBL','HBL/PCM','042', 2000.0, 120, 36, 'released'),
    ('PCM-API','SUP-YFA','YFA-PA','0711', 1500.0,  35, 36, 'under_test'),
    ('MCC-102','SUP-SEN','SEN/MCC','251', 4000.0, 190, 48, 'released'),
    ('MCC-102','SUP-SEN','SEN/MCC','318', 4000.0,  28, 48, 'quarantine'),
    ('STA-MAI','SUP-SEN','SEN/STA','904', 3000.0, 150, 36, 'released'),
    ('MGS-VEG','SUP-SEN','SEN/MGS','771',  500.0, 210, 60, 'released_retest_due'),
    ('ART-API','SUP-YFA','YFA-AR','0388',  300.0,  95, 24, 'released'),
    ('LUM-API','SUP-YFA','YFA-LU','0390', 1800.0,  95, 24, 'released'),
    ('AMX-API','SUP-HBL','HBL/AMX','061',  900.0,  60, 24, 'under_test'),
    ('PVP-K30','SUP-MPI','MPI-PVP','4471', 250.0,  45, 48, 'quarantine'),
    ('PCM-API','SUP-YFA','YFA-PA','0402', 1000.0, 170, 36, 'rejected')
  ) AS v(mat,sup,stem,serial,qty,recv_ago,shelf,outcome)
  LOOP
    --  Computed once, so the batch reference, the manufacture date and
    --  everything derived from them cannot disagree.
    DECLARE v_mfg date := p_as_of - r.recv_ago - (20 + (r.recv_ago % 30));
            v_batch text;
    BEGIN
    v_batch := r.stem || CASE WHEN r.stem LIKE '%/%' THEN '/' ELSE '-' END
               || to_char(v_mfg,'YY') || r.serial;
    INSERT INTO public.material_lots(company_id, material_id, supplier_id,
        supplier_batch_number, quantity_received, received_date, manufacture_date,
        supplier_expiry_date, storage_location, received_by, created_by)
    VALUES (c, (m->>r.mat)::uuid, (s->>r.sup)::uuid, v_batch, r.qty,
            p_as_of - r.recv_ago,
            --  Manufactured 20 to 50 days before we received it, which
            --  is a plausible shipping and clearance window and is
            --  always before receipt.
            v_mfg,
            --  Shelf life measured from manufacture, not from receipt.
            v_mfg + (r.shelf * 30),
            CASE r.mat WHEN 'AMX-API' THEN 'Cold Room 1 (2–8 °C)'
                       ELSE 'Warehouse B, Rack ' || (1 + (r.recv_ago % 8)) END,
            p_actor_id, p_actor_id)
    RETURNING id INTO v_lot;

    --  A certificate for every lot, with the supplier's stated results
    --  generated from the specification so they are internally
    --  consistent. The rejected lot's assay is deliberately out of
    --  specification, so the discrepancy path has a real example.
    INSERT INTO public.material_certificates_of_analysis
      (company_id, material_lot_id, certificate_number, issued_date, received_date,
       supplier_results, uploaded_by)
    SELECT c, v_lot,
           r.sup || '/COA/' || v_batch,
           p_as_of - r.recv_ago - 5, p_as_of - r.recv_ago,
           jsonb_agg(
             CASE
               WHEN p.limit_type = 'range' THEN
                 jsonb_build_object('parameter', p.parameter, 'unit', p.unit,
                   'stated_value', CASE
                     WHEN r.outcome = 'rejected' AND p.parameter LIKE 'Assay%'
                       THEN round(p.min_value - 3.4, 2)
                     ELSE round((p.min_value + p.max_value) / 2.0, 3) END)
               WHEN p.limit_type = 'max' THEN
                 jsonb_build_object('parameter', p.parameter, 'unit', p.unit,
                   'stated_value', round(p.max_value * 0.4, 3))
               WHEN p.limit_type = 'min' THEN
                 jsonb_build_object('parameter', p.parameter, 'unit', p.unit,
                   'stated_value', round(p.min_value * 1.6, 3))
               WHEN p.limit_type = 'exact_text' THEN
                 jsonb_build_object('parameter', p.parameter, 'stated_text', p.expected_text)
               WHEN p.limit_type = 'complies' THEN
                 jsonb_build_object('parameter', p.parameter, 'stated_text', 'Complies')
               ELSE
                 jsonb_build_object('parameter', p.parameter, 'stated_text', 'Absent')
             END ORDER BY p.sort_order),
           p_actor_id
      FROM public.material_specification_parameters p
     WHERE p.specification_id = (sp->>r.mat)::uuid
    RETURNING id INTO v_coa;

    PERFORM public.material_coa_verify(v_coa);

    IF r.outcome = 'quarantine' THEN
      CONTINUE;   -- received, awaiting sampling
    END IF;

    --  Sampled a few days after receipt.
    PERFORM public.lifecycle_transition('material_lot', v_lot, 'sample', c, p_actor_id,
      format('Sampled per SOP-QC-014 on %s.', to_char(p_as_of - r.recv_ago + 3, 'DD Mon YYYY')));

    --  In-house results for every test, computed by the platform from
    --  the measured value. The rejected lot fails its assay.
    FOR v_id IN
      SELECT d.id FROM public.material_test_definitions d
        JOIN public.material_specification_parameters p ON p.id = d.specification_parameter_id
       WHERE p.specification_id = (sp->>r.mat)::uuid
       ORDER BY d.sort_order
    LOOP
      DECLARE v_p record; v_val numeric; v_txt text;
      BEGIN
        SELECT p.* INTO v_p FROM public.material_specification_parameters p
          JOIN public.material_test_definitions d ON d.specification_parameter_id = p.id
         WHERE d.id = v_id;

        v_val := NULL; v_txt := NULL;
        IF v_p.limit_type = 'range' THEN
          v_val := CASE WHEN r.outcome = 'rejected' AND v_p.parameter LIKE 'Assay%'
                        THEN round(v_p.min_value - 3.1, 2)
                        ELSE round((v_p.min_value + v_p.max_value) / 2.0, 3) END;
        ELSIF v_p.limit_type = 'max' THEN v_val := round(v_p.max_value * 0.35, 3);
        ELSIF v_p.limit_type = 'min' THEN v_val := round(v_p.min_value * 1.7, 3);
        ELSIF v_p.limit_type = 'exact_text' THEN v_txt := v_p.expected_text;
        ELSIF v_p.limit_type = 'complies' THEN v_txt := 'Complies';
        ELSE v_txt := 'Absent';
        END IF;

        PERFORM public.material_test_record_result(
          v_lot, v_id, v_val, v_txt, p_actor_id,
          p_as_of - r.recv_ago + 6,
          NULL, NULL);
      END;
    END LOOP;

    IF r.outcome = 'rejected' THEN
      PERFORM public.material_lot_reject(v_lot, 'return_to_supplier',
        format('Assay %s%% against a specification of 99.0–101.0%%. Confirmed on repeat analysis.',
               round((SELECT min_value FROM public.material_specification_parameters
                       WHERE specification_id = (sp->>r.mat)::uuid
                         AND parameter LIKE 'Assay%') - 3.1, 1)),
        format('Returned under supplier RMA. Credit note requested from %s.',
               (SELECT name FROM public.suppliers WHERE id = (s->>r.sup)::uuid)));
      CONTINUE;
    END IF;

    IF r.outcome = 'under_test' THEN
      CONTINUE;   -- results in, release decision pending
    END IF;

    --  Release. A genuine signature: the record hash is computed by the
    --  platform's own function against the lot's current state, so
    --  lifecycle_consume_signature() accepts it on the merits rather
    --  than being bypassed.
    v_hash := public.electronic_signature_record_hash('material_lot', v_lot, c);
    SELECT id INTO v_def FROM public.lifecycle_definitions
     WHERE entity_type = 'material_lot' AND company_id IS NULL AND is_active;

    INSERT INTO public.electronic_signatures
      (company_id, signer_id, signer_name, signer_email, entity_type, entity_id,
       action, meaning, reason, record_hash, signed_state, definition_id, signed_at)
    VALUES (c, p_actor_id, v_signer.nm, v_signer.email, 'material_lot', v_lot,
            'release', 'released',
            'All required tests within specification; certificate of analysis verified against SPEC v2.0.',
            v_hash, 'under_test', v_def,
            (p_as_of - r.recv_ago + 7)::timestamptz + interval '10 hours')
    RETURNING id INTO v_sig;

    PERFORM public.material_lot_release(v_lot, v_sig, 'full', NULL, NULL,
      format('Released on %s following satisfactory in-house testing.',
             to_char(p_as_of - r.recv_ago + 7, 'DD Mon YYYY')));

    --  One released lot is deliberately close to its retest date, so the
    --  alerting from item 04 has something to find during the
    --  walkthrough rather than an empty list.
    IF r.outcome = 'released_retest_due' THEN
      UPDATE public.material_lots
         SET retest_due_date = p_as_of + 12
       WHERE id = v_lot;
    END IF;
    END;
  END LOOP;

  --  A QC laboratory has several analysts, and
  --  material_test_record_result() takes the actor's name from their
  --  profile — which would put the seeding user's name on all 300-odd
  --  results. analyst_name is free text and analyst_id still points at
  --  the real actor, so the displayed names are spread across a roster
  --  while the attribution stays honest.
  --
  --  This writes to material_test_results, whose UPDATE privilege is
  --  revoked from `authenticated` by item 06. That revocation is about
  --  clients rewriting evidence; this function is SECURITY DEFINER and
  --  runs as the owner, and it is seeding a demonstration company it has
  --  already proved is marked as such.
  WITH roster(i, nm) AS (VALUES
    (0,'Adaeze Okonkwo'), (1,'Babatunde Oyelaran'), (2,'Chinwe Maduka'),
    (3,'Ibrahim Danjuma'), (4,'Folasade Ajayi'))
  UPDATE public.material_test_results tr
     SET analyst_name = roster.nm
    FROM roster
   WHERE tr.company_id = c
     AND roster.i = (abs(hashtext(tr.id::text)) % 5);

  --  Raise the alerts now, so the demonstration does not depend on the
  --  nightly sweep having run.
  PERFORM public.material_lot_retest_sweep(c);

  -- ── 8. Chronology self-check ──────────────────────────────────────
  --  "Dates that contradict each other, such as a lot released before it
  --  was received" is a NOT DONE IF, so the seed proves its own
  --  chronology rather than trusting the arithmetic above.
  IF EXISTS (SELECT 1 FROM public.material_lots
              WHERE company_id = c AND manufacture_date > received_date) THEN
    RAISE EXCEPTION 'DEMO_SEED_CHRONOLOGY: a lot was manufactured after it was received';
  END IF;
  IF EXISTS (SELECT 1 FROM public.material_lots
              WHERE company_id = c AND supplier_expiry_date <= manufacture_date) THEN
    RAISE EXCEPTION 'DEMO_SEED_CHRONOLOGY: a lot expires on or before it was manufactured';
  END IF;
  IF EXISTS (SELECT 1 FROM public.material_lot_release_records rr
               JOIN public.material_lots ml ON ml.id = rr.material_lot_id
              WHERE rr.company_id = c AND rr.released_at::date < ml.received_date) THEN
    RAISE EXCEPTION 'DEMO_SEED_CHRONOLOGY: a lot was released before it was received';
  END IF;
  IF EXISTS (SELECT 1 FROM public.material_test_results tr
               JOIN public.material_lots ml ON ml.id = tr.material_lot_id
              WHERE tr.company_id = c AND tr.test_date < ml.received_date) THEN
    RAISE EXCEPTION 'DEMO_SEED_CHRONOLOGY: a lot was tested before it was received';
  END IF;
  IF EXISTS (SELECT 1 FROM public.material_certificates_of_analysis co
               JOIN public.material_lots ml ON ml.id = co.material_lot_id
              WHERE co.company_id = c AND co.issued_date > co.received_date) THEN
    RAISE EXCEPTION 'DEMO_SEED_CHRONOLOGY: a certificate was received before it was issued';
  END IF;

  SELECT jsonb_build_object(
    'company_id',      c,
    'company',         'Lagoon Pharmaceuticals Limited',
    'as_of',           p_as_of,
    'products',        (SELECT count(*) FROM public.products  WHERE company_id = c),
    'suppliers',       (SELECT count(*) FROM public.suppliers WHERE company_id = c),
    'materials',       (SELECT count(*) FROM public.materials WHERE company_id = c),
    'spec_parameters', (SELECT count(*) FROM public.material_specification_parameters p
                          JOIN public.material_specifications ms ON ms.id = p.specification_id
                         WHERE ms.company_id = c),
    'test_definitions',(SELECT count(*) FROM public.material_test_definitions WHERE company_id = c),
    'lots',            (SELECT count(*) FROM public.material_lots WHERE company_id = c),
    'lots_by_status',  (SELECT jsonb_object_agg(status, n) FROM
                          (SELECT status, count(*) AS n FROM public.material_lots
                            WHERE company_id = c GROUP BY status) q),
    'test_results',    (SELECT count(*) FROM public.material_test_results WHERE company_id = c),
    'certificates',    (SELECT count(*) FROM public.material_certificates_of_analysis WHERE company_id = c),
    'discrepancies',   (SELECT count(*) FROM public.material_coa_discrepancies WHERE company_id = c),
    'releases',        (SELECT count(*) FROM public.material_lot_release_records WHERE company_id = c),
    'rejections',      (SELECT count(*) FROM public.material_lot_rejections WHERE company_id = c),
    'open_alerts',     (SELECT count(*) FROM public.material_lot_alerts
                         WHERE company_id = c AND acknowledged_at IS NULL))
    INTO v_counts;

  RETURN v_counts;
END $$;

COMMENT ON FUNCTION public.demo_seed_pharma_manufacturer(uuid,date,uuid) IS
  'Seeds the Lagoon Pharmaceuticals demonstration company: products, suppliers, materials, specifications, test definitions, lots, certificates, test results, releases and a rejection. Every date is relative to p_as_of so a re-run refreshes the timeline. Goes through the real lifecycle gates, including a genuine electronic signature for each release. Creates no accounts and sets no passwords.';

REVOKE ALL ON FUNCTION public.demo_seed_pharma_manufacturer(uuid,date,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.demo_seed_pharma_manufacturer(uuid,date,uuid) TO service_role;
