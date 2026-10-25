/**
 *  FACILITY LOGS — ZONES & SCHEDULES (W6·29, FL-02)
 *
 *  FL-01 is the register: what is due, what breached, what is overdue.
 *  It can only ever be as populated as the zones behind it, and until
 *  this screen existed there was no way to create one. A company that
 *  had never been seeded saw FL-01's empty state for ever, and FL-01
 *  itself told the reader to "add them under Zones & schedules" —
 *  naming a screen that was not there.
 *
 *  FL-02 draws this: the zone panel on the left with its name, code,
 *  grade, line, equipment, cleaning SOP and owner, the two overdue
 *  fields beneath it, and the zone's scheduled tests under that with a
 *  frequency and limits each.
 *
 *  What this screen does NOT do, because W6·29 does not draw it:
 *    - no approval or sign-off on a zone or a schedule change;
 *    - no deletion. FL-02 offers none, and a delete would cascade
 *      through the GMP records the zone has already produced, so
 *      retiring is the only way out of the register;
 *    - no automatic deviation, and no change to how `outcome` is
 *      decided — that stays in the database where FL-01 left it.
 *
 *  Every rule the forms object to is also enforced by the triggers in
 *  20261205000000. The client checks exist so a mistake is caught
 *  while the field is still focused, not to be the enforcement.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, Loader2, Plus, X, CheckCircle2, AlertTriangle,
  ChevronDown, ChevronRight, Pencil, Archive, RotateCcw,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { logger } from '../../lib/logger';
import {
  listZones, listSchedules, listSiteOptions,
  createZone, updateZone, setZoneActive,
  createSchedule, updateSchedule, setScheduleActive,
  validateZoneDraft, validateScheduleDraft,
  LOG_TYPE_LABELS, FREQUENCY_LABELS,
  type FacilityZone, type FacilitySchedule, type FacilitySiteOption,
  type FacilityLogType, type FacilityFrequency,
  type ZoneDraft, type ScheduleDraft,
} from '../../lib/facility/facilityLogService';

const LOG_TYPES = Object.keys(LOG_TYPE_LABELS) as FacilityLogType[];
const FREQUENCIES = Object.keys(FREQUENCY_LABELS) as FacilityFrequency[];

const INPUT =
  'w-full px-3 py-2.5 border rounded-xl text-sm bg-[var(--color-surface)] '
  + 'text-[var(--color-text-primary)] focus:ring-2 focus:ring-[var(--color-accent)] '
  + 'focus:border-transparent outline-none';

function Field({
  label, hint, error, children,
}: {
  label: string; hint?: string; error?: string; children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
        {label}
      </span>
      {children}
      {hint && !error && (
        <span className="block text-[11px] text-[var(--color-text-tertiary)] mt-1">{hint}</span>
      )}
      {error && (
        <span role="alert" className="block text-[11px] text-red-600 mt-1">{error}</span>
      )}
    </label>
  );
}

/** FL-02's zone panel. */
function ZoneForm({
  sites, initial, busy, onCancel, onSave,
}: {
  sites: FacilitySiteOption[];
  initial?: FacilityZone;
  busy: boolean;
  onCancel: () => void;
  onSave: (draft: ZoneDraft) => void;
}) {
  const [draft, setDraft] = useState<ZoneDraft>(() => ({
    site_id: initial?.site_id ?? (sites.length === 1 ? sites[0].id : ''),
    name: initial?.name ?? '',
    code: initial?.code ?? '',
    grade: initial?.grade ?? '',
    line_ref: initial?.line_ref ?? '',
    equipment_refs: initial?.equipment_refs ?? [],
    cleaning_sop_ref: initial?.cleaning_sop_ref ?? '',
    alert_owner_after_days: initial?.alert_owner_after_days ?? 0,
    escalate_to_qa_after_days: initial?.escalate_to_qa_after_days ?? 1,
  }));
  const [touched, setTouched] = useState(false);
  const errors = useMemo(() => validateZoneDraft(draft), [draft]);
  const set = <K extends keyof ZoneDraft>(k: K, v: ZoneDraft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  return (
    <form
      className="border border-[var(--color-border)] rounded-xl p-4 space-y-4 bg-[var(--color-surface-alt)]"
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (Object.keys(errors).length === 0) onSave(draft);
      }}
    >
      <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
        {initial ? `Edit ${initial.name}` : 'Add a zone'}
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Site" error={touched ? errors.site_id : undefined}>
          <select
            value={draft.site_id}
            onChange={(e) => set('site_id', e.target.value)}
            className={INPUT}
            style={{ borderColor: 'var(--color-border)' }}
          >
            <option value="">Choose a site…</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </Field>

        <Field label="Zone name" error={touched ? errors.name : undefined}>
          <input
            value={draft.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="Granulation suite"
            className={INPUT}
            style={{ borderColor: 'var(--color-border)' }}
          />
        </Field>

        <Field label="Code" hint="How a result is quoted, such as GR-02.">
          <input
            value={draft.code ?? ''}
            onChange={(e) => set('code', e.target.value)}
            placeholder="GR-02"
            className={INPUT}
            style={{ borderColor: 'var(--color-border)' }}
          />
        </Field>

        {/*  Open text, not a dropdown. The design shows Grade C, D and
            Unclassified; EU GMP also has A and B, and a company may
            classify differently — so the three are offered as a hint
            rather than imposed as the only answers. */}
        <Field label="Grade" hint="Such as Grade C, Grade D, or Unclassified.">
          <input
            value={draft.grade ?? ''}
            onChange={(e) => set('grade', e.target.value)}
            list="facility-grade-suggestions"
            placeholder="Grade D"
            className={INPUT}
            style={{ borderColor: 'var(--color-border)' }}
          />
          <datalist id="facility-grade-suggestions">
            <option value="Grade C" />
            <option value="Grade D" />
            <option value="Unclassified" />
          </datalist>
        </Field>

        <Field label="Line" hint="The production line this zone serves, if any.">
          <input
            value={draft.line_ref ?? ''}
            onChange={(e) => set('line_ref', e.target.value)}
            placeholder="TL-1"
            className={INPUT}
            style={{ borderColor: 'var(--color-border)' }}
          />
        </Field>

        <Field label="Cleaning SOP" hint="The SOP reference cleaning is recorded against.">
          <input
            value={draft.cleaning_sop_ref ?? ''}
            onChange={(e) => set('cleaning_sop_ref', e.target.value)}
            placeholder="SOP-CLN-014"
            className={INPUT}
            style={{ borderColor: 'var(--color-border)' }}
          />
        </Field>

        <Field label="Equipment" hint="Separate several with commas.">
          <input
            value={(draft.equipment_refs ?? []).join(', ')}
            onChange={(e) => set(
              'equipment_refs',
              e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
            )}
            placeholder="MIX-07, SIEVE-02"
            className={INPUT}
            style={{ borderColor: 'var(--color-border)' }}
          />
        </Field>
      </div>

      {/*  FL-02's two overdue fields, per zone — tagged in the design
          "SAME RULE AS CAPA OVERDUE". No ordering is imposed between
          them: the design states none. */}
      <fieldset className="border border-[var(--color-border)] rounded-xl p-3">
        <legend className="text-xs font-medium text-[var(--color-text-secondary)] px-1">
          When a test goes overdue
        </legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field
            label="Alert the owner after (days overdue)"
            error={touched ? errors.alert_owner_after_days : undefined}
          >
            <input
              type="number"
              min={0}
              step={1}
              value={draft.alert_owner_after_days ?? 0}
              onChange={(e) => set('alert_owner_after_days', Number(e.target.value))}
              className={INPUT}
              style={{ borderColor: 'var(--color-border)' }}
            />
          </Field>
          <Field
            label="Escalate to QA after (days)"
            error={touched ? errors.escalate_to_qa_after_days : undefined}
          >
            <input
              type="number"
              min={0}
              step={1}
              value={draft.escalate_to_qa_after_days ?? 1}
              onChange={(e) => set('escalate_to_qa_after_days', Number(e.target.value))}
              className={INPUT}
              style={{ borderColor: 'var(--color-border)' }}
            />
          </Field>
        </div>
      </fieldset>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={busy}
          className="px-4 py-2.5 min-h-[40px] rounded-xl text-sm font-medium text-white disabled:opacity-60"
          style={{ background: 'var(--color-accent)' }}
        >
          {busy ? 'Saving…' : initial ? 'Save the zone' : 'Add the zone'}
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

/** A zone's scheduled test. FL-02 lists these beneath the zone panel. */
function ScheduleForm({
  zoneId, initial, busy, onCancel, onSave,
}: {
  zoneId: string;
  initial?: FacilitySchedule;
  busy: boolean;
  onCancel: () => void;
  onSave: (draft: ScheduleDraft) => void;
}) {
  const [draft, setDraft] = useState<ScheduleDraft>(() => ({
    zone_id: zoneId,
    log_type: initial?.log_type ?? 'environmental_air',
    description: initial?.description ?? '',
    frequency: initial?.frequency ?? 'daily',
    due_time: initial?.due_time ?? '',
    alert_limit: initial?.alert_limit ?? null,
    action_limit: initial?.action_limit ?? null,
    result_unit: initial?.result_unit ?? '',
  }));
  const [touched, setTouched] = useState(false);
  const errors = useMemo(() => validateScheduleDraft(draft), [draft]);
  const set = <K extends keyof ScheduleDraft>(k: K, v: ScheduleDraft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));
  const num = (s: string): number | null => (s.trim() === '' ? null : Number(s));

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
        {initial ? 'Edit the test' : 'Add a scheduled test'}
      </h4>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Log type">
          <select
            value={draft.log_type}
            onChange={(e) => set('log_type', e.target.value as FacilityLogType)}
            className={INPUT}
            style={{ borderColor: 'var(--color-border)' }}
          >
            {LOG_TYPES.map((t) => (
              <option key={t} value={t}>{LOG_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </Field>

        <Field label="Frequency">
          <select
            value={draft.frequency}
            onChange={(e) => set('frequency', e.target.value as FacilityFrequency)}
            className={INPUT}
            style={{ borderColor: 'var(--color-border)' }}
          >
            {FREQUENCIES.map((f) => (
              <option key={f} value={f}>{FREQUENCY_LABELS[f]}</option>
            ))}
          </select>
        </Field>

        <Field
          label="What the test is"
          hint="Printed under the log type on every register row."
          error={touched ? errors.description : undefined}
        >
          <input
            value={draft.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder="Air · settle plates, 4 positions"
            className={INPUT}
            style={{ borderColor: 'var(--color-border)' }}
          />
        </Field>

        <Field label="Due time" hint="Leave blank where no time of day applies.">
          <input
            type="time"
            value={draft.due_time ?? ''}
            onChange={(e) => set('due_time', e.target.value)}
            className={INPUT}
            style={{ borderColor: 'var(--color-border)' }}
          />
        </Field>
      </div>

      {/*  Both limits are optional: FL-01 shows cleaning rows that have
          neither, because a clean is done or not done rather than
          measured. A limit with no unit is refused, though — it would
          be a number nobody could check. */}
      <fieldset className="border border-[var(--color-border)] rounded-xl p-3">
        <legend className="text-xs font-medium text-[var(--color-text-secondary)] px-1">
          Limits, where the test is measured
        </legend>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Alert limit">
            <input
              type="number"
              step="any"
              value={draft.alert_limit ?? ''}
              onChange={(e) => set('alert_limit', num(e.target.value))}
              placeholder="25"
              className={INPUT}
              style={{ borderColor: 'var(--color-border)' }}
            />
          </Field>
          <Field label="Action limit" error={touched ? errors.action_limit : undefined}>
            <input
              type="number"
              step="any"
              value={draft.action_limit ?? ''}
              onChange={(e) => set('action_limit', num(e.target.value))}
              placeholder="50"
              className={INPUT}
              style={{ borderColor: 'var(--color-border)' }}
            />
          </Field>
          <Field label="Unit" error={touched ? errors.result_unit : undefined}>
            <input
              value={draft.result_unit ?? ''}
              onChange={(e) => set('result_unit', e.target.value)}
              placeholder="CFU"
              className={INPUT}
              style={{ borderColor: 'var(--color-border)' }}
            />
          </Field>
        </div>
        <p className="text-[11px] text-[var(--color-text-tertiary)] mt-2">
          Whether a reading sits inside these limits is decided when it is saved, not here.
        </p>
      </fieldset>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={busy}
          className="px-4 py-2.5 min-h-[40px] rounded-xl text-sm font-medium text-white disabled:opacity-60"
          style={{ background: 'var(--color-accent)' }}
        >
          {busy ? 'Saving…' : initial ? 'Save the test' : 'Add the test'}
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

export default function FacilityZonesSetup({
  companyId, onBack,
}: {
  companyId: string;
  onBack: () => void;
}) {
  const { user } = useAuth();
  const [zones, setZones] = useState<FacilityZone[]>([]);
  const [schedules, setSchedules] = useState<FacilitySchedule[]>([]);
  const [sites, setSites] = useState<FacilitySiteOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [addingZone, setAddingZone] = useState(false);
  const [editingZone, setEditingZone] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [addingTestFor, setAddingTestFor] = useState<string | null>(null);
  const [editingTest, setEditingTest] = useState<string | null>(null);
  const [showRetired, setShowRetired] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [z, s, st] = await Promise.all([
        listZones(companyId),
        listSchedules(companyId),
        listSiteOptions(companyId),
      ]);
      setZones(z);
      setSchedules(s);
      setSites(st);
    } catch (err) {
      logger.error('[facility] zone setup load failed', { err: String(err) });
      setError(err instanceof Error ? err.message : 'Zones and schedules could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { void load(); }, [load]);

  /** One wrapper so every write reports the same way. */
  const run = async (what: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setNotice(what);
      await load();
      setAddingZone(false);
      setEditingZone(null);
      setAddingTestFor(null);
      setEditingTest(null);
    } catch (err) {
      logger.error('[facility] zone setup write failed', { err: String(err) });
      setError(err instanceof Error ? err.message : 'That change could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const visibleZones = showRetired ? zones : zones.filter((z) => z.is_active);
  const schedulesFor = (zoneId: string) => schedules.filter((s) => s.zone_id === zoneId);
  const siteName = (id: string) => sites.find((s) => s.id === id)?.name ?? '—';

  const toggle = (id: string) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] min-h-[32px]"
          >
            <ArrowLeft className="w-4 h-4" /> Back to the register
          </button>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)] mt-1">
            Zones &amp; schedules
          </h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1 max-w-2xl">
            A zone carries its own tests, frequency, limits and owner. Changes apply from
            the next scheduled test — readings already recorded keep the limits they were
            judged against.
          </p>
        </div>
        {!addingZone && sites.length > 0 && (
          <button
            onClick={() => { setAddingZone(true); setEditingZone(null); }}
            className="flex items-center gap-1.5 px-4 py-2.5 min-h-[40px] rounded-xl text-sm font-medium text-white shrink-0"
            style={{ background: 'var(--color-accent)' }}
          >
            <Plus className="w-4 h-4" /> Add a zone
          </button>
        )}
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
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <p>{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)] p-6">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading zones and schedules…
        </div>
      ) : sites.length === 0 ? (
        //  A zone must name a site, and the database refuses one that
        //  does not. Saying so here beats a form that cannot be
        //  submitted for a reason the reader has to guess.
        <div className="border border-[var(--color-border)] rounded-xl p-6">
          <p className="text-sm text-[var(--color-text-secondary)]">
            This company has no sites yet, and every zone belongs to one. Add a site under
            Settings → Sites, then come back and set the zones up.
          </p>
        </div>
      ) : (
        <>
          {addingZone && (
            <ZoneForm
              sites={sites}
              busy={busy}
              onCancel={() => setAddingZone(false)}
              onSave={(draft) => void run(
                `${draft.name.trim()} added.`,
                () => createZone(companyId, draft, user?.id ?? null),
              )}
            />
          )}

          {visibleZones.length === 0 ? (
            <div className="border border-[var(--color-border)] rounded-xl p-6">
              <p className="text-sm text-[var(--color-text-secondary)]">
                {zones.length === 0
                  ? 'No zones yet. Add the first one and its scheduled tests appear on the register from their due dates.'
                  : 'Every zone on this company is retired. Show retired zones to bring one back.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {visibleZones.map((zone) => {
                const tests = schedulesFor(zone.id);
                const open = expanded.has(zone.id);
                return (
                  <div
                    key={zone.id}
                    className="border border-[var(--color-border)] rounded-xl overflow-hidden"
                  >
                    <div className="flex items-start justify-between gap-3 p-4">
                      <button
                        onClick={() => toggle(zone.id)}
                        aria-expanded={open}
                        className="flex items-start gap-2 text-left min-h-[32px] flex-1 min-w-0"
                      >
                        {open
                          ? <ChevronDown className="w-4 h-4 mt-0.5 shrink-0 text-[var(--color-text-tertiary)]" />
                          : <ChevronRight className="w-4 h-4 mt-0.5 shrink-0 text-[var(--color-text-tertiary)]" />}
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-[var(--color-text-primary)]">
                            {zone.name}
                            {zone.code && (
                              <span className="text-[var(--color-text-tertiary)] font-normal"> · {zone.code}</span>
                            )}
                            {!zone.is_active && (
                              //  Leading space, not just a margin: the
                              //  margin spaces it on screen but a reader
                              //  announcing the text would otherwise say
                              //  "G2Retired" as one word.
                              <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded bg-[var(--color-surface-alt)] text-[var(--color-text-tertiary)]">
                                {' '}Retired
                              </span>
                            )}
                          </span>
                          <span className="block text-xs text-[var(--color-text-secondary)] mt-0.5">
                            {[
                              siteName(zone.site_id),
                              zone.grade,
                              zone.line_ref && `Line ${zone.line_ref}`,
                              `${tests.length} test${tests.length === 1 ? '' : 's'}`,
                            ].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                      </button>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => { setEditingZone(zone.id); setAddingZone(false); }}
                          aria-label={`Edit ${zone.name}`}
                          className="p-2 min-h-[32px] min-w-[32px] rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-alt)]"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => void run(
                            zone.is_active ? `${zone.name} retired.` : `${zone.name} brought back.`,
                            () => setZoneActive(companyId, zone.id, !zone.is_active),
                          )}
                          disabled={busy}
                          aria-label={zone.is_active ? `Retire ${zone.name}` : `Restore ${zone.name}`}
                          className="p-2 min-h-[32px] min-w-[32px] rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-alt)]"
                        >
                          {zone.is_active
                            ? <Archive className="w-4 h-4" />
                            : <RotateCcw className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {editingZone === zone.id && (
                      <div className="px-4 pb-4">
                        <ZoneForm
                          sites={sites}
                          initial={zone}
                          busy={busy}
                          onCancel={() => setEditingZone(null)}
                          onSave={(draft) => void run(
                            `${draft.name.trim()} saved.`,
                            () => updateZone(companyId, zone.id, draft),
                          )}
                        />
                      </div>
                    )}

                    {open && (
                      <div className="border-t border-[var(--color-border)] p-4 space-y-3 bg-[var(--color-surface)]">
                        {tests.length === 0 ? (
                          <p className="text-sm text-[var(--color-text-secondary)]">
                            No tests scheduled on this zone, so nothing from it reaches the
                            register.
                          </p>
                        ) : (
                          <ul className="space-y-2">
                            {tests.map((t) => (
                              <li key={t.id}>
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="text-sm text-[var(--color-text-primary)]">
                                      {LOG_TYPE_LABELS[t.log_type]}
                                      {!t.is_active && (
                                        <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded bg-[var(--color-surface-alt)] text-[var(--color-text-tertiary)]">
                                          {' '}Retired
                                        </span>
                                      )}
                                    </p>
                                    <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                                      {[
                                        t.description,
                                        FREQUENCY_LABELS[t.frequency],
                                        t.due_time && `due ${t.due_time.slice(0, 5)}`,
                                        t.alert_limit != null && `alert ${t.alert_limit}`,
                                        t.action_limit != null && `action ${t.action_limit}`,
                                        t.result_unit,
                                      ].filter(Boolean).join(' · ')}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      onClick={() => setEditingTest(t.id)}
                                      aria-label={`Edit ${t.description}`}
                                      className="p-2 min-h-[32px] min-w-[32px] rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-alt)]"
                                    >
                                      <Pencil className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={() => void run(
                                        t.is_active ? 'Test retired.' : 'Test brought back.',
                                        () => setScheduleActive(companyId, t.id, !t.is_active),
                                      )}
                                      disabled={busy}
                                      aria-label={t.is_active ? `Retire ${t.description}` : `Restore ${t.description}`}
                                      className="p-2 min-h-[32px] min-w-[32px] rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-alt)]"
                                    >
                                      {t.is_active
                                        ? <Archive className="w-4 h-4" />
                                        : <RotateCcw className="w-4 h-4" />}
                                    </button>
                                  </div>
                                </div>
                                {editingTest === t.id && (
                                  <div className="mt-2">
                                    <ScheduleForm
                                      zoneId={zone.id}
                                      initial={t}
                                      busy={busy}
                                      onCancel={() => setEditingTest(null)}
                                      onSave={(draft) => void run(
                                        'Test saved.',
                                        () => updateSchedule(companyId, t.id, draft),
                                      )}
                                    />
                                  </div>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}

                        {addingTestFor === zone.id ? (
                          <ScheduleForm
                            zoneId={zone.id}
                            busy={busy}
                            onCancel={() => setAddingTestFor(null)}
                            onSave={(draft) => void run(
                              'Test added.',
                              () => createSchedule(companyId, draft),
                            )}
                          />
                        ) : (
                          <button
                            onClick={() => setAddingTestFor(zone.id)}
                            className="flex items-center gap-1.5 text-sm text-[var(--color-accent)] min-h-[32px]"
                          >
                            <Plus className="w-4 h-4" /> Add a scheduled test
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {zones.some((z) => !z.is_active) && (
            <button
              onClick={() => setShowRetired((v) => !v)}
              className="text-sm underline text-[var(--color-text-secondary)] min-h-[32px]"
            >
              {showRetired ? 'Hide retired zones' : 'Show retired zones'}
            </button>
          )}
        </>
      )}
    </div>
  );
}
