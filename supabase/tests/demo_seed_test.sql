-- =====================================================================
--  WEEK 3 / ITEM 11 — SEEDED DEMONSTRATION DATA
--
--  A. The company profile
--  B. Products: real generic names and dosage forms
--  C. Materials: real names, plausible specifications
--  D. Specifications carry identity, assay, microbial and physical
--  E. Lots: realistic numbers, references and a coherent chronology
--  F. Suppliers with qualification status
--  G. Depth: enough to run the narrative through to batch release
--  H. The "NOT DONE IF" clauses
--  I. Safety: the seed cannot be run by a client, and cannot reset a
--     real company
-- =====================================================================
\set ON_ERROR_STOP on
SET client_min_messages = warning;

CREATE TEMP TABLE _d(section text, name text, ok boolean, detail text);
CREATE OR REPLACE FUNCTION _dk(p_section text, p_name text, p_ok boolean, p_detail text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO _d VALUES (p_section,p_name,coalesce(p_ok,false),p_detail); END $$;

--  Seed fresh, so the suite tests the seed rather than whatever a
--  previous run left behind.
DO $seed$
DECLARE u uuid := 'd0000000-0000-4000-a000-0000000000f1'; v jsonb;
BEGIN
  INSERT INTO auth.users(id,email) VALUES (u,'demo.qa@lagoonpharma.example')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.profiles(id,email,full_name,role)
  VALUES (u,'demo.qa@lagoonpharma.example','Ngozi Adeyemi','admin')
  ON CONFLICT (id) DO UPDATE SET full_name=excluded.full_name, role=excluded.role;

  v := public.demo_seed_pharma_manufacturer(u);
  PERFORM set_config('test.seed', v::text, false);
END
$seed$;

-- =====================================================================
--  A. The company profile
-- =====================================================================
DO $a$
DECLARE c uuid := public.demo_company_id(); v record;
BEGIN
  SELECT co.name, cs.tagline, cs.project_name INTO v
    FROM public.companies co
    LEFT JOIN public.company_settings cs ON cs.company_id = co.id
   WHERE co.id = c;

  PERFORM _dk('A','A1 the demonstration company exists', v.name IS NOT NULL, v.name);
  PERFORM _dk('A','A2 it reads as a pharmaceutical manufacturer',
              v.tagline ILIKE '%GMP%' AND v.tagline ILIKE '%dosage%', v.tagline);
  PERFORM _dk('A','A3 with a named site',
              v.tagline ILIKE '%Ota%' AND v.tagline ILIKE '%Ogun%', v.tagline);
  PERFORM _dk('A','A4 and a plausible scale',
              v.tagline ~ '[0-9]+ staff' AND v.tagline ILIKE '%tablets per year%', v.tagline);
  PERFORM _dk('A','A5 it is marked as demonstration data',
              v.project_name = public.demo_marker(), v.project_name);
END
$a$;

-- =====================================================================
--  B. Products
-- =====================================================================
DO $b$
DECLARE c uuid := public.demo_company_id(); n integer; bad text[];
BEGIN
  SELECT count(*) INTO n FROM public.products WHERE company_id=c;
  PERFORM _dk('B','B1 five products', n=5, n::text);

  --  Real generic names, not placeholders. Checked against actual INNs.
  PERFORM _dk('B','B2 the generic names are real INNs',
    (SELECT count(*)=5 FROM public.products
      WHERE company_id=c
        AND generic_name IN ('Paracetamol','Artemether / Lumefantrine',
                             'Amoxicillin trihydrate','Metformin hydrochloride',
                             'Zinc sulfate monohydrate')));

  PERFORM _dk('B','B3 real dosage forms',
    (SELECT count(*)=5 FROM public.products
      WHERE company_id=c AND dosage_form IN ('Tablet','Capsule','Dispersible tablet')));

  PERFORM _dk('B','B4 strengths and pack sizes are stated',
    (SELECT count(*)=0 FROM public.products
      WHERE company_id=c AND (strength IS NULL OR pack_size IS NULL)));

  --  The products went through the regulatory lifecycle, so the dossier
  --  screens have a history rather than a single status.
  PERFORM _dk('B','B5 products are spread across lifecycle states',
    (SELECT count(DISTINCT s.state_key) >= 3
       FROM public.entity_current_state ecs
       JOIN public.lifecycle_states s ON s.id=ecs.state_id
      WHERE ecs.company_id=c AND ecs.entity_type='product'));

  PERFORM _dk('B','B6 and each carries a regulatory history',
    (SELECT count(*)=0 FROM public.products p
      WHERE p.company_id=c
        AND (SELECT count(*) FROM public.entity_state_history h
              WHERE h.entity_type='product' AND h.entity_id=p.id) < 2));

  --  Three of them are active and NAFDAC-numbered, which is what a
  --  marketed product looks like.
  PERFORM _dk('B','B7 the active products carry NAFDAC numbers',
    (SELECT count(*)=3 FROM public.products p
       JOIN public.entity_current_state ecs
         ON ecs.entity_id=p.id AND ecs.entity_type='product'
       JOIN public.lifecycle_states s ON s.id=ecs.state_id
      WHERE p.company_id=c AND s.state_key='active' AND p.nafdac_number IS NOT NULL));
END
$b$;

-- =====================================================================
--  C and D. Materials and their specifications
-- =====================================================================
DO $c$
DECLARE c uuid := public.demo_company_id(); n integer; bad text[];
BEGIN
  SELECT count(*) INTO n FROM public.materials WHERE company_id=c;
  PERFORM _dk('C','C1 eight materials', n=8, n::text);

  PERFORM _dk('C','C2 real active ingredient names',
    (SELECT count(*)=4 FROM public.materials
      WHERE company_id=c AND material_type='active_ingredient'
        AND name IN ('Paracetamol BP','Artemether USP','Lumefantrine USP',
                     'Amoxicillin Trihydrate BP')));

  PERFORM _dk('C','C3 real excipient names',
    (SELECT count(*)=4 FROM public.materials
      WHERE company_id=c AND material_type='excipient'
        AND name LIKE ANY (ARRAY['Microcrystalline Cellulose%','Maize Starch%',
                                 'Magnesium Stearate%','Povidone K30%'])));

  PERFORM _dk('C','C4 every material carries storage conditions and a retest period',
    (SELECT count(*)=0 FROM public.materials
      WHERE company_id=c AND (storage_conditions IS NULL OR retest_period_days IS NULL)));

  --  Cold-chain conditions on the material that needs them, ambient on
  --  the rest. A plausible specification, not a copied one.
  PERFORM _dk('C','C5 the cold-chain material is stored cold',
    (SELECT storage_temperature_max_c = 8 FROM public.materials
      WHERE company_id=c AND code='AMX-API'));

  PERFORM _dk('C','C6 APIs are classified critical',
    (SELECT count(*)=0 FROM public.materials
      WHERE company_id=c AND material_type='active_ingredient' AND criticality<>'critical'));

  PERFORM _dk('C','C7 every material has exactly one effective specification',
    (SELECT count(*)=8 FROM public.materials m
      WHERE m.company_id=c
        AND (SELECT count(*) FROM public.material_specifications s
              WHERE s.material_id=m.id AND s.status='effective') = 1));

  -- ── D. the four categories the item names ──
  --  Checked per material, because a specification that has identity and
  --  assay but no microbial limits is not one an auditor accepts.
  SELECT array_agg(m.code ORDER BY m.code) INTO bad
    FROM public.materials m
    JOIN public.material_specifications s ON s.material_id=m.id AND s.status='effective'
   WHERE m.company_id=c
     AND NOT EXISTS (SELECT 1 FROM public.material_specification_parameters p
                      WHERE p.specification_id=s.id AND p.parameter ILIKE 'Identification%');
  PERFORM _dk('D','D1 every specification has an identity test',
              bad IS NULL, array_to_string(bad,','));

  --  An assay is required where potency is a property of the material:
  --  every active, plus the excipients whose monographs carry one
  --  (magnesium stearate assays for Mg content, povidone for K-value).
  --
  --  Microcrystalline cellulose and maize starch are deliberately
  --  excluded. Their BP monographs have no assay — they are identified
  --  and characterised, not assayed, because they have no potency to
  --  measure. An earlier version of this assertion demanded an assay on
  --  every specification and failed on exactly those two, which was the
  --  test being wrong rather than the data: adding an invented assay to
  --  starch would have made the demonstration less credible to anyone
  --  who knows the monograph, not more.
  SELECT array_agg(m.code ORDER BY m.code) INTO bad
    FROM public.materials m
    JOIN public.material_specifications s ON s.material_id=m.id AND s.status='effective'
   WHERE m.company_id=c
     AND m.code NOT IN ('MCC-102','STA-MAI')
     AND NOT EXISTS (SELECT 1 FROM public.material_specification_parameters p
                      WHERE p.specification_id=s.id
                        AND (p.parameter ILIKE 'Assay%' OR p.parameter ILIKE 'K-value%'));
  PERFORM _dk('D','D2 every material with a potency has an assay or equivalent',
              bad IS NULL, array_to_string(bad,','));

  --  And the two that have none still carry identification and
  --  characterisation, so their specifications are complete for what
  --  they are rather than merely shorter.
  PERFORM _dk('D','D2b the unassayed excipients are still identified and characterised',
    (SELECT count(*)=2 FROM public.materials m
       JOIN public.material_specifications s ON s.material_id=m.id AND s.status='effective'
      WHERE m.company_id=c AND m.code IN ('MCC-102','STA-MAI')
        AND (SELECT count(*) FROM public.material_specification_parameters p
              WHERE p.specification_id=s.id) >= 5));

  SELECT array_agg(m.code ORDER BY m.code) INTO bad
    FROM public.materials m
    JOIN public.material_specifications s ON s.material_id=m.id AND s.status='effective'
   WHERE m.company_id=c
     AND NOT EXISTS (SELECT 1 FROM public.material_specification_parameters p
                      WHERE p.specification_id=s.id AND p.parameter ILIKE '%microbial%');
  PERFORM _dk('D','D3 every specification has microbial limits',
              bad IS NULL, array_to_string(bad,','));

  SELECT array_agg(m.code ORDER BY m.code) INTO bad
    FROM public.materials m
    JOIN public.material_specifications s ON s.material_id=m.id AND s.status='effective'
   WHERE m.company_id=c
     AND NOT EXISTS (SELECT 1 FROM public.material_specification_parameters p
                      WHERE p.specification_id=s.id
                        AND p.parameter IN ('Description','Loss on drying','Water content',
                                            'Bulk density','pH','pH (aqueous extract)',
                                            'pH (0.2% w/v solution)'));
  PERFORM _dk('D','D4 every specification has physical characteristics',
              bad IS NULL, array_to_string(bad,','));

  --  Real limits, not round numbers everywhere.
  PERFORM _dk('D','D5 the paracetamol assay limits are the BP limits',
    (SELECT min_value=99.0 AND max_value=101.0
       FROM public.material_specification_parameters p
       JOIN public.material_specifications s ON s.id=p.specification_id
       JOIN public.materials m ON m.id=s.material_id
      WHERE m.company_id=c AND m.code='PCM-API' AND p.parameter LIKE 'Assay%'));

  PERFORM _dk('D','D6 every limit type in the engine is represented',
    (SELECT count(DISTINCT p.limit_type) >= 5
       FROM public.material_specification_parameters p
       JOIN public.material_specifications s ON s.id=p.specification_id
      WHERE s.company_id=c));

  --  And a required test for each critical parameter, so the release
  --  gate has something real to withhold during the walkthrough.
  PERFORM _dk('D','D7 every critical parameter has a required test',
    (SELECT count(*)=0 FROM public.material_specification_parameters p
       JOIN public.material_specifications s ON s.id=p.specification_id
      WHERE s.company_id=c AND p.is_critical
        AND NOT EXISTS (SELECT 1 FROM public.material_test_definitions d
                         WHERE d.specification_parameter_id=p.id AND d.is_required)));

  PERFORM _dk('D','D8 tests carry a method, and the instrumental ones an instrument',
    (SELECT count(*)=0 FROM public.material_test_definitions
      WHERE company_id=c AND (method IS NULL OR btrim(method)=''))
    AND (SELECT count(*)>0 FROM public.material_test_definitions
          WHERE company_id=c AND instrument IS NOT NULL));
END
$c$;

-- =====================================================================
--  E. Lots and chronology
-- =====================================================================
DO $e$
DECLARE c uuid := public.demo_company_id(); n integer;
BEGIN
  SELECT count(*) INTO n FROM public.material_lots WHERE company_id=c;
  PERFORM _dk('E','E1 twelve lots', n=12, n::text);

  PERFORM _dk('E','E2 lot numbers follow the company''s configured format',
    (SELECT count(*)=12 FROM public.material_lots
      WHERE company_id=c AND lot_number LIKE 'LPL-RM/%/%'));

  PERFORM _dk('E','E3 every lot carries a supplier batch reference',
    (SELECT count(*)=0 FROM public.material_lots
      WHERE company_id=c AND coalesce(btrim(supplier_batch_number),'')=''));

  --  The chronology. The seed asserts this itself, which is why these
  --  re-assert it from outside: a self-check that is never checked is a
  --  comment.
  PERFORM _dk('E','E4 nothing was manufactured after it was received',
    (SELECT count(*)=0 FROM public.material_lots
      WHERE company_id=c AND manufacture_date > received_date));
  PERFORM _dk('E','E5 nothing expires before it was made',
    (SELECT count(*)=0 FROM public.material_lots
      WHERE company_id=c AND supplier_expiry_date <= manufacture_date));
  PERFORM _dk('E','E6 nothing was released before it was received',
    (SELECT count(*)=0 FROM public.material_lot_release_records rr
       JOIN public.material_lots ml ON ml.id=rr.material_lot_id
      WHERE rr.company_id=c AND rr.released_at::date < ml.received_date));
  PERFORM _dk('E','E7 nothing was tested before it was received',
    (SELECT count(*)=0 FROM public.material_test_results tr
       JOIN public.material_lots ml ON ml.id=tr.material_lot_id
      WHERE tr.company_id=c AND tr.test_date < ml.received_date));
  PERFORM _dk('E','E8 no certificate was received before it was issued',
    (SELECT count(*)=0 FROM public.material_certificates_of_analysis
      WHERE company_id=c AND issued_date > received_date));

  --  The supplier's own batch reference encodes a year; it must agree
  --  with the manufacture date. This is the realism defect the seed's
  --  first version had.
  PERFORM _dk('E','E9 batch references encode the right year',
    (SELECT count(*)=0 FROM public.material_lots
      WHERE company_id=c
        AND supplier_batch_number !~ ('(/|-)' || to_char(manufacture_date,'YY'))));

  --  Spread across states, so no screen is empty during the walkthrough.
  PERFORM _dk('E','E10 lots are spread across four states',
    (SELECT count(DISTINCT status)=4 FROM public.material_lots WHERE company_id=c));

  PERFORM _dk('E','E11 the received dates are spread over months, not a single day',
    (SELECT max(received_date) - min(received_date) > 180
       FROM public.material_lots WHERE company_id=c));

  --  Every date is in the past relative to the seed, except the forward
  --  looking ones.
  PERFORM _dk('E','E12 no lot was received in the future',
    (SELECT count(*)=0 FROM public.material_lots
      WHERE company_id=c AND received_date > current_date));
END
$e$;

-- =====================================================================
--  F. Suppliers with qualification status
-- =====================================================================
DO $f$
DECLARE c uuid := public.demo_company_id();
BEGIN
  PERFORM _dk('F','F1 five suppliers',
    (SELECT count(*)=5 FROM public.suppliers WHERE company_id=c));

  --  Spread across qualification states, because item 04's receipt gate
  --  cannot be demonstrated without someone disqualified.
  PERFORM _dk('F','F2 qualification statuses are spread across three states',
    (SELECT count(DISTINCT qualification_status)=3 FROM public.suppliers WHERE company_id=c));

  PERFORM _dk('F','F3 one supplier is disqualified',
    (SELECT count(*)=1 FROM public.suppliers
      WHERE company_id=c AND qualification_status='disqualified'));
  PERFORM _dk('F','F4 one is conditionally qualified',
    (SELECT count(*)=1 FROM public.suppliers
      WHERE company_id=c AND qualification_status='conditional'));

  --  The status came through the engine, so each has a reason on record.
  PERFORM _dk('F','F5 every qualification decision has a history row with a comment',
    (SELECT count(*)=0 FROM public.suppliers s
      WHERE s.company_id=c
        AND NOT EXISTS (SELECT 1 FROM public.entity_state_history h
                         WHERE h.entity_type='supplier' AND h.entity_id=s.id
                           AND coalesce(btrim(h.comment),'') <> '')));

  --  No lot was received from the disqualified supplier, which is item
  --  04's gate holding against the seed itself.
  PERFORM _dk('F','F6 no lot was received from the disqualified supplier',
    (SELECT count(*)=0 FROM public.material_lots ml
       JOIN public.suppliers s ON s.id=ml.supplier_id
      WHERE ml.company_id=c AND s.qualification_status='disqualified'));
END
$f$;

-- =====================================================================
--  G. Depth: enough to run the narrative
-- =====================================================================
DO $g$
DECLARE c uuid := public.demo_company_id();
BEGIN
  --  "Sufficient depth to support the full demonstration narrative
  --  through to batch release, once those modules exist." Batch release
  --  needs released material of every component of a real formulation.
  --  Paracetamol tablets need the API plus a diluent, a binder, a
  --  disintegrant and a lubricant.
  PERFORM _dk('G','G1 released stock of the paracetamol API',
    (SELECT count(*) >= 1 FROM public.material_lots ml
       JOIN public.materials m ON m.id=ml.material_id
      WHERE ml.company_id=c AND m.code='PCM-API' AND ml.status='approved'
        AND ml.quantity_available > 0));

  PERFORM _dk('G','G2 released stock of a diluent, a binder-adjacent and a lubricant',
    (SELECT count(DISTINCT m.code) >= 3 FROM public.material_lots ml
       JOIN public.materials m ON m.id=ml.material_id
      WHERE ml.company_id=c AND ml.status='approved'
        AND m.code IN ('MCC-102','STA-MAI','MGS-VEG')));

  PERFORM _dk('G','G3 released stock of both antimalarial actives',
    (SELECT count(DISTINCT m.code)=2 FROM public.material_lots ml
       JOIN public.materials m ON m.id=ml.material_id
      WHERE ml.company_id=c AND ml.status='approved' AND m.code IN ('ART-API','LUM-API')));

  --  Every state a screen might show has at least one example.
  PERFORM _dk('G','G4 a lot in quarantine, under test, approved and rejected',
    (SELECT count(*)=4 FROM (SELECT DISTINCT status FROM public.material_lots
                              WHERE company_id=c
                                AND status IN ('quarantine','under_test','approved','rejected')) q));

  PERFORM _dk('G','G5 a verified certificate and a discrepant one',
    (SELECT count(DISTINCT verification_status) >= 2
       FROM public.material_certificates_of_analysis WHERE company_id=c));

  PERFORM _dk('G','G6 a rejection with a disposition recorded',
    (SELECT count(*)=1 FROM public.material_lot_rejections
      WHERE company_id=c AND disposition='return_to_supplier'
        AND btrim(reason) <> ''));

  PERFORM _dk('G','G7 an open retest alert, so the alert screen is not empty',
    (SELECT count(*) >= 1 FROM public.material_lot_alerts
      WHERE company_id=c AND acknowledged_at IS NULL));

  PERFORM _dk('G','G8 every release carries a signature',
    (SELECT count(*) >= 7 FROM public.material_lot_release_records
      WHERE company_id=c AND signature_id IS NOT NULL)
    AND (SELECT count(*)=0 FROM public.material_lot_release_records
          WHERE company_id=c AND signature_id IS NULL));

  --  And those signatures were genuinely consumed through the engine,
  --  not left dangling beside the state change.
  PERFORM _dk('G','G9 every release signature was consumed by a transition',
    (SELECT count(*)=0 FROM public.material_lot_release_records rr
      WHERE rr.company_id=c
        AND NOT EXISTS (SELECT 1 FROM public.electronic_signature_consumptions ec
                         WHERE ec.signature_id = rr.signature_id)));

  PERFORM _dk('G','G10 enough test results to fill a dossier',
    (SELECT count(*) >= 50 FROM public.material_test_results WHERE company_id=c),
    (SELECT count(*)::text FROM public.material_test_results WHERE company_id=c));
END
$g$;

-- =====================================================================
--  H. The "NOT DONE IF" clauses
-- =====================================================================
DO $h$
DECLARE c uuid := public.demo_company_id(); hits text[] := '{}'; t text; n integer;
BEGIN
  --  "Placeholder or Lorem Ipsum content anywhere a demonstration
  --  audience will see it." Swept across every text column of every
  --  table the seed writes, rather than spot-checked.
  FOR t IN SELECT unnest(ARRAY['materials','material_lots','suppliers','products',
                               'material_specifications','material_test_results',
                               'material_lot_rejections','material_lot_release_records',
                               'material_certificates_of_analysis'])
  LOOP
    EXECUTE format($q$
      SELECT count(*) FROM public.%I t2
       WHERE t2.company_id = $1
         AND EXISTS (
           SELECT 1 FROM jsonb_each_text(to_jsonb(t2)) AS kv(k,v)
            WHERE kv.v ILIKE ANY (ARRAY['%%lorem%%','%%ipsum%%','%%placeholder%%',
                                        '%%TODO%%','%%TBD%%','%%foo%%','%%bar%%',
                                        '%%test test%%','%%xxx%%','%%sample text%%',
                                        '%%dummy%%','%%example co%%','%%asdf%%']))
    $q$, t) INTO n USING c;
    IF n > 0 THEN hits := hits || (t||'='||n); END IF;
  END LOOP;
  PERFORM _dk('H','H1 no placeholder text in any seeded row',
              cardinality(hits)=0, array_to_string(hits,' '));

  --  Nor in the specification parameters, which have no company_id and
  --  so are reached through their specification.
  SELECT count(*) INTO n FROM public.material_specification_parameters p
    JOIN public.material_specifications s ON s.id=p.specification_id
   WHERE s.company_id=c
     AND (p.parameter ILIKE ANY (ARRAY['%lorem%','%placeholder%','%TBD%','%xxx%'])
       OR coalesce(p.expected_text,'') ILIKE ANY (ARRAY['%lorem%','%placeholder%','%TBD%']));
  PERFORM _dk('H','H2 nor in the specification parameters', n=0, n::text);

  --  "Dates that contradict each other" — covered by E4 to E9; restated
  --  as a single pass so a failure anywhere surfaces here too.
  PERFORM _dk('H','H3 the chronology holds end to end',
    (SELECT count(*)=0 FROM _d WHERE section='E' AND NOT ok));

  --  "Data that runs out partway through the demonstration."
  PERFORM _dk('H','H4 approved material has quantity left to dispense',
    (SELECT count(*)=0 FROM public.material_lots
      WHERE company_id=c AND status='approved'
        AND coalesce(quantity_available,0) <= 0));

  PERFORM _dk('H','H5 no approved lot is already past its retest date',
    (SELECT count(*)=0 FROM public.material_lots
      WHERE company_id=c AND status='approved'
        AND retest_due_date IS NOT NULL AND retest_due_date < current_date));

  PERFORM _dk('H','H6 no lot expires during the demonstration window',
    (SELECT count(*)=0 FROM public.material_lots
      WHERE company_id=c AND status='approved'
        AND supplier_expiry_date < current_date + 30));

  --  Every approved lot is actually dispensable, which is the thing the
  --  narrative needs from them.
  PERFORM _dk('H','H7 every approved lot passes the dispensing gate',
    (SELECT count(*)=0 FROM public.material_lots ml
      WHERE ml.company_id=c AND ml.status='approved'
        AND public.material_lot_block_reason(ml.id, 1) IS NOT NULL),
    (SELECT string_agg(ml.lot_number||': '||public.material_lot_block_reason(ml.id,1), '; ')
       FROM public.material_lots ml
      WHERE ml.company_id=c AND ml.status='approved'
        AND public.material_lot_block_reason(ml.id,1) IS NOT NULL));
END
$h$;

-- =====================================================================
--  I. Safety
-- =====================================================================
DO $i$
DECLARE c uuid := public.demo_company_id(); ok boolean; msg text;
BEGIN
  --  The seed must not be reachable by a client.
  PERFORM _dk('I','I1 neither seed nor reset is callable by authenticated',
    NOT has_function_privilege('authenticated',
      'public.demo_seed_pharma_manufacturer(uuid,date,uuid)','EXECUTE')
    AND NOT has_function_privilege('authenticated',
      'public.demo_reset_pharma_manufacturer(uuid)','EXECUTE'));

  PERFORM _dk('I','I2 nor by anon',
    NOT has_function_privilege('anon',
      'public.demo_seed_pharma_manufacturer(uuid,date,uuid)','EXECUTE'));

  --  The reset must refuse a company that is not marked as demo data.
  --  This is the guard that stops it deleting a real company's evidence.
  INSERT INTO public.companies(id,name)
  VALUES ('d0000000-0000-4000-a000-00000000beef','A Real Customer Ltd')
  ON CONFLICT (id) DO NOTHING;

  ok := false; msg := NULL;
  BEGIN
    PERFORM public.demo_reset_pharma_manufacturer('d0000000-0000-4000-a000-00000000beef');
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%DEMO_RESET_REFUSED%'; msg := SQLERRM;
  END;
  PERFORM _dk('I','I3 the reset refuses an unmarked company', ok, msg);

  --  Including one that exists but has settings without the marker.
  INSERT INTO public.company_settings(company_id,name,project_name)
  VALUES ('d0000000-0000-4000-a000-00000000beef','A Real Customer Ltd','Their Real Project')
  ON CONFLICT (company_id) DO UPDATE SET project_name=excluded.project_name;
  ok := false;
  BEGIN
    PERFORM public.demo_reset_pharma_manufacturer('d0000000-0000-4000-a000-00000000beef');
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%DEMO_RESET_REFUSED%';
  END;
  PERFORM _dk('I','I4 and one whose project name is simply something else', ok);

  --  The seed needs an actor; it creates none.
  ok := false;
  BEGIN PERFORM public.demo_seed_pharma_manufacturer(NULL);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%NO_ACTOR%'; END;
  PERFORM _dk('I','I5 the seed refuses to run without a named actor', ok);

  --  And it left no password anywhere, so no environment gains a known
  --  login from having been seeded.
  PERFORM _dk('I','I6 the seed set no passwords',
    (SELECT count(*)=0 FROM auth.users u
      WHERE u.id IN (SELECT user_id FROM public.company_members WHERE company_id=c)
        AND u.encrypted_password IS NOT NULL
        AND u.id <> 'd0000000-0000-4000-a000-0000000000f1'));

  DELETE FROM public.company_settings WHERE company_id='d0000000-0000-4000-a000-00000000beef';
  DELETE FROM public.companies WHERE id='d0000000-0000-4000-a000-00000000beef';
END
$i$;

\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo '  ITEM 11 — SEEDED DEMONSTRATION DATA'
\echo '════════════════════════════════════════════════════════════════'
SELECT section, count(*) AS assertions, count(*) FILTER (WHERE NOT ok) AS failures
  FROM _d GROUP BY section ORDER BY section;
SELECT section, name, coalesce(left(detail,90),'') AS detail FROM _d WHERE NOT ok ORDER BY section, name;
SELECT count(*) AS total, count(*) FILTER (WHERE ok) AS passed,
       count(*) FILTER (WHERE NOT ok) AS failed FROM _d;

DO $v$
DECLARE f integer;
BEGIN
  SELECT count(*) INTO f FROM _d WHERE NOT ok;
  IF f > 0 THEN RAISE EXCEPTION 'ITEM 11: % assertion(s) failed', f; END IF;
  RAISE NOTICE 'ITEM 11: all assertions passed';
END
$v$;
