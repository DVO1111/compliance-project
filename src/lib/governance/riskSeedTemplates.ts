import { createRisk } from './riskRegisterService';
import { logger } from '../logger';
import { getIndustryCategory, type IndustryCategory } from '../regulatoryProfile';

interface RiskTemplate {
  title: string;
  description: string;
  risk_category: 'security' | 'privacy' | 'operational' | 'financial' | 'legal' | 'compliance';
  risk_level: 'low' | 'medium' | 'high' | 'critical';
}

const LOGISTICS_RISK_TEMPLATES: RiskTemplate[] = [
  {
    title: 'Cargo Theft — Nigerian Last-Mile Route',
    description:
      'Armed or opportunistic theft of cargo during last-mile delivery in Lagos and Port Harcourt corridors. High incidence on night runs without GPS tracking or escort.',
    risk_category: 'operational',
    risk_level: 'critical',
  },
  {
    title: 'Customs Seizure — CN22/CN23 Declaration Error',
    description:
      'Incorrect or incomplete customs declaration leading to NCS or HMRC Border Force seizure and potential penalty. Most common cause: under-declared value or vague item description.',
    risk_category: 'compliance',
    risk_level: 'high',
  },
  {
    title: 'Third-Party Corruption Risk — Customs Facilitation',
    description:
      'Risk that customs brokers or freight agents offer or accept improper payments to expedite clearance, exposing the company to UK Bribery Act liability and ICPC sanctions in Nigeria.',
    risk_category: 'legal',
    risk_level: 'critical',
  },
  {
    title: 'Prohibited Item Throughput — Contraband Not Detected at Intake',
    description:
      'Failure of intake screening to detect prohibited or restricted goods (counterfeit items, CITES-listed wildlife products, unlicensed pharmaceuticals) before they enter the shipment pipeline.',
    risk_category: 'operational',
    risk_level: 'critical',
  },
  {
    title: 'Currency Exposure — NGN/GBP Volatility',
    description:
      'Naira depreciation against sterling erodes margins on UK-Nigeria corridor shipments priced in GBP but with NGN cost bases. No hedging policy currently in place.',
    risk_category: 'financial',
    risk_level: 'medium',
  },
  {
    title: 'NCAA Licence Lapse — Air Freight Disruption',
    description:
      'Failure to renew Nigerian Civil Aviation Authority approvals before expiry would suspend air cargo operations at MMIA, causing shipment backlog and contract breaches.',
    risk_category: 'compliance',
    risk_level: 'high',
  },
  {
    title: 'ICO Enforcement — Customer Data Breach',
    description:
      'Unauthorised disclosure of customer PII (name, address, shipment contents) held in logistics management system could attract ICO fines up to £17.5M under UK GDPR and reputational damage.',
    risk_category: 'privacy',
    risk_level: 'high',
  },
  {
    title: 'OFSI Sanctions Breach — Shipment to Sanctioned Entity',
    description:
      'Inadvertent shipment to or from a party on the UK Office of Financial Sanctions Implementation (OFSI) consolidated list. No automated sanctions screening currently active at booking stage.',
    risk_category: 'legal',
    risk_level: 'critical',
  },
];

const FINANCE_RISK_TEMPLATES: RiskTemplate[] = [
  {
    title: 'Money Laundering / Terrorist Financing Exposure',
    description:
      'Risk that the institution is used to launder proceeds of crime or finance terrorism due to weak customer due diligence, transaction monitoring, or sanctions screening. Attracts CBN/NFIU enforcement and reputational damage.',
    risk_category: 'compliance',
    risk_level: 'critical',
  },
  {
    title: 'Credit Risk — Loan Default & Concentration',
    description:
      'Risk of loss from borrowers failing to meet obligations, worsened by portfolio concentration in a single sector or counterparty. Directly impacts capital adequacy and provisioning under IFRS 9.',
    risk_category: 'financial',
    risk_level: 'high',
  },
  {
    title: 'Market Risk — Interest Rate & FX Volatility',
    description:
      'Earnings and capital exposure to adverse movements in interest rates and NGN/USD exchange rates across the trading and banking book. No formal hedging limits currently ratified.',
    risk_category: 'financial',
    risk_level: 'high',
  },
  {
    title: 'Liquidity Risk — Funding Shortfall',
    description:
      'Risk of being unable to meet obligations as they fall due without incurring unacceptable losses. Monitored via the Liquidity Coverage Ratio (LCR) and Net Stable Funding Ratio (NSFR) under Basel III.',
    risk_category: 'financial',
    risk_level: 'high',
  },
  {
    title: 'Cybersecurity Breach — Customer Financial Data',
    description:
      'Unauthorised access to core banking systems or cardholder data leading to financial loss, PCI-DSS penalties, and loss of customer trust. Threat vectors include phishing, credential theft, and unpatched systems.',
    risk_category: 'security',
    risk_level: 'critical',
  },
  {
    title: 'Data Privacy Breach — PII Exposure (NDPA / GDPR)',
    description:
      'Unauthorised disclosure of customer personal data held across banking platforms could attract NDPC sanctions under the Nigeria Data Protection Act and regulatory fines under GDPR.',
    risk_category: 'privacy',
    risk_level: 'high',
  },
  {
    title: 'Prudential Breach — Capital Adequacy Ratio (Basel / CBN)',
    description:
      'Risk that the Capital Adequacy Ratio falls below the CBN minimum threshold, triggering regulatory intervention, dividend restrictions, or licence conditions.',
    risk_category: 'compliance',
    risk_level: 'high',
  },
  {
    title: 'Fraud — Internal & Transactional Fraud',
    description:
      'Losses from internal collusion, unauthorised transactions, or account takeover. Elevated where segregation of duties and transaction-level controls are weak.',
    risk_category: 'financial',
    risk_level: 'high',
  },
  {
    title: 'Conduct Risk — Mis-selling of Unsuitable Products',
    description:
      'Risk of customer harm and regulatory action from selling products unsuitable to the customer profile, or from unclear disclosures, contrary to the CBN Consumer Protection Framework.',
    risk_category: 'legal',
    risk_level: 'high',
  },
  {
    title: 'Third-Party / Vendor Failure',
    description:
      'Operational disruption or data compromise arising from failure of a critical outsourced provider or fintech partner, including concentration on a single cloud or payments provider.',
    risk_category: 'operational',
    risk_level: 'medium',
  },
];

const RISK_TEMPLATES_BY_CATEGORY: Partial<Record<IndustryCategory, RiskTemplate[]>> = {
  logistics: LOGISTICS_RISK_TEMPLATES,
  financial: FINANCE_RISK_TEMPLATES,
};

export async function seedRisksFromIndustry(companyId: string, industryType: string): Promise<void> {
  const templates = RISK_TEMPLATES_BY_CATEGORY[getIndustryCategory(industryType)];
  if (!templates || templates.length === 0) return;

  const results = await Promise.allSettled(
    templates.map(t =>
      createRisk(companyId, '', {
        title: t.title,
        description: t.description,
        risk_category: t.risk_category,
        risk_level: t.risk_level,
        status: 'identified',
      })
    )
  );

  const failed = results.filter(r => r.status === 'rejected').length;
  if (failed > 0) logger.error(`seedRisksFromIndustry: ${failed} risk(s) failed to insert`);
}
