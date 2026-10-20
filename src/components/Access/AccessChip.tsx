/**
 * access · Act / View / No access / Not requestable (nodes 80:808–80:814,
 * 80:982, 83:1267).
 *
 * The small chip that says what the viewer's standing is on a stage, a
 * section or a request. It is deliberately NOT badge/state: those six
 * colours mean what has happened to a record — released, rejected, on
 * hold — and a person's access is not a state of a record. Reusing them
 * would make "No access" read in the same red as "Rejected", which is
 * how a permission boundary starts to look like a punishment.
 *
 * So the chip is neutral by design: a quiet outline for View, a tinted
 * fill for Act, a locked grey for the two kinds of No. The lock glyph
 * carries the "you can't" rather than the colour, which is also why it
 * survives greyscale.
 */

import type { CSSProperties } from 'react';
import { Lock } from 'lucide-react';
import { gradeLabel, type AccessGrade } from '../../lib/access/permissionRequests';

export interface AccessChipProps {
  grade: AccessGrade;
  /** Overrides the default wording. "Act", "View", "No access". */
  children?: string;
  className?: string;
}

export default function AccessChip({ grade, children, className }: AccessChipProps) {
  const locked = grade === 'none' || grade === 'not_requestable';
  return (
    <span className={className} style={{ ...chip, ...TINT[grade] }}>
      {locked && <Lock size={14} strokeWidth={1.5} aria-hidden />}
      {children ?? gradeLabel(grade)}
    </span>
  );
}

const chip: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '2px 8px', borderRadius: 4,
  borderWidth: 1, borderStyle: 'solid',
  fontFamily: 'var(--nv-font-body)', fontWeight: 600,
  fontSize: 11, lineHeight: '16px', whiteSpace: 'nowrap',
};

const TINT: Record<AccessGrade, CSSProperties> = {
  //  Act is the only one with a fill. It is the standing that lets
  //  somebody change a record, and it should be the one that catches
  //  the eye when you scan a column of them.
  act: {
    background: 'var(--nv-light-badge-done-bg)',
    borderColor: 'var(--nv-light-badge-done-border)',
    color: 'var(--nv-light-badge-done-text)',
  },
  view: {
    background: 'var(--nv-light-surface)',
    borderColor: 'var(--nv-light-border-strong)',
    color: 'var(--nv-light-text-secondary)',
  },
  none: {
    background: 'var(--nv-light-surface-sunken)',
    borderColor: 'var(--nv-light-border)',
    color: 'var(--nv-light-text-tertiary)',
  },
  //  Identical to `none` on purpose. The difference between them is
  //  whether a Request button appears beside the chip, not how the chip
  //  looks: two greys that mean "no" would be a distinction without a
  //  difference, and the words already differ.
  not_requestable: {
    background: 'var(--nv-light-surface-sunken)',
    borderColor: 'var(--nv-light-border)',
    color: 'var(--nv-light-text-tertiary)',
  },
};
