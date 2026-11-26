/**
 * Facility logs — FL-01, with FL-05's zone history and FL-03/FL-08's
 * recording step.
 *
 * FL-01 states the scope: *"Environmental monitoring, cleaning, water
 * and pest control for the site. Logs belong to the facility, not to a
 * batch."* The register is ordered the way the design titles it —
 * "today, overdue and failed first" — because its job is triage.
 *
 * ── THE VERDICT IS READ, NOT COMPUTED ──
 *
 * Nothing on this screen decides whether a reading passed. The database
 * derives `outcome` from the reading and its schedule's limits
 * (20261204000000), and this page displays it. A screen that compared
 * 112 CFU against an action limit of 100 itself could be made to
 * disagree with the stored record, and on an environmental log that
 * disagreement IS the finding.
 *
 * ── WHY THERE IS NO SIGN-OFF BUTTON ──
 *
 * FL-03 and FL-08 show one person recording a reading. No second
 * signature is drawn anywhere in W6·29, and adding one to a GMP record
 * is a quality decision rather than an implementation detail. So this
 * records and does not sign.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ClipboardList, Loader2, AlertTriangle, Search, Plus, X, CheckCircle2,
  ChevronRight, History, Settings2, TrendingUp,
} from 'lucide-react';
import FacilityZonesSetup from './FacilityZonesSetup';
import FacilityTrendsView from './FacilityTrendsView';
import FacilityPestView from './FacilityPestView';
import FacilityWaterView from './FacilityWaterView';
import FacilityCleaningView from './FacilityCleaningView';
import { listDeepCleanSchedule, type DeepCleanRow }
  from '../../lib/facility/facilityCleaningService';
import { useAuth } from '../../contexts/AuthContext';
import { logger } from '../../lib/logger';
import {
  listRegister, listZoneHistory, recordEntry,
  summarise, triageOrder, filterByTab, isOverdue,
  LOG_TYPE_TABS, LOG_TYPE_LABELS, FREQUENCY_LABELS, OUTCOME_LABELS, OUTCOME_TONE,
  type RegisterRow, type FacilityLogEntry, type FacilityOutcome,
} from '../../lib/facility/facilityLogService';

type Tab = 'today' | 'Environmental' | 'Cleaning' | 'Water' | 'Pest control';

const TONE_CLASS: Record<'ok' | 'warn' | 'bad' | 'idle', string> = {
  ok: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30',
  warn: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
  bad: 'bg-red-500/10 text-red-600 border-red-500/30',
  idle: 'bg-[var(--color-surface-alt)] text-[var(--color-text-tertiary)] border-[var(--color-border)]',
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch { return iso; }
}

/** "Daily · due 09:00", the way FL-01 writes it. */
function dueLabel(row: RegisterRow): string {
  const freq = FREQUENCY_LABELS[row.frequency];
  return row.due_time ? `${freq} · due ${row.due_time.slice(0, 5)}` : freq;
}

/** "112 CFU at CP-3 · action limit 100", or what is missing instead. */
function resultLabel(row: RegisterRow): string {
  if (row.last_recorded_at === null) return 'Not sampled';
  if (row.last_outcome === 'not_done') return 'Not done';
  if (row.last_result_value === null) {
    return row.last_reference ? `Done · ${row.last_reference}` : 'Done';
  }
  const unit = row.result_unit ? ` ${row.result_unit}` : '';
  const at = row.last_result_position ? ` at ${row.last_result_position}` : '';
  const limit = row.action_limit !== null
    ? ` · action limit ${row.action_limit}`
    : row.alert_limit !== null ? ` · alert ${row.alert_limit}` : '';
  return `${row.last_result_value}${unit}${at}${limit}`;
}

function StatusBadge({ row }: { row: RegisterRow }) {
  //  Overdue outranks the last result: a stale pass is not a pass.
  const overdue = isOverdue(row);
  const outcome: FacilityOutcome | null = row.last_outcome;
  const label = overdue ? 'Overdue' : outcome ? OUTCOME_LABELS[outcome] : 'Not sampled';
  const tone = overdue ? 'bad' : outcome ? OUTCOME_TONE[outcome] : 'idle';
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium border ${TONE_CLASS[tone]}`}>
      {label}
    </span>
  );
}

function Tile({ n, label, tone }: { n: number; label: string; tone: 'bad' | 'warn' | 'idle' }) {
  const colour = tone === 'bad' ? 'text-red-600' : tone === 'warn' ? 'text-amber-600' : 'text-[var(--color-text-primary)]';
  return (
    <div className="border border-[var(--color-border)] rounded-xl p-3 bg-[var(--color-surface)]">
      <div className={`text-xl font-semibold tabular-nums ${colour}`}>{n}</div>
      <div className="text-[11px] text-[var(--color-text-tertiary)] leading-snug mt-0.5">{label}</div>
    </div>
  );
}

export default function FacilityLogsPage({ companyId }: { companyId?: string }) {
  const { user } = useAuth();
  const [rows, setRows] = useState<RegisterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('today');
  const [query, setQuery] = useState('');
  const [recording, setRecording] = useState<RegisterRow | null>(null);
  const [historyFor, setHistoryFor] = useState<RegisterRow | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  //  FL-01 and FL-02 are two screens of one feature, and FL-02 is
  //  where the register gets its content, so it is reached from here
  //  rather than given a rail entry of its own — HS-02 lists one
  //  "Facility logs" and no second item beside it.
  const [view, setView] = useState<'register' | 'setup' | 'trends'>('register');
  const [deepClean, setDeepClean] = useState<DeepCleanRow[]>([]);

  const load = useCallback(async () => {
    if (!companyId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      /*
       *  The deep cleaning schedule is loaded here as well as in the
       *  Cleaning tab, because the "Deep clean overdue" tile must
       *  agree with the table FL-09 draws beneath it.
       *
       *  Counting it from the register instead would make this screen
       *  contradict itself. The register's view of a deep clean is its
       *  last ENTRY; FL-09's is its last VERIFIED entry, which is the
       *  rule that makes the design's own two tables agree. A zone
       *  whose deep clean has been performed and not yet verified
       *  would show "0 deep cleans overdue" in the tile and "Overdue ·
       *  6 days" in the table.
       *
       *  The rest of the register is untouched: `summarise` still
       *  counts every other tile, and nothing else in W6·29 is
       *  verified.
       */
      const [register, deep] = await Promise.all([
        listRegister(companyId),
        listDeepCleanSchedule(companyId),
      ]);
      setRows(register);
      setDeepClean(deep);
    } catch (err) {
      logger.error('[facility] register load failed', { err: String(err) });
      setError(err instanceof Error ? err.message : 'The facility log register could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { void load(); }, [load]);

  const summary = useMemo(() => {
    const base = summarise(rows);
    return {
      ...base,
      deepCleanOverdue: deepClean.filter((d) => d.status === 'overdue').length,
    };
  }, [rows, deepClean]);

  const visible = useMemo(() => {
    const byTab = tab === 'today'
      ? rows
      : filterByTab(rows, LOG_TYPE_TABS.find((t) => t.label === tab)?.type ?? []);
    const q = query.trim().toLowerCase();
    const searched = q
      ? byTab.filter((r) =>
        r.zone_name.toLowerCase().includes(q)
        || r.description.toLowerCase().includes(q)
        || (r.zone_line_ref ?? '').toLowerCase().includes(q))
      : byTab;
    return triageOrder(searched);
  }, [rows, tab, query]);

  //  No company resolved yet — a different state from "no zones", and
  //  collapsing the two is how somebody concludes the feature is broken.
  if (!companyId) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Facility logs</h1>
        <div className="border border-[var(--color-border)] rounded-xl p-6 text-sm text-[var(--color-text-secondary)]">
          No workspace is selected, so there are no facility logs to show.
        </div>
      </div>
    );
  }

  if (view === 'setup') {
    return (
      <FacilityZonesSetup
        companyId={companyId}
        onBack={() => { setView('register'); void load(); }}
      />
    );
  }

  //  FL-06. Reached from the register, like FL-02: HS-02 lists one
  //  "Facility logs" and no second item beside it.
  if (view === 'trends') {
    return (
      <FacilityTrendsView companyId={companyId} onBack={() => setView('register')} />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)] flex items-center gap-2">
            <ClipboardList className="w-7 h-7 text-[var(--color-accent)]" />
            Facility logs
          </h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1 max-w-2xl">
            Environmental monitoring, cleaning, water and pest control for the site.
            Logs belong to the facility, not to a batch.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setView('trends')}
            className="flex items-center gap-1.5 px-4 py-2.5 min-h-[40px] rounded-xl text-sm font-medium border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-alt)]"
          >
            <TrendingUp className="w-4 h-4" /> Trends
          </button>
          <button
            onClick={() => setView('setup')}
            className="flex items-center gap-1.5 px-4 py-2.5 min-h-[40px] rounded-xl text-sm font-medium border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-alt)]"
          >
            <Settings2 className="w-4 h-4" /> Zones &amp; schedules
          </button>
        </div>
      </div>

      {/* FL-01's banner: only when something actually needs attention. */}
      {!loading && (summary.outsideAction > 0 || summary.overdue > 0) && (
        <div
          role="status"
          className="flex items-start gap-3 border rounded-xl p-4 bg-red-500/10 border-red-500/30"
        >
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-red-700">
              {[
                summary.outsideAction > 0 && `${summary.outsideAction} result${summary.outsideAction === 1 ? '' : 's'} outside an action limit`,
                summary.overdue > 0 && `${summary.overdue} test${summary.overdue === 1 ? '' : 's'} overdue`,
                summary.deepCleanOverdue > 0 && `${summary.deepCleanOverdue} deep clean${summary.deepCleanOverdue === 1 ? '' : 's'} overdue`,
              ].filter(Boolean).join(', ')}
            </p>
            <p className="text-[var(--color-text-secondary)] mt-0.5">
              Each zone carries its own escalation days, set under Zones &amp; schedules.
            </p>
          </div>
        </div>
      )}

      {notice && (
        <div role="status" className="flex items-center gap-2 border rounded-xl p-3 bg-emerald-500/10 border-emerald-500/30 text-sm text-emerald-700">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          {notice}
        </div>
      )}

      {/* Tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Tile n={summary.outsideAction} label="Outside action limit" tone="bad" />
        <Tile n={summary.outsideAlert} label="Above alert limit" tone="warn" />
        <Tile n={summary.overdue} label="Tests overdue" tone="bad" />
        <Tile n={summary.deepCleanOverdue} label="Deep clean overdue" tone="warn" />
        <Tile n={summary.doneToday} label={`Daily tests done of ${summary.dueToday}`} tone="idle" />
      </div>

      {/* Tabs + search */}
      <div className="flex flex-col gap-3">
        <div className="flex gap-1 overflow-x-auto pb-1" role="tablist" aria-label="Facility log types">
          {(['today', ...LOG_TYPE_TABS.map((t) => t.label)] as Tab[]).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`px-3 py-2 min-h-[36px] rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                tab === t
                  ? 'text-white'
                  : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-alt)]'
              }`}
              style={tab === t ? { background: 'var(--color-accent)' } : undefined}
            >
              {t === 'today' ? 'Today' : t}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-tertiary)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a zone, a line or a test"
            aria-label="Search facility logs"
            className="w-full pl-9 pr-3 py-2.5 border border-[var(--color-border)] rounded-xl text-sm bg-[var(--color-surface)] text-[var(--color-text-primary)] focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent outline-none"
          />
        </div>
      </div>

      {/*  FL-13 is the Pest control tab: the same tab bar above, a
          different body beneath it. A pest visit is a provider, a
          technician and many per-station findings, which the
          register's one-row-per-reading table cannot show. */}
      {tab === 'Pest control' ? (
        <FacilityPestView companyId={companyId} />
      ) : tab === 'Cleaning' ? (
        /*  FL-09. A cleaning record carries a method, chemicals and a
            contact time, and the deep cleaning schedule answers "when
            is the next one due" rather than "was the last reading
            within limits" — neither of which the register's
            one-row-per-reading table can show. */
        <FacilityCleaningView companyId={companyId} onOpenSetup={() => setView('setup')} />
      ) : tab === 'Water' ? (
        /*  FL-11, for the same reason as FL-13: the register's one
            limit column cannot print a range or "Absent in 100 mL",
            and the environmental rule would pass a pH of 4.0 against
            a range of 5.0 to 7.0. */
        <FacilityWaterView companyId={companyId} />
      ) : loading ? (
        <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)] p-6">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading the register…
        </div>
      ) : error ? (
        <div className="border rounded-xl p-4 bg-red-500/10 border-red-500/30">
          <p className="text-sm text-red-700 font-medium">{error}</p>
          <button
            onClick={() => void load()}
            className="mt-2 text-sm underline text-[var(--color-text-secondary)] min-h-[28px]"
          >
            Try again
          </button>
        </div>
      ) : rows.length === 0 ? (
        //  Genuinely empty, and says which kind of empty it is.
        <div className="border border-[var(--color-border)] rounded-xl p-6">
          <p className="text-sm text-[var(--color-text-secondary)]">
            No zones or scheduled tests are set up for this site yet. A zone carries its
            own tests, frequency, limits and owner, and scheduled tests appear here on
            their due dates.
          </p>
          <button
            onClick={() => setView('setup')}
            className="mt-3 flex items-center gap-1.5 px-4 py-2.5 min-h-[40px] rounded-xl text-sm font-medium text-white"
            style={{ background: 'var(--color-accent)' }}
          >
            <Plus className="w-4 h-4" /> Set up zones &amp; schedules
          </button>
        </div>
      ) : visible.length === 0 ? (
        <div className="border border-[var(--color-border)] rounded-xl p-6">
          <p className="text-sm text-[var(--color-text-secondary)]">
            Nothing matches {query ? <>the search “{query}”</> : 'this tab'}.
            {query && (
              <button onClick={() => setQuery('')} className="ml-2 underline min-h-[28px]">
                Clear the search
              </button>
            )}
          </p>
        </div>
      ) : (
        <div className="border border-[var(--color-border)] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--color-surface-alt)]">
                <tr className="text-left text-[11px] uppercase tracking-wider text-[var(--color-text-tertiary)]">
                  <th className="px-4 py-2.5 font-semibold">Zone</th>
                  <th className="px-4 py-2.5 font-semibold">Log</th>
                  <th className="px-4 py-2.5 font-semibold">Due</th>
                  <th className="px-4 py-2.5 font-semibold">Result</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={row.schedule_id} className="border-t border-[var(--color-border)]">
                    <td className="px-4 py-3 align-top">
                      <div className="font-medium text-[var(--color-text-primary)]">{row.zone_name}</div>
                      <div className="text-xs text-[var(--color-text-tertiary)]">
                        {[row.zone_grade, row.zone_line_ref].filter(Boolean).join(' · ') || '—'}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="text-[var(--color-text-primary)]">{LOG_TYPE_LABELS[row.log_type]}</div>
                      <div className="text-xs text-[var(--color-text-tertiary)]">{row.description}</div>
                    </td>
                    <td className="px-4 py-3 align-top text-[var(--color-text-secondary)]">
                      <div>{dueLabel(row)}</div>
                      <div className="text-xs text-[var(--color-text-tertiary)]">
                        last {fmtDate(row.last_recorded_at)}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top text-[var(--color-text-secondary)] max-w-[22rem]">
                      {resultLabel(row)}
                    </td>
                    <td className="px-4 py-3 align-top"><StatusBadge row={row} /></td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => setHistoryFor(row)}
                          aria-label={`History for ${row.zone_name}`}
                          className="p-2 min-h-[32px] min-w-[32px] rounded-lg hover:bg-[var(--color-surface-alt)] text-[var(--color-text-tertiary)]"
                        >
                          <History className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => { setRecording(row); setNotice(null); }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[32px] rounded-lg text-xs font-medium text-white"
                          style={{ background: 'var(--color-accent)' }}
                        >
                          <Plus className="w-3.5 h-3.5" /> Record
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {recording && (
        <RecordModal
          row={recording}
          companyId={companyId}
          userId={user?.id ?? ''}
          onClose={() => setRecording(null)}
          onRecorded={(entry) => {
            setRecording(null);
            setNotice(
              `Recorded for ${recording.zone_name}: ${OUTCOME_LABELS[entry.outcome]}.`,
            );
            void load();
          }}
        />
      )}

      {historyFor && (
        <HistoryModal
          row={historyFor}
          companyId={companyId}
          onClose={() => setHistoryFor(null)}
        />
      )}
    </div>
  );
}

/**
 * FL-03 / FL-08's recording step.
 *
 * The limit is shown while the number is typed, which is FL-03's title
 * — "read swab plates, limit shown, result stated". It is a prompt, not
 * a verdict: the stored outcome comes back from the database.
 */
function RecordModal({
  row, companyId, userId, onClose, onRecorded,
}: {
  row: RegisterRow;
  companyId: string;
  userId: string;
  onClose: () => void;
  onRecorded: (entry: FacilityLogEntry) => void;
}) {
  const measured = row.alert_limit !== null || row.action_limit !== null;
  const [performed, setPerformed] = useState(true);
  const [value, setValue] = useState('');
  const [position, setPosition] = useState('');
  const [notes, setNotes] = useState('');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const numberInvalid = performed && measured && value.trim() !== '' && Number.isNaN(Number(value));
  const missingNumber = performed && measured && value.trim() === '';

  const submit = async () => {
    setErr(null);
    if (numberInvalid) { setErr('The result has to be a number.'); return; }
    setBusy(true);
    try {
      const entry = await recordEntry({
        companyId,
        zoneId: row.zone_id,
        scheduleId: row.schedule_id,
        logType: row.log_type,
        recordedBy: userId,
        performed,
        resultValue: performed && measured && value.trim() !== '' ? Number(value) : null,
        resultUnit: row.result_unit,
        resultPosition: position.trim() || null,
        notes: notes.trim() || null,
        reference: reference.trim() || null,
      });
      onRecorded(entry);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'The entry could not be recorded.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="bg-[var(--color-surface)] w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl border border-[var(--color-border)] max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 p-5 border-b border-[var(--color-border)]">
          <div>
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
              Record · {LOG_TYPE_LABELS[row.log_type]}
            </h2>
            <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
              {row.zone_name} · {row.description}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 min-h-[32px] min-w-[32px] rounded-lg hover:bg-[var(--color-surface-alt)]">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* FL-03: the limit is on screen while the value is typed. */}
          {measured && (
            <div className="text-xs text-[var(--color-text-secondary)] border border-[var(--color-border)] rounded-lg p-3 bg-[var(--color-surface-alt)]">
              {row.alert_limit !== null && <>Alert limit <strong>{row.alert_limit}</strong>{row.result_unit ? ` ${row.result_unit}` : ''}. </>}
              {row.action_limit !== null && <>Action limit <strong>{row.action_limit}</strong>{row.result_unit ? ` ${row.result_unit}` : ''}.</>}
              <span className="block mt-1 text-[var(--color-text-tertiary)]">
                Whether this result is within limits is decided when it is saved, not here.
              </span>
            </div>
          )}

          <label className="flex items-center gap-2 text-sm text-[var(--color-text-primary)]">
            <input
              type="checkbox"
              checked={!performed}
              onChange={(e) => setPerformed(!e.target.checked)}
              className="w-4 h-4"
            />
            This scheduled test was not carried out
          </label>

          {performed && measured && (
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="fl-value" className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                  Result{row.result_unit ? ` (${row.result_unit})` : ''}
                </label>
                <input
                  id="fl-value"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  inputMode="decimal"
                  aria-invalid={numberInvalid}
                  className="w-full px-3 py-2.5 min-h-[40px] border border-[var(--color-border)] rounded-xl text-sm bg-[var(--color-surface)] outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                />
                {numberInvalid && (
                  <p className="text-xs text-red-600 mt-1">That is not a number.</p>
                )}
              </div>
              <div>
                <label htmlFor="fl-pos" className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                  Position <span className="text-[var(--color-text-tertiary)]">(optional)</span>
                </label>
                <input
                  id="fl-pos"
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                  placeholder="CP-3"
                  className="w-full px-3 py-2.5 min-h-[40px] border border-[var(--color-border)] rounded-xl text-sm bg-[var(--color-surface)] outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                />
              </div>
            </div>
          )}

          {performed && !measured && (
            <div>
              <label htmlFor="fl-ref" className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                Reference <span className="text-[var(--color-text-tertiary)]">(optional)</span>
              </label>
              <input
                id="fl-ref"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="CR-2026-0414"
                className="w-full px-3 py-2.5 min-h-[40px] border border-[var(--color-border)] rounded-xl text-sm bg-[var(--color-surface)] outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
            </div>
          )}

          <div>
            <label htmlFor="fl-notes" className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
              Notes <span className="text-[var(--color-text-tertiary)]">(optional)</span>
            </label>
            <textarea
              id="fl-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2.5 border border-[var(--color-border)] rounded-xl text-sm bg-[var(--color-surface)] outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            />
          </div>

          {err && (
            <div role="alert" className="text-sm text-red-700 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
              {err}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 p-5 border-t border-[var(--color-border)]">
          <button onClick={onClose} className="px-4 py-2.5 min-h-[40px] rounded-xl text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-alt)]">
            Cancel
          </button>
          <button
            onClick={() => void submit()}
            disabled={busy || numberInvalid || missingNumber}
            className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[40px] rounded-xl text-sm font-medium text-white disabled:opacity-50"
            style={{ background: 'var(--color-accent)' }}
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Save entry
          </button>
        </div>
      </div>
    </div>
  );
}

/** FL-05 — a zone's history, most recent first. */
function HistoryModal({
  row, companyId, onClose,
}: { row: RegisterRow; companyId: string; onClose: () => void }) {
  const [entries, setEntries] = useState<FacilityLogEntry[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    listZoneHistory(companyId, row.zone_id)
      .then(setEntries)
      .catch((e) => setErr(e instanceof Error ? e.message : 'History could not be loaded.'));
  }, [companyId, row.zone_id]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="bg-[var(--color-surface)] w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl border border-[var(--color-border)] max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 p-5 border-b border-[var(--color-border)]">
          <div>
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
              {row.zone_name} · history
            </h2>
            <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
              Every entry for this zone, newest first.
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 min-h-[32px] min-w-[32px] rounded-lg hover:bg-[var(--color-surface-alt)]">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5">
          {err ? (
            <p role="alert" className="text-sm text-red-700">{err}</p>
          ) : entries === null ? (
            <p className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </p>
          ) : entries.length === 0 ? (
            <p className="text-sm text-[var(--color-text-secondary)]">
              Nothing has been recorded for this zone yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {entries.map((e) => (
                <li key={e.id} className="border border-[var(--color-border)] rounded-xl p-3 flex items-start gap-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border shrink-0 ${TONE_CLASS[OUTCOME_TONE[e.outcome]]}`}>
                    {OUTCOME_LABELS[e.outcome]}
                  </span>
                  <span className="flex-1 min-w-0 text-sm">
                    <span className="block text-[var(--color-text-primary)]">
                      {LOG_TYPE_LABELS[e.log_type]}
                      {e.result_value !== null && <> · {e.result_value}{e.result_unit ? ` ${e.result_unit}` : ''}</>}
                      {e.result_position && <> at {e.result_position}</>}
                    </span>
                    <span className="block text-xs text-[var(--color-text-tertiary)]">
                      {fmtDate(e.recorded_at)}
                      {e.reference && <> · {e.reference}</>}
                      {e.linked_deviation_id && <> · deviation linked</>}
                    </span>
                    {e.notes && (
                      <span className="block text-xs text-[var(--color-text-secondary)] mt-1">{e.notes}</span>
                    )}
                  </span>
                  <ChevronRight className="w-4 h-4 text-[var(--color-text-tertiary)] shrink-0 mt-0.5" aria-hidden />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
