/**
 * Incoming supplier certificate of analysis — the missing screen.
 *
 * The database has carried this workflow since 20261003000000, with 73
 * SQL assertions over it, and nothing in the product could reach it.
 * The consequence was not a cosmetic gap: decision 2 — whoever
 * verified a lot's certificate may not make its disposition — reads
 * `material_certificates_of_analysis.verified_by`, and nothing could
 * set that column, so a tested control was inert. This panel is what
 * makes it reachable.
 *
 * ── IT DECIDES NOTHING ──
 *
 * `material_coa_verify` compares each stated value against the
 * material specification, in the database, and returns the verdict and
 * the discrepancy count. This panel sends an id and renders what comes
 * back. The same reasoning QcTestingPage follows for test results: a
 * screen that computed its own pass could disagree with the stored
 * record, and on a certificate check that disagreement IS the finding.
 *
 * ── FILING AND VERIFYING ARE DIFFERENT ACTS ──
 *
 * Filing what the supplier sent is paperwork and stays open to anyone
 * in the company. Verifying is a quality judgement and is reserved to
 * a role PM-03 gives Act on QC testing or QA disposition. The database
 * enforces the second through a trigger on the table, so a direct
 * write is refused exactly as the RPC is; this panel offers the
 * control only to those who have it, and reports the refusal verbatim
 * when the database disagrees with the screen.
 *
 * ── AND IT SAYS WHAT VERIFYING COSTS ──
 *
 * Whoever verifies is then refused that lot's disposition. That is the
 * point of the control, and somebody about to press the button should
 * know before they press it, not after they are refused elsewhere.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  listCertificates, listDiscrepancies, verifyCertificate,
  type CertificateRow, type DiscrepancyRow,
} from '../../lib/materials/coaService';
import {
  mayVerify, verifyOffered, certificateHeadline, discrepancyLines,
  discrepancyTypeLabel, statusLabel, statusTone, verifierSentence,
} from '../../lib/materials/coaRules';
import type { WorkRole } from '../../lib/access/permissionRequests';
import { logger } from '../../lib/logger';

export interface CoaVerificationPanelProps {
  lotId: string;
  lotNumber: string;
  /** The full set — a two-role holder is entitled to the union. */
  roles: WorkRole[];
  /** Raised when a verification lands, so the parent can refresh. */
  onVerified?: () => void;
}

const card: React.CSSProperties = {
  display: 'grid', gap: 10, padding: 14, borderRadius: 10,
  border: '1px solid #e4e7ec', background: '#fff',
};
const note: React.CSSProperties = { margin: 0, fontSize: 13.5, color: '#5b6472', lineHeight: 1.5 };
const primary: React.CSSProperties = {
  padding: '8px 14px', borderRadius: 8, border: 'none', background: '#0f2744',
  color: '#fff', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', justifySelf: 'start',
};
const TONE: Record<'ok' | 'warn' | 'bad' | 'idle', { bg: string; fg: string; border: string }> = {
  ok:   { bg: '#eaf7ee', fg: '#1b5e34', border: '#bfe3cb' },
  warn: { bg: '#fdf3e3', fg: '#8a5a12', border: '#f0d9ae' },
  bad:  { bg: '#fdecec', fg: '#8a1f1f', border: '#f0bfbf' },
  idle: { bg: '#f3f4f6', fg: '#4b5563', border: '#dfe3e8' },
};

function badge(tone: 'ok' | 'warn' | 'bad' | 'idle'): React.CSSProperties {
  const t = TONE[tone];
  return {
    display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 12,
    fontWeight: 600, background: t.bg, color: t.fg, border: `1px solid ${t.border}`,
  };
}

export default function CoaVerificationPanel({
  lotId, lotNumber, roles, onVerified,
}: CoaVerificationPanelProps) {
  const [certificates, setCertificates] = useState<CertificateRow[]>([]);
  const [discrepancies, setDiscrepancies] = useState<Record<string, DiscrepancyRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'warn' | 'bad'; text: string } | null>(null);

  const canVerify = mayVerify(roles);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const rows = await listCertificates(lotId);
      setCertificates(rows);
      //  Discrepancies only for the certificates that have any — there
      //  is no value in a round trip that can only return nothing.
      const withFindings = rows.filter((r) => (r.discrepancy_count ?? 0) > 0);
      const pairs = await Promise.all(
        withFindings.map(async (r) => [r.id, await listDiscrepancies(r.id)] as const),
      );
      setDiscrepancies(Object.fromEntries(pairs));
    } catch (err) {
      //  A load that fails must say so. Leaving the spinner up for
      //  ever is how a page comes to look like "there is nothing here".
      logger.error('[coa] panel load failed', { lotId, err: String(err) });
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [lotId]);

  useEffect(() => { void load(); }, [load]);

  async function verify(id: string) {
    setBusy(id);
    setNotice(null);
    try {
      const outcome = await verifyCertificate(id);
      setNotice(
        outcome.discrepancies > 0
          ? {
              tone: 'warn',
              text:
                `Checked ${outcome.parameters_checked} parameter` +
                `${outcome.parameters_checked === 1 ? '' : 's'}: ` +
                `${outcome.discrepancies} discrepanc${outcome.discrepancies === 1 ? 'y' : 'ies'}` +
                `${outcome.critical > 0 ? `, ${outcome.critical} on a critical parameter` : ''}. ` +
                'A deviation has been raised and the lot cannot be released on this certificate.',
            }
          : {
              tone: 'ok',
              text:
                `Verified against specification — ${outcome.parameters_checked} parameter` +
                `${outcome.parameters_checked === 1 ? '' : 's'} checked. ` +
                'You may no longer make the disposition decision for this lot.',
            },
      );
      await load();
      onVerified?.();
    } catch (err) {
      //  The database's own wording, already translated by
      //  describeCoaError. Not flattened into "something went wrong".
      setNotice({ tone: 'bad', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section style={card} aria-label="Supplier certificate of analysis">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'baseline' }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Supplier certificate</h3>
        <span style={{ fontSize: 12.5, color: '#6b7280' }}>Lot {lotNumber}</span>
      </div>

      {notice && (
        <p
          role="status"
          style={{
            ...note,
            padding: '8px 10px', borderRadius: 8,
            background: TONE[notice.tone].bg,
            color: TONE[notice.tone].fg,
            border: `1px solid ${TONE[notice.tone].border}`,
          }}
        >
          {notice.text}
        </p>
      )}

      {loading && <p style={note}>Loading certificates…</p>}

      {!loading && failed && (
        <p style={note}>
          Could not load the certificates for this lot just now. Nothing has been lost —
          try again in a moment.
        </p>
      )}

      {!loading && !failed && (
        <>
          <p style={note}>{certificateHeadline(certificates)}</p>

          {certificates.length === 0 && (
            <p style={note}>
              A certificate is filed against the lot when the supplier sends it. Filing is
              clerical and anyone can do it; checking it against the material specification
              is quality work.
            </p>
          )}

          {certificates.length > 0 && (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
              {certificates.map((c) => {
                const findings = discrepancyLines(discrepancies[c.id] ?? []);
                return (
                  <li
                    key={c.id}
                    style={{
                      display: 'grid', gap: 8, padding: 10, borderRadius: 8,
                      border: '1px solid #eceff3', background: '#fbfcfd',
                    }}
                  >
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                      <strong style={{ fontSize: 13.5 }}>
                        {c.certificate_number || 'Certificate (no number recorded)'}
                      </strong>
                      <span style={badge(statusTone(c.verification_status))}>
                        {statusLabel(c.verification_status)}
                      </span>
                      {c.verified_at && (
                        <span style={{ fontSize: 12, color: '#6b7280' }}>
                          checked {new Date(c.verified_at).toLocaleDateString('en-GB')}
                        </span>
                      )}
                    </div>

                    <span style={{ fontSize: 12.5, color: '#6b7280' }}>
                      {c.supplier_results.length} result
                      {c.supplier_results.length === 1 ? '' : 's'} stated by the supplier
                    </span>

                    {findings.length > 0 && (
                      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4 }}>
                        {findings.map((d) => (
                          <li key={d.id} style={{ fontSize: 12.5, color: '#8a1f1f' }}>
                            <strong>{d.parameter}</strong> — {discrepancyTypeLabel(d.discrepancy_type)}
                            {d.specification_limit ? ` (specification ${d.specification_limit}` : ''}
                            {d.specification_limit && d.stated_value
                              ? `, stated ${d.stated_value})`
                              : d.specification_limit ? ')' : ''}
                            {d.is_critical && ' · critical'}
                          </li>
                        ))}
                      </ul>
                    )}

                    {verifyOffered(c) && canVerify && (
                      <>
                        <button
                          type="button"
                          style={{ ...primary, opacity: busy === c.id ? 0.5 : 1 }}
                          disabled={busy === c.id}
                          onClick={() => void verify(c.id)}
                        >
                          {busy === c.id ? 'Checking…' : 'Check against specification'}
                        </button>
                        <span style={{ fontSize: 12, color: '#6b7280' }}>
                          Checking this certificate records you as its verifier, and you will
                          then be refused the disposition decision for this lot.
                        </span>
                      </>
                    )}

                    {verifyOffered(c) && !canVerify && (
                      <span style={{ fontSize: 12.5, color: '#6b7280' }}>
                        You can read this certificate but not check it against the
                        specification. {verifierSentence()} The database enforces that, not
                        this screen.
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
