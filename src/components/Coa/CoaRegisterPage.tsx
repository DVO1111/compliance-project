/**
 * CoA Register — every Certificate of Analysis the company has issued.
 *
 * Certificates were previously only reachable from inside the batch detail
 * modal, so there was no way to find, re-export or approve one after leaving
 * the batch. This is the destination for that record.
 *
 * Certificates are still *generated* from a released batch (Batch Release →
 * batch → Generate CoA); this page lists, filters, approves and exports them.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    FileCheck2, Search, Loader2, AlertTriangle, Download, CheckCircle2,
    FileText, ShieldCheck, FlaskConical,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getPermissions } from '../../lib/permissions';
import { logger } from '../../lib/logger';
import {
    listCoasForCompany,
    approveCoa,
    exportCoaPdf,
    type CoaRecord,
} from '../../lib/pharma/coaService';

type StatusFilter = 'all' | 'draft' | 'qa_approved';

const STATUS_LABEL: Record<StatusFilter, string> = {
    all: 'All',
    draft: 'Draft',
    qa_approved: 'QA Approved',
};

function formatDate(iso: string | null): string {
    if (!iso) return '—';
    try {
        return new Date(iso).toLocaleDateString(undefined, {
            day: '2-digit', month: 'short', year: 'numeric',
        });
    } catch {
        return '—';
    }
}

export default function CoaRegisterPage() {
    const { profile } = useAuth();
    const [coas, setCoas] = useState<CoaRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<StatusFilter>('all');
    const [approvingId, setApprovingId] = useState<string | null>(null);

    const perms = getPermissions({
        profileRole: profile?.role,
        customPermissions: (profile as any)?.customPermissions,
        moduleAccess: (profile as any)?.module_access,
        industryType: (profile as any)?.industry_type,
    });
    // QA sign-off is the same authority that manages controls and evidence.
    const canApprove = perms.canManageGrcControls || perms.canManageAuditWorkspace;

    const load = useCallback(async () => {
        if (!profile?.company_id) return;
        setLoading(true);
        setError(null);
        try {
            setCoas(await listCoasForCompany(profile.company_id));
        } catch (e) {
            logger.error('CoaRegisterPage load failed:', e);
            setError('Could not load certificates. Refresh to try again.');
        }
        setLoading(false);
    }, [profile?.company_id]);

    useEffect(() => { void load(); }, [load]);

    const stats = useMemo(() => ({
        total: coas.length,
        draft: coas.filter(c => c.status === 'draft').length,
        approved: coas.filter(c => c.status === 'qa_approved').length,
    }), [coas]);

    const visible = useMemo(() => {
        let out = coas;
        if (filter !== 'all') out = out.filter(c => c.status === filter);
        const q = search.trim().toLowerCase();
        if (q) {
            out = out.filter(c =>
                c.coa_number.toLowerCase().includes(q) ||
                c.product_name.toLowerCase().includes(q) ||
                (c.batch_number ?? '').toLowerCase().includes(q)
            );
        }
        return out;
    }, [coas, filter, search]);

    const handleApprove = async (coa: CoaRecord) => {
        if (!profile?.company_id || !profile?.id) return;
        if (!confirm(`Approve ${coa.coa_number}? This records your e-signature and locks the certificate.`)) return;
        setApprovingId(coa.id);
        try {
            await approveCoa(coa.id, profile.company_id, profile.id, profile.full_name ?? 'QA');
            await load();
        } catch (e) {
            logger.error('approveCoa failed:', e);
            setError('Approval failed. Try again.');
        }
        setApprovingId(null);
    };

    const goToBatches = () => {
        window.dispatchEvent(new CustomEvent('navigate-to', { detail: { page: 'batch-release' } }));
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-[var(--color-text-primary)] flex items-center gap-2">
                        <FileCheck2 className="w-7 h-7 text-[var(--color-accent)]" />
                        Certificates of Analysis
                    </h1>
                    <p className="text-sm text-[var(--color-text-secondary)] mt-1">
                        Every CoA issued from a released batch — searchable, re-exportable, and QA sign-off tracked
                    </p>
                </div>
                <button
                    onClick={goToBatches}
                    className="flex items-center gap-2 px-4 py-2.5 bg-[var(--color-accent)] text-white rounded-xl text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors shadow-sm"
                >
                    <FlaskConical className="w-4 h-4" />
                    Generate from a batch
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
                <StatCard icon={FileText} label="Total issued" value={stats.total} tone="info" />
                <StatCard icon={AlertTriangle} label="Awaiting QA" value={stats.draft} tone="warning" />
                <StatCard icon={ShieldCheck} label="QA approved" value={stats.approved} tone="success" />
            </div>

            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-tertiary)]" />
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search by CoA number, product, or batch number…"
                        className="w-full pl-9 pr-3 py-2.5 border border-[var(--color-border)] rounded-xl text-sm bg-[var(--color-surface)] text-[var(--color-text-primary)] focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent outline-none"
                    />
                </div>
                <div className="flex gap-1.5">
                    {(['all', 'draft', 'qa_approved'] as const).map(f => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-colors ${filter === f
                                ? 'bg-[var(--color-accent)] text-white border-[var(--color-accent)]'
                                : 'bg-[var(--color-surface)] text-[var(--color-text-secondary)] border-[var(--color-border)] hover:bg-[var(--color-surface-alt)]'
                                }`}
                        >
                            {STATUS_LABEL[f]}
                            {f !== 'all' && ` (${f === 'draft' ? stats.draft : stats.approved})`}
                        </button>
                    ))}
                </div>
            </div>

            {error && (
                <div className="bg-[var(--color-warning-soft)] border border-[var(--color-warning)]/20 rounded-xl p-4 text-sm text-[var(--color-text-primary)]">
                    {error}
                </div>
            )}

            {/* List */}
            {loading ? (
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-8 h-8 text-[var(--color-accent)] animate-spin" />
                </div>
            ) : visible.length === 0 ? (
                <div className="border border-[var(--color-border)] rounded-2xl p-10 text-center bg-[var(--color-surface)]">
                    <FileCheck2 className="w-10 h-10 text-[var(--color-text-tertiary)] mx-auto mb-3" />
                    <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                        {coas.length === 0 ? 'No certificates issued yet' : 'No certificates match this filter'}
                    </p>
                    <p className="text-sm text-[var(--color-text-secondary)] mt-1 max-w-md mx-auto">
                        {coas.length === 0
                            ? 'A CoA is generated from a released batch. Open Batch Release, pick a released batch, and choose Generate CoA.'
                            : 'Clear the search or switch the status filter to see more.'}
                    </p>
                    {coas.length === 0 && (
                        <button
                            onClick={goToBatches}
                            className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl border border-[var(--color-border)] hover:bg-[var(--color-surface-alt)] transition-colors text-[var(--color-text-primary)]"
                        >
                            <FlaskConical className="w-4 h-4" />
                            Go to Batch Release
                        </button>
                    )}
                </div>
            ) : (
                <div className="border border-[var(--color-border)] rounded-2xl overflow-hidden bg-[var(--color-surface)]">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-[var(--color-surface-alt)] text-left">
                                    <Th>CoA number</Th>
                                    <Th>Product</Th>
                                    <Th>Batch</Th>
                                    <Th>Status</Th>
                                    <Th>Issued</Th>
                                    <Th>QA sign-off</Th>
                                    <Th align="right">Actions</Th>
                                </tr>
                            </thead>
                            <tbody>
                                {visible.map(coa => (
                                    <tr key={coa.id} className="border-t border-[var(--color-border)]">
                                        <td className="px-4 py-3 font-mono text-xs text-[var(--color-text-primary)] whitespace-nowrap">{coa.coa_number}</td>
                                        <td className="px-4 py-3 text-[var(--color-text-primary)]">{coa.product_name}</td>
                                        <td className="px-4 py-3 text-[var(--color-text-secondary)] whitespace-nowrap">{coa.batch_number ?? '—'}</td>
                                        <td className="px-4 py-3"><StatusBadge status={coa.status} /></td>
                                        <td className="px-4 py-3 text-[var(--color-text-secondary)] whitespace-nowrap">{formatDate(coa.created_at)}</td>
                                        <td className="px-4 py-3 text-[var(--color-text-secondary)] whitespace-nowrap">
                                            {coa.status === 'qa_approved'
                                                ? <>{coa.qa_approved_by_name ?? 'QA'}<span className="block text-xs text-[var(--color-text-tertiary)]">{formatDate(coa.qa_approved_at)}</span></>
                                                : '—'}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center justify-end gap-2">
                                                {coa.status === 'draft' && canApprove && (
                                                    <button
                                                        onClick={() => handleApprove(coa)}
                                                        disabled={approvingId === coa.id}
                                                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-surface-alt)] transition-colors text-[var(--color-text-primary)] disabled:opacity-50"
                                                    >
                                                        {approvingId === coa.id
                                                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                            : <CheckCircle2 className="w-3.5 h-3.5" />}
                                                        Approve
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => exportCoaPdf(coa)}
                                                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-surface-alt)] transition-colors text-[var(--color-text-primary)]"
                                                >
                                                    <Download className="w-3.5 h-3.5" />
                                                    PDF
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}

function Th({ children, align }: { children: React.ReactNode; align?: 'right' }) {
    return (
        <th className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)] ${align === 'right' ? 'text-right' : ''}`}>
            {children}
        </th>
    );
}

function StatusBadge({ status }: { status: CoaRecord['status'] }) {
    const approved = status === 'qa_approved';
    return (
        <span
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ${approved
                ? 'bg-[var(--color-success-soft)] text-[var(--color-success)]'
                : 'bg-[var(--color-warning-soft)] text-[var(--color-warning)]'
                }`}
        >
            {approved ? 'QA approved' : 'Draft'}
        </span>
    );
}

function StatCard({
    icon: Icon, label, value, tone,
}: {
    icon: typeof FileText;
    label: string;
    value: number;
    tone: 'info' | 'warning' | 'success';
}) {
    const toneClass = {
        info: 'text-[var(--color-accent)] bg-[var(--color-info-soft)]',
        warning: 'text-[var(--color-warning)] bg-[var(--color-warning-soft)]',
        success: 'text-[var(--color-success)] bg-[var(--color-success-soft)]',
    }[tone];

    return (
        <div className="border border-[var(--color-border)] rounded-2xl p-4 bg-[var(--color-surface)] flex items-center gap-3">
            <div className={`p-2 rounded-xl ${toneClass}`}>
                <Icon className="w-5 h-5" />
            </div>
            <div>
                <p className="text-xl font-bold text-[var(--color-text-primary)] leading-none">{value}</p>
                <p className="text-xs text-[var(--color-text-secondary)] mt-1">{label}</p>
            </div>
        </div>
    );
}
