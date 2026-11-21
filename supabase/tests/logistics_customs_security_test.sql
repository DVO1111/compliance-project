-- =====================================================================
--  LOGISTICS AND CUSTOMS — SECURITY AND RULE AUTHORITY
--
--  A. RLS posture across all five tables
--  B. Cross-tenant reads and writes, with a second company's credentials
--  C. anon
--  D. The CN22 flag is the database's, not the browser's
--  E. Clearing a flag is attributable, and does not erase the reason
--  F. shipment_events.event_type is constrained
--  G. The rule's constants, pinned for the TypeScript copy to match
--
--  WHY THIS SUITE EXISTS
--  ---------------------
--  The Logistics domain — shipments, their event history, CN22/CN23
--  declarations, contraband rejections and customer flags — is in the
--  pilot by product decision D2, and had NO test of any kind: no SQL
--  assertions and no unit tests. Five tables carrying customs
--  declarations and custody history were relying on policies nobody had
--  exercised.
--
--  Sections A to C are the isolation the tables already claimed.
--  Sections D to F are the three things 20261203000000 changed, and
--  they are written so that reverting that migration fails here rather
--  than passing quietly.
-- =====================================================================
\set ON_ERROR_STOP on
SET client_min_messages = warning;

CREATE TEMP TABLE _s(section text, name text, ok boolean, detail text);
CREATE OR REPLACE FUNCTION _sk(p_section text, p_name text, p_ok boolean, p_detail text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO _s VALUES (p_section,p_name,coalesce(p_ok,false),p_detail); END $$;

--  Sections B to F record results while running AS the role under test.
GRANT ALL ON _s TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION _sk(text,text,boolean,text) TO anon, authenticated, service_role;


-- ── Fixture: two companies, two real signed-in admins ────────────────
DO $fx$
DECLARE
  ca uuid := '00000000-0000-7a00-a000-000000000001';
  cb uuid := '00000000-0000-7a00-a000-000000000002';
  ua uuid := '00000000-0000-7a00-b000-000000000001';
  ub uuid := '00000000-0000-7a00-b000-000000000002';
  sa uuid := '00000000-0000-7a00-c000-000000000001';
BEGIN
  INSERT INTO public.companies(id,name) VALUES (ca,'LC Alpha'), (cb,'LC Bravo')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO auth.users(id,email) VALUES (ua,'lc-a@local.test'), (ub,'lc-b@local.test')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.profiles(id,email,full_name,role,company_id) VALUES
    (ua,'lc-a@local.test','Ada Alpha','admin',ca),
    (ub,'lc-b@local.test','Bo Bravo','admin',cb) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.company_members(company_id,user_id,role,status) VALUES
    (ca,ua,'owner','active'), (cb,ub,'owner','active') ON CONFLICT DO NOTHING;

  --  All company A.
  INSERT INTO public.shipments
    (id,company_id,reference,description,service_type,status,declared_value_gbp,created_by)
  VALUES (sa,ca,'LC-SHIP-0001','Alpha confidential consignment','Air Freight','created',120.00,ua)
    ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.shipment_events
    (id,company_id,shipment_id,event_type,location,created_by)
  VALUES ('00000000-0000-7a00-d000-000000000001',ca,sa,'collected','Ibadan',ua)
    ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.cn_declarations
    (id,company_id,shipment_id,shipment_ref,declaration_type,sender_name,recipient_name,
     contents_description,reason_for_export,total_value_gbp,total_weight_kg,created_by)
  VALUES ('00000000-0000-7a00-e000-000000000001',ca,sa,'LC-SHIP-0001','CN22',
          'Alpha Pharma','Accra Depot','Paracetamol 500 mg tablets, 2000 units',
          'sale',120.00,4.200,ua)
    ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.contraband_rejection_log
    (id,company_id,shipment_ref,items_found,rejection_reason,description,
     reporter_id,customer_name,customer_email,status)
  VALUES ('00000000-0000-7a00-f000-000000000001',ca,'LC-SHIP-0001',
          ARRAY['Undeclared pharmaceutical sample'],'Prohibited Item — Narcotics/Drugs',
          'Found during intake screening',ua,'Alpha Sender','sender@alpha.test','rejected')
    ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.customer_flags
    (id,company_id,customer_name,identifier_type,identifier_value,flag_type,
     flag_reason,flagged_by,status)
  VALUES ('00000000-0000-7a00-f100-000000000001',ca,'Alpha Sender','email',
          'repeat@alpha.test','repeat_offender',
          'Three rejected consignments in a month',ua,'active')
    ON CONFLICT (id) DO NOTHING;
END
$fx$;


-- =====================================================================
--  A — RLS posture
-- =====================================================================
DO $a$
DECLARE t text; v_on boolean; v_pol integer;
BEGIN
  FOREACH t IN ARRAY ARRAY['shipments','shipment_events','cn_declarations',
                           'contraband_rejection_log','customer_flags']
  LOOP
    SELECT relrowsecurity INTO v_on
      FROM pg_class WHERE oid = ('public.'||t)::regclass;
    PERFORM _sk('A', 'A1 '||t||' has RLS enabled', coalesce(v_on,false));

    SELECT count(*) INTO v_pol FROM pg_policies
     WHERE schemaname='public' AND tablename=t;
    PERFORM _sk('A', 'A2 '||t||' carries at least one policy', v_pol > 0,
                v_pol||' policy(ies)');
  END LOOP;
END
$a$;


--  Everything below runs as company B's admin.
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-7a00-b000-000000000002","role":"authenticated"}', false);
SET ROLE authenticated;


-- =====================================================================
--  B — a legitimate user of another tenant sees and writes nothing
-- =====================================================================
DO $b$
DECLARE n integer; v_err text;
BEGIN
  PERFORM _sk('B','B0 the caller is really company B''s admin',
              (SELECT company_id FROM public.profiles WHERE id = auth.uid())
                = '00000000-0000-7a00-a000-000000000002');

  SELECT count(*) INTO n FROM public.shipments;
  PERFORM _sk('B','B1 sees none of company A''s shipments', n = 0, n||' row(s)');

  SELECT count(*) INTO n FROM public.shipment_events;
  PERFORM _sk('B','B2 sees none of company A''s shipment events', n = 0, n||' row(s)');

  SELECT count(*) INTO n FROM public.cn_declarations;
  PERFORM _sk('B','B3 sees none of company A''s declarations', n = 0, n||' row(s)');

  SELECT count(*) INTO n FROM public.contraband_rejection_log;
  PERFORM _sk('B','B4 sees none of company A''s rejections', n = 0, n||' row(s)');

  SELECT count(*) INTO n FROM public.customer_flags;
  PERFORM _sk('B','B5 sees none of company A''s customer flags', n = 0, n||' row(s)');

  --  Writing INTO another tenant, which is the attack the reads above
  --  only imply.
  BEGIN
    INSERT INTO public.shipments(company_id,reference,created_by)
    VALUES ('00000000-0000-7a00-a000-000000000001','LC-INJECT-0001',auth.uid());
    PERFORM _sk('B','B6 cannot file a shipment against company A', false,
                'the insert succeeded');
  EXCEPTION WHEN others THEN
    v_err := SQLSTATE;
    PERFORM _sk('B','B6 cannot file a shipment against company A', true, 'SQLSTATE '||v_err);
  END;

  BEGIN
    INSERT INTO public.cn_declarations
      (company_id,shipment_ref,declaration_type,sender_name,recipient_name,
       contents_description,reason_for_export,total_value_gbp,total_weight_kg,created_by)
    VALUES ('00000000-0000-7a00-a000-000000000001','LC-SHIP-0001','CN22','X','Y',
            'Injected declaration','sale',10,1,auth.uid());
    PERFORM _sk('B','B7 cannot file a declaration against company A', false,
                'the insert succeeded');
  EXCEPTION WHEN others THEN
    v_err := SQLSTATE;
    PERFORM _sk('B','B7 cannot file a declaration against company A', true, 'SQLSTATE '||v_err);
  END;

  --  An UPDATE that matches no row "succeeds" with zero rows, so the
  --  assertion has to be on the row count and not on the absence of an
  --  error. This is the silent-filter trap.
  UPDATE public.cn_declarations SET contents_description = 'tampered'
   WHERE id = '00000000-0000-7a00-e000-000000000001';
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM _sk('B','B8 cannot amend company A''s declaration', n = 0, n||' row(s) updated');

  DELETE FROM public.shipment_events
   WHERE id = '00000000-0000-7a00-d000-000000000001';
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM _sk('B','B9 cannot delete company A''s custody history', n = 0, n||' row(s) deleted');
END
$b$;

RESET ROLE;
SELECT set_config('request.jwt.claims','',false);


-- =====================================================================
--  C — anon
-- =====================================================================
SET ROLE anon;
DO $c$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM public.shipments;
  PERFORM _sk('C','C1 anon reads no shipments', n = 0, n||' row(s)');
  SELECT count(*) INTO n FROM public.cn_declarations;
  PERFORM _sk('C','C2 anon reads no declarations', n = 0, n||' row(s)');
  SELECT count(*) INTO n FROM public.contraband_rejection_log;
  PERFORM _sk('C','C3 anon reads no rejections', n = 0, n||' row(s)');
  SELECT count(*) INTO n FROM public.customer_flags;
  PERFORM _sk('C','C4 anon reads no customer flags', n = 0, n||' row(s)');
END
$c$;
RESET ROLE;


-- =====================================================================
--  D — the CN22 flag belongs to the database
--
--  Each insert below sends `is_flagged => false` DELIBERATELY, the way
--  a direct API call would. Before 20261203000000 the row was stored
--  exactly as sent.
-- =====================================================================
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-7a00-b000-000000000001","role":"authenticated"}', false);
SET ROLE authenticated;

DO $d$
DECLARE
  ca uuid := '00000000-0000-7a00-a000-000000000001';
  v_flagged boolean; v_reason text;
BEGIN
  --  D1: a CN22 well above the GBP 270 threshold, filed as clean.
  INSERT INTO public.cn_declarations
    (id,company_id,shipment_ref,declaration_type,sender_name,recipient_name,
     contents_description,reason_for_export,total_value_gbp,total_weight_kg,
     is_flagged,flag_reason,created_by)
  VALUES ('00000000-0000-7a00-e000-000000000002',ca,'LC-SHIP-0002','CN22','A','B',
          'Ibuprofen 400 mg tablets, 10000 units','sale',5000.00,40.000,
          false, NULL, auth.uid());

  SELECT is_flagged, flag_reason INTO v_flagged, v_reason
    FROM public.cn_declarations WHERE id='00000000-0000-7a00-e000-000000000002';
  PERFORM _sk('D','D1 a CN22 over the threshold is flagged even when filed as clean',
              v_flagged, 'is_flagged='||coalesce(v_flagged::text,'null'));
  PERFORM _sk('D','D2 and the stored reason names the threshold',
              v_reason LIKE '%CN22 threshold of £270%', coalesce(v_reason,'(null)'));

  --  D3: a vague contents description, also filed as clean.
  INSERT INTO public.cn_declarations
    (id,company_id,shipment_ref,declaration_type,sender_name,recipient_name,
     contents_description,reason_for_export,total_value_gbp,total_weight_kg,
     is_flagged,created_by)
  VALUES ('00000000-0000-7a00-e000-000000000003',ca,'LC-SHIP-0003','CN22','A','B',
          '  Miscellaneous  ','gift',20.00,1.000,false,auth.uid());

  SELECT is_flagged, flag_reason INTO v_flagged, v_reason
    FROM public.cn_declarations WHERE id='00000000-0000-7a00-e000-000000000003';
  PERFORM _sk('D','D3 a vague description is flagged, trimmed and case-folded',
              v_flagged, 'is_flagged='||coalesce(v_flagged::text,'null'));
  PERFORM _sk('D','D4 and its reason is the description one, not the threshold one',
              v_reason LIKE '%Vague contents description%', coalesce(v_reason,'(null)'));

  --  D5: a specific CN23 at the same value is NOT flagged — the rule
  --  has to let a correct declaration through or it says nothing.
  INSERT INTO public.cn_declarations
    (id,company_id,shipment_ref,declaration_type,sender_name,recipient_name,
     contents_description,reason_for_export,total_value_gbp,total_weight_kg,
     is_flagged,flag_reason,created_by)
  VALUES ('00000000-0000-7a00-e000-000000000004',ca,'LC-SHIP-0004','CN23','A','B',
          'Ibuprofen 400 mg tablets, 10000 units','sale',5000.00,40.000,
          true,'a reason the caller made up',auth.uid());

  SELECT is_flagged, flag_reason INTO v_flagged, v_reason
    FROM public.cn_declarations WHERE id='00000000-0000-7a00-e000-000000000004';
  PERFORM _sk('D','D5 a correct CN23 at the same value is not flagged',
              NOT v_flagged, 'is_flagged='||coalesce(v_flagged::text,'null'));
  PERFORM _sk('D','D6 and a flag reason invented by the caller is discarded',
              v_reason IS NULL, coalesce(v_reason,'(null)'));

  --  D7: raising the value by UPDATE flags it, so the rule is not
  --  insert-only.
  UPDATE public.cn_declarations
     SET declaration_type='CN22'
   WHERE id='00000000-0000-7a00-e000-000000000004';
  SELECT is_flagged INTO v_flagged
    FROM public.cn_declarations WHERE id='00000000-0000-7a00-e000-000000000004';
  PERFORM _sk('D','D7 switching it to CN22 by update flags it', v_flagged);
END
$d$;


-- =====================================================================
--  E — clearing a flag is attributable, and keeps the reason
-- =====================================================================
DO $e$
DECLARE
  v_flagged boolean; v_reason text; v_by uuid; v_at timestamptz; v_err text; n integer;
BEGIN
  --  E1: switching is_flagged off on its own does nothing. This is the
  --  exact call the old client made.
  UPDATE public.cn_declarations
     SET is_flagged = false, flag_reason = NULL
   WHERE id='00000000-0000-7a00-e000-000000000002';
  SELECT is_flagged, flag_reason INTO v_flagged, v_reason
    FROM public.cn_declarations WHERE id='00000000-0000-7a00-e000-000000000002';
  PERFORM _sk('E','E1 is_flagged cannot simply be switched off', v_flagged);
  PERFORM _sk('E','E2 and the reason is not erased by trying',
              v_reason LIKE '%CN22 threshold%', coalesce(v_reason,'(null)'));

  --  E3: a resolution clears it, and is recorded.
  UPDATE public.cn_declarations
     SET flag_resolved_by = auth.uid(), flag_resolution_note = 'CN23 filed separately'
   WHERE id='00000000-0000-7a00-e000-000000000002';
  SELECT is_flagged, flag_reason, flag_resolved_by, flag_resolved_at
    INTO v_flagged, v_reason, v_by, v_at
    FROM public.cn_declarations WHERE id='00000000-0000-7a00-e000-000000000002';
  PERFORM _sk('E','E3 a resolution clears the flag', NOT v_flagged);
  PERFORM _sk('E','E4 the resolver is recorded', v_by = auth.uid());
  PERFORM _sk('E','E5 the time is stamped even though the caller sent none',
              v_at IS NOT NULL);
  PERFORM _sk('E','E6 the original reason survives the resolution',
              v_reason LIKE '%CN22 threshold%', coalesce(v_reason,'(null)'));

  --  E7: resolving something that was never flagged is refused rather
  --  than silently recorded as a review that did not happen.
  BEGIN
    UPDATE public.cn_declarations
       SET flag_resolved_by = auth.uid()
     WHERE id='00000000-0000-7a00-e000-000000000001';
    PERFORM _sk('E','E7 cannot resolve a declaration that was not flagged', false,
                'the update succeeded');
  EXCEPTION WHEN others THEN
    v_err := SQLERRM;
    PERFORM _sk('E','E7 cannot resolve a declaration that was not flagged',
                v_err LIKE 'CN_FLAG_NOT_RAISED%', v_err);
  END;

  --  E8: correcting the data clears the flag with no resolver, because
  --  nobody is accepting anything.
  UPDATE public.cn_declarations
     SET contents_description = 'Cotton face masks, 500 units'
   WHERE id='00000000-0000-7a00-e000-000000000003';
  SELECT is_flagged, flag_resolved_by INTO v_flagged, v_by
    FROM public.cn_declarations WHERE id='00000000-0000-7a00-e000-000000000003';
  PERFORM _sk('E','E8 correcting a vague description clears the flag', NOT v_flagged);
  PERFORM _sk('E','E9 and records no resolver, because none was needed', v_by IS NULL);

  --  E10: a resolved row's resolution is not editable.
  UPDATE public.cn_declarations
     SET flag_resolved_by = NULL, flag_resolved_at = NULL
   WHERE id='00000000-0000-7a00-e000-000000000002';
  GET DIAGNOSTICS n = ROW_COUNT;
  SELECT flag_resolved_by INTO v_by
    FROM public.cn_declarations WHERE id='00000000-0000-7a00-e000-000000000002';
  PERFORM _sk('E','E10 a recorded resolution cannot be un-recorded',
              v_by IS NOT NULL, n||' row(s) updated, resolver '||coalesce(v_by::text,'null'));
END
$e$;


-- =====================================================================
--  F — shipment_events.event_type
-- =====================================================================
DO $f$
DECLARE
  ca uuid := '00000000-0000-7a00-a000-000000000001';
  sa uuid := '00000000-0000-7a00-c000-000000000001';
  v_err text;
BEGIN
  BEGIN
    INSERT INTO public.shipment_events(company_id,shipment_id,event_type,created_by)
    VALUES (ca,sa,'teleported',auth.uid());
    PERFORM _sk('F','F1 an invented event type is refused', false, 'the insert succeeded');
  EXCEPTION WHEN check_violation THEN
    PERFORM _sk('F','F1 an invented event type is refused', true, 'check_violation');
  WHEN others THEN
    v_err := SQLSTATE;
    PERFORM _sk('F','F1 an invented event type is refused', false,
                'refused, but with SQLSTATE '||v_err||' rather than a check violation');
  END;

  BEGIN
    INSERT INTO public.shipment_events(company_id,shipment_id,event_type,created_by)
    VALUES (ca,sa,'customs_import_cleared',auth.uid());
    PERFORM _sk('F','F2 one of the sixteen is accepted', true);
  EXCEPTION WHEN others THEN
    v_err := SQLERRM;
    PERFORM _sk('F','F2 one of the sixteen is accepted', false, v_err);
  END;
END
$f$;

RESET ROLE;
SELECT set_config('request.jwt.claims','',false);


-- =====================================================================
--  G — the rule's constants
--
--  Pinned here so that changing the threshold or the vague-description
--  list in SQL without changing the TypeScript copy — or the reverse —
--  fails a test. src/tests/logisticsCustoms.test.ts asserts the same
--  numbers from the other side.
-- =====================================================================
DO $g$
DECLARE v_reason text; n integer;
BEGIN
  PERFORM _sk('G','G1 the function exists and is immutable',
              (SELECT provolatile = 'i' FROM pg_proc
                WHERE oid = 'public.cn_declaration_flag_reason(text,numeric,text)'::regprocedure));

  --  Exactly at the threshold is clean; a penny over is not.
  v_reason := public.cn_declaration_flag_reason('CN22', 270.00, 'Specific goods');
  PERFORM _sk('G','G2 GBP 270.00 exactly is not flagged', v_reason IS NULL,
              coalesce(v_reason,'(null)'));
  v_reason := public.cn_declaration_flag_reason('CN22', 270.01, 'Specific goods');
  PERFORM _sk('G','G3 GBP 270.01 is flagged', v_reason IS NOT NULL,
              coalesce(v_reason,'(null)'));

  --  The eleven vague descriptions, counted rather than listed twice.
  SELECT count(*) INTO n FROM (
    SELECT unnest(ARRAY['items','goods','stuff','personal','misc','miscellaneous',
                        'various','personal effects','personal belongings','clothing','gift']) AS d
  ) t WHERE public.cn_declaration_flag_reason('CN23', 10, t.d) IS NOT NULL;
  PERFORM _sk('G','G4 all eleven vague descriptions are flagged', n = 11, n||' of 11');

  --  A null value must not be treated as "above the threshold".
  v_reason := public.cn_declaration_flag_reason('CN22', NULL, 'Specific goods');
  PERFORM _sk('G','G5 a null declared value is not flagged as over-threshold',
              v_reason IS NULL, coalesce(v_reason,'(null)'));

  --  The trigger is attached, and to both statements.
  SELECT count(*) INTO n FROM pg_trigger
   WHERE tgrelid = 'public.cn_declarations'::regclass
     AND tgname = 'trg_cn_declaration_flag' AND NOT tgisinternal;
  PERFORM _sk('G','G6 the trigger is attached to cn_declarations', n = 1);
END
$g$;


\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo '  LOGISTICS AND CUSTOMS — SECURITY AND RULE AUTHORITY'
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
  IF f > 0 THEN RAISE EXCEPTION 'LOGISTICS AND CUSTOMS: % assertion(s) failed', f; END IF;
  RAISE NOTICE 'LOGISTICS AND CUSTOMS: all assertions passed';
END
$v$;
