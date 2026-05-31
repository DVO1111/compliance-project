import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { runAuditSimulation, getAuditSimulations, getAuditFindings, type AuditSimulation, type AuditFinding, type AuditType } from '../../lib/mockAuditorService';
import { ShieldCheck, AlertCircle, Clock, ChevronRight, Activity, Zap, FileText, CheckCircle2, AlertTriangle, Sparkles, RefreshCw } from 'lucide-react';

const SEV_COLOR = {
    low: 'dash-text-tertiary bg-[var(--color-surface-alt)]',
    medium: 'text-behance-amber-700 bg-behance-amber-100',
    high: 'text-[var(--color-danger)] bg-[var(--color-danger-soft)]',
    critical: 'text-white bg-[var(--color-danger)]'
};

const SCORE_COLOR = (s: number) => {
    if (s >= 90) return 'text-[var(--color-success)]';
    if (s >= 70) return 'text-behance-amber-600';
    return 'text-[var(--color-danger)]';
};

export default function MockAuditorPage() {
    const { user } = useAuth();
    const [sims, setSims] = useState<AuditSimulation[]>([]);
    const [selectedSim, setSelectedSim] = useState<AuditSimulation | null>(null);
    const [findings, setFindings] = useState<AuditFinding[]>([]);
    const [loading, setLoading] = useState(true);
    const [simulating, setSimulating] = useState(false);
    const [auditType, setAuditType] = useState<AuditType>('Internal');

    const companyId = '00000000-0000-0000-0000-000000000000'; // Mock

    useEffect(() => { load(); }, []);

    async function load() {
        setLoading(true);
        const data = await getAuditSimulations(companyId);
        setSims(data);
        if (data.length > 0 && !selectedSim) {
            handleSelect(data[0]);
        }
        setLoading(false);
    }

    async function handleSelect(sim: AuditSimulation) {
        setSelectedSim(sim);
        const items = await getAuditFindings(sim.id);
        setFindings(items);
    }

    async function triggerSimulation() {
        setSimulating(true);
        const newSim = await runAuditSimulation(companyId, auditType);
        if (newSim) {
            const data = await getAuditSimulations(companyId);
            setSims(data);
            handleSelect(newSim);
        }
        setSimulating(false);
    }

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between flex-wrap gap-4">
                <div>
                    <h1 className="text-2xl font-black tracking-tight dash-text">Virtual Audit Simulation</h1>
                    <p className="dash-text-tertiary text-sm">Automated "Mock Auditor" scans for compliance blind spots.</p>
                </div>
                <div className="flex gap-2">
                    <select
                        value={auditType}
                        onChange={(e) => setAuditType(e.target.value as AuditType)}
                        className="px-3 py-2 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-sm dash-text font-medium outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20"
                    >
                        <option value="Internal">Internal Health Check</option>
                        <option value="HIPAA">HIPAA Audit</option>
                        <option value="Joint Commission">Joint Commission</option>
                        <option value="NAFDAC">NAFDAC Protocol</option>
                    </select>
                    <button
                        onClick={triggerSimulation}
                        disabled={simulating}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--color-accent)] text-white font-bold text-sm hover:opacity-90 transition-all disabled:opacity-50 shadow-lg shadow-[var(--color-accent)]/20"
                    >
                        {simulating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                        {simulating ? 'Auditing...' : 'Run Simulation'}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-12 gap-6">
                {/* Left: History Sidebar */}
                <div className="col-span-12 lg:col-span-4 space-y-4">
                    <div className="p-4 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)]">
                        <h2 className="text-xs font-black uppercase dash-text-tertiary tracking-widest mb-4">Audit History</h2>
                        <div className="space-y-2 overflow-y-auto max-h-[600px] pr-2 custom-scrollbar">
                            {sims.map(sim => (
                                <button
                                    key={sim.id}
                                    onClick={() => handleSelect(sim)}
                                    className={`w-full text-left p-4 rounded-xl border transition-all ${selectedSim?.id === sim.id ? 'bg-[var(--color-accent-soft)]/20 border-[var(--color-accent)]' : 'bg-[var(--color-surface-alt)] border-transparent hover:border-[var(--color-border)]'}`}
                                >
                                    <div className="flex justify-between items-start mb-1">
                                        <span className="text-sm font-bold dash-text">{sim.audit_type}</span>
                                        <span className={`text-lg font-black ${SCORE_COLOR(sim.score)}`}>{sim.score}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-[10px] dash-text-tertiary uppercase font-medium">
                                        <Clock className="w-3 h-3" /> {new Date(sim.created_at).toLocaleDateString()}
                                    </div>
                                </button>
                            ))}
                            {sims.length === 0 && !loading && (
                                <div className="text-center py-8">
                                    <Activity className="w-12 h-12 dash-text-tertiary mx-auto mb-2 opacity-20" />
                                    <p className="text-xs dash-text-tertiary italic">No simulations yet.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right: Simulation Details */}
                <div className="col-span-12 lg:col-span-8 space-y-6">
                    {selectedSim ? (
                        <>
                            <div className="p-6 rounded-3xl bg-dash-surface border border-[var(--color-border)] relative overflow-hidden shadow-sm">
                                <div className="absolute top-0 right-0 p-8 transform translate-x-4 -translate-y-4 opacity-10">
                                    <ShieldCheck className="w-32 h-32 dash-accent" />
                                </div>

                                <div className="relative z-10 flex flex-col md:flex-row md:items-center gap-6">
                                    <div className="flex-shrink-0 flex items-center justify-center w-24 h-24 rounded-full border-4 border-[var(--color-surface-alt)] bg-dash-surface shadow-inner">
                                        <span className={`text-3xl font-black ${SCORE_COLOR(selectedSim.score)}`}>{selectedSim.score}</span>
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="text-xl font-black dash-text tracking-tight mb-2 uppercase italic">{selectedSim.audit_type} SCORECARD</h3>
                                        <p className="text-sm dash-text-secondary leading-relaxed italic border-l-2 border-[var(--color-accent)] pl-4">
                                            "{selectedSim.summary || 'Executing AI triage on compliance data...'}"
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <h2 className="text-xs font-black uppercase dash-text-tertiary tracking-widest flex items-center gap-2">
                                        <AlertTriangle className="w-3 h-3" /> Blind Spots Identified ({findings.length})
                                    </h2>
                                </div>

                                <div className="grid gap-4">
                                    {findings.map(finding => (
                                        <div key={finding.id} className="group p-5 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-accent)]/30 transition-all shadow-sm">
                                            <div className="flex items-start justify-between gap-4 mb-3">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <span className={`text-[9px] font-black uppercase tracking-tighter px-2 py-0.5 rounded-full ${SEV_COLOR[finding.severity]}`}>
                                                            {finding.severity}
                                                        </span>
                                                        <span className="text-[10px] font-bold text-[var(--color-accent)] uppercase tracking-widest">
                                                            {finding.category}
                                                        </span>
                                                    </div>
                                                    <h4 className="text-sm font-bold dash-text mb-1">{finding.title}</h4>
                                                    <p className="text-xs dash-text-secondary leading-relaxed">{finding.description}</p>
                                                </div>
                                            </div>

                                            {finding.remediation_advice && (
                                                <div className="mt-4 p-3 rounded-xl bg-[var(--color-accent-soft)]/10 border border-dashed border-[var(--color-accent)]/20">
                                                    <div className="flex items-center gap-2 text-[10px] font-black uppercase dash-accent tracking-tighter mb-1">
                                                        <Sparkles className="w-3 h-3" /> AI Remediation Plan
                                                    </div>
                                                    <p className="text-xs dash-text italic">"{finding.remediation_advice}"</p>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                    {findings.length === 0 && (
                                        <div className="text-center py-12 rounded-2xl bg-[var(--color-surface-alt)] border border-dashed border-[var(--color-border)]">
                                            <CheckCircle2 className="w-12 h-12 text-[var(--color-success)] mx-auto mb-3 opacity-30" />
                                            <p className="text-sm dash-text-tertiary font-medium">Compliance looks clean. No blind spots detected.</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center py-20 bg-[var(--color-surface-alt)]/50 rounded-3xl border border-dashed border-[var(--color-border)]">
                            <Activity className="w-16 h-16 dash-text-tertiary opacity-20 mb-4" />
                            <p className="dash-text-tertiary font-bold tracking-tight">Select or Run an Audit Simulation</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
