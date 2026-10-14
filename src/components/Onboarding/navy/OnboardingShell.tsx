/**
 * The frame every onboarding step sits in: logo, title, subtitle, the
 * step counter and bar, one 680 px column of cards, and the footer.
 *
 * From the ONB-01 notes:
 *
 *   "One card per topic on the ONB-01 column (680 px). Fields use
 *    input/text: 40 px high, label above. Two-column rows only for
 *    short paired fields."
 *
 *   "Footer matches ONB-01: low-emphasis left, primary right."
 *
 * The counter reads "STEP 1 OF 6 · COMPANY DETAILS" with the percentage
 * on the right, and the percentage is DERIVED from the step number
 * rather than written per screen — ONB-01 shows 0% and ONB-02 shows
 * 17%, which is (n-1)/6, so a step added or moved cannot leave a
 * hand-typed figure behind to contradict it.
 */

import type { ReactNode } from 'react';
import { appUrl } from '../../../lib/routing';
import NavyButton from './NavyButton';

export interface OnboardingShellProps {
  /** 1-based, as the screen says it. */
  step: number;
  totalSteps?: number;
  /** The upper-case label after the step number. */
  stepLabel: string;
  title: string;
  subtitle: string;
  children: ReactNode;
  /** Left, low emphasis. "Back to overview" on step 1, "Back" after. */
  backLabel: string;
  onBack: () => void;
  onContinue: () => void;
  continueLabel?: string;
  continueBusy?: boolean;
  /** A second low-emphasis action beside Continue — ONB-05's "Skip for
   *  now", which is a way past the step, not a way back from it, so it
   *  belongs on the right with the primary rather than on the left. */
  secondaryLabel?: string;
  onSecondary?: () => void;
  /** One line under the footer. ONB-04 counts what is switched on
   *  there, where it stays true as the ticks change. */
  footnote?: string;
}

export default function OnboardingShell({
  step, totalSteps = 6, stepLabel, title, subtitle, children,
  backLabel, onBack, onContinue, continueLabel = 'Continue', continueBusy = false,
  secondaryLabel, onSecondary, footnote,
}: OnboardingShellProps) {
  //  0% on step 1, 17% on step 2 — progress through the flow, not
  //  including the step being filled in.
  const pct = Math.round(((step - 1) / totalSteps) * 100);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--onboarding-glow)',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        paddingBlock: 48,
        paddingLeft: 'var(--nv-gutter-mobile)',
        paddingRight: 'var(--nv-gutter-mobile)',
        fontFamily: 'var(--nv-font-body)',
      }}
    >
      <header style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
        width: '100%', maxWidth: 680, textAlign: 'center',
      }}>
        <img src={appUrl('/criateur-logo-ondark.svg')} alt="Criateur"
             style={{ width: 140, height: 'auto' }} />
        <h1 style={{
          margin: 0,
          fontFamily: 'var(--nv-font-display)', fontWeight: 600,
          fontSize: 32, lineHeight: '38px',
          color: 'var(--nv-text-primary)',
          textWrap: 'balance',
        }}>
          {title}
        </h1>
        <p style={{
          margin: 0, maxWidth: 600,
          fontSize: 15, lineHeight: '22px',
          color: 'var(--nv-text-secondary)',
        }}>
          {subtitle}
        </p>
      </header>

      {/* ── Step counter and bar ───────────────────────────────────── */}
      <section style={{
        width: '100%', maxWidth: 680,
        display: 'flex', flexDirection: 'column', gap: 8,
        marginTop: 32,
      }}>
        <div style={{
          display: 'flex', gap: 8,
          fontFamily: 'var(--nv-font-mono)', fontWeight: 500,
          fontSize: 11, lineHeight: '16px', letterSpacing: '0.06em',
          color: 'var(--nv-text-secondary)',
        }}>
          <span style={{ flex: '1 1 0' }}>
            STEP {step} OF {totalSteps} · {stepLabel.toUpperCase()}
          </span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
        </div>
        <div
          role="progressbar"
          aria-valuenow={step - 1}
          aria-valuemin={0}
          aria-valuemax={totalSteps}
          aria-label="Onboarding progress"
          style={{ height: 6, borderRadius: 3, overflow: 'hidden', background: 'var(--nv-surface-hover)' }}
        >
          <div style={{
            height: 6, borderRadius: 3, width: `${pct}%`,
            background: 'var(--nv-action-primary-bg)',
            transition: 'width 240ms ease',
          }} />
        </div>
      </section>

      {/* ── One card per topic ─────────────────────────────────────── */}
      <main style={{
        width: '100%', maxWidth: 680,
        display: 'flex', flexDirection: 'column', gap: 20,
        marginTop: 28,
      }}>
        {children}
      </main>

      {/* ── Footer: low emphasis left, primary right ───────────────── */}
      <footer style={{
        width: '100%', maxWidth: 680,
        display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
        marginTop: 28,
      }}>
        <NavyButton variant="ghost" onClick={onBack}>{backLabel}</NavyButton>
        <div style={{ flex: '1 1 0' }} />
        {secondaryLabel && onSecondary && (
          <NavyButton variant="ghost" onClick={onSecondary}>{secondaryLabel}</NavyButton>
        )}
        <NavyButton onClick={onContinue} loading={continueBusy}>{continueLabel}</NavyButton>
      </footer>

      {footnote && (
        <p style={{
          width: '100%', maxWidth: 680, margin: '16px 0 0', textAlign: 'center',
          fontSize: 13, lineHeight: '19px', color: 'var(--nv-text-tertiary)',
        }}>
          {footnote}
        </p>
      )}
    </div>
  );
}

/** One topic. The screens are a column of these. */
export function OnboardingCard({
  title, description, children,
}: { title: string; description?: string; children: ReactNode }) {
  return (
    <section style={{
      padding: 24,
      borderRadius: 'var(--nv-radius-card)',
      background: 'var(--nv-surface-raised)',
      border: '1px solid var(--nv-border-default)',
      display: 'flex', flexDirection: 'column', gap: 16,
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h2 style={{
          margin: 0,
          fontFamily: 'var(--nv-font-body)', fontWeight: 600,
          fontSize: 16, lineHeight: '22px',
          color: 'var(--nv-text-primary)',
        }}>
          {title}
        </h2>
        {description && (
          <p style={{
            margin: 0,
            fontSize: 14, lineHeight: '21px',
            color: 'var(--nv-text-secondary)',
          }}>
            {description}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

/** "Two-column rows only for short paired fields." */
export function FieldRow({ children }: { children: ReactNode }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
      gap: 16,
    }}>
      {children}
    </div>
  );
}
