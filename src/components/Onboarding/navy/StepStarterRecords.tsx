/**
 * ONB-06 · Review your starting records.
 *
 * Four tabs over one list, a "Keep all" on the right of the tab strip,
 * and a Remove / Undo per row.
 *
 * THE STATE RULE, from the notes:
 *
 *   "Removed rows stay visible with Undo until Finish setup."
 *
 * So removing is not deleting. The row stays where it was, its title
 * greys, its badge reads "Removed", and the action becomes Undo. Rows
 * that vanish on click are rows you cannot get back without starting
 * the step again, and the one thing someone does on this screen is
 * remove things quickly.
 *
 *   "'Starter' uses badge/state draft, because these records are
 *    unowned until assigned."
 *
 * The badge is dashed, like ONB-04's "Coming later", because it means
 * the same kind of thing: this record exists but nobody has taken it on
 * yet. Every row says "Owner: unassigned" rather than inventing one.
 *
 *   "Licences rows show 'Add expiry date', and renewal alerts (A5.1)
 *    begin only once a date exists."
 *
 * The licence rows say exactly that, and nothing here writes a date —
 * see starterRecords.ts for why a seeded expiry would be worse than
 * none.
 *
 *   "Seeded records are a starting point, not a constraint: editable
 *    and deletable (J3.5)."
 *
 * Which the footer says in so many words, because it is the thing
 * someone hesitating over "Keep all" needs to know.
 */

import { useState } from 'react';
import {
  STARTER_TABS, starterRecordsFor, keptByDefault,
  STARTER_FOOTNOTE, STARTER_EDITABLE_NOTE, starterSubtitle,
  type StarterTab,
} from '../../../lib/onboarding/starterRecords';
import { INDUSTRIES } from '../../../lib/onboarding/onboardingData';
import { createStarterRecords } from '../../../lib/onboarding/setupSteps';
import { ICONS, iconProps } from '../../../lib/design/icons';
import OnboardingShell, { OnboardingCard } from './OnboardingShell';

export interface StepStarterRecordsProps {
  companyId: string;
  userId: string;
  industryId: string;
  onBack: () => void;
  /** Hands on how many were written, for ONB-07's summary. */
  onDone: (kept: number) => void;
}

export default function StepStarterRecords({
  companyId, userId, industryId, onBack, onDone,
}: StepStarterRecordsProps) {
  const industry = INDUSTRIES.find((i) => i.id === industryId) ?? INDUSTRIES[0];
  const records = starterRecordsFor(industry.id);

  const [tab, setTab] = useState<StarterTab>('obligations');
  const [kept, setKept] = useState<string[]>(() => keptByDefault(industry.id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visible = records.filter((r) => r.tab === tab);
  const Remove = ICONS['action/close'];
  const Info = ICONS['action/help'];

  const toggle = (id: string) =>
    setKept((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const keepAll = () => setKept(records.filter((r) => r.tab === tab)
    .map((r) => r.id)
    //  Only this tab, because "Keep all" sits in this tab's strip and
    //  silently re-adding something removed on another tab would be a
    //  surprise.
    .reduce<string[]>((acc, id) => (acc.includes(id) ? acc : [...acc, id]), [...kept]));

  const finish = async () => {
    setBusy(true);
    setError(null);
    const chosen = records.filter((r) => kept.includes(r.id));
    const r = await createStarterRecords(
      companyId, userId,
      chosen.map((x) => ({ tab: x.tab, title: x.title, write: x.write })),
    );
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    onDone(r.written);
  };

  return (
    <OnboardingShell
      step={6}
      stepLabel="Starting records"
      title="Review your starting records"
      subtitle={starterSubtitle(industry.title)}
      backLabel="Back"
      onBack={onBack}
      onContinue={finish}
      continueLabel="Finish setup"
      continueBusy={busy}
      footnote={STARTER_EDITABLE_NOTE}
    >
      <OnboardingCard title="" description="">
        {/* ── Tabs, with Keep all on the right ──────────────────────── */}
        <div
          role="tablist"
          aria-label="Starting records"
          style={{
            display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap',
            borderBottom: '1px solid var(--nv-border-default)',
            marginTop: -8,
          }}
        >
          {STARTER_TABS.map((t) => {
            const on = t.id === tab;
            const count = records.filter((r) => r.tab === t.id).length;
            return (
              <button
                key={t.id}
                role="tab"
                type="button"
                aria-selected={on}
                onClick={() => setTab(t.id)}
                disabled={count === 0}
                style={{
                  padding: '0 0 10px', border: 'none', background: 'none',
                  cursor: count === 0 ? 'not-allowed' : 'pointer',
                  opacity: count === 0 ? 0.4 : 1,
                  borderBottom: on ? '2px solid var(--nv-text-primary)' : '2px solid transparent',
                  fontFamily: 'var(--nv-font-body)', fontWeight: on ? 600 : 500,
                  fontSize: 15, lineHeight: '21px',
                  color: on ? 'var(--nv-text-primary)' : 'var(--nv-text-secondary)',
                }}
              >
                {t.label}
              </button>
            );
          })}

          <div style={{ flex: '1 1 0' }} />

          <button
            type="button"
            onClick={keepAll}
            style={{
              padding: '0 0 10px', border: 'none', background: 'none', cursor: 'pointer',
              fontFamily: 'var(--nv-font-body)', fontWeight: 600, fontSize: 14,
              color: 'var(--nv-action-primary-bg)',
            }}
          >
            Keep all
          </button>
        </div>

        {/* ── The rows ──────────────────────────────────────────────── */}
        <ul role="tabpanel" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {visible.map((r, i) => {
            const on = kept.includes(r.id);
            const Doc = ICONS['regulatory/obligation'];
            return (
              <li
                key={r.id}
                style={{
                  display: 'flex', gap: 12, alignItems: 'flex-start',
                  padding: '14px 0',
                  borderTop: i === 0 ? 'none' : '1px solid var(--nv-border-default)',
                }}
              >
                <span aria-hidden="true" style={{
                  color: 'var(--nv-icon-default)', marginTop: 2, flex: 'none',
                  opacity: on ? 1 : 0.5,
                }}>
                  <Doc {...iconProps('sm')} />
                </span>

                <div style={{ flex: '1 1 0', minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{
                      fontWeight: 600, fontSize: 14, lineHeight: '20px',
                      color: on ? 'var(--nv-text-primary)' : 'var(--nv-text-tertiary)',
                    }}>
                      {r.title}
                    </span>
                    <span style={authorityBadge}>{r.authority}</span>
                  </div>
                  <p style={{
                    margin: '2px 0 0', fontSize: 13, lineHeight: '19px',
                    color: 'var(--nv-text-secondary)', opacity: on ? 1 : 0.6,
                  }}>
                    {r.detail} · Owner: unassigned
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 'none' }}>
                  {/*  Dashed, like ONB-04's draft badge, and for the same
                      reason: the record exists but nobody owns it yet.  */}
                  <span style={{
                    ...stateBadge,
                    color: on ? 'var(--nv-text-secondary)' : 'var(--nv-text-tertiary)',
                  }}>
                    {on ? 'Starter' : 'Removed'}
                  </span>

                  <button
                    type="button"
                    onClick={() => toggle(r.id)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      border: 'none', background: 'none', padding: 0, cursor: 'pointer',
                      fontFamily: 'var(--nv-font-body)', fontWeight: 500, fontSize: 13,
                      color: on ? 'var(--nv-text-secondary)' : 'var(--nv-action-primary-bg)',
                    }}
                  >
                    {on && <Remove size={14} strokeWidth={2} absoluteStrokeWidth aria-hidden="true" />}
                    {on ? 'Remove' : 'Undo'}
                    <span className="sr-only"> {r.title}</span>
                  </button>
                </div>
              </li>
            );
          })}
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
            {STARTER_FOOTNOTE}
          </p>
        </div>
      </OnboardingCard>

      {error && (
        <p role="alert" style={{ margin: 0, fontSize: 13, lineHeight: '19px', color: '#ffb4a6' }}>
          {error}
        </p>
      )}
    </OnboardingShell>
  );
}

const authorityBadge: React.CSSProperties = {
  fontFamily: 'var(--nv-font-mono)', fontWeight: 500,
  fontSize: 10, lineHeight: '14px', letterSpacing: '0.08em',
  color: 'var(--nv-text-tertiary)',
};

const stateBadge: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center',
  padding: '3px 10px', borderRadius: 6,
  border: '1px dashed var(--nv-border-strong)',
  fontFamily: 'var(--nv-font-mono)', fontSize: 11, lineHeight: '16px',
  whiteSpace: 'nowrap',
};
