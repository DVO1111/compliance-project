export type IssueSeverity = 'Red' | 'Yellow';

export type IssueCategory = 'product_violation' | 'professional_ethics_violation' | 'advertising_violation';

export type Jurisdiction = 'nigeria' | 'usa' | 'europe' | 'pan_african' | 'all';

export interface JurisdictionConfig {
  id: Jurisdiction;
  label: string;
  shortLabel: string;
  description: string;
  bodies: string[];
}

export const JURISDICTIONS: Record<Exclude<Jurisdiction, 'all'>, JurisdictionConfig> = {
  nigeria: {
    id: 'nigeria',
    label: 'Nigeria (NAFDAC / Councils)',
    shortLabel: 'NAFDAC',
    description: 'NAFDAC regulations, MDCN, PCN, and NMCN professional council ethics',
    bodies: ['NAFDAC', 'MDCN', 'PCN', 'NMCN'],
  },
  usa: {
    id: 'usa',
    label: 'North America (FDA)',
    shortLabel: 'FDA',
    description: 'FDA Direct-to-Consumer advertising requirements with risk/benefit balance',
    bodies: ['FDA'],
  },
  europe: {
    id: 'europe',
    label: 'Europe (EMA)',
    shortLabel: 'EMA',
    description: 'EMA strict ban on DTC ads for prescription drugs',
    bodies: ['EMA'],
  },
  pan_african: {
    id: 'pan_african',
    label: 'Pan-African (AMA / AfCFTA)',
    shortLabel: 'AMA',
    description: 'African Medicines Agency and ECOWAS harmonization requirements',
    bodies: ['AMA', 'AfCFTA', 'ECOWAS'],
  },
};

export const WHO_CONFIG = {
  id: 'who' as const,
  label: 'WHO Ethical Criteria',
  description: 'WHO general ethical criteria for medicinal drug promotion',
};

export interface ComplianceIssue {
  severity: IssueSeverity;
  issue: string;
  regulation_cited: string;
  suggestion: string;
  category?: IssueCategory;
  jurisdiction?: string;
}

export interface RuleMatch {
  matched: string;
  position: number;
  context: string;
}

export interface RuleDefinition {
  id: string;
  pattern: RegExp;
  severity: IssueSeverity;
  regulation_cited: string;
  suggestion: (matched: string) => string;
  description: string;
  category?: IssueCategory;
  jurisdiction?: string;
}

export interface CaveatRequirement {
  id: string;
  triggers: RegExp[];
  requiredPhrases: RegExp[];
  severity: IssueSeverity;
  regulation_cited: string;
  issueDescription: string;
  suggestion: string;
  platforms?: string[];
  audiences?: string[];
  category?: IssueCategory;
  jurisdiction?: string;
}
