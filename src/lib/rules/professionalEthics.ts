import type { RuleDefinition, CaveatRequirement } from './types';

export const MDCN_RULES: RuleDefinition[] = [
  {
    id: 'MDCN-001',
    pattern: /\b(?:Dr\.?|Doctor|Physician|Professor|Prof\.?)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:recommends?|endorses?|approves?|supports?|uses?|prescribes?|trusts?)\b/gi,
    severity: 'Red',
    regulation_cited: 'MDCN Rules of Professional Conduct, Rule 54 - Prohibition on Professional Title Endorsements',
    suggestion: () => 'Remove named physician endorsement — MDCN prohibits using professional titles to endorse specific commercial brands',
    description: 'Named physician endorsement of commercial product',
    category: 'professional_ethics_violation',
    jurisdiction: 'nigeria',
  },
  {
    id: 'MDCN-002',
    pattern: /\b(?:as\s+)?(?:a\s+)?(?:medical\s+doctor|physician|surgeon|specialist)\s+I\s+(?:recommend|endorse|approve|prescribe|use)\b/gi,
    severity: 'Red',
    regulation_cited: 'MDCN Rules of Professional Conduct, Rule 54 - Personal Title Endorsement Ban',
    suggestion: () => 'Remove first-person physician endorsement — doctors may not use their professional status to endorse brands',
    description: 'First-person physician endorsement',
    category: 'professional_ethics_violation',
    jurisdiction: 'nigeria',
  },
  {
    id: 'MDCN-003',
    pattern: /\bdoctors?\s+(?:everywhere|across\s+(?:the\s+)?(?:country|Nigeria|nation))\s+(?:recommend|endorse|choose|trust|prefer)\b/gi,
    severity: 'Red',
    regulation_cited: 'MDCN Rules of Professional Conduct, Rule 55 - Collective Professional Endorsement',
    suggestion: () => 'Remove collective physician endorsement claim — blanket statements about doctors endorsing products violate MDCN ethics',
    description: 'Collective physician endorsement claim',
    category: 'professional_ethics_violation',
    jurisdiction: 'nigeria',
  },
  {
    id: 'MDCN-004',
    pattern: /\b(?:MBBS|FMCP|FWACS|FWACP|FRCS)\b.*?\b(?:recommends?|endorses?|approves?)\b/gi,
    severity: 'Red',
    regulation_cited: 'MDCN Rules of Professional Conduct, Rule 54 - Use of Medical Qualifications in Advertising',
    suggestion: () => 'Remove medical qualification display in endorsement context — professional qualifications must not be used to lend credibility to product ads',
    description: 'Medical qualifications used in product endorsement',
    category: 'professional_ethics_violation',
    jurisdiction: 'nigeria',
  },
];

export const PCN_RULES: RuleDefinition[] = [
  {
    id: 'PCN-001',
    pattern: /\b(?:buy|purchase|get|available)\s+(?:at|from|in)\s+(?:our|this|the)\s+pharmacy\b/gi,
    severity: 'Yellow',
    regulation_cited: 'PCN Pharmacy Council Act, Section 26 - Pharmacy Premises vs. Product Advertising',
    suggestion: () => 'Separate pharmacy premises advertising from product promotion — PCN requires distinct treatment of pharmacy services vs. product marketing',
    description: 'Mixed pharmacy premises and product advertising',
    category: 'professional_ethics_violation',
    jurisdiction: 'nigeria',
  },
  {
    id: 'PCN-002',
    pattern: /\bpharmacist\s+(?:recommends?|endorses?|approves?|suggests?|advises?)\b/gi,
    severity: 'Red',
    regulation_cited: 'PCN Code of Ethics, Section 12 - Pharmacist Commercial Endorsement Restrictions',
    suggestion: () => 'Remove pharmacist endorsement — PCN prohibits pharmacists from personally endorsing specific commercial products in advertisements',
    description: 'Pharmacist commercial product endorsement',
    category: 'professional_ethics_violation',
    jurisdiction: 'nigeria',
  },
  {
    id: 'PCN-003',
    pattern: /\b(?:pharmacy|chemist)\s+(?:special|exclusive)\s+(?:offer|deal|discount|price)\b/gi,
    severity: 'Yellow',
    regulation_cited: 'PCN Pharmacy Council Act, Section 27 - Promotional Practices in Pharmacy',
    suggestion: () => 'Review promotional offer — PCN restricts promotional discounting practices that may compromise professional pharmaceutical standards',
    description: 'Pharmacy promotional discounting in product context',
    category: 'professional_ethics_violation',
    jurisdiction: 'nigeria',
  },
  {
    id: 'PCN-004',
    pattern: /\b(?:our\s+)?(?:pharmacy|pharmacies)\s+(?:stock|carry|sell)\s+(?:only\s+)?(?:the\s+)?(?:best|finest|premium|superior)\b/gi,
    severity: 'Yellow',
    regulation_cited: 'PCN Code of Ethics, Section 14 - Pharmacy Advertising Standards',
    suggestion: () => 'Remove quality superlatives from pharmacy advertising — premises advertising must focus on services, not product quality claims',
    description: 'Pharmacy premises making product quality claims',
    category: 'professional_ethics_violation',
    jurisdiction: 'nigeria',
  },
];

export const NMCN_RULES: RuleDefinition[] = [
  {
    id: 'NMCN-001',
    pattern: /\bnurse[sd]?\s+(?:recommend|endorse|approve|support|trust|choose|prefer)\b/gi,
    severity: 'Red',
    regulation_cited: 'NMCN Code of Professional Conduct, Section 8 - Nurse Advertising Participation',
    suggestion: () => 'Remove nurse endorsement — NMCN professional conduct rules prohibit nurses from endorsing products in commercial advertisements',
    description: 'Nurse product endorsement in advertisement',
    category: 'professional_ethics_violation',
    jurisdiction: 'nigeria',
  },
  {
    id: 'NMCN-002',
    pattern: /\b(?:registered\s+nurse|RN|midwife|midwives)\s+(?:recommends?|endorses?|approves?|certified)\b/gi,
    severity: 'Red',
    regulation_cited: 'NMCN Code of Professional Conduct, Section 8.2 - Professional Title in Advertising',
    suggestion: () => 'Remove nursing qualification from endorsement — using RN/midwife credentials in product ads violates NMCN professional conduct',
    description: 'Nursing credential used in product endorsement',
    category: 'professional_ethics_violation',
    jurisdiction: 'nigeria',
  },
  {
    id: 'NMCN-003',
    pattern: /\b(?:as\s+)?(?:a\s+)?(?:nurse|midwife|nursing\s+officer)\s+I\s+(?:recommend|endorse|use|trust|prefer)\b/gi,
    severity: 'Red',
    regulation_cited: 'NMCN Code of Professional Conduct, Section 8.3 - First-Person Nurse Endorsement',
    suggestion: () => 'Remove first-person nurse endorsement — nurses may not use their professional identity for product endorsement',
    description: 'First-person nurse endorsement',
    category: 'professional_ethics_violation',
    jurisdiction: 'nigeria',
  },
];

export const PROFESSIONAL_ETHICS_CAVEATS: CaveatRequirement[] = [
  {
    id: 'PE-CAV-001',
    triggers: [
      /\b(?:doctor|physician|Dr\.?|nurse|pharmacist|healthcare\s+(?:professional|provider|worker))\b/i,
    ],
    requiredPhrases: [
      /(?:views?\s+expressed|opinions?\s+(?:are|expressed))\s+(?:are\s+)?(?:personal|individual|their\s+own)/i,
      /does\s+not\s+(?:constitute|represent)\s+(?:professional\s+)?(?:medical\s+)?(?:advice|endorsement)/i,
    ],
    severity: 'Yellow',
    regulation_cited: 'MDCN/PCN/NMCN Joint Advisory - Disclaimer Requirements for Healthcare Professional Mentions',
    issueDescription: 'Healthcare professional mentioned without disclaimer separating personal opinion from professional endorsement',
    suggestion: 'Add disclaimer: "Views expressed are personal opinions and do not constitute professional medical endorsement"',
    category: 'professional_ethics_violation',
    jurisdiction: 'nigeria',
  },
];

export function scanProfessionalEthics(text: string) {
  const allRules = [...MDCN_RULES, ...PCN_RULES, ...NMCN_RULES];
  const issues: Array<{
    rule: RuleDefinition;
    match: string;
    position: number;
    context: string;
  }> = [];

  for (const rule of allRules) {
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

export function scanProfessionalEthicsCaveats(
  text: string,
  platform: string,
  audience: string
): import('./types').ComplianceIssue[] {
  const issues: import('./types').ComplianceIssue[] = [];

  for (const caveat of PROFESSIONAL_ETHICS_CAVEATS) {
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
        category: 'professional_ethics_violation',
        jurisdiction: 'nigeria',
      });
    }
  }

  return issues;
}
