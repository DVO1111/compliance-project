-- Demo seed: Hygeia-style provider network scorecard
-- Run in Supabase SQL Editor for the demo company.
-- Replace the company_id below if your demo account uses a different one.

DO $$
DECLARE
  v_company_id uuid := '863e9f8b-2a8e-4927-9fc3-42c00b7a895d';

  v_reddington   uuid;
  v_lagoon       uuid;
  v_zenith       uuid;
  v_primecare    uuid;
  v_firstcare    uuid;
  v_caremax      uuid;

BEGIN

  -- ── 1. Reddington Hospital, Lagos ───────────────────────────────────────────
  INSERT INTO public.vendor_profiles (company_id, vendor_name, vendor_type, contact_email, compliance_certified, certification_expiry, risk_tier, overall_score, status)
  VALUES (v_company_id, 'Reddington Hospital (Lagos)', 'other', 'compliance@reddingtonhospital.com', true, '2026-12-31', 'low', 91, 'active')
  RETURNING id INTO v_reddington;

  INSERT INTO public.vendor_audits (vendor_id, audit_type, findings, score, auditor, audit_date, next_audit_due)
  VALUES
    (v_reddington, 'initial', 'Full HEFAMAA accreditation verified. NHIA provider network registration current. MDCN credentials confirmed for 98% of clinical staff. Infection control protocols meet Excellence tier (score 88/100). Minor gap: biomedical equipment calibration logs incomplete for 3 units — remediated within audit window.', 89, 'Hygeia Clinical Governance Team', '2024-04-10', '2025-04-10'),
    (v_reddington, 'periodic', 'Annual re-assessment. HEFAMAA composite score improved to 91/100 (Excellence tier). Staff credentialing 100% current. IPC audit passed. No adverse event reports in the period. Recommended for Preferred Provider designation.', 93, 'Hygeia Clinical Governance Team', '2025-04-08', '2026-04-08');

  -- ── 2. Lagoon Hospitals, Apapa ───────────────────────────────────────────────
  INSERT INTO public.vendor_profiles (company_id, vendor_name, vendor_type, contact_email, compliance_certified, certification_expiry, risk_tier, overall_score, status)
  VALUES (v_company_id, 'Lagoon Hospitals (Apapa)', 'other', 'governance@lagoonhospitals.com', true, '2026-06-30', 'low', 87, 'active')
  RETURNING id INTO v_lagoon;

  INSERT INTO public.vendor_audits (vendor_id, audit_type, findings, score, auditor, audit_date, next_audit_due)
  VALUES
    (v_lagoon, 'initial', 'HEFAMAA Standard tier accreditation confirmed. NHIA registration active. 95% of clinical staff MDCN-verified. Pharmacy dispensary layout meets standard. Patient complaint mechanism in place. One outstanding CAPA from 2023 HEFAMAA inspection (isolation room upgrade) — confirmed completed.', 85, 'Hygeia Clinical Governance Team', '2023-09-15', '2024-09-15'),
    (v_lagoon, 'periodic', 'Score improvement noted. Isolation room upgrade verified complete. IPC committee active with monthly audits. HEFAMAA spot inspection during period — passed with no major findings. Claims rejection rate 9% (within NHIA 15% threshold).', 87, 'Hygeia Clinical Governance Team', '2024-09-12', '2025-09-12'),
    (v_lagoon, 'follow_up', 'CAPA closure verification. All prior findings resolved. Certification renewal submitted to HEFAMAA. No new adverse events. Maintained Standard tier — on track for Excellence tier at next full inspection.', 89, 'Hygeia Clinical Governance Team', '2025-03-20', '2025-09-20');

  -- ── 3. Zenith Medical Centre, Abuja ─────────────────────────────────────────
  INSERT INTO public.vendor_profiles (company_id, vendor_name, vendor_type, contact_email, compliance_certified, certification_expiry, risk_tier, overall_score, status)
  VALUES (v_company_id, 'Zenith Medical Centre (Abuja)', 'other', 'admin@zenithmedical.ng', true, '2025-09-30', 'medium', 74, 'active')
  RETURNING id INTO v_zenith;

  INSERT INTO public.vendor_audits (vendor_id, audit_type, findings, score, auditor, audit_date, next_audit_due)
  VALUES
    (v_zenith, 'initial', 'HEFAMAA Provisional tier accreditation. NHIA registration active. Clinical staff credentialing at 88% — 4 practitioners with lapsed MDCN registration identified; facility notified to remediate within 30 days. IPC programme exists but lacks formal committee structure. Patient records retention policy not documented.', 70, 'Hygeia Clinical Governance Team', '2024-01-22', '2025-01-22'),
    (v_zenith, 'follow_up', 'CAPA progress review. MDCN lapsed registrations remediated (3 of 4 renewed; 1 practitioner departed). IPC committee constituted. Patient records policy drafted — pending sign-off. HEFAMAA re-inspection scheduled. Facility progressing toward Standard tier.', 74, 'Hygeia Clinical Governance Team', '2024-07-18', '2025-07-18');

  -- ── 4. Prime Care Diagnostics, Ibadan ───────────────────────────────────────
  INSERT INTO public.vendor_profiles (company_id, vendor_name, vendor_type, contact_email, compliance_certified, certification_expiry, risk_tier, overall_score, status)
  VALUES (v_company_id, 'Prime Care Diagnostics (Ibadan)', 'other', 'info@primecaredx.com', false, NULL, 'medium', 63, 'active')
  RETURNING id INTO v_primecare;

  INSERT INTO public.vendor_audits (vendor_id, audit_type, findings, score, auditor, audit_date, next_audit_due)
  VALUES
    (v_primecare, 'initial', 'HEFAMAA Provisional accreditation (score 62/100). NHIA registration current. Diagnostic equipment calibration logs available but not fully up to date. No formal IPC programme — infection control handled informally. Staff credentialing 82% (below NHIA 90% threshold). Claims rejection rate 18% — exceeds NHIA 15% benchmark. Three open CAPAs issued. Flagged for enhanced monitoring.', 60, 'Hygeia Clinical Governance Team', '2024-05-30', '2025-05-30'),
    (v_primecare, 'for_cause', 'Triggered by patient complaint regarding diagnostic error. Root cause analysis conducted — process gap in specimen labelling identified. Corrective action plan submitted. Equipment calibration now 90% complete. Staff credentialing improved to 86%. Claims rejection rate reduced to 14%. Two of three CAPAs closed. One CAPA (IPC programme formalisation) remains open.', 65, 'Hygeia Clinical Governance Team', '2025-01-14', '2025-07-14');

  -- ── 5. Firstcare Health Clinic, Enugu ───────────────────────────────────────
  INSERT INTO public.vendor_profiles (company_id, vendor_name, vendor_type, contact_email, compliance_certified, certification_expiry, risk_tier, overall_score, status)
  VALUES (v_company_id, 'Firstcare Health Clinic (Enugu)', 'other', 'firstcareenugu@gmail.com', false, NULL, 'high', 48, 'active')
  RETURNING id INTO v_firstcare;

  INSERT INTO public.vendor_audits (vendor_id, audit_type, findings, score, auditor, audit_date, next_audit_due)
  VALUES
    (v_firstcare, 'initial', 'HEFAMAA accreditation status: Provisional (score 51/100) — below NHIA minimum network standard of 55. Staff credentialing 71% — significantly below threshold. No biomedical waste management facility. IPC non-existent. Patient complaint mechanism absent. Claims rejection rate 24%. Seven CAPAs issued. 90-day improvement notice served per NHIA Circular 2025. Continued network participation conditional on remediation.', 48, 'Hygeia Clinical Governance Team', '2025-02-05', '2025-05-05'),
    (v_firstcare, 'follow_up', '90-day improvement review. HEFAMAA score improved marginally to 54 — still below NHIA 55 minimum. Staff credentialing improved to 79%. Biomedical waste bay constructed but not yet certified. IPC plan drafted. Claims rejection rate 21% — still above threshold. Three CAPAs closed; four remain open including two critical. Formal warning issued. 60-day final remediation window opened before potential network suspension.', 50, 'Hygeia Clinical Governance Team', '2025-05-06', '2025-07-06');

  -- ── 6. Caremax Medical Centre, Kano ─────────────────────────────────────────
  INSERT INTO public.vendor_profiles (company_id, vendor_name, vendor_type, contact_email, compliance_certified, certification_expiry, risk_tier, overall_score, status)
  VALUES (v_company_id, 'Caremax Medical Centre (Kano)', 'other', NULL, false, NULL, 'critical', 31, 'active')
  RETURNING id INTO v_caremax;

  INSERT INTO public.vendor_audits (vendor_id, audit_type, findings, score, auditor, audit_date, next_audit_due)
  VALUES
    (v_caremax, 'initial', 'HEFAMAA accreditation lapsed — facility failed to submit renewal application by deadline. NHIA registration technically active but at risk pending HEFAMAA status resolution. Staff credentialing 58% — well below threshold; 6 practitioners with no verifiable MDCN registration. No functioning IPC programme. Adverse event (needle-stick injury, unreported to HEFAMAA) identified during audit. Claims rejection rate 31%. Nine CAPAs issued. Immediate escalation to NHIA compliance team. Network participation suspended pending HEFAMAA re-accreditation.', 31, 'Hygeia Clinical Governance Team', '2025-03-18', '2025-06-18'),
    (v_caremax, 'for_cause', 'Post-suspension review. HEFAMAA re-inspection application submitted. 4 practitioners with unverifiable MDCN registration removed from roster. Adverse event root cause analysis completed and submitted to HEFAMAA. IPC lead appointed. Claims processing reviewed — systemic coding errors identified as primary driver of high rejection rate. Corrective coding training completed. Facility remains suspended from network. Reinstatement conditional on HEFAMAA passing score of 55+.', 35, 'Hygeia Clinical Governance Team', '2025-05-22', '2025-08-22');

END $$;
