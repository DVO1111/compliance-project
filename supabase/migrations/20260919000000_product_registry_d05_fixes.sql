-- =====================================================================
--  PRODUCT REGISTRY — D05 ACCEPTANCE FIXES
-- =====================================================================
--  Four findings from the deliverable-05 audit, two of them critical.
--
--  1. CONTROLLED SUBSTANCES WERE BLOCKED ON FOOD.  20260918000000 wrote a
--     CHECK permitting the flag only on drug_pharmaceutical, veterinary
--     and biologic_vaccine, on the reasoning that a controlled cosmetic is
--     a data-entry error. That reasoning was wrong for food: NAFDAC's
--     Food and Drug remit covers controlled substances in ingestible
--     products, and the acceptance criteria name a drugs-only prompt as a
--     critical failure. Food and herbal/nutraceutical are added.
--
--     Cosmetic, medical_device and agro_chemical stay excluded — the
--     requirement is that the prompt be relevant, not universal, and a
--     checkbox on every product is the thing it exists to avoid.
--
--  2. EXISTING REGISTRATIONS WERE ORPHANED.  product_id was added as
--     nullable and every pre-existing row left NULL. That is what the
--     criteria call an orphaned registration. This migration backfills
--     them from the free-text product_name columns the four tables have
--     been carrying, and reports what it could not resolve.
--
--  3. The first lifecycle state was `development`; the criteria name the
--     journey as starting at Concept.
--
--  4. CTD administrative documents existed only as a TypeScript config.
--     They are now a queryable group in their own right.
--
--  SAFE ON AN EXISTING DATABASE
--  ----------------------------
--  The backfill creates no product for a blank name, never merges two
--  differently-named records, and is idempotent — a second run links
--  nothing new. Products it creates are placed in a lifecycle state
--  derived from the evidence attached to them, NOT dropped into concept
--  wholesale: a batch of a product with a live registration must not
--  become unreleasable because this migration ran. See section 3.
-- =====================================================================


-- ── 1. Controlled substances: food is in scope ───────────────────────
ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_controlled_substance_category_check;
ALTER TABLE public.products
  ADD CONSTRAINT products_controlled_substance_category_check CHECK (
    NOT is_controlled_substance
    OR category = ANY (ARRAY[
      'food','drug_pharmaceutical','veterinary','biologic_vaccine','herbal_nutraceutical']));

COMMENT ON COLUMN public.products.is_controlled_substance IS
  'Whether the product contains or involves a controlled substance. Constrained to the ingestible/medicinal categories NAFDAC regulates for this — food, drug, veterinary, biologic and herbal. Deliberately not offered on cosmetic, medical_device or agro_chemical.';


-- ── 2. `development` becomes `concept` ───────────────────────────────
--  The state key is the value mirrored into products.status, so the
--  mirror has to be moved with it. The sync flag is raised because the
--  guard trigger otherwise refuses a status write.
DO $rename$
DECLARE v_def uuid;
BEGIN
  SELECT id INTO v_def FROM public.lifecycle_definitions
   WHERE entity_type = 'product' AND company_id IS NULL;
  IF v_def IS NULL THEN RETURN; END IF;

  IF EXISTS (SELECT 1 FROM public.lifecycle_states
              WHERE definition_id = v_def AND state_key = 'development') THEN

    UPDATE public.lifecycle_states
       SET state_key = 'concept', label = 'Concept / Development'
     WHERE definition_id = v_def AND state_key = 'development';

    PERFORM set_config('app.lifecycle_product_sync', '1', true);
    UPDATE public.products SET status = 'concept' WHERE status = 'development';
    PERFORM set_config('app.lifecycle_product_sync', '', true);
  END IF;
END
$rename$;


-- ── 3. Backfill: link the free-text product names to real products ───
--  Order matters. regulatory_submissions is processed first because it
--  is the only source carrying a product_category, so a product created
--  from it is categorised correctly rather than defaulting to 'other'.
--  Later sources then match the product this pass already created.
--  Written as a callable function, not an inline DO block: it must be
--  re-runnable after a data import, and a migration that runs once
--  cannot be tested. The migration calls it below.
CREATE OR REPLACE FUNCTION public.backfill_product_registry()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $backfill$
DECLARE
  r            record;
  v_product    uuid;
  v_code       text;
  v_base       text;
  v_n          int;
  v_created    int := 0;
  v_linked     int := 0;
  v_skipped    int := 0;
  v_def        uuid;
  v_state      uuid;
  v_state_key  text;
BEGIN
  SELECT id INTO v_def FROM public.lifecycle_definitions
   WHERE entity_type = 'product' AND company_id IS NULL;
  IF v_def IS NULL THEN
    RAISE WARNING 'no product lifecycle definition; backfill skipped';
    RETURN jsonb_build_object('products_created',0,'name_groups_linked',0,
                              'registrations_still_unlinked',0,
                              'skipped','no product lifecycle definition');
  END IF;

  FOR r IN
    -- one row per (company, name) across all four sources, with the best
    -- category and registration evidence any of them can offer
    SELECT company_id,
           btrim(product_name) AS name,
           max(category)       AS category,
           max(reg_number)     AS reg_number,
           max(expiry)         AS expiry,
           bool_or(is_approved) AS is_approved
      FROM (
        SELECT company_id, product_name, product_category AS category,
               registration_number AS reg_number, expiry_date AS expiry,
               current_status = 'approved' AS is_approved
          FROM public.regulatory_submissions WHERE product_id IS NULL
        UNION ALL
        SELECT company_id, product_name, NULL, registration_number, expiry_date,
               registration_number IS NOT NULL
          FROM public.regulatory_licences WHERE product_id IS NULL
        UNION ALL
        SELECT company_id, product_name, NULL, nafdac_number, NULL,
               status = 'approved'
          FROM public.ctd_dossiers WHERE product_id IS NULL
        UNION ALL
        SELECT company_id, product_name, NULL, NULL, NULL, false
          FROM public.batch_records WHERE product_id IS NULL
      ) src
     WHERE product_name IS NOT NULL AND btrim(product_name) <> ''
     GROUP BY company_id, btrim(product_name)
  LOOP
    -- an existing product with this trade name is reused, never duplicated
    SELECT id INTO v_product FROM public.products
     WHERE company_id = r.company_id
       AND lower(btrim(trade_name)) = lower(r.name)
     LIMIT 1;

    IF v_product IS NULL THEN
      -- deterministic, readable, and unique within the company
      v_base := upper(regexp_replace(left(r.name, 18), '[^A-Za-z0-9]+', '-', 'g'));
      v_base := trim(both '-' from v_base);
      IF v_base = '' THEN v_base := 'PRODUCT'; END IF;
      v_code := 'LEG-' || v_base;
      v_n := 1;
      WHILE EXISTS (SELECT 1 FROM public.products
                     WHERE company_id = r.company_id
                       AND lower(btrim(product_code)) = lower(v_code)) LOOP
        v_n := v_n + 1;
        v_code := 'LEG-' || v_base || '-' || v_n;
      END LOOP;

      INSERT INTO public.products
        (company_id, product_code, trade_name, category,
         nafdac_number, registration_expiry_date, metadata)
      VALUES (r.company_id, v_code, r.name,
              coalesce(r.category, 'other'),
              r.reg_number, r.expiry,
              jsonb_build_object('source','backfill_d05',
                                 'created_from','existing regulatory records'))
      RETURNING id INTO v_product;
      v_created := v_created + 1;

      --  Placement, and the reason it is not simply 'concept':
      --  the release gate refuses batches of a product that is not
      --  registered. Dropping a product with a live registration into
      --  concept would make its existing batches unreleasable — this
      --  migration would have broken a working line. So a product whose
      --  evidence shows a real registration is placed at `registered`.
      v_state_key := CASE
        WHEN r.is_approved OR r.reg_number IS NOT NULL THEN 'registered'
        ELSE 'concept' END;

      SELECT id INTO v_state FROM public.lifecycle_states
       WHERE definition_id = v_def AND state_key = v_state_key;

      -- written directly, as the D03 adoption migrations do for backfill
      UPDATE public.entity_current_state
         SET state_id = v_state, updated_at = now()
       WHERE entity_type = 'product' AND entity_id = v_product;

      INSERT INTO public.entity_state_history
        (company_id, definition_id, entity_type, entity_id,
         from_state_id, to_state_id, transition_id, actor_id, comment, metadata)
      SELECT r.company_id, v_def, 'product', v_product,
             NULL, v_state, NULL, NULL,
             'Backfilled from existing regulatory records',
             jsonb_build_object('reason','backfill_d05','placed_at',v_state_key)
       WHERE v_state IS NOT NULL;

      PERFORM set_config('app.lifecycle_product_sync', '1', true);
      UPDATE public.products SET status = v_state_key WHERE id = v_product;
      PERFORM set_config('app.lifecycle_product_sync', '', true);
    END IF;

    UPDATE public.regulatory_submissions SET product_id = v_product
     WHERE product_id IS NULL AND company_id = r.company_id
       AND btrim(product_name) = r.name;
    UPDATE public.regulatory_licences SET product_id = v_product
     WHERE product_id IS NULL AND company_id = r.company_id
       AND btrim(product_name) = r.name;
    UPDATE public.ctd_dossiers SET product_id = v_product
     WHERE product_id IS NULL AND company_id = r.company_id
       AND btrim(product_name) = r.name;
    UPDATE public.batch_records SET product_id = v_product
     WHERE product_id IS NULL AND company_id = r.company_id
       AND btrim(product_name) = r.name;

    v_linked := v_linked + 1;
  END LOOP;

  -- anything still unlinked has no usable name; it is reported, not guessed
  SELECT count(*) INTO v_skipped FROM (
    SELECT 1 FROM public.regulatory_submissions WHERE product_id IS NULL
    UNION ALL SELECT 1 FROM public.regulatory_licences WHERE product_id IS NULL
    UNION ALL SELECT 1 FROM public.ctd_dossiers      WHERE product_id IS NULL
  ) x;

  RAISE NOTICE 'D05 backfill: % product(s) created, % name group(s) linked, % registration row(s) left unlinked (blank product_name)',
    v_created, v_linked, v_skipped;

  RETURN jsonb_build_object(
    'products_created', v_created,
    'name_groups_linked', v_linked,
    'registrations_still_unlinked', v_skipped);
END
$backfill$;

COMMENT ON FUNCTION public.backfill_product_registry() IS
  'Links existing regulatory_submissions, regulatory_licences, ctd_dossiers and batch_records to products by their free-text product_name, creating a product where none matches. Idempotent; safe to re-run after a data import. Rows with a blank product_name are reported, never guessed at.';

REVOKE ALL ON FUNCTION public.backfill_product_registry() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.backfill_product_registry() TO service_role;

-- run it once, now, against whatever this database already holds
SELECT public.backfill_product_registry();


-- ── 4. CTD administrative documents as a group of their own ──────────
--  Module 1 is the administrative module. Making it queryable means the
--  separation is a property of the data, not only of a client constant.
ALTER TABLE public.product_documents
  ALTER COLUMN ctd_module SET DEFAULT NULL;

UPDATE public.product_documents
   SET ctd_module = '1_administrative'
 WHERE is_ctd_administrative AND ctd_module IS NULL;

CREATE OR REPLACE FUNCTION public.product_ctd_administrative_documents(p_product_id uuid)
RETURNS SETOF public.product_documents
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp
AS $$
  SELECT * FROM public.product_available_documents(p_product_id)
   WHERE is_ctd_administrative
   ORDER BY scope DESC, document_type, name;
$$;

COMMENT ON FUNCTION public.product_ctd_administrative_documents(uuid) IS
  'CTD Module 1 administrative documents for a product, company-level ones included. The separated administrative grouping required by deliverable 05.';

REVOKE ALL ON FUNCTION public.product_ctd_administrative_documents(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.product_ctd_administrative_documents(uuid) TO authenticated, service_role;

--  Backfilling ctd_module above fixes existing rows but says nothing
--  about new ones, which would drift straight back out of the group.
--  The marker is therefore maintained, not just seeded.
CREATE OR REPLACE FUNCTION public.fn_product_documents_ctd_module()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.is_ctd_administrative AND NEW.ctd_module IS NULL THEN
    NEW.ctd_module := '1_administrative';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_product_documents_ctd_module ON public.product_documents;
CREATE TRIGGER trg_product_documents_ctd_module
  BEFORE INSERT OR UPDATE ON public.product_documents
  FOR EACH ROW EXECUTE FUNCTION public.fn_product_documents_ctd_module();
