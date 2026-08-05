import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  AuditPrepSession,
  AuditPrepSessionWithItems,
  AuditPrepItem,
  AuditType,
  InspectionType,
  ItemType,
  PriorityDoc,
  AUDIT_TYPE_LABELS,
  ITEM_TYPE_LABELS,
  getAuditPrepSessions,
  createAuditPrepSession,
  getAuditPrepSession,
  deleteAuditPrepSession,
  triggerAuditAssembly,
  pollUntilReady,
  buildExportText,
  getUnannouncedPriorityDocs,
} from '../../lib/auditPrepService';
import {
  Plus,
  RefreshCw,
  Download,
  Trash2,
  ChevronLeft,
  Sparkles,
  ClipboardCheck,
  Calendar,
  User,
  Building2,
  FileText,
  AlertTriangle,
  CheckCircle,
  Clock,
  Package,
  Shield,
  BookOpen,
  Scale,
  GitMerge,
  BarChart3,
  Loader2,
  ChevronRight,
  Zap,
} from 'lucide-react';
import NafdacReadinessChecklist from './NafdacReadinessChecklist';

type View = 'list' | 'detail';

const AUDIT_TYPES: AuditType[] = ['nafdac', 'gmp', 'iso', 'fda', 'son', 'who', 'ecju', 'internal', 'custom'];

const ITEM_ICONS: Record<ItemType, React.ReactNode> = {
  batch_record:   <Package    className="w-4 h-4" />,
  capa:           <AlertTriangle className="w-4 h-4" />,
  control:        <Shield     className="w-4 h-4" />,
  certificate:    <FileText   className="w-4 h-4" />,
  sop:            <BookOpen   className="w-4 h-4" />,
  policy:         <Scale      className="w-4 h-4" />,
  obligation:     <ClipboardCheck className="w-4 h-4" />,
  risk:           <AlertTriangle className="w-4 h-4" />,
  change_control: <GitMerge   className="w-4 h-4" />,
};

const STATUS_CHIP: Record<string, string> = {
  draft:      'bg-gray-100 text-gray-600',
  assembling: 'bg-blue-100 text-blue-700',
  ready:      'bg-green-100 text-green-700',
  exported:   'bg-purple-100 text-purple-700',
};

function statusLabel(s: string) {
  return { draft: 'Draft', assembling: 'Assembling…', ready: 'Ready', exported: 'Exported' }[s] ?? s;
}

function relevanceColor(tag: string | null): string {
  if (!tag) return 'text-gray-400';
  if (tag.includes('overdue') || tag.includes('expired') || tag.includes('non_compliant') || tag.includes('rejected')) return 'text-red-600';
  if (tag.includes('expiring') || tag.includes('pending') || tag.includes('high_risk') || tag.includes('partial')) return 'text-amber-600';
  return 'text-green-600';
}

function CountBadge({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-1 px-0 ${warn && value > 0 ? 'text-red-600' : 'text-[var(--color-text-primary,#111)]'}`}>
      <span className="text-xs text-[var(--color-text-secondary,#6b7280)]">{label}</span>
      <span className={`text-sm font-semibold ${warn && value > 0 ? 'text-red-600' : ''}`}>{value}</span>
    </div>
  );
}

// ── Sessions list ─────────────────────────────────────────────────────────────

function SessionList({
  sessions,
  onNew,
  onOpen,
  onDelete,
  loading,
}: {
  sessions: AuditPrepSession[];
  onNew: () => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  loading: boolean;
}) {
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary,#111)]">AI Audit Preparation</h1>
          <p className="text-sm text-[var(--color-text-secondary,#6b7280)] mt-1">
            Automatically assemble evidence packages for upcoming inspections.
          </p>
        </div>
        <button
          onClick={onNew}
          className="flex items-center gap-2 px-4 py-2 bg-[#2943D6] text-white rounded-lg text-sm font-medium hover:bg-[#1e33b0] transition-colors"
        >
          <Plus className="w-4 h-4" /> New Prep Session
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-36 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />)}
        </div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-20 bg-[var(--color-surface,#fff)] border border-[var(--color-border,#e5e7eb)] rounded-xl">
          <Sparkles className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="font-semibold text-[var(--color-text-secondary,#6b7280)]">No audit prep sessions yet</p>
          <p className="text-sm text-gray-400 mt-1 mb-4">Create one to auto-assemble your evidence package.</p>
          <button onClick={onNew} className="px-4 py-2 bg-[#2943D6] text-white rounded-lg text-sm font-medium">
            Get started
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {sessions.map((s) => (
            <div
              key={s.id}
              className="bg-[var(--color-surface,#fff)] border border-[var(--color-border,#e5e7eb)] rounded-xl p-5 hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => onOpen(s.id)}
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="min-w-0">
                  <p className="font-semibold text-[var(--color-text-primary,#111)] truncate">{s.name}</p>
                  <p className="text-xs text-[var(--color-text-secondary,#6b7280)] mt-0.5">{AUDIT_TYPE_LABELS[s.audit_type]}</p>
                </div>
                <span className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_CHIP[s.status] ?? 'bg-gray-100 text-gray-500'}`}>
                  {statusLabel(s.status)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-[var(--color-text-secondary,#6b7280)]">
                {s.scheduled_date && (
                  <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {s.scheduled_date}</span>
                )}
                {s.inspector_name && (
                  <span className="flex items-center gap-1 truncate"><User className="w-3.5 h-3.5" /> {s.inspector_name}</span>
                )}
              </div>
              {s.status === 'ready' && (
                <div className="mt-3 flex items-center gap-1 text-xs text-green-600 font-medium">
                  <CheckCircle className="w-3.5 h-3.5" />
                  {Object.values(s.evidence_counts as any).reduce((sum: number, c: any) => sum + (c?.total ?? 0), 0)} evidence items assembled
                </div>
              )}
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-gray-400">{new Date(s.created_at).toLocaleDateString('en-GB')}</span>
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => onDelete(s.id)}
                    className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Session detail ────────────────────────────────────────────────────────────

const ITEM_TABS: { id: ItemType; label: string }[] = [
  { id: 'batch_record',   label: 'Batch Records' },
  { id: 'capa',           label: 'CAPAs' },
  { id: 'control',        label: 'Controls' },
  { id: 'certificate',    label: 'Licences' },
  { id: 'sop',            label: 'SOPs' },
  { id: 'policy',         label: 'Policies' },
  { id: 'obligation',     label: 'Obligations' },
  { id: 'risk',           label: 'Risks' },
  { id: 'change_control', label: 'Change Controls' },
];

function SessionDetail({
  sessionId,
  companyId,
  onBack,
}: {
  sessionId: string;
  companyId: string;
  onBack: () => void;
}) {
  const [data, setData] = useState<AuditPrepSessionWithItems | null>(null);
  const [loading, setLoading] = useState(true);
  const [assembling, setAssembling] = useState(false);
  const [assembleError, setAssembleError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ItemType>('batch_record');
  const [priorityDocs, setPriorityDocs] = useState<PriorityDoc[] | null>(null);
  const [priorityLoading, setPriorityLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const d = await getAuditPrepSession(sessionId, companyId);
    setData(d);
    setLoading(false);
  }, [sessionId, companyId]);

  useEffect(() => { load(); }, [load]);

  // Unannounced mode: surface priority documents immediately, bypassing assembly.
  const loadPriorityDocs = useCallback(async () => {
    setPriorityLoading(true);
    const docs = await getUnannouncedPriorityDocs(companyId);
    setPriorityDocs(docs);
    setPriorityLoading(false);
  }, [companyId]);

  useEffect(() => {
    if (data?.inspection_type === 'unannounced' && priorityDocs === null && !priorityLoading) {
      loadPriorityDocs();
    }
  }, [data?.inspection_type, priorityDocs, priorityLoading, loadPriorityDocs]);

  const handleAssemble = async () => {
    if (!data) return;
    setAssembling(true);
    setAssembleError(null);
    const result = await triggerAuditAssembly(companyId, sessionId);
    if (!result.ok) {
      setAssembleError(result.error ?? 'Unknown error');
      setAssembling(false);
      return;
    }
    // Optimistic UI update + poll
    setData((prev) => prev ? { ...prev, status: 'assembling' } : prev);
    await pollUntilReady(sessionId, companyId, (updated) => {
      setData((prev) => prev ? { ...prev, ...updated } : null);
    });
    // Final full reload to get items
    const fresh = await getAuditPrepSession(sessionId, companyId);
    setData(fresh);
    setAssembling(false);
  };

  const handleExport = () => {
    if (!data) return;
    const text = buildExportText(data);
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-prep-${data.name.replace(/\s+/g, '-').toLowerCase()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="h-8 bg-gray-100 rounded-lg w-1/3 animate-pulse mb-4" />
        <div className="h-48 bg-gray-100 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 max-w-5xl mx-auto text-center py-20">
        <p className="text-[var(--color-text-secondary,#6b7280)]">Session not found.</p>
        <button onClick={onBack} className="mt-4 text-sm text-[#2943D6] hover:underline">Back to list</button>
      </div>
    );
  }

  const counts = data.evidence_counts as Record<string, Record<string, number>>;
  const itemsByType: Record<string, AuditPrepItem[]> = {};
  for (const item of data.items) {
    if (!itemsByType[item.item_type]) itemsByType[item.item_type] = [];
    itemsByType[item.item_type].push(item);
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex-shrink-0">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-[var(--color-text-primary,#111)]">{data.name}</h1>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_CHIP[data.status] ?? 'bg-gray-100 text-gray-500'}`}>
              {statusLabel(data.status)}
            </span>
          </div>
          <div className="flex items-center gap-4 mt-1 text-xs text-[var(--color-text-secondary,#6b7280)] flex-wrap">
            <span className="flex items-center gap-1"><Building2 className="w-3.5 h-3.5" />{AUDIT_TYPE_LABELS[data.audit_type]}</span>
            {data.scheduled_date && <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{data.scheduled_date}</span>}
            {data.inspector_name && <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" />{data.inspector_name}{data.inspector_org ? ` — ${data.inspector_org}` : ''}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {data.status === 'ready' && (
            <button onClick={handleExport} className="flex items-center gap-2 px-3 py-2 border border-[var(--color-border,#e5e7eb)] rounded-lg text-sm font-medium text-[var(--color-text-primary,#111)] hover:bg-gray-50 transition-colors">
              <Download className="w-4 h-4" /> Export
            </button>
          )}
          {(data.status === 'draft' || data.status === 'ready') && (
            <button
              onClick={handleAssemble}
              disabled={assembling}
              className="flex items-center gap-2 px-4 py-2 bg-[#2943D6] text-white rounded-lg text-sm font-medium hover:bg-[#1e33b0] disabled:opacity-50 transition-colors"
            >
              {assembling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {assembling ? 'Assembling…' : data.status === 'ready' ? 'Re-assemble' : 'Assemble Package'}
            </button>
          )}
        </div>
      </div>

      {/* NAFDAC official document checklist (both inspection guidelines) */}
      <NafdacReadinessChecklist companyId={companyId} />

      {/* Unannounced Mode — instant priority documents */}
      {data.inspection_type === 'unannounced' && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-500" />
              <h2 className="font-semibold text-[var(--color-text-primary,#111)]">Unannounced Inspection — Priority Documents</h2>
            </div>
            <button
              onClick={loadPriorityDocs}
              disabled={priorityLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-amber-300 rounded-lg text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50 transition-colors"
            >
              {priorityLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Refresh
            </button>
          </div>
          <p className="text-xs text-amber-800/80 mb-4">
            The critical files an inspector asks for first — surfaced instantly, without waiting for full AI assembly.
          </p>
          {priorityLoading && priorityDocs === null ? (
            <div className="flex items-center gap-2 text-sm text-amber-800"><Loader2 className="w-4 h-4 animate-spin" /> Locating documents…</div>
          ) : (priorityDocs && priorityDocs.length > 0) ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {priorityDocs.map((doc, i) => (
                <div key={i} className="bg-white border border-amber-200 rounded-lg p-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-amber-600">{doc.category}</p>
                  <p className="text-sm font-semibold text-[var(--color-text-primary,#111)] mt-0.5">{doc.title}</p>
                  {doc.subtitle && <p className="text-xs text-[var(--color-text-secondary,#6b7280)]">{doc.subtitle}</p>}
                  <div className="flex items-center gap-2 mt-1.5 text-[11px] text-[var(--color-text-secondary,#6b7280)]">
                    {doc.status && <span className="px-1.5 py-0.5 rounded-full bg-gray-100">{doc.status}</span>}
                    {doc.date && <span>{new Date(doc.date).toLocaleDateString('en-GB')}</span>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-amber-800/80">No priority documents found yet — add a released batch, CoA, or licence.</p>
          )}
        </div>
      )}

      {assembleError && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {assembleError}
        </div>
      )}

      {data.status === 'assembling' && (
        <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl text-blue-700">
          <Loader2 className="w-5 h-5 animate-spin flex-shrink-0" />
          <div>
            <p className="font-medium text-sm">Assembling evidence package…</p>
            <p className="text-xs mt-0.5">Claude is reviewing your compliance data. This takes 20–40 seconds.</p>
          </div>
        </div>
      )}

      {data.status === 'ready' && (
        <>
          {/* AI Summary */}
          {data.ai_summary && (
            <div className="bg-gradient-to-br from-[#2943D6]/5 to-[#2943D6]/10 border border-[#2943D6]/20 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-5 h-5 text-[#2943D6]" />
                <h2 className="font-semibold text-[var(--color-text-primary,#111)]">AI Readiness Assessment</h2>
                {data.assembled_at && (
                  <span className="ml-auto text-xs text-[var(--color-text-secondary,#6b7280)]">
                    Generated {new Date(data.assembled_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                )}
              </div>
              <p className="text-sm text-[var(--color-text-primary,#111)] leading-relaxed whitespace-pre-line">{data.ai_summary}</p>
            </div>
          )}

          {/* Evidence count summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {[
              { key: 'batch_records',   label: 'Batches',     icon: <Package className="w-4 h-4 text-blue-500" /> },
              { key: 'capas',           label: 'CAPAs',       icon: <AlertTriangle className="w-4 h-4 text-red-500" /> },
              { key: 'controls',        label: 'Controls',    icon: <Shield className="w-4 h-4 text-purple-500" /> },
              { key: 'certificates',    label: 'Licences',    icon: <FileText className="w-4 h-4 text-amber-500" /> },
              { key: 'sops',            label: 'SOPs',        icon: <BookOpen className="w-4 h-4 text-green-500" /> },
              { key: 'policies',        label: 'Policies',    icon: <Scale className="w-4 h-4 text-teal-500" /> },
              { key: 'obligations',     label: 'Obligations', icon: <ClipboardCheck className="w-4 h-4 text-orange-500" /> },
              { key: 'risks',           label: 'Risks',       icon: <AlertTriangle className="w-4 h-4 text-rose-500" /> },
              { key: 'change_controls', label: 'Changes',     icon: <GitMerge className="w-4 h-4 text-indigo-500" /> },
              { key: '_total',          label: 'Total items', icon: <BarChart3 className="w-4 h-4 text-gray-500" /> },
            ].map(({ key, label, icon }) => {
              const total = key === '_total'
                ? data.items.length
                : counts[key]?.total ?? 0;
              return (
                <div key={key} className="bg-[var(--color-surface,#fff)] border border-[var(--color-border,#e5e7eb)] rounded-xl p-3 flex items-center gap-2">
                  <div className="p-1.5 bg-gray-50 dark:bg-gray-800 rounded-lg">{icon}</div>
                  <div>
                    <p className="text-lg font-bold text-[var(--color-text-primary,#111)]">{total}</p>
                    <p className="text-xs text-[var(--color-text-secondary,#6b7280)]">{label}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Evidence detail drill-down */}
          {data.items.length > 0 && (
            <div className="bg-[var(--color-surface,#fff)] border border-[var(--color-border,#e5e7eb)] rounded-xl overflow-hidden">
              {/* Tab bar */}
              <div className="flex overflow-x-auto border-b border-[var(--color-border,#e5e7eb)]">
                {ITEM_TABS.filter((t) => (itemsByType[t.id]?.length ?? 0) > 0).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setActiveTab(t.id)}
                    className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                      activeTab === t.id
                        ? 'border-[#2943D6] text-[#2943D6]'
                        : 'border-transparent text-[var(--color-text-secondary,#6b7280)] hover:text-[var(--color-text-primary,#111)]'
                    }`}
                  >
                    {ITEM_ICONS[t.id]}
                    {t.label}
                    <span className="ml-1 text-xs bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded-full">
                      {itemsByType[t.id]?.length ?? 0}
                    </span>
                  </button>
                ))}
              </div>

              {/* Count detail */}
              {counts[activeTab === 'certificate' ? 'certificates' : activeTab === 'change_control' ? 'change_controls' : `${activeTab}s`] && (
                <div className="px-4 pt-3 pb-2 bg-gray-50 dark:bg-gray-800/50 border-b border-[var(--color-border,#e5e7eb)]">
                  <div className="flex gap-6 flex-wrap">
                    {Object.entries(counts[
                      activeTab === 'certificate' ? 'certificates'
                        : activeTab === 'change_control' ? 'change_controls'
                        : `${activeTab}s`
                    ] ?? {}).filter(([k]) => k !== 'total').map(([k, v]) => (
                      <CountBadge
                        key={k}
                        label={k.replace(/_/g, ' ')}
                        value={v as number}
                        warn={['overdue', 'non_compliant', 'expired', 'rejected', 'high'].some((w) => k.includes(w)) && (v as number) > 0}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Items table */}
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800 border-b border-[var(--color-border,#e5e7eb)]">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-[var(--color-text-secondary,#6b7280)]">Title</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-[var(--color-text-secondary,#6b7280)]">Status</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-[var(--color-text-secondary,#6b7280)]">Date</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-[var(--color-text-secondary,#6b7280)]">Relevance</th>
                  </tr>
                </thead>
                <tbody>
                  {(itemsByType[activeTab] ?? []).map((item) => (
                    <tr key={item.id} className="border-b border-[var(--color-border,#e5e7eb)] last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-[var(--color-text-primary,#111)] truncate max-w-xs">{item.title}</p>
                        {item.description && (
                          <p className="text-xs text-[var(--color-text-secondary,#6b7280)] mt-0.5 truncate max-w-xs">{item.description}</p>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-[var(--color-text-secondary,#6b7280)]">
                          {item.status ?? '—'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-[var(--color-text-secondary,#6b7280)] whitespace-nowrap">{item.item_date ?? '—'}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs font-medium ${relevanceColor(item.relevance_tag)}`}>
                          {item.relevance_tag?.replace(/_/g, ' ') ?? '—'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {data.status === 'draft' && (
        <div className="text-center py-16 bg-[var(--color-surface,#fff)] border border-dashed border-[var(--color-border,#e5e7eb)] rounded-xl">
          <Sparkles className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="font-semibold text-[var(--color-text-secondary,#6b7280)]">Evidence not yet assembled</p>
          <p className="text-sm text-gray-400 mt-1 mb-4">Click "Assemble Package" to pull batch records, CAPAs, controls, licences, SOPs and more into a structured report.</p>
          <button
            onClick={handleAssemble}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#2943D6] text-white rounded-lg text-sm font-medium mx-auto hover:bg-[#1e33b0] transition-colors"
          >
            <Sparkles className="w-4 h-4" /> Assemble Package
          </button>
        </div>
      )}
    </div>
  );
}

// ── New session modal ─────────────────────────────────────────────────────────

function NewSessionModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (data: {
    name: string; audit_type: AuditType; inspection_type?: InspectionType; scheduled_date?: string;
    inspector_name?: string; inspector_org?: string; scope_notes?: string;
  }) => void;
}) {
  const [name, setName] = useState('');
  const [auditType, setAuditType] = useState<AuditType>('nafdac');
  const [inspectionType, setInspectionType] = useState<InspectionType>('scheduled');
  const [scheduledDate, setScheduledDate] = useState('');
  const [inspectorName, setInspectorName] = useState('');
  const [inspectorOrg, setInspectorOrg] = useState('');
  const [scopeNotes, setScopeNotes] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onCreate({
      name: name.trim(),
      audit_type: auditType,
      inspection_type: inspectionType,
      scheduled_date: scheduledDate || undefined,
      inspector_name: inspectorName || undefined,
      inspector_org: inspectorOrg || undefined,
      scope_notes: scopeNotes || undefined,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-[var(--color-surface,#fff)] rounded-2xl shadow-xl max-w-lg w-full">
        <div className="flex items-center justify-between p-5 border-b border-[var(--color-border,#e5e7eb)]">
          <h2 className="font-semibold text-[var(--color-text-primary,#111)]">New Audit Prep Session</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary,#6b7280)] mb-1">Session name *</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. NAFDAC Annual Inspection 2026"
              className="w-full px-3 py-2 border border-[var(--color-border,#e5e7eb)] rounded-lg text-sm bg-[var(--color-surface,#fff)] text-[var(--color-text-primary,#111)]"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-secondary,#6b7280)] mb-1">Audit type</label>
              <select
                value={auditType}
                onChange={(e) => setAuditType(e.target.value as AuditType)}
                className="w-full px-3 py-2 border border-[var(--color-border,#e5e7eb)] rounded-lg text-sm bg-[var(--color-surface,#fff)] text-[var(--color-text-primary,#111)]"
              >
                {AUDIT_TYPES.map((t) => (
                  <option key={t} value={t}>{AUDIT_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-secondary,#6b7280)] mb-1">Scheduled date</label>
              <input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="w-full px-3 py-2 border border-[var(--color-border,#e5e7eb)] rounded-lg text-sm bg-[var(--color-surface,#fff)] text-[var(--color-text-primary,#111)]"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary,#6b7280)] mb-1">Inspection type</label>
            <div className="grid grid-cols-2 gap-2">
              {([['scheduled', 'Scheduled', 'Full AI evidence assembly'], ['unannounced', 'Unannounced', 'Instant priority documents']] as const).map(([id, label, hint]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setInspectionType(id)}
                  className={`text-left px-3 py-2.5 rounded-lg border transition-colors ${
                    inspectionType === id
                      ? 'border-[#2943D6] bg-[#2943D6]/5'
                      : 'border-[var(--color-border,#e5e7eb)] hover:bg-gray-50'
                  }`}
                >
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-[var(--color-text-primary,#111)]">
                    {id === 'unannounced' ? <Zap className="w-3.5 h-3.5 text-amber-500" /> : <Calendar className="w-3.5 h-3.5 text-[#2943D6]" />}
                    {label}
                  </span>
                  <span className="block text-[11px] text-[var(--color-text-secondary,#6b7280)] mt-0.5">{hint}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-secondary,#6b7280)] mb-1">Inspector name</label>
              <input
                value={inspectorName}
                onChange={(e) => setInspectorName(e.target.value)}
                className="w-full px-3 py-2 border border-[var(--color-border,#e5e7eb)] rounded-lg text-sm bg-[var(--color-surface,#fff)] text-[var(--color-text-primary,#111)]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-secondary,#6b7280)] mb-1">Inspecting organisation</label>
              <input
                value={inspectorOrg}
                onChange={(e) => setInspectorOrg(e.target.value)}
                placeholder="NAFDAC, WHO, etc."
                className="w-full px-3 py-2 border border-[var(--color-border,#e5e7eb)] rounded-lg text-sm bg-[var(--color-surface,#fff)] text-[var(--color-text-primary,#111)]"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary,#6b7280)] mb-1">Scope / focus areas</label>
            <textarea
              rows={2}
              value={scopeNotes}
              onChange={(e) => setScopeNotes(e.target.value)}
              placeholder="e.g. Manufacturing processes, batch release, QC laboratory, SOP compliance"
              className="w-full px-3 py-2 border border-[var(--color-border,#e5e7eb)] rounded-lg text-sm bg-[var(--color-surface,#fff)] text-[var(--color-text-primary,#111)] resize-none"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-[var(--color-border,#e5e7eb)] rounded-lg text-sm font-medium text-[var(--color-text-secondary,#6b7280)] hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 bg-[#2943D6] text-white rounded-lg text-sm font-medium hover:bg-[#1e33b0] transition-colors">
              Create session
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Root component ────────────────────────────────────────────────────────────

export default function AuditPrepPage() {
  const { profile, user } = useAuth();
  const companyId = (profile as any)?.company_id as string | undefined;
  const userId = user?.id ?? '';

  const [view, setView] = useState<View>('list');
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<AuditPrepSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);

  const loadSessions = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const data = await getAuditPrepSessions(companyId);
    setSessions(data);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  const handleCreate = async (input: Parameters<typeof createAuditPrepSession>[2]) => {
    if (!companyId) return;
    setShowNewModal(false);
    const created = await createAuditPrepSession(companyId, userId, input);
    if (created) {
      setSessions((prev) => [created, ...prev]);
      setOpenSessionId(created.id);
      setView('detail');
    }
  };

  const handleDelete = async (sessionId: string) => {
    if (!companyId) return;
    if (!confirm('Delete this audit prep session and all assembled evidence?')) return;
    const ok = await deleteAuditPrepSession(companyId, sessionId);
    if (ok) setSessions((prev) => prev.filter((s) => s.id !== sessionId));
  };

  const handleOpen = (id: string) => {
    setOpenSessionId(id);
    setView('detail');
  };

  if (view === 'detail' && openSessionId && companyId) {
    return (
      <>
        <SessionDetail
          sessionId={openSessionId}
          companyId={companyId}
          onBack={() => { setView('list'); setOpenSessionId(null); loadSessions(); }}
        />
        {showNewModal && (
          <NewSessionModal onClose={() => setShowNewModal(false)} onCreate={handleCreate} />
        )}
      </>
    );
  }

  return (
    <>
      <SessionList
        sessions={sessions}
        onNew={() => setShowNewModal(true)}
        onOpen={handleOpen}
        onDelete={handleDelete}
        loading={loading}
      />
      {showNewModal && (
        <NewSessionModal onClose={() => setShowNewModal(false)} onCreate={handleCreate} />
      )}
    </>
  );
}
