-- Seed NAFDAC food & pharmaceutical regulations into the regulatory library.
-- These cover NAFDAC's core mandates for food processing and pharmaceutical manufacturing.
-- Applicable to NASCO Group and similar FMCG/pharma manufacturers in Nigeria.

INSERT INTO public.regulatory_library (
  jurisdiction, title, effective_date, summary, full_text, category, tags, is_active
)
VALUES

  -- ── NAFDAC Food Regulations ──────────────────────────────────────────────────
  (
    'NAFDAC',
    'NAFDAC Foods and Drugs Administration and Control Act (Cap N1 LFN 2004)',
    '2004-01-01',
    'Establishes NAFDAC''s mandate to regulate and control the manufacture, importation, exportation, distribution, advertisement, sale and use of food, drugs, cosmetics, medical devices, bottled water and chemicals in Nigeria.',
    'The National Agency for Food and Drug Administration and Control Act empowers NAFDAC to: (1) Regulate and control the quality of food and drugs in Nigeria. (2) Conduct analysis and establish standards for food and drugs. (3) Undertake investigation into the production premises and raw materials for food and drugs. (4) Register and control the importation, exportation, manufacture, advertisement, distribution, sale and use of food, drugs, cosmetics, medical devices, bottled water, and chemicals. Section 5 provides for NAFDAC''s power to establish analytical laboratories and research institutions. Section 8 criminalises the manufacture or sale of adulterated food with penalties of up to 5 years imprisonment or a fine. NAFDAC operates post-market surveillance and conducts factory inspections to verify GMP compliance.',
    'Food & Drug Regulation',
    ARRAY['nafdac','food safety','pharmaceutical','manufacturing','gmp','registration'],
    true
  ),

  (
    'NAFDAC',
    'NAFDAC Regulation on Good Manufacturing Practice (GMP) for Food',
    '2011-01-01',
    'Sets out Good Manufacturing Practice requirements for food manufacturers in Nigeria, aligned with Codex Alimentarius standards. Compliance is mandatory for NAFDAC product registration and for annual factory inspection.',
    'NAFDAC''s GMP Guidelines for Food establish requirements across six areas: (1) Personnel — operators must receive documented training in food hygiene and personal hygiene practices. (2) Premises and equipment — manufacturing facilities must be designed to prevent cross-contamination, have adequate drainage, pest control, and temperature/humidity management. (3) Production and process controls — each product must have a master formula, batch production records must be maintained, and deviations recorded and investigated. (4) Quality control — each batch must undergo defined quality control testing before release; retained samples must be stored for the shelf-life of the product plus one year. (5) Sanitation and pest control — documented cleaning schedules must be maintained and verified. (6) Recall and complaint procedures — manufacturers must have a documented system for product recall and customer complaint handling. NAFDAC conducts announced and unannounced GMP inspections; non-compliance results in suspension of product registration or facility shutdown.',
    'GMP / Manufacturing',
    ARRAY['nafdac','gmp','food','manufacturing','quality control','batch record','inspection'],
    true
  ),

  (
    'NAFDAC',
    'NAFDAC Regulation on Labelling of Pre-packaged Foods',
    '2005-01-01',
    'Prescribes mandatory label declarations for all pre-packaged food products sold in Nigeria, including NAFDAC registration number, nutritional information, ingredient list, best-before date, storage conditions, and country of manufacture.',
    'NAFDAC''s Labelling Regulations require pre-packaged food labels to include: (1) The common name of the product. (2) Full list of ingredients in descending order of proportion. (3) Net weight or volume. (4) Name and address of the manufacturer, packer, or importer. (5) Country of origin. (6) Lot or batch identification number. (7) Date marking: "Best Before" or "Use By" date as appropriate; storage instructions where necessary. (8) NAFDAC Registration Number in the format FS-XXXXX or equivalent. (9) Nutritional information panel (mandatory for products making health or nutritional claims). (10) Allergen declarations — any of the 14 major allergens present must be declared in bold. Products making health claims must first obtain NAFDAC pre-approval for the claim. Failure to meet labelling requirements is grounds for product seizure during market surveillance.',
    'Labelling / Advertising',
    ARRAY['nafdac','labelling','food','pre-packaged','nutrition','allergen','registration number'],
    true
  ),

  (
    'NAFDAC',
    'NAFDAC Regulation on Food Additives',
    '2014-01-01',
    'Controls the use of food additives in Nigeria. Only additives on the NAFDAC/Codex approved list may be used; uses must be within specified maximum permitted levels (MPLs). Manufacturers must declare additives in product registration dossiers.',
    'NAFDAC''s Food Additives Regulations implement Codex Alimentarius General Standard for Food Additives (GSFA) in Nigeria. Key requirements: (1) Only NAFDAC-approved additives may be used; approval is based on the Codex positive list. (2) Use must be at or below the Maximum Permitted Level (MPL) for the specific food category. (3) Carry-over principle: additives in raw materials that are carried over into the finished product must be declared if the carry-over results in a level higher than the MPL in the final product. (4) All additives, including processing aids, must be declared in the ingredient list using the functional class name followed by the specific name or INS number (e.g., "Preservative (Sodium Benzoate)" or "Preservative (INS 211)"). (5) Manufacturers must provide additive use justification (technological purpose) in the NAFDAC product registration dossier. (6) NAFDAC conducts laboratory testing of market samples; products found to exceed MPLs are subject to recall and prosecution.',
    'Food Safety',
    ARRAY['nafdac','food additives','codex','mpl','preservatives','colours','registration'],
    true
  ),

  (
    'NAFDAC',
    'NAFDAC Pharmaceutical Guidelines — Good Manufacturing Practice for Medicines',
    '2019-01-01',
    'Nigeria''s GMP standard for pharmaceutical manufacturers, aligned with WHO GMP guidelines. Mandatory for all medicine manufacturers to obtain and maintain product registration and manufacturing licence from NAFDAC.',
    'NAFDAC''s Pharmaceutical GMP Guidelines (2019 revision) align with WHO Technical Report Series 986, Annex 2 (2014). Key requirements for pharmaceutical manufacturers: (1) Quality Management — each site must maintain a Pharmaceutical Quality System (PQS) with documented quality policy, quality manual, and change control procedures. (2) Personnel — a qualified person (QP) responsible for batch release must be designated; all production personnel must receive GMP training documented in training records. (3) Premises and Equipment — manufacturing areas must be classified per ISO cleanroom standards; HVAC systems must be validated; equipment must have calibration schedules and records. (4) Documentation — master batch manufacturing records (BMRs), standard operating procedures (SOPs), and batch packaging records must be maintained for a minimum of one year beyond shelf-life of the batch, or five years, whichever is longer. (5) Production — each batch must be assigned a unique batch number; in-process controls must be defined and monitored. (6) Quality Control — a designated QC laboratory must conduct identity, purity, and potency testing on each batch before release. (7) Validation — process validation, cleaning validation, and analytical method validation must be documented. (8) Recall — documented recall procedures must be in place and tested. NAFDAC conducts pre-licence GMP inspection and periodic surveillance inspections. Failure to maintain GMP compliance results in suspension of manufacturing licence.',
    'Pharmaceutical GMP',
    ARRAY['nafdac','pharmaceutical','gmp','who','batch release','validation','qc','manufacturing licence'],
    true
  ),

  -- ── SON (Standards Organisation of Nigeria) ─────────────────────────────────
  (
    'SON',
    'Nigerian Industrial Standard (NIS) for Packaged Water (NIS 554:2015)',
    '2015-01-01',
    'Sets quality and safety standards for packaged drinking water in Nigeria. Specifies microbiological, physical, and chemical limits. Compliance is required for SON Conformity Assessment Certificate (CAC) and NAFDAC registration.',
    'NIS 554:2015 (Packaged Water) specifies: (1) Microbiological limits — total coliforms: absent in 250mL; E. coli: absent in 250mL; HPC (22°C, 72hr): ≤100 CFU/mL; Pseudomonas aeruginosa: absent in 250mL. (2) Physical standards — pH: 6.5–8.5; turbidity: ≤1 NTU; colour: ≤15 TCU; conductivity: ≤2500 µS/cm. (3) Chemical limits — nitrates: ≤50 mg/L; nitrites: ≤0.1 mg/L; lead: ≤0.01 mg/L; arsenic: ≤0.01 mg/L; fluoride: ≤1.5 mg/L. (4) Container and closure requirements — packaging must be food-grade, free from migration of harmful substances. (5) Labelling — source, batch code, production and expiry dates are mandatory. SON conducts factory audits; CAC is renewed annually.',
    'Standards',
    ARRAY['son','water','packaged water','fmcg','nis','microbiological','standards'],
    true
  )

ON CONFLICT (jurisdiction, title) DO NOTHING;
