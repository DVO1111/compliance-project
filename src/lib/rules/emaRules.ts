import type { RuleDefinition, CaveatRequirement, ComplianceIssue } from './types';

export const EMA_RULES: RuleDefinition[] = [
  {
    id: 'EMA-001',
    pattern: /\b(?:ask\s+your\s+doctor\s+about|talk\s+to\s+your\s+doctor\s+about|is\s+[\w\s]+right\s+for\s+you)\b/gi,
    severity: 'Red',
    regulation_cited: 'EU Directive 2001/83/EC, Article 88 - Complete Ban on DTC Advertising for Prescription Medicines',
    suggestion: () => 'Remove DTC language entirely — EU law strictly prohibits direct-to-consumer advertising for prescription medicines',
    description: 'DTC advertising language for prescription drugs (banned in EU)',
    category: 'advertising_violation',
    jurisdiction: 'europe',
  },
  {
    id: 'EMA-002',
    pattern: /\b(cure[sd]?|curing)\b/gi,
    severity: 'Red',
    regulation_cited: 'EU Directive 2001/83/EC, Article 87(3) - Misleading Curative Claims',
    suggestion: (m) => `Replace "${m}" with "indicated for the management of" — curative claims are misleading under EMA standards`,
    description: 'Curative claims violating EMA standards',
    category: 'product_violation',
    jurisdiction: 'europe',
  },
  {
    id: 'EMA-003',
    pattern: /\b(?:miracle|miraculous|wonder\s+drug|breakthrough\s+cure)\b/gi,
    severity: 'Red',
    regulation_cited: 'EU Directive 2001/83/EC, Article 87(3) - Prohibition on Sensationalist Drug Claims',
    suggestion: () => 'Remove sensationalist language — EMA requires factual, non-sensationalist drug promotion',
    description: 'Sensationalist drug promotion language',
    category: 'product_violation',
    jurisdiction: 'europe',
  },
  {
    id: 'EMA-004',
    pattern: /\bno\s+side\s+effects?\b/gi,
    severity: 'Red',
    regulation_cited: 'EU Directive 2001/83/EC, Article 87(3) - Absolute Safety Claims',
    suggestion: () => 'Replace with balanced safety information from the Summary of Product Characteristics (SmPC)',
    description: 'Absolute safety claim violating EU balance requirements',
    category: 'product_violation',
    jurisdiction: 'europe',
  },
  {
    id: 'EMA-005',
    pattern: /\b(?:completely|totally|absolutely)\s+safe\b/gi,
    severity: 'Red',
    regulation_cited: 'EU Directive 2001/83/EC, Article 87(3) - Misleading Safety Representation',
    suggestion: () => 'Remove absolute safety claim — reference SmPC safety profile data instead',
    description: 'Absolute safety representation',
    category: 'product_violation',
    jurisdiction: 'europe',
  },
  {
    id: 'EMA-006',
    pattern: /\b(?:better|superior|more\s+effective)\s+than\s+[\w\s]+(?:brand|drug|medicine|product)\b/gi,
    severity: 'Red',
    regulation_cited: 'EU Directive 2001/83/EC, Article 87(3) - Unsubstantiated Comparative Claims',
    suggestion: () => 'Remove or substantiate with EMA-reviewed comparative efficacy data',
    description: 'Unauthorized comparative claim under EU law',
    category: 'product_violation',
    jurisdiction: 'europe',
  },
  {
    id: 'EMA-007',
    pattern: /\bguarantee[sd]?\s+(?:results?|cure|relief|recovery)\b/gi,
    severity: 'Red',
    regulation_cited: 'EU Directive 2001/83/EC, Article 90(j) - Prohibited Guarantee Claims',
    suggestion: () => 'Remove guarantee — EU law explicitly prohibits guarantees about medicinal product effects',
    description: 'Prohibited guarantee of drug effects',
    category: 'product_violation',
    jurisdiction: 'europe',
  },
  {
    id: 'EMA-008',
    pattern: /\b100\s*%\s*(?:effective|safe|success(?:\s*rate)?)\b/gi,
    severity: 'Red',
    regulation_cited: 'EU Directive 2001/83/EC, Article 87(3) - Absolute Percentage Claims',
    suggestion: () => 'Replace with specific clinical trial data with proper statistical context',
    description: 'Absolute percentage efficacy claims',
    category: 'product_violation',
    jurisdiction: 'europe',
  },
  {
    id: 'EMA-009',
    pattern: /\b(?:the\s+)?only\s+(?:medicine|drug|treatment|product)\s+(?:that|which|to)\b/gi,
    severity: 'Red',
    regulation_cited: 'EU Directive 2001/83/EC, Article 87(3) - Exclusive Treatment Claims',
    suggestion: () => 'Remove exclusivity claim — presenting a product as the sole option is misleading under EU standards',
    description: 'Exclusive/sole treatment claim',
    category: 'product_violation',
    jurisdiction: 'europe',
  },
];

export const EMA_CAVEATS: CaveatRequirement[] = [
  {
    id: 'EMA-CAV-001',
    triggers: [
      /\bprescription\b/i,
      /\bRx\b/i,
      /\bprescribed\b/i,
    ],
    requiredPhrases: [
      /(?:for\s+healthcare\s+professionals?\s+only)/i,
      /(?:this\s+(?:information|material)\s+is\s+(?:intended\s+)?for\s+(?:healthcare|medical)\s+professionals?)/i,
    ],
    severity: 'Red',
    regulation_cited: 'EU Directive 2001/83/EC, Article 88(1) - Prescription Drug Advertising Restricted to HCPs',
    issueDescription: 'Prescription drug content must be explicitly marked for healthcare professionals only',
    suggestion: 'Add "This material is intended for healthcare professionals only" — prescription drug advertising to the public is banned in the EU',
    category: 'advertising_violation',
    jurisdiction: 'europe',
  },
  {
    id: 'EMA-CAV-002',
    triggers: [/.+/s],
    requiredPhrases: [
      /(?:consult\s+(?:your|a)\s+(?:doctor|physician|healthcare))/i,
      /(?:read\s+the\s+(?:package\s+)?leaflet)/i,
      /(?:ask\s+your\s+pharmacist)/i,
    ],
    severity: 'Yellow',
    regulation_cited: 'EU Directive 2001/83/EC, Article 89(b) - OTC Advertising Disclaimer',
    issueDescription: 'Missing mandatory consultation disclaimer for EU market',
    suggestion: 'Add "Read the package leaflet carefully. Consult your doctor or pharmacist for more information"',
    category: 'advertising_violation',
    jurisdiction: 'europe',
    audiences: ['patients', 'general_public'],
  },
];

export function scanEmaRules(text: string) {
  const issues: Array<{
    rule: RuleDefinition;
    match: string;
    position: number;
    context: string;
  }> = [];

  for (const rule of EMA_RULES) {
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

export function scanEmaCaveats(
  text: string,
  platform: string,
  audience: string
): ComplianceIssue[] {
  const issues: ComplianceIssue[] = [];

  for (const caveat of EMA_CAVEATS) {
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
        jurisdiction: 'europe',
      });
    }
  }

  return issues;
}
