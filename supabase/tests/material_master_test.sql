-- =====================================================================
--  WEEK 3 / ITEM 03 — MATERIAL MASTER, LOTS AND LIFECYCLE
--  Acceptance tests, written against the item's own wording.
--
--  Sections A-F assert the DONE MEANS clauses.
--  Section G asserts the NOT DONE IF clauses — each one is a thing that
--  must FAIL, so the test proves the failure happens rather than
--  assuming it. A green run on the positive cases alone would say
--  nothing about whether the gates actually bite.
--  Section H is tenancy: RLS proved with a real signed-in member of
--  another company, not by inspection.
-- =====================================================================
\set ON_ERROR_STOP on
SET client_min_messages = warning;

CREATE TEMP TABLE _r(section text, name text, ok boolean, detail text);
CREATE OR REPLACE FUNCTION _ck(p_section text, p_name text, p_ok boolean, p_detail text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO _r VALUES (p_section,p_name,coalesce(p_ok,false),p_detail); END $$;

-- ── fixtures ─────────────────────────────────────────────────────────
DO $fix$
DECLARE
  c_a uuid := '00000000-0000-4000-a000-0000000000a1';
  c_b uuid := '00000000-0000-4000-a000-0000000000b1';
  u_a uuid := '00000000-0000-4000-a000-0000000000a2';
  u_b uuid := '00000000-0000-4000-a000-0000000000b2';
BEGIN
  --  Self-cleaning, so the suite is re-runnable. Scoped to its own two
  --  fixture companies; it never touches anything else in the database.
  DELETE FROM public.entity_state_history
   WHERE entity_type IN ('material_lot','supplier') AND company_id IN (c_a,c_b);
  DELETE FROM public.entity_current_state
   WHERE entity_type IN ('material_lot','supplier') AND company_id IN (c_a,c_b);
  DELETE FROM public.material_certificates_of_analysis WHERE company_id IN (c_a,c_b);
  DELETE FROM public.material_lots                      WHERE company_id IN (c_a,c_b);
  DELETE FROM public.suppliers                          WHERE company_id IN (c_a,c_b);
  DELETE FROM public.materials                          WHERE company_id IN (c_a,c_b);
  DELETE FROM public.company_numbering_formats          WHERE company_id IN (c_a,c_b);

  INSERT INTO public.companies(id,name) VALUES (c_a,'Alpha Pharma Ltd')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.companies(id,name) VALUES (c_b,'Beta Labs Ltd')
    ON CONFLICT (id) DO NOTHING;

  INSERT INTO auth.users(id,email) VALUES (u_a,'qa@alpha.test') ON CONFLICT (id) DO NOTHING;
  INSERT INTO auth.users(id,email) VALUES (u_b,'qa@beta.test')  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles(id,email,company_id,role)
  VALUES (u_a,'qa@alpha.test',c_a,'admin')
  ON CONFLICT (id) DO UPDATE SET company_id=excluded.company_id, role=excluded.role;
  INSERT INTO public.profiles(id,email,company_id,role)
  VALUES (u_b,'qa@beta.test',c_b,'admin')
  ON CONFLICT (id) DO UPDATE SET company_id=excluded.company_id, role=excluded.role;

  INSERT INTO public.company_members(company_id,user_id,role)
  VALUES (c_a,u_a,'admin') ON CONFLICT DO NOTHING;
  INSERT INTO public.company_members(company_id,user_id,role)
  VALUES (c_b,u_b,'admin') ON CONFLICT DO NOTHING;

  --  Fixture self-check. If these are not true the cross-tenant section
  --  proves nothing, so it raises rather than quietly weakening.
  IF NOT EXISTS (SELECT 1 FROM public.company_members WHERE company_id=c_b AND user_id=u_b) THEN
    RAISE EXCEPTION 'FIXTURE: user B is not a member of company B';
  END IF;
  IF EXISTS (SELECT 1 FROM public.company_members WHERE company_id=c_a AND user_id=u_b) THEN
    RAISE EXCEPTION 'FIXTURE: user B must NOT be a member of company A';
  END IF;
END
$fix$;

-- =====================================================================
--  A. Numbering format is configuration, not code
-- =====================================================================
DO $a$
DECLARE
  c_a uuid := '00000000-0000-4000-a000-0000000000a1';
  c_b uuid := '00000000-0000-4000-a000-0000000000b1';
  n1 text; n2 text; n3 text;
BEGIN
  --  Two companies, two different conventions.
  INSERT INTO public.company_numbering_formats(company_id,scope,pattern,prefix,seq_width,seq_reset)
  VALUES (c_a,'material_lot','{PREFIX}-{YYYY}-{SEQ}','ALP',4,'yearly')
  ON CONFLICT (company_id,scope) DO UPDATE
    SET pattern=excluded.pattern, prefix=excluded.prefix,
        seq_width=excluded.seq_width, seq_reset=excluded.seq_reset,
        next_seq=1, seq_period=NULL;

  INSERT INTO public.company_numbering_formats(company_id,scope,pattern,prefix,seq_width,seq_reset)
  VALUES (c_b,'material_lot','{MATERIAL_CODE}/{YY}{MM}/{SEQ}',NULL,3,'monthly')
  ON CONFLICT (company_id,scope) DO UPDATE
    SET pattern=excluded.pattern, prefix=excluded.prefix,
        seq_width=excluded.seq_width, seq_reset=excluded.seq_reset,
        next_seq=1, seq_period=NULL;

  n1 := public.numbering_next(c_a,'material_lot','{}'::jsonb);
  n2 := public.numbering_next(c_a,'material_lot','{}'::jsonb);
  PERFORM _ck('A','A1 pattern honoured, sequence padded',
              n1 = 'ALP-'||to_char(current_date,'YYYY')||'-0001', n1);
  PERFORM _ck('A','A2 counter advances', n2 = 'ALP-'||to_char(current_date,'YYYY')||'-0002', n2);

  n3 := public.numbering_next(c_b,'material_lot', jsonb_build_object('material_code','PARA'));
  PERFORM _ck('A','A3 a different company gets a different convention',
              n3 = 'PARA/'||to_char(current_date,'YYMM')||'/001', n3);

  --  The counters are per company, not global.
  PERFORM _ck('A','A4 counters are per company',
              public.numbering_next(c_a,'material_lot','{}'::jsonb)
                = 'ALP-'||to_char(current_date,'YYYY')||'-0003');
END
$a$;

DO $a2$
DECLARE c_a uuid := '00000000-0000-4000-a000-0000000000a1'; ok boolean := false;
BEGIN
  --  An unconfigured scope must raise, not invent a format.
  BEGIN
    PERFORM public.numbering_next(c_a,'deviation','{}'::jsonb);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%NUMBERING_NO_FORMAT%';
  END;
  PERFORM _ck('A','A5 unconfigured scope raises rather than guessing', ok);
END
$a2$;

-- =====================================================================
--  B. Material master carries what the item requires
-- =====================================================================
DO $b$
DECLARE
  c_a uuid := '00000000-0000-4000-a000-0000000000a1';
  u_a uuid := '00000000-0000-4000-a000-0000000000a2';
  m uuid; cols text[];
BEGIN
  INSERT INTO public.materials(company_id,code,name,material_type,criticality,
      requires_further_processing,specification_reference,retest_period_days,
      storage_conditions,storage_temperature_min_c,storage_temperature_max_c,
      unit_of_measure,created_by)
  VALUES (c_a,'PARA','Paracetamol BP','active_ingredient','critical',
      true,'SPEC-PARA-003',365,'Cool, dry, protected from light',15,25,'kg',u_a)
  RETURNING id INTO m;

  SELECT array_agg(column_name::text ORDER BY column_name) INTO cols
    FROM information_schema.columns
   WHERE table_schema='public' AND table_name='materials';

  PERFORM _ck('B','B1 type',        'material_type' = ANY(cols));
  PERFORM _ck('B','B2 criticality', 'criticality' = ANY(cols));
  PERFORM _ck('B','B3 requires further processing',
              'requires_further_processing' = ANY(cols));
  PERFORM _ck('B','B4 specification reference',
              'specification_reference' = ANY(cols));
  PERFORM _ck('B','B5 retest period', 'retest_period_days' = ANY(cols));
  PERFORM _ck('B','B6 storage conditions', 'storage_conditions' = ANY(cols));
  PERFORM _ck('B','B7 the row actually stores them',
    (SELECT criticality='critical' AND requires_further_processing
            AND specification_reference='SPEC-PARA-003' AND retest_period_days=365
       FROM public.materials WHERE id=m));

  --  A temperature range that runs backwards is rejected.
  DECLARE ok boolean := false;
  BEGIN
    BEGIN
      INSERT INTO public.materials(company_id,code,name,material_type,
                                   storage_temperature_min_c,storage_temperature_max_c)
      VALUES (c_a,'BADTEMP','Bad','excipient',30,10);
    EXCEPTION WHEN check_violation THEN ok := true;
    END;
    PERFORM _ck('B','B8 inverted storage range rejected', ok);
  END;
END
$b$;

-- =====================================================================
--  C. Lot record, and numbering that reads the company format
-- =====================================================================
DO $c$
DECLARE
  c_a uuid := '00000000-0000-4000-a000-0000000000a1';
  u_a uuid := '00000000-0000-4000-a000-0000000000a2';
  m uuid; s uuid; l uuid; cols text[]; v_lot text; v_retest date;
BEGIN
  SELECT id INTO m FROM public.materials WHERE company_id=c_a AND code='PARA';

  INSERT INTO public.suppliers(company_id,name,code,country,created_by)
  VALUES (c_a,'Hebei Jiheng Pharmaceutical','SUP-HJP','CN',u_a)
  ON CONFLICT (company_id,code) DO UPDATE SET name=excluded.name
  RETURNING id INTO s;

  INSERT INTO public.material_lots(company_id,material_id,supplier_id,
      supplier_batch_number,quantity_received,received_date,manufacture_date,
      supplier_expiry_date,storage_location,received_by,created_by)
  VALUES (c_a,m,s,'HJP-2026-0455',500,current_date,current_date - 30,
      current_date + 700,'Warehouse A / Rack 3',u_a,u_a)
  RETURNING id, lot_number, retest_due_date INTO l, v_lot, v_retest;

  SELECT array_agg(column_name::text) INTO cols
    FROM information_schema.columns
   WHERE table_schema='public' AND table_name='material_lots';

  PERFORM _ck('C','C1 supplier',        'supplier_id' = ANY(cols));
  PERFORM _ck('C','C2 supplier batch',  'supplier_batch_number' = ANY(cols));
  PERFORM _ck('C','C3 quantities',
              'quantity_received' = ANY(cols) AND 'quantity_available' = ANY(cols));
  PERFORM _ck('C','C4 dates',
              'received_date' = ANY(cols) AND 'manufacture_date' = ANY(cols)
              AND 'supplier_expiry_date' = ANY(cols));
  PERFORM _ck('C','C5 storage location','storage_location' = ANY(cols));

  --  The number came from company A's configured pattern.
  PERFORM _ck('C','C6 lot number issued from the company format',
              v_lot LIKE 'ALP-'||to_char(current_date,'YYYY')||'-%', v_lot);

  --  retest_due_date derived from the material's retest period.
  PERFORM _ck('C','C7 retest date derived from the material period',
              v_retest = current_date + 365, v_retest::text);

  --  quantity_available defaults to what was received.
  PERFORM _ck('C','C8 available quantity defaults to received',
              (SELECT quantity_available = 500 FROM public.material_lots WHERE id=l));
END
$c$;

-- =====================================================================
--  D. The lifecycle is the engine's, and receipt lands in quarantine
-- =====================================================================
DO $d$
DECLARE
  c_a uuid := '00000000-0000-4000-a000-0000000000a1';
  u_a uuid := '00000000-0000-4000-a000-0000000000a2';
  v_def uuid; v_keys text[]; l uuid; v_state text;
BEGIN
  v_def := public.lifecycle_resolve_definition('material_lot', c_a);
  PERFORM _ck('D','D1 a lifecycle is registered for material_lot', v_def IS NOT NULL);

  SELECT array_agg(state_key ORDER BY state_key) INTO v_keys
    FROM public.lifecycle_states WHERE definition_id = v_def;
  PERFORM _ck('D','D2 all seven states present',
    v_keys @> ARRAY['approved','exhausted','expired','on_hold','quarantine','rejected','under_test'],
    array_to_string(v_keys,','));

  PERFORM _ck('D','D3 quarantine is the initial state',
    (SELECT is_initial FROM public.lifecycle_states
      WHERE definition_id=v_def AND state_key='quarantine'));

  PERFORM _ck('D','D4 rejected/expired/exhausted are terminal',
    (SELECT count(*) = 3 FROM public.lifecycle_states
      WHERE definition_id=v_def AND is_terminal
        AND state_key IN ('rejected','expired','exhausted')));

  --  Receipt puts the lot in quarantine with no one asking it to.
  SELECT id INTO l FROM public.material_lots WHERE company_id=c_a LIMIT 1;
  SELECT s.state_key INTO v_state
    FROM public.entity_current_state ecs
    JOIN public.lifecycle_states s ON s.id = ecs.state_id
   WHERE ecs.entity_type='material_lot' AND ecs.entity_id = l;
  PERFORM _ck('D','D5 receipt initialises the lot in quarantine',
              v_state = 'quarantine', v_state);

  --  The mirror agrees with the engine.
  PERFORM _ck('D','D6 the status mirror matches the engine',
    (SELECT status='quarantine' FROM public.material_lots WHERE id=l));

  --  An opening history row exists, so the state has provenance.
  PERFORM _ck('D','D7 an opening history row was written',
    (SELECT count(*) >= 1 FROM public.entity_state_history
      WHERE entity_type='material_lot' AND entity_id=l));

  --  A real transition moves both the engine and the mirror.
  PERFORM public.lifecycle_transition('material_lot', l, 'sample', c_a, u_a, 'Sampled for ID and assay');
  PERFORM _ck('D','D8 transition updates the mirror',
    (SELECT status='under_test' FROM public.material_lots WHERE id=l));
  PERFORM _ck('D','D9 transition writes history',
    (SELECT count(*) >= 2 FROM public.entity_state_history
      WHERE entity_type='material_lot' AND entity_id=l));

  --  Retest reversion is a declared transition, so item 04 can use the
  --  engine rather than overwriting a column.
  PERFORM _ck('D','D10 approved -> quarantine exists for retest reversion',
    (SELECT count(*)=1 FROM public.lifecycle_transitions t
       JOIN public.lifecycle_states f ON f.id=t.from_state_id
       JOIN public.lifecycle_states x ON x.id=t.to_state_id
      WHERE t.definition_id=v_def AND f.state_key='approved'
        AND x.state_key='quarantine' AND t.action_key='retest_due'));

  --  Release carries the signature requirement item 06 will enforce.
  PERFORM _ck('D','D11 the release transition requires a signature',
    (SELECT requires_signature FROM public.lifecycle_transitions t
       JOIN public.lifecycle_states f ON f.id=t.from_state_id
      WHERE t.definition_id=v_def AND f.state_key='under_test'
        AND t.action_key='release'));
END
$d$;

-- =====================================================================
--  E. Supplier qualification is also engine-backed
-- =====================================================================
DO $e$
DECLARE
  c_a uuid := '00000000-0000-4000-a000-0000000000a1';
  u_a uuid := '00000000-0000-4000-a000-0000000000a2';
  s uuid; v_def uuid;
BEGIN
  v_def := public.lifecycle_resolve_definition('supplier', c_a);
  PERFORM _ck('E','E1 a supplier lifecycle is registered', v_def IS NOT NULL);

  PERFORM _ck('E','E2 disqualified is a declared state',
    (SELECT count(*)=1 FROM public.lifecycle_states
      WHERE definition_id=v_def AND state_key='disqualified'));

  SELECT id INTO s FROM public.suppliers WHERE company_id=c_a AND code='SUP-HJP';
  PERFORM _ck('E','E3 a new supplier starts pending, not qualified',
    (SELECT qualification_status='pending' FROM public.suppliers WHERE id=s));

  PERFORM public.lifecycle_transition('supplier', s, 'qualify', c_a, u_a, 'Audit 2026-03 passed');
  PERFORM _ck('E','E4 qualifying updates the mirror',
    (SELECT qualification_status='qualified' FROM public.suppliers WHERE id=s));
END
$e$;

-- =====================================================================
--  F. company_id and RLS on every table
-- =====================================================================
DO $f$
DECLARE t text; v_missing text[] := '{}'; v_norls text[] := '{}'; v_nopol text[] := '{}';
BEGIN
  FOREACH t IN ARRAY ARRAY['company_numbering_formats','suppliers','materials',
                           'material_lots','material_certificates_of_analysis']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema='public' AND table_name=t AND column_name='company_id')
      THEN v_missing := v_missing || t; END IF;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.'||t)::regclass)
      THEN v_norls := v_norls || t; END IF;
    --  All four commands policed. A missing DELETE policy makes a delete
    --  a silent no-op, which reads to the caller as success.
    IF (SELECT count(DISTINCT cmd) FROM pg_policies
         WHERE schemaname='public' AND tablename=t) < 4
      THEN v_nopol := v_nopol || t; END IF;
  END LOOP;

  PERFORM _ck('F','F1 every table carries company_id',
              cardinality(v_missing)=0, array_to_string(v_missing,','));
  PERFORM _ck('F','F2 every table has RLS enabled',
              cardinality(v_norls)=0, array_to_string(v_norls,','));
  PERFORM _ck('F','F3 select/insert/update/delete all policed',
              cardinality(v_nopol)=0, array_to_string(v_nopol,','));
  PERFORM _ck('F','F4 anon has no grant on any of them',
    NOT EXISTS (SELECT 1 FROM information_schema.role_table_grants
                 WHERE grantee='anon' AND table_schema='public'
                   AND table_name IN ('company_numbering_formats','suppliers','materials',
                                      'material_lots','material_certificates_of_analysis')));
END
$f$;

-- =====================================================================
--  G. THE "NOT DONE IF" CLAUSES — each must fail
-- =====================================================================
DO $g$
DECLARE
  c_a uuid := '00000000-0000-4000-a000-0000000000a1';
  c_b uuid := '00000000-0000-4000-a000-0000000000b1';
  u_a uuid := '00000000-0000-4000-a000-0000000000a2';
  l uuid; m_b uuid; ok boolean;
BEGIN
  SELECT id INTO l FROM public.material_lots WHERE company_id=c_a LIMIT 1;

  --  "A status column on material_lots instead of the lifecycle engine."
  --  The column exists as a mirror; writing it directly must be refused.
  ok := false;
  BEGIN
    UPDATE public.material_lots SET status='approved' WHERE id=l;
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%MATERIAL_LOT_STATUS_READ_ONLY%';
  END;
  PERFORM _ck('G','G1 writing lot status directly is refused', ok);

  PERFORM _ck('G','G2 and the refusal left the state alone',
    (SELECT status='under_test' FROM public.material_lots WHERE id=l));

  --  Same for supplier qualification.
  ok := false;
  BEGIN
    UPDATE public.suppliers SET qualification_status='qualified'
     WHERE company_id=c_a AND code='SUP-HJP';
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%SUPPLIER_STATUS_READ_ONLY%';
  END;
  --  It is already 'qualified' from E4, so this update is a no-op on
  --  value; assert on a real change instead.
  ok := false;
  BEGIN
    UPDATE public.suppliers SET qualification_status='disqualified'
     WHERE company_id=c_a AND code='SUP-HJP';
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%SUPPLIER_STATUS_READ_ONLY%';
  END;
  PERFORM _ck('G','G3 writing supplier qualification directly is refused', ok);

  --  "Lot numbering hardcoded rather than reading the company format."
  --  Proved by perturbation: change the format, and the next number must
  --  follow the new one. A hardcoded generator would ignore this.
  UPDATE public.company_numbering_formats
     SET pattern='CHANGED-{SEQ}', seq_width=2
   WHERE company_id=c_a AND scope='material_lot';
  DECLARE v_new text;
  BEGIN
    INSERT INTO public.material_lots(company_id,material_id,received_date,created_by)
    SELECT c_a, id, current_date, u_a FROM public.materials
     WHERE company_id=c_a AND code='PARA'
    RETURNING lot_number INTO v_new;
    PERFORM _ck('G','G4 changing the format changes the next lot number',
                v_new LIKE 'CHANGED-%', v_new);
  END;
  --  restore
  UPDATE public.company_numbering_formats
     SET pattern='{PREFIX}-{YYYY}-{SEQ}', seq_width=4
   WHERE company_id=c_a AND scope='material_lot';

  --  A lot must not be able to reference another tenant's material: the
  --  lot number embeds the material code, so this would leak it.
  INSERT INTO public.materials(company_id,code,name,material_type)
  VALUES (c_b,'BETAONLY','Beta only','excipient')
  ON CONFLICT (company_id,code) DO UPDATE SET name=excluded.name
  RETURNING id INTO m_b;

  ok := false;
  BEGIN
    INSERT INTO public.material_lots(company_id,material_id,received_date,created_by)
    VALUES (c_a, m_b, current_date, u_a);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%CROSS_COMPANY%';
  END;
  PERFORM _ck('G','G5 a lot cannot reference another company''s material', ok);

  --  A lot whose material does not exist at all.
  ok := false;
  BEGIN
    INSERT INTO public.material_lots(company_id,material_id,received_date)
    VALUES (c_a,'00000000-0000-4000-a000-00000000dead',current_date);
  EXCEPTION WHEN others THEN ok := true;
  END;
  PERFORM _ck('G','G6 a lot with no material is refused', ok);

  --  A manufacture date after receipt is nonsense.
  ok := false;
  BEGIN
    INSERT INTO public.material_lots(company_id,material_id,received_date,manufacture_date,created_by)
    SELECT c_a,id,current_date,current_date+5,u_a FROM public.materials
     WHERE company_id=c_a AND code='PARA';
  EXCEPTION WHEN check_violation THEN ok := true;
  END;
  PERFORM _ck('G','G7 manufacture date after receipt is refused', ok);

  --  The certificate results must be structured, not a bare string.
  ok := false;
  BEGIN
    INSERT INTO public.material_certificates_of_analysis(company_id,material_lot_id,supplier_results)
    VALUES (c_a,l,'"all passed"'::jsonb);
  EXCEPTION WHEN check_violation THEN ok := true;
  END;
  PERFORM _ck('G','G8 a certificate cannot store results as a bare scalar', ok);
END
$g$;

-- =====================================================================
--  H. Cross-tenant isolation, with a real signed-in member of company B
-- =====================================================================
DO $h$
DECLARE
  c_a uuid := '00000000-0000-4000-a000-0000000000a1';
  c_b uuid := '00000000-0000-4000-a000-0000000000b1';
  u_b uuid := '00000000-0000-4000-a000-0000000000b2';
  l uuid; n integer; ok boolean;
BEGIN
  SELECT id INTO l FROM public.material_lots WHERE company_id=c_a LIMIT 1;
  INSERT INTO public.material_certificates_of_analysis(company_id,material_lot_id,supplier_results)
  VALUES (c_a,l,'[{"parameter":"Assay","stated_value":99.4}]'::jsonb);

  --  H0 proves the probe is what it claims to be: a member of B, not of A.
  PERFORM _ck('H','H0 probe user is a member of B and not of A',
    public.app_is_company_member(c_b,u_b) AND NOT public.app_is_company_member(c_a,u_b));
END
$h$;

--  Switch to a real authenticated session as company B's admin.
--
--  SET, not SET LOCAL: psql runs this file in autocommit, so each
--  statement is its own transaction and a LOCAL setting would be
--  discarded before the next statement ran. It was, on the first run —
--  which meant these queries executed as the superuser, RLS was bypassed
--  wholesale, and every assertion in this section was answering a
--  different question than the one it asks. The section failed rather
--  than passing, which is the only reason it was visible.
GRANT INSERT ON _r TO authenticated;
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"00000000-0000-4000-a000-0000000000b2","role":"authenticated"}';

--  Prove the switch took effect before trusting anything below it.
DO $h1$
BEGIN
  PERFORM _ck('H','H0b the probe really is running as authenticated',
              current_user = 'authenticated', current_user);
  PERFORM _ck('H','H0c and auth.uid() resolves to company B''s admin',
              auth.uid() = '00000000-0000-4000-a000-0000000000b2', coalesce(auth.uid()::text,'null'));
END
$h1$;

DO $h2$
DECLARE c_a uuid := '00000000-0000-4000-a000-0000000000a1'; n integer; ok boolean;
BEGIN
  SELECT count(*) INTO n FROM public.materials       WHERE company_id=c_a;
  PERFORM _ck('H','H1 B cannot read A''s materials', n=0, n::text);
  SELECT count(*) INTO n FROM public.material_lots   WHERE company_id=c_a;
  PERFORM _ck('H','H2 B cannot read A''s lots', n=0, n::text);
  SELECT count(*) INTO n FROM public.material_certificates_of_analysis WHERE company_id=c_a;
  PERFORM _ck('H','H3 B cannot read A''s certificates', n=0, n::text);
  SELECT count(*) INTO n FROM public.suppliers       WHERE company_id=c_a;
  PERFORM _ck('H','H4 B cannot read A''s suppliers', n=0, n::text);
  SELECT count(*) INTO n FROM public.company_numbering_formats WHERE company_id=c_a;
  PERFORM _ck('H','H5 B cannot read A''s numbering formats', n=0, n::text);

  --  numbering_next is SECURITY DEFINER, so RLS does not protect it and
  --  it both reads and ADVANCES the counter. It must refuse by itself.
  ok := false;
  BEGIN
    PERFORM public.numbering_next(c_a,'material_lot','{}'::jsonb);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%NUMBERING_FORBIDDEN%';
  END;
  PERFORM _ck('H','H6 numbering_next refuses another company''s counter', ok);

  --  B cannot write into A either.
  ok := false;
  BEGIN
    INSERT INTO public.materials(company_id,code,name,material_type)
    VALUES (c_a,'SNEAK','Sneak','excipient');
  EXCEPTION WHEN others THEN ok := true;
  END;
  PERFORM _ck('H','H7 B cannot insert into A', ok);
END
$h2$;

RESET ROLE;
RESET request.jwt.claims;

DO $h3$
DECLARE
  c_a uuid := '00000000-0000-4000-a000-0000000000a1';
  n integer;
BEGIN
  --  And the owner is not locked out. A control that refuses everybody
  --  is an outage, not isolation.
  SELECT count(*) INTO n FROM public.materials WHERE company_id=c_a;
  PERFORM _ck('H','H8 A''s own data is still there', n >= 1, n::text);
END
$h3$;

-- =====================================================================
\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo '  ITEM 03 — MATERIAL MASTER, LOTS AND LIFECYCLE'
\echo '════════════════════════════════════════════════════════════════'
SELECT section,
       count(*)                          AS assertions,
       count(*) FILTER (WHERE NOT ok)    AS failures
  FROM _r GROUP BY section ORDER BY section;

SELECT section, name, coalesce(detail,'') AS detail
  FROM _r WHERE NOT ok ORDER BY section, name;

SELECT count(*) AS total, count(*) FILTER (WHERE ok) AS passed,
       count(*) FILTER (WHERE NOT ok) AS failed
  FROM _r;

DO $verdict$
DECLARE f integer;
BEGIN
  SELECT count(*) INTO f FROM _r WHERE NOT ok;
  IF f > 0 THEN RAISE EXCEPTION 'ITEM 03: % assertion(s) failed', f; END IF;
  RAISE NOTICE 'ITEM 03: all assertions passed';
END
$verdict$;
