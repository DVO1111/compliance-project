import { supabase } from '../supabase';
import { logger } from '../logger';

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

export async function seedPoliciesFromIndustry(
  companyId: string,
  industryType: string,
): Promise<void> {
  if (industryType.trim().toLowerCase() !== 'logistics & courier') return;

  const rows = LOGISTICS_POLICY_TEMPLATES.map(t => ({
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
