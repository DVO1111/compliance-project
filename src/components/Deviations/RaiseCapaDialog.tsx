/**
 * Where a CAPA is actually written.
 *
 * "Raise a CAPA from this deviation" used to be one button that created
 * the record and ticked the deviation's checklist. UAT found it from
 * the other end: "it just changes the status to a CAPA has been raised
 * without actually allowing me to write the CAPA, add responsibility
 * and timeline."
 *
 * All of the rules are in lib/deviations/capaForm.ts. This collects the
 * fields and reports what came back, the same division ClosureSignature
 * Dialog uses.
 */

import { useState } from 'react';
import { ClipboardList, X, Loader2, AlertTriangle } from 'lucide-react';
import {
  CAPA_TYPES, CAPA_TYPE_LABEL, CAPA_PRIORITIES, CAPA_PRIORITY_LABEL,
  emptyCapaForm, checkCapaForm, canSubmitCapa,
  type CapaForm, type CapaType, type CapaPriority,
} from '../../lib/deviations/capaForm';

export interface RaiseCapaDialogProps {
  open: boolean;
  deviation: { deviationNumber: string; title: string; severity: string };
  /** Workspace members, for naming who is responsible. */
  people: { id: string; label: string }[];
  saving: boolean;
  error?: string | null;
  onCancel: () => void;
  onSubmit: (form: CapaForm) => void;
}

export default function RaiseCapaDialog(p: RaiseCapaDialogProps) {
  const [form, setForm] = useState<CapaForm>(() => emptyCapaForm(p.deviation));
  const [touched, setTouched] = useState(false);

  if (!p.open) return null;

  //  Local date, not toISOString(): that is UTC, and somebody in Lagos
  //  choosing "today" late in the evening would be told their date is
  //  in the past.
  const today = new Date().toLocaleDateString('en-CA');
  const errors = checkCapaForm(form, today);
  const show = (k: keyof typeof errors) => (touched ? errors[k] : undefined);
  const set = <K extends keyof CapaForm>(k: K, v: CapaForm[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const submit = () => {
    setTouched(true);
    if (!canSubmitCapa(form, today)) return;
    p.onSubmit(form);
  };

  return (
    <div style={overlay} role="dialog" aria-modal="true" aria-label="Raise a CAPA">
      <div style={sheet}>
        <div style={head}>
          <span style={mark}><ClipboardList size={17} aria-hidden /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontWeight: 700, color: '#1f2430' }}>Raise a CAPA</p>
            <p style={{ margin: 0, fontSize: 13, color: '#5b6472' }}>
              From {p.deviation.deviationNumber}
            </p>
          </div>
          <button type="button" style={iconBtn} onClick={p.onCancel} aria-label="Cancel">
            <X size={17} />
          </button>
        </div>

        <p style={undertaking}>
          This record is what the deviation's closure checklist counts. A CAPA with
          no action, nobody responsible and no date still ticks that box, so the
          three are asked for here.
        </p>

        {p.error && <p style={errBox}><AlertTriangle size={16} aria-hidden /> {p.error}</p>}

        <div style={field}>
          <label style={label} htmlFor="capa-title">Title</label>
          <input
            id="capa-title" style={{ ...input, ...(show('title') ? bad : null) }}
            value={form.title} onChange={e => set('title', e.target.value)}
          />
          {show('title') && <span style={errText}>{errors.title}</span>}
        </div>

        <div style={field}>
          <label style={label} htmlFor="capa-description">What will be done</label>
          <textarea
            id="capa-description" rows={5}
            style={{ ...input, ...(show('description') ? bad : null), resize: 'vertical' }}
            value={form.description}
            onChange={e => set('description', e.target.value)}
            placeholder="The corrective or preventive action itself — what changes, where, and how it will be confirmed."
          />
          <span style={hint}>
            Added under the deviation reference, which is recorded automatically.
          </span>
          {show('description') && <span style={errText}>{errors.description}</span>}
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ ...field, flex: '1 1 180px' }}>
            <label style={label} htmlFor="capa-owner">Responsible</label>
            <select
              id="capa-owner" style={{ ...input, ...(show('ownerId') ? bad : null) }}
              value={form.ownerId} onChange={e => set('ownerId', e.target.value)}
            >
              <option value="">Choose a member…</option>
              {p.people.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
            {show('ownerId') && <span style={errText}>{errors.ownerId}</span>}
          </div>

          <div style={{ ...field, flex: '1 1 160px' }}>
            <label style={label} htmlFor="capa-due">Due</label>
            <input
              id="capa-due" type="date" min={today}
              style={{ ...input, ...(show('dueDate') ? bad : null) }}
              value={form.dueDate} onChange={e => set('dueDate', e.target.value)}
            />
            {show('dueDate') && <span style={errText}>{errors.dueDate}</span>}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ ...field, flex: '1 1 180px' }}>
            <label style={label} htmlFor="capa-type">Type</label>
            <select id="capa-type" style={input} value={form.capaType}
              onChange={e => set('capaType', e.target.value as CapaType)}>
              {CAPA_TYPES.map(t => <option key={t} value={t}>{CAPA_TYPE_LABEL[t]}</option>)}
            </select>
          </div>

          <div style={{ ...field, flex: '1 1 140px' }}>
            <label style={label} htmlFor="capa-priority">Priority</label>
            <select id="capa-priority" style={input} value={form.priority}
              onChange={e => set('priority', e.target.value as CapaPriority)}>
              {CAPA_PRIORITIES.map(v => <option key={v} value={v}>{CAPA_PRIORITY_LABEL[v]}</option>)}
            </select>
            {/*  Carried from the deviation's severity, so a critical
                deviation does not quietly become a medium CAPA. */}
            <span style={hint}>Set from the deviation's severity. Change it deliberately.</span>
          </div>
        </div>

        <label style={{ ...radioRow, alignItems: 'center' }}>
          <input type="checkbox" checked={form.isSystemic}
            onChange={e => set('isSystemic', e.target.checked)} />
          <span style={{ fontSize: 14, color: '#2b3038' }}>
            This is a systemic issue, not a one-off
          </span>
        </label>

        <div style={foot}>
          <button type="button" style={ghost} onClick={p.onCancel} disabled={p.saving}>
            Cancel
          </button>
          <button type="button" style={primary} onClick={submit} disabled={p.saving}>
            {p.saving && <Loader2 size={15} style={spin} aria-hidden />}
            {p.saving ? 'Raising…' : 'Raise CAPA'}
          </button>
        </div>
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(16,18,22,0.45)',
  display: 'grid', placeItems: 'center', padding: 16, zIndex: 60,
};
const sheet: React.CSSProperties = {
  background: '#fff', borderRadius: 14, padding: 20, width: '100%', maxWidth: 560,
  maxHeight: '90vh', overflowY: 'auto',
  display: 'flex', flexDirection: 'column', gap: 14,
  boxShadow: '0 18px 48px rgba(16,18,22,0.22)',
};
const head: React.CSSProperties = { display: 'flex', gap: 10, alignItems: 'center' };
const mark: React.CSSProperties = {
  width: 32, height: 32, borderRadius: 9, background: '#eef1f6',
  display: 'grid', placeItems: 'center', color: '#3c4350',
};
const iconBtn: React.CSSProperties = {
  border: 'none', background: 'transparent', cursor: 'pointer', padding: 4,
  borderRadius: 7, color: '#5b6472',
};
const undertaking: React.CSSProperties = {
  margin: 0, fontSize: 14, lineHeight: '21px', color: '#2b3038',
  background: '#f6f7f9', borderRadius: 10, padding: '11px 13px',
};
const field: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0,
};
const label: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: '#2b3038' };
const input: React.CSSProperties = {
  border: '1px solid #d9dde4', borderRadius: 9, padding: '9px 11px',
  fontSize: 14, fontFamily: 'inherit', minWidth: 0, width: '100%', boxSizing: 'border-box',
};
const bad: React.CSSProperties = { borderColor: '#c23b3b' };
const hint: React.CSSProperties = { fontSize: 12.5, lineHeight: '18px', color: '#6b7380' };
const errText: React.CSSProperties = { fontSize: 12.5, lineHeight: '18px', color: '#a32626' };
const errBox: React.CSSProperties = {
  margin: 0, display: 'flex', gap: 9, alignItems: 'flex-start',
  fontSize: 14, lineHeight: '21px',
  background: '#fdf2f2', color: '#8a2020', borderRadius: 10, padding: '11px 13px',
};
const radioRow: React.CSSProperties = {
  display: 'flex', gap: 9, alignItems: 'flex-start', cursor: 'pointer', minWidth: 0,
};
const foot: React.CSSProperties = {
  display: 'flex', gap: 9, justifyContent: 'flex-end', flexWrap: 'wrap',
};
const ghost: React.CSSProperties = {
  border: '1px solid #d9dde4', background: '#fff', borderRadius: 9,
  padding: '9px 15px', fontSize: 14, fontWeight: 600, cursor: 'pointer', color: '#2b3038',
};
const primary: React.CSSProperties = {
  border: 'none', background: '#1f2430', color: '#fff', borderRadius: 9,
  padding: '9px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
  display: 'inline-flex', gap: 7, alignItems: 'center',
};
const spin: React.CSSProperties = { animation: 'spin 1s linear infinite' };
