import { useState, useEffect } from 'react';
import { FlaskConical, Plus, CheckCircle2, AlertTriangle, Clock, XCircle, Package, PackageCheck } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import {
  listBatchRecords,
  updateBatchStatus,
  listRawMaterialReceipts,
  BatchRecord,
  BatchStatus,
  RawMaterialReceipt,
  RawMaterialStatus,
  STATUS_LABELS,
  STATUS_COLORS,
} from '../../lib/pharma/batchReleaseService';
import BatchReleaseModal from './BatchReleaseModal';
import BatchDetailModal from './BatchDetailModal';
import RawMaterialModal from './RawMaterialModal';
import { isQaAuthority } from '../../lib/pharma/qaAuthority';

const RM_STATUS_COLORS: Record<RawMaterialStatus, string> = {
  pending: 'text-amber-600 bg-amber-50 border-amber-200',
  passed: 'text-green-600 bg-green-50 border-green-200',
  failed: 'text-red-600 bg-red-50 border-red-200',
  quarantined: 'text-orange-600 bg-orange-50 border-orange-200',
};

const STATUS_ICONS: Record<BatchStatus, typeof FlaskConical> = {
  qc_pending: Clock,
  qc_in_progress: FlaskConical,
  hold: AlertTriangle,
  released: CheckCircle2,
  rejected: XCircle,
  archived: Package,
};

export default function BatchReleasePage() {
  const { user, profile } = useAuth();
  const companyId = (profile as any)?.company_id ?? '';
  const userId = user?.id ?? '';
  const canQa = isQaAuthority((profile as any)?.company_role);

  const [view, setView] = useState<'batches' | 'raw_materials'>('batches');
  const [records, setRecords] = useState<BatchRecord[]>([]);
  const [rawMaterials, setRawMaterials] = useState<RawMaterialReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showRawModal, setShowRawModal] = useState(false);
  const [detailBatch, setDetailBatch] = useState<BatchRecord | null>(null);
  const [filterStatus, setFilterStatus] = useState<BatchStatus | 'all'>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const data = await listBatchRecords(companyId, filterStatus === 'all' ? undefined : filterStatus);
    setRecords(data);
    setLoading(false);
  };

  const loadRawMaterials = async () => {
    setLoading(true);
    const data = await listRawMaterialReceipts(companyId);
    setRawMaterials(data);
    setLoading(false);
  };

  useEffect(() => {
    if (!companyId) return;
    if (view === 'batches') load(); else loadRawMaterials();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, filterStatus, view]);

  const handleStatusChange = async (record: BatchRecord, newStatus: BatchStatus) => {
    setActionLoading(record.id);
    try {
      let extra: any = {};
      if (newStatus === 'hold') {
        const reason = prompt('Hold reason (required):');
        if (!reason) { setActionLoading(null); return; }
        extra.holdReason = reason;
      }
      if (newStatus === 'released') {
        extra.releaseNotes = prompt('Release notes (optional):') ?? '';
      }
      await updateBatchStatus(record.id, companyId, userId, newStatus, extra);
      await load();
    } catch (e: any) {
      alert(e.message || 'Failed to update status');
    } finally {
      setActionLoading(null);
    }
  };

  const nextActions = (status: BatchStatus): { label: string; status: BatchStatus; danger?: boolean }[] => {
    switch (status) {
      case 'qc_pending': return [{ label: 'Start QC', status: 'qc_in_progress' }];
      case 'qc_in_progress': return [
        { label: 'Release', status: 'released' },
        { label: 'Place on Hold', status: 'hold' },
        { label: 'Reject', status: 'rejected', danger: true },
      ];
      case 'hold': return [
        { label: 'Resume QC', status: 'qc_in_progress' },
        { label: 'Reject', status: 'rejected', danger: true },
      ];
      default: return [];
    }
  };

  const stats = {
    pending: records.filter(r => r.status === 'qc_pending').length,
    inProgress: records.filter(r => r.status === 'qc_in_progress').length,
    onHold: records.filter(r => r.status === 'hold').length,
    released: records.filter(r => r.status === 'released').length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold dash-text">Batch Release</h1>
          <p className="text-sm dash-text-secondary mt-0.5">Track QC testing and release decisions for every production batch.</p>
        </div>
        {view === 'batches' ? (
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold shadow-md transition-all hover:opacity-90"
            style={{ background: 'var(--color-accent)' }}
          >
            <Plus size={16} />
            New Batch
          </button>
        ) : (
          <button
            onClick={() => setShowRawModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold shadow-md transition-all hover:opacity-90"
            style={{ background: 'var(--color-accent)' }}
          >
            <Plus size={16} />
            Log Receipt
          </button>
        )}
      </div>

      {/* View toggle */}
      <div className="flex gap-2">
        {([['batches', 'Batches', FlaskConical], ['raw_materials', 'Raw Materials', PackageCheck]] as const).map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setView(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border transition-all ${
              view === id ? 'text-white border-transparent' : 'dash-text-secondary dash-border bg-[var(--color-surface)] hover:dash-surface-alt'
            }`}
            style={view === id ? { background: 'var(--color-accent)' } : undefined}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {view === 'batches' && (<>
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Awaiting QC', value: stats.pending, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'QC In Progress', value: stats.inProgress, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'On Hold', value: stats.onHold, color: 'text-orange-600', bg: 'bg-orange-50' },
          { label: 'Released', value: stats.released, color: 'text-green-600', bg: 'bg-green-50' },
        ].map(s => (
          <div key={s.label} className="dash-card border dash-border rounded-2xl p-5 shadow-sm">
            <p className="text-xs dash-text-tertiary uppercase tracking-widest font-bold mb-2">{s.label}</p>
            <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2">
        {(['all', 'qc_pending', 'qc_in_progress', 'hold', 'released', 'rejected'] as const).map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
              filterStatus === s
                ? 'text-white border-transparent'
                : 'dash-text-secondary dash-border bg-[var(--color-surface)] hover:dash-surface-alt'
            }`}
            style={filterStatus === s ? { background: 'var(--color-accent)', borderColor: 'var(--color-accent)' } : undefined}
          >
            {s === 'all' ? 'All Batches' : STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {/* Batch list */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 rounded-full border-2 border-[var(--color-accent)] border-t-transparent animate-spin" />
        </div>
      ) : records.length === 0 ? (
        <div className="dash-card border dash-border rounded-2xl p-12 text-center shadow-sm">
          <FlaskConical size={40} className="mx-auto dash-text-tertiary mb-4" />
          <p className="dash-text font-semibold">No batch records found</p>
          <p className="text-sm dash-text-secondary mt-1">Create your first batch to begin QC tracking.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {records.map(record => {
            const StatusIcon = STATUS_ICONS[record.status];
            const actions = nextActions(record.status);
            const isActioning = actionLoading === record.id;

            return (
              <div
                key={record.id}
                onClick={() => setDetailBatch(record)}
                className="dash-card border dash-border rounded-2xl p-5 shadow-sm cursor-pointer hover:border-[var(--color-accent)] transition-colors"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="p-2 rounded-xl bg-[var(--color-accent-soft)] flex-shrink-0">
                      <FlaskConical size={20} className="text-[var(--color-accent)]" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold dash-text">{record.batch_number}</span>
                        <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${STATUS_COLORS[record.status]}`}>
                          <StatusIcon size={10} className="inline mr-1" />
                          {STATUS_LABELS[record.status]}
                        </span>
                      </div>
                      <p className="text-sm dash-text-secondary mt-0.5">{record.product_name}</p>
                      <p className="text-xs dash-text-tertiary mt-0.5">
                        Mfg: {new Date(record.manufacturing_date).toLocaleDateString()} &middot;
                        Exp: {new Date(record.expiry_date).toLocaleDateString()} &middot;
                        Size: {record.batch_size} {record.unit}
                      </p>
                      {record.hold_reason && (
                        <p className="text-xs text-orange-600 mt-1 font-medium">Hold reason: {record.hold_reason}</p>
                      )}
                    </div>
                  </div>

                  {actions.length > 0 && !canQa && (
                    <span className="text-[11px] dash-text-tertiary italic self-center">QA/admin only</span>
                  )}
                  {actions.length > 0 && canQa && (
                    <div className="flex gap-2 flex-wrap">
                      {actions.map(action => (
                        <button
                          key={action.status}
                          disabled={isActioning}
                          onClick={(e) => { e.stopPropagation(); handleStatusChange(record, action.status); }}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all disabled:opacity-50 ${
                            action.danger
                              ? 'text-red-600 border-red-200 bg-red-50 hover:bg-red-100'
                              : 'text-white border-transparent hover:opacity-90'
                          }`}
                          style={!action.danger ? { background: 'var(--color-accent)' } : undefined}
                        >
                          {isActioning ? '...' : action.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      </>)}

      {/* Raw Materials view */}
      {view === 'raw_materials' && (
        loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 rounded-full border-2 border-[var(--color-accent)] border-t-transparent animate-spin" />
          </div>
        ) : rawMaterials.length === 0 ? (
          <div className="dash-card border dash-border rounded-2xl p-12 text-center shadow-sm">
            <PackageCheck size={40} className="mx-auto dash-text-tertiary mb-4" />
            <p className="dash-text font-semibold">No raw material receipts</p>
            <p className="text-sm dash-text-secondary mt-1">Log an incoming material lot to begin traceability.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {rawMaterials.map(rm => (
              <div key={rm.id} className="dash-card border dash-border rounded-2xl p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="p-2 rounded-xl bg-[var(--color-accent-soft)] flex-shrink-0">
                      <PackageCheck size={20} className="text-[var(--color-accent)]" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold dash-text">{rm.material_name}</span>
                        <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${RM_STATUS_COLORS[rm.test_status]}`}>
                          {rm.test_status}
                        </span>
                      </div>
                      <p className="text-xs dash-text-tertiary mt-0.5">
                        Lot: {rm.lot_number}
                        {rm.material_code ? ` · ${rm.material_code}` : ''}
                        {rm.supplier_name ? ` · ${rm.supplier_name}` : ''}
                        {rm.quantity != null ? ` · ${rm.quantity} ${rm.unit}` : ''}
                        {' · '}Received {new Date(rm.received_date).toLocaleDateString()}
                      </p>
                      {rm.test_result && (
                        <p className="text-xs dash-text-secondary mt-1">{rm.test_result}</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {showModal && (
        <BatchReleaseModal
          companyId={companyId}
          userId={userId}
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); load(); }}
        />
      )}

      {showRawModal && (
        <RawMaterialModal
          companyId={companyId}
          userId={userId}
          onClose={() => setShowRawModal(false)}
          onSuccess={() => { setShowRawModal(false); loadRawMaterials(); }}
        />
      )}

      {detailBatch && (
        <BatchDetailModal
          batch={detailBatch}
          companyId={companyId}
          userId={userId}
          onClose={() => setDetailBatch(null)}
        />
      )}
    </div>
  );
}
