import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Lock, FileText, AlertTriangle, KeyRound, Activity, Trash2 } from 'lucide-react';
import { logger } from '../../lib/logger';

interface DeletedContent {
    id: string;
    title: string;
    platform: string;
    content_topic: string;
    deleted_at: string;
    deleted_by: string;
    deleter_name?: string;
}

export default function SecretVaultPage() {
    const { profile } = useAuth();
    const companyId = (profile as any)?.company_id as string | undefined;

    const [hasPin, setHasPin] = useState<boolean | null>(null);
    const [isUnlocked, setIsUnlocked] = useState(false);

    const [newPin, setNewPin] = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const [unlockPin, setUnlockPin] = useState('');

    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    const [deletedItems, setDeletedItems] = useState<DeletedContent[]>([]);

    // Check if user has a PIN setup
    useEffect(() => {
        if (!profile) return;
        setHasPin(!!(profile as any).vault_pin_hash);
    }, [profile]);

    const fetchDeletedContent = async () => {
        if (!companyId) return;
        const { data: items, error } = await supabase
            .from('content_submissions')
            .select('id, title, platform, content_topic, deleted_at, deleted_by')
            .eq('company_id', companyId)
            .eq('is_deleted', true)
            .order('deleted_at', { ascending: false });

        if (error || !items) {
            logger.error('Failed to fetch vault content:', error);
            return;
        }

        const fetchedItems = items as any[] as DeletedContent[];

        // Best effort mapping of deleted_by to actual names
        const userIds = Array.from(new Set(fetchedItems.map(i => i.deleted_by).filter(Boolean)));
        if (userIds.length > 0) {
            const { data: profiles } = await supabase
                .from('profiles')
                .select('id, full_name')
                .in('id', userIds);

            const nameMap = new Map((profiles as any[] || []).map(p => [p.id, p.full_name]));
            const enriched = fetchedItems.map(item => ({
                ...item,
                deleter_name: nameMap.get(item.deleted_by) || 'Unknown User'
            }));
            setDeletedItems(enriched);
        } else {
            setDeletedItems(fetchedItems);
        }
    };

    const handleCreatePin = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg('');
        if (newPin !== confirmPin) {
            setErrorMsg('PINs do not match.');
            return;
        }
        if (newPin.length < 4) {
            setErrorMsg('PIN must be at least 4 characters long.');
            return;
        }

        setLoading(true);
        const { data: success, error } = await (supabase as any).rpc('create_vault_pin', { pin: newPin } as any);
        setLoading(false);

        if (error || !success) {
            setErrorMsg('Failed to create vault PIN.');
        } else {
            setHasPin(true);
            setIsUnlocked(true);
            fetchDeletedContent();
        }
    };

    const handleUnlockPin = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg('');
        setLoading(true);

        const { data: success, error } = await (supabase as any).rpc('verify_vault_pin', { pin: unlockPin } as any);
        setLoading(false);

        if (error || !success) {
            setErrorMsg('Incorrect Vault PIN.');
        } else {
            setIsUnlocked(true);
            fetchDeletedContent();
        }
    };

    if (hasPin === null) return null; // loading state

    // View: Create PIN
    if (!hasPin) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[70vh]">
                <div className="max-w-md w-full bg-[var(--color-surface)] rounded-2xl p-8 shadow-xl border border-[var(--color-border)] text-center">
                    <div className="mx-auto w-16 h-16 bg-[var(--color-danger-soft)] rounded-full flex items-center justify-center mb-6">
                        <Lock className="w-8 h-8 text-[var(--color-danger)]" />
                    </div>
                    <h2 className="text-2xl font-bold text-[var(--color-text-primary)] mb-2">Secret Vault Setup</h2>
                    <p className="text-sm text-[var(--color-text-secondary)] mb-6">
                        As an authorized user, you must create a private PIN to access the Secret Vault containing soft-deleted records.
                    </p>

                    <form onSubmit={handleCreatePin} className="space-y-4 text-left">
                        {errorMsg && (
                            <div className="p-3 text-sm text-[var(--color-danger)] bg-[var(--color-danger-soft)] rounded-lg flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4" /> {errorMsg}
                            </div>
                        )}
                        <div>
                            <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">Enter a Private PIN</label>
                            <input
                                type="password"
                                className="w-full px-4 py-2 border border-[var(--color-border)] rounded-lg focus:ring-2 focus:ring-[var(--color-danger)] outline-none"
                                value={newPin}
                                onChange={e => setNewPin(e.target.value)}
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">Confirm PIN</label>
                            <input
                                type="password"
                                className="w-full px-4 py-2 border border-[var(--color-border)] rounded-lg focus:ring-2 focus:ring-[var(--color-danger)] outline-none"
                                value={confirmPin}
                                onChange={e => setConfirmPin(e.target.value)}
                                required
                            />
                        </div>
                        <button
                            disabled={loading}
                            className="w-full py-2.5 bg-[var(--color-danger)] text-white rounded-lg font-medium hover:opacity-90 transition"
                        >
                            {loading ? 'Setting up...' : 'Create Vault PIN'}
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    // View: Unlock Vault
    if (!isUnlocked) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[70vh]">
                <div className="max-w-md w-full bg-[var(--color-surface)] rounded-2xl p-8 shadow-xl border border-[var(--color-border)] text-center">
                    <div className="mx-auto w-16 h-16 bg-[var(--color-danger-soft)] rounded-full flex items-center justify-center mb-6">
                        <KeyRound className="w-8 h-8 text-[var(--color-danger)]" />
                    </div>
                    <h2 className="text-2xl font-bold text-[var(--color-text-primary)] mb-2">Unlock Secret Vault</h2>
                    <p className="text-sm text-[var(--color-text-secondary)] mb-6">
                        Enter your private PIN to view soft-deleted content.
                    </p>

                    <form onSubmit={handleUnlockPin} className="space-y-4 text-left">
                        {errorMsg && (
                            <div className="p-3 text-sm text-[var(--color-danger)] bg-[var(--color-danger-soft)] rounded-lg flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4" /> {errorMsg}
                            </div>
                        )}
                        <input
                            type="password"
                            placeholder="Enter Vault PIN"
                            className="w-full px-4 py-2 border border-[var(--color-border)] rounded-lg focus:ring-2 focus:ring-[var(--color-danger)] outline-none text-center tracking-widest text-lg"
                            value={unlockPin}
                            onChange={e => setUnlockPin(e.target.value)}
                            autoFocus
                            required
                        />
                        <button
                            disabled={loading}
                            className="w-full py-2.5 flex justify-center items-center gap-2 bg-[var(--color-danger)] text-white rounded-lg font-medium hover:opacity-90 transition"
                        >
                            <Lock className="w-4 h-4" /> {loading ? 'Verifying...' : 'Unlock Vault'}
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    // View: Unlocked Vault Data
    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-[var(--color-danger-soft)] text-[var(--color-danger)] rounded-xl">
                        <Lock className="w-6 h-6" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold text-[var(--color-text-primary)]">Secret Vault</h2>
                        <p className="text-sm text-[var(--color-text-secondary)]">Secure storage for soft-deleted items.</p>
                    </div>
                </div>
                <button
                    onClick={() => {
                        setIsUnlocked(false);
                        setUnlockPin('');
                    }}
                    className="px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg hover:bg-[var(--color-surface-alt)]"
                >
                    Lock Vault
                </button>
            </div>

            <div className="bg-[var(--color-surface)] rounded-2xl shadow-sm border border-[var(--color-border)] overflow-hidden">
                <div className="p-6 border-b border-[var(--color-border)] flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">Deleted Records</h3>
                    <span className="px-3 py-1 bg-[var(--color-surface-alt)] text-[var(--color-text-secondary)] rounded-full text-xs font-medium">
                        {deletedItems.length} items
                    </span>
                </div>

                {deletedItems.length === 0 ? (
                    <div className="text-center py-16">
                        <FileText className="w-12 h-12 text-[var(--color-text-tertiary)] mx-auto mb-3" />
                        <p className="text-[var(--color-text-secondary)] text-sm">No deleted content in the vault.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-[var(--color-surface-alt)] border-b border-[var(--color-border)]">
                                <tr>
                                    <th className="text-left py-3 px-6 text-xs font-semibold text-[var(--color-text-secondary)] uppercase">Document Info</th>
                                    <th className="text-left py-3 px-6 text-xs font-semibold text-[var(--color-text-secondary)] uppercase">Topic / Platform</th>
                                    <th className="text-left py-3 px-6 text-xs font-semibold text-[var(--color-text-secondary)] uppercase">Traceability</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {deletedItems.map((item) => (
                                    <tr key={item.id} className="hover:bg-[var(--color-surface-alt)]">
                                        <td className="py-4 px-6">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 bg-[var(--color-danger-soft)] text-[var(--color-danger)] rounded-lg">
                                                    <Trash2 className="w-4 h-4" />
                                                </div>
                                                <div>
                                                    <p className="font-medium text-sm text-[var(--color-text-primary)] line-clamp-1">{item.title}</p>
                                                    <p className="text-xs text-[var(--color-text-secondary)]">ID: {item.id.slice(0, 8)}...</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="py-4 px-6">
                                            <p className="text-sm text-[var(--color-text-secondary)] capitalize">{item.content_topic}</p>
                                            <p className="text-xs text-[var(--color-text-secondary)] capitalize">{item.platform}</p>
                                        </td>
                                        <td className="py-4 px-6">
                                            <div className="flex items-start gap-2 text-sm">
                                                <Activity className="w-4 h-4 text-[var(--color-danger)] shrink-0 mt-0.5" />
                                                <div>
                                                    <p className="text-[var(--color-text-primary)]">Deleted by <span className="font-medium">{item.deleter_name}</span></p>
                                                    <p className="text-xs text-[var(--color-text-secondary)]">{new Date(item.deleted_at).toLocaleString()}</p>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
