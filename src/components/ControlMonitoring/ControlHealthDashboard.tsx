import { useState, useEffect, useCallback } from 'react';
import {
  Shield, CheckCircle2, AlertTriangle, XCircle, Clock, RefreshCw,
  ChevronDown, ChevronRight, Plus, ClipboardCheck, FileText,
  AlertCircle, Building2, TrendingUp,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import {
  getCompanyHealthReport,
  CompanyHealthReport,
  FrameworkHealth,
  ControlHealth,
  ControlStatus,
} from '../../lib/controlMonitoringService';
import RecordTestModal from './RecordTestModal';
import AddEvidenceModal from './AddEvidenceModal';

/* ── Status helpers ─────────────────────────────────────────── */

const STATUS_CONFIG: Record<ControlStatus, {
  label: string;
  color: string;
  bg: string;
  icon: typeof CheckCircle2;
}> = {
  compliant:         { label: 'Compliant',       color: 'text-green-700',  bg: 'bg-green-100',  icon: CheckCircle2 },
  due_soon:          { label: 'Due Soon',         color: 'text-amber-700',  bg: 'bg-amber-100',  icon: Clock },
  overdue:           { label: 'Overdue',          color: 'text-red-700',    bg: 'bg-red-100',    icon: XCircle },
  failing:           { label: 'Failing',          color: 'text-red-700',    bg: 'bg-red-100',    icon: XCircle },
  partial:           { label: 'Partial',          color: 'text-orange-700', bg: 'bg-orange-100', icon: AlertTriangle },
  untested:          { label: 'Untested',         color: 'text-gray-600',   bg: 'bg-gray-100',   icon: Clock },
  evidence_expiring: { label: 'Evidence Expiring',color: 'text-amber-700',  bg: 'bg-amber-100',  icon: AlertTriangle },
  not_applicable:    { label: 'N/A',              color: 'text-gray-400',   bg: 'bg-gray-50',    icon: CheckCircle2 },
};

function StatusBadge({ status }: { status: ControlStatus }) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color} ${cfg.bg}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

function ScoreRing({ score }: { score: number }) {
  const color = score >= 90 ? 'text-green-600' : score >= 70 ? 'text-amber-500' : score >= 50 ? 'text-orange-500' : 'text-red-600';
  return (
    <span className={`text-3xl font-bold ${color}`}>{score}%</span>
  );
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 90 ? 'bg-green-500' : score >= 70 ? 'bg-amber-500' : score >= 50 ? 'bg-orange-500' : 'bg-red-500';
  return (
    <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
      <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${score}%` }} />
    </div>
  );
}

/* ── Framework card ─────────────────────────────────────────── */

interface FrameworkCardProps {
  fw: FrameworkHealth;
  companyId: string;
  userId: string;
  onRefresh: () => void;
}

function FrameworkCard({ fw, companyId, userId, onRefresh }: FrameworkCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [testTarget, setTestTarget] = useState<ControlHealth | null>(null);
  const [evidenceTarget, setEvidenceTarget] = useState<ControlHealth | null>(null);

  const attentionControls = fw.controls.filter(
    c => c.status === 'overdue' || c.status === 'failing' || c.status === 'partial' || c.status === 'due_soon'
  );

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      {/* Card header */}
      <div
        className="p-4 flex items-start justify-between cursor-pointer hover:bg-gray-50 transition-colors rounded-xl"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-gray-900 text-sm truncate">{fw.frameworkShortName}</span>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full uppercase tracking-wide">
              {fw.jurisdiction}
            </span>
          </div>
          <p className="text-xs text-gray-500 truncate">{fw.frameworkName}</p>
          <div className="mt-2">
            <ScoreBar score={fw.complianceScore} />
            <div className="flex items-center justify-between mt-1">
              <ScoreRing score={fw.complianceScore} />
              <span className="text-xs text-gray-400">{fw.totalControls} controls</span>
            </div>
          </div>
        </div>
        <div className="ml-3 mt-1">
          {expanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
        </div>
      </div>

      {/* Status pills */}
      <div className="px-4 pb-3 flex flex-wrap gap-1.5 border-t border-gray-100 pt-2">
        {fw.compliant > 0   && <span className="text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full">✓ {fw.compliant} pass</span>}
        {fw.dueSoon > 0     && <span className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">⏱ {fw.dueSoon} due soon</span>}
        {fw.overdue > 0     && <span className="text-xs text-red-700 bg-red-50 px-2 py-0.5 rounded-full">✗ {fw.overdue} overdue</span>}
        {fw.failing > 0     && <span className="text-xs text-red-700 bg-red-50 px-2 py-0.5 rounded-full">✗ {fw.failing} failing</span>}
        {fw.untested > 0    && <span className="text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">○ {fw.untested} untested</span>}
      </div>

      {/* Expanded control list */}
      {expanded && (
        <div className="border-t border-gray-200">
          {fw.controls.filter(c => c.status !== 'not_applicable').map(ctrl => (
            <div key={ctrl.controlId} className="px-4 py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono text-gray-500">{ctrl.controlCode}</span>
                    <StatusBadge status={ctrl.status} />
                    {ctrl.daysOverdue && (
                      <span className="text-xs text-red-600">{ctrl.daysOverdue}d overdue</span>
                    )}
                    {ctrl.severity === 'Red' && (
                      <span className="text-xs text-red-500 bg-red-50 px-1.5 py-0.5 rounded">Critical</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-800 mt-0.5 leading-snug">{ctrl.title}</p>
                  {ctrl.lastTestedAt && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      Last tested {new Date(ctrl.lastTestedAt).toLocaleDateString()} · {ctrl.evidenceCount} evidence item{ctrl.evidenceCount !== 1 ? 's' : ''}
                    </p>
                  )}
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => setTestTarget(ctrl)}
                    title="Record test"
                    className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors"
                  >
                    <ClipboardCheck className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setEvidenceTarget(ctrl)}
                    title="Add evidence"
                    className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      {testTarget && (
        <RecordTestModal
          companyId={companyId} userId={userId}
          controlId={testTarget.controlId} controlCode={testTarget.controlCode} controlTitle={testTarget.title}
          onClose={() => setTestTarget(null)}
          onSaved={() => { setTestTarget(null); onRefresh(); }}
        />
      )}
      {evidenceTarget && (
        <AddEvidenceModal
          companyId={companyId} userId={userId}
          controlId={evidenceTarget.controlId} controlCode={evidenceTarget.controlCode} controlTitle={evidenceTarget.title}
          onClose={() => setEvidenceTarget(null)}
          onSaved={() => { setEvidenceTarget(null); onRefresh(); }}
        />
      )}
    </div>
  );
}

/* ── Main dashboard ─────────────────────────────────────────── */

export default function ControlHealthDashboard() {
  const { user, profile } = useAuth();
  const companyId = (profile as any)?.company_id ?? '';
  const userId = user?.id ?? '';

  const [report, setReport] = useState<CompanyHealthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const r = await getCompanyHealthReport(companyId);
    setReport(r);
    setLastRefreshed(new Date());
    setLoading(false);
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  // No enabled frameworks
  if (!report || report.frameworks.length === 0) {
    return (
      <div className="max-w-3xl mx-auto py-16 text-center px-4">
        <Shield className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-gray-800 mb-2">No Frameworks Enabled</h2>
        <p className="text-gray-500 mb-6">
          Enable regulatory frameworks in Company Settings to start tracking control health across your organisation.
        </p>
        <a
          href="#"
          onClick={e => { e.preventDefault(); window.dispatchEvent(new CustomEvent('navigate-to', { detail: { page: 'company-settings' } })); }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
        >
          <Building2 className="w-4 h-4" />
          Go to Company Settings
        </a>
      </div>
    );
  }

  const attentionControls = report.frameworks
    .flatMap(f => f.controls)
    .filter(c => c.status === 'overdue' || c.status === 'failing' || c.status === 'partial' || c.status === 'evidence_expiring')
    .sort((a, b) => {
      const order: Record<string, number> = { failing: 0, overdue: 1, partial: 2, evidence_expiring: 3 };
      return (order[a.status] ?? 9) - (order[b.status] ?? 9);
    });

  const scoreColor = report.overallScore >= 90 ? 'text-green-600' : report.overallScore >= 70 ? 'text-amber-600' : 'text-red-600';
  const scoreBg = report.overallScore >= 90 ? 'bg-green-50 border-green-200' : report.overallScore >= 70 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200';

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Shield className="w-6 h-6 text-blue-600" />
            Control Health Dashboard
          </h1>
          {lastRefreshed && (
            <p className="text-xs text-gray-400 mt-0.5">
              Updated {lastRefreshed.toLocaleTimeString()}
            </p>
          )}
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className={`rounded-xl border p-4 ${scoreBg}`}>
          <p className="text-xs font-medium text-gray-500 mb-1">Overall Score</p>
          <p className={`text-3xl font-bold ${scoreColor}`}>{report.overallScore}%</p>
          <p className="text-xs text-gray-400 mt-1">{report.frameworks.length} frameworks</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-medium text-gray-500 mb-1">Total Controls</p>
          <p className="text-3xl font-bold text-gray-900">{report.totalControls}</p>
          <p className="text-xs text-green-600 mt-1">✓ {report.compliantControls} compliant</p>
        </div>
        <div className={`rounded-xl border p-4 ${report.overdueControls + report.failingControls > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
          <p className="text-xs font-medium text-gray-500 mb-1">Need Attention</p>
          <p className={`text-3xl font-bold ${report.overdueControls + report.failingControls > 0 ? 'text-red-700' : 'text-gray-900'}`}>
            {report.overdueControls + report.failingControls}
          </p>
          <p className="text-xs text-gray-400 mt-1">{report.overdueControls} overdue · {report.failingControls} failing</p>
        </div>
        <div className={`rounded-xl border p-4 ${report.untestedControls > 0 ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-200'}`}>
          <p className="text-xs font-medium text-gray-500 mb-1">Untested</p>
          <p className="text-3xl font-bold text-gray-700">{report.untestedControls}</p>
          <p className="text-xs text-gray-400 mt-1">
            {report.evidenceExpiringCount > 0 ? `${report.evidenceExpiringCount} evidence expiring` : 'No expiring evidence'}
          </p>
        </div>
      </div>

      {/* Attention required */}
      {attentionControls.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-500" />
            <h2 className="font-semibold text-gray-900 text-sm">Attention Required</h2>
            <span className="text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded-full ml-auto">{attentionControls.length} control{attentionControls.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="divide-y divide-gray-100">
            {attentionControls.slice(0, 20).map(ctrl => (
              <div key={ctrl.controlId} className="px-5 py-3 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono text-gray-400">{ctrl.frameworkShortName}</span>
                    <span className="text-xs font-mono text-gray-500">{ctrl.controlCode}</span>
                    <StatusBadge status={ctrl.status} />
                    {ctrl.daysOverdue && <span className="text-xs text-red-600">{ctrl.daysOverdue}d overdue</span>}
                  </div>
                  <p className="text-sm text-gray-800 mt-0.5">{ctrl.title}</p>
                </div>
              </div>
            ))}
            {attentionControls.length > 20 && (
              <p className="px-5 py-3 text-xs text-gray-400">
                +{attentionControls.length - 20} more — expand framework cards below to see all
              </p>
            )}
          </div>
        </div>
      )}

      {/* Framework grid */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4 text-gray-500" />
          <h2 className="font-semibold text-gray-900 text-sm">Framework Health</h2>
          <span className="text-xs text-gray-400">— click any card to expand controls</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {report.frameworks.map(fw => (
            <FrameworkCard
              key={fw.frameworkId}
              fw={fw}
              companyId={companyId}
              userId={userId}
              onRefresh={load}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
