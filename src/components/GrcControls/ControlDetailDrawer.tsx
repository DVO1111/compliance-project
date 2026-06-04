import { useState, useEffect, useCallback } from 'react';
import {
    X, ShieldCheck, User, Layers, Camera, Link2, Clock, Tag, FileText,
    AlertTriangle, Trash2, CalendarX2, ExternalLink, Calendar,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import type { EnrichedControl, CompanyMember } from '../../lib/grc/grcControlsService';
import {
    getEnrichedEvidence,
    bulkLinkEvidence,
    unlinkEvidence,
    expireEvidence,
    setValidUntil,
    getLinkedEntityIds,
    type EnrichedEvidence,
} from '../../lib/grc/grcEvidenceService';
import EvidencePickerModal from './EvidencePickerModal';

interface ControlDetailDrawerProps {
    control: EnrichedControl | null;
    onClose: () => void;
    onAssignOwner: (controlId: string, ownerUserId: string | null) => Promise<void>;
    onSetSnapshot: () => void;
    members: CompanyMember[];
    canManage: boolean;
}

export default function ControlDetailDrawer({
    control, onClose, onAssignOwner, onSetSnapshot, members, canManage,
}: ControlDetailDrawerProps) {
    const { user, profile } = useAuth();
    const companyId = (profile as any)?.company_id as string | null;

    const [assigningOwner, setAssigningOwner] = useState(false);
    const [selectedOwner, setSelectedOwner] = useState('');

    // Evidence state
    const [evidence, setEvidence] = useState<EnrichedEvidence[]>([]);
    const [evidenceLoading, setEvidenceLoading] = useState(false);
    const [linkedIds, setLinkedIds] = useState<string[]>([]);
    const [pickerOpen, setPickerOpen] = useState(false);

    const toast = (message: string, type: 'success' | 'warning' = 'success') => {
        window.dispatchEvent(new CustomEvent('global-toast', { detail: { message, type } }));
    };

    const loadEvidence = useCallback(async () => {
        if (!control || !companyId) return;
        setEvidenceLoading(true);
        try {
            const [enriched, ids] = await Promise.all([
                getEnrichedEvidence(control.id, companyId),
                getLinkedEntityIds(control.id, companyId, 'content_submission'),
            ]);
            setEvidence(enriched);
            setLinkedIds(ids);
        } catch { /* silent */ } finally {
            setEvidenceLoading(false);
        }
    }, [control, companyId]);

    useEffect(() => {
        if (control) loadEvidence();
        else { setEvidence([]); setLinkedIds([]); }
    }, [control, loadEvidence]);

    if (!control) return null;

    const handleAssign = async () => {
        setAssigningOwner(true);
        try {
            await onAssignOwner(control.id, selectedOwner || null);
        } catch { } finally { setAssigningOwner(false); }
    };

    const handleBulkLink = async (submissionIds: string[]) => {
        if (!companyId || !user) return;
        try {
            const entities = submissionIds.map(id => ({ entityType: 'content_submission' as const, entityId: id }));
            const count = await bulkLinkEvidence(control.id, entities, companyId, user.id);
            toast(`${count} evidence item${count > 1 ? 's' : ''} linked`);
            loadEvidence();
        } catch (err: any) {
            toast(err?.message || 'Failed to link evidence', 'warning');
            throw err;
        }
    };

    const handleUnlink = async (evidenceId: string) => {
        if (!companyId || !user) return;
        try {
            await unlinkEvidence(evidenceId, companyId, user.id);
            toast('Evidence unlinked');
            loadEvidence();
        } catch (err: any) {
            toast(err?.message || 'Failed to unlink', 'warning');
        }
    };

    const handleExpire = async (evidenceId: string) => {
        if (!companyId || !user) return;
        try {
            await expireEvidence(evidenceId, companyId, user.id);
            toast('Evidence marked as expired');
            loadEvidence();
        } catch (err: any) {
            toast(err?.message || 'Failed to expire', 'warning');
        }
    };

    const handleSetValidUntil = async (evidenceId: string, date: string) => {
        if (!companyId || !user) return;
        try {
            await setValidUntil(evidenceId, date || null, companyId, user.id);
            toast('Validity date updated');
            loadEvidence();
        } catch (err: any) {
            toast(err?.message || 'Failed to update', 'warning');
        }
    };

    const viewInArchive = (submissionId: string | null) => {
        if (!submissionId) return;
        localStorage.setItem('cc_open_content_id', submissionId);
        window.dispatchEvent(new CustomEvent('navigate', { detail: { page: 'archive' } }));
        window.dispatchEvent(new CustomEvent('navigate-to', { detail: { page: 'archive' } }));
    };

    const snapshotBadge = (status: string | null) => {
        const map: Record<string, string> = {
            compliant: 'bg-[var(--color-success-soft)] text-[var(--color-success)]',
            non_compliant: 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]',
            partial: 'bg-[var(--color-info-soft)] text-[var(--color-info)]',
            unknown: 'bg-[var(--color-surface-alt)] dash-text-tertiary',
        };
        if (!status) return <span className="text-xs dash-text-tertiary">No snapshot</span>;
        return <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${map[status] || map.unknown}`}>{status.replace('_', ' ')}</span>;
    };

    const evidenceStatusBadge = (status: string) => {
        const map: Record<string, { cls: string; label: string }> = {
            valid: { cls: 'bg-[var(--color-success-soft)] text-[var(--color-success)]', label: 'Valid' },
            expired: { cls: 'bg-[var(--color-info-soft)] text-[var(--color-info)]', label: 'Expired' },
            missing: { cls: 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]', label: 'Missing' },
        };
        const s = map[status] || map.valid;
        return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${s.cls}`}>
            {status === 'missing' && <AlertTriangle className="w-3 h-3" />}
            {s.label}
        </span>;
    };

    return (
        <>
            <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={onClose} />
            <div className="fixed top-0 right-0 z-50 h-full w-full max-w-lg bg-[var(--color-surface)] border-l border-[var(--color-border)] shadow-2xl overflow-y-auto animate-slide-in-right">
                {/* Header */}
                <div className="sticky top-0 z-10 bg-[var(--color-surface)] border-b border-[var(--color-border)] p-5">
                    <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                                <span className="inline-flex px-2 py-0.5 rounded-md text-xs font-mono font-medium bg-[var(--color-accent-soft)] dash-accent">{control.reference_code || '—'}</span>
                                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${control.status === 'active' ? 'bg-[var(--color-success-soft)] text-[var(--color-success)]' : 'bg-[var(--color-surface-alt)] dash-text-tertiary'}`}>{control.status}</span>
                            </div>
                            <h3 className="text-lg font-bold dash-text truncate">{control.title}</h3>
                        </div>
                        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--color-surface-alt)] shrink-0 ml-3">
                            <X className="w-5 h-5 dash-text-secondary" />
                        </button>
                    </div>
                </div>

                <div className="p-5 space-y-5">
                    {/* Description */}
                    {control.description && (
                        <div>
                            <SectionLabel icon={<FileText className="w-3.5 h-3.5" />} label="Description" />
                            <p className="text-sm dash-text-secondary leading-relaxed">{control.description}</p>
                        </div>
                    )}

                    {/* Metadata Grid */}
                    <div className="grid grid-cols-2 gap-3">
                        <InfoCard icon={<ShieldCheck className="w-4 h-4" />} label="Framework" value={control.framework_name} />
                        <InfoCard icon={<Tag className="w-4 h-4" />} label="Category" value={control.domain_category || '—'} />
                        <InfoCard icon={<User className="w-4 h-4" />} label="Owner" value={control.owner_name || 'Unassigned'} />
                        <InfoCard icon={<Clock className="w-4 h-4" />} label="Created" value={new Date(control.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} />
                    </div>

                    {/* Snapshot */}
                    <div className="rounded-xl border border-[var(--color-border)] p-4">
                        <div className="flex items-center justify-between mb-2">
                            <SectionLabel icon={<Camera className="w-3.5 h-3.5" />} label="Latest Snapshot" />
                            {snapshotBadge(control.latest_snapshot_status)}
                        </div>
                        {canManage && (
                            <button onClick={onSetSnapshot} className="mt-2 w-full px-3 py-2 rounded-xl text-xs font-medium dash-text border border-[var(--color-border)] hover:bg-[var(--color-surface-alt)] transition-colors flex items-center justify-center gap-1.5">
                                <Camera className="w-3.5 h-3.5" /> Set Snapshot
                            </button>
                        )}
                    </div>

                    {/* ═══════ EVIDENCE SECTION ═══════ */}
                    <div className="rounded-xl border border-[var(--color-border)] overflow-hidden">
                        <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)] bg-[var(--color-surface-alt)]/50">
                            <div className="flex items-center gap-2">
                                <SectionLabel icon={<Link2 className="w-3.5 h-3.5" />} label="Evidence" />
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--color-accent-soft)] dash-accent">
                                    <Layers className="w-3 h-3" /> {evidence.length}
                                </span>
                            </div>
                            {canManage && (
                                <button
                                    onClick={() => setPickerOpen(true)}
                                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-white hover:opacity-90 transition-colors"
                                    style={{ background: 'var(--color-accent)' }}
                                >
                                    + Link Evidence
                                </button>
                            )}
                        </div>

                        {evidenceLoading ? (
                            <div className="p-4 space-y-2">
                                {[1, 2, 3].map(i => <div key={i} className="h-12 rounded-lg bg-[var(--color-surface-alt)] animate-pulse" />)}
                            </div>
                        ) : evidence.length === 0 ? (
                            <div className="p-6 text-center">
                                <Link2 className="w-6 h-6 dash-text-tertiary mx-auto mb-2" />
                                <p className="text-sm dash-text-secondary mb-1">No evidence linked yet</p>
                                <p className="text-xs dash-text-tertiary">Link existing Archive documents as compliance evidence</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-[var(--color-border)]">
                                {evidence.map(ev => (
                                    <div key={ev.id} className="p-3 hover:bg-[var(--color-surface-alt)]/30 transition-colors">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-0.5">
                                                    <span className="text-sm font-medium dash-text truncate max-w-[200px]">
                                                        {ev.computed_status === 'missing' ? (
                                                            <span className="dash-text-tertiary italic">Deleted document</span>
                                                        ) : (
                                                            ev.entity_label || 'Untitled'
                                                        )}
                                                    </span>
                                                    {evidenceStatusBadge(ev.computed_status)}
                                                </div>
                                                <div className="flex items-center gap-2 text-[10px] dash-text-tertiary">
                                                    {ev.entity_detail && <span>{ev.entity_detail}</span>}
                                                    <span>Linked {new Date(ev.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                                                    {ev.valid_until && (
                                                        <span className="flex items-center gap-0.5">
                                                            <Calendar className="w-2.5 h-2.5" />
                                                            Valid until {new Date(ev.valid_until).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            {canManage && (
                                                <div className="flex items-center gap-1 shrink-0">
                                                    {ev.computed_status !== 'missing' && ev.entity_type === 'content_submission' && ev.entity_id && (
                                                        <button onClick={() => viewInArchive(ev.entity_id)} title="View in Archive" className="p-1 rounded-lg hover:bg-[var(--color-surface-alt)] group">
                                                            <ExternalLink className="w-3.5 h-3.5 dash-text-tertiary group-hover:dash-accent" />
                                                        </button>
                                                    )}
                                                    {ev.computed_status === 'valid' && (
                                                        <>
                                                            <input
                                                                type="date"
                                                                title="Set Valid Until"
                                                                className="w-[26px] h-6 opacity-0 cursor-pointer absolute"
                                                                onChange={e => { if (e.target.value) handleSetValidUntil(ev.id, e.target.value); }}
                                                            />
                                                            <button title="Set valid until date" className="p-1 rounded-lg hover:bg-[var(--color-surface-alt)] group relative">
                                                                <CalendarX2 className="w-3.5 h-3.5 dash-text-tertiary group-hover:text-[var(--color-info)]" />
                                                            </button>
                                                            <button onClick={() => handleExpire(ev.id)} title="Mark expired" className="p-1 rounded-lg hover:bg-[var(--color-surface-alt)] group">
                                                                <CalendarX2 className="w-3.5 h-3.5 dash-text-tertiary group-hover:text-[var(--color-info)]" />
                                                            </button>
                                                        </>
                                                    )}
                                                    <button onClick={() => handleUnlink(ev.id)} title="Unlink evidence" className="p-1 rounded-lg hover:bg-[var(--color-danger-soft)] group">
                                                        <Trash2 className="w-3.5 h-3.5 dash-text-tertiary group-hover:text-[var(--color-danger)]" />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Assign Owner */}
                    {canManage && (
                        <div className="rounded-xl border border-[var(--color-border)] p-4">
                            <SectionLabel icon={<User className="w-3.5 h-3.5" />} label="Assign Owner" />
                            <div className="flex items-center gap-2 mt-3">
                                <select value={selectedOwner} onChange={e => setSelectedOwner(e.target.value)} className="flex-1 px-3 py-2 rounded-xl border border-[var(--color-border)] text-sm bg-[var(--color-surface)] dash-text focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]">
                                    <option value="">Unassigned</option>
                                    {members.map(m => <option key={m.user_id} value={m.user_id}>{m.full_name}</option>)}
                                </select>
                                <button onClick={handleAssign} disabled={assigningOwner} className="px-4 py-2 rounded-xl text-sm font-medium text-white shrink-0 disabled:opacity-50" style={{ background: 'var(--color-accent)' }}>
                                    {assigningOwner ? '…' : 'Assign'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Evidence Picker Modal */}
            {companyId && (
                <EvidencePickerModal
                    isOpen={pickerOpen}
                    onClose={() => setPickerOpen(false)}
                    onLink={handleBulkLink}
                    companyId={companyId}
                    excludeIds={linkedIds}
                />
            )}

            <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .animate-slide-in-right {
          animation: slideInRight 0.25s ease-out;
        }
      `}</style>
        </>
    );
}

function SectionLabel({ icon, label }: { icon: React.ReactNode; label: string }) {
    return (
        <div className="flex items-center gap-2 text-xs font-semibold dash-text-tertiary uppercase tracking-wider">
            {icon} {label}
        </div>
    );
}

function InfoCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
    return (
        <div className="rounded-xl border border-[var(--color-border)] p-3">
            <div className="flex items-center gap-1.5 text-xs dash-text-tertiary mb-1">{icon} {label}</div>
            <div className="text-sm font-medium dash-text truncate">{value}</div>
        </div>
    );
}
