-- =====================================================================
--  WEEK 3 / ITEM 05 — INCOMING CERTIFICATE OF ANALYSIS VERIFICATION
--
--  A. The specification model
--  B. Comparison, parameter by parameter
--  C. Discrepancies flagged on the lot
--  D. Surfaced to QA and procurement
--  E. A lot cannot be released while its certificate is unverified
--  F. The "NOT DONE IF" clauses
--  G. The Week 6 deviation linkage point
--  H. Tenancy
-- =====================================================================
\set ON_ERROR_STOP on
SET client_min_messages = warning;

CREATE TEMP TABLE _c(section text, name text, ok boolean, detail text);
CREATE OR REPLACE FUNCTION _cc(p_section text, p_name text, p_ok boolean, p_detail text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO _c VALUES (p_section,p_name,coalesce(p_ok,false),p_detail); END $$;

DO $fix$
DECLARE
  c_a uuid := '00000000-0000-4000-c000-0000000000a1';
  c_b uuid := '00000000-0000-4000-c000-0000000000b1';
  u_a uuid := '00000000-0000-4000-c000-0000000000a2';
  u_q uuid := '00000000-0000-4000-c000-0000000000a3';
  u_p uuid := '00000000-0000-4000-c000-0000000000a4';
  u_b uuid := '00000000-0000-4000-c000-0000000000b2';
  m_std uuid; m_crit uuid; spec uuid;
BEGIN
  DELETE FROM public.notifications WHERE type = 'material_coa_discrepancy';
  DELETE FROM public.material_coa_discrepancies WHERE company_id IN (c_a,c_b);
  DELETE FROM public.material_certificates_of_analysis WHERE company_id IN (c_a,c_b);
  DELETE FROM public.material_specification_parameters
   WHERE specification_id IN (SELECT id FROM public.material_specifications WHERE company_id IN (c_a,c_b));
  DELETE FROM public.material_specifications WHERE company_id IN (c_a,c_b);
  DELETE FROM public.material_notification_recipients WHERE company_id IN (c_a,c_b);
  DELETE FROM public.material_lot_alerts WHERE company_id IN (c_a,c_b);
  DELETE FROM public.entity_state_history
   WHERE entity_type IN ('material_lot','supplier') AND company_id IN (c_a,c_b);
  DELETE FROM public.entity_current_state
   WHERE entity_type IN ('material_lot','supplier') AND company_id IN (c_a,c_b);
  DELETE FROM public.material_lots WHERE company_id IN (c_a,c_b);
  DELETE FROM public.suppliers     WHERE company_id IN (c_a,c_b);
  DELETE FROM public.materials     WHERE company_id IN (c_a,c_b);
  DELETE FROM public.company_numbering_formats WHERE company_id IN (c_a,c_b);

  INSERT INTO public.companies(id,name) VALUES (c_a,'CoA Pharma') ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.companies(id,name) VALUES (c_b,'Rival Labs') ON CONFLICT (id) DO NOTHING;
  INSERT INTO auth.users(id,email) VALUES
    (u_a,'admin@coa.test'),(u_q,'qa@coa.test'),(u_p,'buyer@coa.test'),(u_b,'admin@rival.test')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.profiles(id,email,company_id,role) VALUES
    (u_a,'admin@coa.test',c_a,'admin'),(u_q,'qa@coa.test',c_a,'compliance_officer'),
    (u_p,'buyer@coa.test',c_a,'content_creator'),(u_b,'admin@rival.test',c_b,'admin')
  ON CONFLICT (id) DO UPDATE SET company_id=excluded.company_id, role=excluded.role;
  INSERT INTO public.company_members(company_id,user_id,role) VALUES
    (c_a,u_a,'admin'),(c_a,u_q,'member'),(c_a,u_p,'member'),(c_b,u_b,'admin')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.company_numbering_formats(company_id,scope,pattern,prefix,seq_width)
  VALUES (c_a,'material_lot','{PREFIX}-{SEQ}','CP',4) ON CONFLICT (company_id,scope) DO NOTHING;
  INSERT INTO public.company_numbering_formats(company_id,scope,pattern,prefix,seq_width)
  VALUES (c_b,'material_lot','{PREFIX}-{SEQ}','RL',4) ON CONFLICT (company_id,scope) DO NOTHING;

  INSERT INTO public.materials(company_id,code,name,material_type,criticality,unit_of_measure,created_by)
  VALUES (c_a,'PARA','Paracetamol BP','active_ingredient','standard','kg',u_a) RETURNING id INTO m_std;
  INSERT INTO public.materials(company_id,code,name,material_type,criticality,unit_of_measure,created_by)
  VALUES (c_a,'API-CRIT','Critical API','active_ingredient','critical','kg',u_a) RETURNING id INTO m_crit;
  INSERT INTO public.materials(company_id,code,name,material_type,created_by)
  VALUES (c_b,'THEIRS','Their material','excipient',u_b);

  --  An effective specification covering every limit type, so the
  --  comparison rules are each exercised by a real parameter.
  INSERT INTO public.material_specifications(company_id,material_id,version,reference,status,effective_date,created_by)
  VALUES (c_a,m_std,'3.0','SPEC-PARA-003','effective',current_date - 100,u_a)
  RETURNING id INTO spec;

  INSERT INTO public.material_specification_parameters
    (specification_id,parameter,unit,limit_type,min_value,max_value,expected_text,is_critical,sort_order) VALUES
    (spec,'Assay',           '%','range', 98.0, 102.0, NULL,         true , 10),
    (spec,'Water content',   '%','max',   NULL,   0.5, NULL,         false, 20),
    (spec,'Residue',         '%','min',    0.1,  NULL, NULL,         false, 30),
    (spec,'Appearance',      NULL,'exact_text', NULL,NULL,'White crystalline powder', false, 40),
    (spec,'Identification',  NULL,'complies',   NULL,NULL,NULL,      true , 50),
    (spec,'Heavy metals',    NULL,'absent',     NULL,NULL,NULL,      true , 60);
END
$fix$;

-- =====================================================================
--  A. The specification model
-- =====================================================================
DO $a$
DECLARE
  c_a uuid := '00000000-0000-4000-c000-0000000000a1';
  u_a uuid := '00000000-0000-4000-c000-0000000000a2';
  m uuid; ok boolean;
BEGIN
  SELECT id INTO m FROM public.materials WHERE company_id=c_a AND code='PARA';

  PERFORM _cc('A','A1 an effective specification exists with its parameters',
    (SELECT count(*)=6 FROM public.material_specification_parameters p
       JOIN public.material_specifications s ON s.id=p.specification_id
      WHERE s.material_id=m AND s.status='effective'));

  --  Two effective specifications would make "the internal
  --  specification" ambiguous.
  ok := false;
  BEGIN
    INSERT INTO public.material_specifications(company_id,material_id,version,status,created_by)
    VALUES (c_a,m,'4.0','effective',u_a);
  EXCEPTION WHEN unique_violation THEN ok := true;
  END;
  PERFORM _cc('A','A2 only one effective specification per material', ok);

  --  A draft alongside it is fine, which is how a revision is prepared.
  INSERT INTO public.material_specifications(company_id,material_id,version,status,created_by)
  VALUES (c_a,m,'4.0-draft','draft',u_a);
  PERFORM _cc('A','A3 a draft revision may coexist',
    (SELECT count(*)=1 FROM public.material_specifications
      WHERE material_id=m AND status='draft'));

  --  A limit must carry the fields its type needs, or the comparison has
  --  nothing to compare and would quietly pass.
  DECLARE s4 uuid;
  BEGIN
    SELECT id INTO s4 FROM public.material_specifications WHERE material_id=m AND status='draft';
    ok := false;
    BEGIN
      INSERT INTO public.material_specification_parameters(specification_id,parameter,limit_type)
      VALUES (s4,'Bad range','range');          -- no min, no max
    EXCEPTION WHEN check_violation THEN ok := true;
    END;
    PERFORM _cc('A','A4 a range with no bounds is refused', ok);

    ok := false;
    BEGIN
      INSERT INTO public.material_specification_parameters(specification_id,parameter,limit_type,min_value,max_value)
      VALUES (s4,'Backwards','range',10,1);
    EXCEPTION WHEN check_violation THEN ok := true;
    END;
    PERFORM _cc('A','A5 an inverted range is refused', ok);

    ok := false;
    BEGIN
      INSERT INTO public.material_specification_parameters(specification_id,parameter,limit_type)
      VALUES (s4,'Empty text','exact_text');
    EXCEPTION WHEN check_violation THEN ok := true;
    END;
    PERFORM _cc('A','A6 exact_text with nothing to match is refused', ok);
  END;
END
$a$;

-- =====================================================================
--  B. The comparison itself
-- =====================================================================
DO $b$
DECLARE v text;
BEGIN
  --  material_spec_evaluate is the rule in isolation. Each limit type,
  --  each verdict.
  PERFORM _cc('B','B1 range: inside passes',
              public.material_spec_evaluate('range',98,102,NULL,99.4,'99.4')='pass');
  PERFORM _cc('B','B2 range: below fails',
              public.material_spec_evaluate('range',98,102,NULL,97.9,'97.9')='fail');
  PERFORM _cc('B','B3 range: above fails',
              public.material_spec_evaluate('range',98,102,NULL,102.1,'102.1')='fail');
  PERFORM _cc('B','B4 range: boundaries are inclusive',
              public.material_spec_evaluate('range',98,102,NULL,98,'98')='pass'
          AND public.material_spec_evaluate('range',98,102,NULL,102,'102')='pass');
  PERFORM _cc('B','B5 max: at the limit passes, over fails',
              public.material_spec_evaluate('max',NULL,0.5,NULL,0.5,'0.5')='pass'
          AND public.material_spec_evaluate('max',NULL,0.5,NULL,0.51,'0.51')='fail');
  PERFORM _cc('B','B6 min: under fails',
              public.material_spec_evaluate('min',0.1,NULL,NULL,0.05,'0.05')='fail');
  PERFORM _cc('B','B7 exact_text matches case-insensitively',
              public.material_spec_evaluate('exact_text',NULL,NULL,'White crystalline powder',NULL,'white CRYSTALLINE powder')='pass');
  PERFORM _cc('B','B8 exact_text rejects something else',
              public.material_spec_evaluate('exact_text',NULL,NULL,'White crystalline powder',NULL,'Off-white powder')='fail');
  PERFORM _cc('B','B9 complies accepts the usual phrasings',
              public.material_spec_evaluate('complies',NULL,NULL,NULL,NULL,'Complies')='pass'
          AND public.material_spec_evaluate('complies',NULL,NULL,NULL,NULL,'Conforms')='pass');
  PERFORM _cc('B','B10 complies rejects a non-conformance',
              public.material_spec_evaluate('complies',NULL,NULL,NULL,NULL,'Does not comply')='fail');
  PERFORM _cc('B','B11 absent accepts a declaration of absence or zero',
              public.material_spec_evaluate('absent',NULL,NULL,NULL,NULL,'Not detected')='pass'
          AND public.material_spec_evaluate('absent',NULL,NULL,NULL,0,'0')='pass');
  PERFORM _cc('B','B12 absent rejects a detected amount',
              public.material_spec_evaluate('absent',NULL,NULL,NULL,12,'12 ppm')='fail');

  --  The cases that must never be read as a pass.
  PERFORM _cc('B','B13 a numeric limit with no number is unparseable, not a pass',
              public.material_spec_evaluate('range',98,102,NULL,NULL,'about right')='unparseable');
  PERFORM _cc('B','B14 complies with nothing stated is unparseable',
              public.material_spec_evaluate('complies',NULL,NULL,NULL,NULL,NULL)='unparseable');
  PERFORM _cc('B','B15 an unknown limit type is unparseable, not a pass',
              public.material_spec_evaluate('something_new',NULL,NULL,NULL,1,'1')='unparseable');
END
$b$;

-- =====================================================================
--  C. Verification end to end, and discrepancies on the lot
-- =====================================================================
DO $c$
DECLARE
  c_a uuid := '00000000-0000-4000-c000-0000000000a1';
  u_a uuid := '00000000-0000-4000-c000-0000000000a2';
  m uuid; l uuid; coa uuid; res jsonb;
BEGIN
  SELECT id INTO m FROM public.materials WHERE company_id=c_a AND code='PARA';
  INSERT INTO public.material_lots(company_id,material_id,quantity_received,created_by)
  VALUES (c_a,m,500,u_a) RETURNING id INTO l;

  --  A clean certificate: every parameter reported, every one within
  --  limits.
  INSERT INTO public.material_certificates_of_analysis
    (company_id,material_lot_id,certificate_number,supplier_results,uploaded_by)
  VALUES (c_a,l,'SUP-COA-001', '[
    {"parameter":"Assay","unit":"%","stated_value":99.4},
    {"parameter":"Water content","unit":"%","stated_value":0.3},
    {"parameter":"Residue","unit":"%","stated_value":0.2},
    {"parameter":"Appearance","stated_text":"White crystalline powder"},
    {"parameter":"Identification","stated_text":"Complies"},
    {"parameter":"Heavy metals","stated_text":"Not detected"}]'::jsonb, u_a)
  RETURNING id INTO coa;

  res := public.material_coa_verify(coa);

  PERFORM _cc('C','C1 all six parameters were checked',
              (res->>'parameters_checked')::int = 6, res::text);
  PERFORM _cc('C','C2 a conforming certificate verifies',
              (SELECT verification_status='verified'
                 FROM public.material_certificates_of_analysis WHERE id=coa));
  PERFORM _cc('C','C3 no discrepancies recorded',
              (SELECT count(*)=0 FROM public.material_coa_discrepancies WHERE certificate_id=coa));
  PERFORM _cc('C','C4 verified_at and verified_by are stamped',
              (SELECT verified_at IS NOT NULL FROM public.material_certificates_of_analysis WHERE id=coa));
END
$c$;

DO $c2$
DECLARE
  c_a uuid := '00000000-0000-4000-c000-0000000000a1';
  u_a uuid := '00000000-0000-4000-c000-0000000000a2';
  m uuid; l uuid; coa uuid; res jsonb;
BEGIN
  SELECT id INTO m FROM public.materials WHERE company_id=c_a AND code='PARA';
  INSERT INTO public.material_lots(company_id,material_id,quantity_received,created_by)
  VALUES (c_a,m,500,u_a) RETURNING id INTO l;

  --  A certificate with one of each kind of problem:
  --    Assay           out of range, and critical
  --    Water content    over its maximum
  --    Residue          omitted entirely
  --    Appearance       wrong text
  --    Identification   a non-conformance
  --    Heavy metals     detected, and critical
  INSERT INTO public.material_certificates_of_analysis
    (company_id,material_lot_id,certificate_number,supplier_results,uploaded_by)
  VALUES (c_a,l,'SUP-COA-002', '[
    {"parameter":"Assay","unit":"%","stated_value":96.2},
    {"parameter":"Water content","unit":"%","stated_value":0.9},
    {"parameter":"Appearance","stated_text":"Pale yellow powder"},
    {"parameter":"Identification","stated_text":"Does not comply"},
    {"parameter":"Heavy metals","stated_text":"18 ppm"}]'::jsonb, u_a)
  RETURNING id INTO coa;

  res := public.material_coa_verify(coa);

  PERFORM _cc('C','C5 a discrepant certificate is marked discrepant',
              (SELECT verification_status='discrepant'
                 FROM public.material_certificates_of_analysis WHERE id=coa));
  --  All six parameters fail: five reported outside their limits and one
  --  not reported at all. An earlier version of this assertion said five,
  --  which was simply a miscount on my part.
  PERFORM _cc('C','C6 all six failures were found',
              (res->>'discrepancies')::int = 6, res::text);
  PERFORM _cc('C','C7 the critical ones are counted separately',
              (res->>'critical')::int = 3, res::text);
  PERFORM _cc('C','C8 the count is mirrored onto the certificate',
              (SELECT discrepancy_count=6
                 FROM public.material_certificates_of_analysis WHERE id=coa));

  --  The omitted parameter is a discrepancy in its own right, not a pass.
  PERFORM _cc('C','C9 a parameter the certificate never reported is flagged',
    (SELECT count(*)=1 FROM public.material_coa_discrepancies
      WHERE certificate_id=coa AND parameter='Residue' AND discrepancy_type='missing_result'));

  --  Flagged ON THE LOT, which is what makes it findable from a lot
  --  screen without going via the certificate.
  PERFORM _cc('C','C10 discrepancies are flagged on the lot',
    (SELECT count(*)=6 FROM public.material_coa_discrepancies WHERE material_lot_id=l));

  --  The limit is recorded, because the specification may be superseded
  --  later and "out of specification" alone would be unreviewable.
  PERFORM _cc('C','C11 the discrepancy records what the limit was',
    (SELECT specification_limit='98.000000 to 102.000000 %'
       FROM public.material_coa_discrepancies
      WHERE certificate_id=coa AND parameter='Assay'),
    (SELECT specification_limit FROM public.material_coa_discrepancies
      WHERE certificate_id=coa AND parameter='Assay'));

  PERFORM _cc('C','C12 and what the supplier stated',
    (SELECT stated_value='96.2' FROM public.material_coa_discrepancies
      WHERE certificate_id=coa AND parameter='Assay'),
    (SELECT stated_value FROM public.material_coa_discrepancies
      WHERE certificate_id=coa AND parameter='Assay'));

  --  Re-verification is idempotent and does not pile up duplicates.
  PERFORM public.material_coa_verify(coa);
  PERFORM _cc('C','C13 re-verification does not duplicate findings',
    (SELECT count(*)=6 FROM public.material_coa_discrepancies WHERE certificate_id=coa));

  --  A resolved discrepancy survives re-verification: someone acted on
  --  it, and discarding that discards the record of the action.
  UPDATE public.material_coa_discrepancies
     SET resolved_at=now(), resolved_by=u_a, resolution_note='Supplier reissued; retest confirms'
   WHERE certificate_id=coa AND parameter='Water content';
  PERFORM public.material_coa_verify(coa);
  PERFORM _cc('C','C14 a resolved discrepancy is not wiped by re-verification',
    (SELECT count(*)=1 FROM public.material_coa_discrepancies
      WHERE certificate_id=coa AND parameter='Water content' AND resolved_at IS NOT NULL));
END
$c2$;

-- =====================================================================
--  D. Surfaced to QA and procurement
-- =====================================================================
DO $d$
DECLARE
  c_a uuid := '00000000-0000-4000-c000-0000000000a1';
  u_a uuid := '00000000-0000-4000-c000-0000000000a2';
  u_q uuid := '00000000-0000-4000-c000-0000000000a3';
  u_p uuid := '00000000-0000-4000-c000-0000000000a4';
  m uuid; l uuid; coa uuid;
BEGIN
  PERFORM _cc('D','D1 the discrepant certificate produced notifications',
    (SELECT count(*) > 0 FROM public.notifications WHERE type='material_coa_discrepancy'));

  --  With no named recipients, the fallback is the QA authority — here
  --  the single admin.
  PERFORM _cc('D','D2 with nobody named, the QA authority is notified',
    (SELECT count(*) > 0 FROM public.notifications
      WHERE type='material_coa_discrepancy' AND recipient_id=u_a));

  --  Name a QA person and a procurement person, then verify again.
  INSERT INTO public.material_notification_recipients(company_id,purpose,user_id)
  VALUES (c_a,'qa',u_q),(c_a,'procurement',u_p) ON CONFLICT DO NOTHING;

  DELETE FROM public.notifications WHERE type='material_coa_discrepancy';

  SELECT id INTO m FROM public.materials WHERE company_id=c_a AND code='PARA';
  INSERT INTO public.material_lots(company_id,material_id,quantity_received,created_by)
  VALUES (c_a,m,100,u_a) RETURNING id INTO l;
  INSERT INTO public.material_certificates_of_analysis
    (company_id,material_lot_id,supplier_results,uploaded_by)
  VALUES (c_a,l,'[{"parameter":"Assay","stated_value":80.0}]'::jsonb,u_a)
  RETURNING id INTO coa;
  PERFORM public.material_coa_verify(coa);

  PERFORM _cc('D','D3 the named QA recipient is notified',
    (SELECT count(*)=1 FROM public.notifications
      WHERE type='material_coa_discrepancy' AND recipient_id=u_q));
  PERFORM _cc('D','D4 the named procurement recipient is notified',
    (SELECT count(*)=1 FROM public.notifications
      WHERE type='material_coa_discrepancy' AND recipient_id=u_p));
  PERFORM _cc('D','D5 and the admin is no longer notified, having been superseded',
    (SELECT count(*)=0 FROM public.notifications
      WHERE type='material_coa_discrepancy' AND recipient_id=u_a));
  PERFORM _cc('D','D6 procurement''s copy says why it concerns them',
    (SELECT message LIKE '%supplier may need to be contacted%'
       FROM public.notifications
      WHERE type='material_coa_discrepancy' AND recipient_id=u_p));
  PERFORM _cc('D','D7 the message names the lot and the count',
    (SELECT message LIKE '%discrepanc%' AND message LIKE '%CP-%'
       FROM public.notifications
      WHERE type='material_coa_discrepancy' AND recipient_id=u_q));

  --  A conforming certificate must not spam anyone.
  DELETE FROM public.notifications WHERE type='material_coa_discrepancy';
  DECLARE l2 uuid; coa2 uuid;
  BEGIN
    INSERT INTO public.material_lots(company_id,material_id,quantity_received,created_by)
    VALUES (c_a,m,100,u_a) RETURNING id INTO l2;
    INSERT INTO public.material_certificates_of_analysis
      (company_id,material_lot_id,supplier_results,uploaded_by)
    VALUES (c_a,l2,'[
      {"parameter":"Assay","stated_value":100.0},
      {"parameter":"Water content","stated_value":0.2},
      {"parameter":"Residue","stated_value":0.3},
      {"parameter":"Appearance","stated_text":"White crystalline powder"},
      {"parameter":"Identification","stated_text":"Complies"},
      {"parameter":"Heavy metals","stated_text":"Absent"}]'::jsonb,u_a)
    RETURNING id INTO coa2;
    PERFORM public.material_coa_verify(coa2);
    PERFORM _cc('D','D8 a clean certificate notifies nobody',
      (SELECT count(*)=0 FROM public.notifications WHERE type='material_coa_discrepancy'));
  END;
END
$d$;

-- =====================================================================
--  E. A lot cannot be released while its certificate is unverified
-- =====================================================================
DO $e$
DECLARE
  c_a uuid := '00000000-0000-4000-c000-0000000000a1';
  u_a uuid := '00000000-0000-4000-c000-0000000000a2';
  m uuid; m_crit uuid; l uuid; coa uuid; ok boolean; r text;
  v_approved uuid;
BEGIN
  SELECT s.id INTO v_approved FROM public.lifecycle_states s
    JOIN public.lifecycle_definitions d ON d.id=s.definition_id
   WHERE d.entity_type='material_lot' AND d.company_id IS NULL AND s.state_key='approved';

  SELECT id INTO m      FROM public.materials WHERE company_id=c_a AND code='PARA';
  SELECT id INTO m_crit FROM public.materials WHERE company_id=c_a AND code='API-CRIT';

  --  A lot with an unverified certificate. The results are complete and
  --  conforming, so that when it is verified below it becomes 'verified'
  --  rather than 'discrepant' — this section is about the verification
  --  state gating release, not about the comparison, which is section C.
  INSERT INTO public.material_lots(company_id,material_id,quantity_received,created_by)
  VALUES (c_a,m,100,u_a) RETURNING id INTO l;
  INSERT INTO public.material_certificates_of_analysis
    (company_id,material_lot_id,supplier_results,uploaded_by)
  VALUES (c_a,l,'[
    {"parameter":"Assay","stated_value":99.0},
    {"parameter":"Water content","stated_value":0.2},
    {"parameter":"Residue","stated_value":0.3},
    {"parameter":"Appearance","stated_text":"White crystalline powder"},
    {"parameter":"Identification","stated_text":"Complies"},
    {"parameter":"Heavy metals","stated_text":"Absent"}]'::jsonb,u_a)
  RETURNING id INTO coa;

  r := public.material_lot_release_block_reason(l);
  PERFORM _cc('E','E1 an unverified certificate blocks release',
              r IS NOT NULL AND r LIKE '%not verified%', r);

  --  And the block is on the transition, not only in a helper: no path
  --  into 'approved' may skip it.
  ok := false;
  BEGIN
    UPDATE public.entity_current_state SET state_id=v_approved
     WHERE entity_type='material_lot' AND entity_id=l;
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%MATERIAL_RELEASE_BLOCKED%';
  END;
  PERFORM _cc('E','E2 the transition into approved is refused', ok);

  --  Verify it, and release becomes possible.
  PERFORM public.material_coa_verify(coa);
  PERFORM _cc('E','E3 once verified, release is no longer blocked',
              public.material_lot_release_block_reason(l) IS NULL,
              coalesce(public.material_lot_release_block_reason(l),'NULL'));

  UPDATE public.entity_current_state SET state_id=v_approved
   WHERE entity_type='material_lot' AND entity_id=l;
  PERFORM _cc('E','E4 and the transition now succeeds',
              (SELECT status='approved' FROM public.material_lots WHERE id=l));

  --  A discrepant certificate is not a verified one.
  DECLARE l2 uuid; coa2 uuid;
  BEGIN
    INSERT INTO public.material_lots(company_id,material_id,quantity_received,created_by)
    VALUES (c_a,m,100,u_a) RETURNING id INTO l2;
    INSERT INTO public.material_certificates_of_analysis
      (company_id,material_lot_id,supplier_results,uploaded_by)
    VALUES (c_a,l2,'[{"parameter":"Assay","stated_value":50.0}]'::jsonb,u_a)
    RETURNING id INTO coa2;
    PERFORM public.material_coa_verify(coa2);
    r := public.material_lot_release_block_reason(l2);
    PERFORM _cc('E','E5 a discrepant certificate still blocks release',
                r IS NOT NULL, r);
    PERFORM _cc('E','E6 and the reason mentions the open discrepancies',
                r LIKE '%open discrepanc%', r);
  END;

  --  A critical material with no certificate at all.
  DECLARE l3 uuid;
  BEGIN
    INSERT INTO public.material_lots(company_id,material_id,quantity_received,created_by)
    VALUES (c_a,m_crit,100,u_a) RETURNING id INTO l3;
    r := public.material_lot_release_block_reason(l3);
    PERFORM _cc('E','E7 a critical material with no certificate is blocked',
                r IS NOT NULL AND r LIKE '%critical material%', r);
  END;

  --  A non-critical material with no certificate is NOT blocked by this
  --  item — the wording is "while ITS certificate is unverified", and
  --  release completeness belongs to item 06. Asserted so the choice is
  --  visible rather than implicit.
  DECLARE l4 uuid;
  BEGIN
    INSERT INTO public.material_lots(company_id,material_id,quantity_received,created_by)
    VALUES (c_a,m,100,u_a) RETURNING id INTO l4;
    PERFORM _cc('E','E8 a standard material with no certificate is not blocked here',
                public.material_lot_release_block_reason(l4) IS NULL,
                coalesce(public.material_lot_release_block_reason(l4),'NULL'));
  END;

  --  Release and dispensing are different questions. The lot released in
  --  E4 is approved, so it is dispensable; a lot still in quarantine is
  --  not, even with a verified certificate.
  PERFORM _cc('E','E9 release and dispensing are separate gates',
              public.material_lot_block_reason(l, 10) IS NULL
          AND public.material_lot_release_block_reason(l) IS NULL);
END
$e$;

-- =====================================================================
--  F. The "NOT DONE IF" clauses
-- =====================================================================
DO $f$
DECLARE
  c_a uuid := '00000000-0000-4000-c000-0000000000a1';
  c_b uuid := '00000000-0000-4000-c000-0000000000b1';
  u_a uuid := '00000000-0000-4000-c000-0000000000a2';
  u_b uuid := '00000000-0000-4000-c000-0000000000b2';
  m_b uuid; l uuid; coa uuid; ok boolean;
BEGIN
  --  "The certificate is stored but never compared against
  --  specification. Filing is not verification."
  --  A material with no effective specification cannot be verified, and
  --  the attempt must RAISE rather than mark it verified against nothing.
  SELECT id INTO m_b FROM public.materials WHERE company_id=c_b AND code='THEIRS';
  INSERT INTO public.company_numbering_formats(company_id,scope,pattern,prefix,seq_width)
  VALUES (c_b,'material_lot','{PREFIX}-{SEQ}','RL',4) ON CONFLICT (company_id,scope) DO NOTHING;
  INSERT INTO public.material_lots(company_id,material_id,quantity_received,created_by)
  VALUES (c_b,m_b,10,u_b) RETURNING id INTO l;
  INSERT INTO public.material_certificates_of_analysis
    (company_id,material_lot_id,supplier_results,uploaded_by)
  VALUES (c_b,l,'[{"parameter":"Assay","stated_value":99.9}]'::jsonb,u_b)
  RETURNING id INTO coa;

  ok := false;
  BEGIN PERFORM public.material_coa_verify(coa);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%COA_NO_SPECIFICATION%'; END;
  PERFORM _cc('F','F1 no specification means it cannot be verified, and raises', ok);

  PERFORM _cc('F','F2 and the certificate was NOT marked verified',
    (SELECT verification_status='unverified'
       FROM public.material_certificates_of_analysis WHERE id=coa));

  --  "Discrepancies recorded but not surfaced to anyone."
  --  Self-contained: section D deletes notifications repeatedly to test
  --  routing, so a global invariant over every certificate would be
  --  measuring that cleanup rather than the code. This verifies a fresh
  --  discrepant certificate and checks that its findings and its notices
  --  arrived together.
  DECLARE l_f uuid; coa_f uuid; n_disc integer; n_notif integer;
  BEGIN
    INSERT INTO public.material_lots(company_id,material_id,quantity_received,created_by)
    SELECT c_a, id, 10, u_a FROM public.materials WHERE company_id=c_a AND code='PARA'
    RETURNING id INTO l_f;
    INSERT INTO public.material_certificates_of_analysis
      (company_id,material_lot_id,supplier_results,uploaded_by)
    VALUES (c_a,l_f,'[{"parameter":"Assay","stated_value":10.0}]'::jsonb,u_a)
    RETURNING id INTO coa_f;

    PERFORM public.material_coa_verify(coa_f);

    SELECT count(*) INTO n_disc  FROM public.material_coa_discrepancies WHERE certificate_id=coa_f;
    SELECT count(*) INTO n_notif FROM public.notifications
     WHERE type='material_coa_discrepancy' AND content_id=coa_f;

    PERFORM _cc('F','F3 a discrepant certificate records findings AND notifies',
                n_disc > 0 AND n_notif > 0, format('%s findings, %s notices', n_disc, n_notif));
  END;

  --  A structured result is required; a bare file is not enough. Item 03
  --  enforces the shape, re-asserted here because it is this item's
  --  second DONE MEANS.
  ok := false;
  BEGIN
    INSERT INTO public.material_certificates_of_analysis(company_id,material_lot_id,supplier_results)
    VALUES (c_a,(SELECT id FROM public.material_lots WHERE company_id=c_a LIMIT 1),'"filed"'::jsonb);
  EXCEPTION WHEN check_violation THEN ok := true;
  END;
  PERFORM _cc('F','F4 results cannot be a bare scalar instead of structure', ok);

  --  Document storage exists alongside the structured data, not instead
  --  of it.
  PERFORM _cc('F','F5 the certificate can carry a stored document too',
    (SELECT count(*)=3 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='material_certificates_of_analysis'
        AND column_name IN ('document_path','document_mime_type','document_size_bytes')));
END
$f$;

-- =====================================================================
--  G. The Week 6 deviation linkage point
-- =====================================================================
DO $g$
DECLARE c_a uuid := '00000000-0000-4000-c000-0000000000a1';
BEGIN
  PERFORM _cc('G','G1 the linkage column exists on every discrepancy',
    EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='material_coa_discrepancies'
               AND column_name='deviation_id'));

  --  Nullable and unconstrained, because the deviation table does not
  --  exist yet. A NOT NULL or an FK here would make this item
  --  un-deployable until Week 6.
  PERFORM _cc('G','G2 it is nullable, so nothing waits on Week 6',
    (SELECT is_nullable='YES' FROM information_schema.columns
      WHERE table_schema='public' AND table_name='material_coa_discrepancies'
        AND column_name='deviation_id'));

  PERFORM _cc('G','G3 no foreign key yet, since the target does not exist',
    NOT EXISTS (SELECT 1 FROM information_schema.key_column_usage k
                 JOIN information_schema.table_constraints tc
                   ON tc.constraint_name=k.constraint_name
                WHERE k.table_name='material_coa_discrepancies'
                  AND k.column_name='deviation_id'
                  AND tc.constraint_type='FOREIGN KEY'));

  --  The backlog is queryable, so discrepancies raised before Week 6 are
  --  not lost when it arrives.
  PERFORM _cc('G','G4 the pending-deviation backlog is a view',
    EXISTS (SELECT 1 FROM information_schema.views
             WHERE table_schema='public'
               AND table_name='material_coa_discrepancies_pending_deviation'));

  PERFORM _cc('G','G5 and it lists this week''s open discrepancies',
    (SELECT count(*) > 0 FROM public.material_coa_discrepancies_pending_deviation
      WHERE company_id=c_a));

  PERFORM _cc('G','G6 the linkage point is marked in the source',
    (SELECT count(*) >= 2 FROM pg_description d
      WHERE d.description LIKE '%WEEK 6 DEVIATION LINKAGE%'));
END
$g$;

-- =====================================================================
--  H. Tenancy
-- =====================================================================
SELECT set_config('test.coa_a',
  (SELECT id::text FROM public.material_certificates_of_analysis
    WHERE company_id='00000000-0000-4000-c000-0000000000a1' LIMIT 1), false) \gset
SELECT set_config('test.lot_a',
  (SELECT id::text FROM public.material_lots
    WHERE company_id='00000000-0000-4000-c000-0000000000a1' LIMIT 1), false) \gset

GRANT INSERT ON _c TO authenticated;
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"00000000-0000-4000-c000-0000000000b2","role":"authenticated"}';

DO $h$
DECLARE
  c_a uuid := '00000000-0000-4000-c000-0000000000a1';
  coa uuid; l uuid; ok boolean; n integer;
BEGIN
  PERFORM _cc('H','H0 the probe is company B''s admin, authenticated',
              current_user='authenticated'
              AND auth.uid()='00000000-0000-4000-c000-0000000000b2', current_user);

  coa := current_setting('test.coa_a', true)::uuid;
  l   := current_setting('test.lot_a', true)::uuid;

  --  material_coa_verify is SECURITY DEFINER and WRITES — discrepancies,
  --  notifications, a verification stamp. It must refuse by itself.
  ok := false;
  BEGIN PERFORM public.material_coa_verify(coa);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%COA_FORBIDDEN%'; END;
  PERFORM _cc('H','H1 verify refuses another company''s certificate', ok);

  ok := false;
  BEGIN PERFORM public.material_lot_release_block_reason(l);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%MATERIAL_FORBIDDEN%'; END;
  PERFORM _cc('H','H2 the release gate refuses another company''s lot', ok);

  SELECT count(*) INTO n FROM public.material_specifications WHERE company_id=c_a;
  PERFORM _cc('H','H3 B cannot read A''s specifications', n=0, n::text);

  SELECT count(*) INTO n FROM public.material_specification_parameters p
    WHERE EXISTS (SELECT 1 FROM public.material_specifications s
                   WHERE s.id=p.specification_id AND s.company_id=c_a);
  PERFORM _cc('H','H4 nor A''s specification parameters', n=0, n::text);

  SELECT count(*) INTO n FROM public.material_coa_discrepancies WHERE company_id=c_a;
  PERFORM _cc('H','H5 nor A''s discrepancies', n=0, n::text);

  SELECT count(*) INTO n FROM public.material_notification_recipients WHERE company_id=c_a;
  PERFORM _cc('H','H6 nor who A notifies', n=0, n::text);

  SELECT count(*) INTO n FROM public.material_coa_discrepancies_pending_deviation WHERE company_id=c_a;
  PERFORM _cc('H','H7 nor A''s deviation backlog through the view', n=0, n::text);

  PERFORM _cc('H','H8 the recipient resolver is not callable by a client',
    NOT has_function_privilege('authenticated','public.material_notice_recipients(uuid,text)','EXECUTE'));
END
$h$;

RESET ROLE;
RESET request.jwt.claims;

DO $h2$
DECLARE c_a uuid := '00000000-0000-4000-c000-0000000000a1'; n integer;
BEGIN
  SELECT count(*) INTO n FROM public.material_specifications WHERE company_id=c_a;
  PERFORM _cc('H','H9 the owner is not locked out', n >= 1, n::text);
END
$h2$;

\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo '  ITEM 05 — INCOMING CoA VERIFICATION'
\echo '════════════════════════════════════════════════════════════════'
SELECT section, count(*) AS assertions, count(*) FILTER (WHERE NOT ok) AS failures
  FROM _c GROUP BY section ORDER BY section;
SELECT section, name, coalesce(detail,'') AS detail FROM _c WHERE NOT ok ORDER BY section, name;
SELECT count(*) AS total, count(*) FILTER (WHERE ok) AS passed,
       count(*) FILTER (WHERE NOT ok) AS failed FROM _c;

DO $v$
DECLARE f integer;
BEGIN
  SELECT count(*) INTO f FROM _c WHERE NOT ok;
  IF f > 0 THEN RAISE EXCEPTION 'ITEM 05: % assertion(s) failed', f; END IF;
  RAISE NOTICE 'ITEM 05: all assertions passed';
END
$v$;
