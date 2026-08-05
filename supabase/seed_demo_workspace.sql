-- ============================================================
-- Demo Workspace Seed — HealthBridge HMO
-- ============================================================
-- Idempotent: safe to run multiple times.
-- Transactional: any failure rolls back the entire script.
-- Do NOT run against production. Target: demo / staging project.
--
-- Prerequisites (must exist in auth.users before running):
--   Compliance Officer  b52638cc-7dd3-4af1-9c03-05cb7ecca68c
--   Legal Reviewer      fd19d39d-899e-4ce2-a525-ee60b68d1ad4
--
-- Tables touched (in FK-safe order):
--   companies, profiles (UPDATE only), departments,
--   company_members, content_submissions, compliance_reports,
--   ai_risk_assessments, risks, calendar_events
--
-- Tables intentionally NOT touched:
--   audit_logs (let those generate from live actions)
-- ============================================================

BEGIN;

-- ── Guard: abort early if either demo user is missing ────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = 'b52638cc-7dd3-4af1-9c03-05cb7ecca68c'
  ) THEN
    RAISE EXCEPTION
      'Compliance Officer account (b52638cc) not found in auth.users. '
      'Create it via the signup UI before running this script.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = 'fd19d39d-899e-4ce2-a525-ee60b68d1ad4'
  ) THEN
    RAISE EXCEPTION
      'Legal Reviewer account (fd19d39d) not found in auth.users. '
      'Create it via the signup UI and accept the invite before running this script.';
  END IF;
END $$;


-- ── 1. Company ───────────────────────────────────────────────
INSERT INTO companies (id, name)
VALUES ('863e9f8b-2a8e-4927-9fc3-42c00b7a895d', 'HealthBridge HMO')
ON CONFLICT (id) DO NOTHING;


-- ── 2. Profiles — ensure company_id is correct ───────────────
-- Both users signed up via the UI; we UPDATE to guarantee
-- company_id is set rather than INSERT (which risks a NOT NULL
-- violation on email if the row already exists).
UPDATE profiles
SET company_id = '863e9f8b-2a8e-4927-9fc3-42c00b7a895d'
WHERE id IN (
  'b52638cc-7dd3-4af1-9c03-05cb7ecca68c',
  'fd19d39d-899e-4ce2-a525-ee60b68d1ad4'
);


-- ── 3. Departments ───────────────────────────────────────────
-- Must come before company_members (FK: company_members.department_id)
INSERT INTO departments (id, company_id, name)
VALUES
  (
    'a0000001-0000-0000-0000-000000000001',
    '863e9f8b-2a8e-4927-9fc3-42c00b7a895d',
    'Marketing & Communications'
  ),
  (
    'a0000001-0000-0000-0000-000000000002',
    '863e9f8b-2a8e-4927-9fc3-42c00b7a895d',
    'Medical Affairs'
  )
ON CONFLICT (id) DO NOTHING;


-- ── 4. Company Members ───────────────────────────────────────
-- Conflict target is (company_id, user_id) — the natural unique key.
INSERT INTO company_members (id, company_id, user_id, role, status, joined_at)
VALUES
  (
    'a0000002-0000-0000-0000-000000000001',
    '863e9f8b-2a8e-4927-9fc3-42c00b7a895d',
    'b52638cc-7dd3-4af1-9c03-05cb7ecca68c',
    'owner'::company_role,
    'active',
    now() - interval '14 days'
  ),
  (
    'a0000002-0000-0000-0000-000000000002',
    '863e9f8b-2a8e-4927-9fc3-42c00b7a895d',
    'fd19d39d-899e-4ce2-a525-ee60b68d1ad4',
    'legal'::company_role,
    'active',
    now() - interval '7 days'
  )
ON CONFLICT (company_id, user_id) DO NOTHING;


-- ── 5. Content Submissions ───────────────────────────────────
-- All five are owned by the Compliance Officer (user_id scoping).
-- company_id is also populated for dashboard RPCs.
-- signoff_status values confirmed from migration 20260220004700:
--   draft | analyzed | awaiting_legal | in_review |
--   signed_off | amend_requested | rejected | published

INSERT INTO content_submissions (
  id,
  user_id,
  company_id,
  title,
  content_text,
  file_name,
  file_type,
  platform,
  content_topic,
  target_audience,
  status,
  priority,
  signoff_status,
  jurisdiction,
  department,
  ai_risk_score,
  scheduled_date,
  submitted_for_legal_at,
  legal_decided_at,
  published_at,
  created_at,
  updated_at
)
VALUES

-- ── Sub 1: Prohibited guarantee claim — critical, draft ──────
(
  'b0000001-0000-0000-0000-000000000001',
  'b52638cc-7dd3-4af1-9c03-05cb7ecca68c',
  '863e9f8b-2a8e-4927-9fc3-42c00b7a895d',
  'Total Health Cover — Zero Rejection Guarantee',
  'Experience complete peace of mind with HealthBridge HMO. '
  'Our Total Health Cover plan gives you a Zero Rejection Guarantee — '
  'every legitimate claim is approved, 100% covered with no hidden '
  'conditions. Join 50,000 members who enjoy guaranteed access to '
  '500+ hospitals. No pre-authorisation hassles. No claim denials. Guaranteed.',
  'total_health_cover_ig.txt',   '.txt',
  'instagram',                   'Health Insurance Plans',
  'general_public',
  'flagged',   'urgent',   'draft',
  'nigeria',   'Marketing & Communications',
  87,
  NULL,
  NULL,  NULL,  NULL,
  now() - interval '2 days',
  now() - interval '2 days'
),

-- ── Sub 2: Diabetes management — medium risk, awaiting legal ─
(
  'b0000001-0000-0000-0000-000000000002',
  'b52638cc-7dd3-4af1-9c03-05cb7ecca68c',
  '863e9f8b-2a8e-4927-9fc3-42c00b7a895d',
  'Managing Type 2 Diabetes with Your HMO Plan',
  'HealthBridge HMO partners with leading endocrinologists to deliver '
  'a comprehensive diabetes management programme. Our Diabetes Care '
  'Pathway covers specialist consultations, HbA1c monitoring, and '
  'prescribed medication — all on your standard plan. Enrollees have '
  'shown significant improvements in blood sugar control within 90 days. '
  'Talk to your primary care physician about enrolling today.',
  'diabetes_management_web.docx', '.docx',
  'website',                      'Chronic Disease Management',
  'patients',
  'pending',   'scheduled',   'awaiting_legal',
  'nigeria',   'Medical Affairs',
  43,
  '2026-06-10',
  now() - interval '3 days',  NULL,  NULL,
  now() - interval '5 days',
  now() - interval '3 days'
),

-- ── Sub 3: Network expansion — low risk, approved + published ─
(
  'b0000001-0000-0000-0000-000000000003',
  'b52638cc-7dd3-4af1-9c03-05cb7ecca68c',
  '863e9f8b-2a8e-4927-9fc3-42c00b7a895d',
  'Introducing Our Extended Hospital Network: 500+ Partner Facilities',
  'HealthBridge HMO is proud to announce the expansion of our provider '
  'network to over 500 accredited hospitals, clinics, and diagnostic '
  'centres across Nigeria. From Lagos Island to Kano, our members now '
  'have greater choice and closer access to quality healthcare. Visit '
  'our website to find a facility near you.',
  'network_expansion_li.pdf',  '.pdf',
  'linkedin',                  'Network Expansion',
  'general_public',
  'approved',  'low',  'signed_off',
  'nigeria',   'Marketing & Communications',
  12,
  '2026-05-21',
  now() - interval '12 days',
  now() - interval '10 days',
  now() - interval '9 days',
  now() - interval '14 days',
  now() - interval '9 days'
),

-- ── Sub 4: Annual Member Benefits Statement — high, awaiting legal
-- Adjusted per brief: NHIA mandatory disclosure gaps
(
  'b0000001-0000-0000-0000-000000000004',
  'b52638cc-7dd3-4af1-9c03-05cb7ecca68c',
  '863e9f8b-2a8e-4927-9fc3-42c00b7a895d',
  'Annual Member Benefits Statement — 2026 Coverage Guide',
  'Your 2026 HealthBridge HMO Benefits Guide. This document outlines '
  'your healthcare entitlements for the coverage year. Inpatient care: '
  'covered. Outpatient consultations: covered up to 12 visits annually. '
  'Maternity: covered for normal and caesarean delivery. Dental: not '
  'included in standard plan. Optical: corrective lenses covered once '
  'per year. Emergency evacuation: covered domestically.',
  'member_benefits_2026.pdf',  '.pdf',
  'print',                     'Member Benefits',
  'patients',
  'pending',  'urgent',  'awaiting_legal',
  'nigeria',  'Medical Affairs',
  71,
  '2026-06-01',
  now() - interval '1 day',  NULL,  NULL,
  now() - interval '3 days',
  now() - interval '1 day'
),

-- ── Sub 5: Wellness challenge — medium risk, implied therapeutic claim
(
  'b0000001-0000-0000-0000-000000000005',
  'b52638cc-7dd3-4af1-9c03-05cb7ecca68c',
  '863e9f8b-2a8e-4927-9fc3-42c00b7a895d',
  'Walk More, Live Better — 10,000 Steps Challenge',
  'Did you know that walking 10,000 steps daily can reverse the effects '
  'of lifestyle diseases? Join the HealthBridge 10K Steps Challenge this '
  'June. Our clinically-backed programme has helped thousands of members '
  'improve cardiovascular health, reduce blood pressure, and manage weight. '
  'Sign up through the member portal and track your progress with our '
  'digital health dashboard.',
  'steps_challenge_x.txt',  '.txt',
  'x',                      'Wellness & Prevention',
  'general_public',
  'flagged',  'low',  'draft',
  'nigeria',  'Marketing & Communications',
  52,
  NULL,
  NULL,  NULL,  NULL,
  now() - interval '1 day',
  now() - interval '1 day'
)

ON CONFLICT (id) DO NOTHING;


-- ── 6. Compliance Reports ────────────────────────────────────
-- compliance_reports has no company_id column; it is scoped
-- through content_id → content_submissions.
-- All JSONB arrays use double-quoted strings — no apostrophes
-- inside values to avoid SQL escaping issues.

INSERT INTO compliance_reports (
  id,
  content_id,
  regulation_version,
  overall_risk,
  flagged_phrases,
  violated_regulations,
  suggested_rewrites,
  issues,
  strictness_level,
  jurisdiction,
  analysis_timestamp,
  created_at
)
VALUES

-- Report 1: critical — Instagram guarantee claim
(
  'c0000001-0000-0000-0000-000000000001',
  'b0000001-0000-0000-0000-000000000001',
  'NAFDAC-ADV-2023-v2.1',
  'critical',
  '[
    {"phrase": "Zero Rejection Guarantee",
     "reason": "Absolute guarantee claim — prohibited under NAFDAC Advertising Code Article 14",
     "severity": "critical"},
    {"phrase": "100% covered with no hidden conditions",
     "reason": "Unqualified absolute coverage claim violates NHIA Consumer Protection Guidelines Section 8.1",
     "severity": "high"},
    {"phrase": "No claim denials. Guaranteed.",
     "reason": "Guarantee language for insurance outcomes is categorically prohibited",
     "severity": "high"}
  ]'::jsonb,
  '[
    {"regulation": "NAFDAC Advertising Code",
     "section": "Article 14",
     "description": "Prohibition of guaranteed outcome claims in health insurance advertising"},
    {"regulation": "NHIA Consumer Protection Guidelines",
     "section": "Section 8.1",
     "description": "Insurers must not make unqualified or absolute claims about coverage outcomes"}
  ]'::jsonb,
  '[
    {"original": "Zero Rejection Guarantee",
     "suggestion": "Eligible claims are assessed within 48 hours, subject to your plan terms and conditions"},
    {"original": "100% covered with no hidden conditions",
     "suggestion": "Coverage is subject to plan limits and exclusions outlined in your policy document"},
    {"original": "No claim denials. Guaranteed.",
     "suggestion": "Remove entirely — no guarantee language is permissible in Nigerian health insurance advertising"}
  ]'::jsonb,
  '[
    {"type": "prohibited_guarantee_claim",
     "severity": "critical",
     "phrase": "Zero Rejection Guarantee",
     "rule_id": "nafdac_guarantee_prohibition",
     "regulation": "NAFDAC Advertising Code Art. 14"},
    {"type": "absolute_coverage_claim",
     "severity": "high",
     "phrase": "100% covered with no hidden conditions",
     "rule_id": "absolute_coverage_claim",
     "regulation": "NHIA Consumer Protection Guidelines Section 8.1"},
    {"type": "prohibited_guarantee_claim",
     "severity": "high",
     "phrase": "No claim denials. Guaranteed.",
     "rule_id": "nafdac_guarantee_prohibition",
     "regulation": "NAFDAC Advertising Code Art. 14"}
  ]'::jsonb,
  'very_strict',
  'nigeria',
  now() - interval '2 days',
  now() - interval '2 days'
),

-- Report 2: medium — diabetes website
(
  'c0000001-0000-0000-0000-000000000002',
  'b0000001-0000-0000-0000-000000000002',
  'NAFDAC-ADV-2023-v2.1',
  'medium',
  '[
    {"phrase": "significant improvements in blood sugar control within 90 days",
     "reason": "Efficacy claim with specific timeframe requires a cited clinical reference",
     "severity": "medium"}
  ]'::jsonb,
  '[
    {"regulation": "NAFDAC HCP Advertising Guidelines",
     "section": "Section 7.2",
     "description": "Efficacy claims must be substantiated with referenced clinical evidence"},
    {"regulation": "WHO Ethical Criteria for Medicinal Drug Promotion",
     "section": "Section 5",
     "description": "Promotional material must accurately reflect current scientific knowledge"}
  ]'::jsonb,
  '[
    {"original": "significant improvements in blood sugar control within 90 days",
     "suggestion": "Add citation: Based on internal programme data 2024. Individual results may vary. Consult your physician."}
  ]'::jsonb,
  '[
    {"type": "unsubstantiated_efficacy_claim",
     "severity": "medium",
     "phrase": "significant improvements in blood sugar control within 90 days",
     "rule_id": "efficacy_substantiation_required",
     "regulation": "NAFDAC HCP Advertising Guidelines Section 7.2"}
  ]'::jsonb,
  'strict',
  'nigeria',
  now() - interval '3 days',
  now() - interval '3 days'
),

-- Report 3: low — network announcement (clean)
(
  'c0000001-0000-0000-0000-000000000003',
  'b0000001-0000-0000-0000-000000000003',
  'NAFDAC-ADV-2023-v2.1',
  'low',
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  'moderate',
  'nigeria',
  now() - interval '14 days',
  now() - interval '14 days'
),

-- Report 4: high — annual benefits statement, NHIA disclosure gaps
(
  'c0000001-0000-0000-0000-000000000004',
  'b0000001-0000-0000-0000-000000000004',
  'NHIA-2023-v1.4',
  'high',
  '[
    {"phrase": "Inpatient care: covered",
     "reason": "Coverage statement without annual monetary cap or bed-day limit — mandatory under NHIA Section 12.3",
     "severity": "high"},
    {"phrase": "Outpatient consultations: covered up to 12 visits annually",
     "reason": "No co-payment amount or facility tier restriction disclosed as required under NHIA Section 12.3",
     "severity": "medium"},
    {"phrase": "Emergency evacuation: covered domestically",
     "reason": "Maximum benefit amount for evacuation not stated — omission of material coverage information",
     "severity": "medium"}
  ]'::jsonb,
  '[
    {"regulation": "NHIA Consumer Protection Guidelines",
     "section": "Section 12.3",
     "description": "Mandatory disclosure: coverage caps, annual benefit limits, co-payment structure, pre-existing condition waiting periods, and exclusion list must appear in all member-facing benefits documents"},
    {"regulation": "NHIA Operational Standards",
     "section": "Section 6.1",
     "description": "HMO benefit statements must include the NHIA-prescribed exclusion schedule by name"},
    {"regulation": "NAFDAC Advertising Code",
     "section": "Article 9",
     "description": "Consumer materials must not omit material information that would affect a consumer understanding of the product"}
  ]'::jsonb,
  '[
    {"original": "Inpatient care: covered",
     "suggestion": "Inpatient care: covered up to the annual inpatient limit specified in your Schedule of Benefits. Co-payment and bed-day limits apply. See Schedule for details."},
    {"original": "Outpatient consultations: covered up to 12 visits annually",
     "suggestion": "Outpatient consultations: up to 12 visits per year. Co-payment applies at each visit. Specialist access requires GP referral. Tier restrictions apply."},
    {"original": "(missing exclusion section)",
     "suggestion": "Add mandatory NHIA Exclusion Schedule section: cosmetic procedures, experimental treatments, self-inflicted injuries, and conditions arising from criminal activity are excluded."},
    {"original": "Emergency evacuation: covered domestically",
     "suggestion": "Domestic emergency evacuation: covered up to [maximum benefit amount]. Air ambulance subject to prior authorisation except in life-threatening emergencies."}
  ]'::jsonb,
  '[
    {"type": "missing_mandatory_disclosure",
     "severity": "high",
     "phrase": "Inpatient care: covered",
     "rule_id": "nhia_coverage_cap_disclosure",
     "regulation": "NHIA Consumer Protection Guidelines Section 12.3"},
    {"type": "missing_mandatory_disclosure",
     "severity": "high",
     "phrase": "(no exclusion schedule present in document)",
     "rule_id": "nhia_exclusion_schedule_required",
     "regulation": "NHIA Operational Standards Section 6.1"},
    {"type": "incomplete_disclosure",
     "severity": "medium",
     "phrase": "Outpatient consultations: covered up to 12 visits annually",
     "rule_id": "nhia_copayment_disclosure",
     "regulation": "NHIA Consumer Protection Guidelines Section 12.3"},
    {"type": "incomplete_disclosure",
     "severity": "medium",
     "phrase": "Emergency evacuation: covered domestically",
     "rule_id": "nhia_benefit_limit_disclosure",
     "regulation": "NHIA Consumer Protection Guidelines Section 12.3"}
  ]'::jsonb,
  'very_strict',
  'nigeria',
  now() - interval '1 day',
  now() - interval '1 day'
),

-- Report 5: medium — steps challenge, implied therapeutic claim
(
  'c0000001-0000-0000-0000-000000000005',
  'b0000001-0000-0000-0000-000000000005',
  'NAFDAC-ADV-2023-v2.1',
  'medium',
  '[
    {"phrase": "can reverse the effects of lifestyle diseases",
     "reason": "Implied therapeutic reversal claim — requires clinical substantiation and NAFDAC clearance under Article 11",
     "severity": "high"},
    {"phrase": "clinically-backed programme",
     "reason": "Unsubstantiated clinical claim — no reference or evidence cited",
     "severity": "medium"}
  ]'::jsonb,
  '[
    {"regulation": "NAFDAC Advertising Code",
     "section": "Article 11",
     "description": "Claims implying treatment or reversal of disease conditions require evidence and prior regulatory clearance"},
    {"regulation": "WHO Ethical Criteria for Medicinal Drug Promotion",
     "section": "Section 6",
     "description": "Health promotion materials must not overstate the benefits of lifestyle interventions"}
  ]'::jsonb,
  '[
    {"original": "can reverse the effects of lifestyle diseases",
     "suggestion": "may support management of lifestyle-related health risk factors. Individual results vary. Consult your physician."},
    {"original": "clinically-backed programme",
     "suggestion": "programme developed with guidance from healthcare professionals. See methodology at healthbridgehmo.ng/research"}
  ]'::jsonb,
  '[
    {"type": "implied_therapeutic_claim",
     "severity": "high",
     "phrase": "can reverse the effects of lifestyle diseases",
     "rule_id": "therapeutic_reversal_claim",
     "regulation": "NAFDAC Advertising Code Art. 11"},
    {"type": "unsubstantiated_clinical_claim",
     "severity": "medium",
     "phrase": "clinically-backed programme",
     "rule_id": "clinical_substantiation_required",
     "regulation": "WHO Ethical Criteria Section 6"}
  ]'::jsonb,
  'strict',
  'nigeria',
  now() - interval '1 day',
  now() - interval '1 day'
)

ON CONFLICT (id) DO NOTHING;


-- ── 7. AI Risk Assessments ───────────────────────────────────
-- company_id is a plain uuid (FK removed in migration 20260227000000).
-- content_hash: 64-char hex placeholders; expires_at set to 2027
-- so cached results never expire during the demo lifecycle.

INSERT INTO ai_risk_assessments (
  id,
  submission_id,
  company_id,
  ai_risk_score,
  overall_sentiment,
  intent_violations,
  subtle_claims,
  recommendations,
  summary,
  model_version,
  content_hash,
  expires_at,
  created_at,
  updated_at
)
VALUES

-- Assessment 1: critical guarantee claim (score 87)
(
  'd0000001-0000-0000-0000-000000000001',
  'b0000001-0000-0000-0000-000000000001',
  '863e9f8b-2a8e-4927-9fc3-42c00b7a895d',
  87,
  'positive',
  '[
    {"type": "guarantee_claim",
     "severity": "critical",
     "phrase": "Zero Rejection Guarantee",
     "description": "An absolute outcome guarantee in health insurance advertising is categorically prohibited under NAFDAC Advertising Code Article 14. No insurer may guarantee claim approval.",
     "regulation_ref": "NAFDAC Advertising Code Art. 14"},
    {"type": "absolute_coverage_claim",
     "severity": "high",
     "phrase": "100% covered with no hidden conditions",
     "description": "Creates a false impression of unlimited coverage. Violates NHIA Consumer Protection Guidelines Section 8.1 which prohibits unqualified absolute coverage claims.",
     "regulation_ref": "NHIA Consumer Protection Guidelines Section 8.1"},
    {"type": "guarantee_claim",
     "severity": "high",
     "phrase": "No claim denials. Guaranteed.",
     "description": "Repetition of guarantee language compounds the violation. All guarantee language must be removed before this content can proceed to legal review.",
     "regulation_ref": "NAFDAC Advertising Code Art. 14"}
  ]'::jsonb,
  '[
    "The phrase No pre-authorisation hassles implies the plan operates without clinical gatekeeping, which is factually misleading for an HMO product that requires prior authorisation for specialist and inpatient care.",
    "Framing 50,000 members as social proof without a verifiable source date may constitute a misleading comparative claim if the figure is not current."
  ]'::jsonb,
  '[
    "Remove all guarantee language including Zero Rejection Guarantee, 100% covered, and No claim denials — these are categorically prohibited in Nigerian health insurance advertising.",
    "Replace with factual, qualified statements. Example: Eligible claims are assessed within 48 hours, subject to your plan terms and conditions.",
    "Add mandatory NHIA disclaimer: Coverage is subject to plan limits, exclusions, and the terms of your policy document.",
    "Verify the 50,000 members figure and add a source date before publishing."
  ]'::jsonb,
  'This content contains three critical-to-high severity violations centred on absolute guarantee language. The phrases Zero Rejection Guarantee and No claim denials. Guaranteed. are categorically prohibited under NAFDAC and NHIA frameworks. The content cannot be published in its current form and requires substantive revision before entering legal review.',
  'gemini-2.0-flash',
  'a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1',
  '2027-12-31 23:59:59+00',
  now() - interval '2 days',
  now() - interval '2 days'
),

-- Assessment 2: medium risk — diabetes website (score 43)
(
  'd0000001-0000-0000-0000-000000000002',
  'b0000001-0000-0000-0000-000000000002',
  '863e9f8b-2a8e-4927-9fc3-42c00b7a895d',
  43,
  'neutral',
  '[
    {"type": "unsubstantiated_efficacy_claim",
     "severity": "medium",
     "phrase": "significant improvements in blood sugar control within 90 days",
     "description": "A specific-timeframe efficacy claim constitutes therapeutic promotion under NAFDAC HCP Advertising Guidelines Section 7.2 and requires a cited clinical reference in the material itself.",
     "regulation_ref": "NAFDAC HCP Advertising Guidelines Section 7.2"}
  ]'::jsonb,
  '[
    "Partners with leading endocrinologists implies exclusive or preferential clinical relationships that may not be substantiable if challenged by NAFDAC.",
    "Standard plan coverage of specialist consultations should be clarified — HMO products typically require a GP referral for specialist access, which this content does not state."
  ]'::jsonb,
  '[
    "Add a citation for the 90-day outcome claim immediately after the sentence: Based on internal programme outcomes data, 2024. Individual results may vary.",
    "Add the standard medical disclaimer: This content is for informational purposes only. Consult your physician before making healthcare decisions.",
    "Clarify the specialist referral pathway to avoid creating a false expectation of direct specialist access under the standard plan."
  ]'::jsonb,
  'This content is broadly compliant but contains one medium-severity efficacy claim that requires a cited reference before publication. Two subtle claims warrant reviewer attention. Minor targeted edits will resolve all findings. Recommended for conditional approval pending revisions.',
  'gemini-2.0-flash',
  'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2',
  '2027-12-31 23:59:59+00',
  now() - interval '3 days',
  now() - interval '3 days'
),

-- Assessment 3: low risk — network announcement (score 12)
(
  'd0000001-0000-0000-0000-000000000003',
  'b0000001-0000-0000-0000-000000000003',
  '863e9f8b-2a8e-4927-9fc3-42c00b7a895d',
  12,
  'neutral',
  '[]'::jsonb,
  '[
    "The claim of 500+ accredited hospitals should be verified against the current NHIA-accredited facility register to ensure the count is accurate at the time of publication. Facility counts change as accreditations lapse or are added."
  ]'::jsonb,
  '[
    "Confirm the 500+ figure against the current NHIA accreditation register before publishing.",
    "Consider adding an as-of date to the network size claim, for example: as of May 2026."
  ]'::jsonb,
  'This content is factual and informational. No prohibited claims detected. One minor advisory note about verifying the facility count against the NHIA register. Approved for publication subject to verification of the network size figure.',
  'gemini-2.0-flash',
  'c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3',
  '2027-12-31 23:59:59+00',
  now() - interval '14 days',
  now() - interval '14 days'
),

-- Assessment 4: high risk — benefits statement, NHIA disclosure gaps (score 71)
(
  'd0000001-0000-0000-0000-000000000004',
  'b0000001-0000-0000-0000-000000000004',
  '863e9f8b-2a8e-4927-9fc3-42c00b7a895d',
  71,
  'neutral',
  '[
    {"type": "missing_mandatory_disclosure",
     "severity": "high",
     "phrase": "Inpatient care: covered",
     "description": "NHIA Consumer Protection Guidelines Section 12.3 requires all member-facing benefits documents to state the annual inpatient monetary cap and bed-day limit. Neither appears in this document.",
     "regulation_ref": "NHIA Consumer Protection Guidelines Section 12.3"},
    {"type": "missing_mandatory_disclosure",
     "severity": "high",
     "phrase": "(no exclusion schedule present)",
     "description": "NHIA Operational Standards Section 6.1 requires the NHIA-prescribed exclusion schedule by name in all HMO benefit statements. This document contains no exclusion list.",
     "regulation_ref": "NHIA Operational Standards Section 6.1"},
    {"type": "incomplete_disclosure",
     "severity": "medium",
     "phrase": "Outpatient consultations: covered up to 12 visits annually",
     "description": "The visit limit is stated but the co-payment amount and facility tier restrictions required under Section 12.3 are absent.",
     "regulation_ref": "NHIA Consumer Protection Guidelines Section 12.3"}
  ]'::jsonb,
  '[
    "The pre-existing condition waiting period is not disclosed anywhere in the document. This is a mandatory NHIA disclosure element under Section 12.3.",
    "Emergency evacuation is described as covered domestically without stating the maximum benefit amount, which could mislead members about the extent of their coverage."
  ]'::jsonb,
  '[
    "Add the annual inpatient monetary cap and bed-day limit to the inpatient entry.",
    "Insert the full NHIA-prescribed exclusion schedule as a named section or appendix.",
    "Add co-payment amounts and facility tier details to the outpatient consultation entry.",
    "Disclose the pre-existing condition waiting period in the document.",
    "State the maximum domestic emergency evacuation benefit amount."
  ]'::jsonb,
  'This member benefits statement has critical NHIA compliance gaps. While the document covers the main benefit categories, it omits several mandatory disclosures required by NHIA Consumer Protection Guidelines Section 12.3 and Operational Standards Section 6.1: coverage caps, the exclusion schedule, co-payment structure, pre-existing condition waiting periods. These omissions are not discretionary — they are legally required elements in all HMO benefit statements. The document cannot be distributed in its current form.',
  'gemini-2.0-flash',
  'd4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4',
  '2027-12-31 23:59:59+00',
  now() - interval '1 day',
  now() - interval '1 day'
),

-- Assessment 5: medium risk — steps challenge, implied therapeutic (score 52)
(
  'd0000001-0000-0000-0000-000000000005',
  'b0000001-0000-0000-0000-000000000005',
  '863e9f8b-2a8e-4927-9fc3-42c00b7a895d',
  52,
  'positive',
  '[
    {"type": "implied_therapeutic_claim",
     "severity": "high",
     "phrase": "can reverse the effects of lifestyle diseases",
     "description": "NAFDAC Advertising Code Article 11 requires clinical substantiation and prior regulatory clearance for any claim implying disease reversal. This claim has neither.",
     "regulation_ref": "NAFDAC Advertising Code Art. 11"},
    {"type": "unsubstantiated_clinical_claim",
     "severity": "medium",
     "phrase": "clinically-backed programme",
     "description": "Asserting clinical validation without a cited reference or methodology link violates WHO Ethical Criteria Section 6, which requires health promotion materials to accurately reflect current evidence.",
     "regulation_ref": "WHO Ethical Criteria for Medicinal Drug Promotion Section 6"}
  ]'::jsonb,
  '[
    "The phrase helped thousands of members implies a large-scale efficacy outcome. If challenged, this figure would need substantiation.",
    "Listing improve cardiovascular health, reduce blood pressure, and manage weight as programme outcomes reads as therapeutic promotion rather than general wellness encouragement, and each claim would need individual substantiation."
  ]'::jsonb,
  '[
    "Replace can reverse the effects of lifestyle diseases with: may support management of lifestyle-related health risk factors. Individual results vary.",
    "Replace clinically-backed with: developed with guidance from healthcare professionals and add a link to the methodology page.",
    "Add standard wellness disclaimer: This programme is a general wellness initiative and does not replace medical treatment. Consult your physician before starting any new exercise programme.",
    "Qualify the cardiovascular and blood pressure claims: some participants have reported improvements in these areas. Individual results vary."
  ]'::jsonb,
  'This wellness campaign content contains one high-severity implied therapeutic claim and one medium-severity unsubstantiated clinical claim. The disease reversal language is the primary concern and must be removed or substantially qualified before publication. Two additional subtle claims warrant reviewer attention. The content is salvageable with focused revisions.',
  'gemini-2.0-flash',
  'e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5',
  '2027-12-31 23:59:59+00',
  now() - interval '1 day',
  now() - interval '1 day'
)

ON CONFLICT (id) DO NOTHING;


-- ── 8. Risks ─────────────────────────────────────────────────
-- risks.company_id has a FK to companies — company row must exist (Step 1).
-- owner_id references profiles.id — both users must exist (guard above).

INSERT INTO risks (
  id,
  company_id,
  title,
  description,
  risk_category,
  risk_level,
  status,
  owner_id,
  created_by,
  created_at,
  updated_at
)
VALUES

(
  'e0000001-0000-0000-0000-000000000001',
  '863e9f8b-2a8e-4927-9fc3-42c00b7a895d',
  'Prohibited guarantee language in consumer advertising',
  'Marketing materials are being submitted containing absolute outcome guarantees '
  '(Zero Rejection, 100% covered) that are categorically prohibited under NAFDAC '
  'Advertising Code Article 14 and NHIA Consumer Protection Guidelines Section 8.1. '
  'Current submissions evidence a systemic gap in the marketing team understanding '
  'of permissible claim language in Nigerian health insurance advertising.',
  'compliance',
  'high',
  'identified',
  'b52638cc-7dd3-4af1-9c03-05cb7ecca68c',
  'b52638cc-7dd3-4af1-9c03-05cb7ecca68c',
  now() - interval '2 days',
  now() - interval '2 days'
),

(
  'e0000001-0000-0000-0000-000000000002',
  '863e9f8b-2a8e-4927-9fc3-42c00b7a895d',
  'Mandatory NHIA disclosure gaps in member benefit statements',
  'The 2026 Annual Member Benefits Statement is missing mandatory disclosure '
  'elements required under NHIA Consumer Protection Guidelines Section 12.3 and '
  'Operational Standards Section 6.1: annual coverage caps, the NHIA exclusion '
  'schedule, co-payment structure, and pre-existing condition waiting periods. '
  'Distribution of a non-compliant benefits statement exposes the company to NHIA '
  'regulatory sanction and potential member disputes.',
  'legal',
  'critical',
  'mitigating',
  'fd19d39d-899e-4ce2-a525-ee60b68d1ad4',
  'b52638cc-7dd3-4af1-9c03-05cb7ecca68c',
  now() - interval '1 day',
  now() - interval '1 day'
),

(
  'e0000001-0000-0000-0000-000000000003',
  '863e9f8b-2a8e-4927-9fc3-42c00b7a895d',
  'Unsubstantiated clinical efficacy claims in digital health content',
  'Website and social media content is using efficacy and clinical outcome language '
  '(disease reversal, specific blood sugar improvement timeframes) without cited '
  'clinical references. If challenged by NAFDAC or WHO, these claims cannot be '
  'substantiated. Affects the diabetes management page and the June wellness '
  'campaign currently in compliance review.',
  'compliance',
  'medium',
  'monitored',
  'b52638cc-7dd3-4af1-9c03-05cb7ecca68c',
  'b52638cc-7dd3-4af1-9c03-05cb7ecca68c',
  now() - interval '5 days',
  now() - interval '3 days'
)

ON CONFLICT (id) DO NOTHING;


-- ── 9. Calendar Events ───────────────────────────────────────
-- Legal review events for the two submissions awaiting legal.
-- Publish event (completed) for the approved network announcement.

INSERT INTO calendar_events (
  id,
  company_id,
  submission_id,
  event_type,
  title,
  scheduled_at,
  is_auto_dated,
  needs_schedule_confirmation,
  legal_planned_at,
  legal_acknowledged,
  status,
  created_by,
  created_at,
  updated_at
)
VALUES

-- Legal review for Sub 2 (diabetes — awaiting_legal, scheduled 2 days out)
(
  'f0000001-0000-0000-0000-000000000001',
  '863e9f8b-2a8e-4927-9fc3-42c00b7a895d',
  'b0000001-0000-0000-0000-000000000002',
  'legal_review',
  'Legal Review: Managing Type 2 Diabetes with Your HMO Plan',
  now() + interval '2 days',
  false,
  false,
  now() + interval '2 days',
  false,
  'pending',
  'b52638cc-7dd3-4af1-9c03-05cb7ecca68c',
  now() - interval '3 days',
  now() - interval '3 days'
),

-- Publish event for Sub 3 (network — signed_off, completed)
(
  'f0000001-0000-0000-0000-000000000002',
  '863e9f8b-2a8e-4927-9fc3-42c00b7a895d',
  'b0000001-0000-0000-0000-000000000003',
  'marketing_publish',
  'Publish: Extended Hospital Network Announcement',
  now() - interval '9 days',
  false,
  false,
  NULL,
  true,
  'completed',
  'b52638cc-7dd3-4af1-9c03-05cb7ecca68c',
  now() - interval '14 days',
  now() - interval '9 days'
),

-- Legal review for Sub 4 (benefits statement — awaiting_legal, urgent, tomorrow)
(
  'f0000001-0000-0000-0000-000000000003',
  '863e9f8b-2a8e-4927-9fc3-42c00b7a895d',
  'b0000001-0000-0000-0000-000000000004',
  'legal_review',
  'Legal Review: Annual Member Benefits Statement — 2026 Coverage Guide',
  now() + interval '1 day',
  false,
  false,
  now() + interval '1 day',
  false,
  'pending',
  'b52638cc-7dd3-4af1-9c03-05cb7ecca68c',
  now() - interval '1 day',
  now() - interval '1 day'
)

ON CONFLICT (id) DO NOTHING;


COMMIT;
