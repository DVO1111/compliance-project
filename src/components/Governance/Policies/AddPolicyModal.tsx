import React, { useState } from 'react';
import { X, Shield, Info } from 'lucide-react';
import { policyService } from '../../../lib/governance/policyService';
import { useAuth } from '../../../contexts/AuthContext';

interface AddPolicyModalProps {
    onClose: () => void;
    onSuccess: () => void;
}

export default function AddPolicyModal({ onClose, onSuccess }: AddPolicyModalProps) {
    const { profile } = useAuth();
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        category: 'Information Security',
    });
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.title) return;

        try {
            setLoading(true);
            setError(null);
            await policyService.createPolicy(profile?.company_id || '', profile?.id || '', formData as any);
            onSuccess();
        } catch (err: any) {
            setError(err.message || 'Failed to create policy');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="dash-card border dash-border rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between p-6 border-b dash-border">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
                            <Shield size={20} />
                        </div>
                        <h2 className="text-xl font-bold dash-text">Create New Policy</h2>
                    </div>
                    <button onClick={onClose} className="dash-text-tertiary hover:dash-text-primary transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {error && (
                        <div className="p-3 rounded-xl bg-[var(--color-danger-soft)] text-[var(--color-danger)] text-sm border border-[var(--color-danger-border)]">
                            {error}
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary px-1">Policy Title</label>
                        <input
                            type="text"
                            required
                            placeholder="e.g. Acceptable Use Policy"
                            value={formData.title}
                            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                            className="w-full bg-[var(--color-surface)] border dash-border rounded-xl px-4 py-2.5 text-sm dash-text focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] transition-all"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary px-1">Category</label>
                        <select
                            value={formData.category}
                            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                            className="w-full bg-[var(--color-surface)] border dash-border rounded-xl px-4 py-2.5 text-sm dash-text focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] transition-all"
                        >
                            <option value="Information Security">Information Security</option>
                            <option value="Privacy">Privacy</option>
                            <option value="Human Resources">Human Resources</option>
                            <option value="Operations">Operations</option>
                            <option value="Compliance">Compliance</option>
                            <option value="Legal">Legal</option>
                        </select>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary px-1">Description</label>
                        <textarea
                            placeholder="Brief overview of the policy purpose..."
                            rows={3}
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            className="w-full bg-[var(--color-surface)] border dash-border rounded-xl px-4 py-2.5 text-sm dash-text focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] transition-all resize-none"
                        />
                    </div>

                    <div className="p-4 rounded-xl bg-[var(--color-surface-alt)] flex gap-3 text-xs dash-text-secondary border dash-border">
                        <Info size={16} className="shrink-0 dash-text-tertiary" />
                        <p>Creating a policy creates a "Head" record. You can upload versioned documents and publish them once created.</p>
                    </div>

                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2.5 rounded-xl border dash-border dash-text font-semibold hover:dash-surface-alt transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading || !formData.title}
                            className="flex-1 bg-[var(--color-accent)] text-white px-4 py-2.5 rounded-xl font-semibold hover:opacity-90 disabled:opacity-50 transition-all shadow-md shadow-[var(--color-accent)]/20"
                        >
                            {loading ? 'Creating...' : 'Create Policy'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
