/*
  # Seed Regulatory Circulars

  Populate the regulatory_circulars table with simulated 2026 circulars
  from NAFDAC, FDA, and WHO covering Drugs, Medical Devices, and Cosmetics
  product categories. Each entry includes a 2-sentence summary.

  1. Data Inserted
    - 5 NAFDAC circulars
    - 5 FDA circulars
    - 5 WHO circulars
    - Covers all three product categories
    - Mix of severity levels (high, medium, low)
*/

INSERT INTO regulatory_circulars (source, circular_number, title, summary, product_categories, severity, published_date)
VALUES
  -- NAFDAC Circulars
  (
    'NAFDAC',
    'NAFDAC/REG/2026/004',
    'Updated Labeling Requirements for Over-the-Counter Drugs',
    'NAFDAC has mandated that all OTC drug packaging must include QR-coded digital leaflets by Q3 2026. Manufacturers who fail to comply face immediate suspension of marketing authorization.',
    ARRAY['Drugs'],
    'high',
    '2026-01-15'::timestamptz
  ),
  (
    'NAFDAC',
    'NAFDAC/REG/2026/007',
    'New Registration Framework for Class II Medical Devices',
    'A streamlined registration pathway for Class II medical devices has been introduced, reducing approval timelines from 180 to 90 days. All existing registrations must be renewed under the new framework by December 2026.',
    ARRAY['Medical Devices'],
    'high',
    '2026-01-22'::timestamptz
  ),
  (
    'NAFDAC',
    'NAFDAC/COS/2026/002',
    'Revised Safety Standards for Skin-Lightening Products',
    'NAFDAC has banned mercury and hydroquinone above 2% in all cosmetic formulations effective immediately. Companies with non-compliant products must initiate voluntary recalls within 30 days.',
    ARRAY['Cosmetics'],
    'high',
    '2026-01-28'::timestamptz
  ),
  (
    'NAFDAC',
    'NAFDAC/ADV/2026/011',
    'Advertising Guidelines for Herbal and Traditional Medicines',
    'All promotional materials for herbal medicines must now carry standardized efficacy disclaimers approved by NAFDAC. Digital advertisements must link directly to the NAFDAC-approved product monograph.',
    ARRAY['Drugs'],
    'medium',
    '2026-02-03'::timestamptz
  ),
  (
    'NAFDAC',
    'NAFDAC/REG/2026/015',
    'Post-Market Surveillance Requirements for Implantable Devices',
    'Manufacturers of implantable medical devices must now submit quarterly adverse event reports through the new NAFDAC VigiFlow portal. Failure to report within 72 hours of a serious adverse event will result in enforcement action.',
    ARRAY['Medical Devices'],
    'high',
    '2026-02-07'::timestamptz
  ),

  -- FDA Circulars
  (
    'FDA',
    'FDA-2026-D-0112',
    'Draft Guidance on AI-Enabled Drug Discovery Marketing Claims',
    'The FDA has issued new guidelines restricting marketing claims about AI-driven drug development processes. Companies cannot imply FDA endorsement of AI methodologies used in drug discovery pipelines.',
    ARRAY['Drugs'],
    'medium',
    '2026-01-10'::timestamptz
  ),
  (
    'FDA',
    'FDA-2026-N-0089',
    'Final Rule: Cybersecurity Requirements for Connected Medical Devices',
    'All network-connected medical devices submitted for 510(k) clearance must include a Software Bill of Materials and cybersecurity risk assessment. Legacy devices already on the market have until January 2027 to submit remediation plans.',
    ARRAY['Medical Devices'],
    'high',
    '2026-01-18'::timestamptz
  ),
  (
    'FDA',
    'FDA-2026-D-0201',
    'Modernized Good Manufacturing Practice for Cosmetics (MoCRA Update)',
    'FDA has finalized additional MoCRA implementation rules requiring facility registration renewal and adverse event reporting for all cosmetic manufacturers. Small businesses with under $1M in annual sales receive a 6-month compliance extension.',
    ARRAY['Cosmetics'],
    'medium',
    '2026-01-25'::timestamptz
  ),
  (
    'FDA',
    'FDA-2026-N-0334',
    'Risk Evaluation and Mitigation Strategy Updates for Opioid Medications',
    'Updated REMS requirements now mandate real-time pharmacy verification for all Schedule II opioid prescriptions. Promotional materials must prominently display the updated Medication Guide and REMS website URL.',
    ARRAY['Drugs'],
    'high',
    '2026-02-01'::timestamptz
  ),
  (
    'FDA',
    'FDA-2026-D-0415',
    'Expanded De Novo Classification for Novel Diagnostic Devices',
    'The FDA has broadened the De Novo pathway to include AI-powered point-of-care diagnostic devices. Marketing materials for De Novo classified devices must clearly state the classification pathway and any use limitations.',
    ARRAY['Medical Devices', 'Drugs'],
    'medium',
    '2026-02-05'::timestamptz
  ),

  -- WHO Circulars
  (
    'WHO',
    'WHO/EMP/RHT/2026.1',
    'Revised Prequalification Standards for Essential Medicines',
    'WHO has updated prequalification requirements for essential medicines to include bioequivalence studies conducted under ICH-aligned GCP standards. Manufacturers seeking WHO prequalification must submit updated dossiers by June 2026.',
    ARRAY['Drugs'],
    'medium',
    '2026-01-12'::timestamptz
  ),
  (
    'WHO',
    'WHO/MDE/2026.3',
    'Global Guidance on Reprocessing of Single-Use Medical Devices',
    'WHO now recommends against reprocessing of single-use medical devices in all healthcare settings due to emerging evidence of cross-contamination risks. National regulatory agencies are urged to enforce these guidelines within 12 months.',
    ARRAY['Medical Devices'],
    'high',
    '2026-01-20'::timestamptz
  ),
  (
    'WHO',
    'WHO/COS/2026.2',
    'International Safety Assessment Framework for Nanomaterial Cosmetics',
    'A new WHO framework requires comprehensive toxicological profiles for all cosmetic products containing engineered nanomaterials. Products marketed across borders must carry standardized nano-ingredient labeling by end of 2026.',
    ARRAY['Cosmetics'],
    'medium',
    '2026-01-30'::timestamptz
  ),
  (
    'WHO',
    'WHO/PHA/2026.5',
    'Updated Guidelines on Antimicrobial Resistance Claims in Drug Advertising',
    'WHO has strengthened guidelines prohibiting misleading claims about antibiotic efficacy in consumer-facing drug advertisements. All member states are expected to align national advertising codes with these updated provisions.',
    ARRAY['Drugs'],
    'high',
    '2026-02-04'::timestamptz
  ),
  (
    'WHO',
    'WHO/MDE/2026.7',
    'Emergency Use Listing Amendments for Rapid Diagnostic Test Kits',
    'WHO has revised Emergency Use Listing criteria for rapid diagnostic tests, adding mandatory field performance validation requirements. Marketing of EUL-listed products must reference the specific WHO listing version and conditions of use.',
    ARRAY['Medical Devices', 'Drugs'],
    'medium',
    '2026-02-09'::timestamptz
  );
