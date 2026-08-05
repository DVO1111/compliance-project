import { supabase } from '../supabase';
import { logger } from '../logger';
import { getIndustryCategory, type IndustryCategory } from '../regulatoryProfile';

interface PolicyTemplate {
  title: string;
  category: 'security' | 'privacy' | 'conduct' | 'hr' | 'finance' | 'operational' | 'other';
  description: string;
}

const LOGISTICS_POLICY_TEMPLATES: PolicyTemplate[] = [
  {
    title: 'Anti-Bribery and Corruption Policy',
    category: 'conduct',
    description:
      'Prohibits bribery and corruption in all forms, with specific provisions addressing facilitation payments on the Nigeria corridor. Establishes procedures for reporting and managing bribery risks under the UK Bribery Act 2010. Required for the "adequate procedures" defence under section 7 of the Act.',
  },
  {
    title: 'Data Protection Policy',
    category: 'privacy',
    description:
      'Comprehensive data protection policy covering compliance with UK GDPR and the Nigeria Data Protection Act (NDPA). Covers lawful bases for processing, data subject rights, retention schedules, third-party processor controls, and international data transfers on the UK-Nigeria corridor.',
  },
  {
    title: 'Record of Processing Activities (ROPA)',
    category: 'privacy',
    description:
      'UK GDPR Article 30 mandatory register of all personal data processing activities. Documents: processing purpose, lawful basis, data categories, data subjects, recipients, retention periods, and security measures for each processing activity conducted by the organisation.',
  },
  {
    title: 'Prohibited and Restricted Items Policy',
    category: 'operational',
    description:
      'Defines items prohibited from carriage on the UK-Nigeria corridor, including narcotics, weapons, counterfeit goods, and CITES-listed wildlife. Establishes staff intake procedures, declaration verification requirements, and escalation processes for suspicious or misdeclared consignments.',
  },
  {
    title: 'Whistleblowing Policy',
    category: 'conduct',
    description:
      'Establishes a formal channel for employees and third parties to report suspected illegal activity, regulatory breaches, or serious malpractice without fear of retaliation. Covers UK-specific protections under the Public Interest Disclosure Act 1998 (PIDA).',
  },
  {
    title: 'Business Continuity Plan',
    category: 'operational',
    description:
      'Documents procedures to maintain critical operations during disruptions including customs system outages, carrier failures, regulatory inspections, and emergency events affecting the UK-Nigeria corridor. Defines recovery time objectives, responsible personnel, and communication protocols.',
  },
];

const FINANCE_POLICY_TEMPLATES: PolicyTemplate[] = [
  {
    title: 'Anti-Money Laundering (AML) & Counter-Terrorist Financing Policy',
    category: 'conduct',
    description:
      'Establishes the risk-based AML/CFT programme required under the CBN AML/CFT Regulations and Money Laundering (Prevention & Prohibition) Act. Covers customer risk rating, transaction monitoring, sanctions screening, and Suspicious Transaction Report (STR) filing to the NFIU. Aligned to FATF Recommendations.',
  },
  {
    title: 'Know Your Customer (KYC) & Customer Due Diligence Policy',
    category: 'conduct',
    description:
      'Defines identity verification, beneficial ownership identification, and enhanced due diligence for high-risk and politically exposed persons (PEPs). Sets ongoing monitoring and periodic KYC refresh cycles in line with CBN and SEC customer due diligence requirements.',
  },
  {
    title: 'Data Protection & Privacy Policy (NDPA / GDPR)',
    category: 'privacy',
    description:
      'Governs the lawful processing of customer and employee personal data under the Nigeria Data Protection Act (NDPA) and, where applicable, GDPR. Covers lawful bases, data subject rights, retention, breach notification, and cross-border transfer controls.',
  },
  {
    title: 'Information Security Policy (ISO/IEC 27001)',
    category: 'security',
    description:
      'Sets the information security management system (ISMS) baseline: access control, encryption of data at rest and in transit, secure development, logging and monitoring, and incident response — aligned to ISO/IEC 27001 Annex A controls.',
  },
  {
    title: 'Internal Controls over Financial Reporting (SOX) Policy',
    category: 'finance',
    description:
      'Documents the framework of internal controls over financial reporting (ICFR), including segregation of duties, journal-entry review, reconciliations, and management assessment of control effectiveness in line with SOX Section 404 and the COSO framework.',
  },
  {
    title: 'Conflicts of Interest & Insider Trading Policy',
    category: 'conduct',
    description:
      'Prohibits trading on material non-public information and requires disclosure and management of conflicts of interest, personal account dealing, gifts, and outside business activities, consistent with SEC market-conduct rules.',
  },
  {
    title: 'Consumer Protection & Fair Treatment Policy',
    category: 'conduct',
    description:
      'Implements the CBN Consumer Protection Framework: fair treatment of customers, transparent pricing and disclosures, responsible marketing, and a documented complaints-handling and redress process.',
  },
  {
    title: 'Third-Party & Vendor Risk Management Policy',
    category: 'operational',
    description:
      'Governs due diligence, contractual controls, and ongoing monitoring of outsourced service providers and fintech partners, including concentration risk and exit planning, consistent with CBN outsourcing and operational-resilience expectations.',
  },
  {
    title: 'Business Continuity & Operational Resilience Policy',
    category: 'operational',
    description:
      'Defines recovery time and recovery point objectives for critical banking services, scenario testing, and impact tolerances to maintain continuity during cyber, technology, or third-party disruption.',
  },
  {
    title: 'Whistleblowing Policy',
    category: 'conduct',
    description:
      'Provides a confidential channel for staff and third parties to report fraud, financial-crime, or regulatory breaches without retaliation, with escalation to the Board Audit Committee and, where required, to regulators.',
  },
];

const POLICY_TEMPLATES_BY_CATEGORY: Partial<Record<IndustryCategory, PolicyTemplate[]>> = {
  logistics: LOGISTICS_POLICY_TEMPLATES,
  financial: FINANCE_POLICY_TEMPLATES,
};

export async function seedPoliciesFromIndustry(
  companyId: string,
  industryType: string,
): Promise<void> {
  const templates = POLICY_TEMPLATES_BY_CATEGORY[getIndustryCategory(industryType)];
  if (!templates || templates.length === 0) return;

  const rows = templates.map(t => ({
    company_id: companyId,
    title: t.title,
    category: t.category,
    description: t.description,
    is_active: true,
  }));

  try {
    // ON CONFLICT DO NOTHING via the UNIQUE(company_id, title) constraint
    const { error } = await (supabase as any)
      .from('policies')
      .upsert(rows, { onConflict: 'company_id,title', ignoreDuplicates: true });
    if (error) logger.error('seedPoliciesFromIndustry:', error);
  } catch (err) {
    logger.error('seedPoliciesFromIndustry: unexpected error', err);
  }
}
