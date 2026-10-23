-- PM-03's five missing sections, added to the request catalogue.
--
-- WHY THESE WERE MISSING AND WHY IT MATTERED.
--
-- 20261026000000 seeded fifteen sections. PM-03 · "Roles — what each
-- role can open" tabulates eleven, and five of those eleven were not
-- among the fifteen: suppliers, goods receipt, CoA register,
-- traceability and distribution.
--
-- The consequence was not cosmetic. access_permission_requests.section_key
-- is checked against this table, so a section absent from it cannot be
-- requested at all. A storekeeper looking at a locked CoA register on
-- DB-02 had no way to ask for it — not a refusal, which would at least
-- explain itself, but a section the request flow did not know existed.
--
-- Additive. Nothing is removed and nothing is renamed; the fifteen
-- already here keep their keys, labels and sort order. ON CONFLICT
-- updates the label and ordering so re-running this is a no-op on a
-- database that already has them.
--
-- SORT ORDER PUTS THEM IN PM-03's COLUMN ORDER rather than appending
-- them after the existing rows. The request dialog lists sections in
-- sort_order, and the design's order is the order of the process —
-- suppliers, goods receipt, material lots, QC, disposition — which is
-- the order somebody thinks about them in. Existing keys are renumbered
-- to interleave correctly; their keys, which are what rows reference,
-- are untouched.
--
-- NOT REQUESTABLE: none of the five. Batch release remains the only
-- section that cannot be asked for, because it is a step permission
-- held by the designated QA release role. See 20261026000000.

INSERT INTO public.access_sections (key, label, unrequestable_reason, sort_order) VALUES
  ('suppliers',      'Suppliers',      NULL, 10),
  ('goods_receipt',  'Goods receipt',  NULL, 20),
  ('coa_register',   'CoA register',   NULL, 95),
  ('traceability',   'Traceability',   NULL, 145),
  ('distribution',   'Distribution',   NULL, 148)
ON CONFLICT (key) DO UPDATE
  SET label = EXCLUDED.label,
      unrequestable_reason = EXCLUDED.unrequestable_reason,
      sort_order = EXCLUDED.sort_order;

-- Re-space the original fifteen so the eleven PM-03 columns read in the
-- design's order and the four this product adds sit after them.
UPDATE public.access_sections SET sort_order = 30  WHERE key = 'material_lots';
UPDATE public.access_sections SET sort_order = 40  WHERE key = 'qc_testing';
UPDATE public.access_sections SET sort_order = 50  WHERE key = 'qa_disposition';
UPDATE public.access_sections SET sort_order = 60  WHERE key = 'batch_records';
UPDATE public.access_sections SET sort_order = 70  WHERE key = 'batch_release';
UPDATE public.access_sections SET sort_order = 80  WHERE key = 'deviation_capa';
UPDATE public.access_sections SET sort_order = 150 WHERE key = 'audit_trail';
