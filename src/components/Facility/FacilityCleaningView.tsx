/**
 *  CLEANING — W6·29, FL-09
 *
 *  The Cleaning tab of the facility logs, drawn as two tables.
 *
 *  DEEP CLEANING SCHEDULE — ZONE / EVERY / LAST DEEP CLEAN / NEXT DUE
 *  / STATUS, with the overdue row tinted and sorted to the top.
 *
 *  RECENT CLEANING RECORDS — RECORD / ZONE · LINE / TYPE · METHOD /
 *  CHEMICALS / CONTACT / DONE · VERIFIED, carrying the fields FL-09
 *  attributes to PRD G3.6.
 *
 *  THE SCHEDULE IS NOT EDITED HERE, AND THAT IS THE DESIGN'S CHOICE.
 *  FL-09's only action is "Record a clean"; its footnote says the
 *  deep cleaning schedule "shares the overdue rule set in Zones &
 *  schedules (FL-02), so there is one alert mechanism for every
 *  facility log". Creating and retiring these schedules is therefore
 *  FL-02's screen, which is built — so this page links to it rather
 *  than growing a second editor that could disagree with it.
 *
 *  NOTHING HERE JUDGES A SCHEDULE. Whether a zone is overdue, and by
 *  how many days, is computed by `facility_deep_clean_schedule` and
 *  rendered as it arrives. A client that recomputed it could disagree
 *  with the register about whether a GMP obligation had been met.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Loader2, AlertTriangle, CheckCircle2, Clock, X, Sparkles, ArrowRight,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { logger } from '../../lib/logger';
import { listZones, listSchedules, type FacilityZone, type FacilitySchedule }
  from '../../lib/facility/facilityLogService';
import {
  listDeepCleanSchedule, listCleaningRecords, recordClean, verifyCleaningRecord,
  validateCleaningDraft, describeDeepCleanStatus, describeLastClean,
  describeTypeAndMethod, describeZoneAndLine, describePeriod, summariseCleaning,
  CLEANING_TYPE_LABELS,
  type DeepCleanRow, type CleaningRecordRow, type CleaningType, type CleaningDraft,
} from '../../lib/facility/facilityCleaningService';

const TONE_CLASS: Record<'ok' | 'warn' | 'bad' | 'idle', string> = {
  ok: 'bg-emerald-500/10 text-emerald-700',
  warn: 'bg-amber-500/10 text-amber-700',
  bad: 'bg-red-500/10 text-red-700',
  idle: 'bg-[var(--color-surface-alt)] text-[var(--color-text-secondary)]',
};

const STATUS_TONE: Record<DeepCleanRow['status'], 'ok' | 'warn' | 'bad' | 'idle'> = {
  overdue: 'bad',
  due_soon: 'warn',
  on_schedule: 'ok',
  //  Idle, not green: nothing has been verified against this schedule,
  //  so it has passed nothing.
  never_cleaned: 'idle',
};

const INPUT =
  'w-full px-3 py-2.5 border rounded-xl text-sm bg-[var(--color-surface)] '
  + 'text-[var(--color-text-primary)] focus:ring-2 focus:ring-[var(--color-accent)] '
  + 'focus:border-transparent outline-none border-[var(--color-border)]';

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

/**
 *  FL-09's "DONE · VERIFIED" cell: who did it and when, then either
 *  the verifier or who it is waiting on.
 *
 *  The unverified state is amber and says so in words rather than
 *  leaving the cell blank — an empty cell reads as "no verification
 *  needed", and FL-09 draws it as an outstanding obligation.
 */
function DoneAndVerified({ row }: { row: CleaningRecordRow }) {
  const done = [row.operator_name, fmtDateTime(row.finished_at ?? row.recorded_at)]
    .filter(Boolean).join(' · ');
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-[var(--color-text-primary)]">{done || '—'}</span>
      {row.verified_at ? (
        <span className="text-xs font-semibold text-emerald-700">
          {row.verifier_name ?? 'Verified'} ✓
        </span>
      ) : (
        <span className="text-xs font-semibold text-amber-700">
          Awaiting verification
        </span>
      )}
    </div>
  );
}

/** FL-09's deep cleaning schedule table. */
function ScheduleTable({ rows, onSetUp }: { rows: DeepCleanRow[]; onSetUp: () => void }) {
  if (rows.length === 0) {
    return (
      <div className="border border-[var(--color-border)] rounded-xl p-6 text-center">
        <p className="text-sm text-[var(--color-text-secondary)]">
          No deep cleaning schedule is set up yet.
        </p>
        <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
          Deep cleans are scheduled per zone under Zones &amp; schedules, which is
          where the overdue rule for every facility log is set.
        </p>
        <button
          onClick={onSetUp}
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-accent)]"
        >
          Open Zones &amp; schedules <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="border border-[var(--color-border)] rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[var(--color-surface-alt)] text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)]">
              <th className="text-left font-medium px-4 py-2.5">Zone</th>
              <th className="text-left font-medium px-4 py-2.5">Every</th>
              <th className="text-left font-medium px-4 py-2.5">Last deep clean</th>
              <th className="text-left font-medium px-4 py-2.5">Next due</th>
              <th className="text-left font-medium px-4 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.schedule_id}
                className={`border-t border-[var(--color-border)] ${
                  r.status === 'overdue' ? 'bg-red-500/5' : ''
                }`}
              >
                <td className="px-4 py-3">
                  <span className="font-semibold text-[var(--color-text-primary)]">
                    {r.zone_name}
                  </span>
                  {r.zone_grade && (
                    <span className="text-[var(--color-text-tertiary)]"> · {r.zone_grade}</span>
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">{describePeriod(r.frequency)}</td>
                <td className="px-4 py-3 text-xs text-[var(--color-text-secondary)]">
                  {describeLastClean(r)}
                </td>
                <td
                  className={`px-4 py-3 whitespace-nowrap ${
                    r.status === 'overdue'
                      ? 'font-semibold text-red-700'
                      : 'text-[var(--color-text-primary)]'
                  }`}
                >
                  {fmtDate(r.next_due_on)}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap ${
                      TONE_CLASS[STATUS_TONE[r.status]]
                    }`}
                  >
                    {describeDeepCleanStatus(r)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** FL-09's recent cleaning records table. */
function RecordsTable({
  rows, onVerify, verifying,
}: {
  rows: CleaningRecordRow[];
  onVerify: (r: CleaningRecordRow) => void;
  verifying: string | null;
}) {
  if (rows.length === 0) {
    return (
      <div className="border border-[var(--color-border)] rounded-xl p-6 text-center">
        <p className="text-sm text-[var(--color-text-secondary)]">
          No cleaning has been recorded yet.
        </p>
        <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
          Use “Record a clean” above to add the first one.
        </p>
      </div>
    );
  }

  return (
    <div className="border border-[var(--color-border)] rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[var(--color-surface-alt)] text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)]">
              <th className="text-left font-medium px-4 py-2.5">Record</th>
              <th className="text-left font-medium px-4 py-2.5">Zone · line</th>
              <th className="text-left font-medium px-4 py-2.5">Type · method</th>
              <th className="text-left font-medium px-4 py-2.5">Chemicals</th>
              <th className="text-left font-medium px-4 py-2.5">Contact</th>
              <th className="text-left font-medium px-4 py-2.5">Done · verified</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.entry_id} className="border-t border-[var(--color-border)]">
                <td className="px-4 py-3 font-mono text-[11px] tracking-wide whitespace-nowrap">
                  {r.reference ?? '—'}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">{describeZoneAndLine(r)}</td>
                <td className="px-4 py-3">{describeTypeAndMethod(r)}</td>
                <td className="px-4 py-3 text-xs text-[var(--color-text-secondary)]">
                  {r.cleaning_agents?.length ? r.cleaning_agents.join(', ') : '—'}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {r.contact_minutes === null ? '—' : `${r.contact_minutes} min`}
                </td>
                <td className="px-4 py-3"><DoneAndVerified row={r} /></td>
                <td className="px-4 py-3 text-right">
                  {r.verified_at === null && (
                    <button
                      onClick={() => onVerify(r)}
                      disabled={verifying === r.entry_id}
                      className="text-xs font-medium text-[var(--color-accent)] disabled:opacity-50 whitespace-nowrap"
                    >
                      {verifying === r.entry_id ? 'Verifying…' : 'Verify'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function FacilityCleaningView({
  companyId, onOpenSetup,
}: {
  companyId?: string;
  onOpenSetup: () => void;
}) {
  const { user } = useAuth();
  const [schedule, setSchedule] = useState<DeepCleanRow[]>([]);
  const [records, setRecords] = useState<CleaningRecordRow[]>([]);
  const [zones, setZones] = useState<FacilityZone[]>([]);
  const [schedules, setSchedules] = useState<FacilitySchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [draft, setDraft] = useState<CleaningDraft>({
    zoneId: '', scheduleId: null, logType: 'cleaning_routine', method: '',
    agents: [], contactMinutes: null, lineRef: null,
    startedAt: null, finishedAt: null, reference: null,
  });
  const [agentsText, setAgentsText] = useState('');

  const load = useCallback(async () => {
    if (!companyId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const [s, r, z, sc] = await Promise.all([
        listDeepCleanSchedule(companyId),
        listCleaningRecords(companyId),
        listZones(companyId),
        listSchedules(companyId),
      ]);
      setSchedule(s);
      setRecords(r);
      setZones(z);
      setSchedules(sc);
    } catch (err) {
      logger.error('[facility] cleaning load failed', { err: String(err) });
      setError(err instanceof Error ? err.message : 'The cleaning page could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { void load(); }, [load]);

  const summary = useMemo(
    () => summariseCleaning(schedule, records),
    [schedule, records],
  );

  //  Only deep-clean schedules of the chosen zone, so a record cannot
  //  be filed against a schedule in another room.
  const zoneSchedules = useMemo(
    () => schedules.filter(
      (s) => s.zone_id === draft.zoneId
        && (s.log_type === 'cleaning_routine' || s.log_type === 'cleaning_deep'),
    ),
    [schedules, draft.zoneId],
  );

  async function handleVerify(r: CleaningRecordRow) {
    if (!user?.id) return;
    setVerifying(r.entry_id);
    setError(null);
    try {
      await verifyCleaningRecord(r.entry_id, user.id);
      setNotice(`${r.reference ?? 'The record'} is verified.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The record could not be verified.');
    } finally {
      setVerifying(null);
    }
  }

  async function handleSave() {
    if (!companyId) return;
    const agents = agentsText.split(',').map((a) => a.trim()).filter(Boolean);
    const d = { ...draft, agents };
    const problem = validateCleaningDraft(d);
    if (problem) { setFormError(problem); return; }
    setSaving(true);
    setFormError(null);
    try {
      await recordClean(companyId, d, user?.id ?? null);
      setRecording(false);
      setAgentsText('');
      setDraft({
        zoneId: '', scheduleId: null, logType: 'cleaning_routine', method: '',
        agents: [], contactMinutes: null, lineRef: null,
        startedAt: null, finishedAt: null, reference: null,
      });
      setNotice('The clean is recorded. It counts towards the schedule once it is verified.');
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'The clean could not be recorded.');
    } finally {
      setSaving(false);
    }
  }

  if (!companyId) {
    return (
      <p className="text-sm text-[var(--color-text-secondary)] p-6">
        No company is selected, so there is no cleaning record to show.
      </p>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)] p-6">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading the cleaning page…
      </div>
    );
  }

  if (error && schedule.length === 0 && records.length === 0) {
    return (
      <div className="border rounded-xl p-4 bg-red-500/10 border-red-500/30">
        <p className="text-sm text-red-700 font-medium">{error}</p>
        <button
          onClick={() => void load()}
          className="mt-2 text-sm font-medium text-[var(--color-accent)]"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="border rounded-xl p-3 bg-red-500/10 border-red-500/30 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-700 mt-0.5 shrink-0" />
          <p className="text-sm text-red-700 flex-1 min-w-0">{error}</p>
          <button onClick={() => setError(null)} aria-label="Dismiss">
            <X className="w-4 h-4 text-red-700" />
          </button>
        </div>
      )}

      {notice && (
        <div className="border rounded-xl p-3 bg-emerald-500/10 border-emerald-500/30 flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 mt-0.5 shrink-0" />
          <p className="text-sm text-emerald-700 flex-1 min-w-0">{notice}</p>
          <button onClick={() => setNotice(null)} aria-label="Dismiss">
            <X className="w-4 h-4 text-emerald-700" />
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--color-text-secondary)] max-w-xl">
          Cleaning records per zone and line, and the deep cleaning schedule with
          overdue alerting.
        </p>
        <button
          onClick={() => { setRecording(true); setFormError(null); }}
          className="px-4 py-2 rounded-xl text-sm font-semibold text-white"
          style={{ background: 'var(--color-accent)' }}
        >
          Record a clean
        </button>
      </div>

      {(summary.overdue > 0 || summary.awaitingVerification > 0) && (
        <div className="flex flex-wrap gap-2">
          {summary.overdue > 0 && (
            <span className={`text-xs px-2.5 py-1 rounded-full ${TONE_CLASS.bad}`}>
              {summary.overdue} overdue
            </span>
          )}
          {summary.dueSoon > 0 && (
            <span className={`text-xs px-2.5 py-1 rounded-full ${TONE_CLASS.warn}`}>
              {summary.dueSoon} due soon
            </span>
          )}
          {summary.neverCleaned > 0 && (
            <span className={`text-xs px-2.5 py-1 rounded-full ${TONE_CLASS.idle}`}>
              {summary.neverCleaned} never deep cleaned
            </span>
          )}
          {summary.awaitingVerification > 0 && (
            <span className={`text-xs px-2.5 py-1 rounded-full ${TONE_CLASS.warn}`}>
              {summary.awaitingVerification} awaiting verification
            </span>
          )}
        </div>
      )}

      <section className="space-y-2">
        <h3 className="flex items-center gap-2 text-base font-semibold text-[var(--color-text-primary)]">
          <AlertTriangle className="w-4 h-4" /> Deep cleaning schedule
        </h3>
        <ScheduleTable rows={schedule} onSetUp={onOpenSetup} />
        {/*  Said once, where the reader can act on it: an unverified
            clean is recorded but has not yet satisfied the schedule,
            which is why a zone can be overdue with a clean against it
            on the same screen. */}
        <p className="text-xs text-[var(--color-text-tertiary)]">
          A deep clean counts towards its schedule once it has been verified, so an
          overdue alert clears on verification rather than on the clean itself. The
          schedule and its overdue rule are set under Zones &amp; schedules.
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="flex items-center gap-2 text-base font-semibold text-[var(--color-text-primary)]">
          <CheckCircle2 className="w-4 h-4" /> Recent cleaning records
        </h3>
        <RecordsTable rows={records} onVerify={handleVerify} verifying={verifying} />
      </section>

      <p className="text-xs text-[var(--color-text-tertiary)] leading-relaxed">
        Fields are those PRD G3.6 names: date, operator, method, chemicals, contact
        time, line or zone.
      </p>

      {recording && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-[var(--color-surface)] w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
              <h3 className="font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
                <Sparkles className="w-4 h-4" /> Record a clean
              </h3>
              <button onClick={() => setRecording(false)} aria-label="Close">
                <X className="w-5 h-5 text-[var(--color-text-secondary)]" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              {formError && (
                <div className="border rounded-xl p-3 bg-red-500/10 border-red-500/30">
                  <p className="text-sm text-red-700">{formError}</p>
                </div>
              )}

              <label className="block">
                <span className="text-xs font-medium text-[var(--color-text-secondary)]">Zone</span>
                <select
                  className={INPUT}
                  value={draft.zoneId}
                  onChange={(e) => setDraft({ ...draft, zoneId: e.target.value, scheduleId: null })}
                >
                  <option value="">Choose a zone…</option>
                  {zones.filter((z) => z.is_active).map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name}{z.code ? ` · ${z.code}` : ''}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-xs font-medium text-[var(--color-text-secondary)]">Type</span>
                <select
                  className={INPUT}
                  value={draft.logType}
                  onChange={(e) => setDraft({ ...draft, logType: e.target.value as CleaningType })}
                >
                  {(Object.keys(CLEANING_TYPE_LABELS) as CleaningType[]).map((t) => (
                    <option key={t} value={t}>{CLEANING_TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </label>

              {/*  Only offered where one exists. A changeover clean has
                  no schedule to file against, which is why it is not an
                  error for this to be empty. */}
              {draft.logType !== 'cleaning_changeover' && zoneSchedules.length > 0 && (
                <label className="block">
                  <span className="text-xs font-medium text-[var(--color-text-secondary)]">
                    Against which scheduled clean
                  </span>
                  <select
                    className={INPUT}
                    value={draft.scheduleId ?? ''}
                    onChange={(e) => setDraft({ ...draft, scheduleId: e.target.value || null })}
                  >
                    <option value="">Not against a schedule</option>
                    {zoneSchedules.map((s) => (
                      <option key={s.id} value={s.id}>{s.description}</option>
                    ))}
                  </select>
                </label>
              )}

              <label className="block">
                <span className="text-xs font-medium text-[var(--color-text-secondary)]">Method</span>
                <input
                  className={INPUT}
                  value={draft.method}
                  placeholder="wipe down, top to bottom"
                  onChange={(e) => setDraft({ ...draft, method: e.target.value })}
                />
              </label>

              <label className="block">
                <span className="text-xs font-medium text-[var(--color-text-secondary)]">
                  Chemicals, separated by commas
                </span>
                <input
                  className={INPUT}
                  value={agentsText}
                  placeholder="Hypochlorite 1%, IPA 70%"
                  onChange={(e) => setAgentsText(e.target.value)}
                />
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block min-w-0">
                  <span className="text-xs font-medium text-[var(--color-text-secondary)]">
                    Contact time, minutes
                  </span>
                  <input
                    className={INPUT}
                    type="number"
                    min={1}
                    value={draft.contactMinutes ?? ''}
                    onChange={(e) => setDraft({
                      ...draft,
                      contactMinutes: e.target.value === '' ? null : Number(e.target.value),
                    })}
                  />
                </label>
                <label className="block min-w-0">
                  <span className="text-xs font-medium text-[var(--color-text-secondary)]">
                    Line or equipment
                  </span>
                  <input
                    className={INPUT}
                    value={draft.lineRef ?? ''}
                    placeholder="TL-1"
                    onChange={(e) => setDraft({ ...draft, lineRef: e.target.value || null })}
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block min-w-0">
                  <span className="text-xs font-medium text-[var(--color-text-secondary)]">Started</span>
                  <input
                    className={INPUT}
                    type="datetime-local"
                    value={draft.startedAt ?? ''}
                    onChange={(e) => setDraft({ ...draft, startedAt: e.target.value || null })}
                  />
                </label>
                <label className="block min-w-0">
                  <span className="text-xs font-medium text-[var(--color-text-secondary)]">Finished</span>
                  <input
                    className={INPUT}
                    type="datetime-local"
                    value={draft.finishedAt ?? ''}
                    onChange={(e) => setDraft({ ...draft, finishedAt: e.target.value || null })}
                  />
                </label>
              </div>

              <label className="block">
                <span className="text-xs font-medium text-[var(--color-text-secondary)]">
                  Record reference
                </span>
                <input
                  className={INPUT}
                  value={draft.reference ?? ''}
                  placeholder="CR-2026-0415"
                  onChange={(e) => setDraft({ ...draft, reference: e.target.value || null })}
                />
              </label>

              {/*  Stated before saving, not after: the operator should
                  know the clean will not clear an overdue alert on its
                  own. */}
              <p className="flex items-start gap-2 text-xs text-[var(--color-text-tertiary)]">
                <Clock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                A deep clean counts towards its schedule once it has been verified.
              </p>
            </div>

            <div className="flex gap-2 p-4 border-t border-[var(--color-border)]">
              <button
                onClick={() => setRecording(false)}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium border border-[var(--color-border)] text-[var(--color-text-secondary)]"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleSave()}
                disabled={saving}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: 'var(--color-accent)' }}
              >
                {saving ? 'Saving…' : 'Save cleaning record'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
