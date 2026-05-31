import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getPermissions } from '../../lib/permissions';
import {
    getControlsEnriched,
    createControl,
    updateControl,
    assignOwner,
    getCompanyMembers,
    type EnrichedControl,
    type CompanyMember,
} from '../../lib/grc/grcControlsService';
import { getFrameworks } from '../../lib/grc/grcFrameworkService';
import { createSnapshot } from '../../lib/grc/grcSnapshotsService';
import ControlModal from './ControlModal';
import ControlDetailDrawer from './ControlDetailDrawer';
import SnapshotModal from './SnapshotModal';
import {
    ListChecks,
    Plus,
    Pencil,
    Eye,
    AlertCircle,
    RefreshCw,
    Layers,
    Filter,
    UserCheck,
} from 'lucide-react';

export default function GrcControlsPage() {
    const { user, profile } = useAuth();
    const perms = getPermissions({
        profileRole: profile?.role,
        customPermissions: (profile as any)?.customPermissions,
    });
    const companyId = (profile as any)?.company_id as string | null;

    // Data
    const [controls, setControls] = useState<EnrichedControl[]>([]);
    const [frameworks, setFrameworks] = useState<{ id: string; name: string }[]>([]);
    const [members, setMembers] = useState<CompanyMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Filters
    const [filterFramework, setFilterFramework] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [filterOwner, setFilterOwner] = useState('');

    // Modals
    const [modalOpen, setModalOpen] = useState(false);
    const [editingControl, setEditingControl] = useState<EnrichedControl | null>(null);
    const [drawerControl, setDrawerControl] = useState<EnrichedControl | null>(null);
    const [snapshotControl, setSnapshotControl] = useState<EnrichedControl | null>(null);

    const toast = (message: string, type: 'success' | 'warning' = 'success') => {
        window.dispatchEvent(new CustomEvent('global-toast', { detail: { message, type } }));
    };

    const fetchData = useCallback(async () => {
        if (!companyId) return;
        setLoading(true);
        setError(null);
        try {
            const [enrichedControls, fws, mems] = await Promise.all([
                getControlsEnriched(companyId, filterFramework || undefined),
                getFrameworks(companyId),
                getCompanyMembers(companyId),
            ]);
            setControls(enrichedControls);
            setFrameworks((fws as any[]).map(f => ({ id: f.id, name: f.name })));
            setMembers(mems);
        } catch (err: any) {
            setError(err?.message || 'Failed to load controls');
        } finally {
            setLoading(false);
        }
    }, [companyId, filterFramework]);

    useEffect(() => { fetchData(); }, [fetchData]);

    // Filtered controls (client-side for status/owner since controlsEnriched already fetched)
    const filtered = controls.filter(c => {
        if (filterStatus && c.status !== filterStatus) return false;
        if (filterOwner && c.owner_user_id !== filterOwner) return false;
        return true;
    });

    const handleCreate = () => { setEditingControl(null); setModalOpen(true); };

    const handleEdit = (c: EnrichedControl) => { setEditingControl(c); setModalOpen(true); };

    const handleSave = async (data: any) => {
        if (!user || !companyId) return;
        try {
            if (editingControl) {
                await updateControl(editingControl.id, {
                    reference_code: data.reference_code || null,
                    title: data.title,
                    description: data.description || null,
                    domain_category: data.domain_category || null,
                    status: data.status,
                    owner_user_id: data.owner_user_id || null,
                }, user.id, companyId);
                toast('Control updated successfully');
            } else {
                await createControl({
                    company_id: companyId,
                    framework_id: data.framework_id,
                    reference_code: data.reference_code || null,
                    title: data.title,
                    description: data.description || null,
                    domain_category: data.domain_category || null,
                    status: data.status,
                    owner_user_id: data.owner_user_id || null,
                }, user.id);
                toast('Control created successfully');
            }
            fetchData();
        } catch (err: any) {
            toast(err?.message || 'Operation failed', 'warning');
            throw err;
        }
    };

    const handleAssignOwner = async (controlId: string, ownerUserId: string | null) => {
        if (!user || !companyId) return;
        try {
            await assignOwner(controlId, ownerUserId, user.id, companyId);
            toast('Owner assigned successfully');
            fetchData();
            // Update drawer control if open
            if (drawerControl?.id === controlId) {
                const updated = controls.find(c => c.id === controlId);
                if (updated) {
                    const ownerName = ownerUserId ? members.find(m => m.user_id === ownerUserId)?.full_name || null : null;
                    setDrawerControl({ ...updated, owner_user_id: ownerUserId, owner_name: ownerName });
                }
            }
        } catch (err: any) {
            toast(err?.message || 'Failed to assign owner', 'warning');
            throw err;
        }
    };

    const handleSetSnapshot = async (data: { status: string; notes: string }) => {
        if (!user || !companyId || !snapshotControl) return;
        try {
            await createSnapshot({
                company_id: companyId,
                control_id: snapshotControl.id,
                status: data.status,
                notes: data.notes || null,
            } as any, user.id);
            toast('Snapshot saved successfully');
            fetchData();
        } catch (err: any) {
            toast(err?.message || 'Failed to save snapshot', 'warning');
            throw err;
        }
    };

    const snapshotBadge = (status: string | null) => {
        const map: Record<string, string> = {
            compliant: 'bg-[var(--color-success-soft)] text-[var(--color-success)]',
            non_compliant: 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]',
            partial: 'bg-[var(--color-info-soft)] text-[var(--color-info)]',
            unknown: 'bg-[var(--color-surface-alt)] dash-text-tertiary',
        };
        if (!status) return <span className="dash-text-tertiary text-xs">—</span>;
        return (
            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${map[status] || map.unknown}`}>
                {status.replace('_', ' ')}
            </span>
        );
    };

    const statusBadge = (status: string | null) => {
        const cls = status === 'active'
            ? 'bg-[var(--color-success-soft)] text-[var(--color-success)]'
            : 'bg-[var(--color-surface-alt)] dash-text-tertiary';
        return <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${cls}`}>{status || 'active'}</span>;
    };

    // ─── Skeleton ─────────────────────────────────────────────
    const SkeletonRows = () => (
        <>{[1, 2, 3, 4, 5].map(i => (
            <tr key={i} className="border-b border-[var(--color-border)]">
                {[1, 2, 3, 4, 5, 6, 7, 8].map(j => (
                    <td key={j} className="px-3 py-3"><div className="h-4 rounded-lg bg-[var(--color-surface-alt)] animate-pulse" style={{ width: `${40 + j * 5}%` }} /></td>
                ))}
            </tr>
        ))}</>
    );

    // ─── Empty State ──────────────────────────────────────────
    const EmptyState = () => (
        <div className="dash-card rounded-2xl border border-[var(--color-border)] p-12 text-center">
            <div className="p-3 rounded-2xl bg-[var(--color-accent-soft)] inline-flex mb-4">
                <Layers className="w-8 h-8 dash-accent" />
            </div>
            <h3 className="text-lg font-bold dash-text mb-1">No controls yet</h3>
            <p className="text-sm dash-text-secondary mb-5 max-w-sm mx-auto">
                {frameworks.length === 0
                    ? 'Create a framework first, then add controls to it.'
                    : 'Add your first control to start tracking compliance.'}
            </p>
            {perms.canManageGrcControls && frameworks.length > 0 && (
                <button onClick={handleCreate} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-white shadow-md hover:opacity-90" style={{ background: 'var(--color-accent)' }}>
                    <Plus className="w-4 h-4" /> Add Control
                </button>
            )}
        </div>
    );

    // ─── Error ────────────────────────────────────────────────
    const ErrorState = () => (
        <div className="dash-card rounded-2xl border border-[var(--color-danger)]/20 bg-[var(--color-danger-soft)] p-8 text-center">
            <AlertCircle className="w-8 h-8 text-[var(--color-danger)] mx-auto mb-3" />
            <h3 className="text-lg font-semibold dash-text mb-1">Failed to load controls</h3>
            <p className="text-sm dash-text-secondary mb-4">{error}</p>
            <button onClick={fetchData} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium dash-text border border-[var(--color-border)] hover:bg-[var(--color-surface-alt)]">
                <RefreshCw className="w-4 h-4" /> Retry
            </button>
        </div>
    );

    // ─── Unique owners for filter ─────────────────────────────
    const uniqueOwners = Array.from(new Map(
        controls.filter(c => c.owner_user_id).map(c => [c.owner_user_id!, { id: c.owner_user_id!, name: c.owner_name || 'Unnamed' }])
    ).values());

    const uniqueCategories = Array.from(new Set(controls.map(c => c.domain_category).filter(Boolean)));

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex items-start justify-between">
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <div className="p-2 rounded-xl bg-[var(--color-accent-soft)]">
                            <ListChecks className="w-5 h-5 dash-accent" />
                        </div>
                        <h2 className="text-2xl font-bold dash-text">GRC Controls</h2>
                    </div>
                    <p className="dash-text-secondary text-sm ml-12">
                        Manage compliance controls, assign owners, and track assessment snapshots
                    </p>
                </div>
                {perms.canManageGrcControls && !loading && controls.length > 0 && frameworks.length > 0 && (
                    <button onClick={handleCreate} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white shadow-md hover:opacity-90 shrink-0" style={{ background: 'var(--color-accent)' }}>
                        <Plus className="w-4 h-4" /> Add Control
                    </button>
                )}
            </div>

            {/* Filters */}
            {!loading && controls.length > 0 && (
                <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-1.5 text-xs font-semibold dash-text-tertiary uppercase tracking-wider">
                        <Filter className="w-3.5 h-3.5" /> Filters
                    </div>
                    <select value={filterFramework} onChange={e => setFilterFramework(e.target.value)} className="px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-xs bg-[var(--color-surface)] dash-text focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]">
                        <option value="">All Frameworks</option>
                        {frameworks.map(fw => <option key={fw.id} value={fw.id}>{fw.name}</option>)}
                    </select>
                    <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-xs bg-[var(--color-surface)] dash-text focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]">
                        <option value="">All Statuses</option>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                    </select>
                    <select value={filterOwner} onChange={e => setFilterOwner(e.target.value)} className="px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-xs bg-[var(--color-surface)] dash-text focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]">
                        <option value="">All Owners</option>
                        {uniqueOwners.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                    {(filterFramework || filterStatus || filterOwner) && (
                        <button onClick={() => { setFilterFramework(''); setFilterStatus(''); setFilterOwner(''); }} className="px-2.5 py-1.5 rounded-lg text-xs font-medium dash-accent hover:bg-[var(--color-accent-soft)] transition-colors">
                            Clear
                        </button>
                    )}
                    <span className="text-xs dash-text-tertiary ml-auto">{filtered.length} control{filtered.length !== 1 ? 's' : ''}</span>
                </div>
            )}

            {/* Content */}
            {error ? (
                <ErrorState />
            ) : !loading && controls.length === 0 ? (
                <EmptyState />
            ) : (
                <div className="dash-card rounded-2xl border border-[var(--color-border)] overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-alt)]">
                                    <th className="text-left px-3 py-3 font-semibold dash-text text-xs uppercase tracking-wider">Ref</th>
                                    <th className="text-left px-3 py-3 font-semibold dash-text text-xs uppercase tracking-wider">Title</th>
                                    <th className="text-left px-3 py-3 font-semibold dash-text text-xs uppercase tracking-wider">Framework</th>
                                    <th className="text-left px-3 py-3 font-semibold dash-text text-xs uppercase tracking-wider">Owner</th>
                                    <th className="text-left px-3 py-3 font-semibold dash-text text-xs uppercase tracking-wider">Category</th>
                                    <th className="text-left px-3 py-3 font-semibold dash-text text-xs uppercase tracking-wider">Status</th>
                                    <th className="text-left px-3 py-3 font-semibold dash-text text-xs uppercase tracking-wider">Snapshot</th>
                                    <th className="text-left px-3 py-3 font-semibold dash-text text-xs uppercase tracking-wider">Evidence</th>
                                    {perms.canManageGrcControls && (
                                        <th className="text-right px-3 py-3 font-semibold dash-text text-xs uppercase tracking-wider">Actions</th>
                                    )}
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? <SkeletonRows /> : filtered.map(c => (
                                    <tr key={c.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-alt)]/50 transition-colors cursor-pointer" onClick={() => setDrawerControl(c)}>
                                        <td className="px-3 py-3"><span className="font-mono text-xs font-medium dash-accent">{c.reference_code || '—'}</span></td>
                                        <td className="px-3 py-3">
                                            <div className="font-medium dash-text max-w-[200px] truncate">{c.title}</div>
                                        </td>
                                        <td className="px-3 py-3"><span className="text-xs dash-text-secondary">{c.framework_name}</span></td>
                                        <td className="px-3 py-3">
                                            <span className={`text-xs ${c.owner_name ? 'dash-text-secondary' : 'dash-text-tertiary italic'}`}>
                                                {c.owner_name || 'Unassigned'}
                                            </span>
                                        </td>
                                        <td className="px-3 py-3"><span className="text-xs dash-text-tertiary">{c.domain_category || '—'}</span></td>
                                        <td className="px-3 py-3">{statusBadge(c.status)}</td>
                                        <td className="px-3 py-3">{snapshotBadge(c.latest_snapshot_status)}</td>
                                        <td className="px-3 py-3">
                                            <span className="inline-flex items-center gap-1 text-xs dash-text-secondary">
                                                <Layers className="w-3 h-3" /> {c.evidence_count}
                                            </span>
                                        </td>
                                        {perms.canManageGrcControls && (
                                            <td className="px-3 py-3 text-right" onClick={e => e.stopPropagation()}>
                                                <div className="flex items-center justify-end gap-1">
                                                    <button onClick={() => handleEdit(c)} title="Edit" className="p-1.5 rounded-lg hover:bg-[var(--color-surface-alt)] group">
                                                        <Pencil className="w-3.5 h-3.5 dash-text-tertiary group-hover:dash-accent" />
                                                    </button>
                                                    <button onClick={() => setDrawerControl(c)} title="View details" className="p-1.5 rounded-lg hover:bg-[var(--color-surface-alt)] group">
                                                        <Eye className="w-3.5 h-3.5 dash-text-tertiary group-hover:dash-accent" />
                                                    </button>
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Modals */}
            <ControlModal
                isOpen={modalOpen}
                onClose={() => { setModalOpen(false); setEditingControl(null); }}
                onSave={handleSave}
                initialData={editingControl ? {
                    framework_id: editingControl.framework_id,
                    reference_code: editingControl.reference_code || '',
                    title: editingControl.title,
                    description: editingControl.description || '',
                    domain_category: editingControl.domain_category || '',
                    status: editingControl.status || 'active',
                    owner_user_id: editingControl.owner_user_id || '',
                } : undefined}
                isEdit={!!editingControl}
                frameworks={frameworks}
                members={members}
            />

            <ControlDetailDrawer
                control={drawerControl}
                onClose={() => setDrawerControl(null)}
                onAssignOwner={handleAssignOwner}
                onSetSnapshot={() => { setSnapshotControl(drawerControl); }}
                members={members}
                canManage={perms.canManageGrcControls}
            />

            <SnapshotModal
                isOpen={!!snapshotControl}
                onClose={() => setSnapshotControl(null)}
                onSave={handleSetSnapshot}
                controlTitle={snapshotControl?.title || ''}
            />
        </div>
    );
}
