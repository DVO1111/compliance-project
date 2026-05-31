/**
 * Channel Rules Engine
 * Maps each marketing channel to its specific compliance requirements.
 */

/* ── Types ──────────────────────────────────────────────────── */

export type ChannelType =
  | 'social_media_paid'
  | 'social_media_organic'
  | 'hcp_detailing'
  | 'dtc_tv'
  | 'dtc_print'
  | 'medical_congress'
  | 'patient_app'
  | 'influencer'
  | 'email_marketing'
  | 'website'
  | 'radio';

export type ComplianceRule = {
  id: string;
  rule: string;
  category: 'disclaimer' | 'claim_restriction' | 'fair_balance' | 'isi' | 'format' | 'audience';
  severity: 'required' | 'recommended' | 'optional';
  description: string;
};

export type ChannelConfig = {
  id: ChannelType;
  label: string;
  description: string;
  iconColor: string;
  rules: ComplianceRule[];
  riskLevel: 'low' | 'medium' | 'high';
};

/* ── Channel definitions with compliance rules ───────────── */

export const CHANNEL_RULES: ChannelConfig[] = [
  {
    id: 'social_media_paid',
    label: 'Paid Social Media',
    description: 'Sponsored posts on Instagram, Facebook, LinkedIn, X',
    iconColor: 'text-blue-600',
    riskLevel: 'high',
    rules: [
      { id: 'smp-1', rule: 'Include fair balance in all posts', category: 'fair_balance', severity: 'required', description: 'Risk information must be presented with equal prominence as benefit claims' },
      { id: 'smp-2', rule: 'Link to full prescribing information', category: 'isi', severity: 'required', description: 'Every paid post must link to the full ISI or SmPC' },
      { id: 'smp-3', rule: 'No superlative claims without evidence', category: 'claim_restriction', severity: 'required', description: '"Best", "most effective", "#1" require peer-reviewed substantiation' },
      { id: 'smp-4', rule: 'Include indication statement', category: 'disclaimer', severity: 'required', description: 'Must state the approved indication clearly' },
      { id: 'smp-5', rule: 'Character-limited fair balance exception', category: 'format', severity: 'recommended', description: 'For character-limited formats, link to full risk information' },
    ],
  },
  {
    id: 'social_media_organic',
    label: 'Organic Social Media',
    description: 'Non-promoted posts, stories, reels',
    iconColor: 'text-purple-600',
    riskLevel: 'medium',
    rules: [
      { id: 'smo-1', rule: 'Monitor for off-label discussion', category: 'claim_restriction', severity: 'required', description: 'Off-label claims in comments must be addressed within 24h' },
      { id: 'smo-2', rule: 'Adverse event monitoring', category: 'disclaimer', severity: 'required', description: 'All comments must be monitored for adverse event reports' },
      { id: 'smo-3', rule: 'No disease awareness to product bridge', category: 'claim_restriction', severity: 'required', description: 'Disease awareness content cannot directly mention product names' },
    ],
  },
  {
    id: 'hcp_detailing',
    label: 'HCP Detailing',
    description: 'Materials for healthcare professional visits',
    iconColor: 'text-emerald-600',
    riskLevel: 'high',
    rules: [
      { id: 'hcp-1', rule: 'Include full prescribing information', category: 'isi', severity: 'required', description: 'Complete PI/SmPC must accompany all detailing materials' },
      { id: 'hcp-2', rule: 'Reference clinical trial data', category: 'claim_restriction', severity: 'required', description: 'All efficacy claims must cite specific clinical trial results' },
      { id: 'hcp-3', rule: 'Include contraindications', category: 'fair_balance', severity: 'required', description: 'Key contraindications must be prominently displayed' },
      { id: 'hcp-4', rule: 'Approved indication only', category: 'claim_restriction', severity: 'required', description: 'Materials must only discuss approved indications' },
    ],
  },
  {
    id: 'dtc_tv',
    label: 'DTC Television',
    description: 'Direct-to-consumer TV advertisements',
    iconColor: 'text-red-600',
    riskLevel: 'high',
    rules: [
      { id: 'dtc-1', rule: 'Major statement requirement', category: 'fair_balance', severity: 'required', description: 'Audio must include major side effects and contraindications' },
      { id: 'dtc-2', rule: 'Adequate provision requirement', category: 'isi', severity: 'required', description: 'Must provide adequate provision for full PI access (toll-free number, website, doctor)' },
      { id: 'dtc-3', rule: 'Visual/audio consistency', category: 'format', severity: 'required', description: 'Risk info cannot be presented at faster speed or lower volume than benefit info' },
    ],
  },
  {
    id: 'dtc_print',
    label: 'DTC Print',
    description: 'Print ads in consumer publications',
    iconColor: 'text-amber-600',
    riskLevel: 'medium',
    rules: [
      { id: 'dtp-1', rule: 'Brief summary page', category: 'isi', severity: 'required', description: 'Print ads must include brief summary of PI on adjacent page' },
      { id: 'dtp-2', rule: 'Readable font size', category: 'format', severity: 'required', description: 'Risk information must be in readable font size (minimum 8pt)' },
    ],
  },
  {
    id: 'medical_congress',
    label: 'Medical Congress',
    description: 'Conference booths, posters, presentations',
    iconColor: 'text-teal-600',
    riskLevel: 'medium',
    rules: [
      { id: 'mc-1', rule: 'Scientific accuracy mandatory', category: 'claim_restriction', severity: 'required', description: 'All data presentations must be scientifically accurate and balanced' },
      { id: 'mc-2', rule: 'Embargo compliance', category: 'disclaimer', severity: 'required', description: 'Unpublished data must comply with journal embargo requirements' },
      { id: 'mc-3', rule: 'Funding disclosure', category: 'disclaimer', severity: 'required', description: 'Sponsorship and funding sources must be clearly disclosed' },
    ],
  },
  {
    id: 'patient_app',
    label: 'Patient App',
    description: 'Mobile applications for patient use',
    iconColor: 'text-cyan-600',
    riskLevel: 'high',
    rules: [
      { id: 'pa-1', rule: 'Privacy notice required', category: 'disclaimer', severity: 'required', description: 'Clear privacy notice for health data collection' },
      { id: 'pa-2', rule: 'Medical device classification check', category: 'claim_restriction', severity: 'required', description: 'Determine if app qualifies as a medical device / SaMD' },
      { id: 'pa-3', rule: 'No diagnostic claims', category: 'claim_restriction', severity: 'required', description: 'App must not make diagnostic claims unless classified as medical device' },
    ],
  },
  {
    id: 'influencer',
    label: 'Influencer Content',
    description: 'KOL and influencer marketing partnerships',
    iconColor: 'text-pink-600',
    riskLevel: 'high',
    rules: [
      { id: 'inf-1', rule: 'Sponsorship disclosure', category: 'disclaimer', severity: 'required', description: '#ad or #sponsored must be clearly visible at start' },
      { id: 'inf-2', rule: 'Pre-approval of all content', category: 'claim_restriction', severity: 'required', description: 'All influencer content must be pre-approved before publication' },
      { id: 'inf-3', rule: 'No personal anecdotes as evidence', category: 'claim_restriction', severity: 'required', description: 'Testimonials cannot substitute for clinical evidence' },
      { id: 'inf-4', rule: 'Adverse event reporting training', category: 'audience', severity: 'required', description: 'Influencers must be trained on AE reporting obligations' },
    ],
  },
  {
    id: 'email_marketing',
    label: 'Email Marketing',
    description: 'Direct emails to HCPs or patients',
    iconColor: 'text-indigo-600',
    riskLevel: 'medium',
    rules: [
      { id: 'em-1', rule: 'Opt-in consent required', category: 'audience', severity: 'required', description: 'Recipients must have opted in per applicable privacy laws' },
      { id: 'em-2', rule: 'Unsubscribe mechanism', category: 'format', severity: 'required', description: 'Clear unsubscribe option required in every email' },
      { id: 'em-3', rule: 'Include ISI or link', category: 'isi', severity: 'required', description: 'Must include ISI or prominent link to prescribing information' },
    ],
  },
  {
    id: 'website',
    label: 'Website',
    description: 'Product websites and landing pages',
    iconColor: 'text-green-600',
    riskLevel: 'medium',
    rules: [
      { id: 'web-1', rule: 'Full ISI on page', category: 'isi', severity: 'required', description: 'Complete ISI must be accessible on the same page or one click away' },
      { id: 'web-2', rule: 'Cookie consent', category: 'disclaimer', severity: 'required', description: 'Cookie consent banner required per GDPR/applicable law' },
      { id: 'web-3', rule: 'Accessibility compliance', category: 'format', severity: 'recommended', description: 'Website should meet WCAG 2.1 AA standards' },
    ],
  },
  {
    id: 'radio',
    label: 'Radio',
    description: 'Radio advertisements and sponsorships',
    iconColor: 'text-orange-600',
    riskLevel: 'medium',
    rules: [
      { id: 'rad-1', rule: 'Audio major statement', category: 'fair_balance', severity: 'required', description: 'Must include major side effects audibly at same pace as benefits' },
      { id: 'rad-2', rule: 'Adequate provision', category: 'isi', severity: 'required', description: 'Provide toll-free number for full prescribing information' },
    ],
  },
];

/* ── Get rules for a specific channel ────────────────────── */

export function getChannelRules(channelId: ChannelType): ChannelConfig | undefined {
  return CHANNEL_RULES.find(c => c.id === channelId);
}

/* ── Map platform string to channel type ─────────────────── */

export function platformToChannelType(platform: string): ChannelType {
  const map: Record<string, ChannelType> = {
    instagram: 'social_media_paid',
    facebook: 'social_media_paid',
    x: 'social_media_organic',
    twitter: 'social_media_organic',
    linkedin: 'social_media_paid',
    website: 'website',
    print: 'dtc_print',
    radio: 'radio',
    tv: 'dtc_tv',
    email: 'email_marketing',
  };
  return map[platform.toLowerCase()] || 'website';
}

/* ── Get compliance matrix (all channels summary) ────────── */

export function getComplianceMatrix(): { channel: string; required: number; total: number; risk: string }[] {
  return CHANNEL_RULES.map(ch => ({
    channel: ch.label,
    required: ch.rules.filter(r => r.severity === 'required').length,
    total: ch.rules.length,
    risk: ch.riskLevel,
  }));
}
