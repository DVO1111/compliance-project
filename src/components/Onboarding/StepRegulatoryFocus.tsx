import { Globe2, MapPin, Package } from 'lucide-react';
import type { OnboardingData } from './OnboardingWizard';

const MARKET_OPTIONS = [
  { id: 'Nigeria', label: 'Nigeria', bodies: 'NAFDAC, MDCN' },
  { id: 'USA', label: 'United States', bodies: 'FDA, FTC' },
  { id: 'Europe', label: 'Europe', bodies: 'EMA, MHRA' },
];

const CATEGORY_OPTIONS = [
  'Drugs',
  'Medical Devices',
  'Cosmetics',
  'Food & Supplements',
  'Biologics',
  'OTC Products',
];

interface StepRegulatoryFocusProps {
  data: OnboardingData;
  onUpdate: (partial: Partial<OnboardingData>) => void;
}

export default function StepRegulatoryFocus({ data, onUpdate }: StepRegulatoryFocusProps) {
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
      <p className="text-[var(--color-info)] text-sm">
        Select the markets you operate in and the product types you need compliance checks for.
      </p>

      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-white mb-3">
          <MapPin className="w-4 h-4 text-[var(--color-info)]" />
          Primary Markets
        </label>
        <div className="space-y-2">
          {MARKET_OPTIONS.map(market => {
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
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
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
          Product Categories
        </label>
        <div className="grid grid-cols-2 gap-2">
          {CATEGORY_OPTIONS.map(cat => {
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

