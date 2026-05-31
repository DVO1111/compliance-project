/**
 * Regulatory Library Service
 * Curated, searchable database of regulations across jurisdictions
 * with enforcement history, warning letters, and guidance documents.
 */
import { supabase } from './supabase';

/* ── Types ──────────────────────────────────────────────────── */

export type Jurisdiction = 'FDA' | 'EMA' | 'MHRA' | 'TGA' | 'NAFDAC' | 'Health Canada' | 'All';

export type DocumentType = 'guidance' | 'warning_letter' | 'enforcement_action' | 'consent_decree' | 'regulation';

export type LibraryDocument = {
  id: string;
  title: string;
  jurisdiction: Jurisdiction;
  documentType: DocumentType;
  summary: string;
  fullText: string;
  sourceUrl: string;
  publishedDate: string;
  therapeuticArea: string;
  relevanceScore: number;
};

/* ── Sample regulatory library data ──────────────────────── */

const LIBRARY_DATA: LibraryDocument[] = [
  // FDA
  { id: 'fda-1', title: 'FDA Guidance: Internet/Social Media Platforms — Presenting Risk and Benefit Information', jurisdiction: 'FDA', documentType: 'guidance', summary: 'Guidance for industry on presenting risk and benefit information for prescription drugs and medical devices on Internet and social media platforms.', fullText: 'This guidance provides recommendations to pharmaceutical and medical device companies on how to present benefit and risk information when using the Internet and social media to promote their products. Key points include: fair balance requirements in character-limited formats, use of hyperlinks to full prescribing information, and monitoring obligations for user-generated content.', sourceUrl: 'https://www.fda.gov/regulatory-information/search-fda-guidance-documents', publishedDate: '2025-06-15', therapeuticArea: 'General', relevanceScore: 95 },
  { id: 'fda-2', title: 'FDA Warning Letter: Off-Label Promotion via Social Media Influencers', jurisdiction: 'FDA', documentType: 'warning_letter', summary: 'Warning letter issued to a pharmaceutical company for off-label promotion of a prescription medication through social media influencer partnerships.', fullText: 'The FDA has determined that your social media campaign, conducted through contracted health influencers, promotes your prescription drug product for uses beyond the approved indications. The posts failed to include adequate risk information, made unsubstantiated superiority claims, and did not include the required indication statement. Corrective action required within 15 business days.', sourceUrl: 'https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/compliance-actions-and-activities/warning-letters', publishedDate: '2025-09-22', therapeuticArea: 'Pharmaceuticals', relevanceScore: 90 },
  { id: 'fda-3', title: 'FDA Enforcement Action: Misleading DTC Television Advertisements', jurisdiction: 'FDA', documentType: 'enforcement_action', summary: 'Enforcement action against misleading direct-to-consumer television advertisements that minimized risk information.', fullText: 'The Office of Prescription Drug Promotion has identified that your DTC television advertisements present risk information in a manner that undermines its communication. Specifically: risk information presented at a faster read speed than benefit claims, use of distracting visuals during the major statement, and failure to include adequate provision for full labeling.', sourceUrl: 'https://www.fda.gov/drugs/enforcement-activities-fda', publishedDate: '2025-03-10', therapeuticArea: 'Cardiovascular', relevanceScore: 85 },

  // EMA
  { id: 'ema-1', title: 'EMA Guideline on E-Labeling for Medicinal Products', jurisdiction: 'EMA', documentType: 'guidance', summary: 'Updated guideline on electronic product information (ePI) for medicinal products authorized in the EU.', fullText: 'This guideline establishes the framework for implementing electronic product information for EU-authorized medicinal products. It covers the technical standards for digital format conversion, accessibility requirements, multilingual support, update procedures, and the relationship between electronic and paper-based product information. All marketing authorization holders must comply by the specified transition date.', sourceUrl: 'https://www.ema.europa.eu/en/human-regulatory/marketing-authorisation', publishedDate: '2025-11-01', therapeuticArea: 'General', relevanceScore: 88 },
  { id: 'ema-2', title: 'EMA Decision on Patient Education Materials Review', jurisdiction: 'EMA', documentType: 'regulation', summary: 'Decision requiring pre-approval of patient education materials that accompany risk management plans.', fullText: 'The Committee for Medicinal Products for Human Use (CHMP) has adopted this decision requiring that all patient education materials forming part of a risk management plan must be submitted for regulatory review and approval before distribution. This includes digital formats, mobile applications, and interactive tools.', sourceUrl: 'https://www.ema.europa.eu/en/human-regulatory', publishedDate: '2025-08-14', therapeuticArea: 'General', relevanceScore: 82 },

  // MHRA
  { id: 'mhra-1', title: 'MHRA Blue Guide: Advertising and Promotion of Medicines in the UK', jurisdiction: 'MHRA', documentType: 'guidance', summary: 'Comprehensive guide covering all aspects of advertising and promoting medicines in the UK market.', fullText: 'The Blue Guide provides detailed guidance on the UK regulatory framework for medicines advertising. It covers: definition of advertising vs. information, rules for healthcare professional promotion, restrictions on direct-to-consumer advertising, digital and social media standards, sampling regulations, hospitality rules, and enforcement mechanisms. Updated to reflect post-Brexit UK regulations.', sourceUrl: 'https://www.gov.uk/government/publications/blue-guide-advertising-and-promoting-medicines', publishedDate: '2025-04-20', therapeuticArea: 'General', relevanceScore: 92 },

  // TGA
  { id: 'tga-1', title: 'TGA Therapeutic Goods Advertising Code 2025', jurisdiction: 'TGA', documentType: 'regulation', summary: 'Updated advertising code including new provisions for digital marketing and influencer content.', fullText: 'The updated Therapeutic Goods Advertising Code introduces provisions addressing modern digital marketing practices. New requirements include: mandatory disclosure of sponsored content, restrictions on testimonials for therapeutic goods, requirements for substantiation of advertising claims, special provisions for social media advertising, and enhanced enforcement mechanisms including civil penalties.', sourceUrl: 'https://www.tga.gov.au/advertising', publishedDate: '2025-07-01', therapeuticArea: 'General', relevanceScore: 87 },

  // NAFDAC
  { id: 'nafdac-1', title: 'NAFDAC Guidelines on Pharmaceutical Advertising and Promotion', jurisdiction: 'NAFDAC', documentType: 'guidance', summary: 'Comprehensive guidelines covering pharmaceutical advertising standards in Nigeria.', fullText: 'These guidelines establish the regulatory framework for pharmaceutical advertising in Nigeria. They cover: prohibited claims (cure for chronic diseases, superiority claims without evidence), required disclaimers, pre-certification requirements for advertisements, sanctions for violations, and special rules for traditional medicine advertising. All pharmaceutical advertisements must be pre-certified by NAFDAC before publication.', sourceUrl: 'https://www.nafdac.gov.ng/guidelines', publishedDate: '2025-01-15', therapeuticArea: 'Pharmaceuticals', relevanceScore: 93 },
  { id: 'nafdac-2', title: 'NAFDAC Enforcement Notice: Digital Marketing Compliance', jurisdiction: 'NAFDAC', documentType: 'enforcement_action', summary: 'Enforcement notice addressing non-compliance in digital pharmaceutical marketing campaigns.', fullText: 'NAFDAC has observed a significant increase in non-compliant digital pharmaceutical marketing campaigns. Common violations include: social media posts without pre-certification, influencer marketing without proper disclaimers, unsubstantiated therapeutic claims, and missing safety information. Companies found in violation face suspension of advertising approval and potential product registration review.', sourceUrl: 'https://www.nafdac.gov.ng/enforcement', publishedDate: '2025-10-05', therapeuticArea: 'Pharmaceuticals', relevanceScore: 88 },

  // Health Canada
  { id: 'hc-1', title: 'Health Canada: Guidance on Direct-to-Consumer Advertising of Prescription Drugs', jurisdiction: 'Health Canada', documentType: 'guidance', summary: 'Framework for permissible direct-to-consumer communication about prescription drugs in Canada.', fullText: 'This guidance clarifies the boundaries of permissible DTC advertising for prescription drugs under the Food and Drugs Act. It distinguishes between reminder ads (name/price/quantity only), help-seeking ads (disease awareness without product mention), and full product ads (currently prohibited for prescription drugs). Social media considerations and patient support programs are also addressed.', sourceUrl: 'https://www.canada.ca/en/health-canada/services/drugs-health-products', publishedDate: '2025-05-30', therapeuticArea: 'General', relevanceScore: 86 },
];

/* ── Search and filter ───────────────────────────────────── */

export function searchLibrary(
  query?: string,
  jurisdiction?: Jurisdiction,
  documentType?: DocumentType,
  therapeuticArea?: string,
): LibraryDocument[] {
  let results = [...LIBRARY_DATA];

  if (jurisdiction && jurisdiction !== 'All') {
    results = results.filter(d => d.jurisdiction === jurisdiction);
  }
  if (documentType) {
    results = results.filter(d => d.documentType === documentType);
  }
  if (therapeuticArea) {
    results = results.filter(d =>
      d.therapeuticArea.toLowerCase().includes(therapeuticArea.toLowerCase())
    );
  }
  if (query && query.trim()) {
    const q = query.toLowerCase();
    results = results.filter(d =>
      d.title.toLowerCase().includes(q) ||
      d.summary.toLowerCase().includes(q) ||
      d.fullText.toLowerCase().includes(q)
    );
  }

  return results.sort((a, b) => b.relevanceScore - a.relevanceScore);
}

/* ── Get all jurisdictions ───────────────────────────────── */

export const JURISDICTIONS: Jurisdiction[] = ['FDA', 'EMA', 'MHRA', 'TGA', 'NAFDAC', 'Health Canada'];

export const DOCUMENT_TYPES: { id: DocumentType; label: string }[] = [
  { id: 'guidance', label: 'Guidance Documents' },
  { id: 'warning_letter', label: 'Warning Letters' },
  { id: 'enforcement_action', label: 'Enforcement Actions' },
  { id: 'consent_decree', label: 'Consent Decrees' },
  { id: 'regulation', label: 'Regulations' },
];

/* ── Get counts by jurisdiction ──────────────────────────── */

export function getJurisdictionStats(): { jurisdiction: string; count: number; latestDate: string }[] {
  const stats: Record<string, { count: number; latestDate: string }> = {};
  for (const doc of LIBRARY_DATA) {
    if (!stats[doc.jurisdiction]) {
      stats[doc.jurisdiction] = { count: 0, latestDate: doc.publishedDate };
    }
    stats[doc.jurisdiction].count++;
    if (doc.publishedDate > stats[doc.jurisdiction].latestDate) {
      stats[doc.jurisdiction].latestDate = doc.publishedDate;
    }
  }
  return Object.entries(stats).map(([j, v]) => ({ jurisdiction: j, ...v }));
}
