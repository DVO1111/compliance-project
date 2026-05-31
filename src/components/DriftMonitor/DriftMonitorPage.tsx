// src/components/DriftMonitor/DriftMonitorPage.tsx
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
    Radar, Plus, X, RefreshCw, CheckCircle, AlertTriangle,
    Shield, Globe, Trash2, Eye, Send, XCircle, Clock,
    Activity, AlertCircle, Search, Loader2,
} from 'lucide-react';
import {
    addChannel, getChannels, removeChannel, checkForDrift,
    getAlerts, resolveAlert, getDriftStats,
    type MonitoredChannel, type DriftAlert, type ChannelType,
} from '../../lib/driftMonitorService';
import {
    scanForAdverseEvents, getAdverseEvents, quarantineEvent,
    reportEvent, dismissEvent, getAEStats,
    type AdverseEvent,
} from '../../lib/adverseEventService';

const CHANNEL_TYPES: { value: ChannelType; label: string }[] = [
    { value: 'website', label: 'Website' },
    { value: 'landing_page', label: 'Landing Page' },
    { value: 'instagram', label: 'Instagram' },
    { value: 'linkedin', label: 'LinkedIn' },
    { value: 'x', label: 'X (Twitter)' },
    { value: 'facebook', label: 'Facebook' },
    { value: 'email', label: 'Email Campaign' },
    { value: 'print', label: 'Print' },
];

const SEVERITY_COLORS: Record<string, string> = {
    low: 'bg-[var(--color-info-soft)] text-[var(--color-info)]',
    medium: 'bg-[var(--color-warning-soft)] text-[var(--color-warning)]',
    high: 'bg-[var(--color-warning-soft)] text-[var(--color-warning)]',
    critical: 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]',
};

const AE_STATUS_COLORS: Record<string, string> = {
    detected: 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]',
    quarantined: 'bg-[var(--color-warning-soft)] text-[var(--color-warning)]',
    reported: 'bg-[var(--color-info-soft)] text-[var(--color-info)]',
    dismissed: 'bg-[var(--color-surface-alt)] text-[var(--color-text-secondary)]',
};

export default function DriftMonitorPage() {
    const { user, profile } = useAuth();
    const companyId = (profile as any)?.company_id as string | undefined;

    const [tab, setTab] = useState<'channels' | 'drift' | 'adverse'>('channels');
    const [channels, setChannels] = useState<MonitoredChannel[]>([]);
    const [alerts, setAlerts] = useState<DriftAlert[]>([]);
    const [aeEvents, setAeEvents] = useState<AdverseEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [driftStats, setDriftStats] = useState({ total: 0, unresolved: 0, critical: 0, high: 0 });
    const [aeStats, setAeStats] = useState({ total: 0, detected: 0, quarantined: 0, reported: 0, critical: 0 });

    // Add channel modal
    const [showAddModal, setShowAddModal] = useState(false);
    const [newName, setNewName] = useState('');
    const [newType, setNewType] = useState<ChannelType>('website');
    const [newUrl, setNewUrl] = useState('');
    const [newSnapshot, setNewSnapshot] = useState('');
    const [adding, setAdding] = useState(false);

    // Check drift modal
    const [checkingChannelId, setCheckingChannelId] = useState<string | null>(null);
    const [driftCheckContent, setDriftCheckContent] = useState('');
    const [checkResult, setCheckResult] = useState<string | null>(null);

    // AE scan
    const [aeScanText, setAeScanText] = useState('');
    const [aeScanning, setAeScanning] = useState(false);
    const [aeReportModal, setAeReportModal] = useState<AdverseEvent | null>(null);
    const [aeReportNotes, setAeReportNotes] = useState('');

    const load = useCallback(async () => {
        if (!companyId) return;
        setLoading(true);
        const [ch, al, ae, ds, as_] = await Promise.all([
            getChannels(companyId),
            getAlerts(companyId),
            getAdverseEvents(companyId),
            getDriftStats(companyId),
            getAEStats(companyId),
        ]);
        setChannels(ch);
        setAlerts(al);
        setAeEvents(ae);
        setDriftStats(ds);
        setAeStats(as_);
        setLoading(false);
    }, [companyId]);

    useEffect(() => { load(); }, [load]);

    const handleAddChannel = async () => {
        if (!companyId || !newName.trim()) return;
        setAdding(true);
        await addChannel(companyId, newName, newType, newUrl || null, newSnapshot || null);
        setShowAddModal(false);
        setNewName(''); setNewUrl(''); setNewSnapshot('');
        await load();
        setAdding(false);
    };

    const handleRemoveChannel = async (id: string) => {
        if (!confirm('Archive this channel?')) return;
        await removeChannel(id);
        await load();
    };

    const handleCheckDrift = async () => {
        if (!companyId || !checkingChannelId || !driftCheckContent.trim()) return;
        const result = await checkForDrift(companyId, checkingChannelId, driftCheckContent);
        setCheckResult(result ? `⚠️ DRIFT DETECTED — ${result.diff_summary}` : '✅ No drift detected. Content matches approved version.');
        await load();
    };

    const handleResolveDrift = async (alertId: string) => {
        if (!user) return;
        await resolveAlert(alertId, user.id);
        await load();
    };

    const handleAEScan = async () => {
        if (!companyId || !aeScanText.trim()) return;
        setAeScanning(true);
        const detected = await scanForAdverseEvents(companyId, null, aeScanText);
        if (detected.length === 0) {
            setCheckResult('✅ No adverse events detected in the scanned text.');
        } else {
            setCheckResult(`⚠️ ${detected.length} potential adverse event(s) detected and logged.`);
        }
        await load();
        setAeScanning(false);
    };

    const handleQuarantine = async (id: string) => { await quarantineEvent(id); await load(); };
    const handleDismiss = async (id: string) => { if (!user) return; await dismissEvent(id, user.id); await load(); };
    const handleReport = async () => {
        if (!aeReportModal || !user) return;
        await reportEvent(aeReportModal.id, aeReportNotes, user.id);
        setAeReportModal(null); setAeReportNotes('');
        await load();
    };

    if (!companyId) {
        return (
            <div className="text-center py-16">
                <Radar className="w-10 h-10 text-[var(--color-text-tertiary)] mx-auto mb-3" />
                <p className="text-sm text-[var(--color-text-secondary)]">Company not set. Please complete onboarding.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <div className="p-2 rounded-xl bg-[var(--color-accent-soft)]">
                            <Radar className="w-5 h-5 dash-accent" />
                        </div>
                        <h2 className="text-2xl font-bold dash-text">Omnichannel Monitor</h2>
                    </div>
                    <p className="dash-text-secondary text-sm ml-12">Content drift detection & adverse event sentinel</p>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="dash-card rounded-xl p-4 border border-[var(--color-border)]">
                    <p className="text-[11px] dash-text-tertiary">Channels</p>
                    <p className="text-xl font-bold dash-text mt-1">{channels.length}</p>
                </div>
                <div className="dash-card rounded-xl p-4 border border-[var(--color-border)]">
                    <p className="text-[11px] dash-text-tertiary">Drift Alerts</p>
                    <p className="text-xl font-bold text-[var(--color-warning)] mt-1">{driftStats.unresolved}</p>
                </div>
                <div className="dash-card rounded-xl p-4 border border-[var(--color-border)]">
                    <p className="text-[11px] dash-text-tertiary">Critical Drifts</p>
                    <p className="text-xl font-bold text-[var(--color-danger)] mt-1">{driftStats.critical}</p>
                </div>
                <div className="dash-card rounded-xl p-4 border border-[var(--color-border)]">
                    <p className="text-[11px] dash-text-tertiary">AE Detected</p>
                    <p className="text-xl font-bold text-[var(--color-warning)] mt-1">{aeStats.detected}</p>
                </div>
                <div className="dash-card rounded-xl p-4 border border-[var(--color-border)]">
                    <p className="text-[11px] dash-text-tertiary">AE Critical</p>
                    <p className="text-xl font-bold text-[var(--color-danger)] mt-1">{aeStats.critical}</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-2 flex-wrap">
                {([['channels', 'Channels'], ['drift', 'Drift Alerts'], ['adverse', 'Adverse Events']] as const).map(([key, label]) => (
                    <button key={key} onClick={() => setTab(key)}
                        className={`px-4 py-2 rounded-xl text-sm font-medium transition ${tab === key ? 'bg-[var(--color-accent)] text-white' : 'dash-card border border-[var(--color-border)] dash-text-secondary hover:dash-text'}`}>
                        {label}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 animate-spin dash-accent" /></div>
            ) : (
                <>
                    {/* Channels Tab */}
                    {tab === 'channels' && (
                        <div className="dash-card rounded-2xl border border-[var(--color-border)] overflow-hidden">
                            <div className="px-5 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
                                <h3 className="font-semibold dash-text flex items-center gap-2"><Globe className="w-4 h-4 dash-accent" />Monitored Channels</h3>
                                <button onClick={() => setShowAddModal(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-[var(--color-accent)] text-white hover:opacity-90 transition">
                                    <Plus className="w-4 h-4" />Add Channel
                                </button>
                            </div>
                            {channels.length === 0 ? (
                                <div className="text-center py-14 px-4">
                                    <Globe className="w-8 h-8 dash-text-tertiary mx-auto mb-2" />
                                    <p className="text-sm dash-text-secondary">No channels monitored yet. Add your first channel.</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-[var(--color-border)]">
                                    {channels.map((ch) => (
                                        <div key={ch.id} className="px-5 py-4 flex items-center gap-4">
                                            <div className="p-2 rounded-lg bg-[var(--color-surface-alt)]">
                                                <Globe className="w-4 h-4 dash-accent" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-semibold dash-text text-sm">{ch.channel_name}</p>
                                                <div className="flex items-center gap-3 text-xs dash-text-tertiary mt-0.5">
                                                    <span className="px-2 py-0.5 rounded-full bg-[var(--color-surface-alt)] font-medium">{ch.channel_type}</span>
                                                    {ch.url && <span className="truncate">{ch.url}</span>}
                                                    <span><Clock className="w-3 h-3 inline" /> {ch.last_checked_at ? new Date(ch.last_checked_at).toLocaleString() : 'Never checked'}</span>
                                                </div>
                                            </div>
                                            <button onClick={() => { setCheckingChannelId(ch.id); setDriftCheckContent(''); setCheckResult(null); }}
                                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--color-border)] dash-text-secondary hover:dash-text transition">
                                                <RefreshCw className="w-3.5 h-3.5" />Check
                                            </button>
                                            <button onClick={() => handleRemoveChannel(ch.id)} className="p-1.5 rounded-lg hover:bg-[var(--color-danger-soft)] text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)] transition">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Drift Alerts Tab */}
                    {tab === 'drift' && (
                        <div className="dash-card rounded-2xl border border-[var(--color-border)] overflow-hidden">
                            <div className="px-5 py-3 border-b border-[var(--color-border)]">
                                <h3 className="font-semibold dash-text flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-[var(--color-warning)]" />Drift Alerts</h3>
                            </div>
                            {alerts.length === 0 ? (
                                <div className="text-center py-14"><Shield className="w-8 h-8 dash-text-tertiary mx-auto mb-2" /><p className="text-sm dash-text-secondary">No drift alerts detected.</p></div>
                            ) : (
                                <div className="divide-y divide-[var(--color-border)]">
                                    {alerts.map((alert) => (
                                        <div key={alert.id} className={`px-5 py-4 ${alert.resolved ? 'opacity-60' : ''}`}>
                                            <div className="flex items-start gap-3">
                                                <div className="mt-0.5">{alert.resolved ? <CheckCircle className="w-5 h-5 text-[var(--color-success)]" /> : <AlertTriangle className="w-5 h-5 text-[var(--color-warning)]" />}</div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${SEVERITY_COLORS[alert.severity]}`}>{alert.severity}</span>
                                                        <span className="text-xs dash-text-tertiary">{alert.drift_type.replace(/_/g, ' ')}</span>
                                                        <span className="text-xs dash-text-tertiary">• {new Date(alert.detected_at).toLocaleString()}</span>
                                                    </div>
                                                    <p className="text-sm dash-text-secondary mt-1">{alert.diff_summary}</p>
                                                </div>
                                                {!alert.resolved && (
                                                    <button onClick={() => handleResolveDrift(alert.id)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--color-success-soft)] text-[var(--color-success)] hover:bg-[var(--color-success-soft)] transition">
                                                        <CheckCircle className="w-3.5 h-3.5" />Resolve
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Adverse Events Tab */}
                    {tab === 'adverse' && (
                        <div className="space-y-4">
                            {/* AE Scanner */}
                            <div className="dash-card rounded-2xl border border-[var(--color-border)] p-5">
                                <h3 className="font-semibold dash-text flex items-center gap-2 mb-3"><Search className="w-4 h-4 dash-accent" />Adverse Event Scanner</h3>
                                <p className="text-xs dash-text-tertiary mb-3">Paste social media comments or user feedback to scan for potential adverse events.</p>
                                <textarea value={aeScanText} onChange={(e) => setAeScanText(e.target.value)} rows={4} placeholder="Paste text to scan for adverse events..."
                                    className="w-full border border-[var(--color-border)] rounded-xl px-4 py-3 text-sm dash-surface dash-text resize-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent" />
                                <button onClick={handleAEScan} disabled={aeScanning || !aeScanText.trim()}
                                    className="mt-3 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-[var(--color-accent)] hover:opacity-90 disabled:opacity-50 transition">
                                    {aeScanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
                                    Scan for Adverse Events
                                </button>
                                {checkResult && (
                                    <div className={`mt-3 rounded-lg p-3 text-sm ${checkResult.startsWith('✅') ? 'bg-[var(--color-success-soft)] text-[var(--color-success)]' : 'bg-[var(--color-warning-soft)] text-[var(--color-warning)]'}`}>
                                        {checkResult}
                                    </div>
                                )}
                            </div>

                            {/* AE Events */}
                            <div className="dash-card rounded-2xl border border-[var(--color-border)] overflow-hidden">
                                <div className="px-5 py-3 border-b border-[var(--color-border)]">
                                    <h3 className="font-semibold dash-text flex items-center gap-2"><AlertCircle className="w-4 h-4 text-[var(--color-danger)]" />Detected Events ({aeEvents.length})</h3>
                                </div>
                                {aeEvents.length === 0 ? (
                                    <div className="text-center py-14"><Shield className="w-8 h-8 dash-text-tertiary mx-auto mb-2" /><p className="text-sm dash-text-secondary">No adverse events detected.</p></div>
                                ) : (
                                    <div className="divide-y divide-[var(--color-border)]">
                                        {aeEvents.map((ae) => (
                                            <div key={ae.id} className="px-5 py-4">
                                                <div className="flex items-start gap-3">
                                                    <AlertCircle className="w-5 h-5 text-[var(--color-danger)] mt-0.5 shrink-0" />
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 flex-wrap mb-1">
                                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${SEVERITY_COLORS[ae.severity]}`}>{ae.severity}</span>
                                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${AE_STATUS_COLORS[ae.status]}`}>{ae.status}</span>
                                                            <span className="text-xs dash-text-tertiary">{new Date(ae.detected_at).toLocaleString()}</span>
                                                        </div>
                                                        <p className="text-sm font-medium dash-text">Detected: "{ae.detected_phrase}"</p>
                                                        <p className="text-xs dash-text-secondary mt-1 italic">"{ae.source_text}"</p>
                                                    </div>
                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                        {ae.status === 'detected' && (
                                                            <>
                                                                <button onClick={() => handleQuarantine(ae.id)} className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-[var(--color-warning-soft)] text-[var(--color-warning)] hover:bg-[var(--color-warning-soft)] transition" title="Quarantine">Quarantine</button>
                                                                <button onClick={() => { setAeReportModal(ae); setAeReportNotes(''); }} className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-[var(--color-info-soft)] text-[var(--color-info)] hover:bg-[var(--color-info-soft)] transition" title="Report"><Send className="w-3 h-3 inline" /> Report</button>
                                                                <button onClick={() => handleDismiss(ae.id)} className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-[var(--color-surface-alt)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-alt)] transition" title="Dismiss"><XCircle className="w-3 h-3 inline" /></button>
                                                            </>
                                                        )}
                                                        {ae.status === 'quarantined' && (
                                                            <button onClick={() => { setAeReportModal(ae); setAeReportNotes(''); }} className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-[var(--color-info-soft)] text-[var(--color-info)] hover:bg-[var(--color-info-soft)] transition"><Send className="w-3 h-3 inline" /> Report to PV</button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* Add Channel Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="dash-card rounded-2xl max-w-lg w-full overflow-hidden">
                        <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
                            <h3 className="font-bold dash-text">Add Monitored Channel</h3>
                            <button onClick={() => setShowAddModal(false)} className="p-1 hover:bg-[var(--color-surface-alt)] rounded-lg"><X className="w-4 h-4" /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div><label className="text-xs font-semibold dash-text-secondary block mb-1">Channel Name *</label>
                                <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Product Landing Page" className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm dash-surface dash-text" /></div>
                            <div><label className="text-xs font-semibold dash-text-secondary block mb-1">Channel Type</label>
                                <select value={newType} onChange={(e) => setNewType(e.target.value as ChannelType)} className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm dash-surface dash-text">
                                    {CHANNEL_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                                </select></div>
                            <div><label className="text-xs font-semibold dash-text-secondary block mb-1">URL (optional)</label>
                                <input value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="https://..." className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm dash-surface dash-text" /></div>
                            <div><label className="text-xs font-semibold dash-text-secondary block mb-1">Approved Content Snapshot (optional)</label>
                                <textarea value={newSnapshot} onChange={(e) => setNewSnapshot(e.target.value)} rows={3} placeholder="Paste the approved content text for hash comparison" className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm dash-surface dash-text resize-none" /></div>
                            <button onClick={handleAddChannel} disabled={adding || !newName.trim()} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-[var(--color-accent)] hover:opacity-90 disabled:opacity-50 transition">
                                {adding ? 'Adding...' : 'Add Channel'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Check Drift Modal */}
            {checkingChannelId && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="dash-card rounded-2xl max-w-lg w-full overflow-hidden">
                        <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
                            <h3 className="font-bold dash-text">Check for Content Drift</h3>
                            <button onClick={() => { setCheckingChannelId(null); setCheckResult(null); }} className="p-1 hover:bg-[var(--color-surface-alt)] rounded-lg"><X className="w-4 h-4" /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <p className="text-xs dash-text-tertiary">Paste the current live content below. It will be compared against the approved version.</p>
                            <textarea value={driftCheckContent} onChange={(e) => setDriftCheckContent(e.target.value)} rows={5} placeholder="Paste current live content..." className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm dash-surface dash-text resize-none" />
                            <button onClick={handleCheckDrift} disabled={!driftCheckContent.trim()} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-[var(--color-accent)] hover:opacity-90 disabled:opacity-50 transition">Check for Drift</button>
                            {checkResult && <div className={`rounded-lg p-3 text-sm ${checkResult.startsWith('✅') ? 'bg-[var(--color-success-soft)] text-[var(--color-success)]' : 'bg-[var(--color-warning-soft)] text-[var(--color-warning)]'}`}>{checkResult}</div>}
                        </div>
                    </div>
                </div>
            )}

            {/* Report AE Modal */}
            {aeReportModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="dash-card rounded-2xl max-w-lg w-full overflow-hidden">
                        <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
                            <h3 className="font-bold dash-text">Report to Pharmacovigilance</h3>
                            <button onClick={() => setAeReportModal(null)} className="p-1 hover:bg-[var(--color-surface-alt)] rounded-lg"><X className="w-4 h-4" /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="bg-[var(--color-danger-soft)] border border-[var(--color-danger)]/20 rounded-lg p-3 text-sm text-[var(--color-danger)]">
                                <p className="font-semibold">Detected phrase: "{aeReportModal.detected_phrase}"</p>
                                <p className="mt-1 text-xs italic">"{aeReportModal.source_text}"</p>
                            </div>
                            <div><label className="text-xs font-semibold dash-text-secondary block mb-1">Reporter Notes</label>
                                <textarea value={aeReportNotes} onChange={(e) => setAeReportNotes(e.target.value)} rows={3} placeholder="Add context for the pharmacovigilance team..." className="w-full border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm dash-surface dash-text resize-none" /></div>
                            <button onClick={handleReport} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-[var(--color-danger)] hover:opacity-90 transition">Submit Report</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
