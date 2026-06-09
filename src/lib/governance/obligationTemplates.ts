import { supabase } from '../supabase';
import { logger } from '../logger';

interface ObligationTemplate {
  title: string;
  description: string;
  jurisdiction: string;
  category: string;
  status: 'identified' | 'implemented' | 'monitored';
}

const LOGISTICS_UK_NIGERIA_TEMPLATES: ObligationTemplate[] = [
  {
    title: 'UK VAT Return (Quarterly)',
    description: 'Submit quarterly VAT return to HMRC. Due one month and seven days after the end of each VAT accounting period. Applies to VAT-registered businesses above the £85,000 threshold.',
    jurisdiction: 'UK',
    category: 'Tax',
    status: 'identified',
  },
  {
    title: 'Corporation Tax Return (Annual)',
    description: 'File annual Corporation Tax return (CT600) with HMRC. Due 12 months after the end of the accounting period. Payment of tax owed is due 9 months and 1 day after the period end.',
    jurisdiction: 'UK',
    category: 'Tax',
    status: 'identified',
  },
  {
    title: 'Companies House Confirmation Statement (Annual)',
    description: 'Submit annual Confirmation Statement (CS01) to Companies House confirming that company details are accurate. Due within 14 days of the review date (anniversary of incorporation or last confirmation statement).',
    jurisdiction: 'UK',
    category: 'Corporate Governance',
    status: 'identified',
  },
  {
    title: 'ICO Data Protection Registration Renewal (Annual)',
    description: 'Renew registration with the Information Commissioner\'s Office (ICO) as a data controller. Required annually for any organisation that processes personal data. Fee determined by organisation size.',
    jurisdiction: 'UK',
    category: 'Data Protection',
    status: 'identified',
  },
  {
    title: 'SEIS Compliance Statement (Annual)',
    description: 'Submit annual SEIS compliance statement to HMRC confirming the company continues to meet SEIS qualifying conditions. Required as long as investors hold SEIS shares (typically first 3 years). Failure can invalidate investor tax relief.',
    jurisdiction: 'UK',
    category: 'Investment Compliance',
    status: 'identified',
  },
  {
    title: 'CAC Annual Return (Annual)',
    description: 'File annual return with the Corporate Affairs Commission (CAC) in Nigeria. Must be filed within 42 days of each anniversary of incorporation. Failure attracts penalties and can lead to company striking-off.',
    jurisdiction: 'Nigeria',
    category: 'Corporate Governance',
    status: 'identified',
  },
  {
    title: 'NCAA Air Cargo Agent Approval Renewal',
    description: 'Renew air cargo agent approval with the Nigerian Civil Aviation Authority (NCAA). Required for any entity handling air freight on the Nigeria corridor. Renewal period and fee set by NCAA regulations.',
    jurisdiction: 'Nigeria',
    category: 'Regulatory Licence',
    status: 'identified',
  },
  {
    title: 'NDPR Annual Data Audit Report (NITDA)',
    description: 'Submit annual data audit report to the National Information Technology Development Agency (NITDA) under the Nigeria Data Protection Regulation (NDPR). Required for organisations processing Nigerian citizens\' personal data. Report must cover data mapping, lawful basis, retention, incidents, and third-party processors.',
    jurisdiction: 'Nigeria',
    category: 'Data Protection',
    status: 'identified',
  },
];

/**
 * Seeds pre-built obligation templates for a company based on its industry type.
 * Called once at the end of onboarding — does NOT validate permissions (system operation).
 */
export async function seedObligationsFromIndustry(
  companyId: string,
  industryType: string,
): Promise<void> {
  const industry = industryType.trim().toLowerCase();
  if (industry !== 'logistics & courier') return;

  try {
    const rows = LOGISTICS_UK_NIGERIA_TEMPLATES.map(t => ({
      ...t,
      company_id: companyId,
    }));

    const { error } = await (supabase as any).from('regulatory_obligations').insert(rows);
    if (error) {
      logger.error('seedObligationsFromIndustry: insert failed', error);
    }
  } catch (err) {
    logger.error('seedObligationsFromIndustry: unexpected error', err);
  }
}
