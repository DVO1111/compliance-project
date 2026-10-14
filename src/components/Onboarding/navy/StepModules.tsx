/**
 * ONB-04 · Choose what you'll manage.
 *
 * Three sections: what this industry gets by default, what else it is
 * offered, and what is not built yet.
 *
 * THE RULE THAT SHAPES THE WHOLE SCREEN, from the notes:
 *
 *   "'Coming later' cards are dashed, have no checkbox and carry the
 *    draft badge. Nothing on screen looks functional when it is not."
 *
 * So a coming-later card is a <div>, not a disabled <label>. A disabled
 * checkbox is still a checkbox: it tells someone the feature exists and
 * that they are not allowed to have it, which is a different and worse
 * message than "this is not built yet".
 *
 *   "A pharmaceutical manufacturer never sees logistics or customs
 *    modules: they are not offered at all (J9.1)."
 *
 * An area outside this industry is not rendered in ANY section — not
 * greyed, not in "also available". sectionsForIndustry does the
 * filtering, so there is one place it can go wrong.
 *
 *   "Plain language, never technical module names."
 *
 * Nothing on this screen renders `grants`. The person reads "Run batch
 * records on the floor"; quality_operations is what gets stored.
 */

import { useState } from 'react';
import {
  sectionsForIndustry, modulesForAreas, switchedOnLine, recommendedHeading,
  type OnboardingArea,
} from '../../../lib/onboarding/onboardingAreas';
import { INDUSTRIES } from '../../../lib/onboarding/onboardingData';
import { saveAreas } from '../../../lib/onboarding/setupSteps';
import { ICONS, iconProps } from '../../../lib/design/icons';
import OnboardingShell, { OnboardingCard } from './OnboardingShell';

export interface StepModulesProps {
  companyId: string;
  userId: string;
  /** From ONB-02. Decides which areas exist at all. */
  industryId: string;
  initialAreas: string[];
  onBack: () => void;
  onDone: () => void;
}

export default function StepModules({
  companyId, userId, industryId, initialAreas, onBack, onDone,
}: StepModulesProps) {
  const industry = INDUSTRIES.find((i) => i.id === industryId) ?? INDUSTRIES[0];
  const sections = sectionsForIndustry(industry.id);

  const [chosen, setChosen] = useState<string[]>(initialAreas);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) =>
    setChosen((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const submit = async () => {
    if (chosen.length === 0) {
      setError('Switch on at least one area — an empty workspace has no menus at all.');
      return;
    }
    setBusy(true);
    setError(null);
    const r = await saveAreas(companyId, userId, chosen, modulesForAreas(chosen));
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    onDone();
  };

  return (
    <OnboardingShell
      step={4}
      stepLabel="What you’ll manage"
      title="Choose what you’ll manage"
      subtitle="Switch on the parts of Criateur your team needs. Anything you leave off stays out of menus, and you can change it later in Company Settings."
      backLabel="Back"
      onBack={onBack}
      onContinue={submit}
      continueBusy={busy}
      footnote={switchedOnLine(chosen.length)}
    >
      <OnboardingCard
        title={recommendedHeading(industry.plural)}
        description="Already switched on, based on your industry. Untick anything you don’t need."
      >
        <AreaGrid>
          {sections.recommended.map((a) => (
            <AreaCard key={a.id} area={a} checked={chosen.includes(a.id)} onToggle={toggle} />
          ))}
        </AreaGrid>
      </OnboardingCard>

      {sections.alsoAvailable.length > 0 && (
        <OnboardingCard title="Also available" description="Off by default for your industry.">
          <AreaGrid>
            {sections.alsoAvailable.map((a) => (
              <AreaCard key={a.id} area={a} checked={chosen.includes(a.id)} onToggle={toggle} />
            ))}
          </AreaGrid>
        </OnboardingCard>
      )}

      {sections.comingLater.length > 0 && (
        <OnboardingCard
          title="Coming later"
          description="In development. You can’t switch these on yet, and they never appear in menus until they work."
        >
          <AreaGrid>
            {sections.comingLater.map((a) => <ComingLaterCard key={a.id} area={a} />)}
          </AreaGrid>
        </OnboardingCard>
      )}

      {error && (
        <p role="alert" style={{ margin: 0, fontSize: 13, lineHeight: '19px', color: '#ffb4a6' }}>
          {error}
        </p>
      )}
    </OnboardingShell>
  );
}

function AreaGrid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
      gap: 12,
    }}>
      {children}
    </div>
  );
}

/**
 * One switchable area.
 *
 * A real checkbox inside a label, visually hidden: the tick on the right
 * is decoration and the input carries the state, so the card is
 * reachable by keyboard and announced as checked or not.
 */
function AreaCard({ area, checked, onToggle }: {
  area: OnboardingArea; checked: boolean; onToggle: (id: string) => void;
}) {
  const Icon = ICONS[area.iconName as keyof typeof ICONS];
  const Check = ICONS['action/check'];

  return (
    <label style={{
      display: 'flex', gap: 12, alignItems: 'flex-start',
      padding: 14, borderRadius: 12, cursor: 'pointer', boxSizing: 'border-box', height: '100%',
      background: checked ? 'rgba(113, 166, 106, 0.10)' : 'var(--nv-surface-recessed)',
      border: checked
        ? '1.5px solid var(--nv-action-primary-bg)'
        : '1px solid var(--nv-border-default)',
    }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={() => onToggle(area.id)}
        className="sr-only"
      />

      <span aria-hidden="true" style={{
        width: 32, height: 32, flex: 'none', borderRadius: 9,
        display: 'grid', placeItems: 'center',
        background: checked ? 'rgba(113, 166, 106, 0.18)' : 'var(--nv-surface-hover)',
        color: checked ? 'var(--nv-action-primary-bg)' : 'var(--nv-icon-default)',
      }}>
        <Icon {...iconProps('sm')} />
      </span>

      <span style={{ flex: '1 1 0', minWidth: 0 }}>
        <span style={cardTitle}>{area.title}</span>
        <span style={cardBody}>{area.description}</span>
      </span>

      <span aria-hidden="true" style={{
        width: 20, height: 20, flex: 'none', borderRadius: 6,
        display: 'grid', placeItems: 'center',
        background: checked ? 'var(--nv-action-primary-bg)' : 'transparent',
        border: checked ? 'none' : '1px solid var(--nv-border-strong)',
        color: 'var(--nv-action-primary-text)',
      }}>
        {checked && <Check size={14} strokeWidth={2.5} absoluteStrokeWidth />}
      </span>
    </label>
  );
}

/**
 * Something that does not exist yet.
 *
 * Dashed, no input element of any kind, and the draft badge. It is a
 * statement about the roadmap, not a control — so there is nothing to
 * click, nothing to focus, and nothing to mistake for a setting.
 */
function ComingLaterCard({ area }: { area: OnboardingArea }) {
  const Icon = ICONS[area.iconName as keyof typeof ICONS];
  const Draft = ICONS['action/time'];

  return (
    <div style={{
      display: 'flex', gap: 12, alignItems: 'flex-start',
      padding: 14, borderRadius: 12, boxSizing: 'border-box', height: '100%',
      background: 'transparent',
      border: '1px dashed var(--nv-border-strong)',
    }}>
      <span aria-hidden="true" style={{
        width: 32, height: 32, flex: 'none', borderRadius: 9,
        display: 'grid', placeItems: 'center',
        background: 'var(--nv-surface-hover)', color: 'var(--nv-icon-default)',
      }}>
        <Icon {...iconProps('sm')} />
      </span>

      <span style={{ flex: '1 1 0', minWidth: 0 }}>
        <span style={{ ...cardTitle, color: 'var(--nv-text-secondary)' }}>{area.title}</span>
        <span style={cardBody}>{area.description}</span>

        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10,
          padding: '3px 8px', borderRadius: 6,
          border: '1px dashed var(--nv-border-strong)',
          fontFamily: 'var(--nv-font-mono)', fontSize: 11, lineHeight: '16px',
          color: 'var(--nv-text-tertiary)',
        }}>
          <Draft size={12} strokeWidth={2} absoluteStrokeWidth aria-hidden="true" />
          Coming later
        </span>
      </span>
    </div>
  );
}

const cardTitle: React.CSSProperties = {
  display: 'block', fontWeight: 600, fontSize: 14, lineHeight: '20px',
  color: 'var(--nv-text-primary)',
};

const cardBody: React.CSSProperties = {
  display: 'block', marginTop: 4, fontSize: 13, lineHeight: '19px',
  color: 'var(--nv-text-secondary)',
};
