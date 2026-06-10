-- Seed ISO 22000:2018 as a GRC framework for demo purposes.
-- This framework is applicable to food safety management across
-- the entire food chain — used by FMCG and food processing companies.
-- Run this in your demo workspace's company context.

-- NOTE: Replace '00000000-0000-0000-0000-000000000000' with your actual demo company_id
-- before running. You can find it in the Supabase companies table.

DO $$
DECLARE
  v_framework_id uuid;
  v_company_id   uuid;
BEGIN
  -- Pick the first company in the database (the demo workspace)
  SELECT id INTO v_company_id FROM public.companies ORDER BY created_at LIMIT 1;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'No company found. Create a company first.';
  END IF;

  -- ── Framework ───────────────────────────────────────────────────────────────
  INSERT INTO public.grc_frameworks (id, company_id, name, description, version, status)
  VALUES (
    gen_random_uuid(),
    v_company_id,
    'ISO 22000:2018 — Food Safety Management',
    'International standard specifying requirements for a food safety management system (FSMS) for any organization in the food chain. Integrates HACCP principles with prerequisite programmes (PRPs) and management system requirements.',
    '2018',
    'active'
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_framework_id;

  IF v_framework_id IS NULL THEN
    SELECT id INTO v_framework_id FROM public.grc_frameworks
    WHERE company_id = v_company_id AND name ILIKE '%ISO 22000%' LIMIT 1;
  END IF;

  IF v_framework_id IS NULL THEN RETURN; END IF;

  -- ── Controls ─────────────────────────────────────────────────────────────────
  INSERT INTO public.grc_controls (company_id, framework_id, reference_code, title, description, domain_category, status)
  VALUES
    (v_company_id, v_framework_id, 'ISO22000-4.1', 'Understanding the Organisation and Its Context', 'Determine external and internal issues that are relevant to the purpose of the organisation and that affect its ability to achieve the intended results of the FSMS.', 'Context', 'active'),
    (v_company_id, v_framework_id, 'ISO22000-5.1', 'Leadership and Commitment', 'Top management shall demonstrate leadership and commitment with respect to the FSMS by ensuring the FSMS requirements are integrated into the organisation''s business processes.', 'Leadership', 'active'),
    (v_company_id, v_framework_id, 'ISO22000-6.1', 'Actions to Address Risks and Opportunities', 'When planning for the FSMS, the organisation shall consider the issues referred to in 4.1 and the requirements referred to in 4.2 and determine the risks and opportunities that need to be addressed.', 'Planning', 'active'),
    (v_company_id, v_framework_id, 'ISO22000-7.2', 'Competence', 'The organisation shall determine the necessary competence of person(s) doing work under its control that affects its food safety performance and food safety outcomes.', 'Support', 'active'),
    (v_company_id, v_framework_id, 'ISO22000-8.2', 'Prerequisite Programmes (PRPs)', 'The organisation shall establish, implement, maintain, and update PRPs. PRPs shall be appropriate to the organisation and its context with regard to food safety, and shall be implemented across the entire production system as programmes applied in general.', 'Operation', 'active'),
    (v_company_id, v_framework_id, 'ISO22000-8.5', 'Hazard Analysis', 'The organisation shall conduct a hazard analysis, based on the preliminary information, to determine hazards that need to be controlled, the required control level, and the combination of control measures required.', 'Operation', 'active'),
    (v_company_id, v_framework_id, 'ISO22000-8.5.4', 'HACCP Plan', 'The HACCP plan shall be established, implemented, maintained, and updated. The HACCP plan shall include for each CCP: the food safety hazard(s) controlled; critical limit(s); monitoring procedure(s); correction(s) and corrective action(s) to be taken; responsibilities; and records.', 'Operation', 'active'),
    (v_company_id, v_framework_id, 'ISO22000-8.8', 'Verification of PRP and HACCP Plan', 'The organisation shall establish, implement, and maintain verification activities to confirm that the PRPs are implemented and effective, and that hazard analysis inputs are continually updated.', 'Operation', 'active'),
    (v_company_id, v_framework_id, 'ISO22000-8.9', 'Control of Product and Process Nonconformities', 'The organisation shall ensure that when critical limits at CCPs are exceeded, or there is a loss of control of operational PRPs, products affected are identified and handled as potentially unsafe products.', 'Operation', 'active'),
    (v_company_id, v_framework_id, 'ISO22000-9.1', 'Monitoring, Measurement, Analysis and Evaluation', 'The organisation shall determine what needs to be monitored and measured, including food safety performance indicators; the methods for monitoring, measurement, analysis and evaluation; when monitoring and measurement shall be performed and analysed.', 'Performance', 'active'),
    (v_company_id, v_framework_id, 'ISO22000-9.2', 'Internal Audit', 'The organisation shall conduct internal audits at planned intervals to provide information on whether the FSMS conforms to the organisation''s own requirements and the requirements of this document; and is effectively implemented and maintained.', 'Performance', 'active'),
    (v_company_id, v_framework_id, 'ISO22000-10.1', 'Nonconformity and Corrective Action', 'When a nonconformity occurs, the organisation shall react to the nonconformity; evaluate the need for action to eliminate the causes of the nonconformity; implement any action needed; review the effectiveness of corrective action; update risks and opportunities; and make changes to the FSMS if necessary.', 'Improvement', 'active')
  ON CONFLICT DO NOTHING;

END $$;
