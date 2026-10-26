/**
 *  FACILITY LOGS — PEST CONTROL (W6·29, FL-12 / FL-13 / FL-14)
 *
 *  FL-13 is the Pest control tab of the facility logs, and it is not
 *  shaped like the register: a contracted PROVIDER header, then each
 *  VISIT with its technician and report, then that visit's findings by
 *  station — STATION / WHERE / FINDING / METHOD USED / ACTION.
 *
 *  THE RULE, which this screen exists to respect rather than to
 *  work around. W6·29's note on FL-13:
 *
 *      "A finding marked as needing action can't be closed by a note;
 *       it becomes a task with an owner and a due date."
 *
 *  Half of that is enforced in the database. The other half cannot be
 *  built: there is no task register in this product, which
 *  `src/lib/tasks/taskSources.ts` states in its first line, adding
 *  that a derived task "has no due date and no urgency ordering,
 *  because nothing records them".
 *
 *  So this screen does the honest thing with that. A finding marked as
 *  needing action shows its close control DISABLED, with the reason
 *  written out — not a cheerful button that the database will refuse.
 *  An ordinary finding closes with a note as normal, because three
 *  flies on a glue board is not a corrective action.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Loader2, AlertTriangle, CheckCircle2, Plus, X, Bug, FileText, ChevronDown,
  ChevronRight, ShieldAlert,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { logger } from '../../lib/logger';
import FacilityActionPanel from './FacilityActionPanel';
import {
  listPestVisits, listPestFindings, createPestFinding, resolveFinding,
  setFindingNeedsAction, validatePestFinding, canCloseWithNote, whyNotCloseable,
  openActionCount,
  type PestVisitRow, type PestFinding, type PestFindingDraft,
} from '../../lib/facility/facilityLogService';

const INPUT =
  'w-full px-3 py-2.5 border rounded-xl text-sm bg-[var(--color-surface)] '
  + 'text-[var(--color-text-primary)] focus:ring-2 focus:ring-[var(--color-accent)] '
  + 'focus:border-transparent outline-none';

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** FL-13's ACTION cell. */
function ActionCell({ f }: { f: PestFinding }) {
  if (f.resolved_at) {
    return (
      <span className="text-xs text-[var(--color-text-secondary)]">
        Closed {fmtDate(f.resolved_at)}
        {f.resolution_note && <> · {f.resolution_note}</>}
      </span>
    );
  }
  if (f.needs_action) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-700">
        <ShieldAlert className="w-3.5 h-3.5 shrink-0" /> Needs corrective action
      </span>
    );
  }
  //  "Normal level · no action", "Watch at next visit", or nothing.
  return (
    <span className="text-xs text-[var(--color-text-secondary)]">
      {f.disposition_note || '—'}
    </span>
  );
}

function FindingsTable({
  findings, busy, onClose, onMark, onAction,
}: {
  findings: PestFinding[];
  busy: boolean;
  onClose: (f: PestFinding) => void;
  onMark: (f: PestFinding, needs: boolean) => void;
  onAction: (f: PestFinding) => void;
}) {
  if (findings.length === 0) {
    return (
      <p className="text-sm text-[var(--color-text-secondary)] p-4">
        No findings recorded against this visit yet.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-[var(--color-surface-alt)]">
          <tr className="text-left text-[11px] uppercase tracking-wider text-[var(--color-text-tertiary)]">
            <th scope="col" className="px-3 py-2 font-semibold">Station</th>
            <th scope="col" className="px-3 py-2 font-semibold">Where</th>
            <th scope="col" className="px-3 py-2 font-semibold">Finding</th>
            <th scope="col" className="px-3 py-2 font-semibold">Method used</th>
            <th scope="col" className="px-3 py-2 font-semibold">Action</th>
            <th scope="col" className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {findings.map((f) => {
            const closeable = canCloseWithNote(f);
            const why = whyNotCloseable(f);
            return (
              <tr key={f.id} className="border-t border-[var(--color-border)] align-top">
                <th scope="row" className="px-3 py-2.5 font-medium text-left text-[var(--color-text-primary)] whitespace-nowrap">
                  {f.station_code}
                </th>
                <td className="px-3 py-2.5 text-[var(--color-text-secondary)]">
                  {f.location_ref || '—'}
                </td>
                <td className="px-3 py-2.5 text-[var(--color-text-primary)]">{f.finding}</td>
                <td className="px-3 py-2.5 text-[var(--color-text-secondary)]">
                  {f.method_used || '—'}
                </td>
                <td className="px-3 py-2.5"><ActionCell f={f} /></td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  {!f.resolved_at && (
                    <div className="flex flex-col items-end gap-1">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => onMark(f, !f.needs_action)}
                          disabled={busy}
                          className="text-xs underline text-[var(--color-text-secondary)] min-h-[28px] px-1"
                        >
                          {f.needs_action ? 'Not an action' : 'Needs action'}
                        </button>
                        {/*  A finding needing action no longer gets a
                            disabled Close with an apology. It gets the
                            workflow: raise the action, complete it with
                            evidence, link the CAPA the company's own
                            criteria require, then close. */}
                        {f.needs_action ? (
                          <button
                            onClick={() => onAction(f)}
                            disabled={busy}
                            className="text-xs px-2 py-1 min-h-[28px] rounded-lg text-white"
                            style={{ background: 'var(--color-accent)' }}
                          >
                            Corrective action
                          </button>
                        ) : (
                          <button
                            onClick={() => onClose(f)}
                            disabled={busy || !closeable}
                            title={why ?? undefined}
                            className="text-xs px-2 py-1 min-h-[28px] rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            Close
                          </button>
                        )}
                      </div>
                      {why && f.needs_action && !canCloseWithNote(f) && (
                        <span className="text-[11px] text-[var(--color-text-tertiary)] max-w-xs text-right">
                          Needs a corrective action with an owner, a due date and closure
                          evidence before it can be closed.
                        </span>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

    </div>
  );
}

function FindingForm({
  visitId, busy, onCancel, onSave,
}: {
  visitId: string;
  busy: boolean;
  onCancel: () => void;
  onSave: (d: PestFindingDraft) => void;
}) {
  const [draft, setDraft] = useState<PestFindingDraft>({
    visit_id: visitId, station_code: '', finding: '',
  });
  const [touched, setTouched] = useState(false);
  const errors = useMemo(() => validatePestFinding(draft), [draft]);
  const set = <K extends keyof PestFindingDraft>(k: K, v: PestFindingDraft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  return (
    <form
      className="border border-[var(--color-border)] rounded-xl p-4 space-y-3 bg-[var(--color-surface-alt)]"
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (Object.keys(errors).length === 0) onSave(draft);
      }}
    >
      <h4 className="text-sm font-semibold text-[var(--color-text-primary)]">
        Record a finding
      </h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
            Station
          </span>
          <input
            value={draft.station_code}
            onChange={(e) => set('station_code', e.target.value)}
            placeholder="BS-07"
            className={INPUT}
            style={{ borderColor: 'var(--color-border)' }}
          />
          {touched && errors.station_code && (
            <span role="alert" className="block text-[11px] text-red-600 mt-1">
              {errors.station_code}
            </span>
          )}
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
            Where
          </span>
          <input
            value={draft.location_ref ?? ''}
            onChange={(e) => set('location_ref', e.target.value)}
            placeholder="Warehouse W1 · dock door"
            className={INPUT}
            style={{ borderColor: 'var(--color-border)' }}
          />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
            Finding
          </span>
          <input
            value={draft.finding}
            onChange={(e) => set('finding', e.target.value)}
            placeholder="Rodent droppings; 60% of bait taken"
            className={INPUT}
            style={{ borderColor: 'var(--color-border)' }}
          />
          {touched && errors.finding && (
            <span role="alert" className="block text-[11px] text-red-600 mt-1">
              {errors.finding}
            </span>
          )}
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
            Method used
          </span>
          <input
            value={draft.method_used ?? ''}
            onChange={(e) => set('method_used', e.target.value)}
            placeholder="Bait replaced"
            className={INPUT}
            style={{ borderColor: 'var(--color-border)' }}
          />
        </label>
      </div>

      <label className="flex items-start gap-2 text-sm text-[var(--color-text-primary)]">
        <input
          type="checkbox"
          checked={draft.needs_action ?? false}
          onChange={(e) => set('needs_action', e.target.checked)}
          className="mt-0.5"
        />
        <span>
          This finding needs corrective action
          <span className="block text-[11px] text-[var(--color-text-tertiary)]">
            Marked by you, not decided here: once marked, it cannot be closed by a note.
          </span>
        </span>
      </label>

      {!draft.needs_action && (
        <label className="block">
          <span className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
            Disposition
          </span>
          <input
            value={draft.disposition_note ?? ''}
            onChange={(e) => set('disposition_note', e.target.value)}
            placeholder="Normal level · no action"
            className={INPUT}
            style={{ borderColor: 'var(--color-border)' }}
          />
        </label>
      )}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={busy}
          className="px-4 py-2.5 min-h-[40px] rounded-xl text-sm font-medium text-white disabled:opacity-60"
          style={{ background: 'var(--color-accent)' }}
        >
          {busy ? 'Saving…' : 'Record the finding'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2.5 min-h-[40px] rounded-xl text-sm text-[var(--color-text-secondary)] border border-[var(--color-border)]"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function FacilityPestView({ companyId }: { companyId: string }) {
  const { user } = useAuth();
  const [visits, setVisits] = useState<PestVisitRow[]>([]);
  const [findings, setFindings] = useState<Record<string, PestFinding[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [actionFor, setActionFor] = useState<PestFinding | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listPestVisits(companyId);
      setVisits(rows);
      //  Open the newest visit, which is what FL-13 shows expanded.
      if (rows.length > 0) setExpanded(new Set([rows[0].visit_id]));
    } catch (err) {
      logger.error('[facility] pest register load failed', { err: String(err) });
      setError(err instanceof Error ? err.message : 'Pest control could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { void load(); }, [load]);

  const loadFindings = useCallback(async (visitId: string) => {
    try {
      const rows = await listPestFindings(companyId, visitId);
      setFindings((prev) => ({ ...prev, [visitId]: rows }));
    } catch (err) {
      logger.error('[facility] pest findings load failed', { err: String(err) });
      setError(err instanceof Error ? err.message : 'The findings could not be loaded.');
    }
  }, [companyId]);

  useEffect(() => {
    for (const id of expanded) if (!findings[id]) void loadFindings(id);
  }, [expanded, findings, loadFindings]);

  const run = async (what: string, fn: () => Promise<unknown>, visitId: string) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setNotice(what);
      await loadFindings(visitId);
      await load();
      setAddingFor(null);
    } catch (err) {
      logger.error('[facility] pest write failed', { err: String(err) });
      setError(err instanceof Error ? err.message : 'That change could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: string) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const provider = visits[0];
  const openActions = openActionCount(visits);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)] p-6">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading pest control…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-text-secondary)]">
        Contracted service visits, findings by station, and the corrective actions they
        lead to.
      </p>

      {notice && (
        <div role="status" className="flex items-center justify-between gap-2 border rounded-xl p-3 bg-emerald-500/10 border-emerald-500/30 text-sm text-emerald-700">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" /> {notice}
          </span>
          <button onClick={() => setNotice(null)} aria-label="Dismiss">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && (
        <div role="alert" className="flex items-start gap-2 border rounded-xl p-3 bg-red-500/10 border-red-500/30 text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <p>{error}</p>
        </div>
      )}

      {openActions > 0 && (
        <div role="status" className="flex items-start gap-3 border rounded-xl p-4 bg-red-500/10 border-red-500/30">
          <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-red-700">
              {openActions} finding{openActions === 1 ? '' : 's'} marked as needing
              corrective action and still open
            </p>
            <p className="text-[var(--color-text-secondary)] mt-0.5">
              A finding marked as needing action cannot be closed by a note.
            </p>
          </div>
        </div>
      )}

      {visits.length === 0 ? (
        <div className="border border-[var(--color-border)] rounded-xl p-6">
          <p className="text-sm text-[var(--color-text-secondary)]">
            No pest control visits are recorded. A contracted provider and its visits are
            set up before findings can be logged against them.
          </p>
        </div>
      ) : (
        <>
          {/* FL-13's provider header */}
          {provider && (
            <div className="border border-[var(--color-border)] rounded-xl p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-[var(--color-text-tertiary)]">
                    Provider
                  </p>
                  <p className="text-sm font-medium text-[var(--color-text-primary)] mt-0.5">
                    {provider.provider_name}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-[var(--color-text-tertiary)]">
                    Contract
                  </p>
                  <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">
                    {[
                      provider.visit_frequency,
                      provider.contract_until && `to ${fmtDate(provider.contract_until)}`,
                    ].filter(Boolean).join(' · ') || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-[var(--color-text-tertiary)]">
                    Methods
                  </p>
                  <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">
                    {provider.methods.length ? provider.methods.join(', ') : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-[var(--color-text-tertiary)]">
                    Next visit
                  </p>
                  <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">
                    {fmtDate(provider.next_visit_on)}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {visits.map((v) => {
              const open = expanded.has(v.visit_id);
              const rows = findings[v.visit_id] ?? [];
              return (
                <div key={v.visit_id} className="border border-[var(--color-border)] rounded-xl overflow-hidden">
                  <button
                    onClick={() => toggle(v.visit_id)}
                    aria-expanded={open}
                    className="w-full flex items-start justify-between gap-3 p-4 text-left"
                  >
                    <span className="flex items-start gap-2 min-w-0">
                      {open
                        ? <ChevronDown className="w-4 h-4 mt-0.5 shrink-0 text-[var(--color-text-tertiary)]" />
                        : <ChevronRight className="w-4 h-4 mt-0.5 shrink-0 text-[var(--color-text-tertiary)]" />}
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-[var(--color-text-primary)] flex items-center gap-2">
                          <Bug className="w-4 h-4 text-[var(--color-accent)] shrink-0" />
                          {v.reference}
                          {v.open_action_count > 0 && (
                            <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-700">
                              {v.open_action_count} open
                            </span>
                          )}
                        </span>
                        <span className="block text-xs text-[var(--color-text-secondary)] mt-0.5">
                          Visit on {fmtDate(v.visited_on)}
                          {v.technician_name && <> · technician {v.technician_name}</>}
                          {' · '}{v.finding_count} finding{v.finding_count === 1 ? '' : 's'}
                        </span>
                        {v.report_file_ref && (
                          <span className="block text-xs text-[var(--color-text-tertiary)] mt-0.5 flex items-center gap-1">
                            <FileText className="w-3.5 h-3.5 shrink-0" />
                            {v.report_file_ref}
                            {v.checked_at && <> · checked {fmtDate(v.checked_at)}</>}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>

                  {open && (
                    <div className="border-t border-[var(--color-border)]">
                      <FindingsTable
                        findings={rows}
                        busy={busy}
                        onAction={(f) => setActionFor(f)}
                        onMark={(f, needs) => void run(
                          needs ? 'Marked as needing action.' : 'No longer marked as needing action.',
                          () => setFindingNeedsAction(companyId, f.id, needs),
                          v.visit_id,
                        )}
                        onClose={(f) => void run(
                          'Finding closed.',
                          () => resolveFinding(
                            companyId, f.id, user?.id ?? '',
                            f.disposition_note || 'Closed with no further action.',
                          ),
                          v.visit_id,
                        )}
                      />
                      <div className="p-4 border-t border-[var(--color-border)]">
                        {addingFor === v.visit_id ? (
                          <FindingForm
                            visitId={v.visit_id}
                            busy={busy}
                            onCancel={() => setAddingFor(null)}
                            onSave={(d) => void run(
                              `${d.station_code.trim()} recorded.`,
                              () => createPestFinding(companyId, d, user?.id ?? null),
                              v.visit_id,
                            )}
                          />
                        ) : (
                          <button
                            onClick={() => setAddingFor(v.visit_id)}
                            className="flex items-center gap-1.5 text-sm text-[var(--color-accent)] min-h-[32px]"
                          >
                            <Plus className="w-4 h-4" /> Record a finding
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {actionFor && (
        <FacilityActionPanel
          companyId={companyId}
          finding={actionFor}
          onClose={() => setActionFor(null)}
          onChanged={() => { void load(); void loadFindings(actionFor.visit_id); }}
        />
      )}
    </div>
  );
}
