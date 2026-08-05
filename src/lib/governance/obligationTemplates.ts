import { supabase } from '../supabase';
import { logger } from '../logger';
import { getIndustryCategory, type IndustryCategory } from '../regulatoryProfile';

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

const FINANCE_OBLIGATION_TEMPLATES: ObligationTemplate[] = [
  {
    title: 'Suspicious Transaction Report (STR) to NFIU',
    description: 'File Suspicious Transaction Reports with the Nigerian Financial Intelligence Unit (NFIU) promptly upon detection, and Currency Transaction Reports (CTRs) above the regulatory threshold, per the Money Laundering (Prevention & Prohibition) Act and CBN AML/CFT Regulations.',
    jurisdiction: 'Nigeria',
    category: 'AML/CFT',
    status: 'monitored',
  },
  {
    title: 'Basel III Capital Adequacy Return (CBN)',
    description: 'Submit periodic capital adequacy returns to the Central Bank of Nigeria demonstrating the Capital Adequacy Ratio (CAR) and buffers meet Basel III / CBN minimum thresholds.',
    jurisdiction: 'Nigeria',
    category: 'Prudential',
    status: 'identified',
  },
  {
    title: 'Liquidity Ratio Returns — LCR / NSFR (CBN)',
    description: 'Report the Liquidity Coverage Ratio and Net Stable Funding Ratio to the CBN on the prescribed cycle to evidence adequate short- and medium-term liquidity under Basel III.',
    jurisdiction: 'Nigeria',
    category: 'Prudential',
    status: 'identified',
  },
  {
    title: 'Quarterly & Annual Financial Statements to SEC',
    description: 'File quarterly and audited annual financial statements prepared under IFRS with the Securities & Exchange Commission and the relevant exchange, within statutory deadlines.',
    jurisdiction: 'Nigeria',
    category: 'Financial Reporting',
    status: 'identified',
  },
  {
    title: 'NDPA Annual Data Protection Audit (NDPC)',
    description: 'Submit the annual data protection audit / compliance return to the Nigeria Data Protection Commission (NDPC) covering data mapping, lawful basis, breaches, and processor controls under the Nigeria Data Protection Act.',
    jurisdiction: 'Nigeria',
    category: 'Data Protection',
    status: 'identified',
  },
  {
    title: 'Consumer Protection Framework Returns (CBN)',
    description: 'Report complaints data and evidence fair-treatment, disclosure, and redress practices to the CBN under the Consumer Protection Framework and Regulations.',
    jurisdiction: 'Nigeria',
    category: 'Consumer Protection',
    status: 'identified',
  },
  {
    title: 'PCI-DSS Annual Compliance Attestation',
    description: 'Complete the annual PCI-DSS assessment (SAQ or Report on Compliance) and Attestation of Compliance for systems that store, process, or transmit cardholder data.',
    jurisdiction: 'Global',
    category: 'Information Security',
    status: 'identified',
  },
  {
    title: 'SOX Section 404 Management Assessment of ICFR',
    description: 'Perform and document annual management assessment of the effectiveness of internal controls over financial reporting, with external auditor attestation, per Sarbanes-Oxley Section 404.',
    jurisdiction: 'USA',
    category: 'Financial Controls',
    status: 'identified',
  },
];

const OBLIGATION_TEMPLATES_BY_CATEGORY: Partial<Record<IndustryCategory, ObligationTemplate[]>> = {
  logistics: LOGISTICS_UK_NIGERIA_TEMPLATES,
  financial: FINANCE_OBLIGATION_TEMPLATES,
};

/**
 * Seeds pre-built obligation templates for a company based on its industry type.
 * Called once at the end of onboarding — does NOT validate permissions (system operation).
 */
export async function seedObligationsFromIndustry(
  companyId: string,
  industryType: string,
): Promise<void> {
  const templates = OBLIGATION_TEMPLATES_BY_CATEGORY[getIndustryCategory(industryType)];
  if (!templates || templates.length === 0) return;

  try {
    const rows = templates.map(t => ({
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
