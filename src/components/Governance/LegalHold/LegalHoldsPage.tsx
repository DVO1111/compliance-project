import React, { useState, useEffect } from 'react';
import { Lock, Unlock, ShieldAlert, Plus, Search, Filter, MoreVertical, Calendar, User, CheckCircle2 } from 'lucide-react';
import { legalHoldService, LegalHold } from '../../../lib/governance/legalHoldService';
import { useAuth } from '../../../contexts/AuthContext';
import { logger } from '../../../lib/logger';

export default function LegalHoldsPage() {
    const { profile } = useAuth();
    const [holds, setHolds] = useState<LegalHold[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // Form State
    const [formData, setFormData] = useState({
        name: '',
        reason: ''
    });

    useEffect(() => {
        loadHolds();
    }, []);

    async function loadHolds() {
        try {
            setLoading(true);
            const data = await legalHoldService.listHolds(profile?.company_id || '');
            setHolds(data);
        } catch (err) {
            logger.error('Failed to load holds:', err);
        } finally {
            setLoading(false);
        }
    }

    async function handleCreate() {
        if (!formData.name) return;
        try {
            await legalHoldService.createLegalHold(
                profile?.company_id || '',
                profile?.id || '',
                { name: formData.name, reason: formData.reason }
            );
            setShowAddModal(false);
            setFormData({ name: '', reason: '' });
            loadHolds();
        } catch (err) {
            logger.error('Create hold failed:', err);
        }
    }

    async function handleRelease(holdId: string) {
        if (!confirm('Are you sure you want to release this legal hold? Deletion protections will be removed.')) return;
        try {
            await legalHoldService.releaseLegalHold(profile?.company_id || '', profile?.id || '', holdId);
            loadHolds();
        } catch (err) {
            logger.error('Release failed:', err);
        }
    }

    const filteredHolds = holds.filter(h =>
        h.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (h.reason || '').toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-[var(--color-text-primary)]">Legal Holds</h1>
                    <p className="text-[var(--color-text-secondary)] mt-1 max-w-2xl">
                        Protect evidence from automated cleanup or intentional deletion during litigation or audits.
                    </p>
                </div>
                <button
                    onClick={() => setShowAddModal(true)}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-[var(--color-accent)] text-white hover:opacity-90 transition-all text-sm font-bold shadow-lg shadow-[var(--color-accent)]/20"
                >
                    <Plus className="w-5 h-5" />
                    Initiate Legal Hold
                </button>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="dash-card border dash-border rounded-2xl p-6 flex items-center justify-between">
                    <div className="space-y-1">
                        <span className="text-[10px] uppercase tracking-widest font-bold text-[var(--color-text-tertiary)]">Active Holds</span>
                        <p className="text-3xl font-bold text-[var(--color-text-primary)]">{holds.length}</p>
                    </div>
                    <div className="p-3 bg-red-100/50 rounded-2xl">
                        <ShieldAlert className="w-8 h-8 text-red-600" />
                    </div>
                </div>
                <div className="dash-card border dash-border rounded-2xl p-6 flex items-center justify-between">
                    <div className="space-y-1">
                        <span className="text-[10px] uppercase tracking-widest font-bold text-[var(--color-text-tertiary)]">Protected Records</span>
                        <p className="text-3xl font-bold text-[var(--color-text-primary)]">0</p>
                    </div>
                    <div className="p-3 bg-blue-100/50 rounded-2xl">
                        <Lock className="w-8 h-8 text-blue-600" />
                    </div>
                </div>
                <div className="dash-card border dash-border rounded-2xl p-6 flex items-center justify-between">
                    <div className="space-y-1">
                        <span className="text-[10px] uppercase tracking-widest font-bold text-[var(--color-text-tertiary)]">Avg Duration</span>
                        <p className="text-3xl font-bold text-[var(--color-text-primary)]">--</p>
                    </div>
                    <div className="p-3 bg-gray-100 rounded-2xl">
                        <Calendar className="w-8 h-8 text-gray-500" />
                    </div>
                </div>
            </div>

            {/* Filter Row */}
            <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-tertiary)]" />
                    <input
                        type="text"
                        placeholder="Search by name or reason..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full bg-[var(--color-surface)] border dash-border rounded-2xl pl-11 pr-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] transition-all"
                    />
                </div>
                <button className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-[var(--color-surface)] border dash-border hover:dash-surface-alt transition-all text-sm font-medium">
                    <Filter className="w-4 h-4" />
                    Filters
                </button>
            </div>

            {/* Holds Table */}
            <div className="dash-card border dash-border rounded-2xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-[var(--color-surface-alt)] border-b dash-border">
                            <tr>
                                <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-tertiary)]">Name & Description</th>
                                <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-tertiary)]">Status</th>
                                <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-tertiary)]">Initiated</th>
                                <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-tertiary)]">By</th>
                                <th className="px-6 py-4 text-right text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-tertiary)]">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y dash-border">
                            {loading ? (
                                [1, 2, 3].map(i => (
                                    <tr key={i} className="animate-pulse">
                                        <td colSpan={5} className="px-6 py-8"><div className="h-4 bg-gray-100 rounded w-full"></div></td>
                                    </tr>
                                ))
                            ) : filteredHolds.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-[var(--color-text-secondary)]">
                                        No active legal holds found matching your criteria.
                                    </td>
                                </tr>
                            ) : (
                                filteredHolds.map(hold => (
                                    <tr key={hold.id} className="hover:bg-black/[0.02] transition-colors group">
                                        <td className="px-6 py-5">
                                            <div className="space-y-1">
                                                <p className="font-bold text-[var(--color-text-primary)] group-hover:text-[var(--color-accent)] transition-colors">{hold.name}</p>
                                                <p className="text-xs text-[var(--color-text-secondary)] line-clamp-1">{hold.reason || 'No reason provided'}</p>
                                            </div>
                                        </td>
                                        <td className="px-6 py-5">
                                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-red-100 text-red-700 shadow-sm border border-red-200">
                                                <Lock className="w-3 h-3" /> Active
                                            </span>
                                        </td>
                                        <td className="px-6 py-5 text-sm text-[var(--color-text-secondary)]">
                                            {new Date(hold.created_at).toLocaleDateString()}
                                        </td>
                                        <td className="px-6 py-5">
                                            <div className="flex items-center gap-2">
                                                <div className="w-7 h-7 rounded-full bg-[var(--color-accent)] text-white flex items-center justify-center text-[10px] font-bold">
                                                    <User className="w-3 h-3" />
                                                </div>
                                                <span className="text-xs font-medium text-[var(--color-text-primary)]">Compliance Lead</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-5 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={() => handleRelease(hold.id)}
                                                    className="flex items-center gap-2 px-4 py-2 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 transition-all text-xs font-bold"
                                                >
                                                    <Unlock className="w-3 h-3" />
                                                    Release
                                                </button>
                                                <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                                                    <MoreVertical className="w-4 h-4 text-gray-400" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Add Modal */}
            {showAddModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowAddModal(false)} />
                    <div className="relative w-full max-w-lg bg-[var(--color-surface)] rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border dash-border">
                        <div className="p-8">
                            <div className="flex items-center gap-4 mb-6">
                                <div className="p-3 bg-red-100 rounded-2xl">
                                    <ShieldAlert className="w-6 h-6 text-red-600" />
                                </div>
                                <div>
                                    <h2 className="text-2xl font-bold text-[var(--color-text-primary)] tracking-tight">Initiate Legal Hold</h2>
                                    <p className="text-[var(--color-text-secondary)] text-sm">Create a formal litigation hold record.</p>
                                </div>
                            </div>

                            <div className="space-y-6 mt-8">
                                <div className="space-y-2">
                                    <label className="text-[10px] uppercase tracking-widest font-bold text-[var(--color-text-tertiary)] ml-1">Case / Hold Name</label>
                                    <input
                                        type="text"
                                        value={formData.name}
                                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                                        placeholder="e.g. Litigation - Case-2024-X"
                                        className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] transition-all font-medium"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] uppercase tracking-widest font-bold text-[var(--color-text-tertiary)] ml-1">Reason / Scope</label>
                                    <textarea
                                        rows={4}
                                        value={formData.reason}
                                        onChange={e => setFormData({ ...formData, reason: e.target.value })}
                                        placeholder="Explain why this hold is being applied and what data it covers..."
                                        className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] transition-all resize-none"
                                    />
                                </div>

                                <div className="p-4 bg-orange-50 rounded-2xl border border-orange-100 flex gap-3">
                                    <Info className="w-5 h-5 text-orange-600 shrink-0" />
                                    <p className="text-xs text-orange-700 leading-relaxed font-medium">
                                        Initiating this hold will immediately block all automated and manual deletions for designated content in accordance with your preservation duty.
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-3 mt-10">
                                <button
                                    onClick={() => setShowAddModal(false)}
                                    className="flex-1 px-4 py-3 rounded-xl bg-[var(--color-surface-alt)] hover:dash-surface text-sm font-bold transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleCreate}
                                    disabled={!formData.name}
                                    className="flex-[2] px-4 py-3 rounded-xl bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 text-sm font-bold shadow-lg shadow-red-600/20 transition-all flex items-center justify-center gap-2"
                                >
                                    <Lock className="w-4 h-4" />
                                    Apply Seal
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function Info(props: any) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
        </svg>
    );
}
