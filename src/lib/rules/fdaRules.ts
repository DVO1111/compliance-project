import type { RuleDefinition, CaveatRequirement, ComplianceIssue } from './types';

export const FDA_RULES: RuleDefinition[] = [
  {
    id: 'FDA-001',
    pattern: /\b(cure[sd]?|curing)\b/gi,
    severity: 'Red',
    regulation_cited: 'FDA 21 CFR 202.1 - Prescription Drug Advertising: False or Misleading Claims',
    suggestion: (m) => `Replace "${m}" with "may help manage" or "indicated for the treatment of" with proper context`,
    description: 'Curative claims without adequate substantiation',
    category: 'product_violation',
    jurisdiction: 'usa',
  },
  {
    id: 'FDA-002',
    pattern: /\b(miracle|miraculous|wonder\s+drug)\b/gi,
    severity: 'Red',
    regulation_cited: 'FDA 21 CFR 202.1(e)(6) - Misleading Representation of Drug Efficacy',
    suggestion: () => 'Remove sensationalist language — FDA requires factual, balanced representation of drug benefits',
    description: 'Sensationalist drug efficacy claims',
    category: 'product_violation',
    jurisdiction: 'usa',
  },
  {
    id: 'FDA-003',
    pattern: /\b100\s*%\s*(?:effective|safe|success(?:\s*rate)?)\b/gi,
    severity: 'Red',
    regulation_cited: 'FDA 21 CFR 202.1(e)(6) - Absolute Efficacy/Safety Claims',
    suggestion: () => 'Replace with specific clinical trial results including confidence intervals',
    description: 'Absolute efficacy claims violating fair balance',
    category: 'product_violation',
    jurisdiction: 'usa',
  },
  {
    id: 'FDA-004',
    pattern: /\bno\s+side\s+effects?\b/gi,
    severity: 'Red',
    regulation_cited: 'FDA 21 CFR 202.1(e)(5) - Fair Balance Requirement',
    suggestion: () => 'Must include risk information proportionate to benefit claims per FDA fair balance rules',
    description: 'Missing risk information (fair balance violation)',
    category: 'advertising_violation',
    jurisdiction: 'usa',
  },
  {
    id: 'FDA-005',
    pattern: /\b(?:better|superior|more\s+effective)\s+than\s+[\w\s]+(?:brand|drug|medicine|product)\b/gi,
    severity: 'Red',
    regulation_cited: 'FDA 21 CFR 202.1(e)(6) - Comparative Claims Requiring Substantial Evidence',
    suggestion: () => 'Remove or substantiate with head-to-head clinical trial data — FDA requires substantial evidence for comparative claims',
    description: 'Unsubstantiated comparative superiority claim',
    category: 'product_violation',
    jurisdiction: 'usa',
  },
  {
    id: 'FDA-006',
    pattern: /\bclinically\s+proven\b/gi,
    severity: 'Yellow',
    regulation_cited: 'FDA Guidance on DTC Advertising - Substantiation Standards',
    suggestion: () => 'Replace with "In clinical trials, [drug] was shown to..." with specific data citations',
    description: 'Unsubstantiated clinical proof claim',
    category: 'product_violation',
    jurisdiction: 'usa',
  },
  {
    id: 'FDA-007',
    pattern: /\b(?:completely|totally|absolutely)\s+safe\b/gi,
    severity: 'Red',
    regulation_cited: 'FDA 21 CFR 202.1(e)(5) - Fair Balance: Absolute Safety Claims',
    suggestion: () => 'Replace with balanced safety profile including common adverse reactions from prescribing information',
    description: 'Absolute safety claim violating fair balance',
    category: 'advertising_violation',
    jurisdiction: 'usa',
  },
  {
    id: 'FDA-008',
    pattern: /\bguarantee[sd]?\s+(?:results?|cure|relief|recovery)\b/gi,
    severity: 'Red',
    regulation_cited: 'FDA 21 CFR 202.1(e)(6) - Misleading Guarantees',
    suggestion: () => 'Remove guarantee — FDA prohibits guarantees of drug outcomes; state expected clinical outcomes instead',
    description: 'Guaranteed outcome claims',
    category: 'product_violation',
    jurisdiction: 'usa',
  },
  {
    id: 'FDA-009',
    pattern: /\b(?:the\s+)?(?:best|greatest|finest)\s+(?:medicine|drug|treatment|product)\b/gi,
    severity: 'Yellow',
    regulation_cited: 'FDA 21 CFR 202.1(e)(6) - Superlative Claims',
    suggestion: () => 'Replace superlative with factual, evidence-based descriptor',
    description: 'Superlative claim without substantiation',
    category: 'product_violation',
    jurisdiction: 'usa',
  },
  {
    id: 'FDA-010',
    pattern: /\bnatural\s+(?:means?|equals?|is)\s+safe\b/gi,
    severity: 'Red',
    regulation_cited: 'FDA Dietary Supplement Guidance - Natural vs. Safe Equivalence',
    suggestion: () => 'Remove natural-equals-safe implication — FDA does not equate natural origin with safety',
    description: 'Natural-equals-safe fallacy',
    category: 'product_violation',
    jurisdiction: 'usa',
  },
];

export const FDA_DTC_CAVEATS: CaveatRequirement[] = [
  {
    id: 'FDA-CAV-001',
    triggers: [/.+/s],
    requiredPhrases: [
      /(?:side\s+effects?|adverse\s+(?:effects?|reactions?|events?))/i,
      /(?:risks?\s+(?:include|may\s+include|associated))/i,
      /(?:important\s+safety\s+information)/i,
    ],
    severity: 'Red',
    regulation_cited: 'FDA 21 CFR 202.1(e)(5) - DTC Fair Balance: Risk Information Required',
    issueDescription: 'DTC advertisement missing required risk/side effect information (Fair Balance violation)',
    suggestion: 'Add "Important Safety Information" section listing major risks, side effects, and contraindications as required by FDA fair balance rules',
    category: 'advertising_violation',
    jurisdiction: 'usa',
  },
  {
    id: 'FDA-CAV-002',
    triggers: [/.+/s],
    requiredPhrases: [
      /(?:ask\s+your\s+(?:doctor|healthcare\s+provider))/i,
      /(?:talk\s+to\s+your\s+(?:doctor|healthcare\s+provider))/i,
      /(?:consult\s+(?:your|a)\s+(?:doctor|physician|healthcare))/i,
    ],
    severity: 'Red',
    regulation_cited: 'FDA DTC Guidance - Adequate Provision: Provider Consultation Directive',
    issueDescription: 'Missing healthcare provider consultation directive in DTC content',
    suggestion: 'Add "Ask your doctor if [drug name] is right for you" or similar provider consultation language',
    category: 'advertising_violation',
    jurisdiction: 'usa',
  },
  {
    id: 'FDA-CAV-003',
    triggers: [
      /\bprescription\b/i,
      /\bRx\b/i,
    ],
    requiredPhrases: [
      /(?:brief\s+summary)/i,
      /(?:prescribing\s+information)/i,
      /(?:full\s+prescribing\s+information)/i,
      /(?:see\s+(?:full|complete)\s+(?:prescribing|safety)\s+information)/i,
    ],
    severity: 'Red',
    regulation_cited: 'FDA 21 CFR 202.1(e)(1) - Brief Summary Requirement for Prescription Drug Ads',
    issueDescription: 'Prescription drug advertisement missing brief summary or reference to full prescribing information',
    suggestion: 'Include brief summary of prescribing information or direct readers to full prescribing information',
    category: 'advertising_violation',
    jurisdiction: 'usa',
  },
];

export function scanFdaRules(text: string) {
  const issues: Array<{
    rule: RuleDefinition;
    match: string;
    position: number;
    context: string;
  }> = [];

  for (const rule of FDA_RULES) {
    const regex = new RegExp(rule.pattern.source, rule.pattern.flags);
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      const start = Math.max(0, match.index - 40);
      const end = Math.min(text.length, match.index + match[0].length + 40);
      const context = text.substring(start, end);

      issues.push({
        rule,
        match: match[0],
        position: match.index,
        context,
      });
    }
  }

  return issues;
}

export function scanFdaCaveats(
  text: string,
  platform: string,
  audience: string
): ComplianceIssue[] {
  const issues: ComplianceIssue[] = [];

  for (const caveat of FDA_DTC_CAVEATS) {
    if (caveat.platforms && !caveat.platforms.includes(platform)) continue;
    if (caveat.audiences && !caveat.audiences.includes(audience)) continue;

    const triggered = caveat.triggers.some((trigger) => trigger.test(text));
    if (!triggered) continue;

    const hasRequiredPhrase = caveat.requiredPhrases.some(
      (phrase) => phrase.test(text.toLowerCase()) || phrase.test(text)
    );

    if (!hasRequiredPhrase) {
      issues.push({
        severity: caveat.severity,
        issue: caveat.issueDescription,
        regulation_cited: caveat.regulation_cited,
        suggestion: caveat.suggestion,
        category: caveat.category,
        jurisdiction: 'usa',
      });
    }
  }

  return issues;
}
