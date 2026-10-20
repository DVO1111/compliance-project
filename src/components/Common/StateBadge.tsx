/**
 * badge/state (node 16:76).
 *
 * From the component's description:
 *
 *   "State badge. Height 24, padding 4/10/4/8, radius 4 (sm), gap 6,
 *    icon 16 px, Sora SemiBold 12/16. Colours bound to State colours
 *    variables. Edit the Label text for the specific state name
 *    (e.g. 'Awaiting QC' uses State=pending)."
 *
 * THE LABEL IS NOT THE STATE. That last sentence is the one that makes
 * this component reusable: "Awaiting QC", "Pending QA closure" and
 * "Registration pending" are three different words for one visual
 * state. So the caller passes the words — usually straight from a
 * lifecycle definition's label — and separately says which of the six
 * states colours them.
 *
 * THE DRAFT BADGE IS DASHED, and that is not decoration. The icon
 * toolkit is explicit that colour is never the only signal: each state
 * pairs a colour with a distinct shape so it survives greyscale and
 * colour blindness. Draft's border is dashed because grey and
 * light-grey are the pair most easily lost, and a dashed edge reads as
 * "not started" without any colour at all.
 */

import type { CSSProperties, ReactNode } from 'react';
import { STATUS_ICONS, iconProps, type StatusKey } from '../../lib/design/icons';

/**
 * The six states the design system defines. These are the same keys
 * the icon toolkit uses, so the glyph comes along with the colour and
 * the two cannot be paired wrongly.
 */
export type BadgeState = StatusKey;

export interface StateBadgeProps {
  state: BadgeState;
  /** The state's name in this context. "Awaiting QC", not "pending". */
  children: ReactNode;
  className?: string;
}

const TINT: Record<BadgeState, { bg: string; border: string; text: string; dashed?: boolean }> = {
  released:  {
    bg: 'var(--nv-light-badge-done-bg)',
    border: 'var(--nv-light-badge-done-border)',
    text: 'var(--nv-light-badge-done-text)',
  },
  pending:   {
    bg: 'var(--nv-light-badge-waiting-bg)',
    border: 'var(--nv-light-badge-waiting-border)',
    text: 'var(--nv-light-badge-waiting-text)',
  },
  overdue:   {
    bg: 'var(--nv-light-state-overdue-bg)',
    border: 'var(--nv-light-state-overdue-border)',
    text: 'var(--nv-light-state-overdue-text)',
  },
  rejected:  {
    //  Solid red with white type. The only badge that inverts, because
    //  rejected is the one state that must never be mistaken for a
    //  tint — see record/banner, which deliberately does not use it.
    bg: 'var(--nv-light-state-rejected-bg)',
    border: 'var(--nv-light-state-rejected-bg)',
    text: 'var(--nv-light-state-rejected-text)',
  },
  on_hold:   {
    bg: 'var(--nv-light-state-hold-bg)',
    border: 'var(--nv-light-state-hold-border)',
    text: 'var(--nv-light-state-hold-text)',
  },
  draft:     {
    bg: 'var(--nv-light-badge-todo-bg)',
    border: 'var(--nv-light-badge-todo-border)',
    text: 'var(--nv-light-badge-todo-text)',
    dashed: true,
  },
  info:      {
    bg: 'var(--nv-light-state-hold-bg)',
    border: 'var(--nv-light-state-hold-border)',
    text: 'var(--nv-light-state-hold-text)',
  },
  /**
   * W4·15. The second badge that inverts, and only the second: solid
   * navy with white type, bound from node 119:1503.
   *
   * "Quarantine looks like On hold: no. Quarantine is solid navy with
   * a lock; On hold is the light hold tint with a pause icon. Distinct
   * in greyscale too." The two sit next to each other in a lot list,
   * and the greyscale clause is the real test — a tint and a fill
   * differ in print and under a colour-blind palette, two tints do
   * not.
   */
  quarantine: {
    bg: 'var(--nv-light-state-quarantine-bg)',
    border: 'var(--nv-light-state-quarantine-bg)',
    text: 'var(--nv-light-state-quarantine-text)',
  },
};

export default function StateBadge({ state, children, className }: StateBadgeProps) {
  const t = TINT[state];
  const Glyph = STATUS_ICONS[state].icon;

  return (
    <span
      className={className}
      style={{
        ...badge,
        background: t.bg,
        borderColor: t.border,
        borderStyle: t.dashed ? 'dashed' : 'solid',
        color: t.text,
      }}
    >
      {/*  "Always pair with a text label" — the toolkit's rule for every
          status icon, so the glyph is decorative here and the words
          carry the meaning.  */}
      <Glyph {...iconProps('sm')} aria-hidden="true" />
      {children}
    </span>
  );
}

//  Height 24, padding 4/10/4/8, radius 4, gap 6, icon 16, 12/16 at 600.
//  The asymmetric padding is the component's: the icon needs less room
//  on its side than the text does on its own.
const badge: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  height: 24, boxSizing: 'border-box',
  padding: '4px 10px 4px 8px',
  borderRadius: 4,
  borderWidth: 1,
  fontFamily: 'var(--nv-font-body)',
  fontSize: 12, lineHeight: '16px', fontWeight: 600,
  whiteSpace: 'nowrap',
};
