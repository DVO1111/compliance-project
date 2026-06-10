import { createRisk } from './riskRegisterService';
import { logger } from '../logger';

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

export async function seedRisksFromIndustry(companyId: string, industryType: string): Promise<void> {
  if (industryType.trim().toLowerCase() !== 'logistics & courier') return;

  const results = await Promise.allSettled(
    LOGISTICS_RISK_TEMPLATES.map(t =>
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
