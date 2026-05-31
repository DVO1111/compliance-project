import type { RuleDefinition, CaveatRequirement, ComplianceIssue } from './types';

export const WHO_RULES: RuleDefinition[] = [
  {
    id: 'WHO-001',
    pattern: /\b(cure[sd]?|curing)\b/gi,
    severity: 'Red',
    regulation_cited: 'WHO Ethical Criteria for Medicinal Drug Promotion (1988), Criterion 3 - Accuracy of Claims',
    suggestion: (m) => `Replace "${m}" with evidence-based language per WHO ethical promotion criteria`,
    description: 'Curative claims violating WHO ethical criteria',
    category: 'product_violation',
    jurisdiction: 'who',
  },
  {
    id: 'WHO-002',
    pattern: /\b(?:miracle|miraculous|wonder\s+drug)\b/gi,
    severity: 'Red',
    regulation_cited: 'WHO Ethical Criteria for Medicinal Drug Promotion (1988), Criterion 4 - Non-Misleading Promotion',
    suggestion: () => 'Remove sensationalist language — WHO requires all promotion to be reliable, accurate, and non-misleading',
    description: 'Sensationalist language violating WHO criteria',
    category: 'product_violation',
    jurisdiction: 'who',
  },
  {
    id: 'WHO-003',
    pattern: /\bno\s+side\s+effects?\b/gi,
    severity: 'Red',
    regulation_cited: 'WHO Ethical Criteria for Medicinal Drug Promotion (1988), Criterion 7 - Adverse Reaction Disclosure',
    suggestion: () => 'Must disclose known side effects, contraindications, and warnings per WHO ethical standards',
    description: 'Missing adverse effect disclosure',
    category: 'product_violation',
    jurisdiction: 'who',
  },
  {
    id: 'WHO-004',
    pattern: /\b(?:completely|totally|absolutely)\s+safe\b/gi,
    severity: 'Red',
    regulation_cited: 'WHO Ethical Criteria for Medicinal Drug Promotion (1988), Criterion 3 - Accuracy Requirement',
    suggestion: () => 'Replace with balanced safety data — WHO requires safety claims to be based on up-to-date scientific evidence',
    description: 'Absolute safety claims',
    category: 'product_violation',
    jurisdiction: 'who',
  },
  {
    id: 'WHO-005',
    pattern: /\b100\s*%\s*(?:effective|safe|success(?:\s*rate)?)\b/gi,
    severity: 'Red',
    regulation_cited: 'WHO Ethical Criteria for Medicinal Drug Promotion (1988), Criterion 3 - Absolute Efficacy Claims',
    suggestion: () => 'Replace with verifiable clinical data — WHO prohibits unsubstantiated absolute efficacy claims',
    description: 'Absolute percentage efficacy claims',
    category: 'product_violation',
    jurisdiction: 'who',
  },
  {
    id: 'WHO-006',
    pattern: /\bguarantee[sd]?\s+(?:results?|cure|relief|recovery)\b/gi,
    severity: 'Red',
    regulation_cited: 'WHO Ethical Criteria for Medicinal Drug Promotion (1988), Criterion 4 - Guaranteed Outcomes',
    suggestion: () => 'Remove guarantee — WHO ethical criteria prohibit guaranteed outcome claims for medicinal products',
    description: 'Guaranteed outcome claims',
    category: 'product_violation',
    jurisdiction: 'who',
  },
  {
    id: 'WHO-007',
    pattern: /\b(?:better|superior|more\s+effective)\s+than\s+[\w\s]+(?:brand|drug|medicine|product)\b/gi,
    severity: 'Yellow',
    regulation_cited: 'WHO Ethical Criteria for Medicinal Drug Promotion (1988), Criterion 5 - Comparative Claims',
    suggestion: () => 'Comparative claims must be based on appropriate scientific evidence and presented objectively',
    description: 'Comparative claims requiring substantiation',
    category: 'product_violation',
    jurisdiction: 'who',
  },
  {
    id: 'WHO-008',
    pattern: /\bclinically\s+proven\b/gi,
    severity: 'Yellow',
    regulation_cited: 'WHO Ethical Criteria for Medicinal Drug Promotion (1988), Criterion 6 - Scientific Substantiation',
    suggestion: () => 'Replace with "supported by clinical studies [cite reference]" — WHO requires specific scientific references',
    description: 'Unsubstantiated clinical proof claim',
    category: 'product_violation',
    jurisdiction: 'who',
  },
  {
    id: 'WHO-009',
    pattern: /\bnatural\s+(?:means?|equals?|is)\s+safe\b/gi,
    severity: 'Red',
    regulation_cited: 'WHO Traditional Medicine Strategy 2014-2023, Safety Assessment Standard',
    suggestion: () => 'Remove natural-equals-safe implication — WHO emphasizes that natural origin does not guarantee safety',
    description: 'Natural-equals-safe fallacy',
    category: 'product_violation',
    jurisdiction: 'who',
  },
];

export const WHO_CAVEATS: CaveatRequirement[] = [
  {
    id: 'WHO-CAV-001',
    triggers: [/.+/s],
    requiredPhrases: [
      /(?:(?:generic|international\s+non-?proprietary)\s+name|INN)/i,
      /(?:active\s+(?:ingredient|substance))/i,
    ],
    severity: 'Yellow',
    regulation_cited: 'WHO Ethical Criteria for Medicinal Drug Promotion (1988), Criterion 1 - INN/Generic Name Requirement',
    issueDescription: 'Missing international non-proprietary name (INN) or generic name of active ingredient',
    suggestion: 'Include the generic name (INN) of the active ingredient alongside any brand name, as required by WHO ethical criteria',
    category: 'product_violation',
    jurisdiction: 'who',
  },
  {
    id: 'WHO-CAV-002',
    triggers: [/.+/s],
    requiredPhrases: [
      /(?:side\s+effects?|adverse\s+(?:effects?|reactions?)|contraindications?|precautions?|warnings?)/i,
    ],
    severity: 'Red',
    regulation_cited: 'WHO Ethical Criteria for Medicinal Drug Promotion (1988), Criterion 7 - Safety Information',
    issueDescription: 'Missing required safety information (side effects, contraindications, or warnings)',
    suggestion: 'Include information on major adverse reactions, contraindications, warnings, and precautions per WHO ethical criteria',
    category: 'product_violation',
    jurisdiction: 'who',
  },
  {
    id: 'WHO-CAV-003',
    triggers: [/.+/s],
    requiredPhrases: [
      /(?:approved\s+(?:indications?|uses?)|indicated\s+for|therapeutic\s+(?:indications?|uses?))/i,
    ],
    severity: 'Yellow',
    regulation_cited: 'WHO Ethical Criteria for Medicinal Drug Promotion (1988), Criterion 2 - Approved Indications',
    issueDescription: 'Missing statement of approved therapeutic indications',
    suggestion: 'Include the approved therapeutic indication(s) as part of drug promotion per WHO ethical criteria',
    category: 'product_violation',
    jurisdiction: 'who',
  },
];

export function scanWhoRules(text: string) {
  const issues: Array<{
    rule: RuleDefinition;
    match: string;
    position: number;
    context: string;
  }> = [];

  for (const rule of WHO_RULES) {
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

export function scanWhoCaveats(
  text: string,
  platform: string,
  audience: string
): ComplianceIssue[] {
  const issues: ComplianceIssue[] = [];

  for (const caveat of WHO_CAVEATS) {
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
        jurisdiction: 'who',
      });
    }
  }

  return issues;
}
