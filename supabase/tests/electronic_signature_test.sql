-- =====================================================================
--  ELECTRONIC SIGNATURES — INTEGRATION TESTS
--  LOCAL / DISPOSABLE DATABASE ONLY
-- =====================================================================
--  Covers 20260917000000_electronic_signatures_traceability.sql.
--
--  Each group below corresponds to a finding reproduced against the
--  handoff version of this feature. They are written as the attack
--  first, so a regression shows up as a signature that should not exist
--  rather than as an assertion that quietly stops running.
--
--  Run:  psql "<local url>" -f supabase/tests/electronic_signature_test.sql
--
--  Safe to run repeatedly. Fixtures are tagged esig- and removed at the
--  end, including a throwaway lifecycle definition.
-- =====================================================================

\set ON_ERROR_STOP off

DO $guard$
BEGIN
  IF current_database() NOT IN ('postgres','criateur_local') THEN
    RAISE EXCEPTION 'REFUSING TO RUN outside a local database (got %)', current_database();
  END IF;
  IF to_regprocedure('public.sign_electronic_record(uuid,text,uuid,text,text,text,text,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'Migration 20260917000000 has not been applied to this database.';
  END IF;
END $guard$;

-- Supabase installs pgcrypto into a schema called `extensions`, and
-- verify_user_password() (20260302000000) calls extensions.crypt()
-- fully qualified. This cluster has pgcrypto in `public`, so without the
-- shim below the credential check under test cannot run at all here —
-- it would raise "schema extensions does not exist" and every signing
-- assertion would fail for the wrong reason. Wrappers rather than
-- ALTER EXTENSION ... SET SCHEMA, because moving it would break every
-- unqualified digest() call in the migrations.
DO $pgcrypto$
DECLARE v_schema text;
BEGIN
  IF to_regprocedure('extensions.crypt(text,text)') IS NOT NULL THEN RETURN; END IF;

  SELECT n.nspname INTO v_schema
    FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
   WHERE e.extname = 'pgcrypto';
  IF v_schema IS NULL THEN
    RAISE EXCEPTION 'pgcrypto is not installed; this suite cannot run';
  END IF;

  CREATE SCHEMA IF NOT EXISTS extensions;
  EXECUTE format($f$
    CREATE OR REPLACE FUNCTION extensions.crypt(text, text) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT AS 'SELECT %I.crypt($1,$2)';
  $f$, v_schema);
  EXECUTE format($f$
    CREATE OR REPLACE FUNCTION extensions.gen_salt(text) RETURNS text
    LANGUAGE sql VOLATILE STRICT AS 'SELECT %I.gen_salt($1)';
  $f$, v_schema);
  GRANT USAGE ON SCHEMA extensions TO PUBLIC;
  RAISE WARNING 'extensions.crypt/gen_salt scaffolded for testing (pgcrypto is in % here, Supabase puts it in extensions).', v_schema;
END $pgcrypto$;

-- Likewise, auth.users on this cluster is a three-column stub created by
-- earlier test scaffolding (id, email, created_at). The real Supabase
-- table carries encrypted_password, which is what verify_user_password()
-- reads. Without it the credential check cannot be exercised locally at
-- all. Added only when absent, so this is a no-op against a real auth
-- schema.
DO $authcol$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='auth' AND table_name='users'
                    AND column_name='encrypted_password') THEN
    ALTER TABLE auth.users ADD COLUMN encrypted_password text;
    RAISE WARNING 'auth.users.encrypted_password scaffolded for testing (absent from this cluster''s auth stub).';
  END IF;
END $authcol$;

DROP TABLE IF EXISTS esig_results;
CREATE TEMP TABLE esig_results(seq serial, id text, name text, verdict text, detail text);
GRANT ALL ON esig_results TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE esig_results_seq_seq TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION esig_assert(p_id text, p_name text, p_cond boolean, p_detail text DEFAULT '')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO esig_results(id,name,verdict,detail)
  VALUES (p_id,p_name,CASE WHEN p_cond THEN 'PASS' ELSE 'FAIL' END,p_detail);
END $$;

CREATE OR REPLACE FUNCTION esig_denied(p_id text, p_name text, p_role text, p_sql text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_msg text; v_ok boolean := false;
BEGIN
  BEGIN
    EXECUTE format('SET LOCAL ROLE %I', p_role);
    EXECUTE p_sql;
    v_ok := false; v_msg := 'STATEMENT SUCCEEDED';
  EXCEPTION WHEN others THEN v_ok := true; v_msg := SQLERRM;
  END;
  RESET ROLE;
  PERFORM esig_assert(p_id,p_name,v_ok,v_msg);
END $$;

-- ── fixtures ─────────────────────────────────────────────────────────
--  Company A holds an admin and a content_creator; company B holds an
--  outsider. A throwaway lifecycle 'esig_doc' carries one transition
--  that requires a signature and one that requires an admin role, so
--  both the signature path and the authorisation path are exercised
--  against real definitions rather than mocks.
DO $fx$
DECLARE
  ca uuid := '00000000-0000-7200-a000-00000000000a';
  cb uuid := '00000000-0000-7200-a000-00000000000b';
  u_adm uuid := '00000000-0000-7200-b000-000000000001';
  u_cre uuid := '00000000-0000-7200-b000-000000000002';
  u_out uuid := '00000000-0000-7200-b000-000000000003';
  v_def uuid; s_draft uuid; s_review uuid; s_appr uuid;
BEGIN
  INSERT INTO public.companies(id,name) VALUES (ca,'ESIG Alpha'),(cb,'ESIG Beta')
    ON CONFLICT (id) DO NOTHING;

  INSERT INTO auth.users(id,email) VALUES
    (u_adm,'esig-admin@local.test'),(u_cre,'esig-creator@local.test'),(u_out,'esig-out@local.test')
    ON CONFLICT (id) DO NOTHING;

  -- real bcrypt hashes so verify_user_password() is genuinely exercised
  UPDATE auth.users SET encrypted_password = extensions.crypt('CorrectHorse1!', extensions.gen_salt('bf'))
   WHERE id IN (u_adm,u_cre,u_out);

  INSERT INTO public.profiles(id,email,full_name,role,company_id) VALUES
    (u_adm,'esig-admin@local.test','Ada Admin','admin',ca),
    (u_cre,'esig-creator@local.test','Cory Creator','content_creator',ca),
    (u_out,'esig-out@local.test','Otto Outsider','admin',cb)
    ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.company_members(company_id,user_id,role,status) VALUES
    (ca,u_adm,'owner','active'),(ca,u_cre,'member','active'),(cb,u_out,'owner','active')
    ON CONFLICT DO NOTHING;

  DELETE FROM public.lifecycle_definitions WHERE entity_type='esig_doc';
  INSERT INTO public.lifecycle_definitions(company_id,entity_type,name,version,is_active)
  VALUES (NULL,'esig_doc','ESIG test lifecycle',1,true) RETURNING id INTO v_def;

  INSERT INTO public.lifecycle_states(definition_id,state_key,label,sort_order,is_initial)
  VALUES (v_def,'draft','Draft',0,true) RETURNING id INTO s_draft;
  INSERT INTO public.lifecycle_states(definition_id,state_key,label,sort_order,is_initial)
  VALUES (v_def,'in_review','In Review',1,false) RETURNING id INTO s_review;
  INSERT INTO public.lifecycle_states(definition_id,state_key,label,sort_order,is_initial)
  VALUES (v_def,'approved','Approved',2,false) RETURNING id INTO s_appr;

  INSERT INTO public.lifecycle_transitions
    (definition_id,from_state_id,to_state_id,action_key,label,sort_order,
     required_role,required_permission,requires_comment,requires_signature)
  VALUES
    (v_def,s_draft ,s_review,'submit'  ,'Submit'  ,0,NULL   ,NULL,false,false),
    -- the one under test: needs a signature, nothing else
    (v_def,s_review,s_appr  ,'approve' ,'Approve' ,1,NULL   ,NULL,false,true ),
    -- admin-only AND signature-required, to prove authorisation still bites
    (v_def,s_review,s_draft ,'send_back','Send back',2,'admin',NULL,false,true);

  PERFORM public.lifecycle_initialize('esig_doc','00000000-0000-7200-c000-000000000001',ca,u_adm,NULL);
  PERFORM public.lifecycle_initialize('esig_doc','00000000-0000-7200-c000-000000000002',ca,u_adm,NULL);
  PERFORM public.lifecycle_transition('esig_doc','00000000-0000-7200-c000-000000000001','submit',ca,u_adm);
  PERFORM public.lifecycle_transition('esig_doc','00000000-0000-7200-c000-000000000002','submit',ca,u_adm);
END $fx$;


-- =====================================================================
--  A — the credential challenge  (handoff finding 1)
-- =====================================================================
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-7200-b000-000000000001","role":"authenticated"}',false);
SET ROLE authenticated;
DO $a$
DECLARE r jsonb;
BEGIN
  r := public.sign_electronic_record('00000000-0000-7200-a000-00000000000a','esig_doc',
        '00000000-0000-7200-c000-000000000001','approve','approved','wrong-password');
  PERFORM esig_assert('A1','a wrong password is refused',
    (r->>'ok')='false' AND r->>'code'='E_SIGNATURE_BAD_CREDENTIAL', coalesce(r::text,'NULL'));

  r := public.sign_electronic_record('00000000-0000-7200-a000-00000000000a','esig_doc',
        '00000000-0000-7200-c000-000000000001','approve','approved',NULL);
  PERFORM esig_assert('A2','a missing password is refused',
    (r->>'ok')='false' AND r->>'code'='E_SIGNATURE_BAD_CREDENTIAL', coalesce(r->>'code','NULL'));
END $a$;
RESET ROLE;

DO $a2$
DECLARE n int; n_sig int;
BEGIN
  SELECT count(*) INTO n FROM public.electronic_signature_attempts
   WHERE user_id='00000000-0000-7200-b000-000000000001' AND outcome='bad_credential';
  PERFORM esig_assert('A3','the failed attempts were RECORDED, not discarded', n=2, n||' attempt row(s)');

  SELECT count(*) INTO n_sig FROM public.electronic_signatures
   WHERE company_id='00000000-0000-7200-a000-00000000000a';
  PERFORM esig_assert('A4','and produced no signature', n_sig=0, n_sig||' signature(s)');
END $a2$;

SET ROLE anon;
DO $a3$
DECLARE v_msg text; v_ok boolean := false;
BEGIN
  BEGIN
    PERFORM public.sign_electronic_record('00000000-0000-7200-a000-00000000000a','esig_doc',
      '00000000-0000-7200-c000-000000000001','approve','approved','CorrectHorse1!');
    v_msg := 'RPC SUCCEEDED';
  EXCEPTION WHEN others THEN v_ok := true; v_msg := SQLERRM;
  END;
  PERFORM esig_assert('A5','anon cannot sign', v_ok, v_msg);
END $a3$;
RESET ROLE;


-- =====================================================================
--  B — authorisation is delegated to the engine  (finding 2)
-- =====================================================================
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-7200-b000-000000000002","role":"authenticated"}',false);
SET ROLE authenticated;
DO $b$
DECLARE r jsonb;
BEGIN
  -- content_creator attempts the admin-only action, with the RIGHT password
  r := public.sign_electronic_record('00000000-0000-7200-a000-00000000000a','esig_doc',
        '00000000-0000-7200-c000-000000000001','send_back','rejected','CorrectHorse1!');
  PERFORM esig_assert('B1','a content_creator cannot sign an admin-only action',
    (r->>'ok')='false' AND r->>'code'='E_SIGNATURE_NOT_PERMITTED', coalesce(r->>'message','NULL'));

  -- an action that does not exist from the current state
  r := public.sign_electronic_record('00000000-0000-7200-a000-00000000000a','esig_doc',
        '00000000-0000-7200-c000-000000000001','qa_final_release','released','CorrectHorse1!');
  PERFORM esig_assert('B2','an invented action is refused',
    (r->>'ok')='false' AND r->>'code'='E_SIGNATURE_ACTION_UNAVAILABLE', coalesce(r->>'code','NULL'));
END $b$;
RESET ROLE;


-- =====================================================================
--  C — the record must exist in the caller's company  (finding 4)
-- =====================================================================
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-7200-b000-000000000003","role":"authenticated"}',false);
SET ROLE authenticated;
DO $c$
DECLARE r jsonb;
BEGIN
  -- outsider names company A, of which they are not a member
  r := public.sign_electronic_record('00000000-0000-7200-a000-00000000000a','esig_doc',
        '00000000-0000-7200-c000-000000000001','approve','approved','CorrectHorse1!');
  PERFORM esig_assert('C1','a non-member cannot sign in another company',
    (r->>'ok')='false' AND r->>'code'='E_SIGNATURE_COMPANY_ACCESS_DENIED', coalesce(r->>'code','NULL'));
END $c$;
RESET ROLE;

SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-7200-b000-000000000001","role":"authenticated"}',false);
SET ROLE authenticated;
DO $c2$
DECLARE r jsonb;
BEGIN
  -- a member of A signing an entity id that exists in no company
  r := public.sign_electronic_record('00000000-0000-7200-a000-00000000000a','esig_doc',
        '00000000-0000-7200-c000-0000000000ff','approve','approved','CorrectHorse1!');
  PERFORM esig_assert('C2','an entity id from outside the company is refused',
    (r->>'ok')='false' AND r->>'code'='E_SIGNATURE_NO_RECORD', coalesce(r->>'code','NULL'));
END $c2$;
RESET ROLE;


-- =====================================================================
--  D — a good signature, and what it records  (findings 3 and 8)
-- =====================================================================
SET ROLE authenticated;
DO $d$
DECLARE r jsonb;
BEGIN
  r := public.sign_electronic_record('00000000-0000-7200-a000-00000000000a','esig_doc',
        '00000000-0000-7200-c000-000000000001','approve','approved','CorrectHorse1!',
        'Reviewed against the batch record.');
  PERFORM esig_assert('D1','a permitted, correctly-credentialled signature succeeds',
    (r->>'ok')='true', coalesce(r::text,'NULL'));
END $d$;
RESET ROLE;

DO $d2$
DECLARE s public.electronic_signatures; v_expected text;
BEGIN
  SELECT * INTO s FROM public.electronic_signatures
   WHERE entity_id='00000000-0000-7200-c000-000000000001' ORDER BY signed_at DESC LIMIT 1;

  PERFORM esig_assert('D2','the signer is the session user, never a client argument',
    s.signer_id='00000000-0000-7200-b000-000000000001', coalesce(s.signer_id::text,'NO ROW'));
  PERFORM esig_assert('D3','the printed name is captured (§11.50)',
    s.signer_name='Ada Admin', coalesce(s.signer_name,'NULL'));
  PERFORM esig_assert('D4','the email is captured',
    s.signer_email='esig-admin@local.test', coalesce(s.signer_email,'NULL'));
  PERFORM esig_assert('D5','the record hash is a real sha256',
    s.record_hash ~ '^[0-9a-f]{64}$', coalesce(s.record_hash,'NULL'));

  -- the §11.70 binding: reproducible from the record itself
  v_expected := public.electronic_signature_record_hash('esig_doc',
                  '00000000-0000-7200-c000-000000000001','00000000-0000-7200-a000-00000000000a');
  PERFORM esig_assert('D6','and it reproduces from the record state',
    s.record_hash = v_expected, coalesce(v_expected,'NULL'));

  PERFORM esig_assert('D7','the state signed is recorded in readable form',
    s.signed_state='in_review', coalesce(s.signed_state,'NULL'));
  PERFORM esig_assert('D8','the hash convention is declared',
    s.hash_convention='sha256-esig-record-v1', coalesce(s.hash_convention,'NULL'));
END $d2$;

-- the client cannot supply a hash: there is no parameter for one
DO $d3$
DECLARE v_args text;
BEGIN
  SELECT pg_get_function_arguments(p.oid) INTO v_args
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='sign_electronic_record';
  PERFORM esig_assert('D9','there is no client-supplied hash parameter',
    v_args NOT ILIKE '%hash%', v_args);
  PERFORM esig_assert('D10','and no signer parameter',
    v_args NOT ILIKE '%signer%', v_args);
END $d3$;


-- =====================================================================
--  E — the meaning vocabulary  (finding 9)
-- =====================================================================
SET ROLE authenticated;
DO $e$
DECLARE r jsonb; v_msg text; v_ok boolean := false;
BEGIN
  BEGIN
    r := public.sign_electronic_record('00000000-0000-7200-a000-00000000000a','esig_doc',
          '00000000-0000-7200-c000-000000000002','approve',
          'I hereby declare whatever I like','CorrectHorse1!');
    v_msg := 'free text ACCEPTED: '||coalesce(r::text,'NULL');
  EXCEPTION WHEN others THEN v_ok := true; v_msg := SQLERRM;
  END;
  PERFORM esig_assert('E1','free-text meaning is rejected', v_ok, left(v_msg,110));
END $e$;
RESET ROLE;


-- =====================================================================
--  F — the audit row joins the tamper-evident chain  (finding 5)
-- =====================================================================
DO $f$
DECLARE a public.audit_logs; n_total int; n_chain int; v_chain json;
BEGIN
  SELECT * INTO a FROM public.audit_logs
   WHERE action='electronic_signature'
     AND company_id='00000000-0000-7200-a000-00000000000a'
   ORDER BY created_at DESC LIMIT 1;

  PERFORM esig_assert('F1','the signature wrote an audit row', a.id IS NOT NULL,
    coalesce(a.id::text,'NO ROW'));
  PERFORM esig_assert('F2','it carries an integrity hash',
    a.integrity_hash ~ '^[0-9a-f]{64}$', coalesce(a.integrity_hash,'NULL'));
  PERFORM esig_assert('F3','it takes a sequence number',
    a.sequence_number IS NOT NULL, coalesce(a.sequence_number::text,'NULL'));
  PERFORM esig_assert('F4','it carries the printed name and record hash',
    a.metadata->>'signer_name'='Ada Admin' AND (a.metadata->>'record_hash') IS NOT NULL,
    coalesce(a.metadata->>'signer_name','NULL'));

  SELECT count(*) INTO n_total FROM public.audit_logs
   WHERE company_id='00000000-0000-7200-a000-00000000000a';
  SELECT count(*) INTO n_chain FROM public.audit_logs
   WHERE company_id='00000000-0000-7200-a000-00000000000a' AND integrity_hash IS NOT NULL;
  PERFORM esig_assert('F5','every audit row for this company is inside the chain',
    n_chain=n_total, n_chain||' of '||n_total);

  v_chain := public.verify_audit_chain('00000000-0000-7200-a000-00000000000a');
  PERFORM esig_assert('F6','and the chain still verifies',
    (v_chain->>'valid')='true', v_chain::text);
END $f$;


-- =====================================================================
--  G — the app can read its own table  (finding 6)
-- =====================================================================
SET ROLE authenticated;
DO $g$
DECLARE n int; v_msg text; v_ok boolean := true;
BEGIN
  BEGIN
    SELECT count(*) INTO n FROM public.electronic_signatures;
    v_msg := n||' row(s) visible';
  EXCEPTION WHEN others THEN v_ok := false; v_msg := SQLERRM;
  END;
  PERFORM esig_assert('G1','an authenticated member can read signatures', v_ok AND n>0, v_msg);
END $g$;
RESET ROLE;

SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-7200-b000-000000000003","role":"authenticated"}',false);
SET ROLE authenticated;
DO $g2$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.electronic_signatures;
  PERFORM esig_assert('G2','another tenant sees none of them', n=0, n||' row(s)');
END $g2$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-7200-b000-000000000001","role":"authenticated"}',false);


-- =====================================================================
--  H — immutability, including TRUNCATE  (finding 7)
-- =====================================================================
DO $h$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['authenticated','anon','service_role'] LOOP
    PERFORM esig_denied('H1.'||r, r||' cannot INSERT a signature directly', r,
      'INSERT INTO public.electronic_signatures(company_id,signer_id,signer_name,signer_email,entity_type,entity_id,action,meaning,record_hash,signed_state) VALUES (''00000000-0000-7200-a000-00000000000a'',''00000000-0000-7200-b000-000000000001'',''x'',''x'',''esig_doc'',''00000000-0000-7200-c000-000000000001'',''approve'',''approved'',repeat(''a'',64),''in_review'')');
    PERFORM esig_denied('H2.'||r, r||' cannot UPDATE a signature', r,
      'UPDATE public.electronic_signatures SET meaning=''rejected''');
    PERFORM esig_denied('H3.'||r, r||' cannot DELETE a signature', r,
      'DELETE FROM public.electronic_signatures');
    PERFORM esig_denied('H4.'||r, r||' cannot TRUNCATE the signature table', r,
      'TRUNCATE public.electronic_signatures');
  END LOOP;
END $h$;


-- =====================================================================
--  I — the engine now REQUIRES the signature  (finding 10)
-- =====================================================================
SET ROLE authenticated;
DO $i$
DECLARE v_msg text; v_ok boolean := false; r jsonb; v_sig uuid;
BEGIN
  -- without a signature id at all
  BEGIN
    PERFORM public.lifecycle_transition('esig_doc','00000000-0000-7200-c000-000000000001',
      'approve','00000000-0000-7200-a000-00000000000a');
    v_msg := 'TRANSITION SUCCEEDED WITHOUT A SIGNATURE';
  EXCEPTION WHEN others THEN
    v_ok := SQLERRM LIKE 'LIFECYCLE_SIGNATURE_REQUIRED%'; v_msg := SQLERRM;
  END;
  PERFORM esig_assert('I1','an unsigned transition is refused', v_ok, left(v_msg,110));

  -- with a bogus signature id
  v_ok := false;
  BEGIN
    PERFORM public.lifecycle_transition('esig_doc','00000000-0000-7200-c000-000000000001',
      'approve','00000000-0000-7200-a000-00000000000a',NULL,NULL,'{}'::jsonb,
      gen_random_uuid());
    v_msg := 'TRANSITION SUCCEEDED WITH A FAKE SIGNATURE';
  EXCEPTION WHEN others THEN
    v_ok := SQLERRM LIKE 'LIFECYCLE_SIGNATURE_INVALID%'; v_msg := SQLERRM;
  END;
  PERFORM esig_assert('I2','an invented signature id is refused', v_ok, left(v_msg,110));

  -- with the real one
  SELECT id INTO v_sig FROM public.electronic_signatures
   WHERE entity_id='00000000-0000-7200-c000-000000000001' ORDER BY signed_at DESC LIMIT 1;
  v_ok := false;
  BEGIN
    r := public.lifecycle_transition('esig_doc','00000000-0000-7200-c000-000000000001',
      'approve','00000000-0000-7200-a000-00000000000a',NULL,NULL,'{}'::jsonb, v_sig);
    v_ok := r->>'to_state'='approved'; v_msg := 'to '||coalesce(r->>'to_state','NULL');
  EXCEPTION WHEN others THEN v_msg := SQLERRM;
  END;
  PERFORM esig_assert('I3','a matching signature permits the transition', v_ok, left(v_msg,110));

  -- and cannot be replayed
  v_ok := false;
  BEGIN
    PERFORM public.lifecycle_transition('esig_doc','00000000-0000-7200-c000-000000000001',
      'approve','00000000-0000-7200-a000-00000000000a',NULL,NULL,'{}'::jsonb, v_sig);
    v_msg := 'REPLAY SUCCEEDED';
  EXCEPTION WHEN others THEN
    v_ok := SQLERRM LIKE 'LIFECYCLE_SIGNATURE_SPENT%' OR SQLERRM LIKE 'LIFECYCLE_INVALID_TRANSITION%';
    v_msg := SQLERRM;
  END;
  PERFORM esig_assert('I4','the same signature cannot be used twice', v_ok, left(v_msg,110));
END $i$;
RESET ROLE;

DO $i2$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.electronic_signature_consumptions;
  PERFORM esig_assert('I5','the consumption was recorded', n=1, n||' row(s)');
END $i2$;

-- a signature belonging to someone else cannot be borrowed
SET ROLE authenticated;
DO $i3$
DECLARE v_sig uuid; v_msg text; v_ok boolean := false; r jsonb;
BEGIN
  -- creator signs entity 2 (approve needs no role, only a signature)
  PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-7200-b000-000000000002","role":"authenticated"}',false);
  r := public.sign_electronic_record('00000000-0000-7200-a000-00000000000a','esig_doc',
        '00000000-0000-7200-c000-000000000002','approve','approved','CorrectHorse1!');
  v_sig := (r->>'signature_id')::uuid;

  -- the ADMIN then tries to spend the creator's signature
  PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-7200-b000-000000000001","role":"authenticated"}',false);
  BEGIN
    PERFORM public.lifecycle_transition('esig_doc','00000000-0000-7200-c000-000000000002',
      'approve','00000000-0000-7200-a000-00000000000a',NULL,NULL,'{}'::jsonb, v_sig);
    v_msg := 'BORROWED SIGNATURE ACCEPTED';
  EXCEPTION WHEN others THEN
    v_ok := SQLERRM LIKE 'LIFECYCLE_SIGNATURE_MISMATCH%'; v_msg := SQLERRM;
  END;
  PERFORM esig_assert('I6','one user cannot spend another user''s signature', v_ok, left(v_msg,110));
END $i3$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-7200-b000-000000000001","role":"authenticated"}',false);


-- =====================================================================
--  J — throttling  (§11.300(d))
-- =====================================================================
SET ROLE authenticated;
DO $j$
DECLARE r jsonb; i int;
BEGIN
  FOR i IN 1..6 LOOP
    r := public.sign_electronic_record('00000000-0000-7200-a000-00000000000a','esig_doc',
          '00000000-0000-7200-c000-000000000002','approve','approved','wrong-again');
  END LOOP;
  PERFORM esig_assert('J1','repeated wrong passwords are throttled',
    r->>'code'='E_SIGNATURE_THROTTLED', coalesce(r->>'code','NULL'));

  -- and the throttle holds even with the CORRECT password
  r := public.sign_electronic_record('00000000-0000-7200-a000-00000000000a','esig_doc',
        '00000000-0000-7200-c000-000000000002','approve','approved','CorrectHorse1!');
  PERFORM esig_assert('J2','the throttle is not bypassed by getting it right',
    r->>'code'='E_SIGNATURE_THROTTLED', coalesce(r->>'code','NULL'));
END $j$;
RESET ROLE;


-- =====================================================================
--  K — ACLs
-- =====================================================================
DO $k$
DECLARE v_acl text;
BEGIN
  SELECT coalesce(array_to_string(proacl,' '),'<default>') INTO v_acl
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='sign_electronic_record';
  PERFORM esig_assert('K1','signing is granted to authenticated', v_acl LIKE '%authenticated=X%', v_acl);
  PERFORM esig_assert('K2','and not to anon', v_acl NOT LIKE '%anon=X%', v_acl);

  SELECT coalesce(array_to_string(proacl,' '),'<default>') INTO v_acl
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='lifecycle_consume_signature';
  PERFORM esig_assert('K3','the consume helper is not callable by clients',
    v_acl NOT LIKE '%authenticated=X%' AND v_acl NOT LIKE '%anon=X%', v_acl);
END $k$;

DO $k2$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname='lifecycle_transition';
  PERFORM esig_assert('K4','there is exactly one lifecycle_transition — no stale overload',
    n=1, n||' overload(s)');
END $k2$;


-- ── results ──────────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims','',false);
\echo ''
\echo '======== ELECTRONIC SIGNATURES — TEST RESULTS ========'
SELECT id, name, verdict, detail FROM esig_results ORDER BY seq;
\echo ''
SELECT verdict, count(*) FROM esig_results GROUP BY verdict ORDER BY verdict;

-- ── cleanup ──────────────────────────────────────────────────────────
DO $cleanup$
BEGIN
  ALTER TABLE public.audit_logs DISABLE TRIGGER trg_block_audit_update;
  ALTER TABLE public.audit_logs DISABLE TRIGGER trg_block_audit_delete;
  ALTER TABLE public.audit_logs DISABLE TRIGGER trg_prevent_audit_log_deletion;
  DELETE FROM public.audit_logs WHERE company_id::text LIKE '00000000-0000-7200-a000-%';
  ALTER TABLE public.audit_logs ENABLE TRIGGER trg_prevent_audit_log_deletion;
  ALTER TABLE public.audit_logs ENABLE TRIGGER trg_block_audit_delete;
  ALTER TABLE public.audit_logs ENABLE TRIGGER trg_block_audit_update;

  DELETE FROM public.electronic_signature_consumptions
   WHERE signature_id IN (SELECT id FROM public.electronic_signatures
                           WHERE company_id::text LIKE '00000000-0000-7200-a000-%');
  ALTER TABLE public.electronic_signatures DISABLE TRIGGER electronic_signatures_no_delete;
  DELETE FROM public.electronic_signatures WHERE company_id::text LIKE '00000000-0000-7200-a000-%';
  ALTER TABLE public.electronic_signatures ENABLE TRIGGER electronic_signatures_no_delete;
  DELETE FROM public.electronic_signature_attempts WHERE user_id::text LIKE '00000000-0000-7200-b000-%';

  DELETE FROM public.entity_state_history WHERE entity_id::text LIKE '00000000-0000-7200-c000-%';
  DELETE FROM public.entity_current_state WHERE entity_id::text LIKE '00000000-0000-7200-c000-%';
  DELETE FROM public.lifecycle_definitions WHERE entity_type='esig_doc';
  DELETE FROM public.company_members WHERE user_id::text LIKE '00000000-0000-7200-b000-%';
  DELETE FROM public.profiles  WHERE email LIKE 'esig-%@local.test';
  DELETE FROM auth.users       WHERE email LIKE 'esig-%@local.test';
  DELETE FROM public.companies WHERE name LIKE 'ESIG %';
  RAISE NOTICE 'esig fixtures removed.';
EXCEPTION WHEN others THEN
  RAISE WARNING 'CLEANUP INCOMPLETE (%). Remove esig rows manually.', SQLERRM;
END $cleanup$;

DROP FUNCTION IF EXISTS esig_assert(text,text,boolean,text);
DROP FUNCTION IF EXISTS esig_denied(text,text,text,text);
DROP TABLE IF EXISTS esig_results;
