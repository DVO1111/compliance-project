import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getPermissions } from '../../lib/permissions';
import {
    getFrameworksWithControlCounts,
    createFramework,
    updateFramework,
    type FrameworkWithCount,
} from '../../lib/grc/grcFrameworkService';
import FrameworkModal from './FrameworkModal';
import {
    ShieldCheck,
    Plus,
    Pencil,
    ToggleLeft,
    ToggleRight,
    AlertCircle,
    RefreshCw,
    Layers,
} from 'lucide-react';

export default function GrcFrameworksPage() {
    const { user, profile } = useAuth();
    const perms = getPermissions({
        profileRole: profile?.role,
        customPermissions: (profile as any)?.customPermissions,
    });
    const companyId = (profile as any)?.company_id as string | null;

    const [frameworks, setFrameworks] = useState<FrameworkWithCount[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Modal state
    const [modalOpen, setModalOpen] = useState(false);
    const [editingFramework, setEditingFramework] = useState<FrameworkWithCount | null>(null);

    const toast = (message: string, type: 'success' | 'warning' = 'success') => {
        window.dispatchEvent(new CustomEvent('global-toast', { detail: { message, type } }));
    };

    const fetchFrameworks = useCallback(async () => {
        if (!companyId) return;
        setLoading(true);
        setError(null);
        try {
            const data = await getFrameworksWithControlCounts(companyId);
            setFrameworks(data);
        } catch (err: any) {
            setError(err?.message || 'Failed to load frameworks');
        } finally {
            setLoading(false);
        }
    }, [companyId]);

    useEffect(() => {
        fetchFrameworks();
    }, [fetchFrameworks]);

    const handleCreate = () => {
        setEditingFramework(null);
        setModalOpen(true);
    };

    const handleEdit = (fw: FrameworkWithCount) => {
        setEditingFramework(fw);
        setModalOpen(true);
    };

    const handleToggleStatus = async (fw: FrameworkWithCount) => {
        if (!user || !companyId) return;
        const newStatus = fw.status === 'active' ? 'inactive' : 'active';
        try {
            await updateFramework(fw.id, { status: newStatus }, user.id, companyId);
            toast(`Framework ${newStatus === 'active' ? 'enabled' : 'disabled'} successfully`);
            fetchFrameworks();
        } catch (err: any) {
            toast(err?.message || 'Failed to update framework status', 'warning');
        }
    };

    const handleSave = async (data: {
        name: string;
        description: string;
        version: string;
        status: 'active' | 'inactive' | 'draft';
    }) => {
        if (!user || !companyId) return;

        try {
            if (editingFramework) {
                await updateFramework(
                    editingFramework.id,
                    {
                        name: data.name,
                        description: data.description || null,
                        version: data.version || null,
                        status: data.status,
                    },
                    user.id,
                    companyId
                );
                toast('Framework updated successfully');
            } else {
                await createFramework(
                    {
                        company_id: companyId,
                        name: data.name,
                        description: data.description || null,
                        version: data.version || null,
                        status: data.status,
                    },
                    user.id
                );
                toast('Framework created successfully');
            }
            fetchFrameworks();
        } catch (err: any) {
            toast(err?.message || 'Operation failed', 'warning');
            throw err; // re-throw so modal stays open
        }
    };

    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return '—';
        return new Date(dateStr).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    };

    const statusBadge = (status: string) => {
        const map: Record<string, string> = {
            active: 'bg-[var(--color-success-soft)] text-[var(--color-success)]',
            inactive: 'bg-[var(--color-surface-alt)] text-[var(--color-text-tertiary)]',
            draft: 'bg-[var(--color-info-soft)] text-[var(--color-info)]',
        };
        return (
            <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${map[status] || map.draft}`}
            >
                {status}
            </span>
        );
    };

    // — Skeleton Rows —
    const SkeletonRows = () => (
        <>
            {[1, 2, 3, 4].map((i) => (
                <tr key={i} className="border-b border-[var(--color-border)]">
                    {[1, 2, 3, 4, 5, 6].map((j) => (
                        <td key={j} className="px-4 py-3.5">
                            <div className="h-4 rounded-lg bg-[var(--color-surface-alt)] animate-pulse" style={{ width: j === 1 ? '70%' : j === 6 ? '40%' : '50%' }} />
                        </td>
                    ))}
                </tr>
            ))}
        </>
    );

    // — Empty State —
    const EmptyState = () => (
        <div className="dash-card rounded-2xl border border-[var(--color-border)] p-12 text-center">
            <div className="p-3 rounded-2xl bg-[var(--color-accent-soft)] inline-flex mb-4">
                <Layers className="w-8 h-8 dash-accent" />
            </div>
            <h3 className="text-lg font-bold dash-text mb-1">No frameworks yet</h3>
            <p className="text-sm dash-text-secondary mb-5 max-w-sm mx-auto">
                Create your first compliance framework to start mapping controls and tracking evidence.
            </p>
            {perms.canManageGrcFrameworks && (
                <button
                    onClick={handleCreate}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-white shadow-md transition-all hover:opacity-90"
                    style={{ background: 'var(--color-accent)' }}
                >
                    <Plus className="w-4 h-4" />
                    Add Framework
                </button>
            )}
        </div>
    );

    // — Error State —
    const ErrorState = () => (
        <div className="dash-card rounded-2xl border border-[var(--color-danger)]/20 bg-[var(--color-danger-soft)] p-8 text-center">
            <AlertCircle className="w-8 h-8 text-[var(--color-danger)] mx-auto mb-3" />
            <h3 className="text-lg font-semibold dash-text mb-1">Failed to load frameworks</h3>
            <p className="text-sm dash-text-secondary mb-4">{error}</p>
            <button
                onClick={fetchFrameworks}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium dash-text border border-[var(--color-border)] hover:bg-[var(--color-surface-alt)] transition-colors"
            >
                <RefreshCw className="w-4 h-4" />
                Retry
            </button>
        </div>
    );

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between">
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <div className="p-2 rounded-xl bg-[var(--color-accent-soft)]">
                            <ShieldCheck className="w-5 h-5 dash-accent" />
                        </div>
                        <h2 className="text-2xl font-bold dash-text">GRC Frameworks</h2>
                    </div>
                    <p className="dash-text-secondary text-sm ml-12">
                        Manage compliance frameworks, map controls, and track governance posture
                    </p>
                </div>
                {perms.canManageGrcFrameworks && !loading && frameworks.length > 0 && (
                    <button
                        onClick={handleCreate}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white shadow-md transition-all hover:opacity-90 shrink-0"
                        style={{ background: 'var(--color-accent)' }}
                    >
                        <Plus className="w-4 h-4" />
                        Add Framework
                    </button>
                )}
            </div>

            {/* Content */}
            {error ? (
                <ErrorState />
            ) : !loading && frameworks.length === 0 ? (
                <EmptyState />
            ) : (
                <div className="dash-card rounded-2xl border border-[var(--color-border)] overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-alt)]">
                                <th className="text-left px-4 py-3 font-semibold dash-text text-xs uppercase tracking-wider">Name</th>
                                <th className="text-left px-4 py-3 font-semibold dash-text text-xs uppercase tracking-wider">Version</th>
                                <th className="text-left px-4 py-3 font-semibold dash-text text-xs uppercase tracking-wider">Status</th>
                                <th className="text-left px-4 py-3 font-semibold dash-text text-xs uppercase tracking-wider">Controls</th>
                                <th className="text-left px-4 py-3 font-semibold dash-text text-xs uppercase tracking-wider">Created</th>
                                {perms.canManageGrcFrameworks && (
                                    <th className="text-right px-4 py-3 font-semibold dash-text text-xs uppercase tracking-wider">Actions</th>
                                )}
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <SkeletonRows />
                            ) : (
                                frameworks.map((fw) => (
                                    <tr
                                        key={fw.id}
                                        className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-alt)]/50 transition-colors"
                                    >
                                        <td className="px-4 py-3.5">
                                            <div className="font-medium dash-text">{fw.name}</div>
                                            {fw.description && (
                                                <div className="text-xs dash-text-tertiary mt-0.5 truncate max-w-[260px]">
                                                    {fw.description}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3.5">
                                            <span className="dash-text-secondary">{fw.version || '—'}</span>
                                        </td>
                                        <td className="px-4 py-3.5">{statusBadge(fw.status || 'draft')}</td>
                                        <td className="px-4 py-3.5">
                                            <span className="inline-flex items-center gap-1.5 text-xs font-medium dash-text-secondary">
                                                <Layers className="w-3.5 h-3.5" />
                                                {fw.control_count}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3.5">
                                            <span className="text-xs dash-text-tertiary">{formatDate(fw.created_at)}</span>
                                        </td>
                                        {perms.canManageGrcFrameworks && (
                                            <td className="px-4 py-3.5 text-right">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    <button
                                                        onClick={() => handleEdit(fw)}
                                                        title="Edit framework"
                                                        className="p-1.5 rounded-lg hover:bg-[var(--color-surface-alt)] transition-colors group"
                                                    >
                                                        <Pencil className="w-4 h-4 dash-text-tertiary group-hover:dash-accent" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleToggleStatus(fw)}
                                                        title={fw.status === 'active' ? 'Disable framework' : 'Enable framework'}
                                                        className="p-1.5 rounded-lg hover:bg-[var(--color-surface-alt)] transition-colors group"
                                                    >
                                                        {fw.status === 'active' ? (
                                                            <ToggleRight className="w-5 h-5 text-[var(--color-success)] group-hover:opacity-80" />
                                                        ) : (
                                                            <ToggleLeft className="w-5 h-5 dash-text-tertiary group-hover:dash-accent" />
                                                        )}
                                                    </button>
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Modal */}
            <FrameworkModal
                isOpen={modalOpen}
                onClose={() => {
                    setModalOpen(false);
                    setEditingFramework(null);
                }}
                onSave={handleSave}
                initialData={
                    editingFramework
                        ? {
                            name: editingFramework.name,
                            description: editingFramework.description || '',
                            version: editingFramework.version || '',
                            status: (editingFramework.status as 'active' | 'inactive' | 'draft') || 'draft',
                        }
                        : undefined
                }
                isEdit={!!editingFramework}
            />
        </div>
    );
}
