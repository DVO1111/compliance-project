/**
 * DV-08 — the closure signature dialog.
 *
 * A deliberately separate component from ElectronicSignatureModal,
 * which signs a record and hands the id back for a caller to do
 * something with. Closure is one act: the signature and the transition
 * belong together, the comment is required by the transition rather
 * than optional, and the undertaking has to name what closing does.
 * Bending the general modal to carry a required comment and a
 * closure-specific undertaking would make it worse at its own job.
 *
 * All of the rules are in lib/deviations/closure.ts. This collects
 * three fields and reports what came back.
 */

import { useState } from 'react';
import { Lock, X, Loader2, AlertTriangle } from 'lucide-react';
import {
  CLOSURE_MEANINGS, CLOSURE_MEANING_LABEL, emptyClosureForm, checkClosureForm,
  canSubmitClosure, closeButtonLabel, closureUndertaking,
  type ClosureForm, type ClosureMeaning,
} from '../../lib/deviations/closure';

export interface ClosureSignatureDialogProps {
  open: boolean;
  deviationNumber: string;
  /** Shown above the form when the readiness checklist still has
   *  blocking conditions. The dialog does not decide this. */
  blockedBy?: string | null;
  saving: boolean;
  /** Set when a signature succeeded and the transition did not, which
   *  is a different message from a plain refusal. */
  error?: string | null;
  onClose: () => void;
  onSubmit: (form: ClosureForm) => void;
}

export default function ClosureSignatureDialog(p: ClosureSignatureDialogProps) {
  const [form, setForm] = useState<ClosureForm>(emptyClosureForm);
  const [attempted, setAttempted] = useState(false);

  if (!p.open) return null;

  const problems = checkClosureForm(form);
  const problemFor = (field: 'comment' | 'password') =>
    (attempted ? problems.find((x) => x.field === field)?.message : undefined);

  const submit = () => {
    setAttempted(true);
    if (!canSubmitClosure(form)) return;
    p.onSubmit(form);
  };

  return (
    <div style={scrim} role="presentation">
      <div style={sheet} role="dialog" aria-modal="true" aria-labelledby="close-dev-heading">
        <header style={head}>
          <span style={mark}><Lock size={18} strokeWidth={2.5} aria-hidden /></span>
          <h2 id="close-dev-heading" style={{ margin: 0, fontSize: 17, flex: 1, minWidth: 0 }}>
            Close {p.deviationNumber}
          </h2>
          <button type="button" style={iconBtn} onClick={p.onClose} aria-label="Cancel">
            <X size={18} strokeWidth={2.5} aria-hidden />
          </button>
        </header>

        {p.blockedBy && (
          <p style={blocked} role="alert">
            <AlertTriangle size={16} strokeWidth={2.5} aria-hidden />
            <span>{p.blockedBy}</span>
          </p>
        )}

        {/*  The undertaking, before the fields. A signature block that
            opens with a password box is collecting a password; one that
            opens with what signing commits to is taking a signature. */}
        <p style={undertaking}>{closureUndertaking(p.deviationNumber, form.meaning)}</p>

        <fieldset style={fieldset}>
          <legend style={legend}>What your signature means</legend>
          {CLOSURE_MEANINGS.map((m: ClosureMeaning) => (
            <label key={m} style={radioRow}>
              <input
                type="radio"
                name="closure-meaning"
                value={m}
                checked={form.meaning === m}
                onChange={() => setForm({ ...form, meaning: m })}
                style={{ marginTop: 3 }}
              />
              <span style={{ fontSize: 14, lineHeight: '21px' }}>
                {CLOSURE_MEANING_LABEL[m]}
              </span>
            </label>
          ))}
        </fieldset>

        <label style={field}>
          <span style={label}>Closure comment</span>
          <textarea
            value={form.comment}
            onChange={(e) => setForm({ ...form, comment: e.target.value })}
            rows={3}
            style={{ ...input, resize: 'vertical', ...(problemFor('comment') ? bad : {}) }}
            aria-invalid={problemFor('comment') !== undefined}
          />
          <span style={hint}>
            Part of the permanent record. Why this deviation closed, not that it did.
          </span>
          {problemFor('comment') && <span style={errText}>{problemFor('comment')}</span>}
        </label>

        <label style={field}>
          <span style={label}>Your password</span>
          <input
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            autoComplete="current-password"
            style={{ ...input, ...(problemFor('password') ? bad : {}) }}
            aria-invalid={problemFor('password') !== undefined}
          />
          {problemFor('password') && <span style={errText}>{problemFor('password')}</span>}
        </label>

        {p.error && <p style={errBox} role="alert">{p.error}</p>}

        <footer style={foot}>
          <button type="button" style={ghost} onClick={p.onClose} disabled={p.saving}>
            Cancel
          </button>
          <button
            type="button"
            style={{ ...primary, ...(p.saving ? { opacity: 0.7 } : {}) }}
            onClick={submit}
            disabled={p.saving}
          >
            {p.saving && <Loader2 size={15} strokeWidth={2.5} style={spin} aria-hidden />}
            {closeButtonLabel(p.saving)}
          </button>
        </footer>
      </div>
    </div>
  );
}

const scrim: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(16,18,22,0.55)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 16, zIndex: 60,
};
const sheet: React.CSSProperties = {
  background: '#fff', borderRadius: 14, padding: 20, width: '100%', maxWidth: 520,
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
const blocked: React.CSSProperties = {
  margin: 0, display: 'flex', gap: 9, alignItems: 'flex-start',
  fontSize: 14, lineHeight: '21px',
  background: '#fdf2f2', color: '#8a2020', borderRadius: 10, padding: '11px 13px',
};
const fieldset: React.CSSProperties = {
  border: '1px solid #e3e6eb', borderRadius: 10, padding: '10px 13px 13px',
  display: 'flex', flexDirection: 'column', gap: 8, margin: 0, minWidth: 0,
};
const legend: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, letterSpacing: '0.04em',
  textTransform: 'uppercase', color: '#5b6472', padding: '0 4px',
};
const radioRow: React.CSSProperties = {
  display: 'flex', gap: 9, alignItems: 'flex-start', cursor: 'pointer', minWidth: 0,
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
  margin: 0, fontSize: 14, lineHeight: '21px',
  background: '#fdf2f2', color: '#8a2020', borderRadius: 10, padding: '11px 13px',
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
