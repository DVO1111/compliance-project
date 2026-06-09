import { useEffect, useState } from 'react';
import {
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  Building2,
  Globe2,
  UserCheck,
  Check,
  Scale
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import StepCompanyProfile from './StepCompanyProfile';
import StepRegulatoryFocus from './StepRegulatoryFocus';
import StepRoleAssignment from './StepRoleAssignment';
import StepLegalPartnerDetails from './StepLegalPartnerDetails';
import { createPartnerProfile } from '../../lib/legalMarketplaceService';
import { seedObligationsFromIndustry } from '../../lib/governance/obligationTemplates';
import { logger } from '../../lib/logger';

export interface OnboardingData {
  companyName: string;
  industryType: string;
  primaryMarkets: string[];
  productCategories: string[];
  role: string;
  department: string;
  // External Partner fields
  partnerType: 'individual' | 'firm';
  firmName: string;
  jurisdictions: string[];
  specialties: string[];
  hourlyRate: number;
  bio: string;
}

interface OnboardingWizardProps {
  onComplete: () => void;
}

const ROLE_ID_TO_DB_ROLE: Record<string, 'Marketing' | 'Compliance' | 'Executive' | 'Admin' | 'legal_partner'> = {
  marketing: 'Marketing',
  legal_compliance: 'Compliance',
  executive: 'Executive',
  legal_partner: 'legal_partner',
};

export default function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const { user, profile } = useAuth();

  // Invited users (role != 'owner') already have modules + role set via the invite.
  // Skip the wizard entirely and just mark onboarding complete.
  const isInvitedUser = !!(
    (profile as any)?.company_role &&
    (profile as any).company_role !== 'owner'
  );

  useEffect(() => {
    if (!isInvitedUser || !user) return;
    (async () => {
      await supabase
        .from('profiles')
        .update({ onboarding_completed: true })
        .eq('id', user.id);
      onComplete();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInvitedUser, user?.id]);

  const [currentStep, setCurrentStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<OnboardingData>({
    companyName: '',
    industryType: '',
    primaryMarkets: [],
    productCategories: [],
    role: '',
    department: '',
    partnerType: 'individual',
    firmName: '',
    jurisdictions: [],
    specialties: [],
    hourlyRate: 0,
    bio: '',
  });

  const STEPS = [
    { id: 1, title: 'Company Profile', icon: Building2 },
    { id: 2, title: 'Regulatory Focus', icon: Globe2 },
    { id: 3, title: 'Your Role', icon: UserCheck },
    ...(data.role === 'legal_partner' ? [{ id: 4, title: 'Partner Details', icon: Scale }] : []),
  ];

  const updateData = (partial: Partial<OnboardingData>) => {
    setData(prev => ({ ...prev, ...partial }));
  };

  const canProceed = (): boolean => {
    switch (currentStep) {
      case 1:
        return data.companyName.trim().length > 0 && data.industryType.length > 0;
      case 2:
        return data.primaryMarkets.length > 0 && data.productCategories.length > 0;
      case 3:
        return data.role.length > 0;
      case 4:
        return data.jurisdictions.length > 0 && data.specialties.length > 0;
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (currentStep < STEPS.length) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleFinish = async () => {
    if (!user) return;
    setSaving(true);
    setError('');

    const dbRole = ROLE_ID_TO_DB_ROLE[data.role];

    if (!dbRole) {
      setError('Please select a role.');
      setSaving(false);
      return;
    }

    try {
      // 1. Update Profile
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          organization: data.companyName,
          industry_type: data.industryType,
          primary_markets: data.primaryMarkets,
          product_categories: data.productCategories,
          role: dbRole as any,
          department: data.department,
          onboarding_completed: true,
        })
        .eq('id', user.id);

      if (updateError) throw updateError;

      // 2. If Legal Partner, Create Partner Profile
      if (data.role === 'legal_partner') {
        await createPartnerProfile({
          id: user.id,
          partner_type: data.partnerType,
          firm_name: data.firmName,
          jurisdictions: data.jurisdictions,
          specialties: data.specialties,
          hourly_rate: data.hourlyRate,
          bio: data.bio,
        });
      }

      // 3. Seed industry-specific obligation templates
      if (profile?.company_id && data.industryType) {
        await seedObligationsFromIndustry(profile.company_id, data.industryType);
      }

      onComplete();
    } catch (err: any) {
      logger.error('Onboarding error:', err);
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Show a loading screen while the invited-user shortcut resolves
  if (isInvitedUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#002D62] to-[#00A86B] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-white" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#002D62] via-[#003d7a] to-[var(--color-behance-blue)] flex items-center justify-center px-4 py-12">
      <div className="absolute inset-0 opacity-10">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
            backgroundSize: '48px 48px',
          }}
        />
      </div>

      <div className="w-full max-w-2xl relative z-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <ShieldCheck className="w-8 h-8 text-[var(--color-success)]" />
            <span className="text-xl font-bold text-white">Criateur Compliance</span>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Welcome aboard</h1>
          <p className="text-[var(--color-info)]">Let's personalize your compliance experience</p>
        </div>

        <div className="flex items-center justify-center gap-2 mb-8">
          {STEPS.map((step, index) => {
            const Icon = step.icon;
            const isActive = currentStep === step.id;
            const isCompleted = currentStep > step.id;
            return (
              <div key={step.id} className="flex items-center">
                {index > 0 && (
                  <div className={`w-12 h-0.5 mx-1 transition-colors ${isCompleted ? 'bg-[var(--color-success)]' : 'dash-card/20'}`} />
                )}
                <div className="flex flex-col items-center gap-1.5">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${isCompleted
                      ? 'bg-[var(--color-success)] text-white'
                      : isActive
                        ? 'dash-card text-[#002D62]'
                        : 'dash-card/10 text-white/50'
                      }`}
                  >
                    {isCompleted ? <Check className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                  </div>
                  <span className={`text-xs font-medium ${isActive || isCompleted ? 'text-white' : 'text-white/40'}`}>
                    {step.title}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="glass-card rounded-2xl p-8">
          {error && (
            <div className="bg-[var(--color-danger)]/20 border border-red-500/50 text-red-100 px-4 py-3 rounded-lg mb-6">
              {error}
            </div>
          )}

          {currentStep === 1 && <StepCompanyProfile data={data} onUpdate={updateData} />}
          {currentStep === 2 && <StepRegulatoryFocus data={data} onUpdate={updateData} />}
          {currentStep === 3 && <StepRoleAssignment data={data} onUpdate={updateData} />}
          {currentStep === 4 && <StepLegalPartnerDetails data={data} onUpdate={updateData} />}

          <div className="flex items-center justify-between mt-8 pt-6 border-t border-white/10">
            {currentStep > 1 ? (
              <button
                onClick={handleBack}
                className="flex items-center gap-2 px-5 py-2.5 text-white hover:text-[var(--color-info)] transition-colors text-sm font-medium"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>
            ) : (
              <div />
            )}

            {currentStep < STEPS.length ? (
              <button
                onClick={handleNext}
                disabled={!canProceed()}
                className="btn-primary flex items-center gap-2 px-6 py-2.5 rounded-lg text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none"
              >
                Continue
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleFinish}
                disabled={!canProceed() || saving}
                className="btn-primary flex items-center gap-2 px-6 py-2.5 rounded-lg text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none"
              >
                {saving ? 'Saving...' : 'Launch Dashboard'}
                {!saving && <ArrowRight className="w-4 h-4" />}
              </button>
            )}
          </div>
        </div>

        <p className="text-center text-[var(--color-info)]/60 text-xs mt-6">
          Step {currentStep} of {STEPS.length}
        </p>
      </div>
    </div>
  );
}

