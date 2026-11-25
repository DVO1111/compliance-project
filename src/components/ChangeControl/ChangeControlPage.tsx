import { useState, useEffect } from 'react';
import { GitMerge, Plus, X, ChevronRight, AlertTriangle, CheckCircle2, Clock, PenLine, History } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import {
  listChangeControls,
  createChangeControl,
  transitionChangeControl,
  approveChangeControl,
  getChangeControlActions,
  ChangeControl,
  ChangeControlStatus,
  ChangeType,
  ChangeCategory,
  CC_STATUS_LABELS,
  CC_STATUS_COLORS,
  CHANGE_TYPE_LABELS,
} from '../../lib/pharma/changeControlService';
import type { ChangeControlTransitionInput } from '../../lib/pharma/changeControlService';
import { getHistory } from '../../lib/lifecycleService';
import type { LifecycleAction, LifecycleHistoryEntry } from '../../lib/lifecycleService';

const WORKFLOW_STEPS: ChangeControlStatus[] = [
  'draft', 'impact_assessment', 'pending_approval', 'approved', 'implementing', 'verification', 'closed',
];

/**
 * The evidence each stage has to produce before the record may claim it.
 *
 * These mirror the database rule in
 * 20261125070847_change_control_requires_evidence.sql, which refuses the
 * state entry outright. They are NOT the gate — the gate is in the
 * database, where it cannot be skipped by anything that can reach the
 * API. What they do is ask for the thing in the form, so that the person
 * finds out here rather than from a refusal.
 *
 * Keyed by the state being ENTERED, because that is the moment the claim
 * is made and the moment the database checks it.
 */
const STAGE_EVIDENCE: Partial<Record<ChangeControlStatus, {
  field: 'impactAssessment' | 'implementationSummary' | 'verificationSummary';
  column: 'impact_assessment' | 'implementation_summary' | 'verification_summary';
  label: string;
  help: string;
  placeholder: string;
}>> = {
  pending_approval: {
    field: 'impactAssessment',
    column: 'impact_assessment',
    label: 'Impact Assessment',
    help: 'Required before this change can be submitted for approval.',
    placeholder: 'What does this change affect — product quality, validated state, registered details, other SOPs, training? What risks did you consider, and what is the conclusion?',
  },
  verification: {
    field: 'implementationSummary',
    column: 'implementation_summary',
    label: 'Implementation Summary',
    help: 'Required before this change can move to verification.',
    placeholder: 'What was actually done, when, and by whom? Reference the documents revised, equipment changed, or training delivered.',
  },
  closed: {
    field: 'verificationSummary',
    column: 'verification_summary',
    label: 'Verification Evidence',
    help: 'Required before this change can be closed.',
    placeholder: 'How was it confirmed that the change works and is effective? Reference the batches, checks, or records that demonstrate it.',
  },
};

function ChangeControlModal({ companyId, userId, onClose, onSuccess }: {
  companyId: string; userId: string; onClose: () => void; onSuccess: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: '',
    description: '',
    change_type: 'process' as ChangeType,
    change_category: 'minor' as ChangeCategory,
    regulatory_impact: false,
    validation_required: false,
  });

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title) { setError('Title is required.'); return; }
    setLoading(true);
    setError(null);
    try {
      await createChangeControl(companyId, userId, form);
      onSuccess();
    } catch (e: any) {
      setError(e.message || 'Failed to create change control');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="dash-card border dash-border rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b dash-border">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[var(--color-accent-soft)]">
              <GitMerge size={20} className="text-[var(--color-accent)]" />
            </div>
            <h2 className="text-lg font-bold dash-text">New Change Control</h2>
          </div>
          <button onClick={onClose} className="dash-text-tertiary hover:dash-text-primary"><X size={22} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="p-3 rounded-xl bg-[var(--color-danger-soft)] text-[var(--color-danger)] text-sm border border-[var(--color-danger-border)]">{error}</div>}

          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary block mb-1">Title *</label>
            <input value={form.title} onChange={e => set('title', e.target.value)} required placeholder="e.g. Update cleaning procedure for Tank B"
              className="w-full bg-[var(--color-surface)] border dash-border rounded-xl px-3 py-2 text-sm dash-text focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]" />
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary block mb-1">Description</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={3} placeholder="Describe the proposed change and its rationale..."
              className="w-full bg-[var(--color-surface)] border dash-border rounded-xl px-3 py-2 text-sm dash-text focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] resize-none" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary block mb-1">Change Type</label>
              <select value={form.change_type} onChange={e => set('change_type', e.target.value)}
                className="w-full bg-[var(--color-surface)] border dash-border rounded-xl px-3 py-2 text-sm dash-text focus:outline-none">
                {(Object.entries(CHANGE_TYPE_LABELS) as [ChangeType, string][]).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary block mb-1">Category</label>
              <select value={form.change_category} onChange={e => set('change_category', e.target.value)}
                className="w-full bg-[var(--color-surface)] border dash-border rounded-xl px-3 py-2 text-sm dash-text focus:outline-none">
                <option value="minor">Minor</option>
                <option value="major">Major</option>
                <option value="emergency">Emergency</option>
              </select>
            </div>
          </div>

          <div className="flex gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.regulatory_impact} onChange={e => set('regulatory_impact', e.target.checked)}
                className="rounded border-[var(--color-border)]" />
              <span className="text-sm dash-text">Regulatory Impact</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.validation_required} onChange={e => set('validation_required', e.target.checked)}
                className="rounded border-[var(--color-border)]" />
              <span className="text-sm dash-text">Validation Required</span>
            </label>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl border dash-border dash-text font-semibold hover:dash-surface-alt transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 px-4 py-2.5 rounded-xl text-white font-semibold hover:opacity-90 disabled:opacity-50 transition-all shadow-md"
              style={{ background: 'var(--color-accent)' }}>
              {loading ? 'Creating...' : 'Create Change Control'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Where a stage is actually completed.
 *
 * This screen exists because advancing used to be a single click that
 * sent nothing: the record moved and no one could afterwards say what
 * had been done. Now every move carries a comment, the three evidence
 * stages carry their evidence, and approval carries a signature.
 *
 * Nothing here is the control. The database refuses the move without
 * these, so a caller that skips this form is refused too; this is the
 * form asking for what the record needs, in the place where the person
 * is standing.
 */
function StageActionModal({ cc, action, companyId, userId, onClose, onDone }: {
  cc: ChangeControl;
  action: LifecycleAction;
  companyId: string;
  userId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const target = action.to_state_key as ChangeControlStatus;
  const evidence = STAGE_EVIDENCE[target];
  const isRejection = target === 'rejected';

  const [comment, setComment] = useState('');
  const [evidenceText, setEvidenceText] = useState<string>(
    evidence ? ((cc as any)[evidence.column] as string | null) ?? '' : '',
  );
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const commentLabel = isRejection ? 'Reason for rejection' : 'What was done at this stage';
  const needsSignature = action.requires_signature;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!comment.trim()) { setError(`${commentLabel} is required.`); return; }
    if (evidence && !evidenceText.trim()) { setError(`${evidence.label} is required before this step.`); return; }
    if (needsSignature && !password) { setError('Enter your password to sign this approval.'); return; }

    setBusy(true);
    try {
      if (needsSignature) {
        await approveChangeControl(cc.id, companyId, password, comment.trim());
      } else {
        //  Built by hand rather than with a computed key, so the field
        //  names are literal and the shape is checked. `{ [x.field]: v }`
        //  with a union-typed key widens to an index signature, which is
        //  exactly the kind of thing that compiles today and silently
        //  sends the wrong property after a rename.
        const extra: ChangeControlTransitionInput = { comment: comment.trim() };
        if (isRejection) extra.rejectedReason = comment.trim();
        if (evidence?.field === 'impactAssessment') extra.impactAssessment = evidenceText.trim();
        if (evidence?.field === 'implementationSummary') extra.implementationSummary = evidenceText.trim();
        if (evidence?.field === 'verificationSummary') extra.verificationSummary = evidenceText.trim();

        await transitionChangeControl(cc.id, companyId, userId, target, extra);
      }
      onDone();
    } catch (err: any) {
      setError(err?.message ?? 'The step could not be completed.');
    } finally {
      //  The password never outlives the attempt, successful or not.
      setPassword('');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dash-card border dash-border rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b dash-border flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[var(--color-accent-soft)]">
              {needsSignature
                ? <PenLine size={20} className="text-[var(--color-accent)]" />
                : <ChevronRight size={20} className="text-[var(--color-accent)]" />}
            </div>
            <div>
              <h2 className="text-lg font-bold dash-text">{action.label}</h2>
              <p className="text-xs dash-text-tertiary">
                {cc.change_number} &middot; {CC_STATUS_LABELS[cc.status]} &rarr; {CC_STATUS_LABELS[target] ?? target}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="dash-text-tertiary hover:dash-text-primary"><X size={22} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          {error && (
            <div className="p-3 rounded-xl bg-[var(--color-danger-soft)] text-[var(--color-danger)] text-sm border border-[var(--color-danger-border)]">
              {error}
            </div>
          )}

          {evidence && (
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary block mb-1">
                {evidence.label} *
              </label>
              <p className="text-xs dash-text-secondary mb-2">{evidence.help}</p>
              <textarea
                value={evidenceText}
                onChange={e => setEvidenceText(e.target.value)}
                rows={5}
                required
                placeholder={evidence.placeholder}
                className="w-full bg-[var(--color-surface)] border dash-border rounded-xl px-3 py-2 text-sm dash-text focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] resize-y"
              />
            </div>
          )}

          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary block mb-1">
              {commentLabel} *
            </label>
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              rows={3}
              required
              placeholder={isRejection
                ? 'Why is this change not being accepted?'
                : 'This is recorded against the step, with your name and the time, and cannot be edited afterwards.'}
              className="w-full bg-[var(--color-surface)] border dash-border rounded-xl px-3 py-2 text-sm dash-text focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] resize-y"
            />
          </div>

          {needsSignature && (
            <div className="p-4 rounded-xl border border-[var(--color-accent-border,var(--color-border))] bg-[var(--color-accent-soft)] space-y-3">
              <div className="flex items-start gap-2">
                <PenLine size={16} className="text-[var(--color-accent)] mt-0.5 flex-shrink-0" />
                <p className="text-xs dash-text">
                  Approving is an electronic signature. It records that <strong>you</strong> approved this change,
                  at this time, over this record as it now stands. Re-enter your password to sign.
                </p>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary block mb-1">Password *</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="w-full bg-[var(--color-surface)] border dash-border rounded-xl px-3 py-2 text-sm dash-text focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                />
              </div>
              {cc.created_by && cc.created_by === userId && (
                <div className="flex items-start gap-2 text-xs" style={{ color: 'var(--color-warning, #b45309)' }}>
                  <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                  <span>
                    You raised this change. Approving your own change is recorded as such and is a common
                    audit finding — where a second person is available, they should approve it.
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl border dash-border dash-text font-semibold hover:dash-surface-alt transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={busy}
              className="flex-1 px-4 py-2.5 rounded-xl text-white font-semibold hover:opacity-90 disabled:opacity-50 transition-all shadow-md"
              style={{ background: isRejection ? 'var(--color-danger, #dc2626)' : 'var(--color-accent)' }}>
              {busy ? 'Recording...' : needsSignature ? 'Sign and Approve' : action.label}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DetailModal({ cc, companyId, userId, onClose, onAction }: {
  cc: ChangeControl;
  companyId: string;
  userId: string;
  onClose: () => void;
  onAction: () => void;
}) {
  const [actions, setActions] = useState<LifecycleAction[] | null>(null);
  const [history, setHistory] = useState<LifecycleHistoryEntry[]>([]);
  const [pending, setPending] = useState<LifecycleAction | null>(null);

  useEffect(() => {
    let live = true;
    //  The buttons come from the engine, not from a map in this file. A
    //  hardcoded NEXT_STATUS was how this screen offered a move the
    //  database would never have allowed, and it is why a stage looked
    //  completable by clicking.
    getChangeControlActions(cc.id, companyId)
      .then(a => { if (live) setActions(a); })
      .catch(() => { if (live) setActions([]); });

    //  getHistory resolves to the rows themselves, NOT a LifecycleResult.
    //  Written as `r.ok ? r.data` first time round, which is the shape
    //  `transition` returns — it type-checks nowhere and fails silently
    //  everywhere: the panel would simply have stayed empty, which on a
    //  screen whose whole purpose is showing what happened is the worst
    //  possible way to be wrong.
    getHistory('change_control', cc.id, companyId)
      .then(rows => { if (live) setHistory(rows); })
      .catch(() => { /* history is context, not a blocker */ });

    return () => { live = false; };
  }, [cc.id, companyId]);

  const selfApproved = Boolean(cc.approved_by && cc.created_by && cc.approved_by === cc.created_by);
  const recordBlock = actions?.find(a => a.blocked_reason)?.blocked_reason ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dash-card border dash-border rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b dash-border flex-shrink-0">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-[var(--color-accent-soft)] flex-shrink-0 mt-0.5">
              <GitMerge size={20} className="text-[var(--color-accent)]" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold dash-text-tertiary">{cc.change_number}</span>
                <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${CC_STATUS_COLORS[cc.status]}`}>
                  {CC_STATUS_LABELS[cc.status]}
                </span>
                {cc.regulatory_impact && (
                  <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border text-red-600 bg-red-50 border-red-200">
                    Regulatory
                  </span>
                )}
                {cc.validation_required && (
                  <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border text-purple-600 bg-purple-50 border-purple-200">
                    Validation Req.
                  </span>
                )}
              </div>
              <p className="font-bold dash-text text-base mt-1">{cc.title}</p>
              <p className="text-xs dash-text-tertiary mt-0.5">
                {CHANGE_TYPE_LABELS[cc.change_type]} &middot; {cc.change_category} change &middot; Created {new Date(cc.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="dash-text-tertiary hover:dash-text-primary flex-shrink-0 ml-4"><X size={22} /></button>
        </div>

        {/* Body — scrollable */}
        <div className="overflow-y-auto flex-1 p-6 space-y-5">

          {cc.description && (
            <section>
              <p className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary mb-2">Description</p>
              <p className="text-sm dash-text leading-relaxed whitespace-pre-wrap">{cc.description}</p>
            </section>
          )}

          {/* The three evidence sections. Shown as "not yet recorded"
              rather than hidden, so the record reads as incomplete
              instead of reading as though the stage had nothing to say. */}
          {([
            ['Impact Assessment', cc.impact_assessment],
            ['Implementation Summary', cc.implementation_summary],
            ['Verification Evidence', cc.verification_summary],
          ] as [string, string | null][]).map(([label, value]) => (
            <section key={label}>
              <p className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary mb-2">{label}</p>
              {value ? (
                <div className="p-4 rounded-xl bg-[var(--color-surface-alt)] border dash-border">
                  <p className="text-sm dash-text leading-relaxed whitespace-pre-wrap">{value}</p>
                </div>
              ) : (
                <p className="text-sm dash-text-tertiary italic">Not yet recorded.</p>
              )}
            </section>
          ))}

          {selfApproved && (
            <div className="flex items-start gap-2 p-3 rounded-xl border text-xs"
              style={{ borderColor: 'var(--color-warning-border, #fcd34d)', background: 'var(--color-warning-soft, #fffbeb)', color: 'var(--color-warning-text, #92400e)' }}>
              <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
              <span>
                This change was approved by the person who raised it. The approval is signed and valid,
                but segregation of duties is a common audit expectation.
              </span>
            </div>
          )}

          {/* Flags row */}
          <section className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              {cc.regulatory_impact
                ? <AlertTriangle size={16} className="text-red-500" />
                : <CheckCircle2 size={16} className="text-green-500" />}
              <span className="text-sm dash-text">
                {cc.regulatory_impact ? 'Regulatory notification required' : 'No regulatory notification'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {cc.validation_required
                ? <Clock size={16} className="text-purple-500" />
                : <CheckCircle2 size={16} className="text-green-500" />}
              <span className="text-sm dash-text">
                {cc.validation_required ? 'Validation required' : 'No validation required'}
              </span>
            </div>
          </section>

          {/* Workflow progress */}
          {cc.status !== 'rejected' && (
            <section>
              <p className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary mb-3">Workflow Progress</p>
              <div className="flex gap-1">
                {WORKFLOW_STEPS.map((step, i) => {
                  const stepIdx = WORKFLOW_STEPS.indexOf(cc.status);
                  const done = i <= stepIdx;
                  return (
                    <div key={step} className="flex-1">
                      <div className={`h-1.5 rounded-full transition-colors ${done ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-border)]'}`} />
                      <p className={`text-[9px] mt-1 font-bold uppercase tracking-widest truncate ${done ? 'text-[var(--color-accent)]' : 'dash-text-tertiary'}`}>
                        {CC_STATUS_LABELS[step]}
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* What actually happened. The answer to "no evidence of
              actual activity": every recorded step, who made it and what
              they said about it. */}
          <section>
            <p className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary mb-3 flex items-center gap-1.5">
              <History size={12} /> Stage History
            </p>
            {history.length === 0 ? (
              <p className="text-sm dash-text-tertiary italic">No recorded steps yet.</p>
            ) : (
              <ol className="space-y-3">
                {history.map(h => (
                  <li key={h.id} className="flex gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] mt-1.5 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm dash-text">
                        <span className="font-semibold">
                          {h.from_state_key ? `${CC_STATUS_LABELS[h.from_state_key as ChangeControlStatus] ?? h.from_state_key} → ` : ''}
                          {CC_STATUS_LABELS[h.to_state_key as ChangeControlStatus] ?? h.to_state_key}
                        </span>
                        <span className="dash-text-tertiary"> · {new Date(h.created_at).toLocaleString()}</span>
                      </p>
                      {h.comment && <p className="text-sm dash-text-secondary mt-0.5 whitespace-pre-wrap">{h.comment}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        {/* Footer actions — driven by the engine */}
        <div className="p-6 border-t dash-border flex-shrink-0">
          {actions === null ? (
            <p className="text-sm dash-text-tertiary">Loading available steps…</p>
          ) : actions.length === 0 ? (
            <p className="text-sm dash-text-tertiary">
              {['closed', 'rejected'].includes(cc.status)
                ? 'This change is closed. No further steps are available.'
                : 'No steps are available to you on this record.'}
            </p>
          ) : (
            <>
              {recordBlock && (
                <p className="text-xs dash-text-tertiary mb-3">{recordBlock}</p>
              )}
              <div className="flex flex-wrap gap-2 justify-end">
                {actions.slice().sort((a, b) => a.sort_order - b.sort_order).map(a => {
                  const reject = a.to_state_key === 'rejected';
                  return (
                    <button
                      key={`${a.action_key}:${a.to_state_key}`}
                      disabled={!a.is_permitted}
                      title={a.blocked_reason ?? undefined}
                      onClick={() => setPending(a)}
                      className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-40 ${
                        reject
                          ? 'text-red-600 border border-red-200 bg-red-50 hover:bg-red-100'
                          : 'text-white shadow-md hover:opacity-90'
                      }`}
                      style={reject ? undefined : { background: 'var(--color-accent)' }}>
                      {a.requires_signature && <PenLine size={13} />}
                      {a.label}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {pending && (
        <StageActionModal
          cc={cc}
          action={pending}
          companyId={companyId}
          userId={userId}
          onClose={() => setPending(null)}
          onDone={() => { setPending(null); onAction(); }}
        />
      )}
    </div>
  );
}

export default function ChangeControlPage() {
  const { user, profile } = useAuth();
  const companyId = (profile as any)?.company_id ?? '';
  const userId = user?.id ?? '';

  const [records, setRecords] = useState<ChangeControl[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedCC, setSelectedCC] = useState<ChangeControl | null>(null);

  const load = async () => {
    setLoading(true);
    const data = await listChangeControls(companyId);
    setRecords(data);
    setLoading(false);
  };

  useEffect(() => { if (companyId) load(); }, [companyId]);

  const openCount = records.filter(r => !['closed', 'rejected'].includes(r.status)).length;
  const pendingApproval = records.filter(r => r.status === 'pending_approval').length;
  const closedCount = records.filter(r => r.status === 'closed').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold dash-text">Change Control</h1>
          <p className="text-sm dash-text-secondary mt-0.5">Track changes to SOPs, formulations, equipment, and processes through formal approval workflows.</p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold shadow-md hover:opacity-90 transition-all"
          style={{ background: 'var(--color-accent)' }}>
          <Plus size={16} /> New Change Control
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Open', value: openCount, color: 'text-blue-600' },
          { label: 'Pending Approval', value: pendingApproval, color: 'text-amber-600' },
          { label: 'Closed', value: closedCount, color: 'text-green-600' },
        ].map(s => (
          <div key={s.label} className="dash-card border dash-border rounded-2xl p-5 shadow-sm">
            <p className="text-xs dash-text-tertiary uppercase tracking-widest font-bold mb-2">{s.label}</p>
            <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 rounded-full border-2 border-[var(--color-accent)] border-t-transparent animate-spin" />
        </div>
      ) : records.length === 0 ? (
        <div className="dash-card border dash-border rounded-2xl p-12 text-center shadow-sm">
          <GitMerge size={40} className="mx-auto dash-text-tertiary mb-4" />
          <p className="dash-text font-semibold">No change controls yet</p>
          <p className="text-sm dash-text-secondary mt-1">Create your first change control request to begin the approval workflow.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {records.map(cc => (
            <div
              key={cc.id}
              onClick={() => setSelectedCC(cc)}
              className="dash-card border dash-border rounded-2xl p-5 shadow-sm cursor-pointer hover:border-[var(--color-accent)] transition-colors group"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="p-2 rounded-xl bg-[var(--color-accent-soft)] flex-shrink-0">
                    <GitMerge size={18} className="text-[var(--color-accent)]" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold dash-text-tertiary">{cc.change_number}</span>
                      <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${CC_STATUS_COLORS[cc.status]}`}>
                        {CC_STATUS_LABELS[cc.status]}
                      </span>
                      {cc.regulatory_impact && (
                        <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border text-red-600 bg-red-50 border-red-200">
                          Regulatory
                        </span>
                      )}
                    </div>
                    <p className="font-semibold dash-text mt-1">{cc.title}</p>
                    <p className="text-xs dash-text-tertiary mt-0.5">
                      {CHANGE_TYPE_LABELS[cc.change_type]} &middot; {cc.change_category} change &middot; {new Date(cc.created_at).toLocaleDateString()}
                    </p>
                    {cc.description && (
                      <p className="text-xs dash-text-secondary mt-1.5 line-clamp-1 italic">
                        {cc.description}
                      </p>
                    )}
                  </div>
                </div>

                {/*  NO ADVANCE BUTTON HERE, deliberately.
                    A one-click "next stage" on the list was the thing UAT
                    reported: it moved the record from a card, without
                    opening it, without asking for anything, and left
                    nothing behind that said what had been done. Every
                    step is now taken inside the record, where the
                    evidence for it is collected. */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs dash-text-tertiary group-hover:text-[var(--color-accent)] transition-colors">Open</span>
                  <ChevronRight size={16} className="dash-text-tertiary group-hover:text-[var(--color-accent)] transition-colors" />
                </div>
              </div>

              {/* Progress bar */}
              {cc.status !== 'rejected' && (
                <div className="mt-4 flex gap-1">
                  {WORKFLOW_STEPS.map((step, i) => {
                    const stepIdx = WORKFLOW_STEPS.indexOf(cc.status);
                    const done = i <= stepIdx;
                    return (
                      <div key={step} className="flex-1">
                        <div className={`h-1 rounded-full transition-colors ${done ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-border)]'}`} />
                        <p className={`text-[9px] mt-1 font-bold uppercase tracking-widest truncate ${done ? 'text-[var(--color-accent)]' : 'dash-text-tertiary'}`}>
                          {CC_STATUS_LABELS[step]}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <ChangeControlModal
          companyId={companyId}
          userId={userId}
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); load(); }}
        />
      )}

      {selectedCC && (
        <DetailModal
          cc={selectedCC}
          companyId={companyId}
          userId={userId}
          onClose={() => setSelectedCC(null)}
          onAction={() => { setSelectedCC(null); load(); }}
        />
      )}
    </div>
  );
}
