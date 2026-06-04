/**
 * Regulatory Library Service
 * Curated, searchable database of regulations across jurisdictions
 * with enforcement history, warning letters, and guidance documents.
 */
import { supabase } from './supabase';

/* ── Types ──────────────────────────────────────────────────── */

export type Jurisdiction = 'FDA' | 'EMA' | 'MHRA' | 'TGA' | 'NAFDAC' | 'Health Canada' | 'NHIA' | 'HEFAMAA' | 'NAICOM' | 'NDPA' | 'APCON' | 'MDCN' | 'SON' | 'PCN' | 'All';

export type DocumentType = 'guidance' | 'warning_letter' | 'enforcement_action' | 'consent_decree' | 'regulation';

export type LibraryDocument = {
  id: string;
  title: string;
  jurisdiction: Jurisdiction;
  documentType: DocumentType;
  summary: string;
  fullText: string;
  sourceUrl: string;
  publishedDate: string;
  therapeuticArea: string;
  relevanceScore: number;
};

/* ── Sample regulatory library data ──────────────────────── */

const LIBRARY_DATA: LibraryDocument[] = [
  // FDA
  { id: 'fda-1', title: 'FDA Guidance: Internet/Social Media Platforms — Presenting Risk and Benefit Information', jurisdiction: 'FDA', documentType: 'guidance', summary: 'Guidance for industry on presenting risk and benefit information for prescription drugs and medical devices on Internet and social media platforms.', fullText: 'This guidance provides recommendations to pharmaceutical and medical device companies on how to present benefit and risk information when using the Internet and social media to promote their products. Key points include: fair balance requirements in character-limited formats, use of hyperlinks to full prescribing information, and monitoring obligations for user-generated content.', sourceUrl: 'https://www.fda.gov/regulatory-information/search-fda-guidance-documents', publishedDate: '2025-06-15', therapeuticArea: 'General', relevanceScore: 95 },
  { id: 'fda-2', title: 'FDA Warning Letter: Off-Label Promotion via Social Media Influencers', jurisdiction: 'FDA', documentType: 'warning_letter', summary: 'Warning letter issued to a pharmaceutical company for off-label promotion of a prescription medication through social media influencer partnerships.', fullText: 'The FDA has determined that your social media campaign, conducted through contracted health influencers, promotes your prescription drug product for uses beyond the approved indications. The posts failed to include adequate risk information, made unsubstantiated superiority claims, and did not include the required indication statement. Corrective action required within 15 business days.', sourceUrl: 'https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/compliance-actions-and-activities/warning-letters', publishedDate: '2025-09-22', therapeuticArea: 'Pharmaceuticals', relevanceScore: 90 },
  { id: 'fda-3', title: 'FDA Enforcement Action: Misleading DTC Television Advertisements', jurisdiction: 'FDA', documentType: 'enforcement_action', summary: 'Enforcement action against misleading direct-to-consumer television advertisements that minimized risk information.', fullText: 'The Office of Prescription Drug Promotion has identified that your DTC television advertisements present risk information in a manner that undermines its communication. Specifically: risk information presented at a faster read speed than benefit claims, use of distracting visuals during the major statement, and failure to include adequate provision for full labeling.', sourceUrl: 'https://www.fda.gov/drugs/enforcement-activities-fda', publishedDate: '2025-03-10', therapeuticArea: 'Cardiovascular', relevanceScore: 85 },

  // EMA
  { id: 'ema-1', title: 'EMA Guideline on E-Labeling for Medicinal Products', jurisdiction: 'EMA', documentType: 'guidance', summary: 'Updated guideline on electronic product information (ePI) for medicinal products authorized in the EU.', fullText: 'This guideline establishes the framework for implementing electronic product information for EU-authorized medicinal products. It covers the technical standards for digital format conversion, accessibility requirements, multilingual support, update procedures, and the relationship between electronic and paper-based product information. All marketing authorization holders must comply by the specified transition date.', sourceUrl: 'https://www.ema.europa.eu/en/human-regulatory/marketing-authorisation', publishedDate: '2025-11-01', therapeuticArea: 'General', relevanceScore: 88 },
  { id: 'ema-2', title: 'EMA Decision on Patient Education Materials Review', jurisdiction: 'EMA', documentType: 'regulation', summary: 'Decision requiring pre-approval of patient education materials that accompany risk management plans.', fullText: 'The Committee for Medicinal Products for Human Use (CHMP) has adopted this decision requiring that all patient education materials forming part of a risk management plan must be submitted for regulatory review and approval before distribution. This includes digital formats, mobile applications, and interactive tools.', sourceUrl: 'https://www.ema.europa.eu/en/human-regulatory', publishedDate: '2025-08-14', therapeuticArea: 'General', relevanceScore: 82 },

  // MHRA
  { id: 'mhra-1', title: 'MHRA Blue Guide: Advertising and Promotion of Medicines in the UK', jurisdiction: 'MHRA', documentType: 'guidance', summary: 'Comprehensive guide covering all aspects of advertising and promoting medicines in the UK market.', fullText: 'The Blue Guide provides detailed guidance on the UK regulatory framework for medicines advertising. It covers: definition of advertising vs. information, rules for healthcare professional promotion, restrictions on direct-to-consumer advertising, digital and social media standards, sampling regulations, hospitality rules, and enforcement mechanisms. Updated to reflect post-Brexit UK regulations.', sourceUrl: 'https://www.gov.uk/government/publications/blue-guide-advertising-and-promoting-medicines', publishedDate: '2025-04-20', therapeuticArea: 'General', relevanceScore: 92 },

  // TGA
  { id: 'tga-1', title: 'TGA Therapeutic Goods Advertising Code 2025', jurisdiction: 'TGA', documentType: 'regulation', summary: 'Updated advertising code including new provisions for digital marketing and influencer content.', fullText: 'The updated Therapeutic Goods Advertising Code introduces provisions addressing modern digital marketing practices. New requirements include: mandatory disclosure of sponsored content, restrictions on testimonials for therapeutic goods, requirements for substantiation of advertising claims, special provisions for social media advertising, and enhanced enforcement mechanisms including civil penalties.', sourceUrl: 'https://www.tga.gov.au/advertising', publishedDate: '2025-07-01', therapeuticArea: 'General', relevanceScore: 87 },

  // NAFDAC
  { id: 'nafdac-1', title: 'NAFDAC Guidelines on Pharmaceutical Advertising and Promotion', jurisdiction: 'NAFDAC', documentType: 'guidance', summary: 'Comprehensive guidelines covering pharmaceutical advertising standards in Nigeria.', fullText: 'These guidelines establish the regulatory framework for pharmaceutical advertising in Nigeria. They cover: prohibited claims (cure for chronic diseases, superiority claims without evidence), required disclaimers, pre-certification requirements for advertisements, sanctions for violations, and special rules for traditional medicine advertising. All pharmaceutical advertisements must be pre-certified by NAFDAC before publication.', sourceUrl: 'https://www.nafdac.gov.ng/guidelines', publishedDate: '2025-01-15', therapeuticArea: 'Pharmaceuticals', relevanceScore: 93 },
  { id: 'nafdac-2', title: 'NAFDAC Enforcement Notice: Digital Marketing Compliance', jurisdiction: 'NAFDAC', documentType: 'enforcement_action', summary: 'Enforcement notice addressing non-compliance in digital pharmaceutical marketing campaigns.', fullText: 'NAFDAC has observed a significant increase in non-compliant digital pharmaceutical marketing campaigns. Common violations include: social media posts without pre-certification, influencer marketing without proper disclaimers, unsubstantiated therapeutic claims, and missing safety information. Companies found in violation face suspension of advertising approval and potential product registration review.', sourceUrl: 'https://www.nafdac.gov.ng/enforcement', publishedDate: '2025-10-05', therapeuticArea: 'Pharmaceuticals', relevanceScore: 88 },

  // NAFDAC — Food & Manufacturing GMP
  { id: 'nafdac-3', title: 'NAFDAC Foods and Drugs Administration and Control Act (Cap N1 LFN 2004)', jurisdiction: 'NAFDAC', documentType: 'regulation', summary: 'Establishes NAFDAC\'s mandate to regulate food, drugs, cosmetics, medical devices, bottled water and chemicals in Nigeria. Criminalises manufacture or sale of adulterated food; penalties up to 5 years imprisonment.', fullText: 'The National Agency for Food and Drug Administration and Control Act empowers NAFDAC to: (1) Regulate and control the quality of food and drugs in Nigeria. (2) Conduct analysis and establish standards for food and drugs. (3) Undertake investigation into the production premises and raw materials for food and drugs. (4) Register and control the importation, exportation, manufacture, advertisement, distribution, sale and use of food, drugs, cosmetics, medical devices, bottled water, and chemicals. Section 5 provides for NAFDAC\'s power to establish analytical laboratories and research institutions. Section 8 criminalises the manufacture or sale of adulterated food with penalties of up to 5 years imprisonment or a fine. NAFDAC operates post-market surveillance and conducts factory inspections to verify GMP compliance. All food manufacturers must register products with NAFDAC and obtain a NAFDAC number (FS-XXXXX for food products) before sale in Nigeria. Failure to register constitutes a criminal offence.', sourceUrl: 'https://www.nafdac.gov.ng', publishedDate: '2004-01-01', therapeuticArea: 'Food & Pharmaceutical Manufacturing', relevanceScore: 99 },

  { id: 'nafdac-4', title: 'NAFDAC Good Manufacturing Practice (GMP) Guidelines for Food', jurisdiction: 'NAFDAC', documentType: 'guidance', summary: 'Sets GMP requirements for food manufacturers in Nigeria aligned with Codex Alimentarius. Compliance is mandatory for NAFDAC product registration and annual factory inspection. Covers premises, batch records, QC, sanitation, and recall procedures.', fullText: 'NAFDAC\'s GMP Guidelines for Food establish requirements across six areas: (1) Personnel — operators must receive documented training in food hygiene and personal hygiene practices; training records must be retained for at least two years. (2) Premises and Equipment — manufacturing facilities must be designed to prevent cross-contamination; adequate drainage, pest control, and temperature/humidity management are mandatory; preventive maintenance schedules must be documented. (3) Production and Process Controls — each product must have a master formula; batch production records must be maintained for every batch; deviations must be recorded and investigated; in-process controls must be defined and verified. (4) Quality Control — each batch must undergo defined quality control testing before release; retained samples must be stored for the shelf-life of the product plus one year; QC results must be reviewed by a qualified person before batch release. (5) Sanitation and Pest Control — documented cleaning schedules must be maintained and verified with signatures; pest control records must be available for NAFDAC inspection. (6) Recall and Complaint Procedures — manufacturers must have a documented system for product recall and customer complaint handling; mock recalls must be tested annually. NAFDAC conducts announced and unannounced GMP inspections; non-compliance results in suspension of product registration or facility shutdown.', sourceUrl: 'https://www.nafdac.gov.ng/guidelines', publishedDate: '2011-01-01', therapeuticArea: 'Food & Pharmaceutical Manufacturing', relevanceScore: 98 },

  { id: 'nafdac-5', title: 'NAFDAC Regulation on Labelling of Pre-packaged Foods', jurisdiction: 'NAFDAC', documentType: 'regulation', summary: 'Prescribes mandatory label declarations for all pre-packaged food products in Nigeria including NAFDAC registration number, nutritional information, ingredient list, best-before date, and allergen declarations.', fullText: 'NAFDAC\'s Labelling Regulations require pre-packaged food labels to include: (1) Common name of the product. (2) Full list of ingredients in descending order of proportion by weight. (3) Net weight or volume in metric units. (4) Name and address of the manufacturer, packer, or importer. (5) Country of origin. (6) Lot or batch identification code. (7) Date marking: "Best Before" or "Use By" date; storage instructions where necessary for safety (e.g., "Keep Refrigerated"). (8) NAFDAC Registration Number in the format FS-XXXXX (food supplement) or equivalent prefix per product category. (9) Nutritional information panel — mandatory for products making health or nutritional claims; recommended for all food products. (10) Allergen declarations — any of the 14 major allergens (cereals containing gluten, crustaceans, eggs, fish, peanuts, soy, milk, nuts, celery, mustard, sesame, sulfites, lupin, molluscs) must be declared in bold in the ingredient list or in a separate allergen statement. Products making health claims must first obtain NAFDAC pre-approval for the claim. Failure to meet labelling requirements is grounds for product seizure during market surveillance.', sourceUrl: 'https://www.nafdac.gov.ng', publishedDate: '2005-01-01', therapeuticArea: 'Food & Pharmaceutical Manufacturing', relevanceScore: 96 },

  { id: 'nafdac-6', title: 'NAFDAC Pharmaceutical GMP Guidelines (Aligned with WHO TRS 986)', jurisdiction: 'NAFDAC', documentType: 'guidance', summary: 'Nigeria\'s GMP standard for pharmaceutical manufacturers, aligned with WHO GMP. Mandatory for all medicine manufacturers to maintain NAFDAC product registration and manufacturing licence. Covers PQS, batch records, validation, and QC laboratory requirements.', fullText: 'NAFDAC\'s Pharmaceutical GMP Guidelines (2019 revision) align with WHO Technical Report Series 986, Annex 2. Key requirements: (1) Pharmaceutical Quality System (PQS) — each site must maintain a documented PQS covering quality policy, change control, deviation management, CAPA, and management review. (2) Personnel — a Qualified Person (QP) responsible for batch release must be designated; all production personnel must receive annual GMP training documented in training records; training effectiveness must be assessed. (3) Premises and Equipment — manufacturing areas must be classified per ISO cleanroom standards; HVAC systems must be validated; equipment must have calibration schedules with certificates from NAFDAC-recognised calibration bodies. (4) Documentation — master batch manufacturing records (BMRs), standard operating procedures (SOPs), and batch packaging records must be maintained for minimum one year beyond shelf-life or five years, whichever is longer; SOPs must be reviewed at minimum every two years. (5) Production — each batch must be assigned a unique batch number; in-process controls (IPCs) must be defined, monitored, and documented; batch yield reconciliation must be performed. (6) Quality Control — a designated QC laboratory must conduct identity, purity, and potency testing on each batch before release; Out-of-Specification (OOS) results must trigger formal investigation. (7) Validation — process validation, cleaning validation, analytical method validation, and computer system validation must be documented and available for NAFDAC review. (8) Recall — documented recall procedures must be in place; mock recalls must be conducted and records maintained. NAFDAC conducts pre-licence GMP inspection and periodic surveillance inspections. Failure to maintain GMP compliance results in suspension of manufacturing licence and product registration.', sourceUrl: 'https://www.nafdac.gov.ng/pharma-gmp', publishedDate: '2019-06-01', therapeuticArea: 'Pharmaceutical Manufacturing', relevanceScore: 99 },

  // PCN — Pharmacists Council of Nigeria
  { id: 'pcn-1', title: 'PCN Guidelines on Pharmaceutical Premises Licensing', jurisdiction: 'PCN', documentType: 'regulation', summary: 'Requirements for pharmaceutical manufacturing, dispensing, and distribution premises licensing in Nigeria. A valid PCN premises licence is a prerequisite for NAFDAC manufacturing licence application.', fullText: 'The Pharmacists Council of Nigeria (PCN) regulates all pharmaceutical premises including manufacturing plants, hospitals, community pharmacies, patent medicine stores, and pharmaceutical distributors. For pharmaceutical manufacturers: (1) A superintendent pharmacist must be appointed and registered with PCN; the superintendent is personally liable for pharmaceutical quality management. (2) Manufacturing premises must comply with PCN minimum standards for space, equipment, and documentation before a premises licence is granted. (3) The PCN premises licence must be renewed annually; lapsed licences render continued manufacturing illegal under the Pharmacists Council of Nigeria Act. (4) PCN inspections are conducted quarterly for manufacturing sites; inspection reports must be maintained and corrective actions implemented within the specified timeframes. (5) The PCN premises licence number must be displayed on all pharmaceutical product labels and packaging alongside the NAFDAC registration number. PCN coordinates with NAFDAC on joint GMP inspections for manufacturing licence applications.', sourceUrl: 'https://www.pcn.gov.ng', publishedDate: '2023-01-01', therapeuticArea: 'Pharmaceutical Manufacturing', relevanceScore: 95 },

  // SON — Standards Organisation of Nigeria
  { id: 'son-1', title: 'Nigerian Industrial Standard (NIS 554:2015) — Packaged Drinking Water', jurisdiction: 'SON', documentType: 'regulation', summary: 'Sets quality and safety standards for packaged drinking water in Nigeria. Specifies microbiological, physical, and chemical limits. Compliance required for SON Conformity Assessment Certificate and NAFDAC registration of sachet/bottled water products.', fullText: 'NIS 554:2015 (Packaged Drinking Water) specifies mandatory limits: (1) Microbiological — total coliforms: absent in 250mL; E. coli: absent in 250mL; HPC (22°C, 72hr): ≤100 CFU/mL; Pseudomonas aeruginosa: absent in 250mL. (2) Physical standards — pH: 6.5–8.5; turbidity: ≤1 NTU; colour: ≤15 TCU; electrical conductivity: ≤2500 µS/cm; total dissolved solids: ≤1000 mg/L. (3) Chemical limits — nitrates: ≤50 mg/L; nitrites: ≤0.1 mg/L; lead: ≤0.01 mg/L; arsenic: ≤0.01 mg/L; mercury: ≤0.001 mg/L; fluoride: ≤1.5 mg/L; residual chlorine (where applicable): ≤5 mg/L. (4) Container and closure — packaging must be food-grade polyethylene terephthalate (PET) or equivalent; migration of harmful substances must comply with NAFDAC food contact material standards. (5) Labelling — source identification, batch code, production date, and expiry date are mandatory; volume must be stated in mL or L. SON conducts factory audits and market surveillance; the Conformity Assessment Certificate (CAC) is renewed annually. Products not carrying the SON mark are subject to seizure in market surveillance operations.', sourceUrl: 'https://www.son.gov.ng', publishedDate: '2015-01-01', therapeuticArea: 'Food & Pharmaceutical Manufacturing', relevanceScore: 92 },

  // Health Canada
  { id: 'hc-1', title: 'Health Canada: Guidance on Direct-to-Consumer Advertising of Prescription Drugs', jurisdiction: 'Health Canada', documentType: 'guidance', summary: 'Framework for permissible direct-to-consumer communication about prescription drugs in Canada.', fullText: 'This guidance clarifies the boundaries of permissible DTC advertising for prescription drugs under the Food and Drugs Act. It distinguishes between reminder ads (name/price/quantity only), help-seeking ads (disease awareness without product mention), and full product ads (currently prohibited for prescription drugs). Social media considerations and patient support programs are also addressed.', sourceUrl: 'https://www.canada.ca/en/health-canada/services/drugs-health-products', publishedDate: '2025-05-30', therapeuticArea: 'General', relevanceScore: 86 },

  // NHIA — National Health Insurance Authority
  {
    id: 'nhia-1',
    title: 'NHIA Act 2022 & HMO Provider Accreditation Standards',
    jurisdiction: 'NHIA',
    documentType: 'regulation',
    summary: 'The foundational legislation governing HMOs in Nigeria, including provider network accreditation requirements, benefit package obligations, and quality assurance mandates.',
    fullText: 'The National Health Insurance Authority Act 2022 consolidates health insurance regulation in Nigeria under a single authority. Key obligations for HMOs include: (1) Provider Network Standards — all network hospitals and clinics must hold current HEFAMAA accreditation; HMOs must maintain a minimum provider-to-enrollee ratio by geo-political zone; specialist facilities must be accessible within defined travel-time thresholds. (2) Benefit Package Compliance — HMOs must guarantee the National Minimum Benefit Package to all enrollees; any supplementary benefit tiers must be clearly documented and pre-approved by NHIA. (3) Quality Assurance — HMOs are required to conduct at minimum annual quality assessments of each provider in their network; audit results must be reported to NHIA within 30 days of completion; providers rated below the NHIA minimum quality threshold must be placed on a corrective action plan or delisted within 60 days. (4) Claims Processing — claims must be adjudicated within 30 days of receipt; denial rates exceeding NHIA benchmarks trigger mandatory review. (5) Annual Returns — HMOs must submit audited financial statements, provider network lists with current accreditation status, and enrollee complaint data to NHIA annually. Non-compliance may result in suspension or revocation of operating licence.',
    sourceUrl: 'https://www.nhia.gov.ng',
    publishedDate: '2022-10-20',
    therapeuticArea: 'HMO Operations',
    relevanceScore: 99,
  },
  {
    id: 'nhia-2',
    title: 'NHIA Circular: Provider Network Quality Benchmarks 2025',
    jurisdiction: 'NHIA',
    documentType: 'guidance',
    summary: 'Updated quality benchmarks and minimum performance scores that all NHIA-accredited provider networks must meet, effective Q1 2025.',
    fullText: 'This circular updates the minimum quality benchmarks for HMO provider networks effective January 2025. Key thresholds: (1) HEFAMAA Facility Score — providers must maintain a minimum HEFAMAA composite score of 70/100; facilities scoring 55–69 are placed on a 90-day improvement notice; facilities below 55 must be suspended from the network pending re-inspection. (2) Claims Rejection Rate — no provider in the network should have an HMO claims rejection rate exceeding 15% over a rolling six-month period. (3) Staff Credentialing — at least 90% of clinical staff in any network facility must hold current MDCN or NMCN registration, verifiable in real time. (4) Infection Control — all network facilities must demonstrate compliance with the Federal Ministry of Health Infection Prevention and Control guidelines, with records available for NHIA inspection on demand. (5) Reporting Obligation — HMOs must report any provider falling below these benchmarks to NHIA within 14 days of identification and submit a remediation plan within 30 days.',
    sourceUrl: 'https://www.nhia.gov.ng/circulars',
    publishedDate: '2025-01-08',
    therapeuticArea: 'HMO Operations',
    relevanceScore: 97,
  },

  // HEFAMAA — Health Facility Monitoring and Accreditation Agency
  {
    id: 'hefamaa-1',
    title: 'HEFAMAA Facility Licensing and Accreditation Standards (2024 Edition)',
    jurisdiction: 'HEFAMAA',
    documentType: 'regulation',
    summary: 'Comprehensive accreditation standards for hospitals, clinics, and diagnostic centres in Nigeria, covering infrastructure, staffing, equipment, and patient safety requirements.',
    fullText: 'HEFAMAA accreditation is the prerequisite for any healthcare facility to participate in NHIA-accredited HMO networks. The 2024 Standards cover six domains: (1) Physical Infrastructure — minimum floor space per bed, emergency access requirements, isolation room standards, pharmacy dispensary layout, and biomedical waste management facilities. (2) Clinical Staffing — minimum doctor-to-bed ratios by facility category (Primary, Secondary, Tertiary); mandatory 24/7 on-call coverage requirements; nursing registration verification. (3) Equipment and Technology — mandatory equipment lists by facility category; calibration and maintenance log requirements; biomedical equipment certification. (4) Infection Prevention and Control — IPC committee mandate, surveillance protocols, hand hygiene auditing, antimicrobial stewardship programme. (5) Patient Safety — adverse event reporting within 72 hours to HEFAMAA; root-cause analysis documentation; patient complaint mechanism. (6) Clinical Records — minimum data elements for patient records; retention periods; data security requirements. Facilities are scored on a 100-point composite scale. Accreditation is granted at Provisional (55–69), Standard (70–84), or Excellence (85–100) tiers. Renewal inspections are conducted every two years, with spot inspections triggered by complaint or adverse event reports.',
    sourceUrl: 'https://www.hefamaa.gov.ng',
    publishedDate: '2024-03-01',
    therapeuticArea: 'Healthcare Facilities',
    relevanceScore: 98,
  },

  // NAICOM — National Insurance Commission
  {
    id: 'naicom-1',
    title: 'NAICOM Guidelines on Health Maintenance Organisations (HMO Operational Guidelines)',
    jurisdiction: 'NAICOM',
    documentType: 'regulation',
    summary: 'Insurance regulatory requirements for HMOs in Nigeria covering solvency margins, premium filings, marketing conduct, and consumer protection obligations.',
    fullText: 'NAICOM regulates HMOs as a category of insurance entity under the Insurance Act and the NHIA Act 2022. Key obligations: (1) Capitalisation — minimum paid-up capital of ₦1 billion for national HMOs; ₦500 million for state-level HMOs; quarterly solvency returns must demonstrate maintenance of minimum solvency margins. (2) Premium and Benefit Disclosure — all health plan marketing materials must include a clear, plain-language summary of covered and excluded benefits; premium rates must be filed with NAICOM before publication; retrospective premium changes are prohibited. (3) Marketing Conduct — advertising claims about network quality, provider count, or coverage breadth must be substantiated with current data; comparative claims require written evidence; celebrity or influencer endorsements must be pre-vetted by NAICOM. (4) Consumer Protection — a dedicated consumer complaints unit is mandatory; complaints must be acknowledged within 48 hours and resolved within 21 days; unresolved complaints exceeding 30 days must be escalated to NAICOM. (5) Annual Regulatory Returns — audited accounts, actuarial certificate, provider network list, and complaints register must be submitted to NAICOM by 31 March each year.',
    sourceUrl: 'https://www.naicom.gov.ng',
    publishedDate: '2024-06-15',
    therapeuticArea: 'Insurance Regulation',
    relevanceScore: 94,
  },

  // NDPA — Nigeria Data Protection Act 2023
  {
    id: 'ndpa-1',
    title: 'Nigeria Data Protection Act 2023 — Healthcare and HMO Obligations',
    jurisdiction: 'NDPA',
    documentType: 'regulation',
    summary: 'Data protection obligations specific to healthcare organisations and HMOs processing sensitive health data of Nigerian citizens under the NDPA 2023.',
    fullText: 'The Nigeria Data Protection Act 2023 (NDPA) designates health data as a special category of personal data requiring heightened protection. Key obligations for HMOs: (1) Lawful Basis — health data may only be processed on the basis of explicit consent, contractual necessity (delivery of health benefits), or a legal obligation; pre-ticked consent boxes are not valid. (2) Data Subject Rights — enrollees have the right to access their health records, request correction of inaccuracies, and request deletion where data is no longer necessary; HMOs must respond to access requests within 72 hours. (3) Cross-Border Data Transfers — patient health data may not be transferred to a country without an adequate data protection framework without explicit consent or a NDPC-approved data transfer agreement; cloud providers must be evaluated for data residency. (4) Breach Notification — personal data breaches affecting health data must be reported to the Nigeria Data Protection Commission (NDPC) within 72 hours of discovery; affected individuals must be notified without undue delay. (5) Registration — data controllers processing health data at scale are required to register with the NDPC and undergo annual Data Protection Compliance Audits conducted by a licensed Data Protection Compliance Organisation (DPCO). (6) Provider Data Sharing — data sharing agreements with network providers must include minimum security requirements and audit rights.',
    sourceUrl: 'https://ndpc.gov.ng',
    publishedDate: '2023-06-12',
    therapeuticArea: 'Data Protection',
    relevanceScore: 95,
  },

  // APCON — Advertising Practitioners Council of Nigeria
  {
    id: 'apcon-1',
    title: 'APCON Code of Advertising Practice — Healthcare and Insurance Services',
    jurisdiction: 'APCON',
    documentType: 'regulation',
    summary: 'APCON standards governing all advertising by healthcare organisations and HMOs in Nigeria, including mandatory vetting requirements and prohibited claim types.',
    fullText: 'The Advertising Practitioners Council of Nigeria (APCON) Code of Advertising Practice applies to all advertising by HMOs whether in print, broadcast, outdoor, or digital channels. Key provisions for healthcare and HMO advertising: (1) Pre-Publication Vetting — all healthcare advertising must be submitted to APCON\'s Health and Pharmaceutical Advertising Vetting Committee (HPAVC) for pre-approval before publication; digital content including social media campaigns is not exempt. (2) Truthfulness and Substantiation — all claims about provider network quality, coverage breadth, or health outcomes must be substantiated with current, verifiable data at the time of the claim; "Nigeria\'s best" or "number one" claims require third-party evidence. (3) Prohibited Content — advertising must not imply a cure for conditions not clinically proven; must not use before-and-after imagery that creates unrealistic expectations; must not target vulnerable populations (children, critically ill persons) with misleading benefit claims. (4) Testimonials — patient testimonials must be genuine, must include a disclaimer that results may vary, and must not make claims beyond what the patient personally experienced. (5) Comparative Advertising — direct comparisons with competing HMOs are permitted only if factually accurate, verifiable, and not misleading. (6) Sanctions — non-compliant advertising is subject to immediate withdrawal orders, fines, and referral to relevant professional bodies.',
    sourceUrl: 'https://www.apconng.org',
    publishedDate: '2024-09-01',
    therapeuticArea: 'Marketing Compliance',
    relevanceScore: 91,
  },

  // MDCN — Medical and Dental Council of Nigeria
  {
    id: 'mdcn-1',
    title: 'MDCN Practitioner Licensing and Credentialing Standards for HMO Network Providers',
    jurisdiction: 'MDCN',
    documentType: 'guidance',
    summary: 'Standards for verifying and continuously monitoring the licensing status of medical and dental practitioners employed by or contracted to HMO network facilities.',
    fullText: 'The Medical and Dental Council of Nigeria (MDCN) maintains the authoritative register of licensed medical and dental practitioners in Nigeria. HMOs with provider networks carry a duty-of-care obligation to verify practitioner credentials. Key requirements: (1) Primary Source Verification — HMOs and their network facilities must verify practitioner licensing directly with the MDCN register, not merely from documents provided by the practitioner; the MDCN online portal provides real-time licence status checks. (2) Renewal Monitoring — MDCN licences are renewed annually by 30 June each year; HMOs must implement a system to flag practitioners whose licences expire and suspend their inclusion in active provider rosters until renewal is confirmed. (3) Specialist Certification — practitioners listed as specialists in HMO marketing materials must hold the relevant Fellowship or Certificate from an MDCN-recognised postgraduate college (NPMCN, WACS, or equivalent); HMOs are responsible for verifying this before listing. (4) Disciplinary Register — practitioners subject to MDCN disciplinary proceedings or suspension must be immediately removed from HMO provider lists; HMOs should check the MDCN disciplinary register at minimum quarterly. (5) Locum Practitioners — locum doctors used by network facilities must meet the same credentialing standards as permanent staff; ad-hoc arrangements do not exempt facilities from compliance. (6) Continuing Professional Development — MDCN requires 40 CPD points per year; network facilities should maintain CPD records for all clinical staff as part of their accreditation evidence.',
    sourceUrl: 'https://www.mdcn.gov.ng',
    publishedDate: '2024-11-15',
    therapeuticArea: 'Practitioner Licensing',
    relevanceScore: 93,
  },
];

/* ── Search and filter ───────────────────────────────────── */

export function searchLibrary(
  query?: string,
  jurisdiction?: Jurisdiction,
  documentType?: DocumentType,
  therapeuticArea?: string,
): LibraryDocument[] {
  let results = [...LIBRARY_DATA];

  if (jurisdiction && jurisdiction !== 'All') {
    results = results.filter(d => d.jurisdiction === jurisdiction);
  }
  if (documentType) {
    results = results.filter(d => d.documentType === documentType);
  }
  if (therapeuticArea) {
    results = results.filter(d =>
      d.therapeuticArea.toLowerCase().includes(therapeuticArea.toLowerCase())
    );
  }
  if (query && query.trim()) {
    const q = query.toLowerCase();
    results = results.filter(d =>
      d.title.toLowerCase().includes(q) ||
      d.summary.toLowerCase().includes(q) ||
      d.fullText.toLowerCase().includes(q)
    );
  }

  return results.sort((a, b) => b.relevanceScore - a.relevanceScore);
}

/* ── Get all jurisdictions ───────────────────────────────── */

export const JURISDICTIONS: Jurisdiction[] = ['NAFDAC', 'PCN', 'SON', 'NHIA', 'HEFAMAA', 'NAICOM', 'NDPA', 'APCON', 'MDCN', 'FDA', 'EMA', 'MHRA', 'TGA', 'Health Canada'];

export const DOCUMENT_TYPES: { id: DocumentType; label: string }[] = [
  { id: 'guidance', label: 'Guidance Documents' },
  { id: 'warning_letter', label: 'Warning Letters' },
  { id: 'enforcement_action', label: 'Enforcement Actions' },
  { id: 'consent_decree', label: 'Consent Decrees' },
  { id: 'regulation', label: 'Regulations' },
];

/* ── Get counts by jurisdiction ──────────────────────────── */

export function getJurisdictionStats(): { jurisdiction: string; count: number; latestDate: string }[] {
  const stats: Record<string, { count: number; latestDate: string }> = {};
  for (const doc of LIBRARY_DATA) {
    if (!stats[doc.jurisdiction]) {
      stats[doc.jurisdiction] = { count: 0, latestDate: doc.publishedDate };
    }
    stats[doc.jurisdiction].count++;
    if (doc.publishedDate > stats[doc.jurisdiction].latestDate) {
      stats[doc.jurisdiction].latestDate = doc.publishedDate;
    }
  }
  return Object.entries(stats).map(([j, v]) => ({ jurisdiction: j, ...v }));
}
