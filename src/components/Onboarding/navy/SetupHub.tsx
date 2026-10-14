/**
 * ONB-00 · Set up your workspace (node 26:384).
 *
 * The onboarding hub, built from the Product Design file rather than
 * restyled from the old wizard. What makes it a different screen and not
 * a reskin is in the ONB-00 notes frame:
 *
 *   "4 steps become 6. Added: company details, industry + region, sites
 *    + product categories, module choice (H7.1, J9.1, checklist W1·14)."
 *
 *   "Removed as manual steps: 'Add your first policy' and 'Set
 *    compliance obligations'. The industry template now pre-loads them
 *    (J3.2–J3.4), so they become step 6 'Review your starting records'."
 *
 *   "'Create your first department' is folded into step 3. Sites use the
 *    same mechanism as departments (H1.3), and departments drive
 *    document numbering (B3.9, X6.3)."
 *
 *   "'Skip setup' becomes 'Finish later'. Skipping straight to an empty
 *    dashboard is the problem J3.3 describes, so the workspace opens
 *    after steps 1–4."
 *
 * That last clause is a real gate and is implemented in `canOpenWorkspace`
 * below, not left as prose: steps 1–4 are REQUIRED and 5–6 are not, so
 * the workspace opens at four of six rather than six of six.
 *
 * TWO RULES THE NOTES STATE AS RULES
 * ----------------------------------
 *   "Upcoming steps show no button, only what unlocks them (W1·13:
 *    actions absent, not disabled)." — enforced in StepRow, which has no
 *    disabled state to reach for.
 *
 *   "No time or count is shown that the product cannot back up.
 *    Durations are estimates and are labelled 'about'." — every meta
 *    line below says "ABOUT n MIN", and the progress count is derived
 *    from the steps rather than written down.
 *
 * WHAT THIS SCREEN DOES NOT DO YET. It is the hub: it shows state and
 * routes. Steps 1 and 3 need schema that does not exist — `companies`
 * has only id, name and created_at, so there is nowhere to put a CAC
 * registration number or a head office, and there is a `departments`
 * table but no `sites` table. The step screens behind this hub are
 * therefore not built, and `onOpenStep` is how they will be reached.
 */

import { useMemo } from 'react';
import { appUrl } from '../../../lib/routing';
import { ICONS, iconProps } from '../../../lib/design/icons';
import StepRow, { type StepState } from './StepRow';
import NavyButton from './NavyButton';

export interface SetupStep {
  id: string;
  title: string;
  description: string;
  /** Shown as "ABOUT n MIN"; omitted entirely when unknown. */
  aboutMinutes?: number;
  /** Steps 1–4 are required; the workspace opens once they are done. */
  required: boolean;
  done: boolean;
  iconName: keyof typeof ICONS;
}

/** The six steps, in the order and wording of ONB-00. */
export const SETUP_STEPS: readonly Omit<SetupStep, 'done'>[] = [
  {
    id: 'company-details',
    title: 'Company details',
    description:
      'Legal name, CAC registration number and head office. These appear on certificates of analysis and regulatory applications.',
    aboutMinutes: 2,
    required: true,
    iconName: 'access/department',
  },
  {
    id: 'industry-region',
    title: 'Industry and where you operate',
    description:
      'Choose your industry and country. We pre-load the regulators, obligations, policies and risks that apply to you.',
    aboutMinutes: 1,
    required: true,
    iconName: 'access/jurisdiction',
  },
  {
    id: 'sites-departments',
    title: 'Sites, departments and products',
    description:
      'Add each factory or warehouse, the departments that raise records, and what each site makes.',
    aboutMinutes: 3,
    required: true,
    iconName: 'access/site',
  },
  {
    id: 'modules',
    title: "Choose what you'll manage",
    description:
      'Switch on only the parts of Criateur you need. You can change this later in Company Settings.',
    aboutMinutes: 1,
    required: true,
    iconName: 'nav/dashboard',
  },
  {
    id: 'invite-team',
    title: 'Invite your team',
    description:
      'Add colleagues with their role and site. Roles decide who can approve, sign and release.',
    required: false,
    iconName: 'access/invite',
  },
  {
    id: 'review-records',
    title: 'Review your starting records',
    description:
      'Check the obligations, licences, policies and risks we pre-loaded. Keep, edit or remove each one.',
    aboutMinutes: 3,
    required: false,
    iconName: 'regulatory/obligation',
  },
] as const;

/** The gate from the notes: the workspace opens after steps 1–4, not
 *  after all six. Exported so it can be tested on its own. */
export function canOpenWorkspace(steps: readonly SetupStep[]): boolean {
  return steps.filter((s) => s.required).every((s) => s.done);
}

/** The state of one row. The first not-done step is Current; everything
 *  after it is Upcoming, which is what gives the hub its single focus. */
export function stepStates(steps: readonly SetupStep[]): StepState[] {
  const firstOpen = steps.findIndex((s) => !s.done);
  return steps.map((s, i) => {
    if (s.done) return 'done';
    if (i === firstOpen) return 'current';
    return 'upcoming';
  });
}

/** "STEP 1 · ABOUT 2 MIN · REQUIRED", with the parts that are unknown
 *  left out rather than guessed.
 *
 *  ONB-M00 drops the duration: the mobile rows read "STEP 1 · REQUIRED".
 *  The adaptation-rules frame says only that descriptions go, but the
 *  mobile screens themselves also shed the durations and shorten the
 *  unlock text, so the screens are the spec where the two disagree. */
export function metaLine(
  step: Omit<SetupStep, 'done'>, index: number, compact = false,
): string {
  const parts = [`STEP ${index + 1}`];
  if (!compact && step.aboutMinutes !== undefined) parts.push(`ABOUT ${step.aboutMinutes} MIN`);
  if (step.required) parts.push('REQUIRED');
  //  Only "Invite your team" is labelled OPTIONAL NOW in ONB-00. Step 6
  //  carries no such label, so the tag is keyed to the step rather than
  //  to its position — reordering the list must not relabel a step.
  else if (step.id === 'invite-team') parts.push('OPTIONAL NOW');
  return parts.join(' · ');
}

export interface SetupHubProps {
  /** Which steps are finished. Keyed by step id; absent means not done. */
  completed?: Record<string, boolean>;
  compact?: boolean;
  onOpenStep?: (stepId: string) => void;
  onFinishLater?: () => void;
  onStartSetup?: () => void;
}

export default function SetupHub({
  completed = {},
  compact = false,
  onOpenStep,
  onFinishLater,
  onStartSetup,
}: SetupHubProps) {
  const steps: SetupStep[] = useMemo(
    () => SETUP_STEPS.map((s) => ({ ...s, done: completed[s.id] === true })),
    [completed],
  );

  const states = stepStates(steps);
  const doneCount = steps.filter((s) => s.done).length;
  const pct = Math.round((doneCount / steps.length) * 100);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--onboarding-glow)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 32,
        paddingBlock: 56,
        paddingLeft: 'var(--nv-gutter-mobile)',
        paddingRight: 'var(--nv-gutter-mobile)',
        fontFamily: 'var(--nv-font-body)',
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────── */}
      <header style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', maxWidth: 680, width: '100%' }}>
        <img
          src={appUrl("/criateur-logo-ondark.svg")}
          alt="Criateur"
          /*  140 px on onboarding, per the logo component's description;
              120 px on mobile, per the adaptation rules. Both stay above
              the 76 px Primary Logo minimum.  */
          style={{ width: compact ? 120 : 140, height: 'auto' }}
        />
        <h1
          style={{
            margin: 0,
            fontFamily: 'var(--nv-font-display)', fontWeight: 600,
            fontSize: compact ? 24 : 32,
            lineHeight: compact ? '30px' : '38px',
            color: 'var(--nv-text-primary)',
            textAlign: 'center',
            textWrap: 'balance',
          }}
        >
          Set up your workspace
        </h1>
        <p
          style={{
            margin: 0, maxWidth: 600,
            fontFamily: 'var(--nv-font-body)', fontWeight: 400,
            fontSize: compact ? 14 : 15,
            lineHeight: compact ? '20px' : '22px',
            color: 'var(--nv-text-secondary)',
            textAlign: 'center',
          }}
        >
          {compact
            ? 'Six short steps. Most teams finish in one sitting.'
            : 'Six short steps. Most teams finish in one sitting, without help from an implementation consultant.'}
        </p>
      </header>

      {/* ── Progress ───────────────────────────────────────────────── */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 680 }}>
        <div style={{
          display: 'flex', gap: 8,
          fontFamily: 'var(--nv-font-mono)', fontWeight: 500,
          fontSize: 11, lineHeight: '16px',
          color: 'var(--nv-text-secondary)',
        }}>
          {/*  Derived from the steps, never written down, so it cannot
              disagree with the rows beneath it.  */}
          <span style={{ flex: '1 1 0' }}>{doneCount} OF {steps.length} COMPLETED</span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
        </div>
        <div
          role="progressbar"
          aria-valuenow={doneCount}
          aria-valuemin={0}
          aria-valuemax={steps.length}
          aria-label="Setup progress"
          style={{
            height: 6, borderRadius: 3, overflow: 'hidden',
            background: 'var(--nv-surface-hover)',
          }}
        >
          <div style={{
            height: 6, borderRadius: 3,
            width: `${pct}%`,
            background: 'var(--nv-action-primary-bg)',
            transition: 'width 240ms ease',
          }} />
        </div>
      </section>

      {/* ── The six steps ──────────────────────────────────────────── */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', maxWidth: 680 }}>
        {steps.map((step, i) => (
          <StepRow
            key={step.id}
            state={states[i]}
            icon={ICONS[step.iconName]}
            title={step.title}
            description={step.description}
            meta={metaLine(step, i, compact)}
            /*  What unlocks this step: the step before it, except where
                the notes make several wait on step 4. Mobile shortens
                "Opens after step n" to "After step n".  */
            unlockedBy={`${compact ? 'After' : 'Opens after'} step ${Math.min(i, 4)}`}
            compact={compact}
            onStart={() => onOpenStep?.(step.id)}
            onEdit={() => onOpenStep?.(step.id)}
          />
        ))}
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────
           Desktop: low-emphasis exit left, primary right.
           Mobile: the primary is full width ON TOP, the ghost below —
           "the main action is closest to the thumb and comes first in
           reading order."  */}
      <footer
        style={{
          display: 'flex',
          flexDirection: compact ? 'column' : 'row',
          gap: 16,
          alignItems: 'center',
          width: '100%', maxWidth: 680,
        }}
      >
        {compact ? (
          <>
            <NavyButton fullWidth onClick={onStartSetup}>
              {doneCount === 0 ? 'Start setup' : 'Continue setup'}
            </NavyButton>
            <NavyButton variant="ghost" fullWidth onClick={onFinishLater}>
              Finish later
            </NavyButton>
          </>
        ) : (
          <>
            <NavyButton variant="ghost" onClick={onFinishLater}>Finish later</NavyButton>
            <div style={{ flex: '1 1 0' }} />
            <NavyButton onClick={onStartSetup}>
              {doneCount === 0 ? 'Start setup' : 'Continue setup'}
            </NavyButton>
          </>
        )}
      </footer>

      {/*  ONB-M00 has no reassurance line; the mobile screen ends at the
           footer. Kept on desktop, where ONB-00 shows it.  */}
      {!compact && (
        <p
          style={{
            margin: 0, maxWidth: 680, textAlign: 'center',
            fontFamily: 'var(--nv-font-body)', fontWeight: 400,
            fontSize: 12, lineHeight: '18px',
            color: 'var(--nv-text-tertiary)',
          }}
        >
          Progress is saved after every step. The workspace opens once steps 1–4 are
          done; 5 and 6 can be finished from the dashboard.
        </p>
      )}
    </div>
  );
}
