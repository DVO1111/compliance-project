-- =====================================================================
--  WEEK 3 / ITEM 07 — MATERIALS SECURITY AND DOCUMENT ACCESS
-- =====================================================================
--  Waits on item 03. Mostly verification of what items 03-06 built, plus
--  two things that did not exist: a private home for certificate
--  documents, and validation on the path that puts them there.
--
--  WHAT WAS ALREADY TRUE
--  ---------------------
--  RLS is enabled on materials, material_lots and
--  material_certificates_of_analysis with all four commands policed, and
--  it is tested against a real signed-in admin of a second company —
--  material_master_test.sql sections F and H, plus the tenancy sections
--  of items 04, 05 and 06. Item 07's first two DONE MEANS are therefore
--  re-asserted here rather than newly built, in one place, so "is
--  materials tenancy covered" has a single answer.
--
--  THE BUCKET IS PRIVATE, AND THAT IS A DEPARTURE
--  ----------------------------------------------
--  The two buckets this repository already creates — chat_attachments
--  (20260228700000) and avatars (20260228800000) — are both
--  `public: true`, which means every object in them is readable by URL
--  with no authentication at all. For an avatar that is a choice. For a
--  supplier's certificate of analysis it is the thing item 07 forbids:
--  "certificate URLs guessable or publicly reachable".
--
--  So material-documents is created with public = false, an explicit
--  MIME allow-list and a size limit, and storage policies that scope
--  every object to the owning company. A private bucket serves objects
--  only through a signed URL or an authenticated request, and the
--  policies below decide which authenticated requests succeed.
--
--  THE PATH IS THE SCOPE, SO THE PATH IS VALIDATED
--  -----------------------------------------------
--  storage.objects carries no company_id. The only thing a storage
--  policy can scope by is the object's name, so the convention is
--
--      material-documents/{company_id}/{material_lot_id}/{filename}
--
--  and the policy reads the first folder as the company.
--
--  That makes the path a security boundary, which means it cannot be
--  self-asserted. Without the trigger in section 3, company B could
--  insert a certificate row whose document_path claimed company A's
--  folder, upload there, and read it back — the storage policy would
--  agree, because the path says A. fn_material_coa_validate_document()
--  refuses any path whose first segment is not the row's own company.
--
--  WHERE pg_cron WAS ABSENT, STORAGE MAY BE TOO
--  --------------------------------------------
--  storage.buckets and storage.objects belong to the Supabase storage
--  service and do not exist in a plain Postgres. Sections 4 and 5 are
--  therefore guarded the same way item 04 guarded its cron registration:
--  the migration applies in both places, and the parts that need storage
--  are skipped with a notice where it is missing. Everything that
--  actually validates a document lives in section 3, in the database, so
--  it holds either way.
-- =====================================================================


-- ── 1. What a certificate document may be ────────────────────────────
--  One place, read by the table constraint, the trigger and the bucket
--  definition, so the three cannot drift apart.
CREATE OR REPLACE FUNCTION public.material_document_allowed_types()
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = pg_temp
AS $$
  --  A certificate of analysis arrives as a PDF or a scan. Nothing here
  --  is executable, renderable as HTML, or an archive: an allow-list is
  --  used rather than a deny-list because the next upload format nobody
  --  thought of should be refused, not accepted.
  SELECT ARRAY['application/pdf','image/png','image/jpeg','image/tiff']::text[];
$$;

CREATE OR REPLACE FUNCTION public.material_document_max_bytes()
RETURNS bigint LANGUAGE sql IMMUTABLE SET search_path = pg_temp
AS $$ SELECT 26214400::bigint; $$;   -- 25 MiB

COMMENT ON FUNCTION public.material_document_allowed_types() IS
  'MIME allow-list for material documents. Read by the validation trigger and by the bucket definition so the two cannot disagree.';


-- ── 2. The path convention ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.material_document_path(
  p_company_id uuid,
  p_lot_id     uuid,
  p_filename   text
) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_temp
AS $$
  --  Built by a function rather than by each caller, so every object
  --  lands where the storage policy expects to find it.
  SELECT p_company_id::text || '/' || p_lot_id::text || '/' ||
         regexp_replace(btrim(p_filename), '[^A-Za-z0-9._-]', '_', 'g');
$$;

COMMENT ON FUNCTION public.material_document_path(uuid,uuid,text) IS
  'The storage key for a material document: {company_id}/{material_lot_id}/{filename}. The first segment is what the storage policies scope by.';

GRANT EXECUTE ON FUNCTION public.material_document_path(uuid,uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.material_document_allowed_types() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.material_document_max_bytes() TO authenticated, service_role;


-- ── 3. Validation, in the database ───────────────────────────────────
--  This is the part that holds regardless of where the bytes live.
CREATE OR REPLACE FUNCTION public.fn_material_coa_validate_document()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp
AS $$
DECLARE v_first text; v_lot uuid;
BEGIN
  IF NEW.document_path IS NULL OR btrim(NEW.document_path) = '' THEN
    --  No document attached. The structured results are the substance of
    --  a certificate — item 05 — so a row without a file is legitimate.
    --  But it must not then claim a type or a size for a file that is
    --  not there.
    IF NEW.document_mime_type IS NOT NULL OR NEW.document_size_bytes IS NOT NULL THEN
      RAISE EXCEPTION 'MATERIAL_DOC_NO_PATH: a document type or size was given with no document path'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;

  --  A declared document must declare what it is and how big it is.
  --  Without both, there is nothing to validate and the limits below
  --  would pass by being absent.
  IF NEW.document_mime_type IS NULL THEN
    RAISE EXCEPTION 'MATERIAL_DOC_NO_TYPE: a document must declare its MIME type'
      USING ERRCODE = 'P0001';
  END IF;
  IF NEW.document_size_bytes IS NULL THEN
    RAISE EXCEPTION 'MATERIAL_DOC_NO_SIZE: a document must declare its size'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT (NEW.document_mime_type = ANY (public.material_document_allowed_types())) THEN
    RAISE EXCEPTION 'MATERIAL_DOC_TYPE_REJECTED: % is not an accepted document type (accepted: %)',
      NEW.document_mime_type, array_to_string(public.material_document_allowed_types(), ', ')
      USING ERRCODE = 'P0001';
  END IF;

  IF NEW.document_size_bytes <= 0 THEN
    RAISE EXCEPTION 'MATERIAL_DOC_EMPTY: a document of zero bytes is not a document'
      USING ERRCODE = 'P0001';
  END IF;

  IF NEW.document_size_bytes > public.material_document_max_bytes() THEN
    RAISE EXCEPTION 'MATERIAL_DOC_TOO_LARGE: % bytes exceeds the % byte limit',
      NEW.document_size_bytes, public.material_document_max_bytes()
      USING ERRCODE = 'P0001';
  END IF;

  --  THE PATH IS A SECURITY BOUNDARY, SO IT IS NOT SELF-ASSERTED.
  --  The storage policy scopes by the first folder. If a row could name
  --  another company's folder, the policy would faithfully grant access
  --  to it.
  v_first := split_part(NEW.document_path, '/', 1);
  IF v_first IS NULL OR v_first = '' OR v_first <> NEW.company_id::text THEN
    RAISE EXCEPTION 'MATERIAL_DOC_PATH_SCOPE: a document path must begin with the owning company id (%), not %',
      NEW.company_id, coalesce(nullif(v_first,''), '(nothing)')
      USING ERRCODE = 'P0001';
  END IF;

  --  And the second folder must be the lot the row is about, so one
  --  lot's certificate cannot point at another's file.
  BEGIN
    v_lot := split_part(NEW.document_path, '/', 2)::uuid;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'MATERIAL_DOC_PATH_SHAPE: a document path must be {company_id}/{material_lot_id}/{filename}'
      USING ERRCODE = 'P0001';
  END;
  IF v_lot IS DISTINCT FROM NEW.material_lot_id THEN
    RAISE EXCEPTION 'MATERIAL_DOC_PATH_LOT: a document path must name its own lot (%), not %',
      NEW.material_lot_id, v_lot
      USING ERRCODE = 'P0001';
  END IF;

  --  No traversal, and no absolute paths. storage.foldername would read
  --  '..' as a literal folder, but a client that built a key by string
  --  concatenation elsewhere might not.
  IF NEW.document_path LIKE '%..%' OR NEW.document_path LIKE '/%' THEN
    RAISE EXCEPTION 'MATERIAL_DOC_PATH_SHAPE: a document path may not contain ".." or begin with "/"'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_material_coa_validate_document ON public.material_certificates_of_analysis;
CREATE TRIGGER trg_material_coa_validate_document
  BEFORE INSERT OR UPDATE ON public.material_certificates_of_analysis
  FOR EACH ROW EXECUTE FUNCTION public.fn_material_coa_validate_document();

COMMENT ON COLUMN public.material_certificates_of_analysis.document_path IS
  'Storage key, {company_id}/{material_lot_id}/{filename}. Validated by fn_material_coa_validate_document(): the first segment must be this row''s company, because the storage policies scope by it.';


-- ── 4. The bucket and its policies ───────────────────────────────────
--  Wrapped in a function rather than inlined, for two reasons. It makes
--  provisioning re-runnable, so a project where storage arrives after
--  this migration can be brought up to date without editing history. And
--  it is how the test suite provisions the bucket after scaffolding a
--  stand-in storage schema — otherwise the policies could only ever be
--  asserted to exist rather than exercised.
CREATE OR REPLACE FUNCTION public.material_documents_provision_storage()
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $prov$
BEGIN
  IF to_regclass('storage.buckets') IS NULL THEN
    RETURN 'storage.buckets absent; nothing provisioned. The validation in section 3 applies regardless.';
  END IF;

  --  public = false is the whole point. The two buckets this repository
  --  already has are public, and a certificate of analysis must not be.
  --  allowed_mime_types and file_size_limit are the storage service's own
  --  enforcement, so an upload is refused before the bytes land rather
  --  than after a row is written.
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='storage' AND table_name='buckets'
                AND column_name='allowed_mime_types') THEN
    EXECUTE format($q$
      INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      VALUES ('material-documents','material-documents', false, %s, %L)
      ON CONFLICT (id) DO UPDATE
        SET public = false,
            file_size_limit = excluded.file_size_limit,
            allowed_mime_types = excluded.allowed_mime_types
    $q$, public.material_document_max_bytes(), public.material_document_allowed_types());
  ELSE
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('material-documents','material-documents', false)
    ON CONFLICT (id) DO UPDATE SET public = false;
  END IF;

  IF to_regclass('storage.objects') IS NULL THEN
    RETURN 'bucket provisioned; storage.objects absent, so policies were not created.';
  END IF;

  --  Policies, scoped by the first folder of the object name — which
  --  section 3 guarantees is the owning company.
  EXECUTE 'DROP POLICY IF EXISTS material_documents_select ON storage.objects';
  EXECUTE $p$
    CREATE POLICY material_documents_select ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'material-documents'
           AND public.app_is_company_member((split_part(name,'/',1))::uuid))
  $p$;

  EXECUTE 'DROP POLICY IF EXISTS material_documents_insert ON storage.objects';
  EXECUTE $p$
    CREATE POLICY material_documents_insert ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'material-documents'
                AND public.app_is_company_member((split_part(name,'/',1))::uuid))
  $p$;

  --  Update and delete are deliberately NOT granted to clients. A
  --  certificate document is evidence: replacing the file behind a
  --  verified certificate would leave the verification pointing at
  --  something nobody checked. A correction is a new certificate.
  EXECUTE 'DROP POLICY IF EXISTS material_documents_update ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS material_documents_delete ON storage.objects';

  RETURN 'material-documents provisioned: private bucket, MIME allow-list, size limit, company-scoped select and insert policies.';
END
$prov$;

COMMENT ON FUNCTION public.material_documents_provision_storage() IS
  'Creates or updates the private material-documents bucket and its company-scoped policies. Idempotent and re-runnable, so a project whose storage schema arrives after this migration can be brought up to date by calling it.';

REVOKE ALL ON FUNCTION public.material_documents_provision_storage() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.material_documents_provision_storage() TO service_role;

DO $prov_now$
DECLARE v_msg text;
BEGIN
  v_msg := public.material_documents_provision_storage();
  RAISE NOTICE '%', v_msg;
END
$prov_now$;


-- ── 6. The release endpoint, restated as an ACL fact ─────────────────
--  Item 07 asks for verification that release cannot be invoked by a
--  user lacking QA authority, "tested at the endpoint rather than the
--  interface". The enforcement is item 06's; what this section adds is
--  the surface area being small enough to enumerate.
--
--  There are exactly four ways to try to approve a lot, and the test
--  suite exercises all four as a real non-QA user:
--
--    material_lot_release()            the RPC
--    lifecycle_transition()            the engine directly
--    UPDATE entity_current_state       the engine's table
--    UPDATE material_lots.status       the mirror
--
--  The first two are refused by fn_material_lots_release_gate(); the
--  third by the same trigger, since it fires on the table itself; the
--  fourth by fn_material_lots_guard_status() from item 03. Nothing else
--  writes that state.
REVOKE ALL ON FUNCTION public.material_lot_release(uuid,uuid,text,text,uuid,text) FROM anon;
REVOKE ALL ON FUNCTION public.material_lot_reject(uuid,text,text,text,uuid) FROM anon;
REVOKE ALL ON FUNCTION public.material_test_record_result(uuid,uuid,numeric,text,uuid,date,text,text) FROM anon;
REVOKE ALL ON FUNCTION public.material_lot_assert_dispensable(uuid,numeric) FROM anon;
REVOKE ALL ON FUNCTION public.material_lot_block_reason(uuid,numeric) FROM anon;
REVOKE ALL ON FUNCTION public.material_lot_release_block_reason(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.material_coa_verify(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.material_lot_retest_sweep(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.numbering_next(uuid,text,jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.material_is_qa_authority(uuid,uuid) FROM anon;
REVOKE ALL ON FUNCTION public.material_alert_lead_days(uuid) FROM anon;


-- ── 7. A standing check on materials tenancy ─────────────────────────
--  Every materials table, with whether it has RLS and how many of the
--  four commands are policed. A view rather than a one-off query,
--  because "all of them" is a claim that should be re-checkable after
--  every migration rather than asserted once.
CREATE OR REPLACE VIEW public.materials_security_posture
  WITH (security_invoker = true) AS
  WITH t(table_name) AS (VALUES
    ('materials'),('material_lots'),('material_certificates_of_analysis'),
    ('suppliers'),('company_numbering_formats'),('material_alert_policies'),
    ('material_lot_alerts'),('material_specifications'),
    ('material_specification_parameters'),('material_coa_discrepancies'),
    ('material_notification_recipients'),('material_qa_authorities'),
    ('material_test_definitions'),('material_test_results'),
    ('material_lot_release_records'),('material_lot_rejections'))
  SELECT t.table_name,
         c.relrowsecurity                                   AS rls_enabled,
         (SELECT count(DISTINCT p.cmd) FROM pg_policies p
           WHERE p.schemaname='public' AND p.tablename=t.table_name) AS commands_policed,
         has_table_privilege('anon','public.'||t.table_name,'SELECT') AS anon_can_select,
         EXISTS (SELECT 1 FROM information_schema.columns ic
                  WHERE ic.table_schema='public' AND ic.table_name=t.table_name
                    AND ic.column_name='company_id')        AS has_company_id
    FROM t JOIN pg_class c ON c.oid = ('public.'||t.table_name)::regclass;

COMMENT ON VIEW public.materials_security_posture IS
  'One row per materials table: RLS on, how many commands are policed, whether anon can read it, whether it carries company_id. Re-checkable after any migration rather than asserted once.';

REVOKE ALL ON public.materials_security_posture FROM PUBLIC, anon;
GRANT SELECT ON public.materials_security_posture TO authenticated, service_role;
