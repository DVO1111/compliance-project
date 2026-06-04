import { useState, useEffect } from 'react';
import { BookMarked, Plus, X, CheckCircle2, Clock, FileText } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import {
  listSopDocuments,
  createSopDocument,
  publishSopVersion,
  acknowledgeSopVersion,
  getMyAcknowledgements,
  listSopVersions,
  SopDocument,
  SopCategory,
  SopVersion,
  SOP_STATUS_LABELS,
  SOP_STATUS_COLORS,
  SOP_CATEGORIES,
} from '../../lib/pharma/sopService';

function CreateSopModal({ companyId, userId, onClose, onSuccess }: {
  companyId: string; userId: string; onClose: () => void; onSuccess: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ title: '', department: '', category: 'quality' as SopCategory, review_due_date: '' });
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.department) { setError('Title and Department are required.'); return; }
    setLoading(true);
    setError(null);
    try {
      await createSopDocument(companyId, userId, { ...form, review_due_date: form.review_due_date || undefined });
      onSuccess();
    } catch (e: any) {
      setError(e.message || 'Failed to create SOP');
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
              <BookMarked size={20} className="text-[var(--color-accent)]" />
            </div>
            <h2 className="text-lg font-bold dash-text">New SOP</h2>
          </div>
          <button onClick={onClose} className="dash-text-tertiary hover:dash-text-primary"><X size={22} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="p-3 rounded-xl bg-[var(--color-danger-soft)] text-[var(--color-danger)] text-sm border border-[var(--color-danger-border)]">{error}</div>}

          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary block mb-1">Title *</label>
            <input value={form.title} onChange={e => set('title', e.target.value)} required placeholder="e.g. Cleaning and Sanitation of Production Equipment"
              className="w-full bg-[var(--color-surface)] border dash-border rounded-xl px-3 py-2 text-sm dash-text focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary block mb-1">Department *</label>
              <input value={form.department} onChange={e => set('department', e.target.value)} required placeholder="e.g. Quality Control"
                className="w-full bg-[var(--color-surface)] border dash-border rounded-xl px-3 py-2 text-sm dash-text focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary block mb-1">Category</label>
              <select value={form.category} onChange={e => set('category', e.target.value as SopCategory)}
                className="w-full bg-[var(--color-surface)] border dash-border rounded-xl px-3 py-2 text-sm dash-text focus:outline-none">
                {SOP_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary block mb-1">Review Due Date</label>
            <input type="date" value={form.review_due_date} onChange={e => set('review_due_date', e.target.value)}
              className="w-full bg-[var(--color-surface)] border dash-border rounded-xl px-3 py-2 text-sm dash-text focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]" />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl border dash-border dash-text font-semibold hover:dash-surface-alt transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 px-4 py-2.5 rounded-xl text-white font-semibold hover:opacity-90 disabled:opacity-50 transition-all shadow-md"
              style={{ background: 'var(--color-accent)' }}>
              {loading ? 'Creating...' : 'Create SOP'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SopDetailDrawer({ sop, companyId, userId, myAcks, onClose, onUpdate }: {
  sop: SopDocument; companyId: string; userId: string; myAcks: string[]; onClose: () => void; onUpdate: () => void;
}) {
  const [versions, setVersions] = useState<SopVersion[]>([]);
  const [publishing, setPublishing] = useState<string | null>(null);
  const [acknowledging, setAcknowledging] = useState<string | null>(null);

  useEffect(() => {
    listSopVersions(sop.id).then(setVersions);
  }, [sop.id]);

  const handlePublish = async (v: SopVersion) => {
    setPublishing(v.id);
    try {
      await publishSopVersion(v.id, sop.id, companyId, userId);
      setVersions(await listSopVersions(sop.id));
      onUpdate();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setPublishing(null);
    }
  };

  const handleAck = async (versionId: string) => {
    setAcknowledging(versionId);
    try {
      await acknowledgeSopVersion(versionId, userId);
      onUpdate();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setAcknowledging(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-end bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full sm:w-[480px] h-full sm:h-auto sm:max-h-[90vh] dash-card border-l dash-border shadow-2xl overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b dash-border flex items-center justify-between sticky top-0 bg-[var(--color-surface)] z-10">
          <div>
            <p className="text-xs font-bold dash-text-tertiary uppercase tracking-widest">{sop.sop_number}</p>
            <h2 className="font-bold dash-text mt-0.5">{sop.title}</h2>
          </div>
          <button onClick={onClose} className="dash-text-tertiary hover:dash-text-primary"><X size={20} /></button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><p className="text-[10px] dash-text-tertiary uppercase tracking-widest font-bold">Department</p><p className="dash-text font-medium mt-0.5">{sop.department}</p></div>
            <div><p className="text-[10px] dash-text-tertiary uppercase tracking-widest font-bold">Version</p><p className="dash-text font-medium mt-0.5">{sop.current_version}</p></div>
            <div><p className="text-[10px] dash-text-tertiary uppercase tracking-widest font-bold">Status</p>
              <span className={`inline-flex mt-0.5 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${SOP_STATUS_COLORS[sop.status]}`}>
                {SOP_STATUS_LABELS[sop.status]}
              </span>
            </div>
            {sop.review_due_date && (
              <div><p className="text-[10px] dash-text-tertiary uppercase tracking-widest font-bold">Review Due</p>
                <p className={`dash-text font-medium mt-0.5 ${new Date(sop.review_due_date) < new Date() ? 'text-red-600' : ''}`}>
                  {new Date(sop.review_due_date).toLocaleDateString()}
                </p>
              </div>
            )}
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest dash-text-tertiary mb-3">Versions</h3>
            <div className="space-y-2">
              {versions.length === 0 && <p className="text-sm dash-text-tertiary">No versions yet.</p>}
              {versions.map(v => {
                const isEffective = v.status === 'effective';
                const alreadyAcked = myAcks.includes(v.id);
                return (
                  <div key={v.id} className="p-3 rounded-xl border dash-border bg-[var(--color-surface-alt)]">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileText size={14} className="dash-text-tertiary" />
                        <span className="text-sm font-semibold dash-text">v{v.version_number}</span>
                        <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full border ${
                          isEffective ? 'text-green-600 bg-green-50 border-green-200' : 'text-gray-600 bg-gray-50 border-gray-200'
                        }`}>{v.status}</span>
                      </div>
                      <div className="flex gap-1.5">
                        {v.status === 'draft' && (
                          <button disabled={!!publishing} onClick={() => handlePublish(v)}
                            className="text-[10px] font-bold px-2 py-1 rounded-lg text-white transition-all disabled:opacity-50"
                            style={{ background: 'var(--color-accent)' }}>
                            {publishing === v.id ? '...' : 'Publish'}
                          </button>
                        )}
                        {isEffective && !alreadyAcked && (
                          <button disabled={!!acknowledging} onClick={() => handleAck(v.id)}
                            className="text-[10px] font-bold px-2 py-1 rounded-lg border border-green-300 text-green-700 bg-green-50 hover:bg-green-100 disabled:opacity-50">
                            {acknowledging === v.id ? '...' : 'Acknowledge'}
                          </button>
                        )}
                        {isEffective && alreadyAcked && (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-green-600">
                            <CheckCircle2 size={10} /> Acknowledged
                          </span>
                        )}
                      </div>
                    </div>
                    {v.change_summary && <p className="text-xs dash-text-secondary mt-1">{v.change_summary}</p>}
                    <p className="text-[10px] dash-text-tertiary mt-1">{new Date(v.created_at).toLocaleDateString()}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SopLibraryPage() {
  const { user, profile } = useAuth();
  const companyId = (profile as any)?.company_id ?? '';
  const userId = user?.id ?? '';

  const [sops, setSops] = useState<SopDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<SopDocument | null>(null);
  const [myAcks, setMyAcks] = useState<string[]>([]);
  const [filterCat, setFilterCat] = useState<SopCategory | 'all'>('all');

  const load = async () => {
    setLoading(true);
    const [data, acks] = await Promise.all([
      listSopDocuments(companyId, filterCat === 'all' ? undefined : filterCat),
      getMyAcknowledgements(userId),
    ]);
    setSops(data);
    setMyAcks(acks);
    setLoading(false);
  };

  useEffect(() => { if (companyId) load(); }, [companyId, filterCat]);

  const effectiveSops = sops.filter(s => s.status === 'effective').length;
  const draftSops = sops.filter(s => s.status === 'draft').length;
  const reviewDue = sops.filter(s => s.review_due_date && new Date(s.review_due_date) < new Date()).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold dash-text">SOP Library</h1>
          <p className="text-sm dash-text-secondary mt-0.5">Document control for standard operating procedures — versioning, approval, and mandatory acknowledgement.</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold shadow-md hover:opacity-90"
          style={{ background: 'var(--color-accent)' }}>
          <Plus size={16} /> New SOP
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Effective SOPs', value: effectiveSops, color: 'text-green-600' },
          { label: 'In Draft', value: draftSops, color: 'text-gray-600' },
          { label: 'Review Overdue', value: reviewDue, color: 'text-red-600' },
        ].map(s => (
          <div key={s.label} className="dash-card border dash-border rounded-2xl p-5 shadow-sm">
            <p className="text-xs dash-text-tertiary uppercase tracking-widest font-bold mb-2">{s.label}</p>
            <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {(['all', ...SOP_CATEGORIES.map(c => c.id)] as const).map(cat => (
          <button key={cat} onClick={() => setFilterCat(cat as any)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
              filterCat === cat ? 'text-white border-transparent' : 'dash-text-secondary dash-border bg-[var(--color-surface)] hover:dash-surface-alt'
            }`}
            style={filterCat === cat ? { background: 'var(--color-accent)' } : undefined}>
            {cat === 'all' ? 'All' : SOP_CATEGORIES.find(c => c.id === cat)?.label ?? cat}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 rounded-full border-2 border-[var(--color-accent)] border-t-transparent animate-spin" />
        </div>
      ) : sops.length === 0 ? (
        <div className="dash-card border dash-border rounded-2xl p-12 text-center shadow-sm">
          <BookMarked size={40} className="mx-auto dash-text-tertiary mb-4" />
          <p className="dash-text font-semibold">No SOPs yet</p>
          <p className="text-sm dash-text-secondary mt-1">Create your first SOP to begin document control.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {sops.map(sop => {
            const isOverdue = sop.review_due_date && new Date(sop.review_due_date) < new Date();
            return (
              <button key={sop.id} onClick={() => setSelected(sop)}
                className="dash-card border dash-border rounded-2xl p-5 shadow-sm text-left hover:border-[var(--color-accent)] transition-colors group">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="p-2 rounded-xl bg-[var(--color-accent-soft)] flex-shrink-0">
                      <BookMarked size={16} className="text-[var(--color-accent)]" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold dash-text-tertiary">{sop.sop_number}</p>
                      <p className="font-semibold dash-text mt-0.5 truncate">{sop.title}</p>
                      <p className="text-xs dash-text-secondary mt-0.5">{sop.department} &middot; v{sop.current_version}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${SOP_STATUS_COLORS[sop.status]}`}>
                      {SOP_STATUS_LABELS[sop.status]}
                    </span>
                    {isOverdue && (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-red-600">
                        <Clock size={9} /> Review Overdue
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {showCreate && (
        <CreateSopModal companyId={companyId} userId={userId}
          onClose={() => setShowCreate(false)}
          onSuccess={() => { setShowCreate(false); load(); }} />
      )}

      {selected && (
        <SopDetailDrawer sop={selected} companyId={companyId} userId={userId} myAcks={myAcks}
          onClose={() => setSelected(null)}
          onUpdate={() => { load(); listSopDocuments(companyId).then(setSops); }} />
      )}
    </div>
  );
}
