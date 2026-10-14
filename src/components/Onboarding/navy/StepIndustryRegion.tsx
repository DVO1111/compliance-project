/**
 * ONB-02 · Industry and where you operate.
 *
 * Three cards: the industry choice, the country and regulators, and a
 * preview of what the starter template will set up.
 *
 * THE THINGS THE NOTES FORBID, each of which is easy to add by accident
 *
 *   "No record counts are shown. The template content is still being
 *    authored (data authoring, J3), and the product must never show
 *    numbers it cannot back."
 *    → the preview is a list of sentences. There is no "24 obligations"
 *      anywhere, and SEED_PREVIEW holds no numbers to render.
 *
 *   "MDCN and NMCN are not offered (A2.11)."
 *    → they are not in REGULATORS at all, so they cannot appear.
 *
 *   "Ghana is shown as 'coming later' text, not as a selectable
 *    option." → COMING_LATER is rendered beside the Nigeria chip as
 *      plain text, with nothing to click.
 *
 *   "Industry options are read from data, not hard-coded (J7.1)."
 *    → INDUSTRIES, and the regulators and previews that follow from it,
 *      all come from onboardingData.ts.
 *
 * The regulators that follow from the industry are shown as selected
 * and fixed; only the optional one can be toggled, because that is the
 * only one that is a decision — "you can add one if you hold its
 * certification".
 */

import { useState } from 'react';
import {
  INDUSTRIES, REGULATORS, COUNTRY, COMING_LATER, SEED_PREVIEW,
  seedTemplateName, SEED_FOOTNOTE, NO_TEMPLATE_NOTE,
} from '../../../lib/onboarding/onboardingData';
import { saveIndustryAndRegion } from '../../../lib/onboarding/setupSteps';
import { ICONS, iconProps } from '../../../lib/design/icons';
import OnboardingShell, { OnboardingCard } from './OnboardingShell';
import SelectCard, { Chip } from './SelectCard';

export interface StepIndustryRegionProps {
  userId: string;
  initialIndustryId?: string;
  initialRegulators?: string[];
  onBack: () => void;
  onDone: () => void;
}

export default function StepIndustryRegion({
  userId, initialIndustryId, initialRegulators, onBack, onDone,
}: StepIndustryRegionProps) {
  const [industryId, setIndustryId] = useState(initialIndustryId ?? INDUSTRIES[0].id);
  const [optional, setOptional] = useState<string[]>(
    initialRegulators?.filter((r) => REGULATORS.find((x) => x.id === r)?.optional) ?? [],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const industry = INDUSTRIES.find((i) => i.id === industryId) ?? INDUSTRIES[0];
  const fixedRegulators = REGULATORS.filter((r) => r.defaultFor.includes(industryId));
  const optionalRegulators = REGULATORS.filter((r) => r.optional);
  const preview = SEED_PREVIEW[industryId] ?? [];

  const Check = ICONS['action/check'];
  const Info = ICONS['action/help'];

  const submit = async () => {
    setBusy(true);
    setError(null);
    const regulators = [...fixedRegulators.map((r) => r.id), ...optional];
    const r = await saveIndustryAndRegion(userId, industry.value, COUNTRY.id, regulators);
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    onDone();
  };

  return (
    <OnboardingShell
      step={2}
      stepLabel="Industry and region"
      title="Industry and where you operate"
      subtitle="Your industry picks a starter template, so your workspace opens with the records that apply to you instead of empty."
      backLabel="Back"
      onBack={onBack}
      onContinue={submit}
      continueBusy={busy}
    >
      <OnboardingCard
        title="Your industry"
        description="The starter template pre-loads obligations, licences, policies and risks. Every record stays editable and removable."
      >
        <div
          role="radiogroup"
          aria-label="Your industry"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 12,
          }}
        >
          {INDUSTRIES.map((i) => (
            <SelectCard
              key={i.id}
              name="industry"
              value={i.id}
              checked={industryId === i.id}
              onChange={setIndustryId}
              icon={ICONS[i.iconName as keyof typeof ICONS]}
              title={i.title}
              description={i.description}
            />
          ))}
        </div>
      </OnboardingCard>

      <OnboardingCard
        title="Where you operate"
        description="Phase 1 covers Nigeria. Your regulators follow from your industry, and you can add one if you hold its certification."
      >
        <div>
          <p style={legend}>COUNTRY</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Chip label={COUNTRY.label} selected />
            {/*  Text, not an option. Phase 2.  */}
            <span style={{ fontSize: 13, lineHeight: '19px', color: 'var(--nv-text-tertiary)' }}>
              {COMING_LATER}
            </span>
          </div>
        </div>

        <div>
          <p style={legend}>REGULATORS</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {fixedRegulators.map((r) => (
              <Chip key={r.id} label={r.label} selected />
            ))}
            {optionalRegulators.map((r) => (
              <Chip
                key={r.id}
                label={r.label}
                selected={optional.includes(r.id)}
                onToggle={() => setOptional((cur) =>
                  cur.includes(r.id) ? cur.filter((x) => x !== r.id) : [...cur, r.id])}
              />
            ))}
          </div>
        </div>
      </OnboardingCard>

      <OnboardingCard
        title="What we’ll set up for you"
        description={seedTemplateName(industryId)}
      >
        {industry.hasTemplate ? (
          <>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 12 }}>
              {preview.map((line) => (
                <li key={line} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span aria-hidden="true" style={{ color: 'var(--nv-action-primary-bg)', marginTop: 1 }}>
                    <Check {...iconProps('sm')} />
                  </span>
                  <span style={{ fontSize: 14, lineHeight: '21px', color: 'var(--nv-text-primary)' }}>
                    {line}
                  </span>
                </li>
              ))}
            </ul>

            <div style={{
              display: 'flex', gap: 10, alignItems: 'flex-start',
              padding: 14, borderRadius: 10,
              background: 'var(--nv-surface-recessed)',
              border: '1px solid var(--nv-border-default)',
            }}>
              <span aria-hidden="true" style={{ color: 'var(--nv-text-tertiary)', marginTop: 1 }}>
                <Info {...iconProps('sm')} />
              </span>
              <p style={{ margin: 0, fontSize: 13, lineHeight: '19px', color: 'var(--nv-text-secondary)' }}>
                {SEED_FOOTNOTE}
              </p>
            </div>
          </>
        ) : (
          //  "Other" says it has no template rather than showing an
          //  empty list, which would read as a loading failure.
          <p style={{ margin: 0, fontSize: 14, lineHeight: '21px', color: 'var(--nv-text-secondary)' }}>
            {NO_TEMPLATE_NOTE}
          </p>
        )}
      </OnboardingCard>

      {error && (
        <p role="alert" style={{ margin: 0, fontSize: 13, lineHeight: '19px', color: '#ffb4a6' }}>
          {error}
        </p>
      )}
    </OnboardingShell>
  );
}

const legend: React.CSSProperties = {
  margin: '0 0 8px',
  fontFamily: 'var(--nv-font-mono)', fontWeight: 500,
  fontSize: 11, lineHeight: '16px', letterSpacing: '0.06em',
  color: 'var(--nv-text-tertiary)',
};
