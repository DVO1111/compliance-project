import type { CaveatRequirement, ComplianceIssue } from './types';

export const CAVEAT_REQUIREMENTS: CaveatRequirement[] = [
  {
    id: 'MC-001',
    triggers: [/.+/s],
    requiredPhrases: [
      /(?:consult|see|visit|speak\s+(?:to|with))\s+(?:a\s+|your\s+)?(?:doctor|physician|healthcare\s+(?:professional|provider|practitioner)|medical\s+(?:professional|practitioner))/i,
      /if\s+symptoms?\s+persist/i,
      /seek\s+(?:medical|professional)\s+(?:advice|help|attention)/i,
    ],
    severity: 'Red',
    regulation_cited: 'NAFDAC Pharmaceutical Advertising Regulations 2021, Section 3.1 - Mandatory Safety Disclaimers',
    issueDescription: 'Missing mandatory healthcare consultation caveat',
    suggestion: 'Add "If symptoms persist, consult a healthcare professional" or "Always consult your doctor before use"',
    platforms: ['print', 'radio', 'website', 'linkedin'],
  },
  {
    id: 'MC-002',
    triggers: [
      /\bprescription\b/i,
      /\bRx\b/i,
      /\bprescribed\b/i,
    ],
    requiredPhrases: [
      /(?:requires?|needs?)\s+(?:a\s+)?(?:doctor'?s?\s+)?prescription/i,
      /prescription[\s-]+only/i,
      /available\s+(?:only\s+)?(?:by|on|with)\s+prescription/i,
    ],
    severity: 'Red',
    regulation_cited: 'NAFDAC Pharmaceutical Advertising Regulations 2021, Section 3.2 - Prescription Product Disclaimers',
    issueDescription: 'Mentions prescription product without required prescription-only disclaimer',
    suggestion: 'Add "This product requires a doctor\'s prescription" prominently in the content',
  },
  {
    id: 'MC-003',
    triggers: [
      /\b(?:herbal|traditional|natural)\s+(?:medicine|remedy|treatment|product|supplement)\b/i,
    ],
    requiredPhrases: [
      /traditional\s+medicine/i,
      /herbal\s+(?:medicine|product|remedy)/i,
    ],
    severity: 'Yellow',
    regulation_cited: 'NAFDAC Herbal Medicine Standards 2026, Section 5.1 - Traditional Medicine Labeling',
    issueDescription: 'Herbal/traditional product mentioned without required "This is a traditional medicine" identifier',
    suggestion: 'Add "This is a traditional medicine. Consult a healthcare professional before use, especially if pregnant, breastfeeding, or on other medications"',
  },
  {
    id: 'MC-004',
    triggers: [
      /\b(?:supplement|dietary|vitamin|mineral|probiotic|nutraceutical)\b/i,
    ],
    requiredPhrases: [
      /not\s+intended\s+to\s+diagnose/i,
      /not\s+(?:a\s+)?(?:substitute|replacement)\s+for/i,
    ],
    severity: 'Yellow',
    regulation_cited: 'NAFDAC Food & Dietary Supplement Regulations, Section 3.4 - Supplement Disclaimer Requirements',
    issueDescription: 'Dietary supplement mentioned without standard supplement disclaimer',
    suggestion: 'Add "This product is not intended to diagnose, treat, cure, or prevent any disease"',
  },
  {
    id: 'MC-005',
    triggers: [/.+/s],
    requiredPhrases: [
      /(?:side\s+effects?|adverse\s+(?:effects?|reactions?|events?))/i,
      /(?:may\s+cause|possible\s+(?:side\s+)?effects?)/i,
    ],
    severity: 'Yellow',
    regulation_cited: 'NAFDAC Pharmaceutical Advertising Regulations 2021, Section 3.3 - Adverse Effects Disclosure',
    issueDescription: 'No mention of potential side effects or adverse reactions',
    suggestion: 'Include a statement about potential side effects, e.g., "Side effects may include [list]. Discontinue use and consult your doctor if adverse reactions occur"',
    platforms: ['print', 'radio', 'website'],
  },
  {
    id: 'MC-006',
    triggers: [
      /\b(?:child(?:ren)?|infant|baby|babies|pediatric|paediatric)\b/i,
      /\b(?:pregnan(?:t|cy)|breastfeeding|nursing|lactating|elderly|geriatric)\b/i,
    ],
    requiredPhrases: [
      /(?:medical\s+supervision|under\s+(?:medical|doctor'?s?)\s+(?:supervision|guidance|care))/i,
      /consult\s+(?:a\s+|your\s+)?(?:doctor|physician|healthcare)/i,
    ],
    severity: 'Red',
    regulation_cited: 'NAFDAC Prohibited Claims Handbook 2026, Section 2.3 - Vulnerable Population Safeguards',
    issueDescription: 'References vulnerable populations (children, pregnant/nursing, elderly) without medical supervision caveat',
    suggestion: 'Add "Use under medical supervision" and specific contraindication statements for the referenced population',
  },
  {
    id: 'MC-007',
    triggers: [/.+/s],
    requiredPhrases: [
      /NAFDAC\s+(?:reg(?:istration)?\.?\s*)?(?:no|number|#)/i,
      /(?:reg(?:istration)?\.?\s*(?:no|number|#))/i,
    ],
    severity: 'Yellow',
    regulation_cited: 'NAFDAC Mandatory Labeling Requirements, Section 1.11 - Registration Number Display',
    issueDescription: 'No NAFDAC registration number referenced in content',
    suggestion: 'Include your NAFDAC registration number in the format "NAFDAC Reg. No. XX-XXXX"',
    platforms: ['print', 'website'],
  },
];

export function scanMandatoryCaveats(
  text: string,
  platform: string,
  audience: string
): ComplianceIssue[] {
  const issues: ComplianceIssue[] = [];
  const lowerText = text.toLowerCase();

  for (const caveat of CAVEAT_REQUIREMENTS) {
    if (caveat.platforms && !caveat.platforms.includes(platform)) {
      continue;
    }

    if (caveat.audiences && !caveat.audiences.includes(audience)) {
      continue;
    }

    const triggered = caveat.triggers.some((trigger) => trigger.test(text));
    if (!triggered) continue;

    const hasRequiredPhrase = caveat.requiredPhrases.some((phrase) =>
      phrase.test(lowerText) || phrase.test(text)
    );

    if (!hasRequiredPhrase) {
      issues.push({
        severity: caveat.severity,
        issue: caveat.issueDescription,
        regulation_cited: caveat.regulation_cited,
        suggestion: caveat.suggestion,
      });
    }
  }

  return issues;
}
