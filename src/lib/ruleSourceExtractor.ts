/**
 * Extracts and deduplicates all regulation citations from the hardcoded rule
 * engine files. This creates a canonical list of every regulation the compliance
 * engine references, grouped by jurisdiction and category.
 */

import type { RuleDefinition, CaveatRequirement } from './rules/types';

// ── Rule arrays ──────────────────────────────────────────────────────────
import { FORBIDDEN_CLAIM_RULES } from './rules/forbiddenClaims';
import { SUPERLATIVE_RULES } from './rules/superlatives';
import { MDCN_RULES, PCN_RULES, NMCN_RULES, PROFESSIONAL_ETHICS_CAVEATS } from './rules/professionalEthics';
import { FDA_RULES, FDA_DTC_CAVEATS } from './rules/fdaRules';
import { EMA_RULES, EMA_CAVEATS } from './rules/emaRules';
import { PAN_AFRICAN_RULES, PAN_AFRICAN_CAVEATS } from './rules/panAfricanRules';
import { WHO_RULES, WHO_CAVEATS } from './rules/whoRules';

// ── Types ────────────────────────────────────────────────────────────────

export interface ExtractedRegulationCitation {
    /** The `regulation_cited` string from the rule */
    citation: string;
    /** Inferred jurisdiction from the rule file */
    jurisdiction: string;
    /** Inferred regulatory body */
    source: string;
    /** Applicable category for the regulations table */
    category: 'pharma' | 'medical_devices' | 'clinical_trials' | 'marketing' | 'general';
    /** Rule IDs that reference this citation */
    ruleIds: string[];
    /** Severities of the rules referencing this */
    severities: Set<string>;
    /** Rule descriptions for context */
    descriptions: string[];
}

// ── Helpers ──────────────────────────────────────────────────────────────

function inferJurisdiction(citation: string, ruleJurisdiction?: string): string {
    if (ruleJurisdiction) return ruleJurisdiction;
    const c = citation.toLowerCase();
    if (c.includes('nafdac') || c.includes('nigeria') || c.includes('mdcn') || c.includes('pcn') || c.includes('nmcn')) return 'nigeria';
    if (c.includes('fda') || c.includes('21 cfr')) return 'usa';
    if (c.includes('ema') || c.includes('directive 2001/83') || c.includes('eu regulation')) return 'europe';
    if (c.includes('ama ') || c.includes('afcfta') || c.includes('ecowas') || c.includes('african')) return 'pan_african';
    if (c.includes('who')) return 'who';
    return 'general';
}

function inferSource(citation: string): string {
    const c = citation.toLowerCase();
    if (c.includes('nafdac')) return 'NAFDAC';
    if (c.includes('nigeria ministry') || c.includes('ministry of health')) return 'Ministry of Health';
    if (c.includes('mdcn')) return 'MDCN';
    if (c.includes('pcn')) return 'PCN';
    if (c.includes('nmcn')) return 'NMCN';
    if (c.includes('fda')) return 'FDA';
    if (c.includes('ema')) return 'EMA';
    if (c.includes('ama ')) return 'AMA';
    if (c.includes('afcfta')) return 'AfCFTA';
    if (c.includes('ecowas')) return 'ECOWAS';
    if (c.includes('who')) return 'WHO';
    return 'Regulatory Body';
}

function inferCategory(citation: string, ruleCategory?: string): ExtractedRegulationCitation['category'] {
    if (ruleCategory === 'advertising_violation') return 'marketing';
    if (ruleCategory === 'professional_ethics_violation') return 'pharma';
    const c = citation.toLowerCase();
    if (c.includes('advertising') || c.includes('marketing') || c.includes('digital')) return 'marketing';
    if (c.includes('device')) return 'medical_devices';
    if (c.includes('clinical trial')) return 'clinical_trials';
    if (c.includes('cosmetic') || c.includes('food') || c.includes('supplement')) return 'general';
    return 'pharma';
}

// ── Main extractor ───────────────────────────────────────────────────────

function collectFromRules(
    rules: RuleDefinition[],
    map: Map<string, ExtractedRegulationCitation>,
    fallbackJurisdiction?: string
) {
    for (const rule of rules) {
        const key = rule.regulation_cited;
        const existing = map.get(key);
        if (existing) {
            existing.ruleIds.push(rule.id);
            existing.severities.add(rule.severity);
            existing.descriptions.push(rule.description);
        } else {
            map.set(key, {
                citation: key,
                jurisdiction: inferJurisdiction(key, rule.jurisdiction ?? fallbackJurisdiction),
                source: inferSource(key),
                category: inferCategory(key, rule.category),
                ruleIds: [rule.id],
                severities: new Set([rule.severity]),
                descriptions: [rule.description],
            });
        }
    }
}

function collectFromCaveats(
    caveats: CaveatRequirement[],
    map: Map<string, ExtractedRegulationCitation>,
    fallbackJurisdiction?: string
) {
    for (const caveat of caveats) {
        const key = caveat.regulation_cited;
        const existing = map.get(key);
        if (existing) {
            existing.ruleIds.push(caveat.id);
            existing.severities.add(caveat.severity);
            existing.descriptions.push(caveat.issueDescription);
        } else {
            map.set(key, {
                citation: key,
                jurisdiction: inferJurisdiction(key, caveat.jurisdiction ?? fallbackJurisdiction),
                source: inferSource(key),
                category: inferCategory(key, caveat.category),
                ruleIds: [caveat.id],
                severities: new Set([caveat.severity]),
                descriptions: [caveat.issueDescription],
            });
        }
    }
}

/**
 * Extract all unique regulation citations from the compliance engine's rule files.
 * Returns a deduplicated array of citations with metadata.
 */
export function extractAllRegulationCitations(): ExtractedRegulationCitation[] {
    const map = new Map<string, ExtractedRegulationCitation>();

    // Nigeria — NAFDAC
    collectFromRules(FORBIDDEN_CLAIM_RULES, map, 'nigeria');
    collectFromRules(SUPERLATIVE_RULES, map, 'nigeria');

    // Nigeria — Professional Councils
    collectFromRules(MDCN_RULES, map, 'nigeria');
    collectFromRules(PCN_RULES, map, 'nigeria');
    collectFromRules(NMCN_RULES, map, 'nigeria');
    collectFromCaveats(PROFESSIONAL_ETHICS_CAVEATS, map, 'nigeria');

    // USA — FDA
    collectFromRules(FDA_RULES, map, 'usa');
    collectFromCaveats(FDA_DTC_CAVEATS, map, 'usa');

    // Europe — EMA
    collectFromRules(EMA_RULES, map, 'europe');
    collectFromCaveats(EMA_CAVEATS, map, 'europe');

    // Pan-African — AMA / WHO
    collectFromRules(PAN_AFRICAN_RULES, map, 'pan_african');
    collectFromCaveats(PAN_AFRICAN_CAVEATS, map, 'pan_african');

    // WHO
    collectFromRules(WHO_RULES, map, 'who');
    collectFromCaveats(WHO_CAVEATS, map, 'who');

    // Note: mandatoryCaveats' CAVEAT_REQUIREMENTS are not exported, but all
    // their regulation_cited strings overlap with NAFDAC rules already captured
    // above (NAFDAC Pharmaceutical Advertising Regulations 2021, NAFDAC Prohibited
    // Claims Handbook 2026, etc.). If any are missing, they can be added via a
    // hardcoded fallback array below.
    const mandatoryCaveatCitations = [
        'NAFDAC Pharmaceutical Advertising Regulations 2021, Section 3.1 - Mandatory Safety Disclaimers',
        'NAFDAC Pharmaceutical Advertising Regulations 2021, Section 3.2 - Prescription Product Disclaimers',
        'NAFDAC Herbal Medicine Standards 2026, Section 5.1 - Traditional Medicine Labeling',
        'NAFDAC Food & Dietary Supplement Regulations, Section 3.4 - Supplement Disclaimer Requirements',
        'NAFDAC Pharmaceutical Advertising Regulations 2021, Section 3.3 - Adverse Effects Disclosure',
        'NAFDAC Prohibited Claims Handbook 2026, Section 2.3 - Vulnerable Population Safeguards',
        'NAFDAC Mandatory Labeling Requirements, Section 1.11 - Registration Number Display',
    ];

    for (const citation of mandatoryCaveatCitations) {
        if (!map.has(citation)) {
            map.set(citation, {
                citation,
                jurisdiction: 'nigeria',
                source: inferSource(citation),
                category: inferCategory(citation),
                ruleIds: ['MC-*'],
                severities: new Set(['Red']),
                descriptions: ['Mandatory caveat requirement'],
            });
        }
    }

    return Array.from(map.values());
}
