/**
 * The `onboarding/step-row` component (node 25:408).
 *
 * Figma's own description is the contract:
 *
 *   "Hub step row (keeps the ONB-01 step card layout: icon circle,
 *    title, description, action on the right). Done = green check +
 *    Done badge + Edit; Current = green border + Start; Upcoming = no
 *    button, says what unlocks it (actions absent, not disabled)."
 *
 * THE RULE THAT MATTERS MOST IS THE LAST CLAUSE, and the ONB-00 notes
 * frame states it again as a rule in its own right: "Upcoming steps show
 * no button, only what unlocks them (W1·13: actions absent, not
 * disabled)."
 *
 * A disabled button is a promise the screen will not keep — it says "you
 * may do this" and then refuses. An absent button with "Opens after step
 * 2" says the true thing: not yet, and here is what comes first. So the
 * Upcoming branch below renders TEXT where the others render a control,
 * and there is deliberately no `disabled` prop anywhere in this file.
 *
 * Mobile: the adaptation rules say "Nothing is removed except
 * descriptions on the hub step rows", which is what `compact` does.
 */

import type { LucideIcon } from 'lucide-react';
import { Check } from 'lucide-react';
import { iconProps, STATUS_ICONS } from '../../../lib/design/icons';
import NavyButton from './NavyButton';

export type StepState = 'done' | 'current' | 'upcoming';

export interface StepRowProps {
  state: StepState;
  icon: LucideIcon;
  title: string;
  description: string;
  /** The mono line: "STEP 1 · ABOUT 2 MIN · REQUIRED". Durations are
   *  estimates and the design requires the word "about" — the notes say
   *  "No time or count is shown that the product cannot back up." */
  meta: string;
  /** Upcoming only: what unlocks this step, e.g. "Opens after step 2". */
  unlockedBy?: string;
  /** Drop the description, as the mobile rules require. */
  compact?: boolean;
  onStart?: () => void;
  onEdit?: () => void;
}

export default function StepRow({
  state, icon: Icon, title, description, meta, unlockedBy, compact = false,
  onStart, onEdit,
}: StepRowProps) {
  const isCurrent = state === 'current';
  const isDone = state === 'done';
  const isUpcoming = state === 'upcoming';

  return (
    <div
      style={{
        display: 'flex',
        gap: 16,
        alignItems: 'center',
        padding: '16px 20px',
        borderRadius: 'var(--nv-radius-card)',
        background: 'var(--nv-surface-raised)',
        //  Current is a 1.5 px green border; the others a 1 px default.
        //  The weights differ in the design, not just the colour.
        border: isCurrent
          ? '1.5px solid var(--nv-action-primary-bg)'
          : '1px solid var(--nv-border-default)',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* ── Icon circle. Done fills it green and shows a check; the
             others are a recessed surface with the step's own icon. ── */}
      <div
        style={{
          width: 40, height: 40, flex: 'none',
          borderRadius: 20,
          display: 'grid', placeItems: 'center',
          background: isDone
            ? 'var(--nv-action-primary-bg)'
            : 'var(--nv-surface-recessed)',
          color: isDone
            ? 'var(--nv-action-primary-text)'
            : 'var(--nv-icon-default)',
        }}
      >
        {isDone
          ? <Check {...iconProps('md')} />
          : <Icon {...iconProps('md')} />}
      </div>

      {/* ── Title, description, meta ───────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 0', minWidth: 0 }}>
        <p
          style={{
            margin: 0,
            fontFamily: 'var(--nv-font-body)', fontWeight: 600,
            fontSize: 15, lineHeight: '22px',
            //  An upcoming step's title is secondary, not primary: the
            //  row is present but is not yet asking for anything.
            color: isUpcoming ? 'var(--nv-text-secondary)' : 'var(--nv-text-primary)',
            overflowWrap: 'anywhere',
          }}
        >
          {title}
        </p>

        {!compact && (
          <p style={{
            margin: 0,
            fontFamily: 'var(--nv-font-body)', fontWeight: 400,
            fontSize: 13, lineHeight: '20px',
            color: 'var(--nv-text-secondary)',
            overflowWrap: 'anywhere',
          }}>
            {description}
          </p>
        )}

        <p style={{
          margin: 0,
          fontFamily: 'var(--nv-font-mono)', fontWeight: 500,
          fontSize: 11, lineHeight: '16px',
          color: 'var(--nv-text-tertiary)',
        }}>
          {meta}
        </p>
      </div>

      {/* ── The action, which differs per state ────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
        {isDone && (
          <>
            <StateBadge label="Done" />
            <button
              type="button"
              onClick={onEdit}
              style={{
                background: 'none', border: 'none', padding: 0,
                cursor: 'pointer',
                fontFamily: 'var(--nv-font-body)', fontWeight: 600,
                fontSize: 13, lineHeight: '18px',
                color: 'var(--nv-action-primary-bg)',
                whiteSpace: 'nowrap',
              }}
            >
              Edit
            </button>
          </>
        )}

        {isCurrent && (
          <NavyButton onClick={onStart} style={{ width: 96 }}>Start</NavyButton>
        )}

        {/*  ACTIONS ABSENT, NOT DISABLED. This is text, not a control.  */}
        {isUpcoming && (
          <p style={{
            margin: 0,
            fontFamily: 'var(--nv-font-body)', fontWeight: 400,
            fontSize: 12, lineHeight: '18px',
            color: 'var(--nv-text-tertiary)',
            whiteSpace: 'nowrap',
          }}>
            {unlockedBy}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * `badge/state` (node 16:76), in its compliant variant.
 *
 * "State badge. Height 24, padding 4/10/4/8, radius 4 (sm), gap 6, icon
 *  16 px, Sora SemiBold 12/16. Colours bound to State colours variables."
 *
 * The icon is never the whole signal — the toolkit's Status section is
 * explicit that an icon always pairs with a text label — so the label is
 * a required prop rather than an option.
 */
export function StateBadge({ label }: { label: string }) {
  const Released = STATUS_ICONS.released.icon;
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        height: 24, padding: '4px 10px 4px 8px',
        borderRadius: 4,
        background: 'var(--nv-state-compliant-bg)',
        border: '1px solid var(--nv-state-compliant-border)',
        color: 'var(--nv-state-compliant-text)',
        fontFamily: 'var(--nv-font-body)', fontWeight: 600,
        fontSize: 12, lineHeight: '16px',
        whiteSpace: 'nowrap',
        boxSizing: 'border-box',
      }}
    >
      <Released {...iconProps('sm')} />
      {label}
    </span>
  );
}
