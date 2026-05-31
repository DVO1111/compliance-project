import type { RuleDefinition } from './types';

export const FORBIDDEN_CLAIM_RULES: RuleDefinition[] = [
  {
    id: 'FC-001',
    pattern: /\b(cure[sd]?|curing)\b/gi,
    severity: 'Red',
    regulation_cited: 'NAFDAC Pharmaceutical Advertising Regulations 2021, Section 2 - Prohibition on Curative Claims',
    suggestion: (m) => `Replace "${m}" with "may help manage" or "supports management of"`,
    description: 'Curative claims for chronic/viral diseases',
  },
  {
    id: 'FC-002',
    pattern: /\b(permanent(?:ly)?)\b/gi,
    severity: 'Red',
    regulation_cited: 'NAFDAC Prohibited Claims Handbook 2026, Section 1.3 - Absolute Outcome Claims',
    suggestion: (m) => `Replace "${m}" with "long-lasting" or "sustained" — absolute permanence claims are prohibited`,
    description: 'Permanent outcome claims',
  },
  {
    id: 'FC-003',
    pattern: /\b(miracle|miraculous)\b/gi,
    severity: 'Red',
    regulation_cited: 'NAFDAC Prohibited Claims Handbook 2026, Section 1.4 - Unsubstantiated Miracle Claims',
    suggestion: (m) => `Replace "${m}" with "effective" or "clinically supported" — miracle claims are unsubstantiated`,
    description: 'Miracle claims',
  },
  {
    id: 'FC-004',
    pattern: /\b(guarantee[sd]?|guaranteeing)\b/gi,
    severity: 'Red',
    regulation_cited: 'NAFDAC Prohibited Claims Handbook 2026, Section 1.2 - Absolute Guarantees',
    suggestion: (m) => `Replace "${m}" with "designed to" or "intended to" — absolute guarantees are not permitted`,
    description: 'Absolute guarantee claims',
  },
  {
    id: 'FC-005',
    pattern: /\b100\s*%\s*(?:effective|safe|success(?:\s*rate)?)\b/gi,
    severity: 'Red',
    regulation_cited: 'NAFDAC Pharmaceutical Advertising Regulations 2021, Section 2.5 - Absolute Efficacy/Safety Claims',
    suggestion: () => 'Replace with "clinically shown to be effective" — absolute percentage claims require irrefutable evidence',
    description: 'Absolute percentage efficacy claims',
  },
  {
    id: 'FC-006',
    pattern: /\b(completely|totally|absolutely)\s+safe\b/gi,
    severity: 'Red',
    regulation_cited: 'NAFDAC Prohibited Claims Handbook 2026, Section 1.5 - Absolute Safety Claims',
    suggestion: () => 'Replace with "generally well-tolerated" or "favorable safety profile in clinical studies"',
    description: 'Absolute safety claims',
  },
  {
    id: 'FC-007',
    pattern: /\bno\s+side\s+effects?\b/gi,
    severity: 'Red',
    regulation_cited: 'NAFDAC Prohibited Claims Handbook 2026, Section 1.5 - Absolute Safety Claims',
    suggestion: () => 'Replace with "minimal side effects reported in clinical trials" — all medicines carry risk',
    description: 'No side effects claim',
  },
  {
    id: 'FC-008',
    pattern: /\bno\s+contraindications?\b/gi,
    severity: 'Red',
    regulation_cited: 'NAFDAC Prohibited Claims Handbook 2026, Section 1.5 - Absolute Safety Claims',
    suggestion: () => 'Replace with "consult your healthcare provider about potential contraindications"',
    description: 'No contraindications claim',
  },
  {
    id: 'FC-009',
    pattern: /\bFDA\s+approved\b/gi,
    severity: 'Red',
    regulation_cited: 'NAFDAC Prohibited Claims Handbook 2026, Section 1.6 - Unsubstantiated Regulatory Claims',
    suggestion: () => 'Replace with "registered with NAFDAC" or "meets regulatory standards" — FDA claims require proof of US clearance',
    description: 'Unverified FDA approval claim',
  },
  {
    id: 'FC-010',
    pattern: /\bclinically\s+proven\b/gi,
    severity: 'Yellow',
    regulation_cited: 'NAFDAC Prohibited Claims Handbook 2026, Section 1.6 - Clinical Substantiation Requirements',
    suggestion: () => 'Replace with "supported by clinical studies" and cite the specific trial reference',
    description: 'Unsubstantiated clinical proof claim',
  },
  {
    id: 'FC-011',
    pattern: /\bworks?\s+where\s+other\s+(?:medicines?|drugs?|treatments?)\s+fail\b/gi,
    severity: 'Red',
    regulation_cited: 'NAFDAC Prohibited Claims Handbook 2026, Section 1.7 - Comparative Superiority Claims',
    suggestion: () => 'Remove comparative superiority claim — present product benefits on their own merit',
    description: 'Comparative superiority over other treatments',
  },
  {
    id: 'FC-012',
    pattern: /\b(?:can|will|does)\s+replace\s+(?:your\s+)?(?:doctor'?s?\s+)?(?:visits?|appointments?|consultations?)\b/gi,
    severity: 'Red',
    regulation_cited: 'Nigeria Ministry of Health Guidelines, Section 3.4 - Patient-Provider Relationship',
    suggestion: () => 'Remove claim — products must never suggest replacing medical consultations',
    description: 'Claims product replaces medical consultations',
  },
  {
    id: 'FC-013',
    pattern: /\bsuitable\s+for\s+all\s+ages\b/gi,
    severity: 'Yellow',
    regulation_cited: 'NAFDAC Prohibited Claims Handbook 2026, Section 1.8 - Age-Unrestricted Claims',
    suggestion: () => 'Replace with "suitable for adults" or specify the appropriate age range per clinical data',
    description: 'Unrestricted age suitability claim',
  },
  {
    id: 'FC-014',
    pattern: /\bimmediate\s+(?:results?|relief|recovery|effect)\b/gi,
    severity: 'Yellow',
    regulation_cited: 'NAFDAC Prohibited Claims Handbook 2026, Section 1.9 - Timeframe Claims',
    suggestion: (m) => `Replace "${m}" with a specific, evidence-based timeframe such as "relief within [X] hours"`,
    description: 'Immediate results claim',
  },
  {
    id: 'FC-015',
    pattern: /\brevolutionary\s+(?:breakthrough|discovery|treatment|formula)\b/gi,
    severity: 'Yellow',
    regulation_cited: 'NAFDAC Prohibited Claims Handbook 2026, Section 1.10 - Sensationalist Language',
    suggestion: () => 'Replace with "innovative approach" or "advanced formulation" — avoid sensationalist language',
    description: 'Sensationalist breakthrough claims',
  },
  {
    id: 'FC-016',
    pattern: /\bnatural\s+(?:means?|equals?|is)\s+safe\b/gi,
    severity: 'Red',
    regulation_cited: 'NAFDAC Herbal Medicine Standards 2026, Section 4.2 - Natural Safety Equivalence',
    suggestion: () => 'Remove claim — natural origin does not guarantee safety. State actual safety profile instead',
    description: 'Natural-equals-safe fallacy',
  },
  {
    id: 'FC-017',
    pattern: /\bbetter\s+than\s+[\w\s]+(?:brand|drug|medicine|product|treatment)\b/gi,
    severity: 'Red',
    regulation_cited: 'NAFDAC Pharmaceutical Advertising Regulations 2021, Section 5.1 - Unauthorized Comparisons',
    suggestion: () => 'Remove comparative claim — direct product comparisons require NAFDAC pre-approval',
    description: 'Unauthorized comparative claim',
  },
  {
    id: 'FC-018',
    pattern: /\bapproved\s+by\s+(?:the\s+)?(?:Nigerian\s+)?Ministry\s+of\s+Health\b/gi,
    severity: 'Red',
    regulation_cited: 'NAFDAC Prohibited Claims Handbook 2026, Section 1.6 - Unsubstantiated Regulatory Claims',
    suggestion: () => 'Provide documented proof of Ministry approval or remove claim entirely',
    description: 'Unverified Ministry of Health approval claim',
  },
  {
    id: 'FC-019',
    pattern: /\b(?:as\s+)?(?:recommended|prescribed)\s+by\s+(?:all\s+)?doctors?\b/gi,
    severity: 'Yellow',
    regulation_cited: 'NAFDAC Prohibited Claims Handbook 2026, Section 1.11 - Endorsement Claims',
    suggestion: () => 'Remove or qualify — blanket doctor endorsement claims require specific endorsement documentation',
    description: 'Blanket doctor endorsement claim',
  },
  {
    id: 'FC-020',
    pattern: /\b(?:works?\s+for|treats?)\s+all\s+(?:diseases?|conditions?|ailments?|illnesses?)\b/gi,
    severity: 'Red',
    regulation_cited: 'NAFDAC Prohibited Claims Handbook 2026, Section 1.12 - Universal Treatment Claims',
    suggestion: () => 'List only the specific, NAFDAC-approved indications for this product',
    description: 'Universal treatment claim',
  },
  {
    id: 'FC-021',
    pattern: /\b(?:zero|0)\s+risk\b/gi,
    severity: 'Red',
    regulation_cited: 'NAFDAC Prohibited Claims Handbook 2026, Section 1.5 - Absolute Safety Claims',
    suggestion: () => 'Replace with "low-risk profile" and disclose known risks per clinical evidence',
    description: 'Zero risk claim',
  },
  {
    id: 'FC-022',
    pattern: /\bscientifically\s+(?:proven|verified|confirmed)\b/gi,
    severity: 'Yellow',
    regulation_cited: 'NAFDAC Prohibited Claims Handbook 2026, Section 1.6 - Clinical Substantiation Requirements',
    suggestion: () => 'Replace with "supported by scientific studies" and cite the specific studies',
    description: 'Unsubstantiated scientific proof claim',
  },
  {
    id: 'FC-023',
    pattern: /\b(?:instant|overnight)\s+(?:cure|healing|recovery|results?)\b/gi,
    severity: 'Red',
    regulation_cited: 'NAFDAC Prohibited Claims Handbook 2026, Section 1.9 - Timeframe Claims',
    suggestion: () => 'Replace with specific, evidence-based timeframe — instant claims are misleading',
    description: 'Instant cure/result claim',
  },
];

export function scanForbiddenClaims(text: string) {
  const issues: Array<{
    rule: RuleDefinition;
    match: string;
    position: number;
    context: string;
  }> = [];

  for (const rule of FORBIDDEN_CLAIM_RULES) {
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
