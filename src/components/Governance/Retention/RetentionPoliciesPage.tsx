import React, { useState, useEffect } from 'react';
import { Shield, Clock, Archive, Trash2, Plus, Edit2, Check, X, AlertCircle, Info } from 'lucide-react';
import { retentionService, RetentionPolicy } from '../../../lib/governance/retentionService';
import { retentionRunner } from '../../../lib/governance/retentionRunner';
import { useAuth } from '../../../contexts/AuthContext';
import { logger } from '../../../lib/logger';

export default function RetentionPoliciesPage() {
    const { profile } = useAuth();
    const [policies, setPolicies] = useState<RetentionPolicy[]>([]);
    const [loading, setLoading] = useState(true);
    const [isDryRunLoading, setIsDryRunLoading] = useState(false);
    const [dryRunResult, setDryRunResult] = useState<any>(null);
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingPolicy, setEditingPolicy] = useState<RetentionPolicy | null>(null);

    // Form State
    const [formData, setFormData] = useState({
        data_class: '',
        retention_days: 365,
        archive_after_days: null as number | null,
        auto_delete: false,
        enabled: true
    });

    useEffect(() => {
        loadPolicies();
    }, []);

    async function loadPolicies() {
        try {
            setLoading(true);
            const data = await retentionService.listRetentionPolicies(profile?.company_id || '');
            setPolicies(data);
        } catch (err) {
            logger.error('Failed to load policies:', err);
        } finally {
            setLoading(false);
        }
    }

    async function handleSave() {
        try {
            if (editingPolicy) {
                await retentionService.updateRetentionPolicy(profile?.company_id || '', profile?.id || '', editingPolicy.id, formData as any);
            } else {
                await retentionService.createRetentionPolicy(profile?.company_id || '', profile?.id || '', formData as any);
            }
            setShowAddModal(false);
            setEditingPolicy(null);
            loadPolicies();
        } catch (err) {
            logger.error('Save failed:', err);
        }
    }

    async function handleDryRun() {
        try {
            setIsDryRunLoading(true);
            const result = await retentionRunner.calculateRetentionImpact(profile?.company_id as any);
            setDryRunResult(result);
        } catch (err) {
            logger.error('Dry run failed:', err);
        } finally {
            setIsDryRunLoading(false);
        }
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-[var(--color-text-primary)]">Data Retention</h1>
                    <p className="text-[var(--color-text-secondary)] mt-1 max-w-2xl">
                        Configure how long data is stored, when it should be archived, and automated cleanup rules.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleDryRun}
                        disabled={isDryRunLoading}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--color-surface)] border dash-border hover:dash-surface-alt transition-all text-sm font-medium shadow-sm"
                    >
                        {isDryRunLoading ? <Clock className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                        Impact Analysis (Dry Run)
                    </button>
                    <button
                        onClick={() => { setEditingPolicy(null); setFormData({ data_class: '', retention_days: 365, archive_after_days: null, auto_delete: false, enabled: true }); setShowAddModal(true); }}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--color-accent)] text-white hover:opacity-90 transition-all text-sm font-bold shadow-lg"
                    >
                        <Plus className="w-4 h-4" />
                        New Policy
                    </button>
                </div>
            </div>

            {/* Dry Run Outcome Alert */}
            {dryRunResult && (
                <div className="dash-card border-2 border-dashed border-[var(--color-accent)] rounded-2xl p-6 bg-[var(--color-surface-alt)]/30 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <Activity className="w-24 h-24" />
                    </div>
                    <div className="flex items-start gap-4">
                        <div className="p-3 bg-[var(--color-accent)]/10 rounded-xl">
                            <Info className="w-6 h-6 text-[var(--color-accent)]" />
                        </div>
                        <div className="flex-1">
                            <h3 className="text-lg font-bold text-[var(--color-text-primary)]">Retention Impact Analysis Result</h3>
                            <p className="text-sm text-[var(--color-text-secondary)] mt-1">
                                Completed simulation for {new Date().toLocaleDateString()}. No data was actually deleted.
                            </p>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-6">
                                <div className="space-y-1">
                                    <span className="text-[10px] uppercase tracking-widest font-bold text-[var(--color-text-tertiary)]">Policies Evaluated</span>
                                    <p className="text-2xl font-bold text-[var(--color-text-primary)]">{dryRunResult.summary?.policiesChecked || 0}</p>
                                </div>
                                <div className="space-y-1">
                                    <span className="text-[10px] uppercase tracking-widest font-bold text-[var(--color-text-tertiary)]">Records Past Retention</span>
                                    <p className="text-2xl font-bold text-[var(--color-danger)]">{dryRunResult.summary?.totalItemsTargeted || 0}</p>
                                </div>
                                <div className="space-y-1">
                                    <span className="text-[10px] uppercase tracking-widest font-bold text-[var(--color-text-tertiary)]">Legal Hold Protection</span>
                                    <p className="text-2xl font-bold text-[var(--color-accent)]">{dryRunResult.summary?.itemsOnHold || 0}</p>
                                </div>
                                <div className="space-y-1">
                                    <span className="text-[10px] uppercase tracking-widest font-bold text-[var(--color-text-tertiary)]">Net Removable</span>
                                    <p className="text-2xl font-bold text-[var(--color-text-primary)]">
                                        {(dryRunResult.summary?.totalItemsTargeted || 0) - (dryRunResult.summary?.itemsOnHold || 0)}
                                    </p>
                                </div>
                            </div>
                        </div>
                        <button onClick={() => setDryRunResult(null)} className="p-2 hover:bg-black/5 rounded-lg transition-colors">
                            <X className="w-5 h-5 text-[var(--color-text-tertiary)]" />
                        </button>
                    </div>
                </div>
            )}

            {/* Policies Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {loading ? (
                    [1, 2, 3].map(i => (
                        <div key={i} className="h-64 dash-card rounded-2xl animate-pulse bg-[var(--color-surface-alt)]" />
                    ))
                ) : policies.length === 0 ? (
                    <div className="col-span-full py-20 flex flex-col items-center justify-center dash-card rounded-2xl border-dashed border-2">
                        <Archive className="w-12 h-12 text-[var(--color-text-tertiary)] mb-4" />
                        <h3 className="text-lg font-bold">No Retention Policies Found</h3>
                        <p className="text-[var(--color-text-secondary)] mt-1">Start by creating a policy for your data classes.</p>
                    </div>
                ) : (
                    policies.map(policy => (
                        <div key={policy.id} className="dash-card border dash-border rounded-2xl p-6 hover:shadow-xl transition-all group relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-1 h-full bg-[var(--color-accent)] opacity-0 group-hover:opacity-100 transition-opacity" />

                            <div className="flex items-center justify-between mb-6">
                                <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${policy.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                    {policy.enabled ? 'Active' : 'Disabled'}
                                </div>
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={() => { setEditingPolicy(policy); setFormData({ ...policy }); setShowAddModal(true); }}
                                        className="p-1.5 hover:bg-[var(--color-surface-alt)] rounded-lg transition-colors"
                                    >
                                        <Edit2 className="w-4 h-4 text-[var(--color-text-secondary)]" />
                                    </button>
                                    <button
                                        className="p-1.5 hover:bg-red-50 rounded-lg transition-colors group/del"
                                        onClick={async () => { if (confirm('Are you sure?')) { await retentionService.deleteRetentionPolicy(profile?.company_id || '', profile?.id || '', policy.id); loadPolicies(); } }}
                                    >
                                        <Trash2 className="w-4 h-4 text-[var(--color-text-tertiary)] group-hover/del:text-[var(--color-danger)]" />
                                    </button>
                                </div>
                            </div>

                            <h3 className="text-xl font-bold text-[var(--color-text-primary)] mb-2 capitalize">{policy.data_class.replace(/_/g, ' ')}</h3>

                            <div className="space-y-3 mt-6">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-[var(--color-text-secondary)] flex items-center gap-2">
                                        <Clock className="w-4 h-4" /> Retention Period
                                    </span>
                                    <span className="font-bold">{policy.retention_days} Days</span>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-[var(--color-text-secondary)] flex items-center gap-2">
                                        <Archive className="w-4 h-4" /> Archive After
                                    </span>
                                    <span className="font-bold">{policy.archive_after_days ? `${policy.archive_after_days} Days` : 'Disabled'}</span>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-[var(--color-text-secondary)] flex items-center gap-2">
                                        <Trash2 className="w-4 h-4" /> Auto Purge
                                    </span>
                                    <span className={`font-bold ${policy.auto_delete ? 'text-[var(--color-danger)]' : 'text-[var(--color-text-tertiary)]'}`}>
                                        {policy.auto_delete ? 'Enabled' : 'Disabled'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Modal / Sidebar for adding/editing */}
            {showAddModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowAddModal(false)} />
                    <div className="relative w-full max-w-lg bg-[var(--color-surface)] rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-8">
                            <h2 className="text-2xl font-bold text-[var(--color-text-primary)]">
                                {editingPolicy ? 'Update Retention Policy' : 'Create Retention Policy'}
                            </h2>
                            <p className="text-[var(--color-text-secondary)] text-sm mt-1">
                                Define data lifecycle rules for specific content classes.
                            </p>

                            <div className="space-y-6 mt-8">
                                <div className="space-y-2">
                                    <label className="text-[10px] uppercase tracking-widest font-bold text-[var(--color-text-tertiary)] ml-1">Data Class</label>
                                    <select
                                        value={formData.data_class}
                                        onChange={e => setFormData({ ...formData, data_class: e.target.value })}
                                        className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                                    >
                                        <option value="">Select Data Class...</option>
                                        <option value="audit_logs">Audit Logs</option>
                                        <option value="content_submissions">Content Submissions</option>
                                        <option value="legal_reviews">Legal Reviews</option>
                                        <option value="automation_runs">Automation History</option>
                                        <option value="user_sessions">Security Sessions</option>
                                    </select>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-[10px] uppercase tracking-widest font-bold text-[var(--color-text-tertiary)] ml-1">Retention (Days)</label>
                                        <input
                                            type="number"
                                            value={formData.retention_days}
                                            onChange={e => setFormData({ ...formData, retention_days: parseInt(e.target.value) })}
                                            className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] uppercase tracking-widest font-bold text-[var(--color-text-tertiary)] ml-1">Archive After</label>
                                        <input
                                            type="number"
                                            placeholder="Optional"
                                            value={formData.archive_after_days || ''}
                                            onChange={e => setFormData({ ...formData, archive_after_days: e.target.value ? parseInt(e.target.value) : null })}
                                            className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                                        />
                                    </div>
                                </div>

                                <div className="flex items-center gap-6 pt-2">
                                    <label className="flex items-center gap-3 cursor-pointer group">
                                        <div className={`w-10 h-6 rounded-full transition-all relative ${formData.auto_delete ? 'bg-[var(--color-danger)]' : 'bg-gray-200'}`}>
                                            <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-all ${formData.auto_delete ? 'translate-x-4' : ''}`} />
                                        </div>
                                        <input type="checkbox" className="hidden" checked={formData.auto_delete} onChange={e => setFormData({ ...formData, auto_delete: e.target.checked })} />
                                        <span className="text-sm font-medium text-[var(--color-text-secondary)]">Auto-Delete</span>
                                    </label>

                                    <label className="flex items-center gap-3 cursor-pointer group">
                                        <div className={`w-10 h-6 rounded-full transition-all relative ${formData.enabled ? 'bg-green-500' : 'bg-gray-200'}`}>
                                            <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-all ${formData.enabled ? 'translate-x-4' : ''}`} />
                                        </div>
                                        <input type="checkbox" className="hidden" checked={formData.enabled} onChange={e => setFormData({ ...formData, enabled: e.target.checked })} />
                                        <span className="text-sm font-medium text-[var(--color-text-secondary)]">Policy Enabled</span>
                                    </label>
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
                                    onClick={handleSave}
                                    className="flex-[2] px-4 py-3 rounded-xl bg-[var(--color-accent)] text-white hover:opacity-90 text-sm font-bold shadow-lg shadow-[var(--color-accent)]/20 transition-all flex items-center justify-center gap-2"
                                >
                                    <Check className="w-4 h-4" />
                                    Save Policy
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function Activity(props: any) {
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
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
        </svg>
    );
}
