-- =====================================================================
--  PRODUCT REGISTRY  (Week 2, Task 05)
-- =====================================================================
--  WHAT WAS ALREADY THERE, AND WHAT WAS NOT
--  ----------------------------------------
--  There is no product entity. "Product" exists today only as free text,
--  repeated independently in four tables:
--
--    regulatory_submissions.product_name  + .product_category
--    regulatory_licences.product_name
--    ctd_dossiers.product_name            + .active_ingredient, .strength
--    batch_records.product_name           + .product_code   (text!)
--
--  Nothing joins them. Two rows saying "Paracetamol 500mg" in different
--  tables are unrelated strings, so a registration cannot be shown
--  against the batch it authorises, and a batch cannot be checked against
--  the registration that makes it legal to release.
--
--  This migration introduces the missing entity and points the four
--  existing tables at it. It does NOT retire their text columns: those
--  hold live data that cannot be mapped automatically, so product_id is
--  nullable everywhere and every existing row keeps working untouched.
--
--  WHAT IS DELIBERATELY REUSED RATHER THAN REBUILT
--  -----------------------------------------------
--   * The lifecycle engine (D01–D03). Products get a lifecycle
--     definition and the same status-mirror pattern as change_control,
--     capa_record and sop_document — init trigger, sync trigger, guard
--     trigger. No second workflow engine.
--   * audit_logs, through the existing auditService, for traceability.
--   * public.vendors for external manufacturers. It is the only existing
--     "external party" entity; its category CHECK is extended rather than
--     a parallel manufacturer table being created.
--   * The regulatory_submissions.product_category vocabulary, extended
--     with herbal_nutraceutical rather than replaced.
--
--  WHAT IS NEW BECAUSE NOTHING EQUIVALENT EXISTS
--  ---------------------------------------------
--   * products
--   * product_documents — there is NO unified document store in this
--     repository. Documents live in per-domain tables (ctd_documents,
--     vendor_documents, sop_versions, policy_versions, framework_evidence,
--     regulatory_licences.file_url), each owning its own. product_documents
--     follows that established pattern rather than inventing a global one,
--     and carries a scope so a company-level document is stored once and
--     is visible to every product.
-- =====================================================================


-- ── 1. Category vocabulary ───────────────────────────────────────────
--  herbal_nutraceutical added. The existing eight values are preserved
--  exactly; this only widens what is accepted, so no existing row can
--  become invalid.
ALTER TABLE public.regulatory_submissions
  DROP CONSTRAINT IF EXISTS regulatory_submissions_product_category_check;
ALTER TABLE public.regulatory_submissions
  ADD CONSTRAINT regulatory_submissions_product_category_check
  CHECK (product_category = ANY (ARRAY[
    'food','drug_pharmaceutical','cosmetic','medical_device','veterinary',
    'biologic_vaccine','agro_chemical','herbal_nutraceutical','other']));


-- ── 2. Vendors gain a manufacturer category ──────────────────────────
--  Reuse, not duplication: vendors is the repository's external-party
--  entity. Existing values are all preserved.
ALTER TABLE public.vendors DROP CONSTRAINT IF EXISTS vendors_category_check;
ALTER TABLE public.vendors
  ADD CONSTRAINT vendors_category_check
  CHECK (category = ANY (ARRAY[
    'cloud','payment','marketing','legal','logistics_carrier',
    'customs_broker','last_mile','contract_manufacturer']));


-- ── 3. The product entity ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.products (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,

  --  Scoped per company, not globally. Every other entity in this schema
  --  is company-scoped, and a code like "PRD-001" is a label a tenant
  --  chooses — making it globally unique would let one tenant's naming
  --  block another's, and would leak the existence of other tenants.
  product_code      text NOT NULL,
  trade_name        text NOT NULL,
  generic_name      text,
  description       text,

  category          text NOT NULL,

  --  status is a DERIVED read model, maintained from the lifecycle
  --  engine by the trigger below. It is never written directly.
  status            text NOT NULL DEFAULT 'development',

  --  Manufacturing arrangement. manufacturer_vendor_id points at the
  --  existing vendors table; manufacturer_name carries the arrangement
  --  where no vendor record exists (a foreign principal, say).
  manufacturing_type text NOT NULL DEFAULT 'in_house',
  manufacturer_vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  manufacturer_name text,
  manufacturing_site text,

  --  Controlled substances. Only meaningful for the categories that can
  --  actually contain one, which the CHECK below enforces — this is the
  --  opposite of a global checkbox on every product.
  is_controlled_substance boolean NOT NULL DEFAULT false,
  controlled_substance_schedule text,

  --  Denormalised regulatory facts, kept for list rendering. They are
  --  informational; the authoritative records are in regulatory_licences
  --  and regulatory_submissions.
  nafdac_number     text,
  registration_expiry_date date,

  dosage_form       text,
  strength          text,
  pack_size         text,
  shelf_life_months integer,

  metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by        uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT products_category_check CHECK (category = ANY (ARRAY[
    'food','drug_pharmaceutical','cosmetic','medical_device','veterinary',
    'biologic_vaccine','agro_chemical','herbal_nutraceutical','other'])),

  CONSTRAINT products_manufacturing_type_check CHECK (manufacturing_type = ANY (ARRAY[
    'in_house','contract_manufactured','imported'])),

  CONSTRAINT products_code_not_blank CHECK (length(btrim(product_code)) > 0),
  CONSTRAINT products_trade_name_not_blank CHECK (length(btrim(trade_name)) > 0),

  --  A controlled substance only makes sense for regulated medicinal
  --  categories. Flagging a cosmetic or an agro-chemical as controlled
  --  is a data-entry error, not a workflow.
  CONSTRAINT products_controlled_substance_category_check CHECK (
    NOT is_controlled_substance
    OR category = ANY (ARRAY['drug_pharmaceutical','veterinary','biologic_vaccine'])),

  --  A schedule without the flag is meaningless, and the flag without a
  --  schedule is incomplete for a NAFDAC controlled-substance filing.
  CONSTRAINT products_controlled_schedule_check CHECK (
    (is_controlled_substance AND length(btrim(coalesce(controlled_substance_schedule,''))) > 0)
    OR (NOT is_controlled_substance AND controlled_substance_schedule IS NULL)),

  --  A contract-manufactured product must say who makes it.
  CONSTRAINT products_contract_manufacturer_check CHECK (
    manufacturing_type <> 'contract_manufactured'
    OR manufacturer_vendor_id IS NOT NULL
    OR length(btrim(coalesce(manufacturer_name,''))) > 0)
);

--  The uniqueness decision, made explicit. Case-insensitive because
--  "prd-001" and "PRD-001" are the same code to a person.
CREATE UNIQUE INDEX IF NOT EXISTS products_company_code_key
  ON public.products (company_id, lower(btrim(product_code)));

CREATE INDEX IF NOT EXISTS idx_products_company_status ON public.products(company_id, status);
CREATE INDEX IF NOT EXISTS idx_products_company_category ON public.products(company_id, category);

CREATE OR REPLACE FUNCTION public.fn_products_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_products_updated_at ON public.products;
CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.fn_products_updated_at();


-- ── 4. RLS ───────────────────────────────────────────────────────────
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company members can view products" ON public.products;
CREATE POLICY "Company members can view products"
  ON public.products FOR SELECT TO authenticated
  USING (public.app_is_company_member(company_id));

DROP POLICY IF EXISTS "Company members can create products" ON public.products;
CREATE POLICY "Company members can create products"
  ON public.products FOR INSERT TO authenticated
  WITH CHECK (public.app_is_company_member(company_id));

DROP POLICY IF EXISTS "Company members can update products" ON public.products;
CREATE POLICY "Company members can update products"
  ON public.products FOR UPDATE TO authenticated
  USING (public.app_is_company_member(company_id))
  WITH CHECK (public.app_is_company_member(company_id));

-- TRUNCATE is not subject to RLS, so it is revoked rather than policed.
DO $priv$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE TRUNCATE ON public.products FROM %I', r);
    END IF;
  END LOOP;
END
$priv$;


-- ── 5. The product lifecycle ─────────────────────────────────────────
--  Seeded into the existing engine, not a new one. State keys follow the
--  conventions already used by change_control/capa/sop: lowercase snake
--  case naming the state, not the action.
DO $seed$
DECLARE
  v_def uuid;
  s_dev uuid; s_prep uuid; s_sub uuid; s_reg uuid;
  s_active uuid; s_susp uuid; s_disc uuid;
BEGIN
  SELECT id INTO v_def FROM public.lifecycle_definitions
   WHERE entity_type = 'product' AND company_id IS NULL;
  IF v_def IS NOT NULL THEN RETURN; END IF;   -- idempotent

  INSERT INTO public.lifecycle_definitions(company_id, entity_type, name, version, is_active)
  VALUES (NULL, 'product', 'Product Registry Lifecycle', 1, true)
  RETURNING id INTO v_def;

  INSERT INTO public.lifecycle_states(definition_id,state_key,label,sort_order,is_initial,is_terminal)
  VALUES (v_def,'development','In Development',0,true,false) RETURNING id INTO s_dev;
  INSERT INTO public.lifecycle_states(definition_id,state_key,label,sort_order,is_initial,is_terminal)
  VALUES (v_def,'regulatory_preparation','Regulatory Preparation',1,false,false) RETURNING id INTO s_prep;
  INSERT INTO public.lifecycle_states(definition_id,state_key,label,sort_order,is_initial,is_terminal)
  VALUES (v_def,'submitted','Submitted to Regulator',2,false,false) RETURNING id INTO s_sub;
  INSERT INTO public.lifecycle_states(definition_id,state_key,label,sort_order,is_initial,is_terminal)
  VALUES (v_def,'registered','Registered',3,false,false) RETURNING id INTO s_reg;
  INSERT INTO public.lifecycle_states(definition_id,state_key,label,sort_order,is_initial,is_terminal)
  VALUES (v_def,'active','Active / Commercial',4,false,false) RETURNING id INTO s_active;
  INSERT INTO public.lifecycle_states(definition_id,state_key,label,sort_order,is_initial,is_terminal)
  VALUES (v_def,'suspended','Suspended',5,false,false) RETURNING id INTO s_susp;
  --  terminal: a discontinued product is the end of the line. Re-launch
  --  is a new product with its own code and its own regulatory history.
  INSERT INTO public.lifecycle_states(definition_id,state_key,label,sort_order,is_initial,is_terminal)
  VALUES (v_def,'discontinued','Discontinued',6,false,true) RETURNING id INTO s_disc;

  INSERT INTO public.lifecycle_transitions
    (definition_id,from_state_id,to_state_id,action_key,label,sort_order,
     required_role,required_permission,requires_comment,requires_signature)
  VALUES
    (v_def,s_dev   ,s_prep  ,'start_regulatory_prep','Start Regulatory Preparation',0,NULL,NULL,false,false),
    (v_def,s_prep  ,s_sub   ,'submit_to_regulator'  ,'Submit to Regulator'         ,1,NULL,NULL,false,false),
    (v_def,s_prep  ,s_dev   ,'return_to_development','Return to Development'       ,2,NULL,NULL,true ,false),
    (v_def,s_sub   ,s_reg   ,'record_registration'  ,'Record Registration'         ,3,'admin,compliance_officer',NULL,true,false),
    (v_def,s_sub   ,s_prep  ,'submission_returned'  ,'Returned by Regulator'       ,4,NULL,NULL,true ,false),
    (v_def,s_reg   ,s_active,'activate'             ,'Activate for Commercial Use'  ,5,'admin,compliance_officer',NULL,false,false),
    (v_def,s_active,s_susp  ,'suspend'              ,'Suspend'                     ,6,'admin,compliance_officer',NULL,true ,false),
    (v_def,s_reg   ,s_susp  ,'suspend_registered'   ,'Suspend'                     ,7,'admin,compliance_officer',NULL,true ,false),
    (v_def,s_susp  ,s_active,'reinstate'            ,'Reinstate'                   ,8,'admin,compliance_officer',NULL,true ,false),
    (v_def,s_active,s_disc  ,'discontinue'          ,'Discontinue'                 ,9,'admin,compliance_officer',NULL,true ,false),
    (v_def,s_susp  ,s_disc  ,'discontinue_suspended','Discontinue'                 ,10,'admin,compliance_officer',NULL,true,false),
    (v_def,s_dev   ,s_disc  ,'abandon'              ,'Abandon Development'         ,11,'admin,compliance_officer',NULL,true,false);
END
$seed$;


-- ── 6. Products join the engine: init, sync, guard ───────────────────
CREATE OR REPLACE FUNCTION public.fn_products_initialize_lifecycle()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.lifecycle_initialize('product', NEW.id, NEW.company_id, NEW.created_by, NULL);
  RETURN NULL;
EXCEPTION WHEN others THEN
  IF SQLERRM LIKE 'LIFECYCLE_ALREADY_INITIALIZED%' THEN RETURN NULL; END IF;
  RAISE;
END
$$;

DROP TRIGGER IF EXISTS trg_products_initialize_lifecycle ON public.products;
CREATE TRIGGER trg_products_initialize_lifecycle
  AFTER INSERT ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.fn_products_initialize_lifecycle();

CREATE OR REPLACE FUNCTION public.fn_products_sync_status()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_key text;
BEGIN
  IF NEW.entity_type <> 'product' THEN RETURN NULL; END IF;

  SELECT state_key INTO v_key FROM public.lifecycle_states WHERE id = NEW.state_id;
  IF v_key IS NULL THEN RETURN NULL; END IF;

  PERFORM set_config('app.lifecycle_product_sync', '1', true);
  UPDATE public.products SET status = v_key
   WHERE id = NEW.entity_id AND status IS DISTINCT FROM v_key;
  PERFORM set_config('app.lifecycle_product_sync', '', true);

  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS trg_products_sync_status ON public.entity_current_state;
CREATE TRIGGER trg_products_sync_status
  AFTER INSERT OR UPDATE ON public.entity_current_state
  FOR EACH ROW EXECUTE FUNCTION public.fn_products_sync_status();

CREATE OR REPLACE FUNCTION public.fn_products_guard_status()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND coalesce(current_setting('app.lifecycle_product_sync', true), '') <> '1' THEN
    RAISE EXCEPTION 'PRODUCT_STATUS_READ_ONLY: status is derived from the lifecycle engine; use lifecycle_transition() instead of writing it'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_products_guard_status ON public.products;
CREATE TRIGGER trg_products_guard_status
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.fn_products_guard_status();

COMMENT ON COLUMN public.products.status IS
  'DERIVED read model. Maintained by fn_products_sync_status() from entity_current_state; direct writes are rejected. Change state with lifecycle_transition().';


-- ── 7. The four existing tables gain a product reference ─────────────
--  Nullable throughout. Existing rows carry free-text product names that
--  cannot be mapped to a product automatically without guessing, so they
--  are left exactly as they are and the column stays NULL until someone
--  links them deliberately.
ALTER TABLE public.regulatory_submissions
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE SET NULL;
ALTER TABLE public.regulatory_licences
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE SET NULL;
ALTER TABLE public.ctd_dossiers
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE SET NULL;
ALTER TABLE public.batch_records
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_reg_submissions_product ON public.regulatory_submissions(product_id);
CREATE INDEX IF NOT EXISTS idx_reg_licences_product    ON public.regulatory_licences(product_id);
CREATE INDEX IF NOT EXISTS idx_ctd_dossiers_product    ON public.ctd_dossiers(product_id);
CREATE INDEX IF NOT EXISTS idx_batch_records_product   ON public.batch_records(product_id);

COMMENT ON COLUMN public.batch_records.product_id IS
  'Optional link to the product registry. ON DELETE RESTRICT: a product with manufacturing history must not be deletable, because the batch is the regulatory record.';


-- ── 8. Product-scoped and company-scoped documents ───────────────────
--  scope='company' rows have product_id NULL and are visible to every
--  product in the company — that is what stops a CAC certificate being
--  re-uploaded once per product. scope='product' rows belong to one.
CREATE TABLE IF NOT EXISTS public.product_documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  scope         text NOT NULL,
  product_id    uuid REFERENCES public.products(id) ON DELETE CASCADE,
  document_type text NOT NULL,
  name          text NOT NULL,
  description   text,
  file_name     text,
  file_url      text,
  issue_date    date,
  expiry_date   date,
  is_ctd_administrative boolean NOT NULL DEFAULT false,
  ctd_module    text,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  uploaded_by   uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT product_documents_scope_check CHECK (scope = ANY (ARRAY['company','product'])),
  --  the invariant that makes reuse work: a company document belongs to
  --  no product, a product document must name one
  CONSTRAINT product_documents_scope_product_check CHECK (
    (scope = 'company' AND product_id IS NULL)
    OR (scope = 'product' AND product_id IS NOT NULL)),
  CONSTRAINT product_documents_name_not_blank CHECK (length(btrim(name)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_product_documents_company ON public.product_documents(company_id, scope);
CREATE INDEX IF NOT EXISTS idx_product_documents_product ON public.product_documents(product_id);

DROP TRIGGER IF EXISTS trg_product_documents_updated_at ON public.product_documents;
CREATE TRIGGER trg_product_documents_updated_at
  BEFORE UPDATE ON public.product_documents
  FOR EACH ROW EXECUTE FUNCTION public.fn_products_updated_at();

ALTER TABLE public.product_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company members can view product documents" ON public.product_documents;
CREATE POLICY "Company members can view product documents"
  ON public.product_documents FOR SELECT TO authenticated
  USING (public.app_is_company_member(company_id));

DROP POLICY IF EXISTS "Company members can manage product documents" ON public.product_documents;
CREATE POLICY "Company members can manage product documents"
  ON public.product_documents FOR INSERT TO authenticated
  WITH CHECK (public.app_is_company_member(company_id));

DROP POLICY IF EXISTS "Company members can update product documents" ON public.product_documents;
CREATE POLICY "Company members can update product documents"
  ON public.product_documents FOR UPDATE TO authenticated
  USING (public.app_is_company_member(company_id))
  WITH CHECK (public.app_is_company_member(company_id));

DO $priv2$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE TRUNCATE ON public.product_documents FROM %I', r);
    END IF;
  END LOOP;
END
$priv2$;

--  Everything a given product can show: its own documents plus every
--  company-level document. This is the query the detail view uses, and
--  it is the reason a company certificate is uploaded once.
CREATE OR REPLACE FUNCTION public.product_available_documents(p_product_id uuid)
RETURNS SETOF public.product_documents
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT d.*
    FROM public.product_documents d
   WHERE d.product_id = p_product_id
      OR (d.scope = 'company'
          AND d.company_id = (SELECT p.company_id FROM public.products p WHERE p.id = p_product_id))
   ORDER BY d.scope DESC, d.document_type, d.name;
$$;

REVOKE ALL ON FUNCTION public.product_available_documents(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.product_available_documents(uuid) TO authenticated, service_role;


-- ── 9. Eligibility, and the gate that uses it ────────────────────────
--  A product is eligible for regulated operations when the engine says
--  it is registered or active, and its registration has not expired.
--  Suspended, discontinued, still in development, or lapsed — all
--  ineligible.
CREATE OR REPLACE FUNCTION public.product_is_release_eligible(p_product_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.products p
     WHERE p.id = p_product_id
       AND p.status IN ('registered','active')
       AND (p.registration_expiry_date IS NULL
            OR p.registration_expiry_date >= current_date)
  );
$$;

COMMENT ON FUNCTION public.product_is_release_eligible(uuid) IS
  'True when a product may progress into regulated operations: lifecycle state registered or active, and registration not expired. Suspended, discontinued and in-development products are ineligible.';

REVOKE ALL ON FUNCTION public.product_is_release_eligible(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.product_is_release_eligible(uuid) TO authenticated, service_role;

--  The gate itself sits in the database, not the UI, so it holds for
--  every writer including PostgREST and any future automation. It fires
--  only for batches that name a product, so existing unlinked batches
--  behave exactly as before.
CREATE OR REPLACE FUNCTION public.fn_batch_records_product_gate()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_status text; v_expiry date; v_code text;
BEGIN
  IF NEW.status <> 'released' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'released' THEN RETURN NEW; END IF;
  IF NEW.product_id IS NULL THEN RETURN NEW; END IF;

  SELECT status, registration_expiry_date, product_code
    INTO v_status, v_expiry, v_code
    FROM public.products WHERE id = NEW.product_id;

  IF NOT public.product_is_release_eligible(NEW.product_id) THEN
    RAISE EXCEPTION
      'BATCH_PRODUCT_NOT_ELIGIBLE: product % is "%"%; a batch cannot be released against it',
      coalesce(v_code,'?'), coalesce(v_status,'unknown'),
      CASE WHEN v_expiry IS NOT NULL AND v_expiry < current_date
           THEN ' with registration expired on '||v_expiry::text ELSE '' END
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_batch_records_product_gate ON public.batch_records;
CREATE TRIGGER trg_batch_records_product_gate
  BEFORE INSERT OR UPDATE ON public.batch_records
  FOR EACH ROW EXECUTE FUNCTION public.fn_batch_records_product_gate();
