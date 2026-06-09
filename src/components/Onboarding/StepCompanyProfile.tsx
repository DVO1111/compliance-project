import { Building2 } from 'lucide-react';
import type { OnboardingData } from './OnboardingWizard';

const INDUSTRY_OPTIONS = [
  'Pharmaceuticals',
  'Biotechnology',
  'Medical Devices',
  'Cosmetics & Personal Care',
  'Food & Nutraceuticals',
  'Healthcare Services',
  'Contract Research Organization',
  'Advertising & Marketing Agency',
  'Logistics & Courier',
  'Financial Services',
  'Food & Beverage',
  'Other',
];

interface StepCompanyProfileProps {
  data: OnboardingData;
  onUpdate: (partial: Partial<OnboardingData>) => void;
}

export default function StepCompanyProfile({ data, onUpdate }: StepCompanyProfileProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <Building2 className="w-6 h-6 text-[var(--color-success)]" />
        <h2 className="text-xl font-semibold text-white">Company Profile</h2>
      </div>
      <p className="text-[var(--color-info)] text-sm">
        Tell us about your organization so we can tailor the compliance rules that matter most.
      </p>

      <div>
        <label className="block text-sm font-medium text-white mb-2">Company Name</label>
        <input
          type="text"
          value={data.companyName}
          onChange={e => onUpdate({ companyName: e.target.value })}
          placeholder="e.g. Acme Pharmaceuticals Ltd"
          className="w-full px-4 py-3 dash-card/10 border border-white/20 rounded-lg focus:ring-2 focus:ring-[#00A86B] focus:border-transparent text-white placeholder-blue-300/50 text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-white mb-2">Industry Type</label>
        <div className="grid grid-cols-2 gap-2">
          {INDUSTRY_OPTIONS.map(industry => {
            const selected = data.industryType === industry;
            return (
              <button
                key={industry}
                onClick={() => onUpdate({ industryType: industry })}
                className={`px-4 py-3 rounded-lg text-sm font-medium text-left transition-all ${
                  selected
                    ? 'bg-[var(--color-success)]/20 border-[var(--color-success)] text-white border-2'
                    : 'dash-card/5 border border-white/15 text-blue-100 hover:dash-card/10 hover:border-white/25'
                }`}
              >
                {industry}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

