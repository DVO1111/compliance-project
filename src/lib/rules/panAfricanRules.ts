import type { RuleDefinition, CaveatRequirement, ComplianceIssue } from './types';

export const PAN_AFRICAN_RULES: RuleDefinition[] = [
  {
    id: 'AMA-001',
    pattern: /\b(cure[sd]?|curing)\b/gi,
    severity: 'Red',
    regulation_cited: 'AMA Treaty 2023, Article 12 - Harmonized Standards for Medicinal Product Claims',
    suggestion: (m) => `Replace "${m}" with "indicated for" or "supports management of" per AMA harmonized advertising standards`,
    description: 'Curative claims violating AMA harmonized standards',
    category: 'product_violation',
    jurisdiction: 'pan_african',
  },
  {
    id: 'AMA-002',
    pattern: /\b(?:miracle|miraculous|wonder\s+drug)\b/gi,
    severity: 'Red',
    regulation_cited: 'AMA Treaty 2023, Article 14 - Prohibition on Sensationalist Promotion',
    suggestion: () => 'Remove sensationalist language — AMA harmonized standards require evidence-based promotion',
    description: 'Sensationalist promotion language',
    category: 'product_violation',
    jurisdiction: 'pan_african',
  },
  {
    id: 'AMA-003',
    pattern: /\bno\s+side\s+effects?\b/gi,
    severity: 'Red',
    regulation_cited: 'AMA Treaty 2023, Article 15 - Safety Information Disclosure Requirements',
    suggestion: () => 'Replace with balanced safety information — AMA requires transparent adverse effect disclosure',
    description: 'Missing safety information under AMA standards',
    category: 'product_violation',
    jurisdiction: 'pan_african',
  },
  {
    id: 'AMA-004',
    pattern: /\b(?:approved|registered)\s+(?:in|across|throughout)\s+(?:all\s+)?(?:Africa|African\s+(?:countries|nations|markets?))\b/gi,
    severity: 'Yellow',
    regulation_cited: 'AfCFTA Protocol on IP, Annex 9 - Pan-African Registration Claims',
    suggestion: () => 'Specify individual NRA registrations — a single pan-African registration claim requires AMA joint assessment completion',
    description: 'Unsubstantiated pan-African registration claim',
    category: 'advertising_violation',
    jurisdiction: 'pan_african',
  },
  {
    id: 'AMA-005',
    pattern: /\b(?:ECOWAS|WAHO)\s+(?:approved|endorsed|certified|recommended)\b/gi,
    severity: 'Yellow',
    regulation_cited: 'ECOWAS Pharmaceutical Harmonization Framework, Section 8 - Joint Assessment Claims',
    suggestion: () => 'Provide ECOWAS joint assessment reference number — claiming ECOWAS approval requires completed joint assessment documentation',
    description: 'Unsubstantiated ECOWAS endorsement claim',
    category: 'advertising_violation',
    jurisdiction: 'pan_african',
  },
  {
    id: 'AMA-006',
    pattern: /\bguarantee[sd]?\s+(?:results?|cure|relief)\b/gi,
    severity: 'Red',
    regulation_cited: 'AMA Treaty 2023, Article 12 - Prohibition on Absolute Guarantees',
    suggestion: () => 'Remove guarantee claim — AMA harmonized standards prohibit absolute outcome guarantees',
    description: 'Absolute guarantee violating AMA standards',
    category: 'product_violation',
    jurisdiction: 'pan_african',
  },
  {
    id: 'AMA-007',
    pattern: /\b100\s*%\s*(?:effective|safe|success(?:\s*rate)?)\b/gi,
    severity: 'Red',
    regulation_cited: 'AMA Treaty 2023, Article 14 - Absolute Efficacy/Safety Claims',
    suggestion: () => 'Replace with specific, evidence-based efficacy data',
    description: 'Absolute percentage claims',
    category: 'product_violation',
    jurisdiction: 'pan_african',
  },
  {
    id: 'AMA-008',
    pattern: /\b(?:traditional|herbal|indigenous)\s+(?:medicine|remedy)\s+(?:that\s+)?(?:cures?|heals?|eliminates?)\b/gi,
    severity: 'Red',
    regulation_cited: 'AMA Treaty 2023, Article 18 - Traditional Medicine Advertising Standards',
    suggestion: () => 'Replace curative claim with "traditional remedy used for" — traditional medicine claims must follow AMA/WHO traditional medicine guidelines',
    description: 'Traditional medicine curative claim',
    category: 'product_violation',
    jurisdiction: 'pan_african',
  },
];

export const PAN_AFRICAN_CAVEATS: CaveatRequirement[] = [
  {
    id: 'AMA-CAV-001',
    triggers: [/.+/s],
    requiredPhrases: [
      /(?:registered\s+with|approved\s+by)\s+(?:the\s+)?(?:national\s+)?(?:regulatory|medicines?)\s+(?:authority|agency|board)/i,
      /(?:NRA|NMRA)\s+(?:reg(?:istration)?\.?\s*(?:no|number|#))/i,
    ],
    severity: 'Yellow',
    regulation_cited: 'AMA Treaty 2023, Article 20 - National Regulatory Authority Registration Reference',
    issueDescription: 'Missing national regulatory authority (NRA) registration reference for pan-African distribution',
    suggestion: 'Include relevant NRA registration numbers for each target market, e.g., "Registered with [NRA Name], Reg. No. XX-XXXX"',
    category: 'advertising_violation',
    jurisdiction: 'pan_african',
  },
  {
    id: 'AMA-CAV-002',
    triggers: [/.+/s],
    requiredPhrases: [
      /(?:consult|see|visit)\s+(?:a\s+|your\s+)?(?:doctor|physician|healthcare)/i,
      /(?:seek\s+(?:medical|professional)\s+(?:advice|help))/i,
    ],
    severity: 'Red',
    regulation_cited: 'ECOWAS Pharmaceutical Harmonization Framework, Section 10 - Mandatory Consultation Directive',
    issueDescription: 'Missing mandatory healthcare consultation caveat for ECOWAS region',
    suggestion: 'Add "Consult a healthcare professional before use" as required by ECOWAS harmonized advertising standards',
    category: 'advertising_violation',
    jurisdiction: 'pan_african',
  },
];

export function scanPanAfricanRules(text: string) {
  const issues: Array<{
    rule: RuleDefinition;
    match: string;
    position: number;
    context: string;
  }> = [];

  for (const rule of PAN_AFRICAN_RULES) {
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

export function scanPanAfricanCaveats(
  text: string,
  platform: string,
  audience: string
): ComplianceIssue[] {
  const issues: ComplianceIssue[] = [];

  for (const caveat of PAN_AFRICAN_CAVEATS) {
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
        jurisdiction: 'pan_african',
      });
    }
  }

  return issues;
}
