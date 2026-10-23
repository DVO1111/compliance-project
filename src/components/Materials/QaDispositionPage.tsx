/**
 * QA disposition — the decision a material lot waits on.
 *
 * DB-01 and DB-02 both name this stage (04 · QA DISPOSITION, "Quality
 * decision") and the rail lists it; no page answered to it, so the
 * route opened a "not built" panel.
 *
 * ── WHY THIS SCREEN IS THE ONE WORTH BUILDING FIRST ──
 *
 * It is the gate that makes the sentence true: a material does not
 * become available for production because somebody changed a status.
 * Three separate things have to hold, and all three are enforced
 * somewhere other than this component:
 *
 *   1. THE CONDITIONS. releaseReadiness() reads
 *      material_lot_release_conditions, the same function the release
 *      gate calls. This page does not re-derive what blocks a release;
 *      if it did, a screen could say "ready" about a lot the database
 *      will refuse, which is the worst possible disagreement.
 *
 *   2. THE SIGNATURE. signAndRelease() signs the record before it
 *      transitions, and the signature is consumed by the transition.
 *      PM-03 marks this step "E-signature"; it is not a confirmation
 *      dialog, it is a credential.
 *
 *   3. THE ROLE. app_assert_step() refuses material_disposition to
 *      anyone who is not a QA Officer or QA Manager, in a trigger on
 *      entity_current_state. This page hides the controls from other
 *      roles as a courtesy; the refusal does not depend on that.
 *
 * So the controls here are a way to ask, not a way to decide. If the
 * ask is refused the refusal is shown verbatim — a screen that
 * swallowed MATERIAL_RELEASE_BLOCKED and closed the dialog would leave
 * somebody believing a lot had been released.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ──
 *
 * It does not offer a release on a lot whose conditions are unmet. The
 * database would refuse it and the refusal would be correct, but
 * offering a button that always fails teaches people the system is
 * broken rather than that the lot is not ready.
 */

import { useCallback, useEffect, useState } from 'react';
import ReleaseReadinessCard from './ReleaseReadinessCard';
import QuarantineBanner from './QuarantineBanner';
import SectionNotReady from '../Common/SectionNotReady';
import PasswordPromptModal from '../Common/PasswordPromptModal';
import {
  listLots, releaseReadiness, signAndRelease, signAndReject,
  type MaterialLotRow, type Disposition,
} from '../../lib/materials/materialLotService';
import {
  DISPOSITIONS, mayDecide, releaseOffered, rejectComplete, decisionConfirmation,
} from '../../lib/materials/dispositionRules';
import { readinessHeadline, type Readiness } from '../../lib/materials/releaseReadiness';
import type { WorkRole } from '../../lib/access/permissionRequests';
import { supabase } from '../../lib/supabase';
import { logger } from '../../lib/logger';

export interface QaDispositionPageProps {
  companyId?: string | null;
  role: WorkRole | null;
}

type Pending =
  | { kind: 'release' }
  | { kind: 'reject'; disposition: Disposition; reason: string };

export default function QaDispositionPage({ companyId, role }: QaDispositionPageProps) {
  const [lots, setLots] = useState<MaterialLotRow[]>([]);
  const [open, setOpen] = useState<MaterialLotRow | null>(null);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [ready, setReady] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  //  Courtesy only. The database refuses regardless — see the header.
  const canDecide = mayDecide(role);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const { error } = await supabase.from('material_lots').select('id').limit(1);
      setReady(!error);
      if (!error) {
        //  Awaiting a decision is quarantine: received, sampled, not yet
        //  dispositioned. Approved and rejected lots have been decided
        //  and belong on the lot list, not in this queue.
        const all = await listLots(companyId, { limit: 100 });
        setLots(all.filter((l) => l.status === 'quarantine'));
      }
    } catch (err) {
      //  HS-07. A load that fails for any reason other than the table
      //  being absent — a refused policy, a dropped connection — used
      //  to leave the page on its spinner with nothing said. Plain
      //  words, nothing lost, and the list stays as it was.
      logger.error('[qa-disposition] load failed', err);
      setNotice({ tone: 'bad', text:
        'Could not load this page just now. Nothing has been lost — try again in a moment.' });
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!open) { setReadiness(null); return; }
    void (async () => { setReadiness(await releaseReadiness(open.id)); })();
  }, [open]);

  const confirm = useCallback(async (password: string) => {
    if (!open || !companyId || !pending) return;
    setBusy(true);
    const result = pending.kind === 'release'
      ? await signAndRelease({ lotId: open.id, companyId, password })
      : await signAndReject({
          lotId: open.id, companyId, password,
          disposition: pending.disposition, reason: pending.reason,
        });
    setBusy(false);

    if (!result.ok) {
      //  Verbatim. MATERIAL_RELEASE_BLOCKED names the condition that
      //  failed and STEP_FORBIDDEN names the role rule; rewording
      //  either into "something went wrong" throws away the only
      //  useful part.
      setNotice({ tone: 'bad', text: result.message });
      return;
    }

    setPending(null);
    setNotice({
      tone: 'ok',
      text: decisionConfirmation(pending.kind, open.lot_number),
    });
    setOpen(null);
    await load();
  }, [open, companyId, pending, load]);

  if (!companyId) {
    return <p style={empty}>QA disposition belongs to a workspace. Finish setting one up
      and it appears here.</p>;
  }

  if (ready === false) {
    return (
      <SectionNotReady
        section="QA disposition"
        whatItWillShow={'Lots awaiting a quality decision, what is blocking each one, and '
          + 'the release or rejection itself will appear here.'}
      />
    );
  }

  if (open) {
    //  releaseOffered fails CLOSED on a null readiness — "we do not
    //  know yet" must not read as "ready". See dispositionRules.
    const blocked = !releaseOffered(readiness);
    return (
      <div style={col}>
        <button type="button" style={back} onClick={() => { setOpen(null); setNotice(null); }}>
          ← All lots awaiting a decision
        </button>

        {notice && <p style={noticeStyle(notice.tone)} role="status">{notice.text}</p>}

        <header style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <h2 style={{ margin: 0, fontSize: 19 }}>Lot {open.lot_number}</h2>
          <span style={sub}>
            {open.quantity_available} {open.unit_of_measure}
            {open.supplier_batch_number ? ` · supplier batch ${open.supplier_batch_number}` : ''}
          </span>
        </header>

        <QuarantineBanner
          since={new Date(open.received_date).toLocaleDateString('en-GB')}
          nextStep={readiness ? readinessHeadline(readiness) : undefined}
        />

        {readiness
          ? <ReleaseReadinessCard readiness={readiness} />
          : <p style={empty}>Reading the release conditions…</p>}

        {!canDecide ? (
          <p style={noteStyle}>
            Releasing or rejecting a lot is a QA Officer or QA Manager decision. You can
            see what is blocking this one, which is the part that affects your work.
          </p>
        ) : (
          <section style={card}>
            <h3 style={{ margin: 0, fontSize: 16 }}>Decision</h3>
            {blocked ? (
              //  No release button on a blocked lot. The database would
              //  refuse it and be right; a button that always fails
              //  teaches people the system is broken.
              <p style={noteStyle}>
                This lot cannot be released yet — the conditions above have to be met
                first. It can still be rejected.
              </p>
            ) : (
              <button type="button" style={primary}
                onClick={() => { setNotice(null); setPending({ kind: 'release' }); }}>
                Release lot {open.lot_number}
              </button>
            )}

            <RejectControls
              onReject={(disposition, reason) => {
                setNotice(null);
                setPending({ kind: 'reject', disposition, reason });
              }}
            />
          </section>
        )}

        <PasswordPromptModal
          isOpen={pending !== null}
          isLoading={busy}
          title={pending?.kind === 'reject' ? 'Sign the rejection' : 'Sign the release'}
          description={'This decision is recorded against your name in the audit trail. '
            + 'Enter your password to sign it.'}
          confirmLabel={pending?.kind === 'reject' ? 'Sign and reject' : 'Sign and release'}
          onClose={() => setPending(null)}
          onConfirm={(pw) => void confirm(pw)}
        />
      </div>
    );
  }

  return (
    <div style={col}>
      <header style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h2 style={{ margin: 0, fontSize: 19 }}>QA disposition</h2>
        <span style={sub}>
          Lots in quarantine, waiting for a quality decision. Releasing one makes it
          available to production.
        </span>
      </header>

      {notice && <p style={noticeStyle(notice.tone)} role="status">{notice.text}</p>}
      {loading && <p style={empty}>Loading…</p>}
      {!loading && lots.length === 0 && (
        <p style={empty}>
          No lot is waiting for a decision. Lots appear here once they have been received
          and sampled.
        </p>
      )}

      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
        {lots.map((l) => (
          <li key={l.id}>
            <button type="button" style={row} onClick={() => setOpen(l)}>
              <span style={{ fontWeight: 600, minWidth: 0 }}>{l.lot_number}</span>
              <span style={{ fontSize: 13, color: '#5b6472', flex: 1, minWidth: 0 }}>
                {l.quantity_available} {l.unit_of_measure}
              </span>
              <span style={{ fontSize: 13, color: '#5b6472' }}>
                received {new Date(l.received_date).toLocaleDateString('en-GB')}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Rejecting needs a disposition and a reason, and the design's three
 * dispositions are a closed list. Both are required before the button
 * does anything: a rejection with no reason is a record that cannot be
 * explained to an inspector later.
 */
function RejectControls({ onReject }: {
  onReject: (d: Disposition, reason: string) => void;
}) {
  const [disposition, setDisposition] = useState<Disposition | ''>('');
  const [reason, setReason] = useState('');
  const complete = rejectComplete(disposition, reason);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9, minWidth: 0 }}>
      <label style={labelStyle}>
        What happens to it
        <select style={input} value={disposition}
          onChange={(e) => setDisposition(e.target.value as Disposition)}>
          <option value="">Choose a disposition…</option>
          {DISPOSITIONS.map((d) => (
            <option key={d.key} value={d.key}>{d.label}</option>
          ))}
        </select>
      </label>

      <label style={labelStyle}>
        Why it is being rejected
        <textarea style={{ ...input, minHeight: 68, resize: 'vertical' }} value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="What failed, and against which specification." />
      </label>

      <button type="button" style={{ ...danger, opacity: complete ? 1 : 0.5 }}
        disabled={!complete}
        onClick={() => complete && onReject(disposition as Disposition, reason.trim())}>
        Reject lot
      </button>
      {!complete && (
        <span style={{ fontSize: 12.5, color: '#5b6472' }}>
          A disposition and a reason are both required.
        </span>
      )}
    </div>
  );
}

const col: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0,
};
const sub: React.CSSProperties = { fontSize: 14, color: '#5b6472', lineHeight: '21px' };
const empty: React.CSSProperties = {
  margin: 0, padding: '20px 0', fontSize: 15, lineHeight: '23px', color: '#5b6472',
};
const back: React.CSSProperties = {
  border: 'none', background: 'transparent', padding: 0, cursor: 'pointer',
  fontSize: 14, color: '#2b3038', fontWeight: 600, alignSelf: 'flex-start',
};
const row: React.CSSProperties = {
  width: '100%', display: 'flex', gap: 14, alignItems: 'center',
  border: '1px solid #e3e6eb', borderRadius: 10, background: '#fff',
  padding: '12px 14px', cursor: 'pointer', fontSize: 14, textAlign: 'left', minWidth: 0,
};
const card: React.CSSProperties = {
  background: '#fff', border: '1px solid #e3e6eb', borderRadius: 12,
  padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0,
};
const labelStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13.5, fontWeight: 600,
  minWidth: 0,
};
const input: React.CSSProperties = {
  border: '1px solid #d9dde4', borderRadius: 8, padding: '9px 11px',
  fontSize: 14, fontWeight: 400, font: 'inherit', minWidth: 0, width: '100%',
};
const primary: React.CSSProperties = {
  border: 'none', borderRadius: 9, background: '#12A05A', color: '#fff',
  padding: '11px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
  alignSelf: 'flex-start',
};
const danger: React.CSSProperties = {
  border: '1px solid #c62f1e', borderRadius: 9, background: '#fff', color: '#b42c1d',
  padding: '10px 15px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
  alignSelf: 'flex-start',
};
const noteStyle: React.CSSProperties = {
  margin: 0, fontSize: 13.5, lineHeight: '20px', color: '#5b6472',
};
const noticeStyle = (tone: 'ok' | 'bad'): React.CSSProperties => ({
  margin: 0, borderRadius: 10, padding: '11px 14px', fontSize: 14, lineHeight: '21px',
  background: tone === 'ok' ? '#e8f6ee' : '#f3d7d2',
  border: `1px solid ${tone === 'ok' ? '#9ed9b8' : '#c62f1e'}`,
  color: tone === 'ok' ? '#0f6b3f' : '#b42c1d',
});
