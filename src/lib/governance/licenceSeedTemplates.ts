import { supabase } from '../supabase';
import { logger } from '../logger';

interface LicenceTemplate {
  name: string;
  regulatory_body: string;
  notes: string;
  renewal_lead_days: number;
}

const LOGISTICS_LICENCE_TEMPLATES: LicenceTemplate[] = [
  {
    name: 'CAC Company Registration',
    regulatory_body: 'Corporate Affairs Commission (CAC), Nigeria',
    notes: 'Annual confirmation and renewal of company registration with the Nigerian CAC. Annual returns must be filed; failure attracts late filing penalties.',
    renewal_lead_days: 60,
  },
  {
    name: 'Nigerian Customs Service Agent Registration',
    regulatory_body: 'Nigerian Customs Service (NCS)',
    notes: 'Licence required to act as a licensed clearing and forwarding agent. Entities processing customs declarations on behalf of importers/exporters must be registered with NCS.',
    renewal_lead_days: 90,
  },
  {
    name: 'NCAA Air Cargo Agent Approval',
    regulatory_body: 'Nigerian Civil Aviation Authority (NCAA)',
    notes: 'Approval required for entities handling air freight on the Nigeria corridor. Renew in accordance with current NCAA requirements and keep certificates on file.',
    renewal_lead_days: 90,
  },
  {
    name: 'UK Companies House — Annual Confirmation Statement',
    regulatory_body: 'Companies House, United Kingdom',
    notes: 'Annual Confirmation Statement (CS01) confirming company details on the public register are accurate. Due within 14 days of the review date. Filing fee applies.',
    renewal_lead_days: 30,
  },
  {
    name: 'ICO Data Protection Registration',
    regulatory_body: 'Information Commissioner\'s Office (ICO), United Kingdom',
    notes: 'Annual ICO registration as a data controller. Required for any organisation processing personal data in the UK. Fee is tiered by organisation size and turnover.',
    renewal_lead_days: 60,
  },
  {
    name: 'HMRC VAT Registration',
    regulatory_body: 'HM Revenue & Customs (HMRC)',
    notes: 'VAT registration for businesses above the £90,000 threshold. Quarterly VAT returns required. Review registration status annually; deregistration threshold is £88,000.',
    renewal_lead_days: 30,
  },
  {
    name: 'HMRC SEIS Advance Assurance',
    regulatory_body: 'HM Revenue & Customs (HMRC)',
    notes: 'SEIS advance assurance if applicable to investor tax relief. Annual compliance statement may be required while investors hold SEIS shares. Track to avoid inadvertent disqualification.',
    renewal_lead_days: 90,
  },
  {
    name: 'NITDA Data Controller Registration',
    regulatory_body: 'National Information Technology Development Agency (NITDA), Nigeria',
    notes: 'Annual data audit report required under the Nigeria Data Protection Act (NDPA). Required for organisations processing Nigerian citizens\' personal data. Submitted to NITDA annually.',
    renewal_lead_days: 90,
  },
  {
    name: 'UK Export Control Organisation Licence Review',
    regulatory_body: 'Export Control Joint Unit (ECJU), Department for Business and Trade',
    notes: 'Review of export control obligations via SPIRE portal. Open or Standard Individual Export Licences required for controlled goods (dual-use, military, or embargoed destinations). Review scope annually.',
    renewal_lead_days: 120,
  },
];

export async function seedLicencesFromIndustry(
  companyId: string,
  industryType: string,
): Promise<void> {
  if (industryType.trim().toLowerCase() !== 'logistics & courier') return;

  const placeholderExpiry = new Date();
  placeholderExpiry.setFullYear(placeholderExpiry.getFullYear() + 1);
  const expiryStr = placeholderExpiry.toISOString().split('T')[0];

  const rows = LOGISTICS_LICENCE_TEMPLATES.map(t => ({
    company_id: companyId,
    name: t.name,
    licence_type: 'other' as const,
    regulatory_body: t.regulatory_body,
    notes: t.notes,
    renewal_lead_days: t.renewal_lead_days,
    expiry_date: expiryStr,
  }));

  try {
    const { error } = await (supabase as any).from('regulatory_licences').insert(rows);
    if (error) logger.error('seedLicencesFromIndustry:', error);
  } catch (err) {
    logger.error('seedLicencesFromIndustry: unexpected error', err);
  }
}
