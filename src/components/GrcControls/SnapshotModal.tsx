import { useState } from 'react';
import { X } from 'lucide-react';

interface SnapshotModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: { status: string; notes: string }) => Promise<void>;
    controlTitle: string;
}

export default function SnapshotModal({ isOpen, onClose, onSave, controlTitle }: SnapshotModalProps) {
    const [status, setStatus] = useState('unknown');
    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            await onSave({ status, notes });
            setStatus('unknown');
            setNotes('');
            onClose();
        } catch {
            // handled by parent
        } finally {
            setSaving(false);
        }
    };

    const statusOptions = [
        { value: 'compliant', label: 'Compliant', color: 'bg-[var(--color-success-soft)] text-[var(--color-success)]' },
        { value: 'non_compliant', label: 'Non-Compliant', color: 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]' },
        { value: 'partial', label: 'Partial', color: 'bg-[var(--color-info-soft)] text-[var(--color-info)]' },
        { value: 'unknown', label: 'Unknown', color: 'bg-[var(--color-surface-alt)] dash-text-tertiary' },
    ];

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
            <div className="bg-[var(--color-surface)] rounded-2xl shadow-2xl max-w-md w-full" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between p-5 border-b border-[var(--color-border)] rounded-t-2xl">
                    <div>
                        <h3 className="text-lg font-bold dash-text">Set Snapshot</h3>
                        <p className="text-xs dash-text-tertiary mt-0.5 truncate max-w-[280px]">{controlTitle}</p>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--color-surface-alt)]">
                        <X className="w-5 h-5 dash-text-secondary" />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    <div>
                        <label className="block text-sm font-medium dash-text mb-2">Compliance Status</label>
                        <div className="grid grid-cols-2 gap-2">
                            {statusOptions.map(opt => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => setStatus(opt.value)}
                                    className={`px-3 py-2.5 rounded-xl text-xs font-medium border transition-all ${status === opt.value
                                            ? 'border-[var(--color-accent)] ring-2 ring-[var(--color-accent)]/30 ' + opt.color
                                            : 'border-[var(--color-border)] dash-text-secondary hover:border-[var(--color-accent)]'
                                        }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium dash-text mb-1.5">Notes</label>
                        <textarea
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            placeholder="Optional notes about this assessment"
                            rows={3}
                            className="w-full px-3 py-2.5 rounded-xl border border-[var(--color-border)] text-sm bg-[var(--color-surface)] dash-text focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] resize-none"
                        />
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium dash-text-secondary border border-[var(--color-border)] hover:bg-[var(--color-surface-alt)]">Cancel</button>
                        <button type="submit" disabled={saving} className="px-5 py-2 rounded-xl text-sm font-medium text-white shadow-md disabled:opacity-50" style={{ background: 'var(--color-accent)' }}>
                            {saving ? 'Saving…' : 'Save Snapshot'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
