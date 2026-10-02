-- =====================================================================
--  WEEK 3 / ITEM 04 — MATERIAL QUARANTINE GATE
--
--  A. Receipt lands in quarantine automatically
--  B. Quarantined material cannot be dispensed — the hard block
--  C. Receipt refused from a supplier that cannot supply
--  D. Retest: alerting, and automatic reversion
--  E. The sweep is late — the gate must hold anyway
--  F. Tenancy
--  G. The "NOT DONE IF" clauses
-- =====================================================================
\set ON_ERROR_STOP on
SET client_min_messages = warning;

CREATE TEMP TABLE _q(section text, name text, ok boolean, detail text);
CREATE OR REPLACE FUNCTION _qk(p_section text, p_name text, p_ok boolean, p_detail text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO _q VALUES (p_section,p_name,coalesce(p_ok,false),p_detail); END $$;

DO $fix$
DECLARE
  c_a uuid := '00000000-0000-4000-b000-0000000000a1';
  c_b uuid := '00000000-0000-4000-b000-0000000000b1';
  u_a uuid := '00000000-0000-4000-b000-0000000000a2';
  u_b uuid := '00000000-0000-4000-b000-0000000000b2';
BEGIN
  DELETE FROM public.material_lot_alerts WHERE company_id IN (c_a,c_b);
  DELETE FROM public.entity_state_history
   WHERE entity_type IN ('material_lot','supplier') AND company_id IN (c_a,c_b);
  DELETE FROM public.entity_current_state
   WHERE entity_type IN ('material_lot','supplier') AND company_id IN (c_a,c_b);
  DELETE FROM public.material_certificates_of_analysis WHERE company_id IN (c_a,c_b);
  DELETE FROM public.material_lots           WHERE company_id IN (c_a,c_b);
  DELETE FROM public.suppliers               WHERE company_id IN (c_a,c_b);
  DELETE FROM public.materials               WHERE company_id IN (c_a,c_b);
  DELETE FROM public.material_alert_policies WHERE company_id IN (c_a,c_b);
  DELETE FROM public.company_numbering_formats WHERE company_id IN (c_a,c_b);

  INSERT INTO public.companies(id,name) VALUES (c_a,'Gate Pharma') ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.companies(id,name) VALUES (c_b,'Other Labs')  ON CONFLICT (id) DO NOTHING;
  INSERT INTO auth.users(id,email) VALUES (u_a,'qa@gate.test') ON CONFLICT (id) DO NOTHING;
  INSERT INTO auth.users(id,email) VALUES (u_b,'qa@other.test') ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.profiles(id,email,company_id,role)
  VALUES (u_a,'qa@gate.test',c_a,'admin')
  ON CONFLICT (id) DO UPDATE SET company_id=excluded.company_id, role=excluded.role;
  INSERT INTO public.profiles(id,email,company_id,role)
  VALUES (u_b,'qa@other.test',c_b,'admin')
  ON CONFLICT (id) DO UPDATE SET company_id=excluded.company_id, role=excluded.role;
  INSERT INTO public.company_members(company_id,user_id,role) VALUES (c_a,u_a,'admin') ON CONFLICT DO NOTHING;
  INSERT INTO public.company_members(company_id,user_id,role) VALUES (c_b,u_b,'admin') ON CONFLICT DO NOTHING;

  IF EXISTS (SELECT 1 FROM public.company_members WHERE company_id=c_a AND user_id=u_b) THEN
    RAISE EXCEPTION 'FIXTURE: user B must not be a member of company A';
  END IF;

  INSERT INTO public.company_numbering_formats(company_id,scope,pattern,prefix,seq_width)
  VALUES (c_a,'material_lot','{PREFIX}-{SEQ}','GP',4) ON CONFLICT (company_id,scope) DO NOTHING;
  INSERT INTO public.company_numbering_formats(company_id,scope,pattern,prefix,seq_width)
  VALUES (c_b,'material_lot','{PREFIX}-{SEQ}','OL',4) ON CONFLICT (company_id,scope) DO NOTHING;

  INSERT INTO public.materials(company_id,code,name,material_type,criticality,retest_period_days,unit_of_measure,created_by)
  VALUES (c_a,'LAC','Lactose monohydrate','excipient','standard',730,'kg',u_a);
  INSERT INTO public.materials(company_id,code,name,material_type,retest_period_days,requires_further_processing,created_by)
  VALUES (c_a,'CRUDE','Crude API, needs milling','active_ingredient',365,true,u_a);
  INSERT INTO public.materials(company_id,code,name,material_type,created_by)
  VALUES (c_b,'OTHER','Other company material','excipient',u_b);

  INSERT INTO public.suppliers(company_id,name,code,created_by) VALUES (c_a,'Good Supplier','SUP-OK',u_a);
  INSERT INTO public.suppliers(company_id,name,code,created_by) VALUES (c_a,'Bad Supplier','SUP-BAD',u_a);
  INSERT INTO public.suppliers(company_id,name,code,created_by) VALUES (c_a,'Paused Supplier','SUP-SUSP',u_a);
  INSERT INTO public.suppliers(company_id,name,code,created_by) VALUES (c_b,'Their Supplier','SUP-THEIRS',u_b);

  --  Move the two unusable suppliers into their blocking states through
  --  the engine, which is the only way the mirror can change.
  PERFORM public.lifecycle_transition('supplier',
    (SELECT id FROM public.suppliers WHERE company_id=c_a AND code='SUP-BAD'),
    'disqualify', c_a, u_a, 'Failed audit 2026-08');
  PERFORM public.lifecycle_transition('supplier',
    (SELECT id FROM public.suppliers WHERE company_id=c_a AND code='SUP-OK'),
    'qualify', c_a, u_a, 'Audit passed');
  PERFORM public.lifecycle_transition('supplier',
    (SELECT id FROM public.suppliers WHERE company_id=c_a AND code='SUP-SUSP'),
    'qualify', c_a, u_a, 'Audit passed');
  PERFORM public.lifecycle_transition('supplier',
    (SELECT id FROM public.suppliers WHERE company_id=c_a AND code='SUP-SUSP'),
    'suspend', c_a, u_a, 'Under investigation');
END
$fix$;

-- =====================================================================
--  A. Receipt lands in quarantine automatically
-- =====================================================================
DO $a$
DECLARE
  c_a uuid := '00000000-0000-4000-b000-0000000000a1';
  u_a uuid := '00000000-0000-4000-b000-0000000000a2';
  l uuid; v_state text;
BEGIN
  INSERT INTO public.material_lots(company_id,material_id,supplier_id,quantity_received,received_by,created_by)
  SELECT c_a, m.id, (SELECT id FROM public.suppliers WHERE company_id=c_a AND code='SUP-OK'),
         100, u_a, u_a
    FROM public.materials m WHERE m.company_id=c_a AND m.code='LAC'
  RETURNING id INTO l;

  SELECT s.state_key INTO v_state
    FROM public.entity_current_state ecs
    JOIN public.lifecycle_states s ON s.id=ecs.state_id
   WHERE ecs.entity_type='material_lot' AND ecs.entity_id=l;

  PERFORM _qk('A','A1 receipt lands in quarantine with nobody asking',
              v_state='quarantine', v_state);
  PERFORM _qk('A','A2 and the mirror says so too',
              (SELECT status='quarantine' FROM public.material_lots WHERE id=l));
END
$a$;

-- =====================================================================
--  B. The hard block
-- =====================================================================
DO $b$
DECLARE
  c_a uuid := '00000000-0000-4000-b000-0000000000a1';
  u_a uuid := '00000000-0000-4000-b000-0000000000a2';
  l uuid; r text; ok boolean;
BEGIN
  SELECT id INTO l FROM public.material_lots
   WHERE company_id=c_a AND material_id=(SELECT id FROM public.materials WHERE company_id=c_a AND code='LAC');

  r := public.material_lot_block_reason(l);
  PERFORM _qk('B','B1 a quarantined lot is blocked', r IS NOT NULL, r);
  PERFORM _qk('B','B2 the reason names the lot and the state',
              r LIKE '%in quarantine%' AND r LIKE '%GP-%', r);

  ok := false;
  BEGIN PERFORM public.material_lot_assert_dispensable(l);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%MATERIAL_DISPENSE_BLOCKED%'; END;
  PERFORM _qk('B','B3 assert_dispensable raises for a quarantined lot', ok);

  --  under_test is not dispensable either.
  PERFORM public.lifecycle_transition('material_lot', l, 'sample', c_a, u_a, 'Sampled');
  r := public.material_lot_block_reason(l);
  PERFORM _qk('B','B4 under test is blocked', r IS NOT NULL AND r LIKE '%under test%', r);

  --  Release needs a signature, so bypass the engine the way the
  --  service context does, to reach the approved state for the next
  --  assertions. The sync trigger keeps the mirror honest.
  PERFORM set_config('request.jwt.claims','',true);
  UPDATE public.entity_current_state
     SET state_id = (SELECT s.id FROM public.lifecycle_states s
                      JOIN public.lifecycle_definitions d ON d.id=s.definition_id
                     WHERE d.entity_type='material_lot' AND d.company_id IS NULL
                       AND s.state_key='approved')
   WHERE entity_type='material_lot' AND entity_id=l;

  PERFORM _qk('B','B5 an approved lot with stock is dispensable',
              public.material_lot_block_reason(l, 10) IS NULL,
              coalesce(public.material_lot_block_reason(l,10),'NULL'));

  --  Quantity checks.
  PERFORM _qk('B','B6 more than is available is refused',
              public.material_lot_block_reason(l, 10000) LIKE '%less than%',
              public.material_lot_block_reason(l,10000));
  PERFORM _qk('B','B7 a zero quantity is refused',
              public.material_lot_block_reason(l, 0) IS NOT NULL);

  --  Material flagged as needing further processing is not dispensable
  --  even once approved.
  DECLARE l2 uuid;
  BEGIN
    INSERT INTO public.material_lots(company_id,material_id,quantity_received,created_by)
    SELECT c_a, m.id, 50, u_a FROM public.materials m
     WHERE m.company_id=c_a AND m.code='CRUDE'
    RETURNING id INTO l2;
    UPDATE public.entity_current_state
       SET state_id = (SELECT s.id FROM public.lifecycle_states s
                        JOIN public.lifecycle_definitions d ON d.id=s.definition_id
                       WHERE d.entity_type='material_lot' AND d.company_id IS NULL
                         AND s.state_key='approved')
     WHERE entity_type='material_lot' AND entity_id=l2;
    PERFORM _qk('B','B8 approved but needing further processing is blocked',
                public.material_lot_block_reason(l2) LIKE '%further processing%',
                public.material_lot_block_reason(l2));
  END;
END
$b$;

-- =====================================================================
--  C. Receipt from a supplier that cannot supply
-- =====================================================================
DO $c$
DECLARE
  c_a uuid := '00000000-0000-4000-b000-0000000000a1';
  c_b uuid := '00000000-0000-4000-b000-0000000000b1';
  u_a uuid := '00000000-0000-4000-b000-0000000000a2';
  m uuid; ok boolean; msg text;
BEGIN
  SELECT id INTO m FROM public.materials WHERE company_id=c_a AND code='LAC';

  ok := false; msg := NULL;
  BEGIN
    INSERT INTO public.material_lots(company_id,material_id,supplier_id,created_by)
    VALUES (c_a, m, (SELECT id FROM public.suppliers WHERE company_id=c_a AND code='SUP-BAD'), u_a);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%SUPPLIER_BLOCKED%'; msg := SQLERRM; END;
  PERFORM _qk('C','C1 receipt from a disqualified supplier is refused', ok, msg);
  PERFORM _qk('C','C2 the refusal names the supplier and the state',
              msg LIKE '%Bad Supplier%' AND msg LIKE '%disqualified%', msg);

  ok := false;
  BEGIN
    INSERT INTO public.material_lots(company_id,material_id,supplier_id,created_by)
    VALUES (c_a, m, (SELECT id FROM public.suppliers WHERE company_id=c_a AND code='SUP-SUSP'), u_a);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%SUPPLIER_BLOCKED%'; END;
  PERFORM _qk('C','C3 a suspended supplier is blocked too', ok);

  --  pending is deliberately allowed: see the gate's comment.
  INSERT INTO public.suppliers(company_id,name,code,created_by)
  VALUES (c_a,'New Supplier','SUP-NEW',u_a) ON CONFLICT DO NOTHING;
  DECLARE l3 uuid;
  BEGIN
    INSERT INTO public.material_lots(company_id,material_id,supplier_id,created_by)
    VALUES (c_a, m, (SELECT id FROM public.suppliers WHERE company_id=c_a AND code='SUP-NEW'), u_a)
    RETURNING id INTO l3;
    PERFORM _qk('C','C4 a pending supplier is allowed, by design', l3 IS NOT NULL);
  EXCEPTION WHEN others THEN PERFORM _qk('C','C4 a pending supplier is allowed, by design', false, SQLERRM);
  END;

  --  And a supplier belonging to another company is refused outright.
  ok := false;
  BEGIN
    INSERT INTO public.material_lots(company_id,material_id,supplier_id,created_by)
    VALUES (c_a, m, (SELECT id FROM public.suppliers WHERE company_id=c_b AND code='SUP-THEIRS'), u_a);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%CROSS_COMPANY%'; END;
  PERFORM _qk('C','C5 another company''s supplier is refused', ok);

  --  A refused receipt must not consume a lot number.
  DECLARE v_before integer; v_after integer;
  BEGIN
    SELECT next_seq INTO v_before FROM public.company_numbering_formats
     WHERE company_id=c_a AND scope='material_lot';
    BEGIN
      INSERT INTO public.material_lots(company_id,material_id,supplier_id,created_by)
      VALUES (c_a, m, (SELECT id FROM public.suppliers WHERE company_id=c_a AND code='SUP-BAD'), u_a);
    EXCEPTION WHEN others THEN NULL; END;
    SELECT next_seq INTO v_after FROM public.company_numbering_formats
     WHERE company_id=c_a AND scope='material_lot';
    PERFORM _qk('C','C6 a refused receipt does not burn a lot number',
                v_before = v_after, format('%s -> %s', v_before, v_after));
  END;
END
$c$;

-- =====================================================================
--  D. Retest alerting and automatic reversion
-- =====================================================================
DO $d$
DECLARE
  c_a uuid := '00000000-0000-4000-b000-0000000000a1';
  u_a uuid := '00000000-0000-4000-b000-0000000000a2';
  m uuid; l_past uuid; l_soon uuid; l_far uuid; res jsonb; v_state text;
BEGIN
  SELECT id INTO m FROM public.materials WHERE company_id=c_a AND code='LAC';

  --  Three lots: retest already passed, retest soon, retest far off.
  INSERT INTO public.material_lots(company_id,material_id,quantity_received,retest_due_date,created_by)
  VALUES (c_a,m,100,current_date - 3,u_a) RETURNING id INTO l_past;
  INSERT INTO public.material_lots(company_id,material_id,quantity_received,retest_due_date,created_by)
  VALUES (c_a,m,100,current_date + 10,u_a) RETURNING id INTO l_soon;
  INSERT INTO public.material_lots(company_id,material_id,quantity_received,retest_due_date,created_by)
  VALUES (c_a,m,100,current_date + 300,u_a) RETURNING id INTO l_far;

  --  Approve all three, bypassing the signature gate as the service
  --  context would.
  UPDATE public.entity_current_state
     SET state_id = (SELECT s.id FROM public.lifecycle_states s
                      JOIN public.lifecycle_definitions d ON d.id=s.definition_id
                     WHERE d.entity_type='material_lot' AND d.company_id IS NULL
                       AND s.state_key='approved')
   WHERE entity_type='material_lot' AND entity_id IN (l_past,l_soon,l_far);

  PERFORM _qk('D','D1 all three start approved',
    (SELECT count(*)=3 FROM public.material_lots
      WHERE id IN (l_past,l_soon,l_far) AND status='approved'));

  res := public.material_lot_retest_sweep(c_a);

  --  The lot past its retest date went back to quarantine, through the
  --  engine, with no manual action.
  SELECT s.state_key INTO v_state
    FROM public.entity_current_state ecs
    JOIN public.lifecycle_states s ON s.id=ecs.state_id
   WHERE ecs.entity_type='material_lot' AND ecs.entity_id=l_past;
  PERFORM _qk('D','D2 a lot past retest returns to quarantine automatically',
              v_state='quarantine', v_state);
  PERFORM _qk('D','D3 and the mirror follows',
              (SELECT status='quarantine' FROM public.material_lots WHERE id=l_past));
  PERFORM _qk('D','D4 the reversion went through the engine, so it has history',
    (SELECT count(*)>=1 FROM public.entity_state_history h
       JOIN public.lifecycle_states t ON t.id=h.to_state_id
      WHERE h.entity_type='material_lot' AND h.entity_id=l_past
        AND t.state_key='quarantine' AND h.from_state_id IS NOT NULL));

  --  Alerts: due for the passed one, approaching for the near one,
  --  nothing for the far one.
  PERFORM _qk('D','D5 a retest_due alert was raised',
    (SELECT count(*)=1 FROM public.material_lot_alerts
      WHERE material_lot_id=l_past AND alert_type='retest_due'));
  PERFORM _qk('D','D6 an approaching alert was raised for the near lot',
    (SELECT count(*)=1 FROM public.material_lot_alerts
      WHERE material_lot_id=l_soon AND alert_type='retest_approaching'));
  PERFORM _qk('D','D7 no alert for a lot 300 days out',
    (SELECT count(*)=0 FROM public.material_lot_alerts WHERE material_lot_id=l_far));

  --  Idempotent: a second sweep adds nothing.
  DECLARE n1 integer; n2 integer;
  BEGIN
    SELECT count(*) INTO n1 FROM public.material_lot_alerts WHERE company_id=c_a;
    PERFORM public.material_lot_retest_sweep(c_a);
    SELECT count(*) INTO n2 FROM public.material_lot_alerts WHERE company_id=c_a;
    PERFORM _qk('D','D8 the sweep is idempotent', n1=n2, format('%s -> %s',n1,n2));
  END;

  --  The lead time is configuration, not a constant. Narrow it and the
  --  near lot stops being "approaching".
  DELETE FROM public.material_lot_alerts WHERE material_lot_id=l_soon;
  INSERT INTO public.material_alert_policies(company_id,retest_lead_days)
  VALUES (c_a,5) ON CONFLICT (company_id) DO UPDATE SET retest_lead_days=5;
  PERFORM public.material_lot_retest_sweep(c_a);
  PERFORM _qk('D','D9 a narrowed lead time suppresses the alert',
    (SELECT count(*)=0 FROM public.material_lot_alerts
      WHERE material_lot_id=l_soon AND alert_type='retest_approaching'));

  --  Widen it again and it returns, which proves D9 was the policy and
  --  not something else going quiet.
  UPDATE public.material_alert_policies SET retest_lead_days=30 WHERE company_id=c_a;
  PERFORM public.material_lot_retest_sweep(c_a);
  PERFORM _qk('D','D10 widening it brings the alert back',
    (SELECT count(*)=1 FROM public.material_lot_alerts
      WHERE material_lot_id=l_soon AND alert_type='retest_approaching'));
END
$d$;

-- =====================================================================
--  E. The sweep has NOT run — the gate must hold anyway
--     This is the requirement that a scheduled job cannot satisfy on its
--     own, so it gets its own section.
-- =====================================================================
DO $e$
DECLARE
  c_a uuid := '00000000-0000-4000-b000-0000000000a1';
  u_a uuid := '00000000-0000-4000-b000-0000000000a2';
  m uuid; l uuid; r text; ok boolean;
BEGIN
  SELECT id INTO m FROM public.materials WHERE company_id=c_a AND code='LAC';

  INSERT INTO public.material_lots(company_id,material_id,quantity_received,retest_due_date,created_by)
  VALUES (c_a,m,100,current_date - 1,u_a) RETURNING id INTO l;
  UPDATE public.entity_current_state
     SET state_id = (SELECT s.id FROM public.lifecycle_states s
                      JOIN public.lifecycle_definitions d ON d.id=s.definition_id
                     WHERE d.entity_type='material_lot' AND d.company_id IS NULL
                       AND s.state_key='approved')
   WHERE entity_type='material_lot' AND entity_id=l;

  --  Deliberately do NOT sweep. The stored state still says approved.
  PERFORM _qk('E','E1 the stored state still reads approved',
              (SELECT status='approved' FROM public.material_lots WHERE id=l));

  --  And yet the lot is not dispensable, because the gate reads the date.
  r := public.material_lot_block_reason(l, 10);
  PERFORM _qk('E','E2 but the gate blocks it anyway',
              r IS NOT NULL AND r LIKE '%retest%', r);

  ok := false;
  BEGIN PERFORM public.material_lot_assert_dispensable(l, 10);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%MATERIAL_DISPENSE_BLOCKED%'; END;
  PERFORM _qk('E','E3 and the hard block raises', ok);

  --  Expiry is treated the same way.
  DECLARE l2 uuid;
  BEGIN
    INSERT INTO public.material_lots(company_id,material_id,quantity_received,supplier_expiry_date,created_by)
    VALUES (c_a,m,100,current_date - 1,u_a) RETURNING id INTO l2;
    UPDATE public.entity_current_state
       SET state_id = (SELECT s.id FROM public.lifecycle_states s
                        JOIN public.lifecycle_definitions d ON d.id=s.definition_id
                       WHERE d.entity_type='material_lot' AND d.company_id IS NULL
                         AND s.state_key='approved')
     WHERE entity_type='material_lot' AND entity_id=l2;
    PERFORM _qk('E','E4 an expired lot is blocked without a sweep',
                public.material_lot_block_reason(l2) LIKE '%expired%',
                public.material_lot_block_reason(l2));
  END;
END
$e$;

-- =====================================================================
--  F. Tenancy
-- =====================================================================
--  Capture one of company A's lot ids BEFORE switching role: afterwards
--  RLS hides the row, so the probe could not find an id to attack with,
--  and a test that cannot reach the target proves nothing.
SELECT set_config('test.lot_a',
  (SELECT id::text FROM public.material_lots
    WHERE company_id='00000000-0000-4000-b000-0000000000a1' LIMIT 1), false) \gset

GRANT INSERT ON _q TO authenticated;
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"00000000-0000-4000-b000-0000000000b2","role":"authenticated"}';

DO $f$
DECLARE
  c_a uuid := '00000000-0000-4000-b000-0000000000a1';
  l uuid; ok boolean; n integer;
BEGIN
  PERFORM _qk('F','F0 the probe is company B''s admin, authenticated',
              current_user='authenticated'
              AND auth.uid()='00000000-0000-4000-b000-0000000000b2', current_user);

  --  Needs a lot id from company A. RLS hides the row from this session,
  --  so take it from a SECURITY DEFINER-free source: it was captured by
  --  the setting below before the role switch.
  l := current_setting('test.lot_a', true)::uuid;

  --  material_lot_block_reason is SECURITY DEFINER, so RLS does not
  --  protect it. It must refuse by itself — and RAISE rather than return
  --  NULL, because NULL means "dispensable".
  ok := false;
  BEGIN PERFORM public.material_lot_block_reason(l);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%MATERIAL_FORBIDDEN%'; END;
  PERFORM _qk('F','F1 block_reason refuses another company''s lot', ok);

  ok := false;
  BEGIN PERFORM public.material_lot_assert_dispensable(l);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%MATERIAL_FORBIDDEN%'; END;
  PERFORM _qk('F','F2 assert_dispensable refuses it too', ok);

  ok := false;
  BEGIN PERFORM public.material_lot_retest_sweep(c_a);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%MATERIAL_FORBIDDEN%'; END;
  PERFORM _qk('F','F3 the sweep refuses another company', ok);

  ok := false;
  BEGIN PERFORM public.material_lot_retest_sweep(NULL);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%MATERIAL_FORBIDDEN%'; END;
  PERFORM _qk('F','F4 a client cannot sweep every company', ok);

  SELECT count(*) INTO n FROM public.material_lot_alerts WHERE company_id=c_a;
  PERFORM _qk('F','F5 B cannot read A''s alerts', n=0, n::text);
  SELECT count(*) INTO n FROM public.material_alert_policies WHERE company_id=c_a;
  PERFORM _qk('F','F6 B cannot read A''s alert policy', n=0, n::text);
END
$f$;

RESET ROLE;
RESET request.jwt.claims;

-- =====================================================================
--  G. The "NOT DONE IF" clauses
-- =====================================================================
DO $g$
DECLARE
  c_a uuid := '00000000-0000-4000-b000-0000000000a1';
  n integer;
BEGIN
  --  "The block exists only in the interface."
  --  The block is a database function that raises, so it applies to any
  --  caller — including one that never touches the service layer.
  PERFORM _qk('G','G1 the block is a database function, not UI code',
    (SELECT count(*)=1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
      WHERE ns.nspname='public' AND p.proname='material_lot_assert_dispensable'));

  --  And it is reachable by an ordinary client, which is what makes it
  --  the enforcement point rather than an internal helper.
  PERFORM _qk('G','G2 and it is callable by authenticated',
    has_function_privilege('authenticated','public.material_lot_assert_dispensable(uuid,numeric)','EXECUTE'));

  PERFORM _qk('G','G3 anon cannot call it',
    NOT has_function_privilege('anon','public.material_lot_assert_dispensable(uuid,numeric)','EXECUTE'));

  --  "Retest reversion requires manual action."
  --  Already disproved by D2, which only ran the sweep. Asserted here as
  --  the absence of any human step: no actor was supplied to the
  --  transition, and it still happened.
  PERFORM _qk('G','G4 the automatic reversion recorded no human actor',
    (SELECT count(*)>=1 FROM public.entity_state_history h
       JOIN public.lifecycle_states t ON t.id=h.to_state_id
      WHERE h.entity_type='material_lot' AND h.company_id=c_a
        AND t.state_key='quarantine' AND h.actor_id IS NULL
        AND h.comment LIKE '%automatically%'));

  --  Alerting is scheduled where a scheduler exists, and the migration
  --  does not depend on one.
  PERFORM _qk('G','G5 the sweep function exists regardless of pg_cron',
    (SELECT count(*)=1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
      WHERE ns.nspname='public' AND p.proname='material_lot_retest_sweep'));
END
$g$;

\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo '  ITEM 04 — MATERIAL QUARANTINE GATE'
\echo '════════════════════════════════════════════════════════════════'
SELECT section, count(*) AS assertions, count(*) FILTER (WHERE NOT ok) AS failures
  FROM _q GROUP BY section ORDER BY section;
SELECT section, name, coalesce(detail,'') AS detail FROM _q WHERE NOT ok ORDER BY section, name;
SELECT count(*) AS total, count(*) FILTER (WHERE ok) AS passed,
       count(*) FILTER (WHERE NOT ok) AS failed FROM _q;

DO $v$
DECLARE f integer;
BEGIN
  SELECT count(*) INTO f FROM _q WHERE NOT ok;
  IF f > 0 THEN RAISE EXCEPTION 'ITEM 04: % assertion(s) failed', f; END IF;
  RAISE NOTICE 'ITEM 04: all assertions passed';
END
$v$;
