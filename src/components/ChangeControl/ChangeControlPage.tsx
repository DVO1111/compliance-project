import { useState, useEffect } from 'react';
import { GitMerge, Plus, X, ChevronRight, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import {
  listChangeControls,
  createChangeControl,
  updateChangeControlStatus,
  ChangeControl,
  ChangeControlStatus,
  ChangeType,
  ChangeCategory,
  CC_STATUS_LABELS,
  CC_STATUS_COLORS,
  CHANGE_TYPE_LABELS,
} from '../../lib/pharma/changeControlService';

const WORKFLOW_STEPS: ChangeControlStatus[] = [
  'draft', 'impact_assessment', 'pending_approval', 'approved', 'implementing', 'verification', 'closed',
];

const NEXT_STATUS: Partial<Record<ChangeControlStatus, ChangeControlStatus>> = {
  draft: 'impact_assessment',
  impact_assessment: 'pending_approval',
  pending_approval: 'approved',
  approved: 'implementing',
  implementing: 'verification',
  verification: 'closed',
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

function DetailModal({ cc, companyId, userId, onClose, onAction }: {
  cc: ChangeControl;
  companyId: string;
  userId: string;
  onClose: () => void;
  onAction: () => void;
}) {
  const [actionLoading, setActionLoading] = useState(false);
  const next = NEXT_STATUS[cc.status];
  const canReject = ['impact_assessment', 'pending_approval', 'approved', 'implementing', 'verification'].includes(cc.status);

  const handleAdvance = async () => {
    if (!next) return;
    setActionLoading(true);
    try {
      await updateChangeControlStatus(cc.id, companyId, userId, next);
      onAction();
    } catch (e: any) { alert(e.message); }
    finally { setActionLoading(false); }
  };

  const handleReject = async () => {
    const reason = prompt('Rejection reason:');
    if (!reason) return;
    setActionLoading(true);
    try {
      await updateChangeControlStatus(cc.id, companyId, userId, 'rejected', { rejectedReason: reason });
      onAction();
    } catch (e: any) { alert(e.message); }
    finally { setActionLoading(false); }
  };

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

          {/* Description */}
          {cc.description && (
            <section>
              <p className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary mb-2">Description</p>
              <p className="text-sm dash-text leading-relaxed whitespace-pre-wrap">{cc.description}</p>
            </section>
          )}

          {/* Impact assessment */}
          {cc.impact_assessment && (
            <section>
              <p className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary mb-2">Impact Assessment</p>
              <div className="p-4 rounded-xl bg-[var(--color-surface-alt)] border dash-border">
                <p className="text-sm dash-text leading-relaxed whitespace-pre-wrap">{cc.impact_assessment}</p>
              </div>
            </section>
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
        </div>

        {/* Footer actions */}
        {!['closed', 'rejected'].includes(cc.status) && (next || canReject) && (
          <div className="flex gap-3 p-6 border-t dash-border flex-shrink-0">
            {canReject && (
              <button disabled={actionLoading} onClick={handleReject}
                className="px-4 py-2.5 rounded-xl text-red-600 text-sm font-semibold border border-red-200 bg-red-50 hover:bg-red-100 disabled:opacity-50 transition-all">
                Reject
              </button>
            )}
            {next && (
              <button disabled={actionLoading} onClick={handleAdvance}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-all ml-auto shadow-md"
                style={{ background: 'var(--color-accent)' }}>
                {actionLoading ? 'Updating...' : <><ChevronRight size={14} />Advance to {CC_STATUS_LABELS[next]}</>}
              </button>
            )}
          </div>
        )}
      </div>
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
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const data = await listChangeControls(companyId);
    setRecords(data);
    setLoading(false);
  };

  useEffect(() => { if (companyId) load(); }, [companyId]);

  const handleAdvance = async (cc: ChangeControl) => {
    const next = NEXT_STATUS[cc.status];
    if (!next) return;
    setActionLoading(cc.id);
    try {
      await updateChangeControlStatus(cc.id, companyId, userId, next);
      await load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (cc: ChangeControl) => {
    const reason = prompt('Rejection reason:');
    if (!reason) return;
    setActionLoading(cc.id);
    try {
      await updateChangeControlStatus(cc.id, companyId, userId, 'rejected', { rejectedReason: reason });
      await load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setActionLoading(null);
    }
  };

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
          {records.map(cc => {
            const next = NEXT_STATUS[cc.status];
            const isActioning = actionLoading === cc.id;

            return (
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

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {next && !['closed', 'rejected'].includes(cc.status) && (
                      <button
                        disabled={isActioning}
                        onClick={e => { e.stopPropagation(); handleAdvance(cc); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-white text-xs font-bold hover:opacity-90 disabled:opacity-50 transition-all"
                        style={{ background: 'var(--color-accent)' }}>
                        {isActioning ? '...' : <><ChevronRight size={12} />{CC_STATUS_LABELS[next]}</>}
                      </button>
                    )}
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
            );
          })}
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
