import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  AlertRule,
  AlertLogEntry,
  AlertDigestSummary,
  AlertTriggerType,
  DEFAULT_RULE_TEMPLATES,
  TRIGGER_LABELS,
  TRIGGER_DESCRIPTIONS,
  getAlertRules,
  upsertAlertRule,
  getAlertHistory,
  resolveAlert,
  getAlertDigest,
  triggerComplianceScan,
} from '../../lib/complianceAlertingService';
import {
  Bell,
  BellOff,
  Mail,
  Smartphone,
  Users,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  Clock,
  Shield,
  FileText,
  Zap,
  ChevronDown,
  ChevronUp,
  Play,
  BarChart3,
  History,
  Settings,
} from 'lucide-react';

type Tab = 'rules' | 'history' | 'digest';

const TRIGGER_ICONS: Record<AlertTriggerType, React.ReactNode> = {
  capa_overdue:          <AlertTriangle className="w-5 h-5 text-red-500" />,
  licence_expiring:      <FileText className="w-5 h-5 text-amber-500" />,
  obligation_overdue:    <Clock className="w-5 h-5 text-orange-500" />,
  control_non_compliant: <Shield className="w-5 h-5 text-purple-500" />,
  deviation_raised:      <Zap className="w-5 h-5 text-blue-500" />,
};

const ALL_TRIGGER_TYPES: AlertTriggerType[] = [
  'capa_overdue',
  'licence_expiring',
  'obligation_overdue',
  'control_non_compliant',
  'deviation_raised',
];

function RuleCard({
  triggerType,
  savedRule,
  onSave,
}: {
  triggerType: AlertTriggerType;
  savedRule: AlertRule | undefined;
  onSave: (rule: Omit<AlertRule, 'id' | 'company_id' | 'created_by' | 'created_at' | 'updated_at'>) => Promise<void>;
}) {
  const template = DEFAULT_RULE_TEMPLATES.find((t) => t.trigger_type === triggerType)!;
  const initial = savedRule ?? template;

  const [thresholdDays, setThresholdDays] = useState(initial.threshold_days);
  const [escalationDays, setEscalationDays] = useState(initial.escalation_days);
  const [notifyOwner, setNotifyOwner] = useState(initial.notify_owner);
  const [notifyAdmins, setNotifyAdmins] = useState(initial.notify_admins);
  const [notifyEmail, setNotifyEmail] = useState(initial.notify_email);
  const [notifyInApp, setNotifyInApp] = useState(initial.notify_in_app);
  const [isActive, setIsActive] = useState(initial.is_active);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave({
      trigger_type: triggerType,
      threshold_days: thresholdDays,
      escalation_days: escalationDays,
      notify_owner: notifyOwner,
      notify_admins: notifyAdmins,
      notify_email: notifyEmail,
      notify_in_app: notifyInApp,
      is_active: isActive,
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const isDirty =
    thresholdDays !== initial.threshold_days ||
    escalationDays !== initial.escalation_days ||
    notifyOwner !== initial.notify_owner ||
    notifyAdmins !== initial.notify_admins ||
    notifyEmail !== initial.notify_email ||
    notifyInApp !== initial.notify_in_app ||
    isActive !== initial.is_active;

  return (
    <div className={`border rounded-xl transition-all ${isActive ? 'border-[var(--color-border,#e5e7eb)] bg-[var(--color-surface,#fff)]' : 'border-dashed border-gray-300 bg-gray-50 dark:bg-gray-800/50 opacity-75'}`}>
      <div className="flex items-center gap-3 p-4 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex-shrink-0">{TRIGGER_ICONS[triggerType]}</div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-[var(--color-text-primary,#111)] text-sm">{TRIGGER_LABELS[triggerType]}</p>
          <p className="text-xs text-[var(--color-text-secondary,#6b7280)] mt-0.5">{TRIGGER_DESCRIPTIONS[triggerType]}</p>
        </div>
        <div className="flex items-center gap-2">
          {savedRule && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
              {isActive ? 'Active' : 'Inactive'}
            </span>
          )}
          {!savedRule && (
            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-50 text-blue-600">Default</span>
          )}
          {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-[var(--color-border,#e5e7eb)] p-4 space-y-4">
          {/* Active toggle */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-[var(--color-text-primary,#111)]">Rule enabled</span>
            <button
              onClick={() => setIsActive(!isActive)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isActive ? 'bg-[#2943D6]' : 'bg-gray-300'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isActive ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>

          {/* Threshold */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-secondary,#6b7280)] mb-1">
                {triggerType === 'licence_expiring' ? 'Alert before expiry (days)' : 'Threshold (days overdue)'}
              </label>
              <input
                type="number"
                min={0}
                max={365}
                value={thresholdDays}
                onChange={(e) => setThresholdDays(parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-[var(--color-border,#e5e7eb)] rounded-lg text-sm bg-[var(--color-surface,#fff)] text-[var(--color-text-primary,#111)]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-secondary,#6b7280)] mb-1">Escalate after (days)</label>
              <input
                type="number"
                min={1}
                max={30}
                value={escalationDays}
                onChange={(e) => setEscalationDays(parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2 border border-[var(--color-border,#e5e7eb)] rounded-lg text-sm bg-[var(--color-surface,#fff)] text-[var(--color-text-primary,#111)]"
              />
            </div>
          </div>

          {/* Notify targets */}
          <div>
            <p className="text-xs font-medium text-[var(--color-text-secondary,#6b7280)] mb-2">Notify</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Record owner', icon: <Users className="w-3.5 h-3.5" />, value: notifyOwner, onChange: setNotifyOwner },
                { label: 'Admins', icon: <Shield className="w-3.5 h-3.5" />, value: notifyAdmins, onChange: setNotifyAdmins },
                { label: 'Email', icon: <Mail className="w-3.5 h-3.5" />, value: notifyEmail, onChange: setNotifyEmail },
                { label: 'In-app', icon: <Smartphone className="w-3.5 h-3.5" />, value: notifyInApp, onChange: setNotifyInApp },
              ].map(({ label, icon, value, onChange }) => (
                <button
                  key={label}
                  onClick={() => onChange(!value)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                    value
                      ? 'bg-[#2943D6]/10 border-[#2943D6]/30 text-[#2943D6]'
                      : 'bg-gray-50 border-gray-200 text-gray-500 dark:bg-gray-800 dark:border-gray-600'
                  }`}
                >
                  {icon}
                  {label}
                  {value ? <CheckCircle className="w-3.5 h-3.5 ml-auto" /> : <BellOff className="w-3.5 h-3.5 ml-auto" />}
                </button>
              ))}
            </div>
          </div>

          {/* Save */}
          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving || (!isDirty && !!savedRule)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                saved
                  ? 'bg-green-600 text-white'
                  : isDirty || !savedRule
                  ? 'bg-[#2943D6] text-white hover:bg-[#1e33b0]'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              {saving ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : saved ? (
                <CheckCircle className="w-4 h-4" />
              ) : null}
              {saved ? 'Saved' : saving ? 'Saving…' : savedRule ? 'Update rule' : 'Save rule'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AlertTypeBadge({ type }: { type: AlertTriggerType }) {
  const colors: Record<AlertTriggerType, string> = {
    capa_overdue:          'bg-red-100 text-red-700',
    licence_expiring:      'bg-amber-100 text-amber-700',
    obligation_overdue:    'bg-orange-100 text-orange-700',
    control_non_compliant: 'bg-purple-100 text-purple-700',
    deviation_raised:      'bg-blue-100 text-blue-700',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${colors[type] ?? 'bg-gray-100 text-gray-600'}`}>
      {TRIGGER_ICONS[type]}
      {TRIGGER_LABELS[type]}
    </span>
  );
}

export default function ComplianceAlertingPage() {
  const { profile, user } = useAuth();
  const companyId = (profile as any)?.company_id as string | undefined;
  const userId = user?.id ?? '';

  const [tab, setTab] = useState<Tab>('rules');
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [history, setHistory] = useState<AlertLogEntry[]>([]);
  const [digest, setDigest] = useState<AlertDigestSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{ fired: number; errors: string[] } | null>(null);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const [r, h, d] = await Promise.all([
      getAlertRules(companyId),
      getAlertHistory(companyId, 50),
      getAlertDigest(companyId),
    ]);
    setRules(r);
    setHistory(h);
    setDigest(d);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  const handleSaveRule = async (
    rule: Omit<AlertRule, 'id' | 'company_id' | 'created_by' | 'created_at' | 'updated_at'>
  ) => {
    if (!companyId) return;
    const saved = await upsertAlertRule(companyId, userId, rule);
    if (saved) {
      setRules((prev) => {
        const idx = prev.findIndex((r) => r.trigger_type === saved.trigger_type);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = saved;
          return next;
        }
        return [...prev, saved];
      });
    }
  };

  const handleScan = async () => {
    if (!companyId) return;
    setScanning(true);
    setScanResult(null);
    const result = await triggerComplianceScan(companyId);
    setScanResult(result);
    setScanning(false);
    // Refresh history after scan
    const h = await getAlertHistory(companyId, 50);
    setHistory(h);
    const d = await getAlertDigest(companyId);
    setDigest(d);
  };

  const handleResolve = async (alertId: string) => {
    if (!companyId) return;
    await resolveAlert(companyId, alertId);
    setHistory((prev) =>
      prev.map((a) => a.id === alertId ? { ...a, resolved_at: new Date().toISOString() } : a)
    );
  };

  const activeRules = rules.filter((r) => r.is_active).length;
  const unresolvedToday = history.filter((h) => !h.resolved_at && h.fired_date === new Date().toISOString().slice(0, 10)).length;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary,#111)]">Compliance Alerting</h1>
          <p className="text-sm text-[var(--color-text-secondary,#6b7280)] mt-1">
            Push notifications, email digests, and escalation rules for compliance events.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {scanResult && (
            <span className={`text-xs px-3 py-1.5 rounded-lg font-medium ${scanResult.fired > 0 ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
              {scanResult.fired} alert{scanResult.fired !== 1 ? 's' : ''} fired
            </span>
          )}
          <button
            onClick={handleScan}
            disabled={scanning}
            className="flex items-center gap-2 px-4 py-2 bg-[#2943D6] text-white rounded-lg text-sm font-medium hover:bg-[#1e33b0] disabled:opacity-50 transition-colors"
          >
            {scanning ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {scanning ? 'Scanning…' : 'Run Scan Now'}
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Active rules', value: loading ? '—' : activeRules, icon: <Bell className="w-5 h-5 text-[#2943D6]" />, color: 'text-[#2943D6]' },
          { label: 'Open today', value: loading ? '—' : unresolvedToday, icon: <AlertTriangle className="w-5 h-5 text-red-500" />, color: 'text-red-600' },
          { label: 'Fired (7d)', value: loading ? '—' : digest.reduce((s, d) => s + d.count_7d, 0), icon: <BarChart3 className="w-5 h-5 text-amber-500" />, color: 'text-amber-600' },
          { label: 'Fired (30d)', value: loading ? '—' : digest.reduce((s, d) => s + d.count_30d, 0), icon: <History className="w-5 h-5 text-gray-400" />, color: 'text-gray-600' },
        ].map(({ label, value, icon, color }) => (
          <div key={label} className="bg-[var(--color-surface,#fff)] border border-[var(--color-border,#e5e7eb)] rounded-xl p-4 flex items-center gap-3">
            <div className="p-2 bg-gray-50 rounded-lg dark:bg-gray-800">{icon}</div>
            <div>
              <p className={`text-xl font-bold ${color}`}>{value}</p>
              <p className="text-xs text-[var(--color-text-secondary,#6b7280)]">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl w-fit">
        {([
          { id: 'rules' as Tab, label: 'Alert Rules', icon: <Settings className="w-4 h-4" /> },
          { id: 'history' as Tab, label: 'History', icon: <History className="w-4 h-4" /> },
          { id: 'digest' as Tab, label: 'Digest', icon: <BarChart3 className="w-4 h-4" /> },
        ] as { id: Tab; label: string; icon: React.ReactNode }[]).map(({ id, label, icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === id ? 'bg-white shadow text-[#2943D6] dark:bg-gray-700' : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      {/* ── Rules tab ─────────────────────────────────────────────────────────── */}
      {tab === 'rules' && (
        <div className="space-y-3">
          <p className="text-xs text-[var(--color-text-secondary,#6b7280)]">
            Configure which compliance events trigger notifications. Rules without a saved configuration use system defaults.
          </p>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-16 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : (
            ALL_TRIGGER_TYPES.map((t) => (
              <RuleCard
                key={t}
                triggerType={t}
                savedRule={rules.find((r) => r.trigger_type === t)}
                onSave={handleSaveRule}
              />
            ))
          )}
        </div>
      )}

      {/* ── History tab ───────────────────────────────────────────────────────── */}
      {tab === 'history' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-[var(--color-text-secondary,#6b7280)]">Last 50 alert firings. Resolve alerts to clear them from the active queue.</p>
            <button onClick={load} className="text-xs text-[#2943D6] hover:underline flex items-center gap-1">
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          </div>

          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <div key={i} className="h-14 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />)}
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-16 bg-[var(--color-surface,#fff)] border border-[var(--color-border,#e5e7eb)] rounded-xl">
              <Bell className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm font-medium text-[var(--color-text-secondary,#6b7280)]">No alerts fired yet</p>
              <p className="text-xs text-gray-400 mt-1">Run a scan to detect compliance issues.</p>
            </div>
          ) : (
            <div className="bg-[var(--color-surface,#fff)] border border-[var(--color-border,#e5e7eb)] rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border,#e5e7eb)] bg-gray-50 dark:bg-gray-800">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--color-text-secondary,#6b7280)]">Type</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--color-text-secondary,#6b7280)]">Message</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--color-text-secondary,#6b7280)]">Fired</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--color-text-secondary,#6b7280)]">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {history.map((entry) => (
                    <tr key={entry.id} className="border-b border-[var(--color-border,#e5e7eb)] last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-4 py-3">
                        <AlertTypeBadge type={entry.alert_type as AlertTriggerType} />
                      </td>
                      <td className="px-4 py-3 text-[var(--color-text-primary,#111)] max-w-xs truncate">{entry.message}</td>
                      <td className="px-4 py-3 text-[var(--color-text-secondary,#6b7280)] whitespace-nowrap">
                        {new Date(entry.fired_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-4 py-3">
                        {entry.resolved_at ? (
                          <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                            <CheckCircle className="w-3.5 h-3.5" /> Resolved
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-red-600 font-medium">
                            <AlertTriangle className="w-3.5 h-3.5" /> Open
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {!entry.resolved_at && (
                          <button
                            onClick={() => handleResolve(entry.id)}
                            className="text-xs text-[#2943D6] hover:underline"
                          >
                            Resolve
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Digest tab ────────────────────────────────────────────────────────── */}
      {tab === 'digest' && (
        <div className="space-y-4">
          <p className="text-xs text-[var(--color-text-secondary,#6b7280)]">
            A summary of alert activity. Email digests are sent by the alerting engine when rules fire.
          </p>

          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />)}
            </div>
          ) : (
            <div className="bg-[var(--color-surface,#fff)] border border-[var(--color-border,#e5e7eb)] rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border,#e5e7eb)] bg-gray-50 dark:bg-gray-800">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--color-text-secondary,#6b7280)]">Alert Type</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-[var(--color-text-secondary,#6b7280)]">Today</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-[var(--color-text-secondary,#6b7280)]">Last 7 days</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-[var(--color-text-secondary,#6b7280)]">Last 30 days</th>
                  </tr>
                </thead>
                <tbody>
                  {digest.map((row) => (
                    <tr key={row.trigger_type} className="border-b border-[var(--color-border,#e5e7eb)] last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {TRIGGER_ICONS[row.trigger_type]}
                          <span className="font-medium text-[var(--color-text-primary,#111)]">{row.label}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`font-semibold ${row.count_today > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                          {row.count_today}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`font-semibold ${row.count_7d > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
                          {row.count_7d}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`font-semibold ${row.count_30d > 0 ? 'text-[var(--color-text-primary,#111)]' : 'text-gray-400'}`}>
                          {row.count_30d}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!loading && digest.every((d) => d.count_30d === 0) && (
            <div className="text-center py-8 bg-green-50 border border-green-100 rounded-xl">
              <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
              <p className="text-sm font-medium text-green-700">No alerts fired in the last 30 days</p>
              <p className="text-xs text-green-600 mt-1">All compliance items are within acceptable thresholds.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
