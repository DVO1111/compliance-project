/**
 * Training Question Bank — Healthcare Marketing Compliance
 *
 * ~30 questions across NAFDAC, FDA, EMA, Pan-African, and WHO,
 * all tailored to marketing, advertising, and labeling in the health sector.
 */

export interface TrainingQuestion {
    id: string;
    jurisdiction: 'NAFDAC' | 'FDA' | 'EMA' | 'Pan-African' | 'WHO';
    category: string;
    tip: string;
    question: string;
    options: [string, string, string, string];
    correctIndex: 0 | 1 | 2 | 3;
    regulationCited: string;
}

export const TRAINING_QUESTIONS: TrainingQuestion[] = [
    // ─── NAFDAC ────────────────────────────────────────────────────────────
    {
        id: 'NAF-Q01',
        jurisdiction: 'NAFDAC',
        category: 'Prohibited Claims',
        tip: 'NAFDAC strictly prohibits any advertisement that claims a product can "cure" a chronic or viral disease. Use "may help manage" instead.',
        question: 'Under NAFDAC guidelines, which phrase is PROHIBITED in pharmaceutical advertising?',
        options: [
            '"May help manage symptoms"',
            '"Clinically studied formulation"',
            '"Cures diabetes permanently"',
            '"Consult your healthcare provider"',
        ],
        correctIndex: 2,
        regulationCited: 'NAFDAC Pharmaceutical Advertising Regulations 2021, Section 2',
    },
    {
        id: 'NAF-Q02',
        jurisdiction: 'NAFDAC',
        category: 'Safety Disclaimers',
        tip: 'Every pharmaceutical ad in Nigeria must include a safety disclaimer. Omitting it is a Red-severity violation.',
        question: 'What MUST every NAFDAC-compliant pharmaceutical advertisement include?',
        options: [
            'Celebrity endorsement',
            'Safety disclaimer',
            'Price comparison with competitors',
            'Free sample offer',
        ],
        correctIndex: 1,
        regulationCited: 'NAFDAC Pharmaceutical Advertising Regulations 2021, Section 4',
    },
    {
        id: 'NAF-Q03',
        jurisdiction: 'NAFDAC',
        category: 'Labeling Requirements',
        tip: 'The 2026 rule for paracetamol labeling requires clear dosage limits and liver damage warnings on all packaging and marketing materials.',
        question: 'What is the new 2026 NAFDAC rule for paracetamol labeling in marketing materials?',
        options: [
            'Remove all side effect warnings',
            'Include clear dosage limits and liver damage warnings',
            'Only list the active ingredient',
            'Add a "recommended by doctors" badge',
        ],
        correctIndex: 1,
        regulationCited: 'NAFDAC Prohibited Claims Handbook 2026, Section 3.2 – Analgesic Labeling',
    },
    {
        id: 'NAF-Q04',
        jurisdiction: 'NAFDAC',
        category: 'Absolute Claims',
        tip: '"100% effective" or "100% safe" are absolute claims and are always prohibited by NAFDAC, regardless of clinical data.',
        question: 'Which type of claim is always prohibited by NAFDAC, even with clinical backing?',
        options: [
            '"Clinically studied"',
            '"100% safe and effective"',
            '"Supports immune health"',
            '"Talk to your doctor"',
        ],
        correctIndex: 1,
        regulationCited: 'NAFDAC Pharmaceutical Advertising Regulations 2021, Section 2.5',
    },
    {
        id: 'NAF-Q05',
        jurisdiction: 'NAFDAC',
        category: 'Comparative Advertising',
        tip: 'NAFDAC forbids comparative advertising that claims a product "works where other medicines fail" without head-to-head trial data.',
        question: 'Under NAFDAC, which comparative claim requires head-to-head clinical trial data?',
        options: [
            '"Our product is available nationwide"',
            '"Works where other medicines fail"',
            '"Contains vitamin C"',
            '"Pharmacist recommended"',
        ],
        correctIndex: 1,
        regulationCited: 'NAFDAC Prohibited Claims Handbook 2026, Section 1.7',
    },
    {
        id: 'NAF-Q06',
        jurisdiction: 'NAFDAC',
        category: 'Medical Consultation',
        tip: 'No marketing material should imply that a product can replace a doctor\'s visit. This violates patient-provider relationship guidelines.',
        question: 'Which marketing claim violates NAFDAC patient-provider relationship guidelines?',
        options: [
            '"Consult your doctor before use"',
            '"Available at leading pharmacies"',
            '"Can replace your doctor\'s visits"',
            '"For professional use only"',
        ],
        correctIndex: 2,
        regulationCited: 'Nigeria Ministry of Health Guidelines, Section 3.4',
    },

    // ─── FDA ───────────────────────────────────────────────────────────────
    {
        id: 'FDA-Q01',
        jurisdiction: 'FDA',
        category: 'Fair Balance',
        tip: 'FDA\'s "Fair Balance" rule requires that every DTC ad presenting drug benefits must equally present risks and side effects.',
        question: 'What does the FDA "Fair Balance" requirement mandate for DTC pharmaceutical ads?',
        options: [
            'Equal time for competitor products',
            'Benefits and risks must be presented equally',
            'Ads must be under 30 seconds',
            'Only doctors can appear in ads',
        ],
        correctIndex: 1,
        regulationCited: 'FDA 21 CFR 202.1(e)(5) – Fair Balance Requirement',
    },
    {
        id: 'FDA-Q02',
        jurisdiction: 'FDA',
        category: 'Misleading Claims',
        tip: 'The FDA prohibits using "miracle" or "wonder drug" language as it creates misleading expectations about drug efficacy.',
        question: 'Which term would the FDA consider a "Misleading Representation of Drug Efficacy"?',
        options: [
            '"Evidence-based formula"',
            '"Wonder drug"',
            '"Prescription required"',
            '"Ask your pharmacist"',
        ],
        correctIndex: 1,
        regulationCited: 'FDA 21 CFR 202.1(e)(6)',
    },
    {
        id: 'FDA-Q03',
        jurisdiction: 'FDA',
        category: 'DTC Advertising',
        tip: 'When a DTC ad mentions a prescription drug by name, FDA requires a "brief summary" of prescribing information or a link to it.',
        question: 'When an ad names a prescription drug, what does the FDA require?',
        options: [
            'A free sample offer',
            'Brief summary of prescribing information',
            'Doctor\'s phone number',
            'Manufacturing plant address',
        ],
        correctIndex: 1,
        regulationCited: 'FDA 21 CFR 202.1 – Brief Summary Requirement',
    },
    {
        id: 'FDA-Q04',
        jurisdiction: 'FDA',
        category: 'Safety Claims',
        tip: 'Claiming a drug has "no side effects" violates the FDA\'s fair balance rule, since all drugs have potential adverse effects.',
        question: 'Why does claiming "no side effects" violate FDA regulations?',
        options: [
            'It is grammatically incorrect',
            'Only generics can say this',
            'It violates the fair balance requirement',
            'Side effects must be listed separately',
        ],
        correctIndex: 2,
        regulationCited: 'FDA 21 CFR 202.1(e)(5)',
    },
    {
        id: 'FDA-Q05',
        jurisdiction: 'FDA',
        category: 'Comparative Claims',
        tip: 'FDA requires "substantial evidence" (two adequate, well-controlled trials) before a drug can be advertised as superior to another.',
        question: 'What evidence standard does the FDA require for comparative superiority claims?',
        options: [
            'Customer testimonials',
            'One observational study',
            'Substantial evidence from well-controlled trials',
            'Expert opinion from one physician',
        ],
        correctIndex: 2,
        regulationCited: 'FDA 21 CFR 202.1(e)(6) – Comparative Claims',
    },
    {
        id: 'FDA-Q06',
        jurisdiction: 'FDA',
        category: 'Guaranteed Results',
        tip: 'The FDA prohibits guaranteeing treatment outcomes. Phrases like "guaranteed cure" or "guaranteed relief" are Red-severity violations.',
        question: 'Which phrase would the FDA flag as a "Misleading Guarantee"?',
        options: [
            '"Results may vary"',
            '"Guaranteed relief from pain"',
            '"Speak with your healthcare provider"',
            '"Individual results depend on many factors"',
        ],
        correctIndex: 1,
        regulationCited: 'FDA 21 CFR 202.1(e)(6) – Misleading Guarantees',
    },

    // ─── EMA ───────────────────────────────────────────────────────────────
    {
        id: 'EMA-Q01',
        jurisdiction: 'EMA',
        category: 'DTC Advertising Ban',
        tip: 'The EMA enforces a strict ban on direct-to-consumer advertising for prescription drugs. Only OTC products may be advertised to the public.',
        question: 'Under EMA regulations, which type of drug may NOT be advertised directly to consumers?',
        options: [
            'Over-the-counter painkillers',
            'Prescription medications',
            'Dietary supplements',
            'Herbal remedies',
        ],
        correctIndex: 1,
        regulationCited: 'EU Directive 2001/83/EC, Title VIII – Advertising of Medicinal Products',
    },
    {
        id: 'EMA-Q02',
        jurisdiction: 'EMA',
        category: 'Healthcare Professional Ads',
        tip: 'Even in ads targeting healthcare professionals, the EMA requires that all claims be based on an up-to-date SmPC (Summary of Product Characteristics).',
        question: 'What must all EMA-compliant HCP-directed advertising be based on?',
        options: [
            'Wikipedia articles',
            'The Summary of Product Characteristics (SmPC)',
            'Sales team talking points',
            'Patient testimonials',
        ],
        correctIndex: 1,
        regulationCited: 'EU Directive 2001/83/EC, Article 87',
    },
    {
        id: 'EMA-Q03',
        jurisdiction: 'EMA',
        category: 'Off-Label Promotion',
        tip: 'EMA regulations strictly prohibit promoting a medicine for conditions or dosages not included in its marketing authorization.',
        question: 'What is "off-label promotion" under EMA regulations?',
        options: [
            'Advertising without a logo',
            'Promoting a drug for unauthorized uses',
            'Selling drugs online',
            'Using unlicensed images in ads',
        ],
        correctIndex: 1,
        regulationCited: 'EU Directive 2001/83/EC, Article 87(1)',
    },
    {
        id: 'EMA-Q04',
        jurisdiction: 'EMA',
        category: 'Marketing Material Review',
        tip: 'In the EU, all promotional materials for medicines must be approved by a qualified person responsible for pharmacovigilance before distribution.',
        question: 'Who must approve pharmaceutical promotional materials before distribution in the EU?',
        options: [
            'The marketing director',
            'A qualified person responsible for pharmacovigilance',
            'Any licensed pharmacist',
            'The CEO of the company',
        ],
        correctIndex: 1,
        regulationCited: 'EU Directive 2001/83/EC, Article 98',
    },
    {
        id: 'EMA-Q05',
        jurisdiction: 'EMA',
        category: 'Inducements',
        tip: 'EMA regulations prohibit offering gifts, prizes, or financial inducements to healthcare professionals as part of drug promotion.',
        question: 'What does the EMA prohibit when promoting drugs to healthcare professionals?',
        options: [
            'Providing SmPC documents',
            'Offering gifts or financial inducements',
            'Sharing clinical trial data',
            'Organizing educational symposiums',
        ],
        correctIndex: 1,
        regulationCited: 'EU Directive 2001/83/EC, Article 94',
    },

    // ─── Pan-African ───────────────────────────────────────────────────────
    {
        id: 'PA-Q01',
        jurisdiction: 'Pan-African',
        category: 'AMA Harmonization',
        tip: 'The African Medicines Agency (AMA) aims to harmonize drug regulation across Africa. Marketing materials must comply with both national and AMA standards.',
        question: 'What is the primary goal of the African Medicines Agency (AMA)?',
        options: [
            'Manufacture drugs for Africa',
            'Harmonize drug regulation across the continent',
            'Replace national regulatory bodies',
            'Provide free medicines to all',
        ],
        correctIndex: 1,
        regulationCited: 'AMA Treaty 2019 – Regulatory Harmonization Framework',
    },
    {
        id: 'PA-Q02',
        jurisdiction: 'Pan-African',
        category: 'Cross-Border Marketing',
        tip: 'Under AfCFTA, health product marketing materials used across African borders must meet the strictest applicable national regulation.',
        question: 'When marketing health products across African borders, which standard applies?',
        options: [
            'The least strict national regulation',
            'No regulation — free trade zone',
            'The strictest applicable national regulation',
            'Only WHO guidelines',
        ],
        correctIndex: 2,
        regulationCited: 'AfCFTA Protocol on Health Products – Article 12',
    },
    {
        id: 'PA-Q03',
        jurisdiction: 'Pan-African',
        category: 'Traditional Medicine Claims',
        tip: 'ECOWAS guidelines require that traditional medicine marketing must not claim equivalence to or superiority over conventional medicine without clinical proof.',
        question: 'What must traditional medicine marketing NOT claim under ECOWAS guidelines?',
        options: [
            'Traditional origin of ingredients',
            'Superiority over conventional medicine without clinical proof',
            'Herbal composition',
            'Long history of use',
        ],
        correctIndex: 1,
        regulationCited: 'ECOWAS Traditional Medicine Regulation 2020, Article 7',
    },
    {
        id: 'PA-Q04',
        jurisdiction: 'Pan-African',
        category: 'Language Requirements',
        tip: 'Pan-African marketing materials must be available in the official language(s) of each target country. English-only materials are non-compliant in francophone regions.',
        question: 'What language requirement applies to Pan-African health product marketing?',
        options: [
            'English only',
            'French only',
            'Official language(s) of each target country',
            'Any language the company prefers',
        ],
        correctIndex: 2,
        regulationCited: 'AMA Regulatory Harmonization – Labeling Standards',
    },

    // ─── WHO ───────────────────────────────────────────────────────────────
    {
        id: 'WHO-Q01',
        jurisdiction: 'WHO',
        category: 'Ethical Promotion',
        tip: 'WHO Ethical Criteria require that drug promotion to both professionals and the public must be accurate, balanced, and up-to-date.',
        question: 'What do the WHO Ethical Criteria for Medicinal Drug Promotion require?',
        options: [
            'Promotion only in medical journals',
            'Accurate, balanced, and up-to-date information',
            'Government pre-approval of all ads',
            'Free drug samples with every ad',
        ],
        correctIndex: 1,
        regulationCited: 'WHO Ethical Criteria for Medicinal Drug Promotion, 1988',
    },
    {
        id: 'WHO-Q02',
        jurisdiction: 'WHO',
        category: 'Scientific Evidence',
        tip: 'WHO mandates that all promotional claims must be supported by current scientific evidence. Outdated studies cannot be used as the sole basis for marketing claims.',
        question: 'What type of evidence must support promotional claims per WHO guidelines?',
        options: [
            'Customer reviews and ratings',
            'Current scientific evidence',
            'Historical usage data only',
            'Sales volume data',
        ],
        correctIndex: 1,
        regulationCited: 'WHO Ethical Criteria, Section 3 – Substantiation of Claims',
    },
    {
        id: 'WHO-Q03',
        jurisdiction: 'WHO',
        category: 'Target Audience',
        tip: 'WHO guidelines distinguish between promotion to healthcare professionals and to the general public. Patient-facing materials have stricter communication standards.',
        question: 'Under WHO guidelines, which audience faces STRICTER promotional standards?',
        options: [
            'Healthcare professionals',
            'General public / patients',
            'Pharmacists only',
            'Hospital administrators',
        ],
        correctIndex: 1,
        regulationCited: 'WHO Ethical Criteria – Section 5: Promotion to the General Public',
    },
    {
        id: 'WHO-Q04',
        jurisdiction: 'WHO',
        category: 'Breast Milk Substitutes',
        tip: 'WHO\'s International Code prohibits marketing breast milk substitutes directly to mothers or the general public, including in healthcare facilities.',
        question: 'What does the WHO International Code say about marketing breast milk substitutes?',
        options: [
            'Allowed with a doctor\'s note',
            'Prohibited from being marketed directly to mothers',
            'Only allowed in hospitals',
            'Must include "as good as breast milk" claim',
        ],
        correctIndex: 1,
        regulationCited: 'WHO International Code of Marketing of Breast-milk Substitutes, 1981',
    },
];

/**
 * Deterministic daily question pick.
 * Same user gets the same question all day; different users get different questions.
 */
export function getTodayQuestion(userId: string): TrainingQuestion {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const seed = `${userId}-${today}`;

    // Simple hash
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        const ch = seed.charCodeAt(i);
        hash = ((hash << 5) - hash) + ch;
        hash |= 0; // Convert to 32-bit int
    }

    const index = Math.abs(hash) % TRAINING_QUESTIONS.length;
    return TRAINING_QUESTIONS[index];
}

/**
 * Get the jurisdiction badge color for a given jurisdiction.
 */
export function getJurisdictionColor(j: TrainingQuestion['jurisdiction']): string {
    switch (j) {
        case 'NAFDAC': return '#2563eb';       // blue
        case 'FDA': return '#7c3aed';          // violet
        case 'EMA': return '#0891b2';          // cyan
        case 'Pan-African': return '#d97706';  // amber
        case 'WHO': return '#059669';          // emerald
        default: return '#6b7280';
    }
}
