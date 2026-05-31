-- Seed example regulatory updates for healthcare advertising & digital marketing.
-- NOTE: These are placeholders to validate the UI + data model.

INSERT INTO public.regulatory_circulars
(
  source,
  circular_number,
  title,
  summary,
  jurisdiction,
  document_type,
  topics,
  effective_date
)
VALUES

-- NIGERIA
(
  'NAFDAC',
  'NAFDAC-DIG-2026-001',
  'NAFDAC reminder on social media drug promotion',
  'NAFDAC reiterated that drug promotion on social media must not contain unapproved therapeutic claims.',
  'nigeria',
  'guideline',
  ARRAY['social media marketing','drug promotion','claims'],
  CURRENT_DATE - 15
),
(
  'MDCN',
  'MDCN-ADV-2026-002',
  'MDCN guidance on medical advertising ethics',
  'MDCN emphasized prohibition of patient testimonials and misleading specialist claims in ads.',
  'nigeria',
  'policy_update',
  ARRAY['testimonials','professional ethics','advertising'],
  CURRENT_DATE - 40
),

-- USA
(
  'FDA',
  'FDA-SOC-2026-003',
  'FDA draft guidance on influencer promotion of medical products',
  'FDA clarified that influencers must present risk information with equal prominence as benefits.',
  'usa',
  'guideline',
  ARRAY['influencer marketing','risk disclosure','social media'],
  CURRENT_DATE - 20
),
(
  'FTC',
  'FTC-ENF-2026-004',
  'FTC warning on deceptive health claims in digital ads',
  'FTC warned companies about insufficient scientific substantiation for health claims online.',
  'usa',
  'enforcement',
  ARRAY['claims substantiation','digital advertising'],
  CURRENT_DATE - 30
),

-- EUROPE
(
  'EMA',
  'EMA-ADV-2026-005',
  'EMA reminder on direct-to-consumer advertising restrictions',
  'EMA reiterated that prescription medicines must not be advertised directly to consumers.',
  'europe',
  'guideline',
  ARRAY['DTC advertising','consumer protection'],
  CURRENT_DATE - 35
),

-- PAN-AFRICAN
(
  'AMA',
  'AMA-POL-2026-006',
  'African Medicines Agency advisory on cross-border pharma marketing',
  'AMA advised member states to strengthen digital marketing oversight across borders.',
  'pan_african',
  'advisory',
  ARRAY['cross-border marketing','digital compliance'],
  CURRENT_DATE - 10
);
