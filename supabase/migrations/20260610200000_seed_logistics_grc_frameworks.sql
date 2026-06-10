-- ============================================================
-- B9: Seed logistics GRC frameworks into the global catalogue
-- ISO 28000:2022 | TAPA FSR:2020 | TAPA TSR:2017
-- C-TPAT | AEO (UK) | ISO 9001:2015
-- All controls are policy_control type (no regex patterns)
-- ============================================================

DO $$ DECLARE
  iso28000_id  uuid;
  tapa_fsr_id  uuid;
  tapa_tsr_id  uuid;
  ctpat_id     uuid;
  aeo_id       uuid;
  iso9001_id   uuid;
BEGIN

-- ── 1. ISO 28000:2022 — Supply Chain Security Management ──────
INSERT INTO public.regulatory_frameworks
  (code, name, short_name, jurisdiction, regulatory_body, version, description, sort_order)
VALUES (
  'iso_28000',
  'ISO 28000:2022 — Supply Chain Security Management',
  'ISO 28000',
  'international',
  'International Organization for Standardization (ISO)',
  '2022',
  'Specifies requirements for a security management system, including aspects critical to supply chain security assurance. Applicable to all sizes and types of organisations in supply chains.',
  50
)
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name, version = EXCLUDED.version, is_active = true
RETURNING id INTO iso28000_id;

INSERT INTO public.framework_controls
  (framework_id, control_code, title, description, control_type, severity,
   regulation_cited, category, jurisdiction, pattern_source, pattern_flags,
   suggestion_template, trigger_patterns, required_phrases, platforms, audiences, is_active)
VALUES

(iso28000_id, 'ISO28000-4.1', 'Context of the Organisation',
 'Determine external and internal issues relevant to the organisation''s purpose that affect its ability to achieve supply chain security objectives. Consider routes, partners, and threat landscape.',
 'policy_control','Yellow','ISO 28000:2022 Clause 4.1',
 'context','international',null,'gi',
 'Document your organisation''s security context — supply chain corridors, key partners, external threat environment, and internal security capabilities. Upload the context analysis.',
 null,null,null,null,true),

(iso28000_id, 'ISO28000-4.2', 'Interested Parties',
 'Identify all stakeholders with an interest in the security management system and determine their relevant requirements, including customers, regulators, and customs authorities.',
 'policy_control','Yellow','ISO 28000:2022 Clause 4.2',
 'context','international',null,'gi',
 'Map your security stakeholders and document their requirements. Upload the stakeholder register covering customers, regulators, insurers, and customs authorities.',
 null,null,null,null,true),

(iso28000_id, 'ISO28000-5.1', 'Leadership and Security Commitment',
 'Top management must demonstrate commitment to the security management system by establishing policy, ensuring integration into business processes, and promoting security culture.',
 'policy_control','Yellow','ISO 28000:2022 Clause 5.1',
 'leadership','international',null,'gi',
 'Upload evidence of top management commitment: signed security policy, board minutes discussing security objectives, or management review records.',
 null,null,null,null,true),

(iso28000_id, 'ISO28000-6.1', 'Security Risk Assessment',
 'Establish, implement, and maintain a documented process to identify and assess security threats and risks across the supply chain. Determine risk acceptance criteria and treatment options.',
 'policy_control','Red','ISO 28000:2022 Clause 6.1',
 'risk_management','international',null,'gi',
 'Upload your supply chain security risk assessment, including threat identification, likelihood/impact ratings, and risk treatment decisions for each identified threat.',
 null,null,null,null,true),

(iso28000_id, 'ISO28000-6.2', 'Security Objectives',
 'Establish measurable security objectives at relevant functions and levels. Objectives must be consistent with the security policy, monitored, and communicated.',
 'policy_control','Yellow','ISO 28000:2022 Clause 6.2',
 'planning','international',null,'gi',
 'Document your security objectives, measurement method, responsible owners, and achievement timeframes. Upload the security objectives register.',
 null,null,null,null,true),

(iso28000_id, 'ISO28000-7.2', 'Security Competence and Training',
 'Determine necessary competences for personnel in security-sensitive roles, provide training or other actions to achieve competence, and retain documented evidence.',
 'policy_control','Yellow','ISO 28000:2022 Clause 7.2',
 'training','international',null,'gi',
 'Upload security training records, competence assessments, or training completion certificates for staff in security-sensitive roles.',
 null,null,null,null,true),

(iso28000_id, 'ISO28000-8.1', 'Operational Security Planning and Control',
 'Plan, implement, control, and review processes needed to meet security requirements. Document procedures for all security-relevant operations including cargo intake, storage, and dispatch.',
 'policy_control','Red','ISO 28000:2022 Clause 8.1',
 'operations','international',null,'gi',
 'Upload your security operations procedures covering cargo intake, secure storage, dispatch controls, and exception handling.',
 null,null,null,null,true),

(iso28000_id, 'ISO28000-8.2', 'Security Incident Management',
 'Establish and maintain documented procedures for identifying, responding to, and recovering from security incidents. Test procedures through exercises at planned intervals.',
 'policy_control','Red','ISO 28000:2022 Clause 8.2',
 'incidents','international',null,'gi',
 'Upload your security incident response procedure including escalation paths, regulatory notification requirements, and evidence of testing through exercises or drills.',
 null,null,null,null,true),

(iso28000_id, 'ISO28000-9.1', 'Security Performance Monitoring',
 'Monitor, measure, analyse, and evaluate the effectiveness of the security management system against defined objectives and performance indicators.',
 'policy_control','Yellow','ISO 28000:2022 Clause 9.1',
 'monitoring','international',null,'gi',
 'Upload your security KPI dashboard, internal audit reports, or management review minutes evidencing regular monitoring of security system performance.',
 null,null,null,null,true),

(iso28000_id, 'ISO28000-10.1', 'Continual Improvement',
 'Continually improve the suitability, adequacy, and effectiveness of the security management system through corrective actions, system reviews, and lessons learned from incidents.',
 'policy_control','Yellow','ISO 28000:2022 Clause 10.1',
 'improvement','international',null,'gi',
 'Upload evidence of security improvements made in the last 12 months: corrective action records, updated procedures, or management review outputs identifying improvement actions.',
 null,null,null,null,true);


-- ── 2. TAPA FSR:2020 — Freight Security Requirements (Facility) ─
INSERT INTO public.regulatory_frameworks
  (code, name, short_name, jurisdiction, regulatory_body, version, description, sort_order)
VALUES (
  'tapa_fsr',
  'TAPA FSR:2020 — Freight Security Requirements (Facility)',
  'TAPA FSR',
  'international',
  'Transported Asset Protection Association (TAPA)',
  '2020',
  'Defines minimum physical security standards for freight facilities handling high-value or at-risk cargo. Three certification levels (A, B, C) based on cargo risk profile.',
  52
)
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name, version = EXCLUDED.version, is_active = true
RETURNING id INTO tapa_fsr_id;

INSERT INTO public.framework_controls
  (framework_id, control_code, title, description, control_type, severity,
   regulation_cited, category, jurisdiction, pattern_source, pattern_flags,
   suggestion_template, trigger_patterns, required_phrases, platforms, audiences, is_active)
VALUES

(tapa_fsr_id, 'TAPA-FSR-1.1', 'Perimeter Security',
 'The facility must have a defined, continuous physical perimeter. Minimum 2.4 m fencing or equivalent barrier required. All perimeter entry points must be controlled and monitored at all times.',
 'policy_control','Red','TAPA FSR:2020 Section 1 — Perimeter Security',
 'physical_security','international',null,'gi',
 'Upload photographic evidence or a security audit report confirming perimeter fencing specification, controlled gates, and perimeter monitoring coverage.',
 null,null,null,null,true),

(tapa_fsr_id, 'TAPA-FSR-1.2', 'Access Control — Personnel and Vehicles',
 'All personnel, visitors, and vehicles must be positively identified before entry. A visitor management register must be maintained. Unescorted visitor access is prohibited in secure areas.',
 'policy_control','Red','TAPA FSR:2020 Section 2 — Access Control',
 'physical_security','international',null,'gi',
 'Upload your access control procedure and a sample visitor log or access management system screenshot showing identity verification and escort requirements in secure areas.',
 null,null,null,null,true),

(tapa_fsr_id, 'TAPA-FSR-1.3', 'CCTV System Requirements',
 'CCTV must cover all entry/exit points, loading bays, and secure storage areas. Minimum resolution 720p. Footage must be retained for a minimum of 31 days.',
 'policy_control','Red','TAPA FSR:2020 Section 3 — CCTV',
 'physical_security','international',null,'gi',
 'Upload your CCTV coverage plan, camera specification sheet, and evidence of 31-day retention configuration (e.g., system screenshot or maintenance record).',
 null,null,null,null,true),

(tapa_fsr_id, 'TAPA-FSR-1.4', 'Intruder Detection and Alarm',
 'An intruder detection system covering all access points and secure areas must be installed, tested monthly, and connected to a 24/7 monitoring centre or on-site security response.',
 'policy_control','Red','TAPA FSR:2020 Section 4 — Alarm Systems',
 'physical_security','international',null,'gi',
 'Upload your alarm system maintenance record, monitoring service agreement, and the most recent alarm test report.',
 null,null,null,null,true),

(tapa_fsr_id, 'TAPA-FSR-2.1', 'Secure Cargo Storage Area',
 'A designated, access-controlled area for high-value or at-risk cargo must exist, physically separate from general freight. Access restricted to authorised personnel only.',
 'policy_control','Red','TAPA FSR:2020 Section 6 — Secure Storage Area',
 'cargo_security','international',null,'gi',
 'Upload a site plan identifying the secure storage area and the access restriction controls in place (access card records, keypad logs, or dedicated CCTV coverage evidence).',
 null,null,null,null,true),

(tapa_fsr_id, 'TAPA-FSR-3.1', 'Security Personnel Requirements',
 'Security staff must be licensed, have completed background checks, and receive documented training relevant to the facility''s cargo risk profile before deployment.',
 'policy_control','Yellow','TAPA FSR:2020 Section 8 — Security Staff',
 'personnel','international',null,'gi',
 'Upload security staff vetting records, SIA licence numbers (where applicable), and training certificates for all security personnel assigned to the facility.',
 null,null,null,null,true),

(tapa_fsr_id, 'TAPA-FSR-3.2', 'Security Awareness Training — All Staff',
 'All facility staff must receive documented security awareness training covering: threat recognition, contraband identification, access procedures, and incident reporting obligations.',
 'policy_control','Yellow','TAPA FSR:2020 Section 9 — Staff Training',
 'training','international',null,'gi',
 'Upload security awareness training completion records for all staff, the training curriculum used, and evidence of annual refresher delivery.',
 null,null,null,null,true),

(tapa_fsr_id, 'TAPA-FSR-4.1', 'Security Incident Reporting Procedure',
 'A documented procedure must exist for recording, escalating, and reporting all security incidents. Incidents must be reported to TAPA and relevant law enforcement within defined timeframes.',
 'policy_control','Red','TAPA FSR:2020 Section 11 — Incident Reporting',
 'incidents','international',null,'gi',
 'Upload your security incident reporting procedure and evidence of its communication to all staff, including escalation contacts and reporting timelines.',
 null,null,null,null,true);


-- ── 3. TAPA TSR:2017 — Trucking Security Requirements ─────────
INSERT INTO public.regulatory_frameworks
  (code, name, short_name, jurisdiction, regulatory_body, version, description, sort_order)
VALUES (
  'tapa_tsr',
  'TAPA TSR:2017 — Trucking Security Requirements',
  'TAPA TSR',
  'international',
  'Transported Asset Protection Association (TAPA)',
  '2017',
  'Minimum security standards for in-transit cargo security during road transport. Covers vehicle security, driver procedures, route management, and handover controls for at-risk cargo.',
  54
)
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name, version = EXCLUDED.version, is_active = true
RETURNING id INTO tapa_tsr_id;

INSERT INTO public.framework_controls
  (framework_id, control_code, title, description, control_type, severity,
   regulation_cited, category, jurisdiction, pattern_source, pattern_flags,
   suggestion_template, trigger_patterns, required_phrases, platforms, audiences, is_active)
VALUES

(tapa_tsr_id, 'TAPA-TSR-1.1', 'Vehicle Security Equipment',
 'All vehicles transporting at-risk cargo must be equipped with real-time GPS tracking, an immobiliser, and a covert panic alarm operable by the driver without attracting attention.',
 'policy_control','Red','TAPA TSR:2017 Section 1 — Vehicle Equipment',
 'vehicle_security','international',null,'gi',
 'Upload your vehicle security equipment register showing GPS, immobiliser, and panic alarm fitment for each vehicle used to carry at-risk cargo.',
 null,null,null,null,true),

(tapa_tsr_id, 'TAPA-TSR-1.2', 'Load and Cargo Security',
 'All loads must be secured against unauthorised access using high-security seals. Seal numbers must be recorded at loading, checked at delivery, and any discrepancy reported immediately.',
 'policy_control','Red','TAPA TSR:2017 Section 2 — Load Security',
 'cargo_security','international',null,'gi',
 'Upload your load security procedure and a sample seal log showing seal numbers recorded at point of loading and verified at delivery.',
 null,null,null,null,true),

(tapa_tsr_id, 'TAPA-TSR-2.1', 'Driver Vetting and Background Checks',
 'All drivers carrying at-risk cargo must have passed a documented background check before first assignment. Checks must be repeated at least every 2 years.',
 'policy_control','Red','TAPA TSR:2017 Section 3 — Driver Vetting',
 'personnel','international',null,'gi',
 'Upload driver background check records (DBS certificates or equivalent) for all drivers handling at-risk cargo, confirming checks are current.',
 null,null,null,null,true),

(tapa_tsr_id, 'TAPA-TSR-2.2', 'Driver Security Training',
 'Drivers must receive documented training covering: security awareness, load and seal security, hijack and robbery response, and prohibited rest-stop behaviour.',
 'policy_control','Yellow','TAPA TSR:2017 Section 4 — Driver Training',
 'training','international',null,'gi',
 'Upload driver security training completion records and the training curriculum confirming all required topics are covered.',
 null,null,null,null,true),

(tapa_tsr_id, 'TAPA-TSR-3.1', 'Route Planning and Risk Assessment',
 'Routes for at-risk cargo must be pre-planned and risk assessed. High-risk segments must be documented and alternative routes identified. Rest stops must be pre-approved secure locations.',
 'policy_control','Red','TAPA TSR:2017 Section 5 — Route Planning',
 'operations','international',null,'gi',
 'Upload your route risk assessment procedure and evidence of pre-planned routes for your key at-risk cargo corridors, including approved rest stop locations.',
 null,null,null,null,true),

(tapa_tsr_id, 'TAPA-TSR-3.2', 'Driver Communication and Check-In',
 'A driver check-in procedure must be in place during all at-risk transits. Drivers must report at defined intervals; control room must initiate escalation if a check-in is missed.',
 'policy_control','Yellow','TAPA TSR:2017 Section 6 — Driver Communication',
 'operations','international',null,'gi',
 'Upload your driver check-in procedure including check-in intervals, escalation triggers, and evidence of GPS tracking monitoring during transit.',
 null,null,null,null,true),

(tapa_tsr_id, 'TAPA-TSR-4.1', 'Cargo Handover Procedures',
 'Documented handover procedures must define who can accept cargo on behalf of the consignee. Every handover must be recorded with recipient name, signature, and timestamp.',
 'policy_control','Yellow','TAPA TSR:2017 Section 7 — Handover',
 'operations','international',null,'gi',
 'Upload your cargo handover procedure and a sample proof of delivery document showing the required fields: recipient name, signature, and delivery time.',
 null,null,null,null,true),

(tapa_tsr_id, 'TAPA-TSR-5.1', 'Subcontractor Security Requirements',
 'Any subcontracted carrier used for at-risk cargo must meet equivalent TAPA TSR security standards. Due diligence must be conducted and documented before engagement.',
 'policy_control','Red','TAPA TSR:2017 Section 9 — Subcontractors',
 'third_party','international',null,'gi',
 'Upload your carrier due diligence procedure and a completed due diligence record for at least one subcontracted carrier used for at-risk cargo shipments.',
 null,null,null,null,true);


-- ── 4. C-TPAT — Customs-Trade Partnership Against Terrorism ───
INSERT INTO public.regulatory_frameworks
  (code, name, short_name, jurisdiction, regulatory_body, version, description, sort_order)
VALUES (
  'c_tpat',
  'C-TPAT — Customs-Trade Partnership Against Terrorism',
  'C-TPAT',
  'usa',
  'US Customs and Border Protection (CBP)',
  '2020 Minimum Security Criteria',
  'Voluntary US CBP programme for importers, carriers, and freight forwarders. Partners commit to improving supply chain security in exchange for expedited US customs processing and reduced inspection rates.',
  56
)
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name, version = EXCLUDED.version, is_active = true
RETURNING id INTO ctpat_id;

INSERT INTO public.framework_controls
  (framework_id, control_code, title, description, control_type, severity,
   regulation_cited, category, jurisdiction, pattern_source, pattern_flags,
   suggestion_template, trigger_patterns, required_phrases, platforms, audiences, is_active)
VALUES

(ctpat_id, 'CTPAT-1.1', 'Written Security Procedures',
 'C-TPAT partners must have documented, implemented, and communicated security procedures covering all applicable Minimum Security Criteria categories.',
 'policy_control','Red','C-TPAT Minimum Security Criteria 2020 — Security Management',
 'documentation','usa',null,'gi',
 'Upload your C-TPAT security procedures manual or equivalent documentation covering all applicable minimum security criteria for your business type.',
 null,null,null,null,true),

(ctpat_id, 'CTPAT-2.1', 'Physical Access Controls',
 'Establish written procedures controlling access to shipping areas, loading docks, and cargo handling areas. Only authorised employees allowed in cargo areas; visitor escorts required.',
 'policy_control','Red','C-TPAT MSC 2020 — Physical Security',
 'physical_security','usa',null,'gi',
 'Upload your physical access control procedure for cargo areas, including visitor management and evidence of access restriction (access logs or badge system records).',
 null,null,null,null,true),

(ctpat_id, 'CTPAT-2.2', 'Conveyance and Container Inspection',
 'Implement a documented procedure for inspecting containers and conveyances prior to loading. A seven-point inspection must be completed and recorded for all outbound containers.',
 'policy_control','Red','C-TPAT MSC 2020 — Conveyance Security',
 'cargo_security','usa',null,'gi',
 'Upload your container inspection procedure (seven-point inspection checklist) and a sample completed inspection record signed by the inspecting employee.',
 null,null,null,null,true),

(ctpat_id, 'CTPAT-3.1', 'Personnel Security — Pre-Employment Screening',
 'Conduct pre-employment background checks on all employees with access to cargo areas, including criminal history screening. Establish a process for periodic rescreening.',
 'policy_control','Red','C-TPAT MSC 2020 — Personnel Security',
 'personnel','usa',null,'gi',
 'Upload your pre-employment screening policy and evidence of background check completion for a sample of current employees in cargo-sensitive roles.',
 null,null,null,null,true),

(ctpat_id, 'CTPAT-3.2', 'Security Awareness Training',
 'All employees must receive documented security awareness training covering: smuggling methods, how to report anomalies, and their role in maintaining supply chain security.',
 'policy_control','Yellow','C-TPAT MSC 2020 — Security Training',
 'training','usa',null,'gi',
 'Upload security awareness training records for all relevant staff and the training curriculum used, confirming smuggling awareness is included.',
 null,null,null,null,true),

(ctpat_id, 'CTPAT-4.1', 'Business Partner Security Requirements',
 'Written security requirements must be communicated to and acknowledged by all supply chain partners. New partners must be screened for compliance before use.',
 'policy_control','Red','C-TPAT MSC 2020 — Business Partner Requirements',
 'third_party','usa',null,'gi',
 'Upload your supply chain partner security requirements document and evidence of partner acknowledgement (signed security agreements or returned questionnaires).',
 null,null,null,null,true),

(ctpat_id, 'CTPAT-5.1', 'Information Technology Security',
 'Protect IT systems used in trade data management. Implement password policies, access controls, and procedures preventing unauthorised access to shipping and customs data.',
 'policy_control','Yellow','C-TPAT MSC 2020 — Information Technology Security',
 'it_security','usa',null,'gi',
 'Upload your IT security policy covering trade data systems, password management procedures, and access control configuration evidence.',
 null,null,null,null,true),

(ctpat_id, 'CTPAT-5.2', 'Document and Cargo Integrity',
 'Shipping documents must be protected against falsification. Procedures must ensure cargo matches documentation and that unauthorised alterations are detected and reported.',
 'policy_control','Red','C-TPAT MSC 2020 — Document Security',
 'documentation','usa',null,'gi',
 'Upload your document integrity procedure showing how shipping documentation is controlled, verified against cargo, and protected from unauthorised alteration.',
 null,null,null,null,true),

(ctpat_id, 'CTPAT-6.1', 'Incident Reporting to CBP',
 'Security breaches, anomalies, or discovered contraband must be reported to US CBP through defined channels. Employees must understand their reporting obligations.',
 'policy_control','Red','C-TPAT MSC 2020 — Incident Reporting',
 'incidents','usa',null,'gi',
 'Upload your security incident reporting procedure for CBP, including staff training records confirming employees understand their reporting obligations.',
 null,null,null,null,true);


-- ── 5. AEO — Authorised Economic Operator (UK) ────────────────
INSERT INTO public.regulatory_frameworks
  (code, name, short_name, jurisdiction, regulatory_body, version, description, sort_order)
VALUES (
  'aeo_uk',
  'AEO — Authorised Economic Operator (UK)',
  'AEO',
  'uk',
  'HM Revenue & Customs (HMRC)',
  'UK post-Brexit',
  'UK customs status recognising reliable, compliant operators in the international supply chain. AEO-C (customs simplification) and AEO-S (security and safety) statuses enable faster clearance and mutual recognition with trading partners.',
  58
)
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name, version = EXCLUDED.version, is_active = true
RETURNING id INTO aeo_id;

INSERT INTO public.framework_controls
  (framework_id, control_code, title, description, control_type, severity,
   regulation_cited, category, jurisdiction, pattern_source, pattern_flags,
   suggestion_template, trigger_patterns, required_phrases, platforms, audiences, is_active)
VALUES

(aeo_id, 'AEO-CUS-1.1', 'Customs Compliance Track Record',
 'Demonstrate a history of compliance with customs requirements. No serious or repeated infringements of customs rules or relevant criminal offences in the past 3 years.',
 'policy_control','Red','UK AEO Guidance — Criterion 1: Customs Compliance',
 'compliance','uk',null,'gi',
 'Upload your customs compliance self-assessment and any HMRC compliance check outcomes from the last 3 years demonstrating a clean compliance record.',
 null,null,null,null,true),

(aeo_id, 'AEO-CUS-1.2', 'Import/Export Declaration Procedures',
 'Maintain documented, consistent procedures for all import/export customs declarations. All declarations must be accurate, complete, and submitted on time.',
 'policy_control','Red','UK AEO Guidance — Criterion 1: Customs Procedures',
 'compliance','uk',null,'gi',
 'Upload your customs declaration procedure, including how declarations are prepared, verified, and submitted, plus a sample declaration to evidence consistency.',
 null,null,null,null,true),

(aeo_id, 'AEO-CUS-1.3', 'Record Keeping — 4-Year Minimum Retention',
 'All customs records (declarations, invoices, transport documents) must be retained for a minimum of 4 years and be accessible for HMRC inspection within a reasonable timeframe.',
 'policy_control','Yellow','UK AEO Guidance — Record-Keeping Criterion',
 'documentation','uk',null,'gi',
 'Upload your records retention policy confirming 4-year minimum retention for customs records and evidence of your document management or storage arrangement.',
 null,null,null,null,true),

(aeo_id, 'AEO-SEC-1.1', 'Security Risk Assessment',
 'Conduct and document a security risk assessment covering all aspects of supply chain operations: premises, cargo, personnel, and IT systems.',
 'policy_control','Red','UK AEO Guidance — Security and Safety Criterion',
 'risk_management','uk',null,'gi',
 'Upload your AEO security risk assessment covering premises, cargo, personnel, and IT risks, reviewed within the last 12 months.',
 null,null,null,null,true),

(aeo_id, 'AEO-SEC-1.2', 'Cargo Security and Integrity Procedures',
 'Procedures must ensure that cargo is not tampered with during loading, storage, and transit. Sealing, inspection, and record-keeping requirements must be documented and followed.',
 'policy_control','Red','UK AEO Guidance — Cargo Security',
 'cargo_security','uk',null,'gi',
 'Upload your cargo integrity procedure including sealing records, inspection checklists, and evidence of implementation in operations.',
 null,null,null,null,true),

(aeo_id, 'AEO-SEC-2.1', 'Staff Reliability Vetting',
 'All staff with access to customs-sensitive operations must be subject to reliability vetting appropriate to the role and applicable legal requirements.',
 'policy_control','Yellow','UK AEO Guidance — Employee Vetting',
 'personnel','uk',null,'gi',
 'Upload your staff vetting procedure and evidence of background checks for employees in customs-sensitive roles.',
 null,null,null,null,true),

(aeo_id, 'AEO-SEC-2.2', 'Business Partner Security Requirements',
 'Contractual security requirements must be communicated to supply chain partners. Partners must demonstrate equivalent security standards or be subject to ongoing monitoring.',
 'policy_control','Yellow','UK AEO Guidance — Business Partner Security',
 'third_party','uk',null,'gi',
 'Upload your partner security requirements documentation and a sample contractual security clause or completed partner security questionnaire.',
 null,null,null,null,true),

(aeo_id, 'AEO-FIN-1.1', 'Financial Solvency',
 'Demonstrate financial solvency sufficient to meet obligations over the past 3 years. No insolvency proceedings or history of inability to meet financial commitments.',
 'policy_control','Yellow','UK AEO Guidance — Criterion 2: Financial Solvency',
 'finance','uk',null,'gi',
 'Upload your most recent audited accounts or financial statements demonstrating solvency and the ability to meet ongoing financial obligations.',
 null,null,null,null,true),

(aeo_id, 'AEO-SYS-1.1', 'IT Security for Trade Data',
 'Implement documented IT security controls protecting systems that hold or process customs declarations, trade data, and supply chain partner information.',
 'policy_control','Yellow','UK AEO Guidance — IT Security',
 'it_security','uk',null,'gi',
 'Upload your IT security policy for trade systems, including access control, password management, and evidence that controls are implemented.',
 null,null,null,null,true);


-- ── 6. ISO 9001:2015 — Quality Management Systems ─────────────
INSERT INTO public.regulatory_frameworks
  (code, name, short_name, jurisdiction, regulatory_body, version, description, sort_order)
VALUES (
  'iso_9001',
  'ISO 9001:2015 — Quality Management Systems',
  'ISO 9001',
  'international',
  'International Organization for Standardization (ISO)',
  '2015',
  'The world''s most widely used quality management standard. Applicable to any organisation regardless of size or sector. Specifies requirements for a QMS to consistently deliver products and services that meet customer and regulatory requirements.',
  60
)
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name, version = EXCLUDED.version, is_active = true
RETURNING id INTO iso9001_id;

INSERT INTO public.framework_controls
  (framework_id, control_code, title, description, control_type, severity,
   regulation_cited, category, jurisdiction, pattern_source, pattern_flags,
   suggestion_template, trigger_patterns, required_phrases, platforms, audiences, is_active)
VALUES

(iso9001_id, 'ISO9001-4.1', 'Understanding the Organisation and Its Context',
 'Determine external and internal issues relevant to the organisation''s purpose and its ability to achieve intended outcomes of the quality management system.',
 'policy_control','Yellow','ISO 9001:2015 Clause 4.1',
 'context','international',null,'gi',
 'Upload your organisational context analysis covering internal factors (capabilities, culture, performance) and external factors (market, regulatory, competitive environment).',
 null,null,null,null,true),

(iso9001_id, 'ISO9001-5.1', 'Leadership and Quality Commitment',
 'Top management must demonstrate leadership and commitment to the QMS. The quality policy must be compatible with the organisation''s strategic direction and communicated throughout.',
 'policy_control','Yellow','ISO 9001:2015 Clause 5.1',
 'leadership','international',null,'gi',
 'Upload the signed quality policy and evidence of management review meetings where quality performance was reviewed at board or senior management level.',
 null,null,null,null,true),

(iso9001_id, 'ISO9001-6.1', 'Risk-Based Thinking',
 'Determine risks and opportunities relevant to the QMS and take proportionate actions to address them. Actions must be integrated into QMS processes and evaluated for effectiveness.',
 'policy_control','Yellow','ISO 9001:2015 Clause 6.1',
 'risk_management','international',null,'gi',
 'Upload your quality risk register showing identified risks, likelihood/impact ratings, and planned or implemented treatment actions.',
 null,null,null,null,true),

(iso9001_id, 'ISO9001-7.2', 'Competence Management',
 'Determine the necessary competences for persons whose work affects quality performance, provide training or other actions to achieve competence, and retain documented evidence.',
 'policy_control','Yellow','ISO 9001:2015 Clause 7.2',
 'training','international',null,'gi',
 'Upload your competence framework or job descriptions showing required competences, plus training records evidencing how identified gaps are addressed.',
 null,null,null,null,true),

(iso9001_id, 'ISO9001-7.5', 'Documented Information Control',
 'The QMS must include documented information required by the standard and necessary for its effectiveness. Controls must ensure availability, suitability, and protection from inappropriate use.',
 'policy_control','Yellow','ISO 9001:2015 Clause 7.5',
 'documentation','international',null,'gi',
 'Upload your document control procedure and a document register listing current controlled QMS documents with issue status.',
 null,null,null,null,true),

(iso9001_id, 'ISO9001-8.7', 'Control of Nonconforming Outputs',
 'Ensure outputs not conforming to requirements are identified and controlled to prevent unintended use or delivery. Corrective action must be taken and recorded with effectiveness verification.',
 'policy_control','Red','ISO 9001:2015 Clause 8.7',
 'operations','international',null,'gi',
 'Upload your nonconformance procedure and a sample nonconformance record showing identification, disposition decision, corrective action taken, and effectiveness verification.',
 null,null,null,null,true),

(iso9001_id, 'ISO9001-9.1', 'Performance Monitoring and Measurement',
 'Monitor, measure, analyse, and evaluate quality performance. Define what is measured, measurement methods, when results are analysed, and when they are reported to management.',
 'policy_control','Yellow','ISO 9001:2015 Clause 9.1',
 'monitoring','international',null,'gi',
 'Upload your quality KPI report, customer satisfaction survey results, or on-time delivery performance data for the most recent review period.',
 null,null,null,null,true),

(iso9001_id, 'ISO9001-9.3', 'Management Review',
 'Top management must review the QMS at planned intervals to ensure its continuing suitability, adequacy, effectiveness, and alignment with strategic direction. Inputs and outputs must be documented.',
 'policy_control','Yellow','ISO 9001:2015 Clause 9.3',
 'leadership','international',null,'gi',
 'Upload minutes or an action log from your most recent management review meeting, confirming all clause 9.3 input topics were addressed.',
 null,null,null,null,true),

(iso9001_id, 'ISO9001-10.2', 'Corrective Action',
 'React to nonconformities, control and correct them, and address consequences. Determine root causes and implement actions to prevent recurrence. Verify effectiveness of corrective actions.',
 'policy_control','Yellow','ISO 9001:2015 Clause 10.2',
 'improvement','international',null,'gi',
 'Upload a completed corrective action record showing the nonconformity, root cause analysis method, corrective action taken, and verification of effectiveness.',
 null,null,null,null,true);

END $$;
