import React, { useState, useEffect } from 'react';
import { Search, Plus, Filter, FileText, ChevronRight, AlertTriangle, RefreshCw } from 'lucide-react';
import { policyService, Policy } from '../../../lib/governance/policyService';
import AddPolicyModal from './AddPolicyModal';
import { logger } from '../../../lib/logger';

export default function PoliciesPage() {
    const [policies, setPolicies] = useState<Policy[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [showAddModal, setShowAddModal] = useState(false);
    const [categoryFilter, setCategoryFilter] = useState('All');

    const fetchPolicies = async () => {
        try {
            setLoading(true);
            setLoadError(null);
            const data = await policyService.listPolicies();
            setPolicies(data);
        } catch (error: any) {
            logger.error('Error fetching policies:', error);
            setLoadError(error?.message || 'Failed to load policies');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPolicies();
    }, []);

    const filteredPolicies = policies.filter(p => {
        const matchesSearch = p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.description?.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesCategory = categoryFilter === 'All' || p.category === categoryFilter;
        return matchesSearch && matchesCategory;
    });

    const categories = ['All', ...new Set(policies.map(p => p.category))];

    const navigateToDetail = (id: string) => {
        window.dispatchEvent(new CustomEvent('navigate-to', { detail: { page: 'policy-detail', policyId: id } }));
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-2xl font-bold dash-text">Policy Management</h1>
                    <p className="text-sm dash-text-tertiary">Central repository for organization-wide policies and standards.</p>
                </div>
                <button
                    onClick={() => setShowAddModal(true)}
                    className="dash-button-primary flex items-center gap-2"
                >
                    <Plus size={18} />
                    <span>Add Policy</span>
                </button>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 items-center">
                <div className="relative flex-1 group">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 dash-text-tertiary group-focus-within:text-[var(--color-accent)] transition-colors" />
                    <input
                        type="text"
                        placeholder="Search policies..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-[var(--color-surface)] border dash-border rounded-xl pl-10 pr-4 py-2 text-sm dash-text focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] transition-all"
                    />
                </div>

                <div className="flex items-center gap-2">
                    <Filter size={16} className="dash-text-tertiary" />
                    <select
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value)}
                        className="bg-[var(--color-surface)] border dash-border rounded-xl px-4 py-2 text-sm dash-text focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                    >
                        {categories.map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="dash-card border dash-border rounded-2xl overflow-x-auto shadow-sm">
                {loadError ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-3 px-4 text-center">
                        <div className="w-10 h-10 rounded-full bg-[var(--color-danger-soft)] flex items-center justify-center">
                            <AlertTriangle size={20} className="text-[var(--color-danger)]" />
                        </div>
                        <p className="font-semibold dash-text">Failed to load policies</p>
                        <p className="text-sm dash-text-tertiary">{loadError}</p>
                        <button onClick={fetchPolicies} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border dash-border hover:bg-[var(--color-surface-alt)] transition-colors">
                            <RefreshCw size={14} /> Retry
                        </button>
                    </div>
                ) : (
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="dash-surface border-b dash-border">
                            <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest dash-text-tertiary">Policy Name</th>
                            <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest dash-text-tertiary">Category</th>
                            <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest dash-text-tertiary">Status</th>
                            <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest dash-text-tertiary">Last Updated</th>
                            <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest dash-text-tertiary"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            [...Array(3)].map((_, i) => (
                                <tr key={i} className="border-b dash-border last:border-0">
                                    <td colSpan={5} className="px-6 py-6">
                                        <div className="h-4 bg-[var(--color-surface-alt)] rounded animate-pulse w-2/3"></div>
                                    </td>
                                </tr>
                            ))
                        ) : filteredPolicies.length > 0 ? (
                            filteredPolicies.map((policy) => (
                                <tr
                                    key={policy.id}
                                    className="border-b dash-border last:border-0 hover:dash-surface-alt transition-colors group cursor-pointer"
                                    onClick={() => navigateToDetail(policy.id)}
                                >
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 rounded-lg bg-[var(--color-surface-alt)] dash-text-tertiary group-hover:bg-[var(--color-accent-soft)] group-hover:text-[var(--color-accent)] transition-colors">
                                                <FileText size={18} strokeWidth={1.5} />
                                            </div>
                                            <div>
                                                <div className="text-sm font-semibold dash-text">{policy.title}</div>
                                                <div className="text-[10px] dash-text-tertiary truncate max-w-[200px]">{policy.description}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold dash-surface-alt dash-text-secondary border dash-border">
                                            {policy.category}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-1.5">
                                            <div className={`w-1.5 h-1.5 rounded-full ${policy.status === 'active' ? 'bg-[var(--color-success)]' : 'bg-[var(--color-warning)]'}`} />
                                            <span className="text-xs dash-text capitalize">{policy.status}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-xs dash-text-tertiary">
                                        {new Date(policy.updated_at).toLocaleDateString()}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <button className="p-1 rounded-lg hover:dash-surface transition-colors dash-text-tertiary">
                                            <ChevronRight size={18} />
                                        </button>
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={5} className="px-6 py-16 text-center">
                                    <div className="flex flex-col items-center gap-3">
                                        <div className="w-12 h-12 rounded-full bg-[var(--color-surface-alt)] flex items-center justify-center mx-auto">
                                            <FileText size={24} className="dash-text-tertiary" />
                                        </div>
                                        <p className="font-semibold dash-text">{searchQuery || categoryFilter !== 'All' ? 'No policies match your filters' : 'No policies yet'}</p>
                                        <p className="text-sm dash-text-tertiary">{searchQuery || categoryFilter !== 'All' ? 'Try adjusting your search or category filter.' : 'Create your first policy to start managing compliance obligations.'}</p>
                                        {!searchQuery && categoryFilter === 'All' && (
                                            <button onClick={() => setShowAddModal(true)} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white shadow-md mt-1" style={{ background: 'var(--color-accent)' }}>
                                                <Plus size={16} /> Add Policy
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
                )}
            </div>

            {showAddModal && (
                <AddPolicyModal
                    onClose={() => setShowAddModal(false)}
                    onSuccess={() => {
                        setShowAddModal(false);
                        fetchPolicies();
                    }}
                />
            )}
        </div>
    );
}
