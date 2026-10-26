/**
 *  WATER TREATMENT — W6·29, FL-10 and FL-11
 *
 *  FL-11 is the Water tab of the facility logs. Its header is the
 *  source and its treatment train — "Borehole BH-1 → Sand filter →
 *  Carbon filter → Softener → Reverse osmosis RO-1 → UV lamp UV-1 →
 *  Purified water loop" — and beneath it a table of tests:
 *  TEST / FREQUENCY / LAST RESULT / LIMIT / LABORATORY / STATUS.
 *
 *  The LIMIT column is why water has its own model. FL-11 draws four
 *  shapes of limit — a maximum, a zero maximum, a RANGE ("5.0 – 7.0")
 *  and a QUALITATIVE expectation ("Absent in 100 mL") — and the
 *  environmental rule, which only asks whether a result is above its
 *  limit, passes a pH of 4.0 against a range of 5.0 to 7.0.
 *
 *  So the limit and the result are both rendered by functions that
 *  know which kind they are, and whether a result met its limit is
 *  read from `outcome`, which the database derived. Nothing here
 *  judges a result.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Loader2, AlertTriangle, CheckCircle2, X, ArrowRight, FlaskConical,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { logger } from '../../lib/logger';
import {
  listWaterRegister, listStages, recordResult, validateWaterResult,
  formatLimit, formatLastResult, formatLaboratory, summarise, triage,
  WATER_OUTCOME_LABELS, WATER_OUTCOME_TONE, WATER_FREQUENCY_LABELS,
  type WaterRegisterRow, type WaterStage, type WaterOutcome, type WaterResultDraft,
} from '../../lib/facility/facilityWaterService';

const TONE_CLASS: Record<'ok' | 'warn' | 'bad' | 'idle', string> = {
  ok: 'bg-emerald-500/10 text-emerald-700',
  warn: 'bg-amber-500/10 text-amber-700',
  bad: 'bg-red-500/10 text-red-700',
  idle: 'bg-[var(--color-surface-alt)] text-[var(--color-text-secondary)]',
};

const INPUT =
  'w-full px-3 py-2.5 border rounded-xl text-sm bg-[var(--color-surface)] '
  + 'text-[var(--color-text-primary)] focus:ring-2 focus:ring-[var(--color-accent)] '
  + 'focus:border-transparent outline-none';

function StatusBadge({ row }: { row: WaterRegisterRow }) {
  if (!row.last_result_id) {
    return (
      <span className={`text-[11px] px-2 py-0.5 rounded-full ${TONE_CLASS.idle}`}>
        Never sampled
      </span>
    );
  }
  const outcome = (row.last_outcome ?? 'not_assessed') as WaterOutcome;
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-full ${TONE_CLASS[WATER_OUTCOME_TONE[outcome]]}`}>
      {WATER_OUTCOME_LABELS[outcome]}
    </span>
  );
}

/** FL-11's treatment train, drawn as the chain the design shows. */
function TreatmentTrain({ stages }: { stages: WaterStage[] }) {
  if (stages.length === 0) {
    return (
      <p className="text-sm text-[var(--color-text-secondary)]">
        No treatment stages are recorded for this source.
      </p>
    );
  }
  return (
    <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
      {stages.map((s, i) => (
        <li key={s.id} className="flex items-center gap-1.5">
          <span className="text-xs px-2 py-1 rounded-lg bg-[var(--color-surface-alt)] text-[var(--color-text-primary)]">
            {s.name}
            {s.equipment_ref && (
              <span className="text-[var(--color-text-tertiary)]"> {s.equipment_ref}</span>
            )}
          </span>
          {i < stages.length - 1 && (
            <ArrowRight className="w-3.5 h-3.5 text-[var(--color-text-tertiary)] shrink-0" aria-hidden="true" />
          )}
        </li>
      ))}
    </ol>
  );
}

/** FL-10: recording a result, with the limit shown while typing. */
function RecordModal({
  row, busy, onClose, onSave,
}: {
  row: WaterRegisterRow;
  busy: boolean;
  onClose: () => void;
  onSave: (d: WaterResultDraft) => void;
}) {
  const [draft, setDraft] = useState<WaterResultDraft>({
    test_id: row.test_id,
    sampled_on: new Date().toISOString().slice(0, 10),
    received: true,
  });
  const [touched, setTouched] = useState(false);
  const errors = useMemo(
    () => validateWaterResult(draft, row.limit_kind), [draft, row.limit_kind],
  );
  const set = <K extends keyof WaterResultDraft>(k: K, v: WaterResultDraft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const external = row.laboratory_kind === 'external';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="bg-[var(--color-surface)] w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl p-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
              {row.test_name}
            </h3>
            <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
              {row.source_name}
              {row.sample_point && <> · {row.sample_point}</>}
              {' · '}{WATER_FREQUENCY_LABELS[row.frequency]}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="shrink-0 p-1 min-h-[32px] min-w-[32px]">
            <X className="w-5 h-5 text-[var(--color-text-secondary)]" />
          </button>
        </div>

        {/*  The limit, shown while the reading is typed — and a plain
            statement that the verdict is not decided here. */}
        <div className="border border-[var(--color-border)] rounded-xl p-3 mb-4">
          <p className="text-xs text-[var(--color-text-secondary)]">
            Limit: <span className="font-medium text-[var(--color-text-primary)]">
              {formatLimit(row)}
            </span>
          </p>
          <p className="text-[11px] text-[var(--color-text-tertiary)] mt-1">
            Whether this result is within limits is decided when it is saved, not here.
          </p>
        </div>

        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setTouched(true);
            if (Object.keys(errors).length === 0) onSave(draft);
          }}
        >
          <label className="block">
            <span className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
              Sampled on
            </span>
            <input
              type="date"
              value={draft.sampled_on}
              onChange={(e) => set('sampled_on', e.target.value)}
              className={INPUT}
              style={{ borderColor: 'var(--color-border)' }}
            />
            {touched && errors.sampled_on && (
              <span role="alert" className="block text-[11px] text-red-600 mt-1">
                {errors.sampled_on}
              </span>
            )}
          </label>

          {/*  An external laboratory can be awaited. FL-11 draws
              exactly that state on the monthly analysis. */}
          {external && (
            <label className="flex items-start gap-2 text-sm text-[var(--color-text-primary)]">
              <input
                type="checkbox"
                checked={draft.received === false}
                onChange={(e) => set('received', !e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Sent to the laboratory, report not received yet
                <span className="block text-[11px] text-[var(--color-text-tertiary)]">
                  Recorded as awaiting the laboratory — neither a pass nor a failure.
                </span>
              </span>
            </label>
          )}

          {draft.received === false ? (
            <label className="block">
              <span className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                Report due
              </span>
              <input
                type="date"
                value={draft.due_on ?? ''}
                onChange={(e) => set('due_on', e.target.value)}
                className={INPUT}
                style={{ borderColor: 'var(--color-border)' }}
              />
            </label>
          ) : row.limit_kind === 'qualitative' ? (
            <label className="block">
              <span className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                Result
              </span>
              <input
                value={draft.result_text ?? ''}
                onChange={(e) => set('result_text', e.target.value)}
                placeholder={row.expected_text ?? 'Absent'}
                className={INPUT}
                style={{ borderColor: 'var(--color-border)' }}
              />
              {touched && errors.result_text && (
                <span role="alert" className="block text-[11px] text-red-600 mt-1">
                  {errors.result_text}
                </span>
              )}
            </label>
          ) : (
            <label className="block">
              <span className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                Result{row.result_unit ? ` (${row.result_unit})` : ''}
              </span>
              <input
                type="number"
                step="any"
                value={draft.result_value ?? ''}
                onChange={(e) => set(
                  'result_value',
                  e.target.value === '' ? null : Number(e.target.value),
                )}
                className={INPUT}
                style={{ borderColor: 'var(--color-border)' }}
              />
              {touched && errors.result_value && (
                <span role="alert" className="block text-[11px] text-red-600 mt-1">
                  {errors.result_value}
                </span>
              )}
            </label>
          )}

          {external && draft.received !== false && (
            <label className="block">
              <span className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                Laboratory report reference
              </span>
              <input
                value={draft.report_ref ?? ''}
                onChange={(e) => set('report_ref', e.target.value)}
                placeholder="LA-88412"
                className={INPUT}
                style={{ borderColor: 'var(--color-border)' }}
              />
            </label>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2.5 min-h-[40px] rounded-xl text-sm font-medium text-white disabled:opacity-60"
              style={{ background: 'var(--color-accent)' }}
            >
              {busy ? 'Saving…' : 'Save the result'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 min-h-[40px] rounded-xl text-sm text-[var(--color-text-secondary)] border border-[var(--color-border)]"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function FacilityWaterView({ companyId }: { companyId: string }) {
  const { user } = useAuth();
  const [rows, setRows] = useState<WaterRegisterRow[]>([]);
  const [stages, setStages] = useState<WaterStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState<WaterRegisterRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listWaterRegister(companyId);
      setRows(list);
      //  FL-11 shows one source's train. The first source in the
      //  register is the one the header describes.
      if (list.length > 0) {
        setStages(await listStages(companyId, list[0].source_id));
      } else {
        setStages([]);
      }
    } catch (err) {
      logger.error('[water] register load failed', { err: String(err) });
      setError(err instanceof Error ? err.message : 'Water treatment could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { void load(); }, [load]);

  const summary = useMemo(() => summarise(rows), [rows]);
  const visible = useMemo(() => triage(rows), [rows]);
  const source = rows[0];

  const save = async (draft: WaterResultDraft) => {
    setBusy(true);
    setError(null);
    try {
      await recordResult(companyId, draft, user?.id ?? null);
      setNotice('Result recorded.');
      setRecording(null);
      await load();
    } catch (err) {
      logger.error('[water] record failed', { err: String(err) });
      setError(err instanceof Error ? err.message : 'That result could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)] p-6">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading water treatment…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {source && (
        <p className="text-sm text-[var(--color-text-secondary)]">
          {source.source_name}
          {source.source_ref && <> · from {source.source_ref}</>}
          . Logged against the facility, never a batch.
        </p>
      )}

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

      {(summary.outside > 0 || summary.awaiting > 0) && (
        <div role="status" className="flex items-start gap-3 border rounded-xl p-4 bg-red-500/10 border-red-500/30">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-red-700">
              {[
                summary.outside > 0 && `${summary.outside} result${summary.outside === 1 ? '' : 's'} outside limits`,
                summary.awaiting > 0 && `${summary.awaiting} awaiting a laboratory report`,
              ].filter(Boolean).join(', ')}
            </p>
            <p className="text-[var(--color-text-secondary)] mt-0.5">
              A report that has not arrived is neither a pass nor a failure.
            </p>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="border border-[var(--color-border)] rounded-xl p-6">
          <p className="text-sm text-[var(--color-text-secondary)]">
            No water source or tests are set up yet. A source carries its treatment
            train and its own tests, each with a frequency, a limit and the laboratory
            that performs it.
          </p>
        </div>
      ) : (
        <>
          <section className="border border-[var(--color-border)] rounded-xl p-4">
            <h3 className="text-xs uppercase tracking-wider text-[var(--color-text-tertiary)] mb-2">
              Source and treatment
            </h3>
            {source?.source_ref && (
              <p className="text-xs text-[var(--color-text-secondary)] mb-3">
                Source · {source.source_ref}
              </p>
            )}
            <TreatmentTrain stages={stages} />
          </section>

          <div className="border border-[var(--color-border)] rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[var(--color-surface-alt)]">
                  <tr className="text-left text-[11px] uppercase tracking-wider text-[var(--color-text-tertiary)]">
                    <th scope="col" className="px-4 py-2.5 font-semibold">Test</th>
                    <th scope="col" className="px-4 py-2.5 font-semibold">Frequency</th>
                    <th scope="col" className="px-4 py-2.5 font-semibold">Last result</th>
                    <th scope="col" className="px-4 py-2.5 font-semibold">Limit</th>
                    <th scope="col" className="px-4 py-2.5 font-semibold">Laboratory</th>
                    <th scope="col" className="px-4 py-2.5 font-semibold">Status</th>
                    <th scope="col" className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => (
                    <tr key={r.test_id} className="border-t border-[var(--color-border)] align-top">
                      <th scope="row" className="px-4 py-3 text-left font-medium text-[var(--color-text-primary)]">
                        {r.test_name}
                        {r.sample_point && (
                          <span className="block text-xs font-normal text-[var(--color-text-tertiary)]">
                            {r.sample_point}
                          </span>
                        )}
                      </th>
                      <td className="px-4 py-3 text-[var(--color-text-secondary)] whitespace-nowrap">
                        {WATER_FREQUENCY_LABELS[r.frequency]}
                      </td>
                      <td className="px-4 py-3 text-[var(--color-text-primary)] tabular-nums">
                        {formatLastResult(r)}
                      </td>
                      <td className="px-4 py-3 text-[var(--color-text-secondary)] tabular-nums whitespace-nowrap">
                        {formatLimit(r)}
                      </td>
                      <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                        {formatLaboratory(r)}
                      </td>
                      <td className="px-4 py-3"><StatusBadge row={r} /></td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setRecording(r)}
                          className="flex items-center gap-1.5 text-xs px-2 py-1 min-h-[28px] rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] whitespace-nowrap"
                        >
                          <FlaskConical className="w-3.5 h-3.5" /> Record
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {recording && (
        <RecordModal
          row={recording}
          busy={busy}
          onClose={() => setRecording(null)}
          onSave={(d) => void save(d)}
        />
      )}
    </div>
  );
}
