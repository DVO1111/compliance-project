/**
 * The two signature records (BR-04, BR-05).
 *
 * The design's NOT DONE IF names the failure and the fix in one
 * sentence:
 *
 *   "Second signature looks like the first: no. Operator = green
 *    rounded card with '1'; verifier = navy square card with a header
 *    band and '2'."
 *
 * WHY THEY MUST NOT MATCH. Two identical cards side by side read as
 * one thing done twice. The whole point of a two-person rule is that
 * two DIFFERENT people did two DIFFERENT things — one performed the
 * work, one checked it — and an inspector looking at a batch record
 * is checking exactly that. So the cards differ in fill, in corner
 * radius, and in whether they carry a header band: three differences,
 * none of which is colour alone, so the distinction survives a printed
 * batch record.
 *
 * The waiting state is a card too, not an absence. BR-04 is a screen
 * in its own right — "operator signed, waiting for verifier" — and a
 * missing second card would read as a stage that needs one signature.
 */

import type { CSSProperties } from 'react';
import { PenLine, Clock, UserCheck } from 'lucide-react';
import { TOUCH } from '../../lib/batch/stageStrip';

export interface SignatureRecord {
  name: string;
  /** "Operator · Line 2" — their standing at the moment of signing. */
  standing?: string;
  /** "12 Oct 2026 · 14:22". */
  signedAt: string;
  /** The §11.50 meaning, shown because it is what they attested to. */
  meaning: string;
}

export interface SignOffPairProps {
  operator: SignatureRecord | null;
  verifier: SignatureRecord | null;
  /** False when this stage needs only one signature. */
  requiresVerifier: boolean;
  /** Shown on the waiting card, and the only action on BR-04. */
  onVerify?: () => void;
  /** True when the signed-in person is the operator: they may not verify. */
  viewerIsOperator?: boolean;
  className?: string;
}

export default function SignOffPair({
  operator, verifier, requiresVerifier, onVerify, viewerIsOperator = false, className,
}: SignOffPairProps) {
  return (
    <div className={className} style={pair}>
      <Card
        ordinal="1"
        kind="operator"
        title="Performed by"
        record={operator}
        placeholder="Not signed yet."
      />

      {requiresVerifier && (
        verifier ? (
          <Card ordinal="2" kind="verifier" title="Verified by" record={verifier} />
        ) : (
          <WaitingCard onVerify={onVerify} viewerIsOperator={viewerIsOperator} />
        )
      )}
    </div>
  );
}

function Card({ ordinal, kind, title, record, placeholder }: {
  ordinal: string;
  kind: 'operator' | 'verifier';
  title: string;
  record: SignatureRecord | null;
  placeholder?: string;
}) {
  const verifier = kind === 'verifier';

  return (
    <section style={{ ...card, ...(verifier ? verifierCard : operatorCard) }}>
      {/*  The header band is the verifier card's alone. It is the
          difference that survives greyscale most reliably, because it
          changes the card's silhouette rather than its colour. */}
      {verifier && (
        <div style={band}>
          <UserCheck size={16} strokeWidth={2} aria-hidden />
          Second person
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: verifier ? '0 14px' : 0 }}>
        <span style={{ ...ordinalMark, ...(verifier ? verifierMark : operatorMark) }}>{ordinal}</span>
        <span style={{ ...cardTitle, color: verifier ? '#ffffff' : 'var(--nv-light-text-primary)' }}>
          {title}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: verifier ? '0 14px 14px' : 0 }}>
        {record ? (
          <>
            <span style={{ fontWeight: 600, fontSize: 15, lineHeight: '22px',
                           color: verifier ? '#ffffff' : 'var(--nv-light-text-primary)' }}>
              {record.name}
            </span>
            {record.standing && (
              <span style={{ ...meta, color: verifier ? 'var(--nv-light-state-quarantine-body)' : 'var(--nv-light-text-tertiary)' }}>
                {record.standing}
              </span>
            )}
            <span style={{ ...meta, color: verifier ? 'var(--nv-light-state-quarantine-meta)' : 'var(--nv-light-text-tertiary)' }}>
              {record.signedAt} · {record.meaning}
            </span>
          </>
        ) : (
          <span style={{ ...meta, color: 'var(--nv-light-text-tertiary)' }}>{placeholder}</span>
        )}
      </div>
    </section>
  );
}

/**
 * BR-04. A card, not a gap.
 *
 * It also says who may act: the operator reading this screen cannot
 * verify their own stage, and the database refuses it. Offering them a
 * button that always fails would teach them the rule by rejection.
 */
function WaitingCard({ onVerify, viewerIsOperator }: {
  onVerify?: () => void; viewerIsOperator: boolean;
}) {
  return (
    <section style={{ ...card, ...waitingCard }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <span style={{ ...ordinalMark, ...waitingMark }}>2</span>
        <span style={cardTitle}>Waiting to be verified</span>
      </div>

      <p style={{ margin: 0, fontSize: 13, lineHeight: '19px', color: 'var(--nv-light-text-secondary)' }}>
        {viewerIsOperator
          ? 'You signed as the operator, so somebody else must verify this stage. '
            + 'Hand the workstation to them — they sign in with their own account.'
          : 'Sign in with your own account to verify this stage. The readings cannot be '
            + 'changed while it waits.'}
      </p>

      {onVerify && !viewerIsOperator && (
        <button type="button" style={verifyButton} onClick={onVerify}>
          <PenLine size={18} strokeWidth={2} aria-hidden />
          Verify and sign
        </button>
      )}

      {viewerIsOperator && (
        <span style={{ ...meta, display: 'inline-flex', alignItems: 'center', gap: 6,
                       color: 'var(--nv-light-text-tertiary)' }}>
          <Clock size={14} strokeWidth={2} aria-hidden />
          The stage stays frozen until then.
        </span>
      )}
    </section>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const pair: CSSProperties = {
  display: 'flex', gap: TOUCH.gap, alignItems: 'stretch', flexWrap: 'wrap',
  fontFamily: 'var(--nv-font-body)',
};

const card: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 8,
  flex: '1 1 260px', minWidth: 240, boxSizing: 'border-box',
};

//  Green, ROUNDED, no band.
const operatorCard: CSSProperties = {
  padding: 14, borderRadius: 12,
  background: 'var(--nv-light-badge-done-bg)',
  border: '1px solid var(--nv-light-badge-done-border)',
};

//  Navy, SQUARE, with a band. Three differences, not one.
const verifierCard: CSSProperties = {
  padding: 0, borderRadius: 4, overflow: 'hidden',
  background: 'var(--nv-light-state-quarantine-bg)',
  border: '1px solid var(--nv-light-state-quarantine-bg)',
  gap: 10,
};

const waitingCard: CSSProperties = {
  padding: 14, borderRadius: 4,
  background: 'var(--nv-light-surface-sunken)',
  border: '1.5px dashed var(--nv-light-border-strong)',
};

const band: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  padding: '8px 14px',
  background: 'var(--nv-light-state-quarantine-tile)',
  color: '#ffffff',
  fontFamily: 'var(--nv-font-mono)', fontWeight: 500,
  fontSize: 10, lineHeight: '14px', letterSpacing: '0.06em',
  textTransform: 'uppercase',
};

const ordinalMark: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 26, height: 26, flexShrink: 0,
  fontFamily: 'var(--nv-font-mono)', fontWeight: 500, fontSize: 13,
};

//  Round for the operator, square for the verifier — the same
//  distinction the cards make, repeated at the size somebody actually
//  looks at.
const operatorMark: CSSProperties = {
  borderRadius: 13,
  background: 'var(--nv-light-badge-done-text)', color: '#ffffff',
};

const verifierMark: CSSProperties = {
  borderRadius: 3,
  background: '#ffffff', color: 'var(--nv-light-state-quarantine-bg)',
};

const waitingMark: CSSProperties = {
  borderRadius: 3,
  background: 'var(--nv-light-border-strong)', color: 'var(--nv-light-text-secondary)',
};

const cardTitle: CSSProperties = {
  fontFamily: 'var(--nv-font-mono)', fontWeight: 500,
  fontSize: 10.5, lineHeight: '15px', letterSpacing: '0.06em',
  textTransform: 'uppercase', color: 'var(--nv-light-text-tertiary)',
};

const meta: CSSProperties = {
  fontFamily: 'var(--nv-font-mono)', fontSize: 10.5, lineHeight: '16px',
};

const verifyButton: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  //  56px, for gloved hands at a workstation.
  height: TOUCH.target, padding: '0 20px', borderRadius: 8,
  background: 'var(--nv-light-ink-bg)', border: '1px solid var(--nv-light-ink-bg)',
  color: 'var(--nv-light-ink-text)',
  fontFamily: 'var(--nv-font-display)', fontWeight: 600, fontSize: 16, lineHeight: '20px',
  cursor: 'pointer',
};
