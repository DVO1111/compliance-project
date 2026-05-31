import { useState, useEffect } from 'react';
import { X } from 'lucide-react';

interface FrameworkFormData {
    name: string;
    description: string;
    version: string;
    status: 'active' | 'inactive' | 'draft';
}

interface FrameworkModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: FrameworkFormData) => Promise<void>;
    initialData?: Partial<FrameworkFormData>;
    isEdit?: boolean;
}

export default function FrameworkModal({
    isOpen,
    onClose,
    onSave,
    initialData,
    isEdit = false,
}: FrameworkModalProps) {
    const [form, setForm] = useState<FrameworkFormData>({
        name: '',
        description: '',
        version: '',
        status: 'draft',
    });
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setForm({
                name: initialData?.name || '',
                description: initialData?.description || '',
                version: initialData?.version || '',
                status: initialData?.status || 'draft',
            });
            setErrors({});
        }
    }, [isOpen, initialData]);

    const validate = (): boolean => {
        const errs: Record<string, string> = {};
        if (!form.name.trim()) errs.name = 'Framework name is required';
        setErrors(errs);
        return Object.keys(errs).length === 0;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validate()) return;
        setSaving(true);
        try {
            await onSave(form);
            onClose();
        } catch {
            // errors handled by parent via toast
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            onClick={onClose}
        >
            <div
                className="bg-[var(--color-surface)] rounded-2xl shadow-2xl max-w-lg w-full"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-[var(--color-border)] rounded-t-2xl">
                    <h3 className="text-lg font-bold dash-text">
                        {isEdit ? 'Edit Framework' : 'Add Framework'}
                    </h3>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg hover:bg-[var(--color-surface-alt)] transition-colors"
                    >
                        <X className="w-5 h-5 dash-text-secondary" />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    {/* Name */}
                    <div>
                        <label className="block text-sm font-medium dash-text mb-1.5">
                            Name <span className="text-[var(--color-danger)]">*</span>
                        </label>
                        <input
                            type="text"
                            value={form.name}
                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                            placeholder="e.g. SOC 2, ISO 27001, HIPAA"
                            className={`w-full px-3 py-2.5 rounded-xl border text-sm bg-[var(--color-surface)] dash-text focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] transition-all ${errors.name ? 'border-[var(--color-danger)]' : 'border-[var(--color-border)]'
                                }`}
                        />
                        {errors.name && (
                            <p className="text-xs text-[var(--color-danger)] mt-1">{errors.name}</p>
                        )}
                    </div>

                    {/* Description */}
                    <div>
                        <label className="block text-sm font-medium dash-text mb-1.5">Description</label>
                        <textarea
                            value={form.description}
                            onChange={(e) => setForm({ ...form, description: e.target.value })}
                            placeholder="Brief description of this compliance framework"
                            rows={3}
                            className="w-full px-3 py-2.5 rounded-xl border border-[var(--color-border)] text-sm bg-[var(--color-surface)] dash-text focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] transition-all resize-none"
                        />
                    </div>

                    {/* Version + Status row */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-medium dash-text mb-1.5">Version</label>
                            <input
                                type="text"
                                value={form.version}
                                onChange={(e) => setForm({ ...form, version: e.target.value })}
                                placeholder="e.g. v1.0"
                                className="w-full px-3 py-2.5 rounded-xl border border-[var(--color-border)] text-sm bg-[var(--color-surface)] dash-text focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] transition-all"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium dash-text mb-1.5">Status</label>
                            <select
                                value={form.status}
                                onChange={(e) =>
                                    setForm({ ...form, status: e.target.value as FrameworkFormData['status'] })
                                }
                                className="w-full px-3 py-2.5 rounded-xl border border-[var(--color-border)] text-sm bg-[var(--color-surface)] dash-text focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] transition-all"
                            >
                                <option value="draft">Draft</option>
                                <option value="active">Active</option>
                                <option value="inactive">Inactive</option>
                            </select>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 rounded-xl text-sm font-medium dash-text-secondary hover:bg-[var(--color-surface-alt)] transition-colors border border-[var(--color-border)]"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="px-5 py-2 rounded-xl text-sm font-medium text-white shadow-md transition-all disabled:opacity-50"
                            style={{ background: 'var(--color-accent)' }}
                        >
                            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Framework'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
