import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import type { CompanyMember } from '../../lib/grc/grcControlsService';

interface ControlFormData {
    framework_id: string;
    reference_code: string;
    title: string;
    description: string;
    domain_category: string;
    status: string;
    owner_user_id: string;
}

interface Framework {
    id: string;
    name: string;
}

interface ControlModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: ControlFormData) => Promise<void>;
    initialData?: Partial<ControlFormData>;
    isEdit?: boolean;
    frameworks: Framework[];
    members: CompanyMember[];
}

export default function ControlModal({
    isOpen, onClose, onSave, initialData, isEdit = false, frameworks, members,
}: ControlModalProps) {
    const [form, setForm] = useState<ControlFormData>({
        framework_id: '', reference_code: '', title: '', description: '',
        domain_category: '', status: 'active', owner_user_id: '',
    });
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setForm({
                framework_id: initialData?.framework_id || '',
                reference_code: initialData?.reference_code || '',
                title: initialData?.title || '',
                description: initialData?.description || '',
                domain_category: initialData?.domain_category || '',
                status: initialData?.status || 'active',
                owner_user_id: initialData?.owner_user_id || '',
            });
            setErrors({});
        }
    }, [isOpen, initialData]);

    const validate = (): boolean => {
        const errs: Record<string, string> = {};
        if (!form.framework_id) errs.framework_id = 'Framework is required';
        if (!form.reference_code.trim()) errs.reference_code = 'Reference code is required';
        if (!form.title.trim()) errs.title = 'Title is required';
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
        } catch { /* handled by parent */ } finally { setSaving(false); }
    };

    if (!isOpen) return null;

    const fieldCls = (key: string) =>
        `w-full px-3 py-2.5 rounded-xl border text-sm bg-[var(--color-surface)] dash-text focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] transition-all ${errors[key] ? 'border-[var(--color-danger)]' : 'border-[var(--color-border)]'}`;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
            <div className="bg-[var(--color-surface)] rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="sticky top-0 bg-[var(--color-surface)] flex items-center justify-between p-5 border-b border-[var(--color-border)] rounded-t-2xl z-10">
                    <h3 className="text-lg font-bold dash-text">{isEdit ? 'Edit Control' : 'Add Control'}</h3>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--color-surface-alt)]">
                        <X className="w-5 h-5 dash-text-secondary" />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    {/* Framework */}
                    <div>
                        <label className="block text-sm font-medium dash-text mb-1.5">Framework <span className="text-[var(--color-danger)]">*</span></label>
                        <select value={form.framework_id} onChange={e => setForm({ ...form, framework_id: e.target.value })} className={fieldCls('framework_id')} disabled={isEdit}>
                            <option value="">Select framework</option>
                            {frameworks.map(fw => <option key={fw.id} value={fw.id}>{fw.name}</option>)}
                        </select>
                        {errors.framework_id && <p className="text-xs text-[var(--color-danger)] mt-1">{errors.framework_id}</p>}
                    </div>

                    {/* Ref Code + Title */}
                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <label className="block text-sm font-medium dash-text mb-1.5">Ref Code <span className="text-[var(--color-danger)]">*</span></label>
                            <input type="text" value={form.reference_code} onChange={e => setForm({ ...form, reference_code: e.target.value })} placeholder="CC1.1" className={fieldCls('reference_code')} />
                            {errors.reference_code && <p className="text-xs text-[var(--color-danger)] mt-1">{errors.reference_code}</p>}
                        </div>
                        <div className="col-span-2">
                            <label className="block text-sm font-medium dash-text mb-1.5">Title <span className="text-[var(--color-danger)]">*</span></label>
                            <input type="text" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Access Control Policy" className={fieldCls('title')} />
                            {errors.title && <p className="text-xs text-[var(--color-danger)] mt-1">{errors.title}</p>}
                        </div>
                    </div>

                    {/* Description */}
                    <div>
                        <label className="block text-sm font-medium dash-text mb-1.5">Description</label>
                        <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="What this control covers" rows={2} className={`${fieldCls('description')} resize-none`} />
                    </div>

                    {/* Category + Status */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-medium dash-text mb-1.5">Domain/Category</label>
                            <input type="text" value={form.domain_category} onChange={e => setForm({ ...form, domain_category: e.target.value })} placeholder="e.g. Access Control" className={fieldCls('domain_category')} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium dash-text mb-1.5">Status</label>
                            <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className={fieldCls('status')}>
                                <option value="active">Active</option>
                                <option value="inactive">Inactive</option>
                            </select>
                        </div>
                    </div>

                    {/* Owner */}
                    <div>
                        <label className="block text-sm font-medium dash-text mb-1.5">Owner</label>
                        <select value={form.owner_user_id} onChange={e => setForm({ ...form, owner_user_id: e.target.value })} className={fieldCls('owner_user_id')}>
                            <option value="">Unassigned</option>
                            {members.map(m => <option key={m.user_id} value={m.user_id}>{m.full_name}</option>)}
                        </select>
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end gap-3 pt-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium dash-text-secondary border border-[var(--color-border)] hover:bg-[var(--color-surface-alt)]">Cancel</button>
                        <button type="submit" disabled={saving} className="px-5 py-2 rounded-xl text-sm font-medium text-white shadow-md disabled:opacity-50" style={{ background: 'var(--color-accent)' }}>
                            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Control'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
