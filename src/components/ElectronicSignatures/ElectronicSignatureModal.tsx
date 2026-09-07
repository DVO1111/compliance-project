import { useState } from 'react';
import { PenLine, X, Loader2, ShieldAlert } from 'lucide-react';
import {
  signElectronicRecord,
  SIGNATURE_MEANINGS,
  type SignatureMeaning,
} from '../../lib/electronicSignatureService';

type Props = {
  open: boolean;
  onClose: () => void;
  /** Receives the signature id, which the caller passes to the transition. */
  onSigned?: (signatureId: string) => void;
  companyId: string;
  entityType: string;
  entityId: string;
  action: string;
  title?: string;
  defaultMeaning?: SignatureMeaning;
  metadata?: Record<string, unknown>;
};

const MEANING_LABEL: Record<SignatureMeaning, string> = {
  authored: 'I authored this record',
  reviewed: 'I reviewed this record',
  approved: 'I approve this record',
  rejected: 'I reject this record',
  verified: 'I verified this record',
  witnessed: 'I witnessed this action',
  released: 'I release this record',
};

export default function ElectronicSignatureModal(props: Props) {
  const [meaning, setMeaning] = useState<SignatureMeaning>(props.defaultMeaning ?? 'approved');
  const [password, setPassword] = useState('');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!props.open) return null;

  const ready = confirmed && password.length > 0 && !saving;

  const submit = async () => {
    if (!ready) return;
    setSaving(true);
    setError('');

    const result = await signElectronicRecord({
      companyId: props.companyId,
      entityType: props.entityType,
      entityId: props.entityId,
      action: props.action,
      meaning,
      password,
      reason: reason || undefined,
      metadata: props.metadata,
    });

    // the password never outlives the attempt, successful or not
    setPassword('');
    setSaving(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }
    props.onSigned?.(result.signatureId);
    props.onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
      <div className="dash-surface w-full max-w-lg rounded-2xl shadow-2xl">
        <div className="dash-border flex items-center justify-between border-b p-5">
          <div className="flex items-center gap-3">
            <PenLine className="dash-accent h-5 w-5" />
            <div>
              <h2 className="dash-text font-semibold">{props.title ?? 'Electronic signature'}</h2>
              <p className="dash-text-secondary text-sm">
                Your name, the record’s current state and the time are recorded permanently.
              </p>
            </div>
          </div>
          <button onClick={props.onClose} aria-label="Close" className="dash-text-secondary">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div>
            <label htmlFor="esign-meaning" className="dash-text mb-1 block text-sm font-medium">
              Meaning of signature
            </label>
            <select
              id="esign-meaning"
              value={meaning}
              onChange={(e) => setMeaning(e.target.value as SignatureMeaning)}
              className="dash-input w-full rounded-lg p-3 text-sm"
            >
              {SIGNATURE_MEANINGS.map((m) => (
                <option key={m} value={m}>{MEANING_LABEL[m]}</option>
              ))}
            </select>
            <p className="dash-text-tertiary mt-1 text-xs">
              Recorded with the signature. The list is fixed so the record cannot say something
              other than what was done.
            </p>
          </div>

          <div>
            <label htmlFor="esign-reason" className="dash-text mb-1 block text-sm font-medium">
              Reason or comment <span className="dash-text-tertiary font-normal">(optional)</span>
            </label>
            <textarea
              id="esign-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className="dash-input w-full rounded-lg p-3 text-sm"
            />
          </div>

          {/* The credential challenge. Without this the signature attests
              only that a browser session existed. */}
          <div>
            <label htmlFor="esign-password" className="dash-text mb-1 block text-sm font-medium">
              Confirm your password
            </label>
            <input
              id="esign-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
              className="dash-input w-full rounded-lg p-3 text-sm"
            />
            <p className="dash-text-tertiary mt-1 text-xs">
              Re-entered each time you sign. Failed attempts are recorded.
            </p>
          </div>

          <label className="dash-surface-alt dash-text-secondary flex gap-3 rounded-lg p-3 text-sm">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              I intend this to be my electronic signature, and I understand it is recorded
              permanently against this record.
            </span>
          </label>

          {error && (
            <p className="dash-danger flex items-start gap-2 text-sm" role="alert">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </p>
          )}
        </div>

        <div className="dash-border flex justify-end gap-3 border-t p-5">
          <button onClick={props.onClose} disabled={saving} className="dash-border dash-text rounded-lg border px-4 py-2 text-sm">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!ready}
            className="flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Sign
          </button>
        </div>
      </div>
    </div>
  );
}
