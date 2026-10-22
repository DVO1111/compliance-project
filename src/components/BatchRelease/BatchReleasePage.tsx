import { useState, useEffect } from 'react';
import { FlaskConical, Plus, CheckCircle2, AlertTriangle, Clock, XCircle, Package, PackageCheck, Factory, ClipboardCheck } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import {
  listBatchRecords,
  updateBatchStatus,
  listRawMaterialReceipts,
  batchReleaseConditions,
  BatchRecord,
  BatchStatus,
  RawMaterialReceipt,
  RawMaterialStatus,
  STATUS_LABELS,
  STATUS_COLORS,
} from '../../lib/pharma/batchReleaseService';
import BatchReleaseModal from './BatchReleaseModal';
import ElectronicSignatureModal from '../ElectronicSignatures/ElectronicSignatureModal';
import { FloorNoticeList } from '../Floor/FloorNotice';
import { assess, type FloorCondition } from '../../lib/floor/floorConditions';
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
  in_progress: Factory,
  execution_complete: ClipboardCheck,
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
  //  Release objections per batch, read from the same function the gate
  //  refuses on. Keyed by batch so a list can show them without a
  //  request per row on every render.
  const [conditions, setConditions] = useState<Record<string, FloorCondition[]>>({});
  //  The release waiting for its electronic signature. PM-03 requires
  //  one and, since 20261107000000, the lifecycle transition enforces
  //  it — an unsigned release comes back LIFECYCLE_SIGNATURE_REQUIRED.
  const [signing, setSigning] = useState<{ record: BatchRecord; notes: string } | null>(null);

  const load = async () => {
    setLoading(true);
    const data = await listBatchRecords(companyId, filterStatus === 'all' ? undefined : filterStatus);
    setRecords(data);
    setLoading(false);

    //  Only for the batches a release decision is actually open on.
    //  Asking for every row would be a request per archived batch to
    //  answer a question nobody is holding.
    const open = data.filter(r => r.status === 'qc_in_progress');
    const answers = await Promise.all(open.map(r => batchReleaseConditions(r.id)));
    setConditions(Object.fromEntries(open.map((r, i) => [r.id, answers[i]])));
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
      //  The engine declares `reject` as requiring a comment, so asking
      //  for one is not politeness — the transition is refused without it.
      if (newStatus === 'rejected') {
        const reason = prompt('Reason for rejecting this batch (required):');
        if (!reason) { setActionLoading(null); return; }
        extra.comment = reason;
      }
      //  RELEASE DOES NOT HAPPEN HERE. It needs a signature, which is
      //  collected in a dialog rather than a prompt() — the password is
      //  typed into it, and prompt() shows what is typed.
      if (newStatus === 'released') {
        setSigning({ record, notes: prompt('Release notes (optional):') ?? '' });
        setActionLoading(null);
        return;
      }
      await updateBatchStatus(record.id, companyId, userId, newStatus, extra);
      await load();
    } catch (e: any) {
      alert(e.message || 'Failed to update status');
    } finally {
      setActionLoading(null);
    }
  };

  //  One entry per transition the engine actually declares. A batch under
  //  manufacturing is driven by its stages, not from here, so the only
  //  move offered on it is the hold — closing execution is the batch
  //  record's own screen and requires every stage to be signed off.
  const nextActions = (record: BatchRecord): { label: string; status: BatchStatus; danger?: boolean }[] => {
    const { status } = record;
    switch (status) {
      case 'in_progress': return [{ label: 'Place on Hold', status: 'hold' }];
      case 'execution_complete': return [{ label: 'Submit for QC', status: 'qc_pending' }];
      case 'qc_pending': return [
        { label: 'Start QC', status: 'qc_in_progress' },
        { label: 'Place on Hold', status: 'hold' },
      ];
      case 'qc_in_progress': return [
        { label: 'Release', status: 'released' },
        { label: 'Place on Hold', status: 'hold' },
        { label: 'Reject', status: 'rejected', danger: true },
      ];
      case 'hold': return [
        //  Only offered while execution is still open. A closed record is
        //  refused this by the database too; not offering it is so the
        //  operator is not shown a button that cannot work.
        ...(record.execution_closed_at
          ? []
          : [{ label: 'Resume Manufacturing', status: 'in_progress' as BatchStatus }]),
        { label: 'Resume QC', status: 'qc_in_progress' as BatchStatus },
        { label: 'Reject', status: 'rejected' as BatchStatus, danger: true },
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
            const actions = nextActions(record);
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

                  {/*  WHY THIS BATCH CANNOT BE RELEASED, said before the
                      button rather than after it. The rows come from
                      batch_release_conditions, which reads the same facts
                      the gate refuses on, so the notice and the refusal
                      cannot drift apart. An empty list is not a promise:
                      the transition is still what decides. */}
                  {(conditions[record.id]?.length ?? 0) > 0 && (
                    <div className="w-full">
                      <FloorNoticeList conditions={assess(conditions[record.id]!).conditions} />
                    </div>
                  )}

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

      {/*  PM-03: "Release a batch — QA Manager — E-signature". The
          signature is bound by the database to this signer, this record
          and this action, and consumed by the transition, so it cannot
          be reused or supplied for something else. */}
      {signing && (
        <ElectronicSignatureModal
          open
          companyId={companyId}
          entityType="batch_record"
          entityId={signing.record.id}
          action="release"
          defaultMeaning="released"
          title={`Release batch ${signing.record.batch_number}`}
          metadata={{ release_notes: signing.notes }}
          onClose={() => setSigning(null)}
          onSigned={(signatureId) => {
            const target = signing;
            setSigning(null);
            if (!target) return;
            setActionLoading(target.record.id);
            void (async () => {
              try {
                await updateBatchStatus(target.record.id, companyId, userId, 'released', {
                  releaseNotes: target.notes,
                  signatureId,
                });
                await load();
              } catch (e: unknown) {
                //  Shown as the database wrote it. BATCH_RELEASE_BLOCKED
                //  and BATCH_RELEASE_SELF_TESTED are sentences meant for
                //  the person reading them.
                alert(e instanceof Error ? e.message : 'The release was refused.');
              } finally {
                setActionLoading(null);
              }
            })();
          }}
        />
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
