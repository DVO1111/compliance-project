/**
 * "Sections you can't open" (node 80:935), on DB-02.
 *
 * Step 1: "A person sees a locked stage or section and taps Request
 * access", and the rule that makes it work: "Users don't see actions
 * they can't take; locked sections show why and how to ask."
 *
 * THOSE TWO SENTENCES LOOK CONTRADICTORY AND ARE NOT. Actions are
 * hidden — a storekeeper never sees an Approve button, because a button
 * that refuses is worse than no button. SECTIONS are shown — because a
 * section you cannot see is a part of the product you do not know
 * exists, and the first thing people do when a system seems incomplete
 * is work around it on paper.
 *
 * So this card lists what is locked, says what each one would let them
 * see, and offers the one action that IS available on a locked section:
 * asking. Except for batch release, which offers nothing, because it
 * cannot be requested — and says so where the button would have been.
 */

import type { CSSProperties } from 'react';
import {
  SECTION_LABELS, canBeRequested, unrequestableReason,
  type AccessSection,
} from '../../lib/access/permissionRequests';
import { icon } from '../../lib/design/icons';
import { SECTION_ICON } from './sectionIcons';
import AccessChip from './AccessChip';

export interface LockedSection {
  section: AccessSection;
  /** What having it would let them do: "View results for lots you
   *  received". In their terms, not the section's. */
  wouldAllow: string;
  /** Set while a request on this section is already waiting, so the
   *  person does not send a second one and the admin does not get two. */
  pending?: boolean;
}

export interface LockedSectionsCardProps {
  sections: LockedSection[];
  /** Named so the card says who to ask, not just that somebody exists. */
  adminName?: string;
  onRequest: (section: AccessSection) => void;
  className?: string;
}

export default function LockedSectionsCard({
  sections, adminName, onRequest, className,
}: LockedSectionsCardProps) {
  if (sections.length === 0) return null;

  return (
    <section className={className} style={card}>
      <header style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <h2 style={cardTitle}>Sections you can't open</h2>
        <p style={cardBlurb}>
          Ask {adminName ? `${adminName} (Compliance admin)` : 'the Compliance admin'} for
          access. Every request and decision is logged.
        </p>
      </header>

      {sections.map(({ section, wouldAllow, pending }) => {
        const Glyph = icon(SECTION_ICON[section]);
        const requestable = canBeRequested(section);
        return (
          <div key={section} style={row}>
            <span style={glyphBox}><Glyph size={20} strokeWidth={1.5} aria-hidden /></span>
            {/*  minWidth, not 0. With 0 the row keeps the chip and the
                button on one line and crushes the sentence into a
                two-word column — "Not requestable" stays readable and
                the reason nobody can read is the one that matters. A
                floor here makes the row wrap instead. */}
            <span style={{ flex: 1, minWidth: 190, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontWeight: 600, fontSize: 14, lineHeight: '20px' }}>
                {SECTION_LABELS[section]}
              </span>
              <span style={{ fontSize: 12, lineHeight: '18px', color: 'var(--nv-light-text-tertiary)' }}>
                {/*  For a section that cannot be requested, the reason
                    replaces the description. "QA release role only ·
                    can't be requested" is what somebody needs to read
                    there, not what release would let them do. */}
                {requestable ? wouldAllow : unrequestableReason(section)}
              </span>
            </span>

            {requestable ? (
              pending ? (
                //  Not a disabled Request button. "Requested" is a
                //  state the person is in, and saying so is the answer
                //  to "did that go through?".
                <AccessChip grade="none">Requested</AccessChip>
              ) : (
                <button type="button" style={ghostButton} onClick={() => onRequest(section)}>
                  Request access
                </button>
              )
            ) : (
              <AccessChip grade="not_requestable" />
            )}
          </div>
        );
      })}
    </section>
  );
}

const card: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 12,
  padding: 20, borderRadius: 12,
  background: 'var(--nv-light-surface)', border: '1px solid var(--nv-light-border)',
  fontFamily: 'var(--nv-font-body)', color: 'var(--nv-light-text-primary)',
};

const cardTitle: CSSProperties = {
  margin: 0, fontFamily: 'var(--nv-font-display)', fontWeight: 600,
  fontSize: 18, lineHeight: '24px',
};

const cardBlurb: CSSProperties = {
  margin: 0, fontSize: 12, lineHeight: '18px', color: 'var(--nv-light-text-tertiary)',
};

const row: CSSProperties = {
  display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
  padding: 12, borderRadius: 8,
  background: 'var(--nv-light-surface-sunken)',
};

const glyphBox: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 36, height: 36, flexShrink: 0, borderRadius: 8,
  background: 'var(--nv-light-surface)', border: '1px solid var(--nv-light-border)',
  color: 'var(--nv-light-text-secondary)',
};

const ghostButton: CSSProperties = {
  height: 36, padding: '0 14px', borderRadius: 8, flexShrink: 0,
  background: 'var(--nv-light-outline-bg)',
  border: '1px solid var(--nv-light-outline-border)',
  color: 'var(--nv-light-outline-text)',
  fontFamily: 'var(--nv-font-display)', fontWeight: 600, fontSize: 14, lineHeight: '18px',
  cursor: 'pointer',
};
