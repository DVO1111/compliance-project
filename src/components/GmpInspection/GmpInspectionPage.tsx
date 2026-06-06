import { useState, useEffect, useCallback } from 'react';
import {
  Factory, ChevronDown, ChevronRight, CheckCircle2,
  Clock, XCircle, Minus, AlertTriangle, RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import {
  INSPECTION_ITEMS, INSPECTION_AREAS,
  ReadinessStatus, ItemWithStatus, AreaScore, InspectionReport,
  getReadinessLog, updateReadinessItem, buildInspectionReport,
} from '../../lib/gmpInspectionService';

/* ── Status config ──────────────────────────────────────────── */

const STATUS_CONFIG: Record<ReadinessStatus, {
  label: string; color: string; bg: string; border: string; icon: typeof CheckCircle2;
}> = {
  ready:          { label: 'Ready',       color: 'text-green-700',  bg: 'bg-green-50',  border: 'border-green-300', icon: CheckCircle2 },
  in_progress:    { label: 'In Progress', color: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-300', icon: Clock },
  gap:            { label: 'Gap',         color: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-300',   icon: XCircle },
  not_applicable: { label: 'N/A',         color: 'text-gray-500',   bg: 'bg-gray-100',  border: 'border-gray-200',  icon: Minus },
};

function StatusButton({
  status, current, onClick,
}: { status: ReadinessStatus; current: ReadinessStatus; onClick: () => void }) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  const isActive = status === current;
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
        isActive ? `${cfg.color} ${cfg.bg} ${cfg.border}` : 'text-gray-400 bg-white border-gray-200 hover:border-gray-300'
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
      {cfg.label}
    </button>
  );
}

/* ── Area accordion ─────────────────────────────────────────── */

interface AreaPanelProps {
  areaScore: AreaScore;
  onUpdate: (itemId: string, status: ReadinessStatus, notes: string) => void;
  defaultOpen?: boolean;
}

function AreaPanel({ areaScore, onUpdate, defaultOpen = false }: AreaPanelProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [editNotes, setEditNotes] = useState<Record<string, string>>({});

  const scoreColor = areaScore.score >= 90 ? 'text-green-600' : areaScore.score >= 60 ? 'text-amber-600' : 'text-red-600';
  const barColor   = areaScore.score >= 90 ? 'bg-green-500'  : areaScore.score >= 60 ? 'bg-amber-500'  : 'bg-red-500';

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <div className="flex-1 min-w-0 text-left">
            <p className="font-semibold text-gray-900 text-sm">{areaScore.area}</p>
            <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1.5">
              <div className={`${barColor} h-1.5 rounded-full`} style={{ width: `${areaScore.score}%` }} />
            </div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <span className={`text-lg font-bold ${scoreColor}`}>{areaScore.score}%</span>
            <div className="flex gap-1.5 text-xs">
              {areaScore.ready > 0     && <span className="text-green-600 bg-green-50 px-1.5 py-0.5 rounded">✓{areaScore.ready}</span>}
              {areaScore.inProgress > 0 && <span className="text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">⏱{areaScore.inProgress}</span>}
              {areaScore.gap > 0       && <span className="text-red-600 bg-red-50 px-1.5 py-0.5 rounded">✗{areaScore.gap}</span>}
              {areaScore.critical_gaps > 0 && (
                <span className="text-red-700 bg-red-100 px-1.5 py-0.5 rounded font-semibold">⚠{areaScore.critical_gaps} critical</span>
              )}
            </div>
          </div>
        </div>
        <div className="ml-3 flex-shrink-0">
          {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
        </div>
      </button>

      {/* Item list */}
      {open && (
        <div className="border-t border-gray-100 divide-y divide-gray-50">
          {areaScore.items.map(item => {
            const cfg = STATUS_CONFIG[item.status];
            const Icon = cfg.icon;
            const noteValue = editNotes[item.id] ?? item.notes ?? '';
            return (
              <div key={item.id} className={`px-5 py-4 ${item.status === 'not_applicable' ? 'opacity-50' : ''}`}>
                <div className="flex items-start gap-3">
                  {/* Status icon */}
                  <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${cfg.color}`} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-900">{item.title}</span>
                      {item.isCritical && item.status === 'gap' && (
                        <span className="text-xs text-red-700 bg-red-100 px-1.5 py-0.5 rounded font-semibold flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> Critical
                        </span>
                      )}
                      <span className="text-xs font-mono text-gray-400">{item.id}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{item.description}</p>

                    {/* Evidence link */}
                    {item.evidence_url && (
                      <a href={item.evidence_url} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline mt-1">
                        <ExternalLink className="w-3 h-3" />
                        {item.evidence_name ?? 'View Evidence'}
                      </a>
                    )}

                    {/* Notes */}
                    {item.status !== 'not_applicable' && (
                      <input
                        type="text"
                        value={noteValue}
                        onChange={e => setEditNotes(n => ({ ...n, [item.id]: e.target.value }))}
                        onBlur={e => {
                          if (e.target.value !== (item.notes ?? '')) {
                            onUpdate(item.id, item.status, e.target.value);
                          }
                        }}
                        placeholder="Add note or action owner…"
                        className="mt-2 w-full max-w-md border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      />
                    )}
                  </div>

                  {/* Status buttons */}
                  <div className="flex gap-1.5 flex-shrink-0 flex-wrap justify-end">
                    {(['ready','in_progress','gap','not_applicable'] as ReadinessStatus[]).map(s => (
                      <StatusButton key={s} status={s} current={item.status}
                        onClick={() => onUpdate(item.id, s, noteValue)} />
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Main page ──────────────────────────────────────────────── */

export default function GmpInspectionPage() {
  const { user, profile } = useAuth();
  const companyId = (profile as any)?.company_id ?? '';
  const userId = user?.id ?? '';

  const [report, setReport] = useState<InspectionReport | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const log = await getReadinessLog(companyId);
    setReport(buildInspectionReport(companyId, log));
    setLoading(false);
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  const handleUpdate = async (itemId: string, status: ReadinessStatus, notes: string) => {
    await updateReadinessItem(companyId, itemId, status, notes, userId);
    // Optimistic update — rebuild report from current data
    setReport(prev => {
      if (!prev) return prev;
      const updatedAreas = prev.areas.map(area => ({
        ...area,
        items: area.items.map(item =>
          item.id === itemId ? { ...item, status, notes: notes || null } : item
        ),
      }));
      // Recompute scores
      let totalReady = 0, totalGap = 0, totalInProgress = 0, totalCriticalGap = 0;
      const recomputed = updatedAreas.map(area => {
        let ready = 0, gap = 0, inProgress = 0, notApplicable = 0, critical_gaps = 0;
        for (const item of area.items) {
          if (item.status === 'ready')           ready++;
          else if (item.status === 'in_progress') inProgress++;
          else if (item.status === 'gap')         gap++;
          else if (item.status === 'not_applicable') notApplicable++;
          if (item.status === 'gap' && item.isCritical) critical_gaps++;
        }
        const applicable = area.total - notApplicable;
        const score = applicable > 0 ? Math.round((ready / applicable) * 100) : 100;
        totalReady += ready; totalGap += gap;
        totalInProgress += inProgress; totalCriticalGap += critical_gaps;
        return { ...area, ready, gap, inProgress, notApplicable, critical_gaps, score };
      });
      const totalNotApplicable = recomputed.reduce((s, a) => s + a.notApplicable, 0);
      const applicable = prev.totalItems - totalNotApplicable;
      const overallScore = applicable > 0 ? Math.round((totalReady / applicable) * 100) : 0;
      return { ...prev, overallScore, readyCount: totalReady, gapCount: totalGap, inProgressCount: totalInProgress, criticalGapCount: totalCriticalGap, areas: recomputed };
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!report) return null;

  const scoreColor = report.overallScore >= 90 ? 'text-green-600' : report.overallScore >= 60 ? 'text-amber-600' : 'text-red-600';
  const scoreBg    = report.overallScore >= 90 ? 'bg-green-50 border-green-200' : report.overallScore >= 60 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200';

  const criticalGapItems = report.areas
    .flatMap(a => a.items)
    .filter(i => i.isCritical && i.status === 'gap');

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Factory className="w-6 h-6 text-blue-600" />
            GMP Inspection Readiness
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Based on NAFDAC GMP inspection criteria — {INSPECTION_ITEMS.length} items across {INSPECTION_AREAS.length} areas
          </p>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Overall score + stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className={`rounded-xl border p-5 col-span-1 ${scoreBg}`}>
          <p className="text-xs font-medium text-gray-500">Inspection Readiness</p>
          <p className={`text-4xl font-bold mt-1 ${scoreColor}`}>{report.overallScore}%</p>
          <p className="text-xs text-gray-400 mt-1">{report.totalItems} items assessed</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-xs font-medium text-gray-500">Ready</p>
          <p className="text-3xl font-bold text-green-600 mt-1">{report.readyCount}</p>
          <p className="text-xs text-gray-400 mt-1">confirmed items</p>
        </div>
        <div className={`rounded-xl border p-5 ${report.criticalGapCount > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
          <p className="text-xs font-medium text-gray-500">Critical Gaps</p>
          <p className={`text-3xl font-bold mt-1 ${report.criticalGapCount > 0 ? 'text-red-700' : 'text-gray-900'}`}>
            {report.criticalGapCount}
          </p>
          <p className="text-xs text-gray-400 mt-1">immediate fail risk</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-xs font-medium text-gray-500">In Progress</p>
          <p className="text-3xl font-bold text-amber-600 mt-1">{report.inProgressCount}</p>
          <p className="text-xs text-gray-400 mt-1">{report.gapCount} gaps remaining</p>
        </div>
      </div>

      {/* Critical gaps — shown prominently at top */}
      {criticalGapItems.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <p className="font-semibold text-red-800 text-sm">
              {criticalGapItems.length} Critical Gap{criticalGapItems.length !== 1 ? 's' : ''} — Immediate Fail Risk
            </p>
            <p className="text-xs text-red-500">Resolve these before any NAFDAC inspection</p>
          </div>
          <div className="space-y-2">
            {criticalGapItems.map(item => (
              <div key={item.id} className="flex items-start gap-2 bg-white rounded-lg px-3 py-2.5 border border-red-200">
                <XCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="text-sm font-medium text-gray-900">{item.title}</span>
                  <span className="text-xs text-gray-400 ml-2">{item.id} · {item.area}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Area accordions — worst-scoring first */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Inspection Areas — click to expand and update readiness
        </p>
        {[...report.areas]
          .sort((a, b) => a.score - b.score)
          .map((area, i) => (
            <AreaPanel
              key={area.area}
              areaScore={area}
              onUpdate={handleUpdate}
              defaultOpen={i === 0 && area.score < 100}
            />
          ))}
      </div>
    </div>
  );
}
