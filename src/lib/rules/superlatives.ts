import type { RuleDefinition } from './types';

export const SUPERLATIVE_RULES: RuleDefinition[] = [
  {
    id: 'SL-001',
    pattern: /\b(?:the\s+)?(?:best|greatest|finest)\s+(?:medicine|drug|treatment|product|remedy|solution|cure)\b/gi,
    severity: 'Yellow',
    regulation_cited: 'NAFDAC Pharmaceutical Advertising Regulations 2021, Section 5.2 - Superlative Claims',
    suggestion: () => 'Replace superlative with factual descriptor, e.g., "an effective treatment" or "a well-regarded option"',
    description: 'Superlative "best/greatest" claim about product',
  },
  {
    id: 'SL-002',
    pattern: /\b(?:#\s*1|number\s*one|no\.?\s*1)\s+(?:in|for|among|choice|brand|medicine|drug|product|treatment)?\b/gi,
    severity: 'Yellow',
    regulation_cited: 'NAFDAC Pharmaceutical Advertising Regulations 2021, Section 5.2 - Superlative Claims',
    suggestion: () => 'Remove "#1" claim or provide verifiable market data from an independent source',
    description: 'Number one ranking claim',
  },
  {
    id: 'SL-003',
    pattern: /\b(?:most\s+(?:effective|powerful|potent|advanced|trusted|recommended|popular|preferred))\b/gi,
    severity: 'Yellow',
    regulation_cited: 'NAFDAC Pharmaceutical Advertising Regulations 2021, Section 5.2 - Superlative Claims',
    suggestion: (m) => `Replace "${m}" with "highly effective" or "widely used" — superlatives require independent verification`,
    description: 'Superlative "most" modifier claim',
  },
  {
    id: 'SL-004',
    pattern: /\b(superior|unmatched|unrivaled|unparalleled|unsurpassed|unbeatable|incomparable)\b/gi,
    severity: 'Yellow',
    regulation_cited: 'NAFDAC Pharmaceutical Advertising Regulations 2021, Section 5.1 - Unauthorized Comparisons',
    suggestion: (m) => `Replace "${m}" with "effective" or "high-quality" — implicit comparative superiority claims are prohibited without data`,
    description: 'Implicit superiority superlative',
  },
  {
    id: 'SL-005',
    pattern: /\b(?:the\s+)?only\s+(?:medicine|drug|treatment|product|remedy|solution|option)\s+(?:that|which|to)\b/gi,
    severity: 'Red',
    regulation_cited: 'NAFDAC Prohibited Claims Handbook 2026, Section 1.7 - Exclusive Treatment Claims',
    suggestion: () => 'Remove exclusivity claim — stating a product is the "only" option is misleading unless independently verified',
    description: 'Exclusive/sole treatment claim',
  },
  {
    id: 'SL-006',
    pattern: /\b(?:world'?s?\s+)?(?:first|leading|premier|foremost)\s+(?:medicine|drug|treatment|product|brand|choice)\b/gi,
    severity: 'Yellow',
    regulation_cited: 'NAFDAC Pharmaceutical Advertising Regulations 2021, Section 5.2 - Superlative Claims',
    suggestion: () => 'Replace with factual positioning such as "a widely used treatment" — leadership claims require independent market data',
    description: 'World-leading/first/premier claim',
  },
  {
    id: 'SL-007',
    pattern: /\b(?:the\s+)?(?:fastest|quickest)\s+(?:acting|working|relief|recovery|results?)\b/gi,
    severity: 'Yellow',
    regulation_cited: 'NAFDAC Prohibited Claims Handbook 2026, Section 1.9 - Timeframe Claims',
    suggestion: () => 'Replace with specific evidence-based onset time, e.g., "begins working within [X] minutes" with clinical citation',
    description: 'Fastest-acting superlative claim',
  },
  {
    id: 'SL-008',
    pattern: /\b(?:the\s+)?(?:safest|most\s+(?:safe|gentle|harmless))\b/gi,
    severity: 'Red',
    regulation_cited: 'NAFDAC Prohibited Claims Handbook 2026, Section 1.5 - Absolute Safety Claims',
    suggestion: () => 'Replace with "generally well-tolerated" or "favorable safety profile" — no product can claim to be the safest',
    description: 'Safest/most safe superlative claim',
  },
  {
    id: 'SL-009',
    pattern: /\b(?:the\s+)?(?:strongest|most\s+powerful)\s+(?:formula|formulation|dose|dosage|medicine|drug)?\b/gi,
    severity: 'Yellow',
    regulation_cited: 'NAFDAC Pharmaceutical Advertising Regulations 2021, Section 5.2 - Superlative Claims',
    suggestion: () => 'Replace with specific potency information, e.g., "contains [X]mg of active ingredient" — superlative strength claims mislead',
    description: 'Strongest/most powerful superlative claim',
  },
  {
    id: 'SL-010',
    pattern: /\b(?:never\s+(?:before\s+)?seen|unprecedented|game[\s-]?changing|breakthrough)\b/gi,
    severity: 'Yellow',
    regulation_cited: 'NAFDAC Prohibited Claims Handbook 2026, Section 1.10 - Sensationalist Language',
    suggestion: () => 'Replace with "innovative" or "novel approach" — sensationalist language undermines credibility',
    description: 'Sensationalist unprecedented/breakthrough language',
  },
];

export function scanSuperlatives(text: string) {
  const issues: Array<{
    rule: RuleDefinition;
    match: string;
    position: number;
    context: string;
  }> = [];

  for (const rule of SUPERLATIVE_RULES) {
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
