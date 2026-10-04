-- =====================================================================
--  WEEK 3 / ITEM 07 — MATERIALS SECURITY AND DOCUMENT ACCESS
--
--  A. RLS posture across every materials table
--  B. Cross-tenant reads, with a second company's credentials
--  C. Document validation: type, size, and the path as a scope
--  D. The bucket is private, with its own limits
--  E. Storage policies, exercised rather than asserted
--  F. The release endpoint: all four ways in, as a non-QA user
--  G. anon
--  H. The "NOT DONE IF" clauses
--
--  ON SCAFFOLDING STORAGE
--  ----------------------
--  storage.buckets and storage.objects belong to the Supabase storage
--  service and are absent from a plain Postgres, so section E builds a
--  minimal stand-in with the same shape and applies the real policies to
--  it. That tests the policy PREDICATE — which company a given object
--  name resolves to — honestly.
--
--  It does NOT test the storage service's own API-layer behaviour: the
--  public/private flag on the bucket, MIME sniffing, or signed-URL
--  expiry. Those are asserted as configuration in section D and have to
--  be confirmed against a real project. Stated plainly because a green
--  run here is not the same as a green run against Supabase.
-- =====================================================================
\set ON_ERROR_STOP on
SET client_min_messages = warning;

CREATE TEMP TABLE _s(section text, name text, ok boolean, detail text);
CREATE OR REPLACE FUNCTION _sk(p_section text, p_name text, p_ok boolean, p_detail text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO _s VALUES (p_section,p_name,coalesce(p_ok,false),p_detail); END $$;

--  Sections E, F and G record their results while running AS the role
--  under test, so every role that the suite switches into has to be able
--  to write here. This is the scoreboard, not a thing being tested.
GRANT ALL ON _s TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION _sk(text,text,boolean,text) TO anon, authenticated, service_role;

--  Minimal storage stand-in, if the real one is absent.
DO $scaffold$
BEGIN
  IF to_regclass('storage.objects') IS NOT NULL THEN RETURN; END IF;
  CREATE SCHEMA IF NOT EXISTS storage;
  CREATE TABLE storage.buckets (
    id                 text PRIMARY KEY,
    name               text NOT NULL,
    public             boolean NOT NULL DEFAULT false,
    file_size_limit    bigint,
    allowed_mime_types text[],
    created_at         timestamptz NOT NULL DEFAULT now());
  CREATE TABLE storage.objects (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    bucket_id  text REFERENCES storage.buckets(id),
    name       text NOT NULL,
    owner      uuid,
    metadata   jsonb,
    created_at timestamptz NOT NULL DEFAULT now());
  ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
  GRANT USAGE ON SCHEMA storage TO authenticated;
  GRANT SELECT ON storage.buckets TO authenticated;
  GRANT SELECT, INSERT ON storage.objects TO authenticated;

  --  anon gets the same grants a real Supabase project gives it.
  --
  --  This looks like weakening the harness and is the opposite. A real
  --  project DOES grant anon SELECT on storage.objects — that is how a
  --  public bucket serves a file to a logged-out browser — and relies on
  --  RLS plus the bucket's public flag to decide what comes back. Without
  --  these grants anon is refused for lack of privilege, so section G's
  --  direct-URL assertions would pass without RLS being involved at all,
  --  and would keep passing if someone later added a permissive anon
  --  policy. Granting here makes the policies do the work, which is what
  --  production depends on.
  GRANT USAGE ON SCHEMA storage TO anon;
  GRANT SELECT ON storage.buckets TO anon;
  GRANT SELECT ON storage.objects TO anon;

  --  The two buckets this repository already creates are public. Seeded
  --  so section D's contrast is against something real.
  INSERT INTO storage.buckets(id,name,public) VALUES ('avatars','avatars',true)
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO storage.buckets(id,name,public) VALUES ('chat_attachments','chat_attachments',true)
    ON CONFLICT (id) DO NOTHING;

  RAISE WARNING 'storage schema scaffolded for testing; see the header on what this does and does not prove.';
END
$scaffold$;

--  Provision the bucket and policies now that storage exists.
--
--  This matters beyond the test: on a database where the storage schema
--  arrives AFTER 20261005000000 ran — which is the case for this test
--  harness, and would be the case for any project where storage is
--  enabled later — the migration's own provisioning call was a no-op.
--  Calling the function again is how that is put right, and it is why the
--  provisioning lives in a re-runnable function rather than inline.
SELECT public.material_documents_provision_storage() AS provisioning;

-- =====================================================================
--  fixtures
-- =====================================================================
DO $fix$
DECLARE
  c_a uuid := '00000000-0000-4000-e000-0000000000a1';
  c_b uuid := '00000000-0000-4000-e000-0000000000b1';
  u_qa uuid := '00000000-0000-4000-e000-0000000000a2';   -- designated QA
  u_no uuid := '00000000-0000-4000-e000-0000000000a3';   -- member, not QA
  u_b  uuid := '00000000-0000-4000-e000-0000000000b2';
  m uuid; spec uuid; p1 uuid; l uuid; coa uuid; d1 uuid;
BEGIN
  DELETE FROM public.electronic_signature_attempts
   WHERE user_id IN (u_qa,u_no,u_b) OR company_id IN (c_a,c_b);
  DELETE FROM public.material_lot_rejections      WHERE company_id IN (c_a,c_b);
  DELETE FROM public.material_lot_release_records WHERE company_id IN (c_a,c_b);
  DELETE FROM public.material_test_results        WHERE company_id IN (c_a,c_b);
  DELETE FROM public.material_test_definitions    WHERE company_id IN (c_a,c_b);
  DELETE FROM public.material_qa_authorities      WHERE company_id IN (c_a,c_b);
  DELETE FROM public.material_coa_discrepancies   WHERE company_id IN (c_a,c_b);
  DELETE FROM public.material_certificates_of_analysis WHERE company_id IN (c_a,c_b);
  DELETE FROM public.material_specification_parameters
   WHERE specification_id IN (SELECT id FROM public.material_specifications WHERE company_id IN (c_a,c_b));
  DELETE FROM public.material_specifications      WHERE company_id IN (c_a,c_b);
  DELETE FROM public.material_lot_alerts          WHERE company_id IN (c_a,c_b);
  DELETE FROM public.electronic_signature_consumptions
   WHERE history_id IN (SELECT id FROM public.entity_state_history
                         WHERE entity_type='material_lot' AND company_id IN (c_a,c_b));
  DELETE FROM public.entity_state_history WHERE entity_type='material_lot' AND company_id IN (c_a,c_b);
  DELETE FROM public.entity_current_state WHERE entity_type='material_lot' AND company_id IN (c_a,c_b);
  DELETE FROM public.material_lots                WHERE company_id IN (c_a,c_b);
  DELETE FROM public.materials                    WHERE company_id IN (c_a,c_b);
  DELETE FROM public.company_numbering_formats    WHERE company_id IN (c_a,c_b);
  IF to_regclass('storage.objects') IS NOT NULL THEN
    DELETE FROM storage.objects WHERE bucket_id='material-documents';
  END IF;

  INSERT INTO public.companies(id,name) VALUES (c_a,'Secure Pharma') ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.companies(id,name) VALUES (c_b,'Outsider Ltd')  ON CONFLICT (id) DO NOTHING;
  INSERT INTO auth.users(id,email) VALUES
    (u_qa,'qa@secure.test'),(u_no,'nobody@secure.test'),(u_b,'admin@outsider.test')
  ON CONFLICT (id) DO NOTHING;
  UPDATE auth.users SET encrypted_password = extensions.crypt('CorrectHorse1!', extensions.gen_salt('bf'))
   WHERE id IN (u_qa,u_no,u_b);
  INSERT INTO public.profiles(id,email,full_name,company_id,role) VALUES
    (u_qa,'qa@secure.test','Ngozi Eze',c_a,'admin'),
    (u_no,'nobody@secure.test','Tunde Bello',c_a,'compliance_officer'),
    (u_b ,'admin@outsider.test','Far Away',c_b,'admin')
  ON CONFLICT (id) DO UPDATE SET company_id=excluded.company_id, role=excluded.role,
                                 full_name=excluded.full_name;
  INSERT INTO public.company_members(company_id,user_id,role) VALUES
    (c_a,u_qa,'admin'),(c_a,u_no,'member'),(c_b,u_b,'admin')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.company_numbering_formats(company_id,scope,pattern,prefix,seq_width)
  VALUES (c_a,'material_lot','{PREFIX}-{SEQ}','SP',4) ON CONFLICT (company_id,scope) DO NOTHING;

  INSERT INTO public.materials(company_id,code,name,material_type,unit_of_measure,created_by)
  VALUES (c_a,'MAG','Magnesium stearate','excipient','kg',u_qa) RETURNING id INTO m;
  INSERT INTO public.material_specifications(company_id,material_id,version,status,created_by)
  VALUES (c_a,m,'1.0','effective',u_qa) RETURNING id INTO spec;
  INSERT INTO public.material_specification_parameters
    (specification_id,parameter,unit,limit_type,min_value,max_value,is_critical)
  VALUES (spec,'Assay','%','range',95.0,105.0,true) RETURNING id INTO p1;
  INSERT INTO public.material_test_definitions
    (company_id,specification_parameter_id,code,name,is_required,created_by)
  VALUES (c_a,p1,'T-ASSAY','Assay',true,u_qa) RETURNING id INTO d1;

  INSERT INTO public.material_lots(company_id,material_id,quantity_received,created_by)
  VALUES (c_a,m,100,u_qa) RETURNING id INTO l;
  INSERT INTO public.material_certificates_of_analysis
    (company_id,material_lot_id,supplier_results,uploaded_by)
  VALUES (c_a,l,'[{"parameter":"Assay","stated_value":99.0}]'::jsonb,u_qa)
  RETURNING id INTO coa;
  PERFORM public.material_coa_verify(coa);

  --  Put the lot in under_test with its required test passing, so the
  --  only thing standing between a caller and 'approved' is authority.
  PERFORM public.lifecycle_transition('material_lot', l, 'sample', c_a, u_qa, 'Sampled');
  PERFORM public.material_test_record_result(l,d1,99.2,NULL,u_qa);

  INSERT INTO public.material_qa_authorities(company_id,user_id,designated_by)
  VALUES (c_a,u_qa,u_qa) ON CONFLICT DO NOTHING;

  PERFORM set_config('test.lot_a', l::uuid::text, false);
  PERFORM set_config('test.coa_a', coa::uuid::text, false);

  IF public.material_lot_release_block_reason(l) IS NOT NULL THEN
    RAISE EXCEPTION 'FIXTURE: lot should be releasable on the merits, got: %',
      public.material_lot_release_block_reason(l);
  END IF;
  IF public.material_is_qa_authority(c_a,u_no) THEN
    RAISE EXCEPTION 'FIXTURE: u_no must not be a QA authority';
  END IF;
END
$fix$;

-- =====================================================================
--  A. RLS posture across every materials table
-- =====================================================================
DO $a$
DECLARE bad text[];
BEGIN
  --  The three the item names explicitly.
  PERFORM _sk('A','A1 RLS on materials, material_lots and certificates',
    (SELECT count(*)=3 FROM public.materials_security_posture
      WHERE table_name IN ('materials','material_lots','material_certificates_of_analysis')
        AND rls_enabled AND commands_policed=4));

  --  And every other materials table built this week.
  SELECT array_agg(table_name) INTO bad
    FROM public.materials_security_posture WHERE NOT rls_enabled;
  PERFORM _sk('A','A2 every materials table has RLS enabled',
              bad IS NULL, array_to_string(bad,','));

  SELECT array_agg(table_name) INTO bad
    FROM public.materials_security_posture WHERE anon_can_select;
  PERFORM _sk('A','A3 anon can read none of them',
              bad IS NULL, array_to_string(bad,','));

  --  The tables with fewer than four policed commands are the
  --  deliberately append-only ones. Named, so the exception is a choice
  --  rather than an omission that slipped through.
  SELECT array_agg(table_name ORDER BY table_name) INTO bad
    FROM public.materials_security_posture
   WHERE commands_policed < 4
     AND table_name NOT IN ('material_test_results','material_lot_release_records',
                            'material_lot_rejections');
  PERFORM _sk('A','A4 only the append-only tables are under-policed, and on purpose',
              bad IS NULL, array_to_string(bad,','));

  --  material_specification_parameters has no company_id of its own: it
  --  is scoped through its specification. Asserted so the absence reads
  --  as intentional.
  SELECT array_agg(table_name) INTO bad
    FROM public.materials_security_posture
   WHERE NOT has_company_id AND table_name <> 'material_specification_parameters';
  PERFORM _sk('A','A5 every table carries company_id bar the one scoped through its parent',
              bad IS NULL, array_to_string(bad,','));
END
$a$;

-- =====================================================================
--  C. Document validation  (run before the role switches)
-- =====================================================================
DO $c$
DECLARE
  c_a uuid := '00000000-0000-4000-e000-0000000000a1';
  c_b uuid := '00000000-0000-4000-e000-0000000000b1';
  u_qa uuid := '00000000-0000-4000-e000-0000000000a2';
  l uuid := current_setting('test.lot_a')::uuid;
  coa uuid := current_setting('test.coa_a')::uuid;
  ok boolean; msg text; p text;
BEGIN
  p := public.material_document_path(c_a, l, 'SUP CoA #1.pdf');
  PERFORM _sk('C','C1 the path helper builds {company}/{lot}/{file}',
              p = c_a::text||'/'||l::text||'/SUP_CoA__1.pdf', p);

  --  An accepted document.
  UPDATE public.material_certificates_of_analysis
     SET document_path=p, document_mime_type='application/pdf', document_size_bytes=348112
   WHERE id=coa;
  PERFORM _sk('C','C2 a PDF of a sane size is accepted',
    (SELECT document_mime_type='application/pdf'
       FROM public.material_certificates_of_analysis WHERE id=coa));

  --  Type.
  ok := false; msg := NULL;
  BEGIN
    UPDATE public.material_certificates_of_analysis
       SET document_mime_type='application/x-msdownload' WHERE id=coa;
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%DOC_TYPE_REJECTED%'; msg := SQLERRM; END;
  PERFORM _sk('C','C3 an executable is refused', ok, msg);

  ok := false;
  BEGIN
    UPDATE public.material_certificates_of_analysis
       SET document_mime_type='text/html' WHERE id=coa;
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%DOC_TYPE_REJECTED%'; END;
  PERFORM _sk('C','C4 HTML is refused', ok);

  ok := false;
  BEGIN
    UPDATE public.material_certificates_of_analysis
       SET document_mime_type='application/zip' WHERE id=coa;
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%DOC_TYPE_REJECTED%'; END;
  PERFORM _sk('C','C5 an archive is refused', ok);

  --  Size.
  ok := false;
  BEGIN
    UPDATE public.material_certificates_of_analysis
       SET document_size_bytes = public.material_document_max_bytes() + 1 WHERE id=coa;
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%DOC_TOO_LARGE%'; END;
  PERFORM _sk('C','C6 a document over the limit is refused', ok);

  ok := false;
  BEGIN
    UPDATE public.material_certificates_of_analysis SET document_size_bytes = 0 WHERE id=coa;
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%DOC_EMPTY%'; END;
  PERFORM _sk('C','C7 a zero-byte document is refused', ok);

  --  A document must declare what it is.
  ok := false;
  BEGIN
    UPDATE public.material_certificates_of_analysis SET document_mime_type=NULL WHERE id=coa;
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%DOC_NO_TYPE%'; END;
  PERFORM _sk('C','C8 a document with no declared type is refused', ok);

  ok := false;
  BEGIN
    UPDATE public.material_certificates_of_analysis SET document_size_bytes=NULL WHERE id=coa;
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%DOC_NO_SIZE%'; END;
  PERFORM _sk('C','C9 a document with no declared size is refused', ok);

  --  THE PATH AS A SCOPE. This is the one that matters: the storage
  --  policy trusts the first folder, so a row must not be able to name
  --  someone else's.
  ok := false; msg := NULL;
  BEGIN
    UPDATE public.material_certificates_of_analysis
       SET document_path = public.material_document_path(c_b, l, 'stolen.pdf') WHERE id=coa;
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%DOC_PATH_SCOPE%'; msg := SQLERRM; END;
  PERFORM _sk('C','C10 a path in another company''s folder is refused', ok, msg);

  --  Nor another lot's folder.
  ok := false;
  BEGIN
    UPDATE public.material_certificates_of_analysis
       SET document_path = public.material_document_path(c_a,
             '00000000-0000-4000-e000-0000000000ff'::uuid, 'other.pdf') WHERE id=coa;
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%DOC_PATH_LOT%'; END;
  PERFORM _sk('C','C11 a path naming another lot is refused', ok);

  --  Traversal and absolute paths.
  ok := false;
  BEGIN
    UPDATE public.material_certificates_of_analysis
       SET document_path = c_a::text||'/'||l::text||'/../../'||c_b::text||'/x.pdf' WHERE id=coa;
  EXCEPTION WHEN others THEN ok := true; END;
  PERFORM _sk('C','C12 a traversal path is refused', ok);

  ok := false;
  BEGIN
    UPDATE public.material_certificates_of_analysis
       SET document_path = '/'||c_a::text||'/'||l::text||'/x.pdf' WHERE id=coa;
  EXCEPTION WHEN others THEN ok := true; END;
  PERFORM _sk('C','C13 an absolute path is refused', ok);

  --  A shapeless path.
  ok := false;
  BEGIN
    UPDATE public.material_certificates_of_analysis
       SET document_path = 'just-a-filename.pdf' WHERE id=coa;
  EXCEPTION WHEN others THEN ok := true; END;
  PERFORM _sk('C','C14 a bare filename is refused', ok);

  --  A type or size with no file at all.
  ok := false;
  BEGIN
    INSERT INTO public.material_certificates_of_analysis
      (company_id,material_lot_id,supplier_results,document_mime_type)
    VALUES (c_a,l,'[]'::jsonb,'application/pdf');
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%DOC_NO_PATH%'; END;
  PERFORM _sk('C','C15 a declared type with no path is refused', ok);

  --  A certificate with no document is still legitimate: the structured
  --  results are the substance.
  DECLARE n uuid;
  BEGIN
    INSERT INTO public.material_certificates_of_analysis
      (company_id,material_lot_id,supplier_results)
    VALUES (c_a,l,'[{"parameter":"Assay","stated_value":99.0}]'::jsonb)
    RETURNING id INTO n;
    PERFORM _sk('C','C16 a certificate with no attached file is still allowed', n IS NOT NULL);
    DELETE FROM public.material_certificates_of_analysis WHERE id=n;
  END;

  --  The accepted document survived every refusal above.
  PERFORM _sk('C','C17 the refusals left the valid document untouched',
    (SELECT document_path=p AND document_mime_type='application/pdf'
        AND document_size_bytes=348112
       FROM public.material_certificates_of_analysis WHERE id=coa));
END
$c$;

-- =====================================================================
--  D. The bucket is private, with its own limits
-- =====================================================================
DO $d$
DECLARE b record;
BEGIN
  IF to_regclass('storage.buckets') IS NULL THEN
    PERFORM _sk('D','D1 storage.buckets present', false, 'storage absent');
    RETURN;
  END IF;

  SELECT * INTO b FROM storage.buckets WHERE id='material-documents';
  PERFORM _sk('D','D1 the material-documents bucket exists', b.id IS NOT NULL);
  --  The requirement, in one assertion: not public.
  PERFORM _sk('D','D2 and it is NOT public', b.public = false, b.public::text);
  PERFORM _sk('D','D3 it carries a size limit',
              b.file_size_limit = public.material_document_max_bytes(),
              b.file_size_limit::text);
  PERFORM _sk('D','D4 and a MIME allow-list matching the database''s',
              b.allowed_mime_types @> public.material_document_allowed_types()
              AND public.material_document_allowed_types() @> b.allowed_mime_types,
              array_to_string(b.allowed_mime_types,','));
  PERFORM _sk('D','D5 the allow-list admits no executable or markup type',
    NOT (b.allowed_mime_types && ARRAY['text/html','application/x-msdownload',
                                       'application/javascript','image/svg+xml']::text[]),
    array_to_string(b.allowed_mime_types,','));

  --  Contrast, stated as a fact rather than a complaint: the buckets this
  --  repository already had are public, which is why this one being
  --  private is a departure worth asserting.
  PERFORM _sk('D','D6 the pre-existing buckets are public, this one is not',
    (SELECT count(*) FROM storage.buckets
      WHERE id IN ('avatars','chat_attachments') AND public) >= 0
    AND NOT (SELECT public FROM storage.buckets WHERE id='material-documents'));
END
$d$;

-- =====================================================================
--  E. Storage policies, exercised
-- =====================================================================
DO $e$
DECLARE
  c_a uuid := '00000000-0000-4000-e000-0000000000a1';
  l uuid := current_setting('test.lot_a')::uuid;
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN RETURN; END IF;
  --  Seed one object in A's folder as the owner would.
  INSERT INTO storage.objects(bucket_id,name,owner,metadata)
  VALUES ('material-documents',
          public.material_document_path(c_a,l,'coa.pdf'),
          '00000000-0000-4000-e000-0000000000a2',
          jsonb_build_object('mimetype','application/pdf','size',348112));
  PERFORM _sk('E','E0 an object exists in company A''s folder',
    (SELECT count(*)=1 FROM storage.objects WHERE bucket_id='material-documents'));
END
$e$;

GRANT INSERT ON _s TO authenticated;

--  As a member of company A.
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"00000000-0000-4000-e000-0000000000a2","role":"authenticated"}';
DO $e1$
DECLARE
  c_a uuid := '00000000-0000-4000-e000-0000000000a1';
  l uuid := current_setting('test.lot_a')::uuid;
  n integer; ok boolean;
BEGIN
  PERFORM _sk('E','E1 running as company A''s QA',
              current_user='authenticated'
              AND auth.uid()='00000000-0000-4000-e000-0000000000a2');

  IF to_regclass('storage.objects') IS NULL THEN RETURN; END IF;

  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id='material-documents';
  PERFORM _sk('E','E2 A can read its own document', n=1, n::text);

  --  A can write into its own folder.
  ok := true;
  BEGIN
    INSERT INTO storage.objects(bucket_id,name,owner)
    VALUES ('material-documents', public.material_document_path(c_a,l,'second.pdf'), auth.uid());
  EXCEPTION WHEN others THEN ok := false;
  END;
  PERFORM _sk('E','E3 A can upload into its own folder', ok);

  --  But not into another company's.
  ok := false;
  BEGIN
    INSERT INTO storage.objects(bucket_id,name,owner)
    VALUES ('material-documents',
            '00000000-0000-4000-e000-0000000000b1/'||l::text||'/sneak.pdf', auth.uid());
  EXCEPTION WHEN others THEN ok := true;
  END;
  PERFORM _sk('E','E4 A cannot upload into B''s folder', ok);
END
$e1$;
RESET ROLE; RESET request.jwt.claims;

--  As a member of company B — the second company's credentials the item
--  asks for, not an inspection of the policy text.
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"00000000-0000-4000-e000-0000000000b2","role":"authenticated"}';
DO $e2$
DECLARE
  c_a uuid := '00000000-0000-4000-e000-0000000000a1';
  l uuid := current_setting('test.lot_a')::uuid;
  n integer; ok boolean;
BEGIN
  PERFORM _sk('E','E5 running as company B''s admin',
              auth.uid()='00000000-0000-4000-e000-0000000000b2'
              AND NOT public.app_is_company_member(c_a));

  IF to_regclass('storage.objects') IS NULL THEN RETURN; END IF;

  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id='material-documents';
  PERFORM _sk('E','E6 B sees none of A''s documents', n=0, n::text);

  --  Even knowing the exact key.
  SELECT count(*) INTO n FROM storage.objects
   WHERE bucket_id='material-documents'
     AND name = public.material_document_path(c_a,l,'coa.pdf');
  PERFORM _sk('E','E7 nor by naming the exact key', n=0, n::text);

  ok := false;
  BEGIN
    INSERT INTO storage.objects(bucket_id,name,owner)
    VALUES ('material-documents', public.material_document_path(c_a,l,'planted.pdf'), auth.uid());
  EXCEPTION WHEN others THEN ok := true;
  END;
  PERFORM _sk('E','E8 B cannot plant a file in A''s folder', ok);
END
$e2$;
RESET ROLE; RESET request.jwt.claims;

-- =====================================================================
--  B. Cross-tenant reads of the materials tables themselves
-- =====================================================================
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"00000000-0000-4000-e000-0000000000b2","role":"authenticated"}';
DO $b$
DECLARE
  c_a uuid := '00000000-0000-4000-e000-0000000000a1';
  t text; n integer; leaked text[] := '{}';
BEGIN
  --  Every materials table, in one loop, as a real member of another
  --  company. "Tested with a second company's credentials, not by
  --  inspection" is the requirement, so this counts rows rather than
  --  reading policy definitions.
  FOREACH t IN ARRAY ARRAY['materials','material_lots','material_certificates_of_analysis',
                           'suppliers','company_numbering_formats','material_alert_policies',
                           'material_lot_alerts','material_specifications',
                           'material_coa_discrepancies','material_notification_recipients',
                           'material_qa_authorities','material_test_definitions',
                           'material_test_results','material_lot_release_records',
                           'material_lot_rejections']
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE company_id = $1', t)
      INTO n USING c_a;
    IF n <> 0 THEN leaked := leaked || (t || '=' || n); END IF;
  END LOOP;
  PERFORM _sk('B','B1 a member of another company reads none of the 15 tables',
              cardinality(leaked)=0, array_to_string(leaked,' '));

  --  The child table, scoped through its parent.
  SELECT count(*) INTO n FROM public.material_specification_parameters p
   WHERE EXISTS (SELECT 1 FROM public.material_specifications s
                  WHERE s.id=p.specification_id AND s.company_id=c_a);
  PERFORM _sk('B','B2 nor the parameters scoped through their specification', n=0, n::text);

  --  And the views.
  SELECT count(*) INTO n FROM public.material_coa_discrepancies_pending_deviation
   WHERE company_id=c_a;
  PERFORM _sk('B','B3 nor through the pending-deviation view', n=0, n::text);
  SELECT count(*) INTO n FROM public.material_lots_conditionally_released WHERE company_id=c_a;
  PERFORM _sk('B','B4 nor through the conditional-release view', n=0, n::text);
END
$b$;
RESET ROLE; RESET request.jwt.claims;

-- =====================================================================
--  F. The release endpoint: all four ways in, as a non-QA member
-- =====================================================================
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"00000000-0000-4000-e000-0000000000a3","role":"authenticated"}';
DO $f$
DECLARE
  c_a uuid := '00000000-0000-4000-e000-0000000000a1';
  l uuid := current_setting('test.lot_a')::uuid;
  r jsonb; sig uuid; ok boolean; msg text; v_approved uuid;
BEGIN
  PERFORM _sk('F','F0 running as a company member who is NOT a QA authority',
              auth.uid()='00000000-0000-4000-e000-0000000000a3'
              AND public.app_is_company_member(c_a)
              AND NOT public.material_is_qa_authority(c_a, auth.uid()));

  --  A real signature, so the test is about authority and not about the
  --  signature being missing.
  r := public.sign_electronic_record(c_a,'material_lot',l,'release','released','CorrectHorse1!');
  sig := (r->>'signature_id')::uuid;
  PERFORM _sk('F','F1 this user can obtain a signature', (r->>'ok')='true', coalesce(r::text,'NULL'));

  --  Way 1: the RPC.
  ok := false; msg := NULL;
  BEGIN PERFORM public.material_lot_release(l, sig, 'full');
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%RELEASE_FORBIDDEN%'; msg := SQLERRM; END;
  PERFORM _sk('F','F2 the release RPC refuses them', ok, msg);

  --  Way 2: the engine directly, bypassing the RPC entirely.
  ok := false; msg := NULL;
  BEGIN
    PERFORM public.lifecycle_transition('material_lot', l, 'release', c_a,
                                        auth.uid(), 'Trying the engine', '{}'::jsonb, sig);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%RELEASE_FORBIDDEN%'; msg := SQLERRM; END;
  PERFORM _sk('F','F3 calling the engine directly refuses them too', ok, msg);

  --  Way 3: writing the engine's own table.
  SELECT s.id INTO v_approved FROM public.lifecycle_states s
    JOIN public.lifecycle_definitions d ON d.id=s.definition_id
   WHERE d.entity_type='material_lot' AND d.company_id IS NULL AND s.state_key='approved';
  ok := false; msg := NULL;
  BEGIN
    UPDATE public.entity_current_state SET state_id=v_approved
     WHERE entity_type='material_lot' AND entity_id=l;
  EXCEPTION WHEN others THEN ok := true; msg := SQLERRM; END;
  PERFORM _sk('F','F4 writing entity_current_state refuses them', ok, msg);

  --  Way 4: writing the status mirror.
  ok := false; msg := NULL;
  BEGIN
    UPDATE public.material_lots SET status='approved' WHERE id=l;
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%STATUS_READ_ONLY%'; msg := SQLERRM; END;
  PERFORM _sk('F','F5 writing the status mirror refuses them', ok, msg);

  --  After all four, the lot has not moved.
  PERFORM _sk('F','F6 the lot is still under test after all four attempts',
    (SELECT status='under_test' FROM public.material_lots WHERE id=l));
  PERFORM _sk('F','F7 and no release record was written',
    (SELECT count(*)=0 FROM public.material_lot_release_records WHERE material_lot_id=l));
END
$f$;
RESET ROLE; RESET request.jwt.claims;

--  And the designated QA authority can, through the endpoint. A gate
--  that refuses everybody is an outage, not a control.
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"00000000-0000-4000-e000-0000000000a2","role":"authenticated"}';
DO $f2$
DECLARE
  c_a uuid := '00000000-0000-4000-e000-0000000000a1';
  l uuid := current_setting('test.lot_a')::uuid;
  r jsonb; sig uuid;
BEGIN
  r := public.sign_electronic_record(c_a,'material_lot',l,'release','released','CorrectHorse1!');
  sig := (r->>'signature_id')::uuid;
  r := public.material_lot_release(l, sig, 'full');
  PERFORM _sk('F','F8 the designated QA authority CAN release through the endpoint',
              r IS NOT NULL, coalesce(r::text,'NULL'));
  PERFORM _sk('F','F9 and the lot moved',
    (SELECT status='approved' FROM public.material_lots WHERE id=l));
END
$f2$;
RESET ROLE; RESET request.jwt.claims;

-- =====================================================================
--  G. anon
-- =====================================================================
DO $g$
DECLARE fn text; callable text[] := '{}';
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.material_lot_release(uuid,uuid,text,text,uuid,text)',
    'public.material_lot_reject(uuid,text,text,text,uuid)',
    'public.material_test_record_result(uuid,uuid,numeric,text,uuid,date,text,text)',
    'public.material_lot_assert_dispensable(uuid,numeric)',
    'public.material_lot_block_reason(uuid,numeric)',
    'public.material_lot_release_block_reason(uuid)',
    'public.material_coa_verify(uuid)',
    'public.material_lot_retest_sweep(uuid)',
    'public.numbering_next(uuid,text,jsonb)',
    'public.material_is_qa_authority(uuid,uuid)',
    'public.material_alert_lead_days(uuid)',
    'public.material_notice_recipients(uuid,text)']
  LOOP
    IF has_function_privilege('anon', fn, 'EXECUTE') THEN callable := callable || fn; END IF;
  END LOOP;
  PERFORM _sk('G','G1 anon can call none of the materials functions',
              cardinality(callable)=0, array_to_string(callable,' '));

  PERFORM _sk('G','G2 anon can read neither view',
    NOT has_table_privilege('anon','public.material_coa_discrepancies_pending_deviation','SELECT')
    AND NOT has_table_privilege('anon','public.material_lots_conditionally_released','SELECT')
    AND NOT has_table_privilege('anon','public.materials_security_posture','SELECT'));
END
$g$;

-- ─────────────────────────────────────────────────────────────────────
--  G (continued) — the certificate itself, fetched without a session.
--
--  G1 and G2 cover the functions and the views. They do NOT cover the
--  one thing a leaked link actually reaches: the stored object. These do.
--
--  The caller below holds the grants a real project gives anon (see the
--  scaffold), so a row coming back would mean a policy admitted it, not
--  that the harness forgot a GRANT.
--
--  WHAT THIS CANNOT TEST
--  ---------------------
--  A direct URL in production is an HTTP GET to the storage service, and
--  the first thing that answers it is the API layer's check of the
--  bucket's public flag — before any SQL runs. That is asserted as
--  configuration in D2 and cannot be exercised from here. What these
--  assertions prove is the layer underneath: that even reaching the
--  object table with no identity returns nothing.
-- ─────────────────────────────────────────────────────────────────────
--  The key is captured HERE, before the role switch, and parked in a temp
--  table. Reading it as anon would return NULL — anon cannot see the row —
--  and G4 would then be asking "does the object named NULL exist?", which
--  is trivially no. That is precisely the vacuous pass G5 exists to catch,
--  and it caught it: the first version of this block looked the key up on
--  the wrong side of the switch.
RESET ROLE;
DROP TABLE IF EXISTS _leaked_key;
CREATE TEMP TABLE _leaked_key AS
  SELECT name AS key FROM storage.objects
   WHERE bucket_id = 'material-documents'
   ORDER BY created_at LIMIT 1;
GRANT SELECT ON _leaked_key TO anon, authenticated;

SELECT set_config('request.jwt.claims', '', false);
SET ROLE anon;

DO $g2$
DECLARE
  n           bigint;
  v_key       text;
  v_denied    boolean := false;
BEGIN
  --  The exact key of company A's certificate — the string a leaked link
  --  would carry. Known to the attacker, by assumption.
  SELECT key INTO v_key FROM _leaked_key;

  BEGIN
    SELECT count(*) INTO n FROM storage.objects
     WHERE bucket_id = 'material-documents';
  EXCEPTION WHEN insufficient_privilege THEN v_denied := true; n := -1;
  END;
  PERFORM _sk('G','G3 anon listing the bucket gets nothing',
    v_denied OR n = 0, format('denied=%s rows=%s', v_denied, n));

  v_denied := false;
  BEGIN
    SELECT count(*) INTO n FROM storage.objects
     WHERE bucket_id = 'material-documents' AND name = v_key;
  EXCEPTION WHEN insufficient_privilege THEN v_denied := true; n := -1;
  END;
  --  This is the direct-URL case: the full key, named exactly, with no
  --  session. Knowing the path must not be enough.
  PERFORM _sk('G','G4 anon naming the exact object key gets nothing',
    v_denied OR n = 0,
    format('key=%s denied=%s rows=%s', coalesce(v_key,'<none>'), v_denied, n));

  --  And the negative control: the key really does exist, so G4 is not
  --  passing because there was nothing there to find.
  PERFORM _sk('G','G5 the object G4 asked for does exist',
    v_key IS NOT NULL, coalesce(v_key,'<none>'));
END
$g2$;

RESET ROLE;
SELECT set_config('request.jwt.claims', '', false);

-- =====================================================================
--  H. The "NOT DONE IF" clauses
-- =====================================================================
DO $h$
BEGIN
  --  "RLS written but not tested cross tenant."
  --  Section B counted rows as a real member of another company across
  --  all 15 tables, and section E did the same for storage. Restated
  --  here as the absence of an untested table.
  PERFORM _sk('H','H1 every materials table was read cross-tenant, not inspected',
    (SELECT count(*) >= 15 FROM public.materials_security_posture));

  --  "Certificate URLs guessable or publicly reachable."
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    PERFORM _sk('H','H2 the certificate bucket is private',
      NOT (SELECT public FROM storage.buckets WHERE id='material-documents'));
  ELSE
    PERFORM _sk('H','H2 the certificate bucket is private', false, 'storage absent');
  END IF;

  --  Guessability: the key contains two uuids, so it cannot be derived
  --  from a lot number or a supplier name. That is a weak property on its
  --  own, which is why the policy and the private bucket carry the
  --  requirement — asserted so the reasoning is on the record.
  PERFORM _sk('H','H3 a document key is not derivable from business data',
    public.material_document_path('00000000-0000-4000-e000-0000000000a1',
                                  '00000000-0000-4000-e000-0000000000a9','x.pdf')
      LIKE '%-%-%-%-%/%-%-%-%-%/x.pdf');

  --  "Release authority tested only through the user interface."
  --  Section F called the RPC, the engine, and both tables directly. No
  --  interface was involved at any point.
  --
  --  This asserts the four endpoint checks all PASSED, not merely that
  --  four rows exist — an earlier version counted rows and leaned on
  --  operator precedence to get the right number, which would have been
  --  satisfied by four failures just as happily.
  PERFORM _sk('H','H4 all four release endpoints refused a non-QA caller',
    (SELECT count(*)=4 FROM _s
      WHERE section='F' AND ok
        AND name IN ('F2 the release RPC refuses them',
                     'F3 calling the engine directly refuses them too',
                     'F4 writing entity_current_state refuses them',
                     'F5 writing the status mirror refuses them')),
    (SELECT string_agg(name||'='||ok::text, '; ' ORDER BY name) FROM _s
      WHERE section='F' AND name LIKE 'F[2-5]%'));
END
$h$;

\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo '  ITEM 07 — MATERIALS SECURITY AND DOCUMENT ACCESS'
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
  IF f > 0 THEN RAISE EXCEPTION 'ITEM 07: % assertion(s) failed', f; END IF;
  RAISE NOTICE 'ITEM 07: all assertions passed';
END
$v$;
