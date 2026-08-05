import { supabase } from '../supabase';
import { logger } from '../logger';
import { createFramework } from '../grc/grcFrameworkService';
import { createControl } from '../grc/grcControlsService';
import { getIndustryCategory, type IndustryCategory } from '../regulatoryProfile';

/**
 * grcSeedTemplates
 *
 * Seeds a starter set of GRC frameworks (with a few illustrative controls each)
 * appropriate to the company's industry, so a domain expert lands on a populated
 * Governance & Policy workspace instead of empty tables. Auto-run at onboarding.
 */

interface ControlTemplate {
  reference_code: string;
  title: string;
  description: string;
  domain_category: string;
}

interface FrameworkTemplate {
  name: string;
  version: string;
  description: string;
  controls: ControlTemplate[];
}

const FINANCE_FRAMEWORKS: FrameworkTemplate[] = [
  {
    name: 'Sarbanes-Oxley (SOX)',
    version: 'Section 404',
    description: 'Internal controls over financial reporting (ICFR) and management assessment, aligned to the COSO framework.',
    controls: [
      { reference_code: 'SOX-ITGC-01', title: 'IT General Controls — Access Management', description: 'Logical access to financial systems is provisioned on least-privilege and reviewed periodically.', domain_category: 'IT General Controls' },
      { reference_code: 'SOX-ITGC-02', title: 'Change Management', description: 'Changes to financially-significant systems are tested, approved, and segregated from development.', domain_category: 'IT General Controls' },
      { reference_code: 'SOX-ELC-01', title: 'Segregation of Duties', description: 'Incompatible duties across initiation, authorisation, and recording are segregated.', domain_category: 'Entity-Level Controls' },
      { reference_code: 'SOX-FIN-01', title: 'Financial Close & Reconciliation Review', description: 'Period-end journal entries and account reconciliations are independently reviewed and approved.', domain_category: 'Financial Reporting' },
    ],
  },
  {
    name: 'Basel III',
    version: '2023',
    description: 'Prudential capital, leverage, and liquidity standards for banking institutions.',
    controls: [
      { reference_code: 'BASEL-CAP-01', title: 'Capital Adequacy Ratio Monitoring', description: 'CAR is calculated and monitored against CBN/Basel minimum thresholds with escalation on breach.', domain_category: 'Capital' },
      { reference_code: 'BASEL-LIQ-01', title: 'Liquidity Coverage Ratio (LCR)', description: 'High-quality liquid assets are maintained to cover 30-day net cash outflows.', domain_category: 'Liquidity' },
      { reference_code: 'BASEL-LEV-01', title: 'Leverage Ratio', description: 'Tier 1 capital to total exposure is monitored against the regulatory leverage floor.', domain_category: 'Capital' },
    ],
  },
  {
    name: 'PCI-DSS',
    version: 'v4.0',
    description: 'Payment Card Industry Data Security Standard for cardholder data environments.',
    controls: [
      { reference_code: 'PCI-3', title: 'Protect Stored Cardholder Data', description: 'Cardholder data is encrypted at rest and retention is minimised.', domain_category: 'Data Protection' },
      { reference_code: 'PCI-1', title: 'Network Segmentation & Firewalls', description: 'The cardholder data environment is segmented and protected by firewall controls.', domain_category: 'Network Security' },
      { reference_code: 'PCI-7', title: 'Restrict Access by Business Need-to-Know', description: 'Access to cardholder data is restricted on least-privilege.', domain_category: 'Access Control' },
      { reference_code: 'PCI-11', title: 'Vulnerability Management & Testing', description: 'Regular vulnerability scans and penetration tests are performed and remediated.', domain_category: 'Security Testing' },
    ],
  },
  {
    name: 'ISO/IEC 27001',
    version: '2022',
    description: 'Information Security Management System (ISMS) requirements and Annex A controls.',
    controls: [
      { reference_code: 'ISO-A5', title: 'Information Security Policies', description: 'A documented, approved, and communicated set of information security policies is maintained.', domain_category: 'Governance' },
      { reference_code: 'ISO-A8', title: 'Access Control', description: 'Access to information and systems is governed by a formal access-control policy.', domain_category: 'Access Control' },
      { reference_code: 'ISO-A16', title: 'Incident Management', description: 'Security incidents are detected, reported, and responded to under a defined process.', domain_category: 'Operations' },
      { reference_code: 'ISO-A17', title: 'Business Continuity', description: 'Information security continuity is embedded in the organisation\'s continuity plans.', domain_category: 'Resilience' },
    ],
  },
  {
    name: 'AML/CFT Program (FATF / CBN)',
    version: '2024',
    description: 'Anti-Money Laundering and Counter-Terrorist Financing programme aligned to FATF Recommendations and CBN regulations.',
    controls: [
      { reference_code: 'AML-CDD-01', title: 'Customer Due Diligence (KYC)', description: 'Identity, beneficial ownership, and risk rating are verified at onboarding and refreshed periodically.', domain_category: 'Customer Due Diligence' },
      { reference_code: 'AML-TM-01', title: 'Transaction Monitoring', description: 'Transactions are monitored against typologies and thresholds to detect suspicious activity.', domain_category: 'Monitoring' },
      { reference_code: 'AML-SCR-01', title: 'Sanctions & PEP Screening', description: 'Customers and payments are screened against sanctions and politically-exposed-person lists.', domain_category: 'Screening' },
      { reference_code: 'AML-REP-01', title: 'Suspicious Transaction Reporting', description: 'Suspicious activity is escalated and reported to the NFIU within regulatory timeframes.', domain_category: 'Reporting' },
    ],
  },
];

const FRAMEWORKS_BY_CATEGORY: Partial<Record<IndustryCategory, FrameworkTemplate[]>> = {
  financial: FINANCE_FRAMEWORKS,
};

/**
 * Seeds GRC frameworks + controls for the company's industry. Idempotent:
 * skips entirely if the company already has any GRC frameworks.
 */
export async function seedGrcFromIndustry(
  companyId: string,
  industryType: string,
  userId: string,
): Promise<void> {
  const templates = FRAMEWORKS_BY_CATEGORY[getIndustryCategory(industryType)];
  if (!templates || templates.length === 0) return;

  try {
    // Idempotency guard — don't double-seed if frameworks already exist.
    const { count } = await (supabase as any)
      .from('grc_frameworks')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId);
    if (count && count > 0) return;

    for (const fw of templates) {
      try {
        const framework = await createFramework(
          {
            company_id: companyId,
            name: fw.name,
            description: fw.description,
            version: fw.version,
            status: 'active',
          },
          userId,
        );
        if (!framework) continue;

        await Promise.allSettled(
          fw.controls.map(c =>
            createControl(
              {
                company_id: companyId,
                framework_id: framework.id,
                reference_code: c.reference_code,
                title: c.title,
                description: c.description,
                domain_category: c.domain_category,
                status: 'active',
              },
              userId,
            )
          )
        );
      } catch (err) {
        logger.error(`seedGrcFromIndustry: failed to seed framework "${fw.name}"`, err);
      }
    }
  } catch (err) {
    logger.error('seedGrcFromIndustry: unexpected error', err);
  }
}
