-- Demo data for NASCO Group workspace.
-- Seeds realistic batch records, change controls, and SOPs representative
-- of a Nigerian FMCG manufacturer (biscuits, beverages, noodles).
-- Run ONLY in the demo workspace after running migrations 20260603100000, 200000, 300000.
--
-- Replace the company_id with your actual demo company ID before running.

DO $$
DECLARE
  v_company_id uuid := '863e9f8b-2a8e-4927-9fc3-42c00b7a895d';
BEGIN

  -- ── Batch Records ──────────────────────────────────────────────────────────

  INSERT INTO public.batch_records (
    company_id, batch_number, product_name, product_code,
    manufacturing_date, expiry_date, batch_size, unit, status, release_notes, released_at
  ) VALUES
    (v_company_id, 'BT-2024-0041', 'NASCO Cornflakes 500g', 'NCF-500', '2024-10-01', '2025-10-01', 2500, 'kg', 'released', 'All QC parameters within spec. Released by QA Head.', now() - interval '45 days'),
    (v_company_id, 'BT-2024-0042', 'NASCO Biscuits Original 200g', 'NBS-200', '2024-10-08', '2025-04-08', 1800, 'kg', 'released', 'Moisture content 3.2% (spec ≤4%). Passed all micro tests.', now() - interval '38 days'),
    (v_company_id, 'BT-2024-0043', 'NASCO Noodles Chicken 70g (Case 120)', 'NND-070C', '2024-10-15', '2025-04-15', 3200, 'kg', 'released', 'Batch fully released. Yield 98.7%.', now() - interval '30 days'),
    (v_company_id, 'BT-2024-0044', 'NASCO Peanut Butter 340g', 'NPB-340', '2024-10-20', '2025-10-20', 950, 'kg', 'qc_in_progress', null, null),
    (v_company_id, 'BT-2024-0045', 'NASCO Cornflakes 1kg', 'NCF-1000', '2024-10-22', '2025-10-22', 4000, 'kg', 'qc_pending', null, null),
    (v_company_id, 'BT-2024-0046', 'NASCO Malt Drink 330mL (Case 24)', 'NMD-330C', '2024-10-18', '2025-04-18', 12000, 'L', 'hold', null, null)
  ON CONFLICT (company_id, batch_number) DO NOTHING;

  -- Set hold reason
  UPDATE public.batch_records
  SET hold_reason = 'Aflatoxin B1 screening result pending retest — initial result 8.2 ppb (limit 5 ppb per NAFDAC/Codex). Batch quarantined pending confirmatory LC-MS/MS analysis.'
  WHERE company_id = v_company_id AND batch_number = 'BT-2024-0046';


  -- ── Change Controls ────────────────────────────────────────────────────────

  INSERT INTO public.change_controls (
    company_id, change_number, title, description, change_type, change_category,
    impact_assessment, regulatory_impact, validation_required, status
  ) VALUES
    (
      v_company_id, 'CC-2024-0001',
      'Switch Cornflakes Packaging Supplier from PackCo to FoilMaster',
      'Current packaging supplier PackCo has a 4-week lead time and pricing has increased 18% YoY. FoilMaster offers equivalent specification at 12% lower cost with 2-week lead time. Assessment required for food contact material compliance.',
      'packaging', 'major',
      'FoilMaster packaging samples tested against NAFDAC food contact material migration standards. Results: total migration ≤10 mg/dm² (pass); specific migration of primary aromatic amines: not detected (pass). Sensory panel shows no off-flavour transfer. NAFDAC notification required under regulation §12(3) for packaging change. Validation batch (BT-2024-0047) to be manufactured before full switchover.',
      true, true, 'pending_approval'
    ),
    (
      v_company_id, 'CC-2024-0002',
      'Increase Noodles Production Line Speed from 180 to 210 packs/min',
      'Capacity expansion to meet growing demand in South-West distribution region. Engineering team has validated the mechanical feasibility. Quality impact assessment needed for frying uniformity and moisture content.',
      'equipment', 'minor',
      'Process validation protocol prepared. Three consecutive validation batches to be manufactured at 210 packs/min target speed. Key quality attributes to monitor: moisture content (spec 8–12%), fat absorption (spec 18–24%), texture profile analysis. Engineering sign-off obtained from Head of Engineering dated 2024-09-15.',
      false, true, 'approved'
    ),
    (
      v_company_id, 'CC-2024-0003',
      'Reformulate Peanut Butter to Reduce Saturated Fat by 15%',
      'Replace 15% of palm oil with high-oleic sunflower oil. Driven by consumer health positioning strategy and alignment with WHO dietary guidelines. Requires full reformulation validation and NAFDAC product registration update.',
      'formulation', 'major',
      null,
      true, true, 'draft'
    ),
    (
      v_company_id, 'CC-2024-0004',
      'Implement New NAFDAC Label Format for Cornflakes Range',
      'NAFDAC issued guidance (Oct 2024) requiring updated nutritional information panel format and allergen bold-font declarations by March 2025. All Cornflakes SKUs (500g, 1kg, 1.5kg) to be updated simultaneously.',
      'packaging', 'minor',
      'New label artwork prepared and reviewed by Regulatory Affairs. NAFDAC label pre-approval application filed 2024-09-28 (reference NAF/LA/2024/10247). Timeline: approval expected 8–10 weeks. Print run lead time 3 weeks. Target effective date: January 2025.',
      true, false, 'implementing'
    )
  ON CONFLICT (company_id, change_number) DO NOTHING;


  -- ── SOP Documents ──────────────────────────────────────────────────────────

  INSERT INTO public.sop_documents (
    company_id, sop_number, title, department, category, current_version, status, effective_date, review_due_date
  ) VALUES
    (v_company_id, 'SOP-QC-001', 'Aflatoxin Testing of Incoming Maize and Groundnuts', 'Quality Control', 'quality', '3.1', 'effective', '2024-01-15', '2026-01-15'),
    (v_company_id, 'SOP-QC-002', 'Microbiological Testing of Finished Food Products', 'Quality Control', 'quality', '2.0', 'effective', '2023-11-01', '2025-11-01'),
    (v_company_id, 'SOP-MFG-001', 'Cornflake Extrusion Line Startup and Shutdown Procedure', 'Manufacturing', 'manufacturing', '4.2', 'effective', '2024-03-10', '2026-03-10'),
    (v_company_id, 'SOP-MFG-002', 'Cleaning and Sanitation of Production Equipment (CIP)', 'Manufacturing', 'manufacturing', '2.1', 'effective', '2024-06-01', '2026-06-01'),
    (v_company_id, 'SOP-QC-003', 'Batch Release Decision Procedure', 'Quality Control', 'regulatory', '1.5', 'in_review', null, '2025-02-01'),
    (v_company_id, 'SOP-REG-001', 'NAFDAC Product Registration Renewal Process', 'Regulatory Affairs', 'regulatory', '2.0', 'effective', '2024-02-01', '2026-02-01'),
    (v_company_id, 'SOP-SAF-001', 'Allergen Control and Cross-Contact Prevention', 'Quality Control', 'safety', '1.0', 'draft', null, '2025-06-01')
  ON CONFLICT (company_id, sop_number) DO NOTHING;

END $$;
