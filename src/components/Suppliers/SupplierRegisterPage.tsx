/**
 *  THE APPROVED-SUPPLIER REGISTER (HS-01 row 9)
 *
 *  This replaces a `ComingSoonPage`. The stub was there while
 *  `public.suppliers` held a real, RLS-protected table with
 *  qualification standings and expiry dates, and while PM-03 granted
 *  `act` on section `suppliers` to Procurement and the QA Manager —
 *  two roles whose tabulated permission had no page to be used on.
 *
 *  WHAT THIS IS NOT. HS-01 row 9 excludes supplier QUALIFICATION from
 *  the MVP and keeps the approved-supplier LIST. So there is no
 *  questionnaire here, no audit scheduling, no CMO assessment and no
 *  scoring. This answers one question: who is approved, until when,
 *  and on what standing.
 *
 *  A lapsed approval is shown as a fact of its own rather than by
 *  rewriting the standing. A supplier whose `qualified_until` has
 *  passed still reads "Qualified" in the column, because a date
 *  passing is not somebody deciding to disqualify them — and that is
 *  exactly the silent failure worth surfacing, so lapsed rows sort
 *  first.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Factory, Loader2, AlertTriangle, CheckCircle2, Search, X, Pencil,
} from 'lucide-react';
import { logger } from '../../lib/logger';
import { canAct } from '../../lib/access/roleAccess';
import type { WorkRole } from '../../lib/access/permissionRequests';
import {
  listSuppliers, updateQualification, summarise, triage, search,
  hasLapsed, daysUntilLapse, isUsable,
  QUALIFICATION_STATUSES, STATUS_LABELS, STATUS_TONE,
  type Supplier, type QualificationStatus,
} from '../../lib/suppliers/supplierRegisterService';

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

function Tile({ n, label, tone }: { n: number; label: string; tone: 'ok' | 'warn' | 'bad' | 'idle' }) {
  return (
    <div className="border border-[var(--color-border)] rounded-xl p-3">
      <p className={`text-2xl font-semibold tabular-nums ${
        tone === 'bad' ? 'text-red-700' : tone === 'warn' ? 'text-amber-700' : 'text-[var(--color-text-primary)]'
      }`}>
        {n}
      </p>
      <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{label}</p>
    </div>
  );
}

/** The one editable thing: a standing and the date it runs out. */
function StandingForm({
  supplier, busy, onCancel, onSave,
}: {
  supplier: Supplier;
  busy: boolean;
  onCancel: () => void;
  onSave: (status: QualificationStatus, until: string | null) => void;
}) {
  const [status, setStatus] = useState<QualificationStatus>(supplier.qualification_status);
  const [until, setUntil] = useState(supplier.qualified_until?.slice(0, 10) ?? '');

  return (
    <form
      className="flex flex-col sm:flex-row sm:items-end gap-2"
      onSubmit={(e) => { e.preventDefault(); onSave(status, until || null); }}
    >
      <label className="block">
        <span className="block text-[11px] font-medium text-[var(--color-text-secondary)] mb-1">
          Standing
        </span>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as QualificationStatus)}
          className="px-3 py-2 min-h-[36px] border rounded-xl text-sm bg-[var(--color-surface)] text-[var(--color-text-primary)]"
          style={{ borderColor: 'var(--color-border)' }}
        >
          {QUALIFICATION_STATUSES.map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="block text-[11px] font-medium text-[var(--color-text-secondary)] mb-1">
          Approved until
        </span>
        <input
          type="date"
          value={until}
          onChange={(e) => setUntil(e.target.value)}
          className="px-3 py-2 min-h-[36px] border rounded-xl text-sm bg-[var(--color-surface)] text-[var(--color-text-primary)]"
          style={{ borderColor: 'var(--color-border)' }}
        />
      </label>
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={busy}
          className="px-3 py-2 min-h-[36px] rounded-xl text-sm font-medium text-white disabled:opacity-60"
          style={{ background: 'var(--color-accent)' }}
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-2 min-h-[36px] rounded-xl text-sm text-[var(--color-text-secondary)] border border-[var(--color-border)]"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function SupplierRegisterPage({
  companyId, role,
}: {
  companyId?: string;
  role?: WorkRole | null;
}) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  //  PM-03's own grid decides this. Procurement and the QA Manager
  //  hold `act` on `suppliers`; four more roles hold `view`. No new
  //  permission key is introduced for this page.
  const mayAct = role ? canAct(role, 'suppliers') : false;

  const load = useCallback(async () => {
    if (!companyId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      setSuppliers(await listSuppliers(companyId));
    } catch (err) {
      logger.error('[suppliers] register load failed', { err: String(err) });
      setError(err instanceof Error ? err.message : 'The supplier register could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { void load(); }, [load]);

  const summary = useMemo(() => summarise(suppliers), [suppliers]);
  const visible = useMemo(() => triage(search(suppliers, query)), [suppliers, query]);

  const save = async (s: Supplier, status: QualificationStatus, until: string | null) => {
    if (!companyId) return;
    setBusy(true);
    setError(null);
    try {
      await updateQualification(companyId, s.id, status, until);
      setNotice(`${s.name} is now ${STATUS_LABELS[status].toLowerCase()}.`);
      setEditing(null);
      await load();
    } catch (err) {
      logger.error('[suppliers] standing update failed', { err: String(err) });
      setError(err instanceof Error ? err.message : 'That standing could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  if (!companyId) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Approved suppliers</h1>
        <div className="border border-[var(--color-border)] rounded-xl p-6 text-sm text-[var(--color-text-secondary)]">
          No workspace is selected, so there is no supplier register to show.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)] flex items-center gap-2">
          <Factory className="w-7 h-7 text-[var(--color-accent)]" />
          Approved suppliers
        </h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1 max-w-2xl">
          Who is approved, until when, and on what standing. Supplier qualification
          itself — questionnaires, audits and assessment — is not part of this release.
        </p>
      </div>

      {notice && (
        <div role="status" className="flex items-center justify-between gap-2 border rounded-xl p-3 bg-emerald-500/10 border-emerald-500/30 text-sm text-emerald-700">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" /> {notice}
          </span>
          <button onClick={() => setNotice(null)} aria-label="Dismiss"><X className="w-4 h-4" /></button>
        </div>
      )}

      {error && (
        <div role="alert" className="flex items-start gap-2 border rounded-xl p-3 bg-red-500/10 border-red-500/30 text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /><p>{error}</p>
        </div>
      )}

      {/*  A lapsed approval still reads "Qualified" in its own column,
          so it gets said out loud here. */}
      {!loading && summary.lapsed > 0 && (
        <div role="status" className="flex items-start gap-3 border rounded-xl p-4 bg-red-500/10 border-red-500/30">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-red-700">
              {summary.lapsed} supplier{summary.lapsed === 1 ? '' : 's'} past the date they
              were approved until
            </p>
            <p className="text-[var(--color-text-secondary)] mt-0.5">
              Their standing still reads as it was last set — a date passing is not a
              decision to withdraw approval.
            </p>
          </div>
        </div>
      )}

      {!loading && suppliers.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Tile n={summary.qualified} label="Qualified" tone="ok" />
          <Tile n={summary.conditional} label="Conditional" tone="warn" />
          <Tile n={summary.lapsed} label="Approval lapsed" tone="bad" />
          <Tile n={summary.blocked} label="Suspended or disqualified" tone="bad" />
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-tertiary)]" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a supplier, a code or a country"
          aria-label="Search the supplier register"
          className="w-full pl-9 pr-3 py-2.5 border border-[var(--color-border)] rounded-xl text-sm bg-[var(--color-surface)] text-[var(--color-text-primary)] focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent outline-none"
        />
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)] p-6">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading the supplier register…
        </div>
      ) : suppliers.length === 0 ? (
        <div className="border border-[var(--color-border)] rounded-xl p-6">
          <p className="text-sm text-[var(--color-text-secondary)]">
            No suppliers are recorded for this company yet. Suppliers appear here once
            they are added, and a material lot can then name the supplier it came from.
          </p>
        </div>
      ) : visible.length === 0 ? (
        <div className="border border-[var(--color-border)] rounded-xl p-6">
          <p className="text-sm text-[var(--color-text-secondary)]">
            Nothing matches “{query}”.
            <button onClick={() => setQuery('')} className="ml-2 underline min-h-[28px]">
              Clear the search
            </button>
          </p>
        </div>
      ) : (
        <div className="border border-[var(--color-border)] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--color-surface-alt)]">
                <tr className="text-left text-[11px] uppercase tracking-wider text-[var(--color-text-tertiary)]">
                  <th scope="col" className="px-4 py-2.5 font-semibold">Supplier</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">Country</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">Standing</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">Approved until</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">Usable</th>
                  <th scope="col" className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {visible.map((s) => {
                  const lapsed = hasLapsed(s);
                  const days = daysUntilLapse(s);
                  return (
                    <tr key={s.id} className="border-t border-[var(--color-border)] align-top">
                      <th scope="row" className="px-4 py-3 text-left font-medium text-[var(--color-text-primary)]">
                        {s.name}
                        {s.code && (
                          <span className="block text-xs font-normal text-[var(--color-text-tertiary)]">
                            {s.code}
                          </span>
                        )}
                      </th>
                      <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                        {s.country || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[11px] px-2 py-0.5 rounded-full ${TONE_CLASS[STATUS_TONE[s.qualification_status]]}`}>
                          {STATUS_LABELS[s.qualification_status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[var(--color-text-secondary)] whitespace-nowrap">
                        {fmtDate(s.qualified_until)}
                        {lapsed && (
                          <span className="block text-[11px] text-red-700">
                            Lapsed {days != null ? `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago` : ''}
                          </span>
                        )}
                        {!lapsed && days != null && days <= 60 && (
                          <span className="block text-[11px] text-amber-700">
                            {days === 0 ? 'Last day' : `${days} day${days === 1 ? '' : 's'} left`}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[11px] px-2 py-0.5 rounded-full ${isUsable(s) ? TONE_CLASS.ok : TONE_CLASS.bad}`}>
                          {isUsable(s) ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {editing === s.id ? (
                          <StandingForm
                            supplier={s}
                            busy={busy}
                            onCancel={() => setEditing(null)}
                            onSave={(status, until) => void save(s, status, until)}
                          />
                        ) : mayAct ? (
                          <button
                            onClick={() => setEditing(s.id)}
                            aria-label={`Change the standing of ${s.name}`}
                            className="flex items-center gap-1.5 text-xs px-2 py-1 min-h-[28px] rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)]"
                          >
                            <Pencil className="w-3.5 h-3.5" /> Standing
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && !mayAct && suppliers.length > 0 && (
        //  Says why the controls are absent, rather than looking broken.
        <p className="text-xs text-[var(--color-text-tertiary)]">
          You can read this register but not change a standing. Procurement and the QA
          Manager hold that permission.
        </p>
      )}
    </div>
  );
}
