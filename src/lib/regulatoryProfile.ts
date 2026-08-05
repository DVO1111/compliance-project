/**
 * regulatoryProfile
 *
 * Single source of truth mapping a company's INDUSTRY (chosen at signup /
 * onboarding) + a JURISDICTION to the regulator that actually oversees that
 * industry in that market.
 *
 * The platform was originally pharma-only, so regulator names like "NAFDAC"
 * were hardcoded everywhere. This module lets the UI show the correct body —
 * e.g. Financial Services in Nigeria → CBN / SEC, not NAFDAC.
 */

export type JurisdictionId = 'nigeria' | 'usa' | 'europe' | 'pan_african';

/** Broad regulatory family an industry belongs to. */
export type IndustryCategory = 'life_sciences' | 'financial' | 'advertising' | 'logistics' | 'generic';

export interface RegulatorInfo {
  /** Short badge label, e.g. "CBN/SEC". */
  short: string;
  /** Full selector label, e.g. "Nigeria (CBN / SEC)". */
  label: string;
  /** One-line description of what the regulator covers. */
  description: string;
}

/** The four concrete jurisdictions (excludes the "all" pseudo-option). */
export const JURISDICTION_IDS: JurisdictionId[] = ['nigeria', 'usa', 'europe', 'pan_african'];

/** Country/region display names — independent of industry. */
export const JURISDICTION_LABELS: Record<JurisdictionId, string> = {
  nigeria: 'Nigeria',
  usa: 'North America',
  europe: 'Europe',
  pan_african: 'Pan-African',
};

export function getIndustryCategory(industryType: string | null | undefined): IndustryCategory {
  return categorize(industryType);
}

function categorize(industryType: string | null | undefined): IndustryCategory {
  const s = (industryType ?? '').trim().toLowerCase();
  if (!s) return 'generic';

  if (s.includes('financial') || s.includes('fintech') || s.includes('bank') || s.includes('insurance')) {
    return 'financial';
  }
  if (s.includes('advertising') || s.includes('marketing agency') || s.includes('agency')) {
    return 'advertising';
  }
  if (s.includes('logistics') || s.includes('courier') || s.includes('shipping') || s.includes('freight')) {
    return 'logistics';
  }
  if (
    s.includes('pharma') || s.includes('biotech') || s.includes('medical') ||
    s.includes('cosmetic') || s.includes('food') || s.includes('nutra') ||
    s.includes('health') || s.includes('research organization') || s.includes('beverage')
  ) {
    return 'life_sciences';
  }
  return 'generic';
}

const REGULATORS: Record<IndustryCategory, Record<JurisdictionId, RegulatorInfo>> = {
  life_sciences: {
    nigeria:     { short: 'NAFDAC',       label: 'Nigeria (NAFDAC / Councils)', description: 'NAFDAC + MDCN, PCN, NMCN ethics' },
    usa:         { short: 'FDA',          label: 'North America (FDA)',         description: 'FDA DTC balance requirements' },
    europe:      { short: 'EMA',          label: 'Europe (EMA)',                description: 'Strict DTC ban for Rx drugs' },
    pan_african: { short: 'AMA',          label: 'Pan-African (AMA / AfCFTA)',  description: 'African Medicines Agency + WHO' },
  },
  financial: {
    nigeria:     { short: 'CBN/SEC',      label: 'Nigeria (CBN / SEC)',         description: 'Central Bank of Nigeria, SEC, NDIC' },
    usa:         { short: 'SEC/FINRA',    label: 'North America (SEC / FINRA)',  description: 'SEC, FINRA, CFPB oversight' },
    europe:      { short: 'ESMA/EBA',     label: 'Europe (ESMA / EBA)',         description: 'ESMA, EBA, MiFID II / GDPR' },
    pan_african: { short: 'AfCFTA',       label: 'Pan-African (AfCFTA)',        description: 'Regional financial harmonization' },
  },
  advertising: {
    nigeria:     { short: 'ARCON',        label: 'Nigeria (ARCON)',             description: 'Advertising Regulatory Council of Nigeria' },
    usa:         { short: 'FTC',          label: 'North America (FTC)',         description: 'FTC truth-in-advertising rules' },
    europe:      { short: 'EASA',         label: 'Europe (EASA)',               description: 'European Advertising Standards Alliance' },
    pan_african: { short: 'AU/AfCFTA',    label: 'Pan-African (AU / AfCFTA)',   description: 'Regional advertising standards' },
  },
  logistics: {
    nigeria:     { short: 'Customs',      label: 'Nigeria (Customs / NIPOST)',  description: 'Nigeria Customs Service + NIPOST' },
    usa:         { short: 'CBP',          label: 'North America (CBP)',         description: 'US Customs and Border Protection' },
    europe:      { short: 'EU Customs',   label: 'Europe (EU Customs)',         description: 'Union Customs Code' },
    pan_african: { short: 'AfCFTA',       label: 'Pan-African (AfCFTA)',        description: 'Regional trade & customs harmonization' },
  },
  generic: {
    nigeria:     { short: 'Nigeria',      label: 'Nigeria',                     description: 'Federal regulatory requirements' },
    usa:         { short: 'N. America',   label: 'North America',               description: 'Federal regulatory requirements' },
    europe:      { short: 'Europe',       label: 'Europe',                      description: 'EU regulatory requirements' },
    pan_african: { short: 'Pan-African',  label: 'Pan-African (AfCFTA)',        description: 'Regional harmonization' },
  },
};

/**
 * Returns the regulator that oversees the given industry in the given
 * jurisdiction. Falls back to a generic country label for unknown industries.
 */
export function getRegulatorInfo(
  industryType: string | null | undefined,
  jurisdiction: JurisdictionId
): RegulatorInfo {
  return REGULATORS[categorize(industryType)][jurisdiction];
}
