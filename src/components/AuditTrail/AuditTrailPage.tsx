import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { verifyChainIntegrity, exportSealedEvidence } from '../../lib/auditService';
import { exportAuditTrailPDF } from '../../lib/pdfExport';
import {
    ShieldCheck,
    ShieldAlert,
    Download,
    RefreshCw,
    ChevronDown,
    ChevronRight,
    CheckCircle,
    AlertTriangle,
    Clock,
    FileText,
    User,
    Hash,
    Link2,
    Loader2,
    Eye,
    X,
    Activity,
    Filter,
    CalendarDays,
    Search,
} from 'lucide-react';
import MockAuditorPage from './MockAuditorPage';
import { logger } from '../../lib/logger';
import { SkeletonLine } from '../Dashboard/ui/Skeleton';

/* ──────────────────────── types ──────────────────────── */

interface AuditEntry {
    id: string;
    user_id: string | null;
    action: string;
    entity_type: string;
    entity_id: string | null;
    metadata: Record<string, unknown>;
    created_at: string;
    integrity_hash: string | null;
    previous_hash: string | null;
    evidence_snapshot: Record<string, unknown>;
    company_id: string | null;
    ip_address: string | null;
    sequence_number: number | null;
}

interface ChainStatus {
    verified: boolean;
    totalEntries: number;
    brokenAt: string | null; // UUID of the broken entry
    checkedAt: string;
    loading: boolean;
}

/* ──────────────────────── helpers ──────────────────────── */

const ACTION_LABELS: Record<string, { label: string; color: string; bg: string }> = {
    upload: { label: 'Content Upload', color: 'text-[var(--color-info)]', bg: 'bg-[var(--color-info-soft)] border-[var(--color-info)]/20' },
    sent_for_legal: { label: 'Sent to Legal', color: 'text-[var(--color-purple)]', bg: 'bg-[var(--color-purple)]/10 border-[var(--color-purple)]/20' },
    request_legal_signoff: { label: 'Legal Sign-off Requested', color: 'text-violet-700', bg: 'bg-[var(--color-purple)]/10 border-violet-200' },
    legal_approve: { label: 'Legal Approved', color: 'text-[var(--color-success)]', bg: 'bg-[var(--color-success-soft)] border-[var(--color-success)]/20' },
    legal_reject: { label: 'Legal Rejected', color: 'text-[var(--color-danger)]', bg: 'bg-[var(--color-danger-soft)] border-[var(--color-danger)]/20' },
    legal_amend: { label: 'Amendment Requested', color: 'text-behance-amber-700', bg: 'bg-behance-amber-50 border-behance-amber-200' },
    publish: { label: 'Published', color: 'text-[var(--color-success)]', bg: 'bg-[var(--color-success-soft)] border-[var(--color-success)]/20' },
    approve_content: { label: 'Content Approved', color: 'text-[var(--color-success)]', bg: 'bg-[var(--color-success-soft)] border-[var(--color-success)]/20' },
    reject_content: { label: 'Content Rejected', color: 'text-[var(--color-danger)]', bg: 'bg-[var(--color-danger-soft)] border-[var(--color-danger)]/20' },
};

function getActionConfig(action: string) {
    return ACTION_LABELS[action] ?? { label: action.replace(/_/g, ' '), color: 'dash-text', bg: 'dash-surface-alt dash-border' };
}

function timeAgo(isoDate: string) {
    const seconds = Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000);
    if (seconds < 60) return 'just now';
    const mins = Math.floor(seconds / 60);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
}

function truncHash(hash: string | null) {
    if (!hash) return '—';
    return hash.slice(0, 8) + '…' + hash.slice(-6);
}

/* ──────────────────────── component ──────────────────────── */

export default function AuditTrailPage() {
    const { profile } = useAuth();
    const companyId = (profile as any)?.company_id as string | undefined;

    const [entries, setEntries] = useState<AuditEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [chainStatus, setChainStatus] = useState<ChainStatus>({
        verified: false,
        totalEntries: 0,
        brokenAt: null,
        checkedAt: '',
        loading: false,
    });
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [exporting, setExporting] = useState(false);
    const [exportingPdf, setExportingPdf] = useState(false);
    const [snapshotModal, setSnapshotModal] = useState<AuditEntry | null>(null);
    const [tab, setTab] = useState<'ledger' | 'mock_auditor'>('ledger');

    /* ── filters ── */
    const [filterDateFrom, setFilterDateFrom] = useState('');
    const [filterDateTo, setFilterDateTo] = useState('');
    const [filterAction, setFilterAction] = useState('');
    const [filterUserId, setFilterUserId] = useState('');
    const [filterEntityType, setFilterEntityType] = useState('');
    const [searchQuery, setSearchQuery] = useState('');

    const activeFilterCount = [filterDateFrom, filterDateTo, filterAction, filterUserId, filterEntityType, searchQuery].filter(Boolean).length;

    const uniqueActions = useMemo(() => [...new Set(entries.map((e) => e.action))].sort(), [entries]);
    const uniqueEntityTypes = useMemo(() => [...new Set(entries.map((e) => e.entity_type))].sort(), [entries]);

    const filteredEntries = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        return entries.filter((e) => {
            if (filterDateFrom && e.created_at < filterDateFrom) return false;
            if (filterDateTo) {
                // make dateTo inclusive by adding one day
                const toExclusive = new Date(filterDateTo);
                toExclusive.setDate(toExclusive.getDate() + 1);
                if (new Date(e.created_at) >= toExclusive) return false;
            }
            if (filterAction && e.action !== filterAction) return false;
            if (filterUserId && !(e.user_id || '').toLowerCase().includes(filterUserId.toLowerCase())) return false;
            if (filterEntityType && e.entity_type !== filterEntityType) return false;
            if (q) {
                const haystack = [
                    e.action,
                    getActionConfig(e.action).label,
                    e.entity_type,
                    e.entity_id ?? '',
                    e.user_id ?? '',
                    String(e.sequence_number ?? ''),
                    e.integrity_hash ?? '',
                    JSON.stringify(e.metadata ?? {}),
                ].join(' ').toLowerCase();
                if (!haystack.includes(q)) return false;
            }
            return true;
        });
    }, [entries, filterDateFrom, filterDateTo, filterAction, filterUserId, filterEntityType, searchQuery]);

    const clearFilters = () => {
        setFilterDateFrom('');
        setFilterDateTo('');
        setFilterAction('');
        setFilterUserId('');
        setFilterEntityType('');
        setSearchQuery('');
    };

    /* ── load entries ── */
    const loadEntries = useCallback(async () => {
        if (!companyId) return;
        setLoading(true);

        const { data, error } = await supabase
            .from('audit_logs')
            .select('*')
            .eq('company_id', companyId)
            .order('created_at', { ascending: false })
            .limit(200);

        if (error) {
            logger.error('Failed to load audit logs:', error);
        }

        setEntries((data as any as AuditEntry[]) ?? []);
        setLoading(false);
    }, [companyId]);

    useEffect(() => {
        loadEntries();
    }, [loadEntries]);

    /* ── verify chain ── */
    const runChainVerification = useCallback(async () => {
        if (!companyId) return;
        setChainStatus((prev) => ({ ...prev, loading: true }));

        try {
            const result = await verifyChainIntegrity(companyId);
            setChainStatus({
                verified: result.valid,
                totalEntries: result.totalChecked,
                brokenAt: result.brokenAt ?? null,
                checkedAt: new Date().toISOString(),
                loading: false,
            });
        } catch (err) {
            logger.error('Chain verification error:', err);
            setChainStatus((prev) => ({ ...prev, loading: false }));
        }
    }, [companyId]);

    /* ── export — full company audit trail ── */
    const handleExport = useCallback(async () => {
        if (!companyId) return;
        setExporting(true);
        try {
            // Fetch all company audit entries ordered chronologically
            const { data: allEntries, error } = await (supabase as any)
                .from('audit_logs')
                .select('*')
                .eq('company_id', companyId)
                .order('sequence_number', { ascending: true });

            if (error || !allEntries || allEntries.length === 0) {
                window.dispatchEvent(new CustomEvent('global-toast', {
                    detail: { message: 'No audit entries found to export.', type: 'error' }
                }));
                return;
            }

            const verification = await verifyChainIntegrity(companyId);
            const exportData = {
                exported_at: new Date().toISOString(),
                company_id: companyId,
                total_entries: allEntries.length,
                chain_verification: verification,
                audit_trail: allEntries,
            };

            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Sealed_Audit_Trail_${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            window.dispatchEvent(new CustomEvent('global-toast', {
                detail: { message: `Sealed evidence package exported — ${allEntries.length} entries.`, type: 'success' }
            }));
        } catch (err) {
            logger.error('Sealed export failed:', err);
            window.dispatchEvent(new CustomEvent('global-toast', {
                detail: { message: 'Export failed. Please try again.', type: 'error' }
            }));
        } finally {
            setExporting(false);
        }
    }, [companyId]);

    /* ── export PDF ── */
    const handleExportPDF = useCallback(async () => {
        if (!companyId || entries.length === 0) return;
        setExportingPdf(true);
        try {
            await exportAuditTrailPDF(entries, chainStatus, companyId);
        } catch (err) {
            logger.error('PDF export failed:', err);
            window.dispatchEvent(new CustomEvent('global-toast', {
                detail: { message: 'PDF export failed. Please try again.', type: 'error' }
            }));
        } finally {
            setExportingPdf(false);
        }
    }, [companyId, entries, chainStatus]);

    /* ── toggle expand ── */
    const toggleExpand = (id: string) => {
        setExpandedId(expandedId === id ? null : id);
    };

    const hasEvidence = (entry: AuditEntry) =>
        entry.evidence_snapshot && Object.keys(entry.evidence_snapshot).length > 0;

    /* ──────────── render ──────────── */
    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <h2 className="text-2xl font-bold dash-text flex items-center gap-2">
                        <ShieldCheck className="w-6 h-6 text-[var(--color-behance-blue)]" />
                        Immutable Audit Trail
                    </h2>
                    <p className="text-sm dash-text-secondary mt-1">
                        Tamper-evident, hash-chained compliance ledger — append-only, cryptographically sealed
                    </p>
                </div>

                <div className="flex items-center gap-1 p-1 bg-[var(--color-surface-alt)] rounded-xl border dash-border shrink-0">
                    <button
                        onClick={() => setTab('ledger')}
                        className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-tighter transition-all ${tab === 'ledger' ? 'bg-dash-surface dash-accent shadow-sm' : 'dash-text-tertiary hover:dash-text'}`}
                    >
                        Audit Ledger
                    </button>
                    <button
                        onClick={() => setTab('mock_auditor')}
                        className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-tighter transition-all flex items-center gap-2 ${tab === 'mock_auditor' ? 'bg-[var(--color-accent)] text-white shadow-sm' : 'dash-text-tertiary hover:dash-text'}`}
                    >
                        <Activity className="w-3 h-3" /> Mock Auditor
                    </button>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={runChainVerification}
                        disabled={chainStatus.loading}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-lg border dash-border dash-card
              text-sm font-medium dash-text hover:dash-surface-alt transition-colors disabled:opacity-60 shadow-sm"
                    >
                        {chainStatus.loading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <RefreshCw className="w-4 h-4" />
                        )}
                        Verify Chain
                    </button>

                    <button
                        onClick={handleExportPDF}
                        disabled={exportingPdf || entries.length === 0}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-lg border dash-border dash-card
              text-sm font-medium dash-text hover:dash-surface-alt transition-colors disabled:opacity-60 shadow-sm"
                    >
                        {exportingPdf ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <FileText className="w-4 h-4" />
                        )}
                        PDF Report
                    </button>

                    <button
                        onClick={handleExport}
                        disabled={exporting || entries.length === 0}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[var(--color-behance-blue)] text-white
              text-sm font-semibold hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-60 shadow-sm"
                    >
                        {exporting ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Download className="w-4 h-4" />
                        )}
                        Export Sealed Evidence
                    </button>
                </div>
            </div>

            {tab === 'ledger' ? (
                <>
                    {/* Chain Integrity Banner */}
                    {chainStatus.checkedAt && (
                        <div
                            className={`flex items-center gap-4 p-4 rounded-xl border shadow-sm ${chainStatus.verified
                                ? 'bg-gradient-to-r from-emerald-50 to-green-50 border-[var(--color-success)]/20'
                                : 'bg-gradient-to-r from-red-50 to-rose-50 border-[var(--color-danger)]/20'
                                }`}
                        >
                            {chainStatus.verified ? (
                                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[var(--color-success-soft)]">
                                    <ShieldCheck className="w-5 h-5 text-[var(--color-success)]" />
                                </div>
                            ) : (
                                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[var(--color-danger-soft)]">
                                    <ShieldAlert className="w-5 h-5 text-[var(--color-danger)]" />
                                </div>
                            )}

                            <div className="flex-1 min-w-0">
                                <p
                                    className={`font-semibold text-sm ${chainStatus.verified ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'
                                        }`}
                                >
                                    {chainStatus.verified
                                        ? '✓ Chain Integrity Verified — No Tampering Detected'
                                        : `⚠ Chain Integrity Broken at Sequence #${
                                            chainStatus.brokenAt
                                              ? (entries.find(e => e.id === chainStatus.brokenAt)?.sequence_number ?? chainStatus.brokenAt.slice(0, 8))
                                              : '?'
                                          }`}
                                </p>
                                <p className="text-xs dash-text-secondary mt-0.5">
                                    {chainStatus.totalEntries} entries verified • Last checked{' '}
                                    {new Date(chainStatus.checkedAt).toLocaleString()}
                                </p>
                            </div>

                            <div
                                className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${chainStatus.verified
                                    ? 'bg-[var(--color-success-soft)] text-[var(--color-success)]'
                                    : 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]'
                                    }`}
                            >
                                {chainStatus.verified ? 'VALID' : 'TAMPERED'}
                            </div>
                        </div>
                    )}

                    {/* Stats Row */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <StatCard
                            label="Total Entries"
                            value={entries.length}
                            icon={<FileText className="w-4 h-4 text-[var(--color-info)]" />}
                            color="border-[var(--color-info)]/20"
                        />
                        <StatCard
                            label="With Evidence"
                            value={entries.filter(hasEvidence).length}
                            icon={<Eye className="w-4 h-4 text-[var(--color-purple)]" />}
                            color="border-indigo-100"
                        />
                        <StatCard
                            label="Hash-Chained"
                            value={entries.filter((e) => e.integrity_hash).length}
                            icon={<Link2 className="w-4 h-4 text-[var(--color-purple)]" />}
                            color="border-violet-100"
                        />
                        <StatCard
                            label="Unique Actions"
                            value={new Set(entries.map((e) => e.action)).size}
                            icon={<Hash className="w-4 h-4 text-behance-amber-500" />}
                            color="border-behance-amber-100"
                        />
                    </div>

                    {/* Filter Bar */}
                    <div className="dash-card rounded-xl border dash-border shadow-sm p-4 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <Filter className="w-4 h-4 dash-text-secondary" />
                                <span className="text-sm font-semibold dash-text">Filters & Search</span>
                                {activeFilterCount > 0 && (
                                    <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[var(--color-behance-blue)] text-white">
                                        {activeFilterCount} active
                                    </span>
                                )}
                            </div>
                            {activeFilterCount > 0 && (
                                <button
                                    onClick={clearFilters}
                                    className="flex items-center gap-1 text-xs text-[var(--color-danger)] hover:underline"
                                >
                                    <X className="w-3 h-3" /> Clear all
                                </button>
                            )}
                        </div>

                        {/* Keyword / record ID search */}
                        <div className="flex items-center gap-2 border dash-border rounded-lg px-3 py-2 focus-within:ring-2 focus-within:ring-[var(--color-behance-blue)]/20 focus-within:border-[var(--color-behance-blue)]">
                            <Search className="w-4 h-4 dash-text-tertiary shrink-0" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search by keyword, record ID, hash, action name, metadata…"
                                className="bg-transparent outline-none text-sm w-full"
                            />
                            {searchQuery && (
                                <button onClick={() => setSearchQuery('')} className="shrink-0">
                                    <X className="w-3.5 h-3.5 dash-text-tertiary hover:dash-text" />
                                </button>
                            )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
                            {/* Date from */}
                            <div>
                                <label className="text-[10px] font-semibold dash-text-secondary uppercase tracking-wider block mb-1">
                                    <CalendarDays className="w-3 h-3 inline mr-1" />From
                                </label>
                                <input
                                    type="date"
                                    value={filterDateFrom}
                                    onChange={(e) => setFilterDateFrom(e.target.value)}
                                    className="w-full border dash-border rounded-lg px-2.5 py-2 text-sm focus:ring-2 focus:ring-[var(--color-behance-blue)]/20 focus:border-[var(--color-behance-blue)] outline-none"
                                />
                            </div>

                            {/* Date to */}
                            <div>
                                <label className="text-[10px] font-semibold dash-text-secondary uppercase tracking-wider block mb-1">
                                    <CalendarDays className="w-3 h-3 inline mr-1" />To
                                </label>
                                <input
                                    type="date"
                                    value={filterDateTo}
                                    onChange={(e) => setFilterDateTo(e.target.value)}
                                    className="w-full border dash-border rounded-lg px-2.5 py-2 text-sm focus:ring-2 focus:ring-[var(--color-behance-blue)]/20 focus:border-[var(--color-behance-blue)] outline-none"
                                />
                            </div>

                            {/* Action type */}
                            <div>
                                <label className="text-[10px] font-semibold dash-text-secondary uppercase tracking-wider block mb-1">
                                    Action type
                                </label>
                                <select
                                    value={filterAction}
                                    onChange={(e) => setFilterAction(e.target.value)}
                                    className="w-full border dash-border rounded-lg px-2.5 py-2 text-sm focus:ring-2 focus:ring-[var(--color-behance-blue)]/20 focus:border-[var(--color-behance-blue)] outline-none"
                                >
                                    <option value="">All actions</option>
                                    {uniqueActions.map((a) => (
                                        <option key={a} value={a}>{getActionConfig(a).label}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Entity type */}
                            <div>
                                <label className="text-[10px] font-semibold dash-text-secondary uppercase tracking-wider block mb-1">
                                    Entity type
                                </label>
                                <select
                                    value={filterEntityType}
                                    onChange={(e) => setFilterEntityType(e.target.value)}
                                    className="w-full border dash-border rounded-lg px-2.5 py-2 text-sm focus:ring-2 focus:ring-[var(--color-behance-blue)]/20 focus:border-[var(--color-behance-blue)] outline-none"
                                >
                                    <option value="">All entities</option>
                                    {uniqueEntityTypes.map((t) => (
                                        <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                                    ))}
                                </select>
                            </div>

                            {/* User ID */}
                            <div>
                                <label className="text-[10px] font-semibold dash-text-secondary uppercase tracking-wider block mb-1">
                                    <User className="w-3 h-3 inline mr-1" />User ID (partial)
                                </label>
                                <input
                                    type="text"
                                    value={filterUserId}
                                    onChange={(e) => setFilterUserId(e.target.value)}
                                    placeholder="e.g. a1b2c3…"
                                    className="w-full border dash-border rounded-lg px-2.5 py-2 text-sm focus:ring-2 focus:ring-[var(--color-behance-blue)]/20 focus:border-[var(--color-behance-blue)] outline-none"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Entries List */}
                    {loading ? (
                        <div className="dash-card rounded-xl border dash-border shadow-sm overflow-hidden">
                            <div className="px-5 py-3 border-b dash-border dash-surface-alt">
                                <SkeletonLine className="h-3 w-48" />
                            </div>
                            <div className="divide-y dash-divide">
                                {[...Array(6)].map((_, i) => (
                                    <div key={i} className="flex items-center gap-4 px-5 py-3.5">
                                        <SkeletonLine className="h-4 w-4 shrink-0" />
                                        <SkeletonLine className="h-3 w-8 shrink-0" />
                                        <SkeletonLine className="h-5 w-28 rounded-full shrink-0" />
                                        <SkeletonLine className="h-4 flex-1" />
                                        <SkeletonLine className="h-4 w-20 shrink-0" />
                                        <SkeletonLine className="h-4 w-24 shrink-0" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : entries.length === 0 ? (
                        <div className="text-center py-16 dash-card rounded-xl border dash-border">
                            <ShieldCheck className="w-10 h-10 dash-text-tertiary mx-auto mb-3" />
                            <p className="text-sm dash-text-secondary">No audit entries yet</p>
                            <p className="text-xs dash-text-tertiary mt-1">
                                Entries appear as actions are performed across the platform
                            </p>
                        </div>
                    ) : (
                        <div className="dash-card rounded-xl border dash-border shadow-sm overflow-x-auto">
                            <div className="px-5 py-3 border-b dash-border dash-surface-alt flex items-center justify-between min-w-[640px]">
                                <p className="text-xs font-semibold dash-text-secondary uppercase tracking-wider">
                                    Audit Ledger — Most Recent First
                                </p>
                                {activeFilterCount > 0 && (
                                    <p className="text-xs dash-text-secondary">
                                        Showing <span className="font-semibold dash-text">{filteredEntries.length}</span> of {entries.length} entries
                                    </p>
                                )}
                            </div>

                            <div className="divide-y dash-divide">
                                {filteredEntries.length === 0 ? (
                                    <div className="text-center py-12 px-4">
                                        <Filter className="w-8 h-8 dash-text-tertiary mx-auto mb-3" />
                                        <p className="text-sm dash-text-secondary">No entries match your filters</p>
                                        <button onClick={clearFilters} className="text-xs text-[var(--color-behance-blue)] hover:underline mt-2">
                                            Clear filters
                                        </button>
                                    </div>
                                ) : null}
                                {filteredEntries.map((entry) => {
                                    const config = getActionConfig(entry.action);
                                    const isExpanded = expandedId === entry.id;

                                    return (
                                        <div key={entry.id} className="group">
                                            {/* Summary row */}
                                            <button
                                                onClick={() => toggleExpand(entry.id)}
                                                className="w-full flex items-center gap-4 px-5 py-3.5 text-left hover:dash-surface-alt/70 transition-colors"
                                            >
                                                <div className="flex-shrink-0">
                                                    {isExpanded ? (
                                                        <ChevronDown className="w-4 h-4 dash-text-tertiary" />
                                                    ) : (
                                                        <ChevronRight className="w-4 h-4 dash-text-tertiary" />
                                                    )}
                                                </div>

                                                {/* Sequence */}
                                                <span className="text-xs font-mono dash-text-tertiary w-10 text-right tabular-nums">
                                                    #{entry.sequence_number ?? '—'}
                                                </span>

                                                {/* Action badge */}
                                                <span
                                                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${config.bg} ${config.color}`}
                                                >
                                                    {config.label}
                                                </span>

                                                {/* Entity */}
                                                <span className="text-sm dash-text-secondary truncate flex-1">
                                                    {entry.entity_type}
                                                    {entry.entity_id && (
                                                        <span className="dash-text-tertiary ml-1 font-mono text-xs">
                                                            {entry.entity_id.slice(0, 8)}…
                                                        </span>
                                                    )}
                                                </span>

                                                {/* Integrity badge */}
                                                {entry.integrity_hash ? (
                                                    <span className="flex items-center gap-1 text-[11px] font-medium text-[var(--color-success)]">
                                                        <CheckCircle className="w-3.5 h-3.5" />
                                                        Sealed
                                                    </span>
                                                ) : (
                                                    <span className="flex items-center gap-1 text-[11px] font-medium text-behance-amber-500">
                                                        <AlertTriangle className="w-3.5 h-3.5" />
                                                        Legacy
                                                    </span>
                                                )}

                                                {/* Evidence indicator */}
                                                {hasEvidence(entry) && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setSnapshotModal(entry);
                                                        }}
                                                        className="flex items-center gap-1 text-[11px] font-medium text-[var(--color-purple)] hover:text-[var(--color-purple)] transition-colors"
                                                    >
                                                        <Eye className="w-3.5 h-3.5" />
                                                        Evidence
                                                    </button>
                                                )}

                                                {/* Timestamp */}
                                                <span className="flex items-center gap-1 text-xs dash-text-tertiary whitespace-nowrap">
                                                    <Clock className="w-3 h-3" />
                                                    {timeAgo(entry.created_at)}
                                                </span>
                                            </button>

                                            {/* Expanded detail */}
                                            {isExpanded && (
                                                <div className="px-5 pb-4 pl-14 space-y-3 dash-surface-alt/30">
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                        <DetailField
                                                            icon={<User className="w-3.5 h-3.5" />}
                                                            label="User ID"
                                                            value={entry.user_id || '—'}
                                                            mono
                                                        />
                                                        <DetailField
                                                            icon={<Clock className="w-3.5 h-3.5" />}
                                                            label="Timestamp"
                                                            value={new Date(entry.created_at).toLocaleString()}
                                                        />
                                                        <DetailField
                                                            icon={<Hash className="w-3.5 h-3.5" />}
                                                            label="Integrity Hash"
                                                            value={truncHash(entry.integrity_hash)}
                                                            mono
                                                        />
                                                        <DetailField
                                                            icon={<Link2 className="w-3.5 h-3.5" />}
                                                            label="Previous Hash"
                                                            value={truncHash(entry.previous_hash)}
                                                            mono
                                                        />
                                                    </div>

                                                    {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                                                        <div className="mt-2">
                                                            <p className="text-xs font-semibold dash-text-secondary uppercase tracking-wider mb-1.5">
                                                                Metadata
                                                            </p>
                                                            <pre className="dash-card rounded-lg border dash-border p-3 text-[11px] dash-text-secondary font-mono overflow-x-auto">
                                                                {JSON.stringify(entry.metadata, null, 2)}
                                                            </pre>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </>
            ) : (
                <MockAuditorPage />
            )}

            {/* Evidence Snapshot Modal */}
            {snapshotModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-6 z-50">
                    <div className="dash-card rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden shadow-2xl">
                        <div className="flex items-center justify-between px-6 py-4 border-b dash-border dash-surface-alt">
                            <div>
                                <h3 className="font-bold dash-text flex items-center gap-2">
                                    <Eye className="w-4 h-4 text-[var(--color-purple)]" />
                                    Evidence Snapshot
                                </h3>
                                <p className="text-xs dash-text-secondary mt-0.5">
                                    Captured at {new Date(snapshotModal.created_at).toLocaleString()} •
                                    Seq #{snapshotModal.sequence_number}
                                </p>
                            </div>
                            <button
                                onClick={() => setSnapshotModal(null)}
                                className="p-1.5 hover:bg-[var(--color-surface-alt)] rounded-lg transition-colors"
                            >
                                <X className="w-5 h-5 dash-text-tertiary" />
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto max-h-[60vh]">
                            <pre className="dash-surface-alt rounded-lg border dash-border p-4 text-xs dash-text font-mono overflow-x-auto whitespace-pre-wrap">
                                {JSON.stringify(snapshotModal.evidence_snapshot, null, 2)}
                            </pre>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

/* ──────────────── Sub-components ──────────────── */

function StatCard({
    label,
    value,
    icon,
    color,
}: {
    label: string;
    value: number;
    icon: React.ReactNode;
    color: string;
}) {
    return (
        <div className={`dash-card rounded-xl border ${color} shadow-sm p-4`}>
            <div className="flex items-center gap-2 mb-2">
                {icon}
                <span className="text-xs font-medium dash-text-secondary uppercase tracking-wider">{label}</span>
            </div>
            <p className="text-2xl font-bold dash-text tabular-nums">{value}</p>
        </div>
    );
}

function DetailField({
    icon,
    label,
    value,
    mono = false,
}: {
    icon: React.ReactNode;
    label: string;
    value: string;
    mono?: boolean;
}) {
    return (
        <div className="flex items-start gap-2">
            <span className="dash-text-tertiary mt-0.5">{icon}</span>
            <div className="min-w-0">
                <p className="text-[11px] font-semibold dash-text-tertiary uppercase tracking-wider">{label}</p>
                <p className={`text-sm dash-text truncate ${mono ? 'font-mono' : ''}`}>{value}</p>
            </div>
        </div>
    );
}

