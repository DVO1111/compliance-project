import { Globe2, MapPin, Package } from 'lucide-react';
import type { OnboardingData } from './OnboardingWizard';

/* ── Industry-specific config ─────────────────────────────── */

interface MarketOption { id: string; label: string; bodies: string; }

interface IndustryConfig {
  categoryLabel: string;
  description: string;
  markets: MarketOption[];
  categories: string[];
}

const PHARMA_CONFIG: IndustryConfig = {
  categoryLabel: 'Product Categories',
  description: 'Select the markets you operate in and the product types you need compliance checks for.',
  markets: [
    { id: 'Nigeria',  label: 'Nigeria',       bodies: 'NAFDAC, MDCN' },
    { id: 'USA',      label: 'United States',  bodies: 'FDA, FTC' },
    { id: 'Europe',   label: 'Europe',         bodies: 'EMA, MHRA' },
  ],
  categories: ['Drugs', 'Medical Devices', 'Cosmetics', 'Food & Supplements', 'Biologics', 'OTC Products'],
};

const INDUSTRY_CONFIG: Record<string, IndustryConfig> = {
  'Logistics & Courier': {
    categoryLabel: 'Service Types',
    description: 'Select the corridors you operate and the logistics services you provide.',
    markets: [
      { id: 'UK',      label: 'United Kingdom', bodies: 'HMRC, ICO, UK Export Control, OFSI' },
      { id: 'Nigeria', label: 'Nigeria',         bodies: 'Nigerian Customs Service, NCAA, CAC, NITDA' },
      { id: 'Africa',  label: 'Rest of Africa',  bodies: 'Various customs authorities' },
      { id: 'Global',  label: 'Global / Multi-corridor', bodies: 'C-TPAT, AEO, TAPA' },
    ],
    categories: [
      'Air Freight',
      'Road Freight',
      'Last-Mile Delivery',
      'Document Courier',
      'E-Commerce Fulfilment',
      'Customs Brokerage',
      'Warehousing & Storage',
      'Sea Freight',
    ],
  },

  'Financial Services': {
    categoryLabel: 'Service Types',
    description: 'Select the jurisdictions you operate in and the financial services you offer.',
    markets: [
      { id: 'UK',      label: 'United Kingdom', bodies: 'FCA, PRA, FRC' },
      { id: 'Nigeria', label: 'Nigeria',         bodies: 'CBN, SEC Nigeria, NDIC' },
      { id: 'Europe',  label: 'Europe',          bodies: 'EBA, ESMA' },
      { id: 'USA',     label: 'United States',   bodies: 'SEC, FINRA, OCC' },
    ],
    categories: [
      'Banking',
      'Insurance',
      'Investment Management',
      'Fintech / Payments',
      'Microfinance',
      'Foreign Exchange',
      'Lending',
      'Wealth Management',
    ],
  },

  'Food & Beverage': {
    categoryLabel: 'Product Categories',
    description: 'Select the markets you sell into and the food/beverage categories you produce.',
    markets: [
      { id: 'Nigeria', label: 'Nigeria',        bodies: 'NAFDAC, SON, NESREA' },
      { id: 'UK',      label: 'United Kingdom', bodies: 'FSA, Trading Standards' },
      { id: 'Europe',  label: 'Europe',         bodies: 'EFSA, EU Food Law' },
      { id: 'USA',     label: 'United States',  bodies: 'FDA, USDA' },
    ],
    categories: [
      'Beverages (Alcoholic)',
      'Beverages (Non-Alcoholic)',
      'Processed Foods',
      'Dairy Products',
      'Packaged Snacks',
      'Nutritional Supplements',
      'Condiments & Sauces',
      'Frozen Foods',
    ],
  },

  'Healthcare Services': {
    categoryLabel: 'Service Types',
    description: 'Select the markets you operate in and the healthcare services you deliver.',
    markets: [
      { id: 'Nigeria', label: 'Nigeria',        bodies: 'MDCN, NHIA, NAFDAC' },
      { id: 'UK',      label: 'United Kingdom', bodies: 'CQC, MHRA, NHS England' },
      { id: 'USA',     label: 'United States',  bodies: 'CMS, FDA, State Health Boards' },
    ],
    categories: [
      'Primary Care',
      'Hospital / Inpatient',
      'Diagnostic Services',
      'Telemedicine',
      'Mental Health',
      'Pharmacy',
      'Medical Laboratory',
      'Specialist Clinic',
    ],
  },

  'Advertising & Marketing Agency': {
    categoryLabel: 'Service Types',
    description: 'Select the markets your campaigns run in and the advertising services you offer.',
    markets: [
      { id: 'Nigeria', label: 'Nigeria',        bodies: 'ARCON, APCON, NCC' },
      { id: 'UK',      label: 'United Kingdom', bodies: 'ASA, ICO, CMA' },
      { id: 'USA',     label: 'United States',  bodies: 'FTC, NAD, FCC' },
      { id: 'Global',  label: 'Global',         bodies: 'GDPR, IAB standards' },
    ],
    categories: [
      'Digital Advertising',
      'Social Media Marketing',
      'Influencer Marketing',
      'Out-of-Home (OOH)',
      'Broadcast / TV / Radio',
      'Content Marketing',
      'Programmatic Advertising',
      'Direct Mail',
    ],
  },
};

/* Pharma-adjacent industries share the pharma config */
const PHARMA_INDUSTRIES = new Set([
  'Pharmaceuticals',
  'Biotechnology',
  'Medical Devices',
  'Cosmetics & Personal Care',
  'Food & Nutraceuticals',
  'Contract Research Organization',
]);

function getConfig(industryType: string): IndustryConfig {
  if (INDUSTRY_CONFIG[industryType]) return INDUSTRY_CONFIG[industryType];
  if (PHARMA_INDUSTRIES.has(industryType)) return PHARMA_CONFIG;
  // Other / unknown — generic fallback
  return {
    categoryLabel: 'Operational Areas',
    description: 'Select the markets you operate in and your primary business activities.',
    markets: [
      { id: 'Nigeria', label: 'Nigeria',        bodies: 'CAC, FIRS, relevant sectoral regulators' },
      { id: 'UK',      label: 'United Kingdom', bodies: 'Companies House, HMRC, ICO' },
      { id: 'USA',     label: 'United States',  bodies: 'SEC, FTC, relevant state regulators' },
      { id: 'Europe',  label: 'Europe',         bodies: 'GDPR, relevant EU sectoral regulators' },
    ],
    categories: [
      'Operations',
      'Sales & Distribution',
      'Manufacturing',
      'Technology / IT',
      'Professional Services',
      'Import / Export',
    ],
  };
}

/* ── Component ─────────────────────────────────────────────── */

interface StepRegulatoryFocusProps {
  data: OnboardingData;
  onUpdate: (partial: Partial<OnboardingData>) => void;
}

export default function StepRegulatoryFocus({ data, onUpdate }: StepRegulatoryFocusProps) {
  const config = getConfig(data.industryType);

  const toggleMarket = (market: string) => {
    const next = data.primaryMarkets.includes(market)
      ? data.primaryMarkets.filter(m => m !== market)
      : [...data.primaryMarkets, market];
    onUpdate({ primaryMarkets: next });
  };

  const toggleCategory = (cat: string) => {
    const next = data.productCategories.includes(cat)
      ? data.productCategories.filter(c => c !== cat)
      : [...data.productCategories, cat];
    onUpdate({ productCategories: next });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <Globe2 className="w-6 h-6 text-[var(--color-success)]" />
        <h2 className="text-xl font-semibold text-white">Regulatory Focus</h2>
      </div>
      <p className="text-[var(--color-info)] text-sm">{config.description}</p>

      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-white mb-3">
          <MapPin className="w-4 h-4 text-[var(--color-info)]" />
          Primary Markets
        </label>
        <div className="space-y-2">
          {config.markets.map(market => {
            const selected = data.primaryMarkets.includes(market.id);
            return (
              <button
                key={market.id}
                onClick={() => toggleMarket(market.id)}
                className={`w-full flex items-center justify-between px-4 py-3.5 rounded-lg text-left transition-all ${
                  selected
                    ? 'bg-[var(--color-success)]/20 border-[var(--color-success)] border-2'
                    : 'dash-card/5 border border-white/15 hover:dash-card/10 hover:border-white/25'
                }`}
              >
                <div>
                  <span className={`text-sm font-medium ${selected ? 'text-white' : 'text-blue-100'}`}>
                    {market.label}
                  </span>
                  <span className="block text-xs text-[var(--color-info)]/70 mt-0.5">{market.bodies}</span>
                </div>
                <div
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors flex-shrink-0 ${
                    selected ? 'bg-[var(--color-success)] border-[var(--color-success)]' : 'border-white/30'
                  }`}
                >
                  {selected && (
                    <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-white mb-3">
          <Package className="w-4 h-4 text-[var(--color-info)]" />
          {config.categoryLabel}
        </label>
        <div className="grid grid-cols-2 gap-2">
          {config.categories.map(cat => {
            const selected = data.productCategories.includes(cat);
            return (
              <button
                key={cat}
                onClick={() => toggleCategory(cat)}
                className={`px-4 py-3 rounded-lg text-sm font-medium text-left transition-all ${
                  selected
                    ? 'bg-[var(--color-success)]/20 border-[var(--color-success)] text-white border-2'
                    : 'dash-card/5 border border-white/15 text-blue-100 hover:dash-card/10 hover:border-white/25'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
