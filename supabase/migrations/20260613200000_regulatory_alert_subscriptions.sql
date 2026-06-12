-- Horizon Scanning: company subscriptions to regulatory bodies + seed data
-- Creates regulatory_alert_subscriptions so each company can configure which
-- bodies they monitor. Also seeds the regulations table with real regulatory
-- bodies (NAFDAC, SON, FDA, EMA, WHO, MHRA, NCS, ECJU) and realistic recent
-- alerts in regulation_updates.

-- ─── Subscriptions table ────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'regulatory_alert_subscriptions'
  ) THEN
    CREATE TABLE public.regulatory_alert_subscriptions (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id      uuid NOT NULL,
      regulation_id   uuid NOT NULL REFERENCES public.regulations(id) ON DELETE CASCADE,
      is_active       boolean NOT NULL DEFAULT true,
      notify_email    boolean NOT NULL DEFAULT true,
      notify_in_app   boolean NOT NULL DEFAULT true,
      created_at      timestamptz NOT NULL DEFAULT now(),
      updated_at      timestamptz NOT NULL DEFAULT now(),
      UNIQUE (company_id, regulation_id)
    );

    ALTER TABLE public.regulatory_alert_subscriptions ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "ras_company_select"
      ON public.regulatory_alert_subscriptions FOR SELECT
      USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid() LIMIT 1));

    CREATE POLICY "ras_company_insert"
      ON public.regulatory_alert_subscriptions FOR INSERT
      WITH CHECK (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid() LIMIT 1));

    CREATE POLICY "ras_company_update"
      ON public.regulatory_alert_subscriptions FOR UPDATE
      USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid() LIMIT 1));

    CREATE POLICY "ras_company_delete"
      ON public.regulatory_alert_subscriptions FOR DELETE
      USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid() LIMIT 1));
  END IF;
END $$;

-- ─── Seed: real regulatory bodies into regulations ──────────────────────────
-- INSERT … ON CONFLICT DO NOTHING keeps this idempotent.
-- We treat each regulatory body as one "regulation" row that acts as a source.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'regulations'
  ) THEN RETURN; END IF;

  INSERT INTO public.regulations
    (id, title, source, category, content, source_url, version, effective_date, is_active)
  VALUES
    (
      '11111111-0001-0001-0001-000000000001',
      'NAFDAC — National Agency for Food and Drug Administration and Control',
      'NAFDAC',
      'pharma',
      'Nigerian federal agency that regulates the importation, exportation, manufacture, advertisement, distribution, sale and use of food, drugs, cosmetics, medical devices, bottled water and chemicals.',
      'https://www.nafdac.gov.ng',
      '2024',
      '1993-01-01',
      true
    ),
    (
      '11111111-0002-0002-0002-000000000002',
      'SON — Standards Organisation of Nigeria',
      'SON',
      'general',
      'Nigerian agency responsible for standardisation and conformity assessment in Nigeria. Publishes Nigerian Industrial Standards (NIS) covering product quality, safety, and testing protocols.',
      'https://www.son.gov.ng',
      '2024',
      '1971-01-01',
      true
    ),
    (
      '11111111-0003-0003-0003-000000000003',
      'FDA — U.S. Food and Drug Administration',
      'FDA',
      'pharma',
      'U.S. federal agency responsible for protecting public health by regulating food, drugs, biologics, medical devices, cosmetics, and tobacco products.',
      'https://www.fda.gov',
      '2024',
      '1906-06-30',
      true
    ),
    (
      '11111111-0004-0004-0004-000000000004',
      'EMA — European Medicines Agency',
      'EMA',
      'pharma',
      'Decentralised agency of the European Union responsible for the scientific evaluation, supervision and safety monitoring of medicines in the EU.',
      'https://www.ema.europa.eu',
      '2024',
      '1995-01-01',
      true
    ),
    (
      '11111111-0005-0005-0005-000000000005',
      'WHO — World Health Organization',
      'WHO',
      'general',
      'UN agency responsible for international public health. Publishes International Health Regulations (IHR), Good Manufacturing Practice (GMP) guidelines, and essential medicines frameworks.',
      'https://www.who.int',
      '2024',
      '1948-04-07',
      true
    ),
    (
      '11111111-0006-0006-0006-000000000006',
      'MHRA — Medicines and Healthcare products Regulatory Agency',
      'MHRA',
      'medical_devices',
      'UK government agency responsible for ensuring that medicines, medical devices and blood components for transfusion meet applicable standards of safety, quality and efficacy.',
      'https://www.gov.uk/government/organisations/medicines-and-healthcare-products-regulatory-agency',
      '2024',
      '2003-04-01',
      true
    ),
    (
      '11111111-0007-0007-0007-000000000007',
      'NCS — Nigeria Customs Service',
      'NCS',
      'general',
      'Nigerian government agency responsible for the assessment and collection of customs revenue, facilitation of legitimate trade, and interdiction of prohibited and restricted goods.',
      'https://customs.gov.ng',
      '2024',
      '1958-01-01',
      true
    ),
    (
      '11111111-0008-0008-0008-000000000008',
      'ECJU — Export Control Joint Unit',
      'ECJU',
      'general',
      'UK government body (BEIS / MOD / FCDO) that issues export and trade control licences and raises awareness of export controls to help UK exporters comply with UK law.',
      'https://www.gov.uk/government/organisations/export-control-joint-unit',
      '2024',
      '2007-01-01',
      true
    )
  ON CONFLICT (id) DO NOTHING;
END $$;

-- ─── Seed: realistic regulation_updates (alerts) ────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'regulation_updates'
  ) THEN RETURN; END IF;

  INSERT INTO public.regulation_updates
    (id, regulation_id, change_summary, previous_version, new_version, detected_at)
  VALUES
    -- NAFDAC
    (
      'aa000001-0000-0000-0000-000000000001',
      '11111111-0001-0001-0001-000000000001',
      'NAFDAC revised post-market surveillance requirements for all Class III medical devices. Companies must now submit quarterly adverse-event reports (previously annual). New Form MDD-07 mandatory from 1 July 2026.',
      'NAFDAC MDD Guideline 2022',
      'NAFDAC MDD Guideline 2026',
      '2026-05-20 09:00:00+00'
    ),
    (
      'aa000002-0000-0000-0000-000000000002',
      '11111111-0001-0001-0001-000000000001',
      'NAFDAC issued enforcement circular on counterfeit antimalarial drugs. All artemisinin-based combination therapy (ACT) manufacturers must revalidate batch release documentation by 30 September 2026. Non-compliance attracts product recall.',
      'Circular 2023/14',
      'Circular 2026/08',
      '2026-06-01 08:30:00+00'
    ),
    -- SON
    (
      'aa000003-0000-0000-0000-000000000003',
      '11111111-0002-0002-0002-000000000002',
      'SON published NIS 871:2026 — updated standard for electronic weighing instruments used in pharmaceutical dispensing. Calibration certification now required every 6 months (previously 12 months). Effective 1 October 2026.',
      'NIS 871:2020',
      'NIS 871:2026',
      '2026-05-15 10:00:00+00'
    ),
    -- FDA
    (
      'aa000004-0000-0000-0000-000000000004',
      '11111111-0003-0003-0003-000000000003',
      'FDA issued final guidance on Electronic Drug Product Reporting (eDPR) under DSCSA. All dispensers must use the new EPCIS 2.0 format for serialisation data exchange by 27 November 2026. Legacy EDI format will no longer be accepted.',
      'DSCSA eDPR Guidance 2023',
      'DSCSA eDPR Guidance 2026 (Final)',
      '2026-04-30 14:00:00+00'
    ),
    (
      'aa000005-0000-0000-0000-000000000005',
      '11111111-0003-0003-0003-000000000003',
      'FDA 21 CFR Part 11 amended: electronic records for clinical trial data must now include audit trails with cryptographic timestamps. FDA published draft compliance guide for manufacturers — public comment period closes 15 August 2026.',
      '21 CFR Part 11 (2003)',
      '21 CFR Part 11 (Proposed 2026 Amendment)',
      '2026-06-05 16:00:00+00'
    ),
    -- EMA
    (
      'aa000006-0000-0000-0000-000000000006',
      '11111111-0004-0004-0004-000000000004',
      'EMA updated Annex 11 (Computerised Systems) of the EU GMP Guidelines. New clauses require manufacturers to maintain validated backup procedures for all GMP-critical data and conduct annual disaster-recovery tests. Applies from 1 January 2027.',
      'EU GMP Annex 11 (2011)',
      'EU GMP Annex 11 (Draft Revision 2026)',
      '2026-05-08 11:00:00+00'
    ),
    (
      'aa000007-0000-0000-0000-000000000007',
      '11111111-0004-0004-0004-000000000004',
      'EMA CAT (Committee for Advanced Therapies) released new eligibility criteria for ATMP developers seeking SME fee reductions. Companies must resubmit qualification requests under revised Form ATMP-FEE-2026 — prior approvals remain valid until December 2026.',
      'CAT Fee Reduction Rules 2022',
      'CAT Fee Reduction Rules 2026',
      '2026-05-22 09:30:00+00'
    ),
    -- WHO
    (
      'aa000008-0000-0000-0000-000000000008',
      '11111111-0005-0005-0005-000000000005',
      'WHO published TRS 1049 — updated Good Manufacturing Practice supplementary guidelines for biological products (vaccines, blood-derived products). Key change: environmental monitoring frequency for classified cleanrooms increased. Immediate adoption recommended for WHO-prequalified sites.',
      'WHO TRS 999 Annex 3',
      'WHO TRS 1049 Annex 3',
      '2026-03-18 12:00:00+00'
    ),
    -- MHRA
    (
      'aa000009-0000-0000-0000-000000000009',
      '11111111-0006-0006-0006-000000000006',
      'MHRA published updated Medical Device Regulations post-Brexit alignment guidance. Class IIa and above devices must now undergo MHRA Approved Body conformity assessment (replacing EU notified body routes). Transition deadline: 30 June 2028; early compliance strongly advised.',
      'UK MDR 2002 (as amended)',
      'UK MDR 2002 (2026 MHRA Guidance Update)',
      '2026-04-14 10:00:00+00'
    ),
    -- NCS
    (
      'aa000010-0000-0000-0000-000000000010',
      '11111111-0007-0007-0007-000000000007',
      'Nigeria Customs Service issued new HS Code tariff amendments effective 1 July 2026. Import duty on pharmaceutical raw materials (HS Chapter 29 and 30) reduced from 5% to 0% under ECOWAS CET revision. Pre-clearance declarations must use updated tariff schedule in the NCS ECTS system.',
      'NCS Tariff Schedule 2022',
      'NCS Tariff Schedule 2026 (ECOWAS CET)',
      '2026-06-03 08:00:00+00'
    ),
    -- ECJU
    (
      'aa000011-0000-0000-0000-000000000011',
      '11111111-0008-0008-0008-000000000008',
      'ECJU revised the UK Strategic Export Control Lists (SECL) to incorporate new dual-use items in biotech and advanced manufacturing. Three new controlled entries (ML26a, ML26b, PL9026) added. Exporters must review product classification and re-apply for licences where newly caught.',
      'SECL 2025 Q4',
      'SECL 2026 Q2',
      '2026-05-29 09:00:00+00'
    )
  ON CONFLICT (id) DO NOTHING;
END $$;
