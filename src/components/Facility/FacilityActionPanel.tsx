/**
 *  THE CORRECTIVE ACTION PANEL (W6·29 FL-13 / FL-14, Phase 2 decision 1)
 *
 *  FL-14 is "Task created, linked to the finding". Until
 *  20261209000000 there was nothing to create, so FL-13 showed a
 *  disabled Close control and a sentence explaining why. This panel
 *  is the workflow that replaces the explanation.
 *
 *  It walks the three gates the rule sets, in order, and shows only
 *  the step that is actually next:
 *
 *    1. raise an action, with an owner and a due date;
 *    2. complete it, with closure evidence;
 *    3. link a formal CAPA where the company's own criteria require
 *       one — and then close the finding.
 *
 *  ── THE CRITERIA ARE QUOTED, NOT PARAPHRASED ──
 *
 *  Nothing here decides whether a CAPA is needed.
 *  `facility_escalation_matches()` returns the company's own criteria
 *  rows, and this panel prints their code and description verbatim.
 *  So "why does this need a CAPA?" is answered with the rule the
 *  company wrote, which is the whole point of the criteria being data
 *  rather than thresholds buried in a trigger.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  X, Loader2, AlertTriangle, CheckCircle2, ShieldAlert, Link2, ClipboardCheck,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { logger } from '../../lib/logger';
import {
  escalationFor, requiresCapa, capaReasons, listActions, actionsFor,
  createAction, completeAction, linkCapa, listLinkableCapas, validateActionDraft,
  ACTION_STATUS_LABELS, ACTION_STATUS_TONE,
  type ActionRow, type EscalationMatch, type CapaOption, type ActionDraft,
} from '../../lib/facility/facilityActionService';
import { resolveFinding, type PestFinding } from '../../lib/facility/facilityLogService';

const INPUT =
  'w-full px-3 py-2.5 border rounded-xl text-sm bg-[var(--color-surface)] '
  + 'text-[var(--color-text-primary)] focus:ring-2 focus:ring-[var(--color-accent)] '
  + 'focus:border-transparent outline-none';

const TONE_CLASS: Record<'ok' | 'warn' | 'bad' | 'idle', string> = {
  ok: 'bg-emerald-500/10 text-emerald-700',
  warn: 'bg-amber-500/10 text-amber-700',
  bad: 'bg-red-500/10 text-red-700',
  idle: 'bg-[var(--color-surface-alt)] text-[var(--color-text-secondary)]',
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** The company's own rules, quoted. */
function CriteriaList({ matches }: { matches: EscalationMatch[] }) {
  if (matches.length === 0) {
    return (
      <p className="text-xs text-[var(--color-text-secondary)]">
        No escalation criterion matches this finding, so a corrective action is enough —
        no CAPA is required.
      </p>
    );
  }
  return (
    <ul className="space-y-1.5">
      {matches.map((m) => (
        <li key={m.criterion_id} className="text-xs">
          <span className={`inline-block text-[11px] px-1.5 py-0.5 rounded mr-1.5 ${
            m.requires_capa ? TONE_CLASS.bad : TONE_CLASS.idle
          }`}>
            {m.code}
          </span>
          <span className="text-[var(--color-text-primary)]">{m.description}</span>
          <span className="block text-[var(--color-text-tertiary)] mt-0.5 ml-0.5">
            Matched on {m.detail}
            {m.requires_capa ? ' · requires a CAPA' : ' · no CAPA required'}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function FacilityActionPanel({
  companyId, finding, onClose, onChanged,
}: {
  companyId: string;
  finding: PestFinding;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { user } = useAuth();
  const [matches, setMatches] = useState<EscalationMatch[]>([]);
  const [actions, setActions] = useState<ActionRow[]>([]);
  const [capas, setCapas] = useState<CapaOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  //  Step 1 fields
  const [draft, setDraft] = useState<ActionDraft>({
    source_kind: 'pest_finding', source_id: finding.id, title: '',
  });
  const [touched, setTouched] = useState(false);
  //  Step 2 fields
  const [evidence, setEvidence] = useState('');
  const [evidenceRef, setEvidenceRef] = useState('');
  //  Step 3 field
  const [capaId, setCapaId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [m, all, c] = await Promise.all([
        escalationFor(finding.id),
        listActions(companyId),
        listLinkableCapas(companyId),
      ]);
      setMatches(m);
      setActions(actionsFor(all, finding.id));
      setCapas(c);
    } catch (err) {
      logger.error('[action] panel load failed', { err: String(err) });
      setError(err instanceof Error ? err.message : 'The action could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [companyId, finding.id]);

  useEffect(() => { void load(); }, [load]);

  const errors = useMemo(() => validateActionDraft(draft), [draft]);
  //  The action that counts: the one the finding points at, or the
  //  most recent that is not cancelled.
  const action = useMemo(
    () => actions.find((a) => a.action_id === finding.corrective_task_id)
      ?? actions.find((a) => a.status !== 'cancelled')
      ?? null,
    [actions, finding.corrective_task_id],
  );
  const needsCapa = requiresCapa(matches);
  const reasons = capaReasons(matches);

  const run = async (what: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setNotice(what);
      await load();
      onChanged();
    } catch (err) {
      logger.error('[action] panel write failed', { err: String(err) });
      setError(err instanceof Error ? err.message : 'That change could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  /*
   *  Which step is next. Written as one expression so the panel
   *  cannot show two steps at once, or none.
   */
  const step: 'raise' | 'complete' | 'capa' | 'close' | 'done' =
    finding.resolved_at ? 'done'
      : !action ? 'raise'
        : action.status !== 'completed' ? 'complete'
          : needsCapa && !action.linked_capa_id ? 'capa'
            : 'close';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="bg-[var(--color-surface)] w-full sm:max-w-xl rounded-t-2xl sm:rounded-2xl p-5 max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
              Corrective action
            </h3>
            <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
              {finding.station_code} · {finding.finding}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="shrink-0 p-1 min-h-[32px] min-w-[32px]">
            <X className="w-5 h-5 text-[var(--color-text-secondary)]" />
          </button>
        </div>

        {notice && (
          <div role="status" className="flex items-center gap-2 border rounded-xl p-3 mb-3 bg-emerald-500/10 border-emerald-500/30 text-sm text-emerald-700">
            <CheckCircle2 className="w-4 h-4 shrink-0" /> {notice}
          </div>
        )}
        {error && (
          <div role="alert" className="flex items-start gap-2 border rounded-xl p-3 mb-3 bg-red-500/10 border-red-500/30 text-sm text-red-700">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /><p>{error}</p>
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)] p-4">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="space-y-4">
            {/* The company's own criteria, quoted */}
            <section className="border border-[var(--color-border)] rounded-xl p-3">
              <h4 className="text-xs uppercase tracking-wider text-[var(--color-text-tertiary)] mb-2 flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5" /> Your escalation criteria
              </h4>
              <CriteriaList matches={matches} />
            </section>

            {/* The action itself */}
            {action && (
              <section className="border border-[var(--color-border)] rounded-xl p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--color-text-primary)]">
                      {action.title}
                    </p>
                    <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                      Due {fmtDate(action.due_on)}
                      {action.completed_at && <> · completed {fmtDate(action.completed_at)}</>}
                      {action.capa_number && <> · {action.capa_number}</>}
                    </p>
                    {action.closure_evidence && (
                      <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
                        Evidence: {action.closure_evidence}
                        {action.closure_ref && <> ({action.closure_ref})</>}
                      </p>
                    )}
                  </div>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full shrink-0 ${
                    TONE_CLASS[ACTION_STATUS_TONE[action.status]]
                  }`}>
                    {ACTION_STATUS_LABELS[action.status]}
                    {action.is_overdue && ' · overdue'}
                  </span>
                </div>
              </section>
            )}

            {/* Step 1 — raise */}
            {step === 'raise' && (
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  setTouched(true);
                  if (Object.keys(errors).length === 0) {
                    void run('Action raised.', () =>
                      createAction(companyId, draft, user?.id ?? null));
                  }
                }}
              >
                <h4 className="text-sm font-semibold text-[var(--color-text-primary)]">
                  Raise the corrective action
                </h4>
                <label className="block">
                  <span className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                    What has to be done
                  </span>
                  <input
                    value={draft.title}
                    onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                    placeholder="Seal the gap under the dock door"
                    className={INPUT}
                    style={{ borderColor: 'var(--color-border)' }}
                  />
                  {touched && errors.title && (
                    <span role="alert" className="block text-[11px] text-red-600 mt-1">{errors.title}</span>
                  )}
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block">
                    <span className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                      Owner
                    </span>
                    {/*  W6·29 asks for an owner and a due date, which is
                        exactly what a derived task could never have. */}
                    <input
                      value={draft.owner_id ?? ''}
                      onChange={(e) => setDraft((d) => ({ ...d, owner_id: e.target.value || null }))}
                      placeholder="Profile id of the owner"
                      className={INPUT}
                      style={{ borderColor: 'var(--color-border)' }}
                    />
                    {touched && errors.owner_id && (
                      <span role="alert" className="block text-[11px] text-red-600 mt-1">{errors.owner_id}</span>
                    )}
                  </label>
                  <label className="block">
                    <span className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                      Due by
                    </span>
                    <input
                      type="date"
                      value={draft.due_on ?? ''}
                      onChange={(e) => setDraft((d) => ({ ...d, due_on: e.target.value }))}
                      className={INPUT}
                      style={{ borderColor: 'var(--color-border)' }}
                    />
                    {touched && errors.due_on && (
                      <span role="alert" className="block text-[11px] text-red-600 mt-1">{errors.due_on}</span>
                    )}
                  </label>
                </div>
                <button
                  type="submit"
                  disabled={busy}
                  className="px-4 py-2.5 min-h-[40px] rounded-xl text-sm font-medium text-white disabled:opacity-60"
                  style={{ background: 'var(--color-accent)' }}
                >
                  {busy ? 'Saving…' : 'Raise the action'}
                </button>
              </form>
            )}

            {/* Step 2 — complete with evidence */}
            {step === 'complete' && action && (
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run('Action completed.', () => completeAction(
                    companyId, action.action_id, user?.id ?? '', evidence, evidenceRef,
                  ));
                }}
              >
                <h4 className="text-sm font-semibold text-[var(--color-text-primary)]">
                  Complete the action
                </h4>
                <label className="block">
                  <span className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                    Closure evidence
                  </span>
                  <textarea
                    value={evidence}
                    onChange={(e) => setEvidence(e.target.value)}
                    rows={3}
                    placeholder="What was done, and how it was checked."
                    className={INPUT}
                    style={{ borderColor: 'var(--color-border)' }}
                  />
                  <span className="block text-[11px] text-[var(--color-text-tertiary)] mt-1">
                    Required. An action cannot be completed without it, and the finding
                    cannot be closed without a completed action.
                  </span>
                </label>
                <label className="block">
                  <span className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                    Reference (optional)
                  </span>
                  <input
                    value={evidenceRef}
                    onChange={(e) => setEvidenceRef(e.target.value)}
                    placeholder="MNT-2026-0412"
                    className={INPUT}
                    style={{ borderColor: 'var(--color-border)' }}
                  />
                </label>
                <button
                  type="submit"
                  disabled={busy || !evidence.trim()}
                  className="px-4 py-2.5 min-h-[40px] rounded-xl text-sm font-medium text-white disabled:opacity-60"
                  style={{ background: 'var(--color-accent)' }}
                >
                  {busy ? 'Saving…' : 'Complete the action'}
                </button>
              </form>
            )}

            {/* Step 3 — the CAPA the criteria require */}
            {step === 'capa' && action && (
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (capaId) {
                    void run('CAPA linked.', () =>
                      linkCapa(companyId, action.action_id, capaId));
                  }
                }}
              >
                <h4 className="text-sm font-semibold text-[var(--color-text-primary)] flex items-center gap-1.5">
                  <Link2 className="w-4 h-4" /> Link the formal CAPA
                </h4>
                {/*  Named, not implied: the reader is told which of
                    their own rules requires this. */}
                <p className="text-xs text-[var(--color-text-secondary)]">
                  Required by {reasons.map((r) => r.code).join(', ')} —{' '}
                  {reasons.map((r) => r.description).join(' ')}
                </p>
                {capas.length === 0 ? (
                  <p className="text-xs text-amber-700">
                    No CAPA records exist for this company yet. One has to be raised in
                    Deviation / CAPA before this finding can be closed.
                  </p>
                ) : (
                  <>
                    <select
                      value={capaId}
                      onChange={(e) => setCapaId(e.target.value)}
                      className={INPUT}
                      style={{ borderColor: 'var(--color-border)' }}
                    >
                      <option value="">Choose a CAPA…</option>
                      {capas.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.capa_number} — {c.title}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      disabled={busy || !capaId}
                      className="px-4 py-2.5 min-h-[40px] rounded-xl text-sm font-medium text-white disabled:opacity-60"
                      style={{ background: 'var(--color-accent)' }}
                    >
                      {busy ? 'Saving…' : 'Link the CAPA'}
                    </button>
                  </>
                )}
              </form>
            )}

            {/* Step 4 — close the finding */}
            {step === 'close' && action && (
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-[var(--color-text-primary)] flex items-center gap-1.5">
                  <ClipboardCheck className="w-4 h-4" /> Close the finding
                </h4>
                <p className="text-xs text-[var(--color-text-secondary)]">
                  The action is completed with evidence
                  {action.capa_number ? `, and ${action.capa_number} is linked` : ''}, so
                  the finding can be closed.
                </p>
                <button
                  onClick={() => void run('Finding closed.', async () => {
                    //  The finding points at the action that closed it,
                    //  which is what the database checks.
                    await resolveFinding(
                      companyId, finding.id, user?.id ?? '',
                      action.closure_evidence ?? 'Corrective action completed.',
                      action.action_id,
                    );
                  })}
                  disabled={busy}
                  className="px-4 py-2.5 min-h-[40px] rounded-xl text-sm font-medium text-white disabled:opacity-60"
                  style={{ background: 'var(--color-accent)' }}
                >
                  {busy ? 'Saving…' : 'Close the finding'}
                </button>
              </div>
            )}

            {step === 'done' && (
              <p className="text-sm text-[var(--color-text-secondary)]">
                This finding was closed on {fmtDate(finding.resolved_at)}
                {finding.resolution_note && <> — {finding.resolution_note}</>}.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
