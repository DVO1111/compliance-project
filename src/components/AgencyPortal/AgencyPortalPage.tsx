import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
    fetchAgencySubmissions,
    fetchApprovedClaims,
    copyClaim,
    type AgencySubmission,
    type ApprovedClaim,
} from '../../lib/agencyPortalService';
import {
    Briefcase, FileText, Library, ClipboardCopy, CheckCircle2,
    AlertTriangle, Clock, XCircle, Shield, Search, 
} from 'lucide-react';

type Tab = 'submissions' | 'claims';

const STATUS_BADGE: Record<string, { bg: string; text: string; icon: typeof Clock }> = {
    pending: { bg: 'bg-[var(--color-warning-soft)]', text: 'text-[var(--color-warning)]', icon: Clock },
    awaiting_legal: { bg: 'bg-[var(--color-info-soft)]', text: 'text-[var(--color-info)]', icon: Clock },
    in_review: { bg: 'bg-[var(--color-purple)]/10', text: 'text-[var(--color-purple)]', icon: Shield },
    approved: { bg: 'bg-[var(--color-success-soft)]', text: 'text-[var(--color-success)]', icon: CheckCircle2 },
    rejected: { bg: 'bg-[var(--color-danger-soft)]', text: 'text-[var(--color-danger)]', icon: XCircle },
    flagged: { bg: 'bg-[var(--color-warning-soft)]', text: 'text-[var(--color-warning)]', icon: AlertTriangle },
    critical: { bg: 'bg-[var(--color-danger-soft)]', text: 'text-[var(--color-danger)]', icon: AlertTriangle },
};

const BLOCK_TYPE_COLORS: Record<string, string> = {
    disclaimer: 'bg-[var(--color-info-soft)] text-[var(--color-info)]',
    statistic: 'bg-[var(--color-purple)]/10 text-[var(--color-purple)]',
    risk_statement: 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]',
    boilerplate: 'bg-[var(--color-surface-alt)] text-[var(--color-text-primary)]',
    fair_balance: 'bg-[var(--color-warning-soft)] text-[var(--color-warning)]',
    call_to_action: 'bg-[var(--color-success-soft)] text-[var(--color-success)]',
    custom: 'bg-[var(--color-purple)]/10 text-[var(--color-purple)]',
};

export default function AgencyPortalPage() {
    const { user, profile } = useAuth();
    const [tab, setTab] = useState<Tab>('submissions');
    const [submissions, setSubmissions] = useState<AgencySubmission[]>([]);
    const [claims, setClaims] = useState<ApprovedClaim[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const companyId = (profile as any)?.company_id;

    const load = useCallback(async () => {
        setLoading(true);
        if (tab === 'submissions' && user?.id) {
            setSubmissions(await fetchAgencySubmissions(user.id));
        } else if (tab === 'claims' && companyId) {
            setClaims(await fetchApprovedClaims(companyId));
        }
        setLoading(false);
    }, [tab, user?.id, companyId]);

    useEffect(() => { load(); }, [load]);

    const handleCopy = (claim: ApprovedClaim) => {
        copyClaim(claim.content_text);
        setCopiedId(claim.id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const filteredClaims = claims.filter(c =>
        !search.trim() ||
        c.block_name.toLowerCase().includes(search.toLowerCase()) ||
        c.content_text.toLowerCase().includes(search.toLowerCase())
    );

    const filteredSubmissions = submissions.filter(s =>
        !search.trim() ||
        s.title.toLowerCase().includes(search.toLowerCase()) ||
        s.file_name.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between flex-wrap gap-4">
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <div className="p-2 rounded-xl bg-[var(--color-accent-soft)]">
                            <Briefcase className="w-5 h-5 dash-accent" />
                        </div>
                        <h2 className="text-2xl font-bold dash-text">Agency Portal</h2>
                    </div>
                    <p className="dash-text-secondary text-sm ml-12">
                        Submit content, access approved claims, and track feedback
                    </p>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 p-1 rounded-xl bg-[var(--color-surface-alt)] w-fit">
                {([
                    { id: 'submissions' as Tab, label: 'My Submissions', icon: FileText },
                    { id: 'claims' as Tab, label: 'Approved Claims Library', icon: Library },
                ]).map(t => (
                    <button key={t.id} onClick={() => setTab(t.id)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
              ${tab === t.id
                                ? 'bg-[var(--color-surface)] dark:bg-[var(--color-surface)] shadow-sm dash-text'
                                : 'dash-text-secondary hover:dash-text'}`}>
                        <t.icon className="w-4 h-4" />
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Search */}
            <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 dash-text-tertiary" />
                <input
                    type="text"
                    placeholder={tab === 'claims' ? 'Search claims...' : 'Search submissions...'}
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                />
            </div>

            {/* Content */}
            {loading ? (
                <div className="space-y-3">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="h-20 rounded-xl bg-[var(--color-surface-alt)] animate-pulse" />
                    ))}
                </div>
            ) : tab === 'submissions' ? (
                /* ═══ Submissions Tab ═══ */
                <div className="space-y-3">
                    {filteredSubmissions.length === 0 ? (
                        <div className="dash-card rounded-2xl p-8 text-center">
                            <FileText className="w-10 h-10 mx-auto mb-3 dash-text-tertiary" />
                            <p className="dash-text-secondary text-sm">No submissions yet. Upload content to get started.</p>
                        </div>
                    ) : filteredSubmissions.map(sub => {
                        const badge = STATUS_BADGE[sub.status] || STATUS_BADGE.pending;
                        const BadgeIcon = badge.icon;
                        return (
                            <div key={sub.id} className="dash-card rounded-xl p-4 border border-[var(--color-border)] hover:border-[var(--color-accent)] transition-colors">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                        <h4 className="font-semibold dash-text text-sm truncate">{sub.title}</h4>
                                        <p className="text-xs dash-text-tertiary mt-0.5">{sub.file_name}</p>
                                        {sub.feedback && (
                                            <p className="text-xs mt-2 px-2 py-1 rounded-lg bg-[var(--color-warning-soft)] text-[var(--color-warning)] inline-block">
                                                <AlertTriangle className="w-3 h-3 inline mr-1" />
                                                {sub.feedback}
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        {sub.overall_risk && (
                                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                        ${sub.overall_risk === 'low' ? 'bg-[var(--color-success-soft)] text-[var(--color-success)]' :
                                                    sub.overall_risk === 'medium' ? 'bg-[var(--color-warning-soft)] text-[var(--color-warning)]' :
                                                        sub.overall_risk === 'high' ? 'bg-[var(--color-warning-soft)] text-[var(--color-warning)]' :
                                                            'bg-[var(--color-danger-soft)] text-[var(--color-danger)]'}`}>
                                                {sub.overall_risk} risk
                                            </span>
                                        )}
                                        <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${badge.bg} ${badge.text}`}>
                                            <BadgeIcon className="w-3 h-3" />
                                            {sub.status.replace(/_/g, ' ')}
                                        </span>
                                    </div>
                                </div>
                                <p className="text-xs dash-text-tertiary mt-2">
                                    {new Date(sub.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </p>
                            </div>
                        );
                    })}
                </div>
            ) : (
                /* ═══ Claims Library Tab ═══ */
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filteredClaims.length === 0 ? (
                        <div className="col-span-full dash-card rounded-2xl p-8 text-center">
                            <Library className="w-10 h-10 mx-auto mb-3 dash-text-tertiary" />
                            <p className="dash-text-secondary text-sm">No approved claims available yet.</p>
                        </div>
                    ) : filteredClaims.map(claim => (
                        <div key={claim.id} className="dash-card rounded-xl p-4 border border-[var(--color-border)] hover:border-[var(--color-accent)] transition-colors group">
                            <div className="flex items-start justify-between gap-2 mb-2">
                                <div>
                                    <h4 className="font-semibold dash-text text-sm">{claim.block_name}</h4>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${BLOCK_TYPE_COLORS[claim.block_type] || 'bg-[var(--color-surface-alt)] text-[var(--color-text-primary)]'}`}>
                                            {claim.block_type.replace(/_/g, ' ')}
                                        </span>
                                        <span className="text-xs dash-text-tertiary">v{claim.version}</span>
                                        {claim.jurisdiction !== 'all' && (
                                            <span className="text-xs dash-text-tertiary">• {claim.jurisdiction}</span>
                                        )}
                                    </div>
                                </div>
                                <button onClick={() => handleCopy(claim)}
                                    className="p-1.5 rounded-lg hover:bg-[var(--color-surface-alt)] transition-colors opacity-0 group-hover:opacity-100"
                                    title="Copy claim text">
                                    {copiedId === claim.id
                                        ? <CheckCircle2 className="w-4 h-4 text-[var(--color-success)]" />
                                        : <ClipboardCopy className="w-4 h-4 dash-text-tertiary" />}
                                </button>
                            </div>
                            <p className="text-xs dash-text-secondary leading-relaxed line-clamp-3">{claim.content_text}</p>
                            {claim.approved_at && (
                                <p className="text-xs dash-text-tertiary mt-2">
                                    Approved {new Date(claim.approved_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </p>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
